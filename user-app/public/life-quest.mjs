// 퀘스트 묶음 (Q1A, 설계 Q1D §4). 판정은 XP와 함께 계산해야 해서 성취 엔진(life-achieve)이 하고, 이 모듈은 오늘 줄 요약과 내 퀘스트 1칸 저장 경로를 맡는다.
// 내 퀘스트는 새 기록 종류가 아니라 고정 id uq-1인 COUNT·주 단위 습관 하나다: 옛 빌드도 받고 오늘 격자의 +1을 그대로 쓴다. 보너스 벽돌·업적 없이 기존 습관 XP와 주간 목표 +15만 받는다.
import {MY_QUEST_ID} from './life-achieve.mjs';
import {collectRows,saveDefinitions} from './life-flow.mjs';
import {HABIT_AREAS,EMPTY_LIFE_VIEW,LIFE_LIMITS,MAX_NAME,MAX_GOAL_BRICKS,GAME_PROFILE_ID,lifeDefs,openRecordsDoor,recordsDoorState,requireRecordsDoor,shiftDay,validateLifeData} from './life-model.mjs';
import {rebaseRecord,stable} from './life-rebase.mjs';
import {maker,planErrorText,unknownOutcome,PLAN_NOTICE_TEXT} from './life-plan.mjs';
export {DEFS_SEALED_TEXT} from './life-flow.mjs';

export const MY_QUEST_REASON='내 퀘스트 저장';
const questError=code=>Object.assign(new Error(code),{code});
// 보이는 글자가 하나도 없는 이름: 제어·글자 방향·폭 없는 문자, 공백, 결합 부호, 점자 빈칸만 있는 경우(H37-Q6). 보이는 글자가 섞이면 통과한다(textContent로만 나간다).
const NO_VISIBLE_TEXT=/^[\p{C}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}⠀]*$/u;
// 보이는 글자가 섞여도 제어문자·글자 방향 문자·줄 구분 문자는 저장 전에 뺀다(FIX38, H37-Q6 남은 것). 이모지·한글 조합에 쓰는 ZWJ·ZWNJ(200C·200D)는 둔다.
const STRIP_FROM_NAME=/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/gu;
export const cleanQuestName=name=>String(name??'').replace(STRIP_FROM_NAME,'').trim();

// 오늘 퀘스트 한 줄. 값은 쌓은 기록 기준이다: 쌓기 전 입력으로만 채워지면(preview) pending("쌓으면 완료").
export function todayQuestLine(ach,preview=null){
  const items=(ach.todayDay.daily??[]).map(q=>{
    const after=preview?.todayDay?.daily?.find(x=>x.id===q.id)??null;
    return {id:q.id,label:q.label,state:q.done?'done':after?.done?'pending':'todo'};
  });
  return {done:items.filter(q=>q.state==='done').length,total:items.length,items};
}

export const myQuestOf=life=>lifeDefs(life).habits.find(h=>h.id===MY_QUEST_ID)??null;
// 저장할 줄. 저장된 습관이 없는 상태면 기본 13개 + 1개를 함께 저장한다(하나만 쓰면 기본 습관이 화면에서 사라진다). 있으면 uq-1 한 줄만.
export function myQuestRows(life,{name,count,area='HEAD',hidden=false}){
  const view=life??EMPTY_LIFE_VIEW,defs=lifeDefs(view),label=cleanQuestName(name);
  if(NO_VISIBLE_TEXT.test(label)||[...label].length>MAX_NAME)throw questError('INVALID_LIFE_TEXT');
  if(!Number.isInteger(count)||count<1||count>99)throw questError('INVALID_HABIT_TARGET');
  if(!HABIT_AREAS.includes(area))throw questError('INVALID_HABIT_DEF');
  const old=defs.habits.find(h=>h.id===MY_QUEST_ID)??null;
  if(!old&&defs.habits.length>=LIFE_LIMITS.HABIT_DEF)throw questError('APP_ENTITY_LIMIT');
  const def={id:MY_QUEST_ID,name:label,kind:'COUNT',target:{time:null,minutes:null,count,per:'WEEK'},difficulty:'AUTO',hidden:Boolean(hidden),order:old?old.order:defs.habits.length,area};
  validateLifeData('HABIT_DEF',MY_QUEST_ID,def);
  const habits=old?defs.habits.map(h=>h.id===MY_QUEST_ID?def:h):[...defs.habits,def];
  return collectRows({habits,subjects:defs.subjects,exams:defs.exams},view,defs);
}
// 소유자가 저장을 눌렀을 때만 부른다. 돌려주는 값 = 실제로 저장한 개수. memo.sealed = 그중 임시 저장(봉인 초안)된 줄 수(saveDefinitions).
export function saveMyQuest(ctx,spec,memo){return saveDefinitions(ctx,myQuestRows(ctx.getWhole().life??null,spec),MY_QUEST_REASON,memo);}

