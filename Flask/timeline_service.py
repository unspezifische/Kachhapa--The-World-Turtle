"""Calendar-specific season, partial-date, and historical age helpers."""

DEFAULT_SEASONS = {
    'harptos': [
        {'name': 'Winter', 'months': [0, 1, 2], 'end_month_index': 2},
        {'name': 'Spring', 'months': [3, 4, 5], 'end_month_index': 5},
        {'name': 'Summer', 'months': [6, 7, 8], 'end_month_index': 8},
        {'name': 'Autumn', 'months': [9, 10, 11], 'end_month_index': 11},
    ],
    'gregorian': [
        {'name': 'Winter', 'months': [11, 0, 1], 'end_month_index': 1},
        {'name': 'Spring', 'months': [2, 3, 4], 'end_month_index': 4},
        {'name': 'Summer', 'months': [5, 6, 7], 'end_month_index': 7},
        {'name': 'Autumn', 'months': [8, 9, 10], 'end_month_index': 10},
    ],
}

INTERCALARY_SEASONS = {
    'Midwinter': 'Winter', 'Greengrass': 'Spring', 'Midsummer': 'Summer',
    'Shieldmeet': 'Summer', 'Highharvestide': 'Autumn', 'Feast of the Moon': 'Autumn',
}


def _format_data(calendar):
    if hasattr(calendar, 'get_format_data'):
        return calendar.get_format_data() or {}
    return getattr(getattr(calendar, 'format_element', None), 'data', {}) or {}


def calendar_seasons(calendar):
    data = _format_data(calendar)
    configured = data.get('seasons') or []
    if configured:
        return list(configured)
    slug = getattr(calendar, 'format_slug', None) or data.get('slug')
    return list(DEFAULT_SEASONS.get(slug, []))


def calendar_holidays(calendar):
    return [{**item, **({'season': item.get('season') or INTERCALARY_SEASONS.get(item.get('name'))} if item.get('season') or INTERCALARY_SEASONS.get(item.get('name')) else {})}
            for item in _format_data(calendar).get('holidays', [])]


def holiday_on(calendar, year, month_index, day, is_leap_year):
    for holiday in calendar_holidays(calendar):
        if holiday.get('month_index') != month_index or holiday.get('day') != day:
            continue
        if holiday.get('leap_only') and not is_leap_year(calendar, year):
            continue
        return holiday
    return None


def season_for_date(calendar, year, month_index, day, is_leap_year):
    holiday = holiday_on(calendar, year, month_index, day, is_leap_year) if day is not None else None
    if holiday:
        holiday_season = holiday.get('season') or INTERCALARY_SEASONS.get(holiday.get('name'))
        if holiday_season:
            return holiday_season
    for season in calendar_seasons(calendar):
        if month_index in season.get('months', []):
            return season['name']
    return None


def base_month_days(calendar, year, month_index, is_leap_year):
    months = _format_data(calendar).get('months', [])
    if month_index < 0 or month_index >= len(months):
        raise ValueError('The selected month is not valid for this calendar.')
    month = months[month_index]
    if is_leap_year(calendar, year) and month.get('leap_length') is not None:
        return int(month['leap_length'])
    return int(month.get('length', 30))


def normalize_partial_date(calendar, values, is_leap_year, days_in_month, require_year=True, allow_year_only=False):
    def optional_int(key):
        value = values.get(key)
        if value in (None, ''):
            return None
        if isinstance(value, bool):
            raise ValueError(f'{key.replace("_", " ").title()} must be a whole number.')
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ValueError(f'{key.replace("_", " ").title()} must be a whole number.')

    year = optional_int('year')
    month_index = optional_int('month_index')
    day = optional_int('day')
    requested_season = str(values.get('season') or '').strip().title() or None
    if require_year and year is None:
        raise ValueError('Year is required.')
    if day is not None and month_index is None:
        raise ValueError('Choose a month before choosing a day.')
    seasons = {item['name'] for item in calendar_seasons(calendar)}
    if month_index is not None:
        months = (calendar.get_format_data() or {}).get('months', [])
        if month_index < 0 or month_index >= len(months):
            raise ValueError('The selected month is not valid for this calendar.')
        if day is not None and (day < 1 or day > days_in_month(calendar, year, month_index)):
            raise ValueError('The selected day is not valid for this calendar.')
        season = season_for_date(calendar, year, month_index, day, is_leap_year)
    else:
        season = requested_season
    if season is None and allow_year_only and month_index is None:
        return {'year': year, 'season': None, 'month_index': None, 'day': None}
    if season not in seasons:
        raise ValueError('Choose a valid season for this calendar.')
    return {'year': year, 'season': season, 'month_index': month_index, 'day': day}


