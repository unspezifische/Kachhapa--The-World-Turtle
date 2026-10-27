"""Schedule authoring/compilation. Inspection never executes NPC actions."""
from copy import deepcopy
import random

CAPABILITIES = {'sleep', 'rest', 'eat', 'prepare_food', 'wash', 'work', 'study', 'socialize', 'worship', 'store_items', 'guard', 'tend_animals', 'trade', 'pass_through', 'change_clothes', 'clean', 'read'}

OCCUPATION_ARCHETYPES = {
    'dockworker': {'start': '06:00', 'duration_minutes': 480, 'activity': 'work', 'room_purposes': ['dock', 'warehouse', 'yard']},
    'laborer': {'start': '07:00', 'duration_minutes': 480, 'activity': 'work', 'room_purposes': ['workshop', 'yard']},
    'merchant': {'start': '09:00', 'duration_minutes': 540, 'activity': 'trade', 'room_purposes': ['shop', 'market', 'office']},
    'shopkeeper': {'start': '09:00', 'duration_minutes': 540, 'activity': 'trade', 'room_purposes': ['shop', 'market']},
    'clergy': {'start': '08:00', 'duration_minutes': 420, 'activity': 'worship', 'room_purposes': ['chapel', 'shrine', 'temple']},
    'noble': {'start': '10:00', 'duration_minutes': 240, 'activity': 'work', 'room_purposes': ['office', 'study', 'hall']},
    'aristocrat': {'start': '10:00', 'duration_minutes': 240, 'activity': 'socialize', 'room_purposes': ['parlor', 'hall', 'office']},
    'researcher': {'start': '09:00', 'duration_minutes': 360, 'activity': 'study', 'room_purposes': ['study', 'library', 'laboratory']},
    'scholar': {'start': '09:00', 'duration_minutes': 360, 'activity': 'study', 'room_purposes': ['study', 'library']},
    'guard': {'start': '08:00', 'duration_minutes': 480, 'activity': 'guard', 'room_purposes': ['guard post', 'gate', 'barracks']},
    'adventurer': {'start': '09:00', 'duration_minutes': 360, 'activity': 'work', 'room_purposes': ['guild hall', 'training area']},
}


def _field(value, key, default=None):
    return value.get(key, default) if isinstance(value, dict) else getattr(value, key, default)


def _occupation_archetype(definition):
    configured = deepcopy(_field(definition, 'schedule_archetype', {}) or {})
    if configured:
        return configured
    key = str(_field(definition, 'occupation_key', '') or '').casefold()
    return deepcopy(OCCUPATION_ARCHETYPES.get(key, {
        'start': '08:00', 'duration_minutes': 480, 'activity': 'work', 'room_purposes': ['work area'],
    }))


def _weighted_activity(definition, seed):
    """Choose an optional free-time activity reproducibly from valid weights."""
    configured = _field(definition, 'activity_weights', {}) or {}
    choices = sorted(
        (activity, float(weight)) for activity, weight in configured.items()
        if activity in CAPABILITIES and isinstance(weight, (int, float))
        and not isinstance(weight, bool) and weight > 0
    )
    if not choices:
        return None
    cursor = random.Random(str(seed)).uniform(0, sum(weight for _, weight in choices))
    for activity, weight in choices:
        cursor -= weight
        if cursor <= 0:
            return activity
    return choices[-1][0]


