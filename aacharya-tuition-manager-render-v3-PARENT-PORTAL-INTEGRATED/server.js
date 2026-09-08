'use strict';

const express = require('./lib/mini-express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('./lib/xlsx-lite');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Aacharya Sudheer';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-session-secret-change-me';
const ADMIN_SYNC_KEY = process.env.ADMIN_SYNC_KEY || 'development-sync-key-change-me';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, 'aacharya_tuition.sqlite');
const EXCEL_PATH = path.join(DATA_DIR, 'Aacharya_Tuition_Master.xlsx');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

function nowIso() { return new Date().toISOString(); }
function clean(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function safeJson(v) { try { return JSON.stringify(v); } catch { return '{}'; } }
function durationHours(start, end) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start || '');
  const n = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(end || '');
  if (!m || !n) return 0;
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(n[1]) * 60 + Number(n[2]);
  return b > a ? Math.round(((b - a) / 60) * 100) / 100 : 0;
}
function gradeFromPercentage(p) {
  const x = Number(p || 0);
  if (x >= 90) return 'A+';
  if (x >= 75) return 'A';
  if (x >= 60) return 'B';
  if (x >= 40) return 'C';
  return 'Needs Improvement';
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_code TEXT UNIQUE,
      full_name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      school TEXT,
      board TEXT,
      grade TEXT NOT NULL,
      stream TEXT,
      joining_date TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      parent_name TEXT,
      parent_phone TEXT,
      parent_email TEXT,
      subjects TEXT NOT NULL,
      fee_plan_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      notes TEXT,
      intake_submission_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_hours REAL NOT NULL DEFAULT 0,
      subject TEXT NOT NULL,
      topic TEXT,
      mode TEXT NOT NULL DEFAULT 'Online',
      status TEXT NOT NULL DEFAULT 'Scheduled',
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      marked_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, attendance_date)
    );
    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      billing_type TEXT NOT NULL DEFAULT 'Monthly',
      amount REAL NOT NULL DEFAULT 0,
      billing_period TEXT,
      due_date TEXT,
      total_hours_included REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      fee_id INTEGER REFERENCES fees(id) ON DELETE SET NULL,
      receipt_no TEXT NOT NULL UNIQUE,
      payer_name TEXT NOT NULL,
      payer_relation TEXT,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL,
      transaction_reference TEXT,
      billing_period TEXT,
      received_by TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      test_name TEXT NOT NULL,
      subject TEXT,
      test_date TEXT NOT NULL,
      max_marks REAL NOT NULL,
      marks_obtained REAL NOT NULL,
      percentage REAL NOT NULL,
      grade TEXT NOT NULL,
      teacher_remarks TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intake_submissions (
      id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      grade TEXT NOT NULL,
      school TEXT,
      board TEXT,
      student_phone TEXT,
      student_email TEXT,
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      parent_email TEXT,
      subjects TEXT NOT NULL,
      preferred_mode TEXT,
      address TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      submitted_at TEXT NOT NULL,
      accepted_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      actor TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_classes_student_date ON classes(student_id, class_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, attendance_date);
    CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);
    CREATE INDEX IF NOT EXISTS idx_payments_student_date ON payments(student_id, payment_date);
    CREATE INDEX IF NOT EXISTS idx_tests_student_date ON tests(student_id, test_date);
  `);
  const defaults = {
    academy_name: 'AACHARYA LEARNING ACADEMY',
    currency: 'INR',
    background_image_url: '',
    academic_year: '2026-27'
  };
  const insert = db.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)');
  for (const [k, v] of Object.entries(defaults)) insert.run(k, v, nowIso());
}

function audit(action, entityType, entityId, details, actor = ADMIN_NAME) {
  db.prepare('INSERT INTO audit_log(action,entity_type,entity_id,details,actor,created_at) VALUES(?,?,?,?,?,?)')
    .run(action, entityType, entityId == null ? '' : String(entityId), safeJson(details), actor, nowIso());
}

function rows(sql, ...params) { return db.prepare(sql).all(...params).map(r => ({ ...r })); }
function one(sql, ...params) { const r = db.prepare(sql).get(...params); return r ? { ...r } : null; }
function studentCode(id) { return `ALA-${String(id).padStart(4, '0')}`; }
function nextReceipt() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const prefix = `ALA-${ymd}-%`;
  const count = Number(one('SELECT COUNT(*) AS c FROM payments WHERE receipt_no LIKE ?', prefix)?.c || 0) + 1;
  return `ALA-${ymd}-${String(count).padStart(3,'0')}`;
}

function setCols(ws, widths) { ws['!cols'] = widths.map(w => ({ wch: w })); }
function sheetFromJson(data, widths) {
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Message: 'No records yet' }]);
  if (widths) setCols(ws, widths);
  return ws;
}
function sheetFromAoa(data, widths) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  if (widths) setCols(ws, widths);
  return ws;
}

function rebuildWorkbook() {
  const wb = XLSX.utils.book_new();
  const stats = one(`SELECT
    (SELECT COUNT(*) FROM students WHERE status='Active') active_students,
    (SELECT COUNT(*) FROM students) total_students,
    (SELECT COUNT(*) FROM classes) total_classes,
    (SELECT COALESCE(SUM(amount),0) FROM payments) total_collected,
    (SELECT COUNT(*) FROM intake_submissions WHERE status='New') new_intakes`);
  const attendanceStats = one(`SELECT
    COUNT(*) total,
    SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) present,
    SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) absent,
    SUM(CASE WHEN status='Late' THEN 1 ELSE 0 END) late,
    SUM(CASE WHEN status='Excused' THEN 1 ELSE 0 END) excused
    FROM attendance`);
  const summary = [
    ['AACHARYA LEARNING ACADEMY', 'Master Tuition Workbook'],
    ['Generated At', nowIso()],
    ['Total Students', stats.total_students || 0],
    ['Active Students', stats.active_students || 0],
    ['Total Classes', stats.total_classes || 0],
    ['Total Payments Collected', stats.total_collected || 0],
    ['New Intake Forms', stats.new_intakes || 0],
    ['Attendance Entries', attendanceStats.total || 0],
    ['Present', attendanceStats.present || 0],
    ['Absent', attendanceStats.absent || 0],
    ['Late', attendanceStats.late || 0]
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(summary, [34, 24]), 'Summary');

  const students = rows(`SELECT id,student_code,full_name,dob,gender,school,board,grade,stream,joining_date,phone,email,address,parent_name,parent_phone,parent_email,subjects,fee_plan_amount,status,notes,intake_submission_id,created_at,updated_at FROM students ORDER BY full_name`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(students, [8,14,24,12,10,24,14,14,14,14,16,28,34,24,18,28,28,14,12,38,24,22,22]), 'Students');

  const classes = rows(`SELECT c.id,s.student_code,s.full_name student,c.class_date,c.start_time,c.end_time,c.duration_hours,c.subject,c.topic,c.mode,c.status,c.notes,c.created_by,c.created_at,c.updated_at FROM classes c JOIN students s ON s.id=c.student_id ORDER BY c.class_date,c.start_time`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(classes, [8,14,24,12,10,10,12,18,32,12,14,30,20,22,22]), 'Classes');

  const attendance = rows(`SELECT a.id,s.student_code,s.full_name student,a.attendance_date,a.status,a.notes,a.marked_by,a.created_at,a.updated_at FROM attendance a JOIN students s ON s.id=a.student_id ORDER BY a.attendance_date DESC,s.full_name`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(attendance, [8,14,24,14,12,30,20,22,22]), 'Attendance');

  const attendanceSummary = rows(`SELECT s.student_code,s.full_name student,
    COUNT(a.id) total_entries,
    SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) present,
    SUM(CASE WHEN a.status='Absent' THEN 1 ELSE 0 END) absent,
    SUM(CASE WHEN a.status='Late' THEN 1 ELSE 0 END) late,
    SUM(CASE WHEN a.status='Excused' THEN 1 ELSE 0 END) excused,
    ROUND(CASE WHEN SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END)=0 THEN 0 ELSE
      100.0*SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)/SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END) END,1) attendance_percentage
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id GROUP BY s.id ORDER BY s.full_name`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(attendanceSummary, [14,24,14,12,12,10,10,20]), 'Attendance Summary');

  const fees = rows(`SELECT f.id,s.student_code,s.full_name student,f.billing_type,f.amount,f.billing_period,f.due_date,f.total_hours_included,f.status,f.notes,f.created_at,f.updated_at FROM fees f JOIN students s ON s.id=f.student_id ORDER BY f.due_date DESC,f.id DESC`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(fees, [8,14,24,14,14,18,14,18,14,30,22,22]), 'Fees');

  const payments = rows(`SELECT p.id,p.receipt_no,s.student_code,s.full_name student,p.payer_name,p.payer_relation,p.amount,p.payment_date,p.method,p.transaction_reference,p.billing_period,p.received_by,p.notes,p.fee_id,p.created_at FROM payments p JOIN students s ON s.id=p.student_id ORDER BY p.payment_date DESC,p.id DESC`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(payments, [8,18,14,24,24,16,14,14,16,24,18,22,30,10,22]), 'Payments');

  const finance = rows(`SELECT s.student_code,s.full_name student,s.fee_plan_amount current_fee_plan,
    COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.student_id=s.id),0) fees_billed,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id),0) total_paid,
    ROUND(COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.student_id=s.id),s.fee_plan_amount)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id),0),2) pending_balance,
    (SELECT MAX(p.payment_date) FROM payments p WHERE p.student_id=s.id) last_payment_date
    FROM students s ORDER BY s.full_name`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(finance, [14,24,18,16,16,18,18]), 'Finance Summary');

  const tests = rows(`SELECT t.id,s.student_code,s.full_name student,t.test_name,t.subject,t.test_date,t.marks_obtained,t.max_marks,t.percentage,t.grade,t.teacher_remarks,t.created_at FROM tests t JOIN students s ON s.id=t.student_id ORDER BY t.test_date DESC,t.id DESC`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(tests, [8,14,24,24,18,14,14,14,14,16,34,22]), 'Tests');

  const intakes = rows(`SELECT id,student_name,dob,gender,grade,school,board,student_phone,student_email,parent_name,parent_phone,parent_email,subjects,preferred_mode,address,notes,status,submitted_at,accepted_student_id FROM intake_submissions ORDER BY submitted_at DESC`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(intakes, [36,24,12,10,14,24,14,18,28,24,18,28,28,16,34,38,12,22,16]), 'Intake Submissions');

  const auditRows = rows(`SELECT id,action,entity_type,entity_id,details,actor,created_at FROM audit_log ORDER BY id DESC`);
  XLSX.utils.book_append_sheet(wb, sheetFromJson(auditRows, [8,18,16,12,54,22,24]), 'Audit Log');

  const settingsRows = rows('SELECT key,value,updated_at FROM settings ORDER BY key');
  XLSX.utils.book_append_sheet(wb, sheetFromJson(settingsRows, [24,48,24]), 'Settings');

  XLSX.writeFile(wb, EXCEL_PATH, { bookType: 'xlsx', compression: true });
  return EXCEL_PATH;
}

function afterMutation() {
  try { rebuildWorkbook(); }
  catch (err) { console.error('Excel rebuild failed:', err); }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}
function b64url(s) { return Buffer.from(s).toString('base64url'); }
function signSession(email) {
  const payload = b64url(JSON.stringify({ email, exp: Date.now() + 12 * 60 * 60 * 1000 }));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() && data.email === ADMIN_EMAIL ? data : null;
  } catch { return null; }
}
function authRequired(req, res, next) {
  const session = verifySession(parseCookies(req).atm_session);
  if (!session) return res.status(401).json({ ok: false, message: 'Login required.' });
  req.admin = { email: ADMIN_EMAIL, name: ADMIN_NAME };
  next();
}
function syncKeyRequired(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(token); const b = Buffer.from(ADMIN_SYNC_KEY);
  if (!token || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, message: 'Invalid sync key.' });
  next();
}

const loginAttempts = new Map();
function loginAllowed(ip) {
  const now = Date.now();
  const row = loginAttempts.get(ip) || { start: now, count: 0 };
  if (now - row.start > 15 * 60 * 1000) { row.start = now; row.count = 0; }
  row.count += 1; loginAttempts.set(ip, row);
  return row.count <= 20;
}
const intakeAttempts = new Map();
function intakeAllowed(ip) {
  const now = Date.now();
  const row = intakeAttempts.get(ip) || { start: now, count: 0 };
  if (now - row.start > 60 * 60 * 1000) { row.start = now; row.count = 0; }
  row.count += 1; intakeAttempts.set(ip, row);
  return row.count <= 20;
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(express.json({ limit: '250kb' }));
app.use(express.urlencoded({ extended: false, limit: '250kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'apply.html')));
app.get('/apply', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'apply.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'Aacharya Tuition Manager',
  dataDir: DATA_DIR,
  excelFile: path.basename(EXCEL_PATH),
  persistentDiskExpected: DATA_DIR === '/var/data'
}));

// Parent Portal Extension bridge. This adds isolated integration routes only.
const parentPortalBridge = require('./integration/parent-portal-bridge')({
  app, db, rebuildWorkbook, adminName: ADMIN_NAME, audit
});

app.post('/api/auth/login', (req, res) => {
  if (!loginAllowed(req.ip)) return res.status(429).json({ ok: false, message: 'Too many login attempts. Try later.' });
  const email = clean(req.body.email, 200).toLowerCase();
  const password = String(req.body.password || '');
  const e1 = Buffer.from(email); const e2 = Buffer.from(ADMIN_EMAIL);
  const p1 = Buffer.from(password); const p2 = Buffer.from(ADMIN_PASSWORD);
  const emailOk = e1.length === e2.length && crypto.timingSafeEqual(e1, e2);
  const passwordOk = p1.length === p2.length && crypto.timingSafeEqual(p1, p2);
  if (!emailOk || !passwordOk) return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
  const token = signSession(email);
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `atm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
  audit('LOGIN', 'auth', email, { ip: req.ip }, ADMIN_NAME);
  res.json({ ok: true, admin: { name: ADMIN_NAME, email: ADMIN_EMAIL } });
});
app.get('/api/auth/me', authRequired, (req, res) => res.json({ ok: true, admin: req.admin }));
app.post('/api/auth/logout', authRequired, (req, res) => {
  res.setHeader('Set-Cookie', 'atm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  audit('LOGOUT', 'auth', ADMIN_EMAIL, {}, ADMIN_NAME);
  res.json({ ok: true });
});

function publicIntakeHandler(req, res) {
  if (!intakeAllowed(req.ip)) return res.status(429).json({ ok: false, message: 'Too many submissions from this connection. Please try later.' });
  if (clean(req.body.website, 100)) return res.status(200).json({ ok: true, message: 'Thank you.' });
  const studentName = clean(req.body.studentName, 120);
  const grade = clean(req.body.grade, 80);
  const parentName = clean(req.body.parentName, 120);
  const parentPhone = clean(req.body.parentPhone, 40);
  const subjects = Array.isArray(req.body.subjects) ? req.body.subjects.map(x => clean(x, 50)).filter(Boolean).join(', ') : clean(req.body.subjects, 250);
  if (!studentName || !grade || !parentName || !parentPhone || !subjects) return res.status(400).json({ ok: false, message: 'Please complete all required fields.' });
  const id = crypto.randomUUID();
  const submittedAt = nowIso();
  db.prepare(`INSERT INTO intake_submissions(id,student_name,dob,gender,grade,school,board,student_phone,student_email,parent_name,parent_phone,parent_email,subjects,preferred_mode,address,notes,status,submitted_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, studentName, clean(req.body.dob, 20), clean(req.body.gender, 30), grade, clean(req.body.school, 150), clean(req.body.board, 80),
      clean(req.body.studentPhone, 40), clean(req.body.studentEmail, 180), parentName, parentPhone, clean(req.body.parentEmail, 180), subjects,
      clean(req.body.preferredMode, 30), clean(req.body.address, 500), clean(req.body.notes, 1200), 'New', submittedAt
    );
  audit('CREATE', 'intake_submission', id, { studentName, grade, subjects }, 'Public form');
  afterMutation();
  res.status(201).json({ ok: true, id, message: 'Information submitted successfully.' });
}
app.post('/api/intake', publicIntakeHandler);
app.post('/api/apply', publicIntakeHandler);

app.get('/api/dashboard', authRequired, (req, res) => {
  const summary = one(`SELECT
    (SELECT COUNT(*) FROM students) total_students,
    (SELECT COUNT(*) FROM students WHERE status='Active') active_students,
    (SELECT COUNT(*) FROM classes WHERE class_date=date('now','localtime')) todays_classes,
    (SELECT COUNT(*) FROM classes WHERE status='Completed') completed_classes,
    (SELECT COALESCE(SUM(amount),0) FROM payments) collected,
    (SELECT COUNT(*) FROM intake_submissions WHERE status='New') new_intakes`);
  const att = one(`SELECT COUNT(*) total, SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) good, SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) absent FROM attendance WHERE status!='Excused'`);
  summary.attendance_percentage = att.total ? Math.round((att.good / att.total) * 100) : null;
  summary.absent_count = att.absent || 0;
  const upcoming = rows(`SELECT c.*,s.full_name student FROM classes c JOIN students s ON s.id=c.student_id WHERE c.status='Scheduled' ORDER BY c.class_date,c.start_time LIMIT 8`);
  const recentPayments = rows(`SELECT p.*,s.full_name student FROM payments p JOIN students s ON s.id=p.student_id ORDER BY p.payment_date DESC,p.id DESC LIMIT 8`);
  res.json({ ok: true, summary, upcoming, recentPayments });
});

app.get('/api/students', authRequired, (req, res) => {
  const term = clean(req.query.q, 100).toLowerCase();
  let sql = `SELECT * FROM students`;
  let params = [];
  if (term) { sql += ` WHERE lower(full_name||' '||coalesce(student_code,'')||' '||coalesce(phone,'')||' '||coalesce(parent_name,'')||' '||coalesce(parent_phone,'')) LIKE ?`; params = [`%${term}%`]; }
  sql += ' ORDER BY full_name';
  res.json({ ok: true, students: rows(sql, ...params) });
});
app.post('/api/students', authRequired, (req, res) => {
  const b = req.body || {};
  const fullName = clean(b.full_name, 120), grade = clean(b.grade, 80), subjects = clean(b.subjects, 250);
  if (!fullName || !grade || !subjects) return res.status(400).json({ ok: false, message: 'Name, grade and subjects are required.' });
  const t = nowIso();
  const info = db.prepare(`INSERT INTO students(full_name,dob,gender,school,board,grade,stream,joining_date,phone,email,address,parent_name,parent_phone,parent_email,subjects,fee_plan_amount,status,notes,intake_submission_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      fullName, clean(b.dob,20), clean(b.gender,30), clean(b.school,150), clean(b.board,80), grade, clean(b.stream,80), clean(b.joining_date,20),
      clean(b.phone,40), clean(b.email,180), clean(b.address,500), clean(b.parent_name,120), clean(b.parent_phone,40), clean(b.parent_email,180), subjects,
      Math.max(0,num(b.fee_plan_amount)), clean(b.status,30)||'Active', clean(b.notes,1200), clean(b.intake_submission_id,80)||null, t, t
    );
  const id = Number(info.lastInsertRowid);
  db.prepare('UPDATE students SET student_code=? WHERE id=?').run(studentCode(id), id);
  audit('CREATE','student',id,{fullName,grade,subjects},ADMIN_NAME); afterMutation();
  res.status(201).json({ ok: true, student: one('SELECT * FROM students WHERE id=?', id) });
});
app.put('/api/students/:id', authRequired, (req, res) => {
  const id = Number(req.params.id); if (!one('SELECT id FROM students WHERE id=?', id)) return res.status(404).json({ ok:false,message:'Student not found.'});
  const b=req.body||{}, fullName=clean(b.full_name,120),grade=clean(b.grade,80),subjects=clean(b.subjects,250);
  if(!fullName||!grade||!subjects)return res.status(400).json({ok:false,message:'Name, grade and subjects are required.'});
  db.prepare(`UPDATE students SET full_name=?,dob=?,gender=?,school=?,board=?,grade=?,stream=?,joining_date=?,phone=?,email=?,address=?,parent_name=?,parent_phone=?,parent_email=?,subjects=?,fee_plan_amount=?,status=?,notes=?,updated_at=? WHERE id=?`).run(
    fullName,clean(b.dob,20),clean(b.gender,30),clean(b.school,150),clean(b.board,80),grade,clean(b.stream,80),clean(b.joining_date,20),clean(b.phone,40),clean(b.email,180),clean(b.address,500),clean(b.parent_name,120),clean(b.parent_phone,40),clean(b.parent_email,180),subjects,Math.max(0,num(b.fee_plan_amount)),clean(b.status,30)||'Active',clean(b.notes,1200),nowIso(),id);
  audit('UPDATE','student',id,{fullName},ADMIN_NAME); afterMutation(); res.json({ok:true,student:one('SELECT * FROM students WHERE id=?',id)});
});
app.delete('/api/students/:id', authRequired, (req,res)=>{
  const id=Number(req.params.id); const s=one('SELECT * FROM students WHERE id=?',id); if(!s)return res.status(404).json({ok:false,message:'Student not found.'});
  const paymentCount=Number(one('SELECT COUNT(*) c FROM payments WHERE student_id=?',id)?.c||0);
  if(paymentCount>0)return res.status(409).json({ok:false,message:'This student has payment history. Set status to Inactive instead of deleting.'});
  db.prepare('DELETE FROM students WHERE id=?').run(id); audit('DELETE','student',id,{name:s.full_name},ADMIN_NAME); afterMutation(); res.json({ok:true});
});

