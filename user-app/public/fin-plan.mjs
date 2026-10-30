// FIN01 F5 계산(순수 함수, DOM 없음): 반복결제 탐지, 고정비·변동비, 예산 대비 실적, 평생 타임라인.
// 규칙: 금액은 BigInt(좌표만 Number). null(순액 모름)은 0이 아니라 개수로 따로. 이체·선불·수입은 소비가 아니다. 환불은 차감.
// 자료 없는 달은 0원이 아니라 "자료 없음". 미배분 잔액은 연 단위로만, 달에 나누지 않는다. 영수증·보유품 가격과 합산하지 않는다(여기서 읽지 않음).
import {shiftMonth,monthSpan} from './fin-ledger.mjs';
import {aggregate,dataMonths,roundDiv,niceTicks} from './fin-charts.mjs';

const CONSUMPTION=new Set(['EXPENSE','REFUND']);
const pad=n=>String(n).padStart(2,'0');
const dayNum=d=>Math.round(Date.parse(d+'T12:00:00Z')/86400000);
const daysIn=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
const bigSort=(a,b)=>a<b?-1:a>b?1:0;
const median=vals=>{const v=[...vals].sort(bigSort);return v[Math.floor((v.length-1)/2)];};   // 짝수 개면 아래쪽 중앙값(원 단위 그대로)
const r1=v=>Math.round(v*10)/10;
// 규칙 글자: 묶음 안 모든 가맹점 이름(소문자)에 들어 있는 가장 긴 공통 부분 문자열(앞뒤 공백 제거, 60자 이하, 2자 미만이면 마지막 이름).
// 규칙은 "가맹점에 이 글자가 들어 있으면" 맞으므로, 이 글자로 만든 규칙은 묶음의 모든 줄에 맞는다.
export function groupPattern(merchants){
  const names=[...new Set(merchants.map(m=>String(m)))].filter(Boolean);if(!names.length)return '';
  const lower=names.map(n=>n.toLowerCase()),base=[...names.reduce((a,b)=>a.length<=b.length?a:b)];
  let best='';
  for(let i=0;i<base.length;i++)for(let j=base.length;j>i+[...best].length;j--){
    const cand=base.slice(i,j).join('');if(lower.every(n=>n.includes(cand.toLowerCase()))){best=cand;break;}
  }
  best=[...best.trim()].slice(0,60).join('').trim();
  return [...best].length>=2?best:[...names.at(-1).trim()].slice(0,60).join('').trim();
}

