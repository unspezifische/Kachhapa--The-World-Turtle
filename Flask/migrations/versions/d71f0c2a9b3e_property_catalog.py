"""Add additive property catalog without replacing legacy building records.

Revision ID: d71f0c2a9b3e
Revises: c64f0e2a198b
"""
from alembic import op
import sqlalchemy as sa

revision = 'd71f0c2a9b3e'
down_revision = 'c64f0e2a198b'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('world_atlas_location', sa.Column('properties', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('settlement_map_design', sa.Column('properties', sa.JSON(), nullable=False, server_default='[]'))


def downgrade():
    op.drop_column('settlement_map_design', 'properties')
    op.drop_column('world_atlas_location', 'properties')
