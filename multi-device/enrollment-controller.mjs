import {check,copy,keys,encode,decode,frame,sha,b64,unb64,randomId,fingerprint,idOK} from '../core/package/src/codec.mjs';
import {PairingSession,makePairingRequest,acceptPairingResponse,Roster,recoveryCertificate,dataKeyring} from '../core/package/src/enrollment.mjs';
import {DeviceIdentity,hpkeSeal,verify} from '../core/package/src/crypto.mjs';
import {SCOPE,same} from './contracts.mjs';
const checkpointInfo=(q,requestDigest,member)=>frame('LBOS/MD1/pair-checkpoint',fingerprint(q),requestDigest,fingerprint(member));
const proofOf=async(a,accountId,vaultId)=>({scope:SCOPE,accountId,vaultId,pairSessionId:a.pairSessionId,eventHash:fingerprint(a.event),responseHash:a.responseHash,checkpointHash:a.checkpointHash,expiresAt:a.expiresAt,accessMode:a.accessMode});
import {lifecycleContract,lifecycleWritable} from './lifecycle-client.mjs';
import {sealPendingRecipient,openPendingRecipient} from './pending-recipient-wrap.mjs';
export class EnrollmentController {
 #service;#session=null;#context=null;#relay=null;#relayCapability=null;#requestText=null;#candidate=null;
 constructor(service,relay=null){this.#service=service;this.#relay=relay;}
 async begin({confirmed}){
  const {material,store}=this.#service;lifecycleWritable(store);check(confirmed===true&&!this.#session&&!store.state.sequentialSync.enrollment,'EXPLICIT_PAIR_APPROVAL');
  await this.#service.beginEnrollment();this.#context=this.#service.enrollmentContext();
  this.#candidate=await Roster.load(material.roster.evidence,material.keyring.genesisPin);
  const ledger={
   reservePair:async(id,digest)=>store.transaction(state=>{const pending=state.sequentialSync.enrollment;check(pending?.pairSessionId===id&&!Object.hasOwn(state.pairingClaims,id),'PAIRING_ALREADY_CONSUMED');state.pairingClaims[id]={digest,status:'CLAIMED',response:null};pending.requestDigest=digest;pending.phase='CLAIMED';}),
   completePair:async(id,digest,response,rosterEvidence)=>store.transaction(state=>{
    const p=state.pairingClaims[id],pending=state.sequentialSync.enrollment;check(p?.digest===digest&&p.status==='CLAIMED'&&pending?.pairSessionId===id,'PAIRING_CLAIM');
    check(rosterEvidence.events.at(-1)?.body.previous===fingerprint(state.roster.events.at(-1)||state.roster.genesis),'PAIRING_DURABLE_ROSTER_CAS');
    p.status='COMPLETE';p.response=b64(response);const archive=state.sequentialSync.lifecycle.archives[id];check(!archive.candidateRoster,'B4_CANDIDATE_COLLISION');archive.candidateRoster=copy(rosterEvidence);archive.response=b64(response);pending.phase='CANDIDATE_SIGNED';
   })
  };
  this.#session=await PairingSession.create({...material,roster:this.#candidate,ledger,auth:{accountId:material.keyring.accountId,recentMfa:true}});
  const q=this.#session.qr,c=this.#context,predecessor=copy(material.roster.evidence);this.#relayCapability=this.#relay?randomId():null;
  const body={format:lifecycleContract.FORMAT,protocolVersion:1,accountId:material.keyring.accountId,vaultId:material.keyring.vaultId,genesisPin:material.keyring.genesisPin,pairSessionId:q.sessionId,sponsor:material.identity.public,predecessor:{version:c.expectedVersion,head:c.expectedHead,rosterEpoch:c.expectedRosterEpoch,rosterHash:c.expectedRosterHash,accessEpoch:c.accessEpoch,rollbackWitnessHash:fingerprint(store.state.sequentialSync.rollbackFloor)},lease:{deviceId:material.identity.public.deviceId,runtimeSessionId:c.runtimeSessionId,leaseEpoch:c.leaseEpoch,leaseTokenHash:sha(Uint8Array.from(c.leaseToken.match(/../g),x=>parseInt(x,16))),purpose:'ENROLL'},expiresAt:Math.floor(q.expires/1000),mode:this.#relay?'RELAY':'MANUAL',capabilityHash:this.#relay?sha(this.#relayCapability):null};
  const registration={body,signature:await material.identity.sign('LBOS/B4/enrollment-session',encode(body))};
  await store.transaction(state=>{check(!state.sequentialSync.enrollment,'B4_SECOND_SESSION_HOLD');state.sequentialSync.enrollment={status:'B4_SESSION_PENDING',phase:'REGISTERING',pairSessionId:q.sessionId,registration,requestDigest:null,approval:null,relay:!!this.#relay,qr:copy(q),relayCapability:this.#relayCapability,exposed:false};state.sequentialSync.lifecycle.archives[q.sessionId]={registration:copy(registration),predecessor};});
  const registered=await this.#service.lifecycleCall('registerEnrollmentSession',{registration},true);check(registered.status==='OPEN'&&same(registered.registration,registration),'B4_REGISTRATION_RECEIPT');
  if(this.#relay)await this.#relay.relay('relayRegister',{pairSessionId:q.sessionId,expiresAt:body.expiresAt,capabilityHash:body.capabilityHash,expectedVersion:c.expectedVersion,expectedHead:c.expectedHead,expectedRosterEpoch:c.expectedRosterEpoch,expectedRosterHash:c.expectedRosterHash,accessEpoch:c.accessEpoch});
  await store.transaction(state=>{check(same(state.sequentialSync.enrollment.registration,registration),'B4_PENDING_CHANGED');state.sequentialSync.enrollment.phase='REGISTERED';state.sequentialSync.enrollment.exposed=true;});
  return {status:'PAIRING_TEXT_LOCAL_ONLY',pairingText:JSON.stringify(this.#relay?{...q,relayCapability:this.#relayCapability}:q),expiresAt:q.expires};
 }
 async pollRequest(){
  check(this.#session&&this.#relay,'RELAY_PAIRING_REQUIRED');const q=this.#session.qr,r=await this.#relay.relay('relayFetch',{pairSessionId:q.sessionId,slot:'REQUEST',member:this.#service.material.identity.public,capability:null});
  check(r.status==='RELAY_DELIVERED'&&r.slot==='REQUEST'&&r.recipientDeviceId===this.#service.material.identity.public.deviceId&&sha(r.payload)===r.contentHash,'RELAY_REQUEST_BINDING');
  const inspected=await this.#session.inspect(unb64(r.payload,131072));check(r.senderDeviceId===inspected.member.deviceId,'RELAY_REQUEST_MEMBER');this.#requestText=r.payload;
  await this.#service.store.transaction(state=>{state.sequentialSync.enrollment.requestText=r.payload;});
  await this.#relay.relay('relayConsume',{pairSessionId:q.sessionId,slot:'REQUEST',contentHash:r.contentHash,member:this.#service.material.identity.public,capability:null});
  return {status:'REQUEST_VERIFIED',fingerprint:inspected.fingerprint,recipientDeviceId:inspected.member.deviceId,requestDigest:inspected.requestDigest,expiresAt:q.expires};
 }
 async inspect(requestText){check(this.#session,'PAIRING_REQUIRED');return this.#session.inspect(unb64(requestText,1_000_000));}
 async approve({requestText,confirmed,fingerprint:compared}){
  check(this.#session&&confirmed===true,'EXPLICIT_PAIR_APPROVAL');if(this.#relay){check(this.#requestText&&(!requestText||requestText===this.#requestText),'RELAY_REQUEST_REQUIRED');requestText=this.#requestText;}
  const requestWire=unb64(requestText,1_000_000),q=this.#session.qr,inspected=await this.#session.inspect(requestWire);check(inspected.fingerprint===compared,'PAIRING_COMPARISON');
  const existing=this.#service.store.state.sequentialSync.enrollment;
  if(existing?.draft){check(existing.requestDigest===sha(requestWire)&&fingerprint(existing.descriptor.body.recipient)===compared,'B4_CANDIDATE_COLLISION');await this.#service.lifecycleCall('bindEnrollmentCandidate',{descriptor:existing.descriptor},true);if(this.#relay)await this.publishDraft();return copy(existing.draft);}
  const response=await this.#session.approve(requestWire,{confirmed:true,fingerprint:compared,auth:{accountId:this.#service.material.keyring.accountId,recentMfa:true}});
  const store=this.#service.store,archive=store.state.sequentialSync.lifecycle.archives[q.sessionId],roster=await Roster.load(archive.candidateRoster,this.#service.material.keyring.genesisPin),event=roster.evidence.events.at(-1),sync=store.state.sequentialSync;
  const checkpoint={format:'LB_MD_PAIR_CHECKPOINT_1',accountId:roster.accountId,vaultId:roster.vaultId,genesisPin:roster.genesisPin,pairSessionId:q.sessionId,requestDigest:sha(requestWire),member:inspected.member,verified:copy(sync.verified),legacyCount:sync.legacyCount,recoveryArtifactSha256:sync.recoveryArtifactSha256,accessEpoch:sync.access.epoch};
  const info=checkpointInfo(q,sha(requestWire),inspected.member),checkpointWire=await hpkeSeal(inspected.member.encryptionPublic,unb64(q.psk,32),info,info,encode(checkpoint)),{leaseToken,...publicContext}=this.#context;
  const a={...publicContext,approvalId:randomId(),event,responseHash:sha(response),checkpointHash:sha(checkpointWire),pairSessionId:q.sessionId,expiresAt:Math.floor(q.expires/1000),accessMode:'ACTIVE'};
  const draft={format:'LB_MD_APPROVAL_DRAFT_1',response:b64(response),checkpoint:b64(checkpointWire),approval:a},registration=sync.enrollment.registration;
  const body={format:lifecycleContract.FORMAT,accountId:roster.accountId,vaultId:roster.vaultId,genesisPin:roster.genesisPin,pairSessionId:q.sessionId,registrationHash:fingerprint(registration),requestDigest:sha(requestWire),event,eventHash:fingerprint(event),candidateEpoch:roster.epoch,candidateHash:roster.head,recipient:inspected.member,approvalId:a.approvalId,responseHash:a.responseHash,checkpointHash:a.checkpointHash,expiresAt:a.expiresAt,accessMode:'ACTIVE'};
  const descriptor={body,signature:await this.#service.material.identity.sign('LBOS/B4/enrollment-candidate',encode(body))};
  await store.transaction(state=>{check(state.sequentialSync.enrollment?.requestDigest===sha(requestWire),'PAIRING_PENDING_CHANGED');Object.assign(state.sequentialSync.enrollment,{draft:copy(draft),descriptor:copy(descriptor),leaseToken,phase:'CANDIDATE_DURABLE'});state.sequentialSync.lifecycle.archives[q.sessionId].descriptor=copy(descriptor);state.sequentialSync.lifecycle.archives[q.sessionId].draft=copy(draft);});
  const bound=await this.#service.lifecycleCall('bindEnrollmentCandidate',{descriptor},true);check(bound.status==='OPEN'&&same(bound.descriptor,descriptor),'B4_CANDIDATE_RECEIPT');if(this.#relay)await this.publishDraft();return copy(draft);
 }
 async publishDraft(){const pending=this.#service.store.state.sequentialSync.enrollment;check(this.#relay&&pending?.draft&&pending.descriptor,'RELAY_DRAFT_REQUIRED');const payload=new TextDecoder().decode(encode(pending.draft));return this.#relay.relay('relaySend',{pairSessionId:pending.pairSessionId,slot:'DRAFT',payload,contentHash:sha(payload),member:this.#service.material.identity.public,capability:null,approvalId:pending.draft.approval.approvalId,approvalHash:null});}
 async pollAckAndCommit(){const pending=this.#service.store.state.sequentialSync.enrollment;check(this.#relay&&pending,'RELAY_PAIRING_REQUIRED');const r=await this.#relay.relay('relayFetch',{pairSessionId:pending.pairSessionId,slot:'ACK',member:this.#service.material.identity.public,capability:null});check(r.status==='RELAY_DELIVERED'&&r.slot==='ACK'&&sha(r.payload)===r.contentHash,'RELAY_ACK_BINDING');const response=await this.commit(JSON.parse(r.payload));return {status:response.status==='COMMITTED'?'ENROLLED':response.status,receipt:response.terminal.admittedReceipt,terminal:response.terminal,relayTerminal:response.status};}
 async relayStatus(){const p=this.#service.store.state.sequentialSync.enrollment;check(p,'B4_SESSION_REQUIRED');return this.#service.lifecycleCall('getEnrollmentSession',{pairSessionId:p.pairSessionId,member:this.#service.material.identity.public});}
 async abortUnapproved(){return this.reconcile({decision:'EXPIRE',reason:'EXPIRED'});}
 async inspectAck(ack){
  const s=this.#service.store.state.sequentialSync,pending=s.enrollment;check(!s.pending&&pending?.descriptor,'MD_ACK_PREDECESSOR');
  await lifecycleContract.ack(ack,pending.descriptor);check(pending.descriptor.body.event.body.previous===fingerprint(this.#service.store.state.roster.events.at(-1)||this.#service.store.state.roster.genesis),'MD_ACK_PREDECESSOR');return {status:'VALID_ACK',approvalId:ack.approvalId};
 }
 async commit(ack){
  const pending=this.#service.store.state.sequentialSync.enrollment;check(pending?.draft&&pending.registration,'MD_ENROLLMENT_DRAFT_REQUIRED');
  const existing=await this.#service.lifecycleCall('getEnrollmentSession',{pairSessionId:pending.pairSessionId,member:this.#service.material.identity.public});
  if(existing.status!=='OPEN')return this.#service.publishEnrollmentTerminal(existing);
  await this.inspectAck(ack);check(existing.ack&&same(existing.ack,ack),'B4_RECIPIENT_ACK_NOT_BOUND');
  const args={...pending.draft.approval,leaseToken:pending.leaseToken,possession:ack.possession,approvalHash:ack.approvalHash};
  if(pending.approval)check(same(pending.approval,args),'MD_APPROVAL_COLLISION');else await this.#service.store.transaction(state=>{state.sequentialSync.enrollment.approval=copy(args);state.sequentialSync.lifecycle.archives[pending.pairSessionId].ack=copy(ack);});
  const response=await this.#service.submitEnrollment(args);this.close();return response;
 }
 async reconcile(options={}){
  const pending=this.#service.store.state.sequentialSync.enrollment;check(pending?.registration,'B4_SESSION_REQUIRED');
  let result;try{result=await this.#service.lifecycleCall('getEnrollmentSession',{pairSessionId:pending.pairSessionId,member:this.#service.material.identity.public});}catch(e){if(e.code!=='B4_SESSION_MISSING')throw e;result=null;}
  if(result===null||result.status==='OPEN'){
   const expired=Date.now()/1000>=pending.registration.body.expiresAt;
   // Exact remote terminals were discovered above. For an unresolved original
   // session, expiry wins; an explicit or durable settlement precedes approval.
   // Saved settlement authorization is refreshed by the same-session service.
   if(!expired&&!options.decision&&!pending.settlement){
    if(pending.approval)return this.#service.submitEnrollment(pending.approval);
    if(result!==null&&this.#session)return {status:'OPEN',pairSessionId:pending.pairSessionId};
   }
   result=await this.#service.resolveEnrollment({decision:expired?'EXPIRE':options.decision??pending.settlement?.body.decision??'ABORT',reason:expired?'EXPIRED':options.reason??pending.settlement?.body.reason??'EPHEMERAL_LOST'});
  }
  const response=await this.#service.publishEnrollmentTerminal(result);this.close();return response;
 }
 close(){this.#session?.close();this.#session=null;this.#requestText=null;this.#relayCapability=null;this.#candidate=null;}
}
export class EnrollmentRecipient {
 #identity;#q;#request;#candidate=null;#draft=null;#checkpoint=null;#relay=null;#relayCapability=null;#relayDraft=null;
 #persistence;#unlockSecret;#durableHash=null;#ack=null;#transport=null;
 async #save(phase){
  const value={format:'LB_B4_PENDING_RECIPIENT_1',phase,accountId:this.#q.accountId,vaultId:this.#q.vaultId,genesisPin:this.#q.genesisPin,pairSessionId:this.#q.sessionId,identity:await this.#identity.capsuleMaterial(),publicIdentity:this.#identity.public,q:this.#q,request:{...this.#request,wire:b64(this.#request.wire)},relayCapability:this.#relayCapability,relayDraft:this.#relayDraft,draft:this.#draft,checkpoint:this.#checkpoint,candidate:this.#candidate?{keyring:this.#candidate.keyring,roster:this.#candidate.roster.evidence}:null,ack:this.#ack};
  const wire=await sealPendingRecipient(value,this.#unlockSecret);this.#durableHash=await this.#persistence.publish(this.#q.sessionId,wire,this.#durableHash);
 }
 static async resume({persistence,unlockSecret,transportFactory,pairSessionId}){
  check(persistence&&typeof persistence.read==='function'&&typeof persistence.publish==='function'&&idOK(pairSessionId),'B4_DURABLE_RECIPIENT_REQUIRED');
  const wire=await persistence.read(pairSessionId);check(wire,'B4_PENDING_MISSING');const expected=decode(wire).header,{value,identity}=await openPendingRecipient(wire,unlockSecret,expected);
  check(value.pairSessionId===pairSessionId&&value.q.sessionId===pairSessionId&&value.q.accountId===value.accountId&&value.q.vaultId===value.vaultId&&value.q.genesisPin===value.genesisPin,'B4_PENDING_QR_BINDING');
  const r=new EnrollmentRecipient();r.#persistence=persistence;r.#unlockSecret=unlockSecret;r.#durableHash=sha(wire);r.#identity=identity;r.#q=value.q;r.#request={...value.request,wire:unb64(value.request.wire)};r.#relayCapability=value.relayCapability;r.#relayDraft=value.relayDraft;r.#draft=value.draft;r.#checkpoint=value.checkpoint;r.#ack=value.ack;
  check(r.#request.requestDigest===sha(r.#request.wire)&&r.#request.fingerprint===fingerprint(identity.public),'B4_PENDING_REQUEST_BINDING');
  if(value.candidate){const keyring=dataKeyring(value.candidate.keyring);check(keyring.accountId===value.accountId&&keyring.vaultId===value.vaultId&&keyring.genesisPin===value.genesisPin,'B4_PENDING_KEYRING_BINDING');r.#candidate={identity,keyring,roster:await Roster.load(value.candidate.roster,value.genesisPin)};check(r.#draft&&same(r.#draft.approval.event,r.#candidate.roster.evidence.events.at(-1))&&same(r.#draft.approval.event.body.member,identity.public)&&r.#draft.approval.event.body.previous===r.#q.rosterHead,'B4_PENDING_CANDIDATE_BINDING');if(r.#ack){const a=r.#draft.approval,proof=await proofOf(a,keyring.accountId,keyring.vaultId);check(r.#ack.approvalId===a.approvalId&&await verify(identity.public.signingPublic,'LBOS/MD1/enroll-possession',encode(proof),r.#ack.possession)&&r.#ack.approvalHash===fingerprint({event:a.event,proof,possession:r.#ack.possession}),'B4_PENDING_ACK_BINDING');}}
  check(typeof transportFactory==='function','B4_TRANSPORT_REQUIRED');r.#transport=transportFactory(identity,{accountId:value.accountId,vaultId:value.vaultId});if(r.#relayCapability)r.#relay=r.#transport;return r;
 }
 static async create(pairingText,{transportFactory,persistence,unlockSecret}={}){
  check(persistence&&typeof persistence.read==='function'&&typeof persistence.publish==='function','B4_DURABLE_RECIPIENT_REQUIRED');
  const r=new EnrollmentRecipient();check(typeof pairingText==='string'&&pairingText.length<16384,'PAIRING_TEXT_LIMIT');
  const parsed=JSON.parse(pairingText),{relayCapability,...q}=parsed;
  const old=await persistence.read(q.sessionId);if(old){const resumed=await EnrollmentRecipient.resume({persistence,unlockSecret,transportFactory,pairSessionId:q.sessionId});await resumed.publishRequest();return resumed;}
  check(typeof transportFactory==='function','B4_TRANSPORT_REQUIRED');r.#persistence=persistence;r.#unlockSecret=unlockSecret;r.#q=q;r.#identity=await DeviceIdentity.create();r.#request=await makePairingRequest(q,r.#identity);r.#transport=transportFactory(r.#identity,{accountId:q.accountId,vaultId:q.vaultId});
  if(relayCapability!==undefined){check(idOK(relayCapability)&&typeof transportFactory==='function','RELAY_PAIRING_PROFILE');r.#relayCapability=relayCapability;r.#relay=transportFactory(r.#identity,{accountId:q.accountId,vaultId:q.vaultId});
  }
  await r.#save('REQUEST');
  if(r.#relay){const payload=b64(r.#request.wire);await r.#relay.relay('relaySend',{pairSessionId:q.sessionId,slot:'REQUEST',payload,contentHash:sha(payload),member:r.#identity.public,capability:relayCapability,approvalId:null,approvalHash:null});}
  return r;
 }
 get pendingAck(){return this.#ack?copy(this.#ack):null;}
 async publishRequest(){
  if(!this.#relay)return this.request;const status=await this.relayStatus(),payload=b64(this.#request.wire);
  if(status.requestHash!==null){check(status.requestHash===sha(payload),'B4_REQUEST_COLLISION');return this.request;}
  await this.#relay.relay('relaySend',{pairSessionId:this.#q.sessionId,slot:'REQUEST',payload,contentHash:sha(payload),member:this.#identity.public,capability:this.#relayCapability,approvalId:null,approvalHash:null});return this.request;
 }
 get request(){return {requestText:b64(this.#request.wire),fingerprint:this.#request.fingerprint};}
 get publicIdentity(){return this.#identity.public;}
 get relayEnabled(){return !!this.#relay;}
 get relayDraft(){return this.#relayDraft?copy(this.#relayDraft.draft):null;}
 async pollDraft(){
  check(this.#relay&&this.#q,'RELAY_PAIRING_REQUIRED');
  const r=await this.#relay.relay('relayFetch',{pairSessionId:this.#q.sessionId,slot:'DRAFT',member:this.#identity.public,capability:this.#relayCapability});
  check(r.status==='RELAY_DELIVERED'&&r.slot==='DRAFT'&&r.recipientDeviceId===this.#identity.public.deviceId&&sha(r.payload)===r.contentHash,'RELAY_DRAFT_BINDING');
  const draft=JSON.parse(r.payload);
  await this.inspectApproval(draft,{confirmed:true,fingerprint:this.#request.fingerprint,preview:true});
  this.#relayDraft={draft,hash:r.contentHash};
  await this.#save(this.#candidate?'CANDIDATE':'REQUEST');
  return {status:'DRAFT_VERIFIED',approvalId:draft.approval.approvalId,fingerprint:this.#request.fingerprint,expiresAt:this.#q.expires};
 }
 async relayStatus(){check(this.#relay&&this.#q,'RELAY_PAIRING_REQUIRED');return this.#relay.relay('relayStatus',{pairSessionId:this.#q.sessionId,member:this.#identity.public,capability:this.#relayCapability});}
 async inspectApproval(draft,{confirmed,fingerprint:compared,preview=false}){
  check(confirmed===true&&compared===this.#request.fingerprint,'PAIRING_COMPARISON');keys(draft,['format','response','checkpoint','approval']);check(draft.format==='LB_MD_APPROVAL_DRAFT_1','MD_PAIR_DRAFT');
  if(this.#ack&&!preview){check(this.#draft&&same(this.#draft.approval.event,draft.approval.event)&&this.#draft.response===draft.response&&this.#draft.checkpoint===draft.checkpoint,'B4_PENDING_DRAFT_COLLISION');return this.publishAck();}
  const candidate=await acceptPairingResponse(this.#q,this.#identity,this.#request.wire,unb64(draft.response,1_000_000));
  const info=checkpointInfo(this.#q,this.#request.requestDigest,this.#identity.public),checkpoint=decode(await this.#identity.openPair(unb64(this.#q.psk,32),info,info,unb64(draft.checkpoint,1_000_000)));
  keys(checkpoint,['format','accountId','vaultId','genesisPin','pairSessionId','requestDigest','member','verified','legacyCount','recoveryArtifactSha256','accessEpoch']);
  check(checkpoint.format==='LB_MD_PAIR_CHECKPOINT_1'&&checkpoint.accountId===candidate.keyring.accountId&&checkpoint.vaultId===candidate.keyring.vaultId&&checkpoint.genesisPin===candidate.keyring.genesisPin&&checkpoint.pairSessionId===this.#q.sessionId&&checkpoint.requestDigest===this.#request.requestDigest&&same(checkpoint.member,this.#identity.public)&&idOK(checkpoint.recoveryArtifactSha256),'MD_PAIR_CHECKPOINT');
  const a=draft.approval;check(a.responseHash===sha(unb64(draft.response))&&a.checkpointHash===sha(unb64(draft.checkpoint))&&same(a.event,candidate.roster.evidence.events.at(-1))&&a.expectedVersion===checkpoint.verified.version&&a.expectedHead===checkpoint.verified.head&&a.expectedRosterEpoch===candidate.roster.epoch-1&&a.expectedRosterHash===this.#q.rosterHead&&a.accessEpoch===checkpoint.accessEpoch&&a.accessMode==='ACTIVE'&&a.pairSessionId===this.#q.sessionId&&a.expiresAt===Math.floor(this.#q.expires/1000),'MD_DRAFT_BINDING');
  if(preview)return {status:'VALID_DRAFT',approvalId:a.approvalId};
  if(this.#ack){check(this.#draft&&same(this.#draft.approval.event,a.event),'B4_PENDING_DRAFT_COLLISION');return copy(this.#ack);}
  this.#candidate=candidate;this.#draft=copy(draft);this.#checkpoint=checkpoint;await this.#save('CANDIDATE');
  const proof=await proofOf(a,candidate.keyring.accountId,candidate.keyring.vaultId),possession=await this.#identity.sign('LBOS/MD1/enroll-possession',encode(proof));
  const approvalHash=sha(encode({event:a.event,proof,possession}));this.#candidate=candidate;this.#draft={...copy(draft),approval:{...a,possession,approvalHash}};this.#checkpoint=checkpoint;
  this.#ack={approvalId:a.approvalId,possession,approvalHash};await this.#save('ACK');
  return this.publishAck();
 }
 async publishAck(){
  check(this.#ack&&this.#candidate&&this.#transport,'B4_ACK_DURABLE_REQUIRED');
  const known=await this.#transport.call('getEnrollmentSession',{pairSessionId:this.#q.sessionId,member:this.#identity.public});
  if(known.status!=='OPEN')return {status:known.status,...copy(this.#ack)};
  const bound=await this.#transport.call('bindEnrollmentAck',{pairSessionId:this.#q.sessionId,member:this.#identity.public,ack:this.#ack});check(bound.status==='OPEN'&&same(bound.ack,this.#ack),'B4_ACK_RECEIPT');
  if(this.#relay){
   check(this.#relayDraft,'RELAY_DRAFT_REQUIRED');const status=await this.relayStatus(),payload=new TextDecoder().decode(encode(this.#ack));
   if(status.ackHash!==null){check(status.ackHash===sha(payload),'B4_ACK_COLLISION');return copy(this.#ack);}
   try{await this.#relay.relay('relayConsume',{pairSessionId:this.#q.sessionId,slot:'DRAFT',contentHash:this.#relayDraft.hash,member:this.#identity.public,capability:this.#relayCapability});}catch(e){if(e.code!=='RELAY_SLOT_ABSENT')throw e;}
   await this.#relay.relay('relaySend',{pairSessionId:this.#q.sessionId,slot:'ACK',payload,contentHash:sha(payload),member:this.#identity.public,capability:this.#relayCapability,approvalId:this.#ack.approvalId,approvalHash:this.#ack.approvalHash});
  }
  return copy(this.#ack);
 }
 async finalize({transportFactory}){
  check(this.#candidate&&this.#draft,'MD_APPROVAL_NOT_VERIFIED');const a=this.#draft.approval;
  const transport=transportFactory(this.#identity,this.#candidate.keyring),response=await transport.call('getEnrollmentSession',{pairSessionId:a.pairSessionId,member:this.#identity.public});
  const verified=await lifecycleContract.terminal(response,{pairSessionId:a.pairSessionId},this.#candidate.keyring);check(verified.terminal.status==='COMMITTED','B4_RECIPIENT_NOT_COMMITTED');const receipt=verified.terminal.admittedReceipt;
  check(receipt.status==='ENROLLED'&&receipt.approvalId===a.approvalId&&receipt.approvalHash===a.approvalHash&&receipt.deviceId===this.#identity.public.deviceId&&receipt.responseHash===a.responseHash&&receipt.checkpointHash===a.checkpointHash&&receipt.rosterHash===this.#candidate.roster.head&&receipt.version===this.#checkpoint.verified.version&&receipt.head===this.#checkpoint.verified.head&&receipt.accessMode==='ACTIVE','MD_SERVER_ENROLLMENT_RECEIPT');
  const material={...this.#candidate,checkpoint:{generation:0,head:null},legacyCount:this.#checkpoint.legacyCount,accessEpoch:receipt.accessEpoch};
  const result={material,rollbackFloor:this.#checkpoint.verified,recoveryArtifactSha256:this.#checkpoint.recoveryArtifactSha256,receipt};this.#q.psk='';this.#candidate=null;return result;
 }
 close(){if(this.#q)this.#q.psk='';this.#candidate=null;this.#identity=null;this.#relayCapability=null;this.#relay=null;this.#unlockSecret=null;}
}
// Windows recovery composition supplies an already decrypted RecoveryPackage and
// a trusted current public roster/checkpoint. Stale evidence fails server CAS;
// this route never discovers or trusts a replacement genesis automatically.
export class RecoveryEnrollment {
 #identity;#material;#args;#transport;#auth;#state;#freezeId;#event;
 static async prepare({recoveryPackage,currentState,auth,transportFactory,confirmed}){
  check(confirmed===true,'EXPLICIT_RECOVERY_APPROVAL');await auth.requireRecentMfa();
  const keyring=recoveryPackage?.dataKeyring;check(keyring&&currentState.accountId===keyring.accountId&&currentState.vaultId===keyring.vaultId&&currentState.genesisPin===keyring.genesisPin,'RECOVERY_GENESIS');
  const roster=await Roster.load(currentState.roster,keyring.genesisPin),identity=await DeviceIdentity.create();
  check(roster.epoch===currentState.rosterEpoch&&roster.head===currentState.rosterHash,'RECOVERY_CURRENT_ROSTER');
  const event=await recoveryCertificate(recoveryPackage,roster,identity,{confirmed,auth:{accountId:keyring.accountId,recentMfa:true}});
  const self=new RecoveryEnrollment();self.#identity=identity;self.#auth=auth;self.#event=event;self.#state=copy(currentState);self.#freezeId=randomId();self.#transport=transportFactory(identity,keyring);
  await roster.accept(event);self.#material={identity,keyring,roster,checkpoint:{generation:0,head:null},legacyCount:currentState.legacyCount,accessEpoch:currentState.accessEpoch};return self;
 }
 async freeze(lostDeviceId){await this.#auth.requireRecentMfa();check(idOK(lostDeviceId),'LOST_DEVICE_ID');const r=await this.#transport.call('freezeLostDevice',{freezeId:this.#freezeId,lostDeviceId,recoveryEvent:this.#event});check(r.status==='FROZEN'&&r.freezeId===this.#freezeId,'RECOVERY_FREEZE_RECEIPT');this.#state.status='FROZEN';this.#state.accessEpoch=r.accessEpoch;return r;}
 async prepareApproval(){
  await this.#auth.requireRecentMfa();check(this.#state.status==='FROZEN','RECOVERY_READ_ONLY_REQUIRED');
  if(!this.#args){const s=this.#state,a={expectedVersion:s.version,expectedHead:s.head,expectedRosterEpoch:s.rosterEpoch,expectedRosterHash:s.rosterHash,accessEpoch:s.accessEpoch,runtimeSessionId:randomId(),leaseEpoch:0,leaseToken:randomId(),approvalId:randomId(),event:this.#event,responseHash:randomId(),checkpointHash:sha(encode({version:s.version,head:s.head})),pairSessionId:randomId(),expiresAt:Math.floor(Date.now()/1000)+300,accessMode:'RECOVERY_READ_ONLY'};
   const proof=await proofOf(a,s.accountId,s.vaultId),possession=await this.#identity.sign('LBOS/MD1/enroll-possession',encode(proof));this.#args={...a,possession,approvalHash:sha(encode({event:a.event,proof,possession}))};
  }
  return {material:this.#material,approval:copy(this.#args),rollbackFloor:{version:this.#state.version,head:this.#state.head}};
 }
 async enroll(){
  await this.prepareApproval();const a=this.#args;let receipt;
  // New devices cannot read before admission. An exact enrollment request is
  // retained in this session on unknown; no automatic new identity/request.
  try{receipt=await this.#transport.call('getIntent',{intentId:a.approvalId,intentBodyHash:a.approvalHash,wireSha256:a.responseHash});}
  catch(e){if(!['INACTIVE_DEVICE','DEVICE_NAMESPACE'].includes(e.code))throw e;}
  if(!receipt||receipt.status==='NOT_FOUND')receipt=await this.#transport.call('enrollDevice',a);
  check(receipt.status==='ENROLLED'&&receipt.approvalHash===a.approvalHash&&receipt.accessMode==='RECOVERY_READ_ONLY'&&receipt.rosterHash===this.#material.roster.head&&receipt.deviceId===this.#identity.public.deviceId&&receipt.version===this.#state.version&&receipt.head===this.#state.head,'RECOVERY_RECEIPT');
  this.#material.accessEpoch=receipt.accessEpoch;return {material:this.#material,rollbackFloor:{version:receipt.version,head:receipt.head},receipt};
 }
 close(){this.#identity=null;this.#material=null;this.#args=null;this.#event=null;}
}
