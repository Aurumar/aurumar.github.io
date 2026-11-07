// 주간 인생 리뷰(FIX49D, D49 7장, 결정 ★2·★3). 한 주(월~일)를 돌아보는 시트 + 입구 2곳(오늘 화면 카드: 일요일 18시~월요일, 계획 탭 주 보기 단추) + 일요일 알림 목적지(#week-review).
// 숫자는 모두 투영이고 저장하지 않는다. 기존 계산을 그대로 부른다: 공부 시간 weekMinutes(study-stats)·벽돌(achieve의 그 주 값)·계획 실행률 weekSummary(life-plan)·습관 habitWindow(state-export, 일요일 기준 7일).
// 쓰기: [저장] 1번 = saveWeekReview 1번 = 연산 1. 고른 문장·다음 주 한 가지가 모두 비었고 저장된 리뷰도 없으면 기록을 만들지 않는다(연산 0). 고르기·입력은 이 시트 메모리에만 있다(연산 0).
// 쓰기 문(lb.records.d46)이 닫혀 있으면 입구를 그리지 않고 시트도 열지 않는다. 글(일기·고른 문장·다음 주 한 가지)은 알림·토스트·내보내기·이력 제목에 넣지 않는다.
// 그 주 일기 글은 [문장 고르기]를 눌러야 만든다(화면을 보는 사람 고려). 기분은 오늘 카드 값(★3). 화면 규칙: DOM 생성 함수·SVG 속성·styles.css 클래스만(innerHTML·인라인 style 없음).
import {sheet} from './ui-kit.mjs';
import {shiftDay,kstDate,recordsDoorState,validateLifeData,MAX_REVIEW_PICK,MAX_REVIEW_NEXT,DIARY_GOOD_CHIPS,DIARY_BAD_CHIPS} from './life-model.mjs';
import {achieve} from './life-achieve.mjs';
import {mondayOf,weekSummary,rateText,planErrorText,unknownOutcome,PLAN_NOTICE_TEXT,maker} from './life-plan.mjs';
import {weekMinutes,hoursText} from './study-stats.mjs';
import {habitWindow} from './state-export.mjs';
import {saveWeekReview} from './life-quest.mjs';
import {chipLabel} from './diary-ui.mjs';

export const TOP_CHIPS=3,MAX_CHOICES=20,LOW_AVG=2,LOW_MIN_DAYS=3,EVENING_HOUR=18;
export const WEEK_REVIEW_TEXT=Object.freeze({
  title:'주간 돌아보기',thisWeek:'이번 주 돌아보기',lastWeek:'지난주 돌아보기',open:'열기',edit:'보기·고치기',
  entryNew:'한 주 숫자를 보고 다음 주 한 가지를 정해 보세요',entrySaved:'돌아봤어요 · 다시 열어 고칠 수 있어요',
  note:'숫자는 계산만 하고 저장하지 않아요 · 주는 월요일에 시작해요',lastNext:'지난주에 정한 한 가지: ',
  study:'공부',plan:'계획 실행률',habit:'습관 완료율',diary:'일기 쓴 날',noStudy:'공부 기록 꺼짐',noPlan:'계획 없음',
  graph:'하루 점수 추이',legend:'실선 = 하루 점수(1~5) · 점선 = 기분(오늘 카드) · 기록이 없는 날은 선이 끊겨요',noScore:'이 주에는 하루 점수와 기분 기록이 없어요.',
  habits:'습관별 보기',good:'잘한 것',bad:'아쉬운 것',noChips:'고른 항목 없음',
  low:'힘든 한 주였네요. 다음 주엔 쉬는 날을 먼저 정해 볼까요?',
  pickTitle:'이 주의 문장',pickOpen:'문장 고르기',pickClose:'문장 접기',pickHint:'하나를 고르면 그대로 복사해 저장해요(120자까지) · 다시 누르면 빠져요',picked:'고른 문장: ',unpick:'빼기',
  next:'다음 주 한 가지 (선택)',nextHolder:'다음 주 한 가지 (선택, 40자)',
  save:'저장',saved:'주간 리뷰를 저장했어요 · 4기기에 암호화되어 동기화돼요',same:'바뀐 것이 없어 저장하지 않았어요',empty:'고른 문장이나 다음 주 한 가지가 없어 저장하지 않았어요',
  draft:'아직 저장 전 · 고르기와 입력은 이 화면에만 있어요',stored:'저장된 리뷰 · 고치면 다시 저장할 수 있어요',fail:'이 주의 숫자를 계산하지 못했어요.',
  privacy:'저장한 뒤 고치면 이전 내용이 암호화된 이력에 남아요 · 비서에게는 보내지 않아요',
  prev:'◀ 앞 주',next7:'다음 주 ▶',
});
const WR=WEEK_REVIEW_TEXT;
const WEEKDAY=['월','화','수','목','금','토','일'];
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
export const rangeText=monday=>short(monday)+' ~ '+short(shiftDay(monday,6));
const storageOf=ctx=>{try{return ctx.storage??globalThis.localStorage??null;}catch{return null;}};
export const reviewDoorOpen=ctx=>{const w=ctx.getWhole();return recordsDoorState({life:w?.life??null,study:w?.study??null,storage:storageOf(ctx)}).open;};
export const reviewRow=(life,monday)=>(life?.weekReviews??[]).find(x=>x.monday===monday)??null;

