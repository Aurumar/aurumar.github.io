// 오늘 화면 Core + 습관 편집 + 지난 날짜 보기 (B41). 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음).
// 열기·동기화만으로는 아무것도 쓰지 않는다. 입력은 이 기기의 임시 저장(연산 0)에 모이고, "오늘 쌓기"를 눌러야 하루 카드 1장이 쌓인다(연산 1).
// 기본 습관·과목·시험 일정은 코드 상수를 보여 줄 뿐이며, 소유자가 편집 화면에서 "저장"을 누를 때만 엔티티가 된다.
// 공부 벽돌은 기존 공부 모듈(STUDY_DAY)의 세션으로 기록한다(ctx.study 포트).
import {chip,toggle,sheet,xpBar,ring} from './ui-kit.mjs';
import {LifeFlow,createLifePorts,saveDefinitions,DEFS_SEALED_TEXT,collectRows,stackDay,STACK_DONE} from './life-flow.mjs';
import {achieve,atDiaryDay,previewAchieve,habitXpToday,multText,habitBoard} from './life-achieve.mjs';
import {todayQuestLine} from './life-quest.mjs';
import {timerElapsedMin,timerRecordMin,liveTick,cardMinutes,countedMinutes} from './study-stage.mjs';
import {DAILY_CHARS,dailyCharOf,dailyLineText,todayMinutes as studyTodayMinutes,lifetimeMinutes,stageOf,AVATAR_ART_READY,hmText as stageHm} from './study-stage.mjs';   // V6F: 오늘 탭의 오늘의 캐릭터
import {OVERLAP_NOTICE,TIMER_OVERLAP_NOTICE} from './study-rebase.mjs';
import {sameContent} from './life-rebase.mjs';   // FIX71: 성취표 칸 얹기(습관 벽돌 기준 비교)
import {renderLive,liveRecordMin,liveElapsedMin,liveSettings,REST_SPLIT_MS} from './study-live.mjs';
import {dailyCharStrip} from './study-live.mjs';   // V7A: 오늘의 캐릭터 13단계 띠 + 눌러서 미리보기
import {dayRoomCard,CELEBRATED_KEY} from './study-room.mjs';
import {brickCells} from './study-room.mjs';   // DS1: 오늘 벽돌 칸(공부방 기둥과 같은 금 벽돌 스프라이트)
import {examLineText,daySummary,barsText,ddayChips,ddayChipsNode,readDdayActive,writeDdayActive,ddayGauge,ddayGaugeNode,maker as planMaker,planOf,dayPlanLink,writePlanMarks,BLOCK_TEXT} from './life-plan.mjs';
import {diaryEntryState,renderDiaryEntry,openDiarySheet,diaryDayRow,diaryErrorText} from './diary-ui.mjs';   // FIX49B: 일기 입구·시트(쓰기 문이 열렸을 때만)
import {LOG_LIMIT_CODE,LOG_LIMIT_TEXT} from './fin-ledger.mjs';   // OPS1A: LOG_LIMIT 전용 문구(한 곳에서)
import {HABIT_KINDS,HABIT_AREAS,DAY_TYPES,MAX_NAME,MAX_NOTE,SUBJECT_COLOR_KEYS,HABIT_HINTS,
  kstDate,diaryOpenDate,shiftDay,dateKeyOK,dayNumber,hhmmFromIso,timeOK,targetTimeOK,lifeIdOK,
  brickOf,sumBricks,entryDone,nearestExam,lifeDefs,weekCount,studyCodeOf,sessionIdFor,timerSessionId,timerTagFrom,subjectOfSession,emptyDay,
  SUBJECT_PALETTE,NEW_SUBJECT_COLOR,subjectColor,defaultSubjectColor,parseSubjectHex,nearSubjectPairs,habitPinned,habitState,MISSED_ENTRY,HABIT_UNPIN_ORDER,validateLifeData,DEFAULT_HABITS} from './life-model.mjs';
import {LIFE_CLEAR_TYPES,LIFE_CLEAR_KIND,emptyLifeRecord,lifeRecordEmpty,lifeRecordOf,lifeRecordSummary,lifeClearDate,lifeClearCheckDate} from './life-model.mjs';   // V7D2: 기록별 비우기
import {emptyStudyDay,studyDayEmpty} from './study-model.mjs';
import {emptyHltDay,hltDayEmpty} from './hlt-model.mjs';

export const EXAM_NONE_AHEAD='다가올 시험이 없어요 · 습관 편집에서 다음 시험을 넣으면 디데이가 다시 보여요.';
export const LIFE_ERROR_TEXT=Object.freeze({
  INVALID_LIFE_MINUTES:'분은 1~1440의 정수로 넣어 주세요.',STUDY_OFF:'공부 기능이 꺼져 있습니다. 설정에서 켜세요.',
  INVALID_LIFE_ENTRY:'습관 값이 올바르지 않습니다. 시각은 00:00~23:59, 분은 0~1440, 횟수는 0~99입니다.',
  LIFE_HABIT_LIMIT:'하루 카드에는 습관을 60개까지만 기록할 수 있습니다.',
  LIFE_CARD_TOO_LARGE:'오늘 카드가 너무 큽니다(16KB). 한 줄 메모를 줄여 주세요.',
  INVALID_LIFE_TEXT:'글자 수를 확인하세요(한 줄은 200자, 이름은 20자까지).',
  INVALID_HABIT_DEF:'습관 정의가 올바르지 않습니다.',INVALID_HABIT_TARGET:'목표 값이 올바르지 않습니다(시각 HH:MM, 분 1~1440, 횟수 1~99).',
  APP_ENTITY_LIMIT:'개수 한도에 닿았습니다.',LIFE_HABIT_KIND_IMMUTABLE:'습관의 종류는 바꿀 수 없습니다. 새 습관을 만드세요.',
  INVALID_SUBJECT_DEF:'과목 정의가 올바르지 않습니다.',INVALID_EXAM_ITEM:'시험 일정이 올바르지 않습니다(이름 1~20자, 실제 날짜).',EXAM_ITEM_LIMIT:'시험 일정은 12개까지입니다.',
  STALE_HEADS:'다른 기기에서 먼저 바뀌었습니다. 다시 받아 합친 뒤 쌓으세요.',
  DEFS_CHANGED_ELSEWHERE:'다른 기기에서 바뀌었어요 — 다시 열어 확인해 주세요. 같은 칸을 양쪽에서 고쳐 저장하지 않았어요.',   // DSFIX D1
  MD_NOT_WRITE_READY:'지금은 서버에 쌓을 수 없습니다. 입력은 이 기기에 남아 있습니다.',
  ABORTED:'서버가 이 쌓기를 받지 않았습니다(기록되지 않음) · 입력은 그대로 있습니다. 다시 쌓을 수 있습니다.',
  INVALID_TIMER_END:'끝난 시각은 시작 뒤 24시간 안이고 지금보다 앞이어야 합니다.',
  INVALID_TIMER_END_REST:'끝난 시각은 휴식을 시작한 시각보다 늦을 수 없습니다.',
  HLT_NAP_FUTURE:'낮잠이 끝난 시각이 지금보다 뒤라 기록하지 않았어요 · 시작 시각이나 분을 줄여 주세요.',   // FIX68 (HUNT65 F6)
  [LOG_LIMIT_CODE]:LOG_LIMIT_TEXT,   // OPS1A: 금고 평생 연산 10,000에 닿음(초안은 그대로)
});
export const lifeErrorText=code=>LIFE_ERROR_TEXT[code]??(code?'처리하지 못했어요 · 입력은 그대로 있습니다.'+' · 문의 코드 ▾\u2060'+code+'\u2060':'쌓지 못했습니다.');
export const LIFE_NOTICE_TEXT=Object.freeze({
  REBASE_CONFLICT_KEPT_REMOTE:'내가 되돌린 습관을 다른 기기에서 고쳐서 상대 수정을 남겼습니다.',
  REBASE_CONFLICT_KEPT_LOCAL:'다른 기기에서 지운 습관을 내가 고쳐서 내 수정으로 되살렸습니다.',
  REBASE_VALUE_OVERWRITTEN:'같은 습관을 양쪽에서 고쳤습니다 · 내 값을 썼고 상대 값은 이력에 남아 있습니다.',
  REBASE_SCALAR_OVERWRITTEN:'기분·한 줄·하루 종류를 양쪽에서 고쳤습니다 · 내 값을 썼고 상대 값은 이력에 남아 있습니다.',
  [OVERLAP_NOTICE]:'PC 측정으로 담은 시간이 타이머 시간과 겹칩니다 · 같은 시간이 두 번 세어질 수 있어요(자동으로 지우지 않았어요) · 공부 화면에서 한쪽을 지울 수 있어요.',
  [TIMER_OVERLAP_NOTICE]:'두 기기의 타이머 시간이 서로 겹칩니다 · 같은 시간이 두 번 세어질 수 있어요(자동으로 지우지 않았어요) · 공부 화면에서 한쪽을 지울 수 있어요.',
});
const STATUS_TEXT=Object.freeze({
  CONFIRMED:'저장 및 동기화 확인됨 · 쌓았습니다.',ALREADY_APPLIED:'이미 반영되어 있습니다 · 새로 저장하지 않았습니다.',NOTHING_TO_CONFIRM:'쌓을 입력이 없습니다.',
  UNKNOWN:'서버 응답을 확인하지 못했습니다 · 입력은 그대로 있습니다. 다시 쌓기를 누르면 결과를 확인한 뒤 이어서 처리합니다(중복 저장 없음).',
  SYNC_FAILED:'서버에서 최신 기록을 받지 못했습니다 · 입력은 그대로 있습니다.',FAILED:'저장하지 못했습니다 · 입력은 그대로 있습니다.',STALE:'다른 기기와 계속 겹쳐 쌓지 못했습니다 · 입력은 그대로 있습니다.',
});
// FIX59F (HUNT57 HS57-2·HS57-3): 같은 기기 다른 창 때문의 CARD_DRAFT_NOT_FOUND 결과 문구. 흐름이 금고·초안을 견준 결과(elsewhere·restored·lostInput)대로만 말한다.
export const DRAFT_GONE_TEXT=Object.freeze({
  elsewhere:'다른 창에서 이미 저장됐어요 · 새로 저장하지 않았습니다.',
  restored:'저장하지 못했어요 — 입력을 다시 넣어 두었어요, 다시 저장해 주세요.',
  lostInput:'저장하지 못했어요 · 다른 창에서 이 입력을 바꾸거나 지웠어요. 화면을 확인하고 다시 입력해 주세요.',
});
export const TIMER_KEY='lb.life.timer',TIMER_END_KEY='lb.life.timer.end',TIMER_REST_KEY='lb.life.timer.rest',TIMER_TAG_KEY='lb.life.timer.tag';
const MIN_MS=60000,KST_MS=9*3600000,MAX_TIMER_MS=1440*MIN_MS;
const TIMER_SUGGEST_MS=3*3600000,TIMER_LOOKBACK_DAYS=400;   // FIX34 (H5): "언제 끝났나요" 기본 제안(시작 + 최대 3시간) · 이미 담았는지 찾아보는 날 수의 상한(깨진 시작 시각에도 끝나게)
const MOODS=Object.freeze([[1,'😞','많이 힘듦'],[2,'🙁','별로'],[3,'😐','보통'],[4,'🙂','좋음'],[5,'😄','아주 좋음']]);
const DURATION_CHIPS=Object.freeze([5,10,15,20,30]);
// FIX44 (AUD1 #13): 목표 값 칩을 맨 앞에 둔다(일폭 15분이 칸 밖으로 밀리지 않게). 목록에 없는 목표는 앞에 더한다.
export const durationChips=target=>Number.isInteger(target)&&target>0?[target,...DURATION_CHIPS.filter(m=>m!==target)]:[...DURATION_CHIPS];
const KIND_TEXT=Object.freeze({TIME:'시각',CHECK:'체크',DURATION:'분',COUNT:'횟수',RECOVERY:'복구'});
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'});
const DAY_TYPE_TEXT=Object.freeze({NORMAL:'보통',DETOX:'디톡스',REST:'쉬는 날'});
const DIFF_TEXT=Object.freeze({AUTO:'자동',1:'1 쉬움',2:'2',3:'3',4:'4 어려움'});
const WEEKDAY=['일','월','화','수','목','금','토'];
export const dateLabel=d=>{const dt=new Date(d+'T12:00:00Z');return (dt.getUTCMonth()+1)+'월 '+dt.getUTCDate()+'일 ('+WEEKDAY[dt.getUTCDay()]+')';};

function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const hint=text=>el('p',text,'muted small');
  const input=(value='',attrs={},type='text')=>{const n=el('input');n.type=type;n.value=value;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const select=(options,value)=>{const n=el('select');for(const [v,t] of options){const o=el('option',t);o.value=String(v);n.append(o);}n.value=String(value);return n;};
  const field=(label,control)=>add(el('label',label),control);
  return {el,add,button,hint,input,select,field};
}
const int=s=>typeof s==='string'&&/^\d+$/.test(s.trim())?Number(s.trim()):NaN;

export function createLifeState(){return {today:null,flow:null,ports:null,boxRef:null,flowState:null,studyCard:null,pending:[],subjectId:null,timer:null,message:null,error:false,notices:[],pastDate:null,editing:false,floatXp:null,liveOpen:false,diary:null,diaryFlow:null,diaryPorts:null,diaryPortsOf:null,diaryMessage:null,diaryNotices:[]};}

// B2C (DEFECT-6): 상자 쓰기 실패는 save가 던지지 않는다(설계). 버튼이 끝났을 때 오늘 카드·공부 벽돌 초안이 실패 상태면 성공 문구 대신 실패 문구를 보인다. 쌓기가 성공하면 초안이 지워져 has가 거짓이다.
// R33B (HUNT32 S1): 그 칸 자체의 실패(own)만 본다. 다른 날짜·종류 초안의 실패는 위쪽 상자 전체 빨간 줄이 따로 알린다.
function flagBoxFail(st,date){
  const box=st.ports?.box;
  for(const kind of ['LIFE_DAY','STUDY_DAY']){const b=box?.statusFor(kind,date);if(b?.has&&b.own&&!st.error){st.message=box.ERROR_TEXT[b.own]??box.TEXT.failed;st.error=true;}}
}
// FIX70 (HUNT67 F2, 통제탑 2026-11-11): 칸 입력은 이 기기 상자에 확실히 남았을 때만 초안으로 묶는다(자동 쌓기). 상자 저장이 실패·STALE(같은 기기 다른 창)이면
// 이 창을 닫을 때 입력이 사라지므로 예전처럼 바로 쌓는다(그날 카드 1장 = 연산 1). memory = 상자가 없는 환경(메모리 초안)도 바로 쌓을지
// (성취표 = OPS1A가 새로 묶은 길이라 예. 오늘 탭 칩 = V6F부터 메모리 초안 + 화면 안내 그대로라 아니오).
// 쌓기는 기존 그날 카드 1장 쌓기 핸들러(stackAt)의 only 조건으로 한다(쌓기·결과 알림 지점이 늘지 않음).
function draftLoose(st,date,{memory=true}={}){
  const box=st.ports?.box;if(!box)return memory&&st.ports?.persistent===false;
  const b=box.statusFor('LIFE_DAY',date);return Boolean(b?.has&&(b.dirty||b.own));
}
// FIX34 (HUNT34 H4): endIso = 첫 "끝내고 담기"를 누른 시각. 담기가 실패하고 앱을 닫아도 다시 누를 때 이 시각을 쓴다(누른 시각까지 분이 부풀지 않게). 이 기기 저장소 값이고 기록 형식이 아니다.
// 시작 시각 칸(TIMER_KEY)은 그대로 두고 옆 칸(TIMER_END_KEY)에 어느 타이머의 끝인지 함께 적는다(다른 타이머의 끝 시각을 쓰지 않게).
function readTimerEnd(storage,startIso){try{const e=JSON.parse(storage?.getItem(TIMER_END_KEY)??'null');return e?.startIso===startIso&&typeof e.endIso==='string'&&Date.parse(e.endIso)>=Date.parse(startIso)?{endIso:e.endIso}:{};}catch{return {};}}
// S1A: 휴식 칸 = {startIso, restMs(지난 휴식 합), pausedAt(지금 휴식의 시작, 없으면 null)}. 끝 시각 칸처럼 startIso로 묶어 다른 타이머 값을 쓰지 않는다. 기록 형식이 아니다(어디에도 기록하지 않음).
function readTimerRest(storage,startIso){
  try{
    const r=JSON.parse(storage?.getItem(TIMER_REST_KEY)??'null');if(r?.startIso!==startIso)return {};
    const restMs=Number.isInteger(r.restMs)&&r.restMs>0&&r.restMs<=MAX_TIMER_MS?r.restMs:0,p=typeof r.pausedAt==='string'?Date.parse(r.pausedAt):NaN;
    return {...(restMs?{restMs}:{}),...(Number.isFinite(p)&&p>=Date.parse(startIso)?{pausedAt:r.pausedAt}:{})};
  }catch{return {};}
}
// P1B: 오늘 계획 카드의 [▶ 집중]으로 시작한 타이머는 어느 줄인지(itemId)도 함께 적는다(기기 저장소 화면 값, 기록 아님). 없으면 예전 모양 그대로.
const itemIdOf=v=>typeof v?.itemId==='string'&&v.itemId?{itemId:v.itemId}:{};
// FIX40 (HUNT35 H7): 세션 id 접미(timerSessionId). 시작할 때 정해 끝 시각·휴식 칸처럼 옆 칸에 startIso로 묶어 둔다(앱을 다시 켜도 같은 타이머 = 같은 id). 이 기기 저장소 값이고 기록 형식이 아니다. 없으면 옛 타이머다(옛 id).
const newTimerTag=ctx=>{const tag=timerTagFrom(ctx.uid?.());return tag?{tag}:{};};
// 이 저장소에서 마지막으로 본 접미. 다른 탭이 끝내 칸이 지워진 뒤 메모리 값으로 남은 같은 타이머도 같은 id가 되게 한다(두 번 담지 않음).
const seenTag=new WeakMap();
const lastTag=(storage,startIso)=>{const s=storage?seenTag.get(storage):null;return s?.startIso===startIso?s.tag:undefined;};
function readTimerTag(storage,startIso){try{const r=JSON.parse(storage?.getItem(TIMER_TAG_KEY)??'null');return r?.startIso===startIso&&typeof r.tag==='string'&&/^[0-9a-z]{1,8}$/.test(r.tag)?{tag:r.tag}:{};}catch{return {};}}
// FIX37C (H37-S3): 저장소에 있다고 확인한 타이머 값. 이런 값은 저장소가 기준이다(다른 탭이 끝내거나 취소하면 저장소에서 사라진다). 쓰기가 막혀 메모리에만 있는 값은 여기 없으므로 지워지지 않는다(FIX31 D1).
const onDisk=new WeakSet();
function readTimer(storage){try{const v=JSON.parse(storage?.getItem(TIMER_KEY)??'null');if(!(v&&typeof v.subjectId==='string'&&typeof v.startIso==='string'&&Number.isFinite(Date.parse(v.startIso))))return null;const t={subjectId:v.subjectId,startIso:v.startIso,...itemIdOf(v),...readTimerTag(storage,v.startIso),...readTimerEnd(storage,v.startIso),...readTimerRest(storage,v.startIso)};if(t.tag)seenTag.set(storage,{startIso:t.startIso,tag:t.tag});onDisk.add(t);return t;}catch{return null;}}
function writeTimer(storage,t){
  try{
    if(!t){storage?.removeItem(TIMER_KEY);storage?.removeItem(TIMER_END_KEY);storage?.removeItem(TIMER_REST_KEY);storage?.removeItem(TIMER_TAG_KEY);storage?.removeItem(CELEBRATED_KEY);return;}   // S1B: 끝내거나 취소하면 축하 칸도 지운다
    storage?.setItem(TIMER_KEY,JSON.stringify({subjectId:t.subjectId,startIso:t.startIso,...itemIdOf(t)}));
    if(t.tag&&storage)seenTag.set(storage,{startIso:t.startIso,tag:t.tag});
    if(t.tag)storage?.setItem(TIMER_TAG_KEY,JSON.stringify({startIso:t.startIso,tag:t.tag}));else storage?.removeItem(TIMER_TAG_KEY);
    if(t.endIso)storage?.setItem(TIMER_END_KEY,JSON.stringify({startIso:t.startIso,endIso:t.endIso}));else storage?.removeItem(TIMER_END_KEY);
    if(t.restMs||t.pausedAt)storage?.setItem(TIMER_REST_KEY,JSON.stringify({startIso:t.startIso,restMs:t.restMs??0,pausedAt:t.pausedAt??null}));else storage?.removeItem(TIMER_REST_KEY);
    if(storage)onDisk.add(t);
  }catch{/* 저장소가 막혀 있으면 이번 실행 동안만 */}
}
// 메모리 타이머를 저장소에 맞춘다(다시 읽을 때·타이머 칸을 쓰기 전).
// V9B: 위젯 파일 집중 상태(focus)용 읽기 전용 창구(앱이 widget_status.json을 만들 때 부른다). 기록 형식이 아니다.
export const readTimerState=storage=>readTimer(storage);
function currentTimer(st,storage){
  if(!st.timer||onDisk.has(st.timer))st.timer=readTimer(storage);
  return st.timer;
}

