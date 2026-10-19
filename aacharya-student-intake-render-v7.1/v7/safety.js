'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {DatabaseSync} = require('node:sqlite');
function inspectFile(file) {
  const check = new DatabaseSync(file, {readOnly:true});
  try { return check.prepare('PRAGMA integrity_check').all().every(r => r.integrity_check === 'ok'); }
  finally { check.close(); }
}
function requireExisting({dbPath, dataDir, production}) {
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) return;
  const known = fs.existsSync(path.join(dataDir, '.aacharya-data-state.json')) ||
    (fs.existsSync(path.join(dataDir, 'backups')) && fs.readdirSync(path.join(dataDir, 'backups')).some(n=>n.endsWith('.sqlite')));
  if (known || (production && process.env.INIT_NEW_DATABASE !== 'true'))
    throw new Error('DATA SAFETY STOP: existing database is missing or empty. Check DATA_DIR and the persistent disk. No empty replacement or automatic restore was performed. See DATA_SAFETY.md.');
}
function snapshot({db, backupDir, keep=20}, reason='manual') {
  fs.mkdirSync(backupDir,{recursive:true});
  const suffix=String(reason).replace(/[^a-z0-9_-]/gi,'-').slice(0,45);
  const name='aacharya_tuition_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+suffix+'_'+crypto.randomBytes(4).toString('hex')+'.sqlite';
  const file=path.join(backupDir,name),temp=file+'.partial';
  try {
    db.exec("VACUUM INTO '"+temp.replaceAll("'","''")+"'");
    if (!inspectFile(temp)) throw new Error('Snapshot integrity check failed');
    const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temp,file);
    const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fs.writeFileSync(file+'.json',JSON.stringify({name,reason,sha256:hash,bytes:fs.statSync(file).size,verified:true,createdAt:new Date().toISOString()},null,2));
    const files=history(backupDir).filter(x=>!x.name.includes('pre-v7'));
    for (const old of files.slice(Math.max(5,Number(keep)||20))) {
      fs.unlinkSync(path.join(backupDir,old.name));
      if(fs.existsSync(path.join(backupDir,old.name+'.json')))fs.unlinkSync(path.join(backupDir,old.name+'.json'));
    }
    return file;
  } catch(e) {if(fs.existsSync(temp))fs.unlinkSync(temp);throw e;}
}
function history(dir) {
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(n=>/^aacharya_tuition_.*\.sqlite$/.test(n)).map(name=>{
    const st=fs.statSync(path.join(dir,name));let meta={};try{meta=JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));}catch{}
    return {name,size:st.size,createdAt:st.mtime.toISOString(),...meta};
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
function preflight(opts) {
  if(!opts.db.prepare('PRAGMA integrity_check').all().every(r=>r.integrity_check==='ok'))throw new Error('DATA SAFETY STOP: source database failed integrity check.');
  const table=opts.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if(!table || !opts.db.prepare('SELECT version FROM schema_migrations WHERE version=7').get()) return snapshot(opts,'pre-v7-migration');
  return null;
}
module.exports={requireExisting,snapshot,preflight,history,inspectFile};
