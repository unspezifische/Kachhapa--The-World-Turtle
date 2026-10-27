"""Calendar source column

Revision ID: 8ad06eea5e93
Revises: manual_merge_head
Create Date: 2026-09-06 20:50:19.173926

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '8ad06eea5e93'
down_revision = 'manual_merge_head'
branch_labels = None
depends_on = None

# Centralized list of tables that need the new source column
TARGET_TABLES = [
    'calendar', 
    'calendar_event', 
    'item', 
    'loot_box', 
    'npc', 
    'page', 
    'world_atlas_location'
]

def upgrade():
    # Production already has source columns from 06404e99d96f. Reconcile the
    # actual schema rather than replaying those additions on the other branch.
    bind = op.get_bind()
    for table_name in TARGET_TABLES:
        columns = {column['name']: column for column in sa.inspect(bind).get_columns(table_name)}
        if 'source' not in columns:
            op.add_column(table_name, sa.Column('source', sa.String(length=80), nullable=True))
        op.execute(sa.text(f"UPDATE {table_name} SET source = 'Unknown' WHERE source IS NULL"))
        if 'source' not in columns or columns['source']['nullable']:
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.alter_column('source', existing_type=sa.String(length=80), nullable=False)

    for table_name in ('campaign_module_installation', 'map_media_asset'):
        columns = {column['name']: column for column in sa.inspect(bind).get_columns(table_name)}
        if not columns['campaign_id']['nullable']:
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.alter_column('campaign_id', existing_type=sa.INTEGER(), nullable=True)
        if table_name == 'campaign_module_installation' and getattr(columns['installed_at']['type'], 'timezone', False):
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.alter_column('installed_at', existing_type=columns['installed_at']['type'],
                                     type_=sa.DateTime(), existing_nullable=False,
                                     existing_server_default=sa.text('now()'))

    for foreign_key in sa.inspect(bind).get_foreign_keys('street_lamp'):
        if foreign_key['constrained_columns'] == ['route_id'] and foreign_key['referred_table'] == 'lamplighter_route':
            if foreign_key.get('options', {}).get('ondelete'):
                with op.batch_alter_table('street_lamp') as batch_op:
                    batch_op.drop_constraint(foreign_key['name'], type_='foreignkey')
                    batch_op.create_foreign_key(foreign_key['name'], 'lamplighter_route', ['route_id'], ['id'])
            break
    else:
        with op.batch_alter_table('street_lamp') as batch_op:
            batch_op.create_foreign_key('street_lamp_route_id_fkey', 'lamplighter_route', ['route_id'], ['id'])


def downgrade():
    # 1. Cleanly drop the source columns during rollback
    for table_name in TARGET_TABLES:
        with op.batch_alter_table(table_name, schema=None) as batch_op:
            batch_op.drop_column('source')

    # 2. Revert the native structural variations
    with op.batch_alter_table('street_lamp', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_foreign_key(batch_op.f('street_lamp_route_id_fkey'), 'lamplighter_route', ['route_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('map_media_asset', schema=None) as batch_op:
        batch_op.alter_column('campaign_id',
               existing_type=sa.INTEGER(),
               nullable=False)

    with op.batch_alter_table('campaign_module_installation', schema=None) as batch_op:
        batch_op.alter_column('installed_at',
               existing_type=sa.DateTime(),
               type_=postgresql.TIMESTAMP(timezone=True),
               existing_nullable=False,
               existing_server_default=sa.text('now()'))
        batch_op.alter_column('campaign_id',
               existing_type=sa.INTEGER(),
               nullable=False)