// 어느 주를 여나(D49 7.1): 월요일은 지난주, 그 밖의 날은 이번 주.
export const defaultReviewMonday=today=>{const m=mondayOf(today);return m===today?shiftDay(m,-7):m;};
// 오늘 화면 카드가 보이는 때: 일요일 18:00(KST)부터 그 주, 월요일 하루 종일 지난주. 그 밖에는 null.
export function reviewWindow(nowIso){
  const k=new Date(Date.parse(nowIso)+9*3600000),today=k.toISOString().slice(0,10),dow=k.getUTCDay();
  if(dow===0&&k.getUTCHours()>=EVENING_HOUR)return {monday:shiftDay(today,-6),today,last:false};
  if(dow===1)return {monday:shiftDay(today,-7),today,last:true};
  return null;
}

// ---- 계산(순수, 저장 0) ----
const diaryWritten=d=>d.score!==null||d.energy!==null||d.good.length>0||d.bad.length>0||d.text.trim()!==''||d.tomorrow.trim()!=='';
const chipOrder=(id,list)=>{const i=list.indexOf(id);return i<0?list.length:i;};
function chipTop(diaries,key,list){
  const m=new Map();
  for(const d of diaries)for(const id of d[key])m.set(id,(m.get(id)??0)+1);
  return [...m].map(([id,n])=>({id,n})).sort((a,b)=>b.n-a.n||chipOrder(a.id,list)-chipOrder(b.id,list)||(a.id<b.id?-1:1)).slice(0,TOP_CHIPS);
}
// 한 주의 숫자. life·study = wholeLifeView의 같은 이름 항목, today = 오늘(KST). 오늘 뒤의 공부는 세지 않는다(weekMinutes와 같음).
export function weekReviewStats({life=null,study=null,monday,today}){
  const sunday=shiftDay(monday,6),dates=Array.from({length:7},(_,i)=>shiftDay(monday,i)),inWeek=d=>d>=monday&&d<=sunday;
  const ach=achieve({life,study,today}),w=ach.weeks.find(x=>x.monday===monday)??null;
  const plan=weekSummary(life,ach,monday);
  const habits=habitWindow(life,sunday)??[],habitGoal=habits.reduce((s,r)=>s+r.goal,0),habitDone=habits.reduce((s,r)=>s+r.done,0);
  const diaryRows=(life?.diaries??[]).filter(x=>inWeek(x.date)),diaryBy=new Map(diaryRows.map(x=>[x.date,x.data]));
  const cardBy=new Map((life?.days??[]).filter(x=>inWeek(x.date)).map(x=>[x.date,x.data]));
  const days=dates.map(date=>{const d=diaryBy.get(date)??null,c=cardBy.get(date)??null;return {date,score:d?.score??null,mood:Number.isInteger(c?.mood)?c.mood:null,written:Boolean(d&&diaryWritten(d))};});
  const scores=days.map(d=>d.score).filter(v=>v!==null),avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;
  const diaries=diaryRows.map(x=>x.data);
  return {monday,sunday,days,
    study:study?{minutes:weekMinutes(study,monday,today),prevMinutes:weekMinutes(study,shiftDay(monday,-7),today),bricks:w?.bricks??0,pieces:w?.pieces??0}:null,
    planRate:plan.rate,planned:plan.planned,habits,habitGoal,habitDone,habitRate:habitGoal>0?habitDone/habitGoal:null,
    diaryDays:days.filter(d=>d.written).length,good:chipTop(diaries,'good',DIARY_GOOD_CHIPS),bad:chipTop(diaries,'bad',DIARY_BAD_CHIPS),
    avg,low:scores.length>=LOW_MIN_DAYS&&avg<=LOW_AVG,lastNext:reviewRow(life,shiftDay(monday,-7))?.data.next.trim()??''};
}
// 그래프 선 조각: 값이 이어진 날끼리만 잇는다(없는 날은 끊김, 0으로 그리지 않음). [[{i,v},…],…]
export function lineRuns(values){
  const runs=[];let cur=null;
  values.forEach((v,i)=>{if(v===null||v===undefined){cur=null;return;}if(!cur){cur=[];runs.push(cur);}cur.push({i,v});});
  return runs;
}
// 문장 나누기(D49 7.2): . ! ? … 줄바꿈에서 나눈다(문장 끝 부호는 남김). 글자·숫자가 없는 조각은 뺀다. 그 주 일기를 날짜 순으로 보고 최대 20개.
export const SENTENCE=/[^.!?…\n]+[.!?…]*/g;
export const clipPick=s=>[...String(s)].slice(0,MAX_REVIEW_PICK).join('');   // 120자가 넘으면 잘라서 저장(글자 = 코드 포인트, 검사기와 같은 셈)
export function sentenceChoices(life,monday,max=MAX_CHOICES){
  const sunday=shiftDay(monday,6),out=[];
  const rows=(life?.diaries??[]).filter(x=>x.date>=monday&&x.date<=sunday).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  for(const r of rows)for(const m of r.data.text.match(SENTENCE)??[]){
    const t=clipPick(m.trim());
    if(!/[\p{L}\p{N}]/u.test(t))continue;
    out.push({date:r.date,text:t});if(out.length>=max)return out;
  }
  return out;
}
// 저장할 값. 다음 주 한 가지는 앞뒤 공백을 뺀다.
export const reviewData=(monday,pick,next)=>({monday,pick:pick?{date:pick.date,text:clipPick(pick.text)}:null,next:String(next??'').trim()});