def schedule_from_domains(npc_key, occupations, roles, existing=None):
    """Build a deterministic draft without consulting or resolving combat data.

    ``occupations`` contains ``(association, definition)`` pairs. Existing
    manually-authored rules survive and always receive precedence over generated
    work rules. Generated rules are replaced idempotently on the next run.
    """
    document = deepcopy(existing) if isinstance(existing, dict) else {
        'schema_version': 1, 'schedule_key': f'npc-{npc_key}.routine', 'module_key': None,
        'npc_key': str(npc_key), 'revision': 1, 'enabled': False, 'visibility': 'dm_only',
        'clock': 'campaign_calendar', 'provenance': {'basis': 'dm_invention', 'confidence': 'proposed'},
        'bindings': {}, 'rules': [], 'exceptions': [], 'default_behavior': 'idle_at_current_location',
    }
    document.setdefault('bindings', {})
    document.setdefault('rules', [])
    document.setdefault('exceptions', [])
    manual = [rule for rule in document['rules'] if _field(_field(rule, 'provenance', {}), 'generator') != 'occupation_archetype']
    active_occupations = [(association, definition) for association, definition in occupations
                          if _field(association, 'status', 'current') == 'current']
    active_occupations.sort(key=lambda pair: (not bool(_field(pair[0], 'is_primary', False)), _field(pair[0], 'id', 0) or 0))
    active_roles = [role for role in roles if _field(role, 'status', 'active') == 'active']
    active_roles.sort(key=lambda role: (-int(_field(role, 'priority', 0) or 0), _field(role, 'id', 0) or 0,
                                        str(_field(role, 'position_title', '')).casefold()))
    manual_floor = min((int(_field(rule, 'priority', 10)) for rule in manual), default=100)
    generated = []

    def generated_rule(rule_id, archetype, binding, priority, source):
        activity = archetype.get('activity', 'work')
        return {
            'id': rule_id, 'start': archetype.get('start', '08:00'),
            'duration_minutes': int(archetype.get('duration_minutes', 480)), 'priority': priority,
            'activity': activity, 'repeat': deepcopy(archetype.get('repeat') or {'kind': 'daily'}),
            'destination': {'binding': binding, 'capability': archetype.get('capability', activity),
                            'fallbacks': [{'binding': 'home', 'capability': 'rest'}]},
            'arrival_policy': 'require_arrival', 'on_unavailable': 'wait_and_retry', 'retry_minutes': 15,
            'provenance': {'basis': 'dm_invention', 'confidence': 'proposed',
                           'generator': 'occupation_archetype', 'source': source},
        }

    document['bindings'].setdefault('home', {})
    role_occupation = {_field(association, 'id'): definition for association, definition in active_occupations}
    if active_roles:
        for rank, role in enumerate(active_roles):
            role_id = _field(role, 'id') or rank + 1
            binding = f'role-{role_id}-workplace'
            workplace = deepcopy(_field(role, 'workplace', {}) or {})
            definition = role_occupation.get(_field(role, 'occupation_association_id'))
            archetype = deepcopy(_field(role, 'schedule_override', {}) or {}) or _occupation_archetype(definition)
            workplace.setdefault('room_purposes', archetype.get('room_purposes', []))
            if _field(role, 'workplace_location_id') and not workplace.get('resolved'):
                workplace['world_atlas_location_id'] = _field(role, 'workplace_location_id')
            document['bindings'][binding] = workplace
            priority = manual_floor - rank - 1
            generated.append(generated_rule(f'role-{role_id}-work', archetype, binding, priority,
                                            {'kind': 'role', 'id': role_id}))
    elif active_occupations:
        association, definition = active_occupations[0]
        archetype = _occupation_archetype(definition)
        document['bindings']['workplace'] = {
            **document['bindings'].get('workplace', {}), 'room_purposes': archetype.get('room_purposes', []),
        }
        generated.append(generated_rule(f'occupation-{_field(association, "id", 0) or "primary"}-work', archetype,
                                        'workplace', manual_floor - 1,
                                        {'kind': 'occupation', 'id': _field(association, 'id')}))
    if active_occupations:
        association, definition = active_occupations[0]
        activity = _weighted_activity(definition, f'{npc_key}:{_field(association, "id", "primary")}:activity')
        if activity:
            archetype = _occupation_archetype(definition)
            free_time = {
                'start': archetype.get('activity_start', '19:00'),
                'duration_minutes': int(archetype.get('activity_duration_minutes', 120)),
                'activity': activity,
            }
            generated.append(generated_rule(
                f'occupation-{_field(association, "id", 0) or "primary"}-free-time',
                free_time, 'home', manual_floor - len(generated) - 1,
                {'kind': 'occupation_activity_weights', 'id': _field(association, 'id')},
            ))
    document['rules'] = manual + generated
    document['generated_from_domains'] = {
        'occupation_ids': [_field(item[0], 'id') for item in active_occupations],
        'role_ids': [_field(role, 'id') for role in active_roles],
        'strategy': 'manual_precedence_then_role_priority_then_stable_id',
    }
    document['enabled'] = False
    return document


