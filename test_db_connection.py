import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = f"postgresql://{os.getenv('BUDGETLENS_DB_USER')}:{os.getenv('BUDGETLENS_DB_PASSWORD')}@localhost:5432/budgetlens_db"
try:
    engine = create_engine(DATABASE_URL)
    
    # Test connection
    with engine.connect() as connection:
        result = connection.execute(text("SELECT version();"))
        version = result.fetchone()[0]
        print(f"✅ Database connection successful!")
        print(f"PostgreSQL version: {version}")
        
        # Test if we can create a simple table
        connection.execute(text("CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, name VARCHAR(50));"))
        connection.execute(text("DROP TABLE test_table;"))
        print("✅ Database operations working!")
        
except Exception as e:
    print(f"❌ Database connection failed: {e}")
    print("\nTroubleshooting tips:")
    print("1. Check if PostgreSQL is running")
    print("2. Verify your credentials")
    print("3. Ensure the database exists")
    print("4. Check if the user has proper permissions")