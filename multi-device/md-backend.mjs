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
import {check,keys,fingerprint,randomId,sha,encode} from '../core/package/src/codec.mjs';
import {SequentialService} from './sequential-service.mjs';
import {EnrollmentController,EnrollmentRecipient} from './enrollment-controller.mjs';
import {Roster} from '../core/package/src/enrollment.mjs';
import {PROFILE,same} from './contracts.mjs';
import {normalizeCommand} from '../user-app/action-model.mjs';
import {entityKey} from '../user-app/whole-life-model.mjs';
import {validateLifeData} from '../user-app/public/life-model.mjs';
import {rebaseRecord,stable} from '../user-app/public/life-rebase.mjs';   // FIX54: 순수 모듈(DOM·브라우저 전역 없음, life-model만 import)

export const MD_ROUTE_GROUPS=Object.freeze({
 CORE:Object.freeze(['status','email','email-code','totp','totp-factors','select-profile','sync','acquire','release','reconcile','suspend','handoff']),
 TOTP_ENROLL:Object.freeze(['totp-enroll']),
 FREEZE:Object.freeze(['freeze']),
 RELAY_CLIENT_PREFLIGHT:Object.freeze(['relay-client-preflight']),
 SPONSOR:Object.freeze(['pair-relay-probe','pair-begin','pair-request-poll','pair-publish-draft','pair-ack-poll','pair-relay-status','pair-relay-abort-unapproved','pair-inspect','pair-draft-export','pair-inspect-ack','pair-approve','pair-commit','pair-reconcile','pair-diagnostic','pair-abort-expired']),
 LIFECYCLE:Object.freeze(['lifecycle-state','device-retire','device-retire-reconcile','pair-cancel','enroll-pending-list','enroll-resume','enroll-publish-ack']),
 RECIPIENT:Object.freeze(['enroll-start','enroll-draft-poll','enroll-relay-status','enroll-request-export','enroll-inspect-draft','enroll-approve','enroll-ack-export','enroll-finish']),
 OFFLINE_DRAFTS:Object.freeze(['draft-list','draft-save','draft-discard','draft-commit']),
 SIGNOUT:Object.freeze(['signout']),
});
export const routesFor=groups=>Object.freeze(groups.flatMap(g=>{check(Object.hasOwn(MD_ROUTE_GROUPS,g),'MD_ROUTE_GROUP');return MD_ROUTE_GROUPS[g];}));
const ownerOnly=new Set(['device-retire','device-retire-reconcile','pair-cancel','sync','acquire','release','reconcile','freeze','pair-begin','pair-request-poll','pair-publish-draft','pair-ack-poll','pair-relay-status','pair-relay-abort-unapproved','pair-inspect','pair-draft-export','pair-inspect-ack','pair-approve','pair-commit','pair-reconcile','pair-abort-expired','draft-commit']);
const HOLD_PHASES=['LOCAL_PUBLICATION_HOLD','REMOTE_COMMITTED_LOCAL_HOLD'];

