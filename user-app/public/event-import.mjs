// V12F 일정 가져오기(파일, 통제탑 2026-11-16): 공모주 등 바깥 프로그램이 만든 일정 파일(JSON, lifebrick-events-v1)을 읽어 기존 일정 기록(EVENT)으로 넣는다.
// 새 기록 종류 0 · 새 칸 0: 출처·번호(extId)·알림은 일정 메모 마지막 줄 "[가져옴] 출처 #번호 · 알림 n분 전"에 둔다(whole-life-model EVENT 모양 그대로라 r81 앱도 받는다).
//   종류는 기본 4종 이름이면 EVENT.kind, 그 밖(공모주 등)은 V8W1 직접 입력 자리(메모 첫 줄 "[종류] 공모주", kind = 약속).
// 같은 출처 + 같은 번호는 새로 만들지 않고 고친다(내용이 같으면 쓰기 0). 지워 둔 일정은 다시 넣지 않는다. 일정 하나 = 저장 1번(연산 1).
// 파일 고르기(<input type=file>)만 쓴다: host·보호 경로·서버 경로 변경 0, 외부 통신 0. 글은 textContent로만 넣는다(innerHTML 없음).
// 알림: 기존 Fold 로컬 알림(다리 scheduleReminders, 한 번 울림, 전체 64개)에 붙인다(APK 변경 0). PC·iPad에는 일정별 알림 길이 없어 달력에만 보인다.
//   알림 글에도 V10FIX M-08 가림을 쓴다(진료·약 낱말이면 제목 대신 "병원 일정", 종류 "병원"). 메모는 싣지 않는다.
import {dateKeyOK,shiftDay} from './life-model.mjs';
import {splitEventNotes,EVENT_KIND_MAX,EVENT_KIND_BASE} from './life-plan.mjs';
import {splitEventMeta,joinEventMeta} from './life-plan.mjs';   // V12_MERGE: V12A 일정 색·끝 시각·반복 = 메모 둘째 머리 줄 [일정]
import {widgetMedical,WIDGET_HOSPITAL,WIDGET_HOSPITAL_TITLE} from './state-export.mjs';

export const IMPORT_FORMAT='lifebrick-events-v1';
export const IMPORT_MAX=200,IMPORT_MAX_BYTES=1_000_000,TITLE_MAX=150,NOTE_MAX=500,SOURCE_MAX=30,EVENT_LIMIT=1000;   // 제목 150 = EVENT 검증 상한, 1000 = EVENT 기록 상한
export const EXT_ID=/^[A-Za-z0-9._:@-]{1,64}$/,TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const IMPORT_MARK='[가져옴] ',IPO_KIND='공모주';
// 알림 지원 범위: 0분 ~ 7일 전(분 단위). 범위 밖은 가까운 끝값, 소수는 반올림(adjusted로 센다). 종일 일정은 그날 09:00 기준(PC 결제일·시험 알림과 같은 시각).
export const ALARM_MIN=0,ALARM_MAX=7*1440,ALL_DAY_ALARM='09:00';
// Fold 다리 규칙(BridgeInput): 전체 64개, |at − 지금| ≤ 400일, 제목 80자, id [A-Za-z0-9-]{1,40}, 종류 4개(TODAY·REVIEW·HABIT·BUDGET). 기본 알림 4개 몫을 남긴다.
export const ALARM_COUNT_MAX=60,ALARM_AHEAD_DAYS=395,ALARM_ID_PREFIX='lb-ia-',ALARM_KIND='TODAY',ALARM_TAB='#today',ALARM_FLAG_KEY='lb.evimport.alarms';
const KST_OFFSET='+09:00',DAY_MS=86400000;
// V14_IPO_AUTO 공모주 단계 줄: 자동 가져오기가 공모주 일정 메모의 표시 줄 바로 위에 단다(새 칸 0, 사람에게도 읽히는 글). 이 줄이 있으면 Fold·PC 알림 시각을 이 규칙으로 정한다.
export const IPO_STAGE_LINE=Object.freeze({SUB:'공모주 알림 · 청약 전날 20:00 · 첫날 08:30',LIST:'공모주 알림 · 상장일 08:30'});
export const IPO_ALARM_AT=Object.freeze({EVE:'20:00',DAY:'08:30'}),IPO_EVE_ID_PREFIX='lb-ie-';
const STAGE_BY_LINE=new Map(Object.entries(IPO_STAGE_LINE).map(([k,v])=>[v,k]));
export const stageOfNote=note=>{const s=typeof note==='string'?note:'';return STAGE_BY_LINE.get(s.slice(s.lastIndexOf('\n')+1))??null;};
const MARK_LINE=/^\[가져옴\] (.+) #([A-Za-z0-9._:@-]{1,64})(?: · 알림 (\d{1,5})분 전)?$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;   // 제어·글자 방향 문자(보이는 순서를 바꾼다)
const BASE_BY_LABEL=new Map(EVENT_KIND_BASE.flatMap(([v,t])=>[[v,v],[t,v]]));
const len=s=>[...s].length;
const cleanLine=v=>typeof v==='string'&&v.isWellFormed()?v.normalize('NFC').replace(CONTROL,' ').replace(/\s+/g,' ').trim():null;
export const sourceKey=s=>cleanLine(s)??'';

// ---- 메모 마지막 줄(출처·번호·알림) ----
export function markLine(source,extId,alarm){return IMPORT_MARK+source+' #'+extId+(alarm===null?'':' · 알림 '+alarm+'분 전');}
// 일정 메모 → {source,extId,alarm,note}. 가져온 일정이 아니면 null. note = 종류 줄·[일정] 줄(V12A)·표시 줄을 뺀 메모.
export function importMark(notes){
  const body=splitEventMeta(notes).notes,nl=body.lastIndexOf('\n'),last=body.slice(nl+1),m=MARK_LINE.exec(last);
  if(!m)return null;
  return {source:m[1],extId:m[2],alarm:m[3]===undefined?null:Number(m[3]),note:nl<0?'':body.slice(0,nl)};
}

