// P1A: 계획 탭 '주' 보기 = 7열(월~일) × 4블록(M 오전·L 오후·D 저녁·N 밤) + 합 격자. 앱이 ctx.planWeek로 넘겨 주면 life-plan의 주 보기가 이것을 그린다(못 받으면 옛 막대 보기).
// 설계: AUTOPILOT\design\P1D_PLAN_CALENDAR_DESIGN.md 2.3·5(P1A). 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style·외부 라이브러리 없음), 과목 색은 SVG stroke 속성, 그 밖의 색은 styles.css 토큰.
// 입력(탭-탭): 아래 과목 칩을 고른 채 칸의 "+"를 누르면 그 과목 1장, 같은 칸을 다시 누르면 +0.5장. 과목을 안 고르고 누르거나 줄을 길게 누르면 칩 시트(plan-today의 openChipSheet 재사용: 벽돌·시간대·할 일·지우기).
// 이 모든 입력은 이 화면 메모리의 초안(st.week)만 바꾼다(쓰기 0, 누르는 동안에도 0). 기록은 "저장 (바뀐 날 n)" 단추 하나에서만: 바뀐 날마다 기존 savePlanDay(PLAN_DAY 1개 = 연산 1, 줄 id 3자 병합·STALE_HEADS 재시도)를 차례로 부른다.
// 일부 날만 실패하면 성공한 날은 초안에서 빼고 실패한 날만 초안으로 남긴다. 달성률 분모 = 오늘까지의 계획(남은 날의 계획은 "남은 계획 n장"으로 따로). 계획 = 과목 색 테두리, 실제 벽돌 = 금 채움.
// 새 기록 종류·필드 0. 이 기기 저장소에는 칩 시트가 적는 마지막 벽돌 수(lb.plan.chip)뿐이다. 로그아웃 잠금(세션 번호가 바뀜) 뒤에는 초안을 버린다.
import {lifeDefs,kstDate,shiftDay,validateLifeData,SUBJECT_COLOR_KEYS,PLAN_BLOCKS} from './life-model.mjs';
import {achieve} from './life-achieve.mjs';
import {stable} from './life-rebase.mjs';
import {planOf,sortedItems,actualOf,planVsActual,copyPlan,savePlanDay,planErrorText,unknownOutcome,PLAN_NOTICE_TEXT,barsText,rateText,RATE_MEANING,mondayOf,dateLabel,NO_SUBJECT_COLOR} from './life-plan.mjs';
import {openChipSheet,blockLabel,BLOCK_SHORT,titleOr} from './plan-today.mjs';
export const WEEKDAYS=Object.freeze(['월','화','수','목','금','토','일']);
export const CELL_SHOW=3,LONG_PRESS_MS=450,TAP_BRICKS=1,TAP_STEP=0.5;
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
const num=v=>Number.isInteger(v)?String(v):v.toFixed(1);

