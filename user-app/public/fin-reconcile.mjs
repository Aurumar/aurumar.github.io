// B64B: 명세서 행 ↔ 장부 대조(새것/이미 있음/중복 의심) + 분류 제안 + 저장 계획(순수 함수, DOM·저장·네트워크 없음).
// 설계 AUTOPILOT/design/B64D_STATEMENT_IMPORT_DESIGN.md §5·§6·§7. 모든 판정은 제안이다: 자동 삭제·자동 무효화·자동 확정 없음.
// 저장은 기존 FIN_TXN(직접 입력 거래) 1건 = 연산 1개. 새 기록 종류·새 필드 0, fin-model.mjs 변경 0.
// 같은 파일을 다시 넣으면 방금 저장한 거래가 "이미 있음"으로 잡혀 다시 저장되지 않는다(idempotent).
import {merchantKey} from './fin-plan.mjs';
import {ledgerMatch} from './fin-recurring.mjs';
import {shiftMonth,finError} from './fin-ledger.mjs';

export const SAME_DAYS=1,SUSPECT_DAYS=3,CANCEL_LOOKBACK_DAYS=90,FX_PERCENT=3n,SAVE_MAX=300;
export const STATUS_TEXT=Object.freeze({SAME:'이미 있음',SUSPECT:'중복 의심',NEW:'새것',PAIR:'파일 안 취소 짝',SKIP:'건너뜀',FAIL:'해석 실패'});
export const REASON_TEXT=Object.freeze({
  SAME_EXACT:'같은 계정·같은 금액·날짜 ±1일·가맹점 비슷함',
  SAME_INSTALL:'할부 회차 · 원거래가 장부에 있음',
  SUSPECT_TAKEN:'맞는 장부 줄이 이미 다른 명세서 행과 짝지어짐',
  SUSPECT_VOIDED:'무효화된 거래와 같음',
  SUSPECT_NEAR:'같은 계정·같은 금액이지만 날짜 차이 또는 가맹점 이름이 다름',
  SUSPECT_FX:'해외 결제 · 원화 금액이 ±3% 안(환율 차이)',
  SUSPECT_OTHER_ACCOUNT:'다른 계정에 같은 결제가 있음(간편결제·결제 알림으로 넣었을 수 있음)',
  SUSPECT_IN_FILE:'명세서 안에 같은 날짜·금액·가맹점 행이 또 있음',
  SUSPECT_INSTALL:'할부 회차 · 과거 이력에 비슷한 거래(금액 모름)',
  PAIR_CANCEL:'파일 안에서 승인과 취소가 짝지어짐 · 둘 다 저장 안 함',
  NEW_PLAIN:'장부에 없음',
  NEW_REFUND_PAIR:'파일 안 취소 · 원거래가 장부에 있어 환불로 추가',
  NEW_REFUND_PAST:'지난 거래의 취소 → 환불로 추가',
  NEW_REFUND_PARTIAL:'부분 취소 → 취소 금액만 환불로 추가',
  NEW_INSTALL_ORIGINAL:'할부 원거래로 추가(이용일·전액) · 장부에 원거래 없음',
  SKIP_NO_ORIGINAL:'취소인데 원 거래가 장부에 없음 · 건너뜀',
  FAIL_PARSE:'해석 실패 · 저장할 수 없음',
});

const dayNum=d=>Date.parse(d+'T00:00:00Z')/86400000;
const absBig=x=>x<0n?-x:x;
// 가게 비슷함: merchantKey 같음 1.0, 한쪽이 다른 쪽을 포함(2자 이상) 0.8, 2글자 조각 공통 비율 ≥ 0.5이면 0.6, 한쪽이 빈칸 0.5, 그 외 0.
export function merchantSim(a,b){
  const x=merchantKey(a),y=merchantKey(b);
  if(!x||!y)return 0.5;
  if(x===y)return 1;
  if(x.length>=2&&y.length>=2&&(x.includes(y)||y.includes(x)))return 0.8;
  const grams=s=>{const g=new Set(),c=[...s];for(let i=0;i+1<c.length;i++)g.add(c[i]+c[i+1]);return g;};
  const A=grams(x),B=grams(y);if(!A.size||!B.size)return 0;
  let common=0;for(const g of A)if(B.has(g))common++;
  return 2*common/(A.size+B.size)>=0.5?0.6:0;
}

