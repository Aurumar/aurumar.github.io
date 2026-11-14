// 이 모듈과 life-rebase·life-flow는 어떤 모듈도 불러오지 않는다(화면과 서버가 같은 파일을 쓰도록 브라우저에서도 그대로 동작).
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
// LIFE 습관·오늘 모델 (MD03 앱, B41). 합성 데이터로만 시험한다. 엔티티 하나 저장 = 연산 하나(hlt-model·fin-model과 같은 방식).
// 엔티티: HABIT_DEF(습관 정의, entityId=습관 id), LIFE_DAY(하루 1장, entityId=날짜), SUBJECT_DEF(과목, entityId=과목 id), EXAM_SCHEDULE(시험 일정, entityId='exams' 1개), PLAN_DAY(하루 계획, entityId=날짜, B43),
// PLAN_GOAL(과목 주간 목표, entityId=그 주 월요일), EXAM_RESULT(모의고사 결과, entityId=시험 id 또는 'x'+응시일), GAME_PROFILE(칭호, entityId='profile' 1개) (D46 2절).
// DIARY_DAY(하루 일기, entityId=날짜), WEEK_REVIEW(주간 리뷰, entityId=그 주 월요일) (D49 4절, 기분 칸은 없다: 기분은 오늘 카드 값 그대로). 글은 이력 화면·이력 제목·알림·비서 내보내기에 내보내지 않는다.
// 새 엔티티 종류를 받으면 옛 빌드는 HOLD한다(hlt-model.mjs 머리 주석과 같음). 설계: AUTOPILOT\design\LIFE_BRICK_REDESIGN_V3_20261104_V2.md §2, ADDENDUM A1·A2·A3·A4·A7.
// 새 기록 3종의 검사는 시계·다른 기록을 보지 않는다(앱을 열 때마다 전체 이력을 재생하므로 오늘 날짜에 기댄 규칙은 지난 기록을 거절할 수 있다, D46 2절). 넓히기만 할 수 있으므로 처음을 좁게 잡는다.
// 기본 습관·과목·시험 일정(아래 DEFAULT_*)은 화면에 보이는 코드 상수일 뿐이며 앱이 스스로 저장하지 않는다. 소유자가 편집 화면에서 "저장"을 누를 때만 엔티티가 된다.
// 날짜 기준은 Asia/Seoul 고정(UTC+9, 서머타임 없음).

export const LIFE_TYPES=Object.freeze(['HABIT_DEF','LIFE_DAY','SUBJECT_DEF','EXAM_SCHEDULE','PLAN_DAY','PLAN_GOAL','EXAM_RESULT','GAME_PROFILE','DIARY_DAY','WEEK_REVIEW']);
export const LIFE_LIMITS=Object.freeze({HABIT_DEF:30,LIFE_DAY:3700,SUBJECT_DEF:20,EXAM_SCHEDULE:1,PLAN_DAY:3700,PLAN_GOAL:600,EXAM_RESULT:120,GAME_PROFILE:1,DIARY_DAY:3700,WEEK_REVIEW:600});
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
export const MAX_GOAL_ITEMS=20;
export const MAX_GOAL_BRICKS=120;
export const MAX_GOAL_BYTES=2048;
export const MAX_SCORE_ITEMS=20;
export const MAX_RESULT_BYTES=4096;
export const GAME_PROFILE_ID='profile';
export const MAX_DIARY_TEXT=2000;
export const MAX_DIARY_TOMORROW=40;
export const MAX_DIARY_GOOD=3;
export const MAX_DIARY_BAD=2;
export const MAX_DIARY_BYTES=8192;
export const MAX_REVIEW_PICK=120;
export const MAX_REVIEW_NEXT=40;
// 지금 고를 수 있는 칩 id(저장은 id만, 화면 글자는 일기 화면이 맡는다). 검사기는 이 목록이 아니라 모양만 본다: 칩을 더해도 4기기 같은 날 배포가 필요 없다(D49 4.2).
export const DIARY_GOOD_CHIPS=Object.freeze(['focus','wrong','hard','start','calm','rest','people','body','thanks']);
export const DIARY_BAD_CHIPS=Object.freeze(['delay','phone','drift','overplan','tired','upset','conflict','spend']);
// 벽돌 1장 = 확인된 집중 30분, 10~29분 = 조각(ADDENDUM A2).
export const BRICK_MINUTES=30;
export const PIECE_MIN_MINUTES=10;
export const DEFAULT_DAILY_GOAL_BRICKS=2;   // 램프의 첫 주 목표(A7: 1주차 2장). 오늘 목표는 life-achieve가 계산한다
const KST_MS=9*3600000;
const DAY_MS=86400000;

