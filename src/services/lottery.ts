import crypto from 'node:crypto';
export const ALGORITHM='HMAC-SHA256-counter-rejection-FisherYates-career-v2';
export class RandomStream {
 private counter=0;
 constructor(private seed:Buffer){}
 uint32(){return crypto.createHmac('sha256',this.seed).update('residency:'+this.counter++).digest().readUInt32BE(0);}
 int(n:number){
  if(!Number.isInteger(n)||n<1||n>0x100000000)throw Error('Rango aleatorio inválido');
  const limit=Math.floor(0x100000000/n)*n;let x:number;do{x=this.uint32();}while(x>=limit);return x%n;
 }
 shuffle<T>(input:T[]):T[]{const a=[...input];for(let i=a.length-1;i>0;i--){const j=this.int(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
}
export function assign<T extends {id:number;score:number;careerId?:number},S extends {careerId?:number}>(people:T[],slots:S[],rule:string,seed:Buffer){
 if(slots.length<people.length)throw Error('Cupos insuficientes');
 if(!['uniform','weighted'].includes(rule))throw Error('Debe seleccionar la regla del sorteo');
 if(new Set(people.map(p=>p.id)).size!==people.length)throw Error('Habilitaciones repetidas');
 const rng=new RandomStream(seed);
 let ordered=rng.shuffle(people);
 if(rule==='weighted'){
  if(ordered.some(p=>!Number.isFinite(p.score)||p.score<=0))throw Error('Notas inválidas');
  ordered=ordered.map(p=>({p,value:p.score*(rng.uint32()+0.5)/0x100000000})).sort((a,b)=>b.value-a.value).map(x=>x.p);
 }
 const shuffledSlots=rng.shuffle(slots);
 const pools=new Map<number,S[]>();
 for(const slot of shuffledSlots){const key=slot.careerId??0;pools.set(key,[...(pools.get(key)||[]),slot]);}
 const needs=new Map<number,number>();for(const p of people)needs.set(p.careerId??0,(needs.get(p.careerId??0)||0)+1);
 for(const [career,n] of needs)if((pools.get(career)?.length||0)<n)throw Error('Cupos insuficientes para la carrera '+career);
 return ordered.map((person,i)=>({person,slot:pools.get(person.careerId??0)!.pop()!,rank:i+1}));
}