// ---------- 초안(메모리만) ----------
// base = 그 날을 처음 고친 순간의 저장된 계획(3자 병합의 기준), items = 내 초안 줄. session = 만든 때의 로그아웃 세대. sealed = 임시 저장(봉인 초안)으로 들어간 날의 내용(같은 내용을 또 쌓지 않으려고).
export const createWeekDraft=(session=null)=>({session,base:new Map(),items:new Map(),sealed:new Map(),pick:null,message:null,error:false,notices:[],failed:[]});
export const dayItems=(life,draft,date)=>draft.items.has(date)?draft.items.get(date):planOf(life,date)?.items??[];
// 바뀐 날 = 초안이 처음 고친 때의 계획과 다른 날(넣었다 지워 되돌린 날은 빠진다).
export const changedDates=draft=>[...draft.items.keys()].filter(d=>stable(draft.items.get(d))!==stable(draft.base.get(d)?.items??[])).sort();
// 그 날 초안에 change를 적용한다. 계획 규칙(20줄·0.5~8장·할 일 1~40자)에 걸리면 초안을 바꾸지 않고 오류 코드를 돌려준다.
export function editDay(life,draft,date,change){
  const cur=structuredClone(dayItems(life,draft,date)),next=change(cur);
  try{validateLifeData('PLAN_DAY',date,{date,items:next});}catch(e){return e?.code??'INVALID_PLAN_DAY';}
  if(!draft.base.has(date))draft.base.set(date,structuredClone(planOf(life,date)));
  draft.items.set(date,next);
  return null;
}
// 새 줄 id: 그 날 줄과 겹치지 않게(uid가 같아도 뒤에 번호).
export function newItemId(items,uid){
  const head='p'+String(uid()).replace(/[^A-Za-z0-9_-]/g,'').slice(0,10);let id=head,k=0;
  while(items.some(x=>x.id===id))id=head+(k++).toString(36);
  return id;
}
// 탭-탭: 고른 과목이 이미 그 칸에 있으면 +0.5장, 없으면 1장짜리 줄을 넣는다(할 일 = 과목 이름).
export function tapCell(life,draft,{date,block,subjectId,name,uid}){
  return editDay(life,draft,date,items=>{
    const hit=items.find(x=>x.block===block&&x.subjectId===subjectId);
    if(hit){hit.bricks+=TAP_STEP;return items;}   // 8장을 넘기면 editDay 검사가 막는다(초안 그대로, 오류 문구)
    items.push({id:newItemId(items,uid),subjectId,title:titleOr('',name),bricks:TAP_BRICKS,block});return items;
  });
}
// 복사 줄 id = 대상 날짜 + 원본 줄 id(H37-P2): 두 기기가 같은 주를 복사해도 같은 줄이 되어 3자 병합이 두 배로 만들지 않는다. 복사의 복사는 앞 꼬리표를 떼어 길이가 늘지 않는다.
export const copyItemId=(sourceId,date)=>'w'+date.slice(2).replaceAll('-','')+'-'+String(sourceId).replace(/^w\d{6}-/,'').slice(0,32);
// 지난주처럼: 이 주에서 계획이 빈 날에만 지난주 같은 요일 계획을 새 id로 넣는다(있는 날은 건드리지 않음). 넣은 날 수를 돌려준다.
export function copyLastWeek(life,draft,monday){
  let n=0;
  for(let k=0;k<7;k++){
    const date=shiftDay(monday,k),prev=planOf(life,shiftDay(date,-7));
    if(!prev?.items?.length||dayItems(life,draft,date).length)continue;
    if(!editDay(life,draft,date,()=>copyPlan(prev,date,i=>copyItemId(prev.items[i].id,date)).items))n++;
  }
  return n;
}
// 다음 주 채우기(B61): 제안 초안 {monday,days:[{date,items:[{subjectId,title,bricks,block}]}]}을 그 날 초안 뒤에 더한다. 넣은 날 수와 못 넣은 날(오류) 목록.
export function fillFromSuggest(life,draft,plan,uid){
  let n=0;const bad=[];
  for(const day of plan?.days??[]){
    const code=editDay(life,draft,day.date,items=>{for(const x of day.items)items.push({...x,id:newItemId(items,uid)});return items;});
    if(code)bad.push({date:day.date,code});else n++;
  }
  return {n,bad};
}

