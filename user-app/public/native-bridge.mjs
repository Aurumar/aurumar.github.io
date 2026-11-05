// B44B: Fold 앱 네이티브 다리(window.LifeBrickNative)의 웹 쪽 연결. 다리가 없으면(PC·iPad·일반 브라우저) 모든 함수가 조용히 아무것도 안 한다(오류 0).
// 불러오는 모듈 없음(단독 파일). 다리·저장소·시계는 주입한다(시험은 가짜 다리와 메모리 저장소를 꽂는다).
// - 결제 알림 → 지출 초안: 다리의 getExpenseDrafts()가 주는 목록을 읽어 "초안"으로 보여줄 뿐 아무것도 쓰지 않는다(연산 0). 가계부 거래는 사용자가
//   초안을 열어 기존 거래 입력의 "저장"을 눌렀을 때만 만들어진다. 저장이 성공한 뒤에만 markHandled()가 id를 기억하고 다리에 ackExpenseDrafts()를 보낸다.
//   초안 자체는 다리(PayDraftStore)가 확인 전까지 보관한다 — 웹은 새 저장 형식을 만들지 않는다.
// - 중복 방지: 알림 id(32자 16진) 또는 시각+금액+가맹점 해시. 이 기기에서 이미 처리한 키(localStorage)와 같으면 보이지 않고 다리에 처리됨만 알린다.
// - 로컬 알림 4종 토글은 이 기기 localStorage에만 저장하고, 켜고 끌 때마다 다리 scheduleReminders()에 "전체 목록"을 보낸다(부분 목록은 나머지를 취소함).
// - 캘린더는 사용자가 단추를 눌렀을 때만 쓴다(자동 호출 없음). 일정 key가 안정적이라 다시 눌러도 새로 만들지 않고 고친다.
// - 걸음·수면(B58B, Health Connect): 건강 화면이 부를 때만 읽는다. 값은 메모리로만 지나가고 이 파일은 저장·로그하지 않는다. 다리의 readHealthDay는 pending 뒤 결과를 한 번만 주므로 여기서 짧게 되묻는다.
// 모든 다리 호출은 try/catch로 감싸 실패해도 화면은 계속 돌아간다.
export const NATIVE_KEYS=Object.freeze({reminders:'lb.native.reminders',seen:'lb.native.seen',calendar:'lb.native.calendar'});
export const NATIVE_LIMITS=Object.freeze({seen:500,drafts:200,events:64});
export const NATIVE_TEXT=Object.freeze({
  chip:n=>'Fold 결제 '+n+'건 · 눌러서 쌓기',
  sheetTitle:'Fold 결제 알림',
  empty:'처리할 결제 알림이 없어요.',
  cancel:'취소 알림 — 이미 넣은 거래가 있으면 가계부에서 직접 정리하세요.',
  twin:'같은 결제로 보이는 알림이 더 있어요 — 하나만 넣으세요.',
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
const NIGHT_TIME='21:30',WEEKLY_TIME='20:00',BED_LEAD_MIN=30,HM=/^([01]\d|2[0-3]):[0-5]\d$/;

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
  const ack=ids=>{const clean=ids.filter(x=>typeof x==='string'&&/^[0-9a-f]{32}$/.test(x)).slice(0,NATIVE_LIMITS.drafts);return clean.length?callNative(native,'ackExpenseDrafts',JSON.stringify(clean)):{ok:true,removed:0};};
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
      const seen=new Set(seenList()),batch=new Set(),fresh=[],done=[];
      for(const raw of r.drafts.slice(0,NATIVE_LIMITS.drafts)){
        const d=normalizeDraft(raw);if(!d)continue;
        if(d.keys.some(k=>seen.has(k))){if(d.id)done.push(d.id);continue;}
        if(d.keys.some(k=>batch.has(k)))continue;
        d.keys.forEach(k=>batch.add(k));fresh.push(d);
      }
      if(done.length)ack(done);
      fresh.sort((a,b)=>a.at-b.at);
      for(const d of fresh)d.twin=fresh.some(o=>o!==d&&o.kind===d.kind&&o.amount===d.amount&&Math.abs(o.at-d.at)<=300000);
      pending=fresh;return pending;
    },
    // 저장이 성공한 뒤(또는 사용자가 버린 뒤)에만 부른다: 이 기기에 처리됨으로 기억하고 다리에 알린다.
    markHandled(draft){
      if(!draft||!Array.isArray(draft.keys))return {ok:false};
      rememberSeen(draft.keys);pending=pending.filter(d=>d!==draft&&!d.keys.some(k=>draft.keys.includes(k)));
      return draft.id?ack([draft.id]):{ok:true,removed:0};
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
      const r=callNative(native,'upsertCalendarEvents',JSON.stringify({calendarId:chosen.id,events}));
      if(!r.ok||!Array.isArray(r.results))return {state:'FAILED',error:r.error||'BRIDGE_ERROR'};
      const count=a=>r.results.filter(x=>x?.action===a).length,done=r.results.filter(x=>x?.action==='CREATED'||x?.action==='UPDATED').map(x=>x.key).filter(k=>typeof k==='string');
      const keep=saved&&saved.calendarId===chosen.id?saved.keys:[];
      writeJson(store,NATIVE_KEYS.calendar,{calendarId:chosen.id,keys:[...new Set([...keep,...done])].slice(0,NATIVE_LIMITS.events)});
      return {state:'DONE',created:count('CREATED'),updated:count('UPDATED'),failed:count('FAILED'),calendarId:chosen.id};
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
export function payDraftBody({h,br,formatWon,onAdd,onDiscard,recurringName=null}){
  const body=h.el('div',null,'native-pay-list'),list=br.pending();
  if(!list.length)h.add(body,h.el('p',NATIVE_TEXT.empty,'muted'));
  for(const d of list){
    const cancel=d.kind==='CANCEL',head=h.el('strong',(cancel?'취소 · ':'')+formatWon(d.amount)),sub=h.el('span',(d.merchant||'가맹점 모름')+' · '+kstDateOf(d.at)+' '+kstTimeOf(d.at)+(d.last4?' · 카드 끝 '+d.last4:''),'muted small');
    const row=h.add(h.el('div',null,'native-pay-item'+(cancel?' cancel':'')),h.add(h.el('div',null,'native-pay-main'),head,sub));
    const rec=cancel||!recurringName?null:recurringName(d);
    if(rec)h.add(row,h.el('span','정기 결제: '+rec,'native-pay-recurring'));
    if(cancel)h.add(row,h.el('p',NATIVE_TEXT.cancel,'muted small'));
    if(d.twin)h.add(row,h.el('p',NATIVE_TEXT.twin,'muted small'));
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
