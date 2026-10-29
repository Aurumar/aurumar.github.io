// FIN01 집계: 원천 행(FIN_BATCH)과 거래(FIN_TXN)를 하나의 줄 목록으로 합치고 월·분류별로 센다.
// 규칙: 거래가 원천 행을 sourceRefs로 가리키면 그 행은 빼고 거래만 센다(이중 집계 금지).
// 이체는 소비가 아니다. 선불 전환은 따로 센다. 모르는 순액(null)은 합계에 넣지 않고 개수로 보여준다.
import {EXPENSE_CATEGORIES,INCOME_CATEGORIES,ACCOUNT_TYPES,TXN_KINDS,FIN_LIMITS} from './fin-model.mjs';

// Spending Lab V3.7 분류 → 표준 분류. 원래 분류 이름은 subcategory로 보존한다.
export const SOURCE_CATEGORY_MAP=Object.freeze({
  '가구·침구 판매처':['LIVING','가구·침구'],
  '개인정보 주의·품목 미확인':['OTHER','품목 미확인'],
  '게임사·게임 결제':['GAME','게임 결제'],
  '교육·학습':['EDU','교육·학습'],
  '교통':['TRANSPORT','대중교통'],
  '교통·배송·공공':['TRANSPORT','배송·공공'],
  '기기 서비스·수리':['LIVING','수리'],
  '기타·결제대행 미분류':['OTHER','결제대행'],
  '기타·사용처 추가 확인':['OTHER','확인 필요'],
  '동영상·콘텐츠 구독':['DIGITAL','콘텐츠 구독'],
  '디지털 구독·소프트웨어':['DIGITAL','소프트웨어'],
  '디지털 서비스·구독 후보':['DIGITAL','구독 후보'],
  '상품권·선불 전환':['OTHER','선불 전환'],
  '상품권·선불·보증금':['OTHER','선불·보증금'],
  '생활·패션 판매처':['SHOPPING','패션·생활'],
  '식품·장보기 판매처':['FOOD','장보기'],
  '앱마켓 결제·서비스 미확인':['DIGITAL','앱마켓'],
  '온라인몰·간편결제 미분류':['SHOPPING','온라인몰'],
  '외식·배달·카페':['FOOD','외식·배달·카페'],
  '의료·약국':['MEDICAL','의료·약국'],
  '이발·미용':['BEAUTY','이발·미용'],
  '전자제품·가전 판매처':['SHOPPING','전자제품'],
  '통신':['COMM','통신'],
  '편의점·간식 판매처':['FOOD','편의점·간식'],
});
export function mapSourceCategory(label){
  const hit=SOURCE_CATEGORY_MAP[label];
  return hit?{category:hit[0],subcategory:hit[1]}:{category:'OTHER',subcategory:label||'미분류'};
}
// 규칙의 세 효과는 각각 따로 정한다: 우선순위 순서로 그 효과를 가진(null이 아닌) 첫 번째 맞는 규칙이 이긴다.
// category: 가져온 원천 행(선불 제외)에만. costType·recurring: 소비 줄(지출·환불, 원천·직접 입력 모두).
const ruleHits=(r,line)=>r.active&&(r.accountId===null||r.accountId===line.accountId)&&line.merchant.toLowerCase().includes(r.merchantContains.toLowerCase());
export function ruleEffect(rules,line,effect){
  for(const r of rules)if((r[effect]??null)!==null&&ruleHits(r,line))return r;
  return null;
}
function applyRules(rules,line){
  if(line.source==='BATCH'&&line.kind!=='PREPAID_LOAD'){const r=ruleEffect(rules,line,'category');if(r)Object.assign(line,{category:r.category,subcategory:r.subcategory||line.baseSubcategory,ruleId:r.id});}
  if(line.kind==='EXPENSE'||line.kind==='REFUND'){
    const c=ruleEffect(rules,line,'costType'),rc=ruleEffect(rules,line,'recurring');
    Object.assign(line,{costType:c?c.costType:null,costRuleId:c?c.id:null,recurring:rc?rc.recurring:null,recurringRuleId:rc?rc.id:null});
  }
}

