import importlib.util
from pathlib import Path
import unittest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


class SessionMigrationTests(unittest.TestCase):
    def test_additive_upgrade_preserves_calendar_and_defaults_seconds(self):
        path=Path(__file__).parents[1]/'migrations/versions/0a4c3d5e6f71_session_management.py'
        spec=importlib.util.spec_from_file_location('session_migration',path)
        migration=importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
        engine=sa.create_engine('sqlite://')
        with engine.begin() as conn:
            conn.execute(sa.text('CREATE TABLE campaign (id INTEGER PRIMARY KEY)'))
            conn.execute(sa.text('INSERT INTO campaign VALUES (5)'))
            conn.execute(sa.text('CREATE TABLE calendar (id INTEGER PRIMARY KEY, current_year INTEGER, current_minute INTEGER)'))
            conn.execute(sa.text('INSERT INTO calendar VALUES (11, 1492, 47)'))
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
            self.assertEqual(tuple(conn.execute(sa.text('SELECT id,current_year,current_minute,current_second FROM calendar')).one()),(11,1492,47,0))
            conn.execute(sa.text("INSERT INTO campaign_session_state VALUES (5, 0, '{}')"))
            conn.execute(sa.text("INSERT INTO session_command_receipt VALUES (5, 'one', 'abc', 1)"))
            with Operations.context(MigrationContext.configure(conn)):
                migration.downgrade()
            self.assertEqual(tuple(conn.execute(sa.text('SELECT id,current_year,current_minute FROM calendar')).one()),(11,1492,47))


if __name__=='__main__': unittest.main()
