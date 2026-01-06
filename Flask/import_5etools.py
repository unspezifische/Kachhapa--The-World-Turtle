#!/usr/bin/env python3
"""
One-time importer for 5etools JSON -> GameElement (D&D 5e)

Usage examples:
  # Dry-run preview
  ./scripts/import_5etools_one_time.py --preview

  # Commit, upsert existing rows and commit in batches of 100
  ./scripts/import_5etools_one_time.py --commit --upsert --batch-size 100

This script is intentionally hardcoded for the repo structure at:
  5etools-src/data/
  - class/ (many files)
  - races.json
  - feats.json
  - backgrounds.json

Safety:
  - Always run with --preview first to verify counts and examples.
  - Back up DB before running with --commit (pg_dump).

"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from sqlalchemy import func

# Import the Flask app and models
# The project exposes 'app', 'db', and 'GameElement' in Flask/app.py
try:
    from Flask.app import app, db, GameElement
except Exception as e:
    # Support running this file when executed from inside the Flask container where
    # the repository is mounted into /app (so app.py is top-level). Fall back to
    # importing directly from the top-level app module if available.
    try:
        from app import app, db, GameElement
    except Exception:
        print("Error importing Flask app or DB models:", e)
        print("Run this script from the repository root or ensure the repo root is on PYTHONPATH.")
        print("Examples:")
        print("  # from host (repo root): python Flask/import_5etools.py --preview")
        print("  # inside container when /app contains the Flask package: cd /app && python import_5etools.py --preview")
        raise

ROOT = Path(__file__).resolve().parents[1]
# Default candidate data directories (search order)
DEFAULT_DATA_DIRS = [
    ROOT / "5etools" / "data",
    ROOT / "5etools-src" / "data",
    ROOT / "5etools" ,
    ROOT / "5etools-src",
    Path("/5etools-src") / "data",  # Docker mount location
    Path("/5etools-src"),            # Docker mount location
    Path("/var/www/5etools") ,
    Path("/var/www/5etools") / "data",
]

# Mapping heuristics: tokens to high-level setting names
SOURCE_SETTING_MAP = {
    'scag': 'Sword Coast',
    'sword coast': 'Sword Coast',
    'eberron': 'Eberron',
    'ggtr': 'Ravenloft',
    'ravenloft': 'Ravenloft',
    'ravnica': 'Ravnica',
    'ggr': 'Ravnica',
    'faerun': 'Faerun',
}

# Will be set during argument parsing based on --data-dir or the defaults
DATA_DIR = None
CLASS_DIR = None

# Helpers
COMMON_NAME_KEYS = ["name", "Name", "shortName", "short_name", "fullname", "displayName"]


def safe_load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def iter_class_files(directory: Path, skip_fluff: bool = True) -> Iterable[Tuple[str, Any, str]]:
    """Yield (basename, data, source_filename) for class files."""
    if not directory.exists():
        return
    for p in sorted(directory.glob("*.json")):
        name = p.stem
        # Skip fluff files
        if skip_fluff and name.startswith("fluff-"):
            continue
        # Ignore index or foundry metadata files
        if name.lower().startswith('index') or name.lower().startswith('foundry'):
            print(f"Skipping class file (index/foundry): {p.name}")
            continue
        try:
            data = safe_load_json(p)
        except Exception as e:
            print(f"Warning: failed to load {p}: {e}")
            continue
        # If the filename begins with 'class-' or 'class_', strip that prefix for a nicer fallback name
        if name.startswith('class-'):
            name = name[len('class-'):]
        elif name.startswith('class_'):
            name = name[len('class_'):]
        yield (name, data, p.name)


def iter_items_from_list_file(path: Path, key_candidates: List[str] = None) -> Iterable[Tuple[str, Any, str]]:
    """Generic iterator for files like races.json, feats.json, backgrounds.json.
    Returns tuples (derived_name, element_data, source_filename).
    """
    if not path.exists():
        return
    data = safe_load_json(path)
    # Heuristics for structure
    items = None
    if isinstance(data, dict):
        for k in (key_candidates or ["races", "race", "feats", "feat", "backgrounds", "background", "items"]):
            if k in data and isinstance(data[k], list):
                items = data[k]
                break
        if items is None:
            # Some files are themselves a list stored in a dict under multiple keys or top-level list
            # Try values
            for v in data.values():
                if isinstance(v, list):
                    items = v
                    break
    elif isinstance(data, list):
        items = data

    if items is None:
        # Not a recognized structure; fallback to using the whole dict as one item
        yield (path.stem, data, path.name)
        return

    for entry in items:
        # Attempt to get a name
        name = get_name_from_entry(entry) or None
        # Fallback to a derived name
        if not name:
            # try to use entry.get('id') or slug fields, else skip
            name = entry.get('id') if isinstance(entry, dict) else None
        if not name:
            # If still no name, skip with a warning
            print(f"Skipping entry without name in {path}")
            continue
        yield (name, entry, path.name)


def load_fluff_map(data_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Load fluff files (fluff-*.json) and return a mapping by element type to name->entry."""
    fluff = {}
    for p in sorted(data_dir.glob('fluff*.json')):
        try:
            data = safe_load_json(p)
        except Exception as e:
            print(f"Warning: failed to load fluff file {p}: {e}")
            continue

        # Heuristics: if the fluff file contains a dict with a list under 'races' or 'backgrounds', use that
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list):
                    key = k.lower()
                    if key not in fluff:
                        fluff[key] = {}
                    for entry in v:
                        n = get_name_from_entry(entry) or entry.get('raceName') or entry.get('name')
                        if n:
                            fluff[key][normalize_name(str(n))] = entry
        elif isinstance(data, list):
            # Unknown fluff list; try to infer names
            for entry in data:
                n = get_name_from_entry(entry) or entry.get('raceName') or entry.get('name')
                if n:
                    # default to 'races' key if not sure
                    key = 'races'
                    if key not in fluff:
                        fluff[key] = {}
                    fluff[key][normalize_name(str(n))] = entry

    return fluff


