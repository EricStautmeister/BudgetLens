from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from uuid import UUID
from typing import List

class BudgetPeriodCreate(BaseModel):
    period: date
    category_id: UUID
    budgeted_amount: Decimal

class BudgetPeriodUpdate(BaseModel):
    budgeted_amount: Decimal

class BudgetCategoryUpdate(BaseModel):
    category_id: str
    amount: Decimal

class BudgetBulkUpdate(BaseModel):
    period: date
    updates: List[BudgetCategoryUpdate]

class BudgetPeriod(BaseModel):
    id: UUID
    user_id: UUID
    period: date
    category_id: UUID
    budgeted_amount: Decimal
    actual_amount: Decimal
    rollover_amount: Decimal
    
    class Config:
        from_attributes = True