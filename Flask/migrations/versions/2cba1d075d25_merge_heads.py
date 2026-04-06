"""merge heads

Revision ID: 2cba1d075d25
Revises: ce32771ab732, dd0829e7c138
Create Date: 2026-04-05 18:39:04.400520

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2cba1d075d25'
down_revision = ('ce32771ab732', 'dd0829e7c138')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
