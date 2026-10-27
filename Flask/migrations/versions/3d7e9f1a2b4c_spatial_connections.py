"""Spatial spaces, endpoints, and connections.

Revision ID: 3d7e9f1a2b4c
Revises: 2c6f8a9b0d31
"""
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

from alembic import op
import sqlalchemy as sa


revision = '3d7e9f1a2b4c'
down_revision = '2c6f8a9b0d31'
branch_labels = None
depends_on = None


def _physical_id(campaign_id, settlement_id, building_id):
    return str(uuid5(NAMESPACE_URL, f'kachhapa:physical-space:{campaign_id}:{settlement_id}:{building_id}'))


def upgrade():
    op.create_table(
        'spatial_space',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), nullable=True),
        sa.Column('building_id', sa.String(length=160), nullable=True),
        sa.Column('parent_space_id', sa.String(length=36), nullable=True),
        sa.Column('physical_key', sa.String(length=255), nullable=True),
        sa.Column('name', sa.String(length=160), nullable=False),
        sa.Column('space_type', sa.String(length=24), nullable=False),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('coordinate_system', sa.JSON(), nullable=False),
        sa.Column('environment_settings', sa.JSON(), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=False),
        sa.Column('independent_blueprint', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("space_type IN ('physical','extradimensional')", name='ck_spatial_space_type'),
        sa.CheckConstraint("status IN ('planned','draft','complete')", name='ck_spatial_space_status'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_space_id'], ['spatial_space.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['settlement_id'], ['world_atlas_location.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('physical_key'),
    )
    op.create_index('ix_spatial_space_campaign_id', 'spatial_space', ['campaign_id'])
    op.create_index('ix_spatial_space_settlement_id', 'spatial_space', ['settlement_id'])
    op.create_index('ix_spatial_space_building_id', 'spatial_space', ['building_id'])
    op.create_index('ix_spatial_space_parent_space_id', 'spatial_space', ['parent_space_id'])

    op.create_table(
        'spatial_endpoint',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('space_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=True),
        sa.Column('endpoint_type', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('local_position', sa.JSON(), nullable=True),
        sa.Column('local_orientation', sa.JSON(), nullable=True),
        sa.Column('geometry_reference', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('planned','positioned')", name='ck_spatial_endpoint_status'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['space_id'], ['spatial_space.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_spatial_endpoint_campaign_id', 'spatial_endpoint', ['campaign_id'])
    op.create_index('ix_spatial_endpoint_space_id', 'spatial_endpoint', ['space_id'])

    op.create_table(
        'spatial_connection',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('source_endpoint_id', sa.String(length=36), nullable=False),
        sa.Column('destination_endpoint_id', sa.String(length=36), nullable=False),
        sa.Column('connection_type', sa.String(length=24), nullable=False),
        sa.Column('bidirectional', sa.Boolean(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('traversal_duration_seconds', sa.Float(), nullable=True),
        sa.Column('visible_through_opening', sa.Boolean(), nullable=False),
        sa.Column('transition_effect', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("connection_type IN ('physical','dimensional','teleportation')", name='ck_spatial_connection_type'),
        sa.CheckConstraint("status IN ('draft','ready')", name='ck_spatial_connection_status'),
        sa.CheckConstraint('traversal_duration_seconds IS NULL OR traversal_duration_seconds >= 0', name='ck_spatial_connection_duration'),
        sa.CheckConstraint('source_endpoint_id <> destination_endpoint_id', name='ck_spatial_connection_distinct_endpoints'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['destination_endpoint_id'], ['spatial_endpoint.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['source_endpoint_id'], ['spatial_endpoint.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_spatial_connection_campaign_id', 'spatial_connection', ['campaign_id'])
    op.create_index('ix_spatial_connection_source_endpoint_id', 'spatial_connection', ['source_endpoint_id'])
    op.create_index('ix_spatial_connection_destination_endpoint_id', 'spatial_connection', ['destination_endpoint_id'])

    connection = op.get_bind()
    locations = connection.execute(sa.text(
        'SELECT id, campaign_id, buildings FROM world_atlas_location'
    )).mappings()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    table = sa.table('spatial_space',
        sa.column('id', sa.String), sa.column('campaign_id', sa.Integer), sa.column('settlement_id', sa.Integer),
        sa.column('building_id', sa.String), sa.column('physical_key', sa.String), sa.column('name', sa.String),
        sa.column('space_type', sa.String), sa.column('status', sa.String), sa.column('coordinate_system', sa.JSON),
        sa.column('environment_settings', sa.JSON), sa.column('metadata', sa.JSON),
        sa.column('independent_blueprint', sa.JSON), sa.column('created_at', sa.DateTime), sa.column('updated_at', sa.DateTime))
    rows = []
    for location in locations:
        buildings = location['buildings'] or []
        if isinstance(buildings, str):
            import json
            buildings = json.loads(buildings)
        for building in buildings if isinstance(buildings, list) else []:
            if not isinstance(building, dict) or building.get('id') in (None, ''):
                continue
            building_id = str(building['id'])
            rows.append({
                'id': _physical_id(location['campaign_id'], location['id'], building_id),
                'campaign_id': location['campaign_id'], 'settlement_id': location['id'],
                'building_id': building_id,
                'physical_key': f"{location['campaign_id']}:{location['id']}:{building_id}",
                'name': f"{str(building.get('name') or 'Building')[:140]} interior",
                'space_type': 'physical', 'status': 'complete',
                'coordinate_system': {'unit': 'feet', 'origin': 'building_local'},
                'environment_settings': {}, 'metadata': {'generated_for_building': True},
                'independent_blueprint': None, 'created_at': now, 'updated_at': now,
            })
    if rows:
        op.bulk_insert(table, rows)


def downgrade():
    op.drop_index('ix_spatial_connection_destination_endpoint_id', table_name='spatial_connection')
    op.drop_index('ix_spatial_connection_source_endpoint_id', table_name='spatial_connection')
    op.drop_index('ix_spatial_connection_campaign_id', table_name='spatial_connection')
    op.drop_table('spatial_connection')
    op.drop_index('ix_spatial_endpoint_space_id', table_name='spatial_endpoint')
    op.drop_index('ix_spatial_endpoint_campaign_id', table_name='spatial_endpoint')
    op.drop_table('spatial_endpoint')
    op.drop_index('ix_spatial_space_parent_space_id', table_name='spatial_space')
    op.drop_index('ix_spatial_space_building_id', table_name='spatial_space')
    op.drop_index('ix_spatial_space_settlement_id', table_name='spatial_space')
    op.drop_index('ix_spatial_space_campaign_id', table_name='spatial_space')
    op.drop_table('spatial_space')
