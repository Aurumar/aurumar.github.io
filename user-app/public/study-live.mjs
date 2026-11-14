// STUDY LIVE 덮개 (S1A). 설계: AUTOPILOT\design\S1D_STUDY_LIVE_DESIGN.md §2·§4·§8. 저장 0·서버 쓰기 0·네트워크 0. 합성 데이터로만 시험한다.
// 시계는 1초씩 더하지 않고 째깍마다 시작 시각에서 다시 구한다(liveClock). 화면 꺼짐·탭 전환·앱 재시작 뒤에도 값이 맞다.
// 타이머 칸(시작·끝·휴식)을 쓰는 것은 life-ui다. 이 모듈은 받은 값으로 그리고, 단추는 life-ui가 넘긴 함수를 부른다.
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음). 링은 createElementNS로 만든 SVG와 속성으로 그린다. 색은 styles.css 토큰만.
// 공부방 장면(S1B)·소리·토스트(S1C)는 여기 없다. 그쪽은 liveState 모양과 onBrick(n,gold) 사건만 쓴다.
import {timerElapsedMin,timerRecordMin,todayEffectOf,artFile,AVATAR_ART_READY,lifetimeMinutes,stageOf,cardMinutes,hmText} from './study-stage.mjs';
import {countedMinutes} from './study-stage.mjs';   // V6F (지시서 7): 분 집계는 담은(COMPLETED) 세션만
import {BRICK_MINUTES,PIECE_MIN_MINUTES,SUBJECT_COLOR_KEYS,brickOf,sumBricks,kstDate,shiftDay,nearestExam,timerSessionId} from './life-model.mjs';
import {XP} from './life-achieve.mjs';
import {sessionMark} from './study-rebase.mjs';
import {liveRoom} from './study-room.mjs';
import {brickCells} from './study-room.mjs';   // DS1: 오늘 벽돌 칸(공부방 기둥과 같은 금 벽돌 스프라이트)
import {TODAY_EFFECTS,todayStepsOf,stepRangeText,leftClockText,stepHoursText,nextLeftText,STUDY_STAGES} from './study-stage.mjs';   // DS5·AV5: 오늘 상태 6단계 격자
import {reducedMotion,avatarStage,avatarFxLayer} from './study-room.mjs';   // AV5: 격자 썸네일·덮개 아바타 = 같은 기본 그림 + 효과 층
import {dailyCharOf} from './study-stage.mjs';   // AV8: 덮개 큰 그림 = 오늘의 캐릭터(0h~12h), 평생 등급 그림은 모서리 배지
import {ddayChips,ddayChipsNode} from './life-plan.mjs';   // V6A: D-day 두 칩(오늘 카드·계획 탭과 같은 함수)
import {DAILY_CHARS,dailyStepsOf,dailyNextText,dailyNeedText,dailyMoreText} from './study-stage.mjs';   // V7A: 화면의 "오늘 상태"(AV5 효과) 띠 → 오늘의 캐릭터 13단계 띠 + 미리보기

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
  const day=sumBricks(countedMinutes(card?.sessions)),own=brickOf(Math.floor(clock.studyMs/MIN_MS));
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
// DS1 (설계 V5 §2.8 b): 채움은 금속 공식(deep 바깥 띠 · gold 몸 · hi 안쪽 선, 같은 비율), 가운데는 숫자 크게 + "벽돌" 작게.
function brickRing(h,size){
  const {svg}=h,stroke=Math.max(6,Math.round(size/12)),r=(size-stroke)/2-2,mid=size/2,c=2*Math.PI*r;
  const n=svg('svg',{class:'live-ring',width:size,height:size,viewBox:'0 0 '+size+' '+size,role:'img'});
  const band=(cls,rr,w)=>({node:svg('circle',{class:cls,cx:mid,cy:mid,r:r2(rr),'stroke-width':r2(w),'stroke-dasharray':'0 '+r2(2*Math.PI*rr),transform:'rotate(-90 '+mid+' '+mid+')'}),c:2*Math.PI*rr});
  const fill=band('live-ring-fill',r,stroke),deep=band('live-ring-deep',r+stroke*.3,stroke*.4),hi=band('live-ring-hi',r-stroke*.3,Math.max(1,stroke*.18)),bands=[fill,deep,hi];
  n.append(svg('circle',{class:'live-ring-track',cx:mid,cy:mid,r:r2(r),'stroke-width':stroke}),fill.node,deep.node,hi.node);
  for(let m=0;m<BRICK_MINUTES;m+=PIECE_MIN_MINUTES){
    const a=m/BRICK_MINUTES*2*Math.PI-Math.PI/2,i=r-stroke/2-1,o=r+stroke/2+1;
    n.append(svg('line',{class:'live-ring-tick'+(m===PIECE_MIN_MINUTES?' piece':''),x1:r2(mid+i*Math.cos(a)),y1:r2(mid+i*Math.sin(a)),x2:r2(mid+o*Math.cos(a)),y2:r2(mid+o*Math.sin(a))}));
  }
  const num=svg('text',{class:'live-ring-text live-ring-num',x:mid,y:r2(mid-size*.05),'font-size':Math.round(size*.32)}),unit=svg('text',{class:'live-ring-text live-ring-unit',x:mid,y:r2(mid+size*.22),'font-size':Math.max(9,Math.round(size*.11))});
  unit.textContent='이번 세션';n.append(num,unit);   // V6F (MAN2 3): 링 숫자 = 이번 세션 벽돌(아래 "오늘 벽돌 n장"은 오늘 합계)이라는 이름표
  const paint=s=>{
    for(const b of bands)b.node.setAttribute('stroke-dasharray',r2(b.c*s.part)+' '+r2(b.c));
    n.setAttribute('class','live-ring'+(s.gold?' gold':''));
    num.textContent=String(s.bricks);
    n.setAttribute('aria-label','이번 세션 벽돌 '+s.bricks+'장'+(s.pieces?' + 조각 1':'')+(s.gold?' · 금벽돌':''));
  };
  return {node:n,paint};
}
// DS1 (설계 V5 §2.3): 시계 = 시·분 · 콜론 · 초. 좁은 화면은 초가 작다.
// V8W2-5 (소유자 2026-11-14 "시·분이 0인데 진하고 초가 연하다"): 값이 0인 앞쪽 단위는 연하게, 가장 큰 0 아닌 단위부터 아래는 모두 진하게(00:00:00이면 초만 진하게).
// data-lead = 연한 앞 단위 수(0 = 모두 진함 · 1 = 시 · 2 = 시:분 묶음). 단위 아래 작은 "시간·분·초" 라벨은 CSS ::after(글자 전체 textContent는 여전히 HH:MM:SS).
export const clockLead=t=>{const [a,b]=String(t).split(':');return Number(a)?0:Number(b)?1:2;};
function clockNode(h,text,cls){
  const {el}=h,n=el('strong',null,cls),hm=el('span',null,'live-clock-hm'),hh=el('span',null,'live-clock-h'),mm=el('span',null,'live-clock-m'),ss=el('span',null,'live-clock-s');
  hm.append(hh,el('span',':','live-colon'),mm);n.append(hm,el('span',':','live-colon live-colon-s'),ss);
  const set=t=>{const [a,b,c]=String(t).split(':');hh.textContent=a??'';mm.textContent=b??'';ss.textContent=c??'';n.setAttribute('data-lead',String(clockLead(t)));};
  set(text);
  return {node:n,set};
}
// DS1 (설계 V5 §2.8 a): 과목 칩 = 색 점 + 이름(채운 칩 아님).
function subjectChip(h,subject){
  const {el,svg}=h,key=SUBJECT_COLOR_KEYS[String(subject?.color??'').toUpperCase()]??null;
  const n=el('span',subject?.name??'과목','lb-chip live-subject'+(key?' lb-chip-'+key:''));
  if(!key&&subject?.color){const dot=svg('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'}),c=svg('circle',{cx:5,cy:5,r:5,fill:subject.color});dot.append(c);n.textContent='';n.append(dot,subject.name);n.className+=' lb-chip-custom';}
  return n;
}
const stateText=(t,s)=>t.endIso?'담기 대기 · 끝 시각이 적혔어요':s.clock.overDay||s.oldStart?'오래 켜진 타이머 · 끝내고 담기를 누르면 끝난 시각을 물어요':t.pausedAt?'휴식 중 '+msText(s.clock.restNowMs):'집중 중';
const nextText=s=>s.session.beforePiece?'조각까지 '+msText(s.session.toPieceMs):'다음 벽돌까지 '+msText(s.session.toBrickMs);
const goldText=s=>s.session.gold?'금벽돌 달성 · XP ×'+XP.GOLD_MULT:'금벽돌까지 '+hmsShort(s.session.toGoldMs);
const bricksText=s=>'오늘 벽돌 '+s.bricks.bricks+'장'+(s.bricks.pieces?' + 조각 '+s.bricks.pieces:'')+(s.bricks.goal?' / 목표 '+s.bricks.goal+'장':'');
const examText=e=>e?e.name+' '+(e.dDay===0?'D-DAY':'D-'+e.dDay):'시험 일정 없음';
const restOver=(t,s)=>Boolean(t.pausedAt)&&!t.endIso&&s.clock.restMs+s.clock.restNowMs>REST_SPLIT_MS;

