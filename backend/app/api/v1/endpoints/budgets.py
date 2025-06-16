from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User
from app.schemas.budget import BudgetPeriodCreate, BudgetBulkUpdate
from app.services.budget import BudgetService
from datetime import date
from decimal import Decimal
import logging

# Set up logging for budget API
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/debug/current")
async def debug_current_budget(
    period: Optional[str] = Query(None, description="Period to debug (YYYY-MM-DD format, defaults to current month)"),
    db: Session = Depends(get_db)
):
    """Debug endpoint to check budget calculation without authentication"""
    logger.info("🔧 DEBUG: Budget debug endpoint called")
    
    # Get the first user for debugging
    from app.db.models import User
    user = db.query(User).first()
    
    if not user:
        logger.error("❌ DEBUG: No users found in database")
        return {"error": "No users found"}
    
    logger.info(f"🔧 DEBUG: Using user {user.id} ({user.email}) for debugging")
    budget_service = BudgetService(db, str(user.id))
    
    # Get budget for specified period or current budget
    if period:
        from datetime import datetime
        try:
            period_date = datetime.strptime(period, "%Y-%m-%d").date()
            logger.info(f"🔧 DEBUG: Using specified period {period_date}")
            result = budget_service.get_budget_for_period(period_date)
            debug_date = period_date
        except ValueError:
            logger.error(f"❌ DEBUG: Invalid date format: {period}")
            return {"error": f"Invalid date format: {period}. Use YYYY-MM-DD"}
    else:
        debug_date = date.today()
        logger.info(f"🔧 DEBUG: Current date is {debug_date}")
        result = budget_service.get_current_budget()
    logger.info(f"🔧 DEBUG: Budget result - total_budgeted: ${result.get('total_budgeted')}, total_spent: ${result.get('total_spent')}")
    
    return {
        "debug_info": {
            "user_id": str(user.id),
            "user_email": user.email,
            "current_date": debug_date.isoformat(),
            "budget_period": result.get("period")
        },
        "budget_data": result
    }

@router.get("/current")
async def get_current_budget(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    logger.info(f"🌟 API: Getting current budget for user {current_user.id}")
    budget_service = BudgetService(db, str(current_user.id))
    result = budget_service.get_current_budget()
    logger.info(f"📊 API Response: total_budgeted=${result.get('total_budgeted')}, total_spent=${result.get('total_spent')}, categories_count={len(result.get('categories', []))}")
    return result

@router.get("/period/{period}")
async def get_budget_for_period(
    period: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    logger.info(f"📅 API: Getting budget for period {period} for user {current_user.id}")
    budget_service = BudgetService(db, str(current_user.id))
    result = budget_service.get_budget_for_period(period)
    logger.info(f"📊 API Response: total_budgeted=${result.get('total_budgeted')}, total_spent=${result.get('total_spent')}, categories_count={len(result.get('categories', []))}")
    return result

@router.get("/comparison")
async def get_budget_comparison(
    current_period: date = Query(..., description="Current period to compare"),
    compare_period: date = Query(..., description="Period to compare against"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    return budget_service.get_budget_comparison(current_period, compare_period)

@router.get("/history")
async def get_budget_history(
    months: int = Query(6, description="Number of months of history to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    return budget_service.get_budget_history(months)

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

@router.post("/bulk-update")
async def bulk_update_budget(
    budget_updates: BudgetBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    
    result = budget_service.bulk_update_budget(
        period=budget_updates.period,
        budget_updates=budget_updates.updates
    )
    
    return {
        "message": f"Updated {result['updated_count']} budget categories for {result['period']}",
        **result
    }

@router.get("/period/{period}/grouped")
async def get_budget_for_period_grouped(
    period: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    return budget_service.get_budget_summary_with_groups(period)

@router.get("/current/grouped")
async def get_current_budget_grouped(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    budget_service = BudgetService(db, str(current_user.id))
    return budget_service.get_budget_summary_with_groups(date.today())

@router.post("/copy")
async def copy_budget(
    copy_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Copy budget settings from one period to another"""
    from datetime import datetime
    
    try:
        from_period = datetime.strptime(copy_data['from_period'], "%Y-%m-%d").date()
        to_period = datetime.strptime(copy_data['to_period'], "%Y-%m-%d").date()
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD: {str(e)}")
    
    logger.info(f"📋 Copying budget from {from_period} to {to_period} for user {current_user.id}")
    
    budget_service = BudgetService(db, str(current_user.id))
    
    try:
        result = budget_service.copy_budget(from_period, to_period)
        return {"message": f"Budget copied successfully from {from_period} to {to_period}", "copied_categories": result}
    except Exception as e:
        logger.error(f"❌ Error copying budget: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to copy budget: {str(e)}")