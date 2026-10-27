import importlib.util
from pathlib import Path
import unittest

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / 'migrations/versions/d93f6a8b2c10_repair_sound_upload_dedup_schema.py'
)


class SoundUploadRepairMigrationTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            'sound_upload_repair_migration', MIGRATION_PATH
        )
        self.migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.migration)
        self.engine = create_engine('sqlite://')
        self.addCleanup(self.engine.dispose)

    def test_upgrade_repairs_partial_schema_and_is_idempotent(self):
        with self.engine.begin() as connection:
            connection.execute(text(
                'CREATE TABLE sound_asset (id INTEGER PRIMARY KEY)'
            ))
            connection.execute(text(
                'CREATE TABLE sound_upload_job (id VARCHAR(32) PRIMARY KEY)'
            ))

            context = MigrationContext.configure(connection)
            self.migration.op = Operations(context)
            self.migration.upgrade()
            self.migration.upgrade()

            reflection = inspect(connection)
            asset_columns = {
                column['name']
                for column in reflection.get_columns('sound_asset')
            }
            job_columns = {
                column['name']
                for column in reflection.get_columns('sound_upload_job')
            }
            asset_indexes = {
                index['name']: index
                for index in reflection.get_indexes('sound_asset')
            }
            job_indexes = {
                index['name']: index
                for index in reflection.get_indexes('sound_upload_job')
            }

            self.assertTrue(
                {'original_byte_size', 'content_sha256'} <= asset_columns
            )
            self.assertIn('content_sha256', job_columns)
            self.assertTrue(
                asset_indexes['ix_sound_asset_content_sha256']['unique']
            )
            self.assertIn(
                'ix_sound_upload_job_content_sha256', job_indexes
            )

            self.migration.downgrade()
            self.assertIn(
                'content_sha256',
                {
                    column['name']
                    for column in inspect(connection).get_columns('sound_asset')
                },
            )


if __name__ == '__main__':
    unittest.main()