// 공부 포트: 앱이 {ui,st,ctx}를 넘긴다(공부 모듈이 꺼져 있으면 null).
async function studyFlow(ctx){
  const s=ctx.study?.();if(!s)return null;
  if(!s.st.flow)await s.ui.prepareStudy(s.ctx(),s.st);
  return s.st.flow?s:null;
}
// gone() = 준비를 시작한 뒤 로그아웃 세대가 바뀌었다(참이면 늦게 끝난 상태를 공유 st에 넣지 않는다).
export async function prepareLife(ctx,st,gone=()=>false){
  if(ctx.locked?.())return st;   // FIX37C (H37-S2): 잠긴 동안 끝난 담기 등이 lockLife가 비운 값을 다시 채우지 않게
  st.today=kstDate(ctx.now());
  const box=ctx.cardDraftBox?.()??null;
  if(!st.flow||st.boxRef!==box){st.boxRef=box;st.ports=createLifePorts(ctx);st.flow=new LifeFlow(st.ports);}
  let [flowState,dates]=await Promise.all([st.flow.state(st.today),st.flow.draftDates()]);
  let studyCard=null;
  try{const s=await studyFlow(ctx);if(s)studyCard=(await s.st.flow.state(st.today));}catch{studyCard=null;}
  let diary;try{diary=await diaryEntryState(ctx,st);}catch{diary={open:false};}   // FIX49B: 문이 닫혀 있으면 {open:false}(입구 0, 옛 칸 그대로)
  if(gone())return st;
  // OPS1A: 성취표가 지난 날 칸도 초안에만 둔다(앱이 autoStack을 켰을 때) → 쌓지 않은 지난 날 카드를 모두 세고 쌓는다(pendingAll). 성취표는 그 초안 카드를 바로 보인다(draftCards).
  let draftCards={},draftStates={};   // FIX71: draftStates = 그 초안의 base·바꾼 칸(성취표가 쌓인 카드 위에 칸 단위로 얹는다). draftCards는 그대로(자동 쌓기 key)
  // V7D1: 새 시작 기준 전 날짜의 초안은 쌓기 대상·성취표에서 빼고 "새 시작 전 초안"(freshDrafts)으로만 센다(지우지 않음).
  const before=d=>Boolean(ctx.freshBefore?.(d)),freshDrafts=dates.filter(before);dates=dates.filter(d=>!before(d));
  if(ctx.autoStack){try{for(const d of dates)if(d!==st.today){const s=await st.flow.state(d);if(s?.status==='LOCAL_DRAFT'){draftCards[d]=s.card;draftStates[d]=s;}}}catch{draftCards={};draftStates={};}}
  if(gone())return st;
  st.flowState=flowState;st.studyCard=studyCard;st.diary=diary;
  st.pending=dates.filter(d=>d<st.today).slice(-3);st.pendingAll=dates.filter(d=>d<st.today);st.draftCards=draftCards;st.draftStates=draftStates;st.freshDrafts=freshDrafts;
  currentTimer(st,ctx.storage??globalThis.localStorage);
  return st;
}
// ---- V6F (지시서 1): "오늘 쌓기"를 눌러야만 기록되는 함정 없애기 ----
// 왜 두 단계였나(코드 근거): 하루 입력은 이 기기 초안(연산 0)에 모이고 "쌓기" 1번 = 그날 카드 1장 확정 = 서버 연산 1(금고 평생 10,000, fin-ledger VAULT_OP_LIMIT).
// 누를 때마다 쓰면 연산이 빨리 닳아서 모아 쌓게 했다. 계약(서버로 가는 단위 = 그날 카드 1장, 다시 쌓으면 같은 카드를 rebase해 다시 확정)은 그대로 두고,
// 입력이 멈추고 AUTO_STACK_MS가 지나면 같은 "오늘 쌓기" 동작을 자동으로 한 번 부른다(입력이 이어지면 기다림을 다시 시작 = 묶어서 연산 1).
// 임시 저장(봉인) 모드·잠김이면 자동으로 쌓지 않는다(줄에 "아직 안 쌓은 입력"이 보이고 직접 쌓을 수 있다). 앱이 ctx.autoStack을 켜야만 동작한다(시험·옛 경로는 그대로).
// EXP1 (통제탑 결정): 기다림 60초 → 300초(5분). 금고 연산은 평생 10,000이라 하루 5~10회면 3년 안에 닿는다. 아침에 몰아 누르는 입력을 한 번에 묶는다.
export const AUTO_STACK_MS=300000;
export const AUTO_STACK_TEXT=Object.freeze({soon:'5분 안에 자동으로 쌓여요',line:n=>'아직 안 쌓은 입력 '+n+'개',now:'지금 쌓기',held:'임시 저장 모드라 자동으로 쌓지 않아요'});
export function clearAutoStack(st){if(!st)return;if(st.autoTimer)(globalThis.clearTimeout)(st.autoTimer);st.autoTimer=null;st.autoKey=undefined;}
// FIX70 (HUNT67 O1, 통제탑 2026-11-11): 기다림은 "마지막 입력(초안 변경) 뒤 5분"이다. key = 지금 쌓지 않은 입력의 내용(오늘·공부·지난 날 초안 카드 +
// 앱이 넘기는 건강·계획 초안, ctx.pendingKey). 같은 key로 다시 부르면(화면 다시 그리기·탭 이동·동기화 뒤 다시 그리기) 도는 기다림을 다시 시작하지 않고
// 부를 동작만 새 것으로 바꾼다. 내용이 바뀌었거나(새 입력) key가 null이면 예전처럼 다시 시작한다(한 줄 입력을 치는 중은 지운 뒤 다시 건다).
export function autoStackKey(ctx,st){
  const fs=st?.flowState;
  try{return JSON.stringify([fs?.status==='LOCAL_DRAFT'?fs.card:null,st?.studyCard?.status==='LOCAL_DRAFT'?st.studyCard.card:null,st?.pendingAll??st?.pending??[],st?.draftCards??{},ctx?.pendingKey?.()??null]);}catch{return null;}
}
// OPS1A: 앱도 이 함수로 오늘 화면 밖(계획·기록·건강)의 쌓지 않은 입력을 같은 기다림(같은 st.autoTimer 한 칸)으로 쌓는다 → 타이머는 언제나 1개.
export function scheduleAutoStack(ctx,st,run,key=autoStackKey(ctx,st)){
  if(ctx.autoStack&&st.autoTimer&&key!==null&&st.autoKey===key){st.autoRun=run;return;}   // FIX70 (O1): 입력이 그대로면 기다림 그대로
  clearAutoStack(st);if(!ctx.autoStack)return;
  st.autoKey=key;st.autoRun=run;
  const id=globalThis.setTimeout(()=>{st.autoTimer=null;st.autoKey=undefined;if(ctx.locked?.())return;void (async()=>{try{if(await ctx.draftMode?.()){st.autoHeld=true;await ctx.rerender?.();return;}}catch{return;}st.autoHeld=false;(st.autoRun??run)();})();},AUTO_STACK_MS);
  id?.unref?.();st.autoTimer=id;
}
// 쌓지 않은 하루 카드 수(오늘 카드 초안 + 오늘 공부 초안 + 어제 이전 초안 날짜). 화면 어디서나 보이는 줄이 쓴다.
// OPS1A: 어제 이전 초안 날짜는 화면 안내(st.pending, 최근 3일)가 아니라 전부(st.pendingAll)를 센다(성취표로 지난 날 칸을 고친 초안 포함).
export function pendingStackCount(st){if(!st?.flowState)return 0;return (st.flowState.status==='LOCAL_DRAFT'?1:0)+(st.studyCard?.status==='LOCAL_DRAFT'?1:0)+((st.pendingAll??st.pending)?.length??0);}
// FIX37C (H37-S2): 잠금·로그아웃. 덮개 째깍·벽돌 사건을 멈추고 메모리 값을 비운다. 저장소는 쓰지 않는다(타이머 칸은 그대로라 잠금을 풀면 prepareLife가 다시 읽는다).
export function lockLife(st){
  if(!st)return;clearAutoStack(st);
  st.liveStop?.();st.liveStop=null;st.endSheet=null;
  st.timer=null;st.liveOpen=false;st.flowState=null;st.studyCard=null;st.pending=[];st.pendingAll=[];st.draftCards={};st.draftStates={};st.message=null;st.error=false;st.focusNote=null;st.diary=null;st.diaryMessage=null;st.diaryNotices=[];st.linkNote=null;
}

function entryFor(h,{now,minutes,count}={}){
  if(h.kind==='TIME')return {done:true,at:now,minutes:null,count:null};
  if(h.kind==='DURATION')return {done:true,at:now??null,minutes,count:null};   // 기록한 시각(일폭 기상 후 2시간 보너스 판정용)
  if(h.kind==='COUNT')return {done:true,at:null,minutes:null,count};
  return {done:true,at:null,minutes:null,count:null};
}
function habitValueText(h,e,week){
  if(h.kind==='COUNT'){const w=week!==null&&h.target.per==='WEEK'?' · 이번 주 '+week+'/'+h.target.count:'';return e?.count?e.count+'회'+w:'오늘 0회'+w;}
  if(!e||!entryDone(h,e))return h.kind==='TIME'&&h.target.time?'목표 '+h.target.time:h.kind==='DURATION'&&h.target.minutes?'목표 '+h.target.minutes+'분':'';
  if(h.kind==='TIME')return e.at;
  if(h.kind==='DURATION')return e.minutes+'분';
  return '했음';
}

const QUEST_MARK=Object.freeze({done:'✓ ',pending:'◐ ',todo:'○ '});
// Q1B: 줄 전체가 단추다. 누르면 오늘 퀘스트 시트(앱이 ctx.questSheet로 넘긴다).
function renderQuestLine({el,add,button},slot,line,open){
  if(!line.total){slot.hidden=true;return;}
  const go=button(null,open,'life-quest-open');go.dataset.navOnly='1';go.setAttribute('aria-haspopup','dialog');go.setAttribute('aria-label','오늘 퀘스트 '+line.done+' / '+line.total+' · 자세히 보기');
  add(go,el('strong','오늘 퀘스트 '+line.done+'/'+line.total,'life-quest-count'));
  for(const q of line.items)add(go,el('span',QUEST_MARK[q.state]+q.label+(q.state==='pending'?' · 쌓으면 완료':''),'life-quest-chip '+q.state));
  add(slot,add(go,el('span','›','life-quest-more')));
}

