// FIN01 정기 결제 (B48): 소유자가 확정한 정기 결제 규칙 목록(FIN_RECURRING 한 장)과 후보 자동 제안. 순수 함수, DOM 없음.
// 규칙: 거래(FIN_TXN)에는 아무 필드도 더하지 않는다. 후보는 저장하지 않는 투영이다(저장 0). "정기로 등록" = 규칙 목록 한 장을 다시 쓰는 연산 1, "아님" = 이 기기 로컬 숨김(연산 0).
// 금액은 원 단위 정수 문자열(계산은 BigInt). 가맹점 이름은 화면에만 쓰고 내보내기(LIFE_STATE)에는 넣지 않는다.
// B48C: 한 가게의 구독 여러 개(가게+금액대 기준, 규칙 모양은 그대로), 가격 변경은 최근 금액대로 후보·1탭 갱신, 예정일 ±3일 매칭, "아님" 목록 평문 금지.
import {shiftMonth,finError,parseWonInput} from './fin-ledger.mjs';
import {merchantKey} from './fin-plan.mjs';

export const RECURRING_ID='recurring';                 // fin-model.mjs RECURRING_ID와 같아야 한다(시험이 대조)
export const RULE_MAX=60,TOLERANCE_DEFAULT=10,TOLERANCE_MAX=50;
export const CANDIDATE_MIN_MONTHS=3,CANDIDATE_MIN_SHARE_PCT=60,CANDIDATE_WINDOW_MONTHS=12,PRICE_CHANGE_MIN_MONTHS=2,DUE_WINDOW_DAYS=3,LEDGER_MATCH_MIN_NAME=2;
export const HIDDEN_KEY='lb.fin.recurring.hidden.v1',HIDDEN_MAX=200;
export const RECURRING_TEXT=Object.freeze({
  tab:'정기 결제',total:'매달 나가는 돈',empty:'등록한 정기 결제가 없습니다. 아래 후보에서 "정기로 등록"을 누르면 여기에 모입니다.',
  candidates:'정기 결제 후보',noCandidates:'후보가 없습니다. 같은 가게·비슷한 금액이 서로 다른 달에 3번 이상 나온 결제만 후보가 됩니다.',
  PAID:'이번 달 결제 있음',PENDING:'이번 달 아직',DIFFERENT:'이번 달 금액 다름',CHECK:'확인 필요 · 예정일 밖 같은 금액',CHECK_PAST:'확인 필요 · 예정일 지남(예정일 결제 없음)',chip:'정기 결제: ',
  priceChanged:'금액이 바뀌었어요 · 새 금액으로 바꿀까요',priceApply:'새 금액으로 바꾸기',
  hideFailed:'이 기기에 숨김을 저장하지 못했습니다 · 저장 공간을 확인한 뒤 다시 눌러 주세요.',
  // R33B (HUNT32 D2·D3): 겹침 판정에 걸려 버튼을 내지 않을 때 보이는 이유.
  overlapCandidate:'이미 등록한 같은 가게 정기 결제와 금액대(±10%)가 겹쳐 등록할 수 없어요',
  overlapAmount:'이 금액은 같은 가게의 다른 정기 결제와 금액대가 겹쳐 바꿀 수 없어요',
});

const POS=/^[1-9]\d{0,13}$/;
export const wonOf=v=>{
  try{
    if(typeof v==='bigint')return v>0n?v:null;
    if(typeof v==='number')return Number.isSafeInteger(v)&&v>0?BigInt(v):null;
    if(typeof v==='string')return BigInt(parseWonInput(v));
  }catch{/* 표기가 올바르지 않으면 null */}
  return null;
};
// 정규화 가맹점: 대소문자·공백 무시, 숫자(지점·주문번호)는 #. 빈 값은 후보가 되지 않는다.
export const recurringKey=m=>merchantKey(m);
// 금액 a가 기준 금액 center의 ±pct% 안인가(BigInt, 경계 포함).
export const within=(a,center,pct)=>{const d=a>center?a-center:center-a;return d*100n<=BigInt(pct)*center;};
const lowerMedian=list=>{const v=[...list].sort((p,q)=>p<q?-1:p>q?1:0);return v[Math.floor((v.length-1)/2)];};

