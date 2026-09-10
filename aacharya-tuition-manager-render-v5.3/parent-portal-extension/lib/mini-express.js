'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const querystring=require('querystring');

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
function enhanceRes(res){
  res.status=function(n){res.statusCode=n;return res};
  res.json=function(obj){if(res.writableEnded)return;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(obj));};
  res.send=function(body){if(res.writableEnded)return;if(Buffer.isBuffer(body)){res.end(body);return;}if(typeof body==='object'){return res.json(body)}res.end(String(body));};
  res.sendFile=function(file){try{const st=fs.statSync(file);if(!st.isFile())throw new Error('not file');res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.setHeader('Content-Length',st.size);fs.createReadStream(file).pipe(res);}catch{res.statusCode=404;res.end('Not Found')}};
  res.download=function(file,name){try{const st=fs.statSync(file);if(!st.isFile())throw new Error('not file');res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="${String(name||path.basename(file)).replace(/"/g,'')}"`);res.setHeader('Content-Length',st.size);fs.createReadStream(file).pipe(res);}catch{res.statusCode=404;res.end('Not Found')}};
}
function compileRoute(pattern){const names=[];const parts=String(pattern).split('/').map(p=>{if(p.startsWith(':')){names.push(p.slice(1));return '([^/]+)'}return p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')});return{re:new RegExp('^'+parts.join('/')+'/?$'),names};}
function express(){
  const stack=[];const errorStack=[];
  const app=function(){};
  app.disable=()=>app;
  app.use=function(a,b){let prefix='/',fn=a;if(typeof a==='string'){prefix=a;fn=b}if(typeof fn!=='function')throw new TypeError('middleware must be function');if(fn.length===4){errorStack.push({prefix,fn})}else stack.push({type:'mw',prefix,fn});return app};
  for(const method of ['GET','POST','PUT','PATCH','DELETE'])app[method.toLowerCase()]=function(pattern,...handlers){const c=compileRoute(pattern);for(const fn of handlers)stack.push({type:'route',method,pattern,compiled:c,fn});return app};
  app.listen=function(port,host,cb){if(typeof host==='function'){cb=host;host=undefined}const server=http.createServer(async(req,res)=>{enhanceRes(res);try{const u=new URL(req.url,'http://localhost');req.path=decodeURIComponent(u.pathname);req.query=Object.fromEntries(u.searchParams.entries());req.params={};req.ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();req.body=req.body||{};let i=0;
      const next=async(err)=>{if(err)return handleError(err,0);if(res.writableEnded)return;if(i>=stack.length){res.statusCode=404;return res.end('Not Found')}const item=stack[i++];try{if(item.type==='mw'){if(!req.path.startsWith(item.prefix))return next();return item.fn(req,res,next)}if(item.method!==req.method)return next();const m=item.compiled.re.exec(req.path);if(!m)return next();req.params={};item.compiled.names.forEach((n,j)=>req.params[n]=decodeURIComponent(m[j+1]));return item.fn(req,res,next)}catch(e){return next(e)}};
      const handleError=async(err,j)=>{if(res.writableEnded)return;if(j>=errorStack.length){console.error(err);res.statusCode=500;return res.end('Server error')}const item=errorStack[j];if(!req.path.startsWith(item.prefix))return handleError(err,j+1);try{return item.fn(err,req,res,(e)=>e?handleError(e,j+1):handleError(err,j+1))}catch(e){return handleError(e,j+1)}};
      await next();
    }catch(e){console.error(e);if(!res.writableEnded){res.statusCode=500;res.end('Server error')}}});return server.listen(port,host,cb)};
  return app;
}
express.json=function(opts={}){const limit=parseLimit(opts.limit||'1mb');return bodyParser('json',limit)};
express.urlencoded=function(opts={}){const limit=parseLimit(opts.limit||'1mb');return bodyParser('url',limit)};
function parseLimit(v){const m=/^(\d+(?:\.\d+)?)(kb|mb|b)?$/i.exec(String(v));if(!m)return 1024*1024;const n=Number(m[1]);return Math.floor(n*(m[2]?.toLowerCase()==='mb'?1024*1024:m[2]?.toLowerCase()==='kb'?1024:1))}
function bodyParser(type,limit){return function(req,res,next){if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return next();const ct=String(req.headers['content-type']||'').toLowerCase();if(type==='json'&&!ct.includes('application/json'))return next();if(type==='url'&&!ct.includes('application/x-www-form-urlencoded'))return next();let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>limit){res.statusCode=413;res.end('Payload Too Large');req.destroy();}else chunks.push(c)});req.on('end',()=>{if(res.writableEnded)return;try{const text=Buffer.concat(chunks).toString('utf8');req.body=type==='json'?(text?JSON.parse(text):{}):querystring.parse(text);next()}catch(e){res.statusCode=400;res.json({ok:false,message:'Invalid request body.'})}});req.on('error',next)}};
express.static=function(root,opts={}){const abs=path.resolve(root);return function(req,res,next){if(!['GET','HEAD'].includes(req.method))return next();let rel;try{rel=decodeURIComponent(req.path)}catch{return next()}if(rel.includes('\0'))return next();let file=path.resolve(abs,'.'+rel);if(!file.startsWith(abs))return next();const candidates=[file];if(opts.extensions&&path.extname(file)==='')for(const ext of opts.extensions)candidates.push(file+'.'+ext);for(const f of candidates){try{const st=fs.statSync(f);if(st.isFile()){res.setHeader('Content-Type',MIME[path.extname(f).toLowerCase()]||'application/octet-stream');res.setHeader('Content-Length',st.size);if(req.method==='HEAD')return res.end();fs.createReadStream(f).pipe(res);return}}catch{}}next()}};
module.exports=express;
