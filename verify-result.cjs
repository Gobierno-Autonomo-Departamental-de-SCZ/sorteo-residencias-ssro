const fs=require('node:fs');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {assign,ALGORITHM}=require('./dist/services/lottery');
const {buildResultPackage,packageHash}=require('./dist/services/resultPackage');
function verify(p){
 assert.equal(p.format,'qmarasc-residency-result-v2');assert.equal(p.algorithm,ALGORITHM);
 const {checksum,...body}=p;
 assert.equal(checksum.algorithm,'SHA-256');assert.equal(checksum.canonicalization,'sorted-object-keys-json-v1');assert.equal(checksum.value,packageHash(body));
 const seed=Buffer.from(p.seed,'hex');assert.equal(seed.length,32);
 assert.equal(p.serverPhrase,'CSPRNG SHA-256: '+crypto.createHash('sha256').update(seed).digest('hex'));
 assert.equal(p.rule,p.input.rule);assert.equal(p.sourceHash,p.input.sourceHash);
 const replay=assign(p.input.participants,p.input.slots,p.input.rule,seed);
 assert.equal(replay.length,p.assignments.length);
 assert.deepEqual(replay.map(r=>[r.person.id,r.person.studentId,r.person.personId,r.person.careerId,r.slot.hospitalId,r.slot.quotaId,r.rank]),p.assignments.map(a=>[a.id_habilitacion,a.id_estudiante,a.id_persona,a.id_tipo_carrera,a.id_establecimiento_salud,a.id_cupo_establecimiento_salud,a.puesto]));
 const reconstructed=buildResultPackage(p,p.input,p.seed);
 assert.deepEqual(p.memoRecipients,reconstructed.memoRecipients);assert.deepEqual(p.assignments,reconstructed.assignments);assert.deepEqual(p.summary,reconstructed.summary);assert.equal(p.packageId,reconstructed.packageId);
 const quotas=new Map(p.input.quotaBaseline.map(q=>[q.quotaId,q]));const used=new Map();
 for(const r of p.memoRecipients){const q=quotas.get(r.id_cupo_establecimiento_salud);assert.ok(q);assert.equal(q.id,r.id_establecimiento_salud);assert.equal(q.careerId,r.id_tipo_carrera);used.set(q.quotaId,(used.get(q.quotaId)||0)+r.incremento_cupo);}
 for(const [id,n] of used)assert.ok(n<=quotas.get(id).availableSlots);
 assert.equal(p.summary.eligibleBeforeReview,p.summary.memoRecipients+p.input.excludedIds.length);
 return p.summary;
}
module.exports={verify};
if(require.main===module){const summary=verify(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log('Verificado: '+summary.newAssignments+' asignaciones nuevas y '+summary.preexistingAssignments+' previas; '+summary.memoRecipients+' destinatarios de memorandos. No se escribió en ninguna base.');}
