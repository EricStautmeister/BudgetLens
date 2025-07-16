# backend/app/api/v1/endpoints/user_settings.py - User settings API

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, UserSettings
from app.schemas.user_settings import (
    UserSettings as UserSettingsSchema,
    UserSettingsCreate,
    UserSettingsUpdate,
    TransactionDataFilter
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=UserSettingsSchema)
async def get_user_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get current user's settings"""
    
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        # Create default settings if none exist
        settings = UserSettings(
            user_id=current_user.id,
            **UserSettingsCreate().dict()
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings

@router.put("/", response_model=UserSettingsSchema)
async def update_user_settings(
    settings_data: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update user settings"""
    
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        # Create new settings if none exist
        settings = UserSettings(
            user_id=current_user.id,
            **UserSettingsCreate().dict()
        )
        db.add(settings)
        db.flush()  # To get the ID
    
    # Update fields
    update_data = settings_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)
    
    db.commit()
    db.refresh(settings)
    
    return settings

@router.get("/transaction-filter", response_model=TransactionDataFilter)
async def get_transaction_data_filter(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get transaction data filter based on user settings"""
    
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        # Return default filter if no settings
        return TransactionDataFilter()
    
    return TransactionDataFilter.from_user_settings(settings)

@router.post("/reset")
async def reset_user_settings(
    section: Optional[str] = None,  # "display", "transfer", "savings", or None for all
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Reset user settings to defaults"""
    
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == current_user.id
    ).first()
    
    if not settings:
        # Create default settings
        settings = UserSettings(
            user_id=current_user.id,
            **UserSettingsCreate().dict()
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return {"message": "Settings reset to defaults"}
    
    # Reset specific sections or all
    defaults = UserSettingsCreate()
    
    if section == "display" or section is None:
        settings.transaction_data_view = defaults.transaction_data_view
        settings.show_transaction_details = defaults.show_transaction_details
        settings.show_reference_numbers = defaults.show_reference_numbers
        settings.show_payment_methods = defaults.show_payment_methods
        settings.show_merchant_categories = defaults.show_merchant_categories
        settings.show_location_data = defaults.show_location_data
    
    if section == "transfer" or section is None:
        settings.transfer_detection_enabled = defaults.transfer_detection_enabled
        settings.auto_confirm_threshold = defaults.auto_confirm_threshold
        settings.transfer_pattern_learning = defaults.transfer_pattern_learning
    
    if section == "savings" or section is None:
        settings.default_savings_view = defaults.default_savings_view
        settings.show_savings_progress = defaults.show_savings_progress
    
    db.commit()
    db.refresh(settings)
    
    section_text = f"{section} settings" if section else "all settings"
    return {"message": f"Successfully reset {section_text} to defaults"}

@router.get("/presets", response_model=dict)
async def get_settings_presets():
    """Get predefined settings presets"""
    
    return {
        "minimal": {
            "transaction_data_view": "minimal",
            "show_transaction_details": False,
            "show_reference_numbers": False,
            "show_payment_methods": False,
            "show_merchant_categories": False,
            "show_location_data": False
        },
        "standard": {
            "transaction_data_view": "standard",
            "show_transaction_details": True,
            "show_reference_numbers": False,
            "show_payment_methods": True,
            "show_merchant_categories": False,
            "show_location_data": False
        },
        "detailed": {
            "transaction_data_view": "detailed",
            "show_transaction_details": True,
            "show_reference_numbers": True,
            "show_payment_methods": True,
            "show_merchant_categories": True,
            "show_location_data": True
        }
    }

@router.post("/apply-preset")
async def apply_settings_preset(
    preset_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Apply a settings preset"""
    
    presets = {
        "minimal": UserSettingsUpdate(
            transaction_data_view="minimal",
            show_transaction_details=False,
            show_reference_numbers=False,
            show_payment_methods=False,
            show_merchant_categories=False,
            show_location_data=False
        ),
        "standard": UserSettingsUpdate(
            transaction_data_view="standard",
            show_transaction_details=True,
            show_reference_numbers=False,
            show_payment_methods=True,
            show_merchant_categories=False,
            show_location_data=False
        ),
        "detailed": UserSettingsUpdate(
            transaction_data_view="detailed",
            show_transaction_details=True,
            show_reference_numbers=True,
            show_payment_methods=True,
            show_merchant_categories=True,
            show_location_data=True
        )
    }
    
    if preset_name not in presets:
        raise HTTPException(status_code=400, detail="Invalid preset name")
    
    # Apply the preset
    return await update_user_settings(presets[preset_name], db, current_user)
