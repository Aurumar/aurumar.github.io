// 계획 탭 (B43): 일·주·월·연·수능까지 보기, 하루 계획(PLAN_DAY) 편집, 계획 vs 실제. 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음).
// 보기만 하는 부분(남은 주·체감 숫자·격자·레일·용량 벽·달력·막대·계획 vs 실제)은 쌓인 기록(life·study)과 오늘 날짜만으로 계산한다: 시계·난수·저장소·통신을 쓰지 않는다.
// 기록을 쓰는 곳은 savePlanDay() 하나이고, 계획 시트의 "저장" 버튼 핸들러에서만 부른다(엔티티 1개 = 연산 1). 열기·보기 전환·어제 계획 복사·달력 누르기는 아무것도 쓰지 않는다.
// 마지막으로 본 보기만 이 기기 localStorage(lb.plan.view)에 적는다(기록이 아니라 화면 설정, 실패해도 무시). V8W2: 디데이 칩 선택(lb.dday.active)도 같은 방식.
// 계획 달성은 XP에 넣지 않는다(B42 공식 유지, 다음 단계에서 결정). 설계: AUTOPILOT\tasks\B43_PLANNER_DDAY.md, ADDENDUM A4·A5·A6.
import {achieve,SUBJECT_BY_CODE} from './life-achieve.mjs';
import {stable} from './life-rebase.mjs';
import {lifeDefs,dDay,dayNumber,shiftDay,kstDate,validateLifeData,PLAN_BLOCKS,MAX_PLAN_ITEMS,MAX_PLAN_TITLE,MAX_PLAN_BRICKS,hhmmFromIso,brickOf,subjectOfSession,dateKeyOK,examStatusOf,PLAN_ITEM_OPTIONAL} from './life-model.mjs';

// 보기는 5개(저장 lb.plan.view 값도 그대로), 머리 칩은 4개(P1A·D36-3): 오늘 · 주 · 월 · 연간 계획(V8W3-3: 옛 이름 "멀리"). 연간 계획을 고르면 그 아래 연 · 수능까지 칩 줄이 열린다.
export const VIEWS=Object.freeze([['DAY','오늘'],['WEEK','주'],['MONTH','월'],['YEAR','연'],['CSAT','수능까지']]);
export const VIEW_CHIPS=Object.freeze([['DAY','오늘'],['WEEK','주'],['MONTH','월'],['FAR','연간 계획']]),FAR_VIEWS=Object.freeze(['YEAR','CSAT']);
export const VIEW_KEY='lb.plan.view',TIMER_KEY='lb.life.timer';
export const PHASES=Object.freeze(['기본기','실력','실전','파이널']);
// V7B (소유자 2026-11-11): 화면의 시간대는 3개(오전 = 아침~점심, 오후 = 점심~저녁, 저녁 = 저녁~자기 전). 저장값 집합(life-model PLAN_BLOCKS M·A·E·N)과 검사기는 그대로다.
// 이미 저장된 "밤"(N) 줄은 값을 바꾸지 않고 저녁 칸에 묶어 보인다(shownBlock, 연산 0). 새로 쓰는 줄은 SHOWN_BLOCKS 값만 쓴다(옛 빌드 검사기도 받는 값).
export const SHOWN_BLOCKS=Object.freeze(['M','A','E']);
export const shownBlock=b=>b==='N'?'E':b;
export const BLOCK_TEXT=Object.freeze({M:'오전',A:'오후',E:'저녁',N:'저녁'});
export const BLOCK_HINT=Object.freeze({M:'아침~점심',A:'점심~저녁',E:'저녁~자기 전'});
// 시간대 색(styles.css .lb-slot-M·A·E와 같은 값, 겨자·황토·갈색 없음). 과목 색과 헷갈리지 않게 칩에는 점 대신 아이콘(해 뜸·해·달)을 붙인다.
export const BLOCK_COLOR=Object.freeze({M:'#5AA9E6',A:'#F08A5D',E:'#6C5CE7'});
export const STUDY_HOURS_PER_DAY=8,MAX_GRID_WEEKS=160,GRID_COLS=14,NO_SUBJECT_COLOR='#E3BE4C';   // V7C: 황토 #C9A227 → 밝은 금
const WEEKDAY=['일','월','화','수','목','금','토'];
export const PLAN_ERROR_TEXT=Object.freeze({
  INVALID_PLAN_DAY:'하루 계획 모양이 올바르지 않습니다.',INVALID_PLAN_ITEM:'계획 줄이 올바르지 않습니다(과목이 있어야 하고 같은 줄이 두 번 들어갈 수 없습니다).',
  INVALID_PLAN_BRICKS:'벽돌은 0.5장 단위로 0.5~'+MAX_PLAN_BRICKS+'장입니다.',INVALID_PLAN_BLOCK:'시간대를 오전·오후·저녁 중에서 고르세요.',
  PLAN_ITEM_LIMIT:'하루 계획은 '+MAX_PLAN_ITEMS+'줄까지입니다.',PLAN_CARD_TOO_LARGE:'하루 계획이 너무 큽니다(8KB). 줄을 줄여 주세요.',
  INVALID_LIFE_TEXT:'할 일은 1~'+MAX_PLAN_TITLE+'자로 적어 주세요.',APP_ENTITY_LIMIT:'개수 한도에 닿았습니다.',
  STALE_HEADS:'다른 기기에서 먼저 바뀌어 합치지 못했습니다. 입력은 그대로 있습니다. 다시 저장해 주세요.',
  MD_NOT_WRITE_READY:'지금은 서버에 저장할 수 없습니다. 입력은 이 화면에 남아 있습니다.',
  MD_PENDING_RECONCILE_REQUIRED:'이 저장이 서버에 반영됐는지 아직 모릅니다. 새로 저장하지 말고 더보기 > 고급에서 "결과 모르는 저장 확인"을 누르세요.',
  HOLD_UNKNOWN_SAVE:'저장 결과가 불명확합니다. 새로 저장하지 말고 먼저 확인하세요.',
  LOG_LIMIT:'저장 공간이 꽉 찼어요. 입력은 이 기기에 남아 있어요. 이월이 필요해요.',   // OPS1A: fin-ledger LOG_LIMIT_TEXT와 같은 글(이 모듈은 import 목록이 고정이라 글로 둔다, 시험 OPS1A가 같음을 확인)
  // 새 기록(D46): 과목 주간 목표·모의고사 결과·칭호
  INVALID_PLAN_GOAL:'과목 목표 모양이 올바르지 않습니다.',INVALID_GOAL_WEEK:'과목 목표는 그 주 월요일로 저장합니다.',INVALID_GOAL_ITEM:'과목 목표 줄이 올바르지 않습니다(같은 과목이 두 번 들어갈 수 없습니다).',
  INVALID_GOAL_BRICKS:'목표는 0.5장 단위로 0.5~120장입니다.',GOAL_ITEM_LIMIT:'과목 목표는 20과목까지입니다.',PLAN_GOAL_TOO_LARGE:'과목 목표가 너무 큽니다.',
  INVALID_EXAM_RESULT:'모의고사 결과 모양이 올바르지 않습니다.',INVALID_EXAM_RESULT_DATE:'시험 본 날은 YYYY-MM-DD 형식이어야 합니다.',
  INVALID_EXAM_SCORE:'점수를 확인하세요: 원점수 0~100, 표준점수 0~200, 백분위 0~100, 등급 1~9, 정수만 넣을 수 있습니다.',EXAM_SCORE_LIMIT:'모의고사 결과는 20과목까지입니다.',EXAM_RESULT_TOO_LARGE:'모의고사 결과가 너무 큽니다.',
  INVALID_GAME_PROFILE:'칭호 값이 올바르지 않습니다.',INVALID_GAME_PROFILE_ID:'칭호 값이 올바르지 않습니다.',INVALID_STUDY_BOOK:'책 이름은 1~20자이고 문장부호를 넣을 수 없습니다.',
  RECORDS_DOOR_CLOSED:'아직 켜지 않았습니다 · 네 기기를 올린 뒤 더보기 > 설정에서 켜 주세요. 입력은 그대로 있습니다.',
  // 일기·주간 리뷰(D49)
  INVALID_DIARY_DAY:'일기 모양이 올바르지 않습니다.',INVALID_DIARY_DATE:'일기 날짜가 올바르지 않습니다.',INVALID_DIARY_SCORE:'점수와 에너지는 1~5로 고르세요.',INVALID_DIARY_CHIP:'잘한 것은 3개, 아쉬운 것은 2개까지 고를 수 있습니다.',
  INVALID_DIARY_TEXT:'일기는 2,000자, 내일 한 가지는 40자까지 적을 수 있습니다.',DIARY_TOO_LARGE:'일기가 너무 큽니다(8KB). 글을 줄여 주세요.',
  INVALID_WEEK_REVIEW:'주간 리뷰 모양이 올바르지 않습니다.',INVALID_REVIEW_WEEK:'주간 리뷰는 그 주 월요일로 저장합니다.',INVALID_REVIEW_PICK:'고른 문장은 1~120자여야 합니다.',
});
export const planErrorText=code=>PLAN_ERROR_TEXT[code]??(code?'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+code+'\u2060':'저장하지 못했습니다.');
// 결과를 모르는 오류: 다음 저장을 이어 가면 안 된다(H37-P3).
export const unknownOutcome=code=>typeof code==='string'&&(code==='MD_PENDING_RECONCILE_REQUIRED'||code.startsWith('HOLD_'));
export const PLAN_NOTICE_TEXT=Object.freeze({
  PLAN_LOCAL_DRAFT:'이 기기에 임시 저장됨 · 아직 동기화 전이라 계획표에는 보이지 않습니다 · 연결한 뒤 연결 · 장치의 임시 저장 목록에서 "승인하고 쌓기"를 누르세요.',
  PLAN_VALUE_OVERWRITTEN:'같은 계획 줄을 양쪽에서 고쳐서 내 값을 썼습니다 · 상대 값은 이력에 남아 있습니다.',
  PLAN_CONFLICT_KEPT_REMOTE:'내가 지운 줄을 다른 기기에서 고쳐서 상대 수정을 남겼습니다.',
  PLAN_CONFLICT_KEPT_LOCAL:'다른 기기에서 지운 줄을 내가 고쳐서 내 수정으로 되살렸습니다.',
  RECORD_VALUE_OVERWRITTEN:'같은 과목을 양쪽에서 고쳐서 내 값을 썼습니다 · 상대 값은 이력에 남아 있습니다.',
  RECORD_CONFLICT_KEPT_REMOTE:'내가 지운 과목을 다른 기기에서 고쳐서 상대 수정을 남겼습니다.',
  RECORD_CONFLICT_KEPT_LOCAL:'다른 기기에서 지운 과목을 내가 고쳐서 내 수정으로 되살렸습니다.',
  RECORD_DATE_OVERWRITTEN:'시험 본 날을 양쪽에서 다르게 고쳐서 내 값을 썼습니다 · 상대 값은 이력에 남아 있습니다.',
  RECORD_LOCAL_DRAFT:'이 기기에 임시 저장됨 · 아직 동기화 전이라 화면에는 보이지 않습니다 · 연결한 뒤 연결 · 장치의 임시 저장 목록에서 "승인하고 쌓기"를 누르세요.',
  DIARY_TEXT_KEPT_MINE:'일기 글을 양쪽에서 고쳐서 내 글을 썼습니다 · 다른 기기 글은 이전 판에 있어요.',
  DIARY_VALUE_OVERWRITTEN:'같은 칸을 양쪽에서 고쳐서 내 값을 썼습니다 · 상대 값은 이전 판에 있어요.',
  DIARY_CHIPS_MERGED:'칩을 양쪽에서 고쳐서 합쳤습니다.',
  DIARY_CHIPS_TRIMMED:'칩을 합치니 개수를 넘어서 내 칩을 먼저 남겼습니다 · 나머지는 이전 판에 있어요.',
  REVIEW_VALUE_OVERWRITTEN:'같은 칸을 양쪽에서 고쳐서 내 값을 썼습니다 · 상대 값은 이전 판에 있어요.',
});

// ---------- 날짜 계산 ----------
const sunday0=date=>new Date(date+'T12:00:00Z').getUTCDay();
export const mondayOf=date=>shiftDay(date,-((sunday0(date)+6)%7));
export const dateLabel=d=>{const dt=new Date(d+'T12:00:00Z');return (dt.getUTCMonth()+1)+'월 '+dt.getUTCDate()+'일 ('+WEEKDAY[dt.getUTCDay()]+')';};
// CAL1B: 계획 화면 맨 위 "오늘 · 11월 13일 금요일"(CAL1 달력 툴바의 한 줄과 같은 글·클래스).
export const todayLineText=d=>' · '+Number(d.slice(5,7))+'월 '+Number(d.slice(8,10))+'일 '+WEEKDAY[sunday0(d)]+'요일';
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
// V8W3-2: 주 이름 = 월요일 시작 7일 중 4일 이상 든 달(= 그 주 목요일의 달) 기준 "10월 5주"·"11월 1주". n = 그 달에서 몇째 목요일인지(1~5).
export function weekName(monday){
  const thu=shiftDay(monday,3),ym=thu.slice(0,7),n=Math.ceil(Number(thu.slice(8,10))/7);
  return {ym,n,text:Number(ym.slice(5,7))+'월 '+n+'주'};
}
// V8W3-1: 주 머리 "11/9(월) ~ 11/15(일)".
export const weekSpanText=monday=>short(monday)+'(월) ~ '+short(shiftDay(monday,6))+'(일)';
// V8LOW L-09: 주 머리 글자. 해가 바뀌는 주만 양쪽에 연도("2026년 12/28(월) ~ 2027년 1/3(일)"), 같은 해면 weekSpanText 그대로.
export function weekSpanLabel(monday){
  const end=shiftDay(monday,6);
  return monday.slice(0,4)===end.slice(0,4)?weekSpanText(monday):Number(monday.slice(0,4))+'년 '+short(monday)+'(월) ~ '+Number(end.slice(0,4))+'년 '+short(end)+'(일)';
}
// a~b(양끝 포함)에 든 요일 w(0=일)의 날 수.
export function countWeekday(a,b,w){
  const da=dayNumber(a),db=dayNumber(b);if(db<da)return 0;
  const first=da+((w-sunday0(a)+7)%7);
  return first>db?0:Math.floor((db-first)/7)+1;
}
export const daysInMonth=ym=>new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0)).getUTCDate();
export const shiftMonth=(ym,d)=>{const t=new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1+d,1));return t.toISOString().slice(0,7);};
const byDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:a.id<b.id?-1:a.id>b.id?1:0;

// ---------- 시험·남은 시간 (A4·A5) ----------
// 목표 시험 = 수능: id가 e-csat이거나 이름이 수능인 항목, 없으면 가장 늦은 날짜.
export function csatTarget(exams){
  const items=[...(exams?.items??[])].sort(byDate);
  return items.find(x=>x.id==='e-csat')??items.find(x=>x.name==='수능')??items[items.length-1]??null;
}
// V12C-6 (소유자 2026-11-16 "최종 시험 이름 = 2028 수능"): 저장된 이름이 정확히 "수능"이면 화면·위젯에는 "시행 연도 + 1 수능"(2027-11-18 → "2028 수능", 2028학년도)으로 보인다.
// 기록 값은 바꾸지 않는다(이름 칸 그대로, r81 앱은 예전처럼 "수능"). 사람이 다른 이름(연도를 넣은 이름 등)으로 바꿨으면 그 이름 그대로.
export function examDisplayName(x){
  const n=String(x?.name??'');
  return n.trim()==='수능'&&typeof x?.date==='string'&&dateKeyOK(x.date)?(Number(x.date.slice(0,4))+1)+' 수능':n;
}
// state: NONE(시험 일정 없음) / BEFORE / DAY(수능 당일) / AFTER(수능 지남).
// 남은 일수 = D-n(당일은 1로 센다), 남은 주 = floor(D-n / 7), 남은 주말 = 오늘 이후(오늘 포함) 수능일까지의 토요일 수, 남은 모의고사(= 남은 시험에서 수능을 뺀 수, 완성 화면 예시의 "3번 남은 모의고사") = 오늘 이후(오늘 포함) 수능일까지의 시험 수.
// 오늘 1시간의 몫: 화면은 "1 / N시간"(N = 남은 일수 × 하루 공부 가능 시간 8h = hoursLeft)으로 보인다(B44B 결정, 소수 1자리 퍼센트는 체감이 안 돼 화면에서 지웠다).
// hourPercent(= 100 / N)는 계산값으로만 남아 있고 화면에 쓰지 않는다.
export function countdown(exams,today){
  const items=[...(exams?.items??[])].sort(byDate),target=csatTarget(exams);
  const zero={target,state:target?'AFTER':'NONE',dDay:null,daysLeft:0,weeksLeft:0,weekendsLeft:0,sundaysLeft:0,examsLeft:0,hourPercent:null,hoursLeft:0};
  if(!target)return zero;
  const d=dDay(today,target.date);
  if(d<0)return {...zero,dDay:d};
  const daysLeft=Math.max(1,d);
  return {target,state:d===0?'DAY':'BEFORE',dDay:d,daysLeft,weeksLeft:Math.floor(d/7),weekendsLeft:countWeekday(today,target.date,6),sundaysLeft:countWeekday(today,target.date,0),
    examsLeft:items.filter(x=>x.date>=today&&x.date<=target.date&&x.id!==target.id).length,hourPercent:100/(daysLeft*STUDY_HOURS_PER_DAY),hoursLeft:daysLeft*STUDY_HOURS_PER_DAY};
}
export const percentText=p=>p===null?'-':p.toFixed(1)+'%';
// "1 / 3,032시간"(남은 공부 가능 시간 중 1시간). 남은 시간을 모르면 '-'.
export const hourShareText=hours=>Number.isSafeInteger(hours)&&hours>0?'1 / '+hours.toLocaleString('ko-KR')+'시간':'-';
// 시기 구분: 수능을 뺀 시험들(3평·6평·하반기 모평)의 주를 경계로, 그 시험 주까지는 앞 단계, 그다음 주부터 다음 단계(0 기본기 · 1 실력 · 2 실전 · 3 파이널).
export function phaseOfWeek(exams,monday){
  const target=csatTarget(exams),marks=(exams?.items??[]).filter(x=>x!==target&&x.id!==target?.id).map(x=>mondayOf(x.date));
  return Math.min(3,marks.filter(m=>m<monday).length);
}
// 남은 주 격자: 첫 기록 주(또는 이번 주)부터 수능 주까지 1칸 = 1주. 지난 주는 그 주 쌓은 벽돌 / 주 목표, 이번 주도 같은 비율을 아래부터 채운다.
export function weekGrid(exams,today,ach){
  const target=csatTarget(exams);
  if(!target||dDay(today,target.date)<0)return [];
  const nowMon=mondayOf(today),end=mondayOf(target.date),weeks=new Map(ach.weeks.map(w=>[w.monday,w]));
  let start=ach.hasRecords&&ach.weeks.length&&ach.weeks[0].monday<nowMon?ach.weeks[0].monday:nowMon;
  const maxStart=shiftDay(end,-7*(MAX_GRID_WEEKS-1));if(start<maxStart)start=maxStart;
  const examWeeks=new Map();
  for(const x of exams.items){const m=mondayOf(x.date);examWeeks.set(m,[...(examWeeks.get(m)??[]),examDisplayName(x)]);}   // V13 L-C1: 주 계획 시험 이름도 "2028 수능"
  const cells=[],goalWeek=ach.goalBricks*7;   // V6A: 주 목표 = 하루 목표(설정 한 곳) × 7일
  for(let m=start;m<=end;m=shiftDay(m,7)){
    const w=weeks.get(m)??null,state=m<nowMon?'PAST':m===nowMon?'NOW':'FUTURE';
    const ratio=w&&state!=='FUTURE'&&goalWeek>0?Math.min(1,w.value/goalWeek):0;
    cells.push({monday:m,state,phase:phaseOfWeek(exams,m),exams:examWeeks.get(m)??[],ratio,value:w?.value??0,target:goalWeek});
  }
  return cells;
}
// 수능까지 쌓을 수 있는 벽돌 = 남은 날 × 하루 목표 벽돌, 이미 쌓은 벽돌 = 모든 주의 합.
export function capacity(exams,today,ach){
  const c=countdown(exams,today),stacked=ach.weeks.reduce((s,w)=>s+w.value,0);
  if(c.state==='NONE'||c.state==='AFTER')return {days:0,goal:ach.goalBricks,total:0,stacked,left:0};
  return {days:c.daysLeft,goal:ach.goalBricks,total:c.daysLeft*ach.goalBricks,stacked,left:c.daysLeft*ach.goalBricks};
}