// ---- 화면 ----
const SVGNS='http://www.w3.org/2000/svg';
const G_W=280,G_H=124,G_X0=22,G_STEP=40,G_TOP=12,G_UNIT=22;   // 점수 1 = 아래(100), 5 = 위(12)
const gy=v=>G_TOP+(5-v)*G_UNIT;
function graphNode(doc,days){
  const svg=(tag,attrs={},text=null)=>{const n=doc.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==null)n.textContent=String(text);return n;};
  const label=days.map((d,i)=>WEEKDAY[i]+' '+(d.score===null?'기록 없음':d.score)).join(', ');
  const out=svg('svg',{class:'wr-graph',viewBox:'0 0 '+G_W+' '+G_H,width:'100%',role:'img','aria-label':WR.graph+' · '+label});
  for(let v=1;v<=5;v++){out.append(svg('line',{class:'wr-grid',x1:G_X0-8,y1:gy(v),x2:G_W-6,y2:gy(v)}));out.append(svg('text',{class:'wr-tick',x:4,y:gy(v)+4},v));}
  const draw=(key,cls)=>{
    for(const run of lineRuns(days.map(d=>d[key]))){
      if(run.length>1)out.append(svg('polyline',{class:'wr-line '+cls,points:run.map(p=>(G_X0+p.i*G_STEP)+','+gy(p.v)).join(' ')}));
      for(const p of run)out.append(svg('circle',{class:'wr-dot '+cls,cx:G_X0+p.i*G_STEP,cy:gy(p.v),r:cls==='wr-score'?4:3}));
    }
  };
  draw('mood','wr-mood');draw('score','wr-score');
  days.forEach((d,i)=>out.append(svg('text',{class:'wr-tick','text-anchor':'middle',x:G_X0+i*G_STEP,y:G_H-2},WEEKDAY[i])));
  return out;
}
const brickLine=s=>'벽돌 '+s.bricks+'장'+(s.pieces?' + 조각 '+s.pieces:'');
const compareLine=(cur,prev)=>cur===prev?'지난주와 같음':'지난주보다 '+hoursText(Math.abs(cur-prev))+(cur>prev?' 더':' 덜');
const chipsLine=(list,good)=>list.length?list.map(c=>chipLabel(c.id,good)+' '+c.n+'번').join(' · '):WR.noChips;

