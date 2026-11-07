// 사령부 상태 내보내기 (B47'·B47). 이미 화면에 보이는 투영값을 LIFE_STATE.md 한 장의 글(형식 v1, 절 1~7, 켠 경우 8·9)로 요약한다.
// 이 모듈은 아무것도 쓰지 않고 시계·난수·저장소·네트워크를 쓰지 않는다(이 기기 설정 읽기·쓰기는 부른 쪽이 넘긴 storage로만).
// 기본 제외: 자유 메모·일기 본문·건강 세부·거래 내역·가게 이름·카테고리 세부·계정·기기 식별자·토큰. 7절 "한 줄"은 기본 비공개이고
// 소유자가 같은 화면의 토글을 켠 때만(최대 60자) 어제 카드의 한 줄을 싣는다. 값을 모르면 UNKNOWN(0과 구분).
// 8절(공부 요약: 과목명과 숫자만)·9절(건강 요약: 수면·걸음 평균과 기록 일수만)은 토글이 기본 꺼짐이고, 소유자가 켠 절만 단추 내보내기와 쌓기 뒤 자동 내보내기에 들어간다(토글을 켠 것이 동의, 통제탑 결정 B61).
// 시험 점수·등급(life.results)·주간 목표(life.goals)·칭호(life.profile)·책 이름과 쪽 번호는 읽지 않는다(통제탑 결정 D46 ★4, 넣으면 외부 AI 전송 범위 변경). 형식 v1 그대로다.
// 형식 정본: AUTOPILOT\design\STATE_FORMAT_V1.md (8·9절 범위는 작업 B47 지시서가 정한다).
import {lifeDefs,entryDone,nearestExam,dDay,shiftDay,kstDate,hhmmFromIso,subjectOfSession} from './life-model.mjs';
import {achieve,SUBJECT_BY_CODE} from './life-achieve.mjs';
import {moneyFacts} from './life-money-facts.mjs';
import {csatTarget} from './life-plan.mjs';
import {feelOfFin,feelExport,feelExportText} from './fin-feel.mjs';
import {STACK_DONE} from './life-flow.mjs';
import {projectStudy} from './study-projection.mjs';
import {rhythmSummary,stepsAverage} from './hlt-projection.mjs';

export const STATE_FORMAT='v1';
export const STATE_MAX_BYTES=8192,STATE_TARGET_BYTES=4096;
export const MAX_HABIT_ROWS=12,MAX_SUBJECT_ROWS=8,MAX_LINE_CHARS=60,WINDOW_DAYS=7;
export const LINE_SWITCH_KEY='lb.state.line';
export const DEVICE_NAME='PC 앱';
export const UNKNOWN='UNKNOWN';
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'}),AREA_ORDER=Object.freeze(['BODY','HEAD','MONEY','HEART']);

// ---- 이 기기 설정: "한 줄 내보내기" 토글(기본 끔). 저장소가 막혀 있으면 이번 실행 동안만 ----
let memoryLine=false;
export function lineEnabled(storage){try{const v=storage?.getItem(LINE_SWITCH_KEY);return v===null||v===undefined?memoryLine:v==='1';}catch{return memoryLine;}}
export function setLineEnabled(on,storage){memoryLine=Boolean(on);try{storage?.setItem(LINE_SWITCH_KEY,on?'1':'0');}catch{/* 이번 실행 동안만 */}return lineEnabled(storage);}

// ---- 이 기기 설정: "쌓을 때 자동 내보내기" 토글(B54, 기본 켬). PC 앱에서만 쓰인다. 저장소가 막혀 있으면 이번 실행 동안만 ----
export const AUTO_SWITCH_KEY='lb.state.auto';
let memoryAuto=true;
export function autoEnabled(storage){try{const v=storage?.getItem(AUTO_SWITCH_KEY);return v===null||v===undefined?memoryAuto:v==='1';}catch{return memoryAuto;}}
export function setAutoEnabled(on,storage){memoryAuto=Boolean(on);try{storage?.setItem(AUTO_SWITCH_KEY,on?'1':'0');}catch{/* 이번 실행 동안만 */}return autoEnabled(storage);}

