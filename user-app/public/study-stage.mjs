// 공부 단계 아바타 투영 (AV2). 저장 0·서버 쓰기 0·네트워크 0. 시계는 nowIso로 받으므로 같은 입력이면 어느 기기에서나 같은 결과다. 합성 데이터로만 시험한다.
// 설계: AUTOPILOT\design\STUDY_STAGE_AVATAR_DESIGN.md. 등급은 실제 신분이 아니라 수험 기간 누적 공부 시간에 묶는다.
// 이 모듈은 어떤 모듈도 불러오지 않는다(화면·시험이 같은 파일을 쓴다).

// 평생 등급 표: 소유자가 바꾸기 쉽게 여기 한 곳에만 둔다. hours = 그 등급이 시작되는 누적 공부 시간. 맨 위는 0, 아래로 갈수록 커야 한다.
// AV4C(2026-11-06 통제탑 결정): 20단계 → 12단계. 단계 번호는 어디에도 저장하지 않고 언제나 누적 분에서 다시 구하므로 옛 20단계 값이 남아 있을 곳이 없다.
export const STUDY_STAGES=Object.freeze([
  ['첫 책상',0],['습관',100],['몰입',300],['실전',600],['의대 합격',900],['예과',1100],
  ['첫 흰 가운',1400],['국시 합격',1700],['인턴',2000],['레지던트',2300],['전문의',2600],['의사 (금빛)',3000],
].map(([name,hours],i)=>Object.freeze({no:i+1,id:'s'+String(i+1).padStart(2,'0'),name,hours})));
export const FINAL_STAGE=STUDY_STAGES[STUDY_STAGES.length-1];
export const STAR_EVERY_HOURS=250;   // 마지막 등급 이후 이만큼마다 금빛 별 1개
// 금 장신구 단계(화면 라벨만, 그림은 따로 맞춘다). fromNo = 그 단계가 시작되는 등급 번호.
export const GOLD_TIERS=Object.freeze([
  Object.freeze({name:'수험생',gear:'시계',fromNo:1}),
  Object.freeze({name:'합격·예과',gear:'시계+타이바',fromNo:5}),
  Object.freeze({name:'본과·수련',gear:'펜·코트 금테',fromNo:7}),
  Object.freeze({name:'전문의·의사',gear:'금 청진기·자수',fromNo:11}),
]);
export function goldTierOf(no){
  let tier=GOLD_TIERS[0];
  for(const t of GOLD_TIERS)if(no>=t.fromNo)tier=t;
  return tier;
}

// 오늘 상태 6단계 (AV5, 2026-11-09 통제탑): 소유자가 바꾸기 쉽게 여기 한 곳에만 둔다. fromMin = 오늘 누적 분이 이 값 이상이면 그 단계.
// 그림은 언제나 평생 등급 기본 그림(art 'base') 하나다(같은 캐릭터·같은 옷). 단계마다 바뀌는 것은 그림 위에 얹는 효과 층(fx)뿐이다(study-room AVATAR_FX가 그린다).
// short = "땀까지 0:42 남음"처럼 남은 시간 줄에 쓰는 짧은 이름. fx 이름: sweat 땀 · steam 김 · smoke 연기 · blush 홍조 · flame 어깨 뒤 불꽃 · aura 금빛 테두리 · sparks 금빛 입자.
export const TODAY_EFFECTS=Object.freeze([
  [0,'기본','기본',[]],
  [60,'땀 한 방울','땀',['sweat']],
  [120,'김','김',['sweat','steam']],
  [180,'연기','연기',['sweat','smoke','blush']],
  [240,'불꽃','불꽃',['smoke','blush','flame']],
  [360,'금빛 오라','오라',['blush','flame','aura','sparks']],
].map(([fromMin,label,short,fx],i)=>Object.freeze({level:i+1,fromMin,art:'base',label,short,fx:Object.freeze(fx)})));
export const FULL_EFFECT_MIN=TODAY_EFFECTS[TODAY_EFFECTS.length-1].fromMin;

// 실제 그림(av_s01_base.webp …). CSP img-src 'self'는 소유자 승인(2026-11-06)으로 열었다. 이 값을 끄면 자리표시 SVG만 그리고 그림 파일을 요청하지 않는다.
export const AVATAR_ART_READY=true;
export const artFile=(no,art)=>'av_s'+String(no).padStart(2,'0')+'_'+art+'.webp';

const MAX_DAY_MIN=1440;
const okMinutes=m=>Number.isInteger(m)&&m>=0&&m<=MAX_DAY_MIN;
// 카드 한 장의 공부 분: 세션의 확인된 분(confirmedMin)을 모두 더한다. 시작만 한 세션은 0분이다.
export const cardMinutes=card=>(card?.sessions??[]).reduce((sum,s)=>sum+(okMinutes(s?.confirmedMin)?s.confirmedMin:0),0);
// 평생 누적: 쌓은(확정된) 공부 카드만 더한다. 날짜별 카드는 한 장이다(같은 날짜가 또 오면 뒤의 값, 성취 엔진과 같음).
export function lifetimeMinutes(study){
  const byDate=new Map();
  for(const d of study?.days??[])byDate.set(d?.date,d?.data);
  let sum=0;
  for(const card of byDate.values())sum+=cardMinutes(card);
  return sum;
}