export function renderLifeToday(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,input}=h;
  const whole=ctx.getWhole(),life=whole.life??{habits:[],days:[],subjects:[],exams:null};
  const defs=lifeDefs(life),fs=st.flowState,date=st.today,card=fs.status==='LOCAL_DRAFT'?overlayDay(stackedDay(ctx,date),fs):fs.card,box=st.ports?.box??null,T=box?.TEXT;   // FIX71: 초안은 쌓인 카드 위에 칸 단위로
  const act=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{await fn();}catch(e){st.message=box?.ERROR_TEXT[e?.code]??lifeErrorText(e?.code);st.error=true;}flagBoxFail(st,date);await prepareLife(ctx,st);await ctx.rerender();});
  const out=add(el('section',null,'panel next-panel life-panel'),null);out.id='life-today';

  // 1) 머리: 날짜, 수능 + 다음 시험 D-day(FIX44, 계획 탭과 같은 글, 잠정 배지), 오늘 XP 링(쌓은 기록 기준), 연속·레벨 칩
  // V6A: D-day 두 칩(가까운 시험 먼저 · 최종 수능 보조), 계획 탭·STUDY LIVE와 같은 함수. 다가올 시험이 없으면 예전처럼 한 줄 글자.
  // V8W2-1·2: 칩을 누르면 그 칩이 활성(진하게, 이 기기에 기억 lb.dday.active), 활성 칩 아래 게이지(남은 몫 금 · 지나간 몫 빗금 · 남은 % · 주·개월 환산).
  const dd=ddayChips(defs.exams,date,readDdayActive(ctx.storage)),examText=examLineText(defs.exams,date),pickDday=role=>{writeDdayActive(ctx.storage,role);void ctx.rerender();};
  const examLine=dd.length?add(el('div',null,'life-exam'),ddayChipsNode(h,dd,'life-dday',pickDday),ddayGaugeNode(planMaker(doc),ddayGauge(defs.exams,dd.find(c=>c.main),date)),ctx.weekRange?.()??null):examText?add(el('div',null,'life-exam'),el('strong',examText,'life-dday'),hint(EXAM_NONE_AHEAD)):hint('시험 일정이 없습니다. 습관 편집에서 추가하세요.');   // V8FIX L-30: 지난 시험만 남으면 다음 시험 안내
  const money=ctx.money?.(date)??null,ach=atDiaryDay(achieve({life:whole.life??null,study:whole.study??null,fin:whole.fin??null,today:date,money}),diaryOpenDate(ctx.now())),topLevel=ach.levels[ach.topArea];   // FIX50A (HUNT49 C1): 일기 연속은 04:00 일기 날 기준
  const xpSlot=add(el('div',null,'life-xp-slot'),ring(ach.todayXp,ach.goalXp,{size:64}));xpSlot.id='xp-slot';xpSlot.setAttribute('aria-label','오늘 XP '+ach.todayXp+' / '+ach.goalXp);
  const chips=add(el('div',null,'life-chips'),el('span',ach.todayXp+' / '+ach.goalXp+' XP','life-xp-text'),(()=>{const n=el('span','연속 '+ach.streak.days+'일 '+multText(ach.streak.mult10),'life-chip-slot');n.id='streak-chip';return n;})(),(()=>{const n=el('span',AREA_TEXT[ach.topArea]+' Lv '+topLevel.level,'life-chip-slot');n.id='level-chip';return n;})());
  const title=ctx.achvTitle?.({doc,ach,life:whole.life??null,money,storage:ctx.storage});   // Q1C: 칭호 칩(앱이 넘긴다, 표시만)
  const healthText=ctx.healthLine?.(date)??null;   // FIX45 (AUD1 #9): 수면·걸음 한 줄(건강 모듈이 꺼져 있으면 없다)
  let healthNode=null;if(healthText){healthNode=el('p',healthText,'life-health-line');healthNode.id='today-health';}
  const napNode=renderNapLine(ctx,st,h,date);   // V6B: 수면·걸음 줄 아래 낮잠(건강 모듈이 켜졌을 때만)
  add(out,add(el('div',null,'life-head'),add(el('div',null,'life-head-main'),el('span','TODAY','eyebrow'),el('h2',dateLabel(date),'panel-title'),title?.node,examLine),add(el('div',null,'life-head-side'),xpSlot,chips,ctx.clearMenu?.('LIFE_DAY',date)??null)),   /* V7D2: 쌓은 오늘 카드의 ⋯ 메뉴 */
    summaryLine(ctx,h,{life,ach,date,study:whole.study??null}),healthNode,napNode,todayCharNode(ctx,st,h,whole,date));
  // 1-1) S1A: 집중 타이머가 돌면 맨 위에 작은 STUDY LIVE 카드(펼치면 덮개). 채우는 것은 아래 공부 벽돌 칸이 한다(타이머 동작이 그곳에 있다).
  const liveSlot=el('div',null,'live-slot');add(out,liveSlot);
  // Q1B: 달성 알림. 쌓기가 성공해 다시 읽은 뒤와 앱을 처음 열 때 이 화면이 그려지며 새 달성을 찾는다(쌓은 기록 기준, ach). 없으면 빈칸이다.
  const momentSlot=el('div',null,'achv-moment-slot');ctx.achvMoment?.(momentSlot,{doc,ach,today:date,life:whole.life??null,money,storage:ctx.storage});
  const questSlot=el('div',null,'life-quest-slot');add(out,momentSlot);   // Q1A: 오늘 퀘스트 줄(쌓기 전 예상을 함께 봐야 해서 아래에서 채운다). FIX44: 자리는 습관 바로 위

  // 2) 상태 줄
  const dirty=fs.status==='LOCAL_DRAFT';
  const chipText=()=>{
    const b=box?.statusFor('LIFE_DAY',date);
    if(b?.typing)return T.typing;
    if(b?.has)return '이 기기에만 있는 입력 · '+(b.dirty?(b.own?'아직 이 기기에 저장하지 못함':T.typing):T.saved);   // R33B (S1): 이 카드 자체의 실패만
    return dirty?'이 기기에만 있는 입력 (아직 쌓지 않음)':fs.status==='CONFIRMED'?'오늘 카드를 쌓았습니다 · 고치면 다시 쌓을 수 있어요':'아직 기록 없음';
  };
  const status=el('div',null,'life-status');add(out,status);
  // 안내(저장 상태·임시 저장 상자 없음·기본 습관·공부 담음)는 한 줄 요약 칩 1개로 모으고 눌러서 펼친다(B43). 실패·충돌 알림·어제 카드는 그대로 보인다.
  const infoMsg=st.message&&!st.error?st.message:null,extra=[];
  if(infoMsg)extra.push(chipText());
  if(st.ports?.persistent===false)extra.push('이 환경에는 임시 저장 상자가 없어 입력이 앱을 닫거나 새로고침하면 사라집니다. 쌓기 전에 닫지 마세요.');
  if(defs.usingDefaults.habits)extra.push('기본 습관 13개를 보여 주는 중입니다 · 습관 편집에서 저장하면 내 습관이 됩니다.');
  const moreText=extra.length-(infoMsg?1:0)>0?' · 안내 '+(extra.length-(infoMsg?1:0))+'개':'',summaryText=(infoMsg??chipText())+moreText;
  const stateEl=extra.length?el('summary',summaryText,'life-state'):el('p',summaryText,'life-state life-notes-chip');
  if(extra.length){const d=add(el('details',null,'life-notes'),stateEl);d.id='life-notes';for(const t of extra)add(d,el('p',t,'muted small'));add(status,d);}
  else add(status,stateEl);
  // B2C (DEFECT-7): 한 줄 입력은 다시 그리지 않는다(입력이 끊기지 않게). 저장이 끝나면 상태 줄만 고친다(건강 메모 칩과 같은 방식).
  const noteState=(bad=null)=>{stateEl.textContent=(bad??chipText())+moreText;};
  const boxFailText=box&&box.status().failed?box.ERROR_TEXT[box.status().failed]??T.failed:null;
  if(boxFailText)add(status,el('p',boxFailText,'notice error card-draft-failed'));
  if(st.message&&st.error&&st.message!==boxFailText)add(status,el('p',st.message,'notice error life-message'));   // 위 빨간 줄과 같은 문구는 두 번 보이지 않는다
  for(const n of st.notices)add(status,el('p',LIFE_NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060','notice life-notice'));
  // 자정 이후 첫 열기: 어제(또는 그 전) 쌓지 않은 입력이 있으면 한 번 눌러 쌓게 안내
  for(const d of st.pending)add(status,add(el('div',null,'notice life-yesterday'),el('span',(d===shiftDay(date,-1)?'어제':dateLabel(d))+' 카드를 아직 쌓지 않았어요. '),button((d===shiftDay(date,-1)?'어제':dateLabel(d))+' 카드 쌓기',stackAt(act,ctx,st,d),'primary')));

  // 3) 습관 격자(FIX44: 여기서는 만들기만 하고, 자리는 공부 벽돌 아래)
  const grid=el('div',null,'life-habits');
  const hs=defs.habits.filter(x=>!x.hidden),moreGrid=el('div',null,'life-habits life-habits-more');   // V6B: 고정한 습관만 바로 보이고 나머지는 "더 보기"
  if(!hs.length)add(grid,hint('보이는 습관이 없습니다. 습관 편집에서 추가하거나 숨김을 풀어 주세요.'));
  const floatXp=st.floatXp;st.floatXp=null;
  // FIX70 (F2): 칩 입력은 초안에 넣고, 앱이 묶을 때(autoStack) 상자에 확실히 남지 않았으면 그 자리에서 쌓는다(메모리 초안은 V6F 그대로 = 화면 안내).
  const setEntry=(hb,make)=>stackAt(act,ctx,st,date,async()=>{
    const wasDone=entryDone(hb,card.habits[hb.id]??null),entry=make();
    await st.flow.setHabit(date,hb.id,entry);
    if(!wasDone&&entry&&entryDone(hb,entry))st.floatXp={habitId:hb.id,text:'+'+habitXpToday(ach,hb.id)};   // 다시 그린 뒤 칸 위에 잠깐 보인다
  },()=>Boolean(ctx.autoStack)&&draftLoose(st,date,{memory:false}));
  for(const hb of hs){
    const e=card.habits[hb.id]??null,done=entryDone(hb,e),cell=el('div',null,'life-habit '+(done?'done':'todo')+' kind-'+hb.kind.toLowerCase());
    cell.dataset.habitId=hb.id;
    if(floatXp?.habitId===hb.id){const f=el('span',floatXp.text,'life-xp-float');f.setAttribute('aria-hidden','true');f.addEventListener('animationend',()=>f.remove());add(cell,f);}
    const week=hb.kind==='COUNT'&&hb.target.per==='WEEK'?weekCount(hb.id,date,life.days,card):null;
    const head=add(el('div',null,'life-habit-head'),el('strong',hb.name),el('span',habitValueText(hb,e,week),'life-habit-value'));
    add(cell,head,HABIT_HINTS[hb.id]?el('span',HABIT_HINTS[hb.id],'muted small'):null);
    if(hb.kind==='TIME'){
      const b=el('button',done?'수정':'지금','life-habit-btn');b.type='button';
      pressable(b,()=>{if(done)openEntrySheet(ctx,st,hb,e);else setEntry(hb,()=>entryFor(hb,{now:hhmmFromIso(ctx.now())}))();},()=>openEntrySheet(ctx,st,hb,e));add(cell,b);
    }else if(hb.kind==='DURATION'){
      const row=el('div',null,'life-chip-row');
      const shown=durationChips(hb.target?.minutes);
      for(const m of shown)add(row,chip(m+'분',{selected:e?.minutes===m,onClick:setEntry(hb,()=>e?.minutes===m?null:entryFor(hb,{minutes:m,now:hhmmFromIso(ctx.now())}))}));
      add(row,button(e&&!shown.includes(e.minutes)&&e.minutes?'직접 '+e.minutes+'분':'직접',()=>openEntrySheet(ctx,st,hb,e),'secondary'));add(cell,row);
    }else if(hb.kind==='COUNT'){
      const row=el('div',null,'life-chip-row');
      add(row,button('+1',setEntry(hb,()=>entryFor(hb,{count:Math.min(99,(e?.count??0)+1)})),'primary'),button('수정',()=>openEntrySheet(ctx,st,hb,e),'secondary'));add(cell,row);
    }else{
      add(cell,toggle(hb.name+' 했음',done,on=>setEntry(hb,()=>on?entryFor(hb,{}):null)()));   // FIX44 (AUD1 #1): 라벨이 칸마다 달라야 saReconcile이 다른 칸과 비교하지 않는다
    }
    add(habitPinned(hb)?grid:moreGrid,cell);
  }
  const moreCount=hs.filter(x=>!habitPinned(x)).length;
  const moreBox=moreCount?add(el('details',null,'life-habits-more-box'),el('summary',BOARD_TEXT.more(moreCount),'life-habits-more-summary'),moreGrid):null;

  // 4) 오늘 계획(P1B): 앱이 ctx.todayPlan으로 넘겨 준 카드(계획 탭 '일' 보기와 같은 함수). [▶ 집중]은 아래 공부 벽돌과 같은 타이머·담기를 쓴다(focusPort, 기록 쓰기 0).
  const planCard=ctx.todayPlan?.({date,today:date,focus:ctx.study?.()?focusPort(ctx,st,act):null,draft:st.studyCard?.status==='LOCAL_DRAFT'?st.studyCard.card:null})??null;
  st.planLinked=Boolean(planCard?.dataset?.focusItem);
  if(planCard)add(out,planCard);
  // 4-0) 공부 벽돌
  add(out,renderBricks(ctx,st,h,defs,life,act,ach.goalBricks,liveSlot));
  // 4-1) PC 집중 측정 카드(B6): PC 앱에서 스위치를 켰을 때만 앱(ctx.focusCard)이 넣어 준다. 담기는 오늘 공부 초안에 세션을 더할 뿐이다(연산 0, "오늘 쌓기"에 합쳐짐).
  const focus=ctx.focusCard?.({date,card:st.studyCard?.card??null,timer:st.timer,subjects:defs.subjects.filter(s=>!s.hidden).map(s=>({id:s.id,name:s.name})),subjectId:st.timer?.subjectId??st.subjectId,
    claim:rows=>act(async()=>{
      const s=await studyFlow(ctx);if(!s)throw Object.assign(new Error('STUDY_OFF'),{code:'STUDY_OFF'});
      await s.st.flow.edit(date,c=>{c.sessions.push(...rows);});
      st.message='PC 측정 공부 '+rows.length+'개 · '+rows.reduce((n,r)=>n+r.confirmedMin,0)+'분을 담았습니다 · "오늘 쌓기"를 누르면 함께 쌓입니다';
    })()});
  if(focus)add(out,focus);
  // 4-2) FIX44 (AUD1 #3): 습관은 계획·공부 벽돌 아래(소유자 확인용 그림 layout_A·B, 기본 B = 계획 먼저). 습관 편집 단추도 이 칸으로 옮겼다.
  add(out,questSlot,add(el('div',null,'life-habits-head'),el('h3','습관'),button('습관 편집',()=>openEditor(ctx,st),'secondary')),grid,moreBox);

  // 5) 기분 5단계 + 한 줄
  const moodRow=el('div',null,'life-moods');
  for(const [v,face,label] of MOODS){const b=el('button',face,'life-mood'+(card.mood===v?' selected':''));b.type='button';b.setAttribute('aria-label','기분 '+v+' '+label);b.setAttribute('aria-pressed',String(card.mood===v));b.addEventListener('click',act(async()=>{await st.flow.setMood(date,card.mood===v?null:v);}));add(moodRow,b);}
  const note=input(card.note??'',{maxlength:String(MAX_NOTE),placeholder:'한 줄 (최대 '+MAX_NOTE+'자)','aria-label':'오늘 한 줄'});
  if(box){
    note.addEventListener('input',()=>{box.defer('LIFE_DAY|'+date+'|note',async input=>{let bad=null;try{await st.flow.setNote(date,note.value,{input});}catch(e){bad=st.message=box.ERROR_TEXT[e?.code]??lifeErrorText(e?.code);st.error=true;}noteState(bad);},{owned:true});});
    note.addEventListener('blur',()=>{void box.flush().catch(()=>{}).then(()=>{noteState();});});
  }else note.addEventListener('change',()=>{void st.flow.setNote(date,note.value).catch(e=>{st.message=lifeErrorText(e?.code);st.error=true;});});
  const typeSel=h.select(DAY_TYPES.map(t=>[t,DAY_TYPE_TEXT[t]]),card.dayType);
  typeSel.setAttribute('aria-label','하루 종류');typeSel.addEventListener('change',act(async()=>{await st.flow.setDayType(date,typeSel.value);}));
  add(out,add(el('div',null,'life-mood-box'),el('h3','기분과 한 줄'),moodRow,add(el('div',null,'life-note-row'),note,typeSel)));
  // 5-1) FIX49B: 일기 입구(쓰기 문이 열렸을 때만, D49 8.1). 기분·한 줄 칸은 그대로 둔다(결정 ★3). 일기는 시트로 연다(다시 그려도 글자가 끊기지 않게).
  const openDiary=d=>void openDiarySheet(ctx,st,d,{today:date,lifeFlow:st.flow,plan:dd=>{try{return daySummary(life,ach,dd);}catch{return null;}},health:dd=>ctx.healthLine?.(dd)??null,
    after:async()=>{await prepareLife(ctx,st);await ctx.rerender();}}).catch(e=>{st.diaryMessage={text:diaryErrorText(e?.code),error:true};void ctx.rerender();});
  add(out,renderDiaryEntry(ctx,st,{open:openDiary}));

  // 6) 하단 고정: 오늘 쌓기. 담아 둔 공부 초안이 있으면 먼저 공부 카드를 쌓고 이어서 오늘 카드를 쌓는다(stackDay).
  const studyDirty=st.studyCard?.status==='LOCAL_DRAFT';
  const stackBtn=button('오늘 쌓기',act(async()=>{
    if(note.value!==card.note)await st.flow.setNote(date,note.value);
    const s=studyDirty?await studyFlow(ctx):null;
    const res=await stackDay(date,{life:st.flow,study:s?.st.flow??null});
    if(res.phase==='STUDY_FAILED'){const r=res.study;await reportConfirm(ctx,st,r);st.message='공부 기록을 쌓지 못해 오늘 카드도 쌓지 않았습니다 · '+(st.message??'');st.error=true;return;}
    // FIX31 (S2): 여기까지 왔으면 공부 카드는 확정됐다(stackDay는 공부 확정 뒤에만 오늘 카드로 넘어간다). 오늘 카드가 입력 없음·실패여도 자동 내보내기가 그 확정을 보게 넘긴다.
    // FIX34 (H6): 공부 카드 확정의 T·A 겹침 알림도 오늘 화면에 보인다(공부 카드의 다른 알림은 공부 화면 몫).
    const r=res.study?{...res.life,studyStatus:res.study.status,notices:[...(res.study.notices??[]).filter(n=>n.code===OVERLAP_NOTICE||n.code===TIMER_OVERLAP_NOTICE),...(res.life?.notices??[])]}:res.life;await reportConfirm(ctx,st,r);
    if(res.study){
      await ctx.reload?.();
      const i=(st.message??'').indexOf(' · 상태 내보내기 실패'),exportNote=i<0?'':st.message.slice(i);   // 아래에서 문구를 바꿔도 내보내기 실패는 남긴다
      if(r.status==='NOTHING_TO_CONFIRM'){st.message='공부 기록을 쌓았습니다 · 오늘 카드에는 입력이 없어 쌓지 않았어요.'+exportNote;st.error=false;}
      else if(!STACK_DONE.includes(r.status)){st.message='공부 기록은 쌓았습니다 · 오늘 카드는 쌓지 못했습니다: '+st.message;st.error=true;}
    }
  }),'primary life-stack-btn');
  const preview=(dirty||studyDirty)?previewAchieve({life:whole.life??null,study:whole.study??null,today:date,card:dirty?card:null,studyCard:studyDirty?st.studyCard.card:null,money}):null;
  renderQuestLine(h,questSlot,todayQuestLine(ach,preview),()=>ctx.questSheet?.({doc,ach,preview,today:date,life:whole.life??null,money,kit:ctx.kit,sheet,ctx}));
  const stackXp=preview?preview.todayXp-ach.todayXp:0;
  if(stackXp>0){stackBtn.setAttribute('aria-label','오늘 쌓기, 예상 +'+stackXp+' XP');add(stackBtn,el('span','+'+stackXp+' XP','life-stack-xp'));}
  // V6F: 쌓지 않은 입력이 있으면 입력이 멈춘 뒤 같은 "오늘 쌓기"를 자동으로 한 번(앱이 ctx.autoStack을 켰을 때). 한 줄 입력을 치는 동안은 기다림을 다시 시작한다.
  const pendingNow=dirty||studyDirty,autoText=ctx.autoStack&&pendingNow?' · '+(st.autoHeld?AUTO_STACK_TEXT.held:AUTO_STACK_TEXT.soon):'';
  // FIX70 (O1): 다시 그리기만으로는 기다림을 다시 시작하지 않는다(같은 입력 = 같은 key). 앱(ctx.pendingKey)은 오늘 카드 밖 입력도 세므로 예약 지우기는 앱의 줄이 한다.
  if(pendingNow)scheduleAutoStack(ctx,st,()=>stackBtn.click());else if(!ctx.pendingKey)clearAutoStack(st);
  note.addEventListener('input',()=>{clearAutoStack(st);scheduleAutoStack(ctx,st,()=>stackBtn.click());});   // 한 줄 입력을 치는 중 = 새 입력(언제나 다시 시작)
  add(out,add(el('div',null,'life-stack-bar'),stackBtn,el('span',pendingNow?'변경 있음'+autoText:fs.status==='CONFIRMED'?'쌓음':'','muted small life-stack-note')));
  root.append(out);
  return out;
}
// V6F: 화면 어디서나 보이는 줄의 "지금 쌓기"와 "저장 후 종료"(앱 단추 핸들러)만 부른다. 쌓지 않은 하루 카드를 날짜 순으로 모두 쌓는다
// (그날 카드 1장씩 = 연산 1씩, 오늘 날짜는 "오늘 쌓기"와 같이 공부 초안을 먼저). 화면 문구는 부른 쪽이 정한다.
export async function stackPending(ctx,st){
  if(st)st.stackCodes=[];   // OPS1A: 이번 쌓기의 실패 코드(앱이 LOG_LIMIT 전용 문구를 고른다)
  if(!st?.flow||ctx.locked?.())return {stacked:0,failed:0,left:pendingStackCount(st)};
  clearAutoStack(st);
  try{await st.ports?.box?.flush?.();}catch{/* 한 줄 입력 저장 실패는 아래 쌓기 결과로 드러난다 */}
  const s=st.studyCard?.status==='LOCAL_DRAFT'?await studyFlow(ctx):null,dates=[...(st.pendingAll??st.pending??[])];
  if(st.flowState?.status==='LOCAL_DRAFT'||s)dates.push(st.today);
  let stacked=0,failed=0;const codes=[];
  for(const d of dates){
    try{
      const r=await stackDay(d,{life:st.flow,study:d===st.today?s?.st.flow??null:null});
      if(r.phase==='STUDY_FAILED'){failed++;codes.push(r.study?.code??null);continue;}
      if(r.study)await ctx.reload?.();
      if(STACK_DONE.includes(r.life?.status)||r.study)stacked++;else if(r.life?.status!=='NOTHING_TO_CONFIRM'){failed++;codes.push(r.life?.code??null);}
    }catch(e){failed++;codes.push(e?.code??null);}
  }
  await prepareLife(ctx,st);
  st.stackCodes=codes.filter(c=>typeof c==='string');
  return {stacked,failed,left:pendingStackCount(st)};
}
// V6F (지시서 6): 오늘 카드 한쪽에 오늘의 캐릭터(하루) 작은 그림 + "오늘 3h · 의대생 해부학 · 다음 변신까지 0:42", 평생 등급(누적) 이름표를 항상 같이.
// 누르면 13단계 띠(시트). 오늘 분 = 담은 세션 + 진행 중 타이머(STUDY LIVE·상태 화면과 같은 함수), 진행 중 분은 따로 적는다. 저장 0·통신 0.
export const TODAY_CHAR_TEXT=Object.freeze({tag:'오늘의 캐릭터(하루)',life:'평생 등급(누적)',sheet:'오늘의 캐릭터 13단계',sub:'오늘 공부한 시간만큼 매일 0h부터 변해요 · 평생 등급(누적)과 따로예요'});
function todayCharNode(ctx,st,h,whole,date){
  if(!ctx.study?.())return null;   // 공부 모듈이 꺼져 있으면 없다
  const {el,add,button}=h,t=studyTodayMinutes({study:whole.study??null,date,draftCard:st.studyCard?.card??null,timer:st.timer,nowIso:String(ctx.now())});
  const d=dailyCharOf(t.minutes),life=stageOf(lifetimeMinutes(whole.study??null)).stage,art=Boolean(ctx.avatarArt??AVATAR_ART_READY);
  const go=button(null,()=>openDailySheet(ctx,h,d,t,art),'today-char');go.dataset.navOnly='1';go.setAttribute('aria-haspopup','dialog');go.setAttribute('aria-label',TODAY_CHAR_TEXT.tag+' '+dailyLineText(d)+' · 13단계 보기');go.id='today-char';
  if(art){const img=el('img',null,'today-char-fig');img.alt='';img.setAttribute('aria-hidden','true');img.src=d.file;img.addEventListener('error',()=>{img.hidden=true;});add(go,img);}
  add(go,add(el('span',null,'today-char-text'),el('span',TODAY_CHAR_TEXT.tag,'today-char-tag'),el('strong',dailyLineText(d)+(t.timerMin>0?' · 진행 중 +'+stageHm(t.timerMin)+' 포함':''),'today-char-line'),
    el('span',TODAY_CHAR_TEXT.life+' '+life.no+' · '+life.name,'today-char-life')),el('span','13단계 ›','today-char-more'));
  return go;
}
// V7A: 시트 안 띠 = 타이머·상태 화면과 같은 dailyCharStrip(칸을 누르면 큰 그림 미리보기, 잠긴 단계 포함). 썸네일은 보일 때만 요청.
function openDailySheet(ctx,h,d,t,art){
  const {el,add}=h,strip=dailyCharStrip(ctx.document??globalThis.document,{useArt:art,cls:'today-char-strip',title:TODAY_CHAR_TEXT.tag,sub:null});strip.paint(t.minutes*60000);
  return sheet(TODAY_CHAR_TEXT.sheet,add(el('div',null,'today-char-sheet'),el('p',TODAY_CHAR_TEXT.sub,'muted small'),el('p',dailyLineText(d),'dc-next'),strip.node));
}
// V6B 낮잠 줄: "낮잠: 안 잠" / 잤으면 분·시작 시각. [낮잠 잤음] → 15·30·60분·직접 + 시작 시각(선택) → 건강 카드 낮잠으로 바로 쌓는다(ctx.nap, 앱이 넘김).
// FIX68 (MAN3 M1): 저장(또는 임시 입력)에 들어간 칸은 "저장하지 않은 입력"이 아니다. 앱의 사라진 입력 검사(app.mjs saRaw·data-edit-init)가 보는 처음 값을 지금 값으로 맞춘다.
export const markSaved=(...nodes)=>{for(const n of nodes)if(n?.dataset)n.dataset.editInit=n.type==='checkbox'?(n.checked?'1':'0'):String(n.value??'');};
export function renderNapLine(ctx,st,{el,add,button,input},date){
  const nap=ctx.nap??null;if(!nap)return null;
  // OPS1A: shown = 아직 안 쌓은 초안 낮잠까지(앱이 넘김)
  const naps=(nap.shown?nap.shown(date):nap.list(date))??[],line=add(el('div',null,'life-nap'),el('span',naps.length?naps.map(n=>'낮잠 '+n.minutes+'분'+(n.start?' ('+n.start+'~)':'')).join(' · '):'낮잠: 안 잠','life-nap-text'));line.id='today-nap';
  const save=m=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{const r=await nap.add(m,(st.napStart??'').trim());st.message=r.text;st.error=r.error;st.napOpen=false;st.napStart='';markSaved(start,custom);}catch(x){st.message=lifeErrorText(x?.code);st.error=true;}await prepareLife(ctx,st);await ctx.rerender();});
  if(!st.napOpen){add(line,button(naps.length?'낮잠 더':'낮잠 잤음',()=>{st.napOpen=true;void ctx.rerender();},'secondary life-nap-open'));return line;}
  const start=input(st.napStart??'',{inputmode:'numeric',placeholder:'시작 HH:MM (선택)','aria-label':'낮잠 시작 시각',maxlength:'5'});start.addEventListener('input',()=>{st.napStart=start.value;});
  const custom=input('',{inputmode:'numeric',placeholder:'분','aria-label':'낮잠 분 직접',maxlength:'3'});
  add(line,...[15,30,60].map(m=>chip(m+'분',{onClick:save(m)})),custom,button('직접',()=>{const v=int(custom.value);if(v>=1&&v<=720)save(v)();else{st.message=lifeErrorText('INVALID_LIFE_ENTRY');st.error=true;void ctx.rerender();}},'secondary'),start,button('취소',()=>{st.napOpen=false;void ctx.rerender();},'secondary'));
  return line;
}
// FIX44 (AUD1 #3·#2·#7): 머리 바로 아래 요약 한 줄. 보여 주기만 한다(쓰기 0). 복습 건수·복습 열기·백업 열기·빠른 지출은 앱이 ctx로 넘긴다(없으면 그 조각을 그리지 않는다).
const hoursText=m=>{const h=Math.floor(m/60),r=m%60;return (h?h+'시간':'')+(h&&r?' ':'')+(r||!h?r+'분':'');};
// 어제 공부 시간: 쌓은 공부 카드의 확인한 분 합(공부 요약과 같이 상태를 가리지 않는다). 아직 쌓지 않은 초안은 넣지 않는다.
export function yesterdayMinutes(study,date){
  const d=shiftDay(date,-1),card=(study?.days??[]).find(x=>x.date===d)?.data;
  return cardMinutes(card);   // V6F (지시서 7): 담은(COMPLETED) 세션만
}
function summaryLine(ctx,{el,add,button},{life,ach,date,study}){
  const line=el('div',null,'life-summary');line.id='today-summary';
  const part=text=>el('span',text,'life-summary-part');
  const link=(text,fn,cls='')=>{const b=button(text,fn,'secondary life-summary-link'+cls);b.dataset.navOnly='1';return b;};
  const planned=daySummary(life,ach,date).planned,reviews=ctx.reviewTotal?.()??null,mins=yesterdayMinutes(study,date);
  add(line,part(planned>0?'오늘 계획 '+barsText(planned):'오늘 계획 없음'));
  if(reviews!==null)add(line,reviews>0&&ctx.openStudy?link('복습 '+reviews+'건',ctx.openStudy):part('복습 '+reviews+'건'));
  add(line,part(mins>0?'어제 공부 '+hoursText(mins):'어제 공부 기록 없음'));
  if(ctx.openBackup&&backupDue(readBackupMark(ctx.storage),date))add(line,link(BACKUP_DUE_TEXT,ctx.openBackup,' life-summary-alert'));
  if(ctx.quickExpense)add(line,button('빠른 지출',ctx.quickExpense,'primary life-summary-quick'));
  return line;
}
// FIX44 (AUD1 #5): 공부 세션의 과목 이름(세션 id의 과목, 생물 포함). 찾지 못하면 null(공부 화면이 과목 코드 이름을 쓴다).
export const sessionSubjectName=(life,id)=>lifeDefs(life).subjects.find(s=>s.id===subjectOfSession(id))?.name??null;
// ---- FIX44 (AUD1 #2): 주간 백업 표시 ----
// 값은 이 기기 저장소 키 1개(YYYY-MM-DD)다. 기록·서버 쓰기 0. 소유자가 직접 표시한 날짜일 뿐 앱이 백업 파일을 검사한 값이 아니다. 저장소가 막혀 있으면 이번 실행 동안만 메모리에 둔다.
export const BACKUP_MARK_KEY='lb.backup.mark',BACKUP_DUE_DAYS=7,BACKUP_DUE_TEXT='주간 백업할 때예요';
export const BACKUP_NOTE='내가 표시한 날짜, 앱이 파일을 검사한 값은 아님';
// V6F (지시서 9): 주 1회 순서는 이 앱에서 실제로 할 수 있는 것만(단추 이름 그대로). 앱 안에는 백업 파일을 만드는 단추가 없다(옛 Windows 구성에만 있음) — 그 단계는 앱 밖이라고 적는다.
export const BACKUP_STEPS=Object.freeze(['① 화면 위 "아직 안 쌓은 입력" 줄이 있으면 [지금 쌓기]','② 더보기 → 연결 · 장치의 저장 상태가 "저장 및 동기화 확인됨"인지 확인','③ 아래 적어 둔 자리에 복구 파일(.lbw)·복구 문구가 그대로 있는지 눈으로 확인',
  '④ PC 백업 폴더를 외장 드라이브에 복사(앱 밖 · 지휘소 안내대로)','⑤ 여기서 [오늘 백업했어요] — 날짜 표시일 뿐 앱이 파일을 검사하지 않아요']);
