// 이 모듈과 life-rebase·life-flow는 어떤 모듈도 불러오지 않는다(화면과 서버가 같은 파일을 쓰도록 브라우저에서도 그대로 동작).
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
// LIFE 습관·오늘 모델 (MD03 앱, B41). 합성 데이터로만 시험한다. 엔티티 하나 저장 = 연산 하나(hlt-model·fin-model과 같은 방식).
// 엔티티: HABIT_DEF(습관 정의, entityId=습관 id), LIFE_DAY(하루 1장, entityId=날짜), SUBJECT_DEF(과목, entityId=과목 id), EXAM_SCHEDULE(시험 일정, entityId='exams' 1개), PLAN_DAY(하루 계획, entityId=날짜, B43).
// 새 엔티티 종류를 받으면 옛 빌드는 HOLD한다(hlt-model.mjs 머리 주석과 같음). 설계: AUTOPILOT\design\LIFE_BRICK_REDESIGN_V3_20261104_V2.md §2, ADDENDUM A1·A2·A3·A4·A7.
// 기본 습관·과목·시험 일정(아래 DEFAULT_*)은 화면에 보이는 코드 상수일 뿐이며 앱이 스스로 저장하지 않는다. 소유자가 편집 화면에서 "저장"을 누를 때만 엔티티가 된다.
// 날짜 기준은 Asia/Seoul 고정(UTC+9, 서머타임 없음).

export const LIFE_TYPES=Object.freeze(['HABIT_DEF','LIFE_DAY','SUBJECT_DEF','EXAM_SCHEDULE','PLAN_DAY']);
export const LIFE_LIMITS=Object.freeze({HABIT_DEF:30,LIFE_DAY:3700,SUBJECT_DEF:20,EXAM_SCHEDULE:1,PLAN_DAY:3700});
export const HABIT_KINDS=Object.freeze(['TIME','CHECK','DURATION','COUNT','RECOVERY']);
export const HABIT_AREAS=Object.freeze(['BODY','HEAD','MONEY','HEART']);
export const TARGET_PERS=Object.freeze(['DAY','WEEK']);
export const DIFFICULTIES=Object.freeze(['AUTO',1,2,3,4]);
export const DAY_TYPES=Object.freeze(['NORMAL','DETOX','REST']);
export const EXAM_STATUSES=Object.freeze(['잠정','확정']);
export const EXAM_SCHEDULE_ID='exams';
export const MAX_NAME=20;
export const MAX_NOTE=200;
export const MAX_DAY_HABITS=60;
export const MAX_EXAMS=12;
export const MAX_CARD_BYTES=16384;
export const MAX_PLAN_BYTES=8192;
export const MAX_PLAN_ITEMS=20;
export const MAX_PLAN_TITLE=40;
export const MAX_PLAN_BRICKS=8;
export const PLAN_BLOCKS=Object.freeze(['M','A','E','N']);   // 오전·오후·저녁·밤
export const MAX_ORDER=999;
// 벽돌 1장 = 확인된 집중 30분, 10~29분 = 조각(ADDENDUM A2).
export const BRICK_MINUTES=30;
export const PIECE_MIN_MINUTES=10;
export const DEFAULT_DAILY_GOAL_BRICKS=2;   // 램프의 첫 주 목표(A7: 1주차 2장). 오늘 목표는 life-achieve가 계산한다
const KST_MS=9*3600000;
const DAY_MS=86400000;

const ID=/^[A-Za-z0-9_-]{1,40}$/;
const RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const lifeIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
export const dateKeyOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const kstDate=iso=>new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);
export const dayNumber=date=>Math.round(Date.parse(date+'T12:00:00Z')/DAY_MS);
export const shiftDay=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);
// 기록 시각 'HH:MM'(00:00~23:59). 목표 시각은 취침 24:00도 허용한다.
export const timeOK=v=>typeof v==='string'&&TIME.test(v);
export const targetTimeOK=v=>timeOK(v)||v==='24:00';
export const hhmmFromIso=iso=>{const m=Math.floor((((Date.parse(iso)+KST_MS)%DAY_MS)+DAY_MS)%DAY_MS/60000);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};

