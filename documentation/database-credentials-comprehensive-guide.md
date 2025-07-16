# Database Credential Management for BudgetLens

This document provides comprehensive information about managing database credentials in the BudgetLens application.

## Overview

The BudgetLens application uses PostgreSQL as its primary database. Database credentials are configured in multiple places throughout the application, including environment files and Docker configuration. This guide explains how to safely change these credentials using the automated script provided.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Script Features](#script-features)
3. [Usage Examples](#usage-examples)
4. [Configuration Files](#configuration-files)
5. [Security Considerations](#security-considerations)
6. [Troubleshooting](#troubleshooting)
7. [Manual Process](#manual-process)
8. [Backup and Recovery](#backup-and-recovery)

## Quick Start

### Prerequisites

- Python 3.8+ installed
- Docker and Docker Compose installed
- BudgetLens project directory accessible
- Sufficient permissions to modify configuration files

### Basic Usage

1. **Navigate to the project directory:**
   ```bash
   cd /path/to/BudgetLens
   ```

2. **Run the credential change script:**
   ```bash
   python change_db_credentials.py
   ```

3. **Follow the interactive prompts:**
   - Choose between automatic generation or manual entry
   - Review the changes before applying
   - The script will handle the rest automatically

### One-Command Auto-Update

For automated environments or when you want secure credentials generated automatically:

```bash
python change_db_credentials.py --auto-generate
```

## Script Features

### 🔐 Security Features

- **Cryptographically Secure Password Generation**: Uses Python's `secrets` module for true randomness
- **Strong Password Policy**: Generated passwords include uppercase, lowercase, numbers, and special characters
- **Automatic Backup**: Creates timestamped backups of all configuration files before making changes
- **Secure Username Generation**: Creates unique usernames with random suffixes

### 🔄 Automation Features

- **Multi-File Updates**: Automatically updates all relevant configuration files
- **Service Restart**: Handles Docker service restart with proper cleanup
- **Connection Verification**: Tests the new credentials after applying changes
- **Rollback Support**: Maintains backups for easy rollback if needed

### 📊 Monitoring Features

- **Progress Tracking**: Clear progress indicators throughout the process
- **Detailed Logging**: Comprehensive output showing what's being changed
- **Summary Report**: Final summary of all changes made
- **Error Handling**: Graceful error handling with helpful suggestions

## Usage Examples

### Example 1: Interactive Mode (Recommended)

```bash
python change_db_credentials.py
```

**Output:**
```
🔐 BudgetLens Database Credential Changer
==================================================
📁 Creating backup of configuration files...
  ✅ Backed up .env
  ✅ Backed up backend/.env
  ✅ Backed up docker-compose.yml
📁 Backup created at: /path/to/BudgetLens/credential_backups/backup_20250713_143022

🔍 Detecting current database credentials...
  ✅ Current username: user
  ✅ Current database: budgetapp
  ✅ Current host: localhost:5432

🔑 Configure new database credentials:
1. Generate secure credentials automatically
2. Enter custom credentials manually
Choose option (1 or 2): 1

🎲 Generated secure credentials:
  Username: budgetlens_a8x9m2k7
  Password: K9#mN2$pQ7vR@nX4
  Database: budgetapp

🔄 Updating configuration files...
  ✅ Updated .env
  ✅ Updated backend/.env
  ✅ Updated docker-compose.yml

🔄 Restarting services...
  🛑 Stopping services...
  🗑️  Removing old database volume...
  🚀 Starting services with new credentials...
  ✅ Services restarted successfully

🔍 Verifying database connection...
  ✅ Database connection verified successfully!

🎉 Credential change completed successfully!

============================================================
📋 CREDENTIAL CHANGE SUMMARY
============================================================
Old Username: user
New Username: budgetlens_a8x9m2k7
Database:     budgetapp
Host:         localhost:5432

🔑 NEW DATABASE URL:
postgresql://budgetlens_a8x9m2k7:K9#mN2$pQ7vR@nX4@localhost:5432/budgetapp

📁 Files Updated:
  ✅ .env
  ✅ backend/.env
  ✅ docker-compose.yml

💾 Backup Location:
  /path/to/BudgetLens/credential_backups
============================================================
```

### Example 2: Auto-Generate Mode

```bash
python change_db_credentials.py --auto-generate
```

Perfect for CI/CD pipelines or automated deployments where you want maximum security without user interaction.

### Example 3: Configuration Only (No Service Restart)

```bash
python change_db_credentials.py --no-restart
```

Useful when you want to update configurations but handle service restart manually.

### Example 4: Different Project Directory

```bash
python change_db_credentials.py --project-root /home/user/my-budgetlens
```

## Configuration Files

The script automatically updates the following files:

### 1. `.env` (Root Environment File)
```env
SECRET_KEY=...
JWT_SECRET=...
BUDGETLENS_DB_USER=new_username
BUDGETLENS_DB_PASSWORD=new_password
DATABASE_URL=postgresql://new_username:new_password@localhost:5432/budgetapp
```

### 2. `backend/.env` (Backend Environment File)
```env
SECRET_KEY=...
JWT_SECRET=...
BUDGETLENS_DB_USER=new_username
BUDGETLENS_DB_PASSWORD=new_password
DATABASE_URL=postgresql://new_username:new_password@localhost:5432/budgetapp
```

### 3. `docker-compose.yml` (Docker Configuration)
```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: new_username
      POSTGRES_PASSWORD: new_password
      POSTGRES_DB: budgetapp
  
  backend:
    environment:
      DATABASE_URL: postgresql://new_username:new_password@db:5432/budgetapp
  
  celery_worker:
    environment:
      DATABASE_URL: postgresql://new_username:new_password@db:5432/budgetapp
```

### 4. `docker-compose.override.yml` (If it exists)
Similar updates to any override configurations.

## Security Considerations

### Password Generation

- **Length**: Default 32 characters (configurable)
- **Character Set**: Upper/lowercase letters, numbers, and special characters (!@#$%^&*)
- **Randomness**: Uses `secrets.SystemRandom()` for cryptographically secure generation
- **Validation**: Ensures at least one character from each category

### Username Generation

- **Format**: `budgetlens_[8_random_chars]`
- **Character Set**: Lowercase letters and numbers only
- **Uniqueness**: Random suffix ensures uniqueness

### Backup Security

- **Location**: `credential_backups/` directory (should be excluded from version control)
- **Permissions**: Maintains original file permissions
- **Retention**: Manual cleanup required (consider automatic cleanup for production)

### Best Practices

1. **Regular Rotation**: Change credentials periodically (quarterly recommended)
2. **Environment Isolation**: Use different credentials for different environments
3. **Access Control**: Limit who can run the credential change script
4. **Monitoring**: Monitor database access logs after credential changes
5. **Documentation**: Keep secure records of when credentials were changed

## Troubleshooting

### Common Issues

#### 1. Permission Denied
```
❌ Error: Permission denied when updating configuration files
```

**Solution:**
```bash
# Ensure you have write permissions
chmod 644 .env backend/.env docker-compose.yml

# Or run with sudo if necessary (not recommended for production)
sudo python change_db_credentials.py
```

#### 2. Docker Service Restart Failed
```
❌ Error restarting services: ...
```

**Solution:**
```bash
# Manual restart process
docker compose down
docker volume rm budgetlens_postgres_data
docker compose up -d
```

#### 3. Database Connection Failed
```
❌ Database connection failed: connection to server failed
```

**Possible Causes:**
- Services haven't fully started yet (wait 30-60 seconds)
- Port conflicts
- Network issues

**Solution:**
```bash
# Check service status
docker compose ps

# Check logs
docker compose logs db
docker compose logs backend

# Verify connection manually
python test_db_connection.py
```

#### 4. Backup Creation Failed
```
❌ Error creating backup: [Errno 13] Permission denied
```

**Solution:**
```bash
# Create backup directory manually
mkdir -p credential_backups
chmod 755 credential_backups

# Or specify different backup location
export BACKUP_DIR=/tmp/budgetlens_backups
python change_db_credentials.py
```

### Recovery Procedures

#### Restore from Backup

1. **Locate the backup:**
   ```bash
   ls -la credential_backups/
   ```

2. **Restore files:**
   ```bash
   # Replace TIMESTAMP with your backup timestamp
   cp credential_backups/backup_TIMESTAMP/.env .
   cp credential_backups/backup_TIMESTAMP/backend_.env backend/.env
   cp credential_backups/backup_TIMESTAMP/docker-compose.yml .
   ```

3. **Restart services:**
   ```bash
   docker compose down
   docker compose up -d
   ```

#### Emergency Reset

If all else fails, reset to default credentials:

1. **Edit docker-compose.yml:**
   ```yaml
   POSTGRES_USER: user
   POSTGRES_PASSWORD: pass
   POSTGRES_DB: budgetapp
   ```

2. **Edit .env files:**
   ```env
   BUDGETLENS_DB_USER=user
   BUDGETLENS_DB_PASSWORD=pass
   DATABASE_URL=postgresql://user:pass@localhost:5432/budgetapp
   ```

3. **Clean restart:**
   ```bash
   docker compose down
   docker volume rm budgetlens_postgres_data
   docker compose up -d
   ```

## Manual Process

If you prefer to change credentials manually or the script isn't working:

### Step 1: Backup Current Configuration
```bash
cp .env .env.backup
cp backend/.env backend/.env.backup
cp docker-compose.yml docker-compose.yml.backup
```

### Step 2: Generate New Credentials
```python
import secrets
import string

def generate_password(length=32):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    return password

def generate_username():
    suffix = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    return f"budgetlens_{suffix}"

new_username = generate_username()
new_password = generate_password()
print(f"Username: {new_username}")
print(f"Password: {new_password}")
```

### Step 3: Update Configuration Files

**Update `.env` and `backend/.env`:**
```bash
# Replace with your generated credentials
sed -i 's/BUDGETLENS_DB_USER=.*/BUDGETLENS_DB_USER=new_username/' .env
sed -i 's/BUDGETLENS_DB_PASSWORD=.*/BUDGETLENS_DB_PASSWORD=new_password/' .env
sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://new_username:new_password@localhost:5432/budgetapp|' .env

# Repeat for backend/.env
cp .env backend/.env
```

**Update `docker-compose.yml`:**
```bash
sed -i 's/POSTGRES_USER: .*/POSTGRES_USER: new_username/' docker-compose.yml
sed -i 's/POSTGRES_PASSWORD: .*/POSTGRES_PASSWORD: new_password/' docker-compose.yml
sed -i 's|postgresql://[^@]*@|postgresql://new_username:new_password@|g' docker-compose.yml
```

### Step 4: Restart Services
```bash
docker compose down
docker volume rm budgetlens_postgres_data
docker compose up -d
```

### Step 5: Verify
```bash
python test_db_connection.py
```

## Backup and Recovery

### Automated Backups

The script creates automatic backups with timestamps:

```
credential_backups/
├── backup_20250713_143022/
│   ├── .env
│   ├── backend_.env
│   └── docker-compose.yml
├── backup_20250713_150145/
└── backup_20250713_162030/
```

### Backup Management

**List backups:**
```bash
ls -la credential_backups/
```

**Clean old backups (keep last 5):**
```bash
cd credential_backups
ls -t | tail -n +6 | xargs rm -rf
```

**Archive backups:**
```bash
tar -czf credential_backups_$(date +%Y%m%d).tar.gz credential_backups/
```

### Recovery Testing

Regularly test your recovery process:

1. **Create test backup:**
   ```bash
   python change_db_credentials.py --auto-generate
   ```

2. **Simulate failure and restore:**
   ```bash
   # Corrupt configuration
   echo "broken" > .env
   
   # Restore from backup
   LATEST_BACKUP=$(ls -t credential_backups/ | head -n1)
   cp credential_backups/$LATEST_BACKUP/.env .
   ```

3. **Verify recovery:**
   ```bash
   python test_db_connection.py
   ```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Update Database Credentials

on:
  schedule:
    - cron: '0 2 1 */3 *'  # Every 3 months at 2 AM on the 1st

jobs:
  update-credentials:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      
      - name: Update credentials
        run: |
          python change_db_credentials.py --auto-generate --no-restart
      
      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add .env backend/.env docker-compose.yml
          git commit -m "Update database credentials [automated]"
          git push
```

### Docker Secrets Alternative

For production environments, consider using Docker secrets:

```yaml
services:
  db:
    image: postgres:15
    secrets:
      - db_username
      - db_password
    environment:
      POSTGRES_USER_FILE: /run/secrets/db_username
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_username:
    file: ./secrets/db_username.txt
  db_password:
    file: ./secrets/db_password.txt
```

## Support

For issues or questions:

1. **Check the troubleshooting section above**
2. **Review the backup files in `credential_backups/`**
3. **Verify Docker services are running: `docker compose ps`**
4. **Check application logs: `docker compose logs`**

Remember: Always test credential changes in a development environment before applying to production!
