# backend/app/schemas/savings_pocket.py - Schemas for savings pockets

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal

class SavingsPocketBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    target_amount: Optional[Decimal] = None
    current_amount: Decimal = Field(default=Decimal('0'))
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    icon: Optional[str] = Field(None, max_length=50)
    sort_order: int = Field(default=0)

class SavingsPocketCreate(SavingsPocketBase):
    account_id: UUID

class SavingsPocketUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    target_amount: Optional[Decimal] = None
    current_amount: Optional[Decimal] = None
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    icon: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

class SavingsPocket(SavingsPocketBase):
    id: UUID
    user_id: UUID
    account_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    # Optional: Include related data
    account_name: Optional[str] = None
    progress_percentage: Optional[float] = None
    transaction_count: Optional[int] = None

    class Config:
        from_attributes = True

class SavingsPocketWithTransactions(SavingsPocket):
    """Enhanced schema with transaction data"""
    recent_transactions: List[dict] = Field(default_factory=list)
    monthly_activity: List[dict] = Field(default_factory=list)
    
class SavingsPocketSummary(BaseModel):
    """Summary view for dashboard"""
    id: UUID
    name: str
    account_name: str
    current_amount: Decimal
    target_amount: Optional[Decimal]
    progress_percentage: float
    color: Optional[str]
    icon: Optional[str]
    
    class Config:
        from_attributes = True
