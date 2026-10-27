"""Join production's schema repair history with dev's atlas and voice history.

Revision ID: a45e607182b3
Revises: b15d7e9f3a21, ee95fb2bceed

The parents contain overlapping atlas additions. Their upgrades inspect the
schema so either server can apply the missing revisions without duplicating
columns or discarding existing data. This merge itself has no schema changes.
"""

revision = 'a45e607182b3'
down_revision = ('b15d7e9f3a21', 'ee95fb2bceed')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
