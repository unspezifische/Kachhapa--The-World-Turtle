"""add settlement economy

Revision ID: d8b73f9a4102
Revises: c3a964e27f10
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa

revision='d8b73f9a4102'
down_revision='c3a964e27f10'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('settlement_economy_state',sa.Column('campaign_id',sa.Integer(),nullable=False),sa.Column('day_index',sa.Integer(),nullable=False,server_default='0'),sa.ForeignKeyConstraint(['campaign_id'],['campaign.id']),sa.PrimaryKeyConstraint('campaign_id'))
    op.create_table('commodity_market',
        sa.Column('id',sa.Integer(),nullable=False),sa.Column('campaign_id',sa.Integer(),nullable=False),sa.Column('commodity_key',sa.String(80),nullable=False),sa.Column('name',sa.String(120),nullable=False),
        sa.Column('base_price_cp',sa.Integer(),nullable=False),sa.Column('current_price_cp',sa.Integer(),nullable=False),sa.Column('stock',sa.Float(),nullable=False),sa.Column('target_stock',sa.Float(),nullable=False),
        sa.Column('daily_demand',sa.Float(),nullable=False),sa.Column('daily_supply',sa.Float(),nullable=False),sa.Column('import_threshold',sa.Float(),nullable=False,server_default='.3'),
        sa.Column('import_quantity',sa.Float(),nullable=False),sa.Column('elasticity',sa.Float(),nullable=False,server_default='.65'),sa.Column('last_imported',sa.Float(),nullable=False,server_default='0'),
        sa.ForeignKeyConstraint(['campaign_id'],['campaign.id']),sa.PrimaryKeyConstraint('id'),sa.UniqueConstraint('campaign_id','commodity_key',name='uq_commodity_market_campaign_key'))
    op.create_index('ix_commodity_market_campaign_id','commodity_market',['campaign_id'])
    op.create_table('settlement_business',
        sa.Column('id',sa.Integer(),nullable=False),sa.Column('campaign_id',sa.Integer(),nullable=False),sa.Column('name',sa.String(120),nullable=False),sa.Column('business_type',sa.String(50),nullable=False),
        sa.Column('x',sa.Float(),nullable=False),sa.Column('y',sa.Float(),nullable=False),sa.Column('foot_traffic',sa.Float(),nullable=False,server_default='1'),sa.Column('quality',sa.Float(),nullable=False,server_default='1'),
        sa.Column('accessibility',sa.Float(),nullable=False,server_default='1'),sa.Column('cash_reserves_cp',sa.Integer(),nullable=False,server_default='0'),sa.Column('daily_capacity',sa.Integer(),nullable=False,server_default='100'),
        sa.Column('average_sale_cp',sa.Integer(),nullable=False,server_default='40'),sa.Column('cost_of_goods_rate',sa.Float(),nullable=False,server_default='.4'),sa.Column('daily_overhead_cp',sa.Integer(),nullable=False,server_default='500'),
        sa.Column('closure_grace_days',sa.Integer(),nullable=False,server_default='3'),sa.Column('slump_days',sa.Integer(),nullable=False,server_default='0'),sa.Column('player_owned',sa.Boolean(),nullable=False,server_default=sa.false()),
        sa.Column('closed',sa.Boolean(),nullable=False,server_default=sa.false()),sa.ForeignKeyConstraint(['campaign_id'],['campaign.id']),sa.PrimaryKeyConstraint('id'))
    op.create_index('ix_settlement_business_campaign_id','settlement_business',['campaign_id'])
    op.create_table('business_daily_ledger',
        sa.Column('id',sa.Integer(),nullable=False),sa.Column('business_id',sa.Integer(),nullable=False),sa.Column('day_index',sa.Integer(),nullable=False),sa.Column('customers',sa.Integer(),nullable=False),
        sa.Column('revenue_cp',sa.Integer(),nullable=False),sa.Column('costs_cp',sa.Integer(),nullable=False),sa.Column('profit_cp',sa.Integer(),nullable=False),sa.Column('cash_reserves_cp',sa.Integer(),nullable=False),sa.Column('market_share',sa.Float()),
        sa.ForeignKeyConstraint(['business_id'],['settlement_business.id'],ondelete='CASCADE'),sa.PrimaryKeyConstraint('id'),sa.UniqueConstraint('business_id','day_index',name='uq_business_ledger_day'))
    op.create_index('ix_business_daily_ledger_business_id','business_daily_ledger',['business_id'])


def downgrade():
    op.drop_index('ix_business_daily_ledger_business_id',table_name='business_daily_ledger');op.drop_table('business_daily_ledger')
    op.drop_index('ix_settlement_business_campaign_id',table_name='settlement_business');op.drop_table('settlement_business')
    op.drop_index('ix_commodity_market_campaign_id',table_name='commodity_market');op.drop_table('commodity_market')
    op.drop_table('settlement_economy_state')
