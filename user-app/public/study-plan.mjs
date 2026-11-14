// V9B 수능 학습 엔진 2 화면: D-day 역산 계획(과목별 남은 범위 → 이번 주 목표), 계획 탭 주간 자동 제안(받아들이면 계획 초안으로), 모의고사 추세(과목별 선 그래프 + 목표선 + 지난 시험 대비 화살표).
// 저장 길(OPS1A, V9A 공부 카드와 같음): 단원·진도·목표 입력은 이 기기 초안(카드 초안 상자 = IndexedDB 암호문, 없으면 메모리)에 모인다(연산 0).
//  "지금 쌓기"·5분 자동 쌓기·저장 후 종료가 날짜 묶음(STUDY_RANGE_DAY)마다 1번 쓴다(묶음 1건 = 연산 1). 단원 하나·진도 하나 = 연산 하나가 되지 않는다.
//  흐름은 공부 하루 카드의 StudyFlow를 그대로 쓰고(초안 → rebase → 확정) 종류 규칙(spec)만 넘긴다. PC 저널은 쓰지 않는다(저널 draft-list 개인정보 경계 FIX49-P10).
// 역산 기준 시험 = 오늘 화면·계획 탭 디데이에서 고른(진한) 시험(lb.dday.active, 이 기기 화면 설정). 고르지 않았으면 가까운 시험.
// 주간 제안을 받아들이면 계획 탭 주 보기의 임시 입력(plan-week fillFromSuggest)에 들어간다. 계획 저장은 기존 "저장"(PLAN_DAY 하루 1건 = 연산 1) 그대로.
// 모의고사 점수는 기존 EXAM_RESULT(D46, life-quest 입력 시트) 그대로 읽기만 한다. 목표선만 이 종류(goals)에 둔다.
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음). 그래프는 SVG 속성(과목 색 stroke)과 styles.css 클래스. 색만으로 구분하지 않는다(▲▼― 글자·점선·굵기).
import {StudyFlow,shownCard} from './study-flow.mjs';
import {createStudyPorts} from './study-ui.mjs';
import {mergeList,stable} from './study-rebase.mjs';
import {lifeDefs,subjectColor} from './life-model.mjs';
import {ddayChips,readDdayActive} from './life-plan.mjs';
import {validateRangeDay,emptyRangeDay,projectRange,weekPlan,weekGoalLine,examTrend,trendText,subjectRows,kstDay,addDays,mondayOf,
  RANGE_LISTS,MAX_UNIT_NAME} from './study-range-model.mjs';

const sortById=items=>[...items].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const rowsOf=(c,l)=>c?c[l]:[];
export function diffRangeDay(base,mine){
  const added=[],modified=[],removed=[];
  for(const list of RANGE_LISTS){
    const B=new Map(rowsOf(base,list).map(i=>[i.id,i])),M=new Map(rowsOf(mine,list).map(i=>[i.id,i]));
    for(const [id,m] of M){if(!B.has(id))added.push({list,item:m});else if(stable(B.get(id))!==stable(m))modified.push({list,item:m});}
    for(const id of B.keys())if(!M.has(id))removed.push({list,id});
  }
  return {added,modified,removed};
}
export const rangeDayChanged=(base,mine)=>{const d=diffRangeDay(base,mine);return d.added.length+d.modified.length+d.removed.length>0;};
// 확정 직전 rebase: 공부 하루 카드(study-rebase)와 같은 3자 병합 규칙을 units·marks·goals 세 배열에 적용한다.
// V9FIX M-08: 진도·목표 줄을 두 기기가 같이 고쳤으면(REBASE_VALUE_OVERWRITTEN) 나중에 쌓은 쪽이 아니라 바꾼 시각(at)이 늦은 값을 남긴다. 알림은 그대로 돌려준다(화면이 알림).
export function rebaseRangeDay({date,base,mine,latest}){
  const notices=[],merged={date};
  for(const list of RANGE_LISTS){const r=mergeList(list,base,mine,latest,notices);if(r.rejected)return {...r.rejected,notices};merged[list]=r.items;}
  for(const n of notices)if(n.code==='REBASE_VALUE_OVERWRITTEN'&&(n.list==='marks'||n.list==='goals')&&n.remote.at>n.mine.at){merged[n.list]=merged[n.list].map(x=>x.id===n.itemId?n.remote:x);n.kept='remote';}
  merged.confirmCount=(latest?latest.confirmCount:0)+1;
  if(latest?RANGE_LISTS.every(l=>stable(sortById(merged[l]))===stable(sortById(latest[l]))):RANGE_LISTS.every(l=>!merged[l].length))return {status:'ALREADY_APPLIED',notices};
  try{validateRangeDay('STUDY_RANGE_DAY',date,merged);}catch(e){return {status:'REJECTED',code:e.code??'RANGE_REBASE_INVALID',notices};}
  return {status:'MERGED',card:merged,notices};
}
export const RANGE_SPEC=Object.freeze({type:'STUDY_RANGE_DAY',validate:(date,d)=>validateRangeDay('STUDY_RANGE_DAY',date,d),rebase:rebaseRangeDay,
  empty:date=>({...emptyRangeDay(date),confirmCount:1}),diff:diffRangeDay,hasChanges:rangeDayChanged,stable});
