// BROWSER platform adapter for the shared LB_MD_UI_BACKEND_1 composition (multi-device/md-backend.mjs).
// Keeps the accepted Site v15 S03 platform behavior exactly: fixed HTTPS origin, IndexedDB store keyed by
// location.origin, navigator.locks exclusive owner claim 'lb-md-owner:<id>' (ifAvailable), local unlock
// after the provider session, suspend on offline/pagehide/hidden, relay-client preflight.
import {check} from '../../core/package/src/codec.mjs';
import {AuthSession,validatePublicConfig} from '../auth-session.mjs';
import {OwnerTransport} from '../owner-transport.mjs';
import {SequentialIDBStore} from './indexeddb-store.mjs';
import {createMDBackend,routesFor} from '../md-backend.mjs';
import {createSavedSessionIDB,createRefreshGuard} from './auth-persist-idb.mjs';
export const BROWSER_ROUTE_GROUPS=Object.freeze(['CORE','TOTP_ENROLL','FREEZE','RELAY_CLIENT_PREFLIGHT','SPONSOR','RECIPIENT','SIGNOUT']);
// MD03 P2 R2 (noncanonical): saved session = refresh token + local unlock phrase, sealed with one non-extractable AES-GCM key in the
// origin's IndexedDB LIFE_BRICK_AUTH_PERSIST_V1. The recovery phrase is never stored. Without navigator.locks / secure IndexedDB the
// backend behaves exactly as before (sign in and unlock every start).
function openSavedSession({factory,lockManager,origin}){try{return (factory??createSavedSessionIDB)({locks:lockManager,origin});}catch{return null;}}
const notifySaveFailure=code=>{try{const elsewhere=code==='AUTH_SIGNED_OUT_ELSEWHERE';globalThis.dispatchEvent?.(new CustomEvent('life-brick-saved-session',{detail:{state:elsewhere?'SIGNED_OUT_ELSEWHERE':'SAVE_FAILED',code}}));const out=globalThis.document?.getElementById('status');if(out)out.textContent=(elsewhere?'다른 창에서 로그아웃되어 이 창의 로그인도 종료되었습니다 · 다시 로그인하세요 · ':'로그인 유지 저장 실패 · 이 페이지를 닫으면 다시 로그인해야 할 수 있습니다 · ')+code;}catch{}};
export async function createBrowserBackend({config,authFactory,transportFactory,syntheticOrigin=false,lockManager=globalThis.navigator?.locks,savedSessionFactory}={}){
 config=validatePublicConfig(config);check(config.browserOrigin===location.origin||(syntheticOrigin&&location.hostname==='127.0.0.1'&&isSecureContext),'MD_FIXED_BROWSER_ORIGIN');
 const saved=authFactory?null:openSavedSession({factory:savedSessionFactory,lockManager,origin:location.origin});
 const auth=authFactory?authFactory(config):new AuthSession(config,saved?{persist:saved.auth,refreshGuard:createRefreshGuard({locks:lockManager,origin:location.origin}),onPersistFailure:notifySaveFailure}:{}),transport=transportFactory??((identity,keyring)=>new OwnerTransport({endpoint:config.edgeUrl,auth,identity,accountId:keyring.accountId,vaultId:keyring.vaultId}));
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
 return saved?withSavedSession({backend,auth,saved}):backend;
}
// Wraps the shared backend with the saved session (separate export only so the local tests can drive it with fakes).
export async function withSavedSession({backend,auth,saved,notify=notifySaveFailure}){
 // Remember the unlock phrase only after a successful manual unlock, and only that one field of that one route.
 const request=async(path,body)=>{const result=await backend.request(path,body);if(path==='/api/vault/unlock'&&typeof body?.unlockSecret==='string'){try{await saved.unlock.save(body.unlockSecret);}catch(error){notify(error?.code==='AUTH_SIGNED_OUT_ELSEWHERE'?'AUTH_SIGNED_OUT_ELSEWHERE':'UNLOCK_PERSIST_SAVE_FAILED');}}return result;};
 // Auto-open at start, only when the provider session resumed without email+TOTP. A refused phrase is forgotten; busy/auth/selection results keep it.
 try{if(await auth.resume()){const secret=await saved.unlock.load();if(secret){try{await backend.request('/api/vault/unlock',{unlockSecret:secret});}catch(error){if(!/OWNER|BUSY|CLOSING|SELECTION|ALREADY|AUTH/.test(String(error?.code??'')))await saved.unlock.forget();}}}}catch{}
 return Object.freeze({...backend,request});
}
