// 업적·칭호 (Q1A, 설계 Q1D §3·§5). 저장하지 않는 순수 투영이다: 성취 엔진 결과(achieve)와 기록만 보고 계산한다. 쓰기·시계·난수·저장소·네트워크 없음.
// 조건은 현재 목표값·습관 수에 기대지 않고 고정 상수와 습관 id만 쓴다. 벽돌 수는 실제 벽돌만 센다(보너스 ✦·일기 작은 벽돌 제외). 기록을 고쳐 조건이 깨지면 업적도 풀린다.
// 등급 업적 2개(grade-up·grade-1)와 칭호 40번은 모의고사 결과(EXAM_RESULT)의 등급으로 열린다(FIX46C, D46 6.3). phase 칸은 남겨 두며 지금은 모두 1이다.
import {entryDone,lifeDefs,dateKeyOK,dayNumber,shiftDay,kstDate} from './life-model.mjs';

const a=(id,group,name,target,o={})=>Object.freeze({id,group,name,target,hidden:false,phase:1,...o});
const EXAM_SUBJECTS=Object.freeze(['kor','math','eng','hist','soc','sci']),ALL_SUBJECTS=Object.freeze([...EXAM_SUBJECTS,'bio']);
const SUBJECT_NAME=Object.freeze({kor:'국어',math:'수학',eng:'영어',hist:'한국사',soc:'통합사회',sci:'통합과학',bio:'생물'});
const SUBJECT_BRICKS=200,HABIT_DAY_CELLS=10;
export const ACHIEVEMENTS=Object.freeze([
  a('brick-1','BRICK','첫 벽돌',1),a('brick-100','BRICK','백 장',100),a('brick-1000','BRICK','천 장',1000),a('brick-3000','BRICK','삼천 장',3000),a('brick-6000','BRICK','육천 장',6000),
  a('gold-1','BRICK','첫 금벽돌',1),a('day-8','BRICK','풀 가동',8),a('day-16','BRICK','불꽃의 날',16),
  a('streak-7','STREAK','연속 7일',7),a('streak-30','STREAK','연속 30일',30),a('streak-100','STREAK','연속 100일',100),a('streak-365','STREAK','연속 365일',365),a('recover-1','STREAK','다시 잇기',1),
  ...ALL_SUBJECTS.map(s=>a('sub-'+s,'SUBJECT',SUBJECT_NAME[s]+' 100시간',SUBJECT_BRICKS)),a('sub-all','SUBJECT','일곱 별',ALL_SUBJECTS.length),a('bridge-30','SUBJECT','다리 건너기',30),
  a('dawn-30','HABIT','새벽 기상 30일',30),a('dawn-100','HABIT','새벽 기상 100일',100),a('sun-30','HABIT','아침 빛 30일',30),a('sleep-30','HABIT','자정 전 취침 30일',30),a('nolate-30','HABIT','야식 없는 30일',30),a('workout-100','HABIT','운동 100회',100),a('habit10-30','HABIT','열 칸의 날 30일',30),
  a('gem-1','GEM','첫 보석',1),a('gem-100','GEM','보석 100개',100),
  a('ledger-30','MONEY','장부 30일',30),a('budget-1','MONEY','예산 한 달',1),a('budget-3','MONEY','예산 3달 연속',3),a('budget-12','MONEY','예산 12달 연속',12),
  a('boss-1','EXAM','첫 보스 처치',1),a('boss-season','EXAM','네 관문',4),a('grade-up','EXAM','등급 상승',1),a('grade-1','EXAM','1등급',1),
  a('questfull-1','QUEST','주간 완주',1),a('questfull-10','QUEST','열 주 완주',10),a('month-3','QUEST','석 달 정복',3),a('floor-10','QUEST','탑 10층',10),a('floor-52','QUEST','탑 52층',52),
  a('diary-1','DIARY','첫 장',1),a('diary-3','DIARY','사흘',3),a('diary-7','DIARY','일주일',7),a('diary-30','DIARY','한 달',30),a('diary-100','DIARY','백 일',100),a('diary-365','DIARY','한 해',365),a('review-10','DIARY','열 번 돌아봄',10),a('review-52','DIARY','한 해를 돌아봄',52),
  a('h-comeback','HIDDEN','돌아온 사람',1,{hidden:true}),a('h-exam-eve','HIDDEN','전날 밤',1,{hidden:true}),a('h-rest','HIDDEN','쉼을 아는 사람',10,{hidden:true}),a('h-allsub','HIDDEN','일곱 색의 하루',1,{hidden:true}),a('h-d100','HIDDEN','D-100',1,{hidden:true}),a('h-bridge','HIDDEN','건너간 다음 주',1,{hidden:true}),
]);
export const GROUP_TEXT=Object.freeze({BRICK:'벽돌',STREAK:'연속',SUBJECT:'과목',HABIT:'습관',GEM:'보석',MONEY:'돈',EXAM:'시험',QUEST:'퀘스트·탑',DIARY:'일기',HIDDEN:'숨김'});
export const HIDDEN_NAME='???';
export const MONEY_OFF_TEXT='가계부를 켜면 보여요';
export const CSAT_DAY_OFFSET=100;

