# backend/app/api/v1/endpoints/transfers.py

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User
from app.schemas.transfer import Transfer, TransferDetectionResult, TransferMatchRequest, TransferCreate, TransferUpdate
from app.services.transfer import TransferService  # Use the existing service
from uuid import UUID
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/suggestions")
async def get_transfer_suggestions(
    limit: int = Query(5, ge=1, le=20, description="Number of suggestions to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get AI-suggested transfers for manual review"""
    try:
        # Try to use enhanced service first, fallback to basic implementation
        try:
            from app.services.enhanced_transfer import TransferService as EnhancedTransferService
            service = EnhancedTransferService(db, str(current_user.id))
            suggestions = service.get_transfer_suggestions(limit)
        except ImportError:
            # Fallback to basic suggestions
            suggestions = []
            logger.warning("Enhanced transfer service not available, returning empty suggestions")
        
        return {
            "suggestions": suggestions,
            "count": len(suggestions)
        }
    except Exception as e:
        logger.error(f"Error getting transfer suggestions: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting transfer suggestions: {str(e)}")

@router.get("/settings")
async def get_transfer_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get user's transfer detection settings"""
    try:
        # Return default settings if enhanced service not available
        default_settings = {
            "days_lookback": 7,
            "amount_tolerance": 0.50,
            "percentage_tolerance": 0.02,
            "confidence_threshold": 0.85,
            "enable_auto_matching": True,
            "rules": []
        }
        
        # Try to get user-specific settings from user model
        user_settings = current_user.transfer_settings if hasattr(current_user, 'transfer_settings') and current_user.transfer_settings else {}
        
        # Merge with defaults
        settings = {**default_settings, **user_settings}
        
        return {
            "settings": settings,
            "message": "Transfer settings retrieved successfully"
        }
    except Exception as e:
        logger.error(f"Error getting transfer settings: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting transfer settings: {str(e)}")

@router.put("/settings")
async def update_transfer_settings(
    settings_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update user's transfer detection settings"""
    try:
        # Save settings to user model
        current_user.transfer_settings = settings_data
        db.commit()
        
        return {
            "message": "Transfer settings updated successfully",
            "settings": settings_data
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating transfer settings: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating transfer settings: {str(e)}")

@router.get("/detect", response_model=TransferDetectionResult)
async def detect_transfers(
    days_lookback: int = Query(7, ge=1, le=30, description="Days to look back for potential transfers"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Detect potential transfers between accounts"""
    try:
        # Try enhanced detection first, fallback to basic
        try:
            from app.services.enhanced_transfer import TransferService as EnhancedTransferService
            service = EnhancedTransferService(db, str(current_user.id))
            result = service.detect_potential_transfers_enhanced()
        except ImportError:
            # Fallback to basic detection
            transfer_service = TransferService(db, str(current_user.id))
            if hasattr(transfer_service, 'detect_potential_transfers'):
                result = transfer_service.detect_potential_transfers(days_lookback)
            else:
                # Basic fallback
                result = TransferDetectionResult(
                    potential_transfers=[],
                    auto_matched=0,
                    manual_review_needed=0
                )
        
        return result
    except Exception as e:
        logger.error(f"Error detecting transfers: {e}")
        raise HTTPException(status_code=500, detail=f"Error detecting transfers: {str(e)}")

@router.post("/match")
async def create_manual_transfer(
    match_request: TransferMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Manually create a transfer between two transactions"""
    try:
        # Try both enhanced and basic services
        try:
            from app.services.enhanced_transfer import TransferService as EnhancedTransferService
            service = EnhancedTransferService(db, str(current_user.id))
            transfer = service.create_manual_transfer(
                str(match_request.from_transaction_id),
                str(match_request.to_transaction_id)
            )
        except ImportError:
            # Fallback to basic service
            transfer_service = TransferService(db, str(current_user.id))
            if hasattr(transfer_service, 'create_manual_transfer'):
                transfer = transfer_service.create_manual_transfer(
                    str(match_request.from_transaction_id),
                    str(match_request.to_transaction_id)
                )
            else:
                raise HTTPException(status_code=501, detail="Manual transfer creation not implemented")
        
        return {
            "message": "Transfer created successfully",
            "transfer_id": str(transfer.id),
            "amount": float(transfer.amount)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating manual transfer: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating transfer: {str(e)}")

@router.post("/")
async def create_transfer(
    transfer_data: TransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new transfer"""
    try:
        # Verify accounts belong to user
        from app.db.models import Account
        from_account = db.query(Account).filter(
            Account.id == transfer_data.from_account_id,
            Account.user_id == current_user.id
        ).first()
        
        to_account = db.query(Account).filter(
            Account.id == transfer_data.to_account_id,
            Account.user_id == current_user.id
        ).first()
        
        if not from_account or not to_account:
            raise HTTPException(status_code=404, detail="One or both accounts not found")
        
        if from_account.id == to_account.id:
            raise HTTPException(status_code=400, detail="Cannot transfer to same account")
        
        # Create transfer using the models directly
        from app.db.models import Transfer
        transfer = Transfer(
            user_id=current_user.id,
            from_account_id=transfer_data.from_account_id,
            to_account_id=transfer_data.to_account_id,
            amount=transfer_data.amount,
            date=transfer_data.date,
            description=transfer_data.description,
            is_confirmed=True,
            detection_method="manual"
        )
        
        db.add(transfer)
        db.commit()
        db.refresh(transfer)
        
        return {
            "message": "Transfer created successfully",
            "transfer": {
                "id": str(transfer.id),
                "from_account_id": str(transfer.from_account_id),
                "to_account_id": str(transfer.to_account_id),
                "amount": float(transfer.amount),
                "date": transfer.date.isoformat(),
                "description": transfer.description,
                "is_confirmed": transfer.is_confirmed
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating transfer: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating transfer: {str(e)}")

@router.get("/")
async def list_transfers(
    limit: int = Query(50, ge=1, le=200),
    confirmed_only: bool = Query(None, description="Filter by confirmation status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get user's transfers"""
    try:
        from app.db.models import Transfer, Account
        query = db.query(Transfer).filter(Transfer.user_id == current_user.id)
        
        if confirmed_only is not None:
            query = query.filter(Transfer.is_confirmed == confirmed_only)
        
        transfers = query.order_by(Transfer.date.desc()).limit(limit).all()
        
        # Enrich with account names
        result = []
        for transfer in transfers:
            # Get account names
            from_account = db.query(Account).filter(Account.id == transfer.from_account_id).first()
            to_account = db.query(Account).filter(Account.id == transfer.to_account_id).first()
            
            transfer_dict = {
                "id": str(transfer.id),
                "user_id": str(transfer.user_id),
                "from_account_id": str(transfer.from_account_id),
                "to_account_id": str(transfer.to_account_id),
                "from_transaction_id": str(transfer.from_transaction_id) if transfer.from_transaction_id else None,
                "to_transaction_id": str(transfer.to_transaction_id) if transfer.to_transaction_id else None,
                "amount": float(transfer.amount),
                "date": transfer.date.isoformat(),
                "description": transfer.description,
                "is_confirmed": transfer.is_confirmed,
                "created_at": transfer.created_at.isoformat(),
                "from_account_name": from_account.name if from_account else None,
                "to_account_name": to_account.name if to_account else None
            }
            result.append(transfer_dict)
        
        return {
            "transfers": result,
            "count": len(result)
        }
    except Exception as e:
        logger.error(f"Error listing transfers: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing transfers: {str(e)}")

@router.put("/{transfer_id}")
async def update_transfer(
    transfer_id: UUID,
    transfer_update: TransferUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update an existing transfer"""
    try:
        from app.db.models import Transfer
        transfer = db.query(Transfer).filter(
            Transfer.id == transfer_id,
            Transfer.user_id == current_user.id
        ).first()
        
        if not transfer:
            raise HTTPException(status_code=404, detail="Transfer not found")
        
        # Update fields
        update_data = transfer_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(transfer, field, value)
        
        db.commit()
        db.refresh(transfer)
        
        return {
            "message": "Transfer updated successfully",
            "transfer": {
                "id": str(transfer.id),
                "amount": float(transfer.amount),
                "date": transfer.date.isoformat(),
                "description": transfer.description,
                "is_confirmed": transfer.is_confirmed
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating transfer: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating transfer: {str(e)}")

@router.delete("/{transfer_id}")
async def delete_transfer(
    transfer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a transfer and unmark associated transactions"""
    try:
        # Try both services
        success = False
        try:
            from app.services.enhanced_transfer import TransferService as EnhancedTransferService
            service = EnhancedTransferService(db, str(current_user.id))
            success = service.delete_transfer(str(transfer_id))
        except ImportError:
            # Fallback to basic service
            transfer_service = TransferService(db, str(current_user.id))
            if hasattr(transfer_service, 'delete_transfer'):
                success = transfer_service.delete_transfer(str(transfer_id))
            else:
                # Manual fallback deletion
                from app.db.models import Transfer, Transaction
                transfer = db.query(Transfer).filter(
                    Transfer.id == transfer_id,
                    Transfer.user_id == current_user.id
                ).first()
                
                if not transfer:
                    raise HTTPException(status_code=404, detail="Transfer not found")
                
                # Unmark associated transactions
                if transfer.from_transaction_id:
                    from_tx = db.query(Transaction).filter(Transaction.id == transfer.from_transaction_id).first()
                    if from_tx:
                        from_tx.is_transfer = False
                
                if transfer.to_transaction_id:
                    to_tx = db.query(Transaction).filter(Transaction.id == transfer.to_transaction_id).first()
                    if to_tx:
                        to_tx.is_transfer = False
                
                db.delete(transfer)
                db.commit()
                success = True
        
        if not success:
            raise HTTPException(status_code=404, detail="Transfer not found")
        
        return {"message": "Transfer deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting transfer: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting transfer: {str(e)}")

@router.post("/{transfer_id}/confirm")
async def confirm_transfer(
    transfer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Confirm a suggested transfer"""
    try:
        from app.db.models import Transfer, Transaction
        transfer = db.query(Transfer).filter(
            Transfer.id == transfer_id,
            Transfer.user_id == current_user.id
        ).first()
        
        if not transfer:
            raise HTTPException(status_code=404, detail="Transfer not found")
        
        transfer.is_confirmed = True
        
        # Mark associated transactions as transfers
        if transfer.from_transaction_id:
            from_txn = db.query(Transaction).filter(Transaction.id == transfer.from_transaction_id).first()
            if from_txn:
                from_txn.is_transfer = True
                
        if transfer.to_transaction_id:
            to_txn = db.query(Transaction).filter(Transaction.id == transfer.to_transaction_id).first()
            if to_txn:
                to_txn.is_transfer = True
        
        db.commit()
        db.refresh(transfer)
        
        return {
            "message": "Transfer confirmed successfully",
            "transfer": {
                "id": str(transfer.id),
                "is_confirmed": transfer.is_confirmed
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error confirming transfer: {e}")
        raise HTTPException(status_code=500, detail=f"Error confirming transfer: {str(e)}")

@router.post("/test-rules")
async def test_transfer_rules(
    settings_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Test transfer rules against historical data (enhanced service only)"""
    try:
        from app.services.enhanced_transfer import TransferService as EnhancedTransferService, TransferSettings
        service = EnhancedTransferService(db, str(current_user.id))
        settings = TransferSettings(**settings_data)
        results = service.test_transfer_rules(settings)
        
        return {
            "test_results": results,
            "message": "Transfer rules tested successfully"
        }
    except ImportError:
        raise HTTPException(status_code=501, detail="Enhanced transfer service not available. Rule testing requires the enhanced service.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid settings data: {str(e)}")
    except Exception as e:
        logger.error(f"Error testing transfer rules: {e}")
        raise HTTPException(status_code=500, detail=f"Error testing transfer rules: {str(e)}")