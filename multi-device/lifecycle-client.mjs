import * as codec from '../core/package/src/codec.mjs';
import {verify} from '../core/package/src/crypto.mjs';
import {Roster} from '../core/package/src/enrollment.mjs';
import {same} from './contracts.mjs';
import {defineLifecycleContract} from './lifecycle-contract.mjs';
const {check,keys,copy,encode,sha,idOK,randomId,fingerprint}=codec;
export const lifecycleContract=defineLifecycleContract({...codec,verify,Roster});
export const emptyLifecycle=()=>({format:'LB_B4_LOCAL_LIFECYCLE_1',interpretationVersion:3,archives:{},terminals:{},retirements:{},archivalRosters:[],restoreMode:false,legacyArchive:null});
export function lifecycleWritable(store){check(store.state.sequentialSync.lifecycle?.restoreMode===false,'B4_RESTORE_READ_ONLY_HOLD');check(store.storeFormat===3&&store.storageKind==='APP_OWNED_ENCRYPTED_RECORD','B4_LEGACY_MIGRATION_REQUIRED');}
export async function validateLifecycleState(state,material){
 const life=state.sequentialSync.lifecycle;if(!life)return;
 keys(life,['format','interpretationVersion','archives','terminals','retirements','archivalRosters','restoreMode','legacyArchive']);
 check(life.format==='LB_B4_LOCAL_LIFECYCLE_1'&&life.interpretationVersion===3&&typeof life.restoreMode==='boolean'&&Array.isArray(life.archivalRosters),'B4_LOCAL_FORMAT');
 for(const evidence of life.archivalRosters){const r=await Roster.load(evidence,material.keyring.genesisPin);check(r.accountId===state.accountId&&r.vaultId===state.vaultId,'B4_ARCHIVE_NAMESPACE');}
 for(const [sid,archive]of Object.entries(life.archives)){
  check(idOK(sid)&&archive.registration?.body.pairSessionId===sid,'B4_ARCHIVE_SESSION');await lifecycleContract.registration(archive.registration,material.keyring);
  if(archive.descriptor){const s=archive.registration.body;const prior=archive.predecessor;await lifecycleContract.descriptor(archive.descriptor,archive.registration,material.keyring,prior);check(archive.descriptor.body.eventHash===fingerprint(archive.candidateRoster.events.at(-1))&&s.predecessor.rosterEpoch===prior.events.length+1,'B4_ARCHIVE_CANDIDATE');}
  if(archive.candidateRoster&&!archive.descriptor){const r=await Roster.load(archive.candidateRoster,material.keyring.genesisPin),s=archive.registration.body;check(r.epoch===s.predecessor.rosterEpoch+1&&r.evidence.events.at(-1).body.previous===s.predecessor.rosterHash&&r.evidence.events.at(-1).body.signer===s.sponsor.deviceId&&archive.predecessor.events.every((e,i)=>same(e,r.evidence.events[i])),'B4_PARTIAL_CANDIDATE');}
  if(archive.ack)await lifecycleContract.ack(archive.ack,archive.descriptor);
  if(archive.settlementAttempts){
   check(Array.isArray(archive.settlementAttempts),'B4_SETTLEMENT_ARCHIVE');const ids=new Set();
   for(const intent of archive.settlementAttempts){await validateSettlementAttempt(intent,archive,material);check(!ids.has(intent.body.intentId),'B4_SETTLEMENT_ARCHIVE_COLLISION');ids.add(intent.body.intentId);}
  }
 }
 const pending=state.sequentialSync.enrollment;
 if(pending?.settlement){const archive=life.archives[pending.pairSessionId];check(archive&&same(pending.registration,archive.registration),'B4_SETTLEMENT_ARCHIVE');await validateSettlementAttempt(pending.settlement,archive,material);if(archive.settlementAttempts)check(same(archive.settlementAttempts.at(-1),pending.settlement),'B4_SETTLEMENT_ACTIVE_ATTEMPT');}
 for(const [sid,response]of Object.entries(life.terminals)){check(life.archives[sid],'B4_TERMINAL_ARCHIVE_MISSING');await lifecycleContract.terminal(response,{pairSessionId:sid,...life.archives[sid]},material.keyring);}
 for(const [iid,row]of Object.entries(life.retirements)){
  keys(row,['intent','receipt']);const b=row.intent.body;
  keys(b,['format','accountId','vaultId','genesisPin','intentId','actor','target','expected','targetSessionsHash','reason','expiresAt','confirmationHash']);lifecycleContract.namespace(b,material.keyring);
  check(idOK(iid)&&b.intentId===iid&&b.actor.deviceId===material.identity.public.deviceId&&['LOST_DEVICE','BROKEN_DEVICE','USER_REPLACEMENT'].includes(b.reason),'B4_LOCAL_RETIRE_INTENT');await lifecycleContract.signed(row.intent,'LBOS/B4/retire-device',b.actor);
  if(row.receipt)validateRetirementReceipt(row.intent,row.receipt);
 }
}
export function validateRetirementReceipt(intent,receipt){const b=intent.body;check(receipt.format==='LB_B4_RETIREMENT_RECEIPT_1'&&receipt.status==='COMMITTED'&&receipt.intentId===b.intentId&&receipt.intentHash===sha(encode(intent))&&receipt.accountId===b.accountId&&receipt.vaultId===b.vaultId&&receipt.genesisPin===b.genesisPin&&same(receipt.target,b.target)&&same(receipt.targetAfter,{...b.target,active:false})&&receipt.version===b.expected.version&&receipt.head===b.expected.head&&receipt.rosterEpoch===b.expected.rosterEpoch&&receipt.rosterHash===b.expected.rosterHash&&Number.isSafeInteger(receipt.accessEpoch)&&receipt.accessEpoch>b.expected.accessEpoch&&Number.isSafeInteger(receipt.decisionSequence)&&receipt.decisionSequence>0,'B4_RETIRE_RECEIPT');}
export async function settlementIntent(material,pending,{decision,reason,candidateRoster=null,now=Math.floor(Date.now()/1000)}={}){
 const event=candidateRoster?.events.at(-1),candidateEvidence=event&&!pending.descriptor?{event,eventHash:fingerprint(event),requestDigest:event.body.requestDigest}:null;
 const b={format:lifecycleContract.FORMAT,accountId:material.keyring.accountId,vaultId:material.keyring.vaultId,genesisPin:material.keyring.genesisPin,pairSessionId:pending.pairSessionId,registrationHash:fingerprint(pending.registration),intentId:randomId(),decision,reason,actor:material.identity.public,expiresAt:now+300,registration:pending.registration,candidateDescriptor:pending.descriptor??null,candidateEvidence};
 return {body:b,signature:await material.identity.sign('LBOS/B4/settle-session',encode(b))};
}
// Expired authorizations remain evidence, not replay authority. Validate their exact signed
// namespace/session/candidate binding without requiring an archived attempt to be unexpired.
export async function validateSettlementAttempt(intent,archive,material){
 const b=intent.body;keys(b,['format','accountId','vaultId','genesisPin','pairSessionId','registrationHash','intentId','decision','reason','actor','expiresAt','registration','candidateDescriptor','candidateEvidence']);lifecycleContract.namespace(b,material.keyring);
 check(idOK(b.intentId)&&b.pairSessionId===archive.registration.body.pairSessionId&&same(b.registration,archive.registration)&&b.registrationHash===fingerprint(archive.registration)&&same(b.actor,material.identity.public)&&Number.isSafeInteger(b.expiresAt)&&b.expiresAt>=0&&['ABORT','EXPIRE'].includes(b.decision)&&['USER_CANCEL','EXPIRED','EPHEMERAL_LOST','SPONSOR_UNAVAILABLE'].includes(b.reason),'B4_SETTLEMENT_LOCAL_BINDING');
 const event=archive.candidateRoster?.events.at(-1),evidence=event&&!archive.descriptor?{event,eventHash:fingerprint(event),requestDigest:event.body.requestDigest}:null;
 check(same(b.candidateDescriptor,archive.descriptor??null)&&same(b.candidateEvidence,evidence),'B4_SETTLEMENT_LOCAL_CANDIDATE');await lifecycleContract.signed(intent,'LBOS/B4/settle-session',b.actor);
}
export function settlementAttemptsPreserved(before,next){
 return Object.entries(before??{}).every(([sid,a])=>Object.entries(a).every(([key,value])=>key==='settlementAttempts'?Array.isArray(next?.[sid]?.[key])&&value.every((attempt,i)=>same(attempt,next[sid][key][i])):same(value,next?.[sid]?.[key])));
}
export async function validatePublication(response,pending,material,before){
 const validated=await lifecycleContract.terminal(response,pending,material.keyring),r=response.state;
 check(before.roster.events.every((e,i)=>same(e,r.roster.events[i])),'B4_CANONICAL_ROLLBACK');
 const witness=before.sequentialSync.verified;check(r.version>=witness.version&&(r.version!==witness.version||r.head===witness.head),'B4_PREFIX_ROLLBACK');return validated;
}
export function publishTerminalState(local,response,pending){
 check(same(local.sequentialSync.enrollment,pending),'B4_PENDING_CHANGED');
 const s=local.sequentialSync,l=s.lifecycle,sid=pending.pairSessionId;check(l?.archives[sid],'B4_ARCHIVE_MISSING');
 if(l.terminals[sid])check(same(l.terminals[sid].terminal,response.terminal),'B4_TERMINAL_COLLISION');else l.terminals[sid]=copy(response);
 l.archives[sid]={...l.archives[sid],...(response.descriptor?{descriptor:copy(response.descriptor)}:{}),...(response.ack?{ack:copy(response.ack)}:{})};
 local.roster=copy(response.state.roster);s.enrollment=null;s.access={rosterEpoch:response.state.rosterEpoch,rosterHash:response.state.rosterHash,epoch:response.state.accessEpoch,status:response.state.status};
 if(response.terminal.status==='COMMITTED')s.receipts[response.terminal.admittedReceipt.approvalId]=copy(response.terminal.admittedReceipt);
}
export async function prepareRetirement(material,remote,{targetDeviceId,targetFingerprint,reason,confirmed,now=Math.floor(Date.now()/1000)}){
 check(confirmed===true&&idOK(targetDeviceId)&&idOK(targetFingerprint),'B4_EXACT_RETIRE_CONFIRMATION');
 const target=remote.devices.find(x=>x.member.deviceId===targetDeviceId);check(target?.active===true&&fingerprint(target.member)===targetFingerprint&&targetDeviceId!==material.identity.public.deviceId,'B4_SELF_OR_AMBIGUOUS_TARGET');
 const state=remote.state;check(state.accountId===material.keyring.accountId&&state.vaultId===material.keyring.vaultId&&state.genesisPin===material.keyring.genesisPin&&state.status==='ACTIVE','B4_RETIRE_NAMESPACE');
 const roster=await Roster.load(state.roster,material.keyring.genesisPin);check(roster.head===state.rosterHash&&roster.epoch===state.rosterEpoch,'B4_RETIRE_ROSTER');
 const inventory=remote.sessions.find(x=>x.deviceId===targetDeviceId)?.inventory;check(Array.isArray(inventory),'B4_TARGET_INVENTORY');
 const expected={version:state.version,head:state.head,rosterEpoch:state.rosterEpoch,rosterHash:state.rosterHash,accessEpoch:state.accessEpoch};
 const body={format:lifecycleContract.FORMAT,accountId:state.accountId,vaultId:state.vaultId,genesisPin:state.genesisPin,intentId:randomId(),actor:material.identity.public,target:copy(target),expected,targetSessionsHash:fingerprint(inventory),reason,expiresAt:now+300,confirmationHash:fingerprint({targetDeviceId,targetFingerprint,reason,confirmed})};
 check(['LOST_DEVICE','BROKEN_DEVICE','USER_REPLACEMENT'].includes(reason),'B4_RETIRE_REASON');return {body,signature:await material.identity.sign('LBOS/B4/retire-device',encode(body))};
}
