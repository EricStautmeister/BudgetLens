from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.api import deps
from app.schemas.settings import GeneralSettings, UserPreferences, NotificationSettings
from app.schemas.transfer import TransferSettings
from app.db.models import User
from app.services.transfer import get_transfer_settings, save_transfer_settings
from app.utils.validation import validate_rule_patterns

router = APIRouter()

# Default settings
DEFAULT_USER_PREFERENCES = UserPreferences()
DEFAULT_NOTIFICATION_SETTINGS = NotificationSettings()


@router.get("/", response_model=GeneralSettings)
async def get_settings(
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Get all user settings.
    """
    # Get transfer settings
    transfer_settings = get_transfer_settings(db, current_user)
    
    # Get user preferences from the database
    user_preferences = DEFAULT_USER_PREFERENCES
    if current_user.ui_preferences:
        # Merge saved preferences with defaults
        saved_prefs = current_user.ui_preferences
        user_preferences = UserPreferences(
            darkMode=saved_prefs.get('darkMode', DEFAULT_USER_PREFERENCES.darkMode),
            language=saved_prefs.get('language', DEFAULT_USER_PREFERENCES.language),
            currencyFormat=saved_prefs.get('currencyFormat', DEFAULT_USER_PREFERENCES.currencyFormat),
            dashboardLayout=saved_prefs.get('dashboardLayout', DEFAULT_USER_PREFERENCES.dashboardLayout)
        )
    
    # Get notification settings from the database
    notification_settings = DEFAULT_NOTIFICATION_SETTINGS
    if current_user.ui_preferences and 'notifications' in current_user.ui_preferences:
        # Merge saved notification settings with defaults
        saved_notifications = current_user.ui_preferences['notifications']
        notification_settings = NotificationSettings(
            emailNotifications=saved_notifications.get('emailNotifications', DEFAULT_NOTIFICATION_SETTINGS.emailNotifications),
            budgetAlerts=saved_notifications.get('budgetAlerts', DEFAULT_NOTIFICATION_SETTINGS.budgetAlerts),
            lowBalanceAlerts=saved_notifications.get('lowBalanceAlerts', DEFAULT_NOTIFICATION_SETTINGS.lowBalanceAlerts),
            transferAlerts=saved_notifications.get('transferAlerts', DEFAULT_NOTIFICATION_SETTINGS.transferAlerts),
            securityAlerts=saved_notifications.get('securityAlerts', DEFAULT_NOTIFICATION_SETTINGS.securityAlerts)
        )
    
    return GeneralSettings(
        user=user_preferences,
        notifications=notification_settings,
        transfers=transfer_settings
    )


@router.post("/")
async def save_settings(
    settings: GeneralSettings = Body(...),
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db),
) -> Dict[str, str]:
    """
    Save all user settings.
    """
    # Validate transfer rules
    for rule in settings.transfers.rules:
        if not validate_rule_patterns(rule.pattern):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid rule pattern: {rule.pattern}. Pattern must be a valid regex."
            )
    
    # Save transfer settings
    save_transfer_settings(db, current_user, settings.transfers)
    
    # Save user preferences to ui_preferences JSON field
    ui_preferences = current_user.ui_preferences or {}
    ui_preferences.update({
        'darkMode': settings.user.darkMode,
        'language': settings.user.language,
        'currencyFormat': settings.user.currencyFormat,
        'dashboardLayout': settings.user.dashboardLayout,
        'notifications': {
            'emailNotifications': settings.notifications.emailNotifications,
            'budgetAlerts': settings.notifications.budgetAlerts,
            'lowBalanceAlerts': settings.notifications.lowBalanceAlerts,
            'transferAlerts': settings.notifications.transferAlerts,
            'securityAlerts': settings.notifications.securityAlerts
        }
    })
    
    current_user.ui_preferences = ui_preferences
    db.commit()
    
    return {"message": "Settings saved successfully"}
