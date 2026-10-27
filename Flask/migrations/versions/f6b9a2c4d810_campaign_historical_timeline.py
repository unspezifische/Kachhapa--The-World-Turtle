"""add campaign historical timeline precision and npc ages

Revision ID: f6b9a2c4d810
Revises: e7c91a4b2d60
"""
from alembic import op
import sqlalchemy as sa


revision = 'f6b9a2c4d810'
down_revision = 'e7c91a4b2d60'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('npc', sa.Column('birth_year', sa.Integer(), nullable=True))
    op.add_column('npc', sa.Column('birth_season', sa.String(length=20), nullable=True))
    op.add_column('npc', sa.Column('birth_month_index', sa.Integer(), nullable=True))
    op.add_column('npc', sa.Column('birth_day', sa.Integer(), nullable=True))

    op.add_column('calendar_event', sa.Column('season', sa.String(length=20), nullable=True))
    with op.batch_alter_table('calendar_event') as batch:
        batch.alter_column('start_month_index', existing_type=sa.Integer(), nullable=True)
        batch.alter_column('start_day', existing_type=sa.Integer(), nullable=True)

    op.execute(sa.text("""
        UPDATE calendar_event AS event
        SET season = CASE
            WHEN calendar.format_slug = 'harptos' AND event.start_month_index = 8 AND event.start_day = 31 THEN 'Autumn'
            WHEN calendar.format_slug = 'gregorian' AND event.start_month_index IN (11, 0, 1) THEN 'Winter'
            WHEN calendar.format_slug = 'gregorian' AND event.start_month_index IN (2, 3, 4) THEN 'Spring'
            WHEN calendar.format_slug = 'gregorian' AND event.start_month_index IN (5, 6, 7) THEN 'Summer'
            WHEN calendar.format_slug = 'gregorian' THEN 'Autumn'
            WHEN event.start_month_index BETWEEN 0 AND 2 THEN 'Winter'
            WHEN event.start_month_index BETWEEN 3 AND 5 THEN 'Spring'
            WHEN event.start_month_index BETWEEN 6 AND 8 THEN 'Summer'
            ELSE 'Autumn'
        END
        FROM calendar
        WHERE event.calendar_id = calendar.id
    """))
    op.execute(sa.text("UPDATE calendar_event SET season = 'Winter' WHERE season IS NULL"))
    with op.batch_alter_table('calendar_event') as batch:
        batch.alter_column('season', existing_type=sa.String(length=20), nullable=False)

    op.create_table(
        'calendar_event_npc',
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('calendar_event.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('npc_id', sa.Integer(), sa.ForeignKey('npc.id', ondelete='CASCADE'), primary_key=True),
    )


def downgrade():
    op.drop_table('calendar_event_npc')
    op.execute(sa.text("""
        UPDATE calendar_event
        SET start_month_index = CASE season
            WHEN 'Winter' THEN 0 WHEN 'Spring' THEN 3 WHEN 'Summer' THEN 6 ELSE 9 END
        WHERE start_month_index IS NULL
    """))
    op.execute(sa.text("UPDATE calendar_event SET start_day = 1 WHERE start_day IS NULL"))
    with op.batch_alter_table('calendar_event') as batch:
        batch.alter_column('start_day', existing_type=sa.Integer(), nullable=False)
        batch.alter_column('start_month_index', existing_type=sa.Integer(), nullable=False)
        batch.drop_column('season')
    op.drop_column('npc', 'birth_day')
    op.drop_column('npc', 'birth_month_index')
    op.drop_column('npc', 'birth_season')
    op.drop_column('npc', 'birth_year')
