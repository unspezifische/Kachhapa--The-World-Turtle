"""Repair campaign wiki schema skipped by partially stamped installs.

Revision ID: e7c91a4b2d60
Revises: d93f6a8b2c10
"""

from alembic import op
import sqlalchemy as sa


revision = 'e7c91a4b2d60'
down_revision = 'd93f6a8b2c10'
branch_labels = None
depends_on = None


def _column_names(inspector, table_name):
    return {column['name'] for column in inspector.get_columns(table_name)}


def _constraint_names(inspector, table_name):
    return {
        constraint['name']
        for constraint in inspector.get_check_constraints(table_name)
        if constraint.get('name')
    }


def _index_names(inspector, table_name):
    return {
        index['name']
        for index in inspector.get_indexes(table_name)
        if index.get('name')
    }


def upgrade():
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    campaign_columns = _column_names(inspector, 'campaign')
    if 'wiki_permission' not in campaign_columns:
        op.add_column(
            'campaign',
            sa.Column(
                'wiki_permission', sa.String(length=24),
                server_default='everyone', nullable=False,
            ),
        )
    if 'ck_campaign_wiki_permission' not in _constraint_names(inspector, 'campaign'):
        op.create_check_constraint(
            'ck_campaign_wiki_permission',
            'campaign',
            "wiki_permission IN ('everyone','scribes_only','dm_only')",
        )

    if 'campaign_wiki_role' not in tables:
        op.create_table(
            'campaign_wiki_role',
            sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id', ondelete='CASCADE'), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), primary_key=True),
            sa.Column('role', sa.String(length=24), server_default='read_only', nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("role IN ('scribe','scribe_approval','read_only')", name='ck_campaign_wiki_role'),
        )
        op.execute(sa.text('''
            INSERT INTO campaign_wiki_role (campaign_id, user_id, role, updated_at)
            SELECT campaign.id, legacy_scribe.user_id, 'scribe', CURRENT_TIMESTAMP
            FROM campaign
            CROSS JOIN LATERAL unnest(COALESCE(campaign.scribes, ARRAY[]::integer[])) AS legacy_scribe(user_id)
            JOIN campaign_members
              ON campaign_members."campaignID" = campaign.id
             AND campaign_members."userID" = legacy_scribe.user_id
            ON CONFLICT (campaign_id, user_id) DO NOTHING
        '''))
    elif 'ck_campaign_wiki_role' not in _constraint_names(inspector, 'campaign_wiki_role'):
        op.create_check_constraint(
            'ck_campaign_wiki_role',
            'campaign_wiki_role',
            "role IN ('scribe','scribe_approval','read_only')",
        )

    if 'wiki_edit_proposal' not in tables:
        op.create_table(
            'wiki_edit_proposal',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id', ondelete='CASCADE'), nullable=False),
            sa.Column('page_id', sa.Integer(), sa.ForeignKey('page.id', ondelete='CASCADE'), nullable=True),
            sa.Column('page_title', sa.String(length=80), nullable=False),
            sa.Column('submitted_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=16), server_default='pending', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('reviewed_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint("status IN ('pending','approved','rejected')", name='ck_wiki_edit_proposal_status'),
        )
        op.create_index(
            'ix_wiki_edit_proposal_campaign_id',
            'wiki_edit_proposal',
            ['campaign_id'],
        )
    elif 'ix_wiki_edit_proposal_campaign_id' not in _index_names(inspector, 'wiki_edit_proposal'):
        op.create_index(
            'ix_wiki_edit_proposal_campaign_id',
            'wiki_edit_proposal',
            ['campaign_id'],
        )


def downgrade():
    # These objects belong to c18f4a7d2e90. This repair only restores schema
    # Alembic already considers applied, so downgrade must not remove them.
    pass
