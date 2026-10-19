'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aacharya-v61-reliability-'));
let port=32361;
let child=null,logs='',cookie='';
const envBase={...process.env,NODE_ENV:'test',DATA_DIR:dir,ADMIN_NAME:'Reliability Admin',ADMIN_EMAIL:'admin@reliability.local',ADMIN_PASSWORD:'Reliability123!',SESSION_SECRET:'reliability-session-secret-123456789',ADMIN_SYNC_KEY:'reliability-sync-key-123456789',PARENT_SESSION_SECRET:'reliability-parent-session-secret-123456789'};
function assert(v,msg){if(!v)throw new Error(msg)}
async function wait(base){for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('server failed to start\n'+logs)}
async function start(){logs='';cookie='';port++;const base=`http://127.0.0.1:${port}`;child=spawn(process.execPath,['server.js'],{cwd:root,env:{...envBase,PORT:String(port)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);await wait(base);return base}
async function stop(){if(!child)return;const c=child;child=null;c.kill('SIGTERM');await new Promise(resolve=>{const t=setTimeout(resolve,1800);c.once('exit',()=>{clearTimeout(t);resolve()})})}
async function req(base,url,opts={}){const headers={...(opts.body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(opts.headers||{})};const r=await fetch(base+url,{...opts,headers});const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const txt=await r.text();let p;try{p=JSON.parse(txt)}catch{p=txt}if(!r.ok)throw new Error(`${url}: ${r.status} ${p?.message||txt}`);return p}
async function login(base){await req(base,'/api/auth/login',{method:'POST',body:JSON.stringify({email:envBase.ADMIN_EMAIL,password:envBase.ADMIN_PASSWORD})})}
(async()=>{try{
  let base=await start();await login(base);
  const intake=await req(base,'/api/intake',{method:'POST',body:JSON.stringify({studentName:'Persistence Student',grade:'Class 12',school:'Reliability School',board:'CBSE',studentPhone:'9000011111',parentName:'Persistence Parent',parentPhone:'9000022222',subjects:['Chemistry']})});
  const acc=await req(base,`/api/intake/${intake.id}/accept`,{method:'POST',body:'{}'});const sid=acc.student.id;
  await req(base,'/api/classes',{method:'POST',body:JSON.stringify({student_id:sid,class_date:'2026-09-13',start_time:'18:00',end_time:'19:00',subject:'Chemistry',mode:'Online',status:'Scheduled'})});
  await req(base,'/api/attendance',{method:'POST',body:JSON.stringify({student_id:sid,attendance_date:'2026-09-13',status:'Present'})});
  await req(base,'/api/fees',{method:'POST',body:JSON.stringify({student_id:sid,billing_type:'Monthly',amount:5000,billing_period:'September 2026',due_date:'2026-09-15'})});
  await req(base,'/api/tests',{method:'POST',body:JSON.stringify({student_id:sid,test_name:'Persistence Test',subject:'Chemistry',test_date:'2026-09-13',marks_obtained:35,max_marks:40})});
  // The old DELETE action must no longer cascade-delete the student's records.
  const archived=await req(base,`/api/students/${sid}`,{method:'DELETE'});assert(archived.archived===true,'student DELETE did not become safe archive');
  let students=(await req(base,'/api/students')).students;assert(students.find(x=>Number(x.id)===Number(sid))?.archived_at,'archived student disappeared');
  assert((await req(base,'/api/classes')).classes.some(x=>Number(x.student_id)===Number(sid)),'class disappeared after student archive');
  assert((await req(base,'/api/attendance')).log.some(x=>Number(x.student_id)===Number(sid)),'attendance disappeared after student archive');
  assert((await req(base,'/api/fees')).fees.some(x=>Number(x.student_id)===Number(sid)),'fee disappeared after student archive');
  assert((await req(base,'/api/tests')).tests.some(x=>Number(x.student_id)===Number(sid)),'test disappeared after student archive');
  const snap=await req(base,'/api/data-safety/snapshot',{method:'POST',body:'{}'});assert(snap.file && fs.existsSync(path.join(dir,'backups',snap.file)),'manual safety snapshot missing');
  await stop();
  // Simulate a V6-era broken admission link while keeping the student itself. V6.1 must repair on startup.
  const db=new DatabaseSync(path.join(dir,'aacharya_tuition.sqlite'));db.exec('PRAGMA foreign_keys=ON');db.prepare('UPDATE intake_submissions SET accepted_student_id=NULL WHERE id=?').run(intake.id);db.close();
  base=await start();await login(base);
  const intakeAfter=(await req(base,'/api/intake')).submissions.find(x=>x.id===intake.id);assert(intakeAfter && intakeAfter.status==='Accepted' && Number(intakeAfter.accepted_student_id)===Number(sid),'accepted admission/student link was not repaired after restart');
  students=(await req(base,'/api/students')).students;assert(students.some(x=>Number(x.id)===Number(sid)),'student disappeared after restart');
  const safety=await req(base,'/api/data-safety');assert(safety.integrity==='ok' && Number(safety.orphanedAcceptedAdmissions)===0,'data safety check failed after restart');
  assert(Number(safety.backupCount)>=1,'rolling backup retention missing');
  console.log('V6.1 RELIABILITY TEST PASSED: accepted admissions persist and self-repair; students survive restart; student archive preserves class/attendance/fee/test records; SQLite safety snapshots and integrity checks work.');
}catch(e){console.error('V6.1 RELIABILITY TEST FAILED:',e);console.error(logs);process.exitCode=1}finally{await stop();try{fs.rmSync(dir,{recursive:true,force:true})}catch{}}})();
