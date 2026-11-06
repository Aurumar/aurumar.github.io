// PC 앱 Windows 알림(토스트, B57)의 화면 쪽: 결제일·시험·쌓기 잊음 3종을 "언제 알릴지"만 정한다.
// 잠금 화면에 보일 수 있으므로 금액·가게 이름·규칙 이름·과목을 host로 보내지 않는다. 보내는 것은 종류와 건수(시험은 이름과 남은 날)뿐이고, 화면에 뜨는 글은 host(pc-toast-writer.mjs)가 고정 문구로 만든다.
// PC 앱(APP_SHELL)이 켜져 있고 잠금이 풀려 있을 때만 돈다: 백그라운드 서비스·작업 스케줄러 등록 없음, 기록·연산 0, 새 외부 통신 0(이 PC가 이미 가진 내용만 읽어 판단한다).
// 날짜 기준은 Asia/Seoul 고정(UTC+9, 서머타임 없음). 시계·저장소·읽기·보내기·타이머는 주입한다(시험은 가짜를 꽂는다).
import {rulesOf,ruleStatus,recurringKey,wonOf,within,dueDay,fallbackDay,CANDIDATE_WINDOW_MONTHS} from './fin-recurring.mjs';
import {shiftMonth} from './fin-ledger.mjs';
import {nextByMonths} from './fin-plan.mjs';
import {lifeDefs,dDay,shiftDay} from './life-model.mjs';

export const TOAST_KINDS=Object.freeze(['PAY','EXAM','LIFE']);
export const TOAST_AT=Object.freeze({PAY:9*60,EXAM:9*60,LIFE:22*60});   // 그날 KST 몇 분부터 알리는가. 그 시각에 앱이 꺼져 있었으면 그날 안에 켜졌을 때 알린다(다음 날로 넘기지 않는다)
export const EXAM_MARKS=Object.freeze([30,7,1]);
export const BILLING_SAMPLE=6;                                          // 결제 기준일은 최근 결제 6건으로 정한다(fin-plan detectRecurring의 dates.slice(-6)과 같다)
export const EXAM_NAME_MAX=20;                                          // life-model MAX_NAME과 같다(시험이 대조)
export const PAY_MAX=60;                                                // pc-toast-writer.mjs PAY_MAX와 같다(시험이 대조)
export const TICK_MS=60000,READ_RETRY_MS=5*60000,SEND_RETRY_MS=30*60000,SEND_MAX_TRIES=3;
export const SETTINGS_KEY='lb.pctoast.settings.v1',FIRED_KEY='lb.pctoast.fired.v1';
export const TOAST_LABELS=Object.freeze({PAY:'결제일 · 정기 결제 예정일 하루 전 09:00',EXAM:'시험 · D-30, D-7, D-1 09:00',LIFE:'쌓기 잊음 · 22:00까지 오늘 카드를 안 쌓았을 때',BRICK:'벽돌 완성 · 앱이 가려져 있을 때'});
export const BRICK_MAX=48;                                              // pc-toast-writer.mjs BRICK_MAX와 같다(시험이 대조)
export const ISSUE_TEXT=Object.freeze({
  DISABLED:'Windows 설정에서 알림이 꺼져 있어 표시하지 못했어요. Windows 설정 > 시스템 > 알림에서 "Windows PowerShell" 항목을 켜 주세요.',
  FAILED:'Windows 알림을 표시하지 못했어요. 앱이 켜져 있으면 나중에 다시 시도합니다.',
});
const KST_MS=9*3600000;
const DATE=/^\d{4}-\d{2}-\d{2}$/;

// ---- 시각 ----
export const kstClock=ms=>{const d=new Date(ms+KST_MS);return {date:d.toISOString().slice(0,10),minutes:d.getUTCHours()*60+d.getUTCMinutes()};};