export const rangeView=whole=>whole?.range??{days:[]};
export function createRangePorts(ctx){return {...createStudyPorts(ctx,{type:'STUDY_RANGE_DAY',view:rangeView,noJournal:true}),spec:RANGE_SPEC};}

// ---- 상태·준비 ----
export const RANGE_TEXT=Object.freeze({
  title:'D-day 역산 · 남은 범위',
  sub:'과목마다 남은 단원과 진도(%)를 넣으면, 고른 디데이 시험까지 남은 주로 나눠 이번 주 목표를 만들어요. 주 목표는 월요일 진도 기준이라 진도를 올려도 바뀌지 않아요(이번 주에 새로 넣은 단원은 넣은 날 진도 기준으로 더해져요).',   // V9FIX L-14
  stack:'단원·진도·목표 입력은 이 기기에 모였다가 "지금 쌓기"(또는 5분 자동 쌓기) 한 번에 날짜 묶음으로 저장돼요 · 하나마다 저장하지 않아요.',
  empty:'아직 넣은 단원이 없어요 · 과목을 고르고 남은 단원을 한 줄에 하나씩 적어 넣으세요.',
  trend:'모의고사 추세',
  trendSub:'모의고사 결과(계획 탭 "모의고사 결과 넣기")를 과목별 선으로 봐요. 점선 = 목표선. ▲ 좋아짐 · ▼ 나빠짐 · ― 같음(지난 시험 대비).',
});
export const RANGE_ERROR_TEXT=Object.freeze({
  INVALID_RANGE_TEXT:'단원 이름은 1~'+MAX_UNIT_NAME+'자로 적어 주세요.',RANGE_UNIT_LIMIT:'하루에 넣는 단원은 200개까지예요.',RANGE_MARK_LIMIT:'하루 진도 바꾸기는 400번까지예요.',
  RANGE_GOAL_LIMIT:'하루 목표 바꾸기는 40번까지예요.',RANGE_DAY_TOO_LARGE:'오늘 범위 묶음이 너무 커요(48KB) · 임시 입력은 그대로 있어요.',
  INVALID_RANGE_GOAL:'목표는 원점수 0~100, 등급 1~9 정수로 적어 주세요.',NO_SUBJECT:'과목을 골라 주세요.',NO_UNITS:'단원 이름을 한 줄에 하나씩 적어 주세요.',
  REBASE_ID_COLLISION:'다른 기기에서 같은 번호로 다른 항목을 넣었어요 · 아무것도 저장하지 않았어요 · 임시 입력은 그대로 있어요.',UNKNOWN_UNIT:'그 단원을 찾지 못했어요.',
  UNIT_NOT_IN_DRAFT:'다른 기기에서 쌓은 단원이라 이 기기 임시 입력에는 아직 없어요 · 위 "지금 쌓기"로 먼저 쌓은 뒤 다시 지워 주세요(아무것도 바꾸지 않았어요).',
});
export const rangeErrorText=code=>RANGE_ERROR_TEXT[code]??(code?'처리하지 못했어요 · 임시 입력은 그대로 있어요 · 문의 코드 ▾⁠'+code+'⁠':'처리하지 못했어요.');
// V9FIX M-08: 쌓을 때 두 기기 충돌 알림을 범위 칸 글로 남긴다.
export function rangeNoticeText(notices){
  const L={units:'단원',marks:'진도',goals:'목표'},out=[];
  for(const n of notices??[]){
    const what=L[n.list]??'항목';
    if(n.code==='REBASE_VALUE_OVERWRITTEN')out.push(n.kept==='remote'?'다른 기기가 나중에 바꾼 '+what+' 값으로 맞췄어요':'다른 기기도 바꾼 '+what+'를 이 기기에서 나중에 바꾼 값으로 저장했어요');
    else if(n.code==='REBASE_CONFLICT_KEPT_REMOTE')out.push('지운 '+what+'은 다른 기기가 고쳐서 남겼어요');
    else if(n.code==='REBASE_CONFLICT_KEPT_LOCAL')out.push('다른 기기가 지운 '+what+'을 이 기기 값으로 다시 넣었어요');
  }
  return out.length?[...new Set(out)].join(' · '):null;
}
// V9FIX L-16: 쌓지 못한 날짜와 이유(두 기기를 합쳐 한도를 넘음 등).
const RANGE_LIMIT_FIX={RANGE_UNIT_LIMIT:' · 두 기기 단원을 합치면 하루 200개를 넘어요 · 이 기기에서 넣은 그날 단원을 줄이면 쌓여요',RANGE_MARK_LIMIT:' · 두 기기 진도를 합치면 하루 400번을 넘어요',RANGE_GOAL_LIMIT:' · 두 기기 목표를 합치면 하루 40번을 넘어요',RANGE_DAY_TOO_LARGE:' · 두 기기 입력을 합치면 48KB를 넘어요'};
export const rangeStackFailText=(date,code)=>date+' 범위 묶음을 쌓지 못했어요 · '+rangeErrorText(code)+(RANGE_LIMIT_FIX[code]??'');
export function createRangeState(){return {flow:null,ports:null,today:null,days:[],pending:[],subject:null,text:'',metric:'raw',open:null,message:null,error:false};}
export async function prepareRange(ctx,st,gone=()=>false){
  st.today=kstDay(ctx.now());
  if(!st.flow){st.ports=createRangePorts(ctx);st.flow=new StudyFlow(st.ports);}
  const drafts=(await st.ports.drafts.list()).filter(d=>d.type==='ENTITY'&&d.body?.entityType==='STUDY_RANGE_DAY');
  const dates=[...new Set(drafts.map(d=>d.body.entityId))].sort(),shown=new Map();
  for(const date of dates){const s=await st.flow.state(date);if(s.status==='LOCAL_DRAFT')shown.set(date,shownCard(s,st.ports.latest(date),rebaseRangeDay)??s.card);}
  if(gone())return st;
  const days=rangeView(ctx.getWhole()).days.filter(d=>!shown.has(d.date)).map(d=>({date:d.date,data:d.data}));
  for(const [date,data] of shown)days.push({date,data});
  st.days=days;st.pending=[...shown.keys()];
  return st;
}
export const rangeProjection=st=>projectRange(st.days);
// 쌓기(앱의 "지금 쌓기"·자동 쌓기·저장 후 종료가 부른다): 초안 날짜마다 confirm 1번.
// V9FIX M-08·L-16: 충돌 알림과 쌓지 못한 이유를 범위 칸 글(st.message)로 남긴다. 돌려주는 값 모양은 그대로.
export async function stackRange(st){
  let stacked=0,failed=0;const codes=[],notes=[],fails=[];
  if(st.stackMessage){st.message=null;st.error=false;st.stackMessage=false;}
  for(const date of [...st.pending]){
    try{const r=await st.flow.confirm(date);if(r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED'){stacked++;const t=rangeNoticeText(r.notices);if(t)notes.push(date+' · '+t);}else if(r.status!=='NOTHING_TO_CONFIRM'){failed++;codes.push(r.code);fails.push(rangeStackFailText(date,r.code));}}
    catch(e){failed++;codes.push(e?.code);fails.push(rangeStackFailText(date,e?.code));}
  }
  if(fails.length||notes.length){st.message=[...fails,...notes].join(' / ');st.error=fails.length>0;st.stackMessage=true;}
  return {stacked,failed,codes};
}
const fail=code=>Object.assign(new Error(code),{code});
// 단원 넣기: 여러 줄을 한 번에(오늘 묶음 1번 편집). 순서 = 그 과목의 지금 마지막 순서 다음부터.
// V9FIX L-15: 안내("한 줄에 하나")대로 줄바꿈으로만 나눈다("함수의 극한·연속"은 단원 1개).
export function splitUnits(text){return String(text??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);}
export async function addUnits(st,subjectId,names){
  if(!subjectId)throw fail('NO_SUBJECT');
  if(!names.length)throw fail('NO_UNITS');
  const proj=rangeProjection(st),last=proj.units.filter(u=>u.subjectId===subjectId).reduce((m,u)=>Math.max(m,u.order),-1);
  return st.flow.edit(st.today,c=>{names.forEach((name,i)=>c.units.push({id:st.ports.newId(),subjectId,name,order:Math.min(9999,last+1+i)}));});
}
// 진도 바꾸기: 오늘 묶음에 이 단원 줄이 이미 있으면 그 줄을 고치고(묶음이 커지지 않게), 없으면 새 줄.
export async function setPct(st,unitId,pct,now){
  if(!rangeProjection(st).units.some(u=>u.id===unitId))throw fail('UNKNOWN_UNIT');
  const date=kstDay(now);
  return st.flow.edit(date,c=>{const i=c.marks.findIndex(m=>m.unitId===unitId&&kstDay(m.at)===date);const row={id:i>=0?c.marks[i].id:st.ports.newId(),unitId,pct,at:now};if(i>=0)c.marks[i]=row;else c.marks.push(row);});
}
// 단원 지우기: 단원을 넣은 날짜 묶음에서 뺀다(그 날짜 1건). 진도 줄은 남아도 투영이 건너뛴다.
// V9FIX M-07: 화면에는 보이지만(다른 기기가 같은 날짜에 쌓음) 이 기기 초안에는 아직 없는 단원은 지우지 않고 알린다("지웠어요"라고 말하지 않음).
export async function removeUnit(st,unitId){
  const d=st.days.find(x=>x.data.units.some(u=>u.id===unitId))?.date;if(!d)throw fail('UNKNOWN_UNIT');
  if(!(await st.flow.state(d)).card.units.some(u=>u.id===unitId))throw fail('UNIT_NOT_IN_DRAFT');
  return st.flow.removeRow(d,'units',unitId);
}
// 모의고사 목표선: 오늘 묶음에 과목 줄 하나(이미 있으면 고침). 둘 다 비우면 목표 지우기.
export async function setGoal(st,subjectId,{raw=null,grade=null},now){
  const date=kstDay(now);
  return st.flow.edit(date,c=>{const i=c.goals.findIndex(g=>g.subjectId===subjectId);const row={id:i>=0?c.goals[i].id:st.ports.newId(),subjectId,raw,grade,at:now};if(i>=0)c.goals[i]=row;else c.goals.push(row);});
}
export const parseGoalNumber=(v,lo,hi)=>{const s=String(v??'').trim();if(!s)return null;const n=Number(s);if(!Number.isInteger(n)||n<lo||n>hi)throw fail('INVALID_RANGE_GOAL');return n;};

// ---- 역산 기준 시험(디데이 활성 칩) ----
export function baseExam(life,today,storage){
  const chips=ddayChips(lifeDefs(life).exams,today,readDdayActive(storage));
  return chips.find(c=>c.main)??null;
}
export function planFor(ctx,st){
  let proj;try{proj=rangeProjection(st);}catch{return null;}
  const life=ctx.getWhole().life??null,exam=baseExam(life,st.today,ctx.storage??null);
  const order=lifeDefs(life).subjects.map(s=>s.id);
  return {proj,exam,order,plan:weekPlan(proj,{today:st.today,examDate:exam?.date??null,order})};
}
// 주간 제안(지시서 1 "계획 탭 주간에 자동 제안"): 이번 주 목표 단원 중 아직 100%가 아니고 그 주 계획에 같은 이름이 없는 것을, 오늘(이번 주면) ~ 일요일에 차례로 나눈다.
// 줄 모양 = 계획 탭 줄 {subjectId, title: 단원 이름, bricks: 1, block: 'A'(오후)}. 하루 최대 4줄. 받아들이면 fillFromSuggest가 임시 입력에 넣는다(저장은 계획 "저장").
export const SUGGEST_PER_DAY=4;
// V9FIX M-06: 하루 4줄은 그날 계획에 이미 있는 줄(counts[date])까지 센다. 자리가 없으면 제안 0줄(단추 없음). L-11: 자리가 없어 뺀 수 = dropped.
export function weekSuggestion(plan,{monday,today,planned=[],counts={}}){
  if(!plan||!plan.m||monday!==plan.monday)return null;
  const have=new Set(planned.map(x=>x.subjectId+'|'+x.title));
  const todo=[];for(const s of plan.subjects)for(const u of s.targets)if(!u.done&&!have.has(s.subjectId+'|'+u.name))todo.push({subjectId:s.subjectId,title:[...u.name].slice(0,40).join(''),bricks:1,block:'A'});
  if(!todo.length)return {monday,days:[],count:0,dropped:0};
  const first=today>monday?today:monday,dates=[];for(let d=first;d<=addDays(monday,6);d=addDays(d,1))dates.push(d);
  const days=dates.map(date=>({date,items:[],room:Math.max(0,SUGGEST_PER_DAY-(Number.isInteger(counts[date])?counts[date]:0))}));
  let k=0,dropped=0;
  for(const x of todo){let put=false;for(let t=0;t<days.length&&!put;t++){const day=days[(k+t)%days.length];if(day.items.length<day.room){day.items.push(x);k=(k+t+1)%days.length;put=true;}}if(!put)dropped++;}
  const out=days.filter(d=>d.items.length).map(({date,items})=>({date,items}));
  return {monday,days:out,count:out.reduce((a,d)=>a+d.items.length,0),dropped};
}

// ---- DOM ----
const SVGNS='http://www.w3.org/2000/svg';
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const svg=(tag,attrs={},text=null)=>{const n=doc.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==null)n.textContent=String(text);return n;};
  const input=(value='',attrs={})=>{const n=el('input');n.type='text';n.value=value;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  return {el,add,button,svg,input};
}
const subjectsOf=life=>lifeDefs(life).subjects;
const nameOf=(subjects,id)=>subjects.find(s=>s.id===id)?.name??'기타';
export const PCT_STEPS=Object.freeze([0,25,50,75,100]);

// 오늘 화면 디데이 게이지 옆(지시서 1): "이번 주 목표 n/m". 단원이 없거나 시험이 지났으면 없다.
export function renderRangeToday(ctx,st){
  if(!st.flow)return null;
  const r=planFor(ctx,st);if(!r)return null;
  const line=weekGoalLine(r.plan);if(!line)return null;
  const {el,add}=maker(ctx.document??globalThis.document);
  const n=add(el('p',null,'range-today'+(r.plan.n>=r.plan.m?' done':'')),el('span','이번 주 목표','range-today-k'),el('strong',r.plan.n+'/'+r.plan.m,'range-today-n'),el('span',(r.exam?' · '+r.exam.name+'까지 '+r.plan.weeks+'주 역산':''),'range-today-t'));
  n.id='range-today';n.setAttribute('aria-label',line+' 단원'+(r.exam?' · '+r.exam.name+'까지 남은 '+r.plan.weeks+'주로 나눈 목표':''));
  return n;
}

// 계획 탭 주 보기 안(지시서 1): 이번 주 목표 제안 + [제안을 이번 주 계획에 넣기].
export function renderWeekSuggest(ctx,st,{monday,today,planned,counts,fill}){
  const r=planFor(ctx,st);if(!r||!r.plan.m)return null;
  const {el,add,button}=maker(ctx.document??globalThis.document),subjects=subjectsOf(ctx.getWhole().life??null);
  if(monday!==r.plan.monday)return null;
  const sug=weekSuggestion(r.plan,{monday,today,planned,counts:counts??{}});
  const box=add(el('div',null,'range-week'),add(el('p',null,'range-week-head'),el('strong','이번 주 목표 '+r.plan.n+'/'+r.plan.m+' 단원'),el('span',' · '+(r.exam?r.exam.name+'까지 '+r.plan.weeks+'주로 나눔':''),'muted small')));
  box.id='range-week';
  for(const s of r.plan.subjects){if(!s.m)continue;add(box,add(el('p',null,'range-week-row'),el('span',nameOf(subjects,s.subjectId),'range-week-subj'),...s.targets.map(u=>el('span',(u.done?'✓ ':'')+u.name,'range-week-unit'+(u.done?' done':'')))));}
  // V9FIX L-13: 계획 탭은 자동 저장일 수도 있어 "저장을 눌러야"라고 단정하지 않는다. M-06·L-11: 자리가 없어 뺀 단원 수를 알린다.
  const dropText=sug?.dropped?' · '+sug.dropped+'개는 남은 날 계획이 꽉 차서(하루 4줄) 넣지 않아요':'';
  if(sug&&sug.count)add(box,button('제안을 이번 주 계획에 넣기 ('+sug.count+'줄)',()=>fill({monday:sug.monday,days:sug.days}),'primary range-week-fill'),el('p','오늘부터 일요일까지 오후 칸에 단원 이름으로 나눠 넣어요(이미 있는 줄 포함 하루 4줄까지) · 넣은 줄은 계획 탭 저장 방식대로 저장돼요'+dropText+'.','muted small'));
  else add(box,el('p',r.plan.n>=r.plan.m?'이번 주 목표 단원을 모두 끝냈어요.':sug?.dropped?'남은 날 계획이 꽉 차서(하루 4줄) 더 넣을 자리가 없어요 · 목표 단원 '+sug.dropped+'개가 계획에 없어요.':'이번 주 목표 단원이 이미 계획에 있어요.','muted small range-week-none'));
  return box;
}

// 계획 탭 "수능" 보기(지시서 1·2): 과목별 남은 범위 입력 + 이번 주 목표 + 모의고사 추세.
export function renderRangePanel(root,ctx,st){
  const doc=ctx.document??globalThis.document,{el,add,button,input}=maker(doc);
  const act=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{await fn();}catch(e){st.message=st.ports?.box?.ERROR_TEXT?.[e?.code]??rangeErrorText(e?.code);st.error=true;}await prepareRange(ctx,st);await ctx.rerender();});
  const life=ctx.getWhole().life??null,subjects=subjectsOf(life).filter(s=>!s.hidden);
  const out=add(el('section',null,'plan-card range-panel'),el('h3',RANGE_TEXT.title,'panel-title'),el('p',RANGE_TEXT.sub,'muted small'));out.id='range-panel';
  const r=planFor(ctx,st);
  if(!r){add(out,el('p','범위를 계산하지 못했어요(기록 값 확인 필요).','notice error'));root.append(out);return out;}
  if(st.message)add(out,el('p',st.message,st.error?'notice error range-message':'notice range-message'));
  if(st.pending.length)add(out,el('p','아직 안 쌓은 범위 입력 '+st.pending.length+'일치 · 이 기기에만 있어요 · 위 "지금 쌓기"로 저장 · 공부 범위는 새 기록이라 다른 기기도 최신 앱이어야 보여요','notice range-pending'));   // V9FIX M-10
  const p=r.plan;
  add(out,add(el('div',null,'range-sum'),
    add(el('p',null,'range-sum-cell'),el('strong',r.exam?r.exam.name:'시험 없음'),el('span',r.exam?'역산 기준 · '+r.exam.date:'다가올 시험이 없어요 · 습관 편집에서 다음 시험을 넣으면 역산해요')),   // V9FIX L-05
    add(el('p',null,'range-sum-cell'),el('strong',p.weeks+'주'),el('span','남은 주(이번 주 포함)')),
    add(el('p',null,'range-sum-cell'),el('strong',p.m?p.n+'/'+p.m:'-'),el('span','이번 주 목표 단원'))));
  // 과목 고르기 + 단원 넣기(여러 줄)
  const pick=st.subject&&subjects.some(s=>s.id===st.subject)?st.subject:subjects[0]?.id??null;st.subject=pick;
  const chips=add(el('div',null,'buttons range-chips'),...subjects.map(s=>{const b=button(s.name,()=>{st.subject=s.id;void ctx.rerender();},s.id===pick?'primary range-chip':'secondary range-chip');b.setAttribute('aria-pressed',String(s.id===pick));return b;}));
  const area=el('textarea');area.value=st.text??'';area.rows=3;area.className='range-text';area.setAttribute('placeholder','남은 단원 한 줄에 하나(예: 수열\n지수함수와 로그함수)');area.setAttribute('aria-label','넣을 단원(한 줄에 하나)');
  area.addEventListener('input',()=>{st.text=area.value;});
  add(out,el('h4','남은 단원 넣기','range-h'),chips,area,button('단원 넣기',act(async()=>{const names=splitUnits(area.value);await addUnits(st,pick,names);st.text='';st.message=nameOf(subjects,pick)+' 단원 '+names.length+'개를 넣었어요(임시 입력).';}),'primary range-add'));
  // 과목별 단원·진도
  const rows=subjectRows(r.proj,r.order);
  if(!rows.length)add(out,el('p',RANGE_TEXT.empty,'muted range-empty'));
  for(const s of rows){
    const ws=p.subjects.find(x=>x.subjectId===s.subjectId),targets=new Set((ws?.targets??[]).map(u=>u.id));
    const det=add(el('details',null,'range-subject'),add(el('summary',null,'range-subject-sum'),el('strong',nameOf(subjects,s.subjectId)),el('span',' 진도 '+s.pct+'% · 끝낸 단원 '+s.done+'/'+s.units.length+(ws?.m?' · 이번 주 '+ws.n+'/'+ws.m:''),'muted small')));
    det.open=st.open===s.subjectId;det.addEventListener('toggle',()=>{if(det.open)st.open=s.subjectId;else if(st.open===s.subjectId)st.open=null;});
    const bar=maker(doc).svg('svg',{class:'range-bar',width:'100%',height:8,'aria-hidden':'true'});bar.append(maker(doc).svg('rect',{class:'range-bar-bg',x:0,y:0,width:'100%',height:8,rx:3}));if(s.pct>0)bar.append(maker(doc).svg('rect',{class:'range-bar-fill',x:0,y:0,width:s.pct+'%',height:8,rx:3,fill:subjectColor(s.subjectId,subjects)}));
    add(det,bar);
    for(const u of s.units){
      const line=add(el('div',null,'range-unit'+(u.pct>=100?' done':'')+(targets.has(u.id)?' target':'')),el('span',(targets.has(u.id)?'이번 주 · ':'')+u.name,'range-unit-name'),el('span',u.pct+'%','range-unit-pct'));
      line.dataset.unitId=u.id;
      const steps=add(el('span',null,'buttons range-steps'),...PCT_STEPS.map(v=>{const b=button(v+'%',act(async()=>{await setPct(st,u.id,v,ctx.now());st.open=s.subjectId;st.message=u.name+' 진도 '+v+'%(임시 입력).';}),v===u.pct?'primary range-step':'secondary range-step');b.setAttribute('aria-pressed',String(v===u.pct));b.setAttribute('aria-label',u.name+' 진도 '+v+'%');return b;}),
        button('삭제',()=>{if(ctx.confirmDialog?.('이 단원을 지울까요? 쌓은 뒤에도 이력에는 남아요.')??true)void act(async()=>{await removeUnit(st,u.id);st.open=s.subjectId;st.message='단원을 지웠어요(임시 입력).';})();},'secondary range-del'));
      add(det,add(line,steps));
    }
    add(out,det);
  }
  add(out,el('p',RANGE_TEXT.stack,'muted small range-stack-note'));
  if(r.proj.duplicates.length)add(out,el('p','같은 번호가 겹친 항목 '+r.proj.duplicates.length+'건은 계산에서 뺐어요.','muted small'));
  root.append(out);
  add(root,renderTrend(ctx,st,r.proj,act));
  return out;
}