// ---- 새 기록(D46, D49) 저장 경로: PLAN_GOAL·EXAM_RESULT·GAME_PROFILE·WEEK_REVIEW는 아래 저장 함수로만 쓴다. 소유자가 저장을 눌렀을 때만 부른다 ----
// 쓰기 문이 닫혀 있으면 아무것도 쓰지 않고 RECORDS_DOOR_CLOSED를 던진다. savePlanDay와 같게: 최신이 편집을 시작한 때와 다르면 3자 병합, STALE_HEADS면 다시 받아 최대 3번, 합친 결과는 검사기를 다시 통과해야 쓴다.
// 임시 저장 모드에서는 봉인 초안으로만 들어간다: sealed:true와 RECORD_LOCAL_DRAFT를 돌려주므로 부른 쪽은 성공으로 말하지 말고 입력을 남긴다.
const recordError=code=>Object.assign(new Error(code),{code});
const storageOf=ctx=>{try{return ctx.storage??globalThis.localStorage;}catch{return null;}};   // 저장소가 막힌 브라우저는 읽기만으로 던진다
function recordRow(life,type,id){
  if(type==='PLAN_GOAL')return (life?.goals??[]).find(x=>x.id===id)??null;
  if(type==='EXAM_RESULT')return (life?.results??[]).find(x=>x.id===id)??null;
  if(type==='WEEK_REVIEW')return (life?.weekReviews??[]).find(x=>x.id===id)??null;
  return life?.profile??null;
}
const recordEmpty=(type,d)=>type==='PLAN_GOAL'?d.goals.length===0:type==='WEEK_REVIEW'?d.pick===null&&!d.next.trim():type==='EXAM_RESULT'&&d.scores.length===0;
async function saveRecord(ctx,type,id,{base=null,mine},reason){
  const whole=ctx.getWhole();
  requireRecordsDoor({life:whole.life,study:whole.study,storage:storageOf(ctx)});
  validateLifeData(type,id,mine);
  for(let attempt=1;attempt<=3;attempt++){
    const row=recordRow(ctx.getWhole().life,type,id),latest=row?.data??null;
    let data=mine,notices=[];
    if(type!=='GAME_PROFILE'&&stable(latest)!==stable(base)){   // 칭호는 값 하나라 나중 저장이 남는다
      const rb=rebaseRecord(type,{id,base,mine,latest});
      if(rb.status==='REJECTED')throw recordError(rb.code);
      if(rb.status==='ALREADY_APPLIED')return {status:'ALREADY_APPLIED',notices:rb.notices};
      data=rb.data;notices=rb.notices;
    }else if(latest&&stable(latest)===stable(mine))return {status:'ALREADY_APPLIED',notices:[]};
    if(!latest&&recordEmpty(type,data))return {status:'ALREADY_APPLIED',notices};   // 없는 기록을 빈 채로 만들지 않는다
    let w;
    try{w=await ctx.entity(type,id,data,row?[...row.heads]:[],reason);}
    catch(e){if(e?.code==='STALE_HEADS'&&attempt<3&&ctx.reload){await ctx.reload();continue;}throw e;}
    if(w?.status==='LOCAL_DRAFT')return {status:'SAVED',sealed:true,notices:[...notices,{code:'RECORD_LOCAL_DRAFT'}],data};
    return {status:'SAVED',notices,data};
  }
  throw recordError('STALE_HEADS');
}
export function savePlanGoal(ctx,{monday,base,mine}){return saveRecord(ctx,'PLAN_GOAL',monday,{base,mine},'주간 목표 저장');}
export function saveExamResult(ctx,{id,base,mine}){return saveRecord(ctx,'EXAM_RESULT',id,{base,mine},'모의고사 결과 저장');}
export function saveGameProfile(ctx,titleId){return saveRecord(ctx,'GAME_PROFILE',GAME_PROFILE_ID,{mine:{titleId}},'칭호 저장');}
export function saveWeekReview(ctx,{monday,base,mine}){return saveRecord(ctx,'WEEK_REVIEW',monday,{base,mine},'주간 리뷰 저장');}   // 사유는 고정 문구만(이력에 그대로 보인다)

