'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const authLib=require('./auth'),safety=require('./safety');
module.exports=function createV7(opts){
  const ctx={...opts,now:opts.nowIso,production:opts.nodeEnv==='production',clean:opts.clean};
  ctx.fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
  ctx.setting=(k,fallback='')=>ctx.one('SELECT value FROM settings WHERE key=?',k)?.value??fallback;
  ctx.date=(v,required=true)=>{if(!v&&!required)return '';const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)ctx.fail('Enter a valid date (YYYY-MM-DD).');return s;};
  ctx.today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:ctx.setting('timezone','Asia/Kolkata'),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  ctx.plus=(s,n)=>{const d=new Date(ctx.date(s)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+Number(n));return d.toISOString().slice(0,10);};
  ctx.amount=(v,zero=false)=>{const n=Number(v);if(!Number.isFinite(n)||n<(zero?0:0.01)||n>1e9)ctx.fail('Enter a valid '+(zero?'non-negative':'positive')+' amount.');return Math.round(n*100)/100;};
  ctx.id=(table,id)=>{const n=Number(id);if(!Number.isInteger(n)||n<=0)ctx.fail('Select a valid '+table.replace(/s$/,'')+'.');const row=ctx.one('SELECT * FROM '+table+' WHERE id=?',n);if(!row)ctx.fail('Record not found.',404);return row;};
  ctx.enum=(v,values,label)=>{if(!values.includes(v))ctx.fail('Invalid '+label+'. Allowed: '+values.join(', '));return v;};
  ctx.required=(v,label,max=1000)=>{const value=ctx.clean(v,max);if(!value)ctx.fail(label+' is required.');return value;};
  ctx.version=(old,body)=>{if(body.version!==undefined&&Number(body.version)!==Number(old.version||1))ctx.fail('This record changed in another window. Refresh before saving.',409);};
  ctx.snapshot=reason=>{const file=ctx.createDbSnapshot(reason);if(ctx.one("SELECT name FROM sqlite_master WHERE name='backup_events'"))ctx.db.prepare('INSERT INTO backup_events(name,reason,created_at) VALUES(?,?,?)').run(path.basename(file),reason,ctx.now());return file;};
  ctx.save=(table,data,id)=>{const fields=Object.keys(data);if(id){ctx.db.prepare('UPDATE '+table+' SET '+fields.map(k=>k+'=?').join(',')+' WHERE id=?').run(...fields.map(k=>data[k]??null),id);return ctx.id(table,id);}const r=ctx.db.prepare('INSERT INTO '+table+'('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')').run(...fields.map(k=>data[k]??null));return ctx.id(table,Number(r.lastInsertRowid));};
  ctx.change=(req,table,id,old,data,reason='')=>{const value=ctx.save(table,data,id);ctx.audit(old?'UPDATE':'CREATE',table,id||value.id,{old:old||null,new:value,reason},req.actor);ctx.afterMutation(table);return value;};
  require('./migrations')({...ctx,hashPassword:authLib.hashPassword,admin:opts.admin});
  let lastLifecycle=0;
  ctx.isAlumni=sid=>!!ctx.one('SELECT 1 FROM enrollments WHERE student_id=?',sid)&&!ctx.one("SELECT 1 FROM enrollments WHERE student_id=? AND status IN ('Upcoming','Active','Grace','On Hold')",sid);
  ctx.lifecycle=(force=false)=>{
    if(!force&&Date.now()-lastLifecycle<60000)return;
    lastLifecycle=Date.now();const d=ctx.today();
    for(const e of ctx.rows('SELECT * FROM enrollments')){
      const status=e.on_hold?'On Hold':d<e.start_date?'Upcoming':d<e.end_date?'Active':d<e.grace_until?'Grace':'Ended';
      if(status!==e.status){ctx.db.prepare('UPDATE enrollments SET status=?,updated_at=? WHERE id=?').run(status,ctx.now(),e.id);ctx.audit('LIFECYCLE','enrollment',e.id,{old_status:e.status,new_status:status},'Lifecycle');}
    }
    for(const p of ctx.rows("SELECT * FROM parent_accounts WHERE status<>'Purged' AND manual_disabled=0")){
      const children=ctx.rows('SELECT student_id FROM parent_student_links WHERE parent_id=? AND active=1',p.id);
      const stay=(p.access_until&&p.access_until>=d)||children.length===0||children.some(x=>!ctx.isAlumni(x.student_id))||ctx.one("SELECT id FROM renewal_requests WHERE parent_id=? AND status IN ('Pending','Clarification Requested')",p.id);
      const next=stay?'Active':'Disabled';if(p.status!==next){ctx.db.prepare('UPDATE parent_accounts SET status=?,disabled_at=?,purge_after=NULL,updated_at=? WHERE id=?').run(next,stay?null:ctx.now(),ctx.now(),p.id);ctx.audit('LIFECYCLE','parent_account',p.id,{old_status:p.status,new_status:next},'Lifecycle');}
    }
  };
  ctx.auth=authLib.create(ctx);
  ctx.studentScope=req=>req.user.role==='ADMIN'?ctx.rows('SELECT id FROM students').map(x=>x.id):req.user.role==='STUDENT'?[req.user.student_id]:req.user.role==='PARENT'?ctx.rows('SELECT student_id id FROM parent_student_links WHERE parent_id=? AND active=1',req.user.id).map(x=>x.id):ctx.rows("SELECT student_id id FROM teacher_students WHERE teacher_id=? AND active=1 UNION SELECT bs.student_id id FROM batches b JOIN batch_students bs ON bs.batch_id=b.id WHERE b.teacher_id=? AND bs.active=1 AND b.status='Active'",req.user.teacher_id,req.user.teacher_id).map(x=>x.id);
  ctx.attendance=sid=>{const list=ctx.rows('SELECT a.*,c.subject,c.start_time,c.end_time,c.teacher_id,c.batch_id FROM v7_attendance a LEFT JOIN classes c ON c.id=a.class_id'+(sid?' WHERE a.student_id=?':'')+' ORDER BY a.attendance_date DESC,a.id DESC',...(sid?[sid]:[]));const present=list.filter(x=>x.status==='Present').length;return {log:list,total:list.length,present,absent:list.filter(x=>x.status==='Absent').length,late:list.filter(x=>x.status==='Late').length,excused:list.filter(x=>x.status==='Excused').length,percentage:list.length?Math.round(present/list.length*1000)/10:0};};
  ctx.finance=sid=>{
    const fees=ctx.rows('SELECT * FROM fees WHERE student_id=? AND voided_at IS NULL ORDER BY COALESCE(due_date,\'9999\'),id',sid);
    const payments=ctx.rows("SELECT p.*,COALESCE(m.current_version,1) current_version,m.parent_proof_id FROM payments p LEFT JOIN payment_current_meta m ON m.payment_id=p.id WHERE p.student_id=? AND p.status='Current' ORDER BY p.payment_date,p.id",sid);
    const credit=new Map(payments.map(p=>[p.id,Math.round(p.amount*100)]));const allocated=new Map();
    for(const f of fees){let remaining=f.status==='Waived'?0:Math.round(f.amount*100),sum=0;for(const p of payments.filter(p=>p.fee_id===f.id)){const used=Math.min(remaining,credit.get(p.id));remaining-=used;sum+=used;credit.set(p.id,credit.get(p.id)-used);}allocated.set(f.id,sum);}
    for(const f of fees){let remaining=(f.status==='Waived'?0:Math.round(f.amount*100))-allocated.get(f.id);for(const p of payments.filter(p=>!p.fee_id)){const used=Math.min(remaining,credit.get(p.id));remaining-=used;allocated.set(f.id,allocated.get(f.id)+used);credit.set(p.id,credit.get(p.id)-used);}}
    const today=ctx.today();
    const ledger=fees.map(f=>{const paid=allocated.get(f.id)/100,balance=f.status==='Waived'?0:Math.max(0,Math.round((f.amount-paid)*100)/100),overdue=balance>0&&f.due_date&&f.due_date<today;const used=Number(ctx.one("SELECT COALESCE(SUM(duration_hours),0) n FROM classes WHERE student_id=? AND status='Completed'"+(f.enrollment_id?' AND enrollment_id=?':" AND (?='' OR substr(class_date,1,7)=?)"),sid,...(f.enrollment_id?[f.enrollment_id]:[/^\d{4}-\d{2}$/.test(f.billing_period||'')?f.billing_period:'',f.billing_period||'']))?.n||0);const days=overdue?Math.floor((Date.parse(today)-Date.parse(f.due_date))/86400000):0;return {...f,paid,pending:balance,effective_status:f.status==='Waived'?'Waived':!balance?'Paid':overdue?'Overdue':paid?'Partially Paid':'Pending',hours_used:used,hours_remaining:Math.max(0,f.total_hours_included-used),overdue_days:days,aging_bucket:!days?'Not overdue':days<=30?'1–30 days':days<=60?'31–60 days':days<=90?'61–90 days':'90+ days'};});
    const billed=ledger.reduce((a,f)=>a+(f.status==='Waived'?0:Math.round(f.amount*100)),0)/100,paid=payments.reduce((a,p)=>a+Math.round(p.amount*100),0)/100;
    return {billed,paid,pending:Math.max(0,Math.round((billed-paid)*100)/100),credit:Math.max(0,Math.round((paid-billed)*100)/100),fees:ledger,payments};
  };
  ctx.privateDir=path.join(ctx.dataDir,'private-v7');fs.mkdirSync(ctx.privateDir,{recursive:true});
  ctx.proof=(dataUrl)=>{
    const m=/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(dataUrl||''));if(!m)ctx.fail('Payment screenshot/receipt is compulsory. Upload PNG, JPG, WEBP or PDF.');
    const bytes=Buffer.from(m[2],'base64'),max=Number(process.env.MAX_PROOF_BYTES||5242880);if(bytes.length<8||bytes.length>max)ctx.fail('File is empty, invalid, or exceeds the upload size limit.');
    const valid=m[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:m[1]==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':bytes.toString('ascii',0,5)==='%PDF-';if(!valid)ctx.fail('File contents do not match the selected format.');
    const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf'}[m[1]],filename=crypto.randomUUID()+ext;
    return {bytes,mime:m[1],filename,sha256:authLib.hash(bytes)};
  };
  ctx.storeProof=(dataUrl,dir=ctx.privateDir)=>{const p=ctx.proof(dataUrl);fs.writeFileSync(path.join(dir,p.filename),p.bytes,{flag:'wx',mode:0o600,flush:true});return p;};
  ctx.file=(res,dir,filename,mime)=>{if(path.basename(filename)!==filename)ctx.fail('Invalid file reference.',400);const file=path.join(dir,filename);if(!fs.existsSync(file))ctx.fail('File unavailable. Check Data Safety Center.',404);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',mime);res.setHeader('Content-Disposition','inline; filename="'+path.basename(filename)+'"');res.sendFile(file);};
  ctx.mount=()=>{
    ctx.app.use(require('./security')(ctx));
    ctx.app.post('/api/integration/parent/payments',(req,res)=>res.status(410).json({ok:false,message:'Use the integrated Parent Portal to upload proof, then approve it in Admin. Legacy remote payment writes are retired in V7.'}));
    require('./accounts')(ctx);require('./management')(ctx);require('./academics')(ctx);require('./finance')(ctx);require('./portal')(ctx);require('./reports')(ctx);
  };
  return ctx;
};