// ---------- 계산(시계·저장소·DOM 없음) ----------
// 같은 첫 글자를 가진 과목(통합사회·통합과학)은 공통 앞부분 다음 글자로 구분한다.
export function shortNames(subjects){
  const out=new Map();
  for(const s of subjects){
    const chars=[...String(s.name)];let at=0;
    for(const o of subjects){if(o===s)continue;const oc=[...String(o.name)];let i=0;while(i<chars.length-1&&chars[i]===oc[i])i++;if(i>at)at=i;}
    out.set(s.id,chars[Math.min(at,chars.length-1)]??'?');
  }
  return out;
}
// 그 주의 격자 내용. 실제 벽돌은 일간 카드와 같은 규칙(같은 과목을 줄 순서대로 채움)으로 줄마다 got을 정한다.
export function weekGridModel({life=null,study=null,monday,today,draft=createWeekDraft()}){
  const defs=lifeDefs(life),subjects=new Map(defs.subjects.map(s=>[s.id,s])),letters=shortNames(defs.subjects);
  const ach=achieve({life,study,today}),weeks=new Map(ach.weeks.map(w=>[w.monday,w])),changed=new Set(changedDates(draft));
  const days=[],subjectActual=new Map();let planned=0,actual=0,plannedToDate=0,achievedToDate=0,plannedLater=0;
  for(let k=0;k<7;k++){
    const date=shiftDay(monday,k),items=sortedItems(dayItems(life,draft,date)),act=actualOf(weeks,date),pva=planVsActual(items,act);
    const left=new Map([...act.bySubject].map(([id,s])=>[id,s.value]));
    const rows=items.map(x=>{
      const have=left.get(x.subjectId)??0,got=Math.min(have,x.bricks),s=subjects.get(x.subjectId)??null;left.set(x.subjectId,have-got);
      return {...x,name:s?.name??'기타',color:s?.color??NO_SUBJECT_COLOR,letter:letters.get(x.subjectId)??'?',got};
    });
    planned+=pva.planned;actual+=act.total;
    for(const [id,s] of act.bySubject)subjectActual.set(id,(subjectActual.get(id)??0)+s.value);
    if(date<=today){plannedToDate+=pva.planned;achievedToDate+=pva.achieved;}else plannedLater+=pva.planned;
    days.push({date,weekday:WEEKDAYS[k],cells:PLAN_BLOCKS.map(b=>rows.filter(r=>r.block===b)),planned:pva.planned,actual:act.total,isToday:date===today,past:date<today,changed:changed.has(date)});
  }
  const end=shiftDay(monday,6),state=monday>today?'FUTURE':end<today?'PAST':'NOW';
  return {monday,end,state,days,subjectActual,planned,actual,plannedToDate,achievedToDate,plannedLater,rate:plannedToDate>0?achievedToDate/plannedToDate:null,
    changed:[...changed],subjects:defs.subjects.filter(s=>!s.hidden),maxDay:Math.max(1,...days.map(d=>Math.max(d.planned,d.actual)))};
}
// 머리 한 줄. 빈칸을 0으로 채우지 않는다(계획도 실제도 없으면 null).
export function weekHeadText(m){
  const parts=[];
  if(m.planned>0)parts.push('계획 '+barsText(m.planned));
  if(m.state!=='FUTURE'&&(m.actual>0||m.plannedToDate>0))parts.push((m.state==='NOW'?'지금까지 ':'실제 ')+barsText(m.actual)+(m.state==='NOW'&&m.plannedToDate>0?' / 오늘까지 계획 '+barsText(m.plannedToDate):''));
  if(m.rate!==null)parts.push('달성 '+rateText(m.rate));
  if(m.state==='NOW'&&m.plannedLater>0)parts.push('남은 계획 '+barsText(m.plannedLater));
  return parts.length?parts.join(' · '):null;
}

