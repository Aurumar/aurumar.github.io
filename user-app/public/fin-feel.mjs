// 돈 진단 카드 (M1A, 설계 M1D §1.1~1.2): 돈 탭 맨 위 한 문장. 모든 숫자는 "고정비 예정을 뺀 뒤 쓸 수 있는 돈" 하나에서 나온다.
// 규칙: 금액은 BigInt, 모름은 0이 아니다. 저장·시계·난수·저장소·innerHTML 없음. 통신은 없고 비서 목록 읽기(M1C)는 부른 쪽이 넘긴 request로만 한다. 화면 요소는 부른 쪽이 넘긴 h로만 만든다.
// 결과와 문구에는 분류 이름과 합계만 넣는다(가게 이름·규칙 이름 없음). 의료·민감 줄은 가리기 설정과 상관없이 원인 후보에서 뺀다.
// "무엇을 할지" 정하는 문장은 이 카드에만 쓴다(2026-11-06 지시서의 명시 요구). fin-forecast.mjs·fin-plan.mjs의 옛 원칙과 옛 함수는 그대로다.
import {formatWon,isSensitive,shiftMonth} from './fin-ledger.mjs';
import {prepare,roundDiv} from './fin-charts.mjs';
import {budgetStatus,monthInsight,vaultBricks} from './fin-plan.mjs';
import {fixedPlan,fixedSchedule,monthForecast,forecastNode,TIGHT_PCT} from './fin-forecast.mjs';
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
// FIX67 (M-04): 오늘 몫 = (지금 쓸 수 있는 돈 A + 오늘 쓴 돈) ÷ 오늘 포함 남은 날(내림), 오늘 남은 몫 = 오늘 몫 − 오늘 쓴 돈. 마지막 날은 오늘 몫 = A + 오늘 쓴 돈(남은 몫 = A).
// todaySpent = 오늘 쓴 돈(vaultWall today.spent, 모르면 null → null). 계산만(저장 0). 위젯·내보내기 값(life-money-facts·state-export)은 이 함수를 쓰지 않는다.
export function vaultTodayShare(core,todaySpent){
  if(!core||todaySpent===null||todaySpent===undefined)return null;
  const n=BigInt(core.dl+1),x=core.A+todaySpent,share=x>=0n?x/n:-ceilDiv(-x,n),left=share-todaySpent;
  return {share,spent:todaySpent,left,over:left<0n?-left:0n,last:core.dl===0};
}
// FIX67 (M-04·M-08): 금고 셋째 큰 숫자와 아래 작은 줄. 작은 줄 = 내일부터 하루 몫(core.safe = 지금까지의 칩 값). 넘겼으면 음수 숫자 대신 "오늘 몫을 ○원 넘겼어요"(state OVER).
// 이번 달 지출 기록 0건(NO_DATA)이면 "-" 대신 예산 기준 하루 몫(금괴 한 개 = 예산 ÷ 날수)을 '참고'로. 모름 줄만 있는 달은 그대로 모름.
export const VAULT_TODAY_TEXT=Object.freeze({label:'오늘 남은 몫',last:'오늘 남은 돈',noRecord:'이번 달 지출 기록이 아직 없어요',ref:'참고',fixed:'고정비 예정 뺌'});
export const VAULT_OVER_SHARE=x=>'오늘 몫을 '+formatWon(x)+' 넘겼어요';
export const vaultTomorrowText=core=>core.A<=0n?'내일부터 쓸 돈 없음':core.safe>0n?'내일부터 하루 '+formatWon(core.safe):'남은 '+core.dl+'일은 하루 1원도 안 돼요';
// FIX67 (M-05): 금고 작은 줄과 예산 화면 "남은 금액" 아래 줄이 같은 글자(같은 feelCore). core가 없으면 빈 글자.
export const vaultDayText=core=>!core?'':(core.dl===0?(core.A>0n?'오늘이 마지막 날':'고정비 예정 빼면 남은 돈 없음'):vaultTomorrowText(core))+' · '+VAULT_TODAY_TEXT.fixed;
export function vaultTodayNum({f,s,v,todaySpent}){
  const L=VAULT_TODAY_TEXT,label=L.label,none=foot=>({label,value:'-',foot,state:'NONE',share:null});
  if(!s.current)return none('이번 달이 아님');
  if(s.dataState==='NO_DATA')return {label,value:v?.perBrick===null||v?.perBrick===undefined?'-':formatWon(v.perBrick),tag:L.ref,foot:L.noRecord+' · 예산 ÷ 날수',state:'NO_RECORD',share:null};
  const c=s.dataState==='KNOWN'?feelCore(f):null;
  if(!c)return none('쓴 돈을 모름');
  const t=vaultTodayShare(c,todaySpent),foot=vaultDayText(c);
  if(c.dl===0)return {label:L.last,value:c.A>0n?formatWon(c.A):'-',foot,state:'LAST',share:t};
  if(!t)return {label,value:'-',foot:'오늘 쓴 돈 모름 · '+foot,state:'NONE',share:null};
  if(t.over>0n)return {label,value:VAULT_OVER_SHARE(t.over),foot,state:'OVER',share:t};
  return {label,value:formatWon(t.left),foot,state:'LEFT',share:t};
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
    const head=x.state==='NO_DATA'?'이번 달 소비 자료 없음 (0원 아님)':'이번 달 실제 금액 모름 줄만 있음 (0원 아님)';
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
  // FIX38: 주의 단계도 "괜찮음"이라 말하지 않는다. 쓸 수 있는 하루 몫만 말한다.
  if(x.level==='CAUTION')return [t(head),b(leftWords(x.left)),t(' · 내일부터 하루 '),b(formatWon(x.safe)),t(' 안에서 쓰기')];
  return [t(head),b(leftWords(x.left)),t(' · 내일부터 하루 '),b(formatWon(x.safe)),t('까지 괜찮음')];
}
export function feelText(x){
  if(!x||x.state==='NOT_CURRENT')return null;
  const parts=mainParts(x),main=parts.map(p=>p.t).join('');
  return {parts,main,cause:x.level&&x.level!=='ROOM'?causeSentence(x.cause):null,
    action:x.action&&!main.includes(x.action.text)?x.action:null,
    notes:[...(x.unknownRows?['실제 금액 모름 '+x.unknownRows+'행은 넣지 않음']:[]),...(x.avg?.unknownMonths?['실제 금액 모름 줄이 있는 '+x.avg.unknownMonths+'개월은 최근 평균에서 뺌']:[])]};
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
// EXP1: 내보내기용 오늘 줄. 돈 탭 금고 셋째 숫자와 같은 함수(vaultTodayNum → vaultTodayShare)의 오늘 몫(share)과 오늘 쓴 돈(spent)만 BigInt로 돌려준다.
// 오늘 몫이 음수(이미 예산을 넘은 달)면 쓸 수 있는 돈은 0이다. 모름(예산 없음·자료 없음·쓴 돈 모름 줄)은 null — 0원이 아니다. 참고 값(NO_RECORD)은 내보내지 않는다.
export function feelTodayOf(fin,today){
  const prep=prepare(fin),rules=fin.recurring?.data.rules??[],s=budgetStatus(prep,fin.budgets,today.slice(0,7),today);
  if(!s.total)return null;
  const f=monthForecast({status:s,lines:prep.lines,rules,today}),v=vaultBricks(s),num=vaultTodayNum({f,s,v,todaySpent:vaultWall(prep,s,v).today?.spent??null});
  return num.share?{share:num.share.share>0n?num.share.share:0n,spent:num.share.spent}:null;
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

// ---------- 금고 카드 3층 (DS3, V5 설계 2.5·2.8 f) ----------
// 숫자는 지금 계산을 그대로 쓴다: 1층 = feelChip(오늘 쓸 수 있는 돈), 2층 = budgetStatus total(남은 돈·예산), 3층 = 기대치·금괴 한 개(vaultBricks perBrick)·forecastNode.
// 새로 하는 것은 그림 투영뿐이다(저장 0): 날마다 쓴 돈(소비 줄 순액 합, 오늘 뒤 날짜는 오늘에 더함 — feelLineLayout과 같은 규칙)을 금괴 한 개(= 하루 몫)와 견줘 깎인 비율로 그린다.
// keep = 남은 몫 천분율(0~1000). 순액 모름 줄이 있는 날·자료 없음·모름 달은 null(꽉 찬 금괴로 그리지 않는다). 오늘 쓴 돈이 하루 몫을 넘으면 over.
export const VAULT_NOTES=Object.freeze(['카드 대금 이체는 계산에 영향 없음 · 마통 이자는 금융비용 지출, 파킹 이자는 이자·배당 수입으로 기록','재정 기록은 그날 지출을 기록하기 전에 만드세요 · 먼저 기록한 같은 날 지출은 한 번 더 빠질 수 있음']);
// DS3B: 설명 없는 옛 한마디 대신 숫자로 말한다. 오늘 몫 = 금괴 한 개(예산 ÷ 그 달 날수), rest = vaultRestText(core).
export const VAULT_OVER_TODAY=(over,rest)=>'오늘 몫보다 '+formatWon(over)+' 더 썼어요'+(rest?' → '+rest:'');
export const VAULT_OVER_PACE=x=>'적당선보다 '+formatWon(x)+' 더 썼어요';
export const VAULT_OVER_BUDGET=x=>'예산보다 '+formatWon(x)+' 더 썼어요';
export const VAULT_NO_BUDGET_CTA='예산을 정하면 남은 돈이 보여요';
// 남은 날 하루 몫 = 칩과 같은 core.safe(아직 안 나간 고정비까지 뺀 내일부터 하루 몫). core가 없으면(모름·이번 달 아님) 말하지 않는다.
export function vaultRestText(core){
  if(!core)return null;
  if(core.dl===0)return '오늘이 이달 마지막 날이에요';
  if(core.A<=0n)return core.due>0n?'아직 안 나간 고정비까지 내면 남은 날 쓸 돈이 없어요':'남은 날 쓸 돈이 없어요';
  if(core.safe===0n)return '남은 '+core.dl+'일은 하루 1원도 안 돼요';
  return '남은 날은 하루 '+formatWon(core.safe);
}
// DS3B 이달 막대(화면용 계산만, 저장 0). T = budgetStatus().total 그대로: 쓴 돈 actual, 적당선 expectedToDate(= 예산 × 지난 날 ÷ 이달 날, 오늘 포함), 예산 budget.
// 길이는 천분율(0~1000). 눈금 = max(예산, 쓴 돈) — 예산을 넘으면 막대 끝이 쓴 돈이고 예산 자리에 선을 긋는다. 금 = 적당선까지의 쓴 돈, 벽돌색 = 적당선을 넘은 부분.
export function vaultMonthBar(T){
  if(!T)return null;
  const b=T.budget,a=T.actual,e=T.expectedToDate,pos=v=>v>0n?v:0n,scale=[pos(b),pos(a),pos(e),1n].reduce((m,v)=>v>m?v:m),pm=v=>Number(pos(v)*1000n/scale);
  const paceOver=a>e?a-e:0n,budgetOver=a>b?a-b:0n;
  return {budget:b,spent:a,pace:e,left:b-a,paceOver,budgetOver,state:budgetOver>0n?'OVER_MONTH':paceOver>0n?'OVER_PACE':'ROOM',
    goldPm:pm(a<e?a:e),spentPm:pm(a),pacePm:pm(e),budgetPm:pm(b)};
}
// DS3B 오늘 막대. wall = vaultWall() 그대로: 오늘 몫 perBrick, 오늘 쓴 돈 today.spent. 오늘 쓴 돈을 모르면(순액 모름 줄·모름 달) null.
// FIX67 (M-04): share를 주면(금고 카드 = vaultTodayShare의 오늘 몫) 그 값을 오늘 몫으로 쓴다. 안 주면 예전처럼 금괴 한 개.
export function vaultTodayBar(wall,share=wall?.perBrick??null){
  const t=wall?.today,per=share??null;
  if(!t||t.spent===null||per===null)return null;
  const sp=t.spent>0n?t.spent:0n,scale=[per,sp,1n].reduce((m,v)=>v>m?v:m),pm=v=>Number(v*1000n/scale);
  return {share:per,spent:t.spent,over:sp>per?sp-per:0n,sharePm:pm(per),fillPm:pm(sp<per?sp:per),spentPm:pm(sp)};
}
// DS3B 많이 쓴 곳: budgetStatus의 분류별 실적(categories·unbudgeted, 순액 모름 줄은 이미 빠짐)에서 0원 넘는 것 상위 n개. 막대 = 1위 대비 천분율. 분류 이름만(가게 이름 없음).
export function vaultTopSpend(prep,s,n=3){
  const rows=[...(s.categories??[]).map(c=>({category:c.category,actual:c.actual})),...(s.unbudgeted??[])].filter(r=>r.actual>0n);
  rows.sort((x,y)=>x.actual===y.actual?String(x.category).localeCompare(String(y.category)):x.actual>y.actual?-1:1);
  const top=rows.slice(0,n),max=top[0]?.actual??0n;
  return top.map(r=>({category:r.category,name:catName(prep,r.category),won:r.actual,pm:max>0n?Number(r.actual*1000n/max):0}));
}
// DSFIX S1: 마이너스 1층 큰 숫자. A < 0n일 때만 부른다. 빼기 기호는 U+2212.
export const VAULT_MINUS=A=>'−'+formatWon(-A)+' 초과';
const PHASE_TEXT={PAST:'지난 날',TODAY:'오늘',FUTURE:'남은 날'};
// s = budgetStatus(), v = vaultBricks(s)(날짜 단계와 금괴 한 개 값을 그대로 쓴다).
export function vaultWall(prep,s,v){
  const days=s.days,per=v.perBrick,known=v.state==='OK',cap=s.elapsed,spent=Array.from({length:days},()=>0n),unknown=new Set();
  if(known&&cap>0)for(const l of prep.lines){
    if(l.month!==s.month||!CONSUMPTION.has(l.kind))continue;
    const d=Math.min(Number(l.date.slice(8,10)),cap);
    if(l.net===null)unknown.add(d);else spent[d-1]+=l.net;
  }
  const keepOf=sp=>per>0n?(sp<=0n?1000:sp>=per?0:Number((per-sp)*1000n/per)):(sp>0n?0:1000);
  const bricks=v.bricks.map(b=>{
    if(b.phase==='FUTURE')return {day:b.day,phase:b.phase,spent:null,keep:1000,over:false};
    if(!known||per===null||unknown.has(b.day))return {day:b.day,phase:b.phase,spent:null,keep:null,over:false};
    const sp=spent[b.day-1];
    return {day:b.day,phase:b.phase,spent:sp,keep:keepOf(sp),over:sp>per};
  });
  const counts={PAST:0,TODAY:0,FUTURE:0};
  for(const b of bricks)counts[b.phase]++;
  return {days,perBrick:per,known,bricks,counts,today:bricks.find(b=>b.phase==='TODAY')??null};
}
// 금괴 벽 좌표. cols개씩 한 줄(넓은 화면 10, 좁은 화면 6 → 30일이면 6×5). 금은 바닥부터 keep만큼 남는다.
export function vaultWallLayout(w,{cols=10,bw=40,bh=22,gap=6}={}){
  const rows=Math.ceil(w.days/cols);
  return {width:cols*bw+(cols-1)*gap,height:rows*bh+(rows-1)*gap,cols,rows,
    bricks:w.bricks.map((b,i)=>({...b,x:(i%cols)*(bw+gap),y:Math.floor(i/cols)*(bh+gap),w:bw,h:bh,goldH:b.keep===null?null:r1(bh*b.keep/1000)}))};
}
// 금속 3단 세로 그라데이션. 색은 styles.css 클래스(stop-color)로만 정한다.
function metalDefs(h,id){
  const g=h.svgEl('linearGradient',{id,x1:0,y1:0,x2:0,y2:1});
  g.append(h.svgEl('stop',{offset:0},'vault-metal-hi'),h.svgEl('stop',{offset:0.45},'vault-metal-mid'),h.svgEl('stop',{offset:1},'vault-metal-lo'));
  const d=h.svgEl('defs');d.append(g);
  return d;
}
// 1층 금괴 1개: 사다리꼴 아이보리 음각 위에 남은 몫만큼 금을 바닥부터 채운다.
// DSFIX S1: 이달이 마이너스(고정비 예정 빼고 쓸 돈 < 0)면 오늘 쓴 돈이 0원이어도 금을 채우지 않는다(꽉 찬 금괴 = "써도 된다"로 읽히지 않게). 모름은 그대로 모름.
function todayIngot(h,wall,minus=false){
  const t=wall.today,keep=t?(minus&&t.keep!==null?0:t.keep):null,W=120,H=64,base=56,top=14,x0=6,bw=108,k=18,id='vault-metal-today';
  const at=r=>[r1(x0+k*r),r1(base-(base-top)*r),r1(x0+bw-k*r)];
  const shape=r=>{const [L,y,R]=at(r);return 'M'+x0+' '+base+' L'+L+' '+y+' L'+R+' '+y+' L'+(x0+bw)+' '+base+' Z';};
  const svg=h.svgRoot(W,H,keep===null?'오늘 금괴 · 오늘 쓴 돈 모름':minus?'오늘 금괴 · 이달 예산 초과 · 남은 몫 없음':'오늘 금괴 · 남은 몫 '+Math.floor(keep/10)+'%');
  svg.append(metalDefs(h,id),h.svgEl('path',{d:shape(1)},'vault-ingot-ivory'));
  if(keep)svg.append(h.svgEl('path',{d:shape(keep/1000),fill:'url(#'+id+')'},'vault-ingot-gold'));
  if(keep>=250){const [L,y,R]=at(keep/1000);svg.append(h.svgEl('line',{x1:r1(L+6),y1:r1(y+4),x2:r1(L+(R-L)*0.4),y2:r1(y+4)},'vault-ingot-shine'));}
  const n=h.add(h.el('div',null,'vault-ingot'+(keep===null?' unknown':'')+(t?.over?' over':'')+(minus&&keep!==null?' minus':'')),svg);
  n.setAttribute('data-keep',keep===null?'UNKNOWN':String(keep));
  return n;
}
function wallNode(h,wall,{cols}){
  const L=vaultWallLayout(wall,{cols}),id='vault-metal-wall',c=wall.counts;
  const svg=h.svgRoot(L.width,L.height,'이번 달 금괴 '+wall.days+'개 · 지난 날 '+c.PAST+'개 · 오늘 '+c.TODAY+'개 · 남은 날 '+c.FUTURE+'개');
  svg.append(metalDefs(h,id));
  for(const b of L.bricks){
    const g=h.svgEl('g',{'data-phase':b.phase},'vault-wall-brick ph-'+b.phase.toLowerCase()+(b.keep===null?' unknown':'')+(b.over?' over':''));
    g.append(h.svgEl('rect',{x:b.x,y:b.y,width:b.w,height:b.h,rx:3},'vault-wall-ivory'));
    if(b.goldH)g.append(h.svgEl('rect',{x:b.x,y:r1(b.y+b.h-b.goldH),width:b.w,height:b.goldH,rx:3,fill:'url(#'+id+')'},'vault-wall-gold'));
    if(b.phase==='TODAY')g.append(h.svgEl('rect',{x:b.x+1,y:b.y+1,width:b.w-2,height:b.h-2,rx:3},'vault-wall-frame'));
    const tip=h.svgEl('title');tip.textContent=b.day+'일 · '+PHASE_TEXT[b.phase]+(b.phase==='FUTURE'?'':b.keep===null?' · 쓴 돈 모름':' · 쓴 돈 '+formatWon(b.spent));g.append(tip);
    svg.append(g);
  }
  return h.add(h.el('div',null,'vault-wall'+(cols===6?' narrow':'')),svg);
}
function vaultLegend(h){
  const ul=h.el('ul',null,'fin-legend');
  for(const [cls,text] of [['vault-sw5-future','남은 날'],['vault-sw5-today','오늘'],['vault-sw5-past','지난 날 · 금 = 남은 몫'],['vault-sw5-spent','쓴 몫']])h.add(ul,h.add(h.el('li'),h.el('span','','swatch '+cls),h.el('span',text)));
  return ul;
}
// ---------- DS3B 그림 조각 ----------
// 막대 SVG: 가로 1000 단위(천분율 그대로), 높이는 CSS가 정한다(preserveAspectRatio none). 세로 눈금은 CSS vector-effect로 굵기를 지킨다. 글자는 SVG 밖 HTML에만 둔다(늘어나지 않게).
function barSvg(h,H,label,parts){
  const svg=h.svgRoot(1000,H,label);svg.setAttribute('preserveAspectRatio','none');
  for(const [tag,attrs,cls] of parts)if(attrs)svg.append(h.svgEl(tag,attrs,cls));
  return svg;
}
const overRect=(a,b,H)=>b>a?{x:a,y:2,width:b-a,height:H-4}:null;
function numCell(h,kind,label,amount,foot,extra='',tag=null){
  const own=kind==='today';
  return h.add(h.el('div',null,'vault-num vault-num-'+kind+(own?' vault-l1-main':'')+extra),
    h.el('span',label,'vault-num-label'+(own?' vault-l1-label':'')),h.el('strong',amount,'vault-num-amount'+(own?' vault-l1-amount':'')),tag?h.el('span',tag,'vault-num-tag'):null,foot?h.el('span',foot,'vault-num-foot'+(own?' vault-l1-foot':'')):null);
}
// 이달 막대: 금 = 쓴 돈(적당선까지), 벽돌색 = 적당선을 넘은 부분, 빈 칸 = 남은 돈, 세로 눈금 = 오늘까지 이만큼이 적당. 예산을 넘으면 예산 자리에 가는 선.
function monthBarNode(h,m){
  const H=24,label='이번 달 쓴 돈 '+formatWon(m.spent)+' · 예산 '+formatWon(m.budget)+' · 오늘까지 적당선 '+formatWon(m.pace)+(m.paceOver>0n?' · 적당선보다 '+formatWon(m.paceOver)+' 더 씀':'');
  const svg=barSvg(h,H,label,[
    ['rect',{x:0,y:2,width:1000,height:H-4},'vault-bar-track'],
    ['rect',m.goldPm>0?{x:0,y:2,width:m.goldPm,height:H-4}:null,'vault-bar-fill'],
    ['rect',overRect(m.pacePm,m.spentPm,H),'vault-bar-over'],
    ['line',m.budgetOver>0n?{x1:m.budgetPm,y1:0,x2:m.budgetPm,y2:H}:null,'vault-bar-budget'],
    ['line',{x1:m.pacePm,y1:0,x2:m.pacePm,y2:H},'vault-bar-pace']]);
  const n=h.add(h.el('div',null,'vault-month vault-bar'+(m.paceOver>0n?' over':'')),
    h.add(h.el('div',null,'vault-bar-head'),h.el('span','이달','vault-bar-title'),h.el('span','오늘까지 이만큼이 적당 '+formatWon(m.pace),'vault-bar-pace-text')),
    svg,
    h.add(h.el('div',null,'vault-bar-foot'),h.el('span','쓴 돈 '+formatWon(m.spent)),h.el('span','예산 '+formatWon(m.budget))),
    m.paceOver>0n?h.el('p',VAULT_OVER_PACE(m.paceOver),'vault-bar-over-text'):null,
    m.budgetOver>0n?h.el('p',VAULT_OVER_BUDGET(m.budgetOver),'vault-bar-over-text'):null);
  n.setAttribute('data-state',m.state);
  return n;
}
// 오늘 막대(작게): 금 = 오늘 쓴 돈(오늘 몫까지), 벽돌색 = 오늘 몫을 넘은 부분. 넘으면 숫자 문장 한 줄(vault-l1-over).
function todayBarNode(h,t,rest){
  if(!t)return h.add(h.el('div',null,'vault-today vault-bar unknown'),h.el('p','오늘 쓴 돈 모름 (실제 금액 모름 줄이 있음)','vault-bar-foot muted small'));
  const H=14,label='오늘 쓴 돈 '+formatWon(t.spent)+' · 오늘 몫 '+formatWon(t.share)+(t.over>0n?' · '+formatWon(t.over)+' 넘음':'');
  const svg=barSvg(h,H,label,[
    ['rect',{x:0,y:2,width:1000,height:H-4},'vault-bar-track'],
    ['rect',t.fillPm>0?{x:0,y:2,width:t.fillPm,height:H-4}:null,'vault-bar-fill'],
    ['rect',overRect(t.sharePm,t.spentPm,H),'vault-bar-over'],
    ['line',t.over>0n?{x1:t.sharePm,y1:0,x2:t.sharePm,y2:H}:null,'vault-bar-pace']]);
  return h.add(h.el('div',null,'vault-today vault-bar'+(t.over>0n?' over':'')),
    h.add(h.el('div',null,'vault-bar-head'),h.el('span','오늘','vault-bar-title'),h.el('span','오늘 쓴 돈 '+formatWon(t.spent)+' / 오늘 몫 '+formatWon(t.share),'vault-bar-note')),
    svg,t.over>0n?h.el('p',VAULT_OVER_TODAY(t.over,rest),'vault-l1-over'):null);
}
function topSpendNode(h,top){
  if(!top.length)return null;
  const ul=h.el('ul',null,'vault-top-list');
  for(const r of top){
    const svg=barSvg(h,10,r.name+' '+formatWon(r.won),[['rect',{x:0,y:1,width:1000,height:8},'vault-bar-track'],['rect',r.pm>0?{x:0,y:1,width:r.pm,height:8}:null,'vault-bar-fill']]);
    h.add(ul,h.add(h.el('li',null,'vault-top-row'),h.el('span',r.name,'vault-top-name'),h.add(h.el('span',null,'vault-top-bar'),svg),h.el('strong',formatWon(r.won),'vault-top-won')));
  }
  return h.add(h.el('div',null,'vault-top'),h.el('h3','많이 쓴 곳 · 이번 달','vault-top-title'),ul);
}

// h={el,add,button,svgEl,svgRoot}. ctx = app.mjs vaultState() 값({prep,s,f,v}) + rules·narrow(≤420px), 앱 쪽 줄(live 지금 내 돈, fixed 아직 안 나간 고정비, feedback 저장 직후 줄), onQuick·onCalc. 부른 쪽이 root에 붙인다.
// DS3B: 위에서 아래로 ① 숫자 3개(쓴 돈·남은 돈·오늘 쓸 수 있는 돈, 같은 크기) ② 이달 막대 ③ 오늘 막대 ④ 많이 쓴 곳 3개 ⑤ "벽돌로 보기"(접힘: 오늘 금괴·금괴 벽). "자세히"는 늘 접혀서 시작한다.
export function vaultCardNode(h,{prep,s,f,v,rules=[],narrow=false,live=null,fixed=null,feedback=null,onQuick,onCalc}){
  const T=s.total,p=h.el('section',null,'panel vault-card vault-v5'),fcBox=feelDetails(h,forecastNode(h,f));
  const tip=h.el('summary','ⓘ');tip.setAttribute('aria-label','금고 계산 도움말');
  const help=h.add(h.el('details',null,'vault-help'),tip,...VAULT_NOTES.map(t=>h.el('p',t,'muted small')));
  h.add(p,h.add(h.el('div',null,'vault-head'),h.el('h2','이번 달 금고','panel-title'),h.add(h.el('span',null,'vault-head-side'),h.el('span',s.month,'eyebrow'),help)));
  const top=topSpendNode(h,vaultTopSpend(prep,s));
  const unknownFoot=s.unknownRows?'실제 금액 모름 '+Number(s.unknownRows).toLocaleString('ko-KR')+'행 뺌':'이번 달 오늘까지';
  if(v.state==='NO_BUDGET'){
    // DS3B: 예산이 없으면 쓴 돈만 크게(소비 줄이 없으면 0원이 아니라 자료 없음, 모름 줄만 있으면 모름) + 예산 정하기 단추 하나.
    const spent=s.dataState==='KNOWN'?formatWon(s.actualTotal):s.dataState==='NO_DATA'?'자료 없음':'모름';
    h.add(p,h.add(h.el('div',null,'vault-nums solo'),numCell(h,'spent','쓴 돈',spent,s.dataState==='KNOWN'?unknownFoot:null)),
      h.add(h.el('div',null,'button-row'),h.button(VAULT_NO_BUDGET_CTA,onCalc,'primary')),top,live,fcBox,fixed);
    return p;
  }
  const known=v.state==='OK',wall=vaultWall(prep,s,v),num=vaultTodayNum({f,s,v,todaySpent:wall.today?.spent??null}),over=num.state==='OVER';   // FIX67 (M-04): 넘김 = 오늘 몫(vaultTodayShare) 기준
  // DSFIX S1: 마이너스 = 칩과 같은 값(feelCore A = 예산 − 쓴 돈 − 고정비 예정)이 0보다 작을 때. 큰 숫자를 "−12,000원 초과"처럼 금액과 함께 빨강 계열로 보인다.
  const core=known&&s.current?feelCore(f):null,minus=Boolean(core&&core.A<0n);
  p.setAttribute('data-tone',!known?'none':feelTone(moneyFeel({prep,status:s,forecast:f,rules}),T));
  // ① 숫자 3개. 쓴 돈·남은 돈 = budgetStatus total 그대로(넘으면 "이달 초과" + 넘은 금액). 셋째 = 오늘 남은 몫(FIX67 vaultTodayNum, 아래 작은 줄 = 내일부터 하루 몫). 모름·자료 없음은 0원이 아니다.
  const unk=v.state==='NO_DATA'?'자료 없음':'모름',overMonth=known&&T.remaining<0n;
  const nums=h.add(h.el('div',null,'vault-nums'),
    numCell(h,'spent','쓴 돈',known?formatWon(T.actual):unk,known?unknownFoot:null),
    numCell(h,'left',overMonth?'이달 초과':'남은 돈',known?formatWon(overMonth?-T.remaining:T.remaining):'모름','예산 '+formatWon(T.budget),overMonth?' over':''),
    numCell(h,'today',num.label,minus?VAULT_MINUS(core.A):num.value,num.foot,over&&!minus?' over':'',num.tag??null));
  const l1=h.add(h.el('div',null,'vault-l1'+(over?' over':'')+(minus?' minus':'')),nums,
    known?null:h.el('p',v.state==='NO_DATA'?'이 달 소비 자료가 없습니다(0원 아님). 예산 '+formatWon(T.budget)
      :'실제 금액 모름 줄만 있어 쓴 돈을 알 수 없습니다. 예산 '+formatWon(T.budget),'vault-sub'),
    // ② 이달 막대 ③ 오늘 막대: 쓴 돈을 알 때만(모름 달은 0원 막대로 그리지 않는다)
    known?monthBarNode(h,vaultMonthBar(T)):null,
    known&&s.current?todayBarNode(h,num.share?vaultTodayBar(wall,num.share.share):null,vaultRestText(core)):null,
    fixed,h.add(h.el('div',null,'vault-l1-side button-row'),h.button('빠른 지출',onQuick,'primary')));   // FIX67 (MAN1 9): 단추 이름 하나로
  l1.setAttribute('data-over',over?'1':'0');l1.setAttribute('data-minus',minus?'1':'0');
  h.add(p,l1,feedback,top);
  // ⑤ 벽돌로 보기(접힘): 오늘 금괴 + 금괴 벽. 지우지 않고 옮겼다.
  const l2=h.add(h.el('details',null,'vault-l2'),h.el('summary','벽돌로 보기','vault-l2-sum'),
    h.add(h.el('div',null,'vault-l2-today'),todayIngot(h,wall,minus),h.el('span','오늘 금괴 · 금 = 금괴 한 개(예산 ÷ 날수) 중 오늘 남은 만큼','muted small')),
    wallNode(h,wall,{cols:narrow?6:10}),vaultLegend(h),
    known?null:h.el('p',v.state==='NO_DATA'?'소비 줄이 없는 달은 0원이 아니라 자료 없음입니다.':'실제 금액 모름 줄 '+Number(s.unknownRows).toLocaleString('ko-KR')+'행은 합계에 넣지 않습니다.','muted small'));
  // 3층(접힘): 지금 내 돈·기대치 대비·금괴 한 개·이번 달 속도로 계산한 값·금고 계산기
  const pace=(known&&s.current?(T.paceDelta>0n?formatWon(T.paceDelta)+' 더 씀':T.paceDelta<0n?formatWon(-T.paceDelta)+' 덜 씀':'같음'):'-')+' · '+(known&&s.current?'기대치 '+formatWon(T.expectedToDate):'이번 달만 비교');
  const l3=h.add(h.el('details',null,'vault-more'),h.el('summary','자세히'),live,
    h.el('p','오늘까지 기대치 대비 '+pace,'small vault-more-line'),
    h.el('p','금괴 한 개 '+(v.perBrick===null?'-':formatWon(v.perBrick))+' · '+s.days+'일 × 한 개 = 하루 몫','small vault-more-line'),
    fcBox,h.add(h.el('div',null,'button-row'),h.button('금고 계산기',onCalc,'secondary')));
  h.add(p,l2,l3);
  return p;
}