// values: 앱 그래프의 WL 엔티티 값 목록(format/entityType/entityId/data).
export function finLines(values){
  const fin=values.filter(v=>v.entityType?.startsWith('FIN_'));
  const accounts=new Map(),txns=[],batches=[],rules=[];
  for(const v of fin){
    if(v.entityType==='FIN_ACCOUNT')accounts.set(v.entityId,v.data);
    else if(v.entityType==='FIN_TXN')txns.push(v);
    else if(v.entityType==='FIN_BATCH')batches.push(v);
    else if(v.entityType==='FIN_RULE')rules.push({id:v.entityId,...v.data});
  }
  rules.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const claimed=new Set();
  for(const t of txns)if(!t.data.voided)for(const r of t.data.sourceRefs)claimed.add(r.batchId+'/'+r.rowId);
  const lines=[],residuals=[];
  for(const b of batches)for(const r of b.data.rows){
    if(r.status==='RESIDUAL'){residuals.push({batchId:b.entityId,rowId:r.rowId,accountId:r.accountId,net:BigInt(r.net),chunk:b.data.chunk});continue;}
    if(claimed.has(b.entityId+'/'+r.rowId))continue;
    const base=mapSourceCategory(r.sourceCategory);
    const line={key:'B:'+b.entityId+'/'+r.rowId,source:'BATCH',date:r.date,month:r.month,accountId:r.accountId,merchant:r.merchant,
      kind:r.role==='PREPAID'?'PREPAID_LOAD':(r.net!==null&&BigInt(r.net)<0n?'REFUND':'EXPENSE'),
      net:r.net===null?null:BigInt(r.net),category:base.category,subcategory:base.subcategory,baseCategory:base.category,baseSubcategory:base.subcategory,ruleId:null,confidence:r.confidence,status:r.status,duplicateGroup:r.duplicateGroup,tags:[]};
    applyRules(rules,line);
    lines.push(line);
  }
  for(const t of txns){
    const d=t.data;if(d.voided)continue;
    const amt=BigInt(d.amount);
    const net=d.kind==='REFUND'?-amt:amt;
    const line={key:'T:'+t.entityId,source:'TXN',date:d.date,month:d.date.slice(0,7),accountId:d.accountId,toAccountId:d.toAccountId,merchant:d.merchant,kind:d.kind,net,
      category:d.category,subcategory:d.subcategory,baseCategory:d.category,baseSubcategory:d.subcategory,ruleId:null,confidence:'HIGH',status:'POSTED',duplicateGroup:null,tags:[...d.tags]};
    applyRules(rules,line);
    lines.push(line);
  }
  lines.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
  return {lines,residuals,accounts};
}
const emptyBucket=()=>({spend:0n,refund:0n,consumption:0n,income:0n,prepaid:0n,transfer:0n,unknownRows:0,byCategory:{}});
function add(bucket,line){
  if(line.net===null){bucket.unknownRows++;return;}
  if(line.kind==='TRANSFER'){bucket.transfer+=line.net;return;}
  if(line.kind==='PREPAID_LOAD'){bucket.prepaid+=line.net;return;}
  if(line.kind==='INCOME'){bucket.income+=line.net;return;}
  if(line.kind==='REFUND')bucket.refund+=-line.net;else bucket.spend+=line.net;
  bucket.consumption+=line.net;
  const c=bucket.byCategory[line.category]??={total:0n,sub:{}};
  c.total+=line.net;c.sub[line.subcategory]=(c.sub[line.subcategory]??0n)+line.net;
}
export function finSummary(values,{from=null,to=null}={}){
  const {lines,residuals,accounts}=finLines(values);
  const inRange=l=>(from===null||l.month>=from)&&(to===null||l.month<=to);
  const total=emptyBucket(),months=new Map(),coverage=new Map();
  for(const l of lines){
    if(!inRange(l))continue;
    add(total,l);
    if(!months.has(l.month))months.set(l.month,emptyBucket());
    add(months.get(l.month),l);
    const ck=l.month+'|'+l.accountId;coverage.set(ck,(coverage.get(ck)??0)+1);
  }
  // 미배분 잔액은 연 단위다. 기간이 그 해와 겹칠 때만 넣고, 월별 표에는 넣지 않는다.
  const yearIn=y=>(from===null||y>=from.slice(0,4))&&(to===null||y<=to.slice(0,4));
  const residualNet=residuals.filter(r=>yearIn(r.chunk.slice(9))).reduce((s,r)=>s+r.net,0n);
  return {total,residualNet,months:[...months.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([month,b])=>({month,...b})),
    coverage:[...coverage.entries()].map(([k,n])=>{const [month,accountId]=k.split('|');return {month,accountId,rows:n};}),
    accounts:[...accounts.entries()].map(([id,a])=>({id,...a})),categoryLabels:EXPENSE_CATEGORIES,lineCount:lines.length};
}
// Spending Lab 통제값과 같은 정의로 다시 계산한다(가져오기 확정 전 검사용, 원천 행만 대상).
export function sourceControl(values){
  let knownNet=0n,prepaid=0n,unknownRows=0,rows=0,residual=0n;
  for(const v of values)if(v.entityType==='FIN_BATCH')for(const r of v.data.rows){
    if(r.status==='RESIDUAL'){residual+=BigInt(r.net);continue;}
    rows++;if(r.net===null){unknownRows++;continue;}
    const n=BigInt(r.net);knownNet+=n;if(r.role==='PREPAID')prepaid+=n;
  }
  return {rows,knownNet,unallocated:residual,sourceNet:knownNet+residual,prepaid,otherNet:knownNet+residual-prepaid,unknownRows};
}
// 화면용 투영: 금액은 문자열(JSON·정본 해시에 BigInt가 들어가지 않게). 화면은 이 값만 읽고 그래프 기간 집계는 public/fin-charts.mjs가 한다.
export function finView(values){
  const fin=values.filter(v=>v.entityType?.startsWith('FIN_'));
  const {lines,residuals}=finLines(fin);
  const str=v=>typeof v==='bigint'?v.toString():v;
  const pick=type=>fin.filter(v=>v.entityType===type).map(v=>({id:v.entityId,data:v.data,heads:v.heads??[]})).sort((a,b)=>a.id.localeCompare(b.id));
  const batches=fin.filter(v=>v.entityType==='FIN_BATCH').map(v=>{const d=v.data;
    return {id:v.entityId,source:d.source,sourceSha256:d.sourceSha256,chunk:d.chunk,part:d.part??null,label:d.label,control:d.control,rowCount:d.rows.length,accountIds:[...new Set(d.rows.map(r=>r.accountId))].sort(),rowIds:d.rows.map(r=>r.rowId)};
  }).sort((a,b)=>a.chunk.localeCompare(b.chunk)||a.id.localeCompare(b.id));
  // 분할 묶음 미완료: 같은 분할(원천·달·조각 수)의 조각이 일부만 저장된 달. 그 달 합계는 일부만 반영된 상태다(가져오기 중단).
  const splits=new Map();
  for(const b of batches)if(b.part){const k=b.sourceSha256+'|'+b.chunk+'|'+b.part.count;if(!splits.has(k))splits.set(k,{sourceSha256:b.sourceSha256,chunk:b.chunk,count:b.part.count,saved:[]});splits.get(k).saved.push(b.part.index);}
  const incompleteSplits=[...splits.values()].filter(x=>x.saved.length<x.count).map(x=>({...x,saved:x.saved.sort((p,q)=>p-q)})).sort((p,q)=>p.chunk.localeCompare(q.chunk));
  const control=sourceControl(fin);
  return {incompleteSplits,labels:{expense:EXPENSE_CATEGORIES,income:INCOME_CATEGORIES,accountTypes:ACCOUNT_TYPES,kinds:TXN_KINDS},limits:FIN_LIMITS,
    accounts:pick('FIN_ACCOUNT'),txns:pick('FIN_TXN'),rules:pick('FIN_RULE'),budgets:pick('FIN_BUDGET').sort((a,b)=>a.data.effectiveFrom.localeCompare(b.data.effectiveFrom)),batches,
    lines:lines.map(l=>({...l,net:str(l.net)})),residuals:residuals.map(r=>({...r,net:str(r.net)})),
    sourceControl:Object.fromEntries(Object.entries(control).map(([k,v])=>[k,str(v)]))};
}