// ---- DS5 (설계 V5 §2.2·§2.3) → AV5: 오늘 상태 6단계 미리보기 격자 + 시계 아래 한 줄 + 단계가 오르는 순간 초 숫자 1초 금색. 저장 0·그림 파일 추가 0(투영만) ----
// 칸마다 같은 아바타 작은 그림(지금 평생 등급의 기본 그림, 고정) + 그 단계 효과 층(avatarStage) + "1시간" 이름표 + 단계 이름. 지금 칸 금 테두리, 못 간 칸은 흐리게 + 자물쇠.
// 격자 아래 한 줄: "땀까지 0:42 남음". thumbs=false면 썸네일 없이 글자 칸만(상태 화면). 좁은 화면(≤ 420px)의 작게 보기 카드는 CSS가 지금 단계 ±1칸만 보인다(먼 칸 = far).
// 반환 {node, paint(todayMs), scenes()}. scenes() = 칸별 avatarStage(시험용).
export const EFFECT_FLASH_MS=1000;
const SVG_LOCK=(svg)=>{const n=svg('svg',{class:'ds5-lock',viewBox:'0 0 12 14',width:12,height:14,'aria-hidden':'true',focusable:'false'});n.append(svg('path',{class:'ds5-lock-arc',d:'M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6'}),svg('rect',{class:'ds5-lock-body',x:1.5,y:6,width:9,height:7,rx:1.5}));return n;};
// V6F (MAN2 4): file = 썸네일 그림(STUDY LIVE에서는 큰 그림과 같은 오늘의 캐릭터 dc_hNN). setFile(f)로 단계가 바뀔 때 함께 바꾼다.
export function todayEffectStrip(doc,{grade=1,useArt=false,thumbs=true,cls='',file=null}={}){
  const {el,add,svg}=maker(doc),list=el('ol',null,'ds5-strip');list.setAttribute('aria-label','오늘 상태 '+TODAY_EFFECTS.length+'단계 미리보기');
  const scenes=[];
  const cells=TODAY_EFFECTS.map(e=>{
    let thumb=null;
    if(thumbs){const a=avatarStage(doc,{grade,level:e.level,useArt,file});a.node.setAttribute('aria-hidden','true');thumb=add(el('div',null,'ds5-thumb'),a.node,SVG_LOCK(svg));scenes.push(a);}
    const li=add(el('li',null,'ds5-cell'),thumb,el('span',stepHoursText(e),'ds5-range'),el('span',e.label,'ds5-name'));li.title=stepRangeText(e)+' · '+e.label;add(list,li);return {e,li};
  });
  const left=el('p',null,'ds5-next');
  let key=null;
  const paint=todayMs=>{
    const p=todayStepsOf(todayMs),k=p.level+'|'+Math.ceil((p.toNextSec??0)/60);if(k===key)return p;key=k;
    cells.forEach((c,i)=>{const st=p.steps[i].state;c.li.className='ds5-cell '+st+(Math.abs(c.e.level-p.level)>1?' far':'');c.li.setAttribute('aria-current',st==='now'?'step':'false');c.li.setAttribute('aria-label',stepHoursText(c.e)+' '+c.e.label+(st==='todo'?' · 아직 잠김':st==='now'?' · 지금':''));});
    left.textContent=nextLeftText(p);
    return p;
  };
  const node=add(el('section',null,'ds5-today'+(cls?' '+cls:'')),add(el('div',null,'ds5-head'),el('strong','오늘 상태','ds5-title'),el('span','몇 시간 하면 이렇게 바뀌어요','ds5-sub')),list,left);
  const setFile=f=>{for(const a of scenes)if(a.fig&&!a.fig.hidden&&a.fig.src!==f)a.fig.src=f;};
  return {node,paint,scenes:()=>scenes,setFile};
}
export const effectLineText=p=>p.top?'오늘 최고 단계 · '+p.label:'다음 효과까지 '+leftClockText(p.toNextSec)+' · '+p.next.label;
// 단계가 오른 순간: 보이는 시계들의 초 숫자(시계의 셋째 칸)에 그 단계 금색 class를 1초. 움직임 줄이기면 하지 않는다.
function effectFlash(win,clocks,level,setT=globalThis.setTimeout){
  if(reducedMotion(win))return;
  const secs=clocks.map(c=>c?.node?.children?.[2]).filter(Boolean);
  for(const n of secs)n.className='live-clock-s ds5-up ds5-up-'+level;
  const id=setT(()=>{for(const n of secs)if(n.className==='live-clock-s ds5-up ds5-up-'+level)n.className='live-clock-s';},EFFECT_FLASH_MS);id?.unref?.();
}
// V7A: 오늘의 캐릭터가 바뀐 순간의 초 숫자 금색 단계(31절 class 그대로, 새 색 없음): 0~4h 짙은 금 · 5~8h 금 · 9h~ 금 + 빛.
export const charFlashLevel=h=>h>=9?6:h>=5?4:2;

