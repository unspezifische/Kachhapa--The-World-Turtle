"""Persistent DM session commands. Reducer is independent of Flask and SQLAlchemy."""
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4


class SessionError(ValueError):
    pass


def uid():
    return str(uuid4())


def initial_state(roster=None, location=None):
    return dict(sessions=[], groups=[dict(id='party', name='Party', members=[str(c['id']) for c in (roster or [])],
                                        location=location or {'label': 'Not set'})],
                templates=[], encounters=[], journeys=[], events=[], activity=[], pending=[], remainder=0)


def find(items, key):
    item = next((v for v in items if v['id'] == key), None)
    if item is None:
        raise SessionError('That record is no longer available. Refresh and try again.')
    return item


def number(value, minimum=0):
    try:
        result = int(value)
        if isinstance(value, bool) or result != float(value) or result < minimum:
            raise ValueError()
        return result
    except (TypeError, ValueError, OverflowError):
        raise SessionError(f'Enter a whole number of at least {minimum}.')


def label(value):
    result = str(value or '').strip()
    if not result or len(result) > 250:
        raise SessionError('Enter a name of 1 to 250 characters.')
    return result


def session_for(state, data):
    return find(state['sessions'], data.get('session_id'))


def require_live(state):
    current = next((s for s in state['sessions'] if s['status'] == 'active'), None)
    if not current:
        raise SessionError('Start or resume a session first.')
    return current


def same_location(a, b):
    # Display-name changes must not turn a stable mapped destination into a different place.
    if a.get('key') and b.get('key'):
        return a['key'] == b['key']
    if all(a.get(k) is not None and b.get(k) is not None for k in ('x', 'y')):
        return all(a.get(k) == b.get(k) for k in ('map_key', 'x', 'y', 'elevation'))
    return a.get('label', '').strip() == b.get('label', '').strip()


def travelling(state, group_id):
    return next((j for j in state['journeys'] if j['group_id'] == group_id and j['status'] == 'travelling'), None)


def journey_position(journey, now):
    """Return clock-derived progress without mutating a persisted journey."""
    route = journey.get('route_snapshot') or {}
    path = route.get('path') or []
    duration = max(1, int(journey.get('arrival', now) - journey.get('departure', now)))
    elapsed = max(0, min(duration, int(now - journey.get('departure', now))))
    progress = elapsed / duration
    if len(path) < 2:
        return {'progress': progress, 'current_position': deepcopy(journey.get('origin') or {})}
    route_elapsed = progress * float(route.get('elapsed_seconds') or duration)
    previous = path[0]
    for point in path[1:]:
        end = float(point.get('cumulative_seconds') or 0)
        start = float(previous.get('cumulative_seconds') or 0)
        if route_elapsed <= end:
            amount = 0 if end <= start else (route_elapsed - start) / (end - start)
            position = {'kind': 'route_position', 'label': f"En route to {journey['destination']['label']}",
                        'map_key': route.get('map_key'),
                        'x': previous['x'] + (point['x'] - previous['x']) * amount,
                        'y': previous['y'] + (point['y'] - previous['y']) * amount,
                        'route_journey_id': journey['id']}
            return {'progress': progress, 'current_position': position}
        previous = point
    return {'progress': 1, 'current_position': deepcopy(journey.get('destination') or {})}


def running(state):
    return next((e for e in state['encounters'] if e['status'] == 'running'), None)