// ---- 새 기록 화면(FIX46B, D46 4.2·6.1·6.2). 앱이 포트로 넘겨 설정·계획 탭에 그린다. 화면 규칙: DOM 생성 함수만. 쓰기는 시트의 "저장" 버튼에서 위 저장 함수로만 ----
export const DOOR_TITLE='새 기록 (모의고사·주간 목표) · 일기',DOOR_BUTTON='4기기 업데이트 확인하고 켜기',DOOR_WAIT='4기기 업데이트 뒤 켜기';
export const DOOR_CONFIRM='PC·노트북·Fold·iPad를 모두 r48 이상으로 올렸나요? 켜면 옛 버전 앱은 이 기록을 만나면 멈춥니다(지워지지는 않음)';
const doorOf=ctx=>{const w=ctx.getWhole();return recordsDoorState({life:w?.life??null,study:w?.study??null,storage:storageOf(ctx)});};
export const recordsOpen=ctx=>doorOf(ctx).open;
export function doorStateText(s){return s.vault?'켜짐 · 새 기록이 이미 있어 이 기기도 켜졌습니다':s.device?'켜짐 · 이 기기에서 켰습니다':'꺼짐 · 네 기기를 모두 올린 뒤 한 곳에서 켜면 됩니다';}
// 설정의 한 줄. 이 줄이 보이면 그 기기는 새 빌드다. 켜기는 이 기기 저장소만 바꾸고 서버 쓰기는 0이다. 끄는 길은 없다.
export function renderRecordsDoor(ctx){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,s=doorOf(ctx);
  const out=add(el('section',null,'panel records-door'),el('h2',DOOR_TITLE,'panel-title'),el('p',doorStateText(s),'muted small records-door-state'));
  if(!s.open)add(out,button(DOOR_BUTTON,()=>{if(!(ctx.confirmDialog?.(DOOR_CONFIRM)??false))return;openRecordsDoor(storageOf(ctx));void ctx.rerender();},'primary records-door-open'));
  return out;
}
const num=v=>Number.isInteger(v)?String(v):v.toFixed(1);
// 1장 = 30분. "10장 (5시간)", "1.5장 (45분)", "2.5장 (1시간 15분)"
export const brickText=v=>{const min=v*30,h=Math.floor(min/60),m=min%60;return num(v)+'장 ('+[h?h+'시간':null,m?m+'분':null].filter(Boolean).join(' ')+')';};
const noticeOf=n=>PLAN_NOTICE_TEXT[n.code]?n:null;
// 시트 저장 공통: 닫고 저장한 뒤 성공이면 알림을 넘긴다. 오류·임시 저장은 입력을 남긴 채 같은 시트를 다시 연다(savePlanDay 시트와 같은 방식). 결과를 모르면 앱의 perform으로 넘긴다.
function saveFromSheet(ctx,{title,body,err,close,run,done,report}){
  close();
  void ctx.perform(async()=>{
    const reopen=text=>{err.textContent=text;err.hidden=false;if(!ctx.locked?.())ctx.sheet?.(title,body);};
    let r;
    try{r=await run();}
    catch(e){await ctx.rerender();reopen(planErrorText(e?.code));if(unknownOutcome(e?.code))throw e;return;}
    if(r.sealed){await ctx.rerender();reopen(PLAN_NOTICE_TEXT.RECORD_LOCAL_DRAFT);return;}
    report(done(r),false,r.notices.filter(noticeOf));await ctx.rerender();
  });
}

