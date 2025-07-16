# Database Credential Management

This directory contains tools and documentation for managing database credentials in the BudgetLens application.

## Quick Start

```bash
# Change database credentials (interactive mode)
python change_db_credentials.py

# Auto-generate secure credentials
python change_db_credentials.py --auto-generate

# Update configuration only (no service restart)
python change_db_credentials.py --no-restart
```

## Files

- **`change_db_credentials.py`** - Main credential change script
- **`docs/DATABASE_CREDENTIALS.md`** - Comprehensive documentation
- **`test_db_connection.py`** - Database connection test utility

## Features

- 🔐 **Secure credential generation** using cryptographic randomness
- 📁 **Automatic backups** of all configuration files
- 🔄 **Service restart handling** with Docker Compose
- ✅ **Connection verification** after credential changes
- 📊 **Detailed progress reporting** and error handling

## Safety Features

- Creates timestamped backups before any changes
- Validates new credentials before finalizing
- Provides rollback instructions if something goes wrong
- Non-destructive updates (original files are always backed up)

## Documentation

See [`docs/DATABASE_CREDENTIALS.md`](docs/DATABASE_CREDENTIALS.md) for:

- Detailed usage examples
- Security considerations
- Troubleshooting guide
- Manual process instructions
- CI/CD integration examples

## Requirements

- Python 3.8+
- Docker and Docker Compose
- Write permissions to configuration files

## Support

The script includes comprehensive error handling and recovery instructions. Check the troubleshooting section in the documentation for common issues and solutions.
