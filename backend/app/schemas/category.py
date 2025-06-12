# backend/app/schemas/category.py - Updated with hierarchical support

from pydantic import BaseModel, field_validator, Field
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from enum import Enum

class CategoryType(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    SAVING = "SAVING"
    MANUAL_REVIEW = "MANUAL_REVIEW"

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category_type: CategoryType = CategoryType.EXPENSE
    parent_category_id: Optional[UUID] = None
    is_automatic_deduction: bool = False
    is_savings: bool = False  # Deprecated but kept for backward compatibility
    allow_auto_learning: bool = True

    @field_validator('allow_auto_learning')
    @classmethod
    def validate_auto_learning(cls, v, info):
        # Manual Review categories should not allow auto-learning
        if info.data.get('category_type') == CategoryType.MANUAL_REVIEW:
            return False
        return v

    @field_validator('is_savings')
    @classmethod
    def sync_savings_with_type(cls, v, info):
        # Auto-sync is_savings with category_type for backward compatibility
        if info.data.get('category_type') == CategoryType.SAVING:
            return True
        return v

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category_type: Optional[CategoryType] = None
    parent_category_id: Optional[UUID] = None
    is_automatic_deduction: Optional[bool] = None
    is_savings: Optional[bool] = None
    allow_auto_learning: Optional[bool] = None

    @field_validator('allow_auto_learning')
    @classmethod
    def validate_auto_learning_update(cls, v, info):
        if info.data.get('category_type') == CategoryType.MANUAL_REVIEW and v is True:
            return False
        return v

class CategoryInDB(CategoryBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

class Category(CategoryInDB):
    # Additional computed fields for hierarchy
    children: Optional[List['Category']] = None
    parent_name: Optional[str] = None
    full_path: Optional[str] = None
    transaction_count: Optional[int] = None

class CategoryHierarchy(BaseModel):
    """Structured representation of category hierarchy"""
    income: List[Category] = []
    expense: List[Category] = []
    saving: List[Category] = []
    manual_review: List[Category] = []

class CategoryStats(BaseModel):
    """Category statistics for analytics"""
    category_id: UUID
    category_name: str
    category_type: CategoryType
    transaction_count: int
    total_amount: float
    last_transaction_date: Optional[date] = None

# Support for self-referencing relationship
Category.model_rebuild()