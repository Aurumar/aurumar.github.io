// FIX45 (AUD1 #6): 공부 통계 + 주간 돌아보기. 공부 화면 맨 위 카드 하나와, 계획 주 화면의 이번 주 시간 한 줄. Fold 일요일 알림(#study-stats)이 이 화면으로 온다.
// 이 모듈은 아무것도 쓰지 않는다(연산 0, 시계·저장소·외부 통신 없음). 오늘 날짜는 부른 쪽이 넘긴다. 합계는 쌓은 카드의 COMPLETED 세션만 센다(벽돌·기본 진단과 같은 기준, 쌓기 전 초안은 넣지 않는다).
// 주는 월요일에 시작하고 날짜는 카드 날짜(KST)다. 화면은 DOM 생성 함수와 SVG 속성만 쓴다(innerHTML·인라인 style 없음).
import {lifeDefs,shiftDay,subjectOfSession} from './life-model.mjs';
import {SUBJECT_BY_CODE} from './life-achieve.mjs';
import {mondayOf,rateText,NO_SUBJECT_COLOR} from './life-plan.mjs';
import {basicDiagnosis} from './study-suggest.mjs';

export const STATS_WEEKS=12;
export const STATS_TEXT=Object.freeze({
  title:'공부 통계',note:'쌓은 기록 중 끝낸 공부만 셉니다 · 주는 월요일에 시작(KST) · 계산만 하고 저장하지 않습니다',
  empty:'아직 쌓은 공부 기록이 없습니다.',fail:'공부 통계를 계산하지 못했습니다.',
  thisWeek:'이번 주',lastWeek:'지난주',thisMonth:'이번 달',overdue:'복습 밀림',rate:'계획 실행률',rateNote:'최근 4주',
  bars:'최근 12주',table:'과목별 시간(시간:분)',subject:'과목',total:'12주',next:'다음 주 계획 세우기',
});
export const hoursText=m=>{const h=Math.floor(m/60),r=m%60;return (h?h+'시간':'')+(h&&r?' ':'')+(r||!h?r+'분':'');};
export const clockText=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
const UNKNOWN_SUBJECT='?';
const subjectIdOf=s=>subjectOfSession(s.id)??SUBJECT_BY_CODE[s.subject]??'?';
function eachCompleted(study,today,fn){
  for(const d of study?.days??[]){
    if(d.date>today)continue;
    for(const s of d.data.sessions)if(s.state==='COMPLETED'||s.state==='VERIFIED')fn(d.date,subjectIdOf(s),s.confirmedMin);
  }
}
// monday로 시작하는 주의 쌓은 공부 분(today 뒤의 날짜는 넣지 않는다).
export function weekMinutes(study,monday,today){
  const end=shiftDay(monday,6);let total=0;
  eachCompleted(study,today,(date,_,min)=>{if(date>=monday&&date<=end)total+=min;});
  return total;
}
// 계획 주 화면 한 줄. 아직 오지 않은 주와 공부 기록이 꺼진 때는 null.
export function weekCompareText(study,monday,today){
  if(!study||monday>today)return null;
  const cur=weekMinutes(study,monday,today),prev=weekMinutes(study,shiftDay(monday,-7),today),now=mondayOf(today)===monday;
  return (now?'이번 주':short(monday)+' 주')+' 공부 '+hoursText(cur)+' · '+(now?'지난주':'그 전 주')+' '+hoursText(prev)+(cur===prev?' · 같음':cur>prev?' · '+hoursText(cur-prev)+' 더':' · '+hoursText(prev-cur)+' 덜');
}
// 통계 전체(순수 함수). 기록 모양이 잘못되면 basicDiagnosis가 던진다. 틀린 숫자를 보여 주지 않도록 부른 쪽은 칸 전체를 안내 문구로 바꾼다.
export function studyStats({life=null,study=null,today}){
  const defs=new Map(lifeDefs(life).subjects.map(s=>[s.id,s])),monday=mondayOf(today),first=shiftDay(monday,-7*(STATS_WEEKS-1)),last=shiftDay(monday,-7),month=today.slice(0,7);
  const weeks=Array.from({length:STATS_WEEKS},(_,i)=>({monday:shiftDay(first,7*i),total:0,by:new Map()})),by=new Map();
  // FIX48 (HUNT42 H4): 정의 없는 과목 id(지운 과목·모르는 코드)는 한 키로 합쳐 "기타" 한 줄이다(같은 이름 줄이 여럿 갈라지지 않게).
  const keyOf=id=>defs.has(id)?id:UNKNOWN_SUBJECT;
  const row=id=>{const k=keyOf(id);if(!by.has(k)){const s=defs.get(k);by.set(k,{id:k,name:s?.name??'기타',color:s?.color??NO_SUBJECT_COLOR,week:0,lastWeek:0,month:0,total:0});}return by.get(k);};
  let thisMonth=0;
  eachCompleted(study,today,(date,id,min)=>{
    if(date.slice(0,7)===month){thisMonth+=min;row(id).month+=min;}
    if(date<first)return;
    const w=weeks[Math.floor((Date.parse(date)-Date.parse(first))/(7*86400000))],r=row(id);
    w.total+=min;w.by.set(r.id,(w.by.get(r.id)??0)+min);r.total+=min;
    if(w.monday===monday)r.week+=min;else if(w.monday===last)r.lastWeek+=min;
  });
  const d=basicDiagnosis({life,study,today});
  return {weeks,thisWeek:weeks.at(-1).total,lastWeek:weeks.at(-2).total,thisMonth,subjects:[...by.values()].sort((a,b)=>b.total-a.total||b.month-a.month||(a.name<b.name?-1:1)),overdue:d.overdue,rate:d.rate,from:first,to:today};
}
const SVGNS='http://www.w3.org/2000/svg';
const BAR_W=360,BAR_H=120,BAR_BASE=104;
function barsNode(doc,stats){
  const svg=(tag,attrs={},text=null)=>{const n=doc.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==null)n.textContent=String(text);return n;};
  const out=svg('svg',{class:'ss-bars',viewBox:'0 0 '+BAR_W+' '+BAR_H,width:'100%',role:'img','aria-label':STATS_TEXT.bars+' 공부 시간 막대 · 과목 색'});
  const max=Math.max(60,...stats.weeks.map(w=>w.total)),col=BAR_W/STATS_WEEKS;
  out.append(svg('line',{class:'ss-base',x1:0,y1:BAR_BASE,x2:BAR_W,y2:BAR_BASE}));
  stats.weeks.forEach((w,i)=>{
    const x=+(i*col+col*0.15).toFixed(1),width=+(col*0.7).toFixed(1),bar=svg('g',{class:'ss-week'+(i===STATS_WEEKS-1?' now':'')});
    bar.append(svg('title',{},short(w.monday)+' 주 '+hoursText(w.total)));
    let y=BAR_BASE;
    for(const s of stats.subjects){
      const min=w.by.get(s.id);if(!min)continue;
      const h=+(min/max*(BAR_BASE-4)).toFixed(1);y=+(y-h).toFixed(1);
      bar.append(svg('rect',{x,y,width,height:h,fill:s.color}));
    }
    out.append(bar);
    if((STATS_WEEKS-1-i)%2===0)out.append(svg('text',{class:'ss-tick',x:+(i*col+col/2).toFixed(1),y:BAR_H-4,'text-anchor':'middle'},short(w.monday)));
  });
  return out;
}
// 공부 화면 맨 위 칸. ctx = {document,life,study,today,openWeekPlan?}. 그리기만 한다(쓰기 0).
export function renderStudyStats(root,{document:doc=globalThis.document,life=null,study=null,today,openWeekPlan=null}){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const out=add(el('section',null,'panel study-stats'),el('h2',STATS_TEXT.title,'panel-title'),el('p',STATS_TEXT.note,'muted small'));out.id='study-stats';
  let s=null;
  try{s=studyStats({life,study,today});}catch{/* 이 칸만 안내 문구 */}
  if(!s){add(out,el('p',STATS_TEXT.fail,'muted'));root.append(out);return out;}
  const cell=(label,value,foot)=>add(el('div',null,'ss-cell'),el('span',label,'ss-label'),el('strong',value,'ss-value'),foot?el('span',foot,'ss-foot'):null);
  const diff=s.thisWeek-s.lastWeek;
  add(out,add(el('div',null,'ss-cells'),
    cell(STATS_TEXT.thisWeek,hoursText(s.thisWeek),diff===0?'지난주와 같음':'지난주보다 '+hoursText(Math.abs(diff))+(diff>0?' 더':' 덜')),
    cell(STATS_TEXT.lastWeek,hoursText(s.lastWeek)),
    cell(STATS_TEXT.thisMonth,hoursText(s.thisMonth)),
    cell(STATS_TEXT.overdue,s.overdue===null?'-':s.overdue+'개'),
    cell(STATS_TEXT.rate,rateText(s.rate),STATS_TEXT.rateNote)));
  if(!s.subjects.length)add(out,el('p',STATS_TEXT.empty,'muted'));
  else{
    add(out,el('h3',STATS_TEXT.bars,'ss-sub'),barsNode(doc,s),el('h3',STATS_TEXT.table,'ss-sub'));
    const table=el('table',null,'ss-table'),head=el('tr');
    for(const t of [STATS_TEXT.subject,STATS_TEXT.thisWeek,STATS_TEXT.lastWeek,STATS_TEXT.thisMonth,STATS_TEXT.total])head.append(el('th',t));
    table.append(head);
    for(const r of s.subjects){
      const name=el('td',null,'ss-name'),dot=doc.createElementNS(SVGNS,'svg');
      for(const [k,v] of Object.entries({class:'ss-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'}))dot.setAttribute(k,String(v));
      const c=doc.createElementNS(SVGNS,'circle');for(const [k,v] of Object.entries({cx:5,cy:5,r:5,fill:r.color}))c.setAttribute(k,String(v));dot.append(c);
      add(name,dot,el('span',r.name));
      add(table,add(el('tr'),name,el('td',clockText(r.week)),el('td',clockText(r.lastWeek)),el('td',clockText(r.month)),el('td',clockText(r.total))));
    }
    add(out,table);
  }
  if(openWeekPlan){const b=el('button',STATS_TEXT.next,'secondary ss-next');b.type='button';b.dataset.navOnly='1';b.addEventListener('click',openWeekPlan);add(out,add(el('div',null,'buttons'),b));}
  root.append(out);
  return out;
}
