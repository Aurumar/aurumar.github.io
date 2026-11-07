// 오늘 화면 Core + 습관 편집 + 지난 날짜 보기 (B41). 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음).
// 열기·동기화만으로는 아무것도 쓰지 않는다. 입력은 이 기기의 임시 저장(연산 0)에 모이고, "오늘 쌓기"를 눌러야 하루 카드 1장이 쌓인다(연산 1).
// 기본 습관·과목·시험 일정은 코드 상수를 보여 줄 뿐이며, 소유자가 편집 화면에서 "저장"을 누를 때만 엔티티가 된다.
// 공부 벽돌은 기존 공부 모듈(STUDY_DAY)의 세션으로 기록한다(ctx.study 포트).
import {chip,toggle,sheet,xpBar,ring} from './ui-kit.mjs';
import {LifeFlow,createLifePorts,saveDefinitions,DEFS_SEALED_TEXT,collectRows,stackDay,STACK_DONE} from './life-flow.mjs';
import {achieve,previewAchieve,habitXpToday,multText} from './life-achieve.mjs';
import {todayQuestLine} from './life-quest.mjs';
import {timerElapsedMin,timerRecordMin,liveTick} from './study-stage.mjs';
import {OVERLAP_NOTICE,TIMER_OVERLAP_NOTICE} from './study-rebase.mjs';
import {renderLive,liveRecordMin,liveElapsedMin,liveSettings,REST_SPLIT_MS} from './study-live.mjs';
import {dayRoomCard,CELEBRATED_KEY} from './study-room.mjs';
import {examLineText,daySummary,barsText} from './life-plan.mjs';
import {HABIT_KINDS,HABIT_AREAS,DAY_TYPES,MAX_NAME,MAX_NOTE,SUBJECT_COLOR_KEYS,HABIT_HINTS,
  kstDate,shiftDay,dateKeyOK,dayNumber,hhmmFromIso,timeOK,targetTimeOK,lifeIdOK,
  brickOf,sumBricks,entryDone,nearestExam,lifeDefs,weekCount,studyCodeOf,sessionIdFor,timerSessionId,timerTagFrom,subjectOfSession,emptyDay} from './life-model.mjs';

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
  MD_NOT_WRITE_READY:'지금은 서버에 쌓을 수 없습니다. 입력은 이 기기에 남아 있습니다.',
  ABORTED:'서버가 이 쌓기를 받지 않았습니다(기록되지 않음) · 입력은 그대로 있습니다. 다시 쌓을 수 있습니다.',
  INVALID_TIMER_END:'끝난 시각은 시작 뒤 24시간 안이고 지금보다 앞이어야 합니다.',
  INVALID_TIMER_END_REST:'끝난 시각은 휴식을 시작한 시각보다 늦을 수 없습니다.',
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

export function createLifeState(){return {today:null,flow:null,ports:null,boxRef:null,flowState:null,studyCard:null,pending:[],subjectId:null,timer:null,message:null,error:false,notices:[],pastDate:null,editing:false,floatXp:null,liveOpen:false};}

