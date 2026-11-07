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
export const RECENT_MAX=5;
const MORNING_IDS=Object.freeze(['hb-wake','hb-sun','hb-breakfast']),COMMUTE_IDS=Object.freeze(['hb-in','hb-out']);
const STUDY_ROUTINE_BRICKS=2,MAX_SPAN_DAYS=4000,UNKNOWN_COLOR='#C9A227';
// 퀘스트·보너스 벽돌 (Q1A, 설계 Q1D §4·§6). 새 XP·보너스는 QUEST_EPOCH(첫 배포 주 월요일) 이후 날짜에만 붙고, 그 전 날짜의 XP는 그대로다. 업적 판정(life-achv)은 전체 기록을 본다.
// 보너스 벽돌은 week.bonus·bonusTotal에만 있다. bricks·value·목표·아바타·상태 내보내기·공부 제안에 섞지 않는다.
export const QUEST_EPOCH='2026-11-09';
export const QUEST_XP=Object.freeze({DAILY:10,MONTH:300,BOSS_KILL:100});
export const QUEST_BONUS=Object.freeze({WEEK:1,MONTH:3,BOSS:5});
export const MY_QUEST_ID='uq-1';
export const DAILY_WINDOW=14,DAILY_MIN_RECORDS=7,DAILY_RATE_LOW=30,DAILY_RATE_HIGH=80,EXAM_REVIEW_DAYS=7;
export const BOSS_MISTAKES=5,BOSS_AFTER_DAYS=7,BOSS_PREP_DAYS=28;
const REST_DAY_TYPES=Object.freeze(['REST','DETOX']);
// 동률 고르기: 날짜+id의 FNV-1a. 난수가 아니라 어느 기기에서나 같다.
const tieHash=s=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;};
const daysInMonth=ym=>new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0)).getUTCDate();
const prevMonthOf=ym=>new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-2,1)).toISOString().slice(0,7);
// 일기 보상 (FIX49C, D49 6절 + 소유자 ★4). 일기(DIARY_DAY)·주간 리뷰(WEEK_REVIEW)는 life.diaries·life.weekReviews(lifeRawView)에서만 읽는다.
// 작은 벽돌: 일기를 저장한 날 1개(공부 벽돌 0.25장 무게, 하루 최대 1개), 주간 리뷰 1개(0.5장, 그 주 일요일). 탑 그림·층 높이·"전체 벽돌" 표시에만 무게만큼 더한다.
// 공부 벽돌(bricks·value2)·목표·메인 연속·qualified·공부 제안·주간 퀘스트(w.quests)·first·hasRecords는 일기를 읽지 않는다. 일기가 0건이면 기존 결과와 같다(새 칸 diary만 0으로 붙는다).
// XP는 점수 값과 글 길이를 보지 않는다(평가 있음 10, 보이는 글자 있음 10). hb-diary 습관 XP와 겹치는 만큼은 주지 않는다: 그날 합계 = max(일기 값, 습관 XP).
export const DIARY_XP=Object.freeze({RATE:10,TEXT:10,QUEST:30,REVIEW:30});
export const DIARY_WEIGHT=Object.freeze({DAY:0.25,REVIEW:0.5});
export const DIARY_BONUS=Object.freeze({QUEST:1,REVIEW:1});
export const DIARY_QUEST_DAYS=5,DIARY_HABIT_ID='hb-diary';
export const DIARY_STREAK_PRIZES=Object.freeze([[3,15,0],[7,30,0],[30,100,3]]);   // [연속 일수, XP, ✦], 평생 한 번씩
const seen=s=>typeof s==='string'&&/[^\s\p{C}]/u.test(s);   // 보이는 글자가 하나라도 있으면 참(공백·제어·서식 문자만이면 거짓)
export const diaryRated=d=>Number.isInteger(d?.score);
export const diaryWrote=d=>seen(d?.text);
export const reviewCounts=r=>Boolean(r&&(r.pick!==null&&r.pick!==undefined||seen(r.next)));
// 옛 공부 세션(세션 id에 과목 id가 없는 것)은 STUDY 과목 코드로 과목을 정한다.
export const SUBJECT_BY_CODE=Object.freeze({K:'kor',M:'math',E:'eng',H:'hist',S:'soc',C:'sci'});

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

