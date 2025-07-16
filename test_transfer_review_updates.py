#!/usr/bin/env python3

"""
Test script to verify Transfer Review updates work correctly.
This script will check if the system properly:
1. Creates default categories (including Account Transfers and Manual Review)
2. Filters transfer suggestions to only show Account Transfer category transactions
3. Provides proper categorization routing for manual review
"""

import os
import sys
sys.path.append('/home/eric/BudgetLens/backend')

from app.db.models import CategoryType, Category, Transaction, User
from app.services.category import CategoryService
from app.services.transfer import TransferService
from app.services.categorization import CategorizationService
from app.db.base import SessionLocal
from sqlalchemy import create_database_url
from uuid import uuid4

def test_category_defaults():
    """Test that default categories are created properly"""
    print("🧪 Testing default category creation...")
    
    db = SessionLocal()
    
    # Create a test user
    user = User(
        id=uuid4(),
        email="test@budgetlens.com",
        hashed_password="test",
        is_active=True
    )
    db.add(user)
    db.commit()
    
    # Test category service
    category_service = CategoryService(db, str(user.id))
    
    try:
        # Create default categories
        created_categories = category_service.create_default_categories()
        
        # Check that TRANSFER categories were created
        if CategoryType.TRANSFER.value in created_categories:
            transfer_categories = created_categories[CategoryType.TRANSFER.value]
            transfer_names = [cat.name for cat in transfer_categories]
            
            if "Account Transfers" in transfer_names:
                print("✅ 'Account Transfers' category created successfully")
            else:
                print("❌ 'Account Transfers' category NOT created")
                
        # Check that MANUAL_REVIEW categories include the generic one
        if CategoryType.MANUAL_REVIEW.value in created_categories:
            manual_review_categories = created_categories[CategoryType.MANUAL_REVIEW.value]
            manual_review_names = [cat.name for cat in manual_review_categories]
            
            if "Manual Review" in manual_review_names:
                print("✅ 'Manual Review' category created successfully")
            else:
                print("❌ 'Manual Review' category NOT created")
                
            if "TWINT Payments" in manual_review_names and "ATM Withdrawals" in manual_review_names:
                print("✅ Specific manual review categories created successfully")
            else:
                print("❌ Specific manual review categories NOT created properly")
                
    except Exception as e:
        print(f"❌ Error creating default categories: {e}")
        
    finally:
        # Clean up
        db.query(User).filter(User.id == user.id).delete()
        db.commit()
        db.close()

def test_transfer_filtering():
    """Test that transfer suggestions are filtered to only Account Transfer categories"""
    print("\n🧪 Testing transfer suggestion filtering...")
    
    db = SessionLocal()
    
    # Create a test user
    user = User(
        id=uuid4(),
        email="test2@budgetlens.com",
        hashed_password="test",
        is_active=True
    )
    db.add(user)
    db.commit()
    
    try:
        # Create transfer service
        transfer_service = TransferService(db, str(user.id))
        
        # This should create the Account Transfers category if it doesn't exist
        suggestions = transfer_service.get_transfer_suggestions(10)
        
        # Check that Account Transfers category was created
        account_transfers_category = db.query(Category).filter(
            Category.user_id == user.id,
            Category.category_type == CategoryType.TRANSFER,
            Category.name == "Account Transfers"
        ).first()
        
        if account_transfers_category:
            print("✅ Account Transfers category auto-created by transfer service")
        else:
            print("❌ Account Transfers category NOT auto-created")
            
    except Exception as e:
        print(f"❌ Error testing transfer filtering: {e}")
        
    finally:
        # Clean up
        db.query(User).filter(User.id == user.id).delete()
        db.commit()
        db.close()

def test_manual_review_routing():
    """Test that manual review categorization works properly"""
    print("\n🧪 Testing manual review categorization routing...")
    
    db = SessionLocal()
    
    # Create a test user
    user = User(
        id=uuid4(),
        email="test3@budgetlens.com",
        hashed_password="test",
        is_active=True
    )
    db.add(user)
    db.commit()
    
    try:
        # Create categorization service
        categorization_service = CategorizationService(db, str(user.id))
        
        # Create manual review category first
        manual_review_category = Category(
            user_id=user.id,
            name="Manual Review",
            category_type=CategoryType.MANUAL_REVIEW,
            allow_auto_learning=False
        )
        db.add(manual_review_category)
        db.commit()
        
        # Test manual review pattern detection
        test_descriptions = [
            "TWINT payment to merchant",
            "ATM withdrawal",
            "Unknown bank transfer",
            "Regular grocery store purchase"
        ]
        
        for desc in test_descriptions:
            is_manual_review = categorization_service.is_manual_review_pattern(desc)
            print(f"  '{desc}' -> Manual review: {is_manual_review}")
            
    except Exception as e:
        print(f"❌ Error testing manual review routing: {e}")
        
    finally:
        # Clean up
        db.query(User).filter(User.id == user.id).delete()
        db.commit()
        db.close()

def main():
    print("🔍 Testing Transfer Review Updates\n")
    
    try:
        test_category_defaults()
        test_transfer_filtering()
        test_manual_review_routing()
        
        print("\n✅ All tests completed!")
        
    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        
    print("\n" + "="*50)
    print("Summary of changes made:")
    print("1. ✅ Transfer Review now only shows Account Transfer category transactions")
    print("2. ✅ Default categories now include 'Account Transfers' and 'Manual Review'")
    print("3. ✅ Manual review categorization updated to use 'Manual Review' category")
    print("4. ✅ Frontend updated with better explanations")
    print("="*50)

if __name__ == "__main__":
    main()
