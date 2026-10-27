"""Normalize NPC occupations, roles, social positions, and combat profiles.

Revision ID: d5f7a9c2e4b6
Revises: c8d4e6f1a203
"""
from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import json
import re


revision = 'd5f7a9c2e4b6'
down_revision = 'c8d4e6f1a203'
branch_labels = None
depends_on = None


JSON = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')


def _legacy_occupation_backfill():
    """Copy only explicit legacy occupation labels; never infer classes or careers."""
    bind = op.get_bind()
    definitions = sa.table(
        'occupation_definition',
        sa.column('id', sa.Integer), sa.column('campaign_id', sa.Integer),
        sa.column('occupation_key', sa.String), sa.column('name', sa.String),
        sa.column('ability_weights', JSON), sa.column('target_workers', sa.Integer),
        sa.column('minimum_suitability', sa.Float), sa.column('base_wage_cp', sa.Integer),
        sa.column('description', sa.Text), sa.column('category', sa.String),
        sa.column('schedule_archetype', JSON), sa.column('activity_weights', JSON),
        sa.column('is_custom', sa.Boolean), sa.column('active', sa.Boolean),
    )
    associations = sa.table(
        'npc_occupation_association',
        sa.column('campaign_id', sa.Integer), sa.column('npc_id', sa.Integer),
        sa.column('occupation_id', sa.Integer), sa.column('status', sa.String),
        sa.column('is_primary', sa.Boolean), sa.column('notes', sa.Text),
        sa.column('provenance', JSON),
    )
    existing = {
        (campaign_id, str(key).casefold()): definition_id
        for definition_id, campaign_id, key in bind.execute(
            sa.select(definitions.c.id, definitions.c.campaign_id, definitions.c.occupation_key)
        )
    }
    npc_rows = bind.execute(sa.text('SELECT id, campaign_id, profile_metadata FROM npc')).all()
    for npc_id, campaign_id, raw_metadata in npc_rows:
        metadata = raw_metadata
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except (TypeError, ValueError):
                metadata = {}
        label = str((metadata or {}).get('occupation') or '').strip()
        if not label:
            continue
        key = re.sub(r'[^a-z0-9]+', '_', label.casefold()).strip('_') or 'occupation'
        definition_id = existing.get((campaign_id, key.casefold()))
        if definition_id is None:
            definition_id = bind.execute(definitions.insert().values(
                campaign_id=campaign_id, occupation_key=key, name=label,
                ability_weights={}, target_workers=0, minimum_suitability=.42,
                base_wage_cp=20, description=None, category=None,
                schedule_archetype={}, activity_weights={}, is_custom=True, active=True,
            ).returning(definitions.c.id)).scalar_one()
            existing[(campaign_id, key.casefold())] = definition_id
        bind.execute(associations.insert().values(
            campaign_id=campaign_id, npc_id=npc_id, occupation_id=definition_id,
            status='current', is_primary=True, notes='',
            provenance={'basis': 'legacy_metadata', 'field': 'profile_metadata.occupation'},
        ))


