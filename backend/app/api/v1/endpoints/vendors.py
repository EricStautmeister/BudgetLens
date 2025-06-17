from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user
from app.db.base import get_db
from app.db.models import User, Vendor
from app.schemas.vendor import Vendor as VendorSchema, VendorCreate, VendorUpdate
from app.services.categorization import CategorizationService
from app.services.vendor_intelligence import VendorIntelligenceService
from uuid import UUID
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class VendorSuggestionRequest(BaseModel):
    description: str

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

@router.get("/suggest")
async def suggest_vendors_for_transaction(
    description: str = Query(..., description="Transaction description to analyze"),
    limit: int = Query(5, description="Maximum number of suggestions to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Get intelligent vendor suggestions for a transaction description.
    Uses n-gram windowing and hierarchical grouping for smart vendor matching.
    """
    try:
        intelligence_service = VendorIntelligenceService(db, str(current_user.id))
        suggestions = intelligence_service.suggest_intelligent_vendor_grouping(description, limit)
        
        return {
            "description": description,
            "suggestions": suggestions,
            "total_suggestions": len(suggestions),
            "has_hierarchical_matches": any(s.get("is_hierarchical_match", False) for s in suggestions),
            "has_grouped_vendors": any(s.get("is_part_of_group", False) for s in suggestions)
        }
    except Exception as e:
        logger.error(f"Error generating vendor suggestions: {e}")
        # Fallback to categorization service
        categorization_service = CategorizationService(db, str(current_user.id))
        fallback_suggestions = categorization_service.get_vendor_suggestions(description, limit)
        
        return {
            "description": description,
            "suggestions": fallback_suggestions,
            "total_suggestions": len(fallback_suggestions),
            "has_hierarchical_matches": False,
            "has_grouped_vendors": False,
            "fallback_used": True
        }

@router.get("/hierarchy-analysis")
async def analyze_vendor_hierarchies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Analyze existing vendors to find potential hierarchical relationships.
    Useful for understanding vendor grouping opportunities.
    """
    try:
        intelligence_service = VendorIntelligenceService(db, str(current_user.id))
        hierarchies = intelligence_service.find_vendor_hierarchies()
        
        # Convert to serializable format
        serializable_hierarchies = {}
        for parent, children_list in hierarchies.items():
            serializable_hierarchies[parent] = []
            for child_info in children_list:
                serializable_hierarchies[parent].append({
                    "child_vendor_id": str(child_info["child_vendor"].id),
                    "child_vendor_name": child_info["child_vendor"].name,
                    "confidence": child_info["confidence"],
                    "other_children": [
                        {
                            "vendor_id": str(other["vendor"].id),
                            "vendor_name": other["vendor"].name,
                            "similarity": other["similarity"]
                        }
                        for other in child_info["other_children"]
                    ]
                })
        
        return {
            "hierarchies": serializable_hierarchies,
            "total_parent_brands": len(serializable_hierarchies),
            "total_relationships": sum(len(children) for children in serializable_hierarchies.values())
        }
    except Exception as e:
        logger.error(f"Error analyzing vendor hierarchies: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze vendor hierarchies")

@router.post("/comprehensive-suggestion")
async def get_comprehensive_vendor_suggestion(
    request: VendorSuggestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Get comprehensive vendor analysis including hierarchy suggestions and n-gram breakdown.
    This is the main endpoint for the transaction review UI.
    """
    try:
        intelligence_service = VendorIntelligenceService(db, str(current_user.id))
        comprehensive_analysis = intelligence_service.create_vendor_hierarchy_suggestion(request.description)
        
        return {
            "success": True,
            "analysis": comprehensive_analysis
        }
    except Exception as e:
        logger.error(f"Error in comprehensive vendor suggestion: {e}")
        # Fallback to basic analysis
        categorization_service = CategorizationService(db, str(current_user.id))
        vendor_text = categorization_service.extract_vendor_from_description(request.description)
        suggestions = categorization_service.get_vendor_suggestions(request.description, 5)
        
        return {
            "success": False,
            "fallback_used": True,
            "analysis": {
                "extracted_vendor_text": vendor_text,
                "suggested_new_vendor_name": vendor_text.title(),
                "top_ngrams": [],
                "existing_vendor_matches": suggestions,
                "should_create_new": len(suggestions) == 0,
                "hierarchy_analysis": {
                    "can_join_existing_group": False,
                    "suggested_parent": None,
                    "potential_children": [],
                    "hierarchy_confidence": 0.0
                }
            },
            "error": str(e)
        }