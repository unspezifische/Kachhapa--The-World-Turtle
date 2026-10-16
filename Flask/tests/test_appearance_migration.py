import unittest,importlib.util
from pathlib import Path
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
class AppearanceMigrationTests(unittest.TestCase):
    def test_preserve_user_and_add_private_tables(self):
        path=Path(__file__).parents[1]/'migrations/versions/1b5d4e6f7082_user_themes.py'
        spec=importlib.util.spec_from_file_location('appearance_migration',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        engine=sa.create_engine('sqlite://')
        with engine.begin() as conn:
            conn.execute(sa.text('CREATE TABLE user (id INTEGER PRIMARY KEY, username VARCHAR)'));conn.execute(sa.text("INSERT INTO user VALUES (7, 'saved')"))
            with Operations.context(MigrationContext.configure(conn)):module.upgrade()
            self.assertEqual(tuple(conn.execute(sa.text('SELECT * FROM user')).one()),(7,'saved'))
            self.assertEqual(conn.execute(sa.text('SELECT COUNT(*) FROM user_appearance')).scalar(),0)
            with Operations.context(MigrationContext.configure(conn)):module.downgrade()
            self.assertEqual(conn.execute(sa.text('SELECT username FROM user')).scalar(),'saved')
