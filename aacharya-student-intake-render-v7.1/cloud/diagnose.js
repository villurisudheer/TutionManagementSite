'use strict';
// Read-only: does not claim the writer, initialize an academy, or migrate data.
const {Client}=require('./client');let stage='environment validation';
(async()=>{require('./config').validateStart();console.log('Environment names and format: OK (values hidden).');const client=new Client();stage='private storage check';await client.bucket();console.log('Private bucket: OK.');stage='cloud SQL and academy initialization';const s=await client.state(false);console.log('Existing academy snapshot: OK; revision '+Number(s.revision)+'.');console.log('Read-only diagnosis passed. Run npm start to verify restore and migrations.');})().catch(e=>{require('./errors').report(e,stage);process.exitCode=1;});
