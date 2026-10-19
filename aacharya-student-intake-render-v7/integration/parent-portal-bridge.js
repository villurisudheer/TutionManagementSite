'use strict';

const crypto = require('crypto');

module.exports = function mountParentPortalBridge({ app, db, rebuildWorkbook, adminName = 'Administrator', audit = null }) {
  const SECRET = String(process.env.PARENT_PORTAL_SECRET || '').trim();
  const EXTENSION_URL = String(process.env.PARENT_PORTAL_URL || '').trim().replace(/\/+$/, '');

  function nowIso(){ return new Date().toISOString(); }
  function clean(v,max=500){ return String(v??'').trim().slice(0,max); }
  function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
  function validDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')); }
  function one(sql,...params){ const r=db.prepare(sql).get(...params); return r?{...r}:null; }
  function rows(sql,...params){ return db.prepare(sql).all(...params).map(r=>({...r})); }
  function safeEqual(a,b){ const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length&&crypto.timingSafeEqual(x,y); }
  function bridgeAudit(action,entityType,entityId,details){
    if (typeof audit === 'function') return audit(action,entityType,entityId,details,adminName);
    try{ db.prepare('INSERT INTO audit_log(action,entity_type,entity_id,details,actor,created_at) VALUES(?,?,?,?,?,?)').run(action,entityType,String(entityId??''),JSON.stringify(details||{}),adminName,nowIso()); }catch{}
  }
  function auth(req,res,next){
    if(!SECRET) return res.status(503).json({ok:false,message:'Parent portal integration is not configured.'});
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    if(!safeEqual(token,SECRET)) return res.status(401).json({ok:false,message:'Invalid parent portal integration secret.'});
    next();
  }
  function nextReceipt(){
    const d=new Date(),ymd=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const prefix=`ALA-${ymd}-%`,count=Number(one('SELECT COUNT(*) c FROM payments WHERE receipt_no LIKE ?',prefix)?.c||0)+1;
    return `ALA-${ymd}-${String(count).padStart(3,'0')}`;
  }
  function refresh(){ try{ rebuildWorkbook(); }catch(e){ console.error('Parent bridge Excel rebuild failed:',e); } }

  app.get('/api/integration/parent/health',auth,(req,res)=>res.json({ok:true,service:'Aacharya Tuition Manager Parent Bridge',extensionConfigured:!!EXTENSION_URL}));

  app.get('/api/integration/parent/accepted-students',auth,(req,res)=>{
    const students=rows(`SELECT id,student_code,full_name,grade,subjects,parent_name,parent_email,parent_phone,status FROM students WHERE status!='Inactive' ORDER BY full_name`);
    res.json({ok:true,students});
  });

  app.get('/api/integration/parent/students/:id/summary',auth,(req,res)=>{
    const id=Number(req.params.id),student=one(`SELECT id,student_code,full_name,grade,subjects,status FROM students WHERE id=?`,id);
    if(!student)return res.status(404).json({ok:false,message:'Student not found.'});
    const upcomingClasses=rows(`SELECT id,class_date,start_time,end_time,duration_hours,subject,topic,mode,status FROM classes WHERE student_id=? AND status='Scheduled' ORDER BY class_date,start_time LIMIT 12`,id);
    const recentAttendance=rows(`SELECT id,attendance_date,status,notes FROM attendance WHERE student_id=? ORDER BY attendance_date DESC,id DESC LIMIT 30`,id);
    const att=one(`SELECT COUNT(*) total,SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) good,SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) present,SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) absent,SUM(CASE WHEN status='Late' THEN 1 ELSE 0 END) late FROM attendance WHERE student_id=? AND status!='Excused'`,id)||{};
    const total=Number(att.total||0),good=Number(att.good||0);
    const fees=rows(`SELECT id,billing_type,amount,billing_period,due_date,status,notes FROM fees WHERE student_id=? ORDER BY due_date DESC,id DESC`,id);
    const payments=rows(`SELECT id,receipt_no,payer_name,payer_relation,amount,payment_date,method,transaction_reference,billing_period,received_by,notes FROM payments WHERE student_id=? ORDER BY payment_date DESC,id DESC LIMIT 30`,id);
    const totalFees=fees.reduce((a,f)=>a+Number(f.amount||0),0),totalPaid=payments.reduce((a,p)=>a+Number(p.amount||0),0);
    const latestTests=rows(`SELECT id,test_name,subject,test_date,max_marks,marks_obtained,percentage,grade,teacher_remarks FROM tests WHERE student_id=? ORDER BY test_date DESC,id DESC LIMIT 12`,id);
    res.json({ok:true,student,upcomingClasses,attendance:{total,present:Number(att.present||0),absent:Number(att.absent||0),late:Number(att.late||0),percentage:total?Math.round(good/total*100):null,recent:recentAttendance},finance:{totalFees,totalPaid,pending:Math.max(0,totalFees-totalPaid),fees},payments,latestTests});
  });

  app.post('/api/integration/parent/payments',auth,(req,res)=>{
    const b=req.body||{},sid=Number(b.student_id),amount=num(b.amount),payer=clean(b.payer_name,120),date=clean(b.payment_date,20),method=clean(b.method,50),proofId=clean(b.parent_proof_id,80);
    if(!one('SELECT id FROM students WHERE id=?',sid)||amount<=0||!payer||!validDate(date)||!method||!proofId)return res.status(400).json({ok:false,message:'Student, amount, payer, date, method and parent proof id are required.'});
    const marker=`[PARENT_PROOF:${proofId}]`;
    const existing=one(`SELECT * FROM payments WHERE student_id=? AND notes LIKE ? LIMIT 1`,sid,`%${marker}%`);
    if(existing)return res.json({ok:true,payment:existing,idempotent:true});
    const receipt=nextReceipt(),notes=`${clean(b.notes,700)}\n${marker}`.trim();
    const info=db.prepare(`INSERT INTO payments(student_id,fee_id,receipt_no,payer_name,payer_relation,amount,payment_date,method,transaction_reference,billing_period,received_by,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sid,b.fee_id?Number(b.fee_id):null,receipt,payer,clean(b.payer_relation,50),amount,date,method,clean(b.transaction_reference,150),clean(b.billing_period,80),clean(b.received_by,120)||adminName,notes,nowIso());
    const id=Number(info.lastInsertRowid);bridgeAudit('CREATE','payment',id,{source:'Parent Portal',sid,amount,payer,receipt,parentProofId:proofId});refresh();res.status(201).json({ok:true,payment:one('SELECT * FROM payments WHERE id=?',id)});
  });

  async function notifyAdmissionAccepted(student){
    if(!EXTENSION_URL||!SECRET)return {ok:false,skipped:true,message:'PARENT_PORTAL_URL or PARENT_PORTAL_SECRET is not configured.'};
    const payload={main_student_id:student.id,student_code:student.student_code,full_name:student.full_name,grade:student.grade,subjects:student.subjects,parent_name:student.parent_name,parent_email:student.parent_email,parent_phone:student.parent_phone,status:student.status};
    try{
      const r=await fetch(EXTENSION_URL+'/api/integration/admission-accepted',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${SECRET}`},body:JSON.stringify(payload)});
      const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{}
      if(!r.ok||!json?.ok)throw new Error(json?.message||`HTTP ${r.status}`);
      bridgeAudit('NOTIFY_PARENT_EXTENSION','student',student.id,{extensionUrl:EXTENSION_URL,inviteCreated:!!json.invite});
      return json;
    }catch(e){console.error('Parent portal admission notification failed:',e.message);bridgeAudit('PARENT_EXTENSION_NOTIFY_FAILED','student',student.id,{error:e.message});return {ok:false,message:e.message};}
  }

  return { notifyAdmissionAccepted };
};
