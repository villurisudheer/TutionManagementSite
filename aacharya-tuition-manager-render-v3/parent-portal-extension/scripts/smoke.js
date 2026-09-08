'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aacharya-parent-smoke-'));
process.env.NODE_ENV='development';process.env.DATA_DIR=tmp;process.env.PUBLIC_BASE_URL='http://127.0.0.1';process.env.EXTENSION_ADMIN_EMAIL='admin@example.com';process.env.EXTENSION_ADMIN_PASSWORD='ChangeMe123!';process.env.EXTENSION_SESSION_SECRET='smoke-session-secret';process.env.PARENT_PORTAL_SECRET='smoke-parent-secret';process.env.MAIN_MANAGER_URL='';
const {app}=require('../server');
function check(cond,msg){if(!cond)throw new Error(msg)}
const server=app.listen(0,'127.0.0.1',async()=>{
  const port=server.address().port,base=`http://127.0.0.1:${port}`;
  let adminCookie='',parentCookie='';
  async function req(url,opt={}){const r=await fetch(base+url,opt);const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{}return{r,json,text,cookie:r.headers.get('set-cookie')||''}}
  try{
    let x=await req('/api/health');check(x.r.ok&&x.json.ok,'health failed');
    x=await req('/api/integration/admission-accepted',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer smoke-parent-secret'},body:JSON.stringify({main_student_id:101,student_code:'ALA-0101',full_name:'Smoke Student',grade:'Class 12',subjects:'Chemistry',parent_name:'Smoke Parent',parent_email:'parent@smoke.test',parent_phone:'9999999999',status:'Active'})});check(x.r.status===201,'integration admission failed');
    x=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.com',password:'ChangeMe123!'})});check(x.r.ok,'admin login failed');adminCookie=x.cookie.split(';')[0];
    x=await req('/api/admin/student-refs',{headers:{Cookie:adminCookie}});check(x.r.ok&&x.json.students.length===1,'student ref missing');const ref=x.json.students[0];
    x=await req(`/api/admin/invites/${ref.id}/regenerate`,{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:'{}'});check(x.r.ok&&x.json.invite.token,'invite regeneration failed');const token=x.json.invite.token;
    x=await req('/api/admin/enrollments',{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({student_ref_id:ref.id,course_name:'Class 12 Chemistry',start_date:'2026-09-01',end_date:'2026-12-31'})});check(x.r.status===201,'enrollment failed');
    x=await req('/api/parent/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:token,full_name:'Smoke Parent',email:'parent@smoke.test',phone:'9999999999',relationship:'Parent',password:'Password123!'})});check(x.r.status===201,'parent signup failed');parentCookie=x.cookie.split(';')[0];
    x=await req('/api/parent/dashboard',{headers:{Cookie:parentCookie}});check(x.r.ok&&x.json.children.length===1,'parent dashboard failed');
    const proof='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
    x=await req('/api/parent/payment-proofs',{method:'POST',headers:{Cookie:parentCookie,'Content-Type':'application/json'},body:JSON.stringify({student_ref_id:ref.id,amount:2500,payment_date:'2026-09-07',method:'GPay',payer_name:'Smoke Parent',payer_relation:'Parent',transaction_reference:'SMOKE-UTR',billing_period:'Sep 2026',proof_data_url:proof})});check(x.r.status===201,'payment proof failed');
    x=await req('/api/parent/renewals',{method:'POST',headers:{Cookie:parentCookie,'Content-Type':'application/json'},body:JSON.stringify({student_ref_id:ref.id,requested_course:'JEE Chemistry',preferred_mode:'Online'})});check(x.r.status===201,'renewal request failed');
    x=await req('/api/admin/payment-proofs',{headers:{Cookie:adminCookie}});check(x.r.ok&&x.json.proofs.length===1,'admin proof list failed');
    x=await req('/api/admin/renewals',{headers:{Cookie:adminCookie}});check(x.r.ok&&x.json.renewals.length===1,'admin renewals list failed');
    console.log('SMOKE TEST PASSED: admission hook, admin, invite, enrollment, parent signup, dashboard, required payment proof, renewal.');
  }catch(e){console.error('SMOKE TEST FAILED:',e.message);process.exitCode=1}
  finally{server.close(()=>{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}})}
});