// ---------- 하루 계획 (PLAN_DAY) ----------
export const planRow=(life,date)=>(life?.plans??[]).find(p=>p.date===date)??null;
export const planOf=(life,date)=>planRow(life,date)?.data??null;
const blockIndex=b=>SHOWN_BLOCKS.indexOf(shownBlock(b));   // V7B: 옛 밤 줄은 저녁 줄과 같은 자리(줄 순서대로)
export const sortedItems=items=>items.map((x,i)=>({x,i})).sort((a,b)=>blockIndex(a.x.block)-blockIndex(b.x.block)||a.i-b.i).map(o=>o.x);
export const planSum=items=>items.reduce((s,x)=>s+x.bricks,0);
// 어제 계획 복사: 줄을 새 id로 복사해 초안만 만든다(저장하지 않는다). newId는 호출자가 준다(난수는 여기서 만들지 않는다).
// V13B L-C3: 완료(done)는 그 날 그 줄의 값이라 다른 날로 복사하지 않는다(planItemCopy).
export function copyPlan(prev,date,newId){
  const used=new Set(),items=(prev?.items??[]).map((x,i)=>{let id=newId(i);while(used.has(id))id+='x';used.add(id);return {...planItemCopy(x),id};});
  return {date,items};
}
// ---- V13B L-C3 주간→오늘 완료를 기기 사이에 — 1단계(r83, 읽기 관용)만 ----
// 계획 줄 선택 칸 done(life-model PLAN_ITEM_OPTIONAL)을 검사기가 받고, 줄 고치기·합치기는 그 칸을 그대로 남긴다(planItemKept). 다른 날로 복사할 때만 뺀다(planItemCopy).
// PLAN_DONE_SYNC = 완료 칸 쓰기·읽기 스위치. r83은 false: 완료 표시는 예전처럼 이 기기 lb.plan.link에만 적고(기록 쓰기 0), 받은 done 값으로 화면을 바꾸지도 않는다(r82와 같은 화면).
// 2단계(r84, 모든 기기가 r83 이상이 된 뒤 통제탑 결정)에서 켠다. 켜기 전에는 r82 기기로 done 칸이 가지 않는다.
export const PLAN_DONE_SYNC=false;
export const planItemKept=x=>Object.fromEntries(PLAN_ITEM_OPTIONAL.filter(k=>x!==null&&typeof x==='object'&&Object.hasOwn(x,k)).map(k=>[k,x[k]]));
export const planItemCopy=x=>{const out={...x};for(const k of PLAN_ITEM_OPTIONAL)delete out[k];return out;};
// 고친 줄(next, 시트가 만든 기본 5칸)에 저장돼 있던 줄(old)의 선택 칸을 되붙인다. 같은 줄을 고칠 때만 부른다.
export const planItemEdited=(old,next)=>({...planItemKept(old),...next});
export const planItemDone=x=>PLAN_DONE_SYNC&&x?.done===true;
// 두 기기 합치기: 줄 id 단위 3자 병합(base = 편집을 시작한 시점, mine = 내 초안, latest = 저장 직전 서버 최신). life-rebase와 같은 규칙.
export function rebasePlan({date,base,mine,latest}){
  const map=p=>new Map((p?.items??[]).map(x=>[x.id,x])),B=map(base),M=map(mine),T=map(latest),notices=[],keep=new Map();
  const same=(a,b)=>stable(a)===stable(b);
  const order=[...new Set([...T.keys(),...M.keys(),...B.keys()])];
  for(const id of order){
    const b=B.get(id),m=M.get(id),t=T.get(id);
    if(b===undefined){
      if(m!==undefined&&t!==undefined){if(same(m,t))keep.set(id,t);else{keep.set(id,m);notices.push({code:'PLAN_VALUE_OVERWRITTEN',itemId:id,remote:t,mine:m});}}
      else keep.set(id,m!==undefined?m:t);
      continue;
    }
    const mine_=m===undefined?'deleted':same(m,b)?'same':'modified',their=t===undefined?'deleted':same(t,b)?'same':'modified';
    if(mine_==='same'){if(their!=='deleted')keep.set(id,t);continue;}
    if(mine_==='modified'){
      // V13B L-C3: 나는 선택 칸(done)을 안 바꿨고 상대가 바꿨으면 그 칸은 상대 값을 남긴다(제목만 고친 r83이 r84의 완료를 지우지 않게).
      const mm=t!==undefined&&same(planItemKept(m),planItemKept(b))?{...planItemCopy(m),...planItemKept(t)}:m;
      if(their==='same'||their==='modified'&&same(mm,t)){keep.set(id,mm);continue;}
      keep.set(id,mm);notices.push(their==='modified'?{code:'PLAN_VALUE_OVERWRITTEN',itemId:id,remote:t,mine:mm}:{code:'PLAN_CONFLICT_KEPT_LOCAL',itemId:id,mine:mm});
      continue;
    }
    if(their==='modified'){keep.set(id,t);notices.push({code:'PLAN_CONFLICT_KEPT_REMOTE',itemId:id,remote:t});}
  }
  const merged={date,items:order.filter(id=>keep.has(id)).map(id=>keep.get(id))};
  if(latest&&same(merged,latest))return {status:'ALREADY_APPLIED',notices};
  try{validateLifeData('PLAN_DAY',date,merged);}catch(e){return {status:'REJECTED',code:e.code??'PLAN_REBASE_INVALID',notices};}
  return {status:'MERGED',plan:merged,notices};
}
// 저장: 계획 시트의 "저장" 버튼만 부른다. 최신이 내가 편집을 시작한 때와 같으면 내 초안 그대로, 다르면 합친 결과를 엔티티 1개로 쓴다.
// 겹침(STALE_HEADS)이면 최신을 받아 다시 합쳐 한 번 더 시도한다(쓰기는 성공한 1번만 일어난다).
// 임시 저장 모드에서는 봉인 초안으로만 들어가 계획표에 안 보인다: sealed:true와 PLAN_LOCAL_DRAFT 알림을 함께 돌려준다(H37-P1). 부른 쪽은 sealed면 성공으로 말하지 말고 초안을 남긴다.
// OPS1A: ctx.planDrafts(앱이 넘김, life-flow createPlanDrafts)가 있으면 금고에 쓰지 않고 이 기기 초안에 둔다(연산 0). direct = 쌓기(flush)가 부르는 실제 저장.
export async function savePlanDay(ctx,{date,base,mine,direct=false}){
  validateLifeData('PLAN_DAY',date,mine);
  if(ctx.planDrafts&&!direct){const r=await ctx.planDrafts.put(date,base,mine);if(r)return r;}   // null = 상자에 남기지 못함 → 예전처럼 바로 저장(입력을 잃지 않게)
  for(let attempt=1;attempt<=3;attempt++){
    const row=planRow(ctx.getWhole().life,date),latest=row?.data??null;
    let data=mine,notices=[];
    if(stable(latest)!==stable(base??null)){
      const rb=rebasePlan({date,base,mine,latest});
      if(rb.status==='REJECTED')throw Object.assign(new Error(rb.code),{code:rb.code});
      if(rb.status==='ALREADY_APPLIED')return {status:'ALREADY_APPLIED',notices:rb.notices};
      data=rb.plan;notices=rb.notices;
    }else if(latest&&stable(latest)===stable(mine))return {status:'ALREADY_APPLIED',notices:[]};
    let w;
    try{w=await ctx.entity('PLAN_DAY',date,data,row?[...row.heads]:[],'하루 계획 저장');}
    catch(e){if(e?.code==='STALE_HEADS'&&attempt<3&&ctx.reload){await ctx.reload();continue;}throw e;}
    if(w?.status==='LOCAL_DRAFT')return {status:'SAVED',sealed:true,notices:[...notices,{code:'PLAN_LOCAL_DRAFT'}],plan:data};
    return {status:'SAVED',notices,plan:data};
  }
  throw Object.assign(new Error('STALE_HEADS'),{code:'STALE_HEADS'});
}

// OPS1A: 초안에 둔 계획 줄(life-flow createPlanDrafts)의 저장 결과 문구. 쌓기는 자동 쌓기(5분)·지금 쌓기·저장 후 종료.
export const PLAN_DRAFT_TEXT='이 기기에 저장됨 · 5분 안에 자동으로 쌓여요';

// ---------- V6A: 계획은 말로, 벽돌은 자동 ----------
// 계획 줄 = 과목 + 세부내용 + 시간대만 사람이 적는다. 새 줄의 bricks 칸은 1(= 벽돌 1장이면 완료, 저장 형식 그대로라 옛 빌드도 받는다). 이미 저장된 bricks 값은 지우지 않고 "예전 목표 n장"으로만 보인다.
// 달성은 그 날 공부 세션을 계획 줄에 자동으로 붙여 센다(저장 0, 두 기기가 같은 기록에서 같은 결과를 낸다): 세션 시각 순으로, 같은 과목 줄 중
// ① 세션 시간대와 같은 미완료 줄 → ② 이른 시간대부터 미완료 줄 → ③ (다 완료면) 같은 시간대 줄 → 첫 줄. 같은 과목 줄이 없으면 계획 밖 공부.
// 줄 상태 3가지: 안 함 / 조각(그 줄에 붙은 벽돌 없이 조각만, 10~29분) / 완료(벽돌 1장 이상, 쌓은 장수). 9분 이하 세션은 벽돌이 아니라 어디에도 붙이지 않는다.
// "다른 항목으로"(세션 → 줄 고르기)와 손 완료 표시는 이 기기 저장소 lb.plan.link에만 적는다(화면 설정, 기록·동기화 아님 — 저장 형식을 바꾸지 않기 위해).
export const PLAN_LINK_KEY='lb.plan.link',PLAN_LINK_DAYS=60;
export const ITEM_STATE_TEXT=Object.freeze({NONE:'안 함',PIECE:'조각',DONE:'완료'});
export const NEW_ITEM_BRICKS=1;
export const oldTarget=x=>typeof x?.bricks==='number'&&x.bricks!==NEW_ITEM_BRICKS?x.bricks:null;   // 예전에 사람이 정한 목표 장수(새 줄 = 1은 표시하지 않음)
// 세션 시각(KST)의 시간대: 05~11시 오전, 12~17시 오후, 18~04시 저녁(plan-today blockOfNow와 같은 규칙). V7B: 예전 밤(22~04시)은 저녁(= 저녁~자기 전)이다.
export function blockOfIso(iso){const h=Number(hhmmFromIso(iso).slice(0,2));return h>=18||h<5?'E':h<12?'M':'A';}
const AT_LAST='￿';
// 그 날 공부 세션(완료, 분 0~1440). draft = 아직 쌓지 않은 그 날 공부 카드(있으면 그 날 기록 대신, previewAchieve와 같은 규칙). 시각 순(시각 없으면 뒤), 같은 시각은 id 순.
export function daySessions(study,date,draft=null){
  const card=draft??(study?.days??[]).find(d=>d.date===date)?.data??null;
  return (card?.sessions??[]).filter(s=>(s.state==='COMPLETED'||s.state==='VERIFIED')&&Number.isInteger(s.confirmedMin)&&s.confirmedMin>=0&&s.confirmedMin<=1440)
    .map(s=>({id:s.id,subjectId:subjectOfSession(s.id)??SUBJECT_BY_CODE[s.subject]??null,minutes:s.confirmedMin,at:typeof s.at==='string'&&Number.isFinite(Date.parse(s.at))?s.at:null}))
    .sort((a,b)=>{const x=a.at??AT_LAST,y=b.at??AT_LAST;return x<y?-1:x>y?1:a.id<b.id?-1:a.id>b.id?1:0;});
}
// items = 그 날 계획 줄, sessions = daySessions 결과, marks = {links:{세션 id: 줄 id}, done:[손으로 완료 표시한 줄 id]}.
export function linkPlan(items,sessions,{links={},done=[]}={}){
  const list=sortedItems(items??[]),rows=new Map(list.map(x=>[x.id,{id:x.id,subjectId:x.subjectId,block:x.block,minutes:0,bricks:0,pieces:0,sessions:[],manual:done.includes(x.id)||planItemDone(x),state:'NONE'}]));   // V13B L-C3: 기록의 done은 스위치가 켜졌을 때만
  const full=r=>r.bricks>=1||r.manual,link=new Map(),outside=[];
  const order=[...(sessions??[])].sort((a,b)=>{const x=a.at??AT_LAST,y=b.at??AT_LAST;return x<y?-1:x>y?1:a.id<b.id?-1:a.id>b.id?1:0;});   // 넘겨받은 순서와 무관하게 시각 순
  for(const s of order){
    const b=brickOf(s.minutes);
    if(!b.bricks&&!b.pieces){link.set(s.id,null);continue;}
    const mine=list.filter(x=>x.subjectId===s.subjectId);
    if(!mine.length){link.set(s.id,null);outside.push({...s,bricks:b.bricks,pieces:b.pieces});continue;}
    const at=s.at?blockOfIso(s.at):null;
    const pick=mine.find(x=>x.id===links[s.id])??mine.find(x=>shownBlock(x.block)===at&&!full(rows.get(x.id)))??mine.find(x=>!full(rows.get(x.id)))??mine.find(x=>shownBlock(x.block)===at)??mine[0];
    const r=rows.get(pick.id);r.minutes+=s.minutes;r.bricks+=b.bricks;r.pieces+=b.pieces;r.sessions.push(s.id);link.set(s.id,pick.id);
  }
  let doneN=0;
  for(const r of rows.values()){r.state=full(r)?'DONE':r.pieces>0?'PIECE':'NONE';if(r.state==='DONE')doneN++;}
  return {rows,link,outside,total:list.length,done:doneN};
}
// 줄 상태 글자: 완료 n장(손 완료만이면 "완료") / 조각 / 안 함. 오지 않은 날은 "계획".
export function itemStateText(r,future=false){
  if(future)return '계획';
  if(r.state==='DONE')return r.bricks>0?ITEM_STATE_TEXT.DONE+' '+r.bricks+'장':ITEM_STATE_TEXT.DONE;
  return ITEM_STATE_TEXT[r.state];
}
// 이 기기 저장소 값 {날짜:{s:{세션 id:줄 id}, d:[줄 id]}}. 깨졌거나 막혀 있으면 빈 값(자동 연결만).
const plainObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function readAllMarks(storage){try{const v=JSON.parse(storage?.getItem(PLAN_LINK_KEY)??'null');return plainObj(v)?v:{};}catch{return {};}}
export function readPlanMarks(storage,date){
  const v=readAllMarks(storage)[date],links={},done=[];
  if(plainObj(v)){
    if(plainObj(v.s))for(const [k,x] of Object.entries(v.s))if(typeof x==='string')links[k]=x;
    if(Array.isArray(v.d))for(const x of v.d)if(typeof x==='string'&&!done.includes(x))done.push(x);
  }
  return {links,done};
}
// change(marks)로 그 날 값을 고쳐 적는다. 최근 PLAN_LINK_DAYS일만 남긴다. 성공 여부를 돌려준다(실패해도 기록에는 영향 없음).
export function writePlanMarks(storage,date,change){
  try{
    if(!storage||!dateKeyOK(date))return false;
    const all=readAllMarks(storage),cur=readPlanMarks(storage,date);change(cur);
    all[date]={s:cur.links,d:cur.done};
    const keep=Object.keys(all).filter(dateKeyOK).sort().slice(-PLAN_LINK_DAYS);
    storage.setItem(PLAN_LINK_KEY,JSON.stringify(Object.fromEntries(keep.map(k=>[k,all[k]]))));
    return true;
  }catch{return false;}
}
export function dayPlanLink(life,study,date,{draft=null,storage=null}={}){
  return linkPlan(planOf(life,date)?.items??[],daySessions(study,date,draft),readPlanMarks(storage,date));
}
// from~to(양끝 포함) 계획 줄 수와 완료 수. 오늘보다 뒤 날의 줄은 later로 따로 센다(달성 분모 = 오늘까지).
// FIX68 (HUNT65 F7): draft = 아직 쌓지 않은 오늘 공부 카드. 오늘 카드("오늘 계획")와 같이 오늘 줄은 초안으로 센다(표시만, 저장 0). 다른 날짜 초안은 쓰지 않는다.
export function planItemsDone(life,study,from,to,today,storage=null,draft=null){
  const byDate=new Map((study?.days??[]).map(d=>[d.date,d]));let total=0,done=0,later=0;
  for(const p of life?.plans??[]){
    if(p.date<from||p.date>to)continue;
    const n=p.data?.items?.length??0;if(!n)continue;
    if(p.date>today){later+=n;continue;}
    const r=linkPlan(p.data.items,daySessions({days:byDate.has(p.date)?[byDate.get(p.date)]:[]},p.date,todayDraft(draft,p.date,today)),readPlanMarks(storage,p.date));total+=r.total;done+=r.done;
  }
  return {total,done,later};
}
// 오늘 공부 초안을 그 날짜에 쓸지: 오늘이고 초안 날짜가 오늘일 때만.
export const todayDraft=(draft,date,today)=>draft&&date===today&&draft.date===today?draft:null;
// 앱이 넘겨 준 오늘 공부 초안(ctx.studyDraft, 없으면 null).
export const studyDraftOf=(ctx,today)=>{try{return ctx?.studyDraft?.(today)??null;}catch{return null;}};
export const itemsDoneText=c=>c.total>0?'계획 '+c.total+'개 중 '+c.done+'개 달성':null;
// "목표 대비" = 하루 목표(설정 한 곳, achieve의 goalBricks) × 날수.
export const goalVsText=(actual,goal,days)=>'목표 대비 '+barsText(actual)+' / '+barsText(goal*days);

// ---------- 계획 vs 실제 ----------
const weekIndex=ach=>new Map(ach.weeks.map(w=>[w.monday,w]));
// 그날 실제 벽돌: 과목별 {value(장, 조각 0.5), gold(금벽돌 장 수), count}, first = 그날 첫 벽돌의 과목(시동), items 원본.
export function actualOf(weeks,date){
  const w=weeks.get(mondayOf(date)),slot=w?w.days[dayNumber(date)-dayNumber(w.monday)]:null,items=slot?slot.items:[],bySubject=new Map();
  let total=0;
  for(const it of items){
    const key=it.subjectId??'?',s=bySubject.get(key)??{subjectId:key,color:it.color,value:0,gold:0};
    const v=it.half?0.5:1;s.value+=v;if(it.gold&&!it.half)s.gold+=1;total+=v;bySubject.set(key,s);
  }
  return {bySubject,total,first:items.length?items[0].subjectId??'?':null,items,card:slot?.card??false};
}
// 과목별 계획 vs 실제와 전체 달성률 = Σ min(실제, 계획) / Σ 계획(계획이 없으면 null).
export function planVsActual(planItems,actual){
  const rows=new Map();
  for(const x of planItems){const r=rows.get(x.subjectId)??{subjectId:x.subjectId,planned:0,actual:0};r.planned+=x.bricks;rows.set(x.subjectId,r);}
  for(const [k,s] of actual.bySubject){const r=rows.get(k)??{subjectId:k,planned:0,actual:0};r.actual=s.value;rows.set(k,r);}
  const list=[...rows.values()].map(r=>({...r,rate:r.planned>0?Math.min(r.actual,r.planned)/r.planned:null}));
  const planned=planSum(planItems),achieved=list.reduce((s,r)=>s+Math.min(r.actual,r.planned),0);
  return {rows:list,planned,actual:actual.total,achieved,rate:planned>0?achieved/planned:null};
}
// 계획 줄마다 상태: 같은 과목의 실제 벽돌을 줄 순서대로 채운다. kind = gold / ignite(그날 첫 벽돌 과목) / done / part / doing(타이머) / plan.
export function itemStatuses(items,actual,timerSubject=null){
  const left=new Map([...actual.bySubject].map(([k,s])=>[k,s.value])),goldLeft=new Map([...actual.bySubject].map(([k,s])=>[k,s.gold]));
  let ignited=false,timerUsed=false;const out=new Map();
  for(const x of items){
    const have=left.get(x.subjectId)??0,give=Math.min(have,x.bricks);left.set(x.subjectId,have-give);
    if(give>=x.bricks){
      const g=goldLeft.get(x.subjectId)??0;
      // V6F: 글자는 새 카드와 같은 한 벌(안 함 · 조각 · 완료 n장). 종류(kind = 색 class)는 그대로.
      if(g>0){goldLeft.set(x.subjectId,0);out.set(x.id,{kind:'gold',text:ITEM_STATE_TEXT.DONE+' '+give+'장'});}
      else if(!ignited&&actual.first===x.subjectId){ignited=true;out.set(x.id,{kind:'ignite',text:ITEM_STATE_TEXT.DONE+' '+give+'장'});}
      else out.set(x.id,{kind:'done',text:ITEM_STATE_TEXT.DONE+' '+give+'장'});
      if(!ignited&&actual.first===x.subjectId)ignited=true;
    }else if(give>0)out.set(x.id,{kind:'part',text:ITEM_STATE_TEXT.PIECE});
    else if(timerSubject!==null&&timerSubject===x.subjectId&&!timerUsed){timerUsed=true;out.set(x.id,{kind:'doing',text:ITEM_STATE_TEXT.NONE+' ⏱'});}
    else out.set(x.id,{kind:'plan',text:ITEM_STATE_TEXT.NONE});
  }
  return out;
}
export function daySummary(life,ach,date){
  const plan=planOf(life,date),items=sortedItems(plan?.items??[]),actual=actualOf(weekIndex(ach),date);
  return {...planVsActual(items,actual),date,plan,items,actual,actualTotal:actual.total};   // actual = 그날 실제 벽돌(과목별 포함), actualTotal = 합(장)
}
// span = 월요일부터 세는 날 수(1~7, 그 밖의 값은 7). 진행 중인 주 리뷰가 "월요일~오늘"만 셀 때 쓴다(FIX51B C1). 계획 탭은 기본 7일 그대로.
export function weekSummary(life,ach,monday,span=7){
  const weeks=weekIndex(ach),days=[],subjects=new Map(),n=Number.isInteger(span)&&span>=1&&span<=7?span:7;let planned=0,achieved=0,actualTotal=0;
  for(let k=0;k<n;k++){
    const d=shiftDay(monday,k),s=daySummary(life,ach,d);days.push(s);planned+=s.planned;achieved+=s.achieved;actualTotal+=s.actualTotal;
    for(const r of s.rows){const t=subjects.get(r.subjectId)??{subjectId:r.subjectId,planned:0,actual:0,achieved:0};t.planned+=r.planned;t.actual+=r.actual;t.achieved+=Math.min(r.planned,r.actual);subjects.set(r.subjectId,t);}
  }
  const rows=[...subjects.values()].map(r=>({...r,rate:r.planned>0?r.achieved/r.planned:null}));
  return {monday,days,rows,planned,actual:actualTotal,achieved,rate:planned>0?achieved/planned:null,week:weeks.get(monday)??null};
}
export const rateText=r=>r===null?'-':Math.round(r*100)+'%';
export const barsText=v=>(Number.isInteger(v)?String(v):v.toFixed(1))+'장';
export const RATE_MEANING='계획한 만큼 실제로 한 비율(과목·날별, 계획보다 더 한 시간은 안 셈)';   // FIX44 (AUD1 #16): 달성률 옆에 함께 보인다

