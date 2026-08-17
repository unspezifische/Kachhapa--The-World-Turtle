"""Repair settlement tables skipped by legacy ``flask db stamp head`` installs.

Revision ID: f78b42c91d03
Revises: a61d9f47c2e0
Create Date: 2026-08-10
"""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from alembic import op
import sqlalchemy as sa


revision = 'f78b42c91d03'
down_revision = 'a61d9f47c2e0'
branch_labels = None
depends_on = None


REVISION_GROUPS = (
    (
        {'lamplighter_route', 'street_lamp'},
        'b7e01c4f92d1_add_lamplighter_routes_and_street_lamps.py',
    ),
    (
        {'party_map_position', 'map_point_of_interest'},
        'c3a964e27f10_add_party_positions_and_map_points.py',
    ),
    (
        {'settlement_economy_state', 'commodity_market', 'settlement_business', 'business_daily_ledger'},
        'd8b73f9a4102_add_settlement_economy.py',
    ),
    (
        {
            'occupation_definition', 'noble_family', 'settlement_economic_agent',
            'employment_history', 'noble_investment', 'noble_decision_ledger',
        },
        'e2f184bc7630_add_workforce_and_noble_investments.py',
    ),
)


def run_revision(filename):
    path = Path(__file__).with_name(filename)
    spec = spec_from_file_location(f'settlement_repair_{path.stem}', path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    module.upgrade()


def table_names():
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade():
    for expected_tables, filename in REVISION_GROUPS:
        existing = table_names()
        missing = expected_tables - existing
        if not missing:
            continue
        if expected_tables & existing:
            raise RuntimeError(
                f'Cannot automatically repair partially-created settlement schema; missing {sorted(missing)}'
            )
        run_revision(filename)

    existing = table_names()
    if 'settlement_map_design' not in existing:
        run_revision('f4a891c82d31_add_settlement_map_design.py')

    columns = {column['name'] for column in sa.inspect(op.get_bind()).get_columns('settlement_map_design')}
    if 'reference_layers' not in columns:
        run_revision('a61d9f47c2e0_add_settlement_reference_layers.py')


def downgrade():
    # This revision repairs objects owned by earlier migrations. Those earlier
    # revisions remain responsible for removing them during a full downgrade.
    pass
