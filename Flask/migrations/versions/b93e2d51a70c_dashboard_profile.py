"""Add private user profiles, quick notes, and campaign landing preferences.

Revision ID: b93e2d51a70c
Revises: a81c92d4e6f7
"""
from alembic import op
import sqlalchemy as sa

revision = 'b93e2d51a70c'
down_revision = 'a81c92d4e6f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('real_name', sa.String(length=120), nullable=True))
    op.add_column('user', sa.Column('bio', sa.String(length=600), nullable=True))
    op.add_column('user', sa.Column('profile_photo', sa.LargeBinary(), nullable=True))
    op.add_column('user', sa.Column('profile_photo_updated', sa.DateTime(), nullable=True))
    op.create_table(
        'user_campaign_preference',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id'), primary_key=True),
        sa.Column('landing_path', sa.String(length=80), nullable=False),
    )
    op.create_table(
        'quick_note',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id'), nullable=False),
        sa.Column('character_id', sa.Integer(), sa.ForeignKey('character.id'), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_quick_note_user_id', 'quick_note', ['user_id'])
    op.create_index('ix_quick_note_campaign_id', 'quick_note', ['campaign_id'])


def downgrade():
    op.drop_index('ix_quick_note_campaign_id', table_name='quick_note')
    op.drop_index('ix_quick_note_user_id', table_name='quick_note')
    op.drop_table('quick_note')
    op.drop_table('user_campaign_preference')
    op.drop_column('user', 'profile_photo_updated')
    op.drop_column('user', 'profile_photo')
    op.drop_column('user', 'bio')
    op.drop_column('user', 'real_name')