// ---- 결제일: 규칙(FIN_RECURRING)에는 날짜 칸이 없어 실제 결제 이력에서 구한다(기록 형식 변경 0) ----
// 그달의 예정일: 기준일이 그달에 없으면 말일(31일 기준 → 2월 28·29일, 4월 30일).
export const dueDateIn=(month,day)=>nextByMonths(month+'-01',0,day);
// 결제 기준일: 돈 탭 "다음 예상일"(fin-plan detectRecurring)과 같은 규칙으로 최근 결제 6건 날(日)의 위쪽 중앙값. 31·30·28일이 섞여도 31일을 유지한다(시험이 대조).
// 결제 이력이 없으면 null(언제인지 모르므로 알리지 않는다).
export function billingDay(dates){
  const days=[...new Set(dates)].sort().slice(-BILLING_SAMPLE).map(d=>Number(d.slice(8,10))).sort((a,b)=>a-b);
  return days.length?days[Math.floor(days.length/2)]:null;
}
// R33B (HUNT32 D5): 금액대 안 결제가 없으면(결제 전에 잠정 금액을 바꿈) 정기 결제 화면의 예정일과 같은 대체 결제일을 쓴다.
// FIX34 (HUNT34 H13): 대체 결제일은 화면과 같은 함수(fin-recurring fallbackDay) 하나로 고른다.
// FIX36 (HUNT35 F13): 금액대 안 결제가 있을 때도 화면(fixedSchedule)과 같은 dueDay를 쓴다(알림 날과 화면 예정일이 어긋나지 않게). 최근 12개월 안에 그런 결제가 없으면 이력으로 치지 않는 것은 그대로다. billingDay는 규칙이 없는 돈 탭 항목의 "다음 예상일"과 같은 값으로 남는다(규칙이 있는 항목은 FIX40부터 dueDay, fin-forecast withRuleDates).
function dueTomorrow(rule,lines,today,tomorrow,allRules){
  const center=BigInt(rule.match.amount),pct=rule.match.tolerancePct,from=shiftMonth(today.slice(0,7),-(CANDIDATE_WINDOW_MONTHS-1)),dates=[];
  for(const l of lines){
    if(typeof l.date!=='string'||l.date>today||l.date.slice(0,7)<from)continue;
    const a=wonOf(l.net);if(a===null)continue;
    if(within(a,center,pct))dates.push(l.date);
  }
  const day=dates.length?dueDay(rule,lines,tomorrow.slice(0,7),allRules):fallbackDay(rule,lines,tomorrow.slice(0,7),allRules);
  if(day===null||tomorrow!==dueDateIn(tomorrow.slice(0,7),day))return false;
  return ruleStatus(rule,lines,tomorrow,allRules).state==='PENDING';   // 그달에 이미 결제가 보이면(금액이 달라도) 알리지 않는다. 같은 가맹점 형제 규칙의 결제는 빼고 본다(B48C, 정기 결제 화면과 같음)
}
// 내일 결제 예정인 규칙 수. 숨긴 규칙은 세지 않는다. 금액·이름은 돌려주지 않고 건수만.
// FIX31 (D5): 형제 규칙 판정에는 화면(app.mjs renderFinRecurring)처럼 숨긴 규칙까지 전체 목록을 넘긴다.
export function payDueCount(fin,today){
  const all=rulesOf(fin?.recurring?.data).filter(Boolean),rules=all.filter(r=>!r.hidden);
  if(!rules.length||!Array.isArray(fin?.lines))return 0;
  const tomorrow=shiftDay(today,1),byKey=new Map(rules.map(r=>[r.match.merchant,[]]));
  for(const l of fin.lines){
    if(l?.kind!=='EXPENSE')continue;
    const group=byKey.get(recurringKey(l.merchant));if(group)group.push(l);
  }
  let count=0;
  for(const r of rules){try{if(dueTomorrow(r,byKey.get(r.match.merchant),today,tomorrow,all))count++;}catch{/* 모양이 틀린 규칙 하나가 나머지를 막지 않는다 */}}
  return count;
}

// ---- 시험 ----
export function cleanExamName(name){
  if(typeof name!=='string'||!name.isWellFormed())return '';
  return [...name.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim()].slice(0,EXAM_NAME_MAX).join('').trim();
}
// 오늘이 D-30·D-7·D-1인 시험. 둘 이상이면 가장 가까운 시험 하나(하루 같은 종류 1번). 잠정 일정도 앱 화면과 같이 넣는다.
export function examDue(exams,today){
  const hits=[];
  for(const x of exams?.items??[]){
    if(!x||typeof x.date!=='string'||!DATE.test(x.date))continue;
    const days=dDay(today,x.date),name=cleanExamName(x.name);
    if(name&&EXAM_MARKS.includes(days))hits.push({name,days,date:x.date,id:String(x.id)});
  }
  hits.sort((a,b)=>a.days-b.days||(a.id<b.id?-1:a.id>b.id?1:0));
  return hits.length?{name:hits[0].name,days:hits[0].days}:null;
}

