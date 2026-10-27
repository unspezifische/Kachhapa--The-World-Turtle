import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / 'migrations/versions/e7c91a4b2d60_repair_campaign_wiki_schema.py'
)


class FakeInspector:
    def __init__(self, complete=False):
        self.complete = complete

    def get_table_names(self):
        tables = {'campaign', 'page', 'user', 'campaign_members'}
        if self.complete:
            tables.update({'campaign_wiki_role', 'wiki_edit_proposal'})
        return list(tables)

    def get_columns(self, table_name):
        if table_name == 'campaign':
            names = ['id', 'scribes']
            if self.complete:
                names.append('wiki_permission')
            return [{'name': name} for name in names]
        return [{'name': 'id'}]

    def get_check_constraints(self, table_name):
        if not self.complete:
            return []
        names = {
            'campaign': 'ck_campaign_wiki_permission',
            'campaign_wiki_role': 'ck_campaign_wiki_role',
            'wiki_edit_proposal': 'ck_wiki_edit_proposal_status',
        }
        return [{'name': names[table_name]}] if table_name in names else []

    def get_indexes(self, table_name):
        if self.complete and table_name == 'wiki_edit_proposal':
            return [{'name': 'ix_wiki_edit_proposal_campaign_id'}]
        return []


class CampaignWikiRepairMigrationTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            'campaign_wiki_repair_migration', MIGRATION_PATH
        )
        self.migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.migration)

    def test_upgrade_repairs_every_missing_campaign_wiki_object(self):
        migration_op = MagicMock()
        self.migration.op = migration_op
        with patch.object(self.migration.sa, 'inspect', return_value=FakeInspector()):
            self.migration.upgrade()

        migration_op.add_column.assert_called_once()
        self.assertEqual(
            [call.args[0] for call in migration_op.create_table.call_args_list],
            ['campaign_wiki_role', 'wiki_edit_proposal'],
        )
        migration_op.create_index.assert_called_once_with(
            'ix_wiki_edit_proposal_campaign_id',
            'wiki_edit_proposal',
            ['campaign_id'],
        )
        self.assertTrue(migration_op.execute.called)

    def test_upgrade_is_a_noop_for_an_already_complete_schema(self):
        migration_op = MagicMock()
        self.migration.op = migration_op
        with patch.object(self.migration.sa, 'inspect', return_value=FakeInspector(complete=True)):
            self.migration.upgrade()

        migration_op.add_column.assert_not_called()
        migration_op.create_table.assert_not_called()
        migration_op.create_index.assert_not_called()
        migration_op.create_check_constraint.assert_not_called()
        migration_op.execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