// 장부 줄 후보: 소비·환불·선불 충전 줄(원천 행 + 직접 거래, 무효 제외) + 무효화된 직접 거래(따로).
function ledgerOf(fin){
  const inst=new Map((fin.txns??[]).map(t=>[t.id,t.data.installments??0]));
  const lines=(fin.lines??[]).filter(l=>['EXPENSE','REFUND','PREPAID_LOAD'].includes(l.kind)&&l.net!==null&&l.net!==undefined)
    .map(l=>({key:l.key,source:l.source,date:l.date,day:dayNum(l.date),accountId:l.accountId,net:BigInt(l.net),merchant:l.merchant??'',kind:l.kind,category:l.category??null,subcategory:l.subcategory??'',installments:l.source==='TXN'?inst.get(l.key.slice(2))??0:null}));
  const voided=(fin.txns??[]).filter(t=>t.data.voided&&['EXPENSE','REFUND','PREPAID_LOAD'].includes(t.data.kind))
    .map(t=>({key:'V:'+t.id,date:t.data.date,day:dayNum(t.data.date),accountId:t.data.accountId,net:t.data.kind==='REFUND'?-BigInt(t.data.amount):BigInt(t.data.amount),merchant:t.data.merchant??''}));
  return {lines,voided};
}
const best=cands=>cands.sort((a,b)=>a.dd-b.dd||b.sim-a.sim||a.line.key.localeCompare(b.line.key))[0]??null;

