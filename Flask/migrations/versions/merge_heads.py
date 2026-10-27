"""merge heads

Revision ID: manual_merge_head
Revises: ('FIRST_HEX_ID', 'SECOND_HEX_ID')
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'manual_merge_head'
down_revision = ('06404e99d96f', 'd79a1ff8019e')
branch_labels = None
depends_on = None

def upgrade():
    pass

def downgrade():
    pass
