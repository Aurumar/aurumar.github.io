// 돈 진단 카드 (M1A, 설계 M1D §1.1~1.2): 돈 탭 맨 위 한 문장. 모든 숫자는 "고정비 예정을 뺀 뒤 쓸 수 있는 돈" 하나에서 나온다.
// 규칙: 금액은 BigInt, 모름은 0이 아니다. 저장·시계·난수·저장소·innerHTML 없음. 통신은 없고 비서 목록 읽기(M1C)는 부른 쪽이 넘긴 request로만 한다. 화면 요소는 부른 쪽이 넘긴 h로만 만든다.
// 결과와 문구에는 분류 이름과 합계만 넣는다(가게 이름·규칙 이름 없음). 의료·민감 줄은 가리기 설정과 상관없이 원인 후보에서 뺀다.
// "무엇을 할지" 정하는 문장은 이 카드에만 쓴다(2026-11-06 지시서의 명시 요구). fin-forecast.mjs·fin-plan.mjs의 옛 원칙과 옛 함수는 그대로다.
import {formatWon,isSensitive,shiftMonth} from './fin-ledger.mjs';
import {prepare,roundDiv} from './fin-charts.mjs';
import {budgetStatus,monthInsight} from './fin-plan.mjs';
import {fixedPlan,fixedSchedule,monthForecast,TIGHT_PCT} from './fin-forecast.mjs';
import {recurringKey} from './fin-recurring.mjs';
import {analysisCards} from './fin-analysis.mjs';

export const FEEL_LEVEL=Object.freeze({DANGER:'위험',CAUTION:'주의',ROOM:'여유'});
export const DANGER_PCT=70n,AVG_MONTHS=3,ACTION_DAYS=7,MIN_COUNT_LINES=3;
const CONSUMPTION=new Set(['EXPENSE','REFUND']);
const pad=n=>String(n).padStart(2,'0');
const daysOf=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).getUTCDate();
const ceilDiv=(a,b)=>(a+b-1n)/b;

// f = monthForecast() 결과(다시 집계하지 않는다). A = 지금 실제로 쓸 수 있는 돈, safe = 내일부터 하루 몫, plan = 평소 하루 몫. 예산이 없거나 자료가 없으면 null.
export function feelCore(f){
  if(f?.state!=='OK')return null;
  const fx=f.fixed,due=fx.upcoming+fx.overdue,A=f.budget-f.spent-due,dl=f.daysLeft;
  const rest=f.budget-(fx.paid+due);
  return {due,dueCount:fx.upcomingCount+fx.overdueCount,A,dl,safe:dl>0&&A>0n?A/BigInt(dl):0n,plan:rest>0n?rest/BigInt(f.days):0n};
}
// 금고 안 "오늘 쓸 수 있는 돈" 칩. budgetStatus의 perDayLeft는 고치지 않고 표시만 카드와 같은 값으로 맞춘다.
export function feelChip(f,{known,current}){
  if(!current)return {value:'-',foot:'이번 달이 아님'};
  if(!known)return {value:'-',foot:'쓴 돈을 모름'};
  const c=feelCore(f);
  if(!c||c.A<=0n)return {value:'-',foot:'고정비 예정 빼면 남은 돈 없음'};
  if(c.dl>0&&c.safe===0n)return {value:'-',foot:'고정비 예정 빼면 남은 돈 '+formatWon(c.A)+' · 하루 1원도 안 됨'};   // FIX36 (H36-M4)
  return c.dl>0?{value:formatWon(c.safe),foot:'고정비 예정 뺌 · 내일부터 하루 몫'}:{value:formatWon(c.A),foot:'고정비 예정 뺌 · 오늘이 마지막 날'};
}

