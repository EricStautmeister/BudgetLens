"""Enhanced savings system with pockets and user settings

Revision ID: enhanced_savings_system
Revises: 73c49299cbbe
Create Date: 2025-01-16 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'enhanced_savings_system'
down_revision = '73c49299cbbe'
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to accounts table
    op.add_column('accounts', sa.Column('is_main_account', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('accounts', sa.Column('account_classification', sa.String(length=50), nullable=False, server_default='general'))
    
    # Add new columns to transactions table
    op.add_column('transactions', sa.Column('details', sa.Text(), nullable=True))
    op.add_column('transactions', sa.Column('reference_number', sa.String(length=100), nullable=True))
    op.add_column('transactions', sa.Column('payment_method', sa.String(length=50), nullable=True))
    op.add_column('transactions', sa.Column('merchant_category', sa.String(length=100), nullable=True))
    op.add_column('transactions', sa.Column('location', sa.String(length=255), nullable=True))
    op.add_column('transactions', sa.Column('savings_pocket_id', sa.UUID(), nullable=True))
    
    # Create savings_pockets table
    op.create_table('savings_pockets',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('account_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('current_amount', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('color', sa.String(length=7), nullable=True),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'account_id', 'name', name='_user_account_pocket_name_uc')
    )
    
    # Create user_settings table
    op.create_table('user_settings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('transaction_data_view', sa.String(length=50), nullable=False, server_default='standard'),
        sa.Column('show_transaction_details', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('show_reference_numbers', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('show_payment_methods', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('show_merchant_categories', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('show_location_data', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('transfer_detection_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('auto_confirm_threshold', sa.Float(), nullable=False, server_default='0.9'),
        sa.Column('transfer_pattern_learning', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('default_savings_view', sa.String(length=50), nullable=False, server_default='by_account'),
        sa.Column('show_savings_progress', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='_user_settings_uc')
    )
    
    # Add new columns to transfer_allocations table
    op.add_column('transfer_allocations', sa.Column('allocated_pocket_id', sa.UUID(), nullable=True))
    op.add_column('transfer_allocations', sa.Column('auto_confirmed', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('transfer_allocations', sa.Column('confidence_score', sa.Float(), nullable=True))
    
    # Add foreign key constraints
    op.create_foreign_key('fk_transactions_savings_pocket', 'transactions', 'savings_pockets', ['savings_pocket_id'], ['id'])
    op.create_foreign_key('fk_transfer_allocations_pocket', 'transfer_allocations', 'savings_pockets', ['allocated_pocket_id'], ['id'])
    
    # Add indexes for better performance
    op.create_index('idx_savings_pockets_user_active', 'savings_pockets', ['user_id', 'is_active'])
    op.create_index('idx_savings_pockets_account', 'savings_pockets', ['account_id'])
    op.create_index('idx_transactions_savings_pocket', 'transactions', ['savings_pocket_id'])
    op.create_index('idx_accounts_main_account', 'accounts', ['user_id', 'is_main_account'])
    op.create_index('idx_accounts_classification', 'accounts', ['account_classification'])

def downgrade():
    # Remove indexes
    op.drop_index('idx_accounts_classification')
    op.drop_index('idx_accounts_main_account')
    op.drop_index('idx_transactions_savings_pocket')
    op.drop_index('idx_savings_pockets_account')
    op.drop_index('idx_savings_pockets_user_active')
    
    # Remove foreign key constraints
    op.drop_constraint('fk_transfer_allocations_pocket', 'transfer_allocations', type_='foreignkey')
    op.drop_constraint('fk_transactions_savings_pocket', 'transactions', type_='foreignkey')
    
    # Remove columns from transfer_allocations
    op.drop_column('transfer_allocations', 'confidence_score')
    op.drop_column('transfer_allocations', 'auto_confirmed')
    op.drop_column('transfer_allocations', 'allocated_pocket_id')
    
    # Drop new tables
    op.drop_table('user_settings')
    op.drop_table('savings_pockets')
    
    # Remove columns from transactions
    op.drop_column('transactions', 'savings_pocket_id')
    op.drop_column('transactions', 'location')
    op.drop_column('transactions', 'merchant_category')
    op.drop_column('transactions', 'payment_method')
    op.drop_column('transactions', 'reference_number')
    op.drop_column('transactions', 'details')
    
    # Remove columns from accounts
    op.drop_column('accounts', 'account_classification')
    op.drop_column('accounts', 'is_main_account')
