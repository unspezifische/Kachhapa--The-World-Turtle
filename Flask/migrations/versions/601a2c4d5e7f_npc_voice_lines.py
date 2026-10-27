"""NPC voice recordings and module inheritance."""
from alembic import op
import sqlalchemy as sa
revision='601a2c4d5e7f'
down_revision='5f901b3c4d6e'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('npc_voice_line',
        sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('npc_id',sa.Integer(),sa.ForeignKey('npc.id',ondelete='CASCADE')),
        sa.Column('campaign_id',sa.Integer(),sa.ForeignKey('campaign.id',ondelete='CASCADE')),
        sa.Column('module_key',sa.String(120)),sa.Column('source_key',sa.String(120)),sa.Column('inherited_from',sa.String(36)),
        sa.Column('media_asset_id',sa.String(36),sa.ForeignKey('npc_media_asset.id'),nullable=False),
        sa.Column('label',sa.String(160),nullable=False),sa.Column('category',sa.String(32),nullable=False),
        sa.Column('transcript',sa.Text(),nullable=False),sa.Column('description',sa.Text(),nullable=False),
        sa.Column('quick_slot',sa.Integer()),sa.Column('display_order',sa.Integer(),nullable=False),
        sa.Column('gain',sa.Float(),nullable=False),sa.Column('enabled',sa.Boolean(),nullable=False))
    op.create_index('ix_npc_voice_line_npc_id','npc_voice_line',['npc_id'])
    op.create_index('ix_npc_voice_line_campaign_id','npc_voice_line',['campaign_id'])


def downgrade():
    op.drop_table('npc_voice_line')