// ---- 파일 읽기(순수). 파일 전체 거절 = {ok:false,code}, 줄 단위 틀림은 건너뛰고 이유별로 센다 ----
export const SKIP_TEXT=Object.freeze({shape:'모양',extId:'번호',dup:'같은 번호',title:'제목',date:'날짜',time:'시각',kind:'종류',note:'메모',alarm:'알림'});
function readItem(x){
  if(!x||typeof x!=='object'||Array.isArray(x))return {bad:'shape'};
  if(typeof x.extId!=='string'||!EXT_ID.test(x.extId))return {bad:'extId'};
  const title=cleanLine(x.title);if(!title||len(title)>TITLE_MAX)return {bad:'title'};
  if(!dateKeyOK(x.date))return {bad:'date'};
  const time=x.time===undefined||x.time===null?null:x.time;if(time!==null&&!(typeof time==='string'&&TIME.test(time)))return {bad:'time'};
  let kind='APPOINTMENT',own='';
  if(x.kind!==undefined&&x.kind!==null){
    const k=cleanLine(x.kind);if(k===null||len(k)>EVENT_KIND_MAX)return {bad:'kind'};
    if(BASE_BY_LABEL.has(k))kind=BASE_BY_LABEL.get(k);else own=k;
  }
  let note='';
  if(x.note!==undefined&&x.note!==null){
    if(typeof x.note!=='string'||!x.note.isWellFormed())return {bad:'note'};
    note=x.note.normalize('NFC').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f؜‎‏‪-‮⁦-⁩]/g,' ').trim();
    if(len(note)>NOTE_MAX)return {bad:'note'};
  }
  let alarm=null,adjusted=false;
  if(x.alarm!==undefined&&x.alarm!==null){
    const n=x.alarm?.minutesBefore;
    if(typeof x.alarm!=='object'||Array.isArray(x.alarm)||typeof n!=='number'||!Number.isFinite(n))return {bad:'alarm'};
    alarm=Math.min(ALARM_MAX,Math.max(ALARM_MIN,Math.round(n)));adjusted=alarm!==n;
  }
  return {item:{extId:x.extId,title,date:x.date,time,kind,own,note,alarm},adjusted};
}
export function parseImport(text){
  if(typeof text!=='string'||!text.trim())return {ok:false,code:'EMPTY'};
  let raw;try{raw=JSON.parse(text.replace(/^﻿/,''));}catch{return {ok:false,code:'NOT_JSON'};}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.format!==IMPORT_FORMAT)return {ok:false,code:'FORMAT'};
  const source=cleanLine(raw.source);if(!source||len(source)>SOURCE_MAX)return {ok:false,code:'SOURCE'};
  if(!Array.isArray(raw.events))return {ok:false,code:'EVENTS'};
  if(raw.events.length>IMPORT_MAX)return {ok:false,code:'TOO_MANY',count:raw.events.length};
  const items=[],skipped={},seen=new Set();let adjusted=0;
  for(const x of raw.events){
    const r=readItem(x);
    if(!r.bad&&seen.has(r.item.extId))r.bad='dup';
    if(r.bad){skipped[r.bad]=(skipped[r.bad]??0)+1;continue;}
    seen.add(r.item.extId);items.push(r.item);if(r.adjusted)adjusted++;
  }
  return {ok:true,source,items,skipped,adjusted,total:raw.events.length};
}

// ---- 미리보기 계획(순수): events = 앱 일정 기록 [{entityId,data,heads}](지운 것 포함) ----
const NEW_EVENT=Object.freeze({title:'',domain:null,date:'',time:null,allDay:true,kind:'APPOINTMENT',planId:null,milestoneId:null,recurrence:null,notes:'',deleted:false});
// 가져온 값만 바꾸고 사용자가 단 영역·계획 연결·반복(과 뒤에 생길 칸)은 그대로 둔다.
// V12_MERGE: V12A 일정 색·끝 시각·반복은 메모 [일정] 줄에 있다 → 다시 가져올 때 그 줄을 그대로 옮겨 둔다. 새 일정은 [일정] 줄 없음 = 종류 기본색 · 반복 아님(recurrence null).
// V13 L-A5: 가져온 설명이 "[일정] 매일"·"[종류] 진료"로 시작해도 joinEventMeta가 머리 표지를 "\"로 막아 저장한다(반복·종류로 읽히지 않고, 다시 가져와도 같은 글 = 그대로). 모르는 칸(extra)도 옮겨 둔다.
export function eventData(source,item,old=null){
  const body=[item.note,markLine(source,item.extId,item.alarm)].filter(Boolean).join('\n'),m=old?splitEventMeta(old.notes):null;
  return {...(old??NEW_EVENT),title:item.title,date:item.date,time:item.time,allDay:item.time===null,kind:item.kind,notes:joinEventMeta(item.own,{color:m?.color??null,end:m?.end??null,repeat:m?.repeat??null,extra:m?.extra},body),deleted:false};
}
const sameData=(a,b)=>{const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();return keys.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));};
export function planImport(parsed,events){
  const byKey=new Map(),key=(s,id)=>sourceKey(s)+'\u0000'+id;let twins=0;
  const rows=[...(events??[])].filter(e=>e?.data&&typeof e.entityId==='string').sort((a,b)=>Number(Boolean(a.data.deleted))-Number(Boolean(b.data.deleted))||String(a.createdAt??'').localeCompare(String(b.createdAt??''))||a.entityId.localeCompare(b.entityId));
  for(const e of rows){const m=importMark(e.data.notes);if(!m)continue;const k=key(m.source,m.extId);if(byKey.has(k)){if(!e.data.deleted)twins++;continue;}byKey.set(k,e);}
  const out=[],counts={NEW:0,CHANGED:0,SAME:0,DELETED:0};
  for(const item of parsed.items){
    const old=byKey.get(key(parsed.source,item.extId))??null;
    let action,data=null;
    if(old?.data.deleted)action='DELETED';
    else{data=eventData(parsed.source,item,old?.data);action=!old?'NEW':sameData(data,old.data)?'SAME':'CHANGED';}
    counts[action]++;out.push({action,item,data,entityId:old?.entityId??null,heads:old?.heads??[]});
  }
  const total=(events??[]).length,need=counts.NEW+counts.CHANGED;
  return {source:parsed.source,rows:out,counts,need,twins,full:total+counts.NEW>EVENT_LIMIT};
}

