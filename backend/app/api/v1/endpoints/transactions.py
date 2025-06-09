from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Transaction
from app.schemas.transaction import Transaction as TransactionSchema, TransactionFilter, TransactionUpdate
from app.services.categorization import CategorizationService
from datetime import date
from uuid import UUID

router = APIRouter()

@router.get("/", response_model=List[TransactionSchema])
async def list_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[UUID] = None,
    needs_review: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    if needs_review is not None:
        query = query.filter(Transaction.needs_review == needs_review)
    
    transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
    
    # Enrich with vendor and category names
    result = []
    for trans in transactions:
        trans_dict = TransactionSchema.from_orm(trans).dict()
        if trans.vendor:
            trans_dict["vendor_name"] = trans.vendor.name
        if trans.category:
            trans_dict["category_name"] = trans.category.name
        result.append(trans_dict)
    
    return result

@router.get("/review", response_model=List[TransactionSchema])
async def get_review_queue(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.needs_review == True
    ).order_by(Transaction.date.desc()).limit(limit).all()
    
    return transactions

@router.put("/{transaction_id}/categorize")
async def categorize_transaction(
    transaction_id: UUID,
    update: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if update.vendor_id:
        transaction.vendor_id = update.vendor_id
    if update.category_id:
        transaction.category_id = update.category_id
    if update.is_transfer is not None:
        transaction.is_transfer = update.is_transfer
    
    transaction.needs_review = False
    transaction.confidence_score = 1.0  # Manual categorization
    
    db.commit()
    db.refresh(transaction)
    
    return {"message": "Transaction categorized successfully"}

@router.post("/bulk-categorize")
async def bulk_categorize(
    transaction_ids: List[UUID],
    category_id: UUID,
    vendor_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    updated = db.query(Transaction).filter(
        Transaction.id.in_(transaction_ids),
        Transaction.user_id == current_user.id
    ).update({
        "category_id": category_id,
        "vendor_id": vendor_id,
        "needs_review": False,
        "confidence_score": 1.0
    }, synchronize_session=False)
    
    db.commit()
    
    return {"message": f"Updated {updated} transactions"}