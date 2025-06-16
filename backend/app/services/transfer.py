# backend/app/services/transfer.py - Complete rewrite with proper error handling

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from decimal import Decimal
from datetime import date, datetime, timedelta
from app.db.models import Account, Transaction, Transfer, User
import logging

logger = logging.getLogger(__name__)

# Settings-related functions
def get_transfer_settings(db: Session, user: User):
    """
    Get transfer settings for a user. If settings don't exist,
    return default settings.
    """
    from app.schemas.transfer import TransferSettings, TransferRule
    
    # In a real implementation, these would be retrieved from a settings table in the database
    # For now, return default settings
    return TransferSettings(
        days_lookback=7,
        amount_tolerance=0.50,
        percentage_tolerance=0.02,
        confidence_threshold=0.85,
        enable_auto_matching=True,
        rules=[
            TransferRule(
                name="Personal Name",
                pattern="",
                enabled=True,
                auto_confirm=True,
                allow_fees=False,
                max_fee_tolerance=0,
                description="Transfers containing your name"
            ),
            TransferRule(
                name="Revolut",
                pattern="REVOLUT",
                enabled=True,
                auto_confirm=True,
                allow_fees=True,
                max_fee_tolerance=5.00,
                description="Revolut transfers (may include fees)"
            ),
        ]
    )

def save_transfer_settings(db: Session, user: User, settings):
    """
    Save transfer settings for a user.
    """
    # In a real implementation, these would be saved to a settings table in the database
    # For now, just log that we received the settings
    logger.info(f"Saving transfer settings for user {user.id}")
    return settings

