# backend/app/api/v1/endpoints/accounts.py

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User
from app.schemas.account import Account, AccountCreate, AccountUpdate, BalanceAdjustment, BalanceUpdate
from app.services.account import AccountService
from uuid import UUID

router = APIRouter()

@router.get("/", response_model=List[Account])
async def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all accounts for the current user with balances"""
    account_service = AccountService(db, str(current_user.id))
    return account_service.get_accounts_with_balances()

@router.post("/", response_model=Account)
async def create_account(
    account_in: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new account"""
    account_service = AccountService(db, str(current_user.id))
    account = account_service.create_account(account_in)
    
    # Return with balance info
    return {
        **account.__dict__,
        "balance": 0.0,
        "transaction_count": 0
    }

@router.get("/{account_id}")
async def get_account(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get specific account details"""
    account_service = AccountService(db, str(current_user.id))
    account = account_service.get_account(str(account_id))
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    balance = account_service.get_account_balance(str(account_id))
    
    return {
        **account.__dict__,
        "balance": float(balance)
    }

@router.put("/{account_id}", response_model=Account)
async def update_account(
    account_id: UUID,
    account_update: AccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update account"""
    account_service = AccountService(db, str(current_user.id))
    account = account_service.update_account(str(account_id), account_update)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    balance = account_service.get_account_balance(str(account_id))
    
    return {
        **account.__dict__,
        "balance": float(balance),
        "transaction_count": 0  # Could be calculated if needed
    }

@router.delete("/{account_id}")
async def delete_account(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete account"""
    account_service = AccountService(db, str(current_user.id))
    success = account_service.delete_account(str(account_id))
    
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return {"message": "Account deleted successfully"}

@router.post("/ensure-default")
async def ensure_default_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Ensure user has a default account, create one if needed"""
    account_service = AccountService(db, str(current_user.id))
    account = account_service.ensure_default_account()
    
    return {
        "message": "Default account ensured",
        "account": {
            **account.__dict__,
            "balance": 0.0
        }
    }

@router.post("/{account_id}/adjust-balance", response_model=dict)
async def adjust_account_balance(
    account_id: str,
    adjustment: BalanceAdjustment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Adjust account balance by a specific amount"""
    account_service = AccountService(db, str(current_user.id))
    
    transaction = account_service.adjust_account_balance(account_id, adjustment)
    if not transaction:
        raise HTTPException(status_code=404, detail="Account not found")
    
    new_balance = account_service.get_account_balance(account_id)
    
    return {
        "message": "Balance adjusted successfully",
        "adjustment_amount": float(adjustment.amount),
        "new_balance": float(new_balance),
        "transaction_id": str(transaction.id)
    }

@router.post("/{account_id}/set-balance", response_model=dict)
async def set_account_balance(
    account_id: str,
    balance_update: BalanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Set account balance to a specific amount"""
    account_service = AccountService(db, str(current_user.id))
    
    current_balance = account_service.get_account_balance(account_id)
    transaction = account_service.set_account_balance(account_id, balance_update)
    
    if transaction is None and current_balance == balance_update.new_balance:
        return {
            "message": "Balance already at target amount",
            "current_balance": float(current_balance),
            "new_balance": float(balance_update.new_balance)
        }
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return {
        "message": "Balance updated successfully",
        "previous_balance": float(current_balance),
        "new_balance": float(balance_update.new_balance),
        "adjustment_amount": float(transaction.amount),
        "transaction_id": str(transaction.id)
    }

@router.get("/{account_id}/balance-history", response_model=List[dict])
async def get_account_balance_history(
    account_id: str,
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get balance history for an account"""
    account_service = AccountService(db, str(current_user.id))
    
    account = account_service.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    history = account_service.get_account_balance_history(account_id, limit)
    return history