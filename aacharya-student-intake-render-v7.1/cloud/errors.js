'use strict';
// Only controlled messages reach production logs. Never include provider error bodies, keys or raw URLs.
const messages={
 CLOUD_CONFIG_MISSING:'Required environment settings are missing. Add the listed names in Render > Environment, then save and redeploy.',
 CLOUD_STORAGE_MODE:'Set STORAGE_MODE=supabase in Render > Environment.',
 CLOUD_SECRET_SHORT:'SESSION_SECRET must contain at least 24 characters. Use a private randomly generated value.',
 CLOUD_ADMIN_PASSWORD:'Replace the example ADMIN_PASSWORD with a private password.',
 CLOUD_URL_INVALID:'SUPABASE_URL must be the project HTTPS origin, for example https://PROJECT.supabase.co, without a dashboard path, quotes or credentials.',
 CLOUD_KEY_PUBLIC:'A public/publishable/anon key cannot administer the private academy database. Use a Supabase secret key (sb_secret_...) or legacy service_role key on the server.',
 CLOUD_KEY_FORMAT:'The configured Supabase server key has an unsupported format. Use sb_secret_... or a legacy service_role JWT; copy it without surrounding quotes.',
 CLOUD_KEY_CONFLICT:'SUPABASE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY differ. Set only one server key to avoid ambiguity.',
 CLOUD_AUTH_REJECTED:'Supabase rejected the server key (HTTP 401/403). Check that the key belongs to SUPABASE_URL, is a secret/service_role key, and has not been revoked.',
 CLOUD_SQL_MISSING:'Cloud SQL tables or functions are missing (HTTP 404). Run cloud/supabase.sql in this Supabase project SQL editor.',
 CLOUD_BUCKET_MISSING:'Private bucket aacharya-private was not found. Run cloud/supabase.sql or create that bucket as private.',
 CLOUD_BUCKET_PUBLIC:'Bucket aacharya-private is public. Make it private in Supabase Storage before restarting.',
 CLOUD_NOT_INITIALIZED:'Cloud schema is reachable, but no academy snapshot exists. Import a complete backup with npm run cloud:import -- --from /path/to/backup. Only a genuinely empty academy may use --new --confirm-empty.',
 CLOUD_NETWORK:'Could not reach Supabase. Check SUPABASE_URL, project status (including pausing), DNS and connectivity.',
 CLOUD_TIMEOUT:'Supabase did not respond within 20 seconds. Check project status and connectivity, then retry.',
 CLOUD_HTTP_UNAVAILABLE:'Supabase returned an unavailable/quota/service error. Check its project dashboard, usage and service status.',
 CLOUD_REQUEST_REJECTED:'Supabase rejected the request. Check the reported startup stage and HTTP status; confirm cloud/supabase.sql ran successfully in the same project.',
 CLOUD_OWNER_CHANGED:'A newer deployment owns the academy. This process cannot write; restart the current service.',
 CLOUD_PRIVATE_FILE_MISSING:'A referenced private file is unavailable in cloud storage. Recover the complete backup; no empty replacement was created.',
 CLOUD_INTEGRITY:'Remote database/file verification failed. Preserve cloud history and recover a complete verified backup.',
 CLOUD_RESPONSE_INVALID:'Supabase returned an unexpected response. Verify the project URL, SQL functions and service status.',
 CLOUD_STARTUP_FAILED:'Startup failed at the reported stage. Existing confirmed cloud data remains unchanged. Run npm run cloud:diagnose and review CLOUD_TROUBLESHOOTING.md.'
};
function error(code,extra={}){const e=new Error(code+': '+messages[code]);e.code=code;Object.assign(e,extra);return e;}
function safe(e){if(messages[e?.code])return e;if(/checksum|integrity|row counts/i.test(String(e?.message||'')))return error('CLOUD_INTEGRITY');if(/referenced private file|file manifest/i.test(String(e?.message||'')))return error('CLOUD_PRIVATE_FILE_MISSING');return error('CLOUD_STARTUP_FAILED');}
function report(e,stage){const x=safe(e);console.error('[Aacharya cloud] '+x.message);console.error('[Aacharya cloud] Stage: '+stage+(Number.isInteger(x.status)?' | HTTP '+x.status:''));if(Array.isArray(x.fields))console.error('[Aacharya cloud] Missing settings: '+x.fields.join(', '));console.error('[Aacharya cloud] Startup stopped safely. No empty database or automatic restore was created.');}
module.exports={error,safe,report};
