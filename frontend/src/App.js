import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Google Maps component (will be loaded dynamically)
const GoogleMapsComponent = ({ facilities, userLocation }) => {
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    if (window.google && userLocation) {
      const mapInstance = new window.google.maps.Map(document.getElementById('google-map'), {
        zoom: 13,
        center: userLocation,
        styles: [
          {
            featureType: 'poi.medical',
            stylers: [{ visibility: 'on' }]
          }
        ]
      });

      setMap(mapInstance);

      // Add user location marker
      new window.google.maps.Marker({
        position: userLocation,
        map: mapInstance,
        title: 'Your Location',
        icon: {
          url: 'data:image/svg+xml;base64,' + btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="8" fill="#3B82F6" stroke="white" stroke-width="3"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(32, 32)
        }
      });

      // Add facility markers
      const newMarkers = facilities.map(facility => {
        const marker = new window.google.maps.Marker({
          position: { lat: facility.lat, lng: facility.lng },
          map: mapInstance,
          title: facility.name,
          icon: {
            url: 'data:image/svg+xml;base64,' + btoa(`
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${
                facility.type === 'hospital' ? '#EF4444' : 
                facility.type === 'clinic' ? '#10B981' : '#F59E0B'
              }">
                <path d="M12 2L13.09 5.26L16 3L14.91 6.27L18 7L14.91 7.73L16 11L13.09 8.74L12 12L10.91 8.74L8 11L9.09 7.73L6 7L9.09 6.27L8 3L10.91 5.26L12 2Z"/>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(24, 24)
          }
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div class="p-3 max-w-xs">
              <h3 class="font-bold text-lg">${facility.name}</h3>
              <p class="text-sm text-gray-600">${facility.address}</p>
              <p class="text-sm text-gray-600">📞 ${facility.phone}</p>
              <p class="text-sm font-medium">⭐ ${facility.rating} | ${facility.distance}</p>
              <div class="mt-2">
                ${facility.services.map(service => `<span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-1 mb-1">${service}</span>`).join('')}
              </div>
            </div>
          `
        });

        marker.addListener('click', () => {
          infoWindow.open(mapInstance, marker);
        });

        return marker;
      });

      setMarkers(newMarkers);
    }
  }, [facilities, userLocation]);

  return <div id="google-map" className="w-full h-96 rounded-lg"></div>;
};

// Load Google Maps script
const loadGoogleMaps = (callback) => {
  if (window.google) {
    callback();
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.onload = callback;
  document.head.appendChild(script);
};

const App = () => {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // API base URL
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  // Auth functions
  const handleLogin = () => {
    const redirectUrl = window.location.origin + '/profile';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('session_token');
    localStorage.removeItem('user');
    setUser(null);
    setCurrentView('home');
  };

  // Get user location
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          fetchNearbyFacilities(location.lat, location.lng);
        },
        (error) => {
          console.error('Error getting location:', error);
          // Default to a sample location (San Francisco)
          const defaultLocation = { lat: 37.7749, lng: -122.4194 };
          setUserLocation(defaultLocation);
          fetchNearbyFacilities(defaultLocation.lat, defaultLocation.lng);
        }
      );
    }
  };

  // API functions
  const apiCall = async (endpoint, options = {}) => {
    const sessionToken = localStorage.getItem('session_token');
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (sessionToken) {
      config.headers['X-Session-ID'] = sessionToken;
    }

    try {
      const response = await axios(`${API_BASE}${endpoint}`, config);
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
      throw error;
    }
  };

  const fetchProfile = async () => {
    try {
      const data = await apiCall('/api/profile');
      setUser(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      const data = await apiCall('/api/reports');
      setReports(data.reports);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      const data = await apiCall('/api/doctors');
      setDoctors(data.doctors);
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const fetchAppointments = async () => {
    try {
      const data = await apiCall('/api/appointments');
      setAppointments(data.appointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchNearbyFacilities = async (lat, lng, type = 'all') => {
    try {
      const data = await apiCall(`/api/nearby-facilities?lat=${lat}&lon=${lng}&type=${type}`);
      setFacilities(data.facilities);
    } catch (error) {
      console.error('Error fetching facilities:', error);
    }
  };

  const uploadReport = async (files) => {
    try {
      setUploadProgress(0);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const sessionToken = localStorage.getItem('session_token');
      const response = await axios.post(`${API_BASE}/api/reports/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Session-ID': sessionToken
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      setUploadProgress(null);
      return response.data;
    } catch (error) {
      setUploadProgress(null);
      throw error;
    }
  };

  const bookAppointment = async (appointmentData) => {
    try {
      const data = await apiCall('/api/appointments', {
        method: 'POST',
        data: appointmentData
      });
      return data;
    } catch (error) {
      throw error;
    }
  };

  const triggerSOS = async () => {
    if (!userLocation) {
      alert('Location access required for SOS');
      return;
    }

    try {
      const sosData = {
        patient_id: user.user_id,
        location: userLocation,
        emergency_type: 'general',
        notes: 'Emergency assistance requested'
      };

      const data = await apiCall('/api/sos', {
        method: 'POST',
        data: sosData
      });

      alert('🚨 SOS Alert Sent!\n\nEmergency services have been notified.\nYour emergency contacts will be alerted.');
      return data;
    } catch (error) {
      console.error('Error triggering SOS:', error);
      alert('Failed to send SOS alert. Please try again.');
    }
  };

  // Initialize app
  useEffect(() => {
    // Check for auth callback
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    
    if (hash.includes('session_id=')) {
      const sessionId = hash.split('session_id=')[1];
      
      // Call backend to exchange session
      axios.post(`${API_BASE}/api/auth/emergent`, { session_id: sessionId })
        .then(response => {
          localStorage.setItem('session_token', response.data.session_token);
          localStorage.setItem('user', JSON.stringify(response.data.user));
          setUser(response.data.user);
          setCurrentView('dashboard');
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(error => {
          console.error('Auth error:', error);
        });
    } else {
      // Check existing session
      const sessionToken = localStorage.getItem('session_token');
      const userData = localStorage.getItem('user');
      
      if (sessionToken && userData) {
        setUser(JSON.parse(userData));
        setCurrentView('dashboard');
      }
    }

    // Load Google Maps
    loadGoogleMaps(() => {
      setMapsLoaded(true);
    });

    // Get user location
    getUserLocation();
  }, []);

  // Fetch data when user logs in
  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchReports();
      fetchDoctors();
      fetchAppointments();
    }
  }, [user]);

  // Landing Page Component
  const LandingPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">H</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">HealthEase</span>
            </div>
            <button
              onClick={handleLogin}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Login / Sign Up
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Smart Healthcare Management
              <span className="text-blue-600"> Made Simple</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Upload medical reports, get AI-powered analysis, find nearby hospitals, 
              book appointments, and manage your health - all in one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleLogin}
                className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Get Started Free
              </button>
              <button className="border-2 border-blue-600 text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-colors">
                Watch Demo
              </button>
            </div>
          </div>
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGhjYXJlJTIwdGVjaG5vbG9neXxlbnwwfHx8fDE3NTQyMzM1NTl8MA&ixlib=rb-4.1.0&q=85"
              alt="Healthcare Technology"
              className="rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything You Need for Better Health
            </h2>
            <p className="text-xl text-gray-600">
              Comprehensive healthcare management tools powered by AI
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📄</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">AI Report Analysis</h3>
              <p className="text-gray-600">
                Upload medical reports and get instant AI-powered analysis with extracted key values and insights.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🗺️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Find Nearby Care</h3>
              <p className="text-gray-600">
                Locate hospitals, clinics, and pharmacies near you with ratings, services, and directions.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📅</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Book Appointments</h3>
              <p className="text-gray-600">
                Schedule appointments with doctors easily and manage your healthcare calendar.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🚨</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Emergency SOS</h3>
              <p className="text-gray-600">
                Quick emergency assistance with automatic notifications to contacts and nearby hospitals.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💊</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Medicine Search</h3>
              <p className="text-gray-600">
                Search for medicines, check availability, and order from nearby pharmacies.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">👤</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Health Profile</h3>
              <p className="text-gray-600">
                Maintain comprehensive health records, allergies, and medical history in one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Take Control of Your Health?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of users managing their health smartly with HealthEase
          </p>
          <button
            onClick={handleLogin}
            className="bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Start Your Health Journey
          </button>
        </div>
      </section>
    </div>
  );

  // Dashboard Component
  const Dashboard = () => (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">H</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">HealthEase</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={triggerSOS}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                🚨 SOS
              </button>
              <div className="flex items-center space-x-2">
                {user?.picture ? (
                  <img src={user.picture} alt="Profile" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 text-sm">{user?.name?.[0] || 'U'}</span>
                  </div>
                )}
                <span className="text-gray-700 font-medium">{user?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
              { id: 'reports', label: 'Medical Reports', icon: '📄' },
              { id: 'appointments', label: 'Appointments', icon: '📅' },
              { id: 'map', label: 'Find Care', icon: '🗺️' },
              { id: 'profile', label: 'Profile', icon: '👤' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  currentView === item.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && <DashboardView />}
        {currentView === 'reports' && <ReportsView />}
        {currentView === 'appointments' && <AppointmentsView />}
        {currentView === 'map' && <MapView />}
        {currentView === 'profile' && <ProfileView />}
      </main>
    </div>
  );

  // Dashboard View
  const DashboardView = () => (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user?.name}!</h1>
        <p className="text-gray-600 mt-2">Here's your health overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Medical Reports</p>
              <p className="text-2xl font-bold text-gray-900">{reports.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📄</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Appointments</p>
              <p className="text-2xl font-bold text-gray-900">{appointments.length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Nearby Hospitals</p>
              <p className="text-2xl font-bold text-gray-900">{facilities.filter(f => f.type === 'hospital').length}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🏥</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Health Score</p>
              <p className="text-2xl font-bold text-gray-900">85%</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💚</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-white rounded-xl shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Recent Medical Reports</h2>
        </div>
        <div className="p-6">
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📄</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No reports yet</h3>
              <p className="text-gray-600 mb-4">Upload your first medical report to get AI-powered analysis</p>
              <button
                onClick={() => setCurrentView('reports')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Upload Report
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.slice(0, 3).map(report => (
                <div key={report.report_id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-lg">📄</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{report.filename}</h3>
                      <p className="text-sm text-gray-600">
                        Uploaded {new Date(report.upload_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-green-600 font-medium">
                      {(report.confidence_score * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Reports View
  const ReportsView = () => {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploadResults, setUploadResults] = useState(null);

    const handleFileSelect = (event) => {
      const files = Array.from(event.target.files);
      setSelectedFiles(files);
    };

    const handleUpload = async () => {
      if (selectedFiles.length === 0) return;

      try {
        setLoading(true);
        const results = await uploadReport(selectedFiles);
        setUploadResults(results);
        setSelectedFiles([]);
        fetchReports();
        
        // Reset file input
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';
      } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload reports. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Medical Reports</h1>
          <p className="text-gray-600 mt-2">Upload and analyze your medical reports with AI</p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Upload New Report</h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📄</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Medical Reports</h3>
            <p className="text-gray-600 mb-4">Support for PDF, JPG, PNG files up to 10MB each</p>
            
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label
              htmlFor="file-input"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors inline-block"
            >
              Choose Files
            </label>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-900 mb-2">Selected Files:</h4>
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">{file.name}</span>
                    <span className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 flex space-x-4">
                <button
                  onClick={handleUpload}
                  disabled={loading}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Upload & Analyze'}
                </button>
                <button
                  onClick={() => setSelectedFiles([])}
                  className="border border-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              </div>

              {uploadProgress !== null && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadResults && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-medium text-green-800 mb-2">Analysis Complete!</h4>
              <div className="space-y-2">
                {uploadResults.results.map((result, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium text-green-700">{result.filename}:</span>
                    {result.error ? (
                      <span className="text-red-600 ml-2">Error: {result.error}</span>
                    ) : (
                      <span className="text-green-600 ml-2">
                        Processed successfully ({(result.confidence_score * 100).toFixed(0)}% confidence)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reports List */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Your Medical Reports</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading reports...</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📄</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No reports uploaded yet</h3>
                <p className="text-gray-600">Upload your first medical report to get started with AI analysis</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {reports.map(report => (
                  <div key={report.report_id} className="border rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <span className="text-xl">📄</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{report.filename}</h3>
                          <p className="text-sm text-gray-600">
                            Uploaded {new Date(report.upload_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full">
                          {(report.confidence_score * 100).toFixed(0)}% Confidence
                        </span>
                      </div>
                    </div>

                    {Object.keys(report.medical_values).length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-medium text-gray-900 mb-2">Extracted Medical Values:</h4>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {Object.entries(report.medical_values).map(([key, value]) => (
                            <div key={key} className="bg-blue-50 p-3 rounded-lg">
                              <p className="text-sm font-medium text-blue-900 capitalize">
                                {key.replace('_', ' ')}
                              </p>
                              <p className="text-blue-700 font-semibold">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {report.extracted_text && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Extracted Text Preview:</h4>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <p className="text-sm text-gray-700 line-clamp-3">
                            {report.extracted_text.length > 300
                              ? report.extracted_text.substring(0, 300) + '...'
                              : report.extracted_text}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Appointments View
  const AppointmentsView = () => {
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [appointmentForm, setAppointmentForm] = useState({
      date: '',
      time: '',
      type: 'offline',
      notes: ''
    });

    const handleBookAppointment = async () => {
      if (!selectedDoctor || !appointmentForm.date || !appointmentForm.time) {
        alert('Please fill all required fields');
        return;
      }

      try {
        const appointmentData = {
          doctor_id: selectedDoctor.doctor_id,
          patient_id: user.user_id,
          ...appointmentForm
        };

        await bookAppointment(appointmentData);
        alert('Appointment booked successfully!');
        setSelectedDoctor(null);
        setAppointmentForm({ date: '', time: '', type: 'offline', notes: '' });
        fetchAppointments();
      } catch (error) {
        console.error('Booking error:', error);
        alert('Failed to book appointment. Please try again.');
      }
    };

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-600 mt-2">Book and manage your medical appointments</p>
        </div>

        {/* Available Doctors */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Available Doctors</h2>
          </div>
          <div className="p-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {doctors.map(doctor => (
                <div key={doctor.doctor_id} className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center space-x-4 mb-4">
                    <img
                      src={doctor.image}
                      alt={doctor.name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{doctor.name}</h3>
                      <p className="text-blue-600 font-medium">{doctor.specialty}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Experience:</span>
                      <span className="font-medium">{doctor.experience}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Rating:</span>
                      <span className="font-medium">⭐ {doctor.rating}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fee:</span>
                      <span className="font-medium">${doctor.consultation_fee}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedDoctor(doctor)}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Book Appointment
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Booking Form Modal */}
        {selectedDoctor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full m-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Book Appointment</h3>
                <button
                  onClick={() => setSelectedDoctor(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <div className="flex items-center space-x-3 mb-4">
                  <img
                    src={selectedDoctor.image}
                    alt={selectedDoctor.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h4 className="font-medium text-gray-900">{selectedDoctor.name}</h4>
                    <p className="text-blue-600">{selectedDoctor.specialty}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={appointmentForm.date}
                    onChange={(e) => setAppointmentForm({...appointmentForm, date: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <select
                    value={appointmentForm.time}
                    onChange={(e) => setAppointmentForm({...appointmentForm, time: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select time</option>
                    {selectedDoctor.available_slots.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={appointmentForm.type}
                    onChange={(e) => setAppointmentForm({...appointmentForm, type: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="offline">In-person</option>
                    <option value="online">Online consultation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                  <textarea
                    value={appointmentForm.notes}
                    onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                    rows={3}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Any specific concerns or notes..."
                  />
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={handleBookAppointment}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Book Appointment
                  </button>
                  <button
                    onClick={() => setSelectedDoctor(null)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Appointments */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Your Appointments</h2>
          </div>
          <div className="p-6">
            {appointments.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📅</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments scheduled</h3>
                <p className="text-gray-600">Book your first appointment with a doctor</p>
              </div>
            ) : (
              <div className="space-y-4">
                {appointments.map(appointment => (
                  <div key={appointment.appointment_id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <span className="text-xl">👨‍⚕️</span>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">
                            Doctor ID: {appointment.doctor_id}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {appointment.date} at {appointment.time}
                          </p>
                          <p className="text-sm text-blue-600 capitalize">
                            {appointment.type} consultation
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                          appointment.status === 'scheduled' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {appointment.status}
                        </span>
                      </div>
                    </div>
                    {appointment.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{appointment.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Map View
  const MapView = () => {
    const [facilityType, setFacilityType] = useState('all');

    const handleFacilityTypeChange = (type) => {
      setFacilityType(type);
      if (userLocation) {
        fetchNearbyFacilities(userLocation.lat, userLocation.lng, type);
      }
    };

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Find Nearby Care</h1>
          <p className="text-gray-600 mt-2">Locate hospitals, clinics, and pharmacies near you</p>
        </div>

        {/* Filter Buttons */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Filter Facilities</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'all', label: 'All Facilities', icon: '🏥' },
              { id: 'hospital', label: 'Hospitals', icon: '🏥' },
              { id: 'clinic', label: 'Clinics', icon: '🏢' },
              { id: 'pharmacy', label: 'Pharmacies', icon: '💊' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => handleFacilityTypeChange(type.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  facilityType === type.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Map View</h2>
          {mapsLoaded && userLocation ? (
            <GoogleMapsComponent facilities={facilities} userLocation={userLocation} />
          ) : (
            <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading map...</p>
              </div>
            </div>
          )}
        </div>

        {/* Facilities List */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Nearby Facilities</h2>
          </div>
          <div className="p-6">
            {facilities.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🏥</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No facilities found</h3>
                <p className="text-gray-600">Try changing the filter or check your location settings</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {facilities.map(facility => (
                  <div key={facility.facility_id} className="border rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          facility.type === 'hospital' ? 'bg-red-100' :
                          facility.type === 'clinic' ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                          <span className="text-xl">
                            {facility.type === 'hospital' ? '🏥' : 
                             facility.type === 'clinic' ? '🏢' : '💊'}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{facility.name}</h3>
                          <p className="text-gray-600">{facility.address}</p>
                          <p className="text-gray-600">📞 {facility.phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-yellow-500">⭐</span>
                          <span className="font-medium">{facility.rating}</span>
                        </div>
                        <p className="text-sm text-gray-600">{facility.distance}</p>
                        {facility.open_24_7 && (
                          <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full mt-1">
                            24/7 Open
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <h4 className="font-medium text-gray-900 mb-2">Services:</h4>
                      <div className="flex flex-wrap gap-2">
                        {facility.services.map(service => (
                          <span
                            key={service}
                            className="inline-block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full"
                          >
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex space-x-4">
                      <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        Get Directions
                      </button>
                      <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        Call Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Profile View
  const ProfileView = () => {
    const [editing, setEditing] = useState(false);
    const [profileData, setProfileData] = useState({
      name: user?.name || '',
      age: user?.profile?.age || '',
      gender: user?.profile?.gender || '',
      blood_group: user?.profile?.blood_group || '',
      phone: user?.profile?.phone || '',
      medical_history: user?.profile?.medical_history || [],
      allergies: user?.profile?.allergies || [],
      emergency_contacts: user?.profile?.emergency_contacts || []
    });

    const handleSave = async () => {
      try {
        await apiCall('/api/profile', {
          method: 'PUT',
          data: {
            ...profileData,
            email: user.email
          }
        });
        setEditing(false);
        fetchProfile();
        alert('Profile updated successfully!');
      } catch (error) {
        console.error('Profile update error:', error);
        alert('Failed to update profile. Please try again.');
      }
    };

    const addMedicalHistory = () => {
      setProfileData({
        ...profileData,
        medical_history: [...profileData.medical_history, '']
      });
    };

    const updateMedicalHistory = (index, value) => {
      const updated = [...profileData.medical_history];
      updated[index] = value;
      setProfileData({...profileData, medical_history: updated});
    };

    const removeMedicalHistory = (index) => {
      const updated = profileData.medical_history.filter((_, i) => i !== index);
      setProfileData({...profileData, medical_history: updated});
    };

    const addAllergy = () => {
      setProfileData({
        ...profileData,
        allergies: [...profileData.allergies, '']
      });
    };

    const updateAllergy = (index, value) => {
      const updated = [...profileData.allergies];
      updated[index] = value;
      setProfileData({...profileData, allergies: updated});
    };

    const removeAllergy = (index) => {
      const updated = profileData.allergies.filter((_, i) => i !== index);
      setProfileData({...profileData, allergies: updated});
    };

    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
            <p className="text-gray-600 mt-2">Manage your health information and settings</p>
          </div>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {editing ? 'Save Changes' : 'Edit Profile'}
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="text-center mb-6">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt="Profile"
                  className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
                />
              ) : (
                <div className="w-24 h-24 bg-gray-300 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-gray-600 text-2xl">{user?.name?.[0] || 'U'}</span>
                </div>
              )}
              <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
              <p className="text-gray-600">{user?.email}</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Member since:</span>
                <span className="font-medium">Jan 2025</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reports uploaded:</span>
                <span className="font-medium">{reports.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Appointments:</span>
                <span className="font-medium">{appointments.length}</span>
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  {editing ? (
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="p-2 text-gray-900">{profileData.name || 'Not provided'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                  {editing ? (
                    <input
                      type="number"
                      value={profileData.age}
                      onChange={(e) => setProfileData({...profileData, age: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="p-2 text-gray-900">{profileData.age || 'Not provided'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  {editing ? (
                    <select
                      value={profileData.gender}
                      onChange={(e) => setProfileData({...profileData, gender: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <p className="p-2 text-gray-900 capitalize">{profileData.gender || 'Not provided'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                  {editing ? (
                    <select
                      value={profileData.blood_group}
                      onChange={(e) => setProfileData({...profileData, blood_group: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select blood group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  ) : (
                    <p className="p-2 text-gray-900">{profileData.blood_group || 'Not provided'}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  {editing ? (
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="p-2 text-gray-900">{profileData.phone || 'Not provided'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Medical History */}
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Medical History</h3>
                {editing && (
                  <button
                    onClick={addMedicalHistory}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    + Add Condition
                  </button>
                )}
              </div>

              {profileData.medical_history.length === 0 ? (
                <p className="text-gray-600 text-center py-4">No medical history recorded</p>
              ) : (
                <div className="space-y-3">
                  {profileData.medical_history.map((condition, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={condition}
                            onChange={(e) => updateMedicalHistory(index, e.target.value)}
                            placeholder="Enter medical condition"
                            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => removeMedicalHistory(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 p-2 bg-red-50 text-red-800 rounded-lg">
                          {condition}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Allergies */}
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Allergies</h3>
                {editing && (
                  <button
                    onClick={addAllergy}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    + Add Allergy
                  </button>
                )}
              </div>

              {profileData.allergies.length === 0 ? (
                <p className="text-gray-600 text-center py-4">No allergies recorded</p>
              ) : (
                <div className="space-y-3">
                  {profileData.allergies.map((allergy, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={allergy}
                            onChange={(e) => updateAllergy(index, e.target.value)}
                            placeholder="Enter allergy"
                            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => removeAllergy(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 p-2 bg-yellow-50 text-yellow-800 rounded-lg">
                          {allergy}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {editing && (
          <div className="flex justify-end space-x-4">
            <button
              onClick={() => setEditing(false)}
              className="border border-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="App">
      {user ? <Dashboard /> : <LandingPage />}
    </div>
  );
};

export default App;