// BROWSER platform adapter for the shared LB_MD_UI_BACKEND_1 composition (multi-device/md-backend.mjs).
// Keeps the accepted Site v15 S03 platform behavior exactly: fixed HTTPS origin, IndexedDB store keyed by
// location.origin, navigator.locks exclusive owner claim 'lb-md-owner:<id>' (ifAvailable), local unlock
// after the provider session, suspend on offline/pagehide/hidden, relay-client preflight.
import {check,sha,idOK} from '../../core/package/src/codec.mjs';
import {AuthSession,validatePublicConfig} from '../auth-session.mjs';
import {OwnerTransport} from '../owner-transport.mjs';
import {SequentialIDBStore} from './indexeddb-store.mjs';
import {createMDBackend,routesFor} from '../md-backend.mjs';
export const BROWSER_ROUTE_GROUPS=Object.freeze(['CORE','TOTP_ENROLL','FREEZE','RELAY_CLIENT_PREFLIGHT','SPONSOR','RECIPIENT']);
// MD03 B02 noncanonical fix (2026-10-27): the B4 recipient requires a durable pending store and an unlock
// secret (md-backend enroll-start keys). Expose only the recipient-side durable routes the Windows host has.
export const BROWSER_RECIPIENT_DURABLE_ROUTES=Object.freeze(['enroll-pending-list','enroll-resume','enroll-publish-ack']);
export const PENDING_DATABASE_NAME='LIFE_BRICK_PENDING_RECIPIENT_V1';
// Origin-scoped IndexedDB staging for the sealed pending recipient (LB_B4_PENDING_WRAP_1 ciphertext only).
// Same port as product/store/pending-record.mjs: list() ids, read(id) bytes|null, publish(id,bytes,expectedSha|null) -> sha.
// The hash CAS runs inside one readwrite transaction, so concurrent tabs cannot both publish from the same base.
export function browserPendingRecords({indexedDBImpl=globalThis.indexedDB}={}){
 const STORE='pending';
 const open=()=>{check(globalThis.isSecureContext&&indexedDBImpl,'MD_SECURE_BROWSER_REQUIRED');return new Promise((ok,no)=>{const r=indexedDBImpl.open(PENDING_DATABASE_NAME,1);r.onupgradeneeded=()=>{r.result.createObjectStore(STORE,{keyPath:'key'});};r.onerror=()=>no(r.error??new Error('B4_PENDING_IDB_OPEN'));r.onblocked=()=>no(new Error('B4_PENDING_IDB_BLOCKED'));r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result);};});};
 const keyOf=id=>{check(idOK(id),'B4_PENDING_ID');return location.origin+'|'+id;};
 async function run(mode,body){const db=await open();try{return await new Promise((ok,no)=>{
  const tx=db.transaction(STORE,mode,mode==='readwrite'?{durability:'strict'}:{}),store=tx.objectStore(STORE);let result,cause=null;
  const fail=e=>{cause=e;try{tx.abort();}catch{}};
  tx.oncomplete=()=>ok(result);tx.onabort=()=>no(cause??tx.error??new Error('B4_PENDING_IDB_ABORT'));tx.onerror=()=>{};
  try{body(store,v=>{result=v;},fail);}catch(e){fail(e);}
 });}finally{db.close();}}
 return Object.freeze({
  list:async()=>run('readonly',(s,set,fail)=>{const r=s.getAll();r.onsuccess=()=>{try{set(r.result.filter(x=>x.origin===location.origin&&idOK(x.id)).map(x=>x.id).sort());}catch(e){fail(e);}};}),
  read:async id=>{const key=keyOf(id);return run('readonly',(s,set,fail)=>{const r=s.get(key);r.onsuccess=()=>{try{const v=r.result;if(v===undefined){set(null);return;}const bytes=new Uint8Array(v.bytes);check(v.key===key&&v.origin===location.origin&&v.id===id&&sha(bytes)===v.hash,'B4_PENDING_INTEGRITY');set(bytes);}catch(e){fail(e);}};});},
  publish:async(id,bytes,expected)=>{
   const key=keyOf(id);check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=6_100_000,'B4_PENDING_LIMIT');check(expected===null||idOK(expected),'B4_PENDING_CAS');
   const hash=sha(bytes),stored=bytes.slice().buffer;
   return run('readwrite',(s,set,fail)=>{const r=s.get(key);r.onsuccess=()=>{try{const old=r.result;check(expected===null?old===undefined:old!==undefined&&old.hash===expected&&sha(new Uint8Array(old.bytes))===expected,'B4_PENDING_CAS');s.put({key,origin:location.origin,id,hash,bytes:stored});set(hash);}catch(e){fail(e);}};});
  },
 });
}
export async function createBrowserBackend({config,authFactory,transportFactory,syntheticOrigin=false,lockManager=globalThis.navigator?.locks}={}){
 config=validatePublicConfig(config);check(config.browserOrigin===location.origin||(syntheticOrigin&&location.hostname==='127.0.0.1'&&isSecureContext),'MD_FIXED_BROWSER_ORIGIN');
 const auth=authFactory?authFactory(config):new AuthSession(config),transport=transportFactory??((identity,keyring)=>new OwnerTransport({endpoint:config.edgeUrl,auth,identity,accountId:keyring.accountId,vaultId:keyring.vaultId}));
 // Storage port: the release-pinned origin-scoped IndexedDB store (looked up at call time).
 const storage={
  pending:browserPendingRecords(),
  profiles:()=>SequentialIDBStore.profiles(),
  open:(id,unlockSecret)=>SequentialIDBStore.open(id,unlockSecret),
  createEnrolled:(material,opts)=>SequentialIDBStore.createEnrolled(material,opts),
  enrolledId:material=>[location.origin,material.keyring.accountId,material.keyring.vaultId,material.identity.public.deviceId].join('|'),
 };
 // Ownership port: the accepted S03 navigator.locks claim. `lost` settles when the held lock ends.
 const ownership={async claim(id){
  check(lockManager&&typeof lockManager.request==='function','MD_LOCAL_OWNER_LOCK_UNAVAILABLE');
  let resolveClaim,release;const claimed=new Promise(resolve=>{resolveClaim=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  const name='lb-md-owner:'+id;
  const done=Promise.resolve().then(()=>lockManager.request(name,{mode:'exclusive',ifAvailable:true},lock=>{resolveClaim({granted:!!lock});return lock?hold:undefined;})).catch(()=>{resolveClaim({error:true});});
  const result=await claimed;
  if(result.error){await done;check(false,'MD_LOCAL_OWNER_LOCK_UNAVAILABLE');}
  if(!result.granted){await done;return null;}
  return {lost:done,async release(){release();await done;}};
 }};
 const policy={
  routes:[...routesFor(BROWSER_ROUTE_GROUPS),...BROWSER_RECIPIENT_DURABLE_ROUTES],localUnlockRequiresAuth:true,serverSync:'SERVER_ENCRYPTED_SYNC',
  settings:()=>({surface:'BROWSER',backup:{status:'SYNC_PRIMARY_WINDOWS_THEN_COLD_BACKUP'},recoveryRoot:'이 브라우저에는 recovery private authority를 보관하지 않습니다.'}),
  async relayClientPreflight(){
   check(isSecureContext&&!!crypto.subtle&&!!indexedDB,'RELAY_BROWSER_CAPABILITY');
   const response=await fetch(config.edgeUrl,{method:'OPTIONS',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
   check(response.status===204,'RELAY_EDGE_CONNECTIVITY');return {status:'RELAY_CLIENT_READY'};
  },
 };
 const {backend,suspend:suspendService}=await createMDBackend({surface:'BROWSER',auth,transport,storage,ownership,policy});
 // Lifecycle port: the accepted S03 browser signals.
 const suspend=()=>{suspendService();globalThis.dispatchEvent(new CustomEvent('life-brick-md-state',{detail:{state:'READ_ONLY'}}));};
 addEventListener('offline',suspend);addEventListener('pagehide',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
 return backend;
}