def compile_schedule(document, hours=24, minutes=60):
    if not isinstance(document, dict) or document.get('schema_version') != 1:
        raise ValueError('Expected a version 1 schedule object')
    result = deepcopy(document)
    if result.get('clock') != 'campaign_calendar' or result.get('visibility') != 'dm_only':
        raise ValueError('Schedules currently require campaign_calendar and dm_only visibility')
    bindings = result.get('bindings', {})
    if not isinstance(bindings, dict):
        raise ValueError('Bindings must be an object')
    compiled, warnings, ids = [], [], set()
    day_length = hours * minutes
    for exceptional, rules in ((False, result.get('rules', [])), (True, result.get('exceptions', []))):
        if not isinstance(rules, list) or len(rules) > 200:
            raise ValueError('Use at most 200 rules in each section')
        for rule in rules:
            if not isinstance(rule, dict) or not isinstance(rule.get('id'), str) or not rule['id'] or rule['id'] in ids:
                raise ValueError('Each rule needs a unique stable ID')
            ids.add(rule['id'])
            try:
                hour, minute = map(int, rule['start'].split(':'))
            except (ValueError, TypeError, KeyError, AttributeError):
                raise ValueError(f"{rule['id']}: use HH:MM for start")
            duration, priority = rule.get('duration_minutes'), rule.get('priority', 10)
            if not 0 <= hour < hours or not 0 <= minute < minutes:
                raise ValueError(f"{rule['id']}: time is outside the campaign day")
            if isinstance(duration, bool) or not isinstance(duration, int) or not 0 < duration <= day_length:
                raise ValueError(f"{rule['id']}: duration must be between 1 minute and one day")
            if isinstance(priority, bool) or not isinstance(priority, int):
                raise ValueError('Priority must be an integer')
            if rule.get('activity') not in CAPABILITIES:
                raise ValueError(f"{rule['id']}: unsupported activity")
            repeat = rule.get('repeat', {})
            kind = repeat.get('kind')
            if kind not in ('daily', 'cycle', 'once'):
                raise ValueError('Repeat must be daily, cycle or once')
            if kind == 'cycle':
                cycle, indices = repeat.get('cycle_days'), repeat.get('day_indices')
                if not isinstance(cycle, int) or isinstance(cycle, bool) or cycle < 1 or not isinstance(indices, list) or not indices or any(not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < cycle for i in indices):
                    raise ValueError('Cycle requires cycle_days and valid zero-based day_indices')
                if not valid_date(repeat.get('anchor_date')):
                    raise ValueError('Cycle requires an anchor_date')
            if kind == 'once' and not valid_date(repeat.get('date')):
                raise ValueError('Once requires a campaign date')
            if exceptional and priority <= max([r.get('priority', 10) for r in result.get('rules', [])] or [0]):
                raise ValueError('Exception priority must be higher than routine priorities')
            destination = rule.get('destination', {})
            choices = [destination, *destination.get('fallbacks', [])]
            for choice in choices:
                if not isinstance(choice, dict) or choice.get('binding') not in bindings or choice.get('capability') not in CAPABILITIES:
                    raise ValueError(f"{rule['id']}: choose a defined binding and supported capability")
                binding = bindings[choice['binding']]
                if not isinstance(binding, dict):
                    raise ValueError('Each binding must be an object')
                if not binding.get('resolved'):
                    warnings.append(f"{rule['id']}: {choice['binding']} needs a location mapping")
            if rule.get('arrival_policy') != 'require_arrival' or rule.get('on_unavailable') not in ('skip', 'wait_and_retry'):
                raise ValueError('Use require_arrival and skip or wait_and_retry')
            if rule['on_unavailable'] == 'wait_and_retry' and (not isinstance(rule.get('retry_minutes'), int) or isinstance(rule.get('retry_minutes'), bool) or rule['retry_minutes'] < 1):
                raise ValueError('Retry interval must be a positive integer')
            provenance = rule.get('provenance', result.get('provenance', {}))
            if provenance.get('basis') not in ('module_explicit', 'module_inference', 'dm_invention', 'unknown'):
                raise ValueError('Specify schedule provenance')
            if provenance['basis'] == 'module_explicit' and not provenance.get('source_reference'):
                raise ValueError('Explicit module claims require a source reference')
            compiled.append({'rule_id': rule['id'], 'start_minute': hour * minutes + minute, 'duration_minutes': duration, 'priority': priority, 'repeat': repeat, 'rule': rule})
    for index, left in enumerate(compiled):
        for right in compiled[index + 1:]:
            if left['priority'] != right['priority']:
                continue
            # Distinct once dates may overlap across midnight; compare their occurrence days at inspection.
            if left['repeat']['kind'] == right['repeat']['kind'] == 'cycle' and left['repeat']['cycle_days'] == right['repeat']['cycle_days'] and left['repeat']['anchor_date'] == right['repeat']['anchor_date'] and set(left['repeat']['day_indices']).isdisjoint(right['repeat']['day_indices']) and left['start_minute'] + left['duration_minutes'] <= day_length and right['start_minute'] + right['duration_minutes'] <= day_length:
                continue
            potentially_same_day = left['repeat']['kind'] != 'once' or right['repeat']['kind'] != 'once' or left['repeat']['date'] == right['repeat']['date']
            if potentially_same_day and any(max(left['start_minute'], right['start_minute'] + shift) < min(left['start_minute'] + left['duration_minutes'], right['start_minute'] + shift + right['duration_minutes']) for shift in (-day_length, 0, day_length)):
                raise ValueError(f"Overlapping equal-priority rules: {left['rule_id']} and {right['rule_id']}")
    result['enabled'] = bool(result.get('enabled')) and not warnings
    return result, compiled, sorted(set(warnings))


