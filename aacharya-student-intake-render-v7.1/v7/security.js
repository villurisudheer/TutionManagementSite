'use strict';
const crypto=require('crypto');
const context=require('./context');
module.exports=function security(ctx){return function(req,res,next){
  const api=req.path.startsWith('/api/');
  if(api||/\/(admin|parent|teacher|student)(\/|$)/.test(req.path)){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if(ctx.production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(!api)return next();
  const changing=['POST','PUT','PATCH','DELETE'].includes(req.method);
  if(changing){
    const origin=req.headers.origin;
    if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({ok:false,message:'Cross-site request refused.'});}catch{return res.status(403).json({ok:false,message:'Invalid origin.'});}}
    if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({ok:false,message:'Cross-site request refused.'});
    const type=String(req.headers['content-type']||'');
    if(type&&!type.startsWith('application/json'))return res.status(415).json({ok:false,message:'Use application/json for API changes.'});
  }
  for(const role of ['ADMIN','PARENT','TEACHER','STUDENT']){const u=ctx.auth.resolve(req,role);if(u){ctx.auth.set(req,u);break;}}
  return context.run(req,()=>{
    if(!changing||/\/api\/(data-safety|excel|integration)\//.test(req.path))return next();
    const key=String(req.headers['idempotency-key']||'').slice(0,120),scope=(req.user?req.user.role+':'+req.user.id:'public')+':'+req.method+':'+req.path;
    const digest=crypto.createHash('sha256').update(JSON.stringify(req.body||{})).digest('hex');
    const cacheable=key&&!/\/auth\/|\/login|\/signup|\/logout|password|credentials/.test(req.path);
    if(cacheable){const old=ctx.one('SELECT * FROM request_keys WHERE scope=? AND key=?',scope,key);if(old){if(old.body_hash!==digest)return res.status(409).json({ok:false,message:'This retry key belongs to different data. Refresh before saving.'});res.statusCode=old.status_code;return res.json(JSON.parse(old.response));}}
    try {
      if(req.user?.role==='ADMIN' && (/\/payments\/\d+$/.test(req.path)||/repair/.test(req.path)))ctx.snapshot('before-financial-change');
      ctx.db.exec('SAVEPOINT request_change');
    }catch(e){console.error(e);return res.status(503).json({ok:false,message:'Could not prepare a safe database change. No data was changed.'});}
    let open=true;const json=res.json.bind(res);
    res.json=payload=>{
      if(open){
        try{
          if(res.statusCode>=400||payload?.ok===false)ctx.db.exec('ROLLBACK TO request_change; RELEASE request_change');
          else {
            if(cacheable)ctx.db.prepare('INSERT INTO request_keys(scope,key,body_hash,response,status_code,created_at) VALUES(?,?,?,?,?,?)').run(scope,key,digest,JSON.stringify(payload),res.statusCode,ctx.now());
            ctx.db.exec('RELEASE request_change');
          }
          open=false;
        }catch(e){console.error(e);try{ctx.db.exec('ROLLBACK TO request_change; RELEASE request_change');}catch{}open=false;res.statusCode=500;payload={ok:false,message:'Save failed safely. Refresh and retry.'};}
      }
      return json(payload);
    };
    res.once('close',()=>{if(open){try{ctx.db.exec('ROLLBACK TO request_change; RELEASE request_change');}catch{}open=false;}});
    return next();
  });
};};
