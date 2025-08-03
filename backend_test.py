#!/usr/bin/env python3
"""
HealthEase Backend API Comprehensive Test Suite
Tests all backend endpoints systematically based on priority
"""

import requests
import json
import base64
import os
import time
from datetime import datetime
from typing import Dict, Any

# Configuration
BACKEND_URL = "https://medismart.preview.emergentagent.com/api"
TEST_SESSION_ID = "test_session_12345"  # Mock session for testing

class HealthEaseAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session_id = None
        self.user_data = None
        self.test_results = {}
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results[test_name] = {
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
    
    def test_health_check(self):
        """Test basic health check endpoint"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "status" in data and data["status"] == "healthy":
                    self.log_test("Health Check", True, f"Status: {data['status']}")
                    return True
                else:
                    self.log_test("Health Check", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("Health Check", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Health Check", False, f"Exception: {str(e)}")
            return False
    
    def test_auth_system(self):
        """Test Authentication System - Emergent Auth Integration"""
        try:
            # Test auth callback endpoint
            auth_data = {
                "session_id": TEST_SESSION_ID
            }
            
            response = requests.post(
                f"{self.base_url}/auth/emergent",
                json=auth_data,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "session_token" in data and "user" in data:
                    self.session_id = TEST_SESSION_ID
                    self.user_data = data["user"]
                    self.log_test("Authentication - Emergent Auth", True, 
                                f"User: {data['user']['name']}, Token received")
                    return True
                else:
                    self.log_test("Authentication - Emergent Auth", False, 
                                f"Missing required fields in response: {data}")
                    return False
            else:
                # This might fail due to external API dependency - that's expected
                self.log_test("Authentication - Emergent Auth", False, 
                            f"HTTP {response.status_code} - External API dependency issue")
                # Create mock session for further testing
                self.session_id = TEST_SESSION_ID
                self.user_data = {
                    "user_id": "test_user_123",
                    "name": "Dr. Sarah Johnson",
                    "email": "sarah.johnson@healthease.com"
                }
                return False
                
        except Exception as e:
            self.log_test("Authentication - Emergent Auth", False, f"Exception: {str(e)}")
            # Create mock session for further testing
            self.session_id = TEST_SESSION_ID
            self.user_data = {
                "user_id": "test_user_123", 
                "name": "Dr. Sarah Johnson",
                "email": "sarah.johnson@healthease.com"
            }
            return False
    
    def test_profile_management(self):
        """Test User Profile Management"""
        if not self.session_id:
            self.log_test("Profile Management - Get Profile", False, "No session available")
            return False
            
        headers = {"X-Session-ID": self.session_id}
        
        # Test GET profile
        try:
            response = requests.get(f"{self.base_url}/profile", headers=headers, timeout=10)
            
            if response.status_code == 200:
                profile_data = response.json()
                self.log_test("Profile Management - Get Profile", True, 
                            f"Retrieved profile for: {profile_data.get('name', 'Unknown')}")
            elif response.status_code == 401:
                self.log_test("Profile Management - Get Profile", False, 
                            "Authentication required - session not valid")
                return False
            else:
                self.log_test("Profile Management - Get Profile", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Profile Management - Get Profile", False, f"Exception: {str(e)}")
            return False
        
        # Test PUT profile update
        try:
            update_data = {
                "name": "Dr. Sarah Johnson",
                "email": "sarah.johnson@healthease.com",
                "age": 35,
                "gender": "Female",
                "blood_group": "O+",
                "phone": "+1-555-0123",
                "medical_history": ["Hypertension", "Diabetes Type 2"],
                "allergies": ["Penicillin", "Shellfish"],
                "emergency_contacts": [
                    {"name": "John Johnson", "phone": "+1-555-0124", "relation": "Spouse"}
                ]
            }
            
            response = requests.put(
                f"{self.base_url}/profile",
                json=update_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_test("Profile Management - Update Profile", True, "Profile updated successfully")
                return True
            else:
                self.log_test("Profile Management - Update Profile", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Profile Management - Update Profile", False, f"Exception: {str(e)}")
            return False
    
    def test_ocr_medical_reports(self):
        """Test OCR Medical Report Analysis - Google Cloud Vision API"""
        if not self.session_id:
            self.log_test("OCR Medical Reports", False, "No session available")
            return False
            
        headers = {"X-Session-ID": self.session_id}
        
        # Create a simple test image with medical text (base64 encoded)
        # This is a minimal PNG image with some text-like content
        test_image_data = b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        
        try:
            # Test file upload endpoint
            files = {
                'files': ('test_report.png', test_image_data, 'image/png')
            }
            
            response = requests.post(
                f"{self.base_url}/reports/upload",
                files=files,
                headers=headers,
                timeout=30  # OCR might take longer
            )
            
            if response.status_code == 200:
                data = response.json()
                if "results" in data and len(data["results"]) > 0:
                    result = data["results"][0]
                    if "report_id" in result:
                        self.log_test("OCR Medical Reports - Upload", True, 
                                    f"Report uploaded with ID: {result['report_id']}")
                        
                        # Test getting reports list
                        self.test_get_medical_reports(headers)
                        
                        # Test getting specific report
                        self.test_get_specific_report(headers, result['report_id'])
                        
                        return True
                    else:
                        self.log_test("OCR Medical Reports - Upload", False, 
                                    f"No report_id in response: {result}")
                        return False
                else:
                    self.log_test("OCR Medical Reports - Upload", False, 
                                f"Invalid response format: {data}")
                    return False
            else:
                self.log_test("OCR Medical Reports - Upload", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("OCR Medical Reports - Upload", False, f"Exception: {str(e)}")
            return False
    
    def test_get_medical_reports(self, headers):
        """Test getting all medical reports"""
        try:
            response = requests.get(f"{self.base_url}/reports", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "reports" in data:
                    self.log_test("OCR Medical Reports - Get All", True, 
                                f"Retrieved {len(data['reports'])} reports")
                    return True
                else:
                    self.log_test("OCR Medical Reports - Get All", False, 
                                f"Invalid response format: {data}")
                    return False
            else:
                self.log_test("OCR Medical Reports - Get All", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("OCR Medical Reports - Get All", False, f"Exception: {str(e)}")
            return False
    
    def test_get_specific_report(self, headers, report_id):
        """Test getting specific medical report"""
        try:
            response = requests.get(
                f"{self.base_url}/reports/{report_id}", 
                headers=headers, 
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "report_id" in data and data["report_id"] == report_id:
                    self.log_test("OCR Medical Reports - Get Specific", True, 
                                f"Retrieved report: {report_id}")
                    return True
                else:
                    self.log_test("OCR Medical Reports - Get Specific", False, 
                                f"Invalid response: {data}")
                    return False
            else:
                self.log_test("OCR Medical Reports - Get Specific", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("OCR Medical Reports - Get Specific", False, f"Exception: {str(e)}")
            return False
    
    def test_appointment_system(self):
        """Test Appointment Booking System"""
        if not self.session_id:
            self.log_test("Appointment System", False, "No session available")
            return False
            
        headers = {"X-Session-ID": self.session_id}
        
        # Test getting doctors list
        try:
            response = requests.get(f"{self.base_url}/doctors", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "doctors" in data and len(data["doctors"]) > 0:
                    self.log_test("Appointment System - Get Doctors", True, 
                                f"Retrieved {len(data['doctors'])} doctors")
                    
                    # Test booking appointment
                    doctor_id = data["doctors"][0]["doctor_id"]
                    self.test_book_appointment(headers, doctor_id)
                    
                    # Test getting appointments
                    self.test_get_appointments(headers)
                    
                    return True
                else:
                    self.log_test("Appointment System - Get Doctors", False, 
                                f"No doctors found: {data}")
                    return False
            else:
                self.log_test("Appointment System - Get Doctors", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Appointment System - Get Doctors", False, f"Exception: {str(e)}")
            return False
    
    def test_book_appointment(self, headers, doctor_id):
        """Test booking an appointment"""
        try:
            # Get the correct user ID from the test session
            user_id = "03d53cea-ce7c-4086-8a33-c128e3f3fdcc"  # Use the actual test user ID
            
            appointment_data = {
                "doctor_id": doctor_id,
                "patient_id": user_id,
                "date": "2025-01-20",
                "time": "10:00",
                "type": "online",
                "notes": "Regular checkup appointment"
            }
            
            response = requests.post(
                f"{self.base_url}/appointments",
                json=appointment_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "appointment_id" in data:
                    self.log_test("Appointment System - Book Appointment", True, 
                                f"Booked appointment: {data['appointment_id']}")
                    return True
                else:
                    self.log_test("Appointment System - Book Appointment", False, 
                                f"No appointment_id in response: {data}")
                    return False
            else:
                self.log_test("Appointment System - Book Appointment", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Appointment System - Book Appointment", False, f"Exception: {str(e)}")
            return False
    
    def test_get_appointments(self, headers):
        """Test getting user appointments"""
        try:
            response = requests.get(f"{self.base_url}/appointments", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "appointments" in data:
                    self.log_test("Appointment System - Get Appointments", True, 
                                f"Retrieved {len(data['appointments'])} appointments")
                    return True
                else:
                    self.log_test("Appointment System - Get Appointments", False, 
                                f"Invalid response format: {data}")
                    return False
            else:
                self.log_test("Appointment System - Get Appointments", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Appointment System - Get Appointments", False, f"Exception: {str(e)}")
            return False
    
    def test_nearby_facilities(self):
        """Test Nearby Medical Facilities API"""
        try:
            # Test with sample coordinates (New York City)
            params = {
                "lat": 40.7128,
                "lon": -74.0060,
                "type": "hospital"
            }
            
            response = requests.get(
                f"{self.base_url}/nearby-facilities",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "facilities" in data and len(data["facilities"]) > 0:
                    self.log_test("Nearby Facilities - Hospital", True, 
                                f"Found {len(data['facilities'])} hospitals")
                    
                    # Test different facility types
                    self.test_facility_type("clinic", 40.7128, -74.0060)
                    self.test_facility_type("pharmacy", 40.7128, -74.0060)
                    
                    return True
                else:
                    self.log_test("Nearby Facilities - Hospital", False, 
                                f"No facilities found: {data}")
                    return False
            else:
                self.log_test("Nearby Facilities - Hospital", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Nearby Facilities - Hospital", False, f"Exception: {str(e)}")
            return False
    
    def test_facility_type(self, facility_type, lat, lon):
        """Test specific facility type"""
        try:
            params = {"lat": lat, "lon": lon, "type": facility_type}
            response = requests.get(
                f"{self.base_url}/nearby-facilities",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "facilities" in data:
                    self.log_test(f"Nearby Facilities - {facility_type.title()}", True, 
                                f"Found {len(data['facilities'])} {facility_type}s")
                    return True
                else:
                    self.log_test(f"Nearby Facilities - {facility_type.title()}", False, 
                                f"Invalid response: {data}")
                    return False
            else:
                self.log_test(f"Nearby Facilities - {facility_type.title()}", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test(f"Nearby Facilities - {facility_type.title()}", False, f"Exception: {str(e)}")
            return False
    
    def test_sos_emergency(self):
        """Test SOS Emergency System"""
        if not self.session_id:
            self.log_test("SOS Emergency System", False, "No session available")
            return False
            
        headers = {"X-Session-ID": self.session_id}
        
        try:
            # Use the correct user ID from the test session
            user_id = "03d53cea-ce7c-4086-8a33-c128e3f3fdcc"  # Use the actual test user ID
            
            sos_data = {
                "patient_id": user_id,
                "location": {
                    "lat": 40.7128,
                    "lng": -74.0060,
                    "address": "123 Emergency Street, New York, NY"
                },
                "emergency_type": "Medical Emergency",
                "notes": "Patient experiencing chest pain and difficulty breathing"
            }
            
            response = requests.post(
                f"{self.base_url}/sos",
                json=sos_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "sos_id" in data and "message" in data:
                    self.log_test("SOS Emergency System", True, 
                                f"SOS triggered: {data['sos_id']}")
                    return True
                else:
                    self.log_test("SOS Emergency System", False, 
                                f"Invalid response format: {data}")
                    return False
            else:
                self.log_test("SOS Emergency System", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("SOS Emergency System", False, f"Exception: {str(e)}")
            return False
    
    def test_medicine_search(self):
        """Test Medicine Search API"""
        try:
            # Test search without query
            response = requests.get(f"{self.base_url}/medicines", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "medicines" in data and len(data["medicines"]) > 0:
                    self.log_test("Medicine Search - All", True, 
                                f"Retrieved {len(data['medicines'])} medicines")
                    
                    # Test search with query
                    self.test_medicine_search_query("paracetamol")
                    
                    return True
                else:
                    self.log_test("Medicine Search - All", False, 
                                f"No medicines found: {data}")
                    return False
            else:
                self.log_test("Medicine Search - All", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Medicine Search - All", False, f"Exception: {str(e)}")
            return False
    
    def test_medicine_search_query(self, query):
        """Test medicine search with specific query"""
        try:
            params = {"query": query}
            response = requests.get(f"{self.base_url}/medicines", params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "medicines" in data:
                    self.log_test(f"Medicine Search - Query '{query}'", True, 
                                f"Found {len(data['medicines'])} medicines")
                    return True
                else:
                    self.log_test(f"Medicine Search - Query '{query}'", False, 
                                f"Invalid response: {data}")
                    return False
            else:
                self.log_test(f"Medicine Search - Query '{query}'", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test(f"Medicine Search - Query '{query}'", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in priority order"""
        print("=" * 60)
        print("HealthEase Backend API Comprehensive Test Suite")
        print("=" * 60)
        print(f"Testing Backend URL: {self.base_url}")
        print(f"Test Started: {datetime.now().isoformat()}")
        print("=" * 60)
        
        # High Priority Tests
        print("\n🔥 HIGH PRIORITY TESTS")
        print("-" * 30)
        self.test_health_check()
        self.test_auth_system()
        self.test_profile_management()
        self.test_ocr_medical_reports()
        self.test_sos_emergency()
        
        # Medium Priority Tests
        print("\n⚡ MEDIUM PRIORITY TESTS")
        print("-" * 30)
        self.test_appointment_system()
        self.test_nearby_facilities()
        
        # Low Priority Tests
        print("\n📋 LOW PRIORITY TESTS")
        print("-" * 30)
        self.test_medicine_search()
        
        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results.values() if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            for test_name, result in self.test_results.items():
                if not result["success"]:
                    print(f"   • {test_name}: {result['details']}")
        
        print(f"\nTest Completed: {datetime.now().isoformat()}")
        print("=" * 60)
        
        return passed_tests, failed_tests

if __name__ == "__main__":
    tester = HealthEaseAPITester()
    passed, failed = tester.run_all_tests()
    
    # Exit with appropriate code
    exit(0 if failed == 0 else 1)