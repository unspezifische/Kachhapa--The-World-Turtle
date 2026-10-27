"""add optional end dates for timeline event ranges

Revision ID: c8d4e6f1a203
Revises: f6b9a2c4d810
"""
from alembic import op
import sqlalchemy as sa


revision = 'c8d4e6f1a203'
down_revision = 'f6b9a2c4d810'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('calendar_event') as batch:
        batch.alter_column('season', existing_type=sa.String(length=20), nullable=True)
        batch.add_column(sa.Column('end_year', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('end_season', sa.String(length=20), nullable=True))
        batch.add_column(sa.Column('end_month_index', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('end_day', sa.Integer(), nullable=True))


def downgrade():
    op.execute(sa.text("UPDATE calendar_event SET season = 'Winter' WHERE season IS NULL"))
    with op.batch_alter_table('calendar_event') as batch:
        batch.drop_column('end_day')
        batch.drop_column('end_month_index')
        batch.drop_column('end_season')
        batch.drop_column('end_year')
        batch.alter_column('season', existing_type=sa.String(length=20), nullable=False)
