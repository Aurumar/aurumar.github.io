import {check,clone,dateOK} from './canonical.mjs';

// Shared by effective history and admission policy. Causality selects revisions;
// the floating local calendar date selects intervals and schedule membership.
export function routineEffectiveHeads(history,date) {
  const byId=new Map(history.map(r=>[r.revisionId,r]));
  const applicable=history.filter(r=>!r.temporal||r.temporal.from<=date&&(r.temporal.to===null||date<r.temporal.to));
  const ancestors=new Set(),todo=applicable.flatMap(r=>r.parents);
  while(todo.length){const id=todo.pop();if(ancestors.has(id))continue;ancestors.add(id);todo.push(...(byId.get(id)?.parents||[]));}
  return applicable.filter(r=>!ancestors.has(r.revisionId));
}

export function routineRevisionDay(selected,date) {
  check(dateOK(date),'DATE_REQUIRED');
  if(selected.value===null)return {status:'DELETED',value:null};
  const matches=selected.value.assignments.filter(a=>a.from<=date&&(a.to===null||date<a.to));
  if(!matches.length)return {status:'NOT_SCHEDULED',value:null};
  if(matches.length!==1)return {status:'UNKNOWN',reason:'TARGET_CONFLICT'};
  const a=matches[0],weekday=new Date(date+'T12:00:00Z').getUTCDay();
  check(['EVERY_DAY','WEEKDAYS','DATES'].includes(a.schedule.type),'ROUTINE_CALENDAR');
  if(a.schedule.type==='WEEKDAYS'&&!a.schedule.days.includes(weekday))return {status:'NOT_SCHEDULED',value:null};
  if(a.schedule.type==='DATES'&&!a.schedule.dates.includes(date))return {status:'NOT_SCHEDULED',value:null};
  return {status:'KNOWN',target:clone(a.target),assignment:clone(a),revisionId:selected.revisionId,actual:'SEPARATE_OBSERVATION'};
}

export function routineDayAlternatives(history,date) {
  check(dateOK(date),'DATE_REQUIRED');
  const imported=history.find(r=>r.intent==='IMPORT');
  if(imported?.value?.historyCoverageStart>date)return [{status:'UNKNOWN',reason:'PRE_V2_HISTORY_UNAVAILABLE'}];
  const heads=routineEffectiveHeads(history,date);
  if(!heads.length)return [{status:'UNKNOWN',reason:'NO_UNIQUE_EFFECTIVE_TARGET'}];
  return heads.map(r=>routineRevisionDay(r,date));
}