// 가맹점 결제를 금액대로 나눈다: 가장 많은 결제를 묶는 중심(동률은 낮은 금액)을 고르고, 남은 결제로 되풀이한다.
// 결제 1건뿐인 금액대는 후보가 될 수 없으니 거기서 멈추고, 한 가맹점의 금액대는 8개까지만 본다(결제가 많은 가게에서 계산이 늘어지지 않게).
const BAND_MAX=8;
function splitBands(all,pct){
  const bands=[],lowPct=BigInt(100-pct),highPct=BigInt(100+pct);
  let left=[...all].sort((p,q)=>p.amount<q.amount?-1:p.amount>q.amount?1:0);   // 금액순이면 ±pct% 안의 결제는 붙어 있다(within과 같은 경계)
  while(left.length&&bands.length<BAND_MAX){
    let from=0,to=0,bestFrom=0,bestTo=0;
    for(let i=0;i<left.length;i++){
      const c=left[i].amount;if(i&&c===left[i-1].amount)continue;
      while(left[from].amount*100n<c*lowPct)from++;
      while(to<left.length&&left[to].amount*100n<=c*highPct)to++;
      if(to-from>bestTo-bestFrom){bestFrom=from;bestTo=to;}
    }
    if(bestTo-bestFrom<2)break;
    const members=left.slice(bestFrom,bestTo),dates=members.map(x=>x.date).sort();
    bands.push({members,months:new Set(dates.map(d=>d.slice(0,7))),first:dates[0],last:dates.at(-1),amount:lowerMedian(members.map(x=>x.amount))});
    left=[...left.slice(0,bestFrom),...left.slice(bestTo)];
  }
  return bands;
}
// 금액대를 구독 단위로 묶는다: 앞 금액대가 끝난 뒤 시작한 금액대는 가격이 바뀐 같은 구독, 기간이 겹치면 서로 다른 구독.
function chainBands(bands){
  const chains=[];
  for(const b of bands.filter(x=>x.months.size>=PRICE_CHANGE_MIN_MONTHS).sort((p,q)=>p.first.localeCompare(q.first))){
    const prev=chains.filter(c=>c.at(-1).last<b.first).sort((p,q)=>q.at(-1).last.localeCompare(p.at(-1).last))[0];
    if(prev)prev.push(b);else chains.push([b]);
  }
  return chains.filter(c=>c.some(b=>b.months.size>=CANDIDATE_MIN_MONTHS));
}
// 후보 추출. lines: 화면 투영의 줄(날짜·가맹점·종류·net) — net은 BigInt·정수 문자열·쉼표/원 표기 문자열 모두 받는다.
// 조건: 최근 12개월 지출 중 같은 가맹점(정규화)·비슷한 금액(±10%)이 서로 다른 달에 3번 이상, 후보가 된 금액대들이 그 가맹점 결제의 60% 이상.
// 금액은 가장 최근 금액대 기준(가격이 오르면 새 금액). 한 가맹점에 기간이 겹치는 금액대가 둘 이상이면 금액대마다 후보가 된다.
// key: 숨김에 쓰는 이름(구독이 하나면 가맹점, 여럿이면 가맹점|금액). merchantKey: 정규화 가맹점.
// 이미 규칙이 맡은 금액대(가격이 바뀐 경우 포함)와 이 기기에서 "아님"으로 숨긴 것은 뺀다. 가맹점 키로 숨기면 그 가맹점 전체가 빠진다.
export function findCandidates(lines,today,{rules=[],hidden=new Set(),tolerancePct=TOLERANCE_DEFAULT}={}){
  const now=today.slice(0,7),from=shiftMonth(now,-(CANDIDATE_WINDOW_MONTHS-1));
  const groups=new Map();
  for(const l of lines){
    if(l.kind!=='EXPENSE'||typeof l.date!=='string'||l.date>today||l.date.slice(0,7)<from)continue;
    const a=wonOf(l.net);if(a===null)continue;
    const key=recurringKey(l.merchant);if(!key||hidden.has(key))continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({date:l.date,amount:a,merchant:l.merchant,category:l.category??null});
  }
  const out=[];
  for(const [key,all] of groups){
    const chains=chainBands(splitBands(all,tolerancePct));
    const covered=chains.reduce((n,c)=>n+c.reduce((m,b)=>m+b.members.length,0),0);
    if(covered*100<all.length*CANDIDATE_MIN_SHARE_PCT)continue;
    // 규칙이 이 묶음을 맡고 있는가: 규칙 금액대의 결제가 묶음 안에 있거나, 규칙 금액대 결제가 묶음 시작 뒤로 없다(가격이 바뀐 구독).
    const known=c=>rules.some(r=>{
      if(r.match.merchant!==key)return false;
      const center=BigInt(r.match.amount),pct=r.match.tolerancePct;
      return c.some(b=>b.members.some(x=>within(x.amount,center,pct)))||!all.some(x=>within(x.amount,center,pct)&&x.date>=c[0].first);
    });
    for(const c of chains){
      if(known(c))continue;
      const tail=c.at(-1),amount=tail.amount.toString(),id=chains.length>1?key+'|'+amount:key;
      if(hidden.has(id))continue;
      const members=c.flatMap(b=>b.members).sort((p,q)=>p.date.localeCompare(q.date)),last=members.at(-1);
      // R33B (HUNT32 D2): "정기로 등록"(기본 ±10%)이 addRule의 구간 겹침 판정에 걸리는 후보는 overlap:true(화면이 등록 버튼 대신 이유를 보인다).
      out.push({key:id,merchantKey:key,merchant:last.merchant,amount,count:members.length,months:new Set(members.map(x=>x.date.slice(0,7))).size,total:all.length,lastDate:last.date,category:last.category,overlap:addBlocked(rules,key,tail.amount,TOLERANCE_DEFAULT)});
    }
  }
  return out.sort((p,q)=>{const a=BigInt(p.amount),b=BigInt(q.amount);return a>b?-1:a<b?1:p.key.localeCompare(q.key);});
}

