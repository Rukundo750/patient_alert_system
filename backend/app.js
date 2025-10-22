// Clean single-file Express backend (app.js)
require('dotenv').config();
// Also attempt to load env from project root when running from backend/
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch {}

// Ensure a patient row exists for given id; needed because vitals has FK to patients
async function ensurePatientExists(pid) {
  if (!pid) return;
  if (!ALLOW_DYNAMIC_PATIENTS && pid !== DEFAULT_PATIENT_ID) return;
  const exists = await dbGet('SELECT id FROM patients WHERE id = ?', [pid]);
  if (!exists) {
    await dbRun('INSERT INTO patients (id, name, contact, room, condition) VALUES (?, ?, ?, ?, ?)', [pid, 'ESP32 Patient', 'N/A', null, 'stable']);
  }
}
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
 const nodemailer = require('nodemailer');
 const mqtt = require('mqtt');
 const crypto = require('crypto');
 const http = require('http');
 const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const ALLOW_DYNAMIC_PATIENTS = process.env.ALLOW_DYNAMIC_PATIENTS ? /^(1|true|yes)$/i.test(process.env.ALLOW_DYNAMIC_PATIENTS) : false;

app.use(cors());
app.use(bodyParser.json());

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] },
  pingTimeout: 30000,
  pingInterval: 25000,
});
io.on('connection', (socket) => {
  try { console.log('[IO] client connected', socket.id); } catch {}
  socket.on('disconnect', (reason) => {
    try { console.log('[IO] client disconnected', reason); } catch {}
  });
});

