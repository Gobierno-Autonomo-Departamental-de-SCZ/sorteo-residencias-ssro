import {randomBytes} from 'node:crypto';
import {Pool,PoolClient} from 'pg';
import {SimulationList} from './simulationDownloads.js';
import {sealSnapshot,openSnapshot} from '../crypto/snapshot.js';

export async function createOfficialShareLink(c:PoolClient,drawId:number,actor:string):Promise<string|null>{
 const saved=await c.query(`INSERT INTO sorteo_web.shared_result(token,kind,draw_id,executed_at,created_by)
 SELECT $1,'OFFICIAL',id,created_at::timestamptz,$3 FROM sorteo_web.draw_history WHERE id=$2 AND annulled_at IS NULL
 ON CONFLICT(draw_id) DO NOTHING RETURNING token`,[randomBytes(32).toString('hex'),drawId,actor]);
 if(saved.rowCount)await c.query(`INSERT INTO sorteo_web.audit_event(batch_id,action,actor,detail)
 VALUES(1,'ENLACE_RESULTADO_CREADO',$1,$2)`,[actor,JSON.stringify({kind:'OFFICIAL',drawId})]);
 return saved.rows[0]?.token||(await c.query('SELECT token FROM sorteo_web.shared_result WHERE draw_id=$1',[drawId])).rows[0]?.token||null;
}

export async function saveSharedSimulation(c:PoolClient,list:SimulationList,actor:string):Promise<string>{
 const token=randomBytes(32).toString('hex');
 if(!Number.isFinite(list.expires)||list.expires<=Date.now()||list.expires>Date.now()+60*60*1000)throw Error('Vencimiento de simulación inválido.');
 await c.query(`INSERT INTO sorteo_web.shared_result(token,kind,simulation_id,simulation_snapshot,executed_at,created_by,expires_at)
 VALUES($1,'SIMULATION',$2,$3,$4,$5,$6)`,[token,list.id,JSON.stringify(sealSnapshot(list)),list.createdAt,actor,new Date(list.expires)]);
 await c.query(`DELETE FROM sorteo_web.shared_result WHERE kind='SIMULATION' AND (expires_at<=now() OR token IN (
  SELECT token FROM sorteo_web.shared_result WHERE kind='SIMULATION' ORDER BY created_at DESC,token DESC OFFSET 50))`);
 await c.query(`INSERT INTO sorteo_web.audit_event(batch_id,action,actor,detail)
 VALUES(1,'ENLACE_RESULTADO_CREADO',$1,$2)`,[actor,JSON.stringify({kind:'SIMULATION',simulationId:list.id,count:list.people.length,executedAt:list.createdAt})]);
 return token;
}

export async function savedSimulation(pool:Pool,id:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return null;
 const r=(await pool.query("SELECT token,simulation_snapshot FROM sorteo_web.shared_result WHERE simulation_id=$1 AND expires_at>now()",[id])).rows[0];
 if(!r)return null;
 const list=openSnapshot<SimulationList>(r.simulation_snapshot);
 return list.expires>Date.now()?{list,token:r.token as string}:null;
}

export async function sharedResult(pool:Pool,token:string){
 if(!/^[0-9a-f]{64}$/.test(token))return null;
 const r=(await pool.query(`SELECT s.kind,s.draw_id,s.executed_at,s.simulation_snapshot,s.expires_at,
 d.snapshot,d.annulled_at,t.status AS transfer_status
 FROM sorteo_web.shared_result s LEFT JOIN sorteo_web.draw_history d ON d.id=s.draw_id
 LEFT JOIN sorteo_web.transfer t ON t.draw_id=s.draw_id WHERE s.token=$1 AND (s.kind='OFFICIAL' OR s.expires_at>now())`,[token])).rows[0];
 if(!r)return null;
 // Only the public fields leave this adapter; no documents, case reasons, seeds or internal IDs.
 const snapshot=openSnapshot(r.kind==='SIMULATION'?r.simulation_snapshot:r.snapshot);
 if(r.kind==='SIMULATION'&&!(snapshot.expires>Date.now()))return null;
 const all=r.annulled_at?[]:r.kind==='SIMULATION'?snapshot.people:[...snapshot.winners,...snapshot.specialCases];
 const people=all.map((p:any)=>({fullName:String(p.fullName||''),career:String(p.career||''),hospital:String(p.assignedHospital||p.specialHospital||'')}));
 if(r.kind==='OFFICIAL')people.sort((a:any,b:any)=>a.fullName.localeCompare(b.fullName,'es'));
 return {kind:r.kind as 'OFFICIAL'|'SIMULATION',drawId:r.draw_id as number|null,executedAt:new Date(r.executed_at).toISOString(),annulledAt:r.annulled_at?new Date(r.annulled_at).toISOString():null,confirmed:r.transfer_status==='APPLIED',people};
}
