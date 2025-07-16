# backend/app/services/category.py - New enhanced category service

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from app.db.models import Category, Transaction, CategoryType
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryHierarchy, CategoryStats
import logging

logger = logging.getLogger(__name__)

class CategoryService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def create_default_categories(self) -> Dict[str, List[Category]]:
        """Create default category structure for new users"""
        default_categories = {
            CategoryType.INCOME: [
                {"name": "Salary", "is_automatic_deduction": True},
                {"name": "Other Income"}
            ],
            CategoryType.EXPENSE: [
                # Housing
                {"name": "Housing", "children": [
                    "Rent/Mortgage", "Utilities", "Internet/Phone", "Home Insurance", "Maintenance"
                ]},
                # Transportation
                {"name": "Transportation", "children": [
                    "Public Transport", "Car Payment", "Fuel", "Car Insurance", "Car Maintenance"
                ]},
                # Food
                {"name": "Food", "children": [
                    "Groceries", "Restaurants", "Coffee/Snacks", "Work Lunches"
                ]},
                # Personal
                {"name": "Personal", "children": [
                    "Healthcare", "Clothing", "Personal Care", "Entertainment", "Education"
                ]},
                # Financial
                {"name": "Financial", "children": [
                    "Bank Fees", "Insurance", "Loans", "Credit Card Fees"
                ]}
            ],
            CategoryType.SAVING: [
                {"name": "Emergency Fund"},
                {"name": "Retirement Savings"},
                {"name": "Vacation Fund"},
                {"name": "House Down Payment"},
                {"name": "Investment Savings"}
            ],
            CategoryType.MANUAL_REVIEW: [
                {"name": "TWINT Payments", "allow_auto_learning": False},
                {"name": "ATM Withdrawals", "allow_auto_learning": False},
                {"name": "Unknown Bank Transfers", "allow_auto_learning": False},
                {"name": "Manual Review", "allow_auto_learning": False}
            ],
            CategoryType.TRANSFER: [
                {"name": "Account Transfers", "allow_auto_learning": True}
            ]
        }
        
        created_categories = {}
        
        for category_type, categories in default_categories.items():
            created_categories[category_type.value] = []
            
            for cat_data in categories:
                if isinstance(cat_data, dict) and "children" in cat_data:
                    # Create parent category
                    parent_category = self._create_category({
                        "name": cat_data["name"],
                        "category_type": category_type,
                        "allow_auto_learning": cat_data.get("allow_auto_learning", True)
                    })
                    created_categories[category_type.value].append(parent_category)
                    
                    # Create child categories
                    for child_name in cat_data["children"]:
                        child_category = self._create_category({
                            "name": child_name,
                            "category_type": category_type,
                            "parent_category_id": parent_category.id,
                            "allow_auto_learning": cat_data.get("allow_auto_learning", True)
                        })
                        created_categories[category_type.value].append(child_category)
                else:
                    # Simple category
                    category = self._create_category({
                        "name": cat_data.get("name", cat_data) if isinstance(cat_data, dict) else cat_data,
                        "category_type": category_type,
                        "is_automatic_deduction": cat_data.get("is_automatic_deduction", False) if isinstance(cat_data, dict) else False,
                        "allow_auto_learning": cat_data.get("allow_auto_learning", True) if isinstance(cat_data, dict) else True
                    })
                    created_categories[category_type.value].append(category)
        
        logger.info(f"Created default categories for user {self.user_id}")
        return created_categories
    
    def _create_category(self, data: Dict[str, Any]) -> Category:
        """Internal method to create a category"""
        category = Category(
            user_id=self.user_id,
            **data
        )
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return category
    
    def get_categories_hierarchical(self) -> CategoryHierarchy:
        """Get categories organized by type in hierarchical structure"""
        categories = self.db.query(Category).filter(
            Category.user_id == self.user_id
        ).order_by(Category.category_type, Category.name).all()
        
        # Group by type
        hierarchy = CategoryHierarchy()
        
        for category in categories:
            category_dict = {
                "id": category.id,
                "user_id": category.user_id,
                "name": category.name,
                "category_type": category.category_type,
                "parent_category_id": category.parent_category_id,
                "is_automatic_deduction": category.is_automatic_deduction,
                "is_savings": category.is_savings,
                "allow_auto_learning": category.allow_auto_learning,
                "created_at": category.created_at,
                "transaction_count": self._get_transaction_count(category.id)
            }
            
            # Add parent name if applicable
            if category.parent_category_id:
                parent = self.db.query(Category).filter(Category.id == category.parent_category_id).first()
                if parent:
                    category_dict["parent_name"] = parent.name
                    category_dict["full_path"] = f"{parent.name} > {category.name}"
            else:
                category_dict["full_path"] = category.name
            
            # Add to appropriate list
            if category.category_type == CategoryType.INCOME:
                hierarchy.income.append(category_dict)
            elif category.category_type == CategoryType.EXPENSE:
                hierarchy.expense.append(category_dict)
            elif category.category_type == CategoryType.SAVING:
                hierarchy.saving.append(category_dict)
            elif category.category_type == CategoryType.MANUAL_REVIEW:
                hierarchy.manual_review.append(category_dict)
            elif category.category_type == CategoryType.TRANSFER:
                hierarchy.transfer.append(category_dict)
        
        return hierarchy
    
    def _get_transaction_count(self, category_id: str) -> int:
        """Get transaction count for a category"""
        return self.db.query(func.count(Transaction.id)).filter(
            Transaction.category_id == category_id,
            Transaction.user_id == self.user_id
        ).scalar() or 0
    
    def get_categories_for_auto_learning(self) -> List[Category]:
        """Get categories that allow auto-learning (exclude Manual Review)"""
        return self.db.query(Category).filter(
            Category.user_id == self.user_id,
            Category.allow_auto_learning == True,
            Category.category_type != CategoryType.MANUAL_REVIEW
        ).all()
    
    def get_manual_review_categories(self) -> List[Category]:
        """Get categories specifically for manual review"""
        return self.db.query(Category).filter(
            Category.user_id == self.user_id,
            Category.category_type == CategoryType.MANUAL_REVIEW
        ).all()
    
    def suggest_category_for_vendor(self, vendor_name: str, description: str) -> Optional[Category]:
        """Suggest appropriate category based on vendor patterns"""
        vendor_lower = vendor_name.lower()
        description_lower = description.lower()
        
        # Define vendor patterns for different categories
        category_patterns = {
            CategoryType.INCOME: [
                "salary", "wage", "payroll", "employer", "government", "pension", "dividend"
            ],
            CategoryType.EXPENSE: [
                "shop", "store", "restaurant", "cafe", "gas", "fuel", "supermarket", 
                "pharmacy", "doctor", "hospital", "insurance", "utility", "electric",
                "water", "internet", "phone", "rent"
            ],
            CategoryType.SAVING: [
                "investment", "savings", "retirement", "fund", "portfolio"
            ],
            CategoryType.MANUAL_REVIEW: [
                "twint", "atm", "cash", "withdrawal", "transfer", "payment"
            ]
        }
        
        # Check patterns
        for category_type, patterns in category_patterns.items():
            for pattern in patterns:
                if pattern in vendor_lower or pattern in description_lower:
                    # Find a category of this type
                    category = self.db.query(Category).filter(
                        Category.user_id == self.user_id,
                        Category.category_type == category_type,
                        Category.parent_category_id.is_(None)  # Prefer top-level categories
                    ).first()
                    if category:
                        return category
        
        # Default to a general expense category
        return self.db.query(Category).filter(
            Category.user_id == self.user_id,
            Category.category_type == CategoryType.EXPENSE,
            Category.name.ilike("%other%")
        ).first()
    
    def get_category_stats(self, period_months: int = 12) -> List[CategoryStats]:
        """Get category usage statistics"""
        from datetime import date, timedelta
        
        cutoff_date = date.today() - timedelta(days=period_months * 30)
        
        stats = self.db.query(
            Category.id,
            Category.name,
            Category.category_type,
            func.count(Transaction.id).label('transaction_count'),
            func.sum(Transaction.amount).label('total_amount'),
            func.max(Transaction.date).label('last_transaction_date')
        ).join(
            Transaction, Transaction.category_id == Category.id, isouter=True
        ).filter(
            Category.user_id == self.user_id,
            Transaction.date >= cutoff_date
        ).group_by(
            Category.id, Category.name, Category.category_type
        ).order_by(
            desc('transaction_count')
        ).all()
        
        return [
            CategoryStats(
                category_id=stat.id,
                category_name=stat.name,
                category_type=stat.category_type,
                transaction_count=stat.transaction_count or 0,
                total_amount=float(stat.total_amount or 0),
                last_transaction_date=stat.last_transaction_date
            )
            for stat in stats
        ]
    
    def ensure_default_categories_exist(self) -> bool:
        """Ensure user has default categories, create if missing"""
        category_count = self.db.query(func.count(Category.id)).filter(
            Category.user_id == self.user_id
        ).scalar()
        
        if category_count == 0:
            self.create_default_categories()
            return True
        return False