// 모의고사 추세(지시서 2): 과목별 작은 선 그래프. 가로 = 응시일 순 시험, 세로 = 원점수(0~100, 위가 높음) 또는 등급(1~9, 위가 1등급). 목표선 = 점선 + 글자.
export const TREND_W=360,TREND_H=130,TREND_PAD=Object.freeze({l:28,r:50,t:16,b:20});   // 오른쪽 여백 = 목표선 글자 자리(점 숫자와 겹치지 않게)
export function trendPoints(points,n,metric){
  const {l,r,t,b}=TREND_PAD,w=TREND_W-l-r,h=TREND_H-t-b;
  const x=i=>l+(n<=1?w/2:i*w/(n-1)),y=v=>metric==='grade'?t+(v-1)/8*h:t+(100-v)/100*h;
  return {x,y,pts:points.map(p=>({...p,cx:Math.round(x(p.i)*10)/10,cy:Math.round(y(p.value)*10)/10}))};
}
function renderTrend(ctx,st,proj,act){
  const doc=ctx.document??globalThis.document,{el,add,button,svg,input}=maker(doc);
  const life=ctx.getWhole().life??null,defs=lifeDefs(life),subjects=defs.subjects,results=(life?.results??[]).map(r=>({...r.data,id:r.id}));
  const metric=st.metric==='grade'?'grade':'raw',t=examTrend(results,{metric});
  const out=add(el('section',null,'plan-card range-trend'),el('h3',RANGE_TEXT.trend,'panel-title'),el('p',RANGE_TEXT.trendSub,'muted small'));out.id='range-trend';
  add(out,add(el('div',null,'buttons range-metric'),...[['raw','원점수'],['grade','등급']].map(([k,text])=>{const b=button(text,()=>{st.metric=k;void ctx.rerender();},k===metric?'primary':'secondary');b.setAttribute('aria-pressed',String(k===metric));return b;})));
  if(!t.subjects.length){add(out,el('p',results.length?'이 기준('+(metric==='grade'?'등급':'원점수')+')으로 적은 결과가 없어요.':'아직 모의고사 결과가 없어요 · 계획 탭 위 "모의고사 결과 넣기"로 넣으면 여기 그래프가 생겨요.','muted range-trend-empty'));}
  const names=new Map(defs.exams.items.map(x=>[x.id,x.name.replace(/\(.*\)/,'')]));
  const order=s=>subjects.find(x=>x.id===s.subjectId)?.order??999;
  for(const s of [...t.subjects].sort((a,b)=>order(a)-order(b))){
    const name=nameOf(subjects,s.subjectId),color=subjectColor(s.subjectId,subjects),goal=proj.goals[s.subjectId]??null,gv=goal?(metric==='grade'?goal.grade:goal.raw):null;
    const g=trendPoints(s.points,t.exams.length,metric);
    const chart=svg('svg',{class:'range-chart',viewBox:'0 0 '+TREND_W+' '+TREND_H,width:'100%',role:'img','aria-label':name+' '+(metric==='grade'?'등급':'원점수')+' 추세 · '+s.points.map(p=>p.value+(metric==='grade'?'등급':'점')).join(', ')+(gv!==null?' · 목표 '+gv+(metric==='grade'?'등급':'점'):'')});
    const ticks=metric==='grade'?[1,3,5,7,9]:[0,25,50,75,100];
    for(const v of ticks){const yy=g.y(v);chart.append(svg('line',{class:'range-grid',x1:TREND_PAD.l,y1:yy,x2:TREND_W-TREND_PAD.r,y2:yy}),svg('text',{class:'range-tick',x:TREND_PAD.l-4,y:yy+3},String(v)));}
    if(gv!==null){const yy=g.y(gv);chart.append(svg('line',{class:'range-goal',x1:TREND_PAD.l,y1:yy,x2:TREND_W-TREND_PAD.r,y2:yy,stroke:color}),svg('text',{class:'range-goal-text',x:TREND_W-TREND_PAD.r+4,y:yy+3},'목표 '+gv+(metric==='grade'?'등급':'점')));}   // 목표선 = 과목 색 점선(실선 그래프와 무늬로 구분)
    if(g.pts.length>1)chart.append(svg('polyline',{class:'range-line',points:g.pts.map(p=>p.cx+','+p.cy).join(' '),stroke:color,fill:'none'}));
    for(const p of g.pts){chart.append(svg('circle',{class:'range-dot',cx:p.cx,cy:p.cy,r:3.5,stroke:color}),svg('text',{class:'range-val',x:p.cx,y:p.cy-6},String(p.value)));}
    t.exams.forEach((x,i)=>chart.append(svg('text',{class:'range-xlab',x:g.x(i),y:TREND_H-6},(names.get(x.examId)??'').slice(0,4)||x.takenOn.slice(5).replace('-','/'))));
    const arrow=el('span',trendText(s,metric),'range-arrow '+s.trend.toLowerCase());    const vs=s.prevSkipped&&s.prevTakenOn?el('span',' ('+Number(s.prevTakenOn.slice(5,7))+'/'+Number(s.prevTakenOn.slice(8,10))+' 시험 대비)','muted small range-arrow-vs'):null;   // V9FIX L-17: 직전 시험에 이 과목이 없으면 비교한 시험 날짜
    const gap=gv!==null?(metric==='grade'?s.last-gv:gv-s.last):null;
    const card=add(el('div',null,'range-trend-card'),add(el('p',null,'range-trend-head'),el('strong',name),el('span',' 최근 '+s.last+(metric==='grade'?'등급':'점'),'range-trend-last'),arrow,vs,
      gap!==null?el('span',gap<=0?' · 목표 도달':' · 목표까지 '+gap+(metric==='grade'?'등급':'점'),'range-trend-gap'):null),chart);
    card.dataset.subjectId=s.subjectId;add(out,card);
  }
  // 목표선 설정(과목별, 이 종류 goals에 저장 = 오늘 묶음 초안)
  const set=add(el('details',null,'range-goals'),el('summary','목표선 설정','range-goals-sum'));
  for(const s of subjects.filter(x=>!x.hidden&&x.exam)){
    const cur=proj.goals[s.id]??null,raw=input(cur?.raw===null||cur?.raw===undefined?'':String(cur.raw),{inputmode:'numeric',maxlength:'3','aria-label':s.name+' 목표 원점수',placeholder:'원점수'}),gr=input(cur?.grade===null||cur?.grade===undefined?'':String(cur.grade),{inputmode:'numeric',maxlength:'1','aria-label':s.name+' 목표 등급',placeholder:'등급'});
    add(set,add(el('div',null,'range-goal-row'),el('span',s.name,'range-goal-name'),raw,el('span','점','muted small'),gr,el('span','등급','muted small'),
      button('저장',act(async()=>{await setGoal(st,s.id,{raw:parseGoalNumber(raw.value,0,100),grade:parseGoalNumber(gr.value,1,9)},ctx.now());st.message=s.name+' 목표선을 바꿨어요(임시 입력).';}),'secondary range-goal-save')));
  }
  add(out,set);
  return out;
}
