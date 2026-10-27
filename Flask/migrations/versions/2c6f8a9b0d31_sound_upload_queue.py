"""Durable sound upload queue.

Revision ID: 2c6f8a9b0d31
Revises: 1b5d4e6f7082, a14c6e7f8b90
"""
from alembic import op
import sqlalchemy as sa


revision = '2c6f8a9b0d31'
down_revision = ('1b5d4e6f7082', 'a14c6e7f8b90')
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('sound_asset', sa.Column('original_byte_size', sa.BigInteger(), nullable=True))
    op.add_column('sound_asset', sa.Column('content_sha256', sa.String(length=64), nullable=True))
    op.create_index('ix_sound_asset_content_sha256', 'sound_asset', ['content_sha256'], unique=True)
    op.create_table(
        'sound_upload_job',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=False),
        sa.Column('uploaded_by_id', sa.Integer(), nullable=False),
        sa.Column('sound_asset_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('category', sa.String(length=20), server_default='music', nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('staged_filename', sa.String(length=255), nullable=False),
        sa.Column('mimetype', sa.String(length=100), nullable=False),
        sa.Column('byte_size', sa.BigInteger(), nullable=False),
        sa.Column('content_sha256', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='receiving', nullable=False),
        sa.Column('attempt_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('error_code', sa.String(length=80), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaign.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sound_asset_id'], ['sound_asset.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uploaded_by_id', 'idempotency_key', name='uq_sound_upload_job_user_key'),
    )
    op.create_index('ix_sound_upload_job_campaign_id', 'sound_upload_job', ['campaign_id'])
    op.create_index('ix_sound_upload_job_content_sha256', 'sound_upload_job', ['content_sha256'])
    op.create_index('ix_sound_upload_job_sound_asset_id', 'sound_upload_job', ['sound_asset_id'])
    op.create_index('ix_sound_upload_job_status', 'sound_upload_job', ['status'])
    op.create_index('ix_sound_upload_job_uploaded_by_id', 'sound_upload_job', ['uploaded_by_id'])


def downgrade():
    op.drop_index('ix_sound_upload_job_uploaded_by_id', table_name='sound_upload_job')
    op.drop_index('ix_sound_upload_job_status', table_name='sound_upload_job')
    op.drop_index('ix_sound_upload_job_sound_asset_id', table_name='sound_upload_job')
    op.drop_index('ix_sound_upload_job_campaign_id', table_name='sound_upload_job')
    op.drop_table('sound_upload_job')
    op.drop_index('ix_sound_asset_content_sha256', table_name='sound_asset')
    op.drop_column('sound_asset', 'content_sha256')
    op.drop_column('sound_asset', 'original_byte_size')
