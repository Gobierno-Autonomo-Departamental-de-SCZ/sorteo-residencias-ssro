import {spawn} from 'node:child_process';
import {canonical,packageHash} from './resultPackage.js';
import {bridgeConfig,requiredEnv} from '../config.js';

export const fingerprintSQL=()=>requiredEnv('SOURCE_FINGERPRINT_SQL');
export const bridgeEnabled=()=>process.env.SSRO_BRIDGE_ENABLED==='true';
let busy=false;

export async function bridgeRequest(request:unknown):Promise<any>{
 if(!bridgeEnabled())throw Error('La transferencia al servidor de destino no está configurada.');
 const {host,user,port,keyPath,knownHostsPath}=bridgeConfig();
 if(busy)throw Error('Hay otra comprobación o transferencia en curso. Espere unos segundos.');
 busy=true;
 try{return await new Promise((resolve,reject)=>{
  const args=['-T','-p',port,'-i',keyPath,'-o','IdentitiesOnly=yes',
   '-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${knownHostsPath}`,
   '-o','ConnectTimeout=5','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',`${user}@${host}`];
  const child=spawn('ssh',args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='',settled=false;
  const finish=(error?:Error,result?:any)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('No se recibió confirmación del servidor de destino. El sorteo está guardado: reintente el envío del mismo resultado.'));},(request as any)?.action==='preflight'?35000:130000);
  child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>65536){child.kill();finish(Error('Respuesta del receptor demasiado grande.'));}});
  child.stderr.on('data',chunk=>{if(stderr.length<2000)stderr+=chunk.toString();});
  child.on('error',()=>finish(Error('No se pudo iniciar la conexión segura al servidor de destino.')));
  child.stdin.on('error',()=>{});
  child.on('close',code=>{
   if(settled)return;
   try{const reply=JSON.parse(stdout);if(!reply.ok)throw Error(reply.error||'El receptor rechazó el envío.');
    if(code!==0)throw Error('La conexión terminó sin confirmación válida.');finish(undefined,reply.result);
   }catch(error){finish(error instanceof SyntaxError?Error('El servidor de destino no respondió. El resultado guardado puede reenviarse sin repetir el sorteo.'):error as Error);}
  });
  child.stdin.end(JSON.stringify(request));
 });}finally{busy=false;}
}

export function requireSameFingerprint(local:any,remote:any){
 if(!remote||remote.protocol!=='ssro-bridge-v1'||!remote.readyForMemos)throw Error('El servidor de destino no está preparado para recibir asignaciones y generar memorandos.');
 if(remote.importedPackage)throw Error('El servidor de destino ya recibió un sorteo para este período.');
 if(canonical(local)!==canonical(remote.fingerprint))throw Error('El padrón o los cupos difieren del servidor de destino. Actualice la copia antes de sortear.');
}

export async function sendPackage(pkg:any){
 const {checksum,...body}=pkg;
 if(checksum?.value!==packageHash(body))throw Error('La huella del resultado guardado es inválida.');
 if(!body.input?.sourceFingerprint)throw Error('Este resultado no incluye la comprobación del origen. Requiere revisión; no vuelva a sortear.');
 const receipt=await bridgeRequest({action:'import',canonical:canonical(body),checksum:checksum.value});
 if(receipt?.status!=='APPLIED'||receipt.packageId!==pkg.packageId||receipt.checksum!==checksum.value
  ||receipt.newAssignments!==pkg.summary.newAssignments||receipt.preexistingAssignments!==pkg.summary.preexistingAssignments
  ||receipt.memoRecipients!==pkg.summary.memoRecipients)throw Error('El comprobante del servidor de destino no coincide con el resultado. Reintente el mismo envío.');
 return receipt;
}