// 시트. monday = 열 주(없으면 defaultReviewMonday), today = 오늘(KST, 없으면 ctx.now). 문이 닫혀 있으면 열지 않고 null.
export function openWeekReview(ctx,{monday=null,today=null}={}){
  if(!reviewDoorOpen(ctx))return null;
  const day0=today??kstDate(ctx.now()),cur=mondayOf(day0),{el,add,button}=maker(ctx.document??globalThis.document);
  let week=monday&&monday<=cur?monday:defaultReviewMonday(day0),busy=false;
  const drafts=new Map();   // 주별 이 시트 메모리(연산 0). base = 열 때 저장돼 있던 값(3자 병합의 기준)
  const draftOf=m=>{
    if(!drafts.has(m)){const row=reviewRow(ctx.getWhole().life??null,m),base=row?structuredClone(row.data):null;drafts.set(m,{base,pick:base?.pick??null,next:base?.next??'',open:false,message:null,error:false,notices:[]});}
    return drafts.get(m);
  };
  const body=el('div',null,'wr-body');
  const draw=()=>{
    const whole=ctx.getWhole(),life=whole.life??null,study=whole.study??null,d=draftOf(week);
    body.replaceChildren();
    const later=button(WR.next7,()=>{week=shiftDay(week,7);draw();},'secondary wr-next-week');
    if(shiftDay(week,7)>cur){later.disabled=true;later.setAttribute('aria-disabled','true');}
    add(body,add(el('div',null,'wr-nav'),button(WR.prev,()=>{week=shiftDay(week,-7);draw();},'secondary wr-prev-week'),el('strong',rangeText(week),'wr-range'),later),el('p',WR.note,'muted small'));
    let s=null;try{s=weekReviewStats({life,study,monday:week,today:day0});}catch{s=null;}
    if(!s)add(body,el('p',WR.fail,'muted wr-fail'));
    else{
      if(s.lastNext)add(body,el('p',WR.lastNext+s.lastNext,'wr-last-next'));
      const cell=(label,value,foot)=>add(el('div',null,'ss-cell wr-cell'),el('span',label,'ss-label'),el('strong',value,'ss-value'),foot?el('span',foot,'ss-foot'):null);
      add(body,add(el('div',null,'ss-cells wr-cells'),
        s.study?cell(WR.study,hoursText(s.study.minutes),brickLine(s.study)+' · '+compareLine(s.study.minutes,s.study.prevMinutes)):cell(WR.study,'-',WR.noStudy),
        cell(WR.plan,rateText(s.planRate),s.planned>0?null:WR.noPlan),
        cell(WR.habit,s.habitRate===null?'-':Math.round(s.habitRate*100)+'%',s.habitGoal>0?s.habitDone+' / '+s.habitGoal+'칸':null),
        cell(WR.diary,s.diaryDays+'일','7일 중')));
      add(body,el('h3',WR.graph,'wr-sub'));
      if(s.days.some(x=>x.score!==null||x.mood!==null))add(body,graphNode(ctx.document??globalThis.document,s.days),el('p',WR.legend,'muted small wr-legend'));
      else add(body,el('p',WR.noScore,'muted small wr-no-score'));
      if(s.low)add(body,el('p',WR.low,'notice wr-low'));
      add(body,add(el('div',null,'wr-chips'),el('p',WR.good+': '+chipsLine(s.good,true),'wr-chip-line'),el('p',WR.bad+': '+chipsLine(s.bad,false),'wr-chip-line')));
      if(s.habits.length){const box=add(el('details',null,'wr-habits'),el('summary',WR.habits+' ('+s.habits.length+'개)'));for(const r of s.habits)add(box,el('p',r.name+' '+r.done+' / '+r.goal,'muted small wr-habit'));add(body,box);}
    }
    // 문장 고르기: 그 주 일기에 문장이 있을 때만. 일기 글은 누른 뒤에만 만든다.
    const choices=sentenceChoices(life,week);
    if(choices.length||d.pick){
      const box=add(el('section',null,'wr-pick'),el('h3',WR.pickTitle,'wr-sub'));
      if(d.pick)add(box,add(el('div',null,'wr-picked'),el('p',WR.picked+d.pick.text,'wr-picked-text'),button(WR.unpick,()=>{d.pick=null;draw();},'secondary wr-unpick')));
      if(choices.length){
        const t=button(d.open?WR.pickClose:WR.pickOpen,()=>{d.open=!d.open;draw();},'secondary wr-pick-open');t.setAttribute('aria-expanded',String(d.open));add(box,t);
        if(d.open){
          const list=el('div',null,'wr-choices');
          for(const c of choices){
            const on=d.pick?.date===c.date&&d.pick?.text===c.text;
            const b=button(WEEKDAY[(new Date(c.date+'T12:00:00Z').getUTCDay()+6)%7]+' · '+c.text,()=>{d.pick=on?null:{date:c.date,text:c.text};draw();},'wr-choice'+(on?' selected':''));
            b.setAttribute('aria-pressed',String(on));add(list,b);
          }
          add(box,el('p',WR.pickHint,'muted small'),list);
        }
      }
      add(body,box);
    }
    const next=el('input',null,'wr-next');next.type='text';next.value=d.next;next.setAttribute('maxlength',String(MAX_REVIEW_NEXT));next.setAttribute('aria-label','다음 주 한 가지');next.setAttribute('placeholder',WR.nextHolder);
    next.addEventListener('input',()=>{d.next=next.value;});
    add(body,add(el('label',null,'wr-field'),el('span',WR.next,'wr-label'),next));
    const save=button(WR.save,()=>void saveNow(week),'primary wr-save');
    add(body,add(el('div',null,'buttons wr-actions'),save),el('p',d.base?WR.stored:WR.draft,'muted small wr-state'));
    if(d.message)add(body,el('p',d.message,d.error?'notice error wr-message':'notice wr-message'));
    for(const n of d.notices)add(body,el('p',PLAN_NOTICE_TEXT[n.code],'notice wr-notice'));
    add(body,el('p',WR.privacy,'muted small wr-privacy'));
  };
  const say=(d,text,error)=>{d.message=text;d.error=error;d.notices=[];};
  const saveNow=async m=>{
    if(busy)return;
    const d=draftOf(m),mine=reviewData(m,d.pick,d.next);
    try{validateLifeData('WEEK_REVIEW',m,mine);}catch(e){say(d,planErrorText(e?.code),true);draw();return;}
    if(!d.base&&mine.pick===null&&!mine.next){say(d,WR.empty,false);draw();return;}   // 비어 있으면 기록을 만들지 않는다(연산 0)
    busy=true;
    const run=async()=>{
      let r;
      try{r=await saveWeekReview(ctx,{monday:m,base:d.base,mine});}
      catch(e){say(d,planErrorText(e?.code),true);draw();if(unknownOutcome(e?.code))throw e;return;}
      if(r.sealed){say(d,PLAN_NOTICE_TEXT.RECORD_LOCAL_DRAFT,true);draw();return;}   // 임시 저장: 저장됐다고 말하지 않고 입력을 남긴다
      const row=reviewRow(ctx.getWhole().life??null,m),now=row?structuredClone(row.data):r.data?structuredClone(r.data):d.base;
      if(now){d.base=now;d.pick=now.pick;d.next=now.next;}
      say(d,r.status==='SAVED'?WR.saved:WR.same,false);d.notices=(r.notices??[]).filter(n=>PLAN_NOTICE_TEXT[n.code]);
      draw();await ctx.rerender?.();
    };
    try{if(ctx.perform)await ctx.perform(run);else await run();}finally{busy=false;}
  };
  draw();
  const dlg=sheet(WR.title,body);dlg.className=String(dlg.className??'')+' wr-sheet';
  return dlg;
}