// SQLite helpers
const db = new sqlite3.Database('./patient_monitoring.db', (err) => {
  if (err) console.error('DB open error:', err.message);
  else initDB().catch((e) => console.error('DB init error:', e));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); }));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function signToken(user) { return jwt.sign({ id: user.id, username: user.username, role: user.role, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' }); }

// Ensure rooms' occupied flag reflects patient assignment, and clear orphaned links
async function reconcileRooms() {
  try {
    // Clear any patient_id that doesn't exist
    await dbRun("UPDATE rooms SET patient_id = NULL WHERE patient_id IS NOT NULL AND patient_id NOT IN (SELECT id FROM patients)");
    // Normalize occupied based on patient_id presence
    await dbRun("UPDATE rooms SET occupied = CASE WHEN patient_id IS NULL THEN 0 ELSE 1 END");
  } catch (e) {
    try { console.warn('[reconcileRooms] failed:', e && e.message ? e.message : e); } catch {}
  }
}

// Simple JWT auth middleware
function authRequired(req, res, next) {
  try {
    const hdr = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (!hdr || !/^Bearer\s+/i.test(hdr)) return res.status(401).json({ error: 'Unauthorized' });
    const token = hdr.replace(/^Bearer\s+/i, '').trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Current user profile
app.get('/api/me', authRequired, asyncHandler(async (req, res) => {
  const me = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE id = ?', [req.user.id]);
  if (!me) return res.status(404).json({ error: 'User not found' });
  res.json(me);
}));

app.put('/api/me', authRequired, asyncHandler(async (req, res) => {
  const { username, email, password } = req.body || {};
  const me = await dbGet('SELECT * FROM staff WHERE id = ?', [req.user.id]);
  if (!me) return res.status(404).json({ error: 'User not found' });
  const nextUsername = (typeof username === 'string' && username.trim()) ? username.trim() : me.username;
  const nextEmail = (typeof email === 'string' && email.trim()) ? email.trim() : me.email;
  // Uniqueness checks when changing username/email
  if (nextUsername !== me.username) {
    const exists = await dbGet('SELECT id FROM staff WHERE username = ?', [nextUsername]);
    if (exists && exists.id !== me.id) return res.status(409).json({ error: 'username already exists' });
  }
  if (nextEmail !== me.email) {
    const exists = await dbGet('SELECT id FROM staff WHERE email = ?', [nextEmail]);
    if (exists && exists.id !== me.id) return res.status(409).json({ error: 'email already exists' });
  }
  if (password && String(password).trim()) {
    const hash = await bcrypt.hash(String(password), 10);
    await dbRun('UPDATE staff SET username = ?, email = ?, password_hash = ? WHERE id = ?', [nextUsername, nextEmail, hash, me.id]);
  } else {
    await dbRun('UPDATE staff SET username = ?, email = ? WHERE id = ?', [nextUsername, nextEmail, me.id]);
  }
  const updated = await dbGet('SELECT id, employe_id, username, email, role, is_admin FROM staff WHERE id = ?', [me.id]);
  res.json({ message: 'Profile updated', user: { ...updated, is_admin: !!updated.is_admin } });
}));
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
  await dbRun("CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, room TEXT, condition TEXT DEFAULT 'stable', date_of_birth TEXT, gender TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await dbRun("CREATE TABLE IF NOT EXISTS vitals (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES patients(id))");
  await dbRun("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, heart_rate INTEGER, spo2 INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, acknowledged INTEGER DEFAULT 0, FOREIGN KEY(patient_id) REFERENCES patients(id))");
  // Beds for wards
  await dbRun("CREATE TABLE IF NOT EXISTS beds (id TEXT PRIMARY KEY, occupied INTEGER DEFAULT 0, patient_id TEXT)");
  await dbRun("CREATE TABLE IF NOT EXISTS password_resets (email TEXT NOT NULL, token TEXT NOT NULL, expires_at DATETIME NOT NULL)");

  await dbRun("CREATE INDEX IF NOT EXISTS idx_vitals_patient_ts ON vitals(patient_id, timestamp DESC)");
  await dbRun("CREATE INDEX IF NOT EXISTS idx_alerts_patient_ts ON alerts(patient_id, timestamp DESC)");

  // Add assigned_nurse_id column to patients if not present
  try {
    await dbRun('ALTER TABLE patients ADD COLUMN assigned_nurse_id INTEGER');
  } catch (e) {
    // ignore if column already exists
  }
  // Add date_of_birth column if not present
  try {
    await dbRun("ALTER TABLE patients ADD COLUMN date_of_birth TEXT");
  } catch (e) {
    // ignore
  }
  // Add gender column if not present
  try {
    await dbRun("ALTER TABLE patients ADD COLUMN gender TEXT");
  } catch (e) {
    // ignore
  }

  const staffCount = await dbGet('SELECT COUNT(*) as c FROM staff');
  if ((staffCount?.c || 0) === 0) {
    const seed = await bcrypt.hash('admin123', 10);
    await dbRun('INSERT OR IGNORE INTO staff (employe_id, username, email, password_hash, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)', ['EMP-ADMIN', 'admin', 'admin@example.com', seed, 'doctor', 1]);
  }

  const rooms = [ ['101',1,'ward'], ['102',1,'ward'], ['201',2,'icu'], ['301',3,'isolation'] ];
  for (const r of rooms) await dbRun('INSERT OR IGNORE INTO rooms (id, floor, type, occupied) VALUES (?, ?, ?, 0)', r);
  // Seed beds for wards if none
  const seedBeds = ['W-101-A','W-101-B','W-102-A','W-102-B'];
  for (const b of seedBeds) await dbRun('INSERT OR IGNORE INTO beds (id, occupied) VALUES (?, 0)', [b]);
  // Normalize room occupancy after seeding
  await reconcileRooms();
}

function generateEmployeeId() { return 'EMP-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }

// Email (SMTP) setup
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE ? /^(1|true|yes)$/i.test(process.env.SMTP_SECURE) : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

let mailer;
try {
  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: SMTP_PORT === 587 && !SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  try {
    mailer.verify((err, success) => {
      if (err) console.error('[mail] verify failed:', err && err.message ? err.message : err);
      else console.log('[mail] transporter verified');
    });
  } catch {}
} catch (e) {
  console.error('Failed to initialize mail transport:', e);
}

async function notifyStaffOfAlert(alert) {
  try {
    if (!mailer) return;
    const rows = await dbAll("SELECT email FROM staff WHERE role = 'doctor'");
    const recipientsRaw = (rows || []).map(r => r && r.email).filter(Boolean);
    // Always include one designated nurse address per user's request
    recipientsRaw.push('ndayishimiyebrice8@gmail.com');
    const valid = recipientsRaw.filter(e => /[^@\s]+@[^@\s]+\.[^@\s]+/i.test(String(e)));
    const recipients = Array.from(new Set(valid));
    if (!recipients.length) return;
    const from = process.env.SMTP_FROM || SMTP_USER || 'no-reply@example.com';
    const patientId = alert && alert.patient_id ? String(alert.patient_id) : 'Unknown';
    const sev = alert && alert.severity ? String(alert.severity).toUpperCase() : 'INFO';
    const typ = alert && alert.type ? String(alert.type) : 'alert';
    const msg = alert && alert.message ? String(alert.message) : '';
    const hr = (alert && typeof alert.heart_rate !== 'undefined' && alert.heart_rate !== null) ? `HR: ${alert.heart_rate}` : '';
    const s2 = (alert && typeof alert.spo2 !== 'undefined' && alert.spo2 !== null) ? `SpO2: ${alert.spo2}` : '';
    const vitals = [hr, s2].filter(Boolean).join(' | ');
    const subject = `[${sev}] Patient ${patientId} ${typ}`;
    const lines = [
      `Patient: ${patientId}`,
      `Type: ${typ}`,
      `Severity: ${sev}`,
      msg ? `Message: ${msg}` : null,
      vitals ? `Vitals: ${vitals}` : null,
      alert && alert.timestamp ? `Time: ${alert.timestamp}` : null,
    ].filter(Boolean);
    const mail = {
      from,
      to: from,
      bcc: recipients,
      subject,
      text: lines.join('\n')
    };
    try { console.log('[mail] alert mail to recipients:', recipients.length); } catch {}
    try {
      await mailer.sendMail(mail);
    } catch (sendErr) {
      try { console.error('[mail] BCC send failed, falling back to per-recipient:', sendErr && sendErr.message ? sendErr.message : sendErr); } catch {}
      // Fallback: send individually to each recipient
      for (const addr of recipients) {
        try {
          await mailer.sendMail({ from, to: addr, subject, text: lines.join('\n') });
        } catch (e2) {
          try { console.error('[mail] send to', addr, 'failed:', e2 && e2.message ? e2.message : e2); } catch {}
        }
      }
    }
  } catch (e) {
    try { console.error('notifyStaffOfAlert failed:', e && e.message ? e.message : e); } catch {}
  }
}

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

// Password reset with 6-digit code flow (to match frontend)
app.post('/api/auth/forgot-password', asyncHandler(async (req, res) => {
  const { emailOrUsername } = req.body || {};
  if (!emailOrUsername) return res.status(400).json({ error: 'emailOrUsername required' });
  const user = await dbGet('SELECT id, email FROM staff WHERE email = ? OR username = ?', [emailOrUsername, emailOrUsername]);
  // Always respond 200 to avoid user enumeration
  if (!user) return res.status(200).json({ message: 'If an account exists, a code has been sent' });

  // Generate 6-digit code valid for 15 minutes
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await dbRun('DELETE FROM password_resets WHERE email = ?', [user.email]);
  await dbRun('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [user.email, code, expiresAt]);

  if (!mailer) return res.status(500).json({ error: 'mailer not configured' });
  const from = process.env.SMTP_FROM || SMTP_USER || 'no-reply@example.com';
  const info = await mailer.sendMail({
    from,
    to: user.email,
    subject: 'Your password reset code',
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
  });
  res.json({ message: 'If an account exists, a code has been sent', id: info && info.messageId ? info.messageId : undefined });
}));

app.post('/api/auth/verify-reset-code', asyncHandler(async (req, res) => {
  const { emailOrUsername, code } = req.body || {};
  if (!emailOrUsername || !code) return res.status(400).json({ error: 'emailOrUsername and code required' });
  const user = await dbGet('SELECT id, email FROM staff WHERE email = ? OR username = ?', [emailOrUsername, emailOrUsername]);
  if (!user) return res.status(400).json({ error: 'Invalid or expired code' });
  const row = await dbGet('SELECT * FROM password_resets WHERE email = ? AND token = ?', [user.email, String(code)]);
  if (!row) return res.status(400).json({ error: 'Invalid or expired code' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Invalid or expired code' });

  // Issue a short-lived reset token
  const resetToken = jwt.sign({ email: user.email, purpose: 'reset' }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ resetToken });
}));

app.post('/api/auth/reset-password', asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  if (!resetToken || !newPassword) return res.status(400).json({ error: 'resetToken and newPassword required' });
  let decoded;
  try {
    decoded = jwt.verify(resetToken, JWT_SECRET);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
  if (!decoded || !decoded.email || decoded.purpose !== 'reset') return res.status(400).json({ error: 'Invalid or expired token' });
  const hash = await bcrypt.hash(String(newPassword), 10);
  await dbRun('UPDATE staff SET password_hash = ? WHERE email = ?', [hash, decoded.email]);
  await dbRun('DELETE FROM password_resets WHERE email = ?', [decoded.email]);
  res.json({ message: 'Password updated' });
}));

app.post('/api/auth/reset-password-with-code', asyncHandler(async (req, res) => {
  const { emailOrUsername, code, newPassword } = req.body || {};
  if (!emailOrUsername || !code || !newPassword) return res.status(400).json({ error: 'emailOrUsername, code and newPassword required' });
  const user = await dbGet('SELECT id, email FROM staff WHERE email = ? OR username = ?', [emailOrUsername, emailOrUsername]);
  if (!user) return res.status(400).json({ error: 'Invalid or expired code' });
  const row = await dbGet('SELECT * FROM password_resets WHERE email = ? AND token = ?', [user.email, String(code)]);
  if (!row) return res.status(400).json({ error: 'Invalid or expired code' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Invalid or expired code' });
  const hash = await bcrypt.hash(String(newPassword), 10);
  await dbRun('UPDATE staff SET password_hash = ? WHERE email = ?', [hash, user.email]);
  await dbRun('DELETE FROM password_resets WHERE email = ?', [user.email]);
  res.json({ message: 'Password updated' });
}));

// Password reset: request token via email
app.post('/api/auth/request-reset', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await dbGet('SELECT id, email FROM staff WHERE email = ?', [email]);
  if (!user) return res.status(200).json({ message: 'If this email exists, a reset link has been sent' });
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await dbRun('DELETE FROM password_resets WHERE email = ?', [email]);
  await dbRun('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [email, token, expiresAt]);

  if (!mailer) return res.status(500).json({ error: 'mailer not configured' });
  const from = process.env.SMTP_FROM || SMTP_USER || 'no-reply@example.com';
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
  const info = await mailer.sendMail({
    from,
    to: email,
    subject: 'Password Reset Instructions',
    text: `Use the following link to reset your password: ${resetLink} (valid for 1 hour)`
  });
  res.json({ message: 'Reset email sent', id: info && info.messageId ? info.messageId : undefined });
}));

// Password reset: perform reset
app.post('/api/auth/reset', asyncHandler(async (req, res) => {
  const { email, token, password } = req.body || {};
  if (!email || !token || !password) return res.status(400).json({ error: 'email, token, password required' });
  const row = await dbGet('SELECT * FROM password_resets WHERE email = ? AND token = ?', [email, token]);
  if (!row) return res.status(400).json({ error: 'Invalid token' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Token expired' });
  const hash = await bcrypt.hash(password, 10);
  await dbRun('UPDATE staff SET password_hash = ? WHERE email = ?', [hash, email]);
  await dbRun('DELETE FROM password_resets WHERE email = ?', [email]);
  res.json({ message: 'Password updated' });
}));

// Dev-only test endpoints
if ((process.env.NODE_ENV || 'development') !== 'production') {
  // Send a test email using configured SMTP transport
  app.post('/api/dev/test-email', asyncHandler(async (req, res) => {
    if (!mailer) return res.status(500).json({ error: 'mailer not configured' });
    const { to } = req.body || {};
    const from = process.env.SMTP_FROM || SMTP_USER || 'no-reply@example.com';
    const target = to || SMTP_USER;
    if (!target) return res.status(400).json({ error: 'Provide `to` or set SMTP_USER' });
    const info = await mailer.sendMail({
      from,
      to: target,
      subject: 'SMTP test email',
      text: 'This is a test email from Patient Monitoring backend.'
    });
    res.json({ message: 'Test email sent', id: info && info.messageId ? info.messageId : undefined });
  }));

  // Send a test alert email to staff (doctors + nurses)
  app.post('/api/dev/test-alert-email', asyncHandler(async (req, res) => {
    if (!mailer) return res.status(500).json({ error: 'mailer not configured' });
    const { patient_id, type, severity, message, heart_rate, spo2 } = req.body || {};
    const fake = {
      patient_id: patient_id || DEFAULT_PATIENT_ID,
      type: type || 'test',
      severity: severity || 'critical',
      message: message || 'Test alert email to staff',
      heart_rate: (typeof heart_rate !== 'undefined') ? heart_rate : null,
      spo2: (typeof spo2 !== 'undefined') ? spo2 : null,
      timestamp: new Date().toISOString(),
    };
    await notifyStaffOfAlert(fake);
    res.json({ message: 'Test alert email attempted (check server logs for [mail] and inboxes)' });
  }));

  // Publish a test MQTT message
  app.post('/api/dev/mqtt-publish', asyncHandler(async (req, res) => {
    if (!mqttClient || !mqttClient.connected) return res.status(503).json({ error: 'MQTT not connected' });
    const { patient_id, heart_rate = 72, spo2 = 98 } = req.body || {};
    const pid = patient_id || process.env.VITE_DEFAULT_PATIENT_ID || 'TEST-P001';
    const topic = (process.env.MQTT_TOPIC && process.env.MQTT_TOPIC.replace('+', pid)) || `patient_monitoring/vitals/${pid}`;
    const payload = JSON.stringify({ patient_id: pid, heart_rate, spo2 });
    mqttClient.publish(topic, payload, { qos: 0 }, (err) => {
      if (err) return res.status(500).json({ error: 'Publish failed', details: err.message || String(err) });
      res.json({ message: 'Published', topic, payload: JSON.parse(payload) });
    });
  }));
}

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

// Update staff (admin only) - supports password reset
app.put('/api/staff/:id', authRequired, asyncHandler(async (req, res) => {
  if (!req.user || !req.user.is_admin || req.user.role !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const target = await dbGet('SELECT * FROM staff WHERE id = ?', [Number(id)]);
  if (!target) return res.status(404).json({ error: 'Staff not found' });

  const { employe_id, username, email, role, is_admin, password } = req.body || {};
  if (role && !['doctor','nurse'].includes(String(role))) return res.status(400).json({ error: 'Invalid role' });

  let nextEmployeId = (typeof employe_id === 'string' && employe_id.trim()) ? employe_id.trim() : target.employe_id;
  let nextUsername = (typeof username === 'string' && username.trim()) ? username.trim() : target.username;
  let nextEmail = (typeof email === 'string' && email.trim()) ? email.trim() : target.email;
  let nextRole = role ? (role === 'doctor' ? 'doctor' : 'nurse') : target.role;
  let nextIsAdmin = (typeof is_admin !== 'undefined') ? (is_admin ? 1 : 0) : target.is_admin;

  if (nextEmployeId !== target.employe_id) {
    const exists = await dbGet('SELECT id FROM staff WHERE employe_id = ?', [nextEmployeId]);
    if (exists && exists.id !== target.id) return res.status(409).json({ error: 'employe_id already exists' });
  }
  if (nextUsername !== target.username) {
    const exists = await dbGet('SELECT id FROM staff WHERE username = ?', [nextUsername]);
    if (exists && exists.id !== target.id) return res.status(409).json({ error: 'username already exists' });
  }
  if (nextEmail !== target.email) {
    const exists = await dbGet('SELECT id FROM staff WHERE email = ?', [nextEmail]);
    if (exists && exists.id !== target.id) return res.status(409).json({ error: 'email already exists' });
  }

  if (password && String(password).trim()) {
    const hash = await bcrypt.hash(String(password), 10);
    await dbRun('UPDATE staff SET employe_id = ?, username = ?, email = ?, role = ?, is_admin = ?, password_hash = ? WHERE id = ?', [nextEmployeId, nextUsername, nextEmail, nextRole, nextIsAdmin, hash, Number(id)]);
  } else {
    await dbRun('UPDATE staff SET employe_id = ?, username = ?, email = ?, role = ?, is_admin = ? WHERE id = ?', [nextEmployeId, nextUsername, nextEmail, nextRole, nextIsAdmin, Number(id)]);
  }

  res.json({ message: 'Staff updated' });
}));

// Delete staff (admin only)
app.delete('/api/staff/:id', authRequired, asyncHandler(async (req, res) => {
  if (!req.user || !req.user.is_admin || req.user.role !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const target = await dbGet('SELECT * FROM staff WHERE id = ?', [Number(id)]);
  if (!target) return res.status(404).json({ error: 'Staff not found' });
  // Clean up any pending password reset tokens for this user
  try { if (target.email) await dbRun('DELETE FROM password_resets WHERE email = ?', [target.email]); } catch {}
  // Unassign any patients assigned to this nurse
  try { await dbRun('UPDATE patients SET assigned_nurse_id = NULL WHERE assigned_nurse_id = ?', [Number(id)]); } catch {}
  await dbRun('DELETE FROM staff WHERE id = ?', [Number(id)]);
  res.json({ message: 'Deleted' });
}));

// Rooms
app.get('/api/rooms', asyncHandler(async (req, res) => { await reconcileRooms(); const rows = await dbAll('SELECT * FROM rooms ORDER BY floor, id'); res.json(rows); }));
app.get('/api/rooms/available', asyncHandler(async (req, res) => { await reconcileRooms(); const { type, floor } = req.query; let sql = 'SELECT * FROM rooms WHERE occupied = 0'; const params = []; if (type) { sql += ' AND type = ?'; params.push(type); } if (floor) { sql += ' AND floor = ?'; params.push(Number(floor)); } sql += ' ORDER BY floor, id'; const rows = await dbAll(sql, params); res.json(rows); }));

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
  const sql = `SELECT p.*, v.heart_rate as latest_hr, v.spo2 as latest_spo2,
                      (SELECT id FROM beds b WHERE b.patient_id = p.id LIMIT 1) as bed_id,
                      s.username AS assigned_nurse_username
               FROM patients p
               LEFT JOIN vitals v ON v.id = (
                 SELECT id FROM vitals vv
                 WHERE vv.patient_id = p.id
                 ORDER BY datetime(vv.timestamp) DESC, vv.id DESC
                 LIMIT 1
               )
               LEFT JOIN staff s ON s.id = p.assigned_nurse_id`;
  const rows = await dbAll(sql); res.json(rows);
}));

app.post('/api/patients', asyncHandler(async (req, res) => {
  const { id, name, contact, room, condition, bed_id, assigned_nurse_id, date_of_birth, gender } = req.body || {};
  if (!id || !name || !contact) return res.status(400).json({ error: 'Missing fields: id, name, contact are required' });
  const idStr = String(id).trim();
  if (!/^\d{16}$/.test(idStr)) return res.status(400).json({ error: 'patient id must be exactly 16 digits' });
  const phoneDigits = String(contact).replace(/\D/g, '');
  if (phoneDigits.length !== 10) return res.status(400).json({ error: 'phone number must be exactly 10 digits' });
  // Validate gender basic
  const normGender = typeof gender === 'string' && gender.trim() ? String(gender).toLowerCase() : null;
  if (normGender && !['male','female','other'].includes(normGender)) return res.status(400).json({ error: 'invalid gender' });
  // Validate date_of_birth basic YYYY-MM-DD
  const dob = typeof date_of_birth === 'string' && date_of_birth.trim() ? date_of_birth.trim() : null;
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return res.status(400).json({ error: 'invalid date_of_birth format, expected YYYY-MM-DD' });
  // Validate assigned nurse if provided
  let nurseId = null;
  if (typeof assigned_nurse_id !== 'undefined' && assigned_nurse_id !== null && assigned_nurse_id !== '') {
    const n = await dbGet("SELECT id, role FROM staff WHERE id = ?", [Number(assigned_nurse_id)]);
    if (!n) return res.status(400).json({ error: 'Assigned nurse does not exist' });
    if (String(n.role) !== 'nurse') return res.status(400).json({ error: 'Assigned staff must be a nurse' });
    nurseId = Number(assigned_nurse_id);
  }
  const finalize = async (assignRoom) => {
    await dbRun('INSERT INTO patients (id, name, contact, room, condition, date_of_birth, gender, assigned_nurse_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [idStr, name, phoneDigits, assignRoom || null, condition || 'stable', dob, normGender, nurseId]);
    if (assignRoom) await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [idStr, assignRoom]);
    // If a bed is requested, mark it occupied if available
    if (bed_id) {
      const b = await dbGet('SELECT occupied FROM beds WHERE id = ?', [String(bed_id)]);
      if (!b) return res.status(400).json({ error: 'Bed does not exist' });
      if (b.occupied) return res.status(400).json({ error: 'Bed is already occupied' });
      await dbRun('UPDATE beds SET occupied = 1, patient_id = ? WHERE id = ?', [idStr, String(bed_id)]);
    }
    res.status(201).json({ id: idStr, room: assignRoom || null, bed_id: bed_id || null });
  };
  if (room) { const r = await dbGet('SELECT occupied FROM rooms WHERE id = ?', [room]); if (!r) return res.status(400).json({ error: 'Room does not exist' }); if (r.occupied) return res.status(400).json({ error: 'Room is already occupied' }); return finalize(room); }
  const preferredType = (condition === 'critical') ? 'icu' : 'ward'; const preferred = await dbGet('SELECT id FROM rooms WHERE occupied = 0 AND type = ? ORDER BY floor LIMIT 1', [preferredType]); if (preferred && preferred.id) return finalize(preferred.id); const any = await dbGet('SELECT id FROM rooms WHERE occupied = 0 ORDER BY floor LIMIT 1'); return finalize(any ? any.id : null);
}));

// Update patient details and (re)assign room
app.put('/api/patients/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const idStr = String(id).trim();
  if (!/^\d{16}$/.test(idStr)) return res.status(400).json({ error: 'patient id must be exactly 16 digits' });
  const existing = await dbGet('SELECT * FROM patients WHERE id = ?', [idStr]);
  if (!existing) return res.status(404).json({ error: 'Patient not found' });

  const { name, contact, room, condition, bed_id, assigned_nurse_id, date_of_birth, gender } = req.body || {};
  const nextName = (typeof name === 'string' && name.trim()) ? name.trim() : existing.name;
  let nextContact = existing.contact;
  if (typeof contact === 'string' && contact.trim()) {
    const phoneDigits = contact.replace(/\D/g, '');
    if (phoneDigits.length !== 10) return res.status(400).json({ error: 'phone number must be exactly 10 digits' });
    nextContact = phoneDigits;
  }
  const nextCondition = (typeof condition === 'string' && condition.trim()) ? condition.trim() : (existing.condition || 'stable');

  // Merge optional demographics
  let nextDob = existing.date_of_birth || null;
  if (typeof date_of_birth !== 'undefined') {
    if (date_of_birth === null || String(date_of_birth).trim() === '') nextDob = null; else {
      const s = String(date_of_birth).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return res.status(400).json({ error: 'invalid date_of_birth format, expected YYYY-MM-DD' });
      nextDob = s;
    }
  }
  let nextGender = existing.gender || null;
  if (typeof gender !== 'undefined') {
    if (gender === null || String(gender).trim() === '') nextGender = null; else {
      const g = String(gender).toLowerCase();
      if (!['male','female','other'].includes(g)) return res.status(400).json({ error: 'invalid gender' });
      nextGender = g;
    }
  }

  // Validate assigned nurse if provided
  let nextAssignedNurseId = existing.assigned_nurse_id || null;
  if (typeof assigned_nurse_id !== 'undefined') {
    if (assigned_nurse_id === null || assigned_nurse_id === '') {
      nextAssignedNurseId = null;
    } else {
      const n = await dbGet("SELECT id, role FROM staff WHERE id = ?", [Number(assigned_nurse_id)]);
      if (!n) return res.status(400).json({ error: 'Assigned nurse does not exist' });
      if (String(n.role) !== 'nurse') return res.status(400).json({ error: 'Assigned staff must be a nurse' });
      nextAssignedNurseId = Number(assigned_nurse_id);
    }
  }

  // Handle room reassignment
  const currentRoom = existing.room || null;
  const desiredRoom = (typeof room === 'string' && room.trim()) ? room.trim() : currentRoom;

  // If room changes
  if (desiredRoom !== currentRoom) {
    // Free current room
    if (currentRoom) {
      await dbRun('UPDATE rooms SET occupied = 0, patient_id = NULL WHERE id = ? AND patient_id = ?', [currentRoom, idStr]);
    }
    // Occupy desired room if provided
    if (desiredRoom) {
      const r = await dbGet('SELECT occupied FROM rooms WHERE id = ?', [desiredRoom]);
      if (!r) return res.status(400).json({ error: 'Room does not exist' });
      if (r.occupied) return res.status(400).json({ error: 'Room is already occupied' });
      await dbRun('UPDATE rooms SET occupied = 1, patient_id = ? WHERE id = ?', [idStr, desiredRoom]);
    }
  }

  await dbRun('UPDATE patients SET name = ?, contact = ?, room = ?, condition = ?, date_of_birth = ?, gender = ?, assigned_nurse_id = ? WHERE id = ?', [nextName, nextContact, desiredRoom, nextCondition, nextDob, nextGender, nextAssignedNurseId, idStr]);
  // Handle bed reassignment: free any existing bed for this patient, then assign new one if provided
  const prevBed = await dbGet('SELECT id FROM beds WHERE patient_id = ? LIMIT 1', [idStr]).catch(() => null);
  if (prevBed && prevBed.id) {
    await dbRun('UPDATE beds SET occupied = 0, patient_id = NULL WHERE id = ?', [prevBed.id]);
  }
  if (bed_id) {
    const b = await dbGet('SELECT occupied FROM beds WHERE id = ?', [String(bed_id)]);
    if (!b) return res.status(400).json({ error: 'Bed does not exist' });
    if (b.occupied) return res.status(400).json({ error: 'Bed is already occupied' });
    await dbRun('UPDATE beds SET occupied = 1, patient_id = ? WHERE id = ?', [idStr, String(bed_id)]);
  }
  const updated = await dbGet('SELECT * FROM patients WHERE id = ?', [idStr]);
  res.json({ message: 'Patient updated', patient: updated });
}));

app.delete('/api/patients/:id', authRequired, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  await dbRun('DELETE FROM vitals WHERE patient_id = ?', [id]);
  await dbRun('DELETE FROM alerts WHERE patient_id = ?', [id]);
  await dbRun('UPDATE rooms SET occupied = 0, patient_id = NULL WHERE patient_id = ?', [id]);
  await dbRun('UPDATE beds SET occupied = 0, patient_id = NULL WHERE patient_id = ?', [id]);
  await dbRun('DELETE FROM patients WHERE id = ?', [id]);
  res.json({ message: 'Deleted' });
}));

// Beds endpoints
app.get('/api/beds', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM beds ORDER BY id');
  res.json(rows);
}));

app.get('/api/beds/available', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT id FROM beds WHERE occupied = 0 ORDER BY id');
  res.json(rows.map(r => r.id));
}));

app.delete('/api/patients', authRequired, asyncHandler(async (req, res) => {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  await dbRun('DELETE FROM vitals');
  await dbRun('DELETE FROM alerts');
  await dbRun('UPDATE rooms SET occupied = 0, patient_id = NULL');
  await dbRun('DELETE FROM patients');
  res.json({ message: 'All patients deleted' });
}));

app.get('/api/vitals', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT v.*, p.name, p.room FROM vitals v JOIN patients p ON v.patient_id = p.id ORDER BY v.timestamp DESC LIMIT 100'); res.json(rows); }));
app.get('/api/alerts', asyncHandler(async (req, res) => { const rows = await dbAll('SELECT a.*, p.name, p.room FROM alerts a JOIN patients p ON a.patient_id = p.id WHERE a.acknowledged = 0 ORDER BY a.timestamp DESC'); res.json(rows); }));
app.put('/api/alerts/:id/acknowledge', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await dbRun('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]);
  try { io.emit('alerts:update', { id: Number(id), acknowledged: true }); } catch {}
  res.json({ message: 'Alert acknowledged' });
}));

// Additional endpoints used by frontend debug panels
app.get('/api/debug/vitals-recent', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM vitals ORDER BY timestamp DESC LIMIT 50');
  res.json(rows);
}));

