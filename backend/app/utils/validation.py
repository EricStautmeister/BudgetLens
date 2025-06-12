# backend/app/utils/validation.py

from typing import TypeVar, Type, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.db.base import Base

T = TypeVar('T', bound=Base)

def validate_user_owns_resource(
    db: Session, 
    user_id: str, 
    resource_id: str, 
    model_class: Type[T]
) -> T:
    """
    Validate that a resource belongs to the user.
    
    Args:
        db: Database session
        user_id: ID of the current user
        resource_id: ID of the resource to validate
        model_class: SQLAlchemy model class
        
    Returns:
        The resource if found and owned by user
        
    Raises:
        HTTPException: If resource not found or not owned by user
    """
    resource = db.query(model_class).filter(
        model_class.id == resource_id,
        model_class.user_id == user_id
    ).first()
    
    if not resource:
        raise HTTPException(
            status_code=404, 
            detail=f"{model_class.__name__} not found or access denied"
        )
    
    return resource

def validate_multiple_user_resources(
    db: Session,
    user_id: str,
    resource_ids: list[str],
    model_class: Type[T]
) -> list[T]:
    """
    Validate that multiple resources belong to the user.
    
    Args:
        db: Database session
        user_id: ID of the current user
        resource_ids: List of resource IDs to validate
        model_class: SQLAlchemy model class
        
    Returns:
        List of resources if all found and owned by user
        
    Raises:
        HTTPException: If any resource not found or not owned by user
    """
    resources = db.query(model_class).filter(
        model_class.id.in_(resource_ids),
        model_class.user_id == user_id
    ).all()
    
    if len(resources) != len(resource_ids):
        found_ids = {str(r.id) for r in resources}
        missing_ids = set(resource_ids) - found_ids
        raise HTTPException(
            status_code=404,
            detail=f"{model_class.__name__}(s) not found: {', '.join(missing_ids)}"
        )
    
    return resources

def validate_resource_exists(
    db: Session,
    resource_id: str,
    model_class: Type[T],
    error_message: Optional[str] = None
) -> T:
    """
    Validate that a resource exists (without user ownership check).
    
    Args:
        db: Database session
        resource_id: ID of the resource to validate
        model_class: SQLAlchemy model class
        error_message: Custom error message
        
    Returns:
        The resource if found
        
    Raises:
        HTTPException: If resource not found
    """
    resource = db.query(model_class).filter(
        model_class.id == resource_id
    ).first()
    
    if not resource:
        message = error_message or f"{model_class.__name__} not found"
        raise HTTPException(status_code=404, detail=message)
    
    return resource