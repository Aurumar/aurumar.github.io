// BROWSER platform adapter for the shared LB_MD_UI_BACKEND_1 composition (multi-device/md-backend.mjs).
// Keeps the accepted Site v15 S03 platform behavior exactly: fixed HTTPS origin, IndexedDB store keyed by
// location.origin, navigator.locks exclusive owner claim 'lb-md-owner:<id>' (ifAvailable), local unlock
// after the provider session, suspend on offline/pagehide/hidden, relay-client preflight.
import {check} from '../../core/package/src/codec.mjs';
import {AuthSession,validatePublicConfig} from '../auth-session.mjs';
import {OwnerTransport} from '../owner-transport.mjs';
import {SequentialIDBStore} from './indexeddb-store.mjs';
import {createMDBackend,routesFor} from '../md-backend.mjs';
export const BROWSER_ROUTE_GROUPS=Object.freeze(['CORE','TOTP_ENROLL','FREEZE','RELAY_CLIENT_PREFLIGHT','SPONSOR','RECIPIENT']);
export async function createBrowserBackend({config,authFactory,transportFactory,syntheticOrigin=false,lockManager=globalThis.navigator?.locks}={}){
 config=validatePublicConfig(config);check(config.browserOrigin===location.origin||(syntheticOrigin&&location.hostname==='127.0.0.1'&&isSecureContext),'MD_FIXED_BROWSER_ORIGIN');
 const auth=authFactory?authFactory(config):new AuthSession(config),transport=transportFactory??((identity,keyring)=>new OwnerTransport({endpoint:config.edgeUrl,auth,identity,accountId:keyring.accountId,vaultId:keyring.vaultId}));
 // Storage port: the release-pinned origin-scoped IndexedDB store (looked up at call time).
 const storage={
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
  routes:routesFor(BROWSER_ROUTE_GROUPS),localUnlockRequiresAuth:true,serverSync:'SERVER_ENCRYPTED_SYNC',
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
