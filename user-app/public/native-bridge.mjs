// B44B: Fold 앱 네이티브 다리(window.LifeBrickNative)의 웹 쪽 연결. 다리가 없으면(PC·iPad·일반 브라우저) 모든 함수가 조용히 아무것도 안 한다(오류 0).
// 불러오는 모듈 없음(단독 파일). 다리·저장소·시계는 주입한다(시험은 가짜 다리와 메모리 저장소를 꽂는다).
// - 결제 알림 → 지출 초안: 다리의 getExpenseDrafts()가 주는 목록을 읽어 "초안"으로 보여줄 뿐 아무것도 쓰지 않는다(연산 0). 가계부 거래는 사용자가
//   초안을 열어 기존 거래 입력의 "저장"을 눌렀을 때만 만들어진다. 저장이 성공한 뒤에만 markHandled()가 id를 기억하고 다리에 ackExpenseDrafts()를 보낸다.
//   초안 자체는 다리(PayDraftStore)가 확인 전까지 보관한다 — 웹은 새 저장 형식을 만들지 않는다.
// - 중복 방지: 알림 id(32자 16진) 또는 시각+금액+가맹점 해시. 이 기기에서 이미 처리한 키(localStorage)와 같으면 보이지 않고 다리에 처리됨만 알린다.
// - 같은 결제 경고(B48C F1): 저장한 초안은 "금액 + 5분 칸" 해시만 lb.native.added에 남긴다(금액·시각·가맹점 원문 없음, seen과 같은 수준의 구분용 해시). 나중에 온 다른 알림이 같은 금액·가까운 시각이면 added 표시(저장은 막지 않음).
// - 처리 표시(B48C F2): 거래가 받아들여지면(서버 확정·임시 저장 LOCAL_DRAFT 모두) markAdded()가 처리됨으로 표시한다.
// - ack 실패(B48C F9): 다리에 처리됨을 못 알린 초안의 키는 lb.native.unacked에 따로 둔다. seen 500개 상한에 밀려나도 되살아나지 않고, 다음 읽기 때 ack를 다시 보낸다.
// - 로컬 알림 4종 토글은 이 기기 localStorage에만 저장하고, 켜고 끌 때마다 다리 scheduleReminders()에 "전체 목록"을 보낸다(부분 목록은 나머지를 취소함).
// - 캘린더는 사용자가 단추를 눌렀을 때와, 사용자가 켠 거울 토글(P1D2, 기본 꺼짐)에서만 쓴다. 꺼져 있으면 거울은 다리를 전혀 부르지 않는다. 일정 key가 안정적이라 다시 써도 새로 만들지 않고 고친다.
// - 걸음·수면(B58B, Health Connect): 건강 화면이 부를 때만 읽는다. 값은 메모리로만 지나가고 이 파일은 저장·로그하지 않는다. 다리의 readHealthDay는 pending 뒤 결과를 한 번만 주므로 여기서 짧게 되묻는다.
// - 열품타(YPT1): 공부 타이머 시작·끝·취소 때 Fold 앱이 열품타 버튼을 대신 누른다. 토글(기본 꺼짐)은 이 기기 저장소에만 있고 기록이 아니다. 꺼져 있으면 다리 호출 0. 성패는 비동기라 타이머·담기와 무관하다.
// 모든 다리 호출은 try/catch로 감싸 실패해도 화면은 계속 돌아간다.
export const NATIVE_KEYS=Object.freeze({reminders:'lb.native.reminders',seen:'lb.native.seen',calendar:'lb.native.calendar',added:'lb.native.added',unacked:'lb.native.unacked',mirror:'lb.native.mirror',ypt:'lb.native.ypt',yptNotice:'lb.native.yptNotice'});
export const NATIVE_LIMITS=Object.freeze({seen:500,drafts:200,events:64,added:200,unacked:1000});
export const NATIVE_TEXT=Object.freeze({
  chip:n=>'Fold 결제 '+n+'건 · 눌러서 쌓기',
  sheetTitle:'Fold 결제 알림',
  empty:'처리할 결제 알림이 없어요.',
  cancel:'취소 알림 — 이미 넣은 거래가 있으면 가계부에서 직접 정리하세요.',
  twin:'같은 결제로 보이는 알림이 더 있어요 — 하나만 넣으세요.',
  added:'이미 넣은 결제일 수 있어요 — 가계부를 확인한 뒤 넣으세요.',
  add:'가계부에 넣기',discard:'넣지 않고 지우기',ok:'확인했어요',
  settingsTitle:'알림 · 캘린더',
  payAccessOn:'결제 알림 읽기가 켜져 있어요',payAccessOff:'결제 알림을 읽으려면 알림 접근을 켜야 해요',payAccessBtn:'알림 접근 설정 열기',
  noticePerm:'알림 권한이 필요해요 — 허용한 뒤 다시 켜 주세요.',
  calPerm:'캘린더 권한이 필요해요 — 허용한 뒤 다시 눌러 주세요.',
  calNone:'일정을 넣을 수 있는 캘린더를 찾지 못했어요.',
  calBtn:'시험 일정을 캘린더에 넣기',calBtnAgain:'시험 일정 캘린더에 다시 맞추기',
  fail:'Fold 앱과 연결하지 못했어요. 앱을 다시 열어 보세요.',
});
export const REMINDER_LABELS=Object.freeze({morning:'아침 · 오늘 쌓기 전에',night:'밤 · 오늘 카드를 안 쌓았을 때',bed:'취침 목표 30분 전',weekly:'주간 리뷰 · 일요일'});
export const REMINDER_DEFAULTS=Object.freeze({morning:{on:false,time:'08:00'},night:{on:false},bed:{on:false},weekly:{on:false}});
const SAME_PAYMENT_MS=300000,NIGHT_TIME='21:30',WEEKLY_TIME='20:00',BED_LEAD_MIN=30,HM=/^([01]\d|2[0-3]):[0-5]\d$/;

// ---- 다리 호출(실패해도 던지지 않는다) ----
export function callNative(native,name,...args){
  try{
    if(!native||typeof native[name]!=='function')return {ok:false,error:'BRIDGE_UNAVAILABLE'};
    const raw=native[name](...args),value=typeof raw==='string'?JSON.parse(raw):raw;
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{ok:false,error:'BRIDGE_BAD_RESPONSE'};
  }catch{return {ok:false,error:'BRIDGE_ERROR'};}
}
export const nativeAvailable=native=>{const v=callNative(native,'version');return v.ok===true&&v.bridge===1;};

// ---- 이 기기 저장소(localStorage): 없거나 막혀 있어도 던지지 않는다 ----
function pickStorage(storage){try{return storage??globalThis.localStorage??null;}catch{return null;}}
function readJson(store,key,fallback){try{const t=store?.getItem(key);return t==null?fallback:JSON.parse(t);}catch{return fallback;}}
function writeJson(store,key,value){try{store?.setItem(key,JSON.stringify(value));return true;}catch{return false;}}

