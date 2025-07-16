# backend/app/services/transfer.py - Complete rewrite with proper error handling

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from decimal import Decimal
from datetime import date, datetime, timedelta
from app.db.models import Account, Transaction, Transfer, User
from .transfer_learning import TransferLearningService
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
        self.learning_service = TransferLearningService(db, user_id)
    
    def get_transfer_suggestions(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get transfer suggestions using learned patterns and fallback heuristics"""
        try:
            # First, try to get suggestions from learned patterns
            pattern_suggestions = self.learning_service.find_potential_transfers_by_patterns()
            
            # If we have enough pattern suggestions, use them
            if len(pattern_suggestions) >= limit:
                return pattern_suggestions[:limit]
            
            # Otherwise, combine pattern suggestions with heuristic suggestions
            heuristic_suggestions = self._get_heuristic_suggestions(limit - len(pattern_suggestions))
            
            # Combine and deduplicate
            all_suggestions = pattern_suggestions + heuristic_suggestions
            unique_suggestions = self._deduplicate_suggestions(all_suggestions)
            
            # Sort by confidence and limit
            unique_suggestions.sort(key=lambda x: x['confidence'], reverse=True)
            return unique_suggestions[:limit]
            
        except Exception as e:
            logger.error(f"Error getting transfer suggestions: {e}")
            return []
    
    def create_transfer_with_learning(self, from_transaction_id: str, to_transaction_id: str, 
                                    description: str = None, learn_pattern: bool = True) -> Dict[str, Any]:
        """Create a transfer and optionally learn from the pattern"""
        try:
            from app.db.models import Transaction, Transfer
            
            # Get transactions
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
            
            # Create transfer
            transfer = Transfer(
                user_id=self.user_id,
                from_account_id=from_tx.account_id,
                to_account_id=to_tx.account_id,
                from_transaction_id=from_transaction_id,
                to_transaction_id=to_transaction_id,
                amount=abs(from_tx.amount),
                date=from_tx.date,
                description=description or f"Transfer: {from_tx.description}",
                is_confirmed=True,
                detection_method="manual",
                confidence_score=1.0
            )
            
            self.db.add(transfer)
            self.db.commit()
            self.db.refresh(transfer)
            
            # Learn pattern if requested
            if learn_pattern:
                try:
                    self.learning_service.learn_from_manual_transfer(transfer)
                    logger.info(f"Successfully learned pattern from transfer {transfer.id}")
                except Exception as e:
                    logger.error(f"Error learning pattern from transfer {transfer.id}: {e}")
            
            return {
                "transfer_id": str(transfer.id),
                "message": "Transfer created successfully",
                "pattern_learned": learn_pattern
            }
            
        except Exception as e:
            logger.error(f"Error creating transfer with learning: {e}")
            self.db.rollback()
            raise
    
    def detect_transfers_with_pockets(self, include_pocket_assignments: bool = True) -> Dict[str, Any]:
        """Enhanced transfer detection with savings pocket awareness"""
        try:
            # Get user settings for confidence thresholds
            from app.db.models import UserSettings
            user_settings = self.db.query(UserSettings).filter(
                UserSettings.user_id == self.user_id
            ).first()
            
            auto_confirm_threshold = user_settings.auto_confirm_threshold if user_settings else 0.9
            
            # Get basic transfer detection results
            base_results = self.detect_potential_transfers_enhanced()
            
            # Enhance with savings pocket suggestions
            enhanced_suggestions = []
            
            for suggestion in base_results.get('potential_transfers', []):
                enhanced_suggestion = suggestion.copy()
                
                if include_pocket_assignments:
                    # Try to suggest savings pocket assignments
                    pocket_suggestions = self._suggest_savings_pocket_assignments(suggestion)
                    enhanced_suggestion['pocket_suggestions'] = pocket_suggestions
                
                # Auto-confirm if confidence is high enough
                if suggestion['confidence'] >= auto_confirm_threshold:
                    enhanced_suggestion['auto_confirm_eligible'] = True
                else:
                    enhanced_suggestion['auto_confirm_eligible'] = False
                
                enhanced_suggestions.append(enhanced_suggestion)
            
            return {
                "potential_transfers": enhanced_suggestions,
                "auto_matched": base_results.get('auto_matched', 0),
                "manual_review_needed": base_results.get('manual_review_needed', 0),
                "auto_confirm_eligible": len([s for s in enhanced_suggestions if s.get('auto_confirm_eligible', False)])
            }
            
        except Exception as e:
            logger.error(f"Error detecting transfers with pockets: {e}")
            return {
                "potential_transfers": [],
                "auto_matched": 0,
                "manual_review_needed": 0,
                "auto_confirm_eligible": 0
            }
    
    def _suggest_savings_pocket_assignments(self, transfer_suggestion: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Suggest savings pocket assignments for a transfer"""
        try:
            from app.db.models import SavingsPocket, Account
            
            # Get accounts involved in the transfer
            from_account_id = transfer_suggestion['from_transaction'].get('account_id')
            to_account_id = transfer_suggestion['to_transaction'].get('account_id')
            
            suggestions = []
            
            # Look for savings pockets in the destination account
            if to_account_id:
                to_account = self.db.query(Account).filter(
                    Account.id == to_account_id,
                    Account.user_id == self.user_id
                ).first()
                
                if to_account and not to_account.is_main_account:
                    # Get savings pockets for this account
                    pockets = self.db.query(SavingsPocket).filter(
                        SavingsPocket.account_id == to_account_id,
                        SavingsPocket.user_id == self.user_id,
                        SavingsPocket.is_active == True
                    ).all()
                    
                    for pocket in pockets:
                        # Calculate how well this pocket might match
                        confidence = self._calculate_pocket_assignment_confidence(
                            transfer_suggestion, pocket
                        )
                        
                        if confidence > 0.3:  # Only suggest if somewhat confident
                            suggestions.append({
                                'pocket_id': str(pocket.id),
                                'pocket_name': pocket.name,
                                'confidence': confidence,
                                'reason': self._get_pocket_suggestion_reason(transfer_suggestion, pocket)
                            })
            
            # Sort by confidence
            suggestions.sort(key=lambda x: x['confidence'], reverse=True)
            return suggestions[:3]  # Return top 3 suggestions
            
        except Exception as e:
            logger.error(f"Error suggesting savings pocket assignments: {e}")
            return []
    
    def _calculate_pocket_assignment_confidence(self, transfer_suggestion: Dict[str, Any], 
                                               pocket: 'SavingsPocket') -> float:
        """Calculate confidence for assigning a transfer to a savings pocket"""
        confidence = 0.0
        
        # Check if transfer description matches pocket name or description
        transfer_desc = transfer_suggestion['from_transaction'].get('description', '').lower()
        pocket_name = pocket.name.lower()
        pocket_desc = (pocket.description or '').lower()
        
        if pocket_name in transfer_desc or transfer_desc in pocket_name:
            confidence += 0.5
        
        if pocket_desc and (pocket_desc in transfer_desc or transfer_desc in pocket_desc):
            confidence += 0.3
        
        # Check if amount fits pocket patterns (if target amount exists)
        if pocket.target_amount:
            amount = transfer_suggestion.get('amount', 0)
            if amount <= pocket.target_amount:
                confidence += 0.2
        
        return min(confidence, 1.0)
    
    def _get_pocket_suggestion_reason(self, transfer_suggestion: Dict[str, Any], 
                                     pocket: 'SavingsPocket') -> str:
        """Get reason for pocket assignment suggestion"""
        reasons = []
        
        transfer_desc = transfer_suggestion['from_transaction'].get('description', '').lower()
        pocket_name = pocket.name.lower()
        
        if pocket_name in transfer_desc:
            reasons.append(f"Transfer description contains '{pocket.name}'")
        
        if pocket.target_amount:
            amount = transfer_suggestion.get('amount', 0)
            if amount <= pocket.target_amount:
                reasons.append(f"Amount fits within target of {pocket.target_amount}")
        
        if not reasons:
            reasons.append("Similar to other transfers to this pocket")
        
        return "; ".join(reasons)
    
    def assign_transfer_to_pocket(self, transfer_id: str, pocket_id: str, 
                                 allocation_amount: float = None) -> Dict[str, Any]:
        """Assign a transfer to a savings pocket"""
        try:
            from app.db.models import Transfer, SavingsPocket, TransferAllocation
            
            # Get transfer
            transfer = self.db.query(Transfer).filter(
                Transfer.id == transfer_id,
                Transfer.user_id == self.user_id
            ).first()
            
            if not transfer:
                raise ValueError("Transfer not found")
            
            # Get pocket
            pocket = self.db.query(SavingsPocket).filter(
                SavingsPocket.id == pocket_id,
                SavingsPocket.user_id == self.user_id
            ).first()
            
            if not pocket:
                raise ValueError("Savings pocket not found")
            
            # Create allocation
            allocation = TransferAllocation(
                user_id=self.user_id,
                transfer_id=transfer_id,
                allocated_pocket_id=pocket_id,
                allocated_amount=allocation_amount or transfer.amount,
                allocation_type="manual",
                description=f"Allocated to {pocket.name}",
                auto_confirmed=False,
                confidence_score=0.8
            )
            
            self.db.add(allocation)
            
            # Update pocket balance
            pocket.current_amount += allocation.allocated_amount
            
            self.db.commit()
            
            return {
                "allocation_id": str(allocation.id),
                "message": f"Transfer allocated to {pocket.name}",
                "allocated_amount": float(allocation.allocated_amount),
                "new_pocket_balance": float(pocket.current_amount)
            }
            
        except Exception as e:
            logger.error(f"Error assigning transfer to pocket: {e}")
            self.db.rollback()
            raise
    
    def _get_heuristic_suggestions(self, limit: int) -> List[Dict[str, Any]]:
        """Get transfer suggestions using the old heuristic method as fallback - Only for TRANSFER category transactions"""
        try:
            from app.db.models import Category, CategoryType
            cutoff_date = date.today() - timedelta(days=30)
            
            # Get transfer categories for this user
            transfer_categories = self.db.query(Category).filter(
                Category.user_id == self.user_id,
                Category.category_type == CategoryType.TRANSFER
            ).all()
            
            if not transfer_categories:
                logger.info("No transfer categories found - creating default 'Account Transfers' category")
                # Create default Account Transfers category
                transfer_category = Category(
                    user_id=self.user_id,
                    name="Account Transfers",
                    category_type=CategoryType.TRANSFER,
                    allow_auto_learning=True
                )
                self.db.add(transfer_category)
                self.db.commit()
                self.db.refresh(transfer_category)
                transfer_categories = [transfer_category]
            
            transfer_category_ids = [cat.id for cat in transfer_categories]
            
            # Get non-transfer transactions from last 30 days that are categorized as transfers
            transactions = self.db.query(Transaction).filter(
                Transaction.user_id == self.user_id,
                Transaction.date >= cutoff_date,
                Transaction.account_id.isnot(None),
                Transaction.is_transfer == False,
                Transaction.category_id.in_(transfer_category_ids)
            ).order_by(Transaction.date.desc()).limit(200).all()
            
            suggestions = []
            processed_pairs = set()
            
            logger.info(f"Found {len(transactions)} TRANSFER category transactions to analyze for heuristic transfers")
            
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
                                'suggested_reason': self._get_suggestion_reason(tx1, tx2, confidence),
                                'matched_pattern': 'heuristic'
                            })
                    
                    if len(suggestions) >= limit:
                        break
            
            return suggestions
            
        except Exception as e:
            logger.error(f"Error in heuristic suggestions: {e}")
            return []
    
    def _deduplicate_suggestions(self, suggestions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate suggestions"""
        seen = set()
        unique = []
        
        for suggestion in suggestions:
            # Create a unique key for this suggestion
            key = (
                suggestion['from_transaction']['id'],
                suggestion['to_transaction']['id']
            )
            
            if key not in seen:
                seen.add(key)
                unique.append(suggestion)
        
        return unique
    
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
    
    def create_manual_transfer(self, from_transaction_id: str, to_transaction_id: str, learn_pattern: bool = True) -> Transfer:
        """Create manual transfer between two transactions and optionally learn pattern"""
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
            
            # Create the transfer
            transfer = self._create_transfer_from_transactions(from_tx, to_tx)
            
            # Learn pattern from this manual transfer if requested
            if learn_pattern:
                try:
                    pattern = self.learning_service.learn_from_manual_transfer(transfer)
                    logger.info(f"Learned pattern from manual transfer: {pattern.pattern_name}")
                except Exception as e:
                    logger.warning(f"Failed to learn pattern from transfer: {e}")
            
            return transfer
            
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
    
    def get_transfer_patterns(self) -> List[Dict[str, Any]]:
        """Get all transfer patterns for the user"""
        try:
            patterns = self.learning_service.get_transfer_patterns()
            
            pattern_list = []
            for pattern in patterns:
                pattern_list.append({
                    'id': str(pattern.id),
                    'pattern_name': pattern.pattern_name,
                    'from_account_pattern': pattern.from_account_pattern,
                    'to_account_pattern': pattern.to_account_pattern,
                    'description_pattern': pattern.description_pattern,
                    'typical_amount': float(pattern.typical_amount) if pattern.typical_amount else None,
                    'amount_tolerance': pattern.amount_tolerance,
                    'max_days_between': pattern.max_days_between,
                    'confidence_threshold': pattern.confidence_threshold,
                    'auto_confirm': pattern.auto_confirm,
                    'times_matched': pattern.times_matched,
                    'last_matched': pattern.last_matched.isoformat() if pattern.last_matched else None,
                    'is_active': pattern.is_active,
                    'created_at': pattern.created_at.isoformat()
                })
            
            return pattern_list
            
        except Exception as e:
            logger.error(f"Error getting transfer patterns: {e}")
            return []
    
    def update_transfer_pattern(self, pattern_id: str, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Update transfer pattern settings"""
        try:
            pattern = self.learning_service.update_pattern_settings(pattern_id, settings)
            
            return {
                'id': str(pattern.id),
                'pattern_name': pattern.pattern_name,
                'auto_confirm': pattern.auto_confirm,
                'confidence_threshold': pattern.confidence_threshold,
                'amount_tolerance': pattern.amount_tolerance,
                'max_days_between': pattern.max_days_between,
                'is_active': pattern.is_active,
                'updated_at': pattern.updated_at.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error updating transfer pattern: {e}")
            raise e
    
    def delete_transfer_pattern(self, pattern_id: str) -> bool:
        """Delete transfer pattern"""
        try:
            return self.learning_service.delete_pattern(pattern_id)
        except Exception as e:
            logger.error(f"Error deleting transfer pattern: {e}")
            return False
    
    # Legacy compatibility method
    def detect_potential_transfers(self, days_lookback: int = 7) -> Dict[str, Any]:
        """Legacy method for backward compatibility"""
        return self.detect_potential_transfers_enhanced()