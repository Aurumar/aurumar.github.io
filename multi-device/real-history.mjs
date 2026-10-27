import {Graph} from '../core/package/parent/v2_phase2/source/dag.mjs';
import {canonical} from '../core/package/parent/v2_phase2/source/canonical.mjs';
import {check,idOK,copy} from '../core/package/src/codec.mjs';
import {replay as legacyReplay,validateRecord,validateSeeds,FORMATS,buildCandidateOperation} from '../user-app/action-model.mjs';
import {validateWholeSequence} from '../user-app/whole-life-model.mjs';
import {PROFILE,LIMITS} from './contracts.mjs';
const eq=(a,b)=>canonical(a)===canonical(b);
export function replayReal(operations,{vaultId,roster,legacyCount}){
 check(Array.isArray(operations)&&operations.length>0&&operations.length<=LIMITS.operations,'MD_HISTORY_LIMIT');
 check(Number.isSafeInteger(legacyCount)&&legacyCount>=1&&legacyCount<=operations.length,'MD_LEGACY_PREFIX');
 check(roster.vaultId===vaultId,'MD_ROSTER_VAULT');
 const first=roster.evidence.genesis.body.firstDevice;
 legacyReplay(operations.slice(0,legacyCount),{vaultId,deviceId:first.deviceId});
 const members=new Map([[first.deviceId,first]]);
 for(const event of roster.evidence.events)members.set(event.body.member.deviceId,event.body.member);
 const graph=new Graph({vault:vaultId,mode:'REAL'}),requests=new Set(),tips=new Map();
 for(const [i,op]of operations.entries()){
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
 }
 validateWholeSequence(operations);
 return graph;
}
export function candidateReal(operations,owner,normalized,options){
 const graph=replayReal(operations,options);
 check(owner.vaultId===options.vaultId,'MD_VAULT');
 const op=buildCandidateOperation(graph,owner,normalized,{appFormat:PROFILE});
 const next=[...copy(operations),op];
 return {op,operations:next,graph:replayReal(next,options)};
}
