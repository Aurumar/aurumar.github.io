// 이 모듈과 study-schedule·study-projection·study-rebase·study-flow는 hlt-*와 따로 놀며 서로 필요한 만큼만 불러온다(model·schedule·projection은 어떤 모듈도 불러오지 않는다). 화면과 서버가 같은 파일을 쓰도록 브라우저에서도 그대로 동작한다.
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
// STUDY 공부 모듈 모델 (MD03 앱 모듈, B4). 합성 데이터로만 시험한다. 엔티티 하나 저장 = 연산 하나(fin-model·hlt-model과 같은 방식).
// 엔티티: STUDY_DAY(하루 1장 카드, entityId=날짜). V24 학습 코어의 규칙을 "규칙 사양"으로만 옮겼다(코드 import 없음): 과목 6, 출처 표기 3, 오답 코드 22, 증거 상태 4.
// 문제 본문·보기·정답·해설을 담을 수 있는 필드는 모델에 없다(정확한 키 집합 검사로 보장 + 아래 FORBIDDEN_KEY_NAMES 시험).
// 새 엔티티 종류를 받으면 옛 빌드는 HOLD한다(fin-model.mjs 머리 주석과 같음). 설계: AUTOPILOT\design\B1_MODULE_COMMON_DESIGN_R0.md §3.2, tasks\B4_*, B4_ADDENDUM_R1.
// 날짜 기준은 Asia/Seoul 고정(UTC+9, 서머타임 없음). 기록 시각은 UTC(Z) ISO 문자열이다.

export const STUDY_TYPES=Object.freeze(['STUDY_DAY']);
export const STUDY_LIMITS=Object.freeze({STUDY_DAY:3700});
export const SUBJECTS=Object.freeze(['K','M','E','H','S','C']);
export const SESSION_STATES=Object.freeze(['PROPOSED','PREPARED','STARTED','ATTEMPTED','COMPLETED','VERIFIED']);
export const PROVENANCE=Object.freeze(['AI_ORIGINAL_PRACTICE','OFFICIAL_KICE_SAMPLE','OFFICIAL_OTHER_VERIFIED']);
export const ERROR_CODES=Object.freeze([
  'K-FACT','K-REL','K-INF','K-OPT','K-TIME',
  'M-CONCEPT','M-MODEL','M-ALG','M-COND','M-TRANSFER',
  'E-VOCAB','E-SYNTAX','E-LOGIC','E-LISTEN',
  'I-CONCEPT','I-CAUSE','I-DATA','I-TRANSFER',
  'X-NOT_STARTED','X-INTERRUPTED','X-SOURCE_BLOCKED','X-TIME_UNKNOWN']);
export const EVIDENCE_STATUS=Object.freeze(['OBSERVED','USER_REPORTED','INFERENCE','UNKNOWN']);
export const RESULTS=Object.freeze(['RECALLED','PARTIAL','FAILED']);
export const MAX_SESSIONS=30;
export const MAX_MISTAKES=80;
export const MAX_REVIEWS=200;
export const MAX_CARD_BYTES=32768;
export const MAX_LOCATOR=80;
export const MAX_ITEMREF=60;
export const MAX_NOTE=100;
// 문제 내용을 담을 수 있는 이름. 모델의 어느 층(카드·세션·오답·복습)에도 있으면 안 된다(시험이 각 층에 넣어 보고 거부를 확인).
export const FORBIDDEN_KEY_NAMES=Object.freeze(['question','questionText','body','problem','problemText','choices','options','answer','answerText','correctAnswer','explanation','solution','passage','prompt','text']);
const KST_MS=9*3600000;
const DAY_MS=86400000;

const ID=/^[A-Za-z0-9_-]{1,40}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// itemRef = 출처 표기 + ':' + 번호(영문·숫자·점·밑줄·하이픈). 한글·공백이 없어 문제 문장을 넣을 수 없다.
const ITEMREF=new RegExp('^(?:'+PROVENANCE.join('|')+'):[A-Za-z0-9._-]{1,30}$');
const RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
export const studyIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
export const dateKeyOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const isoOK=v=>typeof v==='string'&&ISO.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const kstDate=iso=>new Date(Date.parse(iso)+KST_MS).toISOString().slice(0,10);
export const dayNumber=date=>Math.round(Date.parse(date+'T12:00:00Z')/DAY_MS);
export const shiftDay=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY_MS).toISOString().slice(0,10);

