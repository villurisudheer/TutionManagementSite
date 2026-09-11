'use strict';

// Aacharya Tuition Manager V6 integrated parent portal.
// This module deliberately ADDS tables/routes to the existing V5.3 database and server.
// It does not replace the V5.3 student/class/attendance/fee/payment/test tables.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createIntegratedParentPortal(opts) {
  const {
    app, db, authRequired, adminName, nodeEnv, dataDir, publicDir,
    afterMutation, nextReceipt, audit, clean, num, validDate, nowIso,
    rows, one, appendReport
  } = opts;

  const INVITE_DAYS = Math.max(1, Number(process.env.INVITE_VALID_DAYS || 7));
  const GRACE_DAYS = Math.max(0, Number(process.env.COURSE_GRACE_DAYS || 7));
  const CREDENTIAL_PURGE_DAYS = Math.max(1, Number(process.env.CREDENTIAL_PURGE_DAYS || 30));
  const MAX_PROOF_BYTES = Math.max(100000, Number(process.env.MAX_PROOF_BYTES || 5 * 1024 * 1024));
  const PARENT_SESSION_SECRET = process.env.PARENT_SESSION_SECRET || `${process.env.SESSION_SECRET || 'development-session-secret-change-me'}::parent-v6`;
  const PROOF_DIR = path.join(dataDir, 'payment-proofs-v6');
  fs.mkdirSync(PROOF_DIR, { recursive: true });

  const cleanLocal = (v, max = 500) => clean ? clean(v, max) : String(v ?? '').trim().slice(0, max);
  const now = () => nowIso ? nowIso() : new Date().toISOString();
  const validDateLocal = v => validDate ? validDate(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const numLocal = (v, fallback = 0) => num ? num(v, fallback) : (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const safeJson = v => { try { return JSON.stringify(v); } catch { return '{}'; } };
  const safeEqual = (a, b) => {
    const x = Buffer.from(String(a ?? ''));
    const y = Buffer.from(String(b ?? ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(days));
    return d.toISOString().slice(0, 10);
  };
  const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
  const hashToken = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const baseUrl = req => `${req.headers['x-forwarded-proto'] || (nodeEnv === 'production' ? 'https' : 'http')}://${req.headers.host}`;

  function initDb() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS parent_accounts (
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
        parent_id INTEGER NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        relationship TEXT NOT NULL DEFAULT 'Parent / Guardian',
        created_at TEXT NOT NULL,
        PRIMARY KEY(parent_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS parent_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        parent_email TEXT,
        parent_phone TEXT,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        course_name TEXT NOT NULL,
        subjects TEXT,
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
        parent_id INTEGER NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        current_enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
        requested_course TEXT NOT NULL,
        subjects TEXT,
        preferred_mode TEXT,
        preferred_timings TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        admin_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS parent_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS parent_payment_proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL REFERENCES parent_accounts(id) ON DELETE RESTRICT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
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
        proof_version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'Pending',
        admin_note TEXT,
        official_payment_id INTEGER,
        official_receipt_no TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_proof_file_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_proof_id INTEGER NOT NULL REFERENCES parent_payment_proofs(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        proof_filename TEXT NOT NULL,
        proof_mime TEXT NOT NULL,
        proof_sha256 TEXT NOT NULL,
        archived_reason TEXT,
        archived_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_current_meta (
        payment_id INTEGER PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
        current_version INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'Admin Entry',
        parent_proof_id INTEGER REFERENCES parent_payment_proofs(id) ON DELETE SET NULL,
        edited_after_verification INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER NOT NULL,
        version INTEGER NOT NULL,
        student_id INTEGER,
        fee_id INTEGER,
        receipt_no TEXT,
        payer_name TEXT,
        payer_relation TEXT,
        amount REAL,
        payment_date TEXT,
        method TEXT,
        transaction_reference TEXT,
        billing_period TEXT,
        received_by TEXT,
        notes TEXT,
        source TEXT,
        parent_proof_id INTEGER,
        change_reason TEXT NOT NULL,
        edited_by TEXT NOT NULL,
        archived_at TEXT NOT NULL,
        replacement_version INTEGER,
        history_status TEXT NOT NULL DEFAULT 'Superseded'
      );
      CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON parent_student_links(parent_id);
      CREATE INDEX IF NOT EXISTS idx_parent_links_student ON parent_student_links(student_id);
      CREATE INDEX IF NOT EXISTS idx_parent_invites_student ON parent_invites(student_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id, end_date);
      CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status, end_date);
      CREATE INDEX IF NOT EXISTS idx_renewal_status ON renewal_requests(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_parent_proofs_status ON parent_payment_proofs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_payment_history_payment ON payment_history(payment_id, version);
    `);

    // Existing V5.3 payment rows are preserved exactly; this metadata table is additive.
    db.prepare(`INSERT OR IGNORE INTO payment_current_meta(payment_id,current_version,source,parent_proof_id,edited_after_verification,updated_at)
      SELECT id,1,'Legacy / V5.3',NULL,0,? FROM payments`).run(now());
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
  function signParentSession(payload, hours = 24 * 7) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', PARENT_SESSION_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
  }
  function readParentSession(token) {
    try {
      const [body, sig] = String(token || '').split('.');
      if (!body || !sig) return null;
      const expected = crypto.createHmac('sha256', PARENT_SESSION_SECRET).update(body).digest('base64url');
      if (!safeEqual(sig, expected)) return null;
      const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return data.exp > Date.now() ? data : null;
    } catch { return null; }
  }
  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  function setParentCookie(res, token, maxAge = 604800) {
    const secure = nodeEnv === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `atm_parent_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
  }
  function clearParentCookie(res) {
    const secure = nodeEnv === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `atm_parent_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  }
  function parentAuth(req, res, next) {
    runLifecycle();
    const s = readParentSession(parseCookies(req).atm_parent_session);
    if (!s || s.kind !== 'parent' || !s.id) return res.status(401).json({ ok: false, message: 'Parent login required.' });
    const parent = one('SELECT * FROM parent_accounts WHERE id=?', Number(s.id));
    if (!parent || parent.status !== 'Active') return res.status(403).json({ ok: false, message: 'This parent portal account is not active. Contact the academy for re-enrollment or access help.' });
    req.parent = parent;
    next();
  }

  const authAttempts = new Map();
  function authAllowed(ip) {
    const key = String(ip || 'unknown'), t = Date.now();
    const r = authAttempts.get(key) || { start: t, count: 0 };
    if (t - r.start > 15 * 60 * 1000) { r.start = t; r.count = 0; }
    r.count += 1; authAttempts.set(key, r);
    return r.count <= 20;
  }

  function notify(parentId, studentId, type, title, message) {
    db.prepare('INSERT INTO parent_notifications(parent_id,student_id,type,title,message,created_at) VALUES(?,?,?,?,?,?)')
      .run(parentId, studentId || null, type, title, message, now());
  }

  function createInvite(student, req, actor = adminName) {
    const token = randomToken(32);
    const expires = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
    db.prepare('INSERT INTO parent_invites(token_hash,student_id,parent_email,parent_phone,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?,?)')
      .run(hashToken(token), student.id, cleanLocal(student.parent_email, 180).toLowerCase(), cleanLocal(student.parent_phone, 40), expires, now(), actor);
    audit('CREATE', 'parent_invite', student.id, { expiresAt: expires }, actor);
    return { token, url: `${baseUrl(req)}/parent/signup?invite=${encodeURIComponent(token)}`, expiresAt: expires };
  }
  function ensureInviteForStudent(student, req, actor = adminName) {
    if (!student?.id) return null;
    const linked = one('SELECT 1 x FROM parent_student_links WHERE student_id=? LIMIT 1', student.id);
    if (linked) return null;
    const existing = one('SELECT * FROM parent_invites WHERE student_id=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1', student.id, now());
    if (existing) return { existing: true, expiresAt: existing.expires_at };
    return createInvite(student, req, actor);
  }

  function updateEnrollmentStates() {
    const d = today();
    const upd = db.prepare('UPDATE enrollments SET status=?,updated_at=? WHERE id=?');
    for (const e of rows('SELECT * FROM enrollments')) {
      let status = 'Upcoming';
      if (d >= e.start_date && d <= e.end_date) status = 'Active';
      else if (d > e.end_date && d <= e.grace_until) status = 'Grace';
      else if (d > e.grace_until) status = 'Ended';
      if (status !== e.status) upd.run(status, now(), e.id);
    }
  }
  function ensureLifecycleNotifications() {
    const d = today();
    const active = rows(`SELECT e.*,s.full_name FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.status IN ('Active','Grace')`);
    for (const e of active) {
      const links = rows('SELECT parent_id FROM parent_student_links WHERE student_id=?', e.student_id);
      for (const link of links) {
        if (e.status === 'Active' && d >= addDays(e.end_date, -7) && d <= e.end_date) {
          const type = `course-ending-${e.id}`;
          if (!one('SELECT id FROM parent_notifications WHERE parent_id=? AND type=?', link.parent_id, type))
            notify(link.parent_id, e.student_id, type, 'Course ending soon', `${e.full_name}'s ${e.course_name} course ends on ${e.end_date}. You can apply for the next course now.`);
        }
        if (e.status === 'Grace') {
          const type = `course-grace-${e.id}`;
          if (!one('SELECT id FROM parent_notifications WHERE parent_id=? AND type=?', link.parent_id, type))
            notify(link.parent_id, e.student_id, type, 'Portal access closing soon', `${e.full_name}'s course has ended. Access is scheduled to close after ${e.grace_until} unless a renewal is pending or another enrollment is active/upcoming.`);
        }
      }
    }
  }
  function isAlumni(studentId) {
    const total = Number(one('SELECT COUNT(*) c FROM enrollments WHERE student_id=?', studentId)?.c || 0);
    if (!total) return false; // legacy/current V5.3 students are never auto-archived merely because dates are unconfigured.
    const live = Number(one(`SELECT COUNT(*) c FROM enrollments WHERE student_id=? AND status IN ('Upcoming','Active','Grace')`, studentId)?.c || 0);
    return live === 0;
  }
  function updateParentStatuses() {
    const d = today();
    for (const p of rows(`SELECT * FROM parent_accounts WHERE status!='Purged'`)) {
      const linked = rows('SELECT student_id FROM parent_student_links WHERE parent_id=?', p.id);
      const pending = Number(one(`SELECT COUNT(*) c FROM renewal_requests WHERE parent_id=? AND status='Pending'`, p.id)?.c || 0);
      const shouldStay = linked.length === 0 || linked.some(x => !isAlumni(x.student_id)) || pending > 0;
      if (shouldStay && p.status !== 'Active') {
        db.prepare(`UPDATE parent_accounts SET status='Active',disabled_at=NULL,purge_after=NULL,updated_at=? WHERE id=?`).run(now(), p.id);
      } else if (!shouldStay && p.status === 'Active') {
        db.prepare(`UPDATE parent_accounts SET status='Disabled',disabled_at=?,purge_after=?,updated_at=? WHERE id=?`)
          .run(now(), addDays(d, CREDENTIAL_PURGE_DAYS), now(), p.id);
        audit('DISABLE', 'parent_account', p.id, { reason: 'All linked students are alumni and there is no pending renewal.' }, 'Lifecycle');
      }
    }
  }
  function purgeOldCredentials() {
    const d = today();
    for (const p of rows(`SELECT * FROM parent_accounts WHERE status='Disabled' AND purge_after IS NOT NULL AND purge_after<=?`, d)) {
      const email = `closed-${p.id}-${crypto.randomBytes(4).toString('hex')}@closed.invalid`;
      db.prepare(`UPDATE parent_accounts SET email=?,phone='',password_hash='',status='Purged',updated_at=? WHERE id=?`).run(email, now(), p.id);
      audit('PURGE_CREDENTIALS', 'parent_account', p.id, {}, 'Lifecycle');
    }
  }
  function runLifecycle() {
    updateEnrollmentStates();
    ensureLifecycleNotifications();
    updateParentStatuses();
    purgeOldCredentials();
  }

  function parseProofDataUrl(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('Payment screenshot/receipt is compulsory. Upload PNG, JPG, WEBP or PDF.');
    const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
    if (!buf.length || buf.length > MAX_PROOF_BYTES) throw new Error(`Payment proof must be smaller than ${Math.round(MAX_PROOF_BYTES / 1024 / 1024)} MB.`);
    const ext = m[1] === 'application/pdf' ? '.pdf' : m[1] === 'image/png' ? '.png' : m[1] === 'image/webp' ? '.webp' : '.jpg';
    return { buf, mime: m[1], ext, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  }
  function saveProof(parsed, prefix = 'PP') {
    const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${parsed.ext}`;
    fs.writeFileSync(path.join(PROOF_DIR, filename), parsed.buf, { flag: 'wx' });
    return filename;
  }
  function archiveProofFile(p, reason) {
    db.prepare(`INSERT INTO payment_proof_file_history(payment_proof_id,version,proof_filename,proof_mime,proof_sha256,archived_reason,archived_at) VALUES(?,?,?,?,?,?,?)`)
      .run(p.id, p.proof_version || 1, p.proof_filename, p.proof_mime, p.proof_sha256, cleanLocal(reason, 500), now());
  }

  function ensurePaymentMeta(paymentId, source = 'Admin Entry', parentProofId = null) {
    db.prepare(`INSERT OR IGNORE INTO payment_current_meta(payment_id,current_version,source,parent_proof_id,edited_after_verification,updated_at) VALUES(?,?,?,?,0,?)`)
      .run(Number(paymentId), 1, cleanLocal(source, 80) || 'Admin Entry', parentProofId || null, now());
    if (parentProofId) db.prepare(`UPDATE payment_current_meta SET source=?,parent_proof_id=?,updated_at=? WHERE payment_id=?`).run(source, parentProofId, now(), Number(paymentId));
    return one('SELECT * FROM payment_current_meta WHERE payment_id=?', Number(paymentId));
  }
  function archivePayment(payment, reason, actor = adminName, historyStatus = 'Superseded') {
    if (!payment?.id) throw new Error('Payment not found.');
    const meta = ensurePaymentMeta(payment.id, 'Legacy / V5.3');
    const version = Number(meta.current_version || 1);
    db.prepare(`INSERT INTO payment_history(payment_id,version,student_id,fee_id,receipt_no,payer_name,payer_relation,amount,payment_date,method,transaction_reference,billing_period,received_by,notes,source,parent_proof_id,change_reason,edited_by,archived_at,replacement_version,history_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      payment.id, version, payment.student_id, payment.fee_id || null, payment.receipt_no, payment.payer_name, payment.payer_relation,
      payment.amount, payment.payment_date, payment.method, payment.transaction_reference, payment.billing_period, payment.received_by,
      payment.notes, meta.source, meta.parent_proof_id || null, cleanLocal(reason, 1000), cleanLocal(actor, 160), now(),
      historyStatus === 'Deleted' ? null : version + 1, historyStatus
    );
    return version;
  }

  // -------------------------------
  // Parent-facing pages + API
  // -------------------------------
  app.get('/parent', (req, res) => res.sendFile(path.join(publicDir, 'parent.html')));
  app.get('/parent/signup', (req, res) => res.sendFile(path.join(publicDir, 'parent-signup.html')));

  app.get('/api/parent/invite/:token', (req, res) => {
    const invite = one(`SELECT i.*,s.full_name,s.grade,s.subjects FROM parent_invites i JOIN students s ON s.id=i.student_id WHERE i.token_hash=?`, hashToken(req.params.token));
    if (!invite || invite.used_at || invite.expires_at <= now()) return res.status(400).json({ ok: false, message: 'Invitation is invalid, expired or already used.' });
    res.json({ ok: true, invite: { student: invite.full_name, grade: invite.grade, subjects: invite.subjects, parentEmail: invite.parent_email, parentPhone: invite.parent_phone, expiresAt: invite.expires_at } });
  });

  app.post('/api/parent/signup', (req, res) => {
    const invite = one('SELECT * FROM parent_invites WHERE token_hash=?', hashToken(cleanLocal(req.body.invite, 300)));
    if (!invite || invite.used_at || invite.expires_at <= now()) return res.status(400).json({ ok: false, message: 'Invitation is invalid, expired or already used.' });
    const name = cleanLocal(req.body.full_name, 120), email = cleanLocal(req.body.email, 180).toLowerCase(), phone = cleanLocal(req.body.phone, 40), password = String(req.body.password || '');
    if (!name || !email || password.length < 8) return res.status(400).json({ ok: false, message: 'Name, email and a password of at least 8 characters are required.' });
    if (one('SELECT id FROM parent_accounts WHERE email=?', email)) return res.status(409).json({ ok: false, message: 'A parent account already exists for this email. Log in and use Link Another Child with the invitation code.' });
    const t = now();
    const info = db.prepare(`INSERT INTO parent_accounts(full_name,email,phone,password_hash,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).run(name, email, phone, hashPassword(password), 'Active', t, t);
    const pid = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO parent_student_links(parent_id,student_id,relationship,created_at) VALUES(?,?,?,?)`).run(pid, invite.student_id, cleanLocal(req.body.relationship, 60) || 'Parent / Guardian', t);
    db.prepare('UPDATE parent_invites SET used_at=? WHERE id=?').run(t, invite.id);
    setParentCookie(res, signParentSession({ kind: 'parent', id: pid }));
    audit('CREATE', 'parent_account', pid, { studentId: invite.student_id }, name);
    afterMutation();
    res.status(201).json({ ok: true });
  });

  app.post('/api/parent/login', (req, res) => {
    if (!authAllowed(req.ip)) return res.status(429).json({ ok: false, message: 'Too many login attempts. Try again later.' });
    runLifecycle();
    const email = cleanLocal(req.body.email, 180).toLowerCase();
    const p = one('SELECT * FROM parent_accounts WHERE email=?', email);
    if (!p || !verifyPassword(String(req.body.password || ''), p.password_hash)) return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
    if (p.status !== 'Active') return res.status(403).json({ ok: false, message: 'This parent portal account is closed. Contact the academy to re-enroll or reactivate access.' });
    db.prepare('UPDATE parent_accounts SET last_login_at=?,updated_at=? WHERE id=?').run(now(), now(), p.id);
    setParentCookie(res, signParentSession({ kind: 'parent', id: p.id }));
    audit('LOGIN', 'parent_account', p.id, { ip: req.ip }, p.full_name);
    res.json({ ok: true });
  });
  app.get('/api/parent/me', parentAuth, (req, res) => res.json({ ok: true, parent: { id: req.parent.id, full_name: req.parent.full_name, email: req.parent.email, phone: req.parent.phone } }));
  app.post('/api/parent/logout', parentAuth, (req, res) => { clearParentCookie(res); res.json({ ok: true }); });
  app.post('/api/parent/change-password', parentAuth, (req, res) => {
    if (!verifyPassword(String(req.body.current_password || ''), req.parent.password_hash)) return res.status(400).json({ ok: false, message: 'Current password is incorrect.' });
    const np = String(req.body.new_password || '');
    if (np.length < 8) return res.status(400).json({ ok: false, message: 'New password must be at least 8 characters.' });
    db.prepare('UPDATE parent_accounts SET password_hash=?,updated_at=? WHERE id=?').run(hashPassword(np), now(), req.parent.id);
    audit('CHANGE_PASSWORD', 'parent_account', req.parent.id, {}, req.parent.full_name);
    res.json({ ok: true });
  });
  app.post('/api/parent/link-invite', parentAuth, (req, res) => {
    const invite = one('SELECT * FROM parent_invites WHERE token_hash=?', hashToken(cleanLocal(req.body.invite, 300)));
    if (!invite || invite.used_at || invite.expires_at <= now()) return res.status(400).json({ ok: false, message: 'Invitation is invalid, expired or already used.' });
    db.prepare(`INSERT OR IGNORE INTO parent_student_links(parent_id,student_id,relationship,created_at) VALUES(?,?,?,?)`).run(req.parent.id, invite.student_id, cleanLocal(req.body.relationship, 60) || 'Parent / Guardian', now());
    db.prepare('UPDATE parent_invites SET used_at=? WHERE id=?').run(now(), invite.id);
    audit('LINK_CHILD', 'parent_account', req.parent.id, { studentId: invite.student_id }, req.parent.full_name);
    afterMutation();
    res.json({ ok: true });
  });

  function childSummary(studentId) {
    const s = one('SELECT id,student_code,full_name,grade,subjects,status,school,board FROM students WHERE id=?', studentId);
    if (!s) return null;
    const att = one(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END),0) present,
      COALESCE(SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END),0) absent,
      COALESCE(SUM(CASE WHEN status='Late' THEN 1 ELSE 0 END),0) late,
      COALESCE(SUM(CASE WHEN status='Excused' THEN 1 ELSE 0 END),0) excused,
      COALESCE(SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END),0) good,
      COALESCE(SUM(CASE WHEN status!='Excused' THEN 1 ELSE 0 END),0) applicable FROM attendance WHERE student_id=?`, studentId);
    const billed = Number(one('SELECT COALESCE(SUM(amount),0) x FROM fees WHERE student_id=?', studentId)?.x || 0);
    const paid = Number(one('SELECT COALESCE(SUM(amount),0) x FROM payments WHERE student_id=?', studentId)?.x || 0);
    return {
      student: s,
      attendance: { ...att, percentage: att.applicable ? Math.round(1000 * Number(att.good) / Number(att.applicable)) / 10 : null },
      finance: { billed, paid, pending: Math.max(0, billed - paid), credit: Math.max(0, paid - billed) },
      upcomingClasses: rows(`SELECT id,class_date,start_time,end_time,duration_hours,subject,topic,mode,status FROM classes WHERE student_id=? AND status='Scheduled' AND class_date>=? ORDER BY class_date,start_time LIMIT 8`, studentId, today()),
      payments: rows(`SELECT p.id,p.receipt_no,p.amount,p.payment_date,p.method,p.payer_name,p.payer_relation,p.transaction_reference,p.billing_period,p.received_by,COALESCE(m.source,'Legacy / V5.3') source,COALESCE(m.current_version,1) current_version FROM payments p LEFT JOIN payment_current_meta m ON m.payment_id=p.id WHERE p.student_id=? ORDER BY p.payment_date DESC,p.id DESC LIMIT 12`, studentId),
      latestTests: rows(`SELECT id,test_name,subject,test_date,max_marks,marks_obtained,percentage,grade,teacher_remarks FROM tests WHERE student_id=? ORDER BY test_date DESC,id DESC LIMIT 8`, studentId),
      enrollments: rows('SELECT * FROM enrollments WHERE student_id=? ORDER BY end_date DESC,id DESC', studentId),
      alumni: isAlumni(studentId)
    };
  }

  app.get('/api/parent/dashboard', parentAuth, (req, res) => {
    runLifecycle();
    const links = rows(`SELECT l.relationship,s.id,s.student_code,s.full_name,s.grade,s.subjects,s.status FROM parent_student_links l JOIN students s ON s.id=l.student_id WHERE l.parent_id=? ORDER BY s.full_name`, req.parent.id);
    const children = links.map(l => ({ relationship: l.relationship, ...childSummary(l.id), pendingRenewal: one(`SELECT * FROM renewal_requests WHERE parent_id=? AND student_id=? AND status='Pending' ORDER BY id DESC LIMIT 1`, req.parent.id, l.id) }));
    const notifications = rows('SELECT * FROM parent_notifications WHERE parent_id=? ORDER BY created_at DESC LIMIT 30', req.parent.id);
    const paymentProofs = rows(`SELECT pp.*,s.full_name student FROM parent_payment_proofs pp JOIN students s ON s.id=pp.student_id WHERE pp.parent_id=? ORDER BY pp.created_at DESC`, req.parent.id);
    res.json({ ok: true, parent: { full_name: req.parent.full_name, email: req.parent.email }, children, notifications, paymentProofs });
  });

  app.post('/api/parent/renewals', parentAuth, (req, res) => {
    const sid = Number(req.body.student_id);
    if (!one('SELECT 1 x FROM parent_student_links WHERE parent_id=? AND student_id=?', req.parent.id, sid)) return res.status(403).json({ ok: false, message: 'This student is not linked to your account.' });
    const requested = cleanLocal(req.body.requested_course, 160);
    if (!requested) return res.status(400).json({ ok: false, message: 'Enter the course you are interested in.' });
    if (one(`SELECT id FROM renewal_requests WHERE parent_id=? AND student_id=? AND status='Pending'`, req.parent.id, sid)) return res.status(409).json({ ok: false, message: 'A renewal request is already pending.' });
    const current = one('SELECT * FROM enrollments WHERE student_id=? ORDER BY end_date DESC,id DESC LIMIT 1', sid);
    const t = now();
    const info = db.prepare(`INSERT INTO renewal_requests(parent_id,student_id,current_enrollment_id,requested_course,subjects,preferred_mode,preferred_timings,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.parent.id, sid, current?.id || null, requested, cleanLocal(req.body.subjects, 250), cleanLocal(req.body.preferred_mode, 40), cleanLocal(req.body.preferred_timings, 120), cleanLocal(req.body.notes, 800), 'Pending', t, t);
    audit('CREATE', 'renewal_request', info.lastInsertRowid, { requestedCourse: requested, studentId: sid }, req.parent.full_name);
    afterMutation();
    res.status(201).json({ ok: true });
  });

  app.post('/api/parent/payment-proofs', parentAuth, (req, res) => {
    try {
      const sid = Number(req.body.student_id);
      if (!one('SELECT 1 x FROM parent_student_links WHERE parent_id=? AND student_id=?', req.parent.id, sid)) return res.status(403).json({ ok: false, message: 'This student is not linked to your account.' });
      const amount = numLocal(req.body.amount), date = cleanLocal(req.body.payment_date, 20), method = cleanLocal(req.body.method, 50), payer = cleanLocal(req.body.payer_name, 120), reference = cleanLocal(req.body.transaction_reference, 160);
      if (amount <= 0 || !validDateLocal(date) || !method || !payer) return res.status(400).json({ ok: false, message: 'Amount, payment date, method and payer name are required.' });
      const parsed = parseProofDataUrl(req.body.proof_data_url); // compulsory
      const duplicate = one(`SELECT id,status FROM parent_payment_proofs WHERE student_id=? AND amount=? AND payment_date=? AND ((transaction_reference<>'' AND transaction_reference=?) OR proof_sha256=?) LIMIT 1`, sid, amount, date, reference, parsed.sha256);
      if (duplicate) return res.status(409).json({ ok: false, message: `This payment appears to have already been submitted (Proof #${duplicate.id}, ${duplicate.status}).` });
      const filename = saveProof(parsed, 'PARENT');
      const t = now();
      const info = db.prepare(`INSERT INTO parent_payment_proofs(parent_id,student_id,amount,payment_date,method,payer_name,payer_relation,transaction_reference,billing_period,notes,proof_filename,proof_mime,proof_sha256,proof_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.parent.id, sid, amount, date, method, payer, cleanLocal(req.body.payer_relation, 60), reference, cleanLocal(req.body.billing_period, 100), cleanLocal(req.body.notes, 800), filename, parsed.mime, parsed.sha256, 1, 'Pending', t, t);
      audit('CREATE', 'parent_payment_proof', info.lastInsertRowid, { amount, date, method, studentId: sid }, req.parent.full_name);
      afterMutation();
      res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), status: 'Pending' });
    } catch (e) { res.status(400).json({ ok: false, message: e.message }); }
  });
  app.get('/api/parent/payment-proofs/:id/file', parentAuth, (req, res) => {
    const p = one('SELECT * FROM parent_payment_proofs WHERE id=? AND parent_id=?', Number(req.params.id), req.parent.id);
    if (!p) return res.status(404).send('Not Found');
    res.setHeader('Content-Type', p.proof_mime || 'application/octet-stream');
    res.sendFile(path.join(PROOF_DIR, p.proof_filename));
  });
  app.post('/api/parent/payment-proofs/:id/resubmit', parentAuth, (req, res) => {
    try {
      const p = one('SELECT * FROM parent_payment_proofs WHERE id=? AND parent_id=?', Number(req.params.id), req.parent.id);
      if (!p) return res.status(404).json({ ok: false, message: 'Payment proof not found.' });
      if (!['Needs New Proof', 'Rejected'].includes(p.status)) return res.status(409).json({ ok: false, message: 'This proof is not awaiting replacement.' });
      const parsed = parseProofDataUrl(req.body.proof_data_url);
      archiveProofFile(p, 'Parent resubmitted proof');
      const filename = saveProof(parsed, 'PARENT');
      db.prepare(`UPDATE parent_payment_proofs SET proof_filename=?,proof_mime=?,proof_sha256=?,proof_version=?,status='Pending',admin_note='',updated_at=? WHERE id=?`)
        .run(filename, parsed.mime, parsed.sha256, Number(p.proof_version || 1) + 1, now(), p.id);
      audit('RESUBMIT', 'parent_payment_proof', p.id, {}, req.parent.full_name);
      afterMutation();
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ ok: false, message: e.message }); }
  });

  // -------------------------------
  // Integrated admin parent-portal API
  // -------------------------------
  app.get('/api/admin/parent-portal/dashboard', authRequired, (req, res) => {
    runLifecycle();
    res.json({ ok: true, summary: {
      activeParents: Number(one(`SELECT COUNT(*) c FROM parent_accounts WHERE status='Active'`)?.c || 0),
      pendingPayments: Number(one(`SELECT COUNT(*) c FROM parent_payment_proofs WHERE status='Pending'`)?.c || 0),
      pendingRenewals: Number(one(`SELECT COUNT(*) c FROM renewal_requests WHERE status='Pending'`)?.c || 0),
      expiringCourses: Number(one(`SELECT COUNT(*) c FROM enrollments WHERE status='Active' AND end_date BETWEEN ? AND ?`, today(), addDays(today(), 7))?.c || 0),
      alumni: Number(one(`SELECT COUNT(*) c FROM students s WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id) AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status IN ('Upcoming','Active','Grace'))`)?.c || 0),
      waitingInvites: Number(one(`SELECT COUNT(*) c FROM parent_invites WHERE used_at IS NULL AND expires_at>?`, now())?.c || 0)
    } });
  });
  app.get('/api/admin/parent-portal/students', authRequired, (req, res) => {
    runLifecycle();
    res.json({ ok: true, students: rows(`SELECT s.id,s.student_code,s.full_name,s.grade,s.subjects,s.parent_name,s.parent_email,s.parent_phone,s.status,
      (SELECT COUNT(*) FROM parent_student_links l WHERE l.student_id=s.id) linked_parents,
      (SELECT course_name FROM enrollments e WHERE e.student_id=s.id ORDER BY end_date DESC,id DESC LIMIT 1) latest_course,
      (SELECT end_date FROM enrollments e WHERE e.student_id=s.id ORDER BY end_date DESC,id DESC LIMIT 1) latest_end_date,
      CASE WHEN EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id) AND NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status IN ('Upcoming','Active','Grace')) THEN 'Alumni' ELSE 'Current' END lifecycle_status
      FROM students s ORDER BY s.full_name`) });
  });
  app.get('/api/admin/parent-portal/parents', authRequired, (req, res) => res.json({ ok: true, parents: rows(`SELECT p.id,p.full_name,p.email,p.phone,p.status,p.disabled_at,p.purge_after,p.last_login_at,p.created_at,p.updated_at,GROUP_CONCAT(s.full_name, ', ') children FROM parent_accounts p LEFT JOIN parent_student_links l ON l.parent_id=p.id LEFT JOIN students s ON s.id=l.student_id GROUP BY p.id ORDER BY p.full_name`) }));
  app.get('/api/admin/parent-portal/invites', authRequired, (req, res) => res.json({ ok: true, invites: rows(`SELECT i.id,i.student_id,i.parent_email,i.parent_phone,i.expires_at,i.used_at,i.created_at,i.created_by,s.student_code,s.full_name student FROM parent_invites i JOIN students s ON s.id=i.student_id ORDER BY i.id DESC`) }));
  app.post('/api/admin/parent-portal/invites/:studentId', authRequired, (req, res) => {
    const student = one('SELECT * FROM students WHERE id=?', Number(req.params.studentId));
    if (!student) return res.status(404).json({ ok: false, message: 'Student not found.' });
    db.prepare(`UPDATE parent_invites SET expires_at=? WHERE student_id=? AND used_at IS NULL`).run(now(), student.id);
    const invite = createInvite(student, req, adminName);
    res.status(201).json({ ok: true, invite });
  });
  app.post('/api/admin/parent-portal/parents/:id/status', authRequired, (req, res) => {
    const p = one('SELECT * FROM parent_accounts WHERE id=?', Number(req.params.id));
    if (!p) return res.status(404).json({ ok: false, message: 'Parent account not found.' });
    const action = cleanLocal(req.body.action, 30);
    if (action === 'reactivate') db.prepare(`UPDATE parent_accounts SET status='Active',disabled_at=NULL,purge_after=NULL,updated_at=? WHERE id=?`).run(now(), p.id);
    else if (action === 'disable') db.prepare(`UPDATE parent_accounts SET status='Disabled',disabled_at=?,purge_after=?,updated_at=? WHERE id=?`).run(now(), addDays(today(), CREDENTIAL_PURGE_DAYS), now(), p.id);
    else return res.status(400).json({ ok: false, message: 'Action must be disable or reactivate.' });
    audit(action.toUpperCase(), 'parent_account', p.id, { manual: true }, adminName);
    afterMutation();
    res.json({ ok: true });
  });

  app.get('/api/admin/parent-portal/enrollments', authRequired, (req, res) => {
    runLifecycle();
    res.json({ ok: true, enrollments: rows(`SELECT e.*,s.student_code,s.full_name student FROM enrollments e JOIN students s ON s.id=e.student_id ORDER BY e.end_date DESC,e.id DESC`) });
  });
  app.post('/api/admin/parent-portal/enrollments', authRequired, (req, res) => {
    const sid = Number(req.body.student_id), course = cleanLocal(req.body.course_name, 160), start = cleanLocal(req.body.start_date, 20), end = cleanLocal(req.body.end_date, 20);
    if (!one('SELECT id FROM students WHERE id=?', sid) || !course || !validDateLocal(start) || !validDateLocal(end) || end < start) return res.status(400).json({ ok: false, message: 'Student, course and valid start/end dates are required.' });
    const t = now(), grace = addDays(end, GRACE_DAYS);
    const info = db.prepare(`INSERT INTO enrollments(student_id,course_name,subjects,start_date,end_date,grace_until,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(sid, course, cleanLocal(req.body.subjects, 250), start, end, grace, 'Upcoming', cleanLocal(req.body.notes, 800), t, t);
    runLifecycle();
    audit('CREATE', 'enrollment', info.lastInsertRowid, { studentId: sid, course, start, end, grace }, adminName);
    afterMutation();
    res.status(201).json({ ok: true, enrollment: one('SELECT * FROM enrollments WHERE id=?', Number(info.lastInsertRowid)) });
  });
  app.put('/api/admin/parent-portal/enrollments/:id', authRequired, (req, res) => {
    const id = Number(req.params.id), old = one('SELECT * FROM enrollments WHERE id=?', id);
    if (!old) return res.status(404).json({ ok: false, message: 'Enrollment not found.' });
    const course = cleanLocal(req.body.course_name, 160) || old.course_name, start = cleanLocal(req.body.start_date, 20) || old.start_date, end = cleanLocal(req.body.end_date, 20) || old.end_date;
    if (!validDateLocal(start) || !validDateLocal(end) || end < start) return res.status(400).json({ ok: false, message: 'Invalid enrollment dates.' });
    db.prepare(`UPDATE enrollments SET course_name=?,subjects=?,start_date=?,end_date=?,grace_until=?,notes=?,updated_at=? WHERE id=?`)
      .run(course, cleanLocal(req.body.subjects, 250) || old.subjects, start, end, addDays(end, GRACE_DAYS), cleanLocal(req.body.notes, 800), now(), id);
    runLifecycle(); audit('UPDATE', 'enrollment', id, { course, start, end }, adminName); afterMutation();
    res.json({ ok: true, enrollment: one('SELECT * FROM enrollments WHERE id=?', id) });
  });

  app.get('/api/admin/parent-portal/renewals', authRequired, (req, res) => res.json({ ok: true, renewals: rows(`SELECT r.*,s.student_code,s.full_name student,p.full_name parent_name,p.email parent_email,e.course_name current_course,e.end_date current_end FROM renewal_requests r JOIN students s ON s.id=r.student_id JOIN parent_accounts p ON p.id=r.parent_id LEFT JOIN enrollments e ON e.id=r.current_enrollment_id ORDER BY CASE r.status WHEN 'Pending' THEN 0 ELSE 1 END,r.created_at DESC`) }));
  app.post('/api/admin/parent-portal/renewals/:id/approve', authRequired, (req, res) => {
    const r = one('SELECT * FROM renewal_requests WHERE id=?', Number(req.params.id));
    if (!r) return res.status(404).json({ ok: false, message: 'Renewal request not found.' });
    if (r.status !== 'Pending') return res.status(409).json({ ok: false, message: 'Renewal request already processed.' });
    const course = cleanLocal(req.body.course_name, 160) || r.requested_course;
    const start = cleanLocal(req.body.start_date, 20), end = cleanLocal(req.body.end_date, 20);
    if (!validDateLocal(start) || !validDateLocal(end) || end < start) return res.status(400).json({ ok: false, message: 'Enter valid start and end dates for the approved course.' });
    const t = now();
    const e = db.prepare(`INSERT INTO enrollments(student_id,course_name,subjects,start_date,end_date,grace_until,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(r.student_id, course, cleanLocal(req.body.subjects, 250) || r.subjects, start, end, addDays(end, GRACE_DAYS), 'Upcoming', cleanLocal(req.body.notes, 800), t, t);
    db.prepare(`UPDATE renewal_requests SET status='Approved',admin_note=?,updated_at=? WHERE id=?`).run(cleanLocal(req.body.admin_note, 800), t, r.id);
    notify(r.parent_id, r.student_id, `renewal-approved-${r.id}`, 'Renewal approved', `Your request has been approved for ${course}, ${start} to ${end}.`);
    runLifecycle(); audit('APPROVE', 'renewal_request', r.id, { enrollmentId: Number(e.lastInsertRowid), course }, adminName); afterMutation();
    res.json({ ok: true });
  });
  app.post('/api/admin/parent-portal/renewals/:id/reject', authRequired, (req, res) => {
    const r = one('SELECT * FROM renewal_requests WHERE id=?', Number(req.params.id));
    if (!r) return res.status(404).json({ ok: false, message: 'Renewal request not found.' });
    if (r.status !== 'Pending') return res.status(409).json({ ok: false, message: 'Renewal request already processed.' });
    const note = cleanLocal(req.body.admin_note, 800) || 'The academy could not approve this renewal request at this time.';
    db.prepare(`UPDATE renewal_requests SET status='Rejected',admin_note=?,updated_at=? WHERE id=?`).run(note, now(), r.id);
    notify(r.parent_id, r.student_id, `renewal-rejected-${r.id}`, 'Renewal request update', note);
    audit('REJECT', 'renewal_request', r.id, {}, adminName); afterMutation(); res.json({ ok: true });
  });

  app.get('/api/admin/parent-portal/payment-proofs', authRequired, (req, res) => res.json({ ok: true, proofs: rows(`SELECT pp.*,s.student_code,s.full_name student,p.full_name parent_name,p.email parent_email FROM parent_payment_proofs pp JOIN students s ON s.id=pp.student_id JOIN parent_accounts p ON p.id=pp.parent_id ORDER BY CASE pp.status WHEN 'Pending' THEN 0 WHEN 'Needs New Proof' THEN 1 ELSE 2 END,pp.created_at DESC`) }));
  app.get('/api/admin/parent-portal/payment-proofs/:id/file', authRequired, (req, res) => {
    const p = one('SELECT * FROM parent_payment_proofs WHERE id=?', Number(req.params.id));
    if (!p) return res.status(404).send('Not Found');
    res.setHeader('Content-Type', p.proof_mime || 'application/octet-stream');
    res.sendFile(path.join(PROOF_DIR, p.proof_filename));
  });
  app.post('/api/admin/parent-portal/payment-proofs/:id/approve', authRequired, (req, res) => {
    const p = one(`SELECT pp.*,s.full_name student FROM parent_payment_proofs pp JOIN students s ON s.id=pp.student_id WHERE pp.id=?`, Number(req.params.id));
    if (!p) return res.status(404).json({ ok: false, message: 'Payment proof not found.' });
    if (!p.proof_filename || !fs.existsSync(path.join(PROOF_DIR, p.proof_filename))) return res.status(409).json({ ok: false, message: 'Payment screenshot/receipt is compulsory and the proof file is missing.' });
    if (p.status === 'Verified') return res.json({ ok: true, message: 'Already verified.', paymentId: p.official_payment_id, receipt: p.official_receipt_no });
    const receipt = nextReceipt();
    const t = now();
    const info = db.prepare(`INSERT INTO payments(student_id,fee_id,receipt_no,payer_name,payer_relation,amount,payment_date,method,transaction_reference,billing_period,received_by,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(p.student_id, null, receipt, p.payer_name, p.payer_relation, p.amount, p.payment_date, p.method, p.transaction_reference, p.billing_period, adminName, `${p.notes || ''}\nVerified from integrated Parent Portal proof #${p.id}`.trim(), t);
    const paymentId = Number(info.lastInsertRowid);
    ensurePaymentMeta(paymentId, 'Parent Portal', p.id);
    db.prepare(`UPDATE parent_payment_proofs SET status='Verified',admin_note=?,official_payment_id=?,official_receipt_no=?,updated_at=? WHERE id=?`)
      .run(cleanLocal(req.body.admin_note, 800), paymentId, receipt, t, p.id);
    notify(p.parent_id, p.student_id, `payment-verified-${p.id}`, 'Payment verified', `Your payment of ₹${Number(p.amount).toLocaleString('en-IN')} has been verified. Receipt ${receipt}.`);
    audit('APPROVE', 'parent_payment_proof', p.id, { paymentId, receipt }, adminName); afterMutation();
    res.json({ ok: true, payment: one('SELECT * FROM payments WHERE id=?', paymentId) });
  });
  app.post('/api/admin/parent-portal/payment-proofs/:id/reject', authRequired, (req, res) => {
    const p = one('SELECT * FROM parent_payment_proofs WHERE id=?', Number(req.params.id));
    if (!p) return res.status(404).json({ ok: false, message: 'Payment proof not found.' });
    const status = req.body.needs_new_proof ? 'Needs New Proof' : 'Rejected';
    const note = cleanLocal(req.body.admin_note, 800) || (status === 'Needs New Proof' ? 'Please upload a clearer payment screenshot/receipt.' : 'Payment proof could not be verified.');
    db.prepare(`UPDATE parent_payment_proofs SET status=?,admin_note=?,updated_at=? WHERE id=?`).run(status, note, now(), p.id);
    notify(p.parent_id, p.student_id, `payment-update-${p.id}-${Date.now()}`, 'Payment proof update', note);
    audit('REJECT', 'parent_payment_proof', p.id, { status }, adminName); afterMutation(); res.json({ ok: true });
  });

  // Current website payment is editable. The old version is never overwritten silently:
  // it is copied into payment_history before the current row is updated.
  app.put('/api/payments/:id', authRequired, (req, res) => {
    const id = Number(req.params.id), old = one('SELECT * FROM payments WHERE id=?', id);
    if (!old) return res.status(404).json({ ok: false, message: 'Payment not found.' });
    const reason = cleanLocal(req.body.edit_reason, 1000);
    if (!reason) return res.status(400).json({ ok: false, message: 'Reason for editing is compulsory so the old payment can be kept in Historical Payment Records.' });
    const sid = Number(req.body.student_id ?? old.student_id), amount = numLocal(req.body.amount ?? old.amount), date = cleanLocal(req.body.payment_date ?? old.payment_date, 20), payer = cleanLocal(req.body.payer_name ?? old.payer_name, 120), method = cleanLocal(req.body.method ?? old.method, 50);
    if (!one('SELECT id FROM students WHERE id=?', sid) || amount <= 0 || !validDateLocal(date) || !payer || !method) return res.status(400).json({ ok: false, message: 'Valid student, payer, positive amount, date and method are required.' });
    const meta = ensurePaymentMeta(id, 'Legacy / V5.3');
    const oldVersion = archivePayment(old, reason, adminName, 'Superseded');
    const majorChanged = Number(old.amount) !== Number(amount) || old.payment_date !== date || old.method !== method || String(old.transaction_reference || '') !== String(req.body.transaction_reference ?? old.transaction_reference ?? '');
    db.prepare(`UPDATE payments SET student_id=?,fee_id=?,payer_name=?,payer_relation=?,amount=?,payment_date=?,method=?,transaction_reference=?,billing_period=?,received_by=?,notes=? WHERE id=?`).run(
      sid, req.body.fee_id === '' || req.body.fee_id == null ? old.fee_id : Number(req.body.fee_id), payer, cleanLocal(req.body.payer_relation ?? old.payer_relation, 60), amount, date, method,
      cleanLocal(req.body.transaction_reference ?? old.transaction_reference, 160), cleanLocal(req.body.billing_period ?? old.billing_period, 100), cleanLocal(req.body.received_by ?? old.received_by, 120) || adminName, cleanLocal(req.body.notes ?? old.notes, 1000), id
    );
    db.prepare(`UPDATE payment_current_meta SET current_version=?,edited_after_verification=?,updated_at=? WHERE payment_id=?`)
      .run(oldVersion + 1, (meta.parent_proof_id && majorChanged) ? 1 : Number(meta.edited_after_verification || 0), now(), id);
    audit('UPDATE', 'payment', id, { reason, previousVersion: oldVersion, currentVersion: oldVersion + 1, editedAfterVerification: !!(meta.parent_proof_id && majorChanged) }, adminName);
    afterMutation();
    res.json({ ok: true, payment: one(`SELECT p.*,m.current_version,m.source,m.parent_proof_id,m.edited_after_verification FROM payments p LEFT JOIN payment_current_meta m ON m.payment_id=p.id WHERE p.id=?`, id) });
  });

  app.get('/api/payment-history', authRequired, (req, res) => res.json({ ok: true, history: rows(`SELECT h.*,s.student_code,s.full_name student FROM payment_history h LEFT JOIN students s ON s.id=h.student_id ORDER BY h.archived_at DESC,h.id DESC`) }));

  function beforeDeletePayment(payment, actor = adminName) {
    if (!payment?.id) return;
    archivePayment(payment, 'Payment deleted from current website by administrator.', actor, 'Deleted');
  }

  // -------------------------------
  // Excel V6 add-on sheets
  // -------------------------------
  const sheetCatalog = [
    ['Parent Accounts', 'Integrated parent portal accounts, status, last login and linked-child count.'],
    ['Parent Student Links', 'Parent-to-student permissions and relationships.'],
    ['Enrollments', 'All course enrollments with current lifecycle status and grace dates.'],
    ['Course History', 'Completed/ended course history for every student, including students who later rejoined.'],
    ['Old Records Alumni', 'Only true alumni: students with enrollment history but no active, upcoming or grace enrollment. Rejoined/current students are excluded.'],
    ['Payment Proofs', 'Parent-submitted compulsory screenshot/receipt proof metadata and verification status.'],
    ['Historical Payments', 'Superseded/deleted versions of edited payment records. Current website shows only the latest version.'],
    ['Renewal Requests', 'Parent course-renewal requests and admin decisions.'],
    ['Portal Activity', 'Parent-portal related actions from the shared audit trail.']
  ];

  function appendWorkbookSheets(wb) {
    runLifecycle();
    const parents = rows(`SELECT p.id,p.full_name,p.email,p.phone,p.status,p.disabled_at,p.purge_after,p.last_login_at,p.created_at,p.updated_at,COUNT(l.student_id) linked_children,GROUP_CONCAT(s.full_name, ', ') children FROM parent_accounts p LEFT JOIN parent_student_links l ON l.parent_id=p.id LEFT JOIN students s ON s.id=l.student_id GROUP BY p.id ORDER BY p.full_name`);
    const links = rows(`SELECT p.id parent_id,p.full_name parent_name,p.email parent_email,l.relationship,s.id student_id,s.student_code,s.full_name student,s.grade,s.subjects,l.created_at linked_at FROM parent_student_links l JOIN parent_accounts p ON p.id=l.parent_id JOIN students s ON s.id=l.student_id ORDER BY p.full_name,s.full_name`);
    const enroll = rows(`SELECT e.id,s.student_code,s.full_name student,e.student_id,e.course_name,e.subjects,e.start_date,e.end_date,e.grace_until,e.status,e.notes,e.created_at,e.updated_at FROM enrollments e JOIN students s ON s.id=e.student_id ORDER BY e.end_date DESC,e.id DESC`);
    const courseHistory = enroll.filter(e => e.status === 'Ended');
    const alumni = rows(`SELECT s.id student_id,s.student_code,s.full_name student,s.grade,s.school,s.board,s.subjects,s.parent_name,s.parent_phone,s.parent_email,s.joining_date,s.fee_plan_amount,s.status database_status,
      (SELECT e.course_name FROM enrollments e WHERE e.student_id=s.id ORDER BY e.end_date DESC,e.id DESC LIMIT 1) last_course,
      (SELECT e.end_date FROM enrollments e WHERE e.student_id=s.id ORDER BY e.end_date DESC,e.id DESC LIMIT 1) last_course_end,
      (SELECT COUNT(*) FROM enrollments e WHERE e.student_id=s.id) lifetime_enrollments,
      (SELECT COUNT(*) FROM classes c WHERE c.student_id=s.id) lifetime_classes,
      COALESCE((SELECT ROUND(SUM(CASE WHEN c.status='Completed' THEN c.duration_hours ELSE 0 END),2) FROM classes c WHERE c.student_id=s.id),0) lifetime_completed_hours,
      COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.student_id=s.id),0) lifetime_fees,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id),0) lifetime_paid,
      CASE WHEN COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.student_id=s.id),0)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id),0)>0 THEN COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.student_id=s.id),0)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id),0) ELSE 0 END outstanding_balance,
      (SELECT ROUND(AVG(t.percentage),1) FROM tests t WHERE t.student_id=s.id) average_test_percentage,
      (SELECT MAX(p.payment_date) FROM payments p WHERE p.student_id=s.id) last_payment_date
      FROM students s
      WHERE EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status IN ('Upcoming','Active','Grace'))
      ORDER BY last_course_end DESC,s.full_name`);
    const proofs = rows(`SELECT pp.id proof_id,s.student_code,s.full_name student,p.full_name parent_name,p.email parent_email,pp.amount,pp.payment_date,pp.method,pp.payer_name,pp.payer_relation,pp.transaction_reference,pp.billing_period,pp.proof_filename,pp.proof_mime,pp.proof_sha256,pp.proof_version,pp.status verification_status,pp.admin_note,pp.official_payment_id,pp.official_receipt_no,pp.created_at,pp.updated_at FROM parent_payment_proofs pp JOIN students s ON s.id=pp.student_id JOIN parent_accounts p ON p.id=pp.parent_id ORDER BY pp.created_at DESC`);
    const history = rows(`SELECT h.id history_id,h.payment_id,h.version,s.student_code,s.full_name student,h.student_id,h.fee_id,h.receipt_no,h.payer_name,h.payer_relation,h.amount,h.payment_date,h.method,h.transaction_reference,h.billing_period,h.received_by,h.notes,h.source,h.parent_proof_id,h.change_reason,h.edited_by,h.archived_at,h.replacement_version,h.history_status FROM payment_history h LEFT JOIN students s ON s.id=h.student_id ORDER BY h.archived_at DESC,h.id DESC`);
    const renewals = rows(`SELECT r.id,s.student_code,s.full_name student,p.full_name parent_name,p.email parent_email,r.requested_course,r.subjects,r.preferred_mode,r.preferred_timings,r.notes,r.status,r.admin_note,e.course_name current_course,e.end_date current_course_end,r.created_at,r.updated_at FROM renewal_requests r JOIN students s ON s.id=r.student_id JOIN parent_accounts p ON p.id=r.parent_id LEFT JOIN enrollments e ON e.id=r.current_enrollment_id ORDER BY r.created_at DESC`);
    const activity = rows(`SELECT id,action,entity_type,entity_id,details,actor,created_at FROM audit_log WHERE entity_type IN ('parent_account','parent_invite','enrollment','renewal_request','parent_payment_proof') OR action LIKE 'PARENT_%' ORDER BY created_at DESC,id DESC`);

    appendReport(wb,{name:'Parent Accounts',title:'INTEGRATED PARENT ACCOUNTS',subtitle:'Parent portal accounts inside the same V6 application and database.',columns:[
      {key:'id',label:'Parent ID',type:'integer',width:11},{key:'full_name',label:'Parent / Guardian',width:26},{key:'email',label:'Email',width:32},{key:'phone',label:'Phone',width:18},{key:'status',label:'Status',width:14},{key:'linked_children',label:'Linked Children',type:'integer',width:15},{key:'children',label:'Children',width:38},{key:'last_login_at',label:'Last Login',width:25},{key:'disabled_at',label:'Disabled At',width:25},{key:'purge_after',label:'Credential Purge After',width:22},{key:'created_at',label:'Created At',width:25},{key:'updated_at',label:'Updated At',width:25}
    ],data:parents,tabColor:'7030A0',valueStyles:{status:{Active:'good',Disabled:'warn',Purged:'bad'}}});
    appendReport(wb,{name:'Parent Student Links',title:'PARENT–STUDENT LINKS',subtitle:'Permission map controlling exactly which children each parent account can access.',columns:[
      {key:'parent_id',label:'Parent ID',type:'integer',width:11},{key:'parent_name',label:'Parent',width:25},{key:'parent_email',label:'Parent Email',width:30},{key:'relationship',label:'Relationship',width:20},{key:'student_id',label:'Student ID',type:'integer',width:11},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'grade',label:'Grade',width:14},{key:'subjects',label:'Subjects',width:30},{key:'linked_at',label:'Linked At',width:25}
    ],data:links,tabColor:'7030A0'});
    appendReport(wb,{name:'Enrollments',title:'COURSE ENROLLMENTS',subtitle:'All current and historical enrollments. Lifecycle status is calculated from course and grace dates.',columns:[
      {key:'id',label:'Enrollment ID',type:'integer',width:14},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'course_name',label:'Course',width:30},{key:'subjects',label:'Subjects',width:28},{key:'start_date',label:'Start Date',width:14},{key:'end_date',label:'End Date',width:14},{key:'grace_until',label:'Grace Until',width:14},{key:'status',label:'Lifecycle Status',width:17},{key:'notes',label:'Notes',width:40},{key:'created_at',label:'Created At',width:24},{key:'updated_at',label:'Updated At',width:24}
    ],data:enroll,tabColor:'5B9BD5',valueStyles:{status:{Active:'good',Upcoming:'softHeader',Grace:'warn',Ended:'bad'}}});
    appendReport(wb,{name:'Course History',title:'COURSE HISTORY',subtitle:'Ended courses for every student. A current/rejoined student may appear here for past courses but never in Old Records Alumni while currently enrolled.',columns:[
      {key:'id',label:'Enrollment ID',type:'integer',width:14},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'course_name',label:'Completed Course',width:32},{key:'subjects',label:'Subjects',width:28},{key:'start_date',label:'Start Date',width:14},{key:'end_date',label:'End Date',width:14},{key:'grace_until',label:'Grace Ended',width:14},{key:'notes',label:'Notes',width:40}
    ],data:courseHistory,tabColor:'5B9BD5'});
    appendReport(wb,{name:'Old Records Alumni',title:'OLD RECORDS / ALUMNI',subtitle:'TRUE ALUMNI ONLY. Students who rejoined or have any active/upcoming/grace enrollment are automatically excluded.',columns:[
      {key:'student_id',label:'Student ID',type:'integer',width:11},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:28},{key:'grade',label:'Last Grade',width:14},{key:'school',label:'School',width:28},{key:'board',label:'Board',width:16},{key:'subjects',label:'Subjects',width:30},{key:'parent_name',label:'Parent / Guardian',width:26},{key:'parent_phone',label:'Parent Phone',width:18},{key:'parent_email',label:'Parent Email',width:30},{key:'last_course',label:'Last Course',width:30},{key:'last_course_end',label:'Final Course End',width:16},{key:'lifetime_enrollments',label:'Enrollments',type:'integer',width:13},{key:'lifetime_classes',label:'Lifetime Classes',type:'integer',width:15},{key:'lifetime_completed_hours',label:'Completed Hours',type:'number',width:16},{key:'lifetime_fees',label:'Lifetime Fees',type:'currency',width:17},{key:'lifetime_paid',label:'Lifetime Paid',type:'currency',width:17},{key:'outstanding_balance',label:'Outstanding',type:'currency',width:17},{key:'average_test_percentage',label:'Avg Test %',type:'percent',width:14},{key:'last_payment_date',label:'Last Payment',width:15},{key:'database_status',label:'Stored Student Status',width:18}
    ],data:alumni,tabColor:'A5A5A5'});
    appendReport(wb,{name:'Payment Proofs',title:'PARENT PAYMENT PROOFS',subtitle:'Compulsory screenshot/receipt metadata. Binary proof files stay private on the persistent disk and are not embedded in Excel.',columns:[
      {key:'proof_id',label:'Proof ID',type:'integer',width:11},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'parent_name',label:'Parent Account',width:26},{key:'amount',label:'Amount',type:'currency',width:16},{key:'payment_date',label:'Payment Date',width:14},{key:'method',label:'Method',width:18},{key:'payer_name',label:'Paid By',width:24},{key:'payer_relation',label:'Relation',width:18},{key:'transaction_reference',label:'UTR / Reference',width:24},{key:'billing_period',label:'Billing Period',width:18},{key:'proof_filename',label:'Private Proof File',width:34},{key:'proof_mime',label:'Proof Type',width:22},{key:'proof_sha256',label:'Proof SHA-256',width:68},{key:'proof_version',label:'Proof Version',type:'integer',width:14},{key:'verification_status',label:'Verification Status',width:18},{key:'admin_note',label:'Admin Note',width:36},{key:'official_payment_id',label:'Official Payment ID',type:'integer',width:18},{key:'official_receipt_no',label:'Official Receipt',width:20},{key:'created_at',label:'Submitted At',width:24},{key:'updated_at',label:'Updated At',width:24}
    ],data:proofs,tabColor:'C00000',valueStyles:{verification_status:{Verified:'good',Pending:'warn',Rejected:'bad','Needs New Proof':'bad'}}});
    appendReport(wb,{name:'Historical Payments',title:'HISTORICAL PAYMENT RECORDS',subtitle:'Old/superseded payment versions retained permanently when admin edits or deletes a payment. The website Payments list shows only the current record.',columns:[
      {key:'history_id',label:'History ID',type:'integer',width:11},{key:'payment_id',label:'Payment ID',type:'integer',width:11},{key:'version',label:'Old Version',type:'integer',width:11},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'receipt_no',label:'Receipt No.',width:22},{key:'payer_name',label:'Paid By',width:24},{key:'payer_relation',label:'Relation',width:18},{key:'amount',label:'Old Amount',type:'currency',width:16},{key:'payment_date',label:'Old Payment Date',width:16},{key:'method',label:'Old Method',width:18},{key:'transaction_reference',label:'Old UTR / Reference',width:24},{key:'billing_period',label:'Old Billing Period',width:20},{key:'received_by',label:'Old Received By',width:24},{key:'source',label:'Payment Source',width:18},{key:'parent_proof_id',label:'Proof ID',type:'integer',width:11},{key:'change_reason',label:'Reason for Edit / Delete',width:44},{key:'edited_by',label:'Edited By',width:24},{key:'archived_at',label:'Archived At',width:24},{key:'replacement_version',label:'Replacement Version',type:'integer',width:19},{key:'history_status',label:'History Status',width:16},{key:'notes',label:'Old Notes',width:42}
    ],data:history,tabColor:'C55A11',valueStyles:{history_status:{Superseded:'warn',Deleted:'bad'}}});
    appendReport(wb,{name:'Renewal Requests',title:'COURSE RENEWAL REQUESTS',subtitle:'Parent requests for the next course and the academy decision.',columns:[
      {key:'id',label:'Request ID',type:'integer',width:12},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'parent_name',label:'Parent',width:26},{key:'parent_email',label:'Parent Email',width:30},{key:'current_course',label:'Current / Last Course',width:30},{key:'current_course_end',label:'Current End',width:15},{key:'requested_course',label:'Requested Course',width:32},{key:'subjects',label:'Subjects',width:26},{key:'preferred_mode',label:'Mode',width:14},{key:'preferred_timings',label:'Preferred Timings',width:26},{key:'status',label:'Status',width:14},{key:'admin_note',label:'Admin Note',width:38},{key:'notes',label:'Parent Notes',width:38},{key:'created_at',label:'Requested At',width:24},{key:'updated_at',label:'Updated At',width:24}
    ],data:renewals,tabColor:'8064A2',valueStyles:{status:{Approved:'good',Pending:'warn',Rejected:'bad'}}});
    appendReport(wb,{name:'Portal Activity',title:'PARENT PORTAL ACTIVITY',subtitle:'Integrated parent-portal activity from the shared V6 audit trail.',columns:[
      {key:'id',label:'Audit ID',type:'integer',width:10},{key:'action',label:'Action',width:22},{key:'entity_type',label:'Entity Type',width:22},{key:'entity_id',label:'Entity ID',width:15},{key:'actor',label:'Actor',width:26},{key:'details',label:'Details',width:60},{key:'created_at',label:'Created At',width:26}
    ],data:activity,tabColor:'7F7F7F'});
  }

  initDb();
  runLifecycle();
  const timer = setInterval(() => { try { runLifecycle(); } catch (e) { console.error('V6 parent lifecycle check failed:', e); } }, 60 * 60 * 1000);
  timer.unref?.();

  return {
    sheetCatalog,
    appendWorkbookSheets,
    ensureInviteForStudent,
    ensurePaymentMeta,
    archivePayment,
    beforeDeletePayment,
    runLifecycle,
    isAlumni,
    proofDir: PROOF_DIR
  };
};
