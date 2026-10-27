import {requireValue} from '../multi-device/portable/errors.mjs';
import {shape,dateOK,idOK,text} from './whole-life-model.mjs';
export const MEASUREMENT_FORMAT='LB_ACTION_MEASUREMENT_2';
export const measurementKey=(action,date,id)=>`sd2:measurement:${action}:${date}:${id}`;
export function validateMeasurement(m){
 shape(m,['observationId','actualEffectiveDuration','quantity']);requireValue(idOK(m.observationId),'INVALID_MEASUREMENT_ID');
 const d=m.actualEffectiveDuration,q=m.quantity;
 if(d!==null){shape(d,['value','unit']);requireValue(d.unit==='SECOND'&&Number.isSafeInteger(d.value)&&d.value>=0&&d.value<=86400,'INVALID_ACTUAL_EFFECTIVE_DURATION');}
 if(q!==null){shape(q,['value','unit','identity']);requireValue(typeof q.value==='string'&&/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(q.value),'INVALID_QUANTITY');text(q.unit,40,false);text(q.identity,80,false);requireValue(q.unit===q.unit.trim()&&q.identity===q.identity.trim(),'INVALID_QUANTITY_UNIT');}
 requireValue(d!==null||q!==null,'EMPTY_MEASUREMENT');return m;
}
export function validateMeasurementRecord(edit){
 const v=edit.value;shape(v,['format','domainSchemaVersion','actionId','localDate','timeZone','recordedAt','measurement']);
 requireValue(v.format===MEASUREMENT_FORMAT&&v.domainSchemaVersion===2&&idOK(v.actionId)&&dateOK(v.localDate),'INVALID_MEASUREMENT_RECORD');
 validateMeasurement(v.measurement);text(v.timeZone,100,false);
 requireValue(typeof v.recordedAt==='string'&&new Date(v.recordedAt).toISOString()===v.recordedAt&&edit.id===measurementKey(v.actionId,v.localDate,v.measurement.observationId),'INVALID_MEASUREMENT_RECORD');
}
// Integer decimal arithmetic; quantities are grouped only by action, identity AND unit.
export function measurementProjection(graph){
 const rows=graph.project().filter(r=>r.status==='RESOLVED'&&r.value?.format===MEASUREMENT_FORMAT);
 const durations=rows.filter(r=>r.value.measurement.actualEffectiveDuration!==null),groups=new Map();
 for(const r of rows){const v=r.value,q=v.measurement.quantity;if(q===null)continue;const key=JSON.stringify([v.actionId,q.identity,q.unit]);const old=groups.get(key)??{actionId:v.actionId,identity:q.identity,unit:q.unit,scaled:0n,observations:0};const [a,b='']=q.value.split('.');old.scaled+=BigInt(a)*1000000n+BigInt((b+'000000').slice(0,6));old.observations++;groups.set(key,old);}
 return {policy:'CURRENT_RAW_OBSERVATIONS_V1',observations:rows.length,durationObservations:durations.length,totalEffectiveSeconds:durations.length?durations.reduce((n,r)=>n+r.value.measurement.actualEffectiveDuration.value,0):null,durationUnit:'SECOND',quantities:[...groups.values()].map(g=>{let value=String(g.scaled/1000000n)+'.'+String(g.scaled%1000000n).padStart(6,'0');value=value.replace(/0+$/,'').replace(/\.$/,'');const {scaled,...rest}=g;return {...rest,value};}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),inferredResults:null,goalCompletion:null};
}
