# Patient Monitoring System

A full-stack patient monitoring system with real-time vitals tracking, SQLite database, and MQTT integration.

## Architecture

- **Frontend**: React TypeScript with Tailwind CSS
- **Backend**: Node.js Express server with SQLite database
- **Real-time**: MQTT integration for ESP32 device data
- **Database**: SQLite for data persistence

## Features

- Real-time patient vitals monitoring (Heart Rate, SpO2)
- Patient management with CRUD operations
- Automatic alert generation based on vital thresholds
- Dashboard with system statistics
- MQTT integration for IoT device connectivity
- Responsive web interface

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the backend server:
   ```bash
   npm start
   ```

   The backend will run on http://localhost:3001

### Frontend Setup

1. Install frontend dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will run on http://localhost:5173

## MQTT Integration

The system integrates with MQTT for real-time data from ESP32 devices:

- **Broker**: broker.hivemq.com (public MQTT broker)
- **Topic**: `patient_monitoring/vitals/{patient_id}`
- **Data Format**: JSON with `patient_id`, `heart_rate`, `spo2`

### Example ESP32 MQTT Message

```json
{
  "patient_id": "P001",
  "heart_rate": 72,
  "spo2": 98
}
```

## Alert System

Automatic alerts are generated when:
- Heart Rate > 100 bpm (Warning)
- SpO2 < 90% (Critical)

## Database Schema

The SQLite database includes:
- **Patients**: Patient information
- **Vitals**: Real-time vital signs data
- **Alerts**: System alerts and notifications

## API Endpoints

See `backend/README.md` for detailed API documentation.

## Development

- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express + SQLite3 + MQTT
- Build tool: Vite
- Package manager: npm

## Running Both Services

1. Terminal 1 - Backend:
   ```bash
   cd backend && npm start
   ```

2. Terminal 2 - Frontend:
   ```bash
   npm run dev
   ```

The application will be available at http://localhost:5173 with backend API at http://localhost:3001
