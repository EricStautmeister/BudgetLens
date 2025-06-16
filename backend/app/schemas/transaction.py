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

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    vendor_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    vendor_name: Optional[str] = None  # For learning new vendors
    is_transfer: Optional[bool] = None

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

class TransactionFilter(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    category_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None
    needs_review: Optional[bool] = None
    min_amount: Optional[Decimal] = None
    max_amount: Optional[Decimal] = None

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