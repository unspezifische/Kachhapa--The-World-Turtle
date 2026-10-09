"""Normalize settlement terrain tiles into independently writable rows.

Revision ID: 7c1d2e3f4a5b
Revises: 34e8fa47728f
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa


revision = '7c1d2e3f4a5b'
down_revision = '34e8fa47728f'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'settlement_terrain_tile',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), nullable=False),
        sa.Column('tile_x', sa.Integer(), nullable=False),
        sa.Column('tile_z', sa.Integer(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(
            ['settlement_id'], ['world_atlas_location.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'settlement_id', 'tile_x', 'tile_z',
            name='uq_settlement_terrain_tile_coordinates',
        ),
    )
    op.create_index(
        'ix_settlement_terrain_tile_settlement_id',
        'settlement_terrain_tile', ['settlement_id'], unique=False,
    )

    # Extract inside PostgreSQL.  Loading the legacy Waterdeep array through
    # Flask expands it past 256 MB, which is the worker timeout/OOM being fixed.
    op.execute(sa.text("""
        INSERT INTO settlement_terrain_tile
            (settlement_id, tile_x, tile_z, payload, updated_at)
        SELECT location.id,
               (layer.value->>'tile_x')::integer,
               (layer.value->>'tile_z')::integer,
               layer.value,
               CURRENT_TIMESTAMP
          FROM world_atlas_location AS location
          CROSS JOIN LATERAL json_array_elements(location.reference_layers) AS layer(value)
         WHERE layer.value->>'layer_type' = 'heightmap_tile'
           AND layer.value->>'tile_x' ~ '^-?[0-9]+$'
           AND layer.value->>'tile_z' ~ '^-?[0-9]+$'
        ON CONFLICT (settlement_id, tile_x, tile_z)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
    """))
    op.execute(sa.text("""
        UPDATE world_atlas_location AS location
           SET reference_layers = COALESCE(
               (SELECT json_agg(layer.value)
                  FROM json_array_elements(location.reference_layers) AS layer(value)
                 WHERE COALESCE(layer.value->>'layer_type', '') <> 'heightmap_tile'),
               '[]'::json
           )
         WHERE location.reference_layers::text LIKE '%"heightmap_tile"%'
    """))


def downgrade():
    # Rebuilding the monolithic JSON document would recreate the failure.
    op.drop_index(
        'ix_settlement_terrain_tile_settlement_id',
        table_name='settlement_terrain_tile',
    )
    op.drop_table('settlement_terrain_tile')
