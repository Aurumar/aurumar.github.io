// P1B: "오늘 계획" 카드 + 칩 시트. 오늘 탭(life-ui)과 계획 탭 '일' 보기(life-plan)가 같은 함수 renderTodayPlan을 그린다(앱이 ctx.todayPlan으로 넘겨 준다).
// 설계: AUTOPILOT\design\P1D_PLAN_CALENDAR_DESIGN.md 2.2·2.5. 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style·외부 라이브러리 없음), 과목 색은 SVG fill 속성, 그 밖의 색은 styles.css 토큰.
// 기록을 쓰는 곳은 commitPlan() 하나(기존 savePlanDay = PLAN_DAY 1개 = 연산 1, 겹치면 줄 id 3자 병합)이고, 칩 시트의 "넣기"·"지우기"와 빈 날의 "어제처럼" 단추에서만 부른다.
// 열기·그리기·칩 고르기·[▶ 집중]은 기록을 쓰지 않는다. [▶ 집중]·"끝내고 담기"는 넘겨받은 focus 포트(life-ui)가 기존 타이머(lb.life.timer)와 기존 finishTimer(STUDY_DAY 세션, R34B 시작 시각 id)를 그대로 쓴다.
// V6A: 계획 줄 입력 = 과목 · 세부내용 · 시간대만(장수 입력 없음, 새 줄 bricks = 1). 줄 상태는 공부 세션을 자동으로 붙여 센다(life-plan linkPlan): 안 함 / 조각 / 완료 n장.
// 이 기기 저장소에는 손 완료 표시(lb.plan.link, life-plan writePlanMarks)만 적는다(화면 설정, 기록 아님, 실패해도 무시). 새 기록 종류·필드 0.
// 달성 분모 = 오늘까지의 계획: 오늘보다 뒤 날짜의 계획은 "계획 n개"만 보인다(아직 오지 않은 날의 계획으로 낮아 보이지 않게).
import {lifeDefs,kstDate,shiftDay,hhmmFromIso,validateLifeData,SUBJECT_COLOR_KEYS,PLAN_BLOCKS,MAX_PLAN_TITLE} from './life-model.mjs';
import {achieve,previewAchieve} from './life-achieve.mjs';
import {timerElapsedMin,liveTick} from './study-stage.mjs';
import {planOf,daySummary,copyPlan,savePlanDay,planErrorText,PLAN_NOTICE_TEXT,barsText,dateLabel,BLOCK_TEXT,NO_SUBJECT_COLOR,blockOfIso,daySessions,linkPlan,readPlanMarks,writePlanMarks,itemStateText,oldTarget,NEW_ITEM_BRICKS} from './life-plan.mjs';

// V6F: 화면에는 약자(M·L·D·N / M·A·E·N)를 쓰지 않고 한글 시간대만(오전·오후·저녁·밤). 저장값은 M·A·E·N 그대로.
export const BLOCK_SHORT=BLOCK_TEXT;
export const blockLabel=b=>BLOCK_TEXT[b];

// ---------- 계산(시계·저장소·DOM 없음) ----------
// 지금 시각(KST)으로 시간대를 미리 고른다: 05~11시 오전, 12~17시 오후, 18~21시 저녁, 22~04시 밤(세션 연결과 같은 규칙).
export const blockOfNow=blockOfIso;
// 세부내용은 PLAN_DAY에서 1~40자 필수라, 비우면 과목 이름을 넣는다(저장 형식 그대로).
export const titleOr=(title,subjectName)=>{const t=String(title??'').trim();return t||[...String(subjectName)].slice(0,MAX_PLAN_TITLE).join('');};
export const rateUntilToday=(rate,date,today)=>date>today?null:rate;
// V6F: 줄 상태 글자는 한 벌(안 함 · 조각 · 완료 n장, 오지 않은 날은 "계획"). 타이머가 이 줄에서 돌면 상태 글자 대신 따로 ⏱ 표시를 붙인다.
// [▶ 집중]은 오늘 줄이면 사라지지 않고 흐리게 + 이유 한 줄. 이유가 null이면 누를 수 있다.
export const FOCUS_WHY=Object.freeze({HERE:'이 줄에서 집중 중',TIMER:'다른 집중 타이머가 도는 중',DONE:'이미 완료한 줄',NO_SUBJECT:'과목이 없는 줄(습관 편집에서 과목 확인)'});
export const focusWhy=({isToday,timer,sub,state,doing=false})=>!isToday?null:state==='DONE'?FOCUS_WHY.DONE:timer?(doing?FOCUS_WHY.HERE:FOCUS_WHY.TIMER):sub===null?FOCUS_WHY.NO_SUBJECT:null;

