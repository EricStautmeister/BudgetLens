import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, UploadLog, CSVMapping
from app.services.csv_processor import CSVProcessor
from app.core.config import settings
from uuid import UUID
import tempfile
from typing import List, Dict, Optional

router = APIRouter()

@router.post("/csv")
async def upload_csv(
    file: UploadFile = File(...),
    mapping_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Validate file type
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Store original filename
    original_filename = file.filename
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp_file:
        shutil.copyfileobj(file.file, tmp_file)
        tmp_file_path = tmp_file.name
    
    try:
        # Process CSV with original filename preserved
        processor = CSVProcessor(db, str(current_user.id))
        upload_log = processor.process_csv(tmp_file_path, mapping_id, original_filename)
        
        return {"upload_id": str(upload_log.id), "status": upload_log.status}
    finally:
        # Clean up temporary file
        os.unlink(tmp_file_path)

@router.get("/{upload_id}/status")
async def get_upload_status(
    upload_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    upload_log = db.query(UploadLog).filter(
        UploadLog.id == upload_id,
        UploadLog.user_id == current_user.id
    ).first()
    
    if not upload_log:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    return {
        "upload_id": str(upload_log.id),
        "filename": upload_log.filename,
        "status": upload_log.status,
        "total_rows": upload_log.total_rows,
        "processed_rows": upload_log.processed_rows,
        "error_count": upload_log.error_count,
        "error_details": upload_log.error_details,
        "created_at": upload_log.created_at,
        "completed_at": upload_log.completed_at
    }

@router.get("/mappings", response_model=List[dict])
async def get_csv_mappings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    mappings = db.query(CSVMapping).filter(
        CSVMapping.user_id == current_user.id
    ).all()
    
    return [
        {
            "id": str(mapping.id),
            "source_name": mapping.source_name,
            "column_mappings": mapping.column_mappings,
            "date_format": mapping.date_format,
            "decimal_separator": mapping.decimal_separator,
            "encoding": mapping.encoding
        }
        for mapping in mappings
    ]