'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aacharya-v5-'));
const port=32187;
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),NODE_ENV:'test',DATA_DIR:dir,ADMIN_NAME:'Test Admin',ADMIN_EMAIL:'admin@test.local',ADMIN_PASSWORD:'TestPass123!',SESSION_SECRET:'smoke-session-secret-123456789',ADMIN_SYNC_KEY:'smoke-sync-key-123456789'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
let cookie='';
async function req(url,opts={}){const r=await fetch(base+url,{...opts,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(opts.headers||{})}});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const ct=r.headers.get('content-type')||'';if(ct.includes('application/json')){const p=await r.json();if(!r.ok)throw new Error(`${url}: ${r.status} ${p.message}`);return p;}const b=Buffer.from(await r.arrayBuffer());if(!r.ok)throw new Error(`${url}: ${r.status}`);return b;}
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,150));}throw new Error('server did not start\n'+logs)}
(async()=>{try{
 await wait();
 const h=await req('/api/health');if(!h.ok||h.version!=='5.3.0')throw new Error('health/version failed');
 const publicPage=await fetch(base+'/');const publicHtml=await publicPage.text();if(!publicHtml.includes('Student / Parent Information Form'))throw new Error('public form not served');
 const adminPage=await fetch(base+'/admin');const adminHtml=await adminPage.text();if(!adminHtml.includes('Private Tuition Manager')||!adminHtml.includes('uiTheme')||!adminHtml.includes('uiLightPrimary')||!adminHtml.includes('uiDarkSecondary')||!adminHtml.includes('mobileNav'))throw new Error('V5.3 adaptive admin page not served');
 await req('/api/auth/login',{method:'POST',body:JSON.stringify({email:'admin@test.local',password:'TestPass123!'})});
 const s=await req('/api/students',{method:'POST',body:JSON.stringify({full_name:'Smoke Student',grade:'Class 12',subjects:'Chemistry, Physics',school:'Example School',board:'CBSE',phone:'9000000000',parent_name:'Smoke Parent',parent_phone:'9111111111',parent_email:'parent@example.com',fee_plan_amount:6000,status:'Active'})});
 const sid=s.student.id;if(!sid||!s.student.student_code)throw new Error('student create failed');
 await req('/api/classes',{method:'POST',body:JSON.stringify({student_id:sid,class_date:'2026-09-04',start_time:'18:30',end_time:'20:00',subject:'Chemistry',topic:'Solutions',mode:'Online'})});
 await req('/api/attendance',{method:'POST',body:JSON.stringify({student_id:sid,attendance_date:'2026-09-04',status:'Present',notes:'On time'})});
 const fee=await req('/api/fees',{method:'POST',body:JSON.stringify({student_id:sid,billing_type:'Monthly',amount:6000,billing_period:'September 2026',due_date:'2026-09-05',status:'Pending'})});
 await req('/api/payments',{method:'POST',body:JSON.stringify({student_id:sid,fee_id:fee.fee.id,amount:2500,payer_name:'Smoke Parent',payer_relation:'Parent / Guardian',payment_date:'2026-09-03',method:'GPay',transaction_reference:'TXN123',billing_period:'September 2026',received_by:'Test Admin'})});
 await req('/api/tests',{method:'POST',body:JSON.stringify({student_id:sid,test_name:'Solutions Test',subject:'Chemistry',test_date:'2026-09-04',marks_obtained:32,max_marks:40,teacher_remarks:'Good'})});
 const intake=await req('/api/intake',{method:'POST',body:JSON.stringify({studentName:'Intake Student',grade:'Class 11',parentName:'Intake Parent',parentPhone:'9222222222',subjects:['Chemistry'],preferredMode:'Online'})});
 if(!intake.id)throw new Error('intake failed');
 await req(`/api/intake/${intake.id}/accept`,{method:'POST',body:'{}'});
 const dash=await req('/api/dashboard');if(dash.summary.total_students!==2)throw new Error('dashboard student count mismatch');
 const payments=await req('/api/payments');const pay=payments.payments[0];if(pay.payer_name!=='Smoke Parent'||pay.received_by!=='Test Admin')throw new Error('payer/receiver not stored');
 const att=await req('/api/attendance');if(Number(att.summary.find(x=>x.student_id===sid)?.percentage)!==100)throw new Error('attendance counter failed');
 const tests=await req('/api/tests');if(Number(tests.tests[0].percentage)!==80)throw new Error('test percentage failed');
 const excel=await req('/api/export/xlsx');if(excel.length<1000||excel[0]!==0x50||excel[1]!==0x4b)throw new Error('xlsx download invalid');
 const file=path.join(dir,'Aacharya_Tuition_Master_v5_3.xlsx');if(!fs.existsSync(file))throw new Error('master xlsx missing');
 const expected=['Workbook Guide','Executive Dashboard','Student Master','Student 360','Parent Directory','Academic Profiles','Class Register','Class Hours Summary','Monthly Class Hours','Attendance Register','Attendance Summary','Monthly Attendance','Fee Register','Payments Ledger','Student Finance','Outstanding Dues','Monthly Collections','Payment Methods','Test Register','Performance Summary','Subject Performance','Intake Submissions','Admissions Pipeline','Data Quality','Audit Log','System Settings','Data Dictionary'];
 const check=require('../lib/xlsx-safe').validateFile(file,expected.length,['Smoke Parent','Test Admin','Paid By','Received By','Student 360','Data Quality']);for(const n of expected)if(!check.sheets.includes(n))throw new Error('missing sheet '+n);if(check.entries<34)throw new Error('XLSX package parts incomplete');
 await req('/api/auth/logout',{method:'POST',body:'{}'});
 console.log('SMOKE TEST PASSED: login, public intake, students, classes, attendance, fees, payer/receiver payments, tests, dashboard, V5.3 standards-compliant 27-sheet Excel workbook, logout.');
 }catch(e){console.error('SMOKE TEST FAILED:',e);console.error(logs);process.exitCode=1;}finally{child.kill('SIGTERM');setTimeout(()=>{try{fs.rmSync(dir,{recursive:true,force:true})}catch{}},300);}})();
