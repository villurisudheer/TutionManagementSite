'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');

const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aacharya-v6-'));
const port=32206;
const base=`http://127.0.0.1:${port}`;
const env={...process.env,PORT:String(port),NODE_ENV:'test',DATA_DIR:dir,ADMIN_NAME:'Test Admin',ADMIN_EMAIL:'admin@test.local',ADMIN_PASSWORD:'TestPass123!',SESSION_SECRET:'v6-smoke-session-secret-123456789',ADMIN_SYNC_KEY:'v6-smoke-sync-key-123456789',PARENT_SESSION_SECRET:'v6-parent-session-secret-123456789',INVITE_VALID_DAYS:'7',COURSE_GRACE_DAYS:'7',CREDENTIAL_PURGE_DAYS:'30',MAX_PROOF_BYTES:String(5*1024*1024)};
const child=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d);
const jars={admin:'',parent:''};
async function request(url,opts={},jar='admin',expectOk=true){
  const headers={...(opts.body!==undefined?{'Content-Type':'application/json'}:{}),...(jars[jar]?{Cookie:jars[jar]}:{}),...(opts.headers||{})};
  const r=await fetch(base+url,{...opts,headers});
  const set=r.headers.get('set-cookie'); if(set) jars[jar]=set.split(';')[0];
  const ct=r.headers.get('content-type')||'';
  let payload;
  if(ct.includes('application/json')) payload=await r.json(); else payload=Buffer.from(await r.arrayBuffer());
  if(expectOk && !r.ok) throw new Error(`${url}: ${r.status} ${payload?.message||''}`);
  return {status:r.status,ok:r.ok,payload,headers:r.headers};
}
async function json(url,opts={},jar='admin'){return (await request(url,opts,jar,true)).payload;}
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/health'); if(r.ok)return;}catch{} await new Promise(r=>setTimeout(r,150));} throw new Error('server did not start\n'+logs);}
function isoDate(deltaDays){const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+deltaDays);return d.toISOString().slice(0,10);}
function assert(x,msg){if(!x)throw new Error(msg);}

