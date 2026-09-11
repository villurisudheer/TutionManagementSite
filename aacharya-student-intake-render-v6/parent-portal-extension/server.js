'use strict';

const express = require('./lib/mini-express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROOF_DIR = path.join(DATA_DIR, 'payment-proofs');
const DB_PATH = path.join(DATA_DIR, 'parent_portal.sqlite');

const ADMIN_NAME = process.env.EXTENSION_ADMIN_NAME || 'Aacharya Sudheer';
const ADMIN_EMAIL = (process.env.EXTENSION_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.EXTENSION_ADMIN_PASSWORD || 'ChangeMe123!';
const SESSION_SECRET = process.env.EXTENSION_SESSION_SECRET || 'dev-parent-session-secret-change-me';
const MAIN_MANAGER_URL = String(process.env.MAIN_MANAGER_URL || '').trim().replace(/\/+$/, '');
const PARENT_PORTAL_SECRET = String(process.env.PARENT_PORTAL_SECRET || 'dev-parent-portal-secret-change-me').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const INVITE_DAYS = Math.max(1, Number(process.env.INVITE_VALID_DAYS || 7));
const GRACE_DAYS = Math.max(0, Number(process.env.COURSE_GRACE_DAYS || 7));
const CREDENTIAL_PURGE_DAYS = Math.max(1, Number(process.env.CREDENTIAL_PURGE_DAYS || 30));
const MAX_PROOF_BYTES = Math.max(100000, Number(process.env.MAX_PROOF_BYTES || 5 * 1024 * 1024));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PROOF_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');

function nowIso() { return new Date().toISOString(); }
function clean(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function addDays(dateStr, days) { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days)); return d.toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }
function rows(sql, ...params) { return db.prepare(sql).all(...params).map(r => ({ ...r })); }
function one(sql, ...params) { const r = db.prepare(sql).get(...params); return r ? { ...r } : null; }
function safeJson(v) { try { return JSON.stringify(v); } catch { return '{}'; } }
function safeEqual(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function baseUrl(req) { return PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`; }

const authAttempts = new Map();
function authAttemptAllowed(ip, bucket = 'login') {
  const key = `${bucket}:${ip || 'unknown'}`, now = Date.now();
  const row = authAttempts.get(key) || { start: now, count: 0 };
  if (now - row.start > 15 * 60 * 1000) { row.start = now; row.count = 0; }
  row.count += 1; authAttempts.set(key, row);
  return row.count <= 20;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const p = String(stored || '').split('$');
  if (p.length !== 3 || p[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(p[1], 'hex');
    const expected = Buffer.from(p[2], 'hex');
    const got = crypto.scryptSync(String(password), salt, expected.length);
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch { return false; }
}

function signSession(payload, hours = 12) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readSession(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSessionCookie(res, name, token, maxAge = 43200) {
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}
function clearSessionCookie(res, name) { res.setHeader('Set-Cookie', `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`); }

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      main_student_id INTEGER NOT NULL UNIQUE,
      student_code TEXT,
      full_name TEXT NOT NULL,
      grade TEXT,
      subjects TEXT,
      parent_name TEXT,
      parent_email TEXT,
      parent_phone TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      disabled_at TEXT,
      purge_after TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parent_student_links (
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_ref_id INTEGER NOT NULL REFERENCES student_refs(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'Parent / Guardian',
      created_at TEXT NOT NULL,
      PRIMARY KEY(parent_id, student_ref_id)
    );
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      student_ref_id INTEGER NOT NULL REFERENCES student_refs(id) ON DELETE CASCADE,
      parent_email TEXT,
      parent_phone TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_ref_id INTEGER NOT NULL REFERENCES student_refs(id) ON DELETE CASCADE,
      course_name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      grace_until TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Upcoming',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS renewal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_ref_id INTEGER NOT NULL REFERENCES student_refs(id) ON DELETE CASCADE,
      current_enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
      requested_course TEXT NOT NULL,
      preferred_mode TEXT,
      preferred_timings TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payment_proofs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE RESTRICT,
      student_ref_id INTEGER NOT NULL REFERENCES student_refs(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL,
      payer_name TEXT NOT NULL,
      payer_relation TEXT,
      transaction_reference TEXT,
      billing_period TEXT,
      notes TEXT,
      proof_filename TEXT NOT NULL,
      proof_mime TEXT NOT NULL,
      proof_sha256 TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT,
      official_payment_id INTEGER,
      official_receipt_no TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_ref_id INTEGER REFERENCES student_refs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      actor TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_links_parent ON parent_student_links(parent_id);
    CREATE INDEX IF NOT EXISTS idx_invites_student ON invites(student_ref_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_ref_id, end_date);
    CREATE INDEX IF NOT EXISTS idx_renewal_status ON renewal_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_proofs_status ON payment_proofs(status, created_at);
  `);
}
function audit(action, entityType, entityId, actor, details = {}) {
  db.prepare('INSERT INTO audit_log(action,entity_type,entity_id,actor,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(action, entityType, String(entityId ?? ''), clean(actor, 160), safeJson(details), nowIso());
}
function notify(parentId, studentRefId, type, title, message) {
  db.prepare('INSERT INTO notifications(parent_id,student_ref_id,type,title,message,created_at) VALUES(?,?,?,?,?,?)')
    .run(parentId, studentRefId || null, type, title, message, nowIso());
}

function parentAuth(req, res, next) {
  const s = readSession(parseCookies(req).parent_session);
  if (!s || s.kind !== 'parent' || !s.id) return res.status(401).json({ ok: false, message: 'Parent login required.' });
  const parent = one('SELECT * FROM parents WHERE id=?', Number(s.id));
  if (!parent || parent.status !== 'Active') return res.status(403).json({ ok: false, message: 'This parent portal account is not active.' });
  req.parent = parent; next();
}
function adminAuth(req, res, next) {
  const s = readSession(parseCookies(req).extension_admin_session);
  if (!s || s.kind !== 'admin' || s.email !== ADMIN_EMAIL) return res.status(401).json({ ok: false, message: 'Extension admin login required.' });
  req.admin = { name: ADMIN_NAME, email: ADMIN_EMAIL }; next();
}
function integrationAuth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!PARENT_PORTAL_SECRET || !safeEqual(token, PARENT_PORTAL_SECRET)) return res.status(401).json({ ok: false, message: 'Invalid integration secret.' });
  next();
}

