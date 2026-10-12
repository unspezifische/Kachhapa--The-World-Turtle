"""Parse the local 5etools bestiary and adventure datasets."""
import json
from pathlib import Path


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
    for path in sorted((data_dir / 'bestiary').glob('bestiary-*.json')):
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
            creature_rows.append({
                'source': source, 'name': name,
                'is_adventure': source.casefold() in adventure_sources,
                'is_named': bool(monster.get('isNpc') or monster.get('isNamedCreature')),
                'challenge': str(cr)[:50] if cr is not None else None,
                'ac': str(ac)[:80] if ac is not None else None,
                'hp': str(hp)[:80] if hp is not None else None,
                'dexterity': monster.get('dex') if isinstance(monster.get('dex'), int) else None,
                'data': monster,
            })
    return creature_rows, adventure_rows
