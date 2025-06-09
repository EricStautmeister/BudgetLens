from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User
from app.schemas.budget import BudgetPeriodCreate
from app.services.budget import BudgetService
from datetime import date
from decimal import Decimal

router = APIRouter()

@router.get("/current")
async def get_current_budget(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    return budget_service.get_current_budget()

@router.get("/daily-allowances")
async def get_daily_allowances(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    return budget_service.calculate_daily_allowances()

@router.post("/period")
async def create_or_update_budget_period(
    budget_in: BudgetPeriodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    
    budget = budget_service.create_or_update_budget(
        period=budget_in.period,
        category_id=str(budget_in.category_id),
        amount=budget_in.budgeted_amount
    )
    
    return {"message": "Budget updated successfully", "budget_id": str(budget.id)}