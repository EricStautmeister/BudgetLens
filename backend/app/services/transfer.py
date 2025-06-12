# backend/app/services/transfer.py - Minimal version to avoid import issues

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc
from decimal import Decimal
from datetime import date, datetime, timedelta
from app.db.models import Account, Transaction, Transfer
from app.schemas.transfer import TransferCreate, TransferDetectionResult, TransferMatchRequest  # Only import what exists
import logging

logger = logging.getLogger(__name__)

class TransferService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def detect_potential_transfers(self, days_lookback: int = 7) -> TransferDetectionResult:
        """
        Detect potential transfers between user's accounts
        Look for transactions with similar amounts on similar dates
        """
        cutoff_date = date.today() - timedelta(days=days_lookback)
        
        # Get all unmatched transactions from the lookback period
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.date >= cutoff_date,
            Transaction.transfer_id.is_(None),  # Not already part of a transfer
            Transaction.account_id.isnot(None)  # Has an account assigned
        ).order_by(Transaction.date.desc(), Transaction.amount).all()
        
        potential_transfers = []
        matched_transaction_ids = set()
        auto_matched = 0
        
        for i, tx1 in enumerate(transactions):
            if tx1.id in matched_transaction_ids:
                continue
                
            # Look for matching transactions
            for j, tx2 in enumerate(transactions[i+1:], i+1):
                if tx2.id in matched_transaction_ids:
                    continue
                
                # Skip if same account
                if tx1.account_id == tx2.account_id:
                    continue
                
                # Check if amounts are opposite (one positive, one negative, same absolute value)
                if abs(tx1.amount + tx2.amount) < Decimal('0.01'):  # Allow for small rounding differences
                    # Check date proximity (within 3 days)
                    date_diff = abs((tx1.date - tx2.date).days)
                    if date_diff <= 3:
                        # This looks like a transfer
                        confidence = self._calculate_transfer_confidence(tx1, tx2)
                        
                        transfer_data = {
                            'from_transaction': self._transaction_to_dict(tx1 if tx1.amount < 0 else tx2),
                            'to_transaction': self._transaction_to_dict(tx2 if tx1.amount < 0 else tx1),
                            'confidence': confidence,
                            'amount': float(abs(tx1.amount)),
                            'date_difference': date_diff
                        }
                        
                        potential_transfers.append(transfer_data)
                        matched_transaction_ids.add(tx1.id)
                        matched_transaction_ids.add(tx2.id)
                        
                        # Auto-match high confidence transfers
                        if confidence >= 0.9:
                            try:
                                self._create_transfer_from_transactions(tx1, tx2)
                                auto_matched += 1
                                logger.info(f"Auto-matched transfer: {abs(tx1.amount)} ({confidence:.2f} confidence)")
                            except Exception as e:
                                logger.warning(f"Failed to auto-match transfer: {e}")
                        
                        break  # Found a match for tx1, move to next transaction
        
        manual_review_needed = len(potential_transfers) - auto_matched
        
        return TransferDetectionResult(
            potential_transfers=potential_transfers,
            auto_matched=auto_matched,
            manual_review_needed=manual_review_needed
        )
    
    def _transaction_to_dict(self, transaction: Transaction) -> Dict[str, Any]:
        """Convert transaction to dictionary for API response"""
        return {
            "id": str(transaction.id),
            "date": transaction.date.isoformat(),
            "amount": float(abs(transaction.amount)),
            "description": transaction.description,
            "account_id": str(transaction.account_id)
        }
    
    def _calculate_transfer_confidence(self, tx1: Transaction, tx2: Transaction) -> float:
        """Calculate confidence score for potential transfer match"""
        confidence = 0.0
        
        # Exact amount match (most important factor)
        if abs(tx1.amount + tx2.amount) < Decimal('0.01'):
            confidence += 0.4
        
        # Date proximity
        date_diff = abs((tx1.date - tx2.date).days)
        if date_diff == 0:
            confidence += 0.3
        elif date_diff <= 1:
            confidence += 0.2
        elif date_diff <= 2:
            confidence += 0.1
        
        # Description similarity
        desc1 = tx1.description.lower()
        desc2 = tx2.description.lower()
        
        transfer_keywords = ['transfer', 'überweisung', 'virement', 'internal', 'between accounts']
        for keyword in transfer_keywords:
            if keyword in desc1 or keyword in desc2:
                confidence += 0.2
                break
        
        return min(confidence, 1.0)
    
    def _create_transfer_from_transactions(self, tx1: Transaction, tx2: Transaction) -> Transfer:
        """Create a transfer record linking two transactions"""
        # Determine which is from/to based on amount sign
        from_tx = tx1 if tx1.amount < 0 else tx2
        to_tx = tx2 if tx1.amount < 0 else tx1
        
        transfer = Transfer(
            user_id=self.user_id,
            from_account_id=from_tx.account_id,
            to_account_id=to_tx.account_id,
            from_transaction_id=from_tx.id,
            to_transaction_id=to_tx.id,
            amount=abs(from_tx.amount),
            date=from_tx.date,
            description=f"Transfer: {from_tx.description}",
            is_confirmed=True
        )
        
        self.db.add(transfer)
        
        # Update transactions to mark them as transfers
        from_tx.transfer_id = transfer.id
        from_tx.is_transfer = True
        to_tx.transfer_id = transfer.id
        to_tx.is_transfer = True
        
        self.db.commit()
        self.db.refresh(transfer)
        
        logger.info(f"Created transfer: {abs(from_tx.amount)} between accounts")
        return transfer
    
    def create_manual_transfer(self, from_transaction_id: str, to_transaction_id: str) -> Transfer:
        """Manually create a transfer between two transactions"""
        from_tx = self.db.query(Transaction).filter(
            Transaction.id == from_transaction_id,
            Transaction.user_id == self.user_id
        ).first()
        
        to_tx = self.db.query(Transaction).filter(
            Transaction.id == to_transaction_id,
            Transaction.user_id == self.user_id
        ).first()
        
        if not from_tx or not to_tx:
            raise ValueError("One or both transactions not found")
        
        if from_tx.account_id == to_tx.account_id:
            raise ValueError("Cannot create transfer between same account")
        
        if from_tx.transfer_id or to_tx.transfer_id:
            raise ValueError("One or both transactions are already part of a transfer")
        
        return self._create_transfer_from_transactions(from_tx, to_tx)
    
    def get_transfers(self, limit: int = 50) -> List[Transfer]:
        """Get user's transfers"""
        return self.db.query(Transfer).filter(
            Transfer.user_id == self.user_id
        ).order_by(desc(Transfer.date)).limit(limit).all()
    
    def delete_transfer(self, transfer_id: str) -> bool:
        """Delete a transfer and unmark the associated transactions"""
        transfer = self.db.query(Transfer).filter(
            Transfer.id == transfer_id,
            Transfer.user_id == self.user_id
        ).first()
        
        if not transfer:
            return False
        
        # Unmark associated transactions
        if transfer.from_transaction_id:
            from_tx = self.db.query(Transaction).filter(
                Transaction.id == transfer.from_transaction_id
            ).first()
            if from_tx:
                from_tx.transfer_id = None
                from_tx.is_transfer = False
        
        if transfer.to_transaction_id:
            to_tx = self.db.query(Transaction).filter(
                Transaction.id == transfer.to_transaction_id
            ).first()
            if to_tx:
                to_tx.transfer_id = None
                to_tx.is_transfer = False
        
        self.db.delete(transfer)
        self.db.commit()
        
        logger.info(f"Deleted transfer: {transfer.id}")
        return True