// ---- Fold 알림(순수 목록 + 보내기). 가져온 일정 중 알림이 있고, 울릴 시각이 지금 뒤 395일 안인 것, 가까운 것부터 60개 ----
const kstMs=(date,hm)=>Date.parse(date+'T'+hm+':00'+KST_OFFSET);
const cut=(s,max)=>[...s].slice(0,max).join('');
const leadText=n=>n===0?'제시각 알림':n%1440===0?n/1440+'일 전 알림':n%60===0?n/60+'시간 전 알림':n+'분 전 알림';
// V14_IPO_AUTO: 자동 가져오기가 단계 줄(IPO_STAGE_LINE, 표시 줄 바로 위)을 단 공모주 일정은 분 대신 정한 시각에 울린다: 청약 = 전날 20:00 + 첫날 08:30, 상장 = 그날 08:30.
//   표시 줄의 분(첫날·상장일 08:30에 맞춘 값)은 단계 줄을 모르는 옛 앱(r82·r83)이 쓰는 값이다. 전날 알림 id = lb-ie-…(첫날 알림과 따로).
export function importAlarms(events,{now}){
  const list=[],ids=new Set();
  for(const e of events??[]){
    const d=e?.data;if(!d||d.deleted||typeof e.entityId!=='string'||!dateKeyOK(d.date)||typeof d.title!=='string')continue;
    const m=importMark(d.notes);if(!m)continue;
    const stage=stageOfNote(m.note);if(!stage&&m.alarm===null)continue;
    const timed=!d.allDay&&typeof d.time==='string'&&TIME.test(d.time);
    const when=stage?[[IPO_EVE_ID_PREFIX,kstMs(shiftDay(d.date,-1),IPO_ALARM_AT.EVE),'청약 전날 알림'],[ALARM_ID_PREFIX,kstMs(d.date,IPO_ALARM_AT.DAY),stage==='SUB'?'청약 첫날 알림':'상장일 알림']].slice(stage==='SUB'?0:1)
      :[[ALARM_ID_PREFIX,kstMs(d.date,timed?d.time:ALL_DAY_ALARM)-m.alarm*60000,leadText(m.alarm)]];
    // V10FIX M-08: 진료·약 낱말이 직접 쓴 종류나 제목(자르기 전 전체)에 있으면 제목·종류를 가린다(잠금 화면에 보일 수 있다).
    const own=splitEventNotes(d.notes).kind,medical=own===WIDGET_HOSPITAL||widgetMedical(own)||widgetMedical(d.title);
    const title=medical?WIDGET_HOSPITAL_TITLE:cut(d.title.trim(),40);if(!title)continue;
    const kindText=medical?WIDGET_HOSPITAL:own||(EVENT_KIND_BASE.find(([v])=>v===d.kind)?.[1]??'');
    for(const [prefix,at,lead] of when){
      if(!(at>now)||at-now>ALARM_AHEAD_DAYS*DAY_MS)continue;
      const id=prefix+e.entityId.replace(/[^A-Za-z0-9-]/g,'-').slice(0,34);if(ids.has(id))continue;
      const body=[Number(d.date.slice(5,7))+'월 '+Number(d.date.slice(8,10))+'일 '+(timed?d.time:'종일'),kindText,lead].filter(Boolean).join(' · ');
      ids.add(id);list.push({id,kind:ALARM_KIND,at,title,body,tab:ALARM_TAB});
    }
  }
  return list.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1)).slice(0,ALARM_COUNT_MAX);
}
const readFlag=s=>{try{return s?.getItem(ALARM_FLAG_KEY)==='1';}catch{return false;}};
const writeFlag=(s,on)=>{try{if(on)s?.setItem(ALARM_FLAG_KEY,'1');else s?.removeItem(ALARM_FLAG_KEY);}catch{/* 다음 열기 때 다시 보낸다 */}};
// 앱 열기·돌아오기(app.mjs nativeResume)에서 부른다. 기본 알림이 다 꺼져 있고 보낼 일정 알림도, 전에 보낸 일정 알림도 없으면 다리를 부르지 않는다(지금과 같음).
export function pushFoldAlarms(br,{on,events,now,storage,stackedToday=false,bedtime=null}){
  const extra=importAlarms(events,{now});
  if(!on&&!extra.length&&!readFlag(storage))return {pushed:false,count:0};
  const r=br.pushReminders({stackedToday,bedtime,extra});
  if(r?.ok===true)writeFlag(storage,extra.length>0);
  return {pushed:true,ok:r?.ok===true,count:extra.length};
}