// B2C (DEFECT-6): 상자 쓰기 실패는 save가 던지지 않는다(설계). 버튼이 끝났을 때 오늘 카드·공부 벽돌 초안이 실패 상태면 성공 문구 대신 실패 문구를 보인다. 쌓기가 성공하면 초안이 지워져 has가 거짓이다.
// R33B (HUNT32 S1): 그 칸 자체의 실패(own)만 본다. 다른 날짜·종류 초안의 실패는 위쪽 상자 전체 빨간 줄이 따로 알린다.
function flagBoxFail(st,date){
  const box=st.ports?.box;
  for(const kind of ['LIFE_DAY','STUDY_DAY']){const b=box?.statusFor(kind,date);if(b?.has&&b.own&&!st.error){st.message=box.ERROR_TEXT[b.own]??box.TEXT.failed;st.error=true;}}
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
  const [flowState,dates]=await Promise.all([st.flow.state(st.today),st.flow.draftDates()]);
  let studyCard=null;
  try{const s=await studyFlow(ctx);if(s)studyCard=(await s.st.flow.state(st.today));}catch{studyCard=null;}
  if(gone())return st;
  st.flowState=flowState;st.studyCard=studyCard;
  st.pending=dates.filter(d=>d<st.today).slice(-3);
  currentTimer(st,ctx.storage??globalThis.localStorage);
  return st;
}
// FIX37C (H37-S2): 잠금·로그아웃. 덮개 째깍·벽돌 사건을 멈추고 메모리 값을 비운다. 저장소는 쓰지 않는다(타이머 칸은 그대로라 잠금을 풀면 prepareLife가 다시 읽는다).
export function lockLife(st){
  if(!st)return;
  st.liveStop?.();st.liveStop=null;st.endSheet=null;
  st.timer=null;st.liveOpen=false;st.flowState=null;st.studyCard=null;st.pending=[];st.message=null;st.error=false;st.focusNote=null;
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
  const defs=lifeDefs(life),fs=st.flowState,date=st.today,card=fs.card,box=st.ports?.box??null,T=box?.TEXT;
  const act=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{await fn();}catch(e){st.message=box?.ERROR_TEXT[e?.code]??lifeErrorText(e?.code);st.error=true;}flagBoxFail(st,date);await prepareLife(ctx,st);await ctx.rerender();});
  const out=add(el('section',null,'panel next-panel life-panel'),null);out.id='life-today';

  // 1) 머리: 날짜, 수능 + 다음 시험 D-day(FIX44, 계획 탭과 같은 글, 잠정 배지), 오늘 XP 링(쌓은 기록 기준), 연속·레벨 칩
  const exam=nearestExam(defs.exams,date),examText=examLineText(defs.exams,date);
  const examLine=examText?add(el('div',null,'life-exam'),el('strong',examText,'life-dday'),exam?.status==='잠정'?el('span','잠정','life-badge'):null):hint('시험 일정이 없습니다. 습관 편집에서 추가하세요.');
  const money=ctx.money?.(date)??null,ach=achieve({life:whole.life??null,study:whole.study??null,fin:whole.fin??null,today:date,money}),topLevel=ach.levels[ach.topArea];
  const xpSlot=add(el('div',null,'life-xp-slot'),ring(ach.todayXp,ach.goalXp,{size:64}));xpSlot.id='xp-slot';xpSlot.setAttribute('aria-label','오늘 XP '+ach.todayXp+' / '+ach.goalXp);
  const chips=add(el('div',null,'life-chips'),el('span',ach.todayXp+' / '+ach.goalXp+' XP','life-xp-text'),(()=>{const n=el('span','연속 '+ach.streak.days+'일 '+multText(ach.streak.mult10),'life-chip-slot');n.id='streak-chip';return n;})(),(()=>{const n=el('span',AREA_TEXT[ach.topArea]+' Lv '+topLevel.level,'life-chip-slot');n.id='level-chip';return n;})());
  const title=ctx.achvTitle?.({doc,ach,life:whole.life??null,money,storage:ctx.storage});   // Q1C: 칭호 칩(앱이 넘긴다, 표시만)
  const healthText=ctx.healthLine?.(date)??null;   // FIX45 (AUD1 #9): 수면·걸음 한 줄(건강 모듈이 꺼져 있으면 없다)
  let healthNode=null;if(healthText){healthNode=el('p',healthText,'life-health-line');healthNode.id='today-health';}
  add(out,add(el('div',null,'life-head'),add(el('div',null,'life-head-main'),el('span','TODAY','eyebrow'),el('h2',dateLabel(date),'panel-title'),title?.node,examLine),add(el('div',null,'life-head-side'),xpSlot,chips)),
    summaryLine(ctx,h,{life,ach,date,study:whole.study??null}),healthNode);
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
  for(const d of st.pending)add(status,add(el('div',null,'notice life-yesterday'),el('span',(d===shiftDay(date,-1)?'어제':dateLabel(d))+' 카드를 아직 쌓지 않았어요. '),button((d===shiftDay(date,-1)?'어제':dateLabel(d))+' 카드 쌓기',act(async()=>{const r=await st.flow.confirm(d);await reportConfirm(ctx,st,r);}),'primary')));

  // 3) 습관 격자(FIX44: 여기서는 만들기만 하고, 자리는 공부 벽돌 아래)
  const grid=el('div',null,'life-habits');
  const hs=defs.habits.filter(x=>!x.hidden);
  if(!hs.length)add(grid,hint('보이는 습관이 없습니다. 습관 편집에서 추가하거나 숨김을 풀어 주세요.'));
  const floatXp=st.floatXp;st.floatXp=null;
  const setEntry=(hb,make)=>act(async()=>{
    const wasDone=entryDone(hb,card.habits[hb.id]??null),entry=make();
    await st.flow.setHabit(date,hb.id,entry);
    if(!wasDone&&entry&&entryDone(hb,entry))st.floatXp={habitId:hb.id,text:'+'+habitXpToday(ach,hb.id)};   // 다시 그린 뒤 칸 위에 잠깐 보인다
  });
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
    add(grid,cell);
  }

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
  add(out,questSlot,add(el('div',null,'life-habits-head'),el('h3','습관'),button('습관 편집',()=>openEditor(ctx,st),'secondary')),grid);

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
  add(out,add(el('div',null,'life-stack-bar'),stackBtn,el('span',dirty||studyDirty?'변경 있음':fs.status==='CONFIRMED'?'쌓음':'','muted small life-stack-note')));
  root.append(out);
  return out;
}
// FIX44 (AUD1 #3·#2·#7): 머리 바로 아래 요약 한 줄. 보여 주기만 한다(쓰기 0). 복습 건수·복습 열기·백업 열기·빠른 지출은 앱이 ctx로 넘긴다(없으면 그 조각을 그리지 않는다).
const hoursText=m=>{const h=Math.floor(m/60),r=m%60;return (h?h+'시간':'')+(h&&r?' ':'')+(r||!h?r+'분':'');};
// 어제 공부 시간: 쌓은 공부 카드의 확인한 분 합(공부 요약과 같이 상태를 가리지 않는다). 아직 쌓지 않은 초안은 넣지 않는다.
export function yesterdayMinutes(study,date){
  const d=shiftDay(date,-1),card=(study?.days??[]).find(x=>x.date===d)?.data;
  return (card?.sessions??[]).reduce((n,s)=>n+(s.confirmedMin>0?s.confirmedMin:0),0);
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
export const BACKUP_STEPS=Object.freeze(['① PC에서 서버 내보내기(지휘소 안내대로)','② 백업 폴더와 외장 드라이브에 복사','③ 여기서 [오늘 백업했어요]']);
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
    add(card,el('h2','백업','panel-title'),el('p','마지막 주간 백업: '+(mark??'표시 없음')+' ('+BACKUP_NOTE+')','backup-last'),press,...BACKUP_STEPS.map(s=>hint(s)),note?el('p',note,'notice error backup-note'):null);
    return card;
  };
  const card=draw(null);root.append(card);return card;
}
async function reportConfirm(ctx,st,r){
  st.notices=r.notices??[];
  if(r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED')await ctx.reload?.();   // 쌓은 카드를 화면이 다시 읽는다(안 읽으면 방금 쌓은 카드가 비어 보인다)
  if(r.status==='REJECTED'){st.message=lifeErrorText(r.code);st.error=true;}
  else if(['UNKNOWN','SYNC_FAILED','FAILED','STALE'].includes(r.status)){st.message=(r.code&&LIFE_ERROR_TEXT[r.code])||STATUS_TEXT[r.status];st.error=true;}
  else st.message=STATUS_TEXT[r.status]??'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+r.status+'\u2060';
  // B54: 쌓기 성공(STACK_DONE) 직후 사령부 상태 자동 내보내기. 성공 여부·표면(PC 앱)·토글 검사와 실패 문구 덧붙이기는 state-export.mjs의 exportAfterStack 안에 있다.
  // 실패해도 쌓기 결과(status·error)는 바꾸지 않는다.
  // FIX31 (S2): 같은 쌓기에서 공부 카드가 확정됐으면(r.studyStatus) 오늘 카드 결과가 확정이 아니어도 그 확정으로 내보낸다(호출은 그대로 쌓기마다 1번).
  if(!STACK_DONE.includes(r.status)&&STACK_DONE.includes(r.studyStatus))r={...r,status:r.studyStatus};
  try{await ctx.exportAfterStack?.(st,r.status);}catch{st.message=(st.message??'')+' · 상태 내보내기 실패: 내보내지 못했습니다.';}
}
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
  const NS='http://www.w3.org/2000/svg',svg=doc.createElementNS(NS,'svg'),c=doc.createElementNS(NS,'circle');
  svg.setAttribute('class','life-dot');svg.setAttribute('width','10');svg.setAttribute('height','10');svg.setAttribute('viewBox','0 0 10 10');svg.setAttribute('aria-hidden','true');
  c.setAttribute('cx','5');c.setAttribute('cy','5');c.setAttribute('r','5');c.setAttribute('fill',color);svg.append(c);
  node.classList.add('lb-chip-custom');node.prepend(svg);
}
// ---- 공부 벽돌 ----
function todayMinutes(st,whole,date){
  const card=st.studyCard?.card??whole.study?.days?.find(d=>d.date===date)?.data??null;
  return (card?.sessions??[]).map(s=>s.confirmedMin).filter(m=>m>0);
}
function renderBricks(ctx,st,h,defs,life,act,goalBricks,liveSlot=null){
  const {el,add,button,hint,input}=h,date=st.today;
  const sec=add(el('div',null,'life-bricks'),el('h3','공부 벽돌'));
  const subjects=defs.subjects.filter(s=>!s.hidden);
  if(!ctx.study?.()){add(sec,hint('공부 기능이 꺼져 있어 벽돌을 쌓을 수 없습니다. 설정에서 켜세요.'));return sec;}
  if(st.subjectId===null||!subjects.some(s=>s.id===st.subjectId))st.subjectId=subjects[0]?.id??null;
  const row=el('div',null,'life-chip-row');
  for(const s of subjects){
    const key=SUBJECT_COLOR_KEYS[s.color.toUpperCase()]??null;
    const c=chip(s.name+(s.bridge?' · 징검다리':''),{selected:st.subjectId===s.id,color:key,onClick:()=>{st.subjectId=s.id;void ctx.rerender();}});
    c.dataset.subjectId=s.id;c.dataset.color=s.color;if(key===null)colorDot(ctx.document??globalThis.document,c,s.color);add(row,c);
  }
  add(sec,row);
  const minutes=todayMinutes(st,ctx.getWhole(),date);
  const sum=sumBricks(minutes);
  add(sec,xpBar(sum.value,goalBricks,{label:'오늘 벽돌 (장)'}),hint(sum.bricks+'장'+(sum.pieces?' + 조각 '+sum.pieces:'')+' · 30분 = 1장, 10~29분 = 조각, 9분 이하는 세지 않아요 · 오늘 목표 '+goalBricks+'장'));
  const {recordNow,finishTimer}=timerOps(ctx,st,act);
  return bricksTimer(ctx,st,h,defs,subjects,sec,act,recordNow,finishTimer,goalBricks,liveSlot);
}
// P1B: 담기 함수는 공부 벽돌 카드와 오늘 계획 카드(focusPort)가 같이 쓴다(본문은 B6·R33B·R34B·FIX31·FIX34 그대로, 자리만 renderBricks 밖으로).
function timerOps(ctx,st,act){
  // B6: 타이머 "끝내고 담기"만 세션 id에 T 표지(lf_<과목>_T…)를 붙인다 → 구간 [at − 분, at]을 아는 세션. 분 입력은 그대로(구간 모름).
  // R34B: 타이머는 시작 시각에서 정한 id(lf_<과목>_T<시작 ms 36진>)를 넘긴다(B6 T 표지 + R33B 멱등). id가 없을 때만 표지 + uid로 만든다.
  const recordNow=async(subject,m,mark='',id=null)=>{
    if(!(Number.isInteger(m)&&m>=1&&m<=1440))throw Object.assign(new Error('INVALID_LIFE_MINUTES'),{code:'INVALID_LIFE_MINUTES'});
    const s=await studyFlow(ctx);if(!s)throw Object.assign(new Error('STUDY_OFF'),{code:'STUDY_OFF'});
    const now=mark==='T'&&st.timer?.endIso?st.timer.endIso:ctx.now();   // FIX34 (H4·H5): 타이머 세션은 적어 둔 끝 시각으로 기록한다(구간 [at − 분, at]과 카드 날짜가 실제 집중에 맞게)
    await s.st.flow.addRow(kstDate(now),'sessions',{id:id??sessionIdFor(subject.id,mark?mark+ctx.uid().slice(0,7):ctx.uid().slice(0,8)),subject:studyCodeOf(subject.id),state:'COMPLETED',plannedMin:m,confirmedMin:m,restartLocator:'',at:now});
    const b=brickOf(m);st.message=subject.name+' '+m+'분을 담았습니다 · '+(b.bricks?b.bricks+'장':'')+(b.bricks&&b.pieces?' + ':'')+(b.pieces?'조각 1':'')+(!b.bricks&&!b.pieces?'벽돌 0 (10분부터 조각)':'')+' · "오늘 쌓기"를 누르면 함께 쌓입니다';
    return kstDate(now);
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
      st.liveOpen?null:button('끝내고 담기',act(()=>finishTimer(ts??subject,t.startIso,rested?liveRecordMin(t,ctx.now()):timerRecordMin(t.startIso,ctx.now()))),'primary'),   // 덮개가 열려 있으면 그 안의 같은 단추를 쓴다
      button('취소',()=>{st.timer=null;writeTimer(store,null);st.liveOpen=false;void ctx.rerender();}));
  }else add(timerRow,button('집중 시작',()=>{st.timer={subjectId:subject.id,startIso:ctx.now(),...newTimerTag(ctx)};writeTimer(store,st.timer);st.liveOpen=liveSettings(store).autoOpen;void ctx.rerender();},'primary'));
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
    const live=renderLive(ctx,{timer:t,subject:ts??subject,open:st.liveOpen,draftCard:st.studyCard?.card??null,exams:defs.exams,goalBricks,on:{
      finish:act(()=>finishTimer(ts??subject,t.startIso,liveRecordMin(t,ctx.now()))),pause,resume,
      expand:()=>{st.liveOpen=true;void ctx.rerender();},collapse:()=>{st.liveOpen=false;void ctx.rerender();},
      storage:()=>{st.timer=readTimer(store);if(!st.timer)st.liveOpen=false;void ctx.rerender();}}});   // 다른 탭의 휴식·담기·취소를 따라간다
    st.liveStop=live.stop;
    add(liveSlot??sec,live.card,live.dialog);
  }
  const min=input('',{inputmode:'numeric',placeholder:'분','aria-label':'공부한 분'});
  add(timerRow,min,button('분 입력으로 담기',act(async()=>{await recordNow(subject,int(min.value));min.value='';}),'secondary'));
  add(sec,timerRow);
  return sec;
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
  const apply=entry=>{dlg.close();void ctx.perform(async()=>{st.message=null;st.error=false;try{await st.flow.setHabit(date,hb.id,entry);}catch(x){st.message=lifeErrorText(x?.code);st.error=true;}flagBoxFail(st,date);await prepareLife(ctx,st);await ctx.rerender();});};
  add(body,err,add(el('div',null,'buttons'),button('저장',()=>{try{apply(read());}catch(x){err.textContent=lifeErrorText(x.code);err.hidden=false;}},'primary'),e?button('지우기',()=>apply(null)):null));
}

