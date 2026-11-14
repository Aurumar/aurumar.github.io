import {requireValue} from '../multi-device/portable/errors.mjs';
// FIN01 가계부 모델 (MD03 앱 모듈). 금액은 원 단위 정수 문자열, 계산은 BigInt. null은 0이 아니다.
// 엔티티: FIN_ACCOUNT(계정), FIN_TXN(거래), FIN_BATCH(가져온 원천 묶음, 불변), FIN_RULE(분류·고정/변동·반복결제 규칙), FIN_BUDGET(월 예산), FIN_RECURRING(정기 결제 규칙 목록 1장, B48).
// 새 엔티티 종류를 받으면 옛 빌드는 HOLD한다. F5에서 FIN_BUDGET까지 확정(docs/FIN01_F5_DESIGN.md).

export const FIN_TYPES=Object.freeze(['FIN_ACCOUNT','FIN_TXN','FIN_BATCH','FIN_RULE','FIN_BUDGET','FIN_RECURRING']);
// MD03 금고 전체 연산 한도는 10,000이다(서버 LOG_LIMIT). 거래 한도는 그 안에서만 의미가 있다.
export const FIN_LIMITS=Object.freeze({FIN_ACCOUNT:60,FIN_TXN:8000,FIN_BATCH:400,FIN_RULE:300,FIN_BUDGET:240,FIN_RECURRING:1});
// B48 정기 결제: 규칙 목록은 entityId 'recurring' 한 장. 규칙 최대 60개, 허용 오차(%) 0~50(기본 10).
export const RECURRING_ID='recurring',RECURRING_MAX_RULES=60,RECURRING_DEFAULT_TOLERANCE=10,RECURRING_MAX_TOLERANCE=50,RECURRING_CYCLES=Object.freeze(['MONTHLY']);
export const ACCOUNT_TYPES=Object.freeze(['CARD','CASH','BANK','EPAY','LOAN','OTHER']);
export const TXN_KINDS=Object.freeze(['EXPENSE','INCOME','REFUND','TRANSFER','PREPAID_LOAD']);
export const EXPENSE_CATEGORIES=Object.freeze({
  FOOD:'식비',LIVING:'주거·생활',TRANSPORT:'교통',COMM:'통신',MEDICAL:'의료·건강',EDU:'교육·학습',
  DIGITAL:'디지털·구독',GAME:'게임',SHOPPING:'쇼핑',BEAUTY:'이발·미용',FINANCE_FEE:'금융비용·수수료',
  GIFT:'경조·선물',FAMILY:'가족',LEISURE:'여가·취미',OTHER:'기타·미분류',
});
export const INCOME_CATEGORIES=Object.freeze({
  SALARY:'근로소득',SUPPORT:'지원금',TAX_REFUND:'환급',FAMILY_IN:'가족 지원',SALE:'판매',INTEREST:'이자·배당',OTHER_IN:'기타 수입',
});
export const COST_TYPES=Object.freeze(['FIXED','VARIABLE']);
export const RECURRING_MODES=Object.freeze(['INCLUDE','EXCLUDE']);
export const BATCH_SOURCES=Object.freeze(['SPENDING_LAB_V37','CARD_STATEMENT','MANUAL']);
const ROW_STATUSES=['PURCHASE','FULL_CANCEL','REFUND','PARTIAL_UNKNOWN','RESIDUAL'];
const ROW_ROLES=['SPEND','PREPAID'];
const CONFIDENCE=['HIGH','MEDIUM','LOW'];

const POS=/^[1-9]\d{0,13}$/;            // 양의 원 단위
const SIGNED=/^(0|-?[1-9]\d{0,13})$/;   // 원천 행: 취소·환불은 음수 가능
export const finIdOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const monthOK=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const bool=v=>typeof v==='boolean';
const unique=a=>new Set(a).size===a.length;
const sha64=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function shape(v,keys,code='INVALID_FIN_SCHEMA'){
  requireValue(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&(empty||v.trim().length>0),'INVALID_FIN_TEXT');
}
export const won=s=>BigInt(s);
export function formatKRW(n){
  requireValue(typeof n==='bigint','FIN_MONEY_TYPE');
  const neg=n<0n,abs=(neg?-n:n).toString();
  return (neg?'-':'')+abs.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원';
}

