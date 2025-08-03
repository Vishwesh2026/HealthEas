from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from pymongo import MongoClient

# Test minimal server
app = FastAPI(title="HealthEase Test API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Test MongoDB connection
try:
    mongo_client = MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017/healthease'))
    db = mongo_client.healthease
    mongo_client.admin.command('ping')
    mongo_status = "connected"
except Exception as e:
    mongo_status = f"error: {e}"

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy", 
        "mongo": mongo_status,
        "env_mongo_url": os.environ.get('MONGO_URL', 'not set')
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)