// Clean single-file Express backend
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

app.use(cors());
app.use(bodyParser.json());

// SQLite helpers
const db = new sqlite3.Database('./patient_monitoring.db', (err) => {
  if (err) console.error('DB open error:', err.message);
  else initDB().catch((e) => console.error('DB init error:', e));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); }));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }));

async function initDB() {
  await dbRun('PRAGMA foreign_keys = ON');
  await dbRun(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('doctor','nurse')),
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, floor INTEGER NOT NULL, type TEXT NOT NULL, occupied INTEGER DEFAULT 0, patient_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, room TEXT, condition TEXT DEFAULT 'stable', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS vitals (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES patients(id))");
  await dbRun("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, acknowledged INTEGER DEFAULT 0, FOREIGN KEY(patient_id) REFERENCES patients(id))");

  const staffCount = await dbGet('SELECT COUNT(*) as c FROM staff');
  if ((staffCount?.c || 0) === 0) {
    const seed = await bcrypt.hash('admin123', 10);
    await dbRun('INSERT OR IGNORE INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', ['EMP-ADMIN', 'admin', 'admin@example.com', seed, 'doctor', 1]);
  }

  const rooms = [ ['101',1,'ward'], ['102',1,'ward'], ['201',2,'icu'], ['301',3,'isolation'] ];
  for (const r of rooms) await dbRun('INSERT OR IGNORE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', r);
}

function generateEmployeeId() { return 'EMP-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function signToken(user) { return jwt.sign({ id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' }); }

// Auth
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' });
    throw e;
  }
  const user = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  const token = signToken(user);
  res.status(201).json({ token, user });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'usernameOrEmail and password required' });
  const user = await dbGet('SELECT * FROM staff WHERE email = ? OR username = ?', [usernameOrEmail, usernameOrEmail]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin } });
}));

// Staff
app.get('/api/staff', asyncHandler(async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, employe_id, username, email, role, is_admin, created_at FROM staff';
  const params = [];
  if (role) { sql += ' WHERE role = ?'; params.push(role); }
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.post('/api/staff', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try { await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]); } catch (e) { if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' }); throw e; }
  const created = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  res.status(201).json(created);
}));

// Rooms
app.get('/api/rooms', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT * FROM rooms ORDER BY floor, id'); res.json(rows); }));
app.get('/api/rooms/available', asyncHandler(async (req, res) => { const { type, floor } = req.query; let sql = 'SELECT * FROM rooms WHERE occupied = 0'; const params = []; if (type) { sql += ' AND type = ?'; params.push(type); } if (floor) { sql += ' AND floor = ?'; params.push(Number(floor)); } sql += ' ORDER BY floor, id'; const rows = await dbAll(sql, params); res.json(rows); }));

// Create or update a room (upsert by id)
app.post('/api/rooms', asyncHandler(async (req, res) => {
  const { id, floor, type } = req.body || {};
  if (!id || typeof floor === 'undefined' || !type) return res.status(400).json({ error: 'id, floor, type required' });
  const existing = await dbGet('SELECT id FROM rooms WHERE id = ?', [String(id)]);
  if (existing) {
    await dbRun('UPDATE rooms SET floor = ?, type = ? WHERE id = ?', [Number(floor), String(type), String(id)]);
  } else {
    await dbRun('INSERT INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', [String(id), Number(floor), String(type)]);
  }
  res.status(201).json({ id: String(id) });
}));

// Update room occupancy/patient assignment
app.put('/api/rooms/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { occupied, patient_id } = req.body || {};
  const room = await dbGet('SELECT * FROM rooms WHERE id = ?', [String(id)]);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  let occ = typeof occupied === 'boolean' ? (occupied ? 1 : 0) : room.occupied;
  let pid = (typeof patient_id === 'string') ? (patient_id.trim() || null) : (patient_id === null ? null : room.patient_id || null);
  if (!occ) pid = null; // when freeing a room, clear patient
  await dbRun('UPDATE rooms SET occupied = ?, patient_id = ? WHERE id = ?', [occ, pid, String(id)]);
  res.json({ message: 'Updated' });
}));

// Patients/vitals/alerts
app.get('/api/patients', asyncHandler(async (req, res) => {
  const sql = `SELECT p.*, v.heart_rate as latest_hr, v.spo2 as latest_spo2
               FROM patients p
               LEFT JOIN vitals v ON p.id = v.patient_id AND v.timestamp = (
                 SELECT MAX(timestamp) FROM vitals WHERE patient_id = p.id
               )`;
  const rows = await dbAll(sql); res.json(rows);
}));

