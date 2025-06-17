# backend/app/services/vendor_intelligence.py - Intelligent vendor grouping and pattern matching

from typing import List, Dict, Tuple, Optional, Set
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process
from app.db.models import Transaction, Vendor, Category
import re
import logging
from itertools import combinations
from collections import defaultdict

logger = logging.getLogger(__name__)

class VendorIntelligenceService:
    """
    Advanced vendor grouping and pattern matching using n-gram windowing,
    hierarchical grouping, and confidence scoring.
    """
    
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
        
        # Common business type patterns
        self.business_types = {
            'retail': ['shop', 'store', 'market', 'mart', 'retail'],
            'food': ['restaurant', 'cafe', 'bistro', 'pizza', 'burger', 'kebab', 'sushi'],
            'transport': ['bus', 'train', 'taxi', 'uber', 'lyft', 'transport', 'metro'],
            'fuel': ['shell', 'bp', 'esso', 'texaco', 'mobil', 'tankstelle', 'gas'],
            'bank': ['bank', 'atm', 'sparkasse', 'credit', 'debit'],
            'pharmacy': ['pharmacy', 'apotheke', 'medical', 'drogerie'],
            'telecom': ['telekom', 'vodafone', 'orange', 'swisscom'],
        }
        
        # Common location/address words to ignore in core vendor extraction
        self.location_noise = {
            'street', 'str', 'strasse', 'avenue', 'ave', 'road', 'rd', 'platz', 'gasse',
            'hauptbahnhof', 'bahnhof', 'station', 'airport', 'flughafen', 'zentrum', 'center',
            'north', 'south', 'east', 'west', 'nord', 'süd', 'ost', 'west',
            'city', 'stadt', 'downtown', 'uptown', 'mall', 'shopping', 'center'
        }
    
    def generate_vendor_ngrams(self, vendor_text: str, min_length: int = 2, max_length: int = 4) -> List[Dict]:
        """
        Generate n-gram windows of different sizes with confidence scores.
        
        For "kkiosk zürich hauptbahnhof":
        - Single words: ["kkiosk", "zürich", "hauptbahnhof"]
        - 2-grams: ["kkiosk zürich", "zürich hauptbahnhof"]
        - 3-grams: ["kkiosk zürich hauptbahnhof"]
        
        Returns list of dicts with 'pattern', 'confidence', 'type'
        """
        if not vendor_text:
            return []
        
        # Clean and tokenize
        cleaned = re.sub(r'[^\w\s]', ' ', vendor_text.lower())
        words = [w for w in cleaned.split() if len(w) >= 2]
        
        if not words:
            return []
        
        ngrams = []
        
        # Generate n-grams of different lengths
        for n in range(min_length, min(len(words) + 1, max_length + 1)):
            for i in range(len(words) - n + 1):
                gram = words[i:i+n]
                pattern = ' '.join(gram)
                
                # Calculate confidence based on position, length, and content
                confidence = self._calculate_ngram_confidence(gram, i, len(words), vendor_text)
                
                # Determine pattern type
                pattern_type = self._classify_pattern_type(gram)
                
                ngrams.append({
                    'pattern': pattern,
                    'confidence': confidence,
                    'type': pattern_type,
                    'length': n,
                    'position': i,
                    'words': gram
                })
        
        # Sort by confidence (highest first)
        ngrams.sort(key=lambda x: x['confidence'], reverse=True)
        return ngrams
    
    def _calculate_ngram_confidence(self, words: List[str], position: int, total_words: int, original_text: str) -> float:
        """Calculate confidence score for an n-gram pattern"""
        base_confidence = 0.5
        
        # Boost confidence for patterns starting at beginning (brand names usually come first)
        if position == 0:
            base_confidence += 0.3
        
        # Boost confidence for longer patterns (more specific)
        length_boost = min(len(words) * 0.1, 0.3)
        base_confidence += length_boost
        
        # Boost confidence for patterns that aren't location words
        non_location_boost = 0
        for word in words:
            if word.lower() not in self.location_noise:
                non_location_boost += 0.1
        base_confidence += min(non_location_boost, 0.2)
        
        # Boost confidence for business-related words
        business_boost = 0
        for word in words:
            if any(word.lower() in business_words for business_words in self.business_types.values()):
                business_boost += 0.1
        base_confidence += min(business_boost, 0.2)
        
        # Penalize very short single words unless they're at the start
        if len(words) == 1 and len(words[0]) < 4 and position > 0:
            base_confidence -= 0.2
        
        # Penalize pure location patterns
        if all(word.lower() in self.location_noise for word in words):
            base_confidence -= 0.4
        
        return max(0.0, min(1.0, base_confidence))
    
    def _classify_pattern_type(self, words: List[str]) -> str:
        """Classify the type of pattern (brand, location, business_type, etc.)"""
        word_str = ' '.join(words).lower()
        
        # Check for business types
        for biz_type, keywords in self.business_types.items():
            if any(keyword in word_str for keyword in keywords):
                return f'business_{biz_type}'
        
        # Check for location words
        if any(word.lower() in self.location_noise for word in words):
            return 'location'
        
        # Check position and characteristics
        if len(words) == 1 and len(words[0]) >= 4:
            return 'brand_candidate'
        
        if len(words) > 1:
            return 'composite_brand'
        
        return 'generic'
    
    def find_vendor_hierarchies(self) -> Dict[str, List[Dict]]:
        """
        Analyze existing vendors to find potential hierarchical relationships.
        Returns dict mapping parent vendor names to their children.
        """
        vendors = self.db.query(Vendor).filter(Vendor.user_id == self.user_id).all()
        
        hierarchies = defaultdict(list)
        
        # Group vendors by potential parent brands
        for vendor in vendors:
            parent_candidates = self._extract_parent_brand_candidates(vendor)
            
            for parent_candidate in parent_candidates:
                # Find other vendors that could be children of this parent
                children = self._find_potential_children(parent_candidate, vendors, exclude=vendor.id)
                
                if children:
                    hierarchies[parent_candidate].extend([{
                        'parent_candidate': parent_candidate,
                        'child_vendor': vendor,
                        'confidence': self._calculate_hierarchy_confidence(parent_candidate, vendor.name),
                        'other_children': children
                    }])
        
        return dict(hierarchies)
    
    def _extract_parent_brand_candidates(self, vendor: Vendor) -> List[str]:
        """Extract potential parent brand names from a vendor"""
        candidates = set()
        
        # Analyze vendor name
        name_ngrams = self.generate_vendor_ngrams(vendor.name, min_length=1, max_length=2)
        for ngram in name_ngrams:
            if ngram['type'] in ['brand_candidate', 'composite_brand'] and ngram['confidence'] > 0.7:
                candidates.add(ngram['pattern'])
        
        # Analyze patterns if available
        if vendor.patterns:
            for pattern in vendor.patterns:
                # Reverse the normalization to get readable text
                readable_pattern = self._denormalize_pattern(pattern)
                pattern_ngrams = self.generate_vendor_ngrams(readable_pattern, min_length=1, max_length=2)
                for ngram in pattern_ngrams:
                    if ngram['type'] in ['brand_candidate', 'composite_brand'] and ngram['confidence'] > 0.7:
                        candidates.add(ngram['pattern'])
        
        return list(candidates)
    
    def _denormalize_pattern(self, normalized_pattern: str) -> str:
        """Convert normalized pattern back to readable text for analysis"""
        # This is a best-effort conversion since normalization loses information
        # Insert spaces before capital letters (for patterns like "LIDLZUERICH")
        spaced = re.sub(r'([A-Z])([A-Z][a-z])', r'\1 \2', normalized_pattern)
        spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', spaced)
        return spaced.lower()
    
    def _find_potential_children(self, parent_candidate: str, vendors: List[Vendor], exclude: str) -> List[Dict]:
        """Find vendors that could be children of a parent brand"""
        children = []
        parent_words = set(parent_candidate.lower().split())
        
        for vendor in vendors:
            if str(vendor.id) == exclude:
                continue
            
            vendor_words = set(vendor.name.lower().split())
            
            # Check if parent brand words are contained in vendor name
            if parent_words.issubset(vendor_words):
                similarity = fuzz.ratio(parent_candidate.lower(), vendor.name.lower()) / 100.0
                if similarity > 0.4:  # Reasonable similarity threshold
                    children.append({
                        'vendor': vendor,
                        'similarity': similarity,
                        'shared_words': parent_words.intersection(vendor_words)
                    })
        
        return children
    
    def _calculate_hierarchy_confidence(self, parent_candidate: str, child_name: str) -> float:
        """Calculate confidence that a vendor should be child of parent brand"""
        parent_words = set(parent_candidate.lower().split())
        child_words = set(child_name.lower().split())
        
        # Base confidence from word overlap
        if not parent_words:
            return 0.0
        
        overlap_ratio = len(parent_words.intersection(child_words)) / len(parent_words)
        base_confidence = overlap_ratio * 0.6
        
        # Boost for string similarity
        similarity = fuzz.ratio(parent_candidate.lower(), child_name.lower()) / 100.0
        base_confidence += similarity * 0.3
        
        # Boost if parent is shorter (likely the core brand)
        if len(parent_candidate) < len(child_name):
            base_confidence += 0.1
        
        return min(1.0, base_confidence)
    
    def suggest_intelligent_vendor_grouping(self, description: str, limit: int = 5) -> List[Dict]:
        """
        Provide intelligent vendor suggestions with hierarchical grouping.
        This is the main method to call for transaction review.
        """
        # Extract vendor from description
        from app.services.categorization import CategorizationService
        categorization_service = CategorizationService(self.db, self.user_id)
        vendor_text = categorization_service.extract_vendor_from_description(description)
        
        # Generate n-grams for this vendor
        ngrams = self.generate_vendor_ngrams(vendor_text)
        
        # Get all existing vendors
        vendors = self.db.query(Vendor).filter(Vendor.user_id == self.user_id).all()
        
        suggestions = []
        seen_vendors = set()
        
        # Try to match against existing patterns using n-grams
        for ngram in ngrams[:10]:  # Check top 10 n-grams
            pattern = ngram['pattern']
            
            for vendor in vendors:
                if str(vendor.id) in seen_vendors:
                    continue
                
                # Check against vendor name
                name_similarity = fuzz.ratio(pattern.lower(), vendor.name.lower()) / 100.0
                
                # Check against vendor patterns
                pattern_similarity = 0.0
                if vendor.patterns:
                    for vendor_pattern in vendor.patterns:
                        readable_pattern = self._denormalize_pattern(vendor_pattern)
                        pattern_sim = fuzz.ratio(pattern.lower(), readable_pattern.lower()) / 100.0
                        pattern_similarity = max(pattern_similarity, pattern_sim)
                
                best_similarity = max(name_similarity, pattern_similarity)
                
                if best_similarity > 0.4:  # Reasonable threshold
                    # Calculate combined confidence
                    combined_confidence = (ngram['confidence'] * 0.4 + best_similarity * 0.6)
                    
                    suggestions.append({
                        'vendor_id': str(vendor.id),
                        'vendor_name': vendor.name,
                        'category_id': str(vendor.default_category_id) if vendor.default_category_id else None,
                        'similarity': best_similarity,
                        'ngram_confidence': ngram['confidence'],
                        'combined_confidence': combined_confidence,
                        'matching_ngram': pattern,
                        'ngram_type': ngram['type'],
                        'match_type': 'name' if name_similarity > pattern_similarity else 'pattern',
                        'extracted_vendor': vendor_text,
                        'is_hierarchical_match': self._is_hierarchical_match(pattern, vendor.name)
                    })
                    
                    seen_vendors.add(str(vendor.id))
        
        # Sort by combined confidence
        suggestions.sort(key=lambda x: x['combined_confidence'], reverse=True)
        
        # Add grouping information for top suggestions
        final_suggestions = []
        for suggestion in suggestions[:limit]:
            # Find potential siblings (other vendors with same parent brand)
            siblings = self._find_vendor_siblings(suggestion['vendor_id'])
            suggestion['potential_siblings'] = siblings
            suggestion['is_part_of_group'] = len(siblings) > 0
            
            final_suggestions.append(suggestion)
        
        return final_suggestions
    
    def _is_hierarchical_match(self, pattern: str, vendor_name: str) -> bool:
        """Check if this is a hierarchical match (parent-child relationship)"""
        pattern_words = set(pattern.lower().split())
        vendor_words = set(vendor_name.lower().split())
        
        # If pattern words are subset of vendor words, it's hierarchical
        return pattern_words.issubset(vendor_words) and len(pattern_words) < len(vendor_words)
    
    def _find_vendor_siblings(self, vendor_id: str) -> List[Dict]:
        """Find other vendors that might be siblings (same parent brand)"""
        vendor = self.db.query(Vendor).filter(
            Vendor.id == vendor_id,
            Vendor.user_id == self.user_id
        ).first()
        
        if not vendor:
            return []
        
        # Extract potential parent brands
        parent_candidates = self._extract_parent_brand_candidates(vendor)
        
        siblings = []
        all_vendors = self.db.query(Vendor).filter(
            Vendor.user_id == self.user_id,
            Vendor.id != vendor_id
        ).all()
        
        for parent_candidate in parent_candidates:
            potential_siblings = self._find_potential_children(parent_candidate, all_vendors, str(vendor_id))
            
            for sibling_info in potential_siblings:
                siblings.append({
                    'vendor_id': str(sibling_info['vendor'].id),
                    'vendor_name': sibling_info['vendor'].name,
                    'shared_parent': parent_candidate,
                    'similarity': sibling_info['similarity']
                })
        
        return siblings
    
    def create_vendor_hierarchy_suggestion(self, description: str) -> Dict:
        """
        Create a comprehensive vendor hierarchy suggestion for a new transaction.
        This provides the UI with all the information needed for intelligent grouping.
        """
        suggestions = self.suggest_intelligent_vendor_grouping(description)
        
        # Analyze potential new vendor creation
        from app.services.categorization import CategorizationService
        categorization_service = CategorizationService(self.db, self.user_id)
        vendor_text = categorization_service.extract_vendor_from_description(description)
        ngrams = self.generate_vendor_ngrams(vendor_text)
        
        # Suggest new vendor name if no good matches
        suggested_name = self._suggest_new_vendor_name(vendor_text, ngrams)
        
        return {
            'extracted_vendor_text': vendor_text,
            'suggested_new_vendor_name': suggested_name,
            'top_ngrams': ngrams[:5],
            'existing_vendor_matches': suggestions,
            'should_create_new': len(suggestions) == 0 or (suggestions and suggestions[0]['combined_confidence'] < 0.6),
            'hierarchy_analysis': self._analyze_hierarchy_opportunity(vendor_text, suggestions)
        }
    
    def _suggest_new_vendor_name(self, vendor_text: str, ngrams: List[Dict]) -> str:
        """Suggest a clean name for a new vendor based on n-gram analysis"""
        if not ngrams:
            return vendor_text.title()
        
        # Find the highest confidence brand-related n-gram
        for ngram in ngrams:
            if ngram['type'] in ['brand_candidate', 'composite_brand'] and ngram['confidence'] > 0.6:
                return ngram['pattern'].title()
        
        # Fall back to the first n-gram or original text
        if ngrams:
            return ngrams[0]['pattern'].title()
        
        return vendor_text.title()
    
    def _analyze_hierarchy_opportunity(self, vendor_text: str, existing_matches: List[Dict]) -> Dict:
        """Analyze if this vendor could fit into an existing hierarchy"""
        analysis = {
            'can_join_existing_group': False,
            'suggested_parent': None,
            'potential_children': [],
            'hierarchy_confidence': 0.0
        }
        
        if not existing_matches:
            return analysis
        
        # Check if top match could be a parent or sibling
        top_match = existing_matches[0]
        
        if top_match.get('is_hierarchical_match', False):
            analysis['can_join_existing_group'] = True
            analysis['suggested_parent'] = top_match['vendor_name']
            analysis['hierarchy_confidence'] = top_match['combined_confidence']
        
        # Check for potential siblings
        if top_match.get('potential_siblings'):
            analysis['potential_children'] = [
                sibling['vendor_name'] for sibling in top_match['potential_siblings']
            ]
        
        return analysis
