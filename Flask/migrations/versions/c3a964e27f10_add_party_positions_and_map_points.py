"""add party positions and map points

Revision ID: c3a964e27f10
Revises: b7e01c4f92d1
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3a964e27f10'
down_revision = 'b7e01c4f92d1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'party_map_position',
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('map_key', sa.String(length=120), nullable=False, server_default='pinewater'),
        sa.Column('x', sa.Float(), nullable=False, server_default='0'),
        sa.Column('y', sa.Float(), nullable=False, server_default='0'),
        sa.Column('elevation', sa.Float(), nullable=False, server_default='0'),
        sa.Column('water_access', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('road_access', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id']),
        sa.PrimaryKeyConstraint('campaign_id'),
    )
    op.create_table(
        'map_point_of_interest',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('map_key', sa.String(length=120), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('point_type', sa.String(length=50), nullable=False, server_default='landmark'),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.Column('elevation', sa.Float(), nullable=False, server_default='0'),
        sa.Column('water_access', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('road_access', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_map_point_of_interest_campaign_id', 'map_point_of_interest', ['campaign_id'])


def downgrade():
    op.drop_index('ix_map_point_of_interest_campaign_id', table_name='map_point_of_interest')
    op.drop_table('map_point_of_interest')
    op.drop_table('party_map_position')
