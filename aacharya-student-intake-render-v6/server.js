'use strict';

const express = require('./lib/mini-express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('./lib/xlsx-safe');
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
const EXCEL_PATH = path.join(DATA_DIR, 'Aacharya_Tuition_Master_v6.xlsx');
const PUBLIC_DIR = path.join(__dirname, 'public');
let integratedParentPortal = null;

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
function excelCol(n) { let s=''; for(n++; n; n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; }
function safeNumber(v) { const n=Number(v); return Number.isFinite(n) ? n : 0; }
function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(String(key||''))) return clean(key,20);
  const [y,m]=key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN',{month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(Date.UTC(y,m-1,1)));
}
function ageYears(dob) {
  if (!validDate(dob)) return '';
  const b=new Date(`${dob}T00:00:00Z`), n=new Date();
  let a=n.getUTCFullYear()-b.getUTCFullYear();
  const before=(n.getUTCMonth()<b.getUTCMonth())||(n.getUTCMonth()===b.getUTCMonth()&&n.getUTCDate()<b.getUTCDate());
  if(before)a--; return a>=0&&a<120?a:'';
}
function daysFromToday(date) {
  if(!validDate(date)) return '';
  const a=new Date(`${date}T00:00:00Z`), b=new Date();
  const today=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate());
  return Math.floor((today-a.getTime())/86400000);
}
function reportCell(v,type) {
  if(v==null)return'';
  if(type==='currency'||type==='number'||type==='integer') return Number.isFinite(Number(v))?Number(v):0;
  if(type==='percent') return Number.isFinite(Number(v))?Number(v)/100:0;
  return v;
}
function makeReportSheet({title,subtitle,columns,data,tabColor='4472C4',valueStyles={}}) {
  const width=Math.max(1,columns.length),end=excelCol(width-1);
  const outRows=[
    [title,...Array(width-1).fill('')],
    [subtitle,...Array(width-1).fill('')],
    ['Generated',new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),'Records',data.length,...Array(Math.max(0,width-4)).fill('')],
    Array(width).fill(''),
    columns.map(c=>c.label),
    ...data.map(r=>columns.map(c=>reportCell(typeof c.get==='function'?c.get(r):r[c.key],c.type)))
  ];
  if(!data.length)outRows.push(['No records available',...Array(width-1).fill('')]);
  const ws=XLSX.utils.aoa_to_sheet(outRows);
  setCols(ws,columns.map(c=>c.width||16));
  ws['!merges']=[`A1:${end}1`,`A2:${end}2`];
  ws['!freeze']={rows:5};
  ws['!autofilter']=`A5:${end}${Math.max(5,outRows.length)}`;
  ws['!rowStyles']={1:'title',2:'subtitle',3:'meta',5:'header'};
  ws['!rowHeights']={1:30,2:28,3:21,4:9,5:32};
  ws['!dataStartRow']=6;
  ws['!alternateRows']=true;
  ws['!colStyles']={};
  columns.forEach((c,i)=>{ws['!colStyles'][i]=c.type==='currency'?'currency':c.type==='percent'?'percent':c.type==='integer'?'integer':c.type==='number'?'number':'text';});
  ws['!valueStyles']={};
  for(const [key,map] of Object.entries(valueStyles)){
    const idx=columns.findIndex(c=>c.key===key); if(idx>=0)ws['!valueStyles'][idx]=map;
  }
  ws['!tabColor']=tabColor;
  ws['!showGridLines']=false;
  return ws;
}
function appendReport(wb,spec){XLSX.utils.book_append_sheet(wb,makeReportSheet(spec),spec.name);}

const V5_SHEET_CATALOG=[
  ['Workbook Guide','How to use the workbook, sheet map, privacy note and refresh information.'],
  ['Executive Dashboard','High-level academy KPIs, finance, attendance, admissions, dues, collections and upcoming classes.'],
  ['Student Master','Complete student record including contacts, school, parent details, fees, status and internal metadata.'],
  ['Student 360','One-row-per-student operational view combining classes, hours, attendance, finance and test performance.'],
  ['Parent Directory','Parent/guardian contact directory linked to each student.'],
  ['Academic Profiles','School, board, grade, stream and subject information for each student.'],
  ['Class Register','Every scheduled/completed class with times, duration, subject, topic, mode, notes and creator.'],
  ['Class Hours Summary','Student/subject totals for scheduled classes, completed classes and hours.'],
  ['Monthly Class Hours','Monthly student/subject class counts and hours.'],
  ['Attendance Register','Every attendance entry with status, notes and marked-by metadata.'],
  ['Attendance Summary','Lifetime student attendance counts and attendance percentage.'],
  ['Monthly Attendance','Monthly attendance analytics per student.'],
  ['Fee Register','Every fee record with linked payments, calculated balance, effective status and overdue aging.'],
  ['Payments Ledger','Complete receipt-level payment ledger including payer, relation, receiver, UTR/reference and billing period.'],
  ['Student Finance','Student-level billed, paid, balance, payment count and last payment view.'],
  ['Outstanding Dues','Students with positive balances, oldest due date and collection priority.'],
  ['Monthly Collections','Month-by-month collection totals, transaction counts and payment method split.'],
  ['Payment Methods','Collection totals and transaction shares by payment method.'],
  ['Test Register','Every test result with marks, percentage, grade and teacher remarks.'],
  ['Performance Summary','Student-level test count, average, best, lowest and latest performance.'],
  ['Subject Performance','Subject-level test volume, average, best, lowest and pass rate.'],
  ['Intake Submissions','Complete public admission/intake form history.'],
  ['Admissions Pipeline','Admissions status counts and latest activity by status.'],
  ['Data Quality','Potential missing/inconsistent data that may need administrator attention.'],
  ['Audit Log','System activity log for creates, edits, deletes, approvals and Excel rebuilds.'],
  ['System Settings','Non-secret application settings stored in the database.'],
  ['Data Dictionary','Plain-English field descriptions for the most important exported columns.']
];
const V5_SHEET_COUNT=V5_SHEET_CATALOG.length;
const V6_ADDON_SHEET_CATALOG=[
  ['Parent Accounts','Integrated parent portal accounts, status, last login and linked-child count.'],
  ['Parent Student Links','Parent-to-student permissions and relationships.'],
  ['Enrollments','All course enrollments with lifecycle status and grace dates.'],
  ['Course History','Ended course history for every student, including students who later rejoined.'],
  ['Old Records Alumni','True alumni only; rejoined/current students are excluded automatically.'],
  ['Payment Proofs','Compulsory parent payment screenshot/receipt proof metadata and verification status.'],
  ['Historical Payments','Superseded/deleted versions retained when administrators edit payments.'],
  ['Renewal Requests','Parent course-renewal requests and administrator decisions.'],
  ['Portal Activity','Integrated parent-portal activity from the shared audit trail.']
];
const V6_SHEET_CATALOG=[...V5_SHEET_CATALOG,...V6_ADDON_SHEET_CATALOG];
const V6_SHEET_COUNT=V6_SHEET_CATALOG.length;

function makeGuideSheet() {
  const rows=[
    ['AACHARYA LEARNING ACADEMY — V6 MASTER WORKBOOK','','','',''],
    ['Comprehensive operational export • generated automatically from the live tuition-manager database','','','',''],
    ['Generated',new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),'Workbook Version','6.0','Sheets',V6_SHEET_COUNT],
    [],
    ['IMPORTANT','This workbook can contain student/minor contact details and financial information. Keep it private and share only with authorised academy staff.','','','',''],
    [],
    ['SHEET','PURPOSE','TYPE','REFRESH','NOTES'],
    ...V6_SHEET_CATALOG.map(([name,desc],i)=>[name,desc,i<2?'Dashboard / Guide':i>=24?'System / Reference':'Operational / Analytics','Automatic after data changes','Use Excel filters on detailed registers.']),
    [],
    ['HOW TO USE','','','',''],
    ['1','Start with Executive Dashboard for academy-wide KPIs.','','',''],
    ['2','Use Student 360 when you need one comprehensive row per student.','','',''],
    ['3','Use detailed Registers for source-level records; filters are enabled on every register.','','',''],
    ['4','Use Student Finance / Outstanding Dues / Monthly Collections for finance follow-up.','','',''],
    ['5','Use Data Quality before reporting to identify missing or inconsistent records.','','','']
  ];
  const ws=XLSX.utils.aoa_to_sheet(rows);setCols(ws,[28,72,24,26,44,14]);
  ws['!merges']=['A1:F1','A2:F2','A5:F5','A45:F45'];
  ws['!rowStyles']={1:'title',2:'subtitle',3:'meta',5:'note',7:'header',45:'section'};
  ws['!rowHeights']={1:32,2:28,5:38,7:30,45:26};
  ws['!freeze']={rows:7};ws['!autofilter']=`A7:E${7+V6_SHEET_CATALOG.length}`;ws['!dataStartRow']=8;ws['!alternateRows']=true;
  ws['!colStyles']={0:'text',1:'text',2:'text',3:'text',4:'text',5:'integer'};ws['!tabColor']='17365D';ws['!showGridLines']=false;return ws;
}