// ---- 쌓기: Fold 밤 알림(app.mjs nativeStacked)과 같은 기준. 금고에 오늘 카드가 있으면 쌓은 것이다 ----
export const stackedToday=(life,today)=>life?.days?.some(d=>d.date===today)===true;

// host로 보낼 값. 울릴 것이 없으면 null.
export function toastFor(kind,{life,fin,today}){
  // FIX31 (D8): host(pc-toast-writer.mjs PAY_MAX)가 받는 건수는 60까지다. 넘으면 60과 "이상" 표지를 보내 "60건 이상"으로 띄운다.
  if(kind==='PAY'){const count=payDueCount(fin,today);return !count?null:count>PAY_MAX?{kind,count:PAY_MAX,more:true}:{kind,count};}
  if(!life)return null;   // 투영을 못 읽었으면 알리지 않는다(잘못 울리는 것보다 안 울리는 쪽)
  if(kind==='EXAM'){const e=examDue(lifeDefs(life).exams,today);return e?{kind,name:e.name,days:e.days}:null;}
  if(kind==='LIFE')return stackedToday(life,today)?null:{kind};
  return null;
}

// ---- 이 기기 저장소(localStorage): 막혀 있으면 이번 실행 동안만 메모리에 둔다 ----
// FIX37C (H37-Q5): 읽기는 되는데 쓰기만 막힌 저장소(Quota)는 옛 값이나 null을 돌려준다. 그 저장소에 못 쓴 값은 따로 두고 읽을 때 먼저 본다. 쓰기가 되면 지운다.
const memory=new Map(),unsaved=new WeakMap();
function readJson(storage,key){
  if(storage&&unsaved.get(storage)?.has(key))return unsaved.get(storage).get(key);
  try{if(!storage)throw new Error('NO_STORAGE');const t=storage.getItem(key);return t===null||t===undefined?null:JSON.parse(t);}catch{return memory.get(key)??null;}
}
function writeJson(storage,key,value){
  memory.set(key,value);
  try{storage?.setItem(key,JSON.stringify(value));if(storage)unsaved.get(storage)?.delete(key);}
  catch{if(!unsaved.has(storage))unsaved.set(storage,new Map());unsaved.get(storage).set(key,value);/* 이번 실행 동안만 */}
}
// 설정: 기본 켬. false로 저장된 종류만 꺼진다.
export function loadSettings(storage){
  const raw=readJson(storage,SETTINGS_KEY),out={};
  for(const k of TOAST_KINDS)out[k]=raw?.[k]!==false;
  return out;
}
export function setToastEnabled(kind,on,storage){
  if(!TOAST_KINDS.includes(kind))return loadSettings(storage);
  const next={...loadSettings(storage),[kind]:Boolean(on)};writeJson(storage,SETTINGS_KEY,next);return next;
}
// 하루 1번 장부: 종류별 마지막으로 알린 KST 날짜. 앱을 다시 켜도 같은 날 또 울리지 않는다. 날짜만 적고 내용은 적지 않는다.
export function loadFired(storage){
  const raw=readJson(storage,FIRED_KEY),out={};
  for(const k of TOAST_KINDS)if(typeof raw?.[k]==='string'&&DATE.test(raw[k]))out[k]=raw[k];
  return out;
}
export function markFired(kind,date,storage){const next={...loadFired(storage),[kind]:date};writeJson(storage,FIRED_KEY,next);return next;}
// 지금 시각에 판단이 필요한 종류: 켜져 있고, 그 시각을 지났고, 오늘 아직 안 울렸다.
export function pendingKinds(ms,settings,fired){
  const {date,minutes}=kstClock(ms);
  return TOAST_KINDS.filter(k=>settings[k]!==false&&minutes>=TOAST_AT[k]&&fired[k]!==date);
}

