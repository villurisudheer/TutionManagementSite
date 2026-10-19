'use strict';
const crypto=require('crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
class Client {
 constructor(env=process.env){this.url=String(env.SUPABASE_URL||'').replace(/\/$/,'');this.key=env.SUPABASE_SERVICE_ROLE_KEY;const u=new URL(this.url);if((u.protocol!=='https:'&&!(env.NODE_ENV==='test'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.pathname!=='/'||u.username||u.password||u.search||u.hash||!this.key)throw Error('Configure a Supabase HTTPS origin and server-only service role key.');}
 async request(route,options={}){const r=await fetch(this.url+route,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:this.key,Authorization:'Bearer '+this.key,...options.headers}});if(!r.ok){const e=Error('Cloud request failed ('+r.status+'). Check connectivity, SQL setup and credentials.');e.status=r.status;throw e;}return r;}
 async rpc(name,data){return (await(await this.request('/rest/v1/rpc/aacharya_cloud_'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json())[0];}
 async state(full=true){const rows=await(await this.request('/rest/v1/aacharya_cloud_state?id=eq.academy&select='+(full?'*':'owner,generation,revision,commit_id,updated_at'))).json();if(!rows[0])throw Error('CLOUD_NOT_INITIALIZED: import an existing backup or explicitly initialize a new academy.');return rows[0];}
 async bucket(){const b=await(await this.request('/storage/v1/bucket/aacharya-private')).json();if(b.public!==false)throw Error('Private storage bucket is missing or public. Startup refused.');}
 async upload(bytes){const key='objects/'+hash(bytes);try{await this.request('/storage/v1/object/aacharya-private/'+key,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body:bytes});}catch(e){try{await this.download(key,hash(bytes));}catch{throw e;}}return key;}
 async download(key,sha){if(!/^objects\/[a-f0-9]{64}$/.test(key))throw Error('Invalid private object key');const b=Buffer.from(await(await this.request('/storage/v1/object/aacharya-private/'+key)).arrayBuffer());if(hash(b)!==sha)throw Error('Private file checksum mismatch');return b;}
 async history(){return (await this.request('/rest/v1/aacharya_cloud_history?select=revision,created_at&order=revision.desc')).json();}
 async historical(n){if(!/^\d+$/.test(String(n)))throw Error('Invalid revision');const a=await(await this.request('/rest/v1/aacharya_cloud_history?revision=eq.'+n+'&select=*')).json();if(!a[0])throw Error('Backup unavailable');return a[0];}
}
module.exports={Client,hash};