const t=(no,name,achv,tier,phase=1)=>Object.freeze({no,id:'t-'+achv,name,achv,tier,phase});
// 칭호는 표시만 한다(XP 배수 없음, V4 결정 Q1D 1). 등급 BRONZE·SILVER·GOLD·HIDDEN(숨김 업적에서 풀림).
export const TITLES=Object.freeze([
  t(1,'첫 벽돌을 놓은 자','brick-1','BRONZE'),t(2,'백 장의 손','brick-100','BRONZE'),t(3,'천 장의 벽돌','brick-1000','SILVER'),t(4,'삼천 장의 석공','brick-3000','GOLD'),t(5,'탑의 건축가','brick-6000','GOLD'),
  t(6,'금을 만진 손','gold-1','BRONZE'),t(7,'한나절의 석공','day-8','SILVER'),t(8,'여덟 시간의 불꽃','day-16','GOLD'),t(9,'일곱 밤의 약속','streak-7','BRONZE'),t(10,'한 달의 등불','streak-30','SILVER'),
  t(11,'백일의 석탑','streak-100','GOLD'),t(12,'사계절을 건넌 자','streak-365','GOLD'),t(13,'다시 이은 사람','recover-1','BRONZE'),t(14,'문장 사냥꾼','sub-kor','SILVER'),t(15,'수의 검객','sub-math','SILVER'),
  t(16,'바다 건너 문장가','sub-eng','SILVER'),t(17,'역사의 증인','sub-hist','SILVER'),t(18,'세상을 읽는 자','sub-soc','SILVER'),t(19,'법칙의 탐험가','sub-sci','SILVER'),t(20,'생명의 징검다리','sub-bio','SILVER'),
  t(21,'일곱 별의 수험생','sub-all','GOLD'),t(22,'다리를 건넌 자','bridge-30','SILVER'),t(23,'새벽의 기록자','dawn-30','SILVER'),t(24,'여명의 주인','dawn-100','GOLD'),t(25,'아침 빛 수집가','sun-30','BRONZE'),
  t(26,'밤을 지킨 자','sleep-30','SILVER'),t(27,'야식을 벤 검','nolate-30','SILVER'),t(28,'강철 심장','workout-100','SILVER'),t(29,'열 칸의 규율','habit10-30','SILVER'),t(30,'오답 세공사','gem-100','SILVER'),
  t(31,'장부의 파수꾼','ledger-30','BRONZE'),t(32,'금고 지킴이','budget-3','SILVER'),t(33,'황금 금고의 주인','budget-12','GOLD'),t(34,'첫 보스 사냥꾼','boss-1','SILVER'),t(35,'네 관문의 정복자','boss-season','GOLD'),
  t(36,'열 주의 완주자','questfull-10','SILVER'),t(37,'쉰두 층의 주인','floor-52','GOLD'),t(38,'돌아온 석공','h-comeback','HIDDEN'),t(39,'쉼을 아는 자','h-rest','HIDDEN'),t(40,'등급을 깨뜨린 자','grade-up','GOLD'),
  t(41,'하루를 적는 사람','diary-7','BRONZE'),t(42,'한 달의 기록자','diary-30','SILVER'),t(43,'스스로를 읽는 자','review-52','GOLD'),   // FIX49C 일기
]);
const TIER_RANK=Object.freeze({GOLD:3,SILVER:2,HIDDEN:2,BRONZE:1});

const between=(at,lo,hi)=>typeof at==='string'&&at>=lo&&at<=hi;
const entryOf=(card,id)=>card&&Object.hasOwn(card.habits,id)?card.habits[id]:null;
const sleptBeforeMidnight=card=>{const e=entryOf(card,'hb-sleep');return Boolean(e?.done&&between(e.at,'04:00','23:59'));};
const value2Of=s=>s.bricks*2+s.pieces;
const monthAfter=ym=>new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),1)).toISOString().slice(0,10);