app.get('/api/vitals/:patientId', asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const rows = await dbAll('SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 200', [patientId]);
  res.json(rows);
}));

// Historical vitals and alerts for reports
app.get('/api/vitals/history', asyncHandler(async (req, res) => {
  const { since } = req.query;
  let sql = 'SELECT v.*, p.name, p.room FROM vitals v LEFT JOIN patients p ON p.id = v.patient_id';
  const params = [];
  if (since) { sql += ' WHERE v.timestamp >= ?'; params.push(String(since)); }
  sql += ' ORDER BY v.timestamp DESC LIMIT 2000';
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

app.get('/api/alerts/history', asyncHandler(async (req, res) => {
  const { since } = req.query;
  let sql = 'SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id';
  const params = [];
  if (since) { sql += ' WHERE a.timestamp >= ?'; params.push(String(since)); }
  sql += ' ORDER BY a.timestamp DESC LIMIT 2000';
  const rows = await dbAll(sql, params);
  res.json(rows);
}));

// Dashboard stats: totals derived from DB
app.get('/api/dashboard/stats', asyncHandler(async (req, res) => {
  const totalPatientsRow = await dbGet('SELECT COUNT(*) as c FROM patients');
  const criticalAlertsRow = await dbGet("SELECT COUNT(*) as c FROM alerts WHERE severity = 'critical' AND acknowledged = 0");
  // Active monitors: patients with a vitals row in last 5 minutes
  const activeMonitorsRow = await dbGet("SELECT COUNT(DISTINCT patient_id) as c FROM vitals WHERE strftime('%s','now') - strftime('%s', timestamp) < 300");
  // Total nurses: count staff with role nurse
  const totalNursesRow = await dbGet("SELECT COUNT(*) as c FROM staff WHERE role = 'nurse'");
  // Avg response time placeholder: compute avg minutes between alert creation and acknowledge for last 50 acknowledged alerts
  const avgRow = await dbGet(
    "SELECT AVG((julianday(a_ack.timestamp) - julianday(a.timestamp)) * 24 * 60) as m FROM alerts a JOIN alerts a_ack ON a_ack.id = a.id WHERE a.acknowledged = 1 ORDER BY a.timestamp DESC LIMIT 50"
  ).catch(() => ({ m: null }));
  const stats = {
    totalPatients: totalPatientsRow?.c || 0,
    activeMonitors: activeMonitorsRow?.c || 0,
    criticalAlerts: criticalAlertsRow?.c || 0,
    totalNurses: totalNursesRow?.c || 0,
    avgResponseTime: typeof avgRow?.m === 'number' && !isNaN(avgRow.m) ? `${Math.round(avgRow.m)} min` : '-',
  };
  res.json(stats);
}));

// MQTT integration
const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://test.mosquitto.org:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'health/vitals/#';
const DEFAULT_PATIENT_ID = process.env.DEFAULT_PATIENT_ID || (process.env.VITE_DEFAULT_PATIENT_ID || 'P001');
let mqttClient;
try {
  mqttClient = mqtt.connect(MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 3000,
  });

  mqttClient.on('connect', () => {
    console.log('MQTT connected to', MQTT_URL);
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
      if (err) console.error('MQTT subscribe error:', err.message);
      else console.log('MQTT subscribed to', MQTT_TOPIC);
    });
  });

  mqttClient.on('error', (e) => console.error('MQTT error:', e && e.message ? e.message : e));

  // Cache latest numeric readings from ESP32 topics
  let lastReadings = { hr: null, spo2: null, tsHr: 0, tsSpO2: 0 };

  mqttClient.on('message', async (topic, payload) => {
    try {
      const text = payload.toString().trim();

      // Handle ESP32 topics: health/vitals/{heartrate|spo2|emergency}
      if (topic.startsWith('health/vitals/')) {
        const now = Date.now();
        let wrote = false;
        if (topic.endsWith('/heartrate')) {
          const hr = Number.parseFloat(text);
          if (!Number.isNaN(hr) && hr > 0) {
            lastReadings.hr = Math.round(hr); lastReadings.tsHr = now;
            await ensurePatientExists(DEFAULT_PATIENT_ID);
            const spo2Val = (lastReadings.spo2 != null && (now - lastReadings.tsSpO2) < 15000) ? lastReadings.spo2 : null;
            await dbRun('INSERT INTO vitals (patient_id, heart_rate, spo2) VALUES (?, ?, ?)', [DEFAULT_PATIENT_ID, lastReadings.hr, spo2Val]);
            try { io.emit('vitals', { patient_id: DEFAULT_PATIENT_ID, heart_rate: lastReadings.hr, spo2: spo2Val, timestamp: new Date().toISOString() }); } catch {}
            if (lastReadings.hr > 100) {
              const rWarn = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [DEFAULT_PATIENT_ID, 'heart_rate', 'warning', 'High heart rate detected', lastReadings.hr, spo2Val]);
              const alertWarn = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [rWarn.lastID]);
              try { io.emit('alerts:new', alertWarn); } catch {}
              await notifyStaffOfAlert(alertWarn);
            }
            wrote = true;
          }
        } else if (topic.endsWith('/spo2')) {
          const s2 = Number.parseFloat(text);
          if (!Number.isNaN(s2) && s2 > 0) {
            lastReadings.spo2 = Math.round(s2); lastReadings.tsSpO2 = now;
            await ensurePatientExists(DEFAULT_PATIENT_ID);
            const hrVal = (lastReadings.hr != null && (now - lastReadings.tsHr) < 15000) ? lastReadings.hr : null;
            await dbRun('INSERT INTO vitals (patient_id, heart_rate, spo2) VALUES (?, ?, ?)', [DEFAULT_PATIENT_ID, hrVal, lastReadings.spo2]);
            try { io.emit('vitals', { patient_id: DEFAULT_PATIENT_ID, heart_rate: hrVal, spo2: lastReadings.spo2, timestamp: new Date().toISOString() }); } catch {}
            if (lastReadings.spo2 < 90) {
              const rCrit = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [DEFAULT_PATIENT_ID, 'spo2', 'critical', 'Low SpO2 detected', hrVal, lastReadings.spo2]);
              const alertCrit = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [rCrit.lastID]);
              try { io.emit('alerts:new', alertCrit); } catch {}
              await notifyStaffOfAlert(alertCrit);
            }
            wrote = true;
          }
        } else if (topic.endsWith('/emergency')) {
          const msg = text || 'Emergency triggered';
          await ensurePatientExists(DEFAULT_PATIENT_ID);
          // Ensure the emergency alert carries the most recent vitals if available
          let hrVal = lastReadings.hr;
          let spo2Val = lastReadings.spo2;
          if (hrVal == null || spo2Val == null) {
            try {
              const latest = await dbGet('SELECT heart_rate, spo2 FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1', [DEFAULT_PATIENT_ID]);
              if (latest) {
                if (hrVal == null && typeof latest.heart_rate !== 'undefined') hrVal = latest.heart_rate;
                if (spo2Val == null && typeof latest.spo2 !== 'undefined') spo2Val = latest.spo2;
              }
            } catch {}
          }
          const r = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [DEFAULT_PATIENT_ID, 'emergency', 'critical', msg, (hrVal != null ? hrVal : null), (spo2Val != null ? spo2Val : null)]);
          // Also persist a vitals snapshot at the time of emergency if values exist
          if (hrVal != null || spo2Val != null) {
            try {
              await dbRun('INSERT INTO vitals (patient_id, heart_rate, spo2) VALUES (?, ?, ?)', [DEFAULT_PATIENT_ID, (hrVal != null ? hrVal : null), (spo2Val != null ? spo2Val : null)]);
              try { io.emit('vitals', { patient_id: DEFAULT_PATIENT_ID, heart_rate: (hrVal != null ? hrVal : null), spo2: (spo2Val != null ? spo2Val : null), timestamp: new Date().toISOString() }); } catch {}
            } catch {}
          }
          const alertRow = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [r.lastID]);
          try { io.emit('alerts:new', alertRow); } catch {}
          await notifyStaffOfAlert(alertRow);
          console.log('[MQTT] Stored emergency alert', { patient_id: DEFAULT_PATIENT_ID, message: msg, hr: lastReadings.hr || null, spo2: lastReadings.spo2 || null });
          return;
        }

        // When both readings are fresh (within 10s), store a vitals row
        if (!wrote && lastReadings.hr != null && lastReadings.spo2 != null && Math.abs(lastReadings.tsHr - lastReadings.tsSpO2) < 10000) {
          await ensurePatientExists(DEFAULT_PATIENT_ID);
          await dbRun('INSERT INTO vitals (patient_id, heart_rate, spo2) VALUES (?, ?, ?)', [DEFAULT_PATIENT_ID, lastReadings.hr, lastReadings.spo2]);
          console.log('[MQTT] Stored vitals', { patient_id: DEFAULT_PATIENT_ID, hr: lastReadings.hr, spo2: lastReadings.spo2 });
          try { io.emit('vitals', { patient_id: DEFAULT_PATIENT_ID, heart_rate: lastReadings.hr, spo2: lastReadings.spo2, timestamp: new Date().toISOString() }); } catch {}
          // Simple alert rules
          if (lastReadings.hr > 100) {
            const r1 = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [DEFAULT_PATIENT_ID, 'heart_rate', 'warning', 'High heart rate detected', lastReadings.hr, lastReadings.spo2]);
            const alert1 = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [r1.lastID]);
            try { io.emit('alerts:new', alert1); } catch {}
            await notifyStaffOfAlert(alert1);
          }
          if (lastReadings.spo2 < 90) {
            const r2 = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [DEFAULT_PATIENT_ID, 'spo2', 'critical', 'Low SpO2 detected', lastReadings.hr, lastReadings.spo2]);
            const alert2 = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [r2.lastID]);
            try { io.emit('alerts:new', alert2); } catch {}
            await notifyStaffOfAlert(alert2);
          }
        }
        return;
      }

      // Fallback: JSON payloads like { patient_id, heart_rate, spo2 }
      const data = JSON.parse(text);
      const { patient_id, heart_rate, spo2 } = data || {};
      if (!patient_id) return;
      if (!ALLOW_DYNAMIC_PATIENTS && patient_id !== DEFAULT_PATIENT_ID) return;
      await ensurePatientExists(patient_id);
      await dbRun('INSERT INTO vitals (patient_id, heart_rate, spo2) VALUES (?, ?, ?)', [patient_id, Number(heart_rate) || null, Number(spo2) || null]);
      console.log('[MQTT] Stored vitals', { patient_id, hr: Number(heart_rate) || null, spo2: Number(spo2) || null });
      try { io.emit('vitals', { patient_id, heart_rate: Number(heart_rate) || null, spo2: Number(spo2) || null, timestamp: new Date().toISOString() }); } catch {}
      if (Number(heart_rate) > 100) {
        const r3 = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [patient_id, 'heart_rate', 'warning', 'High heart rate detected', Number(heart_rate), Number(spo2) || null]);
        const alert3 = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [r3.lastID]);
        try { io.emit('alerts:new', alert3); } catch {}
        await notifyStaffOfAlert(alert3);
      }
      if (Number(spo2) < 90) {
        const r4 = await dbRun('INSERT INTO alerts (patient_id, type, severity, message, heart_rate, spo2) VALUES (?, ?, ?, ?, ?, ?)', [patient_id, 'spo2', 'critical', 'Low SpO2 detected', Number(heart_rate) || null, Number(spo2)]);
        const alert4 = await dbGet('SELECT a.*, p.name, p.room FROM alerts a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [r4.lastID]);
        try { io.emit('alerts:new', alert4); } catch {}
        await notifyStaffOfAlert(alert4);
      }
    } catch (e) {
      console.error('MQTT message handling failed:', e && e.message ? e.message : e);
    }
  });
} catch (e) {
  console.error('MQTT init failed:', e);
}

// 404 & error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error('Unhandled error:', err && err.stack ? err.stack : err); if (res.headersSent) return next(err); res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal server error' }); });

process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); });

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
process.on('SIGINT', () => { db.close(() => process.exit(0)); });
