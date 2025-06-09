from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class CategoryBase(BaseModel):
    name: str
    parent_category_id: Optional[UUID] = None
    is_automatic_deduction: bool = False
    is_savings: bool = False

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_category_id: Optional[UUID] = None
    is_automatic_deduction: Optional[bool] = None
    is_savings: Optional[bool] = None

class CategoryInDB(CategoryBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

class Category(CategoryInDB):
    pass