// ---- 화면: 더보기 아래 칸 하나. ctx = {h:{el,add,button},events(),save(entityId|null,data,heads),reload(),perform(fn),ops()?,alarms()?} ----
export const IMPORT_TEXT=Object.freeze({
  title:'일정 가져오기 (파일)',
  lead:'공모주 알리미 같은 프로그램이 만든 일정 파일(.json · '+IMPORT_FORMAT+')을 고르면 먼저 미리 보여 주고, 확인하면 일정에 넣어요. 같은 출처·같은 번호는 새로 만들지 않고 고쳐요. 한 번에 '+IMPORT_MAX+'건까지예요.',
  alarmNote:'알림은 Fold 앱이 울려요(0분~7일 전, 종일 일정은 그날 9시 기준). PC·iPad에서는 달력에만 보여요.',
  pick:'일정 파일 고르기',cancel:'취소',
  EMPTY:'빈 파일이에요. 일정이 든 파일을 골라 주세요.',
  NOT_JSON:'JSON 파일이 아니에요. 일정 파일(.json)을 골라 주세요.',
  FORMAT:'형식이 달라요. "format": "'+IMPORT_FORMAT+'"인 파일만 받아요.',
  SOURCE:'출처 이름("source")이 없거나 '+SOURCE_MAX+'자를 넘어요.',
  EVENTS:'일정 목록("events")이 없어요.',
  TOO_MANY:n=>'한 번에 '+IMPORT_MAX+'건까지 가져올 수 있어요(이 파일 '+n+'건). 파일을 나눠 주세요.',
  TOO_BIG:'파일이 너무 커요. '+IMPORT_MAX_BYTES/1_000_000+'MB 이하만 받아요.',
  READ_FAIL:'파일을 읽지 못했어요. 다시 골라 주세요.',
  FULL:'일정 기록이 '+EVENT_LIMIT+'건 상한을 넘게 돼 가져오지 않아요. 지난 일정을 정리한 뒤 다시 해 주세요.',
  OPS_SHORT:(need,left)=>'저장할 일정 '+need+'건이 남은 저장 횟수 '+left+'번보다 많아 가져오지 않아요.',
  nothing:'바꿀 일정이 없어요(모두 그대로).',
  unknown:'저장 결과를 아직 몰라요 · 동기화를 확인한 뒤 다시 가져오면 같은 일정은 새로 만들지 않아요.',
});
const ACTION_TEXT=Object.freeze({NEW:'새로',CHANGED:'바뀜',SAME:'그대로',DELETED:'지워 둠'});
export const UNKNOWN_CODES=Object.freeze(['MD_PENDING_RECONCILE_REQUIRED','HOLD_UNKNOWN_SAVE']);
export function createImportState(){return {parsed:null,plan:null,message:null,error:false,busy:false};}
const whenText=it=>Number(it.date.slice(5,7))+'/'+Number(it.date.slice(8,10))+' '+(it.time??'종일');
export function previewLines(plan){
  const c=plan.counts,lines=['「'+plan.source+'」 · 새로 '+c.NEW+'건 · 바뀜 '+c.CHANGED+'건 · 그대로 '+c.SAME+'건'];
  if(c.DELETED)lines.push('지워 둔 일정 '+c.DELETED+'건은 다시 넣지 않아요');
  if(plan.twins)lines.push('같은 번호로 두 번 들어간 일정 '+plan.twins+'건이 있어요 · 앞의 것만 고쳐요');
  return lines;
}
export function skippedLine(parsed){
  const parts=Object.entries(parsed.skipped).map(([k,n])=>SKIP_TEXT[k]+' '+n);
  return parts.length?'형식이 틀린 줄 '+Object.values(parsed.skipped).reduce((a,n)=>a+n,0)+'건은 건너뛰어요('+parts.join(' · ')+')':null;
}
export async function readImportFile(file){
  if(!file||!(file.size>0))return {ok:false,code:'EMPTY'};
  if(file.size>IMPORT_MAX_BYTES)return {ok:false,code:'TOO_BIG'};
  let text;try{text=await file.text();}catch{return {ok:false,code:'READ_FAIL'};}
  return parseImport(text);
}
const refusal=r=>r.code==='TOO_MANY'?IMPORT_TEXT.TOO_MANY(r.count):IMPORT_TEXT[r.code]??IMPORT_TEXT.READ_FAIL;
// 쓰기: 확인 순간의 일정으로 계획을 다시 세운다(미리보기 뒤 다른 저장이 있었어도 heads가 맞게). 한 건이 실패하면 거기서 멈추고 몇 건 넣었는지 알린다(다시 가져오면 넣은 것은 그대로로 센다).
export async function applyImport(ctx,st){
  const plan=planImport(st.parsed,ctx.events());st.plan=plan;
  if(plan.full){st.message=IMPORT_TEXT.FULL;st.error=true;return {ok:false};}
  const ops=ctx.ops?.()??null;
  if(ops?.known&&plan.need>ops.remaining){st.message=IMPORT_TEXT.OPS_SHORT(plan.need,ops.remaining);st.error=true;return {ok:false};}
  let added=0,changed=0;
  for(const row of plan.rows){
    if(row.action!=='NEW'&&row.action!=='CHANGED')continue;
    try{await ctx.save(row.entityId,row.data,row.heads);}
    catch(e){
      const code=typeof e?.code==='string'?e.code:null;
      st.message=(UNKNOWN_CODES.includes(code)?IMPORT_TEXT.unknown:'넣는 중에 멈췄어요'+(code?' · 문의 코드 '+code:''))+' · 넣은 일정 '+(added+changed)+'건';st.error=true;st.parsed=null;st.plan=null;
      return {ok:false,error:e,code,added,changed};
    }
    if(row.action==='NEW')added++;else changed++;
  }
  st.message='가져왔어요 · 새로 '+added+'건 · 바뀜 '+changed+'건 · 그대로 '+plan.counts.SAME+'건';st.error=false;st.parsed=null;st.plan=null;
  return {ok:true,added,changed};
}
export function renderImportPanel(root,ctx,st){
  // 칸 이름은 event-import-panel: 이름이 -import 로 끝나고 바로 따옴표가 오면 빌드 도구가 import 후보로 읽는다(R35B).
  const {el,add,button}=ctx.h,sec=el('section',null,'panel event-import-panel');sec.id='event-import-panel';
  const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  // 미리보기·취소·결과 글은 이 칸만 다시 그린다(앱 전체 render 없음 → 위로 튀지 않음). 넣은 뒤에만 기록을 다시 읽는다(ctx.reload).
  const paint=()=>{
    const body=[el('h2',IMPORT_TEXT.title,'panel-title'),el('p',IMPORT_TEXT.lead,'muted')];
    if(st.plan){
      const lines=previewLines(st.plan),skip=skippedLine(st.parsed),list=el('div',null,'event-import-list');
      for(const t of lines)body.push(el('p',t,'event-import-summary'));
      if(skip)body.push(el('p',skip,'notice event-import-skipped'));
      if(st.parsed.adjusted)body.push(el('p','알림 '+st.parsed.adjusted+'건은 지원 범위(0분~7일 전)의 가까운 값으로 맞췄어요','muted small'));
      const ops=ctx.ops?.()??null;
      body.push(el('p','저장 '+st.plan.need+'번'+(ops?.known?' · 남은 저장 횟수 '+ops.remaining+'번':''),'muted small'));
      for(const r of st.plan.rows.filter(r=>r.action!=='SAME').slice(0,8))add(list,el('p',ACTION_TEXT[r.action]+' · '+whenText(r.item)+' · '+(r.item.own||EVENT_KIND_BASE.find(([v])=>v===r.item.kind)[1])+' · '+r.item.title,'event-import-row'));
      const more=st.plan.rows.filter(r=>r.action!=='SAME').length-8;if(more>0)add(list,el('p','그 밖에 '+more+'건','muted small'));
      if(list.children.length)body.push(list);
      const go=button(st.plan.need?st.plan.need+'건 가져오기':IMPORT_TEXT.nothing,()=>void ctx.perform(async()=>{
        const r=await applyImport(ctx,st);
        if(r.added||r.changed||r.ok){await ctx.reload();ctx.alarms?.();}else paint();
        if(r.error&&r.code&&!r.code.startsWith('INVALID_'))throw r.error;
      }),'primary event-import-go');
      go.disabled=!st.plan.need;
      body.push(add(el('div',null,'buttons'),go,button(IMPORT_TEXT.cancel,()=>{st.parsed=null;st.plan=null;st.message=null;paint();},'secondary event-import-cancel')));
    }else body.push(add(el('div',null,'buttons'),input,button(IMPORT_TEXT.pick,()=>input.click(),'primary event-import-pick')));
    if(st.message){const m=el('p',st.message,st.error?'notice error event-import-message':'notice event-import-message');m.setAttribute('role','status');body.push(m);}
    body.push(el('p',IMPORT_TEXT.alarmNote,'muted small event-import-alarm-note'));
    sec.replaceChildren(...body);
  };
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';if(!file)return;
    const r=await readImportFile(file);
    if(!r.ok){st.parsed=null;st.plan=null;st.message=refusal(r);st.error=true;paint();return;}
    st.parsed=r;st.plan=planImport(r,ctx.events());st.message=r.items.length?null:'가져올 수 있는 일정이 없어요';st.error=!r.items.length;paint();
  });
  paint();add(root,sec);return sec;
}

