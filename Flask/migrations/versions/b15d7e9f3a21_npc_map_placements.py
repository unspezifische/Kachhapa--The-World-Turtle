"""Add explicit DM-owned NPC map placements."""
from alembic import op
import sqlalchemy as sa

revision = 'b15d7e9f3a21'
down_revision = '934d5f7081a2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'npc_map_placement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id', ondelete='CASCADE'), nullable=False),
        sa.Column('settlement_id', sa.Integer(), sa.ForeignKey('world_atlas_location.id', ondelete='CASCADE'), nullable=False),
        sa.Column('npc_id', sa.Integer(), sa.ForeignKey('npc.id', ondelete='CASCADE'), nullable=False),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.Column('elevation', sa.Float(), nullable=False, server_default='0'),
        sa.Column('visible', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('campaign_id', 'npc_id', name='uq_npc_map_placement_campaign_npc'),
    )
    op.create_index('ix_npc_map_placement_campaign_id', 'npc_map_placement', ['campaign_id'])
    op.create_index('ix_npc_map_placement_settlement_id', 'npc_map_placement', ['settlement_id'])
    op.create_index('ix_npc_map_placement_npc_id', 'npc_map_placement', ['npc_id'])


def downgrade():
    op.drop_table('npc_map_placement')
