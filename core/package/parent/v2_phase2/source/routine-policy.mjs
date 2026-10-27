import {canonical,check,dateOK,sorted} from './canonical.mjs';
import {routineEffectiveHeads,routineRevisionDay} from './routine-effective.mjs';

export const ROUTINE_COMPARISON_WORK_LIMIT=2_000_000;
const dayNumber=date=>{check(dateOK(date),'DATE_REQUIRED');return Math.floor(Date.parse(date+'T12:00:00Z')/86400000);};
const dayString=day=>new Date(day*86400000).toISOString().slice(0,10);

// A coverage claim is uncertainty, never consent. Enumerate every retained
// interpretation (including an IMPORT with no mask), independent of root order.
const coverages=history=>{
  const roots=history.filter(r=>r.intent==='IMPORT');
  return roots.length?[...new Set(roots.map(r=>r.value?.historyCoverageStart??null))].sort():[null];
};
const signature=result=>canonical(
    result.status==='KNOWN'?{status:'SCHEDULED_WITH_TARGET',target:result.target}:
    result.status==='UNKNOWN'&&['NO_UNIQUE_EFFECTIVE_TARGET','PRE_V2_HISTORY_UNAVAILABLE'].includes(result.reason)?{status:'UNKNOWN'}:
    {status:result.status,...(result.reason?{reason:result.reason}:{})}
);
function semanticsAt(history,date,coverage) {
  if(coverage!==null&&date<coverage)return [signature({status:'UNKNOWN',reason:'PRE_V2_HISTORY_UNAVAILABLE'})];
  const heads=routineEffectiveHeads(history,date);
  return heads.length?sorted(heads.map(r=>signature(routineRevisionDay(r,date)))):
    [signature({status:'UNKNOWN',reason:'NO_UNIQUE_EFFECTIVE_TARGET'})];
}
// Equal alternatives collapse only for authorization. Public history, reasons
// and every conflicting revision/assignment remain untouched.
export function routineDaySemantics(history,date) {
  check(dateOK(date),'DATE_REQUIRED');
  let answer;
  for(const coverage of coverages(history)) {
    const current=semanticsAt(history,date,coverage);
    check(answer===undefined||canonical(answer)===canonical(current),'ROUTINE_IMPORT_COVERAGE_AMBIGUOUS');
    answer=current;
  }
  return answer;
}

export function routinePastChange(history,proposed,cutoff) {
  const end=dayNumber(cutoff),next=[...history,proposed],boundaries=new Set([end]);
  const interpretations=coverages(next),hasPriorImport=history.some(r=>r.intent==='IMPORT');
  let work=0,weight=1;
  const spend=n=>{work+=n;check(work<=ROUTINE_COMPARISON_WORK_LIMIT,'ROUTINE_SEMANTIC_LIMIT');};
  const boundary=date=>{const day=dayNumber(date);if(day<end)boundaries.add(day);return day;};
  for(const r of next) {
    spend(1+r.parents.length);weight+=4+r.parents.length*2;
    if(r.temporal){boundary(r.temporal.from);if(r.temporal.to!==null)boundary(r.temporal.to);}
    // An untimed revision applies across the whole supported date domain,
    // including UNKNOWN versus NOT_SCHEDULED before its first assignment.
    else boundary('0000-01-01');
    if(r.value?.historyCoverageStart)boundary(r.value.historyCoverageStart);
    for(const a of r.value?.assignments||[]) {
      // Include serialized target size in the conservative work estimate.
      const cost=1+canonical(a.target).length+(a.schedule.days?.length||0)+(a.schedule.dates?.length||0);
      spend(cost);weight+=cost;
      boundary(a.from);if(a.to!==null)boundary(a.to);
      for(const date of a.schedule.dates||[]) {
        const day=dayNumber(date);
        if(date>=a.from&&(a.to===null||date<a.to)&&day<end){boundaries.add(day);if(day+1<end)boundaries.add(day+1);}
      }
    }
  }
  const cuts=[...boundaries].sort((a,b)=>a-b);
  let first=null,last=null,sampledDays=0;
  for(let i=0;i+1<cuts.length;i++) {
    const from=cuts[i],to=cuts[i+1];
    // Temporal heads, assignments and DATES membership are constant within a
    // segment. WEEKDAYS repeats every seven days, so these samples are exact.
    for(let day=from;day<Math.min(to,from+7);day++) {
      sampledDays++;
      const date=dayString(day);
      let delta;
      for(const coverage of interpretations) {
        // One aggregate budget covers all interpretations. A first import may
        // mask proposed knowledge, but cannot manufacture knowledge in empty H.
        spend(weight*2);
        const before=semanticsAt(history,date,hasPriorImport?coverage:null),after=semanticsAt(next,date,coverage);
        const current=canonical(before)===canonical(after)?null:canonical({before,after});
        check(delta===undefined||delta===current,'ROUTINE_IMPORT_COVERAGE_AMBIGUOUS');
        delta=current;
      }
      if(delta!==null) {
        const finalOccurrence=day+7*Math.floor((to-1-day)/7);
        first=first===null?day:Math.min(first,day);
        last=last===null?finalOccurrence:Math.max(last,finalOccurrence);
      }
    }
  }
  return {changed:first!==null,first:first===null?null:dayString(first),last:last===null?null:dayString(last),sampledDays,segments:Math.max(0,cuts.length-1),interpretations:interpretations.length,work};
}

// Shared schema validation is deliberately ROUTINE-only. Absent flags and
// supplied boolean false are valid for no-change writes; malformed supplied
// fields are never converted into ordinary provenance.
export function validateRoutineCorrectionShape(provenance) {
  for(const flag of ['backdatedCorrection','confirmed'])
    if(Object.hasOwn(provenance,flag))check(typeof provenance[flag]==='boolean','BACKDATE_PROVENANCE');
  if(Object.hasOwn(provenance,'affectedDates')) {
    const a=provenance.affectedDates;
    check(Array.isArray(a)&&a.length===2&&a.every(dateOK)&&a[0]<=a[1],'BACKDATE_PROVENANCE');
  }
  if(provenance.backdatedCorrection===true)
    check(provenance.confirmed===true&&typeof provenance.reason==='string'&&provenance.reason.trim()&&Array.isArray(provenance.affectedDates),'BACKDATE_PROVENANCE');
}

export function requireRoutineHistoryProvenance(history,proposed,provenance) {
  validateRoutineCorrectionShape(provenance);
  const changed=routinePastChange(history,proposed,provenance.recordedLocalDate);
  if(changed.changed)check(provenance.backdatedCorrection===true&&provenance.confirmed===true&&typeof provenance.reason==='string'&&provenance.reason.trim()&&provenance.affectedDates?.[0]<=changed.first&&provenance.affectedDates?.[1]>=changed.last,'BACKDATE_PROVENANCE');
}
