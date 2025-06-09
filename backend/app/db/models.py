from sqlalchemy import Column, String, Decimal, Boolean, Float, Text, Date, DateTime, ForeignKey, JSON, ARRAY, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from .base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    transactions = relationship("Transaction", back_populates="user")
    categories = relationship("Category", back_populates="user")
    vendors = relationship("Vendor", back_populates="user")
    budget_periods = relationship("BudgetPeriod", back_populates="user")
    csv_mappings = relationship("CSVMapping", back_populates="user")

class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Decimal(12, 2), nullable=False)
    description = Column(Text, nullable=False)
    source_account = Column(String(100))
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"))
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    is_transfer = Column(Boolean, default=False)
    confidence_score = Column(Float)
    needs_review = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="transactions")
    vendor = relationship("Vendor", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

class Vendor(Base):
    __tablename__ = "vendors"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    patterns = Column(ARRAY(Text))  # Array of regex/text patterns
    default_category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    confidence_threshold = Column(Float, default=0.8)
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
    parent_category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    is_automatic_deduction = Column(Boolean, default=False)
    is_savings = Column(Boolean, default=False)
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
    period = Column(Date, nullable=False)  # First day of month
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    budgeted_amount = Column(Decimal(10, 2), nullable=False)
    actual_amount = Column(Decimal(10, 2), default=0)
    rollover_amount = Column(Decimal(10, 2), default=0)
    
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
    column_mappings = Column(JSON, nullable=False)  # {"date": "Transaction Date", "amount": "Amount", ...}
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
    status = Column(String(50), nullable=False)  # processing, completed, failed
    total_rows = Column(Integer, default=0)
    processed_rows = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    error_details = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)