// ---------- 규칙 목록(저장할 한 장) ----------
export const rulesOf=data=>data?.rules??[];
const nameOK=n=>typeof n==='string'&&n.isWellFormed()&&n.trim().length>0&&[...n.trim()].length<=60;
// 금액 a(±pct%)와 규칙 r의 금액대가 겹치는가(가맹점이 같을 때 같은 구독으로 본다).
// R32 (HUNT31 D3): 두 구간이 조금이라도 겹치면(경계 포함) 거부한다. 중심을 서로 품지 않아도(10,000±10%와 11,500±10%) 결제 1건이 두 금액대에 다 들 수 있기 때문.
const sameBand=(r,a,pct)=>{const c=BigInt(r.match.amount),rp=BigInt(r.match.tolerancePct),p=BigInt(pct);return a*(100n-p)<=c*(100n+rp)&&c*(100n-rp)<=a*(100n+p);};
// r31까지의 겹침 기준: 한쪽 금액대가 다른 쪽 중심 금액을 품는가. r31이 받아 준 겹친 금액대 규칙 쌍은 이 기준으로는 안 겹친다.
const centerBand=(r,a,pct)=>{const c=BigInt(r.match.amount);return within(a,c,r.match.tolerancePct)||within(c,a,pct);};
// R33B (HUNT32 D2): addRule이 겹침으로 거부할 금액인가(후보 목록이 등록 버튼을 낼지 같은 판정으로 정한다).
// FIX34 (HUNT34 H9): 숨긴 규칙은 겹침 검사에 넣지 않는다(amountBlocked와 같은 기준으로 통일). 대신 다시 보이기 때 겹침을 검사한다(setRuleHidden).
const addBlocked=(rules,key,won,pct)=>rules.some(r=>!r.hidden&&r.match.merchant===key&&sameBand(r,won,pct));
// 규칙 하나를 목록에 더한 새 data를 만든다. 같은 가맹점·겹치는 금액대의 규칙이 이미 있으면 거부(후보에는 overlap:true로 보인다). 반환값은 validateFinData('FIN_RECURRING','recurring',data)를 통과하는 모양.
export function addRule(data,{name,merchant,amount,tolerancePct=TOLERANCE_DEFAULT},{id,now}){
  const rules=rulesOf(data),key=recurringKey(merchant),won=wonOf(amount);
  if(!key||won===null||!POS.test(won.toString()))throw finError('INVALID_FIN_RECURRING_AMOUNT');
  if(!nameOK(name))throw finError('INVALID_FIN_TEXT');
  if(!Number.isInteger(tolerancePct)||tolerancePct<0||tolerancePct>TOLERANCE_MAX)throw finError('INVALID_FIN_RECURRING_TOLERANCE');
  if(rules.length>=RULE_MAX)throw finError('FIN_RECURRING_LIMIT');
  if(addBlocked(rules,key,won,tolerancePct))throw finError('FIN_RECURRING_DUPLICATE');
  return {rules:[...structuredClone(rules),{id,name:name.trim(),match:{merchant:key,amount:won.toString(),tolerancePct},cycle:'MONTHLY',hidden:false,createdAt:now}]};
}
// FIX34 (H9): 숨긴 규칙을 다시 보이면 겹치는가 = 같은 가맹점의 보이는 규칙과 금액대가 조금이라도 겹치는가(addRule과 같은 기준). 겹치면 저장하지 않는다(이유는 FIN_ERROR_TEXT).
export const canReveal=(rules,id)=>{const rule=(rules??[]).find(r=>r.id===id);return Boolean(rule)&&!rules.some(r=>r.id!==id&&!r.hidden&&r.match.merchant===rule.match.merchant&&sameBand(r,BigInt(rule.match.amount),rule.match.tolerancePct));};
export function setRuleHidden(data,id,hidden){
  const rules=rulesOf(data),rule=rules.find(r=>r.id===id);
  if(!rule)throw finError('FIN_RECURRING_UNKNOWN_RULE');
  if(rule.hidden&&!hidden&&!canReveal(rules,id))throw finError('FIN_RECURRING_REVEAL_OVERLAP');
  return {rules:rules.map(r=>({...structuredClone(r),hidden:r.id===id?Boolean(hidden):r.hidden}))};
}
// R33B (HUNT32 D3·S5): 규칙 rule의 금액을 won으로 바꾸면 같은 가맹점 형제 규칙과 겹치는가. 자기 규칙과 숨긴 규칙은 보지 않는다. 금액이 그대로면 늘 받는다.
// 지금 금액대가 형제와 안 겹치면 R32 기준(구간이 조금이라도 겹치면 거부). r31이 받아 준 이미 겹친 쌍이면 r31 기준(중심을 품으면 거부)으로
// 옛 쌍을 그대로 두거나 소폭 고치는 것은 받고, 새 겹침을 만들거나 r31보다 나빠지는 변경만 막는다.
const amountBlocked=(rules,rule,won)=>{
  const old=BigInt(rule.match.amount),pct=rule.match.tolerancePct;
  if(won===old)return false;
  return rules.some(r=>r.id!==rule.id&&!r.hidden&&r.match.merchant===rule.match.merchant&&sameBand(r,won,pct)&&(!sameBand(r,old,pct)||centerBand(r,won,pct)));
};
// setRuleAmount가 받을 금액인가(1탭 제안·가격 변경 버튼을 낼지 같은 판정으로 정한다). 규칙이 없거나 금액이 올바르지 않으면 false.
export function canSetAmount(rules,id,amount){
  const rule=(rules??[]).find(r=>r.id===id),won=wonOf(amount);
  return Boolean(rule)&&won!==null&&POS.test(won.toString())&&!amountBlocked(rules,rule,won);
}
// 규칙 금액만 바꾼 새 data(가격 변경 1탭, 연산 1). 모양은 그대로. 같은 가맹점의 다른 규칙과 금액대가 새로 겹치면 거부(위 amountBlocked).
export function setRuleAmount(data,id,amount){
  const rules=rulesOf(data),rule=rules.find(r=>r.id===id),won=wonOf(amount);
  if(!rule)throw finError('FIN_RECURRING_UNKNOWN_RULE');
  if(won===null||!POS.test(won.toString()))throw finError('INVALID_FIN_RECURRING_AMOUNT');
  if(amountBlocked(rules,rule,won))throw finError('FIN_RECURRING_DUPLICATE');
  return {rules:rules.map(r=>{const c=structuredClone(r);if(r.id===id)c.match.amount=won.toString();return c;})};
}

