#!/usr/bin/env python3
import sys
import os
import psycopg2
from datetime import datetime

# Database connection parameters
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'budgetlens',
    'user': 'budgetlens_user',
    'password': 'your_secure_password_here'
}

def main():
    try:
        # Connect to database
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Query for all categories
        cursor.execute("""
            SELECT id, name, category_type, user_id, created_at 
            FROM categories 
            WHERE name ILIKE '%bank%' OR name ILIKE '%transfer%'
            ORDER BY name, category_type
        """)
        
        results = cursor.fetchall()
        
        if results:
            print("Found categories containing 'bank' or 'transfer':")
            print("-" * 80)
            for row in results:
                category_id, name, category_type, user_id, created_at = row
                print(f"ID: {category_id}")
                print(f"Name: '{name}'")
                print(f"Type: {category_type}")
                print(f"User ID: {user_id}")
                print(f"Created: {created_at}")
                print("-" * 40)
        else:
            print("No categories found containing 'bank' or 'transfer'")
        
        # Also check for exact 'Bank Transfers' name
        cursor.execute("""
            SELECT id, name, category_type, user_id, created_at 
            FROM categories 
            WHERE name = 'Bank Transfers'
            ORDER BY category_type
        """)
        
        exact_results = cursor.fetchall()
        
        if exact_results:
            print("\nFound exact 'Bank Transfers' categories:")
            print("-" * 80)
            for row in exact_results:
                category_id, name, category_type, user_id, created_at = row
                print(f"ID: {category_id}")
                print(f"Name: '{name}'")
                print(f"Type: {category_type}")
                print(f"User ID: {user_id}")
                print(f"Created: {created_at}")
                print("-" * 40)
        else:
            print("\nNo exact 'Bank Transfers' categories found")
            
        # Count all categories by type
        cursor.execute("""
            SELECT category_type, COUNT(*) 
            FROM categories 
            GROUP BY category_type 
            ORDER BY category_type
        """)
        
        counts = cursor.fetchall()
        print("\nCategory counts by type:")
        print("-" * 30)
        for category_type, count in counts:
            print(f"{category_type}: {count}")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"Database error: {e}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