// ---------- 반복결제 ----------
// 주기: 연속 결제 사이 날짜 간격 창(일). 한 번 빠진 달(간격 2배)은 "빠짐"으로 허용하되 규칙적 간격으로 세지 않는다.
export const PERIODS=Object.freeze({
  MONTHLY:{label:'매월',lo:25,hi:36,months:1,min:3,cancelAfterMissed:2,grace:7},
  QUARTERLY:{label:'분기마다',lo:84,hi:98,months:3,min:3,cancelAfterMissed:1,grace:15},
  YEARLY:{label:'매년',lo:350,hi:380,months:12,min:2,cancelAfterMissed:1,grace:30},
});
// 가맹점 묶음 키: 대소문자·공백 무시, 숫자(지점 번호·주문번호)는 #로. 빈 가맹점은 탐지하지 않는다.
export function merchantKey(m){return String(m??'').toLowerCase().replace(/\s+/g,'').replace(/\d+/g,'#');}
// 달 단위 다음 날짜: 결제일(anchorDay)을 유지하되 그 달 마지막 날을 넘지 않는다(31일 → 2월 28/29일).
export function nextByMonths(date,months,anchorDay){
  const m=shiftMonth(date.slice(0,7),months),last=daysIn(m);
  return m+'-'+pad(Math.min(anchorDay,last));
}
function classify(intervals,p){
  let regular=0;
  for(const d of intervals){if(d>=p.lo&&d<=p.hi)regular++;else if(!(d>=p.lo*2&&d<=p.hi*2))return null;}
  return regular>=Math.max(1,Math.ceil(intervals.length*0.7))?regular:null;
}
// prep: fin-charts prepare(fin). today: 'YYYY-MM-DD'. 반환 items는 연간 환산 금액이 큰 순서.
export function detectRecurring(prep,today,{amountTolerancePct=15}={}){
  const groups=new Map(),coverage=new Map();
  for(const l of prep.lines){
    coverage.set(l.accountId,l.date>(coverage.get(l.accountId)??'')?l.date:coverage.get(l.accountId));   // 계정별 마지막 자료 날짜
    if(!CONSUMPTION.has(l.kind))continue;
    const key=merchantKey(l.merchant);if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(l);
  }
  const items=[],excluded=[];
  for(const [key,lines] of groups){
    const charges=lines.filter(l=>l.kind==='EXPENSE'&&l.net!==null&&l.net>0n);
    const override=lines.some(l=>l.recurring==='EXCLUDE')?'EXCLUDE':lines.some(l=>l.recurring==='INCLUDE')?'INCLUDE':null;
    const last=lines.at(-1);
    if(override==='EXCLUDE'){excluded.push({key,merchant:last.merchant,pattern:groupPattern(lines.map(l=>l.merchant)),count:charges.length,ruleId:lines.find(l=>l.recurring==='EXCLUDE').recurringRuleId});continue;}
    const byDate=new Map();for(const l of charges)byDate.set(l.date,(byDate.get(l.date)??0n)+l.net);
    const dates=[...byDate.keys()].sort(),amounts=dates.map(d=>byDate.get(d));
    if(!dates.length)continue;
    const intervals=dates.slice(1).map((d,i)=>dayNum(d)-dayNum(dates[i]));
    let period=null;
    for(const [name,p] of Object.entries(PERIODS))if(dates.length>=p.min&&classify(intervals,p)!==null){period=name;break;}
    const typical=median(amounts),tol=BigInt(amountTolerancePct);
    const within=amounts.filter(a=>(a>typical?a-typical:typical-a)*100n<=tol*typical).length;
    const amountOK=within>=Math.ceil(amounts.length*0.7);
    if(!(period&&amountOK)&&override!=='INCLUDE')continue;
    const p=period?PERIODS[period]:null,lastDate=dates.at(-1);
    const days=dates.slice(-6).map(d=>Number(d.slice(8,10))).sort((a,b)=>a-b),anchorDay=days[Math.floor(days.length/2)];   // 위쪽 중앙값(31·30일 결제가 섞여도 31일 유지)
    // 예상 결제일을 오늘까지 따라가며 빠진 횟수를 센다. 그 계정 자료가 끝난 달 뒤의 예상일은 "자료 없음"(빠짐으로 세지 않음).
    let next=null,missed=0,unknownAfterData=0;
    const accountId=charges.at(-1)?.accountId??last.accountId,dataEnd=coverage.get(accountId)??'';   // 그 계정 마지막 자료 날짜
    if(p){
      next=nextByMonths(lastDate,p.months,anchorDay);
      // 일찍 낸 결제(예: 4월분을 3/31에)는 다음 예상일을 한 주기 뒤로 민다: 마지막 결제와 예상일 간격이 주기 절반보다 짧으면 건너뛴다.
      while(dayNum(next)-dayNum(lastDate)<p.lo/2)next=nextByMonths(next,p.months,anchorDay);
      // 예상일+유예가 그 계정 마지막 자료 날짜보다 뒤면 "자료 없음", 아니면 빠짐.
      while(dayNum(next)+p.grace<dayNum(today)){if(next>dataEnd||dayNum(next)+p.grace>dayNum(dataEnd))unknownAfterData++;else missed++;next=nextByMonths(next,p.months,anchorDay);if(missed+unknownAfterData>600)break;}
    }
    const status=!p?'IRREGULAR':missed>=p.cancelAfterMissed?'CANCEL_CANDIDATE':missed>0?'LATE':unknownAfterData>0?'NO_DATA':'ACTIVE';
    const cats=new Map();for(const l of lines)if(l.category)cats.set(l.category,(cats.get(l.category)??0)+1);
    const category=[...cats.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]??null;
    const manual=[...lines].reverse().find(l=>l.costType)?.costType??null;
    items.push({key,merchant:last.merchant,pattern:groupPattern(lines.map(l=>l.merchant)),accountIds:[...new Set(charges.map(l=>l.accountId))].sort(),period,periodLabel:p?.label??'불규칙',count:dates.length,
      firstDate:dates[0],lastDate,typical,min:amounts.reduce((a,b)=>a<b?a:b),max:amounts.reduce((a,b)=>a>b?a:b),amountStable:amountOK,
      avgIntervalDays:intervals.length?Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length):null,nextDate:next,missed,unknownAfterData,status,
      latest:amounts.at(-1),annual:p?amounts.at(-1)*BigInt(12/p.months):null,category,costType:manual,forced:override==='INCLUDE',dates,amounts});
  }
  items.sort((a,b)=>(b.annual??-1n)>(a.annual??-1n)?1:(b.annual??-1n)<(a.annual??-1n)?-1:a.key.localeCompare(b.key));
  return {items,excluded};
}
// 반복결제 격자: 행=항목, 열=달. 결제는 점, 다음 예상일은 빈 원, 자료 없는 달은 회색 칸.
export function recurringGridLayout(items,months,present,{width,rowH=26,labelW=120,top=22}={}){
  const plotW=Math.max(40,width-labelW-8),colW=plotW/Math.max(1,months.length),index=new Map(months.map((m,i)=>[m,i]));
  const x=m=>labelW+colW*index.get(m)+colW/2;
  const cells=months.map((m,i)=>({month:m,x:r1(labelW+colW*i),w:r1(colW),hasData:present.has(m)}));
  const rows=items.map((it,r)=>({item:it,y:top+r*rowH+rowH/2,dots:it.dates.map((d,i)=>({date:d,amount:it.amounts[i]})).filter(d=>index.has(d.date.slice(0,7))).map(d=>({...d,x:r1(x(d.date.slice(0,7)))})),
    next:it.nextDate&&index.has(it.nextDate.slice(0,7))?{date:it.nextDate,x:r1(x(it.nextDate.slice(0,7)))}:null}));
  const every=Math.max(1,Math.ceil(months.length*40/plotW));
  return {width,height:top+items.length*rowH+6,labelW,colW:r1(colW),cells,rows,labels:months.map((m,i)=>({x:r1(labelW+colW*i+colW/2),text:m.slice(2),show:i%every===0||i===months.length-1}))};
}