(async()=>{try{
  await wait();
  const health=await json('/api/health');
  assert(health.version==='6.0.0','V6 health/version failed');
  assert(Number(health.excelSheets)===36,'V6 sheet count in health failed');

  const parentPage=await (await fetch(base+'/parent')).text();
  assert(parentPage.includes('Parent Portal') && parentPage.includes('/aacharya-app-icon.png'),'integrated parent page/icon missing');
  const adminPage=await (await fetch(base+'/admin')).text();
  assert(adminPage.includes('Parent Portal') && adminPage.includes('Historical Payment Records'),'V6 admin additions missing');

  await json('/api/auth/login',{method:'POST',body:JSON.stringify({email:'admin@test.local',password:'TestPass123!'})},'admin');

  // Admission -> accepted student -> automatic integrated parent invite.
  const intake=await json('/api/intake',{method:'POST',body:JSON.stringify({studentName:'V6 Current Student',grade:'Class 12',school:'Example School',board:'CBSE',studentPhone:'9000000001',parentName:'V6 Parent',parentPhone:'9111111111',parentEmail:'v6parent@example.com',subjects:['Chemistry'],preferredMode:'Online'})},'admin');
  const accepted=await json(`/api/intake/${intake.id}/accept`,{method:'POST',body:'{}'},'admin');
  const sid=accepted.student.id;
  assert(sid && accepted.parentInvite?.token && accepted.parentInvite?.url?.includes('/parent/signup?invite='),'automatic parent invitation failed');

  // Current enrollment keeps this student out of Alumni.
  await json('/api/admin/parent-portal/enrollments',{method:'POST',body:JSON.stringify({student_id:sid,course_name:'Class 12 Chemistry',subjects:'Chemistry',start_date:isoDate(-5),end_date:isoDate(60),notes:'V6 active course'})},'admin');

  // Invitation-only signup and direct same-app parent access.
  await json('/api/parent/signup',{method:'POST',body:JSON.stringify({invite:accepted.parentInvite.token,full_name:'V6 Parent',email:'v6parent@example.com',phone:'9111111111',relationship:'Parent / Guardian',password:'ParentPass123!'})},'parent');
  const parentDash=await json('/api/parent/dashboard',{},'parent');
  assert(parentDash.children?.length===1 && parentDash.children[0].student.full_name==='V6 Current Student','parent cannot see linked child');

  // Payment proof really is compulsory.
  const noProof=await request('/api/parent/payment-proofs',{method:'POST',body:JSON.stringify({student_id:sid,amount:4000,payment_date:isoDate(0),method:'GPay',payer_name:'V6 Parent',payer_relation:'Parent / Guardian',transaction_reference:'V6TXN-1',billing_period:'September 2026'})},'parent',false);
  assert(noProof.status===400 && /compulsory/i.test(noProof.payload?.message||''),'payment proof was not compulsory');

  // Tiny valid PNG used only for automated proof-storage testing.
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const submitted=await json('/api/parent/payment-proofs',{method:'POST',body:JSON.stringify({student_id:sid,amount:4000,payment_date:isoDate(0),method:'GPay',payer_name:'V6 Parent',payer_relation:'Parent / Guardian',transaction_reference:'V6TXN-1',billing_period:'September 2026',notes:'Smoke proof',proof_data_url:png})},'parent');
  assert(submitted.id && submitted.status==='Pending','parent payment proof submission failed');

  const proofList=await json('/api/admin/parent-portal/payment-proofs',{},'admin');
  const proof=proofList.proofs.find(x=>x.id===submitted.id);
  assert(proof && proof.proof_filename && proof.status==='Pending','admin proof queue failed');
  const proofFile=await request(`/api/admin/parent-portal/payment-proofs/${proof.id}/file`,{},'admin',true);
  assert(Buffer.isBuffer(proofFile.payload) && proofFile.payload.length>20,'private proof retrieval failed');

  const approved=await json(`/api/admin/parent-portal/payment-proofs/${proof.id}/approve`,{method:'POST',body:JSON.stringify({admin_note:'Verified in V6 smoke test'})},'admin');
  const paymentId=approved.payment.id;
  assert(paymentId && approved.payment.amount===4000,'proof approval did not create official payment');

  let payments=await json('/api/payments',{},'admin');
  let current=payments.payments.find(x=>x.id===paymentId);
  assert(current && current.source==='Parent Portal' && Number(current.current_version)===1,'parent payment metadata missing');

  // Edit current payment: website changes; old value remains in historical ledger.
  const edited=await json(`/api/payments/${paymentId}`,{method:'PUT',body:JSON.stringify({amount:4500,edit_reason:'Corrected amount after checking bank statement',transaction_reference:'V6TXN-1-CORRECTED'})},'admin');
  assert(Number(edited.payment.amount)===4500 && Number(edited.payment.current_version)===2,'payment current version edit failed');
  payments=await json('/api/payments',{},'admin'); current=payments.payments.find(x=>x.id===paymentId);
  assert(Number(current.amount)===4500 && Number(current.history_count)>=1,'current website payment did not replace old value');
  const hist=await json('/api/payment-history',{},'admin');
  const old=hist.history.find(x=>x.payment_id===paymentId);
  assert(old && Number(old.amount)===4000 && old.change_reason.includes('Corrected amount'),'historical payment version was not retained');

  // Pure alumnus: ended enrollment with no live/upcoming/grace course.
  const alum=await json('/api/students',{method:'POST',body:JSON.stringify({full_name:'V6 True Alumni',grade:'Class 12',subjects:'Chemistry',school:'Past School',board:'CBSE',phone:'9000000002',parent_name:'Past Parent',parent_phone:'9222222222',fee_plan_amount:5000,status:'Active'})},'admin');
  const alumniId=alum.student.id;
  await json('/api/admin/parent-portal/enrollments',{method:'POST',body:JSON.stringify({student_id:alumniId,course_name:'Completed Chemistry',subjects:'Chemistry',start_date:isoDate(-90),end_date:isoDate(-30),notes:'Completed old course'})},'admin');
  let portalStudents=await json('/api/admin/parent-portal/students',{},'admin');
  assert(portalStudents.students.find(x=>x.id===alumniId)?.lifecycle_status==='Alumni','ended-only student not classified Alumni');
  assert(portalStudents.students.find(x=>x.id===sid)?.lifecycle_status==='Current','active/rejoined student incorrectly classified Alumni');

  // Rejoining removes the alumnus classification without erasing course history.
  await json('/api/admin/parent-portal/enrollments',{method:'POST',body:JSON.stringify({student_id:alumniId,course_name:'Rejoined Revision',subjects:'Chemistry',start_date:isoDate(1),end_date:isoDate(45),notes:'Rejoined after old course'})},'admin');
  portalStudents=await json('/api/admin/parent-portal/students',{},'admin');
  assert(portalStudents.students.find(x=>x.id===alumniId)?.lifecycle_status==='Current','rejoined student remained in Alumni');

  // Add another true alumnus so Old Records sheet has a positive inclusion case.
  const alum2=await json('/api/students',{method:'POST',body:JSON.stringify({full_name:'V6 Archived Alumni',grade:'Class 11',subjects:'Physics',school:'Past School',board:'CBSE',phone:'9000000003',parent_name:'Archived Parent',parent_phone:'9333333333',fee_plan_amount:4500,status:'Active'})},'admin');
  await json('/api/admin/parent-portal/enrollments',{method:'POST',body:JSON.stringify({student_id:alum2.student.id,course_name:'Completed Physics',subjects:'Physics',start_date:isoDate(-100),end_date:isoDate(-40)})},'admin');
  portalStudents=await json('/api/admin/parent-portal/students',{},'admin');
  assert(portalStudents.students.find(x=>x.id===alum2.student.id)?.lifecycle_status==='Alumni','true alumnus inclusion case failed');

  // Excel V6: same reliable V5.3 writer + nine integrated sheets.
  const exportResp=await request('/api/export/xlsx',{},'admin',true);
  assert(exportResp.payload.length>1500 && exportResp.payload[0]===0x50 && exportResp.payload[1]===0x4b,'V6 xlsx response invalid');
  const file=path.join(dir,'Aacharya_Tuition_Master_v6.xlsx');
  assert(fs.existsSync(file),'V6 master workbook missing');
  const expected=['Workbook Guide','Executive Dashboard','Student Master','Student 360','Parent Directory','Academic Profiles','Class Register','Class Hours Summary','Monthly Class Hours','Attendance Register','Attendance Summary','Monthly Attendance','Fee Register','Payments Ledger','Student Finance','Outstanding Dues','Monthly Collections','Payment Methods','Test Register','Performance Summary','Subject Performance','Intake Submissions','Admissions Pipeline','Data Quality','Audit Log','System Settings','Data Dictionary','Parent Accounts','Parent Student Links','Enrollments','Course History','Old Records Alumni','Payment Proofs','Historical Payments','Renewal Requests','Portal Activity'];
  const check=require('../lib/xlsx-safe').validateFile(file,expected.length,['V6 Archived Alumni','HISTORICAL PAYMENT RECORDS','PARENT PAYMENT PROOFS','OLD RECORDS / ALUMNI','V6 Parent','Corrected amount after checking bank statement']);
  for(const n of expected) assert(check.sheets.includes(n),'missing V6 Excel sheet '+n);
  assert(check.sheets.length===36,'V6 workbook does not have 36 sheets');
  if(process.env.V6_SMOKE_OUTPUT){ fs.mkdirSync(path.dirname(process.env.V6_SMOKE_OUTPUT),{recursive:true}); fs.copyFileSync(file,process.env.V6_SMOKE_OUTPUT); }

  const excelStatus=await json('/api/excel/status',{},'admin');
  assert(excelStatus.version==='6.0.0' && excelStatus.sheetCount===36,'V6 excel status failed');

  await json('/api/auth/logout',{method:'POST',body:'{}'},'admin');
  console.log('V6 SMOKE TEST PASSED: V5.3 core preserved; integrated parent portal; invite-only signup; strict linked-child view; compulsory private payment proof; admin verification; current payment replacement + historical version retention; true-alumni-only logic with rejoin removal; reliable 36-sheet Excel export.');
}catch(e){console.error('V6 SMOKE TEST FAILED:',e);console.error(logs);process.exitCode=1;}finally{child.kill('SIGTERM');setTimeout(()=>{try{fs.rmSync(dir,{recursive:true,force:true})}catch{}},500);}})();
