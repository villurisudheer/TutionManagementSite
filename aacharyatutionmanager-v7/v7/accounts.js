'use strict';
const crypto=require('crypto');
const {hashPassword,verifyPassword,hash}=require('./auth');
module.exports=function(ctx){
  const {app,db,one,rows,now,auth,fail}=ctx;
  for(const [role,prefix] of [['ADMIN','/api/auth'],['PARENT','/api/parent'],['TEACHER','/api/teacher'],['STUDENT','/api/student']]){
    app.post(prefix+'/login',auth.login(role));app.post(prefix+'/logout',auth.logout(role));
    app.get(prefix+'/me',auth[role.toLowerCase()],(req,res)=>res.json({ok:true,user:auth.publicUser(req.user),admin:req.admin,parent:role==='PARENT'?auth.publicUser(req.user):undefined}));
    app.post(prefix+'/change-password',auth[role.toLowerCase()],(req,res)=>{
      if(!verifyPassword(req.body.current_password||'',req.user.password_hash))fail('Current password is incorrect.');
      const password=String(req.body.new_password||'');if(password.length<10||password.length>200)fail('Use a password between 10 and 200 characters.');
      const table=role==='PARENT'?'parent_accounts':'users';db.prepare('UPDATE '+table+' SET password_hash=?,session_version=session_version+1,updated_at=? WHERE id=?').run(hashPassword(password),now(),req.user.id);
      ctx.audit('CHANGE_PASSWORD','account',req.user.id,{role},req.actor);res.json({ok:true,message:'Password changed. Sign in again.'});
    });
  }
  app.get('/api/users',auth.admin,(req,res)=>res.json({ok:true,users:rows('SELECT id,role,full_name,email,teacher_id,student_id,permissions,status,last_login_at,created_at,updated_at FROM users ORDER BY role,full_name')}));
  function saveUser(req,res){
    const old=req.params.id?ctx.id('users',req.params.id):null,b={...old,...req.body},role=ctx.enum(b.role,['ADMIN','TEACHER','STUDENT'],'role'),name=ctx.required(b.full_name,'Name',120),email=ctx.required(b.email,'Email',180).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');
    const status=ctx.enum(b.status||'Active',['Active','Disabled'],'account status');
    if(old?.role==='ADMIN'&&(role!=='ADMIN'||status!=='Active')&&!one("SELECT 1 FROM users WHERE role='ADMIN' AND status='Active' AND id<>?",old.id))fail('The last active administrator cannot be disabled or changed.',409);
    const teacherId=role==='TEACHER'?ctx.id('teachers',b.teacher_id).id:null,studentId=role==='STUDENT'?ctx.id('students',b.student_id).id:null;
    let perms=req.body.permissions;if(typeof perms==='string')try{perms=JSON.parse(perms);}catch{fail('Permissions must be valid JSON.');}if(!perms)perms=JSON.parse(old?.permissions||'{}');
    const data={role,full_name:name,email,teacher_id:teacherId,student_id:studentId,status,permissions:JSON.stringify({finance:perms.finance===true}),updated_at:now()};
    if(req.body.password||!old){const p=String(req.body.password||'');if(p.length<10||p.length>200)fail('Use a password between 10 and 200 characters.');data.password_hash=hashPassword(p);}
    if(old)data.session_version=old.session_version+1;else {data.created_at=now();data.session_version=1;}
    const row=ctx.save('users',data,old?.id);ctx.audit(old?'UPDATE':'CREATE','user',row.id,{old:old?auth.publicUser(old):null,new:auth.publicUser(row)},req.actor);ctx.afterMutation('account');res.status(old?200:201).json({ok:true,user:auth.publicUser(row)});
  }
  app.post('/api/users',auth.admin,saveUser);app.put('/api/users/:id',auth.admin,saveUser);
  app.delete('/api/users/:id',auth.admin,(req,res)=>{req.body={status:'Disabled'};saveUser(req,res);});
  function inviteFor(student,req){
    const email=ctx.clean(req.body.parent_email??student.parent_email,180).toLowerCase(),phone=ctx.clean(req.body.parent_phone??student.parent_phone,40);
    if(ctx.setting('allow_multiple_guardians')==='false'&&one('SELECT 1 FROM parent_student_links WHERE student_id=? AND active=1',student.id))fail('Multiple guardians are disabled in Settings.',409);
    db.prepare('UPDATE parent_invites SET expires_at=? WHERE student_id=? AND used_at IS NULL AND parent_email=?').run(now(),student.id,email);
    const token=crypto.randomBytes(32).toString('base64url'),expires=new Date(Date.now()+7*86400000).toISOString();
    ctx.save('parent_invites',{token_hash:hash(token),student_id:student.id,parent_email:email,parent_phone:phone,expires_at:expires,created_at:now(),created_by:req.actor});
    ctx.audit('CREATE','parent_invite',student.id,{email,expires},req.actor);ctx.afterMutation('parent_invite');return {token,url:(ctx.production?'https://':'http://')+req.headers.host+'/parent/signup?invite='+token,expiresAt:expires};
  }
  app.post('/api/admin/parent-portal/invites/:studentId',auth.admin,(req,res)=>res.status(201).json({ok:true,invite:inviteFor(ctx.id('students',req.params.studentId),req)}));
  function validInvite(token,email){const invite=one('SELECT * FROM parent_invites WHERE token_hash=?',hash(token||''));if(!invite||invite.used_at||invite.expires_at<=now())fail('Invitation is invalid, expired or already used.');if(invite.parent_email&&email&&invite.parent_email.toLowerCase()!==email.toLowerCase())fail('Use the email address to which this invitation was issued.',403);return invite;}
  app.post('/api/parent/signup',(req,res)=>{
    const b=req.body,email=ctx.required(b.email,'Email',180).toLowerCase(),name=ctx.required(b.full_name,'Name',120),password=String(b.password||'');
    const invite=validInvite(b.invite,email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>200)fail('Enter a valid email and a password of 10–200 characters.');
    if(one('SELECT id FROM parent_accounts WHERE email=? COLLATE NOCASE',email))fail('An account exists. Sign in and use Link Another Child.',409);
    const p=ctx.save('parent_accounts',{full_name:name,email,phone:ctx.clean(b.phone,40),password_hash:hashPassword(password),status:'Active',session_version:1,created_at:now(),updated_at:now()});
    db.prepare('INSERT INTO parent_student_links(parent_id,student_id,relationship,created_at,active) VALUES(?,?,?,?,1)').run(p.id,invite.student_id,ctx.clean(b.relationship,60)||'Parent / Guardian',now());
    db.prepare('UPDATE parent_invites SET used_at=? WHERE id=?').run(now(),invite.id);p.role='PARENT';auth.issue(res,p);ctx.audit('CREATE','parent_account',p.id,{studentId:invite.student_id},name);ctx.afterMutation('parent_signup');res.status(201).json({ok:true});
  });
  app.post('/api/parent/link-invite',auth.parent,(req,res)=>{
    const invite=validInvite(req.body.invite,req.parent.email);
    db.prepare('INSERT INTO parent_student_links(parent_id,student_id,relationship,created_at,active) VALUES(?,?,?,?,1) ON CONFLICT(parent_id,student_id) DO UPDATE SET active=1,unlinked_at=NULL').run(req.parent.id,invite.student_id,ctx.clean(req.body.relationship,60)||'Parent / Guardian',now());db.prepare('UPDATE parent_invites SET used_at=? WHERE id=?').run(now(),invite.id);ctx.audit('LINK_CHILD','parent_account',req.parent.id,{studentId:invite.student_id},req.actor);ctx.afterMutation('parent_link');res.json({ok:true});
  });
  app.get('/api/admin/parent-portal/parents',auth.admin,(req,res)=>{ctx.lifecycle();res.json({ok:true,parents:rows('SELECT id,full_name,email,phone,status,manual_disabled,access_until,last_login_at,created_at,updated_at FROM parent_accounts ORDER BY full_name').map(p=>{const links=rows('SELECT l.*,s.full_name,s.student_code FROM parent_student_links l JOIN students s ON s.id=l.student_id WHERE l.parent_id=?',p.id);const enrolled=rows('SELECT e.* FROM enrollments e JOIN parent_student_links l ON l.student_id=e.student_id WHERE l.parent_id=? AND l.active=1 ORDER BY e.end_date DESC',p.id);return {...p,links,children:links.filter(x=>x.active).map(x=>x.full_name).join(', '),enrollment_status:[...new Set(enrolled.map(e=>e.status))].join(', '),course_end:enrolled[0]?.end_date||'',account_expiry:p.access_until||enrolled[0]?.grace_until||'',invitation_status:rows('SELECT CASE WHEN i.used_at IS NOT NULL THEN \'Used\' WHEN i.expires_at<=? THEN \'Expired\' ELSE \'Active\' END status FROM parent_invites i WHERE i.parent_email=? ORDER BY i.id DESC LIMIT 1',now(),p.email)[0]?.status||''};})});});
  app.post('/api/admin/parent-portal/parents/:id/status',auth.admin,(req,res)=>{const p=ctx.id('parent_accounts',req.params.id),action=ctx.enum(req.body.action,['disable','reactivate'],'action'),active=action==='reactivate';ctx.save('parent_accounts',{status:active?'Active':'Disabled',manual_disabled:active?0:1,disabled_at:active?null:now(),purge_after:null,access_until:active?(req.body.access_until?ctx.date(req.body.access_until):ctx.plus(ctx.today(),30)):p.access_until,session_version:p.session_version+1,updated_at:now()},p.id);ctx.audit(action.toUpperCase(),'parent_account',p.id,{manual:true},req.actor);ctx.afterMutation('parent_status');res.json({ok:true});});
  app.post('/api/admin/parent-portal/parents/:id/link',auth.admin,(req,res)=>{const p=ctx.id('parent_accounts',req.params.id),s=ctx.id('students',req.body.student_id);if(ctx.setting('allow_multiple_guardians')==='false'&&one('SELECT 1 FROM parent_student_links WHERE student_id=? AND active=1 AND parent_id<>?',s.id,p.id))fail('Multiple guardians are disabled.',409);db.prepare('INSERT INTO parent_student_links(parent_id,student_id,relationship,created_at,active) VALUES(?,?,?,?,1) ON CONFLICT(parent_id,student_id) DO UPDATE SET relationship=excluded.relationship,active=1,unlinked_at=NULL').run(p.id,s.id,ctx.clean(req.body.relationship,60)||'Guardian',now());ctx.audit('LINK_CHILD','parent_account',p.id,{student_id:s.id},req.actor);ctx.lifecycle(true);ctx.afterMutation('parent_link');res.json({ok:true});});
  app.post('/api/admin/parent-portal/parents/:id/unlink',auth.admin,(req,res)=>{const p=ctx.id('parent_accounts',req.params.id),s=ctx.id('students',req.body.student_id);db.prepare('UPDATE parent_student_links SET active=0,unlinked_at=? WHERE parent_id=? AND student_id=?').run(now(),p.id,s.id);ctx.audit('UNLINK_CHILD','parent_account',p.id,{student_id:s.id},req.actor);ctx.afterMutation('parent_unlink');res.json({ok:true});});
  app.post('/api/admin/parent-portal/parents/:id/credentials',auth.admin,(req,res)=>{const p=ctx.id('parent_accounts',req.params.id),password=String(req.body.password||'');if(password.length<10||password.length>200)fail('Use a password of 10–200 characters.');ctx.save('parent_accounts',{password_hash:hashPassword(password),session_version:p.session_version+1,updated_at:now()},p.id);ctx.audit('RESET_CREDENTIALS','parent_account',p.id,{reason:ctx.required(req.body.reason,'Reason')},req.actor);res.json({ok:true});});
  app.post('/api/admin/parent-portal/parents/:id/extend',auth.admin,(req,res)=>{const p=ctx.id('parent_accounts',req.params.id),date=ctx.date(req.body.access_until);if(date<ctx.today())fail('Access expiry must not be in the past.');ctx.save('parent_accounts',{access_until:date,updated_at:now()},p.id);ctx.lifecycle(true);ctx.audit('EXTEND_ACCESS','parent_account',p.id,{access_until:date},req.actor);ctx.afterMutation('parent_access');res.json({ok:true});});
};
