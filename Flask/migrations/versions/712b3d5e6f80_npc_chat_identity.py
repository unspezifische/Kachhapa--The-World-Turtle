"""Keep canonical NPC sender and underlying DM author in the existing chat."""
from alembic import op
import sqlalchemy as sa
revision='712b3d5e6f80'
down_revision='601a2c4d5e7f'
branch_labels=None
depends_on=None


def upgrade():
    op.add_column('message',sa.Column('sender_npc_id',sa.Integer(),nullable=True))
    op.create_foreign_key('fk_message_sender_npc','message','npc',['sender_npc_id'],['id'])


def downgrade():
    op.drop_constraint('fk_message_sender_npc','message',type_='foreignkey')
    op.drop_column('message','sender_npc_id')
