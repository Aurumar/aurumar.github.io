import {requireValue} from '../multi-device/portable/errors.mjs';
import {eq} from '../core/package/parent/v2_phase2/source/canonical.mjs';
import {clock,FORMATS} from './action-model.mjs';
import {WL_FORMAT,DOMAIN_CODES,DOMAIN_NAMES,effectiveActions,entityKey,emptyDomain,financeTotals,shiftDate,dateOK,shape} from './whole-life-model.mjs';

import {MEASUREMENT_FORMAT,measurementProjection} from './measurement.mjs';
import {APP_VERSION,CLIENT} from '../product/runtime-contract.mjs';

export function entities(graph,type){
  return graph.project().filter(e=>e.status==='RESOLVED'&&e.value?.format===WL_FORMAT&&e.value.entityType===type)
    .map(e=>({...structuredClone(e.value),heads:e.heads}));
}
export function wholeHistory(graph,orderedOperations=null){
  if(orderedOperations!==null){
    const all=graph.operations(),seen=new Set();
    requireValue(Array.isArray(orderedOperations)&&orderedOperations.length===all.length,'HOLD_HISTORY_ORDER');
    for(const op of orderedOperations){
      requireValue(!seen.has(op.opId)&&graph.has(op.opId)&&eq(graph.op(op.opId),op)&&op.deps.every(id=>seen.has(id)),'HOLD_HISTORY_ORDER');
      seen.add(op.opId);
    }
  }
  const context=new Map(),heads=new Map(graph.project().map(e=>[e.id,e.heads])),rows=[];
  for(const op of orderedOperations??graph.operations().sort((a,b)=>a.seq-b.seq)){
    op.edits.forEach((e,i)=>{
      const v=e.value,revisionId=op.opId+'#'+i;
      let type,domain=null,title,actionId=v.actionId??null;
      if(v.format===FORMATS.definition){
        context.set(v.actionId,{title:v.title,domain:null});type='ACTION';title=v.title;
      }else if(v.format===WL_FORMAT){
        type=v.entityType;domain=type==='DOMAIN'?v.entityId:type==='FINANCE'?'E':v.data.domain??null;
        title=type==='DOMAIN'?DOMAIN_NAMES[v.entityId]:type==='FINANCE'?v.data.snapshotDate+' 재정 스냅샷':type==='PREFERENCES'?'표시 설정':v.data.title;
        if(type==='ACTION'){context.set(v.entityId,{title:v.data.title,domain:v.data.domain});actionId=v.entityId;}
      }else{
        type=v.format===FORMATS.result?'RESULT':v.format===MEASUREMENT_FORMAT?'MEASUREMENT':'RESTART';const current=context.get(v.actionId);
        title=current?.title??v.actionId;domain=current?.domain??null;
      }
      const currentHeads=heads.get(e.id)??[];
      rows.push({revisionId,parents:[...e.parents],sequence:op.seq,entityKey:e.id,actionId,type,domain,title,
        localDate:v.localDate??op.provenance.recordedLocalDate??null,
        value:structuredClone(v),intent:e.intent,reason:op.provenance.reason,recordedAt:op.provenance.recordedAt,
        currentHeads,canCorrect:['RESULT','RESTART','MEASUREMENT'].includes(type)&&currentHeads.length===1&&currentHeads[0]===revisionId});
    });
  }
  return rows.reverse();
}
export function filterHistory(rows,{date=null,domain=null,type=null}={}){
  return rows.filter(r=>(!date||r.localDate===date)&&(!domain||(domain==='UNASSIGNED'?r.domain===null:r.domain===domain))&&(!type||r.type===type));
}
export function expandCalendar(events,plans,from,to){
  requireValue(dateOK(from)&&dateOK(to)&&from<=to,'INVALID_CALENDAR_RANGE');
  const rows=[];
  const add=r=>{if(r.date>=from&&r.date<=to)rows.push(r);};
  for(const event of events){
    const d=event.data;if(d.deleted)continue;
    const r=d.recurrence,count=r?.count??1,step=r?r.interval*(r.frequency==='WEEKLY'?7:1):0;
    for(let i=0;i<count;i++)add({id:event.entityId+':'+i,eventId:event.entityId,title:d.title,domain:d.domain,date:shiftDate(d.date,i*step),time:d.time,allDay:d.allDay,kind:d.kind,planId:d.planId,source:'EVENT',occurrence:i+1,totalOccurrences:count,notes:d.notes});
  }
  for(const plan of plans){
    const d=plan.data;if(d.status==='COMPLETE')continue;
    const shared={domain:d.domain,planId:plan.entityId,time:null,allDay:true,source:'PLAN',notes:''};
    if(d.dueDate)add({...shared,id:plan.entityId+':due',title:d.title+' · 기한',date:d.dueDate,kind:'DEADLINE'});
    if(d.reviewDate)add({...shared,id:plan.entityId+':review',title:d.title+' · 검토',date:d.reviewDate,kind:'REVIEW'});
    for(const m of d.milestones)if(m.dueDate&&!m.done)add({...shared,id:plan.entityId+':'+m.milestoneId,title:m.title,date:m.dueDate,kind:'MILESTONE'});
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??'').localeCompare(b.time??'')||a.id.localeCompare(b.id));
}
export function calendarProjection(graph,body){
  shape(body,['mode','date']);requireValue(['TODAY','7_DAY','MONTH'].includes(body.mode)&&dateOK(body.date),'INVALID_CALENDAR_VIEW');
  const from=body.mode==='MONTH'?body.date.slice(0,7)+'-01':body.date;
  let to=body.mode==='7_DAY'?shiftDate(from,6):from;
  if(body.mode==='MONTH'){
    const d=new Date(from+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);to=d.toISOString().slice(0,10);
    requireValue(dateOK(to),'INVALID_CALENDAR_RANGE');
  }
  return {mode:body.mode,from,to,events:expandCalendar(entities(graph,'EVENT'),entities(graph,'PLAN'),from,to)};
}
export function progressProjection(graph,date=clock().localDate,orderedOperations=null){
  const history=wholeHistory(graph,orderedOperations),latest=new Map();
  for(const row of history)if(row.type==='RESULT'&&!latest.has(row.entityKey))latest.set(row.entityKey,row);
  const results=[...latest.values()],positive=results.filter(r=>['COMPLETE','PARTIAL'].includes(r.value.outcome));
  const counts={COMPLETE:0,PARTIAL:0,NOT_DONE:0};for(const r of results)counts[r.value.outcome]++;
  const domains=DOMAIN_CODES.map(domain=>({domain,name:DOMAIN_NAMES[domain],recorded:results.filter(r=>r.domain===domain).length,positive:positive.filter(r=>r.domain===domain).length}));
  const trend=Array.from({length:14},(_,i)=>{const day=shiftDate(date,i-13),r=results.filter(r=>r.value.localDate===day);return {date:day,recorded:r.length,complete:r.filter(v=>v.value.outcome==='COMPLETE').length,partial:r.filter(v=>v.value.outcome==='PARTIAL').length,notDone:r.filter(v=>v.value.outcome==='NOT_DONE').length};});
  const plans=entities(graph,'PLAN'),milestones=plans.flatMap(p=>p.data.milestones.map(m=>({...m,planId:p.entityId,planTitle:p.data.title,domain:p.data.domain})));
  const streaks=effectiveActions(graph).filter(a=>a.trackStreak).map(a=>{
    const days=new Map(results.filter(r=>r.actionId===a.actionId).map(r=>[r.value.localDate,r.value.outcome]));
    let day=days.has(date)?date:shiftDate(date,-1),length=0;
    while(days.get(day)==='COMPLETE'&&length<10000){length++;day=shiftDate(day,-1);}
    return {actionId:a.actionId,title:a.title,days:length,policy:'CONSECUTIVE_LOCAL_DAYS_WITH_COMPLETE_ONLY'};
  });
  const completedMilestones=milestones.filter(m=>m.done);
  return {measurement:measurementProjection(graph),game:{status:'HOLD',policy:'CONSERVATIVE_SEALED_RATIONAL_V1',code:'UF14_APPROVED_DAILY_CAP_UNDEFINED',xp:null,build:null,pace:null},actionAccumulation:counts,totalRecorded:results.length,positiveActionDays:positive.length,domainActivity:domains,
    unassignedActivity:results.filter(r=>r.domain===null).length,trend,streaks,
    planMilestones:plans.map(p=>({planId:p.entityId,title:p.data.title,total:p.data.milestones.length,done:p.data.milestones.filter(m=>m.done).length})),
    completedMilestones,house:{actionBlocks:positive.length,milestoneBlocks:completedMilestones.length,
      totalBlocks:positive.length+completedMilestones.length,policy:'ONE_CURRENT_POSITIVE_ACTION_DAY_OR_COMPLETED_MILESTONE_PER_BLOCK',
      visualCapacity:48,correctionsMayChangeProjection:true,lifeCompletionPercentage:null}};
}
export function wholeLifeView(graph,date=clock().localDate,orderedOperations=null){
  const domainRows=new Map(entities(graph,'DOMAIN').map(v=>[v.entityId,v]));
  const preferences=entities(graph,'PREFERENCES')[0]??{entityId:'display',data:{hiddenDomains:[],actionOrder:[]},heads:[]};
  const domains=DOMAIN_CODES.map(code=>({code,name:DOMAIN_NAMES[code],data:domainRows.get(code)?.data??emptyDomain(),heads:domainRows.get(code)?.heads??[],hidden:preferences.data.hiddenDomains.includes(code)}));
  const plans=entities(graph,'PLAN'),events=entities(graph,'EVENT');
  const finances=entities(graph,'FINANCE').sort((a,b)=>b.data.snapshotDate.localeCompare(a.data.snapshotDate)||b.updatedAt.localeCompare(a.updatedAt)||b.entityId.localeCompare(a.entityId));
  const history=wholeHistory(graph,orderedOperations),progress=progressProjection(graph,date,orderedOperations);
  const actions=effectiveActions(graph).map(a=>({...a,restartPoint:graph.entity('NOTE','sd1:restart:'+a.actionId).value?.text??''}));
  return {version:APP_VERSION,runtimeContract:CLIENT,localDate:date,domains,plans,events,finances,preferences,actions,
    finance:financeTotals(finances[0]??null,date),progress,
    home:{priorityActions:actions.filter(a=>a.active).slice(0,5),restartPoints:actions.filter(a=>a.restartPoint.trim()),
      upcoming:expandCalendar(events,plans,date,shiftDate(date,90)).slice(0,10),
      activePlans:plans.filter(p=>['ACTIVE','MAINTAIN'].includes(p.data.status)),
      recentActualActions:history.filter(r=>r.type==='RESULT').slice(0,6)}};
}
