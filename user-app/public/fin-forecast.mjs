// 이번 달 금고 확장 (B59, V3 §8): 금괴 녹음 단계, "이대로면 월말" 예측, 가계부 비서 보고 카드. 앱 안 계산이고 AI를 부르지 않는다.
// 규칙: 금액은 BigInt, 모름은 0이 아니다(자료 없음·순액 모름이면 예측하지 않는다). 시계·저장소·외부 통신·innerHTML 없음. 화면 요소는 부른 쪽이 넘긴 h로만 만든다.
// 가게 이름·규칙 이름은 예측 결과와 경고 문구에 넣지 않는다(개수와 합계만). 무엇을 해야 하는지 정하는 문장을 만들지 않는다.
import {formatWon} from './fin-ledger.mjs';
import {roundDiv} from './fin-charts.mjs';
import {recurringKey,ruleStatus,within,wonOf} from './fin-recurring.mjs';
import {latestByAssistant,reportNodes,reportResultText} from './ai-gate.mjs';

const pad=n=>String(n).padStart(2,'0');

// ---------- 금괴 녹음 단계 ----------
// s = budgetStatus() 결과를 그대로 받는다(다시 집계하지 않는다). 남은 비율 = 남은 돈 ÷ 예산. 자료 없음·순액 모름·예산 없음이면 null(그리지 않는다).
export const MELT_STAGES=Object.freeze([
  Object.freeze({key:'FULL',label:'단단함',minPct:75n,drips:0,wave:0}),
  Object.freeze({key:'SOFT',label:'녹기 시작',minPct:50n,drips:1,wave:1.2}),
  Object.freeze({key:'MELT',label:'녹는 중',minPct:25n,drips:2,wave:2.4}),
  Object.freeze({key:'DRIP',label:'거의 녹음',minPct:0n,drips:3,wave:3.2}),
]);
const MELT_GONE=Object.freeze({key:'GONE',label:'다 녹음',minPct:null,drips:0,wave:0});
const permilleOf=(left,budget)=>left<=0n?0:left>=budget?1000:Number(left*1000n/budget);
export function meltStage(s){
  const T=s?.total;
  if(!T||s.dataState!=='KNOWN')return null;
  if(T.budget<=0n||T.remaining<=0n)return {...MELT_GONE,permille:0};
  const hit=MELT_STAGES.find(m=>T.remaining*100n>=T.budget*m.minPct);   // 곱셈으로 비교해 경계에서 버림 오차가 없다. 남은 돈이 1원이라도 있으면 GONE이 아니다.
  return {...hit,permille:permilleOf(T.remaining,T.budget)};
}
// 방금 쓴 돈(won)까지 더한 비율. 녹아 사라지는 조각의 높이에만 쓴다. 예산을 넘겨 쓴 뒤라도 더한 값이 0 이하면 조각이 없다.
export function meltFrom(s,won){
  const T=s?.total;
  if(!T||typeof won!=='bigint'||won<=0n||T.budget<=0n)return null;
  return permilleOf(T.remaining+won,T.budget);
}
const fix=v=>+v.toFixed(1);
// 금괴 좌표(SVG). 비율만큼 높이가 줄고, 단계가 올라갈수록 윗면이 일렁이며, 웅덩이가 넓어진다. fromPermille이 지금보다 크면 그 차이만큼 조각을 얹는다.
export function meltLayout(stage,{width=320,height=92,fromPermille=null}={}){
  const base=height-14,fullH=height-26,W=Math.min(width*0.5,180),x0=(width-W)/2,ratio=stage.permille/1000;
  const hOf=r=>Math.max(3,fullH*r),insetOf=h=>W*0.11*(h/fullH);   // 1원이라도 남으면(비율이 0으로 버려져도) 금괴가 보인다
  const h=stage.key==='GONE'?0:hOf(ratio),top=base-h,inset=insetOf(h),L=x0+inset,R=x0+W-inset;
  let ingot=null;
  if(h>0){
    const w=stage.wave,mid=(L+R)/2,q=(R-L)/4;
    ingot='M'+fix(x0)+' '+base+' L'+fix(L)+' '+fix(top)+(w?' Q'+fix(L+q)+' '+fix(top-w)+' '+fix(mid)+' '+fix(top)+' Q'+fix(mid+q)+' '+fix(top+w)+' '+fix(R)+' '+fix(top):' L'+fix(R)+' '+fix(top))+' L'+fix(x0+W)+' '+base+' Z';
  }
  const puddle=stage.key==='FULL'?null:{cx:fix(width/2),cy:base+1,rx:fix(Math.min(width/2-2,W*0.5*(0.62+0.8*(1-ratio)))),ry:fix(2.5+5*(1-ratio))};
  const short=h<20;   // 금괴가 낮으면 방울도 낮은 데서 짧게 떨어진다(금괴 위 공중에 뜨지 않게)
  const drips=[0.24,0.72,0.48].slice(0,stage.drips).map((f,i)=>({cx:fix(x0+W*f),cy:short?base-2:base-13,r:2.4,cls:'d'+(i+1)+(short?' short':'')}));
  let chunk=null;
  if(fromPermille!==null&&fromPermille>stage.permille){
    const hOld=hOf(fromPermille/1000),inOld=insetOf(hOld);
    chunk={x:fix(x0+inOld),y:fix(base-hOld),width:fix(W-2*inOld),height:fix(hOld-h)};
  }
  return {width,height,base,top:fix(top),ingot,puddle,drips,chunk,shine:h>10?{x1:fix(L+W*0.08),y1:fix(top+4),x2:fix(L+W*0.3),y2:fix(top+4)}:null};
}
export const meltCaption=stage=>'남은 예산 '+(stage.key!=='GONE'&&stage.permille<10?'1% 미만':Math.floor(stage.permille/10)+'%')+' · '+stage.label;
// h={el,add,svgEl,svgRoot}. 그릴 수 없으면(자료 없음·모름·예산 없음) null.
export function meltNode(h,s,{justSpent=null}={}){
  const stage=meltStage(s);
  if(!stage)return null;
  const L=meltLayout(stage,{fromPermille:meltFrom(s,justSpent)}),cap=meltCaption(stage),svg=h.svgRoot(L.width,L.height,'이번 달 금괴 · '+cap);
  if(L.puddle)svg.append(h.svgEl('ellipse',L.puddle,'vault-melt-puddle'));
  if(L.ingot)svg.append(h.svgEl('path',{d:L.ingot},'vault-melt-ingot'));
  if(L.shine)svg.append(h.svgEl('line',L.shine,'vault-melt-shine'));
  if(L.chunk)svg.append(h.svgEl('rect',{...L.chunk,rx:1.5},'vault-melt-chunk'));
  for(const d of L.drips)svg.append(h.svgEl('circle',{cx:d.cx,cy:d.cy,r:d.r},'vault-melt-drip '+d.cls));
  const n=h.add(h.el('div',null,'vault-melt'),svg,h.el('p',cap,'vault-melt-cap'));
  n.setAttribute('data-stage',stage.key);
  return n;
}

