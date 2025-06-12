# backend/app/api/v1/endpoints/transfers.py

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User
from app.schemas.transfer import Transfer, TransferDetectionResult, TransferMatchRequest
from app.services.transfer import TransferService
from uuid import UUID

router = APIRouter()

@router.get("/detect", response_model=TransferDetectionResult)
async def detect_transfers(
    days_lookback: int = Query(7, ge=1, le=30, description="Days to look back for potential transfers"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Detect potential transfers between accounts"""
    transfer_service = TransferService(db, str(current_user.id))
    return transfer_service.detect_potential_transfers(days_lookback)

@router.post("/match")
async def create_manual_transfer(
    match_request: TransferMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Manually create a transfer between two transactions"""
    transfer_service = TransferService(db, str(current_user.id))
    
    try:
        transfer = transfer_service.create_manual_transfer(
            str(match_request.from_transaction_id),
            str(match_request.to_transaction_id)
        )
        return {
            "message": "Transfer created successfully",
            "transfer_id": str(transfer.id),
            "amount": float(transfer.amount)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=List[Transfer])
async def list_transfers(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get user's transfers"""
    transfer_service = TransferService(db, str(current_user.id))
    transfers = transfer_service.get_transfers(limit)
    
    # Enrich with account names
    result = []
    for transfer in transfers:
        transfer_dict = {
            "id": str(transfer.id),
            "from_account_id": str(transfer.from_account_id),
            "to_account_id": str(transfer.to_account_id),
            "amount": float(transfer.amount),
            "date": transfer.date.isoformat(),
            "description": transfer.description,
            "is_confirmed": transfer.is_confirmed,
            "created_at": transfer.created_at.isoformat(),
            "from_account_name": transfer.from_account.name if transfer.from_account else None,
            "to_account_name": transfer.to_account.name if transfer.to_account else None
        }
        result.append(transfer_dict)
    
    return result

@router.delete("/{transfer_id}")
async def delete_transfer(
    transfer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a transfer and unmark associated transactions"""
    transfer_service = TransferService(db, str(current_user.id))
    success = transfer_service.delete_transfer(str(transfer_id))
    
    if not success:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    return {"message": "Transfer deleted successfully"}