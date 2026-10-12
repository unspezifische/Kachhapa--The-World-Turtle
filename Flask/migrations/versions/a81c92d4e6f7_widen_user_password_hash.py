"""Widen user password hashes for scrypt.

Revision ID: a81c92d4e6f7
Revises: 7c1d2e3f4a5b
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa


revision = 'a81c92d4e6f7'
down_revision = '7c1d2e3f4a5b'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'user',
        'password',
        existing_type=sa.String(length=100),
        type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade():
    # Refuse to silently truncate modern hashes. A downgrade is only safe once
    # every stored value is known to fit the legacy 100-character column.
    connection = op.get_bind()
    longest_hash = connection.execute(
        sa.text('SELECT COALESCE(MAX(length(password)), 0) FROM "user"')
    ).scalar_one()
    if longest_hash > 100:
        raise RuntimeError(
            'Cannot narrow user.password while hashes longer than 100 characters exist.'
        )
    op.alter_column(
        'user',
        'password',
        existing_type=sa.String(length=255),
        type_=sa.String(length=100),
        existing_nullable=True,
    )
