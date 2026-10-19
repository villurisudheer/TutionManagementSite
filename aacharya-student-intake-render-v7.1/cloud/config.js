'use strict';
const {error}=require('./errors');
function validateStart(env=process.env){const names=['STORAGE_MODE','SUPABASE_URL','ADMIN_EMAIL','ADMIN_PASSWORD','SESSION_SECRET'],missing=names.filter(n=>!String(env[n]||'').trim());if(!String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'').trim())missing.push('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');if(missing.length)throw error('CLOUD_CONFIG_MISSING',{fields:missing});if(env.STORAGE_MODE!=='supabase')throw error('CLOUD_STORAGE_MODE');if(String(env.SESSION_SECRET).length<24)throw error('CLOUD_SECRET_SHORT');if(env.ADMIN_PASSWORD==='ChangeMe123!')throw error('CLOUD_ADMIN_PASSWORD');}
module.exports={validateStart};
