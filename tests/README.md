# BudgetLens Tests

This directory contains various test and validation scripts for the BudgetLens application.

## 📁 Test Files

### Database Testing
- **`test_db_connection.py`** - Tests database connectivity and basic operations

### Frontend Testing  
- **`test_vendor_frontend.js`** - Frontend vendor intelligence testing

### Backend Testing
- **`test_vendor_intelligence.py`** - Tests vendor intelligence and pattern matching functionality

### System Validation
- **`validate_credential_system.py`** - Validates the credential management system functionality

## 🚀 Running Tests

### Database Connection Test
```bash
cd tests
python test_db_connection.py
```

### Vendor Intelligence Test
```bash
cd tests
python test_vendor_intelligence.py
```

### Credential System Validation
```bash
cd tests
python validate_credential_system.py
```

### Frontend Vendor Test
```bash
cd tests
node test_vendor_frontend.js
```

## 📋 Notes

- These are primarily development and validation scripts
- Some tests may require the application to be running
- Database tests require proper credentials to be configured
- Run tests from the project root directory for proper path resolution
