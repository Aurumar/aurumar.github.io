// 다음 주 제안 (B61, V3 §8·마스터 ⑨): 계획 탭의 카드 하나. 앱 안 기본 진단(AI 아님) + 사령부 공부 진단 보고(*_study.md) 최신 1장 + 그 안의 제안 표를 다음 주 초안에 담기.
// 이 모듈은 아무것도 쓰지 않고 시계·난수·저장소·외부 통신을 쓰지 않는다. 보고 읽기는 부른 쪽이 넘긴 request로만(PC 앱만, B47 경로), 글은 textContent로만 넣는다.
// 초안은 부른 쪽이 넘긴 st 메모리에만 있다(연산 0). 기록은 소유자가 날짜별로 계획 편집 시트의 "저장"을 누를 때만 savePlanDay로 PLAN_DAY 1개가 된다(연산 1).
// 제안 표 형식 정본: AUTOPILOT\design\STUDY_SUGGEST_FORMAT_V1.md
import {lifeDefs,shiftDay,kstDate,subjectOfSession,BRICK_MINUTES,MAX_PLAN_BRICKS} from './life-model.mjs';
import {achieve,SUBJECT_BY_CODE} from './life-achieve.mjs';
import {daySummary,mondayOf,dateLabel,openPlanEditor,barsText,rateText} from './life-plan.mjs';
import {projectStudy} from './study-projection.mjs';
import {latestByAssistant,reportNodes,reportResultText,AI_GATE_TEXT} from './ai-gate.mjs';

export const STUDY_ASSISTANT='study',DIAG_DAYS=28;
export const SUGGEST_HEADING='## 다음 주 제안',SUGGEST_HEAD=Object.freeze(['과목','요일','분']),WEEKDAYS=Object.freeze(['월','화','수','목','금','토','일']);
export const MINUTE_STEP=15,MAX_ROW_MINUTES=BRICK_MINUTES*MAX_PLAN_BRICKS,MAX_DAY_MINUTES=1440;
export const SUGGEST_TEXT=Object.freeze({
  browser:'비서 제안은 PC 앱에서만 볼 수 있습니다.',empty:'최근 30일 안의 공부 진단 보고가 아직 없습니다.',htmlOnly:'공부 진단 보고가 HTML뿐이라 앱에서 열지 않습니다.',
  NONE:'이 보고에는 담을 수 있는 제안 표가 없어 글만 보여 줍니다.',
  SUGGEST_FORMAT:'제안 표 모양이 정해진 형식과 달라 글만 보여 줍니다.',SUGGEST_SUBJECT:'제안 표에 앱에 없는 과목이 있어 글만 보여 줍니다.',SUGGEST_DAY:'제안 표의 요일이 올바르지 않아 글만 보여 줍니다.',
  SUGGEST_MINUTES:'제안 표의 분이 범위를 벗어나 글만 보여 줍니다(한 줄 15~240분, 15분 단위).',SUGGEST_DUPLICATE:'제안 표에 같은 과목·요일 줄이 두 번 있어 글만 보여 줍니다.',
  diagnosisFail:'기본 진단을 계산하지 못했습니다.',
});

