# Personal Budgeting Tool - Development Specification

## Project Overview

Build a modern, secure personal budgeting tool that processes CSV bank exports, automates transaction categorization, and provides comprehensive budget tracking with daily allowance calculations.

## Technology Stack

-   **Backend:** FastAPI (Python 3.11+)
-   **Frontend:** React 18 + TypeScript + Vite + Material-UI
-   **Database:** PostgreSQL 15+ with SQLAlchemy ORM
-   **Authentication:** JWT tokens with FastAPI-Users
-   **Deployment:** Docker Compose
-   **Task Queue:** Celery with Redis

## Core Requirements

### 1. CSV Processing System

**Objective:** Handle multiple bank CSV formats with automatic normalization

**Implementation:**

-   Support for 3+ different CSV formats (different column names/orders)
-   Configurable column mapping system stored in database
-   Data validation and duplicate detection
-   Error handling for malformed files
-   Transaction amount normalization (handle different decimal formats)

**Technical Details:**

-   Use Pandas for CSV processing
-   Implement CSV format detection
-   Store mapping configurations in `csv_mappings` table
-   Generate processing reports with error summaries

### 2. Intelligent Transaction Categorization

**Objective:** Automatically categorize transactions with learning capability

**Two-tier System:**

1. **Known Vendors Table:** Pattern-based matching for recognized merchants
2. **Unknown Transactions Queue:** Manual review and learning system

**Features:**

-   Fuzzy string matching for vendor identification
-   Manual categorization interface with approval workflow
-   Learning system that improves from user corrections
-   Confidence scoring for automatic categorizations
-   Special handling for internal transfers (same-bank account moves)

**Implementation:**

-   Use rapidfuzz library for fuzzy matching
-   Store vendor patterns as regex/text patterns
-   Implement confidence thresholds for auto-approval
-   Create review interface for uncertain matches

### 3. Advanced Budget Management

**Objective:** Comprehensive budget tracking with daily allowances

**Features:**

-   Monthly budget periods with rollover support
-   Daily allowance calculation per category
-   Automatic vs. manual expense classification
-   Savings category tracking
-   Budget vs. actual reporting
-   Trend analysis and forecasting

**Calculations:**

-   Daily allowance = (Monthly budget - spent) / remaining days
-   Handle month-end rollover logic
-   Track automatic deductions separately

### 4. Security Implementation (CIAAA Framework)

**Confidentiality:**

-   AES-256 encryption for sensitive data at rest
-   All API communications over HTTPS/TLS
-   Environment-based configuration management
-   Secure file upload handling

**Integrity:**

-   Database transaction logging
-   File hash verification for uploads
-   API request/response validation
-   Audit trail for all data modifications

**Availability:**

-   Health check endpoints
-   Database connection pooling
-   Error recovery mechanisms
-   Graceful degradation for non-critical features

**Authentication & Authorization:**

-   JWT token-based authentication
-   Refresh token rotation
-   Password hashing with bcrypt
-   Session management
-   Future multi-user support architecture

## Database Schema

### Core Tables

```sql
-- Transactions (normalized from all sources)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    source_account VARCHAR(100),
    vendor_id UUID REFERENCES vendors(id),
    category_id UUID REFERENCES categories(id),
    is_transfer BOOLEAN DEFAULT FALSE,
    confidence_score FLOAT,
    needs_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendor patterns for auto-categorization
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    patterns TEXT[], -- Array of regex/text patterns
    default_category_id UUID REFERENCES categories(id),
    confidence_threshold FLOAT DEFAULT 0.8,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expense categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    parent_category_id UUID REFERENCES categories(id),
    is_automatic_deduction BOOLEAN DEFAULT FALSE,
    is_savings BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budget tracking by period and category
CREATE TABLE budget_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period DATE NOT NULL, -- First day of month
    category_id UUID REFERENCES categories(id),
    budgeted_amount DECIMAL(10,2) NOT NULL,
    actual_amount DECIMAL(10,2) DEFAULT 0,
    rollover_amount DECIMAL(10,2) DEFAULT 0,
    UNIQUE(period, category_id)
);

-- CSV source configuration
CREATE TABLE csv_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name VARCHAR(100) NOT NULL UNIQUE,
    column_mappings JSONB NOT NULL, -- {"date": "Transaction Date", "amount": "Amount", ...}
    date_format VARCHAR(50) DEFAULT 'YYYY-MM-DD',
    decimal_separator CHAR(1) DEFAULT '.',
    encoding VARCHAR(20) DEFAULT 'utf-8'
);
```

## API Endpoints Structure

### Upload & Processing

-   `POST /api/v1/uploads/csv` - Upload and process CSV file
-   `GET /api/v1/uploads/{upload_id}/status` - Check processing status
-   `GET /api/v1/uploads/{upload_id}/report` - Get processing report

### Transaction Management

-   `GET /api/v1/transactions` - List transactions with filtering
-   `PUT /api/v1/transactions/{id}/categorize` - Manual categorization
-   `GET /api/v1/transactions/review` - Get transactions needing review
-   `POST /api/v1/transactions/bulk-categorize` - Bulk categorization

### Budget Management

-   `GET /api/v1/budgets/current` - Current month budget overview
-   `POST /api/v1/budgets/period` - Create/update budget period
-   `GET /api/v1/budgets/daily-allowances` - Calculate daily allowances
-   `GET /api/v1/budgets/trends` - Budget trend analysis

### Categories & Vendors

