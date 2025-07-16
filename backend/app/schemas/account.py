from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from uuid import UUID
from enum import Enum

# Define AccountType enum directly here to avoid circular import
class AccountType(str, Enum):
    CHECKING = "CHECKING"
    SAVINGS = "SAVINGS"
    CREDIT_CARD = "CREDIT_CARD"
    INVESTMENT = "INVESTMENT"
    LOAN = "LOAN"

class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    account_type: AccountType
    institution: Optional[str] = Field(None, max_length=255)
    account_number_last4: Optional[str] = Field(None, min_length=4, max_length=4)
    currency: str = Field(default="CHF", max_length=3)
    is_active: bool = True
    is_default: bool = False
    
    # NEW: Enhanced account fields
    is_main_account: bool = False
    account_classification: str = Field(default="general", max_length=50)

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
    
    @field_validator('account_classification')
    @classmethod
    def validate_classification(cls, v):
        valid_classifications = ['main', 'savings', 'investment', 'checking', 'credit', 'general']
        if v not in valid_classifications:
            raise ValueError(f'account_classification must be one of: {valid_classifications}')
        return v

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
    is_main_account: Optional[bool] = None
    account_classification: Optional[str] = Field(None, max_length=50)

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

    @field_validator('account_classification')
    @classmethod
    def validate_classification(cls, v):
        if v is not None:
            valid_classifications = ['main', 'savings', 'investment', 'checking', 'credit', 'general']
            if v not in valid_classifications:
                raise ValueError(f'account_classification must be one of: {valid_classifications}')
        return v

class Account(AccountBase):
    id: UUID
    user_id: UUID
    balance: Decimal
    transaction_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Balance management schemas
class BalanceAdjustment(BaseModel):
    """Schema for manual balance adjustments"""
    adjustment_amount: Decimal = Field(..., description="Amount to adjust (positive or negative)")
    adjustment_type: str = Field(..., description="Type of adjustment")
    description: Optional[str] = Field(None, max_length=500, description="Description of the adjustment")
    
    @field_validator('adjustment_type')
    @classmethod
    def validate_adjustment_type(cls, v):
        valid_types = ['manual', 'correction', 'interest', 'fee', 'other']
        if v not in valid_types:
            raise ValueError(f'adjustment_type must be one of: {valid_types}')
        return v

class BalanceUpdate(BaseModel):
    """Schema for direct balance updates"""
    new_balance: Decimal = Field(..., description="New balance amount")
    description: Optional[str] = Field(None, max_length=500, description="Description of the update")

class AccountWithBalance(Account):
    """Enhanced account schema with balance information"""
    recent_transactions: Optional[List[dict]] = Field(default_factory=list)
    monthly_summary: Optional[dict] = None
    
class AccountSummary(BaseModel):
    """Summary information for accounts"""
    id: UUID
    name: str
    account_type: AccountType
    balance: Decimal
    currency: str
    is_active: bool
    is_main_account: bool
    account_classification: str
    transaction_count: int
    
    class Config:
        from_attributes = True

# Response schemas
class AccountResponse(BaseModel):
    """Standard account response"""
    account: Account
    message: str = "Account retrieved successfully"

class AccountListResponse(BaseModel):
    """List of accounts response"""
    accounts: List[Account]
    total_count: int
    message: str = "Accounts retrieved successfully"

class BalanceAdjustmentResponse(BaseModel):
    """Balance adjustment response"""
    account: Account
    adjustment: BalanceAdjustment
    old_balance: Decimal
    new_balance: Decimal
    message: str = "Balance adjusted successfully"
