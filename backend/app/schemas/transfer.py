# backend/app/schemas/transfer.py

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal

class TransferBase(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    amount: Decimal = Field(..., gt=0)
    date: date
    description: Optional[str] = None

    @field_validator('amount')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('amount must be greater than 0')
        return v

class TransferCreate(TransferBase):
    from_transaction_id: Optional[UUID] = None
    to_transaction_id: Optional[UUID] = None

class TransferUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    date: Optional[date] = None
    description: Optional[str] = None
    is_confirmed: Optional[bool] = None

    @field_validator('amount')
    @classmethod
    def validate_amount(cls, v):
        if v is not None and v <= 0:
            raise ValueError('amount must be greater than 0')
        return v

# Simple transfer schema without complex relationships to avoid recursion
class Transfer(BaseModel):
    id: UUID
    user_id: UUID
    from_account_id: UUID
    to_account_id: UUID
    from_transaction_id: Optional[UUID] = None
    to_transaction_id: Optional[UUID] = None
    amount: Decimal
    date: date
    description: Optional[str] = None
    is_confirmed: bool
    created_at: datetime
    # Simple name fields to avoid relationship recursion
    from_account_name: Optional[str] = None
    to_account_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class TransferDetectionResult(BaseModel):
    potential_transfers: List[Dict[str, Any]]  # Use Dict instead of complex schemas
    auto_matched: int
    manual_review_needed: int

class TransferMatchRequest(BaseModel):
    from_transaction_id: UUID
    to_transaction_id: UUID
    amount: Decimal

    @field_validator('amount')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('amount must be greater than 0')
        return v

# Transfer suggestion schema
class TransferSuggestion(BaseModel):
    from_transaction: Dict[str, Any]
    to_transaction: Dict[str, Any]
    confidence: float
    amount: float
    date_difference: int
    matched_rule: Optional[str] = None
    suggested_reason: Optional[str] = None

# Transfer rule schema for settings
class TransferRule(BaseModel):
    id: Optional[str] = None
    name: str
    pattern: str
    enabled: bool = True
    auto_confirm: bool = False
    allow_fees: bool = False
    max_fee_tolerance: float = 0.0
    description: str = ""

# Transfer settings schema
class TransferSettings(BaseModel):
    days_lookback: int = 7
    amount_tolerance: float = 0.50
    percentage_tolerance: float = 0.02
    confidence_threshold: float = 0.85
    enable_auto_matching: bool = True
    rules: List[TransferRule] = []