// ---------- 고정비·변동비 ----------
// 정하는 순서: ① 규칙의 수동 지정(costType) ② 반복결제로 탐지된 가맹점(제외 지정 아닌 것) ③ 분류 기본값(통신만 고정) ④ 그 밖은 변동.
export const FIXED_CATEGORIES=Object.freeze(['COMM']);
export function costClass(line,recurringKeys){
  if(line.costType)return {cls:line.costType,reason:'MANUAL'};
  if(recurringKeys.has(merchantKey(line.merchant)))return {cls:'FIXED',reason:'RECURRING'};
  if(FIXED_CATEGORIES.includes(line.category))return {cls:'FIXED',reason:'CATEGORY'};
  return {cls:'VARIABLE',reason:'DEFAULT'};
}
export function costSplit(prep,range,recurring,localDate){
  const keys=new Set(recurring.items.map(i=>i.key)),present=dataMonths(prep,range);
  const from=range.from??present[0]??null,to=range.to??(present.length?(localDate.slice(0,7)>present.at(-1)?localDate.slice(0,7):present.at(-1)):null);
  const months=from&&to?monthSpan(from,to):[],has=new Set(present);
  const row=()=>({fixed:0n,variable:0n,unknownRows:0,reasons:{MANUAL:0,RECURRING:0,CATEGORY:0,DEFAULT:0}});
  const per=new Map(months.filter(m=>has.has(m)).map(m=>[m,row()])),total=row();
  for(const l of prep.lines){
    if(!CONSUMPTION.has(l.kind)||!per.has(l.month))continue;
    const b=per.get(l.month);
    if(l.net===null){b.unknownRows++;total.unknownRows++;continue;}
    const c=costClass(l,keys);
    if(c.cls==='FIXED'){b.fixed+=l.net;total.fixed+=l.net;}else{b.variable+=l.net;total.variable+=l.net;}
    b.reasons[c.reason]++;total.reasons[c.reason]++;
  }
  // 순액 모름 줄만 있는 달은 금액을 모른다(0원 아님): fixed·variable null, unknownOnly.
  const known=new Set(prep.lines.filter(l=>CONSUMPTION.has(l.kind)&&l.net!==null).map(l=>l.month));
  return {months:months.map(m=>!per.has(m)?{month:m,hasData:false,fixed:null,variable:null,unknownRows:0}:known.has(m)?{month:m,hasData:true,...per.get(m)}:{month:m,hasData:true,unknownOnly:true,...per.get(m),fixed:null,variable:null}),total};
}

// ---------- 예산 대비 실적 ----------
// budgets: [{id,data:{effectiveFrom,total,categories,note}}]. 그 달에 적용되는 예산 = 시작 달이 그 달 이하인 것 중 가장 늦은 것.
export function budgetFor(budgets,month){
  return [...budgets].filter(b=>b.data.effectiveFrom<=month).sort((a,b)=>b.data.effectiveFrom.localeCompare(a.data.effectiveFrom))[0]??null;
}
function line(budget,actual,elapsed,days,current){
  const b=BigInt(budget),remaining=b-actual;
  const expected=roundDiv(b*BigInt(elapsed),BigInt(days));
  return {budget:b,actual,remaining,usedPermille:b>0n?roundDiv(actual*1000n,b):null,expectedToDate:expected,paceDelta:actual-expected,
    projected:current&&elapsed>0?roundDiv(actual*BigInt(days),BigInt(elapsed)):elapsed===days?actual:null,
    perDayLeft:current&&remaining>0n?roundDiv(remaining,BigInt(days-elapsed+1)):null,
    status:actual>b?'OVER':current&&actual>expected?'FAST':'OK'};
}
export function budgetStatus(prep,budgets,month,today){
  const nowMonth=today.slice(0,7),days=daysIn(month),current=month===nowMonth;
  const elapsed=month<nowMonth?days:current?Number(today.slice(8,10)):0;
  const applied=budgetFor(budgets,month),agg=aggregate({...prep,residuals:[]},{from:month,to:month});
  const mine=prep.lines.filter(l=>l.month===month&&CONSUMPTION.has(l.kind)),hasData=mine.length>0,knownCount=mine.filter(l=>l.net!==null).length;
  // 자료 상태: 소비 줄이 없으면 NO_DATA(0원 아님), 순액 모름 줄만 있으면 UNKNOWN_ONLY. 화면은 실적 대신 "자료 없음"/"모름"을 보인다.
  const dataState=month>nowMonth?'FUTURE':!hasData?'NO_DATA':knownCount?'KNOWN':'UNKNOWN_ONLY';
  const actualTotal=agg.total.consumption,catActual=c=>agg.total.byCategory[c]?.total??0n;
  const out={month,days,elapsed,current,future:month>nowMonth,hasData,dataState,unknownRows:mine.length-knownCount,budgetId:applied?.id??null,effectiveFrom:applied?.data.effectiveFrom??null,
    total:applied&&applied.data.total!==null?line(applied.data.total,actualTotal,elapsed,days,current):null,actualTotal,categories:[],unbudgeted:[]};
  const budgeted=applied?Object.keys(applied.data.categories):[];
  for(const c of budgeted)out.categories.push({category:c,...line(applied.data.categories[c],catActual(c),elapsed,days,current)});
  for(const [c,v] of Object.entries(agg.total.byCategory))if(!budgeted.includes(c))out.unbudgeted.push({category:c,actual:v.total});
  out.unbudgeted.sort((a,b)=>bigSort(b.actual,a.actual));
  return out;
}
// 가로 막대: 예산(테두리)·실적(채움)·오늘까지 기대치(세로 표시). 실적이 예산을 넘으면 넘친 부분을 따로.
export function budgetBarsLayout(rows,{width,rowH=34,labelW=96}={}){
  const plotW=Math.max(40,width-labelW-12);let max=0n;
  for(const r of rows)for(const v of [r.budget,r.actual,r.projected??0n])if(v>max)max=v;
  const scale=v=>v<=0n||max===0n?0:Number(v)/Number(max)*plotW;
  return {width,height:rows.length*rowH+8,labelW,plotW,rows:rows.map((r,i)=>({...r,y:i*rowH+6,budgetW:r1(scale(r.budget)),actualW:r1(Math.min(scale(r.actual),scale(r.budget))),overW:r1(Math.max(0,scale(r.actual)-scale(r.budget))),expectedX:r1(labelW+scale(r.expectedToDate))}))};
}

