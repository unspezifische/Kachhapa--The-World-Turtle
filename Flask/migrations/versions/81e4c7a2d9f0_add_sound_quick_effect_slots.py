"""add sound quick effect slots

Revision ID: 81e4c7a2d9f0
Revises: 7d5a9c3e2f10
"""

from alembic import op
import sqlalchemy as sa


revision = '81e4c7a2d9f0'
down_revision = '7d5a9c3e2f10'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sound_quick_effect_slot',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('slot', sa.Integer(), nullable=False),
        sa.Column('sound_asset_id', sa.Integer(), nullable=True),
        sa.CheckConstraint('slot >= 1 AND slot <= 5', name='ck_sound_quick_effect_slot_range'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sound_asset_id'], ['sound_asset.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campaign_id', 'slot', name='uq_sound_quick_effect_campaign_slot'),
    )
    op.create_index('ix_sound_quick_effect_slot_campaign_id', 'sound_quick_effect_slot', ['campaign_id'])


def downgrade():
    op.drop_index('ix_sound_quick_effect_slot_campaign_id', table_name='sound_quick_effect_slot')
    op.drop_table('sound_quick_effect_slot')