// 복구 파일·복구 문구를 "어디에 두었는지"만 적는 칸(이 기기 저장소 lb.backup.where, 값 자체는 받지 않음). 단어가 많거나 길면 문구를 적은 것으로 보고 저장하지 않는다.
export const BACKUP_WHERE_KEY='lb.backup.where',BACKUP_WHERE_MAX=30;
export const BACKUP_WHERE_TEXT=Object.freeze({file:'복구 파일(.lbw)을 둔 곳',phrase:'복구 문구를 적어 둔 곳',hint:'위치만 적어요(예: 책상 서랍 파란 수첩) · 문구·비밀번호 자체는 적지 마세요',save:'위치 저장',saved:'위치를 이 기기에 적어 두었어요',bad:'위치만 적어 주세요 · 문구처럼 보이는 글(단어 5개 이상·30자 넘음)은 저장하지 않아요'});
export const backupWhereOK=v=>{const t=String(v??'').trim();return t.length<=BACKUP_WHERE_MAX&&t.split(/\s+/).filter(Boolean).length<5;};
export function readBackupWhere(storage=globalThis.localStorage){try{const v=JSON.parse(storage?.getItem(BACKUP_WHERE_KEY)??'null');return {file:typeof v?.file==='string'?v.file:'',phrase:typeof v?.phrase==='string'?v.phrase:''};}catch{return {file:'',phrase:''};}}
export function writeBackupWhere(where,storage=globalThis.localStorage){
  const v={file:String(where.file??'').trim(),phrase:String(where.phrase??'').trim()};if(!backupWhereOK(v.file)||!backupWhereOK(v.phrase))return 'BAD';
  try{storage.setItem(BACKUP_WHERE_KEY,JSON.stringify(v));return 'SAVED';}catch{return 'BLOCKED';}
}
let memoryBackupMark=null,memoryBackupOwner=null;
// FIX48 (HUNT42 H2): 저장소 값과 이번 실행 메모리 값 중 늦은 날짜. 쓰기만 막힌 저장소에서 [오늘 백업했어요] 뒤에도 "표시 없음"·옛 날짜로 남지 않게 한다.
// 메모리 값은 쓰기에 실패한 그 저장소(owner)를 읽을 때만 쓴다(다른 저장소에 새지 않는다, FIX44-2b).
export function readBackupMark(storage=globalThis.localStorage){
  let stored=null;
  try{if(storage){const v=storage.getItem(BACKUP_MARK_KEY);if(dateKeyOK(v))stored=v;}}catch{/* 읽기가 막히면 메모리 값만 */}
  const memory=memoryBackupOwner===(storage??null)?memoryBackupMark:null;
  return stored!==null&&(memory===null||stored>=memory)?stored:memory;
}
export function markBackup(date,storage=globalThis.localStorage){
  try{if(!storage)throw new Error('NO_STORAGE');storage.setItem(BACKUP_MARK_KEY,date);memoryBackupMark=null;memoryBackupOwner=null;return true;}catch{memoryBackupMark=date;memoryBackupOwner=storage??null;return false;}
}
// 표시가 없거나, 7일을 넘었거나(7일째는 아직 아님), 오늘보다 뒤면(시계 오류) 알린다.
export function backupDue(mark,today){return !dateKeyOK(mark)||mark>today||dayNumber(today)-dayNumber(mark)>BACKUP_DUE_DAYS;}
export function renderBackupCard(root,{document:doc=globalThis.document,today,storage=globalThis.localStorage}){
  const {el,add,button,hint}=maker(doc);
  const draw=note=>{
    const mark=readBackupMark(storage),card=el('section',null,'panel backup-card');card.id='backup-card';
    const press=button('오늘 백업했어요',()=>{const kept=markBackup(today(),storage);card.replaceWith(draw(kept?null:'이 기기 저장소가 막혀 있어 앱을 닫으면 이 표시가 사라집니다.'));},'primary');press.dataset.navOnly='1';
    add(card,el('h2','백업','panel-title'),el('p','마지막 주간 백업: '+(mark??'표시 없음')+' ('+BACKUP_NOTE+')','backup-last'),add(el('ol',null,'backup-steps'),...BACKUP_STEPS.map(s=>el('li',s))),press,note?el('p',note,note===BACKUP_WHERE_TEXT.saved?'notice backup-note':'notice error backup-note'):null,whereBox(card));
    return card;
  };
  // V6F: 복구 파일·복구 문구 위치 메모(값이 아니라 위치만, 이 기기 저장소).
  const whereBox=card=>{
    const w=readBackupWhere(storage),box=el('div',null,'backup-where'),inp=(v,label)=>{const i=el('input');i.type='text';i.value=v;i.setAttribute('maxlength',String(BACKUP_WHERE_MAX));i.setAttribute('aria-label',label);i.setAttribute('autocomplete','off');return i;};
    const f=inp(w.file,BACKUP_WHERE_TEXT.file),p=inp(w.phrase,BACKUP_WHERE_TEXT.phrase);
    const save=button(BACKUP_WHERE_TEXT.save,()=>{const r=writeBackupWhere({file:f.value,phrase:p.value},storage);card.replaceWith(draw(r==='SAVED'?BACKUP_WHERE_TEXT.saved:r==='BAD'?BACKUP_WHERE_TEXT.bad:'이 기기 저장소가 막혀 있어 위치를 적어 두지 못했어요.'));},'secondary');save.dataset.navOnly='1';
    add(box,el('h3','복구 파일 · 복구 문구 위치 메모'),hint(BACKUP_WHERE_TEXT.hint),add(el('label',null,'backup-where-row'),el('span',BACKUP_WHERE_TEXT.file),f),add(el('label',null,'backup-where-row'),el('span',BACKUP_WHERE_TEXT.phrase),p),save);
    return box;
  };
  const card=draw(null);root.append(card);return card;
}
async function reportConfirm(ctx,st,r){
  st.notices=r.notices??[];
  if(r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED')await ctx.reload?.();   // 쌓은 카드를 화면이 다시 읽는다(안 읽으면 방금 쌓은 카드가 비어 보인다)
  if(r.status==='REJECTED'){st.message=lifeErrorText(r.code);st.error=true;}
  else if(r.status==='ALREADY_APPLIED'&&r.elsewhere)st.message=DRAFT_GONE_TEXT.elsewhere;
  else if(r.status==='FAILED'&&(r.restored||r.lostInput)){st.message=r.restored?DRAFT_GONE_TEXT.restored:DRAFT_GONE_TEXT.lostInput;st.error=true;}
  else if(['UNKNOWN','SYNC_FAILED','FAILED','STALE'].includes(r.status)){st.message=(r.code&&LIFE_ERROR_TEXT[r.code])||STATUS_TEXT[r.status];st.error=true;}
  else st.message=STATUS_TEXT[r.status]??'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+r.status+'\u2060';
  // B54: 쌓기 성공(STACK_DONE) 직후 사령부 상태 자동 내보내기. 성공 여부·표면(PC 앱)·토글 검사와 실패 문구 덧붙이기는 state-export.mjs의 exportAfterStack 안에 있다.
  // 실패해도 쌓기 결과(status·error)는 바꾸지 않는다.
  // FIX31 (S2): 같은 쌓기에서 공부 카드가 확정됐으면(r.studyStatus) 오늘 카드 결과가 확정이 아니어도 그 확정으로 내보낸다(호출은 그대로 쌓기마다 1번).
  if(!STACK_DONE.includes(r.status)&&STACK_DONE.includes(r.studyStatus))r={...r,status:r.studyStatus};
  try{await ctx.exportAfterStack?.(st,r.status);}catch{st.message=(st.message??'')+' · 상태 내보내기 실패: 내보내지 못했습니다.';}
}
// 그 날 카드 1장 쌓기 핸들러(어제 카드 쌓기 단추 · V6B 성취표 칸). before = 쌓기 전에 초안에 넣을 입력(없으면 그대로). 쌓기 결과 알림·자동 내보내기는 reportConfirm 그대로 한 번.
// FIX70 (F2): only = 입력을 넣은 뒤 쌓을지 정하는 조건(없으면 언제나 쌓음). 묶는 입력은 상자에 확실히 남지 않았을 때만(draftLoose) 쌓는다.
const stackAt=(act,ctx,st,d,before=null,only=null)=>act(async()=>{if(before)await before();if(only&&!only())return;const r=await st.flow.confirm(d);await reportConfirm(ctx,st,r);});
// 누르면 onTap, 길게(0.5초) 누르면 onHold. 길게 누른 뒤 따라오는 click은 무시한다.
function pressable(node,onTap,onHold){
  let timer=null,held=false;
  const stop=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  node.addEventListener('pointerdown',()=>{held=false;stop();timer=setTimeout(()=>{timer=null;held=true;onHold();},500);});
  for(const ev of ['pointerup','pointerleave','pointercancel'])node.addEventListener(ev,stop);
  node.addEventListener('click',e=>{if(held){held=false;e.preventDefault();return;}onTap();});
  node.addEventListener('contextmenu',e=>{e.preventDefault();onHold();});
}

// 기본 7색이 아닌 과목 색은 CSS 클래스로 표현할 수 없다(인라인 style 금지). SVG 속성(fill)으로 점을 그린다.
function colorDot(doc,node,color){
  if(typeof doc?.createElementNS!=='function'||!node.classList)return;   // DS2: SVG를 못 만드는 문서(시험용 최소 DOM)에서는 점 없이 칩만 둔다. 브라우저에는 항상 있다
  const NS='http://www.w3.org/2000/svg',svg=doc.createElementNS(NS,'svg'),c=doc.createElementNS(NS,'circle');
  svg.setAttribute('class','life-dot');svg.setAttribute('width','10');svg.setAttribute('height','10');svg.setAttribute('viewBox','0 0 10 10');svg.setAttribute('aria-hidden','true');
  c.setAttribute('cx','5');c.setAttribute('cy','5');c.setAttribute('r','5');c.setAttribute('fill',color);svg.append(c);
  node.classList.add('lb-chip-custom');node.prepend(svg);
}
// ---- 공부 벽돌 ----
function todayMinutes(st,whole,date){
  const card=st.studyCard?.card??whole.study?.days?.find(d=>d.date===date)?.data??null;
  return countedMinutes(card?.sessions).filter(m=>m>0);   // V6F (지시서 7): 담은(COMPLETED) 세션만
}
function renderBricks(ctx,st,h,defs,life,act,goalBricks,liveSlot=null){
  const {el,add,button,hint,input}=h,date=st.today;
  const sec=add(el('div',null,'life-bricks'),el('h3','공부 벽돌'));
  const subjects=defs.subjects.filter(s=>!s.hidden);
  if(!ctx.study?.()){add(sec,hint('공부 기능이 꺼져 있어 벽돌을 쌓을 수 없습니다. 설정에서 켜세요.'));return sec;}
  // V6A: 오늘 계획에 있는 과목을 앞에(작은 금 점), 나머지는 원래 순서. 계획 없는 과목도 그대로 공부할 수 있다(계획 밖 공부로 집계).
  const planned=new Set((planOf(life,date)?.items??[]).map(x=>x.subjectId)),ordered=[...subjects.filter(s=>planned.has(s.id)),...subjects.filter(s=>!planned.has(s.id))];
  if(st.subjectId===null||!subjects.some(s=>s.id===st.subjectId))st.subjectId=ordered[0]?.id??null;
  // V6A: 칩은 모두 같은 높이·한 줄(줄바꿈 0, 좁은 폭은 가로로 밀기). 부제("징검다리")는 칩 밖에 붙이지 않고 고른 과목 것만 칩 줄 아래 한 줄로.
  const row=el('div',null,'life-chip-row life-subject-chips');row.setAttribute('role','toolbar');row.setAttribute('aria-label','공부할 과목');
  for(const s of ordered){
    const color=subjectColor(s.id,subjects),key=SUBJECT_COLOR_KEYS[color]??null,has=planned.has(s.id);
    const c=chip(s.name,{selected:st.subjectId===s.id,color:key,onClick:()=>{st.subjectId=s.id;void ctx.rerender();}});
    c.dataset.subjectId=s.id;c.dataset.color=color;if(key===null)colorDot(ctx.document??globalThis.document,c,color);
    if(has){const d=el('span',null,'life-plan-dot');d.setAttribute('aria-hidden','true');c.append(d);c.dataset.planned='1';c.setAttribute('aria-label',s.name+' · 오늘 계획 있음');}
    add(row,c);
  }
  const colors=ctx.openColors?button('색 바꾸기',ctx.openColors,'secondary life-color-link'):null;   // V6A: 숨은 기능 0 — 설정 > 공부 · 과목 색으로 바로
  if(colors)colors.dataset.navOnly='1';
  add(sec,add(el('div',null,'life-subject-bar'),row,colors));
  const cur=subjects.find(s=>s.id===st.subjectId)??null;
  const sub=[cur?.bridge?cur.name+' · 징검다리 과목':null,cur&&planned.size?(planned.has(cur.id)?'오늘 계획에 있는 과목':'계획 밖 공부로 집계돼요'):null].filter(Boolean);
  if(sub.length)add(sec,el('p',sub.join(' · '),'muted small life-chip-note'));
  const minutes=todayMinutes(st,ctx.getWhole(),date);
  const sum=sumBricks(minutes);
  // DS1 (V5 §2.8 d·e): "오늘 벽돌 n장 / 목표 m장" + 벽돌 칸(채움 비율, 덮개·공부방 기둥과 같은 스프라이트), 규칙 문장은 ⓘ로 접는다
  const mark=el('summary','ⓘ','lb-info-mark');mark.setAttribute('aria-label','벽돌 규칙');
  const rule=add(el('details',null,'lb-info life-bricks-rule'),mark,el('p','30분 = 1장, 10~29분 = 조각, 9분 이하는 세지 않아요','muted small'));
  add(sec,add(el('div',null,'life-bricks-today'),el('strong','오늘 벽돌 '+sum.bricks+'장'+(sum.pieces?' + 조각 '+sum.pieces:'')+' / 목표 '+goalBricks+'장','life-bricks-count'),
    brickCells(ctx.document??globalThis.document,{value:sum.value,goal:goalBricks}),rule));
  const {recordNow,finishTimer}=timerOps(ctx,st,act);
  return bricksTimer(ctx,st,h,defs,subjects,sec,act,recordNow,finishTimer,goalBricks,liveSlot);
}
// P1B: 담기 함수는 공부 벽돌 카드와 오늘 계획 카드(focusPort)가 같이 쓴다(본문은 B6·R33B·R34B·FIX31·FIX34 그대로, 자리만 renderBricks 밖으로).
function timerOps(ctx,st,act){
  // B6: 타이머 "끝내고 담기"만 세션 id에 T 표지(lf_<과목>_T…)를 붙인다 → 구간 [at − 분, at]을 아는 세션. 분 입력은 그대로(구간 모름).
  // R34B: 타이머는 시작 시각에서 정한 id(lf_<과목>_T<시작 ms 36진>)를 넘긴다(B6 T 표지 + R33B 멱등). id가 없을 때만 표지 + uid로 만든다.
  // FIX68 (HUNT65 F1, 통제탑): 타이머 세션(T)은 시작 시각의 날짜 카드에 담는다(끝 시각과 같은 자리 st.timer의 startIso). 자정을 넘겨 끝나도 시작한 날의 공부·계획 줄에 붙는다.
  // 세션 at은 그대로 끝 시각(구간 [at − 분, at]). 카드 날짜와 at은 하루 차이까지 검사기가 받는다(끝 시각은 시작 + 24시간 이내). 분 입력은 예전대로 지금 날짜.
  const recordNow=async(subject,m,mark='',id=null)=>{
    if(!(Number.isInteger(m)&&m>=1&&m<=1440))throw Object.assign(new Error('INVALID_LIFE_MINUTES'),{code:'INVALID_LIFE_MINUTES'});
    const s=await studyFlow(ctx);if(!s)throw Object.assign(new Error('STUDY_OFF'),{code:'STUDY_OFF'});
    const now=mark==='T'&&st.timer?.endIso?st.timer.endIso:ctx.now();   // FIX34 (H4·H5): 타이머 세션은 적어 둔 끝 시각으로 기록한다(구간 [at − 분, at]이 실제 집중에 맞게)
    const startIso=mark==='T'?st.timer?.startIso:null;
    const day=startIso&&Number.isFinite(Date.parse(startIso))&&Date.parse(startIso)<=Date.parse(now)?kstDate(startIso):kstDate(now);
    const sid=id??sessionIdFor(subject.id,mark?mark+ctx.uid().slice(0,7):ctx.uid().slice(0,8));
    await s.st.flow.addRow(day,'sessions',{id:sid,subject:studyCodeOf(subject.id),state:'COMPLETED',plannedMin:m,confirmedMin:m,restartLocator:'',at:now});
    const b=brickOf(m);st.message=subject.name+' '+m+'분을 담았습니다 · '+(b.bricks?b.bricks+'장':'')+(b.bricks&&b.pieces?' + ':'')+(b.pieces?'조각 1':'')+(!b.bricks&&!b.pieces?'벽돌 0 (10분부터 조각)':'')+' · "오늘 쌓기"를 누르면 함께 쌓입니다';
    st.linkNote={date:day,sessionId:sid,subjectId:subject.id};   // V6A: 담기 직후 "○○ 계획에 반영됨" 한 줄(공부 벽돌 칸이 그린다, 저장 0)
    return day;
  };
  // FIX31 (D1): 타이머는 담기가 저장된 뒤에만 지운다. 거절(읽기 전용·잠김·공부 꺼짐)이나 초안 저장 실패(Quota 등)면 시작 시각을 남겨 집중 시간을 잃지 않는다.
  // R33B (HUNT32 D1·S2): 성공 판정은 그 날 STUDY_DAY 레코드 자체가 디스크에 써졌는가(has&&!dirty)다. 다른 날짜·종류 초안의 STALE·Quota(상자 전체 failed)는 보지 않는다.
  // 세션 id는 타이머 시작 시각에서 만든다(같은 타이머 = 같은 id). 다시 눌러도 그 세션이 오늘부터 시작일까지의 카드에 이미 있으면 새로 담지 않고,
  // 지난번 쓰기가 실패해 메모리에만 있으면 한 번 더 써 본다(같은 집중이 두 번 담기지 않음). 다른 창과 부딪혀(STALE) 못 쓴 초안이면 합쳐서 쓴다(FIX34 H1).
  // FIX34 (H5): 시작이 어제보다 오래된 타이머는 바로 담지 않고 "언제 끝났나요"를 묻는다(confirmed = 그 답을 받은 뒤의 호출).
  // FIX34 (H4): 새로 담을 때 끝 시각을 타이머 저장소에 먼저 적는다. 담기가 실패하고 앱을 닫아도 다음 누름이 그 시각을 쓴다.
  const finishTimer=async(subject,startIso,m,confirmed=false,split=false)=>{
    const keep=text=>{st.message=text+' · 집중 타이머는 그대로 두었어요.';st.error=true;},box=st.ports?.box??null;
    // FIX40 (HUNT35 H7): 접미까지 같은 세션만 이 타이머의 것이다(같은 ms에 시작한 다른 기기 세션을 "이미 담음"으로 보지 않게). 접미가 없으면(옛 타이머) 옛 id다.
    const tag=(st.timer?.startIso===startIso?st.timer.tag:undefined)??lastTag(ctx.storage??globalThis.localStorage,startIso),id=timerSessionId(subject.id,startIso,tag);
    const linkItem=st.timer?.startIso===startIso?st.timer.itemId:undefined;
    let day;
    try{
      const s=await studyFlow(ctx),today=kstDate(ctx.now()),startDay=kstDate(startIso),old=startDay<shiftDay(today,-1);
      let d=today;
      for(let i=0;s&&i<TIMER_LOOKBACK_DAYS&&(i<2||d>=startDay);i++,d=shiftDay(d,-1))if((await s.st.flow.state(d)).card.sessions.some(x=>x.id===id)){day=d;break;}
      const found=Boolean(day);
      if(ctx.locked?.())return;   // FIX37C (H37-S2): 찾는 사이 잠겼다. 타이머 칸은 그대로 둔다
      // FIX37C (H37-S3): 담긴 적이 없는데 저장소에 없으면 다른 탭에서 취소한 타이머다. 취소한 시간을 담지 않는다.
      if(!found&&currentTimer(st,ctx.storage??globalThis.localStorage)?.startIso!==startIso){st.message='다른 탭에서 이미 끝내거나 취소한 타이머예요 · 담지 않았어요.';return;}
      // S1A: 휴식 중에 처음 누르면 끝 시각은 누른 시각이 아니라 휴식 시작 시각이다(공부가 멈춘 순간이 끝).
      if(!found&&(!old||confirmed)&&!st.timer?.endIso){st.timer={...st.timer,endIso:st.timer?.pausedAt??ctx.now()};writeTimer(ctx.storage??globalThis.localStorage,st.timer);}
      if(day){await s.st.ports?.drafts.retryStale?.(day);await box?.flush().catch(()=>{});st.message=subject.name+' 집중은 이미 담았습니다 · 다시 담지 않았어요.';}
      else if(old&&!confirmed){openTimerEnd(ctx,st,subject,act,finishTimer);return;}
      else day=await recordNow(subject,m,'T',id);
      if(!found&&linkItem)writePlanMarks(ctx.storage??globalThis.localStorage,day,k=>{k.links[id]=linkItem;});   // V6A: 계획 줄의 [▶ 집중]으로 시작했으면 그 줄에 붙인다(이 기기 화면 설정). FIX68 F1: day = 시작 날짜(그 줄이 있는 날)
      if(!found&&day!==today)st.message=subject.name+' '+m+'분을 '+dateLabel(day)+' 공부 카드에 담았습니다 · 그 날짜는 공부 화면에서 쌓을 수 있어요.';
    }catch(e){keep(box?.ERROR_TEXT[e?.code]??lifeErrorText(e?.code));return;}
    const b=box?.statusFor('STUDY_DAY',day);
    if(b?.own||b?.dirty){keep(box.ERROR_TEXT[b.own]??box.TEXT.failed);return;}
    st.timer=null;writeTimer(ctx.storage??globalThis.localStorage,null);
  };
  return {recordNow,finishTimer};
}
function bricksTimer(ctx,st,h,defs,subjects,sec,act,recordNow,finishTimer,goalBricks,liveSlot=null){
  const {el,add,button,hint,input}=h;
  const subject=subjects.find(s=>s.id===st.subjectId)??null;
  if(!subject){add(sec,hint('보이는 과목이 없습니다. 습관 편집의 과목에서 추가하세요.'));return sec;}
  const timerRow=el('div',null,'life-timer'),store=ctx.storage??globalThis.localStorage;
  if(!st.timer){st.liveOpen=false;}
  if(st.timer&&st.planLinked)add(timerRow,el('span','집중 중 · 위 "오늘 계획" 카드에서 끝내고 담을 수 있어요','life-timer-text'));   // P1B: 같은 타이머의 단추가 두 곳에 나오지 않게
  else if(st.timer){
    const t=st.timer,ts=subjects.find(s=>s.id===t.subjectId)??defs.subjects.find(s=>s.id===t.subjectId);
    // AV2: 화면을 그린 때의 분을 붙들지 않는다. 글자는 다시 계산해 고치고(화면 꺼짐·탭 정지 뒤 포함), 저장할 분은 누른 순간의 시각으로 구한다.
    // S1A: 끝 시각·휴식이 있으면 liveElapsedMin/liveRecordMin(끝 시각 ?? 휴식 시작 ?? 지금 − 시작 − 휴식 합).
    const rested=Boolean(t.endIso||t.pausedAt||t.restMs);
    const timerText=()=>(t.endIso?'담기 대기 · ':t.pausedAt?'휴식 중 · ':'집중 중 · ')+(ts?.name??'과목')+' · '+hhmmFromIso(t.startIso)+' 시작 · '+(rested?liveElapsedMin(t,ctx.now()):timerElapsedMin(t.startIso,ctx.now()))+'분',timerLabel=el('span',timerText(),'life-timer-text');
    liveTick(timerLabel,ctx.document??globalThis.document,()=>{timerLabel.textContent=timerText();});
    add(timerRow,timerLabel,
      st.liveOpen?null:button('끝내고 담기',act(()=>finishTimer(ts??subject,t.startIso,rested?liveRecordMin(t,ctx.now()):timerRecordMin(t.startIso,ctx.now()))),'primary lb-btn-finish'),   // 덮개가 열려 있으면 그 안의 같은 단추를 쓴다
      button('취소',()=>{st.timer=null;writeTimer(store,null);st.liveOpen=false;void ctx.rerender();}));
  }else{
    // DS1 (V5 §2.1): 집중 시작 = 전체 너비·높이 60px primary, 앞에 선택 과목 색 점
    const go=button('집중 시작',()=>{st.timer={subjectId:subject.id,startIso:ctx.now(),...newTimerTag(ctx)};writeTimer(store,st.timer);st.liveOpen=liveSettings(store).autoOpen;void ctx.rerender();},'primary lb-btn-start');
    go.textContent='';go.append(subjectDot(ctx.document??globalThis.document,subject),'집중 시작');
    add(timerRow,go);
  }
  // R36 (S1A + P1B): STUDY LIVE 덮개·휴식은 어느 단추로 시작한 타이머든 같다(오늘 계획 카드 [▶ 집중]으로 시작해도). 위 줄의 단추만 계획 카드와 나눈다.
  if(st.timer){
    const t=st.timer,ts=subjects.find(s=>s.id===t.subjectId)??defs.subjects.find(s=>s.id===t.subjectId);
    // S1A 휴식(V4 결정 S1D D2): 휴식 시간은 공부 분·벽돌에 넣지 않고 어디에도 기록하지 않는다. 휴식 합이 30분을 넘으면 "이어서" 때
    // 앞부분을 끝 시각 = 휴식 시작으로 담고(기존 finishTimer 그대로) 지금 시각으로 새 타이머를 시작한다. 담기가 실패하면 새로 시작하지 않는다.
    const gone=()=>{st.liveOpen=false;void ctx.rerender();};   // FIX37C (H37-S3): 다른 탭이 지운 타이머를 쓰기로 되살리지 않는다
    const pause=()=>{const c=currentTimer(st,store);if(!c){gone();return;}if(c.endIso||c.pausedAt)return;st.timer={...c,pausedAt:ctx.now()};writeTimer(store,st.timer);void ctx.rerender();};
    const resume=()=>{
      const c=currentTimer(st,store);if(!c){gone();return;}if(!c.pausedAt||c.endIso)return;
      const restMs=(c.restMs??0)+Math.max(0,Date.parse(ctx.now())-Date.parse(c.pausedAt));
      if(restMs>REST_SPLIT_MS){act(async()=>{
        const short=Date.parse(c.pausedAt)-Date.parse(c.startIso)-(c.restMs??0)<60000;   // FIX36 (H36-T2): 앞부분이 1분 미만이면 담지 않는다(저장 최소 1분이라 안 한 공부가 1분으로 남음)
        if(!short){await finishTimer(ts??subject,c.startIso,liveRecordMin(c,ctx.now()),false,true);if(st.timer!==null)return;}
        st.timer={subjectId:c.subjectId,startIso:ctx.now(),...itemIdOf(c),...newTimerTag(ctx)};writeTimer(store,st.timer);st.liveOpen=true;   // R36: 계획 줄에서 시작한 타이머는 나눈 뒤에도 같은 줄
        st.message=short?'30분 넘게 쉬었어요 · 앞부분은 1분이 안 되어 담지 않고 새로 시작해요':'30분 넘게 쉬었어요 · 앞부분을 먼저 담고 새로 시작해요 · '+(st.message??'');
      })();return;}
      const {pausedAt:_p,...rest}=c;st.timer={...rest,restMs};writeTimer(store,st.timer);void ctx.rerender();
    };
    st.liveStop?.();
    const live=renderLive(ctx,{timer:t,subject:ts??subject,open:st.liveOpen,draftCard:st.studyCard?.card??null,exams:defs.exams,ddayActive:readDdayActive(ctx.storage),goalBricks,on:{
      finish:act(()=>finishTimer(ts??subject,t.startIso,liveRecordMin(t,ctx.now()))),pause,resume,
      expand:()=>{st.liveOpen=true;void ctx.rerender();},collapse:()=>{st.liveOpen=false;void ctx.rerender();},
      storage:()=>{st.timer=readTimer(store);if(!st.timer)st.liveOpen=false;void ctx.rerender();}}});   // 다른 탭의 휴식·담기·취소를 따라간다
    st.liveStop=live.stop;
    add(liveSlot??sec,live.card,live.dialog);
  }
  // DS1 (V5 §2.1): "분 [ ] 담기" 한 줄. 담기는 입력이 있을 때만 켜진다(이름은 "분 입력으로 담기")
  const min=input('',{inputmode:'numeric',placeholder:'분','aria-label':'공부한 분'});
  const put=button('담기',act(async()=>{await recordNow(subject,int(min.value));min.value='';put.disabled=true;}),'secondary life-min-add');
  put.setAttribute('aria-label','분 입력으로 담기');put.disabled=true;
  min.addEventListener('input',()=>{put.disabled=!String(min.value??'').trim();});
  add(sec,timerRow,add(el('div',null,'life-min-row'),el('span','분','life-min-label'),min,put),linkNoteNode(ctx,st,h,defs));
  return sec;
}
// ---- V6A: 담기 직후 "○○ 계획에 반영됨" 한 줄 + "다른 항목으로" ----
// 연결은 life-plan linkPlan 규칙(같은 시간대 미완료 → 이른 시간대 미완료)으로 그릴 때마다 계산한다(저장 0). "다른 항목으로"는 같은 과목의 다른 계획 줄을 고르게 하고
// 고른 값은 이 기기 저장소(lb.plan.link)에만 적는다. 계획에 그 과목이 없으면 "계획 밖 공부로 집계".
export function linkNoteText(link,items,subjects,sessionId){
  const itemId=link.link.get(sessionId),name=id=>subjects.find(s=>s.id===id)?.name??'기타';
  if(itemId){const x=items.find(i=>i.id===itemId);return {itemId,text:name(x.subjectId)+' 계획에 반영됨 · '+BLOCK_TEXT[x.block]+(x.title!==name(x.subjectId)?' '+x.title:''),others:items.filter(i=>i.subjectId===x.subjectId&&i.id!==itemId)};}
  const out=link.outside.find(s=>s.id===sessionId);
  return out?{itemId:null,text:'계획 밖 공부로 집계 · '+name(out.subjectId),others:[]}:null;
}
function linkNoteNode(ctx,st,h,defs){
  const n=st.linkNote,date=st.today;if(!n||n.date!==date)return null;
  const {el,add,button}=h,whole=ctx.getWhole(),store=ctx.storage??globalThis.localStorage,life=whole.life??null;
  const items=planOf(life,date)?.items??[],draft=st.studyCard?.status==='LOCAL_DRAFT'?st.studyCard.card:null;
  const link=dayPlanLink(life,whole.study??null,date,{draft,storage:store}),info=linkNoteText(link,items,defs.subjects,n.sessionId);
  if(!info)return null;
  const box=add(el('div',null,'life-link-note'),el('span',info.text,'life-link-text'));box.dataset.sessionId=n.sessionId;
  if(info.others.length){
    const pickOther=()=>{
      const body=el('div',null,'life-sheet-body');let dlg=null;
      for(const x of info.others){const b=button(BLOCK_TEXT[x.block]+' · '+x.title,()=>{writePlanMarks(store,date,k=>{k.links[n.sessionId]=x.id;});dlg?.close?.();void ctx.rerender();},'secondary life-link-pick');b.dataset.itemId=x.id;add(body,b);}
      dlg=sheet('다른 계획 줄에 붙이기',body);
    };
    add(box,button('다른 항목으로',pickOther,'secondary life-link-other'));
  }
  return box;
}
// DS1 (V5 §2.1): 집중 시작 단추 안의 과목 색 점. 기본 7색은 칩 색 변수(클래스), 그 밖의 색은 SVG fill 속성(인라인 style 금지).
function subjectDot(doc,subject){
  const key=SUBJECT_COLOR_KEYS[String(subject?.color??'').toUpperCase()]??null;
  if(key){const n=doc.createElement('span');n.className='lb-dot lb-chip-'+key;n.setAttribute('aria-hidden','true');return n;}
  const NS='http://www.w3.org/2000/svg',mk=t=>doc.createElementNS?doc.createElementNS(NS,t):doc.createElement(t),svg=mk('svg'),c=mk('circle');
  for(const [k,v] of [['class','life-dot'],['width','10'],['height','10'],['viewBox','0 0 10 10'],['aria-hidden','true']])svg.setAttribute(k,v);
  for(const [k,v] of [['cx','5'],['cy','5'],['r','5'],['fill',String(subject?.color??'')]])c.setAttribute(k,v);
  svg.append(c);return svg;
}

// ---- P1B: 오늘 계획 카드의 집중 포트 ----
// start = 기존 "집중 시작"과 같은 타이머 값에 줄 id(itemId)만 더한다(기록 쓰기 0, 타이머가 이미 돌면 아무것도 안 함). finish = 기존 finishTimer 그대로(같은 시작 시각 = 같은 세션 id, 다시 눌러도 한 번만 담김).
// act를 안 주면(계획 탭) 오늘 화면의 act와 같은 모양으로 감싼다: 오늘 화면 준비가 아직이면 먼저 준비하고, 끝나면 다시 준비해 그린다.
export function focusPort(ctx,st,act=null){
  const store=ctx.storage??globalThis.localStorage;
  currentTimer(st,store);   // FIX37C (H37-S3): 오늘 화면 밖(계획 탭)에서도 저장소 기준
  const run=act??(fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{if(!st.flowState)await prepareLife(ctx,st);await fn();}catch(e){st.message=st.ports?.box?.ERROR_TEXT[e?.code]??lifeErrorText(e?.code);st.error=true;}if(st.today)flagBoxFail(st,st.today);try{await prepareLife(ctx,st);}catch{/* 다시 그리기는 계속 */}st.focusNote=st.message?{text:st.message,error:st.error}:null;await ctx.rerender();}));
  return {
    timer:()=>st.timer,
    message:()=>st.focusNote&&st.focusNote.text===st.message?st.focusNote:null,   // 이 포트의 담기 결과만(오늘 화면의 다른 문구는 계획 탭에 옮기지 않는다)
    start:(subjectId,itemId)=>{if(st.timer)return false;st.timer={subjectId,startIso:ctx.now(),...itemIdOf({itemId}),...newTimerTag(ctx)};writeTimer(store,st.timer);void ctx.rerender();return true;},
    finish:()=>{
      const t=st.timer;if(!t)return;
      const defs=lifeDefs(ctx.getWhole().life??null),subject=defs.subjects.find(s=>s.id===t.subjectId)??{id:t.subjectId,name:'과목'},{finishTimer}=timerOps(ctx,st,run);
      run(()=>finishTimer(subject,t.startIso,liveRecordMin(t,ctx.now())))();   // R36: S1A 휴식 합은 빼고 담는다(끝 시각 ?? 휴식 시작 ?? 지금 − 시작 − 휴식 합, 휴식이 없으면 예전 값과 같음)
    },
    cancel:()=>{st.timer=null;writeTimer(store,null);st.liveOpen=false;void ctx.rerender();},
  };
}

