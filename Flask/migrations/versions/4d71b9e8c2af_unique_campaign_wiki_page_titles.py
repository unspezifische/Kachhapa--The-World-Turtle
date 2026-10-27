"""Ensure page titles are unique within a campaign wiki.

Revision ID: 4d71b9e8c2af
Revises: 2ac04c2d4414
"""

from alembic import op


revision = '4d71b9e8c2af'
down_revision = '2ac04c2d4414'
branch_labels = None
depends_on = None


def upgrade():
    # Preserve the oldest page and its revision history if legacy routes created
    # the same title more than once.
    op.execute("""
        WITH duplicate_pages AS (
            SELECT id,
                   MIN(id) OVER (PARTITION BY wiki_id, title) AS keeper_id
            FROM page
        )
        UPDATE revisions
        SET page_id = duplicate_pages.keeper_id
        FROM duplicate_pages
        WHERE revisions.page_id = duplicate_pages.id
          AND duplicate_pages.id <> duplicate_pages.keeper_id
    """)
    op.execute("""
        DELETE FROM page
        USING (
            SELECT id,
                   MIN(id) OVER (PARTITION BY wiki_id, title) AS keeper_id
            FROM page
        ) AS duplicate_pages
        WHERE page.id = duplicate_pages.id
          AND duplicate_pages.id <> duplicate_pages.keeper_id
    """)
    op.create_unique_constraint(
        'uq_page_wiki_id_title',
        'page',
        ['wiki_id', 'title']
    )


def downgrade():
    op.drop_constraint(
        'uq_page_wiki_id_title',
        'page',
        type_='unique'
    )
