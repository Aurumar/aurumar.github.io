// 사령부 상태 내보내기 (B47'). 이미 화면에 보이는 투영값을 LIFE_STATE.md 한 장의 글(형식 v1, 절 1~7)로 요약한다.
// 이 모듈은 아무것도 쓰지 않고 시계·난수·저장소·네트워크를 쓰지 않는다(이 기기 설정 읽기·쓰기는 부른 쪽이 넘긴 storage로만).
// 기본 제외: 자유 메모·일기 본문·건강 세부·거래 내역·가게 이름·카테고리 세부·계정·기기 식별자·토큰. 7절 "한 줄"은 기본 비공개이고
// 소유자가 같은 화면의 토글을 켠 때만(최대 60자) 어제 카드의 한 줄을 싣는다. 값을 모르면 UNKNOWN(0과 구분).
// 형식 정본: AUTOPILOT\design\STATE_FORMAT_V1.md. 8절(공부 상세)·9절(건강 상세)은 제안이라 아직 내보내지 않는다.
import {lifeDefs,entryDone,nearestExam,dDay,shiftDay,kstDate,hhmmFromIso} from './life-model.mjs';
import {achieve} from './life-achieve.mjs';
import {csatTarget} from './life-plan.mjs';
import {prepare} from './fin-charts.mjs';
import {budgetStatus} from './fin-plan.mjs';

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

