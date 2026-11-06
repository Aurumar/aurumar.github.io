// P1B: "오늘 계획" 카드 + 칩 시트. 오늘 탭(life-ui)과 계획 탭 '일' 보기(life-plan)가 같은 함수 renderTodayPlan을 그린다(앱이 ctx.todayPlan으로 넘겨 준다).
// 설계: AUTOPILOT\design\P1D_PLAN_CALENDAR_DESIGN.md 2.2·2.5. 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style·외부 라이브러리 없음), 과목 색은 SVG fill 속성, 그 밖의 색은 styles.css 토큰.
// 기록을 쓰는 곳은 commitPlan() 하나(기존 savePlanDay = PLAN_DAY 1개 = 연산 1, 겹치면 줄 id 3자 병합)이고, 칩 시트의 "넣기"·"지우기"와 빈 날의 "어제처럼" 단추에서만 부른다.
// 열기·그리기·칩 고르기·[▶ 집중]은 기록을 쓰지 않는다. [▶ 집중]·"끝내고 담기"는 넘겨받은 focus 포트(life-ui)가 기존 타이머(lb.life.timer)와 기존 finishTimer(STUDY_DAY 세션, R34B 시작 시각 id)를 그대로 쓴다.
// 이 기기 저장소에는 칩 시트의 마지막 벽돌 수(lb.plan.chip)만 적는다(화면 설정, 기록 아님, 실패해도 무시). 새 기록 종류·필드 0.
// 달성률 분모 = 오늘까지의 계획: 오늘보다 뒤 날짜의 계획은 달성률을 내지 않는다(아직 오지 않은 날의 계획으로 낮아 보이지 않게).
import {lifeDefs,kstDate,shiftDay,hhmmFromIso,validateLifeData,SUBJECT_COLOR_KEYS,PLAN_BLOCKS,MAX_PLAN_TITLE,MAX_PLAN_BRICKS} from './life-model.mjs';
import {achieve,previewAchieve} from './life-achieve.mjs';
import {timerElapsedMin,liveTick} from './study-stage.mjs';
import {planOf,daySummary,itemStatuses,copyPlan,savePlanDay,planErrorText,PLAN_NOTICE_TEXT,barsText,rateText,dateLabel,BLOCK_TEXT,NO_SUBJECT_COLOR} from './life-plan.mjs';

export const CHIP_KEY='lb.plan.chip';
export const BLOCK_SHORT=Object.freeze({M:'M',A:'L',E:'D',N:'N'});   // 화면 글자(소유자 계획표 M·L·D·N). 저장값은 M·A·E·N 그대로
export const BRICK_CHIPS=Object.freeze([0.5,1,2,3,4]);
export const blockLabel=b=>BLOCK_SHORT[b]+' '+BLOCK_TEXT[b];
const num=v=>Number.isInteger(v)?String(v):v.toFixed(1);
const validBricks=b=>Number.isFinite(b)&&b>=0.5&&b<=MAX_PLAN_BRICKS&&Number.isInteger(b*2);
const DONE_KINDS=Object.freeze(['ignite','gold','done']);

// ---------- 계산(시계·저장소·DOM 없음) ----------
// 지금 시각(KST)으로 시간대를 미리 고른다: 05~11시 오전, 12~17시 오후, 18~21시 저녁, 22~04시 밤.
export function blockOfNow(nowIso){const h=Number(hhmmFromIso(nowIso).slice(0,2));return h>=22||h<5?'N':h<12?'M':h<18?'A':'E';}
export const stepBricks=(b,d)=>Math.min(MAX_PLAN_BRICKS,Math.max(0.5,b+d*0.5));
// 할 일은 PLAN_DAY에서 1~40자 필수라, 비우면 과목 이름을 넣는다(저장 형식 그대로).
export const titleOr=(title,subjectName)=>{const t=String(title??'').trim();return t||[...String(subjectName)].slice(0,MAX_PLAN_TITLE).join('');};
export function readChipPrefs(storage){try{const v=JSON.parse(storage?.getItem(CHIP_KEY)??'null'),b=Number(v?.bricks);return {bricks:validBricks(b)?b:1};}catch{return {bricks:1};}}
function writeChipPrefs(storage,p){try{storage?.setItem(CHIP_KEY,JSON.stringify({bricks:p.bricks}));}catch{/* 화면 설정은 실패해도 무시 */}}
export const rateUntilToday=(rate,date,today)=>date>today?null:rate;

