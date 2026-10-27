"""Add campaign world atlases and independently editable settlements.

Revision ID: 1a2b3c4d5e6f
Revises: f78b42c91d03
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa


revision = '1a2b3c4d5e6f'
down_revision = 'f78b42c91d03'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('campaign', sa.Column('module', sa.String(length=160), nullable=True))
    op.create_table(
        'world_atlas_location',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('location_type', sa.String(length=30), nullable=False, server_default='settlement'),
        sa.Column('settlement_type', sa.String(length=30), nullable=False, server_default='town'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('population', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('destroyed_at', sa.DateTime(), nullable=True),
        sa.Column('map_key', sa.String(length=120), nullable=False),
        sa.Column('atlas_x', sa.Float(), nullable=True),
        sa.Column('atlas_y', sa.Float(), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('terrain_strokes', sa.JSON(), nullable=False),
        sa.Column('roads', sa.JSON(), nullable=False),
        sa.Column('buildings', sa.JSON(), nullable=False),
        sa.Column('reference_layers', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campaign_id', 'map_key', name='uq_world_atlas_location_map_key'),
    )
    op.create_index(op.f('ix_world_atlas_location_campaign_id'), 'world_atlas_location', ['campaign_id'])
    op.execute(sa.text("""
        INSERT INTO world_atlas_location
            (campaign_id, name, location_type, map_key, is_primary, terrain_strokes,
             roads, buildings, reference_layers, created_at, updated_at)
        SELECT campaign_id, 'Pinewater Crossing', 'settlement',
               'legacy-' || campaign_id::text, true,
               COALESCE(terrain_strokes, '[]'::json), COALESCE(roads, '[]'::json),
               COALESCE(buildings, '[]'::json), COALESCE(reference_layers, '[]'::json),
               CURRENT_TIMESTAMP, COALESCE(updated_at, CURRENT_TIMESTAMP)
        FROM settlement_map_design
    """))


def downgrade():
    op.drop_index(op.f('ix_world_atlas_location_campaign_id'), table_name='world_atlas_location')
    op.drop_table('world_atlas_location')
    op.drop_column('campaign', 'module')