// ---------- 평생 타임라인 + 누적 소비 ----------
// 달마다 소비, 자료 없는 달은 null(0원 아님). 누적은 자료 있는 달만 더하고, 사이에 자료 없는 달이 있으면 gap으로 표시.
export function lifeTimeline(prep,localDate){
  const present=new Set(dataMonths(prep,{from:null,to:null})),all=[...new Set(prep.lines.map(l=>l.month))].sort();
  if(!all.length)return {months:[],years:[],total:0n,residualTotal:0n,unknownRows:0,gapMonths:0};
  const to=localDate.slice(0,7)>all.at(-1)?localDate.slice(0,7):all.at(-1),months=monthSpan(all[0],to);
  const agg=aggregate({...prep,residuals:[]},{from:all[0],to});
  let cum=0n,gap=false,gapMonths=0;
  const unknownBy=new Map(),knownBy=new Set();
  for(const l of prep.lines)if(CONSUMPTION.has(l.kind)){if(l.net===null)unknownBy.set(l.month,(unknownBy.get(l.month)??0)+1);else knownBy.add(l.month);}
  const rows=months.map(m=>{
    const b=agg.months.get(m),has=present.has(m),unknownRows=unknownBy.get(m)??0;
    if(!has){gap=true;gapMonths++;return {month:m,hasData:false,consumption:null,cumulative:cum,unknownRows};}
    // 순액 모름 줄만 있는 달: 금액을 모르므로 누적에 더하지 않고 점선으로 잇는다(0원으로 그리지 않음).
    if(!knownBy.has(m)){gap=true;return {month:m,hasData:true,unknownOnly:true,consumption:null,cumulative:cum,unknownRows};}
    cum+=b.consumption;const r={month:m,hasData:true,consumption:b.consumption,cumulative:cum,afterGap:gap,unknownRows};gap=false;return r;
  });
  // 미배분 잔액만 있는 해(줄이 있는 기간 밖)도 해마다 표에 넣는다.
  const yearsSet=[...new Set([...months.map(m=>m.slice(0,4)),...prep.residuals.map(r=>r.chunk.slice(9))])].sort();
  const years=yearsSet.map(y=>{
    const ms=rows.filter(r=>r.month.startsWith(y)),res=prep.residuals.filter(r=>r.chunk.slice(9)===y);
    const yb=aggregate({...prep,residuals:[]},{from:y+'-01',to:y+'-12'});
    const known=ms.filter(r=>r.consumption!==null);
    return {year:y,consumption:known.length?known.reduce((s,r)=>s+r.consumption,0n):null,monthsWithData:ms.filter(r=>r.hasData).length,monthsNoData:ms.filter(r=>!r.hasData).length,
      prepaid:yb.total.prepaid,unknownRows:ms.reduce((s,r)=>s+r.unknownRows,0),residual:res.length?res.reduce((s,r)=>s+r.net,0n):null};
  });
  return {months:rows,years,total:cum,residualTotal:prep.residuals.reduce((s,r)=>s+r.net,0n),unknownRows:rows.reduce((s,r)=>s+r.unknownRows,0),gapMonths};
}
export function timelineLayout(tl,{width,height,padL=56,padR=56,padT=12,padB=28}={}){
  const plotW=Math.max(10,width-padL-padR),plotH=Math.max(10,height-padT-padB),n=Math.max(1,tl.months.length),slot=plotW/n,barW=Math.max(1,Math.min(14,slot*0.7));
  let maxBar=0n;for(const r of tl.months)if(r.consumption!==null&&r.consumption>maxBar)maxBar=r.consumption;
  const maxCum=tl.months.reduce((m,r)=>r.cumulative>m?r.cumulative:m,0n);
  const barTicks=niceTicks(maxBar,3),cumTicks=niceTicks(maxCum,3),bt=Number(barTicks.at(-1)),ct=Number(cumTicks.at(-1));
  const yb=v=>padT+plotH-Number(v>0n?v:0n)/bt*plotH,yc=v=>padT+plotH-Number(v>0n?v:0n)/ct*plotH;
  const bars=[],gaps=[],solid=[],dashed=[];let seg=[],prev=null;
  tl.months.forEach((r,i)=>{
    const cx=padL+slot*i+slot/2;
    if(!r.hasData||r.unknownOnly){gaps.push({x:r1(cx-barW/2),y:padT,w:r1(barW),h:plotH,month:r.month,unknownOnly:!!r.unknownOnly});return;}
    const top=yb(r.consumption);bars.push({x:r1(cx-barW/2),y:r1(top),w:r1(barW),h:Math.max(0.5,r1(padT+plotH-top)),month:r.month,value:r.consumption});
    const pt={x:r1(cx),y:r1(yc(r.cumulative)),month:r.month,value:r.cumulative};
    if(r.afterGap&&prev){if(seg.length)solid.push(seg);dashed.push([prev,pt]);seg=[pt];}else seg.push(pt);
    prev=pt;
  });
  if(seg.length)solid.push(seg);
  const years=[];tl.months.forEach((r,i)=>{if(i===0||r.month.endsWith('-01'))years.push({x:r1(padL+slot*i),text:r.month.slice(0,4)});});
  const residuals=tl.years.filter(y=>y.residual!==null).map(y=>({y,idx:tl.months.map(r=>r.month.slice(0,4)).lastIndexOf(y.year)})).filter(x=>x.idx>=0).map(({y,idx})=>({year:y.year,value:y.residual,x:r1(padL+slot*idx+slot/2)}));   // 기간 밖 해는 표에만
  return {width,height,padL,padR,padT,plotW,plotH,bars,gaps,solid,dashed,years,residuals,
    barTicks:barTicks.map(v=>({value:v,y:r1(yb(v))})),cumTicks:cumTicks.map(v=>({value:v,y:r1(yc(v))}))};
}

