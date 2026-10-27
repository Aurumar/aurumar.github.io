// Shared LB_MD_UI_BACKEND_1 composition (Batch 1 fork convergence, OP-03).
// One md route table and one local owner/follower/handoff state machine for every surface that runs the
// owner-sequential SequentialService inside the app process: BROWSER (accepted Site v15 S03 semantics:
// IndexedDB + navigator.locks) and APP_SHELL (app-owned encrypted store + kernel owner lock).
// The code below is the accepted Site v15 browser/backend.mjs composition with its three platform
// dependencies moved behind ports: storage (profiles/open/createEnrolled/enrolledId), ownership
// (exclusive owner claim with a loss signal) and surface policy (enabled routes, settings, preflight).
// SequentialService, EnrollmentController and OwnerTransport are used unchanged.
// The Windows B legacy surface (WINDOWS: existing SQLite store, activation, cold backup, recovery) keeps its
// release-pinned composition in windows-app.mjs until its real data is migrated (not in Batch 1).
import {check,keys,fingerprint} from '../core/package/src/codec.mjs';
import {SequentialService} from './sequential-service.mjs';
import {EnrollmentController,EnrollmentRecipient} from './enrollment-controller.mjs';
import {Roster} from '../core/package/src/enrollment.mjs';
import {PROFILE,same} from './contracts.mjs';
import {normalizeCommand} from '../user-app/action-model.mjs';

export const MD_ROUTE_GROUPS=Object.freeze({
 CORE:Object.freeze(['status','email','email-code','totp','select-profile','sync','acquire','release','reconcile','suspend','handoff']),
 TOTP_ENROLL:Object.freeze(['totp-enroll']),
 FREEZE:Object.freeze(['freeze']),
 RELAY_CLIENT_PREFLIGHT:Object.freeze(['relay-client-preflight']),
 SPONSOR:Object.freeze(['pair-relay-probe','pair-begin','pair-request-poll','pair-publish-draft','pair-ack-poll','pair-relay-status','pair-relay-abort-unapproved','pair-inspect','pair-draft-export','pair-inspect-ack','pair-approve','pair-commit','pair-reconcile','pair-diagnostic','pair-abort-expired']),
 LIFECYCLE:Object.freeze(['lifecycle-state','device-retire','device-retire-reconcile','pair-cancel','enroll-pending-list','enroll-resume','enroll-publish-ack']),
 RECIPIENT:Object.freeze(['enroll-start','enroll-draft-poll','enroll-relay-status','enroll-request-export','enroll-inspect-draft','enroll-approve','enroll-ack-export','enroll-finish']),
 OFFLINE_DRAFTS:Object.freeze(['draft-list','draft-save','draft-discard','draft-commit']),
});
export const routesFor=groups=>Object.freeze(groups.flatMap(g=>{check(Object.hasOwn(MD_ROUTE_GROUPS,g),'MD_ROUTE_GROUP');return MD_ROUTE_GROUPS[g];}));
const ownerOnly=new Set(['device-retire','device-retire-reconcile','pair-cancel','sync','acquire','release','reconcile','freeze','pair-begin','pair-request-poll','pair-publish-draft','pair-ack-poll','pair-relay-status','pair-relay-abort-unapproved','pair-inspect','pair-draft-export','pair-inspect-ack','pair-approve','pair-commit','pair-reconcile','pair-abort-expired','draft-commit']);
const HOLD_PHASES=['LOCAL_PUBLICATION_HOLD','REMOTE_COMMITTED_LOCAL_HOLD'];