// ---- 이 기기 설정: 8절 공부 요약·9절 건강 요약 토글(B47, 둘 다 기본 끔). 저장소가 막혀 있으면 이번 실행 동안만 ----
export const SECTION_SWITCH_KEYS=Object.freeze({study:'lb.state.study',health:'lb.state.health'});
const memorySection={study:false,health:false};
export function sectionEnabled(which,storage){try{const v=storage?.getItem(SECTION_SWITCH_KEYS[which]);return v===null||v===undefined?memorySection[which]:v==='1';}catch{return memorySection[which];}}
export function setSectionEnabled(which,on,storage){memorySection[which]=Boolean(on);try{storage?.setItem(SECTION_SWITCH_KEYS[which],on?'1':'0');}catch{/* 이번 실행 동안만 */}return sectionEnabled(which,storage);}

// ---- 글 정리: 표·머리말을 깨는 문자 제거 ----
export function clean(value,max=20){
  if(typeof value!=='string')return '';
  const t=value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g,' ').replace(/\|/g,'/').replace(/\s+/g,' ').trim();
  return [...t].slice(0,max).join('');
}
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'));
const nat=v=>Number.isSafeInteger(v)&&v>=0;
const moneyOK=v=>typeof v==='string'&&/^-?\d{1,15}$/.test(v);
const pct=(done,goal)=>goal>0?Math.round(done*100/goal)+'%':UNKNOWN;
const num=v=>Number.isInteger(v)?String(v):(Math.round(v*10)/10).toFixed(1);

// ---- 스냅샷 만들기: 앱이 이미 가진 투영(life·study·fin)에서 숫자만 뽑는다. 읽기만 하고 아무것도 바꾸지 않는다 ----
// 절마다 따로 실패해도 그 절만 null(UNKNOWN)이 된다.
const guard=fn=>{try{return fn();}catch{return null;}};