// ---- 돌리개: 1분마다 시각만 본다. 판단이 필요한 종류가 있을 때만 투영을 읽는다(보통 하루 2~3번) ----
const systemNow=()=>Date.now();
export function createToastRunner({surface,ready,read,send,storage,now=systemNow,timers=globalThis}={}){
  let handle=null,running=false,readAfter=0,issue=null;
  const settled=new Map(),retry=new Map();   // settled: 오늘은 더 볼 필요 없는 종류. retry: 실패한 종류의 다음 시도(이번 실행 동안만)
  const stop=()=>{if(handle!==null){timers.clearInterval(handle);handle=null;}};
  const fail=(kind,today,at,code)=>{
    if(code==='PC_TOAST_LOCKED'){retry.set(kind,{date:today,after:at+READ_RETRY_MS,tries:retry.get(kind)?.date===today?retry.get(kind).tries:0});return;}
    if(code==='PC_TOAST_DISABLED'){settled.set(kind,today);issue='DISABLED';return;}
    if(code==='PC_TOAST_RETRY_LIMIT'){settled.set(kind,today);issue='FAILED';return;}
    const tries=(retry.get(kind)?.date===today?retry.get(kind).tries:0)+1;
    retry.set(kind,{date:today,after:at+SEND_RETRY_MS,tries});
    if(tries>=SEND_MAX_TRIES)settled.set(kind,today);
    issue='FAILED';
  };
  const tick=async()=>{
    const where=surface();
    if(where&&where!=='APP_SHELL'){stop();return 'OTHER_SURFACE';}          // 휴대폰·브라우저: 타이머까지 멈춘다
    if(where!=='APP_SHELL'||running||!ready())return 'WAIT';
    const at=now();if(at<readAfter)return 'WAIT';
    const {date:today}=kstClock(at);
    const kinds=pendingKinds(at,loadSettings(storage),loadFired(storage)).filter(k=>{
      if(settled.get(k)===today)return false;
      const r=retry.get(k);return !(r&&r.date===today&&at<r.after);
    });
    if(!kinds.length)return 'IDLE';
    running=true;
    try{
      let whole;
      try{whole=await read();}catch{readAfter=at+READ_RETRY_MS;return 'READ_FAILED';}
      for(const kind of kinds){
        let body=null;
        try{body=toastFor(kind,{life:whole?.life??null,fin:whole?.fin??null,today});}catch{body=null;}
        if(!body){settled.set(kind,today);continue;}
        try{await send(body);markFired(kind,today,storage);retry.delete(kind);issue=null;}
        catch(e){fail(kind,today,at,typeof e?.code==='string'?e.code:'');}
      }
      return 'CHECKED';
    }finally{running=false;}
  };
  return {
    tick,stop,issue:()=>issue,
    start(){if(handle===null)handle=timers.setInterval(()=>{void tick().catch(()=>{});},TICK_MS);},   // 켜자마자 울리지 않는다: 첫 판단은 1분 뒤
  };
}

// ---- 벽돌 완성(S1C, V4 결정 S1D D3): 앱이 가려져 있을 때만 알린다. 보내는 것은 종류와 오늘 벽돌 수뿐이다(과목·시간 없음, 글은 host가 만든다) ----
// S1A 째깍은 화면이 숨겨지면 멈춰 onBrick이 오지 않는다. 그래서 1분마다 따로 본다. 같은 n은 host가 하루 1번으로 막는다.
export const appCovered=doc=>Boolean(doc)&&(doc.hidden===true||doc.hasFocus?.()===false);
export const brickBody=n=>Number.isInteger(n)&&n>=1?{kind:'BRICK',n:Math.min(n,BRICK_MAX)}:null;
export function notifyBrick(n,send){const body=brickBody(n);return body?send(body):Promise.resolve(null);}
// read() → {startIso,sessionBricks,todayBricks,forgotten?} 또는 null(타이머 없음). 처음 보는 타이머는 기준만 잡는다(다시 켰을 때 지난 벽돌을 알리지 않는다).
// FIX37C (H37-S7): 같은 벽돌은 1번만(seen). 잊은 타이머(forgotten)는 보내지 않고, 켜 둔 채 잊은 하루도 줄어들도록 KST 하루 상한(BRICK_DAY_MAX)을 둔다. 장부는 날짜와 건수만.
export const BRICK_DAY_MAX=16,BRICK_DAY_KEY='lb.pctoast.brick.v1';   // 16장 = 8시간(공부방 "풀 가동" 경계)
export function createBrickWatch({surface,ready,enabled,covered,read,send,storage=null,now=systemNow,timers=globalThis}={}){
  let handle=null,running=false,seen=null,issue=null,local=null;
  const stop=()=>{if(handle!==null){timers.clearInterval(handle);handle=null;}};
  const sentOn=date=>{const r=storage?readJson(storage,BRICK_DAY_KEY):local;return r?.date===date&&Number.isInteger(r.count)&&r.count>=0?r.count:0;};
  const countSent=date=>{const next={date,count:sentOn(date)+1};local=next;if(storage)writeJson(storage,BRICK_DAY_KEY,next);};
  const tick=async()=>{
    const where=surface();
    if(where&&where!=='APP_SHELL'){stop();return 'OTHER_SURFACE';}
    if(where!=='APP_SHELL'||running||!ready())return 'WAIT';
    const cur=read();
    if(!cur){seen=null;return 'IDLE';}
    if(seen?.startIso!==cur.startIso){seen={startIso:cur.startIso,bricks:cur.sessionBricks};return 'IDLE';}
    if(cur.sessionBricks<=seen.bricks)return 'IDLE';
    const {date}=kstClock(now());
    if(!enabled()||!covered()||cur.forgotten===true||sentOn(date)>=BRICK_DAY_MAX){seen.bricks=cur.sessionBricks;return 'IDLE';}
    running=true;
    try{
      await notifyBrick(cur.todayBricks,send);seen.bricks=cur.sessionBricks;countSent(date);issue=null;return 'SENT';
    }catch(e){
      const code=typeof e?.code==='string'?e.code:'';
      if(code==='PC_TOAST_DISABLED'){seen.bricks=cur.sessionBricks;issue='DISABLED';}
      else if(code==='PC_TOAST_RETRY_LIMIT'){seen.bricks=cur.sessionBricks;issue='FAILED';}
      else if(code!=='PC_TOAST_LOCKED')issue='FAILED';   // 그 밖의 실패는 다음 분에 다시 시도한다(host가 같은 n을 하루 3번으로 막는다)
      return 'FAILED';
    }finally{running=false;}
  };
  return {tick,stop,issue:()=>issue,start(){if(handle===null)handle=timers.setInterval(()=>{void tick().catch(()=>{});},TICK_MS);}};
}