// rows: fin-statement normalizeRows 결과 행 + accountId(카드별로 고른 계정, 없으면 null). fin: 화면 투영(whole.fin).
// 결과 항목: {key, row, status, reason, match(장부 줄 요약|null), partner(파일 안 짝 key|null), kind, category, subcategory, suggestFrom, checked, forcible}
export function reconcileStatement(rows,fin,{labels=fin?.labels,localDate=null}={}){
  const {lines,voided}=ledgerOf(fin??{}),used=new Set(),items=rows.map(row=>({key:'R'+row.idx,row,status:null,reason:null,match:null,partner:null,kind:null,category:null,subcategory:'',suggestFrom:null,checked:false,forcible:false}));
  const order=[...items].sort((a,b)=>(a.row.date??'').localeCompare(b.row.date??'')||a.row.idx-b.row.idx);
  const amt=it=>BigInt(it.row.amount);
  // 날짜별 색인(같은 계정, ±3일만 본다): 명세서 행 수 × 장부 줄 수로 커지지 않게.
  const byDay=new Map();for(const l of lines){const k=l.accountId+'|'+l.day;if(!byDay.has(k))byDay.set(k,[]);byDay.get(k).push(l);}
  const near=(it,max)=>{const d=dayNum(it.row.date),out=[];for(let k=d-max;k<=d+max;k++)for(const l of byDay.get(it.row.accountId+'|'+k)??[])out.push({line:l,dd:Math.abs(k-d),sim:merchantSim(it.row.merchant,l.merchant)});return out;};
  const summary=l=>({key:l.key,source:l.source??'TXN',date:l.date,merchant:l.merchant,net:l.net.toString(),accountId:l.accountId});
  const set=(it,status,reason,match=null)=>{it.status=status;it.reason=reason;it.match=match?summary(match):null;};
  // 0) 해석 실패·계정 없음
  for(const it of items){
    if(!it.row.accountId){set(it,'FAIL','FAIL_PARSE');it.row.problem??='CARD';continue;}
    if(it.row.problem&&it.row.problem!=='INSTALL_TOTAL')set(it,'FAIL','FAIL_PARSE');
  }
  // 1) 이미 있음(1:1 탐욕, 날짜순, 날짜 차이 작음 → 가게 비슷함 높음)
  for(const it of order){
    if(it.status)continue;
    if(it.row.problem==='INSTALL_TOTAL'){
      // 할부 총액을 모르는 회차 행: 같은 계정·날짜 ±1일·가맹점 비슷 + 할부 개월이 같은 직접 거래 → 이미 있음, 원천 행만 비슷 → 의심.
      const c=near(it,SAME_DAYS).filter(x=>!used.has(x.line.key)&&x.sim>=0.8&&x.line.kind==='EXPENSE');
      const txn=best(c.filter(x=>x.line.source==='TXN'&&x.line.installments>=2&&(it.row.months===null||x.line.installments===it.row.months)));
      if(txn){used.add(txn.line.key);set(it,'SAME','SAME_INSTALL',txn.line);continue;}
      const batch=best(c.filter(x=>x.line.source==='BATCH'));
      if(batch)set(it,'SUSPECT','SUSPECT_INSTALL',batch.line);else set(it,'FAIL','FAIL_PARSE');
      continue;
    }
    const a=amt(it),hit=best(near(it,SAME_DAYS).filter(x=>!used.has(x.line.key)&&x.line.net===a&&x.sim>=0.8));
    if(hit){used.add(hit.line.key);set(it,'SAME',it.row.round>=2&&(it.row.months??0)>=2?'SAME_INSTALL':'SAME_EXACT',hit.line);}
  }
  // 2) 파일 안 승인 + 취소 짝(같은 계정·같은 금액·가맹점 비슷·승인이 취소보다 앞이거나 같은 날)
  for(const it of order){
    if(it.status||amt(it)>=0n)continue;
    const a=-amt(it),partner=order.find(p=>p!==it&&(p.status===null||p.status==='SAME')&&!p.partner&&p.row.accountId===it.row.accountId&&amt(p)===a&&p.row.date<=it.row.date&&merchantSim(p.row.merchant,it.row.merchant)>=0.8);
    if(!partner)continue;
    partner.partner=it.key;it.partner=partner.key;
    if(partner.status==='SAME'){set(it,'NEW','NEW_REFUND_PAIR');it.kind='REFUND';it.category=partner.match?lines.find(l=>l.key===partner.match.key)?.category??null:null;}
    else{set(partner,'PAIR','PAIR_CANCEL');set(it,'PAIR','PAIR_CANCEL');}
  }
  // 3) 중복 의심 → 취소 처리 → 새것
  const seen=new Map();
  for(const it of order){
    if(it.status)continue;
    const a=amt(it),c=near(it,SUSPECT_DAYS),dup=it.row.date+'|'+a+'|'+merchantKey(it.row.merchant)+'|'+it.row.accountId;
    const taken=best(c.filter(x=>used.has(x.line.key)&&x.line.net===a&&x.dd<=SAME_DAYS&&x.sim>=0.8));
    const d=dayNum(it.row.date),vo=voided.find(v=>v.accountId===it.row.accountId&&v.net===a&&Math.abs(v.day-d)<=SAME_DAYS&&merchantSim(it.row.merchant,v.merchant)>=0.8);
    const close=best(c.filter(x=>!used.has(x.line.key)&&x.line.net===a));
    const fx=it.row.foreign?best(c.filter(x=>!used.has(x.line.key)&&x.dd<=SAME_DAYS&&x.sim>=0.8&&absBig(x.line.net-a)*100n<=FX_PERCENT*absBig(a))):null;
    const other=a>0n?ledgerMatch(lines.filter(l=>l.accountId!==it.row.accountId).map(l=>({...l,net:l.net.toString()})),{amount:a.toString(),merchant:it.row.merchant},[-1,0,1].map(k=>new Date((d+k)*86400000).toISOString().slice(0,10))):null;
    if(taken)set(it,'SUSPECT','SUSPECT_TAKEN',taken.line);
    else if(vo){set(it,'SUSPECT','SUSPECT_VOIDED');it.match={key:vo.key,source:'VOIDED',date:vo.date,merchant:vo.merchant,net:vo.net.toString(),accountId:vo.accountId};}
    else if(close)set(it,'SUSPECT','SUSPECT_NEAR',close.line);
    else if(fx)set(it,'SUSPECT','SUSPECT_FX',fx.line);
    else if(other)set(it,'SUSPECT','SUSPECT_OTHER_ACCOUNT',lines.find(l=>l.key===other.key));
    else if(seen.has(dup))set(it,'SUSPECT','SUSPECT_IN_FILE');
    else if(a<0n){
      // 짝 없는 취소: 같은 계정의 90일 안 지출 중 가게가 비슷한 것. 같은 금액이면 전액 취소, 더 크면 부분 취소 → 환불. 없으면 건너뜀.
      const orig=lines.filter(l=>l.accountId===it.row.accountId&&l.kind==='EXPENSE'&&l.day<=d&&d-l.day<=CANCEL_LOOKBACK_DAYS&&l.net>=-a&&merchantSim(it.row.merchant,l.merchant)>=0.8)
        .sort((x,y)=>Number(x.net!==-a)-Number(y.net!==-a)||y.day-x.day)[0];
      if(orig){set(it,'NEW',orig.net===-a?'NEW_REFUND_PAST':'NEW_REFUND_PARTIAL',orig);it.kind='REFUND';it.category=orig.category;it.subcategory=orig.subcategory;}
      else set(it,'SKIP','SKIP_NO_ORIGINAL');
    }
    else set(it,'NEW',it.row.round>=2&&(it.row.months??0)>=2?'NEW_INSTALL_ORIGINAL':'NEW_PLAIN');
    if(!seen.has(dup))seen.set(dup,it.key);
  }
  // 4) 기본 처리: 새것만 체크(소비 아님 제안이면 체크 안 함), 그 밖은 "그래도 새것으로"를 눌러야 체크 가능. 해석 실패는 저장 불가.
  const ctx=suggestContext(fin??{},{labels,localDate});
  for(const it of items){
    it.forcible=['SAME','SUSPECT','PAIR','SKIP'].includes(it.status)&&it.row.amount!==null;   // FIX37A (HUNT37 F6): 할부 총액을 모르면(금액 null) 새것으로 저장할 금액이 없다
    if(it.status==='FAIL')continue;
    const s=suggestFor(it,ctx);if(!it.kind)it.kind=s.kind;
    if(it.kind==='EXPENSE'||it.kind==='REFUND'){if(!it.category||!Object.hasOwn(ctx.labels,it.category)){it.category=s.category;it.subcategory=s.subcategory;it.suggestFrom=s.from;}else it.suggestFrom='ORIGINAL';}
    else{it.category=null;it.subcategory='';it.suggestFrom=s.from;}
    it.checked=it.status==='NEW'&&it.kind!=='NONE'&&!it.row.flags?.includes('DATE_AMBIGUOUS')&&!it.row.flags?.includes('EARLY');   // FIX35 (HUNT35 D8)·FIX37A (HUNT37 F4): 두 자리 연도 순서가 모호하거나 기간보다 앞인 행은 소유자가 확인하고 체크
  }
  return items;
}
// FIX35 (HUNT35 D2): 다시 대조한 뒤에도 "그래도 새것으로"(c.forced)를 이어 갈지. 장부에 같은 거래가 생겨 "이미 있음"(SAME)이 됐으면 풀어 대기열에서 뺀다:
// 고를 때는 SAME이 아니었거나(c.forcedFrom), 이미 저장을 시도했다(c.tried, 응답을 잃었을 수 있음). 고를 때부터 SAME이었고 아직 저장을 시도하지 않았으면 유지한다.
// 결정적 저장 ID는 쓰지 않는다: 같은 id·빈 heads 재전송을 코어가 어떻게 다루는지(거절·충돌 가지) 이 범위에서 확인하지 못했고, 무효화한 거래를 다시 가져오면 id가 부딪힌다.
export const keepForced=(it,c)=>Boolean(c?.forced)&&it.forcible&&!(it.status==='SAME'&&(c.tried||c.forcedFrom!=='SAME'));
// FIX35 (HUNT35 D1): 저장 완료 키(done)는 파일 + 표(시트) + 행. 여러 표 명세서에서 표를 바꿔도 같은 행 번호(R1…)의 새 거래를 "이미 저장함"으로 건너뛰지 않는다.
export const statementSaveKey=({sha12,tableIndex=0},it)=>sha12+':T'+tableIndex+':'+it.key;