// FIX49D: 주간 리뷰 화면도 이 계산을 그대로 부른다(today = 그 주 일요일). 내보내기 1절 숫자와 리뷰 화면 숫자가 같은 투영에서 나온다(D49 7.3).
export function habitWindow(life,today,days=WINDOW_DAYS){
  if(!life)return null;
  const span=Number.isInteger(days)&&days>=1&&days<=WINDOW_DAYS?days:WINDOW_DAYS;   // 주 중간 리뷰는 월요일~오늘만 본다(FIX50B C4). 기본은 7일 그대로
  const defs=lifeDefs(life),dates=Array.from({length:span},(_,i)=>shiftDay(today,i-(span-1)));
  const cards=new Map(life.days.filter(d=>dates.includes(d.date)).map(d=>[d.date,d.data]));
  const rows=[];
  for(const h of defs.habits.filter(x=>!x.hidden).slice(0,MAX_HABIT_ROWS)){
    const entries=dates.map(d=>{const c=cards.get(d);return c&&Object.hasOwn(c.habits,h.id)?c.habits[h.id]:null;});
    let goal,done;
    if(h.kind==='RECOVERY'){goal=1;done=Math.min(1,entries.filter(e=>entryDone(h,e)).length);}                       // 복구는 주 1번이 목표(연속을 이어 주는 습관)
    else if(h.target.per==='WEEK'){goal=h.target.count??1;const sum=entries.reduce((s,e)=>s+(entryDone(h,e)?(h.kind==='COUNT'?e.count??0:1):0),0);done=Math.min(goal,sum);}
    else{goal=span;done=entries.filter(e=>entryDone(h,e)).length;}
    rows.push({name:clean(h.name),done,goal});
  }
  return rows;
}
function brickWeeks(ach,study){
  if(!study)return null;
  const cur=ach.currentWeek,prev=ach.weeks.find(w=>w.monday===shiftDay(cur.monday,-7))??null,by=new Map();
  const add=(w,key)=>{for(const s of w?.subjects??[]){const r=by.get(s.id)??{name:clean(s.name)||'기타',thisWeek:0,lastWeek:0};r[key]+=s.bricks+s.pieces/2;by.set(s.id,r);}};
  add(cur,'thisWeek');add(prev,'lastWeek');
  const rows=[...by.values()].filter(r=>r.thisWeek>0||r.lastWeek>0).sort((a,b)=>b.thisWeek-a.thisWeek||(a.name<b.name?-1:1)).slice(0,MAX_SUBJECT_ROWS);
  return {unit:'개',rows};
}
function streakInfo(ach){
  if(!ach.hasRecords)return null;
  let longest=ach.streak.days,broken=null;
  for(let i=0;i<ach.days.length;i++){
    const d=ach.days[i];if(d.streak>longest)longest=d.streak;
    if(i>0&&i<ach.days.length-1&&d.streak===0&&ach.days[i-1].streak>0)broken=d.date;            // 오늘은 아직 끝나지 않아 끊긴 날이 될 수 없다
  }
  return {current:ach.streak.days,longest,mult10:ach.streak.mult10,brokenDate:broken};
}
// 이번 주 변화 = 지금 레벨 − 지난 일요일 끝 기준 레벨(같은 계산을 지난 일요일 날짜로 한 번 더 한다).
const lastSunday=today=>shiftDay(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7)-1);
const levelInfo=(ach,before)=>AREA_ORDER.map(a=>({area:AREA_TEXT[a],level:ach.levels[a].level,delta:ach.levels[a].level-before.levels[a].level}));
// M1C: 월말 값·상태·진단은 돈 탭 카드와 같은 계산(fin-feel.mjs)에서 받는다. 첫 주 + 이력 없음이면 카드처럼 월말을 단정하지 않는다(UNKNOWN). 진단 줄에는 단계·비율·날짜만 넣는다.
function vaultInfo(fin,today){
  if(!fin)return null;
  const {status:s,feel:x}=feelOfFin(fin,today),T=s.total;
  if(!T)return null;
  const known=s.dataState==='KNOWN';
  return {budget:T.budget.toString(),spent:known?s.actualTotal.toString():null,projected:known&&x.left!==null?(T.budget-x.left).toString():null,fast:x.level==='DANGER'||x.level==='CAUTION',feel:feelExport(x)};
}
function examInfo(life,today){
  if(!life)return null;
  const exams=lifeDefs(life).exams,near=nearestExam(exams,today),csat=csatTarget(exams);
  const csatOut=csat&&csat.date>=today?{name:clean(csat.name),status:clean(csat.status,4),date:csat.date,dDay:dDay(today,csat.date),isNearest:Boolean(near&&near.id===csat.id)}:null;
  return {nearest:near?{name:clean(near.name),date:near.date,dDay:near.dDay}:null,csat:csatOut};
}
function yesterdayInfo(life,today,includeLine){
  if(!life)return null;
  const card=life.days.find(d=>d.date===shiftDay(today,-1))?.data??null;
  let line=null;
  if(includeLine&&card){const first=card.note.split(/\r?\n/).map(x=>clean(x,MAX_LINE_CHARS)).find(x=>x);line=first??'';}
  return {mood:card&&Number.isInteger(card.mood)?card.mood:null,hasCard:Boolean(card),line};
}
// 8절: 이번 주(월요일~오늘) 쌓은 공부 분은 벽돌과 같은 기준(COMPLETED만), 오답은 이번 주 기록 수, 복습 예정은 오늘까지 할 것(밀린 것 포함). 과목명과 숫자만 뽑는다.
function studySummaryOf(life,study,today){
  if(!study)return null;
  const names=new Map(lifeDefs(life).subjects.map(s=>[s.id,clean(s.name)])),monday=shiftDay(lastSunday(today),1),by=new Map();
  const row=id=>{const name=names.get(id)||'기타';if(!by.has(name))by.set(name,{name,minutes:0,due:0,mistakes:0});return by.get(name);};
  for(const d of study.days){
    if(d.date<monday||d.date>today)continue;
    for(const s of d.data.sessions)if(s.state==='COMPLETED'&&nat(s.confirmedMin)&&s.confirmedMin<=1440)row(subjectOfSession(s.id)??SUBJECT_BY_CODE[s.subject]).minutes+=s.confirmedMin;
    for(const m of d.data.mistakes)row(subjectOfSession(m.id)??SUBJECT_BY_CODE[m.subject]).mistakes++;
  }
  const p=projectStudy(study.days.map(d=>d.data),today);
  for(const r of [...p.dueToday,...p.overdue])row(subjectOfSession(r.mistakeId)??SUBJECT_BY_CODE[r.subject]).due++;
  return {rows:[...by.values()].filter(r=>r.minutes||r.due||r.mistakes).sort((a,b)=>b.minutes-a.minutes||b.due-a.due||(a.name<b.name?-1:1))};
}
// 9절: 최근 7일의 수면(본잠 합계의 하루 평균)·걸음 평균·기록 일수만. 약·증상·기분·메모·습관 항목은 읽지 않는다. 기록 일수 = 수면 또는 걸음 기록이 있는 날.
function healthSummaryOf(hlt,today){
  if(!hlt)return null;
  const from=shiftDay(today,-(WINDOW_DAYS-1)),days=hlt.days.filter(d=>d.date>=from&&d.date<=today);
  let recorded=0;
  for(const d of days){
    if(d.data.items.some(i=>i.type==='steps'&&nat(i.count)||i.type==='sleep'&&i.kind==='main'&&i.endAt!==null))recorded++;
  }
  return {from,to:today,days:recorded,avgSleepMinutes:rhythmSummary(days,[],today).week.avgSleepMinutes,avgSteps:stepsAverage(days,today,WINDOW_DAYS).avg};
}
// views = {life,study,fin,hlt}(wholeLifeView의 같은 이름 항목, 없으면 null). now = ISO 시각 문자열. includeLine·includeStudy·includeHealth = 소유자가 켠 토글(끄면 그 값은 읽지도 않는다).
export function snapshotFromViews({life=null,study=null,fin=null,hlt=null,now,includeLine=false,includeStudy=false,includeHealth=false,deviceName=DEVICE_NAME}){
  const today=kstDate(now);
  // 지난 일요일 기준 계산을 먼저 하고 오늘 기준 계산을 마지막에 해, achieve의 마지막 결과 보관이 오늘 값으로 남게 한다(화면 계산을 다시 하지 않게).
  const before=life?guard(()=>achieve({life,study,fin,today:lastSunday(today),money:moneyFacts(fin,lastSunday(today))})):null;
  const ach=life?guard(()=>achieve({life,study,fin,today,money:moneyFacts(fin,today)})):null;
  return {today,exportedAt:today+' '+hhmmFromIso(now),device:clean(deviceName),
    habits:guard(()=>habitWindow(life,today)),
    bricks:ach?guard(()=>brickWeeks(ach,study)):null,
    streak:ach?guard(()=>streakInfo(ach)):null,
    levels:ach&&before?guard(()=>levelInfo(ach,before)):null,
    vault:guard(()=>vaultInfo(fin,today)),
    exams:guard(()=>examInfo(life,today)),
    yesterday:guard(()=>yesterdayInfo(life,today,includeLine)),
    studySummary:includeStudy?guard(()=>studySummaryOf(life,study,today)):null,
    healthSummary:includeHealth?guard(()=>healthSummaryOf(hlt,today)):null};
}

