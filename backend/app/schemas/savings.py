# backend/app/schemas/savings.py - Schemas for savings account mappings

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal

class SavingsAccountMappingBase(BaseModel):
    savings_category_id: UUID
    account_id: UUID
    target_amount: Optional[Decimal] = None
    current_amount: Decimal = Field(default=Decimal('0'))

class SavingsAccountMappingCreate(SavingsAccountMappingBase):
    pass

class SavingsAccountMappingUpdate(BaseModel):
    account_id: Optional[UUID] = None
    target_amount: Optional[Decimal] = None
    current_amount: Optional[Decimal] = None
    is_active: Optional[bool] = None

class SavingsAccountMapping(SavingsAccountMappingBase):
    id: UUID
    user_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Optional: Include related data
    savings_category_name: Optional[str] = None
    account_name: Optional[str] = None

    class Config:
        from_attributes = True

class TransferAllocationBase(BaseModel):
    transfer_id: UUID
    allocated_category_id: Optional[UUID] = None
    allocated_pocket_id: Optional[UUID] = None  # NEW: Direct pocket allocation
    allocated_amount: Decimal
    allocation_type: str = Field(default="manual")
    description: Optional[str] = None
    
    # NEW: Enhanced allocation fields
    auto_confirmed: bool = Field(default=False)
    confidence_score: Optional[float] = None

class TransferAllocationCreate(TransferAllocationBase):
    pass

class TransferAllocationUpdate(BaseModel):
    allocated_category_id: Optional[UUID] = None
    allocated_pocket_id: Optional[UUID] = None  # NEW: Direct pocket allocation
    allocated_amount: Optional[Decimal] = None
    allocation_type: Optional[str] = None
    description: Optional[str] = None
    
    # NEW: Enhanced allocation fields
    auto_confirmed: Optional[bool] = None
    confidence_score: Optional[float] = None

class TransferAllocation(TransferAllocationBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    # Optional: Include related data
    category_name: Optional[str] = None
    pocket_name: Optional[str] = None  # NEW: Pocket name
    transfer_description: Optional[str] = None

    class Config:
        from_attributes = True

# Enhanced transfer schema to include allocations
class TransferWithAllocations(BaseModel):
    id: UUID
    user_id: UUID
    from_account_id: UUID
    to_account_id: UUID
    amount: Decimal
    date: datetime
    description: Optional[str] = None
    is_confirmed: bool
    
    # Account information
    from_account_name: Optional[str] = None
    to_account_name: Optional[str] = None
    
    # Allocation information
    allocations: List[TransferAllocation] = Field(default_factory=list)
    total_allocated: Decimal = Field(default=Decimal('0'))
    remaining_unallocated: Decimal = Field(default=Decimal('0'))
    
    # Metadata
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
