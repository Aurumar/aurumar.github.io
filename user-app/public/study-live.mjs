// STUDY LIVE 덮개 (S1A). 설계: AUTOPILOT\design\S1D_STUDY_LIVE_DESIGN.md §2·§4·§8. 저장 0·서버 쓰기 0·네트워크 0. 합성 데이터로만 시험한다.
// 시계는 1초씩 더하지 않고 째깍마다 시작 시각에서 다시 구한다(liveClock). 화면 꺼짐·탭 전환·앱 재시작 뒤에도 값이 맞다.
// 타이머 칸(시작·끝·휴식)을 쓰는 것은 life-ui다. 이 모듈은 받은 값으로 그리고, 단추는 life-ui가 넘긴 함수를 부른다.
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음). 링은 createElementNS로 만든 SVG와 속성으로 그린다. 색은 styles.css 토큰만.
// 공부방 장면(S1B)·소리·토스트(S1C)는 여기 없다. 그쪽은 liveState 모양과 onBrick(n,gold) 사건만 쓴다.
import {timerElapsedMin,timerRecordMin,todayEffectOf,artFile,AVATAR_ART_READY,lifetimeMinutes,stageOf,cardMinutes,hmText} from './study-stage.mjs';
import {BRICK_MINUTES,PIECE_MIN_MINUTES,SUBJECT_COLOR_KEYS,brickOf,sumBricks,kstDate,shiftDay,nearestExam,timerSessionId} from './life-model.mjs';
import {XP} from './life-achieve.mjs';
import {sessionMark} from './study-rebase.mjs';
import {liveRoom} from './study-room.mjs';

const SEC_MS=1000,MIN_MS=60000;
export const MAX_LIVE_MS=1440*MIN_MS;          // 24시간(저장 상한 1440분과 같다)
export const TICK_SLACK_MS=15;                 // 정수 초 경계 바로 뒤에 깨어나게
export const REST_SPLIT_MS=30*MIN_MS;          // 휴식 합이 이보다 길면 "이어서" 때 앞부분을 먼저 담는다(V4 결정 S1D D2)
export const OVERLAP_MIN_MS=MIN_MS;            // 다른 타이머와 1분 이상 겹칠 때만 띠(B6·FIX34 H6과 같은 기준)
export const LIVE_SETTINGS_KEY='lb.live.settings.v1';
const BRICK_MS=BRICK_MINUTES*MIN_MS,PIECE_MS=PIECE_MIN_MINUTES*MIN_MS,GOLD_MS=XP.GOLD_MINUTES*MIN_MS;
const restOK=ms=>Number.isFinite(ms)&&ms>0?ms:0;
const two=n=>String(n).padStart(2,'0');
const secOf=ms=>Math.floor(Math.max(0,ms)/SEC_MS);
export const hmsText=ms=>{const s=secOf(ms);return two(Math.floor(s/3600))+':'+two(Math.floor(s/60)%60)+':'+two(s%60);};
export const msText=ms=>{const s=secOf(ms);return two(Math.floor(s/60))+':'+two(s%60);};
const hmsShort=ms=>{const s=secOf(ms);return Math.floor(s/3600)+':'+two(Math.floor(s/60)%60)+':'+two(s%60);};

// ---- 계산(저장하지 않음) ----
// 공부 시간 = (끝 시각 ?? 휴식 시작 ?? 지금) − 시작 − 휴식 합. 0 아래로 가지 않고 24시간에서 멈춘다.
export function liveClock({startIso,endIso=null,pausedAt=null,restMs=0,nowMs}){
  const start=Date.parse(startIso),end=endIso?Date.parse(endIso):NaN,pause=pausedAt&&!endIso?Date.parse(pausedAt):NaN;
  const stop=Number.isFinite(end)?end:Number.isFinite(pause)?pause:nowMs,rest=restOK(restMs);
  const raw=Number.isFinite(start)&&Number.isFinite(stop)?Math.max(0,stop-start-rest):0,studyMs=Math.min(MAX_LIVE_MS,raw);
  const restNowMs=Number.isFinite(pause)&&Number.isFinite(nowMs)?Math.max(0,nowMs-pause):0;
  return {studyMs,restMs:rest,restNowMs,frozen:Number.isFinite(end)||Number.isFinite(pause)||raw>=MAX_LIVE_MS,text:hmsText(studyMs),overDay:raw>=MAX_LIVE_MS};
}
// 표시·저장할 분. 끝 시각이 있으면 그 시각, 휴식 중이면 휴식 시작 시각까지(그 뒤의 휴식은 공부가 아니다).
const stopIso=(t,nowIso)=>t.endIso??t.pausedAt??nowIso;
export const liveElapsedMin=(t,nowIso)=>timerElapsedMin(t.startIso,stopIso(t,nowIso),t.restMs??0);
export const liveRecordMin=(t,nowIso)=>timerRecordMin(t.startIso,stopIso(t,nowIso),t.restMs??0);