// ---- 결제 알림 초안 ----
// FNV-1a 32비트 두 가지 시드를 이어 붙인 16자리 16진 해시(암호용이 아니라 같은 알림 구분용).
function fnv(text,seed){let h=seed>>>0;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
export const hashKey=(at,amount,merchant)=>{const s=at+'|'+amount+'|'+merchant;return 'h'+fnv(s,2166136261)+fnv(s,0x9747b28c);};
// 다리 항목 하나를 검증·정리한다. 모양이 틀리면 null(보이지 않는다). amount는 원 단위 정수 문자열(BigInt로 다룸).
export function normalizeDraft(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const amount=typeof raw.amount==='string'?raw.amount:Number.isSafeInteger(raw.amount)?String(raw.amount):'';
  if(!/^[1-9]\d{0,13}$/.test(amount))return null;
  if(typeof raw.at!=='number'||!Number.isFinite(raw.at)||raw.at<=0)return null;
  const at=Math.trunc(raw.at),merchant=typeof raw.merchant==='string'?raw.merchant.trim().slice(0,120):'';
  const id=typeof raw.id==='string'&&/^[0-9a-f]{32}$/.test(raw.id)?raw.id:null,hk=hashKey(at,amount,merchant);
  return {id,keys:id?['n'+id,hk]:[hk],amount,merchant,at,last4:typeof raw.last4==='string'&&/^\d{4}$/.test(raw.last4)?raw.last4:null,kind:raw.kind==='CANCEL'?'CANCEL':'EXPENSE'};
}
export const kstDateOf=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export const kstTimeOf=at=>new Date(at+9*3600000).toISOString().slice(11,16);
// 알림 시각 ±5분이 걸치는 KST 날짜(거래에는 시각이 없어 날짜로 비교한다, 자정 근처면 2개).
export const kstDatesNear=at=>[...new Set([kstDateOf(at-SAME_PAYMENT_MS),kstDateOf(at+SAME_PAYMENT_MS)])];
// 금액 + 5분 칸의 구분용 해시. 저장은 그 칸 하나, 비교는 앞뒤 칸까지 본다(±5분은 언제나 걸린다).
const addedSig=(slot,amount)=>{const s=slot+'|'+amount;return 's'+fnv(s,2166136261)+fnv(s,0x9747b28c);};
const slotOf=at=>Math.floor(at/SAME_PAYMENT_MS);

// ---- 로컬 알림 ----
export function normalizeReminders(raw){
  const out=structuredClone(REMINDER_DEFAULTS);
  if(raw&&typeof raw==='object')for(const k of Object.keys(out)){
    const v=raw[k];if(v&&typeof v==='object'){out[k].on=v.on===true;if(k==='morning'&&HM.test(v.time))out[k].time=v.time;}
  }
  return out;
}
const atLocal=(base,hm,addDays)=>{const [h,m]=hm.split(':').map(Number),d=new Date(base);d.setHours(h,m,0,0);if(addDays)d.setDate(d.getDate()+addDays);return d.getTime();};
// 다음 발생 시각(ms). skipToday면 오늘은 건너뛴다.
const nextAt=(now,hm,skipToday=false)=>{const t=atLocal(now,hm,0);return t>now&&!skipToday?t:atLocal(now,hm,1);};
// 취침 목표 'HH:MM'(24:00 가능) 30분 전의 시각 'HH:MM'. 모르면 null.
export function bedReminderTime(bedtime){
  if(typeof bedtime!=='string'||!/^(?:[01]\d|2[0-3]|24):[0-5]\d$/.test(bedtime))return null;
  let [h,m]=bedtime.split(':').map(Number);if(h===24&&m!==0)return null;
  const total=((h%24)*60+m-BED_LEAD_MIN+1440)%1440;
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
// 다리 scheduleReminders()에 보낼 전체 목록. stackedToday면 밤 알림은 내일로 미룬다(오늘 카드를 이미 쌓았으므로).
export function buildReminders(prefs,{now,stackedToday=false,bedtime=null}={}){
  const p=normalizeReminders(prefs),list=[];
  if(p.morning.on)list.push({id:'lb-morning',kind:'TODAY',at:nextAt(now,p.morning.time,stackedToday),title:'오늘 쌓기 전이에요',body:'오늘 카드를 열어 하나씩 쌓아 보세요.',tab:'#today',daily:true});
  if(p.night.on)list.push({id:'lb-night',kind:'TODAY',at:nextAt(now,NIGHT_TIME,stackedToday),title:'오늘 카드가 아직 비어 있어요',body:'자기 전에 오늘 카드를 쌓아 두세요.',tab:'#today'});
  const bed=bedReminderTime(bedtime);
  if(p.bed.on&&bed)list.push({id:'lb-bed',kind:'HABIT',at:nextAt(now,bed),title:'곧 잘 시간이에요',body:'취침 목표 30분 전이에요.',tab:'#today',daily:true});
  if(p.weekly.on){
    const d=new Date(now),add=(7-d.getDay())%7;let at=atLocal(now,WEEKLY_TIME,add);if(at<=now)at=atLocal(now,WEEKLY_TIME,add+7);
    list.push({id:'lb-weekly',kind:'REVIEW',at,title:'이번 주 돌아보기',body:'한 주를 돌아보고 다음 주를 정해 보세요.',tab:'#today'});
  }
  return list;
}

// ---- 캘린더 ----
export const EXAM_KEY_PREFIX='lb-exam-';
export function examEvents(exams){
  const out=[];
  for(const x of exams?.items??[]){
    if(!x||typeof x.id!=='string'||typeof x.name!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date))continue;
    // key는 [A-Za-z0-9-]{1,64}. id에 다른 글자가 있으면 바꾼 글자 + 원래 id의 해시를 붙여 서로 다른 id가 같은 key가 되지 않게 한다.
    const safe=x.id.replace(/[^A-Za-z0-9-]/g,'-'),key=EXAM_KEY_PREFIX+(safe===x.id?safe.slice(0,40):safe.slice(0,28)+'-'+fnv(x.id,2166136261));
    const [y,m,d]=x.date.split('-').map(Number);
    out.push({key,title:x.name.slice(0,200),start:new Date(y,m-1,d,8,40).getTime(),end:new Date(y,m-1,d,17,40).getTime(),description:'LIFE BRICK 시험 일정'});
  }
  return out.slice(0,NATIVE_LIMITS.events);
}

// ---- 캘린더 거울(P1D2): 앱이 원본, 캘린더는 거울 ----
// 하루 계획은 블록마다 일정 1개, EVENT는 회차마다 일정 1개. 오늘부터 2주만 맞추고 지난 날짜는 건드리지 않는다. 시험은 지금처럼 단추로만 넣는다.
// 지우기는 앱이 만든 key만 다리에 넘기고, 다리는 꼬리표가 정확히 맞는 일정만 지운다(바깥 일정 0). 바깥에서 들여온 EVENT(ics-)는 다시 내보내지 않는다.
// 실리는 것은 과목 이름·장 수·EVENT 제목·시각뿐이다. 설정과 상태는 이 기기 저장소에만 있고 기록이 아니다.
export const IMPORTED_EVENT_PREFIX='ics-';
export const MIRROR_DAYS=14;
export const MIRROR_BLOCK_TEXT=Object.freeze({M:'오전',A:'오후',E:'저녁',N:'밤'});
export const MIRROR_BLOCK_LABELS=Object.freeze({M:'M 오전',A:'L 오후',E:'D 저녁',N:'N 밤'});
export const MIRROR_BLOCK_DEFAULTS=Object.freeze({M:Object.freeze({start:'08:00',end:'12:00'}),A:Object.freeze({start:'13:00',end:'18:00'}),E:Object.freeze({start:'19:00',end:'22:00'}),N:Object.freeze({start:'22:00',end:'24:00'})});
const MIRROR_BLOCKS=Object.keys(MIRROR_BLOCK_DEFAULTS),MIRROR_REPEAT_MAX=400,TIMED_EVENT_MS=3600000;
const DATE=/^\d{4}-\d{2}-\d{2}$/,BLOCK_END=/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/,MIRROR_EVENT_KEY=/^lb-ev-[A-Za-z0-9-]{1,58}$/;
const minutesOf=hm=>Number(hm.slice(0,2))*60+Number(hm.slice(3));
const localMs=(date,hm)=>{const [y,m,d]=date.split('-').map(Number),[h,mi]=hm.split(':').map(Number);return new Date(y,m-1,d,h,mi).getTime();};
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const hiddenItem=x=>x.private===true||x.hidden===true;
const blockTimeOK=v=>Boolean(v)&&HM.test(v.start)&&BLOCK_END.test(v.end)&&minutesOf(v.end)>minutesOf(v.start);
export function normalizeMirror(raw){
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},blocks={},tracked={};
  for(const b of MIRROR_BLOCKS){const v=r.blocks?.[b];blocks[b]=blockTimeOK(v)?{start:v.start,end:v.end}:{...MIRROR_BLOCK_DEFAULTS[b]};}
  if(r.tracked&&typeof r.tracked==='object')for(const [k,d] of Object.entries(r.tracked))if(MIRROR_EVENT_KEY.test(k)&&DATE.test(d))tracked[k]=d;
  return {on:r.on===true,events:r.events!==false,calendarId:Number.isSafeInteger(r.calendarId)&&r.calendarId>0?r.calendarId:null,lastFull:DATE.test(r.lastFull)?r.lastFull:null,blocks,tracked};
}
export const planBlockKey=(date,block)=>'lb-pd-'+date.replaceAll('-','')+'-'+block;
// key는 [A-Za-z0-9-]{1,64}. id에 다른 글자가 있거나 길면 바꾼 글자 + 원래 id의 해시를 붙여 서로 다른 id가 같은 key가 되지 않게 한다.
export function eventOccurrenceKey(id,index){
  const safe=id.replace(/[^A-Za-z0-9-]/g,'-');
  return 'lb-ev-'+(safe===id&&safe.length<=40?safe:safe.slice(0,28)+'-'+fnv(id,2166136261))+'-'+index;
}
// 하루 계획 한 장 → 블록마다 일정 1개. 예: "LB 오전 · 수학 2 · 영어 1 (3장)". 할 일 글자는 싣지 않는다.
export function planBlockEvents(row,{names=new Map(),blocks=MIRROR_BLOCK_DEFAULTS}={}){
  const d=row?.data,out=[];
  if(!d||hiddenItem(d)||!DATE.test(row.date))return out;
  for(const block of MIRROR_BLOCKS){
    const bySubject=new Map();let total=0;
    for(const x of d.items??[]){
      if(!x||x.block!==block||hiddenItem(x)||!Number.isFinite(x.bricks)||x.bricks<=0)continue;
      const name=names.get(x.subjectId)??'공부';bySubject.set(name,(bySubject.get(name)??0)+x.bricks);total+=x.bricks;
    }
    if(!total)continue;
    const parts=[...bySubject].map(([name,n])=>name+' '+n);
    out.push({key:planBlockKey(row.date,block),title:('LB '+MIRROR_BLOCK_TEXT[block]+' · '+parts.join(' · ')+' ('+total+'장)').slice(0,200),start:localMs(row.date,blocks[block].start),end:localMs(row.date,blocks[block].end),description:'LIFE BRICK 하루 계획'});
  }
  return out;
}
// EVENT 엔티티 → 범위 안 회차마다 {date,event}. 다리에 종일 일정이 없어 종일 EVENT는 그날 00:00~24:00으로 쓴다. 시각 일정은 ICS와 같이 한 시간.
export function eventOccurrences(rows,{from,to}){
  const out=[];
  for(const row of rows??[]){
    const d=row?.data,id=row?.entityId;
    if(!d||d.deleted||hiddenItem(d)||typeof id!=='string'||id.startsWith(IMPORTED_EVENT_PREFIX)||!DATE.test(d.date)||typeof d.title!=='string'||!d.title.trim())continue;
    const r=d.recurrence,count=Math.min(r?.count??1,MIRROR_REPEAT_MAX),step=r?r.interval*(r.frequency==='WEEKLY'?7:1):0,timed=d.allDay!==true&&HM.test(d.time);
    for(let i=0;i<count;i++){
      const date=addDays(d.date,i*step);
      if(date>to)break;
      if(date<from)continue;
      const start=localMs(date,timed?d.time:'00:00');
      out.push({date,event:{key:eventOccurrenceKey(id,i),title:d.title.slice(0,200),start,end:timed?start+TIMED_EVENT_MS:localMs(date,'24:00'),description:'LIFE BRICK 일정'}});
    }
  }
  return out;
}

