// 이 모듈과 hlt-rebase·hlt-projection·hlt-flow는 어떤 모듈도 불러오지 않는다(화면과 서버가 같은 파일을 쓰도록 브라우저에서도 그대로 동작).
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
// HLT 건강 모듈 모델 (MD03 앱 모듈, B3). 합성 데이터로만 시험한다. 엔티티 하나 저장 = 연산 하나(fin-model.mjs와 같은 방식).
// 엔티티: HLT_PROFILE(약·측정 또는 습관 정의, entityId=key), HLT_DAY(하루 1장 카드, entityId=날짜).
// 새 엔티티 종류를 받으면 옛 빌드는 HOLD한다(fin-model.mjs 머리 주석과 같음). 설계: AUTOPILOT\design\B1_MODULE_COMMON_DESIGN_R0.md §3.1·R1, tasks\B3_*.
// 날짜 기준은 Asia/Seoul 고정(UTC+9, 서머타임 없음). 기록 시각은 UTC(Z) ISO 문자열이다.

export const HLT_TYPES=Object.freeze(['HLT_PROFILE','HLT_DAY']);
// HLT_PROFILE 한도는 MED와 HABIT을 합친 60이다(B1 §3 표의 30은 60으로 정정, B3 R2).
export const HLT_LIMITS=Object.freeze({HLT_PROFILE:60,HLT_DAY:3700});
export const ITEM_TYPES=Object.freeze(['dose','sleep','wake','clarity','checkin','change','symptom','meal','habit','steps']);
export const UNITS=Object.freeze(['mg','mL','tablet','capsule']);
export const SLEEP_KINDS=Object.freeze(['main','nap']);
export const CHANGE_KINDS=Object.freeze(['depression','fatigue']);
export const SYMPTOM_KINDS=Object.freeze(['palpitations','sweating','other']);
export const MEAL_KINDS=Object.freeze(['BREAKFAST','LUNCH','DINNER','SNACK','LATE_NIGHT']);
export const MEAL_SIZES=Object.freeze(['LIGHT','NORMAL','HEAVY']);
export const PROFILE_KINDS=Object.freeze(['MED','HABIT']);
export const HABIT_MODES=Object.freeze(['CHECK','COUNT']);
export const MAX_ITEMS=120;
export const MAX_CARD_BYTES=16384;
export const MAX_NOTE=200;
export const MAX_LABEL=40;
export const MAX_SLEEP_MS=48*3600000;
export const MAX_AMOUNT=5000;
// B58B: 걸음은 카드당 1개(고정 id). 0은 실제 값이고, 자료 없음(null)은 항목을 만들지 않는다. 이 항목을 모르는 옛 빌드는 카드를 거부(HOLD)하므로 첫 확정 전에 모든 기기를 갱신한다.
export const MAX_STEPS=200000;
export const STEPS_ITEM_ID='hc-steps';
const KST_MS=9*3600000;
const DAY_MS=86400000;

const ID=/^[A-Za-z0-9_-]{1,40}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// id·key로 객체 특수 이름은 쓰지 않는다(화면·집계에서 맵 키로 쓰여도 안전하게).
const RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
export const hltIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
export const dateKeyOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
// 실제 달력 날짜만(2월 30일, 24시 등은 되돌려 쓰면 달라지므로 거부).
export const isoOK=v=>typeof v==='string'&&ISO.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const kstDate=iso=>new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);
// KST 하루 안의 분(0~1439).
export const kstMinutes=iso=>Math.floor((((Date.parse(iso)+KST_MS)%DAY_MS)+DAY_MS)%DAY_MS/60000);
export const dayNumber=date=>Math.round(Date.parse(date+'T12:00:00Z')/DAY_MS);
export const shiftDay=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);

function shape(v,keys,code='INVALID_HLT_SCHEMA'){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_HLT_TEXT');
}
const score=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=10;
const amountOK=v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=MAX_AMOUNT;
const bool=v=>typeof v==='boolean';

function validateProfile(id,d){
  requireValue(d&&typeof d==='object'&&PROFILE_KINDS.includes(d.kind),'INVALID_HLT_PROFILE_KIND');
  if(d.kind==='MED'){
    shape(d,['key','kind','label','defaultAmount','unit','enabled','private','removed']);
    requireValue(amountOK(d.defaultAmount)&&UNITS.includes(d.unit),'INVALID_HLT_PROFILE_FIELDS');
  }else{
    shape(d,['key','kind','label','mode','enabled','private','removed']);
    requireValue(HABIT_MODES.includes(d.mode),'INVALID_HLT_PROFILE_FIELDS');
  }
  requireValue(hltIdOK(d.key)&&d.key===id,'INVALID_HLT_PROFILE_KEY');
  text(d.label,MAX_LABEL,false);
  requireValue(bool(d.enabled)&&bool(d.private)&&bool(d.removed),'INVALID_HLT_PROFILE_FIELDS');
}

