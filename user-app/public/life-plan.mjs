// 계획 탭 (B43): 일·주·월·연·수능까지 보기, 하루 계획(PLAN_DAY) 편집, 계획 vs 실제. 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음).
// 보기만 하는 부분(남은 주·체감 숫자·격자·레일·용량 벽·달력·막대·계획 vs 실제)은 쌓인 기록(life·study)과 오늘 날짜만으로 계산한다: 시계·난수·저장소·통신을 쓰지 않는다.
// 기록을 쓰는 곳은 savePlanDay() 하나이고, 계획 시트의 "저장" 버튼 핸들러에서만 부른다(엔티티 1개 = 연산 1). 열기·보기 전환·어제 계획 복사·달력 누르기는 아무것도 쓰지 않는다.
// 마지막으로 본 보기만 이 기기 localStorage(lb.plan.view)에 적는다(기록이 아니라 화면 설정, 실패해도 무시).
// 계획 달성은 XP에 넣지 않는다(B42 공식 유지, 다음 단계에서 결정). 설계: AUTOPILOT\tasks\B43_PLANNER_DDAY.md, ADDENDUM A4·A5·A6.
import {achieve,SUBJECT_BY_CODE} from './life-achieve.mjs';
import {stable} from './life-rebase.mjs';
import {lifeDefs,dDay,dayNumber,shiftDay,kstDate,validateLifeData,PLAN_BLOCKS,MAX_PLAN_ITEMS,MAX_PLAN_TITLE,MAX_PLAN_BRICKS,hhmmFromIso,brickOf,subjectOfSession,dateKeyOK} from './life-model.mjs';