const ID=/^[A-Za-z0-9_-]{1,40}$/;
const RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CHIP_ID=/^[a-z][a-z0-9-]{0,19}$/;
export const lifeIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
export const dateKeyOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const kstDate=iso=>new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);
export const dayNumber=date=>Math.round(Date.parse(date+'T12:00:00Z')/DAY_MS);
export const shiftDay=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);
// FIX50A (HUNT49 C1·A2): 일기 날짜(D49 3장)는 04:00(KST) 경계다. 00:00~03:59에는 어제 일기 날이 아직 열려 있다. 일기 날짜가 필요한 곳은 모두 이 함수를 쓴다.
// 하루 카드·공부·보상 엔진의 "오늘"(kstDate, 00:00 경계)은 그대로다.
export const DIARY_DAY_START_HOUR=4;
export const diaryOpenDate=iso=>{const t=Date.parse(iso)+KST_MS,today=new Date(t).toISOString().slice(0,10);return new Date(t).getUTCHours()<DIARY_DAY_START_HOUR?shiftDay(today,-1):today;};
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
// FIX68 (HUNT65 F2, 통제탑): 그날 기준(basis, 선택 칸) = 그 카드를 쌓을 때의 습관 목록. habits = 습관 벽돌 분모(고정한 매일 습관), actions = 켜 둔 기본 행동,
// core = 완벽한 날·연속 50%·일간 퀘스트 분모(보이는 매일 습관, 고정 여부 무관). 칸 추가만(옛 칸 뜻 그대로), 없으면 예전 모양.
export const MAX_BASIS_IDS=60;
function validateBasis(b){
  shape(b,['habits','actions','core'],'INVALID_LIFE_BASIS');
  for(const list of [b.habits,b.actions,b.core])requireValue(Array.isArray(list)&&list.length<=MAX_BASIS_IDS&&list.every(lifeIdOK)&&new Set(list).size===list.length,'INVALID_LIFE_BASIS');
}
function validateDay(id,d){
  shape(d,['date','habits','mood','note','dayType',...(plain(d)&&Object.hasOwn(d,'basis')?['basis']:[])],'INVALID_LIFE_DAY');
  if(Object.hasOwn(d,'basis'))validateBasis(d.basis);
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

// ---- PLAN_GOAL (D46 2.1): 과목 주간 목표. 저장 단위는 장 하나이고, 과목이 두 기기 합치기의 단위다. ----
function validatePlanGoal(id,d){
  shape(d,['monday','goals'],'INVALID_PLAN_GOAL');
  requireValue(dateKeyOK(id)&&d.monday===id&&new Date(id+'T12:00:00Z').getUTCDay()===1,'INVALID_GOAL_WEEK');
  requireValue(Array.isArray(d.goals),'INVALID_PLAN_GOAL');
  requireValue(d.goals.length<=MAX_GOAL_ITEMS,'GOAL_ITEM_LIMIT');
  const seen=new Set();
  for(const x of d.goals){
    shape(x,['subjectId','bricks'],'INVALID_GOAL_ITEM');
    requireValue(lifeIdOK(x.subjectId)&&!seen.has(x.subjectId),'INVALID_GOAL_ITEM');
    seen.add(x.subjectId);
    requireValue(typeof x.bricks==='number'&&Number.isFinite(x.bricks)&&x.bricks>=0.5&&x.bricks<=MAX_GOAL_BRICKS&&Number.isInteger(x.bricks*2),'INVALID_GOAL_BRICKS');
  }
  requireValue(cardBytes(d)<=MAX_GOAL_BYTES,'PLAN_GOAL_TOO_LARGE');
}

// ---- EXAM_RESULT (D46 2.2): 시험 하나에 1건. 일정 밖 시험은 examId:null, entityId='x'+응시일. 메모·시험 이름 칸은 없다. ----
function validateExamResult(id,d){
  shape(d,['examId','takenOn','scores'],'INVALID_EXAM_RESULT');
  requireValue(d.examId===null?id==='x'+d.takenOn:lifeIdOK(d.examId)&&id===d.examId,'INVALID_EXAM_RESULT');
  requireValue(dateKeyOK(d.takenOn),'INVALID_EXAM_RESULT_DATE');
  requireValue(Array.isArray(d.scores),'INVALID_EXAM_RESULT');
  requireValue(d.scores.length<=MAX_SCORE_ITEMS,'EXAM_SCORE_LIMIT');
  const seen=new Set();
  for(const x of d.scores){
    shape(x,['subjectId','raw','std','pct','grade'],'INVALID_EXAM_SCORE');
    requireValue(lifeIdOK(x.subjectId)&&!seen.has(x.subjectId),'INVALID_EXAM_SCORE');
    seen.add(x.subjectId);
    requireValue(nullInt(x.raw,0,100)&&nullInt(x.std,0,200)&&nullInt(x.pct,0,100)&&nullInt(x.grade,1,9),'INVALID_EXAM_SCORE');
    requireValue(x.raw!==null||x.std!==null||x.pct!==null||x.grade!==null,'INVALID_EXAM_SCORE');   // 줄마다 값 하나 이상
  }
  requireValue(cardBytes(d)<=MAX_RESULT_BYTES,'EXAM_RESULT_TOO_LARGE');
}

// ---- GAME_PROFILE (D46 2.5): 고른 칭호 1칸. 칭호 목록은 코드 상수라 참조를 확인하지 않는다(표시할 때 풀린 칭호가 아니면 자동으로 돌아간다). ----
function validateGameProfile(id,d){
  shape(d,['titleId'],'INVALID_GAME_PROFILE');
  requireValue(id===GAME_PROFILE_ID,'INVALID_GAME_PROFILE_ID');
  requireValue(d.titleId===null||lifeIdOK(d.titleId),'INVALID_GAME_PROFILE');
}

// ---- DIARY_DAY (D49 4.2): 하루 1건. 값이 하나도 없는 일기도 받는다: 지우는 길이 없어 "비운 내용을 저장"이 지우기다. 빈 기록을 새로 만들지 않는 것과 "점수 필수"는 저장 화면이 맡는다. ----
function validateChips(list,max){
  requireValue(Array.isArray(list)&&list.length<=max,'INVALID_DIARY_CHIP');
  const seen=new Set();
  for(const x of list){
    requireValue(typeof x==='string'&&CHIP_ID.test(x)&&!seen.has(x),'INVALID_DIARY_CHIP');
    seen.add(x);
  }
}
function validateDiary(id,d){
  shape(d,['date','score','energy','good','bad','tomorrow','text'],'INVALID_DIARY_DAY');
  requireValue(dateKeyOK(id)&&d.date===id,'INVALID_DIARY_DATE');
  requireValue(nullInt(d.score,1,5)&&nullInt(d.energy,1,5),'INVALID_DIARY_SCORE');
  validateChips(d.good,MAX_DIARY_GOOD);validateChips(d.bad,MAX_DIARY_BAD);
  for(const [v,max] of [[d.tomorrow,MAX_DIARY_TOMORROW],[d.text,MAX_DIARY_TEXT]])requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max,'INVALID_DIARY_TEXT');
  requireValue(cardBytes(d)<=MAX_DIARY_BYTES,'DIARY_TOO_LARGE');
}

