# backend/app/api/v1/endpoints/categories.py - Updated with hierarchical categories

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Category, Transaction, CategoryType
from app.schemas.category import (
    Category as CategorySchema, 
    CategoryCreate, 
    CategoryUpdate, 
    CategoryHierarchy,
    CategoryStats
)
from app.services.category import CategoryService
from uuid import UUID
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=List[CategorySchema])
async def list_categories(
    hierarchical: bool = Query(False, description="Return categories in hierarchical structure"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all categories for the current user"""
    category_service = CategoryService(db, str(current_user.id))
    
    if hierarchical:
        # Return hierarchical structure
        hierarchy = category_service.get_categories_hierarchical()
        # Flatten for backward compatibility but maintain hierarchy info
        all_categories = []
        all_categories.extend(hierarchy.income)
        all_categories.extend(hierarchy.expense)
        all_categories.extend(hierarchy.saving)
        all_categories.extend(hierarchy.manual_review)
        return all_categories
    else:
        # Return flat list for backward compatibility
        categories = db.query(Category).filter(
            Category.user_id == current_user.id
        ).order_by(Category.category_type, Category.name).all()
        
        result = []
        for category in categories:
            category_dict = CategorySchema.from_orm(category).dict()
            # Add transaction count
            transaction_count = db.query(Transaction).filter(
                Transaction.category_id == category.id,
                Transaction.user_id == current_user.id
            ).count()
            category_dict["transaction_count"] = transaction_count
            result.append(category_dict)
        
        return result

@router.get("/hierarchy", response_model=CategoryHierarchy)
async def get_categories_hierarchy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get categories organized by type in hierarchical structure"""
    category_service = CategoryService(db, str(current_user.id))
    
    # Ensure user has default categories
    category_service.ensure_default_categories_exist()
    
    return category_service.get_categories_hierarchical()

@router.get("/stats", response_model=List[CategoryStats])
async def get_category_stats(
    period_months: int = Query(12, ge=1, le=24, description="Number of months to analyze"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get category usage statistics"""
    category_service = CategoryService(db, str(current_user.id))
    return category_service.get_category_stats(period_months)

@router.post("/", response_model=CategorySchema)
async def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new category"""
    logger.info(f"🔍 CREATE CATEGORY DEBUG: Received request from user {current_user.id}")
    logger.info(f"🔍 CREATE CATEGORY DEBUG: Category data: {category_in.dict()}")
    
    # Check for duplicate name within the same type
    existing = db.query(Category).filter(
        Category.user_id == current_user.id,
        Category.name == category_in.name,
        Category.category_type == category_in.category_type
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Category '{category_in.name}' already exists in {category_in.category_type.value} type"
        )
    
    # Validate parent category if specified
    if category_in.parent_category_id:
        parent = db.query(Category).filter(
            Category.id == category_in.parent_category_id,
            Category.user_id == current_user.id
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent category not found")
        
        # Ensure parent and child have same type
        if parent.category_type != category_in.category_type:
            raise HTTPException(
                status_code=400, 
                detail="Parent and child categories must have the same type"
            )
    
    category_data = category_in.dict()
    
    # Auto-disable learning for Manual Review categories
    if category_in.category_type == CategoryType.MANUAL_REVIEW:
        category_data["allow_auto_learning"] = False
    
    # Sync is_savings with category_type for backward compatibility
    if category_in.category_type == CategoryType.SAVING:
        category_data["is_savings"] = True
    
    category = Category(
        user_id=current_user.id,
        **category_data
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    
    logger.info(f"Created category: {category.name} ({category.category_type.value})")
    
    # Return with transaction count
    result = CategorySchema.from_orm(category).dict()
    result["transaction_count"] = 0
    return result

@router.put("/{category_id}", response_model=CategorySchema)
async def update_category(
    category_id: UUID,
    category_update: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update category"""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Validate name uniqueness within type if changing name or type
    if category_update.name or category_update.category_type:
        new_name = category_update.name or category.name
        new_type = category_update.category_type or category.category_type
        
        existing = db.query(Category).filter(
            Category.user_id == current_user.id,
            Category.name == new_name,
            Category.category_type == new_type,
            Category.id != category_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Category '{new_name}' already exists in {new_type.value} type"
            )
    
    # Validate parent category if changing
    if category_update.parent_category_id is not None:
        if category_update.parent_category_id:
            parent = db.query(Category).filter(
                Category.id == category_update.parent_category_id,
                Category.user_id == current_user.id
            ).first()
            if not parent:
                raise HTTPException(status_code=400, detail="Parent category not found")
            
            # Prevent circular references
            if parent.id == category.id:
                raise HTTPException(status_code=400, detail="Category cannot be its own parent")
            
            # Check if parent type matches
            parent_type = category_update.category_type or category.category_type
            if parent.category_type != parent_type:
                raise HTTPException(
                    status_code=400,
                    detail="Parent and child categories must have the same type"
                )
    
    # Update fields
    update_data = category_update.dict(exclude_unset=True)
    
    # Handle auto-learning rules
    if "category_type" in update_data and update_data["category_type"] == CategoryType.MANUAL_REVIEW:
        update_data["allow_auto_learning"] = False
    
    # Sync is_savings with category_type
    if "category_type" in update_data and update_data["category_type"] == CategoryType.SAVING:
        update_data["is_savings"] = True
    elif "category_type" in update_data and update_data["category_type"] != CategoryType.SAVING:
        update_data["is_savings"] = False
    
    for field, value in update_data.items():
        setattr(category, field, value)
    
    db.commit()
    db.refresh(category)
    
    logger.info(f"Updated category: {category.name} ({category.category_type.value})")
    
    # Return with transaction count
    transaction_count = db.query(Transaction).filter(
        Transaction.category_id == category.id,
        Transaction.user_id == current_user.id
    ).count()
    
    result = CategorySchema.from_orm(category).dict()
    result["transaction_count"] = transaction_count
    return result

@router.delete("/{category_id}")
async def delete_category(
    category_id: UUID,
    force: bool = Query(False, description="Force delete even if category has transactions"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete category"""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if category has transactions
    transaction_count = db.query(Transaction).filter(
        Transaction.category_id == category_id,
        Transaction.user_id == current_user.id
    ).count()
    
    if transaction_count > 0 and not force:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category with {transaction_count} transactions. Use force=true to delete anyway."
        )
    
    # Check if category has child categories
    child_count = db.query(Category).filter(
        Category.parent_category_id == category_id,
        Category.user_id == current_user.id
    ).count()
    
    if child_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category with {child_count} child categories. Delete child categories first."
        )
    
    # If force delete, update transactions to remove category reference
    if force and transaction_count > 0:
        db.query(Transaction).filter(
            Transaction.category_id == category_id,
            Transaction.user_id == current_user.id
        ).update({Transaction.category_id: None, Transaction.needs_review: True})
    
    db.delete(category)
    db.commit()
    
    logger.info(f"Deleted category: {category.name} (had {transaction_count} transactions)")
    
    return {
        "message": "Category deleted successfully",
        "affected_transactions": transaction_count if force else 0
    }

@router.post("/init-defaults")
async def initialize_default_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Initialize default category structure for user"""
    category_service = CategoryService(db, str(current_user.id))
    
    # Check if user already has categories
    existing_count = db.query(Category).filter(
        Category.user_id == current_user.id
    ).count()
    
    if existing_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"User already has {existing_count} categories. Use force=true to add defaults anyway."
        )
    
    created_categories = category_service.create_default_categories()
    
    total_created = sum(len(cats) for cats in created_categories.values())
    
    return {
        "message": f"Created {total_created} default categories",
        "categories_by_type": {
            category_type: len(categories) 
            for category_type, categories in created_categories.items()
        }
    }

@router.get("/types", response_model=List[str])
async def get_category_types():
    """Get available category types"""
    return [category_type.value for category_type in CategoryType]

@router.get("/manual-review", response_model=List[CategorySchema])
async def get_manual_review_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get categories specifically for manual review"""
    category_service = CategoryService(db, str(current_user.id))
    categories = category_service.get_manual_review_categories()
    
    return [CategorySchema.from_orm(category) for category in categories]