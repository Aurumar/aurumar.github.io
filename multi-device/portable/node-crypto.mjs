import {sha256} from '../../core/package/node_modules/@hpke/common/esm/src/hash/sha2.js';
import {Buffer} from './bytes.mjs';
export const webcrypto=globalThis.crypto;
export function randomBytes(size){if(!Number.isInteger(size)||size<0||size>65536)throw new Error('PORTABLE_RANDOM_SIZE');return Buffer.from(webcrypto.getRandomValues(new Uint8Array(size)));}
export function createHash(algorithm){
 if(algorithm!=='sha256')throw new Error('PORTABLE_HASH_ALGORITHM');
 const hash=sha256.create();let done=false;
 const api={update(bytes){if(done)throw new Error('PORTABLE_HASH_CLOSED');hash.update(typeof bytes==='string'?new TextEncoder().encode(bytes):new Uint8Array(bytes));return api;},
 digest(encoding){if(done)throw new Error('PORTABLE_HASH_CLOSED');done=true;const result=Buffer.from(hash.digest());return encoding===undefined?result:result.toString(encoding);}};
 return api;
}