app.get('/api/classes', authRequired, (req,res)=>res.json({ok:true,classes:rows(`SELECT c.*,s.full_name student,s.student_code FROM classes c JOIN students s ON s.id=c.student_id ORDER BY c.class_date DESC,c.start_time DESC`)}));
app.post('/api/classes', authRequired, (req,res)=>{
  const b=req.body||{}, studentId=Number(b.student_id), date=clean(b.class_date,20),start=clean(b.start_time,10),end=clean(b.end_time,10),subject=clean(b.subject,120),dur=durationHours(start,end);
  if(!one('SELECT id FROM students WHERE id=?',studentId)||!validDate(date)||!dur||!subject)return res.status(400).json({ok:false,message:'Valid student, date, times and subject are required.'});
  const t=nowIso(); const info=db.prepare(`INSERT INTO classes(student_id,class_date,start_time,end_time,duration_hours,subject,topic,mode,status,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(studentId,date,start,end,dur,subject,clean(b.topic,250),clean(b.mode,30)||'Online',clean(b.status,30)||'Scheduled',clean(b.notes,800),ADMIN_NAME,t,t);
  const id=Number(info.lastInsertRowid);audit('CREATE','class',id,{studentId,date,start,end,dur},ADMIN_NAME);afterMutation();res.status(201).json({ok:true,class:one('SELECT * FROM classes WHERE id=?',id)});
});
app.put('/api/classes/:id', authRequired, (req,res)=>{
  const id=Number(req.params.id), old=one('SELECT * FROM classes WHERE id=?',id);if(!old)return res.status(404).json({ok:false,message:'Class not found.'});
  const b=req.body||{}, studentId=Number(b.student_id),date=clean(b.class_date,20),start=clean(b.start_time,10),end=clean(b.end_time,10),dur=durationHours(start,end),subject=clean(b.subject,120);
  if(!one('SELECT id FROM students WHERE id=?',studentId)||!validDate(date)||!dur||!subject)return res.status(400).json({ok:false,message:'Valid class information is required.'});
  db.prepare(`UPDATE classes SET student_id=?,class_date=?,start_time=?,end_time=?,duration_hours=?,subject=?,topic=?,mode=?,status=?,notes=?,updated_at=? WHERE id=?`).run(studentId,date,start,end,dur,subject,clean(b.topic,250),clean(b.mode,30)||'Online',clean(b.status,30)||old.status,clean(b.notes,800),nowIso(),id);
  audit('UPDATE','class',id,{date,start,end,dur},ADMIN_NAME);afterMutation();res.json({ok:true});
});
app.post('/api/classes/:id/complete',authRequired,(req,res)=>{const id=Number(req.params.id);if(!one('SELECT id FROM classes WHERE id=?',id))return res.status(404).json({ok:false,message:'Class not found.'});db.prepare(`UPDATE classes SET status='Completed',updated_at=? WHERE id=?`).run(nowIso(),id);audit('COMPLETE','class',id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});
app.delete('/api/classes/:id',authRequired,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM classes WHERE id=?').run(id);audit('DELETE','class',id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/attendance',authRequired,(req,res)=>{
  const log=rows(`SELECT a.*,s.full_name student,s.student_code FROM attendance a JOIN students s ON s.id=a.student_id ORDER BY a.attendance_date DESC,a.id DESC`);
  const summary=rows(`SELECT s.id student_id,s.student_code,s.full_name student,COUNT(a.id) total_entries,SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) present,SUM(CASE WHEN a.status='Absent' THEN 1 ELSE 0 END) absent,SUM(CASE WHEN a.status='Late' THEN 1 ELSE 0 END) late,SUM(CASE WHEN a.status='Excused' THEN 1 ELSE 0 END) excused,ROUND(CASE WHEN SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END)=0 THEN 0 ELSE 100.0*SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)/SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END) END,1) percentage FROM students s LEFT JOIN attendance a ON a.student_id=s.id GROUP BY s.id ORDER BY s.full_name`);
  res.json({ok:true,log,summary});
});
app.post('/api/attendance',authRequired,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),date=clean(b.attendance_date,20),status=clean(b.status,30);if(!one('SELECT id FROM students WHERE id=?',sid)||!validDate(date)||!['Present','Absent','Late','Excused'].includes(status))return res.status(400).json({ok:false,message:'Valid student, date and attendance status are required.'});
  const t=nowIso();db.prepare(`INSERT INTO attendance(student_id,attendance_date,status,notes,marked_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,notes=excluded.notes,marked_by=excluded.marked_by,updated_at=excluded.updated_at`).run(sid,date,status,clean(b.notes,500),ADMIN_NAME,t,t);audit('UPSERT','attendance',`${sid}:${date}`,{status},ADMIN_NAME);afterMutation();res.status(201).json({ok:true});
});
app.delete('/api/attendance/:id',authRequired,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM attendance WHERE id=?').run(id);audit('DELETE','attendance',id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/fees',authRequired,(req,res)=>res.json({ok:true,fees:rows(`SELECT f.*,s.full_name student,s.student_code FROM fees f JOIN students s ON s.id=f.student_id ORDER BY f.id DESC`)}));
app.post('/api/fees',authRequired,(req,res)=>{const b=req.body||{},sid=Number(b.student_id),amount=Math.max(0,num(b.amount));if(!one('SELECT id FROM students WHERE id=?',sid)||amount<=0)return res.status(400).json({ok:false,message:'Student and positive fee amount are required.'});const t=nowIso();const info=db.prepare(`INSERT INTO fees(student_id,billing_type,amount,billing_period,due_date,total_hours_included,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(sid,clean(b.billing_type,40)||'Monthly',amount,clean(b.billing_period,80),clean(b.due_date,20),Math.max(0,num(b.total_hours_included)),clean(b.status,30)||'Pending',clean(b.notes,800),t,t);const id=Number(info.lastInsertRowid);audit('CREATE','fee',id,{sid,amount},ADMIN_NAME);afterMutation();res.status(201).json({ok:true,fee:one('SELECT * FROM fees WHERE id=?',id)});});
app.put('/api/fees/:id',authRequired,(req,res)=>{const id=Number(req.params.id);if(!one('SELECT id FROM fees WHERE id=?',id))return res.status(404).json({ok:false,message:'Fee record not found.'});const b=req.body||{},sid=Number(b.student_id),amount=Math.max(0,num(b.amount));if(!one('SELECT id FROM students WHERE id=?',sid)||amount<=0)return res.status(400).json({ok:false,message:'Valid student and amount required.'});db.prepare(`UPDATE fees SET student_id=?,billing_type=?,amount=?,billing_period=?,due_date=?,total_hours_included=?,status=?,notes=?,updated_at=? WHERE id=?`).run(sid,clean(b.billing_type,40)||'Monthly',amount,clean(b.billing_period,80),clean(b.due_date,20),Math.max(0,num(b.total_hours_included)),clean(b.status,30)||'Pending',clean(b.notes,800),nowIso(),id);audit('UPDATE','fee',id,{amount},ADMIN_NAME);afterMutation();res.json({ok:true});});
app.delete('/api/fees/:id',authRequired,(req,res)=>{const id=Number(req.params.id);const paid=Number(one('SELECT COUNT(*) c FROM payments WHERE fee_id=?',id)?.c||0);if(paid)return res.status(409).json({ok:false,message:'This fee has payment records and cannot be deleted.'});db.prepare('DELETE FROM fees WHERE id=?').run(id);audit('DELETE','fee',id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/payments',authRequired,(req,res)=>res.json({ok:true,payments:rows(`SELECT p.*,s.full_name student,s.student_code FROM payments p JOIN students s ON s.id=p.student_id ORDER BY p.payment_date DESC,p.id DESC`)}));
app.post('/api/payments',authRequired,(req,res)=>{const b=req.body||{},sid=Number(b.student_id),amount=num(b.amount),payer=clean(b.payer_name,120),date=clean(b.payment_date,20),method=clean(b.method,50);if(!one('SELECT id FROM students WHERE id=?',sid)||amount<=0||!payer||!validDate(date)||!method)return res.status(400).json({ok:false,message:'Student, payer, positive amount, date and method are required.'});const receipt=nextReceipt();const info=db.prepare(`INSERT INTO payments(student_id,fee_id,receipt_no,payer_name,payer_relation,amount,payment_date,method,transaction_reference,billing_period,received_by,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sid,b.fee_id?Number(b.fee_id):null,receipt,payer,clean(b.payer_relation,50),amount,date,method,clean(b.transaction_reference,150),clean(b.billing_period,80),clean(b.received_by,120)||ADMIN_NAME,clean(b.notes,800),nowIso());const id=Number(info.lastInsertRowid);audit('CREATE','payment',id,{sid,amount,payer,receipt,receivedBy:clean(b.received_by,120)||ADMIN_NAME},ADMIN_NAME);afterMutation();res.status(201).json({ok:true,payment:one('SELECT * FROM payments WHERE id=?',id)});});
app.delete('/api/payments/:id',authRequired,(req,res)=>{const id=Number(req.params.id),p=one('SELECT * FROM payments WHERE id=?',id);if(!p)return res.status(404).json({ok:false,message:'Payment not found.'});db.prepare('DELETE FROM payments WHERE id=?').run(id);audit('DELETE','payment',id,{receipt:p.receipt_no,amount:p.amount},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/tests',authRequired,(req,res)=>res.json({ok:true,tests:rows(`SELECT t.*,s.full_name student,s.student_code FROM tests t JOIN students s ON s.id=t.student_id ORDER BY t.test_date DESC,t.id DESC`)}));
app.post('/api/tests',authRequired,(req,res)=>{const b=req.body||{},sid=Number(b.student_id),max=num(b.max_marks),marks=num(b.marks_obtained),date=clean(b.test_date,20),name=clean(b.test_name,150);if(!one('SELECT id FROM students WHERE id=?',sid)||!name||!validDate(date)||max<=0||marks<0||marks>max)return res.status(400).json({ok:false,message:'Valid student, test, date and marks are required.'});const pct=Math.round((marks/max)*10000)/100;const info=db.prepare(`INSERT INTO tests(student_id,test_name,subject,test_date,max_marks,marks_obtained,percentage,grade,teacher_remarks,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(sid,name,clean(b.subject,120),date,max,marks,pct,gradeFromPercentage(pct),clean(b.teacher_remarks,800),nowIso());const id=Number(info.lastInsertRowid);audit('CREATE','test',id,{sid,name,pct},ADMIN_NAME);afterMutation();res.status(201).json({ok:true,test:one('SELECT * FROM tests WHERE id=?',id)});});
app.delete('/api/tests/:id',authRequired,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM tests WHERE id=?').run(id);audit('DELETE','test',id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/intake',authRequired,(req,res)=>res.json({ok:true,submissions:rows('SELECT * FROM intake_submissions ORDER BY submitted_at DESC')}));
app.post('/api/intake/:id/accept',authRequired,(req,res)=>{
  const x=one('SELECT * FROM intake_submissions WHERE id=?',req.params.id);if(!x)return res.status(404).json({ok:false,message:'Submission not found.'});if(x.status==='Accepted'&&x.accepted_student_id)return res.json({ok:true,student:one('SELECT * FROM students WHERE id=?',x.accepted_student_id)});
  const t=nowIso();const info=db.prepare(`INSERT INTO students(full_name,dob,gender,school,board,grade,joining_date,phone,email,address,parent_name,parent_phone,parent_email,subjects,fee_plan_amount,status,notes,intake_submission_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(x.student_name,x.dob,x.gender,x.school,x.board,x.grade,t.slice(0,10),x.student_phone,x.student_email,x.address,x.parent_name,x.parent_phone,x.parent_email,x.subjects,0,'Active',x.notes,x.id,t,t);const sid=Number(info.lastInsertRowid);db.prepare('UPDATE students SET student_code=? WHERE id=?').run(studentCode(sid),sid);db.prepare(`UPDATE intake_submissions SET status='Accepted',accepted_student_id=? WHERE id=?`).run(sid,x.id);audit('ACCEPT','intake_submission',x.id,{studentId:sid},ADMIN_NAME);afterMutation();const student=one('SELECT * FROM students WHERE id=?',sid);parentPortalBridge.notifyAdmissionAccepted(student).catch(err=>console.error('Parent portal hook failed:',err));res.json({ok:true,student});
});
app.post('/api/intake/:id/reject',authRequired,(req,res)=>{if(!one('SELECT id FROM intake_submissions WHERE id=?',req.params.id))return res.status(404).json({ok:false,message:'Submission not found.'});db.prepare(`UPDATE intake_submissions SET status='Rejected' WHERE id=?`).run(req.params.id);audit('REJECT','intake_submission',req.params.id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

// Compatibility endpoint for the earlier Windows manager.
app.get('/api/admin/submissions',syncKeyRequired,(req,res)=>{
  const submissions=rows(`SELECT * FROM intake_submissions ORDER BY submitted_at DESC`).map(x=>({id:x.id,submittedAt:x.submitted_at,status:x.status,data:{studentName:x.student_name,dob:x.dob,gender:x.gender,grade:x.grade,school:x.school,board:x.board,studentPhone:x.student_phone,studentEmail:x.student_email,parentName:x.parent_name,parentPhone:x.parent_phone,parentEmail:x.parent_email,subjects:String(x.subjects||'').split(',').map(s=>s.trim()).filter(Boolean),preferredMode:x.preferred_mode,address:x.address,notes:x.notes}}));
  res.json({ok:true,submissions});
});

app.get('/api/settings',authRequired,(req,res)=>{const obj={};for(const r of rows('SELECT key,value FROM settings'))obj[r.key]=r.value;res.json({ok:true,settings:obj});});
app.put('/api/settings',authRequired,(req,res)=>{const allowed=['academy_name','currency','background_image_url','academic_year'];const stmt=db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`);for(const k of allowed){if(Object.prototype.hasOwnProperty.call(req.body||{},k))stmt.run(k,clean(req.body[k],1000),nowIso());}audit('UPDATE','settings','global',req.body,ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/excel/status',authRequired,(req,res)=>{let stat=null;try{stat=fs.statSync(EXCEL_PATH);}catch{}res.json({ok:true,path:EXCEL_PATH,exists:!!stat,size:stat?.size||0,updatedAt:stat?.mtime?.toISOString()||null});});
app.post('/api/excel/rebuild',authRequired,(req,res)=>{try{rebuildWorkbook();audit('REBUILD','excel','master',{},ADMIN_NAME);res.json({ok:true});}catch(e){console.error(e);res.status(500).json({ok:false,message:'Could not rebuild Excel workbook.'});}});
app.get('/api/export/xlsx',authRequired,(req,res)=>{try{rebuildWorkbook();res.download(EXCEL_PATH,'Aacharya_Tuition_Master.xlsx');}catch(e){console.error(e);res.status(500).json({ok:false,message:'Could not create Excel workbook.'});}});

app.use('/api', (req,res)=>res.status(404).json({ok:false,message:'API endpoint not found.'}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,message:'Server error. Check Render logs.'});});

initDb();
try { rebuildWorkbook(); } catch (err) { console.error('Initial Excel build failed:', err); }

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aacharya Tuition Manager running on port ${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Master Excel: ${EXCEL_PATH}`);
    if (NODE_ENV === 'production' && ADMIN_PASSWORD === 'ChangeMe123!') console.warn('WARNING: Set ADMIN_PASSWORD in Render Environment.');
  });
}

module.exports = { app, db, rebuildWorkbook, EXCEL_PATH, DATA_DIR };
