#!/usr/bin/env node
// OLD website VPS. Read private settings locally; print no URL or credentials.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'../..'));
async function main() {
  let url = process.env.STROVA_DATABASE_URL;
  if (!url) {
    const filename='/etc/strova-postgres/connection.env';
    const stat=fs.statSync(filename);
    if (stat.mode & 0o077) throw new Error('PRIVATE_CONNECTION_FILE_PERMISSIONS');
    const text=fs.readFileSync(filename,'utf8');
    url=/^STROVA_DATABASE_URL=(.+)$/m.exec(text)?.[1].trim();
  }
  if (!url) throw new Error('DATABASE_URL_MISSING');
  const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:6000});
  const client=await pool.connect();
  try {
    const result=(await client.query(`SELECT current_user AS role,current_setting('server_version') AS version,
      current_setting('default_transaction_read_only') AS read_only,s.backup_id,
      s.source_documents,s.missing_parents,s.schema_version
      FROM strova_data.migration_state s WHERE singleton`)).rows[0];
    if(!result||result.role!=='strova_app'||result.read_only!=='off'||result.schema_version!==1)throw new Error('APPLICATION_DATABASE_NOT_READY');
    await client.query('BEGIN');
    await client.query(`INSERT INTO strova_data.documents(path,collection_path,collection_id,body)
      VALUES('__connectionChecks/probe','__connectionChecks','__connectionChecks','["m",{}]')
      ON CONFLICT(key) DO UPDATE SET body=EXCLUDED.body`);
    await client.query('ROLLBACK');
    console.log('APPLICATION_DATABASE_READY '+JSON.stringify({...result,switchPerformed:false}));
  } catch(error) { try{await client.query('ROLLBACK');}catch{} throw error; }
  finally{client.release();await pool.end();}
}
main().catch(error=>{console.error('DATABASE_CHECK_FAILED '+(error.code||'configuration-or-connection'));process.exitCode=1;});
