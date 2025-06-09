from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Vendor
from app.schemas.vendor import Vendor as VendorSchema, VendorCreate, VendorUpdate
from app.services.categorization import CategorizationService
from uuid import UUID

router = APIRouter()

@router.get("/", response_model=List[VendorSchema])
async def list_vendors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    vendors = db.query(Vendor).filter(
        Vendor.user_id == current_user.id
    ).order_by(Vendor.name).all()
    
    return vendors

@router.post("/", response_model=VendorSchema)
async def create_vendor(
    vendor_in: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    vendor = Vendor(
        user_id=current_user.id,
        **vendor_in.dict()
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    
    return vendor

@router.put("/{vendor_id}", response_model=VendorSchema)
async def update_vendor(
    vendor_id: UUID,
    vendor_update: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    vendor = db.query(Vendor).filter(
        Vendor.id == vendor_id,
        Vendor.user_id == current_user.id
    ).first()
    
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    for field, value in vendor_update.dict(exclude_unset=True).items():
        setattr(vendor, field, value)
    
    db.commit()
    db.refresh(vendor)
    
    return vendor

@router.delete("/{vendor_id}")
async def delete_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    vendor = db.query(Vendor).filter(
        Vendor.id == vendor_id,
        Vendor.user_id == current_user.id
    ).first()
    
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    db.delete(vendor)
    db.commit()
    
    return {"message": "Vendor deleted successfully"}

@router.post("/learn")
async def learn_vendor(
    transaction_id: str,
    vendor_name: str,
    category_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    categorization_service = CategorizationService(db, str(current_user.id))
    
    try:
        categorization_service.learn_vendor(transaction_id, vendor_name, category_id)
        return {"message": "Vendor learned successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))