// 최근 달의 변동 지출 평균. 소비 줄이 있고 순액을 모두 아는 달만 넣고 자료 없는 달은 건너뛴다(null≠0). 0달이면 null.
// FIX36 (H36-M3): 순액 모름 줄이 하나라도 있는 달은 줄만 빼지 않고 달째 뺀다(모름을 0으로 쳐서 평균이 낮아지지 않게). 뺀 달이 있으면 unknownMonths에 수를 적고 카드가 표시한다.
export function recentAverage(prep,rules,month,n=AVG_MONTHS){
  let sum=0n,days=0,months=0,unknownMonths=0;
  for(let k=1;k<=n;k++){
    const m=shiftMonth(month,-k),mine=prep.lines.filter(l=>l.month===m&&CONSUMPTION.has(l.kind));
    if(!mine.length)continue;
    if(mine.some(l=>l.net===null)){unknownMonths++;continue;}
    const d=daysOf(m),v=mine.reduce((a,l)=>a+l.net,0n)-fixedPlan(rules,prep.lines,m+'-'+pad(d),d).paid;
    sum+=v>0n?v:0n;days+=d;months++;
  }
  return months?{perDay:roundDiv(sum,BigInt(days)),perMonth:roundDiv(sum,BigInt(months)),months,...(unknownMonths?{unknownMonths}:{})}:null;
}

const catName=(prep,c)=>{
  if(c===null||c===undefined)return '분류 없음';
  for(const list of [prep.labels?.expense,prep.labels?.income])if(list&&Object.hasOwn(list,c))return list[c];
  return c;
};
// 이번 달 분류 묶음(가게·규칙 이름 없이 합계와 건수만). 소분류가 그 분류 합계의 절반 이상이면 그 이름과 그 줄들로 말한다.
function groupOf(prep,lines,month,category){
  const mine=lines.filter(l=>l.month===month&&CONSUMPTION.has(l.kind)&&l.net!==null&&l.category===category);
  const net=mine.reduce((a,l)=>a+l.net,0n),subs=new Map();
  for(const l of mine)if(l.subcategory)subs.set(l.subcategory,(subs.get(l.subcategory)??0n)+l.net);
  let sub=null,subNet=0n;
  for(const [k,v] of subs)if(v>subNet){sub=k;subNet=v;}
  const dominant=sub!==null&&subNet*2n>=net&&net>0n,name=catName(prep,category);
  return {category,name,sub:dominant?sub:null,label:dominant?sub:name,net,target:dominant?subNet:net,count:dominant?mine.filter(l=>l.subcategory===sub).length:mine.length};
}
function biggestCategory(lines,month){
  const totals=new Map();
  for(const l of lines)if(l.month===month&&CONSUMPTION.has(l.kind)&&l.net!==null)totals.set(l.category,(totals.get(l.category)??0n)+l.net);
  let best=null,bestNet=0n;
  for(const [c,v] of totals)if(v>bestNet){best=c;bestNet=v;}
  return bestNet>0n?{category:best}:null;
}
// 가장 큰 원인. 정기 결제 규칙의 가게(결제일이 밀려 "급증"으로 잡히지 않게)와 민감 줄을 뺀 줄로 "같은 날짜까지" 비교한다.
export function moneyCause(prep,s,rules,core){
  const fixedKeys=new Set((Array.isArray(rules)?rules:[]).filter(r=>!r.hidden).map(r=>r.match.merchant));
  const lines=prep.lines.filter(l=>!isSensitive(l)&&!fixedKeys.has(recurringKey(l.merchant))),kept={...prep,lines};
  let ins=monthInsight(kept,s,null,{months:1}),last=true;
  if(!ins.comparedMonths.length){ins=monthInsight(kept,s,null,{months:AVG_MONTHS});last=false;}
  const big=biggestCategory(lines,s.month),rising=ins.risingCategories[0]??null,fresh=ins.newCategories[0]??null;
  // FIX37C (H37-M5): 비교 달에 없던 분류도 늘어난 분류다. 늘어난 금액이 가장 큰 쪽을 원인으로 말한다.
  const isNew=fresh!==null&&(rising===null||fresh.pace>rising.delta),top=isNew?fresh:rising;
  const pick=top??big,group=pick?groupOf(prep,lines,s.month,pick.category):null;
  if(isNew)return {kind:'NEW',group,lastMonth:last,comparedMonths:ins.comparedMonths.length};
  if(top)return {kind:'RISING',group,permille:top.permille,lastMonth:last,comparedMonths:ins.comparedMonths.length};
  if(!ins.comparedMonths.length)return {kind:'NO_PRIOR',group};
  return {kind:'NOT_RISING',group,dueCount:core?.dueCount??0,due:core?.due??0n};
}
const causeSentence=c=>{
  if(!c)return null;
  const g=c.group,named=g?g.name+(g.sub?'('+g.sub+')':'')+' '+formatWon(g.net):null;
  if(c.kind==='RISING')return '가장 큰 원인: '+named+' ('+(c.lastMonth?'지난달 같은 날까지보다':'최근 '+c.comparedMonths+'개월 같은 날까지 평균보다')+' +'+roundDiv(c.permille,10n)+'%)';
  if(c.kind==='NEW')return '가장 큰 원인: '+named+' ('+(c.lastMonth?'지난달 같은 날까지 없던 지출':'최근 '+c.comparedMonths+'개월 같은 날까지 없던 지출')+')';
  if(c.kind==='NO_PRIOR')return g?'비교할 지난달 없음 · 가장 큰 지출: '+named:'비교할 지난달 없음';
  return c.dueCount?'늘어난 분류 없음 · 아직 안 나간 고정비 '+c.dueCount+'건 '+formatWon(c.due)+'이 큼':'늘어난 분류 없음';
};

