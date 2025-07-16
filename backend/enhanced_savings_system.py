#!/usr/bin/env python3
"""
Enhanced Savings System Database Migration Script
This script creates the new database tables and columns required for the enhanced savings system.
"""

import os
import sys
import asyncio
from sqlalchemy import create_engine, text, MetaData, Table, Column, String, Integer, Boolean, DateTime, Numeric, ForeignKey, inspect
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Add the backend directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

try:
    from app.core.config import settings
    from app.db.models import Base, User, Account, Transaction, Category, Transfer, SavingsPocket, UserSettings, TransferAllocation
    from app.db.base import engine
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Make sure you're running this script from the project root directory")
    sys.exit(1)

def get_database_url():
    """Get database URL from environment or use default"""
    return os.getenv('DATABASE_URL', 'postgresql://budgetlens:budgetlens@localhost/budgetlens_db')

async def create_tables():
    """Create all new tables and columns"""
    try:
        # Create async engine
        database_url = get_database_url()
        if database_url.startswith('postgresql://'):
            database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
        
        async_engine = create_async_engine(database_url, echo=True)
        
        # Create all tables
        async with async_engine.begin() as conn:
            print("Creating new tables...")
            await conn.run_sync(Base.metadata.create_all)
            print("✅ All tables created successfully")
            
        # Now add any missing columns to existing tables
        await add_missing_columns(async_engine)
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        raise

async def add_missing_columns(async_engine):
    """Add missing columns to existing tables"""
    try:
        async with async_engine.begin() as conn:
            # Check if columns exist and add them if they don't
            
            # Add new columns to accounts table
            await add_column_if_not_exists(conn, 'accounts', 'is_main_account', 'BOOLEAN DEFAULT FALSE')
            await add_column_if_not_exists(conn, 'accounts', 'account_classification', 'VARCHAR(50) DEFAULT \'spending\'')
            
            # Add new columns to transactions table
            await add_column_if_not_exists(conn, 'transactions', 'details', 'TEXT')
            await add_column_if_not_exists(conn, 'transactions', 'reference_number', 'VARCHAR(255)')
            await add_column_if_not_exists(conn, 'transactions', 'payment_method', 'VARCHAR(50)')
            await add_column_if_not_exists(conn, 'transactions', 'location', 'VARCHAR(255)')
            await add_column_if_not_exists(conn, 'transactions', 'savings_pocket_id', 'UUID REFERENCES savings_pockets(id)')
            
            # Add new columns to transfers table
            await add_column_if_not_exists(conn, 'transfers', 'suggested_savings_pocket_id', 'UUID REFERENCES savings_pockets(id)')
            await add_column_if_not_exists(conn, 'transfers', 'transfer_type', 'VARCHAR(50) DEFAULT \'regular\'')
            await add_column_if_not_exists(conn, 'transfers', 'confidence_score', 'DECIMAL(5,4)')
            await add_column_if_not_exists(conn, 'transfers', 'learning_source', 'VARCHAR(50)')
            
            print("✅ All missing columns added successfully")
            
    except Exception as e:
        print(f"❌ Error adding missing columns: {e}")
        raise

async def add_column_if_not_exists(conn, table_name, column_name, column_definition):
    """Add a column to a table if it doesn't exist"""
    try:
        # Check if column exists
        result = await conn.execute(text(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '{table_name}' AND column_name = '{column_name}'
        """))
        
        if not result.fetchone():
            # Column doesn't exist, add it
            await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"))
            print(f"✅ Added column {column_name} to {table_name}")
        else:
            print(f"⚠️  Column {column_name} already exists in {table_name}")
            
    except Exception as e:
        print(f"❌ Error adding column {column_name} to {table_name}: {e}")
        raise

async def create_default_user_settings():
    """Create default user settings for existing users"""
    try:
        database_url = get_database_url()
        if database_url.startswith('postgresql://'):
            database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
        
        async_engine = create_async_engine(database_url, echo=False)
        async_session = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
        
        async with async_session() as session:
            # Get all users
            result = await session.execute(text("SELECT id FROM users"))
            users = result.fetchall()
            
            for user_row in users:
                user_id = user_row[0]
                
                # Check if user settings already exist
                result = await session.execute(
                    text("SELECT id FROM user_settings WHERE user_id = :user_id"),
                    {"user_id": user_id}
                )
                
                if not result.fetchone():
                    # Create default settings
                    await session.execute(text("""
                        INSERT INTO user_settings (
                            id, user_id, show_transaction_details, show_reference_numbers, 
                            show_payment_methods, show_location_data, transaction_data_view, 
                            transfer_detection_enabled, auto_confirm_threshold, transfer_pattern_learning,
                            default_savings_view, show_savings_progress, created_at, updated_at
                        ) VALUES (
                            gen_random_uuid(), :user_id, TRUE, TRUE, TRUE, TRUE, 'enhanced', 
                            TRUE, 0.8, TRUE, 'by_account', TRUE, NOW(), NOW()
                        )
                    """), {"user_id": user_id})
                    
                    print(f"✅ Created default settings for user {user_id}")
            
            await session.commit()
            print("✅ Default user settings created successfully")
            
    except Exception as e:
        print(f"❌ Error creating default user settings: {e}")
        raise

async def update_main_account_classification():
    """Update account classification for existing accounts"""
    try:
        database_url = get_database_url()
        if database_url.startswith('postgresql://'):
            database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
        
        async_engine = create_async_engine(database_url, echo=False)
        async_session = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
        
        async with async_session() as session:
            # Set the first account as main account if no main account exists
            result = await session.execute(text("SELECT COUNT(*) FROM accounts WHERE is_main_account = TRUE"))
            main_account_count = result.scalar()
            
            if main_account_count == 0:
                # Set the first account as main account
                await session.execute(text("""
                    UPDATE accounts 
                    SET is_main_account = TRUE, account_classification = 'spending'
                    WHERE id = (SELECT id FROM accounts ORDER BY created_at ASC LIMIT 1)
                """))
                print("✅ Set first account as main account")
            
            # Update account classification for all accounts
            await session.execute(text("""
                UPDATE accounts 
                SET account_classification = CASE 
                    WHEN is_main_account = TRUE THEN 'spending'
                    ELSE 'savings'
                END
                WHERE account_classification IS NULL
            """))
            
            await session.commit()
            print("✅ Account classifications updated successfully")
            
    except Exception as e:
        print(f"❌ Error updating account classifications: {e}")
        raise

async def main():
    """Main migration function"""
    print("🚀 Starting Enhanced Savings System Migration...")
    print("=" * 50)
    
    try:
        # Step 1: Create tables
        await create_tables()
        print()
        
        # Step 2: Create default user settings
        await create_default_user_settings()
        print()
        
        # Step 3: Update account classifications
        await update_main_account_classification()
        print()
        
        print("=" * 50)
        print("✅ Migration completed successfully!")
        print("\nNew features available:")
        print("• Savings Pockets: Create custom savings goals within accounts")
        print("• Enhanced Transaction Data: Details, reference numbers, payment methods, locations")
        print("• User Settings: Customizable transaction display preferences")
        print("• Enhanced Transfer Detection: Better pattern recognition with pocket awareness")
        print("• Account Classification: Main spending account vs savings accounts")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
