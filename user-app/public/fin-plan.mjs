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
