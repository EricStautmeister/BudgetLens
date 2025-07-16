#!/usr/bin/env python3
import requests
import json

# Test category creation API
API_BASE = "http://localhost:8000/api/v1"

def test_category_creation():
    # First try to get an auth token (this might fail if we need to login)
    try:
        # Try to get categories first (this should tell us if auth is needed)
        response = requests.get(f"{API_BASE}/categories")
        print(f"GET /categories status: {response.status_code}")
        if response.status_code == 401:
            print("Authentication required - cannot test without login")
            return
        elif response.status_code != 200:
            print(f"Error getting categories: {response.text}")
            return
            
        print("Categories endpoint accessible")
        
        # Try to create a simple category
        test_category = {
            "name": "Test Category",
            "category_type": "EXPENSE",
            "is_automatic_deduction": False,
            "is_savings": False,
            "allow_auto_learning": True
        }
        
        print(f"Attempting to create category: {json.dumps(test_category, indent=2)}")
        
        response = requests.post(
            f"{API_BASE}/categories",
            json=test_category,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"POST /categories status: {response.status_code}")
        print(f"Response: {response.text}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_category_creation()
