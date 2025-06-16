# backend/app/api/v1/endpoints/accounts.py

from typing import List
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Transaction
from app.schemas.account import Account, AccountCreate, AccountUpdate, BalanceAdjustment, BalanceUpdate
from app.services.account import AccountService
from uuid import UUID

logger = logging.getLogger(__name__)
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
    try:
        logger.info(f"🏦 CREATE ACCOUNT DEBUG: Received data: {account_in.model_dump()}")
        
        account_service = AccountService(db, str(current_user.id))
        account = account_service.create_account(account_in)
        
        logger.info(f"🏦 CREATE ACCOUNT DEBUG: Created account with ID: {account.id}")
        
        # Return the account
        return account
    except Exception as e:
        logger.error(f"🏦 CREATE ACCOUNT ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
    
    return account

@router.put("/{account_id}")
async def update_account(
    account_id: UUID,
    account_update: AccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update account details"""
    account_service = AccountService(db, str(current_user.id))
    account = account_service.update_account(str(account_id), account_update)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return account

@router.delete("/{account_id}")
async def delete_account(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an account"""
    account_service = AccountService(db, str(current_user.id))
    success = account_service.delete_account(str(account_id))
    
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return {"message": "Account deleted successfully"}

@router.post("/{account_id}/adjust-balance")
async def adjust_account_balance(
    account_id: str,
    balance_adjustment: BalanceAdjustment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Adjust account balance by a specific amount"""
    account_service = AccountService(db, str(current_user.id))
    
    account = account_service.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    transaction = account_service.adjust_account_balance(
        account_id, 
        balance_adjustment.amount, 
        balance_adjustment.description
    )
    
    updated_balance = account_service.get_account_balance(account_id)
    
    return {
        "message": "Balance adjusted successfully",
        "current_balance": float(updated_balance),
        "transaction_id": str(transaction.id)
    }

@router.post("/{account_id}/set-balance")
async def set_account_balance(
    account_id: str,
    balance_update: BalanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Set account balance to a specific amount"""
    account_service = AccountService(db, str(current_user.id))
    
    account = account_service.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Use provided date or default to today
    as_of_date = balance_update.as_of_date.date() if balance_update.as_of_date else None
    
    transaction = account_service.set_account_balance(
        account_id,
        balance_update.new_balance,
        balance_update.description,
        as_of_date
    )
    
    updated_balance = account_service.get_account_balance(account_id)
    
    response = {
        "message": "Balance updated successfully",
        "current_balance": float(updated_balance)
    }
    
    # Only include transaction_id if a transaction was created
    if transaction:
        response["transaction_id"] = str(transaction.id)
    else:
        response["message"] = "Balance was already at target amount - no adjustment needed"
    
    return response

@router.post("/{account_id}/preview-balance", response_model=dict)
async def preview_balance_update(
    account_id: str,
    balance_update: BalanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Preview what the current balance will be after setting a historical balance"""
    from datetime import datetime
    account_service = AccountService(db, str(current_user.id))
    
    account = account_service.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Use provided date or default to today
    as_of_date = balance_update.as_of_date.date() if balance_update.as_of_date else datetime.now().date()
    
    # Get balance as of the specified date (before adjustment)
    balance_as_of_date = account_service.get_account_balance_as_of_date(account_id, as_of_date)
    
    # Calculate adjustment needed
    adjustment_amount = balance_update.new_balance - balance_as_of_date
    
    # Get transactions after the as_of_date
    from sqlalchemy import func
    transactions_after = account_service.db.query(func.sum(Transaction.amount)).filter(
        Transaction.account_id == account_id,
        Transaction.user_id == current_user.id,
        Transaction.date > as_of_date
    ).scalar()
    
    transactions_after_amount = transactions_after or 0
    
    # Get current actual balance for verification
    current_actual_balance = account_service.get_account_balance(account_id)
    
    # Calculate what the current balance will be
    projected_current_balance = balance_update.new_balance + transactions_after_amount
    
    # Debug logging
    logger.info(f"📊 BALANCE PREVIEW DEBUG:")
    logger.info(f"  Account: {account.name}")
    logger.info(f"  As of date: {as_of_date}")
    logger.info(f"  Current actual balance: ${current_actual_balance}")
    logger.info(f"  Balance as of {as_of_date}: ${balance_as_of_date}")
    logger.info(f"  Target balance as of {as_of_date}: ${balance_update.new_balance}")
    logger.info(f"  Transactions after {as_of_date}: ${transactions_after_amount}")
    logger.info(f"  Verification: {balance_as_of_date} + {transactions_after_amount} = {balance_as_of_date + transactions_after_amount} (should equal {current_actual_balance})")
    logger.info(f"  Projected current balance: ${projected_current_balance}")
    logger.info(f"  Adjustment needed: ${adjustment_amount}")
    
    # Count transactions for additional info
    transactions_count = account_service.db.query(func.count(Transaction.id)).filter(
        Transaction.account_id == account_id,
        Transaction.user_id == current_user.id,
        Transaction.date > as_of_date
    ).scalar()
    
    return {
        "account_name": account.name,
        "as_of_date": as_of_date.isoformat(),
        "current_balance_as_of_date": float(balance_as_of_date),
        "target_balance_as_of_date": float(balance_update.new_balance),
        "adjustment_needed": float(adjustment_amount),
        "transactions_after_date": int(transactions_count),
        "transactions_after_amount": float(transactions_after_amount),
        "projected_current_balance": float(projected_current_balance),
        "current_actual_balance": float(current_actual_balance)
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