// ---------- 정기 결제 예정 ----------
// B48 규칙에는 결제일 칸이 없다. 예정일 = 규칙 금액대에 맞는 가장 최근 결제의 "일"(그 달 말일을 넘지 않는다). 그런 결제가 없으면 예정일 모름(null).
export function fixedDue(lastDate,month,days){
  if(typeof lastDate!=='string')return null;
  return month+'-'+pad(Math.min(Number(lastDate.slice(8,10)),days));
}
// 이번 달 정기 결제를 셋으로 나눈다(숨긴 규칙은 B48 합계와 같이 뺀다).
// paid: 이번 달 기록이 있는 규칙의 실제 금액(이미 쓴 돈에 들어 있으므로 일평균에서 뺀다). 금액 다름이면 그 가게의 이번 달 지출 전부.
// upcoming: 기록이 없고 예정일이 오늘 이후(오늘 포함)이거나 예정일을 모르는 규칙의 금액. overdue: 기록이 없고 예정일이 지난 규칙의 금액.
export function fixedPlan(rules,lines,today,days){
  const month=today.slice(0,7),byKey=new Map();
  for(const l of lines){
    if(l.kind!=='EXPENSE')continue;
    const key=recurringKey(l.merchant);if(!key)continue;
    if(!byKey.has(key))byKey.set(key,[]);
    byKey.get(key).push(l);
  }
  const out={paid:0n,paidCount:0,upcoming:0n,upcomingCount:0,overdue:0n,overdueCount:0,undatedCount:0},list=Array.isArray(rules)?rules:[];
  // R31B: 같은 가맹점에 규칙이 둘 이상이면(B48C) 다른 규칙 금액대의 결제는 이 규칙의 "금액 다름"으로도, 이 규칙이 낸 돈으로도 세지 않는다(두 번 더하지 않음).
  const sibling=(r,a)=>list.some(o=>o!==r&&o.id!==r.id&&o.match.merchant===r.match.merchant&&within(a,BigInt(o.match.amount),o.match.tolerancePct));
  for(const r of list){
    if(r.hidden)continue;
    const mine=byKey.get(r.match.merchant)??[],st=ruleStatus(r,mine,today,list),amount=BigInt(r.match.amount);
    if(st.state==='PENDING'){
      const due=fixedDue(st.lastDate,month,days);
      if(due!==null&&due<today){out.overdue+=amount;out.overdueCount++;}
      else{out.upcoming+=amount;out.upcomingCount++;if(due===null)out.undatedCount++;}
      continue;
    }
    for(const l of mine){
      if(typeof l.date!=='string'||l.date.slice(0,7)!==month||l.date>today)continue;
      const a=wonOf(l.net);
      if(a!==null&&(within(a,amount,r.match.tolerancePct)||(st.state==='DIFFERENT'&&!sibling(r,a))))out.paid+=a;
    }
    out.paidCount++;
  }
  return out;
}

