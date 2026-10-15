import crypto from 'node:crypto';
import {createOfficialShareLink,saveSharedSimulation,savedSimulation,sharedResult} from '../services/sharedResults.js';
import {SimulationList} from '../services/simulationDownloads.js';
import {PoolClient} from 'pg';
import {EncryptedDatabase,ParticipantRecord,HospitalRecord,DrawHistoryRecord} from './db.js';
import {encryptPacked,decryptPacked} from '../crypto/cipher.js';
import {assign,ALGORITHM} from '../services/lottery.js';
import {deriveHumanSeed,HUMAN_SEED_DERIVATION} from '../services/humanSeed.js';
import {buildResultPackage,memoManifest} from '../services/resultPackage.js';
import {fingerprintSQL,requireSameFingerprint,bridgeEnabled} from '../services/sourceBridge.js';

export interface Resident extends ParticipantRecord {
 careerId:number;studentId:number;personId:number;documentType:number;documentNumber:string;complement:string;
 status:string;recordState:string;studentState:string;score:number;hospitalId:number|null;
 foreignUniversity:boolean;manualReason:string;
}
export interface Vacancy extends HospitalRecord {quotaId:number;careerId:number;career:string; actualAssigned:number;state:string;hospitalState:string;}
export const digest=(v:unknown)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize=(s:string)=>s.normalize('NFKC').trim().toUpperCase().replace(/[\s.\-_]/g,'');
const rosterSQL=`SELECT h.id_habilitacion AS id,e.id_estudiante AS "studentId",p.id_persona AS "personId",
 concat_ws(' ',nullif(trim(p.nombres),''),nullif(trim(p.primer_apellido),''),nullif(trim(p.segundo_apellido),'')) AS "fullName",
 p.documento_identidad AS "documentNumber",coalesce(p.complemento_documento,'') AS complement,p.fid_tipo_documento AS "documentType",
 concat_ws('-',p.documento_identidad,nullif(p.complemento_documento,'')) AS "documentId",
 e.correo_electronico AS email,u.nombre AS university,u.extranjero AS "foreignUniversity",t.nombre AS career,t.id_tipo_carrera AS "careerId",
 h.id_habilitacion::text AS "studentCode",h.estado_habilitacion AS status,h.estado AS "recordState",e.estado AS "studentState",
 h.nota::float8 AS score,h.fid_establecimiento_salud AS "hospitalId",coalesce(h.asignacion_manual,'') AS "manualReason",
 coalesce(es.establecimiento,'') AS "assignedHospital",coalesce(es.establecimiento,'') AS "specialHospital",
 coalesce(h.asignacion_manual,'') AS "specialReason",h._fecha_creacion::text AS "createdAt"
 FROM public.habilitacion h JOIN public.estudiante e ON e.id_estudiante=h.fid_estudiante
 JOIN public.persona p ON p.id_persona=e.fid_persona JOIN public.carrera c ON c.id_carrera=e.fid_carrera
 JOIN public.tipo_carrera t ON t.id_tipo_carrera=c.fid_tipo_carrera JOIN public.universidad u ON u.id_universidad=e.fid_universidad
 LEFT JOIN public.establecimiento_salud es ON es.id_establecimiento_salud=h.fid_establecimiento_salud
 WHERE h.fid_periodo=$1 AND h.fid_sedes=$2 AND c.fid_tipo_carrera=ANY($3::int[]) ORDER BY h.id_habilitacion`;

