"""add shared sound library

Revision ID: 5b8e2f9c1a4d
Revises: 9a2d4e6f8b1c
"""

from alembic import op
import sqlalchemy as sa


revision = '5b8e2f9c1a4d'
down_revision = '9a2d4e6f8b1c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sound_asset',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('mimetype', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=20), server_default='music', nullable=False),
        sa.Column('uploaded_by_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('filename'),
    )


def downgrade():
    op.drop_table('sound_asset')