// 카드 한 장의 내용. timer = 기기 저장소 타이머 {subjectId,startIso,itemId?,endIso?}, draft = 아직 쌓지 않은 오늘 공부 카드(있으면 실제 벽돌에 넣어 보여 준다, 저장 0).
// 줄 ↔ 실제 벽돌은 지금처럼 같은 과목을 줄 순서대로 채운다(itemStatuses). 타이머에 itemId가 있으면 "집중 중"은 그 줄에만 붙는다.
export function todayPlanModel({life=null,study=null,date,today,timer=null,draft=null}){
  const defs=lifeDefs(life),subjects=new Map(defs.subjects.map(s=>[s.id,s])),isToday=date===today;
  const ach=draft&&isToday?previewAchieve({life,study,today,studyCard:draft}):achieve({life,study,today});
  const sum=daySummary(life,ach,date);
  const byId=isToday&&timer&&typeof timer.itemId==='string'&&sum.items.some(x=>x.id===timer.itemId)?timer.itemId:null;
  const status=itemStatuses(sum.items,sum.actual,isToday&&timer&&!byId?timer.subjectId:null);
  const left=new Map([...sum.actual.bySubject].map(([k,s])=>[k,s.value]));
  const rows=sum.items.map(x=>{
    const have=left.get(x.subjectId)??0,got=Math.min(have,x.bricks),s0=status.get(x.id),sub=subjects.get(x.subjectId)??null;left.set(x.subjectId,have-got);
    const kind=byId===x.id&&got<x.bricks?'doing':s0.kind;
    const text={ignite:'시동 ✓',gold:s0.text,done:'완료',part:null,doing:'집중 중',plan:'아직'}[kind];
    return {id:x.id,subjectId:x.subjectId,name:sub?.name??'기타',color:sub?.color??NO_SUBJECT_COLOR,title:x.title,showTitle:x.title!==(sub?.name??''),bricks:x.bricks,block:x.block,got,kind,text,
      timerHere:byId===x.id,canFocus:isToday&&!timer&&sub!==null&&!DONE_KINDS.includes(kind)};
  });
  const rate=rateUntilToday(sum.rate,date,today),prev=planOf(life,shiftDay(date,-1));
  const head=!rows.length?null:date>today?'계획 '+barsText(sum.planned):barsText(sum.planned)+' 중 '+barsText(sum.achieved)+(rate!==null?' · '+rateText(rate):'');
  return {date,today,isToday,rows,planned:sum.planned,achieved:sum.achieved,rate,head,empty:!rows.length,hasPrev:Boolean(prev?.items?.length),
    title:isToday?'오늘 계획':dateLabel(date)+' 계획',timerItem:byId};
}

// ---------- 기록 쓰기(한 곳) ----------
// 지금 그 날 계획(base)에 change를 적용한 초안을 검사한 뒤 기존 savePlanDay로 저장한다. 검사에 걸리면 쓰지 않고 오류 코드를 돌려준다(시트에 보임).
// FIX38 (R37C 위험 4): 임시 저장 모드(sealed)는 성공이 아니다. "넣었습니다"라고 말하지 않고, 칩 시트와 입력을 그대로 다시 연다(reopen). 같은 내용을 또 봉인하지 않는다(H37-P1과 같은 방식).
const SEALED_TEXT='임시 저장됨(동기화 전) · 아직 계획표에 보이지 않습니다 · 연결한 뒤 연결 · 장치의 임시 저장 목록에서 "승인하고 쌓기"를 누르세요.';
function commitPlan(ctx,state,date,change,okText,before=()=>{},reopen=null){
  const base=structuredClone(planOf(ctx.getWhole().life??null,date)),mine={date,items:change(structuredClone(base?.items??[]))};
  try{validateLifeData('PLAN_DAY',date,mine);}catch(e){return e?.code??'INVALID_PLAN_DAY';}
  before();
  void ctx.perform(async()=>{
    Object.assign(state,{date,message:null,error:false,notices:[]});
    let sealed=false;
    const key=JSON.stringify(mine);
    try{
      if(state.sealedAs===key&&await ctx.draftMode?.())sealed=true;
      else{
        const r=await savePlanDay(ctx,{date,base,mine});
        if(r.sealed){sealed=true;state.sealedAs=key;state.notices=r.notices.filter(n=>n.code!=='PLAN_LOCAL_DRAFT');}
        else{state.sealedAs=null;state.message=r.status==='SAVED'?okText:'이미 같은 계획이 저장되어 있습니다.';state.notices=r.notices;}
      }
      if(sealed)state.message=SEALED_TEXT;
    }
    catch(e){state.message=planErrorText(e?.code);state.error=true;}
    await ctx.rerender();
    if(sealed&&!ctx.locked?.())reopen?.(SEALED_TEXT);   // 잠겼으면 다시 열지 않는다(열린 모달은 로그인 칸을 막는다, H37-S2)
  });
  return null;
}