// ---------- 이대로면 월말 ----------
export const FORECAST_LEVEL=Object.freeze({ROOM:'여유',TIGHT:'빠듯',OVER:'초과 예상'});
export const TIGHT_PCT=10n,EARLY_DAYS=7;
// 남는 돈이 예산의 10% 이하면 빠듯(경계 포함), 음수면 초과 예상, 그 밖은 여유.
export function forecastLevel(left,budget){return left<0n?'OVER':left*100n<=budget*TIGHT_PCT?'TIGHT':'ROOM';}
// status = budgetStatus() 결과(이번 달). lines = prepare(fin).lines. 월말 예상 지출 = 이미 나간 정기 결제 + 변동 지출을 일평균으로 늘린 값 + 아직 안 나간 정기 결제.
// state: OK(예산 있음) / NO_BUDGET(예상 지출만) / NO_DATA·UNKNOWN_ONLY(계산 안 함, 0원 아님) / NOT_CURRENT(이번 달이 아님).
export function monthForecast({status:s,lines,rules=[],today}){
  const empty={month:s.month,days:s.days,elapsed:s.elapsed,daysLeft:s.days-s.elapsed,unknownRows:s.unknownRows,budget:null,spent:null,variable:null,perDay:null,projectedVariable:null,fixed:null,projected:null,left:null,level:null,early:false};
  if(!s.current||s.elapsed<1)return {...empty,state:'NOT_CURRENT'};
  if(s.dataState!=='KNOWN')return {...empty,state:s.dataState};
  const fixed=fixedPlan(rules,lines,today,s.days),spent=s.actualTotal,raw=spent-fixed.paid,variable=raw>0n?raw:0n;   // 환불이 더 크면 일평균은 0이다
  const elapsed=BigInt(s.elapsed),perDay=roundDiv(variable,elapsed),projectedVariable=roundDiv(variable*BigInt(s.days),elapsed);
  const projected=fixed.paid+projectedVariable+fixed.upcoming+fixed.overdue,budget=s.total?s.total.budget:null,left=budget===null?null:budget-projected;
  return {...empty,state:budget===null?'NO_BUDGET':'OK',budget,spent,variable,perDay,projectedVariable,fixed,projected,left,level:budget===null?null:forecastLevel(left,budget),early:s.elapsed<EARLY_DAYS};
}
// 경고 문구. 입력은 숫자뿐이라 가게 이름이 들어갈 수 없다.
export function forecastText(f){
  if(f.state!=='OK'&&f.state!=='NO_BUDGET')return null;
  const message=f.state==='NO_BUDGET'?'이대로면 이번 달 지출은 '+formatWon(f.projected)+'입니다. 예산을 정하면 남는 돈도 계산합니다.'
    :f.level==='OVER'?'이대로면 월말에 '+formatWon(-f.left)+' 모자랍니다.'
    :f.left===0n?'이대로면 월말에 남는 돈이 없습니다.'
    :f.level==='TIGHT'?'이대로면 월말에 '+formatWon(f.left)+'만 남습니다.'
    :'이대로면 월말에 '+formatWon(f.left)+' 남습니다.';
  const fx=f.fixed,fixedCount=fx.paidCount+fx.upcomingCount+fx.overdueCount,notes=[];
  notes.push('월말 예상 지출 '+formatWon(f.projected)+' · 하루 '+formatWon(f.perDay)+' 속도로 '+formatWon(f.projectedVariable)+(fixedCount?' + 정기 결제 '+formatWon(fx.paid+fx.upcoming+fx.overdue):''));
  if(fx.upcomingCount)notes.push('아직 안 나간 정기 결제 '+fx.upcomingCount+'건 '+formatWon(fx.upcoming)+'을 더했습니다.');
  if(fx.overdueCount)notes.push('예정일이 지났는데 기록이 없는 정기 결제 '+fx.overdueCount+'건 '+formatWon(fx.overdue)+'도 나갈 돈으로 더했습니다.');
  if(f.early)notes.push('이번 달 '+f.elapsed+'일치 기록으로 계산해 크게 달라질 수 있습니다.');
  if(f.unknownRows)notes.push('순액 모름 '+f.unknownRows+'행은 넣지 않았습니다.');
  return {message,notes};
}
export function forecastNode(h,f){
  const t=forecastText(f);
  if(!t)return null;
  const n=h.add(h.el('div',null,'vault-forecast'),
    h.add(h.el('div',null,'vault-forecast-head'),h.el('strong','이대로면 월말'),f.level?h.el('span',FORECAST_LEVEL[f.level],'vault-forecast-tag'):null),
    h.el('p',t.message,'vault-forecast-msg'),...t.notes.map(x=>h.el('p',x,'muted small')));
  n.setAttribute('role','status');n.setAttribute('data-level',f.level??'NONE');
  return n;
}