// ----- 과목 주간 목표(D46 6.1) -----
export const goalRow=(life,monday)=>(life?.goals??[]).find(x=>x.id===monday)??null;
// 목표 대비 = Σ min(실제, 목표) / Σ 목표. 계획 달성률과 분모를 섞지 않는다. 목표가 없으면 null.
export function goalProgress(goals,actual){
  const rows=goals.map(g=>({...g,actual:actual?.get(g.subjectId)??0})),total=rows.reduce((s,r)=>s+r.bricks,0),got=rows.reduce((s,r)=>s+Math.min(r.actual,r.bricks),0);
  return {rows,total,got,rate:total>0?got/total:null};
}
export const stepGoal=(v,d)=>Math.min(MAX_GOAL_BRICKS,Math.max(0,v+d));
export function renderWeekGoals(ctx,{monday,state,subjects,actual,report}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,head=state==='NOW'?'이번 주 과목 목표':'이 주 과목 목표',out=el('div',null,'pw-goals');
  if(!recordsOpen(ctx))return add(out,el('p',head+' · '+DOOR_WAIT,'muted small pw-goal-wait'));
  const life=ctx.getWhole().life??null,row=goalRow(life,monday),p=goalProgress(row?.data.goals??[],actual),names=new Map(lifeDefs(life).subjects.map(s=>[s.id,s.name]));
  add(out,el('strong',head,'pw-goal-head'));
  if(p.rate!==null)add(out,el('p','목표 대비 '+Math.round(p.rate*100)+'% ('+num(p.got)+' / '+num(p.total)+'장)','plan-sum pw-goal-rate'));
  for(const r of p.rows)add(out,el('p',(names.get(r.subjectId)??'기타')+' '+num(r.actual)+' / '+brickText(r.bricks),'muted small pw-goal-line'));
  if(state==='PAST'){if(p.rate===null)add(out,el('p','이 주에는 정한 목표가 없습니다.','muted small'));return out;}   // 지난 주는 보기만 한다
  return add(out,button(row?'목표 고치기':'목표 정하기',()=>openGoalSheet(ctx,{monday,subjects,names,report}),'secondary pw-goal-edit'));
}
function openGoalSheet(ctx,{monday,subjects,names,report}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,life=ctx.getWhole().life??null,base=structuredClone(goalRow(life,monday)?.data??null),last=goalRow(life,shiftDay(monday,-7))?.data??null;
  const values=new Map((base?.goals??[]).map(g=>[g.subjectId,g.bricks]));
  const ids=()=>[...new Set([...subjects.map(s=>s.id),...values.keys()])];   // 숨긴 과목에 있던 목표도 지우지 않고 줄로 남긴다
  const body=el('div',null,'pt-sheet pw-goal-sheet'),err=el('p',null,'notice error pw-goal-error'),rows=el('div',null,'pw-goal-rows');err.hidden=true;
  const draw=()=>{
    rows.replaceChildren();
    for(const id of ids()){
      const v=values.get(id)??0,set=d=>()=>{const n=stepGoal(v,d);if(n>0)values.set(id,n);else values.delete(id);draw();};
      const r=add(el('div',null,'pw-goal-row'),el('span',names.get(id)??'기타','pw-goal-name'),button('−',set(-0.5),'secondary pw-goal-minus'),el('strong',v>0?brickText(v):'없음','pw-goal-value'),button('+',set(0.5),'secondary pw-goal-plus'));
      r.dataset.subjectId=id;add(rows,r);
    }
    if(!ids().length)add(rows,el('p','보이는 과목이 없습니다.','muted small'));
  };
  draw();
  const title='과목 목표 · '+Number(monday.slice(5,7))+'/'+Number(monday.slice(8,10))+' 주';
  let dlg=null;
  const like=button('지난주처럼',()=>{values.clear();for(const g of last.goals)values.set(g.subjectId,g.bricks);err.hidden=true;draw();},'secondary pw-goal-last');
  if(!last?.goals.length){like.disabled=true;like.setAttribute('aria-disabled','true');}
  const save=button('저장',()=>{
    const mine={monday,goals:ids().filter(id=>values.has(id)).map(id=>({subjectId:id,bricks:values.get(id)}))};
    try{validateLifeData('PLAN_GOAL',monday,mine);}catch(e){err.textContent=planErrorText(e?.code);err.hidden=false;return;}
    saveFromSheet(ctx,{title,body,err,close:()=>dlg?.close?.(),run:()=>savePlanGoal(ctx,{monday,base,mine}),done:r=>r.status==='SAVED'?'과목 목표를 저장했습니다.':'이미 같은 목표가 저장되어 있습니다.',report});
  },'primary pw-goal-save');
  add(body,el('p','과목마다 0.5장씩 정합니다 · 1장 = 30분 · 없음은 저장하지 않습니다','muted small'),add(el('div',null,'buttons'),like,save),err,rows);
  dlg=ctx.sheet?.(title,body)??null;
  return {body,values,save};
}

