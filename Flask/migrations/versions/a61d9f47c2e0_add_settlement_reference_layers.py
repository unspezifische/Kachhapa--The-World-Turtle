"""add settlement reference layers

Revision ID: a61d9f47c2e0
Revises: f4a891c82d31
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa


revision = 'a61d9f47c2e0'
down_revision = 'f4a891c82d31'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'settlement_map_design',
        sa.Column(
            'reference_layers',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.alter_column('settlement_map_design', 'reference_layers', server_default=None)


def downgrade():
    op.drop_column('settlement_map_design', 'reference_layers')