// storage:   {profiles():Promise<[{id,...}]>, open(id,unlockSecret,ownerHandle|null):store, createEnrolled(material,opts,ownerHandle):store, enrolledId(material):id}
// ownership: {claim(id,{create}):Promise<null|{release():Promise,lost:Promise}>} (throws MD_LOCAL_OWNER_LOCK_UNAVAILABLE)
// policy:    {routes, localUnlockRequiresAuth, settings(view), relayClientPreflight?(), serverSync?}
// signoutWatch (S1, browser only): {generation():Promise<int>, subscribe?(fn(generation)):unsubscribe} over the origin's sign-out marker.
//   A higher generation than this backend last saw means another tab signed this device out: before the next request (and at once when
//   subscribe() delivers it) this tab closes its vault like a sign-out (pending/lease rules of service.close() unchanged, nothing deleted),
//   drops the in-memory login and answers MD_SIGNED_OUT_ELSEWHERE until a new unlock. onSignedOutElsewhere() is told after each such close.
//   S1c: with state():Promise<{generation,id}> the random marker id is compared too, so any marker this backend has not seen closes it, even one
//   with a lower generation (the marker store was reset or restored). A broadcast only makes the backend read the marker again; one that arrives
//   while this tab is opening or closing is held and checked when that finishes, and an unlock re-reads the marker before it reports UNLOCKED.
export async function createMDBackend({surface,auth,transport,storage,ownership,policy,firstPrimary=null,signoutWatch=null,onSignedOutElsewhere=null}){
 const routes=new Set(policy.routes);
 let service=null,recipient=null,recipientAck=null,controller=null,selected=null,localRole='NONE',owner=null,opening=false,closing=false,lastUnlockState=null;
 // Product freshness (visible state only; never used to authorize a write).
 let verified=false,lastOnlineFailure=null;
 // S1: sign-out marker last seen by this backend ({generation,id}, undefined until the first successful read) and the result of a close caused by another tab.
 // S1c: heldSignout = a broadcast arrived while this tab was opening/closing; it is checked once that has finished.
 let seenMarker,signedOutElsewhere=null,heldSignout=false;
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
 // F10-1: the owner handle's housekeeping result (stage files removed/failed) stays visible even if the open fails.
 let lastHousekeeping=null;
 const status=()=>{const active=service?.status();return {state:'LOCKED',profile:PROFILE,surface,auth:auth.status,profiles,selected,localRole,unlockState:unlockState(),...active,writeReady:!opening&&!closing&&localRole==='OWNER'&&active?.writeReady===true,capabilities:[...routes],...(firstPrimary?{firstPrimary:firstPrimary.status()}:{}),product:productState(active),...(lastHousekeeping?{housekeeping:lastHousekeeping}:{}),...(signedOutElsewhere&&!service?{signOut:'SIGNED_OUT_ELSEWHERE',closeStatus:signedOutElsewhere.status,closeCode:signedOutElsewhere.code}:{})};};
 const need=()=>{check(service,signedOutElsewhere?'MD_SIGNED_OUT_ELSEWHERE':'MD_UNLOCK_REQUIRED');check(!service.store.state.sequentialSync.activation.nativeBootstrap||service.store.state.sequentialSync.activation.status==='ACTIVE','MD_PRIMARY_INCOMPLETE_HOLD');return service;};
 const needOwner=()=>{const active=need();check(!opening&&!closing&&localRole==='OWNER'&&owner,'MD_LOCAL_FOLLOWER_READ_ONLY');return active;};
 async function claimOwner(id,opts){
  const handle=await ownership.claim(id,opts);
  if(!handle)return false;
  localRole='OWNER';owner=handle;lastHousekeeping=handle.housekeeping??null;
  void handle.lost.then(()=>{if(owner===handle){owner=null;localRole='FOLLOWER';service?.suspend();}});
  return true;
 }
 async function dropOwner(){if(!owner)return;const handle=owner;owner=null;localRole='NONE';lastHousekeeping=null;await handle.release();}
 async function unlockSelected(unlockSecret){
  check(!opening&&!closing,'MD_LOCAL_OWNER_CLOSING');opening=true;let lateSignout=null;
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
   try{store=await storage.open(selected,unlockSecret,owned?owner:null);check(!store.state.sequentialSync.activation.nativeBootstrap||store.state.sequentialSync.activation.status==='ACTIVE','MD_PRIMARY_RESUME_REQUIRED');
    // S1c (H7-03): another tab may have signed out while the store was opening (its broadcast was held, or never came). Read the marker again
    // before reporting UNLOCKED; a change closes this attempt like a sign-out (store closed, owner lock released, memory login dropped).
    if(signoutWatch){const marker=await readMarker();if(seenMarker!==undefined&&markerChanged(marker)){lateSignout=marker;check(false,'MD_SIGNED_OUT_ELSEWHERE');}}
    service=makeService(store);localRole=owned?'OWNER':'FOLLOWER';lastUnlockState=null;verified=false;signedOutElsewhere=null;return status();}
   catch(error){await store?.close();if(owned)await dropOwner();else localRole='NONE';if(error.code==='MD_EXPLICIT_ENROLLMENT_REQUIRED'){lastUnlockState='LOCAL_RECORD_MISSING_OR_MISMATCH';check(false,'MD_LOCAL_RECORD_MISSING_OR_MISMATCH');}throw error;}
  }finally{opening=false;if(lateSignout)await closeForSignout(lateSignout);else settleHeld();}
 }
 async function onlyTotpFactor(){check(typeof auth.factors==='function','TOTP_FACTOR_REQUIRED');const list=await auth.factors();check(Array.isArray(list)&&list.length>0,'TOTP_FACTOR_NONE');check(list.length===1,'TOTP_FACTOR_AMBIGUOUS');return list[0].id;}
 async function online(fn){try{const r=await fn();verified=true;lastOnlineFailure=null;return r;}catch(error){verified=false;lastOnlineFailure=typeof error?.code==='string'?error.code:'ONLINE_OPERATION_FAILED';throw error;}}
 // FIX53A: 새 기록(주간 리뷰·목표·모의고사·칭호) 초안은 기록 종류와 id(주 월요일·시험 id)만 돌려준다. 값(본문)은 싣지 않는다.
 // 앱이 같은 기록의 옛 봉인 초안을 찾아 새 봉인으로 대신하고(HUNT52 HQ2), 임시 저장 줄을 구별해 보이는 데 쓴다.
 const SEALED_RECORD_TYPES=['WEEK_REVIEW','PLAN_GOAL','EXAM_RESULT','GAME_PROFILE'];
 function draftList(){
  const d=drafts();check(d,'MD_DRAFTS_UNAVAILABLE');const s=service.store.state.sequentialSync,phase=service.phase;
  return {drafts:d.list().map(x=>{const rid=x.body.requestId,mid=mergeWrites.get(x.draftId),live=mid&&(s.pending?.intentId===mid||s.receipts[mid]?.status==='COMMITTED')?mid:pendingOnSealed(s,x)?s.pending.intentId:rid,receipt=s.receipts[live];   // FIX58Q (HQ7): 병합 쓰기가 결과 모름·쌓임이면 그 상태를 보인다(원래 길과 같게 폐기 단추 숨김). FIX59Q (HQ57-1): 재시작으로 잊었어도 결과 모르는 쓰기가 이 기록을 쓰면 그 상태
   const draftStatus=s.pending?.intentId===live?(phase==='REMOTE_COMMITTED_LOCAL_HOLD'?'REMOTE_COMMITTED_LOCAL_HOLD':s.pending.status==='DISPATCHED_UNKNOWN'?'DISPATCHED_UNKNOWN':'PREPARED_DURABLE'):receipt?.status==='COMMITTED'?'SERVER_COMMITTED':receipt?.status==='ABORTED'?'ABORTED_NOT_COMMITTED':'LOCAL_DRAFT';
   return {draftId:x.draftId,type:x.type,createdAt:x.createdAt,requestId:rid,status:draftStatus,committedHistory:false,...(x.type==='ENTITY'&&['HLT_DAY','STUDY_DAY'].includes(x.body?.entityType)?{body:x.body}:{}),
    ...(x.type==='ENTITY'&&SEALED_RECORD_TYPES.includes(x.body?.entityType)?{entity:{type:x.body.entityType,id:x.body.entityId}}:{}),
    ...(preUpdateDraft(x)?{preUpdate:true}:{}),...(sealedConflicts.has(x.draftId)?{conflict:sealedConflicts.get(x.draftId)}:{})};})};   // B3: 건강 카드 초안은 앱을 다시 열었을 때 이어서 편집·rebase하도록 본문(내 카드+base heads)을 함께 돌려준다. 다른 종류는 요약만.
 }
 // FIX54 (HUNT52 HQ3): 주간 리뷰·목표·모의고사 봉인 초안은 봉인 때 금고 값(sealBase = 초안 expectedHeads 판의 값, 없으면 null)을 초안 body 안에 함께 둔다(암호문 저널 안, draft-list로 나가지 않음).
 // 승인 때 그 사이 금고가 바뀌었으면 sealBase·초안 값·금고 최신으로 3자 병합해 새 요청으로 쓴다. 같은 칸을 양쪽이 다르게 바꿨으면 쓰지 않고 초안을 남긴다(SEALED_CONFLICT, 이 실행 동안 목록에 표시).
 const SEAL_BASE_TYPES=['WEEK_REVIEW','PLAN_GOAL','EXAM_RESULT'];
 const sealedConflicts=new Map();   // draftId → 'SEALED_CONFLICT' | 'SEALED_MAYBE_APPLIED' (이 실행 동안만, 버리기만)
 // FIX58Q (HUNT55 HQ7·HQ8): 병합 쓰기는 새 requestId라 초안 body의 requestId와 이어지지 않는다. 그 requestId를 초안에 이어 이 실행 동안 기억한다(저널 형식 그대로).
 // 목록 상태와 "이미 쌓였나" 판단은 원래 requestId 또는 이어진 병합 requestId를 본다. 재시작으로 기억이 사라지면 금고 이력으로 판단한다(appliedBefore).
 const mergeWrites=new Map();
 // FIX58Q (HUNT55 HU2): 업데이트 전(r52) 빌드가 만든 봉인 초안 = 세 종류인데 sealBase가 없다. 병합할 기준이 없어 금고가 바뀌면 원래 길이 STALE_HEADS로 계속 거절된다.
 const preUpdateDraft=x=>x.type==='ENTITY'&&SEAL_BASE_TYPES.includes(x.body?.entityType)&&!Object.hasOwn(x.body,'sealBase');
 const committedRid=(s,rid)=>s.userApp.operations.some(op=>op.provenance.requestId===rid)||s.sequentialSync.receipts[rid]?.status==='COMMITTED';
 // FIX59Q (HUNT57 HQ57-1): 병합 쓰기 기억(mergeWrites)은 메모리라 재시작 뒤에는 결과 모르는 쓰기가 어느 초안의 것인지 모른다(저널 형식은 그대로 둔다).
 // 결과 모르는 쓰기(PREPARED·DISPATCHED_UNKNOWN·REMOTE_COMMITTED_LOCAL_HOLD, 로컬 상태에 남는 그 연산)가 봉인 초안의 기록을 쓰면 = 그 초안의 병합 쓰기일 수 있다.
 // 그동안 그 줄은 결과 모름 상태로 보이고 폐기를 거절한다(초안 보존). 연산의 칸을 읽지 못하면 모든 봉인 초안을 그렇게 본다. 결과가 정해지면(pending 없음) 원래 규칙.
 function pendingOnSealed(s,x){
  const p=s.pending;if(!p||x.type!=='ENTITY'||!SEAL_BASE_TYPES.includes(x.body?.entityType))return false;
  const edits=p.op?.edits,key=entityKey(x.body.entityType,x.body.entityId);
  return !Array.isArray(edits)||edits.some(e=>e?.id===key);
 }
 // FIX59Q (HUNT57 HQ57-3): 초안의 기준(expectedHeads) 이후의 판만 본다. 기준 판과 그 조상(이 초안이 봉인 때 이미 본 값)은 빼서, 옛 판 값과 우연히 같아 "이미 반영"으로 보지 않는다.
 function revisionsAfter(graph,key,heads){
  const seen=new Set(),queue=[...heads];
  while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);const r=graph.revision(id);if(r)queue.push(...r.parents);}
  return graph.revisions().filter(r=>r.id===key&&!seen.has(r.revisionId));
 }
 // 금고 이력에서 초안 기준 이후의 어느 한 판 위에 이 초안을 다시 얹었을 때 ALREADY_APPLIED·알림 0이면, 이 초안의 값은 한 번 금고에 들어갔었다(그 뒤 다른 저장이 같은 칸을 바꿈).
 function appliedBefore(graph,cmd,sealBase){
  for(const r of revisionsAfter(graph,entityKey(cmd.entityType,cmd.entityId),cmd.expectedHeads)){
   if(!r.value?.data)continue;
   const rb=rebaseRecord(cmd.entityType,{id:cmd.entityId,base:sealBase,mine:cmd.data,latest:r.value.data});
   if(rb.status==='ALREADY_APPLIED'&&!rb.notices.length)return true;
  }
  return false;
 }
 // FIX59Q (HUNT57 HU57-1): 업데이트 전 초안(sealBase 없음)의 기준값 = 초안 expectedHeads 판의 금고 값(금고 이력에 남아 있음). 금고에 없던 기록(heads 0)이면 null.
 // 판이 여럿(충돌 중)·이력에 없음·지운 판·형식이 맞지 않음이면 기준을 못 구한다(undefined).
 function preUpdateBase(graph,b){
  if(b.expectedHeads.length===0)return null;
  if(b.expectedHeads.length!==1)return undefined;
  const r=graph.revision(b.expectedHeads[0]);
  if(!r||r.id!==entityKey(b.entityType,b.entityId)||!r.value?.data)return undefined;
  try{validateLifeData(b.entityType,b.entityId,r.value.data);}catch{return undefined;}
  return r.value.data;
 }
 // FIX59Q (HU57-2·HQ57-2): 사용자가 고를 수 있는 충돌(이 실행 동안만). 'NO_BASE' = 기준을 못 구한 업데이트 전 초안, 'DATE' = 금고에 없던 시험의 응시일만 다름.
 // 이 줄은 [그대로 적용](draft-commit apply)으로 초안 값을 쓸 수 있다. 바뀔 칸은 승인 응답(draftFields)에만 싣는다(draft-list에는 싣지 않음, FIX49-P10·FIX54-8 경계).
 // FIX60Q (HUNT58 Q58-2·2b·HU58-1): 'SELF' = 업데이트 전 초안의 같은 칸 충돌인데 기준 이후 금고를 바꾼 것 중 이 기기(같은 기기의 이전 입력)가 있음(FIX60Q2: 다른 기기 변경이 섞여도 포함, mixedInput. FIX61Q: sealBase 있는 봉인 초안도).
 // 고를 때 보인 금고 heads를 함께 둔다. [그대로 적용] 때 heads가 다르면 쓰지 않고 지금 값으로 다시 고르게 한다. 응답에는 바뀔 칸의 지금 기록 값(currentFields)도 싣는다(이 응답에만).
 const sealedChoices=new Map();   // draftId → {kind, base(병합 기준값), extra(응답 표시), heads(고를 때 금고 heads)}
 const changedFields=(data,cur)=>Object.keys(data).filter(k=>stable(data[k])!==stable(cur?.[k]??null)).map(k=>({field:k,value:structuredClone(data[k])}));
 function chooseResult(draftId,{kind,base=null,extra={}},data,ent){
  const cur=ent.value?.data??null,draftFields=changedFields(data,cur);
  sealedConflicts.set(draftId,'SEALED_CONFLICT');sealedChoices.set(draftId,{kind,base,extra,heads:stable(ent.heads)});
  return {status:'SEALED_CONFLICT',draftId,draftStatus:'LOCAL_DRAFT_KEPT',committedHistory:false,...extra,choose:true,draftFields,currentFields:draftFields.map(f=>({field:f.field,value:structuredClone(cur?.[f.field]??null)}))};
 }
 // FIX60Q (HU58-1)·FIX60Q2: 초안 기준 이후 이 기록의 판 중 이 기기가 쓴 것이 있는가. 모두 이 기기 것이면 'SELF', 다른 기기 판이 섞여 있으면 'MIXED', 이 기기 판이 하나도 없으면 null(순수 다른 기기 충돌 = 지금 규칙, 버리기만).
 // "이 기기가 쓴 판" = 이 저장소의 쓰기 영수증(COMMITTED)이 있는 요청의 판. 영수증은 이 저장소가 보낸 쓰기에만 생기고(sequential-service publish) 저장소에 남아 재시작 뒤에도 같다.
 const ownSince=(active,cmd)=>{const s=active.store.state.sequentialSync,after=revisionsAfter(active.store.graph,entityKey(cmd.entityType,cmd.entityId),cmd.expectedHeads),own=after.filter(r=>s.receipts[r.provenance?.requestId]?.status==='COMMITTED').length;return own===0?null:own===after.length?'SELF':'MIXED';};
 function checkSealBase(type,b,sealBase){
  check(type==='ENTITY'&&SEAL_BASE_TYPES.includes(b.entityType)&&(b.expectedHeads.length===0)===(sealBase===null),'MD_DRAFT_SEAL_BASE');
  if(sealBase!==null)try{validateLifeData(b.entityType,b.entityId,sealBase);}catch{check(false,'MD_DRAFT_SEAL_BASE');}
 }
 // 원래 요청이 이미 쌓였거나(같은 requestId로 수렴) 금고가 초안의 expectedHeads 그대로면 null(원래 길). 아니면 병합 결과를 돌려준다.
 // 병합 결과가 금고와 같으면 이미 반영된 것으로 보고 초안을 정리한다: 병합 쓰기는 새 requestId라 영수증 대신 값 비교로 수렴한다(그 쓰기 뒤 초안 정리 전에 끊겨도 다시 승인하면 여기서 정리된다).
 // FIX59Q (HU57-1): 업데이트 전 초안도 기준값(preUpdateBase)을 sealBase로 넣어 여기서 같은 병합을 한다(old=true: 충돌 응답에 preUpdate 표시).
 async function commitSealed(active,box,draftId,d,old=false){
  const {sealBase,...cmd}=d.body,s=active.store.state,mark=old?{preUpdate:true}:{};
  const cur=active.store.graph.entity('NOTE',entityKey(cmd.entityType,cmd.entityId));
  if(s.userApp.operations.some(op=>op.provenance.requestId===cmd.requestId)||!s.sequentialSync.receipts[cmd.requestId]&&stable(cur.heads)===stable(cmd.expectedHeads))return null;
  const mid=mergeWrites.get(draftId);
  check(!mid||s.sequentialSync.pending?.intentId!==mid,'MD_PENDING_RECONCILE_REQUIRED');   // 이어진 병합 쓰기의 결과를 모르면 결과 확인이 먼저다(두 번 쓰기 0)
  if(mid&&committedRid(s,mid)){sealedConflicts.delete(draftId);await box.discard(draftId);mergeWrites.delete(draftId);return {status:'ALREADY_APPLIED',draftId,draftStatus:'DISCARDED',committedHistory:false};}   // HQ8: 병합 쓰기가 이미 쌓임(그 뒤 같은 칸이 바뀌었어도 충돌 아님)
  check(active.status().writeReady===true,'MD_NOT_WRITE_READY');   // 금고 최신(쓰기 권한을 받은 때의 값)과 비교한다
  const rb=rebaseRecord(cmd.entityType,{id:cmd.entityId,base:sealBase,mine:cmd.data,latest:cur.value?.data??null});
  if(rb.notices.length){   // 알림 값(상대·내 값)은 돌려주지 않는다
   const kind=appliedBefore(active.store.graph,cmd,sealBase)?'SEALED_MAYBE_APPLIED':'SEALED_CONFLICT';   // 재시작 뒤 HQ8: 이 초안 값이 한 번 들어갔던 금고면 "승인하지 못했어요"가 아니다
   // FIX59Q (HQ57-2): 금고에 없던 시험의 응시일만 다르면 쓰지 않고(초안 보존) 사용자가 고른다: [그대로 적용] = 점수 병합 + 내 응시일, [버리기] = 금고 응시일
   if(kind==='SEALED_CONFLICT'&&cmd.entityType==='EXAM_RESULT'&&sealBase===null&&rb.status==='MERGED'&&rb.notices.every(n=>n.code==='RECORD_DATE_OVERWRITTEN'))return chooseResult(draftId,{kind:'DATE',base:null,extra:mark},rb.data,cur);
   // FIX60Q (HU58-1): 업데이트 전 초안의 같은 칸 충돌을 만든 것이 이 기기의 이전 입력뿐이면(r52 같은 시트 두 번 봉인 등) 버리기만이 아니라 고르기: [그대로 적용] = 병합 + 이 초안 값
   // FIX60Q2: 이 기기 판이 하나라도 있으면 고르기(다른 기기 판이 섞이면 mixedInput도 표시, 응답에 지금 기록 값이 보이므로 덮어쓰기는 본 뒤에만)
   // FIX61Q (HUNT59 Q59-S15): sealBase 있는 봉인 초안도 같다(같은 기록 봉인 두 줄을 위부터 승인 → 마지막 입력이 버리기만 남지 않게). 순수 다른 기기 충돌은 그대로
   const own=kind==='SEALED_CONFLICT'&&rb.status==='MERGED'?ownSince(active,cmd):null;
   if(own)return chooseResult(draftId,{kind:'SELF',base:sealBase,extra:{...mark,previousInput:true,...(own==='MIXED'?{mixedInput:true}:{})}},rb.data,cur);
   sealedConflicts.set(draftId,kind);return {status:kind,draftId,draftStatus:'LOCAL_DRAFT_KEPT',committedHistory:false,...mark};
  }
  check(rb.status!=='REJECTED',rb.code);
  sealedConflicts.delete(draftId);sealedChoices.delete(draftId);
  if(rb.status==='ALREADY_APPLIED'){await box.discard(draftId);mergeWrites.delete(draftId);return {status:'ALREADY_APPLIED',draftId,draftStatus:'DISCARDED',committedHistory:false};}
  return writeFor(active,box,draftId,cmd,cur,rb.data,{merged:true});
 }
 // 병합·[그대로 적용] 쓰기: 지금 금고 heads 위에 새 requestId로 한 번 쓴다.
 async function writeFor(active,box,draftId,cmd,cur,data,tag){
  const command={type:'ENTITY',entityType:cmd.entityType,entityId:cmd.entityId,expectedHeads:[...cur.heads],data,reason:cmd.reason.trim(),confirmed:cmd.confirmed};
  const requestId=randomId();mergeWrites.set(draftId,requestId);   // 보내기 전에 잇는다: 보내다 끊겨도 목록·다시 승인이 이 쓰기를 본다
  const {type,...rest}=command,result=await online(()=>active.write({requestId,commandDigest:sha(encode(command)),...rest},type));
  check(result.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED','MD_DRAFT_COMMIT_UNCONFIRMED');
  if(service!==active||closing)return {...result,draftId,draftStatus:'LOCAL_DRAFT_KEPT',draftSettled:false,...tag};   // 다시 승인하면 값 비교로 정리된다
  await box.discard(draftId);mergeWrites.delete(draftId);return {...result,draftId,draftStatus:'SERVER_COMMITTED',...tag};
 }
 // FIX59Q: 사용자가 [그대로 적용]을 고름(이 실행에서 고를 수 있는 충돌로 표시된 줄만). 결과 모르는 쓰기가 있으면 결과 확인이 먼저다.
 async function applyChosen(active,box,draftId,d){
  const choice=sealedChoices.get(draftId),s=active.store.state;check(choice,'MD_DRAFT_APPLY_STATE');
  const {sealBase,...cmd}=d.body,mid=mergeWrites.get(draftId);
  check(!s.sequentialSync.pending,'MD_PENDING_RECONCILE_REQUIRED');
  if(mid&&committedRid(s,mid)){sealedConflicts.delete(draftId);sealedChoices.delete(draftId);await box.discard(draftId);mergeWrites.delete(draftId);return {status:'ALREADY_APPLIED',draftId,draftStatus:'DISCARDED',committedHistory:false};}
  check(active.status().writeReady===true,'MD_NOT_WRITE_READY');
  const cur=active.store.graph.entity('NOTE',entityKey(cmd.entityType,cmd.entityId)),latest=cur.value?.data??null;
  let data=cmd.data;
  // DATE·SELF = 기준값으로 병합(같은 칸은 이 초안 값). FIX60Q (Q58-2b): 병합 알림은 아래 heads 확인으로 다시 고르게 한다(버리지 않음)
  if(choice.kind!=='NO_BASE'){const rb=rebaseRecord(cmd.entityType,{id:cmd.entityId,base:choice.base,mine:cmd.data,latest});check(rb.status!=='REJECTED',rb.code);if(rb.status==='MERGED')data=rb.data;else data=latest;}
  validateLifeData(cmd.entityType,cmd.entityId,data);
  if(latest&&stable(latest)===stable(data)){sealedConflicts.delete(draftId);sealedChoices.delete(draftId);await box.discard(draftId);mergeWrites.delete(draftId);return {status:'ALREADY_APPLIED',draftId,draftStatus:'DISCARDED',committedHistory:false};}
  // FIX60Q (Q58-2·2b): 고를 때 보인 금고와 지금 금고가 다르면(그사이 다른 저장) 쓰지 않고 지금 값으로 다시 고르게 한다(쓰기 0, 초안 보존)
  if(stable(cur.heads)!==choice.heads)return chooseResult(draftId,choice,data,cur);
  sealedConflicts.delete(draftId);sealedChoices.delete(draftId);
  return writeFor(active,box,draftId,cmd,cur,data,{applied:true});
 }
 async function md(action,body){check(routes.has(action),'MD_ROUTE');
  if(firstPrimary&&action.startsWith('first-primary-')){
   if(action==='first-primary-status'){keys(body,[]);return firstPrimary.status();}
   check(!service&&!recipient&&!opening&&!closing,'MD_PRIMARY_COMPOSITION_BUSY');
   if(action==='first-primary-review')return firstPrimary.review(body);
   check(action==='first-primary-create'||action==='first-primary-resume','MD_ROUTE');opening=true;
   try{const result=await firstPrimary.run(body,action.endsWith('-create')?'CREATE':'RESUME');service=result.service;owner=result.owner;localRole='OWNER';selected=result.store.id;if(!profiles.some(x=>x.id===selected))profiles.push({id:selected});lastUnlockState=null;verified=true;signedOutElsewhere=null;return status();}finally{opening=false;settleHeld();}
  }
  if(firstPrimary&&['email','email-code','totp','handoff'].includes(action))firstPrimary.invalidate();
  if(firstPrimary&&action.startsWith('enroll-')&&firstPrimary.status().state==='RESERVED')check(false,'MD_PRIMARY_INCOMPLETE_HOLD');
  if(ownerOnly.has(action))needOwner();switch(action){
  case 'status':keys(body,[]);return status();
  case 'email':keys(body,['email']);return auth.requestEmailCode(body.email);
  case 'email-code':keys(body,['email','code']);return auth.verifyEmailCode(body.email,body.code);
  case 'totp-enroll':keys(body,[]);return auth.enrollTotp();
  // B27: an empty factor ID (saved-login auto open never fills the field) uses the account's only verified TOTP factor; none or several is refused.
  case 'totp':keys(body,['factorId','code']);return auth.verifyTotp(body.factorId===''?await onlyTotpFactor():body.factorId,body.code);
  // B27: verified TOTP factors of the signed-in account (id and display name only) so the screen can fill "TOTP factor ID" itself.
  case 'totp-factors':keys(body,[]);check(typeof auth.factors==='function','TOTP_FACTOR_REQUIRED');return {factors:(await auth.factors()).map(f=>({id:f.id,friendlyName:f.friendlyName}))};
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
  // MD03 P2 R2 (browser only: enabled by the SIGNOUT group): close like shutdown, then forget the saved login and unlock phrase.
  // B14 (R1-02): requests (unlock included) are refused while this runs. Once it has finished, even when auth.signOut() threw (marker write failed),
  // closing is cleared: the vault stays closed and the memory login is gone (auth.signOut clears it first), so an unlock needs an explicit login again.
  case 'signout':{
   keys(body,[]);check(!opening&&!closing,'MD_LOCAL_OWNER_CLOSING');closing=true;let result={status:'CLOSED'};
   try{
    try{controller?.close();controller=null;recipient?.close();recipient=null;if(service)result=await service.close();service=null;await dropOwner();}
    catch(error){result={status:'HOLD',code:typeof error?.code==='string'?error.code:'HOLD_SHUTDOWN'};}
    await auth.signOut();
    // S1: our own sign-out raised the generation; remember it so this tab does not treat it as another tab's.
    if(signoutWatch){try{seenMarker=await readMarker();}catch{}}
   }finally{closing=false;}
   return {...status(),signOut:result.status==='CLOSED'?'SIGNED_OUT':'SIGNED_OUT_CLOSE_HOLD',closeCode:result.code??null};
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
  // B24: the device roster sends only the 8-char key prefix and the typed confirmation; the service resolves the full id/fingerprint itself.
  case 'device-retire':if(Object.hasOwn(body,'targetKeyId8')){keys(body,['targetKeyId8','confirmText','confirmed']);return needOwner().retireDeviceByRosterKey(body);}keys(body,['targetDeviceId','targetFingerprint','reason','confirmed']);return needOwner().retireDevice(body);
  case 'device-retire-reconcile':if(Object.hasOwn(body,'targetKeyId8')){keys(body,['targetKeyId8']);return needOwner().reconcileRetirementByRosterKey(body.targetKeyId8);}keys(body,['intentId']);return needOwner().reconcileRetirement(body.intentId);
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
   selected=store.id;profiles.push({id:store.id,accountId:result.material.keyring.accountId,vaultId:result.material.keyring.vaultId,deviceId:result.material.identity.public.deviceId,generation:store.checkpoint.generation});lastUnlockState=null;signedOutElsewhere=null;
   recipient.close();recipient=null;recipientAck=null;await service.sync();verified=true;return status();
  }
  // Offline drafts: sealed local capture only. Never part of committed history, projections, XP or HOUSE.
  case 'draft-list':keys(body,[]);need();return draftList();
  case 'draft-save':{
   const sealed=Object.hasOwn(body,'sealBase');   // FIX54: 봉인 초안은 sealBase를 함께 보낸다(옛 앱은 보내지 않는다 → 지금 동작 그대로)
   keys(body,sealed?['type','body','sealBase']:['type','body']);const active=need();check(!opening&&!closing&&localRole==='OWNER'&&owner,'MD_LOCAL_FOLLOWER_READ_ONLY');check(drafts(),'MD_DRAFTS_UNAVAILABLE');
   check(['RECORD','ENTITY','CORRECTION'].includes(body.type),'MD_DRAFT_TYPE');normalizeCommand(body.body,body.type);if(sealed)checkSealBase(body.type,body.body,body.sealBase);
   check(!active.store.state.sequentialSync.receipts[body.body.requestId]&&!active.store.state.userApp.operations.some(op=>op.provenance.requestId===body.body.requestId),'MD_DRAFT_REQUEST_ALREADY_TERMINAL');
   return {...await drafts().save({type:body.type,body:sealed?{...body.body,sealBase:structuredClone(body.sealBase)}:body.body}),committedHistory:false};
  }
  case 'draft-discard':{keys(body,['draftId','confirmed']);check(body.confirmed===true,'MD_EXPLICIT_DRAFT_DISCARD');need();check(!opening&&!closing&&localRole==='OWNER'&&owner,'MD_LOCAL_FOLLOWER_READ_ONLY');check(drafts(),'MD_DRAFTS_UNAVAILABLE');
   {const s=service.store.state.sequentialSync,x=drafts().get(body.draftId),mid=mergeWrites.get(body.draftId);check(!(mid&&s.pending?.intentId===mid)&&!pendingOnSealed(s,x),'MD_PENDING_RECONCILE_REQUIRED');}   // FIX59Q (HQ57-1): 결과 모르는 쓰기가 이 봉인 초안의 기록을 쓰는 동안 폐기 거절(초안 보존)
   sealedConflicts.delete(body.draftId);sealedChoices.delete(body.draftId);mergeWrites.delete(body.draftId);return drafts().discard(body.draftId);}
  // Explicit owner approval converts one draft through the NORMAL online path (lease, CAS, receipt).
  // The draft keeps its original requestId, so a retry after DISPATCHED_UNKNOWN or a crash after the
  // server receipt converges on the same intent and never appends twice.
  case 'draft-commit':{
   const apply=Object.hasOwn(body,'apply');   // FIX59Q: [그대로 적용]은 apply:true를 함께 보낸다(고를 수 있는 충돌 줄만)
   keys(body,apply?['draftId','confirmed','apply']:['draftId','confirmed']);check(body.confirmed===true&&(!apply||body.apply===true),'MD_EXPLICIT_DRAFT_APPROVAL');const active=needOwner(),box=drafts();check(box,'MD_DRAFTS_UNAVAILABLE');
   const d=box.get(body.draftId),old=preUpdateDraft(d);
   if(apply)return applyChosen(active,box,body.draftId,d);
   if(d.type==='ENTITY'&&Object.hasOwn(d.body,'sealBase')){const r=await commitSealed(active,box,body.draftId,d);if(r)return r;delete d.body.sealBase;}   // FIX54: 원래 길은 sealBase 없는 원래 명령(같은 requestId)
   let noBase=false;
   if(old){const base=preUpdateBase(active.store.graph,d.body);if(base===undefined)noBase=true;else{const r=await commitSealed(active,box,body.draftId,{...d,body:{...d.body,sealBase:base}},true);if(r)return r;}}   // FIX59Q (HU57-1): 업데이트 전 초안은 expectedHeads 판 값을 기준으로 같은 3자 병합
   let result;
   try{result=await online(()=>active.write(d.body,d.type));}
   catch(error){   // FIX58Q (HU2)·FIX59Q (HU57-2): 기준을 못 구한 업데이트 전 초안이 금고가 바뀌어 거절되면 다시 눌러도 같다. 값이 이미 같으면 정리, 아니면 초안 내용을 보이고 사용자가 고른다([그대로 적용]·[버리기])
    const s=active.store.state;
    if(!old||!noBase||error?.code!=='STALE_HEADS'||s.sequentialSync.pending?.intentId===d.body.requestId||s.sequentialSync.receipts[d.body.requestId])throw error;
    const ent=active.store.graph.entity('NOTE',entityKey(d.body.entityType,d.body.entityId)),cur=ent.value?.data??null,mid=mergeWrites.get(body.draftId);
    if(stable(cur)===stable(d.body.data)||mid&&committedRid(s,mid)){sealedConflicts.delete(body.draftId);sealedChoices.delete(body.draftId);await box.discard(body.draftId);mergeWrites.delete(body.draftId);return {status:'ALREADY_APPLIED',draftId:body.draftId,draftStatus:'DISCARDED',committedHistory:false};}   // FIX60Q (Q58-3): [그대로 적용] 쓰기가 이 실행에서 쌓였으면 정리
    // FIX61Q (HUNT59 Q59-S05d): 기준을 못 구한 초안은 금고 이력의 어느 판이 이 초안 값인지로 "적용됐었음"을 가리지 못한다(옛 판 값과 우연히 같을 수 있음).
    // 지금 값이 초안 값과 같으면 위에서 정리(FIX60Q Q58-3), 다르면 SEALED_MAYBE_APPLIED(버리기만) 대신 고르기: 응답에 지금 기록 값이 보이므로 덮어쓰기는 본 뒤에만
    return chooseResult(body.draftId,{kind:'NO_BASE',extra:{preUpdate:true}},d.body.data,ent);
   }
   check(result.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED','MD_DRAFT_COMMIT_UNCONFIRMED');
   // B14 (R6-02): the write is confirmed. If this tab was closed meanwhile (sign-out elsewhere, own sign-out, handoff), do not touch the closed store:
   // return the success and leave the draft; after unlocking again the same requestId commit converges on this receipt and settles it (no second record).
   if(service!==active||closing)return {...result,draftId:body.draftId,draftStatus:'LOCAL_DRAFT_KEPT',draftSettled:false};
   const settled=await box.settle(body.draftId,d.body.requestId);return {...result,draftId:body.draftId,draftStatus:settled.status};
  }
  default:check(false,'MD_ROUTE');
 }}
 // S1: close everything this tab holds open because another tab signed the device out. Same steps as the 'signout' route minus
 // auth.signOut() (the other tab already wrote the marker and deleted the saved login; this tab only drops its memory copy).
 // service.close() waits for a save already in progress and keeps pending/lease rules (CLOSED, or HOLD with its code). Local records and drafts stay.
 async function closeForSignout(marker){
  seenMarker=marker;signedOutElsewhere={status:'CLOSING',code:null};closing=true;let result={status:'CLOSED'};
  try{controller?.close();controller=null;recipient?.close();recipient=null;recipientAck=null;const old=service;service=null;if(old)result=await old.close();await dropOwner();}
  catch(error){result={status:'HOLD',code:typeof error?.code==='string'?error.code:'HOLD_SHUTDOWN'};}
  finally{closing=false;}
  auth.clear?.();verified=false;
  signedOutElsewhere={status:result.status==='CLOSED'?'CLOSED':'CLOSE_HOLD',code:result.code??null};
  try{onSignedOutElsewhere?.(status());}catch{}
  settleHeld();
 }
 // S1c (H7-02): the marker as {generation,id}. A port without state() gives the generation only (id null), compared as a number.
 async function readMarker(){
  let m;try{m=typeof signoutWatch.state==='function'?await signoutWatch.state():{generation:await signoutWatch.generation(),id:null};}catch{check(false,'MD_SIGNOUT_STATE_UNREADABLE');}
  check(m&&Number.isSafeInteger(m.generation)&&m.generation>=0&&(m.id===null||typeof m.id==='string'),'MD_SIGNOUT_STATE_UNREADABLE');
  return {generation:m.generation,id:m.id};
 }
 // Only sign-out writes the marker and every sign-out writes a new random id, so any difference from the marker this backend saw is a sign-out:
 // a higher generation, or a lower/equal one with another id (the marker store was reset or restored to an older copy).
 const markerChanged=m=>m.generation!==seenMarker.generation||m.id!==seenMarker.id;
 // Runs before every request except shutdown and this tab's own sign-out. An unreadable marker refuses the request (fail closed).
 // While an unlock/close of this tab is still running the request is refused too; the change is held and closes once that has finished.
 async function signoutGuard(){
  if(!signoutWatch)return;
  const marker=await readMarker();
  if(seenMarker===undefined){seenMarker=marker;return;}
  if(!markerChanged(marker))return;
  if(opening||closing){heldSignout=true;check(false,'MD_LOCAL_OWNER_CLOSING');}
  await closeForSignout(marker);
 }
 // S1c (H7-03): a broadcast (or a held one) makes this backend read the marker itself; the message is only a hint.
 // A broadcast while this backend has no readable marker yet is still a sign-out (fail closed). An unreadable marker leaves it to the next request.
 async function recheck(){
  heldSignout=false;
  let marker;try{marker=await readMarker();}catch{return;}
  if(seenMarker!==undefined&&!markerChanged(marker))return;
  if(opening||closing){heldSignout=true;return;}
  await closeForSignout(marker);
 }
 function settleHeld(){if(heldSignout&&!opening&&!closing)void recheck().catch(()=>{});}
 if(signoutWatch){
  try{seenMarker=await readMarker();}catch{seenMarker=undefined;}
  signoutWatch.subscribe?.(()=>{if(opening||closing){heldSignout=true;return;}void recheck().catch(()=>{});});
 }
 async function request(path,body){
  if(path!=='/api/shutdown'&&path!=='/api/md/signout')await signoutGuard();
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