// 단계: 위에서부터 먼저 걸리는 것. 말일은 하루 몫 비율을 쓰지 않는다. left가 null(첫 주 + 이력 없음)이면 월말 조건은 보지 않는다.
export function feelLevel(core,left,budget){
  const {A,dl,safe,plan}=core,tight=left!==null&&left*100n<=budget*TIGHT_PCT;
  if(dl===0)return A<0n?'DANGER':tight?'CAUTION':'ROOM';
  if(safe===0n||(plan>0n&&safe*100n<plan*DANGER_PCT))return 'DANGER';   // FIX36 (H36-M4): safe=0 = A≤0 또는 0<A<남은 날(하루 1원도 안 됨)
  if((left!==null&&left<0n)||(plan>0n&&safe<plan)||tight)return 'CAUTION';
  return 'ROOM';
}
// 행동 1개. 횟수 = (하루 몫 × 창 × 그 분류의 이번 달 변동 지출 비중) ÷ 1회 평균(내림). 그 분류 줄이 적으면 횟수 대신 금액으로 말한다.
export function feelAction(level,core,variable,group){
  const {A,dl,safe}=core,perDay=formatWon(safe);
  if(A<=0n||(dl>0&&safe===0n))return {text:'금고 계산기로 이번 달 예산 다시 보기',calc:true};
  if(dl===0)return null;
  if(level==='ROOM')return {text:'내일부터 하루 '+perDay+'까지 괜찮음'};
  const span=Math.min(ACTION_DAYS,dl),scope=span<ACTION_DAYS?'앞으로 '+span+'일':'이번 주';
  if(!group||group.target<=0n||variable<=0n)return {text:'남은 날 하루 '+perDay+' 안에서'};
  const pool=safe*BigInt(span),part=group.target>=variable?pool:pool*group.target/variable;
  if(group.count<MIN_COUNT_LINES)return {text:scope+' '+group.label+' '+formatWon(part)+'까지'};
  const n=part*BigInt(group.count)/group.target;
  return {text:n===0n?scope+' '+group.label+' 쉬기':scope+' '+group.label+' '+n+'회까지'};
}

// 아직 안 나간 고정비를 날짜와 금액만으로(규칙·가게 이름 없음). 합은 f.fixed.upcoming+overdue와 같다(같은 fixedSchedule). day=null이면 예정일 모름.
function dueSteps(rules,lines,f){
  const out=[];
  for(const it of fixedSchedule(rules,lines,f.month+'-'+pad(f.elapsed),f.days))
    if(it.state==='PLANNED'||it.state==='OVERDUE')out.push({day:it.due===null?null:Number(it.due.slice(8,10)),won:it.provisional});
  return out;
}
// {prep,status,forecast,rules} → 카드에 필요한 값 전부. 저장 0.
export function moneyFeel({prep,status:s,forecast:f,rules=[]}){
  const base={state:f.state,month:f.month,elapsed:f.elapsed,unknownRows:f.unknownRows,level:null,basis:null,left:null,short:null,cut:null,avg:null,cause:null,action:null,projected:f.projectedNet??f.projected};   // FIX37C (H37-M1): 환불을 뺀 값
  if(f.state==='NOT_CURRENT')return base;
  if(f.state==='NO_DATA'||f.state==='UNKNOWN_ONLY')return {...base,avg:recentAverage(prep,rules,f.month)};
  const steps=dueSteps(rules,prep.lines,f);
  if(f.state==='NO_BUDGET')return {...base,steps};
  const core=feelCore(f),{A,dl}=core,avg=f.early?recentAverage(prep,rules,f.month):null;
  const basis=!f.early?'PACE':avg?'AVERAGE':'NONE',left=basis==='PACE'?f.left:basis==='AVERAGE'?A-avg.perDay*BigInt(dl):null;
  const short=left!==null&&left<0n?-left:null,level=feelLevel(core,left,f.budget);
  const cause=moneyCause(prep,s,rules,core);
  return {...base,...core,budget:f.budget,basis,left,avg,short,level,cause,steps,
    cut:short!==null&&dl>0&&A>0n?ceilDiv(short,BigInt(dl)):null,
    action:feelAction(level,core,f.variable,cause?.group??null)};
}

