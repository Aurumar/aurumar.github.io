// HLT 화면용 투영(순수 함수). 시계를 직접 읽지 않는다 — 오늘 날짜(KST, YYYY-MM-DD)는 호출자가 넘긴다.
// 같은 카드 집합이면 기기·입력 순서와 상관없이 같은 결과(정수 분 계산, 정렬 후 집계).
// 비공개(private) 습관: showPrivate=false(기본)이면 라벨·횟수·시각·마지막 기록 후 n일·7·30일 횟수·카드 안 기록이 결과 어디에도 나오지 않는다.
// 프로필을 읽을 수 없는 habit(참조 대상 없음)은 비공개로 취급해 같이 숨긴다.
// 삭제한 프로필(removed:true)은 모든 목록·요약 대상에서 빠지고(removedProfiles로만 따로 준다), 지난 카드의 항목과 이름은 그대로 읽힌다(비공개 규칙은 삭제 여부와 상관없이 같다).
import {kstDate,kstMinutes,dayNumber,shiftDay,dateKeyOK} from './hlt-model.mjs';

// wholeLifeView가 싣는 원자료: 엔티티 그대로(heads 포함). 숨김 처리는 여기서 하지 않는다(화면 쪽 hltView가 한다).
export function hltRawView(entities){
  const profiles=[],days=[];
  for(const e of entities){
    if(e.entityType==='HLT_PROFILE')profiles.push({key:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
    else if(e.entityType==='HLT_DAY')days.push({date:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
  }
  profiles.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);days.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  return {profiles,days};
}
export const hhmm=m=>m===null?null:String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const avgInt=a=>a.length?Math.floor((2*a.reduce((s,x)=>s+x,0)+a.length)/(2*a.length)):null;
const byTime=(a,b)=>Date.parse(a)-Date.parse(b);

export function visibleItems(card,profilesByKey,showPrivate){
  return card.items.filter(it=>{
    if(it.type!=='habit')return true;
    const p=profilesByKey.get(it.profileKey);
    return showPrivate||(p&&!p.data.private);
  });
}
export function rhythmSummary(days,habitProfiles,today){
  requireDate(today);
  const cards=[...days].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const windowStat=n=>{
    const start=shiftDay(today,-(n-1)),inWin=c=>c.date>=start&&c.date<=today;
    const wakes=[],sleepTotals=[],sleepStarts=[],meals=[];
    for(const c of cards.filter(inWin)){
      const w=c.data.items.filter(i=>i.type==='wake').map(i=>i.at).sort(byTime);if(w.length)wakes.push(kstMinutes(w[0]));
      const mains=c.data.items.filter(i=>i.type==='sleep'&&i.kind==='main');
      const closed=mains.filter(i=>i.endAt!==null);
      if(closed.length)sleepTotals.push(closed.reduce((s,i)=>s+Math.round((Date.parse(i.endAt)-Date.parse(i.startAt))/60000),0));
      for(const i of mains)sleepStarts.push((kstMinutes(i.startAt)-1080+1440)%1440);   // 취침: 18:00 기준 경과 분
      const m=c.data.items.filter(i=>i.type==='meal').map(i=>i.at).sort(byTime);if(m.length)meals.push(kstMinutes(m[0]));
    }
    const ss=avgInt(sleepStarts);
    const avgWakeMin=avgInt(wakes),avgSleepStartMin=ss===null?null:(ss+1080)%1440,avgSleepMinutes=avgInt(sleepTotals),avgFirstMealMin=avgInt(meals);
    return {days:n,avgWakeMin,avgWake:hhmm(avgWakeMin),avgSleepStartMin,avgSleepStart:hhmm(avgSleepStartMin),avgSleepMinutes,avgFirstMealMin,avgFirstMeal:hhmm(avgFirstMealMin),
      wakeCards:wakes.length,sleepCards:sleepTotals.length,mealCards:meals.length};
  };
  const habits=[...habitProfiles].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(p=>{
    const all=[];
    for(const c of cards)for(const it of c.data.items)if(it.type==='habit'&&it.profileKey===p.key)all.push({date:it.at===null?c.date:kstDate(it.at),count:it.count});
    // DEFR1 (GPT 12차 H12-N04): 했다/안했다(CHECK)는 하루 1번 뜻이다. 두 기기가 같은 날 각각 확정해 항목이 둘이어도 그 날짜는 1로 센다(COUNT는 그대로 합한다).
    const hits=p.mode==='CHECK'?[...new Map(all.map(h=>[h.date,h])).values()]:all;
    const s7=shiftDay(today,-6),s30=shiftDay(today,-29);
    const past=hits.filter(h=>h.date<=today).map(h=>h.date).sort();
    const sum=lo=>hits.filter(h=>h.date>=lo&&h.date<=today).reduce((s,h)=>s+h.count,0);
    return {key:p.key,label:p.label,mode:p.mode,private:p.private,lastAgoDays:past.length?dayNumber(today)-dayNumber(past.at(-1)):null,count7:sum(s7),count30:sum(s30)};
  });
  return {today,week:windowStat(7),month:windowStat(30),habits};
}
function requireDate(d){if(!dateKeyOK(d)){const e=new Error('INVALID_HLT_TODAY');e.code='INVALID_HLT_TODAY';throw e;}}

// 화면용 전체 투영. raw = hltRawView 결과.
export function hltView(raw,today,{showPrivate=false}={}){
  const profilesByKey=new Map(raw.profiles.map(p=>[p.key,p]));
  const seen=raw.profiles.filter(p=>showPrivate||!p.data.private);
  const profiles=seen.filter(p=>!p.data.removed),removedProfiles=seen.filter(p=>p.data.removed);
  const days=raw.days.map(d=>({...d,data:{...d.data,items:visibleItems(d.data,profilesByKey,showPrivate)}}));
  const habitProfiles=profiles.filter(p=>p.data.kind==='HABIT').map(p=>({key:p.key,label:p.data.label,mode:p.data.mode,private:p.data.private}));
  return {today,showPrivate,profiles,removedProfiles,days,summary:rhythmSummary(days,habitProfiles,today)};
}
// FIX45 (AUD1 #9): 최근 n일 걸음 평균과 기록 일수(자료 없음은 null, 0걸음은 실제 값). 화면과 사령부 내보내기(state-export)가 같은 계산을 쓴다. 걸음 항목만 읽는다.
export function stepsAverage(days,today,n=7){
  const from=shiftDay(today,-(n-1)),steps=[];
  for(const d of days){if(d.date<from||d.date>today)continue;const it=d.data.items.find(i=>i.type==='steps'&&Number.isSafeInteger(i.count)&&i.count>=0);if(it)steps.push(it.count);}
  return {days:steps.length,avg:steps.length?Math.round(steps.reduce((a,b)=>a+b,0)/steps.length):null};
}
// FIX45 (AUD1 #9): 오늘 첫 화면 한 줄의 값. 오늘 깬 본잠(오늘·어제 카드, 끝난 것만)의 합과 오늘 카드의 걸음. 쌓은 카드만 읽고 수면·걸음 항목 밖은 읽지 않는다(약·증상·습관·메모 제외). 없으면 null(0과 구분).
export function sleepStepsToday(raw,today){
  const cards=(raw?.days??[]).filter(d=>d.date===today||d.date===shiftDay(today,-1));
  let sleep=null,steps=null;
  for(const c of cards)for(const i of c.data.items){
    if(i.type==='sleep'&&i.kind==='main'&&i.endAt!==null&&kstDate(i.endAt)===today)sleep=(sleep??0)+Math.round((Date.parse(i.endAt)-Date.parse(i.startAt))/60000);
    if(i.type==='steps'&&c.date===today&&Number.isSafeInteger(i.count)&&i.count>=0)steps=i.count;
  }
  return {sleep,steps};
}
// 홈 요약 한 줄: 카드 수준 정보만(개별 습관·라벨·횟수는 쓰지 않는다). 모듈 꺼짐이면 null.
export function hltHomeLine(raw,today,enabled){
  if(!enabled)return null;
  const c=raw.days.find(d=>d.date===today);
  return c?'오늘 건강 카드 · 쌓음 '+c.data.confirmCount+'번':'오늘 건강 카드 · 아직 쌓기 전';
}