// 오늘 화면 카드(일요일 18시~월요일, 문이 열렸을 때만). 글은 싣지 않는다.
export function renderWeekReviewEntry(ctx){
  const w=reviewWindow(ctx.now());if(!w||!reviewDoorOpen(ctx))return null;
  const {el,add,button}=maker(ctx.document??globalThis.document),row=reviewRow(ctx.getWhole().life??null,w.monday),name=w.last?WR.lastWeek:WR.thisWeek;
  const go=button(row?WR.edit:WR.open,()=>{openWeekReview(ctx,{monday:w.monday,today:w.today});},'primary wr-entry-open');go.dataset.navOnly='1';go.setAttribute('aria-label',name+' '+(row?WR.edit:WR.open));
  const out=add(el('section',null,'panel wr-entry'),add(el('div',null,'wr-entry-head'),el('h3',name),go),el('p',rangeText(w.monday)+' · '+(row?WR.entrySaved:WR.entryNew),'muted small wr-entry-state'));
  out.id='week-review-entry';
  return out;
}
// 계획 탭 주 보기 단추. 앞으로의 주·문 닫힘이면 없음.
export function renderWeekReviewButton(ctx,{monday,today=null}){
  const day0=today??kstDate(ctx.now());
  if(!monday||monday>mondayOf(day0)||!reviewDoorOpen(ctx))return null;
  const {el,add,button}=maker(ctx.document??globalThis.document),row=reviewRow(ctx.getWhole().life??null,monday);
  const b=button((monday===mondayOf(day0)?'이번 주':'이 주')+' 돌아보기'+(row?' · 저장됨':''),()=>{openWeekReview(ctx,{monday,today:day0});},'secondary wr-plan-open');b.dataset.navOnly='1';
  return add(el('div',null,'buttons wr-plan'),b);
}
