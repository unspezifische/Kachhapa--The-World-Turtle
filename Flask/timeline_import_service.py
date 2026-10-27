"""Parse lossless Kachhapa JSON and portable Markdown timeline imports."""

import base64
import json
import re


METADATA_PATTERN = re.compile(r'<!--\s*kachhapa-timeline-event:([A-Za-z0-9_-]+)\s*-->')


def _calendar_data(calendar):
    if hasattr(calendar, 'get_format_data'):
        return calendar.get_format_data() or {}
    return getattr(getattr(calendar, 'format_element', None), 'data', {}) or {}


def _event_payload(value):
    if not isinstance(value, dict):
        raise ValueError('Each imported event must be an object.')
    date = value.get('date') if isinstance(value.get('date'), dict) else value
    end = value.get('end_date') if isinstance(value.get('end_date'), dict) else None
    characters = value.get('characters') or []
    if not isinstance(characters, list):
        raise ValueError('Event characters must be a list.')
    names = []
    for character in characters:
        name = character.get('name') if isinstance(character, dict) else character
        if isinstance(name, str) and name.strip():
            names.append(name.strip())
    return {
        'name': value.get('name'), 'description': value.get('description'),
        'color': value.get('color'), 'is_player_visible': value.get('is_player_visible', False),
        'year': date.get('year'), 'season': date.get('season'),
        'month_index': date.get('month_index'), 'day': date.get('day'),
        'end_year': end.get('year') if end else value.get('end_year'),
        'end_season': end.get('season') if end else value.get('end_season'),
        'end_month_index': end.get('month_index') if end else value.get('end_month_index'),
        'end_day': end.get('day') if end else value.get('end_day'),
        'character_names': names,
    }


def parse_timeline_json(content, expected_format_slug=None):
    try:
        document = json.loads(content.decode('utf-8-sig'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f'The JSON file could not be read: {error}')
    if isinstance(document, list):
        events = document
    elif isinstance(document, dict):
        if document.get('schema') not in (None, 'kachhapa.timeline'):
            raise ValueError('This JSON file is not a supported timeline export.')
        source_slug = (document.get('calendar') or {}).get('format_slug') if isinstance(document.get('calendar'), dict) else None
        if source_slug and expected_format_slug and source_slug != expected_format_slug:
            raise ValueError(f'This timeline uses the {source_slug} calendar and cannot be imported into {expected_format_slug}.')
        events = document.get('events')
    else:
        events = None
    if not isinstance(events, list):
        raise ValueError('The JSON file must contain an events list.')
    return [_event_payload(event) for event in events]


def _decode_markdown_metadata(text):
    events = []
    for encoded in METADATA_PATTERN.findall(text):
        try:
            padded = encoded + '=' * (-len(encoded) % 4)
            events.append(_event_payload(json.loads(base64.urlsafe_b64decode(padded).decode('utf-8'))))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError('The Markdown file contains invalid embedded timeline data.')
    return events


def _parse_single_date(calendar, label):
    label = label.strip()
    year_match = re.fullmatch(r'(?:Year\s+)?(-?\d+)(?:\s+DR)?', label, re.IGNORECASE)
    if year_match:
        return {'year': int(year_match.group(1)), 'season': None, 'month_index': None, 'day': None}
    match = re.fullmatch(r'(.+?),\s*Year\s+(-?\d+)', label, re.IGNORECASE)
    if not match:
        raise ValueError(f'Unrecognized timeline date: {label}')
    period, year = match.group(1).strip(), int(match.group(2))
    data = _calendar_data(calendar)
    seasons = {str(item.get('name')).casefold(): item.get('name') for item in data.get('seasons', [])}
    if period.casefold() in seasons:
        return {'year': year, 'season': seasons[period.casefold()], 'month_index': None, 'day': None}
    holidays = {str(item.get('name')).casefold(): item for item in data.get('holidays', [])}
    if period.casefold() in holidays:
        holiday = holidays[period.casefold()]
        return {'year': year, 'season': holiday.get('season'), 'month_index': holiday.get('month_index'), 'day': holiday.get('day')}
    for index, month in enumerate(data.get('months', [])):
        name = str(month.get('name') or '')
        month_match = re.fullmatch(rf'{re.escape(name)}(?:\s+(\d+))?', period, re.IGNORECASE)
        if month_match:
            return {'year': year, 'season': None, 'month_index': index,
                    'day': int(month_match.group(1)) if month_match.group(1) else None}
    raise ValueError(f'Unrecognized timeline date: {label}')


def parse_date_label(calendar, label):
    simple_range = re.fullmatch(r'(?:Years?\s+)?(-?\d+)\s*[\u2013-]\s*(-?\d+)(?:\s+DR)?', label.strip(), re.IGNORECASE)
    if simple_range:
        return (_parse_single_date(calendar, simple_range.group(1)),
                _parse_single_date(calendar, simple_range.group(2)))
    detailed = re.split(r'\s+[\u2013-]\s+', label.strip(), maxsplit=1)
    if len(detailed) == 2:
        return _parse_single_date(calendar, detailed[0]), _parse_single_date(calendar, detailed[1])
    return _parse_single_date(calendar, label), None


def parse_timeline_markdown(content, calendar):
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('The Markdown file must use UTF-8 text encoding.')
    embedded = _decode_markdown_metadata(text)
    if embedded:
        return embedded
    sections = re.split(r'^##\s+', text, flags=re.MULTILINE)[1:]
    events = []
    for section in sections:
        lines = section.splitlines()
        if not lines:
            continue
        name = re.sub(r'\\([#*_`\\])', r'\1', lines[0].strip())
        date_index = next((index for index, line in enumerate(lines) if re.match(r'^\*\*Date:\*\*', line.strip(), re.IGNORECASE)), None)
        if date_index is None:
            events.append({'name': name, '_parse_error': 'A **Date:** line is required for each Markdown event.'})
            continue
        label = re.sub(r'^\*\*Date:\*\*\s*', '', lines[date_index].strip(), flags=re.IGNORECASE)
        try:
            start, end = parse_date_label(calendar, label)
        except ValueError as error:
            events.append({'name': name, '_parse_error': str(error)})
            continue
        character_index = next((index for index, line in enumerate(lines) if line.strip().lower() == '**characters:**'), len(lines))
        description = '\n'.join(line for line in lines[date_index + 1:character_index]
                                if not line.strip().startswith('<!--')).strip()
        character_names = []
        if character_index < len(lines):
            for line in lines[character_index + 1:]:
                match = re.match(r'^-\s+(.+?)(?::\s+.+)?$', line.strip())
                if match:
                    character_names.append(match.group(1).strip())
        events.append({
            'name': name, 'description': description or None, 'color': None,
            'is_player_visible': False, **start,
            'end_year': end.get('year') if end else None,
            'end_season': end.get('season') if end else None,
            'end_month_index': end.get('month_index') if end else None,
            'end_day': end.get('day') if end else None,
            'character_names': character_names,
        })
    if not events:
        raise ValueError('No timeline events were found in the Markdown file.')
    return events


def parse_timeline_file(filename, content, calendar):
    lower = str(filename or '').lower()
    if lower.endswith('.json'):
        return 'json', parse_timeline_json(content, getattr(calendar, 'format_slug', None))
    if lower.endswith(('.md', '.markdown')):
        return 'markdown', parse_timeline_markdown(content, calendar)
    raise ValueError('Choose a .json, .md, or .markdown timeline file.')