def infer_setting_from_entry(entry: Any, module_name: str = '') -> str:
    """Try to infer a setting (Faerun, Eberron, Ravnica, etc) from the entry data or module name."""
    token_src = ''
    if isinstance(entry, dict):
        # look for common source fields
        for k in ('source', 'book', 'sourcebook', 'from'):
            v = entry.get(k)
            if isinstance(v, str) and v.strip():
                token_src += ' ' + v.lower()
            elif isinstance(v, list):
                token_src += ' ' + ' '.join([str(x).lower() for x in v if isinstance(x, str)])
    token_src += ' ' + str(module_name).lower()

    for token, setting in SOURCE_SETTING_MAP.items():
        if token in token_src:
            return setting
    return None


def get_name_from_entry(entry: Any) -> str:
    if not isinstance(entry, dict):
        return None
    for k in COMMON_NAME_KEYS:
        if k in entry and entry[k]:
            return str(entry[k]).strip()
    # Some entries use 'shortName' nested in a 'name' object or similar
    # Fallbacks
    if 'definition' in entry and isinstance(entry['definition'], dict):
        for k in COMMON_NAME_KEYS:
            if k in entry['definition']:
                return str(entry['definition'][k]).strip()
    return None


def normalize_name(s: str) -> str:
    return s.strip()


def dry_run_summary(rows: List[Dict]) -> None:
    counts = {}
    for r in rows:
        counts[r['element_type']] = counts.get(r['element_type'], 0) + 1
    print("Preview summary:")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print("Sample entries:")
    for r in rows[:20]:
        print(f"  {r['element_type']}: {r['name']}")


def find_existing_by_name(name: str) -> GameElement:
    # Case-insensitive search to avoid duplicates that differ only by case
    return GameElement.query.filter(func.lower(GameElement.name) == name.lower()).first()