// ---- FIX34 (HUNT34 H5): 오래된 타이머의 "언제 끝났나요" 시트 ----
// 시작일이 어제보다 오래된 타이머는 지금까지를 공부로 치지 않는다. 끝 시각(KST)을 받아 그 시각으로 담는다. 기본값 = 저장된 끝 시각 또는 시작 + 최대 3시간(지금을 넘지 않음).
// FIX36 (H36-T1): 휴식 중인 타이머는 공부가 휴식 시작에서 멈췄다. 기본값 = 휴식 시작, 그보다 늦은 끝 시각은 받지 않는다(휴식이 공부로 담기지 않게).
const kstInput=ms=>new Date(ms+KST_MS).toISOString().slice(0,16);
function openTimerEnd(ctx,st,subject,act,finish){
  // FIX37C (H37-S1): 덮개를 접고 시트만 띄운다(act 뒤의 다시 그리기가 덮개를 시트 위로 올리지 않게). 이미 열린 시트가 있으면 또 쌓지 않는다.
  if(st.endSheet?.open)return;
  st.liveOpen=false;
  const doc=ctx.document??globalThis.document,{el,add,button,hint,input,field}=maker(doc),t=st.timer,store=ctx.storage??globalThis.localStorage;
  const start=Date.parse(t.startIso),now=Date.parse(ctx.now()),paused=t.pausedAt?Date.parse(t.pausedAt):null,guess=t.endIso?Date.parse(t.endIso):paused!==null?Math.min(paused,start+MAX_TIMER_MS):Math.min(now,start+TIMER_SUGGEST_MS);
  const end=input(kstInput(guess),{'aria-label':'끝난 시각 (KST)'},'datetime-local'),err=el('p',null,'notice error');err.hidden=true;
  const body=add(el('div',null,'life-sheet-body'),hint(hhmmFromIso(t.startIso)+'에 시작한 '+subject.name+' 타이머가 '+dateLabel(kstDate(t.startIso))+'부터 켜져 있어요. 지금까지를 공부로 치지 않고, 끝난 시각으로 담습니다.'),field('끝난 시각 (KST)',end),err);
  const dlg=sheet('언제 끝났나요',body);st.endSheet=dlg;
  add(body,add(el('div',null,'buttons'),button('이 시각으로 담기',()=>{
    const ms=Date.parse(end.value+':00.000+09:00');
    if(!(ms>start&&ms<=now&&ms-start<=MAX_TIMER_MS)){err.textContent=lifeErrorText('INVALID_TIMER_END');err.hidden=false;return;}
    if(paused!==null&&ms>paused){err.textContent=lifeErrorText('INVALID_TIMER_END_REST');err.hidden=false;return;}
    dlg.close();
    const endIso=new Date(ms).toISOString();st.timer={...t,endIso};writeTimer(store,st.timer);
    act(()=>finish(subject,t.startIso,timerRecordMin(t.startIso,endIso,(t.restMs??0)+(paused!==null?Math.max(0,ms-paused):0)),true))();   // S1A: 그 전 휴식 합은 뺀다 · FIX36: 지금 휴식분도 뺀다(같은 식 하나)
  },'primary')));
}

// ---- 습관 값 직접 입력 시트(길게 눌러 수정 · 분 직접 · 횟수 수정) ----
function openEntrySheet(ctx,st,hb,e){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,input,field}=h;
  const date=st.today;
  const body=el('div',null,'life-sheet-body');
  let read;
  if(hb.kind==='TIME'){const t=input(e?.at??hhmmFromIso(ctx.now()),{},'time');add(body,field('시각 (KST)',t));read=()=>{if(!timeOK(t.value))throw Object.assign(new Error('INVALID_LIFE_ENTRY'),{code:'INVALID_LIFE_ENTRY'});return entryFor(hb,{now:t.value});};}
  else if(hb.kind==='DURATION'){const m=input(e?.minutes?String(e.minutes):'',{inputmode:'numeric'});add(body,field('분',m));read=()=>{const v=int(m.value);if(!(v>=1&&v<=1440))throw Object.assign(new Error('INVALID_LIFE_ENTRY'),{code:'INVALID_LIFE_ENTRY'});return entryFor(hb,{minutes:v,now:hhmmFromIso(ctx.now())});};}
  else{const c=input(e?.count?String(e.count):'',{inputmode:'numeric'});add(body,field('횟수',c));read=()=>{const v=int(c.value);if(!(v>=1&&v<=99))throw Object.assign(new Error('INVALID_LIFE_ENTRY'),{code:'INVALID_LIFE_ENTRY'});return entryFor(hb,{count:v});};}
  const err=el('p',null,'notice error');err.hidden=true;
  const dlg=sheet(hb.name+' 수정',body);
  const run=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{await fn();}catch(x){st.message=lifeErrorText(x?.code);st.error=true;}flagBoxFail(st,date);await prepareLife(ctx,st);await ctx.rerender();});
  const apply=entry=>{dlg.close();stackAt(run,ctx,st,date,()=>st.flow.setHabit(date,hb.id,entry),()=>Boolean(ctx.autoStack)&&draftLoose(st,date,{memory:false}))();};   // FIX70 (F2): 오늘 칩과 같은 규칙
  add(body,err,add(el('div',null,'buttons'),button('저장',()=>{try{apply(read());}catch(x){err.textContent=lifeErrorText(x.code);err.hidden=false;}},'primary'),e?button('지우기',()=>apply(null)):null));
}

// DSFIX D1: 3방향 병합의 기준 = 시트를 열 때(색 화면은 그릴 때) 보인 값. 저장본이 있으면 그 data, 없으면 보이던 기본값(collectRows와 같은 order).
export function definitionBases(life,defs=lifeDefs(life)){
  const out={},put=(type,stored,list)=>list.forEach((x,i)=>{const old=stored.find(s=>s.id===x.id);out[type+'|'+x.id]=structuredClone(old?old.data:{...x,order:i});});
  put('HABIT_DEF',life?.habits??[],defs.habits);put('SUBJECT_DEF',life?.subjects??[],defs.subjects);
  out['EXAM_SCHEDULE|exams']=structuredClone(defs.exams);
  return out;
}
// V6B 새 습관 종류(화면 글자)와 목표 칸. 저장은 기존 HABIT_DEF 칸(kind·target) 그대로다. "주 몇 회" = COUNT · 주 단위 목표.
export const NEW_HABIT_KINDS=Object.freeze([['CHECK','했다/안 했다'],['TIME','시각 목표'],['DURATION','분 목표'],['COUNT','주 몇 회'],['RECOVERY','복구']]);
export function newHabitTarget(kind,text){
  const t=String(text??'').trim(),base={time:null,minutes:null,count:null,per:'DAY'};
  if(kind==='TIME'){if(t==='')return base;return targetTimeOK(t)?{...base,time:t}:null;}
  if(kind==='DURATION'){if(t==='')return base;const v=int(t);return v>=1&&v<=1440?{...base,minutes:v}:null;}
  if(kind==='COUNT'){const v=t===''?3:int(t);return v>=1&&v<=7?{...base,count:v,per:'WEEK'}:null;}
  return base;
}
// ---- 습관·과목·시험 일정 편집 시트 ----
export function openEditor(ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,input,select,field}=h;
  const life=ctx.getWhole().life??{habits:[],days:[],subjects:[],exams:null},defs=lifeDefs(life),bases=definitionBases(life,defs);
  const work={habits:defs.habits.map(x=>structuredClone(x)),subjects:defs.subjects.map(x=>structuredClone(x)),exams:structuredClone(defs.exams)};
  let tab='HABITS';
  const body=el('div',null,'life-editor'),err=el('p',null,'notice error life-editor-error'),note=el('p',DEFS_SEALED_TEXT,'notice life-editor-note');err.hidden=true;note.hidden=true;
  const showErr=code=>{err.textContent=lifeErrorText(code);err.hidden=false;};
  const move=(list,i,d)=>{const j=i+d;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];};
  const rerender=()=>{
    body.replaceChildren();
    const seg=add(el('div',null,'segment lb-segment'),...[['HABITS','습관'],['SUBJECTS','과목'],['EXAMS','시험 일정']].map(([k,t])=>{const b=button(t,()=>{tab=k;rerender();},tab===k?'selected':'secondary');return b;}));
    add(body,seg);
    if(tab==='HABITS')habitsPane();else if(tab==='SUBJECTS')subjectsPane();else examsPane();
    add(body,note,err);
  };
  const habitsPane=()=>{
    work.habits.forEach((x,i)=>{
      const name=input(x.name,{maxlength:String(MAX_NAME),'aria-label':'습관 이름'});name.addEventListener('input',()=>{x.name=name.value;});
      const row=add(el('div',null,'life-edit-row'),name,el('span',KIND_TEXT[x.kind],'life-badge'));
      if(x.kind==='TIME'){const t=input(x.target.time??'',{placeholder:'목표 HH:MM','aria-label':'목표 시각',maxlength:'5'});t.addEventListener('input',()=>{x.target.time=t.value.trim()===''?null:t.value.trim();});add(row,t);}
      if(x.kind==='DURATION'){const m=input(x.target.minutes?String(x.target.minutes):'',{inputmode:'numeric',placeholder:'목표 분','aria-label':'목표 분'});m.addEventListener('input',()=>{x.target.minutes=m.value.trim()===''?null:int(m.value);});add(row,m);}
      if(x.kind==='COUNT'){const c=input(x.target.count?String(x.target.count):'',{inputmode:'numeric',placeholder:'목표 횟수','aria-label':'목표 횟수'});c.addEventListener('input',()=>{x.target.count=c.value.trim()===''?null:int(c.value);});const per=select([['DAY','하루'],['WEEK','한 주']],x.target.per);per.addEventListener('change',()=>{x.target.per=per.value;});add(row,c,per);}
      const diff=select(Object.entries(DIFF_TEXT),x.difficulty);diff.setAttribute('aria-label','난이도');diff.addEventListener('change',()=>{x.difficulty=diff.value==='AUTO'?'AUTO':Number(diff.value);});
      const area=select(HABIT_AREAS.map(a=>[a,AREA_TEXT[a]]),x.area);area.setAttribute('aria-label','영역');area.addEventListener('change',()=>{x.area=area.value;});
      // V6B: 오늘 고정(order 구간, life-model habitPinned) · 보관(= 기존 숨김 칸)
      add(row,diff,area,toggle('오늘 고정',habitPinned(x),on=>{x.order=on?0:HABIT_UNPIN_ORDER;}),toggle('보관(숨김)',x.hidden,on=>{x.hidden=on;}),button('▲',()=>{move(work.habits,i,-1);rerender();},'secondary'),button('▼',()=>{move(work.habits,i,1);rerender();},'secondary'));
      add(body,row);
    });
    // V6B: 자유 추가 — 이름 · 종류(했다/안 했다 · 시각 목표 · 분 목표 · 주 몇 회) · 목표. 개수 제한 없음(기록 한도 HABIT_DEF 30개까지).
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:'새 습관 이름'}),kind=select(NEW_HABIT_KINDS,'CHECK'),goal=input('',{placeholder:'목표(시각 HH:MM · 분 · 주 횟수)','aria-label':'새 습관 목표',maxlength:'5'});
    add(body,el('h3','새 습관','life-edit-sub'),add(el('div',null,'life-edit-row life-edit-new'),nn,kind,goal,button('습관 추가',()=>{
      const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}
      const t=newHabitTarget(kind.value,goal.value);if(!t){showErr('INVALID_HABIT_TARGET');return;}
      work.habits.push({id:'h-'+ctx.uid().slice(0,12),name,kind:kind.value,target:t,difficulty:'AUTO',hidden:false,order:work.habits.length,area:'BODY'});rerender();
    },'primary')),hint('삭제 대신 보관(숨김)을 씁니다 · 지난 기록은 그대로 남아요. 종류는 만든 뒤 바꿀 수 없어요. 오늘 고정을 끄면 오늘 탭 "더 보기"에 들어가요. 저장을 눌러야 반영돼요.'));
  };
  const subjectsPane=()=>{
    work.subjects.forEach((x,i)=>{
      const name=input(x.name,{maxlength:String(MAX_NAME),'aria-label':'과목 이름'});name.addEventListener('input',()=>{x.name=name.value;});
      const color=input(x.color,{'aria-label':'과목 색'},'color');color.addEventListener('input',()=>{x.color=color.value.toUpperCase();});
      add(body,add(el('div',null,'life-edit-row'),name,color,toggle('수능 과목',x.exam,on=>{x.exam=on;}),toggle('징검다리',x.bridge,on=>{x.bridge=on;}),toggle('숨김',x.hidden,on=>{x.hidden=on;}),button('▲',()=>{move(work.subjects,i,-1);rerender();},'secondary'),button('▼',()=>{move(work.subjects,i,1);rerender();},'secondary')));
    });
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:'새 과목 이름'});
    add(body,add(el('div',null,'life-edit-row'),nn,button('과목 추가',()=>{const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}work.subjects.push({id:'s'+ctx.uid().slice(0,12),name,color:NEW_SUBJECT_COLOR,exam:false,bridge:false,hidden:false,order:work.subjects.length});rerender();},'primary')),hint('생물은 수능 과목이 아니라 공부를 시작하게 만드는 징검다리 과목입니다.'));
  };
  const examsPane=()=>{
    work.exams.items.forEach((x,i)=>{
      const name=input(x.name,{maxlength:String(MAX_NAME),'aria-label':'시험 이름'});name.addEventListener('input',()=>{x.name=name.value;});
      const date=input(x.date,{'aria-label':'시험 날짜'},'date');date.addEventListener('input',()=>{x.date=date.value;});
      const status=select([['잠정','잠정'],['확정','확정']],x.status);status.setAttribute('aria-label','잠정 또는 확정');status.addEventListener('change',()=>{x.status=status.value;});
      add(body,add(el('div',null,'life-edit-row'),name,date,status,x.status==='잠정'?el('span','잠정','life-badge'):null,button('빼기',()=>{work.exams.items.splice(i,1);rerender();},'secondary')));
    });
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:'새 시험 이름'});
    add(body,add(el('div',null,'life-edit-row'),nn,button('시험 추가',()=>{const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}work.exams.items.push({id:'e-'+ctx.uid().slice(0,12),name,date:kstDate(ctx.now()),status:'잠정'});rerender();},'primary'))   /* V8FIX L-16: 새 시험 기본 날짜 = KST 오늘(00:00~08:59 KST에 UTC 날짜라 어제가 되던 것) */,hint('날짜는 발표 전 잠정값입니다. 확정되면 상태를 "확정"으로 바꾸세요.'));
  };
  rerender();
  let dlg=null;
  const open=()=>{dlg=sheet('습관 · 과목 · 시험 일정',body);dlg.querySelector('.lb-sheet-head')?.append(save);};
  const memo={};
  const save=button('저장',()=>{
    try{
      const rows=collectRows(work,life,defs);
      dlg.close();
      void ctx.perform(async()=>{
        st.message=null;st.error=false;
        let sealed=false;
        try{const n=await saveDefinitions(ctx,rows,'습관·과목·시험 일정 편집',memo,bases);sealed=memo.sealed>0;st.message=sealed?DEFS_SEALED_TEXT:n?n+'건을 저장했습니다.':'바뀐 것이 없어 저장하지 않았습니다.';}
        catch(x){st.message=lifeErrorText(x?.code);st.error=true;}
        await prepareLife(ctx,st);await ctx.rerender();
        if(sealed&&!ctx.locked?.()){note.hidden=false;open();}   // FIX38: 임시 저장은 성공이 아니다. 고친 내용이 든 시트를 다시 연다. 잠겼으면 열지 않는다(H37-S2)
      });
    }catch(x){showErr(x?.code);}
  },'primary');
  open();
}
// ---- V7B 습관 고르기 시트(성취표 머리 "습관 고르기", 소유자 2026-11-11) ----
// 기본 습관(기상·취침 포함)까지 모든 습관을 빼고(끄기) 다시 켤 수 있다. 이름 고치기·순서 바꾸기·새 습관 추가도 여기서 한다.
// 저장 = 기존 HABIT_DEF 칸 그대로: 빼기 = hidden:true(기존 "보관(숨김)" 칸), 다시 켜기 = hidden:false, 이름 = name, 순서 = order(편집 시트와 같은 collectRows 규칙). 새 칸·새 종류 0.
// 빼도 지난 하루 카드(LIFE_DAY)는 그대로라 다시 켜면 지난 기록이 그대로 보인다. 뺀 습관은 숨긴 습관과 같아 성취표·오늘 칩·경험치·연속 기록에서 빠진다(lifeDefs → !hidden).
// 시트 안의 고르기는 이 시트의 작업본(초안)만 바꾼다(쓰기 0). [저장] 1번 = 바뀐 습관마다 HABIT_DEF 1개(습관 하나 고르기 = 연산 1).
// 저장된 습관이 하나도 없으면(기본값 상태) 첫 저장 때 기본 습관 모두를 함께 쓴다(하나만 쓰면 나머지 기본 습관이 사라진다, FIX37B H37-Q1 규칙 그대로) — 시트가 미리 알린다.
// 두 기기: 기준(bases) = 시트를 연 때 값. 다른 기기가 그 사이 다른 습관이나 같은 습관의 다른 칸을 바꿨으면 saveDefinitions가 칸 단위로 합친다(DSFIX D1). 같은 칸을 다르게 바꿨으면 쓰지 않고 알린다.
export const PICK_TEXT=Object.freeze({open:'습관 고르기',title:'습관 고르기',on:n=>'켜 둔 습관 '+n+'개',off:n=>'꺼 둔 습관 '+n+'개',
  hide:'빼기',show:'다시 켜기',add:'추가',newName:'새 습관 이름',save:'저장',
  lead:'빼도 지난 기록은 지워지지 않아요 · 다시 켜면 그대로 보여요 · 뺀 습관은 성취표·오늘 칩·경험치·연속 기록에서 빠져요.',
  onNone:'켜 둔 습관이 없어요.',offNone:'꺼 둔 습관이 없어요.',
  first:n=>'아직 저장한 습관이 없어요 · 처음 저장할 때 기본 습관 '+n+'개를 함께 저장해요(한 번만).',
  changed:n=>'바뀐 습관 '+n+'개 · 저장을 눌러야 반영돼요',none:'바뀐 것이 없어 저장하지 않았어요.',saved:n=>n+'건을 저장했어요.'});
