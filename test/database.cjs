const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');

if(!process.env.TEST_DATABASE_URL){
 test('PostgreSQL integration suite',{skip:'Set TEST_DATABASE_URL to an isolated ssro_test_* database'},()=>{});
}else{
 process.env.NODE_ENV='test';
 process.env.MASTER_KEY='test-only-master-key-never-use-in-production';
 process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
 process.env.PUBLIC_ORIGIN='http://127.0.0.1';
 process.env.TRUSTED_PROXIES='loopback';
 process.env.SOURCE_FINGERPRINT_SQL="SELECT jsonb_build_object('fixture',true)";
 delete process.env.SSRO_BRIDGE_ENABLED;
 for(const key of Object.keys(process.env))if(key.startsWith('SSRO_BRIDGE_'))delete process.env[key];
 const {Pool}=require('pg');
 const {ResidencyDatabase}=require('../dist/database/residencyDb.js');
 const {openSnapshot}=require('../dist/crypto/snapshot.js');
 const {hashPassword}=require('../dist/crypto/cipher.js');
 const {migrateSecurity}=require('../scripts/migrate-security.cjs');
 const {createSimulationList}=require('../dist/services/simulationDownloads.js');
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2,connectionTimeoutMillis:2000});
 const db=new ResidencyDatabase(process.env.TEST_DATABASE_URL);
 const words=['fuego','trueno','bosque','cristal','viento'];
 let server,appDb,base,legacyId,legacySnapshot,legacyList;
 before(async()=>{
  const name=(await pool.query('SELECT current_database() AS name')).rows[0].name;
  assert.match(name,/^ssro_test_[a-z0-9_]+$/,'Tests may reset only explicitly named ssro_test_* databases');
  await pool.query('DROP SCHEMA IF EXISTS sorteo_web CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.query(fs.readFileSync(path.join(__dirname,'source-fixture.sql'),'utf8'));
  for(const file of ['02-sorteo-web.sql','03-residency.sql','04-all-careers.sql','05-uniform-rule.sql','06-source-bridge.sql','07-duplicate-exception.sql','08-draw-reversal.sql','090-shared-results.sql'])await pool.query(fs.readFileSync(path.join(__dirname,'../database',file),'utf8'));
  await pool.query("INSERT INTO sorteo_web.batch(id,period_id,sedes_id,career_ids,source,source_hash,imported_at,source_extracted_at,rule,row_counts) VALUES(1,1,1,ARRAY[1],'fixture','fixture',now(),now(),'uniform','{}')");
  legacySnapshot={id:1,winners:[],specialCases:[],userWords:words,createdAt:new Date().toISOString(),marker:'DATOS FICTICIOS PRIVADOS'};
  legacyId=(await pool.query(`INSERT INTO sorteo_web.draw_history(user_words_encrypted,server_phrase_encrypted,weather_snapshot_encrypted,k_selected_count,hex_breakdown_encrypted,hex_sum,winners_ids_encrypted,created_at,snapshot,input_snapshot)
   VALUES('legacy','legacy','legacy',0,'legacy',0,'legacy',$1,$2,$3) RETURNING id`,[new Date().toISOString(),legacySnapshot,{marker:'PADRON FICTICIO PRIVADO'}])).rows[0].id;
  legacyList={id:crypto.randomUUID(),createdAt:new Date().toISOString(),expires:Date.now()+3600000,people:[{fullName:'PERSONA FICTICIA',documentId:'123456',career:'MEDICINA',assignedHospital:'HOSPITAL FICTICIO'}]};
  await pool.query("INSERT INTO sorteo_web.shared_result(token,kind,simulation_id,simulation_snapshot,executed_at,created_by) VALUES($1,'SIMULATION',$2,$3,now(),'admin')",['a'.repeat(64),legacyList.id,legacyList]);
  await migrateSecurity(pool);
  await db.createAdmin('admin','password123');
  const appModule=require('../dist/residencyServer.js');
  appDb=appModule.db;
  server=appModule.default.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  base='http://127.0.0.1:'+server.address().port;
 });
 after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(appDb)await appDb.close();
  await db.close();await pool.end();
 });
 async function login(ip='192.0.2.1'){
  const res=await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded','x-forwarded-for':ip},body:new URLSearchParams({username:'admin',password:'password123',entropyWords:words.join(' ')})});
  assert.equal(res.status,302);
  return res.headers.get('set-cookie').split(';')[0];
 }
 test('migration protects existing snapshots and is idempotent',async()=>{
  const row=(await pool.query('SELECT snapshot,input_snapshot FROM sorteo_web.draw_history WHERE id=$1',[legacyId])).rows[0];
  assert.ok(row.snapshot.encrypted);assert.ok(row.input_snapshot.encrypted);
  assert.equal(JSON.stringify(row).includes('DATOS FICTICIOS'),false);
  assert.deepEqual(openSnapshot(row.snapshot),legacySnapshot);
  assert.equal((await db.savedSimulation(legacyList.id)).list.people[0].documentId,'123456');
  const again=await migrateSecurity(pool);
  assert.deepEqual(again,{protectedDraws:0,protectedSimulations:0});
  assert.deepEqual((await pool.query('SELECT snapshot FROM sorteo_web.draw_history WHERE id=$1',[legacyId])).rows[0].snapshot,row.snapshot);
 });
 test('migration rolls back instead of accepting corrupted encrypted snapshots',async()=>{
  const original=(await pool.query('SELECT input_snapshot FROM sorteo_web.draw_history WHERE id=$1',[legacyId])).rows[0].input_snapshot;
  await pool.query('UPDATE sorteo_web.draw_history SET input_snapshot=$1 WHERE id=$2',[{encrypted:'invalid'},legacyId]);
  await assert.rejects(migrateSecurity(pool),/CriptoFallo/);
  await pool.query('UPDATE sorteo_web.draw_history SET input_snapshot=$1 WHERE id=$2',[original,legacyId]);
 });
 test('logout revokes the copied cookie and tokens are hashed at rest',async()=>{
  const cookie=await login();
  assert.ok(cookie.length<256);
  const token=cookie.split('=')[1];
  const stored=(await pool.query('SELECT token_hash,payload_encrypted FROM sorteo_web.admin_session')).rows[0];
  assert.notEqual(stored.token_hash,token);assert.equal(stored.payload_encrypted.includes('fuego'),false);
  assert.equal((await fetch(base+'/',{headers:{cookie},redirect:'manual'})).status,200);
  assert.equal((await fetch(base+'/logout',{headers:{cookie},redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/',{headers:{cookie},redirect:'manual'})).status,302);
  assert.equal(await db.session(token),null);
 });
 test('password changes, deletion and expiry invalidate existing sessions',async()=>{
  await db.createAdmin('other-admin','password123');
  const first=await db.createSession('other-admin','password123',words);
  await pool.query('UPDATE sorteo_web.admin_users SET password_hash=$1 WHERE username=$2',[hashPassword('changed-password'),'other-admin']);
  assert.equal(await db.session(first.token),null);
  const second=await db.createSession('other-admin','changed-password',words);
  await pool.query("UPDATE sorteo_web.admin_session SET expires_at=now()-interval '1 second' WHERE admin_id=(SELECT id FROM sorteo_web.admin_users WHERE username='other-admin')");
  assert.equal(await db.session(second.token),null);
  const third=await db.createSession('other-admin','changed-password',words);
  await pool.query("DELETE FROM sorteo_web.admin_users WHERE username='other-admin'");
  assert.equal(await db.session(third.token),null);
 });
 test('different proxy clients have separate limits while repeated attempts are blocked',async()=>{
  for(let i=1;i<=21;i++){
   const res=await fetch(base+'/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-forwarded-for':'198.51.100.'+i},body:new URLSearchParams({username:'admin',password:'wrong-password',entropyWords:words.join(' ')}),redirect:'manual'});
   assert.equal(res.status,401);
  }
  for(let i=1;i<=21;i++){
   const res=await fetch(base+'/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-forwarded-for':'192.0.2.42'},body:new URLSearchParams({username:'admin',password:'wrong-password',entropyWords:words.join(' ')}),redirect:'manual'});
   assert.equal(res.status,i<=20?401:429);
  }
 });
 test('simulation data is encrypted, expires on both routes and is physically pruned',async()=>{
  const list=createSimulationList(await db.simulate('uniform',words));
  const token=await db.saveSimulation(list,'admin');
  const stored=(await pool.query('SELECT simulation_snapshot FROM sorteo_web.shared_result WHERE token=$1',[token])).rows[0].simulation_snapshot;
  assert.ok(stored.encrypted);assert.equal(JSON.stringify(stored).includes('123456'),false);
  const visible=await db.sharedResult(token);
  assert.deepEqual(Object.keys(visible.people[0]).sort(),['career','fullName','hospital']);
  assert.equal((await db.savedSimulation(list.id)).list.id,list.id);
  await pool.query("UPDATE sorteo_web.shared_result SET expires_at=now()-interval '1 second' WHERE token=$1",[token]);
  assert.equal(await db.savedSimulation(list.id),null);assert.equal(await db.sharedResult(token),null);
  const cookie=await login('192.0.2.2');
  assert.equal((await fetch(base+'/s/'+token)).status,404);
  assert.equal((await fetch(base+'/simulation/'+list.id,{headers:{cookie}})).status,404);
  assert.equal((await fetch(base+'/simulation/'+list.id+'/export/csv',{headers:{cookie}})).status,404);
  await db.pruneExpiredData();
  assert.equal((await pool.query('SELECT 1 FROM sorteo_web.shared_result WHERE token=$1',[token])).rowCount,0);
 });
 test('persistent simulations are capped at 50',async()=>{
  const simulation=await db.simulate('uniform',words);
  for(let i=0;i<51;i++)await db.saveSimulation(createSimulationList(simulation),'admin');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM sorteo_web.shared_result WHERE kind='SIMULATION'")).rows[0].n,50);
 });
 test('duplicate review unblocks confirmation and encrypted official draws remain verifiable offline',async()=>{
  await pool.query("INSERT INTO public.habilitacion(id_habilitacion,fid_estudiante,fid_periodo,fid_sedes,estado_habilitacion,estado,nota,asignacion_manual) VALUES(3,1,1,1,'APROBADO','ACTIVO',80,'')");
  const x=await db.preparation(),group=x.conflicts[0];
  assert.ok(x.errors.length>0);
  const cookie=await login('192.0.2.3'),csrf=(await db.session(cookie.split('=')[1])).csrf;
  const res=await fetch(base+'/preparation/resolve',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,key:group.key,hash:group.hash,keep:'1',reason:'Habilitación repetida verificada con el origen.',decisionReviewed:'yes'}),redirect:'manual'});
  assert.equal(res.status,302);
  const ready=await db.preparation();assert.deepEqual(ready.errors,[]);assert.deepEqual(ready.excluded,[3]);
  await db.confirm(ready.hash,'admin');
  const draw=await db.runOfficialDraw(words,'admin');
  assert.equal(draw.winners.length,1);assert.equal(draw.specialCases.length,1);
  const stored=(await pool.query('SELECT snapshot,input_snapshot FROM sorteo_web.draw_history WHERE id=$1',[draw.id])).rows[0];
  assert.ok(stored.snapshot.encrypted);assert.ok(stored.input_snapshot.encrypted);
  assert.equal((await db.getDrawById(draw.id)).winners[0].documentId,'123456');
  const pkg=await db.exportPackage(draw.id);
  const {verify}=require('../verify-result.cjs');assert.equal(verify(pkg).memoRecipients,2);
  const token=await db.officialShareToken(draw.id,'admin');
  assert.equal((await db.sharedResult(token)).people.length,2);
  assert.equal((await db.preparation()).drawId,draw.id);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ssro-package-test-'));
  try{
   const file=path.join(dir,'result.json');fs.writeFileSync(file,JSON.stringify(pkg));
   const cli=spawnSync(process.execPath,[path.join(__dirname,'../verify-result.cjs'),file],{env:{PATH:process.env.PATH},encoding:'utf8'});
   assert.equal(cli.status,0,cli.stderr);assert.match(cli.stdout,/Verificado:/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  const quota=(await pool.query('SELECT cupos_asignados FROM public.cupo_establecimiento_salud')).rows[0];
  assert.equal(quota.cupos_asignados,2);
  await assert.rejects(db.runOfficialDraw(words,'admin'),/ya tiene un sorteo/);
 });
}
