import importlib.util
import json
from pathlib import Path
import unittest

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


class SpatialMigrationTests(unittest.TestCase):
    def test_upgrade_backfills_without_changing_buildings_and_downgrades(self):
        path = Path(__file__).parents[1] / 'migrations/versions/3d7e9f1a2b4c_spatial_connections.py'
        spec = importlib.util.spec_from_file_location('spatial_migration', path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = create_engine('sqlite://')
        original = [{'id': 'tower', 'name': 'Kolat Towers', 'levels': [{'id': 'ground'}]}]
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE campaign (id INTEGER PRIMARY KEY)'))
            connection.execute(text('CREATE TABLE world_atlas_location ('
                                    'id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, buildings JSON NOT NULL)'))
            connection.execute(text('INSERT INTO campaign (id) VALUES (1)'))
            connection.execute(text('INSERT INTO world_atlas_location (id, campaign_id, buildings) '
                                    'VALUES (10, 1, :buildings)'), {'buildings': json.dumps(original)})
            context = MigrationContext.configure(connection)
            migration.op = Operations(context)
            migration.upgrade()
            row = connection.execute(text('SELECT id, building_id, space_type FROM spatial_space')).mappings().one()
            self.assertEqual(row['id'], migration._physical_id(1, 10, 'tower'))
            self.assertEqual((row['building_id'], row['space_type']), ('tower', 'physical'))
            stored = connection.execute(text('SELECT buildings FROM world_atlas_location WHERE id=10')).scalar_one()
            self.assertEqual(json.loads(stored), original)
            self.assertEqual({'spatial_space', 'spatial_endpoint', 'spatial_connection'}
                             - set(inspect(connection).get_table_names()), set())
            migration.downgrade()
            self.assertFalse({'spatial_space', 'spatial_endpoint', 'spatial_connection'}
                             & set(inspect(connection).get_table_names()))


if __name__ == '__main__':
    unittest.main()
