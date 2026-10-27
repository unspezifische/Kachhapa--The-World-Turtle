"""Repair sound upload deduplication fields skipped by stamped installs.

Revision ID: d93f6a8b2c10
Revises: c18f4a7d2e90
"""

from alembic import op
import sqlalchemy as sa


revision = 'd93f6a8b2c10'
down_revision = 'c18f4a7d2e90'
branch_labels = None
depends_on = None


def _column_names(table_name):
    return {
        column['name']
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _index_names(table_name):
    return {
        index['name']
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    required_tables = {'sound_asset', 'sound_upload_job'}
    missing_tables = required_tables - tables
    if missing_tables:
        raise RuntimeError(
            'Cannot repair sound upload deduplication fields because the '
            f'underlying table(s) are missing: {sorted(missing_tables)}'
        )

    sound_asset_columns = _column_names('sound_asset')
    if 'original_byte_size' not in sound_asset_columns:
        op.add_column(
            'sound_asset',
            sa.Column('original_byte_size', sa.BigInteger(), nullable=True),
        )
    if 'content_sha256' not in sound_asset_columns:
        op.add_column(
            'sound_asset',
            sa.Column('content_sha256', sa.String(length=64), nullable=True),
        )

    if 'ix_sound_asset_content_sha256' not in _index_names('sound_asset'):
        op.create_index(
            'ix_sound_asset_content_sha256',
            'sound_asset',
            ['content_sha256'],
            unique=True,
        )

    sound_upload_job_columns = _column_names('sound_upload_job')
    if 'content_sha256' not in sound_upload_job_columns:
        op.add_column(
            'sound_upload_job',
            sa.Column('content_sha256', sa.String(length=64), nullable=True),
        )

    if 'ix_sound_upload_job_content_sha256' not in _index_names('sound_upload_job'):
        op.create_index(
            'ix_sound_upload_job_content_sha256',
            'sound_upload_job',
            ['content_sha256'],
        )


def downgrade():
    # These objects belong to 2c6f8a9b0d31. This repair revision only restores
    # schema that Alembic already considers applied, so downgrade must not
    # remove fields from otherwise healthy databases.
    pass
