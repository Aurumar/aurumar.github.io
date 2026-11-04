// 성취 엔진 (B42). 저장하지 않는 순수 투영이다: 쌓인 기록(wholeLifeView의 life·study)과 오늘 날짜만으로 XP·연속·레벨·퀘스트·탑 층을 계산한다.
// 이 모듈은 어떤 기록도 쓰지 않고 시계·난수·저장소·네트워크를 쓰지 않는다. 같은 입력이면 어느 기기에서나 같은 결과다.
// 입력의 날짜별 LIFE_DAY는 최신 카드 하나뿐이다(이력 revision을 세지 않는다). 공부 세션은 COMPLETED만 센다.
// 설계: AUTOPILOT\tasks\B42_ACHIEVE_TOWER.md(숫자 최우선), ADDENDUM A2·A7.
import {brickOf,entryDone,lifeDefs,dayNumber,shiftDay,subjectOfSession,DEFAULT_DAILY_GOAL_BRICKS} from './life-model.mjs';

export const XP=Object.freeze({HABIT_UNIT:5,BRICK:30,PIECE:15,GOLD_MINUTES:90,GOLD_MULT:1.5,IGNITE:10,IGNITE_BRIDGE:15,WEEK_TARGET:15,COMBO_MORNING:15,COMBO_STUDY:20,COMBO_PERFECT:30,QUEST:50,BOSS:200,GOAL_HABIT:10,TIME_MULT:1.5});
// 시각 보너스(B43, 통제탑 결정): TIME 습관이 목표 시각 이내면 그 습관 XP ×1.5(기상·등원·취침 모두 "목표 시각 이전", 같으면 포함).
// 취침처럼 목표가 24:00이면 자정을 넘긴 새벽 기록(00:00~03:59)은 늦은 것으로 본다. 일폭(hb-sun)은 기상(hb-wake) 기록 시각부터 120분 안에 기록되면 ×1.5, 기상 기록이 없으면 보너스 없음.
export const SUN_ID='hb-sun',WAKE_ID='hb-wake',SUN_WINDOW_MIN=120;
const hm=t=>{const m=typeof t==='string'?/^(\d\d):(\d\d)$/.exec(t):null;return m?Number(m[1])*60+Number(m[2]):null;};
export function onTimeBonus(h,e){
  if(h.kind!=='TIME'||h.target.time===null||!e||e.at===null)return false;
  const target=hm(h.target.time),at=hm(e.at);
  if(target===null||at===null)return false;
  return target===1440?at>=240:at<=target;
}
export function sunBonus(wake,sun){
  if(!wake||!wake.done||wake.at===null||!sun||sun.at===null)return false;
  const w=hm(wake.at),s=hm(sun.at);
  return w!==null&&s!==null&&s>=w&&s<=w+SUN_WINDOW_MIN;
}
export const SUBJECT_WEIGHT=Object.freeze({EXAM:1,BRIDGE:1,OTHER:1});
export const GOAL_MIN=2,GOAL_MAX=16,GOAL_WINDOW=14,RAMP_DAYS=5,NOLATE_DAYS=5;
export const AUTO_WINDOW=28,AUTO_MIN_DAYS=7,AUTO_DEFAULT=2;
export const STREAK_STEP=7,STREAK_MAX_MULT10=20;
export const AREAS=Object.freeze(['BODY','HEAD','MONEY','HEART']);
const MORNING_IDS=Object.freeze(['hb-wake','hb-sun','hb-breakfast']),COMMUTE_IDS=Object.freeze(['hb-in','hb-out']);
const STUDY_ROUTINE_BRICKS=2,MAX_SPAN_DAYS=4000,UNKNOWN_COLOR='#C9A227';
// 옛 공부 세션(세션 id에 과목 id가 없는 것)은 STUDY 과목 코드로 과목을 정한다.
const SUBJECT_BY_CODE=Object.freeze({K:'kor',M:'math',E:'eng',H:'hist',S:'soc',C:'sci'});

