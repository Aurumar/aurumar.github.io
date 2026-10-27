import {compare,check, dateOK, idOK, keyOf, hash, sorted, R, sum, clone} from './canonical.mjs';
import {validateRoutineCorrectionShape} from './routine-policy.mjs';

export const KINDS = ['NOTE','ACTION','FINANCE','ROUTINE','OBSERVATION','PLAN','BLOCK','GAME_INTENT','DEVICE'];
export function validateValue(edit, revisionId, provenance) {
  check(KINDS.includes(edit.kind) && idOK(edit.id),'ENTITY_SCHEMA');
  const temporalKind=['ROUTINE','PLAN','BLOCK'].includes(edit.kind);
  if(temporalKind)check(dateOK(provenance.recordedLocalDate),'INTENTION_RECORDED_DATE_REQUIRED');
  if(edit.kind==='ROUTINE')validateRoutineCorrectionShape(provenance);
  else if(provenance.backdatedCorrection)check(provenance.reason?.trim()&&provenance.confirmed===true&&provenance.affectedDates?.length===2&&provenance.affectedDates.every(dateOK)&&provenance.affectedDates[0]<=provenance.affectedDates[1],'BACKDATE_PROVENANCE');
  if(edit.temporal!==null) {
    check(edit.temporal && dateOK(edit.temporal.from) && (edit.temporal.to===null || dateOK(edit.temporal.to)&&edit.temporal.from<edit.temporal.to),'TEMPORAL_INTERVAL');
  }
  if(edit.value===null) {
    if(temporalKind) {
      check(edit.temporal!==null,'TOMBSTONE_TEMPORAL_REQUIRED');
      // ROUTINE history authorization runs in the graph's context-aware semantic policy.
      if(edit.kind!=='ROUTINE'&&edit.temporal.from<provenance.recordedLocalDate)check(provenance.backdatedCorrection===true&&provenance.affectedDates?.[0]<=edit.temporal.from&&provenance.affectedDates?.[1]>=provenance.recordedLocalDate,'BACKDATE_PROVENANCE');
    }
    return;
  }
  const v=edit.value;check(v && typeof v==='object' && !Array.isArray(v),'VALUE_SCHEMA');
  if(edit.intent==='IMPORT'&&temporalKind)check(dateOK(v.historyCoverageStart),'IMPORTED_HISTORY_COVERAGE_REQUIRED');
  if(edit.kind==='ACTION') {
    check(R(v.actualSeconds).cmp('0')>=0 && typeof v.domain==='string','ACTION_SCHEMA');
    if(v.dependencies!==undefined) check(Array.isArray(v.dependencies) && v.dependencies.every(d=>KINDS.includes(d.kind)&&idOK(d.id)),'ACTION_DEPENDENCIES');
  }
  if(edit.kind==='FINANCE') {R(v.amount);check(typeof v.currency==='string' && /^[A-Z]{3}$/.test(v.currency),'FINANCE_SCHEMA');}
  if(edit.kind==='ROUTINE') {
    check(Array.isArray(v.assignments) && v.assignments.length>0 && v.assignments.length<=1000,'ROUTINE_SCHEMA');
    const ranges=[...v.assignments].sort((a,b)=>compare(a.from,b.from));
    for(let i=0;i<ranges.length;i++) {
      const a=ranges[i];
      check(dateOK(a.from)&&(a.to===null||dateOK(a.to)&&a.from<a.to),'ROUTINE_INTERVAL');
      check(typeof a.zone==='string'&&a.zone.length>0&&a.schedule&&['EVERY_DAY','WEEKDAYS','DATES'].includes(a.schedule.type),'ROUTINE_CALENDAR');
      if(a.schedule.type==='WEEKDAYS') check(Array.isArray(a.schedule.days)&&a.schedule.days.every(n=>Number.isInteger(n)&&n>=0&&n<=6),'ROUTINE_SCHEDULE');
      if(a.schedule.type==='DATES') check(Array.isArray(a.schedule.dates)&&a.schedule.dates.length<=3660&&a.schedule.dates.every(dateOK)&&new Set(a.schedule.dates).size===a.schedule.dates.length,'ROUTINE_SCHEDULE');
      check(Object.hasOwn(a,'target'),'ROUTINE_TARGET');
      if(i) check(ranges[i-1].to!==null && ranges[i-1].to<=a.from,'OVERLAPPING_INTERVAL_MAP');
    }
    if(v.historyCoverageStart!==undefined) check(dateOK(v.historyCoverageStart),'HISTORY_COVERAGE');
  }
  if(edit.kind==='OBSERVATION') {
    check(v.source&&KINDS.includes(v.source.kind)&&idOK(v.source.id),'OBSERVATION_SOURCE');
    check(v.preMigrationSourceRevision==='UNKNOWN'||typeof v.source.revisionId==='string','OBSERVATION_REVISION_REQUIRED');
  }
  if(['PLAN','BLOCK'].includes(edit.kind)) {
    check(dateOK(v.startDate)&&dateOK(v.endDate)&&v.startDate<=v.endDate,'PLAN_RANGE');
    check(['PLANNED','ACTIVE','DONE','DEFERRED','CANCELLED'].includes(v.status),'PLAN_STATUS');
    if(v.parentId!==null && v.parentId!==undefined) check(idOK(v.parentId),'PARENT_ID');
    if(v.exception) check(v.exception.childRevisionId===revisionId&&typeof v.exception.parentRevisionId==='string'&&v.exception.reason?.trim()&&v.exception.confirmed===true,'EXCEPTION_PROVENANCE');
  }
  if(edit.kind==='GAME_INTENT') {
    check(edit.id==='game'&&Array.isArray(v.commands)&&v.commands.length>0&&v.commands.length<=10,'GAME_INTENT_SCHEMA');
    for(const c of v.commands) {
      check(['START','TARGET','ARCHIVE','PACE','CONFIGURE'].includes(c.type),'GAME_COMMAND');
      if(['START','TARGET'].includes(c.type)) check(idOK(c.buildId)&&R(c.targetXp).cmp('0')>0,'BUILD_TARGET');
      if(c.type==='START') check(['ALL_ACTIONS','STUDY_ONLY'].includes(c.source),'BUILD_SOURCE');
      if(c.type==='ARCHIVE') check(idOK(c.buildId),'BUILD_ID');
      if(['PACE','CONFIGURE'].includes(c.type)) check(['FAST','STANDARD','LONG'].includes(c.pace),'PACE');
    }
  }
  if(edit.kind==='DEVICE') check(idOK(edit.id)&&['ACTIVE','DORMANT','REVOKED'].includes(v.state),'DEVICE_STATE');
  if(edit.kind!=='ROUTINE'&&provenance.backdatedCorrection) check(provenance.reason?.trim()&&provenance.confirmed===true&&provenance.affectedDates?.length===2&&provenance.affectedDates.every(dateOK),'BACKDATE_PROVENANCE');
}

