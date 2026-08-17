"""add campaign module installations

Revision ID: 8f1c2d3e4a5b
Revises: 2c7d9e1f4a6b
"""

from alembic import op
import sqlalchemy as sa


revision = '8f1c2d3e4a5b'
down_revision = '2c7d9e1f4a6b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'campaign_module_installation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('module_key', sa.String(length=120), nullable=False),
        sa.Column('module_name', sa.String(length=160), nullable=False),
        sa.Column('setting_key', sa.String(length=80), nullable=True),
        sa.Column('starting_year', sa.Integer(), nullable=True),
        sa.Column('installed_by_id', sa.Integer(), nullable=True),
        sa.Column('settlement_strategy', sa.String(length=30), nullable=False, server_default='merge'),
        sa.Column('calendar_strategy', sa.String(length=30), nullable=False, server_default='keep_current'),
        sa.Column('installed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['installed_by_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campaign_id', 'module_key', name='uq_campaign_module_installation'),
    )
    op.create_index(
        op.f('ix_campaign_module_installation_campaign_id'),
        'campaign_module_installation',
        ['campaign_id'],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f('ix_campaign_module_installation_campaign_id'), table_name='campaign_module_installation')
    op.drop_table('campaign_module_installation')