def main(argv: List[str]):
    parser = argparse.ArgumentParser(description="Import 5etools data into GameElement (one-time)")
    parser.add_argument("--data-dir", type=str, default=None,
                        help="Path to 5etools data directory or 5etools root (e.g. /var/www/5etools). If omitted, the script will search common locations.")
    parser.add_argument("--preview", action="store_true", help="Do not write to DB; just show counts and samples")
    parser.add_argument("--commit", action="store_true", help="Write changes to DB")
    parser.add_argument("--upsert", action="store_true", help="Update existing GameElement rows if names match")
    parser.add_argument("--skip-fluff", action="store_true", default=True, help="Skip files beginning with fluff-")
    parser.add_argument("--batch-size", type=int, default=200, help="Commit every N inserts")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    # Resolve and validate the data directory (accept either the 5etools root or the data subdir)
    resolved = None
    if args.data_dir:
        candidate = Path(args.data_dir)
        if (candidate / "data").exists():
            resolved = (candidate / "data").resolve()
        elif (candidate / "class").exists() or (candidate / "races.json").exists():
            resolved = candidate.resolve()
        elif candidate.exists() and any(candidate.glob("*.json")):
            resolved = candidate.resolve()
        else:
            print(f"Data directory not found or missing expected files: {candidate}")
            return 1
    else:
        # try defaults in order
        for p in DEFAULT_DATA_DIRS:
            try_p = p
            if (try_p / "data").exists():
                resolved = (try_p / "data").resolve()
                break
            if (try_p / "class").exists() or (try_p / "races.json").exists():
                resolved = try_p.resolve()
                break

    if resolved is None:
        print("Could not find 5etools data directory. Tried:")
        for p in DEFAULT_DATA_DIRS:
            print(f"  - {p}")
        print("Or pass --data-dir /path/to/5etools or /path/to/5etools/data")
        return 1

    global DATA_DIR, CLASS_DIR
    DATA_DIR = resolved
    CLASS_DIR = DATA_DIR / "class"
    print(f"Using data directory: {DATA_DIR}")

    if not args.preview and not args.commit:
        print("No action specified: run with --preview to preview changes, then --commit to persist.")
        return 1

    rows = []

    # 1) Classes (per-file)
    for basename, data, src in iter_class_files(CLASS_DIR, skip_fluff=args.skip_fluff):
        # Many class files are either an object or {"class": { ... }}
        entry = data
        if isinstance(data, dict) and len(data) == 1 and next(iter(data)).lower() == 'class':
            entry = next(iter(data.values()))
        name = get_name_from_entry(entry) or basename
        rows.append({
            'system': 'D&D 5e',
            'element_type': 'class',
            'module': src,
            'name': normalize_name(name),
            'data': entry,
        })

    # 2) Races
    races_file = DATA_DIR / 'races.json'
    for name, entry, src in iter_items_from_list_file(races_file, key_candidates=['races', 'race']):
        rows.append({
            'system': 'D&D 5e',
            'element_type': 'race',
            'module': src,
            'name': normalize_name(name),
            'data': entry,
        })

    # 3) Feats
    feats_file = DATA_DIR / 'feats.json'
    for name, entry, src in iter_items_from_list_file(feats_file, key_candidates=['feats', 'feat']):
        rows.append({
            'system': 'D&D 5e',
            'element_type': 'feat',
            'module': src,
            'name': normalize_name(name),
            'data': entry,
        })

    # 4) Backgrounds
    backgrounds_file = DATA_DIR / 'backgrounds.json'
    for name, entry, src in iter_items_from_list_file(backgrounds_file, key_candidates=['backgrounds', 'background']):
        rows.append({
            'system': 'D&D 5e',
            'element_type': 'character_background',
            'module': src,
            'name': normalize_name(name),
            'data': entry,
        })

    # Load fluff files (if any) and infer settings/hasFluff per entry
    fluff_map = load_fluff_map(DATA_DIR)
    for r in rows:
        # Infer a setting where possible (SCAG -> Sword Coast, Eberron -> Eberron, etc.)
        setting = infer_setting_from_entry(r.get('data', {}), r.get('module') or '')
        if setting:
            r['setting'] = setting

        # Detect fluff by name or by hasFluff flag
        name_key = normalize_name(r['name']).lower()
        etype = r['element_type']
        # map element_type to fluff keys heuristically
        fluff_keys = []
        if etype == 'race':
            fluff_keys = ['races', 'race']
        elif etype == 'character_background':
            fluff_keys = ['backgrounds', 'background']
        elif etype == 'feat':
            fluff_keys = ['feats', 'feat']

        found_fluff = None
        for fk in fluff_keys:
            if fk in fluff_map and name_key in fluff_map[fk]:
                found_fluff = fluff_map[fk][name_key]
                break

        # Also respect explicit hasFluff on the source entry
        if isinstance(r.get('data'), dict) and r['data'].get('hasFluff'):
            r['hasFluff'] = True
        if found_fluff:
            r['hasFluff'] = True
            # attach fluff content for later use/display
            r['data']['fluff'] = found_fluff

    # Post-process duplicates within each element_type: if multiple entries share the same name,
    # append a source label (from entry['source'] or the source filename) so they are distinguishable.
    from collections import defaultdict
    grouped = defaultdict(list)
    for idx, r in enumerate(rows):
        key = (r['element_type'], r['name'].lower())
        grouped[key].append(idx)

    def extract_source_label(entry, module_name):
        # Prefer an explicit 'source' field from the entry if present
        if isinstance(entry, dict):
            src = entry.get('source')
            if isinstance(src, str) and src.strip():
                return src.strip()
            # Some entries embed a source object or use other keys; try common fallbacks
            for k in ('book', 'sourcebook', 'from'):
                v = entry.get(k)
                if isinstance(v, str) and v.strip():
                    return v.strip()
        # Fallback: derive from module filename
        return Path(module_name).stem

    for key, idxs in grouped.items():
        if len(idxs) <= 1:
            continue
        # There are duplicates; append source labels to each duplicate's name
        for i in idxs:
            r = rows[i]
            label = extract_source_label(r['data'], r.get('module') or '')
            # Only append if label provides additional information
            if label:
                r['name'] = f"{r['name']} ({label})"

    if args.preview:
        dry_run_summary(rows)
        print('\nPreview mode: no changes written to DB')
        return 0

    # Commit logic
    print(f"Committing {len(rows)} rows to DB (batch size {args.batch_size}). Upsert={args.upsert}")

    from sqlalchemy import func

    committed = 0
    batch = []

    with app.app_context():
        for r in rows:
            name = r['name']
            existing = GameElement.query.filter(func.lower(GameElement.name) == name.lower()).first()
            if existing:
                if args.upsert:
                    existing.system = r['system']
                    existing.element_type = r['element_type']
                    existing.module = r.get('module')
                    existing.data = r['data']
                    # Preserve existing.setting if import did not infer one
                    if r.get('setting'):
                        existing.setting = r.get('setting')
                    db.session.add(existing)
                    batch.append(('update', existing))
                else:
                    print(f"Skipping existing: {name}")
                    continue
            else:
                ge = GameElement(
                    system=r['system'],
                    element_type=r['element_type'],
                    module=r.get('module'),
                    name=name,
                    data=r['data'],
                    setting=r.get('setting'),
                )
                db.session.add(ge)
                batch.append(('insert', ge))

            if len(batch) >= args.batch_size:
                try:
                    db.session.commit()
                    committed += len(batch)
                    print(f"Committed batch of {len(batch)} (total {committed})")
                    batch = []
                except Exception as e:
                    db.session.rollback()
                    print("Error committing batch:", e)
                    return 1

        # Final commit
        if batch:
            try:
                db.session.commit()
                committed += len(batch)
                print(f"Committed final batch of {len(batch)} (total {committed})")
            except Exception as e:
                db.session.rollback()
                print("Error committing final batch:", e)
                return 1

    print(f"Done: committed {committed} rows")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
