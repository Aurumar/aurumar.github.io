import {check} from '../../core/package/src/codec.mjs';
// MD03 P2 R2 (noncanonical, 2026-10-28): saved session for the browser surface (owner decisions: stay signed in, re-ask email+TOTP after
// 90 days unused; the local unlock phrase is saved too (D2); the recovery phrase is NEVER stored).
// IndexedDB LIFE_BRICK_AUTH_PERSIST_V1 (kept apart from the vault database LIFE_BRICK_OWNER_SEQ_V1) holds three rows:
//   key    one non-extractable AES-256-GCM CryptoKey
//   auth   refresh-token record sealed with that key, AAD = 'LB_AUTH_PERSIST_SEALED_1\n' + origin
//   unlock unlock phrase sealed with the same key,    AAD = 'LB_UNLOCK_PERSIST_SEALED_1\n' + origin
// Non-extractable only stops script from reading the key bytes; the key stays usable by any script of this origin and is not a
// defence against someone who owns the device's browser profile files. Every operation runs inside one Web Lock.
// Sign-out marker (R2 fix): signOut() leaves a random, non-secret id in the separate database LIFE_BRICK_AUTH_SIGNOUT_V1 and then deletes
// the saved session. A page remembers the marker it saw when it signed in / resumed; any save (login record or unlock phrase) by a page whose
// remembered marker is no longer current is refused (AUTH_SIGNED_OUT_ELSEWHERE), so a tab that was still signed in cannot recreate the saved login.
export const AUTH_DATABASE_NAME='LIFE_BRICK_AUTH_PERSIST_V1';
export const SIGNOUT_DATABASE_NAME='LIFE_BRICK_AUTH_SIGNOUT_V1';
// M1: how many starts in a row could not restore the login without a definite rejection (a number and a time, nothing secret). Kept in its own
// database so the sign-out marker database still holds only the random id; cleared by a successful restore/login, a definite rejection and sign-out.
export const RESTORE_DATABASE_NAME='LIFE_BRICK_AUTH_RESTORE_V1';
const DEFERRED_ID='deferred';
const STORE='saved',KEY_ID='key',AUTH_ID='auth',UNLOCK_ID='unlock',MARKER_ID='marker';
const AUTH_SEALED='LB_AUTH_PERSIST_SEALED_1',UNLOCK_SEALED='LB_UNLOCK_PERSIST_SEALED_1',AUTH_RECORD='LB_AUTH_PERSIST_1';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const usableKey=k=>!!k&&typeof k==='object'&&k.type==='secret'&&k.extractable===false&&k.algorithm?.name==='AES-GCM'&&k.algorithm.length===256&&Array.isArray(k.usages)&&k.usages.includes('encrypt')&&k.usages.includes('decrypt');
// Serialises every spend of the single-use refresh token (load newest -> refresh -> save) across tabs/windows of this origin.
export function createRefreshGuard({locks=globalThis.navigator?.locks,origin=globalThis.location?.origin}={}){
 check(locks&&typeof locks.request==='function'&&typeof origin==='string'&&origin.length>0,'MD_SAVED_SESSION_UNAVAILABLE');
 return fn=>locks.request('lb-auth-refresh:'+origin,{mode:'exclusive'},fn);
}
export function createSavedSessionIDB({idb=globalThis.indexedDB,crypto=globalThis.crypto,locks=globalThis.navigator?.locks,origin=globalThis.location?.origin}={}){
 check(idb&&typeof idb.open==='function'&&typeof idb.deleteDatabase==='function'&&crypto?.subtle&&locks&&typeof locks.request==='function'&&typeof origin==='string'&&origin.length>0,'MD_SAVED_SESSION_UNAVAILABLE');
 const aad=format=>enc.encode(format+'\n'+origin);
 const exclusive=fn=>locks.request('lb-saved-session:'+origin,{mode:'exclusive'},fn);
 // undefined = this page has not seen the marker yet (never signed in / resumed here): every save is refused until it has.
 let lastMarker;
 const open=name=>new Promise((ok,no)=>{const r=idb.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore(STORE,{keyPath:'id'});};r.onerror=()=>no(r.error??new Error('SAVED_IDB_OPEN'));r.onblocked=()=>no(new Error('SAVED_IDB_BLOCKED'));r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result);};});
 const readAll=db=>new Promise((ok,no)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).getAll();let rows=[];r.onsuccess=()=>{rows=r.result;};tx.oncomplete=()=>ok(new Map(rows.map(x=>[x.id,x])));tx.onabort=()=>no(tx.error??new Error('SAVED_IDB_ABORT'));});
 // One transaction: deletes first, then puts.
 const write=(db,puts,dels)=>new Promise((ok,no)=>{const tx=db.transaction(STORE,'readwrite',{durability:'strict'});let cause=null;tx.oncomplete=()=>ok();tx.onabort=()=>no(cause??tx.error??new Error('SAVED_IDB_ABORT'));tx.onerror=()=>{};
  try{const s=tx.objectStore(STORE);for(const id of dels)s.delete(id);for(const row of puts)s.put(row);}catch(e){cause=e;try{tx.abort();}catch{}}});
 // deleteDatabase may wait for other tabs' short-lived connections (they close after every operation); a "blocked" event is not an error.
 const dropAll=()=>new Promise((ok,no)=>{const r=idb.deleteDatabase(AUTH_DATABASE_NAME);r.onsuccess=()=>ok();r.onerror=()=>no(r.error??new Error('SAVED_IDB_DELETE'));});
 async function withDb(fn,name=AUTH_DATABASE_NAME){const db=await open(name);try{return await fn(db);}finally{db.close();}}
 const readMarker=()=>withDb(async db=>(await readAll(db)).get(MARKER_ID)?.value??null,SIGNOUT_DATABASE_NAME);
 const readDeferred=()=>withDb(async db=>{const n=(await readAll(db)).get(DEFERRED_ID)?.count;return Number.isSafeInteger(n)&&n>0?n:0;},RESTORE_DATABASE_NAME);
 const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 // Returns the key plus the rows that must be written/deleted with it; a missing or unusable key makes the old sealed rows unreadable, so they go.
 async function ensureKey(rows){
  const existing=rows.get(KEY_ID)?.key;if(usableKey(existing))return {key:existing,puts:[],dels:[]};
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  return {key,puts:[{id:KEY_ID,key}],dels:[AUTH_ID,UNLOCK_ID]};
 }
 async function seal(key,format,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv,ct:new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(format)},key,bytes))};}
 async function save(id,format,bytes){
  await exclusive(async()=>{
   // Checked inside the same Web Lock as signOut(), so a sign-out and a save can never interleave.
   const current=await readMarker();check(lastMarker!==undefined,'AUTH_PERSIST_MARKER_UNKNOWN');check(current===lastMarker,'AUTH_SIGNED_OUT_ELSEWHERE');
   await withDb(async db=>{const rows=await readAll(db),k=await ensureKey(rows),sealed=await seal(k.key,format,bytes);await write(db,[...k.puts,{id,format,...sealed}],k.dels.filter(x=>x!==id));});
  });
 }
 // A row that cannot be opened (damaged, wrong key, other origin/format) is not repaired: the whole saved session is deleted.
 // checkMarker: a page that signed in before another tab signed out may not read the saved login any more (it could otherwise spend the
 // refresh token of a newer sign-in); the check is skipped only while this page has no marker yet (before its own sign-in/resume).
 async function load(id,format,checkMarker=false){
  return exclusive(async()=>{
   if(checkMarker&&lastMarker!==undefined)check((await readMarker())===lastMarker,'AUTH_SIGNED_OUT_ELSEWHERE');
   const bytes=await withDb(async db=>{
    const rows=await readAll(db),row=rows.get(id);if(!row)return null;
    const key=rows.get(KEY_ID)?.key;if(!usableKey(key)||row.format!==format||!(row.iv instanceof Uint8Array)||!(row.ct instanceof Uint8Array))return false;
    try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:aad(format)},key,row.ct));}catch{return false;}
   });
   if(bytes===false){await dropAll();return null;}
   return bytes;
  });
 }
 const auth={
  async save(value){
   check(value&&value.format===AUTH_RECORD&&typeof value.sub==='string'&&value.sub.length>0&&value.sub.length<=256&&typeof value.refreshToken==='string'&&value.refreshToken.length>0&&value.refreshToken.length<=4096&&Number.isSafeInteger(value.savedAt),'AUTH_PERSIST_RECORD');
   await save(AUTH_ID,AUTH_SEALED,enc.encode(JSON.stringify({format:value.format,sub:value.sub,refreshToken:value.refreshToken,savedAt:value.savedAt})));
  },
  async load(){
   const bytes=await load(AUTH_ID,AUTH_SEALED,true);if(bytes===null)return null;
   let value;try{value=JSON.parse(dec.decode(bytes));}catch{value=null;}
   if(!value||value.format!==AUTH_RECORD||typeof value.sub!=='string'||typeof value.refreshToken!=='string'||!Number.isSafeInteger(value.savedAt)){await exclusive(dropAll);return null;}
   return value;
  },
  // Called when this page signs in or resumes: remembers the current sign-out marker (see the header comment).
  async marker(){return exclusive(async()=>{try{lastMarker=await readMarker();}catch(error){lastMarker=undefined;throw error;}return lastMarker;});},
  // Forgetting the login (90 idle days, refused session) removes the whole database: token, key and unlock phrase.
  forget(){return exclusive(dropAll);},
  // Consecutive deferred starts (see auth-session.mjs resume()): +1 and return, read, or clear.
  noteDeferred(){return exclusive(async()=>{const n=(await readDeferred())+1;await withDb(db=>write(db,[{id:DEFERRED_ID,count:n,at:Math.floor(Date.now()/1000)}],[]),RESTORE_DATABASE_NAME);return n;});},
  deferredCount(){return exclusive(readDeferred);},
  clearDeferred(){return exclusive(()=>withDb(db=>write(db,[],[DEFERRED_ID]),RESTORE_DATABASE_NAME));},
  // Explicit sign-out: new marker first (so no other tab can save any more), then the whole saved session is deleted. A failure is thrown, never hidden.
  signOut(){return exclusive(async()=>{lastMarker=undefined;await withDb(db=>write(db,[{id:MARKER_ID,value:randomId()}],[]),SIGNOUT_DATABASE_NAME);await dropAll();try{await withDb(db=>write(db,[],[DEFERRED_ID]),RESTORE_DATABASE_NAME);}catch{}});},
 };
 const unlock={
  async save(secret){check(typeof secret==='string'&&secret.isWellFormed()&&secret.length>=12&&secret.length<=1024,'UNLOCK_SECRET_PROFILE');await save(UNLOCK_ID,UNLOCK_SEALED,enc.encode(secret));},
  async load(){const bytes=await load(UNLOCK_ID,UNLOCK_SEALED);if(bytes===null)return null;try{const s=dec.decode(bytes);if(s.isWellFormed()&&s.length>=12&&s.length<=1024)return s;}catch{}await exclusive(dropAll);return null;},
  // A refused phrase is forgotten on its own; the login stays.
  forget(){return exclusive(()=>withDb(db=>write(db,[],[UNLOCK_ID])));},
 };
 return Object.freeze({auth:Object.freeze(auth),unlock:Object.freeze(unlock)});
}
