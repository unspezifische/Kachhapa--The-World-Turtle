"""HTTP/transaction adapter for campaign session commands and the shared clock."""
import hashlib
import json
from copy import deepcopy
from urllib.parse import urlsplit
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from session_management import initial_state, apply_command, SessionError, running


def register_session_api(app, ns):
    def roster(campaign_id):
        # Legacy characters can be attached through campaign_members without a campaignID column value.
        ownership = {}
        if 'campaign_members' in ns:
            from sqlalchemy import select, or_
            table = ns['campaign_members']
            members = ns['db'].session.execute(select(table.c.characterID, table.c.userID).where(table.c.campaignID == campaign_id)).all()
            ownership = {row.characterID: row.userID for row in members if row.characterID is not None}
            chars = ns['Character'].query.filter(or_(ns['Character'].campaignID == campaign_id, ns['Character'].id.in_(ownership))).all()
        else:
            chars = ns['Character'].query.filter_by(campaignID=campaign_id).all()
        return [dict(id=c.id, name=c.character_name or f'Character {c.id}', user_id=ownership.get(c.id, c.userID)) for c in chars]

    def document(campaign_id):
        saved = ns['CampaignSessionState'].query.filter_by(campaign_id=campaign_id).first()
        chars = roster(campaign_id)
        if saved:
            return saved, deepcopy(saved.document), chars
        position = ns['PartyMapPosition'].query.filter_by(campaign_id=campaign_id).first()
        location = {'kind': 'coordinate', 'label': 'Last saved party position', **position.to_dict()} if position else None
        return None, initial_state(chars, location), chars

    def clock_seconds(calendar):
        if not calendar:
            return 0
        ordinal = ns['date_to_ordinal'](calendar, calendar.current_year, calendar.current_month_index, calendar.current_day)
        return int(((ordinal * calendar.get_hours_in_day() + calendar.current_hour) * calendar.get_minutes_in_hour() + calendar.current_minute) * 60 + (calendar.current_second or 0))

    def write_clock(calendar, seconds):
        minutes, second = divmod(int(seconds), 60)
        hours, minute = divmod(minutes, calendar.get_minutes_in_hour())
        ordinal, hour = divmod(hours, calendar.get_hours_in_day())
        year, month, day = ns['ordinal_to_date'](calendar, ordinal)
        calendar.current_year, calendar.current_month_index, calendar.current_day = year, month, day
        calendar.current_hour, calendar.current_minute, calendar.current_second = hour, minute, second

    def date_seconds(calendar, value):
        try:
            year, month, day = (int(value.get(k, getattr(calendar, a))) for k, a in (
                ('year', 'current_year'), ('month_index', 'current_month_index'), ('day', 'current_day')))
            hour, minute, second = (int(value.get(k, getattr(calendar, a) or 0)) for k, a in (
                ('hour', 'current_hour'), ('minute', 'current_minute'), ('second', 'current_second')))
            months = ns['get_months'](calendar)
            if year < (getattr(calendar, 'epoch_year', 1) or 1) or year > 99999 or month < 0 or month >= len(months) or not 1 <= day <= ns['days_in_month'](calendar, year, month):
                raise ValueError()
            if not 0 <= hour < calendar.get_hours_in_day() or not 0 <= minute < calendar.get_minutes_in_hour() or not 0 <= second < 60:
                raise ValueError()
            ordinal = ns['date_to_ordinal'](calendar, year, month, day)
            return ((ordinal * calendar.get_hours_in_day() + hour) * calendar.get_minutes_in_hour() + minute) * 60 + second
        except (TypeError, ValueError, OverflowError):
            raise SessionError('Enter a valid date and time for the campaign calendar.')

    def locations(campaign_id):
        result = []
        if 'MapPointOfInterest' not in ns:
            return result
        for point in ns['MapPointOfInterest'].query.filter_by(campaign_id=campaign_id).all():
            result.append(dict(key=f'poi:{point.id}', kind='poi', label=point.name, **point.to_dict()))
        for place in ns['WorldAtlasLocation'].query.filter_by(campaign_id=campaign_id).all():
            base = dict(settlement_id=place.id, map_key=place.map_key)
            for parcel in place.properties or []:
                result.append(dict(base, key=f'{place.id}:property:{parcel["id"]}', kind='property', property_id=parcel['id'], label=f'{place.name} / {parcel.get("name") or "Property"}'))
            links = {str(structure): parcel for parcel in place.properties or [] for structure in parcel.get('structure_ids', [])}
            for building in place.buildings or []:
                parcel = links.get(str(building['id']), {})
                building_name = f'{place.name} / {parcel.get("name") or "Property"} / {building.get("name") or "Structure"}'
                structure = dict(base, structure_id=building['id'], property_id=parcel.get('id'))
                result.append(dict(structure, key=f'{place.id}:structure:{building["id"]}', kind='structure', label=building_name, **{k: building[k] for k in ('x','y','elevation') if k in building}))
                for floor in building.get('levels') or []:
                    for room in floor.get('rooms') or []:
                        if isinstance(room, dict) and room.get('id') is not None:
                            result.append(dict(structure, key=f'{place.id}:room:{building["id"]}:{floor.get("id")}:{room["id"]}', kind='room', room_id=room['id'], floor_id=floor.get('id'), label=f'{building_name} / {room.get("name") or "Room"}'))
        return result

    def validate_location(value, campaign_id):
        if not isinstance(value, dict):
            raise SessionError('Choose a location.')
        if value.get('key'):
            canonical = next((loc for loc in locations(campaign_id) if loc['key'] == value['key']), None)
            if not canonical:
                raise SessionError('That mapped location is no longer available in this campaign.')
            return canonical
        from session_management import label
        return {'kind': 'manual', 'label': label(value.get('label'))}

    def snapshot(campaign_id):
        saved, doc, chars = document(campaign_id)
        cal = ns['Calendar'].query.filter_by(campaign_id=campaign_id).first()
        return dict(revision=saved.revision if saved else 0, document=doc, roster=chars,
                    calendar=cal.to_dict() if cal else None, now=clock_seconds(cal), locations=locations(campaign_id))

    def sync_legacy(campaign_id, doc):
        party = next((g for g in doc['groups'] if g['id'] == 'party'), None)
        if not party:
            return
        loc = party['location']
        if loc.get('x') is None or loc.get('y') is None:
            return
        pos = ns['PartyMapPosition'].query.filter_by(campaign_id=campaign_id).first()
        if not pos:
            pos = ns['PartyMapPosition'](campaign_id=campaign_id)
            ns['db'].session.add(pos)
        for f in ('map_key', 'x', 'y', 'elevation', 'water_access', 'road_access'):
            if f in loc:
                setattr(pos, f, loc[f])

    def changed(campaign_id, clock=False, location=False):
        # Invalidation only: no private prep, notes or rosters in player rooms.
        ns['socketio'].emit('session_state_updated', {'campaign_id': campaign_id}, to=f'campaign:{campaign_id}')
        if clock:
            ns['emit_calendar_updated'](campaign_id, {'kind': 'current_date'})
        if clock or location:
            ns['emit_settlement_simulation_updated'](campaign_id)

    def validate_references(action, data, campaign_id, user):
        if action == 'reference':
            ref = data.get('reference') or {}
            if ref.get('kind') == 'note':
                note = ns['QuickNote'].query.filter_by(id=ref.get('note_id'), campaign_id=campaign_id, user_id=user.id, character_id=None).first()
                if not note:
                    raise SessionError('That private campaign note is not available.')
                ref.clear()
                ref.update(kind='note', note_id=note.id, label=note.content[:80])
            elif ref.get('kind') == 'wiki':
                campaign = ns['Campaign'].query.get(campaign_id)
                from urllib.parse import unquote
                url = urlsplit(str(ref.get('url', '')))
                if url.scheme or url.netloc or not unquote(url.path).startswith(f'/wiki/{campaign.name}/') or '..' in unquote(url.path).split('/') or url.query or url.fragment:
                    raise SessionError('Choose a Wiki link within this campaign.')

    @app.route('/api/campaigns/<int:campaign_id>/sessions', methods=['GET'])
    @jwt_required()
    def session_snapshot(campaign_id):
        user, _, is_dm, _ = ns['dashboard_campaign_context'](campaign_id)
        if not user or not is_dm:
            return jsonify(message='Only the campaign DM can manage sessions.'), 403
        return jsonify(snapshot(campaign_id))

    @app.route('/api/campaigns/<int:campaign_id>/encounter-state', methods=['GET'])
    @jwt_required()
    def public_encounter_state(campaign_id):
        user, _, _, _ = ns['dashboard_campaign_context'](campaign_id)
        if not user:
            return jsonify(message='Campaign not found or access denied.'), 403
        _, doc, _ = document(campaign_id)
        encounter = running(doc)
        if not encounter:
            return jsonify(encounter=None)
        public = [dict(id=c['id'], characterName=c['name'], character_id=c.get('source_id') if c['kind'] == 'player' else None, initiative=c['initiative']) for c in encounter['combatants']]
        return jsonify(encounter={'combatants':public, 'turn':encounter['turn'], 'round':encounter['round'], 'started':encounter['started']})

    @app.route('/api/campaigns/<int:campaign_id>/sessions/commands', methods=['POST'])
    @jwt_required()
    def session_command(campaign_id):
        user, _, is_dm, _ = ns['dashboard_campaign_context'](campaign_id)
        if not user or not is_dm:
            return jsonify(message='Only the campaign DM can manage sessions.'), 403
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict) or not isinstance(payload.get('data', {}), dict):
            return jsonify(message='Send a session command object.'), 400
        key = payload.get('request_id')
        if not isinstance(key, str) or not 1 <= len(key) <= 64:
            return jsonify(message='A request identifier is required.'), 400
        fingerprint = hashlib.sha256(json.dumps({k: v for k, v in payload.items() if k != 'revision'}, sort_keys=True).encode()).hexdigest()
        db = ns['db']
        try:
            ns['Campaign'].query.filter_by(id=campaign_id).with_for_update().one()
            receipt = ns['SessionCommandReceipt'].query.filter_by(campaign_id=campaign_id, request_id=key).first()
            if receipt:
                if receipt.fingerprint != fingerprint:
                    raise SessionError('That request identifier was already used for another action.')
                return jsonify(**snapshot(campaign_id), replayed=True)
            saved, doc, chars = document(campaign_id)
            if payload.get('revision') != (saved.revision if saved else 0):
                db.session.rollback()
                return jsonify(message='The session changed in another tab. The latest state has been loaded.', **snapshot(campaign_id)), 409
            cal = ns['Calendar'].query.filter_by(campaign_id=campaign_id).with_for_update().first()
            now = clock_seconds(cal)
            action, data = payload.get('action'), payload.get('data') or {}
            validate_references(action, data, campaign_id, user)
            if action == 'group' and data.get('location'):
                data['location'] = validate_location(data['location'], campaign_id)
            if action == 'journey':
                data['destination'] = validate_location(data.get('destination'), campaign_id)
            if action == 'set_time':
                if not cal:
                    raise SessionError('Configure the campaign calendar first.')
                data['target'] = date_seconds(cal, data.get('date') or {})
            new_doc, new_now = apply_command(doc, action, data, now, chars, cal is not None)
            if not saved:
                saved = ns['CampaignSessionState'](campaign_id=campaign_id, revision=0)
                db.session.add(saved)
            saved.document, saved.revision = new_doc, saved.revision + 1
            if cal and new_now != now:
                write_clock(cal, new_now)
            sync_legacy(campaign_id, new_doc)
            db.session.add(ns['SessionCommandReceipt'](campaign_id=campaign_id, request_id=key, fingerprint=fingerprint, revision=saved.revision))
            db.session.commit()
            changed(campaign_id, clock=new_now != now, location=action in ('group', 'stop_journey'))
            # Existing initiative consumers receive only public combat state.
            if action in ('start_encounter', 'begin_encounter', 'next_turn', 'encounter_status', 'initiative', 'roll_npc_initiative'):
                encounter = running(new_doc)
                if action == 'start_encounter':
                    # Only explicitly selected players receive the roll prompt.
                    selected = {str(c['source_id']) for c in encounter['combatants'] if c['kind'] == 'player'}
                    for character in chars:
                        if str(character['id']) in selected and character.get('user_id'):
                            player = ns['User'].query.get(character['user_id'])
                            if player and player.sid:
                                ns['socketio'].emit('Roll for initiative!', to=player.sid)
                if encounter:
                    public = [dict(id=c['id'], characterName=c['name'], character_id=c.get('source_id') if c['kind'] == 'player' else None, initiative=c['initiative']) for c in encounter['combatants']]
                    ns['socketio'].emit('combatants', public, to=f'campaign:{campaign_id}')
                    if encounter['started'] and public:
                        ns['socketio'].emit('turn update', {'current': {'character': public[encounter['turn']], 'order': encounter['turn']+1},
                                                            'next': {'character': public[(encounter['turn']+1) % len(public)], 'order': (encounter['turn']+1) % len(public)+1}}, to=f'campaign:{campaign_id}')
                elif action == 'encounter_status':
                    ns['socketio'].emit('end of combat', to=f'campaign:{campaign_id}')
            return jsonify(snapshot(campaign_id))
        except (SessionError, TypeError, KeyError, ValueError, OverflowError) as error:
            db.session.rollback()
            return jsonify(message=str(error)), 400

    def shared_calendar_change(campaign_id, data, setting=False):
        """Called by legacy calendar endpoints. Same lock, event processing and revision."""
        db = ns['db']
        ns['Campaign'].query.filter_by(id=campaign_id).with_for_update().one()
        cal = ns['Calendar'].query.filter_by(campaign_id=campaign_id).with_for_update().first()
        if not cal:
            raise SessionError('Configure the campaign calendar first.')
        saved, doc, chars = document(campaign_id)
        now = clock_seconds(cal)
        target = date_seconds(cal, data) if setting else now + sum(int(data.get(k, 0)) * factor for k, factor in (
            ('days', cal.get_hours_in_day()*cal.get_minutes_in_hour()*60), ('hours', cal.get_minutes_in_hour()*60), ('minutes', 60), ('seconds', 1)))
        if target < 0:
            raise SessionError('The date cannot precede the campaign calendar epoch.')
        has_session = any(s['status'] in ('active', 'paused') for s in doc['sessions'])
        if has_session:
            new_doc, target = apply_command(doc, 'set_time', {'target': target}, now, chars, True)
            saved.document, saved.revision = new_doc, saved.revision+1
            sync_legacy(campaign_id, new_doc)
        elif saved:
            # No active session: don't skip unfinished journey/encounter state from a prior session.
            if any(j['status'] == 'travelling' for j in doc['journeys']) or running(doc) or any(e['status'] == 'scheduled' and e['stop'] for e in doc['events']) or doc['pending'] or doc['remainder']:
                raise SessionError('Resume the session before changing time with unfinished activities.')
            saved.revision += 1
        write_clock(cal, target)
        db.session.commit()
        changed(campaign_id, clock=True)
        return cal

    def legacy_position(campaign_id, data):
        import math
        db = ns['db']
        ns['Campaign'].query.filter_by(id=campaign_id).with_for_update().one()
        saved, doc, _ = document(campaign_id)
        if len([g for g in doc['groups'] if g['members']]) > 1:
            raise SessionError('The party is split. Choose a group in Session Management to change its location.')
        if any(j['status'] == 'travelling' for j in doc['journeys']):
            raise SessionError('Stop the active journey before relocating the party.')
        pos = ns['PartyMapPosition'].query.filter_by(campaign_id=campaign_id).first()
        if not pos:
            pos = ns['PartyMapPosition'](campaign_id=campaign_id)
            db.session.add(pos)
        for field in ('map_key', 'x', 'y', 'elevation', 'water_access', 'road_access'):
            if field in data:
                if field in ('x', 'y', 'elevation') and not math.isfinite(float(data[field])):
                    raise SessionError('Coordinates must be finite numbers.')
                setattr(pos, field, data[field])
        db.session.flush()
        if saved:
            target = next((g for g in doc['groups'] if g['members']), doc['groups'][0])
            target['location'] = {'kind': 'coordinate', 'label': 'Map position', **pos.to_dict()}
            saved.document, saved.revision = doc, saved.revision+1
        db.session.commit()
        changed(campaign_id, location=True)
        return pos

    def record_initiative(campaign_id, sid, data):
        # A player may submit only their own campaign character's roll.
        try:
            roll = int(data['roll'])
            campaign_id = int(campaign_id)
        except (ValueError, TypeError, KeyError):
            return
        db = ns['db']
        ns['Campaign'].query.filter_by(id=campaign_id).with_for_update().first()
        saved, doc, chars = document(campaign_id)
        encounter = running(doc)
        user = ns['User'].query.filter_by(sid=sid).first()
        if not saved or not encounter or encounter['started'] or not user:
            return
        candidates = [c for c in chars if c['user_id'] == user.id and (str(c['id']) == str(data['character_id']) if data.get('character_id') is not None else c['name'] == data.get('characterName'))]
        actor = next((c for c in encounter['combatants'] if c['kind'] == 'player' and any(str(c['source_id']) == str(ch['id']) for ch in candidates)), None)
        if actor and actor['initiative'] != roll:
            actor['initiative'] = roll
            saved.document, saved.revision = doc, saved.revision+1
            db.session.commit()
            changed(campaign_id)

    def travel_groups(campaign_id):
        saved, doc, _ = document(campaign_id)
        return doc['groups'] if saved else []

    ns['session_travel_groups'] = travel_groups
    ns['shared_session_legacy_position'] = legacy_position
    ns['record_session_initiative'] = record_initiative
    ns['shared_session_calendar_change'] = shared_calendar_change
    ns['session_clock_seconds'] = clock_seconds
    ns['session_date_seconds'] = date_seconds
