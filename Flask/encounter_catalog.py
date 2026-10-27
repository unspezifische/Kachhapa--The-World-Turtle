"""Read 5etools random-encounter tables without copying them into campaign state."""
from functools import lru_cache
import json
import os
from pathlib import Path
import re
from secrets import choice, randbelow


CREATURE_TAG = re.compile(r'\{@creature\s+([^}|]+)(?:\|([^}|]*))?(?:\|([^}]*))?}')
DICE_BEFORE_CREATURE = re.compile(r'(?:\{@dice\s+([^}]+)}|(\d+))\s*$')


def _data_path():
    configured = os.environ.get('FIVETOOLS_DATA_DIR')
    if configured:
        return Path(configured)
    candidates = [
        Path(__file__).resolve().parents[1] / '5etools-src' / 'data',
        Path.home() / '5etools-src' / 'data',
    ]
    return next((path for path in candidates if path.exists()), candidates[0])


@lru_cache(maxsize=1)
def _tables():
    path = _data_path() / 'encounters.json'
    if not path.exists():
        return []
    records = json.loads(path.read_text(encoding='utf-8')).get('encounter', [])
    result = []
    for encounter_index, encounter in enumerate(records):
        for table_index, table in enumerate(encounter.get('tables') or []):
            rows = table.get('table') or []
            if not rows:
                continue
            result.append({
                'id': f'{encounter_index}:{table_index}', 'name': encounter.get('name', 'Random Encounter'),
                'source': encounter.get('source', 'Unknown'), 'page': encounter.get('page'),
                'min_level': table.get('minlvl'), 'max_level': table.get('maxlvl'),
                'dice': table.get('diceExpression'), 'entries': rows,
            })
    return result


def _table_cell_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ' '.join(filter(None, (_table_cell_text(item) for item in value)))
    if isinstance(value, dict):
        return _table_cell_text(value.get('entry', value.get('entries', value.get('roll', ''))))
    return str(value or '')


@lru_cache(maxsize=128)
def _adventure_tables(source):
    data_path = _data_path()
    index_path = data_path / 'adventures.json'
    if not index_path.exists():
        return []
    metadata = next((item for item in json.loads(index_path.read_text(encoding='utf-8')).get('adventure', [])
                     if str(item.get('source', '')).casefold() == source.casefold()), None)
    if not metadata:
        return []
    canonical_source = metadata['source']
    path = data_path / 'adventure' / f"adventure-{metadata['id'].lower()}.json"
    if not path.exists():
        return []
    found = []

    def visit(value):
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if not isinstance(value, dict):
            return
        caption = str(value.get('caption') or value.get('name') or '')
        rows = value.get('rows')
        if value.get('type') == 'table' and isinstance(rows, list) and 'encounter' in caption.casefold():
            entries = []
            for row in rows:
                cells = row.get('row', row) if isinstance(row, dict) else row
                if not isinstance(cells, list):
                    cells = [cells]
                entries.append({'result': ' · '.join(filter(None, (_table_cell_text(cell) for cell in cells)))})
            if entries:
                found.append({'id': f'adv:{canonical_source}:{len(found)}', 'name': caption, 'source': canonical_source,
                              'page': value.get('page'), 'min_level': None, 'max_level': None,
                              'dice': None, 'entries': entries})
        for child in value.values():
            visit(child)

    visit(json.loads(path.read_text(encoding='utf-8')))
    return found


def _available_tables(allowed_sources):
    allowed = {value.casefold() for value in allowed_sources}
    result = [table for table in _tables() if table['source'].casefold() in allowed]
    system_sources = {'xge', 'dmg', 'xdmg'}
    for source in allowed_sources:
        if source.casefold() not in system_sources:
            result.extend(_adventure_tables(source))
    return result


def available_presets(allowed_sources):
    summaries = [{key: value for key, value in table.items() if key != 'entries'} | {'entry_count': len(table['entries'])}
                 for table in _available_tables(allowed_sources)]
    return sorted(summaries, key=lambda item: (item['source'].casefold(), item['name'].casefold(), item.get('min_level') or 0))


def _roll(expression):
    text = expression.replace(' ', '').lower()
    match = re.fullmatch(r'(\d*)d(\d+)([+-]\d+)?', text)
    if not match:
        return int(text) if text.isdigit() else 1
    count, sides, modifier = int(match.group(1) or 1), int(match.group(2)), int(match.group(3) or 0)
    return max(1, sum(randbelow(sides) + 1 for _ in range(min(count, 100))) + modifier)


def _plain_text(value):
    text = re.sub(r'\{@dice\s+([^}]+)}', r'\1', value)
    text = CREATURE_TAG.sub(lambda match: match.group(3) or match.group(1), text)
    return re.sub(r'\{@[^ ]+\s+([^}|]+)(?:\|[^}]*)?}', r'\1', text)


def roll_preset(preset_id, creature_lookup):
    if preset_id.startswith('adv:'):
        parts = preset_id.split(':', 2)
        candidates = _adventure_tables(parts[1]) if len(parts) == 3 else []
    else:
        candidates = _tables()
    table = next((item for item in candidates if item['id'] == preset_id), None)
    if not table:
        raise ValueError('That random encounter table is not available.')
    row = choice(table['entries'])
    result = str(row.get('result') or '')
    participants = []
    for match in CREATURE_TAG.finditer(result):
        prefix = result[:match.start()]
        amount_match = DICE_BEFORE_CREATURE.search(prefix)
        quantity = _roll((amount_match.group(1) or amount_match.group(2))) if amount_match else 1
        source = match.group(2) or 'MM'
        creature = creature_lookup(match.group(1), source)
        if creature:
            participants.append({**creature, 'quantity': quantity, 'source': 'creatures', 'disposition': 'Hostile',
                                 'initiative_group': 'individual'})
    return {
        'name': f"{table['name']} — Random Result", 'source': table['source'],
        'environment': table['name'], 'notes': _plain_text(result), 'participants': participants,
    }