// 작업본: 지금 보이는 습관 정의 복사본(과목·시험 일정은 그대로 두어 저장 대상이 아니다).
export function habitPickWork(life){
  const defs=lifeDefs(life);
  return {defs,work:{habits:defs.habits.map(x=>structuredClone(x)),subjects:defs.subjects.map(x=>structuredClone(x)),exams:structuredClone(defs.exams)}};
}
// 켜 둔 습관 안에서 한 칸 위·아래로(꺼 둔 습관은 건너뛴다). 움직였으면 true.
export function pickMove(habits,id,d){
  const i=habits.findIndex(x=>x.id===id);if(i<0||habits[i].hidden)return false;
  let j=i+d;while(j>=0&&j<habits.length&&habits[j].hidden)j+=d;
  if(j<0||j>=habits.length)return false;
  [habits[i],habits[j]]=[habits[j],habits[i]];return true;
}
export function openHabitPicker(ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,input,select}=h;
  const life=ctx.getWhole().life??{habits:[],days:[],subjects:[],exams:null},{defs,work}=habitPickWork(life),bases=definitionBases(life,defs);
  const body=el('div',null,'life-editor hb-picker'),err=el('p',null,'notice error hb-pick-error'),note=el('p',DEFS_SEALED_TEXT,'notice hb-pick-note');err.hidden=true;note.hidden=true;
  const showErr=code=>{err.textContent=lifeErrorText(code);err.hidden=false;};
  const rowsNow=()=>collectRows(work,life,defs);
  let dlg=null;const memo={};
  const save=()=>{
    let rows;
    try{rows=rowsNow();for(const r of rows)validateLifeData(r.type,r.id,r.data);}catch(x){showErr(x?.code);return;}
    if(!rows.length){st.message=PICK_TEXT.none;st.error=false;dlg?.close?.();void ctx.rerender();return;}
    dlg?.close?.();
    void ctx.perform(async()=>{
      st.message=null;st.error=false;let sealed=false;
      try{const n=await saveDefinitions(ctx,rows,'습관 고르기',memo,bases);sealed=memo.sealed>0;st.message=sealed?DEFS_SEALED_TEXT:n?PICK_TEXT.saved(n):PICK_TEXT.none;}
      catch(x){st.message=lifeErrorText(x?.code);st.error=true;}
      await prepareLife(ctx,st);await ctx.rerender();
      if(sealed&&!ctx.locked?.()){note.hidden=false;open();}   // FIX38와 같이: 임시 저장은 성공이 아니다. 고른 내용이 든 시트를 다시 연다
    });
  };
  const draw=()=>{
    body.replaceChildren();
    const on=work.habits.filter(x=>!x.hidden),off=work.habits.filter(x=>x.hidden);
    let n=0;try{n=rowsNow().length;}catch{/* 이름이 비면 저장 때 알린다 */}
    add(body,add(el('div',null,'buttons'),button(PICK_TEXT.save,save,'primary hb-pick-save')),hint(PICK_TEXT.lead),
      defs.usingDefaults.habits?el('p',PICK_TEXT.first(DEFAULT_HABITS.length),'notice hb-pick-first'):null,n?el('p',PICK_TEXT.changed(n),'muted small hb-pick-changed'):null,note,err);
    const onBox=add(el('div',null,'hb-pick-list hb-pick-on'),el('h3',PICK_TEXT.on(on.length),'life-edit-sub'));
    for(const x of on){
      const name=input(x.name,{maxlength:String(MAX_NAME),'aria-label':x.name+' 이름'});name.addEventListener('input',()=>{x.name=name.value;});name.addEventListener('change',()=>draw());
      const row=add(el('div',null,'life-edit-row hb-pick-row'),name,el('span',KIND_TEXT[x.kind],'life-badge'),
        button('▲',()=>{if(pickMove(work.habits,x.id,-1))draw();},'secondary hb-pick-up'),button('▼',()=>{if(pickMove(work.habits,x.id,1))draw();},'secondary hb-pick-down'),
        button(PICK_TEXT.hide,()=>{x.hidden=true;err.hidden=true;draw();},'secondary hb-pick-hide'));
      row.dataset.habit=x.id;add(onBox,row);
    }
    if(!on.length)add(onBox,hint(PICK_TEXT.onNone));
    const offBox=add(el('div',null,'hb-pick-list hb-pick-off'),el('h3',PICK_TEXT.off(off.length),'life-edit-sub'));
    for(const x of off){const row=add(el('div',null,'life-edit-row hb-pick-row'),el('span',x.name,'hb-pick-name'),button(PICK_TEXT.show,()=>{x.hidden=false;err.hidden=true;draw();},'secondary hb-pick-show'));row.dataset.habit=x.id;add(offBox,row);}
    if(!off.length)add(offBox,hint(PICK_TEXT.offNone));
    // 새 습관 = 편집 시트의 자유 추가와 같은 칸(이름 · 종류 · 목표)
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:PICK_TEXT.newName,'aria-label':PICK_TEXT.newName}),kind=select(NEW_HABIT_KINDS,'CHECK'),goal=input('',{placeholder:'목표(시각 HH:MM · 분 · 주 횟수)','aria-label':'새 습관 목표',maxlength:'5'});kind.setAttribute('aria-label','새 습관 종류');
    add(body,onBox,offBox,el('h3','새 습관','life-edit-sub'),add(el('div',null,'life-edit-row life-edit-new hb-pick-new'),nn,kind,goal,button(PICK_TEXT.add,()=>{
      const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}
      const t=newHabitTarget(kind.value,goal.value);if(!t){showErr('INVALID_HABIT_TARGET');return;}
      work.habits.push({id:'h-'+ctx.uid().slice(0,12),name,kind:kind.value,target:t,difficulty:'AUTO',hidden:false,order:work.habits.length,area:'BODY'});err.hidden=true;draw();
    },'primary hb-pick-add')));
  };
  const open=()=>{dlg=sheet(PICK_TEXT.title,body);};
  draw();open();
  return {body,work,save,draw};
}
// ---- DS2 과목 색 설정(설정 → 공부 → 과목 색, V5 2.4) ----
// 저장 = 기존 SUBJECT_DEF.color 칸(기기 간 동기화되는 과목 기록). 칸·종류를 더하지 않으므로 r52 이전 빌드도 그대로 받는다.
// 고르기·직접 입력은 이 화면의 초안(st.colors)에만 모이고 "색 저장"을 눌러야 쓴다. 저장 범위는 편집 화면과 같은 collectRows 규칙이다
// (과목을 한 번도 저장하지 않았으면 7과목을 한 번에 쓴다: 한 과목만 쓰면 나머지 기본 과목이 목록에서 빠진다).
export const SUBJECT_COLOR_TEXT=Object.freeze({
  title:'공부 · 과목 색',lead:'과목 칩·계획 격자·주간 그래프·공부 벽돌·탑과 우주가 같은 색을 써요. 저장한 색은 다른 기기에도 동기화돼요.',
  custom:'직접 입력',apply:'적용',reset:'기본값으로',save:'색 저장',
  badHex:'색 값은 #RRGGBB 형식이어야 해요(예: #D9823B) · 저장하지 않았어요.',near:'구분이 어려울 수 있어요',
  none:'바뀐 색이 없어 저장하지 않았어요.',saved:n=>n+'건을 저장했어요.',
});
// 초안을 얹은 작업본. collectRows에 그대로 넘긴다(습관·시험 일정은 그대로라 쓰지 않는다).
export function subjectColorWork(life,draft={}){
  const defs=lifeDefs(life);
  const subjects=defs.subjects.map(x=>({...structuredClone(x),color:Object.hasOwn(draft,x.id)?draft[x.id]:subjectColor(x.id,defs.subjects)}));
  return {defs,work:{habits:defs.habits.map(x=>structuredClone(x)),subjects,exams:structuredClone(defs.exams)}};
}
// DSFIX M1: 저장된 과목이 하나도 없으면 [색 저장]은 바뀐 것이 없어도 지금 보이는 7과목(영어 주황 포함)을 모두 쓴다 — 옛 빌드 기기도 같은 색을 갖게.
// 저장된 과목이 있으면 collectRows 그대로(바뀐 줄만). 누르기 전에는 아무것도 쓰지 않는다.
export function subjectColorRows(work,life,defs=lifeDefs(life)){
  const v=life??{habits:[],days:[],subjects:[],exams:null},rows=collectRows(work,v,defs);
  if(v.subjects.length||rows.some(r=>r.type==='SUBJECT_DEF'))return rows;
  return [...rows,...work.subjects.map((x,i)=>({type:'SUBJECT_DEF',id:x.id,data:{...x,name:String(x.name).trim(),order:i},heads:[]}))];
}
export function renderSubjectColors(ctx,st){
  const doc=ctx.document??globalThis.document,{el,add,button,hint,input}=maker(doc);
  const cs=st.colors??={draft:{},message:null,error:false};
  const out=el('section',null,'panel subject-colors');out.id='subject-colors';   // V6A: 공부 벽돌 "색 바꾸기"가 여기로 스크롤한다
  const draw=()=>{
    const life=ctx.getWhole().life??null,{defs,work}=subjectColorWork(life,cs.draft);
    out.replaceChildren(el('h2',SUBJECT_COLOR_TEXT.title,'panel-title'),hint(SUBJECT_COLOR_TEXT.lead));
    const set=(id,hex)=>{cs.draft[id]=hex;cs.message=null;cs.error=false;draw();};
    for(const s of work.subjects){
      const row=add(el('div',null,'life-chip-row subject-color-row'),el('strong',s.name+(s.hidden?' · 숨김':'')));row.dataset.subjectId=s.id;row.dataset.color=s.color;
      for(const p of SUBJECT_PALETTE){
        const key=SUBJECT_COLOR_KEYS[p.hex]??null,c=chip(p.name,{selected:s.color===p.hex,color:key,onClick:()=>set(s.id,p.hex)});
        c.dataset.color=p.hex;c.setAttribute('aria-label',s.name+' '+p.name+' '+p.hex);if(key===null)colorDot(doc,c,p.hex);add(row,c);
      }
      const box=input(s.color,{maxlength:'7','aria-label':s.name+' '+SUBJECT_COLOR_TEXT.custom,placeholder:'#RRGGBB'});
      add(row,box,button(SUBJECT_COLOR_TEXT.apply,()=>{const hex=parseSubjectHex(box.value);if(!hex){cs.message=SUBJECT_COLOR_TEXT.badHex;cs.error=true;draw();return;}set(s.id,hex);}));
      // V6F (CAP1 9): 과목 한 줄(이름 + 지금 색 점)만 보이고, 누르면 그 과목 팔레트만 펼친다(한 번에 하나).
      const item=el('details',null,'subject-color-item');item.dataset.subjectId=s.id;item.open=cs.open===s.id;
      const sum=add(el('summary',null,'subject-color-sum'),el('span',s.name+(s.hidden?' · 숨김':'')));colorDot(doc,sum,s.color);add(sum,el('span',s.color,'muted small'));
      item.addEventListener?.('toggle',()=>{if(item.open)cs.open=s.id;else if(cs.open===s.id)cs.open=null;for(const o of out.querySelectorAll?.('details.subject-color-item')??[])if(o!==item&&item.open)o.open=false;});
      add(out,add(item,sum,row));
    }
    for(const [a,b] of nearSubjectPairs(work.subjects))add(out,el('p',a+' · '+b+': '+SUBJECT_COLOR_TEXT.near,'notice subject-color-near'));
    const msg=cs.message?el('p',cs.message,cs.error?'notice error':'notice'):null;
    const reset=button(SUBJECT_COLOR_TEXT.reset,()=>{for(const s of work.subjects)cs.draft[s.id]=defaultSubjectColor(s.id);cs.message=null;cs.error=false;draw();});
    const bases=definitionBases(life,defs);   // DSFIX D1: 그린 때 값 = 기준
    const save=button(SUBJECT_COLOR_TEXT.save,()=>{
      const rows=subjectColorRows(work,life,defs);
      if(!rows.length){cs.draft={};cs.message=SUBJECT_COLOR_TEXT.none;cs.error=false;draw();return;}
      void ctx.perform(async()=>{
        const memo=cs.memo??={};   // 편집 시트처럼: 아직 임시 저장 모드면 같은 내용을 다시 봉인하지 않는다(H37-P1)
        try{const n=await saveDefinitions(ctx,rows,'과목 색 설정',memo,bases);cs.message=memo.sealed>0?DEFS_SEALED_TEXT:n?SUBJECT_COLOR_TEXT.saved(n):SUBJECT_COLOR_TEXT.none;cs.error=false;if(!(memo.sealed>0))cs.draft={};}
        catch(x){cs.message=lifeErrorText(x?.code);cs.error=true;}
        await prepareLife(ctx,st);await ctx.rerender();
      });
    },'primary');
    add(out,msg,add(el('div',null,'buttons'),reset,save));
  };
  draw();
  return out;
}
// ---- V6B 기록 탭 첫 화면: 습관 성취표 ----
// 행 = 습관(기본 행동 + 내 습관), 열 = 날짜(주 7칸 / 월). 칸을 누르면 그 날 그 습관을 바로 기록·수정한다(그날 카드 1장 쌓기 = 연산 1).
// 기본 행동 칸은 오늘만 바로 기록한다(지난 날 결과는 이력에서 정정, 코어 기록 규칙 그대로). 행 이름을 누르면 상세(이어갈 지점·실제로 한 양)가 펼쳐진다.
export const BOARD_TEXT=Object.freeze({title:'습관 성취표',add:'습관 추가 · 편집',week:'주',month:'월',rate:'달성',streak:'연속',day:'하루 달성률',
  none:'기록 없음',done:'완료',part:'일부',miss:'못함',clear:'기록 지우기',noneNote:'빈칸은 기록 없음이에요 · 못함으로 세지 않아요',
  actionPast:'지난 날 기본 행동 결과는 이력에서 정정할 수 있어요',more:n=>'더 보기 · 고정 안 한 습관 '+n+'개',
  bricks:(w,t)=>'이번 주 습관 벽돌 '+w+'장 · 지금까지 '+t+'장 (공부 벽돌과 따로 셈)',brickRule:'고정한 매일 습관과 켜 둔 기본 행동을 하루에 모두 완료하면 습관 벽돌 1장'});