function compute(life,study,today,money=null){
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
  const valuePrefix=new Int32Array(n+1),stackedPrefix=new Int32Array(n+1),gemPrefix=new Int32Array(n+1);   // valuePrefix는 반 칸 단위(조각 1 = 1, 벽돌 1 = 2)
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
    const card=cards.get(date)??null,value2=bricks*2+pieces,reviews=studyDays.get(date)?.reviews?.length??0,mistakes=studyDays.get(date)?.mistakes?.length??0;
    parsed[i]={date,card,bricks,pieces,gold,gems,brickXp,ignite,items,parts,value2,reviews,mistakes};
    gemPrefix[i+1]=gemPrefix[i]+gems;
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

  // 일기(FIX49C): 첫 기록일(first) 전·오늘 뒤의 일기·리뷰는 넣지 않는다(first를 움직이면 목표 램프가 바뀐다).
  // 일기 연속: 평가나 글이 있는 날을 센다. 오늘 아직 안 썼으면 끊지 않고, 한 주(월~일)에 하루까지는 빠져도 끊지 않는다(세지는 않음).
  const anyDiary=(life?.diaries?.length??0)+(life?.weekReviews?.length??0)>0;
  const diaryAt=new Array(n).fill(null),reviewAt=new Array(n).fill(false);
  for(const d of life?.diaries??[]){
    const i=typeof d?.date==='string'&&d.date>=first&&d.date<=today?dayNumber(d.date)-firstNo:-1;
    if(i>=0&&i<n&&(diaryRated(d.data)||diaryWrote(d.data)))diaryAt[i]={rated:diaryRated(d.data),wrote:diaryWrote(d.data)};
  }
  for(const r of life?.weekReviews??[]){
    const sunday=typeof r?.monday==='string'?shiftDay(r.monday,6):null,i=sunday&&sunday>=first&&sunday<=today?dayNumber(sunday)-firstNo:-1;
    if(i>=0&&i<n&&reviewCounts(r.data))reviewAt[i]=true;
  }
  const diaryStreakAt=new Array(n).fill(0),diaryMissWeeks=new Set();
  let diaryStreak=0;
  for(let i=0;i<n;i++){
    if(diaryAt[i])diaryStreak++;
    else if(i<n-1){const w=weekOf(i);if(diaryStreak>0&&!diaryMissWeeks.has(w))diaryMissWeeks.add(w);else diaryStreak=0;}
    diaryStreakAt[i]=diaryStreak;
  }
  const diaryPaid=new Set(),diaryTotals={days:0,reviews:0,weight:0,bonus:0,xp:0,best:0};

  // 하루 XP와 주간 묶음
  const exams=new Set((defs.exams?.items??[]).map(x=>x.date));
  const workout=defs.habits.find(h=>h.id==='hb-workout'&&!h.hidden)??defs.habits.find(h=>h.kind==='COUNT'&&h.target.per==='WEEK'&&!h.hidden&&h.id!==MY_QUEST_ID)??null;
  const nolate=defs.habits.find(h=>h.id==='hb-nolate'&&!h.hidden)??null;
  const byId=new Map(defs.habits.map(h=>[h.id,h]));
  const areaXp={BODY:0,HEAD:0,MONEY:0,HEART:0};
  // 영역별 최근 성취(A1A, 탑 탭 시트). areaXp를 더하는 곳마다 함께 적고 영역마다 마지막 5개만 남긴다. 저장 0.
  const recent={BODY:[],HEAD:[],MONEY:[],HEART:[]};
  const note=(area,date,text,xp)=>{const r=recent[area];if(!r)return;r.push({date,text,xp});if(r.length>RECENT_MAX)r.shift();};
  const days=new Array(n),weeks=[];
  let week=null,totalXp=0;
  // 일간 퀘스트: 그날 이전 기록과 날짜만 보고 고른다(쌓은 그날 카드의 하루 종류만 예외). 쉬는 날은 벽돌을 내지 않는다.
  const examDays=(defs.exams?.items??[]).map(x=>dayNumber(x.date));
  const stOf=new Map(hStat.map(st=>[st.h.id,st]));
  const pickHabit=i=>{
    if(!core.length)return null;
    const span=Math.min(DAILY_WINDOW,i);
    if(stackedPrefix[i]-stackedPrefix[i-span]<DAILY_MIN_RECORDS)return core.find(h=>h.id===WAKE_ID)??core[0];
    const doneIn=h=>{const st=stOf.get(h.id);return st.prefix[i]-st.prefix[i-span];};
    const band=core.filter(h=>{const d=doneIn(h);return d*100>=DAILY_RATE_LOW*span&&d*100<=DAILY_RATE_HIGH*span;}),list=band.length?band:core;
    let best=null,bestDone=0,bestHash=0;
    for(const h of list){
      const d=doneIn(h);if(best&&d>bestDone)continue;
      const hash=tieHash(dates[i]+'|'+h.id);
      if(!best||d<bestDone||hash<bestHash){best=h;bestDone=d;bestHash=hash;}
    }
    return best;
  };
  const dailyAt=i=>{
    const p=parsed[i],xp=dates[i]>=QUEST_EPOCH?QUEST_XP.DAILY:0,list=[];
    if(!REST_DAY_TYPES.includes(p.card?.dayType)){
      const target=Math.max(1,Math.ceil(goalAt(i)/2)),value=p.value2/2;
      list.push({id:'bricks',label:'벽돌 '+target+'장',value,target,unit:'장',done:value>=target,xp,area:'HEAD'});
    }
    const no=dayNumber(dates[i]);
    if(examDays.some(d=>d-no>=1&&d-no<=EXAM_REVIEW_DAYS))list.push({id:'review',label:'오답 복습 1건',value:p.reviews,target:1,unit:'건',done:p.reviews>=1,xp,area:'HEAD'});
    else{const h=pickHabit(i);if(h){const done=doneOf(i,h);list.push({id:'habit',habitId:h.id,label:h.name,value:done?1:0,target:1,unit:'',done,xp,area:h.area});}}
    return list;
  };
  // 월간 퀘스트: 예산이 있으면 이달 예산 지키기(달이 끝난 다음 날 판정, 돈 영역), 없으면 이달의 벽돌(머리 영역). 금액은 받지 않는다(money.months = 지킨 달 여부와 사용률뿐).
  const months=[],bonusTotals={weekly:0,month:0,boss:0};
  let month=null;
  const indexOfDay=date=>Math.max(0,Math.min(n,dayNumber(date)-firstNo));
  const openMonth=ym=>{
    const fact=money?.months?.[ym];
    if(fact?.budget){const used=fact.usedPermille;return {month:ym,kind:'BUDGET',label:'이달 예산 지키기',value:used===null?null:Math.round(used/10),target:100,unit:'%',area:'MONEY',done:false,doneDate:null,xp:0,bonus:0,current:false,value2:0};}
    const from=ym+'-01',prev=prevMonthOf(ym)+'-01',prev2=valuePrefix[indexOfDay(from)]-valuePrefix[indexOfDay(prev)];
    const target=Math.min(GOAL_MAX*daysInMonth(ym),Math.max(goalAt(dayNumber(from)-firstNo)*20,Math.ceil(prev2*11/20)));
    return {month:ym,kind:'BRICKS',label:'이달의 벽돌 '+target+'장',value:0,target,unit:'장',area:'HEAD',done:false,doneDate:null,xp:0,bonus:0,current:false,value2:0};
  };
  // 시즌 보스: 시험일에 카드를 쌓고(기존 +200) 시험일부터 7일 안에 오답 기록 5건 이상이면 처치.
  const bosses=(defs.exams?.items??[]).map(x=>({id:x.id,name:x.name,date:x.date,status:x.status,no:dayNumber(x.date)-firstNo,card:false,mistakes:0,done:false,doneDate:null,xp:0,bonus:0}));
  const openWeek=i=>{
    const monday=mondayOf(dates[i]),idx=weekOf(i);
    const mondayIdx=dayNumber(monday)-firstNo,goal=goalAt(mondayIdx);
    const quests=[];
    if(workout)quests.push({id:'workout',label:workout.name+' '+workout.target.count+'회',value:0,target:workout.target.count,unit:'회',done:false,doneDate:null,xp:XP.QUEST,area:workout.area});
    quests.push({id:'bricks',label:'벽돌 '+goal*7+'장',value:0,target:goal*7,unit:'장',done:false,doneDate:null,xp:XP.QUEST,area:'HEAD'});
    if(nolate)quests.push({id:'nolate',label:nolate.name+' '+NOLATE_DAYS+'일',value:0,target:NOLATE_DAYS,unit:'일',done:false,doneDate:null,xp:XP.QUEST,area:nolate.area});
    const w={index:idx+1,monday,current:false,goal,brickTarget:goal*7,days:Array.from({length:7},(_,k)=>({date:shiftDay(monday,k),items:[],perfect:false,gems:0,xp:0,card:false})),
      bricks:0,pieces:0,value:0,gold:0,gems:0,windows:0,xp:0,perfect:0,subjects:new Map(),bridgeValue2:0,value2:0,quests,cum:new Map(),bonus:{weekly:0,month:0,boss:0,total:0}};
    // FIX49C: 일기 칸은 w.quests·w.bonus와 따로 둔다(주간 완주 업적이 일기로 풀리지 않게). 일기·리뷰 기록이 없으면 칸 자체를 만들지 않는다(기존 결과와 같은 모양).
    if(anyDiary)w.diary={days:0,review:false,weight:0,bonus:0,xp:0,quest:{id:'diary',label:'일기 '+DIARY_QUEST_DAYS+'일',value:0,target:DIARY_QUEST_DAYS,unit:'일',done:false,doneDate:null,xp:DIARY_XP.QUEST,area:'HEART'}};
    return w;
  };
  for(let i=0;i<n;i++){
    const p=parsed[i],date=p.date,wk=weekOf(i);
    if(!week||weeks.length<=wk){week=openWeek(i);weeks.push(week);}
    let habitXp=0,bonusXp=0,diaryHabitXp=0;const earned=[];
    const addBonus=(kind,count)=>{week.bonus[kind]+=count;week.bonus.total+=count;bonusTotals[kind]+=count;};
    const payMonth=(m,date)=>{
      m.done=true;m.doneDate=date;
      if(date<QUEST_EPOCH)return;
      m.xp=QUEST_XP.MONTH;m.bonus=QUEST_BONUS.MONTH;bonusXp+=m.xp;areaXp[m.area]+=m.xp;addBonus('month',m.bonus);earned.push('MONTH:'+m.kind);
    };
    if(p.card)for(const st of hStat){
      if(!doneOf(i,st.h))continue;
      const entry=p.card.habits[st.h.id];
      const timely=onTimeBonus(st.h,entry)||(st.h.id===SUN_ID&&st.h.kind==='DURATION'&&sunBonus(Object.hasOwn(p.card.habits,WAKE_ID)?p.card.habits[WAKE_ID]:null,entry));
      if(timely)earned.push('TIME_BONUS:'+st.h.id);
      const x=XP.HABIT_UNIT*difficultyAt(st,i)*(timely?XP.TIME_MULT:1);habitXp+=x;areaXp[st.h.area]+=x;note(st.h.area,date,st.h.name,x);
      if(st.h.id===DIARY_HABIT_ID)diaryHabitXp=x;
      if(st.weekly){
        const before=week.cum.get(st.h.id)??0,e=p.card.habits[st.h.id],after=before+e.count;week.cum.set(st.h.id,after);
        if(before<st.h.target.count&&after>=st.h.target.count){bonusXp+=XP.WEEK_TARGET;areaXp[st.h.area]+=XP.WEEK_TARGET;note(st.h.area,date,st.h.name+' 주간 목표 달성',XP.WEEK_TARGET);earned.push('WEEK_TARGET');}
      }
    }
    const allDone=ids=>ids.every(id=>{const h=byId.get(id);return Boolean(h&&doneOf(i,h));});
    let comboXp=0;
    const morning=allDone(MORNING_IDS),studyRoutine=allDone(COMMUTE_IDS)&&p.bricks>=STUDY_ROUTINE_BRICKS,perfect=Boolean(p.card)&&core.length>0&&visibleDone[i]===core.length;
    if(morning){comboXp+=XP.COMBO_MORNING;areaXp.BODY+=XP.COMBO_MORNING;note('BODY',date,'아침 콤보',XP.COMBO_MORNING);}
    if(studyRoutine){comboXp+=XP.COMBO_STUDY;areaXp.HEAD+=XP.COMBO_STUDY;note('HEAD',date,'공부 루틴 콤보',XP.COMBO_STUDY);}
    if(perfect)comboXp+=XP.COMBO_PERFECT;                                // 완벽한 날은 특정 영역 소속이 아니다(하루 XP에만 더한다)
    areaXp.HEAD+=p.brickXp+p.ignite;
    if(p.brickXp+p.ignite>0)note('HEAD',date,p.bricks?'벽돌 '+p.bricks+'장'+(p.pieces?' + 조각 '+p.pieces:''):'조각 '+p.pieces,p.brickXp+p.ignite);
    bonusXp+=p.ignite;
    const boss=Boolean(p.card)&&exams.has(date);
    if(boss){bonusXp+=XP.BOSS;areaXp.HEAD+=XP.BOSS;note('HEAD',date,'보스 시험일',XP.BOSS);}
    // 주간 퀘스트: 그 주 안에서 처음 달성한 날에 +50과 창문 1개
    week.value2+=p.value2;
    for(const pt of p.parts)if(pt.bridge)week.bridgeValue2+=pt.bricks*2+pt.pieces;
    for(const q of week.quests){
      if(q.id==='workout'&&p.card&&workout&&doneOf(i,workout))q.value+=p.card.habits[workout.id].count??0;
      else if(q.id==='bricks')q.value=week.value2/2;
      else if(q.id==='nolate'&&nolate&&doneOf(i,nolate))q.value+=1;
      if(!q.done&&q.value>=q.target){q.done=true;q.doneDate=date;bonusXp+=q.xp;areaXp[q.area]+=q.xp;note(q.area,date,'퀘스트 '+q.label+' 달성',q.xp);week.windows++;earned.push('QUEST:'+q.id);if(date>=QUEST_EPOCH)addBonus('weekly',QUEST_BONUS.WEEK);}
    }
    // Q1A 일간·월간·보스: QUEST_EPOCH 전 날짜에는 XP·보너스가 0이다(판정만 남아 업적이 읽는다). 오늘 줄이 비지 않게 오늘은 EPOCH 전이어도 일간을 고른다.
    const daily=date>=QUEST_EPOCH||i===n-1?dailyAt(i):[];
    for(const q of daily)if(q.done&&q.xp){bonusXp+=q.xp;areaXp[q.area]+=q.xp;earned.push('DAILY:'+q.id);}
    const ym=date.slice(0,7);
    if(month?.month!==ym){
      if(month?.kind==='BUDGET'&&money?.months?.[month.month]?.kept)payMonth(month,date);
      month=openMonth(ym);months.push(month);
    }
    if(month.kind==='BRICKS'){month.value2+=p.value2;month.value=month.value2/2;if(!month.done&&month.value>=month.target)payMonth(month,date);}
    for(const b of bosses){
      if(b.done||i<b.no||i>b.no+BOSS_AFTER_DAYS)continue;
      if(i===b.no)b.card=Boolean(p.card);
      b.mistakes+=p.mistakes;
      if(b.card&&b.mistakes>=BOSS_MISTAKES){
        b.done=true;b.doneDate=date;
        if(date>=QUEST_EPOCH){b.xp=QUEST_XP.BOSS_KILL;b.bonus=QUEST_BONUS.BOSS;bonusXp+=b.xp;areaXp.HEAD+=b.xp;addBonus('boss',b.bonus);earned.push('BOSS_KILL:'+b.id);}
      }
    }
    // FIX49C 일기·주간 리뷰: 마음 영역 XP, 작은 벽돌, ✦(w.diary.bonus). 하루 XP에는 다른 XP처럼 더하고 메인 연속 배수도 같이 붙는다(연속 판정에는 넣지 않는다).
    let diaryXp=0,diaryBonus=0;const small=[],dy=diaryAt[i];
    if(dy){
      const base=Math.max(0,(dy.rated?DIARY_XP.RATE:0)+(dy.wrote?DIARY_XP.TEXT:0)-diaryHabitXp);
      diaryXp+=base;if(base)note('HEART',date,'일기',base);
      small.push({kind:'DIARY',weight:DIARY_WEIGHT.DAY});diaryTotals.days++;week.diary.days++;earned.push('DIARY');
      const q=week.diary.quest;q.value++;
      if(!q.done&&q.value>=q.target){q.done=true;q.doneDate=date;diaryXp+=q.xp;diaryBonus+=DIARY_BONUS.QUEST;note('HEART',date,'퀘스트 '+q.label+' 달성',q.xp);earned.push('DIARY_QUEST');}
      for(const [k,x,b] of DIARY_STREAK_PRIZES)if(diaryStreakAt[i]>=k&&!diaryPaid.has(k)){diaryPaid.add(k);diaryXp+=x;diaryBonus+=b;note('HEART',date,'일기 연속 '+k+'일',x);earned.push('DIARY_STREAK:'+k);}
    }
    if(reviewAt[i]){diaryXp+=DIARY_XP.REVIEW;diaryBonus+=DIARY_BONUS.REVIEW;small.push({kind:'REVIEW',weight:DIARY_WEIGHT.REVIEW});week.diary.review=true;diaryTotals.reviews++;note('HEART',date,'주간 리뷰',DIARY_XP.REVIEW);earned.push('WEEK_REVIEW');}
    const smallWeight=small.reduce((s,b)=>s+b.weight,0);
    if(anyDiary){
      areaXp.HEART+=diaryXp;week.diary.xp+=diaryXp;week.diary.bonus+=diaryBonus;week.diary.weight+=smallWeight;
      diaryTotals.xp+=diaryXp;diaryTotals.bonus+=diaryBonus;diaryTotals.weight+=smallWeight;diaryTotals.best=Math.max(diaryTotals.best,diaryStreakAt[i]);
    }
    const raw=habitXp+p.brickXp+comboXp+bonusXp+diaryXp,mult10=streakMult10(streakAt[i]),xp=roundXp(raw,mult10);
    totalXp+=xp;
    const slot=week.days[dayNumber(date)-dayNumber(week.monday)];
    slot.items=p.items;slot.perfect=perfect;slot.gems=p.gems;slot.xp=xp;slot.card=Boolean(p.card);
    if(small.length)slot.small=small;   // FIX49C 작은 금빛 벽돌(진짜 벽돌 items와 섞지 않는다)
    week.bricks+=p.bricks;week.pieces+=p.pieces;week.gold+=p.gold;week.gems+=p.gems;week.xp+=xp;if(perfect)week.perfect++;
    for(const pt of p.parts){
      const key=pt.subjectId??'?',s=week.subjects.get(key)??{id:key,name:pt.name,color:pt.color,bridge:pt.bridge,bricks:0,pieces:0};
      s.bricks+=pt.bricks;s.pieces+=pt.pieces;week.subjects.set(key,s);
    }
    days[i]={date,card:Boolean(p.card),habitXp,brickXp:p.brickXp,comboXp,bonusXp,ignite:p.ignite,boss,morning,studyRoutine,perfect,raw,mult10,xp,streak:streakAt[i],bridged:bridged[i],qualified:qualified[i],
      bricks:p.bricks,pieces:p.pieces,gold:p.gold,gems:p.gems,value:p.value2/2,visibleDone:visibleDone[i],visibleTotal:core.length,goal:goalAt(i),earned,daily,parts:p.parts,reviews:p.reviews,mistakes:p.mistakes};
    if(anyDiary)Object.assign(days[i],{diary:Boolean(dy),weekReview:reviewAt[i],diaryXp,diaryStreak:diaryStreakAt[i],small:smallWeight});
  }
  if(months.length)months[months.length-1].current=true;
  const outBosses=bosses.map(({no,...b})=>{
    const dDay=dayNumber(b.date)-dayNumber(today),prepFrom=indexOfDay(shiftDay(b.date,-BOSS_PREP_DAYS)),prepTo=indexOfDay(b.date);
    return {...b,dDay,state:b.done?'DONE':dDay>BOSS_PREP_DAYS?'UPCOMING':dDay>0?'PREP':dDay>=-BOSS_AFTER_DAYS?'OPEN':'PAST',prep:{value:(valuePrefix[prepTo]-valuePrefix[prepFrom])/2,gems:gemPrefix[prepTo]-gemPrefix[prepFrom]}};
  }).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.id<b.id?-1:1);
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
  const out={
    today,hasRecords,totalXp,days,weeks:outWeeks,levels,topArea:top,
    recent:Object.fromEntries(AREAS.map(a=>[a,[...recent[a]].reverse()])),
    streak:{days:streak,mult10:streakMult10(streak)},
    goalBricks,goalXp,todayXp:last.xp,todayDay:last,todayDifficulty,
    currentWeek:outWeeks[outWeeks.length-1],
    months:months.map(({value2,...m})=>m),bosses:outBosses,bonusTotal:bonusTotals.weekly+bonusTotals.month+bonusTotals.boss,bonusBy:bonusTotals,
  };
  // FIX49C: 일기 ✦는 bonusBy(주간·월간·보스)와 따로 diary.bonus에 있고, 전체 ✦(bonusTotal)에만 더한다. streak = 오늘 기준 일기 연속, best = 지금까지 최고(집 등불은 best).
  if(anyDiary){out.diary={...diaryTotals,streak:diaryStreakAt[n-1],quest:out.currentWeek.diary.quest};out.bonusTotal+=diaryTotals.bonus;}
  return out;
}

