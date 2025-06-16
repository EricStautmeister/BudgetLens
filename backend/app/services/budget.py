from datetime import date, datetime
from typing import Dict, List, Optional
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from app.db.models import BudgetPeriod, Transaction, Category
import calendar
import logging

# Set up logging for budget calculations - make sure it's visible
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)  # Ensure INFO level is captured

class BudgetService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
    
    def get_budget_for_period(self, period: date) -> Dict:
        """Get budget overview for a specific period"""
        logger.info(f"🔍 Starting budget calculation for period: {period}, user_id: {self.user_id}")
        
        period_start = date(period.year, period.month, 1)
        logger.info(f"📅 Calculated period_start: {period_start}")
        
        # Get budget periods for specified month
        budget_periods = self.db.query(BudgetPeriod).filter(
            BudgetPeriod.user_id == self.user_id,
            BudgetPeriod.period == period_start
        ).all()
        
        logger.info(f"💰 Found {len(budget_periods)} budget periods for this month")
        for bp in budget_periods:
            logger.debug(f"  - Category {bp.category_id}: budgeted ${bp.budgeted_amount}")
        
        # Get all categories for the user
        all_categories = self.db.query(Category).filter(
            Category.user_id == self.user_id
        ).all()
        
        logger.info(f"📋 Found {len(all_categories)} total categories")
        category_types = {}
        for cat in all_categories:
            category_types[cat.category_type.value] = category_types.get(cat.category_type.value, 0) + 1
        logger.info(f"📊 Category breakdown: {category_types}")
        
        result = {
            "period": period_start.isoformat(),
            "categories": [],
            "total_budgeted": Decimal("0.00"),
            "total_spent": Decimal("0.00"),
            "days_remaining": self._days_remaining_in_period(period_start) if period_start.month == date.today().month and period_start.year == date.today().year else 0
        }
        
        logger.info(f"⏰ Days remaining in period: {result['days_remaining']}")
        
        # Create a map for existing budgets
        budget_map = {bp.category_id: bp for bp in budget_periods}
        
        categories_included_in_totals = []
        categories_excluded_from_totals = []
        
        for category in all_categories:
            budget = budget_map.get(category.id)
            budgeted_amount = budget.budgeted_amount if budget else Decimal("0.00")
            
            # Calculate actual spent
            spent = self._calculate_spent(category.id, period_start)
            
            logger.debug(f"🏷️  Category '{category.name}' ({category.category_type.value}): budgeted=${budgeted_amount}, spent=${spent}")
            
            # Calculate remaining and daily allowance
            remaining = budgeted_amount - spent
            daily_allowance = Decimal("0.00")
            if result["days_remaining"] > 0 and remaining > 0:
                daily_allowance = remaining / result["days_remaining"]
            
            category_data = {
                "category_id": str(category.id),
                "category_name": category.name,
                "category_type": category.category_type.value,
                "budgeted": float(budgeted_amount),
                "spent": float(spent),
                "remaining": float(remaining),
                "daily_allowance": float(daily_allowance),
                "percentage_used": float((spent / budgeted_amount * 100) if budgeted_amount > 0 else 0),
                "is_automatic": category.is_automatic_deduction,
                "is_savings": category.is_savings,
                "is_over_budget": spent > budgeted_amount if budgeted_amount > 0 else False
            }
            
            result["categories"].append(category_data)
            
            # Only include expense and saving categories in totals
            if category.category_type.value in ['EXPENSE', 'SAVING']:
                result["total_budgeted"] += budgeted_amount
                result["total_spent"] += spent
                categories_included_in_totals.append({
                    "name": category.name,
                    "type": category.category_type.value,
                    "budgeted": float(budgeted_amount),
                    "spent": float(spent)
                })
                logger.info(f"✅ INCLUDING '{category.name}' in total_spent: +${spent} (running total: ${result['total_spent']})")
            else:
                categories_excluded_from_totals.append({
                    "name": category.name,
                    "type": category.category_type.value,
                    "budgeted": float(budgeted_amount),
                    "spent": float(spent)
                })
                logger.info(f"❌ EXCLUDING '{category.name}' from total_spent: ${spent} (type: {category.category_type.value})")
        
        logger.info(f"📊 TOTAL CALCULATION SUMMARY:")
        logger.info(f"  Categories included in totals: {len(categories_included_in_totals)}")
        logger.info(f"  Categories excluded from totals: {len(categories_excluded_from_totals)}")
        
        total_budgeted_check = sum(cat["budgeted"] for cat in categories_included_in_totals)
        total_spent_check = sum(cat["spent"] for cat in categories_included_in_totals)
        
        logger.info(f"  Manual total budgeted check: ${total_budgeted_check}")
        logger.info(f"  Manual total spent check: ${total_spent_check}")
        logger.info(f"  Calculated total_budgeted: ${result['total_budgeted']}")
        logger.info(f"  Calculated total_spent: ${result['total_spent']}")
        
        if abs(float(result["total_budgeted"]) - total_budgeted_check) > 0.01:
            logger.warning(f"⚠️  MISMATCH in total_budgeted: calculated={result['total_budgeted']}, manual_check={total_budgeted_check}")
        
        if abs(float(result["total_spent"]) - total_spent_check) > 0.01:
            logger.warning(f"⚠️  MISMATCH in total_spent: calculated={result['total_spent']}, manual_check={total_spent_check}")
        
        result["total_budgeted"] = float(result["total_budgeted"])
        result["total_spent"] = float(result["total_spent"])
        
        logger.info(f"🏁 Final totals: budgeted=${result['total_budgeted']}, spent=${result['total_spent']}, remaining=${result['total_budgeted'] - result['total_spent']}")
        
        return result
    
    def get_current_budget(self) -> Dict:
        """Get current month's budget overview"""
        return self.get_budget_for_period(date.today())
    
    def get_budget_comparison(self, current_period: date, compare_period: date) -> Dict:
        """Compare two budget periods"""
        current_budget = self.get_budget_for_period(current_period)
        compare_budget = self.get_budget_for_period(compare_period)
        
        comparison = {
            "current_period": current_budget,
            "compare_period": compare_budget,
            "differences": {
                "total_budgeted_diff": current_budget["total_budgeted"] - compare_budget["total_budgeted"],
                "total_spent_diff": current_budget["total_spent"] - compare_budget["total_spent"],
                "categories": []
            }
        }
        
        # Create category comparison map
        current_cats = {cat["category_id"]: cat for cat in current_budget["categories"]}
        compare_cats = {cat["category_id"]: cat for cat in compare_budget["categories"]}
        
        for cat_id in set(list(current_cats.keys()) + list(compare_cats.keys())):
            current_cat = current_cats.get(cat_id, {"budgeted": 0, "spent": 0})
            compare_cat = compare_cats.get(cat_id, {"budgeted": 0, "spent": 0})
            
            comparison["differences"]["categories"].append({
                "category_id": cat_id,
                "category_name": current_cat.get("category_name") or compare_cat.get("category_name"),
                "budgeted_diff": current_cat["budgeted"] - compare_cat["budgeted"],
                "spent_diff": current_cat["spent"] - compare_cat["spent"],
                "current_budgeted": current_cat["budgeted"],
                "current_spent": current_cat["spent"],
                "compare_budgeted": compare_cat["budgeted"],
                "compare_spent": compare_cat["spent"]
            })
        
        return comparison
    
    def get_budget_history(self, months: int = 6) -> List[Dict]:
        """Get budget history for the last N months"""
        history = []
        current_date = date.today().replace(day=1)  # Start of current month
        
        for i in range(months):
            period_date = self._subtract_months(current_date, i)
            budget_data = self.get_budget_for_period(period_date)
            history.append(budget_data)
        
        return history
    
    def bulk_update_budget(self, period: date, budget_updates: List[Dict]) -> Dict:
        """Update multiple budget categories at once"""
        period_start = date(period.year, period.month, 1)
        updated_count = 0
        
        for update in budget_updates:
            # Handle both dict and Pydantic model formats
            if hasattr(update, 'category_id'):
                # Pydantic model
                category_id = update.category_id
                amount = Decimal(str(update.amount))
            else:
                # Dictionary
                category_id = update["category_id"]
                amount = Decimal(str(update["amount"]))
            
            budget = self.db.query(BudgetPeriod).filter(
                BudgetPeriod.user_id == self.user_id,
                BudgetPeriod.period == period_start,
                BudgetPeriod.category_id == category_id
            ).first()
            
            if budget:
                budget.budgeted_amount = amount
            else:
                budget = BudgetPeriod(
                    user_id=self.user_id,
                    period=period_start,
                    category_id=category_id,
                    budgeted_amount=amount
                )
                self.db.add(budget)
            
            updated_count += 1
        
        self.db.commit()
        return {"updated_count": updated_count, "period": period_start.isoformat()}
    
    def calculate_daily_allowances(self) -> List[Dict]:
        """Calculate daily allowances for all categories"""
        budget = self.get_current_budget()
        
        allowances = []
        for category in budget["categories"]:
            if not category["is_automatic"] and not category["is_savings"] and category["budgeted"] > 0:
                allowances.append({
                    "category": category["category_name"],
                    "daily_allowance": category["daily_allowance"],
                    "total_remaining": category["remaining"]
                })
        
        return sorted(allowances, key=lambda x: x["daily_allowance"], reverse=True)
    
    def create_or_update_budget(self, period: date, category_id: str, amount: Decimal):
        """Create or update budget for a category and period"""
        period_start = date(period.year, period.month, 1)
        
        budget = self.db.query(BudgetPeriod).filter(
            BudgetPeriod.user_id == self.user_id,
            BudgetPeriod.period == period_start,
            BudgetPeriod.category_id == category_id
        ).first()
        
        if budget:
            budget.budgeted_amount = amount
        else:
            budget = BudgetPeriod(
                user_id=self.user_id,
                period=period_start,
                category_id=category_id,
                budgeted_amount=amount
            )
            self.db.add(budget)
        
        self.db.commit()
        return budget
    
    def _calculate_spent(self, category_id: str, period_start: date) -> Decimal:
        """Calculate amount spent/earned in category for period"""
        period_end = self._last_day_of_month(period_start)
        
        logger.debug(f"💸 Calculating spent for category {category_id} from {period_start} to {period_end}")
        
        # Get the category to determine if it's income or expense
        category = self.db.query(Category).filter(Category.id == category_id).first()
        if not category:
            logger.warning(f"⚠️  Category {category_id} not found!")
            return Decimal("0.00")
        
        logger.debug(f"📊 Category '{category.name}' type: {category.category_type.value}")
        
        # Count all transactions for this category in the period for debugging
        all_transactions = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.category_id == category_id,
            Transaction.date >= period_start,
            Transaction.date <= period_end
        ).all()
        
        logger.debug(f"🔍 Found {len(all_transactions)} transactions for category '{category.name}' in period {period_start} to {period_end}")
        
        if all_transactions:
            logger.info(f"📋 Transactions for category '{category.name}' ({category.category_type.value}):")
            for i, transaction in enumerate(all_transactions, 1):
                logger.info(f"  {i}. ID: {transaction.id} | Date: {transaction.date} | Amount: ${transaction.amount} | Desc: '{transaction.description[:50]}'")
        else:
            logger.info(f"📋 No transactions found for category '{category.name}' in period {period_start} to {period_end}")
        
        # For income categories, sum positive amounts; for expenses, sum negative amounts
        if category.category_type.value == 'INCOME':
            positive_transactions = [t for t in all_transactions if t.amount > 0]
            logger.debug(f"💰 Income category '{category.name}': {len(positive_transactions)} positive transactions")
            
            result = self.db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == self.user_id,
                Transaction.category_id == category_id,
                Transaction.date >= period_start,
                Transaction.date <= period_end,
                Transaction.amount > 0  # Income is positive
            ).scalar()
            
            final_result = result if result else Decimal("0.00")
            logger.debug(f"💰 Income category '{category.name}' total: ${final_result}")
            return final_result
        else:
            negative_transactions = [t for t in all_transactions if t.amount < 0]
            logger.debug(f"💳 Expense/Saving category '{category.name}': {len(negative_transactions)} negative transactions")
            
            result = self.db.query(func.sum(Transaction.amount)).filter(
                Transaction.user_id == self.user_id,
                Transaction.category_id == category_id,
                Transaction.date >= period_start,
                Transaction.date <= period_end,
                Transaction.amount < 0  # Expenses are negative
            ).scalar()
            
            final_result = abs(result) if result else Decimal("0.00")
            logger.debug(f"💳 Expense/Saving category '{category.name}' total: ${final_result}")
            return final_result
    
    def _days_remaining_in_period(self, period_start: date) -> int:
        """Calculate days remaining in the given month"""
        if period_start.month != date.today().month or period_start.year != date.today().year:
            return 0  # Past/future months
        
        today = date.today()
        last_day = self._last_day_of_month(period_start)
        return (last_day - today).days + 1
    
    def _days_remaining_in_month(self) -> int:
        """Calculate days remaining in current month"""
        return self._days_remaining_in_period(date.today().replace(day=1))
    
    def _last_day_of_month(self, any_day: date) -> date:
        """Get last day of month for given date"""
        last_day = calendar.monthrange(any_day.year, any_day.month)[1]
        return date(any_day.year, any_day.month, last_day)
    
    def _subtract_months(self, current_date: date, months: int) -> date:
        """Subtract months from a date"""
        year = current_date.year
        month = current_date.month - months
        
        while month <= 0:
            month += 12
            year -= 1
            
        return date(year, month, 1)
    
    def get_budget_summary_with_groups(self, period: date) -> Dict:
        """Get budget overview with hierarchical grouping and income allocation"""
        budget_data = self.get_budget_for_period(period)
        
        # Get category hierarchy
        categories = self.db.query(Category).filter(
            Category.user_id == self.user_id
        ).all()
        
        # Build category lookup and hierarchy
        category_lookup = {str(cat.id): cat for cat in categories}
        parent_categories = [cat for cat in categories if cat.parent_category_id is None]
        
        grouped_budget = {
            "period": budget_data["period"],
            "days_remaining": budget_data["days_remaining"],
            "summary": {
                "total_income_budgeted": Decimal("0.00"),
                "total_income_actual": Decimal("0.00"),
                "total_expense_budgeted": Decimal("0.00"),
                "total_expense_actual": Decimal("0.00"),
                "total_savings_budgeted": Decimal("0.00"),
                "total_savings_actual": Decimal("0.00"),
                "unallocated_income": Decimal("0.00")
            },
            "groups": []
        }
        
        # Create category lookup from budget data
        budget_category_lookup = {cat["category_id"]: cat for cat in budget_data["categories"]}
        
        # Process each parent category
        for parent_cat in parent_categories:
            # Get children categories
            children = [cat for cat in categories if cat.parent_category_id == parent_cat.id]
            
            group = {
                "category_id": str(parent_cat.id),
                "category_name": parent_cat.name,
                "category_type": parent_cat.category_type.value,
                "is_parent": True,
                "total_budgeted": Decimal("0.00"),
                "total_actual": Decimal("0.00"),
                "children": []
            }
            
            # Add parent category data if it has budget
            if str(parent_cat.id) in budget_category_lookup:
                parent_budget = budget_category_lookup[str(parent_cat.id)]
                group.update({
                    "budgeted": parent_budget["budgeted"],
                    "spent": parent_budget["spent"],
                    "remaining": parent_budget["remaining"],
                    "percentage_used": parent_budget["percentage_used"],
                    "is_over_budget": parent_budget["is_over_budget"]
                })
                group["total_budgeted"] += Decimal(str(parent_budget["budgeted"]))
                group["total_actual"] += Decimal(str(parent_budget["spent"]))
            
            # Process children
            for child_cat in children:
                if str(child_cat.id) in budget_category_lookup:
                    child_budget = budget_category_lookup[str(child_cat.id)]
                    child_data = {
                        "category_id": str(child_cat.id),
                        "category_name": child_cat.name,
                        "category_type": child_cat.category_type.value,
                        "is_parent": False,
                        "budgeted": child_budget["budgeted"],
                        "spent": child_budget["spent"],
                        "remaining": child_budget["remaining"],
                        "percentage_used": child_budget["percentage_used"],
                        "is_over_budget": child_budget["is_over_budget"],
                        "daily_allowance": child_budget["daily_allowance"]
                    }
                    group["children"].append(child_data)
                    group["total_budgeted"] += Decimal(str(child_budget["budgeted"]))
                    group["total_actual"] += Decimal(str(child_budget["spent"]))
            
            # Convert totals to float
            group["total_budgeted"] = float(group["total_budgeted"])
            group["total_actual"] = float(group["total_actual"])
            
            # Update summary totals
            if parent_cat.category_type.value == 'INCOME':
                grouped_budget["summary"]["total_income_budgeted"] += Decimal(str(group["total_budgeted"]))
                grouped_budget["summary"]["total_income_actual"] += Decimal(str(group["total_actual"]))
            elif parent_cat.category_type.value == 'EXPENSE':
                grouped_budget["summary"]["total_expense_budgeted"] += Decimal(str(group["total_budgeted"]))
                grouped_budget["summary"]["total_expense_actual"] += Decimal(str(group["total_actual"]))
            elif parent_cat.category_type.value == 'SAVING':
                grouped_budget["summary"]["total_savings_budgeted"] += Decimal(str(group["total_budgeted"]))
                grouped_budget["summary"]["total_savings_actual"] += Decimal(str(group["total_actual"]))
            
            grouped_budget["groups"].append(group)
        
        # Calculate unallocated income
        grouped_budget["summary"]["unallocated_income"] = (
            grouped_budget["summary"]["total_income_budgeted"] - 
            grouped_budget["summary"]["total_expense_budgeted"] - 
            grouped_budget["summary"]["total_savings_budgeted"]
        )
        
        # Convert summary to float
        for key in grouped_budget["summary"]:
            if isinstance(grouped_budget["summary"][key], Decimal):
                grouped_budget["summary"][key] = float(grouped_budget["summary"][key])
        
        return grouped_budget

    def copy_budget(self, from_period: date, to_period: date) -> int:
        """Copy budget settings from one period to another"""
        logger.info(f"📋 Copying budget from {from_period} to {to_period} for user {self.user_id}")
        
        # Normalize to month start dates
        from_start = date(from_period.year, from_period.month, 1)
        to_start = date(to_period.year, to_period.month, 1)
        
        logger.info(f"📅 Normalized periods: from {from_start} to {to_start}")
        
        # Get source budget periods
        source_budgets = self.db.query(BudgetPeriod).filter(
            BudgetPeriod.user_id == self.user_id,
            BudgetPeriod.period == from_start
        ).all()
        
        logger.info(f"💰 Found {len(source_budgets)} budget entries to copy")
        
        if not source_budgets:
            logger.warning(f"⚠️ No budget data found for period {from_start}")
            return 0
        
        # Delete existing budget periods for target period
        deleted_count = self.db.query(BudgetPeriod).filter(
            BudgetPeriod.user_id == self.user_id,
            BudgetPeriod.period == to_start
        ).delete()
        
        logger.info(f"🗑️ Deleted {deleted_count} existing budget entries for target period")
        
        # Copy budget entries
        copied_count = 0
        for source_budget in source_budgets:
            new_budget = BudgetPeriod(
                user_id=self.user_id,
                category_id=source_budget.category_id,
                period=to_start,
                budgeted_amount=source_budget.budgeted_amount
            )
            self.db.add(new_budget)
            copied_count += 1
            logger.debug(f"📝 Copied budget: Category {source_budget.category_id}, Amount ${source_budget.budgeted_amount}")
        
        # Commit the changes
        self.db.commit()
        
        logger.info(f"✅ Successfully copied {copied_count} budget entries from {from_start} to {to_start}")
        return copied_count