// ---- 새 업적(Q1B, 설계 Q1D §8.4): 돌리개를 타지 않고 달성이 나온 순간 화면이 직접 보낸다(돌리개는 울릴 것이 없으면 그날 "끝남"으로 쳐서 뒤의 달성을 놓친다) ----
// TOAST_KINDS에 넣지 않는다(설정 줄은 그 목록과 정확히 같아야 한다). 켜고 끄기는 업적 패널에 있고 값은 따로 둔다. 같은 종류 하루 1번은 host가 막는다. 보내지 못해도 다시 보내지 않는다(앱 안 알림은 이미 보였다).
export const ACHV_MAX=99,ACHV_TOAST_KEY='lb.pctoast.achv.v1';                // ACHV_MAX: pc-toast-writer.mjs와 같다(시험이 대조)
export const achvToastOn=storage=>readJson(storage,ACHV_TOAST_KEY)!==false;
export const achvBody=n=>Number.isInteger(n)&&n>=1?{kind:'ACHV',count:Math.min(n,ACHV_MAX)}:null;
// PC 앱에서만 포트를 준다. 다른 표면은 null(업적 패널에 스위치도 안 보인다).
export function achvToastPort({surface,storage,send}){
  if(surface!=='APP_SHELL')return null;
  return {
    on:()=>achvToastOn(storage),
    set:v=>{writeJson(storage,ACHV_TOAST_KEY,Boolean(v));},
    send:async n=>{const body=achvBody(n);if(!body||!achvToastOn(storage))return null;try{return await send(body);}catch{return null;}},
  };
}

// ---- 설정 화면: PC 앱에서만 보인다. ctx: {h:{el,add},kit:{toggle},surface,storage,issue(),brick?:{on,set}} ----
export function renderToastSettings(root,ctx){
  if(ctx.surface!=='APP_SHELL')return null;
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel native-settings'),h.el('h2','Windows 알림','panel-title'));
  h.add(sec,h.el('p','PC 앱이 켜져 있을 때만 알립니다. 잠금 화면에 보일 수 있어 금액·가게 이름·과목은 넣지 않고, 같은 종류는 하루 1번입니다. 결제일은 지난 결제 기록으로 짐작합니다. (이 기기 설정)','muted'));
  const on=loadSettings(ctx.storage);
  for(const kind of TOAST_KINDS)h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(TOAST_LABELS[kind],on[kind],v=>{setToastEnabled(kind,v,ctx.storage);})));
  if(ctx.brick)h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(TOAST_LABELS.BRICK,ctx.brick.on(),v=>{ctx.brick.set(v);})));   // S1C: 저장은 lb.live.settings.v1
  const issue=ctx.issue?.();
  if(issue&&ISSUE_TEXT[issue])h.add(sec,h.el('p',ISSUE_TEXT[issue],'muted small'));
  h.add(root,sec);return sec;
}
