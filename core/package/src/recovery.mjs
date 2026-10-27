import {check,keys,encode,decode,payloadEncode,frame,b64,unb64,random32,fingerprint,copy} from './codec.mjs';
import {subtle,derive,DeviceIdentity} from './crypto.mjs';
import {dataKeyring,Roster,createVault} from './enrollment.mjs';


const scopes=['LOCAL_CAPSULE','DATA_RECOVERY_ARCHIVE','RECOVERY_AUTHORITY_PACKAGE'];
async function passwordRoot(secret,salt){
  check(typeof secret==='string'&&secret.length>=12&&secret.length<=1024,'UNLOCK_SECRET_PROFILE');
  const p=await subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt},p,256));
}
async function wrap(scope,value,secret){
  check(scopes.includes(scope),'WRAP_SCOPE');
  const header={format:'LBOS_WRAPPED_1',scope,kdf:'PBKDF2_SHA256_600000',salt:b64(random32()),writerSalt:b64(random32()),aead:'AES256GCM',nonce:b64(new Uint8Array(12))};
  const root=await passwordRoot(secret,unb64(header.salt,32));
  try {
    const key=await derive(root,unb64(header.writerSalt,32),frame('LBOS/2/wrap',scope));
    const ct=await subtle.encrypt({name:'AES-GCM',iv:unb64(header.nonce,12),additionalData:encode(header)},key,payloadEncode(value));
    return encode({header,ciphertext:b64(ct)});
  } finally {root.fill(0);}
}
async function unwrap(scope,wire,secret){
  const p=decode(wire,{max:6_100_000});keys(p,['header','ciphertext']);
  const h=p.header;keys(h,['format','scope','kdf','salt','writerSalt','aead','nonce']);
  check(h.format==='LBOS_WRAPPED_1'&&h.scope===scope&&h.kdf==='PBKDF2_SHA256_600000'&&h.aead==='AES256GCM'&&unb64(h.salt,32).length===32&&unb64(h.writerSalt,32).length===32&&h.nonce===b64(new Uint8Array(12)),'WRAP_PROFILE');
  const root=await passwordRoot(secret,unb64(h.salt,32));
  try {
    const key=await derive(root,unb64(h.writerSalt,32),frame('LBOS/2/wrap',scope));
    let plain;try {plain=await subtle.decrypt({name:'AES-GCM',iv:unb64(h.nonce,12),additionalData:encode(h)},key,unb64(p.ciphertext));}catch{check(false,'UNLOCK_FAILED');}
    return decode(new Uint8Array(plain),{payload:true});
  } finally {root.fill(0);}
}
export async function sealLocalCapsule({identity,keyring,roster,checkpoint=null},secret){
  return wrap('LOCAL_CAPSULE',{format:'LBOS_LOCAL_CAPSULE_1',identity:await identity.capsuleMaterial(),keyring:dataKeyring(keyring),roster:roster.evidence,checkpoint},secret);
}
export async function openLocalCapsule(wire,secret){
  const p=await unwrap('LOCAL_CAPSULE',wire,secret);keys(p,['format','identity','keyring','roster','checkpoint']);check(p.format==='LBOS_LOCAL_CAPSULE_1','CAPSULE_FORMAT');
  const keyring=dataKeyring(p.keyring),roster=await Roster.load(p.roster,keyring.genesisPin),identity=await DeviceIdentity.fromCapsule(p.identity);
  roster.author(roster.epoch,roster.head,identity.public.deviceId,identity.public.keyId);
  return {identity,keyring,roster,checkpoint:copy(p.checkpoint)};
}
export async function sealRecoveryPackage(value,secret){
  keys(value,['type','dataKeyring','recoveryAuthorizerPrivate']);check(value.type==='RecoveryPackage'&&value.recoveryAuthorizerPrivate?.d,'SEPARATE_RECOVERY_AUTHORITY_REQUIRED');dataKeyring(value.dataKeyring);
  return wrap('RECOVERY_AUTHORITY_PACKAGE',value,secret);
}
export async function openRecoveryPackage(wire,secret){
  const p=await unwrap('RECOVERY_AUTHORITY_PACKAGE',wire,secret);keys(p,['type','dataKeyring','recoveryAuthorizerPrivate']);check(p.type==='RecoveryPackage'&&p.recoveryAuthorizerPrivate?.d,'SEPARATE_RECOVERY_AUTHORITY_REQUIRED');dataKeyring(p.dataKeyring);return p;
}
