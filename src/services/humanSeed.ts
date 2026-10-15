import crypto from 'node:crypto';
import {HumanEntropyWordsSchema} from '../security/validation.js';

export const HUMAN_SEED_DERIVATION='HMAC-SHA256-human-words-v1';

export function deriveHumanSeed(words:string[],serverRandom:Buffer=crypto.randomBytes(32)):Buffer {
 if(!Array.isArray(words)||words.length!==5||words.some(word=>typeof word!=='string'))throw Error('Se requieren las cinco palabras del inicio de sesión.');
 const normalized=HumanEntropyWordsSchema.parse(words.join(' '));
 if(!Buffer.isBuffer(serverRandom)||serverRandom.length!==32)throw Error('La fuente aleatoria debe tener 32 bytes.');
 return crypto.createHmac('sha256',serverRandom)
  .update('ssro-residency-seed-words-v1\0','utf8')
  .update(JSON.stringify(normalized),'utf8').digest();
}