def resolved_date(calendar, value, is_leap_year, base_days):
    year = int(value['year'])
    month_index = value.get('month_index')
    day = value.get('day')
    if month_index is not None:
        month_index = int(month_index)
        return year, month_index, int(day) if day is not None else base_days(calendar, year, month_index, is_leap_year)
    season_name = value.get('season')
    if season_name is None:
        months = _format_data(calendar).get('months', [])
        if not months:
            raise ValueError('This calendar does not define any months.')
        month_index = len(months) - 1
        return year, month_index, base_days(calendar, year, month_index, is_leap_year)
    season = next((item for item in calendar_seasons(calendar) if item['name'] == season_name), None)
    if not season:
        raise ValueError('Choose a valid season for this calendar.')
    month_index = int(season['end_month_index'])
    return year, month_index, base_days(calendar, year, month_index, is_leap_year)


def date_label(calendar, value, is_leap_year):
    year = value['year']
    month_index = value.get('month_index')
    day = value.get('day')
    if month_index is None:
        if not value.get('season'):
            return f'Year {year}'
        return f"{value['season']}, Year {year}"
    months = _format_data(calendar).get('months', [])
    month_name = months[month_index].get('name', f'Month {month_index + 1}')
    if day is None:
        return f'{month_name}, Year {year}'
    holiday = holiday_on(calendar, year, month_index, day, is_leap_year)
    return f"{holiday['name']}, Year {year}" if holiday else f'{month_name} {day}, Year {year}'


def date_range_label(calendar, start, end, is_leap_year):
    if not end or end.get('year') is None:
        return date_label(calendar, start, is_leap_year)
    if all(start.get(key) is None and end.get(key) is None for key in ('season', 'month_index', 'day')):
        slug = getattr(calendar, 'format_slug', None) or _format_data(calendar).get('slug')
        return (f"{start['year']}\u2013{end['year']} DR" if slug == 'harptos'
                else f"Years {start['year']}\u2013{end['year']}")
    return f"{date_label(calendar, start, is_leap_year)} \u2013 {date_label(calendar, end, is_leap_year)}"


def age_at_event(calendar, birth, event, is_leap_year, base_days, ordinal):
    if not birth or birth.get('year') is None:
        return {'age': None, 'status': 'unknown', 'label': 'Age unknown'}
    birth_point = resolved_date(calendar, birth, is_leap_year, base_days)
    event_point = resolved_date(calendar, event, is_leap_year, base_days)
    birth_ordinal = ordinal(calendar, *birth_point)
    event_ordinal = ordinal(calendar, *event_point)
    if event_ordinal < birth_ordinal:
        return {'age': None, 'status': 'not_born', 'label': 'Not born yet'}
    age = event_point[0] - birth_point[0]
    birth_anniversary = resolved_date(calendar, {**birth, 'year': event_point[0]}, is_leap_year, base_days)
    event_in_year = ordinal(calendar, *event_point)
    birthday_in_year = ordinal(calendar, *birth_anniversary)
    if event_in_year < birthday_in_year:
        age -= 1
    return {'age': max(0, age), 'status': 'age', 'label': f'Age {max(0, age)}'}


def age_during_event(calendar, birth, start, end, is_leap_year, base_days, ordinal):
    start_age = age_at_event(calendar, birth, start, is_leap_year, base_days, ordinal)
    if not end or end.get('year') is None:
        return start_age
    end_age = age_at_event(calendar, birth, end, is_leap_year, base_days, ordinal)
    if start_age['status'] == 'unknown':
        return start_age
    if end_age['status'] == 'not_born':
        return end_age
    if start_age['status'] == 'not_born' and end_age['status'] == 'age':
        return {'age': end_age['age'], 'status': 'born_during', 'label': 'Born during event'}
    if start_age.get('age') != end_age.get('age'):
        return {
            'age': start_age.get('age'), 'end_age': end_age.get('age'), 'status': 'age_range',
            'label': f"Age {start_age['age']}\u2013{end_age['age']}",
        }
    return start_age
