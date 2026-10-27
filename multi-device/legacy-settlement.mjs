// Reviewed settlement-only adoption. No fresh admission, TTL reset, or source roster rewrite.
import * as codec from '../core/package/src/codec.mjs';
import {Roster} from '../core/package/src/enrollment.mjs';
import {lifecycleContract} from './lifecycle-client.mjs';
import {same} from './contracts.mjs';
const {check,copy,encode,fingerprint,sha,unb64,randomId}=codec;
export async function prepareLegacySettlement(material,state,{confirmed,sourceCheckpoint,decision='EXPIRE'}={}){
 check(confirmed===true&&sourceCheckpoint&&['ABORT','EXPIRE'].includes(decision),'B4_REVIEWED_LEGACY_SETTLEMENT');const p=state.sequentialSync.enrollment,a=p?.draft?.approval,event=a?.event;
 check(p?.pairSessionId&&event&&same(state.roster.events.at(-1),event)&&!state.sequentialSync.pending&&p.leaseToken&&p.requestDigest===event.body.requestDigest,'B4_LEGACY_BINDINGS_HOLD');
 check(a.pairSessionId===p.pairSessionId&&a.expiresAt>=0&&a.responseHash===sha(unb64(p.draft.response))&&a.checkpointHash===sha(unb64(p.draft.checkpoint))&&state.pairingClaims[p.pairSessionId]?.response===p.draft.response,'B4_LEGACY_BINDINGS_HOLD');
 const predecessor={genesis:state.roster.genesis,events:state.roster.events.slice(0,-1)},prior=await Roster.load(predecessor,material.keyring.genesisPin),sponsor=[prior.evidence.genesis.body.firstDevice,...prior.evidence.events.map(e=>e.body.member)].find(m=>m.deviceId===event.body.signer);check(sponsor&&a.expectedRosterHash===prior.head&&a.expectedRosterEpoch===prior.epoch&&event.body.authority==='ACTIVE_ADMIN','B4_LEGACY_BINDINGS_HOLD');
 const body={format:lifecycleContract.FORMAT,protocolVersion:1,accountId:state.accountId,vaultId:state.vaultId,genesisPin:material.keyring.genesisPin,pairSessionId:p.pairSessionId,sponsor,predecessor:{version:a.expectedVersion,head:a.expectedHead,rosterEpoch:a.expectedRosterEpoch,rosterHash:a.expectedRosterHash,accessEpoch:a.accessEpoch,rollbackWitnessHash:fingerprint(state.sequentialSync.rollbackFloor)},lease:{deviceId:sponsor.deviceId,runtimeSessionId:a.runtimeSessionId,leaseEpoch:a.leaseEpoch,leaseTokenHash:sha(Uint8Array.from(p.leaseToken.match(/../g),x=>parseInt(x,16))),purpose:'ENROLL'},expiresAt:a.expiresAt,mode:'LEGACY_SETTLEMENT',capabilityHash:null,legacyActor:material.identity.public,legacyEvidenceHash:fingerprint({sourceCheckpoint,sourceStateHash:fingerprint(state),originalPendingHash:fingerprint(p),pairingClaimHash:fingerprint(state.pairingClaims[p.pairSessionId])})};
 const registration={body,signature:await material.identity.sign('LBOS/B4/legacy-settlement-session',encode(body))};
 const d={format:lifecycleContract.FORMAT,accountId:state.accountId,vaultId:state.vaultId,genesisPin:material.keyring.genesisPin,pairSessionId:p.pairSessionId,registrationHash:fingerprint(registration),requestDigest:p.requestDigest,event,eventHash:fingerprint(event),candidateEpoch:event.body.epoch,candidateHash:fingerprint(event),recipient:event.body.member,approvalId:a.approvalId,responseHash:a.responseHash,checkpointHash:a.checkpointHash,expiresAt:a.expiresAt,accessMode:'ACTIVE'};
 const descriptor={body:d,signature:await material.identity.sign('LBOS/B4/legacy-settlement-candidate',encode(d))};await lifecycleContract.registration(registration,material.keyring);await lifecycleContract.descriptor(descriptor,registration,material.keyring,predecessor);
 const ack=p.approval?{approvalId:a.approvalId,possession:p.approval.possession,approvalHash:p.approval.approvalHash}:null;if(ack)await lifecycleContract.ack(ack,descriptor);
 return {registration,descriptor,ack,decision,intentId:randomId()};
}
export async function transitionReviewedAppPending(store,transport,auth,{confirmed,sourceCheckpoint,decision}={}){
 check(store.storeFormat===2&&confirmed===true&&same(store.checkpoint,sourceCheckpoint),'B4_REVIEWED_TRANSITION_REQUIRED');await auth.requireRecentMfa();
 let plan=store.state.sequentialSync.enrollment?.legacySettlement;
 if(!plan){plan=await prepareLegacySettlement(store.material,store.state,{confirmed,sourceCheckpoint,decision});await store.transaction(state=>{check(!state.sequentialSync.enrollment.legacySettlement,'B4_LEGACY_PLAN_COLLISION');state.sequentialSync.enrollment.legacySettlement=copy(plan);});}
 const response=await transport.call('settleLegacyEnrollment',plan);return store.transitionPending(response,{confirmed,sourceCheckpoint:store.checkpoint});
}
