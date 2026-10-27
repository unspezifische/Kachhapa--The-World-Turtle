"""add settlement map design

Revision ID: f4a891c82d31
Revises: e2f184bc7630
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'f4a891c82d31'
down_revision = 'e2f184bc7630'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'settlement_map_design',
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('terrain_strokes', sa.JSON(), nullable=False),
        sa.Column('roads', sa.JSON(), nullable=False),
        sa.Column('buildings', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id']),
        sa.PrimaryKeyConstraint('campaign_id'),
    )


def downgrade():
    op.drop_table('settlement_map_design')
