"""Parse the local 5etools bestiary, adventure, and spell datasets."""
import json
import re
from pathlib import Path


SCHOOLS = {
    'A': 'Abjuration', 'C': 'Conjuration', 'D': 'Divination',
    'E': 'Enchantment', 'V': 'Evocation', 'I': 'Illusion',
    'N': 'Necromancy', 'T': 'Transmutation',
}

SIZES = {'T': 'Tiny', 'S': 'Small', 'M': 'Medium', 'L': 'Large', 'H': 'Huge', 'G': 'Gargantuan'}
ALIGNMENTS = {'L': 'lawful', 'N': 'neutral', 'C': 'chaotic', 'G': 'good', 'E': 'evil', 'U': 'unaligned', 'A': 'any alignment'}


def _join_entry_text(value):
    """Flatten 5etools entry blocks to readable text without losing the raw JSON."""
    if isinstance(value, str):
        text = re.sub(r'\{@(?:damage|dice|scaledice|scaledamage) ([^}|]+)(?:\|[^}]*)?}', r'\1', value)
        text = re.sub(r'\{@(?:spell|condition|creature|item|sense|skill|action|status) ([^}|]+)(?:\|[^}]*)?}', r'\1', text)
        text = re.sub(r'\{@(?:dc|hit) ([^}]+)}', r'\1', text)
        text = re.sub(r'\{@(?:b|i|u|s|note) ([^}]+)}', r'\1', text)
        return re.sub(r'\{@[^ ]+ ([^}|]+)(?:\|[^}]*)?}', r'\1', text)
    if isinstance(value, list):
        return '\n\n'.join(filter(None, (_join_entry_text(item) for item in value)))
    if isinstance(value, dict):
        heading = value.get('name')
        body = _join_entry_text(value.get('entries', value.get('items', '')))
        return f'{heading}: {body}' if heading and body else body or str(heading or '')
    return ''


def _plain_list(value):
    if not value:
        return ''
    if not isinstance(value, list):
        value = [value]
    return ', '.join(filter(None, (_join_entry_text(item) if isinstance(item, (dict, list)) else str(item) for item in value)))


def creature_fluff_text(monster):
    """Return readable 5etools lore attached to an imported monster record."""
    fluff = (monster or {}).get('fluff') or {}
    return _join_entry_text(fluff.get('entries') or [])


def _creature_fluff_by_source(bestiary_dir):
    """Index companion fluff files by their stable 5etools source/name key."""
    result = {}
    for path in sorted(Path(bestiary_dir).glob('fluff-bestiary-*.json')):
        document = json.loads(path.read_text(encoding='utf-8'))
        for fluff in document.get('monsterFluff', []):
            source, name = fluff.get('source'), fluff.get('name')
            if source and name:
                result[(source.casefold(), name.casefold())] = fluff
    return result


