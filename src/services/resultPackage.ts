import crypto from 'node:crypto';
import {bridgeConfig} from '../config.js';

// Stable across PostgreSQL jsonb key reordering and repeated downloads.
export function canonical(value:any):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export const packageHash=(value:any)=>crypto.createHash('sha256').update(canonical(value)).digest('hex');

export function memoManifest(draw:any){
 const row=(p:any,fixed:boolean)=>{
  for(const key of ['id','studentId','personId','careerId','hospitalId','quotaId'])if(!Number.isSafeInteger(p[key])||p[key]<=0)throw Error('Identificador incompleto en el resultado: '+key);
  if(p.status!==(fixed?'ASIGNADO':'APROBADO'))throw Error('Estado de origen inesperado.');
  return {id_habilitacion:p.id,id_estudiante:p.studentId,id_persona:p.personId,id_tipo_carrera:p.careerId,
   id_periodo:draw.periodId,id_sedes:draw.sedesId,id_establecimiento_salud:p.hospitalId,id_cupo_establecimiento_salud:p.quotaId,
   tipo:fixed?'ASIGNACION_PREEXISTENTE':'ASIGNACION_NUEVA',accion:fixed?'VERIFICAR_SIN_MODIFICAR':'ASIGNAR',
   estado_origen:fixed?'ASIGNADO':'APROBADO',establecimiento_origen:fixed?p.hospitalId:null,
   estado_resultado:'ASIGNADO',incremento_cupo:fixed?0:1,incluir_en_memorandos:true,
   puesto:fixed?null:p.rankPosition,nombre:p.fullName,documento:p.documentId,establecimiento:p.assignedHospital,
   motivo_preasignacion:fixed?(p.manualReason||p.specialReason||''):''};
 };
 const rows=[...draw.winners.map((p:any)=>row(p,false)),...draw.specialCases.map((p:any)=>row(p,true))];
 if(new Set(rows.map(r=>r.id_habilitacion)).size!==rows.length)throw Error('Habilitaciones repetidas en el resultado.');
 if(rows.some(r=>!draw.careerIds.includes(r.id_tipo_carrera)))throw Error('Carrera fuera del período del sorteo.');
 return rows;
}

export function buildResultPackage(draw:any,input:any,seed:string){
 const recipients=memoManifest(draw);
 if(!Array.isArray(input.specialCases)||packageHash(input.specialCases)!==packageHash(draw.specialCases))throw Error('Las asignaciones previas cambiaron.');
 const excluded=input.excludedIds||[];
 if(excluded.some((id:number)=>recipients.some(r=>r.id_habilitacion===id)))throw Error('Una exclusión aparece entre los destinatarios.');
 const body={format:'qmarasc-residency-result-v2',...draw,seed,input,
  packageId:packageHash({sourceHash:draw.sourceHash,inputHash:draw.inputHash,drawId:draw.id}),
  // assignments remains the newly randomized subset used for deterministic replay.
  assignments:recipients.filter(r=>r.tipo==='ASIGNACION_NUEVA'),
  memoRecipients:recipients,
  summary:{newAssignments:draw.winners.length,preexistingAssignments:draw.specialCases.length,memoRecipients:recipients.length,
   excludedByReview:excluded.length,eligibleBeforeReview:recipients.length+excluded.length,
   byCareer:draw.careerIds.map((id:number)=>({careerId:id,newAssignments:recipients.filter(r=>r.id_tipo_carrera===id&&r.incremento_cupo===1).length,
    preexistingAssignments:recipients.filter(r=>r.id_tipo_carrera===id&&r.incremento_cupo===0).length}))},
  destination:{system:'qmarasc',host:bridgeConfig().host,requiresSourceValidation:true,requiresAtomicIdempotentImport:true}
 };
 return {...body,checksum:{algorithm:'SHA-256',canonicalization:'sorted-object-keys-json-v1',value:packageHash(body)}};
}
