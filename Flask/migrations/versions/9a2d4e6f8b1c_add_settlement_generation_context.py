"""add settlement generation and environment context

Revision ID: 9a2d4e6f8b1c
Revises: 8f1c2d3e4a5b
"""

from alembic import op
import sqlalchemy as sa


revision = '9a2d4e6f8b1c'
down_revision = '8f1c2d3e4a5b'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('world_atlas_location', sa.Column('environment', sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")))
    op.add_column('world_atlas_location', sa.Column('generation_config', sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")))
    op.alter_column('world_atlas_location', 'environment', server_default=None)
    op.alter_column('world_atlas_location', 'generation_config', server_default=None)


def downgrade():
    op.drop_column('world_atlas_location', 'generation_config')
    op.drop_column('world_atlas_location', 'environment')

