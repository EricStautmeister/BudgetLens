#!/usr/bin/env python3
"""
Database Credentials Change Script for BudgetLens

This script safely changes database credentials across all configuration files
and environment variables in the BudgetLens application.

Author: BudgetLens Team
Version: 1.0.0
"""

import os
import sys
import secrets
import string
import argparse
import shutil
from pathlib import Path
from typing import Dict, List, Tuple
import subprocess
import re


class DatabaseCredentialChanger:
    """Handles changing database credentials across the BudgetLens application."""
    
    def __init__(self, project_root: str = None):
        """Initialize the credential changer.
        
        Args:
            project_root: Path to the BudgetLens project root directory
        """
        self.project_root = Path(project_root or os.getcwd())
        self.backup_dir = self.project_root / "credential_backups"
        
        # Configuration files that need to be updated
        self.config_files = [
            ".env",
            "backend/.env",
            "docker-compose.yml",
            "docker-compose.override.yml",  # If it exists
        ]
        
        # Current and new credentials
        self.current_creds = {}
        self.new_creds = {}
        
    def generate_secure_password(self, length: int = 32) -> str:
        """Generate a cryptographically secure password.
        
        Args:
            length: Length of the password to generate
            
        Returns:
            Secure random password
        """
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        # Ensure at least one character from each category
        password = [
            secrets.choice(string.ascii_lowercase),
            secrets.choice(string.ascii_uppercase),
            secrets.choice(string.digits),
            secrets.choice("!@#$%^&*")
        ]
        
        # Fill the rest randomly
        for _ in range(length - 4):
            password.append(secrets.choice(alphabet))
        
        # Shuffle the password
        secrets.SystemRandom().shuffle(password)
        return ''.join(password)
    
    def generate_secure_username(self, prefix: str = "budgetlens") -> str:
        """Generate a secure username.
        
        Args:
            prefix: Prefix for the username
            
        Returns:
            Secure username
        """
        suffix = ''.join(secrets.choice(string.ascii_lowercase + string.digits) 
                        for _ in range(8))
        return f"{prefix}_{suffix}"
    
    def backup_files(self) -> None:
        """Create backups of all configuration files."""
        print("📁 Creating backup of configuration files...")
        
        # Create backup directory with timestamp
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = self.backup_dir / f"backup_{timestamp}"
        backup_path.mkdir(parents=True, exist_ok=True)
        
        for config_file in self.config_files:
            file_path = self.project_root / config_file
            if file_path.exists():
                backup_file = backup_path / config_file.replace("/", "_")
                backup_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file_path, backup_file)
                print(f"  ✅ Backed up {config_file}")
        
        print(f"📁 Backup created at: {backup_path}")
    
    def detect_current_credentials(self) -> Dict[str, str]:
        """Detect current database credentials from configuration files.
        
        Returns:
            Dictionary containing current credentials
        """
        print("🔍 Detecting current database credentials...")
        
        credentials = {
            "username": "user",  # Default from docker-compose
            "password": "pass",  # Default from docker-compose
            "database": "budgetapp",  # Default from docker-compose
            "host": "localhost",
            "port": "5432"
        }
        
        # Check .env files
        env_files = [".env", "backend/.env"]
        for env_file in env_files:
            env_path = self.project_root / env_file
            if env_path.exists():
                with open(env_path, 'r') as f:
                    content = f.read()
                    
                # Extract credentials from DATABASE_URL
                db_url_match = re.search(r'DATABASE_URL=postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', content)
                if db_url_match:
                    credentials.update({
                        "username": db_url_match.group(1),
                        "password": db_url_match.group(2),
                        "host": db_url_match.group(3),
                        "port": db_url_match.group(4),
                        "database": db_url_match.group(5)
                    })
                
                # Extract individual credential fields
                for line in content.split('\n'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        if key == 'BUDGETLENS_DB_USER':
                            credentials["username"] = value
                        elif key == 'BUDGETLENS_DB_PASSWORD':
                            credentials["password"] = value
        
        # Check docker-compose.yml
        compose_path = self.project_root / "docker-compose.yml"
        if compose_path.exists():
            with open(compose_path, 'r') as f:
                content = f.read()
                
            # Extract PostgreSQL environment variables
            postgres_user_match = re.search(r'POSTGRES_USER:\s*(.+)', content)
            postgres_pass_match = re.search(r'POSTGRES_PASSWORD:\s*(.+)', content)
            postgres_db_match = re.search(r'POSTGRES_DB:\s*(.+)', content)
            
            if postgres_user_match:
                credentials["username"] = postgres_user_match.group(1).strip()
            if postgres_pass_match:
                credentials["password"] = postgres_pass_match.group(1).strip()
            if postgres_db_match:
                credentials["database"] = postgres_db_match.group(1).strip()
        
        self.current_creds = credentials
        print(f"  ✅ Current username: {credentials['username']}")
        print(f"  ✅ Current database: {credentials['database']}")
        print(f"  ✅ Current host: {credentials['host']}:{credentials['port']}")
        
        return credentials
    
    def prompt_new_credentials(self) -> Dict[str, str]:
        """Prompt user for new credentials or generate them automatically.
        
        Returns:
            Dictionary containing new credentials
        """
        print("\n🔑 Configure new database credentials:")
        print("1. Generate secure credentials automatically")
        print("2. Enter custom credentials manually")
        
        choice = input("Choose option (1 or 2): ").strip()
        
        if choice == "1":
            # Generate secure credentials automatically
            new_creds = {
                "username": self.generate_secure_username(),
                "password": self.generate_secure_password(),
                "database": self.current_creds.get("database", "budgetapp"),
                "host": self.current_creds.get("host", "localhost"),
                "port": self.current_creds.get("port", "5432")
            }
            
            print("\n🎲 Generated secure credentials:")
            print(f"  Username: {new_creds['username']}")
            print(f"  Password: {new_creds['password']}")
            print(f"  Database: {new_creds['database']}")
            
        elif choice == "2":
            # Manual entry
            new_creds = {}
            new_creds["username"] = input(f"New username [{self.current_creds.get('username', 'user')}]: ").strip() or self.current_creds.get('username', 'user')
            new_creds["password"] = input("New password (leave empty to generate): ").strip() or self.generate_secure_password()
            new_creds["database"] = input(f"Database name [{self.current_creds.get('database', 'budgetapp')}]: ").strip() or self.current_creds.get('database', 'budgetapp')
            new_creds["host"] = self.current_creds.get("host", "localhost")
            new_creds["port"] = self.current_creds.get("port", "5432")
            
        else:
            print("❌ Invalid choice. Exiting.")
            sys.exit(1)
        
        self.new_creds = new_creds
        return new_creds
    
    def update_env_file(self, file_path: Path) -> None:
        """Update credentials in an environment file.
        
        Args:
            file_path: Path to the .env file
        """
        if not file_path.exists():
            print(f"  ⚠️  File {file_path} does not exist, skipping...")
            return
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Update individual credential fields
        content = re.sub(
            r'BUDGETLENS_DB_USER=.*',
            f'BUDGETLENS_DB_USER={self.new_creds["username"]}',
            content
        )
        content = re.sub(
            r'BUDGETLENS_DB_PASSWORD=.*',
            f'BUDGETLENS_DB_PASSWORD={self.new_creds["password"]}',
            content
        )
        
        # Update DATABASE_URL
        new_db_url = f'postgresql://{self.new_creds["username"]}:{self.new_creds["password"]}@{self.new_creds["host"]}:{self.new_creds["port"]}/{self.new_creds["database"]}'
        content = re.sub(
            r'DATABASE_URL=.*',
            f'DATABASE_URL={new_db_url}',
            content
        )
        
        with open(file_path, 'w') as f:
            f.write(content)
        
        print(f"  ✅ Updated {file_path}")
    
    def update_docker_compose(self, file_path: Path) -> None:
        """Update credentials in docker-compose file.
        
        Args:
            file_path: Path to the docker-compose.yml file
        """
        if not file_path.exists():
            print(f"  ⚠️  File {file_path} does not exist, skipping...")
            return
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Update PostgreSQL environment variables
        content = re.sub(
            r'POSTGRES_USER:\s*.*',
            f'POSTGRES_USER: {self.new_creds["username"]}',
            content
        )
        content = re.sub(
            r'POSTGRES_PASSWORD:\s*.*',
            f'POSTGRES_PASSWORD: {self.new_creds["password"]}',
            content
        )
        content = re.sub(
            r'POSTGRES_DB:\s*.*',
            f'POSTGRES_DB: {self.new_creds["database"]}',
            content
        )
        
        # Update DATABASE_URL in service environment sections
        new_db_url = f'postgresql://{self.new_creds["username"]}:{self.new_creds["password"]}@db:{self.new_creds["port"]}/{self.new_creds["database"]}'
        content = re.sub(
            r'DATABASE_URL:\s*postgresql://[^@]+@[^/]+/\w+',
            f'DATABASE_URL: {new_db_url}',
            content
        )
        
        with open(file_path, 'w') as f:
            f.write(content)
        
        print(f"  ✅ Updated {file_path}")
    
    def update_configuration_files(self) -> None:
        """Update all configuration files with new credentials."""
        print("\n🔄 Updating configuration files...")
        
        for config_file in self.config_files:
            file_path = self.project_root / config_file
            
            if config_file.endswith('.env'):
                self.update_env_file(file_path)
            elif config_file.endswith('docker-compose.yml') or config_file.endswith('docker-compose.override.yml'):
                self.update_docker_compose(file_path)
    
    def restart_services(self) -> None:
        """Restart Docker services to apply new credentials."""
        print("\n🔄 Restarting services...")
        
        try:
            # Stop services
            print("  🛑 Stopping services...")
            subprocess.run(["docker", "compose", "down"], 
                         cwd=self.project_root, check=True, capture_output=True)
            
            # Remove old database volume to ensure clean start
            print("  🗑️  Removing old database volume...")
            subprocess.run(["docker", "volume", "rm", "budgetlens_postgres_data"], 
                         capture_output=True)  # Don't check=True as volume might not exist
            
            # Start services
            print("  🚀 Starting services with new credentials...")
            subprocess.run(["docker", "compose", "up", "-d"], 
                         cwd=self.project_root, check=True, capture_output=True)
            
            print("  ✅ Services restarted successfully")
            
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Error restarting services: {e}")
            print("  💡 You may need to restart services manually:")
            print("     docker compose down")
            print("     docker volume rm budgetlens_postgres_data")
            print("     docker compose up -d")
    
    def verify_connection(self) -> bool:
        """Verify the database connection with new credentials.
        
        Returns:
            True if connection successful, False otherwise
        """
        print("\n🔍 Verifying database connection...")
        
        try:
            # Run the existing database connection test
            result = subprocess.run(
                ["python", "test_db_connection.py"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0 and "✅ Database connection successful!" in result.stdout:
                print("  ✅ Database connection verified successfully!")
                return True
            else:
                print("  ❌ Database connection failed:")
                print(f"     {result.stdout}")
                print(f"     {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            print("  ❌ Database connection test timed out")
            return False
        except Exception as e:
            print(f"  ❌ Error testing database connection: {e}")
            return False
    
    def display_summary(self) -> None:
        """Display summary of credential changes."""
        print("\n" + "="*60)
        print("📋 CREDENTIAL CHANGE SUMMARY")
        print("="*60)
        print(f"Old Username: {self.current_creds.get('username', 'N/A')}")
        print(f"New Username: {self.new_creds.get('username', 'N/A')}")
        print(f"Database:     {self.new_creds.get('database', 'N/A')}")
        print(f"Host:         {self.new_creds.get('host', 'N/A')}:{self.new_creds.get('port', 'N/A')}")
        print("\n🔑 NEW DATABASE URL:")
        print(f"postgresql://{self.new_creds['username']}:{self.new_creds['password']}@{self.new_creds['host']}:{self.new_creds['port']}/{self.new_creds['database']}")
        print("\n📁 Files Updated:")
        for config_file in self.config_files:
            file_path = self.project_root / config_file
            if file_path.exists():
                print(f"  ✅ {config_file}")
        print("\n💾 Backup Location:")
        print(f"  {self.backup_dir}")
        print("="*60)
    
    def run(self, auto_generate: bool = False, restart: bool = True) -> None:
        """Run the complete credential change process.
        
        Args:
            auto_generate: If True, automatically generate secure credentials
            restart: If True, restart services after updating credentials
        """
        print("🔐 BudgetLens Database Credential Changer")
        print("="*50)
        
        try:
            # Step 1: Backup files
            self.backup_files()
            
            # Step 2: Detect current credentials
            self.detect_current_credentials()
            
            # Step 3: Get new credentials
            if auto_generate:
                self.new_creds = {
                    "username": self.generate_secure_username(),
                    "password": self.generate_secure_password(),
                    "database": self.current_creds.get("database", "budgetapp"),
                    "host": self.current_creds.get("host", "localhost"),
                    "port": self.current_creds.get("port", "5432")
                }
                print("\n🎲 Auto-generated secure credentials")
            else:
                self.prompt_new_credentials()
            
            # Step 4: Update configuration files
            self.update_configuration_files()
            
            # Step 5: Restart services if requested
            if restart:
                self.restart_services()
                
                # Step 6: Verify connection
                if self.verify_connection():
                    print("\n🎉 Credential change completed successfully!")
                else:
                    print("\n⚠️  Credential change completed but connection verification failed.")
                    print("   Please check the logs and verify manually.")
            else:
                print("\n✅ Configuration files updated successfully!")
                print("   Remember to restart services manually to apply changes.")
            
            # Step 7: Display summary
            self.display_summary()
            
        except KeyboardInterrupt:
            print("\n\n❌ Operation cancelled by user.")
            sys.exit(1)
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")
            print("💡 Check the backup files to restore if needed.")
            sys.exit(1)


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Change database credentials for BudgetLens application",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (recommended)
  python change_db_credentials.py
  
  # Auto-generate secure credentials
  python change_db_credentials.py --auto-generate
  
  # Update configs only, don't restart services
  python change_db_credentials.py --no-restart
  
  # Specify different project directory
  python change_db_credentials.py --project-root /path/to/budgetlens
        """
    )
    
    parser.add_argument(
        "--auto-generate",
        action="store_true",
        help="Automatically generate secure credentials without prompting"
    )
    
    parser.add_argument(
        "--no-restart",
        action="store_true",
        help="Update configuration files only, don't restart services"
    )
    
    parser.add_argument(
        "--project-root",
        type=str,
        help="Path to the BudgetLens project root directory"
    )
    
    args = parser.parse_args()
    
    # Initialize and run the credential changer
    changer = DatabaseCredentialChanger(args.project_root)
    changer.run(
        auto_generate=args.auto_generate,
        restart=not args.no_restart
    )


if __name__ == "__main__":
    main()