// ---------- 기록 쓰기(한 곳) ----------
// 바뀐 날마다 savePlanDay 1번(그 날 PLAN_DAY 1개 = 연산 1, 같은 내용이면 0). 성공한 날은 초안에서 빼고, 실패한 날은 그대로 남긴다. 잠금으로 세션이 바뀌면 남은 날은 쓰지 않는다.
// 임시 저장 모드(sealed)는 성공이 아니다: 초안에 남기고 sealed로 돌려준다(H37-P1). 결과를 모르는 오류는 그 자리에서 멈추고 던진다(H37-P3, 명세서 저장과 같은 방식). e.savedDays = 그 전에 저장한 날 수.
const dropDay=(draft,date)=>{draft.items.delete(date);draft.base.delete(date);draft.sealed?.delete(date);};
// 지금도 임시 저장 모드이고 같은 내용을 이미 봉인했으면 또 쌓지 않는다.
const sealedAlready=async(ctx,draft,date)=>draft.sealed?.get(date)===stable(draft.items.get(date))&&await ctx.draftMode?.();
export async function saveWeek(ctx,draft){
  const dates=changedDates(draft),seq=ctx.session?.(),ok=[],fail=[],notices=[],sealed=[];
  for(const date of [...draft.items.keys()])if(!dates.includes(date))dropDay(draft,date);   // 고쳤다 되돌린 날은 쓸 것이 없다
  for(const date of dates){
    if(ctx.session?.()!==seq){fail.push({date,code:'MD_SIGNED_OUT_ELSEWHERE'});continue;}
    try{
      if(await sealedAlready(ctx,draft,date)){sealed.push({date});continue;}
      const r=await savePlanDay(ctx,{date,base:draft.base.get(date)??null,mine:{date,items:draft.items.get(date)}});
      if(r.sealed){sealed.push({date});draft.sealed?.set(date,stable(draft.items.get(date)));notices.push(...r.notices.filter(n=>n.code!=='PLAN_LOCAL_DRAFT'));continue;}
      ok.push({date,status:r.status});notices.push(...r.notices);dropDay(draft,date);
    }catch(e){
      if(unknownOutcome(e?.code)){e.savedDays=ok.length;throw e;}
      fail.push({date,code:e?.code??null});
    }
  }
  return {ok,fail,notices,sealed};
}
export function saveText(r){
  const kept=r.sealed?.length?r.sealed.length+'일은 '+PLAN_NOTICE_TEXT.PLAN_LOCAL_DRAFT+' 임시 입력은 그대로 있습니다.':null;
  if(!r.fail.length)return kept?(r.ok.length?r.ok.length+'일 저장 · ':'')+kept:r.ok.length+'일 계획을 저장했습니다.';
  const why=planErrorText(r.fail[0].code);
  const text=r.ok.length?r.ok.length+'일 저장 · '+r.fail.length+'일 다시 — '+why:why+' (바뀐 '+r.fail.length+'일은 임시 입력에 그대로 있습니다)';
  return kept?text+' · '+kept:text;
}

// ---------- 화면 ----------
const SVGNS='http://www.w3.org/2000/svg';
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const svg=(tag,attrs={},text=null)=>{const n=doc.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==null)n.textContent=String(text);return n;};
  return {el,add,button,svg};
}
// 줄 하나 = 작은 SVG 칸: 과목 색 테두리(계획), 실제 벽돌만큼 아래부터 금 채움, 글자 = 과목 한 글자 + 장 수.
function itemNode(h,r,{onTap,onLong}){
  const ratio=r.bricks>0?Math.min(1,r.got/r.bricks):0,kind=ratio>=1?'done':ratio>0?'part':'plan';
  const b=h.el('button',null,'pw-item '+kind);b.type='button';b.dataset.itemId=r.id;
  b.setAttribute('aria-label',r.name+' '+num(r.bricks)+'장'+(r.got>0?' · 실제 '+num(r.got)+'장':'')+(r.title!==r.name?' · '+r.title:''));
  const s=h.svg('svg',{class:'pw-item-svg',viewBox:'0 0 40 20',width:'100%','aria-hidden':'true'});
  if(ratio>0)s.append(h.svg('rect',{class:'pw-fill',x:1,y:1+18*(1-ratio),width:38,height:18*ratio,rx:2}));
  s.append(h.svg('rect',{class:'pw-item-box'+(kind==='plan'?' dashed':''),x:1,y:1,width:38,height:18,rx:3,stroke:r.color}),h.svg('text',{class:'pw-item-text',x:20,y:14},r.letter+num(r.bricks)));
  b.append(s);
  // 길게 누르기: 누른 시각과 뗀 시각의 차이로 판정(타이머 없음), 뗀 뒤에만 시트를 연다. 길게 누른 뒤 따라오는 click은 무시. contextmenu(마우스 오른쪽·안드로이드 길게 누르기)도 같다.
  let down=null,skip=false;
  b.addEventListener('pointerdown',e=>{down=Number(e?.timeStamp);});
  b.addEventListener('pointerup',e=>{const t=Number(e?.timeStamp);if(Number.isFinite(down)&&Number.isFinite(t)&&t-down>=LONG_PRESS_MS){skip=true;onLong();}down=null;});
  b.addEventListener('pointercancel',()=>{down=null;});
  b.addEventListener('contextmenu',e=>{e?.preventDefault?.();skip=true;down=null;onLong();});
  b.addEventListener('click',()=>{if(skip){skip=false;return;}onTap();});
  return b;
}
function subjectChip(h,s,on,pick){
  const key=SUBJECT_COLOR_KEYS[String(s.color).toUpperCase()]??null;
  const b=h.button(null,pick,'lb-chip pw-subject'+(key?' lb-chip-'+key:' lb-chip-custom')+(on?' selected':''));
  b.setAttribute('aria-pressed',String(on));b.dataset.subjectId=s.id;
  if(!key){const d=h.svg('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'});d.append(h.svg('circle',{cx:5,cy:5,r:5,fill:s.color}));b.append(d);}
  b.append(h.el('span',s.name));return b;
}

