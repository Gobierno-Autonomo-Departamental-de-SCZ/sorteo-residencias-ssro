const {test} = require('node:test');
const assert = require('node:assert/strict');
process.env.MASTER_KEY = 'test-only-master-key-never-use-in-production';
const {ResidencyDatabase} = require('../dist/database/residencyDb.js');
const {preparationView} = require('../dist/views/preparationView.js');
const {generateCsvExport,generateExcelExport} = require('../dist/services/exportService.js');
const {simulationCsv,simulationExcel} = require('../dist/services/simulationDownloads.js');
const XLSX=require('xlsx');
const {AdminLoginSchema} = require('../dist/security/validation.js');
const {buildResultPackage} = require('../dist/services/resultPackage.js');
const {trustedProxies} = require('../dist/config.js');
const express=require('express');

const person = {id:1,studentId:10,personId:20,fullName:'PERSONA FICTICIA',documentNumber:'123456',complement:'',documentType:1,documentId:'123456',email:'test@example.invalid',university:'U',foreignUniversity:false,career:'MEDICINA',careerId:1,status:'APROBADO',recordState:'ACTIVO',studentState:'ACTIVO',score:80,hospitalId:null,manualReason:'',createdAt:'2026-10-19T00:00:00Z'};
async function preparation(people) {
 const db = Object.create(ResidencyDatabase.prototype);
 db.pool = {async query(sql) {
  if(sql.startsWith('SELECT * FROM sorteo_web.batch'))return {rows:[{id:1,period_id:1,sedes_id:1,career_ids:[1],source_hash:'fixture',status:'PREPARACION',rule:'uniform'}]};
  if(sql.startsWith('SELECT h.id_habilitacion'))return {rows:people};
  if(sql.startsWith('WITH occupied'))return {rows:[{id:100,quotaId:1000,careerId:1,career:'MEDICINA',name:'HOSPITAL FICTICIO',totalSlots:5,assignedSlots:1,availableSlots:4,state:'ACTIVO',hospitalState:'ACTIVO',actualAssigned:1}]};
  if(sql.startsWith('SELECT * FROM sorteo_web.roster_decision')||sql.startsWith('SELECT id,snapshot FROM sorteo_web.draw_history'))return {rows:[]};
  throw Error('Unexpected test query: '+sql);
 }};
 return db.preparation();
}
test('blocks approved participants with a hospital instead of silently omitting them',async()=>{
 const x=await preparation([person,{...person,id:2,personId:21,documentNumber:'222',hospitalId:100}]);
 assert.ok(x.errors.some(e=>e.includes('APROBADO')));
});
test('blocks assigned participants without a hospital',async()=>{
 const x=await preparation([person,{...person,id:3,personId:22,documentNumber:'333',status:'ASIGNADO'}]);
 assert.ok(x.errors.some(e=>e.includes('ASIGNADO')));
});
test('renders actionable duplicate review, including fixed assignments and current decisions',async()=>{
 const x=await preparation([person]);
 const html=preparationView({...x,conflicts:[{key:'group',hash:'hash',people:[person,{...person,id:2,status:'ASIGNADO',hospitalId:100}],decision:{keep_ids:[1],reason:'Revisión anterior'}}]},'test-csrf');
 assert.match(html,/action="\/preparation\/resolve"/);
 assert.match(html,/name="decisionReviewed"/);
 assert.match(html,/name="keep" value="1" checked/);
 assert.doesNotMatch(html,/name="keep" value="2"/);
 assert.match(html,/Revisión anterior/);
});
test('neutralizes formula payloads in official and simulation CSV exports',()=>{
 for(const fullName of ['=1+1','+1+1','-1+1','@SUM(A1)','  =1+1','\t=1+1','\r=1+1','\n=1+1']){
  const draw={id:1,winners:[{...person,fullName}],specialCases:[],createdAt:person.createdAt};
  assert.ok(generateCsvExport(draw).includes('"\''+fullName.trim()+'"'));
  assert.ok(simulationCsv({people:[{...person,fullName}]}).includes('"\''+fullName.trim()+'"'));
 }
});
test('rejects entropy that would produce an oversized session or excessive storage',()=>{
 assert.equal(AdminLoginSchema.safeParse({username:'admin',password:'password',entropyWords:Array(5).fill('a'.repeat(1000)).join(' ')}).success,false);
 assert.equal(AdminLoginSchema.safeParse({username:'admin',password:'password',entropyWords:'fuego trueno bosque cristal viento'}).success,true);
});
test('builds an offline result package without SSH environment variables',()=>{
 for(const key of Object.keys(process.env))if(key.startsWith('SSRO_BRIDGE_'))delete process.env[key];
 const p=buildResultPackage({id:1,winners:[],specialCases:[],careerIds:[1],sourceHash:'s',inputHash:'h'},{specialCases:[]},'00'.repeat(32));
 assert.equal(p.destination.system,'qmarasc');
});
test('trusts only configured proxy addresses, without enabling arbitrary forwarded headers',()=>{
 const app=express();app.set('trust proxy',trustedProxies('loopback'));
 const trust=app.get('trust proxy fn');
 assert.equal(trust('127.0.0.1'),true);
 assert.equal(trust('::1'),true);
 assert.equal(trust('198.51.100.20'),false);
 assert.equal(trustedProxies('none'),false);
 for(const value of ['true','1','false',''])assert.throws(()=>trustedProxies(value),/TRUSTED_PROXIES/);
});
test('updated SheetJS exports official and simulation workbooks with text cells',()=>{
 const participant={...person,fullName:'=1+1'};
 const draw={id:1,winners:[participant],specialCases:[],createdAt:person.createdAt,userWords:['fuego','trueno','bosque','cristal','viento'],serverPhrase:'fixture'};
 const official=XLSX.read(generateExcelExport(draw),{type:'buffer'});
 assert.equal(official.SheetNames.length,4);
 assert.equal(official.Sheets['Todos para memorandos'].D2.v,'=1+1');
 assert.equal(official.Sheets['Todos para memorandos'].D2.t,'s');
 assert.equal(official.Sheets['Todos para memorandos'].D2.f,undefined);
 const simulation=XLSX.read(simulationExcel({people:[participant],createdAt:person.createdAt}),{type:'buffer'});
 assert.equal(simulation.Sheets.Resultados.C2.v,'=1+1');
 assert.equal(simulation.Sheets.Resultados.C2.t,'s');
 assert.equal(simulation.Sheets.Resultados.C2.f,undefined);
});