def npc_fields_from_creature(monster, instance_name=None):
    """Convert a preserved 5etools monster record into editable NPC fields."""
    creature_type = monster.get('type', 'unknown')
    subtype = ''
    if isinstance(creature_type, dict):
        tags = creature_type.get('tags') or []
        subtype = ', '.join(str(tag.get('tag', tag)) if isinstance(tag, dict) else str(tag) for tag in tags)
        creature_type = creature_type.get('type', 'unknown')
    size = monster.get('size') or ['M']
    size = size[0] if isinstance(size, list) else size
    alignment = monster.get('alignment') or ['U']
    alignment = ' '.join(ALIGNMENTS.get(item, str(item)) for item in alignment if isinstance(item, str)) or 'unaligned'
    ac = monster.get('ac') or []
    ac = ac[0] if isinstance(ac, list) and ac else ac
    ac = ac.get('ac') if isinstance(ac, dict) else ac
    hp = monster.get('hp') or {}
    hp = hp.get('average', hp.get('special')) if isinstance(hp, dict) else hp
    speed = monster.get('speed') or {}
    speed = speed.get('walk', next((value for value in speed.values() if isinstance(value, int)), 0)) if isinstance(speed, dict) else speed
    cr = monster.get('cr')
    cr = cr.get('cr') if isinstance(cr, dict) else cr
    senses = list(monster.get('senses') or [])
    if monster.get('passive') is not None:
        senses.append(f'passive Perception {monster["passive"]}')
    result = {
        'name': instance_name if instance_name is not None else monster.get('name', ''),
        'description': f'Named {monster.get("name", "creature")} NPC.',
        'size': SIZES.get(size, str(size)), 'creature_type': str(creature_type), 'creature_subtype': subtype,
        'alignment': alignment, 'ac': str(ac or ''), 'hp': str(hp or ''), 'speed': int(speed or 0),
        'strength': monster.get('str', 10), 'dexterity': monster.get('dex', 10),
        'constitution': monster.get('con', 10), 'intelligence': monster.get('int', 10),
        'wisdom': monster.get('wis', 10), 'charisma': monster.get('cha', 10),
        'saving_throws': ', '.join(f'{key.upper()} {value}' for key, value in (monster.get('save') or {}).items()),
        'skills': ', '.join(f'{key.title()} {value}' for key, value in (monster.get('skill') or {}).items()),
        'immunities': _plain_list(monster.get('immune')), 'resistance': _plain_list(monster.get('resist')),
        'senses': ', '.join(senses), 'languages': _plain_list(monster.get('languages')),
        'challenge': str(cr or ''), 'traits': _join_entry_text(monster.get('trait') or []),
        'actions': _join_entry_text(monster.get('action') or []),
    }
    for key in ('saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages'):
        result[key] = result[key][:120]
    result['traits'] = result['traits'][:1000]
    result['actions'] = result['actions'][:1000]
    return result


def _amount(value, singular):
    amount = value.get('amount')
    unit = value.get('type', singular)
    if amount is None:
        return str(unit).replace('_', ' ')
    return f'{amount} {unit if amount == 1 else unit + "s"}'.replace('_', ' ')


def _casting_time(spell):
    values = []
    for item in spell.get('time') or []:
        label = f'{item.get("number", 1)} {str(item.get("unit", "action")).replace("_", " ")}'
        if item.get('number', 1) != 1:
            label += 's'
        if item.get('condition'):
            label += f', {item["condition"]}'
        values.append(label)
    return '; '.join(values) or 'Special'


def _spell_range(spell):
    value = spell.get('range') or {}
    range_type = value.get('type', 'special')
    distance = value.get('distance') or {}
    if range_type == 'point':
        distance_type = distance.get('type', 'special')
        if distance_type in {'self', 'touch', 'sight', 'unlimited', 'plane', 'special'}:
            return distance_type.title()
        return _amount(distance, distance_type).title()
    if range_type in {'radius', 'sphere', 'cone', 'line', 'cube', 'hemisphere', 'cylinder'}:
        return f'Self ({_amount(distance, "feet")} {range_type})'.title()
    return range_type.replace('_', ' ').title()


def _components(spell):
    components = spell.get('components') or {}
    values = [key.upper() for key in ('v', 's') if components.get(key)]
    material = components.get('m')
    if material:
        material_text = material if isinstance(material, str) else material.get('text', '')
        values.append(f'M ({material_text})' if material_text else 'M')
    return ', '.join(values) or 'None'


def _duration(spell):
    values = []
    for item in spell.get('duration') or []:
        duration_type = item.get('type', 'special')
        if duration_type == 'timed':
            label = _amount(item.get('duration') or {}, 'round')
        elif duration_type == 'permanent':
            label = 'Until ' + ', '.join(str(end).replace('_', ' ') for end in item.get('ends') or [])
        else:
            label = duration_type.replace('_', ' ')
        if item.get('concentration'):
            label = f'Concentration, up to {label}'
        values.append(label.capitalize())
    return '; '.join(values) or 'Special'


