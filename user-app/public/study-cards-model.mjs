// V9A 공부 카드(오답 카드·개념 카드) + 간격 반복. 순수 모듈 — 어떤 모듈도 불러오지 않고 시계를 직접 읽지 않는다(study-model과 같은 방식, 화면과 서버가 같은 파일을 쓴다).
// 새 기록 종류 STUDY_CARD_DAY(소유자 "V9 승인" 2026-11-14): 하루 묶음 1건(entityId = KST 날짜). 그날 만든 카드(cards)와 그날 한 복습(reviews)을 한 건에 담는다.
//  · 카드 하나 = 연산 하나가 되지 않게 한다(OPS1A): 입력은 이 기기 초안(연산 0)에 모이고, 쌓기 1번 = 그 날짜 묶음 1건 = 연산 1. 복습 20장을 넘겨도 오늘 묶음 1건.
//  · 카드를 고치거나 다시 살리면 카드를 만든 날짜의 묶음을 고친다(그 날짜 1건 = 연산 1).
//  · STUDY_DAY(B4)는 그대로 둔다: 그 기록에는 문제 내용을 넣지 않는 규칙(FORBIDDEN_KEY_NAMES)이 있어 문제 글·정답을 담는 카드는 이 새 종류에만 둔다.
//  · 옛 앱은 이 종류를 모른다 → 금고를 다시 읽을 때 INVALID_ENTITY_ID로 멈추고 "앱 업데이트 필요 · 기록은 보존"을 보인다(V9A REPORT). 첫 배포 때 모든 기기를 같은 날 업데이트.
// 사진: 기록에는 사진 표지(ref·크기)만 들어간다. 사진 바이트는 찍은 기기의 저장소(study-cards.mjs, IndexedDB 암호문)에만 있다(금고·서버로 보내지 않음).
// 날짜 기준은 Asia/Seoul 고정(UTC+9). 기록 시각은 UTC(Z) ISO 문자열.
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}

export const CARD_TYPES=Object.freeze(['STUDY_CARD_DAY']);
export const CARD_LIMITS=Object.freeze({STUDY_CARD_DAY:3700});
export const CARD_KINDS=Object.freeze(['WRONG','CONCEPT']);
// 틀린 이유 칩(지시서 1): 개념/계산/시간/실수/기타.
export const REASONS=Object.freeze(['CONCEPT','CALC','TIME','SLIP','OTHER']);
export const REASON_TEXT=Object.freeze({CONCEPT:'개념',CALC:'계산',TIME:'시간',SLIP:'실수',OTHER:'기타'});
// 간격 사다리(지시서 3): 1·3·7·14·30일. 맞힘 → 다음 간격, 틀림 → 1일. 30일 간격 복습까지 맞히면 졸업.
export const CARD_LADDER=Object.freeze([1,3,7,14,30]);
export const MAX_CARDS=60;
export const MAX_CARD_REVIEWS=300;
// 하루 묶음 바이트 한도: PC 앱 저장 요청 한도 65,536바이트(user-app/host.mjs readJSON) 안에 명령 봉투까지 들어가게 48KB.
export const MAX_DAY_BYTES=48*1024;
export const MAX_SUBJECT=12,MAX_UNIT=30,MAX_FRONT=1000,MAX_BACK=1000,MAX_MINE=300;
// 사진 표지: ref = 'p' + 16진 24자. 가로·세로 1~4096, 용량(KB) 1~2048. 바이트는 기록에 없다.
export const PHOTO_REF=/^p[0-9a-f]{24}$/;
const KST_MS=9*3600000,DAY_MS=86400000;
const ID=/^[A-Za-z0-9_-]{1,40}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
export const cardIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
export const cardDateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const isoOK=v=>typeof v==='string'&&ISO.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const kstDay=iso=>new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);
export const addDays=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);
const dayNo=date=>Math.round(Date.parse(date+'T12:00:00Z')/DAY_MS);