function makeDashboardSheet(ctx) {
  const {stats,attendanceStats,totalBilled,totalPaid,totalBalance,totalCompletedHours,avgTestPct,newIntakes,acceptedIntakes,rejectedIntakes,qualityIssues,topDues,recentPayments,upcomingClasses}=ctx;
  const attPct=(attendanceStats.total-attendanceStats.excused)>0?100*(attendanceStats.present+attendanceStats.late)/(attendanceStats.total-attendanceStats.excused):0;
  const rows=[];const styles={},merges=[],heights={};
  const push=(r,style)=>{rows.push(r);if(style)styles[rows.length]=style;return rows.length};
  const blank=()=>push(Array(10).fill(''));
  let r=push(['AACHARYA LEARNING ACADEMY — EXECUTIVE DASHBOARD',...Array(9).fill('')],'title');merges.push(`A${r}:J${r}`);heights[r]=34;
  r=push(['V6 integrated academy snapshot • automatically regenerated from live data',...Array(9).fill('')],'subtitle');merges.push(`A${r}:J${r}`);heights[r]=28;
  push(['Generated',new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),'Academic Year',one("SELECT value FROM settings WHERE key='academic_year'")?.value||'','Workbook Sheets',V6_SHEET_COUNT,'','','',''],'meta');blank();
  r=push(['KEY PERFORMANCE INDICATORS',...Array(9).fill('')],'section');merges.push(`A${r}:J${r}`);
  r=push(['Total Students','','Active Students','','Total Classes','','Completed Hours','','Attendance %',''],'kpiLabel');for(let c=0;c<10;c+=2)merges.push(`${excelCol(c)}${r}:${excelCol(c+1)}${r}`);
  r=push([stats.total_students||0,'',stats.active_students||0,'',stats.total_classes||0,'',totalCompletedHours||0,'',`${attPct.toFixed(1)}%`,''],'kpiValue');for(let c=0;c<10;c+=2)merges.push(`${excelCol(c)}${r}:${excelCol(c+1)}${r}`);heights[r]=34;blank();
  r=push(['FINANCIAL SNAPSHOT',...Array(9).fill('')],'section');merges.push(`A${r}:J${r}`);
  r=push(['Fees Billed','','Payments Collected','','Outstanding Balance','','Payment Records','','Avg Payment',''],'kpiLabel');for(let c=0;c<10;c+=2)merges.push(`${excelCol(c)}${r}:${excelCol(c+1)}${r}`);
  const inr=v=>'₹'+safeNumber(v).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
  r=push([inr(totalBilled),'',inr(totalPaid),'',inr(totalBalance),'',stats.payment_count||0,'',inr(stats.payment_count?totalPaid/stats.payment_count:0),''],'kpiValue');for(let c=0;c<10;c+=2)merges.push(`${excelCol(c)}${r}:${excelCol(c+1)}${r}`);heights[r]=34;blank();
  r=push(['ACADEMIC & ADMISSIONS',...Array(9).fill('')],'section');merges.push(`A${r}:J${r}`);
  r=push(['Average Test %','','Tests Recorded','','New Admissions','','Accepted Admissions','','Data Quality Flags',''],'kpiLabel');for(let c=0;c<10;c+=2)merges.push(`${excelCol(c)}${r}:${excelCol(c+1)}${r}`);
  r=push([`${avgTestPct.toFixed(1)}%`,'',stats.test_count||0,'',newIntakes,'',acceptedIntakes,'',qualityIssues.length,''],'kpiValue');for(let c=0;c<10;c+=2)merges.push(`${excelCol(c)}${r}:${excelCol(c+1)}${r}`);heights[r]=34;blank();
  r=push(['TOP OUTSTANDING BALANCES',...Array(9).fill('')],'section');merges.push(`A${r}:J${r}`);
  let header=push(['Student Code','Student','Fee Plan','Fees Billed','Total Paid','Balance','Oldest Due','Last Payment','Priority','Status'],'header');
  for(const x of topDues.slice(0,10))push([x.student_code,x.student,inr(x.current_fee_plan),inr(x.fees_billed),inr(x.total_paid),inr(x.pending_balance),x.oldest_due_date||'',x.last_payment_date||'',x.priority,x.status]);
  if(!topDues.length)push(['No outstanding balances','','','','','','','','','']);blank();
  r=push(['RECENT COLLECTIONS',...Array(9).fill('')],'section');merges.push(`A${r}:J${r}`);
  push(['Receipt','Student','Paid By','Relation','Amount','Date','Method','Reference','Received By','Billing Period'],'header');
  for(const x of recentPayments.slice(0,10))push([x.receipt_no,x.student,x.payer_name,x.payer_relation,inr(x.amount),x.payment_date,x.method,x.transaction_reference,x.received_by,x.billing_period]);
  if(!recentPayments.length)push(['No payments yet','','','','','','','','','']);blank();
  r=push(['UPCOMING CLASSES',...Array(9).fill('')],'section');merges.push(`A${r}:J${r}`);
  push(['Date','Start','End','Student','Subject','Topic','Mode','Duration','Status','Notes'],'header');
  for(const x of upcomingClasses.slice(0,12))push([x.class_date,x.start_time,x.end_time,x.student,x.subject,x.topic,x.mode,x.duration_hours,x.status,x.notes]);
  if(!upcomingClasses.length)push(['No upcoming classes','','','','','','','','','']);
  const ws=XLSX.utils.aoa_to_sheet(rows);setCols(ws,[16,24,20,18,16,20,18,22,18,32]);ws['!merges']=merges;ws['!rowStyles']=styles;ws['!rowHeights']=heights;ws['!freeze']={rows:3};ws['!tabColor']='17365D';ws['!showGridLines']=false;
  ws['!colStyles']={0:'text',1:'text',2:'text',3:'text',4:'text',5:'text',6:'text',7:'text',8:'text',9:'text'};
  ws['!valueStyles']={8:{High:'bad',Medium:'warn',Low:'good',Active:'good',Overdue:'bad'}};
  return ws;
}

function buildDataQuality({students,classes,attendance,fees,payments,tests}) {
  const issues=[];
  const add=(severity,category,studentCode,student,entity,entityId,issue,action)=>issues.push({severity,category,student_code:studentCode||'',student:student||'',entity,entity_id:entityId??'',issue,recommended_action:action});
  const clsBy=new Map(),attBy=new Map(),feeBy=new Map();
  for(const c of classes)clsBy.set(c.student_code,(clsBy.get(c.student_code)||0)+1);
  for(const a of attendance)attBy.set(a.student_code,(attBy.get(a.student_code)||0)+1);
  for(const f of fees)feeBy.set(f.student_code,(feeBy.get(f.student_code)||0)+1);
  for(const s of students){
    if(!s.phone&&!s.email)add('High','Student Contact',s.student_code,s.full_name,'student',s.id,'No student phone or email recorded.','Add at least one reliable student contact method.');
    if(!s.parent_phone&&!s.parent_email)add('High','Parent Contact',s.student_code,s.full_name,'student',s.id,'No parent/guardian phone or email recorded.','Add a parent/guardian contact method.');
    if(!s.school)add('Low','Academic Profile',s.student_code,s.full_name,'student',s.id,'School/college is blank.','Add school/college if applicable.');
    if(!s.board)add('Low','Academic Profile',s.student_code,s.full_name,'student',s.id,'Board is blank.','Add CBSE/ICSE/State/other board.');
    if(s.status==='Active'&&!clsBy.get(s.student_code))add('Medium','Classes',s.student_code,s.full_name,'student',s.id,'Active student has no class records.','Schedule or import the student classes.');
    if(s.status==='Active'&&!attBy.get(s.student_code))add('Medium','Attendance',s.student_code,s.full_name,'student',s.id,'Active student has no attendance records.','Start marking attendance.');
    if(s.status==='Active'&&!feeBy.get(s.student_code)&&safeNumber(s.fee_plan_amount)>0)add('Medium','Fees',s.student_code,s.full_name,'student',s.id,'Fee plan exists but no fee register entry has been created.','Create the billing-period fee record.');
  }
  for(const c of classes)if(c.status==='Completed'&&safeNumber(c.duration_hours)<=0)add('Medium','Classes',c.student_code,c.student,'class',c.id,'Completed class has zero duration.','Check start/end times and class completion.');
  for(const f of fees)if(!f.due_date)add('Low','Fees',f.student_code,f.student,'fee',f.id,'Fee record has no due date.','Add a due date for better overdue tracking.');
  for(const p of payments)if(!/cash/i.test(p.method||'')&&!p.transaction_reference)add('Medium','Payments',p.student_code,p.student,'payment',p.id,'Electronic payment has no transaction/UTR reference.','Add the transaction reference for verification.');
  for(const t of tests)if(safeNumber(t.max_marks)<=0)add('High','Tests',t.student_code,t.student,'test',t.id,'Test maximum marks is zero/invalid.','Correct the maximum marks.');
  return issues;
}