// ---------- F11 이번 달 금고 ----------
// 설계: docs/FIN01_F11_DESIGN.md. 새 엔티티·새 스키마 없음. 결과는 기존 FIN_BUDGET.total에만 저장한다.
// 금액은 모두 원 단위 정수 문자열이나 BigInt. null(모름)은 0이 아니다 — 빈칸이 하나라도 있으면 계산하지 않는다.

// 원 단위 정수 문자열 → BigInt. 빈칸·형식 오류는 null(모름). 0은 유효한 값이다.
export function vaultWon(text){
  const s=String(text??'').replace(/[\s,]/g,'');
  if(s==='')return null;
  return /^(0|[1-9]\d{0,13})$/.test(s)?BigInt(s):null;
}
// 소수 단위가 있는 재정 스냅샷 금액 → 원 단위 정수 문자열(원 아래는 버림 = 보수적). 음수·모름은 null.
export function vaultCashFromSnapshot(finance){
  if(!finance||finance.currency!=='KRW'||finance.totalLiquidCash===null||finance.totalLiquidCash===undefined)return null;
  const [whole]=String(finance.totalLiquidCash).split('.');
  return /^\d{1,14}$/.test(whole)?whole:null;
}
// 오늘 + n개월. 그 달에 없는 날짜(1/31 + 1개월)는 그 달 마지막 날로 당긴다.
export function vaultHorizon(today,months){
  const y=Number(today.slice(0,4)),m=Number(today.slice(5,7)),d=Number(today.slice(8,10));
  const total=(y*12+(m-1))+months,ny=Math.floor(total/12),nm=total%12+1;
  const last=new Date(Date.UTC(ny,nm,0)).getUTCDate();
  return ny+'-'+pad(nm)+'-'+pad(Math.min(d,last));
}
export const VAULT_MAX_MONTHS=120;
// months를 직접 받거나(MONTHS), 다음 수입 날짜까지로 잡는다.
// NEXT_INCOME은 그 날짜를 덮는 가장 작은 달력 개월 수다(올릴수록 월 사용액이 작아져 보수적).
export function vaultMonths({mode,months,untilDate,today}){
  if(mode==='NEXT_INCOME'){
    if(!untilDate||untilDate<=today)return null;
    for(let n=1;n<=VAULT_MAX_MONTHS;n++)if(vaultHorizon(today,n)>=untilDate)return n;
    return null;
  }
  const n=Number(months);
  return Number.isInteger(n)&&n>=1&&n<=VAULT_MAX_MONTHS?n:null;
}
// 금고 계산기. 빈칸은 모름 → 계산하지 않고 이유만 돌려준다(0으로 가정하지 않는다).
// cash·reserve: 원 단위 문자열 또는 null. fixedItems: [{key,label,monthly}] (monthly가 null이면 모름).
// incomes: [{date,amount}] — 오늘 ≤ 날짜 < 기간끝 인 것만 더한다.
// 재정 스냅샷의 부채 항목 중 이름에 "마이너스"가 들어간 항목이 정확히 하나일 때만 돌려준다(0개·여러 개는 null).
// 원화(KRW)만, 원 아래는 버린다(vaultCashFromSnapshot과 같은 규칙).
export function vaultOverdraftFromSnapshot(finances){
  const snap=finances?.[0]?.data;
  if(!snap||snap.currency!=='KRW'||!Array.isArray(snap.debts))return null;
  const hits=snap.debts.filter(d=>typeof d.label==='string'&&d.label.includes('마이너스'));
  if(hits.length!==1||hits[0].amount===null)return null;
  const [wholePart]=String(hits[0].amount).split('.');
  return /^\d{1,14}$/.test(wholePart)?{label:hits[0].label,amount:wholePart}:null;
}
// overdraft: {enabled,limit,drawn} — 마이너스통장. 체크 안 하면(enabled=false) 한도·쓴 금액 모두 0(모름 아님).
// 체크했는데 한도·쓴 금액 중 하나라도 빈칸이면 MISSING. 쓴 금액이 한도보다 크면(데이터가 맞지 않음) 다른 입력과 무관하게 NEGATIVE.
// cardUnpaid: 아직 안 나간 카드값(필수, 원 단위 문자열. "0" 허용). 빈칸이면 MISSING.
// F11E1: 순현금 = 유동 현금 − 마통 쓴 금액(체크 시) − 아직 안 나간 카드값. 마통 남은 한도(한도 − 쓴 금액)는 "빌릴 수 있는 돈"일
// 뿐 내 돈이 아니므로 합계에 더하지 않는다(overdraft.remaining에 정보로만 남긴다). 순현금이 0 이하여도 계산은 계속한다.
// 쓸 수 있는 돈 = 순현금 − 비상금 − 기간 고정비 + 확정 수입. 한 달 쓸 돈 = floor(쓸 수 있는 돈 ÷ 개월).
// 한도·쓴 금액·카드값은 저장하지 않는다(FIN_BUDGET.total만 저장).
export function vaultPlan({cash,reserve,mode='MONTHS',months=null,untilDate=null,fixedItems=[],incomes=[],overdraft=null,cardUnpaid,today}){
  const missing=[],c=vaultWon(cash),r=vaultWon(reserve),n=vaultMonths({mode,months,untilDate,today});
  if(c===null)missing.push('CASH');
  if(r===null)missing.push('RESERVE');
  if(n===null)missing.push(mode==='NEXT_INCOME'?'NEXT_INCOME_DATE':'MONTHS');
  const cu=vaultWon(cardUnpaid);
  if(cu===null)missing.push('CARD_UNPAID');
  let fixedMonthly=0n;
  for(const it of fixedItems){const v=typeof it.monthly==='bigint'?it.monthly:vaultWon(it.monthly);if(v===null)missing.push('FIXED:'+it.key);else fixedMonthly+=v;}
  let incomeTotal=0n;const counted=[],skipped=[];
  const horizon=n===null?null:mode==='NEXT_INCOME'?untilDate:vaultHorizon(today,n);
  for(const inc of incomes){
    const v=vaultWon(inc.amount);
    if(v===null||!inc.date){missing.push('INCOME:'+(inc.date??'?'));continue;}
    if(horizon!==null&&inc.date>=today&&inc.date<horizon){incomeTotal+=v;counted.push({...inc,won:v});}
    else if(horizon!==null)skipped.push({...inc,won:v});
  }
  const odOn=Boolean(overdraft?.enabled);
  let odLimit=0n,odDrawn=0n;
  if(odOn){
    const lim=vaultWon(overdraft.limit),drawn=vaultWon(overdraft.drawn);
    if(lim===null)missing.push('OVERDRAFT_LIMIT');else odLimit=lim;
    if(drawn===null)missing.push('OVERDRAFT_DRAWN');else odDrawn=drawn;
  }
  const base={mode,months:n,horizon,fixedMonthly,fixedTotal:n===null?null:fixedMonthly*BigInt(n),incomeTotal,countedIncomes:counted,skippedIncomes:skipped,
    cardUnpaid:cu??0n,overdraft:{enabled:odOn,limit:odLimit,drawn:odDrawn,remaining:odOn?odLimit-odDrawn:0n},missing:[...new Set(missing)]};
  if(base.missing.length)return {...base,status:'MISSING',reason:null,net:null,available:null,monthly:null,shortfall:null,steps:[]};
  // 쓴 금액 > 한도는 다른 숫자가 아무리 넉넉해도 입력이 맞지 않는 것이라, 순현금을 계산하기 전에 바로 거절한다.
  if(odOn&&odDrawn>odLimit)return {...base,status:'NEGATIVE',reason:'OVERDRAFT_EXCEEDED',net:null,available:null,monthly:null,shortfall:odDrawn-odLimit,steps:[]};
  const net=c-odDrawn-cu;   // 마통 남은 한도는 더하지 않는다 — 빌린 돈은 내 돈이 아니다.
  const available=net-r-base.fixedTotal+incomeTotal;
  const steps=[
    {key:'CASH',label:'지금 쓸 수 있는 현금',sign:'+',value:c},
    ...(odOn?[{key:'OVERDRAFT_DRAWN',label:'마이너스통장에서 쓴 금액',sign:'−',value:odDrawn}]:[]),
    {key:'CARD_UNPAID',label:'아직 안 나간 카드값',sign:'−',value:cu},
    {key:'NET',label:'순현금',sign:'=',value:net},
    {key:'RESERVE',label:'비상금 (손대지 않음)',sign:'−',value:r},
    // 금액 표시는 화면(app.mjs formatWon)이 한다. 여기서는 숫자만 담는다.
    {key:'FIXED',label:'기간 고정비',sign:'−',value:base.fixedTotal,note:{count:fixedItems.length,monthly:fixedMonthly,months:n}},
    {key:'INCOME',label:'기간 안 확정 수입',sign:'+',value:incomeTotal,note:{count:counted.length}},
    {key:'AVAILABLE',label:'기간 '+n+'개월 동안 쓸 수 있는 돈',sign:'=',value:available},
  ];
  if(available<=0n)return {...base,status:'NEGATIVE',reason:'AVAILABLE_NEGATIVE',net,available,monthly:null,shortfall:-available,steps};
  const monthly=available/BigInt(n);   // BigInt 나눗셈은 0 쪽으로 버림 = 양수에서 내림(보수적)
  return {...base,status:'OK',reason:null,net,available,monthly,shortfall:null,steps:[...steps,{key:'MONTHLY',label:'한 달 쓸 돈 = 위 금액 ÷ '+n+'개월 (원 아래 버림)',sign:'÷',value:monthly}]};
}

