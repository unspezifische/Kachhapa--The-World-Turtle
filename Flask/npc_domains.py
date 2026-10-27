"""Normalized NPC life domains and combat-profile adapters.

NPC remains the identity and legacy stat-block compatibility surface. These
services add orthogonal occupations, roles, social positions, and combat
authoring sources without inferring PC progression from labels or CR.
"""
from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime, timezone

from flask import jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError


LEGACY_COMBAT_FIELDS = (
    'size', 'creature_type', 'creature_subtype', 'alignment', 'ac', 'hp', 'speed',
    'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
    'saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages',
    'challenge', 'traits', 'actions',
)
COMBAT_MODES = {'template', 'class', 'custom', 'none'}
SPELLCASTING_ABILITIES = {'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'}
OCCUPATION_STATUSES = {'current', 'former', 'inactive'}
ROLE_STATUSES = {'active', 'former', 'inactive'}


def occupation_key(value):
    return re.sub(r'[^a-z0-9]+', '_', str(value or '').strip().casefold()).strip('_')


def legacy_combat_definition(npc):
    return {key: getattr(npc, key) for key in LEGACY_COMBAT_FIELDS}


def resolve_combat_profile(npc, profile, creature=None, character=None, progressions=()):
    """Resolve one profile while retaining source and explicit override provenance."""
    if profile is None:
        return {
            'configured': False,
            'authoring_mode': 'legacy',
            'source': {'kind': 'legacy_npc_fields'},
            'resolved': legacy_combat_definition(npc),
            'provenance': {'compatibility': True, 'inferred': False},
        }
    result = {
        'configured': True,
        'profile_id': profile.id,
        'authoring_mode': profile.authoring_mode,
        'ruleset_id': profile.ruleset_id,
        'ruleset_version': profile.ruleset_version,
        'source': None,
        'resolved': None,
        'overrides': deepcopy(profile.overrides or {}),
        'spellcasting': deepcopy(profile.spellcasting or {}),
        'provenance': deepcopy(profile.provenance or {}),
    }
    if profile.authoring_mode == 'none':
        result['source'] = {'kind': 'none'}
        return result
    if profile.authoring_mode == 'template':
        base = {}
        if creature is not None:
            from fiveetools_catalog import npc_fields_from_creature
            base = npc_fields_from_creature(creature.data, npc.name)
            result['source'] = {'kind': 'creature_template', 'id': creature.id, 'name': creature.name, 'source': creature.source}
        else:
            result['source'] = {'kind': 'missing_creature_template', 'id': profile.template_creature_id}
        result['resolved'] = {**base, **(profile.overrides or {})}
        return result
    if profile.authoring_mode == 'class':
        classes = [item.to_dict() for item in sorted(progressions, key=lambda row: (row.display_order, row.id or 0))]
        character_data = character.to_dict() if character is not None else None
        result['source'] = {'kind': 'character_progression', 'character_id': profile.character_id, 'classes': classes}
        result['resolved'] = {
            'character': character_data,
            'classes': classes,
            'character_level': sum(item['level'] for item in classes),
            **(profile.overrides or {}),
        }
        return result
    result['source'] = {'kind': 'custom_definition'}
    result['resolved'] = {**(profile.custom_definition or {}), **(profile.overrides or {})}
    return result


