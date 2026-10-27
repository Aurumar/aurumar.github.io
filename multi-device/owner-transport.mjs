import {check,encode,decode,sha} from '../core/package/src/codec.mjs';
import {SCOPE} from './contracts.mjs';
export class OwnerTransport {
 #endpoint;#auth;#identity;#binding;#fetch;
 constructor({endpoint,auth,identity,accountId,vaultId,fetchImpl=(...args)=>globalThis.fetch(...args),syntheticLoopback=false}){
  const u=new URL(endpoint);check(!u.username&&!u.password&&!u.hash&&!u.search&&(u.protocol==='https:'||(syntheticLoopback&&u.protocol==='http:'&&u.hostname==='127.0.0.1')),'FIXED_OWNER_ENDPOINT');
  this.#endpoint=u.href;this.#auth=auth;this.#identity=identity;this.#binding={scope:SCOPE,accountId,vaultId,deviceId:identity.public.deviceId,deviceKeyId:identity.public.keyId};this.#fetch=fetchImpl;
 }
 async #post(body){const token=await this.#auth.accessToken();check(typeof token==='string'&&token.length>0,'AUTH_REQUIRED');const response=await this.#fetch(this.#endpoint,{method:'POST',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:encode(body),signal:AbortSignal.timeout(20000)});const bytes=new Uint8Array(await response.arrayBuffer());check(bytes.length<=9_000_000,'RESPONSE_LIMIT');const result=decode(bytes,{max:9_000_000});check(response.ok,result.error??'OWNER_HTTP');return result;}
 async call(action,args={}){
  const challenge=await this.#post({...this.#binding,type:'CHALLENGE',action,bodyHash:sha(encode(args))});
  const request={...this.#binding,action,challengeId:challenge.challengeId,args};
  return this.#post({...request,signature:await this.#identity.sign('LBOS/MD1/transport',encode(request))});
 }
 relay(action,args={}){check(['relayProbe','relayRegister','relaySend','relayFetch','relayConsume','relayStatus','relayTerminal'].includes(action),'RELAY_ACTION');return this.call(action,args);}
}