// money = moneyFacts 결과(가계부가 꺼져 있으면 null). 돌려주는 값: {list,shownDone,shownTotal,hiddenDone,hiddenTotal}. list의 각 줄 = {id,group,name,hidden,phase,done,doneDate,value,target,off}.
export function achievements(ach,{life=null,money=null}={}){
  const rows=new Map(ACHIEVEMENTS.map(x=>[x.id,{id:x.id,group:x.group,name:x.name,hidden:x.hidden,phase:x.phase,done:false,doneDate:null,value:0,target:x.target,off:x.group==='MONEY'&&money===null}]));
  const reach=(r,value,date)=>{if(value>r.value)r.value=value;if(!r.done&&value>=r.target){r.done=true;r.doneDate=date;}};
  const hit=(id,value,date)=>reach(rows.get(id),value,date);
  const brickRows=[1,100,1000,3000,6000].map(n=>rows.get('brick-'+n)),streakRows=[7,30,100,365].map(n=>rows.get('streak-'+n));
  const defs=lifeDefs(life),byId=new Map(defs.habits.map(h=>[h.id,h])),cards=new Map((life?.days??[]).map(d=>[d.date,d.data]));
  const exams=defs.exams?.items??[],eves=new Set(exams.map(x=>shiftDay(x.date,-1)));
  const csat=exams.find(x=>x.id==='e-csat')??exams.find(x=>x.name.includes('수능'))??null,d100=csat?shiftDay(csat.date,-CSAT_DAY_OFFSET):null;
  const subject=new Map(ALL_SUBJECTS.map(s=>[s,{row:rows.get('sub-'+s),bricks:0}]));
  let bricks=0,gold=0,gems=0,bridged=0,bridgeDays=0,dawn=0,sun=0,sleep=0,nolate=0,workout=0,cells10=0,rest=0,lastRecord=null,diaries=0,reviews=0;
  const diaryRows=[3,7,30,100,365].map(n=>rows.get('diary-'+n));

  for(let i=0;i<ach.days.length;i++){
    const d=ach.days[i],date=d.date,card=cards.get(date)??null;
    // FIX49C 일기: 성취 엔진이 센 일기 날·일기 연속·주간 리뷰(첫 기록일 전 일기는 엔진이 넣지 않는다). 다른 업적 판정에는 닿지 않는다.
    if(d.diary){diaries++;hit('diary-1',diaries,date);for(const r of diaryRows)reach(r,d.diaryStreak,date);}
    if(d.weekReview){reviews++;hit('review-10',reviews,date);hit('review-52',reviews,date);}
    if(d.bricks){bricks+=d.bricks;for(const r of brickRows)reach(r,bricks,date);hit('day-8',d.bricks,date);hit('day-16',d.bricks,date);}
    if(d.gold){gold+=d.gold;hit('gold-1',gold,date);}
    if(d.streak)for(const r of streakRows)reach(r,d.streak,date);
    if(d.bridged){bridged++;hit('recover-1',bridged,date);}
    if(d.gems){gems+=d.gems;hit('gem-1',gems,date);hit('gem-100',gems,date);}
    const parts=d.parts;let kinds=0,mask=0;
    for(let k=0;k<parts.length;k++){
      const pt=parts[k];if(!pt.bricks)continue;
      const s=subject.get(pt.subjectId);if(!s)continue;
      s.bricks+=pt.bricks;reach(s.row,s.bricks,date);
      const bit=1<<ALL_SUBJECTS.indexOf(pt.subjectId);if(!(mask&bit)){mask|=bit;kinds++;}
    }
    if(kinds===ALL_SUBJECTS.length)hit('h-allsub',1,date);
    if(parts.length>1&&parts[0].subjectId==='bio'&&parts.some((pt,k)=>k>0&&pt.bricks>0&&EXAM_SUBJECTS.includes(pt.subjectId))){bridgeDays++;hit('bridge-30',bridgeDays,date);}
    if(d.card||d.value>0){if(lastRecord!==null&&i-lastRecord-1>=7)hit('h-comeback',1,date);lastRecord=i;}
    if(eves.has(date)&&d.bricks>=1&&sleptBeforeMidnight(card))hit('h-exam-eve',1,date);
    if(date===d100&&d.bricks>=1)hit('h-d100',1,date);
    if(!card)continue;
    const wake=entryOf(card,'hb-wake');if(wake?.done&&between(wake.at,'03:00','06:00')){dawn++;hit('dawn-30',dawn,date);hit('dawn-100',dawn,date);}
    const light=entryOf(card,'hb-sun');if(light?.done&&(light.minutes??0)>=15){sun++;hit('sun-30',sun,date);}
    if(sleptBeforeMidnight(card)){sleep++;hit('sleep-30',sleep,date);}
    if(entryOf(card,'hb-nolate')?.done){nolate++;hit('nolate-30',nolate,date);}
    const move=entryOf(card,'hb-workout');if(move?.done&&move.count){workout+=move.count;hit('workout-100',workout,date);}
    let cells=0;for(const [id,e] of Object.entries(card.habits)){const h=byId.get(id);if(h?entryDone(h,e):e.done)cells++;}
    if(cells>=HABIT_DAY_CELLS){cells10++;hit('habit10-30',cells10,date);}
    if((card.dayType==='REST'||card.dayType==='DETOX')&&entryOf(card,'hb-recovery')?.done){rest++;hit('h-rest',rest,date);}
  }
  const subDone=ALL_SUBJECTS.map(s=>rows.get('sub-'+s)).filter(r=>r.done);
  hit('sub-all',subDone.length,subDone.reduce((m,r)=>r.doneDate>m?r.doneDate:m,''));

  let fullWeeks=0,floors=0;
  ach.weeks.forEach((w,i)=>{
    if(w.quests.length&&w.quests.every(q=>q.done)){
      fullWeeks++;const date=w.quests.reduce((m,q)=>q.doneDate>m?q.doneDate:m,'');
      hit('questfull-1',fullWeeks,date);hit('questfull-10',fullWeeks,date);
    }
    if(w.bricks>0){
      floors++;const date=w.days.find(d=>d.items.some(b=>!b.half))?.date??w.monday;
      hit('floor-10',floors,date);hit('floor-52',floors,date);
    }
    // 끝난 주만 본다(진행 중인 주의 비중은 하루 안에도 오르내린다).
    const next=ach.weeks[i+1];
    if(next&&!next.current){
      const total=w.subjects.reduce((n,s)=>n+value2Of(s),0),bio=w.subjects.filter(s=>s.id==='bio').reduce((n,s)=>n+value2Of(s),0);
      const nextTotal=next.subjects.reduce((n,s)=>n+value2Of(s),0),nextExam=next.subjects.filter(s=>EXAM_SUBJECTS.includes(s.id)).reduce((n,s)=>n+value2Of(s),0);
      if(total>0&&bio*2>total&&nextTotal>0&&nextExam*100>=80*nextTotal)hit('h-bridge',1,shiftDay(next.monday,6));
    }
  });
  let monthsDone=0;
  for(const m of ach.months)if(m.done){monthsDone++;hit('month-3',monthsDone,m.doneDate);}

  // 등급 업적: 모의고사 결과로만 계산한다. 결과를 고치거나 지워 조건이 깨지면 다시 잠긴다. 달성일 = 결과를 넣은 날(gradeFacts).
  const grade=gradeFacts(life?.results);
  for(const id of ['grade-up','grade-1'])if(grade[id].done)hit(id,1,grade[id].doneDate);

  const killed=ach.bosses.filter(b=>b.done);
  if(killed.length)hit('boss-1',1,killed[0].doneDate);
  const years=new Map();
  for(const b of ach.bosses){const y=b.date.slice(0,4),e=years.get(y)??{total:0,done:0,last:''};e.total++;if(b.done){e.done++;if(b.doneDate>e.last)e.last=b.doneDate;}years.set(y,e);}
  const season=rows.get('boss-season');
  for(const e of years.values()){
    if(e.done>season.value)season.value=e.done;
    if(e.done===e.total&&!season.done){season.done=true;season.doneDate=e.last;season.target=e.total;}
  }

  if(money){
    money.ledgerDates.forEach((date,i)=>hit('ledger-30',i+1,date));
    let run=0;
    for(const m of money.series){
      run=m.kept?run+1:0;
      if(m.kept){const date=monthAfter(m.month);hit('budget-1',run,date);hit('budget-3',run,date);hit('budget-12',run,date);}
    }
  }
  const list=[...rows.values()],active=list.filter(r=>r.phase===1),count=(rs,hidden)=>rs.filter(r=>r.hidden===hidden);
  return {list,shownDone:count(active,false).filter(r=>r.done).length,shownTotal:count(active,false).length,hiddenDone:count(active,true).filter(r=>r.done).length,hiddenTotal:count(active,true).length};
}
// 등급 업적 해제 계산(D46 6.3). results = lifeRawView의 results. 위 achievements()가 부른다.
// 낮아진 등급 = 같은 과목의 직전 등급 있는 시험보다 숫자가 작음. 순서는 응시일, 달성일은 결과를 넣은 날(둘을 비교하려면 둘 다 있어야 하므로 grade-up은 두 입력일 중 늦은 쪽). 여러 번이면 가장 이른 날.
export function gradeFacts(results){
  const order=[...(results??[])].sort((a,b)=>a.data.takenOn<b.data.takenOn?-1:a.data.takenOn>b.data.takenOn?1:a.id<b.id?-1:a.id>b.id?1:0);
  const enteredOn=r=>r.createdAt?kstDate(r.createdAt):r.data.takenOn,last=new Map(),earlier=(x,y)=>x===null||y<x?y:x;
  let one=null,up=null;
  for(const r of order)for(const s of r.data.scores){
    if(s.grade===null)continue;
    const date=enteredOn(r),prev=last.get(s.subjectId);
    if(s.grade===1)one=earlier(one,date);
    if(prev&&s.grade<prev.grade)up=earlier(up,prev.date>date?prev.date:date);
    last.set(s.subjectId,{grade:s.grade,date});
  }
  return {'grade-1':{done:one!==null,doneDate:one},'grade-up':{done:up!==null,doneDate:up}};
}
// 숨김 업적은 달성 전에 이름을 보이지 않는다.
export const shownName=r=>r.hidden&&!r.done?HIDDEN_NAME:r.name;
export const recentDone=(list,limit)=>list.filter(r=>r.done).map((r,i)=>[r,i]).sort(([x,i],[y,j])=>(x.doneDate<y.doneDate?1:x.doneDate>y.doneDate?-1:j-i)).slice(0,limit).map(([r])=>r);
// 가까운 업적: 이미 시작한 것만, 진행률이 높은 순. 숨김·2단계·가계부가 꺼진 돈 업적은 뺀다.
export const nearDone=(list,limit)=>list.filter(r=>!r.done&&!r.hidden&&r.phase===1&&!r.off&&r.value>0).map((r,i)=>[r,i]).sort(([x,i],[y,j])=>y.value/y.target-x.value/x.target||i-j).slice(0,limit).map(([r])=>r);

