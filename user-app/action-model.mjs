import {Graph,makeOperation} from '../core/package/parent/v2_phase2/source/dag.mjs';
import {canonical} from '../core/package/parent/v2_phase2/source/canonical.mjs';
import {encode,sha,randomId} from '../core/package/src/codec.mjs';
import {requireValue} from '../multi-device/portable/errors.mjs';
import {WL_FORMAT,validateEntityRecord,normalizeEntity,wholeEdit,validateWholeSequence,effectiveActions} from './whole-life-model.mjs';

import {MEASUREMENT_FORMAT,validateMeasurement,validateMeasurementRecord,measurementKey} from './measurement.mjs';
import {DOMAIN_SCHEMA_VERSION} from '../product/runtime-contract.mjs';

export const OUTCOMES=Object.freeze(['COMPLETE','PARTIAL','NOT_DONE']);
export const FORMATS=Object.freeze({definition:'LB_USER_ACTION_DEF_1',result:'LB_USER_ACTION_RESULT_1',restart:'LB_USER_RESTART_POINT_1'});
export function exact(value,names){requireValue(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join('|')===[...names].sort().join('|'),'INVALID_SCHEMA');}
const idOK=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(id);
const requestOK=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
export function dateOK(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export function clock(){const d=new Date();return {localDate:[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,recordedAt:d.toISOString()};}
export const ids=(actionId,localDate)=>({definition:`sd1:def:${actionId}`,result:`sd1:result:${actionId}:${localDate}`,restart:`sd1:restart:${actionId}`});
function text(v,max,empty=true){requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_TEXT');return v;}
export function validateSeeds(seeds){
  requireValue(Array.isArray(seeds)&&seeds.length>=3&&seeds.length<=5,'INVALID_SEEDS');
  const seen=new Set();return seeds.map((v,index)=>{exact(v,['actionId','title','active','displayOrder']);requireValue(idOK(v.actionId)&&!seen.has(v.actionId)&&v.active===true&&v.displayOrder===index,'INVALID_SEEDS');seen.add(v.actionId);text(v.title,100,false);return structuredClone(v);});
}
export function validateRecord(edit){
  requireValue(edit.kind==='NOTE'&&edit.value&&edit.temporal===null,'INVALID_APP_RECORD');const v=edit.value;
  if(v.format===MEASUREMENT_FORMAT){validateMeasurementRecord(edit);return;}
  if(v.format===WL_FORMAT){validateEntityRecord(edit);return;}
  requireValue(idOK(v.actionId),'INVALID_ACTION_ID');
  if(v.format===FORMATS.definition){exact(v,['format','actionId','title','active','displayOrder']);text(v.title,100,false);requireValue(v.active===true&&Number.isInteger(v.displayOrder)&&v.displayOrder>=0&&v.displayOrder<5&&edit.id===ids(v.actionId,'').definition,'INVALID_DEFINITION');}
  else if(v.format===FORMATS.result){exact(v,['format','actionId','localDate','timeZone','recordedAt','outcome']);requireValue(dateOK(v.localDate)&&OUTCOMES.includes(v.outcome)&&edit.id===ids(v.actionId,v.localDate).result,'INVALID_RESULT');text(v.timeZone,100,false);requireValue(typeof v.recordedAt==='string'&&new Date(v.recordedAt).toISOString()===v.recordedAt,'INVALID_TIME');}
  else if(v.format===FORMATS.restart){exact(v,['format','actionId','text','recordedAt']);text(v.text,500);requireValue(edit.id===ids(v.actionId,'').restart&&typeof v.recordedAt==='string'&&new Date(v.recordedAt).toISOString()===v.recordedAt,'INVALID_RESTART_POINT');}
  else requireValue(false,'INVALID_APP_FORMAT');
}
export function replay(operations,{vaultId,deviceId}){
  requireValue(Array.isArray(operations)&&operations.length<=10000,'HOLD_APP_HISTORY_LIMIT');
  const requests=new Set();let seq=0;
  for(const op of operations){
    requireValue(op.mode==='REAL'&&op.vault===vaultId&&op.device===deviceId&&op.seq===++seq&&op.control===null,'HOLD_APP_NAMESPACE');
    requireValue(op.provenance?.appFormat==='LBOS_SINGLE_DEVICE_APP_1'&&requestOK(op.provenance.requestId)&&requestOK(op.provenance.commandDigest)&&!requests.has(op.provenance.requestId),'HOLD_APP_PROVENANCE');
    requireValue(op.seq===1?op.provenance.commandType==='INITIALIZE':['RECORD','CORRECTION','ENTITY'].includes(op.provenance.commandType),'HOLD_APP_PROVENANCE');
    if(op.seq===1)validateSeeds(op.edits.map(e=>{const {format,...v}=e.value;return v;}));
    if(op.provenance.commandType==='CORRECTION')requireValue(op.provenance.confirmed===true&&typeof op.provenance.reason==='string'&&op.provenance.reason.trim().length>0,'HOLD_APP_PROVENANCE');
    requests.add(op.provenance.requestId);op.edits.forEach(validateRecord);
    requireValue(op.edits.every(e=>e.intent===(op.seq===1?'CREATE':op.provenance.commandType==='CORRECTION'?'EDIT':e.parents.length?'EDIT':'CREATE')),'HOLD_APP_INTENT');
    requireValue(op.seq===1?op.edits.every(e=>e.value.format===FORMATS.definition):op.edits.every(e=>e.value.format!==FORMATS.definition),'HOLD_APP_DEFINITION_IMMUTABLE');
  }
  validateWholeSequence(operations);
  const graph=Graph.replay(operations,{vault:vaultId,mode:'REAL'});
  requireValue(!graph.pending().length&&!graph.rejected().length&&!graph.integrityFaults().length&&!graph.conflicts().length,'HOLD_APP_GRAPH');
  return graph;
}
export function normalizeCommand(body,type){
  if(type==='ENTITY')return normalizeEntity(body);
  const measured=Object.hasOwn(body,'measurement');
  exact(body,['requestId','commandDigest','actionId','localDate','expectedHeads','outcome','restartPoint','reason','confirmed',...(measured?['measurement']:[])]);
  if(measured)validateMeasurement(body.measurement);
  requireValue(requestOK(body.requestId)&&requestOK(body.commandDigest)&&idOK(body.actionId)&&dateOK(body.localDate),'INVALID_COMMAND');
  exact(body.expectedHeads,['result','restart',...(measured?['measurement']:[])]);
  for(const heads of Object.values(body.expectedHeads))requireValue(Array.isArray(heads)&&heads.length<=1&&heads.every(h=>typeof h==='string'&&/^[a-f0-9]{64}#[0-9]+$/.test(h)),'INVALID_EXPECTED_HEADS');
  requireValue(body.outcome===null||OUTCOMES.includes(body.outcome),'INVALID_OUTCOME');
  requireValue(body.restartPoint===null||typeof body.restartPoint==='string','INVALID_RESTART_POINT');
  if(body.restartPoint!==null)text(body.restartPoint,500);
  requireValue(body.outcome!==null||body.restartPoint!==null||measured,'EMPTY_COMMAND');
  text(body.reason,300,type!=='CORRECTION');
  requireValue(body.confirmed===(type==='CORRECTION'),'CORRECTION_CONFIRMATION_REQUIRED');
  if(type==='RECORD')requireValue(body.reason==='','INVALID_RECORD_REASON');
  const command={type,actionId:body.actionId,localDate:body.localDate,expectedHeads:structuredClone(body.expectedHeads),outcome:body.outcome,restartPoint:body.restartPoint,reason:body.reason.trim(),confirmed:body.confirmed,...(measured?{measurement:structuredClone(body.measurement)}:{})};
  const digest=sha(encode(command));requireValue(digest===body.commandDigest,'COMMAND_DIGEST_MISMATCH');
  return {requestId:body.requestId,digest,command};
}
export function initializationOperation(owner,seeds,requestId){
  requireValue(requestOK(requestId),'INVALID_REQUEST_ID');seeds=validateSeeds(seeds);
  const g=new Graph({vault:owner.vaultId,mode:'REAL'}),commandDigest=sha(encode({type:'INITIALIZE',seeds}));
  const op=makeOperation(g,owner.deviceId,seeds.map(v=>({kind:'NOTE',id:ids(v.actionId,'').definition,value:{format:FORMATS.definition,...v}})),{opId:randomId(),provenance:{reason:'Owner selected initial actions',appFormat:'LBOS_SINGLE_DEVICE_APP_1',commandType:'INITIALIZE',requestId,commandDigest,recordedAt:clock().recordedAt}});
  requireValue(g.ingest(op)==='ACCEPTED','HOLD_APP_GRAPH');return op;
}
export function buildCandidateOperation(graph,owner,normalized,{appFormat='LBOS_SINGLE_DEVICE_APP_1'}={}){
  const {command:c,requestId,digest}=normalized,t=clock();
  if(c.type==='ENTITY'){
    const edit=wholeEdit(graph,c,t),provenance={reason:c.reason,confirmed:c.confirmed,appFormat,commandType:'ENTITY',requestId,commandDigest:digest,recordedAt:t.recordedAt};
    const op=makeOperation(graph,owner.deviceId,[edit],{opId:randomId(),businessDate:t.localDate,provenance});
    return op;
  }
  const names=ids(c.actionId,c.localDate),definition=effectiveActions(graph).find(a=>a.actionId===c.actionId);
  requireValue(definition&&(definition.active||c.type==='CORRECTION'),'UNKNOWN_ACTION');
  requireValue(c.localDate<=t.localDate&&(c.type==='CORRECTION'||c.localDate===t.localDate),'INVALID_RECORD_DATE');
  const edits=[];
  for(const field of ['result','restart']){
    if(field==='result'?c.outcome===null:c.restartPoint===null)continue;
    const old=graph.entity('NOTE',names[field]);requireValue(canonical(old.heads)===canonical(c.expectedHeads[field]),'STALE_HEADS');
    requireValue(old.heads.length<=1&&old.status!=='CONFLICT','HOLD_APP_CONFLICT');
    if(c.type==='CORRECTION')requireValue(old.status==='RESOLVED','CORRECTION_REQUIRES_EXISTING_RECORD');
    const value=field==='result'?{format:FORMATS.result,actionId:c.actionId,localDate:c.localDate,timeZone:t.timeZone,recordedAt:t.recordedAt,outcome:c.outcome}:{format:FORMATS.restart,actionId:c.actionId,text:c.restartPoint,recordedAt:t.recordedAt};
    edits.push({kind:'NOTE',id:names[field],parents:old.heads,value,intent:old.heads.length?'EDIT':'CREATE',temporal:null});
  }
  if(c.measurement){
    const key=measurementKey(c.actionId,c.localDate,c.measurement.observationId),old=graph.entity('NOTE',key);
    requireValue(canonical(old.heads)===canonical(c.expectedHeads.measurement),'STALE_HEADS');
    requireValue(c.type==='CORRECTION'?old.status==='RESOLVED':old.status==='MISSING','MEASUREMENT_CORRECTION_REQUIRED');
    edits.push({kind:'NOTE',id:key,parents:old.heads,value:{format:MEASUREMENT_FORMAT,domainSchemaVersion:DOMAIN_SCHEMA_VERSION,actionId:c.actionId,localDate:c.localDate,timeZone:t.timeZone,recordedAt:t.recordedAt,measurement:structuredClone(c.measurement)},intent:old.heads.length?'EDIT':'CREATE',temporal:null});
  }
  const provenance={reason:c.type==='CORRECTION'?c.reason:'Owner recorded action',appFormat,commandType:c.type,requestId,commandDigest:digest,recordedAt:t.recordedAt};
  if(c.measurement)provenance.domainSchemaVersion=DOMAIN_SCHEMA_VERSION;
  if(c.type==='CORRECTION'){provenance.confirmed=true;if(c.localDate<t.localDate)Object.assign(provenance,{backdatedCorrection:true,affectedDates:[c.localDate,t.localDate]});}
  const op=makeOperation(graph,owner.deviceId,edits,{opId:randomId(),businessDate:t.localDate,provenance});
  return op;
}
export function candidateOperation(graph,owner,normalized){
  const op=buildCandidateOperation(graph,owner,normalized);
  const candidate=replay([...graph.operations().sort((a,b)=>a.seq-b.seq),op],owner);
  requireValue(candidate.has(op.opId),'HOLD_APP_GRAPH');return {op,graph:candidate};
}
export const savedResult=op=>({status:'LOCAL_SAVED',requestId:op.provenance.requestId,opId:op.opId,revisionIds:op.edits.map((_,i)=>op.opId+'#'+i)});
export function today(graph){const date=clock().localDate;return {localDate:date,actions:effectiveActions(graph).filter(v=>v.active).map(v=>{const n=ids(v.actionId,date),result=graph.entity('NOTE',n.result),restart=graph.entity('NOTE',n.restart);return {actionId:v.actionId,title:v.title,domain:v.domain,planId:v.planId,outcome:result.value?.outcome??null,restartPoint:restart.value?.text??'',heads:{result:result.heads,restart:restart.heads}};})};}
export function history(graph){return graph.operations().sort((a,b)=>b.seq-a.seq).flatMap(op=>op.edits.map((e,i)=>{const revisionId=op.opId+'#'+i,latest=graph.entity('NOTE',e.id);return {revisionId,parents:e.parents,sequence:op.seq,actionId:e.value.actionId,format:e.value.format,value:structuredClone(e.value),intent:e.intent,reason:op.provenance.reason,recordedAt:op.provenance.recordedAt,currentHeads:latest.heads,canCorrect:e.value.format!==FORMATS.definition&&latest.heads.length===1&&latest.heads[0]===revisionId};})).slice(0,20);}