def valid_date(value):
    return isinstance(value, dict) and all(isinstance(value.get(key), int) and not isinstance(value.get(key), bool) for key in ('year', 'month_index', 'day')) and value['month_index'] >= 0 and value['day'] >= 1


def planned_schedule(compiled, calendar, ordinal):
    if not calendar:
        return {'current': None, 'next': None, 'reason': 'Campaign calendar unavailable'}
    day = ordinal(calendar, calendar.current_year, calendar.current_month_index, calendar.current_day)
    length = calendar.get_hours_in_day() * calendar.get_minutes_in_hour()
    now = day * length + calendar.current_hour * calendar.get_minutes_in_hour() + calendar.current_minute
    current, upcoming = [], []
    for item in compiled:
        repeat = item['repeat']
        if repeat['kind'] == 'daily':
            days = [day - 1, day, day + 1]
        elif repeat['kind'] == 'once':
            date = repeat['date']
            days = [ordinal(calendar, date['year'], date['month_index'], date['day'])]
        else:
            anchor = repeat['anchor_date']
            base = ordinal(calendar, anchor['year'], anchor['month_index'], anchor['day'])
            cycle = repeat['cycle_days']
            days = sorted({day + ((index - (day - base)) % cycle) + offset for index in repeat['day_indices'] for offset in (-cycle, 0, cycle)})
        for date in days:
            start = date * length + item['start_minute']
            value = {'rule_id': item['rule_id'], 'activity': item['rule']['activity'], 'start_game_minute': start, 'end_game_minute': start + item['duration_minutes'], 'priority': item['priority']}
            if start <= now < value['end_game_minute']:
                current.append(value)
            if start > now:
                upcoming.append(value)
    active = max(current, key=lambda value: value['priority']) if current else None
    if len([value for value in current if active and value['priority'] == active['priority']]) > 1:
        return {'current': None, 'next': None, 'reason': 'Conflicting occurrences need review'}
    return {'current': active, 'next': min(upcoming, key=lambda value: (value['start_game_minute'], -value['priority'])) if upcoming else None, 'game_minute': now, 'label': 'Planned only; does not execute activities'}