// 풀린 칭호 목록(표 순서). 칭호는 업적을 거쳐 풀린다.
export function unlockedTitles(list){
  const byId=new Map(list.map(r=>[r.id,r]));
  return TITLES.filter(x=>x.phase===1&&byId.get(x.achv)?.done).map(x=>({...x,doneDate:byId.get(x.achv).doneDate}));
}
// 표시할 칭호: 고른 것이 풀려 있으면 그것(기록을 고쳐 풀린 칭호는 자동으로 돌아간다), 아니면 가장 높은 등급 중 최근 해금. 없으면 null.
export function titleOf(list,chosenId=null){
  const open=unlockedTitles(list),chosen=chosenId?open.find(x=>x.id===chosenId):null;
  if(chosen)return {...chosen,auto:false};
  let best=null;
  for(const x of open){
    const r=TIER_RANK[x.tier],br=best?TIER_RANK[best.tier]:0;
    if(r>br||(r===br&&x.doneDate>=best.doneDate))best=x;
  }
  return best?{...best,auto:true}:null;
}

// 기기 장부 lb.achv.seen.v1: {업적 id:달성일}. 달성 모션·알림 중복을 막을 뿐 판정에는 쓰지 않는다. 기기마다 따로이며 이름·금액은 넣지 않는다.
export const ACHV_SEEN_KEY='lb.achv.seen.v1',SEEN_FRESH_DAYS=3;
const KNOWN_IDS=new Set(ACHIEVEMENTS.map(x=>x.id));
// 저장소 글 → 장부. 없거나 깨졌으면 null(첫 실행과 같게).
export function parseSeen(raw){
  if(typeof raw!=='string')return null;
  let v;try{v=JSON.parse(raw);}catch{return null;}
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  return Object.fromEntries(Object.entries(v).filter(([id,date])=>KNOWN_IDS.has(id)&&dateKeyOK(date)));
}
// 달성 목록 − 장부 = 새 달성. 첫 실행(장부 없음)은 지금까지의 달성을 조용히 장부에 넣고, 달성일이 3일 넘은 것(다른 기기 달성 등)도 장부에만 넣는다.
// 돌려주는 값: {next(새 장부),fresh(이번에 알릴 줄),firstRun,quiet(조용히 넣은 수)}.
export function settleSeen(list,seen,today){
  const done=list.filter(r=>r.done),next={...(seen??{})},fresh=[];let quiet=0;
  for(const r of done){
    if(Object.hasOwn(next,r.id))continue;
    next[r.id]=r.doneDate;
    if(seen!==null&&dayNumber(today)-dayNumber(r.doneDate)<=SEEN_FRESH_DAYS)fresh.push(r);else quiet++;
  }
  return {next,fresh,firstRun:seen===null,quiet};
}
