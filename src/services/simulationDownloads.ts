import {boliviaDate} from '../utils/boliviaDate.js';
import {randomInt,randomUUID} from 'node:crypto';
const XLSX=require('xlsx');
const PDFDocument=require('pdfkit');
export type SimulationList={id:string;createdAt:string;expires:number;people:any[]};
const cache=new Map<string,{owner:string;list:SimulationList}>();
function prune(){for(const [id,item] of cache)if(item.list.expires<=Date.now())cache.delete(id);}
export function rememberSimulation(draw:any,owner:string):SimulationList {
 prune();while(cache.size>=50)cache.delete(cache.keys().next().value!);
 const people=[...draw.winners,...draw.specialCases].map(p=>({id:p.id,fullName:p.fullName,documentId:p.documentId,career:p.career,assignedHospital:p.assignedHospital||p.specialHospital}));
 for(let i=people.length-1;i>0;i--){const j=randomInt(i+1);[people[i],people[j]]=[people[j],people[i]];}
 const list={id:randomUUID(),createdAt:draw.createdAt,expires:Date.now()+60*60*1000,people};cache.set(list.id,{owner,list});return list;
}
export function getSimulation(id:string,owner:string){prune();const item=cache.get(id);return item?.owner===owner?item.list:null;}
const headers=['N°','Habilitación','Nombre','Documento','Carrera','Establecimiento'];
function rows(list:SimulationList){return list.people.map((p,i)=>[i+1,p.id,p.fullName,p.documentId,p.career,p.assignedHospital]);}
export function simulationCsv(list:SimulationList){
 const cell=(v:any)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\uFEFF'+[headers,...rows(list)].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function simulationExcel(list:SimulationList):Buffer {
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows(list)]),'Resultados');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Tipo','Simulación sin validez oficial'],['Fecha',boliviaDate(list.createdAt)],['Total',list.people.length]]),'Información');
 return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
export function simulationPdf(list:SimulationList):Promise<Buffer>{return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:30});const chunks:Buffer[]=[];
 doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 const widths=[32,66,220,92,115,256];let y=0;
 const page=()=>{doc.font('Helvetica-Bold').fontSize(14).text('Lista de resultados',30,30);doc.font('Helvetica').fontSize(8).text('SIMULACION - SIN VALIDEZ OFICIAL | '+boliviaDate(list.createdAt)+' | Total: '+list.people.length,30,50);y=72;let x=30;headers.forEach((h,i)=>{doc.font('Helvetica-Bold').fontSize(8).text(h,x,y,{width:widths[i]-6});x+=widths[i];});y+=24;};
 page();for(const row of rows(list)){
  doc.font('Helvetica').fontSize(8);const height=Math.max(16,...row.map((v,i)=>doc.heightOfString(String(v??''),{width:widths[i]-6})))+7;
  if(y+height>doc.page.height-35){doc.addPage();page();}
  let x=30;row.forEach((v,i)=>{doc.font('Helvetica').fontSize(8).text(String(v??''),x,y,{width:widths[i]-6});x+=widths[i];});y+=height;
 }doc.end();
});}