// ---------- 제안 표 읽기: 순수 함수. 한 줄이라도 어기면 표 전체를 받지 않는다 ----------
const cellsOf=line=>{const t=line.trim();return t.length>=2&&t.startsWith('|')&&t.endsWith('|')?t.slice(1,-1).split('|').map(c=>c.trim()):null;};
// subjects = lifeDefs(life).subjects. 돌려주는 값: {status:'NONE'} | {status:'INVALID',code} | {status:'OK',rows:[{subjectId,name,day(0=월),minutes,bricks}]}.
export function parseSuggestion(text,subjects){
  const bad=code=>({status:'INVALID',code}),lines=String(text??'').split(/\r?\n/),at=lines.flatMap((l,i)=>l.trim()===SUGGEST_HEADING?[i]:[]);
  if(!at.length)return {status:'NONE'};
  if(at.length>1)return bad('SUGGEST_FORMAT');
  let i=at[0]+1;
  while(i<lines.length&&!lines[i].trim())i++;
  const head=cellsOf(lines[i]??''),sep=cellsOf(lines[i+1]??'');
  if(!head||head.join('|')!==SUGGEST_HEAD.join('|')||!sep||sep.length!==SUGGEST_HEAD.length||!sep.every(c=>/^:?-{3,}:?$/.test(c)))return bad('SUGGEST_FORMAT');
  const byName=new Map();
  for(const s of subjects)if(!s.hidden&&!byName.has(s.name))byName.set(s.name,s);
  const rows=[],seen=new Set(),dayTotal=new Array(WEEKDAYS.length).fill(0);
  for(i+=2;i<lines.length&&lines[i].trim().startsWith('|');i++){
    const c=cellsOf(lines[i]);
    if(!c||c.length!==SUGGEST_HEAD.length)return bad('SUGGEST_FORMAT');
    const s=byName.get(c[0]),day=WEEKDAYS.indexOf(c[1]),minutes=/^\d{1,4}$/.test(c[2])?Number(c[2]):NaN,key=c[0]+'|'+c[1];
    if(!s)return bad('SUGGEST_SUBJECT');
    if(day<0)return bad('SUGGEST_DAY');
    if(!(minutes>=MINUTE_STEP&&minutes<=MAX_ROW_MINUTES&&minutes%MINUTE_STEP===0))return bad('SUGGEST_MINUTES');
    if(seen.has(key))return bad('SUGGEST_DUPLICATE');
    seen.add(key);dayTotal[day]+=minutes;
    if(dayTotal[day]>MAX_DAY_MINUTES)return bad('SUGGEST_MINUTES');
    rows.push({subjectId:s.id,name:s.name,day,minutes,bricks:minutes/BRICK_MINUTES});
  }
  return rows.length?{status:'OK',rows}:bad('SUGGEST_FORMAT');
}

// ---------- 다음 주 초안: 순수 함수. 저장하지 않는다. 표에 시간대가 없어 오전으로 채우고, 소유자가 시트에서 고친다 ----------
export function draftFromRows(rows,today){
  const monday=shiftDay(mondayOf(today),7),days=[];
  WEEKDAYS.forEach((_,k)=>{
    const items=rows.filter(r=>r.day===k).map(r=>({subjectId:r.subjectId,name:r.name,minutes:r.minutes,bricks:r.bricks}));
    if(items.length)days.push({date:shiftDay(monday,k),items});
  });
  return {monday,days};
}
export const seedItems=day=>day.items.map(x=>({subjectId:x.subjectId,title:'제안 '+x.minutes+'분',bricks:x.bricks,block:'M'}));

// ---------- 기본 진단(AI 아님): 오늘 포함 최근 28일. 분은 8절과 같은 기준(COMPLETED만), 실행률은 계획 vs 실제와 같은 Σmin(실제,계획)/Σ계획, 복습 밀림은 기한이 어제 이전인 남은 복습 수 ----------
// 기록 모양이 잘못되면 projectStudy가 던진다. 틀린 숫자를 보여 주지 않도록 부른 쪽은 진단 칸 전체를 안내 문구로 바꾼다.
export function basicDiagnosis({life=null,study=null,today}){
  const names=new Map(lifeDefs(life).subjects.map(s=>[s.id,s.name])),from=shiftDay(today,-(DIAG_DAYS-1)),by=new Map();
  const row=id=>{if(!by.has(id))by.set(id,{subjectId:id,name:names.get(id)??'기타',minutes:0,planned:0,achieved:0});return by.get(id);};
  for(const d of study?.days??[]){
    if(d.date<from||d.date>today)continue;
    for(const s of d.data.sessions)if(s.state==='COMPLETED'||s.state==='VERIFIED')row(subjectOfSession(s.id)??SUBJECT_BY_CODE[s.subject]??'?').minutes+=s.confirmedMin;
  }
  const ach=achieve({life,study,today});
  let planned=0,achieved=0;
  for(let k=0;k<DIAG_DAYS;k++){
    const s=daySummary(life,ach,shiftDay(from,k));
    planned+=s.planned;achieved+=s.achieved;
    for(const r of s.rows)if(r.planned>0){const t=row(r.subjectId);t.planned+=r.planned;t.achieved+=Math.min(r.planned,r.actual);}
  }
  const rows=[...by.values()].filter(r=>r.minutes>0||r.planned>0).map(r=>({...r,minutes:study?r.minutes:null,rate:r.planned>0?r.achieved/r.planned:null})).sort((a,b)=>(b.minutes??0)-(a.minutes??0)||b.planned-a.planned||(a.name<b.name?-1:1));
  return {from,to:today,rows,totalMinutes:study?rows.reduce((a,r)=>a+r.minutes,0):null,planned,achieved,rate:planned>0?achieved/planned:null,overdue:study?projectStudy(study.days.map(d=>d.data),today).overdue.length:null};
}
const minutesText=m=>m===null?'-':m+'분';
function diagnosisNodes(h,d){
  const out=h.el('div',null,'plan-suggest-diag');
  h.add(out,h.el('h3','기본 진단 · 최근 4주'),h.el('p',d.from+' ~ '+d.to+' · AI가 아니라 앱의 기록으로 계산합니다','muted small'));
  h.add(out,h.el('p','공부 '+minutesText(d.totalMinutes)+' · 계획 실행 '+rateText(d.rate)+' · 복습 밀림 '+(d.overdue===null?'-':d.overdue+'개'),'plan-sum'));
  if(!d.rows.length)h.add(out,h.el('p','최근 4주의 공부 기록과 계획이 없습니다.','muted small'));
  else{const t=h.el('div',null,'plan-compare');for(const r of d.rows)h.add(t,h.add(h.el('div',null,'plan-compare-row'),h.el('span',r.name),h.el('span',minutesText(r.minutes)+' · 계획 '+barsText(r.planned),'muted small'),h.el('strong',rateText(r.rate))));h.add(out,t);}
  return out;
}