app.post('/api/patients', asyncHandler(async (req, res) => {
  const { id, name, contact, room, condition } = req.body || {};
  if (!id || !name || !contact) return res.status(400).json({ error: 'Missing fields: id, name, contact are required' });
  const finalize = async (assignRoom) => { await dbRun('INSERT INTO patients (id, name, contact, room, condition) VALUES (?, ?, ?, ?, ?)', [id, name, contact, assignRoom || null, condition || 'stable']); if (assignRoom) await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [id, assignRoom]); res.status(201).json({ id, room: assignRoom || null }); };
  if (room) { const r = await dbGet('SELECT occupied FROM rooms WHERE id = ?', [room]); if (!r) return res.status(400).json({ error: 'Room does not exist' }); if (r.occupied) return res.status(400).json({ error: 'Room is already occupied' }); return finalize(room); }
  const preferredType = (condition === 'critical') ? 'icu' : 'ward'; const preferred = await dbGet('SELECT id FROM rooms WHERE occupied = 0 AND type = ? ORDER BY floor LIMIT 1', [preferredType]); if (preferred && preferred.id) return finalize(preferred.id); const any = await dbGet('SELECT id FROM rooms WHERE occupied = 0 ORDER BY floor LIMIT 1'); return finalize(any ? any.id : null);
}));

app.get('/api/vitals', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT v.*, p.name, p.room FROM vitals v JOIN patients p ON v.patient_id = p.id ORDER BY v.timestamp DESC LIMIT 100'); res.json(rows); }));
app.get('/api/alerts', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT a.*, p.name, p.room FROM alerts a JOIN patients p ON a.patient_id = p.id WHERE a.acknowledged = 0 ORDER BY a.timestamp DESC'); res.json(rows); }));
app.put('/api/alerts/:id/acknowledge', asyncHandler(async (req, res) => { const { id } = req.params; await dbRun('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]); res.json({ message: 'Alert acknowledged' }); }));

// 404 & error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error('Unhandled error:', err && err.stack ? err.stack : err); if (res.headersSent) return next(err); res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal server error' }); });

process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
process.on('SIGINT', () => { db.close(() => process.exit(0)); });
// Clean single-file Express backend
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./patient_monitoring.db', (err) => {
  if (err) console.error('DB open error:', err.message);
  else initDB().catch((e) => console.error('DB init error:', e));
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); }));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }));

async function initDB() {
  await dbRun('PRAGMA foreign_keys = ON');
  await dbRun(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('doctor','nurse')),
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, floor INTEGER NOT NULL, type TEXT NOT NULL, occupied INTEGER DEFAULT 0, patient_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, room TEXT, condition TEXT DEFAULT 'stable', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS vitals (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES patients(id))");
  await dbRun("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, acknowledged INTEGER DEFAULT 0, FOREIGN KEY(patient_id) REFERENCES patients(id))");

  const staffCount = await dbGet('SELECT COUNT(*) as c FROM staff');
  if ((staffCount?.c || 0) === 0) {
    const seed = await bcrypt.hash('admin123', 10);
    await dbRun('INSERT OR IGNORE INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', ['EMP-ADMIN', 'admin', 'admin@example.com', seed, 'doctor', 1]);
  }

  const rooms = [ ['101',1,'ward'], ['102',1,'ward'], ['201',2,'icu'], ['301',3,'isolation'] ];
  for (const r of rooms) await dbRun('INSERT OR IGNORE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', r);
}

function generateEmployeeId() { return 'EMP-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function signToken(user) { return jwt.sign({ id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' }); }

// Auth
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' });
    throw e;
  }
  const user = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  const token = signToken(user);
  res.status(201).json({ token, user });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'usernameOrEmail and password required' });
  const user = await dbGet('SELECT * FROM staff WHERE email = ? OR username = ?', [usernameOrEmail, usernameOrEmail]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin } });
}));

// Staff
app.get('/api/staff', asyncHandler(async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, employe_id, username, email, role, is_admin, created_at FROM staff';
  const params = [];
  if (role) { sql += ' WHERE role = ?'; params.push(role); }
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.post('/api/staff', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' });
    throw e;
  }
  const created = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  res.status(201).json(created);
}));

