import {check,keys,unb64,Hold} from '../core/package/src/codec.mjs';
// Auth credentials stay in this object's memory. No URL token, cookie, storage, analytics or service worker is used.
// MD03 P1 (noncanonical, 2026-10-28): an OPTIONAL persist port lets the Windows host keep the refresh token in an
// OS-protected vault (owner decision: stay signed in, re-ask email+TOTP after 90 days unused). Without the port
// (browser builds) behaviour is unchanged. Recent-TOTP checks for enrollment/retirement still apply after resume.
// MD03 P2 R2 (noncanonical, 2026-10-28): the persist port may be async (browser IndexedDB: multi-device/browser/auth-persist-idb.mjs),
// load/save/forget are awaited, a failed save is reported (onPersistFailure/persistStatus) without ending the session,
// and an optional refreshGuard serialises every spend of the single-use refresh token across tabs/windows.
// A port may also offer marker()/signOut(): sign-in and resume remember the port's sign-out marker, and a save refused with
// AUTH_SIGNED_OUT_ELSEWHERE (another tab signed out meanwhile) ends this session instead of recreating the saved login.
// MD03 M1 (noncanonical, 2026-10-28): resume() deletes the saved login only on a DEFINITE rejection (the server names the refresh token or
// session invalid/used/revoked, aal1, another owner, 90 idle days). Network errors, 429, 5xx and anything unreadable are kept and reported as
// a deferred restore (resumeStatus); the optional port methods noteDeferred()/deferredCount()/clearDeferred() count deferred starts in a row,
// and from the 3rd the status asks for a new sign-in without deleting anything.
// The reviewed iPad packaged origin is admitted by exact string only.
const IPAD_APP_ORIGIN='lifebrick-app://localhost';
const RESTORE_DEFER_LIMIT=3;
export function validatePublicConfig(config){
 keys(config,['format','authUrl','issuer','audience','publishableKey','edgeUrl','browserOrigin']);check(config.format==='LB_MD_PUBLIC_CONFIG_1'&&config.audience==='authenticated','MD_PUBLIC_CONFIG');
 const ipadOrigin=config.browserOrigin===IPAD_APP_ORIGIN;
 for(const name of ['authUrl','issuer','edgeUrl',...(ipadOrigin?[]:['browserOrigin'])]){const u=new URL(config[name]);check(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&!u.hostname.endsWith('.invalid'),'MD_CONFIG_NOT_PROVISIONED');}
 check(config.authUrl===config.issuer&&(ipadOrigin||new URL(config.browserOrigin).origin===config.browserOrigin)&&typeof config.publishableKey==='string'&&config.publishableKey.length>=20,'MD_PUBLIC_CONFIG');
 check(!config.publishableKey.startsWith('sb_secret_'),'MD_SERVER_SECRET_FORBIDDEN');
 if(config.publishableKey.split('.').length===3){const claim=JSON.parse(new TextDecoder().decode(unb64(config.publishableKey.split('.')[1],20000)));check(claim.role==='anon','MD_SERVER_SECRET_FORBIDDEN');}
 return Object.freeze({...config});
}
export class AuthSession {
 #config;#fetch;#token=null;#refresh=null;#claims=null;#refreshing=null;#persist=null;#guard=null;#onPersistFailure=null;#persistState='NONE';#acceptedAt=0;#restore={state:'NOT_TRIED',code:'NOT_TRIED',count:0,relogin:false};#memDeferred=0;
 constructor(config,{fetchImpl=(...args)=>globalThis.fetch(...args),persist=null,refreshGuard=null,onPersistFailure=null}={}){this.#config=validatePublicConfig(config);this.#fetch=fetchImpl;if(persist!==null){check(typeof persist?.save==='function'&&typeof persist.load==='function'&&typeof persist.forget==='function','AUTH_PERSIST_PORT');this.#persist=persist;}
  if(refreshGuard!==null){check(typeof refreshGuard==='function','AUTH_REFRESH_GUARD');this.#guard=refreshGuard;}
  if(onPersistFailure!==null){check(typeof onPersistFailure==='function','AUTH_PERSIST_NOTIFY');this.#onPersistFailure=onPersistFailure;}}
 #guarded(fn){return this.#guard?this.#guard(fn):fn();}
 async #request(path,body,{method='POST',authenticated=false}={}){
  check(['/otp','/verify','/user','/factors','/token?grant_type=refresh_token'].includes(path)||/^\/factors\/[0-9a-f-]{36}\/(challenge|verify)$/.test(path),'AUTH_ROUTE');
  const headers={apikey:this.#config.publishableKey,'Content-Type':'application/json'};if(authenticated){check(this.#token,'AUTH_REQUIRED');headers.Authorization='Bearer '+this.#token;}
  const response=await this.#fetch(this.#config.authUrl+path,{method,redirect:'error',cache:'no-store',headers,body:method==='GET'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const text=await response.text();check(text.length<=(path==='/factors'?1000000:200000),'AUTH_RESPONSE_LIMIT');if(!response.ok)throw this.#refusal(response.status,text);let data;try{data=JSON.parse(text);}catch{check(false,'AUTH_RESPONSE_JSON');}return data;
 }
 // Every non-OK answer still throws the public code AUTH_REQUEST_REFUSED; status and `definitive` tell resume() whether the server named the
 // saved refresh token / session invalid, used or revoked (400/401/403 with a readable body), as opposed to 429, 5xx or an unreadable body.
 #refusal(status,text){
  let remote='';try{const j=JSON.parse(text);remote=[j?.error_code,j?.error,j?.code,j?.msg,j?.message,j?.error_description].filter(x=>typeof x==='string').join(' ').toLowerCase();}catch{remote='';}
  const error=new Hold('AUTH_REQUEST_REFUSED');error.status=Number.isSafeInteger(status)?status:null;
  error.definitive=[400,401,403].includes(status)&&/invalid_grant|refresh_token_not_found|refresh_token_already_used|refresh_token_reuse|session_not_found|session_expired|invalid refresh token|refresh token not found|already used|session not found/.test(remote);
  return error;
 }
 async #accept(data){
  check(typeof data.access_token==='string'&&data.access_token.length<=24576&&typeof data.refresh_token==='string'&&data.refresh_token.length<=4096,'AUTH_TOKEN_RESPONSE');
  const parts=data.access_token.split('.');check(parts.length===3,'AUTH_TOKEN_FORMAT');const claims=JSON.parse(new TextDecoder().decode(unb64(parts[1],20000)));
  check(claims.iss===this.#config.issuer&&(claims.aud==='authenticated'||Array.isArray(claims.aud)&&claims.aud.length===1&&claims.aud[0]==='authenticated')&&claims.role==='authenticated'&&claims.is_anonymous===false&&claims.exp>Math.floor(Date.now()/1000),'AUTH_TOKEN_PROFILE');
  if(this.#claims)check(claims.sub===this.#claims.sub,'AUTH_OWNER_CHANGED');this.#token=data.access_token;this.#refresh=data.refresh_token;this.#claims=claims;
  this.#acceptedAt=Math.floor(Date.now()/1000);
  if(this.#persist&&claims.aal==='aal2'){
   // The session itself is already valid in memory; a failed save only means "sign in again after this page closes".
   try{await this.#persist.save({format:'LB_AUTH_PERSIST_1',sub:claims.sub,refreshToken:data.refresh_token,savedAt:this.#acceptedAt});this.#persistState='SAVED';}
   catch(error){
    if(error?.code==='AUTH_SIGNED_OUT_ELSEWHERE')this.#signedOutElsewhere();
    this.#persistState='SAVE_FAILED';try{this.#onPersistFailure?.('AUTH_PERSIST_SAVE_FAILED');}catch{}
   }
  }
 }
 // Another tab signed out after this session signed in: end this session (memory cleared, notified) and refuse to continue.
 #signedOutElsewhere(){this.clear();this.#persistState='SIGNED_OUT_ELSEWHERE';try{this.#onPersistFailure?.('AUTH_SIGNED_OUT_ELSEWHERE');}catch{}check(false,'AUTH_SIGNED_OUT_ELSEWHERE');}
 // Browser port only: remember the sign-out marker that is current at sign-in/resume. false = it could not be read.
 async #captureMarker(){if(typeof this.#persist?.marker!=='function')return true;try{await this.#persist.marker();return true;}catch{return false;}}
 // Another tab/window may have spent our refresh token and stored its successor: adopt the newer saved token before refreshing.
 async #adoptSaved(){
  if(!this.#persist)return;let saved=null;try{saved=await this.#persist.load();}catch(error){if(error?.code==='AUTH_SIGNED_OUT_ELSEWHERE')this.#signedOutElsewhere();return;}
  if(saved&&saved.format==='LB_AUTH_PERSIST_1'&&saved.sub===this.#claims?.sub&&typeof saved.refreshToken==='string'&&saved.refreshToken.length<=4096&&saved.refreshToken!==this.#refresh&&Number.isSafeInteger(saved.savedAt)&&saved.savedAt>=this.#acceptedAt)this.#refresh=saved.refreshToken;
 }
 async #forgetQuiet(){try{await this.#persist?.forget();}catch{}}
 // Resume a saved aal2 session (persist port only). Returns true when signed in again without email+TOTP.
 // M1: the saved login is deleted only on a DEFINITE rejection; every other failure keeps it and is reported through resumeStatus.
 // reason 'start' (page/app start) counts consecutive deferred starts; 'retry' (manual unlock) reads the count but does not add to it.
 get resumeStatus(){return Object.freeze({...this.#restore});}
 async #countDeferred(start){
  try{
   if(start&&typeof this.#persist?.noteDeferred==='function')return await this.#persist.noteDeferred();
   if(!start&&typeof this.#persist?.deferredCount==='function')return await this.#persist.deferredCount();
  }catch{}
  if(start)this.#memDeferred+=1;return this.#memDeferred;
 }
 async #clearDeferred(){this.#memDeferred=0;try{await this.#persist?.clearDeferred?.();}catch{}}
 async resume({maxIdleSeconds=90*86400,reason='start'}={}){
  if(!this.#persist||this.#token)return false;
  return this.#guarded(async()=>{
   if(this.#token)return true;
   const start=reason==='start';
   const defer=async code=>{const count=await this.#countDeferred(start);this.#restore={state:'DEFERRED',code,count,relogin:count>=RESTORE_DEFER_LIMIT};return false;};
   const reject=async code=>{await this.#forgetQuiet();await this.#clearDeferred();this.#restore={state:'REJECTED',code,count:0,relogin:true};return false;};
   // Marker first, then load: a sign-out after this point makes the final save refuse; one before it leaves nothing to load. Unreadable marker: do not spend the saved token.
   if(!(await this.#captureMarker()))return defer('MARKER');
   let saved=null;try{saved=await this.#persist.load();}catch(error){if(error?.code==='AUTH_SIGNED_OUT_ELSEWHERE')return reject('SIGNED_OUT');return defer('RECORD_READ');}
   if(!saved){await this.#clearDeferred();this.#restore={state:'NO_RECORD',code:'NO_RECORD',count:0,relogin:true};return false;}
   const now=Math.floor(Date.now()/1000);
   if(saved.format!=='LB_AUTH_PERSIST_1'||typeof saved.sub!=='string'||typeof saved.refreshToken!=='string'||saved.refreshToken.length>4096||!Number.isSafeInteger(saved.savedAt))return defer('RECORD_UNUSABLE');
   if(saved.savedAt>now+300)return defer('CLOCK');
   if(now-saved.savedAt>maxIdleSeconds)return reject('IDLE_90D');
   try{
    const data=await this.#request('/token?grant_type=refresh_token',{refresh_token:saved.refreshToken});
    const parts=String(data.access_token).split('.');const claims=JSON.parse(new TextDecoder().decode(unb64(parts[1]??'',20000)));
    if(claims.sub!==saved.sub)return reject('OTHER_OWNER');
    if(claims.aal!=='aal2')return reject('AAL1');
    await this.#accept(data);await this.#clearDeferred();this.#restore={state:'OK',code:'OK',count:0,relogin:false};return true;
   }catch(e){
    this.clear();
    if(e?.definitive===true)return reject('REFUSED_'+e.status);
    if(e?.code==='AUTH_SIGNED_OUT_ELSEWHERE')return reject('SIGNED_OUT');
    const st=e?.status,name=String(e?.name??''),code=String(e?.code??'');
    // Anything that is not a definite rejection keeps the saved login (an unreadable error keeps it too).
    return defer(st===429?'RATE_LIMIT':Number.isSafeInteger(st)&&st>=500?'SERVER':Number.isSafeInteger(st)?'HTTP_'+st:/^AUTH_TOKEN|^AUTH_RESPONSE/.test(code)?'RESPONSE':name==='TimeoutError'||name==='AbortError'?'TIMEOUT':e instanceof TypeError?'NETWORK':'UNKNOWN');
   }
  });
 }
 async forgetSaved(){await this.#persist?.forget();}
 async requestEmailCode(email){check(typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'EMAIL');check(!this.#token,'AUTH_ALREADY_OPEN');await this.#request('/otp',{email,create_user:false});return {status:'EMAIL_CODE_REQUESTED'};}
 async verifyEmailCode(email,code){check(typeof email==='string'&&email.length<=254&&typeof code==='string'&&/^\d{6,10}$/.test(code),'EMAIL_CODE');await this.#accept(await this.#request('/verify',{email,token:code,type:'magiclink'}));return {status:'TOTP_REQUIRED',factors:await this.factors()};}
 async factors(){const user=await this.#request('/user',null,{method:'GET',authenticated:true});return (user.factors??[]).filter(f=>f.factor_type==='totp'&&f.status==='verified').map(f=>({id:f.id,friendlyName:f.friendly_name??'TOTP'}));}
 async enrollTotp(){check(this.#claims?.aal==='aal1','AUTH_ENROLL_LEVEL');check((await this.factors()).length===0,'TOTP_ALREADY_ENROLLED');const data=await this.#request('/factors',{factor_type:'totp',friendly_name:'LIFE BRICK V1.2 Synthetic Acceptance'},{authenticated:true});check(/^[a-f0-9-]{36}$/.test(data.id)&&typeof data.totp?.secret==='string'&&data.totp.secret.length>=16&&data.totp.secret.length<=256,'TOTP_ENROLL_RESPONSE');return {factorId:data.id,setupKey:data.totp.secret};}
 async verifyTotp(factorId,code){check(/^[a-f0-9-]{36}$/.test(factorId)&&/^\d{6}$/.test(code),'TOTP_PROFILE');const challenge=await this.#request(`/factors/${factorId}/challenge`,{},{authenticated:true});check(typeof challenge.id==='string','TOTP_CHALLENGE');{const data=await this.#request(`/factors/${factorId}/verify`,{challenge_id:challenge.id,code},{authenticated:true});await this.#captureMarker();await this.#accept(data);}check(this.#claims.aal==='aal2','AUTH_AAL2_REQUIRED');await this.#clearDeferred();this.#restore={state:'OK',code:'OK',count:0,relogin:false};return {status:'AUTHENTICATED_READ_ONLY',subject:this.#claims.sub};}
 async accessToken(){check(this.#claims?.aal==='aal2','AUTH_AAL2_REQUIRED');if(this.#claims.exp<=Math.floor(Date.now()/1000)+30){if(!this.#refreshing)this.#refreshing=this.#guarded(async()=>{await this.#adoptSaved();await this.#accept(await this.#request('/token?grant_type=refresh_token',{refresh_token:this.#refresh}));}).catch(e=>{this.clear();throw e;}).finally(()=>{this.#refreshing=null;});await this.#refreshing;}check(this.#claims?.aal==='aal2'&&this.#claims.exp>Math.floor(Date.now()/1000)+5,'AUTH_EXPIRED');return this.#token;}
 async requireRecentMfa(){await this.accessToken();const now=Math.floor(Date.now()/1000),latest=Math.max(-Infinity,...(this.#claims.amr??[]).filter(x=>x.method==='totp').map(x=>x.timestamp));check(Number.isSafeInteger(latest)&&latest<=now&&latest>=now-300,'RECENT_TOTP_REQUIRED');}
 get status(){return {state:this.#claims?.aal==='aal2'?'AUTHENTICATED_READ_ONLY':this.#token?'TOTP_REQUIRED':'LOCKED',subject:this.#claims?.sub??null};}
 clear(){this.#token=null;this.#refresh=null;this.#claims=null;}
 // Explicit local sign-out: drop the memory and forget the saved session (browser: deletes the whole auth IndexedDB incl. its key).
 // A failed forget is not swallowed: the caller must not tell the owner they are signed out.
 async signOut(){this.clear();this.#persistState='NONE';this.#memDeferred=0;this.#restore={state:'NOT_TRIED',code:'NOT_TRIED',count:0,relogin:false};if(typeof this.#persist?.signOut==='function')await this.#persist.signOut();else await this.#persist?.forget();}
 get persistStatus(){return this.#persistState;}
}