// 카드 한 장의 내용. timer = 기기 저장소 타이머 {subjectId,startIso,itemId?,endIso?}, draft = 아직 쌓지 않은 오늘 공부 카드(있으면 그 세션도 연결해 보여 준다, 저장 0).
// marks = 이 기기의 손 완료·"다른 항목으로" 값(life-plan readPlanMarks). 타이머에 itemId가 있으면 "집중 중"은 그 줄에만, 없으면 같은 과목의 첫 미완료 줄에.
// planned·achieved·rate(벽돌 기준)는 위젯 숫자 파일이 그대로 읽는다(화면 머리줄은 줄 수 기준).
export function todayPlanModel({life=null,study=null,date,today,timer=null,draft=null,marks=null}){
  const defs=lifeDefs(life),subjects=new Map(defs.subjects.map(s=>[s.id,s])),isToday=date===today,future=date>today;
  const ach=draft&&isToday?previewAchieve({life,study,today,studyCard:draft}):achieve({life,study,today});
  const sum=daySummary(life,ach,date),link=linkPlan(sum.items,daySessions(study,date,isToday?draft:null),marks??{});
  const byId=isToday&&timer&&typeof timer.itemId==='string'&&sum.items.some(x=>x.id===timer.itemId)?timer.itemId:null;
  const bySubject=isToday&&timer&&!byId?sum.items.find(x=>x.subjectId===timer.subjectId&&link.rows.get(x.id).state!=='DONE')?.id??null:null;
  const rows=sum.items.map(x=>{
    const r=link.rows.get(x.id),sub=subjects.get(x.subjectId)??null,doing=byId===x.id||bySubject===x.id;
    const kind=future?'plan':doing&&r.state!=='DONE'?'doing':r.state.toLowerCase();
    return {id:x.id,subjectId:x.subjectId,name:sub?.name??'기타',color:sub?.color??NO_SUBJECT_COLOR,title:x.title,showTitle:x.title!==(sub?.name??''),bricks:x.bricks,block:x.block,
      oldTarget:oldTarget(x),state:r.state,got:r.bricks+r.pieces*0.5,linkedBricks:r.bricks,minutes:r.minutes,manual:r.manual,kind,text:itemStateText(r,future),doing:kind==='doing',
      timerHere:byId===x.id,canFocus:isToday&&!timer&&sub!==null&&r.state!=='DONE',focusWhy:focusWhy({isToday,timer,sub,state:r.state,doing})};
  });
  const rate=rateUntilToday(sum.rate,date,today),prev=planOf(life,shiftDay(date,-1));
  const head=!rows.length?null:future?'계획 '+rows.length+'개':'계획 '+link.total+'개 중 '+link.done+'개 달성';
  const outside=future?[]:link.outside;
  // FIX68 (HUNT65 F7): 손 완료 표시(marks)한 줄은 그 줄 목표 장수를 채운 것으로 친 벽돌 달성(상태 내보내기 plan_done). 손 완료가 없으면 achieved와 같다.
  const achievedMarked=future?sum.achieved:Math.min(sum.planned,sum.achieved+rows.filter(r=>r.manual).reduce((n,r)=>n+Math.max(0,r.bricks-Math.min(r.got,r.bricks)),0));
  return {date,today,isToday,future,rows,planned:sum.planned,achieved:sum.achieved,achievedMarked,rate,head,empty:!rows.length,hasPrev:Boolean(prev?.items?.length),
    itemsTotal:link.total,itemsDone:link.done,outside,outsideBricks:outside.reduce((n,s)=>n+s.bricks+s.pieces*0.5,0),
    title:isToday?'오늘 계획':dateLabel(date)+' 계획',timerItem:byId};
}