export class ResidencyDatabase extends EncryptedDatabase {
 private async load(c:any=this.pool){
  const b=(await c.query('SELECT * FROM sorteo_web.batch WHERE id=1')).rows[0];
  if(!b)throw Error('Todavía no se importó el padrón del sorteo.');
  const scope=[b.period_id,b.sedes_id,b.career_ids||[b.career_id]];
  const raw:Resident[]=(await c.query(rosterSQL,scope)).rows.map((p:any)=>({...p,isActive:p.recordState==='ACTIVO',isSpecialCase:p.hospitalId!==null}));
  const hospitals:Vacancy[]=(await c.query(`WITH occupied AS (
   SELECT h.fid_establecimiento_salud AS hospital_id,ca.fid_tipo_carrera AS career_id,count(*)::int AS n
   FROM public.habilitacion h JOIN public.estudiante e ON e.id_estudiante=h.fid_estudiante
   JOIN public.carrera ca ON ca.id_carrera=e.fid_carrera
   WHERE h.fid_periodo=$1 AND h.fid_sedes=$2 AND ca.fid_tipo_carrera=ANY($3::int[])
    AND h.estado='ACTIVO' AND h.estado_habilitacion NOT IN ('ELIMINADO','SUSPENDIDA') GROUP BY 1,2
   ) SELECT es.id_establecimiento_salud AS id,cs.id_cupo_establecimiento_salud AS "quotaId",cs.fid_tipo_carrera AS "careerId",tc.nombre AS career,es.codigo AS code,
   es.establecimiento AS name,es.nom_municipio AS municipality,cs.cupos AS "totalSlots",cs.cupos_asignados AS "assignedSlots",
   cs.cupos-cs.cupos_asignados AS "availableSlots",cs.estado AS state,es.estado AS "hospitalState",cs._fecha_creacion::text AS "createdAt",
   coalesce(o.n,0) AS "actualAssigned"
   FROM public.cupo_establecimiento_salud cs JOIN public.tipo_carrera tc ON tc.id_tipo_carrera=cs.fid_tipo_carrera JOIN public.establecimiento_salud es ON es.id_establecimiento_salud=cs.fid_establecimiento_salud
   LEFT JOIN occupied o ON o.hospital_id=cs.fid_establecimiento_salud AND o.career_id=cs.fid_tipo_carrera
   WHERE cs.fid_periodo=$1 AND cs.fid_sedes=$2 AND cs.fid_tipo_carrera=ANY($3::int[]) ORDER BY es.id_establecimiento_salud,cs.id_cupo_establecimiento_salud`,scope)).rows;
  const decisions=(await c.query('SELECT * FROM sorteo_web.roster_decision WHERE batch_id=1 ORDER BY group_key')).rows;
  const relevant=raw.filter(p=>p.isActive&&['APROBADO','ASIGNADO'].includes(p.status));
  const groups=new Map<string,Resident[]>();
  for(const p of relevant){const key=digest([p.documentType,normalize(p.documentNumber),normalize(p.complement)]);groups.set(key,[...(groups.get(key)||[]),p]);}
  const conflicts=[...groups].filter(([,ps])=>ps.length>1&&ps.some(p=>p.status==='APROBADO')).map(([key,people])=>{
   const hash=digest(people);const decision=decisions.find((d:any)=>d.group_key===key&&d.group_hash===hash);
   return {key,hash,people,decision};
  });
  const excluded=new Set<number>();
  for(const group of conflicts)if(group.decision)for(const p of group.people)if(p.status==='APROBADO'&&!group.decision.keep_ids.includes(p.id))excluded.add(p.id);
  const pending=raw.filter(p=>p.isActive&&p.status==='APROBADO'&&!p.hospitalId&&!excluded.has(p.id));
  const specials=raw.filter(p=>p.isActive&&p.status==='ASIGNADO'&&p.hospitalId);
  const errors:string[]=[];
  const duplicateException=b.duplicate_exception;
  const exceptionApplies=duplicateException?.enabled===true
   &&duplicateException.periodId===b.period_id&&duplicateException.sedesId===b.sedes_id
   &&duplicateException.sourceHash===b.source_hash&&Array.isArray(duplicateException.groups);
  if(conflicts.some(g=>!g.decision&&!(exceptionApplies&&duplicateException.groups.some((v:any)=>v.key===g.key&&v.hash===g.hash))))errors.push('Hay identidades repetidas pendientes de revisión.');
  if(b.rule!=='uniform')errors.push('La configuración debe usar igual probabilidad.');
  if(pending.length===0&&b.status!=='SORTEADO')errors.push('No hay participantes pendientes.');
  if(new Set(pending.map(p=>p.personId)).size!==pending.length)errors.push('Una misma persona tiene más de una habilitación pendiente.');
  if(pending.some(p=>specials.some(s=>s.personId===p.personId)))errors.push('Hay participantes pendientes que ya tienen una asignación previa.');
  if(pending.some(p=>p.studentState!=='ACTIVO'||!p.documentNumber.trim()||p.manualReason.trim()))errors.push('Hay participantes inactivos, sin documento o con asignación manual pendiente.');
  if(raw.some(p=>p.isActive&&['HABILITADO','PREASIGNADO'].includes(p.status)))errors.push('Existen habilitaciones sin nota o preasignaciones sin aprobar.');
  if(pending.some(p=>!Number.isFinite(p.score)||p.score<=0))errors.push('Hay notas ausentes o inválidas.');
  if(pending.some(p=>p.foreignUniversity))errors.push('Las reservas del período siguiente para universidades extranjeras requieren revisión.');
  if(hospitals.some(h=>h.availableSlots<0||h.totalSlots<0||h.assignedSlots<h.actualAssigned))errors.push('Los contadores de cupos no coinciden con las asignaciones.');
  if(new Set(hospitals.map(h=>`${h.id}:${h.careerId}`)).size!==hospitals.length)errors.push('Hay cupos duplicados para un mismo establecimiento.');
  if(specials.some(p=>hospitals.filter(h=>h.id===p.hospitalId&&h.careerId===p.careerId).length!==1))errors.push('Una asignación previa no tiene un registro de cupos único para su carrera.');
  const available=hospitals.filter(h=>h.state==='ACTIVO'&&h.hospitalState==='ACTIVO').reduce((n,h)=>n+h.availableSlots,0);
  if(available<pending.length)errors.push('No hay suficientes cupos activos.');
  const warnings=hospitals.filter(h=>h.assignedSlots>h.actualAssigned).map(h=>h.career+' · '+h.name+': el origen marca '+h.assignedSlots+' cupos ocupados y se observan '+h.actualAssigned+' asignaciones. Se conserva la ocupación del origen; no se libera esa diferencia.');
  const careerSummary=scope[2].map((id:number)=>({id,name:raw.find(p=>p.careerId===id)?.career||hospitals.find(h=>h.careerId===id)?.career||String(id),pending:pending.filter(p=>p.careerId===id).length,assigned:specials.filter(p=>p.careerId===id).length,excluded:raw.filter(p=>p.careerId===id&&p.status==='ELIMINADO').length,available:hospitals.filter(h=>h.careerId===id&&h.state==='ACTIVO'&&h.hospitalState==='ACTIVO').reduce((n,h)=>n+h.availableSlots,0)}));
  for(const summary of careerSummary)if(summary.pending>summary.available)errors.push('Cupos insuficientes en '+summary.name);
  const hash=digest({scope,sourceHash:b.source_hash,raw,hospitals,decisions,rule:b.rule,...(b.duplicate_exception?{duplicateException:b.duplicate_exception}:{})});
  const draw=(await c.query('SELECT id,snapshot FROM sorteo_web.draw_history WHERE batch_id=1')).rows[0];
  return {batch:b,warnings,careerSummary,raw,pending:draw?[]:pending,specials:draw?draw.snapshot.specialCases as Resident[]:specials,hospitals,conflicts:draw?[]:conflicts,
   excluded:draw?raw.filter(p=>p.status==='APROBADO').map(p=>p.id):[...excluded],errors:draw?[]:errors,available,hash:draw?draw.snapshot.inputHash as string:hash,drawId:draw?.id as number|undefined,resultCount:draw?.snapshot.winners.length as number|undefined,
   confirmed:b.status==='CONFIRMADO'&&b.confirmed_hash===hash};
 }
 public async preparation(){return this.load();}
 public async saveSimulation(list:SimulationList,actor:string){return this.transaction(c=>saveSharedSimulation(c,list,actor));}
 public async savedSimulation(id:string){return savedSimulation(this.pool,id);}
 public async officialShareToken(id:number,actor:string){return this.transaction(c=>createOfficialShareLink(c,id,actor));}
 public async sharedResult(token:string){return sharedResult(this.pool,token);}
 public async sourceFingerprint(){return (await this.pool.query(fingerprintSQL())).rows[0].jsonb_build_object;}
 public async saveSourceCheck(remote:any,actor:string){return this.transaction(async c=>{
  const x=await this.load(c);if(x.drawId)throw Error('El sorteo ya fue ejecutado. Consulte su comprobante de envío.');
  const local=(await c.query(fingerprintSQL())).rows[0].jsonb_build_object;
  requireSameFingerprint(local,remote);
  const check={...remote,rosterHash:x.hash};
  await c.query('UPDATE sorteo_web.batch SET source_check=$1 WHERE id=1',[JSON.stringify(check)]);
  await this.audit(c,'COMPROBACION_ORIGEN',actor,{checkedAt:remote.checkedAt,fingerprint:remote.fingerprint});
  return check;
 });}
 public async transferState(id:number){return (await this.pool.query('SELECT * FROM sorteo_web.transfer WHERE draw_id=$1',[id])).rows[0]||null;}
 public async recordTransfer(id:number,receipt:any,error:string|null){
  await this.pool.query(`INSERT INTO sorteo_web.transfer(draw_id,status,attempts,last_error,receipt)
   VALUES($1,$2,1,$3,$4) ON CONFLICT(draw_id) DO UPDATE SET
   status=CASE WHEN sorteo_web.transfer.status='APPLIED' THEN 'APPLIED' ELSE excluded.status END,
   attempts=sorteo_web.transfer.attempts+1,
   last_error=CASE WHEN sorteo_web.transfer.status='APPLIED' THEN NULL ELSE excluded.last_error END,
   receipt=coalesce(sorteo_web.transfer.receipt,excluded.receipt),updated_at=now()`,
   [id,receipt?'APPLIED':'PENDING',error?.slice(0,600)||null,receipt?JSON.stringify(receipt):null]);
 }
 public async simulate(rule:string='uniform',words:string[]=[]){
  if(rule!=='uniform')throw Error('El sorteo utiliza únicamente igual probabilidad.');
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const x=await this.load(c);
   if(x.drawId)throw Error('El sorteo oficial ya fue ejecutado.');
   const ignored=['Hay identidades repetidas pendientes de revisión.','Falta seleccionar la regla del sorteo.','Una misma persona tiene más de una habilitación pendiente.'];
   const errors=x.errors.filter(e=>!ignored.includes(e));if(errors.length)throw Error(errors.join(' '));
   const participants=x.raw.filter(p=>p.isActive&&p.status==='APROBADO'&&!p.hospitalId);
   if(participants.some(p=>p.studentState!=='ACTIVO'||!p.documentNumber.trim()||p.manualReason.trim()||p.foreignUniversity))throw Error('Hay participantes con datos pendientes de revisión.');
   const slots:{careerId:number;hospitalId:number;quotaId:number;name:string;slot:number}[]=[];
   for(const h of x.hospitals.filter(h=>h.state==='ACTIVO'&&h.hospitalState==='ACTIVO'))for(let i=0;i<h.availableSlots;i++)slots.push({careerId:h.careerId,hospitalId:h.id,quotaId:h.quotaId,name:h.name,slot:i+1});
   const winners=assign(participants,slots,rule,deriveHumanSeed(words)).map(a=>({...a.person,assignedHospital:a.slot.name,hospitalId:a.slot.hospitalId,rankPosition:a.rank}));
   await c.query('COMMIT');
   return {mode:'SIMULACION',rule,winners,specialCases:x.specials,duplicateGroups:x.conflicts.length,createdAt:new Date().toISOString()};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 public override async getActiveParticipants(){const x=await this.load();return [...x.pending,...x.specials];}
 public override async getRegularHabilitados(){return (await this.load()).pending;}
 public override async getSpecialCases(){return (await this.load()).specials;}
 public override async getAllHospitals(){return (await this.load()).hospitals;}
 public override async getParticipantById(id:number){return (await this.load()).raw.find(p=>p.id===id)||null;}
 public override async addParticipant(..._args:any[]):Promise<number>{throw Error('El padrón proviene del sistema de origen; la carga manual está deshabilitada.');}
 public override async addHospital(..._args:any[]):Promise<number>{throw Error('Los cupos provienen del sistema de origen; la carga manual está deshabilitada.');}
 public override async clearAllParticipants():Promise<void>{throw Error('No se permite borrar el padrón importado.');}
 public override async clearAllHospitals():Promise<void>{throw Error('No se permite borrar los cupos importados.');}
 private async transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='15s'");await c.query("SELECT pg_advisory_xact_lock(hashtext('sorteo_residencias'))");
   await c.query('SELECT id FROM sorteo_web.batch WHERE id=1 FOR UPDATE');const result=await fn(c);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 private async audit(c:PoolClient,action:string,actor:string,detail:unknown){await c.query('INSERT INTO sorteo_web.audit_event(batch_id,action,actor,detail) VALUES(1,$1,$2,$3)',[action,actor,JSON.stringify(detail)]);}
 public async resolve(key:string,hash:string,keep:number[],reason:string,actor:string){return this.transaction(async c=>{
  const x=await this.load(c);if(x.drawId)throw Error('El sorteo ya fue ejecutado.');
  const g=x.conflicts.find(g=>g.key===key&&g.hash===hash);if(!g)throw Error('La identidad cambió; vuelva a revisar.');
  if(reason.trim().length<10||reason.length>1000)throw Error('Escriba una justificación de 10 a 1000 caracteres.');
  if(!Array.isArray(keep)||new Set(keep).size!==keep.length||keep.some(id=>!g.people.some(p=>p.id===id&&p.status==='APROBADO')))throw Error('Selección inválida.');
  const selected=g.people.filter(p=>keep.includes(p.id));
  if(new Set(selected.map(p=>p.personId)).size!==selected.length||selected.some(p=>x.specials.some(s=>s.personId===p.personId)))throw Error('Una persona no puede recibir dos asignaciones. Revise las habilitaciones elegidas.');
  await c.query(`INSERT INTO sorteo_web.roster_decision(batch_id,group_key,group_hash,keep_ids,reason,actor) VALUES(1,$1,$2,$3,$4,$5)
   ON CONFLICT(batch_id,group_key) DO UPDATE SET group_hash=excluded.group_hash,keep_ids=excluded.keep_ids,reason=excluded.reason,actor=excluded.actor,created_at=now()`,[key,hash,JSON.stringify(keep),reason.trim(),actor]);
  await c.query("UPDATE sorteo_web.batch SET status='PREPARACION',confirmed_hash=NULL,confirmed_by=NULL,confirmed_at=NULL WHERE id=1");
  await this.audit(c,'REVISION_IDENTIDAD',actor,{key,keep,reason});
 });}
 public async selectRule(rule:string,actor:string){if(rule!=='uniform')throw Error('El sorteo utiliza únicamente igual probabilidad.');return this.transaction(async c=>{
  const x=await this.load(c);if(x.drawId)throw Error('El sorteo ya fue ejecutado.');
  await c.query("UPDATE sorteo_web.batch SET rule=$1,status='PREPARACION',confirmed_hash=NULL,confirmed_by=NULL,confirmed_at=NULL WHERE id=1",[rule]);
  await this.audit(c,'REGLA',actor,{rule});
 });}
 public async confirm(hash:string,actor:string){return this.transaction(async c=>{
  const x=await this.load(c);if(x.drawId)throw Error('El sorteo ya fue ejecutado.');if(x.errors.length)throw Error(x.errors.join(' '));
  if(x.hash!==hash)throw Error('El padrón cambió. Revise nuevamente antes de confirmar.');
  await c.query("UPDATE sorteo_web.batch SET status='CONFIRMADO',confirmed_hash=$1,confirmed_by=$2,confirmed_at=now() WHERE id=1",[hash,actor]);
  await this.audit(c,'CONFIRMACION_PADRON',actor,{hash,count:x.pending.length,available:x.available});
 });}
 public async runOfficialDraw(words:string[],actor:string,sourceCheck?:any){return this.transaction(async c=>{
  await c.query('LOCK TABLE public.habilitacion,public.cupo_establecimiento_salud,public.estudiante,public.persona,public.carrera,public.tipo_carrera,public.universidad,public.establecimiento_salud IN SHARE ROW EXCLUSIVE MODE');
  const x=await this.load(c);if(x.drawId)throw Error('Este padrón ya tiene un sorteo registrado.');
  if(x.errors.length)throw Error(x.errors.join(' '));if(!x.confirmed)throw Error('Primero revise y confirme el padrón.');
  const sourceFingerprint=(await c.query(fingerprintSQL())).rows[0].jsonb_build_object;
  if(bridgeEnabled()&&!sourceCheck)throw Error('Primero debe comprobarse el origen sistema de origen.');
  if(sourceCheck)requireSameFingerprint(sourceFingerprint,sourceCheck);
  const slots:{careerId:number;hospitalId:number;quotaId:number;name:string;slot:number}[]=[];
  for(const h of x.hospitals.filter(h=>h.state==='ACTIVO'&&h.hospitalState==='ACTIVO'))for(let i=0;i<h.availableSlots;i++)slots.push({careerId:h.careerId,hospitalId:h.id,quotaId:h.quotaId,name:h.name,slot:i+1});
   const seed=deriveHumanSeed(words);const seedCommitment=crypto.createHash('sha256').update(seed).digest('hex');
  const assignments=assign(x.pending,slots,x.batch.rule,seed);
  const winners=assignments.map(a=>({...a.person,assignedHospital:a.slot.name,hospitalId:a.slot.hospitalId,quotaId:a.slot.quotaId,slot:a.slot.slot,rankPosition:a.rank}));
  const now=new Date().toISOString();
  const specialCases=x.specials.map(p=>({...p,quotaId:x.hospitals.find(h=>h.id===p.hospitalId&&h.careerId===p.careerId)!.quotaId}));
   const snapshot={id:0,userWords:words,serverPhrase:'CSPRNG SHA-256: '+seedCommitment,weatherSnapshot:'No interviene en este sorteo',kSelectedCount:winners.length,hexBreakdown:[],hexSum:0,winners,specialCases,createdAt:now,algorithm:ALGORITHM,seedDerivation:HUMAN_SEED_DERIVATION,rule:x.batch.rule,inputHash:x.hash,actor,source:x.batch.source,sourceHash:x.batch.source_hash,periodId:x.batch.period_id,sedesId:x.batch.sedes_id,careerIds:x.batch.career_ids};
  memoManifest(snapshot); // Refuse an incomplete handoff before committing the draw.
  const input={participants:x.pending,specialCases,excludedIds:x.excluded,eliminatedIds:x.raw.filter(p=>p.status==='ELIMINADO').map(p=>p.id),quotaBaseline:x.hospitals,slots,rule:x.batch.rule,decisions:x.conflicts.map(g=>g.decision),...(x.batch.duplicate_exception?{duplicateException:x.batch.duplicate_exception}:{}),sourceHash:x.batch.source_hash,sourceFingerprint};
  const inserted=await c.query(`INSERT INTO sorteo_web.draw_history(user_words_encrypted,server_phrase_encrypted,weather_snapshot_encrypted,k_selected_count,hex_breakdown_encrypted,hex_sum,winners_ids_encrypted,special_cases_encrypted,created_at,batch_id,snapshot,input_snapshot,input_hash,seed_encrypted,algorithm,actor)
   VALUES($1,$2,$3,$4,$5,0,$6,$7,$8,1,$9,$10,$11,$12,$13,$14) RETURNING id`,[encryptPacked(JSON.stringify(words)),encryptPacked(snapshot.serverPhrase),encryptPacked(snapshot.weatherSnapshot),winners.length,encryptPacked('[]'),encryptPacked(JSON.stringify(winners.map(w=>w.id))),encryptPacked(JSON.stringify(x.specials.map(p=>p.id))),now,JSON.stringify(snapshot),JSON.stringify(input),x.hash,encryptPacked(seed.toString('hex')),ALGORITHM,actor]);
  snapshot.id=inserted.rows[0].id;
  const assigned=await c.query(`UPDATE public.habilitacion h SET fid_establecimiento_salud=w."hospitalId",estado_habilitacion='ASIGNADO',_fecha_modificacion=now()
   FROM jsonb_to_recordset($1::jsonb) AS w(id integer,"hospitalId" integer)
   WHERE h.id_habilitacion=w.id AND h.estado_habilitacion='APROBADO' AND h.fid_establecimiento_salud IS NULL`,[JSON.stringify(winners.map(w=>({id:w.id,hospitalId:w.hospitalId})))]);
  if(assigned.rowCount!==winners.length)throw Error('La habilitación cambió durante el sorteo.');
  const used=new Map<number,number>();for(const w of winners)used.set(w.quotaId,(used.get(w.quotaId)||0)+1);
  const quotas=await c.query(`UPDATE public.cupo_establecimiento_salud q SET cupos_asignados=q.cupos_asignados+v.n,_fecha_modificacion=now()
   FROM jsonb_to_recordset($1::jsonb) AS v(id integer,n integer)
   WHERE q.id_cupo_establecimiento_salud=v.id AND q.cupos-q.cupos_asignados>=v.n`,[JSON.stringify([...used].map(([id,n])=>({id,n})))]);
  if(quotas.rowCount!==used.size)throw Error('Los cupos cambiaron durante el sorteo.');
  await c.query('UPDATE sorteo_web.draw_history SET snapshot=$1 WHERE id=$2',[JSON.stringify(snapshot),snapshot.id]);
  await c.query("INSERT INTO sorteo_web.transfer(draw_id,status) VALUES($1,'PENDING')",[snapshot.id]);
  await c.query("UPDATE sorteo_web.batch SET status='SORTEADO' WHERE id=1");
  await this.audit(c,'SORTEO',actor,{drawId:snapshot.id,inputHash:x.hash,seedCommitment,algorithm:ALGORITHM,count:winners.length});
  await createOfficialShareLink(c,snapshot.id,actor);
  return snapshot;
 });}
 public override async getDrawById(id:number):Promise<DrawHistoryRecord|null>{const row=(await this.pool.query('SELECT snapshot,annulled_at,annulment_reason FROM sorteo_web.draw_history WHERE id=$1',[id])).rows[0];return row?{...row.snapshot,...(row.annulled_at?{annulledAt:row.annulled_at,annulmentReason:row.annulment_reason}:{})}:null;}
 public async exportPackage(id:number){
  const r=(await this.pool.query('SELECT snapshot,input_snapshot,seed_encrypted,algorithm,annulled_at FROM sorteo_web.draw_history WHERE id=$1',[id])).rows[0];
  if(!r)throw Error('Sorteo no encontrado.');
  if(r.annulled_at)throw Error('Este sorteo fue anulado y no puede enviarse ni utilizarse como resultado vigente.');
  return buildResultPackage({...r.snapshot,algorithm:r.algorithm},r.input_snapshot,decryptPacked(r.seed_encrypted));
 }
}
