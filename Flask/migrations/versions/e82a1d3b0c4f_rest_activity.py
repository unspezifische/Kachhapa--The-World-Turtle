"""Add explicit NPC rest reservations without changing NPC or building saves."""
from alembic import op
import sqlalchemy as sa

revision = 'e82a1d3b0c4f'
down_revision = 'd71f0c2a9b3e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('settlement_rest_activity',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id'), nullable=False),
        sa.Column('settlement_id', sa.Integer(), sa.ForeignKey('world_atlas_location.id'), nullable=False),
        sa.Column('npc_id', sa.Integer(), sa.ForeignKey('npc.id'), nullable=False),
        sa.Column('destination_key', sa.Text(), nullable=False),
        sa.Column('capacity_slot', sa.Integer(), nullable=True),
        sa.Column('state', sa.String(30), nullable=False),
        sa.Column('route', sa.JSON(), nullable=False),
        sa.Column('actor', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('campaign_id', 'npc_id', name='uq_rest_npc'),
        sa.UniqueConstraint('settlement_id', 'destination_key', 'capacity_slot', name='uq_rest_capacity_slot'))
    op.create_index('ix_settlement_rest_activity_campaign_id', 'settlement_rest_activity', ['campaign_id'])
    op.create_index('ix_settlement_rest_activity_settlement_id', 'settlement_rest_activity', ['settlement_id'])


def downgrade():
    op.drop_table('settlement_rest_activity')
