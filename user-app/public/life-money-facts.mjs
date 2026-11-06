// 돈 사실 (Q1A, 설계 Q1D §3 판정 규칙). 가계부(wholeLifeView의 fin)에서 업적·월간 퀘스트가 쓰는 사실만 뽑는다: 예산을 지킨 달, 사용률, 거래가 있는 날짜.
// 금액·가게·분류·계정은 돌려주지 않는다. 화면과 숫자가 어긋나지 않게 판정은 기존 budgetStatus를 그대로 쓴다. 쓰기·시계·난수 없음.
import {prepare} from './fin-charts.mjs';
import {budgetStatus} from './fin-plan.mjs';
import {monthSpan} from './fin-ledger.mjs';

// 지킨 달 = 지난달이고, 전체 예산이 있고, 금액을 다 알고(모름 줄 0), 예산을 넘지 않은 달. 금액을 모르는 달은 0원이 아니므로 세지 않고 연속도 끊긴다.
export function monthKept(s,nowMonth){return s.month<nowMonth&&s.total!==null&&s.dataState==='KNOWN'&&s.unknownRows===0&&s.total.status==='OK';}

function compute(fin,today){
  const prep=prepare(fin),nowMonth=today.slice(0,7),byMonth=new Map();
  for(const l of prep.lines){const list=byMonth.get(l.month);if(list)list.push(l);else byMonth.set(l.month,[l]);}
  const starts=fin.budgets.map(b=>b.data.effectiveFrom).filter(m=>m<=nowMonth).sort();
  const months={},series=[];
  for(const m of starts.length?monthSpan(starts[0],nowMonth,Infinity):[]){
    const s=budgetStatus({...prep,lines:byMonth.get(m)??[]},fin.budgets,m,today),budget=s.total!==null,kept=monthKept(s,nowMonth);
    series.push({month:m,budget,kept});
    if(budget)months[m]={budget:true,kept,usedPermille:s.dataState==='KNOWN'&&s.total.usedPermille!==null?Number(s.total.usedPermille):null};
  }
  const ledgerDates=[...new Set(prep.lines.map(l=>l.date).filter(d=>typeof d==='string'&&d<=today))].sort();
  return {months,series,ledgerDates};
}

// 가계부가 꺼져 있으면 null. 계산에 실패해도 오늘 화면을 막지 않도록 null(가계부 없음과 같게)을 돌려준다.
// 같은 fin 객체·같은 날짜면 같은 객체를 돌려준다(achieve의 기억 1칸이 그대로 맞게).
let memo=null;
export function moneyFacts(fin,today){
  if(!fin)return null;
  if(memo&&memo.fin===fin&&memo.today===today)return memo.out;
  let out=null;
  try{out=compute(fin,today);}catch{out=null;}
  memo={fin,today,out};
  return out;
}
