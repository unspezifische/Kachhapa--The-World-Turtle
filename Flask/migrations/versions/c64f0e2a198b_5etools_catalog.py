"""Add source keyed creature and adventure catalogs.

Revision ID: c64f0e2a198b
Revises: b93e2d51a70c
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'c64f0e2a198b'
down_revision = 'b93e2d51a70c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('creature_catalog',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source', sa.String(80), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('is_adventure', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('is_named', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('challenge', sa.String(50)),
        sa.Column('ac', sa.String(80)),
        sa.Column('hp', sa.String(80)),
        sa.Column('dexterity', sa.Integer()),
        sa.Column('data', JSONB(), nullable=False),
        sa.UniqueConstraint('source', 'name', name='uq_creature_catalog_source_name'))
    op.create_index('ix_creature_catalog_is_adventure', 'creature_catalog', ['is_adventure'])
    op.create_index('ix_creature_catalog_name', 'creature_catalog', ['name'])
    op.create_table('adventure_catalog',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source', sa.String(80), nullable=False, unique=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('metadata_json', JSONB(), nullable=False),
        sa.Column('content', JSONB(), nullable=False))


def downgrade():
    op.drop_table('adventure_catalog')
    op.drop_index('ix_creature_catalog_name', table_name='creature_catalog')
    op.drop_index('ix_creature_catalog_is_adventure', table_name='creature_catalog')
    op.drop_table('creature_catalog')
