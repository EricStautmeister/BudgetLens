import pandas as pd
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
from datetime import datetime
import hashlib
from sqlalchemy.orm import Session
from app.db.models import Transaction, CSVMapping, UploadLog
from app.services.categorization import CategorizationService
import logging

logger = logging.getLogger(__name__)

class CSVProcessor:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
        self.categorization_service = CategorizationService(db, user_id)
    
    def detect_csv_format(self, df: pd.DataFrame) -> Optional[CSVMapping]:
        """Detect CSV format based on column names"""
        # Get user's saved mappings
        mappings = self.db.query(CSVMapping).filter(
            CSVMapping.user_id == self.user_id
        ).all()
        
        for mapping in mappings:
            required_cols = set(mapping.column_mappings.values())
            if required_cols.issubset(set(df.columns)):
                return mapping
        
        return None
    
    def process_csv(self, file_path: str, mapping_id: Optional[str] = None) -> UploadLog:
        """Process CSV file and create transactions"""
        upload_log = UploadLog(
            user_id=self.user_id,
            filename=file_path.split('/')[-1],
            status="processing"
        )
        self.db.add(upload_log)
        self.db.commit()
        
        try:
            # Read CSV file
            df = pd.read_csv(file_path)
            upload_log.total_rows = len(df)
            
            # Get or detect mapping
            if mapping_id:
                mapping = self.db.query(CSVMapping).filter(
                    CSVMapping.id == mapping_id,
                    CSVMapping.user_id == self.user_id
                ).first()
            else:
                mapping = self.detect_csv_format(df)
            
            if not mapping:
                raise ValueError("Unable to detect CSV format. Please configure mapping.")
            
            # Process transactions
            processed_count = 0
            errors = []
            
            for index, row in df.iterrows():
                try:
                    transaction = self._create_transaction_from_row(row, mapping)
                    if transaction:
                        self.db.add(transaction)
                        processed_count += 1
                except Exception as e:
                    errors.append({
                        "row": index + 1,
                        "error": str(e)
                    })
            
            self.db.commit()
            
            # Run categorization
            self.categorization_service.categorize_new_transactions()
            
            # Update upload log
            upload_log.status = "completed"
            upload_log.processed_rows = processed_count
            upload_log.error_count = len(errors)
            upload_log.error_details = errors if errors else None
            upload_log.completed_at = datetime.utcnow()
            
        except Exception as e:
            upload_log.status = "failed"
            upload_log.error_details = {"error": str(e)}
            upload_log.completed_at = datetime.utcnow()
            logger.error(f"CSV processing failed: {str(e)}")
        
        self.db.commit()
        return upload_log
    
    def _create_transaction_from_row(self, row: pd.Series, mapping: CSVMapping) -> Optional[Transaction]:
        """Create transaction from CSV row"""
        col_map = mapping.column_mappings
        
        # Extract data
        date_str = str(row[col_map['date']])
        amount_str = str(row[col_map['amount']])
        description = str(row[col_map['description']])
        
        # Parse date
        transaction_date = datetime.strptime(date_str, mapping.date_format).date()
        
        # Parse amount
        if mapping.decimal_separator != '.':
            amount_str = amount_str.replace(mapping.decimal_separator, '.')
        amount = Decimal(amount_str.replace(',', '').replace('$', ''))
        
        # Check for duplicates
        duplicate_check = self._generate_transaction_hash(
            transaction_date, amount, description
        )
        
        existing = self.db.query(Transaction).filter(
            Transaction.user_id == self.user_id,
            Transaction.date == transaction_date,
            Transaction.amount == amount,
            Transaction.description == description
        ).first()
        
        if existing:
            return None  # Skip duplicates
        
        # Create transaction
        transaction = Transaction(
            user_id=self.user_id,
            date=transaction_date,
            amount=amount,
            description=description,
            source_account=row.get(col_map.get('account')),
            needs_review=True  # Will be updated by categorization
        )
        
        return transaction
    
    def _generate_transaction_hash(self, date, amount, description):
        """Generate hash for duplicate detection"""
        data = f"{date}{amount}{description}"
        return hashlib.md5(data.encode()).hexdigest()