// ---- V7A (2026-11-11 소유자): 오늘의 캐릭터 13단계 띠(0h~12h, dc_hNN 실제 그림) + 눌러서 미리보기 시트. 저장 0·통신 0·새 그림 파일 0 ----
// 타이머 작게 보기·덮개, 상태 화면, 오늘 카드의 13단계 시트가 이 함수 하나를 쓴다. AV5 띠(todayEffectStrip)는 지우지 않고 화면에서만 쓰지 않는다.
// 칸 = 단추(잠긴 단계 포함). 누르면 큰 그림 시트(dialog): 또렷한 큰 그림 + 이름 + 필요한 시간 + "오늘 n시간 n분 더 하면", 좌우 넘기기(‹ › 단추·화살표 키·밀기), 닫기(단추·Esc·바깥), 초점은 시트 안에서만 돈다.
// 썸네일은 칸이 화면에 보일 때만 요청한다(IntersectionObserver, 첫 그리기 다음 틱부터). 관찰자가 없거나 그림이 꺼져 있으면 자리표시만(요청 0). 못 불러오면 그 칸 그림만 숨긴다.
// 한 줄 가로 띠: 넘치면 가로 스크롤(CSS 35절), 지금 단계가 바뀌면 띠만 옮겨 그 칸을 가운데로(페이지는 움직이지 않는다).
// 반환 {node, paint(todayMs), open(h), sheet()}.
export function dailyCharStrip(doc,{useArt=false,cls='',title='오늘의 캐릭터',sub='오늘 공부한 시간만큼 매일 0h부터 변해요 · 눌러서 크게 보기'}={}){
  const {el,add}=maker(doc),win=doc?.defaultView??null,list=el('ol',null,'dc-strip');list.setAttribute('aria-label',title+' '+DAILY_CHARS.length+'단계');
  let p=dailyStepsOf(0),ms=0,key=null,box=null,at=0,parts=null,x0=null;
  const picture=(c,cl)=>{const img=el('img',null,cl);img.alt='';img.setAttribute('aria-hidden','true');if(cl==='dc-fig')img.loading='lazy';img.decoding='async';img.src=c.file;img.addEventListener('error',()=>{img.hidden=true;});return img;};   // 자리표시(dc-ph)가 밑에 있어 오류면 그림만 숨긴다
  const frames=[],cells=DAILY_CHARS.map(c=>{
    const frame=add(el('span',null,'dc-frame'),el('span',null,'dc-ph'));frames.push(frame);
    const btn=add(el('button',null,'dc-btn'),frame,el('span',c.h+'h','dc-h'),el('span',c.label,'dc-name'));btn.type='button';btn.dataset.navOnly='1';btn.setAttribute('aria-haspopup','dialog');
    btn.addEventListener('click',()=>open(c.h));
    btn.addEventListener('keydown',e=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,to=d?cells[c.h+d]:null;if(to){e.preventDefault?.();to.btn.focus?.();}});
    const li=add(el('li',null,'dc-cell'),btn);li.title=c.h+'h · '+c.label;add(list,li);return {c,li,btn};
  });
  const line=el('p',null,'dc-next');
  // 지금 칸을 띠 가운데로: 띠(position:relative)의 scrollLeft만 바꾼다. 화면에 붙기 전·폭 0이면 하지 않는다.
  const center=()=>{const n=cells[p.h]?.li;if(!n||!(list.clientWidth>0)||!(list.scrollWidth>list.clientWidth))return;list.scrollLeft=Math.max(0,n.offsetLeft-(list.clientWidth-n.offsetWidth)/2);};
  const IO=useArt?win?.IntersectionObserver:null;
  const arm=()=>{
    if(list.isConnected===false)return;
    if(IO){const watch=new IO(es=>{for(const e of es)if(e.isIntersecting){watch.unobserve(e.target);const i=frames.indexOf(e.target);if(i>=0)e.target.append(picture(DAILY_CHARS[i],'dc-fig'));}});frames.forEach(f=>watch.observe(f));}
    center();
  };
  {const id=globalThis.setTimeout(arm,0);id?.unref?.();}   // 첫 그리기를 늦추지 않게 다음 틱에(그 전에는 그림 요청 0)
  // ---- 미리보기 시트 ----
  const navBtn=(text,cl,fn)=>{const b=el('button',text,cl);b.type='button';b.dataset.navOnly='1';b.addEventListener('click',fn);return b;};
  const paintBig=()=>{
    const c=DAILY_CHARS[at],st=p.steps[at].state,tag=st==='todo'?'아직 잠김':st==='now'?'지금':'지나옴';
    parts.title.textContent=c.h+'h · '+c.label;parts.count.textContent=(at+1)+' / '+DAILY_CHARS.length;
    parts.tag.textContent=tag;parts.tag.className='dc-sheet-tag '+st;
    parts.need.textContent='필요한 시간 · '+dailyNeedText(c);parts.more.textContent=dailyMoreText(c,ms);
    parts.big.replaceChildren(...[el('span',null,'dc-ph'),useArt?picture(c,'dc-sheet-fig'):null].filter(Boolean));
    parts.prev.setAttribute('aria-disabled',String(at===0));parts.next.setAttribute('aria-disabled',String(at===DAILY_CHARS.length-1));
    box.setAttribute('aria-label',title+' '+c.h+'h '+c.label+' · '+tag);
  };
  const move=d=>{const i=at+d;if(i<0||i>=DAILY_CHARS.length)return;at=i;paintBig();};
  const close=()=>{if(box?.open)box.close?.();};
  const build=()=>{
    box=el('dialog',null,'dc-sheet');
    parts={title:el('h2',null,'dc-sheet-title'),count:el('span',null,'dc-sheet-count'),tag:el('span',null,'dc-sheet-tag'),big:el('div',null,'dc-sheet-big'),need:el('p',null,'dc-sheet-need'),more:el('p',null,'dc-sheet-more')};
    parts.title.setAttribute('aria-live','polite');
    parts.close=navBtn('닫기','secondary dc-sheet-close',close);parts.prev=navBtn('‹ 이전','secondary dc-sheet-prev',()=>move(-1));parts.next=navBtn('다음 ›','secondary dc-sheet-next',()=>move(1));
    parts.prev.setAttribute('aria-label','이전 단계');parts.next.setAttribute('aria-label','다음 단계');
    add(box,add(el('div',null,'dc-sheet-inner'),add(el('div',null,'dc-sheet-head'),parts.title,parts.close),add(el('div',null,'dc-sheet-meta'),parts.count,parts.tag),
      parts.big,parts.need,parts.more,add(el('div',null,'dc-sheet-nav'),parts.prev,parts.next)));
    box.addEventListener('click',e=>{if(e.target===box)close();});   // 안쪽 칸이 창을 채우므로 창 자체가 눌리면 바깥(뒤 막)
    // 키는 시트 밖으로 올려 보내지 않는다(덮개의 Space = 휴식 단축키가 시트 안 단추와 겹치지 않게). Tab은 닫기 → 이전 → 다음 안에서만 돈다.
    box.addEventListener('keydown',e=>{
      e.stopPropagation?.();
      if(e.key==='Escape'){e.preventDefault?.();close();}
      else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault?.();move(e.key==='ArrowRight'?1:-1);}
      else if(e.key==='Tab'){const f=[parts.close,parts.prev,parts.next],i=f.indexOf(doc.activeElement),to=e.shiftKey?(i<=0?f.length-1:i-1):(i<0||i===f.length-1?0:i+1);e.preventDefault?.();f[to].focus?.();}
    });
    box.addEventListener('cancel',e=>{e?.preventDefault?.();close();});
    box.addEventListener('close',()=>cells[at]?.btn.focus?.());   // 닫으면 마지막으로 본 단계 칸으로 초점을 돌려준다
    parts.big.addEventListener('pointerdown',e=>{x0=Number.isFinite(e?.clientX)?e.clientX:null;});
    parts.big.addEventListener('pointerup',e=>{if(x0===null||!Number.isFinite(e?.clientX))return;const dx=e.clientX-x0;x0=null;if(Math.abs(dx)>=40)move(dx<0?1:-1);});   // 밀기: 왼쪽으로 밀면 다음
    add(node,box);
  };
  function open(h){if(!box)build();at=Math.min(DAILY_CHARS.length-1,Math.max(0,Number.isInteger(h)?h:p.h));paintBig();if(!box.open){try{box.showModal?.();}catch{/* 이미 열림 등 */}}parts.close.focus?.();}
  const paint=todayMs=>{
    ms=Number.isFinite(todayMs)&&todayMs>0?todayMs:0;
    const q=dailyStepsOf(ms),k=q.h+'|'+Math.ceil((q.toNextSec??0)/60);if(k===key)return q;
    const moved=key!==null&&q.h!==p.h;key=k;p=q;
    cells.forEach(({c,li,btn},i)=>{const st=q.steps[i].state;li.className='dc-cell '+st;li.setAttribute('aria-current',st==='now'?'step':'false');btn.setAttribute('aria-label',c.h+'h '+c.label+(st==='todo'?' · 아직 잠김':st==='now'?' · 지금':'')+' · 크게 보기');});
    line.textContent=dailyNextText(q);
    if(box?.open)paintBig();
    if(moved)center();
    return q;
  };
  const node=add(el('section',null,'dc-today'+(cls?' '+cls:'')),add(el('div',null,'ds5-head'),el('strong',title,'ds5-title'),sub?el('span',sub,'ds5-sub'):null),list,line);
  paint(0);
  return {node,paint,open,sheet:()=>box};
}

