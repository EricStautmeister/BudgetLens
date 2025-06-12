# backend/app/utils/decorators.py

from functools import wraps
from typing import List, Callable, Any
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.services.validation import TransactionValidationService

def validate_transaction_update(func: Callable) -> Callable:
    """
    Decorator to validate transaction updates
    Expects the function to have: transaction_id, update, db, current_user parameters
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Extract parameters from kwargs
        transaction_id = kwargs.get('transaction_id')
        update = kwargs.get('update')
        db = kwargs.get('db')
        current_user = kwargs.get('current_user')
        
        if not all([transaction_id, update, db, current_user]):
            raise HTTPException(
                status_code=500, 
                detail="Missing required parameters for validation"
            )
        
        # Perform validation
        validation_service = TransactionValidationService(db, str(current_user.id))
        errors = validation_service.validate_transaction_update(str(transaction_id), update)
        
        if errors:
            raise HTTPException(
                status_code=400,
                detail={"validation_errors": errors}
            )
        
        # Call the original function
        return await func(*args, **kwargs)
    
    return wrapper

def validate_bulk_operations(func: Callable) -> Callable:
    """
    Decorator to validate bulk transaction operations
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        transaction_ids = kwargs.get('transaction_ids')
        db = kwargs.get('db')
        current_user = kwargs.get('current_user')
        
        if not all([transaction_ids, db, current_user]):
            raise HTTPException(
                status_code=500,
                detail="Missing required parameters for validation"
            )
        
        validation_service = TransactionValidationService(db, str(current_user.id))
        
        # Check if it's categorization or account assignment
        if 'category_id' in kwargs:
            errors = validation_service.validate_bulk_transaction_update(
                transaction_ids=[str(tid) for tid in transaction_ids],
                category_id=str(kwargs.get('category_id')),
                vendor_id=str(kwargs.get('vendor_id')) if kwargs.get('vendor_id') else None
            )
        elif 'account_id' in kwargs:
            errors = validation_service.validate_account_assignment(
                transaction_ids=[str(tid) for tid in transaction_ids],
                account_id=str(kwargs.get('account_id'))
            )
        else:
            errors = []
        
        if errors:
            raise HTTPException(
                status_code=400,
                detail={"validation_errors": errors}
            )
        
        return await func(*args, **kwargs)
    
    return wrapper
