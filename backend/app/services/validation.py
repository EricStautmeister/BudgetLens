# backend/app/services/validation.py

from typing import List, Optional
from sqlalchemy.orm import Session
from app.db.models import Transaction, Category, Vendor, Account
from app.schemas.transaction import TransactionUpdate
from app.utils.validation import validate_user_owns_resource
import logging

logger = logging.getLogger(__name__)

class TransactionValidationService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def validate_transaction_update(self, transaction_id: str, update: TransactionUpdate) -> List[str]:
        """
        Validate that all referenced resources belong to the user
        
        Args:
            transaction_id: ID of transaction to update
            update: TransactionUpdate object with new values
            
        Returns:
            List of error messages (empty if valid)
        """
        errors = []
        
        try:
            # Validate transaction ownership
            transaction = validate_user_owns_resource(
                self.db, self.user_id, transaction_id, Transaction
            )
        except Exception:
            errors.append("Transaction not found or access denied")
            return errors  # Early return if transaction doesn't exist
        
        # Validate category ownership
        if update.category_id:
            try:
                validate_user_owns_resource(
                    self.db, self.user_id, str(update.category_id), Category
                )
            except Exception:
                errors.append("Category not found or access denied")
        
        # Validate vendor ownership
        if update.vendor_id:
            try:
                validate_user_owns_resource(
                    self.db, self.user_id, str(update.vendor_id), Vendor
                )
            except Exception:
                errors.append("Vendor not found or access denied")
        
        return errors
    
    def validate_bulk_transaction_update(
        self, 
        transaction_ids: List[str], 
        category_id: Optional[str] = None,
        vendor_id: Optional[str] = None
    ) -> List[str]:
        """
        Validate bulk transaction updates
        
        Args:
            transaction_ids: List of transaction IDs to update
            category_id: Optional category ID to assign
            vendor_id: Optional vendor ID to assign
            
        Returns:
            List of error messages (empty if valid)
        """
        errors = []
        
        # Validate all transactions belong to user
        transactions = self.db.query(Transaction).filter(
            Transaction.id.in_(transaction_ids),
            Transaction.user_id == self.user_id
        ).all()
        
        found_ids = {str(t.id) for t in transactions}
        missing_ids = set(transaction_ids) - found_ids
        
        if missing_ids:
            errors.append(f"Transactions not found: {', '.join(missing_ids)}")
        
        # Validate category if provided
        if category_id:
            try:
                validate_user_owns_resource(
                    self.db, self.user_id, category_id, Category
                )
            except Exception:
                errors.append("Category not found or access denied")
        
        # Validate vendor if provided
        if vendor_id:
            try:
                validate_user_owns_resource(
                    self.db, self.user_id, vendor_id, Vendor
                )
            except Exception:
                errors.append("Vendor not found or access denied")
        
        return errors
    
    def validate_account_assignment(
        self, 
        transaction_ids: List[str], 
        account_id: str
    ) -> List[str]:
        """
        Validate account assignment for transactions
        
        Args:
            transaction_ids: List of transaction IDs
            account_id: Account ID to assign
            
        Returns:
            List of error messages (empty if valid)
        """
        errors = []
        
        # Validate account ownership and status
        try:
            account = validate_user_owns_resource(
                self.db, self.user_id, account_id, Account
            )
            
            if not account.is_active:
                errors.append("Cannot assign to inactive account")
                
        except Exception:
            errors.append("Account not found or access denied")
            return errors
        
        # Validate all transactions belong to user
        transactions = self.db.query(Transaction).filter(
            Transaction.id.in_(transaction_ids),
            Transaction.user_id == self.user_id
        ).all()
        
        found_ids = {str(t.id) for t in transactions}
        missing_ids = set(transaction_ids) - found_ids
        
        if missing_ids:
            errors.append(f"Transactions not found: {', '.join(missing_ids)}")
        
        return errors