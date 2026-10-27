"""Exercise both deployed histories, including their overlapping schema work."""
import io
from pathlib import Path
import unittest
from unittest import mock

from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects import postgresql


MIGRATIONS = Path(__file__).parents[1] / 'migrations'
HEAD = 'd93f6a8b2c10'
JSON_COLUMNS = {
    'spatial_connection': ('transition_effect', 'metadata'),
    'spatial_endpoint': ('local_position', 'local_orientation', 'geometry_reference', 'metadata'),
    'spatial_graph_layout': ('layout',),
    'spatial_space': ('coordinate_system', 'environment_settings', 'metadata', 'independent_blueprint'),
}


class ProductionDevMergeMigrationTests(unittest.TestCase):
    def setUp(self):
        self.scripts = ScriptDirectory(str(MIGRATIONS))
        self.engine = create_engine('sqlite://')
        self.addCleanup(self.engine.dispose)

    def fixture(self, connection):
        # Only the pre-existing schema touched by the overlapping revisions.
        for table in ('calendar', 'calendar_event', 'item', 'loot_box', 'npc', 'page', 'world_atlas_location'):
            extra = ', weather JSON' if table == 'world_atlas_location' else ''
            connection.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, source VARCHAR(80) NOT NULL{extra})'))
            connection.execute(text(f"INSERT INTO {table} (id, source) VALUES (1, 'keep my source')"))
        connection.execute(text('CREATE TABLE campaign (id INTEGER PRIMARY KEY, atlas_image_url TEXT, '
                                'atlas_tile_url_template TEXT, atlas_tile_zoom INTEGER NOT NULL DEFAULT 2, atlas_environment JSON)'))
        connection.execute(text("INSERT INTO campaign VALUES (1, 'keep my atlas', NULL, 7, '{}')"))
        connection.execute(text('CREATE TABLE "user" (id INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE campaign_module_installation (campaign_id INTEGER, installed_at DATETIME NOT NULL)'))
        connection.execute(text('CREATE TABLE map_media_asset (id INTEGER PRIMARY KEY, campaign_id INTEGER)'))
        connection.execute(text('INSERT INTO map_media_asset VALUES (1, NULL)'))
        connection.execute(text('CREATE TABLE sound_asset ('
                                'id INTEGER PRIMARY KEY, original_byte_size BIGINT, content_sha256 VARCHAR(64))'))
        connection.execute(text('CREATE UNIQUE INDEX ix_sound_asset_content_sha256 '
                                'ON sound_asset (content_sha256)'))
        connection.execute(text('CREATE TABLE sound_upload_job ('
                                'id VARCHAR(32) PRIMARY KEY, content_sha256 VARCHAR(64))'))
        connection.execute(text('CREATE INDEX ix_sound_upload_job_content_sha256 '
                                'ON sound_upload_job (content_sha256)'))
        connection.execute(text('CREATE TABLE lamplighter_route (id INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE street_lamp (route_id INTEGER REFERENCES lamplighter_route(id))'))
        for table in ('creature_catalog', 'spells'):
            connection.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)'))
        for table, names in JSON_COLUMNS.items():
            columns = ', '.join('"' + name + '" JSON' for name in names)
            connection.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, {columns})'))
            quoted = ', '.join('"' + name + '"' for name in names)
            values = ', '.join("'{\"keep\": 1}'" for _ in names)
            connection.execute(text(f'INSERT INTO {table} (id, {quoted}) VALUES (1, {values})'))

    def test_single_head_and_plans_from_production_and_dev(self):
        self.assertEqual(self.scripts.get_heads(), [HEAD])
        production = [step.revision.revision for step in self.scripts._upgrade_revs('head', ('ee95fb2bceed',))]
        self.assertIn('8ad06eea5e93', production)
        self.assertIn('823c4e6f7091', production)
        self.assertNotIn('ee95fb2bceed', production)
        self.assertNotIn('06404e99d96f', production)
        dev = [step.revision.revision for step in self.scripts._upgrade_revs('head', ('934d5f7081a2',))]
        self.assertEqual(dev, [
            'f8adfc8f82df', 'ee95fb2bceed', 'b15d7e9f3a21',
            'a45e607182b3', 'c18f4a7d2e90', HEAD,
        ])
        self.assertEqual(self.scripts._upgrade_revs('head', (HEAD,)), [])

    def test_production_applies_overlapping_dev_revisions_without_duplicate_columns_or_data_loss(self):
        with self.engine.begin() as connection:
            self.fixture(connection)
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                for revision in ('8ad06eea5e93', '575b3838f77c', '65e46028c5d2', '9f26f6c8bb14'):
                    self.scripts.get_revision(revision).module.upgrade()
                    self.scripts.get_revision(revision).module.upgrade()
            self.assertEqual(connection.execute(text('SELECT atlas_image_url, atlas_tile_zoom FROM campaign')).one(),
                             ('keep my atlas', 7))
            self.assertEqual(connection.execute(text('SELECT source FROM npc')).scalar_one(), 'keep my source')
            self.assertIsNone(connection.execute(text('SELECT campaign_id FROM map_media_asset')).scalar_one())

    def test_missing_columns_are_added_and_source_values_backfilled(self):
        with self.engine.begin() as connection:
            self.fixture(connection)
            connection.execute(text('ALTER TABLE npc DROP COLUMN source'))
            connection.execute(text('ALTER TABLE campaign DROP COLUMN atlas_image_url'))
            connection.execute(text('ALTER TABLE world_atlas_location DROP COLUMN weather'))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                for revision in ('8ad06eea5e93', '575b3838f77c', '65e46028c5d2', '9f26f6c8bb14'):
                    self.scripts.get_revision(revision).module.upgrade()
            self.assertEqual(connection.execute(text('SELECT source FROM npc')).scalar_one(), 'Unknown')
            self.assertIn('atlas_image_url', {column['name'] for column in inspect(connection).get_columns('campaign')})
            self.assertIn('activeWeather', connection.execute(text('SELECT weather FROM world_atlas_location')).scalar_one())

    def reflected_schema(self, connection, jsonb):
        reflection = inspect(connection)
        columns = {table: reflection.get_columns(table) for table in reflection.get_table_names()}
        if jsonb:
            for table, names in JSON_COLUMNS.items():
                for column in columns[table]:
                    if column['name'] in names:
                        column['type'] = postgresql.JSONB()
        inspector = mock.Mock()
        inspector.get_table_names.return_value = list(columns)
        inspector.get_columns.side_effect = lambda table: columns[table]
        inspector.get_indexes.side_effect = reflection.get_indexes
        inspector.get_foreign_keys.side_effect = reflection.get_foreign_keys
        return inspector

    def test_dev_can_apply_production_revision_when_jsonb_and_atlas_already_exist(self):
        with self.engine.begin() as connection:
            self.fixture(connection)
            inspector = self.reflected_schema(connection, jsonb=True)
            module = self.scripts.get_revision('ee95fb2bceed').module
            context = MigrationContext.configure(connection)
            with mock.patch.object(module.sa, 'inspect', return_value=inspector), Operations.context(context):
                module.upgrade()
                module.upgrade()
            self.assertEqual(connection.execute(text('SELECT atlas_tile_zoom FROM campaign')).scalar_one(), 7)
            self.assertEqual(connection.execute(text('SELECT metadata FROM spatial_space')).scalar_one(), '{"keep": 1}')

    def test_postgresql_upgrade_sql_from_both_servers_avoids_duplicate_additions(self):
        with self.engine.begin() as connection:
            self.fixture(connection)
            for revisions, jsonb in ((('ee95fb2bceed',), True), (('934d5f7081a2',), False)):
                with self.subTest(revisions=revisions):
                    inspector = self.reflected_schema(connection, jsonb)
                    output = io.StringIO()
                    context = MigrationContext.configure(url='postgresql://', opts={
                        'as_sql': True, 'output_buffer': output, 'starting_rev': revisions,
                        'script': self.scripts,
                        'fn': lambda heads, context: self.scripts._upgrade_revs('head', heads),
                    })
                    # Revision modules share the SQLAlchemy module; patch reflection
                    # while exercising real Alembic DDL and version bookkeeping.
                    with mock.patch('sqlalchemy.inspect', return_value=inspector), Operations.context(context):
                        context.run_migrations()
                    sql = output.getvalue()
                    self.assertIn(HEAD, sql)
                    self.assertNotIn('ADD COLUMN atlas_', sql)
                    self.assertNotIn('ADD COLUMN weather', sql)
                    self.assertNotIn('ADD COLUMN source', sql)
                    if jsonb:
                        self.assertIn('CREATE TABLE npc_voice_line', sql)
                    else:
                        self.assertIn('USING "metadata"::jsonb', sql)

    def test_final_merge_consolidates_both_version_rows_without_touching_data(self):
        with self.engine.begin() as connection:
            self.fixture(connection)
            connection.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
            connection.execute(text('INSERT INTO alembic_version VALUES (:revision)'),
                [{'revision': revision} for revision in ('b15d7e9f3a21', 'ee95fb2bceed')])
            context = MigrationContext.configure(connection, opts={
                'fn': lambda heads, context: self.scripts._upgrade_revs('head', heads),
            })
            with Operations.context(context):
                context.run_migrations()
            self.assertEqual(list(connection.execute(text('SELECT version_num FROM alembic_version')).scalars()), [HEAD])
            self.assertEqual(connection.execute(text('SELECT atlas_tile_zoom FROM campaign')).scalar_one(), 7)