// F11E1: 재정 스냅샷의 원시 금액(소수 자릿수 0 또는 2)을 더해 원 아래를 버린 정수(BigInt)로 돌려준다.
// whole-life-model.mjs의 decimalUnits/decimalText와 같은 규칙이지만, fin-plan.mjs는 브라우저로 그대로 보내는 파일이라
// (storage-paths.mjs를 끌어오는) whole-life-model.mjs를 import하지 않고 이 안에서 따로 계산한다.
function sumDecimalWhole(amounts,digits){
  const scale=10n**BigInt(digits);
  let units=0n;
  for(const a of amounts){
    const [w,f='']=String(a).split('.');
    const frac=digits>0?BigInt((f+'0'.repeat(digits)).slice(0,digits)):0n;
    units+=BigInt(w)*scale+frac;
  }
  return units/scale;   // 모든 금액은 0 이상이므로 정수 나눗셈이 그대로 버림이다.
}
// arr이 null(모름)이면 null. filterFn이 있으면 그 항목만 추리고, 추린 항목 중 금액이 null인 것이 하나라도 있으면 null(모름).
function amountsOf(arr,filterFn){
  if(!Array.isArray(arr))return null;
  const hits=filterFn?arr.filter(filterFn):arr;
  if(hits.some(x=>x.amount===null))return null;
  return hits.map(x=>x.amount);
}
// 재정 스냅샷 예정 납부 중 이름에 "카드"가 들어간 항목의 합(아직 안 나간 카드값). 0개면 "0". 원화·앎일 때만, 원 아래는 버린다.
export function vaultCardUnpaidFromSnapshot(finances){
  const snap=finances?.[0]?.data;
  if(!snap||snap.currency!=='KRW')return null;
  const amts=amountsOf(snap.upcomingPayments,p=>typeof p.label==='string'&&p.label.includes('카드'));
  if(amts===null)return null;
  if(!amts.length)return '0';
  return String(sumDecimalWhole(amts,snap.minorUnitDigits??0));
}
// "지금 내 돈(추정)" — 홈·한눈에 금고 카드용. 재정 스냅샷의 순현금(유동 현금 − 마이너스통장 쓴 금액 − 아직 안 나간 카드값)에서
// 스냅샷 날짜 뒤 ~ 오늘까지의 소비·수입을 그대로 반영한다(이체·선불 전환은 소비·수입이 아니므로 무시). 결제일 이체(통장→카드)는
// 소비가 아니라서 여기도 건드리지 않는다 — 카드값은 "아직 안 나간" 상태로 스냅샷에 이미 반영돼 있고, 이체 자체는 지금 내 돈을 깎지 않는다.
export function liveNetCash(prep,finances,today){
  const snap=finances?.[0]?.data;
  if(!snap)return {status:'NO_SNAPSHOT',value:null,base:null,spentAfter:null,incomeAfter:null,since:null,reasons:[]};
  const reasons=[];
  if(snap.currency!=='KRW')reasons.push('CURRENCY');
  const cashAmts=amountsOf(snap.cashAccounts,null);
  if(cashAmts===null)reasons.push('CASH_UNKNOWN');
  const minusAmts=amountsOf(snap.debts,d=>typeof d.label==='string'&&d.label.includes('마이너스'));
  if(minusAmts===null)reasons.push('DEBTS_UNKNOWN');
  const cardAmts=amountsOf(snap.upcomingPayments,p=>typeof p.label==='string'&&p.label.includes('카드'));
  if(cardAmts===null)reasons.push('UPCOMING_UNKNOWN');
  const since=snap.snapshotDate;
  // F11E1B: 스냅샷 날짜 당일도 포함한다(since <= date, since < date가 아니다). 거래 기록에는 시각이 없어서
  // "스냅샷 뒤에 쓴 돈을 스냅샷 날짜로 적으면" date<since 기준으로는 영원히 반영되지 않는다 — 지금 내 돈이
  // 실제보다 많아 보이는 위험한 방향이었다. 당일을 포함하는 보수적인 방향으로 바꾼다. 대가: 스냅샷을 만들기
  // 전에 이미 그날 지출을 기록해 뒀다면 그 지출이 한 번 더 빠질 수 있다(적어 보이는 방향 — 허용).
  let spentAfter=0n,incomeAfter=0n,unknownLines=false;
  for(const l of prep.lines){
    if(l.date<since||l.date>today)continue;
    if(l.kind==='EXPENSE'||l.kind==='REFUND'){
      if(l.net===null){unknownLines=true;continue;}
      spentAfter+=l.net;   // REFUND는 net이 이미 음수라 더하면 그대로 차감된다(aggregate()의 consumption과 같은 규칙).
    }else if(l.kind==='INCOME'){
      if(l.net===null){unknownLines=true;continue;}
      incomeAfter+=l.net;
    }
    // TRANSFER·PREPAID_LOAD는 소비·수입이 아니므로 무시한다(카드 결제일 이체 포함).
  }
  if(unknownLines)reasons.push('UNKNOWN_LINES');
  if(reasons.length)return {status:'MISSING',value:null,base:null,spentAfter:null,incomeAfter:null,since,reasons};
  const digits=snap.minorUnitDigits??0;
  const base=sumDecimalWhole(cashAmts,digits)-sumDecimalWhole(minusAmts,digits)-sumDecimalWhole(cardAmts,digits);
  return {status:'OK',value:base-spentAfter+incomeAfter,base,spentAfter,incomeAfter,since,reasons:[]};
}

