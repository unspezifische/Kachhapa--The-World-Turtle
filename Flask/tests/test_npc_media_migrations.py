import importlib.util
import io
from pathlib import Path
import unittest
from alembic.migration import MigrationContext
from alembic.operations import Operations


class NpcMediaMigrationTests(unittest.TestCase):
    def test_postgresql_upgrade_downgrade_and_single_revision_chain(self):
        paths=['5f901b3c4d6e_npc_media.py','601a2c4d5e7f_npc_voice_lines.py','712b3d5e6f80_npc_chat_identity.py','823c4e6f7091_npc_voice_triggers.py']
        output=io.StringIO()
        context=MigrationContext.configure(url='postgresql://',opts={'as_sql':True,'output_buffer':output})
        previous='4e8f0a2b3c5d';migrations=[]
        for name in paths:
            path=Path(__file__).parents[1]/'migrations/versions'/name
            spec=importlib.util.spec_from_file_location(name,path);migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
            self.assertEqual(migration.down_revision,previous);previous=migration.revision
            migration.op=Operations(context);migration.upgrade();migrations.append(migration)
        sql=output.getvalue()
        for table in ('npc_media_asset','npc_voice_line','npc_voice_trigger','npc_voice_settings'):
            self.assertIn('CREATE TABLE '+table,sql)
        self.assertIn('FOREIGN KEY(sender_npc_id) REFERENCES npc (id)',sql)
        for migration in reversed(migrations):migration.downgrade()
        self.assertIn('DROP TABLE npc_media_asset',output.getvalue())
