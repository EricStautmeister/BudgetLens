from datetime import date, datetime
from typing import Dict, List, Optional
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.db.models import BudgetPeriod, Transaction, Category
import calendar

class BudgetService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def get_current_budget(self) -> Dict:
        """Get current month's budget overview"""
        today = date.today()
        period_start = date(today.year, today.month, 1)
        
        # Get budget periods for current month
        budget_periods = self.db.query(BudgetPeriod).filter(
            BudgetPeriod.user_id == self.user_id,
            BudgetPeriod.period == period_start
        ).all()
        
        result = {
            "period": period_start.isoformat(),
            "categories": [],
            "total_budgeted": Decimal("0.00"),
            "total_spent": Decimal("0.00"),
            "days_remaining": self._days_remaining_in_month()
        }
        
        for budget in budget_periods:
            # Calculate actual spent
            spent = self._calculate_spent(budget.category_id, period_start)
            
            # Calculate daily allowance
            remaining = budget.budgeted_amount - spent
            daily_allowance = remaining / result["days_remaining"] if result["days_remaining"] > 0 else Decimal("0.00")
            
            category_data = {
                "category_id": str(budget.category_id),
                "category_name": budget.category.name,
                "budgeted": float(budget.budgeted_amount),
                "spent": float(spent),
                "remaining": float(remaining),
                "daily_allowance": float(daily_allowance),
                "percentage_used": float((spent / budget.budgeted_amount * 100) if budget.budgeted_amount > 0 else 0),
                "is_automatic": budget.category.is_automatic_deduction,
                "is_savings": budget.category.is_savings
            }
            
            result["categories"].append(category_data)
            result["total_budgeted"] += budget.budgeted_amount
            result["total_spent"] += spent
        
        result["total_budgeted"] = float(result["total_budgeted"])
        result["total_spent"] = float(result["total_spent"])
        
        return result
    
    def calculate_daily_allowances(self) -> List[Dict]:
        """Calculate daily allowances for all categories"""
        budget = self.get_current_budget()
        
        allowances = []
        for category in budget["categories"]:
            if not category["is_automatic"] and not category["is_savings"]:
                allowances.append({
                    "category": category["category_name"],
                    "daily_allowance": category["daily_allowance"],
                    "total_remaining": category["remaining"]
                })
        
        return sorted(allowances, key=lambda x: x["daily_allowance"], reverse=True)
    
    def create_or_update_budget(self, period: date, category_id: str, amount: Decimal):
        """Create or update budget for a category and period"""
        budget = self.db.query(BudgetPeriod).filter(
            BudgetPeriod.user_id == self.user_id,
            BudgetPeriod.period == period,
            BudgetPeriod.category_id == category_id
        ).first()
        
        if budget:
            budget.budgeted_amount = amount
        else:
            budget = BudgetPeriod(
                user_id=self.user_id,
                period=period,
                category_id=category_id,
                budgeted_amount=amount
            )
            self.db.add(budget)
        
        self.db.commit()
        return budget
    
    def _calculate_spent(self, category_id: str, period_start: date) -> Decimal:
        """Calculate amount spent in category for period"""
        period_end = self._last_day_of_month(period_start)
        
        result = self.db.query(func.sum(Transaction.amount)).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_id == category_id,
            Transaction.date >= period_start,
            Transaction.date <= period_end
        ).scalar()
        
        return result or Decimal("0.00")
    
    def _days_remaining_in_month(self) -> int:
        """Calculate days remaining in current month"""
        today = date.today()
        last_day = self._last_day_of_month(today)
        return (last_day - today).days + 1
    
    def _last_day_of_month(self, any_day: date) -> date:
        """Get last day of month for given date"""
        last_day = calendar.monthrange(any_day.year, any_day.month)[1]
        return date(any_day.year, any_day.month, last_day)