// 이 세션의 벽돌(세션 단위, 30분 = 1장, 10~29분 = 조각). 링 단위는 코드 상수를 읽는다.
export function brickClock(studyMs){
  const ms=Math.min(MAX_LIVE_MS,secOf(studyMs)*SEC_MS),b=brickOf(Math.floor(ms/MIN_MS)),into=ms%BRICK_MS;
  return {bricks:b.bricks,pieces:b.pieces,gold:ms>=GOLD_MS,part:into/BRICK_MS,
    beforePiece:ms<PIECE_MS,toPieceMs:ms<PIECE_MS?PIECE_MS-ms:0,toBrickMs:BRICK_MS-into,toGoldMs:Math.max(0,GOLD_MS-ms)};
}
const cardOf=(study,date,draftCard)=>draftCard&&draftCard.date===date?draftCard:[...(study?.days??[])].reverse().find(d=>d?.date===date)?.data??null;
const okMin=m=>Number.isInteger(m)&&m>0&&m<=1440;
// 월요일(KST)부터 어제까지 쌓은 카드 분(날짜별 한 장). 오늘은 따로 더한다. 월요일 규칙은 life-achieve와 같다.
export const mondayOf=date=>shiftDay(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
export function weekBeforeMinutes(study,date){
  const from=mondayOf(date),byDate=new Map();
  for(const d of study?.days??[])if(typeof d?.date==='string'&&d.date>=from&&d.date<date)byDate.set(d.date,d.data);
  let sum=0;for(const card of byDate.values())sum+=cardMinutes(card);
  return sum;
}
// 진행 중 구간 [시작, 지금]과 1분 이상 겹치는 다른 타이머(T) 세션의 겹친 분. 이 타이머 자신(같은 id)은 빼고, 자동 삭제·차감은 없다.
export function liveOverlapMin(card,timer,nowMs){
  const start=Date.parse(timer?.startIso),stop=timer?.endIso?Date.parse(timer.endIso):timer?.pausedAt?Date.parse(timer.pausedAt):nowMs;
  if(!Number.isFinite(start)||!Number.isFinite(stop)||stop<=start)return 0;
  const own=timerSessionId(timer.subjectId,timer.startIso,timer.tag);
  let ms=0;
  for(const s of card?.sessions??[]){
    if(s?.id===own||sessionMark(s?.id)!=='T'||!okMin(s.confirmedMin))continue;
    const at=Date.parse(s.at);if(!Number.isFinite(at))continue;
    const o=Math.min(stop,at)-Math.max(start,at-s.confirmedMin*MIN_MS);if(o>0)ms+=o;
  }
  return ms>=OVERLAP_MIN_MS?Math.round(ms/MIN_MS):0;
}

// 화면이 쓰는 투영 하나(S1B·S1C가 쓰는 공개 모양: clock·todayMin·weekMin·bricks·roomInputs). 같은 입력이면 같은 값.
// 오늘 = 지금의 KST 날짜. 자정을 넘기면 새 날 카드(0) + 진행 중 세션 전체(세션은 끝 시각 날짜 카드에 담기므로 기록될 곳과 같다).
export function liveState({timer,nowIso,study=null,draftCard=null,exams=null,goalBricks=null}){
  const nowMs=Date.parse(nowIso),date=kstDate(nowIso),clock=liveClock({...timer,nowMs}),session=brickClock(clock.studyMs);
  // FIX37C (H37-S6): 담기 저장이 실패해 타이머가 남으면 같은 세션이 이미 카드에 있다. 진행 중 세션으로 한 번만 센다(같은 시작 시각 = 같은 세션 id).
  const start=Date.parse(timer.startIso),ownId=Number.isFinite(start)?timerSessionId(timer.subjectId,timer.startIso,timer.tag):null,raw=cardOf(study,date,draftCard);
  const card=raw&&ownId!==null&&raw.sessions?.some?.(x=>x?.id===ownId)?{...raw,sessions:raw.sessions.filter(x=>x?.id!==ownId)}:raw,cardMin=cardMinutes(card),todayMs=cardMin*MIN_MS+clock.studyMs,todayMin=Math.floor(todayMs/MIN_MS);
  const day=sumBricks((card?.sessions??[]).map(s=>s?.confirmedMin).filter(okMin)),own=brickOf(Math.floor(clock.studyMs/MIN_MS));
  const bricks={bricks:day.bricks+own.bricks,pieces:day.pieces+own.pieces,value:day.value+own.bricks+own.pieces*0.5,goal:Number.isInteger(goalBricks)?goalBricks:null};
  const weekMin=weekBeforeMinutes(study,date)+todayMin,stage=stageOf(lifetimeMinutes(study)).stage,fx=todayEffectOf(todayMin);
  const oldStart=Number.isFinite(Date.parse(timer.startIso))&&kstDate(timer.startIso)<shiftDay(date,-1);   // FIX34 H5: 어제보다 오래된 시작은 "언제 끝났나요"로 담는다
  return {date,clock,session,todayMs,todayMin,weekMin,bricks,exam:nearestExam(exams,date),overlapMin:liveOverlapMin(card,timer,nowMs),oldStart,ownId,
    roomInputs:{date,todayMin,bricks:{bricks:bricks.bricks,pieces:bricks.pieces,value:bricks.value},sessionBricks:session.bricks,gold:session.gold,stageNo:stage.no,art:fx.art,effectLevel:fx.level}};
}

// 설정(S1C가 화면을 만든다). 지금은 "열기 자동"만 읽는다. 기본 켬.
export function liveSettings(storage){
  let v=null;try{v=JSON.parse(storage?.getItem(LIVE_SETTINGS_KEY)??'null');}catch{v=null;}
  return {autoOpen:v?.autoOpen!==false};
}

// ---- 벽돌 완성 사건(S1B 모션·S1C 소리가 듣는다). 축하 중복 방지는 듣는 쪽 몫이다(설계 §3.2). ----
const brickListeners=new Set();
export function onBrick(fn){brickListeners.add(fn);return ()=>{brickListeners.delete(fn);};}
function emitBrick(n,gold){for(const fn of [...brickListeners]){try{fn(n,gold);}catch{/* 듣는 쪽 오류는 시계를 멈추지 않는다 */}}}
// 덮개 위 띠에 얹는 단추(S1C 🔈). 그 모듈을 못 불러오면 없다.
let topExtra=null;
export const setLiveTopExtra=fn=>{topExtra=fn;};

// ---- 째깍: 다음 정수 초 경계 + 15ms에 다시 건다(setInterval의 누적 지연 없음). 숨김이면 멈추고, 보이면·돌아오면 곧바로 다시 계산한다. node가 화면에서 빠지면 스스로 멈춘다. ----
export const nextTickDelay=nowMs=>SEC_MS-((nowMs%SEC_MS)+SEC_MS)%SEC_MS+TICK_SLACK_MS;
export function secondTick(node,{doc=null,win=null,run,nowMs=()=>Date.now(),setT=globalThis.setTimeout,clearT=globalThis.clearTimeout,onStop=()=>{}}){
  let id=null,stopped=false;
  const clear=()=>{if(id!==null){clearT(id);id=null;}};
  const gone=()=>node?.isConnected===false;
  const arm=()=>{clear();if(stopped)return;id=setT(step,nextTickDelay(nowMs()));id?.unref?.();};
  function step(){id=null;if(stopped)return;if(gone()){stop();return;}if(doc?.visibilityState==='hidden')return;run();arm();}
  function wake(){if(stopped)return;if(gone()){stop();return;}if(doc?.visibilityState==='hidden'){clear();return;}run();arm();}
  function stop(){if(stopped)return;stopped=true;clear();doc?.removeEventListener?.('visibilitychange',wake);win?.removeEventListener?.('pageshow',wake);win?.removeEventListener?.('focus',wake);onStop();}
  doc?.addEventListener?.('visibilitychange',wake);win?.addEventListener?.('pageshow',wake);win?.addEventListener?.('focus',wake);
  arm();
  return stop;
}
// 다른 탭이 타이머 칸(lb.life.timer*)을 바꾸면 알린다(휴식·끝내고 담기·취소가 따라온다). key가 null이면 저장소 전체 비움.
export function watchTimerStorage(win,onChange){
  const h=e=>{const k=e?.key;if(k===null||String(k??'').startsWith('lb.life.timer'))onChange();};
  win?.addEventListener?.('storage',h);
  return ()=>win?.removeEventListener?.('storage',h);
}

// ---- 화면 ----
const SVG_NS='http://www.w3.org/2000/svg';
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const svg=(tag,attrs={})=>{const n=doc.createElementNS?doc.createElementNS(SVG_NS,tag):doc.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  return {el,add,button,svg};
}
const r2=v=>Math.round(v*100)/100;
// 벽돌 링: 한 바퀴 = 벽돌 1장(BRICK_MINUTES). PIECE_MIN_MINUTES마다 눈금, 조각 경계 눈금은 따로 표시. 매초 바뀌는 것은 채움의 stroke-dasharray와 가운데 글자뿐.
function brickRing(h,size){
  const {svg}=h,stroke=Math.max(6,Math.round(size/12)),r=(size-stroke)/2-2,mid=size/2,c=2*Math.PI*r;
  const n=svg('svg',{class:'live-ring',width:size,height:size,viewBox:'0 0 '+size+' '+size,role:'img'});
  const fill=svg('circle',{class:'live-ring-fill',cx:mid,cy:mid,r:r2(r),'stroke-width':stroke,'stroke-dasharray':'0 '+r2(c),transform:'rotate(-90 '+mid+' '+mid+')'});
  n.append(svg('circle',{class:'live-ring-track',cx:mid,cy:mid,r:r2(r),'stroke-width':stroke}),fill);
  for(let m=0;m<BRICK_MINUTES;m+=PIECE_MIN_MINUTES){
    const a=m/BRICK_MINUTES*2*Math.PI-Math.PI/2,i=r-stroke/2-1,o=r+stroke/2+1;
    n.append(svg('line',{class:'live-ring-tick'+(m===PIECE_MIN_MINUTES?' piece':''),x1:r2(mid+i*Math.cos(a)),y1:r2(mid+i*Math.sin(a)),x2:r2(mid+o*Math.cos(a)),y2:r2(mid+o*Math.sin(a))}));
  }
  const label=svg('text',{class:'live-ring-text',x:mid,y:mid});n.append(label);
  const paint=s=>{
    fill.setAttribute('stroke-dasharray',r2(c*s.part)+' '+r2(c));
    n.setAttribute('class','live-ring'+(s.gold?' gold':''));
    label.textContent='벽돌 '+s.bricks+'장';
    n.setAttribute('aria-label','이번 세션 벽돌 '+s.bricks+'장'+(s.pieces?' + 조각 1':'')+(s.gold?' · 금벽돌':''));
  };
  return {node:n,paint};
}
function subjectChip(h,subject){
  const {el,svg}=h,key=SUBJECT_COLOR_KEYS[String(subject?.color??'').toUpperCase()]??null;
  const n=el('span',subject?.name??'과목','lb-chip selected live-subject'+(key?' lb-chip-'+key:''));
  if(!key&&subject?.color){const dot=svg('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'}),c=svg('circle',{cx:5,cy:5,r:5,fill:subject.color});dot.append(c);n.replaceChildren(dot,subject.name);}
  return n;
}
const stateText=(t,s)=>t.endIso?'담기 대기 · 끝 시각이 적혔어요':s.clock.overDay||s.oldStart?'오래 켜진 타이머 · 끝내고 담기를 누르면 끝난 시각을 물어요':t.pausedAt?'휴식 중 '+msText(s.clock.restNowMs):'집중 중';
const nextText=s=>s.session.beforePiece?'조각까지 '+msText(s.session.toPieceMs):'다음 벽돌까지 '+msText(s.session.toBrickMs);
const goldText=s=>s.session.gold?'금벽돌 달성 · XP ×'+XP.GOLD_MULT:'금벽돌까지 '+hmsShort(s.session.toGoldMs);
const bricksText=s=>'오늘 벽돌 '+s.bricks.bricks+'장'+(s.bricks.pieces?' + 조각 '+s.bricks.pieces:'')+(s.bricks.goal?' / 목표 '+s.bricks.goal+'장':'');
const examText=e=>e?e.name+' '+(e.dDay===0?'D-DAY':'D-'+e.dDay):'시험 일정 없음';
const restOver=(t,s)=>Boolean(t.pausedAt)&&!t.endIso&&s.clock.restMs+s.clock.restNowMs>REST_SPLIT_MS;