// ===== V14_IPO_AUTO (통제탑 2026-11-16, 소유자 "공모주프로그램 자동으로 알림오게해"): 공모주 일정 파일 자동 가져오기 · 알림 · 오늘 화면 줄 =====
// 가져오기는 PC 앱(APP_SHELL)에서만: 시작할 때 + 켜져 있는 동안 1시간마다 host(inbox-reader.mjs readIpoEvents, 경로 POST /api/ipo-events)가 읽어 준 파일을 위 V12F 표시 줄 그대로 일정(EVENT)에 맞춘다. 새 기록 종류·새 칸 0.
//   · 같은 출처·번호는 한 번만(planImport). 날짜·시각이 바뀌면 그 일정만 고친다. 바꿀 것이 없으면 저장 0(연산 0).
//   · 파일에서 사라진 오늘 이후 일정은 제목 앞에 "[취소됨] "만 붙이고 단계 줄·알림을 뗀다(지우지 않음). 파일에 일정이 0건이거나 틀린 줄이 있으면 취소 표시를 하지 않는다(덜 만들어진 파일로 모두 취소되지 않게).
//   · 지운 일정은 다시 넣지 않는다(planImport DELETED). 소유자가 고친 일정: 이 기기 장부(자동으로 마지막에 맞춘 내용의 지문)와 지금 내용이 다르면 손대지 않는다. 장부에 없으면(처음 · 손으로 가져온 일정) 지금 파일 기준으로 맞춘다.
//   · 파일이 없거나 깨졌으면 아무것도 바꾸지 않고 설정 줄에 "마지막 성공 시각 · 실패 이유"만 남긴다. 파일 자리는 host의 상대 규칙 후보 중 번호만 이 기기 설정에 둔다(경로 글자는 화면·요청에 없음).
// 알림: Fold = 기존 로컬 알림(importAlarms 단계 줄 규칙) · PC = 기존 Windows 알림(pc-toast-writer 종류 IPO, 단계와 건수만) · 모든 기기 = 오늘 화면 맨 위 공모주 줄.
export const IPO_AUTO_ROUTE='/api/ipo-events',IPO_AUTO_KEY='lb.ipoauto.v1',IPO_BOOK_KEY='lb.ipoauto.book.v1',IPO_FIRED_KEY='lb.ipoauto.fired.v1';
export const IPO_EVERY_MS=3600000,IPO_TICK_MS=60000,IPO_EARLY_MS=2000,IPO_EARLY_TRIES=150,IPO_BUSY_RETRY_MS=60000,IPO_TOAST_RETRY_MS=30*60000,IPO_TOAST_LOCKED_MS=5*60000,IPO_TOAST_TRIES=3,IPO_TOAST_MAX=20;   // IPO_TOAST_MAX = pc-toast-writer IPO_MAX(시험이 대조)
export const IPO_CANCEL_MARK='[취소됨] ',IPO_DAY_MIN=8*60+30,IPO_EVE_MIN=20*60,IPO_TODAY_MAX=4;
export const IPO_PLACE_TEXT=Object.freeze(['공모주 프로그램 state 폴더','사령부 state 폴더']);   // host IPO_PLACES와 같은 순서·개수(시험이 대조). 화면에는 이름만
const hmMin=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const kstParts=ms=>{const d=new Date(ms+9*3600000);return {date:d.toISOString().slice(0,10),minutes:d.getUTCHours()*60+d.getUTCMinutes()};};
const kstShort=iso=>{const t=Date.parse(iso);if(!Number.isFinite(t))return '';const d=new Date(t+9*3600000).toISOString();return Number(d.slice(5,7))+'/'+Number(d.slice(8,10))+' '+d.slice(11,16);};

// ---- 단계 고르기(순수): 종류가 공모주인 줄만. 제목에 "청약"(마감·환불 등 아님) = 청약 첫날, "상장"(청약 없음) = 상장일. 그 밖은 파일의 알림 그대로 ----
const SUB_NOT=/마감|종료|둘째|2일차|이틀째|환불|배정|납입/;
export function ipoStage(item){
  if(item?.own!==IPO_KIND||typeof item.title!=='string')return null;
  if(/청약/.test(item.title)&&!SUB_NOT.test(item.title))return 'SUB';
  if(/상장/.test(item.title)&&!/청약/.test(item.title))return 'LIST';
  return null;
}
// 단계가 있으면 메모 끝에 단계 줄을 달고, 표시 줄의 분은 그날 08:30에 맞춘다(옛 앱 r82·r83은 이 분으로 한 번 울린다. 종일 = 9시 기준 30분 전, 08:30 앞 시각이면 제시각).
export function ipoAutoItem(item){
  const stage=ipoStage(item);if(!stage)return item;
  return {...item,note:[item.note,IPO_STAGE_LINE[stage]].filter(Boolean).join('\n'),alarm:Math.max(0,hmMin(item.time??ALL_DAY_ALARM)-IPO_DAY_MIN)};
}
// 일정 내용 지문(소유자 수정 알아보기용, 이 기기 장부에만 둔다). 내용 글자는 장부에 남지 않는다.
export function ipoPrint(d){
  const s=JSON.stringify([d?.title,d?.date,d?.time,d?.allDay,d?.kind,d?.notes,d?.deleted===true]);let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return h.toString(16).padStart(8,'0')+'.'+s.length;
}
// 취소 표시: 제목 앞 표지(150자 안) + 단계 줄·알림 분 떼기. 영역·색·반복·사람이 쓴 메모는 그대로.
export function ipoCancelData(old){
  const meta=splitEventMeta(old.notes),m=importMark(old.notes),nl=m.note.lastIndexOf('\n'),rest=stageOfNote(m.note)?(nl<0?'':m.note.slice(0,nl)):m.note;
  const body=[rest,markLine(m.source,m.extId,null)].filter(Boolean).join('\n');
  const title=old.title.startsWith(IPO_CANCEL_MARK)?old.title:cut(IPO_CANCEL_MARK+old.title,TITLE_MAX);
  return {...old,title,notes:joinEventMeta(meta.kind,{color:meta.color,end:meta.end,repeat:meta.repeat,extra:meta.extra},body)};
}

