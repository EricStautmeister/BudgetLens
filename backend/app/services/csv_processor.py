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
        logger.info(f"CSV columns detected: {df.columns.tolist()}")
        
        # Check for Cornercard format
        if self._is_cornercard_format(df):
            return self._create_cornercard_mapping()
        
        # Check for Swiss ZKB format
        if self._is_zkb_format(df):
            return self._create_zkb_mapping()
        
        # Get user's saved mappings
        mappings = self.db.query(CSVMapping).filter(
            CSVMapping.user_id == self.user_id
        ).all()
        
        for mapping in mappings:
            required_cols = set(mapping.column_mappings.values())
            if required_cols.issubset(set(df.columns)):
                return mapping
        
        return None
    
    def _is_cornercard_format(self, df: pd.DataFrame) -> bool:
        """Check if this is a Cornercard format"""
        expected_cols = ['Date', 'Description', 'Card', 'Currency', 'Amount', 'Status']
        return all(col in df.columns for col in expected_cols)
    
    def _create_cornercard_mapping(self) -> CSVMapping:
        """Create or get existing Cornercard mapping"""
        # First check if mapping already exists
        existing_mapping = self.db.query(CSVMapping).filter(
            CSVMapping.user_id == self.user_id,
            CSVMapping.source_name == "Cornercard Swiss"
        ).first()
        
        if existing_mapping:
            logger.info("Using existing Cornercard Swiss mapping")
            return existing_mapping
        
        # Create new mapping if it doesn't exist
        mapping = CSVMapping(
            user_id=self.user_id,
            source_name="Cornercard Swiss",
            column_mappings={
                "date": "Date",
                "description": "Description", 
                "amount": "Amount",
                "currency": "Currency",
                "card": "Card",
                "status": "Status"
            },
            date_format='%d/%m/%Y',  # Cornercard date format: 09/04/2025
            decimal_separator='.',
            encoding='utf-8'
        )
        
        try:
            self.db.add(mapping)
            self.db.commit()
            logger.info("Created new Cornercard Swiss mapping")
            return mapping
        except Exception as e:
            self.db.rollback()
            logger.warning(f"Failed to create Cornercard mapping, trying to get existing: {e}")
            # Try to get existing mapping again in case of race condition
            existing_mapping = self.db.query(CSVMapping).filter(
                CSVMapping.user_id == self.user_id,
                CSVMapping.source_name == "Cornercard Swiss"
            ).first()
            if existing_mapping:
                return existing_mapping
            raise e
    
    def _is_zkb_format(self, df: pd.DataFrame) -> bool:
        """Check if this is a ZKB (Zurich Kantonal Bank) format"""
        expected_cols = ['Date', 'Booking text', 'Debit CHF', 'Credit CHF']
        return all(col in df.columns for col in expected_cols)
    
    def _create_zkb_mapping(self) -> CSVMapping:
        """Create or get existing ZKB mapping"""
        # First check if mapping already exists
        existing_mapping = self.db.query(CSVMapping).filter(
            CSVMapping.user_id == self.user_id,
            CSVMapping.source_name == "ZKB Swiss Bank"
        ).first()
        
        if existing_mapping:
            logger.info("Using existing ZKB Swiss Bank mapping")
            return existing_mapping
        
        # Create new mapping if it doesn't exist
        mapping = CSVMapping(
            user_id=self.user_id,
            source_name="ZKB Swiss Bank",
            column_mappings={
                "date": "Date",
                "description": "Booking text", 
                "debit": "Debit CHF",
                "credit": "Credit CHF",
                "balance": "Balance CHF",
                "reference": "ZKB reference"
            },
            date_format='%d.%m.%Y',  # Swiss date format
            decimal_separator='.',
            encoding='utf-8'
        )
        
        try:
            self.db.add(mapping)
            self.db.commit()
            logger.info("Created new ZKB Swiss Bank mapping")
            return mapping
        except Exception as e:
            self.db.rollback()
            logger.warning(f"Failed to create ZKB mapping, trying to get existing: {e}")
            # Try to get existing mapping again in case of race condition
            existing_mapping = self.db.query(CSVMapping).filter(
                CSVMapping.user_id == self.user_id,
                CSVMapping.source_name == "ZKB Swiss Bank"
            ).first()
            if existing_mapping:
                return existing_mapping
            raise e
    
    def process_csv(self, file_path: str, mapping_id: Optional[str] = None, original_filename: Optional[str] = None) -> UploadLog:
        """Process CSV file and create transactions"""
        # Use original filename if provided, otherwise extract from path
        if original_filename:
            filename = original_filename
        else:
            # Fallback to extracting from file path (legacy behavior)
            filename = file_path.split('/')[-1]
        
        upload_log = UploadLog(
            user_id=self.user_id,
            filename=filename,
            status="processing"
        )
        self.db.add(upload_log)
        self.db.commit()
        
        try:
            # Read CSV file with robust parsing
            df = self._read_csv_robust(file_path)
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
            
            logger.info(f"Using mapping: {mapping.source_name} for file: {filename}")
            
            # Process transactions
            processed_count = 0
            skipped_count = 0
            errors = []
            skipped_details = []
            
            for index, row in df.iterrows():
                try:
                    result = self._create_transaction_from_row(row, mapping)
                    if result is None:
                        skipped_count += 1
                        # Log why it was skipped
                        skip_reason = self._get_skip_reason(row, mapping)
                        skipped_details.append({
                            "row": index + 1,
                            "reason": skip_reason,
                            "data": {
                                "date": str(row.get(mapping.column_mappings.get('date', ''), '')).strip().replace('"', ''),
                                "description": str(row.get(mapping.column_mappings.get('description', ''), '')).strip().replace('"', ''),
                                "debit": str(row.get(mapping.column_mappings.get('debit', ''), '')).strip().replace('"', ''),
                                "credit": str(row.get(mapping.column_mappings.get('credit', ''), '')).strip().replace('"', '')
                            }
                        })
                        logger.info(f"Skipped row {index + 1}: {skip_reason}")
                    elif result == "duplicate":
                        skipped_count += 1
                        skipped_details.append({
                            "row": index + 1,
                            "reason": "Duplicate transaction already exists",
                            "data": {
                                "date": str(row.get(mapping.column_mappings.get('date', ''), '')).strip().replace('"', ''),
                                "description": str(row.get(mapping.column_mappings.get('description', ''), '')).strip().replace('"', ''),
                            }
                        })
                        logger.info(f"Skipped row {index + 1}: Duplicate transaction")
                    else:
                        self.db.add(result)
                        processed_count += 1
                except Exception as e:
                    errors.append({
                        "row": index + 1,
                        "error": str(e),
                        "data": {
                            "date": str(row.get(mapping.column_mappings.get('date', ''), '')),
                            "description": str(row.get(mapping.column_mappings.get('description', ''), '')),
                            "debit": str(row.get(mapping.column_mappings.get('debit', ''), '')),
                            "credit": str(row.get(mapping.column_mappings.get('credit', ''), ''))
                        }
                    })
                    logger.warning(f"Error processing row {index + 1}: {str(e)}")
            
            # Add skipped details to error details for reporting
            all_issues = []
            if errors:
                all_issues.extend([{"type": "error", **error} for error in errors])
            if skipped_details:
                all_issues.extend([{"type": "skipped", **skip} for skip in skipped_details])
            
            logger.info(f"Processing complete for {filename}: {processed_count} processed, {skipped_count} skipped, {len(errors)} errors")
            
            # Commit transactions
            try:
                self.db.commit()
            except Exception as commit_error:
                self.db.rollback()
                logger.error(f"Failed to commit transactions for {filename}: {commit_error}")
                raise commit_error
            
            # Run categorization
            try:
                self.categorization_service.categorize_new_transactions()
            except Exception as cat_error:
                logger.warning(f"Categorization failed for {filename}: {cat_error}")
                # Don't fail the whole upload if categorization fails
            
            # Update upload log
            upload_log.status = "completed"
            upload_log.processed_rows = processed_count
            upload_log.error_count = len(errors)
            upload_log.error_details = {
                "errors": errors,
                "skipped": skipped_details,
                "summary": {
                    "total_rows": len(df),
                    "processed": processed_count,
                    "skipped": skipped_count,
                    "errors": len(errors)
                }
            } if (errors or skipped_details) else None
            upload_log.completed_at = datetime.utcnow()
            
        except Exception as e:
            self.db.rollback()
            upload_log.status = "failed"
            upload_log.error_details = {"error": str(e)}
            upload_log.completed_at = datetime.utcnow()
            logger.error(f"CSV processing failed for {filename}: {str(e)}")
        
        # Always try to commit the upload log status
        try:
            self.db.commit()
        except Exception as log_error:
            logger.error(f"Failed to update upload log for {filename}: {log_error}")
            
        return upload_log
    
    def process_csv_with_log(self, file_path: str, mapping_id: Optional[str], upload_log: UploadLog) -> UploadLog:
        """Process CSV file with an existing upload log"""
        try:
            # Read CSV file with robust parsing
            df = self._read_csv_robust(file_path)
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
            
            logger.info(f"Using mapping: {mapping.source_name} for file: {upload_log.filename}")
            
            # Process transactions (same logic as before)
            processed_count = 0
            skipped_count = 0
            errors = []
            skipped_details = []
            
            for index, row in df.iterrows():
                try:
                    result = self._create_transaction_from_row(row, mapping)
                    if result is None:
                        skipped_count += 1
                        skip_reason = self._get_skip_reason(row, mapping)
                        skipped_details.append({
                            "row": index + 1,
                            "reason": skip_reason,
                            "data": self._extract_row_data(row, mapping)
                        })
                        logger.info(f"Skipped row {index + 1}: {skip_reason}")
                    elif result == "duplicate":
                        skipped_count += 1
                        skipped_details.append({
                            "row": index + 1,
                            "reason": "Duplicate transaction already exists",
                            "data": self._extract_row_data(row, mapping)
                        })
                        logger.info(f"Skipped row {index + 1}: Duplicate transaction")
                    else:
                        self.db.add(result)
                        processed_count += 1
                except Exception as e:
                    errors.append({
                        "row": index + 1,
                        "error": str(e),
                        "data": self._extract_row_data(row, mapping)
                    })
                    logger.warning(f"Error processing row {index + 1}: {str(e)}")
            
            logger.info(f"Processing complete: {processed_count} processed, {skipped_count} skipped, {len(errors)} errors")
            
            # Commit transactions
            try:
                self.db.commit()
            except Exception as commit_error:
                self.db.rollback()
                logger.error(f"Failed to commit transactions: {commit_error}")
                raise commit_error
            
            # Run categorization
            try:
                self.categorization_service.categorize_new_transactions()
            except Exception as cat_error:
                logger.warning(f"Categorization failed: {cat_error}")
            
            # Update upload log
            upload_log.status = "completed"
            upload_log.processed_rows = processed_count
            upload_log.error_count = len(errors)
            upload_log.error_details = {
                "errors": errors,
                "skipped": skipped_details,
                "summary": {
                    "total_rows": len(df),
                    "processed": processed_count,
                    "skipped": skipped_count,
                    "errors": len(errors)
                }
            } if (errors or skipped_details) else None
            upload_log.completed_at = datetime.utcnow()
            
        except Exception as e:
            self.db.rollback()
            upload_log.status = "failed"
            upload_log.error_details = {"error": str(e)}
            upload_log.completed_at = datetime.utcnow()
            logger.error(f"CSV processing failed for {upload_log.filename}: {str(e)}")
        
        return upload_log
    
    def _extract_row_data(self, row: pd.Series, mapping: CSVMapping) -> dict:
        """Extract row data for error reporting"""
        col_map = mapping.column_mappings
        data = {
            "date": str(row.get(col_map.get('date', ''), '')).strip().replace('"', ''),
            "description": str(row.get(col_map.get('description', ''), '')).strip().replace('"', ''),
        }
        
        if mapping.source_name == "Cornercard Swiss":
            data.update({
                "amount": str(row.get(col_map.get('amount', ''), '')).strip().replace('"', ''),
                "currency": str(row.get(col_map.get('currency', ''), '')).strip().replace('"', ''),
                "status": str(row.get(col_map.get('status', ''), '')).strip().replace('"', '')
            })
        else:
            data.update({
                "debit": str(row.get(col_map.get('debit', ''), '')).strip().replace('"', ''),
                "credit": str(row.get(col_map.get('credit', ''), '')).strip().replace('"', '')
            })
        
        return data
    
    def _read_csv_robust(self, file_path: str) -> pd.DataFrame:
        """Read CSV with robust error handling for Swiss bank formats"""
        try:
            # Try with semicolon delimiter first (common in Swiss banks)
            df = pd.read_csv(file_path, delimiter=';', encoding='utf-8')
            if len(df.columns) > 1:
                logger.info(f"Successfully parsed with semicolon delimiter. Columns: {len(df.columns)}")
                return df
        except Exception as e:
            logger.warning(f"Semicolon parsing failed: {e}")
        
        try:
            # Try standard comma delimiter
            df = pd.read_csv(file_path, delimiter=',', encoding='utf-8')
            logger.info(f"Successfully parsed with comma delimiter. Columns: {len(df.columns)}")
            return df
        except Exception as e:
            logger.warning(f"Comma parsing failed: {e}")
        
        # Try with different encodings for Swiss characters
        for encoding in ['utf-8', 'iso-8859-1', 'cp1252']:
            for delimiter in [';', ',', '\t']:
                try:
                    df = pd.read_csv(
                        file_path,
                        delimiter=delimiter,
                        encoding=encoding,
                        on_bad_lines='skip',
                        engine='python'
                    )
                    if len(df.columns) > 1:
                        logger.info(f"Successfully parsed with delimiter '{delimiter}' and encoding '{encoding}'")
                        return df
                except Exception:
                    continue
        
        raise ValueError("Unable to parse CSV file with any known format")
    
    def _get_skip_reason(self, row: pd.Series, mapping: CSVMapping) -> str:
        """Determine why a row was skipped"""
        col_map = mapping.column_mappings
        
        date_str = str(row.get(col_map.get('date', ''), '')).strip().replace('"', '')
        description = str(row.get(col_map.get('description', ''), '')).strip().replace('"', '')
        
        if not date_str or date_str in ['nan', 'Date', '']:
            return "Empty or invalid date"
        
        if not description or description in ['nan', 'Description', 'Booking text', '']:
            return "Empty or invalid description"
        
        if mapping.source_name == "Cornercard Swiss":
            amount_str = str(row.get(col_map.get('amount', ''), '')).strip().replace('"', '')
            status = str(row.get(col_map.get('status', ''), '')).strip().replace('"', '')
            
            if not amount_str or amount_str in ['nan', 'Amount', '']:
                return "No amount"
            
            if status and status.lower() not in ['settled transaction', 'settled', 'completed']:
                return f"Transaction not settled (status: {status})"
                
        else:
            # ZKB format
            debit_str = str(row.get(col_map.get('debit', ''), '')).strip().replace('"', '')
            credit_str = str(row.get(col_map.get('credit', ''), '')).strip().replace('"', '')
            
            if (not debit_str or debit_str in ['nan', 'Debit CHF', '']) and \
               (not credit_str or credit_str in ['nan', 'Credit CHF', '']):
                return "No amount (both debit and credit empty)"
        
        return "Unknown reason"
    
    def _create_transaction_from_row(self, row: pd.Series, mapping: CSVMapping) -> Optional[Transaction]:
        """Create transaction from CSV row - handles Swiss bank format"""
        col_map = mapping.column_mappings
        
        try:
            # Extract data with better error handling
            date_str = str(row[col_map['date']]).strip().replace('"', '')
            description = str(row[col_map['description']]).strip().replace('"', '')
            
            # Handle Swiss bank debit/credit columns
            debit_str = str(row.get(col_map.get('debit', ''), '')).strip().replace('"', '')
            credit_str = str(row.get(col_map.get('credit', ''), '')).strip().replace('"', '')
            
            # Skip empty rows or header rows
            if not date_str or date_str in ['nan', 'Date']:
                return None
            
            if not description or description in ['nan', 'Booking text']:
                return None
            
            # Parse date
            try:
                transaction_date = datetime.strptime(date_str, mapping.date_format).date()
            except ValueError:
                # Try common Swiss date formats
                for fmt in ['%d.%m.%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
                    try:
                        transaction_date = datetime.strptime(date_str, fmt).date()
                        break
                    except ValueError:
                        continue
                else:
                    raise ValueError(f"Unable to parse date: {date_str}")
            
            # Parse amount - Swiss banks often use separate debit/credit columns
            amount = Decimal('0')
            
            if debit_str and debit_str not in ['', 'nan', '""', 'Debit CHF']:
                # Debit amount (money out) - make negative
                amount_str = debit_str.replace(',', '').replace(' ', '')
                if mapping.decimal_separator != '.':
                    amount_str = amount_str.replace(mapping.decimal_separator, '.')
                try:
                    amount = -Decimal(amount_str)
                except:
                    return None
            elif credit_str and credit_str not in ['', 'nan', '""', 'Credit CHF']:
                # Credit amount (money in) - keep positive
                amount_str = credit_str.replace(',', '').replace(' ', '')
                if mapping.decimal_separator != '.':
                    amount_str = amount_str.replace(mapping.decimal_separator, '.')
                try:
                    amount = Decimal(amount_str)
                except:
                    return None
            else:
                # Skip rows with no amount
                return None
            
            # Check for duplicates
            existing = self.db.query(Transaction).filter(
                Transaction.user_id == self.user_id,
                Transaction.date == transaction_date,
                Transaction.amount == amount,
                Transaction.description == description
            ).first()
            
            if existing:
                return "duplicate"  # Special return value to indicate duplicate
            
            # Create transaction with upload reference
            transaction = Transaction(
                user_id=self.user_id,
                date=transaction_date,
                amount=amount,
                description=description,
                source_account="ZKB Account",
                needs_review=True  # Will be updated by categorization
            )
            
            return transaction
            
        except Exception as e:
            raise ValueError(f"Error processing transaction data: {str(e)}")
    
    
    def _generate_transaction_hash(self, date, amount, description):
        """Generate hash for duplicate detection"""
        data = f"{date}{amount}{description}"
        return hashlib.md5(data.encode()).hexdigest()