function shape(v,keys,code){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
  const k=Object.keys(v);requireValue(k.length===keys.length&&keys.every(x=>k.includes(x)),code);
}
function text(v,max,empty=true){requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_CARD_TEXT');}
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;

export const CARD_KEYS=Object.freeze(['id','kind','subject','unit','front','back','mine','reasons','photo','revivedAt']);
function validateCard(c){
  shape(c,CARD_KEYS,'INVALID_CARD');
  requireValue(cardIdOK(c.id),'INVALID_CARD_ID');
  requireValue(CARD_KINDS.includes(c.kind),'INVALID_CARD');
  text(c.subject,MAX_SUBJECT,false);text(c.unit,MAX_UNIT);text(c.front,MAX_FRONT);text(c.back,MAX_BACK);text(c.mine,MAX_MINE);
  requireValue(Array.isArray(c.reasons)&&c.reasons.length<=REASONS.length&&c.reasons.every(r=>REASONS.includes(r))&&new Set(c.reasons).size===c.reasons.length,'INVALID_CARD_REASON');
  if(c.photo!==null){shape(c.photo,['ref','w','h','kb'],'INVALID_CARD_PHOTO');requireValue(PHOTO_REF.test(c.photo.ref)&&int(c.photo.w,1,4096)&&int(c.photo.h,1,4096)&&int(c.photo.kb,1,2048),'INVALID_CARD_PHOTO');}
  requireValue(c.revivedAt===null||isoOK(c.revivedAt),'INVALID_CARD_TIME');
  if(c.kind==='WRONG')requireValue(c.front.trim().length>0||c.photo!==null,'CARD_QUESTION_REQUIRED');   // 문제는 글 또는 사진
  else requireValue(c.front.trim().length>0&&c.back.trim().length>0&&c.mine===''&&c.reasons.length===0&&c.photo===null,'CARD_CONCEPT_SIDES');   // 개념 카드: 앞면·뒷면만
}
function validateReview(r,date){
  shape(r,['id','cardId','doneAt','ok'],'INVALID_CARD_REVIEW');
  requireValue(cardIdOK(r.id)&&cardIdOK(r.cardId),'INVALID_CARD_ID');
  requireValue(isoOK(r.doneAt)&&typeof r.ok==='boolean','INVALID_CARD_REVIEW');
  requireValue(Math.abs(dayNo(kstDay(r.doneAt))-dayNo(date))<=1,'CARD_TIME_OUTSIDE_DAY');
}
export const dayBytes=d=>new TextEncoder().encode(JSON.stringify(d)).length;
export function validateCardDay(type,id,d){
  requireValue(CARD_TYPES.includes(type)&&cardIdOK(id),'INVALID_ENTITY_ID');
  shape(d,['date','cards','reviews','confirmCount'],'INVALID_CARD_SCHEMA');
  requireValue(cardDateOK(id)&&d.date===id,'INVALID_CARD_DATE');
  requireValue(int(d.confirmCount,1,9999),'INVALID_CARD_CONFIRM_COUNT');
  requireValue(Array.isArray(d.cards)&&d.cards.length<=MAX_CARDS,'CARD_LIMIT');
  requireValue(Array.isArray(d.reviews)&&d.reviews.length<=MAX_CARD_REVIEWS,'CARD_REVIEW_LIMIT');
  for(const c of d.cards)validateCard(c);
  for(const r of d.reviews)validateReview(r,d.date);
  for(const [list,code] of [['cards','DUPLICATE_CARD_ID'],['reviews','DUPLICATE_CARD_REVIEW_ID']]){const seen=new Set();for(const x of d[list]){requireValue(!seen.has(x.id),code);seen.add(x.id);}}
  // 복습은 다른(이전) 날짜 묶음의 카드를 가리킨다. 가리키는 카드가 어디에도 없으면 투영이 건너뛴다(거부하지 않음, STUDY_DAY 복습과 같은 규칙).
  requireValue(dayBytes(d)<=MAX_DAY_BYTES,'CARD_DAY_TOO_LARGE');
}
// 확정 시점 검사: 개수 한도, confirmCount(새 묶음은 1, 고칠 때마다 +1). studyTransition과 같은 규칙.
export function cardTransition(v,old,ctx){
  const {entityType:type,data:d}=v;
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<CARD_LIMITS[type],'APP_ENTITY_LIMIT');
  requireValue(d.confirmCount===(old?old.data.confirmCount+1:1),'CARD_CONFIRM_COUNT_MISMATCH');
}
export const emptyCardDay=date=>({date,cards:[],reviews:[],confirmCount:0});
export const cardDayEmpty=d=>Array.isArray(d?.cards)&&!d.cards.length&&!d.reviews?.length;
export function cardDayTitle(v){return '공부 카드 · '+v.data.date;}
export function cardRawView(entities){
  const days=[];
  for(const e of entities)if(e.entityType==='STUDY_CARD_DAY')days.push({date:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
  days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  return {days};
}
// 새 카드 행(화면이 id를 넘긴다). 빈 칸은 빈 글자, 사진 없음 = null.
export function newCardRow({id,kind,subject,unit='',front='',back='',mine='',reasons=[],photo=null}){
  return {id,kind,subject:String(subject??'').trim(),unit:String(unit??'').trim(),front:String(front??'').trim(),back:String(back??'').trim(),
    mine:kind==='WRONG'?String(mine??'').trim():'',reasons:kind==='WRONG'?REASONS.filter(r=>reasons.includes(r)):[],photo:kind==='WRONG'?photo:null,revivedAt:null};
}

// ---- 간격 반복 투영(계산만, 연산 0) ----
// days: [{date,data}] 또는 묶음 data 배열. 같은 id가 두 묶음 이상에 있으면 그 id는 계산에서 뺀다(duplicates, 투영 study-projection과 같은 규칙).
// 한 카드의 상태: 단계 i(0~4) = 지금 기다리는 간격 CARD_LADDER[i]. 만든 날 +1일이 첫 복습일(i=0).
//  · 복습 순서 = doneAt, 같으면 id(어느 기기에서 쌓은 순서든 결과가 같다).
//  · 맞힘: i=4(30일)에서 맞히면 졸업(due 없음). 아니면 i+1, due = 복습한 날(KST) + CARD_LADDER[i].
//    V9FIX M-01: 복습일(due) 전에 맞힌 것은 단계를 올리지 않는다(맞음 수만 센다). 같은 날 두 번(두 기기·이어 한 세션) 맞혀도 한 단계, 14일 단계에서 30일을 건너뛰고 졸업하지 않는다.
//  · 틀림: i=0, due = 복습한 날 + 1일.
//  · 다시 살리기(B4b와 같은 원리: 마지막 복습보다 새 표지가 졸업보다 우선): revivedAt이 있으면 그 시각 뒤의 복습만 세고, 그 시각 이전 복습은 버린다.
//    살린 날(KST)이 바로 복습일(i=0). B4b 오답 규칙(reviewDue가 마지막 복습보다 새로우면 다시 나옴)과 같은 뜻을 카드 표지 하나로 쓴다.
const byTime=(a,b)=>a.doneAt<b.doneAt?-1:a.doneAt>b.doneAt?1:a.id<b.id?-1:a.id>b.id?1:0;
export function cardState(card,date,reviews){
  const from=card.revivedAt;
  let i=0,due=from?kstDay(from):addDays(date,CARD_LADDER[0]),graduated=false,last=null,right=0,wrong=0,graduatedAt=null;
  for(const r of [...reviews].sort(byTime)){
    if(from&&!(r.doneAt>from))continue;
    if(graduated)continue;   // 졸업 뒤 기록(다른 기기가 늦게 쌓은 것)은 단계를 바꾸지 않는다
    last=r;const day=kstDay(r.doneAt);
    if(r.ok){right++;if(day<due)continue;if(i===CARD_LADDER.length-1){graduated=true;due=null;graduatedAt=r.doneAt;}else{i++;due=addDays(day,CARD_LADDER[i]);}}
    else{wrong++;i=0;due=addDays(day,CARD_LADDER[0]);}
  }
  return {stage:i,due,graduated,graduatedAt,last:last?{doneAt:last.doneAt,ok:last.ok}:null,right,wrong,interval:graduated?null:CARD_LADDER[i]};
}
export function projectCards(days,today){
  requireValue(cardDateOK(today),'INVALID_CARD_DATE');
  const cards=[],reviews=[];
  for(const x of days??[]){
    const d=x?.data??x;if(!d||!Array.isArray(d.cards)||!Array.isArray(d.reviews))continue;
    for(const c of d.cards)cards.push({card:c,date:d.date});
    for(const r of d.reviews)reviews.push(r);
  }
  const count=(list,key)=>{const m=new Map();for(const x of list)m.set(key(x),(m.get(key(x))??0)+1);return m;};
  const cc=count(cards,x=>x.card.id),rc=count(reviews,r=>r.id),duplicates=[];
  for(const [id,n] of cc)if(n>1)duplicates.push({kind:'card',id});
  for(const [id,n] of rc)if(n>1)duplicates.push({kind:'review',id});
  const byCard=new Map();
  for(const r of reviews){if(rc.get(r.id)!==1)continue;if(!byCard.has(r.cardId))byCard.set(r.cardId,[]);byCard.get(r.cardId).push(r);}
  const rows=cards.filter(x=>cc.get(x.card.id)===1).map(x=>({id:x.card.id,date:x.date,card:x.card,...cardState(x.card,x.date,byCard.get(x.card.id)??[])}));
  rows.sort((a,b)=>(a.date<b.date?1:a.date>b.date?-1:0)||(a.id<b.id?-1:a.id>b.id?1:0));
  const due=rows.filter(r=>!r.graduated&&r.due<=today).map(r=>({...r,daysLate:dayNo(today)-dayNo(r.due)}))
    .sort((a,b)=>(a.due<b.due?-1:a.due>b.due?1:0)||(a.date<b.date?-1:a.date>b.date?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));
  duplicates.sort((a,b)=>(a.kind<b.kind?-1:a.kind>b.kind?1:0)||(a.id<b.id?-1:1));
  return {today,rows,due,active:rows.filter(r=>!r.graduated),graduated:rows.filter(r=>r.graduated),duplicates};
}
// 목록 필터(지시서 4): 과목·이유·종류·졸업. 빈 값은 거르지 않음.
export function filterCards(rows,{subject='',reason='',kind='',graduated=false}={}){
  return rows.filter(r=>r.graduated===Boolean(graduated)&&(!subject||r.card.subject===subject)&&(!reason||r.card.reasons.includes(reason))&&(!kind||r.card.kind===kind));
}
export const cardSubjects=rows=>[...new Set(rows.map(r=>r.card.subject))].sort();
// 복습 요약(지시서 3 "끝나면 요약"): 이번에 넘긴 결과 [{cardId,ok}]와 그 뒤 투영으로 다음 복습일을 센다.
export function sessionSummary(results,proj){
  const right=results.filter(r=>r.ok).length,wrong=results.length-right,next=new Map();let graduated=0;
  for(const r of results){const row=proj.rows.find(x=>x.id===r.cardId);if(!row)continue;if(row.graduated)graduated++;else next.set(row.due,(next.get(row.due)??0)+1);}
  return {total:results.length,right,wrong,graduated,next:[...next].sort((a,b)=>a[0]<b[0]?-1:1).map(([date,n])=>({date,n}))};
}
export const dueLine=n=>n?'오늘 복습 '+n+'장':'오늘 복습할 카드 없음';
// V9FIX L-08: 복습일이 지난 날 수(오늘이 복습일이면 0).
export const lateDays=(due,today)=>due&&due<today?dayNo(today)-dayNo(due):0;