// 돈 XP (A1C, V4 결정 M1D 2): 직접 입력한 지출이 있는 날 하루 1번, 습관 한 칸만큼 돈 영역 XP. 가져오기 묶음(BATCH)과 명세서 가져오기(태그 '명세서:')는 넣지 않는다.
// 돈 영역 레벨에만 더한다. 하루 XP·연속·퀘스트는 그대로다. 금액·가게 이름은 읽지 않는다. fin을 넘기지 않으면 예전과 같은 결과다.
// FIX36 (H36-M5): 태그는 편집 칸에서 지울 수 있으므로 메모의 명세서 표지(fin-reconcile statementTxnInput: `명세서 <sha12> · [표 N · ]행 N`)도 본다. 투영 줄에는 메모가 없어 fin.txns에서 읽는다(줄 key = 'T:' + 거래 id).
export const MONEY_DAY_XP=XP.HABIT_UNIT*AUTO_DEFAULT;
const STATEMENT_TAG='명세서:',STATEMENT_MEMO=/^명세서 [0-9a-f]{12}(?: · 표 \d+)? · 행 \d+/;
export function moneyEntryDays(fin,today){
  const oldest=shiftDay(today,-MAX_SPAN_DAYS),dates=new Set(),fromStatement=new Set();
  for(const t of fin?.txns??[])if(typeof t?.data?.memo==='string'&&STATEMENT_MEMO.test(t.data.memo))fromStatement.add('T:'+t.id);
  for(const l of fin?.lines??[]){
    if(l.source!=='TXN'||l.kind!=='EXPENSE'||typeof l.date!=='string'||l.date>today||l.date<oldest)continue;
    if(fromStatement.has(l.key)||(typeof l.memo==='string'&&STATEMENT_MEMO.test(l.memo)))continue;
    if(!(l.tags??[]).some(t=>typeof t==='string'&&t.startsWith(STATEMENT_TAG)))dates.add(l.date);
  }
  return [...dates].sort();
}
function withMoney(base,fin,today){
  const dates=moneyEntryDays(fin,today);
  if(!dates.length)return base;
  const levels={...base.levels,MONEY:{area:'MONEY',...levelOf(base.levels.MONEY.xp+dates.length*MONEY_DAY_XP)}};
  const entries=dates.slice(-RECENT_MAX).reverse().map(date=>({date,text:'지출 기록',xp:MONEY_DAY_XP}));
  const money=[...entries,...base.recent.MONEY].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0).slice(0,RECENT_MAX);
  return {...base,levels,topArea:AREAS.reduce((a,b)=>levels[b].xp>levels[a].xp?b:a,AREAS[0]),recent:{...base.recent,MONEY:money}};
}
// 같은 입력(같은 객체와 같은 날짜)이면 다시 계산하지 않는다. 화면이 기록을 다시 읽으면 객체가 바뀌어 새로 계산한다. 돈 XP는 그 위에 얹으므로 fin을 안 넘기는 화면과 번갈아 불러도 다시 계산하지 않는다.
// R36: Q1A 돈 사실(money: 지킨 달·사용률, 월간 퀘스트 판정)은 엔진 입력이라 memo 열쇠에 넣고, M1A 돈 XP(fin: 직접 입력한 지출 날)는 그 위에 얹는다.
let memo=null,moneyMemo=null;
export function achieve({life=null,study=null,fin=null,today,money=null}){
  if(!(memo&&memo.life===life&&memo.study===study&&memo.today===today&&memo.money===money))memo={life,study,today,money,result:compute(life,study,today,money)};
  if(!fin)return memo.result;
  if(!(moneyMemo&&moneyMemo.base===memo.result&&moneyMemo.fin===fin))moneyMemo={base:memo.result,fin,result:withMoney(memo.result,fin,today)};
  return moneyMemo.result;
}
// 쌓기 전 예상: 오늘 화면의 입력(카드·공부 초안)을 쌓았다고 치고 계산한다. 아무것도 저장하지 않고 입력 객체도 바꾸지 않는다.
export function previewAchieve({life=null,study=null,today,card=null,studyCard=null,money=null}){
  const l=card?{...(life??{habits:[],subjects:[],exams:null}),days:[{date:today,data:card,heads:[]},...(life?.days??[]).filter(d=>d.date!==today)]}:life;
  const s=studyCard?{days:[{date:today,data:studyCard,heads:[]},...(study?.days??[]).filter(d=>d.date!==today)]}:study;
  return compute(l,s,today,money);
}
// 칸 하나를 완료할 때 오르는 습관 XP(난이도만, 콤보·배수 제외). 칸 위에 잠깐 보이는 값.
export const habitXpToday=(ach,habitId)=>XP.HABIT_UNIT*(ach.todayDifficulty[habitId]??AUTO_DEFAULT);
export const multText=mult10=>'×'+(mult10/10).toFixed(1);
// FIX49C "전체 벽돌" 표시: 공부 벽돌 + 작은 벽돌 무게(일기 0.25·리뷰 0.5). 업적·집 현판·목표는 공부 벽돌만 읽는다(이 값을 쓰지 않는다).
export const studyBricks=weeks=>weeks.reduce((n,w)=>n+w.bricks,0);
export const smallWeight=weeks=>weeks.reduce((n,w)=>n+(w.diary?.weight??0),0);
export const brickTotalText=weeks=>{const s=smallWeight(weeks);return '벽돌 '+(studyBricks(weeks)+s).toLocaleString('en-US')+'장'+(s?' (일기 '+s.toLocaleString('en-US')+'장 포함)':'');};
// 층의 금빛 기둥 = 그 주 ✦(주간·월간·보스) + 일기 ✦.
export const weekBonusTotal=w=>(w?.bonus?.total??0)+(w?.diary?.bonus??0);