// Rooms
app.get('/api/rooms', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT * FROM rooms ORDER BY floor, id'); res.json(rows); }));
app.get('/api/rooms/available', asyncHandler(async (req, res) => { const { type, floor } = req.query; let sql = 'SELECT * FROM rooms WHERE occupied = 0'; const params = []; if (type) { sql += ' AND type = ?'; params.push(type); } if (floor) { sql += ' AND floor = ?'; params.push(Number(floor)); } sql += ' ORDER BY floor, id'; const rows = await dbAll(sql, params); res.json(rows); }));

// Patients/vitals/alerts
app.get('/api/patients', asyncHandler(async (req, res) => {
  const sql = `SELECT p.*, v.heart_rate as latest_hr, v.spo2 as latest_spo2
               FROM patients p
               LEFT JOIN vitals v ON p.id = v.patient_id AND v.timestamp = (
                 SELECT MAX(timestamp) FROM vitals WHERE patient_id = p.id
               )`;
  const rows = await dbAll(sql); res.json(rows);
}));

app.post('/api/patients', asyncHandler(async (req, res) => {
  const { id, name, contact, room, condition } = req.body || {};
  if (!id || !name || !contact) return res.status(400).json({ error: 'Missing fields: id, name, contact are required' });
  const finalize = async (assignRoom) => { await dbRun('INSERT INTO patients (id, name, contact, room, condition) VALUES (?, ?, ?, ?, ?)', [id, name, contact, assignRoom || null, condition || 'stable']); if (assignRoom) await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [id, assignRoom]); res.status(201).json({ id, room: assignRoom || null }); };
  if (room) { const r = await dbGet('SELECT occupied FROM rooms WHERE id = ?', [room]); if (!r) return res.status(400).json({ error: 'Room does not exist' }); if (r.occupied) return res.status(400).json({ error: 'Room is already occupied' }); return finalize(room); }
  const preferredType = (condition === 'critical') ? 'icu' : 'ward'; const preferred = await dbGet('SELECT id FROM rooms WHERE occupied = 0 AND type = ? ORDER BY floor LIMIT 1', [preferredType]); if (preferred && preferred.id) return finalize(preferred.id); const any = await dbGet('SELECT id FROM rooms WHERE occupied = 0 ORDER BY floor LIMIT 1'); return finalize(any ? any.id : null);
}));

app.get('/api/vitals', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT v.*, p.name, p.room FROM vitals v JOIN patients p ON v.patient_id = p.id ORDER BY v.timestamp DESC LIMIT 100'); res.json(rows); }));
app.get('/api/alerts', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT a.*, p.name, p.room FROM alerts a JOIN patients p ON a.patient_id = p.id WHERE a.acknowledged = 0 ORDER BY a.timestamp DESC'); res.json(rows); }));
app.put('/api/alerts/:id/acknowledge', asyncHandler(async (req, res) => { const { id } = req.params; await dbRun('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]); res.json({ message: 'Alert acknowledged' }); }));

// 404 & error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error('Unhandled error:', err && err.stack ? err.stack : err); if (res.headersSent) return next(err); res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal server error' }); });

process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
process.on('SIGINT', () => { db.close(() => process.exit(0)); });
// Entire file replaced with a single clean server implementation.
// See repository backend/package.json for dependencies.
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./patient_monitoring.db', (err) => {
  if (err) console.error('DB open error:', err.message);
  else initDB().catch((e) => console.error('DB init error:', e));
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); }));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }));

async function initDB() {
  await dbRun('PRAGMA foreign_keys = ON');
  await dbRun(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('doctor','nurse')),
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, floor INTEGER NOT NULL, type TEXT NOT NULL, occupied INTEGER DEFAULT 0, patient_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, room TEXT, condition TEXT DEFAULT 'stable', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS vitals (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES patients(id))");
  await dbRun("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, acknowledged INTEGER DEFAULT 0, FOREIGN KEY(patient_id) REFERENCES patients(id))");

  const staffCount = await dbGet('SELECT COUNT(*) as c FROM staff');
  if ((staffCount?.c || 0) === 0) {
    const seed = await bcrypt.hash('admin123', 10);
    await dbRun('INSERT OR IGNORE INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', ['EMP-ADMIN', 'admin', 'admin@example.com', seed, 'doctor', 1]);
  }

  // seed rooms
  const rooms = [ ['101',1,'ward'], ['102',1,'ward'], ['201',2,'icu'], ['301',3,'isolation'] ];
  for (const r of rooms) await dbRun('INSERT OR IGNORE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', r);
}

function generateEmployeeId() { return 'EMP-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function signToken(user) { return jwt.sign({ id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' }); }

// Register (auto generate employe_id if missing)
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' });
    throw e;
  }
  const user = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  const token = signToken(user);
  res.status(201).json({ token, user });
}));

// Login
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'usernameOrEmail and password required' });
  const user = await dbGet('SELECT * FROM staff WHERE email = ? OR username = ?', [usernameOrEmail, usernameOrEmail]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin } });
}));

// Staff endpoints
app.get('/api/staff', asyncHandler(async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, employe_id, username, email, role, is_admin, created_at FROM staff';
  const params = [];
  if (role) { sql += ' WHERE role = ?'; params.push(role); }
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.post('/api/staff', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try { await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]); } catch (e) { if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' }); throw e; }
  const created = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  res.status(201).json(created);
}));

