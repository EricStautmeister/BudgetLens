# backend/app/db/models.py - Updated Category model

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
    
    # ALL relationships to avoid "has no property" errors
    transactions = relationship("Transaction", back_populates="user")
    categories = relationship("Category", back_populates="user")
    vendors = relationship("Vendor", back_populates="user")
    budget_periods = relationship("BudgetPeriod", back_populates="user")
    csv_mappings = relationship("CSVMapping", back_populates="user")
    accounts = relationship("Account", back_populates="user")

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
    
    # Relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")
    
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
    created_at = Column(DateTime, server_default=func.now())

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
    transfer_id = Column(UUID(as_uuid=True), ForeignKey("transfers.id"))
    
    # Category and vendor columns
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"))
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    is_transfer = Column(Boolean, default=False)
    confidence_score = Column(Float)
    needs_review = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    vendor = relationship("Vendor", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

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
    created_at = Column(DateTime, server_default=func.now())
    
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
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="categories")
    parent = relationship("Category", remote_side=[id])
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
    status = Column(String(50), nullable=False)
    total_rows = Column(Integer, default=0)
    processed_rows = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    error_details = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)