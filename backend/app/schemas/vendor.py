from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class VendorBase(BaseModel):
    name: str
    patterns: List[str]
    default_category_id: UUID
    confidence_threshold: float = 0.8

class VendorCreate(VendorBase):
    pass

class VendorUpdate(BaseModel):
    name: Optional[str] = None
    patterns: Optional[List[str]] = None
    default_category_id: Optional[UUID] = None
    confidence_threshold: Optional[float] = None

class VendorInDB(VendorBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

class Vendor(VendorInDB):
    pass