#!/usr/bin/env python3
"""
Validation script for the database credential change system.

This script validates that the credential change script will work correctly
by checking prerequisites and testing key functions.
"""

import os
import sys
import subprocess
from pathlib import Path


def check_prerequisites():
    """Check if all prerequisites are met."""
    print("🔍 Checking prerequisites...")
    
    issues = []
    
    # Check Python version
    if sys.version_info < (3, 8):
        issues.append("Python 3.8+ required")
    else:
        print("  ✅ Python version OK")
    
    # Check if we're in the right directory
    project_root = Path.cwd()
    required_files = ["docker-compose.yml", "test_db_connection.py"]
    
    for file in required_files:
        if not (project_root / file).exists():
            issues.append(f"Missing required file: {file}")
        else:
            print(f"  ✅ Found {file}")
    
    # Check Docker
    try:
        subprocess.run(["docker", "--version"], check=True, capture_output=True)
        print("  ✅ Docker available")
    except (subprocess.CalledProcessError, FileNotFoundError):
        issues.append("Docker not available")
    
    # Check Docker Compose
    try:
        result = subprocess.run(["docker", "compose", "version"], check=True, capture_output=True)
        print("  ✅ Docker Compose available")
    except (subprocess.CalledProcessError, FileNotFoundError):
        issues.append("Docker Compose not available")
    
    # Check file permissions
    config_files = [".env", "backend/.env", "docker-compose.yml"]
    for config_file in config_files:
        file_path = project_root / config_file
        if file_path.exists():
            if not os.access(file_path, os.W_OK):
                issues.append(f"No write permission for {config_file}")
            else:
                print(f"  ✅ Write permission OK for {config_file}")
    
    return issues


def test_credential_generation():
    """Test the credential generation functions."""
    print("\n🧪 Testing credential generation...")
    
    try:
        # Import the credential changer class
        sys.path.insert(0, str(Path.cwd()))
        from change_db_credentials import DatabaseCredentialChanger
        
        changer = DatabaseCredentialChanger()
        
        # Test password generation
        password = changer.generate_secure_password()
        if len(password) >= 32:
            print("  ✅ Password generation OK")
        else:
            print("  ❌ Password too short")
            return False
        
        # Test username generation
        username = changer.generate_secure_username()
        if username.startswith("budgetlens_") and len(username) > 11:
            print("  ✅ Username generation OK")
        else:
            print("  ❌ Username format incorrect")
            return False
        
        return True
        
    except ImportError as e:
        print(f"  ❌ Failed to import credential changer: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error testing credential generation: {e}")
        return False


def test_backup_functionality():
    """Test backup directory creation."""
    print("\n📁 Testing backup functionality...")
    
    try:
        backup_dir = Path.cwd() / "credential_backups" / "test_backup"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Test creating a test backup
        test_file = backup_dir / "test.txt"
        test_file.write_text("test backup")
        
        if test_file.exists():
            print("  ✅ Backup directory creation OK")
            # Clean up
            test_file.unlink()
            backup_dir.rmdir()
            return True
        else:
            print("  ❌ Failed to create backup file")
            return False
            
    except Exception as e:
        print(f"  ❌ Error testing backup functionality: {e}")
        return False


def check_current_services():
    """Check status of current Docker services."""
    print("\n🐳 Checking Docker services...")
    
    try:
        result = subprocess.run(
            ["docker", "compose", "ps"],
            capture_output=True,
            text=True,
            cwd=Path.cwd()
        )
        
        if result.returncode == 0:
            if "budgetlens-db-1" in result.stdout or "db" in result.stdout:
                print("  ✅ Database service found")
            else:
                print("  ⚠️  Database service not running")
            
            if "budgetlens-redis-1" in result.stdout or "redis" in result.stdout:
                print("  ✅ Redis service found")
            else:
                print("  ⚠️  Redis service not running")
                
            return True
        else:
            print("  ⚠️  No Docker services running")
            return True  # This is OK, services might be stopped
            
    except Exception as e:
        print(f"  ❌ Error checking Docker services: {e}")
        return False


def main():
    """Run all validation checks."""
    print("🔐 BudgetLens Credential Change Validation")
    print("=" * 50)
    
    all_good = True
    
    # Check prerequisites
    issues = check_prerequisites()
    if issues:
        print("\n❌ Prerequisites check failed:")
        for issue in issues:
            print(f"  - {issue}")
        all_good = False
    
    # Test credential generation
    if not test_credential_generation():
        all_good = False
    
    # Test backup functionality
    if not test_backup_functionality():
        all_good = False
    
    # Check current services
    if not check_current_services():
        all_good = False
    
    print("\n" + "=" * 50)
    if all_good:
        print("🎉 All validation checks passed!")
        print("✅ The credential change script should work correctly.")
        print("\nNext steps:")
        print("  python change_db_credentials.py --help")
        print("  python change_db_credentials.py --auto-generate")
    else:
        print("❌ Some validation checks failed.")
        print("⚠️  Please fix the issues above before running the credential change script.")
        sys.exit(1)


if __name__ == "__main__":
    main()
