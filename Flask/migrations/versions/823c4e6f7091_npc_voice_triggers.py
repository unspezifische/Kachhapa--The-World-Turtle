"""Declarative voice rules and opt-in campaign settings."""
from alembic import op
import sqlalchemy as sa
revision='823c4e6f7091'
down_revision='712b3d5e6f80'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('npc_voice_trigger',
        sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('voice_line_id',sa.String(36),sa.ForeignKey('npc_voice_line.id',ondelete='CASCADE'),nullable=False),
        sa.Column('campaign_id',sa.Integer(),sa.ForeignKey('campaign.id',ondelete='CASCADE')),
        sa.Column('inherited_from',sa.String(36)),sa.Column('event_type',sa.String(80),nullable=False),
        sa.Column('conditions',sa.JSON(),nullable=False),sa.Column('priority',sa.Integer(),nullable=False),
        sa.Column('probability',sa.Float(),nullable=False),sa.Column('cooldown_ms',sa.Integer(),nullable=False),
        sa.Column('enabled',sa.Boolean(),nullable=False),sa.Column('interrupt',sa.Boolean(),nullable=False),sa.Column('randomized',sa.Boolean(),nullable=False))
    op.create_index('ix_npc_voice_trigger_voice_line_id','npc_voice_trigger',['voice_line_id'])
    op.create_index('ix_npc_voice_trigger_campaign_id','npc_voice_trigger',['campaign_id'])
    op.create_table('npc_voice_settings',sa.Column('campaign_id',sa.Integer(),sa.ForeignKey('campaign.id',ondelete='CASCADE'),primary_key=True),sa.Column('automatic_enabled',sa.Boolean(),nullable=False))


def downgrade():
    op.drop_table('npc_voice_settings');op.drop_table('npc_voice_trigger')
