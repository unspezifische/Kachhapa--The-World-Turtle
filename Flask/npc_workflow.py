"""Campaign-authorized NPC editing and schedule authoring endpoints."""
from copy import deepcopy
import json
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import or_, cast, String, Float, func, case
from npc_generation import smart_fill_npc
from npc_schedules import compile_schedule, planned_schedule
from timeline_service import calendar_holidays, calendar_seasons

FIELDS = ('name', 'description', 'size', 'creature_type', 'creature_subtype', 'alignment', 'ac', 'hp', 'speed', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages', 'challenge', 'traits', 'actions')
BIRTH_FIELDS = ('birth_year', 'birth_season', 'birth_month_index', 'birth_day')
EDITABLE_FIELDS = FIELDS + BIRTH_FIELDS
ABILITIES = ('strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma')
COMBAT_COMPATIBILITY_FIELDS = ('size', 'creature_type', 'creature_subtype', 'alignment', 'ac', 'hp', 'speed',
    *ABILITIES, 'saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages', 'challenge', 'traits', 'actions')


def register_npc_workflow(app, db, models, context, ordinal, month_days=None, creature_allowed=None, normalize_date=None):
    NPC, Definition, Rule, History, Calendar, Location, Installation, Creature = models

    @app.before_request
    def limit_npc_authoring_requests():
        if request.path.startswith('/api/npcs') and request.method in ('POST', 'PATCH', 'PUT') and (request.content_length or 0) > 5 * 1024 * 1024:
            return jsonify({'message': 'NPC authoring requests must be under 5 MB; split imports into batches'}), 413

    def authorized():
        campaign, _, error = context(require_editor=True)
        return campaign, error

    def calendar_for(campaign):
        return Calendar.query.filter_by(campaign_id=campaign.id).first()

    def source_backfill(npc):
        if npc.module_key or npc.source == 'Homebrew':
            return
        from module_npcs import module_npc_presets
        from module_templates import module_definition
        matches = []
        for installed in Installation.query.filter_by(campaign_id=npc.campaign_id).all():
            definition = module_definition(installed.module_key)
            if definition and definition['name'] == npc.source:
                matches.extend((installed.module_key, preset) for preset in module_npc_presets(installed.module_key) if preset['name'].casefold() == npc.name.casefold())
        if len(matches) == 1 and NPC.query.filter_by(campaign_id=npc.campaign_id, source=npc.source, name=npc.name).count() == 1:
            module, preset = matches[0]
            npc.module_key, npc.source_key = module, preset['source_key']
            npc.origin_snapshot = {key: preset.get(key) for key in EDITABLE_FIELDS} | {'source': npc.source, 'profile_metadata': deepcopy(npc.profile_metadata or {}), 'schedule_definition_id': None}
            changes = {key: getattr(npc, key) for key in EDITABLE_FIELDS if getattr(npc, key) != preset.get(key)}
            if changes:
                npc.override_patch = changes
                npc.source = 'Homebrew'

    def backfill_origins():
        for npc in NPC.query.filter(NPC.module_key.is_(None), NPC.source != 'Homebrew').all():
            source_backfill(npc)
        db.session.commit()
    app.npc_backfill_origins = backfill_origins

    def locations(campaign):
        rows = []
        for place in Location.query.filter_by(campaign_id=campaign.id).all():
            buildings = {str(building['id']): building for building in place.buildings or []}
            parcels = list(place.properties or [])
            claimed = {str(value) for parcel in parcels for value in parcel.get('structure_ids', [])}
            parcels += [{'id': f'property-for-{key}', 'name': building.get('name') or 'Property', 'structure_ids': [building['id']]} for key, building in buildings.items() if key not in claimed]
            for parcel in parcels:
                common = {'settlement_id': place.id, 'property_id': parcel['id']}
                label = f"{place.name} / {parcel.get('name') or 'Property'}"
                rows.append({'id': f"p:{place.id}:{parcel['id']}", 'label': label, 'resolved': common})
                for building_id in parcel.get('structure_ids', []):
                    building = buildings.get(str(building_id))
                    if not building:
                        continue
                    base = common | {'structure_id': building['id']}
                    building_label = f"{label} / {building.get('name') or 'Building'}"
                    rows.append({'id': f"b:{place.id}:{building['id']}", 'label': building_label, 'resolved': base})
                    for level in building.get('levels', []):
                        rows.append({'id': f"f:{place.id}:{building['id']}:{level['id']}", 'label': f"{building_label} / {level.get('name') or level['id']}", 'resolved': base | {'floor_id': level['id']}})
                        for room in level.get('rooms', []):
                            if not isinstance(room, dict):
                                continue
                            rows.append({'id': f"r:{place.id}:{building['id']}:{level['id']}:{room['id']}", 'label': f"{building_label} / {level.get('name') or level['id']} / {room.get('name') or room['id']}", 'resolved': base | {'floor_id': level['id'], 'room_id': room['id']}, 'capabilities': room.get('activity_capabilities', [])})
                for area in parcel.get('outdoor_areas', []):
                    rows.append({'id': f"a:{place.id}:{area['id']}", 'label': f"{label} / {area.get('name') or area['id']}", 'resolved': common | {'outdoor_area_id': area['id']}, 'capabilities': area.get('activity_capabilities', [])})
        return rows

    def prepare_schedule(document, campaign):
        if document is None:
            return None
        calendar = calendar_for(campaign)
        hours, minutes = (calendar.get_hours_in_day(), calendar.get_minutes_in_hour()) if calendar else (24, 60)
        if not isinstance(document, dict) or document.get('schema_version') != 1 or not isinstance(document.get('bindings', {}), dict) or any(not isinstance(document.get(section, []), list) for section in ('rules', 'exceptions')):
            raise ValueError('Expected a version 1 schedule with bindings, rules and exceptions')
        document = deepcopy(document)
        for rule in document.get('rules', []) + document.get('exceptions', []):
            if not isinstance(rule, dict) or not isinstance(rule.get('id'), str) or not isinstance(rule.get('destination'), dict) or not isinstance(rule.get('repeat'), dict) or not isinstance(rule.get('start'), str) or not isinstance(rule.get('activity'), str) or not isinstance(rule.get('destination', {}).get('binding'), str):
                raise ValueError('Each activity needs an ID, destination and recurrence object')
        catalog = {json.dumps(row['resolved'], sort_keys=True): row for row in locations(campaign)}
        valid = set(catalog)
        for binding in document.get('bindings', {}).values():
            if isinstance(binding, dict) and binding.get('resolved') and json.dumps(binding['resolved'], sort_keys=True) not in valid:
                binding.pop('resolved')
        try:
            result, compiled, warnings = compile_schedule(document, hours, minutes)
            if calendar and month_days:
                months = calendar.get_format_data().get('months', [])
                for item in compiled:
                    date = item['repeat'].get('date') or item['repeat'].get('anchor_date')
                    if date and (date['month_index'] >= len(months) or date['day'] > month_days(calendar, date['year'], date['month_index']) or date['year'] < (calendar.epoch_year or 1)):
                        raise ValueError(f"{item['rule_id']}: date is outside the campaign calendar")
            for item in compiled:
                destination = item['rule']['destination']
                for choice in [destination, *destination.get('fallbacks', [])]:
                    binding = result['bindings'][choice['binding']]
                    row = catalog.get(json.dumps(binding.get('resolved'), sort_keys=True))
                    if row and 'capabilities' in row and choice['capability'] not in row['capabilities']:
                        warnings.append(f"{item['rule_id']}: mapped location does not support {choice['capability']}")
            if warnings:
                result['enabled'] = False
            return result, compiled, sorted(set(warnings))
        except ValueError as exc:
            if document.get('enabled'):
                raise
            return document, [], [f'Disabled draft: {exc}']

    def save_schedule(npc, prepared):
        metadata = dict(npc.profile_metadata or {})
        if prepared is None:
            metadata.pop('schedule_definition_id', None)
        else:
            document, compiled, warnings = prepared
            document['revision'] = npc.revision
            definition = Definition(npc_id=npc.id, revision=npc.revision, document=document, warnings=warnings)
            db.session.add(definition)
            db.session.flush()
            for item in compiled:
                db.session.add(Rule(definition_id=definition.id, rule_id=item['rule_id'], start_minute=item['start_minute'], duration_minutes=item['duration_minutes'], priority=item['priority'], data=item))
            metadata['schedule_definition_id'] = definition.id
        npc.profile_metadata = metadata

    def details(npc, campaign):
        payload = combat_compatible(npc)
        definition = db.session.get(Definition, (npc.profile_metadata or {}).get('schedule_definition_id')) if (npc.profile_metadata or {}).get('schedule_definition_id') else None
        payload['schedule'] = definition.document if definition else None
        payload['schedule_warnings'] = definition.warnings if definition else []
        payload['planned'] = planned_schedule([row.data for row in Rule.query.filter_by(definition_id=definition.id).all()], calendar_for(campaign), ordinal) if definition and definition.document.get('enabled') else {'current': None, 'next': None, 'reason': 'Schedule disabled / draft' if definition else 'No schedule'}
        if (npc.profile_metadata or {}).get('disabled'):
            payload['planned'] = {'current': None, 'next': None, 'reason': 'NPC disabled in this campaign'}
        calendar = calendar_for(campaign)
        payload['schedule_clock'] = {'hours_per_day': calendar.get_hours_in_day() if calendar else 24, 'minutes_per_hour': calendar.get_minutes_in_hour() if calendar else 60}
        payload['can_reset'] = bool(npc.origin_snapshot)
        payload['original_source'] = (npc.origin_snapshot or {}).get('source')
        return payload

    def combat_compatible(npc):
        """Keep legacy top-level fields while exposing and applying normalized combat data."""
        payload = npc.to_dict()
        resolver = getattr(app, 'resolve_npc_combat_profile', None)
        if not resolver:
            return payload
        combat = resolver(npc)
        payload['combat_profile'] = combat
        payload['combat_enabled'] = combat.get('authoring_mode') != 'none'
        resolved = combat.get('resolved')
        if isinstance(resolved, dict):
            for key in COMBAT_COMPATIBILITY_FIELDS:
                if key in resolved and resolved[key] is not None:
                    payload[key] = resolved[key]
        return payload

    def clean_fields(data, creating=False):
        for key in ('occupation', 'character_class', 'gender', 'ability_score_method'):
            if key in data and (not isinstance(data[key], str) or len(data[key]) > 80):
                raise ValueError(f'{key} must be text under 80 characters')
        if 'generation' in data and not isinstance(data['generation'], dict):
            raise ValueError('Generation metadata must be an object')
        if 'locked_fields' in data and (not isinstance(data['locked_fields'], list) or any(not isinstance(key, str) for key in data['locked_fields'])):
            raise ValueError('locked_fields must be a list of field names')
        values = {('creature_type' if key == 'creatureType' else 'creature_subtype' if key == 'creatureSubtype' else key): value for key, value in data.items()}
        result = {}
        for key in FIELDS:
            if key not in values and not creating:
                continue
            value = values.get(key, '')
            if key in ABILITIES or key == 'speed':
                if isinstance(value, bool):
                    raise ValueError(f'{key} must be a whole number')
                try:
                    integer = int(value)
                except (TypeError, ValueError):
                    raise ValueError(f'{key} must be a whole number')
                if str(integer) != str(value).strip() or integer < (1 if key in ABILITIES else 0) or (key in ABILITIES and integer > 30):
                    raise ValueError(f'{key} is outside its allowed range')
                value = integer
            elif not isinstance(value, str):
                raise ValueError(f'{key} must be text')
            if key in ('name', 'description', 'size', 'creature_type', 'alignment', 'ac', 'hp') and not str(value).strip():
                raise ValueError(f'{key} is required')
            if isinstance(value, str) and len(value) > (10000 if key == 'description' else 1000 if key in ('traits', 'actions') else {'name':80, 'size':20, 'creature_type':50, 'creature_subtype':50, 'alignment':50, 'ac':50, 'hp':50, 'saving_throws':120, 'skills':120, 'immunities':120, 'resistance':120, 'senses':120, 'languages':120, 'challenge':50}.get(key,120)):
                raise ValueError(f'{key} is too long')
            result[key] = value
        return result

    def clean_birth(data, campaign, creating=False):
        if not creating and not any(key in data for key in BIRTH_FIELDS):
            return {}
        raw = {
            'year': data.get('birth_year'),
            'season': data.get('birth_season'),
            'month_index': data.get('birth_month_index'),
            'day': data.get('birth_day'),
        }
        if all(value in (None, '') for value in raw.values()):
            return {key: None for key in BIRTH_FIELDS}
        calendar = calendar_for(campaign)
        if not calendar:
            raise ValueError('Set up the campaign calendar before adding an NPC birth date')
        if not normalize_date:
            raise ValueError('NPC birth dates are not available for this calendar')
        normalized = normalize_date(calendar, raw)
        return {
            'birth_year': normalized['year'], 'birth_season': normalized['season'],
            'birth_month_index': normalized['month_index'], 'birth_day': normalized['day'],
        }

    def update(npc, data, campaign):
        if data.get('expected_revision') != npc.revision:
            return jsonify({'message': 'This NPC changed since you opened it. Reload before saving.', 'revision': npc.revision}), 409
        source_backfill(npc)
        if npc.source != 'Homebrew' and not npc.origin_snapshot:
            npc.origin_snapshot = {key: getattr(npc, key) for key in FIELDS} | {'source': npc.source, 'profile_metadata': deepcopy(npc.profile_metadata or {}), 'schedule_definition_id': (npc.profile_metadata or {}).get('schedule_definition_id')}
        if 'disabled' in data and not isinstance(data['disabled'], bool):
            raise ValueError('disabled must be true or false')
        fields = clean_fields(data)
        birth = clean_birth(data, campaign)
        prepared = prepare_schedule(data['schedule'], campaign) if 'schedule' in data else None
        db.session.add(History(npc_id=npc.id, revision=npc.revision, snapshot=npc.to_dict()))
        npc.revision += 1
        for key, value in fields.items():
            setattr(npc, key, value)
        for key, value in birth.items():
            setattr(npc, key, value)
        metadata = dict(npc.profile_metadata or {})
        for key in ('occupation', 'character_class', 'gender', 'ability_score_method', 'generation', 'locked_fields', 'disabled'):
            if key in data:
                metadata[key] = data[key]
        npc.profile_metadata = metadata
        if 'schedule' in data:
            save_schedule(npc, prepared)
        if npc.origin_snapshot:
            npc.override_patch = {key: getattr(npc, key) for key in EDITABLE_FIELDS if getattr(npc, key) != npc.origin_snapshot.get(key)} | {'schedule_definition_id': (npc.profile_metadata or {}).get('schedule_definition_id')}
            npc.source = 'Homebrew'
        db.session.commit()
        return jsonify(details(npc, campaign)), 200

    @jwt_required()
    def create():
        campaign, error = authorized()
        if error:
            return error
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'message': 'Expected an NPC object'}), 400
        try:
            catalog_creature = None
            if data.get('catalog_creature_id') is not None:
                catalog_creature = db.session.get(Creature, data['catalog_creature_id'])
                if not catalog_creature:
                    raise ValueError('Selected creature no longer exists in the catalog')
                if creature_allowed and not creature_allowed(campaign, catalog_creature):
                    raise ValueError('Install the source adventure before using this creature')
                from fiveetools_catalog import npc_fields_from_creature
                base = npc_fields_from_creature(catalog_creature.data, data.get('name'))
                fields = clean_fields({**base, **{key: data[key] for key in FIELDS if key in data}}, True)
            else:
                fields = clean_fields(data, True)
            birth = clean_birth(data, campaign, True)
            prepared = prepare_schedule(data.get('schedule'), campaign)
            source = f'5etools {catalog_creature.source}: {catalog_creature.name}'[:80] if catalog_creature else 'Homebrew'
            npc = NPC(campaign_id=campaign.id, source=source, **fields, **birth)
            npc.profile_metadata = {key: data[key] for key in ('occupation', 'character_class', 'gender', 'ability_score_method', 'generation', 'locked_fields') if key in data}
            if catalog_creature:
                npc.source_key = f'creature:{catalog_creature.id}'
                npc.profile_metadata |= {'catalog_creature_id': catalog_creature.id, 'catalog_creature_name': catalog_creature.name}
                npc.origin_snapshot = {**fields, **birth, 'source': source, 'profile_metadata': deepcopy(npc.profile_metadata), 'schedule_definition_id': None}
            db.session.add(npc)
            db.session.flush()
            save_schedule(npc, prepared)
            db.session.commit()
            return jsonify(details(npc, campaign)), 201
        except (ValueError, TypeError, KeyError) as exc:
            db.session.rollback()
            return jsonify({'message': str(exc)}), 400

    @jwt_required()
    def listing():
        campaign, _, error = context()
        if error:
            return error
        query = NPC.query.filter_by(campaign_id=campaign.id)
        if request.args.get('include_disabled') != 'true':
            query = query.filter(or_(NPC.profile_metadata['disabled'].as_boolean().is_(None), NPC.profile_metadata['disabled'].as_boolean().is_(False)))
        if 'limit' not in request.args:
            return jsonify([combat_compatible(npc) for npc in query.all()]), 200
        try:
            limit = max(1, min(100, int(request.args.get('limit', 50))))
            page = max(0, int(request.args.get('cursor', 0)))
        except ValueError:
            return jsonify({'message': 'Invalid pagination'}), 400
        search = request.args.get('search', '').strip()
        if search:
            query = query.filter(or_(*[cast(getattr(NPC, key), String).ilike(f'%{search}%') for key in FIELDS + ('source',)], cast(NPC.profile_metadata, String).ilike(f'%{search}%')))
        sort = request.args.get('sort', 'name')
        if sort not in FIELDS + ('source',):
            sort = 'name'
        expression = getattr(NPC, sort)
        if sort == 'challenge':
            # PostgreSQL-safe fractions and numeric CR strings; invalid legacy values sort as zero.
            expression = cast(func.coalesce(func.substring(NPC.challenge, r'^([0-9]+)'), '0'), Float) / case((NPC.challenge.like('%/%'), cast(func.coalesce(func.substring(NPC.challenge, r'/([1-9][0-9]*)'), '1'), Float)), else_=1) if db.engine.dialect.name == 'postgresql' else NPC.challenge
        descending = request.args.get('direction') == 'desc'
        query = query.order_by(expression.desc() if descending else expression.asc(), NPC.id)
        rows = query.offset(page).limit(limit + 1).all()
        return jsonify({'items': [combat_compatible(npc) for npc in rows[:limit]], 'next_cursor': str(page + limit) if len(rows) > limit else None}), 200

    app.view_functions['create_npc'] = create
    app.view_functions['get_npcs'] = listing

    @app.route('/api/npcs/<int:npc_id>', methods=['GET', 'PATCH'])
    @jwt_required()
    def npc_detail(npc_id):
        campaign, error = authorized()
        if error:
            return error
        query = NPC.query.filter_by(id=npc_id, campaign_id=campaign.id)
        npc = (query.with_for_update() if request.method == 'PATCH' else query).first()
        if not npc:
            return jsonify({'message': 'NPC not found'}), 404
        if request.method == 'GET':
            return jsonify(details(npc, campaign)), 200
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'message': 'Expected an NPC object'}), 400
        try:
            return update(npc, data, campaign)
        except (ValueError, TypeError, KeyError) as exc:
            db.session.rollback()
            return jsonify({'message': str(exc)}), 400

    @app.route('/api/npcs/smart-fill', methods=['POST'])
    @jwt_required()
    def smart_fill():
        _, error = authorized()
        if error:
            return error
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict) or not isinstance(data.get('values', {}), dict) or not isinstance(data.get('locked_fields', []), list):
            return jsonify({'message': 'Expected values and locked_fields'}), 400
        try:
            return jsonify(smart_fill_npc(data.get('values'), data.get('locked_fields'), data.get('target'), data.get('seed'))), 200
        except (ValueError, TypeError, KeyError) as exc:
            return jsonify({'message': str(exc)}), 400

    @app.route('/api/npcs/schedule-locations', methods=['GET'])
    @jwt_required()
    def schedule_locations():
        campaign, error = authorized()
        if error:
            return error
        calendar = calendar_for(campaign)
        rows = locations(campaign)
        format_data = calendar.get_format_data() if calendar and hasattr(calendar, 'get_format_data') else {}
        return jsonify({
            'locations': rows,
            'hours_per_day': calendar.get_hours_in_day() if calendar else 24,
            'minutes_per_hour': calendar.get_minutes_in_hour() if calendar else 60,
            'months': format_data.get('months', []), 'seasons': calendar_seasons(calendar) if calendar else [],
            'holidays': calendar_holidays(calendar) if calendar else [],
        }), 200

    @app.route('/api/npcs/<int:npc_id>/schedule', methods=['GET'])
    @jwt_required()
    def schedule_export(npc_id):
        campaign, error = authorized()
        if error:
            return error
        npc = NPC.query.filter_by(id=npc_id, campaign_id=campaign.id).first()
        if not npc:
            return jsonify({'message': 'NPC not found'}), 404
        return jsonify(details(npc, campaign)), 200

    @app.route('/api/npcs/<int:npc_id>/reset-override', methods=['POST'])
    @jwt_required()
    def reset_override(npc_id):
        campaign, error = authorized()
        if error:
            return error
        npc = NPC.query.filter_by(id=npc_id, campaign_id=campaign.id).with_for_update().first()
        if not npc or not npc.origin_snapshot:
            return jsonify({'message': 'No linked module original is available'}), 404
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict) or data.get('expected_revision') != npc.revision:
            return jsonify({'message': 'Reload the NPC before resetting'}), 409
        db.session.add(History(npc_id=npc.id, revision=npc.revision, snapshot=npc.to_dict()))
        for key in EDITABLE_FIELDS:
            setattr(npc, key, npc.origin_snapshot.get(key))
        npc.source = npc.origin_snapshot['source']
        npc.override_patch = None
        npc.revision += 1
        metadata = dict(npc.origin_snapshot.get('profile_metadata') or {})
        metadata['schedule_definition_id'] = npc.origin_snapshot.get('schedule_definition_id')
        if (npc.profile_metadata or {}).get('disabled'):
            metadata['disabled'] = True
        npc.profile_metadata = metadata
        db.session.commit()
        return jsonify(details(npc, campaign)), 200

    @app.route('/api/npcs/schedules/import', methods=['POST'])
    @jwt_required()
    def import_schedules():
        campaign, error = authorized()
        if error:
            return error
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify({'message': 'Expected an import object'}), 400
        records = data.get('records', [])
        if not isinstance(records, list) or not 1 <= len(records) <= 50:
            return jsonify({'message': 'Import 1–50 schedules per batch'}), 400
        results = []
        for record in records:
            try:
                if not isinstance(record, dict):
                    raise ValueError('Each import record must be an object')
                document = record.get('schedule', record)
                if not isinstance(document, dict):
                    raise ValueError('Schedule must be an object')
                npc_id = record.get('npc_id')
                if npc_id:
                    npc = NPC.query.filter_by(id=npc_id, campaign_id=campaign.id).with_for_update().first()
                else:
                    matches = NPC.query.filter_by(campaign_id=campaign.id, module_key=document.get('module_key'), source_key=document.get('npc_key')).with_for_update().limit(2).all() if document.get('module_key') and document.get('npc_key') else []
                    if len(matches) > 1:
                        raise ValueError('Multiple NPCs share this module key; select one explicitly')
                    npc = matches[0] if matches else None
                if not npc:
                    raise ValueError('Map this schedule to a campaign NPC; its module identity is unresolved')
                prepared = prepare_schedule(document, campaign)
                if data.get('apply') is True:
                    if record.get('expected_revision') != npc.revision:
                        raise ValueError('NPC revision changed; preview again')
                    source_backfill(npc)
                    db.session.add(History(npc_id=npc.id, revision=npc.revision, snapshot=npc.to_dict()))
                    npc.revision += 1
                    save_schedule(npc, prepared)
                    if npc.origin_snapshot:
                        npc.override_patch = dict(npc.override_patch or {}) | {'schedule_definition_id': npc.profile_metadata['schedule_definition_id']}
                        npc.source = 'Homebrew'
                    db.session.commit()
                results.append({'npc_id': npc.id, 'name': npc.name, 'expected_revision': npc.revision, 'status': 'applied' if data.get('apply') is True else 'valid', 'warnings': prepared[2]})
            except (ValueError, TypeError, KeyError) as exc:
                db.session.rollback()
                results.append({'status': 'rejected', 'message': str(exc)})
        return jsonify({'results': results}), 200
