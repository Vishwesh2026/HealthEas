from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
import uuid
from datetime import datetime, timedelta
import json
import re
import base64
from pymongo import MongoClient
from google.cloud import vision
import httpx
from pathlib import Path

# Initialize FastAPI app
app = FastAPI(title="HealthEase API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
mongo_client = MongoClient(os.environ.get('MONGO_URL'))
db = mongo_client.healthease

# Google Cloud Vision client
vision_client = vision.ImageAnnotatorClient()

# Pydantic models
class UserProfile(BaseModel):
    name: str
    email: str
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    medical_history: Optional[List[str]] = []
    allergies: Optional[List[str]] = []
    emergency_contacts: Optional[List[dict]] = []

class AppointmentRequest(BaseModel):
    doctor_id: str
    patient_id: str
    date: str
    time: str
    type: str  # "online" or "offline"
    notes: Optional[str] = None

class SOSRequest(BaseModel):
    patient_id: str
    location: dict
    emergency_type: str
    notes: Optional[str] = None

# Medical value extraction patterns
MEDICAL_PATTERNS = {
    "glucose": r"(?:glucose|sugar)\s*(?:fasting)?\s*[:\-]?\s*(\d{2,3})\s*mg/dl",
    "hba1c": r"(?:hba1c|hemoglobin a1c)\s*[:\-]?\s*(\d\.\d)%?",
    "cholesterol": r"(?:cholesterol|total cholesterol)\s*[:\-]?\s*(\d{2,3})\s*mg/dl",
    "blood_pressure": r"(?:bp|blood pressure)\s*[:\-]?\s*(\d{2,3}/\d{2,3})",
    "heart_rate": r"(?:heart rate|pulse)\s*[:\-]?\s*(\d{2,3})\s*bpm",
    "weight": r"(?:weight)\s*[:\-]?\s*(\d{2,3}\.?\d?)\s*(?:kg|pounds|lbs)",
    "temperature": r"(?:temperature|temp)\s*[:\-]?\s*(\d{2,3}\.?\d?)\s*(?:f|c|°f|°c)"
}

def extract_medical_values(text: str) -> dict:
    """Extract structured medical values from OCR text"""
    results = {}
    text_lower = text.lower()
    
    for key, pattern in MEDICAL_PATTERNS.items():
        match = re.search(pattern, text_lower, re.IGNORECASE)
        if match:
            results[key] = match.group(1)
    
    return results

def get_current_user(session_id: str = Header(None, alias="X-Session-ID")):
    """Get current user from session"""
    if not session_id:
        raise HTTPException(status_code=401, detail="Session ID required")
    
    session = db.sessions.find_one({"session_id": session_id})
    if not session or session['expires_at'] < datetime.now():
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    user = db.users.find_one({"user_id": session['user_id']})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user

# Routes
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/api/auth/emergent")
async def auth_emergent_callback(session_data: dict):
    """Handle Emergent Auth callback"""
    try:
        session_id = session_data.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="Session ID required")
        
        # Call Emergent Auth API to get user data
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Invalid session")
            
            user_data = response.json()
        
        # Check if user exists
        existing_user = db.users.find_one({"email": user_data["email"]})
        
        if not existing_user:
            # Create new user
            user_id = str(uuid.uuid4())
            user_doc = {
                "user_id": user_id,
                "email": user_data["email"],
                "name": user_data["name"],
                "picture": user_data.get("picture"),
                "role": "patient",
                "created_at": datetime.now(),
                "profile": {
                    "medical_history": [],
                    "allergies": [],
                    "emergency_contacts": []
                }
            }
            db.users.insert_one(user_doc)
        else:
            user_id = existing_user["user_id"]
        
        # Create session
        session_token = str(uuid.uuid4())
        session_doc = {
            "session_id": session_id,
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": datetime.now() + timedelta(days=7),
            "created_at": datetime.now()
        }
        db.sessions.insert_one(session_doc)
        
        return {
            "session_token": session_token,
            "user": {
                "user_id": user_id,
                "email": user_data["email"],
                "name": user_data["name"],
                "picture": user_data.get("picture")
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get user profile"""
    return {
        "user_id": current_user["user_id"],
        "name": current_user["name"],
        "email": current_user["email"],
        "picture": current_user.get("picture"),
        "profile": current_user.get("profile", {})
    }

@app.put("/api/profile")
async def update_profile(profile: UserProfile, current_user: dict = Depends(get_current_user)):
    """Update user profile"""
    update_data = {
        "name": profile.name,
        "profile.age": profile.age,
        "profile.gender": profile.gender,
        "profile.blood_group": profile.blood_group,
        "profile.phone": profile.phone,
        "profile.medical_history": profile.medical_history,
        "profile.allergies": profile.allergies,
        "profile.emergency_contacts": profile.emergency_contacts,
        "updated_at": datetime.now()
    }
    
    db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update_data}
    )
    
    return {"message": "Profile updated successfully"}

@app.post("/api/reports/upload")
async def upload_medical_report(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and analyze medical reports using OCR"""
    results = []
    
    for file in files:
        try:
            # Validate file type
            if not file.content_type.startswith(('image/', 'application/pdf')):
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
            
            # Read file content
            file_content = await file.read()
            
            # Convert to base64 for storage
            file_base64 = base64.b64encode(file_content).decode('utf-8')
            
            # Perform OCR
            if file.content_type == 'application/pdf':
                # For PDF files, use async batch processing
                image = vision.Image(content=file_content)
                response = vision_client.document_text_detection(image=image)
                extracted_text = response.full_text_annotation.text if response.full_text_annotation else ""
            else:
                # For image files
                image = vision.Image(content=file_content)
                response = vision_client.document_text_detection(image=image)
                extracted_text = response.full_text_annotation.text if response.full_text_annotation else ""
            
            # Extract medical values
            medical_values = extract_medical_values(extracted_text)
            
            # Calculate confidence score (simple heuristic)
            confidence_score = min(0.95, len(medical_values) * 0.15 + 0.5)
            
            # Save to database
            report_id = str(uuid.uuid4())
            report_doc = {
                "report_id": report_id,
                "patient_id": current_user["user_id"],
                "filename": file.filename,
                "file_type": file.content_type,
                "file_data": file_base64,
                "extracted_text": extracted_text,
                "medical_values": medical_values,
                "confidence_score": confidence_score,
                "upload_date": datetime.now()
            }
            
            db.medical_reports.insert_one(report_doc)
            
            results.append({
                "report_id": report_id,
                "filename": file.filename,
                "extracted_text": extracted_text[:500] + "..." if len(extracted_text) > 500 else extracted_text,
                "medical_values": medical_values,
                "confidence_score": confidence_score
            })
            
        except Exception as e:
            results.append({
                "filename": file.filename,
                "error": str(e),
                "success": False
            })
    
    return {"results": results}

@app.get("/api/reports")
async def get_medical_reports(current_user: dict = Depends(get_current_user)):
    """Get all medical reports for current user"""
    reports = list(db.medical_reports.find(
        {"patient_id": current_user["user_id"]},
        {"file_data": 0}  # Exclude file data from response
    ).sort("upload_date", -1))
    
    for report in reports:
        report["_id"] = str(report["_id"])
    
    return {"reports": reports}

@app.get("/api/reports/{report_id}")
async def get_medical_report(report_id: str, current_user: dict = Depends(get_current_user)):
    """Get specific medical report"""
    report = db.medical_reports.find_one({
        "report_id": report_id,
        "patient_id": current_user["user_id"]
    })
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report["_id"] = str(report["_id"])
    return report

@app.get("/api/doctors")
async def get_doctors():
    """Get list of available doctors"""
    # Sample doctors data - in real app, this would come from database
    doctors = [
        {
            "doctor_id": "doc_001",
            "name": "Dr. Sarah Johnson",
            "specialty": "Cardiology",
            "rating": 4.8,
            "experience": "15 years",
            "consultation_fee": 150,
            "available_slots": ["09:00", "10:00", "11:00", "14:00", "15:00"],
            "image": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400"
        },
        {
            "doctor_id": "doc_002",
            "name": "Dr. Michael Chen",
            "specialty": "General Medicine",
            "rating": 4.6,
            "experience": "10 years",
            "consultation_fee": 100,
            "available_slots": ["08:00", "09:00", "13:00", "16:00", "17:00"],
            "image": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400"
        },
        {
            "doctor_id": "doc_003",
            "name": "Dr. Emily Watson",
            "specialty": "Pediatrics",
            "rating": 4.9,
            "experience": "12 years",
            "consultation_fee": 120,
            "available_slots": ["10:00", "11:00", "14:00", "15:00", "16:00"],
            "image": "https://images.unsplash.com/photo-1594824388558-b5f9c2b7e9fd?w=400"
        }
    ]
    
    return {"doctors": doctors}

@app.post("/api/appointments")
async def book_appointment(
    appointment: AppointmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Book an appointment with a doctor"""
    # Verify patient ID matches current user
    if appointment.patient_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Cannot book appointment for another user")
    
    # Create appointment
    appointment_id = str(uuid.uuid4())
    appointment_doc = {
        "appointment_id": appointment_id,
        "doctor_id": appointment.doctor_id,
        "patient_id": appointment.patient_id,
        "date": appointment.date,
        "time": appointment.time,
        "type": appointment.type,
        "notes": appointment.notes,
        "status": "scheduled",
        "created_at": datetime.now()
    }
    
    db.appointments.insert_one(appointment_doc)
    
    return {
        "appointment_id": appointment_id,
        "message": "Appointment booked successfully",
        "appointment": {
            "appointment_id": appointment_id,
            "doctor_id": appointment.doctor_id,
            "patient_id": appointment.patient_id,
            "date": appointment.date,
            "time": appointment.time,
            "type": appointment.type,
            "notes": appointment.notes,
            "status": "scheduled",
            "created_at": appointment_doc["created_at"].isoformat()
        }
    }

@app.get("/api/appointments")
async def get_appointments(current_user: dict = Depends(get_current_user)):
    """Get user's appointments"""
    appointments = list(db.appointments.find(
        {"patient_id": current_user["user_id"]}
    ).sort("date", 1))
    
    for appointment in appointments:
        appointment["_id"] = str(appointment["_id"])
    
    return {"appointments": appointments}

@app.get("/api/nearby-facilities")
async def get_nearby_facilities(lat: float, lon: float, type: str = "hospital"):
    """Get nearby medical facilities (mock data for demo)"""
    # In a real application, this would integrate with Google Places API
    # For now, returning mock data based on coordinates
    
    facilities = [
        {
            "facility_id": "fac_001",
            "name": "City General Hospital",
            "type": "hospital",
            "address": "123 Main Street, Downtown",
            "phone": "(555) 123-4567",
            "rating": 4.5,
            "distance": "0.8 km",
            "lat": lat + 0.005,
            "lng": lon + 0.005,
            "services": ["Emergency", "Surgery", "ICU", "Pharmacy"],
            "open_24_7": True
        },
        {
            "facility_id": "fac_002",
            "name": "MediCare Clinic",
            "type": "clinic",
            "address": "456 Oak Avenue, Midtown",
            "phone": "(555) 987-6543",
            "rating": 4.2,
            "distance": "1.2 km",
            "lat": lat - 0.008,
            "lng": lon + 0.003,
            "services": ["General Medicine", "Pediatrics", "Lab Tests"],
            "open_24_7": False
        },
        {
            "facility_id": "fac_003",
            "name": "QuickCare Pharmacy",
            "type": "pharmacy",
            "address": "789 Pine Street, Uptown",
            "phone": "(555) 456-7890",
            "rating": 4.0,
            "distance": "0.5 km",
            "lat": lat + 0.002,
            "lng": lon - 0.007,
            "services": ["Prescription", "OTC Medicine", "Health Supplies"],
            "open_24_7": False
        }
    ]
    
    # Filter by type if specified
    if type != "all":
        facilities = [f for f in facilities if f["type"] == type]
    
    return {"facilities": facilities}

@app.post("/api/sos")
async def trigger_sos(
    sos_request: SOSRequest,
    current_user: dict = Depends(get_current_user)
):
    """Trigger SOS emergency alert"""
    # Verify patient ID matches current user
    if sos_request.patient_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Cannot trigger SOS for another user")
    
    # Create SOS record
    sos_id = str(uuid.uuid4())
    sos_doc = {
        "sos_id": sos_id,
        "patient_id": sos_request.patient_id,
        "location": sos_request.location,
        "emergency_type": sos_request.emergency_type,
        "notes": sos_request.notes,
        "status": "active",
        "triggered_at": datetime.now(),
        "patient_info": {
            "name": current_user["name"],
            "blood_group": current_user.get("profile", {}).get("blood_group"),
            "medical_history": current_user.get("profile", {}).get("medical_history", []),
            "allergies": current_user.get("profile", {}).get("allergies", []),
            "emergency_contacts": current_user.get("profile", {}).get("emergency_contacts", [])
        }
    }
    
    db.sos_alerts.insert_one(sos_doc)
    
    # In a real application, this would:
    # 1. Send SMS to emergency contacts via Twilio
    # 2. Notify nearby hospitals
    # 3. Send email alerts via SendGrid
    
    return {
        "sos_id": sos_id,
        "message": "Emergency alert triggered successfully",
        "status": "Emergency services have been notified"
    }

@app.get("/api/medicines")
async def search_medicines(query: str = ""):
    """Search for medicines (mock data)"""
    medicines = [
        {
            "medicine_id": "med_001",
            "name": "Paracetamol 500mg",
            "generic_name": "Acetaminophen",
            "manufacturer": "ABC Pharma",
            "price": 5.99,
            "category": "Pain Relief",
            "prescription_required": False,
            "stock": 100
        },
        {
            "medicine_id": "med_002",
            "name": "Amoxicillin 250mg",
            "generic_name": "Amoxicillin",
            "manufacturer": "XYZ Labs",
            "price": 12.50,
            "category": "Antibiotic",
            "prescription_required": True,
            "stock": 50
        },
        {
            "medicine_id": "med_003",
            "name": "Lisinopril 10mg",
            "generic_name": "Lisinopril",
            "manufacturer": "MediCorp",
            "price": 8.75,
            "category": "Blood Pressure",
            "prescription_required": True,
            "stock": 75
        }
    ]
    
    if query:
        medicines = [m for m in medicines if query.lower() in m["name"].lower() or query.lower() in m["generic_name"].lower()]
    
    return {"medicines": medicines}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)