// Rooms endpoints (used by frontend)
app.get('/api/rooms', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT * FROM rooms ORDER BY floor, id'); res.json(rows); }));
app.get('/api/rooms/available', asyncHandler(async (req, res) => { const { type, floor } = req.query; let sql = 'SELECT * FROM rooms WHERE occupied = 0'; const params = []; if (type) { sql += ' AND type = ?'; params.push(type); } if (floor) { sql += ' AND floor = ?'; params.push(Number(floor)); } sql += ' ORDER BY floor, id'; const rows = await dbAll(sql, params); res.json(rows); }));

// Patients/vitals/alerts minimal endpoints (kept simple)
app.get('/api/patients', asyncHandler(async (req, res) => {
  const sql = `SELECT p.*, v.heart_rate as latest_hr, v.spo2 as latest_spo2
               FROM patients p
               LEFT JOIN vitals v ON p.id = v.patient_id AND v.timestamp = (
                 SELECT MAX(timestamp) FROM vitals WHERE patient_id = p.id
               )`;
  const rows = await dbAll(sql); res.json(rows);
}));

app.post('/api/patients', asyncHandler(async (req, res) => {
  const { id, name, contact, room, condition } = req.body || {};
  if (!id || !name || !contact) return res.status(400).json({ error: 'Missing fields: id, name, contact are required' });
  const finalize = async (assignRoom) => { await dbRun('INSERT INTO patients (id, name, contact, room, condition) VALUES (?, ?, ?, ?, ?)', [id, name, contact, assignRoom || null, condition || 'stable']); if (assignRoom) await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [id, assignRoom]); res.status(201).json({ id, room: assignRoom || null }); };
  if (room) { const r = await dbGet('SELECT occupied FROM rooms WHERE id = ?', [room]); if (!r) return res.status(400).json({ error: 'Room does not exist' }); if (r.occupied) return res.status(400).json({ error: 'Room is already occupied' }); return finalize(room); }
  const preferredType = (condition === 'critical') ? 'icu' : 'ward'; const preferred = await dbGet('SELECT id FROM rooms WHERE occupied = 0 AND type = ? ORDER BY floor LIMIT 1', [preferredType]); if (preferred && preferred.id) return finalize(preferred.id); const any = await dbGet('SELECT id FROM rooms WHERE occupied = 0 ORDER BY floor LIMIT 1'); return finalize(any ? any.id : null);
}));

app.get('/api/vitals', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT v.*, p.name, p.room FROM vitals v JOIN patients p ON v.patient_id = p.id ORDER BY v.timestamp DESC LIMIT 100'); res.json(rows); }));
app.get('/api/alerts', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT a.*, p.name, p.room FROM alerts a JOIN patients p ON a.patient_id = p.id WHERE a.acknowledged = 0 ORDER BY a.timestamp DESC'); res.json(rows); }));
app.put('/api/alerts/:id/acknowledge', asyncHandler(async (req, res) => { const { id } = req.params; await dbRun('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]); res.json({ message: 'Alert acknowledged' }); }));

// 404 & error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error('Unhandled error:', err && err.stack ? err.stack : err); if (res.headersSent) return next(err); res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal server error' }); });

process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
process.on('SIGINT', () => { db.close(() => process.exit(0)); });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); }));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }));

async function initDB() {
  await dbRun('PRAGMA foreign_keys = ON');
  await dbRun(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('doctor','nurse')),
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // basic other tables used by frontend
  await dbRun("CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, floor INTEGER NOT NULL, type TEXT NOT NULL, occupied INTEGER DEFAULT 0, patient_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, room TEXT, condition TEXT DEFAULT 'stable', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS vitals (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES patients(id))");
  await dbRun("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, acknowledged INTEGER DEFAULT 0, FOREIGN KEY(patient_id) REFERENCES patients(id))");

  // Seed a default admin if none exists
  const staffCount = await dbGet('SELECT COUNT(*) as c FROM staff');
  if ((staffCount?.c || 0) === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    try {
      await dbRun('INSERT OR IGNORE INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', ['emp1', 'admin', 'admin@example.com', hash, 'doctor', 1]);
      console.log('Seeded admin: admin / employe_id=emp1');
    } catch (e) {
      console.error('Seed admin failed:', e);
    }
  }

  // Seed some rooms if none
  const rooms = [ ['101',1,'ward'], ['102',1,'ward'], ['201',2,'icu'], ['301',3,'isolation'] ];
  for (const r of rooms) await dbRun('INSERT OR IGNORE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', r);
}

function generateEmployeeId() {
  // e.g., EMP-kg7fm5
  return 'EMP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}

// Auth: register (auto-generate employe_id if missing)
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' });
    throw e;
  }
  const user = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  const token = signToken(user);
  res.status(201).json({ token, user });
}));

// Auth: login
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'usernameOrEmail and password required' });
  const user = await dbGet('SELECT * FROM staff WHERE email = ? OR username = ?', [usernameOrEmail, usernameOrEmail]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin } });
}));