const ITEM_KEYS={
  dose:['id','type','profileKey','amount','unit','at'],
  sleep:['id','type','startAt','endAt','kind'],
  wake:['id','type','at'],
  clarity:['id','type','wakeId','at'],
  checkin:['id','type','at','mood','energy','focus','sleepiness'],
  change:['id','type','kind','intensity','at','endAt'],
  symptom:['id','type','kind','intensity','at'],
  meal:['id','type','at','kind','size'],
  habit:['id','type','profileKey','count','at'],
  steps:['id','type','count'],
};
// 카드 date의 앞뒤 1일 안(기록이 전날 밤~다음날 새벽에 걸칠 수 있음).
export function nearDate(date,iso){return Math.abs(dayNumber(kstDate(iso))-dayNumber(date))<=1;}
function validateItem(it,date){
  requireValue(it&&typeof it==='object'&&!Array.isArray(it)&&Object.getPrototypeOf(it)===Object.prototype&&ITEM_TYPES.includes(it.type),'INVALID_HLT_ITEM');
  shape(it,ITEM_KEYS[it.type],'INVALID_HLT_ITEM');
  requireValue(hltIdOK(it.id),'INVALID_HLT_ITEM_ID');
  const times=[];
  const t=(v,nullable=false)=>{if(nullable&&v===null)return;requireValue(isoOK(v),'INVALID_HLT_TIME');times.push(v);};
  switch(it.type){
    case 'dose':
      requireValue(hltIdOK(it.profileKey)&&amountOK(it.amount)&&UNITS.includes(it.unit),'INVALID_HLT_DOSE');t(it.at);break;
    case 'sleep':
      requireValue(SLEEP_KINDS.includes(it.kind),'INVALID_HLT_SLEEP');t(it.startAt);t(it.endAt,true);
      if(it.endAt!==null){const span=Date.parse(it.endAt)-Date.parse(it.startAt);requireValue(span>=0&&span<=MAX_SLEEP_MS,'INVALID_HLT_SLEEP_SPAN');}
      break;
    case 'wake':t(it.at);break;
    case 'clarity':requireValue(hltIdOK(it.wakeId),'INVALID_HLT_WAKE_LINK');t(it.at);break;
    case 'checkin':requireValue(['mood','energy','focus','sleepiness'].every(k=>score(it[k])),'INVALID_HLT_CHECKIN');t(it.at);break;
    case 'change':
      requireValue(CHANGE_KINDS.includes(it.kind)&&score(it.intensity),'INVALID_HLT_CHANGE');t(it.at);t(it.endAt,true);
      if(it.endAt!==null)requireValue(Date.parse(it.endAt)>=Date.parse(it.at),'INVALID_HLT_CHANGE_END');
      break;
    case 'symptom':requireValue(SYMPTOM_KINDS.includes(it.kind)&&score(it.intensity),'INVALID_HLT_SYMPTOM');t(it.at);break;
    case 'meal':requireValue(MEAL_KINDS.includes(it.kind)&&(it.size===null||MEAL_SIZES.includes(it.size)),'INVALID_HLT_MEAL');t(it.at);break;
    case 'habit':requireValue(hltIdOK(it.profileKey)&&typeof it.count==='number'&&Number.isInteger(it.count)&&it.count>=1&&it.count<=99,'INVALID_HLT_HABIT');t(it.at,true);break;
    case 'steps':requireValue(it.id===STEPS_ITEM_ID&&typeof it.count==='number'&&Number.isInteger(it.count)&&it.count>=0&&it.count<=MAX_STEPS,'INVALID_HLT_STEPS');break;
  }
  for(const v of times)requireValue(nearDate(date,v),'HLT_TIME_OUTSIDE_CARD_DATE');
}
export function cardBytes(d){return new TextEncoder().encode(JSON.stringify(d)).length;}
function validateDay(id,d){
  shape(d,d&&typeof d==='object'&&Object.hasOwn(d,'note')?['date','items','confirmCount','note']:['date','items','confirmCount']);
  requireValue(dateKeyOK(id)&&d.date===id,'INVALID_HLT_DATE');
  requireValue(typeof d.confirmCount==='number'&&Number.isInteger(d.confirmCount)&&d.confirmCount>=1&&d.confirmCount<=9999,'INVALID_HLT_CONFIRM_COUNT');
  if(Object.hasOwn(d,'note'))text(d.note,MAX_NOTE);
  requireValue(Array.isArray(d.items)&&d.items.length<=MAX_ITEMS,'HLT_ITEM_LIMIT');
  const ids=new Set(),wakes=new Set();let open=0;
  for(const it of d.items){
    validateItem(it,d.date);
    requireValue(!ids.has(it.id),'DUPLICATE_HLT_ITEM_ID');ids.add(it.id);
    if(it.type==='wake')wakes.add(it.id);
    if(it.type==='sleep'&&it.endAt===null)open++;
  }
  requireValue(open<=1,'HLT_OPEN_SLEEP_LIMIT');
  for(const it of d.items)if(it.type==='clarity')requireValue(wakes.has(it.wakeId),'BROKEN_HLT_WAKE_REFERENCE');
  requireValue(cardBytes(d)<=MAX_CARD_BYTES,'HLT_CARD_TOO_LARGE');
}
export function validateHltData(type,id,d){
  requireValue(HLT_TYPES.includes(type)&&hltIdOK(id),'INVALID_ENTITY_ID');
  if(type==='HLT_PROFILE')validateProfile(id,d);else validateDay(id,d);
}