// ---------- 화면 ----------
const SVGNS='http://www.w3.org/2000/svg';
export function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const svg=(tag,attrs={},text=null)=>{const n=doc.createElementNS?doc.createElementNS(SVGNS,tag):doc.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==null)n.textContent=String(text);return n;};   // V8W2: 오늘 카드 게이지(life-ui)도 이 maker를 쓴다. SVG 이름공간이 없는 문서(시험용 가짜 문서)는 createElement
  return {el,add,button,svg};
}
export function createPlanState(storage=null){
  let view='DAY';try{const v=storage?.getItem(VIEW_KEY);if(VIEWS.some(x=>x[0]===v))view=v;}catch{/* 저장소가 막혀 있으면 기본 보기 */}
  return {view,date:null,monday:null,month:null,year:null,message:null,error:false,notices:[],far:FAR_VIEWS.includes(view)?view:null,examsOpen:false,week:null,picked:{},shownToday:null};
}
// FIX53C (HUNT52 HW1): 계획 탭은 마지막으로 그린 "오늘"(st.shownToday, 계획 탭 날짜 규칙 kstDate)을 기억한다. 바뀌었으면 사용자가 직접 고르지 않은
// 보기 날짜(date·monday·month·year)를 비워 새 오늘로 돌아간다. ◀▶·주 고르기로 고른 칸은 st.picked에 적어 그대로 두고, '오늘'·'이번 주'·'이번 달'·'올해'로 돌아오면 지운다.
const PLAN_DATE_KEYS=['date','monday','month','year'];
export function choosePlanDate(st,key,value,picked=true){
  st[key]=value;const p=st.picked??={};
  if(picked)p[key]=true;else delete p[key];
}
// FIX55C1 (HUNT53 HL2): 주 격자 초안(st.week, plan-week)에서 처음 고친 때와 다른 날 = 저장 안 한 입력(plan-week changedDates와 같은 규칙).
export const weekDraftChanged=draft=>[...(draft?.items?.keys()??[])].filter(d=>stable(draft.items.get(d))!==stable(draft.base?.get(d)?.items??[])).sort();
// 지금 보이는 주(고르지 않은 st.monday)에 저장 안 한 입력이 있으면 자정에 그 주를 따라가지 않는다(입력이 화면에서 사라지지 않게).
const weekHeld=st=>{const m=st.monday;if(!m||st.picked?.monday)return false;const end=shiftDay(m,6);return weekDraftChanged(st.week).some(d=>d>=m&&d<=end);};
// 날이 바뀌었을 때 비울 보기 날짜 키(상태를 바꾸지 않는 계산). eventQuery도 이것으로 같은 날짜를 읽는다(HL1).
const followKeys=(st,today)=>st.shownToday!=null&&st.shownToday!==today?PLAN_DATE_KEYS.filter(k=>!st.picked?.[k]&&!(k==='monday'&&weekHeld(st))):[];
export function followPlanToday(st,today){
  const held=st.shownToday!=null&&st.shownToday!==today&&weekHeld(st);
  for(const k of followKeys(st,today))st[k]=null;
  if(!held)st.shownToday=today;   // HL2: 입력 때문에 머문 동안은 옛 "오늘"을 그대로 둔다 → 입력이 없어진(저장·버림) 뒤 그리면 그때 따라간다
}
function setView(st,ctx,view){
  st.view=view;
  try{(ctx.storage??globalThis.localStorage)?.setItem(VIEW_KEY,view);}catch{/* 보기 기억은 실패해도 무시 */}
}
function readTimerSubject(ctx){
  try{const v=JSON.parse((ctx.storage??globalThis.localStorage)?.getItem(TIMER_KEY)??'null');return v&&typeof v.subjectId==='string'?v.subjectId:null;}catch{return null;}
}
const subjectMap=defs=>new Map(defs.subjects.map(s=>[s.id,s]));
const subjectOf=(subjects,id)=>subjects.get(id)??{id,name:'기타',color:NO_SUBJECT_COLOR,bridge:false};
function tag(h,subjects,id,{dashed=false}={}){
  const s=subjectOf(subjects,id),n=h.el('span',null,'plan-tag'+(dashed?' dashed':''));
  const dot=h.svg('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'});dot.append(h.svg('circle',{cx:5,cy:5,r:5,fill:s.color}));
  n.dataset.subjectId=id;n.append(dot,h.el('span',s.name+(s.bridge?' · 징검다리':'')));return n;
}
// 칩 4개. '오늘'은 날짜도 오늘로 되돌린다. '월'은 기본 보기(FIX75 H74-4: '달력' 진입이 세운 날짜 달력 monthDates를 끈다 · V10D-1: 기본 = 계획 달력, 과목 표 monthTable도 끈다). '연간 계획'(옛 '멀리')은 마지막에 본 먼 보기(없으면 연)로 가고, 고른 동안 아래에 연·수능까지 칩 줄을 연다.
function viewChips(h,ctx,st,today){
  const far=FAR_VIEWS.includes(st.view),rows=[];
  const line=(list,label,cls)=>{
    const row=h.el('div',null,cls);row.setAttribute('role','toolbar');row.setAttribute('aria-label',label);
    for(const [key,text] of list){
      const on=key==='FAR'?far:st.view===key;
      const pick=()=>{if(key==='DAY')choosePlanDate(st,'date',today,false);if(key==='MONTH'){st.monthDates=false;st.monthTable=false;}setView(st,ctx,key==='FAR'?(far?st.view:st.far??FAR_VIEWS[0]):key);if(FAR_VIEWS.includes(st.view))st.far=st.view;void ctx.rerender();};
      const b=ctx.kit?.chip?ctx.kit.chip(text,{selected:on,onClick:pick}):h.button(text,pick,'lb-chip'+(on?' selected':''));
      b.setAttribute('aria-pressed',String(on));b.dataset.view=key;row.append(b);
    }
    rows.push(row);
  };
  line(VIEW_CHIPS,'계획 보기','plan-views');
  if(far)line(VIEWS.filter(([k])=>FAR_VIEWS.includes(k)),'연간 계획 보기','plan-views plan-far');
  return rows;
}
// 머리 시험 카드 4칸: 오늘 이후 시험을 앞에서부터 4개(모자라면 지난 시험으로 채움). 가장 가까운 시험은 강조, 수능은 금빛, 지난 시험은 "끝".
export function examCards(exams,today){
  const items=[...(exams?.items??[])].sort(byDate),upcoming=items.filter(x=>x.date>=today),past=items.filter(x=>x.date<today);
  const pick=[...past.slice(Math.max(0,past.length-Math.max(0,4-upcoming.length))),...upcoming.slice(0,4)].sort(byDate);
  const target=csatTarget(exams),nearest=upcoming[0]??null;
  return pick.map(x=>({...x,name:examDisplayName(x),dDay:dDay(today,x.date),ended:x.date<today,nearest:nearest!==null&&x.id===nearest.id,csat:target!==null&&x.id===target.id}));
}
function examRow(h,exams,today){
  const row=h.el('div',null,'plan-exams');
  for(const x of examCards(exams,today)){
    const c=h.el('div',null,'plan-exam'+(x.csat?' csat':'')+(x.nearest?' nearest':'')+(x.ended?' ended':''));c.dataset.examId=x.id;
    h.add(c,h.el('span',x.name,'plan-exam-name'),h.el('strong',x.ended?'끝':(x.dDay===0?'D-DAY':'D-'+x.dDay),'plan-exam-dday'),examStatusOf(x)==='잠정'?h.el('span','잠정','life-badge'):null,h.el('span',x.date,'muted small'));
    row.append(c);
  }
  if(!row.children.length)row.append(h.el('p','시험 일정이 없습니다. 오늘 탭의 습관 편집에서 추가하세요.','muted small'));
  return row;
}
// V6A: D-day 두 칩. 가까운 시험이 먼저([다음 시험], 금 테두리·크게), 그 뒤 수능([최종], 보조·작게). 한 문장으로 잇지 않는다. 잠정 배지는 그 칩 안에만.
// 순서는 날짜 오름차순 계산(글자 고정 없음). 지난 시험은 빠지고 다음 시험으로 넘어간다. 가장 가까운 시험이 수능이면 칩 하나([최종]).
// 오늘 카드 머리·계획 탭 칩·STUDY LIVE 덮개가 모두 이 함수(ddayChips·ddayChipsNode)를 쓴다.
// V8W2-1·3: 두 칩 중 하나가 "활성"이다(active = 'next' 다음 모의평가 · 'final' 수능). 활성 칩 = 진하게(.main), 다른 칩 = 연하게. 누르면 바뀌고 이 기기에만 기억한다(lb.dday.active, 화면 설정이라 기록 쓰기 0).
// 고른 값이 없거나 그 칩이 지금 없으면(예: 수능만 남음) 날짜가 가까운 칩이 활성(V6A 그대로). 오늘 카드·계획 탭·STUDY LIVE가 같은 값을 읽는다.
const ddayText=x=>x.dDay===0?'D-DAY':'D-'+x.dDay;
export const DDAY_LABEL=Object.freeze({next:'다음 시험',final:'최종'});
export const DDAY_KEY='lb.dday.active',DDAY_ROLES=Object.freeze(['next','final']);
export function readDdayActive(storage){try{const v=storage?.getItem(DDAY_KEY)??null;return DDAY_ROLES.includes(v)?v:null;}catch{return null;}}
export function writeDdayActive(storage,role){if(!DDAY_ROLES.includes(role))return false;try{storage?.setItem(DDAY_KEY,role);return true;}catch{return false;}}
export function ddayChips(exams,today,active=null){
  const up=[...(exams?.items??[])].sort(byDate).filter(x=>x.date>=today),target=csatTarget(exams),fin=target&&target.date>=today?target:null,next=up[0]??null,out=[];
  if(next&&(!fin||next.id!==fin.id))out.push({...next,role:'next'});
  if(fin)out.push({...fin,role:'final'});
  const list=out.sort(byDate),on=list.some(x=>x.role===active)?active:list[0]?.role;
  return list.map(x=>({id:x.id,name:examDisplayName(x).replace(/\(.*\)/,''),date:x.date,status:examStatusOf(x),dDay:dDay(today,x.date),role:x.role,main:x.role===on}));
}
export const ddayChipText=c=>DDAY_LABEL[c.role]+' '+c.name+' '+ddayText(c);
// h = {el,add,button}. pick이 없으면 칩 줄은 span(STUDY LIVE처럼 보기만), 있으면 칩마다 단추(aria-pressed = 활성)이고 누르면 pick(role).
// V10FIX2: gauge(칩 → ddayGauge 값)를 주면 칩 안에 얇은 막대(ddayChipBar)를 단다(계획 탭). 오늘 탭·STUDY LIVE는 주지 않아 그대로.
export function ddayChipsNode(h,chips,cls='',pick=null,gauge=null){
  const row=h.el('span',null,'lb-dday-chips'+(cls?' '+cls:''));
  for(const c of chips){
    const k='lb-dday-chip '+c.role+(c.main?' main':'');
    const n=h.add(pick?h.button(null,()=>pick(c.role),k):h.el('span',null,k),h.el('span',DDAY_LABEL[c.role],'lb-dday-label'),h.el('strong',c.name+' '+ddayText(c),'lb-dday-value'),c.status==='잠정'?h.el('span','잠정','life-badge'):null,gauge?ddayChipBar(h,gauge(c)):null);
    n.dataset.examId=c.id;if(pick)n.setAttribute('aria-pressed',String(c.main));row.append(n);
  }
  return row;
}
// V8W2-2: 활성 디데이 게이지. 구간 = max(같은 줄 직전 시험일, 시험일 − 365일) ~ 시험일. 같은 줄 = 수능 줄(수능끼리) / 모의평가 줄(3평→6평→9평).
// 날 수는 앱의 오늘 날짜(D-n과 같은 값, 자정에 바뀜)로 센다. left = 남은 날(구간보다 길면 구간 날 수 = 100%), pct = 남은 몫 %.
// cut = 오늘 줄어든 한 칸([left, left+1], 오늘이 구간 첫날이거나 그 전이면 null): 하루가 지나면 금 막대가 한 칸 줄고 그 칸이 따로 보인다.
export const DDAY_SPAN_MAX=365;
const csatLine=(x,target)=>x.id==='e-csat'||x.name==='수능'||(target!==null&&x.id===target.id);
export function ddayGauge(exams,chip,today){
  const items=[...(exams?.items??[])].sort(byDate),target=csatTarget(exams),x=chip?items.find(y=>y.id===chip.id):null;
  if(!x||x.date<today)return null;
  const line=csatLine(x,target),prev=items.filter(y=>y.id!==x.id&&y.date<x.date&&csatLine(y,target)===line).at(-1)??null;
  const floor=shiftDay(x.date,-DDAY_SPAN_MAX),start=prev&&prev.date>floor?prev.date:floor;
  const total=Math.max(1,dDay(start,x.date)),d=dDay(today,x.date),left=Math.min(total,d);
  return {id:x.id,role:chip.role,name:chip.name,date:x.date,start,prev:prev?.id??null,total,dDay:d,left,pct:left/total*100,cut:d<total?{from:left,to:left+1}:null};
}
// "D-369 · 52주 5일 · 약 12개월". 한 주가 안 되면 주 없이, 30일이 안 되면 개월 없이.
export function ddayLongText(d){
  if(d<=0)return 'D-DAY';
  const w=Math.floor(d/7),r=d%7,m=Math.round(d*12/365.2425);
  return ['D-'+d,w?w+'주'+(r?' '+r+'일':''):null,d>=30&&m>=1?'약 '+m+'개월':null].filter(Boolean).join(' · ');
}
export const ddayPctText=g=>'남은 '+(Math.round(g.pct*10)/10)+'%';
// V8FIX L-12(일부): 구간 첫날(dDay = total)에는 안내가 없었다 → "구간 첫날 · 내일부터 하루씩 줄어요". 시작 전 "n일 뒤"의 n(= 구간 시작까지 날 수)은 V8W2 시험이 단언하는 값 그대로(REPORT 남김).
export function ddayWaitText(g){return g.dDay<=g.total?'구간 첫날 · 내일부터 하루씩 줄어요':'구간 시작 전 · '+(g.dDay-g.total)+'일 뒤부터 줄어요';}
// h = {el,add,svg}. 막대 = SVG(바탕 회색 빗금 = 지나간 몫 · 금 = 남은 몫 · 오늘 줄어든 칸 = 금 테 빗금 칸 + 진한 눈금), 너비는 % 속성(인라인 style 없음).
// V10B-4 (0절 게이지 규칙): 처음에 꽉 차 있고 왼쪽부터 깎인다 → 남은 금은 오른쪽 끝에 붙고(x = 지나간 몫), 오늘 줄어든 칸은 그 바로 왼쪽, 눈금은 금이 시작하는 자리.
export function ddayGaugeNode(h,g){
  if(!g)return null;
  const {el,add,svg}=h,pct=v=>Math.round(v/g.total*100000)/1000+'%',id='dd-hatch-'+g.role,H=14,gone=g.total-g.left;
  const bar=svg('svg',{class:'dd-gauge-bar',width:'100%',height:H,'aria-hidden':'true'}),pat=svg('pattern',{id,width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});
  pat.append(svg('rect',{class:'hc-hatch-bg',width:6,height:6}),svg('line',{class:'hc-hatch-line',x1:0,y1:0,x2:0,y2:6}));
  add(bar,add(svg('defs'),pat),svg('rect',{class:'dd-gauge-past',x:0,y:0,width:'100%',height:H,fill:'url(#'+id+')'}),
    g.left>0?svg('rect',{class:'dd-gauge-left',x:pct(gone),y:0,width:pct(g.left),height:H}):null,
    g.cut?svg('rect',{class:'dd-gauge-cut',x:pct(g.total-g.cut.to),y:0,width:pct(1),height:H}):null,
    g.cut?svg('line',{class:'dd-gauge-mark',x1:pct(gone),y1:0,x2:pct(gone),y2:H}):null);
  const out=add(el('div',null,'dd-gauge '+g.role),
    add(el('div',null,'dd-gauge-head'),el('span',g.name+'까지','dd-gauge-name'),el('strong',ddayPctText(g),'dd-gauge-pct')),bar,
    add(el('p',null,'dd-gauge-text'),el('strong',ddayLongText(g.dDay),'dd-gauge-long'),g.cut?el('span','오늘도 하루 줄었어요','dd-gauge-cut-text'):g.dDay>=g.total?el('span',ddayWaitText(g),'dd-gauge-cut-text'):null),
    el('p','구간 '+g.start+' ~ '+g.date+' · '+g.total+'일','dd-gauge-span'));
  out.dataset.examId=g.id;out.dataset.left=String(g.left);out.dataset.total=String(g.total);
  out.setAttribute('role','group');out.setAttribute('aria-label',g.name+'까지 '+ddayPctText(g)+' · '+ddayLongText(g.dDay)+(g.cut?' · 오늘도 하루 줄었어요':''));
  return out;
}
// V10FIX2 (소유자 2026-11-15 "계획 탭 디데이칩에도 게이지 넣어", V10HUNT L-01): 계획 탭 칩 안의 얇은 막대. 값은 오늘 탭 게이지와 같은 ddayGauge.
// 바탕 = 지나간 몫, 금 = 남은 몫(오른쪽 끝에 붙음 = 처음 꽉 차 있고 왼쪽부터 깎임). 시험 당일은 left 0 → 빈 막대, 다음 날은 칩이 없어 막대도 없음.
// 칩 크기 안의 4px 막대라 오늘 줄어든 칸·눈금·% 글자는 그리지 않는다(계획 탭 퍼센트 없음 B44B-8a, 글자는 칩의 D-n 그대로).
export const DDAY_CHIP_BAR_H=4;
export function ddayChipBar(h,g){
  if(!g)return null;
  const H=DDAY_CHIP_BAR_H,pct=v=>Math.round(v/g.total*100000)/1000+'%',bar=h.svg('svg',{class:'lb-dday-chip-bar',width:'100%',height:H,'aria-hidden':'true','data-left':g.left,'data-total':g.total});
  bar.append(h.svg('rect',{class:'lb-dday-chip-past',x:0,y:0,width:'100%',height:H}));
  if(g.left>0)bar.append(h.svg('rect',{class:'lb-dday-chip-left',x:pct(g.total-g.left),y:0,width:pct(g.left),height:H}));
  return bar;
}
// 글자판(읽기 낭독·안내용): "다음 시험 3평 D-133 · 최종 수능 D-373". 다가올 시험이 없으면 "지난 시험 n개", 일정이 없으면 null.
export function examLineText(exams,today){
  const chips=ddayChips(exams,today);
  if(chips.length)return chips.map(ddayChipText).join(' · ');
  const cards=examCards(exams,today);
  return cards.length?'지난 시험 '+cards.length+'개':null;
}
// V8W2-3: 칩이 있으면 줄 = 칩 단추들(누르면 활성, 오늘 카드와 같은 lb.dday.active) + 펼치기 단추(plan-exam-toggle). 칩이 없으면(지난 시험만) 예전처럼 줄 전체가 펼치기 단추.
function examLine(h,ctx,st,exams,today){
  const text=examLineText(exams,today);
  if(text===null)return examRow(h,exams,today);   // 시험 일정이 없으면 안내 문구 그대로
  const storage=ctx.storage??null,chips=ddayChips(exams,today,readDdayActive(storage)),flip=()=>{st.examsOpen=!st.examsOpen;void ctx.rerender();};
  const b=h.button(chips.length?(st.examsOpen?'일정 접기 ▴':'일정 ▾'):text,flip,chips.length?'secondary plan-exam-toggle':'plan-exam-line');
  b.setAttribute('aria-expanded',String(Boolean(st.examsOpen)));b.setAttribute('aria-label','시험 일정 '+(st.examsOpen?'접기':'펼치기')+' · '+text);
  const line=chips.length?h.add(h.el('div',null,'plan-exam-line has-chips'),ddayChipsNode(h,chips,'',role=>{writeDdayActive(storage,role);void ctx.rerender();},c=>ddayGauge(exams,c,today)),b):b;   // V10FIX2: 칩마다 얇은 게이지
  if(chips.length){line.setAttribute('role','group');line.setAttribute('aria-label','디데이');}
  return h.add(h.el('div',null,'plan-exam-wrap'),line,st.examsOpen?examRow(h,exams,today):null);
}
// here = 이미 지금(오늘·이번 주·이번 달·올해)을 보고 있음 → 되돌아가기 단추를 그리지 않는다(같은 글자가 두 번 보이지 않게, P1A).
function navRow(h,label,onPrev,onNext,onNow,nowText='오늘',here=false){
  return h.add(h.el('div',null,'plan-nav'),h.button('◀',onPrev,'secondary'),h.el('strong',label,'plan-nav-label'),h.button('▶',onNext,'secondary'),here?null:h.button(nowText,onNow,'secondary'));
}

// ----- 일 보기 -----
function dayView(h,ctx,st,ctxData){
  const {life,ach,today,subjects}=ctxData,date=st.date??=today,sum=daySummary(life,ach,date),timer=date===today?readTimerSubject(ctx):null;
  const out=h.el('section',null,'plan-card plan-day');
  h.add(out,navRow(h,dateLabel(date)+(date===today?' · 오늘':''),()=>{choosePlanDate(st,'date',shiftDay(date,-1));void ctx.rerender();},()=>{choosePlanDate(st,'date',shiftDay(date,1));void ctx.rerender();},()=>{choosePlanDate(st,'date',today,false);void ctx.rerender();},'오늘',date===today));
  // P1B: 앱이 ctx.todayPlan을 넘겨 주면 오늘 화면과 같은 "오늘 계획" 카드(plan-today.mjs의 같은 함수)를 그린다. 줄이 곧 계획 vs 실제라 아래 표는 그리지 않는다. 못 받으면 아래 옛 보기.
  const card=ctx.todayPlan?.({date,today})??null;
  if(card){h.add(out,card,h.add(h.el('div',null,'button-row'),h.button('계획 편집',()=>openPlanEditor(ctx,st,date),'secondary')));return out;}
  const blocksUsed=[...new Set(sum.items.map(x=>shownBlock(x.block)))];
  h.add(out,h.el('h3','계획 · '+(blocksUsed.length?blocksUsed.map(b=>BLOCK_TEXT[b]).join('·'):'-')+' / 합 '+barsText(sum.planned)));   // V6F: 약자 대신 한글 시간대
  if(!sum.items.length)h.add(out,h.el('p','이 날의 계획이 없습니다. "계획 편집"에서 줄을 추가하세요.','muted small'));
  const status=itemStatuses(sum.items,sum.actual,timer);
  for(const b of SHOWN_BLOCKS){
    const rows=sum.items.filter(x=>shownBlock(x.block)===b);if(!rows.length)continue;
    const g=h.add(h.el('div',null,'plan-block'),h.el('span',BLOCK_TEXT[b],'plan-block-name'));
    for(const x of rows){
      const stt=status.get(x.id),r=h.el('div',null,'plan-row');r.dataset.itemId=x.id;
      h.add(r,tag(h,subjects,x.subjectId,{dashed:(sum.actual.bySubject.get(x.subjectId)?.value??0)===0}),h.el('span',x.title+' · '+barsText(x.bricks),'plan-title'),h.el('span',stt.text,'plan-status '+stt.kind));
      g.append(r);
    }
    out.append(g);
  }
  h.add(out,h.el('p','계획 SUM '+barsText(sum.planned)+' · 실제 '+barsText(sum.actualTotal)+(sum.rate!==null?' · 계획 달성 '+rateText(sum.rate):''),'plan-sum'));
  if(sum.rows.length){
    const t=h.el('div',null,'plan-compare');
    for(const r of sum.rows)h.add(t,h.add(h.el('div',null,'plan-compare-row'),tag(h,subjects,r.subjectId),h.el('span','계획 '+barsText(r.planned)+' · 실제 '+barsText(r.actual),'muted small'),h.el('strong',rateText(r.rate))));
    h.add(out,h.el('h3','계획 vs 실제'),t);
  }
  h.add(out,h.add(h.el('div',null,'button-row'),h.button('계획 편집',()=>openPlanEditor(ctx,st,date),'primary')));
  return out;
}

// ----- 주 보기 -----
function weekBars(h,sum,goal){
  const W=336,H=150,col=W/7,base=120,top=14,maxV=Math.max(goal,...sum.days.map(d=>Math.max(d.planned,d.actual.total)),1),unit=(base-top)/maxV;
  const s=h.svg('svg',{class:'plan-weekbars',viewBox:'0 0 '+W+' '+H,width:'100%',role:'img','aria-label':'요일별 벽돌, 점선은 계획, 색 막대는 실제'});
  sum.days.forEach((d,k)=>{
    const x=k*col+(col-28)/2;
    if(d.planned>0)s.append(h.svg('rect',{class:'plan-bar-plan',x,y:base-d.planned*unit,width:28,height:d.planned*unit}));
    let y=base;
    for(const it of d.actual.items){const hh=(it.half?0.5:1)*unit;y-=hh;s.append(h.svg('rect',{class:'plan-bar-actual'+(it.gold?' gold':''),x:x+2,y:y+0.5,width:24,height:Math.max(0.5,hh-1),fill:it.color}));}
    s.append(h.svg('text',{class:'plan-bar-label',x:k*col+col/2,y:136},WEEKDAY[(k+1)%7]));
    if(d.actual.total>0||d.planned>0)s.append(h.svg('text',{class:'plan-bar-value',x:k*col+col/2,y:Math.max(10,base-Math.max(d.planned,d.actual.total)*unit-3)},barsText(d.actual.total)));
  });
  s.append(h.svg('line',{class:'plan-bar-base',x1:0,y1:base,x2:W,y2:base}));
  return s;
}
// 달성률 분모 = 오늘까지의 계획(P1A): 오늘보다 뒤 날의 계획은 빼고 "남은 계획"으로 따로 센다.
export function weekToDate(sum,today){
  let planned=0,achieved=0,later=0;
  for(const d of sum.days){if(d.date<=today){planned+=d.planned;achieved+=d.achieved;}else later+=d.planned;}
  return {planned,achieved,later,rate:planned>0?achieved/planned:null};
}
function weekView(h,ctx,st,data){
  const {life,ach,today,subjects}=data,monday=st.monday??=mondayOf(today);
  // P1A: 앱이 ctx.planWeek를 넘겨 주면 7열 × 4블록 격자(plan-week.mjs)를 그린다. 못 받으면 아래 옛 막대 보기.
  const grid=ctx.planWeek?.(st,{today})??null;
  if(grid)return grid;
  const sum=weekSummary(life,ach,monday),upto=weekToDate(sum,today);
  const out=h.el('section',null,'plan-card plan-week');
  h.add(out,navRow(h,short(monday)+' ~ '+short(shiftDay(monday,6))+(monday===mondayOf(today)?' · 이번 주':''),()=>{choosePlanDate(st,'monday',shiftDay(monday,-7));void ctx.rerender();},()=>{choosePlanDate(st,'monday',shiftDay(monday,7));void ctx.rerender();},()=>{choosePlanDate(st,'monday',mondayOf(today),false);void ctx.rerender();},'이번 주',monday===mondayOf(today)));
  h.add(out,weekBars(h,sum,ach.goalBricks));
  h.add(out,h.el('p','계획 '+barsText(sum.planned)+' · 실제 '+barsText(sum.actual)+(upto.rate!==null?' · 계획 달성 '+rateText(upto.rate)+(upto.later>0?' · 남은 계획 '+barsText(upto.later):''):sum.planned>0?' · 남은 계획 '+barsText(upto.later):' · 이 주 계획 없음'),'plan-sum'),upto.rate!==null?h.el('p',RATE_MEANING,'muted small pw-rate-note'):null);
  if(sum.rows.length){
    const t=h.el('div',null,'plan-compare');
    for(const r of sum.rows)h.add(t,h.add(h.el('div',null,'plan-compare-row'),tag(h,subjects,r.subjectId),h.el('span','계획 '+barsText(r.planned)+' · 실제 '+barsText(r.actual),'muted small'),h.el('strong',rateText(r.rate))));
    h.add(out,h.el('h3','과목별'),t);
  }
  h.add(out,h.el('h3','주간 퀘스트'));
  const quests=sum.week?.quests??[];
  if(!quests.length)h.add(out,h.el('p','이 주의 기록이 없어 퀘스트도 없습니다.','muted small'));
  for(const q of quests){
    const ariaText=q.label+' '+q.value+' / '+q.target;let bar=ctx.kit?.bar?.(q.value,q.target,ariaText);
    if(!bar){bar=h.el('progress',null,'lb-xp-bar');bar.max=q.target>0?q.target:1;bar.value=Math.min(q.value,bar.max);bar.setAttribute('aria-label',ariaText);}
    h.add(out,h.add(h.el('div',null,'plan-quest'+(q.done?' done':'')),h.add(h.el('div',null,'lb-xp-head'),h.el('span',q.label+(q.done?' · 완료':'')),h.el('strong',q.value+' / '+q.target+q.unit)),bar));
  }
  return out;
}

