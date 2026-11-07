// 이번 달 금고 확장 (B59, V3 §8): 금괴 녹음 단계, "이대로면 월말" 예측, 가계부 비서 보고 카드. 앱 안 계산이고 AI를 부르지 않는다.
// 규칙: 금액은 BigInt, 모름은 0이 아니다(자료 없음·순액 모름이면 예측하지 않는다). 시계·저장소·외부 통신·innerHTML 없음. 화면 요소는 부른 쪽이 넘긴 h로만 만든다.
// 가게 이름·규칙 이름은 예측 결과와 경고 문구에 넣지 않는다(개수와 합계만). 무엇을 해야 하는지 정하는 문장을 만들지 않는다.
import {formatWon,shiftMonth} from './fin-ledger.mjs';
import {roundDiv} from './fin-charts.mjs';
import {recurringKey,ruleStatus,dueDay,lineKind,wonOf,canSetAmount} from './fin-recurring.mjs';
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
// M1B: due(아직 안 나간 고정비)를 넘기면 단계·비율은 "남은 돈 − due"로 정해 칩·진단 카드와 기준을 맞추고, 빼기 전 비율과의 차이를 reservedPermille로 함께 돌려준다. due가 없거나 0이면 결과는 예전과 같다.
export function meltStage(s,{due=null}={}){
  const T=s?.total;
  if(!T||s.dataState!=='KNOWN')return null;
  const held=typeof due==='bigint'&&due>0n&&T.budget>0n&&T.remaining>0n,left=held?T.remaining-due:T.remaining;
  if(T.budget<=0n||left<=0n)return held?{...MELT_GONE,permille:0,reservedPermille:Math.max(1,permilleOf(T.remaining,T.budget))}:{...MELT_GONE,permille:0};
  const hit=MELT_STAGES.find(m=>left*100n>=T.budget*m.minPct),permille=permilleOf(left,T.budget);   // 곱셈으로 비교해 경계에서 버림 오차가 없다. 남은 돈이 1원이라도 있으면 GONE이 아니다.
  return held?{...hit,permille,reservedPermille:permilleOf(T.remaining,T.budget)-permille}:{...hit,permille};
}
// 방금 쓴 돈(won)까지 더한 비율. 녹아 사라지는 조각의 높이에만 쓴다. 예산을 넘겨 쓴 뒤라도 더한 값이 0 이하면 조각이 없다.
export function meltFrom(s,won){
  const T=s?.total;
  if(!T||typeof won!=='bigint'||won<=0n||T.budget<=0n)return null;
  return permilleOf(T.remaining+won,T.budget);
}
const fix=v=>+v.toFixed(1);
// 금괴 좌표(SVG). 비율만큼 높이가 줄고, 단계가 올라갈수록 윗면이 일렁이며, 웅덩이가 넓어진다. fromPermille이 지금보다 크면 그 차이만큼 조각을 얹는다.
// M1B: reservedPermille이 있으면 금괴 전체 높이는 고정비를 빼기 전 비율이고, 그 윗부분(곧 나갈 고정비)을 reserved 경로로 덮는다. 없으면 좌표는 예전과 같다.
export function meltLayout(stage,{width=320,height=92,fromPermille=null,reservedPermille=null}={}){
  const base=height-14,fullH=height-26,W=Math.min(width*0.5,180),x0=(width-W)/2,ratio=stage.permille/1000,held=reservedPermille>0?reservedPermille:0;
  const hOf=r=>Math.max(3,fullH*r),insetOf=h=>W*0.11*(h/fullH);   // 1원이라도 남으면(비율이 0으로 버려져도) 금괴가 보인다
  const solid=stage.key==='GONE'?0:hOf(ratio),h=held?hOf((stage.permille+held)/1000):solid,top=base-h,inset=insetOf(h),L=x0+inset,R=x0+W-inset;
  let ingot=null,reserved=null;
  if(h>0){
    const w=stage.wave,mid=(L+R)/2,q=(R-L)/4,surface=w?' Q'+fix(L+q)+' '+fix(top-w)+' '+fix(mid)+' '+fix(top)+' Q'+fix(mid+q)+' '+fix(top+w)+' '+fix(R)+' '+fix(top):' L'+fix(R)+' '+fix(top);
    ingot='M'+fix(x0)+' '+base+' L'+fix(L)+' '+fix(top)+surface+' L'+fix(x0+W)+' '+base+' Z';
    if(held&&h>solid){const y=base-solid,side=insetOf(solid);reserved={d:'M'+fix(x0+side)+' '+fix(y)+' L'+fix(L)+' '+fix(top)+surface+' L'+fix(x0+W-side)+' '+fix(y)+' Z',top:fix(top),bottom:fix(y)};}
  }
  const puddle=stage.key==='FULL'?null:{cx:fix(width/2),cy:base+1,rx:fix(Math.min(width/2-2,W*0.5*(0.62+0.8*(1-ratio)))),ry:fix(2.5+5*(1-ratio))};
  const short=h<20;   // 금괴가 낮으면 방울도 낮은 데서 짧게 떨어진다(금괴 위 공중에 뜨지 않게)
  const drips=[0.24,0.72,0.48].slice(0,stage.drips).map((f,i)=>({cx:fix(x0+W*f),cy:short?base-2:base-13,r:2.4,cls:'d'+(i+1)+(short?' short':'')}));
  let chunk=null;
  if(fromPermille!==null&&fromPermille>stage.permille+held){
    const hOld=hOf(fromPermille/1000),inOld=insetOf(hOld);
    chunk={x:fix(x0+inOld),y:fix(base-hOld),width:fix(W-2*inOld),height:fix(hOld-h)};
  }
  return {width,height,base,top:fix(top),ingot,reserved,puddle,drips,chunk,shine:h>10&&!reserved?{x1:fix(L+W*0.08),y1:fix(top+4),x2:fix(L+W*0.3),y2:fix(top+4)}:null};
}
export const meltCaption=stage=>(stage.reservedPermille>0?'고정비 예정 뺀 남은 예산 ':'남은 예산 ')+(stage.key!=='GONE'&&stage.permille<10?'1% 미만':Math.floor(stage.permille/10)+'%')+' · '+stage.label+(stage.reservedPermille>0?' · 빗금은 곧 나갈 고정비':'');
const HATCH_ID='vault-melt-hatch';
// 빗금은 SVG 패턴으로 그린다(인라인 style 없음, fill 속성만). 금괴는 한 화면에 하나다.
function hatchDefs(h){
  const p=h.svgEl('pattern',{id:HATCH_ID,patternUnits:'userSpaceOnUse',width:6,height:6,patternTransform:'rotate(45)'});
  p.append(h.svgEl('rect',{width:6,height:6},'vault-melt-hatch-bg'),h.svgEl('line',{x1:0,y1:0,x2:0,y2:6},'vault-melt-hatch-line'));
  const d=h.svgEl('defs');d.append(p);
  return d;
}
// h={el,add,svgEl,svgRoot}. 그릴 수 없으면(자료 없음·모름·예산 없음) null. due = 아직 안 나간 고정비(M1B, 없으면 예전 모양).
export function meltNode(h,s,{justSpent=null,due=null}={}){
  const stage=meltStage(s,{due});
  if(!stage)return null;
  const L=meltLayout(stage,{fromPermille:meltFrom(s,justSpent),reservedPermille:stage.reservedPermille??null}),cap=meltCaption(stage),svg=h.svgRoot(L.width,L.height,'이번 달 금괴 · '+cap);
  if(L.puddle)svg.append(h.svgEl('ellipse',L.puddle,'vault-melt-puddle'));
  if(L.ingot)svg.append(h.svgEl('path',{d:L.ingot},'vault-melt-ingot'));
  if(L.reserved)svg.append(hatchDefs(h),h.svgEl('path',{d:L.reserved.d,fill:'url(#'+HATCH_ID+')'},'vault-melt-reserved'));
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
// F59V: 이번 달 정기 결제를 규칙마다 한 줄로 투영한다(기록을 만들지 않는다, 숨긴 규칙은 B48 합계와 같이 뺀다).
// 가계부·예산 화면의 "예정" 목록과 fixedPlan(월말 예측·금고 줄)이 이 목록 하나에서 나오므로 숫자가 서로 어긋나지 않는다.
// state: PLANNED(기록 없음, 예정일이 오늘 이후·오늘이거나 모름) / OVERDUE(기록 없음, 예정일 지남) / PAID(이번 달 결제 있음) / DIFFERENT(이번 달 금액 다름).
// due = 예정일(PLANNED·OVERDUE, 모르면 null). paidDate = 이번 달 마지막 결제일(PAID·DIFFERENT). provisional = 규칙 금액(잠정). actual = 이번 달 이 규칙에 배정된 결제의 합(PAID·DIFFERENT만, 아래 R32 배정 규칙). 실제가 들어오면 잠정은 더하지 않는다(이중 계산 0).
// changed = 실제 ≠ 잠정이면 {from,to}. suggest = "다음 달 잠정도 이 금액으로" 1탭에 쓸 금액(원 단위 문자열): PAID는 결제가 1건일 때 그 금액, DIFFERENT는 B48C 가격 변경 규칙(지난 결제 있음, 절반~두 배)대로 마지막 금액 다름 결제의 금액. 없으면 null.
// blocked = suggest 금액이 같은 가맹점 형제 규칙과 금액대가 겹쳐 setRuleAmount가 받지 않으면 true(R33B, 화면은 1탭 대신 이유). 아니면 false.
// R32 (HUNT31 D3·D4): 이번 달 결제 줄 하나는 규칙 하나에만 배정한다(두 번 더하지 않음). 판정은 ruleStatus와 같은 lineKind:
//  1) 자기 금액대의 구독 결제('PAID': 금액대 안 + 예정일 ±3일, 또는 첫 2회의 정확히 같은 금액. FIX39)인 규칙이 있으면 그중 하나(규칙 금액이 가장 가까운 것, 같으면 목록 앞).
//  2) 없으면 "금액 다름"('OTHER')으로 보는 규칙 중 이번 달 상태가 금액 다름인 규칙 하나(같은 기준으로 고른다).
//  3) 어느 규칙에도 안 맞는 줄(예정일 밖 같은 가게 일반 구매, 어느 금액대에도 없는 결제)은 배정하지 않는다 → 변동 지출에 남아 일평균으로 늘어난다.
// 기록이 없는 규칙과, 금액 다름 결제가 모두 다른 규칙에 배정돼 자기 몫이 0건인 규칙은 아직 안 나간 돈(PLANNED/OVERDUE, 잠정)으로 둔다.
// FIX36 (HUNT35 H8·F13): 예정일은 평소 결제일(dueDay, PC 알림과 같은 함수)이 먼저이고, 그것을 모를 때만 마지막 결제일이다. 예정일 ±3일 안의 결제가 있는 달에는 예정일 밖의 같은 금액 결제를 배정하지 않는다(구독은 한 달에 한 번, 나머지는 변동 지출).
// FIX36 (HUNT36 M6): state PREPAID = 지난달 마지막 며칠에 이번 달 몫을 미리 냄(paidDate = 그 날짜). 그 돈은 지난달 지출이라 이번 달 낸 돈(actual)에도 예정에도 더하지 않는다.
// FIX39B (통제탑 C): state CHECK = 규칙 금액과 정확히 같은 결제가 예정일 밖에만 있음(due = 예정일, paidDate = 그 날짜). 그 결제 하나를 고정비로 한 번만 센다(actual = 규칙 금액, 여러 건이면 마지막 결제일, 나머지는 변동 지출). 예정·연체로 더하지 않는다.
// FIX41 (HUNT40 D1): 앞달 몫인 늦은 결제(lineKind 'LATE')는 이번 달 몫(got)에 배정하지 않고 late(합, 있을 때만 칸이 있다)에 둔다. 이번 달 예정은 그대로 살아 있다. FIX41 (D3): CHECK인데 예정일 +3일이 지났으면 pastDue:true(ruleStatus 값).
export const UNDATED_STALE_DAYS=31;
const undatedTooLong=(rule,today)=>{const c=typeof rule.createdAt==='string'?rule.createdAt.slice(0,10):'';return (Date.parse(today)-Date.parse(c))/86400000>UNDATED_STALE_DAYS;};   // 만든 날을 모르면(NaN) 거짓
export function fixedSchedule(rules,lines,today,days){
  const month=today.slice(0,7),byKey=new Map();
  for(const l of lines){
    if(l.kind!=='EXPENSE'||typeof l.date!=='string')continue;
    const key=recurringKey(l.merchant);if(!key)continue;
    if(!byKey.has(key))byKey.set(key,[]);
    byKey.get(key).push(l);
  }
  const list=Array.isArray(rules)?rules:[],active=list.filter(r=>!r.hidden),info=new Map(),byMerchant=new Map();
  for(const r of active){
    const mine=byKey.get(r.match.merchant)??[];
    info.set(r.id,{st:ruleStatus(r,mine,today,list),due:dueDay(r,mine,month,list),amount:BigInt(r.match.amount),got:[],late:0n});
    if(!byMerchant.has(r.match.merchant))byMerchant.set(r.match.merchant,[]);
    byMerchant.get(r.match.merchant).push(r);
  }
  const gap=(r,a)=>{const c=info.get(r.id).amount;return a>c?a-c:c-a;};
  const closest=(cands,a)=>cands.reduce((best,r)=>best===null||gap(r,a)<gap(best,a)?r:best,null);
  for(const [key,group] of byMerchant){
    const thisMonth=[];
    const history=byKey.get(key)??[];
    for(const l of history){
      if(l.date.slice(0,7)!==month||l.date>today)continue;
      const a=wonOf(l.net);if(a!==null)thisMonth.push({date:l.date,a});
    }
    for(const {date,a} of thisMonth){
      const kinds=group.map(r=>[r,lineKind(r,a,date,info.get(r.id).due,list,thisMonth,history)]);
      const own=kinds.filter(([,k])=>k==='PAID').map(([r])=>r);
      const other=own.length?[]:kinds.filter(([r,k])=>k==='OTHER'&&info.get(r.id).st.state==='DIFFERENT').map(([r])=>r);
      const check=own.length||other.length?[]:kinds.filter(([r,k])=>k!=='LATE'&&info.get(r.id).st.state==='CHECK'&&info.get(r.id).amount===a).map(([r])=>r);
      const pick=closest(own.length?own:other.length?other:check,a);
      if(pick){info.get(pick.id).got.push({date,amount:a});continue;}
      const late=closest(kinds.filter(([,k])=>k==='LATE').map(([r])=>r),a);
      if(late)info.get(late.id).late+=a;
    }
  }
  const out=[];
  for(const r of active){
    const {st,amount,got,due:dueD,late}=info.get(r.id),base={rule:r,id:r.id,name:r.name,provisional:amount,actual:null,count:0,paidDate:null,changed:null,suggest:null,blocked:false,...(late?{late}:{})};
    if(st.prepaid&&!got.length){out.push({...base,state:'PREPAID',due:null,paidDate:st.prepaid});continue;}
    if(st.state==='CHECK'&&got.length){out.push({...base,state:'CHECK',due:month+'-'+pad(Math.min(dueD,days)),actual:amount,count:1,paidDate:got.reduce((m,x)=>x.date>m?x.date:m,got[0].date),...(st.pastDue?{pastDue:true}:{})});continue;}
    if(st.state==='PENDING'||!got.length){
      // R33B (HUNT32 D5): 금액대 안 구독 결제가 없으면(결제 전에 잠정 금액을 바꿈) 평소 결제일(dueDay, 대체 기준 포함)로 예정일을 정한다.
      const due=dueD===null?fixedDue(st.lastDate,month,days):month+'-'+pad(Math.min(dueD,days));
      // FIX48 (HUNT42 H1-다): 결제일을 모른 채 한 달 넘게 결제와 한 번도 안 맞은 규칙은 예정·연체로 더하지 않고 UNCONFIRMED("확인 필요")로 뺀다. 가게 이름이 결제 내역과 다를 때 같은 돈이 예정과 변동 지출에 두 번 잡히지 않게 한다.
      if(due===null&&undatedTooLong(r,today)){out.push({...base,state:'UNCONFIRMED',due:null});continue;}
      out.push({...base,state:due!==null&&due<today?'OVERDUE':'PLANNED',due});
      continue;
    }
    let actual=0n,paidDate=null,last=null;
    for(const x of got){actual+=x.amount;last=x.amount;if(paidDate===null||x.date>paidDate)paidDate=x.date;}
    const raw=st.state==='DIFFERENT'?(st.lastDate!==null&&!(last*2n<amount||last>amount*2n)?last.toString():null):got.length===1&&last!==amount?last.toString():null;
    // R33B (HUNT32 D3): setRuleAmount가 받지 않을 금액(형제 규칙과 금액대가 겹침)이면 blocked=true(화면은 1탭 대신 이유를 보인다).
    const suggest=raw===amount.toString()?null:raw;
    out.push({...base,state:st.state,due:null,actual,count:got.length,paidDate,changed:actual!==amount?{from:amount,to:actual}:null,suggest,blocked:suggest!==null&&!canSetAmount(list,r.id,suggest)});
  }
  return out;
}
// 이번 달 정기 결제를 셋으로 나눈다(fixedSchedule의 합).
// paid: 이번 달 기록이 있는 규칙에 배정된 실제 금액(CHECK 포함, 이미 쓴 돈에 들어 있으므로 일평균에서 뺀다). 배정되지 않은 같은 가게 지출(예정일 밖 일반 구매)은 변동 지출이다(R32 D4).
// upcoming: 기록이 없고 예정일이 오늘 이후(오늘 포함)이거나 예정일을 모르는 규칙의 금액. overdue: 기록이 없고 예정일이 지난 규칙의 금액.
// FIX41 (HUNT40 D1): 앞달 몫인 늦은 결제도 이번 달 쓴 돈에 들어 있는 고정비라 paid에 더한다(변동 지출로 일평균에 늘어나지 않게). 건수에는 넣지 않고, 있으면 late에 합을 함께 둔다.
export function fixedPlan(rules,lines,today,days){
  const out={paid:0n,paidCount:0,upcoming:0n,upcomingCount:0,overdue:0n,overdueCount:0,undatedCount:0};
  for(const it of fixedSchedule(rules,lines,today,days)){
    if(it.late){out.paid+=it.late;out.late=(out.late??0n)+it.late;}
    if(it.state==='PREPAID')continue;   // FIX36: 지난달 지출에 이미 들어 있다
    if(it.state==='UNCONFIRMED'){out.unconfirmed=(out.unconfirmed??0n)+it.provisional;out.unconfirmedCount=(out.unconfirmedCount??0)+1;}   // FIX48: 예측에 더하지 않는다(있을 때만 칸이 있다)
    else if(it.state==='OVERDUE'){out.overdue+=it.provisional;out.overdueCount++;}
    else if(it.state==='PLANNED'){out.upcoming+=it.provisional;out.upcomingCount++;if(it.due===null)out.undatedCount++;}
    else{out.paid+=it.actual;out.paidCount++;}
  }
  return out;
}

// ---------- 돈 탭 "다음 예상일" ----------
// FIX40 (통제탑 결정 1): 반복결제 항목에 맞는 정기 결제 규칙이 있으면 다음 예상일은 정기 결제 화면(fixedSchedule)·PC 알림과 같은 예정일(dueDay, 말일 정리 포함)이다.
// 이번 달 예정일이 살아 있으면(예정·연체·확인 필요) 그 날, 이번 달 몫이 끝났으면(확정·금액 다름·미리 냄) 다음 달 예정일이다. 예정일을 모르면 탐지 값을 그대로 둔다.
// 맞는 규칙 = 같은 가맹점의 숨기지 않은 규칙 중 금액이 항목의 보통 금액에 가장 가깝고 그 절반~두 배 안인 것(같으면 목록 앞). 없으면 탐지 값 그대로다. 항목의 다른 값(주기·빠짐·상태)과 기록은 바꾸지 않는다.
// FIX41 (HUNT40 D2): 확인 필요인데 이번 달 예정일이 이미 지났으면 다음 달 예정일이다. FIX41 (D5): 규칙은 매달이라 분기·연 주기 항목에는 쓰지 않는다. 주기를 모르는 항목(period null, "반복결제로 포함"만 지정)은 탐지 값이 없어 FIX40대로 규칙 날짜를 쓴다.
const monthDays=m=>{const y=Number(m.slice(0,4)),n=Number(m.slice(5,7));return (Date.UTC(y,n,1)-Date.UTC(y,n-1,1))/86400000;};
export function withRuleDates(rec,rules,lines,today){
  const list=Array.isArray(rules)?rules:[];
  if(!list.length)return rec;
  const month=today.slice(0,7),next=shiftMonth(month,1),schedule=fixedSchedule(list,lines,today,monthDays(month));
  const dateOf=s=>{
    if(s.due!==null&&!(s.state==='CHECK'&&s.due<today))return s.due;
    if(s.state==='PLANNED')return null;
    const day=dueDay(s.rule,lines,next,list);
    return day===null?null:next+'-'+pad(Math.min(day,monthDays(next)));
  };
  const gap=(s,a)=>a>s.provisional?a-s.provisional:s.provisional-a;
  const ruleFor=item=>schedule.filter(s=>s.rule.match.merchant===item.key&&item.typical*2n>=s.provisional&&item.typical<=s.provisional*2n).reduce((best,s)=>best===null||gap(s,item.typical)<gap(best,item.typical)?s:best,null);
  return {...rec,items:rec.items.map(item=>{const s=item.period==='MONTHLY'||item.period===null?ruleFor(item):null,date=s?dateOf(s):null;return date===null?item:{...item,nextDate:date};})};
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
  // FIX37C (H37-M1): 환불이 변동 지출보다 크면 그 남은 환불(raw<0)이 월말 값에서 사라지지 않게 projectedNet에서 뺀다. 남는 돈·단계·문장은 이 값을 쓴다(마지막 날이면 쓴 돈 + 아직 안 나간 고정비와 같다). projected는 환불을 빼기 전 칸이다.
  const refundOver=raw<0n?-raw:0n,projected=fixed.paid+projectedVariable+fixed.upcoming+fixed.overdue,projectedNet=projected-refundOver,budget=s.total?s.total.budget:null,left=budget===null?null:budget-projectedNet;
  return {...empty,state:budget===null?'NO_BUDGET':'OK',budget,spent,variable,perDay,projectedVariable,fixed,projected,projectedNet,left,level:budget===null?null:forecastLevel(left,budget),early:s.elapsed<EARLY_DAYS,...(refundOver?{refundOver}:{})};
}
// 경고 문구. 입력은 숫자뿐이라 가게 이름이 들어갈 수 없다.
export function forecastText(f){
  if(f.state!=='OK'&&f.state!=='NO_BUDGET')return null;
  const net=f.projectedNet??f.projected,message=f.state==='NO_BUDGET'?'이대로면 이번 달 지출은 '+formatWon(net)+'입니다. 예산을 정하면 남는 돈도 계산합니다.'
    :f.level==='OVER'?'이대로면 월말에 '+formatWon(-f.left)+' 모자랍니다.'
    :f.left===0n?'이대로면 월말에 남는 돈이 없습니다.'
    :f.level==='TIGHT'?'이대로면 월말에 '+formatWon(f.left)+'만 남습니다.'
    :'이대로면 월말에 '+formatWon(f.left)+' 남습니다.';
  const fx=f.fixed,fixedCount=fx.paidCount+fx.upcomingCount+fx.overdueCount,notes=[];
  notes.push('월말 예상 지출 '+formatWon(net)+' · 하루 '+formatWon(f.perDay)+' 속도로 '+formatWon(f.projectedVariable)+(fixedCount?' + 정기 결제 '+formatWon(fx.paid+fx.upcoming+fx.overdue):''));
  if(f.refundOver)notes.push('변동 지출보다 큰 환불 '+formatWon(f.refundOver)+'을 뺐습니다.');
  if(fx.late)notes.push('앞달 몫이 이번 달에 늦게 찍힌 정기 결제 '+formatWon(fx.late)+'은 변동 지출에서 뺐습니다.');
  if(fx.upcomingCount)notes.push('아직 안 나간 정기 결제 '+fx.upcomingCount+'건 '+formatWon(fx.upcoming)+'을 더했습니다.');
  if(fx.overdueCount)notes.push('예정일이 지났는데 기록이 없는 정기 결제 '+fx.overdueCount+'건 '+formatWon(fx.overdue)+'도 나갈 돈으로 더했습니다.');
  if(fx.unconfirmedCount)notes.push('결제일을 모른 채 한 달이 넘은 정기 결제 '+fx.unconfirmedCount+'건 '+formatWon(fx.unconfirmed)+'은 가게 이름이 결제 내역과 맞는지 확인이 필요해 월말 예측에서 뺐습니다.');
  if(f.early)notes.push('이번 달 '+f.elapsed+'일치 기록으로 계산해 크게 달라질 수 있습니다.');
  if(f.unknownRows)notes.push('실제 금액 모름 '+f.unknownRows+'행은 넣지 않았습니다.');
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
