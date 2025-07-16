from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    APP_NAME: str = "Personal Budgeting Tool"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str
    BUDGETLENS_DB_USER: Optional[str] = None
    BUDGETLENS_DB_PASSWORD: Optional[str] = None
    
    # Security
    SECRET_KEY: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Encryption
    ENCRYPTION_KEY: Optional[str] = None
    
    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"
    
    # File Upload
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_EXTENSIONS: set = {".csv"}
    
    # Environment
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()