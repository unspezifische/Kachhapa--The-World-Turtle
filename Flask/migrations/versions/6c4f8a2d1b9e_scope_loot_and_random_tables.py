"""scope loot boxes and random tables

Revision ID: 6c4f8a2d1b9e
Revises: 5b8e2f9c1a4d
"""

from alembic import op
import sqlalchemy as sa


revision = '6c4f8a2d1b9e'
down_revision = '5b8e2f9c1a4d'
branch_labels = None
depends_on = None


def add_catalog_scope(table_name):
    op.add_column(table_name, sa.Column('campaign_id', sa.Integer(), nullable=True))
    op.add_column(table_name, sa.Column('system', sa.String(length=50), nullable=True))
    op.add_column(table_name, sa.Column('module_key', sa.String(length=120), nullable=True))
    op.add_column(table_name, sa.Column('is_preset', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column(table_name, sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key(f'fk_{table_name}_campaign_id', table_name, 'campaign', ['campaign_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key(f'fk_{table_name}_created_by_id', table_name, 'user', ['created_by_id'], ['id'])
    op.create_index(f'ix_{table_name}_campaign_id', table_name, ['campaign_id'])
    op.create_index(f'ix_{table_name}_system', table_name, ['system'])
    op.create_index(f'ix_{table_name}_module_key', table_name, ['module_key'])


def upgrade():
    add_catalog_scope('loot_box')
    add_catalog_scope('random_table')

    # Preserve the standard equipment packs as reusable D&D presets. Other
    # legacy records belonged to the original single-campaign installation,
    # so attach them to its oldest campaign instead of exposing them globally.
    op.execute("""
        UPDATE loot_box
        SET is_preset = true, system = 'D&D 5e'
        WHERE lower(name) IN (
            'burglar''s pack', 'diplomat''s pack', 'dungeoneer''s pack',
            'entertainer''s pack', 'explorer''s pack', 'priest''s pack',
            'scholar''s pack'
        )
    """)
    op.execute("""
        UPDATE loot_box
        SET campaign_id = (SELECT id FROM campaign ORDER BY id LIMIT 1)
        WHERE is_preset = false AND campaign_id IS NULL
    """)
    op.execute("""
        UPDATE random_table
        SET campaign_id = (SELECT id FROM campaign ORDER BY id LIMIT 1)
        WHERE campaign_id IS NULL
    """)


def drop_catalog_scope(table_name):
    op.drop_index(f'ix_{table_name}_module_key', table_name=table_name)
    op.drop_index(f'ix_{table_name}_system', table_name=table_name)
    op.drop_index(f'ix_{table_name}_campaign_id', table_name=table_name)
    op.drop_constraint(f'fk_{table_name}_created_by_id', table_name, type_='foreignkey')
    op.drop_constraint(f'fk_{table_name}_campaign_id', table_name, type_='foreignkey')
    for column in ('created_by_id', 'is_preset', 'module_key', 'system', 'campaign_id'):
        op.drop_column(table_name, column)


def downgrade():
    drop_catalog_scope('random_table')
    drop_catalog_scope('loot_box')