async function callMain(pathname, options = {}) {
  if (!MAIN_MANAGER_URL) throw new Error('MAIN_MANAGER_URL is not configured.');
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${PARENT_PORTAL_SECRET}` };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetch(MAIN_MANAGER_URL + pathname, { ...options, headers });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok || !json) throw new Error(json?.message || `Main manager returned HTTP ${r.status}.`);
  return json;
}

function upsertStudentRef(s) {
  const mainId = Number(s.main_student_id || s.id || s.student_id);
  if (!mainId) throw new Error('Missing main student id.');
  const t = nowIso();
  db.prepare(`INSERT INTO student_refs(main_student_id,student_code,full_name,grade,subjects,parent_name,parent_email,parent_phone,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(main_student_id) DO UPDATE SET student_code=excluded.student_code,full_name=excluded.full_name,grade=excluded.grade,subjects=excluded.subjects,parent_name=excluded.parent_name,parent_email=excluded.parent_email,parent_phone=excluded.parent_phone,status=excluded.status,updated_at=excluded.updated_at`)
    .run(mainId, clean(s.student_code, 60), clean(s.full_name || s.student_name, 120) || `Student ${mainId}`, clean(s.grade, 80), clean(s.subjects, 250), clean(s.parent_name, 120), clean(s.parent_email, 180).toLowerCase(), clean(s.parent_phone, 40), clean(s.status, 30) || 'Active', t, t);
  return one('SELECT * FROM student_refs WHERE main_student_id=?', mainId);
}
function latestUsableInvite(studentRefId) {
  return one(`SELECT * FROM invites WHERE student_ref_id=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1`, studentRefId, nowIso());
}
function createInvite(studentRef, req, actor = ADMIN_NAME) {
  const token = randomToken(32); const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO invites(token_hash,student_ref_id,parent_email,parent_phone,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?,?)')
    .run(tokenHash, studentRef.id, studentRef.parent_email || '', studentRef.parent_phone || '', expires, nowIso(), actor);
  audit('CREATE', 'invite', studentRef.id, actor, { expires });
  return { token, url: `${baseUrl(req)}/signup?invite=${encodeURIComponent(token)}`, expiresAt: expires };
}
function ensureInvite(studentRef, req, actor = 'Main manager') {
  const existingLink = one('SELECT 1 x FROM parent_student_links WHERE student_ref_id=? LIMIT 1', studentRef.id);
  if (existingLink) return null;
  const existing = latestUsableInvite(studentRef.id);
  if (existing) return { token: null, url: null, expiresAt: existing.expires_at, existing: true };
  return createInvite(studentRef, req, actor);
}

function updateEnrollmentStates() {
  const d = today();
  const all = rows('SELECT * FROM enrollments');
  const upd = db.prepare('UPDATE enrollments SET status=?,updated_at=? WHERE id=?');
  for (const e of all) {
    let status = 'Upcoming';
    if (d >= e.start_date && d <= e.end_date) status = 'Active';
    else if (d > e.end_date && d <= e.grace_until) status = 'Grace';
    else if (d > e.grace_until) status = 'Ended';
    if (status !== e.status) upd.run(status, nowIso(), e.id);
  }
}
function ensureLifecycleNotifications() {
  const d = today();
  const enrollments = rows(`SELECT e.*,sr.full_name FROM enrollments e JOIN student_refs sr ON sr.id=e.student_ref_id WHERE e.status IN ('Active','Grace')`);
  for (const e of enrollments) {
    const links = rows('SELECT parent_id FROM parent_student_links WHERE student_ref_id=?', e.student_ref_id);
    const sevenBefore = addDays(e.end_date, -7);
    for (const link of links) {
      if (e.status === 'Active' && d >= sevenBefore && d <= e.end_date) {
        const key = `course-ending-${e.id}`;
        if (!one('SELECT id FROM notifications WHERE parent_id=? AND type=?', link.parent_id, key)) notify(link.parent_id, e.student_ref_id, key, 'Course ending soon', `${e.full_name}'s ${e.course_name} course ends on ${e.end_date}. You can apply for the next course now.`);
      }
      if (e.status === 'Grace') {
        const key = `grace-${e.id}`;
        if (!one('SELECT id FROM notifications WHERE parent_id=? AND type=?', link.parent_id, key)) notify(link.parent_id, e.student_ref_id, key, 'Portal access closing soon', `${e.full_name}'s course has ended. Portal access is scheduled to close after ${e.grace_until} unless a renewal is approved or pending.`);
      }
    }
  }
}
function updateParentStatuses() {
  const d = today();
  for (const p of rows('SELECT * FROM parents')) {
    if (p.status === 'Purged') continue;
    const live = Number(one(`SELECT COUNT(*) c FROM parent_student_links l JOIN enrollments e ON e.student_ref_id=l.student_ref_id WHERE l.parent_id=? AND e.status IN ('Upcoming','Active','Grace')`, p.id)?.c || 0);
    const pending = Number(one(`SELECT COUNT(*) c FROM renewal_requests WHERE parent_id=? AND status='Pending'`, p.id)?.c || 0);
    const unconfigured = Number(one(`SELECT COUNT(*) c FROM parent_student_links l WHERE l.parent_id=? AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_ref_id=l.student_ref_id)`, p.id)?.c || 0);
    if (live > 0 || pending > 0 || unconfigured > 0) {
      if (p.status !== 'Active') db.prepare(`UPDATE parents SET status='Active',disabled_at=NULL,purge_after=NULL,updated_at=? WHERE id=?`).run(nowIso(), p.id);
    } else if (p.status === 'Active') {
      const purge = addDays(d, CREDENTIAL_PURGE_DAYS);
      db.prepare(`UPDATE parents SET status='Disabled',disabled_at=?,purge_after=?,updated_at=? WHERE id=?`).run(nowIso(), purge, nowIso(), p.id);
      audit('DISABLE', 'parent', p.id, 'Lifecycle', { purgeAfter: purge });
    }
  }
}
function purgeOldCredentials() {
  const d = today();
  for (const p of rows(`SELECT * FROM parents WHERE status='Disabled' AND purge_after IS NOT NULL AND purge_after<=?`, d)) {
    const anonymizedEmail = `closed-${p.id}-${crypto.randomBytes(4).toString('hex')}@closed.invalid`;
    db.prepare(`UPDATE parents SET email=?,phone='',password_hash='',status='Purged',updated_at=? WHERE id=?`).run(anonymizedEmail, nowIso(), p.id);
    audit('PURGE_CREDENTIALS', 'parent', p.id, 'Lifecycle', {});
  }
}
function runLifecycle() { updateEnrollmentStates(); ensureLifecycleNotifications(); updateParentStatuses(); purgeOldCredentials(); }

function parseProofDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Upload a PNG, JPG, WEBP or PDF payment proof.');
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > MAX_PROOF_BYTES) throw new Error(`Payment proof must be smaller than ${Math.round(MAX_PROOF_BYTES / 1024 / 1024)} MB.`);
  const ext = m[1] === 'application/pdf' ? '.pdf' : m[1] === 'image/png' ? '.png' : m[1] === 'image/webp' ? '.webp' : '.jpg';
  return { buf, mime: m[1], ext, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
  next();
});
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '250kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'parent.html')));
app.get('/parent', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'parent.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'signup.html')));
app.get('/extension-admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'extension-admin.html')));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'Aacharya Parent Portal Extension', version: '1.0.0', mainManagerConfigured: !!MAIN_MANAGER_URL, persistentDiskExpected: DATA_DIR === '/var/data' }));

// Main-manager -> extension admission hook.
app.post('/api/integration/admission-accepted', integrationAuth, (req, res) => {
  try {
    const ref = upsertStudentRef(req.body || {});
    const invite = ensureInvite(ref, req, 'Main manager');
    res.status(201).json({ ok: true, studentRef: ref, invite });
  } catch (e) { res.status(400).json({ ok: false, message: e.message }); }
});

// Admin auth.
app.post('/api/admin/login', (req, res) => {
  if (!authAttemptAllowed(req.ip, 'admin')) return res.status(429).json({ ok: false, message: 'Too many login attempts. Try again later.' });
  const email = clean(req.body.email, 180).toLowerCase(); const password = String(req.body.password || '');
  if (!safeEqual(email, ADMIN_EMAIL) || !safeEqual(password, ADMIN_PASSWORD)) return res.status(401).json({ ok: false, message: 'Incorrect admin email or password.' });
  setSessionCookie(res, 'extension_admin_session', signSession({ kind: 'admin', email }));
  audit('LOGIN', 'admin', email, ADMIN_NAME, { ip: req.ip }); res.json({ ok: true, admin: { name: ADMIN_NAME, email: ADMIN_EMAIL } });
});
app.get('/api/admin/me', adminAuth, (req, res) => res.json({ ok: true, admin: req.admin }));
app.post('/api/admin/logout', adminAuth, (req, res) => { clearSessionCookie(res, 'extension_admin_session'); res.json({ ok: true }); });

app.get('/api/admin/dashboard', adminAuth, (req, res) => {
  runLifecycle();
  const summary = {
    activeParents: Number(one(`SELECT COUNT(*) c FROM parents WHERE status='Active'`)?.c || 0),
    pendingPayments: Number(one(`SELECT COUNT(*) c FROM payment_proofs WHERE status='Pending'`)?.c || 0),
    renewalRequests: Number(one(`SELECT COUNT(*) c FROM renewal_requests WHERE status='Pending'`)?.c || 0),
    expiringCourses: Number(one(`SELECT COUNT(*) c FROM enrollments WHERE status='Active' AND end_date BETWEEN ? AND ?`, today(), addDays(today(), 7))?.c || 0),
    graceAccounts: Number(one(`SELECT COUNT(DISTINCT l.parent_id) c FROM parent_student_links l JOIN enrollments e ON e.student_ref_id=l.student_ref_id WHERE e.status='Grace'`)?.c || 0),
    waitingInvites: Number(one(`SELECT COUNT(*) c FROM invites WHERE used_at IS NULL AND expires_at>?`, nowIso())?.c || 0)
  };
  res.json({ ok: true, summary });
});
app.get('/api/admin/student-refs', adminAuth, (req, res) => res.json({ ok: true, students: rows(`SELECT sr.*, (SELECT COUNT(*) FROM parent_student_links l WHERE l.student_ref_id=sr.id) linked_parents, (SELECT end_date FROM enrollments e WHERE e.student_ref_id=sr.id ORDER BY end_date DESC LIMIT 1) latest_end_date FROM student_refs sr ORDER BY sr.full_name`) }));
app.get('/api/admin/parents', adminAuth, (req, res) => res.json({ ok: true, parents: rows(`SELECT p.*, GROUP_CONCAT(sr.full_name, ', ') children FROM parents p LEFT JOIN parent_student_links l ON l.parent_id=p.id LEFT JOIN student_refs sr ON sr.id=l.student_ref_id GROUP BY p.id ORDER BY p.full_name`) }));
app.get('/api/admin/invites', adminAuth, (req, res) => res.json({ ok: true, invites: rows(`SELECT i.id,i.student_ref_id,i.parent_email,i.parent_phone,i.expires_at,i.used_at,i.created_at,sr.full_name student FROM invites i JOIN student_refs sr ON sr.id=i.student_ref_id ORDER BY i.id DESC`) }));
app.post('/api/admin/invites/:studentRefId/regenerate', adminAuth, (req, res) => {
  const sr = one('SELECT * FROM student_refs WHERE id=?', Number(req.params.studentRefId)); if (!sr) return res.status(404).json({ ok: false, message: 'Student reference not found.' });
  db.prepare(`UPDATE invites SET expires_at=? WHERE student_ref_id=? AND used_at IS NULL`).run(nowIso(), sr.id);
  const invite = createInvite(sr, req, ADMIN_NAME); res.status(201).json({ ok: true, invite });
});
app.post('/api/admin/sync-main', adminAuth, async (req, res) => {
  try {
    const payload = await callMain('/api/integration/parent/accepted-students');
    let added = 0; const created = [];
    for (const s of payload.students || []) {
      const before = one('SELECT id FROM student_refs WHERE main_student_id=?', Number(s.id));
      const ref = upsertStudentRef(s); if (!before) added++;
      const invite = ensureInvite(ref, req, 'Extension sync'); if (invite?.url) created.push({ student: ref.full_name, inviteUrl: invite.url, expiresAt: invite.expiresAt });
    }
    res.json({ ok: true, synced: (payload.students || []).length, added, createdInvites: created });
  } catch (e) { res.status(502).json({ ok: false, message: e.message }); }
});
app.get('/api/admin/integration-status', adminAuth, async (req, res) => {
  try { const x = await callMain('/api/integration/parent/health'); res.json({ ok: true, main: x }); }
  catch (e) { res.status(502).json({ ok: false, message: e.message }); }
});

app.get('/api/admin/enrollments', adminAuth, (req, res) => { runLifecycle(); res.json({ ok: true, enrollments: rows(`SELECT e.*,sr.full_name student,sr.main_student_id FROM enrollments e JOIN student_refs sr ON sr.id=e.student_ref_id ORDER BY e.end_date DESC,e.id DESC`) }); });
app.post('/api/admin/enrollments', adminAuth, (req, res) => {
  const sid = Number(req.body.student_ref_id), course = clean(req.body.course_name, 160), start = clean(req.body.start_date, 20), end = clean(req.body.end_date, 20);
  if (!one('SELECT id FROM student_refs WHERE id=?', sid) || !course || !validDate(start) || !validDate(end) || end < start) return res.status(400).json({ ok: false, message: 'Student, course and valid start/end dates are required.' });
  const t = nowIso(), grace = addDays(end, GRACE_DAYS);
  const info = db.prepare(`INSERT INTO enrollments(student_ref_id,course_name,start_date,end_date,grace_until,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(sid, course, start, end, grace, 'Upcoming', clean(req.body.notes, 800), t, t);
  runLifecycle(); audit('CREATE', 'enrollment', info.lastInsertRowid, ADMIN_NAME, { sid, course, start, end, grace }); res.status(201).json({ ok: true, enrollment: one('SELECT * FROM enrollments WHERE id=?', Number(info.lastInsertRowid)) });
});
app.put('/api/admin/enrollments/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id), old = one('SELECT * FROM enrollments WHERE id=?', id); if (!old) return res.status(404).json({ ok: false, message: 'Enrollment not found.' });
  const course = clean(req.body.course_name, 160) || old.course_name, start = clean(req.body.start_date, 20) || old.start_date, end = clean(req.body.end_date, 20) || old.end_date;
  if (!validDate(start) || !validDate(end) || end < start) return res.status(400).json({ ok: false, message: 'Invalid enrollment dates.' });
  db.prepare(`UPDATE enrollments SET course_name=?,start_date=?,end_date=?,grace_until=?,notes=?,updated_at=? WHERE id=?`).run(course, start, end, addDays(end, GRACE_DAYS), clean(req.body.notes, 800), nowIso(), id);
  runLifecycle(); audit('UPDATE', 'enrollment', id, ADMIN_NAME, { course, start, end }); res.json({ ok: true, enrollment: one('SELECT * FROM enrollments WHERE id=?', id) });
});

app.get('/api/admin/renewals', adminAuth, (req, res) => res.json({ ok: true, renewals: rows(`SELECT r.*,sr.full_name student,p.full_name parent_name,p.email parent_email,e.course_name current_course,e.end_date current_end FROM renewal_requests r JOIN student_refs sr ON sr.id=r.student_ref_id JOIN parents p ON p.id=r.parent_id LEFT JOIN enrollments e ON e.id=r.current_enrollment_id ORDER BY CASE r.status WHEN 'Pending' THEN 0 ELSE 1 END,r.created_at DESC`) }));
app.post('/api/admin/renewals/:id/approve', adminAuth, (req, res) => {
  const r = one('SELECT * FROM renewal_requests WHERE id=?', Number(req.params.id)); if (!r) return res.status(404).json({ ok: false, message: 'Renewal request not found.' }); if (r.status !== 'Pending') return res.status(409).json({ ok: false, message: 'Renewal request already processed.' });
  const course = clean(req.body.course_name, 160) || r.requested_course, start = clean(req.body.start_date, 20), end = clean(req.body.end_date, 20);
  if (!validDate(start) || !validDate(end) || end < start) return res.status(400).json({ ok: false, message: 'Enter valid new course dates.' });
  const t = nowIso(); const info = db.prepare(`INSERT INTO enrollments(student_ref_id,course_name,start_date,end_date,grace_until,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(r.student_ref_id, course, start, end, addDays(end, GRACE_DAYS), 'Upcoming', clean(req.body.admin_note, 800), t, t);
  db.prepare(`UPDATE renewal_requests SET status='Approved',admin_note=?,updated_at=? WHERE id=?`).run(clean(req.body.admin_note, 800), t, r.id);
  runLifecycle(); notify(r.parent_id, r.student_ref_id, 'renewal-approved', 'Renewal approved', `Your requested course has been approved: ${course}.`); audit('APPROVE', 'renewal', r.id, ADMIN_NAME, { enrollmentId: Number(info.lastInsertRowid) });
  res.json({ ok: true });
});
app.post('/api/admin/renewals/:id/reject', adminAuth, (req, res) => {
  const r = one('SELECT * FROM renewal_requests WHERE id=?', Number(req.params.id)); if (!r) return res.status(404).json({ ok: false, message: 'Renewal request not found.' });
  db.prepare(`UPDATE renewal_requests SET status='Rejected',admin_note=?,updated_at=? WHERE id=?`).run(clean(req.body.admin_note, 800), nowIso(), r.id);
  notify(r.parent_id, r.student_ref_id, 'renewal-rejected', 'Renewal request update', clean(req.body.admin_note, 500) || 'The renewal request was not approved. Please contact the academy for details.'); runLifecycle(); audit('REJECT', 'renewal', r.id, ADMIN_NAME, {}); res.json({ ok: true });
});

app.get('/api/admin/payment-proofs', adminAuth, (req, res) => res.json({ ok: true, proofs: rows(`SELECT pp.*,sr.full_name student,p.full_name parent_name,p.email parent_email FROM payment_proofs pp JOIN student_refs sr ON sr.id=pp.student_ref_id JOIN parents p ON p.id=pp.parent_id ORDER BY CASE pp.status WHEN 'Pending' THEN 0 WHEN 'Needs New Proof' THEN 1 ELSE 2 END,pp.created_at DESC`) }));
app.get('/api/admin/payment-proofs/:id/file', adminAuth, (req, res) => {
  const p = one('SELECT * FROM payment_proofs WHERE id=?', Number(req.params.id)); if (!p) return res.status(404).send('Not Found'); res.sendFile(path.join(PROOF_DIR, p.proof_filename));
});
app.post('/api/admin/payment-proofs/:id/approve', adminAuth, async (req, res) => {
  const p = one(`SELECT pp.*,sr.main_student_id,sr.full_name student FROM payment_proofs pp JOIN student_refs sr ON sr.id=pp.student_ref_id WHERE pp.id=?`, Number(req.params.id)); if (!p) return res.status(404).json({ ok: false, message: 'Payment proof not found.' }); if (p.status === 'Verified') return res.json({ ok: true, message: 'Already verified.', paymentId: p.official_payment_id, receipt: p.official_receipt_no });
  try {
    const result = await callMain('/api/integration/parent/payments', { method: 'POST', body: JSON.stringify({ student_id: p.main_student_id, amount: p.amount, payment_date: p.payment_date, method: p.method, payer_name: p.payer_name, payer_relation: p.payer_relation, transaction_reference: p.transaction_reference, billing_period: p.billing_period, received_by: ADMIN_NAME, notes: `${p.notes || ''}\nVerified from Parent Portal payment proof #${p.id}`.trim(), parent_proof_id: String(p.id) }) });
    const official = result.payment || {};
    db.prepare(`UPDATE payment_proofs SET status='Verified',admin_note=?,official_payment_id=?,official_receipt_no=?,updated_at=? WHERE id=?`).run(clean(req.body.admin_note, 800), official.id || null, official.receipt_no || '', nowIso(), p.id);
    notify(p.parent_id, p.student_ref_id, 'payment-verified', 'Payment verified', `Your payment proof for ₹${Number(p.amount).toLocaleString('en-IN')} has been verified${official.receipt_no ? ` (Receipt ${official.receipt_no})` : ''}.`);
    audit('APPROVE', 'payment_proof', p.id, ADMIN_NAME, { officialPaymentId: official.id, receipt: official.receipt_no }); res.json({ ok: true, payment: official });
  } catch (e) { res.status(502).json({ ok: false, message: `Could not create payment in main manager: ${e.message}` }); }
});
app.post('/api/admin/payment-proofs/:id/reject', adminAuth, (req, res) => {
  const p = one('SELECT * FROM payment_proofs WHERE id=?', Number(req.params.id)); if (!p) return res.status(404).json({ ok: false, message: 'Payment proof not found.' });
  const status = req.body.needs_new_proof ? 'Needs New Proof' : 'Rejected', note = clean(req.body.admin_note, 800) || (status === 'Needs New Proof' ? 'Please upload a clearer payment proof.' : 'Payment proof could not be verified.');
  db.prepare(`UPDATE payment_proofs SET status=?,admin_note=?,updated_at=? WHERE id=?`).run(status, note, nowIso(), p.id); notify(p.parent_id, p.student_ref_id, 'payment-update', 'Payment proof update', note); audit('REJECT', 'payment_proof', p.id, ADMIN_NAME, { status }); res.json({ ok: true });
});

// Invitation lookup + parent signup.
app.get('/api/invite/:token', (req, res) => {
  const i = one(`SELECT i.*,sr.full_name student,sr.grade,sr.subjects FROM invites i JOIN student_refs sr ON sr.id=i.student_ref_id WHERE i.token_hash=?`, hashToken(req.params.token));
  if (!i || i.used_at || i.expires_at <= nowIso()) return res.status(404).json({ ok: false, message: 'Invitation is invalid, expired or already used.' });
  res.json({ ok: true, invite: { student: i.student, grade: i.grade, subjects: i.subjects, parentEmail: i.parent_email, parentPhone: i.parent_phone, expiresAt: i.expires_at } });
});
app.post('/api/parent/signup', (req, res) => {
  const token = clean(req.body.invite, 200), invite = one('SELECT * FROM invites WHERE token_hash=?', hashToken(token));
  if (!invite || invite.used_at || invite.expires_at <= nowIso()) return res.status(400).json({ ok: false, message: 'Invitation is invalid, expired or already used.' });
  const name = clean(req.body.full_name, 120), email = clean(req.body.email, 180).toLowerCase(), phone = clean(req.body.phone, 40), password = String(req.body.password || '');
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ ok: false, message: 'Enter a valid name/email and a password of at least 8 characters.' });
  let parent = one('SELECT * FROM parents WHERE email=?', email);
  if (parent) return res.status(409).json({ ok: false, message: 'An account already exists for this email. Sign in, then use the invitation to link this child.' });
  const t = nowIso(), info = db.prepare(`INSERT INTO parents(full_name,email,phone,password_hash,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).run(name, email, phone, hashPassword(password), 'Active', t, t);
  const pid = Number(info.lastInsertRowid); db.prepare(`INSERT OR IGNORE INTO parent_student_links(parent_id,student_ref_id,relationship,created_at) VALUES(?,?,?,?)`).run(pid, invite.student_ref_id, clean(req.body.relationship, 60) || 'Parent / Guardian', t); db.prepare('UPDATE invites SET used_at=? WHERE id=?').run(t, invite.id);
  setSessionCookie(res, 'parent_session', signSession({ kind: 'parent', id: pid }, 24 * 7)); audit('SIGNUP', 'parent', pid, name, { studentRefId: invite.student_ref_id }); runLifecycle(); res.status(201).json({ ok: true });
});

app.post('/api/parent/login', (req, res) => {
  if (!authAttemptAllowed(req.ip, 'parent')) return res.status(429).json({ ok: false, message: 'Too many login attempts. Try again later.' });
  runLifecycle(); const email = clean(req.body.email, 180).toLowerCase(), p = one('SELECT * FROM parents WHERE email=?', email);
  if (!p || !verifyPassword(String(req.body.password || ''), p.password_hash)) return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
  if (p.status !== 'Active') return res.status(403).json({ ok: false, message: 'This parent portal account is closed. Contact the academy if you want to re-enroll.' });
  db.prepare('UPDATE parents SET last_login_at=?,updated_at=? WHERE id=?').run(nowIso(), nowIso(), p.id); setSessionCookie(res, 'parent_session', signSession({ kind: 'parent', id: p.id }, 24 * 7)); audit('LOGIN', 'parent', p.id, p.full_name, { ip: req.ip }); res.json({ ok: true });
});
app.post('/api/parent/logout', parentAuth, (req, res) => { clearSessionCookie(res, 'parent_session'); res.json({ ok: true }); });
app.get('/api/parent/me', parentAuth, (req, res) => res.json({ ok: true, parent: { id: req.parent.id, full_name: req.parent.full_name, email: req.parent.email, phone: req.parent.phone } }));
app.post('/api/parent/change-password', parentAuth, (req, res) => {
  if (!verifyPassword(String(req.body.current_password || ''), req.parent.password_hash)) return res.status(400).json({ ok: false, message: 'Current password is incorrect.' });
  const np = String(req.body.new_password || ''); if (np.length < 8) return res.status(400).json({ ok: false, message: 'New password must be at least 8 characters.' });
  db.prepare('UPDATE parents SET password_hash=?,updated_at=? WHERE id=?').run(hashPassword(np), nowIso(), req.parent.id); audit('CHANGE_PASSWORD', 'parent', req.parent.id, req.parent.full_name, {}); res.json({ ok: true });
});
app.post('/api/parent/link-invite', parentAuth, (req, res) => {
  const invite = one('SELECT * FROM invites WHERE token_hash=?', hashToken(clean(req.body.invite, 200))); if (!invite || invite.used_at || invite.expires_at <= nowIso()) return res.status(400).json({ ok: false, message: 'Invitation is invalid, expired or already used.' });
  db.prepare(`INSERT OR IGNORE INTO parent_student_links(parent_id,student_ref_id,relationship,created_at) VALUES(?,?,?,?)`).run(req.parent.id, invite.student_ref_id, clean(req.body.relationship, 60) || 'Parent / Guardian', nowIso()); db.prepare('UPDATE invites SET used_at=? WHERE id=?').run(nowIso(), invite.id); audit('LINK_CHILD', 'parent', req.parent.id, req.parent.full_name, { studentRefId: invite.student_ref_id }); res.json({ ok: true });
});

app.get('/api/parent/dashboard', parentAuth, async (req, res) => {
  runLifecycle();
  const links = rows(`SELECT sr.*,l.relationship FROM parent_student_links l JOIN student_refs sr ON sr.id=l.student_ref_id WHERE l.parent_id=? ORDER BY sr.full_name`, req.parent.id);
  const children = [];
  for (const sr of links) {
    let live = null, integrationError = '';
    try { live = await callMain(`/api/integration/parent/students/${sr.main_student_id}/summary`); } catch (e) { integrationError = e.message; }
    const enrollments = rows('SELECT * FROM enrollments WHERE student_ref_id=? ORDER BY end_date DESC', sr.id);
    const pendingRenewal = one(`SELECT * FROM renewal_requests WHERE parent_id=? AND student_ref_id=? AND status='Pending' ORDER BY id DESC LIMIT 1`, req.parent.id, sr.id);
    children.push({ ref: sr, live: live?.student ? live : null, integrationError, enrollments, pendingRenewal });
  }
  const notifications = rows('SELECT * FROM notifications WHERE parent_id=? ORDER BY created_at DESC LIMIT 20', req.parent.id);
  const proofs = rows(`SELECT pp.*,sr.full_name student FROM payment_proofs pp JOIN student_refs sr ON sr.id=pp.student_ref_id WHERE pp.parent_id=? ORDER BY pp.created_at DESC`, req.parent.id);
  res.json({ ok: true, parent: { full_name: req.parent.full_name, email: req.parent.email }, children, notifications, paymentProofs: proofs });
});
app.post('/api/parent/renewals', parentAuth, (req, res) => {
  const srid = Number(req.body.student_ref_id); if (!one(`SELECT 1 x FROM parent_student_links WHERE parent_id=? AND student_ref_id=?`, req.parent.id, srid)) return res.status(403).json({ ok: false, message: 'This student is not linked to your account.' });
  const requested = clean(req.body.requested_course, 160); if (!requested) return res.status(400).json({ ok: false, message: 'Enter the course you are interested in.' });
  if (one(`SELECT id FROM renewal_requests WHERE parent_id=? AND student_ref_id=? AND status='Pending'`, req.parent.id, srid)) return res.status(409).json({ ok: false, message: 'A renewal request is already pending.' });
  const current = one(`SELECT * FROM enrollments WHERE student_ref_id=? ORDER BY end_date DESC LIMIT 1`, srid); const t = nowIso(); const info = db.prepare(`INSERT INTO renewal_requests(parent_id,student_ref_id,current_enrollment_id,requested_course,preferred_mode,preferred_timings,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(req.parent.id, srid, current?.id || null, requested, clean(req.body.preferred_mode, 40), clean(req.body.preferred_timings, 120), clean(req.body.notes, 800), 'Pending', t, t); audit('CREATE', 'renewal', info.lastInsertRowid, req.parent.full_name, { requested }); res.status(201).json({ ok: true });
});
app.post('/api/parent/payment-proofs', parentAuth, (req, res) => {
  try {
    const srid = Number(req.body.student_ref_id); if (!one(`SELECT 1 x FROM parent_student_links WHERE parent_id=? AND student_ref_id=?`, req.parent.id, srid)) return res.status(403).json({ ok: false, message: 'This student is not linked to your account.' });
    const amount = num(req.body.amount), date = clean(req.body.payment_date, 20), method = clean(req.body.method, 50), payer = clean(req.body.payer_name, 120), reference = clean(req.body.transaction_reference, 160);
    if (amount <= 0 || !validDate(date) || !method || !payer) return res.status(400).json({ ok: false, message: 'Amount, payment date, method and payer name are required.' });
    const parsed = parseProofDataUrl(req.body.proof_data_url);
    const duplicate = one(`SELECT id,status FROM payment_proofs WHERE student_ref_id=? AND amount=? AND payment_date=? AND ((transaction_reference<>'' AND transaction_reference=?) OR proof_sha256=?) LIMIT 1`, srid, amount, date, reference, parsed.sha256);
    if (duplicate) return res.status(409).json({ ok: false, message: `This payment appears to have already been submitted (Proof #${duplicate.id}, ${duplicate.status}).` });
    const filename = `PP_${Date.now()}_${crypto.randomBytes(5).toString('hex')}${parsed.ext}`; fs.writeFileSync(path.join(PROOF_DIR, filename), parsed.buf, { flag: 'wx' }); const t = nowIso();
    const info = db.prepare(`INSERT INTO payment_proofs(parent_id,student_ref_id,amount,payment_date,method,payer_name,payer_relation,transaction_reference,billing_period,notes,proof_filename,proof_mime,proof_sha256,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.parent.id, srid, amount, date, method, payer, clean(req.body.payer_relation, 60), reference, clean(req.body.billing_period, 100), clean(req.body.notes, 800), filename, parsed.mime, parsed.sha256, 'Pending', t, t);
    audit('CREATE', 'payment_proof', info.lastInsertRowid, req.parent.full_name, { amount, date, method, reference }); res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), status: 'Pending' });
  } catch (e) { res.status(400).json({ ok: false, message: e.message }); }
});
app.get('/api/parent/payment-proofs/:id/file', parentAuth, (req, res) => {
  const p = one('SELECT * FROM payment_proofs WHERE id=? AND parent_id=?', Number(req.params.id), req.parent.id); if (!p) return res.status(404).send('Not Found'); res.sendFile(path.join(PROOF_DIR, p.proof_filename));
});
app.post('/api/parent/payment-proofs/:id/resubmit', parentAuth, (req, res) => {
  try {
    const p = one('SELECT * FROM payment_proofs WHERE id=? AND parent_id=?', Number(req.params.id), req.parent.id); if (!p) return res.status(404).json({ ok: false, message: 'Payment proof not found.' }); if (p.status !== 'Needs New Proof' && p.status !== 'Rejected') return res.status(409).json({ ok: false, message: 'This proof is not awaiting replacement.' });
    const parsed = parseProofDataUrl(req.body.proof_data_url); const filename = `PP_${Date.now()}_${crypto.randomBytes(5).toString('hex')}${parsed.ext}`; fs.writeFileSync(path.join(PROOF_DIR, filename), parsed.buf, { flag: 'wx' });
    try { fs.unlinkSync(path.join(PROOF_DIR, p.proof_filename)); } catch {}
    db.prepare(`UPDATE payment_proofs SET proof_filename=?,proof_mime=?,proof_sha256=?,status='Pending',admin_note='',updated_at=? WHERE id=?`).run(filename, parsed.mime, parsed.sha256, nowIso(), p.id); audit('RESUBMIT', 'payment_proof', p.id, req.parent.full_name, {}); res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, message: e.message }); }
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, message: 'API endpoint not found.' }));
app.use((err, req, res, next) => { console.error(err); if (!res.writableEnded) res.status(500).json({ ok: false, message: 'Server error. Check Render logs.' }); });

initDb(); runLifecycle();
const lifecycleTimer = setInterval(() => { try { runLifecycle(); } catch (e) { console.error('Lifecycle check failed:', e); } }, 60 * 60 * 1000);
lifecycleTimer.unref?.();

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aacharya Parent Portal Extension running on port ${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Main manager: ${MAIN_MANAGER_URL || '(not configured)'}`);
    if (NODE_ENV === 'production' && ADMIN_PASSWORD === 'ChangeMe123!') console.warn('WARNING: Set EXTENSION_ADMIN_PASSWORD in Render Environment.');
  });
}

module.exports = { app, db, runLifecycle, DATA_DIR, PROOF_DIR };
