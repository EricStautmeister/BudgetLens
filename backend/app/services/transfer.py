# backend/app/services/transfer.py - Complete version with improved transfer detection logic

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc
from decimal import Decimal
from datetime import date, datetime, timedelta
from app.db.models import Account, Transaction, Transfer, AccountType
from app.schemas.transfer import TransferCreate, TransferDetectionResult, TransferMatchRequest
import logging

logger = logging.getLogger(__name__)

class TransferService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def detect_potential_transfers(self, days_lookback: int = 7) -> TransferDetectionResult:
        """
        Detect potential transfers between user's accounts
        Look for transactions with opposite amounts on similar dates between different accounts
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
                
                # Quick filter first
                if not self._is_potential_transfer_pair(tx1, tx2):
                    continue
                
                # Calculate detailed confidence
                confidence = self._calculate_transfer_confidence(tx1, tx2)
                
                if confidence >= 0.5:  # Minimum confidence threshold
                    transfer_data = {
                        'from_transaction': self._transaction_to_dict(tx1 if tx1.amount < 0 else tx2),
                        'to_transaction': self._transaction_to_dict(tx2 if tx1.amount < 0 else tx1),
                        'confidence': confidence,
                        'amount': float(abs(tx1.amount)),
                        'date_difference': abs((tx1.date - tx2.date).days)
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
    
    def _is_potential_transfer_pair(self, tx1: Transaction, tx2: Transaction) -> bool:
        """
        Quick check to see if two transactions could potentially be a transfer
        before doing expensive confidence calculation
        """
        # Must have opposite signs
        if not ((tx1.amount > 0 and tx2.amount < 0) or (tx1.amount < 0 and tx2.amount > 0)):
            return False
        
        # Must be from different accounts
        if tx1.account_id and tx2.account_id and tx1.account_id == tx2.account_id:
            return False
        
        # Must be within reasonable date range (e.g., 7 days)
        date_diff = abs((tx1.date - tx2.date).days)
        if date_diff > 7:
            return False
        
        # Amount difference must be reasonable (within 20%)
        amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
        max_amount = max(abs(tx1.amount), abs(tx2.amount))
        
        if max_amount > 0 and (amount_diff / max_amount) > 0.20:
            return False
        
        return True
    
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
        """
        Calculate confidence score for potential transfer match
        
        A transfer should have:
        - Opposite signs (one debit, one credit)
        - Similar absolute amounts (with small tolerance for fees)
        - Close dates
        - Different accounts
        - Potentially similar descriptions or transfer keywords
        """
        confidence = 0.0
        
        # CRITICAL: Check if amounts are opposite signs first
        if not ((tx1.amount > 0 and tx2.amount < 0) or (tx1.amount < 0 and tx2.amount > 0)):
            # Both amounts have same sign - can't be a transfer
            return 0.0
        
        # Check if transactions are from different accounts
        if tx1.account_id and tx2.account_id and tx1.account_id == tx2.account_id:
            # Same account - can't be a transfer
            return 0.0
        
        # Amount matching with tolerance for fees
        amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
        max_amount = max(abs(tx1.amount), abs(tx2.amount))
        
        # Avoid division by zero
        if max_amount == 0:
            return 0.0
        
        if amount_diff == 0:
            confidence += 0.4  # Perfect amount match
        elif amount_diff / max_amount <= 0.01:  # 1% tolerance (very small fees)
            confidence += 0.35
        elif amount_diff / max_amount <= 0.02:  # 2% tolerance for fees
            confidence += 0.3
        elif amount_diff / max_amount <= 0.05:  # 5% tolerance
            confidence += 0.2
        elif amount_diff / max_amount <= 0.10:  # 10% tolerance (larger fees)
            confidence += 0.1
        else:
            # Amount difference too large to be a transfer
            return 0.0
        
        # Date proximity (more granular)
        date_diff = abs((tx1.date - tx2.date).days)
        if date_diff == 0:
            confidence += 0.3  # Same day
        elif date_diff <= 1:
            confidence += 0.25  # Next day
        elif date_diff <= 2:
            confidence += 0.15  # Within 2 days
        elif date_diff <= 3:
            confidence += 0.1   # Within 3 days
        else:
            # Too far apart in time
            confidence -= 0.1  # Slight penalty for distant dates
        
        # Description analysis
        desc1 = tx1.description.lower() if tx1.description else ""
        desc2 = tx2.description.lower() if tx2.description else ""
        
        # Transfer keywords (multilingual support)
        transfer_keywords = [
            'transfer', 'überweisung', 'virement', 'internal', 'between accounts',
            'wire', 'ach', 'electronic transfer', 'online transfer',
            'compte à compte', 'intern', 'internal transfer',
            'zurich', 'zkb'  # Bank-specific keywords
        ]
        
        keyword_found = False
        for keyword in transfer_keywords:
            if keyword in desc1 or keyword in desc2:
                confidence += 0.15
                keyword_found = True
                break
        
        # Boost confidence if descriptions are very similar
        if desc1 and desc2:
            # Simple similarity check
            common_words = set(desc1.split()) & set(desc2.split())
            if len(common_words) >= 2:  # At least 2 common words
                confidence += 0.1
        
        # Account type consideration (only if accounts exist)
        try:
            if (tx1.account and tx2.account and 
                hasattr(tx1.account, 'account_type') and hasattr(tx2.account, 'account_type')):
                
                # Common transfer patterns
                transfer_patterns = [
                    (AccountType.CHECKING, AccountType.SAVINGS),
                    (AccountType.SAVINGS, AccountType.CHECKING),
                    (AccountType.CHECKING, AccountType.INVESTMENT),
                    (AccountType.INVESTMENT, AccountType.CHECKING),
                    (AccountType.CREDIT_CARD, AccountType.CHECKING),  # Credit card payment
                ]
                
                account_types = (tx1.account.account_type, tx2.account.account_type)
                reverse_types = (tx2.account.account_type, tx1.account.account_type)
                
                if account_types in transfer_patterns or reverse_types in transfer_patterns:
                    confidence += 0.1
        except Exception as e:
            # If there's any issue accessing account types, just skip this check
            logger.debug(f"Could not check account types for transfer confidence: {e}")
        
        # Additional heuristics
        
        # If one transaction is much larger than typical for the account, 
        # it's more likely to be a transfer
        large_amount_threshold = 1000.0  # Configurable threshold
        if max_amount >= large_amount_threshold:
            confidence += 0.05
        
        # Penalize if the amounts are very small (less likely to be intentional transfers)
        if max_amount < 10.0:
            confidence -= 0.1
        
        # Round amounts (like 100.00, 500.00) are more likely to be transfers
        if abs(tx1.amount) % 1 == 0 or abs(tx2.amount) % 1 == 0:
            confidence += 0.05
        
        # Ensure confidence doesn't exceed 1.0 or go below 0.0
        return max(0.0, min(confidence, 1.0))
    
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
        
        # Validate that amounts are reasonable for a transfer
        if not self._is_potential_transfer_pair(from_tx, to_tx):
            raise ValueError("Transactions do not appear to be a valid transfer pair")
        
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
    
    def get_transfer_suggestions(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get suggested transfer pairs for manual review
        Returns transfers with confidence between 0.5 and 0.9 that weren't auto-matched
        """
        cutoff_date = date.today() - timedelta(days=30)  # Look back 30 days
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.date >= cutoff_date,
            Transaction.transfer_id.is_(None),
            Transaction.account_id.isnot(None)
        ).order_by(Transaction.date.desc()).limit(200).all()  # Limit to prevent performance issues
        
        suggestions = []
        processed_pairs = set()
        
        for i, tx1 in enumerate(transactions):
            for tx2 in transactions[i+1:]:
                # Create a unique pair identifier
                pair_id = tuple(sorted([str(tx1.id), str(tx2.id)]))
                if pair_id in processed_pairs:
                    continue
                processed_pairs.add(pair_id)
                
                if not self._is_potential_transfer_pair(tx1, tx2):
                    continue
                
                confidence = self._calculate_transfer_confidence(tx1, tx2)
                
                # Only suggest transfers with moderate confidence (manual review needed)
                if 0.5 <= confidence < 0.9:
                    suggestions.append({
                        'from_transaction': self._transaction_to_dict(tx1 if tx1.amount < 0 else tx2),
                        'to_transaction': self._transaction_to_dict(tx2 if tx1.amount < 0 else tx1),
                        'confidence': confidence,
                        'amount': float(abs(tx1.amount)),
                        'date_difference': abs((tx1.date - tx2.date).days),
                        'suggested_reason': self._get_suggestion_reason(tx1, tx2, confidence)
                    })
                
                if len(suggestions) >= limit:
                    break
            
            if len(suggestions) >= limit:
                break
        
        # Sort by confidence descending
        suggestions.sort(key=lambda x: x['confidence'], reverse=True)
        return suggestions
    
    def _get_suggestion_reason(self, tx1: Transaction, tx2: Transaction, confidence: float) -> str:
        """Generate a human-readable reason for why this transfer was suggested"""
        reasons = []
        
        amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
        if amount_diff == 0:
            reasons.append("exact amount match")
        elif amount_diff < abs(tx1.amount) * 0.02:
            reasons.append("very similar amounts")
        
        date_diff = abs((tx1.date - tx2.date).days)
        if date_diff == 0:
            reasons.append("same date")
        elif date_diff <= 1:
            reasons.append("consecutive dates")
        
        desc1 = tx1.description.lower() if tx1.description else ""
        desc2 = tx2.description.lower() if tx2.description else ""
        transfer_keywords = ['transfer', 'überweisung', 'virement', 'internal']
        
        if any(keyword in desc1 or keyword in desc2 for keyword in transfer_keywords):
            reasons.append("transfer keywords in description")
        
        if not reasons:
            reasons.append("pattern analysis")
        
        return f"Suggested due to: {', '.join(reasons)}"