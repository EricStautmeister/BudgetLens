# backend/app/schemas/user_settings.py - User settings schemas

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserSettingsBase(BaseModel):
    # Data display preferences
    transaction_data_view: str = Field(default="standard", pattern=r'^(minimal|standard|detailed)$')
    show_transaction_details: bool = Field(default=True)
    show_reference_numbers: bool = Field(default=False)
    show_payment_methods: bool = Field(default=True)
    show_merchant_categories: bool = Field(default=False)
    show_location_data: bool = Field(default=False)
    
    # Transfer detection settings
    transfer_detection_enabled: bool = Field(default=True)
    auto_confirm_threshold: float = Field(default=0.9, ge=0.0, le=1.0)
    transfer_pattern_learning: bool = Field(default=True)
    
    # Savings system settings
    default_savings_view: str = Field(default="by_account", pattern=r'^(by_account|by_category|unified)$')
    show_savings_progress: bool = Field(default=True)

class UserSettingsCreate(UserSettingsBase):
    pass

class UserSettingsUpdate(BaseModel):
    # Data display preferences
    transaction_data_view: Optional[str] = Field(None, pattern=r'^(minimal|standard|detailed)$')
    show_transaction_details: Optional[bool] = None
    show_reference_numbers: Optional[bool] = None
    show_payment_methods: Optional[bool] = None
    show_merchant_categories: Optional[bool] = None
    show_location_data: Optional[bool] = None
    
    # Transfer detection settings
    transfer_detection_enabled: Optional[bool] = None
    auto_confirm_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    transfer_pattern_learning: Optional[bool] = None
    
    # Savings system settings
    default_savings_view: Optional[str] = Field(None, pattern=r'^(by_account|by_category|unified)$')
    show_savings_progress: Optional[bool] = None

class UserSettings(UserSettingsBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TransactionDataFilter(BaseModel):
    """Filter for controlling transaction data display"""
    view_mode: str = Field(default="standard", pattern=r'^(minimal|standard|detailed)$')
    include_details: bool = Field(default=True)
    include_references: bool = Field(default=False)
    include_payment_methods: bool = Field(default=True)
    include_merchant_categories: bool = Field(default=False)
    include_locations: bool = Field(default=False)
    include_processing_notes: bool = Field(default=False)
    
    @classmethod
    def from_user_settings(cls, settings: UserSettings) -> 'TransactionDataFilter':
        """Create filter from user settings"""
        return cls(
            view_mode=settings.transaction_data_view,
            include_details=settings.show_transaction_details,
            include_references=settings.show_reference_numbers,
            include_payment_methods=settings.show_payment_methods,
            include_merchant_categories=settings.show_merchant_categories,
            include_locations=settings.show_location_data,
            include_processing_notes=False  # Default to false for security
        )