const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function shape(v,keys,code='INVALID_LIFE_SCHEMA'){
  requireValue(plain(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_LIFE_TEXT');
}
const bool=v=>typeof v==='boolean';
const int=(v,lo,hi)=>typeof v==='number'&&Number.isInteger(v)&&v>=lo&&v<=hi;
const nullInt=(v,lo,hi)=>v===null||int(v,lo,hi);

// ---- HABIT_DEF ----
function validateHabit(id,d){
  shape(d,['id','name','kind','target','difficulty','hidden','order','area'],'INVALID_HABIT_DEF');
  requireValue(lifeIdOK(d.id)&&d.id===id,'INVALID_HABIT_ID');
  text(d.name,MAX_NAME,false);
  requireValue(HABIT_KINDS.includes(d.kind)&&HABIT_AREAS.includes(d.area)&&DIFFICULTIES.includes(d.difficulty)&&bool(d.hidden)&&int(d.order,0,MAX_ORDER),'INVALID_HABIT_DEF');
  const t=d.target;shape(t,['time','minutes','count','per'],'INVALID_HABIT_TARGET');
  requireValue(TARGET_PERS.includes(t.per)&&(t.time===null||targetTimeOK(t.time))&&nullInt(t.minutes,1,1440)&&nullInt(t.count,1,99),'INVALID_HABIT_TARGET');
  // 종류에 속하지 않는 목표 칸은 비어 있어야 한다(저장 형식이 하나로 정해지게).
  requireValue((d.kind==='TIME'||t.time===null)&&(d.kind==='DURATION'||t.minutes===null)&&(d.kind==='COUNT'||t.count===null),'INVALID_HABIT_TARGET');
}

// ---- LIFE_DAY ----
function validateEntry(e){
  shape(e,['done','at','minutes','count'],'INVALID_LIFE_ENTRY');
  requireValue(bool(e.done)&&(e.at===null||timeOK(e.at))&&nullInt(e.minutes,0,1440)&&nullInt(e.count,0,99),'INVALID_LIFE_ENTRY');
  requireValue(e.done||(e.at===null&&e.minutes===null&&e.count===null),'INVALID_LIFE_ENTRY');
}
export function cardBytes(d){return new TextEncoder().encode(JSON.stringify(d)).length;}
function validateDay(id,d){
  shape(d,['date','habits','mood','note','dayType'],'INVALID_LIFE_DAY');
  requireValue(dateKeyOK(id)&&d.date===id,'INVALID_LIFE_DATE');
  requireValue(plain(d.habits),'INVALID_LIFE_DAY');
  const keys=Object.keys(d.habits);
  requireValue(keys.length<=MAX_DAY_HABITS,'LIFE_HABIT_LIMIT');
  for(const k of keys){requireValue(lifeIdOK(k),'INVALID_HABIT_ID');validateEntry(d.habits[k]);}
  requireValue(d.mood===null||int(d.mood,1,5),'INVALID_LIFE_MOOD');
  text(d.note,MAX_NOTE);
  requireValue(DAY_TYPES.includes(d.dayType),'INVALID_LIFE_DAY_TYPE');
  requireValue(cardBytes(d)<=MAX_CARD_BYTES,'LIFE_CARD_TOO_LARGE');
}

// ---- SUBJECT_DEF ----
function validateSubject(id,d){
  shape(d,['id','name','color','exam','bridge','hidden','order'],'INVALID_SUBJECT_DEF');
  requireValue(lifeIdOK(d.id)&&d.id===id,'INVALID_SUBJECT_ID');
  text(d.name,MAX_NAME,false);
  requireValue(typeof d.color==='string'&&/^#[0-9A-Fa-f]{6}$/.test(d.color)&&bool(d.exam)&&bool(d.bridge)&&bool(d.hidden)&&int(d.order,0,MAX_ORDER),'INVALID_SUBJECT_DEF');
}

// ---- EXAM_SCHEDULE ----
function validateExams(id,d){
  shape(d,['items'],'INVALID_EXAM_SCHEDULE');
  requireValue(id===EXAM_SCHEDULE_ID,'INVALID_EXAM_SCHEDULE_ID');
  requireValue(Array.isArray(d.items)&&d.items.length<=MAX_EXAMS,'EXAM_ITEM_LIMIT');
  const seen=new Set();
  for(const x of d.items){
    shape(x,['id','name','date','status'],'INVALID_EXAM_ITEM');
    requireValue(lifeIdOK(x.id)&&!seen.has(x.id)&&dateKeyOK(x.date)&&EXAM_STATUSES.includes(x.status),'INVALID_EXAM_ITEM');
    seen.add(x.id);text(x.name,MAX_NAME,false);
  }
}

// ---- PLAN_DAY (B43): 하루 계획. 계획 줄 id가 두 기기 합치기의 단위다. 벽돌은 0.5 단위(조각 = 반 장). ----
function validatePlanDay(id,d){
  shape(d,['date','items'],'INVALID_PLAN_DAY');
  requireValue(dateKeyOK(id)&&d.date===id,'INVALID_PLAN_DATE');
  requireValue(Array.isArray(d.items),'INVALID_PLAN_DAY');
  requireValue(d.items.length<=MAX_PLAN_ITEMS,'PLAN_ITEM_LIMIT');
  const seen=new Set();
  for(const x of d.items){
    shape(x,['id','subjectId','title','bricks','block'],'INVALID_PLAN_ITEM');
    requireValue(lifeIdOK(x.id)&&!seen.has(x.id)&&lifeIdOK(x.subjectId),'INVALID_PLAN_ITEM');
    seen.add(x.id);text(x.title,MAX_PLAN_TITLE,false);
    requireValue(typeof x.bricks==='number'&&Number.isFinite(x.bricks)&&x.bricks>=0.5&&x.bricks<=MAX_PLAN_BRICKS&&Number.isInteger(x.bricks*2),'INVALID_PLAN_BRICKS');
    requireValue(PLAN_BLOCKS.includes(x.block),'INVALID_PLAN_BLOCK');
  }
  requireValue(cardBytes(d)<=MAX_PLAN_BYTES,'PLAN_CARD_TOO_LARGE');
}

export function validateLifeData(type,id,d){
  requireValue(LIFE_TYPES.includes(type)&&lifeIdOK(id),'INVALID_ENTITY_ID');
  if(type==='HABIT_DEF')validateHabit(id,d);
  else if(type==='LIFE_DAY')validateDay(id,d);
  else if(type==='SUBJECT_DEF')validateSubject(id,d);
  else if(type==='PLAN_DAY')validatePlanDay(id,d);
  else validateExams(id,d);
}

// 확정 시점 검사: 개수 한도, 습관 종류 불변(종류를 바꾸면 지난 기록의 뜻이 달라진다).
// 삭제 경로는 없다. 숨김(hidden:true)으로 바꿀 뿐이라 지난 LIFE_DAY 기록은 그대로 남는다.
export function lifeTransition(v,old,ctx){
  const {entityType:type,data:d}=v;
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<LIFE_LIMITS[type],'APP_ENTITY_LIMIT');
  if(type==='HABIT_DEF'&&old)requireValue(old.data.kind===d.kind,'LIFE_HABIT_KIND_IMMUTABLE');
}
// 이력 화면·백업 요약 제목(항상 문자열).
export function lifeTitle(v){
  const d=v.data;
  if(v.entityType==='LIFE_DAY')return '오늘 카드 · '+d.date;
  if(v.entityType==='HABIT_DEF')return '습관 · '+d.name+(d.hidden?' · 숨김':'');
  if(v.entityType==='SUBJECT_DEF')return '과목 · '+d.name+(d.hidden?' · 숨김':'');
  if(v.entityType==='PLAN_DAY')return '하루 계획 · '+d.date;
  return '시험 일정';
}

// ---- 기본값(코드 상수, 저장하지 않음) ----
const habit=(id,name,kind,area,target={})=>Object.freeze({id,name,kind,target:Object.freeze({time:null,minutes:null,count:null,per:'DAY',...target}),difficulty:'AUTO',hidden:false,order:0,area});
export const DEFAULT_HABITS=Object.freeze([
  habit('hb-wake','기상','TIME','BODY',{time:'07:00'}),
  habit('hb-sun','일폭','DURATION','BODY',{minutes:15}),
  habit('hb-sleep','취침','TIME','BODY',{time:'24:00'}),
  habit('hb-breakfast','아침','TIME','BODY'),
  habit('hb-lunch','점심','TIME','BODY'),
  habit('hb-dinner','저녁','TIME','BODY'),
  habit('hb-nolate','야식X','CHECK','BODY'),
  habit('hb-workout','운동','COUNT','BODY',{count:3,per:'WEEK'}),
  habit('hb-in','등원','TIME','HEAD'),
  habit('hb-out','하원','TIME','HEAD'),
  habit('hb-release','해소','CHECK','HEART'),
  habit('hb-diary','일기','CHECK','HEART'),
  habit('hb-recovery','복구','RECOVERY','HEART'),
].map((h,i)=>Object.freeze({...h,order:i})));
// 습관 칸에 쓰는 보조 문구(기본 습관의 화면 설명). 이름을 바꿔도 id로 찾는다.
export const HABIT_HINTS=Object.freeze({'hb-sun':'일어나서 햇볕 쬔 시간','hb-in':'공부 시작','hb-out':'공부 마감','hb-recovery':'뉴에이지/산책','hb-nolate':'야식을 안 먹었으면 체크'});
export const SUBJECT_COLOR_KEYS=Object.freeze({'#8E6BC4':'kor','#A6714E':'math','#D9534F':'eng','#5BA66B':'hist','#D4B33C':'soc','#4F86C6':'sci','#3FA7A0':'bio'});
const subject=(id,name,color,exam,bridge,order)=>Object.freeze({id,name,color,exam,bridge,hidden:false,order});
export const DEFAULT_SUBJECTS=Object.freeze([
  subject('kor','국어','#8E6BC4',true,false,0),subject('math','수학','#A6714E',true,false,1),subject('eng','영어','#D9534F',true,false,2),
  subject('hist','한국사','#5BA66B',true,false,3),subject('soc','통합사회','#D4B33C',true,false,4),subject('sci','통합과학','#4F86C6',true,false,5),
  subject('bio','생물','#3FA7A0',false,true,6),
]);
export const DEFAULT_EXAMS=Object.freeze({items:Object.freeze([
  Object.freeze({id:'e-mock3',name:'3평',date:'2027-03-23',status:'잠정'}),
  Object.freeze({id:'e-mock6',name:'6평',date:'2027-06-03',status:'잠정'}),
  Object.freeze({id:'e-mock9',name:'하반기 모평(8월)',date:'2027-08-25',status:'잠정'}),
  Object.freeze({id:'e-csat',name:'수능',date:'2027-11-18',status:'잠정'}),
])});
export const emptyDay=date=>({date,habits:{},mood:null,note:'',dayType:'NORMAL'});

// ---- 계산(저장하지 않음) ----
// 한 세션의 벽돌: 30분마다 1장, 나머지가 10분 이상이면 조각 1개, 9분 이하는 0(ADDENDUM A2).
export function brickOf(minutes){
  requireValue(Number.isInteger(minutes)&&minutes>=0&&minutes<=1440,'INVALID_LIFE_MINUTES');
  const rem=minutes%BRICK_MINUTES;
  return {bricks:Math.floor(minutes/BRICK_MINUTES),pieces:rem>=PIECE_MIN_MINUTES?1:0};
}
// 세션 분 목록 → 벽돌 합({bricks,pieces,value}). value = 장 + 조각×0.5(탑에서 반 칸).
export function sumBricks(minutesList){
  let bricks=0,pieces=0;
  for(const m of minutesList){const b=brickOf(m);bricks+=b.bricks;pieces+=b.pieces;}
  return {bricks,pieces,value:bricks+pieces*0.5};
}
// 습관 하나의 오늘 값이 "완료"인가(칸의 색 결정).
export function entryDone(h,e){
  if(!e||!e.done)return false;
  if(h.kind==='TIME')return e.at!==null;
  if(h.kind==='DURATION')return e.minutes!==null&&e.minutes>0;
  if(h.kind==='COUNT')return e.count!==null&&e.count>0;
  return true;
}
export function dDay(today,date){return dayNumber(date)-dayNumber(today);}
// 오늘 이후(오늘 포함)의 가장 가까운 시험. 없으면 null.
export function nearestExam(exams,today){
  const list=(exams?.items??[]).filter(x=>x.date>=today).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.id<b.id?-1:1);
  return list.length?{...list[0],dDay:dDay(today,list[0].date)}:null;
}
// 습관·과목 목록 정리: 저장된 정의가 하나라도 있으면 저장본(숨김 포함), 없으면 코드 상수.
export const sortByOrder=list=>[...list].sort((a,b)=>a.order-b.order||(a.id<b.id?-1:a.id>b.id?1:0));
// 첫 저장은 줄마다 따로 써서 중간에 끊길 수 있다(H37-Q1). 저장본의 id·순서가 기본 목록의 앞부분과 정확히 같고 뒤가 빠졌으면 끊긴 첫 저장이다(삭제 길이 없어 소유자가 만들 수 없는 모양). 이때는 빠진 기본값을 함께 보여 준다.
export function cutFirstSave(stored,defaults){
  if(!stored.length||stored.length>=defaults.length)return false;   // 흔한 경우(저장 전·온전한 저장본)는 정렬하지 않는다
  return sortByOrder(stored).every((x,i)=>x.id===defaults[i].id&&x.order===i);
}
export function effectiveList(stored,defaults){
  if(!stored.length)return sortByOrder(defaults);
  if(!cutFirstSave(stored,defaults))return sortByOrder(stored);
  const have=new Set(stored.map(x=>x.id));
  return sortByOrder([...stored,...defaults.filter(d=>!have.has(d.id))]);
}
// 공부 모듈(STUDY_DAY) 세션과의 연결. STUDY 과목 코드는 6개로 고정이라(저장 형식 변경 금지) 새 과목은 가장 가까운 코드를 쓰고,
// 과목 id는 세션 id에 넣는다: lf_<과목id>_<난수>. 과목 id에는 밑줄이 없다(만들 때 막는다).
export const STUDY_CODE_BY_SUBJECT=Object.freeze({kor:'K',math:'M',eng:'E',hist:'H',soc:'S',sci:'C',bio:'C'});
export const studyCodeOf=subjectId=>STUDY_CODE_BY_SUBJECT[subjectId]??'C';
export const sessionIdFor=(subjectId,rand)=>('lf_'+subjectId+'_'+rand).slice(0,40);
// FIX41 (HUNT40 D6): 해시로 줄인 과목 자리(SUBJECT_HASH_MARK로 시작)는 과목 id가 아니므로 null이다(읽는 쪽은 옛 긴 과목 id처럼 과목 코드로 돌아간다).
const SUBJECT_HASH_MARK='--';
export function subjectOfSession(id){const m=/^lf_([A-Za-z0-9-]{1,30})_/.exec(id);return m&&!m[1].startsWith(SUBJECT_HASH_MARK)?m[1]:null;}
// FIX40 (HUNT35 H7): 타이머 세션 id = lf_<과목>_T<시작 ms 36진><접미>. 접미는 타이머를 시작할 때 uid에서 정한 짧은 무작위 글자다(두 기기가 같은 과목을 같은 ms에 시작해도 id가 겹치지 않게). 접미가 없는 옛 타이머는 옛 id 그대로다.
// FIX41 (HUNT40 D6, 통제탑): 40자에 안 들어가면(긴 과목 id) 시작 시각의 하위 자리(실제로 변하는 쪽)를 남긴다. 시각이 4자도 안 남으면(과목 28자 이상) 과목 쪽을 짧은 해시로 줄여 접미·시각 전체를 남긴다.
export const TIMER_TAG_LEN=4;
const TIMER_TIME_MIN=4;
export const timerTagFrom=uid=>String(uid??'').toLowerCase().replace(/[^0-9a-z]/g,'').slice(0,TIMER_TAG_LEN);
const shortSubject=id=>{let h=0x811c9dc5;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,0x01000193);}return SUBJECT_HASH_MARK+(h>>>0).toString(36);};   // FNV-1a
export function timerSessionId(subjectId,startIso,tag){
  const t=tag??'',ms=Date.parse(startIso).toString(36);
  if(!t)return sessionIdFor(subjectId,'T'+ms);   // 옛 타이머: 옛 잘림 그대로(이미 담은 옛 세션을 알아본다)
  const room=40-('lf_'+subjectId+'_T').length-t.length;
  return room>=TIMER_TIME_MIN?sessionIdFor(subjectId,'T'+ms.slice(-room)+t):sessionIdFor(shortSubject(subjectId),'T'+ms+t);
}

