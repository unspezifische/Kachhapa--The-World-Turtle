"""add campaign sound playlists

Revision ID: 7d5a9c3e2f10
Revises: 6c4f8a2d1b9e
"""

from alembic import op
import sqlalchemy as sa


revision = '7d5a9c3e2f10'
down_revision = '6c4f8a2d1b9e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sound_playlist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('shuffle', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sound_playlist_campaign_id', 'sound_playlist', ['campaign_id'])
    op.create_table(
        'sound_playlist_track',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('playlist_id', sa.Integer(), nullable=False),
        sa.Column('sound_asset_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['playlist_id'], ['sound_playlist.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sound_asset_id'], ['sound_asset.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('playlist_id', 'sound_asset_id', name='uq_sound_playlist_track_asset'),
    )
    op.create_index('ix_sound_playlist_track_playlist_id', 'sound_playlist_track', ['playlist_id'])


def downgrade():
    op.drop_index('ix_sound_playlist_track_playlist_id', table_name='sound_playlist_track')
    op.drop_table('sound_playlist_track')
    op.drop_index('ix_sound_playlist_campaign_id', table_name='sound_playlist')
    op.drop_table('sound_playlist')