// ---------- 가계부 비서 보고 카드 ----------
// 사령부가 남긴 *_budget.md 또는 *_audit.md 중 최신 1장. 같은 날이면 가계부 비서(_budget)를 먼저.
const BUDGET_REPORT=/_(budget|audit)\.md$/;
export function latestBudgetReport(reports){
  const list=latestByAssistant((Array.isArray(reports)?reports:[]).filter(r=>typeof r?.name==='string'&&BUDGET_REPORT.test(r.name)));
  if(!list.length)return null;
  return list.find(r=>r.date===list[0].date&&r.name.endsWith('_budget.md'))??list[0];
}
// ctx={h:{el,add},surface,request(body)=>Promise,gone()=>bool}. PC 앱에서만 읽고, 없거나 목록을 못 읽으면 카드 없음. ready는 절대 거부되지 않는다. 글은 reportNodes로 textContent만.
export function renderBudgetReport(root,ctx){
  const {h}=ctx,gone=ctx.gone??(()=>false);
  if(ctx.surface!=='APP_SHELL')return {slot:null,ready:Promise.resolve()};
  const slot=h.el('div',null,'fin-budget-report');
  h.add(root,slot);
  const load=async()=>{
    let r;
    try{const list=await ctx.request({});if(gone())return;r=latestBudgetReport(list?.reports);}catch{return;}
    if(!r)return;
    const card=h.add(h.el('section',null,'panel'),h.add(h.el('div',null,'ai-gate-head'),h.el('h2','가계부 비서','panel-title'),h.el('small',r.date)),h.el('p','사령부 비서가 남긴 보고입니다. 앱 계산이 아니고, 이 PC의 파일을 읽기만 합니다.','muted small'));
    if(r.tooLarge===true)h.add(card,h.el('p',reportResultText('REPORT_TOO_LARGE'),'muted'));
    else{
      try{
        const res=await ctx.request({name:r.name});if(gone())return;
        const nodes=reportNodes(h,res?.text);if(!nodes.length)return;
        h.add(card,h.add(h.el('div',null,'ai-gate-text'),...nodes));
      }catch(e){if(gone())return;h.add(card,h.el('p',reportResultText(e?.code),'muted'));}
    }
    slot.replaceChildren(card);
  };
  return {slot,ready:load()};
}