// ---- WEEK_REVIEW (D49 4.2): 주 1건. 고른 문장은 일기를 가리키지 않고 복사한다(일기를 고쳐도 깨지지 않게). 칸 길이만으로 약 1KB라 크기 코드는 두지 않는다. ----
function validateWeekReview(id,d){
  shape(d,['monday','pick','next'],'INVALID_WEEK_REVIEW');
  requireValue(dateKeyOK(id)&&d.monday===id&&new Date(id+'T12:00:00Z').getUTCDay()===1,'INVALID_REVIEW_WEEK');
  if(d.pick!==null){
    shape(d.pick,['date','text'],'INVALID_REVIEW_PICK');
    const t=d.pick.text;
    requireValue(dateKeyOK(d.pick.date)&&typeof t==='string'&&t.isWellFormed()&&t.trim().length>0&&[...t].length<=MAX_REVIEW_PICK,'INVALID_REVIEW_PICK');
  }
  text(d.next,MAX_REVIEW_NEXT);
}

export function validateLifeData(type,id,d){
  requireValue(LIFE_TYPES.includes(type)&&lifeIdOK(id),'INVALID_ENTITY_ID');
  if(type==='HABIT_DEF')validateHabit(id,d);
  else if(type==='LIFE_DAY')validateDay(id,d);
  else if(type==='SUBJECT_DEF')validateSubject(id,d);
  else if(type==='PLAN_DAY')validatePlanDay(id,d);
  else if(type==='PLAN_GOAL')validatePlanGoal(id,d);
  else if(type==='EXAM_RESULT')validateExamResult(id,d);
  else if(type==='GAME_PROFILE')validateGameProfile(id,d);
  else if(type==='DIARY_DAY')validateDiary(id,d);
  else if(type==='WEEK_REVIEW')validateWeekReview(id,d);
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
  if(v.entityType==='PLAN_GOAL')return '주간 목표 · '+d.monday;
  if(v.entityType==='EXAM_RESULT')return '모의고사 결과 · '+d.takenOn;   // 이력 제목에 점수를 넣지 않는다
  if(v.entityType==='GAME_PROFILE')return '칭호';
  if(v.entityType==='DIARY_DAY')return '일기 · '+d.date;   // 이력 제목에 글·점수를 넣지 않는다
  if(v.entityType==='WEEK_REVIEW')return '주간 리뷰 · '+d.monday;
  return '시험 일정';
}
// 이력 줄(wholeHistory)의 값(D49 4.4): 일기·리뷰의 글은 글자 수만 남긴 사본으로 바꾼다. 이력 화면의 "저장된 값" 칸과 이력 API가 이 값을 쓴다. 원본은 그대로이고 다른 종류는 받은 값 그대로다.
const charCount=s=>[...String(s??'')].length;
export function lifeHistoryValue(v){
  const d=v?.data;
  if(v?.entityType==='DIARY_DAY')return {...v,data:{date:d.date,score:d.score,energy:d.energy,good:d.good,bad:d.bad,tomorrowChars:charCount(d.tomorrow),textChars:charCount(d.text)}};
  if(v?.entityType==='WEEK_REVIEW')return {...v,data:{monday:d.monday,pickChars:d.pick?charCount(d.pick.text):null,nextChars:charCount(d.next)}};
  return v;
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
// 색 → 칩 CSS 클래스 키. styles.css 토큰(--lb-subj-*, ui-kit SUBJECT_COLORS)과 값이 같은 색만 클래스로 그리고, 나머지 색은 SVG fill 점으로 그린다.
// 과목 기본색표가 아니다(DS2: 영어 기본색 주황은 토큰에 없어 점으로 그린다). 빨강 #D9534F는 eng 토큰 색과 같아서 그 클래스를 그대로 쓴다.
export const SUBJECT_COLOR_KEYS=Object.freeze({'#8E6BC4':'kor','#A6714E':'math','#D9534F':'eng','#5BA66B':'hist','#EBC84E':'soc','#4F86C6':'sci','#3FA7A0':'bio'});   // V7C: 노랑 #D4B33C → #EBC84E
// DS2 (V5 2.4, 소유자 결정 2026-11-08): 과목 색 설정의 12색 팔레트. 저장은 기존 SUBJECT_DEF.color 칸(새 칸·새 종류 없음).
export const SUBJECT_PALETTE=Object.freeze([
  ['보라','#8E6BC4'],['남색','#4F5FA6'],['파랑','#4F86C6'],['청록','#3FA7A0'],['초록','#5BA66B'],['올리브','#8A9A3C'],
  ['노랑','#EBC84E'],['주황','#D9823B'],['빨강','#D9534F'],['분홍','#C96C9A'],['갈색','#A6714E'],['회청','#6E7F8E'],
].map(([name,hex])=>Object.freeze({name,hex})));
export const NEW_SUBJECT_COLOR='#E3BE4C';   // V7C: 황토 #C9A227 → 밝은 금. 편집 화면에서 새로 만든 과목의 첫 색(기본값이 없는 과목의 "기본값으로")
const subject=(id,name,color,exam,bridge,order)=>Object.freeze({id,name,color,exam,bridge,hidden:false,order});
export const DEFAULT_SUBJECTS=Object.freeze([
  subject('kor','국어','#8E6BC4',true,false,0),subject('math','수학','#A6714E',true,false,1),subject('eng','영어','#D9823B',true,false,2),
  subject('hist','한국사','#5BA66B',true,false,3),subject('soc','통합사회','#EBC84E',true,false,4),subject('sci','통합과학','#4F86C6',true,false,5),
  subject('bio','생물','#3FA7A0',false,true,6),
]);
export const DEFAULT_SUBJECT_COLORS=Object.freeze(Object.fromEntries(DEFAULT_SUBJECTS.map(s=>[s.id,s.color])));
const HEX6=/^#[0-9A-F]{6}$/;
// 과목 색 하나를 읽는 곳(DS2). subjects = 유효 정의(lifeDefs(life).subjects): 저장된 SUBJECT_DEF.color가 있으면 그 값, 없으면 기본색, 모르는 과목은 새 과목 색.
export function subjectColor(id,subjects=DEFAULT_SUBJECTS){
  const c=String(subjects.find(x=>x.id===id)?.color??'').toUpperCase();
  return HEX6.test(c)?c:DEFAULT_SUBJECT_COLORS[id]??NEW_SUBJECT_COLOR;
}
export const defaultSubjectColor=id=>DEFAULT_SUBJECT_COLORS[id]??NEW_SUBJECT_COLOR;
// "직접 입력" 값 검사: #RRGGBB 또는 RRGGBB(대소문자 무관) → '#RRGGBB'(대문자). 그 밖의 값은 null(저장 거부).
export function parseSubjectHex(text){
  const t=typeof text==='string'?text.trim():'';
  return /^#?[0-9A-Fa-f]{6}$/.test(t)?('#'+t.replace(/^#/,'')).toUpperCase():null;
}
// 두 색이 같거나 아주 가까운가(RGB 거리 < 40). 팔레트 12색끼리는 모두 이보다 멀다(시험 ds2). 안내만 하고 막지 않는다.
export const SUBJECT_COLOR_NEAR=40;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function colorsNear(a,b){
  const x=parseSubjectHex(a),y=parseSubjectHex(b);if(!x||!y)return false;
  const p=rgb(x),q=rgb(y);return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<SUBJECT_COLOR_NEAR;
}
// 숨기지 않은 과목 중 색이 같거나 아주 가까운 쌍 [[이름, 이름], …](목록 순서대로).
export function nearSubjectPairs(subjects){
  const list=subjects.filter(s=>!s.hidden),out=[];
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(colorsNear(list[i].color,list[j].color))out.push([list[i].name,list[j].name]);
  return out;
}
export const DEFAULT_EXAMS=Object.freeze({items:Object.freeze([
  Object.freeze({id:'e-mock3',name:'3평',date:'2027-03-23',status:'잠정'}),
  Object.freeze({id:'e-mock6',name:'6평',date:'2027-06-03',status:'잠정'}),
  Object.freeze({id:'e-mock9',name:'하반기 모평(8월)',date:'2027-08-25',status:'잠정'}),
  Object.freeze({id:'e-csat',name:'수능',date:'2027-11-18',status:'확정'}),   // V8W2-4: 2028학년도 수능 = 2027-11-18(목) 확정(교육부 2025-06-02 발표)
])});
// V8W2-4: 공식 발표로 확정된 수능 날짜. 저장된 일정이 아직 '잠정'이어도 화면 표시만 '확정'으로 읽는다(기록은 고치지 않는다, 편집 시트는 저장값 그대로).
export const CSAT_CONFIRMED_DATES=Object.freeze(['2027-11-18']);
export const examStatusOf=x=>x?.status==='잠정'&&(x.id==='e-csat'||x.name==='수능')&&CSAT_CONFIRMED_DATES.includes(x.date)?'확정':x?.status;
export const emptyDay=date=>({date,habits:{},mood:null,note:'',dayType:'NORMAL'});
export const emptyDiary=date=>({date,score:null,energy:null,good:[],bad:[],tomorrow:'',text:''});
export const emptyWeekReview=monday=>({monday,pick:null,next:''});
// V7D2 (설계 V7D 4.1 안 A0): "이 기록 비우기" = 기존 스키마의 빈 값으로 덮어쓰기. 새 칸·새 종류·지움 표시 없음(옛 빌드도 받는다). 1건 = 연산 1.
// LIFE_DAY는 기준(basis) 칸 없이 가장 옛 모양으로 쓴다. EXAM_RESULT는 검사기가 빈 scores를 받으므로(validateExamResult) 시험 id·응시일은 그대로 두고 점수만 비운다.
export const LIFE_CLEAR_TYPES=Object.freeze(['LIFE_DAY','PLAN_DAY','PLAN_GOAL','DIARY_DAY','WEEK_REVIEW','EXAM_RESULT']);
export function emptyLifeRecord(type,id,data){
  if(type==='LIFE_DAY')return emptyDay(id);
  if(type==='PLAN_DAY')return {date:id,items:[]};
  if(type==='PLAN_GOAL')return {monday:id,goals:[]};
  if(type==='DIARY_DAY')return emptyDiary(id);
  if(type==='WEEK_REVIEW')return emptyWeekReview(id);
  if(type==='EXAM_RESULT')return {examId:data.examId,takenOn:data.takenOn,scores:[]};
  requireValue(false,'CLEAR_TYPE_UNSUPPORTED');
}
// 이미 빈 값인가(비울 것이 없음). 모르는 종류는 거짓.
export function lifeRecordEmpty(type,d){
  if(!plain(d))return false;
  if(type==='LIFE_DAY')return plain(d.habits)&&!Object.keys(d.habits).length&&d.mood===null&&d.note===''&&d.dayType==='NORMAL';
  if(type==='PLAN_DAY')return Array.isArray(d.items)&&!d.items.length;
  if(type==='PLAN_GOAL')return Array.isArray(d.goals)&&!d.goals.length;
  if(type==='DIARY_DAY')return d.score===null&&d.energy===null&&!d.good?.length&&!d.bad?.length&&d.tomorrow===''&&d.text==='';
  if(type==='WEEK_REVIEW')return d.pick===null&&d.next==='';
  if(type==='EXAM_RESULT')return Array.isArray(d.scores)&&!d.scores.length;
  return false;
}
// 비우기 화면이 쓰는 종류별 정보(종류 이름·쌓인 기록 찾기·요약·새 시작 판정 날짜). 요약에는 내용 글을 넣지 않는다(개수·글자 수만).
export const LIFE_CLEAR_KIND=Object.freeze({LIFE_DAY:'오늘 카드',PLAN_DAY:'하루 계획',PLAN_GOAL:'과목 주간 목표',DIARY_DAY:'일기',WEEK_REVIEW:'주간 리뷰',EXAM_RESULT:'모의고사 결과'});
const CLEAR_LIST=Object.freeze({LIFE_DAY:['days','date'],PLAN_DAY:['plans','date'],PLAN_GOAL:['goals','monday'],DIARY_DAY:['diaries','date'],WEEK_REVIEW:['weekReviews','monday'],EXAM_RESULT:['results','id']});
export function lifeRecordOf(life,type,id){
  const [list,key]=CLEAR_LIST[type]??[];if(!list)return null;
  return (Array.isArray(life?.[list])?life[list]:[]).find(x=>x[key]===id)??null;
}
export function lifeRecordSummary(type,d){
  const n=a=>Array.isArray(a)?a.length:0,chars=s=>[...String(s??'')].length;
  if(type==='LIFE_DAY')return '습관 '+Object.keys(d.habits??{}).length+'칸'+(d.mood!==null?' · 기분':'')+(d.note?' · 한 줄':'');
  if(type==='PLAN_DAY')return '계획 '+n(d.items)+'줄';
  if(type==='PLAN_GOAL')return '목표 '+n(d.goals)+'개';
  if(type==='DIARY_DAY')return '일기'+(d.score!==null?' · 점수':'')+' · 글 '+chars(d.text)+'자';
  if(type==='WEEK_REVIEW')return '고른 문장 '+(d.pick?1:0)+' · 다음 주 한 가지 '+chars(d.next)+'자';
  if(type==='EXAM_RESULT')return '과목 '+n(d.scores)+'개';
  return '';
}
// 보이는 날짜(모의고사 = 본 날)와 새 시작 판정 날짜(V7D1 fresh-start FRESH_DATE_RULE과 같음: 주 기록 = 그 주 일요일).
export const lifeClearDate=(type,id,d)=>type==='EXAM_RESULT'?d?.takenOn??null:id;
export const lifeClearCheckDate=(type,id,d)=>(type==='PLAN_GOAL'||type==='WEEK_REVIEW')&&dateKeyOK(id)?shiftDay(id,6):lifeClearDate(type,id,d);

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
// V6B: 오늘 탭 고정. 저장 칸을 더하지 않고 기존 order 칸의 구간으로 나타낸다: order < HABIT_UNPIN_ORDER = 고정(오늘 탭), 그 이상 = "더 보기".
// 옛 빌드는 order를 정렬에만 쓰므로 고정 안 한 습관이 목록 끝에 보일 뿐이다(뜻 변경·거절 없음). 기본 습관 13개는 0~12라 모두 고정이다.
export const HABIT_UNPIN_ORDER=500;
export const habitPinned=h=>Number.isInteger(h?.order)&&h.order<HABIT_UNPIN_ORDER;
// V6B 성취표 칸 4상태: done(완료, 금 채움) · part(일부, 반 채움) · miss(못함, 음각) · none(기록 없음, 빈칸 — 못함으로 세지 않는다).
// 못함 = 그날 카드에 done:false로 남긴 줄(기존 칸 그대로, 값 칸은 모두 null). 일부 = 분·횟수 목표가 있는데 못 미친 완료.
export function habitState(h,e){
  if(!e)return 'none';
  if(!e.done)return 'miss';
  if(!entryDone(h,e))return 'none';
  if(h.kind==='DURATION'&&h.target.minutes!==null&&e.minutes<h.target.minutes)return 'part';
  if(h.kind==='COUNT'&&h.target.per==='DAY'&&h.target.count!==null&&e.count<h.target.count)return 'part';
  return 'done';
}
export const MISSED_ENTRY=Object.freeze({done:false,at:null,minutes:null,count:null});
// V6B 습관 벽돌·기본 행동 경험치를 세는 첫 날. FIX68: 이 날부터의 카드에 쌓을 때의 기준(basis)을 함께 적는다.
export const HABIT_EPOCH='2026-11-09';
// FIX68 (HUNT65 F2): 지금 목록으로 정한 습관 벽돌 기준. 습관 = 보이는·고정·매일(복구 종류·주 단위 목표 제외), 행동 = 켜 둔 기본 행동(life.actionDefs, 앱이 붙여 준다).
export function habitBasis(life){
  const core=lifeDefs(life).habits.filter(h=>!h.hidden&&h.kind!=='RECOVERY'&&h.target.per!=='WEEK'),ids=list=>[...new Set(list)].sort().slice(0,MAX_BASIS_IDS);
  const actions=(life?.actionDefs??[]).filter(a=>a?.active&&lifeIdOK(a.actionId)).map(a=>a.actionId);
  return {habits:ids(core.filter(habitPinned).map(h=>h.id)),actions:ids(actions),core:ids(core.map(h=>h.id))};
}
// 그 날의 기준: 카드에 적힌 기준 → 이 기기에서 먼저 정해 둔 옛 날 기준(life.basisFrozen, 앱이 붙여 준다) → 지금 목록. HABIT_EPOCH 전 날은 null(기준을 적지 않는다).
export function habitBasisFor(life,date,card=null){
  if(!dateKeyOK(date)||date<HABIT_EPOCH)return null;
  return card?.basis??life?.basisFrozen?.[date]??habitBasis(life);
}
// FIX68 (HUNT65 F2, 통제탑 "옛 자료는 지금 규칙으로 계산하되 한 번 정해지면 다시 바뀌지 않게"): 기준이 적히지 않은 지난 카드(HABIT_EPOCH~어제)는 이 기기에서 처음 본 때의 목록으로 정해
// 이 기기 저장소(lb.habit.basis, 화면 설정과 같은 곳, 기록·동기화 아님)에 둔다. 한 번 적은 날은 다시 계산하지 않는다. 그 카드를 다시 쌓으면 이 값이 카드에 적힌다(habitBasisFor).
export const HABIT_BASIS_KEY='lb.habit.basis',HABIT_BASIS_DAYS=400;
export function frozenBasis(life,today,storage){
  let all={};
  try{const v=JSON.parse(storage?.getItem(HABIT_BASIS_KEY)??'null');if(plain(v))all=v;}catch{/* 깨졌거나 막힌 저장소면 이번 실행만 */}
  const ok=b=>{try{validateBasis(b);return true;}catch{return false;}};
  const out={};let changed=false;
  for(const [d,b] of Object.entries(all))if(dateKeyOK(d)&&ok(b))out[d]=b;else changed=true;
  for(const row of life?.days??[]){
    const d=row.date;
    if(!dateKeyOK(d)||d<HABIT_EPOCH||d>=today||row.data?.basis||Object.hasOwn(out,d))continue;
    out[d]=habitBasis(life);changed=true;
  }
  const keep=Object.keys(out).sort().slice(-HABIT_BASIS_DAYS),kept=Object.fromEntries(keep.map(k=>[k,out[k]]));
  if(changed||keep.length!==Object.keys(out).length)try{storage?.setItem(HABIT_BASIS_KEY,JSON.stringify(kept));}catch{/* 기록에는 영향 없음 */}
  return kept;
}
// FIX68B (통제탑 2026-11-11): 기록 문이 닫혀 있으면 카드에 기준을 적지 않는다(r65 검사기가 basis 칸을 거절). 쌓을 때의 기준은 여기에(같은 lb.habit.basis) 둔다. 같은 날은 덮어쓴다.
// frozenBasis가 그대로 읽어 그날 분모로 쓴다. HABIT_EPOCH 전 날·모양이 틀린 기준은 두지 않는다. 저장소가 막혀도 던지지 않는다(기록에는 영향 없음). 돌려주는 값 = 적었는지.
export function keepHabitBasis(storage,date,b){
  if(!dateKeyOK(date)||date<HABIT_EPOCH||!b)return false;
  try{validateBasis(b);}catch{return false;}
  let all={};
  try{const v=JSON.parse(storage?.getItem(HABIT_BASIS_KEY)??'null');if(plain(v))all=v;}catch{/* 깨졌으면 새로 */}
  all[date]=structuredClone(b);
  const keep=Object.keys(all).sort().slice(-HABIT_BASIS_DAYS);
  try{storage.setItem(HABIT_BASIS_KEY,JSON.stringify(Object.fromEntries(keep.map(k=>[k,all[k]]))));return true;}catch{return false;}
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
  if(!t)return sessionIdFor(('lf_'+subjectId+'_T').length>40?shortSubject(subjectId):subjectId,'T'+ms);   // 옛 타이머: 옛 잘림 그대로(이미 담은 옛 세션을 알아본다). R42 (HUNT41 N2): 과목 36자 이상은 T 표지·시각이 모두 잘리므로 해시로 줄인다
  const room=40-('lf_'+subjectId+'_T').length-t.length;
  return room>=TIMER_TIME_MIN?sessionIdFor(subjectId,'T'+ms.slice(-room)+t):sessionIdFor(shortSubject(subjectId),'T'+ms+t);
}

// wholeLifeView가 싣는 원자료: 엔티티 그대로(heads 포함). 하루 카드는 최신 날짜가 앞.
export function lifeRawView(entities){
  const habits=[],days=[],subjects=[],plans=[],goals=[],results=[],diaries=[],weekReviews=[];let exams=null,profile=null;
  for(const e of entities){
    const row={id:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null};
    if(e.entityType==='HABIT_DEF')habits.push(row);
    else if(e.entityType==='LIFE_DAY')days.push({date:e.entityId,...row});
    else if(e.entityType==='SUBJECT_DEF')subjects.push(row);
    else if(e.entityType==='EXAM_SCHEDULE')exams=row;
    else if(e.entityType==='PLAN_DAY')plans.push({date:e.entityId,...row});
    else if(e.entityType==='PLAN_GOAL')goals.push({monday:e.entityId,...row});
    else if(e.entityType==='EXAM_RESULT')results.push({...row,createdAt:e.createdAt??null});   // 업적 달성일 = 결과를 넣은 날(D46 6.3)
    else if(e.entityType==='GAME_PROFILE')profile=row;
    else if(e.entityType==='DIARY_DAY')diaries.push({date:e.entityId,...row});
    else if(e.entityType==='WEEK_REVIEW')weekReviews.push({monday:e.entityId,...row});
  }
  days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  plans.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  goals.sort((a,b)=>a.monday<b.monday?1:a.monday>b.monday?-1:0);
  diaries.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  weekReviews.sort((a,b)=>a.monday<b.monday?1:a.monday>b.monday?-1:0);
  results.sort((a,b)=>a.data.takenOn<b.data.takenOn?1:a.data.takenOn>b.data.takenOn?-1:a.id<b.id?-1:a.id>b.id?1:0);
  habits.sort((a,b)=>a.data.order-b.data.order||(a.id<b.id?-1:1));
  subjects.sort((a,b)=>a.data.order-b.data.order||(a.id<b.id?-1:1));
  return {habits,days,subjects,exams,plans,goals,results,profile,diaries,weekReviews};
}
export const EMPTY_LIFE_VIEW=Object.freeze({habits:[],days:[],subjects:[],exams:null,plans:[],goals:[],results:[],profile:null,diaries:[],weekReviews:[]});

// ---- 쓰기 문 (D46 4.2, 통제탑 ★2) ----
// 옛 빌드는 새 기록을 받으면 멈춘다. 그래서 소유자가 네 기기 갱신을 확인하고 "켜기"를 누르기 전에는 새 기록을 쓰지 않는다. 읽기와 합치기는 항상 된다.
// 열림 = ① 이 기기 저장소 lb.records.d46이 켜짐 ② 금고에 이미 새 기록이 있음(다른 기기가 켰다는 뜻이라 첫 기록을 받는 순간 자동으로 열린다). 저장소가 막힌 기기는 이번 실행 동안만 기억한다.
export const RECORDS_DOOR_KEY='lb.records.d46';
let memoryDoor=false;
export function recordsDoorOn(storage){try{const v=storage?.getItem(RECORDS_DOOR_KEY);return v===null||v===undefined?memoryDoor:v==='1';}catch{return memoryDoor;}}
export function openRecordsDoor(storage){try{storage.setItem(RECORDS_DOOR_KEY,'1');}catch{memoryDoor=true;}return recordsDoorOn(storage);}
export function recordsInVault({life=null,study=null}={}){
  return (life?.goals??[]).length>0||(life?.results??[]).length>0||Boolean(life?.profile)||(life?.diaries??[]).length>0||(life?.weekReviews??[]).length>0||(study?.days??[]).some(d=>d.data.mistakes.some(m=>Object.hasOwn(m,'book')));
}
export function recordsDoorState({life=null,study=null,storage=null}={}){
  const device=recordsDoorOn(storage),vault=recordsInVault({life,study});
  return {open:device||vault,device,vault};
}
export function requireRecordsDoor(views){requireValue(recordsDoorState(views).open,'RECORDS_DOOR_CLOSED');}

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