class TransferService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def get_transfer_suggestions(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get suggested transfer pairs for manual review"""
        try:
            cutoff_date = date.today() - timedelta(days=30)
            
            # Get non-transfer transactions from last 30 days
            transactions = self.db.query(Transaction).filter(
                Transaction.user_id == self.user_id,
                Transaction.date >= cutoff_date,
                Transaction.account_id.isnot(None),
                Transaction.is_transfer == False
            ).order_by(Transaction.date.desc()).limit(200).all()
            
            suggestions = []
            processed_pairs = set()
            
            logger.info(f"Found {len(transactions)} transactions to analyze for transfers")
            
            for i, tx1 in enumerate(transactions):
                if len(suggestions) >= limit:
                    break
                    
                for tx2 in transactions[i+1:]:
                    # Create unique pair identifier
                    pair_id = tuple(sorted([str(tx1.id), str(tx2.id)]))
                    if pair_id in processed_pairs:
                        continue
                    processed_pairs.add(pair_id)
                    
                    # Check if this could be a transfer
                    if self._is_potential_transfer_pair(tx1, tx2):
                        confidence = self._calculate_confidence(tx1, tx2)
                        
                        if confidence >= 0.5:
                            # Determine which is from/to based on amount
                            from_tx = tx1 if tx1.amount < 0 else tx2
                            to_tx = tx2 if tx1.amount < 0 else tx1
                            
                            suggestions.append({
                                'from_transaction': self._transaction_to_dict(from_tx),
                                'to_transaction': self._transaction_to_dict(to_tx),
                                'confidence': confidence,
                                'amount': float(abs(from_tx.amount)),
                                'date_difference': abs((tx1.date - tx2.date).days),
                                'suggested_reason': self._get_suggestion_reason(tx1, tx2, confidence)
                            })
                    
                    if len(suggestions) >= limit:
                        break
            
            # Sort by confidence
            suggestions.sort(key=lambda x: x['confidence'], reverse=True)
            logger.info(f"Generated {len(suggestions)} transfer suggestions")
            return suggestions
            
        except Exception as e:
            logger.error(f"Error in get_transfer_suggestions: {e}")
            return []
    
    def detect_potential_transfers_enhanced(self) -> Dict[str, Any]:
        """Enhanced transfer detection"""
        try:
            cutoff_date = date.today() - timedelta(days=7)
            
            # Get recent transactions that aren't already transfers
            transactions = self.db.query(Transaction).filter(
                Transaction.user_id == self.user_id,
                Transaction.date >= cutoff_date,
                Transaction.account_id.isnot(None),
                Transaction.is_transfer == False
            ).order_by(Transaction.date.desc()).all()
            
            potential_transfers = []
            auto_matched = 0
            matched_transaction_ids = set()
            
            logger.info(f"Analyzing {len(transactions)} transactions for transfers")
            
            for i, tx1 in enumerate(transactions):
                if tx1.id in matched_transaction_ids:
                    continue
                    
                for tx2 in transactions[i+1:]:
                    if tx2.id in matched_transaction_ids:
                        continue
                    
                    if self._is_potential_transfer_pair(tx1, tx2):
                        confidence = self._calculate_confidence(tx1, tx2)
                        
                        if confidence >= 0.5:
                            # Determine direction
                            from_tx = tx1 if tx1.amount < 0 else tx2
                            to_tx = tx2 if tx1.amount < 0 else tx1
                            
                            transfer_data = {
                                'from_transaction': self._transaction_to_dict(from_tx),
                                'to_transaction': self._transaction_to_dict(to_tx),
                                'confidence': confidence,
                                'amount': float(abs(from_tx.amount)),
                                'date_difference': abs((tx1.date - tx2.date).days),
                                'matched_rule': None
                            }
                            
                            potential_transfers.append(transfer_data)
                            matched_transaction_ids.add(tx1.id)
                            matched_transaction_ids.add(tx2.id)
                            
                            # Auto-match very high confidence transfers
                            if confidence >= 0.9:
                                try:
                                    self._create_transfer_from_transactions(from_tx, to_tx)
                                    auto_matched += 1
                                    logger.info(f"Auto-matched transfer: {abs(from_tx.amount)} ({confidence:.2f} confidence)")
                                except Exception as e:
                                    logger.warning(f"Failed to auto-match transfer: {e}")
                            
                            break
            
            manual_review_needed = len(potential_transfers) - auto_matched
            
            return {
                "potential_transfers": potential_transfers,
                "auto_matched": auto_matched,
                "manual_review_needed": manual_review_needed
            }
            
        except Exception as e:
            logger.error(f"Error in detect_potential_transfers_enhanced: {e}")
            return {
                "potential_transfers": [],
                "auto_matched": 0,
                "manual_review_needed": 0
            }
    
    def _is_potential_transfer_pair(self, tx1: Transaction, tx2: Transaction) -> bool:
        """Check if two transactions could be a transfer pair"""
        try:
            # Must have opposite signs (one in, one out)
            if not ((tx1.amount > 0 and tx2.amount < 0) or (tx1.amount < 0 and tx2.amount > 0)):
                return False
            
            # Must be from different accounts
            if not tx1.account_id or not tx2.account_id or tx1.account_id == tx2.account_id:
                return False
            
            # Must be within reasonable time frame (7 days)
            date_diff = abs((tx1.date - tx2.date).days)
            if date_diff > 7:
                return False
            
            # Amount difference check (allow small differences for fees)
            amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
            max_amount = max(abs(tx1.amount), abs(tx2.amount))
            
            if max_amount > 0:
                percentage_diff = amount_diff / max_amount
                # Allow up to 5% difference or 2 CHF fixed difference
                if amount_diff <= 2.0 or percentage_diff <= 0.05:
                    return True
                # Reject if difference is too large
                if percentage_diff > 0.20:
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error in _is_potential_transfer_pair: {e}")
            return False
    
    def _calculate_confidence(self, tx1: Transaction, tx2: Transaction) -> float:
        """Calculate confidence score for potential transfer pair"""
        try:
            confidence = 0.0
            
            # Amount matching (40% of score)
            amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
            max_amount = max(abs(tx1.amount), abs(tx2.amount))
            
            if max_amount > 0:
                if amount_diff == 0:
                    confidence += 0.4  # Perfect match
                elif amount_diff / max_amount <= 0.01:
                    confidence += 0.35  # Very close (within 1%)
                elif amount_diff / max_amount <= 0.05:
                    confidence += 0.25  # Close (within 5%)
                else:
                    confidence += 0.1   # Moderate match
            
            # Date proximity (30% of score)
            date_diff = abs((tx1.date - tx2.date).days)
            if date_diff == 0:
                confidence += 0.3   # Same day
            elif date_diff == 1:
                confidence += 0.25  # Next day
            elif date_diff <= 3:
                confidence += 0.15  # Within 3 days
            else:
                confidence += 0.05  # Within a week
            
            # Description analysis (20% of score)
            desc1 = (tx1.description or "").lower()
            desc2 = (tx2.description or "").lower()
            
            # Check for transfer keywords
            transfer_keywords = ['transfer', 'überweisung', 'virement', 'internal', 'zwischen']
            if any(keyword in desc1 or keyword in desc2 for keyword in transfer_keywords):
                confidence += 0.15
            
            # Check for similar words
            if desc1 and desc2:
                words1 = set(desc1.split())
                words2 = set(desc2.split())
                common_words = words1 & words2
                if len(common_words) >= 2:
                    confidence += 0.05
            
            # Account type bonus (10% of score)
            try:
                account1 = self.db.query(Account).filter(Account.id == tx1.account_id).first()
                account2 = self.db.query(Account).filter(Account.id == tx2.account_id).first()
                
                if account1 and account2:
                    # Bonus for typical transfer patterns
                    type_pairs = [
                        ('CHECKING', 'SAVINGS'),
                        ('SAVINGS', 'CHECKING'),
                        ('CHECKING', 'INVESTMENT'),
                        ('INVESTMENT', 'CHECKING')
                    ]
                    
                    account_types = (account1.account_type.value, account2.account_type.value)
                    if account_types in type_pairs or account_types[::-1] in type_pairs:
                        confidence += 0.1
            except Exception:
                pass  # Ignore account type bonus if there's an issue
            
            return max(0.0, min(confidence, 1.0))
            
        except Exception as e:
            logger.error(f"Error in _calculate_confidence: {e}")
            return 0.0
    
    def _transaction_to_dict(self, transaction: Transaction) -> Dict[str, Any]:
        """Convert transaction to dictionary for API response"""
        try:
            return {
                "id": str(transaction.id),
                "date": transaction.date.isoformat(),
                "amount": float(transaction.amount),
                "description": transaction.description or "",
                "account_id": str(transaction.account_id) if transaction.account_id else None
            }
        except Exception as e:
            logger.error(f"Error converting transaction to dict: {e}")
            return {
                "id": str(transaction.id),
                "date": "1970-01-01",
                "amount": 0.0,
                "description": "Error",
                "account_id": None
            }
    
    def _get_suggestion_reason(self, tx1: Transaction, tx2: Transaction, confidence: float) -> str:
        """Generate human-readable reason for suggestion"""
        try:
            reasons = []
            
            # Amount analysis
            amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
            if amount_diff == 0:
                reasons.append("exact amount match")
            elif amount_diff < 2.0:
                reasons.append("very similar amounts")
            
            # Date analysis
            date_diff = abs((tx1.date - tx2.date).days)
            if date_diff == 0:
                reasons.append("same date")
            elif date_diff == 1:
                reasons.append("consecutive dates")
            
            # Description analysis
            desc1 = (tx1.description or "").lower()
            desc2 = (tx2.description or "").lower()
            transfer_keywords = ['transfer', 'überweisung', 'virement']
            if any(keyword in desc1 or keyword in desc2 for keyword in transfer_keywords):
                reasons.append("transfer keywords")
            
            if not reasons:
                reasons.append("pattern analysis")
            
            return f"Suggested due to: {', '.join(reasons)}"
            
        except Exception as e:
            logger.error(f"Error generating suggestion reason: {e}")
            return "Pattern analysis"
    
    def _create_transfer_from_transactions(self, from_tx: Transaction, to_tx: Transaction) -> Transfer:
        """Create a transfer record linking two transactions"""
        try:
            transfer = Transfer(
                user_id=self.user_id,
                from_account_id=from_tx.account_id,
                to_account_id=to_tx.account_id,
                from_transaction_id=from_tx.id,
                to_transaction_id=to_tx.id,
                amount=abs(from_tx.amount),
                date=from_tx.date,
                description=f"Transfer: {from_tx.description}",
                is_confirmed=True,
                detection_method="auto"
            )
            
            self.db.add(transfer)
            
            # Mark transactions as transfers
            from_tx.is_transfer = True
            to_tx.is_transfer = True
            
            self.db.commit()
            self.db.refresh(transfer)
            
            logger.info(f"Created transfer: {abs(from_tx.amount)} between accounts")
            return transfer
            
        except Exception as e:
            logger.error(f"Error creating transfer: {e}")
            self.db.rollback()
            raise e
    
    def create_manual_transfer(self, from_transaction_id: str, to_transaction_id: str) -> Transfer:
        """Create manual transfer between two transactions"""
        try:
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
            
            if from_tx.is_transfer or to_tx.is_transfer:
                raise ValueError("One or both transactions are already part of a transfer")
            
            # Ensure correct direction (from_tx should be negative)
            if from_tx.amount > 0 and to_tx.amount < 0:
                from_tx, to_tx = to_tx, from_tx
            
            return self._create_transfer_from_transactions(from_tx, to_tx)
            
        except Exception as e:
            logger.error(f"Error creating manual transfer: {e}")
            raise e
    
    def delete_transfer(self, transfer_id: str) -> bool:
        """Delete transfer and unmark associated transactions"""
        try:
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
                    from_tx.is_transfer = False
            
            if transfer.to_transaction_id:
                to_tx = self.db.query(Transaction).filter(
                    Transaction.id == transfer.to_transaction_id
                ).first()
                if to_tx:
                    to_tx.is_transfer = False
            
            self.db.delete(transfer)
            self.db.commit()
            
            logger.info(f"Deleted transfer: {transfer.id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting transfer: {e}")
            self.db.rollback()
            return False
    
    def get_transfers(self, limit: int = 50) -> List[Transfer]:
        """Get user's transfers"""
        try:
            return self.db.query(Transfer).filter(
                Transfer.user_id == self.user_id
            ).order_by(desc(Transfer.date)).limit(limit).all()
        except Exception as e:
            logger.error(f"Error getting transfers: {e}")
            return []
    
    # Legacy compatibility method
    def detect_potential_transfers(self, days_lookback: int = 7) -> Dict[str, Any]:
        """Legacy method for backward compatibility"""
        return self.detect_potential_transfers_enhanced()