def upgrade():
    op.create_unique_constraint('uq_npc_id_campaign', 'npc', ['id', 'campaign_id'])
    op.add_column('occupation_definition', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('occupation_definition', sa.Column('category', sa.String(length=80), nullable=True))
    op.add_column('occupation_definition', sa.Column('schedule_archetype', JSON, nullable=False, server_default=sa.text("'{}'")))
    op.add_column('occupation_definition', sa.Column('activity_weights', JSON, nullable=False, server_default=sa.text("'{}'")))
    op.add_column('occupation_definition', sa.Column('is_custom', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('occupation_definition', sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_unique_constraint('uq_occupation_id_campaign', 'occupation_definition', ['id', 'campaign_id'])

    op.create_table(
        'npc_occupation_association',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('npc_id', sa.Integer(), nullable=False),
        sa.Column('occupation_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='current'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('started_at_world_date', JSON, nullable=True),
        sa.Column('ended_at_world_date', JSON, nullable=True),
        sa.Column('notes', sa.Text(), nullable=False, server_default=''),
        sa.Column('provenance', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('current','former','inactive')", name='ck_npc_occupation_status'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['npc_id', 'campaign_id'], ['npc.id', 'npc.campaign_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['occupation_id', 'campaign_id'], ['occupation_definition.id', 'occupation_definition.campaign_id'], ondelete='CASCADE'),
    )
    op.create_index('ix_npc_occupation_association_campaign_id', 'npc_occupation_association', ['campaign_id'])
    op.create_index('ix_npc_occupation_association_npc_id', 'npc_occupation_association', ['npc_id'])
    op.create_index('ix_npc_occupation_association_occupation_id', 'npc_occupation_association', ['occupation_id'])
    op.create_index('uq_npc_primary_current_occupation', 'npc_occupation_association', ['npc_id'], unique=True,
                    postgresql_where=sa.text("status = 'current' AND is_primary"),
                    sqlite_where=sa.text("status = 'current' AND is_primary"))

    op.create_table(
        'npc_role_assignment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('npc_id', sa.Integer(), nullable=False),
        sa.Column('occupation_association_id', sa.Integer(), nullable=True),
        sa.Column('position_title', sa.String(length=160), nullable=False),
        sa.Column('organization_name', sa.String(length=200), nullable=True),
        sa.Column('organization_element_id', sa.Integer(), nullable=True),
        sa.Column('employer_business_id', sa.Integer(), nullable=True),
        sa.Column('noble_family_id', sa.Integer(), nullable=True),
        sa.Column('workplace_location_id', sa.Integer(), nullable=True),
        sa.Column('workplace', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('responsibilities', JSON, nullable=False, server_default=sa.text("'[]'")),
        sa.Column('schedule_override', JSON, nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('compensation_cp', sa.Integer(), nullable=True),
        sa.Column('compensation_period', sa.String(length=40), nullable=True),
        sa.Column('started_at_world_date', JSON, nullable=True),
        sa.Column('ended_at_world_date', JSON, nullable=True),
        sa.Column('provenance', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.CheckConstraint("status IN ('active','former','inactive')", name='ck_npc_role_status'),
        sa.CheckConstraint('priority >= 0', name='ck_npc_role_priority'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['npc_id', 'campaign_id'], ['npc.id', 'npc.campaign_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['occupation_association_id'], ['npc_occupation_association.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_element_id'], ['game_element.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['employer_business_id'], ['settlement_business.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['noble_family_id'], ['noble_family.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workplace_location_id'], ['world_atlas_location.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_npc_role_assignment_campaign_id', 'npc_role_assignment', ['campaign_id'])
    op.create_index('ix_npc_role_assignment_npc_id', 'npc_role_assignment', ['npc_id'])

    op.create_table(
        'npc_social_position',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('npc_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=False),
        sa.Column('category', sa.String(length=80), nullable=True),
        sa.Column('organization_name', sa.String(length=200), nullable=True),
        sa.Column('organization_element_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('started_at_world_date', JSON, nullable=True),
        sa.Column('ended_at_world_date', JSON, nullable=True),
        sa.Column('notes', sa.Text(), nullable=False, server_default=''),
        sa.Column('provenance', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.CheckConstraint("status IN ('active','former','inactive')", name='ck_npc_social_position_status'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['npc_id', 'campaign_id'], ['npc.id', 'npc.campaign_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_element_id'], ['game_element.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_npc_social_position_campaign_id', 'npc_social_position', ['campaign_id'])
    op.create_index('ix_npc_social_position_npc_id', 'npc_social_position', ['npc_id'])

    op.create_table(
        'npc_combat_profile',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('npc_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=False, server_default='Primary'),
        sa.Column('authoring_mode', sa.String(length=24), nullable=False),
        sa.Column('ruleset_id', sa.String(length=80), nullable=True),
        sa.Column('ruleset_version', sa.String(length=40), nullable=True),
        sa.Column('template_creature_id', sa.Integer(), nullable=True),
        sa.Column('character_id', sa.Integer(), nullable=True),
        sa.Column('custom_definition', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('overrides', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('spellcasting', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('provenance', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("authoring_mode IN ('template','class','custom','none')", name='ck_npc_combat_authoring_mode'),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['npc_id', 'campaign_id'], ['npc.id', 'npc.campaign_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['template_creature_id'], ['creature_catalog.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['character_id'], ['character.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_npc_combat_profile_campaign_id', 'npc_combat_profile', ['campaign_id'])
    op.create_index('ix_npc_combat_profile_npc_id', 'npc_combat_profile', ['npc_id'])
    op.create_index('uq_npc_active_combat_profile', 'npc_combat_profile', ['npc_id'], unique=True,
                    postgresql_where=sa.text('is_active'), sqlite_where=sa.text('is_active'))

    op.create_table(
        'npc_class_progression',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('combat_profile_id', sa.Integer(), nullable=False),
        sa.Column('class_element_id', sa.Integer(), nullable=True),
        sa.Column('subclass_element_id', sa.Integer(), nullable=True),
        sa.Column('class_name', sa.String(length=100), nullable=False),
        sa.Column('subclass_name', sa.String(length=120), nullable=True),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('choices', JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column('source_ruleset', sa.String(length=80), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint('level >= 1 AND level <= 20', name='ck_npc_class_progression_level'),
        sa.ForeignKeyConstraint(['combat_profile_id'], ['npc_combat_profile.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['class_element_id'], ['game_element.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['subclass_element_id'], ['game_element.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('combat_profile_id', 'class_name', name='uq_npc_profile_class_name'),
    )
    op.create_index('ix_npc_class_progression_combat_profile_id', 'npc_class_progression', ['combat_profile_id'])

    if not context.is_offline_mode():
        _legacy_occupation_backfill()


def downgrade():
    op.drop_table('npc_class_progression')
    op.drop_index('uq_npc_active_combat_profile', table_name='npc_combat_profile')
    op.drop_table('npc_combat_profile')
    op.drop_table('npc_social_position')
    op.drop_table('npc_role_assignment')
    op.drop_index('uq_npc_primary_current_occupation', table_name='npc_occupation_association')
    op.drop_table('npc_occupation_association')
    op.drop_constraint('uq_occupation_id_campaign', 'occupation_definition', type_='unique')
    op.drop_column('occupation_definition', 'active')
    op.drop_column('occupation_definition', 'is_custom')
    op.drop_column('occupation_definition', 'activity_weights')
    op.drop_column('occupation_definition', 'schedule_archetype')
    op.drop_column('occupation_definition', 'category')
    op.drop_column('occupation_definition', 'description')
    op.drop_constraint('uq_npc_id_campaign', 'npc', type_='unique')