// 금괴 더미 배치. s = budgetStatus() 결과를 그대로 받는다(다시 집계하지 않는다).
// 한 개 = floor(예산 ÷ 그 달 날수). 자료 없음·순액 모름이면 spentCount는 null(0 아님).
export function vaultBricks(s){
  const days=s.days,T=s.total;
  if(!T||T.budget===null)return {state:'NO_BUDGET',days,perBrick:null,spentCount:null,overCount:0,bricks:[],overflow:[]};
  const perBrick=T.budget>0n?T.budget/BigInt(days):0n;
  const phase=day=>!s.current?(s.future?'FUTURE':'PAST'):day<s.elapsed?'PAST':day===s.elapsed?'TODAY':'FUTURE';
  const known=s.dataState==='KNOWN';
  const ceilDiv=(a,b)=>b<=0n?0:Number((a+b-1n)/b);
  const spentCount=!known?null:perBrick<=0n?(T.actual>0n?days:0):Math.min(days,Math.max(0,ceilDiv(T.actual,perBrick)));
  const overCount=!known||T.actual<=T.budget?0:perBrick<=0n?days:Math.min(days,ceilDiv(T.actual-T.budget,perBrick));
  const bricks=[];
  for(let day=1;day<=days;day++)bricks.push({day,phase:phase(day),spent:spentCount!==null&&day<=spentCount});
  return {state:!known?s.dataState:'OK',days,perBrick,spentCount,overCount,bricks,
    overflow:Array.from({length:overCount},(_,i)=>({index:i+1}))};
}
// 금괴 더미 좌표(SVG). 한 줄에 cols개씩.
export function vaultBrickLayout(v,{width,cols=null,gap=3,ratio=0.62}={}){
  const n=v.days+v.overCount;
  const c=cols??Math.min(n,Math.max(7,Math.floor((width+gap)/16)));
  const w=Math.max(6,(width-gap*(c-1))/c),h=Math.max(5,w*ratio),rows=Math.ceil(n/c);
  const place=i=>({x:r1((i%c)*(w+gap)),y:r1(Math.floor(i/c)*(h+gap)),w:r1(w),h:r1(h)});
  return {width,height:r1(rows*(h+gap)-gap),cols:c,bw:r1(w),bh:r1(h),
    bricks:v.bricks.map((b,i)=>({...b,...place(i)})),
    overflow:v.overflow.map((o,i)=>({...o,...place(v.days+i)}))};
}

