from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router
from app.core.config import settings
from app.db.base import Base, engine
import os

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Dynamic CORS configuration
def get_cors_origins():
    if os.getenv("ENVIRONMENT") == "production":
        # In production, specify exact domains
        return [
            "https://placeholder.com",
            "https://www.placeholder.com"
        ]
    else:
        # In development, allow local network access
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://192.168.10.133:3000",
            # Allow any local network IP on port 3000
            "http://192.168.1.*:3000",   # Common router range
            "http://192.168.10.*:3000",   # Common router range
            "http://192.168.0.*:3000",   # Common router range  
            "http://10.*.*.*:3000",      # Private network range
            # Or for maximum flexibility in development:
            # "*"
        ]

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], #get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}