// ---------- 규칙 상태 ----------
const dayNum=d=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)))/86400000;
const dueOf=(month,day)=>{const y=Number(month.slice(0,4)),m=Number(month.slice(5,7)),last=(Date.UTC(y,m,1)-Date.UTC(y,m-1,1))/86400000;return month+'-'+String(Math.min(day,last)).padStart(2,'0');};
// R33B (HUNT32 D5): 결제일의 대체 기준. 규칙 금액대에 지난 결제가 하나도 없을 때(실제 결제 전에 잠정 금액을 바꿈)만 쓴다.
// 이 규칙의 지난 결제로 볼 것: B48C 가격 변경 범위(규칙 금액의 절반~두 배) 안이고 같은 가맹점 다른 규칙(rules)의 금액대 밖. 예정일만 정하고 금액대 판정(lineKind)에는 쓰지 않는다.
// FIX34 (HUNT34 H10): 절반~두 배 안이어도 규칙 금액이 더 가까운 같은 가맹점 형제 규칙이 있으면 그 형제의 옛 결제로 본다(둘 다 결제 전에 금액을 고쳐도 서로 섞이지 않게).
export const dueFallback=(rule,a,rules=[])=>{
  const c=BigInt(rule.match.amount),gap=x=>a>x?a-x:x-a;
  if(a*2n<c||a>c*2n)return false;
  return !rules.some(r=>{if(r.id===rule.id||r.match.merchant!==rule.match.merchant)return false;const o=BigInt(r.match.amount);return within(a,o,r.match.tolerancePct)||(a*2n>=o&&a<=o*2n&&gap(o)<gap(c));});
};
const FALLBACK_MIN_MONTHS=2,FIRM_DUE_PAYMENTS=2,DUE_RECENT_MONTHS=3,MONTH_END_DAY=31;
// FIX39B (HUNT37 M4): 그 달의 말일 결제는 "말일"(31)로 센다. 예정일 31은 짧은 달에서 그 달 말일이다(dueOf).
const billDay=date=>date===dueOf(date.slice(0,7),MONTH_END_DAY)?MONTH_END_DAY:Number(date.slice(8,10));
// 가장 많이 나온 날(동률은 최근). FIX41 (HUNT40 D4): 동률이면 말일(31)보다 실제 날짜가 먼저다(1/28·2/28이 31로 굳지 않게).
function usualDay(list){
  const count=new Map();
  for(const x of list){const d=billDay(x.date);count.set(d,(count.get(d)??0)+1);}
  let best=null,bestN=0;
  for(const x of [...list].sort((p,q)=>q.date.localeCompare(p.date))){const d=billDay(x.date),n=count.get(d);if(n>bestN||(n===bestN&&best===MONTH_END_DAY&&d!==MONTH_END_DAY)){best=d;bestN=n;}}
  return best;
}
// FIX34 (HUNT34 H8·H13): 대체 결제일. 화면(dueDayOf)과 PC 알림(pc-toast)이 이 함수 하나를 쓴다. 후보는 같은 금액대로 묶여 서로 다른 달에 2번 이상 되풀이된 결제뿐이다(한 번 산 일반 구매로 정하지 않는다).
// FIX39 (HUNT35 F8, 통제탑 규칙 1): 묶음이 여럿이면 규칙 금액에 가까운 묶음, 같으면 결제가 많은 묶음, 같으면 최근 결제가 있는 묶음. 한 묶음 안에서는 규칙 금액에 가장 가까운 금액의 결제일을 본다(같은 금액대의 일반 구매에 흔들리지 않게). 그 금액이 한 달뿐이면 묶음 전체를 본다.
// FIX35 (HUNT35 F10): 같은 가맹점 규칙 여럿이 모두 대체 결제일을 찾을 때(금액대 안 지난 결제 없음) 후보 묶음을 규칙과 1:1로 짝짓는다.
// 규칙마다 묶음을 위 순서로 고르되, 한 묶음(결제가 겹치는 묶음)을 두 규칙이 원하면 규칙 금액에 비율로 더 가까운 규칙이 가져가고
// 진 규칙은 다음 묶음을 고른다(형제 금액이 중간점을 넘어도 이력이 섞이지 않게). 대체 결제일을 쓰지 않는 형제는 예전처럼 더 가까운 결제를 자기 몫으로 뺀다(dueFallback).
const usesFallback=(r,mine,month)=>{const c=BigInt(r.match.amount);return !mine.some(l=>{if(l.date.slice(0,7)>=month)return false;const a=wonOf(l.net);return a!==null&&within(a,c,r.match.tolerancePct);});};
function fallbackBands(rule,mine,month,sibs,racing){
  const center=BigInt(rule.match.amount),gap=(a,x)=>a>x?a-x:x-a,spare=[];
  mine.forEach((l,i)=>{
    if(l.date.slice(0,7)>=month)return;
    const a=wonOf(l.net);if(a===null||within(a,center,rule.match.tolerancePct)||a*2n<center||a>center*2n)return;
    if(sibs.some(o=>{if(o.id===rule.id)return false;const c=BigInt(o.match.amount);return within(a,c,o.match.tolerancePct)||!racing.has(o.id)&&a*2n>=c&&a<=c*2n&&gap(a,c)<gap(a,center);}))return;
    spare.push({date:l.date,amount:a,i});
  });
  return splitBands(spare,rule.match.tolerancePct).filter(b=>b.months.size>=FALLBACK_MIN_MONTHS).sort((p,q)=>{const a=gap(p.amount,center),b=gap(q.amount,center);return a<b?-1:a>b?1:q.members.length-p.members.length||(q.last>p.last?1:q.last<p.last?-1:0);});
}
function pickFallbackBand(rule,mine,month,rules){
  const sibs=[rule,...rules.filter(r=>r.id!==rule.id&&r.match.merchant===rule.match.merchant)],racing=new Set(sibs.filter(r=>usesFallback(r,mine,month)).map(r=>r.id));
  racing.add(rule.id);
  const prefs=new Map(sibs.filter(r=>racing.has(r.id)).map(r=>[r.id,{rule:r,list:fallbackBands(r,mine,month,sibs,racing),next:0}]));
  if(prefs.size===1)return prefs.get(rule.id).list[0]??null;
  const ids=b=>new Set(b.members.map(x=>x.i)),overlap=(p,q)=>{const s=ids(p);return q.members.some(x=>s.has(x.i));};
  // 비율 거리 |묶음 금액 - 규칙 금액| / 규칙 금액 (BigInt 교차 곱으로 비교). 같으면 먼저 가진 규칙이 그대로 가진다.
  const dist=(r,b)=>{const c=BigInt(r.match.amount);return {n:b.amount>c?b.amount-c:c-b.amount,d:c};},closer=(x,y)=>x.n*y.d<y.n*x.d;
  const held=new Map(),free=[...prefs.keys()];
  while(free.length){
    const p=prefs.get(free.shift());
    while(p.next<p.list.length){
      const b=p.list[p.next++],rivals=[...held].filter(([,o])=>overlap(o,b));
      if(!rivals.every(([id,o])=>closer(dist(p.rule,b),dist(prefs.get(id).rule,o))))continue;
      for(const [id] of rivals){held.delete(id);free.push(id);}
      held.set(p.rule.id,b);break;
    }
  }
  return held.get(rule.id)??null;
}
function fallbackDayOf(rule,mine,month,rules){
  const center=BigInt(rule.match.amount);
  const band=pickFallbackBand(rule,mine,month,rules);
  if(!band)return null;
  const gap=a=>a>center?a-center:center-a,byGap=[...new Set(band.members.map(x=>x.amount))].sort((p,q)=>gap(p)<gap(q)?-1:gap(p)>gap(q)?1:0);
  const same=byGap.map(a=>band.members.filter(x=>x.amount===a)).find(list=>new Set(list.map(x=>x.date.slice(0,7))).size>=FALLBACK_MIN_MONTHS);
  return usualDay(same??band.members);
}
// 평소 결제일: 이번 달 전의 규칙 금액 결제(정확히 같은 금액이 있으면 그것만)에서 가장 많이 나온 날(동률은 최근). 금액대 안 지난 결제가 없으면 대체 결제일(fallbackDayOf), 그것도 없으면 null.
// FIX39B (통제탑 B): 옛 횟수는 세지 않는다(결제일이 영구히 옮겨져도 옛 횟수만큼 달마다 연체가 뜨지 않게).
// FIX39C (통제탑 ★2): 금액대 안 지난 결제가 3개 달 이상이면 가장 최근 3개 달에서 달마다 1건만 본다. 그 달 금액대 안 결제 중 규칙 금액에 가장 가까운 것, 같으면 늦은 날(한 달에 몰린 일반 구매에 예정일이 흔들리지 않게).
function dueDayOf(rule,mine,month,rules=[]){
  const center=BigInt(rule.match.amount),past=[],byMonth=new Map();
  for(const l of mine){
    if(l.date.slice(0,7)>=month)continue;
    const a=wonOf(l.net);if(a===null)continue;
    if(!within(a,center,rule.match.tolerancePct))continue;
    const x={date:l.date,exact:a===center,gap:a>center?a-center:center-a},m=l.date.slice(0,7),best=byMonth.get(m);
    past.push(x);
    if(!best||x.gap<best.gap||(x.gap===best.gap&&x.date>best.date))byMonth.set(m,x);
  }
  if(!past.length)return fallbackDayOf(rule,mine,month,rules);
  if(byMonth.size>=DUE_RECENT_MONTHS)return usualDay([...byMonth.keys()].sort().slice(-DUE_RECENT_MONTHS).map(m=>byMonth.get(m)));
  return usualDay(past.some(x=>x.exact)?past.filter(x=>x.exact):past);
}
// 예정일(앞달·이번 달·다음 달) ±3일 안인가.
const onSchedule=(date,day)=>{const n=dayNum(date),m=date.slice(0,7);return [shiftMonth(m,-1),m,shiftMonth(m,1)].some(x=>Math.abs(n-dayNum(dueOf(x,day)))<=DUE_WINDOW_DAYS);};
// FIX36 (HUNT35 H8·HUNT36 M6): 지난달 마지막 며칠(이번 달 예정일 3일 전까지)의 결제는 이번 달 몫을 미리 낸 것이다.
const prepaidLine=(date,day,month)=>day!==null&&date.slice(0,7)===shiftMonth(month,-1)&&dayNum(dueOf(month,day))-dayNum(date)<=DUE_WINDOW_DAYS;
const mineOf=(rule,lines)=>lines.filter(l=>l.kind==='EXPENSE'&&typeof l.date==='string'&&recurringKey(l.merchant)===rule.match.merchant);
// R32 (HUNT31 D4): 규칙의 평소 결제일(month 전의 결제에서, 위 dueDayOf). 가맹점이 다른 줄은 걸러서 본다. 지난 결제가 없으면 null.
// R33B: rules(같은 가맹점 형제 규칙 포함 전체 목록)를 주면 대체 기준에서 형제 금액대 결제를 뺀다.
export const dueDay=(rule,lines,month,rules=[])=>dueDayOf(rule,mineOf(rule,lines),month,rules);
export const fallbackDay=(rule,lines,month,rules=[])=>fallbackDayOf(rule,mineOf(rule,lines),month,rules);
// R32 (HUNT31 D4): 결제 줄 하나(같은 가맹점, 금액 a, 날짜 date)가 이 규칙에 어떻게 보이는가 — ruleStatus와 fixedSchedule(fin-forecast)이 같은 판정을 쓴다.
// 'PAID' 구독 결제: 규칙 금액대(±tolerancePct%)이면서 예정일(due) ±3일 안, 또는 예정일을 모를 때 규칙 금액과 정확히 같은 금액.
// 'OTHER' 금액 다름: 구독 결제가 아닌데 예정일 밖도 아닌 결제(예정일을 모르면 다른 금액 전부).
// null 세지 않음: 예정일 밖의 다른 결제(같은 가게 일반 구매), 같은 가맹점 다른 규칙(rules) 금액대의 결제(형제 규칙 몫).
// FIX36 (HUNT35 H8): monthLines(그 달 결제 [{date,a}])를 주면 구독은 한 달에 한 번으로 본다. 그 달에 예정일 ±3일 안의 구독 결제가 있으면 예정일 밖 같은 금액 결제도 null(같은 가게 일반 구매)이다. fixedSchedule이 쓴다.
// FIX39 (HUNT35 H8, 통제탑 규칙 2): 정확히 같은 금액이어도 예정일 ±3일 밖이면 PAID가 아니다(일반 구매). 예외는 예정일이 아직 굳지 않은 첫 2회다: history(이 규칙 가맹점의 결제 줄)를 주면 그 결제 전에 금액대 안 결제가 2번 미만일 때 정확히 같은 금액은 PAID다. history가 없으면 예외 없음.
const earlyPayment=(rule,date,history)=>{
  const center=BigInt(rule.match.amount);let seen=0;
  for(const l of history){
    if(l.date>=date)continue;
    const a=wonOf(l.net);
    if(a!==null&&within(a,center,rule.match.tolerancePct)&&++seen>=FIRM_DUE_PAYMENTS)return false;
  }
  return true;
};
// FIX41 (HUNT40 D1): history를 주면 앞달 몫인 늦은 결제(lateShare)는 'LATE'다. 그 줄은 찍힌 달의 구독 결제가 아니다. history가 없으면 예전처럼 'PAID'다.
export function lineKind(rule,a,date,due,rules=[],monthLines=null,history=null){
  const center=BigInt(rule.match.amount),inBand=within(a,center,rule.match.tolerancePct);
  if(!inBand&&rules.some(r=>r.id!==rule.id&&r.match.merchant===rule.match.merchant&&within(a,BigInt(r.match.amount),r.match.tolerancePct)))return null;
  const sched=due===null?null:onSchedule(date,due);
  if(sched===false&&monthLines?.some(x=>onSchedule(x.date,due)&&lineKind(rule,x.a,x.date,due,rules,null,history)==='PAID'))return null;
  if(inBand&&sched===true)return history!==null&&lateShare(rule,a,date,due,history,rules)?'LATE':'PAID';
  if(a===center&&(sched===null||(history!==null&&earlyPayment(rule,date,history))))return 'PAID';
  return sched===false?null:'OTHER';
}
// FIX41 (HUNT40 D1, 통제탑): 늦게 찍힌 앞달 결제(prepaidLine의 대칭). 규칙 금액대 결제가 앞달 예정일 +0~3일에 찍혔고 달력상 앞달에 예정일 ±3일 안 구독 결제가 없으면 앞달 몫이다(찍힌 달의 결제가 아니다).
// ruleStatus·fixedSchedule이 lineKind를 거쳐 이 함수 하나를 쓰고, fixedPlan·PC 알림은 그 결과를 쓴다. history: 이 규칙 가맹점의 결제 줄.
export function lateShare(rule,a,date,due,history,rules=[]){
  if(due===null||!within(a,BigInt(rule.match.amount),rule.match.tolerancePct))return false;
  const prev=shiftMonth(date.slice(0,7),-1),prevDue=dayNum(dueOf(prev,due));
  if(dayNum(date)-prevDue>DUE_WINDOW_DAYS)return false;
  return !history.some(l=>{
    if(l.date.slice(0,7)!==prev||Math.abs(dayNum(l.date)-prevDue)>DUE_WINDOW_DAYS)return false;
    const x=wonOf(l.net);
    return x!==null&&lineKind(rule,x,l.date,due,rules)==='PAID';
  });
}
// 이번 달 결제 확인. 구독 결제로 치는 것: 규칙 금액대(±tolerancePct%)이면서 예정일 ±3일 안의 결제, 또는 첫 2회(예정일이 아직 굳지 않음)의 규칙 금액과 정확히 같은 결제.
// 예정일 밖의 다른 결제(같은 가게 일반 구매)는 세지 않는다. 지난 결제가 없어 예정일을 모르면 정확히 같은 금액만 구독 결제이고, 다른 금액은 "금액 다름"으로 보인다.
// rules를 주면 같은 가맹점의 다른 규칙 금액대 결제는 이 규칙의 "금액 다름"으로 세지 않는다.
// lastDate: 구독 결제로 친 가장 최근 결제일(없으면 null).
// FIX35 (HUNT35 H8): 구독은 한 달에 한 번이다. 예정일 ±3일 안의 구독 결제가 있는 달에는 그 달의 예정일 밖 같은 금액 결제(같은 가게 일반 구매)를 마지막 결제일로 치지 않는다
// (다음 예정일이 그 구매일로 밀리지 않게). FIX39: 그 달에 그것뿐이어도 첫 2회가 아니면 구독 결제가 아니다(lineKind).
// FIX36 (HUNT35 H8·HUNT36 M6): 이번 달에 구독 결제가 없어도 지난달 마지막 며칠에 미리 낸 결제가 있으면 PAID이고 prepaid(그 날짜)를 함께 돌려준다(없으면 칸이 없다).
// FIX39B (통제탑 C): 이번 달에 구독 결제·금액 다름이 없고 규칙 금액과 정확히 같은 예정일 밖 결제가 있으면 CHECK(확인 필요). 저장하지 않는 계산 상태다. 나중에 예정일 ±3일 안 결제가 오면 PAID로 바뀐다.
// FIX41 (HUNT40 D1): 앞달 몫인 늦은 결제(lineKind 'LATE')는 이번 달 결제로 치지 않는다(마지막 결제일 lastDate에는 남는다).
// FIX41 (HUNT40 D3): CHECK인데 예정일 +3일이 지났으면 pastDue:true(화면 글자만 다르다, 없으면 칸이 없다).
export function ruleStatus(rule,lines,today,rules=[]){
  const month=today.slice(0,7),mine=mineOf(rule,lines),due=dueDayOf(rule,mine,month,rules),center=BigInt(rule.match.amount);
  let paid=false,other=false,otherAmount=null,prepaid=null,check=false;const paidLines=[],onTimeMonths=new Set();
  for(const l of mine){
    if(l.date>today)continue;
    const a=wonOf(l.net);if(a===null)continue;
    const kind=lineKind(rule,a,l.date,due,rules,null,mine);
    if(kind==='PAID'||kind==='LATE'){const onTime=due===null||onSchedule(l.date,due);paidLines.push({date:l.date,onTime});if(onTime)onTimeMonths.add(l.date.slice(0,7));if(prepaidLine(l.date,due,month)&&(prepaid===null||l.date>prepaid))prepaid=l.date;}
    if(l.date.slice(0,7)!==month||kind==='LATE')continue;
    if(kind==='PAID')paid=true;else if(kind==='OTHER'){other=true;otherAmount=a.toString();}else if(a===center)check=true;
  }
  const last=paidLines.filter(p=>p.onTime||!onTimeMonths.has(p.date.slice(0,7))).reduce((m,p)=>m===null||p.date>m?p.date:m,null);
  if(!paid&&prepaid!==null)return {state:'PAID',lastDate:last,otherAmount:null,prepaid};
  const state=paid?'PAID':other?'DIFFERENT':check?'CHECK':'PENDING';
  return {state,lastDate:last,otherAmount:paid?null:otherAmount,...(state==='CHECK'&&due!==null&&dayNum(today)-dayNum(dueOf(month,due))>DUE_WINDOW_DAYS?{pastDue:true}:{})};
}
// 가격 변경 제안: 이번 달 예정일쯤 다른 금액을 냈고, 지난 결제가 있고, 금액이 절반~두 배 안이면 {amount}. 아니면 null(일반 구매로 본다). 자동으로 바꾸지 않는다.
export function priceChange(rule,lines,today,rules=[]){
  const s=ruleStatus(rule,lines,today,rules);
  if(s.state!=='DIFFERENT'||s.otherAmount===null||s.lastDate===null)return null;
  const a=BigInt(s.otherAmount),c=BigInt(rule.match.amount);
  return a*2n<c||a>c*2n?null:{amount:s.otherAmount};
}
// 매달 나가는 돈 합계: 숨기지 않은 규칙의 월 금액 합(BigInt 문자열).
export const monthlyTotal=rules=>rules.filter(r=>!r.hidden).reduce((s,r)=>s+BigInt(r.match.amount),0n).toString();
// Fold 결제 초안이 규칙과 맞는가(가맹점 정규화 같음 + 금액 ±tolerancePct%). 맞으면 규칙을 돌려준다(칩 표시용, 자동 확정 없음).
export function matchDraft(rules,draft){
  const key=recurringKey(draft?.merchant),a=wonOf(draft?.amount);
  if(!key||a===null)return null;
  return rules.find(r=>!r.hidden&&r.match.merchant===key&&within(a,BigInt(r.match.amount),r.match.tolerancePct))??null;
}
// 가계부에 같은 결제로 보이는 거래가 이미 있는가(B48C F1). dates: 비교할 날짜들(거래에는 시각이 없다). 같은 금액·지출이고, 가맹점 이름이 같거나 한쪽이 다른 쪽을 포함하거나 한쪽을 모를 때.
// 맞으면 그 줄을 돌려준다(표시용, 저장을 막지 않는다).
export function ledgerMatch(lines,draft,dates){
  const a=wonOf(draft?.amount);if(a===null||!Array.isArray(dates))return null;
  const mk=recurringKey(draft.merchant);
  const similar=key=>!key||!mk||key===mk||(key.length>=LEDGER_MATCH_MIN_NAME&&mk.length>=LEDGER_MATCH_MIN_NAME&&(key.includes(mk)||mk.includes(key)));
  return lines.find(l=>l.kind==='EXPENSE'&&dates.includes(l.date)&&wonOf(l.net)===a&&similar(recurringKey(l.merchant)))??null;
}