// ----- 월 보기 -----
export function heatLevel(value,goal){
  if(!(value>0))return 0;
  const r=value/Math.max(1,goal);
  return r<0.5?1:r<1?2:r<1.5?3:4;
}
function monthView(h,ctx,st,data){
  const {today}=data,ym=st.month??=today.slice(0,7);
  const out=h.el('section',null,'plan-card plan-month');
  h.add(out,navRow(h,ym.slice(0,4)+'년 '+Number(ym.slice(5,7))+'월',()=>{choosePlanDate(st,'month',shiftMonth(ym,-1));void ctx.rerender();},()=>{choosePlanDate(st,'month',shiftMonth(ym,1));void ctx.rerender();},()=>{choosePlanDate(st,'month',today.slice(0,7),false);void ctx.rerender();},'이번 달',ym===today.slice(0,7)));
  // P1C: 앱이 ctx.planMonth를 넘겨 주면 과목 × 주차 표(plan-month.mjs)를 그리고, 날짜 달력은 그 안의 "날짜로 보기"로 들어간다. 못 받으면 아래 날짜 달력 그대로.
  const items=planItemsDone(data.life,data.study,ym+'-01',ym+'-'+String(daysInMonth(ym)).padStart(2,'0'),today,ctx.storage??null,studyDraftOf(ctx,today));   // V6A: 이 달 계획 줄 n개 중 m개(손 완료 표시 포함) · FIX68 F7: 오늘 초안 포함
  // V8W3-2: 계획 탭 날짜 달력도 뒤 빈칸을 다음 달 날짜로 채워 주마다 7칸(tail), 앞뒤 달 날짜에도 기록 표시(dateGrid의 !o.pick 경로).
  // V10D-1: 계획 달력 칸을 누르면 그날 요약 시트(날짜 달력 칸과 같은 openDaySheet).
  // V12C-2: 계획 달력 칸을 누르면 시트 대신 달력 아래에 그날 세부(dayDetail = monthDayDetail: 일정·계획 목록 + "고치기"). V12C-3: 날짜로 보기 = 왼쪽 주 이름 열(weeks) + 작은 칸.
  const table=ctx.planMonth?.(st,{data,ym,items,dateGrid:()=>dateGrid(h,ctx,st,data,ym,{tail:true,weeks:true}),goWeek:monday=>{choosePlanDate(st,'monday',monday);setView(st,ctx,'WEEK');void ctx.rerender();},openDay:date=>openDaySheet(ctx,st,data,date),dayDetail:(date,show)=>monthDayDetail(h,ctx,st,data,date,show)})??null;
  h.add(out,...(table?[table]:dateGrid(h,ctx,st,data,ym,{tail:true,weeks:true})));
  return out;
}
// CAL2: o = {pick(날짜): 칸을 누르면 그날 요약 시트 대신 이것을 부른다(오늘 탭 달력), selected: 고른 날(selected·aria-pressed), tail: 뒤 빈칸에 다음 달 흐린 날짜}. 없으면 계획 탭 그대로.
function dateGrid(h,ctx,st,data,ym,o={}){
  const {life,ach,today,exams,subjects}=data,first=ym+'-01',n=daysInMonth(ym),lead=(sunday0(first)+6)%7;
  const examDays=new Map();for(const x of exams.items){examDays.set(x.date,[...(examDays.get(x.date)??[]),examDisplayName(x)]);}   // V12FIX L-C1: "2028 수능"(화면 이름 하나)
  const eventDays=new Map();for(const e of ctx.planCal?.events??[])eventDays.set(e.date,(eventDays.get(e.date)??0)+1);
  const weeks=weekIndex(ach);
  const grid=h.el('div',null,'plan-cal'+(o.weeks?' with-weeks':''));
  // V12C-3 · V12A-1 (0절 주 이름 공통): o.weeks면 왼쪽에 주 이름 열("11월 3주", 계획 달력과 같은 weekName = 목요일 규칙). 칸은 7개씩 그대로, 줄 앞에 주 이름 칸 하나.
  // V12_MERGE: 오늘 탭 펼친 달·계획 탭 날짜로 보기가 이 한 구현을 같이 쓴다(구현 두 벌 금지).
  if(o.weeks)grid.append(h.el('span',null,'plan-cal-corner'));
  for(const w of ['월','화','수','목','금','토','일'])grid.append(h.el('span',w,'plan-cal-head'+(w==='토'?' sat':w==='일'?' sun':'')));
  let slot=0;
  const put=n=>{
    if(o.weeks&&slot%7===0){const mon=shiftDay(first,slot-lead),wn=weekName(mon),[mm,nn]=wn.text.split(' '),c=h.add(h.el('span',null,'plan-cal-week'+(wn.ym!==ym?' other':'')),h.el('small',mm,'plan-cal-week-month'),h.el('strong',nn,'plan-cal-week-n'));c.dataset.monday=mon;c.setAttribute('aria-label',(wn.ym.slice(0,4)!==ym.slice(0,4)?Number(wn.ym.slice(0,4))+'년 ':'')+wn.text);if(shiftDay(mon,6)<today)c.setAttribute('data-past','');grid.append(c);}
    slot++;grid.append(n);
  };
  // 칸 안 기록 표시: 쌓은 과목 점(최대 3) · 시험 이름. V11B L-08: 점은 칸 왼쪽부터(xMinYMid, 날짜·미리보기와 같은 왼쪽 정렬, 전에는 가운데).
  const marks=(n,act,ex)=>{
    const subs=[...act.bySubject.keys()].slice(0,3);
    if(subs.length){const dots=h.svg('svg',{class:'plan-dots',viewBox:'0 0 30 8',width:'100%',preserveAspectRatio:'xMinYMid meet','aria-hidden':'true'});subs.forEach((id,k)=>dots.append(h.svg('circle',{cx:5+k*10,cy:4,r:3.5,fill:subjectOf(subjects,id).color})));n.append(dots);}
    if(ex.length)n.append(h.el('span',ex.length>1?ex.length+'개':ex[0].replace(/\(.*\)/,''),'plan-cal-exam'));
  };
  // CAL1C: 앞(·tail이면 뒤) 빈칸(칸 수 그대로)에 다른 달 날짜를 흐린 숫자로(Windows 달력처럼, 누르지 않음·오늘·지난 날 표시 없음).
  // V8W3-2: 계획 탭(o.pick 없음)은 그 칸에도 기록(과목 점·시험·계획 점)을 보인다 — 주는 7칸, 다른 달 날짜는 조금 연하되 기록은 읽힌다. 오늘 탭 달력(o.pick)은 V8W1 그대로 숫자만.
  const otherCell=date=>{
    const blank=h.el('span',null,'plan-cal-blank'),num=h.el('span',String(Number(date.slice(-2))),'plan-cal-other');num.setAttribute('aria-hidden','true');blank.append(num);
    if(dateKeyOK(date)&&date<today)blank.dataset.past='1';   // V8FIX L-01: 앞 달의 지난 날도 0절 "지나간 것"(앞으로 올 다음 달 날짜와 구별)
    if(o.pick||!dateKeyOK(date))return blank;
    const act=actualOf(weeks,date),ex=examDays.get(date)??[],hasPlan=Boolean(planOf(life,date)?.items.length);
    if(!act.total&&!ex.length&&!hasPlan)return blank;
    blank.className='plan-cal-blank has-rec'+(hasPlan?' has-plan':'');blank.dataset.date=date;
    marks(blank,act,ex);
    return blank;
  };
  for(let i=0;i<lead;i++)put(otherCell(shiftDay(first,i-lead)));
  // CAL1B: 오늘 칸 = "오늘"·aria-current, 지난 날 = data-past(흐리게), 토·일 칸 = sat·sun(숫자 색). CAL1C: 오늘 = 옅은 금 칸 + 숫자 뒤 금 동그라미(CSS).
  for(let d=1;d<=n;d++){
    const date=ym+'-'+String(d).padStart(2,'0'),act=actualOf(weeks,date),ex=examDays.get(date)??[],hasPlan=Boolean(planOf(life,date)?.items.length),evs=eventDays.get(date)??0,outs=ctx.planCal?.outer?.on(date).length??0,wd=sunday0(date);
    const b=h.button(null,()=>{if(o.pick)o.pick(date);else openDaySheet(ctx,st,data,date);},'plan-day-cell plan-heat-'+heatLevel(act.total,ach.goalBricks)+(date===today?' today':'')+(ex.length?' exam':'')+(hasPlan?' has-plan':'')+(wd===6?' sat':wd===0?' sun':'')+(o.pick&&o.selected===date?' selected':''));
    b.dataset.date=date;if(o.pick)b.setAttribute('aria-pressed',String(o.selected===date));b.setAttribute('aria-label',dateLabel(date)+' 벽돌 '+barsText(act.total)+(ex.length?' · '+ex.join(', '):'')+(evs?' · 일정 '+evs+'개':'')+(outs?' · 바깥 일정 '+outs+'개':'')+(hasPlan?' · 계획 있음':''));
    if(date===today){b.setAttribute('aria-current','date');b.append(h.el('span','오늘','calendar-today-badge'));}
    else if(date<today)b.setAttribute('data-past','');
    b.append(h.el('span',String(d),'plan-cal-num'));
    marks(b,act,ex);
    if(o.pick){homeCellEvents(h,b,date,ctx.planCal);if(date<today)homeCellGold(b,data.study,date);}   // V10B-1·5: 오늘 탭 펼친 달 = 일정 미리보기 2줄 + 지난 날 집중 금빛
    else{if(evs)b.append(h.el('span','●'+evs,'plan-cal-events'));if(outs)b.append(h.el('span','○'+outs,'plan-cal-events ics-outer-mark'));}
    put(b);
  }
  if(o.tail)for(let i=1;i<=(7-(lead+n)%7)%7;i++)put(otherCell(shiftMonth(ym,1)+'-0'+i));
  return [grid,heatLegend(h.el),h.el('p',o.pick?'날짜를 누르면 아래 목록과 하루 기록이 그날로 바뀝니다 · 칸 아래 막대가 진할수록 벽돌이 많고 점은 쌓은 과목입니다.':'날짜를 누르면 그날 요약이 열립니다 · 칸 아래 막대가 진할수록 벽돌이 많고 점은 쌓은 과목입니다.','muted small')];
}
// CAL2B: 공부량 범례 = 칸 아래 하늘색 막대 4단계(heatLevel 구간 그대로). 글 안내가 따로 있어 읽기 도구에는 숨긴다. el = (태그, 글, 클래스).
export function heatLegend(el){
  const p=el('p',null,'plan-heat-legend');p.setAttribute('aria-hidden','true');
  p.append(el('span','벽돌 적음',null));for(let i=1;i<=4;i++)p.append(el('span',null,'plan-heat-sw l'+i));p.append(el('span','많음',null));
  return p;
}
// ----- 일정 줄 (P1C: '달력' 화면을 계획 탭에 합침): 앱이 읽어 준 일정(ctx.planCal)과 시험을 보여 주기만 한다. 일정 추가·고치기는 앱의 일정 시트(planCal.add·open) ------
// 앱이 이 보기를 그리기 전에 읽을 범위(/api/calendar-view 요청 그대로). 먼 보기(연·수능까지)는 읽지 않는다.
// FIX55C1 (HUNT53 HL1): 날이 바뀐 뒤 아직 그리기 전이어도 그릴 때와 같은 날짜(followPlanToday 규칙)로 읽는다. st는 바꾸지 않는다.
export function eventQuery(st,nowIso){
  const today=kstDate(nowIso),gone=followKeys(st,today),at=k=>gone.includes(k)?null:st[k];
  if(st.view==='DAY')return {mode:'TODAY',date:at('date')??today};
  if(st.view==='WEEK')return {mode:'7_DAY',date:at('monday')??mondayOf(today)};
  if(st.view==='MONTH')return {mode:'MONTH',date:(at('month')??today.slice(0,7))+'-01'};
  return null;
}
// from~to 안의 시험과 일정을 날짜 순서로(같은 날은 시험 먼저, 그다음 종일, 시각 순).
export function scheduleItems(exams,events,from,to,today){
  const out=[];
  for(const x of exams?.items??[])if(x.date>=from&&x.date<=to){const d=dDay(today,x.date);out.push({date:x.date,time:'',title:examDisplayName(x).replace(/\(.*\)/,'')+(examStatusOf(x)==='잠정'?' (잠정)':''),note:d<0?'끝':d===0?'D-DAY':'D-'+d,exam:x,event:null});}
  for(const e of events??[])if(e.date>=from&&e.date<=to)out.push({date:e.date,time:e.time??'',title:e.title,note:null,exam:null,event:e});
  return out.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:Number(!a.exam)-Number(!b.exam)||(a.time<b.time?-1:a.time>b.time?1:0));
}
// ctx.planCal이 없으면(옛 경로) 그리지 않는다. 비어 있으면 "+ 일정" 하나만(빈칸을 0이나 안내 글로 채우지 않는다). limit이 있으면 그 수까지 보이고 나머지는 "더 보기".
export function scheduleBox(h,ctx,st,data,from,to,{addDate=null,limit=0,withDate=true,before=null}={}){
  const cal=ctx.planCal??null;if(!cal)return null;
  const {el,add,button}=h,items=scheduleItems(data.exams,cal.events,from,to,data.today),show=limit&&st.schedAll!==from?items.slice(0,limit):items;
  // R37: 달력이 계획 탭으로 합쳐졌으므로 바깥 일정(.ics, P1E)도 앱이 넘겨 준 cal.outer로 여기 흐리게 겹친다. 보기만 한다.
  const outer=[];if(cal.outer)for(let d=from;d<=to;d=shiftDay(d,1))for(const o of cal.outer.on(d))outer.push({date:d,o});
  const outerShow=limit&&st.schedAll!==from?outer.slice(0,limit):outer;
  const out=el('div',null,'plan-sched'),head=el('div',null,'plan-sched-head');
  if(items.length||outer.length)add(head,el('h3','일정'));
  if(addDate)add(head,button('+ 일정',()=>{before?.();cal.add(addDate);},'secondary plan-sched-add'));
  add(out,head);
  if(cal.failed)add(out,el('p','일정을 불러오지 못했습니다 · 시험 일정만 보입니다.','muted small plan-sched-failed'));
  for(const x of show){
    const when=[withDate?dateLabel(x.date):null,x.exam?null:(x.event?eventTimeText(x.event):x.time)||'종일'].filter(Boolean).join(' ');   // V12A-3: 끝 시각이 있으면 "15:45~23:00"
    const row=x.event?button(null,()=>{before?.();cal.open(x.event);},'plan-sched-row'):el('div',null,'plan-sched-row exam');
    row.dataset.date=x.date;if(x.event){row.dataset.kind=x.event.kind;row.dataset.color=eventColorOf(x.event);}
    const own=x.event?splitEventNotes(x.event.notes).kind:'';   // V8W1-5: 직접 쓴 일정 종류
    add(out,add(row,x.event?evStrip(el,x.event):null,when?el('span',when,'plan-sched-when'):null,el('span',x.title,'plan-sched-title'),own?el('span',own,'plan-sched-kind'):null,x.note?el('strong',x.note,'plan-sched-note'):null));
  }
  if(outerShow.length){const list=el('div',null,'ics-outer-list plan-sched-outer');for(const x of outerShow)add(list,el('span',withDate?dateLabel(x.date):null,'muted small'),cal.outer.chip(x.o));add(out,list);}
  const rest=items.length-show.length+outer.length-outerShow.length;
  if(rest>0){const more=button('일정 '+rest+'개 더 보기',()=>{st.schedAll=from;void ctx.rerender();},'secondary plan-sched-more');more.dataset.navOnly='1';add(out,more);}
  return out;
}
// V12C-2 (소유자 2026-11-16 "월간: 일정 보기 / 계획 보기 / 모두 · 날짜를 누르면 달력 아래에 그날 세부"): 탭 = 월 달력 칸에 무엇을 그릴지(화면 상태 st.monthShow, 기록·기기 저장 0).
export const MONTH_SHOW=Object.freeze([['EVENT','일정 보기'],['PLAN','계획 보기'],['ALL','모두']]);
export const monthShowOf=st=>MONTH_SHOW.some(([k])=>k===st?.monthShow)?st.monthShow:'ALL';
// 일정 색 = A4 일정 색(eventColorOf: 메모 [일정] 줄의 고른 색 → 종류 기본색, 아래 V12A 절). 돈의 파랑·빨강은 쓰지 않는다.
// 일정 표지 = 동그라미(계획 = 네모 색 띠와 모양으로도 구별). h = {svg}.
export function eventMark(h,e,cls='pc-ev-dot'){
  // V12_MERGE: 오늘 탭 펼친 달 점과 같은 클래스(hc-ev-dot ev-c-KEY, 47절 fill:var(--ev)) → 계획 월간의 일정 색 = 오늘 달력의 일정 색. 바깥 .ics 일정(e 없음)은 OUTER(흐린 회색).
  const own=splitEventNotes(e?.notes).kind,s=h.svg('svg',{class:cls+'-svg',viewBox:'0 0 8 8',width:8,height:8,'aria-hidden':'true',focusable:'false'}),c=h.svg('circle',{class:'hc-ev-dot '+(e?'ev-c-'+eventColorOf(e)+' ':'')+cls,cx:4,cy:4,r:3.5});
  c.setAttribute('data-kind',e?String(e.kind??'OUTER'):'OUTER');if(own)c.setAttribute('data-own',EVENT_KIND_PRESETS.includes(own)?own:EVENT_KIND_CUSTOM);
  s.append(c);return s;
}
// 고른 날 세부(계획 달력 아래). show = MONTH_SHOW 값(일정만 · 계획만 · 모두). 일정 줄을 누르면 앱 일정 시트, "고치기" = 그날 계획 편집 시트, "+ 일정" = 앱 일정 시트. 그리기는 쓰기 0.
function monthDayDetail(h,ctx,st,data,date,show='ALL'){
  const {el,add,button}=h,{life,study,today,exams,subjects}=data,cal=ctx.planCal??null,locked=Boolean(ctx.freshBefore?.(date));
  const box=el('section',null,'pc-detail');box.dataset.date=date;box.dataset.show=show;box.setAttribute('aria-label',dateLabel(date)+' 세부');
  const head=add(el('div',null,'pc-detail-head'),el('h3',dateLabel(date)+(date===today?' · 오늘':''),'pc-detail-title'));
  if(!locked&&show!=='EVENT'){const b=button('고치기',()=>openPlanEditor(ctx,st,date),'secondary pc-detail-edit');b.setAttribute('aria-label',dateLabel(date)+' 계획 고치기');head.append(b);}
  add(box,head);
  if(show!=='PLAN'){
    for(const x of (exams?.items??[]).filter(x=>x.date===date))add(box,el('p','★'+examDisplayName(x).replace(/\(.*\)/,'')+' 시험일'+(examStatusOf(x)==='잠정'?' (잠정)':''),'notice pc-detail-exam'));
    const evs=homeDayEvents(cal?.events,cal?.outer?.on?.(date)??[],date),g=add(el('div',null,'pc-detail-group pc-detail-events'),el('h4',evs.length?'일정 '+evs.length+'개':'일정 없음','hc-sub'));
    if(cal?.failed)add(g,el('p','일정을 불러오지 못했습니다 · 시험 일정만 보입니다.','muted small plan-sched-failed'));
    for(const x of evs){
      if(x.event){const own=splitEventNotes(x.event.notes).kind,r=button(null,()=>cal.open(x.event),'plan-sched-row pc-ev-row');r.dataset.date=date;r.dataset.kind=x.event.kind;add(g,add(r,eventMark(h,x.event),el('span',eventTimeText(x.event)||x.time||'종일','plan-sched-when'),el('span',x.title,'plan-sched-title'),own?el('span',own,'plan-sched-kind'):null));}
      else{const chip=cal.outer.chip(x.outer);chip.textContent=x.title;add(g,add(el('div',null,'hc-outer-row'),el('span',x.time||'종일','plan-sched-when'),chip));}
    }
    if(cal?.add&&!locked)add(g,button('+ 일정',()=>cal.add(date),'secondary pc-detail-add'));
    add(box,g);
  }
  if(show!=='EVENT'){
    const plans=homeDayPlans(life,study,date,today,{storage:ctx.storage??null,draft:studyDraftOf(ctx,today)}),g=add(el('div',null,'pc-detail-group pc-detail-plans'),el('h4',plans.head??'계획 없음','hc-sub'));
    for(const r of plans.rows){const row=add(el('div',null,'plan-row hc-plan-row'),tag(h,subjects,r.subjectId),el('span',BLOCK_TEXT[r.block],'hc-block'),el('span',r.showTitle?r.title:'','plan-title'),el('span',r.text,'plan-status '+r.kind));row.dataset.itemId=r.id;g.append(row);}
    add(box,g);
  }
  if(locked)add(box,el('p',ctx.freshText?.lock??'새 시작 전 기록이라 읽기만 할 수 있어','notice fresh-lock-note'));
  return box;
}
function openDaySheet(ctx,st,data,date){
  const doc=ctx.document??globalThis.document,h=maker(doc),{life,ach,exams,subjects}=data,sum=daySummary(life,ach,date),body=h.el('div',null,'plan-daysheet');
  const ex=exams.items.filter(x=>x.date===date);
  for(const x of ex)h.add(body,h.el('p',examDisplayName(x)+' 시험일'+(examStatusOf(x)==='잠정'?' (잠정)':''),'notice'));
  h.add(body,h.el('p','실제 벽돌 '+barsText(sum.actual.total)+(sum.actual.card?' · 오늘 카드 쌓음':'')+' · 계획 '+barsText(sum.planned)+(sum.rate!==null?' · 달성 '+rateText(sum.rate):''),'plan-sum'));
  for(const r of sum.rows)h.add(body,h.add(h.el('div',null,'plan-compare-row'),tag(h,subjects,r.subjectId),h.el('span','계획 '+barsText(r.planned)+' · 실제 '+barsText(r.actual),'muted small'),h.el('strong',rateText(r.rate))));
  if(!sum.rows.length)h.add(body,h.el('p','이 날은 쌓은 벽돌도 계획도 없습니다.','muted small'));
  for(const x of sum.items)h.add(body,h.add(h.el('div',null,'plan-row'),tag(h,subjects,x.subjectId),h.el('span',BLOCK_TEXT[x.block]+' · '+x.title+' · '+barsText(x.bricks),'plan-title')));
  let dlg=null;
  // P1C: 그 날 일정(시험은 위 문장에 이미 있어 뺀다)과 "+ 일정". 시트를 닫고 앱의 일정 시트를 연다.
  h.add(body,scheduleBox(h,ctx,st,{...data,exams:null},date,date,{addDate:date,withDate:false,before:()=>dlg?.close?.()}));
  // V7D2: 새 시작 전 날짜는 "이 날 계획 편집" 대신 읽기 전용 한 줄. 아니면 "이 날 비우기"(값 있는 기록만, 가계부 없음)도 함께.
  if(ctx.freshBefore?.(date))h.add(body,h.el('p',ctx.freshText?.lock??'새 시작 전 기록이라 읽기만 할 수 있어','notice fresh-lock-note'));
  else h.add(body,h.add(h.el('div',null,'button-row'),h.button('이 날 계획 편집',()=>{dlg?.close?.();openPlanEditor(ctx,st,date);},'primary'),ctx.clearDay?.(date,{before:()=>dlg?.close?.()})??null));
  dlg=ctx.sheet?.(dateLabel(date),body)??null;
  return body;
}

