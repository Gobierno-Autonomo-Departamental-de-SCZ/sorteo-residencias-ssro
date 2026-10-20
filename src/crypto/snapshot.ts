import {encryptPacked,decryptPacked} from './cipher.js';

/** JSONB envelope; legacy rows remain readable during the security migration. */
export function sealSnapshot(value:unknown):{encrypted:string} {
 return {encrypted:encryptPacked(JSON.stringify(value))};
}

export function openSnapshot<T=any>(value:any):T {
 return value&&typeof value.encrypted==='string'?JSON.parse(decryptPacked(value.encrypted)):value;
}
