from fastapi import APIRouter
from app.api.v1.endpoints import auth, transactions, categories, vendors, budgets, uploads, accounts, transfers

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])  # NEW
api_router.include_router(transfers.router, prefix="/transfers", tags=["transfers"])  # NEW
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(vendors.router, prefix="/vendors", tags=["vendors"])
api_router.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])

# Add upload management endpoints to the uploads router
from app.api.v1.endpoints.upload_management import router as upload_mgmt_router
api_router.include_router(upload_mgmt_router, prefix="/upload-management", tags=["upload-management"])