// st = 계획 탭 상태(life-plan createPlanState): st.monday를 같이 쓰고 초안은 st.week. opts.today(없으면 ctx.now). ctx.suggest(box,{fillWeek})가 있으면 "다음 주 채우기".
export function renderWeekGrid(ctx,st,{today=null}={}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h,day0=today??kstDate(ctx.now()),sess=ctx.session?.()??null;
  if(!st.week||st.week.session!==sess)st.week=createWeekDraft(sess);
  const w=st.week,monday=st.monday??=mondayOf(day0),whole=ctx.getWhole(),life=whole.life??null;
  const m=weekGridModel({life,study:whole.study??null,monday,today:day0,draft:w});
  if(w.pick&&!m.subjects.some(s=>s.id===w.pick))w.pick=null;
  const rerender=()=>{void ctx.rerender();};
  const say=(text,error=false)=>{w.message=text;w.error=error;w.notices=[];};
  const change=code=>{if(code)say(planErrorText(code),true);else if(w.error)say(null);rerender();};
  const nameOf=id=>m.subjects.find(s=>s.id===id)?.name??'기타';
  const sheetFor=(date,block,item)=>()=>openChipSheet(ctx,{date,block,item,
    onPut:(next,close)=>{const code=editDay(life,w,date,items=>{const i=items.findIndex(x=>x.id===item?.id);if(i>=0)items[i]=next;else items.push({...next,id:newItemId(items,ctx.uid)});return items;});if(code)return code;close();say('임시 입력에 넣었습니다 · 아직 저장 전');rerender();return null;},
    onDelete:item?close=>{const code=editDay(life,w,date,items=>items.filter(x=>x.id!==item.id));if(code)return code;close();say('임시 입력에서 지웠습니다 · 아직 저장 전');rerender();return null;}:null});
  const tap=(date,block)=>()=>{if(!w.pick){sheetFor(date,block,null)();return;}change(tapCell(life,w,{date,block,subjectId:w.pick,name:nameOf(w.pick),uid:ctx.uid}));};
  // "+n": 그 칸의 줄 전체 목록. 줄을 누르면 목록을 닫고 그 줄의 칩 시트를 연다(H37-P4).
  const listFor=(date,block,rows)=>()=>{
    let dlg=null;const box=el('div',null,'pt-sheet pw-cell-list');
    for(const r of rows){const b=button(r.name+' '+num(r.bricks)+'장'+(r.title!==r.name?' · '+r.title:''),()=>{dlg?.close?.();sheetFor(date,block,r)();},'secondary pw-cell-row');b.dataset.itemId=r.id;box.append(b);}
    dlg=ctx.sheet?.(dateLabel(date)+' · '+blockLabel(block),box)??null;
  };

  const out=el('section',null,'plan-card pw-week');out.id='plan-week';out.dataset.monday=monday;
  const nav=add(el('div',null,'plan-nav'),button('◀',()=>{st.monday=shiftDay(monday,-7);rerender();},'secondary'),el('strong',short(monday)+' ~ '+short(m.end),'plan-nav-label'),button('▶',()=>{st.monday=shiftDay(monday,7);rerender();},'secondary'));
  if(monday!==mondayOf(day0))nav.append(button('이번 주',()=>{st.monday=mondayOf(day0);rerender();},'secondary'));
  const head=weekHeadText(m);
  const timeLine=ctx.weekTimeLine?.(monday,day0)??null;   // FIX45 (AUD1 #6): 이 주 공부 시간·그 전 주 비교(study-stats, 앱이 넘긴다)
  add(out,nav,head?el('p',head,'plan-sum pw-sum'):null,timeLine?el('p',timeLine,'muted small pw-time'):null,m.rate!==null?el('p',RATE_MEANING,'muted small pw-rate-note'):null);   // FIX44 (AUD1 #16): 달성률의 뜻
  // FIX46B: 이번 주 과목 목표·"목표 대비" 줄(life-quest가 그린다, 앱이 넘겨 준다). 계획 달성률과 분모를 섞지 않는다.
  add(out,ctx.weekGoals?.({monday,state:m.state,subjects:m.subjects,actual:m.subjectActual,report:(text,error,notices)=>{w.message=text;w.error=error;w.notices=notices;}})??null);
  if(w.message)add(out,el('p',w.message,w.error?'notice error pw-message':'notice pw-message'));
  for(const n of w.notices)add(out,el('p',PLAN_NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060','notice plan-notice'));

  const grid=el('div',null,'pw-grid');grid.setAttribute('role','grid');grid.setAttribute('aria-label',short(monday)+' 주 계획, 칸 = 그 날 그 시간대');
  grid.append(el('span',null,'pw-corner'));
  for(const d of m.days){const c=add(el('span',null,'pw-dayhead'+(d.isToday?' today':'')+(d.changed?' changed':'')),el('strong',d.weekday),el('small',String(Number(d.date.slice(8,10)))));c.dataset.date=d.date;grid.append(c);}
  PLAN_BLOCKS.forEach((b,bi)=>{
    const lab=el('span',BLOCK_SHORT[b],'pw-block');lab.title=blockLabel(b);grid.append(lab);
    for(const d of m.days){
      const rows=d.cells[bi],cell=el('div',null,'pw-cell'+(d.isToday?' today':'')+(d.past?' past':'')+(rows.length?'':' empty'));cell.dataset.date=d.date;cell.dataset.block=b;
      for(const r of rows.slice(0,CELL_SHOW))cell.append(itemNode(h,r,{onTap:w.pick?tap(d.date,b):sheetFor(d.date,b,r),onLong:sheetFor(d.date,b,r)}));
      if(rows.length>CELL_SHOW){const more=button('+'+(rows.length-CELL_SHOW),listFor(d.date,b,rows),'pw-more');more.setAttribute('aria-label','숨은 줄 '+(rows.length-CELL_SHOW)+'개');cell.append(more);}
      const plus=button('+',tap(d.date,b),'pw-add');plus.setAttribute('aria-label',dateLabel(d.date)+' '+blockLabel(b)+(w.pick?' · '+nameOf(w.pick)+' 넣기':' · 줄 넣기'));cell.append(plus);
      grid.append(cell);
    }
  });
  grid.append(el('span','합','pw-block pw-total-label'));
  for(const d of m.days){
    const t=el('div',null,'pw-total');t.dataset.date=d.date;t.setAttribute('aria-label',dateLabel(d.date)+(d.planned>0?' 계획 '+barsText(d.planned):'')+(d.actual>0?' 실제 '+barsText(d.actual):''));
    t.append(el('span',d.planned>0?num(d.planned):null,'pw-total-plan'));
    const s=h.svg('svg',{class:'pw-total-bar',viewBox:'0 0 40 6',width:'100%',preserveAspectRatio:'none','aria-hidden':'true'});s.append(h.svg('rect',{class:'pw-total-bg',x:0,y:0,width:40,height:6,rx:2}));
    if(d.actual>0)s.append(h.svg('rect',{class:'pw-fill',x:0,y:0,width:40*Math.min(1,d.actual/m.maxDay),height:6,rx:2}));
    t.append(s);grid.append(t);
  }
  add(out,grid);

  const picks=el('div',null,'pt-chips pw-picks');picks.setAttribute('role','toolbar');picks.setAttribute('aria-label','넣을 과목');
  for(const s of m.subjects)picks.append(subjectChip(h,s,w.pick===s.id,()=>{w.pick=w.pick===s.id?null:s.id;rerender();}));
  if(!m.subjects.length)picks.append(el('p','보이는 과목이 없습니다. 오늘 탭의 습관 편집에서 과목을 추가하세요.','muted small'));
  add(out,picks,el('p',w.pick?nameOf(w.pick)+' 고름 · 칸의 +를 누르면 1장, 같은 칸 다시 누르면 +0.5장 · 길게 누르면 고치기·지우기':'과목을 고르고 칸을 누르세요 · 고르지 않고 누르면 칩 시트','muted small pw-hint'));

  const n=m.changed.length,buttons=el('div',null,'buttons pw-actions');
  const hasLast=m.days.some(d=>!dayItems(life,w,d.date).length&&planOf(life,shiftDay(d.date,-7))?.items?.length);
  const last=button('지난주처럼',()=>{const k=copyLastWeek(life,w,monday);say(k?'지난주 계획을 '+k+'일에 넣었습니다 · 아직 저장 전':'넣을 빈 날이 없습니다.',!k);rerender();},'secondary pw-last');
  if(!hasLast){last.disabled=true;last.setAttribute('aria-disabled','true');last.title='계획이 빈 날에 넣을 지난주 계획이 없습니다';}
  add(buttons,last);
  if(ctx.suggest){
    add(buttons,button('다음 주 채우기',()=>{
      const box=el('div',null,'pw-suggest');let dlg=null;
      ctx.suggest(box,{fillWeek:plan=>{const r=fillFromSuggest(ctx.getWhole().life??null,w,plan,ctx.uid);st.monday=plan.monday;say(r.bad.length?planErrorText(r.bad[0].code)+' (넣은 날 '+r.n+'일)':'제안을 '+r.n+'일에 넣었습니다 · 확인하고 저장하세요',r.bad.length>0);dlg?.close?.();rerender();}});
      dlg=ctx.sheet?.('다음 주 채우기',box)??null;
    },'secondary pw-next'));
  }
  if(n)add(buttons,button('임시 입력 버리기',()=>{st.week=createWeekDraft(sess);st.week.pick=w.pick;rerender();},'secondary pw-drop'));
  const save=button('저장 (바뀐 날 '+n+')',()=>{
    if(!changedDates(w).length)return;
    void ctx.perform(async()=>{
      let r;
      try{r=await saveWeek(ctx,w);}
      catch(e){   // 결과 모름: 남은 날은 쓰지 않았다. 화면에 알리고 앱의 perform→fail로 넘긴다(새로 저장하지 말고 확인).
        w.message=(e?.savedDays?e.savedDays+'일 저장 · ':'')+planErrorText(e?.code);w.error=true;w.notices=[];w.failed=[];
        try{await ctx.rerender();}catch{/* 안내가 먼저다 */}
        throw e;
      }
      w.message=saveText(r);w.error=r.fail.length>0;w.notices=r.notices;w.failed=r.fail.map(f=>f.date);await ctx.rerender();
    });
  },'primary pw-save');
  if(!n){save.disabled=true;save.setAttribute('aria-disabled','true');}
  add(out,add(buttons,save));
  return out;
}
