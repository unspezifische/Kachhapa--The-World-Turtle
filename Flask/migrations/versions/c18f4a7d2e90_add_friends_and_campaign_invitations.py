"""Add friends, campaign invitations, and wiki permissions.

Revision ID: c18f4a7d2e90
Revises: a45e607182b3
"""
from alembic import op
import sqlalchemy as sa

revision = 'c18f4a7d2e90'
down_revision = 'a45e607182b3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'friend_connection',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_low_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_high_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requested_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=True),
        sa.Column('status', sa.String(length=16), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_low_id', 'user_high_id', name='uq_friend_connection_pair'),
        sa.CheckConstraint('user_low_id < user_high_id', name='ck_friend_connection_order'),
        sa.CheckConstraint("status IN ('pending','accepted')", name='ck_friend_connection_status'),
    )
    op.create_index('ix_friend_connection_user_low_id', 'friend_connection', ['user_low_id'])
    op.create_index('ix_friend_connection_user_high_id', 'friend_connection', ['user_high_id'])
    op.execute(sa.text('''
        INSERT INTO friend_connection (user_low_id, user_high_id, requested_by_id, status, created_at, updated_at)
        SELECT first_user.id, second_user.id, NULL, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM "user" AS first_user
        JOIN "user" AS second_user ON first_user.id < second_user.id
        ON CONFLICT (user_low_id, user_high_id) DO NOTHING
    '''))

    op.create_table(
        'campaign_invitation',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('campaign_id', sa.Integer(), sa.ForeignKey('campaign.id', ondelete='CASCADE'), nullable=False),
        sa.Column('inviter_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invitee_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(length=16), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('campaign_id', 'invitee_id', name='uq_campaign_invitation_invitee'),
        sa.CheckConstraint("status IN ('pending','accepted','declined','revoked')", name='ck_campaign_invitation_status'),
    )
    op.create_index('ix_campaign_invitation_campaign_id', 'campaign_invitation', ['campaign_id'])
    op.create_index('ix_campaign_invitation_invitee_id', 'campaign_invitation', ['invitee_id'])

    op.add_column('campaign', sa.Column('wiki_permission', sa.String(length=24), server_default='everyone', nullable=False))
    op.create_check_constraint(
        'ck_campaign_wiki_permission', 'campaign',
        "wiki_permission IN ('everyone','scribes_only','dm_only')",
    )
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
    op.create_index('ix_wiki_edit_proposal_campaign_id', 'wiki_edit_proposal', ['campaign_id'])


def downgrade():
    op.drop_index('ix_wiki_edit_proposal_campaign_id', table_name='wiki_edit_proposal')
    op.drop_table('wiki_edit_proposal')
    op.drop_table('campaign_wiki_role')
    op.drop_constraint('ck_campaign_wiki_permission', 'campaign', type_='check')
    op.drop_column('campaign', 'wiki_permission')
    op.drop_index('ix_campaign_invitation_invitee_id', table_name='campaign_invitation')
    op.drop_index('ix_campaign_invitation_campaign_id', table_name='campaign_invitation')
    op.drop_table('campaign_invitation')
    op.drop_index('ix_friend_connection_user_high_id', table_name='friend_connection')
    op.drop_index('ix_friend_connection_user_low_id', table_name='friend_connection')
    op.drop_table('friend_connection')
