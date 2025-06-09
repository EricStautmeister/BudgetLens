from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Category
from app.schemas.category import Category as CategorySchema, CategoryCreate, CategoryUpdate
from uuid import UUID

router = APIRouter()

@router.get("/", response_model=List[CategorySchema])
async def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    categories = db.query(Category).filter(
        Category.user_id == current_user.id
    ).order_by(Category.name).all()
    
    return categories

@router.post("/", response_model=CategorySchema)
async def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Check for duplicate name
    existing = db.query(Category).filter(
        Category.user_id == current_user.id,
        Category.name == category_in.name
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    category = Category(
        user_id=current_user.id,
        **category_in.dict()
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    
    return category

@router.put("/{category_id}", response_model=CategorySchema)
async def update_category(
    category_id: UUID,
    category_update: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    for field, value in category_update.dict(exclude_unset=True).items():
        setattr(category, field, value)
    
    db.commit()
    db.refresh(category)
    
    return category

@router.delete("/{category_id}")
async def delete_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if category has transactions
    from app.db.models import Transaction
    transaction_count = db.query(Transaction).filter(
        Transaction.category_id == category_id
    ).count()
    
    if transaction_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category with {transaction_count} transactions"
        )
    
    db.delete(category)
    db.commit()
    
    return {"message": "Category deleted successfully"}