# backend/app/db/models.py - Fixed all relationship issues

from sqlalchemy import Column, String, Integer, Numeric, Boolean, Float, Text, Date, DateTime, ForeignKey, JSON, ARRAY, UniqueConstraint, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from enum import Enum as PyEnum
from .base import Base

# NEW: Category Type Enum
class CategoryType(PyEnum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE" 
    SAVING = "SAVING"
    MANUAL_REVIEW = "MANUAL_REVIEW"

# Account Types Enum (existing)
class AccountType(PyEnum):
    CHECKING = "CHECKING"
    SAVINGS = "SAVINGS"
    CREDIT_CARD = "CREDIT_CARD"
    INVESTMENT = "INVESTMENT"
    LOAN = "LOAN"

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    transfer_settings = Column(JSON, nullable=True)  # Store transfer detection settings
    ui_preferences = Column(JSON, nullable=True)     # Store UI preferences
    security_preferences = Column(JSON, nullable=True)  # Store security settings
    
    # FIXED: ALL relationships to avoid "has no property" errors
    transactions = relationship("Transaction", back_populates="user")
    categories = relationship("Category", back_populates="user")
    vendors = relationship("Vendor", back_populates="user")
    budget_periods = relationship("BudgetPeriod", back_populates="user")
    csv_mappings = relationship("CSVMapping", back_populates="user")
    accounts = relationship("Account", back_populates="user")
    transfers = relationship("Transfer", back_populates="user")  # FIXED: Added missing transfers relationship

class Account(Base):
    __tablename__ = "accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    account_type = Column(Enum(AccountType), nullable=False)
    institution = Column(String(255))
    account_number_last4 = Column(String(4))
    currency = Column(String(3), default="CHF")
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # FIXED: Added missing transfer relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")
    outgoing_transfers = relationship("Transfer", foreign_keys="Transfer.from_account_id", back_populates="from_account")
    incoming_transfers = relationship("Transfer", foreign_keys="Transfer.to_account_id", back_populates="to_account")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'name', name='_user_account_name_uc'),
    )

class Transfer(Base):
    __tablename__ = "transfers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    from_account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    to_account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    from_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    to_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    amount = Column(Numeric(12, 2), nullable=False)
    date = Column(Date, nullable=False)
    description = Column(Text)
    is_confirmed = Column(Boolean, default=False)

    confidence_score = Column(Float)  # AI confidence in the match
    matched_rule = Column(String(100))  # Rule that triggered the match
    detection_method = Column(String(50), default="manual")  # manual, ai, rule
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # FIXED: Proper relationships with correct back_populates
    user = relationship("User", back_populates="transfers")
    from_account = relationship("Account", foreign_keys=[from_account_id], back_populates="outgoing_transfers")
    to_account = relationship("Account", foreign_keys=[to_account_id], back_populates="incoming_transfers")
    from_transaction = relationship("Transaction", foreign_keys=[from_transaction_id], back_populates="outgoing_transfer")
    to_transaction = relationship("Transaction", foreign_keys=[to_transaction_id], back_populates="incoming_transfer")

class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(Text, nullable=False)
    source_account = Column(String(100))  # Keep for legacy
    
    # Account and transfer columns
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"))
    
    # Category and vendor columns
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"))
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    is_transfer = Column(Boolean, default=False)
    confidence_score = Column(Float)
    needs_review = Column(Boolean, default=False, index=True)

    upload_batch_id = Column(String(50))  # Track which upload created this
    original_description = Column(Text)   # Store original before any processing
    processing_notes = Column(JSON)       # Store processing metadata

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # FIXED: Proper relationships - removed transfer_id column and fixed relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    vendor = relationship("Vendor", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    outgoing_transfer = relationship("Transfer", foreign_keys="Transfer.from_transaction_id", back_populates="from_transaction")
    incoming_transfer = relationship("Transfer", foreign_keys="Transfer.to_transaction_id", back_populates="to_transaction")