// ---------- 화면 ----------
export const createSuggestState=()=>({list:null,code:null,listing:null,open:null,text:null,parsed:null,reading:false,message:'',draft:null});
export const studyReports=list=>({md:latestByAssistant(list).find(r=>r.assistant===STUDY_ASSISTANT)??null,html:list.some(r=>r?.kind==='html'&&r.assistant===STUDY_ASSISTANT)});
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
const weekText=monday=>short(monday)+' ~ '+short(shiftDay(monday,6));

function draftNodes(h,ctx,st,redraw){
  const out=h.el('div',null,'plan-suggest-draft');
  h.add(out,h.el('h3','다음 주 임시 입력 · '+weekText(st.draft.monday)),h.el('p','아직 저장되지 않았습니다. 날짜마다 내용을 확인하고 저장하면 그날 계획이 됩니다.','muted small'));
  for(const day of st.draft.days){
    const saved=()=>{if(!st.draft)return;st.draft.days=st.draft.days.filter(d=>d!==day);if(!st.draft.days.length)st.draft=null;};
    h.add(out,h.add(h.el('div',null,'plan-suggest-day'),h.add(h.el('div',null,'plan-suggest-day-text'),h.el('strong',dateLabel(day.date)),h.el('span',day.items.map(x=>x.name+' '+x.minutes+'분').join(' · '),'muted small')),h.button('확인하고 저장',()=>openPlanEditor(ctx,ctx.planSt,day.date,{seed:seedItems(day),onSaved:saved}),'secondary')));
  }
  h.add(out,h.add(h.el('div',null,'buttons'),h.button('임시 입력 버리기',()=>{st.draft=null;redraw();},'secondary')));
  return out;
}
function reportNodesOf(h,ctx,st,redraw,gone,today){
  if(st.code)return [h.el('p',reportResultText(st.code),'muted')];
  if(st.list===null)return [h.el('p',AI_GATE_TEXT.loading,'muted')];
  const {md,html}=studyReports(st.list);
  if(!md)return [h.el('p',html?SUGGEST_TEXT.htmlOnly:SUGGEST_TEXT.empty,'muted')];
  const head=h.add(h.el('div',null,'ai-gate-head'),h.add(h.el('div',null,'ai-gate-title'),h.el('strong','공부 진단 보고'),h.el('small',md.date)));
  if(md.tooLarge===true)return [head,h.el('p',AI_GATE_TEXT.REPORT_TOO_LARGE,'muted')];
  const opened=st.open===md.name&&st.text!==null;
  h.add(head,h.button(opened?'접기':'열기',async()=>{
    if(st.reading)return;
    if(opened){st.open=null;st.text=null;st.parsed=null;st.message='';redraw();return;}
    st.reading=true;st.message='';
    try{
      const res=await ctx.request({name:md.name});
      st.open=md.name;st.text=String(res?.text??'');st.parsed=parseSuggestion(st.text,lifeDefs(ctx.getWhole()?.life??null).subjects);
    }catch(e){st.message=reportResultText(e?.code);}
    finally{st.reading=false;}
    if(!gone())redraw();
  },'secondary'));
  const out=[head];
  if(st.message)out.push(h.el('p',st.message,'muted'));
  if(!opened)return out;
  out.push(h.add(h.el('div',null,'ai-gate-text'),...reportNodes(h,st.text)));
  if(st.parsed.status!=='OK')out.push(h.el('p',SUGGEST_TEXT[st.parsed.status==='NONE'?'NONE':st.parsed.code],'muted'));
  else if(!st.draft){
    const monday=shiftDay(mondayOf(today),7);
    // P1A: 주간 격자의 "다음 주 채우기" 시트에서 열렸으면(ctx.fillWeek) 초안을 격자에 넘긴다(격자 메모리만, 연산 0 — 저장은 격자의 "저장" 단추). 아니면 예전처럼 날짜별 초안.
    const load=()=>{const d=draftFromRows(st.parsed.rows,today);if(ctx.fillWeek){ctx.fillWeek({monday:d.monday,days:d.days.map(day=>({date:day.date,items:seedItems(day)}))});return;}st.draft=d;redraw();};
    out.push(h.el('p','표 '+st.parsed.rows.length+'줄 · 담는 주 '+weekText(monday),'muted small'),h.add(h.el('div',null,'buttons'),h.button('이 제안을 다음 주 계획에 담기',load,'primary')));
  }
  return out;
}