// ---------- 분류 제안(§7) ----------
const NOT_SPEND=/카드대금|결제대금|대금결제|자동이체|카드결제/;
const PREPAID=/상품권|제로페이|페이머니|선불|충전/;
const FEE=/연회비|이자|수수료/;
export const CHIP_DEFAULTS=Object.freeze(['FOOD','SHOPPING','TRANSPORT','LIVING','DIGITAL','MEDICAL','OTHER']);
export function suggestContext(fin,{labels=fin.labels,localDate=null}={}){
  const expense=labels?.expense??{},byMerchant=new Map(),freq=new Map();
  const from=localDate?shiftMonth(localDate.slice(0,7),-5):null;
  for(const l of fin.lines??[]){
    if(!(l.kind==='EXPENSE'||l.kind==='REFUND')||!l.category||!Object.hasOwn(expense,l.category))continue;
    const k=merchantKey(l.merchant);
    if(k){const old=byMerchant.get(k),rank=x=>(x.source==='TXN'?'1':'0')+x.date;if(!old||rank(l)>=rank(old))byMerchant.set(k,{category:l.category,subcategory:l.subcategory??'',source:l.source,date:l.date});}
    if(l.kind==='EXPENSE'&&(!from||l.month>=from&&l.month<=localDate.slice(0,7)))freq.set(l.category,(freq.get(l.category)??0)+1);
  }
  const rules=(fin.rules??[]).map(r=>({id:r.id,...r.data})).filter(r=>r.active!==false&&r.category&&Object.hasOwn(expense,r.category)).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const ranked=[...freq.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([c])=>c);
  const chips=[...new Set([...ranked,...CHIP_DEFAULTS.filter(c=>Object.hasOwn(expense,c))])].slice(0,7);
  return {labels:expense,byMerchant,rules,ranked,chips};
}
export function suggestFor(it,ctx){
  const m=it.row.merchant??'',low=m.toLowerCase(),neg=it.row.amount!==null&&it.row.amount.startsWith('-');
  const kind=neg?'REFUND':NOT_SPEND.test(m)?'NONE':PREPAID.test(m)?'PREPAID_LOAD':'EXPENSE';
  if(kind==='NONE'||kind==='PREPAID_LOAD')return {kind,category:null,subcategory:'',from:'PATTERN'};
  if(FEE.test(m)&&Object.hasOwn(ctx.labels,'FINANCE_FEE'))return {kind,category:'FINANCE_FEE',subcategory:'',from:'PATTERN'};
  const k=merchantKey(m),hit=k?ctx.byMerchant.get(k):null;
  if(hit)return {kind,category:hit.category,subcategory:hit.subcategory,from:'MERCHANT'};
  const rule=ctx.rules.find(r=>(r.accountId===null||r.accountId===undefined||r.accountId===it.row.accountId)&&low.includes(String(r.merchantContains).toLowerCase()));
  if(rule)return {kind,category:rule.category,subcategory:rule.subcategory??'',from:'RULE'};
  if(it.row.transit&&Object.hasOwn(ctx.labels,'TRANSPORT'))return {kind,category:'TRANSPORT',subcategory:'',from:'PATTERN'};
  if(ctx.ranked[0])return {kind,category:ctx.ranked[0],subcategory:'',from:'FREQUENT'};
  return {kind,category:Object.hasOwn(ctx.labels,'OTHER')?'OTHER':Object.keys(ctx.labels)[0]??null,subcategory:'',from:'DEFAULT'};
}
// 같은 가맹점 묶어 바꾸기: 새것 중 merchantKey가 같은 항목 key 목록(자기 포함).
export function sameMerchantKeys(items,key){
  const it=items.find(x=>x.key===key),k=it?merchantKey(it.row.merchant):'';
  return k?items.filter(x=>x.status==='NEW'&&merchantKey(x.row.merchant)===k).map(x=>x.key):[key];
}
// 과거 이력 묶음이 덮은 (달, 계정)에 들어가는 행 수: "이 달은 과거 이력 묶음이 덮고 있어 대부분 '이미 있음'으로 뜹니다".
export function coveredByBatches(items,fin){
  const cover=new Set();for(const b of fin?.batches??[])for(const a of b.accountIds??[])cover.add(b.chunk+'|'+a);
  const months=new Set();let rows=0;
  for(const it of items)if(it.row.date&&it.row.accountId&&cover.has(it.row.date.slice(0,7)+'|'+it.row.accountId)){rows++;months.add(it.row.date.slice(0,7));}
  return {rows,months:[...months].sort()};
}