// 문장은 굵게 보일 숫자와 나머지로 나눈 조각 목록이다: {b:true,t} 또는 {t}. 화면도 시험도 이 조각만 읽는다.
const t=x=>({t:x}),b=x=>({b:true,t:x});
const leftWords=left=>left<0n?formatWon(-left)+' 모자람':formatWon(left)+' 남음';
function mainParts(x){
  if(x.state==='NO_BUDGET')return [t('이대로면 이번 달 지출 '),b(formatWon(x.projected)),t(' · 예산을 정하면 모자람도 계산함')];
  if(x.state==='NO_DATA'||x.state==='UNKNOWN_ONLY'){
    const head=x.state==='NO_DATA'?'이번 달 소비 자료 없음 (0원 아님)':'이번 달 순액 모름 줄만 있음 (0원 아님)';
    return x.avg?[t(head+' · 최근 '+x.avg.months+'개월 평균 한 달 '),b(formatWon(x.avg.perMonth))]:[t(head)];
  }
  if(x.dl===0)return [t('오늘이 마지막 날 · 이번 달 '),b(leftWords(x.A))];
  if(x.A<0n)return [t('고정비까지 내면 이미 '),b(formatWon(-x.A)+' 모자람'),t(' · 남은 날 0원을 써도 채워지지 않음')];
  if(x.A===0n)return [t('고정비까지 내면 '),b('남는 돈 0원'),t(' · 남은 날 쓸 돈이 없음')];
  if(x.safe===0n)return [t('고정비까지 내면 '),b('남는 돈 '+formatWon(x.A)),t(' · 남은 '+x.dl+'일 동안 하루 1원도 안 됨')];   // FIX36 (H36-M4): 0<A<남은 날. "하루 0원까지 괜찮음"이라 말하지 않는다
  if(x.basis==='NONE')return [t('아직 기록이 '+x.elapsed+'일치라 월말을 단정하지 않음 · 내일부터 하루 '),b(formatWon(x.safe)),t(' 안이면 예산에 맞음')];
  const head=x.basis==='AVERAGE'?'최근 '+x.avg.months+'개월 평균대로면 월말에 ':'이대로 쓰면 월말에 ';
  if(x.short!==null)return [t(head),b(leftWords(x.left)),t(' · 내일부터 하루 '),b(formatWon(x.cut)),t('씩 줄여야 함')];
  // FIX37C (H37-M6): 위험 단계에서 "괜찮음"이라 말하지 않는다. 하루 몫이 평소보다 크게 줄었다는 단계의 근거를 그대로 말한다.
  if(x.level==='DANGER')return [t(head),b(leftWords(x.left)),t(' · 그래도 내일부터 하루 '),b(formatWon(x.safe)),t('뿐이라 평소 몫보다 크게 적음')];
  return [t(head),b(leftWords(x.left)),t(' · 내일부터 하루 '),b(formatWon(x.safe)),t('까지 괜찮음')];
}
export function feelText(x){
  if(!x||x.state==='NOT_CURRENT')return null;
  const parts=mainParts(x),main=parts.map(p=>p.t).join('');
  return {parts,main,cause:x.level&&x.level!=='ROOM'?causeSentence(x.cause):null,
    action:x.action&&!main.includes(x.action.text)?x.action:null,
    notes:[...(x.unknownRows?['순액 모름 '+x.unknownRows+'행은 넣지 않음']:[]),...(x.avg?.unknownMonths?['순액 모름 줄이 있는 '+x.avg.unknownMonths+'개월은 최근 평균에서 뺌']:[])]};
}
// FIX37C (H37-M2): 금고 색과 예산 탭 "월말 예상"은 진단 카드와 같은 기준이다. 단계가 없으면(예산이 카드까지 못 감) 예전 속도 판정을 쓴다. T = budgetStatus().total.
export function feelTone(x,T){
  if(T.remaining<0n||(x?.level&&x.A<0n))return 'over';
  if(x?.level)return x.level==='ROOM'?'ok':'fast';
  return T.status==='FAST'?'fast':'ok';
}
// 월말에 쓴 돈 = 예산 − 카드의 left. 카드가 단정하지 않으면(첫 주 + 이력 없음) null이다.
export const feelProjected=(x,T)=>x?.level?(x.left===null?null:T.budget-x.left):T.projected;
// 탑 탭 돈 시트의 한 줄(단계 + 행동). 단계가 없으면 null.
export function feelLine(x){
  if(!x?.level)return null;
  return FEEL_LEVEL[x.level]+(x.action?' · '+x.action.text:'');
}
// 저장 직전 값(메모리)과 지금 값. 같은 날(남은 날 수가 같음)이고 둘 다 계산됐고 달라졌을 때만. 말일에는 "내일부터"가 없으므로 null.
export function feelChange(before,x){
  if(!before||!x?.level||!x.dl||before.dl!==x.dl||before.safe===x.safe)return null;
  return {from:before.safe,to:x.safe};
}
// 저장 직후 줄의 "하루 몫" 조각과 이번 지출이 그 몫보다 큰지. 칩·카드와 같은 기준(고정비 예정 뺌, 내일부터 하루 몫). core가 없으면(자료 없음·모름·예산 없음) 금액을 말하지 않는다.
export function feelSavedPart(core,won){
  if(!core)return {text:'하루 몫 모름',fast:false};
  if(core.A<=0n)return {text:'고정비 예정 빼면 남은 돈 없음',fast:true};
  if(core.dl>0&&core.safe===0n)return {text:'고정비 예정 빼면 남은 돈 '+formatWon(core.A)+' · 하루 1원도 안 됨',fast:true};   // FIX36 (H36-M4)
  const day=core.dl>0?core.safe:core.A;
  return {text:(core.dl>0?'내일부터 하루 ':'고정비 예정 빼면 이번 달 ')+formatWon(day)+(core.dl>0?' (고정비 예정 뺌)':''),fast:won>day};
}

