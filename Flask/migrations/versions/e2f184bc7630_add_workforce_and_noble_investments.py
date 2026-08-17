"""add workforce and noble investments

Revision ID: e2f184bc7630
Revises: d8b73f9a4102
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa
revision='e2f184bc7630';down_revision='d8b73f9a4102';branch_labels=None;depends_on=None


def upgrade():
    op.create_table('occupation_definition',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('campaign_id',sa.Integer(),sa.ForeignKey('campaign.id'),nullable=False),sa.Column('occupation_key',sa.String(80),nullable=False),sa.Column('name',sa.String(120),nullable=False),sa.Column('ability_weights',sa.JSON(),nullable=False),sa.Column('target_workers',sa.Integer(),nullable=False,server_default='0'),sa.Column('minimum_suitability',sa.Float(),nullable=False,server_default='.42'),sa.Column('base_wage_cp',sa.Integer(),nullable=False,server_default='20'),sa.Column('produces_commodity_key',sa.String(80)),sa.UniqueConstraint('campaign_id','occupation_key',name='uq_occupation_campaign_key'))
    op.create_index('ix_occupation_definition_campaign_id','occupation_definition',['campaign_id'])
    op.create_table('noble_family',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('campaign_id',sa.Integer(),sa.ForeignKey('campaign.id'),nullable=False),sa.Column('name',sa.String(120),nullable=False),sa.Column('wealth_cp',sa.Integer(),nullable=False,server_default='0'),sa.Column('investment_risk',sa.Float(),nullable=False,server_default='.5'),sa.Column('active',sa.Boolean(),nullable=False,server_default=sa.true()))
    op.create_index('ix_noble_family_campaign_id','noble_family',['campaign_id'])
    op.create_table('settlement_economic_agent',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('campaign_id',sa.Integer(),sa.ForeignKey('campaign.id'),nullable=False),sa.Column('npc_id',sa.Integer(),sa.ForeignKey('npc.id'),unique=True),sa.Column('name',sa.String(120),nullable=False),sa.Column('strength',sa.Integer(),nullable=False,server_default='10'),sa.Column('dexterity',sa.Integer(),nullable=False,server_default='10'),sa.Column('constitution',sa.Integer(),nullable=False,server_default='10'),sa.Column('intelligence',sa.Integer(),nullable=False,server_default='10'),sa.Column('wisdom',sa.Integer(),nullable=False,server_default='10'),sa.Column('charisma',sa.Integer(),nullable=False,server_default='10'),sa.Column('economic_autonomy',sa.Boolean(),nullable=False,server_default=sa.true()),sa.Column('story_locked',sa.Boolean(),nullable=False,server_default=sa.false()),sa.Column('simulation_generated',sa.Boolean(),nullable=False,server_default=sa.true()),sa.Column('social_class',sa.String(30),nullable=False,server_default='commoner'),sa.Column('occupation_key',sa.String(80)),sa.Column('employer_business_id',sa.Integer(),sa.ForeignKey('settlement_business.id')),sa.Column('noble_family_id',sa.Integer(),sa.ForeignKey('noble_family.id')),sa.Column('wealth_cp',sa.Integer(),nullable=False,server_default='0'),sa.Column('career_cooldown_until_day',sa.Integer(),nullable=False,server_default='0'))
    op.create_index('ix_settlement_economic_agent_campaign_id','settlement_economic_agent',['campaign_id'])
    op.create_table('employment_history',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('agent_id',sa.Integer(),sa.ForeignKey('settlement_economic_agent.id',ondelete='CASCADE'),nullable=False),sa.Column('day_index',sa.Integer(),nullable=False),sa.Column('from_occupation',sa.String(80)),sa.Column('to_occupation',sa.String(80)),sa.Column('reason',sa.String(120),nullable=False))
    op.create_index('ix_employment_history_agent_id','employment_history',['agent_id'])
    op.create_table('noble_investment',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('family_id',sa.Integer(),sa.ForeignKey('noble_family.id',ondelete='CASCADE'),nullable=False),sa.Column('business_id',sa.Integer(),sa.ForeignKey('settlement_business.id',ondelete='CASCADE'),nullable=False),sa.Column('principal_cp',sa.Integer(),nullable=False,server_default='0'),sa.Column('total_dividends_cp',sa.Integer(),nullable=False,server_default='0'),sa.UniqueConstraint('family_id','business_id',name='uq_noble_family_business_investment'))
    op.create_index('ix_noble_investment_family_id','noble_investment',['family_id']);op.create_index('ix_noble_investment_business_id','noble_investment',['business_id'])
    op.create_table('noble_decision_ledger',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('family_id',sa.Integer(),sa.ForeignKey('noble_family.id',ondelete='CASCADE'),nullable=False),sa.Column('day_index',sa.Integer(),nullable=False),sa.Column('decision_type',sa.String(50),nullable=False),sa.Column('business_id',sa.Integer(),sa.ForeignKey('settlement_business.id')),sa.Column('amount_cp',sa.Integer(),nullable=False,server_default='0'),sa.Column('summary',sa.Text(),nullable=False))
    op.create_index('ix_noble_decision_ledger_family_id','noble_decision_ledger',['family_id'])


def downgrade():
    for index,table in [('ix_noble_decision_ledger_family_id','noble_decision_ledger'),('ix_noble_investment_business_id','noble_investment'),('ix_noble_investment_family_id','noble_investment'),('ix_employment_history_agent_id','employment_history')]: op.drop_index(index,table_name=table)
    op.drop_table('noble_decision_ledger');op.drop_table('noble_investment');op.drop_table('employment_history')
    op.drop_index('ix_settlement_economic_agent_campaign_id',table_name='settlement_economic_agent');op.drop_table('settlement_economic_agent')
    op.drop_index('ix_noble_family_campaign_id',table_name='noble_family');op.drop_table('noble_family')
    op.drop_index('ix_occupation_definition_campaign_id',table_name='occupation_definition');op.drop_table('occupation_definition')
