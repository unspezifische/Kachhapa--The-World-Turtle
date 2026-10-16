"""Persistent campaign sessions and sub-minute authoritative calendar time."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0a4c3d5e6f71'
down_revision = 'f93b2e4c1d50'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('calendar', sa.Column('current_second', sa.Integer(), nullable=False, server_default='0'))
    op.create_table('campaign_session_state',
                    sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id'), primary_key=True),
                    sa.Column('revision', sa.Integer(), nullable=False, server_default='0'),
                    sa.Column('document', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False))
    op.create_table('session_command_receipt',
                    sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id'), primary_key=True),
                    sa.Column('request_id', sa.String(64), primary_key=True),
                    sa.Column('fingerprint', sa.String(64), nullable=False),
                    sa.Column('revision', sa.Integer(), nullable=False))


def downgrade():
    op.drop_table('session_command_receipt')
    op.drop_table('campaign_session_state')
    op.drop_column('calendar', 'current_second')