// Staff management endpoints (GET/POST/PUT/DELETE)
app.get('/api/staff', asyncHandler(async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, employe_id, username, email, role, is_admin, created_at FROM staff';
  const params = [];
  if (role) { sql += ' WHERE role = ?'; params.push(role); }
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.post('/api/staff', asyncHandler(async (req, res) => {
  const { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
  const eid = employe_id && String(employe_id).trim() ? String(employe_id).trim() : generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [eid, username, email, hash, role === 'doctor' ? 'doctor' : 'nurse', is_admin ? 1 : 0]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username or email already exists' });
    throw e;
  }
  const created = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE username = ?', [username]);
  res.status(201).json(created);
}));

app.put('/api/staff/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = [];
  const params = [];
  for (const key of ['employe_id', 'username', 'email', 'role', 'is_admin']) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'password')) { const hash = await bcrypt.hash(req.body.password, 10); updates.push('password_hash = ?'); params.push(hash); }
  if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
  params.push(id);
  const sql = `UPDATE staff SET ${updates.join(', ')} WHERE id = ?`;
  await dbRun(sql, params);
  res.json({ message: 'Staff updated' });
}));

app.delete('/api/staff/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; await dbRun('DELETE FROM staff WHERE id = ?', [id]); res.json({ message: 'Staff deleted' });
}));

// Rooms endpoints (used by frontend)
app.get('/api/rooms', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT * FROM rooms ORDER BY floor, id'); res.json(rows); }));
app.get('/api/rooms/available', asyncHandler(async (req, res) => {
  const { type, floor } = req.query; let sql = 'SELECT * FROM rooms WHERE occupied = 0'; const params = []; if (type) { sql += ' AND type = ?'; params.push(type); } if (floor) { sql += ' AND floor = ?'; params.push(Number(floor)); } sql += ' ORDER BY floor, id'; const rows = await dbAll(sql, params); res.json(rows);
}));

// Patients/vitals/alerts minimal endpoints (kept simple)
app.get('/api/patients', asyncHandler(async (req, res) => {
  const sql = `SELECT p.*, v.heart_rate as latest_hr, v.spo2 as latest_spo2
// Clean single-file Express backend
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const DB_FILE = path.join(__dirname, 'patient_monitoring.db');
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple sqlite helpers returning promises
const db = new sqlite3.Database(DB_FILE);
const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (err) { if (err) return rej(err); return res({ lastID: this.lastID, changes: this.changes }); }));
const dbGet = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const dbAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

async function initDB() {
  // Create tables
  await dbRun(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id TEXT UNIQUE,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    floor INTEGER,
    type TEXT,
    occupied INTEGER DEFAULT 0,
    patient_id TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS beds (
    id TEXT PRIMARY KEY,
    occupied INTEGER DEFAULT 0,
    patient_id TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT,
    contact TEXT,
    room TEXT,
    condition TEXT,
    device_id TEXT,
    assigned_nurse_id INTEGER
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT,
    heart_rate INTEGER,
    spo2 INTEGER,
    timestamp TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT,
    type TEXT,
    severity TEXT,
    message TEXT,
    heart_rate INTEGER,
    spo2 INTEGER,
    timestamp TEXT,
    acknowledged INTEGER DEFAULT 0
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS password_reset_codes (
    user_id INTEGER PRIMARY KEY,
    code TEXT,
    expires_at TEXT,
    attempts INTEGER DEFAULT 0
  )`);

  // Seed admin if no staff exists
  const row = await dbGet('SELECT COUNT(*) as c FROM staff');
  if (!row || (row.c || 0) === 0) {
    const defaultEmp = await generateEmployeeId();
    const hash = await bcrypt.hash('admin', 10);
    try {
      await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, 1)', [defaultEmp, 'admin', 'admin@example.com', hash, 'doctor']);
      console.log('[DB] seeded default admin, employe_id=', defaultEmp);
    } catch (e) { console.warn('Failed seeding admin:', e && e.message ? e.message : e); }
  }

  // Seed some rooms and beds if missing
  const rcount = await dbGet('SELECT COUNT(*) as c FROM rooms');
  if (!rcount || (rcount.c || 0) === 0) {
    const rooms = [ ['101', 1, 'ward'], ['102', 1, 'ward'], ['201', 2, 'icu'], ['301', 3, 'isolation'] ];
    for (const r of rooms) await dbRun('INSERT OR IGNORE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', r);
  }

  const bcount = await dbGet('SELECT COUNT(*) as c FROM beds');
  if (!bcount || (bcount.c || 0) === 0) {
    const beds = [ ['B001', 0, null], ['B002', 0, null], ['B003', 0, null] ];
    for (const b of beds) await dbRun('INSERT OR IGNORE INTO beds (id, occupied, patient_id) VALUES (?, ?, ?)', b);
  }
}

// Ensure employee id is unique - loop until unique created
async function generateEmployeeId() {
  for (let i = 0; i < 10; i++) {
    const candidate = 'EMP' + Math.floor(100000 + Math.random() * 900000);
    const exists = await dbGet('SELECT id FROM staff WHERE employe_id = ?', [candidate]);
    if (!exists) return candidate;
  }
  // fallback timestamp
  return 'EMP' + Date.now();
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const hdr = req.headers['authorization'] || '';
  const parts = hdr.split(' ');
  const token = parts.length === 2 ? parts[1] : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function doctorOnly(req, res, next) {
  if (req.user && req.user.role === 'doctor') return next();
  return res.status(403).json({ error: 'Doctor role required' });
}

function doctorAdminOnly(req, res, next) {
  if (req.user && req.user.role === 'doctor' && req.user.is_admin) return next();
  return res.status(403).json({ error: 'Doctor admin required' });
}

// ===== Auth routes =====
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  let { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing required fields: username, email, password' });

  const countRow = await dbGet('SELECT COUNT(*) as c FROM staff');
  const isBootstrap = (countRow?.c || 0) === 0;

  if (!isBootstrap) {
    // creating users requires doctor admin unless bootstrap
    if (!req.headers['authorization']) return res.status(403).json({ error: 'Creating users requires admin' });
    // verify token and admin
    try {
      const payload = jwt.verify((req.headers['authorization'] || '').split(' ')[1], JWT_SECRET);
      if (!(payload && payload.role === 'doctor' && payload.is_admin)) return res.status(403).json({ error: 'Doctor admin required' });
    } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  }

  if (!employe_id) employe_id = await generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  const roleFinal = isBootstrap ? 'doctor' : role;
  const isAdminFinal = isBootstrap ? 1 : (is_admin ? 1 : 0);
  try {
    await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [employe_id, username, email, hash, roleFinal, isAdminFinal]);
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username, or email already exists' });
    throw e;
  }
  const user = await dbGet('SELECT id, employe_id, username, role, is_admin FROM staff WHERE username = ?', [username]);
  const token = signToken(user);
  res.status(201).json({ token, user });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Missing usernameOrEmail or password' });
  const user = await dbGet('SELECT * FROM staff WHERE email = ? OR username = ?', [usernameOrEmail, usernameOrEmail]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, employe_id: user.employe_id, username: user.username, role: user.role, is_admin: !!user.is_admin } });
}));

