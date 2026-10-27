"""Protect the upgrade path from the dev Pi's two recorded revisions."""
import io
from pathlib import Path
import unittest

from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text


MIGRATIONS = Path(__file__).parents[1] / 'migrations'
MERGE = '934d5f7081a2'
HEAD = 'd93f6a8b2c10'
DEV_REVISIONS = ('9f26f6c8bb14', '4e8f0a2b3c5d')
PARENTS = ('823c4e6f7091', '9f26f6c8bb14')


class AtlasVoiceMergeMigrationTests(unittest.TestCase):
    def setUp(self):
        self.scripts = ScriptDirectory(str(MIGRATIONS))

    def test_complete_history_has_one_head(self):
        self.assertEqual(self.scripts.get_heads(), [HEAD])
        self.assertEqual(self.scripts.get_revision(MERGE).down_revision, PARENTS)
        # Walk all ancestors to detect missing historical dependencies.
        revisions = {item.revision for item in self.scripts.walk_revisions()}
        self.assertTrue(set(DEV_REVISIONS) <= revisions)
        self.assertIn('65e46028c5d2', revisions)

    def test_dev_upgrade_applies_only_pending_voice_migrations_and_merge(self):
        steps = self.scripts._upgrade_revs(MERGE, DEV_REVISIONS)
        self.assertEqual([step.revision.revision for step in steps], [
            '5f901b3c4d6e', '601a2c4d5e7f', '712b3d5e6f80',
            '823c4e6f7091', MERGE,
        ])
        self.assertEqual(self.scripts._upgrade_revs(MERGE, (MERGE,)), [])

    def test_dev_upgrade_renders_postgresql_ddl_without_replaying_atlas(self):
        output = io.StringIO()
        context = MigrationContext.configure(url='postgresql://', opts={
            'as_sql': True, 'output_buffer': output, 'starting_rev': DEV_REVISIONS,
            'script': self.scripts,
            'fn': lambda heads, context: self.scripts._upgrade_revs(MERGE, heads),
        })
        with Operations.context(context):
            context.run_migrations()
        sql = output.getvalue()
        for table in ('npc_media_asset', 'npc_voice_line', 'npc_voice_trigger', 'npc_voice_settings'):
            self.assertIn('CREATE TABLE ' + table, sql)
        self.assertIn('ALTER TABLE message ADD COLUMN sender_npc_id', sql)
        self.assertIn(MERGE, sql)
        self.assertNotIn('atlas_image_url', sql)
        self.assertNotIn('CREATE TABLE world_atlas_location', sql)
        self.assertNotIn('DROP TABLE', sql)

    def test_merge_joins_version_rows_and_downgrade_splits_without_schema_changes(self):
        engine = create_engine('sqlite://')
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
            connection.execute(text('INSERT INTO alembic_version VALUES (:revision)'),
                               [{'revision': revision} for revision in PARENTS])
            connection.execute(text('CREATE TABLE preserved_data (value TEXT)'))
            connection.execute(text("INSERT INTO preserved_data VALUES ('keep me')"))
            for direction in ('upgrade', 'downgrade'):
                planner = (lambda heads, context: self.scripts._upgrade_revs(MERGE, heads)) if direction == 'upgrade' else (
                    lambda heads, context: self.scripts._downgrade_revs('823c4e6f7091', heads))
                context = MigrationContext.configure(connection, opts={'fn': planner})
                with Operations.context(context):
                    context.run_migrations()
                actual = set(connection.execute(text('SELECT version_num FROM alembic_version')).scalars())
                self.assertEqual(actual, {MERGE} if direction == 'upgrade' else set(PARENTS))
                self.assertEqual(connection.execute(text('SELECT value FROM preserved_data')).scalar_one(), 'keep me')
        engine.dispose()
