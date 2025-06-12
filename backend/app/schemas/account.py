# backend/app/schemas/account.py - Fixed enum values to match database

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from uuid import UUID
from enum import Enum
from decimal import Decimal

class AccountType(str, Enum):
    CHECKING = "CHECKING"          # Changed from "checking" to "CHECKING"
    SAVINGS = "SAVINGS"            # Changed from "savings" to "SAVINGS"
    CREDIT_CARD = "CREDIT_CARD"    # Changed from "credit_card" to "CREDIT_CARD"
    INVESTMENT = "INVESTMENT"      # Changed from "investment" to "INVESTMENT"
    LOAN = "LOAN"                  # Changed from "loan" to "LOAN"

class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    account_type: AccountType
    institution: Optional[str] = Field(None, max_length=255)
    account_number_last4: Optional[str] = Field(None, min_length=4, max_length=4)
    currency: str = Field(default="CHF", max_length=3)
    is_active: bool = Field(default=True)
    is_default: bool = Field(default=False)

    @field_validator('account_number_last4')
    @classmethod
    def validate_account_number(cls, v):
        if v is not None and not v.isdigit():
            raise ValueError('account_number_last4 must contain only digits')
        return v

    @field_validator('currency')
    @classmethod
    def validate_currency(cls, v):
        return v.upper()

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    account_type: Optional[AccountType] = None
    institution: Optional[str] = Field(None, max_length=255)
    account_number_last4: Optional[str] = Field(None, min_length=4, max_length=4)
    currency: Optional[str] = Field(None, max_length=3)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

    @field_validator('account_number_last4')
    @classmethod
    def validate_account_number(cls, v):
        if v is not None and not v.isdigit():
            raise ValueError('account_number_last4 must contain only digits')
        return v

    @field_validator('currency')
    @classmethod
    def validate_currency(cls, v):
        if v is not None:
            return v.upper()
        return v

# Simple schema without relationships to avoid recursion
class Account(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    account_type: AccountType
    institution: Optional[str] = None
    account_number_last4: Optional[str] = None
    currency: str
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime
    # Optional calculated fields
    balance: Optional[float] = None
    transaction_count: Optional[int] = None
    
    class Config:
        from_attributes = True

class BalanceAdjustment(BaseModel):
    amount: Decimal = Field(..., description="Amount to adjust (positive for increase, negative for decrease)")
    description: Optional[str] = Field(None, max_length=255, description="Reason for adjustment")

class BalanceUpdate(BaseModel):
    new_balance: Decimal = Field(..., description="New balance to set")
    description: Optional[str] = Field(None, max_length=255, description="Reason for balance update")

# Add to existing Account schema
class AccountWithBalance(Account):
    current_balance: float
    can_edit_balance: bool = True