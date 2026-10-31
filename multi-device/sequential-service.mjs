import {check,keys,copy,encode,payloadEncode,decode,sha,b64,unb64,randomId,idOK} from '../core/package/src/codec.mjs';
import {WriterContext,openEnvelope,verify} from '../core/package/src/crypto.mjs';
import {Roster} from '../core/package/src/enrollment.mjs';
import {normalizeCommand,today,savedResult,replay as replayLegacy} from '../user-app/action-model.mjs';
import {wholeLifeView,wholeHistory,calendarProjection} from '../user-app/whole-life-projection.mjs';
import {replayReal,candidateReal,replaySession} from './real-history.mjs';
import {PROFILE,SCOPE,LIMITS,initialHead,nextHead,same} from './contracts.mjs';
import {CLIENT,assertCompatible,operationRequirements,validateCompatibility,assertOperationCompatibility,serverCapabilities} from '../product/runtime-contract.mjs';
import {emptyLifecycle,validateLifecycleState,lifecycleWritable,validatePublication,publishTerminalState,settlementIntent,validateSettlementAttempt,prepareRetirement,validateRetirementReceipt} from './lifecycle-client.mjs';
const CERT=['scope','accountId','vaultId','genesisPin','deviceId','deviceKeyId','intentId','opId','wireSha256','expectedVersion','expectedHead','expectedRosterEpoch','expectedRosterHash','accessEpoch','leaseEpoch','runtimeSessionId','leaseTokenHash'];
export async function verifyPrefix(records,{keyring,roster,legacyCount,witness={version:0,head:initialHead(keyring)},allowPartialActivation=false,replay=replayReal}){
 check(Array.isArray(records)&&records.length<=LIMITS.operations,'MD_PREFIX_LIMIT');
 let head=initialHead(keyring);const operations=[],tips={},nonces=new Set(),intents=new Set();
 check(witness.version<=records.length,'MD_ROLLBACK_VERSION');if(witness.version===0)check(witness.head===head,'MD_ROLLBACK_HEAD');
 for(const [i,row]of records.entries()){
  keys(row,['version','intentId','opId','deviceId','wire','wireSha256','certificate','head']);
  keys(row.certificate,['body','signature']);const b=row.certificate.body;keys(b,[...CERT,...(Object.hasOwn(b,'compatibility')?['compatibility']:[])]);if(b.compatibility)validateCompatibility(b.compatibility);
  check(row.version===i+1&&b.expectedVersion===i&&b.expectedHead===head,'MD_PREFIX_CONTINUITY');
  check(b.scope===SCOPE&&b.accountId===keyring.accountId&&b.vaultId===keyring.vaultId&&b.genesisPin===keyring.genesisPin&&b.intentId===row.intentId&&b.opId===row.opId&&b.deviceId===row.deviceId&&!intents.has(row.intentId),'MD_CERTIFICATE_BINDING');
  for(const field of ['accessEpoch','leaseEpoch','expectedRosterEpoch'])check(Number.isSafeInteger(b[field])&&b[field]>=1,'MD_CERTIFICATE_EPOCH');
  check(idOK(b.runtimeSessionId)&&idOK(b.leaseTokenHash),'MD_CERTIFICATE_SESSION');
  const author=roster.author(b.expectedRosterEpoch,b.expectedRosterHash,b.deviceId,b.deviceKeyId);
  check(await verify(author.signingPublic,'LBOS/MD1/append',encode(b),row.certificate.signature),'MD_APPEND_SIGNATURE');
  const wire=unb64(row.wire,6_100_000);check(sha(wire)===row.wireSha256&&row.wireSha256===b.wireSha256,'MD_WIRE_HASH');
  const opened=await openEnvelope(wire,{keyring,roster,purpose:'op',objectId:row.opId}),h=opened.header,tip=tips[h.deviceId];
  check(h.deviceId===b.deviceId&&h.deviceKeyId===b.deviceKeyId&&h.rosterEpoch===String(b.expectedRosterEpoch)&&h.rosterHash===b.expectedRosterHash,'MD_HEADER_CERTIFICATE');
  check(Number(h.clientSequence)===(tip?.sequence??0)+1&&h.previousDeviceDigest===(tip?.digest??null),'MD_ENVELOPE_TIP');
  check(!nonces.has(opened.nonceDomain),'MD_NONCE_REUSE');nonces.add(opened.nonceDomain);
  const op=decode(opened.plaintext,{payload:true});check(op.opId===row.opId&&op.device===row.deviceId&&op.seq===Number(h.clientSequence)&&op.vault===keyring.vaultId&&op.mode==='REAL'&&op.provenance.requestId===row.intentId,'MD_DECRYPTED_BINDING');
  assertOperationCompatibility(op,b.compatibility);operations.push(op);tips[h.deviceId]={sequence:Number(h.clientSequence),digest:opened.digest};intents.add(row.intentId);
  head=nextHead(head,i+1,row.certificate);check(head===row.head,'MD_CHAIN_HEAD');if(witness.version===i+1)check(witness.head===head,'MD_ROLLBACK_HEAD');
 }
 let graph=null;
 if(operations.length>=legacyCount)graph=replay(operations,{vaultId:keyring.vaultId,roster,legacyCount});
 else check(allowPartialActivation,'MD_INCOMPLETE_LEGACY_PREFIX');
 return {operations,tips,verified:{version:records.length,head},graph};
}
const RESERVED={accepted:[],outbox:{},inbox:{},cursor:null,seenCursors:[],snapshotJobs:{}};
export function sequentialState(material,{legacyOperations=[],sourceCheckpoint=null,backup=null,rollbackFloor=null,recoveryArtifactSha256,primary=false}){
 check(idOK(recoveryArtifactSha256),'MD_RECOVERY_ARTIFACT_PIN');
 return {profile:SCOPE,legacyCount:primary?legacyOperations.length:material.legacyCount,verified:{version:0,head:initialHead(material.keyring)},rollbackFloor:rollbackFloor??{version:0,head:initialHead(material.keyring)},records:[],tips:{},pending:null,receipts:{},enrollment:null,recoveryArtifactSha256,activation:{id:randomId(),primary,status:primary?'LOCAL_BARRIER':'ENROLLED_AWAITING_PREFIX',sourceCheckpoint,backup,legacyCommitments:legacyOperations.map(op=>({opId:op.opId,payloadSha256:sha(payloadEncode(op))}))},access:{rosterEpoch:material.roster.epoch,rosterHash:material.roster.head,epoch:material.accessEpoch??1,status:primary?'INITIALIZING':'ACTIVE'}};
}
export async function validateSequentialState(state,material,{replay=replayReal}={}){
 keys(state,['format','accountId','vaultId','deviceId',...Object.keys(RESERVED),'pairingClaims','roster','userApp','sequentialSync']);
 check(state.format==='LBOS_LOCAL_STATE_1'&&state.accountId===material.keyring.accountId&&state.vaultId===material.keyring.vaultId&&state.deviceId===material.identity.public.deviceId,'MD_LOCAL_OWNER');
 for(const [k,v]of Object.entries(RESERVED))check(same(state[k],v),'MD_RESERVED_STATE');
 keys(state.userApp,['format','mode','vaultId','operations']);check(state.userApp.format===PROFILE&&state.userApp.mode==='REAL'&&state.userApp.vaultId===state.vaultId,'MD_LOCAL_PROFILE');
 const roster=await Roster.load(state.roster,material.keyring.genesisPin),s=state.sequentialSync;
 keys(s,['profile','legacyCount','verified','rollbackFloor','records','tips','pending','receipts','enrollment','recoveryArtifactSha256','activation','access',...(Object.hasOwn(s,'lifecycle')?['lifecycle']:[])]);
 await validateLifecycleState(state,material);
 check(s.profile===SCOPE&&Number.isSafeInteger(s.legacyCount)&&s.legacyCount>=1&&s.legacyCount<=10000,'MD_LOCAL_PROTOCOL');
 const parsed=await verifyPrefix(s.records,{keyring:material.keyring,roster,legacyCount:s.legacyCount,allowPartialActivation:s.activation.status!=='ACTIVE',replay});
 check(same(parsed.verified,s.verified)&&same(parsed.tips,s.tips),'MD_LOCAL_HEAD');
 let graph=null;
 if(s.activation.primary&&s.activation.status!=='ACTIVE'){
  check(state.userApp.operations.length===s.legacyCount,'MD_ACTIVATION_LEGACY_COUNT');replayLegacy(state.userApp.operations,{vaultId:state.vaultId,deviceId:roster.evidence.genesis.body.firstDevice.deviceId});
  check(state.userApp.operations.every((op,i)=>s.activation.legacyCommitments[i]?.opId===op.opId&&s.activation.legacyCommitments[i]?.payloadSha256===sha(payloadEncode(op)))&&parsed.operations.every((op,i)=>samePayload(op,state.userApp.operations[i])),'MD_LEGACY_BYTES');
  graph=replay(state.userApp.operations,{vaultId:state.vaultId,roster,legacyCount:s.legacyCount});
 }else{check(state.userApp.operations.length===parsed.operations.length&&parsed.operations.every((op,i)=>samePayload(op,state.userApp.operations[i])),'MD_ACCEPTED_PREFIX');graph=parsed.graph;}
 if(s.pending){
  const p=s.pending;keys(p,['status','intentId','op','wire','certificate','intentBodyHash','wireSha256']);check(['PREPARED_DURABLE','DISPATCHED_UNKNOWN'].includes(p.status),'MD_PENDING_STATUS');
  check(p.intentId===p.op.provenance.requestId&&p.intentBodyHash===sha(encode(p.certificate))&&sha(unb64(p.wire))===p.wireSha256,'MD_PENDING_BINDING');
  const b=p.certificate.body;check(b.intentId===p.intentId&&b.opId===p.op.opId&&b.expectedVersion===s.verified.version&&b.expectedHead===s.verified.head&&b.wireSha256===p.wireSha256,'MD_PENDING_HEAD');
  const member=roster.author(b.expectedRosterEpoch,b.expectedRosterHash,b.deviceId,b.deviceKeyId);check(await verify(member.signingPublic,'LBOS/MD1/append',encode(b),p.certificate.signature),'MD_PENDING_SIGNATURE');
  const o=await openEnvelope(unb64(p.wire),{keyring:material.keyring,roster,purpose:'op',objectId:p.op.opId});check(samePayload(decode(o.plaintext,{payload:true}),p.op),'MD_PENDING_PLAINTEXT');
  assertOperationCompatibility(p.op,b.compatibility);
  if(s.activation.status==='ACTIVE')replay([...state.userApp.operations,p.op],{vaultId:state.vaultId,roster,legacyCount:s.legacyCount});
 }
 return {graph,roster};
}
// Applies a verified remote prefix to a local state (sync only). Same inputs give the same result.
export function applySyncResult(local,{roster,records,result,state}){
 local.roster=roster.evidence;local.userApp.operations=result.operations;
 Object.assign(local.sequentialSync,{records,tips:result.tips,verified:result.verified,access:{rosterEpoch:roster.epoch,rosterHash:roster.head,epoch:state.accessEpoch,status:state.status},activation:{...local.sequentialSync.activation,status:'ACTIVE'}});
 return local;
}
export class SequentialService {
 #nativeGuard;#store;#material;#transport;#auth;#writer;#reuseReplay;#session;#lease=null;#runtime=randomId();#state='AUTHENTICATED_READ_ONLY';#tail=Promise.resolve();#timer=null;#blocked=false;#closed=false;#clock;#capabilities=null;
 // F12-2 진단용 단계 시간(ms): 열기(#sync)·저장(write) 각각 최근 3회. 동작·검사·오류·호출 순서는 바꾸지 않는다(try/finally로만 측정).
 #openTimings=[];#saveTimings=[];
 // 하나의 record(이름→ms)에 기록. 같은 이름이 여러 번 쓰이면(예: write 안에서 #publish가 여러 번) 더해서 합산한다. record가 없으면(다른 호출 경로) 버리는 임시 객체를 쓴다.
 async #timeStage(record,name,fn){const slot=record??{},t0=performance.now();try{return await fn();}finally{slot[name]=(slot[name]??0)+(performance.now()-t0);}}
 #pushTiming(list,record){list.push(record);if(list.length>3)list.shift();}
 constructor({store,material,transport,auth,nativeGuard=null,clock=()=>Date.now(),reuseReplay=true}){this.#reuseReplay=typeof reuseReplay==='function'?reuseReplay:reuseReplay===false?null:true;this.#session=replaySession();this.#nativeGuard=nativeGuard;check(!store.state.sequentialSync.activation.nativeBootstrap||nativeGuard,'MD_PRIMARY_GUARD_REQUIRED');this.#store=store;this.#material=material;this.#transport=transport;this.#auth=auth;this.#clock=clock;this.#writer=WriterContext.create(material.keyring,material.identity,'op');if(store.state.sequentialSync.pending)this.#state='DISPATCHED_UNKNOWN';}
 get phase(){return this.#state;}
 get pending(){return this.#store.state.sequentialSync.pending;}
 get material(){return this.#material;}
 get store(){return this.#store;}
 get runtimeSessionId(){return this.#runtime;}
 status(){return {state:'UNLOCKED',profile:PROFILE,runtimeContract:CLIENT,compatibility:this.#capabilities,syncState:this.#state,writeReady:this.#state==='WRITE_READY'&&!this.#blocked,pendingIntent:this.pending?.intentId??null};}
 #serial(fn){check(!this.#closed,'MD_CLOSED');const p=this.#tail.then(fn);this.#tail=p.catch(()=>{});return p;}
 #headArgs(){const s=this.#store.state.sequentialSync;return {expectedVersion:s.verified.version,expectedHead:s.verified.head,expectedRosterEpoch:s.access.rosterEpoch,expectedRosterHash:s.access.rosterHash,accessEpoch:s.access.epoch};}
 #leaseArgs(){check(this.#lease,'MD_NO_LEASE');return {runtimeSessionId:this.#runtime,leaseEpoch:this.#lease.epoch,leaseToken:this.#lease.token};}
 async #authenticated(){await this.#auth.accessToken();}
 async #publish(mutator,{replay}={}){try{await this.#store.transaction(mutator,replay?{replay}:undefined);this.#material.roster=this.#store.roster;}catch(error){this.#blocked=true;this.#state='LOCAL_PUBLICATION_HOLD';this.#session.clear();throw error;}}
 // PAGE_BYTES(한 페이지가 pageBytes 한도를 넘음)면 limit을 반으로 줄여 재시도한다. limit=1에서도 실패하면 멈춘다(무한루프 금지).
 async #pullPage(afterVersion,state){
  let limit=LIMITS.pageItems;
  for(;;){
   try{
    const page=await this.#transport.call('pullPrefix',{afterVersion,limit});
    check(page.state.version===state.version&&page.state.head===state.head&&page.state.rosterHash===state.rosterHash&&page.state.accessEpoch===state.accessEpoch,'MD_PREFIX_CHANGED');
    check(Array.isArray(page.items)&&page.items.length>0&&page.items.length<=limit,'MD_TRUNCATED_PREFIX');
    return page;
   }catch(e){if(e.code!=='PAGE_BYTES'||limit<=1)throw e;limit=Math.max(1,Math.floor(limit/2));}
  }
 }
 async #sync(){
  const record={};
  try{return await this.#timeStage(record,'sync',()=>this.#syncCore(record));}
  finally{this.#pushTiming(this.#openTimings,record);}
 }
 async #syncCore(record){
  await this.#authenticated();check(!this.pending&&!this.#store.state.sequentialSync.enrollment,'MD_PENDING_UNRESOLVED');this.#state='SYNCING';
  const state=await this.#transport.call('readState'),s=this.#store.state.sequentialSync;
  check(state.accountId===this.#material.keyring.accountId&&state.vaultId===this.#material.keyring.vaultId&&state.genesisPin===this.#material.keyring.genesisPin,'MD_REMOTE_NAMESPACE');
  this.#capabilities=assertCompatible(state.capabilities);
  const roster=await Roster.load(state.roster,this.#material.keyring.genesisPin);
  check(this.#material.roster.evidence.events.every((e,i)=>same(e,roster.evidence.events[i])),'MD_ROSTER_ROLLBACK');
  check(state.rosterEpoch===roster.epoch&&state.rosterHash===roster.head&&state.accessEpoch>=s.access.epoch,'MD_REMOTE_ACCESS');
  check(state.status==='ACTIVE'||state.status==='FROZEN','MD_INITIALIZING');check(s.verified.version<=state.version,'MD_ROLLBACK_VERSION');
  // F12 증분 수신: records=[]로 매번 처음부터 받지 않고 로컬에서 이미 검증한 접두사(s.records)에 새 꼬리만 이어 붙인다.
  // 전체(과거+새 꼬리)는 아래 verifyPrefix가 항상 처음부터 다시 검증한다 — 검증 범위는 줄지 않는다.
  const records=[...s.records];while(records.length<state.version){const page=await this.#pullPage(records.length,state);records.push(...page.items);check(records.length<=state.version,'MD_PREFIX_OVERRUN');}
  const witness=s.rollbackFloor.version>s.verified.version?s.rollbackFloor:s.verified;
  const result=await this.#timeStage(record,'verifyPrefix',()=>verifyPrefix(records,{...this.#material,roster,legacyCount:s.legacyCount,witness}));check(result.verified.head===state.head,'MD_REMOTE_HEAD');
  const oldOps=this.#store.state.userApp.operations;check(oldOps.every((op,i)=>samePayload(op,result.operations[i])),'MD_HISTORY_REWRITE');
  // No-op sync writes nothing: if the applied result has the same canonical payload bytes (payloadEncode hash) as the
  // current local state, no commit is appended. Rollback/prefix/roster/access checks above already ran; any change to
  // records, verified, tips, roster, access or activation changes the hash and is always published. While a previous
  // local publication failed (#blocked) the skip is disabled so the store fault surfaces.
  const apply=local=>applySyncResult(local,{roster,records,result,state}),next=copy(this.#store.state);apply(next);
  if(this.#blocked||!samePayload(next,this.#store.state))await this.#timeStage(record,'publish',()=>this.#publish(apply));
  this.#session.clear();this.#state='VERIFIED_READ_ONLY';this.#blocked=false;return {status:'VERIFIED_READ_ONLY',version:state.version,head:state.head};
 }
 sync(){return this.#serial(async()=>{try{await this.#release();const r=await this.#sync();await this.#afterVerifiedSync();return r;}catch(e){if(!this.#blocked)this.#state='READ_ONLY';throw e;}});}
 // F9: a store with a deferred layout migration (record format 4 compaction) runs it only right after a verified sync.
 // The store checks its own preconditions and never throws here; a failure after publication requires a reopen (HOLD).
 // A publication-time failure is reported as a failed sync (COMPACTION_HOLD_REOPEN) so callers do not treat the session as verified.
 async #afterVerifiedSync(){if(typeof this.#store.compactAfterSync!=='function')return;const m=await this.#store.compactAfterSync({synced:true,blocked:this.#blocked});if(m?.status==='COMPACTION_HOLD_REOPEN'){this.#blocked=true;this.#state='LOCAL_PUBLICATION_HOLD';check(false,'COMPACTION_HOLD_REOPEN');}}
 async #acquire(purpose='WRITE'){
  check(this.#store.state.sequentialSync.lifecycle?.restoreMode!==true,'B4_RESTORE_READ_ONLY_HOLD');
  check(!this.pending&&!this.#store.state.sequentialSync.enrollment&&!this.#blocked,'MD_PENDING_UNRESOLVED');await this.#authenticated();this.#state='ACQUIRING';
  const token=randomId(),head=this.#headArgs();const state=await this.#transport.call('acquireWriter',{...head,runtimeSessionId:this.#runtime,leaseToken:token,purpose,client:CLIENT});
  check(state.version===head.expectedVersion&&state.head===head.expectedHead&&state.rosterHash===head.expectedRosterHash&&state.accessEpoch===head.accessEpoch&&state.leaseRuntime===this.#runtime&&state.leaseDevice===this.#material.identity.public.deviceId,'MD_LEASE_STATE');
  this.#lease={token,epoch:state.leaseEpoch,deadline:this.#clock()+(state.leaseExpires-state.serverTime-LIMITS.safetySeconds)*1000,purpose};
  this.#state=purpose==='WRITE'?'WRITE_READY':'VERIFIED_READ_ONLY';clearInterval(this.#timer);this.#timer=setInterval(()=>{this.#serial(()=>this.#renew()).catch(()=>this.suspend());},LIMITS.renewSeconds*1000);this.#timer.unref?.();return this.status();
 }
 acquire(){return this.#serial(async()=>{check(this.#store.state.sequentialSync.lifecycle?.restoreMode!==true,'B4_RESTORE_READ_ONLY_HOLD');const record={};
  try{return await this.#timeStage(record,'acquire',async()=>{try{await this.#release();await this.#sync();return await this.#acquire();}catch(e){if(!this.#blocked)this.#state='READ_ONLY';throw e;}});}
  finally{this.#pushTiming(this.#saveTimings,record);}
 });}
 async #renew(){if(!this.#lease||this.#blocked)return;try{const s=await this.#transport.call('renewWriter',this.#leaseArgs());check(s.leaseEpoch===this.#lease.epoch&&s.leaseRuntime===this.#runtime,'MD_RENEW_FENCE');this.#lease.deadline=this.#clock()+(s.leaseExpires-s.serverTime-LIMITS.safetySeconds)*1000;}catch(e){this.suspend();throw e;}}
 suspend(){this.#blocked=true;clearInterval(this.#timer);if(!this.pending)this.#state='READ_ONLY';this.#session.clear();}
 async #release(){clearInterval(this.#timer);check(!this.pending&&!this.#store.state.sequentialSync.enrollment,'MD_PENDING_UNRESOLVED');if(this.#lease){const lease=this.#leaseArgs();this.#lease=null;this.#state='VERIFIED_READ_ONLY';await this.#transport.call('releaseWriter',lease);}this.#session.clear();return this.status();}
 release(){return this.#serial(()=>this.#release());}
 beginEnrollment(){return this.#serial(async()=>{lifecycleWritable(this.#store);await this.#auth.requireRecentMfa();const cap=await this.#transport.call('lifecycleCapabilities');check(cap.format==='LB_B4_CAPABILITIES_1'&&cap.version===1&&cap.storeFormat===3,'UPDATE_REQUIRED_LIFECYCLE');await this.#release();await this.#sync();return this.#acquire('ENROLL');});}
 async lifecycleCall(action,args={},mfa=false){check(action==='getEnrollmentSession'||action==='getLifecycleIntent'||action==='getLifecycleState'||action==='lifecycleCapabilities'||this.#store.state.sequentialSync.lifecycle?.restoreMode!==true,'B4_RESTORE_READ_ONLY_HOLD');await this.#authenticated();if(mfa)await this.#auth.requireRecentMfa();return this.#transport.call(action,args);}
 publishEnrollmentTerminal(response){return this.#serial(()=>this.#acceptEnrollmentTerminal(response));}
 async #acceptEnrollmentTerminal(response){
  const pending=this.#store.state.sequentialSync.enrollment;check(pending?.registration,'B4_SESSION_REQUIRED');this.suspend();
  await validatePublication(response,pending,this.#material,this.#store.state);
  try{await this.#publish(local=>publishTerminalState(local,response,pending));}catch(e){this.#state=response.status==='COMMITTED'?'REMOTE_COMMITTED_LOCAL_HOLD':'LOCAL_PUBLICATION_HOLD';throw e;}
  this.#lease=null;clearInterval(this.#timer);this.#blocked=false;this.#state='VERIFIED_READ_ONLY';return response;
 }
 resolveEnrollment({decision,reason}){return this.#serial(async()=>{
  lifecycleWritable(this.#store);const pending=this.#store.state.sequentialSync.enrollment;check(pending?.registration,'B4_SESSION_REQUIRED');await this.#auth.requireRecentMfa();
  let response;try{response=await this.#transport.call('getEnrollmentSession',{pairSessionId:pending.pairSessionId,member:this.#material.identity.public});}catch(e){if(e.code!=='B4_SESSION_MISSING')throw e;response=null;}
  if(response===null||response.status==='OPEN'){
   const archive=this.#store.state.sequentialSync.lifecycle.archives[pending.pairSessionId],checkpoint=this.#store.checkpoint;check(archive&&same(archive.registration,pending.registration),'B4_SETTLEMENT_ARCHIVE');
   if(response)check(response.terminal===null&&same(response.registration,pending.registration)&&(!response.descriptor||same(response.descriptor,pending.descriptor)),'B4_SETTLEMENT_LOOKUP_BINDING');
   let intent=pending.settlement;if(intent)await validateSettlementAttempt(intent,archive,this.#material);
   const now=Math.floor(this.#clock()/1000),expired=now>=pending.registration.body.expiresAt;
   const nextDecision=expired?'EXPIRE':decision??intent?.body.decision??'ABORT',nextReason=expired?'EXPIRED':reason??intent?.body.reason??'EPHEMERAL_LOST';
   check(['ABORT','EXPIRE'].includes(nextDecision)&&['USER_CANCEL','EXPIRED','EPHEMERAL_LOST','SPONSOR_UNAVAILABLE'].includes(nextReason),'B4_SETTLEMENT_INTENT');
   if(!intent||intent.body.expiresAt<=now||intent.body.decision!==nextDecision||intent.body.reason!==nextReason){
    // Prepare and archive in the same encrypted fenced CAS. A crash exposes the old pending
    // or the fully durable replacement; neither path resets the original registration.
    await this.#auth.requireRecentMfa();const old=intent;
    intent=await settlementIntent(this.#material,pending,{decision:nextDecision,reason:nextReason,candidateRoster:archive.candidateRoster,now});
    await this.#publish(local=>{check(same(this.#store.checkpoint,checkpoint)&&same(local.sequentialSync.enrollment,pending)&&same(local.sequentialSync.lifecycle.archives[pending.pairSessionId],archive),'B4_PENDING_CHANGED');const a=local.sequentialSync.lifecycle.archives[pending.pairSessionId];a.settlementAttempts??=[];if(old&&!a.settlementAttempts.some(x=>same(x,old)))a.settlementAttempts.push(copy(old));a.settlementAttempts.push(copy(intent));local.sequentialSync.enrollment.settlement=copy(intent);});
   }
   response=await this.#transport.call('resolveEnrollmentSession',{intent});
  }
  return response;
 });}
 retireDevice(selection){return this.#serial(async()=>{
  lifecycleWritable(this.#store);check(!this.pending&&!this.#store.state.sequentialSync.enrollment,'MD_PENDING_UNRESOLVED');await this.#auth.requireRecentMfa();await this.#release();
  await this.#sync();const remote=await this.#transport.call('getLifecycleState'),intent=await prepareRetirement(this.#material,remote,selection);
  await this.#publish(local=>{local.sequentialSync.lifecycle.retirements[intent.body.intentId]={intent,receipt:null};});this.suspend();
  const receipt=await this.#transport.call('retireDevice',{intent});return this.#publishRetirement(intent,receipt);
 });}
 reconcileRetirement(intentId){return this.#serial(async()=>{
  const row=this.#store.state.sequentialSync.lifecycle?.retirements[intentId];check(row,'B4_RETIRE_INTENT_REQUIRED');await this.#authenticated();
  let receipt=await this.#transport.call('getLifecycleIntent',{intentId,intentHash:sha(encode(row.intent))});
  if(receipt.status==='NOT_FOUND'){await this.#auth.requireRecentMfa();receipt=await this.#transport.call('retireDevice',{intent:row.intent});}return this.#publishRetirement(row.intent,receipt);
 });}
 async #publishRetirement(intent,receipt){
  const b=intent.body;validateRetirementReceipt(intent,receipt);
  await this.#publish(local=>{const row=local.sequentialSync.lifecycle.retirements[b.intentId];check(same(row.intent,intent)&&(!row.receipt||same(row.receipt,receipt)),'B4_RETIRE_COLLISION');row.receipt=receipt;local.sequentialSync.access.epoch=Math.max(local.sequentialSync.access.epoch,receipt.accessEpoch);});this.#lease=null;this.#state='VERIFIED_READ_ONLY';this.#blocked=false;return receipt;
 }
 enrollmentContext(){check(this.#lease?.purpose==='ENROLL'&&!this.pending&&!this.#blocked&&this.#clock()<this.#lease.deadline,'MD_ENROLLMENT_LEASE');return {...this.#headArgs(),...this.#leaseArgs()};}
 submitEnrollment(args){return this.#serial(async()=>{
  lifecycleWritable(this.#store);const pending=this.#store.state.sequentialSync.enrollment;
  check(pending?.approval&&same(pending.approval,args),'MD_ENROLLMENT_PENDING');await this.#authenticated();this.#state='PENDING_SERVER_ROSTER';
  let response;try{response=await this.#transport.call('getEnrollmentSession',{pairSessionId:pending.pairSessionId,member:this.#material.identity.public});}catch(e){if(e.code!=='B4_SESSION_MISSING')throw e;response=null;}
  if(response===null||response.status==='OPEN'){await this.#auth.requireRecentMfa();response=await this.#transport.call('enrollDevice',args);}
  return this.#acceptEnrollmentTerminal(response);
 });}

 #ready(){check(this.#store.state.sequentialSync.lifecycle?.restoreMode!==true,'B4_RESTORE_READ_ONLY_HOLD');check(this.#state==='WRITE_READY'&&!this.#blocked&&!this.pending&&!this.#store.state.sequentialSync.enrollment,'MD_NOT_WRITE_READY');check(this.#lease?.purpose==='WRITE'&&this.#clock()<this.#lease.deadline,'MD_LEASE_EXPIRED');}
 async #prepare(op,scope=null,record=null){
  const s=this.#store.state.sequentialSync,tip=s.tips[this.#material.identity.public.deviceId];
  const wire=await this.#writer.seal(payloadEncode(op),{objectId:op.opId,sequence:(tip?.sequence??0)+1,previousDigest:tip?.digest??null,roster:this.#material.roster});
  const body={scope:SCOPE,accountId:this.#material.keyring.accountId,vaultId:this.#material.keyring.vaultId,genesisPin:this.#material.keyring.genesisPin,deviceId:this.#material.identity.public.deviceId,deviceKeyId:this.#material.identity.public.keyId,intentId:op.provenance.requestId,opId:op.opId,wireSha256:sha(wire),...this.#headArgs(),leaseEpoch:this.#lease.epoch,runtimeSessionId:this.#runtime,leaseTokenHash:sha(Uint8Array.from(this.#lease.token.match(/../g),x=>parseInt(x,16)))};
  const required=operationRequirements(op);
  if(required.domainSchemaVersion===2||this.#capabilities?.minDomainWrite===2)body.compatibility={client:CLIENT,requiredDomainSchemaVersion:required.domainSchemaVersion,operationCapabilities:required.capabilities};
  const certificate={body,signature:await this.#material.identity.sign('LBOS/MD1/append',encode(body))};
  const p={status:'PREPARED_DURABLE',intentId:body.intentId,op,wire:b64(wire),certificate,intentBodyHash:sha(encode(certificate)),wireSha256:sha(wire)};
  await this.#timeStage(record,'publish',()=>this.#publish(local=>{check(local.sequentialSync.pending===null,'MD_PENDING_UNRESOLVED');local.sequentialSync.pending=p;},{replay:scope?.replay}));this.#state='PREPARED_DURABLE';return p;
 }
 async #materialize(p,receipt,scope=null,record=null){
  check(receipt.intentId===p.intentId&&receipt.bodyHash===p.intentBodyHash&&receipt.wireSha256===p.wireSha256&&['COMMITTED','ABORTED'].includes(receipt.status),'MD_RECEIPT_BINDING');
  if(receipt.status==='ABORTED'){await this.#timeStage(record,'publish',()=>this.#publish(local=>{check(same(local.sequentialSync.pending,p),'MD_PENDING_CHANGED');local.sequentialSync.receipts[p.intentId]=receipt;local.sequentialSync.pending=null;}));this.#state='VERIFIED_READ_ONLY';return {status:'ABORTED',requestId:p.intentId};}
  check(receipt.opId===p.op.opId&&receipt.version===p.certificate.body.expectedVersion+1&&receipt.head===nextHead(p.certificate.body.expectedHead,receipt.version,p.certificate),'MD_RECEIPT_HEAD');this.#state='REMOTE_COMMITTED';
  const row={version:receipt.version,intentId:p.intentId,opId:p.op.opId,deviceId:p.op.device,wire:p.wire,wireSha256:p.wireSha256,certificate:p.certificate,head:receipt.head};
  const records=[...this.#store.state.sequentialSync.records,row];const s=this.#store.state.sequentialSync;
  try{const result=await this.#timeStage(record,'verifyPrefix',()=>verifyPrefix(records,{...this.#material,legacyCount:s.legacyCount,witness:s.verified,allowPartialActivation:s.activation.status!=='ACTIVE',...(scope?{replay:scope.replay}:{})}));
  await this.#timeStage(record,'publish',()=>this.#publish(local=>{check(same(local.sequentialSync.pending,p),'MD_PENDING_CHANGED');Object.assign(local.sequentialSync,{records,tips:result.tips,verified:result.verified,pending:null});local.sequentialSync.receipts[p.intentId]=receipt;if(local.sequentialSync.activation.status==='ACTIVE')local.userApp.operations=result.operations;else check(result.operations.every((op,i)=>samePayload(op,local.userApp.operations[i])),'MD_ACTIVATION_REWRITE');},{replay:scope?.replay}));}
  catch(e){this.#state='REMOTE_COMMITTED_LOCAL_HOLD';this.#blocked=true;this.#session.clear();throw e;}
  if(p.certificate.body.compatibility?.requiredDomainSchemaVersion===2)this.#capabilities=serverCapabilities(2);
  this.#state='LOCAL_CONFIRMED';const resultUI={...savedResult(p.op),status:'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED',remoteVersion:receipt.version,remoteHead:receipt.head};
  this.#state=this.#lease?.purpose==='WRITE'&&!this.#blocked&&this.#clock()<this.#lease.deadline?'WRITE_READY':'VERIFIED_READ_ONLY';return resultUI;
 }
 async #dispatch(p,scope=null,record=null){
  await this.#authenticated();check(!this.#blocked&&this.#lease&&this.#clock()<this.#lease.deadline,'MD_DISPATCH_BLOCKED');
  await this.#timeStage(record,'publish',()=>this.#publish(local=>{check(same(local.sequentialSync.pending,p),'MD_PENDING_CHANGED');local.sequentialSync.pending.status='DISPATCHED_UNKNOWN';},{replay:scope?.replay}));p=this.pending;this.#state='DISPATCHED_UNKNOWN';
  let receipt;try{receipt=await this.#transport.call('appendIntent',{intentId:p.intentId,wire:p.wire,certificate:p.certificate,leaseToken:this.#lease.token});}catch(e){this.#state='DISPATCHED_UNKNOWN';throw e;}
  return this.#materialize(p,receipt,scope,record);
 }
 write(body,type){return this.#serial(async()=>{this.#ready();assertCompatible(this.#capabilities);await this.#authenticated();const normalized=normalizeCommand(body,type),old=this.#store.state.userApp.operations.find(op=>op.provenance.requestId===normalized.requestId);
  if(old){check(old.provenance.commandDigest===normalized.digest,'REQUEST_ID_BODY_COLLISION');const r=this.#store.state.sequentialSync.receipts[normalized.requestId];check(r?.status==='COMMITTED','MD_RECEIPT_REQUIRED');return {...savedResult(old),status:'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED',remoteVersion:r.version,remoteHead:r.head};}
  check(!this.#store.state.sequentialSync.receipts[normalized.requestId],'MD_TERMINAL_INTENT');
  // F10 M2-B/M2-D: reuseReplay true (default) uses the one session kept for this service instance's whole lifetime
  // (replay() calls across many saves share its cached replayers); a function keeps the old one-scope-per-save
  // behavior (tests check close()); false always does a full replay. Either way the session itself is cleared on
  // sync/release/suspend/a blocked transition/close/a write error -- never on an ordinary successful write.
  const scope=typeof this.#reuseReplay==='function'?this.#reuseReplay(this.#store.state.sequentialSync.verified.head):null;
  const replay=scope?scope.replay:this.#reuseReplay===true?this.#session.replay:undefined;
  const carrier=replay?{replay}:null;
  const record={};
  try{
  this.#session.pin(this.#store.graph);
  const op=candidateReal(this.#store.state.userApp.operations,{vaultId:this.#material.keyring.vaultId,deviceId:this.#material.identity.public.deviceId},normalized,{vaultId:this.#material.keyring.vaultId,roster:this.#material.roster,legacyCount:this.#store.state.sequentialSync.legacyCount},carrier??{}).op;
  const required=operationRequirements(op);check(required.domainSchemaVersion<=this.#capabilities.maxDomainWrite&&required.capabilities.every(c=>this.#capabilities.operationCapabilities.includes(c)),'UPDATE_REQUIRED_UNSUPPORTED_OPERATION');
  const p=await this.#timeStage(record,'prepare',()=>this.#prepare(op,carrier,record));return await this.#timeStage(record,'dispatch',()=>this.#dispatch(p,carrier,record));
  }catch(e){this.#session.clear();throw e;}
  finally{scope?.close();this.#pushTiming(this.#saveTimings,record);}
 });}
 reconcile(){return this.#serial(async()=>{await this.#authenticated();const p=this.pending;check(p,'MD_NO_PENDING');this.#state='DISPATCHED_UNKNOWN';const lookup={intentId:p.intentId,intentBodyHash:p.intentBodyHash,wireSha256:p.wireSha256};let receipt=await this.#transport.call('getIntent',lookup);if(receipt.status==='NOT_FOUND')receipt=await this.#transport.call('settleIntent',lookup);return this.#materialize(p,receipt);});}
 freezeLostDevice({freezeId,lostDeviceId,confirmed}){return this.#serial(async()=>{check(this.#store.state.sequentialSync.lifecycle?.restoreMode!==true,'B4_RESTORE_READ_ONLY_HOLD');check(confirmed===true&&idOK(freezeId)&&idOK(lostDeviceId),'MD_EXPLICIT_FREEZE');await this.#auth.requireRecentMfa();this.suspend();const receipt=await this.#transport.call('freezeLostDevice',{freezeId,lostDeviceId});check(receipt.status==='FROZEN'&&receipt.freezeId===freezeId&&receipt.lostDeviceId===lostDeviceId,'MD_FREEZE_RECEIPT');await this.#publish(local=>{local.sequentialSync.receipts[freezeId]=receipt;local.sequentialSync.access.epoch=receipt.accessEpoch;local.sequentialSync.access.status='FROZEN';});this.#lease=null;this.#state='READ_ONLY';return receipt;});}
 async #activateNative(){
  const initial=this.#store.state.sequentialSync,n=initial.activation.nativeBootstrap;
  check(this.#nativeGuard&&initial.activation.primary&&initial.legacyCount===1,'MD_PRIMARY_GUARD_REQUIRED');
  const terminal=()=>{check(this.#store.state.sequentialSync.receipts[n.requestId]?.status!=='ABORTED','MD_PRIMARY_ABORTED_TERMINAL_HOLD');};
  terminal();await this.#nativeGuard.validate();await this.#authenticated();check(!this.#blocked,'MD_PRIMARY_HOLD');
  if(initial.activation.status==='ACTIVE'){this.#lease=null;clearInterval(this.#timer);this.#state='VERIFIED_READ_ONLY';return this.status();}
  if(this.pending){
   const p=this.pending;check(p.intentId===n.requestId,'MD_PRIMARY_PENDING_BINDING');
   const lookup={intentId:p.intentId,intentBodyHash:p.intentBodyHash,wireSha256:p.wireSha256};let receipt=await this.#transport.call('getIntent',lookup);
   if(receipt.status==='NOT_FOUND')receipt=await this.#transport.call('settleIntent',lookup);
   await this.#materialize(p,receipt);await this.#nativeGuard.observed(receipt.status==='ABORTED'?'ABORTED_TERMINAL_HOLD':'INITIALIZE_CONFIRMED');terminal();
  }
  let s=this.#store.state.sequentialSync;
  // An ambiguous bootstrap response leaves LOCAL_BARRIER. The accepted bootstrap RPC permits only
  // exact same activation/namespace/version-zero re-entry, never a new lineage.
  let remote;
  if(s.activation.status==='LOCAL_BARRIER'){await this.#auth.requireRecentMfa();await this.#nativeGuard.beforeBootstrap();remote=await this.#transport.call('bootstrapOwner',{roster:this.#material.roster.evidence,genesisPin:this.#material.keyring.genesisPin,activationId:s.activation.id,legacyCount:1});await this.#nativeGuard.observed('bootstrapResponse');}
  else remote=await this.#transport.call('readState');
  const verify=remote=>{check(remote.accountId===n.accountId&&remote.vaultId===n.vaultId&&remote.genesisPin===n.genesisPin&&remote.legacyCount===1&&same(remote.roster,this.#material.roster.evidence)&&remote.rosterEpoch===this.#material.roster.epoch&&remote.rosterHash===this.#material.roster.head&&remote.accessEpoch>=s.access.epoch,'MD_PRIMARY_REMOTE_BINDING');check(remote.version===s.verified.version&&remote.head===s.verified.head,'MD_ACTIVATION_REMOTE_MISMATCH');};verify(remote);
  this.#capabilities=assertCompatible(remote.capabilities);
  if(remote.status==='ACTIVE'){
   check(remote.version===1&&s.receipts[n.requestId]?.status==='COMMITTED','MD_ACTIVATION_COUNT');this.#lease=null;clearInterval(this.#timer);
   await this.#publish(local=>{local.sequentialSync.activation.status='ACTIVE';local.sequentialSync.access={rosterEpoch:remote.rosterEpoch,rosterHash:remote.rosterHash,epoch:remote.accessEpoch,status:'ACTIVE'};});await this.#nativeGuard.observed('finalPublished');this.#state='VERIFIED_READ_ONLY';return this.status();
  }
  check(remote.status==='INITIALIZING','MD_PRIMARY_REMOTE_STATE');
  await this.#publish(local=>{local.sequentialSync.activation.status='INITIALIZING';local.sequentialSync.access={rosterEpoch:remote.rosterEpoch,rosterHash:remote.rosterHash,epoch:remote.accessEpoch,status:remote.status};});
  await this.#acquire('BOOTSTRAP');
  if(this.#store.state.sequentialSync.verified.version===0){
   terminal();await this.#nativeGuard.beforePrepare();const op=this.#store.state.userApp.operations[0],p=await this.#prepare(op);await this.#nativeGuard.observed('INITIALIZE_PENDING');
   const result=await this.#dispatch(p);await this.#nativeGuard.observed(result.status==='ABORTED'?'ABORTED_TERMINAL_HOLD':'INITIALIZE_CONFIRMED');terminal();
   check(result.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'&&this.#store.state.sequentialSync.verified.version===1,'MD_PRIMARY_COMMIT_REQUIRED');
  }
  terminal();check(this.#store.state.sequentialSync.receipts[n.requestId]?.status==='COMMITTED','MD_PRIMARY_COMMIT_REQUIRED');await this.#nativeGuard.validate();
  const active=await this.#transport.call('finishActivation',{...this.#headArgs(),...this.#leaseArgs(),activationId:s.activation.id});check(active.status==='ACTIVE','MD_ACTIVATION_INCOMPLETE');await this.#nativeGuard.observed('finishResponse');this.#lease=null;clearInterval(this.#timer);
  await this.#publish(local=>{local.sequentialSync.activation.status='ACTIVE';local.sequentialSync.access.status='ACTIVE';});await this.#nativeGuard.observed('finalPublished');this.#state='VERIFIED_READ_ONLY';return this.status();
 }
 activatePrimary(){return this.#serial(async()=>{
  if(this.#store.state.sequentialSync.activation.nativeBootstrap)return this.#activateNative();
  check(this.#store.state.sequentialSync.lifecycle?.restoreMode!==true,'B4_RESTORE_READ_ONLY_HOLD');await this.#authenticated();check(!this.pending&&!this.#blocked,'MD_PENDING_UNRESOLVED');const s=this.#store.state.sequentialSync;
  check(s.activation.status!=='ACTIVE'&&s.activation.primary===true&&s.activation.backup,'MD_ACTIVATION_BARRIER_REQUIRED');
  const remote=s.activation.status==='INITIALIZING'?await this.#transport.call('readState'):await this.#transport.call('bootstrapOwner',{roster:this.#material.roster.evidence,genesisPin:this.#material.keyring.genesisPin,activationId:s.activation.id,legacyCount:s.legacyCount});
  check(remote.version===s.verified.version&&remote.head===s.verified.head,'MD_ACTIVATION_REMOTE_MISMATCH');
  if(remote.status==='ACTIVE'){check(remote.version===s.legacyCount,'MD_ACTIVATION_COUNT');await this.#publish(local=>{local.sequentialSync.activation.status='ACTIVE';local.sequentialSync.access={rosterEpoch:remote.rosterEpoch,rosterHash:remote.rosterHash,epoch:remote.accessEpoch,status:remote.status};});this.#state='VERIFIED_READ_ONLY';return this.status();}
  await this.#publish(local=>{local.sequentialSync.activation.status='INITIALIZING';local.sequentialSync.access={rosterEpoch:remote.rosterEpoch,rosterHash:remote.rosterHash,epoch:remote.accessEpoch,status:remote.status};});
  await this.#acquire('BOOTSTRAP');
  for(let i=this.#store.state.sequentialSync.verified.version;i<s.legacyCount;i++){const p=await this.#prepare(this.#store.state.userApp.operations[i]);await this.#dispatch(p);}
  const active=await this.#transport.call('finishActivation',{...this.#headArgs(),...this.#leaseArgs(),activationId:s.activation.id});check(active.status==='ACTIVE','MD_ACTIVATION_INCOMPLETE');this.#lease=null;clearInterval(this.#timer);
  await this.#publish(local=>{local.sequentialSync.activation.status='ACTIVE';local.sequentialSync.access.status='ACTIVE';});this.#state='VERIFIED_READ_ONLY';return this.status();
 });}
 command(requestId){if(['LOCAL_PUBLICATION_HOLD','REMOTE_COMMITTED_LOCAL_HOLD'].includes(this.#state))return {status:this.#state,requestId};const p=this.pending;if(p?.intentId===requestId)return {status:this.#state,requestId};const receipt=this.#store.state.sequentialSync.receipts[requestId];if(receipt?.status==='ABORTED')return {status:'ABORTED',requestId};const op=this.#store.state.userApp.operations.find(x=>x.provenance.requestId===requestId);if(receipt?.status==='COMMITTED'&&op)return {...savedResult(op),status:'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED',remoteVersion:receipt.version,remoteHead:receipt.head};return {status:'NOT_ESTABLISHED',requestId};}
 today(){return today(this.#store.graph);}
 history(){return {changes:wholeHistory(this.#store.graph,this.#store.state.userApp.operations)};}
 view(){return {...wholeLifeView(this.#store.graph,undefined,this.#store.state.userApp.operations),settings:{storage:this.#store.storageKind,session:this.#state,profile:PROFILE,writeReady:this.status().writeReady,remoteCheckpoint:this.#store.state.sequentialSync.verified,localState:this.#store.localState??null,backup:this.#store.backupLocation??'SYNC_PRIMARY_WINDOWS_THEN_COLD_BACKUP',dataRoot:this.#store.location??'CURRENT_HTTPS_ORIGIN_INDEXEDDB',timings:this.timings()}};}
 // F12-2 진단용: 단계 이름→ms 숫자만(시간 숫자와 이름 외에는 아무것도 담지 않음). 내부 배열을 그대로 내보내지 않고 얕은 복제.
 timings(){return {open:this.#openTimings.map(r=>({...r})),save:this.#saveTimings.map(r=>({...r}))};}
 calendar(body){return calendarProjection(this.#store.graph,body);}
 evidence(){return {state:this.#store.state,checkpoint:this.#store.checkpoint,graphDigest:this.#store.graph?.digest()??null,phase:this.#state};}
 async close(){if(this.#closed)return {status:'CLOSED_ALREADY_CHECK_PRIOR_RESULT'};await this.#tail;clearInterval(this.#timer);let code=['LOCAL_PUBLICATION_HOLD','REMOTE_COMMITTED_LOCAL_HOLD'].includes(this.#state)?this.#state:null;try{if(!this.pending&&!this.#store.state.sequentialSync.enrollment)await this.#release();else code??='MD_PENDING_PRESERVED';}catch{code??='MD_LEASE_RELEASE_UNCONFIRMED';}this.#session.clear();this.#closed=true;this.#writer.close();await this.#store.close();this.#auth.clear?.();this.#material=null;return {status:code?'HOLD':'CLOSED',code};}
}
export function samePayload(a,b){return a!==undefined&&b!==undefined&&sha(payloadEncode(a))===sha(payloadEncode(b));}
