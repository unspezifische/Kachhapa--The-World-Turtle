"""Merge the deployed atlas history and NPC voice history.

Revision ID: 934d5f7081a2
Revises: 823c4e6f7091, 9f26f6c8bb14

The dev database already records 9f26f6c8bb14 and 4e8f0a2b3c5d.
Alembic must apply the remaining NPC migrations before joining these branches;
the merge itself adds no schema changes and does not replay atlas migrations.
Keep both parent histories: deployed databases reference their revision IDs.
"""

revision = '934d5f7081a2'
down_revision = ('823c4e6f7091', '9f26f6c8bb14')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
