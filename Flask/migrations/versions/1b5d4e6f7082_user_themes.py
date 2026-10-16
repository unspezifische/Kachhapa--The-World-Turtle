"""Account appearance preferences and private paired color themes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision='1b5d4e6f7082'
down_revision='0a4c3d5e6f71'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('user_appearance',sa.Column('user_id',sa.Integer(),sa.ForeignKey('user.id'),primary_key=True),sa.Column('revision',sa.Integer(),nullable=False,server_default='0'),sa.Column('preferences',sa.JSON().with_variant(JSONB(),'postgresql'),nullable=False))
    op.create_table('user_color_theme',sa.Column('id',sa.String(36),primary_key=True),sa.Column('user_id',sa.Integer(),sa.ForeignKey('user.id'),nullable=False),sa.Column('name',sa.String(100),nullable=False),sa.Column('version',sa.Integer(),nullable=False),sa.Column('revision',sa.Integer(),nullable=False),sa.Column('palettes',sa.JSON().with_variant(JSONB(),'postgresql'),nullable=False))
    op.create_index('ix_user_color_theme_user_id','user_color_theme',['user_id'])


def downgrade():
    op.drop_table('user_color_theme')
    op.drop_table('user_appearance')