def spell_rows(data_dir):
    """Return normalized spell rows while retaining each complete 5etools record."""
    spell_dir = Path(data_dir) / 'spells'
    class_sources = json.loads((spell_dir / 'sources.json').read_text(encoding='utf-8'))
    rows = []
    for path in sorted(spell_dir.glob('spells-*.json')):
        for spell in json.loads(path.read_text(encoding='utf-8')).get('spell', []):
            source, name = spell.get('source'), spell.get('name')
            if not source or not name:
                continue
            source_info = class_sources.get(source, {}).get(name, {})
            classes = sorted({item.get('name') for key in ('class', 'classVariant')
                              for item in source_info.get(key, []) if item.get('name')})
            entries = [spell.get('entries') or []]
            if spell.get('entriesHigherLevel'):
                entries.append(spell['entriesHigherLevel'])
            duration = _duration(spell)
            rows.append({
                'source': source,
                'page': spell.get('page'),
                'name': name,
                'level': str(spell.get('level', 0)),
                'casting_time': _casting_time(spell),
                'range': _spell_range(spell),
                'components': _components(spell),
                'duration': duration,
                'description': _join_entry_text(entries),
                'classes': ','.join(classes),
                'school': SCHOOLS.get(spell.get('school'), spell.get('school', 'Unknown')),
                'damage_types': spell.get('damageInflict') or [],
                'conditions': spell.get('conditionInflict') or [],
                'saving_throws': spell.get('savingThrow') or [],
                'spell_attacks': spell.get('spellAttack') or [],
                'misc_tags': spell.get('miscTags') or [],
                'area_tags': spell.get('areaTags') or [],
                'ritual': bool((spell.get('meta') or {}).get('ritual')),
                'concentration': any(item.get('concentration') for item in spell.get('duration') or []),
                'data': {**spell, 'classes': classes},
            })
    return rows


def catalog_rows(data_dir):
    data_dir = Path(data_dir)
    adventures = json.loads((data_dir / 'adventures.json').read_text(encoding='utf-8'))['adventure']
    adventure_sources = {item['source'].casefold() for item in adventures}
    adventure_rows = []
    for item in adventures:
        source = item['source']
        path = data_dir / 'adventure' / f'adventure-{item["id"].lower()}.json'
        document = json.loads(path.read_text(encoding='utf-8'))
        adventure_rows.append({
            'source': source, 'name': item['name'],
            'metadata_json': item, 'content': document,
        })

    creature_rows = []
    bestiary_dir = data_dir / 'bestiary'
    fluff_by_source = _creature_fluff_by_source(bestiary_dir)
    for path in sorted(bestiary_dir.glob('bestiary-*.json')):
        for monster in json.loads(path.read_text(encoding='utf-8')).get('monster', []):
            source = monster.get('source')
            name = monster.get('name')
            if not source or not name:
                continue
            ac = monster.get('ac') or []
            ac = ac[0] if isinstance(ac, list) and ac else ac
            if isinstance(ac, dict):
                ac = ac.get('ac')
            hp = monster.get('hp') or {}
            hp = hp.get('average', hp.get('special')) if isinstance(hp, dict) else hp
            cr = monster.get('cr')
            if isinstance(cr, dict):
                cr = cr.get('cr')
            preserved_data = dict(monster)
            fluff = fluff_by_source.get((source.casefold(), name.casefold()))
            if fluff:
                preserved_data['fluff'] = fluff
            creature_rows.append({
                'source': source, 'name': name,
                'is_adventure': source.casefold() in adventure_sources,
                'is_named': bool(monster.get('isNpc') or monster.get('isNamedCreature')),
                'challenge': str(cr)[:50] if cr is not None else None,
                'ac': str(ac)[:80] if ac is not None else None,
                'hp': str(hp)[:80] if hp is not None else None,
                'dexterity': monster.get('dex') if isinstance(monster.get('dex'), int) else None,
                'data': preserved_data,
            })
    return creature_rows, adventure_rows