// ----- 모의고사 결과(D46 6.2): 시험 하나에 1건. 빈칸은 저장하지 않고, 네 칸이 모두 빈 과목은 줄을 만들지 않는다. 시험 이름은 저장하지 않고 일정에서 찾는다. -----
export const SCORE_FIELDS=Object.freeze([['raw','원점수'],['std','표준점수'],['pct','백분위'],['grade','등급']]);
export const resultName=(r,exams)=>exams.items.find(x=>x.id===r.id)?.name??'지난 시험';
// 칸 글자 → 값. 빈칸은 null, 숫자가 아니면 NaN(검사기가 INVALID_EXAM_SCORE로 거절).
export const scoreValue=text=>{const t=String(text??'').trim();return t===''?null:/^\d{1,3}$/.test(t)?Number(t):NaN;};
export function scoresFrom(inputs){
  const out=[];
  for(const [subjectId,cells] of inputs){const line={subjectId};for(const [k] of SCORE_FIELDS)line[k]=scoreValue(cells[k]);if(SCORE_FIELDS.some(([k])=>line[k]!==null))out.push(line);}
  return out;
}
// 고를 시험: 일정 + 일정에서 지운 시험의 결과. 먼저 고를 것 = 오늘 또는 그 전의 가장 최근 시험, 없으면 가장 가까운 시험.
export function examChoices(exams,results,today){
  const sched=[...exams.items].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0).map(x=>({id:x.id,name:x.name,date:x.date,examId:x.id}));
  const gone=results.filter(r=>!exams.items.some(x=>x.id===r.id)).map(r=>({id:r.id,name:'지난 시험',date:r.data.takenOn,examId:r.data.examId}));
  const all=[...sched,...gone],past=sched.filter(x=>x.date<=today);
  return {all,first:past[past.length-1]??sched[0]??all[0]??null};
}
// 등급 추이 표: 응시일 순 최근 limit회, 등급을 적은 과목만.
export function gradeTrend(results,exams,subjects,limit=6){
  const cols=[...results].sort((a,b)=>a.data.takenOn<b.data.takenOn?-1:a.data.takenOn>b.data.takenOn?1:0).slice(-limit),ids=[];
  for(const c of cols)for(const s of c.data.scores)if(s.grade!==null&&!ids.includes(s.subjectId))ids.push(s.subjectId);
  const names=new Map(subjects.map(s=>[s.id,s]));ids.sort((a,b)=>(names.get(a)?.order??999)-(names.get(b)?.order??999));
  return {cols:cols.map(c=>({id:c.id,name:resultName(c,exams).replace(/\(.*\)/,''),date:c.data.takenOn})),rows:ids.map(id=>({subjectId:id,name:names.get(id)?.name??'기타',grades:cols.map(c=>c.data.scores.find(s=>s.subjectId===id)?.grade??null)}))};
}
export function renderExamResults(ctx,{exams,today,report}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,out=el('div',null,'plan-results');
  if(!recordsOpen(ctx))return add(out,el('p','모의고사 결과 · '+DOOR_WAIT,'muted small plan-result-wait'));
  const life=ctx.getWhole().life??null,results=life?.results??[],subjects=lifeDefs(life).subjects;
  const open=id=>openExamSheet(ctx,{exams,today,report,id});
  add(out,button('모의고사 결과 넣기',()=>open(null),'secondary plan-result-add'));
  if(!results.length)return out;
  const box=add(el('details',null,'plan-result-list'),el('summary','모의고사 결과 '+results.length+'건'));
  for(const r of results){const b=button(resultName(r,exams)+' · '+r.data.takenOn+' · '+r.data.scores.length+'과목',()=>open(r.id),'secondary plan-result-row');b.dataset.resultId=r.id;add(box,b);}
  const t=gradeTrend(results,exams,subjects);
  if(t.rows.length){
    const table=el('table',null,'plan-result-trend'),head=el('tr');table.setAttribute('aria-label','과목별 등급 추이');
    add(head,el('th','과목'),...t.cols.map(c=>el('th',c.name)));add(table,head);
    for(const r of t.rows)add(table,add(el('tr'),el('th',r.name),...r.grades.map(g=>el('td',g===null?'-':g+'등급'))));
    add(box,el('strong','과목별 등급 추이','plan-result-head'),table);
  }
  return add(out,box);
}
function openExamSheet(ctx,{exams,today,report,id=null}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,life=ctx.getWhole().life??null,results=life?.results??[],defs=lifeDefs(life),{all,first}=examChoices(exams,results,today);
  const body=el('div',null,'pt-sheet plan-result-sheet'),err=el('p',null,'notice error plan-result-error'),picks=el('div',null,'pt-chips plan-result-picks'),form=el('div',null,'plan-result-form');err.hidden=true;
  let pick=all.find(x=>x.id===id)??first,dlg=null,read=null;
  const title='모의고사 결과';
  const draw=()=>{
    picks.replaceChildren();form.replaceChildren();err.hidden=true;
    for(const x of all){const b=button(x.name.replace(/\(.*\)/,''),()=>{pick=x;draw();},'lb-chip plan-result-pick'+(x.id===pick?.id?' selected':''));b.setAttribute('aria-pressed',String(x.id===pick?.id));b.dataset.examId=x.id;add(picks,b);}
    if(!pick){add(form,el('p','시험 일정이 없습니다. 오늘 탭의 습관 편집에서 추가하세요.','muted small'));read=null;return;}
    const row=results.find(r=>r.id===pick.id)??null,old=new Map((row?.data.scores??[]).map(s=>[s.subjectId,s]));
    const ids=[...new Set([...defs.subjects.filter(s=>s.exam&&!s.hidden).map(s=>s.id),...old.keys()])],names=new Map(defs.subjects.map(s=>[s.id,s.name]));
    const date=el('input');date.type='text';date.value=row?.data.takenOn??pick.date;date.setAttribute('maxlength','10');date.setAttribute('inputmode','numeric');date.setAttribute('aria-label','시험 본 날');date.disabled=pick.examId===null;   // 일정 밖 시험은 날짜가 곧 기록 이름이라 고치지 않는다
    add(form,add(el('label',null,'plan-result-date'),el('span','시험 본 날'),date));
    const table=el('table',null,'plan-result-table'),headRow=el('tr'),cells=new Map();
    add(headRow,el('th','과목'),...SCORE_FIELDS.map(([,t])=>el('th',t)));add(table,headRow);
    for(const sid of ids){
      const tr=el('tr'),slot={};tr.dataset.subjectId=sid;add(tr,el('th',names.get(sid)??'기타'));
      for(const [k,t] of SCORE_FIELDS){const n=el('input');n.type='text';n.setAttribute('inputmode','numeric');n.setAttribute('maxlength','3');n.setAttribute('aria-label',(names.get(sid)??'기타')+' '+t);n.dataset.field=k;n.value=old.get(sid)?.[k]??'';slot[k]=n;add(tr,add(el('td'),n));}
      cells.set(sid,slot);add(table,tr);
    }
    add(form,table);
    read=()=>({base:row?structuredClone(row.data):null,mine:{examId:pick.examId,takenOn:date.value.trim(),scores:scoresFrom([...cells].map(([sid,slot])=>[sid,Object.fromEntries(SCORE_FIELDS.map(([k])=>[k,slot[k].value]))]))}});
  };
  draw();
  const save=button('저장',()=>{
    if(!read)return;
    const {base,mine}=read(),rid=mine.examId??pick.id;
    if(!mine.scores.length&&!base){err.textContent='적은 점수가 없습니다. 한 칸 이상 적어 주세요.';err.hidden=false;return;}
    try{validateLifeData('EXAM_RESULT',rid,mine);}catch(e){err.textContent=planErrorText(e?.code);err.hidden=false;return;}
    saveFromSheet(ctx,{title,body,err,close:()=>dlg?.close?.(),run:()=>saveExamResult(ctx,{id:rid,base,mine}),done:r=>r.status==='SAVED'?'모의고사 결과를 저장했습니다.':'이미 같은 결과가 저장되어 있습니다.',report});
  },'primary plan-result-save');
  add(body,picks,el('p','빈칸은 비워 두면 됩니다 · 등급만 적어도 저장됩니다','muted small'),add(el('div',null,'buttons'),save),err,form);
  dlg=ctx.sheet?.(title,body)??null;
  return {body,save};
}
