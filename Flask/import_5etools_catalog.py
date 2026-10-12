#!/usr/bin/env python3
"""Idempotently load bestiary and adventure JSON into the shared catalog.

Run `python import_5etools_catalog.py --preview` before `--commit`.
Apply Flask migrations and back up PostgreSQL before committing.
"""
import argparse
from pathlib import Path

from fiveetools_catalog import catalog_rows


def upsert_rows(session, model, rows, key_columns, batch_size=100):
    from sqlalchemy.dialects.postgresql import insert
    for offset in range(0, len(rows), batch_size):
        batch = rows[offset:offset + batch_size]
        statement = insert(model).values(batch)
        values = {column: statement.excluded[column] for column in batch[0] if column not in key_columns}
        session.execute(statement.on_conflict_do_update(index_elements=key_columns, set_=values))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path('/5etools-src/data') if Path('/5etools-src/data').is_dir() else Path(__file__).resolve().parents[1] / '5etools-src/data')
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument('--preview', action='store_true')
    operation.add_argument('--commit', action='store_true')
    args = parser.parse_args()
    creatures, adventures = catalog_rows(args.data_dir)
    print(f'{len(creatures)} creatures ({sum(not row["is_adventure"] for row in creatures)} general), {len(adventures)} adventures')
    if args.preview:
        return
    from app import app, db, CreatureCatalog, AdventureCatalog
    with app.app_context():
        try:
            upsert_rows(db.session, AdventureCatalog, adventures, ['source'])
            upsert_rows(db.session, CreatureCatalog, creatures, ['source', 'name'])
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
    print('Catalog committed.')


if __name__ == '__main__':
    main()