function rebuildWorkbook() {
  const wb=XLSX.utils.book_new();
  const stats=one(`SELECT
    (SELECT COUNT(*) FROM students WHERE status='Active') active_students,
    (SELECT COUNT(*) FROM students) total_students,
    (SELECT COUNT(*) FROM classes) total_classes,
    (SELECT COUNT(*) FROM classes WHERE status='Completed') completed_classes,
    (SELECT COUNT(*) FROM payments) payment_count,
    (SELECT COUNT(*) FROM tests) test_count`);
  const attendanceStats=one(`SELECT COUNT(*) total,
    COALESCE(SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END),0) present,
    COALESCE(SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END),0) absent,
    COALESCE(SUM(CASE WHEN status='Late' THEN 1 ELSE 0 END),0) late,
    COALESCE(SUM(CASE WHEN status='Excused' THEN 1 ELSE 0 END),0) excused FROM attendance`);

  const studentRaw=rows(`SELECT s.id,s.student_code,s.full_name,s.dob,s.gender,s.school,s.board,s.grade,s.stream,s.joining_date,s.phone,s.email,s.address,s.parent_name,s.parent_phone,s.parent_email,s.subjects,s.fee_plan_amount,s.status,s.notes,s.intake_submission_id,s.created_at,s.updated_at FROM students s WHERE NOT (EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id) AND NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status IN ('Upcoming','Active','Grace'))) ORDER BY s.full_name`);
  const classRaw=rows(`SELECT c.id,s.student_code,s.full_name student,c.student_id,c.class_date,c.start_time,c.end_time,c.duration_hours,c.subject,c.topic,c.mode,c.status,c.notes,c.created_by,c.created_at,c.updated_at FROM classes c JOIN students s ON s.id=c.student_id ORDER BY c.class_date DESC,c.start_time DESC`);
  const attendanceRaw=rows(`SELECT a.id,s.student_code,s.full_name student,a.student_id,a.attendance_date,a.status,a.notes,a.marked_by,a.created_at,a.updated_at FROM attendance a JOIN students s ON s.id=a.student_id ORDER BY a.attendance_date DESC,s.full_name`);
  const feeRaw=rows(`SELECT f.id,s.student_code,s.full_name student,f.student_id,f.billing_type,f.amount,f.billing_period,f.due_date,f.total_hours_included,f.status,f.notes,f.created_at,f.updated_at,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.fee_id=f.id),0) linked_paid
    FROM fees f JOIN students s ON s.id=f.student_id ORDER BY COALESCE(f.due_date,'9999-12-31') DESC,f.id DESC`).map(f=>{
      const balance=Math.max(0,safeNumber(f.amount)-safeNumber(f.linked_paid)),age=f.due_date?daysFromToday(f.due_date):'';
      const effective=balance<=0?'Paid':safeNumber(f.linked_paid)>0?(age!==''&&age>0?'Overdue - Partial':'Partially Paid'):(age!==''&&age>0?'Overdue':(f.status||'Pending'));
      const bucket=age===''?'No due date':age<=0?'Not due':age<=7?'1-7 days':age<=30?'8-30 days':age<=60?'31-60 days':'60+ days';
      return {...f,balance,effective_status:effective,overdue_days:typeof age==='number'&&age>0?age:0,aging_bucket:bucket};
    });
  const paymentRaw=rows(`SELECT p.id,p.receipt_no,s.student_code,s.full_name student,p.student_id,p.fee_id,p.payer_name,p.payer_relation,p.amount,p.payment_date,p.method,p.transaction_reference,p.billing_period,p.received_by,p.notes,p.created_at FROM payments p JOIN students s ON s.id=p.student_id ORDER BY p.payment_date DESC,p.id DESC`);
  const testRaw=rows(`SELECT t.id,s.student_code,s.full_name student,t.student_id,t.test_name,t.subject,t.test_date,t.marks_obtained,t.max_marks,t.percentage,t.grade,t.teacher_remarks,t.created_at FROM tests t JOIN students s ON s.id=t.student_id ORDER BY t.test_date DESC,t.id DESC`);
  const intakeRaw=rows(`SELECT id,student_name,dob,gender,grade,school,board,student_phone,student_email,parent_name,parent_phone,parent_email,subjects,preferred_mode,address,notes,status,submitted_at,accepted_student_id FROM intake_submissions ORDER BY submitted_at DESC`);

  const studentFinance=rows(`SELECT s.id,s.student_code,s.full_name student,s.status,s.grade,s.subjects,s.fee_plan_amount current_fee_plan,
    COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.student_id=s.id),0) fees_billed,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id),0) total_paid,
    (SELECT COUNT(*) FROM payments p WHERE p.student_id=s.id) payment_count,
    (SELECT MAX(p.payment_date) FROM payments p WHERE p.student_id=s.id) last_payment_date,
    (SELECT MIN(f.due_date) FROM fees f WHERE f.student_id=s.id AND f.due_date IS NOT NULL AND f.amount>COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.fee_id=f.id),0)) oldest_due_date
    FROM students s WHERE NOT (EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id) AND NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status IN ('Upcoming','Active','Grace'))) ORDER BY s.full_name`).map(x=>({...x,pending_balance:Math.max(0,safeNumber(x.fees_billed)-safeNumber(x.total_paid)),credit_balance:Math.max(0,safeNumber(x.total_paid)-safeNumber(x.fees_billed))}));
  const financeByCode=new Map(studentFinance.map(x=>[x.student_code,x]));
  const student360=studentRaw.map(s=>{
    const f=financeByCode.get(s.student_code)||{};
    const classes=classRaw.filter(x=>x.student_code===s.student_code),att=attendanceRaw.filter(x=>x.student_code===s.student_code),tests=testRaw.filter(x=>x.student_code===s.student_code);
    const relevant=att.filter(a=>a.status!=='Excused'),good=relevant.filter(a=>a.status==='Present'||a.status==='Late').length;
    const completed=classes.filter(c=>c.status==='Completed');
    const sortedTests=[...tests].sort((a,b)=>(b.test_date||'').localeCompare(a.test_date||''));
    return {student_code:s.student_code,student:s.full_name,status:s.status,grade:s.grade,subjects:s.subjects,school:s.school,board:s.board,parent_name:s.parent_name,parent_phone:s.parent_phone,student_phone:s.phone,joining_date:s.joining_date,age:ageYears(s.dob),fee_plan_amount:s.fee_plan_amount,fees_billed:f.fees_billed||0,total_paid:f.total_paid||0,pending_balance:f.pending_balance||0,last_payment_date:f.last_payment_date||'',total_classes:classes.length,completed_classes:completed.length,completed_hours:completed.reduce((a,c)=>a+safeNumber(c.duration_hours),0),upcoming_classes:classes.filter(c=>c.status==='Scheduled'&&c.class_date>=nowIso().slice(0,10)).length,attendance_entries:att.length,present:att.filter(a=>a.status==='Present').length,absent:att.filter(a=>a.status==='Absent').length,late:att.filter(a=>a.status==='Late').length,attendance_percentage:relevant.length?100*good/relevant.length:0,tests_recorded:tests.length,average_test_percentage:tests.length?tests.reduce((a,t)=>a+safeNumber(t.percentage),0)/tests.length:0,best_test_percentage:tests.length?Math.max(...tests.map(t=>safeNumber(t.percentage))):0,latest_test_percentage:sortedTests[0]?.percentage||0,latest_grade:sortedTests[0]?.grade||'',intake_submission_id:s.intake_submission_id||''};
  });
  const classHours=rows(`SELECT s.student_code,s.full_name student,COALESCE(c.subject,'No classes') subject,
    COUNT(c.id) total_classes,
    COALESCE(SUM(CASE WHEN c.status='Completed' THEN 1 ELSE 0 END),0) completed_classes,
    COALESCE(SUM(CASE WHEN c.status='Scheduled' THEN 1 ELSE 0 END),0) scheduled_classes,
    COALESCE(SUM(CASE WHEN c.status='Cancelled' THEN 1 ELSE 0 END),0) cancelled_classes,
    ROUND(COALESCE(SUM(c.duration_hours),0),2) planned_hours,
    ROUND(COALESCE(SUM(CASE WHEN c.status='Completed' THEN c.duration_hours ELSE 0 END),0),2) completed_hours,
    MAX(CASE WHEN c.status='Completed' THEN c.class_date END) last_completed_class,
    MIN(CASE WHEN c.status='Scheduled' AND c.class_date>=date('now') THEN c.class_date END) next_scheduled_class
    FROM students s LEFT JOIN classes c ON c.student_id=s.id GROUP BY s.id,c.subject ORDER BY s.full_name,c.subject`);
  const monthlyHours=rows(`SELECT substr(c.class_date,1,7) month,s.student_code,s.full_name student,c.subject,
    COUNT(*) class_count,
    SUM(CASE WHEN c.status='Completed' THEN 1 ELSE 0 END) completed_classes,
    ROUND(SUM(c.duration_hours),2) planned_hours,
    ROUND(SUM(CASE WHEN c.status='Completed' THEN c.duration_hours ELSE 0 END),2) completed_hours
    FROM classes c JOIN students s ON s.id=c.student_id GROUP BY substr(c.class_date,1,7),s.id,c.subject ORDER BY month DESC,s.full_name,c.subject`).map(x=>({...x,month_label:monthLabel(x.month)}));
  const attendanceSummary=rows(`SELECT s.id student_id,s.student_code,s.full_name student,
    COUNT(a.id) total_entries,
    COALESCE(SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END),0) present,
    COALESCE(SUM(CASE WHEN a.status='Absent' THEN 1 ELSE 0 END),0) absent,
    COALESCE(SUM(CASE WHEN a.status='Late' THEN 1 ELSE 0 END),0) late,
    COALESCE(SUM(CASE WHEN a.status='Excused' THEN 1 ELSE 0 END),0) excused,
    ROUND(CASE WHEN SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END)=0 THEN 0 ELSE 100.0*SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)/SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END) END,1) attendance_percentage,
    MAX(a.attendance_date) last_attendance_date
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id GROUP BY s.id ORDER BY s.full_name`);
  const monthlyAttendance=rows(`SELECT substr(a.attendance_date,1,7) month,s.student_code,s.full_name student,
    COUNT(*) entries,
    SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) present,
    SUM(CASE WHEN a.status='Absent' THEN 1 ELSE 0 END) absent,
    SUM(CASE WHEN a.status='Late' THEN 1 ELSE 0 END) late,
    SUM(CASE WHEN a.status='Excused' THEN 1 ELSE 0 END) excused,
    ROUND(CASE WHEN SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END)=0 THEN 0 ELSE 100.0*SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)/SUM(CASE WHEN a.status!='Excused' THEN 1 ELSE 0 END) END,1) attendance_percentage
    FROM attendance a JOIN students s ON s.id=a.student_id GROUP BY substr(a.attendance_date,1,7),s.id ORDER BY month DESC,s.full_name`).map(x=>({...x,month_label:monthLabel(x.month)}));
  const monthlyCollections=rows(`SELECT substr(payment_date,1,7) month,COUNT(*) transactions,COUNT(DISTINCT student_id) students_paying,
    ROUND(SUM(amount),2) total_collected,ROUND(AVG(amount),2) average_payment,
    ROUND(SUM(CASE WHEN lower(method)='cash' THEN amount ELSE 0 END),2) cash,
    ROUND(SUM(CASE WHEN lower(method)='gpay' THEN amount ELSE 0 END),2) gpay,
    ROUND(SUM(CASE WHEN lower(method)='phonepe' THEN amount ELSE 0 END),2) phonepe,
    ROUND(SUM(CASE WHEN lower(method)='upi' THEN amount ELSE 0 END),2) upi,
    ROUND(SUM(CASE WHEN lower(method) LIKE '%bank%' THEN amount ELSE 0 END),2) bank_transfer,
    ROUND(SUM(CASE WHEN lower(method) NOT IN ('cash','gpay','phonepe','upi') AND lower(method) NOT LIKE '%bank%' THEN amount ELSE 0 END),2) other
    FROM payments GROUP BY substr(payment_date,1,7) ORDER BY month DESC`).map(x=>({...x,month_label:monthLabel(x.month)}));
  const methodSummary=rows(`SELECT method,COUNT(*) transactions,COUNT(DISTINCT student_id) unique_students,ROUND(SUM(amount),2) total_collected,ROUND(AVG(amount),2) average_transaction FROM payments GROUP BY method ORDER BY total_collected DESC`);
  const grandPaid=paymentRaw.reduce((a,p)=>a+safeNumber(p.amount),0);methodSummary.forEach(x=>x.collection_share=grandPaid?100*safeNumber(x.total_collected)/grandPaid:0);
  const performance=rows(`SELECT s.student_code,s.full_name student,COUNT(t.id) tests_recorded,
    ROUND(COALESCE(AVG(t.percentage),0),1) average_percentage,
    ROUND(COALESCE(MAX(t.percentage),0),1) best_percentage,
    ROUND(COALESCE(MIN(t.percentage),0),1) lowest_percentage,
    MAX(t.test_date) latest_test_date
    FROM students s LEFT JOIN tests t ON t.student_id=s.id GROUP BY s.id ORDER BY s.full_name`).map(x=>{
      const latest=testRaw.filter(t=>t.student_code===x.student_code).sort((a,b)=>(b.test_date||'').localeCompare(a.test_date||''))[0];return{...x,latest_percentage:latest?.percentage||0,latest_grade:latest?.grade||''};
    });
  const subjectPerf=rows(`SELECT COALESCE(subject,'Unspecified') subject,COUNT(*) tests_recorded,COUNT(DISTINCT student_id) students_tested,
    ROUND(AVG(percentage),1) average_percentage,ROUND(MAX(percentage),1) best_percentage,ROUND(MIN(percentage),1) lowest_percentage,
    ROUND(100.0*SUM(CASE WHEN percentage>=40 THEN 1 ELSE 0 END)/COUNT(*),1) pass_rate
    FROM tests GROUP BY COALESCE(subject,'Unspecified') ORDER BY average_percentage DESC`);
  const admissions=rows(`SELECT status,COUNT(*) submissions,MAX(submitted_at) latest_submission,COUNT(accepted_student_id) linked_students FROM intake_submissions GROUP BY status ORDER BY submissions DESC`);
  const auditRows=rows(`SELECT id,action,entity_type,entity_id,details,actor,created_at FROM audit_log ORDER BY id DESC`);
  const settingsRows=rows('SELECT key,value,updated_at FROM settings ORDER BY key');
  const qualityIssues=buildDataQuality({students:studentRaw,classes:classRaw,attendance:attendanceRaw,fees:feeRaw,payments:paymentRaw,tests:testRaw});
  const totalBilled=studentFinance.reduce((a,x)=>a+safeNumber(x.fees_billed),0),totalPaid=grandPaid,totalBalance=Math.max(0,totalBilled-totalPaid);
  const totalCompletedHours=classRaw.filter(c=>c.status==='Completed').reduce((a,c)=>a+safeNumber(c.duration_hours),0);
  const avgTestPct=testRaw.length?testRaw.reduce((a,t)=>a+safeNumber(t.percentage),0)/testRaw.length:0;
  const topDues=studentFinance.filter(x=>x.pending_balance>0).map(x=>({...x,priority:x.oldest_due_date&&daysFromToday(x.oldest_due_date)>30?'High':x.oldest_due_date&&daysFromToday(x.oldest_due_date)>0?'Medium':'Low',status:x.oldest_due_date&&daysFromToday(x.oldest_due_date)>0?'Overdue':'Pending'})).sort((a,b)=>b.pending_balance-a.pending_balance);
  const recentPayments=paymentRaw.slice(0,12);
  const upcomingClasses=classRaw.filter(c=>c.status==='Scheduled'&&c.class_date>=nowIso().slice(0,10)).sort((a,b)=>(a.class_date+a.start_time).localeCompare(b.class_date+b.start_time));
  const newIntakes=intakeRaw.filter(x=>x.status==='New').length,acceptedIntakes=intakeRaw.filter(x=>x.status==='Accepted').length,rejectedIntakes=intakeRaw.filter(x=>x.status==='Rejected').length;

  XLSX.utils.book_append_sheet(wb,makeGuideSheet(),'Workbook Guide');
  XLSX.utils.book_append_sheet(wb,makeDashboardSheet({stats,attendanceStats,totalBilled,totalPaid,totalBalance,totalCompletedHours,avgTestPct,newIntakes,acceptedIntakes,rejectedIntakes,qualityIssues,topDues,recentPayments,upcomingClasses}),'Executive Dashboard');

  const studentCols=[
    ['id','Database ID','integer',10],['student_code','Student Code','text',16],['full_name','Full Name','text',26],['dob','Date of Birth','text',14],['age','Age','integer',9],['gender','Gender','text',12],['school','School / College','text',28],['board','Board','text',15],['grade','Class / Grade','text',15],['stream','Stream','text',16],['joining_date','Joining Date','text',14],['phone','Student Phone','text',18],['email','Student Email','text',30],['address','Address','text',40],['parent_name','Parent / Guardian','text',26],['parent_phone','Parent Phone','text',18],['parent_email','Parent Email','text',30],['subjects','Subjects','text',34],['fee_plan_amount','Fee Plan','currency',16],['status','Status','text',14],['notes','Notes','text',42],['intake_submission_id','Intake Submission ID','text',28],['created_at','Created At','text',24],['updated_at','Updated At','text',24]
  ].map(([key,label,type,width])=>({key,label,type,width,get:key==='age'?r=>ageYears(r.dob):undefined}));
  appendReport(wb,{name:'Student Master',title:'STUDENT MASTER',subtitle:'Complete source-level student records and contact information.',columns:studentCols,data:studentRaw,tabColor:'4472C4',valueStyles:{status:{Active:'good',Inactive:'warn',Completed:'softHeader','On Hold':'warn'}}});
  appendReport(wb,{name:'Student 360',title:'STUDENT 360° VIEW',subtitle:'Combined academic, attendance, class-hour, fee and test metrics — one row per student.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'status',label:'Status',width:14},{key:'grade',label:'Grade',width:14},{key:'subjects',label:'Subjects',width:32},{key:'school',label:'School',width:26},{key:'board',label:'Board',width:14},{key:'parent_name',label:'Parent / Guardian',width:24},{key:'parent_phone',label:'Parent Phone',width:18},{key:'student_phone',label:'Student Phone',width:18},{key:'joining_date',label:'Joining Date',width:14},{key:'age',label:'Age',type:'integer',width:8},{key:'fee_plan_amount',label:'Current Fee Plan',type:'currency',width:16},{key:'fees_billed',label:'Fees Billed',type:'currency',width:16},{key:'total_paid',label:'Total Paid',type:'currency',width:16},{key:'pending_balance',label:'Pending Balance',type:'currency',width:18},{key:'last_payment_date',label:'Last Payment',width:14},{key:'total_classes',label:'Total Classes',type:'integer',width:14},{key:'completed_classes',label:'Completed Classes',type:'integer',width:17},{key:'completed_hours',label:'Completed Hours',type:'number',width:16},{key:'upcoming_classes',label:'Upcoming Classes',type:'integer',width:16},{key:'attendance_entries',label:'Attendance Entries',type:'integer',width:17},{key:'present',label:'Present',type:'integer',width:10},{key:'absent',label:'Absent',type:'integer',width:10},{key:'late',label:'Late',type:'integer',width:10},{key:'attendance_percentage',label:'Attendance %',type:'percent',width:15},{key:'tests_recorded',label:'Tests',type:'integer',width:10},{key:'average_test_percentage',label:'Average Test %',type:'percent',width:16},{key:'best_test_percentage',label:'Best Test %',type:'percent',width:14},{key:'latest_test_percentage',label:'Latest Test %',type:'percent',width:15},{key:'latest_grade',label:'Latest Grade',width:14},{key:'intake_submission_id',label:'Intake ID',width:28}
  ],data:student360,tabColor:'2F75B5',valueStyles:{status:{Active:'good',Inactive:'warn',Completed:'softHeader','On Hold':'warn'}}});
  appendReport(wb,{name:'Parent Directory',title:'PARENT / GUARDIAN DIRECTORY',subtitle:'Parent contact details with linked student information.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'full_name',label:'Student',width:26},{key:'grade',label:'Grade',width:14},{key:'parent_name',label:'Parent / Guardian',width:26},{key:'parent_phone',label:'Parent Phone',width:18},{key:'parent_email',label:'Parent Email',width:30},{key:'phone',label:'Student Phone',width:18},{key:'email',label:'Student Email',width:30},{key:'address',label:'Address',width:42},{key:'status',label:'Student Status',width:14}
  ],data:studentRaw,tabColor:'5B9BD5',valueStyles:{status:{Active:'good',Inactive:'warn',Completed:'softHeader'}}});
  appendReport(wb,{name:'Academic Profiles',title:'ACADEMIC PROFILES',subtitle:'Academic placement, institution and subject information.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'full_name',label:'Student',width:26},{key:'school',label:'School / College',width:30},{key:'board',label:'Board',width:16},{key:'grade',label:'Class / Grade',width:16},{key:'stream',label:'Stream',width:18},{key:'subjects',label:'Subjects',width:36},{key:'joining_date',label:'Joining Date',width:14},{key:'status',label:'Status',width:14},{key:'notes',label:'Notes',width:42}
  ],data:studentRaw,tabColor:'5B9BD5',valueStyles:{status:{Active:'good',Inactive:'warn',Completed:'softHeader'}}});
  appendReport(wb,{name:'Class Register',title:'CLASS REGISTER',subtitle:'Complete class schedule and completion history.',columns:[
    {key:'id',label:'Class ID',type:'integer',width:10},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'class_date',label:'Date',width:14},{key:'start_time',label:'Start',width:10},{key:'end_time',label:'End',width:10},{key:'duration_hours',label:'Duration Hours',type:'number',width:15},{key:'subject',label:'Subject',width:20},{key:'topic',label:'Topic',width:34},{key:'mode',label:'Mode',width:12},{key:'status',label:'Status',width:14},{key:'notes',label:'Notes',width:38},{key:'created_by',label:'Created By',width:22},{key:'created_at',label:'Created At',width:24},{key:'updated_at',label:'Updated At',width:24}
  ],data:classRaw,tabColor:'70AD47',valueStyles:{status:{Completed:'good',Scheduled:'warn',Cancelled:'bad',Rescheduled:'warn','Student Absent':'bad','Teacher Absent':'bad'}}});
  appendReport(wb,{name:'Class Hours Summary',title:'CLASS HOURS SUMMARY',subtitle:'Student and subject level class counts and hour totals.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'subject',label:'Subject',width:22},{key:'total_classes',label:'Total Classes',type:'integer',width:14},{key:'completed_classes',label:'Completed',type:'integer',width:13},{key:'scheduled_classes',label:'Scheduled',type:'integer',width:13},{key:'cancelled_classes',label:'Cancelled',type:'integer',width:13},{key:'planned_hours',label:'Planned Hours',type:'number',width:15},{key:'completed_hours',label:'Completed Hours',type:'number',width:16},{key:'last_completed_class',label:'Last Completed',width:15},{key:'next_scheduled_class',label:'Next Scheduled',width:15}
  ],data:classHours,tabColor:'70AD47'});
  appendReport(wb,{name:'Monthly Class Hours',title:'MONTHLY CLASS HOURS',subtitle:'Monthly student/subject workload and completion hours.',columns:[
    {key:'month',label:'Month Key',width:12},{key:'month_label',label:'Month',width:16},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'subject',label:'Subject',width:22},{key:'class_count',label:'Classes',type:'integer',width:11},{key:'completed_classes',label:'Completed',type:'integer',width:13},{key:'planned_hours',label:'Planned Hours',type:'number',width:15},{key:'completed_hours',label:'Completed Hours',type:'number',width:16}
  ],data:monthlyHours,tabColor:'70AD47'});
  appendReport(wb,{name:'Attendance Register',title:'ATTENDANCE REGISTER',subtitle:'Every attendance entry with the administrator/teacher who marked it.',columns:[
    {key:'id',label:'Attendance ID',type:'integer',width:14},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'attendance_date',label:'Date',width:14},{key:'status',label:'Status',width:13},{key:'notes',label:'Notes',width:38},{key:'marked_by',label:'Marked By',width:22},{key:'created_at',label:'Created At',width:24},{key:'updated_at',label:'Updated At',width:24}
  ],data:attendanceRaw,tabColor:'00B0F0',valueStyles:{status:{Present:'good',Late:'warn',Absent:'bad',Excused:'softHeader'}}});
  appendReport(wb,{name:'Attendance Summary',title:'ATTENDANCE SUMMARY',subtitle:'Lifetime attendance counts and percentage per student.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'total_entries',label:'Entries',type:'integer',width:11},{key:'present',label:'Present',type:'integer',width:11},{key:'absent',label:'Absent',type:'integer',width:11},{key:'late',label:'Late',type:'integer',width:11},{key:'excused',label:'Excused',type:'integer',width:11},{key:'attendance_percentage',label:'Attendance %',type:'percent',width:16},{key:'last_attendance_date',label:'Last Attendance',width:16}
  ],data:attendanceSummary,tabColor:'00B0F0'});
  appendReport(wb,{name:'Monthly Attendance',title:'MONTHLY ATTENDANCE',subtitle:'Month-by-month attendance performance per student.',columns:[
    {key:'month',label:'Month Key',width:12},{key:'month_label',label:'Month',width:16},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'entries',label:'Entries',type:'integer',width:10},{key:'present',label:'Present',type:'integer',width:10},{key:'absent',label:'Absent',type:'integer',width:10},{key:'late',label:'Late',type:'integer',width:10},{key:'excused',label:'Excused',type:'integer',width:10},{key:'attendance_percentage',label:'Attendance %',type:'percent',width:16}
  ],data:monthlyAttendance,tabColor:'00B0F0'});
  appendReport(wb,{name:'Fee Register',title:'FEE REGISTER',subtitle:'All fee bills with linked payments, calculated outstanding balance and aging.',columns:[
    {key:'id',label:'Fee ID',type:'integer',width:10},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'billing_type',label:'Billing Type',width:15},{key:'amount',label:'Fee Amount',type:'currency',width:16},{key:'billing_period',label:'Billing Period',width:20},{key:'due_date',label:'Due Date',width:14},{key:'total_hours_included',label:'Hours Included',type:'number',width:15},{key:'linked_paid',label:'Linked Paid',type:'currency',width:16},{key:'balance',label:'Fee Balance',type:'currency',width:16},{key:'status',label:'Entered Status',width:15},{key:'effective_status',label:'Effective Status',width:18},{key:'overdue_days',label:'Overdue Days',type:'integer',width:14},{key:'aging_bucket',label:'Aging Bucket',width:16},{key:'notes',label:'Notes',width:38},{key:'created_at',label:'Created At',width:24},{key:'updated_at',label:'Updated At',width:24}
  ],data:feeRaw,tabColor:'FFC000',valueStyles:{effective_status:{Paid:'good','Partially Paid':'warn','Overdue - Partial':'bad',Overdue:'bad',Pending:'warn'}}});
  appendReport(wb,{name:'Payments Ledger',title:'PAYMENTS LEDGER',subtitle:'Receipt-level ledger with payer identity, relationship, method, UTR/reference and receiver.',columns:[
    {key:'id',label:'Payment ID',type:'integer',width:11},{key:'receipt_no',label:'Receipt Number',width:20},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'fee_id',label:'Linked Fee ID',type:'integer',width:13},{key:'payer_name',label:'Paid By',width:26},{key:'payer_relation',label:'Payer Relation',width:18},{key:'amount',label:'Amount',type:'currency',width:16},{key:'payment_date',label:'Payment Date',width:14},{key:'method',label:'Payment Method',width:18},{key:'transaction_reference',label:'UTR / Transaction Reference',width:28},{key:'billing_period',label:'Billing Period',width:20},{key:'received_by',label:'Received By',width:24},{key:'notes',label:'Notes',width:38},{key:'created_at',label:'Recorded At',width:24}
  ],data:paymentRaw,tabColor:'FFC000'});
  appendReport(wb,{name:'Student Finance',title:'STUDENT FINANCE',subtitle:'Student-level billing and collection position including balances and last payment.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'status',label:'Status',width:14},{key:'grade',label:'Grade',width:14},{key:'subjects',label:'Subjects',width:30},{key:'current_fee_plan',label:'Current Fee Plan',type:'currency',width:17},{key:'fees_billed',label:'Fees Billed',type:'currency',width:16},{key:'total_paid',label:'Total Paid',type:'currency',width:16},{key:'pending_balance',label:'Pending Balance',type:'currency',width:18},{key:'credit_balance',label:'Credit / Advance',type:'currency',width:18},{key:'payment_count',label:'Payments',type:'integer',width:11},{key:'last_payment_date',label:'Last Payment',width:15},{key:'oldest_due_date',label:'Oldest Open Due',width:16}
  ],data:studentFinance,tabColor:'FFC000',valueStyles:{status:{Active:'good',Inactive:'warn',Completed:'softHeader'}}});
  appendReport(wb,{name:'Outstanding Dues',title:'OUTSTANDING DUES',subtitle:'Positive student balances sorted highest-first for collection follow-up.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'grade',label:'Grade',width:14},{key:'current_fee_plan',label:'Fee Plan',type:'currency',width:16},{key:'fees_billed',label:'Fees Billed',type:'currency',width:16},{key:'total_paid',label:'Total Paid',type:'currency',width:16},{key:'pending_balance',label:'Outstanding',type:'currency',width:18},{key:'oldest_due_date',label:'Oldest Due',width:15},{key:'last_payment_date',label:'Last Payment',width:15},{key:'priority',label:'Collection Priority',width:18},{key:'status',label:'Balance Status',width:16}
  ],data:topDues,tabColor:'ED7D31',valueStyles:{priority:{High:'bad',Medium:'warn',Low:'good'},status:{Overdue:'bad',Pending:'warn'}}});
  appendReport(wb,{name:'Monthly Collections',title:'MONTHLY COLLECTIONS',subtitle:'Collection totals and payment method split by month.',columns:[
    {key:'month',label:'Month Key',width:12},{key:'month_label',label:'Month',width:16},{key:'transactions',label:'Transactions',type:'integer',width:13},{key:'students_paying',label:'Students Paying',type:'integer',width:15},{key:'total_collected',label:'Total Collected',type:'currency',width:18},{key:'average_payment',label:'Average Payment',type:'currency',width:18},{key:'cash',label:'Cash',type:'currency',width:15},{key:'gpay',label:'GPay',type:'currency',width:15},{key:'phonepe',label:'PhonePe',type:'currency',width:15},{key:'upi',label:'UPI',type:'currency',width:15},{key:'bank_transfer',label:'Bank Transfer',type:'currency',width:17},{key:'other',label:'Other',type:'currency',width:15}
  ],data:monthlyCollections,tabColor:'FFC000'});
  appendReport(wb,{name:'Payment Methods',title:'PAYMENT METHOD ANALYSIS',subtitle:'How collections are distributed across payment methods.',columns:[
    {key:'method',label:'Payment Method',width:22},{key:'transactions',label:'Transactions',type:'integer',width:14},{key:'unique_students',label:'Unique Students',type:'integer',width:15},{key:'total_collected',label:'Total Collected',type:'currency',width:18},{key:'average_transaction',label:'Average Transaction',type:'currency',width:20},{key:'collection_share',label:'Collection Share',type:'percent',width:18}
  ],data:methodSummary,tabColor:'FFC000'});
  appendReport(wb,{name:'Test Register',title:'TEST REGISTER',subtitle:'Complete test/result history with marks, grades and teacher remarks.',columns:[
    {key:'id',label:'Test ID',type:'integer',width:10},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'test_name',label:'Test Name',width:28},{key:'subject',label:'Subject',width:20},{key:'test_date',label:'Test Date',width:14},{key:'marks_obtained',label:'Marks Obtained',type:'number',width:16},{key:'max_marks',label:'Maximum Marks',type:'number',width:16},{key:'percentage',label:'Percentage',type:'percent',width:15},{key:'grade',label:'Grade',width:18},{key:'teacher_remarks',label:'Teacher Remarks',width:42},{key:'created_at',label:'Recorded At',width:24}
  ],data:testRaw,tabColor:'A5A5A5',valueStyles:{grade:{'A+':'good',A:'good',B:'softHeader',C:'warn','Needs Improvement':'bad'}}});
  appendReport(wb,{name:'Performance Summary',title:'STUDENT PERFORMANCE SUMMARY',subtitle:'Test performance analytics by student.',columns:[
    {key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'tests_recorded',label:'Tests Recorded',type:'integer',width:14},{key:'average_percentage',label:'Average %',type:'percent',width:14},{key:'best_percentage',label:'Best %',type:'percent',width:13},{key:'lowest_percentage',label:'Lowest %',type:'percent',width:13},{key:'latest_test_date',label:'Latest Test Date',width:16},{key:'latest_percentage',label:'Latest %',type:'percent',width:13},{key:'latest_grade',label:'Latest Grade',width:15}
  ],data:performance,tabColor:'A5A5A5'});
  appendReport(wb,{name:'Subject Performance',title:'SUBJECT PERFORMANCE',subtitle:'Academy-wide test performance aggregated by subject.',columns:[
    {key:'subject',label:'Subject',width:24},{key:'tests_recorded',label:'Tests Recorded',type:'integer',width:14},{key:'students_tested',label:'Students Tested',type:'integer',width:15},{key:'average_percentage',label:'Average %',type:'percent',width:14},{key:'best_percentage',label:'Best %',type:'percent',width:13},{key:'lowest_percentage',label:'Lowest %',type:'percent',width:13},{key:'pass_rate',label:'Pass Rate',type:'percent',width:14}
  ],data:subjectPerf,tabColor:'A5A5A5'});
  appendReport(wb,{name:'Intake Submissions',title:'INTAKE SUBMISSIONS',subtitle:'Full student/parent data submitted through the public information form.',columns:[
    {key:'id',label:'Submission ID',width:38},{key:'student_name',label:'Student Name',width:26},{key:'dob',label:'DOB',width:14},{key:'gender',label:'Gender',width:12},{key:'grade',label:'Grade',width:14},{key:'school',label:'School',width:28},{key:'board',label:'Board',width:16},{key:'student_phone',label:'Student Phone',width:18},{key:'student_email',label:'Student Email',width:30},{key:'parent_name',label:'Parent / Guardian',width:26},{key:'parent_phone',label:'Parent Phone',width:18},{key:'parent_email',label:'Parent Email',width:30},{key:'subjects',label:'Subjects',width:32},{key:'preferred_mode',label:'Preferred Mode',width:16},{key:'address',label:'Address',width:40},{key:'notes',label:'Notes',width:40},{key:'status',label:'Status',width:14},{key:'submitted_at',label:'Submitted At',width:24},{key:'accepted_student_id',label:'Accepted Student ID',type:'integer',width:18}
  ],data:intakeRaw,tabColor:'8064A2',valueStyles:{status:{Accepted:'good',New:'warn',Rejected:'bad'}}});
  appendReport(wb,{name:'Admissions Pipeline',title:'ADMISSIONS PIPELINE',subtitle:'Current intake pipeline grouped by status.',columns:[
    {key:'status',label:'Status',width:18},{key:'submissions',label:'Submissions',type:'integer',width:14},{key:'linked_students',label:'Linked Students',type:'integer',width:16},{key:'latest_submission',label:'Latest Submission',width:26}
  ],data:admissions,tabColor:'8064A2',valueStyles:{status:{Accepted:'good',New:'warn',Rejected:'bad'}}});
  appendReport(wb,{name:'Data Quality',title:'DATA QUALITY CHECKS',subtitle:'Automatically detected gaps or inconsistencies. These are review prompts, not automatic corrections.',columns:[
    {key:'severity',label:'Severity',width:12},{key:'category',label:'Category',width:20},{key:'student_code',label:'Student Code',width:16},{key:'student',label:'Student',width:26},{key:'entity',label:'Entity',width:14},{key:'entity_id',label:'Entity ID',width:14},{key:'issue',label:'Issue',width:54},{key:'recommended_action',label:'Recommended Action',width:54}
  ],data:qualityIssues,tabColor:'C00000',valueStyles:{severity:{High:'bad',Medium:'warn',Low:'softHeader'}}});
  appendReport(wb,{name:'Audit Log',title:'AUDIT LOG',subtitle:'System activity history for accountability and troubleshooting.',columns:[
    {key:'id',label:'Audit ID',type:'integer',width:10},{key:'action',label:'Action',width:18},{key:'entity_type',label:'Entity Type',width:18},{key:'entity_id',label:'Entity ID',width:16},{key:'details',label:'Details (JSON)',width:60},{key:'actor',label:'Actor',width:24},{key:'created_at',label:'Created At',width:26}
  ],data:auditRows,tabColor:'7F7F7F'});
  appendReport(wb,{name:'System Settings',title:'SYSTEM SETTINGS',subtitle:'Application settings stored in the database. Secrets/environment passwords are intentionally not exported.',columns:[
    {key:'key',label:'Setting',width:28},{key:'value',label:'Value',width:56},{key:'updated_at',label:'Updated At',width:26}
  ],data:settingsRows,tabColor:'7F7F7F'});

  const dict=[
    ['Student Master','Student Code','Stable academy student identifier such as ALA-0001.'],['Student Master','Fee Plan','Current student fee-plan amount stored on the student record.'],['Student 360','Pending Balance','Total fees billed minus all payments received for the student, floored at zero.'],['Student 360','Attendance %','(Present + Late) / attendance entries excluding Excused × 100.'],['Student 360','Completed Hours','Sum of duration_hours for classes marked Completed.'],['Fee Register','Linked Paid','Payments explicitly linked to that fee record through fee_id.'],['Fee Register','Effective Status','Calculated Paid / Partially Paid / Overdue / Pending status based on linked payment and due date.'],['Fee Register','Aging Bucket','How long the fee has been overdue: not due, 1-7, 8-30, 31-60 or 60+ days.'],['Payments Ledger','Paid By','Name of the person who actually made the payment.'],['Payments Ledger','Payer Relation','Relationship of payer to student, e.g. Parent / Guardian.'],['Payments Ledger','Received By','Academy staff member or system that recorded/received the payment.'],['Payments Ledger','UTR / Transaction Reference','Bank/UPI/payment reference used to verify electronic payment.'],['Student Finance','Fees Billed','Sum of all fee-register amounts for the student.'],['Student Finance','Total Paid','Sum of all payments recorded for the student, whether or not linked to a specific fee.'],['Outstanding Dues','Collection Priority','High if oldest open due is >30 days overdue, Medium if overdue, otherwise Low.'],['Monthly Collections','Total Collected','Sum of payment amounts recorded during the month.'],['Performance Summary','Average %','Arithmetic mean of all recorded test percentages for the student.'],['Subject Performance','Pass Rate','Share of test results at 40% or above.'],['Admissions Pipeline','Linked Students','Number of submissions in the status group that have an accepted_student_id.'],['Data Quality','Severity','Review priority only; no data is automatically changed by this check.'],['Audit Log','Details (JSON)','Structured description captured by the application when the event occurred.']
  ].map(([sheet,field,definition])=>({sheet,field,definition}));
  appendReport(wb,{name:'Data Dictionary',title:'DATA DICTIONARY',subtitle:'Definitions for important calculated and operational fields in the V6 workbook.',columns:[{key:'sheet',label:'Sheet',width:24},{key:'field',label:'Field',width:28},{key:'definition',label:'Definition / Calculation',width:86}],data:dict,tabColor:'7F7F7F'});

  if(integratedParentPortal) integratedParentPortal.appendWorkbookSheets(wb);

  XLSX.writeFile(wb,EXCEL_PATH,{bookType:'xlsx'});
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
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '250kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'apply.html')));
app.get('/apply', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'apply.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'Aacharya Tuition Manager v6',
  version: '6.0.0',
  dataDir: DATA_DIR,
  excelFile: path.basename(EXCEL_PATH),
  excelSheets: V6_SHEET_COUNT,
  persistentDiskExpected: DATA_DIR === '/var/data'
}));

