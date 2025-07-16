# backend/app/api/v1/endpoints/savings_pockets.py - API endpoints for savings pockets

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc

from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, SavingsPocket, Account, Transaction
from app.schemas.savings_pocket import (
    SavingsPocket as SavingsPocketSchema,
    SavingsPocketCreate,
    SavingsPocketUpdate,
    SavingsPocketWithTransactions,
    SavingsPocketSummary
)
from uuid import UUID
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=List[SavingsPocketSchema])
async def list_savings_pockets(
    account_id: Optional[UUID] = Query(None, description="Filter by account ID"),
    include_inactive: bool = Query(False, description="Include inactive pockets"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all savings pockets for the current user"""
    query = db.query(SavingsPocket).filter(
        SavingsPocket.user_id == current_user.id
    ).options(
        joinedload(SavingsPocket.account)
    )
    
    if account_id:
        query = query.filter(SavingsPocket.account_id == account_id)
    
    if not include_inactive:
        query = query.filter(SavingsPocket.is_active == True)
    
    query = query.order_by(SavingsPocket.sort_order, SavingsPocket.name)
    
    pockets = query.all()
    
    # Enhance with calculated fields
    result = []
    for pocket in pockets:
        pocket_dict = SavingsPocketSchema.from_orm(pocket).dict()
        pocket_dict['account_name'] = pocket.account.name if pocket.account else None
        
        # Calculate progress percentage
        if pocket.target_amount and pocket.target_amount > 0:
            pocket_dict['progress_percentage'] = float(pocket.current_amount / pocket.target_amount * 100)
        else:
            pocket_dict['progress_percentage'] = 0.0
            
        # Get transaction count
        transaction_count = db.query(func.count(Transaction.id)).filter(
            Transaction.user_id == current_user.id,
            Transaction.savings_pocket_id == pocket.id
        ).scalar()
        pocket_dict['transaction_count'] = transaction_count
        
        result.append(SavingsPocketSchema(**pocket_dict))
    
    return result

@router.post("/", response_model=SavingsPocketSchema)
async def create_savings_pocket(
    pocket_data: SavingsPocketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new savings pocket"""
    
    # Verify the account exists and belongs to the user
    account = db.query(Account).filter(
        Account.id == pocket_data.account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check if pocket name already exists for this account
    existing = db.query(SavingsPocket).filter(
        SavingsPocket.user_id == current_user.id,
        SavingsPocket.account_id == pocket_data.account_id,
        SavingsPocket.name == pocket_data.name,
        SavingsPocket.is_active == True
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Savings pocket with this name already exists for this account")
    
    # Create new pocket
    pocket = SavingsPocket(
        user_id=current_user.id,
        **pocket_data.dict()
    )
    
    db.add(pocket)
    db.commit()
    db.refresh(pocket)
    
    # Return with enhanced data
    pocket_dict = SavingsPocketSchema.from_orm(pocket).dict()
    pocket_dict['account_name'] = account.name
    pocket_dict['progress_percentage'] = 0.0
    pocket_dict['transaction_count'] = 0
    
    return SavingsPocketSchema(**pocket_dict)

@router.get("/{pocket_id}", response_model=SavingsPocketWithTransactions)
async def get_savings_pocket(
    pocket_id: UUID,
    include_transactions: bool = Query(True, description="Include recent transactions"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific savings pocket with details"""
    
    pocket = db.query(SavingsPocket).filter(
        SavingsPocket.id == pocket_id,
        SavingsPocket.user_id == current_user.id
    ).options(
        joinedload(SavingsPocket.account)
    ).first()
    
    if not pocket:
        raise HTTPException(status_code=404, detail="Savings pocket not found")
    
    # Build response
    pocket_dict = SavingsPocketSchema.from_orm(pocket).dict()
    pocket_dict['account_name'] = pocket.account.name if pocket.account else None
    
    # Calculate progress percentage
    if pocket.target_amount and pocket.target_amount > 0:
        pocket_dict['progress_percentage'] = float(pocket.current_amount / pocket.target_amount * 100)
    else:
        pocket_dict['progress_percentage'] = 0.0
    
    # Get transaction count
    transaction_count = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == current_user.id,
        Transaction.savings_pocket_id == pocket.id
    ).scalar()
    pocket_dict['transaction_count'] = transaction_count
    
    # Get recent transactions if requested
    recent_transactions = []
    monthly_activity = []
    
    if include_transactions:
        # Get recent transactions
        transactions = db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.savings_pocket_id == pocket.id
        ).order_by(desc(Transaction.date)).limit(10).all()
        
        recent_transactions = [
            {
                'id': str(t.id),
                'date': t.date.isoformat(),
                'amount': float(t.amount),
                'description': t.description,
                'details': t.details
            }
            for t in transactions
        ]
        
        # Get monthly activity summary
        monthly_summary = db.query(
            func.date_trunc('month', Transaction.date).label('month'),
            func.sum(Transaction.amount).label('total_amount'),
            func.count(Transaction.id).label('transaction_count')
        ).filter(
            Transaction.user_id == current_user.id,
            Transaction.savings_pocket_id == pocket.id
        ).group_by(
            func.date_trunc('month', Transaction.date)
        ).order_by(
            func.date_trunc('month', Transaction.date).desc()
        ).limit(12).all()
        
        monthly_activity = [
            {
                'month': row.month.isoformat(),
                'total_amount': float(row.total_amount),
                'transaction_count': row.transaction_count
            }
            for row in monthly_summary
        ]
    
    pocket_dict['recent_transactions'] = recent_transactions
    pocket_dict['monthly_activity'] = monthly_activity
    
    return SavingsPocketWithTransactions(**pocket_dict)

@router.put("/{pocket_id}", response_model=SavingsPocketSchema)
async def update_savings_pocket(
    pocket_id: UUID,
    pocket_data: SavingsPocketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a savings pocket"""
    
    pocket = db.query(SavingsPocket).filter(
        SavingsPocket.id == pocket_id,
        SavingsPocket.user_id == current_user.id
    ).first()
    
    if not pocket:
        raise HTTPException(status_code=404, detail="Savings pocket not found")
    
    # Check for name conflicts if name is being updated
    if pocket_data.name and pocket_data.name != pocket.name:
        existing = db.query(SavingsPocket).filter(
            SavingsPocket.user_id == current_user.id,
            SavingsPocket.account_id == pocket.account_id,
            SavingsPocket.name == pocket_data.name,
            SavingsPocket.is_active == True,
            SavingsPocket.id != pocket_id
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Savings pocket with this name already exists for this account")
    
    # Update fields
    update_data = pocket_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pocket, field, value)
    
    db.commit()
    db.refresh(pocket)
    
    # Return with enhanced data
    account = db.query(Account).filter(Account.id == pocket.account_id).first()
    pocket_dict = SavingsPocketSchema.from_orm(pocket).dict()
    pocket_dict['account_name'] = account.name if account else None
    
    # Calculate progress percentage
    if pocket.target_amount and pocket.target_amount > 0:
        pocket_dict['progress_percentage'] = float(pocket.current_amount / pocket.target_amount * 100)
    else:
        pocket_dict['progress_percentage'] = 0.0
    
    # Get transaction count
    transaction_count = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == current_user.id,
        Transaction.savings_pocket_id == pocket.id
    ).scalar()
    pocket_dict['transaction_count'] = transaction_count
    
    return SavingsPocketSchema(**pocket_dict)

@router.delete("/{pocket_id}")
async def delete_savings_pocket(
    pocket_id: UUID,
    force: bool = Query(False, description="Force delete even if pocket has transactions"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete (deactivate) a savings pocket"""
    
    pocket = db.query(SavingsPocket).filter(
        SavingsPocket.id == pocket_id,
        SavingsPocket.user_id == current_user.id
    ).first()
    
    if not pocket:
        raise HTTPException(status_code=404, detail="Savings pocket not found")
    
    # Check if pocket has transactions
    transaction_count = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == current_user.id,
        Transaction.savings_pocket_id == pocket.id
    ).scalar()
    
    if transaction_count > 0 and not force:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete pocket with {transaction_count} transactions. Use force=true to override."
        )
    
    if force and transaction_count > 0:
        # Remove pocket assignment from transactions
        db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.savings_pocket_id == pocket.id
        ).update({'savings_pocket_id': None})
    
    # Soft delete by deactivating
    pocket.is_active = False
    db.commit()
    
    return {"message": "Savings pocket deleted successfully"}

@router.get("/summary/all", response_model=List[SavingsPocketSummary])
async def get_savings_pockets_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get summary of all savings pockets for dashboard"""
    
    pockets = db.query(SavingsPocket).filter(
        SavingsPocket.user_id == current_user.id,
        SavingsPocket.is_active == True
    ).options(
        joinedload(SavingsPocket.account)
    ).order_by(SavingsPocket.sort_order, SavingsPocket.name).all()
    
    result = []
    for pocket in pockets:
        progress_percentage = 0.0
        if pocket.target_amount and pocket.target_amount > 0:
            progress_percentage = float(pocket.current_amount / pocket.target_amount * 100)
        
        result.append(SavingsPocketSummary(
            id=pocket.id,
            name=pocket.name,
            account_name=pocket.account.name if pocket.account else "Unknown",
            current_amount=pocket.current_amount,
            target_amount=pocket.target_amount,
            progress_percentage=progress_percentage,
            color=pocket.color,
            icon=pocket.icon
        ))
    
    return result

@router.post("/{pocket_id}/adjust-balance")
async def adjust_pocket_balance(
    pocket_id: UUID,
    amount: Decimal,
    description: str = "Manual balance adjustment",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Manually adjust a savings pocket balance"""
    
    pocket = db.query(SavingsPocket).filter(
        SavingsPocket.id == pocket_id,
        SavingsPocket.user_id == current_user.id
    ).first()
    
    if not pocket:
        raise HTTPException(status_code=404, detail="Savings pocket not found")
    
    # Update balance
    old_balance = pocket.current_amount
    pocket.current_amount = amount
    
    # Create a transaction record for the adjustment
    adjustment_transaction = Transaction(
        user_id=current_user.id,
        account_id=pocket.account_id,
        savings_pocket_id=pocket.id,
        date=func.current_date(),
        amount=amount - old_balance,
        description=description,
        details=f"Balance adjustment from {old_balance} to {amount}",
        is_transfer=False,
        needs_review=False
    )
    
    db.add(adjustment_transaction)
    db.commit()
    db.refresh(pocket)
    
    return {
        "message": "Pocket balance adjusted successfully",
        "old_balance": float(old_balance),
        "new_balance": float(pocket.current_amount),
        "adjustment_amount": float(amount - old_balance)
    }