// wholeLifeView가 싣는 원자료: 엔티티 그대로(heads 포함). 하루 카드는 최신 날짜가 앞.
export function lifeRawView(entities){
  const habits=[],days=[],subjects=[],plans=[];let exams=null;
  for(const e of entities){
    const row={id:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null};
    if(e.entityType==='HABIT_DEF')habits.push(row);
    else if(e.entityType==='LIFE_DAY')days.push({date:e.entityId,...row});
    else if(e.entityType==='SUBJECT_DEF')subjects.push(row);
    else if(e.entityType==='EXAM_SCHEDULE')exams=row;
    else if(e.entityType==='PLAN_DAY')plans.push({date:e.entityId,...row});
  }
  days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  plans.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  habits.sort((a,b)=>a.data.order-b.data.order||(a.id<b.id?-1:1));
  subjects.sort((a,b)=>a.data.order-b.data.order||(a.id<b.id?-1:1));
  return {habits,days,subjects,exams,plans};
}
export const EMPTY_LIFE_VIEW=Object.freeze({habits:[],days:[],subjects:[],exams:null,plans:[]});

// 화면이 쓰는 유효 정의: 저장된 정의가 있으면 저장본(숨김 포함), 없으면 코드 상수. usingDefaults = 아직 저장 전인 종류(끊긴 첫 저장 포함).
export function lifeDefs(life){
  const v=life??EMPTY_LIFE_VIEW,habits=v.habits.map(x=>x.data),subjects=v.subjects.map(x=>x.data);
  return {
    habits:effectiveList(habits,DEFAULT_HABITS),
    subjects:effectiveList(subjects,DEFAULT_SUBJECTS),
    exams:v.exams?v.exams.data:DEFAULT_EXAMS,
    usingDefaults:{habits:!habits.length||cutFirstSave(habits,DEFAULT_HABITS),subjects:!subjects.length||cutFirstSave(subjects,DEFAULT_SUBJECTS),exams:!v.exams},
  };
}
// COUNT 습관의 이번 주(월~일) 합계. days = 쌓은 카드 목록([{date,data}]), todayCard = 오늘 화면의 카드(임시 입력 포함, 있으면 오늘 값으로 쓴다. 없으면 쌓은 오늘 카드를 센다).
export function weekCount(habitId,today,days,todayCard){
  const wd=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7,monday=shiftDay(today,-wd);
  let sum=0;
  for(const d of days)if(d.date>=monday&&(d.date<today||!todayCard&&d.date===today)&&Object.hasOwn(d.data.habits,habitId))sum+=d.data.habits[habitId].count??0;
  const t=todayCard&&Object.hasOwn(todayCard.habits,habitId)?todayCard.habits[habitId].count??0:0;
  return sum+t;
}