// ---- 글 만들기: 순수 함수. 스냅샷만 보고 글을 만든다(시계·저장소 없음) ----
const table=(head,rows)=>['| '+head.join(' | ')+' |','|'+head.map(()=>'---').join('|')+'|',...rows.map(r=>'| '+r.join(' | ')+' |')];
const unknownRow=n=>Array.from({length:n},()=>UNKNOWN);
function sectionHabits(s){
  const head=['습관','완료','목표','완료율'];
  if(!Array.isArray(s.habits))return table(head,[unknownRow(4)]);
  const rows=s.habits.slice(0,MAX_HABIT_ROWS).filter(r=>r&&nat(r.done)&&nat(r.goal)&&r.goal>0&&clean(r.name)).map(r=>({name:clean(r.name),done:Math.min(r.done,r.goal),goal:r.goal}));
  const done=rows.reduce((a,r)=>a+r.done,0),goal=rows.reduce((a,r)=>a+r.goal,0);
  if(!rows.length)return table(head,[unknownRow(4)]);
  return table(head,[...rows.map(r=>[r.name,String(r.done),String(r.goal),pct(r.done,r.goal)]),['전체',String(done),String(goal),pct(done,goal)]]);
}
function sectionBricks(s){
  const head=['과목','이번 주 쌓은 양','지난주','단위'];
  if(!s.bricks||!Array.isArray(s.bricks.rows))return table(head,[[UNKNOWN,UNKNOWN,UNKNOWN,'개']]);
  const unit=s.bricks.unit==='분'?'분':'개',rows=s.bricks.rows.slice(0,MAX_SUBJECT_ROWS).filter(r=>r&&clean(r.name)&&Number.isFinite(r.thisWeek)&&Number.isFinite(r.lastWeek));
  const lines=rows.length?rows.map(r=>[clean(r.name),num(r.thisWeek),num(r.lastWeek),unit]):[['전체','0','0',unit]];
  return table(head,lines);
}
function sectionStreak(s){
  const k=s.streak;
  if(!k||!nat(k.current)||!nat(k.longest)||!Number.isInteger(k.mult10))return ['- 현재 연속일: UNKNOWN / 최장 연속일: UNKNOWN / 현재 배수: UNKNOWN','- 끊긴 날: UNKNOWN'];
  return ['- 현재 연속일: '+k.current+'일 / 최장 연속일: '+Math.max(k.longest,k.current)+'일 / 현재 배수: '+(k.mult10/10).toFixed(1),'- 끊긴 날: '+(dateOK(k.brokenDate)?k.brokenDate:'없음')];
}
function sectionLevels(s){
  const head=['영역','레벨','이번 주 변화'];
  if(!Array.isArray(s.levels))return table(head,[unknownRow(3)]);
  const rows=s.levels.filter(r=>r&&clean(r.area)&&nat(r.level)).map(r=>[clean(r.area),String(r.level),Number.isInteger(r.delta)?(r.delta>0?'+'+r.delta:String(r.delta)):UNKNOWN]);
  return table(head,rows.length?rows:[unknownRow(3)]);
}
function sectionVault(s){
  const v=s.vault;
  if(!v||!moneyOK(v.budget))return ['- 이번 달 예산: UNKNOWN / 쓴 돈: UNKNOWN / 남은 돈: UNKNOWN','- 이대로면 월말: UNKNOWN'];
  const budget=BigInt(v.budget);
  if(!moneyOK(v.spent))return ['- 이번 달 예산: '+budget+'원 / 쓴 돈: UNKNOWN / 남은 돈: UNKNOWN','- 이대로면 월말: UNKNOWN'];
  const spent=BigInt(v.spent),left=budget-spent,line1='- 이번 달 예산: '+budget+'원 / 쓴 돈: '+spent+'원 / 남은 돈: '+left+'원';   // 남은 돈은 항상 예산 − 쓴 돈에서 다시 계산한다
  const said=feelExportText(v.feel),diagnosis=said?['- 돈 진단: '+said]:[];   // 진단이 없으면 줄도 없다
  if(!moneyOK(v.projected))return [line1,'- 이대로면 월말: UNKNOWN',...diagnosis];
  const projected=BigInt(v.projected),status=spent>budget?'초과 중':projected>budget||v.fast===true?'빠듯':'여유';
  return [line1,'- 이대로면 월말: 남은 돈 '+(budget-projected)+'원 (상태: '+status+')',...diagnosis];
}
function sectionExams(s){
  const e=s.exams;
  if(!e)return ['- 이름: UNKNOWN / 날짜: UNKNOWN / D-day: UNKNOWN'];
  const out=[];
  if(e.nearest&&dateOK(e.nearest.date)&&Number.isInteger(e.nearest.dDay))out.push('- 이름: '+(clean(e.nearest.name)||UNKNOWN)+' / 날짜: '+e.nearest.date+' / D-day: '+e.nearest.dDay);
  else out.push('- 이름: UNKNOWN / 날짜: UNKNOWN / D-day: UNKNOWN');
  const c=e.csat;
  if(c&&c.isNearest!==true&&dateOK(c.date)&&Number.isInteger(c.dDay))out.push('- '+(clean(c.name)||'수능')+(c.status?'('+clean(c.status,4)+' '+c.date+')':'('+c.date+')')+' D-day: '+c.dDay);
  return out;
}
// 소유자가 한 줄을 켜도 비밀값 모양(서비스 키·토큰·개인키·긴 무작위 문자열)이 들어 있으면 그 줄은 내보내지 않는다.
const SECRET_SHAPE=/\bsb_[a-z]+_|service[_-]?role|eyJ[A-Za-z0-9_-]{10,}\.|-----BEGIN|Bearer\s|[A-Za-z0-9+/_-]{32,}/;
function sectionYesterday(s,includeLine){
  const y=s.yesterday,mood=y&&Number.isInteger(y.mood)&&y.mood>=1&&y.mood<=5?String(y.mood):UNKNOWN;
  const one=y&&typeof y.line==='string'?clean(y.line,MAX_LINE_CHARS):'';
  const line=!includeLine||SECRET_SHAPE.test(y?.line??'')?'비공개':one?one:'없음';
  return ['- 기분: '+mood,'- 한 줄: '+line];
}
function sectionStudy(s){
  const head=['과목','이번 주 분','복습 예정','오답'],v=s.studySummary;
  if(!v||!Array.isArray(v.rows))return table(head,[unknownRow(4)]);
  const rows=v.rows.slice(0,MAX_SUBJECT_ROWS).filter(r=>r&&clean(r.name)&&nat(r.minutes)&&nat(r.due)&&nat(r.mistakes));
  const sum=k=>String(rows.reduce((a,r)=>a+r[k],0));
  return [...table(head,[...rows.map(r=>[clean(r.name),String(r.minutes),String(r.due),String(r.mistakes)]),['전체',sum('minutes'),sum('due'),sum('mistakes')]]),'- 복습 예정: 오늘까지 할 것(밀린 것 포함) / 오답: 이번 주 기록 수'];
}
function sectionHealth(s){
  const v=s.healthSummary;
  if(!v||!dateOK(v.from)||!dateOK(v.to)||!nat(v.days))return ['- 기간: UNKNOWN / 기록 일수: UNKNOWN','- 수면 평균: UNKNOWN / 걸음 평균: UNKNOWN'];
  const sleep=nat(v.avgSleepMinutes)?Math.floor(v.avgSleepMinutes/60)+'시간 '+(v.avgSleepMinutes%60)+'분':UNKNOWN,steps=nat(v.avgSteps)?v.avgSteps+'걸음':UNKNOWN;
  return ['- 기간: '+v.from+' ~ '+v.to+' / 기록 일수: '+v.days,'- 수면 평균: '+sleep+' / 걸음 평균: '+steps];
}
export function buildLifeState(snapshot,opts={}){
  const s=snapshot&&typeof snapshot==='object'?snapshot:{},includeLine=opts.includeLine===true;
  const today=dateOK(s.today)?s.today:UNKNOWN,at=typeof s.exportedAt==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s.exportedAt)?s.exportedAt:UNKNOWN;
  const out=['# LIFE_STATE','기준일: '+today+' (KST)','형식: '+STATE_FORMAT+' · 내보낸 기기: '+(clean(s.device)||DEVICE_NAME)+' · 내보낸 시각: '+at,'',
    '## 1. 최근 7일 습관 완료율',...sectionHabits(s),'',
    '## 2. 벽돌(과목별)',...sectionBricks(s),'',
    '## 3. 연속일·배수',...sectionStreak(s),'',
    '## 4. 영역 레벨',...sectionLevels(s),'',
    '## 5. 금고',...sectionVault(s),'',
    '## 6. 가장 가까운 시험',...sectionExams(s),'',
    '## 7. 어제',...sectionYesterday(s,includeLine),''];
  if(opts.includeStudy===true)out.push('## 8. 공부 요약',...sectionStudy(s),'');
  if(opts.includeHealth===true)out.push('## 9. 건강 요약',...sectionHealth(s),'');
  const text=out.join('\n');
  if(new TextEncoder().encode(text).length>STATE_MAX_BYTES){const e=new Error('STATE_TOO_LARGE');e.code='STATE_TOO_LARGE';throw e;}
  return text;
}
export const stateBytes=text=>new TextEncoder().encode(text).length;
// 게이트(B47): 시트에서 보여 주는 포함 절 목록은 보낼 글에서 그대로 뽑는다(글과 어긋날 수 없게).
export const includedSections=text=>text.split('\n').filter(l=>l.startsWith('## ')).map(l=>l.slice(3));
export const GATE_TEXT='이 내용은 사령부 비서가 Claude로 분석합니다(외부 전송)';