// ---------- 화면 ----------
const SVGNS='http://www.w3.org/2000/svg';
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const svg=(tag,attrs={})=>{const n=doc.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const dot=color=>{const s=svg('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'});s.append(svg('circle',{cx:5,cy:5,r:5,fill:color}));return s;};
  return {el,add,button,svg,dot};
}
export const createTodayPlanState=()=>({date:null,message:null,error:false,notices:[]});
const SHARED=createTodayPlanState();

// 칩 시트: 과목 칩 1탭 + "넣기" 1탭 = 줄 1개. 벽돌은 마지막에 쓴 값, 시간대는 지금 시각으로 미리 고른다. item이 있으면 그 줄 고치기·지우기.
// onPut(item,close) / onDelete(close)는 오류 코드(쓰지 않음) 또는 null(시트를 닫고 저장 시작)을 돌려준다. 시트 안에서는 아무것도 쓰지 않는다.
// block = 새 줄의 시간대를 미리 고를 값(P1A 주간 격자는 누른 칸의 블록). 없으면 지금 시각으로.
export function openChipSheet(ctx,{date,item=null,block=null,onPut,onDelete=null}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h,store=ctx.storage??globalThis.localStorage;
  const defs=lifeDefs(ctx.getWhole().life??null),subjects=defs.subjects.filter(s=>!s.hidden||s.id===item?.subjectId),nameOf=id=>subjects.find(s=>s.id===id)?.name??'기타';
  const pick={subjectId:item&&subjects.some(s=>s.id===item.subjectId)?item.subjectId:null,bricks:item?.bricks??readChipPrefs(store).bricks,block:item?.block??(PLAN_BLOCKS.includes(block)?block:blockOfNow(ctx.now()))};
  const body=el('div',null,'pt-sheet'),err=el('p',null,'notice error pt-sheet-error'),note=el('p',null,'notice pt-sheet-note');err.hidden=true;note.hidden=true;
  const showErr=text=>{err.textContent=text;err.hidden=false;};
  const what=el('input');what.type='text';what.value=item&&item.title!==nameOf(item.subjectId)?item.title:'';
  what.setAttribute('maxlength',String(MAX_PLAN_TITLE));what.setAttribute('aria-label','할 일');what.setAttribute('placeholder','할 일 (비우면 과목 이름)');
  const subjRow=el('div',null,'pt-chips'),brickRow=el('div',null,'pt-chips'),blockRow=el('div',null,'pt-chips');
  const chipBtn=(label,selected,fn,cls='')=>{const b=button(label,()=>{fn();err.hidden=true;draw();},'lb-chip'+cls+(selected?' selected':''));b.setAttribute('aria-pressed',String(selected));return b;};
  const draw=()=>{
    subjRow.replaceChildren();
    for(const s of subjects){
      const key=SUBJECT_COLOR_KEYS[String(s.color).toUpperCase()]??null,on=pick.subjectId===s.id;
      const b=button(null,()=>{pick.subjectId=s.id;err.hidden=true;draw();},'lb-chip pt-subject'+(key?' lb-chip-'+key:' lb-chip-custom')+(on?' selected':''));
      b.setAttribute('aria-pressed',String(on));b.dataset.subjectId=s.id;if(!key)b.append(h.dot(s.color));b.append(el('span',s.name));subjRow.append(b);
    }
    if(!subjects.length)subjRow.append(el('p','보이는 과목이 없습니다. 오늘 탭의 습관 편집에서 과목을 추가하세요.','muted small'));
    brickRow.replaceChildren(button('−',()=>{pick.bricks=stepBricks(pick.bricks,-1);draw();},'secondary pt-step'),el('strong',barsText(pick.bricks),'pt-step-value'),button('+',()=>{pick.bricks=stepBricks(pick.bricks,1);draw();},'secondary pt-step'),
      ...BRICK_CHIPS.map(v=>chipBtn(num(v),pick.bricks===v,()=>{pick.bricks=v;})));
    blockRow.replaceChildren(...PLAN_BLOCKS.map(b=>chipBtn(blockLabel(b),pick.block===b,()=>{pick.block=b;})));
  };
  draw();
  let dlg=null;
  const close=()=>dlg?.close?.();
  const title=dateLabel(date)+(item?' · 계획 줄 고치기':' · 계획 줄 넣기');
  const reopen=text=>{note.textContent=text;note.hidden=false;dlg=ctx.sheet?.(title,body)??null;};
  const put=()=>{
    if(!pick.subjectId){showErr('과목을 고르세요.');return;}
    writeChipPrefs(store,{bricks:pick.bricks});
    const next={id:item?.id??'p'+ctx.uid().slice(0,10),subjectId:pick.subjectId,title:titleOr(what.value,nameOf(pick.subjectId)),bricks:pick.bricks,block:pick.block};
    const code=onPut(next,close,reopen);if(code)showErr(planErrorText(code));
  };
  // 단추는 위에 둔다(시트가 스크롤돼도 "넣기"가 보인다).
  add(body,add(el('div',null,'buttons'),item&&onDelete?button('지우기',()=>{const code=onDelete(close,reopen);if(code)showErr(planErrorText(code));},'secondary'):null,button(item?'고치기':'넣기',put,'primary')),err,note,
    add(el('div',null,'pt-sheet-row'),el('span','과목','pt-sheet-label'),subjRow),add(el('div',null,'pt-sheet-row'),el('span','벽돌','pt-sheet-label'),brickRow),
    add(el('div',null,'pt-sheet-row'),el('span','시간대','pt-sheet-label'),blockRow),add(el('div',null,'pt-sheet-row'),el('span','할 일','pt-sheet-label'),what));
  dlg=ctx.sheet?.(title,body)??null;
  return {body,pick,put};
}

