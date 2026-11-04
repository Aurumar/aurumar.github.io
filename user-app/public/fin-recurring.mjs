// FIN01 정기 결제 (B48): 소유자가 확정한 정기 결제 규칙 목록(FIN_RECURRING 한 장)과 후보 자동 제안. 순수 함수, DOM 없음.
// 규칙: 거래(FIN_TXN)에는 아무 필드도 더하지 않는다. 후보는 저장하지 않는 투영이다(저장 0). "정기로 등록" = 규칙 목록 한 장을 다시 쓰는 연산 1, "아님" = 이 기기 로컬 숨김(연산 0).
// 금액은 원 단위 정수 문자열(계산은 BigInt). 가맹점 이름은 화면에만 쓰고 내보내기(LIFE_STATE)에는 넣지 않는다.
import {shiftMonth,finError,parseWonInput} from './fin-ledger.mjs';
import {merchantKey} from './fin-plan.mjs';

export const RECURRING_ID='recurring';                 // fin-model.mjs RECURRING_ID와 같아야 한다(시험이 대조)
export const RULE_MAX=60,TOLERANCE_DEFAULT=10,TOLERANCE_MAX=50;
export const CANDIDATE_MIN_MONTHS=3,CANDIDATE_MIN_SHARE_PCT=60,CANDIDATE_WINDOW_MONTHS=12;
export const HIDDEN_KEY='lb.fin.recurring.hidden.v1',HIDDEN_MAX=200;
export const RECURRING_TEXT=Object.freeze({
  tab:'정기 결제',total:'매달 나가는 돈',empty:'등록한 정기 결제가 없습니다. 아래 후보에서 "정기로 등록"을 누르면 여기에 모입니다.',
  candidates:'정기 결제 후보',noCandidates:'후보가 없습니다. 같은 가게·비슷한 금액이 서로 다른 달에 3번 이상 나온 결제만 후보가 됩니다.',
  PAID:'이번 달 결제 있음',PENDING:'이번 달 아직',DIFFERENT:'이번 달 금액 다름',chip:'정기 결제: ',
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

// 후보 추출. lines: 화면 투영의 줄(날짜·가맹점·종류·net) — net은 BigInt·정수 문자열·쉼표/원 표기 문자열 모두 받는다.
// 조건: 최근 12개월 지출 중 같은 가맹점(정규화)·비슷한 금액(±10%)이 서로 다른 달에 3번 이상, 그 가맹점 결제의 60% 이상이 그 금액대.
// 이미 규칙에 있는 가맹점과 이 기기에서 "아님"으로 숨긴 가맹점은 뺀다.
export function findCandidates(lines,today,{rules=[],hidden=new Set(),tolerancePct=TOLERANCE_DEFAULT}={}){
  const now=today.slice(0,7),from=shiftMonth(now,-(CANDIDATE_WINDOW_MONTHS-1));
  const known=new Set(rules.map(r=>r.match.merchant)),groups=new Map();
  for(const l of lines){
    if(l.kind!=='EXPENSE'||typeof l.date!=='string'||l.date>today||l.date.slice(0,7)<from)continue;
    const a=wonOf(l.net);if(a===null)continue;
    const key=recurringKey(l.merchant);if(!key||known.has(key)||hidden.has(key))continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({date:l.date,amount:a,merchant:l.merchant,category:l.category??null});
  }
  const out=[];
  for(const [key,all] of groups){
    // 가장 많은 결제를 묶는 금액대를 찾는다: 각 결제 금액을 중심으로 ±tolerancePct% 안의 결제 수가 가장 많은 것(동률은 낮은 금액).
    let best=null;
    for(const c of [...new Set(all.map(x=>x.amount))].sort((p,q)=>p<q?-1:p>q?1:0)){
      const members=all.filter(x=>within(x.amount,c,tolerancePct));
      if(!best||members.length>best.members.length)best={center:c,members};
    }
    const months=new Set(best.members.map(x=>x.date.slice(0,7)));
    if(months.size<CANDIDATE_MIN_MONTHS||best.members.length*100<all.length*CANDIDATE_MIN_SHARE_PCT)continue;
    const sorted=[...best.members].sort((p,q)=>p.date.localeCompare(q.date)),last=sorted.at(-1);
    out.push({key,merchant:last.merchant,amount:lowerMedian(best.members.map(x=>x.amount)).toString(),count:best.members.length,months:months.size,total:all.length,lastDate:last.date,category:last.category});
  }
  return out.sort((p,q)=>{const a=BigInt(p.amount),b=BigInt(q.amount);return a>b?-1:a<b?1:p.key.localeCompare(q.key);});
}

// ---------- 규칙 목록(저장할 한 장) ----------
export const rulesOf=data=>data?.rules??[];
const nameOK=n=>typeof n==='string'&&n.isWellFormed()&&n.trim().length>0&&[...n.trim()].length<=60;
// 규칙 하나를 목록에 더한 새 data를 만든다. 같은 가맹점 규칙이 이미 있으면 거부(후보에서도 빠진다). 반환값은 validateFinData('FIN_RECURRING','recurring',data)를 통과하는 모양.
export function addRule(data,{name,merchant,amount,tolerancePct=TOLERANCE_DEFAULT},{id,now}){
  const rules=rulesOf(data),key=recurringKey(merchant),won=wonOf(amount);
  if(!key||won===null||!POS.test(won.toString()))throw finError('INVALID_FIN_RECURRING_AMOUNT');
  if(!nameOK(name))throw finError('INVALID_FIN_TEXT');
  if(!Number.isInteger(tolerancePct)||tolerancePct<0||tolerancePct>TOLERANCE_MAX)throw finError('INVALID_FIN_RECURRING_TOLERANCE');
  if(rules.length>=RULE_MAX)throw finError('FIN_RECURRING_LIMIT');
  if(rules.some(r=>r.match.merchant===key))throw finError('FIN_RECURRING_DUPLICATE');
  return {rules:[...structuredClone(rules),{id,name:name.trim(),match:{merchant:key,amount:won.toString(),tolerancePct},cycle:'MONTHLY',hidden:false,createdAt:now}]};
}
export function setRuleHidden(data,id,hidden){
  const rules=rulesOf(data);
  if(!rules.some(r=>r.id===id))throw finError('FIN_RECURRING_UNKNOWN_RULE');
  return {rules:rules.map(r=>({...structuredClone(r),hidden:r.id===id?Boolean(hidden):r.hidden}))};
}

// ---------- 규칙 상태 ----------
// 이번 달 결제 확인: 같은 가맹점의 이번 달 지출 중 규칙 금액대(±tolerancePct%)가 있으면 PAID, 같은 가맹점 결제만 있으면 DIFFERENT, 없으면 PENDING.
// lastDate: 규칙 금액대에 맞는 가장 최근 결제일(없으면 null).
export function ruleStatus(rule,lines,today){
  const key=rule.match.merchant,center=BigInt(rule.match.amount),pct=rule.match.tolerancePct,month=today.slice(0,7);
  let paid=false,other=false,last=null,otherAmount=null;
  for(const l of lines){
    if(l.kind!=='EXPENSE'||typeof l.date!=='string'||l.date>today||recurringKey(l.merchant)!==key)continue;
    const a=wonOf(l.net);if(a===null)continue;
    const ok=within(a,center,pct);
    if(ok&&(last===null||l.date>last))last=l.date;
    if(l.date.slice(0,7)!==month)continue;
    if(ok)paid=true;else{other=true;otherAmount=a.toString();}
  }
  return {state:paid?'PAID':other?'DIFFERENT':'PENDING',lastDate:last,otherAmount:paid?null:otherAmount};
}
// 매달 나가는 돈 합계: 숨기지 않은 규칙의 월 금액 합(BigInt 문자열).
export const monthlyTotal=rules=>rules.filter(r=>!r.hidden).reduce((s,r)=>s+BigInt(r.match.amount),0n).toString();
// Fold 결제 초안이 규칙과 맞는가(가맹점 정규화 같음 + 금액 ±tolerancePct%). 맞으면 규칙을 돌려준다(칩 표시용, 자동 확정 없음).
export function matchDraft(rules,draft){
  const key=recurringKey(draft?.merchant),a=wonOf(draft?.amount);
  if(!key||a===null)return null;
  return rules.find(r=>!r.hidden&&r.match.merchant===key&&within(a,BigInt(r.match.amount),r.match.tolerancePct))??null;
}

// ---------- 이 기기 로컬 숨김("아님", 연산 0) ----------
export function loadHidden(storage){
  try{const v=JSON.parse(storage?.getItem(HIDDEN_KEY)??'[]');if(Array.isArray(v))return new Set(v.filter(x=>typeof x==='string'&&x&&x.length<=120).slice(0,HIDDEN_MAX));}catch{/* 저장소가 막혀 있으면 빈 목록 */}
  return new Set();
}
export function hideCandidate(storage,key){
  const set=loadHidden(storage);set.add(key);
  const list=[...set].slice(-HIDDEN_MAX);
  try{storage?.setItem(HIDDEN_KEY,JSON.stringify(list));}catch{/* 숨김 기억은 실패해도 무시 */}
  return new Set(list);
}
