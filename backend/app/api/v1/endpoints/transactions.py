from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Transaction, Vendor, Account, Category
from app.schemas.transaction import Transaction as TransactionSchema, TransactionFilter, TransactionUpdate
from app.services.categorization import CategorizationService
from app.services.account import AccountService
from app.utils.validation import validate_user_owns_resource, validate_multiple_user_resources
from app.utils.decorators import validate_transaction_update, validate_bulk_operations
from datetime import date
from uuid import UUID

router = APIRouter()

@router.get("/", response_model=List[TransactionSchema])
async def list_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    needs_review: Optional[str] = Query(None),
    exclude_transfers: bool = Query(False, description="Exclude transfer transactions"),
    search: Optional[str] = Query(None, description="Search in transaction descriptions, vendor names, and details"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    import logging
    logger = logging.getLogger(__name__)
    
    # Debug log the received parameters
    logger.info(f"🔍 TRANSACTIONS DEBUG: Received parameters:")
    logger.info(f"  - start_date: {start_date} (type: {type(start_date)})")
    logger.info(f"  - end_date: {end_date} (type: {type(end_date)})")
    logger.info(f"  - skip: {skip}, limit: {limit}")
    logger.info(f"  - category_id: {category_id}")
    logger.info(f"  - account_id: {account_id}")
    logger.info(f"  - needs_review: {needs_review}")
    logger.info(f"  - exclude_transfers: {exclude_transfers}")
    
    # Use eager loading to prevent N+1 queries
    query = db.query(Transaction).options(
        joinedload(Transaction.vendor),
        joinedload(Transaction.category),
        joinedload(Transaction.account)
    ).filter(Transaction.user_id == current_user.id)
    
    if start_date:
        logger.info(f"🔍 TRANSACTIONS DEBUG: Applying start_date filter >= {start_date}")
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        logger.info(f"🔍 TRANSACTIONS DEBUG: Applying end_date filter <= {end_date}")
        query = query.filter(Transaction.date <= end_date)
    
    # Handle account_id parameter
    if account_id and account_id.strip():
        try:
            account_uuid = UUID(account_id)
            query = query.filter(Transaction.account_id == account_uuid)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid account_id format")
    
    # Handle category_id parameter
    if category_id and category_id.strip():
        try:
            category_uuid = UUID(category_id)
            query = query.filter(Transaction.category_id == category_uuid)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid category_id format")
    
    # Handle needs_review parameter
    if needs_review and needs_review.strip():
        if needs_review.lower() in ['true', '1', 'yes']:
            query = query.filter(Transaction.needs_review == True)
        elif needs_review.lower() in ['false', '0', 'no']:
            query = query.filter(Transaction.needs_review == False)
        else:
            raise HTTPException(status_code=422, detail="needs_review must be true or false")
    
    # Exclude transfers if requested
    if exclude_transfers:
        query = query.filter(Transaction.is_transfer == False)
    
    # Handle search parameter
    if search and search.strip():
        search_term = f"%{search.strip()}%"
        query = query.filter(
            Transaction.description.ilike(search_term) |
            Transaction.details.ilike(search_term) |
            Transaction.reference_number.ilike(search_term) |
            Transaction.location.ilike(search_term)
        )
    
    # Debug: Log the final query construction
    logger.info(f"🔍 TRANSACTIONS DEBUG: About to execute query with date range: {start_date} to {end_date}")
    if search:
        logger.info(f"🔍 TRANSACTIONS DEBUG: Search term: '{search}'")
    
    transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
    
    # Debug: Log the results
    logger.info(f"🔍 TRANSACTIONS DEBUG: Found {len(transactions)} transactions")
    if transactions:
        logger.info(f"🔍 TRANSACTIONS DEBUG: Date range of results: {transactions[-1].date} to {transactions[0].date}")
        for i, trans in enumerate(transactions[:5]):  # Log first 5 transactions
            logger.info(f"🔍 TRANSACTIONS DEBUG:   Transaction {i+1}: {trans.date} - {trans.description} - Amount: {trans.amount}")
    
    result = []
    for trans in transactions:
        trans_dict = TransactionSchema.from_orm(trans).dict()
        if trans.vendor:
            trans_dict["vendor_name"] = trans.vendor.name
        if trans.category:
            trans_dict["category_name"] = trans.category.name
        if trans.account:
            trans_dict["account_name"] = trans.account.name
            trans_dict["account_type"] = trans.account.account_type.value
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
@validate_transaction_update
async def categorize_transaction(
    transaction_id: UUID,
    update: TransactionUpdate,
    learn_patterns: bool = Query(True, description="Learn patterns for auto-categorization"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Validation happens automatically via decorator
    if not update.category_id:
        raise HTTPException(status_code=400, detail="Category ID is required")
    
    # Get the validated transaction (we know it exists due to decorator validation)
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id
    ).first()
    
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

@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: UUID,
    update: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a transaction with new information"""
    # Validate that the user owns the transaction
    transaction = validate_user_owns_resource(
        db, str(current_user.id), str(transaction_id), Transaction
    )
    
    # Update fields if provided
    if update.vendor_id is not None:
        transaction.vendor_id = update.vendor_id
    if update.category_id is not None:
        transaction.category_id = update.category_id
    if update.is_transfer is not None:
        transaction.is_transfer = update.is_transfer
    if update.details is not None:
        transaction.details = update.details
    if update.reference_number is not None:
        transaction.reference_number = update.reference_number
    if update.payment_method is not None:
        transaction.payment_method = update.payment_method
    if update.merchant_category is not None:
        transaction.merchant_category = update.merchant_category
    if update.location is not None:
        transaction.location = update.location
    if update.savings_pocket_id is not None:
        transaction.savings_pocket_id = update.savings_pocket_id
    
    db.commit()
    db.refresh(transaction)
    
    return {"message": "Transaction updated successfully"}

@router.get("/{transaction_id}/vendor-suggestions")
async def get_vendor_suggestions(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get vendor suggestions for a transaction based on learned patterns"""
    transaction = validate_user_owns_resource(
        db, str(current_user.id), str(transaction_id), Transaction
    )
    
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
@validate_bulk_operations
async def bulk_categorize(
    transaction_ids: List[UUID],
    category_id: UUID,
    vendor_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Validation happens automatically via decorator
    # Perform the update
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

@router.put("/{transaction_id}/assign-account")
async def assign_account(
    transaction_id: UUID,
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Assign a transaction to a specific account"""
    # Validate account ownership
    account = validate_user_owns_resource(
        db, str(current_user.id), str(account_id), Account
    )
    
    # Validate transaction ownership
    transaction = validate_user_owns_resource(
        db, str(current_user.id), str(transaction_id), Transaction
    )
    
    # Check if account is active
    if not account.is_active:
        raise HTTPException(status_code=400, detail="Cannot assign to inactive account")
    
    # Assign account
    transaction.account_id = account_id
    db.commit()
    
    return {
        "message": "Account assigned successfully",
        "transaction_id": str(transaction_id),
        "account_id": str(account_id),
        "account_name": account.name
    }

@router.post("/bulk-assign-account")
@validate_bulk_operations
async def bulk_assign_account(
    transaction_ids: List[UUID],
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Assign multiple transactions to an account"""
    # Validation happens automatically via decorator
    # Get account for response (we know it exists due to decorator validation)
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    # Update transactions
    updated = db.query(Transaction).filter(
        Transaction.id.in_(transaction_ids),
        Transaction.user_id == current_user.id
    ).update({
        "account_id": account_id
    }, synchronize_session=False)
    
    db.commit()
    
    return {
        "message": f"Assigned {updated} transactions to account",
        "account_name": account.name,
        "updated_count": updated
    }

@router.get("/unassigned-accounts")
async def get_unassigned_account_transactions(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get transactions that haven't been assigned to an account"""
    transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.account_id.is_(None)
    ).order_by(Transaction.date.desc()).limit(limit).all()
    
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

@router.post("/auto-assign-accounts")
async def auto_assign_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Auto-assign transactions to accounts based on source_account field or default account"""
    account_service = AccountService(db, str(current_user.id))
    default_account = account_service.get_default_account()
    
    if not default_account:
        raise HTTPException(status_code=400, detail="No default account found. Please create an account first.")
    
    # Get unassigned transactions
    unassigned_transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.account_id.is_(None)
    ).all()
    
    assigned_count = 0
    
    for transaction in unassigned_transactions:
        # For now, assign all to default account
        # In the future, could add logic to parse source_account field
        # and match to specific accounts based on account numbers, etc.
        transaction.account_id = default_account.id
        assigned_count += 1
    
    db.commit()
    
    return {
        "message": f"Auto-assigned {assigned_count} transactions to default account",
        "default_account": default_account.name,
        "assigned_count": assigned_count
    }