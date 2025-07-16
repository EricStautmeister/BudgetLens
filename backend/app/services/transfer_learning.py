# backend/app/services/transfer_learning.py

import logging
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from rapidfuzz import fuzz

from ..db.models import Transaction, Account, Transfer, TransferPattern, User
from ..schemas.transfer import TransferSuggestion

logger = logging.getLogger(__name__)

class TransferLearningService:
    """Service for learning and applying transfer patterns"""
    
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def learn_from_manual_transfer(self, transfer: Transfer, pattern_name: Optional[str] = None) -> TransferPattern:
        """Learn a pattern from a manually confirmed transfer"""
        try:
            # Get the accounts involved
            from_account = self.db.query(Account).filter(Account.id == transfer.from_account_id).first()
            to_account = self.db.query(Account).filter(Account.id == transfer.to_account_id).first()
            
            if not from_account or not to_account:
                raise ValueError("Could not find transfer accounts")
            
            # Generate pattern name if not provided
            if not pattern_name:
                pattern_name = f"{from_account.name} → {to_account.name}"
            
            # Extract patterns from the transfer
            from_pattern = self._extract_account_pattern(from_account)
            to_pattern = self._extract_account_pattern(to_account)
            description_pattern = self._extract_description_pattern(transfer.description)
            amount_pattern = self._extract_amount_pattern(transfer.amount)
            
            # Check if similar pattern already exists
            existing_pattern = self._find_similar_pattern(from_pattern, to_pattern, description_pattern)
            
            if existing_pattern:
                # Update existing pattern
                existing_pattern.times_matched += 1
                existing_pattern.last_matched = datetime.now()
                existing_pattern.updated_at = datetime.now()
                
                # Update amount information
                self._update_amount_pattern(existing_pattern, transfer.amount)
                
                logger.info(f"Updated existing transfer pattern: {existing_pattern.pattern_name}")
                return existing_pattern
            else:
                # Create new pattern
                new_pattern = TransferPattern(
                    user_id=self.user_id,
                    pattern_name=pattern_name,
                    from_account_pattern=from_pattern,
                    to_account_pattern=to_pattern,
                    description_pattern=description_pattern,
                    amount_pattern=amount_pattern,
                    typical_amount=transfer.amount,
                    amount_tolerance=0.05,  # 5% tolerance
                    max_days_between=3,
                    confidence_threshold=0.8,
                    auto_confirm=False,  # Start with manual confirmation
                    times_matched=1,
                    last_matched=datetime.now(),
                    created_from_transfer_id=transfer.id
                )
                
                self.db.add(new_pattern)
                self.db.commit()
                self.db.refresh(new_pattern)
                
                logger.info(f"Created new transfer pattern: {pattern_name}")
                return new_pattern
                
        except Exception as e:
            logger.error(f"Error learning from transfer: {e}")
            raise e
    
    def find_potential_transfers_by_patterns(self, days_lookback: int = 30) -> List[Dict[str, Any]]:
        """Find potential transfers using learned patterns"""
        try:
            cutoff_date = date.today() - timedelta(days=days_lookback)
            
            # Get active patterns
            patterns = self.db.query(TransferPattern).filter(
                TransferPattern.user_id == self.user_id,
                TransferPattern.is_active == True
            ).all()
            
            # Get recent non-transfer transactions
            transactions = self.db.query(Transaction).filter(
                Transaction.user_id == self.user_id,
                Transaction.date >= cutoff_date,
                Transaction.account_id.isnot(None),
                Transaction.is_transfer == False
            ).order_by(Transaction.date.desc()).all()
            
            suggestions = []
            
            for pattern in patterns:
                pattern_suggestions = self._find_matches_for_pattern(pattern, transactions)
                suggestions.extend(pattern_suggestions)
            
            # Remove duplicates and sort by confidence
            unique_suggestions = self._deduplicate_suggestions(suggestions)
            unique_suggestions.sort(key=lambda x: x['confidence'], reverse=True)
            
            logger.info(f"Found {len(unique_suggestions)} potential transfers from {len(patterns)} patterns")
            return unique_suggestions
            
        except Exception as e:
            logger.error(f"Error finding transfers by patterns: {e}")
            return []
    
    def _extract_account_pattern(self, account: Account) -> str:
        """Extract pattern from account"""
        # Create a pattern based on account type and name
        pattern_parts = []
        
        if account.account_type:
            pattern_parts.append(f"type:{account.account_type.value}")
        
        if account.name:
            # Normalize account name - remove numbers and special chars
            normalized_name = self._normalize_account_name(account.name)
            if normalized_name:
                pattern_parts.append(f"name:{normalized_name}")
        
        if account.institution:
            pattern_parts.append(f"institution:{account.institution}")
        
        return "|".join(pattern_parts)
    
    def _extract_description_pattern(self, description: Optional[str]) -> str:
        """Extract pattern from transfer description"""
        if not description:
            return ""
        
        # Normalize description
        normalized = description.lower()
        
        # Look for common transfer keywords
        transfer_keywords = [
            'transfer', 'überweisung', 'virement', 'internal',
            'zwischen', 'to', 'from', 'payment', 'wire'
        ]
        
        found_keywords = []
        for keyword in transfer_keywords:
            if keyword in normalized:
                found_keywords.append(keyword)
        
        if found_keywords:
            return f"keywords:{','.join(found_keywords)}"
        
        # If no keywords, use first few words
        words = normalized.split()[:3]
        return f"prefix:{' '.join(words)}"
    
    def _extract_amount_pattern(self, amount: Decimal) -> str:
        """Extract pattern from amount"""
        amount_float = float(abs(amount))
        
        # Check for common round amounts
        if amount_float == int(amount_float):
            if amount_float % 1000 == 0:
                return f"round:1000"
            elif amount_float % 100 == 0:
                return f"round:100"
            elif amount_float % 50 == 0:
                return f"round:50"
        
        # For irregular amounts, create a range pattern
        if amount_float < 100:
            return f"range:0-100"
        elif amount_float < 500:
            return f"range:100-500"
        elif amount_float < 1000:
            return f"range:500-1000"
        elif amount_float < 5000:
            return f"range:1000-5000"
        else:
            return f"range:5000+"
    
    def _normalize_account_name(self, name: str) -> str:
        """Normalize account name for pattern matching"""
        # Remove numbers and special characters
        normalized = ""
        for char in name.upper():
            if char.isalpha() or char.isspace():
                normalized += char
        
        # Remove extra spaces
        normalized = ' '.join(normalized.split())
        return normalized
    
    def _find_similar_pattern(self, from_pattern: str, to_pattern: str, description_pattern: str) -> Optional[TransferPattern]:
        """Find existing similar pattern"""
        patterns = self.db.query(TransferPattern).filter(
            TransferPattern.user_id == self.user_id,
            TransferPattern.is_active == True
        ).all()
        
        for pattern in patterns:
            # Check similarity
            from_match = self._pattern_similarity(pattern.from_account_pattern, from_pattern)
            to_match = self._pattern_similarity(pattern.to_account_pattern, to_pattern)
            desc_match = self._pattern_similarity(pattern.description_pattern, description_pattern)
            
            # If accounts match closely, consider it the same pattern
            if from_match > 0.8 and to_match > 0.8:
                return pattern
        
        return None
    
    def _pattern_similarity(self, pattern1: str, pattern2: str) -> float:
        """Calculate similarity between two patterns"""
        if not pattern1 or not pattern2:
            return 0.0
        
        # Use fuzzy matching for similarity
        return fuzz.ratio(pattern1, pattern2) / 100.0
    
    def _update_amount_pattern(self, pattern: TransferPattern, new_amount: Decimal):
        """Update amount pattern based on new data"""
        if pattern.typical_amount:
            # Calculate new average
            old_weight = pattern.times_matched - 1
            new_weight = 1
            total_weight = old_weight + new_weight
            
            pattern.typical_amount = (
                (pattern.typical_amount * old_weight + new_amount * new_weight) / total_weight
            )
        else:
            pattern.typical_amount = new_amount
    
    def _find_matches_for_pattern(self, pattern: TransferPattern, transactions: List[Transaction]) -> List[Dict[str, Any]]:
        """Find transaction pairs that match a specific pattern"""
        matches = []
        
        # Get accounts that match the pattern
        from_accounts = self._get_matching_accounts(pattern.from_account_pattern)
        to_accounts = self._get_matching_accounts(pattern.to_account_pattern)
        
        # Find transaction pairs
        for from_account in from_accounts:
            for to_account in to_accounts:
                if from_account.id == to_account.id:
                    continue
                
                # Get transactions for these accounts
                from_transactions = [t for t in transactions if t.account_id == from_account.id and t.amount < 0]
                to_transactions = [t for t in transactions if t.account_id == to_account.id and t.amount > 0]
                
                # Match transactions
                for from_tx in from_transactions:
                    for to_tx in to_transactions:
                        confidence = self._calculate_pattern_confidence(pattern, from_tx, to_tx)
                        
                        if confidence >= pattern.confidence_threshold:
                            matches.append({
                                'from_transaction': self._transaction_to_dict(from_tx),
                                'to_transaction': self._transaction_to_dict(to_tx),
                                'confidence': confidence,
                                'amount': float(abs(from_tx.amount)),
                                'date_difference': abs((from_tx.date - to_tx.date).days),
                                'matched_pattern': pattern.pattern_name,
                                'pattern_id': str(pattern.id),
                                'auto_confirm': pattern.auto_confirm
                            })
        
        return matches
    
    def _get_matching_accounts(self, pattern: str) -> List[Account]:
        """Get accounts that match a pattern"""
        if not pattern:
            return []
        
        accounts = self.db.query(Account).filter(
            Account.user_id == self.user_id,
            Account.is_active == True
        ).all()
        
        matching_accounts = []
        
        for account in accounts:
            account_pattern = self._extract_account_pattern(account)
            similarity = self._pattern_similarity(account_pattern, pattern)
            
            if similarity > 0.7:  # 70% similarity threshold
                matching_accounts.append(account)
        
        return matching_accounts
    
    def _calculate_pattern_confidence(self, pattern: TransferPattern, from_tx: Transaction, to_tx: Transaction) -> float:
        """Calculate confidence that two transactions match a pattern"""
        confidence = 0.0
        
        # Amount matching (40% of score)
        if pattern.typical_amount:
            amount_diff = abs(abs(from_tx.amount) - pattern.typical_amount)
            max_diff = pattern.typical_amount * pattern.amount_tolerance
            
            if amount_diff == 0:
                confidence += 0.4
            elif amount_diff <= max_diff:
                confidence += 0.4 * (1 - amount_diff / max_diff)
            else:
                confidence += 0.1  # Some points for being in the right ballpark
        
        # Date proximity (30% of score)
        date_diff = abs((from_tx.date - to_tx.date).days)
        if date_diff == 0:
            confidence += 0.3
        elif date_diff <= pattern.max_days_between:
            confidence += 0.3 * (1 - date_diff / pattern.max_days_between)
        
        # Description matching (20% of score)
        if pattern.description_pattern:
            desc_match = self._match_description_pattern(pattern.description_pattern, from_tx.description, to_tx.description)
            confidence += 0.2 * desc_match
        
        # Historical success (10% of score)
        if pattern.times_matched > 0:
            # More successful patterns get bonus
            success_bonus = min(pattern.times_matched / 10, 1.0)
            confidence += 0.1 * success_bonus
        
        return min(confidence, 1.0)
    
    def _match_description_pattern(self, pattern: str, desc1: Optional[str], desc2: Optional[str]) -> float:
        """Match description pattern against transaction descriptions"""
        if not pattern:
            return 0.5  # Neutral if no pattern
        
        descriptions = [desc1 or "", desc2 or ""]
        
        if pattern.startswith("keywords:"):
            keywords = pattern.split(":", 1)[1].split(",")
            for desc in descriptions:
                for keyword in keywords:
                    if keyword in desc.lower():
                        return 1.0
            return 0.0
        
        elif pattern.startswith("prefix:"):
            prefix = pattern.split(":", 1)[1]
            for desc in descriptions:
                if prefix in desc.lower():
                    return 1.0
            return 0.0
        
        return 0.5  # Default neutral score
    
    def _transaction_to_dict(self, transaction: Transaction) -> Dict[str, Any]:
        """Convert transaction to dictionary"""
        return {
            "id": str(transaction.id),
            "date": transaction.date.isoformat(),
            "amount": float(transaction.amount),
            "description": transaction.description or "",
            "account_id": str(transaction.account_id) if transaction.account_id else None
        }
    
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
    
    def get_transfer_patterns(self) -> List[TransferPattern]:
        """Get all transfer patterns for the user"""
        return self.db.query(TransferPattern).filter(
            TransferPattern.user_id == self.user_id
        ).order_by(TransferPattern.times_matched.desc()).all()
    
    def update_pattern_settings(self, pattern_id: str, settings: Dict[str, Any]) -> TransferPattern:
        """Update pattern settings"""
        pattern = self.db.query(TransferPattern).filter(
            TransferPattern.id == pattern_id,
            TransferPattern.user_id == self.user_id
        ).first()
        
        if not pattern:
            raise ValueError("Pattern not found")
        
        # Update allowed settings
        if 'auto_confirm' in settings:
            pattern.auto_confirm = settings['auto_confirm']
        if 'confidence_threshold' in settings:
            pattern.confidence_threshold = settings['confidence_threshold']
        if 'amount_tolerance' in settings:
            pattern.amount_tolerance = settings['amount_tolerance']
        if 'max_days_between' in settings:
            pattern.max_days_between = settings['max_days_between']
        if 'is_active' in settings:
            pattern.is_active = settings['is_active']
        
        pattern.updated_at = datetime.now()
        self.db.commit()
        
        return pattern
    
    def delete_pattern(self, pattern_id: str) -> bool:
        """Delete a transfer pattern"""
        pattern = self.db.query(TransferPattern).filter(
            TransferPattern.id == pattern_id,
            TransferPattern.user_id == self.user_id
        ).first()
        
        if not pattern:
            return False
        
        self.db.delete(pattern)
        self.db.commit()
        
        return True