// Staff management
app.get('/api/staff', authRequired, doctorOnly, asyncHandler(async (req, res) => {
  const { role } = req.query || {};
  let sql = 'SELECT id, employe_id, username, email, role, is_admin, created_at FROM staff';
  const params = [];
  if (role && (role === 'doctor' || role === 'nurse')) { sql += ' WHERE role = ?'; params.push(role); }
  sql += ' ORDER BY created_at DESC';
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.post('/api/staff', authRequired, doctorAdminOnly, asyncHandler(async (req, res) => {
  let { employe_id, username, email, password, role = 'nurse', is_admin = 0 } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing required fields: username, email, password' });
  if (!employe_id) employe_id = await generateEmployeeId();
  const hash = await bcrypt.hash(password, 10);
  try {
    const r = await dbRun('INSERT INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', [employe_id, username, email, hash, role, is_admin ? 1 : 0]);
    const user = await dbGet('SELECT id, employe_id, username, role, is_admin FROM staff WHERE id = ?', [r.lastID]);
    res.status(201).json({ user });
  } catch (e) {
    if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username, or email already exists' });
    throw e;
  }
}));

app.put('/api/staff/:id', authRequired, doctorAdminOnly, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { employe_id, username, email, role, is_admin, password } = req.body || {};
  if (role && !['doctor', 'nurse'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const updates = [];
  const params = [];
  if (typeof employe_id !== 'undefined') { updates.push('employe_id = ?'); params.push(employe_id); }
  if (typeof username !== 'undefined') { updates.push('username = ?'); params.push(username); }
  if (typeof email !== 'undefined') { updates.push('email = ?'); params.push(email); }
  if (typeof role !== 'undefined') { updates.push('role = ?'); params.push(role); }
  if (typeof is_admin !== 'undefined') { updates.push('is_admin = ?'); params.push(is_admin ? 1 : 0); }
  if (password) { const hash = await bcrypt.hash(password, 10); updates.push('password_hash = ?'); params.push(hash); }
  if (updates.length === 0) return res.json({ message: 'No changes' });
  const sql = `UPDATE staff SET ${updates.join(', ')} WHERE id = ?`;
  params.push(id);
  try { await dbRun(sql, params); res.json({ message: 'Staff updated' }); } catch (e) { if (e && /UNIQUE/i.test(e.message)) return res.status(409).json({ error: 'employe_id, username, or email already exists' }); throw e; }
}));

app.delete('/api/staff/:id', authRequired, doctorAdminOnly, asyncHandler(async (req, res) => {
  const { id } = req.params; await dbRun('DELETE FROM staff WHERE id = ?', [id]); res.json({ message: 'Staff deleted' });
}));

// ===== Rooms endpoints =====
app.get('/api/rooms', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT * FROM rooms ORDER BY floor, id'); res.json(rows); }));

app.get('/api/rooms/available', asyncHandler(async (req, res) => {
  const { type, floor } = req.query || {};
  let sql = 'SELECT * FROM rooms WHERE occupied = 0';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (floor) { sql += ' AND floor = ?'; params.push(Number(floor)); }
  sql += ' ORDER BY floor, id';
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.post('/api/rooms', asyncHandler(async (req, res) => {
  const { id, floor, type } = req.body || {};
  if (!id || !Number.isInteger(Number(floor)) || !type) return res.status(400).json({ error: 'Missing or invalid fields: id, floor, type required' });
  await dbRun('INSERT OR REPLACE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, COALESCE((SELECT occupied FROM rooms WHERE id = ?), 0))', [id, Number(floor), type, id]);
  res.status(201).json({ id });
}));

app.put('/api/rooms/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; const { occupied, patient_id } = req.body || {}; const occ = occupied ? 1 : 0; await dbRun('UPDATE rooms SET occupied = ?, patient_id = ? WHERE id = ?', [occ, patient_id || null, id]); res.json({ message: 'Room updated' });
}));

// ===== Patients endpoints =====
app.get('/api/patients', asyncHandler(async (req, res) => {
  const sql = `SELECT p.*, v.heart_rate as latest_hr, v.spo2 as latest_spo2, r.floor as room_floor, r.type as room_type
               FROM patients p
               LEFT JOIN vitals v ON p.id = v.patient_id AND v.timestamp = (
                 SELECT MAX(timestamp) FROM vitals WHERE patient_id = p.id
               )
               LEFT JOIN rooms r ON r.id = p.room`;
  const rows = await dbAll(sql);
  res.json(rows);
}));

app.post('/api/patients', asyncHandler(async (req, res) => {
  const { id, name, contact, room, condition, device_id, assigned_nurse_id, bed_id } = req.body || {};
  if (!id || !name || !contact) return res.status(400).json({ error: 'Missing fields: id, name, contact are required' });

  const finalize = async (assignRoom) => {
    try {
      await dbRun('BEGIN TRANSACTION');
      await dbRun('INSERT INTO patients (id, name, contact, room, condition, device_id, assigned_nurse_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, name, contact, assignRoom || null, condition || 'stable', device_id || null, assigned_nurse_id || null]);
      if (assignRoom) await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [id, assignRoom]);
      // if ward, try assign a bed
      if (assignRoom) {
        const rinfo = await dbGet('SELECT type FROM rooms WHERE id = ?', [assignRoom]);
        if (rinfo && rinfo.type === 'ward') {
          let allocatedBed = null;
          if (bed_id) { const b = await dbGet('SELECT id, occupied FROM beds WHERE id = ?', [bed_id]); if (b && !b.occupied) allocatedBed = b.id; }
          if (!allocatedBed) { const bfree = await dbGet('SELECT id FROM beds WHERE occupied = 0 LIMIT 1'); allocatedBed = bfree ? bfree.id : null; }
          if (allocatedBed) await dbRun('UPDATE beds SET occupied = 1, patient_id = ? WHERE id = ?', [id, allocatedBed]);
        }
      }
      await dbRun('COMMIT');
      res.status(201).json({ id, room: assignRoom || null });
    } catch (e) { try { await dbRun('ROLLBACK'); } catch (_) {} throw e; }
  };

  if (room) {
    const r = await dbGet('SELECT occupied FROM rooms WHERE id = ?', [room]); if (!r) return res.status(400).json({ error: 'Room does not exist' }); if (r.occupied) return res.status(400).json({ error: 'Room is already occupied' }); return finalize(room);
  }
  const preferredType = (condition === 'critical') ? 'icu' : 'ward';
  const preferred = await dbGet('SELECT id FROM rooms WHERE occupied = 0 AND type = ? ORDER BY floor LIMIT 1', [preferredType]); if (preferred && preferred.id) return finalize(preferred.id);
  const any = await dbGet('SELECT id FROM rooms WHERE occupied = 0 ORDER BY floor LIMIT 1'); return finalize(any ? any.id : null);
}));

app.put('/api/patients/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; const { name, contact, room, condition, device_id, bed_id } = req.body || {};
  const current = await dbGet('SELECT room FROM patients WHERE id = ?', [id]); if (!current) return res.status(404).json({ error: 'Patient not found' });
  try {
    await dbRun('BEGIN TRANSACTION');
    const updates = []; const params = [];
    if (typeof name !== 'undefined') { updates.push('name = ?'); params.push(name); }
    if (typeof contact !== 'undefined') { updates.push('contact = ?'); params.push(contact); }
    if (typeof condition !== 'undefined') { updates.push('condition = ?'); params.push(condition); }
    if (typeof device_id !== 'undefined') { updates.push('device_id = ?'); params.push(device_id || null); }
    if (updates.length > 0) { const sql = `UPDATE patients SET ${updates.join(', ')} WHERE id = ?`; params.push(id); await dbRun(sql, params); }
    if (typeof room !== 'undefined') {
      const prevRoom = current.room; if (prevRoom && (!room || room !== prevRoom)) { await dbRun('UPDATE rooms SET occupied = 0, patient_id = NULL WHERE id = ?', [prevRoom]); await dbRun('UPDATE beds SET occupied = 0, patient_id = NULL WHERE patient_id = ?', [id]); }
      if (room) {
        const r = await dbGet('SELECT occupied, type FROM rooms WHERE id = ?', [room]); if (!r) { await dbRun('ROLLBACK'); return res.status(400).json({ error: 'Room does not exist' }); } if (r.occupied) { await dbRun('ROLLBACK'); return res.status(400).json({ error: 'Room is already occupied' }); }
        await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [id, room]);
        if (r.type === 'ward') {
          let allocatedBed = null; if (bed_id) { const b = await dbGet('SELECT id, occupied FROM beds WHERE id = ?', [bed_id]); if (b && !b.occupied) allocatedBed = b.id; }
          if (!allocatedBed) { const bfree = await dbGet('SELECT id FROM beds WHERE occupied = 0 LIMIT 1'); allocatedBed = bfree ? bfree.id : null; }
          if (allocatedBed) await dbRun('UPDATE beds SET occupied = 1, patient_id = ? WHERE id = ?', [id, allocatedBed]);
        } else { await dbRun('UPDATE beds SET occupied = 0, patient_id = NULL WHERE patient_id = ?', [id]); }
      }
      await dbRun('UPDATE patients SET room = ? WHERE id = ?', [room || null, id]);
    }
    await dbRun('COMMIT'); res.json({ message: 'Patient updated' });
  } catch (e) { try { await dbRun('ROLLBACK'); } catch (_) {} throw e; }
}));

app.delete('/api/patients/:id', asyncHandler(async (req, res) => { const { id } = req.params; const current = await dbGet('SELECT room FROM patients WHERE id = ?', [id]); if (!current) return res.status(404).json({ error: 'Patient not found' }); try { await dbRun('BEGIN TRANSACTION'); if (current.room) await dbRun('UPDATE rooms SET occupied = 0, patient_id = NULL WHERE id = ?', [current.room]); await dbRun('UPDATE beds SET occupied = 0, patient_id = NULL WHERE patient_id = ?', [id]); await dbRun('DELETE FROM vitals WHERE patient_id = ?', [id]); await dbRun('DELETE FROM alerts WHERE patient_id = ?', [id]); await dbRun('DELETE FROM patients WHERE id = ?', [id]); await dbRun('COMMIT'); res.json({ message: 'Patient deleted' }); } catch (e) { try { await dbRun('ROLLBACK'); } catch (_) {} throw e; } }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => { console.error('Unhandled error:', err && err.stack ? err.stack : err); if (res.headersSent) return next(err); res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal server error' }); });

process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); });

(async () => { try { await initDB(); app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); process.on('SIGINT', () => { db.close(() => process.exit(0)); }); } catch (e) { console.error('Startup error', e); process.exit(1); } })();

app.get('/api/vitals/history', asyncHandler(async (req, res) => {
  const { since } = req.query || {};
  let sql = 'SELECT v.*, p.name, p.room FROM vitals v JOIN patients p ON v.patient_id = p.id';
  const params = [];
  if (since) {
    sql += ' WHERE v.timestamp >= ?';
    params.push(since);
  }
  sql += ' ORDER BY v.timestamp DESC';
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

// Dashboard stats
app.get('/api/dashboard/stats', asyncHandler(async (req, res) => {
  const totalPatientsRow = await dbGet('SELECT COUNT(*) AS c FROM patients');
  const activeMonitorsRow = await dbGet('SELECT COUNT(DISTINCT patient_id) AS c FROM vitals WHERE timestamp >= datetime("now", "-10 minutes")');
  const criticalAlertsRow = await dbGet('SELECT COUNT(*) AS c FROM alerts WHERE severity = ? AND acknowledged = 0', ['high']);
  const totalNursesRow = await dbGet('SELECT COUNT(*) AS c FROM staff WHERE role = "nurse"');

  const stats = {
    totalPatients: totalPatientsRow?.c || 0,
    activeMonitors: activeMonitorsRow?.c || 0,
    criticalAlerts: criticalAlertsRow?.c || 0,
    totalNurses: totalNursesRow?.c || 0,
    avgResponseTime: '1.2m',
  };

  res.json(stats);
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  process.exit(1);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

process.on('SIGINT', () => { db.close(() => process.exit(0)); });