// 작은 카드(오늘 화면 맨 위) + 덮개(open일 때). 단추 동작은 on.* (life-ui). 반환: {card, dialog, stop}.
// on = {finish, pause, resume, expand, collapse, storage}. 덮개를 닫아도(작게 보기) 타이머는 멈추지 않는다. note = 덮개에 보일 한 줄(R42: 덮개가 오늘 화면의 안내를 가리므로).
export function renderLive(ctx,{timer,subject,open=false,draftCard=null,exams=null,goalBricks=null,note=null,on={}}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h,win=doc.defaultView??null;
  const read=()=>liveState({timer,nowIso:String(ctx.now()),study:ctx.getWhole()?.study??null,draftCard,exams,goalBricks});
  let s=read();
  const startDate=s.date,last={bricks:s.session.bricks,gold:s.session.gold};

  // 작은 카드: HH:MM:SS + 링 + 펼치기
  const miniClock=el('strong',s.clock.text,'live-clock live-mini-clock'),miniState=el('span',stateText(timer,s),'muted small live-mini-state'),miniRing=brickRing(h,64);
  const card=add(el('section',null,'panel live-mini'+(timer.pausedAt?' resting':'')),miniRing.node,add(el('div',null,'live-mini-text'),el('span','STUDY LIVE · '+(subject?.name??'과목'),'eyebrow'),miniClock,miniState),
    button('펼치기',()=>on.expand?.(),'primary live-expand'));
  card.id='live-mini';

  let dialog=null,parts=null,showT=null;
  if(open){
    const clock=el('strong',s.clock.text,'live-clock'),state=el('p',stateText(timer,s),'live-state'+(timer.pausedAt?' resting':timer.endIso?' waiting':''));
    clock.setAttribute('role','timer');clock.setAttribute('aria-label','이번 세션 공부 시간');
    const todaySec=el('span','오늘 '+hmsShort(s.todayMs),'muted small live-today-sec'),ring=brickRing(h,120);
    const next=el('p',nextText(s),'live-next'),gold=el('p',goldText(s),'live-gold'+(s.session.gold?' done':''));
    const todayChip=el('span','오늘 '+hmText(s.todayMin),'live-chip'),weekChip=el('span','이번 주 '+hmText(s.weekMin),'live-chip');
    const examChip=add(el('span',examText(s.exam),'live-chip live-dday'),s.exam?.status==='잠정'?el('span','잠정','life-badge'):null);
    const bricks=el('p',bricksText(s),'live-bricks'),overlap=el('p',null,'notice live-overlap'),restNote=el('p','30분 넘게 쉬었어요 · 이어서를 누르면 앞부분을 먼저 담고 새로 시작해요','notice live-rest-over');
    const paintBands=()=>{overlap.textContent=s.overlapMin?'다른 기기에서 담은 타이머 '+s.overlapMin+'분이 지금 시간과 겹쳐요 · 끝낼 때 한쪽만 담으세요':'';overlap.hidden=!s.overlapMin;restNote.hidden=!restOver(timer,s);};
    paintBands();
    // 장면 자리(S1B가 공부방 레이어를 얹는다). 지금은 기존 아바타 그림만. 그림을 못 불러오면 그림만 숨긴다.
    const stage=el('div',null,'room-stage');
    let fig=null;
    if(ctx.avatarArt??AVATAR_ART_READY){fig=el('img',null,'st-fig-art live-fig');fig.alt='';fig.setAttribute('aria-hidden','true');fig.src=artFile(s.roomInputs.stageNo,s.roomInputs.art);fig.addEventListener('error',()=>{fig.hidden=true;});add(stage,fig);}
    const room=liveRoom(ctx,{stage,state:s,timer,draftCard});   // S1B: 그림 위 앞 겹 + 넓은 화면 좌우 날개(study-room). liveState는 읽기만 한다
    const restBtn=timer.endIso?null:button(timer.pausedAt?'이어서':'휴식',()=>{if(timer.pausedAt)on.resume?.();else on.pause?.();},'secondary live-rest');
    const full=doc.fullscreenEnabled?button('전체 화면',()=>{void dialog.requestFullscreen?.()?.catch?.(()=>{});},'secondary live-full'):null;
    const close=button('×',()=>on.collapse?.(),'secondary live-close');close.setAttribute('aria-label','작게 보기');
    dialog=add(el('dialog',null,'live-dlg'+(timer.pausedAt?' resting':'')),
      add(el('div',null,'live-top'),subjectChip(h,subject),el('span','STUDY LIVE','eyebrow'),topExtra?.(h)??null,full,close),
      add(el('div',null,'live-body'),room.node,add(el('div',null,'live-panel'),
        state,clock,todaySec,
        add(el('div',null,'live-ring-row'),ring.node,add(el('div',null,'live-ring-side'),next,gold)),
        add(el('div',null,'live-chips'),todayChip,weekChip,examChip),bricks,overlap,restNote,note?el('p',note,'notice live-note'):null,
        add(el('div',null,'live-actions'),restBtn,button('끝내고 담기',()=>on.finish?.(),'primary live-finish'),button('작게 보기',()=>on.collapse?.(),'secondary live-small')))));
    dialog.setAttribute('aria-label','STUDY LIVE 집중 화면');
    ring.paint(s.session);
    // Esc = 작게 보기(덮개만 접음). PC Space = 휴식/이어서. 끝내고 담기는 단축키가 없다(실수 방지).
    dialog.addEventListener('cancel',e=>{e?.preventDefault?.();on.collapse?.();});
    dialog.addEventListener('keydown',e=>{
      if(e?.key!==' '||e.repeat||timer.endIso)return;
      const tag=String(e.target?.tagName??'').toUpperCase();if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
      e.preventDefault?.();if(timer.pausedAt)on.resume?.();else on.pause?.();
    });
    dialog.addEventListener('keyup',e=>{if(e?.key===' '){const tag=String(e.target?.tagName??'').toUpperCase();if(tag!=='INPUT'&&tag!=='SELECT'&&tag!=='TEXTAREA')e.preventDefault?.();}});   // 초점이 단추에 있어도 Space가 그 단추를 누르지 않게
    parts={clock,state,todaySec,ring,next,gold,todayChip,weekChip,bricks,fig,paintBands,room};
    // 화면에 붙은 뒤에 모달로 띄운다(붙기 전에는 showModal을 부를 수 없다)
    const show=()=>{if(dialog.isConnected!==false&&!dialog.open){try{dialog.showModal?.();}catch{/* 이미 열림 등 */}}};
    showT=globalThis.setTimeout(show,0);showT?.unref?.();
  }
  miniRing.paint(s.session);

  let stopWatch=()=>{},stopTick=()=>{};
  const paint=()=>{
    if(!ctx.getWhole()){stopAll();return;}   // FIX37C (H37-S2): 잠기면(확정 기록 사본을 비움) 벽돌 사건·축하 칸 쓰기 없이 멈춘다. 잠금을 풀면 새로 그린다
    const iso=String(ctx.now());
    if(kstDate(iso)!==startDate){stopAll();void ctx.rerender?.();return;}   // 자정을 넘기면 오늘 카드부터 다시 읽는다
    s=read();
    miniClock.textContent=s.clock.text;miniState.textContent=stateText(timer,s);miniRing.paint(s.session);
    if(parts){
      parts.clock.textContent=s.clock.text;parts.state.textContent=stateText(timer,s);parts.todaySec.textContent='오늘 '+hmsShort(s.todayMs);
      parts.ring.paint(s.session);parts.next.textContent=nextText(s);parts.gold.textContent=goldText(s);parts.gold.className='live-gold'+(s.session.gold?' done':'');
      parts.todayChip.textContent='오늘 '+hmText(s.todayMin);parts.weekChip.textContent='이번 주 '+hmText(s.weekMin);parts.bricks.textContent=bricksText(s);parts.paintBands();
      if(parts.fig&&!parts.fig.hidden){const src=artFile(s.roomInputs.stageNo,s.roomInputs.art);if(parts.fig.src!==src&&!String(parts.fig.src).endsWith('/'+src))parts.fig.src=src;}
      parts.room.update(s);
    }
    if(s.session.bricks>last.bricks||s.session.gold&&!last.gold)emitBrick(s.session.bricks,s.session.gold);
    last.bricks=s.session.bricks;last.gold=s.session.gold;
  };
  if(on.storage)stopWatch=watchTimerStorage(win,()=>{stopAll();on.storage();});
  stopTick=secondTick(card,{doc,win,run:paint,nowMs:()=>Date.parse(String(ctx.now())),onStop:()=>stopWatch()});
  function stopAll(){stopTick();stopWatch();if(showT!==null){globalThis.clearTimeout(showT);showT=null;}}
  return {card,dialog,stop:stopAll,state:()=>s,paint};
}