export function stageOf(totalMin){
  const minutes=Number.isFinite(totalMin)&&totalMin>0?Math.floor(totalMin):0;
  let index=0;
  for(let i=1;i<STUDY_STAGES.length;i++)if(minutes>=STUDY_STAGES[i].hours*60)index=i;
  const stage=STUDY_STAGES[index],next=STUDY_STAGES[index+1]??null,from=stage.hours*60;
  if(next){const span=next.hours*60-from;return {minutes,stage,next,intoMin:minutes-from,spanMin:span,toNextMin:span-(minutes-from),stars:0,toNextStarMin:null};}
  const every=STAR_EVERY_HOURS*60,over=minutes-from;
  return {minutes,stage,next:null,intoMin:over%every,spanMin:every,toNextMin:null,stars:Math.floor(over/every),toNextStarMin:every-over%every};
}

// "어디까지 왔나" (AV4C): 최근 7일(오늘 포함, KST 날짜) 쌓은 카드 분 합계. 날짜별 카드는 한 장(lifetimeMinutes와 같음). today = 'YYYY-MM-DD'(KST).
export const RECENT_DAYS=7;
export const ASSUMED_DAY_MIN=240;   // 최근 7일 기록이 없을 때 쓰는 가정값(하루 4시간). 화면에 가정이라고 적는다.
const MAX_ETA_DAYS=36500;           // 이보다 멀면 날짜 대신 "100년 넘게"
export function addDays(date,n){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  return m?new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+n)).toISOString().slice(0,10):null;
}
export function recentMinutes(study,today,days=RECENT_DAYS){
  const from=addDays(today,1-days);
  if(!from)return 0;
  const byDate=new Map();
  for(const d of study?.days??[])if(typeof d?.date==='string'&&d.date>=from&&d.date<=today)byDate.set(d.date,d.data);
  let sum=0;
  for(const card of byDate.values())sum+=cardMinutes(card);
  return sum;
}
// 남은 분을 하루 평균 분으로 나눈 대략 일수(반올림, 남아 있으면 최소 1일)와 그날(KST). 너무 멀면 date=null.
function etaOf(leftMin,perDayMin,today){
  if(!(leftMin>0))return {days:0,date:today};
  const days=Math.max(1,Math.round(leftMin/perDayMin));
  return days>MAX_ETA_DAYS?{days,date:null}:{days,date:addDays(today,days)};
}
// stageOf 결과 + 최근 7일 분 → 진행 표시 수치. 새 기록·저장 0. 마지막 단계 이후에는 "다음"이 다음 금빛 별이다.
export function progressOf(proj,recentMin,today){
  const recent=Number.isFinite(recentMin)&&recentMin>0?recentMin:0,assumed=recent===0;
  const perDayMin=assumed?ASSUMED_DAY_MIN:recent/RECENT_DAYS;
  const finalMin=FINAL_STAGE.hours*60,toFinalMin=Math.max(0,finalMin-proj.minutes);
  const toNextMin=proj.next?proj.toNextMin:proj.toNextStarMin;
  return {no:proj.stage.no,total:STUDY_STAGES.length,stage:proj.stage,next:proj.next,toNextMin,intoMin:proj.intoMin,spanMin:proj.spanMin,
    toFinalMin,percent:Math.min(100,Math.floor(proj.minutes/finalMin*100)),stars:proj.stars,
    assumed,perDayMin,nextEta:etaOf(toNextMin,perDayMin,today),finalEta:etaOf(toFinalMin,perDayMin,today)};
}

export function todayEffectOf(todayMin){
  const minutes=Number.isFinite(todayMin)&&todayMin>0?Math.floor(todayMin):0;
  let index=0;
  for(let i=1;i<TODAY_EFFECTS.length;i++)if(minutes>=TODAY_EFFECTS[i].fromMin)index=i;
  const next=TODAY_EFFECTS[index+1]??null;
  return {...TODAY_EFFECTS[index],minutes,next,toNextMin:next?next.fromMin-minutes:null};
}

