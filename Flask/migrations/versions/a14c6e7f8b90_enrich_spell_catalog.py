"""Enrich the legacy spell table with the 5etools catalog fields.

Revision ID: a14c6e7f8b90
Revises: f93b2e4c1d50
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'a14c6e7f8b90'
down_revision = 'f93b2e4c1d50'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('spells', 'name', type_=sa.String(200), existing_type=sa.String(80), existing_nullable=False)
    op.alter_column('spells', 'casting_time', type_=sa.String(200), existing_type=sa.String(80), existing_nullable=False)
    op.alter_column('spells', 'range', type_=sa.String(200), existing_type=sa.String(80), existing_nullable=False)
    op.alter_column('spells', 'components', type_=sa.String(500), existing_type=sa.String(80), existing_nullable=False)
    op.alter_column('spells', 'duration', type_=sa.String(200), existing_type=sa.String(80), existing_nullable=False)
    op.alter_column('spells', 'classes', type_=sa.String(500), existing_type=sa.String(80), existing_nullable=False)
    op.add_column('spells', sa.Column('source', sa.String(80)))
    op.add_column('spells', sa.Column('page', sa.Integer()))
    for name in ('damage_types', 'conditions', 'saving_throws', 'spell_attacks', 'misc_tags', 'area_tags'):
        op.add_column('spells', sa.Column(name, JSONB(), nullable=False, server_default='[]'))
    op.add_column('spells', sa.Column('ritual', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('spells', sa.Column('concentration', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('spells', sa.Column('data', JSONB()))
    op.create_unique_constraint('uq_spells_source_name', 'spells', ['source', 'name'])
    op.create_index('ix_spells_name', 'spells', ['name'])
    op.create_index('ix_spells_level', 'spells', ['level'])
    op.create_index('ix_spells_school', 'spells', ['school'])


def downgrade():
    op.drop_index('ix_spells_school', table_name='spells')
    op.drop_index('ix_spells_level', table_name='spells')
    op.drop_index('ix_spells_name', table_name='spells')
    op.drop_constraint('uq_spells_source_name', 'spells', type_='unique')
    for name in ('data', 'concentration', 'ritual', 'area_tags', 'misc_tags', 'spell_attacks',
                 'saving_throws', 'conditions', 'damage_types', 'page', 'source'):
        op.drop_column('spells', name)
    op.alter_column('spells', 'classes', type_=sa.String(80), existing_type=sa.String(500), existing_nullable=False)
    op.alter_column('spells', 'duration', type_=sa.String(80), existing_type=sa.String(200), existing_nullable=False)
    op.alter_column('spells', 'components', type_=sa.String(80), existing_type=sa.String(500), existing_nullable=False)
    op.alter_column('spells', 'range', type_=sa.String(80), existing_type=sa.String(200), existing_nullable=False)
    op.alter_column('spells', 'name', type_=sa.String(80), existing_type=sa.String(200), existing_nullable=False)
    op.alter_column('spells', 'casting_time', type_=sa.String(80), existing_type=sa.String(200), existing_nullable=False)