// ---------- 월말 예측선 (M1B) ----------
// 순수 좌표 계산. 예산 가로선, 1일~오늘 누적 실선, 오늘~말일 점선(일평균 + 예정일에 고정비 계단, 예정일을 모르면 말일에 계단), 오늘 세로 표시, 끝점 금액.
// 끝점 = 예산 − 카드의 left(예산 없음이면 f.projected)라서 선과 카드 문장이 어긋나지 않는다. basis가 NONE(첫 주 + 이력 없음)이면 카드처럼 월말을 단정하지 않고 점선·끝점이 없다. 자료 없음·모름이면 null.
const r1=v=>Math.round(v*10)/10;
export function feelLineLayout(prep,f,x,{width=320,height=132}={}){
  if(f?.state!=='OK'&&f?.state!=='NO_BUDGET')return null;
  const {days,elapsed,spent}=f,dl=days-elapsed,budget=f.budget,byDay=new Map();
  for(const l of prep.lines){
    if(l.month!==f.month||!CONSUMPTION.has(l.kind)||l.net===null)continue;
    const d=Math.min(Number(l.date.slice(8,10)),elapsed);   // 오늘 뒤 날짜로 적은 줄도 쓴 돈(f.spent)에 들어 있으므로 오늘에 더한다
    byDay.set(d,(byDay.get(d)??0n)+l.net);
  }
  const actual=[{day:0,won:0n}];
  let cum=0n;
  for(let d=1;d<=elapsed;d++){cum+=byDay.get(d)??0n;actual.push({day:d,won:cum});}
  const end=f.state==='NO_BUDGET'?f.projectedNet??f.projected:x?.left===null||x?.left===undefined?null:budget-x.left;
  let forecast=null;
  if(end!==null){
    const steps=x?.steps??[],at=new Map();
    let due=0n;
    for(const s of steps){const d=s.day===null?days:Math.max(s.day,elapsed);at.set(d,(at.get(d)??0n)+s.won);due+=s.won;}
    const rest=end-spent-due,base=d=>dl>0?spent+roundDiv(rest*BigInt(d-elapsed),BigInt(dl)):spent+rest;
    forecast=[{day:elapsed,won:spent}];
    let acc=0n;
    for(const d of [...at.keys()].sort((a,b)=>a-b)){
      if(d>elapsed||base(d)+acc!==spent)forecast.push({day:d,won:base(d)+acc});
      acc+=at.get(d);forecast.push({day:d,won:base(d)+acc});
    }
    if(forecast.at(-1).day<days||forecast.at(-1).won!==end)forecast.push({day:days,won:end});
    if(forecast.length<2)forecast=null;
  }
  const wons=[...actual,...(forecast??[])].map(p=>p.won);
  if(budget!==null)wons.push(budget);
  let hi=1n,lo=0n;
  for(const v of wons){if(v>hi)hi=v;if(v<lo)lo=v;}
  const padL=4,padR=4,padT=20,padB=18,plotW=width-padL-padR,plotH=height-padT-padB,span=Number(hi-lo);
  const X=d=>r1(padL+plotW*d/days),Y=v=>r1(padT+plotH*(1-Number(v-lo)/span)),pathOf=ps=>ps.map((p,i)=>(i?'L':'M')+X(p.day)+' '+Y(p.won)).join(' ');
  const todayX=X(elapsed),labels=[{x:todayX,anchor:elapsed*2>days?'end':'start',text:'오늘 '+elapsed+'일',cls:'today'}];
  if(todayX-padL>48)labels.push({x:padL,anchor:'start',text:'1일',cls:'day'});
  if(width-padR-todayX>48)labels.push({x:width-padR,anchor:'end',text:days+'일',cls:'day'});
  const lastY=end===null?null:Y(end),over=end!==null&&budget!==null&&end>budget;
  return {width,height,budget:budget===null?null:{y:Y(budget),x1:padL,x2:width-padR,text:'예산 '+formatWon(budget)},
    actual:pathOf(actual),actualPoints:actual,forecast:forecast?pathOf(forecast):null,forecastPoints:forecast,
    today:{x:todayX,y1:padT-4,y2:height-padB},labels,labelY:height-5,
    end:end===null?null:{x:X(days),y:lastY,won:end,text:'월말 '+formatWon(end),textX:width-padR,textY:Math.max(12,lastY-6)},
    over,undated:(x?.steps??[]).some(s=>s.day===null),
    label:'이번 달 누적 지출 '+formatWon(spent)+(budget===null?'':' · 예산 '+formatWon(budget))+(end===null?' · 월말은 아직 단정하지 않음':' · 월말 예상 '+formatWon(end)+(over?' · 예산 초과':''))};
}
// h={el,add,svgEl,svgRoot}. draw면 CSS로 선을 그리는 효과를 켠다(좌표는 draw와 상관없이 같다). 움직임 줄이기면 CSS가 효과를 끄고 다 그려진 모양을 보인다.
export function feelLineNode(h,L,{draw=false}={}){
  if(!L)return null;
  const svg=h.svgRoot(L.width,L.height,L.label);
  if(L.budget){
    svg.append(h.svgEl('line',{x1:L.budget.x1,y1:L.budget.y,x2:L.budget.x2,y2:L.budget.y},'feel-line-budget'));
    const t=h.svgEl('text',{x:L.budget.x1,y:Math.max(11,L.budget.y-4)},'feel-line-budget-text');t.textContent=L.budget.text;svg.append(t);
  }
  svg.append(h.svgEl('line',{x1:L.today.x,y1:L.today.y1,x2:L.today.x,y2:L.today.y2},'feel-line-today'));
  svg.append(h.svgEl('path',{d:L.actual,pathLength:1},'feel-line-actual'));
  if(L.forecast)svg.append(h.svgEl('path',{d:L.forecast},'feel-line-forecast'));
  if(L.end){
    svg.append(h.svgEl('circle',{cx:L.end.x,cy:L.end.y,r:3},'feel-line-end'));
    const t=h.svgEl('text',{x:L.end.textX,y:L.end.textY,'text-anchor':'end'},'feel-line-end-text');t.textContent=L.end.text;svg.append(t);
  }
  for(const l of L.labels){const t=h.svgEl('text',{x:l.x,y:L.labelY,'text-anchor':l.anchor},'feel-line-label '+l.cls);t.textContent=l.text;svg.append(t);}
  const note='실선은 쓴 돈'+(L.forecast?' · 점선은 예상(고정비는 예정일에 계단'+(L.undated?', 예정일 모르면 말일':'')+')':'')+(L.budget?' · 가로선은 예산':'');
  const box=h.add(h.el('div',null,'feel-line'+(draw?' draw':'')),svg,h.el('p',note,'muted small'));
  box.setAttribute('data-over',L.over?'1':'0');
  return box;
}