const flatKey=o=>JSON.stringify(Object.entries(o).sort(([a],[b])=>a<b?-1:a>b?1:0));   // 항목은 평평한 객체(값은 문자열·숫자·null) — 키 순서와 상관없이 같은 내용이면 같은 문자열
const get=(ctx,type,id)=>ctx.entities.get('sd11:'+type.toLowerCase()+':'+id);
// 카드 확정 시점 검사: 참조 무결성(dose→MED, habit→HABIT, CHECK는 count=1), confirmCount, 프로필 불변 규칙, 개수 한도.
// 프로필 삭제 = removed:true(B3d). 이력에서 물리적으로 지울 수 없으므로 엔티티는 남고(개수 한도에도 계속 센다), 새·고친 항목이 가리킬 수 없을 뿐이다.
// 이미 확정된 카드의 항목(같은 id·같은 내용)은 프로필이 나중에 삭제·중단돼도 그대로 둔다.
export function hltTransition(v,old,ctx){
  const {entityType:type,entityId:id,data:d}=v;
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<HLT_LIMITS[type],'APP_ENTITY_LIMIT');
  if(type==='HLT_PROFILE'){
    if(old)requireValue(old.data.key===d.key&&old.data.kind===d.kind&&(old.data.mode??null)===(d.mode??null),'HLT_PROFILE_IMMUTABLE');
    else requireValue(d.removed===false,'HLT_PROFILE_NEW_REMOVED');
    return;
  }
  requireValue(d.confirmCount===(old?old.data.confirmCount+1:1),'HLT_CONFIRM_COUNT_MISMATCH');
  const before=new Map((old?.data.items??[]).map(x=>[x.id,flatKey(x)]));
  for(const it of d.items){
    if(it.type!=='dose'&&it.type!=='habit')continue;
    const p=get(ctx,'HLT_PROFILE',it.profileKey);
    requireValue(p,'UNKNOWN_HLT_PROFILE');
    if(it.type==='dose')requireValue(p.data.kind==='MED','HLT_DOSE_NEEDS_MED_PROFILE');
    else{requireValue(p.data.kind==='HABIT','HLT_HABIT_NEEDS_HABIT_PROFILE');requireValue(p.data.mode!=='CHECK'||it.count===1,'HLT_CHECK_COUNT_MUST_BE_ONE');}
    // 새로 넣거나 고친 항목만: 삭제되었거나 중단된 프로필은 가리킬 수 없다.
    if(before.get(it.id)!==flatKey(it)){requireValue(!p.data.removed,'HLT_PROFILE_REMOVED');requireValue(p.data.enabled,'HLT_PROFILE_DISABLED');}
  }
}
// 이력 화면·백업 요약 제목(항상 문자열). 비공개 프로필의 라벨은 제목에 쓰지 않는다.
export function hltTitle(v){
  const d=v.data;
  if(v.entityType==='HLT_PROFILE')return '건강 프로필 · '+(d.private?'비공개 항목':d.label)+(d.removed?' · 삭제됨':'');
  return '건강 기록 · '+d.date;
}
// 프로필을 두 기기가 고쳐 충돌(STALE_HEADS)하면 방금 저장하려던 값(mine)을 그대로 쓴다 — 합치는 규칙 없음(B3d, 비공개·삭제는 양방향 자유).