// ----- CAL2: 오늘 탭 맨 위 달력 (이번 주 띠 · 고른 날 계획·일정 · 달력 펼치기) -----
// 읽기만 한다: 계획 줄(life.plans), 줄 달성(linkPlan = 오늘 카드·주 격자와 같은 규칙), 앱이 읽어 준 일정(ctx.homeCal.read = /api/calendar-view 결과, 읽는 중이면 null), 바깥 .ics(ctx.homeCal.outer).
// 이 기기에 적는 것은 달력 펼침 여부(lb.home.cal '1'/'0', 화면 설정) 하나. "계획 추가"는 계획 편집 시트(openPlanEditor), "일정 추가"는 앱의 일정 시트(ctx.homeCal.add)를 연다(새 쓰기 경로 없음).
// st.date = 고른 날(null = 오늘을 따라감: 자정이 지나면 오늘 칸·목록이 새 날로). ‹ ›는 고른 날을 7일씩 옮기고, "오늘로"는 고른 날·펼친 달을 비운다. st.month = 펼친 달력에서 ◀▶로 옮긴 달(null = 고른 날의 달).
export const HOME_CAL_KEY='lb.home.cal';
export const HOME_CAL_TEXT=Object.freeze({open:'달력 펼치기 ▾',close:'달력 접기 ▴',empty:'이날 계획·일정 없음',addPlan:'계획 추가',addEvent:'일정 추가',toToday:'오늘로',failed:'일정을 불러오지 못했습니다 · 계획만 보입니다.',yearOpen:'연간 달력 열기',yearClose:'닫기',yesterday:'어제 기록'});
// V8W1: st.year = 연간 달력에 보이는 해(null = 닫힘). 화면 상태라 이 기기에도 적지 않는다.
export function createHomeCalState(storage=null){
  let open=false;try{open=storage?.getItem(HOME_CAL_KEY)==='1';}catch{/* 저장소가 막혀 있으면 접힘 */}
  return {date:null,month:null,open,year:null};
}
// V12FIX H-2·M-8: st.nav = 고른 날을 ‹ ›·연간 달력(넘기기)으로 옮긴 것(날짜 칸을 직접 누르지 않음) → 목록만 그 날, 아래 카드는 오늘 카드 그대로(앱 homeDayPicked).
// st.day = 마지막으로 본 오늘. 날이 바뀌면(자정·화면 복귀) 고른 날의 하루 기록을 푼다(nav) → 다음 날 아침에 전 날짜 기록 카드가 남아 보이지 않는다(목록은 고른 날 그대로).
export function homeCalDay(st,nowIso){
  const today=kstDate(nowIso);if(!st||!dateKeyOK(today))return st;
  if(st.day&&st.day!==today&&st.date!==null)st.nav=true;   // 목록은 고른 날 그대로(CAL2-9), 아래 카드만 오늘 카드로
  st.day=today;return st;
}
// V8W1-2: 달력 머리 큰 글씨("11월 14일 토요일")와 진행 띠 2개. n = 오늘이 몇째 날인지(오늘 포함), of = 그 달·그 해의 날 수.
export function homeTodayHead(today){
  const y=Number(today.slice(0,4)),day=Date.UTC(y,Number(today.slice(5,7))-1,Number(today.slice(8,10)));
  return {text:Number(today.slice(5,7))+'월 '+Number(today.slice(8,10))+'일 '+WEEKDAY[sunday0(today)]+'요일',
    month:{label:'이번 달',n:Number(today.slice(8,10)),of:daysInMonth(today.slice(0,7))},
    year:{label:'올해',n:(day-Date.UTC(y,0,1))/864e5+1,of:(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/864e5}};
}
// V8W1-5: 일정 종류 직접 입력. EVENT.kind는 고정 4종 검증 그대로 두고, 직접 쓴 종류는 메모 첫 줄 "[종류] 글자"로 같은 기록에 넣는다(새 필드·검증 변경 0).
export const EVENT_KIND_MAX=20,EVENT_KIND_MARK='[종류] ';
// V12A: 돌려주는 notes(사람이 쓴 메모)에서는 둘째 머리 줄 "[일정] …"(색·끝 시각·반복, splitEventMeta)도 뺀다. 종류 글자 규칙은 그대로.
export function splitEventNotes(notes){
  const m=splitEventMeta(notes);return {kind:m.kind,notes:m.notes};
}
function splitKindLine(notes){
  const s=typeof notes==='string'?notes:'';if(!s.startsWith(EVENT_KIND_MARK))return {kind:'',notes:s};
  const nl=s.indexOf('\n'),kind=s.slice(EVENT_KIND_MARK.length,nl<0?s.length:nl).trim();
  if(!kind||[...kind].length>EVENT_KIND_MAX)return {kind:'',notes:s};
  return {kind,notes:nl<0?'':s.slice(nl+1)};
}
// 빈 종류 = 메모 그대로. 20자를 넘으면 null(저장하지 않는다).
export function joinEventNotes(kind,notes){
  const k=String(kind??'').replace(/\s+/g,' ').trim(),n=String(notes??'');
  if(!k)return n;if([...k].length>EVENT_KIND_MAX)return null;
  return EVENT_KIND_MARK+k+(n?'\n'+n:'');
}
// 주 머리 글자(CAL1C 7일 제목과 같은 규칙): 같은 해·달이면 앞만 연·월, 달·해가 넘어가면 뒤에도.
export function weekRangeText(monday){
  const end=shiftDay(monday,6),[fy,fm,fd]=monday.split('-').map(Number),[ty,tm,td]=end.split('-').map(Number);
  return fy+'년 '+fm+'월 '+fd+'일 – '+(fy!==ty?ty+'년 ':'')+(fy!==ty||fm!==tm?tm+'월 ':'')+td+'일';
}
// 띠 7칸(월~일). plans = 그날 계획 줄 수, events = 이 기기 일정 + 바깥 일정 수. 날짜 범위(0000-01-01 ~ 9999-12-31) 밖 칸은 date null.
export function homeWeek(life,events,outer,monday,today,selected){
  return Array.from({length:7},(_,k)=>{
    const date=shiftDay(monday,k);if(!dateKeyOK(date))return {date:null};
    const dow=sunday0(date);
    return {date,dow,wd:WEEKDAY[dow],day:Number(date.slice(8,10)),plans:planOf(life,date)?.items?.length??0,events:(events??[]).filter(e=>e.date===date).length+(outer?.on(date)?.length??0),isToday:date===today,past:date<today,selected:date===selected};
  });
}
// 칸 아래 점(최대 3개, 계획 = 금 · 일정 = 회색, 둘 다 있으면 둘 다 한 개 이상) + 합이 3보다 많으면 숫자.
export function homeDots(plans,events){
  const p=events>0?Math.min(plans,2):Math.min(plans,3),e=Math.min(events,3-p);
  return {kinds:[...Array(p).fill('plan'),...Array(e).fill('event')],count:plans+events>3?plans+events:null};
}
// 고른 날의 일정 줄: 종일(시각 없음)이 위, 그다음 시각 순, 같은 시각이면 이 기기 일정 먼저, 그다음 들어온 순서.
export function homeDayEvents(events,outerItems,date){
  const rows=[];
  for(const e of events??[])if(e.date===date)rows.push({time:!e.allDay&&e.time?e.time:'',title:e.title,event:e,outer:null});
  for(const o of outerItems??[])rows.push({time:o.time||'',title:o.title,event:null,outer:o});
  return rows.map((r,i)=>({...r,i})).sort((a,b)=>Number(Boolean(a.time))-Number(Boolean(b.time))||(a.time<b.time?-1:a.time>b.time?1:0)||Number(!a.event)-Number(!b.event)||a.i-b.i).map(({i,...r})=>r);
}
// ----- V10B (통제탑 2026-11-15, 소유자 r79 사용 불편): 펼친 달 칸 일정 미리보기 · 일정 종류 칩 · 금빛 농도 -----
// 1) 펼친 달 칸: 그날 일정(homeDayEvents 순서 = 종일 위·시각 순) 최대 2줄 "09:00 제목"(한 줄 말줄임은 CSS) + 넘치면 "+n". 접은 폭(CSS 700px 이하)은 글자 대신 종류 색 점(최대 3)만.
//    칸 단추의 aria-label이 이미 "일정 n개"를 읽으므로 미리보기는 그림(aria-hidden). 누르면 지금처럼 아래 목록이 그날로 바뀐다(o.pick).
export const HOME_CELL_LINES=2,HOME_CELL_DOTS=3;
function homeCellEvents(h,cell,date,cal){
  const rows=homeDayEvents(cal?.events,cal?.outer?.on?.(date)??[],date);if(!rows.length)return;
  const {el,add,svg}=h,box=el('span',null,'hc-ev'),kind=r=>r.event?String(r.event.kind):'OUTER';box.setAttribute('aria-hidden','true');
  // V12A-4: 줄 앞 색 띠·점 = 일정 색(eventColorOf: 고른 색 → 종류 기본색, class ev-c-KEY). 바깥 .ics 줄은 회색.
  const colorOf=r=>r.event?eventColorOf(r.event):OUTER_COLOR;   // V13 L-A13: 바깥 .ics 줄은 직접 입력 기본색(회색)과 다른 OUTER(옅은 회색 점선·빈 점)
  for(const r of rows.slice(0,HOME_CELL_LINES)){const line=add(el('span',null,'hc-ev-line ev-c-'+colorOf(r)),r.time?el('span',r.time,'hc-ev-time'):null,el('span',r.title,'hc-ev-title'));line.dataset.kind=kind(r);line.dataset.color=colorOf(r);box.append(line);}
  if(rows.length>HOME_CELL_LINES)box.append(el('span','+'+(rows.length-HOME_CELL_LINES),'hc-ev-more'));
  // V11B L-07: 점 색 = 자주 쓰는 종류(시험·수업 …)·직접 입력도 따로(data-own, 전에는 모두 약속 색) · 3개를 넘으면 접은 폭에서 점 옆에 전체 개수.
  const k=Math.min(rows.length,HOME_CELL_DOTS),dots=svg('svg',{class:'hc-ev-dots',viewBox:'0 0 '+(k*8-2)+' 6',width:k*8-2,height:6});
  const ownOf=r=>{const o=r.event?splitEventNotes(r.event.notes).kind:'';return o?(EVENT_KIND_PRESETS.includes(o)?o:EVENT_KIND_CUSTOM):'';};
  rows.slice(0,k).forEach((r,i)=>{const own=ownOf(r),c=svg('circle',{class:'hc-ev-dot ev-c-'+colorOf(r),'data-kind':kind(r),'data-color':colorOf(r),cx:3+i*8,cy:3,r:3});if(own)c.setAttribute('data-own',own);dots.append(c);});
  add(box,dots,rows.length>HOME_CELL_DOTS?el('span',String(rows.length),'hc-ev-n'):null);cell.append(box);
}
// 5) 금빛 농도: 오늘 집중 시간(담은 세션 분, 오늘 카드·벽돌과 같은 기준) → 0~4단계. 0 = 1시간 미만(금기 거의 없는 아이보리) · 1 = 1h · 2 = 3h · 3 = 5h · 4 = 8h 이상.
//    앱이 화면 뿌리(<html data-gold>)에 적고 CSS가 바탕·머리띠 농도를 바꾼다. 펼친 달의 지난 날 칸도 그날 분으로 같은 단계(data-gold, 0이면 적지 않음 = 회색 빗금 그대로).
export const GOLD_STEPS=Object.freeze([60,180,300,480]);
export const goldLevel=min=>Number.isFinite(min)&&min>0?GOLD_STEPS.filter(s=>min>=s).length:0;
export const dayFocusMinutes=(study,date,draft=null)=>daySessions(study,date,draft).reduce((s,x)=>s+x.minutes,0);
function homeCellGold(cell,study,date){const lv=goldLevel(dayFocusMinutes(study,date));if(lv)cell.dataset.gold=String(lv);}
// 3) 일정 종류 칩(앱 일정 시트가 그린다): 기본 4종(EVENT.kind 그대로) + 자주 쓰는 종류 6개 + 맨 끝 "직접 입력". 자주 쓰는 종류는 V8W1 직접 입력과 같은 자리(메모 첫 줄 "[종류] 시험", kind = 약속)에 저장한다(기록 구조·검증 변경 0).
export const EVENT_KIND_BASE=Object.freeze([['DEADLINE','기한'],['APPOINTMENT','약속'],['REVIEW','검토'],['MILESTONE','중간 목표']]);   // 앱 LABEL과 같은 이름
export const EVENT_KIND_PRESETS=Object.freeze(['시험','수업','병원','근무','기념일','기타']),EVENT_KIND_CUSTOM='직접 입력';
// 저장된 일정 → 칩 상태 {sel, custom, base}. sel = 기본 4종 값 · 자주 쓰는 종류 글자 · '직접 입력', custom = 직접 쓴 글자,
// base = 자주 쓰는/직접 쓴 종류를 저장할 때의 EVENT.kind(옛 기록이 이미 종류 글자를 가졌으면 그 kind 그대로, 아니면 약속).
export function eventKindPick(kind,notes){
  const own=splitEventNotes(notes).kind,preset=EVENT_KIND_PRESETS.includes(own);
  return {sel:own?(preset?own:EVENT_KIND_CUSTOM):kind,custom:own&&!preset?own:'',base:own?kind:'APPOINTMENT'};
}
// 칩 상태 → 저장 값 {kind, own}(own = 메모 첫 줄 "[종류] …"에 넣을 글자, 없으면 ''). 직접 입력이 비었으면 종류 글자 없이 base.
export function eventKindSave({sel,custom,base}){
  if(sel===EVENT_KIND_CUSTOM)return {kind:base,own:String(custom??'')};
  if(EVENT_KIND_PRESETS.includes(sel))return {kind:base,own:sel};
  return {kind:sel,own:''};
}
// ----- V12A (통제탑 2026-11-16, 소유자 실사용 V12 A3·A4): 반복 일정 · 일정 색 · 끝 시각 -----
// 저장 자리(새 entity type·새 칸·검증 변경 0): EVENT 기록 1건의 메모 머리 줄. 첫 줄 "[종류] 근무"(V8W1, 있으면) 다음 줄
//   "[일정] 색 청록 · 끝 23:00 · 매주 토·일 · ~2027-03-01 · 빼기 2026-11-22,2026-11-29"(칸마다 선택·순서 고정, 모르는 칸이 하나라도 있으면 그 줄은 메모 글로 본다).
// 새 반복은 recurrence:null + 이 줄. 옛 recurrence(일/주 단위 · 2~52회)는 그대로 읽고, 편집 시트에서는 "기존 반복 그대로"로 남긴다.
// r81 앱: 검증(shape·kind 4종·메모 2000자)을 그대로 통과 → 받기·동기화 정상. 반복은 첫 날 1번만 보이고 메모 칸에 이 줄이 글자로 보인다(거절·깨짐 없음). r81에서 다시 저장해도 메모 그대로라 규칙이 남는다.
export const EVENT_META_MARK='[일정] ',EVENT_SKIP_MAX=100,EVENT_SPAN_MAX=4000;
// 8색: 돈의 파랑(지출·손실)·빨강(수익)·공부의 금과 헷갈리지 않는 색(V7C 금지 띠 밖). key = 화면 class(ev-c-KEY), name = 저장 글자, hex = 위젯 내보내기 color 칸.
export const EVENT_COLORS=Object.freeze([['GREEN','초록','#2E9E5B'],['TEAL','청록','#13938C'],['LIME','연두','#6FA82A'],['PURPLE','보라','#8457E0'],['PLUM','자주','#AE4FC0'],['PINK','분홍','#DD5A92'],['ORANGE','주황','#EA7F2C'],['GRAY','회색','#77808F']].map(([key,name,hex])=>Object.freeze({key,name,hex})));
// 종류별 기본색(색을 고르지 않은 일정). 직접 쓴 종류 = 회색.
// V13B L-A13: 약속 기본색 보라(#8457E0) → 자주(PLUM #AE4FC0). 보라는 저녁 시간대 색(#6C5CE7)과 ΔE76 7.5로 헷갈렸다. 자주는 저녁 29.0·돈 파랑 52.9 이상·돈 빨강 73.7.
// 색을 직접 고른 일정("[일정] 색 보라")은 그대로 보라다(기본색만 바뀜). 보라는 팔레트에 그대로 있다.
export const EVENT_KIND_COLOR=Object.freeze({DEADLINE:'ORANGE',APPOINTMENT:'PLUM',REVIEW:'LIME',MILESTONE:'PLUM','시험':'ORANGE','수업':'GREEN','병원':'PINK','근무':'TEAL','기념일':'PLUM','기타':'GRAY'});
export const REPEAT_CHOICES=Object.freeze([['NONE','없음'],['WEEKLY','매주'],['DAILY','매일'],['MONTHLY','매월 같은 날']]);
export const REPEAT_WEEKDAYS=Object.freeze([1,2,3,4,5,6,0]);   // 화면·저장 순서(월~일), 값 = 0(일)~6(토)
const colorByName=new Map(EVENT_COLORS.map(c=>[c.name,c])),colorByKey=new Map(EVENT_COLORS.map(c=>[c.key,c]));
const HM_RE=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
// "[일정] …" 한 줄 → {color,end,repeat:{freq,days,until,skip}|null}. 틀리면 null(그 줄은 메모 글).
// V13 L-A12: 아는 칸이 하나 이상이면 모르는 칸(다음 판이 더할 칸)은 건너뛰고 extra에 그대로 둔다 → eventMetaLine이 뒤에 다시 붙여 보존(이 기기에서 고쳐 써도 반복이 사라지지 않는다). 아는 칸이 0개면 예전처럼 메모 글.
export function parseEventMetaLine(line){
  if(typeof line!=='string')return null;
  const out={color:null,end:null,repeat:null},seen=new Set(),extra=[];let until=null,skip=null;
  for(const t of line.split(' · ')){
    const key=t.startsWith('색 ')?'c':t.startsWith('끝 ')?'e':t==='매일'||t==='매월'||t.startsWith('매주 ')?'r':t.startsWith('~')?'u':t.startsWith('빼기 ')?'s':null;
    if(!key){if(!t.trim())return null;extra.push(t);continue;}
    if(seen.has(key))return null;seen.add(key);
    if(key==='c'){const c=colorByName.get(t.slice(2));if(!c)return null;out.color=c.key;}
    else if(key==='e'){const v=t.slice(2);if(!HM_RE.test(v))return null;out.end=v;}
    else if(key==='r'){
      if(t==='매일')out.repeat={freq:'DAILY',days:[]};else if(t==='매월')out.repeat={freq:'MONTHLY',days:[]};
      else{const days=t.slice(3).split('·').map(n=>WEEKDAY.indexOf(n));if(days.some(x=>x<0)||new Set(days).size!==days.length)return null;out.repeat={freq:'WEEKLY',days:REPEAT_WEEKDAYS.filter(x=>days.includes(x))};}
    }else if(key==='u'){until=t.slice(1);if(!dateKeyOK(until))return null;}
    else{skip=t.slice(3).split(',');if(skip.length>EVENT_SKIP_MAX||skip.some(x=>!dateKeyOK(x))||new Set(skip).size!==skip.length)return null;}
  }
  if((until||skip)&&!out.repeat)return null;
  if(!seen.size)return null;
  if(out.repeat)out.repeat={...out.repeat,until,skip:skip?[...skip].sort():[]};
  if(extra.length)out.extra=extra;
  return out;
}
export function eventMetaLine(meta){
  const parts=[],c=colorByKey.get(meta?.color),r=meta?.repeat;
  if(c)parts.push('색 '+c.name);
  if(HM_RE.test(meta?.end??''))parts.push('끝 '+meta.end);
  if(r?.freq){
    parts.push(r.freq==='DAILY'?'매일':r.freq==='MONTHLY'?'매월':'매주 '+REPEAT_WEEKDAYS.filter(x=>r.days.includes(x)).map(x=>WEEKDAY[x]).join('·'));
    if(r.until)parts.push('~'+r.until);
    if(r.skip?.length)parts.push('빼기 '+[...new Set(r.skip)].sort().join(','));
  }
  if(parts.length&&Array.isArray(meta?.extra))for(const t of meta.extra)if(typeof t==='string'&&t.trim()&&!t.includes('\n')&&!t.includes(' · '))parts.push(t);   // V13 L-A12: 모르는 칸 보존(아는 칸이 있을 때만)
  return parts.join(' · ');
}
// V13 L-A6·L-A5: 사람이 쓴 메모(또는 가져온 설명)가 머리 표지 "[종류] "·"[일정] "로 시작하면 앞에 "\"를 하나 붙여 저장하고(다음에 읽을 때 종류·반복으로 바뀌지 않게), 읽을 때 하나 뗀다.
// 이미 "\…[일정] "로 시작하는 글도 "\"를 하나 더 붙여 돌려받을 때 같은 글이 된다. r82 앱은 "\[일정] …"을 메모 글 그대로 보여 준다(뜻 바뀜 0).
const NOTE_MARK_RE=/^\\*\[(?:종류|일정)\] /;
export const escapeEventNote=n=>{const s=String(n??'');return NOTE_MARK_RE.test(s)?'\\'+s:s;};
export const unescapeEventNote=n=>{const s=String(n??'');return s.startsWith('\\')&&NOTE_MARK_RE.test(s)?s.slice(1):s;};
// 메모 → {kind(V8W1 종류 글자), color, end, repeat, notes(사람이 쓴 메모)}. 머리 줄 순서 = [종류] 다음 [일정].
export function splitEventMeta(notes){
  const k=splitKindLine(notes),s=k.notes,none={kind:k.kind,color:null,end:null,repeat:null,notes:unescapeEventNote(s)};
  if(!s.startsWith(EVENT_META_MARK))return none;
  const nl=s.indexOf('\n'),m=parseEventMetaLine(s.slice(EVENT_META_MARK.length,nl<0?s.length:nl));
  return m?{kind:k.kind,...m,notes:nl<0?'':unescapeEventNote(s.slice(nl+1))}:none;
}
// 거꾸로: 종류 글자 + 메타 + 메모 → 메모 칸 글자. 종류가 20자를 넘으면 null(저장하지 않는다, joinEventNotes 규칙).
export function joinEventMeta(kind,meta,notes){
  const line=eventMetaLine(meta),n=escapeEventNote(notes);
  return joinEventNotes(kind,line?EVENT_META_MARK+line+(n?'\n'+n:''):n);
}
// 일정(EVENT data 또는 달력 줄 {kind,notes})의 색 key: 고른 색 → 종류 기본색(자주 쓰는 종류·기본 4종) → 회색.
export function eventColorOf(e){
  const m=splitEventMeta(e?.notes);if(m.color)return m.color;
  if(m.kind)return EVENT_KIND_COLOR[m.kind]??'GRAY';
  return EVENT_KIND_COLOR[e?.kind]??'GRAY';
}
export const eventColorHex=key=>(colorByKey.get(key)??colorByKey.get('GRAY')).hex;
// V13 L-A13: 이 기기 일정의 8색과 겹치지 않는 바깥(.ics) 표시 key. 저장·위젯 color에는 쓰지 않는다(화면 class ev-c-OUTER만).
export const OUTER_COLOR='OUTER';
// 시각 글자: "15:45~23:00" · "15:45" · ''(종일).
// V13 L-A9: 끝이 시작보다 이르면 자정을 넘는 일정 = "15:45~01:00(다음 날)". 다음 날 칸에 이어서 보이는 줄(달력 계산이 만드는 cont 줄) = "~01:00(전날부터)".
export const NEXT_DAY_TEXT='(다음 날)',FROM_PREV_TEXT='(전날부터)';
export function eventTimeText(e){
  if(e?.cont&&HM_RE.test(e.contEnd??''))return '~'+e.contEnd+FROM_PREV_TEXT;
  const t=!e?.allDay&&HM_RE.test(e?.time??'')?e.time:'';if(!t)return '';
  const end=splitEventMeta(e.notes).end;return end?t+'~'+end+(end<t?NEXT_DAY_TEXT:''):t;
}
// 자정을 넘는 일정의 끝 시각(다음 날 몇 시까지). 아니면 null.
export function eventOvernightEnd(d){
  if(!d||d.allDay||!HM_RE.test(d.time??''))return null;
  const end=splitEventMeta(d.notes).end;return end&&end<d.time?end:null;
}
// V13 M-4: 요일 줄 끝 "주말" 한 번에 고르기.
export const WEEKEND_TEXT='주말(토·일)',WEEKEND_DAYS=Object.freeze([6,0]);
export const isWeekendDays=days=>Array.isArray(days)&&days.length===2&&days.includes(6)&&days.includes(0);
// V13 L-A8: 매월 반복을 29·30·31일에 시작하면 그 날이 없는 달은 건너뛴다(말일로 옮기지 않음 · 회차 규칙 그대로) → 시트·반복 글자에 안내.
export function monthlyNote(date){
  if(!dateKeyOK(date))return '';const d=Number(date.slice(8,10));
  return d>=29?'매월 '+d+'일 · '+d+'일이 없는 달('+(d===31?'2·4·6·9·11월':d===30?'2월':'평년 2월')+')은 건너뛰어요':'';
}
// 옛 recurrence 중 새 규칙으로 옮길 수 있는 것(간격 1): 매일·매주(시작 요일) + 끝나는 날 = 마지막 회차. 간격 2 이상은 null(그대로 둔다).
export function legacyRepeat(d){
  const r=d?.recurrence;if(!r||r.interval!==1||!dateKeyOK(d.date))return null;
  const weekly=r.frequency==='WEEKLY';
  return {freq:weekly?'WEEKLY':'DAILY',days:weekly?[sunday0(d.date)]:[],until:shiftDay(d.date,(r.count-1)*(weekly?7:1)),skip:[]};
}
export const eventRepeatOf=d=>splitEventMeta(d?.notes).repeat;
// 그 일정이 from~to(양끝 포함)에 나오는 날 [{date,i}](날짜 순). i = 회차 번호: 옛 반복 = 0부터 세는 회차(예전 그대로), 새 반복 = 시작일부터 날 수(같은 날 = 같은 번호라 위젯·ics 키가 안 흔들린다).
// 새 반복: 시작일부터 · 끝나는 날까지 · 뺀 날 빼고 · 매일 / 매주 고른 요일 / 매월 시작일과 같은 날(그 날이 없는 달은 건너뜀). 한 번에 최대 EVENT_SPAN_MAX일만 본다. 새 줄이 없으면 옛 recurrence 그대로.
export function eventDates(d,from,to){
  if(!d||!dateKeyOK(d.date)||!dateKeyOK(from)||!dateKeyOK(to)||from>to)return [];
  const rp=eventRepeatOf(d),out=[];
  if(!rp){
    const r=d.recurrence,count=r?r.count:1,step=r?r.interval*(r.frequency==='WEEKLY'?7:1):0;
    for(let i=0;i<count;i++){const date=shiftDay(d.date,i*step);if(date>to)break;if(date>=from)out.push({date,i});}
    return out;
  }
  const start=d.date,lo=from>start?from:start,hi=rp.until&&rp.until<to?rp.until:to,skip=new Set(rp.skip),dom=start.slice(8),day0=dayNumber(start);
  for(let date=lo,k=0;date<=hi&&k<EVENT_SPAN_MAX;date=shiftDay(date,1),k++){
    if(skip.has(date)||rp.freq==='WEEKLY'&&!rp.days.includes(sunday0(date))||rp.freq==='MONTHLY'&&date.slice(8)!==dom)continue;
    out.push({date,i:dayNumber(date)-day0});
  }
  return out;
}
// V12FIX M-1: 바깥으로 나가는 .ics·Fold 달력 거울이 앱 달력과 같은 회차를 쓴다(부르는 쪽이 occur로 넘김). [{date,i,end}] end = 끝 시각(없으면 null, 시작보다 이르면 다음 날 끝).
export function eventSpan(d,from,to){const end=splitEventMeta(d?.notes).end;return eventDates(d,from,to).map(o=>({...o,end}));}
// V12FIX M-4: 새 반복의 시작일 = 첫 회차(매주에서 시작일 요일을 고르지 않았으면 그 뒤 첫 고른 요일). 회차가 없으면 null(끝나는 날이 첫 회차보다 이름).
export function repeatStart(date,repeat){
  if(!dateKeyOK(date)||!repeat?.freq)return dateKeyOK(date)?date:null;
  const line=eventMetaLine({repeat:{...repeat,skip:[]}}),to=shiftDay(date,repeat.freq==='MONTHLY'?0:6);
  return eventDates({date,notes:EVENT_META_MARK+line},date,dateKeyOK(to)?to:date)[0]?.date??null;
}
// 반복 일정 한 회차 지우기·이후 모두 지우기 = 기록 1건 고쳐 쓰기(삭제 표시 아님, 이전 값은 이력). 새 줄이 없으면 옛 반복(간격 1)을 새 규칙으로 옮겨서. 못 하면 null,
// 메모가 2000자를 넘으면 {tooLong:true}(앱이 EVENT_NOTES_TOO_LONG 문구).
function withRepeat(d,repeat){
  const m=splitEventMeta(d.notes),notes=joinEventMeta(m.kind,{color:m.color,end:m.end,repeat,extra:m.extra},m.notes);
  if(notes===null||[...notes].length>2000)return {tooLong:true};
  return {...d,recurrence:null,notes};
}
export const eventRepeats=d=>Boolean(eventRepeatOf(d)??legacyRepeat(d));
export function eventSkipDay(d,date){
  const rp=eventRepeatOf(d)??legacyRepeat(d);if(!rp||!dateKeyOK(date)||date<d.date||rp.until&&date>rp.until||rp.skip.includes(date))return null;
  if(!eventDates(d,date,date).length)return null;   // V12FIX L-A11: 실제 회차인 날만
  if(rp.skip.length>=EVENT_SKIP_MAX)return {tooLong:true,skipFull:true};
  return withRepeat(d,{...rp,skip:[...rp.skip,date].sort()});
}
// 이 날부터 뒤 모두 지우기: 끝나는 날 = 그 전날(뺀 날도 그 안만 남김). 첫 회차 이전이면 null(= 일정 전체 삭제로 간다).
export function eventStopFrom(d,date){
  const rp=eventRepeatOf(d)??legacyRepeat(d);if(!rp||!dateKeyOK(date)||date<=d.date)return null;
  const until=shiftDay(date,-1);
  const next=withRepeat(d,{...rp,until:rp.until&&rp.until<until?rp.until:until,skip:rp.skip.filter(x=>x<=until)});
  if(!next.tooLong&&!eventDates(next,next.date,until).length)return {none:true};   // V12FIX M-2: 남는 회차가 0개면 고쳐 쓰지 않고 일정 전체 삭제로(앱)
  return next;
}
// 일정 줄 맨 앞 색 띠(그림, 읽기 도구는 건너뜀). el = maker의 (태그, 글, 클래스).
export function evStrip(el,e){const s=el('span',null,'ev-strip ev-c-'+eventColorOf(e));s.setAttribute('aria-hidden','true');return s;}
export const repeatText=r=>!r?'':(r.freq==='DAILY'?'매일':r.freq==='MONTHLY'?'매월 같은 날':'매주 '+REPEAT_WEEKDAYS.filter(x=>r.days.includes(x)).map(x=>WEEKDAY[x]).join('·'))+(r.until?' · '+Number(r.until.slice(5,7))+'월 '+Number(r.until.slice(8,10))+'일까지':'');
// 고른 날의 계획 줄(시간대 순): 과목 · 시간대 · 세부내용 · 상태(안 함 · 조각 · 완료 n장, 오지 않은 날은 "계획"). 머리 = "계획 n개 중 m개 달성"(오늘까지) / "계획 n개"(뒤 날).
export function homeDayPlans(life,study,date,today,{storage=null,draft=null}={}){
  const subjects=subjectMap(lifeDefs(life)),items=sortedItems(planOf(life,date)?.items??[]),future=date>today;
  const link=linkPlan(items,daySessions(study,date,todayDraft(draft,date,today)),readPlanMarks(storage,date));
  const rows=items.map(x=>{const r=link.rows.get(x.id),s=subjects.get(x.subjectId)??null;return {id:x.id,subjectId:x.subjectId,name:s?.name??'기타',title:x.title,showTitle:x.title!==(s?.name??''),block:shownBlock(x.block),kind:future?'plan':r.state.toLowerCase(),text:itemStateText(r,future)};});
  return {rows,future,total:link.total,done:link.done,head:!rows.length?null:future?'계획 '+rows.length+'개':'계획 '+link.total+'개 중 '+link.done+'개 달성'};
}
// V8W1-2 진행 띠 한 줄: "이번 달 ▬▬▬ 14/30일 · 16일 남음". 막대 = SVG(지난 날 회색 빗금 · 오늘 한 칸 금 · 남은 날 흰 칸), 너비는 % 속성(인라인 style 없음).
function progRow(h,{label,n,of},key){
  const {el,add,svg}=h,pct=v=>Math.round(v/of*100000)/1000+'%',id='hc-hatch-'+key;
  const bar=svg('svg',{class:'hc-prog-bar',width:'100%',height:10,'aria-hidden':'true'}),pat=svg('pattern',{id,width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});
  pat.append(svg('rect',{class:'hc-hatch-bg',width:6,height:6}),svg('line',{class:'hc-hatch-line',x1:0,y1:0,x2:0,y2:6}));
  // V10B-2 (0절 게이지 규칙): 남은 날 = 오른쪽 끝에 붙은 금 칸(처음엔 꽉 차 있고 왼쪽부터 깎인다), 지난 날 = 빗금 그대로, 오늘 = 금 칸. 글자 "15/30일 · 50%"(지난 몫, 오늘 포함).
  add(bar,add(svg('defs'),pat),n<of?svg('rect',{class:'hc-prog-left',x:pct(n),y:0,width:pct(of-n),height:10}):null,n>1?svg('rect',{class:'hc-prog-past',x:0,y:0,width:pct(n-1),height:10,fill:'url(#'+id+')'}):null,svg('rect',{class:'hc-prog-today',x:pct(n-1),y:0,width:pct(1),height:10}));
  const row=add(el('div',null,'hc-prog hc-prog-'+key),el('span',label,'hc-prog-label'),bar,add(el('span',null,'hc-prog-value'),el('strong',n+'/'+of+'일',null),el('span',' · '+Math.round(n/of*100)+'%','hc-prog-left-text')));
  row.dataset.n=String(n);row.dataset.of=String(of);
  return row;
}
// V8W1-4 연간 달력: 12개 작은 달력(월요일 시작, PC 4×3 · 폰 2×6은 CSS). 지난 달 = 회색 빗금 칸, 이번 달 = 굵은 테, 지난 날 = 회색 빗금, 오늘 = 금 칸 + 굵은 테.
// 달 = 단추 하나(누르면 go(ym)), 날짜 칸은 그림이라 읽기 도구에서 숨기고 달 단추 이름에 지난 달·이번 달을 적는다. 쓰기 0.
function homeYear(h,year,today,go,moveYear,close){
  const {el,add,button}=h,ty=today.slice(0,7),out=el('section',null,'hc-year');out.setAttribute('aria-label',year+'년 연간 달력');
  const prev=button('‹',()=>moveYear(year-1),'secondary hc-step'),next=button('›',()=>moveYear(year+1),'secondary hc-step');prev.setAttribute('aria-label','지난해');next.setAttribute('aria-label','다음 해');
  if(year<=1)prev.disabled=true;if(year>=9999)next.disabled=true;
  add(out,add(el('div',null,'hc-year-nav'),prev,el('strong',year+'년','hc-year-title'),next,button(HOME_CAL_TEXT.yearClose,close,'secondary hc-year-close')));
  const grid=el('div',null,'hc-year-grid');
  for(let m=1;m<=12;m++){
    const ym=String(year).padStart(4,'0')+'-'+String(m).padStart(2,'0'),when=ym<ty?'past':ym===ty?'current':'';
    const b=button(null,()=>go(ym),'hc-ymon'+(when?' '+when:''));b.dataset.ym=ym;b.setAttribute('aria-label',year+'년 '+m+'월'+(when==='past'?' · 지난 달':when==='current'?' · 이번 달':''));
    if(when==='current')b.setAttribute('aria-current','date');
    const days=el('span',null,'hc-ymon-grid');days.setAttribute('aria-hidden','true');
    for(const w of ['월','화','수','목','금','토','일'])days.append(el('span',w,'hc-ywd'+(w==='토'?' sat':w==='일'?' sun':'')));
    const first=ym+'-01',lead=(sunday0(first)+6)%7;
    for(let i=0;i<lead;i++)days.append(el('span',null,'hc-yd blank'));
    for(let d=1,n=daysInMonth(ym);d<=n;d++){const date=ym+'-'+String(d).padStart(2,'0'),wd=sunday0(date);days.append(el('span',String(d),'hc-yd'+(date===today?' today':date<today?' past':'')+(wd===6?' sat':wd===0?' sun':'')));}
    add(grid,add(b,el('span',m+'월','hc-ymon-name'),days));
  }
  return add(out,grid);
}
export function renderHomeCal(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,svg}=h;
  const whole=ctx.getWhole(),life=whole.life??null,study=whole.study??null,today=kstDate(ctx.now()),hc=ctx.homeCal??null,outer=hc?.outer??null,storage=ctx.storage??null;
  homeCalDay(st,ctx.now());
  if(st.date!==null&&(!dateKeyOK(st.date)||st.date===today))st.date=null;
  if(st.date===null)st.nav=false;
  const date=st.date??today,m0=mondayOf(date),monday=dateKeyOK(m0)?m0:date,rerender=()=>void ctx.rerender();
  const pick=d=>{if(!dateKeyOK(d))return;st.date=d===today?null:d;st.month=null;st.nav=false;rerender();};   // 날짜 칸을 직접 누름 = 그날 하루 기록
  const step=d=>{if(!dateKeyOK(d))return;st.date=d===today?null:d;st.month=null;st.nav=true;rerender();};   // V12FIX H-2: 주 넘기기 = 목록만(오늘 카드 그대로)
  const defs=lifeDefs(life),subjects=subjectMap(defs),weekCal=hc?.read?.({mode:'7_DAY',date:monday})??null;
  const out=el('section',null,'panel home-cal');out.id='home-cal';
  // V8W1-2: 맨 위 큰 글씨 "11월 14일 토요일"(언제나 오늘) + 진행 띠 2개(이번 달 · 올해: 지난 날 회색 빗금 · 오늘 금 · 남은 날 흰 칸)
  const th=homeTodayHead(today),big=el('h2',th.text,'hc-big');big.setAttribute('aria-current','date');
  add(out,add(el('div',null,'hc-head'),big,progRow(h,th.month,'m'),progRow(h,th.year,'y')));
  const ymOf=()=>typeof st.month==='string'&&/^\d{4}-\d{2}$/.test(st.month)?st.month:date.slice(0,7),openYear=()=>{st.year=Number(ymOf().slice(0,4));rerender();};
  // V8W1-4: 연간 달력이 열려 있으면 띠·펼친 달 대신 그것을 보인다(아래 고른 날 목록은 그대로).
  if(Number.isInteger(st.year)&&st.year>=1&&st.year<=9999){
    add(out,homeYear(h,st.year,today,ym=>{st.year=null;st.date=ym===today.slice(0,7)?null:ym+'-01';st.month=null;st.nav=true;st.open=true;try{storage?.setItem(HOME_CAL_KEY,'1');}catch{/* 기억 실패는 무시 */}rerender();},y=>{st.year=y;rerender();},()=>{st.year=null;rerender();}));
  }else{
    st.year=null;
    // 머리: ‹ [2026년 11월 9일 – 15일 ▾] › (가운데를 누르면 연간 달력, 오늘이 아니면 "오늘로")
    const range=el('strong',weekRangeText(monday),'hc-range'),rangeBtn=add(button(null,openYear,'secondary hc-range-btn'),range,el('span','▾','hc-range-icon'));rangeBtn.setAttribute('aria-label',weekRangeText(monday)+' · '+HOME_CAL_TEXT.yearOpen);
    const prev=button('‹',()=>step(shiftDay(date,-7)),'secondary hc-step'),next=button('›',()=>step(shiftDay(date,7)),'secondary hc-step');prev.setAttribute('aria-label','지난주');next.setAttribute('aria-label','다음 주');
    // V11B L-35: 오늘 주에는 "오늘로" 단추 대신 같은 폭의 빈 자리(보이지 않는 글자)를 둔다 — ‹·›를 눌러 단추가 생기면 가운데 글자가 좁아져 두 줄이 되고 단추가 밀렸다(360폭 10px).
    const onToday=st.date===null&&st.month===null,slot=onToday?el('span',HOME_CAL_TEXT.toToday,'hc-today hc-today-off'):button(HOME_CAL_TEXT.toToday,()=>{st.date=null;st.month=null;rerender();},'secondary hc-today');
    if(onToday)slot.setAttribute('aria-hidden','true');
    add(out,add(el('div',null,'hc-nav'),prev,rangeBtn,next,slot));
    // 이번 주 띠: 칸 = 요일 · 날짜 숫자 · 점(V8W1: 오늘 = 금 칸 + 굵은 테 + 칸 위 "오늘", 지난 날 = 회색 빗금 칸). 누르면 그 날짜 목록.
    const strip=el('div',null,'hc-week');strip.setAttribute('role','group');strip.setAttribute('aria-label',weekRangeText(monday));
    for(const d of homeWeek(life,weekCal?.events,outer,monday,today,date)){
      if(!d.date){strip.append(el('span',null,'hc-day hc-blank'));continue;}
      const b=button(null,()=>pick(d.date),'hc-day'+(d.isToday?' today':'')+(d.selected?' selected':'')+(d.dow===6?' sat':d.dow===0?' sun':''));
      b.dataset.date=d.date;b.setAttribute('aria-pressed',String(d.selected));b.setAttribute('aria-label',dateLabel(d.date)+(d.isToday?' · 오늘':'')+' · 계획 '+d.plans+'개 · 일정 '+d.events+'개');
      if(d.isToday)b.setAttribute('aria-current','date');else if(d.past)b.setAttribute('data-past','');
      const dots=el('span',null,'hc-dots'),dm=homeDots(d.plans,d.events);dots.setAttribute('aria-hidden','true');
      // V12A-4: 일정 점 = 그 일정 색(이 기기 일정 순서대로, 바깥 .ics는 회색 그대로). 계획 점은 금 그대로.
      const evColors=(weekCal?.events??[]).filter(e=>e.date===d.date).map(eventColorOf);let ei=0;
      if(dm.kinds.length){const s=svg('svg',{class:'hc-dot-row',viewBox:'0 0 '+(dm.kinds.length*8-2)+' 6',width:dm.kinds.length*8-2,height:6});dm.kinds.forEach((k,i)=>{const c=k==='event'?evColors[ei++]??null:null;s.append(svg('circle',{class:'hc-dot '+k+(c?' ev-c-'+c:''),cx:3+i*8,cy:3,r:3}));});dots.append(s);}
      if(dm.count!==null)dots.append(el('span',String(dm.count),'hc-dot-n'));
      add(b,el('span',d.wd,'hc-wd'),el('span',String(d.day),'hc-num'),d.isToday?el('span','오늘','calendar-today-badge'):null,dots);
      strip.append(b);
    }
    const toggle=button(st.open?HOME_CAL_TEXT.close:HOME_CAL_TEXT.open,()=>{st.open=!st.open;try{storage?.setItem(HOME_CAL_KEY,st.open?'1':'0');}catch{/* 기억 실패는 무시 */}rerender();},'secondary hc-toggle');
    toggle.setAttribute('aria-expanded',String(Boolean(st.open)));
    add(out,strip,toggle);
    // 달력 펼치기: 계획 탭 날짜 달력(dateGrid)과 같은 칸·같은 코드, 월요일 시작, 앞뒤 달 흐린 날짜. 칸을 누르면 그 날짜 목록.
    if(st.open){
      const ym=ymOf(),moveMonth=n=>{const m=shiftMonth(ym,n);if(!/^\d{4}-\d{2}$/.test(m))return;st.month=m;rerender();};
      const monthCal=hc?.read?.({mode:'MONTH',date:ym+'-01'})??null,data={life,study,ach:achieve({life,study,today}),today,exams:defs.exams,subjects};
      // 달 머리 "2026년 11월"은 누르면 연간 달력(V8W1-4). 칸·◀▶는 계획 탭 navRow와 같은 클래스.
      const label=button(ym.slice(0,4)+'년 '+Number(ym.slice(5,7))+'월',openYear,'secondary plan-nav-label hc-ym');label.setAttribute('aria-label',ym.slice(0,4)+'년 '+Number(ym.slice(5,7))+'월 · '+HOME_CAL_TEXT.yearOpen);
      add(out,add(el('div',null,'hc-month'),add(el('div',null,'plan-nav'),button('◀',()=>moveMonth(-1),'secondary'),label,button('▶',()=>moveMonth(1),'secondary')),...dateGrid(h,{...ctx,planCal:{events:monthCal?.events??[],failed:Boolean(monthCal?.failed),outer}},st,data,ym,{pick,selected:date,tail:true,weeks:true})));
    }
  }
  // 고른 날: 머리 "11월 13일 (금)" · 일정(종일 위, 시각 순, 바깥 .ics는 흐린 칩) · 계획 줄 · 비었으면 한 줄 · 추가 단추(기존 시트).
  const list=el('div',null,'hc-list'),head=add(el('h3',null,'hc-date'),el('span',dateLabel(date),'hc-date-text'),date===today?el('span','오늘','calendar-today-badge'):null);
  if(date===today)head.setAttribute('aria-current','date');
  add(list,head);
  const evs=homeDayEvents(weekCal?.events,outer?.on(date)??[],date),plans=homeDayPlans(life,study,date,today,{storage,draft:studyDraftOf(ctx,today)});
  if(weekCal?.failed)add(list,el('p',HOME_CAL_TEXT.failed,'muted small hc-failed'));
  if(evs.length){
    const g=add(el('div',null,'hc-group hc-events'),el('h4','일정 '+evs.length+'개','hc-sub'));
    for(const x of evs){
      if(x.event){const r=button(null,()=>hc.open(x.event),'plan-sched-row hc-event'),own=splitEventNotes(x.event.notes).kind;r.dataset.date=date;r.dataset.kind=x.event.kind;r.dataset.color=eventColorOf(x.event);add(g,add(r,evStrip(el,x.event),el('span',eventTimeText(x.event)||'종일','plan-sched-when'),el('span',x.title,'plan-sched-title'),own?el('span',own,'plan-sched-kind'):null));}   // V12A-3·4: 앞 색 띠 · "15:45~23:00"
      else{const chip=outer.chip(x.outer);chip.textContent=x.title;add(g,add(el('div',null,'hc-outer-row'),el('span',x.time||'종일','plan-sched-when'),chip));}   // 시각은 앱 일정 줄과 같은 자리(칩 글자 = 제목, 누르면 바깥 일정 시트 그대로)
    }
    add(list,g);
  }
  if(plans.rows.length){
    const g=add(el('div',null,'hc-group hc-plans'),el('h4',plans.head,'hc-sub'));
    for(const r of plans.rows){const row=add(el('div',null,'plan-row hc-plan-row'),tag(h,subjects,r.subjectId),el('span',BLOCK_TEXT[r.block],'hc-block'),el('span',r.showTitle?r.title:'','plan-title'),el('span',r.text,'plan-status '+r.kind));row.dataset.itemId=r.id;g.append(row);}
    add(list,g);
  }
  if(!evs.length&&!plans.rows.length)add(list,el('p',HOME_CAL_TEXT.empty,'hc-empty'));
  const locked=Boolean(ctx.freshBefore?.(date));   // V7D2: 새 시작 전 날짜는 계획을 고치지 않는다(읽기 전용 한 줄)
  if(locked)add(list,el('p',ctx.freshText?.lock??'새 시작 전 기록이라 읽기만 할 수 있어','notice fresh-lock-note'));
  // V12A-2: 오늘을 보는 중이면 "어제 기록"(월요일엔 어제가 이번 주 띠 밖이라 ‹를 한 번 더 눌러야 했다) → 어제 하루 기록. 어제 야식 체크 = 이 단추 → 야식X → 했음(3번).
  const yday=shiftDay(today,-1),ydayBtn=date===today&&dateKeyOK(yday)?button(HOME_CAL_TEXT.yesterday,()=>pick(yday),'secondary hc-yesterday'):null;
  add(list,add(el('div',null,'button-row hc-add'),locked?null:button(HOME_CAL_TEXT.addPlan,()=>openPlanEditor(ctx,st,date),'secondary hc-add-plan'),hc?.add?button(HOME_CAL_TEXT.addEvent,()=>hc.add(date),'secondary hc-add-event'):null,ydayBtn));
  add(out,list);
  root.append(out);
  return out;
}