// ---- 걸음·수면(Health Connect) ----
export const HEALTH_POLL=Object.freeze({waitMs:400,attempts:40});
const epochOK=v=>Number.isSafeInteger(v)&&v>0;
// 다리가 준 하루치를 검증해 화면이 쓰는 모양으로 바꾼다. 자료 없음은 null 그대로(0으로 바꾸지 않는다). 모양이 틀리면 null.
export function normalizeHealthDay(raw,date){
  if(!raw||raw.date!==date||!(raw.steps===null||(Number.isSafeInteger(raw.steps)&&raw.steps>=0)))return null;
  if(raw.sleep===null)return {ok:true,date,steps:raw.steps,sleep:null};
  const s=raw.sleep;
  if(!s||typeof s!=='object'||!epochOK(s.start)||!epochOK(s.end)||s.end<s.start)return null;
  return {ok:true,date,steps:raw.steps,sleep:{startAt:new Date(s.start).toISOString(),endAt:new Date(s.end).toISOString()}};
}

// ---- 다리 묶음 ----
export function createNativeBridge({native=globalThis.LifeBrickNative,storage,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const store=pickStorage(storage);
  let pending=[],lastError=null;
  // 다리가 확인되면 이 인스턴스에서는 다시 묻지 않는다(version() 반복 호출 방지). 없으면 매번 다시 확인한다(늦게 붙는 경우 대비).
  let confirmed=false;
  const available=()=>confirmed||(confirmed=nativeAvailable(native));
  const seenList=()=>{const v=readJson(store,NATIVE_KEYS.seen,[]);return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];};
  const rememberSeen=keys=>{const list=seenList();for(const k of keys)if(!list.includes(k))list.push(k);return writeJson(store,NATIVE_KEYS.seen,list.slice(-NATIVE_LIMITS.seen));};
  const listOf=key=>{const v=readJson(store,key,[]);return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];};
  const noteUnacked=keys=>{const list=listOf(NATIVE_KEYS.unacked);for(const k of keys)if(!list.includes(k))list.push(k);writeJson(store,NATIVE_KEYS.unacked,list.slice(-NATIVE_LIMITS.unacked));};
  const clearUnacked=keys=>{const list=listOf(NATIVE_KEYS.unacked);if(list.some(k=>keys.includes(k)))writeJson(store,NATIVE_KEYS.unacked,list.filter(k=>!keys.includes(k)));};
  const flagDrafts=()=>{
    const added=new Set(listOf(NATIVE_KEYS.added));
    for(const d of pending){
      d.twin=pending.some(o=>o!==d&&o.kind===d.kind&&o.amount===d.amount&&Math.abs(o.at-d.at)<=SAME_PAYMENT_MS);
      const slot=slotOf(d.at);d.added=d.kind==='EXPENSE'&&[slot-1,slot,slot+1].some(x=>added.has(addedSig(x,d.amount)));
    }
  };
  const ack=ids=>{const clean=ids.filter(x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x)).slice(0,NATIVE_LIMITS.drafts);return clean.length?callNative(native,'ackExpenseDrafts',JSON.stringify(clean)):{ok:true,removed:0};};
  const upsertEvents=(calendarId,events)=>callNative(native,'upsertCalendarEvents',JSON.stringify({calendarId,events}));
  const chunksOf=list=>{const out=[];for(let i=0;i<list.length;i+=NATIVE_LIMITS.events)out.push(list.slice(i,i+NATIVE_LIMITS.events));return out;};
  const mirrorUpsert=(calendarId,events)=>{
    const out={created:0,updated:0,failed:0,error:null};
    for(const chunk of chunksOf(events)){
      const r=upsertEvents(calendarId,chunk);
      if(!r.ok||!Array.isArray(r.results)){out.failed+=chunk.length;out.error=r.error||'BRIDGE_ERROR';continue;}
      for(const x of r.results){if(x?.action==='CREATED')out.created++;else if(x?.action==='UPDATED')out.updated++;else out.failed++;}
    }
    return out;
  };
  // 옛 APK(삭제 메서드 없음)는 오류가 아니다: 지우기만 건너뛰고, 지울 key는 남겨 앱을 업데이트한 뒤의 맞추기에서 지운다.
  const mirrorDelete=(calendarId,keys)=>{
    const out={deleted:0,skipped:0,kept:new Set(),error:null};
    for(const chunk of chunksOf(keys)){
      const r=callNative(native,'deleteCalendarEvents',JSON.stringify({calendarId,keys:chunk}));
      if(r.error==='BRIDGE_UNAVAILABLE'){out.skipped+=chunk.length;chunk.forEach(k=>out.kept.add(k));continue;}
      if(!r.ok||!Array.isArray(r.results)){chunk.forEach(k=>out.kept.add(k));out.error=r.error||'BRIDGE_ERROR';continue;}
      const gone=new Set();
      for(const x of r.results){if(x?.action==='DELETED'){out.deleted++;gone.add(x.key);}else if(x?.action==='NOT_FOUND')gone.add(x.key);}
      for(const k of chunk)if(!gone.has(k))out.kept.add(k);
    }
    return out;
  };
  const api={
    available,
    permissions(){const r=callNative(native,'permissionState');return r.ok?{notificationAccess:r.notificationAccess===true,notifications:r.notifications===true,calendar:r.calendar===true}:null;},
    error:()=>lastError,
    openAccessSettings:()=>callNative(native,'openNotificationAccessSettings'),
    pending:()=>pending.slice(),
    // 다리에서 미처리 결제 알림을 읽어 보이는 목록(pending)을 만든다. 쓰기 0. 이미 처리한 것·같은 알림은 건너뛰고 다리에 처리됨만 알린다.
    refreshDrafts(){
      if(!available()){pending=[];lastError=null;return pending;}
      const r=callNative(native,'getExpenseDrafts');
      if(!r.ok||!Array.isArray(r.drafts)){lastError=r.error||'BRIDGE_ERROR';return pending;}
      lastError=null;
      const seen=new Set([...seenList(),...listOf(NATIVE_KEYS.unacked)]),batch=new Set(),fresh=[],done=[];
      for(const raw of r.drafts.slice(0,NATIVE_LIMITS.drafts)){
        const d=normalizeDraft(raw);if(!d)continue;
        if(d.keys.some(k=>seen.has(k))){if(d.id)done.push(d);continue;}
        if(d.keys.some(k=>batch.has(k)))continue;
        d.keys.forEach(k=>batch.add(k));fresh.push(d);
      }
      if(done.length&&ack(done.map(d=>d.id)).ok)clearUnacked(done.flatMap(d=>d.keys));
      fresh.sort((a,b)=>a.at-b.at);
      pending=fresh;flagDrafts();return pending;
    },
    // 저장이 성공한 뒤(또는 사용자가 버린 뒤)에만 부른다: 이 기기에 처리됨으로 기억하고 다리에 알린다.
    markHandled(draft){
      if(!draft||!Array.isArray(draft.keys))return {ok:false};
      rememberSeen(draft.keys);pending=pending.filter(d=>d!==draft&&!d.keys.some(k=>draft.keys.includes(k)));
      const r=draft.id?ack([draft.id]):{ok:true,removed:0};
      if(!r.ok&&draft.id)noteUnacked(draft.keys);
      return r;
    },
    // 거래가 받아들여진 뒤(서버 확정·임시 저장 모두) 부른다: 넣은 결제로 기억하고, 아직 처리 표시가 안 됐으면(임시 저장) 처리됨으로 표시한다.
    markAdded(draft){
      if(!draft||!Array.isArray(draft.keys)||typeof draft.at!=='number')return {ok:false};
      if(draft.kind==='EXPENSE'){const list=listOf(NATIVE_KEYS.added),sig=addedSig(slotOf(draft.at),draft.amount);if(!list.includes(sig))list.push(sig);writeJson(store,NATIVE_KEYS.added,list.slice(-NATIVE_LIMITS.added));}
      const r=pending.includes(draft)?api.markHandled(draft):{ok:true,removed:0};
      flagDrafts();return r;
    },
    reminderPrefs:()=>normalizeReminders(readJson(store,NATIVE_KEYS.reminders,null)),
    setReminder(name,patch){
      const p=api.reminderPrefs();if(!Object.hasOwn(p,name))return null;
      p[name]={...p[name],...patch};p.morning.time=HM.test(p.morning.time)?p.morning.time:REMINDER_DEFAULTS.morning.time;
      return writeJson(store,NATIVE_KEYS.reminders,p)?p:null;
    },
    // 켜는 순간 알림 권한을 요청하고(결과는 콜백이 아니라 다음 permissions()로 안다), 전체 목록을 다리에 보낸다.
    requestNotificationPermission:()=>callNative(native,'requestNotificationPermission'),
    pushReminders({stackedToday=false,bedtime=null}={}){
      if(!available())return {ok:false,error:'BRIDGE_UNAVAILABLE'};
      const list=buildReminders(api.reminderPrefs(),{now:now(),stackedToday,bedtime});
      return callNative(native,'scheduleReminders',JSON.stringify(list));
    },
    // 걸음·수면. 옛 앱(메서드 없음)·미지원이면 healthState는 null이거나 supported:false다(건강 화면 버튼이 숨는다).
    healthState(){const r=callNative(native,'healthState');return r.ok===true?{supported:r.supported===true,available:r.available===true,steps:r.steps==='granted'?'granted':'denied',sleep:r.sleep==='granted'?'granted':'denied'}:null;},
    requestHealthPermission:()=>callNative(native,'requestHealthPermission'),
    // 결과: {ok:true,date,steps:number|null,sleep:{startAt,endAt}|null} 또는 {ok:false,error}.
    async readHealthDay(date,{waitMs=HEALTH_POLL.waitMs,attempts=HEALTH_POLL.attempts}={}){
      for(let i=0;i<attempts;i++){
        const r=callNative(native,'readHealthDay',date);
        if(r.ok===true&&r.pending===true){await wait(waitMs);continue;}
        if(r.ok!==true)return {ok:false,error:r.error||'BRIDGE_ERROR'};
        return normalizeHealthDay(r,date)??{ok:false,error:'BRIDGE_BAD_RESPONSE'};
      }
      return {ok:false,error:'TIMEOUT'};
    },
    calendarState(){const v=readJson(store,NATIVE_KEYS.calendar,null);return v&&typeof v==='object'&&Number.isSafeInteger(v.calendarId)&&Array.isArray(v.keys)?v:null;},
    listCalendars(){const r=callNative(native,'listCalendars');return r.ok&&Array.isArray(r.calendars)?r.calendars.filter(c=>c&&Number.isSafeInteger(c.id)&&typeof c.name==='string'):null;},
    chooseCalendar(id){const s=api.calendarState();return writeJson(store,NATIVE_KEYS.calendar,{calendarId:id,keys:s&&s.calendarId===id?s.keys:[]});},
    // 사용자가 단추를 눌렀을 때만 부른다. 반환 state: NO_BRIDGE / NEEDS_PERMISSION / NO_CALENDAR / FAILED / DONE.
    syncExams(exams){
      if(!available())return {state:'NO_BRIDGE'};
      const perm=api.permissions();
      if(!perm?.calendar){callNative(native,'requestCalendarPermission');return {state:'NEEDS_PERMISSION'};}
      const cals=api.listCalendars();if(!cals)return {state:'FAILED'};if(!cals.length)return {state:'NO_CALENDAR'};
      const saved=api.calendarState(),chosen=cals.find(c=>c.id===saved?.calendarId)??cals.find(c=>c.primary)??cals[0];
      const events=examEvents(exams);if(!events.length)return {state:'DONE',created:0,updated:0,failed:0,calendarId:chosen.id};
      const r=upsertEvents(chosen.id,events);
      if(!r.ok||!Array.isArray(r.results))return {state:'FAILED',error:r.error||'BRIDGE_ERROR'};
      const count=a=>r.results.filter(x=>x?.action===a).length,done=r.results.filter(x=>x?.action==='CREATED'||x?.action==='UPDATED').map(x=>x.key).filter(k=>typeof k==='string');
      const keep=saved&&saved.calendarId===chosen.id?saved.keys:[];
      writeJson(store,NATIVE_KEYS.calendar,{calendarId:chosen.id,keys:[...new Set([...keep,...done])].slice(0,NATIVE_LIMITS.events)});
      return {state:'DONE',created:count('CREATED'),updated:count('UPDATED'),failed:count('FAILED'),calendarId:chosen.id};
    },
    // ---- 캘린더 거울(P1D2) ----
    requestCalendarPermission:()=>callNative(native,'requestCalendarPermission'),
    mirrorPrefs:()=>normalizeMirror(readJson(store,NATIVE_KEYS.mirror,null)),
    // 켜기·끄기, EVENT 포함 여부. 바뀌면 다음 계획 탭 열기에서 2주치를 다시 맞춘다.
    setMirror(patch){
      const p=api.mirrorPrefs();
      if(typeof patch?.on==='boolean')p.on=patch.on;
      if(typeof patch?.events==='boolean')p.events=patch.events;
      p.lastFull=null;
      return writeJson(store,NATIVE_KEYS.mirror,p)?p:null;
    },
    // 블록 시각: 'HH:MM', 끝은 24:00까지, 끝 > 시작. 틀리면 null이고 저장하지 않는다.
    setMirrorBlock(block,patch){
      const p=api.mirrorPrefs();if(!Object.hasOwn(p.blocks,block))return null;
      const next={...p.blocks[block],...patch};if(!blockTimeOK(next))return null;
      p.blocks[block]={start:next.start,end:next.end};p.lastFull=null;
      return writeJson(store,NATIVE_KEYS.mirror,p)?p:null;
    },
    // 소유자가 칩으로 고른 캘린더에만 쓴다(주 캘린더로 저절로 가지 않는다). 시험 단추도 같은 캘린더를 따른다. 바꾸면 전에 넣은 일정은 그 캘린더에 그대로 남는다.
    chooseMirrorCalendar(id){
      const p=api.mirrorPrefs();if(!Number.isSafeInteger(id)||id<=0)return null;
      if(p.calendarId!==id){p.calendarId=id;p.tracked={};p.lastFull=null;}
      api.chooseCalendar(id);
      return writeJson(store,NATIVE_KEYS.mirror,p)?p:null;
    },
    // dates를 주면 그 날의 하루 계획만, 없으면 오늘부터 2주치 전체를 맞춘다. 꺼져 있으면 다리 호출 0. 권한은 묻지 않는다(토글을 켤 때만 묻는다).
    // 반환 state: OFF / NO_BRIDGE / NO_CALENDAR / NEEDS_PERMISSION / FAILED / DONE.
    mirrorSync({life=null,events=[],subjects=[],today,dates=null}={}){
      const p=api.mirrorPrefs();
      if(!p.on)return {state:'OFF'};
      if(!available())return {state:'NO_BRIDGE'};
      if(!DATE.test(today))return {state:'FAILED',error:'BAD_TODAY'};
      if(p.calendarId===null)return {state:'NO_CALENDAR'};
      if(!api.permissions()?.calendar)return {state:'NEEDS_PERMISSION'};
      const full=dates===null,last=addDays(today,MIRROR_DAYS-1),span=Array.from({length:MIRROR_DAYS},(_,i)=>addDays(today,i));
      const targets=full?span:span.filter(d=>dates.includes(d));
      const names=new Map((subjects??[]).map(s=>[s?.id,s?.name]));
      const blocks=(life?.plans??[]).filter(r=>targets.includes(r?.date)).flatMap(r=>planBlockEvents(r,{names,blocks:p.blocks}));
      const occurrences=full&&p.events?eventOccurrences(events,{from:today,to:last}):[];
      const want=[...blocks,...occurrences.map(o=>o.event)],wantKeys=new Set(want.map(e=>e.key));
      const stale=targets.flatMap(d=>MIRROR_BLOCKS.map(b=>planBlockKey(d,b))).filter(k=>!wantKeys.has(k));
      if(full)for(const [k,d] of Object.entries(p.tracked))if(d>=today&&!wantKeys.has(k))stale.push(k);
      const up=mirrorUpsert(p.calendarId,want),del=mirrorDelete(p.calendarId,stale);
      if(full){
        const tracked={};
        for(const [k,d] of Object.entries(p.tracked))if(d>=today&&del.kept.has(k))tracked[k]=d;
        for(const o of occurrences)tracked[o.event.key]=o.date;
        p.tracked=tracked;p.lastFull=today;
        writeJson(store,NATIVE_KEYS.mirror,p);
      }
      const error=up.error??del.error;
      return {state:error?'FAILED':'DONE',...(error?{error}:{}),created:up.created,updated:up.updated,failed:up.failed,deleted:del.deleted,deleteSkipped:del.skipped};
    },
    // 계획 탭을 열 때: 켜져 있고 오늘 아직 안 맞췄으면 2주치. 실패해도 오늘은 다시 시도하지 않는다("지금 맞추기"는 된다).
    mirrorDaily(args){
      const p=api.mirrorPrefs();
      if(!p.on)return {state:'OFF'};
      if(p.lastFull===args?.today)return {state:'SKIPPED'};
      return api.mirrorSync(args);
    },
    // ---- 열품타(YPT1) ----
    yptPrefs:()=>({on:readJson(store,NATIVE_KEYS.ypt,null)?.on===true}),
    setYpt(on){return writeJson(store,NATIVE_KEYS.ypt,{on:on===true})?api.yptPrefs():null;},
    // 옛 앱(메서드 없음)이면 null(설정 절이 숨는다).
    yptState(){
      const r=callNative(native,'yptState');if(r.ok!==true)return null;
      const l=r.last,last=l&&typeof l==='object'&&(l.action==='start'||l.action==='stop')&&Number.isSafeInteger(l.at)?{action:l.action,ok:l.ok===true,code:typeof l.code==='string'?l.code:null,at:l.at}:null;
      return {accessOn:r.accessOn===true,package:typeof r.package==='string'?r.package:null,label:typeof r.label==='string'?r.label:null,startLearned:r.startLearned===true,stopLearned:r.stopLearned===true,learning:r.learning==='START'||r.learning==='STOP'?r.learning:'NONE',last};
    },
    yptCandidates(){const r=callNative(native,'yptCandidates');return r.ok===true&&Array.isArray(r.candidates)?r.candidates.filter(c=>c&&typeof c.package==='string'&&typeof c.label==='string'):[];},
    yptConfirmPackage:name=>callNative(native,'yptConfirmPackage',name),
    yptOpenAccessibilitySettings:()=>callNative(native,'yptOpenAccessibilitySettings'),
    yptStartLearning:()=>callNative(native,'yptStartLearning'),
    // R42 (YPT1B 확인 요청 1번): 준비 안 됨 알림은 하루 1번까지(이 기기 저장소에 KST 날짜만 남긴다). 그 날짜를 못 적으면 알리지 않는다(횟수를 지킬 수 없으므로).
    yptNotReady(){
      const day=kstDateOf(now());
      if(readJson(store,NATIVE_KEYS.yptNotice,null)?.day===day)return {state:'NOT_READY',notice:null};
      return {state:'NOT_READY',notice:writeJson(store,NATIVE_KEYS.yptNotice,{day})?YPT_TEXT.notReady:null};
    },
    // 타이머 시작('start')·끝내고 담기와 취소('stop') 때 부른다. 꺼져 있으면 다리 호출이 하나도 없다(version 포함). 던지지 않는다.
    // R42: 시작 때만 준비를 미리 본다. 접근성 꺼짐·버튼 미학습(설정의 "둘 다 배웠어요"가 아니면 미학습)이면 yptTrigger를 부르지 않아 열품타가 열리지 않는다. 옛 앱처럼 상태를 모르면 전과 같이 yptTrigger에 맡긴다.
    yptTimer(action){
      if(!api.yptPrefs().on)return {state:'OFF'};
      if(!available())return {state:'NO_BRIDGE'};
      if(action==='start'){const s=api.yptState();if(s&&!(s.accessOn&&s.package&&s.startLearned&&s.stopLearned))return api.yptNotReady();}
      const r=callNative(native,'yptTrigger',action);
      if(action==='start'&&r.error==='NOT_READY')return api.yptNotReady();
      return r.ok===true?{state:'STARTED'}:{state:'FAILED',error:r.error||'BRIDGE_ERROR'};
    },
  };
  return api;
}