// ctx = lifeCtx()에 {h:{el,add,button},surface,request(body)=>Promise,planSt,sheet,fillWeek?}를 더한 것(P1A: 계획 탭 아래가 아니라 주 보기의 "다음 주 채우기" 시트 안에 그린다). st = createSuggestState(). 돌려주는 ready는 목록을 다 읽으면 끝나고 절대 거부되지 않는다.
export function renderSuggest(root,ctx,st){
  const {h}=ctx,seq=ctx.session?.(),gone=()=>ctx.session?.()!==seq,today=kstDate(ctx.now()),whole=ctx.getWhole();
  if(st.draft&&st.draft.monday<=mondayOf(today))st.draft=null;   // 그 주가 시작되면 "다음 주" 초안이 아니다
  const sec=h.add(h.el('section',null,'panel plan-suggest'),h.el('h2','다음 주 제안','panel-title'));
  h.add(root,sec);
  let diag=null;
  try{diag=basicDiagnosis({life:whole?.life??null,study:whole?.study??null,today});}catch{/* 이 칸만 안내 문구 */}
  h.add(sec,diag?diagnosisNodes(h,diag):h.el('p',SUGGEST_TEXT.diagnosisFail,'muted'));
  if(ctx.surface!=='APP_SHELL'){h.add(sec,h.el('p',SUGGEST_TEXT.browser,'muted'));return {sec,ready:Promise.resolve()};}
  const box=h.el('div',null,'plan-suggest-report'),draftBox=h.el('div',null,'plan-suggest-draftbox');
  const redraw=()=>{box.replaceChildren(...reportNodesOf(h,ctx,st,redraw,gone,today));draftBox.replaceChildren(...(st.draft?[draftNodes(h,ctx,st,redraw)]:[]));};
  const load=()=>st.listing??=(async()=>{
    try{const res=await ctx.request({});st.list=Array.isArray(res?.reports)?res.reports:[];st.code=null;}
    catch(e){st.list=null;st.code=e?.code??'fail';}
    finally{st.listing=null;}
  })();
  const reload=()=>{st.list=null;st.code=null;st.open=null;st.text=null;st.parsed=null;st.message='';redraw();return load().then(()=>{if(!gone())redraw();});};
  h.add(sec,box,draftBox,h.add(h.el('div',null,'buttons'),h.button('다시 읽기',reload,'secondary')));
  redraw();
  const ready=st.list===null&&!st.code||st.listing?load().then(()=>{if(!gone())redraw();}):Promise.resolve();
  return {sec,ready};
}