// 빠른 지출 입력 후보: 최근 days일 안에서 빈도순 분류, 최근 가맹점, 마지막 사용 계정.
export function quickPicks(prep,today,{days=30,categories=6,merchants=10}={}){
  const from=new Date(Date.parse(today+'T12:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
  const recent=prep.lines.filter(l=>l.kind==='EXPENSE'&&l.date>=from&&l.date<=today);
  const catCount=new Map();
  for(const l of recent)if(l.category)catCount.set(l.category,(catCount.get(l.category)??0)+1);
  const top=[...catCount.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,categories).map(([category,count])=>({category,count}));
  const seen=new Map();
  // shownMerchant()/isSensitive()가 읽는 항목을 그대로 담는다(가리기 판단에 필요).
  for(const l of [...prep.lines].reverse())if(l.kind==='EXPENSE'&&l.merchant&&!seen.has(l.merchant)&&seen.size<merchants)
    seen.set(l.merchant,{merchant:l.merchant,date:l.date,kind:l.kind,category:l.category,subcategory:l.subcategory,baseSubcategory:l.baseSubcategory,tags:l.tags??[]});
  const own=[...prep.lines].reverse().find(l=>l.source==='TXN'&&l.kind==='EXPENSE');
  return {from,to:today,categories:top,merchants:[...seen.values()],
    lastAccountId:own?.accountId??null,lastCategory:own?.category??null,sampled:recent.length};
}

// 이번 달 해석(규칙 기반). 값과 비교만 보인다 — 단정·추천 문장을 만들지 않는다.
// 분류별 소비를 달 1일부터 maxDay까지만 더한다. maxDay가 null이면 그 달 전체.
// aggregate()의 byCategory와 같은 기준(소비 = 지출 − 환불, 순액 모름 줄은 뺀다).
function catTotalsUpTo(prep,month,maxDay){
  const out=new Map();
  for(const l of prep.lines){
    if(l.month!==month||!CONSUMPTION.has(l.kind)||l.net===null)continue;
    if(maxDay!==null&&Number(l.date.slice(8,10))>maxDay)continue;
    out.set(l.category,(out.get(l.category)??0n)+l.net);
  }
  return out;
}
export function monthInsight(prep,s,recurring,{months=3}={}){
  const month=s.month,prior=[];
  for(let k=1;k<=months;k++)prior.push(shiftMonth(month,-k));
  const known=s.dataState==='KNOWN';
  const withData=prior.filter(m=>prep.lines.some(l=>l.month===m&&CONSUMPTION.has(l.kind)&&l.net!==null));
  // 이번 달은 "같은 날짜까지" 비교한다: 이번 달 1일~오늘 vs 지난 각 달 1일~같은 일자(그 달 날수보다 크면 말일까지).
  // 월 합계끼리 비교하면 매달 같은 날 나가는 고정비가 달 초에 급증으로 보인다. 끝난 달·미래 달은 월 합계 그대로.
  const toDate=s.current&&s.elapsed>0;
  const cutoff=m=>toDate?Math.min(s.elapsed,daysIn(m)):null;
  const cats=[];
  if(known&&withData.length){
    const cur=catTotalsUpTo(prep,month,toDate?s.elapsed:null);
    const past=withData.map(m=>catTotalsUpTo(prep,m,cutoff(m)));
    for(const [c,pace] of cur){
      const avg=past.reduce((a,t)=>a+(t.get(c)??0n),0n)/BigInt(past.length);
      if(avg<=0n||pace<=avg)continue;
      cats.push({category:c,average:avg,pace,delta:pace-avg,permille:roundDiv((pace-avg)*1000n,avg)});
    }
    cats.sort((a,b)=>bigSort(b.delta,a.delta));
  }
  const split=recurring?costSplit(prep,{from:month,to:month},recurring,s.month+'-01'):null;
  const row=split?.months.find(m=>m.month===month)??null;
  const fixed=row&&row.fixed!==null?row.fixed:null,variable=row&&row.variable!==null?row.variable:null;
  const spendTotal=fixed===null||variable===null?null:fixed+variable;
  return {month,known,comparedMonths:[...withData],
    comparison:toDate?'TO_DATE':'MONTH_TOTAL',comparedThroughDay:toDate?s.elapsed:null,
    risingCategories:cats.slice(0,3),
    fixed,variable,fixedPermille:spendTotal!==null&&spendTotal>0n?roundDiv(fixed*1000n,spendTotal):null,
    perDay:known&&s.elapsed>0?s.actualTotal/BigInt(s.elapsed):null,
    projected:s.total?.projected??null,   // 월말 예상은 기존 budgetStatus 값 그대로
    budget:s.total?.budget??null};
}
