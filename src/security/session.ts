export type Session={username:string;entropyWords:string[];csrf:string;expires:number};
export const SESSION_TTL_MS=8*60*60*1000;