// Initialize the unchanged V5.3 core schema before V6 additive modules.
// This makes V6 safe on a brand-new DATA_DIR while preserving existing V5.3 databases.
initDb();

// Parent Portal Extension bridge. This adds isolated integration routes only.
const parentPortalBridge = require('./integration/parent-portal-bridge')({
  app, db, rebuildWorkbook, adminName: ADMIN_NAME, audit
});

// V6 integrated portal: same server, same database, same Render service.
// The old extension bridge is kept only for backward compatibility; V6 does not require it.
integratedParentPortal = require('./integration/integrated-parent-portal')({
  app, db, authRequired, adminName: ADMIN_NAME, nodeEnv: NODE_ENV,
  dataDir: DATA_DIR, publicDir: PUBLIC_DIR, afterMutation, nextReceipt, audit,
  clean, num, validDate, nowIso, rows, one, appendReport
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

app.get('/api/payments',authRequired,(req,res)=>res.json({ok:true,payments:rows(`SELECT p.*,s.full_name student,s.student_code,COALESCE(m.current_version,1) current_version,COALESCE(m.source,'Legacy / V5.3') source,m.parent_proof_id,COALESCE(m.edited_after_verification,0) edited_after_verification,(SELECT COUNT(*) FROM payment_history h WHERE h.payment_id=p.id) history_count FROM payments p JOIN students s ON s.id=p.student_id LEFT JOIN payment_current_meta m ON m.payment_id=p.id ORDER BY p.payment_date DESC,p.id DESC`)}));
app.post('/api/payments',authRequired,(req,res)=>{const b=req.body||{},sid=Number(b.student_id),amount=num(b.amount),payer=clean(b.payer_name,120),date=clean(b.payment_date,20),method=clean(b.method,50);if(!one('SELECT id FROM students WHERE id=?',sid)||amount<=0||!payer||!validDate(date)||!method)return res.status(400).json({ok:false,message:'Student, payer, positive amount, date and method are required.'});const receipt=nextReceipt();const info=db.prepare(`INSERT INTO payments(student_id,fee_id,receipt_no,payer_name,payer_relation,amount,payment_date,method,transaction_reference,billing_period,received_by,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sid,b.fee_id?Number(b.fee_id):null,receipt,payer,clean(b.payer_relation,50),amount,date,method,clean(b.transaction_reference,150),clean(b.billing_period,80),clean(b.received_by,120)||ADMIN_NAME,clean(b.notes,800),nowIso());const id=Number(info.lastInsertRowid);if(integratedParentPortal)integratedParentPortal.ensurePaymentMeta(id,'Admin Entry');audit('CREATE','payment',id,{sid,amount,payer,receipt,receivedBy:clean(b.received_by,120)||ADMIN_NAME},ADMIN_NAME);afterMutation();res.status(201).json({ok:true,payment:one('SELECT * FROM payments WHERE id=?',id)});});
app.delete('/api/payments/:id',authRequired,(req,res)=>{const id=Number(req.params.id),p=one('SELECT * FROM payments WHERE id=?',id);if(!p)return res.status(404).json({ok:false,message:'Payment not found.'});if(integratedParentPortal)integratedParentPortal.beforeDeletePayment(p,ADMIN_NAME);db.prepare('DELETE FROM payments WHERE id=?').run(id);audit('DELETE','payment',id,{receipt:p.receipt_no,amount:p.amount,historicalCopyRetained:true},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/tests',authRequired,(req,res)=>res.json({ok:true,tests:rows(`SELECT t.*,s.full_name student,s.student_code FROM tests t JOIN students s ON s.id=t.student_id ORDER BY t.test_date DESC,t.id DESC`)}));
app.post('/api/tests',authRequired,(req,res)=>{const b=req.body||{},sid=Number(b.student_id),max=num(b.max_marks),marks=num(b.marks_obtained),date=clean(b.test_date,20),name=clean(b.test_name,150);if(!one('SELECT id FROM students WHERE id=?',sid)||!name||!validDate(date)||max<=0||marks<0||marks>max)return res.status(400).json({ok:false,message:'Valid student, test, date and marks are required.'});const pct=Math.round((marks/max)*10000)/100;const info=db.prepare(`INSERT INTO tests(student_id,test_name,subject,test_date,max_marks,marks_obtained,percentage,grade,teacher_remarks,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(sid,name,clean(b.subject,120),date,max,marks,pct,gradeFromPercentage(pct),clean(b.teacher_remarks,800),nowIso());const id=Number(info.lastInsertRowid);audit('CREATE','test',id,{sid,name,pct},ADMIN_NAME);afterMutation();res.status(201).json({ok:true,test:one('SELECT * FROM tests WHERE id=?',id)});});
app.delete('/api/tests/:id',authRequired,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM tests WHERE id=?').run(id);audit('DELETE','test',id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/intake',authRequired,(req,res)=>res.json({ok:true,submissions:rows('SELECT * FROM intake_submissions ORDER BY submitted_at DESC')}));
app.post('/api/intake/:id/accept',authRequired,(req,res)=>{
  const x=one('SELECT * FROM intake_submissions WHERE id=?',req.params.id);if(!x)return res.status(404).json({ok:false,message:'Submission not found.'});if(x.status==='Accepted'&&x.accepted_student_id)return res.json({ok:true,student:one('SELECT * FROM students WHERE id=?',x.accepted_student_id)});
  const t=nowIso();const info=db.prepare(`INSERT INTO students(full_name,dob,gender,school,board,grade,joining_date,phone,email,address,parent_name,parent_phone,parent_email,subjects,fee_plan_amount,status,notes,intake_submission_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(x.student_name,x.dob,x.gender,x.school,x.board,x.grade,t.slice(0,10),x.student_phone,x.student_email,x.address,x.parent_name,x.parent_phone,x.parent_email,x.subjects,0,'Active',x.notes,x.id,t,t);const sid=Number(info.lastInsertRowid);db.prepare('UPDATE students SET student_code=? WHERE id=?').run(studentCode(sid),sid);db.prepare(`UPDATE intake_submissions SET status='Accepted',accepted_student_id=? WHERE id=?`).run(sid,x.id);audit('ACCEPT','intake_submission',x.id,{studentId:sid},ADMIN_NAME);afterMutation();const student=one('SELECT * FROM students WHERE id=?',sid);const parentInvite=integratedParentPortal?integratedParentPortal.ensureInviteForStudent(student,req,ADMIN_NAME):null;parentPortalBridge.notifyAdmissionAccepted(student).catch(err=>console.error('Legacy parent portal hook failed:',err));res.json({ok:true,student,parentInvite});
});
app.post('/api/intake/:id/reject',authRequired,(req,res)=>{if(!one('SELECT id FROM intake_submissions WHERE id=?',req.params.id))return res.status(404).json({ok:false,message:'Submission not found.'});db.prepare(`UPDATE intake_submissions SET status='Rejected' WHERE id=?`).run(req.params.id);audit('REJECT','intake_submission',req.params.id,{},ADMIN_NAME);afterMutation();res.json({ok:true});});

// Compatibility endpoint for the earlier Windows manager.
app.get('/api/admin/submissions',syncKeyRequired,(req,res)=>{
  const submissions=rows(`SELECT * FROM intake_submissions ORDER BY submitted_at DESC`).map(x=>({id:x.id,submittedAt:x.submitted_at,status:x.status,data:{studentName:x.student_name,dob:x.dob,gender:x.gender,grade:x.grade,school:x.school,board:x.board,studentPhone:x.student_phone,studentEmail:x.student_email,parentName:x.parent_name,parentPhone:x.parent_phone,parentEmail:x.parent_email,subjects:String(x.subjects||'').split(',').map(s=>s.trim()).filter(Boolean),preferredMode:x.preferred_mode,address:x.address,notes:x.notes}}));
  res.json({ok:true,submissions});
});

app.get('/api/settings',authRequired,(req,res)=>{const obj={};for(const r of rows('SELECT key,value FROM settings'))obj[r.key]=r.value;res.json({ok:true,settings:obj});});
app.put('/api/settings',authRequired,(req,res)=>{const allowed=['academy_name','currency','background_image_url','academic_year'];const stmt=db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`);for(const k of allowed){if(Object.prototype.hasOwnProperty.call(req.body||{},k))stmt.run(k,clean(req.body[k],1000),nowIso());}audit('UPDATE','settings','global',req.body,ADMIN_NAME);afterMutation();res.json({ok:true});});

app.get('/api/excel/status',authRequired,(req,res)=>{let stat=null;try{stat=fs.statSync(EXCEL_PATH);}catch{}res.json({ok:true,path:EXCEL_PATH,exists:!!stat,size:stat?.size||0,updatedAt:stat?.mtime?.toISOString()||null,version:'6.0.0',sheetCount:V6_SHEET_COUNT});});
app.post('/api/excel/rebuild',authRequired,(req,res)=>{try{rebuildWorkbook();audit('REBUILD','excel','master',{},ADMIN_NAME);res.json({ok:true});}catch(e){console.error(e);res.status(500).json({ok:false,message:'Could not rebuild Excel workbook.'});}});
app.get('/api/export/xlsx',authRequired,(req,res)=>{try{rebuildWorkbook();res.download(EXCEL_PATH,'Aacharya_Tuition_Master_v6.xlsx');}catch(e){console.error(e);res.status(500).json({ok:false,message:'Could not create Excel workbook.'});}});

app.use('/api', (req,res)=>res.status(404).json({ok:false,message:'API endpoint not found.'}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,message:'Server error. Check Render logs.'});});

try { rebuildWorkbook(); } catch (err) { console.error('Initial Excel build failed:', err); }

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aacharya Tuition Manager V6 running on port ${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Master Excel: ${EXCEL_PATH}`);
    if (NODE_ENV === 'production' && ADMIN_PASSWORD === 'ChangeMe123!') console.warn('WARNING: Set ADMIN_PASSWORD in Render Environment.');
  });
}

module.exports = { app, db, rebuildWorkbook, EXCEL_PATH, DATA_DIR, integratedParentPortal };