// 성공 횟수/전체로 난이도: 85% 이상 1, 60~85% 2, 35~60% 3, 35% 미만 4. 경계값은 높은 쪽 구간에 들어간다(정수 비교).
export function difficultyFromRate(done,total){
  if(done*100>=85*total)return 1;
  if(done*100>=60*total)return 2;
  if(done*100>=35*total)return 3;
  return 4;
}
export const streakMult10=days=>Math.min(STREAK_MAX_MULT10,10+Math.floor(days/STREAK_STEP));
// 레벨 n → n+1 필요 XP = round(200 × n^1.5), 레벨 1부터.
export const levelNeed=n=>Math.round(200*n**1.5);
export function levelOf(xp){
  let level=1,left=xp;
  while(left>=levelNeed(level)){left-=levelNeed(level);level++;}
  return {level,xp,into:left,need:levelNeed(level)};
}
const mondayOf=date=>shiftDay(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
const roundXp=(raw,mult10)=>Math.round(raw*mult10/10);

function compute(life,study,today){
  const defs=lifeDefs(life),visible=defs.habits.filter(h=>!h.hidden);
  // 완벽한 날·연속 50% 판정의 분모(B43, 통제탑 결정): 매일 하는 습관만. 복구 종류와 주 단위 목표 습관(운동 등)은 뺀다(해 냈으면 XP는 그대로).
  const core=visible.filter(h=>h.kind!=='RECOVERY'&&h.target.per!=='WEEK');
  const subjects=new Map(defs.subjects.map(s=>[s.id,s]));
  const oldest=shiftDay(today,-MAX_SPAN_DAYS);
  const inRange=d=>d<=today&&d>=oldest;
  const cards=new Map(),studyDays=new Map();
  for(const d of life?.days??[])if(inRange(d.date))cards.set(d.date,d.data);
  for(const d of study?.days??[])if(inRange(d.date))studyDays.set(d.date,d.data);
  let first=today;
  for(const d of cards.keys())if(d<first)first=d;
  const sessionsOf=date=>(studyDays.get(date)?.sessions??[]).filter(s=>s.state==='COMPLETED'&&Number.isInteger(s.confirmedMin)&&s.confirmedMin>=0&&s.confirmedMin<=1440);
  for(const d of studyDays.keys())if(d<first&&sessionsOf(d).some(s=>s.confirmedMin>=10))first=d;
  const firstNo=dayNumber(first),n=dayNumber(today)-firstNo+1,dates=new Array(n);
  for(let i=0;i<n;i++)dates[i]=shiftDay(first,i);
  const firstWd=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,weekOf=i=>Math.floor((i+firstWd)/7);

  // 하루별 벽돌·카드 준비
  const parsed=new Array(n);
  const valuePrefix=new Int32Array(n+1),stackedPrefix=new Int32Array(n+1);   // valuePrefix는 반 칸 단위(조각 1 = 1, 벽돌 1 = 2)
  for(let i=0;i<n;i++){
    const date=dates[i],list=sessionsOf(date).map(s=>({s,at:s.at??'￿'})).sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:a.s.id<b.s.id?-1:a.s.id>b.s.id?1:0).map(x=>x.s);
    let bricks=0,pieces=0,gold=0,brickXp=0,ignite=0;const items=[],parts=[];
    for(const s of list){
      const b=brickOf(s.confirmedMin);if(!b.bricks&&!b.pieces)continue;
      const sid=subjectOfSession(s.id)??SUBJECT_BY_CODE[s.subject]??null,sub=subjects.get(sid)??null;
      const weight=sub?.exam?SUBJECT_WEIGHT.EXAM:sub?.bridge?SUBJECT_WEIGHT.BRIDGE:SUBJECT_WEIGHT.OTHER;
      const isGold=s.confirmedMin>=XP.GOLD_MINUTES,base=XP.BRICK*b.bricks*weight+XP.PIECE*b.pieces;
      brickXp+=isGold?base*XP.GOLD_MULT:base;
      if(!items.length)ignite=sub?.bridge?XP.IGNITE_BRIDGE:XP.IGNITE;
      const color=sub?.color??UNKNOWN_COLOR;
      for(let k=0;k<b.bricks;k++)items.push({subjectId:sid,color,gold:isGold,half:false});
      if(b.pieces)items.push({subjectId:sid,color,gold:isGold,half:true});
      bricks+=b.bricks;pieces+=b.pieces;if(isGold)gold+=b.bricks;
      parts.push({subjectId:sid,name:sub?.name??'기타',color,bridge:Boolean(sub?.bridge),bricks:b.bricks,pieces:b.pieces});
    }
    const gems=(studyDays.get(date)?.reviews??[]).filter(r=>r.result==='RECALLED').length;   // 보석 = 오답 복습에 성공한 건(A2의 VERIFIED. 복습 결과 값은 RECALLED·PARTIAL·FAILED뿐이다)
    const card=cards.get(date)??null,value2=bricks*2+pieces;
    parsed[i]={date,card,bricks,pieces,gold,gems,brickXp,ignite,items,parts,value2};
    valuePrefix[i+1]=valuePrefix[i]+value2;
    stackedPrefix[i+1]=stackedPrefix[i]+(card||value2?1:0);
  }

  // 오늘 목표 벽돌: 기록 14일 이상이면 최근 14일 평균 × 1.1 올림(2~16), 그 전에는 램프(첫 주 2장, 앞 주에 5일 이상 쌓았으면 +1). 그날 기록은 넣지 않는다(하루 안에서 목표가 변하지 않게).
  const weekCount=weekOf(n-1)+1,ramp=new Array(weekCount);ramp[0]=DEFAULT_DAILY_GOAL_BRICKS;
  const stackedInWeek=new Array(weekCount).fill(0);
  for(let i=0;i<n;i++)if(parsed[i].card||parsed[i].value2)stackedInWeek[weekOf(i)]++;
  for(let k=1;k<weekCount;k++)ramp[k]=Math.min(GOAL_MAX,ramp[k-1]+(stackedInWeek[k-1]>=RAMP_DAYS?1:0));
  const goalAt=i=>{
    if(i<=0)return ramp[0];
    if(stackedPrefix[i]<GOAL_WINDOW)return ramp[weekOf(i)];
    const sum2=valuePrefix[i]-valuePrefix[i-GOAL_WINDOW];
    return Math.max(GOAL_MIN,Math.min(GOAL_MAX,Math.ceil(sum2*11/(2*GOAL_WINDOW*10))));
  };

  // 습관별 누적(난이도 계산을 하루 O(1)로). 카드가 없는 날과 카드에 그 습관이 없는 날은 똑같이 "안 한 날"이다.
  const hStat=defs.habits.map(h=>({h,weekly:h.target.per==='WEEK'&&h.target.count!==null,prefix:new Int32Array(n+1),firstEntry:-1}));
  for(const st of hStat){
    for(let i=0;i<n;i++){
      const e=parsed[i].card&&Object.hasOwn(parsed[i].card.habits,st.h.id)?parsed[i].card.habits[st.h.id]:null,done=entryDone(st.h,e);
      if(done&&st.firstEntry<0)st.firstEntry=i;
      st.prefix[i+1]=st.prefix[i]+(done?(st.weekly?e.count:1):0);
    }
  }
  // AUTO 난이도: 그날 이전 최근 28일(그 습관의 첫 기록부터) 성공률. 기록이 7일 미만이면 2. 주 단위 목표는 (횟수 합) / (목표 × 일수/7). 그날 값은 넣지 않아 지난 XP가 뒤의 기록으로 바뀌지 않는다.
  const difficultyAt=(st,i)=>{
    if(st.h.difficulty!=='AUTO')return st.h.difficulty;
    if(st.firstEntry<0||i-st.firstEntry<AUTO_MIN_DAYS)return AUTO_DEFAULT;
    const lo=Math.max(i-AUTO_WINDOW,st.firstEntry),span=i-lo,sum=st.prefix[i]-st.prefix[lo];
    return st.weekly?difficultyFromRate(sum*7,st.h.target.count*span):difficultyFromRate(sum,span);
  };

  // 연속(B43 결정): 그날 COMPLETED 공부 세션의 벽돌·조각이 1개 이상이거나, 카드를 쌓았고 매일 하는 습관의 50% 이상을 한 날. 벽돌만 있는 날도 들어간다(빈 카드를 쓰지 않는다).
  // 복구: 복구 습관을 완료한 날이 있는 주(월~일)에 한 번, 빠진 하루 1개를 이어 준다(세지는 않고 끊기지만 않음).
  const doneOf=(i,h)=>{const c=parsed[i].card;return Boolean(c&&Object.hasOwn(c.habits,h.id)&&entryDone(h,c.habits[h.id]));};
  const recoveryHabits=defs.habits.filter(h=>h.kind==='RECOVERY'),recoveryWeeks=new Set();
  const visibleDone=new Array(n),qualified=new Array(n);
  for(let i=0;i<n;i++){
    let vd=0;for(const h of core)if(doneOf(i,h))vd++;
    visibleDone[i]=vd;
    qualified[i]=parsed[i].value2>0||(Boolean(parsed[i].card)&&core.length>0&&vd*2>=core.length);
    if(recoveryHabits.some(h=>doneOf(i,h)))recoveryWeeks.add(weekOf(i));
  }
  const streakAt=new Array(n),bridged=new Array(n).fill(false),bridgeUsed=new Set();
  let streak=0;
  for(let i=0;i<n;i++){
    if(qualified[i]){streak++;streakAt[i]=streak;continue;}
    if(i===n-1){streakAt[i]=0;continue;}                              // 오늘은 아직 끝나지 않았다: 끊지 않지만 배수도 붙지 않는다
    const w=weekOf(i);
    if(streak>0&&recoveryWeeks.has(w)&&!bridgeUsed.has(w)){bridgeUsed.add(w);bridged[i]=true;streakAt[i]=streak;continue;}
    streak=0;streakAt[i]=0;
  }

  // 하루 XP와 주간 묶음
  const exams=new Set((defs.exams?.items??[]).map(x=>x.date));
  const workout=defs.habits.find(h=>h.id==='hb-workout'&&!h.hidden)??defs.habits.find(h=>h.kind==='COUNT'&&h.target.per==='WEEK'&&!h.hidden)??null;
  const nolate=defs.habits.find(h=>h.id==='hb-nolate'&&!h.hidden)??null;
  const byId=new Map(defs.habits.map(h=>[h.id,h]));
  const areaXp={BODY:0,HEAD:0,MONEY:0,HEART:0};
  const days=new Array(n),weeks=[];
  let week=null,totalXp=0;
  const openWeek=i=>{
    const monday=mondayOf(dates[i]),idx=weekOf(i);
    const mondayIdx=dayNumber(monday)-firstNo,goal=goalAt(mondayIdx);
    const quests=[];
    if(workout)quests.push({id:'workout',label:workout.name+' '+workout.target.count+'회',value:0,target:workout.target.count,unit:'회',done:false,doneDate:null,xp:XP.QUEST,area:workout.area});
    quests.push({id:'bricks',label:'벽돌 '+goal*7+'장',value:0,target:goal*7,unit:'장',done:false,doneDate:null,xp:XP.QUEST,area:'HEAD'});
    if(nolate)quests.push({id:'nolate',label:nolate.name+' '+NOLATE_DAYS+'일',value:0,target:NOLATE_DAYS,unit:'일',done:false,doneDate:null,xp:XP.QUEST,area:nolate.area});
    return {index:idx+1,monday,current:false,goal,brickTarget:goal*7,days:Array.from({length:7},(_,k)=>({date:shiftDay(monday,k),items:[],perfect:false,gems:0,xp:0,card:false})),
      bricks:0,pieces:0,value:0,gold:0,gems:0,windows:0,xp:0,perfect:0,subjects:new Map(),bridgeValue2:0,value2:0,quests,cum:new Map()};
  };
  for(let i=0;i<n;i++){
    const p=parsed[i],date=p.date,wk=weekOf(i);
    if(!week||weeks.length<=wk){week=openWeek(i);weeks.push(week);}
    let habitXp=0,bonusXp=0;const earned=[];
    if(p.card)for(const st of hStat){
      if(!doneOf(i,st.h))continue;
      const entry=p.card.habits[st.h.id];
      const timely=onTimeBonus(st.h,entry)||(st.h.id===SUN_ID&&st.h.kind==='DURATION'&&sunBonus(Object.hasOwn(p.card.habits,WAKE_ID)?p.card.habits[WAKE_ID]:null,entry));
      if(timely)earned.push('TIME_BONUS:'+st.h.id);
      const x=XP.HABIT_UNIT*difficultyAt(st,i)*(timely?XP.TIME_MULT:1);habitXp+=x;areaXp[st.h.area]+=x;
      if(st.weekly){
        const before=week.cum.get(st.h.id)??0,e=p.card.habits[st.h.id],after=before+e.count;week.cum.set(st.h.id,after);
        if(before<st.h.target.count&&after>=st.h.target.count){bonusXp+=XP.WEEK_TARGET;areaXp[st.h.area]+=XP.WEEK_TARGET;earned.push('WEEK_TARGET');}
      }
    }
    const allDone=ids=>ids.every(id=>{const h=byId.get(id);return Boolean(h&&doneOf(i,h));});
    let comboXp=0;
    const morning=allDone(MORNING_IDS),studyRoutine=allDone(COMMUTE_IDS)&&p.bricks>=STUDY_ROUTINE_BRICKS,perfect=Boolean(p.card)&&core.length>0&&visibleDone[i]===core.length;
    if(morning){comboXp+=XP.COMBO_MORNING;areaXp.BODY+=XP.COMBO_MORNING;}
    if(studyRoutine){comboXp+=XP.COMBO_STUDY;areaXp.HEAD+=XP.COMBO_STUDY;}
    if(perfect)comboXp+=XP.COMBO_PERFECT;                                // 완벽한 날은 특정 영역 소속이 아니다(하루 XP에만 더한다)
    areaXp.HEAD+=p.brickXp+p.ignite;
    bonusXp+=p.ignite;
    const boss=Boolean(p.card)&&exams.has(date);
    if(boss){bonusXp+=XP.BOSS;areaXp.HEAD+=XP.BOSS;}
    // 주간 퀘스트: 그 주 안에서 처음 달성한 날에 +50과 창문 1개
    week.value2+=p.value2;
    for(const pt of p.parts)if(pt.bridge)week.bridgeValue2+=pt.bricks*2+pt.pieces;
    for(const q of week.quests){
      if(q.id==='workout'&&p.card&&workout&&doneOf(i,workout))q.value+=p.card.habits[workout.id].count??0;
      else if(q.id==='bricks')q.value=week.value2/2;
      else if(q.id==='nolate'&&nolate&&doneOf(i,nolate))q.value+=1;
      if(!q.done&&q.value>=q.target){q.done=true;q.doneDate=date;bonusXp+=q.xp;areaXp[q.area]+=q.xp;week.windows++;earned.push('QUEST:'+q.id);}
    }
    const raw=habitXp+p.brickXp+comboXp+bonusXp,mult10=streakMult10(streakAt[i]),xp=roundXp(raw,mult10);
    totalXp+=xp;
    const slot=week.days[dayNumber(date)-dayNumber(week.monday)];
    slot.items=p.items;slot.perfect=perfect;slot.gems=p.gems;slot.xp=xp;slot.card=Boolean(p.card);
    week.bricks+=p.bricks;week.pieces+=p.pieces;week.gold+=p.gold;week.gems+=p.gems;week.xp+=xp;if(perfect)week.perfect++;
    for(const pt of p.parts){
      const key=pt.subjectId??'?',s=week.subjects.get(key)??{id:key,name:pt.name,color:pt.color,bridge:pt.bridge,bricks:0,pieces:0};
      s.bricks+=pt.bricks;s.pieces+=pt.pieces;week.subjects.set(key,s);
    }
    days[i]={date,card:Boolean(p.card),habitXp,brickXp:p.brickXp,comboXp,bonusXp,ignite:p.ignite,boss,morning,studyRoutine,perfect,raw,mult10,xp,streak:streakAt[i],bridged:bridged[i],qualified:qualified[i],
      bricks:p.bricks,pieces:p.pieces,gold:p.gold,gems:p.gems,value:p.value2/2,visibleDone:visibleDone[i],visibleTotal:core.length,goal:goalAt(i),earned};
  }
  const hasRecords=parsed.some(p=>p.card||p.value2>0);
  const outWeeks=weeks.map(w=>{
    const {subjects,cum,bridgeValue2,value2,...rest}=w;
    return {...rest,value:value2/2,bridgeHeavy:value2>0&&bridgeValue2*2>value2,subjects:[...subjects.values()].sort((a,b)=>(b.bricks*2+b.pieces)-(a.bricks*2+a.pieces)||(a.id<b.id?-1:1))};
  });
  if(outWeeks.length)outWeeks[outWeeks.length-1].current=true;
  const last=days[n-1],goalBricks=goalAt(n-1),goalXp=goalBricks*XP.BRICK+visible.length*XP.GOAL_HABIT;
  const levels=Object.fromEntries(AREAS.map(a=>[a,{area:a,...levelOf(Math.floor(areaXp[a]))}]));
  const top=AREAS.reduce((a,b)=>levels[b].xp>levels[a].xp?b:a,AREAS[0]);
  const todayDifficulty=Object.fromEntries(hStat.map(st=>[st.h.id,difficultyAt(st,n-1)]));
  return {
    today,hasRecords,totalXp,days,weeks:outWeeks,levels,topArea:top,
    streak:{days:streak,mult10:streakMult10(streak)},
    goalBricks,goalXp,todayXp:last.xp,todayDay:last,todayDifficulty,
    currentWeek:outWeeks[outWeeks.length-1],
  };
}

