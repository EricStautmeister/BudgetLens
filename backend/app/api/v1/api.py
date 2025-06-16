# backend/app/api/v1/api.py

from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, 
    transactions, 
    categories, 
    vendors, 
    budgets, 
    uploads, 
    accounts, 
    transfers,  # Make sure this is included
    upload_management,
    settings
)

api_router = APIRouter()

# Register all routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(transfers.router, prefix="/transfers", tags=["transfers"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(vendors.router, prefix="/vendors", tags=["vendors"])
api_router.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(upload_management.router, prefix="/upload-management", tags=["upload-management"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])