def register_npc_domains(app, db, ns):
    NPC = ns['NPC']
    Occupation = ns['OccupationDefinition']
    Association = ns['NpcOccupationAssociation']
    Role = ns['NpcRoleAssignment']
    Social = ns['NpcSocialPosition']
    Combat = ns['NpcCombatProfile']
    Progression = ns['NpcClassProgression']
    Creature = ns['CreatureCatalog']
    Character = ns['Character']
    Element = ns['GameElement']
    Business = ns['SettlementBusiness']
    NobleFamily = ns['NobleFamily']
    Location = ns['WorldAtlasLocation']
    History = ns['NpcProfileHistory']
    ScheduleDefinition = ns['NpcScheduleDefinition']
    context = ns['catalog_campaign_context']

    def authorized():
        campaign, _, error = context(require_editor=True)
        return campaign, error

    def npc_for(campaign, npc_id, lock=False):
        query = NPC.query.filter_by(id=npc_id, campaign_id=campaign.id)
        return (query.with_for_update() if lock else query).first()

    def association_payload(row):
        definition = db.session.get(Occupation, row.occupation_id)
        return {**row.to_dict(), 'occupation': definition.to_dict() if definition else None}

    def combat_payload(npc, row):
        progressions = Progression.query.filter_by(combat_profile_id=row.id).order_by(Progression.display_order, Progression.id).all()
        creature = db.session.get(Creature, row.template_creature_id) if row.template_creature_id else None
        character = db.session.get(Character, row.character_id) if row.character_id else None
        return {**row.to_dict(), 'class_progression': [item.to_dict() for item in progressions],
                'resolved': resolve_combat_profile(npc, row, creature, character, progressions)}

    def resolved_combat(npc):
        active = Combat.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id, is_active=True).first()
        if not active:
            return resolve_combat_profile(npc, None)
        progressions = Progression.query.filter_by(combat_profile_id=active.id).order_by(Progression.display_order, Progression.id).all()
        creature = db.session.get(Creature, active.template_creature_id) if active.template_creature_id else None
        character = db.session.get(Character, active.character_id) if active.character_id else None
        return resolve_combat_profile(npc, active, creature, character, progressions)

    def domain_payload(npc):
        occupations = Association.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).order_by(
            Association.is_primary.desc(), Association.id).all()
        roles = Role.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).order_by(
            Role.priority.desc(), Role.id).all()
        social = Social.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).order_by(
            Social.is_primary.desc(), Social.id).all()
        profiles = Combat.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).order_by(
            Combat.is_active.desc(), Combat.id).all()
        active = next((profile for profile in profiles if profile.is_active), None)
        association_occupations = {row.id: row.occupation_id for row in occupations}
        return {
            'npc_id': npc.id, 'revision': npc.revision,
            'occupations': [association_payload(row) for row in occupations],
            'roles': [{**row.to_dict(), 'occupation_id': association_occupations.get(row.occupation_association_id)} for row in roles],
            'social_positions': [row.to_dict() for row in social],
            'combat_profiles': [combat_payload(npc, row) for row in profiles],
            'resolved_combat_profile': combat_payload(npc, active)['resolved'] if active else resolve_combat_profile(npc, None),
        }

    def require_object(value, label):
        if value is not None and not isinstance(value, dict):
            raise ValueError(f'{label} must be an object')
        return value or {}

    def require_list(value, label):
        if not isinstance(value, list):
            raise ValueError(f'{label} must be a list')
        if len(value) > 100:
            raise ValueError(f'{label} is too large')
        return value

    def validate_campaign_reference(model, record_id, campaign_id, label):
        if record_id in (None, ''):
            return None
        record = db.session.get(model, int(record_id))
        if not record or getattr(record, 'campaign_id', None) != campaign_id:
            raise ValueError(f'{label} is not available in this campaign')
        return record

    def replace_occupations(npc, rows):
        rows = require_list(rows, 'occupations')
        primary = [item for item in rows if item.get('status', 'current') == 'current' and item.get('is_primary') is True]
        if len(primary) > 1:
            raise ValueError('Only one current occupation can be primary')
        Association.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).delete(synchronize_session=False)
        created = []
        for item in rows:
            if not isinstance(item, dict):
                raise ValueError('Each occupation association must be an object')
            definition = db.session.get(Occupation, item.get('occupation_id'))
            if not definition or definition.campaign_id != npc.campaign_id or not definition.active:
                raise ValueError('Occupation is not available in this campaign')
            status = item.get('status', 'current')
            if status not in OCCUPATION_STATUSES:
                raise ValueError('Invalid occupation status')
            created.append(Association(
                campaign_id=npc.campaign_id, npc_id=npc.id, occupation_id=definition.id,
                status=status, is_primary=item.get('is_primary') is True,
                started_at_world_date=require_object(item.get('started_at_world_date'), 'started_at_world_date') or None,
                ended_at_world_date=require_object(item.get('ended_at_world_date'), 'ended_at_world_date') or None,
                notes=str(item.get('notes') or '')[:4000], provenance=require_object(item.get('provenance'), 'provenance'),
            ))
        db.session.add_all(created)
        db.session.flush()
        return created

    def replace_roles(npc, rows, occupations):
        rows = require_list(rows, 'roles')
        Role.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).delete(synchronize_session=False)
        association_by_occupation = {row.occupation_id: row for row in occupations}
        created = []
        for item in rows:
            if not isinstance(item, dict) or not str(item.get('position_title') or '').strip():
                raise ValueError('Each role needs a position_title')
            status = item.get('status', 'active')
            if status not in ROLE_STATUSES:
                raise ValueError('Invalid role status')
            occupation = association_by_occupation.get(item.get('occupation_id'))
            validate_campaign_reference(Business, item.get('employer_business_id'), npc.campaign_id, 'Employer business')
            validate_campaign_reference(NobleFamily, item.get('noble_family_id'), npc.campaign_id, 'Noble family')
            validate_campaign_reference(Location, item.get('workplace_location_id'), npc.campaign_id, 'Workplace')
            organization_id = item.get('organization_element_id')
            if organization_id and not db.session.get(Element, int(organization_id)):
                raise ValueError('Organization is not available')
            priority = int(item.get('priority', 0))
            if priority < 0:
                raise ValueError('Role priority cannot be negative')
            created.append(Role(
                campaign_id=npc.campaign_id, npc_id=npc.id,
                occupation_association_id=occupation.id if occupation else None,
                position_title=str(item['position_title']).strip()[:160],
                organization_name=str(item.get('organization_name') or '').strip()[:200] or None,
                organization_element_id=int(organization_id) if organization_id else None,
                employer_business_id=item.get('employer_business_id'), noble_family_id=item.get('noble_family_id'),
                workplace_location_id=item.get('workplace_location_id'), workplace=require_object(item.get('workplace'), 'workplace'),
                responsibilities=require_list(item.get('responsibilities', []), 'responsibilities'),
                schedule_override=require_object(item.get('schedule_override'), 'schedule_override') or None,
                status=status, is_primary=item.get('is_primary') is True, priority=priority,
                compensation_cp=int(item['compensation_cp']) if item.get('compensation_cp') not in (None, '') else None,
                compensation_period=str(item.get('compensation_period') or '')[:40] or None,
                started_at_world_date=require_object(item.get('started_at_world_date'), 'started_at_world_date') or None,
                ended_at_world_date=require_object(item.get('ended_at_world_date'), 'ended_at_world_date') or None,
                provenance=require_object(item.get('provenance'), 'provenance'),
            ))
        db.session.add_all(created)
        return created

    def replace_social_positions(npc, rows):
        rows = require_list(rows, 'social_positions')
        Social.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).delete(synchronize_session=False)
        created = []
        for item in rows:
            if not isinstance(item, dict) or not str(item.get('name') or '').strip():
                raise ValueError('Each social position needs a name')
            status = item.get('status', 'active')
            if status not in ROLE_STATUSES:
                raise ValueError('Invalid social-position status')
            organization_id = item.get('organization_element_id')
            if organization_id and not db.session.get(Element, int(organization_id)):
                raise ValueError('Organization is not available')
            created.append(Social(
                campaign_id=npc.campaign_id, npc_id=npc.id, name=str(item['name']).strip()[:160],
                category=str(item.get('category') or '')[:80] or None,
                organization_name=str(item.get('organization_name') or '')[:200] or None,
                organization_element_id=int(organization_id) if organization_id else None,
                status=status, is_primary=item.get('is_primary') is True,
                started_at_world_date=require_object(item.get('started_at_world_date'), 'started_at_world_date') or None,
                ended_at_world_date=require_object(item.get('ended_at_world_date'), 'ended_at_world_date') or None,
                notes=str(item.get('notes') or '')[:4000], provenance=require_object(item.get('provenance'), 'provenance'),
            ))
        db.session.add_all(created)
        return created

    def save_combat_profile(campaign, npc, item, confirm_change=False):
        if not isinstance(item, dict):
            raise ValueError('combat_profile must be an object')
        mode = item.get('authoring_mode')
        if mode not in COMBAT_MODES:
            raise ValueError('Choose template, class, custom, or none for the combat profile')
        active = Combat.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id, is_active=True).first()
        profile_id = item.get('id')
        profile = db.session.get(Combat, profile_id) if profile_id else None
        if profile and (profile.npc_id != npc.id or profile.campaign_id != npc.campaign_id):
            raise ValueError('Combat profile is not attached to this NPC')
        if active and active.authoring_mode != mode and not confirm_change:
            raise ValueError('Confirm the combat mode change; the current profile will be retained as an alternate')
        if active and active.authoring_mode != mode and confirm_change:
            # A mode change is a new source of truth, not an in-place rewrite of
            # the old profile. Keep the previous source available as an alternate.
            active.is_active = False
            if profile is active:
                profile = None
        template_id = item.get('template_creature_id')
        template = db.session.get(Creature, template_id) if template_id else None
        if mode == 'template' and not template:
            raise ValueError('Template combat profiles require a creature template')
        character_id = item.get('character_id')
        character = db.session.get(Character, character_id) if character_id else None
        if character and character.campaignID != campaign.id:
            raise ValueError('Linked character is not in this campaign')
        if mode == 'class' and not character and not item.get('class_progression'):
            raise ValueError('Class combat profiles require a linked character or class progression')
        if profile is None:
            profile = Combat(campaign_id=npc.campaign_id, npc_id=npc.id)
            db.session.add(profile)
        if active and active is not profile:
            active.is_active = False
        profile.name = str(item.get('name') or 'Primary')[:160]
        profile.authoring_mode = mode
        profile.ruleset_id = str(item.get('ruleset_id') or campaign.system or '')[:80] or None
        profile.ruleset_version = str(item.get('ruleset_version') or campaign.ruleset or '')[:40] or None
        profile.template_creature_id = template.id if template else None
        profile.character_id = character.id if character else None
        spellcasting = require_object(item.get('spellcasting'), 'spellcasting')
        if spellcasting.get('ability') not in (None, '', *SPELLCASTING_ABILITIES):
            raise ValueError('Spellcasting ability is invalid')
        if spellcasting.get('caster_level') not in (None, ''):
            caster_level = int(spellcasting['caster_level'])
            if not 1 <= caster_level <= 30:
                raise ValueError('Caster level must be from 1 to 30')
            spellcasting['caster_level'] = caster_level
        profile.custom_definition = require_object(item.get('custom_definition'), 'custom_definition')
        profile.overrides = require_object(item.get('overrides'), 'overrides')
        profile.spellcasting = spellcasting
        profile.provenance = require_object(item.get('provenance'), 'provenance')
        profile.is_active = item.get('is_active', True) is not False
        profile.updated_at = datetime.now(timezone.utc)
        db.session.flush()
        if 'class_progression' in item:
            Progression.query.filter_by(combat_profile_id=profile.id).delete(synchronize_session=False)
            seen = set()
            for index, entry in enumerate(require_list(item['class_progression'], 'class_progression')):
                name = str(entry.get('class_name') or '').strip()
                level = int(entry.get('level', 0))
                if not name or name.casefold() in seen or not 1 <= level <= 20:
                    raise ValueError('Class entries need unique names and levels from 1 to 20')
                seen.add(name.casefold())
                class_element = db.session.get(Element, entry.get('class_element_id')) if entry.get('class_element_id') else None
                if class_element and (class_element.element_type != 'class' or class_element.system != campaign.rules_system):
                    raise ValueError('Class is not available for this campaign ruleset')
                subclass_element = db.session.get(Element, entry.get('subclass_element_id')) if entry.get('subclass_element_id') else None
                if subclass_element and (subclass_element.element_type != 'subclass' or subclass_element.system != campaign.rules_system):
                    raise ValueError('Subclass is not available for this campaign ruleset')
                db.session.add(Progression(
                    combat_profile_id=profile.id, class_element_id=class_element.id if class_element else None,
                    subclass_element_id=subclass_element.id if subclass_element else None, class_name=name[:100],
                    subclass_name=str(entry.get('subclass_name') or '')[:120] or None, level=level,
                    choices=require_object(entry.get('choices'), 'class choices'),
                    source_ruleset=str(entry.get('source_ruleset') or campaign.rules_system or '')[:80] or None,
                    display_order=int(entry.get('display_order', index)),
                ))
            if sum(int(entry.get('level', 0)) for entry in item['class_progression']) > 20:
                raise ValueError('Combined character class level cannot exceed 20')
        return profile

    @app.route('/api/npcs/occupation-definitions', methods=['GET', 'POST'])
    @jwt_required()
    def npc_occupation_definitions():
        campaign, error = authorized()
        if error:
            return error
        if request.method == 'GET':
            rows = Occupation.query.filter_by(campaign_id=campaign.id, active=True).order_by(Occupation.name, Occupation.id).all()
            return jsonify([row.to_dict() for row in rows]), 200
        data = request.get_json(silent=True) or {}
        try:
            name = str(data.get('name') or '').strip()
            key = occupation_key(data.get('key') or name)
            if not name or not key:
                raise ValueError('Occupation name is required')
            row = Occupation(
                campaign_id=campaign.id, occupation_key=key[:80], name=name[:120],
                description=str(data.get('description') or '') or None, category=str(data.get('category') or '')[:80] or None,
                ability_weights=require_object(data.get('ability_weights'), 'ability_weights'),
                target_workers=max(0, int(data.get('target_workers', 0))),
                minimum_suitability=float(data.get('minimum_suitability', .42)),
                base_wage_cp=max(0, int(data.get('base_wage_cp', 20))),
                produces_commodity_key=str(data.get('produces_commodity_key') or '')[:80] or None,
                schedule_archetype=require_object(data.get('schedule_archetype'), 'schedule_archetype'),
                activity_weights=require_object(data.get('activity_weights'), 'activity_weights'),
                is_custom=True, active=True,
            )
            db.session.add(row); db.session.commit()
            return jsonify(row.to_dict()), 201
        except (ValueError, TypeError, IntegrityError) as exc:
            db.session.rollback()
            return jsonify(message='Occupation key already exists' if isinstance(exc, IntegrityError) else str(exc)), 409 if isinstance(exc, IntegrityError) else 400

    @app.route('/api/npcs/occupation-definitions/<int:definition_id>', methods=['PATCH'])
    @jwt_required()
    def update_npc_occupation_definition(definition_id):
        campaign, error = authorized()
        if error:
            return error
        row = Occupation.query.filter_by(id=definition_id, campaign_id=campaign.id).first()
        if not row:
            return jsonify(message='Occupation definition not found'), 404
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(message='Expected an occupation definition object'), 400
        try:
            if 'name' in data:
                name = str(data['name'] or '').strip()
                if not name:
                    raise ValueError('Occupation name is required')
                row.name = name[:120]
            if 'key' in data:
                key = occupation_key(data['key'])
                if not key:
                    raise ValueError('Occupation key is required')
                row.occupation_key = key[:80]
            for key, limit in (('description', None), ('category', 80), ('produces_commodity_key', 80)):
                if key in data:
                    value = str(data[key] or '').strip()
                    setattr(row, key, value[:limit] if value and limit else value or None)
            for key in ('ability_weights', 'schedule_archetype', 'activity_weights'):
                if key in data:
                    setattr(row, key, require_object(data[key], key))
            if 'target_workers' in data:
                row.target_workers = max(0, int(data['target_workers']))
            if 'minimum_suitability' in data:
                row.minimum_suitability = float(data['minimum_suitability'])
            if 'base_wage_cp' in data:
                row.base_wage_cp = max(0, int(data['base_wage_cp']))
            if 'active' in data:
                if not isinstance(data['active'], bool):
                    raise ValueError('active must be true or false')
                row.active = data['active']
            db.session.commit()
            return jsonify(row.to_dict()), 200
        except (ValueError, TypeError, IntegrityError) as exc:
            db.session.rollback()
            return jsonify(message='Occupation key already exists' if isinstance(exc, IntegrityError) else str(exc)), 409 if isinstance(exc, IntegrityError) else 400

    @app.route('/api/npcs/<int:npc_id>/domains', methods=['GET', 'PUT'])
    @jwt_required()
    def npc_domains(npc_id):
        campaign, error = authorized()
        if error:
            return error
        npc = npc_for(campaign, npc_id, request.method == 'PUT')
        if not npc:
            return jsonify(message='NPC not found'), 404
        if request.method == 'GET':
            return jsonify(domain_payload(npc)), 200
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(message='Expected an NPC domain object'), 400
        if data.get('expected_revision') != npc.revision:
            return jsonify(message='This NPC changed since you opened it. Reload before saving.', revision=npc.revision), 409
        try:
            db.session.add(History(npc_id=npc.id, revision=npc.revision, snapshot=npc.to_dict()))
            occupations = Association.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).all()
            if 'occupations' in data:
                occupations = replace_occupations(npc, data['occupations'])
            if 'roles' in data:
                replace_roles(npc, data['roles'], occupations)
            if 'social_positions' in data:
                replace_social_positions(npc, data['social_positions'])
            if 'combat_profile' in data:
                save_combat_profile(campaign, npc, data['combat_profile'], data.get('confirm_combat_mode_change') is True)
            npc.revision += 1
            db.session.commit()
            return jsonify(domain_payload(npc)), 200
        except (ValueError, TypeError, KeyError, IntegrityError) as exc:
            db.session.rollback()
            return jsonify(message=str(exc.orig) if isinstance(exc, IntegrityError) else str(exc)), 400

    @app.route('/api/npcs/<int:npc_id>/schedule-suggestion', methods=['POST'])
    @jwt_required()
    def npc_schedule_suggestion(npc_id):
        campaign, error = authorized()
        if error:
            return error
        npc = npc_for(campaign, npc_id)
        if not npc:
            return jsonify(message='NPC not found'), 404
        associations = Association.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).all()
        occupation_pairs = [(row, db.session.get(Occupation, row.occupation_id)) for row in associations]
        roles = Role.query.filter_by(npc_id=npc.id, campaign_id=npc.campaign_id).all()
        definition_id = (npc.profile_metadata or {}).get('schedule_definition_id')
        existing = db.session.get(ScheduleDefinition, definition_id) if definition_id else None
        from npc_schedules import schedule_from_domains
        suggestion = schedule_from_domains(npc.id, occupation_pairs, roles, existing.document if existing else None)
        return jsonify({'schedule': suggestion, 'generated_from_domains': suggestion['generated_from_domains']}), 200

    app.npc_domain_payload = domain_payload
    app.resolve_npc_combat_profile = resolved_combat
