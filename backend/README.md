# Patient Monitoring Backend

This backend provides REST API endpoints and MQTT integration for the patient monitoring system.

## Features

- SQLite database for storing patients, vitals, and alerts
- REST API endpoints for CRUD operations
- MQTT integration for real-time vitals data from ESP32 devices
- Automatic alert generation based on vital signs thresholds

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

The server will run on http://localhost:3001

## API Endpoints

### Patients
- `GET /api/patients` - Get all patients with latest vitals
- `POST /api/patients` - Add new patient

### Vitals
- `GET /api/vitals` - Get all vitals (latest 100)
- `GET /api/vitals/:patientId` - Get vitals for specific patient

### Alerts
- `GET /api/alerts` - Get unacknowledged alerts
- `PUT /api/alerts/:id/acknowledge` - Acknowledge an alert

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## MQTT Integration

The server connects to a public MQTT broker (broker.hivemq.com) and subscribes to `patient_monitoring/vitals/#` topics.

### Publishing Vitals Data

ESP32 devices should publish vitals data in JSON format:

```json
{
  "patient_id": "P001",
  "heart_rate": 72,
  "spo2": 98
}
```

Topic format: `patient_monitoring/vitals/{patient_id}`

### Alert Thresholds

- High Heart Rate: > 100 bpm
- Low SpO2: < 90%

## Database Schema

### Patients Table
- id (TEXT, PRIMARY KEY)
- name (TEXT)
- contact (TEXT)
- room (TEXT)
- created_at (DATETIME)

### Vitals Table
- id (INTEGER, PRIMARY KEY)
- patient_id (TEXT, FOREIGN KEY)
- heart_rate (INTEGER)
- spo2 (INTEGER)
- timestamp (DATETIME)

### Alerts Table
- id (INTEGER, PRIMARY KEY)
- patient_id (TEXT, FOREIGN KEY)
- type (TEXT)
- severity (TEXT)
- message (TEXT)
- heart_rate (INTEGER)
- spo2 (INTEGER)
- timestamp (DATETIME)
- acknowledged (BOOLEAN)
