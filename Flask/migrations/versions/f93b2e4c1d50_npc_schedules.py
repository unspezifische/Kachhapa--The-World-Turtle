"""NPC origins, linked overrides and versioned schedule authoring."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = 'f93b2e4c1d50'
down_revision = 'e82a1d3b0c4f'
branch_labels = None
depends_on = None


def upgrade():
    for column in [sa.Column('revision', sa.Integer(), nullable=False, server_default='1'), sa.Column('profile_metadata', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False, server_default='{}'), sa.Column('module_key', sa.String(120)), sa.Column('source_key', sa.String(120)), sa.Column('origin_snapshot', sa.JSON().with_variant(JSONB(), 'postgresql')), sa.Column('override_patch', sa.JSON().with_variant(JSONB(), 'postgresql'))]:
        op.add_column('npc', column)
    op.create_index('ix_npc_module_key', 'npc', ['module_key'])
    op.create_index('ix_npc_source_key', 'npc', ['source_key'])
    op.create_index('ix_npc_campaign_name_id', 'npc', ['campaign_id', 'name', 'id'])
    op.create_table('npc_schedule_definition', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('npc_id', sa.Integer(), sa.ForeignKey('npc.id'), nullable=False), sa.Column('revision', sa.Integer(), nullable=False), sa.Column('document', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False), sa.Column('warnings', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False), sa.Column('created_at', sa.DateTime(), nullable=False), sa.UniqueConstraint('npc_id', 'revision', name='uq_npc_schedule_revision'))
    op.create_index('ix_npc_schedule_definition_npc_id', 'npc_schedule_definition', ['npc_id'])
    op.create_table('npc_schedule_rule', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('definition_id', sa.Integer(), sa.ForeignKey('npc_schedule_definition.id', ondelete='CASCADE'), nullable=False), sa.Column('rule_id', sa.String(120), nullable=False), sa.Column('start_minute', sa.Integer(), nullable=False), sa.Column('duration_minutes', sa.Integer(), nullable=False), sa.Column('priority', sa.Integer(), nullable=False), sa.Column('data', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False))
    op.create_index('ix_npc_schedule_rule_definition_id', 'npc_schedule_rule', ['definition_id'])
    op.create_table('npc_profile_history', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('npc_id', sa.Integer(), sa.ForeignKey('npc.id'), nullable=False), sa.Column('revision', sa.Integer(), nullable=False), sa.Column('snapshot', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False), sa.Column('created_at', sa.DateTime(), nullable=False))
    op.create_index('ix_npc_profile_history_npc_id', 'npc_profile_history', ['npc_id'])


def downgrade():
    for name in ('npc_profile_history', 'npc_schedule_rule', 'npc_schedule_definition'):
        op.drop_table(name)
    op.drop_index('ix_npc_campaign_name_id', table_name='npc')
    for name in ('module_key', 'source_key'):
        op.drop_index(f'ix_npc_{name}', table_name='npc')
    for name in ('override_patch', 'origin_snapshot', 'source_key', 'module_key', 'profile_metadata', 'revision'):
        op.drop_column('npc', name)