// 같은 입력(같은 객체와 같은 날짜)이면 다시 계산하지 않는다. 화면이 기록을 다시 읽으면 객체가 바뀌어 새로 계산한다.
let memo=null;
export function achieve({life=null,study=null,today}){
  if(memo&&memo.life===life&&memo.study===study&&memo.today===today)return memo.result;
  const result=compute(life,study,today);
  memo={life,study,today,result};
  return result;
}
// 쌓기 전 예상: 오늘 화면의 입력(카드·공부 초안)을 쌓았다고 치고 계산한다. 아무것도 저장하지 않고 입력 객체도 바꾸지 않는다.
export function previewAchieve({life=null,study=null,today,card=null,studyCard=null}){
  const l=card?{...(life??{habits:[],subjects:[],exams:null}),days:[{date:today,data:card,heads:[]},...(life?.days??[]).filter(d=>d.date!==today)]}:life;
  const s=studyCard?{days:[{date:today,data:studyCard,heads:[]},...(study?.days??[]).filter(d=>d.date!==today)]}:study;
  return compute(l,s,today);
}
// 칸 하나를 완료할 때 오르는 습관 XP(난이도만, 콤보·배수 제외). 칸 위에 잠깐 보이는 값.
export const habitXpToday=(ach,habitId)=>XP.HABIT_UNIT*(ach.todayDifficulty[habitId]??AUTO_DEFAULT);
export const multText=mult10=>'×'+(mult10/10).toFixed(1);
