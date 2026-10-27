// Dedicated pre-enrollment wrapper; never invents a vault/keyring to seal a fresh identity.
import {check,keys,encode,decode,payloadEncode,frame,b64,unb64,random32,idOK} from '../core/package/src/codec.mjs';
import {subtle,derive,DeviceIdentity} from '../core/package/src/crypto.mjs';
export async function sealPendingRecipient(value,secret){
 check(typeof secret==='string'&&secret.isWellFormed()&&secret.length>=12&&secret.length<=1024,'UNLOCK_SECRET_PROFILE');
 check(value.format==='LB_B4_PENDING_RECIPIENT_1'&&idOK(value.accountId)&&idOK(value.vaultId)&&idOK(value.genesisPin)&&idOK(value.pairSessionId)&&['REQUEST','CANDIDATE','ACK'].includes(value.phase),'B4_PENDING_PROFILE');
 const header={format:'LB_B4_PENDING_WRAP_1',kdf:'PBKDF2_SHA256_600000',salt:b64(random32()),writerSalt:b64(random32()),aead:'AES256GCM',nonce:b64(new Uint8Array(12)),accountId:value.accountId,vaultId:value.vaultId,genesisPin:value.genesisPin,pairSessionId:value.pairSessionId,phase:value.phase};
 const password=await subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);
 const root=new Uint8Array(await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:unb64(header.salt,32)},password,256));
 try{const key=await derive(root,unb64(header.writerSalt,32),frame('LBOS/B4/pending-wrap'));return encode({header,ciphertext:b64(await subtle.encrypt({name:'AES-GCM',iv:new Uint8Array(12),additionalData:encode(header),tagLength:128},key,payloadEncode(value)))});}finally{root.fill(0);}
}
export async function openPendingRecipient(wire,secret,expected){
 check(typeof secret==='string'&&secret.isWellFormed()&&secret.length>=12&&secret.length<=1024,'UNLOCK_SECRET_PROFILE');
 const p=decode(wire,{max:6_100_000});keys(p,['header','ciphertext']);const h=p.header;
 keys(h,['format','kdf','salt','writerSalt','aead','nonce','accountId','vaultId','genesisPin','pairSessionId','phase']);
 check(h.format==='LB_B4_PENDING_WRAP_1'&&h.kdf==='PBKDF2_SHA256_600000'&&h.aead==='AES256GCM'&&unb64(h.salt,32).length===32&&unb64(h.writerSalt,32).length===32&&h.nonce===b64(new Uint8Array(12)),'B4_PENDING_WRAP_PROFILE');
 for(const k of ['accountId','vaultId','genesisPin','pairSessionId'])check(h[k]===expected[k]&&idOK(h[k]),'B4_PENDING_NAMESPACE');
 const password=await subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);const root=new Uint8Array(await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:unb64(h.salt,32)},password,256));
 try{
  const key=await derive(root,unb64(h.writerSalt,32),frame('LBOS/B4/pending-wrap'));let plain;
  try{plain=await subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(12),additionalData:encode(h),tagLength:128},key,unb64(p.ciphertext,4_500_016));}catch{check(false,'UNLOCK_FAILED');}
  const value=decode(new Uint8Array(plain),{payload:true});check(value.format==='LB_B4_PENDING_RECIPIENT_1'&&value.phase===h.phase&&['REQUEST','CANDIDATE','ACK'].includes(value.phase),'B4_PENDING_PROFILE');
  for(const k of ['accountId','vaultId','genesisPin','pairSessionId'])check(value[k]===h[k],'B4_PENDING_NAMESPACE');
  const identity=await DeviceIdentity.fromCapsule(value.identity);check(JSON.stringify(identity.public)===JSON.stringify(value.publicIdentity),'B4_PENDING_IDENTITY');return {value,identity};
 }finally{root.fill(0);}
}