// 작은 카드(오늘 화면 맨 위) + 덮개(open일 때). 단추 동작은 on.* (life-ui). 반환: {card, dialog, stop}.
// on = {finish, pause, resume, expand, collapse, storage}. 덮개를 닫아도(작게 보기) 타이머는 멈추지 않는다. note = 덮개에 보일 한 줄(R42: 덮개가 오늘 화면의 안내를 가리므로).
export function renderLive(ctx,{timer,subject,open=false,draftCard=null,exams=null,ddayActive=null,goalBricks=null,note=null,on={}}){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button}=h,win=doc.defaultView??null;
  const read=()=>liveState({timer,nowIso:String(ctx.now()),study:ctx.getWhole()?.study??null,draftCard,exams,goalBricks});
  let s=read();
  const startDate=s.date,last={bricks:s.session.bricks,gold:s.session.gold};

  // 작은 카드: HH:MM:SS + 링 + 펼치기. DS1 (V5 §2.8 a·h): "STUDY LIVE" 작은 글자 대신 과목 칩(색 점 + 이름), 펼치기는 secondary(화면의 primary는 끝내고 담기 하나)
  const miniClockP=clockNode(h,s.clock.text,'live-clock live-mini-clock'),miniClock=miniClockP.node,miniState=el('span',stateText(timer,s),'muted small live-mini-state'),miniRing=brickRing(h,64);
  const card=add(el('section',null,'panel live-mini'+(timer.pausedAt?' resting':'')),miniRing.node,add(el('div',null,'live-mini-text'),subjectChip(h,subject),miniClock,miniState),
    button('펼치기',()=>on.expand?.(),'secondary live-expand'));
  card.id='live-mini';
  const miniStrip=dailyCharStrip(doc,{useArt:Boolean(ctx.avatarArt??AVATAR_ART_READY),cls:'live-mini-chars'});miniStrip.paint(s.todayMs);add(card,miniStrip.node);   // V7A: 작게 보기 안 띠 = 오늘의 캐릭터 13단계(AV5 효과 띠 대신)
  let effH=dailyStepsOf(s.todayMs).h,effLine=null;   // V7A: 시계 아래 한 줄(덮개가 열렸을 때만) "다음 캐릭터까지 h:mm · 이름"

  let dialog=null,parts=null,showT=null;
  if(open){
    const clockP=clockNode(h,s.clock.text,'live-clock'),clock=clockP.node,state=el('p',stateText(timer,s),'live-state'+(timer.pausedAt?' resting':timer.endIso?' waiting':''));
    clock.setAttribute('role','timer');clock.setAttribute('aria-label','이번 세션 공부 시간');
    effLine=el('p',dailyNextText(dailyStepsOf(s.todayMs)),'live-effect');   // V7A: 큰 시계 아래 "다음 캐릭터까지 h:mm · 다음 캐릭터 이름"(옛 "다음 효과까지 … 땀 한 방울" 대신)
    const todaySec=el('span','오늘 '+hmsShort(s.todayMs),'muted small live-today-sec'),ring=brickRing(h,120);
    const next=el('p',nextText(s),'live-next'),gold=el('p',goldText(s),'live-gold'+(s.session.gold?' done':''));
    const todayChip=el('span','오늘 '+hmText(s.todayMin),'live-chip'),weekChip=el('span','이번 주 '+hmText(s.weekMin),'live-chip');
    const chips=ddayChips(exams,s.date,ddayActive);   // V6A: 오늘 카드·계획 탭과 같은 D-day 두 칩(가까운 시험 먼저 · 최종 수능). V8W2: 활성 칩도 같은 값(life-ui가 lb.dday.active를 읽어 넘긴다, 여기서는 저장소를 읽지 않는다)
    const examChip=chips.length?ddayChipsNode(h,chips,'live-dday'):el('span',examText(s.exam),'live-chip live-dday');
    const bricks=el('p',bricksText(s),'live-bricks'),cellSlot=el('div',null,'live-brick-cells'),overlap=el('p',null,'notice live-overlap'),restNote=el('p','30분 넘게 쉬었어요 · 다시 집중을 누르면 앞부분을 먼저 담고 새로 시작해요','notice live-rest-over');
    const paintBands=()=>{overlap.textContent=s.overlapMin?'다른 기기에서 담은 타이머 '+s.overlapMin+'분이 지금 시간과 겹쳐요 · 끝낼 때 한쪽만 담으세요':'';overlap.hidden=!s.overlapMin;restNote.hidden=!restOver(timer,s);};
    paintBands();
    // DS1 (V5 §2.8 d): "오늘 벽돌 n장 / 목표 m장" 옆 벽돌 칸(채움 비율). 값이 바뀔 때만 다시 만든다
    let cellKey=null;
    const paintCells=()=>{const k=s.bricks.value+'/'+s.bricks.goal;if(k===cellKey)return;cellKey=k;cellSlot.replaceChildren(brickCells(doc,{value:s.bricks.value,goal:s.bricks.goal}));};
    paintCells();
    // AV8: 큰 그림 = 오늘의 캐릭터 dc_hNN.webp(오늘 시간 0h~12h, 책상·소품 틀 없음, V7A: 효과 층 없이 그림 그대로). 평생 등급 그림(av_s*_base)은 지우지 않고 모서리 원형 배지로 병행한다. 그림을 못 불러오면 그 그림만 숨긴다.
    const stage=el('div',null,'room-stage av5-stage av8-stage'),art=Boolean(ctx.avatarArt??AVATAR_ART_READY);
    let fig=null,badgeFig=null,daily=dailyCharOf(s.todayMin);
    if(art){
      fig=el('img',null,'av5-fig live-fig av8-fig');fig.alt='';fig.setAttribute('aria-hidden','true');fig.src=daily.file;fig.addEventListener('error',()=>{fig.hidden=true;});add(stage,fig);
      badgeFig=el('img',null,'av8-badge-fig');badgeFig.alt='';badgeFig.setAttribute('aria-hidden','true');badgeFig.src=artFile(s.roomInputs.stageNo,'base');badgeFig.addEventListener('error',()=>{badgeFig.hidden=true;});
    }
    // V7A: 큰 그림 위에 땀·김·연기·불꽃·오라 효과 층(avatarFxLayer)을 덧그리지 않는다(코드는 study-room에 그대로). 이름표도 "오늘 상태 n" → "오늘의 캐릭터 nh".
    const tagGrade=el('span',null,'av5-tag av5-tag-grade'),tagToday=el('span',null,'av5-tag av5-tag-today');
    const paintTags=()=>{const g=STUDY_STAGES[s.roomInputs.stageNo-1],d=dailyCharOf(s.todayMin);tagGrade.textContent='평생 등급(누적) '+g.no+' · '+g.name;tagToday.textContent='오늘의 캐릭터 '+d.h+'h · '+d.label;};
    paintTags();add(stage,add(el('div',null,'av5-tags'),tagGrade,tagToday));
    if(badgeFig){const badge=add(el('span',null,'av8-badge'),badgeFig);badge.setAttribute('aria-hidden','true');add(stage,badge);}   // 평생 등급 배지(지름 56px). 등급 이름은 아래 tagGrade가 맡는다
    // 다음 단계 그림 1장만 미리 불러오기(한 번에 한 장). V7C: 옛 한 줄 "오늘 3h · … · 다음 변신까지 0:42"(live-daily)는 시계 아래 V7A 줄 "다음 캐릭터까지 h:mm · 이름"과 겹쳐 뺐다
    const preloaded=new Set();
    const preload=()=>{if(!art||!daily.next||preloaded.has(daily.next.file))return;preloaded.add(daily.next.file);try{const p=doc.createElement('img');p.src=daily.next.file;}catch{/* 미리 불러오기는 덤이다 */}};
    preload();
    const paintDaily=()=>{
      const d=dailyCharOf(s.todayMin);
      if(d.h!==daily.h){daily=d;if(fig&&!fig.hidden)fig.src=d.file;preload();}else daily=d;   // V7A: 띠 칸은 단계마다 제 그림이라 따라 바꿀 것이 없다
    };
    const room=liveRoom(ctx,{stage,state:s,timer,draftCard,props:false});   // S1B: 벽돌 축하(글자·불꽃)만. AV5: 책상·소품·날개 없음. liveState는 읽기만 한다
    const grid=dailyCharStrip(doc,{useArt:art,cls:'live-grid'});grid.paint(s.todayMs);   // V7A: 덮개 안 띠 = 오늘의 캐릭터 13단계(칸마다 제 그림, 누르면 미리보기)
    // DS1 (V5 §2.1·§2.8 h): primary는 끝내고 담기 하나(금속 채움, 64px·좁은 화면 56px), 휴식은 같은 높이 secondary, 작게 보기는 text. 폭 ≤ 420px이면 휴식·끝내고 담기는 하단 고정(lb-bottom-dock)
    const restBtn=timer.endIso?null:button(timer.pausedAt?'이어서':'휴식',()=>{if(timer.pausedAt)on.resume?.();else on.pause?.();},'secondary live-rest lb-btn-pair');
    if(restBtn&&timer.pausedAt){restBtn.setAttribute('data-face','다시 집중');restBtn.setAttribute('aria-label','이어서');}   // DS1B (V5 §2.1): 휴식 중 보이는 글자만 "다시 집중"(styles.css 30절 data-face). DOM 글자·이름표는 "이어서" 그대로, 누르면 휴식 해제 그대로
    const full=doc.fullscreenEnabled?button('전체 화면',()=>{void dialog.requestFullscreen?.()?.catch?.(()=>{});},'secondary live-full'):null;
    const close=button('작게 보기 ×',()=>on.collapse?.(),'secondary live-close');close.setAttribute('aria-label','작게 보기');   // V6F (MAN2 2): 첫 화면 맨 위에서 글자로 보이게(아래 글자 단추는 그대로)
    dialog=add(el('dialog',null,'live-dlg'+(timer.pausedAt?' resting':'')),
      add(el('div',null,'live-top'),subjectChip(h,subject),topExtra?.(h)??null,full,close),
      add(el('div',null,'live-body'),room.node,add(el('div',null,'live-panel'),
        state,clock,effLine,todaySec,
        add(el('div',null,'live-ring-row'),ring.node,add(el('div',null,'live-ring-side'),next,gold)),
        add(el('div',null,'live-chips'),todayChip,weekChip,examChip),add(el('div',null,'live-bricks-row'),bricks,cellSlot),grid.node,overlap,restNote,note?el('p',note,'notice live-note'):null,
        add(el('div',null,'live-sub-actions'),button('작게 보기',()=>on.collapse?.(),'lb-btn-text live-small')),
        add(el('div',null,'live-actions lb-bottom-dock'),restBtn,button('끝내고 담기',()=>on.finish?.(),'primary live-finish lb-btn-finish')))));
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
    parts={clock:clockP,state,todaySec,ring,next,gold,todayChip,weekChip,bricks,fig,badgeFig,paintBands,paintCells,paintDaily,room,paintTags,grid};
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
    miniClockP.set(s.clock.text);miniState.textContent=stateText(timer,s);miniRing.paint(s.session);
    {const p=miniStrip.paint(s.todayMs);if(effLine)effLine.textContent=dailyNextText(p);if(p.h>effH)effectFlash(win,[miniClockP,parts?.clock],charFlashLevel(p.h));effH=p.h;}   // V7A: 오늘의 캐릭터가 바뀌는 순간 초 숫자 1초 금색(DS5 방식 그대로)
    if(parts){
      parts.clock.set(s.clock.text);parts.state.textContent=stateText(timer,s);parts.todaySec.textContent='오늘 '+hmsShort(s.todayMs);
      parts.ring.paint(s.session);parts.next.textContent=nextText(s);parts.gold.textContent=goldText(s);parts.gold.className='live-gold'+(s.session.gold?' done':'');
      parts.todayChip.textContent='오늘 '+hmText(s.todayMin);parts.weekChip.textContent='이번 주 '+hmText(s.weekMin);parts.bricks.textContent=bricksText(s);parts.paintBands();parts.paintCells();
      parts.paintDaily();   // AV8: 큰 그림(오늘의 캐릭터)·한 줄. 평생 등급 배지는 등급이 바뀔 때만 주소가 바뀐다
      if(parts.badgeFig&&!parts.badgeFig.hidden){const src=artFile(s.roomInputs.stageNo,'base');if(parts.badgeFig.src!==src&&!String(parts.badgeFig.src).endsWith('/'+src))parts.badgeFig.src=src;}
      parts.paintTags();parts.grid.paint(s.todayMs);   // V7A: 효과 층 없음, 띠 = 오늘의 캐릭터
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
