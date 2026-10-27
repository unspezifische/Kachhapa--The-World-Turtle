"""Persistent NPC media assets; associations use existing NPC profile metadata."""
from alembic import op
import sqlalchemy as sa
revision = '5f901b3c4d6e'
down_revision = '4e8f0a2b3c5d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('npc_media_asset',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id', ondelete='CASCADE')),
        sa.Column('module_key', sa.String(120)),
        sa.Column('media_type', sa.String(16), nullable=False),
        sa.Column('storage_key', sa.String(100), unique=True, nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(64), nullable=False),
        sa.Column('width', sa.Integer()), sa.Column('height', sa.Integer()), sa.Column('duration_ms', sa.Integer()),
        sa.Column('variants', sa.JSON(), nullable=False), sa.Column('status', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_npc_media_asset_campaign_id', 'npc_media_asset', ['campaign_id'])


def downgrade():
    op.drop_table('npc_media_asset')
