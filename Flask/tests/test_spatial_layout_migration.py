import importlib.util
from pathlib import Path
import unittest

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


class SpatialLayoutMigrationTests(unittest.TestCase):
    def test_layout_upgrade_and_downgrade(self):
        path = Path(__file__).parents[1] / 'migrations/versions/4e8f0a2b3c5d_spatial_graph_layout.py'
        spec = importlib.util.spec_from_file_location('spatial_layout_migration', path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = create_engine('sqlite://')
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE campaign (id INTEGER PRIMARY KEY)'))
            connection.execute(text('CREATE TABLE world_atlas_location (id INTEGER PRIMARY KEY)'))
            context = MigrationContext.configure(connection)
            migration.op = Operations(context)
            migration.upgrade()
            self.assertIn('spatial_graph_layout', inspect(connection).get_table_names())
            migration.downgrade()
            self.assertNotIn('spatial_graph_layout', inspect(connection).get_table_names())


if __name__ == '__main__':
    unittest.main()