// ----- 연 보기 -----
// V8W3-3 연간 계획(소유자 2026-11-14 "멀리 → 연간 계획"): 위 = 1월~12월 가로 한 줄(폰은 6×2, CSS), 달을 누르면 아래에 그 달 계획: 머리 한 줄(목표 대비 · 계획 n개 중 m개 달성 · 남은 계획, 월 보기와 같은 글) + 그 달 주(주 이름 = weekName, 4일 이상 든 달) + "월 보기에서 열기".
// 고른 달 = st.yearPick(null = 올해면 이번 달, 다른 해면 1월). 화면 상태라 이 기기에도 적지 않는다(쓰기 0). 지난 달·지난 주 = 0절 "지나간 것"(회색 빗금 + 연한 글자, 기록 글자는 그대로 읽힌다).
// 계산만(시계·저장소·DOM 없음): 달마다 실제 벽돌(그 달 날만)·계획 줄 달성(planItemsDone)·시험, 주마다 벽돌/(하루 목표 × 7)·계획 줄 수·시험.
// data = {life,study,ach,exams,today}(renderPlan의 계산 묶음), draft = 아직 쌓지 않은 오늘 공부 카드(FIX68 F7: 오늘 줄만 초안으로 센다).
export function yearPlanModel(data,year,storage=null,draft=null){
  const months=[];
  for(let m=1;m<=12;m++)months.push(monthPlanModel(data,String(year).padStart(4,'0')+'-'+String(m).padStart(2,'0'),storage,draft));
  return {year,goal:data.ach.goalBricks,months};
}
// V12C: 한 달 계획 요약(연간 로드맵·수능까지 달 카드가 같이 쓴다). 주 = 그 달 이름의 주(weekName, 목요일이 든 달). subjects = 그 주 계획 줄의 과목별 줄 수(많은 순).
export function monthPlanModel({life=null,study=null,ach,exams,today},ym,storage=null,draft=null){
  const weeks=weekIndex(ach),goalWeek=ach.goalBricks*7,items=[...(exams?.items??[])].sort(byDate);
  const examsIn=(a,b)=>items.filter(x=>x.date>=a&&x.date<=b).map(x=>examDisplayName(x).replace(/\(.*\)/,''));
  const plansIn=(a,b)=>{let n=0;for(const p of life?.plans??[])if(p.date>=a&&p.date<=b)n+=p.data?.items?.length??0;return n;};
  const subjectsIn=(a,b)=>{const c=new Map();for(const p of life?.plans??[])if(p.date>=a&&p.date<=b)for(const x of p.data?.items??[])c.set(x.subjectId,(c.get(x.subjectId)??0)+1);return [...c].map(([subjectId,n])=>({subjectId,n})).sort((x,y)=>y.n-x.n||(x.subjectId<y.subjectId?-1:1));};
  const first=ym+'-01',days=daysInMonth(ym),last=ym+'-'+String(days).padStart(2,'0');
  let actual=0;for(let d=first;d<=last;d=shiftDay(d,1))actual+=actualOf(weeks,d).total;
  const wks=[];
  for(let w=mondayOf(first);w<=last;w=shiftDay(w,7)){
    if(weekName(w).ym!==ym)continue;
    const end=shiftDay(w,6),wk=weeks.get(w);
    wks.push({monday:w,end,name:weekName(w).text,n:weekName(w).n,value:wk?.value??0,ratio:wk&&goalWeek>0?Math.min(1,wk.value/goalWeek):0,plans:plansIn(w,end),subjects:subjectsIn(w,end),exams:examsIn(w,end),state:end<today?'PAST':w>today?'FUTURE':'NOW'});
  }
  return {ym,month:Number(ym.slice(5,7)),year:Number(ym.slice(0,4)),days,actual,plans:plansIn(first,last),items:planItemsDone(life,study,first,last,today,storage,draft),exams:examsIn(first,last),state:last<today?'PAST':first>today?'FUTURE':'NOW',weeks:wks};
}
// 그 달 머리 한 줄(plan-month monthHeadText와 같은 규칙). 쌓은 벽돌도 계획도 없으면 null.
export function yearMonthText(mo,goal){
  const parts=[];
  if(mo.actual>0||mo.items.total+mo.items.later>0)parts.push(goalVsText(mo.actual,goal,mo.days));
  if(mo.items.total>0)parts.push(itemsDoneText(mo.items));
  if(mo.items.later>0)parts.push('남은 계획 '+mo.items.later+'개');
  return parts.length?parts.join(' · '):null;
}
export const yearPickOf=(st,year,today)=>typeof st.yearPick==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(st.yearPick)&&Number(st.yearPick.slice(0,4))===year?st.yearPick:year===Number(today.slice(0,4))?today.slice(0,7):String(year).padStart(4,'0')+'-01';
// V12C-4 (소유자 2026-11-16 "연간 계획 = 1년 로드맵"): 한 사이클 = 수능 달 12달 전 ~ 수능 달(2026-11 ~ 2027-11, 11·12·1·2…11 순서 13달). 수능이 없거나 지났으면 이번 달부터 13달.
// 13달 전체의 주(주 이름 = weekName, 목요일이 든 달)를 한 화면 표로: 달 = 열 묶음(그 달 주 수만큼 넓음), 주 = 칸, 위 = 시기 띠(기본기·실력·실전·파이널, phaseOfWeek), 아래 = 시험 깃발.
// 주 칸을 누르면 표 아래에 그 주 계획(날마다 계획 줄 · 상태)이 나온다(월·주 보기로 넘어가지 않음). 고른 주 = st.roadPick(화면 상태, 기록·기기 저장 0). ◀▶ = 사이클을 12달씩 옮김(st.year = 시작 달 'YYYY-MM').
// 계산만(시계·저장소·DOM 없음, storage는 손 완료 표시 읽기만).
export const ROAD_MONTHS=13;
export function roadStart(exams,today){
  const t=csatTarget(exams);
  return t&&t.date>=today&&dateKeyOK(t.date)?shiftMonth(t.date.slice(0,7),-(ROAD_MONTHS-1)):today.slice(0,7);
}
export function roadmapModel(data,start,storage=null,draft=null){
  const {exams,today}=data,months=[],weeks=[],target=csatTarget(exams);
  for(let k=0;k<ROAD_MONTHS;k++){
    const mo=monthPlanModel(data,shiftMonth(start,k),storage,draft);
    mo.weeks=mo.weeks.map(w=>({...w,index:weeks.length+mo.weeks.indexOf(w),phase:phaseOfWeek(exams,w.monday)}));
    weeks.push(...mo.weeks);months.push(mo);
  }
  const n=Math.max(1,weeks.length),segments=[];
  for(const w of weeks){const s=segments.at(-1);if(s&&s.phase===w.phase)s.to=w.index;else segments.push({phase:w.phase,from:w.index,to:w.index});}
  for(const s of segments){s.x0=s.from/n;s.x1=(s.to+1)/n;s.name=PHASES[s.phase];s.past=weeks[s.to].state==='PAST';}
  const items=[...(exams?.items??[])].sort(byDate),flags=[];
  for(const x of items){const w=weeks.find(v=>x.date>=v.monday&&x.date<=v.end);if(w)flags.push({id:x.id,name:examDisplayName(x).replace(/\(.*\)/,''),date:x.date,week:w.monday,at:(w.index+0.5)/n,csat:target!==null&&x.id===target.id,past:x.date<today,dDay:dDay(today,x.date)});}
  const end=months.at(-1).ym;
  return {start,end,months,weeks,segments,flags,n,goal:data.ach.goalBricks,now:weeks.find(w=>w.state==='NOW')?.monday??null};
}
export const roadLabel=m=>m.start.slice(0,4)+'년 '+Number(m.start.slice(5,7))+'월 ~ '+m.end.slice(0,4)+'년 '+Number(m.end.slice(5,7))+'월';
export const roadPickOf=(st,m)=>typeof st.roadPick==='string'&&m.weeks.some(w=>w.monday===st.roadPick)?st.roadPick:m.now??m.weeks[0]?.monday??null;
// 고른 주의 날마다 계획(오늘 카드·오늘 탭 목록과 같은 homeDayPlans 규칙: 안 함 · 조각 · 완료 n장, 오지 않은 날은 "계획").
export function weekPlanDays(life,study,monday,today,{storage=null,draft=null}={}){
  return Array.from({length:7},(_,k)=>{const date=shiftDay(monday,k);return {date,...homeDayPlans(life,study,date,today,{storage,draft})};});
}
function roadPhaseSvg(h,m){
  const {svg}=h,pct=v=>Math.round(v*100000)/1000+'%',s=svg('svg',{class:'rm-phase',width:'100%',height:22,'aria-hidden':'true'});
  for(const g of m.segments){
    const r=svg('rect',{class:'pcs-seg rm-seg ph'+g.phase+(g.past?' past':''),x:pct(g.x0),y:2,width:pct(g.x1-g.x0),height:18,rx:3});r.dataset.phase=String(g.phase);s.append(r);
    if(g.x1-g.x0>=0.05)s.append(svg('text',{class:'rm-seg-name',x:pct((g.x0+g.x1)/2),y:15,'text-anchor':'middle'},g.name));
  }
  return s;
}
function roadFlagSvg(h,m){
  const {svg}=h,pct=v=>Math.round(v*100000)/1000+'%',anchor=a=>a<0.06?'start':a>0.94?'end':'middle',s=svg('svg',{class:'rm-flags',width:'100%',height:40,'aria-hidden':'true'});
  m.flags.forEach((f,k)=>{
    const low=(m.flags.length-1-k)%2===1,y=low?34:18,cls=(f.csat?' csat':'')+(f.past?' past':'');
    s.append(svg('line',{class:'rm-pole'+cls,x1:pct(f.at),y1:0,x2:pct(f.at),y2:y-11}),svg('text',{class:'rm-flag'+cls,x:pct(f.at),y,'text-anchor':anchor(f.at)},'★'+f.name));
  });
  return s;
}
function yearView(h,ctx,st,data){
  const {el,add,button,svg}=h,{today,life,study}=data,home=roadStart(data.exams,today),start=typeof st.year==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(st.year)?st.year:home;
  const storage=ctx.storage??null,draft=studyDraftOf(ctx,today),m=roadmapModel(data,start,storage,draft),pick=roadPickOf(st,m);
  const out=el('section',null,'plan-card plan-year plan-road');out.dataset.start=m.start;
  const move=(ym,picked=true)=>{choosePlanDate(st,'year',ym,picked);st.roadPick=null;void ctx.rerender();};
  add(out,navRow(h,roadLabel(m),()=>move(shiftMonth(start,-12)),()=>move(shiftMonth(start,12)),()=>move(home,false),'이번 사이클',start===home));
  const csat=m.flags.find(f=>f.csat);
  add(out,el('p','1년 로드맵 · '+(csat?csat.name+' '+short(csat.date)+'까지 ':'')+m.weeks.length+'주 · 주 칸을 누르면 아래에 그 주 계획','muted small rm-lead'));
  // 표: 가로 스크롤 상자(1280 폭은 한눈에, 좁은 폭은 칸 최소 폭에서 밀어 보기). 시기 띠·깃발은 칸과 같은 비율(SVG x %)이라 주 칸과 줄이 맞는다.
  const scroll=el('div',null,'rm-scroll'),table=el('div',null,'rm-table');table.setAttribute('role','group');table.setAttribute('aria-label',roadLabel(m)+' 주 표, 칸 = 주, 누르면 아래에 그 주 계획');
  const row=el('div',null,'rm-months');
  for(const mo of m.months){
    const col=el('div',null,'rm-month w'+mo.weeks.length+(mo.state==='NOW'?' now':mo.state==='PAST'?' past':''));col.dataset.ym=mo.ym;
    const head=add(el('div',null,'rm-mon-head'),el('small',mo.month===1||mo===m.months[0]?String(mo.year):' ','rm-mon-year'),el('strong',mo.month+'월','rm-mon-name'));head.setAttribute('aria-hidden','true');
    const cells=el('div',null,'rm-weeks');
    for(const w of mo.weeks){
      const on=w.monday===pick,b=button(null,()=>{st.roadPick=w.monday;void ctx.rerender();},'rm-week ph'+w.phase+(w.state==='NOW'?' now':'')+(w.exams.length?' exam':'')+(on?' selected':''));
      b.dataset.week=w.monday;b.dataset.navOnly='1';b.setAttribute('aria-pressed',String(on));if(w.state==='PAST')b.setAttribute('data-past','');if(w.state==='NOW')b.setAttribute('aria-current','true');
      b.setAttribute('aria-label',mo.year+'년 '+w.name+' '+short(w.monday)+'~'+short(w.end)+' · '+PHASES[w.phase]+(w.value?' · 벽돌 '+barsText(w.value):'')+(w.plans?' · 계획 '+w.plans+'개':'')+(w.exams.length?' · '+w.exams.join(', '):''));
      const bar=svg('svg',{class:'rm-wk-bar',viewBox:'0 0 10 4',preserveAspectRatio:'none','aria-hidden':'true'});bar.append(svg('rect',{class:'rm-wk-bar-bg',x:0,y:0,width:10,height:4}));if(w.ratio>0)bar.append(svg('rect',{class:'plan-year-fill rm-wk-fill',x:0,y:0,width:10*w.ratio,height:4}));
      add(b,el('span',String(w.n),'rm-wk-n'),w.plans?el('span','●','rm-wk-plan'):el('span',' ','rm-wk-plan none'),bar);
      cells.append(b);
    }
    row.append(add(col,head,cells));
  }
  add(scroll,add(table,roadPhaseSvg(h,m),row,roadFlagSvg(h,m)));
  add(out,scroll,el('p','위 띠 = 시기(기본기·실력·실전·파이널) · ★ = 시험 · 칸 숫자 = 그 달 몇째 주 · ● = 계획 있음 · 칸 아래 막대 = 그 주 벽돌(하루 목표 '+barsText(m.goal)+' × 7일 대비)','muted small rm-note'));
  // 아래: 고른 주 계획(날마다). 계획 넣기·고치기는 "주 보기에서 고치기"(같은 주 격자).
  const w=m.weeks.find(v=>v.monday===pick);
  if(w){
    const box=el('section',null,'rm-detail');box.dataset.week=w.monday;box.setAttribute('aria-label',w.name+' 계획');
    const days=weekPlanDays(life,study,w.monday,today,{storage,draft}),total=days.reduce((n,d)=>n+d.rows.length,0),done=days.reduce((n,d)=>n+(d.future?0:d.done),0),upto=days.reduce((n,d)=>n+(d.future?0:d.total),0);
    add(box,el('h3',w.name+' · '+weekSpanLabel(w.monday)+(w.state==='NOW'?' · 이번 주':''),'rm-detail-title'),
      el('p',[PHASES[w.phase],w.exams.length?'★'+w.exams.join(', '):null,total?'계획 '+total+'개'+(upto?' · '+upto+'개 중 '+done+'개 달성':''):'이 주 계획 없음',w.value?'벽돌 '+barsText(w.value):null].filter(Boolean).join(' · '),'plan-sum rm-detail-sum'));
    const list=el('div',null,'rm-days');
    for(const d of days){
      const line=el('div',null,'rm-day'+(d.date===today?' today':''));line.dataset.date=d.date;if(d.date<today)line.setAttribute('data-past','');
      const rows=el('div',null,'rm-day-rows');
      for(const r of d.rows){const x=add(el('div',null,'plan-row rm-plan-row'),tag(h,data.subjects,r.subjectId),el('span',BLOCK_TEXT[r.block],'hc-block'),el('span',r.showTitle?r.title:'','plan-title'),el('span',r.text,'plan-status '+r.kind));x.dataset.itemId=r.id;rows.append(x);}
      if(!d.rows.length)rows.append(el('span','—','muted small rm-day-none'));
      list.append(add(line,el('span',dateLabel(d.date),'rm-day-date'),rows));
    }
    add(box,list,add(el('div',null,'button-row'),button('주 보기에서 고치기',()=>{choosePlanDate(st,'monday',w.monday,w.monday!==mondayOf(today));setView(st,ctx,'WEEK');void ctx.rerender();},'secondary rm-open-week')));
    add(out,box);
  }
  return out;
}
// V12C-5: 수능까지 달 카드를 누르면 카드 줄 아래에 그 달 주별 계획(주 줄 = 주 이름 · 날짜 · 벽돌 막대 · 과목별 계획 줄 수 · 시험, 누르면 그 주 보기).
function monthWeeksNode(h,ctx,st,data,mo){
  const {el,add,button,svg}=h,goal=data.ach.goalBricks,head=yearMonthText(mo,goal);
  const box=el('section',null,'py-detail pcs-detail');box.dataset.ym=mo.ym;box.setAttribute('aria-label',mo.year+'년 '+mo.month+'월 주별 계획');
  add(box,el('h3',mo.year+'년 '+mo.month+'월 주별 계획'+(mo.state==='NOW'?' · 이번 달':''),'py-detail-title'),el('p',head??'이 달은 쌓은 벽돌도 계획도 없습니다 · 계획은 주 보기에서 넣습니다.',head?'plan-sum py-sum':'muted small py-sum'));
  const list=el('div',null,'py-weeks');
  for(const w of mo.weeks){
    const row=button(null,()=>{choosePlanDate(st,'monday',w.monday);setView(st,ctx,'WEEK');void ctx.rerender();},'py-week'+(w.state==='NOW'?' now':'')+(w.exams.length?' exam':''));
    row.dataset.week=w.monday;row.dataset.navOnly='1';if(w.state==='PAST')row.setAttribute('data-past','');if(w.state==='NOW')row.setAttribute('aria-current','true');
    const subj=w.subjects.map(s=>subjectOf(data.subjects,s.subjectId).name+' '+s.n).join(' · ');
    row.setAttribute('aria-label',w.name+' '+short(w.monday)+'~'+short(w.end)+(w.value?' · 벽돌 '+barsText(w.value):'')+(w.plans?' · 계획 '+w.plans+'개'+(subj?' ('+subj+')':''):'')+(w.exams.length?' · '+w.exams.join(', '):'')+' · 주 보기로');
    const slot=el('span',null,'plan-year-slot'+(w.state==='NOW'?' now':'')+(w.exams.length?' exam':''));
    if(w.ratio>0){const bar=svg('svg',{class:'plan-year-bar',viewBox:'0 0 100 10',preserveAspectRatio:'none','aria-hidden':'true'});bar.append(svg('rect',{class:'plan-year-fill',x:0,y:0,width:100*w.ratio,height:10}));slot.append(bar);}
    if(w.value)slot.append(el('span',barsText(w.value),'plan-year-value'));
    add(row,el('span',w.name,'py-week-name'),el('span',short(w.monday)+'~'+short(w.end),'py-week-range'),slot,el('span',w.plans?'계획 '+w.plans+'개':'계획 없음','py-week-plans'+(w.plans?'':' none')),subj?el('span',subj,'py-week-subjects'):null,w.exams.length?el('span','★'+w.exams.join(', '),'py-week-exam'):null);
    list.append(row);
  }
  add(box,list,el('p','주를 누르면 주 보기 · 채운 길이 = 하루 목표 '+barsText(goal)+' × 7일 대비 쌓은 벽돌 · ★ = 시험','muted small plan-year-note'));
  add(box,add(el('div',null,'button-row'),button('월 보기에서 열기',()=>{choosePlanDate(st,'month',mo.ym,mo.ym!==data.today.slice(0,7));st.monthDates=false;st.monthTable=false;setView(st,ctx,'MONTH');void ctx.rerender();},'secondary py-open-month')));
  return box;
}

