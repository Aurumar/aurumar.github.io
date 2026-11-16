// V12F 일정 가져오기(파일, 통제탑 2026-11-16): 공모주 등 바깥 프로그램이 만든 일정 파일(JSON, lifebrick-events-v1)을 읽어 기존 일정 기록(EVENT)으로 넣는다.
// 새 기록 종류 0 · 새 칸 0: 출처·번호(extId)·알림은 일정 메모 마지막 줄 "[가져옴] 출처 #번호 · 알림 n분 전"에 둔다(whole-life-model EVENT 모양 그대로라 r81 앱도 받는다).
//   종류는 기본 4종 이름이면 EVENT.kind, 그 밖(공모주 등)은 V8W1 직접 입력 자리(메모 첫 줄 "[종류] 공모주", kind = 약속).
// 같은 출처 + 같은 번호는 새로 만들지 않고 고친다(내용이 같으면 쓰기 0). 지워 둔 일정은 다시 넣지 않는다. 일정 하나 = 저장 1번(연산 1).
// 파일 고르기(<input type=file>)만 쓴다: host·보호 경로·서버 경로 변경 0, 외부 통신 0. 글은 textContent로만 넣는다(innerHTML 없음).
// 알림: 기존 Fold 로컬 알림(다리 scheduleReminders, 한 번 울림, 전체 64개)에 붙인다(APK 변경 0). PC·iPad에는 일정별 알림 길이 없어 달력에만 보인다.
//   알림 글에도 V10FIX M-08 가림을 쓴다(진료·약 낱말이면 제목 대신 "병원 일정", 종류 "병원"). 메모는 싣지 않는다.
import {dateKeyOK} from './life-model.mjs';
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
export function importAlarms(events,{now}){
  const list=[],ids=new Set();
  for(const e of events??[]){
    const d=e?.data;if(!d||d.deleted||typeof e.entityId!=='string'||!dateKeyOK(d.date)||typeof d.title!=='string')continue;
    const m=importMark(d.notes);if(!m||m.alarm===null)continue;
    const timed=!d.allDay&&typeof d.time==='string'&&TIME.test(d.time),at=kstMs(d.date,timed?d.time:ALL_DAY_ALARM)-m.alarm*60000;
    if(!(at>now)||at-now>ALARM_AHEAD_DAYS*DAY_MS)continue;
    const id=ALARM_ID_PREFIX+e.entityId.replace(/[^A-Za-z0-9-]/g,'-').slice(0,34);if(ids.has(id))continue;
    // V10FIX M-08: 진료·약 낱말이 직접 쓴 종류나 제목(자르기 전 전체)에 있으면 제목·종류를 가린다(잠금 화면에 보일 수 있다).
    const own=splitEventNotes(d.notes).kind,medical=own===WIDGET_HOSPITAL||widgetMedical(own)||widgetMedical(d.title);
    const title=medical?WIDGET_HOSPITAL_TITLE:cut(d.title.trim(),40);if(!title)continue;
    const kindText=medical?WIDGET_HOSPITAL:own||(EVENT_KIND_BASE.find(([v])=>v===d.kind)?.[1]??'');
    const body=[Number(d.date.slice(5,7))+'월 '+Number(d.date.slice(8,10))+'일 '+(timed?d.time:'종일'),kindText,leadText(m.alarm)].filter(Boolean).join(' · ');
    ids.add(id);list.push({id,kind:ALARM_KIND,at,title,body,tab:ALARM_TAB});
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