// 보기는 5개(저장 lb.plan.view 값도 그대로), 머리 칩은 4개(P1A·D36-3): 오늘 · 주 · 월 · 멀리. 멀리를 고르면 그 아래 연 · 수능까지 칩 줄이 열린다.
export const VIEWS=Object.freeze([['DAY','오늘'],['WEEK','주'],['MONTH','월'],['YEAR','연'],['CSAT','수능까지']]);
export const VIEW_CHIPS=Object.freeze([['DAY','오늘'],['WEEK','주'],['MONTH','월'],['FAR','멀리']]),FAR_VIEWS=Object.freeze(['YEAR','CSAT']);
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
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
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
  for(const x of exams.items){const m=mondayOf(x.date);examWeeks.set(m,[...(examWeeks.get(m)??[]),x.name]);}
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
export function copyPlan(prev,date,newId){
  const used=new Set(),items=(prev?.items??[]).map((x,i)=>{let id=newId(i);while(used.has(id))id+='x';used.add(id);return {...x,id};});
  return {date,items};
}
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
      if(their==='same'||their==='modified'&&same(m,t)){keep.set(id,m);continue;}
      keep.set(id,m);notices.push(their==='modified'?{code:'PLAN_VALUE_OVERWRITTEN',itemId:id,remote:t,mine:m}:{code:'PLAN_CONFLICT_KEPT_LOCAL',itemId:id,mine:m});
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
  const list=sortedItems(items??[]),rows=new Map(list.map(x=>[x.id,{id:x.id,subjectId:x.subjectId,block:x.block,minutes:0,bricks:0,pieces:0,sessions:[],manual:done.includes(x.id),state:'NONE'}]));
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
  const svg=(tag,attrs={},text=null)=>{const n=doc.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==null)n.textContent=String(text);return n;};
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
// 칩 4개. '오늘'은 날짜도 오늘로 되돌린다. '멀리'는 마지막에 본 먼 보기(없으면 연)로 가고, 고른 동안 아래에 연·수능까지 칩 줄을 연다.
function viewChips(h,ctx,st,today){
  const far=FAR_VIEWS.includes(st.view),rows=[];
  const line=(list,label,cls)=>{
    const row=h.el('div',null,cls);row.setAttribute('role','toolbar');row.setAttribute('aria-label',label);
    for(const [key,text] of list){
      const on=key==='FAR'?far:st.view===key;
      const pick=()=>{if(key==='DAY')choosePlanDate(st,'date',today,false);setView(st,ctx,key==='FAR'?(far?st.view:st.far??FAR_VIEWS[0]):key);if(FAR_VIEWS.includes(st.view))st.far=st.view;void ctx.rerender();};
      const b=ctx.kit?.chip?ctx.kit.chip(text,{selected:on,onClick:pick}):h.button(text,pick,'lb-chip'+(on?' selected':''));
      b.setAttribute('aria-pressed',String(on));b.dataset.view=key;row.append(b);
    }
    rows.push(row);
  };
  line(VIEW_CHIPS,'계획 보기','plan-views');
  if(far)line(VIEWS.filter(([k])=>FAR_VIEWS.includes(k)),'멀리 보기','plan-views plan-far');
  return rows;
}
// 머리 시험 카드 4칸: 오늘 이후 시험을 앞에서부터 4개(모자라면 지난 시험으로 채움). 가장 가까운 시험은 강조, 수능은 금빛, 지난 시험은 "끝".
export function examCards(exams,today){
  const items=[...(exams?.items??[])].sort(byDate),upcoming=items.filter(x=>x.date>=today),past=items.filter(x=>x.date<today);
  const pick=[...past.slice(Math.max(0,past.length-Math.max(0,4-upcoming.length))),...upcoming.slice(0,4)].sort(byDate);
  const target=csatTarget(exams),nearest=upcoming[0]??null;
  return pick.map(x=>({...x,dDay:dDay(today,x.date),ended:x.date<today,nearest:nearest!==null&&x.id===nearest.id,csat:target!==null&&x.id===target.id}));
}
function examRow(h,exams,today){
  const row=h.el('div',null,'plan-exams');
  for(const x of examCards(exams,today)){
    const c=h.el('div',null,'plan-exam'+(x.csat?' csat':'')+(x.nearest?' nearest':'')+(x.ended?' ended':''));c.dataset.examId=x.id;
    h.add(c,h.el('span',x.name,'plan-exam-name'),h.el('strong',x.ended?'끝':(x.dDay===0?'D-DAY':'D-'+x.dDay),'plan-exam-dday'),x.status==='잠정'?h.el('span','잠정','life-badge'):null,h.el('span',x.date,'muted small'));
    row.append(c);
  }
  if(!row.children.length)row.append(h.el('p','시험 일정이 없습니다. 오늘 탭의 습관 편집에서 추가하세요.','muted small'));
  return row;
}
// V6A: D-day 두 칩. 가까운 시험이 먼저([다음 시험], 금 테두리·크게), 그 뒤 수능([최종], 보조·작게). 한 문장으로 잇지 않는다. 잠정 배지는 그 칩 안에만.
// 순서는 날짜 오름차순 계산(글자 고정 없음). 지난 시험은 빠지고 다음 시험으로 넘어간다. 가장 가까운 시험이 수능이면 칩 하나([최종]).
// 오늘 카드 머리·계획 탭 칩·STUDY LIVE 덮개가 모두 이 함수(ddayChips·ddayChipsNode)를 쓴다.
const ddayText=x=>x.dDay===0?'D-DAY':'D-'+x.dDay;
export const DDAY_LABEL=Object.freeze({next:'다음 시험',final:'최종'});
export function ddayChips(exams,today){
  const up=[...(exams?.items??[])].sort(byDate).filter(x=>x.date>=today),target=csatTarget(exams),fin=target&&target.date>=today?target:null,next=up[0]??null,out=[];
  if(next&&(!fin||next.id!==fin.id))out.push({...next,role:'next'});
  if(fin)out.push({...fin,role:'final'});
  return out.sort(byDate).map((x,i)=>({id:x.id,name:x.name.replace(/\(.*\)/,''),date:x.date,status:x.status,dDay:dDay(today,x.date),role:x.role,main:i===0}));
}
export const ddayChipText=c=>DDAY_LABEL[c.role]+' '+c.name+' '+ddayText(c);
// h = {el,add}. 칩 줄(span이라 단추 안에도 들어간다).
export function ddayChipsNode(h,chips,cls=''){
  const row=h.el('span',null,'lb-dday-chips'+(cls?' '+cls:''));
  for(const c of chips){
    const n=h.add(h.el('span',null,'lb-dday-chip '+c.role+(c.main?' main':'')),h.el('span',DDAY_LABEL[c.role],'lb-dday-label'),h.el('strong',c.name+' '+ddayText(c),'lb-dday-value'),c.status==='잠정'?h.el('span','잠정','life-badge'):null);
    n.dataset.examId=c.id;row.append(n);
  }
  return row;
}
// 글자판(읽기 낭독·안내용): "다음 시험 3평 D-133 · 최종 수능 D-373". 다가올 시험이 없으면 "지난 시험 n개", 일정이 없으면 null.
export function examLineText(exams,today){
  const chips=ddayChips(exams,today);
  if(chips.length)return chips.map(ddayChipText).join(' · ');
  const cards=examCards(exams,today);
  return cards.length?'지난 시험 '+cards.length+'개':null;
}
function examLine(h,ctx,st,exams,today){
  const text=examLineText(exams,today);
  if(text===null)return examRow(h,exams,today);   // 시험 일정이 없으면 안내 문구 그대로
  const chips=ddayChips(exams,today);
  const b=h.button(chips.length?null:text,()=>{st.examsOpen=!st.examsOpen;void ctx.rerender();},'plan-exam-line'+(chips.length?' has-chips':''));
  if(chips.length)b.append(ddayChipsNode(h,chips));
  b.setAttribute('aria-expanded',String(Boolean(st.examsOpen)));b.setAttribute('aria-label','시험 일정 '+(st.examsOpen?'접기':'펼치기')+' · '+text);
  return h.add(h.el('div',null,'plan-exam-wrap'),b,st.examsOpen?examRow(h,exams,today):null);
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
  const table=ctx.planMonth?.(st,{data,ym,items,dateGrid:()=>dateGrid(h,ctx,st,data,ym),goWeek:monday=>{choosePlanDate(st,'monday',monday);setView(st,ctx,'WEEK');void ctx.rerender();}})??null;
  h.add(out,...(table?[table]:dateGrid(h,ctx,st,data,ym)));
  return out;
}
function dateGrid(h,ctx,st,data,ym){
  const {life,ach,today,exams,subjects}=data,first=ym+'-01',n=daysInMonth(ym),lead=(sunday0(first)+6)%7;
  const examDays=new Map();for(const x of exams.items){examDays.set(x.date,[...(examDays.get(x.date)??[]),x.name]);}
  const eventDays=new Map();for(const e of ctx.planCal?.events??[])eventDays.set(e.date,(eventDays.get(e.date)??0)+1);
  const weeks=weekIndex(ach);
  const grid=h.el('div',null,'plan-cal');
  for(const w of ['월','화','수','목','금','토','일'])grid.append(h.el('span',w,'plan-cal-head'));
  for(let i=0;i<lead;i++)grid.append(h.el('span',null,'plan-cal-blank'));
  for(let d=1;d<=n;d++){
    const date=ym+'-'+String(d).padStart(2,'0'),act=actualOf(weeks,date),ex=examDays.get(date)??[],hasPlan=Boolean(planOf(life,date)?.items.length),evs=eventDays.get(date)??0,outs=ctx.planCal?.outer?.on(date).length??0;
    const b=h.button(null,()=>{openDaySheet(ctx,st,data,date);},'plan-day-cell plan-heat-'+heatLevel(act.total,ach.goalBricks)+(date===today?' today':'')+(ex.length?' exam':'')+(hasPlan?' has-plan':''));
    b.dataset.date=date;b.setAttribute('aria-label',dateLabel(date)+' 벽돌 '+barsText(act.total)+(ex.length?' · '+ex.join(', '):'')+(evs?' · 일정 '+evs+'개':'')+(outs?' · 바깥 일정 '+outs+'개':'')+(hasPlan?' · 계획 있음':''));
    b.append(h.el('span',String(d),'plan-cal-num'));
    const subs=[...act.bySubject.keys()].slice(0,3);
    if(subs.length){const dots=h.svg('svg',{class:'plan-dots',viewBox:'0 0 30 8',width:'100%','aria-hidden':'true'});subs.forEach((id,k)=>dots.append(h.svg('circle',{cx:5+k*10,cy:4,r:3.5,fill:subjectOf(subjects,id).color})));b.append(dots);}
    if(ex.length)b.append(h.el('span',ex.length>1?ex.length+'개':ex[0].replace(/\(.*\)/,''),'plan-cal-exam'));
    if(evs)b.append(h.el('span','●'+evs,'plan-cal-events'));
    if(outs)b.append(h.el('span','○'+outs,'plan-cal-events ics-outer-mark'));
    grid.append(b);
  }
  return [grid,h.el('p','날짜를 누르면 그날 요약이 열립니다 · 색이 진할수록 벽돌이 많고 점은 쌓은 과목입니다.','muted small')];
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
  for(const x of exams?.items??[])if(x.date>=from&&x.date<=to){const d=dDay(today,x.date);out.push({date:x.date,time:'',title:x.name.replace(/\(.*\)/,'')+(x.status==='잠정'?' (잠정)':''),note:d<0?'끝':d===0?'D-DAY':'D-'+d,exam:x,event:null});}
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
    const when=[withDate?dateLabel(x.date):null,x.exam?null:x.time||'종일'].filter(Boolean).join(' ');
    const row=x.event?button(null,()=>{before?.();cal.open(x.event);},'plan-sched-row'):el('div',null,'plan-sched-row exam');
    row.dataset.date=x.date;if(x.event)row.dataset.kind=x.event.kind;
    add(out,add(row,when?el('span',when,'plan-sched-when'):null,el('span',x.title,'plan-sched-title'),x.note?el('strong',x.note,'plan-sched-note'):null));
  }
  if(outerShow.length){const list=el('div',null,'ics-outer-list plan-sched-outer');for(const x of outerShow)add(list,el('span',withDate?dateLabel(x.date):null,'muted small'),cal.outer.chip(x.o));add(out,list);}
  const rest=items.length-show.length+outer.length-outerShow.length;
  if(rest>0){const more=button('일정 '+rest+'개 더 보기',()=>{st.schedAll=from;void ctx.rerender();},'secondary plan-sched-more');more.dataset.navOnly='1';add(out,more);}
  return out;
}
function openDaySheet(ctx,st,data,date){
  const doc=ctx.document??globalThis.document,h=maker(doc),{life,ach,exams,subjects}=data,sum=daySummary(life,ach,date),body=h.el('div',null,'plan-daysheet');
  const ex=exams.items.filter(x=>x.date===date);
  for(const x of ex)h.add(body,h.el('p',x.name+' 시험일'+(x.status==='잠정'?' (잠정)':''),'notice'));
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

// ----- 연 보기 -----
function yearView(h,ctx,st,data){
  const {ach,today,exams}=data,year=st.year??=Number(today.slice(0,4)),weeks=weekIndex(ach);
  const out=h.el('section',null,'plan-card plan-year');
  h.add(out,navRow(h,year+'년',()=>{choosePlanDate(st,'year',year-1);void ctx.rerender();},()=>{choosePlanDate(st,'year',year+1);void ctx.rerender();},()=>{choosePlanDate(st,'year',Number(today.slice(0,4)),false);void ctx.rerender();},'올해',year===Number(today.slice(0,4))));
  const examWeeks=new Map();for(const x of exams.items)examWeeks.set(mondayOf(x.date),[...(examWeeks.get(mondayOf(x.date))??[]),x.name]);
  const months=Array.from({length:12},()=>[]);
  for(let m=mondayOf(year+'-01-01');m<=year+'-12-31';m=shiftDay(m,7)){
    const mm=m<year+'-01-01'?shiftDay(m,6):m;   // 해를 걸친 첫 주는 그 해에 속한 쪽 달로
    if(mm.slice(0,4)!==String(year))continue;
    months[Number(mm.slice(5,7))-1].push(m);
  }
  // V6A: 월 라벨은 SVG 글자(화면 폭에 따라 커지는 가는 숫자)가 아니라 본문 서체 HTML(15px·600·ink-600·오른쪽 정렬·고정폭 숫자, 줄 높이 = 주 칸 높이, styles.css).
  // 칸 = HTML(주 칸 높이 고정), 채움 막대만 칸 안 SVG(preserveAspectRatio none, 글자 없음). 채운 길이 = 그 주 벽돌 / (하루 목표 × 7).
  const goalWeek=ach.goalBricks*7;
  const grid=h.el('div',null,'plan-yeargrid');grid.setAttribute('role','list');grid.setAttribute('aria-label',year+'년 달별 주간 벽돌, 별은 시험 주');
  months.forEach((list,mi)=>{
    const row=h.add(h.el('div',null,'plan-year-row'),h.el('span',(mi+1)+'월','plan-year-month'));row.setAttribute('role','listitem');
    const cells=h.el('div',null,'plan-year-weeks');
    for(const m of list){
      const w=weeks.get(m),ratio=w&&goalWeek>0?Math.min(1,w.value/goalWeek):0;
      const c=h.el('span',null,'plan-year-slot'+(m===mondayOf(today)?' now':'')+(examWeeks.has(m)?' exam':''));c.dataset.week=m;
      c.setAttribute('aria-label',short(m)+' 주'+(w?' · 벽돌 '+barsText(w.value):'')+(examWeeks.has(m)?' · '+examWeeks.get(m).join(', '):''));
      if(ratio>0){const bar=h.svg('svg',{class:'plan-year-bar',viewBox:'0 0 100 10',preserveAspectRatio:'none','aria-hidden':'true'});bar.append(h.svg('rect',{class:'plan-year-fill',x:0,y:0,width:100*ratio,height:10}));c.append(bar);}
      if(w)c.append(h.el('span',barsText(w.value),'plan-year-value'));
      if(examWeeks.has(m)){const t=h.el('span','★','plan-year-exam');t.title=examWeeks.get(m).join(', ');c.append(t);}
      cells.append(c);
    }
    grid.append(h.add(row,cells));
  });
  const items=planItemsDone(data.life,data.study,year+'-01-01',year+'-12-31',today,ctx.storage??null,studyDraftOf(ctx,today));
  h.add(out,grid,h.el('p',[itemsDoneText(items),'한 칸 = 1주(월요일이 속한 달) · 채운 길이 = 하루 목표 '+barsText(ach.goalBricks)+' × 7일 대비 쌓은 벽돌 · ★ = 시험 주'].filter(Boolean).join(' · '),'muted small plan-year-note'));
  return out;
}

// ----- 수능까지 보기 (A5) -----
function gridSvg(h,cells){
  const cell=22,gap=2,step=cell+gap,rows=Math.max(1,Math.ceil(cells.length/GRID_COLS)),W=GRID_COLS*step;
  const s=h.svg('svg',{class:'plan-weekgrid',viewBox:'0 0 '+W+' '+rows*step,width:'100%',role:'img','aria-label':'남은 주 격자, 한 칸 = 1주'});
  cells.forEach((c,i)=>{
    const x=(i%GRID_COLS)*step,y=Math.floor(i/GRID_COLS)*step,g=h.svg('g',{class:'plan-wk ph'+c.phase+' '+c.state.toLowerCase()+(c.exams.length?' exam':''),'data-week':c.monday});
    g.append(h.svg('rect',{class:'plan-wk-bg',x,y,width:cell,height:cell,rx:3}));
    if(c.ratio>0)g.append(h.svg('rect',{class:'plan-wk-fill',x,y:y+cell*(1-c.ratio),width:cell,height:cell*c.ratio,rx:2}));
    g.append(h.svg('rect',{class:'plan-wk-edge',x,y,width:cell,height:cell,rx:3}));
    g.append(h.svg('title',{},short(c.monday)+' 주 · '+PHASES[c.phase]+(c.exams.length?' · '+c.exams.join(', '):'')+(c.state==='FUTURE'?'':' · 벽돌 '+c.value+' / '+c.target)));
    s.append(g);
  });
  return s;
}
function railSvg(h,exams,today,ach){
  const target=csatTarget(exams),W=340,x0=14,x1=326,end=dayNumber(target.date),start=dayNumber(today),span=Math.max(1,end-start);
  const xOf=d=>x0+(x1-x0)*Math.min(1,Math.max(0,(dayNumber(d)-start)/span));
  const s=h.svg('svg',{class:'plan-rail',viewBox:'0 0 '+W+' 92',width:'100%',role:'img','aria-label':'오늘부터 수능까지 시험 레일'});
  const marks=exams.items.filter(x=>x.id!==target.id&&x.date>=today&&x.date<target.date).sort(byDate);
  const cuts=[today,...marks.map(x=>x.date),target.date];
  const firstPhase=phaseOfWeek(exams,mondayOf(today));
  cuts.slice(0,-1).forEach((a,k)=>{
    const ph=Math.min(3,firstPhase+k),xa=xOf(a),xb=xOf(cuts[k+1]);
    s.append(h.svg('rect',{class:'plan-rail-seg ph'+ph,x:xa,y:44,width:Math.max(1,xb-xa),height:10}));
  });
  s.append(h.svg('line',{class:'plan-rail-today',x1:x0,y1:36,x2:x0,y2:62}));
  s.append(h.svg('text',{class:'plan-rail-name',x:x0,y:30,'text-anchor':'start'},'오늘'));
  [...marks,target].forEach((x,k)=>{
    const px=xOf(x.date),csat=x.id===target.id;
    s.append(h.svg('circle',{class:'plan-rail-dot'+(csat?' csat':''),cx:px,cy:49,r:csat?7:5}));
    s.append(h.svg('text',{class:'plan-rail-name',x:px,y:k%2?18:30,'text-anchor':csat?'end':'middle'},x.name.replace(/\(.*\)/,'')));
    s.append(h.svg('text',{class:'plan-rail-dday',x:px,y:76,'text-anchor':csat?'end':'middle'},'D-'+dDay(today,x.date)));
  });
  return s;
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
  if(c.state==='AFTER'){h.add(out,h.el('p',c.target.name+'이 지났습니다 · 남은 시간 화면은 시험 일정을 새로 넣으면 다시 그려집니다.','plan-card notice'));return out;}
  const cells=weekGrid(exams,today,ach),cap=capacity(exams,today,ach);
  const grid=h.el('section',null,'plan-card');
  h.add(grid,h.el('h3','남은 '+c.weeksLeft+'주 · 한 칸 = 1주 / 채운 칸 = 쌓은 벽돌'),gridSvg(h,cells));
  const legend=h.el('div',null,'plan-legend');for(const [i,name] of PHASES.entries())h.add(legend,h.el('span',name,'plan-legend-item ph'+i));
  h.add(grid,legend);
  const feel=h.el('div',null,'plan-feel');
  h.add(feel,h.add(h.el('div',null,'plan-feel-cell'),h.el('strong',c.weekendsLeft+'번'),h.el('span','남은 주말')),h.add(h.el('div',null,'plan-feel-cell'),h.el('strong',c.examsLeft+'번'),h.el('span','남은 모의고사')),h.add(h.el('div',null,'plan-feel-cell'),h.el('strong',hourShareText(c.hoursLeft)),h.el('span','오늘 1시간의 몫'),h.el('small','남은 공부 가능 시간 '+c.hoursLeft.toLocaleString('ko-KR')+'시간(하루 '+STUDY_HOURS_PER_DAY+'h)','muted')));
  const rail=h.el('section',null,'plan-card');h.add(rail,h.el('h3','시험 레일 · '+c.target.name+' D-'+c.dDay),railSvg(h,exams,today,ach),h.el('p','남은 일요일 '+c.sundaysLeft+'번 · 구간 색은 시기(기본기→파이널)가 진해지는 순서입니다.','muted small'));
  const items=planItemsDone(data.life,data.study,'0000-01-01',today,today,ctx.storage??null,studyDraftOf(ctx,today)),itemsText=itemsDoneText(items);   // V6A: 지금까지 계획 줄 n개 중 m개
  const wall=h.el('section',null,'plan-card');h.add(wall,h.el('h3','벽돌 용량 벽'),wallSvg(h,cap),h.el('p',cap.days+'일 × '+cap.goal+'장 = '+cap.total.toLocaleString('ko-KR')+'장 쌓을 수 있어요 · 지금까지 '+barsText(cap.stacked)+' 쌓음'+(itemsText?' · 지금까지 '+itemsText:''),'plan-sum'));
  h.add(out,grid,feel,rail,wall);
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
  const saved=el('p',null,'notice plan-editor-saved');saved.hidden=true;let saving=false,again=false,undoItems=null,autoMode=null;
  const showSaved=(text,withUndo)=>{saved.replaceChildren(el('span',text));if(withUndo&&undoItems)add(saved,button(PLAN_UNDO,()=>{const items=undoItems;undoItems=null;draft.splice(0,draft.length,...structuredClone(items));draw();autoSave(true);},'secondary plan-editor-undo'));saved.hidden=false;};
  function autoSave(undoing=false){if(!ctx.planAutoSave)return;if(saving){again=true;return;}autoMode={undoing};save();}
  draw();
  let dlg=null,sealedAs=null;
  const save=()=>{
    const auto=autoMode;autoMode=null;
    const mine={date,items:draft.map(x=>({id:x.id,subjectId:x.subjectId,title:String(x.title).trim(),bricks:Number(x.bricks),block:x.block}))};
    try{validateLifeData('PLAN_DAY',date,mine);}catch(e){if(auto)showSaved('아직 저장 안 됨 · 세부내용을 채우면 저장돼요',false);else showErr(e?.code);return;}
    if(auto&&stable(mine)===stable(base??{date,items:[]}))return;
    if(!auto)dlg?.close?.();else saving=true;
    void ctx.perform(async()=>{
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
  };
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
  add(out,...viewChips(h,ctx,st,today),examLine(h,ctx,st,defs.exams,today));
  // FIX46B: 모의고사 결과(life-quest가 그린다, 앱이 넘겨 준다). 쓰기 문이 닫혀 있으면 안내 한 줄만.
  add(out,ctx.examResults?.({exams:defs.exams,today,report:(text,error,notices)=>{st.message=text;st.error=error;st.notices=notices;}})??null);
  if(st.message)add(out,el('p',st.message,st.error?'notice error plan-message':'notice plan-message'));
  for(const n of st.notices??[])add(out,el('p',PLAN_NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060','notice plan-notice'));
  const view={DAY:dayView,WEEK:weekView,MONTH:monthView,YEAR:yearView,CSAT:csatView}[st.view]??dayView;
  add(out,view(h,ctx,st,data));
  // P1C: 옛 '달력' 화면의 하루·7일 목록 = 오늘·주 보기 아래 일정 줄(달 보기는 plan-month 안에).
  if(st.view==='DAY')add(out,scheduleBox(h,ctx,st,data,st.date,st.date,{addDate:st.date,withDate:false}));
  if(st.view==='WEEK'){const end=shiftDay(st.monday,6);add(out,scheduleBox(h,ctx,st,data,st.monday,end,{addDate:today>=st.monday&&today<=end?today:st.monday}));}
  root.append(out);
  return out;
}
export {openPlanEditor};