// ---------- 이 기기 로컬 숨김("아님", 연산 0) ----------
export function loadHidden(storage){
  try{const v=JSON.parse(storage?.getItem(HIDDEN_KEY)??'[]');if(Array.isArray(v))return new Set(v.filter(x=>typeof x==='string'&&x&&x.length<=120).slice(0,HIDDEN_MAX));}catch{/* 저장소가 막혀 있으면 빈 목록 */}
  return new Set();
}
export function hideCandidate(storage,key){
  const set=loadHidden(storage);set.add(key);
  const list=[...set].slice(-HIDDEN_MAX);
  // B2C (DEFECT-8): 쓰기만 실패(공간 부족)하면 실제로 저장된 목록을 돌려준다(부른 쪽이 "숨겼습니다"라고 말하지 않게). 던지지는 않는다.
  // 저장소가 읽기까지 막혔으면 예전처럼 요청한 목록을 돌려준다(이번 실행 값). 앱의 문구는 loadHidden으로 다시 읽어 고르므로 이 경우에도 실패로 나온다.
  try{storage?.setItem(HIDDEN_KEY,JSON.stringify(list));}catch{try{storage.getItem(HIDDEN_KEY);}catch{return new Set(list);}return loadHidden(storage);}
  return new Set(list);
}

// ---------- "아님" 목록의 암호화 보관(B48C F10) ----------
// 가맹점 이름(민감 가맹점 포함)을 평문 저장소에 두지 않는다. 카드 초안 상자처럼 IndexedDB에 비추출 AES-GCM 256 키와 암호문만 둔다(연산 0, 이 기기에만).
// - 항목 하나가 레코드 하나: {id,seq,kid,iv,ct}. 겉에는 이름·금액이 없다. AAD = LB_FIN_HIDDEN_1|id. 항목별 쓰기라 다른 창과 덮어쓸 일이 없다. 상한을 넘으면 가장 오래된 것부터 뺀다.
// - 옛 평문 값(HIDDEN_KEY)은 첫 load에서 암호문으로 옮기고, 쓰기가 끝난 뒤에만 그 칸을 지운다. 옮기지 못하면 지우지 않고 다음 실행 때 다시 한다.
// - 암호화 저장을 쓸 수 없거나 쓰기가 실패하면 평문으로 대신 쓰지 않는다: 숨김을 되돌리고 onFail을 부른다. failed()가 참이면 화면이 안내한다.
// 보안 한계: 카드 초안 상자와 같다(키는 같은 브라우저 프로필 안에 있다).
export const HIDDEN_DB='LIFE_BRICK_FIN_HIDDEN_V1',HIDDEN_FORMAT='LB_FIN_HIDDEN_1';
const HIDDEN_KEY_ROW='key';
const hiddenFail=code=>Object.assign(new Error(code),{code});
const usableHiddenKey=k=>!!k&&typeof k==='object'&&k.type==='secret'&&k.extractable===false&&k.algorithm?.name==='AES-GCM'&&k.algorithm.length===256;
export function createHiddenBox({indexedDB:idb=globalThis.indexedDB,crypto:cr=globalThis.crypto,storage=null,onFail=null}={}){
  const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true}),names=loadHidden(storage);
  let loading=null,keyCache=null,chain=Promise.resolve(),lastFailed=false;
  const usable=()=>Boolean(idb&&typeof idb.open==='function'&&cr?.subtle&&typeof cr.getRandomValues==='function');
  const aad=id=>enc.encode(HIDDEN_FORMAT+'|'+id);
  const hex=n=>Array.from(cr.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
  const openDb=()=>new Promise((ok,no)=>{
    let r;try{r=idb.open(HIDDEN_DB,1);}catch(e){no(e);return;}
    r.onupgradeneeded=()=>{r.result.createObjectStore('keys',{keyPath:'id'});r.result.createObjectStore('rows',{keyPath:'id'});};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error??hiddenFail('FIN_HIDDEN_OPEN'));r.onblocked=()=>no(hiddenFail('FIN_HIDDEN_BLOCKED'));
  });
  const run=(db,stores,mode,body)=>new Promise((ok,no)=>{
    let t,out,cause=null;
    try{t=mode==='readwrite'?db.transaction(stores,mode,{durability:'strict'}):db.transaction(stores,mode);}catch(e){no(e);return;}
    const stop=e=>{cause??=e;try{t.abort();}catch{/* 이미 끝남 */}};
    t.oncomplete=()=>ok(out);t.onabort=()=>no(cause??t.error??hiddenFail('FIN_HIDDEN_ABORT'));t.onerror=()=>{};
    const req=(r,cb)=>{r.onsuccess=()=>{try{cb?.(r.result);}catch(e){stop(e);}};r.onerror=ev=>{ev?.preventDefault?.();stop(r.error??hiddenFail('FIN_HIDDEN_REQUEST'));};};
    try{body(t,req,v=>{out=v;},stop);}catch(e){stop(e);}
  });
  const withDb=async fn=>{const db=await openDb();try{return await fn(db);}finally{db.close();}};
  const ensureKey=async()=>{
    if(keyCache)return keyCache;
    const key=await cr.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),kid=hex(12);
    keyCache=await withDb(db=>run(db,['keys'],'readwrite',(t,req,set)=>{
      const s=t.objectStore('keys');
      req(s.get(HIDDEN_KEY_ROW),row=>{if(row&&usableHiddenKey(row.key)&&typeof row.kid==='string')set({key:row.key,kid:row.kid});else{req(s.put({id:HIDDEN_KEY_ROW,key,kid}));set({key,kid});}});
    }));
    return keyCache;
  };
  const putName=async name=>{
    const k=await ensureKey(),id=hex(16),iv=cr.getRandomValues(new Uint8Array(12));
    const ct=new Uint8Array(await cr.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(id)},k.key,enc.encode(JSON.stringify({format:HIDDEN_FORMAT,name}))));
    await withDb(db=>run(db,['keys','rows'],'readwrite',(t,req,set,stop)=>{
      req(t.objectStore('keys').get(HIDDEN_KEY_ROW),cur=>{if(!cur||cur.kid!==k.kid){keyCache=null;stop(hiddenFail('FIN_HIDDEN_KEY_CHANGED'));}});
      const s=t.objectStore('rows');
      req(s.getAll(),all=>{
        const rows=[...(all??[])].sort((p,q)=>p.seq-q.seq);
        req(s.put({id,seq:(rows.at(-1)?.seq??0)+1,kid:k.kid,iv,ct}));
        for(const old of rows.slice(0,Math.max(0,rows.length+1-HIDDEN_MAX)))req(s.delete(old.id));
      });
    }));
  };
  const readNames=async()=>{
    const got=await withDb(db=>run(db,['keys','rows'],'readonly',(t,req,set)=>{
      const g={rows:[],key:null};set(g);
      req(t.objectStore('keys').get(HIDDEN_KEY_ROW),k=>{if(k&&usableHiddenKey(k.key)&&typeof k.kid==='string')g.key={key:k.key,kid:k.kid};});
      req(t.objectStore('rows').getAll(),r=>{g.rows=r??[];});
    }));
    keyCache=got.key;const out=[];
    for(const row of [...got.rows].sort((p,q)=>p.seq-q.seq)){
      if(!got.key||row.kid!==got.key.kid)continue;     // 키가 바뀌었거나 없으면 열 수 없다(숨김만 풀린다, 지우지 않는다)
      try{
        const d=JSON.parse(dec.decode(await cr.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:aad(row.id)},got.key.key,row.ct)));
        if(d?.format===HIDDEN_FORMAT&&typeof d.name==='string'&&d.name)out.push(d.name);
      }catch{/* 손상된 레코드는 건너뛴다 */}
    }
    return out;
  };
  // 암호문을 읽어 합치고 옛 평문을 옮긴다. 끝나면 true. 실패하면 false이고 다음 호출에서 다시 한다(옛 평문은 그대로 남는다).
  const load=()=>{
    if(loading)return loading;
    const p=(async()=>{
      if(!usable())return false;
      const stored=new Set(await readNames());
      for(const name of stored)names.add(name);
      for(const name of loadHidden(storage))if(!stored.has(name))await putName(name);
      try{storage?.removeItem?.(HIDDEN_KEY);}catch{/* 다음 실행 때 다시 지운다 */}
      return true;
    })().catch(()=>{if(loading===p)loading=null;return false;});
    loading=p;
    return p;
  };
  return {
    load,
    available:usable,
    failed:()=>lastFailed,
    current:()=>new Set(names),
    // 화면이 바로 쓸 수 있게 메모리에 먼저 넣고 뒤에서 암호문을 쓴다. 쓰지 못하면 되돌리고 onFail을 부른다. 돌려주는 값은 지금 목록.
    hide(key){
      if(!usable()){lastFailed=true;if(!names.has(key))onFail?.();return new Set(names);}
      const had=names.has(key);names.add(key);
      chain=chain.then(load).then(async ok=>{
        if(!ok)throw hiddenFail('FIN_HIDDEN_UNAVAILABLE');
        if(!had)await putName(key);
        lastFailed=false;
      }).catch(()=>{if(!had)names.delete(key);lastFailed=true;onFail?.();});
      return new Set(names);
    },
    settled:()=>chain,
  };
}