// ---- 결과 문구(화면) ----
export const EXPORT_TEXT=Object.freeze({
  ok:'사령부로 내보냈습니다. 이 파일 한 장이 덮어써졌습니다.',
  STATE_DIR_MISSING:'사령부 상태 폴더(AURUMAR_HQ\\state)가 없어 내보내지 못했습니다. 폴더를 먼저 만들어 주세요.',
  STATE_EXPORT_LOCKED:'잠금이 풀린 상태에서만 내보낼 수 있습니다.',
  STATE_TOO_LARGE:'내용이 너무 커서 내보내지 못했습니다.',
  fail:'내보내지 못했습니다. 다시 시도해 주세요.',
  browser:'사령부 내보내기는 PC 앱에서만 쓸 수 있습니다.',
});
export const exportResultText=code=>code==='OK'?EXPORT_TEXT.ok:code==='MD_UNLOCK_REQUIRED'?EXPORT_TEXT.STATE_EXPORT_LOCKED:Object.hasOwn(EXPORT_TEXT,code)&&!['ok','fail','browser'].includes(code)?EXPORT_TEXT[code]:EXPORT_TEXT.fail;

// ---- 자동 내보내기(B54): 쌓기 성공 직후 부른 쪽이 1번 부른다. 같은 builder·같은 send(host의 B47P 경로)를 쓰고 한 줄은 토글과 무관하게 항상 비공개다 ----
// ctx = {surface, storage, views()=>{life,study,fin}, now()=>ISO, send(markdown)=>Promise}. 절대 던지지 않는다.
// 돌려주는 값: {status:'SKIPPED',reason:'SURFACE'|'OFF'} | {status:'OK'} | {status:'FAILED',code,text}. 실패는 쌓기 결과를 바꾸지 않는다(부른 쪽이 문구만 덧붙인다).
export async function exportStateAuto(ctx){
  if(ctx?.surface!=='APP_SHELL')return {status:'SKIPPED',reason:'SURFACE'};
  if(!autoEnabled(ctx.storage))return {status:'SKIPPED',reason:'OFF'};
  try{
    const includeStudy=sectionEnabled('study',ctx.storage),includeHealth=sectionEnabled('health',ctx.storage);   // B61: 소유자가 켠 8·9절만
    const text=buildLifeState(snapshotFromViews({...ctx.views(),now:ctx.now(),includeLine:false,includeStudy,includeHealth}),{includeLine:false,includeStudy,includeHealth});
    await ctx.send(text);
    return {status:'OK'};
  }catch(e){
    const code=typeof e?.code==='string'?e.code:'fail';
    return {status:'FAILED',code,text:exportResultText(code)};
  }
}