-   `GET/POST/PUT/DELETE /api/v1/categories` - Category CRUD
-   `GET/POST/PUT/DELETE /api/v1/vendors` - Vendor pattern CRUD
-   `POST /api/v1/vendors/learn` - Learn new vendor from transaction

### Reporting

-   `GET /api/v1/reports/monthly/{period}` - Monthly expense report
-   `GET /api/v1/reports/export/pdf` - Export to PDF
-   `GET /api/v1/reports/export/excel` - Export to Excel

## Frontend Components

### 1. Dashboard Overview

-   Current month budget status
-   Daily allowances by category
-   Recent transactions
-   Spending trends visualization

### 2. CSV Upload Interface

-   Drag-and-drop file upload
-   Source selection (bank type)
-   Processing progress indicator
-   Error/success reporting

### 3. Transaction Management

-   Filterable transaction table
-   Bulk categorization tools
-   Review queue for uncertain transactions
-   Manual transaction entry

### 4. Category & Vendor Management

-   Category hierarchy management
-   Vendor pattern configuration
-   Learning interface for new vendors
-   Bulk operations

### 5. Budget Planning

-   Monthly budget setup
-   Category allocation
-   Rollover configuration
-   Savings goal tracking

### 6. Reporting Dashboard

-   Interactive charts and graphs
-   Export functionality
-   Trend analysis
-   Comparison views

## Security Requirements

### Data Protection

-   Encrypt all sensitive data at rest using AES-256
-   Use HTTPS for all communications
-   Implement secure file upload with virus scanning
-   Store secrets in environment variables only

### Access Control

-   JWT-based authentication with refresh tokens
-   Password complexity requirements
-   Session timeout configuration
-   API rate limiting

### Audit & Monitoring

-   Log all data modifications
-   Monitor for suspicious activities
-   Health check endpoints
-   Error tracking and alerting

## Performance Requirements

### Response Times

-   API responses < 200ms for simple queries
-   CSV processing < 30 seconds for 1000 transactions
-   Dashboard load < 2 seconds
-   Export generation < 10 seconds

### Scalability

-   Support 10,000+ transactions per user
-   Handle concurrent CSV uploads
-   Optimize database queries with proper indexing
-   Implement caching for frequently accessed data

## Docker Deployment Configuration

### Development Setup

```yaml
services:
    backend:
        build: ./backend
        ports: ['8000:8000']
        environment:
            - DATABASE_URL=postgresql://user:pass@db:5432/budgetapp
        volumes: ['./backend:/app']

    frontend:
        build: ./frontend
        ports: ['3000:3000']
        volumes: ['./frontend:/app']

    db:
        image: postgres:15
        environment:
            - POSTGRES_DB=budgetapp
        volumes: ['postgres_data:/var/lib/postgresql/data']

    redis:
        image: redis:7-alpine
```

### Production Setup

-   Traefik reverse proxy with automatic HTTPS
-   Separate backend and frontend containers
-   Database backups automation
-   Resource limits and health checks
-   Secrets management

## Implementation Phases

### Phase 1: Core Foundation

1. Set up FastAPI backend with authentication
2. Create React frontend with Material-UI
3. Implement basic database schema
4. Create CSV upload and basic processing

### Phase 2: Smart Categorization

1. Build vendor pattern matching system
2. Implement manual review interface
3. Create learning algorithm for new vendors
4. Add confidence scoring

### Phase 3: Advanced Budgeting

1. Implement budget period management
2. Create daily allowance calculations
3. Add rollover logic
4. Build reporting dashboard

### Phase 4: Polish & Security

1. Implement full security measures
2. Add export functionality
3. Create comprehensive error handling
4. Optimize performance

### Phase 5: Production Ready

1. Docker deployment setup
2. Monitoring and logging
3. Backup automation
4. Documentation and testing

## Testing Strategy

### Backend Testing

-   Unit tests for all business logic
-   Integration tests for API endpoints
-   Database transaction testing
-   CSV processing validation

### Frontend Testing

-   Component unit tests with Jest/React Testing Library
-   E2E tests with Playwright
-   Accessibility testing
-   Cross-browser compatibility

### Security Testing

-   Authentication flow testing
-   Input validation testing
-   File upload security testing
-   API rate limiting verification

## Future Enhancements (Monetization Ready)

### Multi-tenant Architecture

-   User isolation at database level
-   Subscription management
-   Usage analytics and billing
-   API rate limiting per tier

### Advanced Features

-   Bank API integration (when available)
-   Machine learning for spending predictions
-   Mobile app companion
-   Advanced reporting and analytics
-   Goal setting and tracking
-   Bill reminder system

## Success Metrics

### Technical Metrics

-   99.9% uptime
-   < 200ms average API response time
-   Zero data loss incidents
-   < 1% transaction categorization errors

### User Experience Metrics

-   Time to complete monthly budget setup < 10 minutes
-   CSV upload and categorization < 2 minutes
-   User satisfaction score > 4.5/5
-   Feature adoption rate > 80%

## Development Guidelines

### Code Quality

-   Type hints for all Python code
-   ESLint/Prettier for TypeScript/React
-   90%+ test coverage
-   Comprehensive API documentation
-   Git hooks for quality checks

### Documentation

-   API documentation with OpenAPI/Swagger
-   Frontend component documentation
-   Deployment guide
-   User manual
-   Developer setup guide

This specification provides a comprehensive roadmap for building a production-ready personal budgeting tool that can scale from personal use to a monetizable SaaS product.