const STATE_MARK=Object.freeze({done:'●',part:'◐',miss:'○',none:''});
export function boardDates(mode,anchor){
  if(mode==='MONTH'){const first=anchor.slice(0,7)+'-01',out=[];for(let d=first;d.slice(0,7)===first.slice(0,7);d=shiftDay(d,1))out.push(d);return out;}
  const monday=shiftDay(anchor,-((new Date(anchor+'T12:00:00Z').getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>shiftDay(monday,i));
}
// LIFE 습관 칸 값 → 저장할 줄. 고르는 값: 'done'(목표값으로 완료) · 'miss'(못함) · null(지움) · {minutes}·{count}·{at}(직접 값).
export function boardEntry(hb,pick,{nowHm,date,today}){
  if(pick===null)return null;
  if(pick==='miss')return {...MISSED_ENTRY};
  if(typeof pick==='object'){
    if(hb.kind==='DURATION')return entryFor(hb,{minutes:pick.minutes,now:date===today?nowHm:null});
    if(hb.kind==='COUNT')return entryFor(hb,{count:pick.count});
    if(hb.kind==='TIME')return entryFor(hb,{now:pick.at});
  }
  if(hb.kind==='TIME')return entryFor(hb,{now:date===today?nowHm:hb.target.time&&hb.target.time!=='24:00'?hb.target.time:'23:59'});
  if(hb.kind==='DURATION')return entryFor(hb,{minutes:hb.target.minutes??30,now:date===today?nowHm:null});
  if(hb.kind==='COUNT')return entryFor(hb,{count:hb.target.per==='DAY'&&hb.target.count?hb.target.count:1});
  return entryFor(hb,{});
}
function openBoardCell(ctx,st,row,date,{act,recordAction,openActionPast}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,input,field}=h;
  const today=kstDate(ctx.now()),body=el('div',null,'life-sheet-body hb-sheet');
  const dlg=sheet(row.name+' · '+dateLabel(date),body);
  if(row.kind==='ACTION'){
    if(date!==today||!recordAction){add(body,hint(BOARD_TEXT.actionPast),openActionPast?button('이력 열기',()=>{dlg.close();openActionPast(date);}):null);return;}
    add(body,add(el('div',null,'buttons'),...[['COMPLETE','done'],['PARTIAL','part'],['NOT_DONE','miss']].map(([o,s])=>button(BOARD_TEXT[s],()=>{dlg.close();recordAction(row.action,o);},s==='done'?'primary':'secondary'))));
    return;
  }
  // OPS1A: 지금 값은 초안이 있으면 초안 카드(누른 즉시 반영), 없으면 쌓인 카드.
  const hb=row.h,nowHm=hhmmFromIso(ctx.now()),e=(boardCard(ctx,st,date,today)?.habits??{})[hb.id]??null;
  // OPS1A (통제탑 2026-11-11): 앱이 autoStack을 켜면 칸은 그날 카드 초안에만 넣는다(연산 0). 쌓기는 자동 쌓기(5분)·지금 쌓기·저장 후 종료(그날 카드 1장 = 연산 1). 끄면 예전처럼 바로 쌓는다.
  const save=pick=>{dlg.close();const entry=boardEntry(hb,pick,{nowHm,date,today});const put=()=>st.flow.setHabit(date,hb.id,entry);stackAt(act,ctx,st,date,put,ctx.autoStack?()=>draftLoose(st,date):null)();};   // FIX70 (F2): 앱이 묶으면 초안에 넣고 상자에 확실히 남지 않았을 때만(메모리 초안 포함) 바로 쌓기, 끄면 예전처럼 바로 쌓기
  const err=el('p',null,'notice error');err.hidden=true;
  const fail=()=>{err.textContent=lifeErrorText('INVALID_LIFE_ENTRY');err.hidden=false;};
  add(body,el('p',BOARD_TEXT[habitState(hb,e)]+(e&&entryDone(hb,e)?' · '+habitValueText(hb,e,null):''),'muted small hb-now'));
  if(hb.kind==='DURATION'){
    const row1=el('div',null,'life-chip-row');for(const m of durationChips(hb.target.minutes))add(row1,chip(m+'분',{selected:e?.minutes===m,onClick:()=>save({minutes:m})}));
    const m=input(e?.minutes?String(e.minutes):'',{inputmode:'numeric','aria-label':'분 직접'});add(body,row1,add(el('div',null,'buttons'),field('분 직접',m),button('저장',()=>{const v=int(m.value);if(v>=1&&v<=1440)save({minutes:v});else fail();})));
  }else if(hb.kind==='COUNT'){
    const c=input(e?.count?String(e.count):'1',{inputmode:'numeric','aria-label':'횟수'});add(body,add(el('div',null,'buttons'),field('횟수',c),button('저장',()=>{const v=int(c.value);if(v>=1&&v<=99)save({count:v});else fail();},'primary')));
  }else if(hb.kind==='TIME'){
    const t=input(e?.at??(date===today?nowHm:hb.target.time&&hb.target.time!=='24:00'?hb.target.time:''),{},'time');add(body,add(el('div',null,'buttons'),field('시각 (KST)',t),button('저장',()=>{if(timeOK(t.value))save({at:t.value});else fail();},'primary')));
  }else add(body,add(el('div',null,'buttons'),button(BOARD_TEXT.done,()=>save('done'),'primary')));
  add(body,add(el('div',null,'buttons'),button(BOARD_TEXT.miss,()=>save('miss')),e?button(BOARD_TEXT.clear,()=>save(null)):null),hint(BOARD_TEXT.noneNote),err);
}
// FIX71 (CAP3 O-CAP3-1, 통제탑 2026-11-11): 화면이 보는 그날 카드 = 쌓인 카드 위에 이 기기 초안(s = LOCAL_DRAFT 상태)을 칸 단위로 얹은 것. 날짜 단위로 통째로 고르지 않는다.
// 초안의 칸 = 초안이 base(고치기 시작한 때의 금고 값) 대비 넣거나 바꾼 칸(초안 값)·지운 칸(빈칸). base에서 그대로 옮겨 온 칸은 쌓인 값(다른 탭이 그 사이 바로 쌓은 칸이 가려지지 않게).
// 기분·한 줄·날 종류도 초안이 바꾼 것만 초안 값. 판이 있는데 base를 못 찾으면 예전처럼 초안 카드 그대로. 화면용이며 쓰기 0(쌓기 결과·금고·연산은 그대로).
export function overlayDay(stacked,s){
  if(s?.status!=='LOCAL_DRAFT')return s?.card??stacked??null;
  if(!stacked||!s.changes||(!s.base&&s.baseHeads?.length))return s.card;
  const {added,modified,removed,scalars}=s.changes,habits={...stacked.habits};
  for(const id of [...added,...modified])habits[id]=s.card.habits[id];
  for(const id of removed)delete habits[id];
  const out={...stacked,habits};for(const k of scalars)out[k]=s.card[k];
  if(s.card.basis!==undefined&&(out.basis===undefined||!sameContent(s.card.basis,s.base?.basis)))out.basis=s.card.basis;   // 습관 벽돌 기준: 쌓기(rebase)와 같은 규칙
  return out;
}
const stackedDay=(ctx,date)=>(ctx.getWhole().life?.days??[]).find(d=>d.date===date)?.data??null;
// OPS1A: 성취표가 보는 그날 카드 = 이 기기 초안(지난 날 draftCards · 오늘 flowState)이 있으면 쌓인 카드 위에 칸 단위로 얹은 것(FIX71), 없으면 쌓인 카드. 화면용이며 쓰기 0.
function draftStateOf(st,date,today){
  if(st.draftCards?.[date])return st.draftStates?.[date]??{status:'LOCAL_DRAFT',card:st.draftCards[date]};
  if(date===today&&st.today===today&&st.flowState?.status==='LOCAL_DRAFT')return st.flowState;
  return null;
}
function boardCard(ctx,st,date,today){
  const s=draftStateOf(st,date,today),stacked=stackedDay(ctx,date);
  return s?overlayDay(stacked,s):stacked;
}
export function boardLife(ctx,st,life,today){
  if(!life)return life;
  const drafts={};for(const k of Object.keys(st.draftCards??{}))drafts[k]=draftStateOf(st,k,today);
  if(st.today===today&&st.flowState?.status==='LOCAL_DRAFT')drafts[today]=st.flowState;
  const keys=Object.keys(drafts);if(!keys.length)return life;
  const days=(life.days??[]).map(d=>drafts[d.date]?{...d,data:overlayDay(d.data,drafts[d.date])}:d);
  for(const k of keys)if(!days.some(d=>d.date===k))days.push({date:k,id:k,data:drafts[k].card,heads:[],updatedAt:null});
  days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  return {...life,days};
}
// ---- V8W5 기록 메인 화면에서 바로 숨기기·다시 보이기·추가 (소유자 2026-11-14) ----
// 행 이름을 누르면 [기록]·[숨기기]. 숨긴 항목은 맨 아래 "숨긴 항목 n개" 접힘에서 [다시 보이기]. 목록 끝 [+ 추가].
// 저장 = 기존 칸 그대로: 습관 = HABIT_DEF.hidden(습관 고르기 시트의 빼기·다시 켜기와 같은 collectRows·saveDefinitions, 바뀐 습관 1개 = 연산 1),
// 기본 행동 = ACTION.active(설정 "행동 편집"의 "오늘 화면에 활성화"와 같은 칸, 앱이 setActionShown으로 준다). 새 칸·새 종류 0.
export const QUICK_TEXT=Object.freeze({record:'기록',hide:'숨기기',show:'다시 보이기',add:'+ 추가',cancel:'취소',newName:'새 습관 이름',
  hidden:n=>'숨긴 항목 '+n+'개',hiddenNote:'숨겨도 지난 기록은 그대로예요 · 다시 보이면 그대로 보여요.',
  hid:name=>name+' · 숨겼어요 · 아래 "숨긴 항목"에서 다시 보이게 할 수 있어요.',shown:name=>name+' · 다시 보여요.',added:name=>name+' · 추가했어요.'});
// 습관 정의 작업본을 한 번 고쳐 바로 저장한다(습관 고르기 시트의 [저장]과 같은 길). 저장된 습관이 없으면 첫 저장 때 기본 습관을 함께 쓴다(collectRows 규칙 그대로).
export async function saveHabitChange(ctx,st,mutate,reason){
  const life=ctx.getWhole().life??{habits:[],days:[],subjects:[],exams:null},{defs,work}=habitPickWork(life),bases=definitionBases(life,defs);
  mutate(work.habits);
  const rows=collectRows(work,life,defs);
  for(const r of rows)validateLifeData(r.type,r.id,r.data);
  if(!rows.length)return {saved:0,sealed:false};
  const memo={},n=await saveDefinitions(ctx,rows,reason,memo,bases);
  return {saved:n,sealed:memo.sealed>0};
}
export function renderHabitBoard(root,ctx,st,{actionDefs=[],actionDays={},actionDetail=null,recordAction=null,openActionPast=null,setActionShown=null}={}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint}=h;
  const whole=ctx.getWhole(),today=kstDate(ctx.now()),life=ctx.autoStack?boardLife(ctx,st,whole.life??null,today):whole.life??null;   // OPS1A: 초안 칸도 바로 보인다
  st.board??={mode:'WEEK',anchor:today,open:null};
  // V8FIX L-06: 켜 둔 채 날이 바뀌면(일요일 자정 등) 사용자가 옮기지 않은 기준(= 어제의 오늘)은 새 오늘로 따라간다. 직접 옮긴 주·달은 그대로.
  const b=st.board;if(b.today!==today){if(b.today!==undefined&&b.anchor===b.today)b.anchor=today;b.today=today;}
  const dates=boardDates(b.mode,b.anchor);
  const board=habitBoard({life,actionDefs,actionDays,dates,today});
  const act=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{await fn();}catch(x){st.message=st.ports?.box?.ERROR_TEXT[x?.code]??lifeErrorText(x?.code);st.error=true;}await prepareLife(ctx,st);await ctx.rerender();});
  const sec=add(el('section',null,'panel hb-board'),null);sec.id='habit-board';
  const go=d=>()=>{b.anchor=d;void ctx.rerender();};
  const step=b.mode==='MONTH'?(n=>{const [y,m]=b.anchor.split('-').map(Number),x=new Date(Date.UTC(y,m-1+n,1));return x.toISOString().slice(0,10);}):(n=>shiftDay(b.anchor,7*n));
  const seg=add(el('div',null,'segment lb-segment hb-seg'),...[['WEEK',BOARD_TEXT.week],['MONTH',BOARD_TEXT.month]].map(([k,t])=>button(t,()=>{b.mode=k;void ctx.rerender();},b.mode===k?'selected':'secondary')));
  const range=b.mode==='MONTH'?dates[0].slice(0,4)+'년 '+Number(dates[0].slice(5,7))+'월':dateLabel(dates[0])+' ~ '+dateLabel(dates[6]);
  // V7B: "습관 고르기"(넣고 빼기·이름·순서) 시트를 성취표 머리에 둔다. 자세한 목표·난이도·고정은 기존 편집 시트 그대로
  add(sec,add(el('div',null,'hb-head'),el('h2',BOARD_TEXT.title,'panel-title'),add(el('div',null,'buttons hb-head-actions'),button(PICK_TEXT.open,()=>openHabitPicker(ctx,st),'secondary hb-pick'),button(BOARD_TEXT.add,()=>openEditor(ctx,st),'primary hb-add'))),
    add(el('div',null,'hb-nav'),seg,button('◀',go(step(-1)),'secondary'),el('strong',range,'hb-range'),button('▶',go(step(1)),'secondary'),b.anchor!==today?button('오늘',go(today),'secondary'):null));
  const ach=achieve({life:whole.life??null,study:whole.study??null,fin:whole.fin??null,today,money:ctx.money?.(today)??null}),wk=ach.currentWeek?.habitBricks??0;   // 벽돌 수는 쌓은 기록 기준(오늘 화면 XP와 같음)
  add(sec,el('p',BOARD_TEXT.bricks(wk,ach.habitBricks??0),'hb-bricks'),hint(BOARD_TEXT.brickRule));
  if(st.message)add(sec,el('p',st.message,st.error?'notice error life-message':'notice life-message'));
  const wrap=add(el('div',null,'hb-scroll'),null),table=el('table',null,'hb-table'+(b.mode==='MONTH'?' hb-month':''));add(wrap,table);
  const head=el('tr');add(head,el('th','습관','hb-name-col'));
  for(const d of dates){const dt=new Date(d+'T12:00:00Z'),th=el('th',null,'hb-date'+(d===today?' hb-today':''));add(th,el('span',WEEKDAY[dt.getUTCDay()],'hb-wd'),el('span',String(dt.getUTCDate()),'hb-dn'));add(head,th);}
  add(head,el('th',BOARD_TEXT.rate,'hb-stat-col'),el('th',BOARD_TEXT.streak,'hb-stat-col'));add(table,add(el('thead'),head));
  const tbody=el('tbody');add(table,tbody);
  const rowNode=r=>{
    const tr=el('tr',null,'hb-row'+(r.pinned?'':' hb-unpinned'));tr.dataset.habit=r.id;tr.dataset.kind=r.kind;
    const name=button(r.name,()=>{b.open=b.open===r.id?null:r.id;void ctx.rerender();},'hb-name');name.setAttribute('aria-expanded',String(b.open===r.id));
    add(tr,add(el('th',null,'hb-name-col'),name));
    for(const c of r.cells){
      const cell=el('button',STATE_MARK[c.state],'hb-cell hb-'+c.state+(c.date===today?' hb-today':''));cell.type='button';cell.dataset.state=c.state;cell.dataset.date=c.date;
      cell.setAttribute('aria-label',r.name+' '+dateLabel(c.date)+' '+BOARD_TEXT[c.state]);
      const fresh=Boolean(ctx.freshBefore?.(c.date));   // V7D1: 새 시작 기준 전 날짜 칸은 누를 수 없다(읽기 전용)
      if(fresh){cell.classList.add('hb-fresh');cell.setAttribute('aria-label',r.name+' '+dateLabel(c.date)+' '+(ctx.freshText?.badge??'새 시작 전 기록 · 읽기 전용'));}
      if(c.future||fresh)cell.disabled=true;else pressable(cell,()=>openBoardCell(ctx,st,r,c.date,{act,recordAction,openActionPast}),()=>{b.open=r.id;void ctx.rerender();});
      add(tr,add(el('td'),cell));
    }
    const rate=r.week?r.week.count+'/'+r.week.target+'회':r.rate===null?'—':r.rate+'%';
    add(tr,el('td',rate,'hb-stat'),el('td',r.streak?r.streak+'일':'—','hb-stat'));
    add(tbody,tr);
    if(b.open===r.id){
      const box=el('td',null,'hb-detail');box.colSpan=dates.length+3;
      // V8W5: 상세 맨 위 = [기록](오늘 칸과 같은 시트) · [숨기기]. 행동 숨기기는 앱이 길을 줄 때만(설정의 활성화 칸).
      const fresh=Boolean(ctx.freshBefore?.(today)),canHide=r.kind!=='ACTION'||Boolean(setActionShown);
      add(box,add(el('div',null,'buttons hb-quick'),
        fresh?null:button(QUICK_TEXT.record,()=>openBoardCell(ctx,st,r,today,{act,recordAction,openActionPast}),'primary hb-quick-record'),
        canHide?button(QUICK_TEXT.hide,()=>hideRow(r),'secondary hb-quick-hide'):null));
      if(r.kind==='ACTION')add(box,actionDetail?.(r.action)??hint('상세를 불러오지 못했어요.'));
      else add(box,el('p',KIND_TEXT[r.h.kind]+(r.h.target.time?' · 목표 '+r.h.target.time:'')+(r.h.target.minutes?' · 목표 '+r.h.target.minutes+'분':'')+(r.h.target.count?' · 목표 '+(r.h.target.per==='WEEK'?'주 ':'하루 ')+r.h.target.count+'회':'')+(r.pinned?' · 오늘 탭 고정':' · 오늘 탭 "더 보기"'),'muted small'),button('이름·고정·순서·보관 바꾸기',()=>openEditor(ctx,st),'secondary'));
      add(tbody,add(el('tr',null,'hb-detail-row'),box));
    }
  };
  // V8W5: 숨기기·다시 보이기·추가는 누르는 즉시 저장한다(습관 1개 = 연산 1, 행동 1개 = 연산 1).
  const habitSave=(mutate,reason,done)=>act(async()=>{const r=await saveHabitChange(ctx,st,mutate,reason);if(r.sealed){st.message=DEFS_SEALED_TEXT;return;}st.message=r.saved?done:PICK_TEXT.none;});
  function hideRow(r){
    if(b.open===r.id)b.open=null;
    if(r.kind==='ACTION'){setActionShown?.(r.id,false);return;}
    habitSave(list=>{const x=list.find(h=>h.id===r.id);if(x)x.hidden=true;},'기록 화면에서 숨기기',QUICK_TEXT.hid(r.name))();
  }
  for(const r of board.rows)rowNode(r);
  if(!board.rows.length)add(sec,hint('보이는 습관이 없습니다. 아래 "+ 추가"로 추가하세요.'));
  const foot=add(el('tr',null,'hb-day-row'),el('th',BOARD_TEXT.day,'hb-name-col'));
  for(const d of board.days)add(foot,el('td',d.rate===null?'':d.rate+'%','hb-day-rate'));
  add(foot,el('td'),el('td'));add(table,add(el('tfoot'),foot));
  add(sec,wrap,hint('● 완료 · ◐ 일부 · ○ 못함 · 빈칸 기록 없음(못함 아님) · 칸을 누르면 그 날 기록 · 이름을 누르면 기록·숨기기'+(b.mode==='MONTH'?' · 날짜 칸은 옆으로 밀어 보기':'')));
  // 목록 끝 [+ 추가]: 습관 고르기 시트의 새 습관과 같은 칸(이름 · 종류 · 목표).
  const addBox=add(el('div',null,'hb-add-box'),null);
  // V8FIX L-10: "+ 추가" 저장이 실패하면(습관 30개 상한 등, act가 st.error) 입력 줄을 다시 열고 적은 값(b.addDraft)을 그대로 둔다. 성공하면 비운다.
  if(b.addDraft&&!b.adding){if(st.error)b.adding=true;else b.addDraft=null;}
  if(b.adding){
    const dft=b.addDraft??{};
    const nn=h.input(dft.name??'',{maxlength:String(MAX_NAME),placeholder:QUICK_TEXT.newName,'aria-label':QUICK_TEXT.newName}),kind=h.select(NEW_HABIT_KINDS,dft.kind??'CHECK'),goal=h.input(dft.goal??'',{placeholder:'목표(시각 HH:MM · 분 · 주 횟수)','aria-label':'새 습관 목표',maxlength:'5'});kind.setAttribute('aria-label','새 습관 종류');
    const err=el('p',null,'notice error hb-add-error');err.hidden=true;
    add(addBox,add(el('div',null,'life-edit-row life-edit-new hb-add-row'),nn,kind,goal,button(QUICK_TEXT.add.replace('+ ',''),()=>{
      const name=nn.value.trim();if(!name){err.textContent=lifeErrorText('INVALID_LIFE_TEXT');err.hidden=false;return;}
      const t=newHabitTarget(kind.value,goal.value);if(!t){err.textContent=lifeErrorText('INVALID_HABIT_TARGET');err.hidden=false;return;}
      b.adding=false;b.addDraft={name:nn.value,kind:kind.value,goal:goal.value};
      habitSave(list=>{list.push({id:'h-'+ctx.uid().slice(0,12),name,kind:kind.value,target:t,difficulty:'AUTO',hidden:false,order:list.length,area:'BODY'});},'기록 화면에서 습관 추가',QUICK_TEXT.added(name))();
    },'primary hb-add-save'),button(QUICK_TEXT.cancel,()=>{b.adding=false;b.addDraft=null;void ctx.rerender();},'secondary')),err);
  }else add(addBox,button(QUICK_TEXT.add,()=>{b.adding=true;void ctx.rerender();},'secondary hb-add-open'));
  add(sec,addBox);
  // 맨 아래 "숨긴 항목 n개" 접힘: 숨긴 습관(HABIT_DEF.hidden) + 꺼 둔 기본 행동(ACTION.active=false, 행동 길이 있을 때만).
  const hiddenHabits=lifeDefs(whole.life??null).habits.filter(x=>x.hidden),hiddenActions=setActionShown?actionDefs.filter(a=>a&&!a.active):[];
  const nHidden=hiddenHabits.length+hiddenActions.length;
  if(nHidden){
    const fold=el('details',null,'hb-hidden');fold.open=Boolean(b.hiddenOpen);fold.addEventListener?.('toggle',()=>{b.hiddenOpen=fold.open;});
    add(fold,el('summary',QUICK_TEXT.hidden(nHidden),'hb-hidden-sum'),hint(QUICK_TEXT.hiddenNote));
    for(const a of hiddenActions){const row=add(el('div',null,'hb-hidden-row'),el('span',a.name,'hb-hidden-name'),button(QUICK_TEXT.show,()=>setActionShown(a.actionId,true),'secondary hb-hidden-show'));row.dataset.habit=a.actionId;add(fold,row);}
    for(const x of hiddenHabits){const row=add(el('div',null,'hb-hidden-row'),el('span',x.name,'hb-hidden-name'),button(QUICK_TEXT.show,habitSave(list=>{const y=list.find(z=>z.id===x.id);if(y)y.hidden=false;},'기록 화면에서 다시 보이기',QUICK_TEXT.shown(x.name)),'secondary hb-hidden-show'));row.dataset.habit=x.id;add(fold,row);}
    add(sec,fold);
  }
  root.append(sec);
  boardScroll(wrap,b,today);
  return sec;
}
// V6F (CAP1 1·2): 이름·달성·연속 열은 고정(CSS sticky)이고 날짜 칸만 가로로 민다. 이 보기(모드·기간)를 처음 열 때는 오늘 칸이 보이게, 다시 그릴 때는 민 자리를 그대로 둔다.
function boardScroll(wrap,b,today){
  const key=b.mode+'|'+b.anchor;
  wrap.addEventListener?.('scroll',()=>{b.scroll={key,left:wrap.scrollLeft};});
  const go=()=>{
    if(b.scroll?.key===key){wrap.scrollLeft=b.scroll.left;return;}
    const th=wrap.querySelector?.('th.hb-today'),name=wrap.querySelector?.('th.hb-name-col');if(!th||!name)return;
    wrap.scrollLeft=Math.max(0,th.offsetLeft-name.offsetWidth-(wrap.clientWidth-name.offsetWidth)/2+th.offsetWidth);b.scroll={key,left:wrap.scrollLeft};
  };
  const raf=globalThis.requestAnimationFrame;if(typeof raf==='function')raf(go);
}
// ---- 기록 탭: 지난 날짜 보기 ----
export function renderPastDays(root,ctx,st){
  const doc=ctx.document??globalThis.document,{el,add,button,hint,input}=maker(doc);
  const row=(t,d)=>add(el('div',null,'row'),add(el('div',null,'row-main'),el('strong',t),d?hint(d):null));
  const life=ctx.getWhole().life??{habits:[],days:[],subjects:[],exams:null},defs=lifeDefs(life),today=kstDate(ctx.now());
  st.pastDate??=shiftDay(today,-1);
  // V7D1: 새 시작 기준 전 날짜는 필터 전 원본(ctx.getRawWhole)에서 읽기만 한다(일기·그날의 방 줄 없음 = 편집·쌓기 단추 없음).
  const before=Boolean(ctx.freshBefore?.(st.pastDate)),rawLife=before?ctx.getRawWhole?.()?.life??null:null;
  const date=st.pastDate,day=(before?rawLife?.days??[]:life.days).find(d=>d.date===date)?.data??null;
  const nameOf=id=>life.habits.find(x=>x.id===id)?.data.name??defs.habits.find(x=>x.id===id)?.name??id;
  const kindOf=id=>(life.habits.find(x=>x.id===id)?.data??defs.habits.find(x=>x.id===id))?.kind??'CHECK';
  const go=d=>()=>{if(!dateKeyOK(d)){st.message='날짜는 YYYY-MM-DD 형식이어야 합니다.';void ctx.rerender();return;}st.pastDate=d;void ctx.rerender();};
  const dateIn=input(date,{inputmode:'numeric',placeholder:'YYYY-MM-DD',maxlength:'10','aria-label':'보고 싶은 날짜'});
  const sec=add(el('section',null,'panel life-past'),el('h2','지난 오늘 카드','panel-title'),hint('쌓은 하루 카드를 날짜별로 봅니다. 읽기만 하며 기록하지 않아요.'),
    add(el('div',null,'buttons'),button('◀ 전날',go(shiftDay(date,-1))),dateIn,button('이동',()=>go(dateIn.value.trim())()),button('▶ 다음날',go(shiftDay(date,1))),button('어제',go(shiftDay(today,-1)))));
  if(before)add(sec,el('p',ctx.freshText?.badge??'새 시작 전 기록 · 읽기 전용','notice fresh-badge'));
  if(!day)add(sec,hint(date+' 에 쌓은 카드가 없습니다.'));
  else{
    const ids=Object.keys(day.habits);
    add(sec,add(el('div',null,'rc-line'),el('strong',dateLabel(date)+' · '+DAY_TYPE_TEXT[day.dayType]),before?null:ctx.clearMenu?.('LIFE_DAY',date)??null));   // V7D2: 그날 카드 ⋯ 메뉴
    for(const id of ids){const e=day.habits[id],k=kindOf(id);add(sec,row(nameOf(id)+(life.habits.find(x=>x.id===id)?.data.hidden?' (숨김)':''),k==='TIME'?(e.at??'했음'):k==='DURATION'?(e.minutes??0)+'분':k==='COUNT'?(e.count??0)+'회':'했음'));}
    if(!ids.length)add(sec,hint('습관 기록이 없습니다.'));
    add(sec,row('기분',day.mood===null?'기록 없음':MOODS.find(m=>m[0]===day.mood)[1]+' '+MOODS.find(m=>m[0]===day.mood)[2]),day.note?row('한 줄',day.note):null);
  }
  if(!before){
    add(sec,diaryDayRow(ctx,date));   // FIX49B: 그날 일기 줄(점수·칩, 글은 눌러야 보임). 문이 닫혀 있고 일기도 없으면 없음
    add(sec,dayRoomCard(ctx,date));   // S1B "그날의 방": 그날 공부 카드 + 그날까지의 평생 분(읽기만, 진행 중 타이머 없음)
    add(sec,ctx.clearDay?.(date)??null);   // V7D2: 하루 상세의 "이 날 비우기"(값 있는 기록만, 가계부 없음)
  }
  root.append(sec);
  return sec;
}
// ---- V7D2 기록별 "비우기" (설계 V7D 4절 안 A0, 소유자 "기록별 수정 및 삭제를 할 수 있게") ----
// 비우기 = 그 기록을 기존 스키마의 빈 값으로 저장(1건 = 연산 1, 새 칸·새 종류·지움 표시 없음 → 옛 빌드도 받는다). 이전 값은 이력에 남는다.
// 가계부(FIN_*)는 대상이 아니다(무효화 그대로). 하루 전체 = 그날 값이 있는 LIFE_DAY·PLAN_DAY·STUDY_DAY·HLT_DAY·DIARY_DAY 중 체크한 것(가계부 없음).
// 절차(4.2): 확인 시트(지울 것·연산 수·남는 연산) → 빨간 "N개 비우기" → 8초 되돌리기 창 동안 보내지 않음(되돌리면·화면을 떠나면·앱을 닫으면 연산 0) → 보낸다.
// 충돌(4.3): 보내기 직전 최신 기록을 다시 읽어 heads가 확인 때와 다르면 비우지 않고 최신 내용으로 시트를 다시 연다. 쓰기는 expectedHeads(서버 STALE_HEADS도 같게).
// 오프라인·쓰기 권한 없음이면 단추를 막는다. 임시 저장(초안)으로 만들지 않는다(초안 승인 때 rebase가 지운 값을 되살릴 수 있음, 4.2-5).
export const CLEAR_TYPES=Object.freeze([...LIFE_CLEAR_TYPES,'STUDY_DAY','HLT_DAY']);
export const DAY_CLEAR_TYPES=Object.freeze(['LIFE_DAY','PLAN_DAY','STUDY_DAY','HLT_DAY','DIARY_DAY']);
export const CLEAR_UNDO_MS=8000;
export const CLEAR_TEXT=Object.freeze({
  menu:'이 기록 비우기',day:'이 날 비우기',title:'이 기록 비우기',dayTitle:'이 날 비우기',
  lead:'비우면 이 기록이 빈 값으로 저장돼요 · 기록 1건 = 저장 1번 · 이전 값은 이력에 남아 되살릴 수 있어요',
  dayLead:'값이 있는 기록만 보여요 · 가계부는 비우지 않아요 · 체크한 기록 1건 = 저장 1번',
  go:n=>n+'개 비우기',cancel:'취소',ops:(n,left)=>'저장 '+n+'번'+(left===null?' · 남은 저장 횟수 확인 불가':' · 비운 뒤 남는 저장 횟수 '+Math.max(0,left-n).toLocaleString('en-US')),   // 화면 낱말: "저장 횟수"(fin-ledger opBudgetNotice와 같은 말)
  snack:n=>n+'개 비우기 · 8초 뒤에 보내요',undo:'되돌리기',
  undone:'되돌렸어요 · 아무것도 보내지 않았어요(저장 0번)',left:'화면을 떠나 비우지 않았어요 · 아무것도 보내지 않았어요(저장 0번)',
  busy:'다른 저장이 진행 중이라 비우지 않았어요 · 아무것도 보내지 않았어요 · 다시 눌러 주세요',waiting:'앞의 비우기가 아직 되돌리기를 기다리고 있어요',
  done:n=>n+'개 비웠어요 · 이력에서 이전 값으로 되살릴 수 있어요',
  partial:n=>n+'개 비웠고 나머지는 못 비웠어요 · 남은 기록은 보내지 않았어요 · 연결을 확인하고 다시 골라 주세요',   // FIX73 (H71-4)
  stale:'다른 기기에서 바뀌어 비우지 않았어요 · 최신 내용을 확인하고 다시 골라 주세요',
  pending:'아직 안 쌓은 입력이 있어 비울 수 없어요 · 먼저 쌓거나 버려 주세요',pendingNow:'아직 안 쌓은 입력이 생겨 비우지 않았어요(저장 0번) · 먼저 쌓거나 버려 주세요',
  OFFLINE:'오프라인이라 비울 수 없어요 · 연결된 뒤 다시 해 주세요(임시 저장으로 만들지 않아요)',
  READ_ONLY:'지금은 쓰기 권한이 없어 비울 수 없어요 · 저장 준비가 된 뒤 다시 해 주세요(임시 저장으로 만들지 않아요)',
  restore:'이 값으로 되살리기',restoreAsk:'이 이전 값으로 되살릴까요? (저장 1번)',restored:'이전 값으로 되살렸어요',
});
const CLEAR_KIND=Object.freeze({...LIFE_CLEAR_KIND,STUDY_DAY:'공부 기록',HLT_DAY:'건강 기록'});
export function emptyRecord(type,id,data){
  if(type==='STUDY_DAY')return emptyStudyDay(data);
  if(type==='HLT_DAY')return emptyHltDay(data);
  return emptyLifeRecord(type,id,data);
}
export function recordEmpty(type,data){return type==='STUDY_DAY'?studyDayEmpty(data):type==='HLT_DAY'?hltDayEmpty(data):lifeRecordEmpty(type,data);}
// 금고 기록 하나(쌓인 값, 초안 아님). whole = 앱이 읽은 기록(새 시작 필터 뒤). 없으면 null.
export function recordOf(whole,type,id){
  const pick=list=>(Array.isArray(list)?list:[]).find(x=>x.date===id)??null;
  const r=LIFE_CLEAR_TYPES.includes(type)?lifeRecordOf(whole?.life,type,id):type==='STUDY_DAY'?pick(whole?.study?.days):type==='HLT_DAY'?pick(whole?.hlt?.days):null;
  return r?{type,id,data:r.data,heads:[...(r.heads??[])]}:null;
}
const clearDate=(type,id,data)=>LIFE_CLEAR_TYPES.includes(type)?lifeClearDate(type,id,data):id;
const clearCheckDate=(type,id,data)=>LIFE_CLEAR_TYPES.includes(type)?lifeClearCheckDate(type,id,data):id;   // 새 시작 판정 날짜(주 기록 = 그 주 일요일, life-model)
// 내용 글은 싣지 않는다(개수·글자 수만).
function clearSummary(type,d){
  const n=a=>Array.isArray(a)?a.length:0;
  if(type==='STUDY_DAY')return '세션 '+n(d.sessions)+' · 오답 '+n(d.mistakes)+' · 복습 '+n(d.reviews);
  if(type==='HLT_DAY')return '항목 '+n(d.items)+'개';
  return lifeRecordSummary(type,d);
}
// 비울 수 있는 대상(값이 있는 쌓인 기록). one = {type,id} 또는 date(하루 전체).
export function clearTargets(whole,{type=null,id=null,date=null}={}){
  const list=date?DAY_CLEAR_TYPES.map(t=>recordOf(whole,t,date)):[CLEAR_TYPES.includes(type)?recordOf(whole,type,id):null];
  return list.filter(r=>r&&!recordEmpty(r.type,r.data)).map(r=>({...r,date:clearDate(r.type,r.id,r.data),kind:CLEAR_KIND[r.type],summary:clearSummary(r.type,r.data)}));
}
const sameHeads=(a,b)=>JSON.stringify([...(a??[])].sort())===JSON.stringify([...(b??[])].sort());
// 이력의 이전 판으로 되살릴 값. 일기·리뷰는 이력 값에 글이 없어(D49 4.4) 되살릴 수 없다(null). 공부·건강은 confirmCount를 지금 값+1로.
export function restoreData(type,histData,cur){
  if(!CLEAR_TYPES.includes(type)||type==='DIARY_DAY'||type==='WEEK_REVIEW'||!histData||recordEmpty(type,histData))return null;
  if(type==='STUDY_DAY'||type==='HLT_DAY')return cur?{...structuredClone(histData),confirmCount:cur.data.confirmCount+1}:null;
  return structuredClone(histData);
}
// deps(앱이 넘긴다): doc, getWhole()(쌓인 기록), writable()→null|'OFFLINE'|'READ_ONLY', pending(type,id)→쌓지 않은 입력이 있나, opsLeft()→남은 연산|null,
// prepare()(동기화·쓰기 준비, 실패면 던짐), write(type,id,data,heads)(초안 없이 1건 쓰기), after()(다시 읽기), say(text,error), rerender(), perform(fn), before(date)(새 시작 전),
// sheet(title,body), host()(스낵바를 붙일 곳), timers {set,clear}, undoMs, confirm(text).
export function createRecordClear(deps){
  const d={undoMs:CLEAR_UNDO_MS,timers:{set:(f,ms)=>globalThis.setTimeout(f,ms),clear:id=>globalThis.clearTimeout(id)},sheet,...deps};
  const doc=d.doc??globalThis.document,{el,add,button}=maker(doc);
  let wait=null;   // {targets,timer,snack}
  const drop=n=>{if(!n)return;n.hidden=true;if(typeof n.remove==='function')n.remove();else if(n.rcHost?.children)n.rcHost.children=n.rcHost.children.filter(x=>x!==n);};
  const blocked=()=>{try{return d.writable?.()??null;}catch{return 'READ_ONLY';}};
  const usable=t=>CLEAR_TYPES.includes(t.type)&&!d.before?.(clearCheckDate(t.type,t.id,t.data));
  // 확인 시트. mode = 'ONE' | 'DAY'. stale = 최신 내용으로 다시 연 것.
  function open(targets,{mode='ONE',date=null,stale=false}={}){
    const body=el('div',null,'rc-sheet'),why=blocked(),left=(()=>{try{const b=d.opsLeft?.();return Number.isSafeInteger(b)?b:null;}catch{return null;}})();
    add(body,stale?el('p',CLEAR_TEXT.stale,'notice error rc-stale'):null,el('p',mode==='DAY'?CLEAR_TEXT.dayLead:CLEAR_TEXT.lead,'muted small rc-lead'));
    const rows=[],list=el('div',null,'rc-list');
    for(const t of targets){
      const held=Boolean(d.pending?.(t.type,t.id)),row=el('label',null,'rc-row'+(held?' held':'')),box=el('input');box.type='checkbox';box.checked=!held;box.disabled=held||mode!=='DAY';
      box.setAttribute('aria-label',t.kind+' '+t.date+' 비우기');
      add(row,box,add(el('span',null,'rc-what'),el('strong',t.kind,'rc-kind'),el('span',(t.date??'')+' · '+t.summary,'muted small rc-sum')),held?el('span',CLEAR_TEXT.pending,'notice rc-held'):null);
      rows.push({t,box,held});add(list,row);
    }
    const ops=el('p',null,'rc-ops'),note=why?el('p',CLEAR_TEXT[why]??CLEAR_TEXT.READ_ONLY,'notice error rc-blocked'):null;
    const chosen=()=>rows.filter(r=>r.box.checked&&!r.held).map(r=>r.t);
    let dlg=null;
    const go=button('',()=>{const list=chosen();if(!list.length||blocked())return;dlg?.close?.();start(list);},'rc-danger');
    const paint=()=>{const n=chosen().length;ops.textContent=CLEAR_TEXT.ops(n,left);go.textContent=CLEAR_TEXT.go(n);go.disabled=n===0||Boolean(why)||Boolean(wait);};
    for(const r of rows)r.box.addEventListener('change',paint);
    paint();
    add(body,list,ops,note,wait?el('p',CLEAR_TEXT.waiting,'notice rc-waiting'):null,add(el('div',null,'buttons rc-actions'),button(CLEAR_TEXT.cancel,()=>dlg?.close?.(),'secondary rc-cancel'),go));
    dlg=d.sheet(mode==='DAY'?CLEAR_TEXT.dayTitle+(date?' · '+date:''):CLEAR_TEXT.title,body);
    return {dlg,body,go,rows};
  }
  function start(targets){
    if(wait){d.say?.(CLEAR_TEXT.waiting,true);return null;}
    const snack=el('div',null,'rc-snack');snack.setAttribute('role','status');snack.dataset.freshKeep='1';
    const undo=button(CLEAR_TEXT.undo,()=>cancel('UNDO'),'secondary rc-undo');undo.dataset.navOnly='1';
    add(snack,el('span',CLEAR_TEXT.snack(targets.length),'rc-snack-text'),undo);
    const host=d.host?.()??doc.body;if(host){snack.rcHost=host;host.append(snack);}
    wait={targets:targets.map(t=>({type:t.type,id:t.id,date:t.date,kind:t.kind,heads:[...t.heads]})),snack,timer:d.timers.set(()=>fire(),d.undoMs)};
    return wait;
  }
  function cancel(reason='UNDO'){
    if(!wait)return false;
    const w=wait;wait=null;d.timers.clear(w.timer);drop(w.snack);
    d.say?.(reason==='UNDO'?CLEAR_TEXT.undone:CLEAR_TEXT.left,false);
    return true;
  }
  // 8초가 지났다: 이때 처음으로 보낸다. perform이 다른 일로 바쁘면 보내지 않는다.
  async function fire(){
    if(!wait)return {status:'NONE'};
    const w=wait;wait=null;d.timers.clear(w.timer);drop(w.snack);
    let ran=false,out={status:'SKIPPED'};
    await d.perform(async()=>{ran=true;out=await send(w.targets);});
    if(!ran)d.say?.(CLEAR_TEXT.busy,true);
    return out;
  }
  async function send(targets){
    const why=blocked();if(why){d.say?.(CLEAR_TEXT[why]??CLEAR_TEXT.READ_ONLY,true);return {status:'BLOCKED',code:why,written:0};}
    await d.prepare();   // 동기화 + 쓰기 준비(못 하면 던진다 → 앱 fail). 그 뒤 최신 기록으로 다시 견준다
    if(targets.some(t=>d.pending?.(t.type,t.id))){d.say?.(CLEAR_TEXT.pendingNow,true);return {status:'PENDING',written:0};}
    const now=d.getWhole(),cur=targets.map(t=>recordOf(now,t.type,t.id));
    const stale=()=>{const latest=targets.flatMap(t=>clearTargets(d.getWhole(),{type:t.type,id:t.id}));d.say?.(CLEAR_TEXT.stale,true);if(latest.length)open(latest,{mode:targets.length>1?'DAY':'ONE',date:targets[0]?.date??null,stale:true});};
    if(cur.some((c,i)=>!c||!sameHeads(c.heads,targets[i].heads))){stale();return {status:'STALE',written:0};}
    let written=0;
    for(const [i,t] of targets.entries()){
      try{await d.write(t.type,t.id,emptyRecord(t.type,t.id,cur[i].data),cur[i].heads);written++;}
      catch(e){if(e?.code==='STALE_HEADS'){try{await d.after?.();}catch{/* 안내가 먼저다 */}stale();return {status:'STALE',written};}
        // FIX73 (H71-4): STALE 아닌 오류(연결 끊김 등). 이미 비운 것이 있으면 다시 읽어 화면을 금고에 맞추고 몇 개만 비웠는지 알린다. 남은 것은 보내지 않는다.
        if(!written)throw e;
        try{await d.after?.();}catch{/* 안내가 먼저다 */}
        d.say?.(CLEAR_TEXT.partial(written),true);await d.rerender?.();
        return {status:'PARTIAL',written,code:e?.code??null};}
    }
    try{await d.after?.();}catch{/* 쓰기는 끝났다 */}
    d.say?.(CLEAR_TEXT.done(written),false);await d.rerender?.();
    return {status:'DONE',written};
  }
  // 카드 ⋯ 메뉴. 값이 있는 쌓인 기록이고 새 시작 뒤 날짜일 때만(아니면 null = 그리지 않음).
  function menu(type,id){
    const t=clearTargets(d.getWhole(),{type,id})[0]??null;if(!t||!usable(t))return null;
    const wrap=el('div',null,'rc-menu'),list=el('div',null,'rc-menu-list');list.hidden=true;wrap.dataset.freshKeep='1';
    const more=button('⋯',()=>{list.hidden=!list.hidden;more.setAttribute('aria-expanded',String(!list.hidden));},'lb-btn-text rc-more');more.dataset.navOnly='1';
    more.setAttribute('aria-label',t.kind+' 더보기');more.setAttribute('aria-haspopup','true');more.setAttribute('aria-expanded','false');
    const item=button(CLEAR_TEXT.menu,()=>{list.hidden=true;more.setAttribute('aria-expanded','false');open(clearTargets(d.getWhole(),{type,id}));},'lb-btn-text rc-menu-item');item.dataset.navOnly='1';
    add(wrap,more,add(list,item));return wrap;
  }
  // 하루 전체 단추(달력·하루 상세). 값이 있는 기록이 없거나 새 시작 전 날짜면 null.
  function dayButton(date,{before:pre=null}={}){
    if(d.before?.(date)||!clearTargets(d.getWhole(),{date}).length)return null;
    const b=button(CLEAR_TEXT.day,()=>{pre?.();open(clearTargets(d.getWhole(),{date}),{mode:'DAY',date});},'secondary rc-day');b.dataset.navOnly='1';b.dataset.date=date;
    return b;
  }
  // 이력 줄의 "이 값으로 되살리기"(1연산). 지금 기록이 빈 값이고 그 줄이 이전 값일 때만.
  function restoreButton(row){
    const type=row?.type,id=row?.value?.entityId,data=row?.value?.data;
    if(!CLEAR_TYPES.includes(type)||typeof id!=='string')return null;
    const cur=recordOf(d.getWhole(),type,id);if(!cur||!recordEmpty(type,cur.data)||!usable(cur))return null;
    if(!restoreData(type,data,cur))return null;
    const b=button(CLEAR_TEXT.restore,()=>{
      if(!(d.confirm?.(CLEAR_TEXT.restoreAsk)??true))return;
      void d.perform(async()=>{
        const why=blocked();if(why){d.say?.(CLEAR_TEXT[why]??CLEAR_TEXT.READ_ONLY,true);return;}
        await d.prepare();
        const now=recordOf(d.getWhole(),type,id);if(!now||!sameHeads(now.heads,cur.heads)){d.say?.(CLEAR_TEXT.stale,true);await d.rerender?.();return;}
        await d.write(type,id,restoreData(type,data,now),now.heads,'이전 값으로 되살리기');
        try{await d.after?.();}catch{/* 쓰기는 끝났다 */}
        d.say?.(CLEAR_TEXT.restored,false);await d.rerender?.();
      });
    },'secondary rc-restore');
    return b;
  }
  return {menu,dayButton,restoreButton,open,start,cancel,fire,send,waiting:()=>wait};
}
export {lifeIdOK,targetTimeOK,subjectOfSession,emptyDay,dayNumber};
export {createPlanDrafts} from './life-flow.mjs';   // OPS1A: 앱이 계획 초안(PLAN_DAY 묶기)을 만들 때 쓴다(앱은 이 모듈만 불러온다)
