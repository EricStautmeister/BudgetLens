from typing import Optional, List
from pydantic import BaseModel
from app.schemas.transfer import TransferSettings

class UserPreferences(BaseModel):
    darkMode: bool = False
    language: str = "en"
    currencyFormat: str = "CHF ###,###.##"
    dashboardLayout: str = "default"
    
    class Config:
        orm_mode = True

class NotificationSettings(BaseModel):
    emailNotifications: bool = True
    budgetAlerts: bool = True
    lowBalanceAlerts: bool = True
    transferAlerts: bool = True
    securityAlerts: bool = True
    
    class Config:
        orm_mode = True

class GeneralSettings(BaseModel):
    user: UserPreferences
    notifications: NotificationSettings
    transfers: TransferSettings
    
    class Config:
        orm_mode = True
