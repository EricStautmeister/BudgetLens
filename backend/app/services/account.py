# backend/app/services/account.py - Fixed to include user_id in response

from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from decimal import Decimal
from datetime import date, datetime
from app.db.models import Account, Transaction, AccountType
from app.schemas.account import AccountCreate, AccountUpdate, BalanceAdjustment, BalanceUpdate
import logging
from decimal import Decimal


logger = logging.getLogger(__name__)

class AccountService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def create_account(self, account_data: AccountCreate) -> Account:
        """Create a new account"""
        # If this is set as default, unset other defaults
        if account_data.is_default:
            self.db.query(Account).filter(
                Account.user_id == self.user_id,
                Account.is_default == True
            ).update({Account.is_default: False})
        
        account = Account(
            user_id=self.user_id,
            **account_data.dict()
        )
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        
        logger.info(f"Created account: {account.name} ({account.account_type.value})")
        return account
    
    def get_accounts(self, include_inactive: bool = False) -> List[Account]:
        """Get all accounts for user"""
        query = self.db.query(Account).filter(Account.user_id == self.user_id)
        
        if not include_inactive:
            query = query.filter(Account.is_active == True)
        
        return query.order_by(Account.is_default.desc(), Account.name).all()
    
    def get_account(self, account_id: str) -> Optional[Account]:
        """Get specific account"""
        return self.db.query(Account).filter(
            Account.id == account_id,
            Account.user_id == self.user_id
        ).first()
    
    def update_account(self, account_id: str, account_data: AccountUpdate) -> Optional[Account]:
        """Update account"""
        account = self.get_account(account_id)
        if not account:
            return None
        
        # Handle default account switching
        if account_data.is_default and not account.is_default:
            self.db.query(Account).filter(
                Account.user_id == self.user_id,
                Account.is_default == True
            ).update({Account.is_default: False})
        
        for field, value in account_data.dict(exclude_unset=True).items():
            setattr(account, field, value)
        
        self.db.commit()
        self.db.refresh(account)
        logger.info(f"Updated account: {account.name}")
        return account
    
    def delete_account(self, account_id: str) -> bool:
        """Soft delete account (mark as inactive)"""
        account = self.get_account(account_id)
        if not account:
            return False
        
        # Check if account has transactions
        transaction_count = self.db.query(func.count(Transaction.id)).filter(
            Transaction.account_id == account_id
        ).scalar()
        
        if transaction_count > 0:
            # Soft delete - mark as inactive
            account.is_active = False
            account.is_default = False
            logger.info(f"Soft deleted account: {account.name} ({transaction_count} transactions)")
        else:
            # Hard delete if no transactions
            self.db.delete(account)
            logger.info(f"Hard deleted account: {account.name} (no transactions)")
        
        self.db.commit()
        return True
    
    def get_account_balance(self, account_id: str) -> Decimal:
        """Calculate current account balance"""
        logger.info(f"🏦 ACCOUNT BALANCE DEBUG: Calculating balance for account {account_id}")
        
        # Get all transactions for this account for debugging
        all_transactions = self.db.query(Transaction).filter(
            Transaction.account_id == account_id,
            Transaction.user_id == self.user_id
        ).order_by(Transaction.date.desc()).limit(10).all()
        
        logger.info(f"🏦 ACCOUNT BALANCE DEBUG: Found {len(all_transactions)} recent transactions")
        for i, trans in enumerate(all_transactions, 1):
            category_name = trans.category.name if trans.category else "Uncategorized"
            category_type = trans.category.category_type.value if trans.category else "UNKNOWN"
            logger.info(f"  {i}. {trans.date} | Amount: ${trans.amount} | Category: {category_name} ({category_type}) | Desc: {trans.description[:50]}")
        
        # Calculate total balance
        result = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.account_id == account_id,
            Transaction.user_id == self.user_id
        ).scalar()
        
        balance = result or Decimal('0.00')
        logger.info(f"🏦 ACCOUNT BALANCE DEBUG: Calculated balance = ${balance}")
        
        return balance
    
    def get_account_transaction_count(self, account_id: str) -> int:
        """Get transaction count for account"""
        return self.db.query(func.count(Transaction.id)).filter(
            Transaction.account_id == account_id,
            Transaction.user_id == self.user_id
        ).scalar() or 0
    
    def get_accounts_with_balances(self) -> List[Dict]:
        """Get accounts with calculated balances and transaction counts"""
        accounts = self.get_accounts()
        result = []
        
        for account in accounts:
            balance = self.get_account_balance(str(account.id))
            transaction_count = self.get_account_transaction_count(str(account.id))
            
            account_dict = {
                "id": str(account.id),
                "user_id": str(account.user_id),  # ADDED: Missing user_id field
                "name": account.name,
                "account_type": account.account_type.value,
                "institution": account.institution,
                "account_number_last4": account.account_number_last4,
                "currency": account.currency,
                "is_default": account.is_default,
                "is_active": account.is_active,
                "balance": float(balance),
                "transaction_count": transaction_count,
                "created_at": account.created_at.isoformat(),
                "updated_at": account.updated_at.isoformat()
            }
            result.append(account_dict)
        
        return result
    
    def get_default_account(self) -> Optional[Account]:
        """Get user's default account"""
        return self.db.query(Account).filter(
            Account.user_id == self.user_id,
            Account.is_default == True,
            Account.is_active == True
        ).first()
    
    def ensure_default_account(self) -> Account:
        """Ensure user has a default account, create one if needed"""
        default_account = self.get_default_account()

        if not default_account:
            try:
                # Use database transaction to prevent race condition
                with self.db.begin():
                    # Double-check after acquiring lock
                    default_account = self.get_default_account()
                    if not default_account:
                        default_data = AccountCreate(
                            name="Main Account",
                            account_type=AccountType.CHECKING,
                            is_default=True
                        )
                        default_account = self.create_account(default_data)
                        logger.info(f"Created default account for user {self.user_id}")
            except IntegrityError:
                # Another thread created it, fetch it
                default_account = self.get_default_account()
    
        return default_account

    def adjust_account_balance(self, account_id: str, adjustment: BalanceAdjustment) -> Optional[Transaction]:
        """Adjust account balance by creating a balance adjustment transaction"""
        account = self.get_account(account_id)
        if not account:
            return None

        # Create a balance adjustment transaction
        description = adjustment.description or f"Balance adjustment for {account.name}"

        transaction = Transaction(
            user_id=self.user_id,
            account_id=account_id,
            date=datetime.now().date(),
            amount=adjustment.amount,
            description=description,
            category_id=None,  # No category for balance adjustments
            is_transfer=False,
            needs_review=False,  # Balance adjustments don't need review
            confidence_score=1.0  # Manual adjustments have full confidence
        )

        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)

        logger.info(f"Adjusted balance for account {account.name} by {adjustment.amount}")
        return transaction

    def set_account_balance(self, account_id: str, new_balance: Decimal, description: Optional[str] = None, as_of_date: Optional[date] = None) -> Optional[Transaction]:
        """Set account balance to a specific amount as of a specific date"""
        account = self.get_account(account_id)
        if not account:
            return None

        # Use provided date or default to today
        if as_of_date is None:
            as_of_date = datetime.now().date()
        
        logger.info(f"🏦 BALANCE SET: Setting balance for {account.name} to ${new_balance} as of {as_of_date}")

        # Calculate current balance as of the specified date
        balance_as_of_date = self.get_account_balance_as_of_date(account_id, as_of_date)
        adjustment_amount = new_balance - balance_as_of_date

        logger.info(f"🏦 BALANCE SET: Balance as of {as_of_date} was ${balance_as_of_date}, adjustment needed: ${adjustment_amount}")

        if adjustment_amount == 0:
            logger.info(f"No adjustment needed for account {account.name} - already at target balance as of {as_of_date}")
            return None

        # Create adjustment transaction dated on the as_of_date
        if description is None:
            description = f"Balance set to {new_balance} as of {as_of_date}"

        transaction = Transaction(
            user_id=self.user_id,
            account_id=account_id,
            date=as_of_date,  # Use the as_of_date instead of today
            amount=adjustment_amount,
            description=description,
            category_id=None,
            is_transfer=False,
            needs_review=False,
            confidence_score=1.0
        )

        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)

        # Calculate what the current balance will be after this adjustment
        current_balance_after = self.get_account_balance(account_id)
        logger.info(f"🏦 BALANCE SET: Current balance after adjustment: ${current_balance_after}")

        logger.info(f"Set balance for account {account.name} to {new_balance} as of {as_of_date} (adjustment: {adjustment_amount})")
        return transaction

    def get_account_balance_as_of_date(self, account_id: str, as_of_date: date) -> Decimal:
        """Calculate account balance as of a specific date"""
        result = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.account_id == account_id,
            Transaction.user_id == self.user_id,
            Transaction.date <= as_of_date
        ).scalar()
        
        balance = result or Decimal('0.00')
        logger.debug(f"🏦 Balance for account {account_id} as of {as_of_date}: ${balance}")
        return balance

    def get_account_balance_history(self, account_id: str, limit: int = 10) -> List[Dict]:
        """Get recent balance-affecting transactions for an account"""
        transactions = self.db.query(Transaction).filter(
            Transaction.account_id == account_id,
            Transaction.user_id == self.user_id
        ).order_by(Transaction.date.desc(), Transaction.created_at.desc()).limit(limit).all()

        running_balance = self.get_account_balance(account_id)
        history = []

        for transaction in reversed(transactions):
            history.append({
                "id": str(transaction.id),
                "date": transaction.date.isoformat(),
                "amount": float(transaction.amount),
                "description": transaction.description,
                "balance_after": float(running_balance),
                "is_adjustment": "balance adjustment" in transaction.description.lower()
            })
            running_balance -= transaction.amount

        return list(reversed(history))