// ---- 화면 조각: h = {el,add,button}(app.mjs의 DOM 헬퍼), 쓰기는 부르는 쪽 콜백이 한다 ----
// 오늘 탭 칩. 처리할 결제가 없으면 아무것도 그리지 않는다.
export function renderPayChip(root,{h,br,onOpen}){
  if(!br||!br.available())return null;
  const n=br.pending().length;if(!n)return null;
  const b=h.button(NATIVE_TEXT.chip(n),onOpen,'lb-chip native-pay-chip');b.dataset.navOnly='1';
  h.add(root,h.add(h.el('div',null,'native-pay-row'),b));return b;
}
// 초안 시트 안쪽. onAdd(draft)=기존 거래 입력 열기, onDiscard(draft)·onAck(draft)는 처리됨 표시 후 다시 그리기.
// recurringName(draft)=정기 결제 규칙과 맞으면 규칙 이름(B48). 작은 칩만 보이고 자동 확정은 없다.
// alreadyAdded(draft)=이미 가계부에 같은 결제로 보이는 거래가 있으면 참(B48C F1). 경고만 하고 막지 않는다.
export function payDraftBody({h,br,formatWon,onAdd,onDiscard,recurringName=null,alreadyAdded=null}){
  const body=h.el('div',null,'native-pay-list'),list=br.pending();
  if(!list.length)h.add(body,h.el('p',NATIVE_TEXT.empty,'muted'));
  for(const d of list){
    const cancel=d.kind==='CANCEL',head=h.el('strong',(cancel?'취소 · ':'')+formatWon(d.amount)),sub=h.el('span',(d.merchant||'가맹점 모름')+' · '+kstDateOf(d.at)+' '+kstTimeOf(d.at)+(d.last4?' · 카드 끝 '+d.last4:''),'muted small');
    const row=h.add(h.el('div',null,'native-pay-item'+(cancel?' cancel':'')),h.add(h.el('div',null,'native-pay-main'),head,sub));
    const rec=cancel||!recurringName?null:recurringName(d);
    if(rec)h.add(row,h.el('span','정기 결제: '+rec,'native-pay-recurring'));
    if(cancel)h.add(row,h.el('p',NATIVE_TEXT.cancel,'muted small'));
    if(d.twin)h.add(row,h.el('p',NATIVE_TEXT.twin,'muted small'));
    if(!cancel&&(d.added||alreadyAdded?.(d)))h.add(row,h.el('p',NATIVE_TEXT.added,'muted small'));
    h.add(row,h.add(h.el('div',null,'button-row'),cancel?null:h.button(NATIVE_TEXT.add,()=>onAdd(d),'primary'),h.button(cancel?NATIVE_TEXT.ok:NATIVE_TEXT.discard,()=>onDiscard(d),'secondary')));
    h.add(body,row);
  }
  return body;
}
// 설정 "알림 · 캘린더" 절. 다리가 없으면 null(절 자체를 숨긴다).
// ctx: {h,kit:{toggle},br,exams,stackedToday(),bedtime(),status(text),rerender()}
export function renderNativeSettings(root,ctx){
  const {h,br,kit}=ctx;if(!br||!br.available())return null;
  const sec=h.add(h.el('section',null,'panel native-settings'),h.el('h2',NATIVE_TEXT.settingsTitle,'panel-title'));
  const perms=br.permissions();
  h.add(sec,h.add(h.el('div',null,'native-row'),h.el('p',perms?.notificationAccess?NATIVE_TEXT.payAccessOn:NATIVE_TEXT.payAccessOff,'muted'),
    perms?.notificationAccess?null:h.button(NATIVE_TEXT.payAccessBtn,()=>{const r=br.openAccessSettings();if(!r.ok)ctx.status?.(NATIVE_TEXT.fail);},'secondary')));
  const prefs=br.reminderPrefs(),push=()=>{const r=br.pushReminders({stackedToday:ctx.stackedToday?.()===true,bedtime:ctx.bedtime?.()??null});if(!r.ok)ctx.status?.(NATIVE_TEXT.fail);return r;};
  for(const name of ['morning','night','bed','weekly']){
    const row=h.el('div',null,'native-row');
    h.add(row,kit.toggle(REMINDER_LABELS[name],prefs[name].on,on=>{
      if(on){br.requestNotificationPermission();}
      br.setReminder(name,{on});const r=push();
      if(on&&r.ok&&!br.permissions()?.notifications)ctx.status?.(NATIVE_TEXT.noticePerm);
    }));
    if(name==='morning'){
      const t=h.el('input');t.type='time';t.value=prefs.morning.time;t.setAttribute('aria-label','아침 알림 시각');
      t.addEventListener('change',()=>{if(HM.test(t.value)){br.setReminder('morning',{time:t.value});push();}});
      h.add(row,t);
    }
    h.add(sec,row);
  }
  const cal=br.calendarState(),again=Boolean(cal?.keys.length),msg=h.el('p',null,'muted small');
  const run=h.button(again?NATIVE_TEXT.calBtnAgain:NATIVE_TEXT.calBtn,()=>{
    const r=br.syncExams(ctx.exams);
    msg.textContent=r.state==='NEEDS_PERMISSION'?NATIVE_TEXT.calPerm:r.state==='NO_CALENDAR'?NATIVE_TEXT.calNone:r.state==='DONE'?'캘린더에 시험 일정 '+(r.created+r.updated)+'개를 맞췄어요'+(r.failed?' · 못 넣은 것 '+r.failed+'개':''):NATIVE_TEXT.fail;
    if(r.state==='DONE')run.textContent=NATIVE_TEXT.calBtnAgain;
  },'secondary');
  h.add(sec,h.add(h.el('div',null,'native-row'),run),msg,h.el('p','단추를 누를 때만 캘린더에 쓰고, 자동으로 넣지 않아요. 다시 눌러도 같은 일정은 새로 만들지 않고 고쳐요.','muted small'));
  h.add(root,sec);return sec;
}
// 설정 "계획을 캘린더에 맞추기" 절(P1D2). 다리가 없으면 null. 그리기만으로는 캘린더에 쓰지 않는다.
// ctx: {h,kit:{toggle,chip},br,views()=>{life,events,subjects,today},rerender()}
export const MIRROR_TEXT=Object.freeze({
  title:'계획을 캘린더에 맞추기',
  toggle:'계획을 캘린더에도 맞추기',
  events:'약속·기한 일정도 함께 넣기',
  pick:'넣을 캘린더 — 구글 캘린더에 "LIFE BRICK" 캘린더를 먼저 만들고 여기서 고르세요. 구글 쪽 캘린더여야 PC·iPad에서도 보여요.',
  perm:'캘린더 권한이 필요해요 — 허용한 뒤 "다시 확인"을 눌러 주세요.',
  recheck:'다시 확인',
  off:'먼저 위 토글을 켜 주세요.',
  choose:'넣을 캘린더를 먼저 골라 주세요.',
  badTime:'끝 시각은 시작 시각보다 늦어야 해요.',
  run:'지금 맞추기',
  rules:'켜 두면 계획을 저장할 때 그 날만, 계획 탭을 열 때 하루 한 번 오늘부터 2주치를 맞춰요. 앱 내용이 원본이라 캘린더에서 고친 제목·시각은 다음에 앱 값으로 돌아오고, 앱에서 계획을 지우면 캘린더 일정도 지워요. 앱이 넣지 않은 일정과 지난 날짜는 건드리지 않아요. 캘린더를 바꾸면 전에 넣은 일정은 그 캘린더에 남아요.',
});
export function mirrorResultText(r){
  if(r.state==='OFF')return MIRROR_TEXT.off;
  if(r.state==='NO_CALENDAR')return MIRROR_TEXT.choose;
  if(r.state==='NEEDS_PERMISSION')return MIRROR_TEXT.perm;
  if(r.state!=='DONE')return NATIVE_TEXT.fail;
  return '캘린더에 '+(r.created+r.updated)+'개를 맞췄어요'+(r.deleted?' · 지운 것 '+r.deleted+'개':'')+(r.failed?' · 못 넣은 것 '+r.failed+'개':'')+(r.deleteSkipped?' · 지우기는 Fold 앱을 업데이트한 뒤에 돼요':'');
}
export function renderMirrorSettings(root,ctx){
  const {h,br,kit}=ctx;if(!br||!br.available())return null;
  const p=br.mirrorPrefs(),perms=br.permissions(),msg=h.el('p',null,'muted small');msg.setAttribute('role','status');
  const sec=h.add(h.el('section',null,'panel native-settings'),h.el('h2',MIRROR_TEXT.title,'panel-title'));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(MIRROR_TEXT.toggle,p.on,on=>{
    br.setMirror({on});
    if(on&&!br.permissions()?.calendar){br.requestCalendarPermission();msg.textContent=MIRROR_TEXT.perm;}
  })));
  h.add(sec,h.el('p',MIRROR_TEXT.pick,'muted small'));
  const cals=perms?.calendar?br.listCalendars():null,row=h.el('div',null,'native-row');
  if(!perms?.calendar)h.add(row,h.button(MIRROR_TEXT.recheck,()=>ctx.rerender?.(),'secondary'));
  else if(!cals?.length)h.add(row,h.el('p',NATIVE_TEXT.calNone,'muted small'));
  else for(const c of cals)h.add(row,kit.chip(c.name||'이름 없는 캘린더',{selected:c.id===p.calendarId,onClick:()=>{br.chooseMirrorCalendar(c.id);ctx.rerender?.();}}));
  h.add(sec,row);
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(MIRROR_TEXT.events,p.events,on=>{br.setMirror({events:on});})));
  for(const block of MIRROR_BLOCKS){
    const blockRow=h.add(h.el('div',null,'native-row'),h.el('span',MIRROR_BLOCK_LABELS[block],'muted small'));
    for(const field of ['start','end']){
      const shown=()=>{const v=br.mirrorPrefs().blocks[block][field];return v==='24:00'?'00:00':v;},t=h.el('input');
      t.type='time';t.value=shown();t.setAttribute('aria-label',MIRROR_BLOCK_LABELS[block]+(field==='start'?' 시작':' 끝'));
      // 시각 칸에는 24:00이 없어 끝 칸의 00:00을 그날 끝(24:00)으로 읽는다.
      t.addEventListener('change',()=>{
        const value=field==='end'&&t.value==='00:00'?'24:00':t.value;
        if(br.setMirrorBlock(block,{[field]:value}))msg.textContent='';
        else{t.value=shown();msg.textContent=MIRROR_TEXT.badTime;}
      });
      h.add(blockRow,t);
    }
    h.add(sec,blockRow);
  }
  h.add(sec,h.add(h.el('div',null,'native-row'),h.button(MIRROR_TEXT.run,()=>{msg.textContent=mirrorResultText(br.mirrorSync(ctx.views()));},'secondary')),msg,h.el('p',MIRROR_TEXT.rules,'muted small'));
  h.add(root,sec);return sec;
}
// 설정 "열품타 같이 켜기" 절(YPT1). 다리가 없거나 옛 앱이면 null. 그리기만으로는 열품타를 열지 않는다.
// ctx: {h,kit:{toggle},br,rerender()}
export const YPT_TEXT=Object.freeze({
  title:'열품타 같이 켜기',
  toggle:'공부 타이머와 열품타 같이 켜기',
  notReady:'열품타 같이 켜기: 준비 안 됨 — 설정에서 확인',
  rules:'공부 타이머를 시작하면 열품타를 열어 시작 버튼을 눌러 주고, 끝내고 담거나 취소하면 정지 버튼을 눌러 줘요. 잠깐 열품타가 앞에 나왔다가 돌아와요.',
  rest:'휴식 중 열품타는 계속 돎 — 휴식은 LIFE BRICK 공부 시간에만 빠져요.',
  accessOn:'접근성: 켜짐',accessOff:'접근성: 꺼짐 — "LIFE BRICK 열품타 연동"을 켜 주세요. 직접 설치한 앱이면 앱 정보에서 "제한된 설정 허용"이 먼저 필요할 수 있어요.',accessBtn:'접근성 설정 열기',
  noApp:'열품타 앱을 찾지 못했어요. 설치한 뒤 "다시 확인"을 눌러 주세요.',
  pick:n=>n+' 이 앱이 맞나요?',pickBtn:'이 앱이 맞아요',
  app:n=>'열품타 앱: '+n,
  learnStep:{START:'배우는 중 — 열품타의 시작 버튼을 직접 1번 눌러 주세요.',STOP:'배우는 중 — 이제 열품타의 정지 버튼을 직접 1번 눌러 주세요.'},
  learned:'버튼: 시작·정지 둘 다 배웠어요',unlearned:'버튼: 아직 안 배웠어요',
  learnBtn:'배우기 시작',relearnBtn:'다시 배우기',learnRule:'열품타가 열리면 시작 버튼을 1번, 정지 버튼을 1번 직접 눌러 주세요. 다른 곳을 누르면 그것을 배우니, 잘못 눌렀으면 다시 배우세요. 누른 버튼의 정보만 이 기기에 남아요.',
  recheck:'다시 확인',
  never:'마지막 결과: 아직 없음',
  failCode:{NOT_INSTALLED:'열품타가 설치되어 있지 않음',BUTTON_NOT_FOUND:'버튼을 못 찾음',TIMEOUT:'5초 안에 못 누름'},
});
export function yptLastText(last){
  if(!last)return YPT_TEXT.never;
  const name=last.action==='start'?'시작':'정지',when=kstDateOf(last.at).slice(5)+' '+kstTimeOf(last.at);
  return '마지막 결과: '+name+' '+(last.ok?'성공':'실패 — '+(YPT_TEXT.failCode[last.code]??'다시 시도해 주세요'))+' · '+when;
}
export function renderYptSettings(root,ctx){
  const {h,br,kit}=ctx;if(!br||!br.available())return null;
  const s=br.yptState();if(!s)return null;
  const msg=h.el('p',null,'muted small');msg.setAttribute('role','status');
  const sec=h.add(h.el('section',null,'panel native-settings'),h.el('h2',YPT_TEXT.title,'panel-title'));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(YPT_TEXT.toggle,br.yptPrefs().on,on=>{br.setYpt(on);})),h.el('p',YPT_TEXT.rules,'muted small'),h.el('p',YPT_TEXT.rest,'muted small'));
  h.add(sec,h.add(h.el('div',null,'native-row'),h.el('p',s.accessOn?YPT_TEXT.accessOn:YPT_TEXT.accessOff,'muted'),
    s.accessOn?null:h.button(YPT_TEXT.accessBtn,()=>{const r=br.yptOpenAccessibilitySettings();if(!r.ok)msg.textContent=NATIVE_TEXT.fail;},'secondary')));
  const appRow=h.el('div',null,'native-row');
  if(s.package)h.add(appRow,h.el('p',YPT_TEXT.app(s.label??s.package),'muted'));
  else{
    const found=br.yptCandidates();
    if(!found.length)h.add(appRow,h.el('p',YPT_TEXT.noApp,'muted'));
    for(const c of found)h.add(appRow,h.el('p',YPT_TEXT.pick(c.label+' ('+c.package+')'),'muted'),h.button(YPT_TEXT.pickBtn,()=>{const r=br.yptConfirmPackage(c.package);if(r.ok)ctx.rerender?.();else msg.textContent=NATIVE_TEXT.fail;},'secondary'));
  }
  h.add(sec,appRow);
  const both=s.startLearned&&s.stopLearned,learning=YPT_TEXT.learnStep[s.learning]??null;
  h.add(sec,h.add(h.el('div',null,'native-row'),h.el('p',learning??(both?YPT_TEXT.learned:YPT_TEXT.unlearned),'muted'),
    s.package&&s.accessOn?h.button(both?YPT_TEXT.relearnBtn:YPT_TEXT.learnBtn,()=>{const r=br.yptStartLearning();if(!r.ok)msg.textContent=NATIVE_TEXT.fail;},'secondary'):null),h.el('p',YPT_TEXT.learnRule,'muted small'));
  h.add(sec,h.el('p',yptLastText(s.last),'muted small'),h.add(h.el('div',null,'native-row'),h.button(YPT_TEXT.recheck,()=>ctx.rerender?.(),'secondary')),msg);
  h.add(root,sec);return sec;
}
