import {rememberSimulation,getSimulation,simulationCsv,simulationExcel,simulationPdf} from './services/simulationDownloads.js';
import {sharedResultView} from './views/sharedResultView.js';
import express,{Request,Response,NextFunction,RequestHandler} from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import {ResidencyDatabase} from './database/residencyDb.js';
import {encryptPacked,decryptPacked} from './crypto/cipher.js';
import {AdminLoginSchema} from './security/validation.js';
import {isAllowedOrigin} from './security/requestOrigin.js';
import {renderLoginView} from './views/loginView.js';
import {preparationView,residencyResults,simulationResults,esc,publicMessage} from './views/preparationView.js';
import {generateCsvExport,generateExcelExport,generatePdfExport} from './services/exportService.js';
import {bridgeRequest,bridgeEnabled,sendPackage} from './services/sourceBridge.js';
import {requiredEnv,bridgeConfig} from './config.js';

export const db=new ResidencyDatabase();
const app=express();
const cookieName='residency_session';
type Session={username:string;entropyWords:string[];csrf:string;expires:number};
const sessions=new WeakMap<Request,Session>();
const shareUrl=(token:string)=>new URL('/s/'+token,requiredEnv('PUBLIC_ORIGIN')).href;
const transfers=new Map<number,Promise<void>>();
async function transfer(id:number):Promise<void>{
 const current=transfers.get(id);if(current)return current;
 const work=(async()=>{
  if((await db.getDrawById(id) as any)?.annulledAt)throw Error('Este sorteo fue anulado y no puede reenviarse.');
  if((await db.transferState(id))?.status==='APPLIED')return;
  try{const receipt=await sendPackage(await db.exportPackage(id));await db.recordTransfer(id,receipt,null);}
  catch(error){await db.recordTransfer(id,null,error instanceof Error?error.message:'No se recibió confirmación del servidor de destino.');}
 })();
 transfers.set(id,work);try{await work;}finally{transfers.delete(id);}
}
const wrap=(fn:(req:Request,res:Response)=>Promise<any>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","'unsafe-inline'",'https://cdn.tailwindcss.com','https://cdn.jsdelivr.net'],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],upgradeInsecureRequests:null}},hsts:false,referrerPolicy:{policy:'same-origin'}}));
app.use(express.urlencoded({extended:false,limit:'64kb'}));app.use(express.json({limit:'64kb'}));app.use(cookieParser());
app.use(express.static(path.join(process.cwd(),'public')));
app.get('/favicon.ico',(_req,res)=>res.redirect('/img/logo-santacruz.png?v=20261009'));
app.use(rateLimit({windowMs:15*60*1000,limit:500}));
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');try{const s=JSON.parse(decryptPacked(req.cookies[cookieName])) as Session;if(s.expires>Date.now()&&s.csrf&&s.username)sessions.set(req,s);}catch{}next();});
const auth:RequestHandler=(req,res,next)=>{if(!sessions.has(req)){res.redirect('/login');return;}next();};
const csrf:RequestHandler=(req,res,next)=>{
 const s=sessions.get(req);
 if(!s||typeof req.body.csrf!=='string'||req.body.csrf!==s.csrf){res.status(403).send('La sesión del formulario venció. Vuelva a abrir la página.');return;}
 // Browsers can send the literal Origin: null under a no-referrer policy.
 // The session-bound CSRF token is mandatory, including absent/opaque origins.
 const origin=req.get('origin');
 if(!isAllowedOrigin(origin,req.protocol,req.get('host'),process.env.PUBLIC_ORIGIN)){res.status(403).send('Origen inválido');return;}
 next();
};
app.get('/login',(_req,res)=>res.send(renderLoginView()));
app.post('/login',rateLimit({windowMs:15*60*1000,limit:20}),wrap(async(req,res)=>{
 try{const p=AdminLoginSchema.parse(req.body);if(!await db.verifyAdmin(p.username,p.password)){res.status(401).send(renderLoginView('Credenciales incorrectas.'));return;}
 const s:Session={username:p.username,entropyWords:p.entropyWords,csrf:crypto.randomBytes(24).toString('hex'),expires:Date.now()+8*60*60*1000};
 res.cookie(cookieName,encryptPacked(JSON.stringify(s)),{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',maxAge:8*60*60*1000,path:'/'});res.redirect('/');
 }catch{res.status(400).send(renderLoginView('Revise usuario, contraseña y las cinco palabras de inicio.'));}
}));
app.get('/logout',(_req,res)=>{res.clearCookie(cookieName);res.redirect('/login');});
app.get('/s/:token',wrap(async(req,res)=>{
 res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
 res.setHeader('Referrer-Policy','no-referrer');
 const result=await db.sharedResult(String(req.params.token));
 res.status(!result?404:result.annulledAt?410:200).send(sharedResultView(result));
}));
app.get(['/', '/preparation','/dashboard','/home','/admin'],auth,wrap(async(req,res)=>res.send(preparationView(await db.preparation(),sessions.get(req)!.csrf,String(req.query.msg||'')))));
app.get('/roster.json',auth,wrap(async(_req,res)=>{const x=await db.preparation();res.attachment('padron.json').json({careerIds:x.batch.career_ids,careerSummary:x.careerSummary,warnings:x.warnings,periodId:x.batch.period_id,sourceExtractedAt:x.batch.source_extracted_at,sourceHash:x.batch.source_hash,hash:x.hash,participants:x.raw,hospitals:x.hospitals,conflicts:x.conflicts,excluded:x.excluded,errors:x.errors});}));
app.post('/preparation/resolve',auth,csrf,wrap(async(req,res)=>{if(req.body.decisionReviewed!=='yes')throw Error('Confirme la revisión de las inclusiones y exclusiones del grupo.');const keep=req.body.keep===undefined?[]:Array.isArray(req.body.keep)?req.body.keep:[req.body.keep];await db.resolve(req.body.key,req.body.hash,keep.map(Number),String(req.body.reason||''),sessions.get(req)!.username);res.redirect('/?msg=Revision+guardada');}));
app.post('/preparation/confirm',auth,csrf,wrap(async(req,res)=>{if(req.body.reviewed!=='yes')throw Error('Debe revisar el padrón.');await db.confirm(req.body.hash,sessions.get(req)!.username);res.redirect('/?msg=Padron+confirmado.+El+sorteo+no+se+ha+ejecutado.');}));
app.post('/preparation/source-check',auth,csrf,wrap(async(req,res)=>{
 const remote=await bridgeRequest({action:'preflight'});await db.saveSourceCheck(remote,sessions.get(req)!.username);
 res.redirect('/?msg='+encodeURIComponent('Padrón y cupos verificados. La configuración de memorandos está disponible.'));
}));
app.post('/draw',auth,csrf,wrap(async(req,res)=>{
 if(req.body.confirmation!=='SORTEAR')throw Error('Escriba SORTEAR para confirmar la ejecución.');
 const session=sessions.get(req)!;
 const sourceCheck=bridgeEnabled()?await bridgeRequest({action:'preflight'}):undefined;
 const r=await db.runOfficialDraw(session.entropyWords,session.username,sourceCheck);
 if(bridgeEnabled())void transfer(r.id).catch(()=>{});
 res.redirect('/results/'+r.id);
}));
app.post('/simulation',auth,csrf,wrap(async(req,res)=>{
 const list=rememberSimulation(await db.simulate(req.body.rule,sessions.get(req)!.entropyWords),sessions.get(req)!.csrf);
 await db.saveSimulation(list,sessions.get(req)!.username);
 res.redirect('/simulation/'+list.id);
}));
app.get('/simulation/:id',auth,wrap(async(req,res)=>{
 const saved=await db.savedSimulation(String(req.params.id));
 const list=saved?.list||getSimulation(String(req.params.id),sessions.get(req)!.csrf);
 if(!list){res.status(404).send('<p>El resultado temporal venció o pertenece a otra sesión. Ejecute una nueva simulación.</p><a href="/">Volver</a>');return;}
 res.send(simulationResults(list,saved?shareUrl(saved.token):''));
}));
app.get('/simulation/:id/export/:format',auth,wrap(async(req,res)=>{
 const list=(await db.savedSimulation(String(req.params.id)))?.list||getSimulation(String(req.params.id),sessions.get(req)!.csrf);
 if(!list){res.status(404).send('Resultado temporal no disponible. Ejecute una nueva simulación.');return;}
 const name='simulacion-'+list.id;
 switch(req.params.format){
 case 'csv':res.attachment(name+'.csv').type('text/csv').send(simulationCsv(list));break;
 case 'excel':res.attachment(name+'.xlsx').send(simulationExcel(list));break;
 case 'pdf':res.attachment(name+'.pdf').type('application/pdf').send(await simulationPdf(list));break;
 default:res.status(404).send('Formato no disponible.');
 }
}));
app.get('/results/:id',auth,wrap(async(req,res)=>{const id=Number(req.params.id);const d=await db.getDrawById(id);if(!d){res.status(404).send('Sorteo no encontrado');return;}const state=await db.transferState(id);const sending=transfers.has(id);const token=(d as any).annulledAt?null:await db.officialShareToken(id,sessions.get(req)!.username);if(sending)res.setHeader('Refresh','5');res.send(residencyResults(d,sending?{...state,status:'SENDING',last_error:null}:state,sessions.get(req)!.csrf,token?shareUrl(token):''));}));
app.post('/results/:id/send',auth,csrf,wrap(async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!await db.getDrawById(id)){res.status(404).send('Sorteo no encontrado');return;}
 void transfer(id).catch(()=>{});res.redirect('/results/'+id);
}));
app.get('/results/:id/receipt',auth,wrap(async(req,res)=>{
 if((await db.getDrawById(Number(req.params.id)) as any)?.annulledAt){res.status(409).send('Este comprobante corresponde a un sorteo anulado.');return;}
 const transfer=await db.transferState(Number(req.params.id));if(!transfer?.receipt){res.status(404).send('El comprobante todavía no está disponible.');return;}
 res.attachment('comprobante-qmarasc-'+req.params.id+'.json').json(transfer.receipt);
}));
app.get('/results/:id/export/:format',auth,wrap(async(req,res)=>{
 const id=Number(req.params.id);const d=await db.getDrawById(id);if(!d){res.status(404).send('Sorteo no encontrado');return;}
 if((d as any).annulledAt){res.status(409).send('Este sorteo fue anulado. El resultado original se conserva para auditoría.');return;}
 switch(req.params.format){
 case 'json':res.attachment(`sorteo-${id}-qmarasc.json`).json(await db.exportPackage(id));break;
 case 'csv':res.attachment(`sorteo-${id}.csv`).type('text/csv').send(generateCsvExport(d));break;
 case 'excel':res.attachment(`sorteo-${id}.xlsx`).send(generateExcelExport(d));break;
 case 'pdf':res.attachment(`sorteo-${id}.pdf`).type('application/pdf').send(await generatePdfExport(d));break;
 default:res.status(404).send('Formato no disponible. Seleccione uno de los formatos de descarga.');
 }
}));
app.get('/api/health',wrap(async(_req,res)=>{await db.ready();res.json({status:'OPERACIONAL',database:'PostgreSQL',mode:'residency-qmarasc'});}));
app.use((_req,res)=>res.status(404).send('Ruta no disponible.'));
app.use((error:Error,_req:Request,res:Response,_next:NextFunction)=>{res.status(400).send(`<p>${esc(publicMessage(error.message))}</p><a href="/">Volver al padrón</a>`);});
export async function initialize(){requiredEnv('MASTER_KEY');requiredEnv('ADMIN_PASSWORD');requiredEnv('DATABASE_URL');requiredEnv('PUBLIC_ORIGIN');requiredEnv('SOURCE_FINGERPRINT_SQL');if(bridgeEnabled())bridgeConfig();await db.ready();try{await db.createAdmin(process.env.ADMIN_USER||'admin',process.env.ADMIN_PASSWORD!);}catch(e:any){if(!e.message.startsWith('AdminYaExiste:'))throw e;}}
if(process.env.NODE_ENV!=='test')initialize().then(()=>app.listen(Number(process.env.PORT||3000),()=>console.log('Residencias: servidor iniciado'))).catch(e=>{console.error(e.message);process.exit(1);});
export default app;
