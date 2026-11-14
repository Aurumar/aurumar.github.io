// V9B 수능 학습 엔진 2: D-day 역산 계획(과목별 남은 범위) + 모의고사 목표선. 순수 모듈 — 어떤 모듈도 불러오지 않고 시계를 직접 읽지 않는다(study-cards-model과 같은 방식).
// 새 기록 종류 STUDY_RANGE_DAY(소유자 "V9 승인" 2026-11-14): 하루 묶음 1건(entityId = KST 날짜). 그날 넣은 단원(units), 그날 바꾼 진도(marks), 그날 정한 모의고사 목표(goals)를 한 건에 담는다.
//  · 단원·진도·목표 하나 = 연산 하나가 되지 않게 한다(OPS1A): 입력은 이 기기 초안(연산 0)에 모이고, 쌓기 1번 = 그 날짜 묶음 1건 = 연산 1.
//  · 단원 이름을 고치거나 지우면 단원을 넣은 날짜의 묶음을 고친다(그 날짜 1건 = 연산 1). 진도·목표는 바꾼 날(오늘) 묶음에 새 줄로 쌓인다(지난 값이 남아 "월요일의 진도"를 다시 셀 수 있다).
//  · 모의고사 점수는 기존 EXAM_RESULT(D46 2.2) 그대로다. 이 종류에는 목표선(과목별 원점수·등급)만 둔다.
//  · 옛 앱은 이 종류를 모른다 → 금고를 다시 읽을 때 INVALID_ENTITY_ID로 멈추고 "앱 업데이트 필요 · 기록은 보존"을 보인다(V9A STUDY_CARD_DAY와 같음). 첫 배포 때 모든 기기를 같은 날 업데이트.
// 날짜 기준은 Asia/Seoul 고정(UTC+9). 기록 시각은 UTC(Z) ISO 문자열.
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}

export const RANGE_TYPES=Object.freeze(['STUDY_RANGE_DAY']);
export const RANGE_LIMITS=Object.freeze({STUDY_RANGE_DAY:3700});
export const RANGE_LISTS=Object.freeze(['units','marks','goals']);
export const MAX_UNITS=200,MAX_MARKS=400,MAX_GOALS=40,MAX_UNIT_NAME=30,MAX_ORDER=9999;
// 하루 묶음 바이트 한도: STUDY_CARD_DAY와 같은 48KB(PC 앱 저장 요청 한도 65,536바이트 안에 명령 봉투까지).
export const MAX_RANGE_BYTES=48*1024;
const KST_MS=9*3600000,DAY_MS=86400000;
const ID=/^[A-Za-z0-9_-]{1,40}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
export const rangeIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
export const rangeDateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const isoOK=v=>typeof v==='string'&&ISO.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const kstDay=iso=>new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);
export const addDays=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);
export const dayNo=date=>Math.round(Date.parse(date+'T12:00:00Z')/DAY_MS);
export const mondayOf=date=>addDays(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));

function shape(v,keys,code){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
  const k=Object.keys(v);requireValue(k.length===keys.length&&keys.every(x=>k.includes(x)),code);
}
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const nullInt=(v,lo,hi)=>v===null||int(v,lo,hi);

