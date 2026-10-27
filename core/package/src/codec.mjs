import {Buffer} from '../../../multi-device/portable/bytes.mjs';
import {createHash,randomBytes} from '../../../multi-device/portable/node-crypto.mjs';
import {canonical as modelCanonical} from '../parent/v2_phase2/source/canonical.mjs';
export class Hold extends Error {constructor(code){super(code);this.name='Hold';this.code=code;}}
export function check(value,code){if(!value)throw new Hold(code);}
export const copy=v=>structuredClone(v);
export const utf8=s=>new TextEncoder().encode(s);
export const hex=b=>Buffer.from(b).toString('hex');
export const randomId=()=>hex(randomBytes(32));
export const random32=()=>new Uint8Array(randomBytes(32));
export const b64=b=>Buffer.from(b).toString('base64url');
export function unb64(s,max=5_000_000){check(typeof s==='string'&&s.length<=max*2&&/^[A-Za-z0-9_-]*$/.test(s),'BASE64');const b=new Uint8Array(Buffer.from(s,'base64url'));check(b.length<=max&&b64(b)===s,'BASE64');return b;}
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const idOK=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export function jsonCheck(v,depth=0){check(depth<=64,'JSON_DEPTH');if(typeof v==='string'){check(v.isWellFormed(),'UNICODE');return;}if(v===null||typeof v==='boolean')return;if(typeof v==='number'){check(Number.isFinite(v),'FINITE_NUMBER');return;}if(Array.isArray(v)){check(v.length<=100000,'ARRAY_LIMIT');v.forEach(x=>jsonCheck(x,depth+1));return;}check(v&&Object.getPrototypeOf(v)===Object.prototype,'JSON_TYPE');for(const [k,x]of Object.entries(v)){check(k.isWellFormed(),'UNICODE');jsonCheck(x,depth+1);}}
function jcs(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(jcs).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+jcs(v[k])).join(',')+'}';}
export function encode(v){jsonCheck(v);return utf8(jcs(v));}
export function payloadEncode(v){jsonCheck(v);return utf8(modelCanonical(v));}
export function decode(b,{payload=false,max=5_000_000}={}){check(b instanceof Uint8Array&&b.length<=max,'WIRE_LIMIT');let text,v;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);v=JSON.parse(text);}catch{throw new Hold('JSON_UTF8');}const expected=payload?payloadEncode(v):encode(v);check(Buffer.from(expected).equals(Buffer.from(b)),'NONCANONICAL_OR_DUPLICATE_JSON');return v;}
export function keys(v,names){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...names].sort().join('|'),'SCHEMA_KEYS');}
export function frame(...parts){const out=[];for(const p of parts){const b=typeof p==='string'?utf8(p):new Uint8Array(p);const n=Buffer.alloc(4);n.writeUInt32BE(b.length);out.push(n,b);}return new Uint8Array(Buffer.concat(out));}
export const same=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
export const fingerprint=v=>sha(encode(v));