// ---- 계획(순수): planImport + 소유자 수정(OWNER) + 취소 표시(CANCEL). book = {출처\0번호: 지문} ----
export function planIpoAuto(parsed,events,{today,book={}}){
  const base=planImport({...parsed,items:parsed.items.map(ipoAutoItem)},events),src=sourceKey(parsed.source),key=id=>src+'\u0000'+id;
  const byId=new Map((events??[]).filter(e=>e?.data&&typeof e.entityId==='string').map(e=>[e.entityId,e]));
  const rows=base.rows.map(r=>{
    const k=key(r.item.extId),old=r.entityId?byId.get(r.entityId)?.data:null;
    if(r.action==='CHANGED'&&Object.hasOwn(book,k)&&book[k]!==ipoPrint(old))return {...r,action:'OWNER',data:null,key:k};
    return {...r,key:k};
  });
  const inFile=new Set(parsed.items.map(x=>x.extId)),safe=parsed.items.length>0&&!Object.keys(parsed.skipped??{}).length,seen=new Set();let held=0;
  const live=[...byId.values()].filter(e=>!e.data.deleted).sort((a,b)=>String(a.createdAt??'').localeCompare(String(b.createdAt??''))||a.entityId.localeCompare(b.entityId));
  for(const e of live){
    const d=e.data,m=importMark(d.notes);
    if(!m||sourceKey(m.source)!==src||inFile.has(m.extId)||seen.has(m.extId))continue;
    seen.add(m.extId);
    if(!dateKeyOK(d.date)||d.date<today||typeof d.title!=='string'||d.title.startsWith(IPO_CANCEL_MARK))continue;   // 지난 일정·이미 취소 표시한 일정은 그대로
    if(!safe){held++;continue;}
    const k=key(m.extId),item={extId:m.extId,title:d.title,date:d.date,time:d.time??null};
    if(Object.hasOwn(book,k)&&book[k]!==ipoPrint(d)){rows.push({action:'OWNER',item,data:null,entityId:e.entityId,heads:e.heads??[],key:k});continue;}
    rows.push({action:'CANCEL',item,data:ipoCancelData(d),entityId:e.entityId,heads:e.heads??[],key:k});
  }
  const counts={NEW:0,CHANGED:0,SAME:0,DELETED:0,OWNER:0,CANCEL:0};for(const r of rows)counts[r.action]++;
  // 이 출처의 남아 있는 일정 번호(장부 정리용: 사라진 일정의 지문은 버린다)
  const keep=new Set(live.map(e=>importMark(e.data.notes)).filter(m=>m&&sourceKey(m.source)===src).map(m=>key(m.extId)));
  return {source:parsed.source,rows,counts,need:counts.NEW+counts.CHANGED+counts.CANCEL,held,full:base.full,keep:[...keep],src};
}
// ---- 적용: 일정 하나 = 저장 1번. 실패하면 거기서 멈춘다(넣은 것은 장부에 남아 다음에 그대로로 센다) ----
export async function applyIpoAuto(ctx,plan,book={}){
  const next={},keep=new Set(plan.keep),mine=k=>k.startsWith(plan.src+'\u0000');
  for(const [k,v] of Object.entries(book))if(!mine(k)||keep.has(k))next[k]=v;   // 다른 출처의 장부는 그대로
  for(const r of plan.rows)if(r.action==='SAME')next[r.key]=ipoPrint(r.data);
  const done={added:0,changed:0,cancelled:0};
  for(const r of plan.rows){
    if(r.action!=='NEW'&&r.action!=='CHANGED'&&r.action!=='CANCEL')continue;
    try{await ctx.save(r.entityId,r.data,r.heads);}
    catch(e){return {ok:false,code:typeof e?.code==='string'?e.code:null,...done,book:next};}
    next[r.key]=ipoPrint(r.data);
    if(r.action==='NEW')done.added++;else if(r.action==='CHANGED')done.changed++;else done.cancelled++;
  }
  return {ok:true,...done,book:next};
}

// ---- 이 기기 설정·장부(localStorage). 저장소가 없거나 못 쓰면 이번 실행 동안만 그 저장소 몫 메모리에 둔다(pc-toast와 같은 방식, 다른 저장소와 섞지 않음) ----
const NO_STORE={},unsaved=new WeakMap();
const readStore=(s,k)=>{const box=unsaved.get(s??NO_STORE);if(box?.has(k))return box.get(k);if(!s)return null;try{const t=s.getItem(k);return t===null||t===undefined?null:JSON.parse(t);}catch{return null;}};
const writeStore=(s,k,v)=>{
  try{if(!s)throw new Error('NO_STORAGE');s.setItem(k,JSON.stringify(v));unsaved.get(s)?.delete(k);}
  catch{const o=s??NO_STORE;if(!unsaved.has(o))unsaved.set(o,new Map());unsaved.get(o).set(k,v);/* 이번 실행 동안만 */}
};
const isoOrNull=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
export function ipoSettings(storage){
  const r=readStore(storage,IPO_AUTO_KEY),o=r&&typeof r==='object'&&!Array.isArray(r)?r:{};
  const where=Number.isInteger(o.where)&&o.where>=0&&o.where<IPO_PLACE_TEXT.length?o.where:null;
  const last=o.last&&typeof o.last==='object'?{added:Number(o.last.added)||0,changed:Number(o.last.changed)||0,cancelled:Number(o.last.cancelled)||0,held:Number(o.last.held)||0}:null;
  return {on:o.on!==false,toast:o.toast!==false,where,okAt:isoOrNull(o.okAt),failAt:isoOrNull(o.failAt),fail:typeof o.fail==='string'&&/^[A-Z][A-Z0-9_]{0,60}$/.test(o.fail)?o.fail:null,last};
}
export function setIpoSetting(storage,patch){const next={...ipoSettings(storage),...patch};writeStore(storage,IPO_AUTO_KEY,next);return next;}
export function loadIpoBook(storage){const r=readStore(storage,IPO_BOOK_KEY),out={};if(r&&typeof r==='object'&&!Array.isArray(r))for(const [k,v] of Object.entries(r))if(typeof v==='string'&&v.length<=24)out[k]=v;return out;}
const loadFired=storage=>{const r=readStore(storage,IPO_FIRED_KEY),out={};for(const k of ['EVE','SUB','LIST'])if(typeof r?.[k]==='string'&&dateKeyOK(r[k]))out[k]=r[k];return out;};