// 쌓기 화면이 쌓기 결과(status)마다 1번 부른다. 쌓기 성공(STACK_DONE)일 때만 exportStateAuto를 부르고, 실패하면 st.message 뒤에 문구만 덧붙인다(status·error는 건드리지 않는다).
export async function exportAfterStack(ctx,st,status){
  if(!STACK_DONE.includes(status))return {status:'SKIPPED',reason:'NOT_STACKED'};
  const r=await exportStateAuto(ctx);
  if(r.status==='FAILED'&&st)st.message=(st.message??'')+' · 상태 내보내기 실패: '+r.text;
  return r;
}

// ---- 화면: 설정 안의 카드 하나. 단추 → 미리보기(내보낼 전문 그대로) → "내보내기" 확인 → 쓰기 → 결과 문구 ----
// PC 앱(APP_SHELL)이 아니면 단추 없이 안내 문구만 보인다. h={el,add,button}, kit={toggle,sheet}, views()=>{life,study,fin}, now()=>ISO, send(markdown)=>Promise.
export function renderStateExport(root,ctx){
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel state-export'),h.el('h2','사령부로 상태 내보내기','panel-title'));
  h.add(root,sec);
  if(ctx.surface!=='APP_SHELL'){h.add(sec,h.el('p',EXPORT_TEXT.browser,'muted'));return sec;}
  h.add(sec,h.el('p','숫자 요약 한 장을 사령부 폴더에 덮어씁니다. 이 단추를 누르거나, 아래 자동 내보내기를 켜 두면 "오늘 쌓기"가 끝난 직후에만 보냅니다. 메모·건강 세부·거래 내역·가게 이름은 들어가지 않습니다.','muted'));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('어제 한 줄도 내보내기 (최대 60자 · 이 기기 설정)',lineEnabled(ctx.storage),on=>{setLineEnabled(on,ctx.storage);})));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('쌓을 때 사령부 상태 자동 내보내기 (한 줄은 항상 비공개 · 이 기기 설정)',autoEnabled(ctx.storage),on=>{setAutoEnabled(on,ctx.storage);})));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('공부 요약도 내보내기 (과목별 분·복습·오답 수 · 자동 내보내기에도 포함 · 이 기기 설정)',sectionEnabled('study',ctx.storage),on=>{setSectionEnabled('study',on,ctx.storage);})));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('건강 요약도 내보내기 (수면·걸음 평균·기록 일수 · 자동 내보내기에도 포함 · 이 기기 설정)',sectionEnabled('health',ctx.storage),on=>{setSectionEnabled('health',on,ctx.storage);})));
  const result=h.el('p','','muted');result.setAttribute('role','status');
  let busy=false;
  const show=code=>{result.textContent=exportResultText(code);};
  const preview=()=>{
    let text;
    try{const opts={includeLine:lineEnabled(ctx.storage),includeStudy:sectionEnabled('study',ctx.storage),includeHealth:sectionEnabled('health',ctx.storage)};text=buildLifeState(snapshotFromViews({...ctx.views(),now:ctx.now(),...opts}),opts);}
    catch(e){show(e?.code==='STATE_TOO_LARGE'?'STATE_TOO_LARGE':'fail');return;}
    const gate=h.el('p',GATE_TEXT,'state-export-gate'),sections=h.el('p','포함 절: '+includedSections(text).join(' · '),'muted');
    const note=h.el('p',stateBytes(text)+' 바이트 · 아래 내용 그대로 한 파일로 덮어씁니다.','muted'),pre=h.el('pre',text,'path state-export-text'),msg=h.el('p','','muted');
    msg.setAttribute('role','status');
    let dlg=null;
    const go=h.button('내보내기',async()=>{
      if(busy)return;busy=true;go.disabled=true;
      try{await ctx.send(text);show('OK');msg.textContent=exportResultText('OK');dlg?.close();}
      catch(e){const code=typeof e?.code==='string'?e.code:'fail';show(code);msg.textContent=exportResultText(code);go.disabled=false;}
      finally{busy=false;}
    },'primary');
    const body=h.add(h.el('div',null,'state-export-body'),gate,sections,note,pre,msg,h.add(h.el('div',null,'buttons'),go,h.button('취소',()=>dlg?.close(),'secondary')));
    dlg=kit.sheet('사령부로 내보낼 내용',body);
  };
  h.add(sec,h.add(h.el('div',null,'buttons'),h.button('미리보기 후 내보내기',preview,'primary')),result);
  return sec;
}
