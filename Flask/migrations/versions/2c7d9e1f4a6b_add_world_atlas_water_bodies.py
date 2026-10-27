"""Add authored water bodies to settlement maps.

Revision ID: 2c7d9e1f4a6b
Revises: 1a2b3c4d5e6f
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa


revision = '2c7d9e1f4a6b'
down_revision = '1a2b3c4d5e6f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'world_atlas_location',
        sa.Column('water_bodies', sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.alter_column('world_atlas_location', 'water_bodies', server_default=None)


def downgrade():
    op.drop_column('world_atlas_location', 'water_bodies')
