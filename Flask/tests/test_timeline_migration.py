import ast
from pathlib import Path
import unittest


class TimelineMigrationTests(unittest.TestCase):
    def test_timeline_migration_branches_from_current_head_and_has_required_schema(self):
        migration = Path(__file__).parents[1] / 'migrations/versions/f6b9a2c4d810_campaign_historical_timeline.py'
        source = migration.read_text()
        tree = ast.parse(source)
        values = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                try: values[node.targets[0].id] = ast.literal_eval(node.value)
                except (ValueError, TypeError): pass
        self.assertEqual(values['revision'], 'f6b9a2c4d810')
        self.assertEqual(values['down_revision'], 'e7c91a4b2d60')
        for required in ('calendar_event_npc', 'birth_year', 'birth_season', 'start_month_index', 'season'):
            self.assertIn(required, source)

    def test_range_migration_branches_from_timeline_head(self):
        migration = Path(__file__).parents[1] / 'migrations/versions/c8d4e6f1a203_timeline_event_ranges.py'
        source = migration.read_text()
        tree = ast.parse(source)
        values = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                try: values[node.targets[0].id] = ast.literal_eval(node.value)
                except (ValueError, TypeError): pass
        self.assertEqual(values['revision'], 'c8d4e6f1a203')
        self.assertEqual(values['down_revision'], 'f6b9a2c4d810')
        for required in ('end_year', 'end_season', 'end_month_index', 'end_day'):
            self.assertIn(required, source)


if __name__ == '__main__':
    unittest.main()