def advance(state, now, seconds):
    if state['pending']:
        raise SessionError('Acknowledge the pending arrivals or events before advancing time.')
    target = now + number(seconds)
    stops = [j['arrival'] for j in state['journeys'] if j['status'] == 'travelling' and j['arrival'] <= target]
    stops += [e['at'] for e in state['events'] if e['status'] == 'scheduled' and e['stop'] and e['at'] <= target]
    end = max(now, min(stops)) if stops else target
    for j in state['journeys']:
        if j['status'] == 'travelling' and j['arrival'] <= end:
            j['status'] = 'arrived'
            find(state['groups'], j['group_id'])['location'] = deepcopy(j['destination'])
            state['pending'].append(dict(id=j['id'], kind='arrival', label=j['name']))
    for e in state['events']:
        if e['status'] == 'scheduled' and e['at'] <= end:
            e['status'] = 'due'
            if e['stop']:
                state['pending'].append(dict(id=e['id'], kind='event', label=e['name']))
    return end


def apply_command(document, action, data, now, roster, calendar_configured=True):
    """Return a new document and authoritative time. No partial mutations on errors."""
    state = deepcopy(document)
    new_now = now
    if action == 'create_session':
        state['sessions'].append(dict(id=uid(), title=label(data.get('title')), status='prepared', prep='', notes='', recap='',
                                      roster={str(c['id']): dict(attendance='unconfirmed', participation='inactive') for c in roster},
                                      references=[], staged=[], started_at=None, ended_at=None))
    elif action == 'update_session':
        s = session_for(state, data)
        for field in ('title', 'prep', 'notes', 'recap'):
            if field in data:
                s[field] = label(data[field]) if field == 'title' else str(data[field])[:100000]
    elif action == 'lifecycle':
        s = session_for(state, data)
        dest = data.get('status')
        transitions = {'prepared': ['active'], 'active': ['paused', 'ended'], 'paused': ['active', 'ended'], 'ended': []}
        if dest not in transitions[s['status']]:
            raise SessionError('That session transition is not available.')
        if dest == 'active':
            if any(other['id'] != s['id'] and other['status'] in ('active', 'paused') for other in state['sessions']):
                raise SessionError('End the current session before starting another.')
            if not data.get('confirm_roster'):
                raise SessionError('Confirm the roster and starting state before starting.')
            if s['status'] == 'prepared' and any(s['roster'].get(str(c['id']), {}).get('attendance', 'unconfirmed') == 'unconfirmed' for c in roster):
                raise SessionError('Confirm attendance for every player character first.')
            if (any(j['status'] == 'travelling' for j in state['journeys']) or any(e['status'] in ('running', 'suspended') for e in state['encounters']) or any(e['status'] in ('scheduled', 'due') for e in state['events']) or state['pending'] or state['remainder']) and not data.get('continue_unresolved'):
                raise SessionError('Confirm continuation of the unfinished journeys and encounters.')
            if s['started_at'] is None:
                s['started_at'] = now if calendar_configured else None
        if dest == 'ended':
            if not data.get('confirm_end'):
                raise SessionError('Confirm ending this session.')
            s['ended_at'] = now if calendar_configured else None
            for encounter in state['encounters']:
                if encounter['status'] == 'running':
                    encounter['status'] = 'suspended'
        s['status'] = dest
    elif action == 'roster':
        s = session_for(state, data)
        cid = str(data.get('character_id'))
        if cid not in {str(c['id']) for c in roster}:
            raise SessionError('Choose a character in this campaign.')
        attendance = data.get('attendance', 'unconfirmed')
        participation = data.get('participation', 'inactive')
        if attendance not in ('unconfirmed', 'present', 'absent') or participation not in ('player', 'dm', 'accompanying', 'inactive'):
            raise SessionError('Choose a valid attendance and participation state.')
        actor = next(c for c in roster if str(c['id']) == cid)
        for c in roster:
            if c.get('user_id') is not None and c.get('user_id') == actor.get('user_id'):
                entry = s['roster'].setdefault(str(c['id']), dict(attendance='unconfirmed', participation='inactive'))
                entry['attendance'] = attendance
        s['roster'][cid] = dict(attendance=attendance, participation=participation)
    elif action == 'group':
        members = list(dict.fromkeys(str(c) for c in data.get('members', [])))
        if not set(members).issubset({str(c['id']) for c in roster}):
            raise SessionError('Group members must belong to this campaign.')
        group = find(state['groups'], data['id']) if data.get('id') else None
        affected = [g for g in state['groups'] if g is group or set(g['members']) & set(members)]
        if any(travelling(state, g['id']) for g in affected):
            raise SessionError('Stop the group journey before changing membership or location.')
        locations = [g['location'] for g in affected if g['members']]
        if not data.get('relocate') and any(not same_location(loc, locations[0]) for loc in locations[1:]):
            raise SessionError('Groups are at different locations. Explicitly relocate them to merge.')
        location = deepcopy(data.get('location') or (group or {}).get('location') or (locations[0] if locations else {'label': 'Not set'}))
        if (group and not same_location(location, group['location']) or not group and locations and not same_location(location, locations[0])) and not data.get('relocate'):
            raise SessionError('Confirm a narrative relocation without elapsed time.')
        if not group:
            group = dict(id=uid(), members=[], location=location)
            state['groups'].append(group)
        for other in state['groups']:
            if other is not group:
                other['members'] = [c for c in other['members'] if c not in members]
        group.update(name=label(data.get('name')), members=members, location=location)
    elif action == 'reference':
        s = session_for(state, data)
        ref = deepcopy(data.get('reference') or {})
        if ref.get('kind') not in ('note', 'wiki'):
            raise SessionError('Pin a private campaign note or Wiki page.')
        ref.update(id=uid(), label=label(ref.get('label')))
        s['references'].append(ref)
    elif action == 'remove_reference':
        s = session_for(state, data)
        s['references'] = [r for r in s['references'] if r['id'] != data.get('id')]
    elif action == 'template':
        template = find(state['templates'], data['id']) if data.get('id') else {'id': uid()}
        participants = deepcopy(data.get('participants', []))
        if not participants:
            raise SessionError('Add at least one encounter participant.')
        for p in participants:
            p['name'] = label(p.get('name'))
            p['quantity'] = number(p.get('quantity', 1), 1)
            if p['quantity'] > 100:
                raise SessionError('Use at most 100 of each participant.')
            if p.get('disposition', 'Hostile') not in ('Friendly', 'Neutral', 'Hostile'):
                raise SessionError('Choose Friendly, Neutral, or Hostile for each participant.')
            p['disposition'] = p.get('disposition', 'Hostile')
            p['initiative_group'] = str(p.get('initiative_group') or 'individual')[:50]
        template.update(name=label(data.get('name')), notes=str(data.get('notes', ''))[:100000], participants=participants,
                        environment=str(data.get('environment', ''))[:100], source=str(data.get('source', 'Campaign'))[:100],
                        is_preset=bool(data.get('is_preset', False)))
        if not data.get('id'):
            state['templates'].append(template)
    elif action == 'stage':
        s = session_for(state, data)
        find(state['templates'], data.get('template_id'))
        if data['template_id'] not in s['staged']:
            s['staged'].append(data['template_id'])
    elif action == 'start_encounter':
        s = require_live(state)
        if running(state):
            raise SessionError('Suspend or resolve the running encounter first.')
        template = find(state['templates'], data.get('template_id'))
        chars = [str(c) for c in data.get('characters', [])]
        if not set(chars).issubset({str(c['id']) for c in roster}):
            raise SessionError('Choose campaign characters.')
        combatants = []
        auto_roll = data.get('initiative') == 'automatic'
        initiative_rolls = {}
        from secrets import randbelow
        for participant_index, p in enumerate(template['participants']):
            grouping = p.get('initiative_group', 'individual')
            for copy_index in range(p['quantity']):
                group_id = None if grouping == 'individual' else (f'participant:{participant_index}' if grouping == 'same' else f'custom:{grouping}')
                roll = None
                if auto_roll:
                    roll_key = group_id or f'individual:{participant_index}:{copy_index}'
                    if roll_key not in initiative_rolls:
                        initiative_rolls[roll_key] = randbelow(20) + 1 + (int(p.get('dexterity') or 10)-10)//2
                    roll = initiative_rolls[roll_key]
                combatants.append(dict(id=uid(), source_id=p.get('source_id'), source=p.get('source'), name=p['name'], initiative=roll,
                                       initiative_group=group_id, disposition=p.get('disposition', 'Hostile'),
                                       hp=p.get('hp'), ac=p.get('ac'), dexterity=p.get('dexterity', 10), kind='npc'))
        for cid in dict.fromkeys(chars):
            c = next(c for c in roster if str(c['id']) == cid)
            combatants.append(dict(id=uid(), source_id=c['id'], name=c['name'], initiative=None, kind='player'))
        state['encounters'].append(dict(id=uid(), template_id=template['id'], session_id=s['id'], name=template['name'], notes=template['notes'],
                                        status='running', combatants=combatants, turn=0, round=1, started=False))
    elif action in ('encounter_status', 'initiative', 'roll_npc_initiative', 'roll_all_npc_initiative', 'begin_encounter', 'next_turn'):
        e = find(state['encounters'], data.get('id'))
        if action == 'encounter_status':
            status = data.get('status')
            if e['status'] == 'resolved' or status not in ('suspended', 'running', 'resolved'):
                raise SessionError('Choose an available encounter status.')
            if status == 'running':
                require_live(state)
                if running(state) and running(state)['id'] != e['id']:
                    raise SessionError('Only one encounter can run at a time.')
            e['status'] = status
        elif action == 'roll_all_npc_initiative':
            if e['started']:
                raise SessionError('Suspend combat before editing its initiative order.')
            from secrets import randbelow
            rolls = {}
            for c in e['combatants']:
                if c['kind'] != 'npc':
                    continue
                key = c.get('initiative_group') or c['id']
                if key not in rolls:
                    rolls[key] = randbelow(20) + 1 + (int(c.get('dexterity') or 10)-10)//2
                c['initiative'] = rolls[key]
        elif action in ('initiative', 'roll_npc_initiative'):
            c = find(e['combatants'], data.get('combatant_id'))
            try:
                if action == 'roll_npc_initiative':
                    if c['kind'] != 'npc':
                        raise SessionError('Player initiative must be entered or rolled by its player.')
                    from secrets import randbelow
                    rolled = randbelow(20) + 1 + (int(c.get('dexterity') or 10)-10)//2
                    for member in e['combatants']:
                        if member['id'] == c['id'] or (c.get('initiative_group') and member.get('initiative_group') == c['initiative_group']):
                            member['initiative'] = rolled
                else:
                    entered = int(data['initiative'])
                    for member in e['combatants']:
                        if member['id'] == c['id'] or (c.get('initiative_group') and member.get('initiative_group') == c['initiative_group']):
                            member['initiative'] = entered
            except (ValueError, TypeError, KeyError):
                raise SessionError('Enter a whole initiative value.')
            if e['started']:
                raise SessionError('Suspend combat before editing its initiative order.')
        else:
            require_live(state)
            if e['status'] != 'running':
                raise SessionError('Resume the encounter first.')
            if action == 'begin_encounter':
                if e['started']:
                    raise SessionError('This encounter has already begun.')
                if not e['combatants'] or any(c['initiative'] is None for c in e['combatants']):
                    raise SessionError('Set initiative for every participant first.')
                e['combatants'].sort(key=lambda c: -c['initiative'])
                e.update(started=True, turn=0)
            else:
                if not e['started']:
                    raise SessionError('Begin the encounter first.')
                if state['pending'] or state['remainder']:
                    raise SessionError('Resolve pending time events and continue the round clock first.')
                if e['turn'] == len(e['combatants']) - 1:
                    if not calendar_configured:
                        raise SessionError('Configure the campaign calendar to complete timed combat rounds.')
                    new_now = advance(state, now, 6)
                    state['remainder'] = 6 - (new_now - now)
                    e['round'] += 1
                e['turn'] = (e['turn'] + 1) % len(e['combatants'])
    elif action == 'journey':
        s = require_live(state)
        if not calendar_configured:
            raise SessionError('Configure the campaign calendar first.')
        group = find(state['groups'], data.get('group_id'))
        if not group['members'] or travelling(state, group['id']):
            raise SessionError('Choose a nonempty group that is not already travelling.')
        duration = number(data.get('seconds'), 1)
        destination = deepcopy(data.get('destination') or {})
        destination['label'] = label(destination.get('label'))
        state['journeys'].append(dict(id=uid(), name=f"{group['name']} → {destination['label']}", group_id=group['id'], session_id=s['id'],
                                       origin=deepcopy(group['location']), destination=destination, departure=now, arrival=now+duration,
                                       status='travelling', **({'route_snapshot': deepcopy(data['route_snapshot'])}
                                                               if data.get('route_snapshot') else {})))
    elif action == 'stop_journey':
        j = find(state['journeys'], data.get('id'))
        if j['status'] != 'travelling':
            raise SessionError('That journey is no longer running.')
        j['status'] = 'stopped'
        if j.get('route_snapshot'):
            find(state['groups'], j['group_id'])['location'] = journey_position(j, now)['current_position']
        else:
            find(state['groups'], j['group_id'])['location'] = {'label': label(data.get('location'))}
    elif action == 'event':
        require_live(state)
        if not calendar_configured:
            raise SessionError('Configure the campaign calendar first.')
        state['events'].append(dict(id=uid(), name=label(data.get('name')), at=now+number(data.get('seconds'), 1), stop=bool(data.get('stop', True)), status='scheduled'))
    elif action == 'cancel_event':
        event = find(state['events'], data.get('id'))
        if event['status'] != 'scheduled':
            raise SessionError('Acknowledge an event that is already due.')
        event['status'] = 'cancelled'
    elif action == 'acknowledge':
        ids = set(data.get('ids', []))
        state['pending'] = [p for p in state['pending'] if p['id'] not in ids]
        for event in state['events']:
            if event['id'] in ids and event['status'] == 'due':
                event['status'] = 'acknowledged'
    elif action in ('advance', 'next_event', 'continue_time', 'set_time'):
        require_live(state)
        if not calendar_configured:
            raise SessionError('Configure the campaign calendar first.')
        if action == 'set_time':
            target = int(data['target'])
            if target < now:
                if running(state) or any(j['status'] == 'travelling' for j in state['journeys']) or state['pending'] or state['remainder']:
                    raise SessionError('Stop journeys, suspend combat and resolve pending events before moving time backward.')
                new_now = target
            else:
                new_now = advance(state, now, target-now)
        elif action == 'next_event':
            upcoming = [j['arrival'] for j in state['journeys'] if j['status'] == 'travelling'] + [e['at'] for e in state['events'] if e['status'] == 'scheduled' and e['stop']]
            if not upcoming:
                raise SessionError('There are no upcoming timed arrivals or stopping events.')
            if state['remainder']:
                raise SessionError('Continue the interrupted round clock first.')
            new_now = advance(state, now, max(0, min(upcoming)-now))
        else:
            seconds = state['remainder'] if action == 'continue_time' else number(data.get('seconds'), 1)
            if action != 'continue_time' and state['remainder']:
                raise SessionError('Continue the interrupted round clock first.')
            new_now = advance(state, now, seconds)
            if action == 'continue_time':
                state['remainder'] = seconds - (new_now-now)
    else:
        raise SessionError('Unknown session action.')
    state['activity'].append(dict(id=uid(), action=action, at=new_now if calendar_configured else None,
                                  recorded_at=datetime.now(timezone.utc).isoformat()))
    return state, new_now
