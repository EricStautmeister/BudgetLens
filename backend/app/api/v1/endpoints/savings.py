# backend/app/api/v1/endpoints/savings.py - Savings account mapping and transfer allocation endpoints

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, SavingsAccountMapping, TransferAllocation, Category, Account, Transfer, CategoryType
from app.schemas.savings import (
    SavingsAccountMapping as SavingsAccountMappingSchema,
    SavingsAccountMappingCreate,
    SavingsAccountMappingUpdate,
    TransferAllocation as TransferAllocationSchema,
    TransferAllocationCreate,
    TransferAllocationUpdate,
    TransferWithAllocations
)
from uuid import UUID
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)
router = APIRouter()

# Savings Account Mapping Endpoints

@router.get("/mappings", response_model=List[SavingsAccountMappingSchema])
async def list_savings_mappings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all savings account mappings for the current user"""
    mappings = db.query(SavingsAccountMapping).filter(
        SavingsAccountMapping.user_id == current_user.id,
        SavingsAccountMapping.is_active == True
    ).options(
        joinedload(SavingsAccountMapping.savings_category),
        joinedload(SavingsAccountMapping.account)
    ).all()
    
    result = []
    for mapping in mappings:
        mapping_dict = SavingsAccountMappingSchema.from_orm(mapping).dict()
        mapping_dict['savings_category_name'] = mapping.savings_category.name if mapping.savings_category else None
        mapping_dict['account_name'] = mapping.account.name if mapping.account else None
        result.append(SavingsAccountMappingSchema(**mapping_dict))
    
    return result

@router.post("/mappings", response_model=SavingsAccountMappingSchema)
async def create_savings_mapping(
    mapping_data: SavingsAccountMappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new savings account mapping"""
    
    # Verify the category exists and is a savings category
    category = db.query(Category).filter(
        Category.id == mapping_data.savings_category_id,
        Category.user_id == current_user.id,
        Category.category_type == CategoryType.SAVING
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Savings category not found")
    
    # Verify the account exists
    account = db.query(Account).filter(
        Account.id == mapping_data.account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check if mapping already exists
    existing = db.query(SavingsAccountMapping).filter(
        SavingsAccountMapping.user_id == current_user.id,
        SavingsAccountMapping.savings_category_id == mapping_data.savings_category_id,
        SavingsAccountMapping.account_id == mapping_data.account_id
    ).first()
    
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="Mapping already exists")
        else:
            # Reactivate existing mapping
            existing.is_active = True
            existing.target_amount = mapping_data.target_amount
            existing.current_amount = mapping_data.current_amount
            db.commit()
            db.refresh(existing)
            return existing
    
    # Create new mapping
    mapping = SavingsAccountMapping(
        user_id=current_user.id,
        **mapping_data.dict()
    )
    
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    
    return mapping

@router.put("/mappings/{mapping_id}", response_model=SavingsAccountMappingSchema)
async def update_savings_mapping(
    mapping_id: UUID,
    mapping_data: SavingsAccountMappingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a savings account mapping"""
    
    mapping = db.query(SavingsAccountMapping).filter(
        SavingsAccountMapping.id == mapping_id,
        SavingsAccountMapping.user_id == current_user.id
    ).first()
    
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    # Update fields
    update_data = mapping_data.dict(exclude_unset=True)
    
    # Verify account if being updated
    if 'account_id' in update_data:
        account = db.query(Account).filter(
            Account.id == update_data['account_id'],
            Account.user_id == current_user.id
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
    
    for field, value in update_data.items():
        setattr(mapping, field, value)
    
    db.commit()
    db.refresh(mapping)
    
    return mapping

@router.delete("/mappings/{mapping_id}")
async def delete_savings_mapping(
    mapping_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete (deactivate) a savings account mapping"""
    
    mapping = db.query(SavingsAccountMapping).filter(
        SavingsAccountMapping.id == mapping_id,
        SavingsAccountMapping.user_id == current_user.id
    ).first()
    
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    mapping.is_active = False
    db.commit()
    
    return {"message": "Mapping deleted successfully"}

# Transfer Allocation Endpoints

@router.get("/transfers/unallocated", response_model=List[TransferWithAllocations])
async def list_unallocated_transfers(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get transfers that need allocation review"""
    
    # Get transfers with their allocations
    transfers_query = db.query(Transfer).filter(
        Transfer.user_id == current_user.id
    ).options(
        joinedload(Transfer.allocations),
        joinedload(Transfer.from_account),
        joinedload(Transfer.to_account)
    ).order_by(Transfer.date.desc())
    
    transfers = transfers_query.offset(offset).limit(limit).all()
    
    result = []
    for transfer in transfers:
        # Calculate allocation amounts
        total_allocated = sum(alloc.allocated_amount for alloc in transfer.allocations)
        remaining_unallocated = transfer.amount - total_allocated
        
        transfer_dict = {
            'id': transfer.id,
            'user_id': transfer.user_id,
            'from_account_id': transfer.from_account_id,
            'to_account_id': transfer.to_account_id,
            'amount': transfer.amount,
            'date': transfer.date,
            'description': transfer.description,
            'is_confirmed': transfer.is_confirmed,
            'from_account_name': transfer.from_account.name if transfer.from_account else None,
            'to_account_name': transfer.to_account.name if transfer.to_account else None,
            'allocations': [TransferAllocationSchema.from_orm(alloc) for alloc in transfer.allocations],
            'total_allocated': total_allocated,
            'remaining_unallocated': remaining_unallocated,
            'created_at': transfer.created_at,
            'updated_at': transfer.updated_at
        }
        
        result.append(TransferWithAllocations(**transfer_dict))
    
    return result

@router.get("/transfers/{transfer_id}/allocations", response_model=List[TransferAllocationSchema])
async def get_transfer_allocations(
    transfer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get allocations for a specific transfer"""
    
    allocations = db.query(TransferAllocation).filter(
        TransferAllocation.transfer_id == transfer_id,
        TransferAllocation.user_id == current_user.id
    ).options(
        joinedload(TransferAllocation.allocated_category)
    ).all()
    
    result = []
    for allocation in allocations:
        allocation_dict = TransferAllocationSchema.from_orm(allocation).dict()
        allocation_dict['category_name'] = allocation.allocated_category.name if allocation.allocated_category else None
        result.append(TransferAllocationSchema(**allocation_dict))
    
    return result

@router.post("/transfers/{transfer_id}/allocations", response_model=TransferAllocationSchema)
async def create_transfer_allocation(
    transfer_id: UUID,
    allocation_data: TransferAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new transfer allocation"""
    
    # Verify the transfer exists
    transfer = db.query(Transfer).filter(
        Transfer.id == transfer_id,
        Transfer.user_id == current_user.id
    ).first()
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    # Override transfer_id from URL
    allocation_data.transfer_id = transfer_id
    
    # Verify the category exists if provided
    if allocation_data.allocated_category_id:
        category = db.query(Category).filter(
            Category.id == allocation_data.allocated_category_id,
            Category.user_id == current_user.id
        ).first()
        
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if this would over-allocate the transfer
    existing_allocations = db.query(TransferAllocation).filter(
        TransferAllocation.transfer_id == transfer_id,
        TransferAllocation.user_id == current_user.id
    ).all()
    
    total_existing = sum(alloc.allocated_amount for alloc in existing_allocations)
    if total_existing + allocation_data.allocated_amount > transfer.amount:
        raise HTTPException(
            status_code=400, 
            detail=f"Allocation would exceed transfer amount. Available: {transfer.amount - total_existing}"
        )
    
    # Create allocation
    allocation = TransferAllocation(
        user_id=current_user.id,
        **allocation_data.dict()
    )
    
    db.add(allocation)
    db.commit()
    db.refresh(allocation)
    
    return allocation

@router.put("/allocations/{allocation_id}", response_model=TransferAllocationSchema)
async def update_transfer_allocation(
    allocation_id: UUID,
    allocation_data: TransferAllocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a transfer allocation"""
    
    allocation = db.query(TransferAllocation).filter(
        TransferAllocation.id == allocation_id,
        TransferAllocation.user_id == current_user.id
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Verify category if being updated
    update_data = allocation_data.dict(exclude_unset=True)
    if 'allocated_category_id' in update_data and update_data['allocated_category_id']:
        category = db.query(Category).filter(
            Category.id == update_data['allocated_category_id'],
            Category.user_id == current_user.id
        ).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if amount update would over-allocate
    if 'allocated_amount' in update_data:
        transfer = db.query(Transfer).filter(Transfer.id == allocation.transfer_id).first()
        other_allocations = db.query(TransferAllocation).filter(
            TransferAllocation.transfer_id == allocation.transfer_id,
            TransferAllocation.id != allocation_id,
            TransferAllocation.user_id == current_user.id
        ).all()
        
        total_other = sum(alloc.allocated_amount for alloc in other_allocations)
        if total_other + update_data['allocated_amount'] > transfer.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Allocation would exceed transfer amount. Available: {transfer.amount - total_other}"
            )
    
    # Update allocation
    for field, value in update_data.items():
        setattr(allocation, field, value)
    
    db.commit()
    db.refresh(allocation)
    
    return allocation

@router.delete("/allocations/{allocation_id}")
async def delete_transfer_allocation(
    allocation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a transfer allocation"""
    
    allocation = db.query(TransferAllocation).filter(
        TransferAllocation.id == allocation_id,
        TransferAllocation.user_id == current_user.id
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    db.delete(allocation)
    db.commit()
    
    return {"message": "Allocation deleted successfully"}

# Bulk allocation endpoint
@router.post("/transfers/allocate-bulk")
async def bulk_allocate_transfers(
    allocations: List[TransferAllocationCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create multiple transfer allocations at once"""
    
    created_allocations = []
    
    for allocation_data in allocations:
        # Verify transfer exists
        transfer = db.query(Transfer).filter(
            Transfer.id == allocation_data.transfer_id,
            Transfer.user_id == current_user.id
        ).first()
        
        if not transfer:
            continue  # Skip invalid transfers
        
        # Verify category if provided
        if allocation_data.allocated_category_id:
            category = db.query(Category).filter(
                Category.id == allocation_data.allocated_category_id,
                Category.user_id == current_user.id
            ).first()
            
            if not category:
                continue  # Skip invalid categories
        
        # Create allocation
        allocation = TransferAllocation(
            user_id=current_user.id,
            **allocation_data.dict()
        )
        
        db.add(allocation)
        created_allocations.append(allocation)
    
    db.commit()
    
    return {
        "message": f"Created {len(created_allocations)} allocations",
        "created_count": len(created_allocations)
    }