// DS5 (설계 V5 §2.2): 오늘 효과 5단계 띠의 순수 계산. 경계·이름은 위 TODAY_EFFECTS를 그대로 읽는다(새 경계값 없음). 저장 0.
// todayMs = 오늘 누적 공부(ms). 단계는 todayEffectOf(내림한 분)과 같고, 다음 단계까지 남은 시간은 정수 초(시계와 같은 내림)로 센다.
export function todayStepsOf(todayMs){
  const sec=Number.isFinite(todayMs)&&todayMs>0?Math.floor(todayMs/1000):0,fx=todayEffectOf(Math.floor(sec/60));
  const steps=TODAY_EFFECTS.map((e,i)=>({...e,toMin:TODAY_EFFECTS[i+1]?.fromMin??null,state:e.level<fx.level?'done':e.level===fx.level?'now':'todo'}));
  return {level:fx.level,label:fx.label,next:fx.next,steps,toNextSec:fx.next?fx.next.fromMin*60-sec:null,top:fx.next===null};
}
// 칸 이름표: "0~1h" … "6h+"(끝은 다음 단계의 fromMin). 남은 시간: "1:58:53"(시간은 앞 0 없음).
export const stepRangeText=e=>{const next=TODAY_EFFECTS.find(x=>x.level===e.level+1);return next?e.fromMin/60+'~'+next.fromMin/60+'h':e.fromMin/60+'h+';};
export const leftClockText=sec=>{const s=Number.isFinite(sec)&&sec>0?Math.floor(sec):0;return Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
// AV5 미리보기 격자: 칸 이름표 "1시간"(그 단계가 시작되는 오늘 공부 시간), 남은 시간 한 줄 "땀까지 0:42 남음"(h:mm, 분은 올림 → 1초 남아도 0:01).
export const stepHoursText=e=>e.fromMin/60+'시간';
export const nextLeftText=p=>{if(p.top)return '오늘 최고 단계 · '+p.label;const m=Math.ceil(p.toNextSec/60);return p.next.short+'까지 '+Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+' 남음';};

// 진행 중 시간은 1초씩 더하지 않고 언제나 "지금 - 시작 시각"으로 구한다. 화면이 꺼지거나 탭이 멈춰 있어도 다시 계산하면 맞다. 시계가 뒤로 가면 0.
// S1A: restMs = 이 타이머의 휴식 합(ms). 공부 분에서 뺀다(기본 0이라 예전 호출은 그대로).
const restOK=ms=>Number.isFinite(ms)&&ms>0?ms:0;
export function timerElapsedMin(startIso,nowIso,restMs=0){
  const diff=Date.parse(nowIso)-Date.parse(startIso)-restOK(restMs);
  return Number.isFinite(diff)?Math.max(0,Math.round(diff/60000)):0;
}
// "끝내고 담기"로 저장할 분(1~1440). 버튼을 누른 그 순간의 시각으로 계산해야 한다.
export const timerRecordMin=(startIso,nowIso,restMs=0)=>Math.min(MAX_DAY_MIN,Math.max(1,timerElapsedMin(startIso,nowIso,restMs)));

// 오늘 공부 분 = 오늘 카드(초안이 있으면 초안이 확정본을 포함하므로 초안 하나만) + 진행 중 타이머.
// draftCard = 오늘 공부 흐름의 카드(초안 또는 확정본). 다른 날짜의 카드가 남아 있으면 쓰지 않는다.
export function todayMinutes({study=null,date,draftCard=null,timer=null,nowIso}){
  const card=draftCard&&draftCard.date===date?draftCard:[...(study?.days??[])].reverse().find(d=>d?.date===date)?.data??null;
  const running=timer?.startIso?Math.min(MAX_DAY_MIN,timerElapsedMin(timer.startIso,timer.endIso??timer.pausedAt??nowIso,timer.restMs)):0;   // FIX34 (H4): 끝 시각이 적힌 타이머는 더 늘지 않는다 · S1A: 휴식 중엔 멈추고 휴식 합은 뺀다
  return {cardMin:cardMinutes(card),timerMin:running,minutes:cardMinutes(card)+running};
}

const grouped=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');
export const hoursText=min=>grouped(Math.floor(min/60))+'시간';
export function hmText(min){
  const h=Math.floor(min/60),m=min%60;
  return h&&m?grouped(h)+'시간 '+m+'분':h?grouped(h)+'시간':m+'분';
}
export const clockText=min=>Math.floor(min/60)+':'+String(min%60).padStart(2,'0');
// 남은 시간은 올려서 시간 단위로(1분 남아도 "1시간"), 하루 평균은 소수 한 자리 시간(1시간 미만이면 분).
export const hoursLeftText=min=>grouped(Math.ceil(min/60))+'시간';
export function perDayText(min){
  if(min<60)return hmText(Math.max(1,Math.round(min)));
  const h=Math.round(min/6)/10;
  return (Number.isInteger(h)?String(h):h.toFixed(1))+'시간';
}
// 날짜 글자: 올해면 "11/19", 아니면 "2028-03-24".
export const shortDate=(date,today)=>date.slice(0,4)===String(today).slice(0,4)?Number(date.slice(5,7))+'/'+Number(date.slice(8,10)):date;

// 화면이 떠 있는 동안 run을 주기적으로 부른다. 탭이 숨어 있으면 건너뛰고, 다시 보일 때 바로 부른다. node가 화면에서 빠지면 스스로 멈춘다.
export function liveTick(node,doc,run,everyMs=30000){
  let id=null;
  const stop=()=>{if(id!==null){clearInterval(id);id=null;}doc?.removeEventListener?.('visibilitychange',step);};
  function step(){
    if(node?.isConnected===false){stop();return;}
    if(doc?.visibilityState==='hidden')return;
    run();
  }
  id=setInterval(step,everyMs);id?.unref?.();
  doc?.addEventListener?.('visibilitychange',step);
  return stop;
}
