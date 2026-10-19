'use strict';
// Additive migration only. The V6.1 tables and IDs are retained.
module.exports=function migrate({db,now,one,rows,hashPassword,admin}) {
  const tx=fn=>{db.exec('SAVEPOINT migrate_v7');try{fn();db.exec('RELEASE migrate_v7');}catch(e){db.exec('ROLLBACK TO migrate_v7; RELEASE migrate_v7');throw e;}};
  tx(()=>{
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, description TEXT NOT NULL)');
    if(one('SELECT version FROM schema_migrations WHERE version=7'))return;
    const fields={
      students:{photo_id:'INTEGER',fee_plan_type:"TEXT NOT NULL DEFAULT 'Monthly'",version:'INTEGER NOT NULL DEFAULT 1'},
      classes:{teacher_id:'INTEGER',batch_id:'INTEGER',enrollment_id:'INTEGER',subject_id:'INTEGER',session_key:'TEXT',recurrence_id:'TEXT',location:'TEXT',meeting_link:'TEXT',version:'INTEGER NOT NULL DEFAULT 1'},
      attendance:{voided_at:'TEXT'},
      fees:{enrollment_id:'INTEGER',voided_at:'TEXT',version:'INTEGER NOT NULL DEFAULT 1'},
      payments:{status:"TEXT NOT NULL DEFAULT 'Current'",updated_at:'TEXT',status_reason:'TEXT'},
      tests:{teacher_id:'INTEGER',batch_id:'INTEGER',enrollment_id:'INTEGER',subject_id:'INTEGER',passing_marks:'REAL NOT NULL DEFAULT 0',topic:'TEXT',notes:'TEXT',status:"TEXT NOT NULL DEFAULT 'Completed'",exam_key:'TEXT',updated_at:'TEXT',archived_at:'TEXT',version:'INTEGER NOT NULL DEFAULT 1'},
      enrollments:{fee_plan_type:"TEXT NOT NULL DEFAULT 'Monthly'",fee_plan_amount:'REAL NOT NULL DEFAULT 0',mode:"TEXT NOT NULL DEFAULT 'Online'",teacher_id:'INTEGER',batch_id:'INTEGER',on_hold:'INTEGER NOT NULL DEFAULT 0',version:'INTEGER NOT NULL DEFAULT 1'},
      parent_accounts:{manual_disabled:'INTEGER NOT NULL DEFAULT 0',access_until:'TEXT',session_version:'INTEGER NOT NULL DEFAULT 1'},
      parent_student_links:{active:'INTEGER NOT NULL DEFAULT 1',unlinked_at:'TEXT'},
      renewal_requests:{grade:'TEXT',approved_enrollment_id:'INTEGER'},
      payment_history:{old_values:'TEXT',replacement_values:'TEXT',proof_version:'INTEGER'},
      audit_log:{ip_address:'TEXT',reason:'TEXT'}
    };
    for(const [table,cols] of Object.entries(fields)) {
      const existing=new Set(rows('PRAGMA table_info('+table+')').map(c=>c.name));
      for(const [name,type] of Object.entries(cols))if(!existing.has(name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);
    }
    db.exec([
      'CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_code TEXT UNIQUE, full_name TEXT NOT NULL, photo_id INTEGER, phone TEXT, email TEXT, subjects TEXT, qualification TEXT, experience TEXT, joining_date TEXT, hourly_rate REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'Active\', notes TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT, status TEXT NOT NULL DEFAULT \'Active\', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS batches(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, subject_id INTEGER REFERENCES subjects(id), teacher_id INTEGER REFERENCES teachers(id), grade TEXT, academic_year TEXT, start_date TEXT, end_date TEXT, mode TEXT NOT NULL DEFAULT \'Online\', max_students INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT \'Active\', notes TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS batch_students(batch_id INTEGER NOT NULL REFERENCES batches(id), student_id INTEGER NOT NULL REFERENCES students(id), active INTEGER NOT NULL DEFAULT 1, joined_at TEXT NOT NULL, left_at TEXT, PRIMARY KEY(batch_id,student_id))',
      'CREATE TABLE IF NOT EXISTS teacher_students(teacher_id INTEGER NOT NULL REFERENCES teachers(id), student_id INTEGER NOT NULL REFERENCES students(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, PRIMARY KEY(teacher_id,student_id))',
      'CREATE TABLE IF NOT EXISTS subject_links(subject_id INTEGER NOT NULL REFERENCES subjects(id), entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, PRIMARY KEY(subject_id,entity_type,entity_id))',
      'CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL CHECK(role IN (\'ADMIN\',\'TEACHER\',\'STUDENT\')), full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, teacher_id INTEGER REFERENCES teachers(id), student_id INTEGER REFERENCES students(id), permissions TEXT NOT NULL DEFAULT \'{}\', status TEXT NOT NULL DEFAULT \'Active\', session_version INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, owner_id INTEGER NOT NULL, session_version INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)',
      'CREATE TABLE IF NOT EXISTS class_attendance(id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES classes(id), student_id INTEGER NOT NULL REFERENCES students(id), status TEXT NOT NULL, notes TEXT, marked_by TEXT, version INTEGER NOT NULL DEFAULT 1, voided_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(class_id,student_id))',
      'CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subject_id INTEGER REFERENCES subjects(id), subject TEXT, student_id INTEGER NOT NULL REFERENCES students(id), batch_id INTEGER REFERENCES batches(id), teacher_id INTEGER REFERENCES teachers(id), description TEXT, assigned_date TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'Assigned\', teacher_notes TEXT, submission_notes TEXT, submitted_at TEXT, archived_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS teacher_notes(id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES teachers(id), student_id INTEGER NOT NULL REFERENCES students(id), note TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT NOT NULL, announcement_date TEXT NOT NULL, priority TEXT NOT NULL DEFAULT \'Normal\', audience TEXT NOT NULL DEFAULT \'Everyone\', batch_id INTEGER REFERENCES batches(id), student_id INTEGER REFERENCES students(id), status TEXT NOT NULL DEFAULT \'Active\', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, owner_id INTEGER NOT NULL, student_id INTEGER, dedupe_key TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL, UNIQUE(role,owner_id,dedupe_key))',
      'CREATE TABLE IF NOT EXISTS private_documents(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER REFERENCES students(id), teacher_id INTEGER REFERENCES teachers(id), title TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, visibility TEXT NOT NULL DEFAULT \'Admin\', kind TEXT NOT NULL DEFAULT \'Document\', archived_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS admin_payment_files(id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id INTEGER NOT NULL REFERENCES payments(id), version INTEGER NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS request_keys(scope TEXT NOT NULL, key TEXT NOT NULL, body_hash TEXT NOT NULL, response TEXT NOT NULL, status_code INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(scope,key))',
      'CREATE TABLE IF NOT EXISTS import_previews(id TEXT PRIMARY KEY, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_by TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS backup_events(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS idx_classes_teacher_date ON classes(teacher_id,class_date)',
      'CREATE INDEX IF NOT EXISTS idx_classes_batch_date ON classes(batch_id,class_date)',
      'CREATE INDEX IF NOT EXISTS idx_classes_session ON classes(session_key)',
      'CREATE INDEX IF NOT EXISTS idx_class_attendance_student ON class_attendance(student_id,class_id)',
      'CREATE INDEX IF NOT EXISTS idx_assignments_student_due ON assignments(student_id,due_date)',
      'CREATE INDEX IF NOT EXISTS idx_assignments_teacher_due ON assignments(teacher_id,due_date)',
      'CREATE INDEX IF NOT EXISTS idx_tests_teacher_date ON tests(teacher_id,test_date)',
      'CREATE INDEX IF NOT EXISTS idx_batch_students_student ON batch_students(student_id,active)',
      'CREATE INDEX IF NOT EXISTS idx_students_search ON students(full_name,student_code)',
      'CREATE INDEX IF NOT EXISTS idx_payment_reference ON payments(transaction_reference)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(role,owner_id,read_at)',
      'CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type,entity_id,created_at)',
      'CREATE INDEX IF NOT EXISTS idx_auth_expiry ON auth_sessions(expires_at)',
      'CREATE VIEW IF NOT EXISTS v7_attendance AS SELECT ca.id,ca.class_id,ca.student_id,c.class_date attendance_date,ca.status,ca.notes,ca.marked_by,ca.created_at,ca.updated_at,\'class\' source FROM class_attendance ca JOIN classes c ON c.id=ca.class_id WHERE ca.voided_at IS NULL AND c.status IN (\'Completed\',\'Student Absent\') AND ca.status<>\'Class Cancelled\' UNION ALL SELECT a.id,NULL,a.student_id,a.attendance_date,a.status,a.notes,a.marked_by,a.created_at,a.updated_at,\'legacy\' FROM attendance a WHERE a.voided_at IS NULL AND a.status<>\'Class Cancelled\' AND NOT EXISTS(SELECT 1 FROM class_attendance ca JOIN classes c ON c.id=ca.class_id WHERE ca.student_id=a.student_id AND c.class_date=a.attendance_date AND ca.voided_at IS NULL)'
    ].join(';\n'));
    db.exec("CREATE VIEW IF NOT EXISTS v7_current_payments AS SELECT * FROM payments WHERE status='Current'; CREATE VIEW IF NOT EXISTS v7_current_fees AS SELECT * FROM fees WHERE voided_at IS NULL AND status<>'Waived'; CREATE VIEW IF NOT EXISTS v7_current_tests AS SELECT * FROM tests WHERE archived_at IS NULL AND status='Completed'");
    db.exec('UPDATE tests SET passing_marks=max_marks*0.4');
    const t=now();
    const defaults={academy_address:'',academy_phone:'8248590442',academy_email:'',timezone:'Asia/Kolkata',default_class_duration:'60',working_days:'1,2,3,4,5,6',grace_days:'7',course_warning_days:'7',default_hourly_rate:'500',receipt_prefix:'ALA',date_format:'DD/MM/YYYY',time_format:'12h',student_show_finance:'true',parent_show_finance:'true',notifications_enabled:'true',allow_multiple_guardians:'true',excel_auto_rebuild:'true'};
    for(const [k,v] of Object.entries(defaults))db.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)').run(k,v,t);
    // Migrate genuine subject values from preserved records; seed only on a new academy.
    const names=new Set(rows('SELECT subjects FROM students').flatMap(s=>String(s.subjects||'').split(/[,;|]/).map(x=>x.trim()).filter(Boolean)));
    if(!names.size)for(const n of ['Chemistry','Physics','Mathematics','Biology','English'])names.add(n);
    for(const n of names)db.prepare('INSERT OR IGNORE INTO subjects(name,created_at,updated_at) VALUES(?,?,?)').run(n,t,t);
    for(const p of rows("SELECT id FROM parent_accounts WHERE status='Disabled'"))db.prepare('UPDATE parent_accounts SET manual_disabled=1,purge_after=NULL WHERE id=?').run(p.id);
    db.prepare('INSERT INTO users(role,full_name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('ADMIN',admin.name,admin.email,hashPassword(admin.password),t,t);
    db.prepare('INSERT INTO schema_migrations(version,applied_at,description) VALUES(7,?,?)').run(t,'V7 additive academy modules and security; source rows retained');
    db.exec('PRAGMA user_version=7');
  });
};