// ---- 설정 줄 글 ----
export const IPO_FAIL_TEXT=Object.freeze({
  NO_FILE:'파일이 아직 없어요(공모주 프로그램이 새로고침 때 만들어요)',IPO_FORMAT:'일정 파일 형식(lifebrick-events-v1)이 아니에요',IPO_INVALID:'파일이 깨졌어요(JSON을 읽지 못함)',
  IPO_TOO_LARGE:'파일이 1MB를 넘어요',IPO_REFUSED:'링크 파일이라 읽지 않았어요',IPO_READ_FAILED:'파일을 읽지 못했어요',IPO_LOCKED:'잠겨 있어 읽지 못했어요',
  TOO_MANY:'한 파일에 '+IMPORT_MAX+'건을 넘어요',FULL:IMPORT_TEXT.FULL,OPS_SHORT:'남은 저장 횟수가 모자라 넣지 않았어요',UNKNOWN_SAVE:IMPORT_TEXT.unknown,
});
export function ipoFailText(code){
  if(Object.hasOwn(IPO_FAIL_TEXT,code))return IPO_FAIL_TEXT[code];
  if(typeof IMPORT_TEXT[code]==='string'&&['EMPTY','NOT_JSON','FORMAT','SOURCE','EVENTS'].includes(code))return IMPORT_TEXT[code];
  return '처리하지 못했어요 · 문의 코드 '+code;
}
export function ipoStatusLine(s){
  const head='공모주 자동 가져오기: ';
  if(!s.on)return head+'꺼짐';
  const ok=s.okAt?'마지막 성공 '+kstShort(s.okAt)+(s.last?' (새로 '+s.last.added+' · 바뀜 '+s.last.changed+' · 취소 '+s.last.cancelled+')':''):'아직 성공 없음';
  const failNow=s.fail&&(!s.okAt||Date.parse(s.failAt??'')>=Date.parse(s.okAt));
  return head+ok+(failNow?' · 실패 이유: '+ipoFailText(s.fail)+(s.failAt?' ('+kstShort(s.failAt)+')':''):'')+(s.last?.held&&!failNow?' · 파일이 비었거나 틀린 줄이 있어 취소 표시 '+s.last.held+'건은 미뤘어요':'');
}

// ---- PC Windows 알림(순수 목록): 단계 줄이 있는 공모주 일정만. 청약 전날 20:00 · 청약 첫날 08:30 · 상장일 08:30 이후 그날 안에 1번(앱이 꺼져 있었으면 그날 켜졌을 때) ----
export function ipoToastsDue(events,ms,fired={}){
  const {date:today,minutes}=kstParts(ms),tomorrow=shiftDay(today,1),n={EVE:0,SUB:0,LIST:0};
  for(const e of events??[]){
    const d=e?.data??e;if(!d||d.deleted||!dateKeyOK(d.date))continue;
    const m=importMark(d.notes),st=m?stageOfNote(m.note):null;if(!st)continue;
    if(st==='SUB'){if(d.date===tomorrow&&minutes>=IPO_EVE_MIN)n.EVE++;if(d.date===today&&minutes>=IPO_DAY_MIN)n.SUB++;}
    else if(d.date===today&&minutes>=IPO_DAY_MIN)n.LIST++;
  }
  return Object.entries(n).filter(([k,c])=>c>0&&fired[k]!==today).map(([stage,c])=>({kind:'IPO',stage,count:Math.min(c,IPO_TOAST_MAX)}));
}

// ---- 돌리개: 1분마다 본다. 가져오기는 시작 뒤 첫 판단 + 1시간마다, 알림은 매번(울릴 것이 있을 때만 host 호출) ----
// 주입: surface()·ready()·request(body)·events()·save(id,data,heads)·ops()·exclusive(fn)(다른 저장과 겹치지 않게, 바쁘면 false)·canWrite()(편집 중이면 false)·afterWrite()·send(body)·storage·now·timers·onStatus().
export function createIpoAuto({surface,ready,request,events,save,ops=()=>null,exclusive=async fn=>{await fn();return true;},canWrite=()=>true,afterWrite=async()=>{},send=null,storage=null,now=()=>Date.now(),timers=globalThis,onStatus=()=>{}}={}){
  let handle=null,running=false,nextAt=0,toastIssue=null;const retry=new Map();
  const stop=()=>{if(handle!==null){timers.clearInterval(handle);handle=null;}};
  const failed=(code,at)=>{setIpoSetting(storage,{fail:code,failAt:new Date(at).toISOString()});return 'FAILED';};
  async function importNow(){
    const s=ipoSettings(storage);if(!s.on)return 'OFF';
    if(running)return 'BUSY';
    running=true;const at=now();
    try{
      let r;
      try{r=await request({where:s.where});}
      catch(e){if(s.where!==null)setIpoSetting(storage,{where:null});return failed(typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{0,60}$/.test(e.code)?e.code:'IPO_READ_FAILED',at);}
      if(!r?.exists){setIpoSetting(storage,{where:null});return failed('NO_FILE',at);}
      if(r.where!==s.where&&Number.isInteger(r.where))setIpoSetting(storage,{where:r.where});
      const parsed=parseImport(r.text);if(!parsed.ok)return failed(parsed.code,at);
      const book=loadIpoBook(storage),plan=planIpoAuto(parsed,events(),{today:kstParts(at).date,book});
      if(plan.full)return failed('FULL',at);
      const o=ops();if(o?.known&&plan.need>o.remaining)return failed('OPS_SHORT',at);
      let res=null;
      if(!plan.need)res=await applyIpoAuto({save},plan,book);   // 저장 0: 장부만 맞춘다
      else{
        if(!canWrite()){nextAt=at+IPO_BUSY_RETRY_MS;return 'BUSY';}   // 사람이 편집 중: 1분 뒤 다시(일정·장부 그대로)
        const ran=await exclusive(async()=>{res=await applyIpoAuto({save},plan,book);});
        if(!ran||!res){nextAt=at+IPO_BUSY_RETRY_MS;return 'BUSY';}
      }
      writeStore(storage,IPO_BOOK_KEY,res.book);
      if(res.added+res.changed+res.cancelled){try{await afterWrite();}catch{/* 다음 읽기 때 보인다 */}}
      if(!res.ok)return failed(UNKNOWN_CODES.includes(res.code)?'UNKNOWN_SAVE':res.code??'SAVE_FAILED',at);
      setIpoSetting(storage,{okAt:new Date(at).toISOString(),fail:null,failAt:null,last:{added:res.added,changed:res.changed,cancelled:res.cancelled,held:plan.held}});
      return 'OK';
    }finally{running=false;try{onStatus();}catch{/* 화면 갱신 실패는 무시 */}}
  }
  async function toastTick(at){
    if(!send||!ipoSettings(storage).toast)return;
    const today=kstParts(at).date;let list;try{list=events();}catch{return;}
    for(const body of ipoToastsDue(list,at,loadFired(storage))){
      const r=retry.get(body.stage);if(r&&r.date===today&&(r.settled||at<r.after))continue;
      try{await send(body);writeStore(storage,IPO_FIRED_KEY,{...loadFired(storage),[body.stage]:today});retry.delete(body.stage);toastIssue=null;}
      catch(e){
        const code=typeof e?.code==='string'?e.code:'',tries=(r?.date===today?r.tries??0:0)+1;
        if(code==='PC_TOAST_DISABLED'){retry.set(body.stage,{date:today,settled:true});toastIssue='DISABLED';}
        else if(code==='PC_TOAST_RETRY_LIMIT'){retry.set(body.stage,{date:today,settled:true});toastIssue='FAILED';}
        else if(code==='PC_TOAST_LOCKED')retry.set(body.stage,{date:today,after:at+IPO_TOAST_LOCKED_MS,tries:tries-1});
        else{retry.set(body.stage,{date:today,after:at+IPO_TOAST_RETRY_MS,tries,settled:tries>=IPO_TOAST_TRIES});toastIssue='FAILED';}
      }
    }
  }
  const tick=async()=>{
    const where=surface();
    if(where&&where!=='APP_SHELL'){stop();return 'OTHER_SURFACE';}   // Fold·iPad·브라우저: 타이머까지 멈춘다(가져오기·PC 알림은 PC 앱만)
    if(where!=='APP_SHELL'||!ready())return 'WAIT';
    let out='IDLE';const at=now();
    if(at>=nextAt&&ipoSettings(storage).on){nextAt=at+IPO_EVERY_MS;out=await importNow();}
    await toastTick(now());
    return out;
  };
  // 시작할 때: 바로 한 번 보고, 아직 잠겨 있거나 기록을 읽기 전이면 첫 가져오기를 할 때까지 2초마다 다시 본다(최대 5분, 그 뒤로는 1분 틱).
  const early=n=>{if(handle===null||nextAt>0||n>=IPO_EARLY_TRIES||typeof timers.setTimeout!=='function')return;timers.setTimeout(()=>{void tick().catch(()=>{}).then(()=>early(n+1));},IPO_EARLY_MS);};
  return {
    tick,stop,importNow,toastIssue:()=>toastIssue,
    start(){if(handle===null){handle=timers.setInterval(()=>{void tick().catch(()=>{});},IPO_TICK_MS);void tick().catch(()=>{}).then(()=>early(0));}},
  };
}