// ---------- 기록 쓰기(한 곳) ----------
// 지금 그 날 계획(base)에 change를 적용한 초안을 검사한 뒤 기존 savePlanDay로 저장한다. 검사에 걸리면 쓰지 않고 오류 코드를 돌려준다(시트에 보임).
// FIX38 (R37C 위험 4): 임시 저장 모드(sealed)는 성공이 아니다. "넣었습니다"라고 말하지 않고, 칩 시트와 입력을 그대로 다시 연다(reopen). 같은 내용을 또 봉인하지 않는다(H37-P1과 같은 방식).
const SEALED_TEXT='임시 저장됨(동기화 전) · 아직 계획표에 보이지 않습니다 · 연결한 뒤 연결 · 장치의 임시 저장 목록에서 "승인하고 쌓기"를 누르세요.';
function commitPlan(ctx,state,date,change,okText,before=()=>{},reopen=null,undoing=false){
  const base=structuredClone(planOf(ctx.getWhole().life??null,date)),mine={date,items:change(structuredClone(base?.items??[]))};
  try{validateLifeData('PLAN_DAY',date,mine);}catch(e){return e?.code??'INVALID_PLAN_DAY';}
  before();
  void ctx.perform(async()=>{
    Object.assign(state,{date,message:null,error:false,notices:[],undo:null});
    let sealed=false;
    const key=JSON.stringify(mine);
    try{
      if(state.sealedAs===key&&await ctx.draftMode?.())sealed=true;
      else{
        const r=await savePlanDay(ctx,{date,base,mine});
        if(r.sealed){sealed=true;state.sealedAs=key;state.notices=r.notices.filter(n=>n.code!=='PLAN_LOCAL_DRAFT');}
        else{state.sealedAs=null;state.message=r.status==='SAVED'?okText:'이미 같은 계획이 저장되어 있습니다.';state.notices=r.notices;state.undo=r.status==='SAVED'&&!undoing?{date,items:structuredClone(base?.items??[])}:null;}   // V6F (지시서 3): 되돌리기 1회
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

// 칩 시트: 과목 칩 1탭 + "넣기" 1탭 = 줄 1개. V6A: 입력은 과목 · 시간대 · 세부내용뿐(장수 없음). 시간대는 지금 시각으로 미리 고른다. item이 있으면 그 줄 고치기·지우기.
// 새 줄의 bricks 칸은 NEW_ITEM_BRICKS, 고치는 줄은 저장된 값을 그대로 둔다(예전 목표는 지우지 않는다).
// onPut(item,close) / onDelete(close)는 오류 코드(쓰지 않음) 또는 null(시트를 닫고 저장 시작)을 돌려준다. 시트 안에서는 아무것도 쓰지 않는다.
// block = 새 줄의 시간대를 미리 고를 값(P1A 주간 격자는 누른 칸의 블록). 없으면 지금 시각으로.
export function openChipSheet(ctx,{date,item=null,block=null,onPut,onDelete=null}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h;
  const defs=lifeDefs(ctx.getWhole().life??null),subjects=defs.subjects.filter(s=>!s.hidden||s.id===item?.subjectId),nameOf=id=>subjects.find(s=>s.id===id)?.name??'기타';
  const pick={subjectId:item&&subjects.some(s=>s.id===item.subjectId)?item.subjectId:null,block:item?.block??(PLAN_BLOCKS.includes(block)?block:blockOfNow(ctx.now()))};
  const body=el('div',null,'pt-sheet'),err=el('p',null,'notice error pt-sheet-error'),note=el('p',null,'notice pt-sheet-note');err.hidden=true;note.hidden=true;
  const showErr=text=>{err.textContent=text;err.hidden=false;};
  const what=el('input');what.type='text';what.value=item&&item.title!==nameOf(item.subjectId)?item.title:'';
  what.setAttribute('maxlength',String(MAX_PLAN_TITLE));what.setAttribute('aria-label','세부내용');what.setAttribute('placeholder','세부내용 (비우면 과목 이름)');
  const subjRow=el('div',null,'pt-chips'),blockRow=el('div',null,'pt-chips');
  const chipBtn=(label,selected,fn,cls='')=>{const b=button(label,()=>{fn();err.hidden=true;draw();},'lb-chip'+cls+(selected?' selected':''));b.setAttribute('aria-pressed',String(selected));return b;};
  const draw=()=>{
    subjRow.replaceChildren();
    for(const s of subjects){
      const key=SUBJECT_COLOR_KEYS[String(s.color).toUpperCase()]??null,on=pick.subjectId===s.id;
      const b=button(null,()=>{pick.subjectId=s.id;err.hidden=true;draw();},'lb-chip pt-subject'+(key?' lb-chip-'+key:' lb-chip-custom')+(on?' selected':''));
      b.setAttribute('aria-pressed',String(on));b.dataset.subjectId=s.id;if(!key)b.append(h.dot(s.color));b.append(el('span',s.name));subjRow.append(b);
    }
    if(!subjects.length)subjRow.append(el('p','보이는 과목이 없습니다. 오늘 탭의 습관 편집에서 과목을 추가하세요.','muted small'));
    blockRow.replaceChildren(...PLAN_BLOCKS.map(b=>chipBtn(blockLabel(b),pick.block===b,()=>{pick.block=b;})));
  };
  draw();
  let dlg=null;
  const close=()=>dlg?.close?.();
  const title=dateLabel(date)+(item?' · 계획 줄 고치기':' · 계획 줄 넣기');
  const reopen=text=>{note.textContent=text;note.hidden=false;dlg=ctx.sheet?.(title,body)??null;};
  const put=()=>{
    if(!pick.subjectId){showErr('과목을 고르세요.');return;}
    const next={id:item?.id??'p'+ctx.uid().slice(0,10),subjectId:pick.subjectId,title:titleOr(what.value,nameOf(pick.subjectId)),bricks:item?.bricks??NEW_ITEM_BRICKS,block:pick.block};
    const code=onPut(next,close,reopen);if(code)showErr(planErrorText(code));
  };
  const old=oldTarget(item);
  // 단추는 위에 둔다(시트가 스크롤돼도 "넣기"가 보인다).
  add(body,add(el('div',null,'buttons'),item&&onDelete?button('지우기',()=>{const code=onDelete(close,reopen);if(code)showErr(planErrorText(code));},'secondary'):null,button(item?'고치기':'넣기',put,'primary')),err,note,
    add(el('div',null,'pt-sheet-row'),el('span','과목','pt-sheet-label'),subjRow),
    add(el('div',null,'pt-sheet-row'),el('span','시간대','pt-sheet-label'),blockRow),add(el('div',null,'pt-sheet-row'),el('span','세부내용','pt-sheet-label'),what),
    el('p','벽돌 장수는 적지 않아요 · 공부 벽돌에서 이 과목을 공부하면 자동으로 채워져요'+(old!==null?' · 예전 목표 '+barsText(old)+'(그대로 둠)':''),'muted small pt-sheet-hint'));
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
  const day=today??kstDate(ctx.now()),d=date??day,timer=focus?.timer?.()??null,store=ctx.storage??globalThis.localStorage;
  const m=todayPlanModel({life,study:whole.study??null,date:d,today:day,timer,draft,marks:readPlanMarks(store,d)});
  const out=el('section',null,'pt-card'+(m.isToday?' today':''));out.id=m.isToday?'today-plan':'';out.dataset.date=d;
  const put=(item,close,reopen)=>commitPlan(ctx,state,d,items=>{const i=items.findIndex(x=>x.id===item.id);if(i<0)items.push(item);else items[i]=item;return items;},m.isToday?'오늘 계획에 넣었습니다.':'계획에 넣었습니다.',close,reopen);
  const sheetFor=item=>()=>openChipSheet(ctx,{date:d,item,onPut:put,onDelete:item?(close,reopen)=>commitPlan(ctx,state,d,items=>items.filter(x=>x.id!==item.id),'계획 줄을 지웠습니다.',close,reopen):null});
  const plus=button('+',sheetFor(null),'secondary pt-add');plus.setAttribute('aria-label','계획 줄 넣기');
  add(out,add(el('div',null,'pt-head'),el('h3',m.title,'pt-title'),m.head?el('span',m.head,'pt-sum'):null,m.empty?null:plus));
  if(state.message&&state.date===d){
    const msg=add(el('p',state.message,state.error?'notice error pt-message':'notice pt-message'));
    if(state.undo?.date===d){const u=state.undo;add(msg,el('span',' · 저장됨 ','pt-saved'),button('되돌리기',()=>{state.undo=null;const code=commitPlan(ctx,state,d,()=>structuredClone(u.items),'저장 전 계획으로 되돌렸습니다.',()=>{},null,true);if(code){Object.assign(state,{date:d,message:planErrorText(code),error:true,notices:[]});void ctx.rerender();}},'secondary pt-undo'));}
    add(out,msg);
  }
  if(state.date===d)for(const n of state.notices??[])add(out,el('p',PLAN_NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060','notice pt-notice'));
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
    const row=el('div',null,'pt-row '+r.kind);row.dataset.itemId=r.id;row.dataset.state=r.state;
    const tag=button(null,sheetFor({id:r.id,subjectId:r.subjectId,title:r.title,bricks:r.bricks,block:r.block}),'pt-tag'+(r.got>0||r.manual?'':' dashed'));
    tag.setAttribute('aria-label',r.name+' 계획 고치기');tag.append(h.dot(r.color),el('span',r.name));
    // V6A: 미터 = 벽돌 1장(완료 기준)까지 채움. 글자 = 안 함 / 조각 / 완료 n장. 예전에 정한 목표 장수는 보조 글자로만.
    add(row,el('span',blockLabel(r.block),'pt-block'),tag,r.showTitle?el('span',r.title,'pt-what'):el('span',null,'pt-what'),
      meter(h,r.manual?1:r.got,1,r.name+' '+r.text),el('span',r.text,'pt-status '+r.kind),r.doing?(()=>{const t=el('span','⏱','pt-doing');t.setAttribute('aria-label','이 줄 타이머 진행 중');t.title='이 줄 타이머 진행 중';return t;})():null,
      r.oldTarget!==null?el('span','예전 목표 '+barsText(r.oldTarget),'muted small pt-old'):null);
    if(!m.future){   // 손 완료 표시(기본은 자동). 이 기기 화면 설정에만 적는다. V6F: 글자는 ✓ 하나(폭이 줄마다 같게), 켜짐은 색·aria로.
      const c=button('✓',()=>{writePlanMarks(store,d,k=>{k.done=k.done.includes(r.id)?k.done.filter(x=>x!==r.id):[...k.done,r.id];});void ctx.rerender();},'secondary pt-check'+(r.manual?' on':''));
      c.setAttribute('aria-pressed',String(r.manual));c.setAttribute('aria-label',r.name+(r.manual?' 완료 표시 취소':' 손으로 완료 표시'));c.title=r.manual?'손으로 완료 표시됨 · 다시 누르면 취소':'손으로 완료 표시';add(row,c);
    }
    if(r.canFocus&&focus){const f=button('▶ 집중',()=>{focus.start(r.subjectId,r.id);},'primary pt-focus');f.setAttribute('aria-label',r.name+' 집중 시작');add(row,f);}
    else if(focus&&r.focusWhy){   // V6F: 사라지지 않고 흐리게 + 이유 한 줄
      const f=button('▶ 집중',()=>{},'primary pt-focus pt-focus-off');f.disabled=true;f.setAttribute('aria-disabled','true');f.setAttribute('aria-label',r.name+' 집중 시작 못 함 · '+r.focusWhy);f.title=r.focusWhy;
      add(row,f,el('span',r.focusWhy,'muted small pt-focus-why'));
    }
    out.append(row);
    if(r.timerHere&&timer&&focus){
      // 화면을 그린 때의 분을 붙들지 않는다(AV2): 글자는 다시 계산하고, 담을 분은 포트가 누른 순간의 시각으로 구한다.
      const text=()=>(timer.endIso?'담기 대기 · ':'집중 중 · ')+hhmmFromIso(timer.startIso)+' 시작 · '+timerElapsedMin(timer.startIso,timer.endIso??ctx.now())+'분',label=el('span',text(),'pt-timer-text');
      liveTick(label,doc,()=>{label.textContent=text();});
      add(out,add(el('div',null,'pt-timer'),label,button('끝내고 담기',()=>focus.finish(),'primary'),button('취소',()=>focus.cancel(),'secondary')));
      out.dataset.focusItem=r.id;
    }
  }
  if(m.outside.length)add(out,el('p','계획 밖 공부 '+barsText(m.outsideBricks)+' · '+[...new Set(m.outside.map(s=>lifeDefs(life).subjects.find(x=>x.id===s.subjectId)?.name??'기타'))].join(', '),'muted small pt-outside'));
  return out;
}
