import {encode,payloadEncode,decode,sha,b64,unb64,randomId,copy} from '../../core/package/src/codec.mjs';
import {DeviceIdentity,WriterContext,openEnvelope} from '../../core/package/src/crypto.mjs';
import {Roster,PairingSession,makePairingRequest,acceptPairingResponse} from '../../core/package/src/enrollment.mjs';
import {openLocalCapsule,sealLocalCapsule,openRecoveryPackage,sealRecoveryPackage} from '../../core/package/src/recovery.mjs';
import {canonical} from '../../core/package/parent/v2_phase2/source/canonical.mjs';
import {replayReal} from '../real-history.mjs';
import {wholeHistory,wholeLifeView} from '../../user-app/whole-life-projection.mjs';
const check=(v,c)=>{if(!v)throw new Error(c);};
export function refusals(){
 const attempt=f=>{try{f();return 'UNEXPECTED_ACCEPT';}catch(e){return e.code||e.name;}};
 return [
 attempt(()=>decode(new TextEncoder().encode('{"a":1,"a":1}'))),
 attempt(()=>decode(new Uint8Array([255]))),
 attempt(()=>encode({a:'\ud800'})),
 attempt(()=>unb64('A')),
 attempt(()=>unb64('*')),
 attempt(()=>decode(new TextEncoder().encode('{"a": 1}')))
 ];
}
export function codecVectors(){
 const values=[null,true,{a:0,z:-0},['생애 기록','e\u0301','😀'],{b:[1,1e-7,1e20],a:'abc'}];
 return {public:values.map(v=>b64(encode(v))),payload:values.map(v=>b64(payloadEncode(v))),hash:values.map(v=>sha(payloadEncode(v))),refusals:refusals()};
}
export async function modelVectors(f){
 const roster=await Roster.load(f.roster,f.keyring.genesisPin);
 const graph=replayReal(f.operations,{vaultId:f.keyring.vaultId,roster,legacyCount:f.legacyCount});
 const before=graph.digest();
 const tampered=copy(f.operations);tampered.at(-1).seq+=1;let badSequence=false;
 try{replayReal(tampered,{vaultId:f.keyring.vaultId,roster,legacyCount:f.legacyCount});}catch{badSequence=true;}
 check(badSequence&&graph.digest()===before,'P06_REFUSAL_MUTATION');
 return {ops:graph.operations(),frontier:graph.frontier(),revisions:graph.revisions(),digest:graph.digest(),
 history:wholeHistory(graph,f.operations),view:wholeLifeView(graph,f.referenceDate,f.operations),badSequence};
}
export async function cryptoVectors(f){
 const identity=await DeviceIdentity.fromCapsule(f.identity);
 const roster=await Roster.load(f.roster,f.keyring.genesisPin);
 const opened=await openEnvelope(unb64(f.nodeWire),{keyring:f.keyring,roster,purpose:'op',objectId:f.operation.opId});
 check(canonical(decode(opened.plaintext,{payload:true}))===canonical(f.operation),'P03_NODE_TO_BROWSER');
 const bad=decode(unb64(f.nodeWire));bad.ciphertext=b64(new Uint8Array(unb64(bad.ciphertext).length));let tamper=false,aad=false;
 try{await openEnvelope(encode(bad),{keyring:f.keyring,roster,purpose:'op'});}catch{tamper=true;}
 try{await openEnvelope(unb64(f.nodeWire),{keyring:f.keyring,roster,purpose:'snapshot'});}catch{aad=true;}
 const writer=WriterContext.create(f.keyring,identity,'op',{maxRecords:2,maxBytes:100000});
 let aborted=false;try{await writer.seal(payloadEncode(f.operation),{objectId:f.operation.opId,sequence:1,roster},{aborted:true});}catch(e){aborted=e.code==='ENCRYPT_ABORTED';}
 const wire=await writer.seal(payloadEncode(f.operation),{objectId:f.operation.opId,sequence:1,roster});
 let retired=false;try{await writer.seal(payloadEncode(f.operation),{objectId:f.operation.opId,sequence:1,roster});}catch(e){retired=e.code==='CONTEXT_RETIRED';}
 const counter=decode(wire).header.nonce;writer.close();
 check(tamper&&aad&&aborted&&retired&&unb64(counter).at(-1)===1,'P03_REFUSAL_NONCE');
 const material=await openLocalCapsule(unb64(f.capsule),f.unlockSecret);
 check(material.identity.public.keyId===identity.public.keyId,'P04_CAPSULE_BINDING');
 let wrongSecret=false,wrongScope=false;
 try{await openLocalCapsule(unb64(f.capsule),f.unlockSecret+'wrong');}catch(e){wrongSecret=e.code==='UNLOCK_FAILED';}
 try{await openRecoveryPackage(unb64(f.capsule),f.recoverySecret);}catch(e){wrongScope=e.code==='WRAP_PROFILE';}
 const recovery=await openRecoveryPackage(unb64(f.recoveryWire),f.recoverySecret);
 check(recovery.dataKeyring.genesisPin===f.keyring.genesisPin&&wrongSecret&&wrongScope,'P04_RECOVERY_WRAP');
 return {browserWire:b64(wire),browserCapsule:b64(await sealLocalCapsule(material,f.unlockSecret)),
 browserRecovery:b64(await sealRecoveryPackage(recovery,f.recoverySecret)),checks:{tamper,aad,aborted,retired,nonceCounter:1,wrongSecret,wrongScope}};
}
export async function acceptNodePair(f){
 const device=await DeviceIdentity.fromCapsule(f.pair.device);
 const accepted=await acceptPairingResponse(f.pair.q,device,unb64(f.pair.request),unb64(f.pair.response),f.pair.now);
 let wrongPin=false;try{await acceptPairingResponse({...f.pair.q,genesisPin:'f'.repeat(64)},device,unb64(f.pair.request),unb64(f.pair.response),f.pair.now);}catch{wrongPin=true;}
 check(wrongPin&&accepted.keyring.genesisPin===f.keyring.genesisPin,'P04_PAIR_ACCEPT');
 return {device:accepted.identity.public,keyringPin:accepted.keyring.genesisPin,wrongPin};
}
export async function browserPair(f,nodeRequest){
 const identity=await DeviceIdentity.fromCapsule(f.identity),roster=await Roster.load(f.roster,f.keyring.genesisPin);
 let claimed=null;const ledger={async reservePair(id,digest){check(claimed===null,'PAIR_ALREADY_CLAIMED');claimed={id,digest};},async completePair(id,digest){check(claimed.id===id&&claimed.digest===digest,'PAIR_CLAIM');}};
 const auth={accountId:f.keyring.accountId,recentMfa:true};
 const session=await PairingSession.create({identity,keyring:f.keyring,roster,ledger,auth});
 const q=session.qr,req=await nodeRequest(q),wire=unb64(req.wire);
 const inspect=await session.inspect(wire);
 const response=await session.approve(wire,{confirmed:true,fingerprint:inspect.fingerprint,auth});
 const duplicate=await session.approve(wire,{confirmed:true,fingerprint:inspect.fingerprint,auth});
 check(sha(response)===sha(duplicate),'P04_PAIR_REPLAY');
 session.close();return {q,request:req.wire,response:b64(response),member:inspect.member};
}
