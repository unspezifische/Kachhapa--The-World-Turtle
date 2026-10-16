"""Schedule authoring/compilation. Inspection never executes NPC actions."""
from copy import deepcopy

CAPABILITIES = {'sleep', 'rest', 'eat', 'prepare_food', 'wash', 'work', 'study', 'socialize', 'worship', 'store_items', 'guard', 'tend_animals', 'trade', 'pass_through', 'change_clothes', 'clean', 'read'}


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
