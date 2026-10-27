import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

import sqlalchemy as sa


PATH = Path(__file__).parents[1] / 'migrations' / 'versions' / 'd5f7a9c2e4b6_npc_domains_and_combat_profiles.py'
SPEC = importlib.util.spec_from_file_location('npc_domain_migration', PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class NpcDomainMigrationTests(unittest.TestCase):
    def test_branches_from_current_timeline_head_and_creates_all_domain_tables(self):
        self.assertEqual(MIGRATION.down_revision, 'c8d4e6f1a203')
        fake_op = MagicMock()
        with patch.object(MIGRATION, 'op', fake_op), patch.object(MIGRATION.context, 'is_offline_mode', return_value=True):
            MIGRATION.upgrade()
        names = [call.args[0] for call in fake_op.create_table.call_args_list]
        self.assertEqual(names, [
            'npc_occupation_association', 'npc_role_assignment', 'npc_social_position',
            'npc_combat_profile', 'npc_class_progression',
        ])
        fake_op.get_bind.assert_not_called()

    def test_downgrade_removes_only_the_additive_domain_schema(self):
        fake_op = MagicMock()
        with patch.object(MIGRATION, 'op', fake_op):
            MIGRATION.downgrade()
        self.assertEqual(
            [call.args[0] for call in fake_op.drop_table.call_args_list],
            ['npc_class_progression', 'npc_combat_profile', 'npc_social_position',
             'npc_role_assignment', 'npc_occupation_association'],
        )
        self.assertEqual(
            [call.args[:2] for call in fake_op.drop_constraint.call_args_list],
            [('uq_occupation_id_campaign', 'occupation_definition'), ('uq_npc_id_campaign', 'npc')],
        )
        touched_tables = {call.args[0] for call in fake_op.drop_column.call_args_list}
        self.assertEqual(touched_tables, {'occupation_definition'})

    def test_backfill_copies_only_explicit_occupation_and_preserves_class_metadata(self):
        engine = sa.create_engine('sqlite://')
        metadata = sa.MetaData()
        sa.Table('npc', metadata,
            sa.Column('id', sa.Integer, primary_key=True), sa.Column('campaign_id', sa.Integer, nullable=False),
            sa.Column('profile_metadata', sa.JSON, nullable=False))
        sa.Table('occupation_definition', metadata,
            sa.Column('id', sa.Integer, primary_key=True), sa.Column('campaign_id', sa.Integer, nullable=False),
            sa.Column('occupation_key', sa.String, nullable=False), sa.Column('name', sa.String, nullable=False),
            sa.Column('ability_weights', sa.JSON), sa.Column('target_workers', sa.Integer), sa.Column('minimum_suitability', sa.Float),
            sa.Column('base_wage_cp', sa.Integer), sa.Column('description', sa.Text), sa.Column('category', sa.String),
            sa.Column('schedule_archetype', sa.JSON), sa.Column('activity_weights', sa.JSON),
            sa.Column('is_custom', sa.Boolean), sa.Column('active', sa.Boolean))
        sa.Table('npc_occupation_association', metadata,
            sa.Column('id', sa.Integer, primary_key=True), sa.Column('campaign_id', sa.Integer),
            sa.Column('npc_id', sa.Integer), sa.Column('occupation_id', sa.Integer), sa.Column('status', sa.String),
            sa.Column('is_primary', sa.Boolean), sa.Column('notes', sa.Text), sa.Column('provenance', sa.JSON))
        metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(sa.text("INSERT INTO npc (id,campaign_id,profile_metadata) VALUES (1,7,:metadata)"),
                               {'metadata':'{"occupation":"Independent Researcher","character_class":"Wizard"}'})
            with patch.object(MIGRATION.op, 'get_bind', return_value=connection):
                MIGRATION._legacy_occupation_backfill()
            definition = connection.execute(sa.text('SELECT occupation_key,name FROM occupation_definition')).one()
            association = connection.execute(sa.text('SELECT status,is_primary,provenance FROM npc_occupation_association')).one()
        self.assertEqual(tuple(definition), ('independent_researcher','Independent Researcher'))
        self.assertEqual(association.status, 'current')
        self.assertTrue(association.is_primary)
        self.assertNotIn('Wizard', str(association.provenance))


if __name__ == '__main__':
    unittest.main()
