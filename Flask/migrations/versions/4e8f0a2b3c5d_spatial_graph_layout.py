"""Persist building spatial graph layouts.

Revision ID: 4e8f0a2b3c5d
Revises: 3d7e9f1a2b4c
"""
from alembic import op
import sqlalchemy as sa


revision = '4e8f0a2b3c5d'
down_revision = '3d7e9f1a2b4c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'spatial_graph_layout',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), nullable=False),
        sa.Column('building_id', sa.String(length=160), nullable=False),
        sa.Column('view_mode', sa.String(length=16), nullable=False),
        sa.Column('layout', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("view_mode IN ('space','room')", name='ck_spatial_graph_layout_view'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['settlement_id'], ['world_atlas_location.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campaign_id', 'settlement_id', 'building_id', 'view_mode', name='uq_spatial_graph_layout'),
    )
    op.create_index('ix_spatial_graph_layout_campaign_id', 'spatial_graph_layout', ['campaign_id'])
    op.create_index('ix_spatial_graph_layout_settlement_id', 'spatial_graph_layout', ['settlement_id'])


def downgrade():
    op.drop_index('ix_spatial_graph_layout_settlement_id', table_name='spatial_graph_layout')
    op.drop_index('ix_spatial_graph_layout_campaign_id', table_name='spatial_graph_layout')
    op.drop_table('spatial_graph_layout')
