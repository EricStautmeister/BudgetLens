#!/usr/bin/env python3
# Test script for vendor intelligence service

import sys
import os
sys.path.append('/app')

# Mock dependencies
class MockDB:
    def query(self, model):
        return MockQuery()
    
class MockQuery:
    def filter(self, *args):
        return self
    
    def all(self):
        return []
    
    def first(self):
        return None

# Test the basic functionality
from app.services.vendor_intelligence import VendorIntelligenceService

print("Testing VendorIntelligenceService...")

# Initialize with mock database
db = MockDB()
user_id = "test-user-123"
service = VendorIntelligenceService(db, user_id)

# Test n-gram generation
test_descriptions = [
    "KKIOSK Deutweg Zurich",
    "kkiosk zürich hauptbahnhof",
    "Migros Bahnhofstrasse 123 Zurich",
    "Coop City Center"
]

for desc in test_descriptions:
    print(f"\nTesting: {desc}")
    ngrams = service.generate_vendor_ngrams(desc)
    print(f"Generated {len(ngrams)} n-grams:")
    for i, ngram in enumerate(ngrams[:5]):  # Show top 5
        print(f"  {i+1}. '{ngram['pattern']}' (confidence: {ngram['confidence']:.2f}, type: {ngram['type']})")

print("\nTest completed successfully!")
