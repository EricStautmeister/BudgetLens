from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, UploadLog, Transaction
from datetime import datetime
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[dict])
async def list_uploads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all uploads for the current user"""
    uploads = db.query(UploadLog).filter(
        UploadLog.user_id == current_user.id
    ).order_by(desc(UploadLog.created_at)).offset(skip).limit(limit).all()
    
    result = []
    for upload in uploads:
        # Count transactions created from this upload
        transaction_count = db.query(func.count(Transaction.id)).filter(
            Transaction.user_id == current_user.id,
            func.date(Transaction.created_at) == func.date(upload.created_at),
            Transaction.description.like(f"%{upload.filename.split('.')[0][:10]}%")
        ).scalar() if upload.status == "completed" else 0
        
        upload_data = {
            "id": str(upload.id),
            "filename": upload.filename,
            "status": upload.status,
            "total_rows": upload.total_rows,
            "processed_rows": upload.processed_rows,
            "error_count": upload.error_count,
            "created_at": upload.created_at.isoformat(),
            "completed_at": upload.completed_at.isoformat() if upload.completed_at else None,
            "transaction_count": transaction_count,
            "error_details": upload.error_details
        }
        result.append(upload_data)
    
    return result

@router.get("/{upload_id}/transactions")
async def get_upload_transactions(
    upload_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get transactions created from a specific upload"""
    upload = db.query(UploadLog).filter(
        UploadLog.id == upload_id,
        UploadLog.user_id == current_user.id
    ).first()
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    # Find transactions created around the same time as the upload
    # This is a heuristic since we don't have a direct upload_id foreign key
    start_time = upload.created_at
    end_time = upload.completed_at or datetime.utcnow()
    
    transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.created_at >= start_time,
        Transaction.created_at <= end_time
    ).order_by(Transaction.created_at).all()
    
    return {
        "upload_id": str(upload_id),
        "upload_filename": upload.filename,
        "transactions": [
            {
                "id": str(t.id),
                "date": t.date.isoformat(),
                "amount": float(t.amount),
                "description": t.description,
                "created_at": t.created_at.isoformat()
            }
            for t in transactions
        ]
    }

@router.delete("/{upload_id}")
async def delete_upload_and_transactions(
    upload_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an upload and all associated transactions"""
    upload = db.query(UploadLog).filter(
        UploadLog.id == upload_id,
        UploadLog.user_id == current_user.id
    ).first()
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    try:
        # Find and delete associated transactions
        start_time = upload.created_at
        end_time = upload.completed_at or datetime.utcnow()
        
        transactions_to_delete = db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.created_at >= start_time,
            Transaction.created_at <= end_time
        ).all()
        
        transaction_count = len(transactions_to_delete)
        
        # Delete transactions
        for transaction in transactions_to_delete:
            db.delete(transaction)
        
        # Delete upload log
        db.delete(upload)
        
        db.commit()
        
        logger.info(f"Deleted upload {upload_id} and {transaction_count} associated transactions")
        
        return {
            "message": "Upload and associated transactions deleted successfully",
            "deleted_transactions": transaction_count,
            "upload_filename": upload.filename
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting upload {upload_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete upload: {str(e)}"
        )

@router.post("/{upload_id}/retry")
async def retry_failed_upload(
    upload_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Reset a failed upload to allow retry"""
    upload = db.query(UploadLog).filter(
        UploadLog.id == upload_id,
        UploadLog.user_id == current_user.id
    ).first()
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    if upload.status != "failed":
        raise HTTPException(
            status_code=400,
            detail="Can only retry failed uploads"
        )
    
    # Reset upload status
    upload.status = "processing"
    upload.error_details = None
    upload.completed_at = None
    
    db.commit()
    
    return {"message": "Upload reset for retry", "upload_id": str(upload_id)}

@router.get("/stats")
async def get_upload_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get upload statistics for the user"""
    total_uploads = db.query(func.count(UploadLog.id)).filter(
        UploadLog.user_id == current_user.id
    ).scalar()
    
    successful_uploads = db.query(func.count(UploadLog.id)).filter(
        UploadLog.user_id == current_user.id,
        UploadLog.status == "completed"
    ).scalar()
    
    failed_uploads = db.query(func.count(UploadLog.id)).filter(
        UploadLog.user_id == current_user.id,
        UploadLog.status == "failed"
    ).scalar()
    
    total_transactions = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == current_user.id
    ).scalar()
    
    return {
        "total_uploads": total_uploads,
        "successful_uploads": successful_uploads,
        "failed_uploads": failed_uploads,
        "total_transactions": total_transactions
    }