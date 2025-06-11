from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Transaction, Vendor
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
    category_id: Optional[str] = Query(None),  # Changed to str to handle empty strings
    needs_review: Optional[str] = Query(None),  # Changed to str to handle empty strings
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    
    # Handle category_id parameter - convert empty string to None
    if category_id and category_id.strip():
        try:
            category_uuid = UUID(category_id)
            query = query.filter(Transaction.category_id == category_uuid)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid category_id format")
    
    # Handle needs_review parameter - convert empty string to None
    if needs_review and needs_review.strip():
        if needs_review.lower() in ['true', '1', 'yes']:
            query = query.filter(Transaction.needs_review == True)
        elif needs_review.lower() in ['false', '0', 'no']:
            query = query.filter(Transaction.needs_review == False)
        else:
            raise HTTPException(status_code=422, detail="needs_review must be true or false")
    
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
    learn_patterns: bool = Query(True, description="Learn patterns for auto-categorization"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not update.category_id:
        raise HTTPException(status_code=400, detail="Category ID is required")
    
    categorization_service = CategorizationService(db, str(current_user.id))
    
    if learn_patterns:
        # Use enhanced learning system
        result = categorization_service.categorize_transaction_and_learn(
            str(transaction_id),
            str(update.category_id),
            vendor_name=update.vendor_name if hasattr(update, 'vendor_name') else None
        )
        
        return {
            "message": "Transaction categorized and patterns learned",
            "similar_transactions_categorized": result["similar_transactions_categorized"],
            "vendor_created": result["vendor_created"],
            "pattern_learned": result["pattern_learned"]
        }
    else:
        # Simple categorization without learning
        if update.vendor_id:
            transaction.vendor_id = update.vendor_id
        if update.category_id:
            transaction.category_id = update.category_id
        if update.is_transfer is not None:
            transaction.is_transfer = update.is_transfer
        
        transaction.needs_review = False
        transaction.confidence_score = 1.0
        
        db.commit()
        db.refresh(transaction)
        
        return {"message": "Transaction categorized successfully"}

@router.get("/{transaction_id}/vendor-suggestions")
async def get_vendor_suggestions(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get vendor suggestions for a transaction based on learned patterns"""
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    categorization_service = CategorizationService(db, str(current_user.id))
    suggestions = categorization_service.get_vendor_suggestions(transaction.description)
    
    return {
        "transaction_id": str(transaction_id),
        "description": transaction.description,
        "suggestions": suggestions
    }

@router.get("/debug-vendor-extraction")
async def debug_vendor_extraction(
    description: str = Query(..., description="Transaction description to analyze"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Debug endpoint to see how vendor extraction and normalization works"""
    categorization_service = CategorizationService(db, str(current_user.id))
    debug_info = categorization_service.get_debug_info(description)
    
    return debug_info

@router.get("/patterns")
async def get_learned_patterns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all learned vendor patterns for debugging/review"""
    vendors = db.query(Vendor).filter(
        Vendor.user_id == current_user.id
    ).all()
    
    patterns = []
    for vendor in vendors:
        if vendor.patterns:
            patterns.append({
                "vendor_id": str(vendor.id),
                "vendor_name": vendor.name,
                "patterns": vendor.patterns,
                "category_name": vendor.default_category.name if vendor.default_category else None,
                "confidence_threshold": vendor.confidence_threshold
            })
    
    return {"learned_patterns": patterns}

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