class Vendor(Base):
    __tablename__ = "vendors"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    patterns = Column(ARRAY(Text))
    default_category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    confidence_threshold = Column(Float, default=0.8)
    # NEW: Flag to prevent auto-learning for manual review vendors
    allow_auto_learning = Column(Boolean, default=True)

    last_matched_at = Column(DateTime)  # When this vendor was last matched
    match_count = Column(Integer, default=0)  # How many times it's been matched
    average_amount = Column(Numeric(12, 2))  # Average transaction amount
    preferred_accounts = Column(ARRAY(Text))  # Account IDs this vendor typically appears in
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="vendors")
    default_category = relationship("Category", foreign_keys=[default_category_id])
    transactions = relationship("Transaction", back_populates="vendor")

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    
    # NEW: Category hierarchy and type
    category_type = Column(Enum(CategoryType), nullable=False, default=CategoryType.EXPENSE)
    parent_category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    
    # Updated: Keep existing fields but modify behavior based on type
    is_automatic_deduction = Column(Boolean, default=False)
    is_savings = Column(Boolean, default=False)  # Will be deprecated in favor of category_type
    
    # NEW: Control auto-learning behavior
    allow_auto_learning = Column(Boolean, default=True)

    color = Column(String(7))  # Hex color code for UI
    icon = Column(String(50))  # Icon identifier
    sort_order = Column(Integer, default=0)  # Custom sort order
    budget_alert_threshold = Column(Float)  # Alert when spending exceeds this percentage

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # FIXED: Proper self-referencing relationships
    user = relationship("User", back_populates="categories")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")
    transactions = relationship("Transaction", back_populates="category")
    budget_periods = relationship("BudgetPeriod", back_populates="category")

class BudgetPeriod(Base):
    __tablename__ = "budget_periods"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    period = Column(Date, nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    budgeted_amount = Column(Numeric(10, 2), nullable=False)
    actual_amount = Column(Numeric(10, 2), default=0)
    rollover_amount = Column(Numeric(10, 2), default=0)

    alert_sent = Column(Boolean, default=False)  # Track if overspend alert was sent
    notes = Column(Text)  # User notes for this budget period

    # Relationships
    user = relationship("User", back_populates="budget_periods")
    category = relationship("Category", back_populates="budget_periods")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'period', 'category_id', name='_user_period_category_uc'),
    )

class CSVMapping(Base):
    __tablename__ = "csv_mappings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    source_name = Column(String(100), nullable=False)
    column_mappings = Column(JSON, nullable=False)
    date_format = Column(String(50), default='%Y-%m-%d')
    decimal_separator = Column(String(1), default='.')
    encoding = Column(String(20), default='utf-8')
    
    skip_rows = Column(Integer, default=0)  # Number of header rows to skip
    currency_symbol = Column(String(5), default='CHF')  # Currency for this mapping
    validation_rules = Column(JSON)  # Custom validation rules
    
    # Relationships
    user = relationship("User", back_populates="csv_mappings")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'source_name', name='_user_source_uc'),
    )

class UploadLog(Base):
    __tablename__ = "upload_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)  # NEW: Store original name
    status = Column(String(50), nullable=False)
    total_rows = Column(Integer, default=0)
    processed_rows = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    error_details = Column(JSON)
    
    # NEW: Enhanced upload tracking
    file_size = Column(Integer)  # File size in bytes
    file_hash = Column(String(64))  # SHA256 hash for duplicate detection
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"))  # Target account
    mapping_id = Column(UUID(as_uuid=True), ForeignKey("csv_mappings.id"))  # Used mapping
    batch_id = Column(String(50))  # Unique batch identifier
    
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)
    
    # Relationships
    user = relationship("User")
    account = relationship("Account")
    mapping = relationship("CSVMapping")

# System audit log for security tracking
class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String(100), nullable=False)  # login, upload, transfer_create, etc.
    resource_type = Column(String(50))  # transaction, account, etc.
    resource_id = Column(String(50))  # ID of affected resource
    ip_address = Column(String(45))  # IPv4 or IPv6
    user_agent = Column(Text)  # Browser/client info
    details = Column(JSON)  # Additional context
    success = Column(Boolean, default=True)
    error_message = Column(Text)  # If success=False
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User")

class RateLimitLog(Base):
    __tablename__ = "rate_limit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    ip_address = Column(String(45), nullable=False)
    endpoint = Column(String(100), nullable=False)
    request_count = Column(Integer, default=1)
    window_start = Column(DateTime, nullable=False)
    blocked = Column(Boolean, default=False)
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User")