// ---------- 저장 계획(§6) ----------
// 고른 항목(체크됨 · 저장 안 함 아님 · 새것이거나 "그래도 새것으로")을 날짜순으로, 한 번에 300건까지.
export function selectForSave(items,{max=SAVE_MAX}={}){
  const pickable=items.filter(it=>it.checked&&it.kind&&it.kind!=='NONE'&&it.status!=='FAIL'&&it.row.amount!==null&&(it.status==='NEW'||it.forced))
    .sort((a,b)=>a.row.date.localeCompare(b.row.date)||a.row.idx-b.row.idx);
  return {queue:pickable.slice(0,max),later:Math.max(0,pickable.length-max)};
}
// buildTxn(fin-ledger.mjs) 입력. 원본 파일 내용은 넣지 않는다: 메모에는 파일 SHA256 앞 12자와 행 번호, 할부·외화·수수료·교통 묶음 건수만.
// FIX35: 두 번째 표(시트)부터는 메모에 표 번호를 붙인다(첫 표는 예전 그대로).
// FIX37A (HUNT37 F6): 금액 null은 BigInt TypeError(코드 없음 → fail()이 연결 오류로 다룸) 대신 이 기기 안의 입력 오류(finLocal)로 멈춘다.
export function statementTxnInput(it,{sha12,monthTag,tableIndex=0}){
  if(it.row.amount===null||it.row.amount===undefined)throw finError('INVALID_FIN_AMOUNT');
  const r=it.row,kind=it.kind,spend=kind==='EXPENSE'||kind==='REFUND',memo=['명세서 '+sha12+(tableIndex>0?' · 표 '+(tableIndex+1):'')+' · 행 '+(r.idx+1)];
  if((r.months??0)>=2)memo.push('할부 '+r.months+'개월'+(r.round?' (명세서 '+r.round+'회차)':''));
  if(r.transit)memo.push('교통 묶음 '+r.transit+'건');
  if(r.foreign&&!r.original)memo.push('외화 '+r.foreign.amount+(r.foreign.currency?' '+r.foreign.currency:''));
  if(r.fee)memo.push('수수료 '+r.fee+'원');
  if(it.reason==='NEW_REFUND_PARTIAL')memo.push('부분 취소');
  return {date:r.date,kind,amount:BigInt(r.amount)<0n?(-BigInt(r.amount)).toString():r.amount,accountId:r.accountId,toAccountId:'',
    category:spend?it.category:'',subcategory:spend?it.subcategory??'':'',merchant:r.merchant,memo:memo.join(' · '),tags:'명세서:'+monthTag,
    installments:kind==='EXPENSE'&&(r.months??0)>=2?String(r.months):'',currency:spend&&r.original?r.original.currency:'',originalAmount:spend&&r.original?r.original.amount:''};
}
// 저장 전 검사: 남은 연산·이번 실행 저장 예산·거래 한도. 모르면 막지 않는다(서버가 최종 판정). 문구 코드는 fin-ledger FIN_ERROR_TEXT.
export function checkStatementSave(n,{ops=null,local=null,txnCount=0,txnLimit=8000}={}){
  const errors=[];
  if(!n)errors.push('FIN_IMPORT_NOTHING');
  if(ops?.known&&n>ops.remaining)errors.push('FIN_IMPORT_OP_LIMIT');
  if(local?.mode==='HEAD'&&local.remainingOps!==null&&local.remainingOps!==undefined&&n>local.remainingOps)errors.push('FIN_IMPORT_SESSION_BUDGET');
  if(txnCount+n>txnLimit)errors.push('APP_ENTITY_LIMIT');
  return {ok:!errors.length,errors,need:n,remaining:ops?.known?ops.remaining:null};
}
// 순차 저장 일꾼: queue 순서대로 save(항목)를 하나씩 부른다. 던지면 그 자리에서 멈추고(저장된 것은 done에 남음) 예외를 그대로 올린다.
// 다시 부르면 done에 있는 것은 건너뛰고 남은 것만 저장한다(이어하기).
export async function runStatementSave({queue,done,save,shouldStop=()=>false,onProgress=()=>{}}){
  let saved=0,stopped=false;
  for(const q of queue){
    if(done.has(q.key))continue;
    if(shouldStop()){stopped=true;break;}
    await save(q);
    done.add(q.key);saved++;onProgress(saved,q);
  }
  return {saved,stopped};
}
