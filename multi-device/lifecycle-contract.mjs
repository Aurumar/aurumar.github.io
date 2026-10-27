// Platform-neutral non-core lifecycle validators. Ports use the unchanged core primitives.
export function defineLifecycleContract({check,keys,encode,sha,verify,Roster,idOK}){
 const FORMAT='LB_B4_LIFECYCLE_1',TERMINAL='LB_B4_TERMINAL_1';
 const hash=async value=>sha(encode(value));
 const NS=['accountId','vaultId','genesisPin'];
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const id=(value)=>check(idOK(value),'B4_ID');
 const integer=(value)=>check(Number.isSafeInteger(value)&&value>=0,'B4_INTEGER');
 const member=m=>{keys(m,['deviceId','keyId','signingPublic','encryptionPublic']);id(m.deviceId);id(m.keyId);};
 const namespace=(b,k)=>{check(b.format===FORMAT,'B4_FORMAT');for(const field of NS){id(b[field]);check(b[field]===k[field],'B4_NAMESPACE');}};
 const head=h=>{keys(h,['version','head','rosterEpoch','rosterHash','accessEpoch','rollbackWitnessHash']);for(const k of ['version','rosterEpoch','accessEpoch'])integer(h[k]);for(const k of ['head','rosterHash','rollbackWitnessHash'])id(h[k]);};
 const lease=l=>{keys(l,['deviceId','runtimeSessionId','leaseEpoch','leaseTokenHash','purpose']);for(const k of ['deviceId','runtimeSessionId','leaseTokenHash'])id(l[k]);integer(l.leaseEpoch);check(l.purpose==='ENROLL','B4_LEASE_PURPOSE');};
 async function signed(record,domain,actor){keys(record,['body','signature']);check(await verify(actor.signingPublic,domain,encode(record.body),record.signature),'B4_SIGNATURE');return hash(record);}
 async function registration(record,k){
  const b=record.body;keys(b,['format','protocolVersion',...NS,'pairSessionId','sponsor','predecessor','lease','expiresAt','mode','capabilityHash',...(b.mode==='LEGACY_SETTLEMENT'?['legacyActor','legacyEvidenceHash']:[])]);namespace(b,k);id(b.pairSessionId);member(b.sponsor);head(b.predecessor);lease(b.lease);integer(b.expiresAt);
  check(b.protocolVersion===1&&['RELAY','MANUAL','LEGACY_SETTLEMENT'].includes(b.mode)&&b.lease.deviceId===b.sponsor.deviceId,'B4_REGISTRATION');
  if(b.mode==='LEGACY_SETTLEMENT'){member(b.legacyActor);id(b.legacyEvidenceHash);check(b.capabilityHash===null,'B4_LEGACY_CAPABILITY');return signed(record,'LBOS/B4/legacy-settlement-session',b.legacyActor);}
  check(b.mode==='RELAY'?idOK(b.capabilityHash):b.capabilityHash===null,'B4_CAPABILITY');return signed(record,'LBOS/B4/enrollment-session',b.sponsor);
 }
 async function descriptor(record,s,k,prior){
  const b=record.body;keys(b,['format',...NS,'pairSessionId','registrationHash','requestDigest','event','eventHash','candidateEpoch','candidateHash','recipient','approvalId','responseHash','checkpointHash','expiresAt','accessMode']);namespace(b,k);
  for(const field of ['pairSessionId','registrationHash','requestDigest','eventHash','candidateHash','approvalId','responseHash','checkpointHash'])id(b[field]);integer(b.candidateEpoch);integer(b.expiresAt);member(b.recipient);
  check(b.pairSessionId===s.body.pairSessionId&&b.registrationHash===await hash(s)&&b.expiresAt===s.body.expiresAt&&b.accessMode==='ACTIVE','B4_DESCRIPTOR_SESSION');
  check(b.eventHash===await hash(b.event)&&b.eventHash===b.candidateHash&&b.candidateEpoch===s.body.predecessor.rosterEpoch+1&&b.event.body.previous===s.body.predecessor.rosterHash&&b.event.body.requestDigest===b.requestDigest,'B4_DESCRIPTOR_EVENT');
  check(await hash(b.event.body.member)===await hash(b.recipient)&&b.event.body.signer===s.body.sponsor.deviceId&&b.event.body.authority==='ACTIVE_ADMIN','B4_DESCRIPTOR_MEMBER');
  const canonical=await Roster.load(prior,k.genesisPin);check(canonical.head===b.event.body.previous,'B4_PREDECESSOR');await canonical.accept(b.event);check(canonical.head===b.candidateHash&&canonical.epoch===b.candidateEpoch,'B4_CANDIDATE');
  return signed(record,s.body.mode==='LEGACY_SETTLEMENT'?'LBOS/B4/legacy-settlement-candidate':'LBOS/B4/enrollment-candidate',s.body.legacyActor??s.body.sponsor);
 }
 function proof(d){const b=d.body;return {scope:'LBOS_OWNER_SEQUENTIAL_V1',accountId:b.accountId,vaultId:b.vaultId,pairSessionId:b.pairSessionId,eventHash:b.eventHash,responseHash:b.responseHash,checkpointHash:b.checkpointHash,expiresAt:b.expiresAt,accessMode:b.accessMode};}
 async function ack(a,d){keys(a,['approvalId','possession','approvalHash']);check(a.approvalId===d.body.approvalId&&await verify(d.body.recipient.signingPublic,'LBOS/MD1/enroll-possession',encode(proof(d)),a.possession),'B4_ACK_PROOF');check(a.approvalHash===await hash({event:d.body.event,proof:proof(d),possession:a.possession}),'B4_ACK_HASH');return hash(a);}
 async function terminal(response,pending,k){
  keys(response,['status','registration','descriptor','ack','terminal','state']);const {registration:s,descriptor:d,ack:a,terminal:t,state:r}=response;
  if(t){keys(t,['format','version','accountId','vaultId','genesisPin','pairSessionId','receiptId','registrationHash','descriptorHash','candidatePhase','ackHash','ackPhase','status','reason','decisionSequence','decisionTime','actorDeviceId','authorizationProofHash','originalSponsor','originalExpiry','decisionState','exclusion','admittedReceipt','cleanup','unboundCandidateEvidence']);keys(t.cleanup,['boundLease','leaseDisposition','relayClosed','payloadsCleared','slotHashes']);keys(t.decisionState,['version','head','rosterEpoch','rosterHash','accessEpoch','leaseEpoch']);id(t.receiptId);id(t.authorizationProofHash);id(t.actorDeviceId);integer(t.decisionSequence);check(Number.isFinite(t.decisionTime)&&t.decisionTime>=0,'B4_DECISION_TIME');}
  check(t&&['COMMITTED','ABORTED','EXPIRED'].includes(response.status)&&response.status===t.status,'B4_NOT_TERMINAL');
  check(t.format===TERMINAL&&t.version===1&&t.accountId===k.accountId&&t.vaultId===k.vaultId&&t.genesisPin===k.genesisPin&&t.pairSessionId===pending.pairSessionId,'B4_TERMINAL_NAMESPACE');
  const sh=await registration(s,k);check(t.originalSponsor===s.body.sponsor.deviceId&&t.originalExpiry===s.body.expiresAt&&await hash(t.cleanup.boundLease)===await hash(s.body.lease),'B4_TERMINAL_BINDING');check(sh===t.registrationHash&&(!pending.registration||await hash(pending.registration)===sh),'B4_TERMINAL_REGISTRATION');
  if(d){check(t.candidatePhase==='PROVISIONAL_SIGNED_CANDIDATE'&&t.unboundCandidateEvidence===null,'B4_TERMINAL_PHASE');const prior={genesis:r.roster.genesis,events:r.roster.events.slice(0,s.body.predecessor.rosterEpoch-1)};const dh=await descriptor(d,s,k,prior);check(dh===t.descriptorHash&&(!pending.descriptor||await hash(pending.descriptor)===dh),'B4_TERMINAL_DESCRIPTOR');}
  else {check(t.descriptorHash===null&&['NO_CANDIDATE_BOUND','SIGNED_CANDIDATE_SETTLEMENT_ONLY'].includes(t.candidatePhase),'B4_TERMINAL_NO_CANDIDATE');check(!pending.descriptor,'B4_UNBOUND_CANDIDATE_REQUIRES_SETTLEMENT');}
  if(t.unboundCandidateEvidence){check(!d&&t.status!=='COMMITTED'&&t.candidatePhase==='SIGNED_CANDIDATE_SETTLEMENT_ONLY','B4_UNBOUND_NEGATIVE_ONLY');const e=t.unboundCandidateEvidence;keys(e,['event','eventHash','requestDigest']);check(await hash(e.event)===e.eventHash&&e.requestDigest===e.event.body.requestDigest&&e.event.body.previous===s.body.predecessor.rosterHash&&e.event.body.signer===s.body.sponsor.deviceId,'B4_UNBOUND_CANDIDATE');const prior=await Roster.load({genesis:r.roster.genesis,events:r.roster.events.slice(0,s.body.predecessor.rosterEpoch-1)},k.genesisPin);await prior.accept(e.event);for(const event of r.roster.events)check(await hash(event)!==e.eventHash,'B4_CONTRADICTORY_INCLUSION');if(pending.candidateRoster)check(await hash(pending.candidateRoster.events.at(-1))===e.eventHash,'B4_LOCAL_UNBOUND_CANDIDATE');}
  if(a){check(d&&await ack(a,d)===t.ackHash&&t.ackPhase==='ACK_BOUND','B4_TERMINAL_ACK');}else check(t.ackHash===null&&t.ackPhase==='ACK_NOT_BOUND_AT_TERMINAL','B4_TERMINAL_NO_ACK');
  const roster=await Roster.load(r.roster,k.genesisPin);check(r.accountId===k.accountId&&r.vaultId===k.vaultId&&r.genesisPin===k.genesisPin&&roster.head===r.rosterHash&&roster.epoch===r.rosterEpoch,'B4_TERMINAL_STATE');
  for(const key of ['version','rosterEpoch','accessEpoch','leaseEpoch']){integer(t.decisionState[key]);integer(r[key]);check(r[key]>=t.decisionState[key],'B4_DECISION_STATE_ROLLBACK');}id(t.decisionState.head);id(t.decisionState.rosterHash);id(r.head);check(t.decisionSequence>0&&t.decisionState.rosterEpoch>=s.body.predecessor.rosterEpoch&&t.decisionState.version>=s.body.predecessor.version&&(r.version!==t.decisionState.version||r.head===t.decisionState.head),'B4_DECISION_STATE');const decided=await Roster.load({genesis:r.roster.genesis,events:r.roster.events.slice(0,t.decisionState.rosterEpoch-1)},k.genesisPin);check(decided.head===t.decisionState.rosterHash,'B4_DECISION_ROSTER');if(t.status==='EXPIRED')check(t.decisionTime>=t.originalExpiry,'B4_EXPIRY_DECISION');
  check(r.version>=s.body.predecessor.version&&r.accessEpoch>=s.body.predecessor.accessEpoch&&['FENCED_AND_CLEARED','ALREADY_EXPIRED_AND_CLEARED','SUPERSEDED_UNRELATED_LEASE_PRESERVED'].includes(t.cleanup.leaseDisposition)&&t.cleanup.relayClosed===true&&t.cleanup.payloadsCleared===true,'B4_TERMINAL_CLEANUP');
  if(t.status==='COMMITTED'){
   check(d&&a&&t.admittedReceipt?.status==='ENROLLED'&&t.admittedReceipt.approvalId===d.body.approvalId&&t.admittedReceipt.approvalHash===a.approvalHash&&t.admittedReceipt.deviceId===d.body.recipient.deviceId&&t.admittedReceipt.rosterHash===d.body.candidateHash&&t.admittedReceipt.rosterEpoch===d.body.candidateEpoch&&t.admittedReceipt.responseHash===d.body.responseHash&&t.admittedReceipt.checkpointHash===d.body.checkpointHash&&t.admittedReceipt.version===s.body.predecessor.version&&t.admittedReceipt.head===s.body.predecessor.head,'B4_COMMIT_RECEIPT');
   check(await hash(r.roster.events[d.body.candidateEpoch-2])===d.body.eventHash,'B4_CANONICAL_INCLUSION');
  }else{
   check(t.admittedReceipt===null&&t.exclusion===true,'B4_NEGATIVE_EXCLUSION');
   if(d)for(const e of r.roster.events)check(await hash(e)!==d.body.eventHash,'B4_CONTRADICTORY_INCLUSION');
  }
  return {roster,terminal:t,descriptor:d,registration:s,ack:a};
 }
 return Object.freeze({FORMAT,TERMINAL,hash,namespace,registration,descriptor,ack,proof,terminal,signed,member,head,lease});
}