// ---- 습관·과목·시험 일정 편집 시트 ----
export function openEditor(ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,input,select,field}=h;
  const life=ctx.getWhole().life??{habits:[],days:[],subjects:[],exams:null},defs=lifeDefs(life);
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
      add(row,diff,area,toggle('숨김',x.hidden,on=>{x.hidden=on;}),button('▲',()=>{move(work.habits,i,-1);rerender();},'secondary'),button('▼',()=>{move(work.habits,i,1);rerender();},'secondary'));
      add(body,row);
    });
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:'새 습관 이름'}),kind=select(HABIT_KINDS.map(k=>[k,KIND_TEXT[k]]),'CHECK');
    add(body,add(el('div',null,'life-edit-row'),nn,kind,button('습관 추가',()=>{
      const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}
      work.habits.push({id:'h-'+ctx.uid().slice(0,12),name,kind:kind.value,target:{time:null,minutes:null,count:kind.value==='COUNT'?1:null,per:kind.value==='COUNT'?'WEEK':'DAY'},difficulty:'AUTO',hidden:false,order:work.habits.length,area:'BODY'});rerender();
    },'primary')),hint('삭제 대신 숨김을 씁니다 · 지난 기록은 그대로 남아요. 종류는 만든 뒤 바꿀 수 없어요.'));
  };
  const subjectsPane=()=>{
    work.subjects.forEach((x,i)=>{
      const name=input(x.name,{maxlength:String(MAX_NAME),'aria-label':'과목 이름'});name.addEventListener('input',()=>{x.name=name.value;});
      const color=input(x.color,{'aria-label':'과목 색'},'color');color.addEventListener('input',()=>{x.color=color.value.toUpperCase();});
      add(body,add(el('div',null,'life-edit-row'),name,color,toggle('수능 과목',x.exam,on=>{x.exam=on;}),toggle('징검다리',x.bridge,on=>{x.bridge=on;}),toggle('숨김',x.hidden,on=>{x.hidden=on;}),button('▲',()=>{move(work.subjects,i,-1);rerender();},'secondary'),button('▼',()=>{move(work.subjects,i,1);rerender();},'secondary')));
    });
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:'새 과목 이름'});
    add(body,add(el('div',null,'life-edit-row'),nn,button('과목 추가',()=>{const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}work.subjects.push({id:'s'+ctx.uid().slice(0,12),name,color:'#C9A227',exam:false,bridge:false,hidden:false,order:work.subjects.length});rerender();},'primary')),hint('생물은 수능 과목이 아니라 공부를 시작하게 만드는 징검다리 과목입니다.'));
  };
  const examsPane=()=>{
    work.exams.items.forEach((x,i)=>{
      const name=input(x.name,{maxlength:String(MAX_NAME),'aria-label':'시험 이름'});name.addEventListener('input',()=>{x.name=name.value;});
      const date=input(x.date,{'aria-label':'시험 날짜'},'date');date.addEventListener('input',()=>{x.date=date.value;});
      const status=select([['잠정','잠정'],['확정','확정']],x.status);status.setAttribute('aria-label','잠정 또는 확정');status.addEventListener('change',()=>{x.status=status.value;});
      add(body,add(el('div',null,'life-edit-row'),name,date,status,x.status==='잠정'?el('span','잠정','life-badge'):null,button('빼기',()=>{work.exams.items.splice(i,1);rerender();},'secondary')));
    });
    const nn=input('',{maxlength:String(MAX_NAME),placeholder:'새 시험 이름'});
    add(body,add(el('div',null,'life-edit-row'),nn,button('시험 추가',()=>{const name=nn.value.trim();if(!name){showErr('INVALID_LIFE_TEXT');return;}work.exams.items.push({id:'e-'+ctx.uid().slice(0,12),name,date:ctx.now().slice(0,10),status:'잠정'});rerender();},'primary')),hint('날짜는 발표 전 잠정값입니다. 확정되면 상태를 "확정"으로 바꾸세요.'));
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
        try{const n=await saveDefinitions(ctx,rows,'습관·과목·시험 일정 편집',memo);sealed=memo.sealed>0;st.message=sealed?DEFS_SEALED_TEXT:n?n+'건을 저장했습니다.':'바뀐 것이 없어 저장하지 않았습니다.';}
        catch(x){st.message=lifeErrorText(x?.code);st.error=true;}
        await prepareLife(ctx,st);await ctx.rerender();
        if(sealed&&!ctx.locked?.()){note.hidden=false;open();}   // FIX38: 임시 저장은 성공이 아니다. 고친 내용이 든 시트를 다시 연다. 잠겼으면 열지 않는다(H37-S2)
      });
    }catch(x){showErr(x?.code);}
  },'primary');
  open();
}
// ---- 기록 탭: 지난 날짜 보기 ----
export function renderPastDays(root,ctx,st){
  const doc=ctx.document??globalThis.document,{el,add,button,hint,input}=maker(doc);
  const row=(t,d)=>add(el('div',null,'row'),add(el('div',null,'row-main'),el('strong',t),d?hint(d):null));
  const life=ctx.getWhole().life??{habits:[],days:[],subjects:[],exams:null},defs=lifeDefs(life),today=kstDate(ctx.now());
  st.pastDate??=shiftDay(today,-1);
  const date=st.pastDate,day=life.days.find(d=>d.date===date)?.data??null;
  const nameOf=id=>life.habits.find(x=>x.id===id)?.data.name??defs.habits.find(x=>x.id===id)?.name??id;
  const kindOf=id=>(life.habits.find(x=>x.id===id)?.data??defs.habits.find(x=>x.id===id))?.kind??'CHECK';
  const go=d=>()=>{if(!dateKeyOK(d)){st.message='날짜는 YYYY-MM-DD 형식이어야 합니다.';void ctx.rerender();return;}st.pastDate=d;void ctx.rerender();};
  const dateIn=input(date,{inputmode:'numeric',placeholder:'YYYY-MM-DD',maxlength:'10','aria-label':'보고 싶은 날짜'});
  const sec=add(el('section',null,'panel life-past'),el('h2','지난 오늘 카드','panel-title'),hint('쌓은 하루 카드를 날짜별로 봅니다. 읽기만 하며 기록하지 않아요.'),
    add(el('div',null,'buttons'),button('◀ 전날',go(shiftDay(date,-1))),dateIn,button('이동',()=>go(dateIn.value.trim())()),button('▶ 다음날',go(shiftDay(date,1))),button('어제',go(shiftDay(today,-1)))));
  if(!day)add(sec,hint(date+' 에 쌓은 카드가 없습니다.'));
  else{
    const ids=Object.keys(day.habits);
    add(sec,el('strong',dateLabel(date)+' · '+DAY_TYPE_TEXT[day.dayType]));
    for(const id of ids){const e=day.habits[id],k=kindOf(id);add(sec,row(nameOf(id)+(life.habits.find(x=>x.id===id)?.data.hidden?' (숨김)':''),k==='TIME'?(e.at??'했음'):k==='DURATION'?(e.minutes??0)+'분':k==='COUNT'?(e.count??0)+'회':'했음'));}
    if(!ids.length)add(sec,hint('습관 기록이 없습니다.'));
    add(sec,row('기분',day.mood===null?'기록 없음':MOODS.find(m=>m[0]===day.mood)[1]+' '+MOODS.find(m=>m[0]===day.mood)[2]),day.note?row('한 줄',day.note):null);
  }
  add(sec,dayRoomCard(ctx,date));   // S1B "그날의 방": 그날 공부 카드 + 그날까지의 평생 분(읽기만, 진행 중 타이머 없음)
  root.append(sec);
  return sec;
}
export {lifeIdOK,targetTimeOK,subjectOfSession,emptyDay,dayNumber};