function habitWindow(life,today){
  if(!life)return null;
  const defs=lifeDefs(life),dates=Array.from({length:WINDOW_DAYS},(_,i)=>shiftDay(today,i-(WINDOW_DAYS-1)));
  const cards=new Map(life.days.filter(d=>dates.includes(d.date)).map(d=>[d.date,d.data]));
  const rows=[];
  for(const h of defs.habits.filter(x=>!x.hidden).slice(0,MAX_HABIT_ROWS)){
    const entries=dates.map(d=>{const c=cards.get(d);return c&&Object.hasOwn(c.habits,h.id)?c.habits[h.id]:null;});
    let goal,done;
    if(h.kind==='RECOVERY'){goal=1;done=Math.min(1,entries.filter(e=>entryDone(h,e)).length);}                       // 복구는 주 1번이 목표(연속을 이어 주는 습관)
    else if(h.target.per==='WEEK'){goal=h.target.count??1;const sum=entries.reduce((s,e)=>s+(entryDone(h,e)?(h.kind==='COUNT'?e.count??0:1):0),0);done=Math.min(goal,sum);}
    else{goal=WINDOW_DAYS;done=entries.filter(e=>entryDone(h,e)).length;}
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
function vaultInfo(fin,today){
  if(!fin)return null;
  const s=budgetStatus(prepare(fin),fin.budgets,today.slice(0,7),today),T=s.total;
  if(!T)return null;
  const known=s.dataState==='KNOWN';
  return {budget:T.budget.toString(),spent:known?s.actualTotal.toString():null,projected:known&&T.projected!==null?T.projected.toString():null,fast:known&&T.status==='FAST'};
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
// views = {life,study,fin}(wholeLifeView의 같은 이름 항목, 없으면 null). now = ISO 시각 문자열. includeLine = 소유자가 켠 토글.
export function snapshotFromViews({life=null,study=null,fin=null,now,includeLine=false,deviceName=DEVICE_NAME}){
  const today=kstDate(now);
  // 지난 일요일 기준 계산을 먼저 하고 오늘 기준 계산을 마지막에 해, achieve의 마지막 결과 보관이 오늘 값으로 남게 한다(화면 계산을 다시 하지 않게).
  const before=life?guard(()=>achieve({life,study,today:lastSunday(today)})):null;
  const ach=life?guard(()=>achieve({life,study,today})):null;
  return {today,exportedAt:today+' '+hhmmFromIso(now),device:clean(deviceName),
    habits:guard(()=>habitWindow(life,today)),
    bricks:ach?guard(()=>brickWeeks(ach,study)):null,
    streak:ach?guard(()=>streakInfo(ach)):null,
    levels:ach&&before?guard(()=>levelInfo(ach,before)):null,
    vault:guard(()=>vaultInfo(fin,today)),
    exams:guard(()=>examInfo(life,today)),
    yesterday:guard(()=>yesterdayInfo(life,today,includeLine))};
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
  if(!moneyOK(v.projected))return [line1,'- 이대로면 월말: UNKNOWN'];
  const projected=BigInt(v.projected),status=spent>budget?'초과 중':projected>budget||v.fast===true?'빠듯':'여유';
  return [line1,'- 이대로면 월말: 남은 돈 '+(budget-projected)+'원 (상태: '+status+')'];
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
  const text=out.join('\n');
  if(new TextEncoder().encode(text).length>STATE_MAX_BYTES){const e=new Error('STATE_TOO_LARGE');e.code='STATE_TOO_LARGE';throw e;}
  return text;
}
export const stateBytes=text=>new TextEncoder().encode(text).length;

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

// ---- 화면: 설정 안의 카드 하나. 단추 → 미리보기(내보낼 전문 그대로) → "내보내기" 확인 → 쓰기 → 결과 문구 ----
// PC 앱(APP_SHELL)이 아니면 단추 없이 안내 문구만 보인다. h={el,add,button}, kit={toggle,sheet}, views()=>{life,study,fin}, now()=>ISO, send(markdown)=>Promise.
export function renderStateExport(root,ctx){
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel state-export'),h.el('h2','사령부로 상태 내보내기','panel-title'));
  h.add(root,sec);
  if(ctx.surface!=='APP_SHELL'){h.add(sec,h.el('p',EXPORT_TEXT.browser,'muted'));return sec;}
  h.add(sec,h.el('p','숫자 요약 한 장을 사령부 폴더(AURUMAR_HQ\\state)에 덮어씁니다. 이 단추를 누를 때만 보내고 자동으로는 보내지 않습니다. 메모·건강 세부·거래 내역·가게 이름은 들어가지 않습니다.','muted'));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('어제 한 줄도 내보내기 (최대 60자 · 이 기기 설정)',lineEnabled(ctx.storage),on=>{setLineEnabled(on,ctx.storage);})));
  const result=h.el('p','','muted');result.setAttribute('role','status');
  let busy=false;
  const show=code=>{result.textContent=exportResultText(code);};
  const preview=()=>{
    let text;
    try{const includeLine=lineEnabled(ctx.storage);text=buildLifeState(snapshotFromViews({...ctx.views(),now:ctx.now(),includeLine}),{includeLine});}
    catch(e){show(e?.code==='STATE_TOO_LARGE'?'STATE_TOO_LARGE':'fail');return;}
    const note=h.el('p',stateBytes(text)+' 바이트 · 아래 내용 그대로 한 파일로 덮어씁니다.','muted'),pre=h.el('pre',text,'path state-export-text'),msg=h.el('p','','muted');
    msg.setAttribute('role','status');
    let dlg=null;
    const go=h.button('내보내기',async()=>{
      if(busy)return;busy=true;go.disabled=true;
      try{await ctx.send(text);show('OK');msg.textContent=exportResultText('OK');dlg?.close();}
      catch(e){const code=typeof e?.code==='string'?e.code:'fail';show(code);msg.textContent=exportResultText(code);go.disabled=false;}
      finally{busy=false;}
    },'primary');
    const body=h.add(h.el('div',null,'state-export-body'),note,pre,msg,h.add(h.el('div',null,'buttons'),go,h.button('취소',()=>dlg?.close(),'secondary')));
    dlg=kit.sheet('사령부로 내보낼 내용',body);
  };
  h.add(sec,h.add(h.el('div',null,'buttons'),h.button('미리보기 후 내보내기',preview,'primary')),result);
  return sec;
}
