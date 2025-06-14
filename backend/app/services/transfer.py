# backend/app/services/enhanced_transfer.py - Enhanced transfer service with flexible rules

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc
from decimal import Decimal
from datetime import date, datetime, timedelta
from app.db.models import Account, Transaction, Transfer, AccountType, User
from app.schemas.transfer import TransferCreate, TransferDetectionResult, TransferMatchRequest
import re
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class TransferRule(BaseModel):
    id: Optional[str] = None
    name: str
    pattern: str
    enabled: bool = True
    auto_confirm: bool = False
    allow_fees: bool = False
    max_fee_tolerance: float = 0.0
    description: str = ""

class TransferSettings(BaseModel):
    days_lookback: int = 7
    amount_tolerance: float = 0.50
    percentage_tolerance: float = 0.02
    confidence_threshold: float = 0.85
    enable_auto_matching: bool = True
    rules: List[TransferRule] = []

class TransferService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
        self.default_settings = TransferSettings()
    
    def get_user_settings(self) -> TransferSettings:
        """Get user's transfer settings or return defaults"""
        # For now, return defaults. In future, load from database
        user = self.db.query(User).filter(User.id == self.user_id).first()
        if user and hasattr(user, 'transfer_settings') and user.transfer_settings:
            try:
                return TransferSettings.parse_obj(user.transfer_settings)
            except Exception as e:
                logger.warning(f"Failed to parse user transfer settings: {e}")
        
        return self._get_default_settings()
    
    def _get_default_settings(self) -> TransferSettings:
        """Get default transfer settings with user-specific rules"""
        default_rules = [
            TransferRule(
                name="Personal Name",
                pattern="",  # Will be filled with user's name if available
                enabled=True,
                auto_confirm=True,
                allow_fees=False,
                max_fee_tolerance=0.0,
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
            TransferRule(
                name="Savings Keywords",
                pattern="SPAREN|SAVING|SPARKONTO",
                enabled=True,
                auto_confirm=True,
                allow_fees=False,
                max_fee_tolerance=0.0,
                description="Transfers to/from savings accounts"
            ),
            TransferRule(
                name="Credit Card Payment",
                pattern="KREDITKARTE|VISA|MASTERCARD|CREDIT.*CARD",
                enabled=True,
                auto_confirm=False,
                allow_fees=False,
                max_fee_tolerance=0.0,
                description="Credit card payments and transactions"
            ),
            TransferRule(
                name="Bank Transfer Keywords",
                pattern="ÜBERWEISUNG|TRANSFER|VIREMENT|WIRE|INTERNAL",
                enabled=True,
                auto_confirm=False,
                allow_fees=True,
                max_fee_tolerance=2.00,
                description="Generic bank transfer keywords"
            )
        ]
        
        return TransferSettings(rules=default_rules)
    
    def save_user_settings(self, settings: TransferSettings) -> bool:
        """Save user's transfer settings"""
        try:
            user = self.db.query(User).filter(User.id == self.user_id).first()
            if user:
                # Store settings as JSON in user preferences
                # Note: You'll need to add a transfer_settings JSON column to User model
                user.transfer_settings = settings.dict()
                self.db.commit()
                logger.info(f"Saved transfer settings for user {self.user_id}")
                return True
        except Exception as e:
            logger.error(f"Failed to save transfer settings: {e}")
            self.db.rollback()
        return False
    
    def detect_potential_transfers_enhanced(self, custom_settings: Optional[TransferSettings] = None) -> TransferDetectionResult:
        """
        Enhanced transfer detection with configurable rules and settings
        """
        settings = custom_settings or self.get_user_settings()
        cutoff_date = date.today() - timedelta(days=settings.days_lookback)
        
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
                if not self._is_potential_transfer_pair_enhanced(tx1, tx2, settings):
                    continue
                
                # Calculate detailed confidence with rules
                confidence, matched_rule = self._calculate_transfer_confidence_enhanced(tx1, tx2, settings)
                
                if confidence >= 0.5:  # Minimum confidence threshold
                    transfer_data = {
                        'from_transaction': self._transaction_to_dict(tx1 if tx1.amount < 0 else tx2),
                        'to_transaction': self._transaction_to_dict(tx2 if tx1.amount < 0 else tx1),
                        'confidence': confidence,
                        'amount': float(abs(tx1.amount)),
                        'date_difference': abs((tx1.date - tx2.date).days),
                        'matched_rule': matched_rule.name if matched_rule else None
                    }
                    
                    potential_transfers.append(transfer_data)
                    matched_transaction_ids.add(tx1.id)
                    matched_transaction_ids.add(tx2.id)
                    
                    # Auto-match high confidence transfers or rule-based matches
                    should_auto_match = (
                        settings.enable_auto_matching and
                        (confidence >= settings.confidence_threshold or 
                         (matched_rule and matched_rule.auto_confirm))
                    )
                    
                    if should_auto_match:
                        try:
                            self._create_transfer_from_transactions(tx1, tx2)
                            auto_matched += 1
                            logger.info(f"Auto-matched transfer: {abs(tx1.amount)} ({confidence:.2f} confidence, rule: {matched_rule.name if matched_rule else 'general'})")
                        except Exception as e:
                            logger.warning(f"Failed to auto-match transfer: {e}")
                    
                    break  # Found a match for tx1, move to next transaction
        
        manual_review_needed = len(potential_transfers) - auto_matched
        
        return TransferDetectionResult(
            potential_transfers=potential_transfers,
            auto_matched=auto_matched,
            manual_review_needed=manual_review_needed
        )
    
    def _is_potential_transfer_pair_enhanced(self, tx1: Transaction, tx2: Transaction, settings: TransferSettings) -> bool:
        """
        Enhanced check with configurable tolerances
        """
        # Must have opposite signs
        if not ((tx1.amount > 0 and tx2.amount < 0) or (tx1.amount < 0 and tx2.amount > 0)):
            return False
        
        # Must be from different accounts
        if tx1.account_id and tx2.account_id and tx1.account_id == tx2.account_id:
            return False
        
        # Must be within date range
        date_diff = abs((tx1.date - tx2.date).days)
        if date_diff > settings.days_lookback:
            return False
        
        # Amount difference check with enhanced tolerances
        amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
        max_amount = max(abs(tx1.amount), abs(tx2.amount))
        
        if max_amount > 0:
            # Check fixed tolerance first
            if amount_diff <= settings.amount_tolerance:
                return True
            
            # Check percentage tolerance
            if (amount_diff / max_amount) <= settings.percentage_tolerance:
                return True
            
            # Check rule-specific fee tolerances
            for rule in settings.rules:
                if rule.enabled and rule.allow_fees and amount_diff <= rule.max_fee_tolerance:
                    # Quick pattern check
                    if self._matches_rule_pattern(tx1, rule) or self._matches_rule_pattern(tx2, rule):
                        return True
            
            # If difference is too large, reject
            if (amount_diff / max_amount) > 0.20:  # Max 20% difference
                return False
        
        return True
    
    def _calculate_transfer_confidence_enhanced(self, tx1: Transaction, tx2: Transaction, settings: TransferSettings) -> Tuple[float, Optional[TransferRule]]:
        """
        Enhanced confidence calculation with rule matching
        """
        confidence = 0.0
        matched_rule = None
        
        # Basic validation
        if not ((tx1.amount > 0 and tx2.amount < 0) or (tx1.amount < 0 and tx2.amount > 0)):
            return 0.0, None
        
        if tx1.account_id and tx2.account_id and tx1.account_id == tx2.account_id:
            return 0.0, None
        
        # Check rule matching first (can boost confidence significantly)
        for rule in settings.rules:
            if not rule.enabled:
                continue
                
            if self._matches_rule_pattern(tx1, rule) or self._matches_rule_pattern(tx2, rule):
                confidence += 0.4  # Significant boost for rule match
                matched_rule = rule
                logger.debug(f"Rule match: {rule.name} for transactions {tx1.id}, {tx2.id}")
                break
        
        # Amount matching with enhanced tolerance
        amount_diff = abs(abs(tx1.amount) - abs(tx2.amount))
        max_amount = max(abs(tx1.amount), abs(tx2.amount))
        
        if max_amount == 0:
            return 0.0, matched_rule
        
        # Enhanced amount scoring
        if amount_diff == 0:
            confidence += 0.3  # Perfect amount match
        elif amount_diff <= settings.amount_tolerance:
            confidence += 0.25  # Within fixed tolerance
        elif amount_diff / max_amount <= settings.percentage_tolerance:
            confidence += 0.2   # Within percentage tolerance
        elif matched_rule and matched_rule.allow_fees and amount_diff <= matched_rule.max_fee_tolerance:
            confidence += 0.15  # Within rule-specific fee tolerance
        elif amount_diff / max_amount <= 0.05:
            confidence += 0.1   # Small difference
        elif amount_diff / max_amount <= 0.10:
            confidence += 0.05  # Moderate difference
        else:
            confidence -= 0.1   # Large difference penalty
        
        # Date proximity scoring
        date_diff = abs((tx1.date - tx2.date).days)
        if date_diff == 0:
            confidence += 0.2   # Same day
        elif date_diff <= 1:
            confidence += 0.15  # Next day
        elif date_diff <= 2:
            confidence += 0.1   # Within 2 days
        elif date_diff <= 3:
            confidence += 0.05  # Within 3 days
        else:
            confidence -= 0.05  # Distant dates penalty
        
        # Description analysis
        desc1 = tx1.description.lower() if tx1.description else ""
        desc2 = tx2.description.lower() if tx2.description else ""
        
        # Additional keyword detection (beyond rules)
        if not matched_rule:  # Only if no rule matched
            transfer_keywords = [
                'transfer', 'überweisung', 'virement', 'internal', 'between accounts',
                'wire', 'ach', 'electronic transfer', 'online transfer'
            ]
            
            for keyword in transfer_keywords:
                if keyword in desc1 or keyword in desc2:
                    confidence += 0.1
                    break
        
        # Common description words
        if desc1 and desc2:
            words1 = set(desc1.split())
            words2 = set(desc2.split())
            common_words = words1 & words2
            if len(common_words) >= 2:
                confidence += 0.05
        
        # Account type patterns (if available)
        try:
            if (tx1.account and tx2.account and 
                hasattr(tx1.account, 'account_type') and hasattr(tx2.account, 'account_type')):
                
                transfer_patterns = [
                    (AccountType.CHECKING, AccountType.SAVINGS),
                    (AccountType.SAVINGS, AccountType.CHECKING),
                    (AccountType.CHECKING, AccountType.INVESTMENT),
                    (AccountType.INVESTMENT, AccountType.CHECKING),
                    (AccountType.CREDIT_CARD, AccountType.CHECKING),
                ]
                
                account_types = (tx1.account.account_type, tx2.account.account_type)
                reverse_types = (tx2.account.account_type, tx1.account.account_type)
                
                if account_types in transfer_patterns or reverse_types in transfer_patterns:
                    confidence += 0.1
        except Exception as e:
            logger.debug(f"Could not check account types: {e}")
        
        # Amount-based heuristics
        if max_amount >= 1000.0:  # Large amounts more likely to be transfers
            confidence += 0.05
        elif max_amount < 10.0:   # Very small amounts less likely
            confidence -= 0.05
        
        # Round amounts more likely to be transfers
        if abs(tx1.amount) % 1 == 0 or abs(tx2.amount) % 1 == 0:
            confidence += 0.03
        
        return max(0.0, min(confidence, 1.0)), matched_rule
    
    def _matches_rule_pattern(self, transaction: Transaction, rule: TransferRule) -> bool:
        """
        Check if a transaction matches a rule pattern
        """
        if not rule.pattern or not transaction.description:
            return False
        
        description = transaction.description.upper()
        pattern = rule.pattern.upper()
        
        try:
            # Try regex first
            if re.search(pattern, description, re.IGNORECASE):
                return True
        except re.error:
            # If regex fails, fall back to simple text matching
            if pattern in description:
                return True
        
        return False
    
    def _transaction_to_dict(self, transaction: Transaction) -> Dict[str, Any]:
        """Convert transaction to dictionary for API response"""
        return {
            "id": str(transaction.id),
            "date": transaction.date.isoformat(),
            "amount": float(abs(transaction.amount)),
            "description": transaction.description,
            "account_id": str(transaction.account_id)
        }
    
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
    
    def test_transfer_rules(self, settings: TransferSettings) -> Dict[str, Any]:
        """
        Test transfer rules against historical data without creating transfers
        """
        cutoff_date = date.today() - timedelta(days=settings.days_lookback)
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.date >= cutoff_date,
            Transaction.account_id.isnot(None)
        ).order_by(Transaction.date.desc()).limit(500).all()  # Limit for performance
        
        matches = []
        rule_stats = {rule.name: 0 for rule in settings.rules if rule.enabled}
        
        processed_pairs = set()
        
        for i, tx1 in enumerate(transactions):
            for tx2 in transactions[i+1:]:
                # Create unique pair identifier
                pair_id = tuple(sorted([str(tx1.id), str(tx2.id)]))
                if pair_id in processed_pairs:
                    continue
                processed_pairs.add(pair_id)
                
                if not self._is_potential_transfer_pair_enhanced(tx1, tx2, settings):
                    continue
                
                confidence, matched_rule = self._calculate_transfer_confidence_enhanced(tx1, tx2, settings)
                
                if confidence >= 0.5:  # Same threshold as detection
                    matches.append({
                        'from_description': tx1.description if tx1.amount < 0 else tx2.description,
                        'to_description': tx2.description if tx1.amount < 0 else tx1.description,
                        'amount': float(abs(tx1.amount)),
                        'confidence': confidence,
                        'matched_rule': matched_rule.name if matched_rule else None,
                        'date_difference': abs((tx1.date - tx2.date).days)
                    })
                    
                    if matched_rule:
                        rule_stats[matched_rule.name] += 1
                
                if len(matches) >= 20:  # Limit results
                    break
            
            if len(matches) >= 20:
                break
        
        return {
            'matches': len(matches),
            'samples': matches[:10],  # Return top 10 for display
            'rule_stats': rule_stats,
            'settings_used': settings.dict()
        }
    
    def get_transfer_suggestions(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get suggested transfer pairs for manual review using current settings
        """
        settings = self.get_user_settings()
        cutoff_date = date.today() - timedelta(days=30)  # Look back 30 days
        
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.date >= cutoff_date,
            Transaction.transfer_id.is_(None),
            Transaction.account_id.isnot(None)
        ).order_by(Transaction.date.desc()).limit(200).all()
        
        suggestions = []
        processed_pairs = set()
        
        for i, tx1 in enumerate(transactions):
            for tx2 in transactions[i+1:]:
                pair_id = tuple(sorted([str(tx1.id), str(tx2.id)]))
                if pair_id in processed_pairs:
                    continue
                processed_pairs.add(pair_id)
                
                if not self._is_potential_transfer_pair_enhanced(tx1, tx2, settings):
                    continue
                
                confidence, matched_rule = self._calculate_transfer_confidence_enhanced(tx1, tx2, settings)
                
                # Suggest transfers with moderate confidence (manual review needed)
                if 0.5 <= confidence < settings.confidence_threshold:
                    suggestions.append({
                        'from_transaction': self._transaction_to_dict(tx1 if tx1.amount < 0 else tx2),
                        'to_transaction': self._transaction_to_dict(tx2 if tx1.amount < 0 else tx1),
                        'confidence': confidence,
                        'amount': float(abs(tx1.amount)),
                        'date_difference': abs((tx1.date - tx2.date).days),
                        'matched_rule': matched_rule.name if matched_rule else None,
                        'suggested_reason': self._get_suggestion_reason(tx1, tx2, confidence, matched_rule)
                    })
                
                if len(suggestions) >= limit:
                    break
            
            if len(suggestions) >= limit:
                break
        
        # Sort by confidence descending
        suggestions.sort(key=lambda x: x['confidence'], reverse=True)
        return suggestions
    
    def _get_suggestion_reason(self, tx1: Transaction, tx2: Transaction, confidence: float, matched_rule: Optional[TransferRule]) -> str:
        """Generate a human-readable reason for the suggestion"""
        reasons = []
        
        if matched_rule:
            reasons.append(f"matches rule '{matched_rule.name}'")
        
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
        
        if not reasons:
            reasons.append("pattern analysis")
        
        return f"Suggested due to: {', '.join(reasons)}"
    
    # Legacy compatibility methods
    def detect_potential_transfers(self, days_lookback: int = 7) -> TransferDetectionResult:
        """Legacy method for backward compatibility"""
        settings = self.get_user_settings()
        settings.days_lookback = days_lookback
        return self.detect_potential_transfers_enhanced(settings)
    
    def create_manual_transfer(self, from_transaction_id: str, to_transaction_id: str) -> Transfer:
        """Create manual transfer (unchanged from original)"""
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
        
        settings = self.get_user_settings()
        if not self._is_potential_transfer_pair_enhanced(from_tx, to_tx, settings):
            raise ValueError("Transactions do not appear to be a valid transfer pair")
        
        return self._create_transfer_from_transactions(from_tx, to_tx)
    
    def get_transfers(self, limit: int = 50) -> List[Transfer]:
        """Get user's transfers (unchanged from original)"""
        return self.db.query(Transfer).filter(
            Transfer.user_id == self.user_id
        ).order_by(desc(Transfer.date)).limit(limit).all()
    
    def delete_transfer(self, transfer_id: str) -> bool:
        """Delete transfer (unchanged from original)"""
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