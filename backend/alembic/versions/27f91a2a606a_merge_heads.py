"""merge heads

Revision ID: 27f91a2a606a
Revises: enhanced_savings_system, add_transfer_patterns
Create Date: 2025-07-16 21:49:02.489760

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '27f91a2a606a'
down_revision = ('enhanced_savings_system', 'add_transfer_patterns')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