// storage:   {profiles():Promise<[{id,...}]>, open(id,unlockSecret,ownerHandle|null):store, createEnrolled(material,opts,ownerHandle):store, enrolledId(material):id}
// ownership: {claim(id,{create}):Promise<null|{release():Promise,lost:Promise}>} (throws MD_LOCAL_OWNER_LOCK_UNAVAILABLE)
// policy:    {routes, localUnlockRequiresAuth, settings(view), relayClientPreflight?(), serverSync?}
export async function createMDBackend({surface,auth,transport,storage,ownership,policy,firstPrimary=null}){
 const routes=new Set(policy.routes);
 let service=null,recipient=null,recipientAck=null,controller=null,selected=null,localRole='NONE',owner=null,opening=false,closing=false,lastUnlockState=null;
 // Product freshness (visible state only; never used to authorize a write).
 let verified=false,lastOnlineFailure=null;
 const profiles=await storage.profiles();if(profiles.length===1)selected=profiles[0].id;
 const serviceAuth={accessToken:()=>auth.accessToken(),requireRecentMfa:()=>auth.requireRecentMfa(),clear:()=>{}};
 const makeService=store=>new SequentialService({store,material:store.material,auth:serviceAuth,transport:transport(store.material.identity,store.material.keyring),nativeGuard:firstPrimary?.guardFor(store)});
 const unlockState=()=>service?(localRole==='OWNER'?'ALREADY_UNLOCKED_OWNER':'ALREADY_UNLOCKED_FOLLOWER'):lastUnlockState??(profiles.length===0?'NO_LOCAL_PROFILE':!selected?'PROFILE_SELECTION_REQUIRED':'LOCKED_PROFILE_SELECTED');
 const drafts=()=>service?.store.drafts??null;
 function productState(active){
  if(!service)return {localCopy:'LOCKED',serverSync:policy.serverSync??'SERVER_ENCRYPTED_SYNC',freshness:null,drafts:0,lastOnlineFailure};
  const phase=active?.syncState,hold=HOLD_PHASES.includes(phase)||service.store.poisoned===true;
  const freshness=hold?'HOLD':service.pending?'UNKNOWN':verified?(active?.writeReady?'SYNCED_WRITE_READY':'SYNCED_VERIFIED_READ_ONLY'):'OFFLINE_STALE';
  return {localCopy:'LOCAL_ENCRYPTED_COPY',serverSync:policy.serverSync??'SERVER_ENCRYPTED_SYNC',freshness,pendingStatus:service.pending?.status??null,drafts:drafts()?.count??0,lastOnlineFailure,storeFormat:service.store.storeFormat??null};
 }
 const status=()=>{const active=service?.status();return {state:'LOCKED',profile:PROFILE,surface,auth:auth.status,profiles,selected,localRole,unlockState:unlockState(),...active,writeReady:!opening&&!closing&&localRole==='OWNER'&&active?.writeReady===true,capabilities:[...routes],...(firstPrimary?{firstPrimary:firstPrimary.status()}:{}),product:productState(active)};};
 const need=()=>{check(service,'MD_UNLOCK_REQUIRED');check(!service.store.state.sequentialSync.activation.nativeBootstrap||service.store.state.sequentialSync.activation.status==='ACTIVE','MD_PRIMARY_INCOMPLETE_HOLD');return service;};
 const needOwner=()=>{const active=need();check(!opening&&!closing&&localRole==='OWNER'&&owner,'MD_LOCAL_FOLLOWER_READ_ONLY');return active;};
 async function claimOwner(id,opts){
  const handle=await ownership.claim(id,opts);
  if(!handle)return false;
  localRole='OWNER';owner=handle;
  void handle.lost.then(()=>{if(owner===handle){owner=null;localRole='FOLLOWER';service?.suspend();}});
  return true;
 }
 async function dropOwner(){if(!owner)return;const handle=owner;owner=null;localRole='NONE';await handle.release();}
 async function unlockSelected(unlockSecret){
  check(!opening&&!closing,'MD_LOCAL_OWNER_CLOSING');opening=true;
  try{
   if(service&&localRole==='OWNER')check(false,'MD_ALREADY_UNLOCKED');
   check(profiles.length>0,'MD_NO_LOCAL_PROFILE');check(selected,'MD_PROFILE_SELECTION_REQUIRED');
   // BROWSER keeps the accepted S03 order (provider session first). APP_SHELL opens the local copy offline.
   if(policy.localUnlockRequiresAuth)await auth.accessToken();
   const hadFollower=!!service;
   const owned=await claimOwner(selected);
   if(hadFollower&&!owned)check(false,'MD_LOCAL_OWNER_BUSY');
   if(hadFollower){const old=service;service=null;try{await old.close();}catch(error){await dropOwner();closing=true;throw error;}}
   let store;
   try{store=await storage.open(selected,unlockSecret,owned?owner:null);check(!store.state.sequentialSync.activation.nativeBootstrap||store.state.sequentialSync.activation.status==='ACTIVE','MD_PRIMARY_RESUME_REQUIRED');service=makeService(store);localRole=owned?'OWNER':'FOLLOWER';lastUnlockState=null;verified=false;return status();}
   catch(error){await store?.close();if(owned)await dropOwner();else localRole='NONE';if(error.code==='MD_EXPLICIT_ENROLLMENT_REQUIRED'){lastUnlockState='LOCAL_RECORD_MISSING_OR_MISMATCH';check(false,'MD_LOCAL_RECORD_MISSING_OR_MISMATCH');}throw error;}
  }finally{opening=false;}
 }
 async function online(fn){try{const r=await fn();verified=true;lastOnlineFailure=null;return r;}catch(error){verified=false;lastOnlineFailure=typeof error?.code==='string'?error.code:'ONLINE_OPERATION_FAILED';throw error;}}
 function draftList(){
  const d=drafts();check(d,'MD_DRAFTS_UNAVAILABLE');const s=service.store.state.sequentialSync,phase=service.phase;
  return {drafts:d.list().map(x=>{const rid=x.body.requestId,receipt=s.receipts[rid];
   const draftStatus=s.pending?.intentId===rid?(phase==='REMOTE_COMMITTED_LOCAL_HOLD'?'REMOTE_COMMITTED_LOCAL_HOLD':s.pending.status==='DISPATCHED_UNKNOWN'?'DISPATCHED_UNKNOWN':'PREPARED_DURABLE'):receipt?.status==='COMMITTED'?'SERVER_COMMITTED':receipt?.status==='ABORTED'?'ABORTED_NOT_COMMITTED':'LOCAL_DRAFT';
   return {draftId:x.draftId,type:x.type,createdAt:x.createdAt,requestId:rid,status:draftStatus,committedHistory:false};})};
 }
 async function md(action,body){check(routes.has(action),'MD_ROUTE');
  if(firstPrimary&&action.startsWith('first-primary-')){
   if(action==='first-primary-status'){keys(body,[]);return firstPrimary.status();}
   check(!service&&!recipient&&!opening&&!closing,'MD_PRIMARY_COMPOSITION_BUSY');
   if(action==='first-primary-review')return firstPrimary.review(body);
   check(action==='first-primary-create'||action==='first-primary-resume','MD_ROUTE');opening=true;
   try{const result=await firstPrimary.run(body,action.endsWith('-create')?'CREATE':'RESUME');service=result.service;owner=result.owner;localRole='OWNER';selected=result.store.id;if(!profiles.some(x=>x.id===selected))profiles.push({id:selected});lastUnlockState=null;verified=true;return status();}finally{opening=false;}
  }
  if(firstPrimary&&['email','email-code','totp','handoff'].includes(action))firstPrimary.invalidate();
  if(firstPrimary&&action.startsWith('enroll-')&&firstPrimary.status().state==='RESERVED')check(false,'MD_PRIMARY_INCOMPLETE_HOLD');
  if(ownerOnly.has(action))needOwner();switch(action){
  case 'status':keys(body,[]);return status();
  case 'email':keys(body,['email']);return auth.requestEmailCode(body.email);
  case 'email-code':keys(body,['email','code']);return auth.verifyEmailCode(body.email,body.code);
  case 'totp-enroll':keys(body,[]);return auth.enrollTotp();
  case 'totp':keys(body,['factorId','code']);return auth.verifyTotp(body.factorId,body.code);
  case 'select-profile':keys(body,['id']);check(!service&&profiles.some(p=>p.id===body.id),'MD_PROFILE_SELECTION');selected=body.id;lastUnlockState=null;return status();
  case 'sync':keys(body,[]);return online(()=>need().sync());
  case 'acquire':keys(body,[]);return online(()=>need().acquire());
  case 'release':keys(body,[]);return need().release();
  case 'reconcile':keys(body,[]);return online(()=>need().reconcile());
  case 'freeze':keys(body,['freezeId','lostDeviceId','confirmed']);return need().freezeLostDevice(body);
  case 'suspend':keys(body,[]);if(localRole==='OWNER')need().suspend();return status();
  case 'handoff':{
   keys(body,[]);const active=needOwner();closing=true;
   try{controller?.close();controller=null;const result=await active.close();service=null;await dropOwner();closing=false;return {...status(),handoffStatus:result.status,handoffCode:result.code??null};}
   catch(error){service?.suspend();throw error;}
  }
  case 'relay-client-preflight':keys(body,[]);await auth.accessToken();check(typeof policy.relayClientPreflight==='function','MD_ROUTE');return policy.relayClientPreflight();
  case 'pair-relay-probe':{
   keys(body,[]);const active=need(),result=await transport(active.material.identity,active.material.keyring).relay('relayProbe');
   check(result.status==='RELAY_READY'&&result.schemaVersion===2,'RELAY_SERVER_SCHEMA');return result;
  }
  case 'pair-begin':keys(body,['confirmed']);controller??=new EnrollmentController(need(),transport(need().material.identity,need().material.keyring));return controller.begin(body);
  case 'pair-request-poll':keys(body,[]);check(controller,'PAIRING_REQUIRED');return controller.pollRequest();
  case 'pair-publish-draft':keys(body,[]);check(controller,'PAIRING_REQUIRED');return controller.publishDraft();
  case 'pair-ack-poll':keys(body,[]);check(controller,'PAIRING_REQUIRED');return controller.pollAckAndCommit();
  case 'pair-relay-status':keys(body,[]);check(controller,'PAIRING_REQUIRED');return controller.relayStatus();
  case 'pair-relay-abort-unapproved':keys(body,[]);check(controller,'PAIRING_REQUIRED');{const result=await controller.abortUnapproved();controller=null;return result;}
  case 'pair-inspect':keys(body,['requestText']);check(controller,'PAIRING_REQUIRED');return controller.inspect(body.requestText);
  case 'pair-draft-export':{
   keys(body,[]);const pending=need().store.state.sequentialSync.enrollment;
   check(pending?.draft&&!pending.approval&&Date.now()/1000<pending.draft.approval.expiresAt,'MD_DRAFT_EXPORT_STATE');
   return {text:JSON.stringify(pending.draft)};
  }
  case 'pair-inspect-ack':check(controller,'PAIRING_REQUIRED');return controller.inspectAck(body);
  case 'pair-approve':keys(body,['requestText','fingerprint','confirmed']);check(controller,'PAIRING_REQUIRED');return controller.approve(body);
  case 'pair-commit':check(controller,'PAIRING_REQUIRED');return controller.commit(body);
  case 'pair-reconcile':keys(body,[]);controller??=new EnrollmentController(need(),transport(need().material.identity,need().material.keyring));return controller.reconcile();
  case 'pair-diagnostic':{
   keys(body,[]);const evidence=need().evidence(),state=evidence.state,sync=state.sequentialSync,pending=sync.enrollment;
   const lastEvent=state.roster.events.at(-1),member=lastEvent?.body.member,claim=pending?.pairSessionId?state.pairingClaims[pending.pairSessionId]:null;
   const approval=pending?.draft?.approval;
   return {localCheckpoint:evidence.checkpoint,phase:evidence.phase,verified:sync.verified,access:sync.access,
    writeIntentPending:!!sync.pending,localRoster:{eventCount:state.roster.events.length,epoch:lastEvent?.body.epoch??state.roster.genesis.body.epoch,
     head:fingerprint(lastEvent??state.roster.genesis),lastMemberDeviceId:member?.deviceId??null,lastMemberFingerprint:member?fingerprint(member):null},
    enrollment:pending?{status:pending.status,pairSessionId:pending.pairSessionId??null,requestDigest:pending.requestDigest??null,
     claimStatus:claim?.status??null,approvalId:approval?.approvalId??null,expiresAt:approval?.expiresAt??null,
     hasDraft:!!pending.draft,hasAck:!!pending.approval}:null};
  }
  case 'pair-abort-expired':keys(body,[]);controller??=new EnrollmentController(need(),transport(need().material.identity,need().material.keyring));return controller.reconcile({decision:'EXPIRE',reason:'EXPIRED'});
  case 'lifecycle-state':keys(body,[]);return need().lifecycleCall('getLifecycleState');
  case 'device-retire':keys(body,['targetDeviceId','targetFingerprint','reason','confirmed']);return needOwner().retireDevice(body);
  case 'device-retire-reconcile':keys(body,['intentId']);return needOwner().reconcileRetirement(body.intentId);
  case 'pair-cancel':keys(body,['confirmed']);check(body.confirmed===true,'B4_EXPLICIT_CANCEL');controller??=new EnrollmentController(need(),transport(need().material.identity,need().material.keyring));return controller.reconcile({decision:'ABORT',reason:'USER_CANCEL'});
  case 'enroll-pending-list':keys(body,[]);check(storage.pending,'B4_DURABLE_RECIPIENT_REQUIRED');return {sessions:await storage.pending.list()};
  case 'enroll-resume':keys(body,['pairSessionId','unlockSecret']);check(!service&&!recipient&&!selected,'MD_NEW_DEVICE_REQUIRED');await auth.accessToken();recipient=await EnrollmentRecipient.resume({persistence:storage.pending,unlockSecret:body.unlockSecret,transportFactory:transport,pairSessionId:body.pairSessionId});recipientAck=recipient.pendingAck;return {...recipient.request,relay:recipient.relayEnabled,ackReady:!!recipientAck};
  case 'enroll-publish-ack':keys(body,[]);check(recipient,'PAIRING_REQUIRED');recipientAck=await recipient.publishAck();return recipientAck;
  case 'enroll-start':keys(body,['pairingText','unlockSecret']);check(!service&&!recipient&&!selected,'MD_NEW_DEVICE_REQUIRED');await auth.accessToken();recipient=await EnrollmentRecipient.create(body.pairingText,{transportFactory:transport,persistence:storage.pending,unlockSecret:body.unlockSecret});recipientAck=null;return {...recipient.request,relay:recipient.relayEnabled};
  case 'enroll-draft-poll':keys(body,[]);check(recipient?.relayEnabled,'RELAY_PAIRING_REQUIRED');return recipient.pollDraft();
  case 'enroll-relay-status':keys(body,[]);check(recipient?.relayEnabled,'RELAY_PAIRING_REQUIRED');return recipient.relayStatus();
  case 'enroll-request-export':keys(body,[]);check(recipient&&!recipientAck,'MD_REQUEST_EXPORT_STATE');return {text:recipient.request.requestText};
  case 'enroll-inspect-draft':keys(body,['draft']);check(recipient&&!recipientAck,'PAIRING_REQUIRED');return recipient.inspectApproval(body.draft,{confirmed:true,fingerprint:recipient.request.fingerprint,preview:true});
  case 'enroll-approve':keys(body,['draft','confirmed','fingerprint']);check(recipient,'PAIRING_REQUIRED');recipientAck=await recipient.inspectApproval(recipient.relayEnabled?recipient.relayDraft:body.draft,body);return recipientAck;
  case 'enroll-ack-export':keys(body,[]);check(recipient&&recipientAck,'MD_ACK_EXPORT_STATE');return {text:JSON.stringify(recipientAck)};
  case 'enroll-finish':{
   keys(body,['unlockSecret']);check(recipient,'PAIRING_REQUIRED');check(typeof body.unlockSecret==='string'&&body.unlockSecret.isWellFormed()&&body.unlockSecret.length>=12&&body.unlockSecret.length<=1024,'UNLOCK_SECRET_PROFILE');const result=await recipient.finalize({transportFactory:transport});
   const newId=storage.enrolledId(result.material);
   check(await claimOwner(newId,{create:true}),'MD_LOCAL_OWNER_BUSY');let store;
   try{store=await storage.createEnrolled(result.material,{unlockSecret:body.unlockSecret,rollbackFloor:result.rollbackFloor,recoveryArtifactSha256:result.recoveryArtifactSha256},owner);service=makeService(store);}
   catch(error){await store?.close();await dropOwner();throw error;}
   selected=store.id;profiles.push({id:store.id,accountId:result.material.keyring.accountId,vaultId:result.material.keyring.vaultId,deviceId:result.material.identity.public.deviceId,generation:store.checkpoint.generation});lastUnlockState=null;
   recipient.close();recipient=null;recipientAck=null;await service.sync();verified=true;return status();
  }
  // Offline drafts: sealed local capture only. Never part of committed history, projections, XP or HOUSE.
  case 'draft-list':keys(body,[]);need();return draftList();
  case 'draft-save':{
   keys(body,['type','body']);const active=need();check(!opening&&!closing&&localRole==='OWNER'&&owner,'MD_LOCAL_FOLLOWER_READ_ONLY');check(drafts(),'MD_DRAFTS_UNAVAILABLE');
   check(['RECORD','ENTITY','CORRECTION'].includes(body.type),'MD_DRAFT_TYPE');normalizeCommand(body.body,body.type);
   check(!active.store.state.sequentialSync.receipts[body.body.requestId]&&!active.store.state.userApp.operations.some(op=>op.provenance.requestId===body.body.requestId),'MD_DRAFT_REQUEST_ALREADY_TERMINAL');
   return {...await drafts().save({type:body.type,body:body.body}),committedHistory:false};
  }
  case 'draft-discard':{keys(body,['draftId','confirmed']);check(body.confirmed===true,'MD_EXPLICIT_DRAFT_DISCARD');need();check(!opening&&!closing&&localRole==='OWNER'&&owner,'MD_LOCAL_FOLLOWER_READ_ONLY');check(drafts(),'MD_DRAFTS_UNAVAILABLE');return drafts().discard(body.draftId);}
  // Explicit owner approval converts one draft through the NORMAL online path (lease, CAS, receipt).
  // The draft keeps its original requestId, so a retry after DISPATCHED_UNKNOWN or a crash after the
  // server receipt converges on the same intent and never appends twice.
  case 'draft-commit':{
   keys(body,['draftId','confirmed']);check(body.confirmed===true,'MD_EXPLICIT_DRAFT_APPROVAL');const active=needOwner();check(drafts(),'MD_DRAFTS_UNAVAILABLE');
   const d=drafts().get(body.draftId);const result=await online(()=>active.write(d.body,d.type));
   check(result.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED','MD_DRAFT_COMMIT_UNCONFIRMED');
   const settled=await drafts().settle(body.draftId,d.body.requestId);return {...result,draftId:body.draftId,draftStatus:settled.status};
  }
  default:check(false,'MD_ROUTE');
 }}
 async function request(path,body){
  if(path==='/api/session/bootstrap'){keys(body,[]);return {session:null,state:status()};}
  if(path.startsWith('/api/md/'))return md(path.slice('/api/md/'.length),body??{});
  if(path==='/api/vault/unlock'){keys(body,['unlockSecret']);return unlockSelected(body.unlockSecret);}
  if(path==='/api/today')return need().today();if(path==='/api/history')return need().history();if(path==='/api/calendar-view')return need().calendar(body);
  if(path==='/api/whole-life'){const view=need().view();view.settings={...view.settings,...policy.settings(view)};return view;}
  if(path.startsWith('/api/command/'))return need().command(path.slice('/api/command/'.length));
  if(path==='/api/action-record')return needOwner().write(body,'RECORD');if(path==='/api/entity')return needOwner().write(body,'ENTITY');if(path==='/api/correction')return needOwner().write(body,'CORRECTION');
  if(path==='/api/shutdown'){keys(body,[]);closing=true;controller?.close();recipient?.close();const result=service?await service.close():{status:'CLOSED'};service=null;await dropOwner();await firstPrimary?.close();auth.clear();return result;}
  check(false,'MD_WINDOWS_RECOVERY_REQUIRED');
 }
 const suspend=()=>{if(localRole==='OWNER')service?.suspend();};
 return {backend:Object.freeze({format:'LB_MD_UI_BACKEND_1',request}),suspend};
}