// required 키는 모두 있어야 하고, optional 외의 키는 없어야 한다(여분 필드 거부). 프로토타입이 Object.prototype인 일반 객체만.
function shape(v,required,optional=[],code='INVALID_STUDY_SCHEMA'){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
  const keys=Object.keys(v);
  requireValue(required.every(k=>keys.includes(k))&&keys.every(k=>required.includes(k)||optional.includes(k)),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_STUDY_TEXT');
}
const minutes=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=1440;
const nearDate=(date,iso)=>Math.abs(dayNumber(kstDate(iso))-dayNumber(date))<=1;

function validateSession(s,date){
  shape(s,['id','subject','state','plannedMin','confirmedMin','restartLocator'],['at'],'INVALID_STUDY_SESSION');
  requireValue(studyIdOK(s.id),'INVALID_STUDY_ID');
  requireValue(SUBJECTS.includes(s.subject)&&SESSION_STATES.includes(s.state)&&minutes(s.plannedMin)&&minutes(s.confirmedMin),'INVALID_STUDY_SESSION');
  text(s.restartLocator,MAX_LOCATOR);
  if(Object.hasOwn(s,'at')){requireValue(isoOK(s.at),'INVALID_STUDY_TIME');requireValue(nearDate(date,s.at),'STUDY_TIME_OUTSIDE_CARD_DATE');}
}
function validateMistake(m){
  shape(m,['id','subject','itemRef','errorCode','evidence','note'],['reviewDue'],'INVALID_STUDY_MISTAKE');
  requireValue(studyIdOK(m.id),'INVALID_STUDY_ID');
  requireValue(SUBJECTS.includes(m.subject)&&ERROR_CODES.includes(m.errorCode)&&EVIDENCE_STATUS.includes(m.evidence),'INVALID_STUDY_MISTAKE');
  requireValue(typeof m.itemRef==='string'&&m.itemRef.length<=MAX_ITEMREF&&ITEMREF.test(m.itemRef),'INVALID_STUDY_ITEMREF');
  text(m.note,MAX_NOTE);
  if(Object.hasOwn(m,'reviewDue'))requireValue(dateKeyOK(m.reviewDue),'INVALID_STUDY_DATE');
}
// 복습: 아직 안 한 행(doneAt=null, result=null)도 모양상 허용하지만 화면은 하지 않은 복습 행을 만들지 않는다(투영은 doneAt=null 행을 무시).
// nextDue는 선택. 없으면 닫힌 것(졸업이거나 소유자가 다음 날짜를 안 정함, Codex 투영 규칙). 단계 계산(study-schedule)은 result만 쓰고 nextDue·날짜 값은 저장된 그대로 둔다.
function validateReview(r){
  shape(r,['id','mistakeId','doneAt','result'],['nextDue'],'INVALID_STUDY_REVIEW');
  requireValue(studyIdOK(r.id)&&studyIdOK(r.mistakeId),'INVALID_STUDY_ID');
  requireValue(r.doneAt===null||isoOK(r.doneAt),'INVALID_STUDY_TIME');
  requireValue(r.result===null||RESULTS.includes(r.result),'INVALID_STUDY_REVIEW');
  requireValue((r.doneAt===null)===(r.result===null),'INVALID_STUDY_REVIEW');
  if(Object.hasOwn(r,'nextDue')){
    requireValue(r.doneAt!==null&&dateKeyOK(r.nextDue),'INVALID_STUDY_DATE');
    requireValue(r.nextDue>=kstDate(r.doneAt),'INVALID_STUDY_NEXT_DUE');   // 복습한 날(KST)보다 앞설 수 없다
  }
}
export function cardBytes(d){return new TextEncoder().encode(JSON.stringify(d)).length;}
function uniqueIds(list,code){const seen=new Set();for(const x of list){requireValue(!seen.has(x.id),code);seen.add(x.id);}}
function validateDay(id,d){
  shape(d,['date','sessions','mistakes','reviews','confirmCount']);
  requireValue(dateKeyOK(id)&&d.date===id,'INVALID_STUDY_DATE');
  requireValue(typeof d.confirmCount==='number'&&Number.isInteger(d.confirmCount)&&d.confirmCount>=1&&d.confirmCount<=9999,'INVALID_STUDY_CONFIRM_COUNT');
  requireValue(Array.isArray(d.sessions)&&d.sessions.length<=MAX_SESSIONS,'STUDY_SESSION_LIMIT');
  requireValue(Array.isArray(d.mistakes)&&d.mistakes.length<=MAX_MISTAKES,'STUDY_MISTAKE_LIMIT');
  requireValue(Array.isArray(d.reviews)&&d.reviews.length<=MAX_REVIEWS,'STUDY_REVIEW_LIMIT');
  for(const s of d.sessions)validateSession(s,d.date);
  for(const m of d.mistakes)validateMistake(m);
  for(const r of d.reviews)validateReview(r);
  uniqueIds(d.sessions,'DUPLICATE_STUDY_SESSION_ID');uniqueIds(d.mistakes,'DUPLICATE_STUDY_MISTAKE_ID');uniqueIds(d.reviews,'DUPLICATE_STUDY_REVIEW_ID');
  // 복습이 같은 카드의 오답을 가리키면 그 오답이 있어야 하는 것은 당연하지만, 다른(이전) 카드의 오답을 가리킬 수도 있으므로 여기서는 거부하지 않는다 — 고아(가리키는 오답이 어느 카드에도 없음)는 투영이 표시한다.
  requireValue(cardBytes(d)<=MAX_CARD_BYTES,'STUDY_CARD_TOO_LARGE');
}
export function validateStudyData(type,id,d){
  requireValue(STUDY_TYPES.includes(type)&&studyIdOK(id),'INVALID_ENTITY_ID');
  validateDay(id,d);
}

// 카드 확정 시점 검사: 개수 한도, confirmCount(새 카드는 1, 고칠 때마다 +1).
export function studyTransition(v,old,ctx){
  const {entityType:type,data:d}=v;
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<STUDY_LIMITS[type],'APP_ENTITY_LIMIT');
  requireValue(d.confirmCount===(old?old.data.confirmCount+1:1),'STUDY_CONFIRM_COUNT_MISMATCH');
}
// 이력 화면·백업 요약 제목(항상 문자열). 문제·메모 내용은 제목에 쓰지 않는다.
export function studyTitle(v){return '공부 기록 · '+v.data.date;}
// wholeLifeView가 싣는 원자료: 엔티티 그대로(heads 포함). 최신 날짜가 앞.
export function studyRawView(entities){
  const days=[];
  for(const e of entities)if(e.entityType==='STUDY_DAY')days.push({date:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
  days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  return {days};
}
