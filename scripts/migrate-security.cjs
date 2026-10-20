const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const {requiredEnv}=require('../dist/config.js');
const {sealSnapshot,openSnapshot}=require('../dist/crypto/snapshot.js');

async function migrateSecurity(pool){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('sorteo_residencias'))");
  await c.query(fs.readFileSync(path.join(__dirname,'../database/10-security.sql'),'utf8'));
  let last=0,protectedDraws=0,protectedSimulations=0;
  while(true){
   const rows=(await c.query('SELECT id,snapshot,input_snapshot FROM sorteo_web.draw_history WHERE id>$1 ORDER BY id LIMIT 100 FOR UPDATE',[last])).rows;
   if(!rows.length)break;
   for(const row of rows){
    const snapshot=openSnapshot(row.snapshot),input=openSnapshot(row.input_snapshot);
    const needsProtection=(row.snapshot&&!row.snapshot.encrypted)||(row.input_snapshot&&!row.input_snapshot.encrypted);
    if(needsProtection){
     await c.query('UPDATE sorteo_web.draw_history SET snapshot=$1,input_snapshot=$2 WHERE id=$3',[
      snapshot===null?null:JSON.stringify(sealSnapshot(snapshot)),input===null?null:JSON.stringify(sealSnapshot(input)),row.id]);
     protectedDraws++;
    }
    last=row.id;
   }
  }
  const simulations=(await c.query("SELECT token,simulation_snapshot FROM sorteo_web.shared_result WHERE kind='SIMULATION' FOR UPDATE")).rows;
  for(const row of simulations){
   const snapshot=openSnapshot(row.simulation_snapshot);
   if(!row.simulation_snapshot.encrypted){
    await c.query('UPDATE sorteo_web.shared_result SET simulation_snapshot=$1 WHERE token=$2',[JSON.stringify(sealSnapshot(snapshot)),row.token]);
    protectedSimulations++;
   }
  }
  await c.query('COMMIT');
  return {protectedDraws,protectedSimulations};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
module.exports={migrateSecurity};
if(require.main===module){
 const pool=new Pool({connectionString:requiredEnv('DATABASE_URL'),max:1,connectionTimeoutMillis:5000});
 migrateSecurity(pool).then(result=>console.log('Migración de seguridad completada:',result))
  .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
}
