"""add lamplighter routes and street lamps

Revision ID: b7e01c4f92d1
Revises: 4d71b9e8c2af
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa


revision = 'b7e01c4f92d1'
down_revision = '4d71b9e8c2af'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'lamplighter_route',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('evening_start_minute', sa.Integer(), nullable=False, server_default='1080'),
        sa.Column('morning_start_minute', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('minutes_per_stop', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lamplighter_route_campaign_id', 'lamplighter_route', ['campaign_id'])

    op.create_table(
        'street_lamp',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('route_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.Column('elevation', sa.Float(), nullable=False, server_default='0'),
        sa.Column('route_order', sa.Integer(), nullable=False),
        sa.Column('lit', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('fuel_remaining', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id']),
        sa.ForeignKeyConstraint(['route_id'], ['lamplighter_route.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('route_id', 'route_order', name='uq_street_lamp_route_order'),
    )
    op.create_index('ix_street_lamp_campaign_id', 'street_lamp', ['campaign_id'])
    op.create_index('ix_street_lamp_route_id', 'street_lamp', ['route_id'])


def downgrade():
    op.drop_index('ix_street_lamp_route_id', table_name='street_lamp')
    op.drop_index('ix_street_lamp_campaign_id', table_name='street_lamp')
    op.drop_table('street_lamp')
    op.drop_index('ix_lamplighter_route_campaign_id', table_name='lamplighter_route')
    op.drop_table('lamplighter_route')