// ----- 수능까지 보기 (A5 → V10D-2) -----
// V10D-2 (소유자 2026-11-15 "52칸 격자와 굵은 검은 테두리 — 얼마나 남았는지 안 와닿는다"): 격자·레일 대신
//   맨 위 큰 글자 "수능까지 D-368 · 52주 4일" + 한 줄 "전체의 3% 지남" → 가로 시간 막대 1개(0절 게이지 규칙: 처음 꽉 참, 왼쪽부터 깎임, 남은 몫은 오른쪽에 붙음, 오늘 표시는 왼쪽→오른쪽)
//   구간 색(기본기·실력·실전·파이널) + 깃발(시험 이름·날짜·D-n) → 아래 달 한 줄(이번 달 ~ 수능 달, 달마다 "이 달 n주" 눈금, 누르면 그 달 계획 달력).
// 전체(막대 왼쪽 끝) = 기록을 시작한 주의 월요일(옛 주 격자의 첫 칸과 같은 규칙, 기록이 없거나 오늘보다 늦으면 오늘) ~ 수능일. 계산만(시계·저장소·DOM 없음).
// 구간: 수능을 뺀 시험일마다 다음 시기로(그 시험일 = 다음 시기의 첫날). 시험이 3개보다 많으면 파이널에 머문다(phaseOfWeek와 같은 상한).
export const CSAT_MONTHS_MAX=24;
const examLabel=x=>examDisplayName(x).replace(/\(.*\)/,'');
export function csatPlanModel(exams,today,ach){
  const c=countdown(exams,today);
  if(c.state==='NONE'||c.state==='AFTER')return null;
  const target=c.target,end=target.date,first=ach?.hasRecords&&ach.weeks?.length?ach.weeks[0].monday:null,floor=shiftDay(end,-7*MAX_GRID_WEEKS);
  let start=first&&first<today?first:today;if(start<floor)start=floor<today?floor:today;   // V11B L-04: 수능이 160주보다 멀면 바닥이 미래 → 시작 = 오늘(시작이 오늘보다 늦지 않게)
  const total=Math.max(1,dDay(start,end)),passed=Math.min(total,Math.max(0,dDay(start,today))),at=d=>Math.min(1,Math.max(0,dDay(start,d)/total));
  const marks=[...(exams?.items??[])].filter(x=>x.id!==target.id&&x.date<end).sort(byDate);
  const phaseAt=d=>Math.min(3,marks.filter(x=>x.date<=d).length);
  const cuts=[start,...marks.map(x=>x.date).filter(d=>d>start),end].filter((d,i,a)=>a.indexOf(d)===i);
  const segments=cuts.slice(0,-1).map((from,k)=>({from,to:cuts[k+1],phase:phaseAt(from),x0:at(from),x1:at(cuts[k+1]),past:cuts[k+1]<=today}));
  const flags=[...marks.filter(x=>x.date>=start),target].map(x=>({id:x.id,name:examLabel(x),date:x.date,dDay:dDay(today,x.date),past:x.date<today,csat:x.id===target.id,at:at(x.date)}));
  const thisMonth=today.slice(0,7),lastMonth=end.slice(0,7),months=[];
  for(let ym=thisMonth;ym<=lastMonth&&months.length<CSAT_MONTHS_MAX;ym=shiftMonth(ym,1)){
    const mFirst=ym+'-01',mLast=ym+'-'+String(daysInMonth(ym)).padStart(2,'0'),weeks=[];
    for(let w=mondayOf(mFirst);w<=mLast;w=shiftDay(w,7))if(weekName(w).ym===ym){const we=shiftDay(w,6);weeks.push({monday:w,state:we<today?'PAST':w>today?'FUTURE':'NOW'});}
    months.push({ym,month:Number(ym.slice(5,7)),year:Number(ym.slice(0,4)),weeks,exams:(exams?.items??[]).filter(x=>x.date>=mFirst&&x.date<=mLast).sort(byDate).map(examLabel),state:ym===thisMonth?'NOW':'FUTURE',csat:ym===lastMonth});
  }
  return {name:examLabel(target),date:end,dDay:c.dDay,start,total,passed,left:total-passed,pct:passed/total*100,today,todayAt:at(today),segments,flags,months};
}
// "수능까지 D-368 · 52주 4일"(한 주가 안 되면 주 없이), 당일은 "수능 D-DAY".
export function csatHeroText(m){
  if(m.dDay<=0)return m.name+' D-DAY';
  const w=Math.floor(m.dDay/7),r=m.dDay%7;
  return m.name+'까지 D-'+m.dDay+(w?' · '+w+'주'+(r?' '+r+'일':''):'');
}
// "전체의 3% 지남". 하루라도 지났는데 반올림이 0이면 "1% 미만".
export function csatPassedText(m){
  const p=Math.round(m.pct);
  return '전체의 '+(m.passed>0&&p===0?'1% 미만':m.dDay>0&&p>=100?'99% 넘게':p+'%')+' 지남';   // V10FIX L-03: 수능 전날까지는 반올림해도 "100%"라고 하지 않는다
}
// 막대 SVG: viewBox 없이 x를 %로(글자 크기는 화면 폭과 무관하게 CSS로). 깃발 두 층은 오른쪽(수능)부터 번갈아 → 이웃 깃발 글자가 겹치지 않는다.
// 지나간 몫 = 회색 빗금(--cal-past 토큰, 디데이 게이지와 같은 무늬), 남은 몫 = 시기 색(왼쪽 끝이 오늘 표시에 붙어 오른쪽 끝 수능까지). 시기 이름은 막대 안 글자(색만으로 구분하지 않음).
const CSAT_BAR={top:62,h:20,height:108};
function csatBarSvg(h,m){
  const {svg}=h,pct=v=>Math.round(v*100000)/1000+'%',{top,h:H}=CSAT_BAR,anchor=a=>a<0.08?'start':a>0.92?'end':'middle';
  const s=svg('svg',{class:'pcs-bar',width:'100%',height:CSAT_BAR.height,role:'img','aria-label':csatHeroText(m)+' · '+csatPassedText(m)+' · '+m.flags.map(f=>f.name+' '+short(f.date)+(f.past?' 끝':' D-'+f.dDay)).join(' · ')});
  const pat=svg('pattern',{id:'pcs-hatch',width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});
  pat.append(svg('rect',{class:'hc-hatch-bg',width:6,height:6}),svg('line',{class:'hc-hatch-line',x1:0,y1:0,x2:0,y2:6}));
  s.append(h.add(svg('defs'),pat),svg('rect',{class:'pcs-past',x:0,y:top,width:'100%',height:H,fill:'url(#pcs-hatch)'}));
  for(const g of m.segments){
    const a=Math.max(g.x0,m.todayAt);
    const r=svg('rect',{class:'pcs-seg ph'+g.phase,x:pct(a),y:top,width:pct(Math.max(0,g.x1-a)),height:H});r.dataset.phase=String(g.phase);r.dataset.from=g.from;s.append(r);
  }
  s.append(svg('rect',{class:'pcs-frame',x:0,y:top,width:'100%',height:H,rx:3}));
  for(const g of m.segments)if(g.x1-g.x0>=0.06)s.append(svg('text',{class:'pcs-phase'+(g.past?' past':''),x:pct((g.x0+g.x1)/2),y:top+H/2+4,'text-anchor':'middle'},PHASES[g.phase]));
  m.flags.forEach((f,k)=>{
    const up=(m.flags.length-1-k)%2===1,ny=up?13:39,x=pct(f.at),cls=(f.csat?' csat':'')+(f.past?' past':'');
    s.append(svg('line',{class:'pcs-pole'+cls,x1:x,y1:up?30:56,x2:x,y2:top}));
    s.append(svg('text',{class:'pcs-flag'+cls,x,y:ny,'text-anchor':anchor(f.at)},f.name));
    s.append(svg('text',{class:'pcs-flag-sub'+cls,x,y:ny+13,'text-anchor':anchor(f.at)},short(f.date)+' · '+(f.past?'끝':f.dDay===0?'D-DAY':'D-'+f.dDay)));
  });
  const tx=pct(m.todayAt);
  s.append(svg('line',{class:'pcs-today',x1:tx,y1:top-6,x2:tx,y2:top+H+6}),svg('text',{class:'pcs-today-label',x:tx,y:top+H+20,'text-anchor':anchor(m.todayAt)},'오늘'));
  return s;
}
// V12C-5 (소유자 2026-11-16): 카드를 누르면 월 보기로 넘어가지 않고 카드 줄 아래에 그 달 주별 계획이 펼쳐진다(st.csatPick, 같은 카드를 다시 누르면 접힘 · 화면 상태라 기록·기기 저장 0).
// 벽돌(주 눈금) 줄 세로 위치를 모든 카드에서 맞춘다: 연도 줄을 모든 카드에 두고 연도를 보이지 않는 카드는 같은 높이의 빈 줄(읽기 도구에서 숨김).
export const csatPickOf=(st,m)=>typeof st.csatPick==='string'&&m.months.some(x=>x.ym===st.csatPick)?st.csatPick:null;
function csatMonthsNode(h,ctx,st,m){
  const {el,add,button}=h,row=el('div',null,'pcs-months'),pick=csatPickOf(st,m);row.setAttribute('role','group');row.setAttribute('aria-label','이번 달부터 '+m.name+' 달까지, 달을 누르면 아래에 그 달 주별 계획');
  for(const mo of m.months){
    const on=mo.ym===pick,b=button(null,()=>{st.csatPick=on?null:mo.ym;void ctx.rerender();},'pcs-month'+(mo.state==='NOW'?' current':'')+(mo.csat?' csat':'')+(on?' selected':''));
    b.dataset.ym=mo.ym;b.dataset.navOnly='1';b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-expanded',String(on));if(mo.state==='NOW')b.setAttribute('aria-current','date');
    b.setAttribute('aria-label',mo.year+'년 '+mo.month+'월 · 이 달 '+mo.weeks.length+'주'+(mo.state==='NOW'?' · 이번 달 · 지난 주 '+mo.weeks.filter(w=>w.state==='PAST').length+'개':'')+(mo.exams.length?' · '+mo.exams.join(', '):'')+(on?' · 아래 주별 계획 접기':' · 아래에 주별 계획 펼치기'));
    // 연도 = 숫자 + "년"(접힘 폭은 "년"을 숨겨 숫자가 한 줄에, CSS)
    const ticks=el('span',null,'pcs-ticks');ticks.setAttribute('aria-hidden','true');
    for(const w of mo.weeks){const t=el('span',null,'pcs-tick '+w.state.toLowerCase());t.dataset.week=w.monday;ticks.append(t);}
    const yearShown=mo.month===1||mo===m.months[0],year=yearShown?add(el('small',null,'pcs-month-year'),el('span',String(mo.year)),el('span','년','pcs-month-year-unit')):el('small',' ','pcs-month-year blank');
    if(!yearShown)year.setAttribute('aria-hidden','true');
    add(b,year,el('strong',mo.month+'월','pcs-month-name'),add(el('span',null,'pcs-month-weeks'),el('span','이 달 ','pcs-month-pre'),el('span',mo.weeks.length+'주')),ticks,mo.exams.length?el('span','★'+mo.exams[0]+(mo.exams.length>1?' +'+(mo.exams.length-1):''),'pcs-month-exam'):null);
    row.append(b);
  }
  return row;
}
function wallSvg(h,cap){
  const cols=24,rows=5,total=cols*rows,all=cap.stacked+cap.left;
  let on=all>0?Math.round(total*cap.stacked/all):0;if(cap.stacked>0&&on===0)on=1;
  const s=h.svg('svg',{class:'plan-wall',viewBox:'0 0 336 60',width:'100%',role:'img','aria-label':'벽돌 용량 벽, 쌓은 칸 '+on+' / '+total});
  for(let i=0;i<total;i++){
    const c=i%cols,filled=i<on;   // 아래 줄부터 왼쪽에서 오른쪽으로 채운다
    s.append(h.svg('rect',{class:'plan-wall-brick'+(filled?' on':''),x:c*14,y:(rows-1-Math.floor(i/cols))*12,width:13,height:11,rx:1.5}));
  }
  return s;
}
function csatView(h,ctx,st,data){
  const {ach,today,exams}=data,c=countdown(exams,today),out=h.el('section',null,'plan-csat');
  if(c.state==='NONE'){h.add(out,h.el('p','시험 일정이 없어 남은 시간을 그릴 수 없습니다.','muted small'));return out;}
  if(c.state==='AFTER'){h.add(out,h.el('p',examDisplayName(c.target)+'이 지났습니다 · 남은 시간 화면은 시험 일정을 새로 넣으면 다시 그려집니다.','plan-card notice'));return out;}
  const cap=capacity(exams,today,ach),m=csatPlanModel(exams,today,ach);
  // V10D-2: 큰 글자 + 지난 몫 한 줄 + 시간 막대(구간 색·깃발·오늘) + 막대 설명 + 달 한 줄. 옛 주 격자·시험 레일은 그리지 않는다(weekGrid 계산은 남김).
  const hero=h.el('section',null,'plan-card pcs-hero');hero.dataset.start=m.start;hero.dataset.total=String(m.total);hero.dataset.passed=String(m.passed);
  h.add(hero,h.el('h3',csatHeroText(m),'pcs-title'),h.el('p',csatPassedText(m),'pcs-passed'),csatBarSvg(h,m),
    h.el('p','막대 = '+short(m.start)+(m.start<today?' 기록 시작':' 오늘')+' ~ '+short(m.date)+' '+m.name+' · '+m.total+'일 · 지난 날만큼 왼쪽부터 깎여요','muted small pcs-note'),
    csatMonthsNode(h,ctx,st,m),h.el('p','달을 누르면 아래에 그 달 주별 계획 · 눈금 1칸 = 1주(그 주 목요일이 든 달)','muted small pcs-months-note'));
  const pick=csatPickOf(st,m);   // V12C-5: 고른 달의 주별 계획(카드 줄 바로 아래)
  if(pick)h.add(hero,monthWeeksNode(h,ctx,st,data,monthPlanModel(data,pick,ctx.storage??null,studyDraftOf(ctx,today))));
  const feel=h.el('div',null,'plan-feel');
  h.add(feel,h.add(h.el('div',null,'plan-feel-cell'),h.el('strong',c.weekendsLeft+'번'),h.el('span','남은 주말')),h.add(h.el('div',null,'plan-feel-cell'),h.el('strong',c.examsLeft+'번'),h.el('span','남은 모의고사')),h.add(h.el('div',null,'plan-feel-cell'),h.el('strong',hourShareText(c.hoursLeft)),h.el('span','오늘 1시간의 몫'),h.el('small','남은 공부 가능 시간 '+c.hoursLeft.toLocaleString('ko-KR')+'시간(하루 '+STUDY_HOURS_PER_DAY+'h)','muted')));
  const items=planItemsDone(data.life,data.study,'0000-01-01',today,today,ctx.storage??null,studyDraftOf(ctx,today)),itemsText=itemsDoneText(items);   // V6A: 지금까지 계획 줄 n개 중 m개
  const wall=h.el('section',null,'plan-card');h.add(wall,h.el('h3','벽돌 용량 벽'),wallSvg(h,cap),h.el('p',cap.days+'일 × '+cap.goal+'장 = '+cap.total.toLocaleString('ko-KR')+'장 쌓을 수 있어요 · 지금까지 '+barsText(cap.stacked)+' 쌓음'+(itemsText?' · 지금까지 '+itemsText:''),'plan-sum'));
  h.add(out,hero,feel,wall);
  return out;
}