// ---- 오늘 화면 맨 위 공모주 줄(모든 기기, 기록 쓰기 0): 오늘·내일 공모주 일정(취소 표시 제외), 4줄 + "그 밖에 n건" ----
export function ipoTodayRows(events,today){
  const tomorrow=shiftDay(today,1),rows=[];
  for(const e of events??[]){
    const d=e?.data??e;if(!d||d.deleted||typeof d.title!=='string'||(d.date!==today&&d.date!==tomorrow))continue;
    if(splitEventNotes(d.notes).kind!==IPO_KIND||d.title.startsWith(IPO_CANCEL_MARK))continue;
    const m=importMark(d.notes),st=m?stageOfNote(m.note):null,isToday=d.date===today;
    rows.push({date:d.date,when:isToday?'오늘':'내일',what:st==='SUB'?(isToday?'청약 첫날':'청약 시작'):st==='LIST'?'상장':'공모주',time:!d.allDay&&typeof d.time==='string'?d.time:'',title:d.title.trim()});
  }
  return rows.sort((a,b)=>(a.date<b.date?-1:a.date>b.date?1:0)||(a.time<b.time?-1:a.time>b.time?1:0));
}
export function renderIpoToday(root,{h,events,today}){
  const rows=ipoTodayRows(events,today);if(!rows.length)return null;
  const {el,add}=h,sec=el('section',null,'ipo-today');sec.id='ipo-today';sec.setAttribute('aria-label','공모주 일정');
  const list=el('div',null,'ipo-today-list');
  for(const r of rows.slice(0,IPO_TODAY_MAX))add(list,el('p',r.when+' '+r.what+(r.time?' '+r.time:'')+' · '+r.title,r.when==='오늘'?'ipo-today-row is-today':'ipo-today-row'));
  if(rows.length>IPO_TODAY_MAX)add(list,el('p','그 밖에 '+(rows.length-IPO_TODAY_MAX)+'건','ipo-today-more'));
  add(sec,el('span','공모주','ipo-today-tag'),list);add(root,sec);return sec;
}

// ---- 설정 칸: PC 앱에서만 보인다. ctx = {h:{el,add,button},kit:{toggle},surface,storage,run?()} ----
export const IPO_AUTO_TEXT=Object.freeze({
  title:'공모주 자동 가져오기',
  lead:'공모주 프로그램이 만든 일정 파일을 PC 앱이 시작할 때와 켜져 있는 동안 1시간마다 읽어 일정에 넣어요. 같은 종목은 한 번만 넣고, 날짜가 바뀌면 그 일정만 고쳐요. 파일에서 사라진 일정은 지우지 않고 "취소됨"만 붙여요. 직접 고치거나 지운 일정은 다시 덮어쓰지 않아요. 들어온 일정은 동기화로 Fold·iPad에도 보여요. (이 기기 설정)',
  on:'PC에서 자동 가져오기',toast:'Windows 알림 · 청약 전날 20:00 · 청약 첫날 08:30 · 상장일 08:30',run:'지금 가져오기',
  note:'Fold는 앱을 한 번 연 뒤부터 같은 시각에 휴대폰 알림이 울려요(일정 알림과 같은 길). PC 알림은 앱이 켜져 있을 때만, 종목 이름 없이 건수만 보여요.',
  busy:'다른 저장이나 편집이 끝나면 1분 안에 다시 해요',
});
export function renderIpoAutoSettings(root,ctx){
  if(ctx.surface!=='APP_SHELL')return null;
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel ipo-auto-settings'),h.el('h2',IPO_AUTO_TEXT.title,'panel-title'));sec.id='ipo-auto-settings';
  h.add(sec,h.el('p',IPO_AUTO_TEXT.lead,'muted'));
  const line=h.el('p','','ipo-auto-status'),place=h.el('p','','muted small ipo-auto-place');line.setAttribute('role','status');
  const paint=extra=>{const s=ipoSettings(ctx.storage);line.textContent=ipoStatusLine(s)+(extra?' · '+extra:'');place.textContent=s.where===null?'':'파일 자리: '+IPO_PLACE_TEXT[s.where];place.hidden=s.where===null;};
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(IPO_AUTO_TEXT.on,ipoSettings(ctx.storage).on,v=>{setIpoSetting(ctx.storage,{on:Boolean(v)});paint();})));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(IPO_AUTO_TEXT.toast,ipoSettings(ctx.storage).toast,v=>{setIpoSetting(ctx.storage,{toast:Boolean(v)});})));
  h.add(sec,line,place);
  if(ctx.run&&h.button){
    const go=h.button(IPO_AUTO_TEXT.run,async()=>{go.disabled=true;try{const r=await ctx.run();paint(r==='BUSY'?IPO_AUTO_TEXT.busy:'');}finally{go.disabled=false;}},'secondary ipo-auto-run');
    h.add(sec,h.add(h.el('div',null,'buttons'),go));
  }
  h.add(sec,h.el('p',IPO_AUTO_TEXT.note,'muted small'));
  paint();h.add(root,sec);return sec;
}