// h={el,add,button}. onCalc = 금고 계산기 열기. change = feelChange() 결과, fresh면 새 값이 CSS로 나타난다. 그릴 것이 없으면 null.
export function feelNode(h,x,{onCalc=null,change=null,fresh=false}={}){
  const words=feelText(x);
  if(!words)return null;
  const main=h.el('p',null,'feel-main');
  for(const p of words.parts)h.add(main,h.el(p.b?'strong':'span',p.t));
  const n=h.add(h.el('section',null,'panel feel-card'),
    h.add(h.el('div',null,'feel-head'),h.el('h2','이번 달 돈 진단','panel-title'),x.level?h.el('span',FEEL_LEVEL[x.level],'feel-level'):null),
    main,change?h.add(h.el('p',null,'feel-change'),h.el('span','내일부터 하루 '+formatWon(change.from)+' → '),h.el('strong',formatWon(change.to),'feel-change-new'+(fresh?' fresh':''))):null,
    words.cause?h.el('p',words.cause,'feel-cause'):null);
  if(words.action)h.add(n,words.action.calc&&onCalc?h.add(h.el('div',null,'button-row'),h.button(words.action.text,onCalc,'secondary')):h.el('p',words.action.text,'feel-action'));
  for(const note of words.notes)h.add(n,h.el('p',note,'muted small'));
  n.setAttribute('role','status');n.setAttribute('data-level',x.level??'NONE');
  return n;
}
// 옛 "이대로면 월말" 칸(forecastNode)은 지우지 않고 접어 둔다.
export function feelDetails(h,node){
  return node?h.add(h.el('details',null,'feel-forecast'),h.el('summary','이번 달 속도로 계산한 값 보기'),node):null;
}