// ---------- 하루 계획 편집 시트 ----------
export const PLAN_UNDO='되돌리기';
// seed = 초안 줄(B61 다음 주 제안, id 없음)을 기존 줄 뒤에 더해 시트만 연다. onSaved = 저장이 끝난 뒤 부른 쪽에 알린다. 기록은 여전히 "저장" 버튼뿐이다.
function openPlanEditor(ctx,st,date,{seed=[],onSaved=null}={}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h;
  const whole=ctx.getWhole(),life=whole.life??{plans:[]},defs=lifeDefs(whole.life??null);let base=structuredClone(planOf(life,date));
  const subjects=defs.subjects.filter(s=>!s.hidden),draft=structuredClone(base?.items??[]);
  const newId=i=>'p'+ctx.uid().slice(0,10)+(i===undefined?'':i.toString(36));
  for(const x of seed)draft.push({...x,id:newId(draft.length)});
  const body=el('div',null,'plan-editor'),err=el('p',null,'notice error plan-editor-error'),note=el('p',PLAN_NOTICE_TEXT.PLAN_LOCAL_DRAFT,'notice plan-editor-note');err.hidden=true;note.hidden=true;
  const showErr=code=>{err.textContent=planErrorText(code);err.hidden=false;};
  const rows=el('div',null,'plan-edit-rows');
  const select=(options,value,label)=>{const n=el('select');for(const [v,t] of options){const o=el('option',t);o.value=String(v);n.append(o);}n.value=String(value);n.setAttribute('aria-label',label);return n;};
  // V6A: 줄 = 과목 · 세부내용 · 시간대만. 장수 입력칸 없음(새 줄은 NEW_ITEM_BRICKS, 저장된 줄의 값은 그대로 두고 "예전 목표 n장"으로만 보인다).
  const draw=()=>{
    rows.replaceChildren();
    draft.forEach((x,i)=>{
      const sub=select(subjects.some(s=>s.id===x.subjectId)?subjects.map(s=>[s.id,s.name]):[...subjects.map(s=>[s.id,s.name]),[x.subjectId,'기타']],x.subjectId,'과목');
      sub.addEventListener('change',()=>{x.subjectId=sub.value;autoSave();});
      const title=el('input');title.type='text';title.value=x.title;title.setAttribute('maxlength',String(MAX_PLAN_TITLE));title.setAttribute('aria-label','세부내용');title.setAttribute('placeholder','세부내용');
      title.addEventListener('input',()=>{x.title=title.value;});title.addEventListener('change',()=>autoSave());
      // V6F: 약자 없이 한글만. V7B: 고르는 값은 3개, 옛 밤 줄은 저녁으로 보이고 시간대를 바꾸지 않으면 저장값(N)을 그대로 둔다.
      const block=select(SHOWN_BLOCKS.map(b=>[b,BLOCK_TEXT[b]+' ('+BLOCK_HINT[b]+')']),shownBlock(x.block),'시간대');block.addEventListener('change',()=>{if(block.value!==shownBlock(x.block))x.block=block.value;autoSave();});
      const old=oldTarget(x);
      add(rows,add(el('div',null,'plan-edit-row'),sub,title,block,old!==null?el('span','예전 목표 '+barsText(old),'muted small plan-old-target'):null,button('삭제',()=>{draft.splice(i,1);draw();autoSave();},'secondary')));
    });
    if(!draft.length)add(rows,el('p','줄이 없습니다. "줄 추가"를 누르세요.','muted small'));
  };
  const addRow=()=>{
    if(draft.length>=MAX_PLAN_ITEMS){showErr('PLAN_ITEM_LIMIT');return;}
    draft.push({id:newId(draft.length),subjectId:subjects[0]?.id??'kor',title:'',bricks:NEW_ITEM_BRICKS,block:'M'});err.hidden=true;draw();
  };
  const copyYesterday=()=>{
    const prev=planOf(life,shiftDay(date,-1));
    if(!prev?.items.length){err.textContent='어제 계획이 없습니다.';err.hidden=false;return;}
    draft.splice(0,draft.length,...copyPlan(prev,date,i=>newId(i)).items);err.hidden=true;draw();autoSave();   // 초안만 바꾼다. 저장은 "저장" 버튼(V6F: 즉시 저장이 켜져 있으면 바로)
  };
  // V6F (지시서 3): 앱이 ctx.planAutoSave를 켜면 줄을 고칠 때마다(과목·시간대 고르기, 세부내용 칸을 떠날 때, 삭제, 어제 복사) 바로 저장하고 시트는 열어 둔다. "저장됨 · 되돌리기"(1회).
  // 저장은 아래 "저장" 핸들러 하나(save)가 auto 모드로 한다(쓰기 한 곳 규칙 그대로). 세부내용이 빈 새 줄처럼 규칙에 아직 안 맞으면 저장하지 않고 "아직 저장 안 됨". 저장 중에 또 고치면 끝난 뒤 한 번 더.
  const PLAN_AUTO_RETRY=20,PLAN_AUTO_WAIT=300,PLAN_AUTO_BUSY='아직 저장 안 됨 · 다른 저장이 길어져요 · 한 번 더 고치면 저장돼요';   // V10FIX M-14
  const saved=el('p',null,'notice plan-editor-saved');saved.hidden=true;let saving=false,again=false,undoItems=null,autoMode=null;
  const showSaved=(text,withUndo)=>{saved.replaceChildren(el('span',text));if(withUndo&&undoItems)add(saved,button(PLAN_UNDO,()=>{const items=undoItems;undoItems=null;draft.splice(0,draft.length,...structuredClone(items));draw();autoSave(true);},'secondary plan-editor-undo'));saved.hidden=false;};
  function autoSave(undoing=false){if(!ctx.planAutoSave)return;if(saving){again=true;return;}autoMode={undoing};save();}
  draw();
  let dlg=null,sealedAs=null;
  const save=()=>{
    const auto=autoMode;autoMode=null;
    const mine={date,items:draft.map(x=>({...planItemKept(x),id:x.id,subjectId:x.subjectId,title:String(x.title).trim(),bricks:Number(x.bricks),block:x.block}))};   // V13B L-C3: 받은 선택 칸(done)은 그대로
    try{validateLifeData('PLAN_DAY',date,mine);}catch(e){if(auto)showSaved('아직 저장 안 됨 · 세부내용을 채우면 저장돼요',false);else showErr(e?.code);return;}
    if(auto&&stable(mine)===stable(base??{date,items:[]}))return;
    if(!auto)dlg?.close?.();else saving=true;
    // V10FIX M-14: 다른 저장이 진행 중이면 perform이 이 저장을 실행하지 않는다(false). 그때 saving이 true로 남아 이후 고친 내용이 저장되지 않았다 → 풀고 잠시 뒤 다시 시도(최대 PLAN_AUTO_RETRY번, 그 뒤 "아직 저장 안 됨").
    const ran=ctx.perform(async()=>{
      if(!auto){st.message=null;st.error=false;st.notices=[];}
      let sealed=false;
      try{
        if(sealedAs===stable(mine)&&await ctx.draftMode?.())sealed=true;   // 같은 내용을 봉인 초안으로 또 쌓지 않는다
        else{
          const r=await savePlanDay(ctx,{date,base,mine});
          if(r.sealed){sealed=true;sealedAs=stable(mine);if(!auto)st.notices=r.notices.filter(n=>n.code!=='PLAN_LOCAL_DRAFT');}
          else if(auto){undoItems=auto.undoing?null:structuredClone(base?.items??[]);base=structuredClone(mine);showSaved((auto.undoing?'저장 전 계획으로 되돌렸어요 · ':'')+(r.drafted?PLAN_DRAFT_TEXT:'저장됨'),!auto.undoing);onSaved?.();}   // OPS1A: 초안이면 "이 기기에 저장됨 · 5분 안에 자동으로 쌓여요"
          else{st.message=r.status==='SAVED'?'하루 계획을 저장했습니다.':'이미 같은 계획이 저장되어 있습니다.';st.notices=r.notices;onSaved?.();}
        }
        if(sealed){if(auto){note.hidden=false;showSaved(PLAN_NOTICE_TEXT.PLAN_LOCAL_DRAFT,false);}else st.message=PLAN_NOTICE_TEXT.PLAN_LOCAL_DRAFT;}
      }
      catch(e){if(auto)showSaved(planErrorText(e?.code),false);else{st.message=planErrorText(e?.code);st.error=true;}}
      finally{if(auto)saving=false;}
      await ctx.rerender();
      if(auto){if(again){again=false;autoSave();}return;}
      if(sealed&&!ctx.locked?.()){note.hidden=false;dlg=ctx.sheet?.('하루 계획 편집',body)??null;}   // 임시 저장은 성공이 아니다: 시트와 입력을 그대로 다시 연다(H37-P1). 잠겼으면 열지 않는다(열린 모달은 로그인 칸을 막는다, FIX38)
    });
    if(auto)void Promise.resolve(ran).then(r=>{if(r!==false){retries=0;return;}saving=false;again=false;if(++retries>PLAN_AUTO_RETRY){retries=0;showSaved(PLAN_AUTO_BUSY,false);return;}setTimeout(()=>{autoMode=auto;save();},PLAN_AUTO_WAIT);});
  };
  let retries=0;
  // 단추는 줄 목록 위에 둔다(줄이 많아 시트가 스크롤돼도 "저장"이 보인다).
  add(body,el('p',dateLabel(date)+' 계획 · 줄 하나 = 과목 + 세부내용 + 시간대 · 벽돌은 공부 벽돌에서 그 과목을 공부하면 자동으로 채워져요','muted small'),
    add(el('div',null,'buttons'),button('줄 추가',addRow,'secondary'),button('어제 계획 복사',copyYesterday,'secondary'),button(ctx.planAutoSave?'닫기':'저장',ctx.planAutoSave?()=>dlg?.close?.():save,'primary')),err,note,saved,rows);
  dlg=ctx.sheet?.('하루 계획 편집',body)??null;
  return {body,draft,save,addRow,copyYesterday};
}

// ---------- 탭 ----------
export function renderPlan(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add}=h;
  const whole=ctx.getWhole(),life=whole.life??null,today=kstDate(ctx.now()),defs=lifeDefs(life),ach=achieve({life,study:whole.study??null,today});
  const data={life,study:whole.study??null,ach,today,exams:defs.exams,subjects:subjectMap(defs)};
  followPlanToday(st,today);   // FIX53C (HW1)
  const out=add(el('section',null,'panel plan-panel'),add(el('div',null,'plan-head'),el('span','PLAN','eyebrow'),el('h2','계획표','panel-title')));out.id='life-plan';
  // CAL1B: 맨 위(제목 바로 아래, 보기 칩 위) "오늘 · M월 D일 요일" 한 줄. 모든 보기에 한 번만.
  add(out,add(el('p',null,'calendar-today-line plan-today-line'),el('span','오늘','calendar-today-badge'),el('span',todayLineText(today),'calendar-today-date')));
  add(out,...viewChips(h,ctx,st,today),examLine(h,ctx,st,defs.exams,today));
  // FIX46B: 모의고사 결과(life-quest가 그린다, 앱이 넘겨 준다). 쓰기 문이 닫혀 있으면 안내 한 줄만.
  add(out,ctx.examResults?.({exams:defs.exams,today,report:(text,error,notices)=>{st.message=text;st.error=error;st.notices=notices;}})??null);
  if(st.message)add(out,el('p',st.message,st.error?'notice error plan-message':'notice plan-message'));
  for(const n of st.notices??[])add(out,el('p',PLAN_NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060','notice plan-notice'));
  const view={DAY:dayView,WEEK:weekView,MONTH:monthView,YEAR:yearView,CSAT:csatView}[st.view]??dayView;
  add(out,view(h,ctx,st,data));
  if(st.view==='CSAT')ctx.rangePanel?.(out);   // V9B: 수능 보기 아래 D-day 역산(남은 범위·이번 주 목표) + 모의고사 추세(study-plan이 그린다, 앱이 넘긴다)
  // P1C: 옛 '달력' 화면의 하루·7일 목록 = 오늘·주 보기 아래 일정 줄(달 보기는 plan-month 안에).
  if(st.view==='DAY')add(out,scheduleBox(h,ctx,st,data,st.date,st.date,{addDate:st.date,withDate:false}));
  if(st.view==='WEEK'){const end=shiftDay(st.monday,6);add(out,scheduleBox(h,ctx,st,data,st.monday,end,{addDate:today>=st.monday&&today<=end?today:st.monday}));}
  root.append(out);
  return out;
}
export {openPlanEditor};