// Same-row conflicts are handled by the graph. These are relational constraints after union.
export function invariants(projection) {
  const out=[];
  const add=(reason,entries)=>{
    const keys=sorted(entries.map(x=>x.key)),heads=sorted(entries.flatMap(x=>x.heads));
    out.push({id:hash({reason,keys,heads}),scope:'HIERARCHY',reason,keys,heads,status:'OPEN'});
  };
  const rows=new Map(projection.map(e=>[e.key,e]));
  for(const e of projection) {
    if(!['PLAN','BLOCK'].includes(e.kind)||e.status!=='RESOLVED') continue;
    const p=e.value.parentId;if(!p) continue;
    const parent=rows.get(keyOf('PLAN',p));
    if(!parent || parent.status!=='RESOLVED') {add('MISSING_DELETED_OR_CONFLICTED_PARENT',[e,...(parent?[parent]:[])]);continue;}
    const v=e.value,pv=parent.value;
    if(pv.status==='CANCELLED' && v.status!=='CANCELLED') add('PARENT_CANCELLED',[e,parent]);
    if(v.startDate<pv.startDate||v.endDate>pv.endDate) {
      const ex=v.exception;
      if(!(ex?.confirmed&&ex.reason&&ex.childRevisionId===e.heads[0]&&ex.parentRevisionId===parent.heads[0])) add('DATE_CONTAINMENT',[e,parent]);
    }
    const chain=[e],seen=new Set([keyOf(e.kind,e.id)]);let next=parent;
    while(next?.status==='RESOLVED') {
      chain.push(next);if(seen.has(keyOf(next.kind,next.id))){add('HIERARCHY_CYCLE',chain);break;}
      seen.add(keyOf(next.kind,next.id));next=next.value.parentId?rows.get(keyOf('PLAN',next.value.parentId)):null;
    }
  }
  return [...new Map(out.map(c=>[c.id,c])).values()].sort((a,b)=>compare(a.id,b.id));
}

export function financialAggregate(graph, currency, frontier) {
  const rows=graph.project(frontier).filter(e=>e.kind==='FINANCE'),certain=[],disputed=[];
  for(const e of rows) {
    if(e.status==='RESOLVED'&&e.value.currency===currency) certain.push(e.value.amount);
    if(e.status==='CONFLICT'&&e.alternatives.some(a=>a.value?.currency===currency)) disputed.push({id:e.id,alternatives:clone(e.alternatives)});
  }
  return {currency,undisputedTotal:sum(certain).toString(),disputed,complete:!disputed.length,policy:'EXCLUDE_DISPUTED_ALTERNATIVES_NOT_SUMMED'};
}

export function gameDependencies(graph) {
  const p=graph.project(),byKey=new Map(p.map(e=>[e.key,e]));
  const dependencyKeys=new Set(p.filter(e=>['ACTION','GAME_INTENT','DEVICE'].includes(e.kind)).map(e=>e.key));
  const unknown=[];
  const visit=k=>{
    const e=byKey.get(k);if(!e){unknown.push(k);return;}
    for(const a of e.alternatives) for(const d of a.value?.dependencies||[]) {
      const dk=keyOf(d.kind,d.id);if(!dependencyKeys.has(dk)){dependencyKeys.add(dk);visit(dk);}
    }
  };
  for(const k of [...dependencyKeys]) visit(k);
  // Relation conflicts propagate through any explicitly consumed linked plan/block/source.
  const conflicts=graph.conflicts().filter(c=>c.keys.some(k=>dependencyKeys.has(k)));
  return {dependencyKeys:sorted(dependencyKeys),conflicts,unknown:sorted(unknown),safe:conflicts.length===0&&unknown.length===0};
}