// 단원: 과목 id(SUBJECT_DEF·기본 과목 id), 이름(30자), 순서(작을수록 먼저 공부).
function validateUnit(u){
  shape(u,['id','subjectId','name','order'],'INVALID_RANGE_UNIT');
  requireValue(rangeIdOK(u.id)&&rangeIdOK(u.subjectId),'INVALID_RANGE_ID');
  requireValue(typeof u.name==='string'&&u.name.isWellFormed()&&u.name.trim().length>0&&[...u.name].length<=MAX_UNIT_NAME,'INVALID_RANGE_TEXT');
  requireValue(int(u.order,0,MAX_ORDER),'INVALID_RANGE_UNIT');
}
// 진도: 단원 하나의 진도 %(0~100 정수)를 바꾼 시각. 묶음 날짜와 ±1일(자정 걸침) 안. 가리키는 단원이 없으면 투영이 건너뛴다(거부하지 않음, 카드 복습과 같은 규칙).
function validateMark(m,date){
  shape(m,['id','unitId','pct','at'],'INVALID_RANGE_MARK');
  requireValue(rangeIdOK(m.id)&&rangeIdOK(m.unitId),'INVALID_RANGE_ID');
  requireValue(int(m.pct,0,100)&&isoOK(m.at),'INVALID_RANGE_MARK');
  requireValue(Math.abs(dayNo(kstDay(m.at))-dayNo(date))<=1,'RANGE_TIME_OUTSIDE_DAY');
}
// 모의고사 목표선: 과목별 원점수(0~100)·등급(1~9). 둘 다 null이면 목표 지우기. 과목마다 가장 늦은 줄이 지금 목표다.
function validateGoal(g,date){
  shape(g,['id','subjectId','raw','grade','at'],'INVALID_RANGE_GOAL');
  requireValue(rangeIdOK(g.id)&&rangeIdOK(g.subjectId),'INVALID_RANGE_ID');
  requireValue(nullInt(g.raw,0,100)&&nullInt(g.grade,1,9)&&isoOK(g.at),'INVALID_RANGE_GOAL');
  requireValue(Math.abs(dayNo(kstDay(g.at))-dayNo(date))<=1,'RANGE_TIME_OUTSIDE_DAY');
}
export const rangeBytes=d=>new TextEncoder().encode(JSON.stringify(d)).length;
export function validateRangeDay(type,id,d){
  requireValue(RANGE_TYPES.includes(type)&&rangeIdOK(id),'INVALID_ENTITY_ID');
  shape(d,['date','units','marks','goals','confirmCount'],'INVALID_RANGE_SCHEMA');
  requireValue(rangeDateOK(id)&&d.date===id,'INVALID_RANGE_DATE');
  requireValue(int(d.confirmCount,1,9999),'INVALID_RANGE_CONFIRM_COUNT');
  requireValue(Array.isArray(d.units)&&d.units.length<=MAX_UNITS,'RANGE_UNIT_LIMIT');
  requireValue(Array.isArray(d.marks)&&d.marks.length<=MAX_MARKS,'RANGE_MARK_LIMIT');
  requireValue(Array.isArray(d.goals)&&d.goals.length<=MAX_GOALS,'RANGE_GOAL_LIMIT');
  for(const u of d.units)validateUnit(u);
  for(const m of d.marks)validateMark(m,d.date);
  for(const g of d.goals)validateGoal(g,d.date);
  for(const list of RANGE_LISTS){const seen=new Set();for(const x of d[list]){requireValue(!seen.has(x.id),'DUPLICATE_RANGE_ID');seen.add(x.id);}}
  requireValue(rangeBytes(d)<=MAX_RANGE_BYTES,'RANGE_DAY_TOO_LARGE');
}
// 확정 시점 검사: 개수 한도, confirmCount(새 묶음은 1, 고칠 때마다 +1). cardTransition과 같은 규칙.
export function rangeTransition(v,old,ctx){
  const {entityType:type,data:d}=v;
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<RANGE_LIMITS[type],'APP_ENTITY_LIMIT');
  requireValue(d.confirmCount===(old?old.data.confirmCount+1:1),'RANGE_CONFIRM_COUNT_MISMATCH');
}
export const emptyRangeDay=date=>({date,units:[],marks:[],goals:[],confirmCount:0});
export function rangeDayTitle(v){return '공부 범위 · '+v.data.date;}   // 이력 제목에 단원 이름·점수를 넣지 않는다
export function rangeRawView(entities){
  const days=[];
  for(const e of entities)if(e.entityType==='STUDY_RANGE_DAY')days.push({date:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
  days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  return {days};
}

// ---- 투영(계산만, 연산 0) ----
// days: [{date,data}] 또는 묶음 data 배열. 같은 id가 두 묶음 이상에 있으면 그 id는 계산에서 뺀다(duplicates, 카드 투영과 같은 규칙).
// 진도·목표의 순서 = at, 같으면 id(어느 기기에서 쌓은 순서든 결과가 같다).
const byTime=(a,b)=>a.at<b.at?-1:a.at>b.at?1:a.id<b.id?-1:a.id>b.id?1:0;
export function projectRange(days){
  const units=[],marks=[],goals=[];
  for(const x of days??[]){
    const d=x?.data??x;if(!d||!Array.isArray(d.units)||!Array.isArray(d.marks)||!Array.isArray(d.goals))continue;
    for(const u of d.units)units.push({...u,addedOn:d.date});
    marks.push(...d.marks);goals.push(...d.goals);
  }
  const count=list=>{const m=new Map();for(const x of list)m.set(x.id,(m.get(x.id)??0)+1);return m;};
  const uc=count(units),mc=count(marks),gc=count(goals),duplicates=[];
  for(const [kind,m] of [['unit',uc],['mark',mc],['goal',gc]])for(const [id,n] of m)if(n>1)duplicates.push({kind,id});
  const byUnit=new Map();
  for(const m of marks.filter(x=>mc.get(x.id)===1).sort(byTime)){if(!byUnit.has(m.unitId))byUnit.set(m.unitId,[]);byUnit.get(m.unitId).push(m);}
  const rows=units.filter(u=>uc.get(u.id)===1).map(u=>{const h=byUnit.get(u.id)??[];return {...u,history:h,pct:h.length?h.at(-1).pct:0};})
    .sort((a,b)=>a.subjectId<b.subjectId?-1:a.subjectId>b.subjectId?1:(a.order-b.order)||(a.addedOn<b.addedOn?-1:a.addedOn>b.addedOn?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));
  const goalOf=new Map();
  for(const g of goals.filter(x=>gc.get(x.id)===1).sort(byTime))goalOf.set(g.subjectId,g);
  const goalBy={};for(const [s,g] of goalOf)if(g.raw!==null||g.grade!==null)goalBy[s]={raw:g.raw,grade:g.grade,at:g.at};
  duplicates.sort((a,b)=>(a.kind<b.kind?-1:a.kind>b.kind?1:0)||(a.id<b.id?-1:1));
  return {units:rows,goals:goalBy,duplicates};
}
// 단원의 어느 날 0시(KST) 직전 진도: 그 날짜 앞(KST)에 바꾼 마지막 값. 없으면 0.
export function pctBefore(unit,date){let p=0;for(const m of unit.history)if(kstDay(m.at)<date)p=m.pct;return p;}
// V9FIX M-05: 그 날짜(KST) 끝까지 바꾼 마지막 진도. 이번 주에 넣은 단원의 기준값(넣은 날 마지막 진도)에 쓴다.
export function pctThrough(unit,date){let p=0;for(const m of unit.history)if(kstDay(m.at)<=date)p=m.pct;return p;}
// 주 목표의 기준값: 월요일 전에 있던 단원 = 월요일 0시 직전 진도, 이번 주에 넣은 단원(처음 쓰는 주 포함) = 넣은 날 마지막 진도(이미 끝낸 단원이 목표가 되지 않게).
export const weekBase=(unit,monday)=>unit.addedOn&&unit.addedOn>=monday?pctThrough(unit,unit.addedOn):pctBefore(unit,monday);
// 과목별 묶음. 순서 = order(과목 id 목록, 앱의 과목 순서)에 있는 과목 먼저 그 순서대로, 나머지는 id 순. 진도 % = 단원 진도의 평균(반올림).
export function subjectRows(proj,order=[]){
  const by=new Map();
  for(const u of proj.units){if(!by.has(u.subjectId))by.set(u.subjectId,[]);by.get(u.subjectId).push(u);}
  const rank=id=>{const i=order.indexOf(id);return i<0?order.length:i;};
  return [...by].sort((a,b)=>rank(a[0])-rank(b[0])||(a[0]<b[0]?-1:a[0]>b[0]?1:0)).map(([subjectId,units])=>({subjectId,units,pct:Math.round(units.reduce((s,u)=>s+u.pct,0)/units.length),done:units.filter(u=>u.pct>=100).length}));
}

// ---- D-day 역산(지시서 1) ----
// 기준 시험일(examDate)까지 남은 주(이번 주 포함) = floor((시험일 − 이번 주 월요일) / 7) + 1. 시험일이 이번 주 월요일보다 앞이면 0(계획 없음).
// 이번 주 목표(과목마다): 이번 주 월요일 0시 직전에 아직 100%가 아니던 단원(그 뒤에 넣은 단원 포함)을 순서대로 남은 주에 고르게 나눈다
//   → m = ceil(남은 단원 수 / 남은 주), 목표 = 그 앞쪽 m개. 주 안에서 진도를 올려도 목표 목록이 바뀌지 않는다(월요일 값 기준). n = 목표 중 지금 100%.
export function weeksLeft(today,examDate){
  if(!rangeDateOK(today)||!rangeDateOK(examDate))return 0;
  const mon=mondayOf(today);
  return examDate<mon?0:Math.floor((dayNo(examDate)-dayNo(mon))/7)+1;
}
export function weekPlan(proj,{today,examDate,order=[]}){
  requireValue(rangeDateOK(today),'INVALID_RANGE_DATE');
  const monday=mondayOf(today),weeks=weeksLeft(today,examDate),subjects=[];
  for(const s of subjectRows(proj,order)){
    const remaining=s.units.filter(u=>weekBase(u,monday)<100);
    const m=weeks?Math.ceil(remaining.length/weeks):0,targets=remaining.slice(0,m);
    subjects.push({subjectId:s.subjectId,pct:s.pct,total:s.units.length,remaining:remaining.length,remainingNow:s.units.filter(u=>u.pct<100).length,
      targets:targets.map(u=>({id:u.id,name:u.name,pct:u.pct,done:u.pct>=100})),n:targets.filter(u=>u.pct>=100).length,m});
  }
  const n=subjects.reduce((a,s)=>a+s.n,0),m=subjects.reduce((a,s)=>a+s.m,0);
  return {today,monday,sunday:addDays(monday,6),examDate:examDate??null,weeks,subjects,n,m};
}
export const weekGoalLine=p=>p.m?'이번 주 목표 '+p.n+'/'+p.m:null;

// ---- 모의고사 추세(지시서 2) ----
// results: life 투영의 EXAM_RESULT 목록([{examId,takenOn,scores:[{subjectId,raw,std,pct,grade}]}]). 응시일 순서. 같은 응시일은 시험 id 순서.
// 과목마다 점(원점수·등급)과 지난 시험 대비 변화(원점수는 높을수록, 등급은 낮을수록 좋음).
export function examTrend(results,{metric='raw'}={}){
  const key=metric==='grade'?'grade':'raw';
  const list=[...(results??[])].filter(r=>r&&rangeDateOK(r.takenOn)&&Array.isArray(r.scores)).sort((a,b)=>a.takenOn<b.takenOn?-1:a.takenOn>b.takenOn?1:String(a.examId??'')<String(b.examId??'')?-1:1);
  const by=new Map();
  list.forEach((r,i)=>{for(const s of r.scores){const v=s[key];if(v===null||v===undefined)continue;if(!by.has(s.subjectId))by.set(s.subjectId,[]);by.get(s.subjectId).push({i,takenOn:r.takenOn,examId:r.examId??null,value:v});}});
  const subjects=[...by].map(([subjectId,points])=>{
    const last=points.at(-1),prev=points.at(-2)??null,delta=prev?last.value-prev.value:null;
    const better=delta===null||delta===0?null:key==='grade'?delta<0:delta>0;
    return {subjectId,points,last:last.value,prev:prev?prev.value:null,prevTakenOn:prev?prev.takenOn:null,prevSkipped:Boolean(prev&&last.i-prev.i>1),delta,trend:delta===null?'NEW':delta===0?'SAME':better?'UP':'DOWN'};
  });
  return {metric:key,exams:list.map(r=>({takenOn:r.takenOn,examId:r.examId??null})),subjects};
}
// 화살표 글자(색만으로 구분하지 않는다: ▲·▼·― + 숫자). 등급은 숫자가 줄면 ▲(좋아짐).
export function trendText(s,metric){
  if(s.trend==='NEW')return '첫 기록';
  if(s.trend==='SAME')return '― 지난번과 같음';
  const n=Math.abs(s.delta);
  return (s.trend==='UP'?'▲ ':'▼ ')+(metric==='grade'?n+'등급 '+(s.trend==='UP'?'올라감':'내려감'):n+'점 '+(s.trend==='UP'?'오름':'내림'));
}
