import json
import math
import re


XP_LEVELS = (
    (355000, 20), (305000, 19), (265000, 18), (225000, 17), (195000, 16),
    (165000, 15), (140000, 14), (120000, 13), (100000, 12), (85000, 11),
    (64000, 10), (48000, 9), (34000, 8), (23000, 7), (14000, 6),
    (6500, 5), (2700, 4), (900, 3), (300, 2), (0, 1),
)

FULL_CASTERS = {'bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'}
HALF_CASTERS = {'artificer', 'paladin', 'ranger'}


def character_level(character):
    xp = max(0, int(getattr(character, 'ExperiencePoints', 0) or 0))
    return next(level for threshold, level in XP_LEVELS if xp >= threshold)


def _normal(value):
    return re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()).strip()


def _character_classes(character):
    raw = getattr(character, 'Class', '') or ''
    return {_normal(value) for value in re.split(r'[,/&+]', raw) if _normal(value)}


def _feat_records(character):
    raw = getattr(character, 'Feats', None)
    if not raw:
        return []
    try:
        values = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        values = [raw]
    if not isinstance(values, list):
        values = [values]
    records = []
    for value in values:
        if isinstance(value, dict):
            name = value.get('name') or value.get('title') or value.get('id') or ''
            description = value.get('description') or value.get('desc') or ''
        else:
            name, description = value, ''
        records.append((_normal(name), _normal(description)))
    return records


def _max_class_spell_level(class_name, level):
    if class_name in FULL_CASTERS:
        return min(9, math.ceil(level / 2))
    if class_name == 'artificer':
        return min(5, math.ceil(level / 2))
    if class_name in {'paladin', 'ranger'}:
        return min(5, level // 2)
    return -1


def _feat_allows_spell(feat_name, feat_description, spell, level):
    spell_name = _normal(getattr(spell, 'name', ''))
    spell_level = int(getattr(spell, 'level', 0) or 0)
    school = _normal(getattr(spell, 'school', ''))
    classes = {_normal(value) for value in (getattr(spell, 'classes', '') or '').split(',')}
    ritual = bool(getattr(spell, 'ritual', False))
    attacks = getattr(spell, 'spell_attacks', None) or []

    # Recorded feat descriptions often retain the exact spell choice or grant.
    # Require grant language so examples in ordinary class-feature prose do not qualify.
    if spell_name and spell_name in feat_description:
        grant_prefix = feat_description[:feat_description.index(spell_name)][-80:]
        if any(phrase in grant_prefix for phrase in ('learn ', 'can cast ', 'know ', 'gain ')):
            return True
    if 'magic initiate' in feat_name:
        return spell_level in {0, 1}
    if 'artificer initiate' in feat_name:
        return spell_level in {0, 1} and 'artificer' in classes
    if 'fey touched' in feat_name or 'fey touched' in feat_name.replace('-', ' '):
        return spell_name == 'misty step' or (spell_level == 1 and school in {'divination', 'enchantment'})
    if 'shadow touched' in feat_name or 'shadow touched' in feat_name.replace('-', ' '):
        return spell_name == 'invisibility' or (spell_level == 1 and school in {'illusion', 'necromancy'})
    if 'ritual caster' in feat_name:
        return ritual and spell_level <= max(1, math.ceil(level / 2))
    if 'spell sniper' in feat_name:
        return spell_level == 0 and bool(attacks)
    if 'strixhaven initiate' in feat_name:
        return spell_level in {0, 1}
    if 'aberrant dragonmark' in feat_name:
        return spell_level in {0, 1} and 'sorcerer' in classes

    named_grants = {
        'drow high magic': {'dancing lights', 'detect magic', 'levitate'},
        'wood elf magic': {'druidcraft', 'longstrider', 'pass without trace'},
        'telepathic': {'detect thoughts'},
        'telekinetic': {'mage hand'},
        'gift of the metallic dragon': {'cure wounds'},
    }
    return any(key in feat_name and spell_name in names for key, names in named_grants.items())


def spell_eligibility(character, spell):
    """Return whether a character may learn a spell and a user-facing reason."""
    spell_level = int(getattr(spell, 'level', 0) or 0)
    spell_classes = {_normal(value) for value in (getattr(spell, 'classes', '') or '').split(',') if _normal(value)}
    classes = _character_classes(character)
    level = character_level(character)

    matching_classes = sorted(classes & spell_classes)
    for class_name in matching_classes:
        if spell_level <= _max_class_spell_level(class_name, level):
            return {'eligible': True, 'reason': f'Available to your {class_name.title()} class', 'source': 'class'}

    for feat_name, feat_description in _feat_records(character):
        if _feat_allows_spell(feat_name, feat_description, spell, level):
            return {'eligible': True, 'reason': f'Available through {feat_name.title()}', 'source': 'feat'}

    if matching_classes:
        return {'eligible': False, 'reason': 'This spell is beyond your current spell level', 'source': None}
    return {'eligible': False, 'reason': 'This spell is a mystery to you', 'source': None}
