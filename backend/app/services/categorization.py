# backend/app/services/categorization.py - Updated with hierarchical categories support

from typing import List, Optional, Tuple, Dict
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process
from app.db.models import Transaction, Vendor, Category, CategoryType
from app.services.category import CategoryService
import re
import logging

logger = logging.getLogger(__name__)

class CategorizationService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
        self.category_service = CategoryService(db, user_id)
    
    def extract_vendor_from_description(self, description: str) -> str:
        """
        Extract the actual vendor/merchant from transaction description
        
        Examples:
        - "Purchase ZKB Visa Debit card no. xxxx 7693, Lidl Zuerich 0800 Zuerich" → "Lidl Zuerich 0800 Zuerich"
        - "Ihre Zahlung" → "Ihre Zahlung" (no comma, use whole thing)
        - "TWINT Payment, Migros Bahnhofstrasse" → "Migros Bahnhofstrasse"
        """
        # Split on comma - everything after comma is usually the vendor
        if ',' in description:
            parts = description.split(',', 1)  # Split only on first comma
            vendor_part = parts[1].strip()
            
            # If the part after comma is meaningful, use it
            if len(vendor_part) > 3:
                return vendor_part
        
        # No comma or part after comma is too short, use whole description
        return description.strip()
    
    def normalize_vendor(self, vendor_text: str) -> str:
        """
        Normalize vendor text for pattern matching
        
        Examples:
        - "Lidl Zuerich 0800 Zuerich" → "LIDLZUERICH"
        - "Migros Bahnhofstrasse 123" → "MIGROSBAHNHOFSTRASSE"
        - "COOP-2238 WINT. ST" → "COOPWINTST"
        """
        if not vendor_text:
            return ""
        
        # Convert to uppercase
        normalized = vendor_text.upper()
        
        # Remove numbers (store numbers, addresses, etc.)
        normalized = re.sub(r'\d+', '', normalized)
        
        # Remove special characters and punctuation
        normalized = re.sub(r'[^A-Z\s]', '', normalized)
        
        # Remove common location/address words that add noise
        location_words = ['STR', 'STRASSE', 'STREET', 'ST', 'AVENUE', 'AVE', 'PLATZ', 'GASSE']
        for word in location_words:
            normalized = re.sub(rf'\b{word}\b', '', normalized)
        
        # Remove extra whitespace and collapse
        normalized = re.sub(r'\s+', '', normalized)
        
        # Remove very short trailing parts (like single letters)
        if len(normalized) > 4:
            # Keep only the first meaningful parts (usually store name)
            words = re.findall(r'[A-Z]{2,}', vendor_text.upper())
            if words:
                # Take first 2-3 words, prioritize longer ones
                main_words = []
                for word in words[:3]:
                    if len(word) >= 3:  # Only keep words with 3+ letters
                        main_words.append(word)
                    if len(''.join(main_words)) >= 8:  # Don't make pattern too long
                        break
                
                if main_words:
                    normalized = ''.join(main_words)
        
        return normalized
    
    def is_manual_review_pattern(self, description: str) -> bool:
        """Check if transaction should go to manual review based on description patterns"""
        description_lower = description.lower()
        
        manual_review_patterns = [
            'twint', 'atm', 'cash withdrawal', 'geldautomat', 'bancomat',
            'transfer', 'überweisung', 'virement', 'payment order',
            'standing order', 'dauerauftrag', 'ordre permanent'
        ]
        
        return any(pattern in description_lower for pattern in manual_review_patterns)
    
    def categorize_new_transactions(self, confidence_threshold: float = 0.8):
        """Categorize all uncategorized transactions using learned vendor patterns"""
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_id.is_(None)
        ).all()
        
        categorized_count = 0
        manual_review_count = 0
        
        for transaction in transactions:
            # Check if this should go to manual review first
            if self.is_manual_review_pattern(transaction.description):
                manual_review_category = self._get_manual_review_category(transaction.description)
                if manual_review_category:
                    transaction.category_id = manual_review_category.id
                    transaction.needs_review = True
                    transaction.confidence_score = 0.5  # Medium confidence for manual review
                    manual_review_count += 1
                    continue
            
            # Try to match with existing vendor patterns
            vendor, confidence = self._match_vendor_pattern(transaction.description)
            
            if vendor and confidence >= confidence_threshold:
                # Only auto-categorize if the vendor allows it and category allows it
                if vendor.allow_auto_learning and vendor.default_category and vendor.default_category.allow_auto_learning:
                    transaction.vendor_id = vendor.id
                    transaction.category_id = vendor.default_category_id
                    transaction.confidence_score = confidence
                    transaction.needs_review = False
                    categorized_count += 1
                    
                    vendor_part = self.extract_vendor_from_description(transaction.description)
                    logger.info(f"Auto-categorized: '{vendor_part}' → {vendor.name} ({confidence:.2f})")
                else:
                    # Vendor exists but learning disabled - mark for review
                    transaction.vendor_id = vendor.id
                    transaction.confidence_score = confidence
                    transaction.needs_review = True
            else:
                transaction.confidence_score = confidence if vendor else 0.0
                transaction.needs_review = True
        
        if categorized_count > 0 or manual_review_count > 0:
            self.db.commit()
            logger.info(f"Auto-categorized {categorized_count} transactions, {manual_review_count} sent to manual review")
    
    def _get_manual_review_category(self, description: str) -> Optional[Category]:
        """Get appropriate manual review category based on description"""
        description_lower = description.lower()
        
        # Map patterns to specific manual review categories
        category_mapping = {
            'twint': 'TWINT Payments',
            'atm': 'ATM Withdrawals',
            'geldautomat': 'ATM Withdrawals',
            'bancomat': 'ATM Withdrawals',
            'transfer': 'Bank Transfers',
            'überweisung': 'Bank Transfers',
            'virement': 'Bank Transfers'
        }
        
        for pattern, category_name in category_mapping.items():
            if pattern in description_lower:
                category = self.db.query(Category).filter(
                    Category.user_id == self.user_id,
                    Category.category_type == CategoryType.MANUAL_REVIEW,
                    Category.name == category_name
                ).first()
                if category:
                    return category
        
        # Default to generic manual review category
        return self.db.query(Category).filter(
            Category.user_id == self.user_id,
            Category.category_type == CategoryType.MANUAL_REVIEW,
            Category.name == 'Unknown Vendors'
        ).first()
    
    def categorize_transaction_and_learn(self, transaction_id: str, category_id: str, vendor_name: Optional[str] = None) -> Dict:
        """
        Categorize a transaction and learn vendor patterns for future auto-categorization
        """
        transaction = self.db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.user_id == self.user_id
        ).first()
        
        if not transaction:
            raise ValueError("Transaction not found")
        
        # Get the category to check if learning is allowed
        category = self.db.query(Category).filter(
            Category.id == category_id,
            Category.user_id == self.user_id
        ).first()
        
        if not category:
            raise ValueError("Category not found")
        
        # Extract and normalize the vendor part
        vendor_text = self.extract_vendor_from_description(transaction.description)
        normalized_vendor = self.normalize_vendor(vendor_text)
        
        logger.info(f"Learning vendor pattern:")
        logger.info(f"  Full description: '{transaction.description}'")
        logger.info(f"  Extracted vendor: '{vendor_text}'")
        logger.info(f"  Normalized pattern: '{normalized_vendor}'")
        logger.info(f"  Category allows learning: {category.allow_auto_learning}")
        
        vendor = None
        similar_transactions_categorized = 0
        
        # Only create/update vendor if category allows auto-learning
        if category.allow_auto_learning and category.category_type != CategoryType.MANUAL_REVIEW:
            # Create or update vendor with this pattern
            vendor = self._create_or_update_vendor_pattern(
                vendor_name or self._generate_vendor_name(vendor_text),
                normalized_vendor,
                category_id
            )
            
            # Find and categorize similar transactions (only if learning allowed)
            similar_transactions = self._find_similar_vendor_transactions(normalized_vendor, transaction.id)
            
            for similar_tx in similar_transactions:
                if similar_tx.category_id is None:  # Only categorize uncategorized transactions
                    similar_vendor_text = self.extract_vendor_from_description(similar_tx.description)
                    similar_tx.vendor_id = vendor.id
                    similar_tx.category_id = category_id
                    similar_tx.confidence_score = 0.95  # High confidence for pattern match
                    similar_tx.needs_review = False
                    similar_transactions_categorized += 1
                    logger.info(f"Auto-categorized similar: '{similar_vendor_text}'")
        
        # Update the original transaction
        if vendor:
            transaction.vendor_id = vendor.id
        transaction.category_id = category_id
        transaction.needs_review = False
        transaction.confidence_score = 1.0
        
        self.db.commit()
        
        return {
            "categorized_transaction": transaction_id,
            "vendor_created": vendor.name if vendor else "No vendor (learning disabled)",
            "similar_transactions_categorized": similar_transactions_categorized,
            "pattern_learned": normalized_vendor if category.allow_auto_learning else "No pattern (learning disabled)",
            "vendor_text_extracted": vendor_text,
            "learning_enabled": category.allow_auto_learning
        }
    
    def _generate_vendor_name(self, vendor_text: str) -> str:
        """Generate a clean vendor name from extracted vendor text"""
        # Take the first few words, clean them up
        words = re.findall(r'[A-Za-z]+', vendor_text)
        
        if not words:
            return "Unknown Vendor"
        
        # Take first 1-2 meaningful words
        name_parts = []
        for word in words[:2]:
            if len(word) >= 3:  # Skip very short words
                name_parts.append(word.title())
        
        if not name_parts:
            name_parts = [words[0].title()]
        
        return ' '.join(name_parts)
    
    def _create_or_update_vendor_pattern(self, vendor_name: str, normalized_pattern: str, category_id: str) -> Vendor:
        """Create vendor or update existing one with new pattern"""
        if not normalized_pattern or len(normalized_pattern) < 2:
            # Fallback for very short patterns
            normalized_pattern = vendor_name.upper().replace(' ', '')[:10]
        
        # Look for existing vendor with this exact pattern
        vendors = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id,
            Vendor.allow_auto_learning == True  # Only consider learning-enabled vendors
        ).all()
        
        for vendor in vendors:
            if vendor.patterns and normalized_pattern in vendor.patterns:
                # Update existing vendor's category
                vendor.default_category_id = category_id
                logger.info(f"Updated existing vendor: {vendor.name}")
                return vendor
        
        # Look for vendor by name
        existing_vendor = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id,
            Vendor.name == vendor_name,
            Vendor.allow_auto_learning == True
        ).first()
        
        if existing_vendor:
            # Add pattern to existing vendor
            if existing_vendor.patterns:
                if normalized_pattern not in existing_vendor.patterns:
                    existing_vendor.patterns.append(normalized_pattern)
            else:
                existing_vendor.patterns = [normalized_pattern]
            existing_vendor.default_category_id = category_id
            logger.info(f"Added pattern '{normalized_pattern}' to vendor: {vendor_name}")
            return existing_vendor
        
        # Create new vendor (with learning enabled by default)
        new_vendor = Vendor(
            user_id=self.user_id,
            name=vendor_name,
            patterns=[normalized_pattern],
            default_category_id=category_id,
            confidence_threshold=0.85,
            allow_auto_learning=True
        )
        self.db.add(new_vendor)
        logger.info(f"Created new vendor: {vendor_name} with pattern: {normalized_pattern}")
        return new_vendor
    
    def _find_similar_vendor_transactions(self, normalized_pattern: str, exclude_transaction_id: str) -> List[Transaction]:
        """Find transactions with similar vendor patterns"""
        transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.id != exclude_transaction_id
        ).all()
        
        similar_transactions = []
        
        for transaction in transactions:
            vendor_text = self.extract_vendor_from_description(transaction.description)
            tx_normalized = self.normalize_vendor(vendor_text)
            
            # Exact match on normalized vendor pattern
            if tx_normalized == normalized_pattern:
                similar_transactions.append(transaction)
                continue
            
            # Fuzzy match for very similar vendor patterns
            if len(tx_normalized) > 2 and len(normalized_pattern) > 2:
                similarity = fuzz.ratio(tx_normalized, normalized_pattern) / 100.0
                if similarity >= 0.9:  # Very high similarity for vendor names
                    similar_transactions.append(transaction)
        
        return similar_transactions
    
    def _match_vendor_pattern(self, description: str) -> Tuple[Optional[Vendor], float]:
        """Match transaction description to known vendor using extracted vendor patterns"""
        vendor_text = self.extract_vendor_from_description(description)
        normalized_desc = self.normalize_vendor(vendor_text)
        
        vendors = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id,
            Vendor.allow_auto_learning == True  # Only match learning-enabled vendors
        ).all()
        
        best_match = None
        best_score = 0.0
        
        for vendor in vendors:
            if not vendor.patterns:
                continue
                
            # Check for exact pattern matches first
            for pattern in vendor.patterns:
                if pattern == normalized_desc:
                    return vendor, 1.0  # Perfect match
                
                # Check fuzzy match on vendor patterns
                if len(pattern) > 2 and len(normalized_desc) > 2:
                    similarity = fuzz.ratio(pattern, normalized_desc) / 100.0
                    if similarity > best_score and similarity >= vendor.confidence_threshold:
                        best_score = similarity
                        best_match = vendor
        
        return best_match, best_score
    
    def get_vendor_suggestions(self, description: str, limit: int = 5) -> List[Dict]:
        """Get vendor suggestions for a transaction description using intelligent grouping"""
        # Try intelligent vendor grouping first
        try:
            from app.services.vendor_intelligence import VendorIntelligenceService
            intelligence_service = VendorIntelligenceService(self.db, self.user_id)
            
            intelligent_suggestions = intelligence_service.suggest_intelligent_vendor_grouping(description, limit)
            
            if intelligent_suggestions:
                # Convert to expected format and add legacy fields
                converted_suggestions = []
                for suggestion in intelligent_suggestions:
                    converted_suggestions.append({
                        "vendor_id": suggestion["vendor_id"],
                        "vendor_name": suggestion["vendor_name"],
                        "category_id": suggestion["category_id"],
                        "similarity": suggestion["similarity"],
                        "normalized_pattern": suggestion.get("matching_ngram", ""),
                        "matching_pattern": suggestion.get("matching_ngram", ""),
                        "extracted_vendor": suggestion["extracted_vendor"],
                        "allows_learning": True,  # Assume true for intelligent matches
                        # Additional intelligent fields
                        "combined_confidence": suggestion["combined_confidence"],
                        "ngram_confidence": suggestion["ngram_confidence"],
                        "match_type": suggestion["match_type"],
                        "ngram_type": suggestion["ngram_type"],
                        "is_hierarchical_match": suggestion["is_hierarchical_match"],
                        "potential_siblings": suggestion.get("potential_siblings", []),
                        "is_part_of_group": suggestion.get("is_part_of_group", False)
                    })
                
                return converted_suggestions
        
        except Exception as e:
            logger.warning(f"Intelligent vendor grouping failed, falling back to legacy: {e}")
        
        # Fallback to legacy method
        vendor_text = self.extract_vendor_from_description(description)
        normalized = self.normalize_vendor(vendor_text)
        
        vendors = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id
        ).all()
        
        suggestions = []
        
        for vendor in vendors:
            if not vendor.patterns:
                continue
                
            best_similarity = 0.0
            matching_pattern = ""
            
            for pattern in vendor.patterns:
                similarity = fuzz.ratio(pattern, normalized) / 100.0
                if similarity > best_similarity:
                    best_similarity = similarity
                    matching_pattern = pattern
            
            if best_similarity > 0.4:  # Lower threshold for suggestions
                suggestions.append({
                    "vendor_id": str(vendor.id),
                    "vendor_name": vendor.name,
                    "category_id": str(vendor.default_category_id) if vendor.default_category_id else None,
                    "similarity": best_similarity,
                    "normalized_pattern": normalized,
                    "matching_pattern": matching_pattern,
                    "extracted_vendor": vendor_text,
                    "allows_learning": vendor.allow_auto_learning,
                    # Default values for intelligent fields
                    "combined_confidence": best_similarity,
                    "ngram_confidence": 0.5,
                    "match_type": "pattern",
                    "ngram_type": "legacy",
                    "is_hierarchical_match": False,
                    "potential_siblings": [],
                    "is_part_of_group": False
                })
        
        # Sort by similarity and return top matches
        suggestions.sort(key=lambda x: x["similarity"], reverse=True)
        return suggestions[:limit]
    
    def get_debug_info(self, description: str) -> Dict:
        """Get debug information about how a description would be processed"""
        vendor_text = self.extract_vendor_from_description(description)
        normalized = self.normalize_vendor(vendor_text)
        is_manual_review = self.is_manual_review_pattern(description)
        
        return {
            "original_description": description,
            "extracted_vendor": vendor_text,
            "normalized_pattern": normalized,
            "is_manual_review_pattern": is_manual_review,
            "suggested_category_type": CategoryType.MANUAL_REVIEW.value if is_manual_review else CategoryType.EXPENSE.value,
            "suggestions": self.get_vendor_suggestions(description, 3)
        }
    
    # Legacy method for compatibility
    def learn_vendor(self, transaction_id: str, vendor_name: str, category_id: str):
        """Legacy method - redirect to new learning system"""
        return self.categorize_transaction_and_learn(transaction_id, category_id, vendor_name)