// DEFR2 (MG01, 소유자 승인 2026-11-14): 선택 키 opening = {amount: 기초잔액(원 단위 정수 문자열, 0·음수 가능), date: 기준일(그날 거래까지 반영된 잔액)}.
// 키가 없으면 기초잔액 모름(옛 기록 그대로). 잔액은 저장하지 않고 화면에서 계산한다(public/fin-ledger.mjs accountBalance).
// 옛 앱은 이 키가 있는 기록을 모양 검사에서 거절한다(INVALID_FIN_SCHEMA) → 배포 때 모든 기기를 같은 날 업데이트.
function validateAccount(d){
  // opening이 있으면 먼저 따로 검사하고, 나머지는 원래 다섯 키 그대로 검사한다.
  if(d&&typeof d==='object'&&Object.hasOwn(d,'opening')){
    requireValue(Object.getPrototypeOf(d)===Object.prototype,'INVALID_FIN_SCHEMA');
    const {opening,...rest}=d;shape(opening,['amount','date']);
    requireValue(typeof opening.amount==='string'&&SIGNED.test(opening.amount)&&dateOK(opening.date),'INVALID_FIN_OPENING');
    d=rest;
  }
  shape(d,['name','type','issuer','active','note']);
  text(d.name,60,false);text(d.issuer,40);text(d.note,500);
  requireValue(ACCOUNT_TYPES.includes(d.type)&&bool(d.active),'INVALID_FIN_ACCOUNT');
}
function validateTxn(d){
  shape(d,['date','kind','amount','accountId','toAccountId','category','subcategory','merchant','memo','tags','installments','original','sourceRefs','assetId','voided']);
  requireValue(dateOK(d.date)&&TXN_KINDS.includes(d.kind),'INVALID_FIN_TXN');
  requireValue(typeof d.amount==='string'&&POS.test(d.amount),'INVALID_FIN_AMOUNT');
  requireValue(finIdOK(d.accountId)&&(d.toAccountId===null||finIdOK(d.toAccountId)),'INVALID_FIN_ACCOUNT_REF');
  text(d.subcategory,40);text(d.merchant,120);text(d.memo,1000);
  requireValue(Array.isArray(d.tags)&&d.tags.length<=10&&unique(d.tags),'INVALID_FIN_TAGS');for(const t of d.tags)text(t,30,false);
  requireValue(Number.isInteger(d.installments)&&d.installments>=0&&d.installments<=60,'INVALID_FIN_INSTALLMENTS');
  requireValue(d.assetId===null||finIdOK(d.assetId),'INVALID_FIN_ASSET_REF');
  requireValue(bool(d.voided),'INVALID_FIN_TXN');
  if(d.original!==null){
    shape(d.original,['currency','amount']);
    requireValue(/^[A-Z]{3}$/.test(d.original.currency)&&d.original.currency!=='KRW'&&typeof d.original.amount==='string'&&/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/.test(d.original.amount),'INVALID_FIN_ORIGINAL');
  }
  requireValue(Array.isArray(d.sourceRefs)&&d.sourceRefs.length<=20,'INVALID_FIN_SOURCE_REFS');
  for(const r of d.sourceRefs){shape(r,['batchId','rowId']);requireValue(finIdOK(r.batchId)&&finIdOK(r.rowId),'INVALID_FIN_SOURCE_REFS');}
  requireValue(unique(d.sourceRefs.map(r=>r.batchId+'/'+r.rowId)),'DUPLICATE_FIN_SOURCE_REF');
  // 회계 규칙: 이체·선불 충전은 소비가 아니다. 분류는 지출·환불=지출 분류, 수입=수입 분류.
  if(d.kind==='TRANSFER'||d.kind==='PREPAID_LOAD'){
    requireValue(d.category===null,'FIN_TRANSFER_HAS_NO_CATEGORY');
    requireValue(d.kind==='PREPAID_LOAD'||d.toAccountId!==null&&d.toAccountId!==d.accountId,'FIN_TRANSFER_TARGET');
  }else{
    requireValue(d.toAccountId===null,'FIN_TARGET_ONLY_FOR_TRANSFER');
    const table=d.kind==='INCOME'?INCOME_CATEGORIES:EXPENSE_CATEGORIES;
    requireValue(typeof d.category==='string'&&Object.hasOwn(table,d.category),'INVALID_FIN_CATEGORY');
  }
  requireValue(d.kind==='EXPENSE'||d.installments===0,'FIN_INSTALLMENTS_ONLY_FOR_EXPENSE');
}
// 원천 행의 저장 필드. 묶음은 불변이므로 이미 저장된 행과 계획의 행이 값까지 같은지 이 필드만으로 비교한다.
export const ROW_FIELDS=Object.freeze(['rowId','date','month','accountId','merchant','amount','net','status','role','installments','sourceCategory','confidence','sourceFile','sourceRow','duplicateGroup','item','note']);
// 행 값 지문: 키 순서·객체 모양에 흔들리지 않는다(정본 인코딩이 키를 정렬해도 값이 같으면 같은 지문).
export const rowsSignature=rows=>JSON.stringify((rows??[]).map(r=>ROW_FIELDS.map(k=>r?.[k]??null)));
function validateRow(r,source){
  shape(r,ROW_FIELDS);
  requireValue(finIdOK(r.rowId)&&finIdOK(r.accountId)&&ROW_STATUSES.includes(r.status)&&ROW_ROLES.includes(r.role),'INVALID_FIN_ROW');
  requireValue(typeof r.amount==='string'&&SIGNED.test(r.amount)&&(r.net===null||typeof r.net==='string'&&SIGNED.test(r.net)),'INVALID_FIN_ROW_AMOUNT');
  if(r.status==='RESIDUAL'){
    // 미배분 순액: 날짜를 만들지 않는다. 연 단위로만 존재.
    requireValue(r.date===null&&r.month===null&&r.net!==null,'FIN_RESIDUAL_HAS_NO_DATE');
  }else{
    requireValue(dateOK(r.date)&&r.month===r.date.slice(0,7),'INVALID_FIN_ROW_DATE');
  }
  requireValue(r.status!=='PARTIAL_UNKNOWN'||r.net===null,'FIN_PARTIAL_NET_MUST_BE_UNKNOWN');
  requireValue(r.status!=='FULL_CANCEL'||r.net==='0','FIN_FULL_CANCEL_NET_ZERO');
  requireValue(r.net!==null||r.status==='PARTIAL_UNKNOWN','FIN_NET_UNKNOWN_ONLY_FOR_PARTIAL');
  // 상태와 금액 부호가 맞아야 한다(실데이터 983행의 관측 규칙과 같다).
  const a=BigInt(r.amount),n=r.net===null?null:BigInt(r.net),abs=x=>x<0n?-x:x;
  if(r.status==='PURCHASE')requireValue(a>0n&&n>0n&&n<=a,'FIN_ROW_SIGN');
  if(r.status==='REFUND')requireValue(a!==0n&&n<0n&&abs(n)<=abs(a),'FIN_ROW_SIGN');
  if(r.status==='FULL_CANCEL'||r.status==='PARTIAL_UNKNOWN')requireValue(a>0n,'FIN_ROW_SIGN');
  if(r.status==='RESIDUAL')requireValue(n===a&&a!==0n,'FIN_ROW_SIGN');
  requireValue(Number.isInteger(r.installments)&&r.installments>=0&&r.installments<=60&&CONFIDENCE.includes(r.confidence),'INVALID_FIN_ROW');
  text(r.merchant,120);text(r.sourceCategory,60);text(r.sourceFile,120);text(r.item,200);text(r.note,500);
  requireValue(Number.isInteger(r.sourceRow)&&r.sourceRow>=0&&(r.duplicateGroup===null||finIdOK(r.duplicateGroup)),'INVALID_FIN_ROW');
  requireValue(source!=='MANUAL'||r.status!=='RESIDUAL','INVALID_FIN_ROW');
}
// 분할 묶음: 한 달 묶음이 저장 요청 한도를 넘으면 변환기가 같은 원천·같은 달을 여러 조각으로 나눈다. part={index,count}(1부터, 2~26조각).
// part 키가 없는 묶음(F1~F3에서 만든 것)도 그대로 받는다(part=null과 같다).
export const batchPart=d=>d.part??null;
const partOK=p=>p===null||!!p&&Object.getPrototypeOf(p)===Object.prototype&&Object.keys(p).sort().join('|')==='count|index'&&Number.isInteger(p.count)&&Number.isInteger(p.index)&&p.count>=2&&p.count<=26&&p.index>=1&&p.index<=p.count;
// 같은 분할의 다른 조각: 원천·달·조각 수가 같고 조각 번호만 다르다. 이때만 같은 (원천, 달)과 같은 계정·같은 달을 함께 둘 수 있다.
export const batchSiblings=(a,b)=>{const p=batchPart(a),q=batchPart(b);return p!==null&&q!==null&&a.sourceSha256===b.sourceSha256&&a.chunk===b.chunk&&p.count===q.count&&p.index!==q.index;};
function validateBatch(d){
  const keys=['source','sourceSha256','chunk','label','rows','control'];
  shape(d,d&&typeof d==='object'&&Object.hasOwn(d,'part')?[...keys,'part']:keys);
  requireValue(partOK(batchPart(d)),'INVALID_FIN_BATCH_PART');
  requireValue(BATCH_SOURCES.includes(d.source)&&sha64(d.sourceSha256),'INVALID_FIN_BATCH');
  requireValue(monthOK(d.chunk)||/^RESIDUAL-\d{4}$/.test(d.chunk),'INVALID_FIN_BATCH_CHUNK');
  text(d.label,120);
  requireValue(Array.isArray(d.rows)&&d.rows.length>=1&&d.rows.length<=2000,'FIN_BATCH_ROW_LIMIT');
  for(const r of d.rows){validateRow(r,d.source);requireValue(r.month===null?d.chunk.startsWith('RESIDUAL-'):r.month===d.chunk,'FIN_ROW_OUTSIDE_CHUNK');}
  requireValue(unique(d.rows.map(r=>r.rowId)),'DUPLICATE_FIN_ROW');
  shape(d.control,['rowCount','net','prepaidNet','unknownNetRows']);
  const c=batchControl(d.rows);
  requireValue(d.control.rowCount===c.rowCount&&d.control.net===c.net&&d.control.prepaidNet===c.prepaidNet&&d.control.unknownNetRows===c.unknownNetRows,'FIN_BATCH_CONTROL_MISMATCH');
}
export function batchControl(rows){
  let net=0n,prepaid=0n,unknown=0;
  for(const r of rows){if(r.net===null){unknown++;continue;}const v=BigInt(r.net);net+=v;if(r.role==='PREPAID')prepaid+=v;}
  return {rowCount:rows.length,net:net.toString(),prepaidNet:prepaid.toString(),unknownNetRows:unknown};
}
// 규칙 효과 세 가지(각각 따로 적용): category(원천 행 분류, null=바꾸지 않음), costType(고정/변동 수동 지정), recurring(반복결제 포함/제외).
// F2~F4 모양(costType·recurring 키 없음)도 그대로 받는다 = 두 값 null.
function validateRule(d){
  const base=['merchantContains','accountId','category','subcategory','priority','active'];
  shape(d,d&&typeof d==='object'&&(Object.hasOwn(d,'costType')||Object.hasOwn(d,'recurring'))?[...base,'costType','recurring']:base);
  text(d.merchantContains,60,false);text(d.subcategory,40);
  const costType=d.costType??null,recurring=d.recurring??null;
  requireValue((d.accountId===null||finIdOK(d.accountId))&&(d.category===null||Object.hasOwn(EXPENSE_CATEGORIES,d.category))&&Number.isInteger(d.priority)&&d.priority>=0&&d.priority<=999&&bool(d.active)
    &&(costType===null||COST_TYPES.includes(costType))&&(recurring===null||RECURRING_MODES.includes(recurring))&&(d.category!==null||d.subcategory===''),'INVALID_FIN_RULE');
  requireValue(d.category!==null||costType!==null||recurring!==null,'FIN_RULE_NO_EFFECT');
}
// 월 예산: effectiveFrom 달부터 다음 예산이 시작하기 전까지 적용. total(전체)·categories(지출 분류별)는 원 단위 정수 문자열, null=전체 예산 없음.
const WON0=/^(0|[1-9]\d{0,13})$/;
function validateBudget(d){
  shape(d,['effectiveFrom','total','categories','note']);
  requireValue(monthOK(d.effectiveFrom),'INVALID_FIN_BUDGET');
  requireValue(d.total===null||typeof d.total==='string'&&WON0.test(d.total),'INVALID_FIN_BUDGET_AMOUNT');
  requireValue(d.categories&&Object.getPrototypeOf(d.categories)===Object.prototype&&Object.keys(d.categories).every(k=>Object.hasOwn(EXPENSE_CATEGORIES,k)),'INVALID_FIN_BUDGET');
  requireValue(Object.values(d.categories).every(v=>typeof v==='string'&&WON0.test(v)),'INVALID_FIN_BUDGET_AMOUNT');
  text(d.note,500);
}
// 정기 결제 규칙 목록(B48). 거래(FIN_TXN)의 저장 형식은 건드리지 않고, 소유자가 확정한 규칙만 한 장에 모은다.
// 규칙 = { id, name, match:{merchant(정규화 문자열), amount(원 단위 정수 문자열), tolerancePct}, cycle:'MONTHLY', hidden, createdAt }
const instantOK=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function validateRecurring(d){
  shape(d,['rules'],'INVALID_FIN_RECURRING');
  requireValue(Array.isArray(d.rules),'INVALID_FIN_RECURRING');
  requireValue(d.rules.length<=RECURRING_MAX_RULES,'FIN_RECURRING_LIMIT');
  for(const r of d.rules){
    shape(r,['id','name','match','cycle','hidden','createdAt'],'INVALID_FIN_RECURRING_RULE');
    requireValue(finIdOK(r.id)&&RECURRING_CYCLES.includes(r.cycle)&&bool(r.hidden)&&instantOK(r.createdAt),'INVALID_FIN_RECURRING_RULE');
    text(r.name,60,false);
    shape(r.match,['merchant','amount','tolerancePct'],'INVALID_FIN_RECURRING_RULE');
    text(r.match.merchant,120,false);
    requireValue(typeof r.match.amount==='string'&&POS.test(r.match.amount),'INVALID_FIN_RECURRING_AMOUNT');
    requireValue(Number.isInteger(r.match.tolerancePct)&&r.match.tolerancePct>=0&&r.match.tolerancePct<=RECURRING_MAX_TOLERANCE,'INVALID_FIN_RECURRING_TOLERANCE');
  }
  requireValue(unique(d.rules.map(r=>r.id)),'DUPLICATE_FIN_RECURRING_RULE');
}
export function validateFinData(type,id,d){
  requireValue(FIN_TYPES.includes(type)&&finIdOK(id),'INVALID_ENTITY_ID');
  requireValue(type!=='FIN_RECURRING'||id===RECURRING_ID,'INVALID_ENTITY_ID');
  if(type==='FIN_ACCOUNT')validateAccount(d);
  else if(type==='FIN_TXN')validateTxn(d);
  else if(type==='FIN_BATCH')validateBatch(d);
  else if(type==='FIN_RULE')validateRule(d);
  else if(type==='FIN_BUDGET')validateBudget(d);
  else validateRecurring(d);
}

