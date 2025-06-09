from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process
from app.db.models import Transaction, Vendor, Category
import re
import logging

logger = logging.getLogger(__name__)

class CategorizationService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def categorize_new_transactions(self, confidence_threshold: float = 0.8):
        """Categorize all uncategorized transactions"""
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_id.is_(None)
        ).all()
        
        for transaction in transactions:
            vendor, confidence = self._match_vendor(transaction.description)
            
            if vendor and confidence >= confidence_threshold:
                transaction.vendor_id = vendor.id
                transaction.category_id = vendor.default_category_id
                transaction.confidence_score = confidence
                transaction.needs_review = False
            else:
                transaction.confidence_score = confidence if vendor else 0.0
                transaction.needs_review = True
        
        self.db.commit()
    
    def _match_vendor(self, description: str) -> Tuple[Optional[Vendor], float]:
        """Match transaction description to known vendor"""
        vendors = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id
        ).all()
        
        best_match = None
        best_score = 0.0
        
        for vendor in vendors:
            # Check patterns
            for pattern in vendor.patterns or []:
                if re.search(pattern, description, re.IGNORECASE):
                    return vendor, 1.0  # Perfect match
            
            # Fuzzy matching
            score = fuzz.partial_ratio(vendor.name.lower(), description.lower()) / 100.0
            if score > best_score:
                best_score = score
                best_match = vendor
        
        return best_match, best_score
    
    def learn_vendor(self, transaction_id: str, vendor_name: str, category_id: str):
        """Learn new vendor from user input"""
        transaction = self.db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.user_id == self.user_id
        ).first()
        
        if not transaction:
            raise ValueError("Transaction not found")
        
        # Check if vendor exists
        vendor = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id,
            Vendor.name == vendor_name
        ).first()
        
        if not vendor:
            # Create new vendor
            vendor = Vendor(
                user_id=self.user_id,
                name=vendor_name,
                patterns=[f"(?i){re.escape(vendor_name)}"],
                default_category_id=category_id
            )
            self.db.add(vendor)
        
        # Update transaction
        transaction.vendor_id = vendor.id
        transaction.category_id = category_id
        transaction.needs_review = False
        transaction.confidence_score = 1.0
        
        self.db.commit()
        
        # Re-categorize similar transactions
        self._recategorize_similar_transactions(transaction.description, vendor.id, category_id)
    
    def _recategorize_similar_transactions(self, description: str, vendor_id: str, category_id: str):
        """Find and categorize similar uncategorized transactions"""
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.needs_review == True
        ).all()
        
        for transaction in transactions:
            similarity = fuzz.partial_ratio(description.lower(), transaction.description.lower()) / 100.0
            if similarity >= 0.9:  # Very similar
                transaction.vendor_id = vendor_id
                transaction.category_id = category_id
                transaction.confidence_score = similarity
                transaction.needs_review = False
        
        self.db.commit()