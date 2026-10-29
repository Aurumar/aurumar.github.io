import {requireValue} from '../multi-device/portable/errors.mjs';
import {sha,encode} from '../core/package/src/codec.mjs';
import {canonical} from '../core/package/parent/v2_phase2/source/canonical.mjs';
import {FIN_TYPES,FIN_LIMITS,validateFinData,finTransition,finAfterSet} from './fin-model.mjs';

export const WL_FORMAT='LB_WHOLE_LIFE_1';
export const DOMAIN_NAMES=Object.freeze({
  A:'가치 · 정체성 · 삶의 방향',B:'신체 · 마음 건강',C:'수면 · 에너지 · 일상 관리',
  D:'생계 · 취업 · 일',E:'재정',F:'학업 · 진로',G:'주거 · 가족 · 독립',
  H:'관계 · 친구 · 가족 계획',I:'디지털 · 여가 · 회복',J:'행정 · 지원 · 생활 관리',
});
export const DOMAIN_CODES=Object.freeze(Object.keys(DOMAIN_NAMES));
export const DOMAIN_STATUSES=Object.freeze(['ACTIVE','MAINTAIN','DEFERRED_WITH_REASON','UNKNOWN','NOT_APPLICABLE']);
export const PLAN_STATUSES=Object.freeze(['ACTIVE','MAINTAIN','DEFERRED_WITH_REASON','COMPLETE','UNKNOWN']);
export const ENTITY_TYPES=Object.freeze(['ACTION','DOMAIN','PLAN','EVENT','FINANCE','PREFERENCES',...FIN_TYPES]);
const LIMITS={ACTION:100,DOMAIN:10,PLAN:200,EVENT:1000,FINANCE:500,PREFERENCES:1,...FIN_LIMITS};
export const entityKey=(type,id)=>'sd11:'+type.toLowerCase()+':'+id;
export function shape(v,keys){
  requireValue(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'),'INVALID_WHOLE_LIFE_SCHEMA');
}
export function text(v,max=2000,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_TEXT');
}
export const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
export function dateOK(v){
  return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
}
const instantOK=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const nullableDate=v=>v===null||dateOK(v);
const nullableId=v=>v===null||idOK(v);
const domainOK=v=>v===null||DOMAIN_CODES.includes(v);
const bool=v=>typeof v==='boolean';
const unique=a=>new Set(a).size===a.length;
export function shiftDate(date,days){const v=new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);requireValue(dateOK(v),'INVALID_DATE_RANGE');return v;}
export function validateData(type,id,d){
  requireValue(ENTITY_TYPES.includes(type)&&idOK(id),'INVALID_ENTITY_ID');
  if(FIN_TYPES.includes(type)){validateFinData(type,id,d);return;}
  if(type==='ACTION'){
    shape(d,['title','active','domain','planId','trackStreak']);text(d.title,100,false);
    requireValue(bool(d.active)&&domainOK(d.domain)&&nullableId(d.planId)&&bool(d.trackStreak),'INVALID_ACTION_DEFINITION');
  }else if(type==='DOMAIN'){
    shape(d,['status','currentState','desiredState','currentPlan','nextAction','blocker','reviewTrigger','deferredReason']);
    requireValue(DOMAIN_CODES.includes(id)&&DOMAIN_STATUSES.includes(d.status),'INVALID_DOMAIN');
    for(const field of ['currentState','desiredState','currentPlan','nextAction','blocker','reviewTrigger','deferredReason'])text(d[field]);
    requireValue(d.status!=='DEFERRED_WITH_REASON'||d.deferredReason.trim(),'DEFERRED_REASON_REQUIRED');
  }else if(type==='PLAN'){
    shape(d,['title','domain','status','goal','currentStage','milestones','nextAction','dueDate','reviewDate','blockedReason','notes']);
    text(d.title,150,false);requireValue(DOMAIN_CODES.includes(d.domain)&&PLAN_STATUSES.includes(d.status),'INVALID_PLAN');
    for(const field of ['goal','currentStage','nextAction','blockedReason'])text(d[field]);text(d.notes,4000);
    requireValue(d.status!=='DEFERRED_WITH_REASON'||d.blockedReason.trim(),'DEFERRED_REASON_REQUIRED');
    requireValue(nullableDate(d.dueDate)&&nullableDate(d.reviewDate),'INVALID_DATE');
    requireValue(Array.isArray(d.milestones)&&d.milestones.length<=60,'MILESTONE_LIMIT');
    for(const m of d.milestones){shape(m,['milestoneId','title','done','dueDate']);requireValue(idOK(m.milestoneId)&&bool(m.done)&&nullableDate(m.dueDate),'INVALID_MILESTONE');text(m.title,200,false);}
    requireValue(unique(d.milestones.map(m=>m.milestoneId)),'DUPLICATE_MILESTONE');
  }else if(type==='EVENT'){
    shape(d,['title','domain','date','time','allDay','kind','planId','milestoneId','recurrence','notes','deleted']);
    text(d.title,150,false);text(d.notes,2000);
    requireValue(domainOK(d.domain)&&dateOK(d.date)&&nullableId(d.planId)&&nullableId(d.milestoneId),'INVALID_EVENT');
    requireValue(bool(d.allDay)&&bool(d.deleted)&&(d.time===null||typeof d.time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(d.time)),'INVALID_EVENT_TIME');
    requireValue(!d.allDay||d.time===null,'ALL_DAY_TIME_CONFLICT');
    requireValue(['DEADLINE','APPOINTMENT','REVIEW','MILESTONE'].includes(d.kind),'INVALID_EVENT_KIND');
    if(d.recurrence!==null){
      shape(d.recurrence,['frequency','interval','count']);
      const r=d.recurrence;
      requireValue(['DAILY','WEEKLY'].includes(r.frequency)&&Number.isInteger(r.interval)&&r.interval>=1&&r.interval<=30&&Number.isInteger(r.count)&&r.count>=2&&r.count<=52,'INVALID_BOUNDED_RECURRENCE');
      shiftDate(d.date,(r.count-1)*r.interval*(r.frequency==='WEEKLY'?7:1));
    }
  }else if(type==='FINANCE'){
    shape(d,['snapshotDate','currency','minorUnitDigits','cashAccounts','debts','restrictedAssets','monthlyFixedCosts','upcomingPayments','incomeItems','notes']);
    requireValue(dateOK(d.snapshotDate)&&typeof d.currency==='string'&&/^[A-Z]{3}$/.test(d.currency)&&[0,2].includes(d.minorUnitDigits),'INVALID_FINANCE_SNAPSHOT');
    text(d.notes,4000);
    for(const field of ['cashAccounts','debts','restrictedAssets','monthlyFixedCosts','upcomingPayments','incomeItems']){
      const a=d[field];if(a===null)continue;
      requireValue(Array.isArray(a)&&a.length<=50,'FINANCE_ITEM_LIMIT');
      for(const item of a){
        const dated=['upcomingPayments','incomeItems'].includes(field);
        shape(item,dated?['itemId','label','amount','date']:['itemId','label','amount']);
        requireValue(idOK(item.itemId),'INVALID_FINANCE_ITEM');text(item.label,100,false);
        requireValue(item.amount===null||typeof item.amount==='string'&&(d.minorUnitDigits===0?/^(0|[1-9]\d{0,13})$/:/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/).test(item.amount),'INVALID_DECIMAL_AMOUNT');
        if(dated)requireValue(nullableDate(item.date),'INVALID_DATE');
      }
      requireValue(unique(a.map(x=>x.itemId)),'DUPLICATE_FINANCE_ITEM');
    }
  }else{
    shape(d,['hiddenDomains','actionOrder']);
    requireValue(id==='display'&&Array.isArray(d.hiddenDomains)&&d.hiddenDomains.every(x=>DOMAIN_CODES.includes(x))&&unique(d.hiddenDomains),'INVALID_DISPLAY_PREFERENCES');
    requireValue(Array.isArray(d.actionOrder)&&d.actionOrder.length<=100&&d.actionOrder.every(idOK)&&unique(d.actionOrder),'INVALID_ACTION_ORDER');
  }
}
export function validateEntityRecord(edit){
  requireValue(edit.kind==='NOTE'&&edit.temporal===null,'INVALID_APP_RECORD');
  const v=edit.value;shape(v,['format','entityType','entityId','data','createdAt','updatedAt']);
  validateData(v.entityType,v.entityId,v.data);
  requireValue(v.format===WL_FORMAT&&edit.id===entityKey(v.entityType,v.entityId)&&instantOK(v.createdAt)&&instantOK(v.updatedAt),'INVALID_WHOLE_LIFE_RECORD');
}
export function normalizeEntity(body){
  shape(body,['requestId','commandDigest','entityType','entityId','expectedHeads','data','reason','confirmed']);
  requireValue(typeof body.requestId==='string'&&typeof body.commandDigest==='string'&&/^[a-f0-9]{64}$/.test(body.requestId)&&/^[a-f0-9]{64}$/.test(body.commandDigest),'INVALID_REQUEST_ID');
  requireValue(Array.isArray(body.expectedHeads)&&body.expectedHeads.length<=1&&body.expectedHeads.every(h=>typeof h==='string'&&/^[a-f0-9]{64}#[0-9]+$/.test(h)),'INVALID_EXPECTED_HEADS');
  text(body.reason,300,false);requireValue(bool(body.confirmed),'INVALID_CONFIRMATION');
  validateData(body.entityType,body.entityId,body.data);
  const command={type:'ENTITY',entityType:body.entityType,entityId:body.entityId,expectedHeads:[...body.expectedHeads],data:structuredClone(body.data),reason:body.reason.trim(),confirmed:body.confirmed};
  const digest=sha(encode(command));requireValue(digest===body.commandDigest,'COMMAND_DIGEST_MISMATCH');
  return {requestId:body.requestId,digest,command};
}
function context(rows){
  const entities=new Map(),actions=new Set();
  for(const value of rows){
    if(value?.format==='LB_USER_ACTION_DEF_1')actions.add(value.actionId);
    if(value?.format===WL_FORMAT){entities.set(entityKey(value.entityType,value.entityId),value);if(value.entityType==='ACTION')actions.add(value.entityId);}
  }
  return {entities,actions};
}
function transition(v,old,ctx,provenance){
  const {entityType:type,entityId:id,data:d}=v;
  requireValue(v.updatedAt===provenance.recordedAt&&v.createdAt===(old?old.createdAt:v.updatedAt),'INVALID_ENTITY_TIMESTAMPS');
  if(FIN_TYPES.includes(type)){finTransition(v,old,ctx,provenance);return;}
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<LIMITS[type],'APP_ENTITY_LIMIT');
  if(type==='ACTION'){
    if(!ctx.actions.has(id))requireValue(ctx.actions.size<100,'APP_ACTION_LIMIT');
    requireValue(d.planId===null||ctx.entities.has(entityKey('PLAN',d.planId)),'UNKNOWN_PLAN_LINK');
  }
  if(type==='EVENT'){
    requireValue(d.planId===null||ctx.entities.has(entityKey('PLAN',d.planId)),'UNKNOWN_PLAN_LINK');
    if(d.milestoneId!==null)requireValue(d.planId!==null&&ctx.entities.get(entityKey('PLAN',d.planId))?.data.milestones.some(m=>m.milestoneId===d.milestoneId),'UNKNOWN_MILESTONE_LINK');
    requireValue(!old?.data.deleted,'EVENT_ALREADY_DELETED');
    if(d.deleted){
      requireValue(old&&provenance.confirmed===true&&provenance.reason.trim(),'DELETE_CONFIRMATION_REQUIRED');
      requireValue(canonical(d)===canonical({...old.data,deleted:true}),'DELETE_MUST_PRESERVE_EVENT');
    }
  }
  if(type==='PREFERENCES')requireValue(d.actionOrder.every(actionId=>ctx.actions.has(actionId)),'UNKNOWN_ACTION_ORDER');
  if(type==='FINANCE')requireValue(dateOK(provenance.recordedLocalDate)&&d.snapshotDate<=provenance.recordedLocalDate,'FUTURE_SNAPSHOT_REJECTED');
}
export function wholeEdit(graph,c,t){
  const key=entityKey(c.entityType,c.entityId),old=graph.entity('NOTE',key);
  requireValue(canonical(old.heads)===canonical(c.expectedHeads),'STALE_HEADS');
  requireValue(['RESOLVED','MISSING'].includes(old.status),'HOLD_APP_CONFLICT');
  const value={format:WL_FORMAT,entityType:c.entityType,entityId:c.entityId,data:structuredClone(c.data),createdAt:old.value?.createdAt??t.recordedAt,updatedAt:t.recordedAt};
  transition(value,old.value,context(graph.project().map(e=>e.value)),{...c,recordedAt:t.recordedAt,recordedLocalDate:t.localDate});
  return {kind:'NOTE',id:key,parents:old.heads,value,intent:old.heads.length?'EDIT':'CREATE',temporal:null};
}
export function validateWholeSequence(operations){
  const ctx=context([]);
  for(const op of operations){
    for(const edit of op.edits){
      const v=edit.value;
      if(v.format==='LB_USER_ACTION_DEF_1')ctx.actions.add(v.actionId);
      if(v.format===WL_FORMAT){
        requireValue(op.provenance.commandType==='ENTITY'&&op.edits.length===1&&typeof op.provenance.confirmed==='boolean','HOLD_APP_PROVENANCE');
        const key=entityKey(v.entityType,v.entityId);
        const prior=ctx.entities.get(key);transition(v,prior,ctx,op.provenance);ctx.entities.set(key,v);finAfterSet(ctx,v,prior);
        if(v.entityType==='ACTION')ctx.actions.add(v.entityId);
      }else {requireValue(op.provenance.commandType!=='ENTITY','HOLD_APP_PROVENANCE');
        if(v.format==='LB_ACTION_MEASUREMENT_2'){
          requireValue(ctx.actions.has(v.actionId)&&op.provenance.domainSchemaVersion===2,'HOLD_MEASUREMENT_PROVENANCE');
          requireValue(op.provenance.recordedAt===v.recordedAt&&v.localDate<=op.provenance.recordedLocalDate,'HOLD_MEASUREMENT_DATE');
          requireValue(edit.parents.length?op.provenance.commandType==='CORRECTION'&&op.provenance.confirmed===true:op.provenance.commandType==='RECORD','HOLD_MEASUREMENT_CORRECTION');
        }
      }
    }
  }
}
export function effectiveActions(graph){
  const rows=graph.project(),values=new Map();
  for(const row of rows)if(row.value?.format==='LB_USER_ACTION_DEF_1'){
    const v=row.value;values.set(v.actionId,{actionId:v.actionId,title:v.title,active:v.active,displayOrder:v.displayOrder,domain:null,planId:null,trackStreak:false,metadataHeads:[]});
  }
  for(const row of rows)if(row.value?.format===WL_FORMAT&&row.value.entityType==='ACTION'){
    const v=row.value;values.set(v.entityId,{...values.get(v.entityId),actionId:v.entityId,...v.data,displayOrder:values.get(v.entityId)?.displayOrder??100,metadataHeads:row.heads,createdAt:v.createdAt});
  }
  const order=graph.entity('NOTE',entityKey('PREFERENCES','display')).value?.data.actionOrder??[];
  const positions=new Map(order.map((id,i)=>[id,i]));
  return [...values.values()].sort((a,b)=>(positions.get(a.actionId)??100+a.displayOrder)-(positions.get(b.actionId)??100+b.displayOrder)||(a.createdAt??'').localeCompare(b.createdAt??'')||a.actionId.localeCompare(b.actionId));
}
export const emptyDomain=()=>({status:'UNKNOWN',currentState:'',desiredState:'',currentPlan:'',nextAction:'',blocker:'',reviewTrigger:'',deferredReason:''});
export function decimalUnits(s,digits){const [a,b='']=s.split('.');return BigInt(a)*10n**BigInt(digits)+BigInt((b+'00').slice(0,digits)||'0');}
export function decimalText(n,digits){const sign=n<0n?'-':'';n=n<0n?-n:n;const scale=10n**BigInt(digits);return sign+String(n/scale)+(digits?'.'+String(n%scale).padStart(digits,'0'):'');}
export function financeTotals(snapshot,date){
  if(!snapshot)return {known:false,totalLiquidCash:null,totalDebt:null,totalRestrictedAssets:null,netPosition:null,currentMonthFixedCost:null,monthlyFixedCost:null,nextPayment:null,currency:null};
  const d=snapshot.data??snapshot,scale=d.minorUnitDigits;
  const total=rows=>rows===null||rows.some(r=>r.amount===null)?null:rows.reduce((sum,r)=>sum+decimalUnits(r.amount,scale),0n);
  const cash=total(d.cashAccounts),debt=total(d.debts),restricted=total(d.restrictedAssets),fixed=total(d.monthlyFixedCosts);
  const show=v=>v===null?null:decimalText(v,scale);
  return {known:true,snapshotDate:d.snapshotDate,currency:d.currency,minorUnitDigits:scale,totalLiquidCash:show(cash),totalDebt:show(debt),totalRestrictedAssets:show(restricted),
    netPosition:cash===null||debt===null||restricted===null?null:show(cash+restricted-debt),
    netPositionFormula:'LIQUID_CASH + RESTRICTED_ASSETS - DEBT',monthlyFixedCost:show(fixed),
    currentMonthFixedCost:d.snapshotDate.slice(0,7)===date.slice(0,7)?show(fixed):null,
    nextPayment:d.upcomingPayments===null?null:[...d.upcomingPayments].filter(p=>p.date!==null&&p.date>=date).sort((a,b)=>a.date.localeCompare(b.date)||a.itemId.localeCompare(b.itemId))[0]??null,
    upcomingPaymentsKnown:d.upcomingPayments!==null};
}
