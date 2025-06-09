from fastapi import APIRouter
from app.api.v1.endpoints import auth, transactions, categories, vendors, budgets, uploads

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(vendors.router, prefix="/vendors", tags=["vendors"])
api_router.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])