function meter(h,got,bricks,label){
  const s=h.svg('svg',{class:'pt-meter',viewBox:'0 0 40 8',width:40,height:8,role:'img','aria-label':label});
  s.append(h.svg('rect',{class:'pt-meter-bg',x:0,y:0,width:40,height:8,rx:2}));
  if(got>0)s.append(h.svg('rect',{class:'pt-meter-fill',x:0,y:0,width:40*Math.min(1,got/bricks),height:8,rx:2}));
  return s;
}
// opts: date(그릴 날), today, focus(life-ui 포트: timer()·start(subjectId,itemId)·finish()·cancel()·message(), 없으면 [▶ 집중] 없음), draft(쌓지 않은 오늘 공부 카드),
// focusMessage(포트의 담기 결과 문구를 카드에 보일지 — 계획 탭처럼 오늘 화면 문구가 안 보이는 곳), state(저장 결과 문구).
export function renderTodayPlan(ctx,{date=null,today=null,focus=null,draft=null,focusMessage=false,state=SHARED}={}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h,whole=ctx.getWhole(),life=whole.life??null;
  const day=today??kstDate(ctx.now()),d=date??day,timer=focus?.timer?.()??null;
  const m=todayPlanModel({life,study:whole.study??null,date:d,today:day,timer,draft});
  const out=el('section',null,'pt-card'+(m.isToday?' today':''));out.id=m.isToday?'today-plan':'';out.dataset.date=d;
  const put=(item,close,reopen)=>commitPlan(ctx,state,d,items=>{const i=items.findIndex(x=>x.id===item.id);if(i<0)items.push(item);else items[i]=item;return items;},m.isToday?'오늘 계획에 넣었습니다.':'계획에 넣었습니다.',close,reopen);
  const sheetFor=item=>()=>openChipSheet(ctx,{date:d,item,onPut:put,onDelete:item?(close,reopen)=>commitPlan(ctx,state,d,items=>items.filter(x=>x.id!==item.id),'계획 줄을 지웠습니다.',close,reopen):null});
  const plus=button('+',sheetFor(null),'secondary pt-add');plus.setAttribute('aria-label','계획 줄 넣기');
  add(out,add(el('div',null,'pt-head'),el('h3',m.title,'pt-title'),m.head?el('span',m.head,'pt-sum'):null,m.empty?null:plus));
  if(state.message&&state.date===d)add(out,el('p',state.message,state.error?'notice error pt-message':'notice pt-message'));
  if(state.date===d)for(const n of state.notices??[])add(out,el('p',PLAN_NOTICE_TEXT[n.code]??n.code,'notice pt-notice'));
  const fm=focusMessage?focus?.message?.():null;if(fm)add(out,el('p',fm.text,fm.error?'notice error pt-message':'notice pt-message'));
  if(m.empty){
    const prevText=m.isToday?'어제처럼':'전날처럼';
    const copy=button(prevText,()=>{
      const prev=planOf(ctx.getWhole().life??null,shiftDay(d,-1));if(!prev?.items?.length)return;
      const code=commitPlan(ctx,state,d,()=>copyPlan(prev,d,i=>'p'+ctx.uid().slice(0,10)+i.toString(36)).items,(m.isToday?'어제':'전날')+' 계획을 넣었습니다.');
      if(code){Object.assign(state,{date:d,message:planErrorText(code),error:true,notices:[]});void ctx.rerender();}
    },'secondary pt-copy');
    if(!m.hasPrev){copy.disabled=true;copy.setAttribute('aria-disabled','true');copy.title=(m.isToday?'어제':'전날')+' 계획이 없습니다';}
    add(out,add(el('div',null,'button-row pt-empty'),button(m.isToday?'+ 오늘 계획':'+ 계획',sheetFor(null),'primary pt-first'),copy));
    return out;
  }
  for(const r of m.rows){
    const row=el('div',null,'pt-row '+r.kind);row.dataset.itemId=r.id;
    const tag=button(null,sheetFor({id:r.id,subjectId:r.subjectId,title:r.title,bricks:r.bricks,block:r.block}),'pt-tag'+(r.got>0?'':' dashed'));
    tag.setAttribute('aria-label',r.name+' 계획 고치기');tag.append(h.dot(r.color),el('span',r.name));
    add(row,el('span',blockLabel(r.block),'pt-block'),tag,r.showTitle?el('span',r.title,'pt-what'):el('span',null,'pt-what'),
      meter(h,r.got,r.bricks,r.name+' '+num(r.got)+' / '+num(r.bricks)+'장'),el('span',num(r.got)+'/'+num(r.bricks)+'장','pt-count'),r.text?el('span',r.text,'pt-status '+r.kind):null);
    if(r.canFocus&&focus){const f=button('▶ 집중',()=>{focus.start(r.subjectId,r.id);},'primary pt-focus');f.setAttribute('aria-label',r.name+' 집중 시작');add(row,f);}
    out.append(row);
    if(r.timerHere&&timer&&focus){
      // 화면을 그린 때의 분을 붙들지 않는다(AV2): 글자는 다시 계산하고, 담을 분은 포트가 누른 순간의 시각으로 구한다.
      const text=()=>(timer.endIso?'담기 대기 · ':'집중 중 · ')+hhmmFromIso(timer.startIso)+' 시작 · '+timerElapsedMin(timer.startIso,timer.endIso??ctx.now())+'분',label=el('span',text(),'pt-timer-text');
      liveTick(label,doc,()=>{label.textContent=text();});
      add(out,add(el('div',null,'pt-timer'),label,button('끝내고 담기',()=>focus.finish(),'primary'),button('취소',()=>focus.cancel(),'secondary')));
      out.dataset.focusItem=r.id;
    }
  }
  return out;
}
