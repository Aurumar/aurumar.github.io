import {Graph} from '../core/package/parent/v2_phase2/source/dag.mjs';
import {canonical} from '../core/package/parent/v2_phase2/source/canonical.mjs';
import {check,idOK,copy,sha,encode,payloadEncode} from '../core/package/src/codec.mjs';
import {replay as legacyReplay,validateRecord,validateSeeds,FORMATS,buildCandidateOperation} from '../user-app/action-model.mjs';
import {validateWholeSequence} from '../user-app/whole-life-model.mjs';
import {PROFILE,LIMITS} from './contracts.mjs';
const eq=(a,b)=>canonical(a)===canonical(b);
function validateShape(operations,legacyCount){
 check(Array.isArray(operations)&&operations.length>0&&operations.length<=LIMITS.operations,'MD_HISTORY_LIMIT');
 check(Number.isSafeInteger(legacyCount)&&legacyCount>=1&&legacyCount<=operations.length,'MD_LEGACY_PREFIX');
}
// F10 M2-C: an incremental replayer for one fixed (vaultId, roster, legacyCount). append(op) runs exactly the
// per-record checks replayReal used to run inline, against the running graph/tips/requests. finish(operations)
// runs the whole-sequence check and returns the graph. legacyPrefixOps (the first legacyCount operations, known
// up front by every caller) is checked once here, before any append, so the check order matches the original
// line-by-line: a caller that only has a growing prefix of operations must gather legacyCount of them first.
function createReplayer({vaultId,roster,legacyCount},legacyPrefixOps){
 check(roster.vaultId===vaultId,'MD_ROSTER_VAULT');
 const first=roster.evidence.genesis.body.firstDevice;
 legacyReplay(legacyPrefixOps,{vaultId,deviceId:first.deviceId});
 const members=new Map([[first.deviceId,first]]);
 for(const event of roster.evidence.events)members.set(event.body.member.deviceId,event.body.member);
 const graph=new Graph({vault:vaultId,mode:'REAL'}),requests=new Set(),tips=new Map();
 let i=0;
 function append(op){
  check(op.mode==='REAL'&&op.vault===vaultId&&op.control===null&&members.has(op.device),'MD_REAL_NAMESPACE');
  const tip=tips.get(op.device);
  check(op.seq===(tip?.seq||0)+1&&op.prev===(tip?.opId??null),'MD_DEVICE_SEQUENCE');
  check(eq(op.deps,[...new Set([...graph.frontier(),...(tip?[tip.opId]:[])])].sort()),'MD_PREFIX_FRONTIER');
  const p=op.provenance;
  check(p&&idOK(p.requestId)&&idOK(p.commandDigest)&&!requests.has(p.requestId),'MD_PROVENANCE');
  check(p.appFormat===(i<legacyCount?'LBOS_SINGLE_DEVICE_APP_1':PROFILE),'MD_APP_PROFILE');
  if(i===0){check(p.commandType==='INITIALIZE','MD_GENESIS_REQUIRED');validateSeeds(op.edits.map(e=>{const {format,...v}=e.value;return v;}));}
  else check(['RECORD','CORRECTION','ENTITY'].includes(p.commandType),'MD_SECOND_INITIALIZE');
  if(p.commandType==='CORRECTION')check(p.confirmed===true&&typeof p.reason==='string'&&p.reason.trim().length>0,'MD_CORRECTION');
  for(const edit of op.edits){
   validateRecord(edit);
   check(edit.intent===(i===0?'CREATE':p.commandType==='CORRECTION'?'EDIT':edit.parents.length?'EDIT':'CREATE'),'MD_INTENT');
   check(i===0?edit.value.format===FORMATS.definition:edit.value.format!==FORMATS.definition,'MD_DEFINITION_IMMUTABLE');
  }
  check(graph.ingest(op)==='ACCEPTED','MD_GRAPH_ADMISSION');
  check(!graph.pending().length&&!graph.rejected().length&&!graph.integrityFaults().length&&!graph.conflicts().length,'MD_GRAPH_HOLD');
  requests.add(p.requestId);tips.set(op.device,op);
  i++;
 }
 function finish(operations){validateWholeSequence(operations);return graph;}
 return {append,finish,graph};
}
export function replayReal(operations,{vaultId,roster,legacyCount}){
 validateShape(operations,legacyCount);
 const replayer=createReplayer({vaultId,roster,legacyCount},operations.slice(0,legacyCount));
 for(const op of operations)replayer.append(op);
 return replayer.finish(operations);
}
// F10 M2-B: replay results reused only inside ONE save call, in memory. The key is the ordered list of every input op
// (opId + sha256 of its exact payload bytes) plus the replay parameters (vaultId, roster epoch/head, legacyCount); any
// difference means a full replay. The save's starting head is recorded in the key too, but isolation between saves comes
// from the scope living for one call only. Only successful replays are kept (a failing input always re-runs and fails
// the same way); an input the key cannot even encode goes straight to replayReal so its own error code surfaces.
// close() drops everything when the save ends, successfully or not. Never stored in files, IndexedDB or globals.
export function replayScope(startHead){
 let memo=new Map();const stats={runs:0,hits:0};
 const key=(operations,{vaultId,roster,legacyCount})=>sha(encode({startHead,vaultId,rosterEpoch:roster.epoch,rosterHead:roster.head,legacyCount,operations:operations.map(op=>[op.opId,sha(payloadEncode(op))])}));
 const replay=(operations,options)=>{
  if(!memo){stats.runs++;return replayReal(operations,options);}
  let k;try{k=key(operations,options);}catch{stats.runs++;return replayReal(operations,options);}
  const hit=memo.get(k);if(hit){stats.hits++;return hit;}
  stats.runs++;const graph=replayReal(operations,options);memo.set(k,graph);return graph;
 };
 return {replay,stats,close(){memo?.clear();memo=null;}};
}
export function candidateReal(operations,owner,normalized,options,{replay=replayReal}={}){
 const graph=replay(operations,options);
 check(owner.vaultId===options.vaultId,'MD_VAULT');
 const op=buildCandidateOperation(graph,owner,normalized,{appFormat:PROFILE});
 const next=[...copy(operations),op];
 return {op,operations:next,graph:replay(next,options)};
}
// F10 M2-D: a session keeps up to 2 incremental replayers alive ACROSS many save() calls on one sequential-service
// instance (unlike replayScope, which lives for one save only), so a long run of saves each extend a cached graph by
// the ops added since the last save instead of re-replaying everything. Memory only: nothing here ever touches a
// file, IndexedDB or a global.
//
// Each replay(operations, options) call either: (a) returns a slot's graph unchanged when its fingerprint+params
// exactly match (marking that slot "last returned"), (b) extends a slot whose fingerprint is an exact prefix of the
// input via append()+finish(), or (c) resets a slot and replays everything into it. The slot picked for (b)/(c) is
// always one that is neither pinned nor "last returned" (emptied ones first) -- this is what keeps the invariant: a
// graph the session just handed back, or one the caller pinned (store.graph), is never ingested into again. With 2
// slots, if both are excluded there is nothing to reuse and the call falls straight through to replayReal.
function fingerprint(op){return [op.opId,sha(payloadEncode(op))];}
function sameFingerprint(a,b){return a[0]===b[0]&&a[1]===b[1];}
function sameParams(a,b){return a.vaultId===b.vaultId&&a.rosterEpoch===b.rosterEpoch&&a.rosterHead===b.rosterHead&&a.legacyCount===b.legacyCount;}
function isFingerprintPrefix(shortFps,longFps){
 if(shortFps.length>longFps.length)return false;
 for(let idx=0;idx<shortFps.length;idx++)if(!sameFingerprint(shortFps[idx],longFps[idx]))return false;
 return true;
}
export function replaySession(){
 function emptySlot(){return {fingerprints:null,params:null,replayer:null,pinned:false,lastReturned:false};}
 const slots=[emptySlot(),emptySlot()];
 function resetSlot(slot){slot.fingerprints=null;slot.params=null;slot.replayer=null;slot.lastReturned=false;}
 function markReturned(slot){for(const s of slots)s.lastReturned=false;slot.lastReturned=true;}
 function replay(operations,options){
  validateShape(operations,options.legacyCount);
  let fps;try{fps=operations.map(fingerprint);}catch{return replayReal(operations,options);}
  const params={vaultId:options.vaultId,rosterEpoch:options.roster.epoch,rosterHead:options.roster.head,legacyCount:options.legacyCount};
  for(const slot of slots){
   if(slot.replayer&&slot.fingerprints.length===fps.length&&sameParams(slot.params,params)&&isFingerprintPrefix(slot.fingerprints,fps)){
    markReturned(slot);return slot.replayer.graph;
   }
  }
  const target=slots.find(s=>!s.pinned&&!s.lastReturned&&!s.replayer)??slots.find(s=>!s.pinned&&!s.lastReturned);
  if(!target)return replayReal(operations,options);
  try{
   if(target.replayer&&sameParams(target.params,params)&&isFingerprintPrefix(target.fingerprints,fps)){
    for(let idx=target.fingerprints.length;idx<operations.length;idx++)target.replayer.append(operations[idx]);
    const graph=target.replayer.finish(operations);
    target.fingerprints=fps;target.params=params;markReturned(target);
    return graph;
   }
   const replayer=createReplayer(options,operations.slice(0,options.legacyCount));
   for(const op of operations)replayer.append(op);
   const graph=replayer.finish(operations);
   target.replayer=replayer;target.fingerprints=fps;target.params=params;markReturned(target);
   return graph;
  }catch(err){resetSlot(target);throw err;}
 }
 function pin(graph){for(const s of slots)s.pinned=(s.replayer?.graph===graph);}
 function clear(){slots[0]=emptySlot();slots[1]=emptySlot();}
 return {replay,pin,clear};
}
