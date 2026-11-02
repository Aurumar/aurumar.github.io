// 자동 복습 주기 (B4 보충 R1.1, 소유자 요청 2026-11-01). 순수 함수 — 어떤 모듈도 불러오지 않고 시계를 직접 읽지 않는다(기준일·복습 시각은 호출자가 넘긴다).
// 같은 입력이면 어느 기기에서나 같은 결과. 저장되는 것은 소유자가 확정한 nextDue 날짜 값뿐이라 나중에 이 알고리즘이 바뀌어도 옛 기록은 바뀌지 않는다.
//
// 간격 사다리(일): 1, 3, 7, 14, 30, 60, 120. 단계 k(0~6) = 지금 기다린 간격이 LADDER[k]인 상태.
//  · 오답을 처음 등록하면 reviewDue = 등록일 + 1일(k=0).
//  · RECALLED: k+1로 올려 LADDER[k+1]일 뒤. k=6(120일)에서 또 RECALLED면 졸업(제안 없음, nextDue 비움 = 닫힘).
//  · PARTIAL: 단계 유지 — LADDER[k]일을 다시. (RECALLED 연속 횟수를 끊지도 늘리지도 않는다: 지시서의 "PARTIAL = 단계 유지"를 그대로 읽은 해석, AI_INFERENCE.)
//  · FAILED: k=0으로 되돌려 1일 뒤.
//  · 기준일은 복습을 한 날(KST). 예정일보다 늦게 해도 한 날부터 센다.
//  · 단계 계산에는 result만 쓴다(복습 시각은 같은 오답의 복습 이력을 시간순으로 세우는 데만 쓰고, nextDue 날짜 값은 읽지 않는다).
// 졸업 뒤에 다시 복습 기록이 생기면(되살리기) 120일 단계에서 이어 간다.
export const LADDER=Object.freeze([1,3,7,14,30,60,120]);
const LAST=LADDER.length-1;
const KST_MS=9*3600000;
const DAY_MS=86400000;

function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const isoOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const kstDateOf=iso=>{requireValue(isoOK(iso),'INVALID_STUDY_TIME');return new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);};
export function addDays(date,days){
  requireValue(dateOK(date),'INVALID_STUDY_DATE');requireValue(Number.isInteger(days),'INVALID_STUDY_DAYS');
  return new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);
}
// 오답 등록일(KST 날짜, 보통 카드 날짜)의 다음 날.
export const defaultReviewDue=registeredDate=>addDays(registeredDate,LADDER[0]);

const byTime=(a,b)=>a.doneAt<b.doneAt?-1:a.doneAt>b.doneAt?1:a.id<b.id?-1:a.id>b.id?1:0;
// history: [{id,doneAt,result}] 한 오답의 복습 기록(순서·미완료 행 무관). 완료된 것만 시간순(doneAt, 같으면 id)으로 세워 result 배열을 준다.
export function orderedResults(history){
  return history.filter(h=>h&&typeof h.doneAt==='string'&&typeof h.result==='string').sort(byTime).map(h=>h.result);
}
// results를 앞에서부터 적용한 단계. stage 0~6, 졸업이면 stage=7(graduated).
export function stageOf(results){
  let k=0;
  for(const r of results){
    const kb=Math.min(k,LAST);
    if(r==='RECALLED')k=kb===LAST?LADDER.length:kb+1;
    else if(r==='PARTIAL')k=kb;
    else if(r==='FAILED')k=0;
    else requireValue(false,'INVALID_STUDY_RESULT');
  }
  return {stage:k,graduated:k===LADDER.length};
}
// 이번 복습 결과에 대한 제안. reviewDate = 복습을 한 날(KST). 졸업이면 nextDue=null.
export function suggestNext(history,result,reviewDate){
  requireValue(['RECALLED','PARTIAL','FAILED'].includes(result),'INVALID_STUDY_RESULT');requireValue(dateOK(reviewDate),'INVALID_STUDY_DATE');
  const {stage}=stageOf(orderedResults(history)),kb=Math.min(stage,LAST);
  if(result==='RECALLED'&&kb===LAST)return {nextDue:null,graduated:true,stage:LADDER.length,intervalDays:null};
  const to=result==='RECALLED'?kb+1:result==='PARTIAL'?kb:0;
  return {nextDue:addDays(reviewDate,LADDER[to]),graduated:false,stage:to,intervalDays:LADDER[to]};
}
// 카드들(이전 카드 포함)에서 한 오답의 복습 이력을 모은다. 투영과 같이 같은 id가 둘 이상이면 그 id는 모두 뺀다. exceptReviewId = 지금 고치는 복습 행(이력에서 제외).
export function reviewHistory(cards,mistakeId,exceptReviewId=null){
  const all=[],counts=new Map();
  for(const c of cards){
    if(!c||!Array.isArray(c.reviews))continue;
    for(const r of c.reviews){counts.set(r.id,(counts.get(r.id)??0)+1);if(r.mistakeId===mistakeId)all.push(r);}
  }
  return all.filter(r=>counts.get(r.id)===1&&r.id!==exceptReviewId).map(r=>({id:r.id,doneAt:r.doneAt,result:r.result}));
}
export function suggestForMistake(cards,mistakeId,result,doneAtIso,exceptReviewId=null){
  return suggestNext(reviewHistory(cards,mistakeId,exceptReviewId),result,kstDateOf(doneAtIso));
}

// ---- 복습 알림(앱 안 표시) ----
// proj = projectStudy 결과. 건수와 한 줄 문구, 그리고 홈 통합 화면(B5)이 그대로 쓸 수 있는 목록(밀린 것 먼저, 많이 늦은 순).
export function reviewQueue(proj){
  const late=[...proj.overdue].sort((a,b)=>b.daysLate-a.daysLate||(a.mistakeId<b.mistakeId?-1:a.mistakeId>b.mistakeId?1:0)).map(r=>({...r,status:'OVERDUE'}));
  const today=proj.dueToday.map(r=>({...r,daysLate:0,status:'DUE_TODAY'}));
  return [...late,...today];
}
export function reviewSummary(proj){
  const dueToday=proj.dueToday.length,overdue=proj.overdue.length,total=dueToday+overdue;
  const line=total===0?'복습할 오답이 없습니다.':'오늘 복습 '+dueToday+'건'+(overdue?' · 밀린 복습 '+overdue+'건':'');
  return {baseDate:proj.baseDate,dueToday,overdue,total,line,items:reviewQueue(proj)};
}