// ---------- 비서 연결 (M1C, 설계 §1.4) ----------
// 가계부 투영에서 카드 값까지. 돈 탭 카드(app.mjs vaultState·feelOf)와 같은 입력으로 같은 계산을 부른다. 내보내기는 이 값만 받는다.
export function feelOfFin(fin,today){
  const prep=prepare(fin),rules=fin.recurring?.data.rules??[],status=budgetStatus(prep,fin.budgets,today.slice(0,7),today);
  return {status,feel:moneyFeel({prep,status,forecast:monthForecast({status,lines:prep.lines,rules,today}),rules})};
}
// 내보내기용 진단: 단계·비율·날짜만 뽑는다. 금액·분류·가게·규칙 이름은 결과에 없다. 단계가 없으면(예산 없음·자료 없음·모름) null이고 줄도 없다.
const MAX_PCT=999n;
const capPct=v=>Number(v>MAX_PCT?MAX_PCT:v);
const sharePct=(a,b)=>{const v=roundDiv(a*100n,b);return capPct(v===0n&&a>0n?1n:v);};   // 있는 금액을 0%로 말하지 않는다
export function feelExport(x){
  if(!x?.level)return null;
  const kind=x.dl===0?'LAST':x.A<0n?'BEHIND':x.A===0n?'ZERO':x.basis==='NONE'?'UNSURE':x.basis;
  const rest=kind==='LAST'||kind==='BEHIND'?x.A:kind==='PACE'||kind==='AVERAGE'?x.left:null,short=rest!==null&&rest<0n;
  return {level:x.level,kind,date:x.month+'-'+pad(x.elapsed),short,
    monthPct:rest!==null&&x.budget>0n?sharePct(short?-rest:rest,x.budget):null,
    dayPct:x.dl>0&&x.A>0n&&x.plan>0n?capPct(x.safe*100n/x.plan):null,   // 내림: 단계 경계(70%·100%)와 어긋나지 않는다
    avgMonths:kind==='AVERAGE'?x.avg.months:null,recordedDays:kind==='UNSURE'?x.elapsed:null,
    ...(x.budget===0n?{zeroBudget:true}:{}),...(x.unknownRows?{unknownRows:x.unknownRows}:{})};   // FIX37C (H37-M7·M3)
}
// 내보내기 글 한 문장. 정해진 문구와 검사한 숫자로만 만들므로 스냅샷에 다른 글이 섞여 있어도 나가지 않는다. 형식이 어긋나면 null.
const countOK=v=>Number.isSafeInteger(v)&&v>=0;
const pctWords=v=>(BigInt(v)>=MAX_PCT?MAX_PCT+'% 이상':v+'%');
export function feelExportText(e){
  if(!e||!Object.hasOwn(FEEL_LEVEL,e.level)||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date))return null;
  // FIX37C (H37-M7): 예산 0원은 비율을 말할 수 없어도 단계가 있으면 줄을 넣는다.
  const month=countOK(e.monthPct)?'예산의 '+pctWords(e.monthPct)+(e.short===true?' 모자람':' 남음'):e.zeroBudget===true?(e.short===true?'예산 0원을 넘음':'예산 0원 안'):null,parts=[FEEL_LEVEL[e.level]];
  if(e.kind==='LAST'&&month)parts.push('오늘이 마지막 날','이번 달 '+month);
  else if(e.kind==='BEHIND'&&month)parts.push('고정비까지 내면 이미 '+month,'남은 날 쓰지 않아도 채워지지 않음');
  else if(e.kind==='ZERO')parts.push('고정비까지 내면 남는 돈 없음');
  else if(e.kind==='UNSURE'&&countOK(e.recordedDays))parts.push('아직 기록이 '+e.recordedDays+'일치라 월말을 단정하지 않음');
  else if(e.kind==='PACE'&&month)parts.push('이대로 쓰면 월말에 '+month);
  else if(e.kind==='AVERAGE'&&month&&countOK(e.avgMonths))parts.push('최근 '+e.avgMonths+'개월 평균대로면 월말에 '+month);
  else return null;
  if(countOK(e.dayPct))parts.push('내일부터 하루 몫은 평소의 '+pctWords(e.dayPct));
  parts.push('기준일 '+e.date);
  if(countOK(e.unknownRows)&&e.unknownRows>0)parts.push('순액 모름 '+e.unknownRows+'행');   // FIX37C (H37-M3): 모름 ≠ 0. 새 줄 없이 문장 끝에
  return parts.join(' · ');
}
// 비서 결과 고르기: 소비 분석 우선, 없으면 재화 감사·구독 감사. 파일명 비서 이름과 화면 이름은 fin-analysis.mjs 목록을 그대로 쓴다.
const ASSIST_ORDER=Object.freeze(['spend','audit','subscription']);
export function feelAssistPick(reports){
  const {cards}=analysisCards(reports);
  for(const a of ASSIST_ORDER){const c=cards.find(k=>k.report.assistant===a);if(c)return {label:c.label,date:c.report.date};}
  return null;
}
// 카드 맨 아래 줄. PC 앱이 아니면 줄도 요청도 없다. 읽기는 목록 1번이고 본문은 읽지 않는다(본문은 분석 화면에서 누를 때만). 결과가 없거나 읽기가 실패하면 결과 줄이 없다.
// 비서 글의 숫자는 카드 문장에 섞지 않는다. ctx={h:{el,add,button},surface,request(body)=>Promise,gone()=>bool,openResult(),openExport()}. 돌려주는 Promise는 거부되지 않는다.
export function feelAssist(card,ctx){
  if(!card||ctx.surface!=='APP_SHELL')return Promise.resolve();
  const {h}=ctx,gone=ctx.gone??(()=>false),send=h.button('비서에게 보낼 상태 보기',ctx.openExport,'secondary'),row=h.add(h.el('div',null,'button-row feel-assist'),send);
  h.add(card,row);
  const load=async()=>{
    let list;
    try{list=await ctx.request({});}catch{return;}
    if(gone())return;
    const pick=feelAssistPick(list?.reports);
    if(pick)row.replaceChildren(h.button(pick.label+' 비서 · '+pick.date+' · 결과 보기',ctx.openResult,'secondary'),send);
  };
  return load();
}
