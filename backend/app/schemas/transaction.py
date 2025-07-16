from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List
from uuid import UUID

class TransactionBase(BaseModel):
    date: date
    amount: Decimal
    description: str
    source_account: Optional[str] = None
    vendor_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    is_transfer: bool = False
    
    # NEW: Enhanced transaction fields
    details: Optional[str] = None
    reference_number: Optional[str] = None
    payment_method: Optional[str] = None
    merchant_category: Optional[str] = None
    location: Optional[str] = None
    savings_pocket_id: Optional[UUID] = None

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    vendor_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    vendor_name: Optional[str] = None  # For learning new vendors
    is_transfer: Optional[bool] = None
    
    # NEW: Enhanced transaction fields
    details: Optional[str] = None
    reference_number: Optional[str] = None
    payment_method: Optional[str] = None
    merchant_category: Optional[str] = None
    location: Optional[str] = None
    savings_pocket_id: Optional[UUID] = None

class TransactionInDB(TransactionBase):
    id: UUID
    user_id: UUID
    confidence_score: Optional[float] = None
    needs_review: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class Transaction(TransactionInDB):
    vendor_name: Optional[str] = None
    category_name: Optional[str] = None
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    
    # NEW: Enhanced transaction data
    savings_pocket_name: Optional[str] = None
    is_main_account: Optional[bool] = None
    
    # NEW: Filtered fields based on user settings
    filtered_details: Optional[str] = None
    filtered_reference: Optional[str] = None
    filtered_payment_method: Optional[str] = None
    filtered_merchant_category: Optional[str] = None
    filtered_location: Optional[str] = None
    
    @classmethod
    def from_db_with_filter(cls, db_transaction, data_filter) -> 'Transaction':
        """Create transaction with filtered data based on user settings"""
        from ..schemas.user_settings import TransactionDataFilter
        
        # Base transaction data
        transaction_data = {
            'id': db_transaction.id,
            'user_id': db_transaction.user_id,
            'date': db_transaction.date,
            'amount': db_transaction.amount,
            'description': db_transaction.description,
            'source_account': db_transaction.source_account,
            'vendor_id': db_transaction.vendor_id,
            'category_id': db_transaction.category_id,
            'is_transfer': db_transaction.is_transfer,
            'confidence_score': db_transaction.confidence_score,
            'needs_review': db_transaction.needs_review,
            'created_at': db_transaction.created_at,
            'updated_at': db_transaction.updated_at,
            'details': db_transaction.details,
            'reference_number': db_transaction.reference_number,
            'payment_method': db_transaction.payment_method,
            'merchant_category': db_transaction.merchant_category,
            'location': db_transaction.location,
            'savings_pocket_id': db_transaction.savings_pocket_id
        }
        
        # Apply filtering based on user settings
        if data_filter.include_details:
            transaction_data['filtered_details'] = db_transaction.details
        if data_filter.include_references:
            transaction_data['filtered_reference'] = db_transaction.reference_number
        if data_filter.include_payment_methods:
            transaction_data['filtered_payment_method'] = db_transaction.payment_method
        if data_filter.include_merchant_categories:
            transaction_data['filtered_merchant_category'] = db_transaction.merchant_category
        if data_filter.include_locations:
            transaction_data['filtered_location'] = db_transaction.location
            
        return cls(**transaction_data)

class TransactionFilter(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    category_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None
    needs_review: Optional[bool] = None
    min_amount: Optional[Decimal] = None
    max_amount: Optional[Decimal] = None
    search: Optional[str] = None  # NEW: Full-text search parameter

class VendorSuggestion(BaseModel):
    vendor_id: str
    vendor_name: str
    category_id: str
    similarity: float
    normalized_pattern: str

class CategorizationResult(BaseModel):
    message: str
    similar_transactions_categorized: int
    vendor_created: str
    pattern_learned: str