// 색인: 원천 행을 대신하는 거래(sourceRefs)가 한 행에 하나만 있게 한다(이중 집계 방지).
function finIndex(ctx){
  if(ctx.fin)return ctx.fin;
  const refs=new Map();
  for(const [key,v] of ctx.entities)if(v.entityType==='FIN_TXN'&&!v.data.voided)for(const r of v.data.sourceRefs)refs.set(r.batchId+'/'+r.rowId,v.entityId);
  ctx.fin={refs};return ctx.fin;
}
export function finAfterSet(ctx,value,old){
  if(!ctx.fin||value.entityType!=='FIN_TXN')return;
  if(old&&!old.data.voided)for(const r of old.data.sourceRefs)ctx.fin.refs.delete(r.batchId+'/'+r.rowId);
  if(!value.data.voided)for(const r of value.data.sourceRefs)ctx.fin.refs.set(r.batchId+'/'+r.rowId,value.entityId);
}
const get=(ctx,type,id)=>ctx.entities.get('sd11:'+type.toLowerCase()+':'+id);
export function finTransition(v,old,ctx,provenance){
  const {entityType:type,entityId:id,data:d}=v;
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===type).length<FIN_LIMITS[type],'APP_ENTITY_LIMIT');
  if(type==='FIN_BATCH'){
    requireValue(!old,'FIN_BATCH_IMMUTABLE');
    for(const r of d.rows)requireValue(get(ctx,'FIN_ACCOUNT',r.accountId),'UNKNOWN_FIN_ACCOUNT');
    // 같은 원천을 두 번 넣거나, 같은 계정·같은 달을 다른 묶음이 이미 덮고 있으면 거부(이중 집계 방지). 같은 분할의 다른 조각만 예외.
    const mine=new Set(d.rows.map(r=>r.month===null?'RES|'+d.chunk+'|'+r.accountId:r.month+'|'+r.accountId));
    const rowIds=new Set(d.rows.map(r=>r.rowId));
    for(const x of ctx.entities.values()){
      if(x.entityType!=='FIN_BATCH')continue;
      const sibling=batchSiblings(x.data,d);
      requireValue(sibling||!(x.data.sourceSha256===d.sourceSha256&&x.data.chunk===d.chunk),'FIN_BATCH_DUPLICATE_SOURCE');
      for(const r of x.data.rows){
        requireValue(sibling||!mine.has(r.month===null?'RES|'+x.data.chunk+'|'+r.accountId:r.month+'|'+r.accountId),'FIN_BATCH_OVERLAP');
        requireValue(!rowIds.has(r.rowId),'FIN_BATCH_DUPLICATE_ROW_ID');
      }
    }
  }
  if(type==='FIN_ACCOUNT'&&old)requireValue(old.data.type===d.type,'FIN_ACCOUNT_TYPE_IMMUTABLE');
  if(type==='FIN_ACCOUNT'&&d.opening)requireValue(dateOK(provenance.recordedLocalDate)&&d.opening.date<=provenance.recordedLocalDate,'FUTURE_FIN_OPENING_REJECTED');
  if(type==='FIN_RULE')requireValue(d.accountId===null||get(ctx,'FIN_ACCOUNT',d.accountId),'UNKNOWN_FIN_ACCOUNT');
  // 같은 달에 시작하는 예산은 하나만(어느 예산이 적용되는지 모호하지 않게).
  if(type==='FIN_BUDGET')for(const x of ctx.entities.values())requireValue(!(x.entityType==='FIN_BUDGET'&&x.entityId!==id&&x.data.effectiveFrom===d.effectiveFrom),'FIN_BUDGET_DUPLICATE_MONTH');
  if(type==='FIN_TXN'){
    const acct=get(ctx,'FIN_ACCOUNT',d.accountId);
    requireValue(acct,'UNKNOWN_FIN_ACCOUNT');
    if(d.toAccountId!==null)requireValue(get(ctx,'FIN_ACCOUNT',d.toAccountId),'UNKNOWN_FIN_ACCOUNT');
    // 카드대금 납부를 지출로 위장하지 못하게: 카드 계정으로 들어가는 돈은 이체만 가능하고, 카드 계정은 수입을 받지 않는다.
    requireValue(!(d.kind==='INCOME'&&acct.data.type==='CARD'),'FIN_CARD_CANNOT_RECEIVE_INCOME');
    requireValue(dateOK(provenance.recordedLocalDate)&&d.date<=provenance.recordedLocalDate,'FUTURE_FIN_TXN_REJECTED');
    requireValue(!old?.data.voided,'FIN_TXN_ALREADY_VOIDED');
    if(!old)requireValue(!d.voided,'FIN_TXN_CREATE_VOIDED');
    if(d.voided){
      requireValue(old&&provenance.confirmed===true&&provenance.reason.trim(),'DELETE_CONFIRMATION_REQUIRED');
      requireValue(JSON.stringify(sortKeys({...old.data,voided:true}))===JSON.stringify(sortKeys(d)),'VOID_MUST_PRESERVE_TXN');
    }
    const idx=finIndex(ctx);let claimedNet=0n;
    for(const r of d.sourceRefs){
      const batch=get(ctx,'FIN_BATCH',r.batchId),row=batch?.data.rows.find(x=>x.rowId===r.rowId&&x.status!=='RESIDUAL');
      requireValue(row,'UNKNOWN_FIN_SOURCE_ROW');
      const owner=idx.refs.get(r.batchId+'/'+r.rowId);
      requireValue(d.voided||owner===undefined||owner===id,'FIN_SOURCE_ROW_ALREADY_CLAIMED');
      // 대체 거래는 원천 행과 같은 계정·같은 성격·같은 순액이어야 한다. 모르는 순액·전액 취소 행은 대체할 수 없다.
      requireValue(row.net!==null&&row.net!=='0','FIN_CLAIM_ROW_NOT_CLAIMABLE');
      requireValue(row.accountId===d.accountId,'FIN_CLAIM_ACCOUNT_MISMATCH');
      requireValue(row.role==='PREPAID'?d.kind==='PREPAID_LOAD':['EXPENSE','REFUND'].includes(d.kind),'FIN_CLAIM_KIND_MISMATCH');
      claimedNet+=BigInt(row.net);
    }
    if(d.sourceRefs.length){
      const signed=d.kind==='REFUND'?-BigInt(d.amount):BigInt(d.amount);
      requireValue(claimedNet===signed,'FIN_CLAIM_AMOUNT_MISMATCH');
    }
  }
}
function sortKeys(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(sortKeys);return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys(v[k])]));}

// 이력 화면·백업 요약에 쓰는 제목(항상 문자열).
export function finTitle(v){
  const d=v.data;
  if(v.entityType==='FIN_ACCOUNT')return '가계부 계정 · '+d.name;
  if(v.entityType==='FIN_TXN')return '가계부 거래 · '+d.date+' '+(d.merchant||d.kind)+(d.voided?' (무효)':'');
  if(v.entityType==='FIN_BATCH')return '가계부 가져오기 · '+d.label;
  if(v.entityType==='FIN_BUDGET')return '가계부 예산 · '+d.effectiveFrom+'부터';
  if(v.entityType==='FIN_RECURRING')return '가계부 정기 결제 · 규칙 '+d.rules.length+'개';
  return '가계부 분류 규칙 · '+d.merchantContains;
}
