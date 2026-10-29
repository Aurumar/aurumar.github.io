// FIN01 가계부 화면용 순수 함수(DOM·저장·네트워크 없음). PC 앱·브라우저·Fold가 같은 파일을 쓴다.
// 금액은 원 단위 정수 문자열, 계산은 BigInt. null(모름)은 0이 아니다. 서버 검사(fin-model.mjs)가 최종 판정이고,
// 여기 검사는 저장 전에 사람이 읽는 문장으로 알려 주기 위한 것이다(규칙은 서버와 같게 유지).

export const FIN_ERROR_TEXT=Object.freeze({
  INVALID_FIN_SCHEMA:'가계부 자료 형식이 맞지 않습니다. 앱을 최신으로 업데이트했는지 확인하세요.',
  INVALID_FIN_TEXT:'글자 수가 너무 많거나, 비워 둘 수 없는 칸이 비어 있습니다.',
  FIN_MONEY_TYPE:'금액 계산 형식 오류입니다(앱 내부 오류). 앱을 다시 열어 주세요.',
  INVALID_FIN_ACCOUNT:'계정 종류 또는 사용 여부가 올바르지 않습니다.',
  INVALID_FIN_TXN:'날짜 또는 거래 종류가 올바르지 않습니다. 날짜는 실제 있는 날(예: 2026-10-29)이어야 합니다.',
  INVALID_FIN_AMOUNT:'금액은 1원 이상의 정수로 입력하세요(원 단위, 최대 14자리, 소수·음수 불가).',
  INVALID_FIN_ACCOUNT_REF:'계정을 선택하세요.',
  INVALID_FIN_TAGS:'태그는 쉼표로 구분해 10개까지, 각 30자 이하로 쓰고 같은 태그를 두 번 쓰지 마세요.',
  INVALID_FIN_INSTALLMENTS:'할부 개월 수는 0부터 60 사이의 정수로 입력하세요(일시불은 0).',
  INVALID_FIN_ASSET_REF:'연결된 보유품 정보가 올바르지 않습니다.',
  INVALID_FIN_ORIGINAL:'외화 원금은 통화 코드(영문 대문자 3자, KRW 제외)와 금액(소수 넷째 자리까지)을 함께 입력하세요.',
  INVALID_FIN_SOURCE_REFS:'원천 행 연결 정보가 올바르지 않습니다.',
  DUPLICATE_FIN_SOURCE_REF:'같은 원천 행을 한 거래에 두 번 연결할 수 없습니다.',
  FIN_TRANSFER_HAS_NO_CATEGORY:'이체와 선불 충전은 소비가 아니라서 분류를 붙이지 않습니다.',
  FIN_TRANSFER_TARGET:'이체는 보내는 계정과 다른 받는 계정을 골라야 합니다.',
  FIN_TARGET_ONLY_FOR_TRANSFER:'받는 계정은 이체에서만 고를 수 있습니다.',
  INVALID_FIN_CATEGORY:'거래 종류에 맞는 분류를 고르세요(수입은 수입 분류, 지출·환불은 지출 분류).',
  FIN_INSTALLMENTS_ONLY_FOR_EXPENSE:'할부는 지출에만 입력할 수 있습니다.',
  INVALID_FIN_ROW:'가져온 원천 행의 형식이 맞지 않습니다. 계획 파일을 변환기로 다시 만드세요.',
  INVALID_FIN_ROW_AMOUNT:'가져온 원천 행의 금액 형식이 맞지 않습니다. 계획 파일을 다시 만드세요.',
  INVALID_FIN_ROW_DATE:'가져온 원천 행의 날짜가 묶음의 달과 맞지 않습니다. 계획 파일을 다시 만드세요.',
  FIN_RESIDUAL_HAS_NO_DATE:'미배분 잔액 행에는 날짜를 붙일 수 없습니다.',
  FIN_PARTIAL_NET_MUST_BE_UNKNOWN:'부분 취소 행의 순액은 "모름"이어야 합니다.',
  FIN_FULL_CANCEL_NET_ZERO:'전액 취소 행의 순액은 0원이어야 합니다.',
  FIN_NET_UNKNOWN_ONLY_FOR_PARTIAL:'순액 "모름"은 부분 취소 행에만 쓸 수 있습니다.',
  FIN_ROW_SIGN:'원천 행의 상태와 금액 부호가 맞지 않습니다(취소·환불은 음수). 계획 파일을 다시 만드세요.',
  INVALID_FIN_BATCH:'가져오기 묶음의 출처 정보가 올바르지 않습니다.',
  INVALID_FIN_BATCH_CHUNK:'가져오기 묶음의 달 표기가 올바르지 않습니다.',
  FIN_BATCH_ROW_LIMIT:'한 묶음에는 1행 이상 2,000행 이하만 넣을 수 있습니다.',
  INVALID_FIN_BATCH_PART:'분할 묶음의 조각 번호가 올바르지 않습니다(조각 수 2~26, 번호 1~조각 수). 계획 파일을 다시 만드세요.',
  FIN_ROW_OUTSIDE_CHUNK:'묶음의 달과 다른 달의 행이 섞여 있습니다.',
  DUPLICATE_FIN_ROW:'한 묶음 안에 같은 행 ID가 두 번 있습니다.',
  FIN_BATCH_CONTROL_MISMATCH:'묶음의 통제값(행 수·순액)이 행 합계와 다릅니다. 계획 파일이 손상되었을 수 있으니 다시 만드세요.',
  INVALID_FIN_RULE:'규칙 값이 올바르지 않습니다(가맹점 글자 1~60자, 우선순위 0~999, 지출 분류, 분류를 바꾸지 않으면 세부 분류도 비움).',
  FIN_RULE_NO_EFFECT:'규칙이 하는 일이 없습니다. 분류 바꾸기·고정/변동 지정·반복결제 포함/제외 중 하나 이상을 고르세요.',
  INVALID_FIN_BUDGET:'예산 시작 달 또는 분류가 올바르지 않습니다(달은 2026-11처럼, 분류는 지출 분류만).',
  INVALID_FIN_BUDGET_AMOUNT:'예산 금액은 0원 이상의 정수로 입력하세요(원 단위, 최대 14자리). 빈칸은 예산 없음입니다.',
  FIN_BUDGET_DUPLICATE_MONTH:'같은 달에 시작하는 예산이 이미 있습니다. 그 예산을 수정하세요.',
  INVALID_ENTITY_ID:'항목 ID가 올바르지 않습니다.',
  FIN_IMPORT_LOCAL_CAPACITY:'저장할 항목이 이 기기의 로컬 저장 용량(봉인 한 번 4.5MB)을 넘을 것으로 예상되어 시작하지 않습니다. 저장소 정리·분할 저장(docs/FIN01_STORE_COMPACTION_DESIGN.md) 뒤에 가져오세요.',
  FIN_IMPORT_OP_LIMIT:'저장할 항목 수가 이 금고에 남은 연산보다 많아 시작하지 않습니다. 한 항목이 연산 하나를 씁니다. 금고 이월(docs/FIN01_VAULT_MIGRATION.md)을 먼저 준비하세요.',
  APP_ENTITY_LIMIT:'이 종류의 항목 한도에 도달했습니다(계정 60 · 거래 8,000 · 묶음 400 · 규칙 300).',
  FIN_BATCH_IMMUTABLE:'가져온 원천 묶음은 한 번 저장하면 바꿀 수 없습니다.',
  UNKNOWN_FIN_ACCOUNT:'없는 계정을 가리키고 있습니다. 계정을 먼저 만드세요.',
  FIN_BATCH_DUPLICATE_SOURCE:'같은 원천 파일의 같은 달 묶음이 이미 있습니다.',
  FIN_BATCH_OVERLAP:'같은 계정·같은 달을 다른 묶음이 이미 담고 있어 두 번 세지 않도록 막았습니다.',
  FIN_BATCH_DUPLICATE_ROW_ID:'다른 묶음에 같은 행 ID가 이미 있습니다.',
  FIN_ACCOUNT_TYPE_IMMUTABLE:'계정 종류는 바꿀 수 없습니다. 종류가 다르면 새 계정을 만드세요.',
  FIN_CARD_CANNOT_RECEIVE_INCOME:'카드 계정은 수입을 받을 수 없습니다. 카드대금 납부는 계좌 → 카드 이체로 입력하세요.',
  FUTURE_FIN_TXN_REJECTED:'오늘보다 뒤 날짜의 거래는 기록할 수 없습니다.',
  FIN_TXN_ALREADY_VOIDED:'이미 무효화된 거래입니다.',
  FIN_TXN_CREATE_VOIDED:'새 거래를 무효 상태로 만들 수 없습니다.',
  DELETE_CONFIRMATION_REQUIRED:'무효화하려면 사유를 쓰고 확인란을 선택하세요.',
  VOID_MUST_PRESERVE_TXN:'무효화할 때는 거래 내용을 함께 바꿀 수 없습니다.',
  UNKNOWN_FIN_SOURCE_ROW:'연결하려는 원천 행이 없습니다.',
  FIN_SOURCE_ROW_ALREADY_CLAIMED:'이 원천 행은 이미 다른 거래가 대신하고 있습니다.',
  FIN_CLAIM_ROW_NOT_CLAIMABLE:'순액을 모르거나 전액 취소된 원천 행은 거래로 대신할 수 없습니다.',
  FIN_CLAIM_ACCOUNT_MISMATCH:'원천 행을 대신하는 거래는 원천 행과 같은 계정이어야 합니다.',
  FIN_CLAIM_KIND_MISMATCH:'원천 행을 대신하는 거래의 종류가 맞지 않습니다(선불 행은 선불 충전, 그 밖은 지출·환불).',
  FIN_CLAIM_AMOUNT_MISMATCH:'원천 행을 대신하는 거래의 금액은 원천 행 순액 합계와 1원까지 같아야 합니다.',
  // 화면에서만 쓰는 코드
  FIN_DATE_REQUIRED:'날짜를 입력하세요.',
  FIN_NAME_REQUIRED:'계정 이름을 입력하세요.',
  FIN_MERCHANT_RULE_REQUIRED:'가맹점에 포함될 글자를 입력하세요.',
  FIN_RULE_PRIORITY:'우선순위는 0부터 999 사이의 정수로 입력하세요(작을수록 먼저 적용).',
  FIN_VOID_REASON_REQUIRED:'무효화 사유를 입력하세요.',
  FIN_IMPORT_FILE:'계획 파일(JSON)을 읽지 못했습니다. fin-tools/spending-lab-import.mjs가 만든 파일인지 확인하세요.',
  FIN_IMPORT_FORMAT:'가져오기 계획 형식(LB_FIN_IMPORT_PLAN_1)이 아닙니다.',
  FIN_IMPORT_CONTROL_MISMATCH:'통제값이 일치하지 않아 가져오기를 확정할 수 없습니다.',
  FIN_IMPORT_CONFLICT:'이미 있는 자료와 겹치는 항목이 있어 가져오기를 확정할 수 없습니다.',
  FIN_IMPORT_DRAFT_MODE:'지금은 이 기기에 임시 저장만 됩니다. 가져오기는 연결하고 기록 권한을 받은 뒤 확정 저장으로만 합니다.',
  FIN_IMPORT_NOTHING:'저장할 항목이 없습니다. 이미 모두 가져왔습니다.',
  FIN_IMPORT_ROW_INVALID:'계획 파일의 계정·묶음·원천 행 중 저장 규칙에 맞지 않는 것이 있습니다(항목 자세히의 이유 참고). 변환기로 계획 파일을 다시 만드세요.',
});
export function finErrorText(code){
  if(typeof code!=='string')return null;
  if(Object.hasOwn(FIN_ERROR_TEXT,code))return FIN_ERROR_TEXT[code];
  if(/^(INVALID_)?FIN_/.test(code))return '가계부 저장 규칙에 맞지 않아 저장하지 않았습니다 ('+code+').';
  return null;
}
export function finError(code){return Object.assign(new Error(code),{code,finLocal:true});}
const need=(v,code)=>{if(!v)throw finError(code);};

// ---------- 금액·날짜 ----------
const big=v=>v===null||v===undefined?null:typeof v==='bigint'?v:BigInt(v);
export function formatWon(v){
  const n=big(v);if(n===null)return '모름';
  const neg=n<0n,abs=(neg?-n:n).toString();
  return (neg?'-':'')+abs.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원';
}
// 축 눈금·작은 칸 전용 줄임 표기. 표에는 항상 formatWon(정확한 값)을 쓴다.
export function formatCompact(v){
  const n=big(v);if(n===null)return '모름';
  const neg=n<0n,a=neg?-n:n,sign=neg?'-':'',group=x=>x.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  if(a<10000n)return sign+group(a)+'원';
  const man=(a*10n+5000n)/10000n;                       // 0.1만 단위 반올림
  if(man<100000n&&(a+5000n)/10000n<10000n)return sign+(man<1000n&&man%10n?(man/10n)+'.'+(man%10n):group((a+5000n)/10000n))+'만';
  const eok=(a*10n+50000000n)/100000000n;               // 0.1억 단위 반올림
  return sign+(eok<10000n&&eok%10n?(eok/10n)+'.'+(eok%10n):group((a+50000000n)/100000000n))+'억';
}
// 입력칸의 금액: 쉼표·공백·"원"만 허용해서 지운다. 소수·음수·0은 거부.
export function parseWonInput(s){
  const t=String(s??'').replace(/[\s,]/g,'').replace(/원$/,'');
  need(/^[1-9]\d{0,13}$/.test(t),'INVALID_FIN_AMOUNT');
  return t;
}
export const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const monthOK=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function shiftMonth(month,n){
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7))-1+n,yy=y+Math.floor(m/12),mm=((m%12)+12)%12;
  return String(yy).padStart(4,'0')+'-'+String(mm+1).padStart(2,'0');
}
export function monthSpan(from,to,max=600){
  const out=[];if(!monthOK(from)||!monthOK(to)||from>to)return out;
  for(let m=from;m<=to&&out.length<max;m=shiftMonth(m,1))out.push(m);
  return out;
}
const len=s=>[...s].length;

// ---------- 민감 가맹점 가리기(화면과 CSV 내보내기에 적용, 저장값은 바꾸지 않음) ----------
export function isSensitive(line){
  return line.category==='MEDICAL'||line.subcategory==='품목 미확인'||line.baseSubcategory==='품목 미확인'||(line.tags||[]).includes('민감');
}
export function shownMerchant(line,mask){
  if(mask&&isSensitive(line))return '가려진 가맹점';
  return line.merchant||(line.kind==='TRANSFER'?'이체':line.kind==='PREPAID_LOAD'?'선불 충전':'가맹점 없음');
}

// ---------- 입력 양식 → 저장 자료(서버 fin-model.mjs와 같은 규칙) ----------
export function buildAccount(input,old=null){
  const name=String(input.name??'').trim(),issuer=String(input.issuer??'').trim(),note=String(input.note??'');
  need(name,'FIN_NAME_REQUIRED');need(len(name)<=60&&len(issuer)<=40&&len(note)<=500,'INVALID_FIN_TEXT');
  const type=old?old.type:input.type;
  need(['CARD','CASH','BANK','EPAY','LOAN','OTHER'].includes(type),'INVALID_FIN_ACCOUNT');
  return {name,type,issuer,active:old?(input.active??old.active)===true:true,note};
}
export function buildTxn(input,{labels,accounts,localDate,old=null}){
  const kind=input.kind,date=String(input.date??'');
  need(date,'FIN_DATE_REQUIRED');need(dateOK(date)&&labels.kinds.includes(kind),'INVALID_FIN_TXN');
  need(date<=localDate,'FUTURE_FIN_TXN_REJECTED');
  const amount=parseWonInput(input.amount);
  const account=accounts.find(a=>a.id===input.accountId);need(account,'INVALID_FIN_ACCOUNT_REF');
  let toAccountId=null,category=null;
  if(kind==='TRANSFER'){
    toAccountId=input.toAccountId||null;need(toAccountId&&accounts.some(a=>a.id===toAccountId),'FIN_TRANSFER_TARGET');need(toAccountId!==account.id,'FIN_TRANSFER_TARGET');
  }else if(kind!=='PREPAID_LOAD'){
    const table=kind==='INCOME'?labels.income:labels.expense;
    need(typeof input.category==='string'&&Object.hasOwn(table,input.category),'INVALID_FIN_CATEGORY');category=input.category;
  }
  need(!(kind==='INCOME'&&account.data.type==='CARD'),'FIN_CARD_CANNOT_RECEIVE_INCOME');
  const instText=String(input.installments??'').trim();
  need(instText===''||/^\d{1,2}$/.test(instText),'INVALID_FIN_INSTALLMENTS');
  const installments=instText===''?0:Number(instText);need(installments<=60,'INVALID_FIN_INSTALLMENTS');
  need(kind==='EXPENSE'||installments===0,'FIN_INSTALLMENTS_ONLY_FOR_EXPENSE');
  const tags=String(input.tags??'').split(',').map(t=>t.trim()).filter(Boolean);
  need(new Set(tags).size===tags.length&&tags.length<=10&&tags.every(t=>len(t)<=30),'INVALID_FIN_TAGS');
  const currency=String(input.currency??'').trim().toUpperCase(),origText=String(input.originalAmount??'').replace(/[\s,]/g,'');
  let original=null;
  if(currency||origText){
    need(/^[A-Z]{3}$/.test(currency)&&currency!=='KRW'&&/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/.test(origText),'INVALID_FIN_ORIGINAL');
    original={currency,amount:origText};
  }
  const subcategory=String(input.subcategory??'').trim();
  const merchant=String(input.merchant??'').trim(),memo=String(input.memo??'');
  need(len(subcategory)<=40&&len(merchant)<=120&&len(memo)<=1000,'INVALID_FIN_TEXT');
  return {date,kind,amount,accountId:account.id,toAccountId,category,subcategory,merchant,memo,tags,installments,original,
    sourceRefs:old?structuredClone(old.sourceRefs):[],assetId:old?old.assetId:null,voided:false};
}
export function buildRule(input,{labels,accounts}){
  const merchantContains=String(input.merchantContains??'').trim(),subcategory=String(input.subcategory??'').trim();
  need(merchantContains,'FIN_MERCHANT_RULE_REQUIRED');need(len(merchantContains)<=60&&len(subcategory)<=40,'INVALID_FIN_TEXT');
  const accountId=input.accountId||null;need(accountId===null||accounts.some(a=>a.id===accountId),'UNKNOWN_FIN_ACCOUNT');
  // 분류 ''=바꾸지 않음(null). 고정/변동 ''=지정 안 함, 반복결제 ''=자동 탐지 그대로. 셋 중 하나는 있어야 한다.
  const category=input.category||null,costType=input.costType||null,recurring=input.recurring||null;
  need(category===null||Object.hasOwn(labels.expense,category),'INVALID_FIN_CATEGORY');
  need(category!==null||subcategory==='','INVALID_FIN_RULE');
  need(costType===null||['FIXED','VARIABLE'].includes(costType),'INVALID_FIN_RULE');need(recurring===null||['INCLUDE','EXCLUDE'].includes(recurring),'INVALID_FIN_RULE');
  need(category!==null||costType!==null||recurring!==null,'FIN_RULE_NO_EFFECT');
  const p=String(input.priority??'').trim();need(/^\d{1,3}$/.test(p),'FIN_RULE_PRIORITY');
  const base={merchantContains,accountId,category,subcategory,priority:Number(p),active:input.active!==false};
  // 분류만 바꾸는 규칙은 예전(F2~F4) 모양으로 저장: 옛 빌드 기기도 읽을 수 있게.
  return costType===null&&recurring===null?base:{...base,costType,recurring};
}

// 월 예산 입력: 빈칸=예산 없음(null·키 없음), 0은 "쓰지 않기" 예산. 금액은 쉼표 허용 원 단위 정수.
export function buildBudget(input,{labels}){
  const month=String(input.effectiveFrom??'');need(monthOK(month),'INVALID_FIN_BUDGET');
  const amount=v=>{const t=String(v??'').replace(/[\s,]/g,'').replace(/원$/,'');if(t==='')return null;need(/^(0|[1-9]\d{0,13})$/.test(t),'INVALID_FIN_BUDGET_AMOUNT');return t;};
  const categories={};
  for(const [k,v] of Object.entries(input.categories??{})){need(Object.hasOwn(labels.expense,k),'INVALID_FIN_BUDGET');const a=amount(v);if(a!==null)categories[k]=a;}
  const note=String(input.note??'');need(len(note)<=500,'INVALID_FIN_TEXT');
  return {effectiveFrom:month,total:amount(input.total),categories,note};
}

// ---------- 월별 목록 ----------
export function monthLines(lines,month,{accountId='',category=''}={}){
  return lines.filter(l=>l.month===month&&(!accountId||l.accountId===accountId||l.toAccountId===accountId)&&
    (!category||(category==='NONE'?l.category===null||l.kind==='PREPAID_LOAD':l.category===category&&l.kind!=='PREPAID_LOAD')))
    .sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
}
export function duplicateGroups(lines){
  const groups=new Map();
  for(const l of lines)if(l.duplicateGroup){if(!groups.has(l.duplicateGroup))groups.set(l.duplicateGroup,[]);groups.get(l.duplicateGroup).push(l);}
  return [...groups.entries()].map(([id,items])=>({id,items})).sort((a,b)=>a.id.localeCompare(b.id));
}

// ---------- 금고 연산 한도(서버 금고 하나가 평생 받는 연산 10,000. 엔티티 저장 하나 = 연산 하나) ----------
// 남은 연산 = 10,000 − 검증한 원격 버전 − 아직 보내지 않은 임시 저장(있으면). 검증한 버전을 모르면 UNKNOWN(0이 아님).
// 검증 시점 값이라 다른 기기가 그 뒤에 쓴 연산은 빠져 있을 수 있다(동기화하면 다시 맞춰짐).
export const VAULT_OP_LIMIT=10000;
export const OP_STAGES=Object.freeze([['FULL',0],['CRITICAL',300],['WARN',1000],['PREPARE',2000]]);
const countOK=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
export function opBudget(checkpoint,{pending=0,limit=VAULT_OP_LIMIT}={}){
  const version=checkpoint&&typeof checkpoint==='object'?checkpoint.version:undefined;
  if(!countOK(version,limit))return {known:false,stage:'UNKNOWN',limit,version:null,pending:null,remaining:null};
  const extra=countOK(pending,limit)?pending:0,remaining=Math.max(0,limit-version-extra);
  return {known:true,stage:OP_STAGES.find(([,max])=>remaining<=max)?.[0]??'OK',limit,version,pending:extra,remaining};
}
const opCount=n=>n.toLocaleString('en-US');
// 가져오기 확인 화면용: 가져온 뒤 남는 연산. 모르면 known:false, 모자라면 short(시작하지 않음). 거절 규칙은 checkImportPlan(많으면 거절, 같으면 통과).
export function opsAfter(opCheck){
  if(!opCheck?.known||!countOK(opCheck.remaining,VAULT_OP_LIMIT)||!countOK(opCheck.need,Number.MAX_SAFE_INTEGER))return {known:false,after:null,short:0,text:'가져온 뒤 남는 연산 확인 불가'};
  const after=opCheck.remaining-opCheck.need;
  return after>=0?{known:true,after,short:0,text:'가져온 뒤 남는 연산 '+opCount(after)+'개'}:{known:true,after:null,short:-after,text:'가져온 뒤 남는 연산 없음 · '+opCount(-after)+'개 부족(시작하지 않음)'};
}
export function opBudgetNotice(b){
  if(!b?.known)return {stage:'UNKNOWN',tone:'muted',text:'남은 연산 확인 불가 · 이 기기에 검증한 원격 버전이 없습니다(서버 동기화 전이거나 서버 금고를 쓰지 않는 모드). 가져오기는 막지 않고 서버가 최종 판정합니다.'};
  const left='남은 연산 '+opCount(b.remaining)+' / '+opCount(b.limit)+(b.pending?' (보내지 않은 임시 저장 '+opCount(b.pending)+'개 뺌)':'');
  if(b.stage==='FULL')return {stage:b.stage,tone:'bad',text:left+' · 이 금고는 더 이상 새 기록을 받지 못합니다. 새 금고로 이월이 필요합니다.'};
  if(b.stage==='CRITICAL')return {stage:b.stage,tone:'bad',text:left+' · 거의 다 찼습니다. 가져오기 같은 대량 저장을 미루고 금고 이월을 진행하세요.'};
  if(b.stage==='WARN')return {stage:b.stage,tone:'warn',text:left+' · 금고 이월을 준비하세요. 가져오기 전에 저장할 항목 수와 남은 연산을 비교합니다.'};
  if(b.stage==='PREPARE')return {stage:b.stage,tone:'info',text:left+' · 이월 준비 단계입니다. 남은 연산이 줄면 새 금고로 옮겨야 합니다.'};
  return {stage:'OK',tone:'muted',text:left};
}

// ---------- 로컬 저장 용량(F9): 저장소가 commit 하나로 봉인하는 state 바이트 / 4,500,000 ----------
// 서버 연산 한도(10,000)보다 이 한도가 먼저 막을 수 있다. 값은 settings.localState({bytes,limit})에서 오며, 없으면 UNKNOWN(막지 않음).
// 로컬 추정 남은 op = 남은 바이트 ÷ (state 바이트 ÷ 검증한 op 수). 고정분까지 op당으로 나누므로 실제보다 조금 적게(보수적으로) 센다.
export const LOCAL_STATE_LIMIT=4500000;
export const LOCAL_STAGES=Object.freeze([['FULL',100],['CRITICAL',95],['WARN',85],['PREPARE',70]]);
const SEVERITY=['OK','PREPARE','WARN','CRITICAL','FULL'];
export function localBudget(localState,{ops=null}={}){
  const bytes=localState&&typeof localState==='object'?localState.bytes:undefined,limit=localState?.limit;
  if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(limit)||limit<=0)return {known:false,stage:'UNKNOWN',bytes:null,limit:LOCAL_STATE_LIMIT,room:null,percent:null,perOp:null,remainingOps:null};
  const room=Math.max(0,limit-bytes),percent=bytes*100/limit,perOp=Number.isSafeInteger(ops)&&ops>0?Math.ceil(bytes/ops):null;
  return {known:true,stage:LOCAL_STAGES.find(([,p])=>percent>=p)?.[0]??'OK',bytes,limit,room,percent,perOp,remainingOps:perOp?Math.floor(room/perOp):null};
}
// 둘 중 더 급한 쪽: 남은 수 = min(서버 남은 연산, 로컬 추정 남은 op), 단계 = 더 심한 단계.
export function capacityBudget(server,local){
  const nums=[server?.known?['SERVER',server.remaining]:null,local?.known&&local.remainingOps!==null?['LOCAL',local.remainingOps]:null].filter(Boolean);
  const min=nums.length?nums.reduce((a,b)=>b[1]<a[1]?b:a):null;
  const stages=[server?.known?server.stage:null,local?.known?local.stage:null].filter(Boolean);
  const stage=stages.length?stages.reduce((a,b)=>SEVERITY.indexOf(b)>SEVERITY.indexOf(a)?b:a):'UNKNOWN';
  return {stage,remaining:min?min[1]:null,limitedBy:min?min[0]:null,server,local};
}
const mb=n=>(n/1e6).toFixed(2)+'MB';
export function localCapacityText(l){
  if(!l?.known)return '로컬 용량 확인 불가 · 이 기기 저장소가 크기를 알려 주지 않습니다(옛 빌드이거나 서버 금고를 쓰지 않는 모드).';
  return '로컬 용량 '+mb(l.bytes)+' / '+mb(l.limit).replace('4.50MB','4.5MB')+' ('+(Math.floor(l.percent*10)/10)+'%)'+(l.remainingOps!==null?' · 로컬로 남은 기록 약 '+opCount(l.remainingOps)+'개':'');
}
export function capacityNotice(server,local){
  const c=capacityBudget(server,local),s=opBudgetNotice(server),tone=c.stage==='FULL'||c.stage==='CRITICAL'?'bad':c.stage==='WARN'?'warn':c.stage==='PREPARE'?'info':'muted';
  const head=c.remaining!==null&&c.limitedBy==='LOCAL'&&server?.known&&server.remaining>c.remaining?'실제로 남은 기록 약 '+opCount(c.remaining)+'개(로컬 용량이 먼저 찹니다) · ':'';
  const localAdvice=local?.known&&SEVERITY.indexOf(local.stage)>=SEVERITY.indexOf('PREPARE')?' · 로컬 용량이 '+({PREPARE:'70',WARN:'85',CRITICAL:'95',FULL:'100'})[local.stage]+'% 이상입니다. 가져오기 같은 대량 저장을 미루세요.':'';
  return {stage:c.stage,tone,lines:[head+s.text,localCapacityText(local)+localAdvice],remaining:c.remaining,limitedBy:c.limitedBy};
}
const COMPACTION_REASON={STORE_HOLD:'저장소 보류 상태',NOT_OWNER:'이 창이 기록 권한 소유자가 아님',BLOCKED:'앞선 저장 오류',PENDING:'보내지 않은 기록이 있음',ENROLLMENT:'장치 등록 진행 중',NOT_SYNCED:'아직 동기화 전',DISK_UNKNOWN:'디스크 여유를 확인할 수 없음',DISK_SPACE:'디스크 여유 부족(현재 크기의 3배 필요)'};
// 저장소 정리(record 형식 4) 상태 문구. 필요 없으면 null.
export function compactionText(c){
  if(!c||typeof c!=='object')return null;
  const why=(c.reasons||[]).map(r=>COMPACTION_REASON[r]??(String(r).startsWith('MIGRATION_FAILED')?'정리 시도 실패('+String(r).slice(17)+')':String(r))).join(', ');
  if(c.status==='COMPACTION_PENDING')return '저장소 정리 대기 · 다음 동기화 뒤 한 번 자동으로 정리합니다(정리 전 사본 1개 보관, 자동 삭제 안 함).';
  if(c.status==='COMPACTION_DEFERRED')return '저장소 정리 미룸 · '+(why||'조건 미충족')+' · 데이터는 그대로이고 다음 동기화 때 다시 확인합니다.';
  if(c.status==='COMPACTION_HOLD_REOPEN')return '저장소 정리 중 오류 · 앱을 닫았다가 다시 여세요(데이터는 보존됨). '+why;
  if(c.status==='MIGRATED'&&c.to>=4)return '저장소 정리 완료 · 정리 전 사본 1개를 보관했습니다(자동 삭제 안 함).';
  return null;
}
// 가져오기 예상 state 증가(AI_INFERENCE 모형, F8 실측 op당 7.2KB와 맞춘 계수): 항목마다 ≈ 25/9 × (요청 바이트 + 500) + 3,400.
// 25/9 = 봉투 b64(16/9) + 해독본(1). 3,400 = 인증서·row·receipt. 실제보다 크게 잡는 쪽(보수적)이다.
export function estimateStateGrowth(items){return items.filter(i=>i.action==='SAVE').reduce((n,i)=>n+Math.ceil(25*((i.bytes??0)+500)/9)+3400,0);}

// ---------- CSV 내보내기(이 기기에 파일로 저장할 글자만 만든다. 전송 없음) ----------
// 금액은 원 단위 정수 문자열(쉼표 없음), 순액 모름은 빈칸이 아니라 "모름". 이체·선불·수입은 "소비 구분" 열로 소비와 나눈다.
// 수식 주입 방지: 앞 공백을 건너뛴 첫 글자가 = + - @(전각 포함)이거나 탭·CR·LF로 시작하는 칸은 앞에 '를 붙인다.
// 예외는 이 함수가 BigInt에서 만든 순액 칸 하나(정확히 -?숫자)뿐이다. 음수 환불이 글자로 바뀌어 합계가 깨지지 않게 하기 위해서다.
export const CSV_HEADER=Object.freeze(['날짜','종류','소비 구분','순액(원)','행 상태','계정','받는 계정','가맹점','분류','세부 분류','출처','중복 의심','태그']);
const CSV_CONSUMPTION={EXPENSE:'소비',REFUND:'소비(환불 차감)',TRANSFER:'이체 · 소비 아님',PREPAID_LOAD:'선불 전환 · 소비 아님',INCOME:'수입 · 소비 아님'};
const CSV_KIND={EXPENSE:'지출',INCOME:'수입',REFUND:'환불',TRANSFER:'이체',PREPAID_LOAD:'선불 충전'};
// 화면 FIN_ROW_TEXT(app.mjs)와 같은 글자. 전액 취소처럼 순액 0원인 행을 CSV에서도 알아볼 수 있게 한다.
const CSV_ROW={PURCHASE:'승인',FULL_CANCEL:'전액 취소',REFUND:'환불',PARTIAL_UNKNOWN:'부분 취소 · 순액 모름',POSTED:'직접 입력'};
export function csvSafe(v){
  const t=String(v??'');
  return /^[\t\r\n]/.test(t)||/^[\s\u3000]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(t)?"'"+t:t;
}
const csvQuote=t=>'"'+t.replace(/"/g,'""')+'"';
export function ledgerCsv(lines,{accountName=id=>id??'',categoryLabel=c=>c??'',mask=false}={}){
  const rows=[CSV_HEADER.map(h=>csvQuote(csvSafe(h)))];
  for(const l of lines){
    const net=l.net===null||l.net===undefined?null:(typeof l.net==='bigint'?l.net:BigInt(l.net)).toString();
    // 가리기를 켜면 화면(거래 목록 finLineRow)보다 많이 내보내지 않는다: 민감 가맹점은 가리고, 화면에 없는 태그는 모든 행에서 뺀다.
    // 분류·세부 분류는 화면처럼 분류가 있을 때만(세부 분류만 따로 나가지 않음). 선불 충전은 분류 없음.
    const cat=!!l.category&&l.kind!=='PREPAID_LOAD';
    const cells=[l.date,CSV_KIND[l.kind]??l.kind,CSV_CONSUMPTION[l.kind]??'',CSV_ROW[l.status]??l.status??'',
      accountName(l.accountId),l.kind==='TRANSFER'?accountName(l.toAccountId):'',
      shownMerchant(l,mask),cat?categoryLabel(l.category):'',cat?l.subcategory??'':'',
      l.source==='BATCH'?'가져온 원천':'직접 입력',l.duplicateGroup??'',mask?'':(l.tags||[]).join('; ')].map(c=>csvQuote(csvSafe(c)));
    cells.splice(3,0,csvQuote(net===null?'모름':net));
    rows.push(cells);
  }
  return '\uFEFF'+rows.map(r=>r.join(',')).join('\r\n')+'\r\n';
}

// ---------- 분류 규칙 미리보기 (fin-projection.mjs ruleEffect·applyRules와 같은 순서·조건) ----------
// 세 효과는 따로: 우선순위 순서로 그 효과를 가진 첫 번째 맞는 규칙. category는 원천 행(선불 제외)만, costType·recurring은 소비 줄 전부.
const ruleOrder=(a,b)=>a.priority-b.priority||a.id.localeCompare(b.id);
const ruleHits=(r,l)=>r.active&&(r.accountId===null||r.accountId===l.accountId)&&l.merchant.toLowerCase().includes(r.merchantContains.toLowerCase());
const effectOf=(rules,l,e)=>rules.find(r=>(r[e]??null)!==null&&ruleHits(r,l))??null;
export function resolveRules(rules,l){
  const c=l.source==='BATCH'&&l.kind!=='PREPAID_LOAD'?effectOf(rules,l,'category'):null,consume=l.kind==='EXPENSE'||l.kind==='REFUND';
  const k=consume?effectOf(rules,l,'costType'):null,rc=consume?effectOf(rules,l,'recurring'):null;
  return {category:c?c.category:l.baseCategory,subcategory:c?(c.subcategory||l.baseSubcategory):l.baseSubcategory,ruleId:c?.id??null,
    costType:k?.costType??null,costRuleId:k?.id??null,recurring:rc?.recurring??null,recurringRuleId:rc?.id??null};
}
// rules: [{id,data}] 저장된 규칙, draft: {id,...규칙 자료}. changed=분류가 바뀌는 원천 행, costChanged·recurringChanged=고정/변동·반복 지정이 바뀌는 소비 줄.
export function rulePreview(lines,rules,draft,sampleLimit=5){
  const now=rules.map(r=>({id:r.id,...r.data})).sort(ruleOrder);
  const next=[...now.filter(r=>r.id!==draft.id),{...draft}].sort(ruleOrder);
  let changed=0,matched=0,costChanged=0,recurringChanged=0;const samples=[];
  for(const l of lines){
    if(l.kind==='TRANSFER'||l.kind==='INCOME'||(l.kind==='PREPAID_LOAD'&&l.source!=='BATCH'))continue;
    const a=resolveRules(now,l),b=resolveRules(next,l);
    if(b.ruleId===draft.id||b.costRuleId===draft.id||b.recurringRuleId===draft.id)matched++;
    const cat=a.category!==b.category||a.subcategory!==b.subcategory,cost=a.costType!==b.costType,rec=a.recurring!==b.recurring;
    if(cat)changed++;if(cost)costChanged++;if(rec)recurringChanged++;
    if((cat||cost||rec)&&samples.length<sampleLimit)samples.push({line:l,from:a,to:b});
  }
  return {changed,matched,costChanged,recurringChanged,samples};
}

// ---------- 과거 이력 가져오기 계획 검사 ----------
export const PLAN_FORMAT='LB_FIN_IMPORT_PLAN_1';
// PC 앱 저장 요청 한도(바이트): user-app/host.mjs readJSON(maxBytes=65536)과 product/windows/shell-host.mjs readJSON(...:65536)의 값.
// 두 파일의 값이 이 상수와 같은지는 user-app/tests/fin-ui.test.mjs가 소스에서 직접 확인한다. 브라우저(Fold)는 이 HTTP 한도가 없다.
export const PC_ENTITY_REQUEST_LIMIT=65536;
// 분할 묶음(fin-model.mjs batchPart·batchSiblings와 같은 정의)
const partOf=d=>d.part??null;
const partOK=p=>p===null||!!p&&typeof p==='object'&&Object.keys(p).sort().join('|')==='count|index'&&Number.isInteger(p.count)&&Number.isInteger(p.index)&&p.count>=2&&p.count<=26&&p.index>=1&&p.index<=p.count;
export const siblings=(a,b)=>{const p=partOf(a),q=partOf(b);return p!==null&&q!==null&&a.sourceSha256===b.sourceSha256&&a.chunk===b.chunk&&p.count===q.count&&p.index!==q.index;};
// fin-model.mjs batchControl과 같은 정의
export function batchControl(rows){
  let net=0n,prepaid=0n,unknown=0;
  for(const r of rows){if(r.net===null){unknown++;continue;}const v=BigInt(r.net);net+=v;if(r.role==='PREPAID')prepaid+=v;}
  return {rowCount:rows.length,net:net.toString(),prepaidNet:prepaid.toString(),unknownNetRows:unknown};
}
// fin-projection.mjs sourceControl과 같은 정의
export function planControl(entities){
  let knownNet=0n,prepaid=0n,unknownRows=0,rows=0,residual=0n;
  for(const e of entities)if(e.entityType==='FIN_BATCH')for(const r of e.data.rows){
    if(r.status==='RESIDUAL'){residual+=BigInt(r.net);continue;}
    rows++;if(r.net===null){unknownRows++;continue;}
    const n=BigInt(r.net);knownNet+=n;if(r.role==='PREPAID')prepaid+=n;
  }
  return {rows,knownNet,unallocated:residual,sourceNet:knownNet+residual,prepaid,otherNet:knownNet+residual-prepaid,unknownRows};
}
export const CONTROL_LABELS=Object.freeze([['rows','원천 행 수'],['knownNet','순액을 아는 행 합계'],['unallocated','미배분 잔액'],['sourceNet','원천 순액 합계'],['prepaid','선불 전환'],['otherNet','선불 외 순액'],['unknownRows','순액 모름 행 수']]);
const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
const intOK=v=>Number.isSafeInteger(v)||typeof v==='string'&&/^(0|-?[1-9]\d{0,15})$/.test(v);
const SIGNED=/^(0|-?[1-9]\d{0,13})$/;
// fin-model.mjs validateRow·validateBatch와 같은 조건. 가져오는 도중 서버가 거절해 반쯤 저장되는 일을 막는다. 문제가 없으면 null.
function rowProblem(r,chunk,source,accountIds){
  if(!r||typeof r!=='object')return '행 형식';
  const at='행 '+String(r.rowId)+' · ';
  if(!idOK(r.rowId)||!idOK(r.accountId))return at+'ID 형식';
  if(!accountIds.has(r.accountId))return at+'없는 계정 '+r.accountId;
  if(typeof r.amount!=='string'||!SIGNED.test(r.amount)||r.net!==null&&(typeof r.net!=='string'||!SIGNED.test(r.net)))return at+'금액 형식';
  if(!['PURCHASE','FULL_CANCEL','REFUND','PARTIAL_UNKNOWN','RESIDUAL'].includes(r.status)||!['SPEND','PREPAID'].includes(r.role)||!['HIGH','MEDIUM','LOW'].includes(r.confidence))return at+'상태·역할·신뢰도';
  if(r.status==='RESIDUAL'){if(r.date!==null||r.month!==null||r.net===null||!chunk.startsWith('RESIDUAL-')||source==='MANUAL')return at+'미배분 행 형식';}
  else if(!dateOK(r.date)||r.month!==r.date.slice(0,7)||r.month!==chunk)return at+'날짜와 묶음 달 불일치';
  if(r.status==='PARTIAL_UNKNOWN'?r.net!==null:r.net===null)return at+'순액 모름은 부분 취소에만';
  if(r.status==='FULL_CANCEL'&&r.net!=='0')return at+'전액 취소 순액은 0';
  const a=BigInt(r.amount),n=r.net===null?null:BigInt(r.net),abs=x=>x<0n?-x:x;
  const signOK=r.status==='PURCHASE'?a>0n&&n>0n&&n<=a:r.status==='REFUND'?a!==0n&&n<0n&&abs(n)<=abs(a):r.status==='RESIDUAL'?n===a&&a!==0n:a>0n;
  if(!signOK)return at+'상태와 금액 부호';
  if(!Number.isInteger(r.installments)||r.installments<0||r.installments>60||!Number.isInteger(r.sourceRow)||r.sourceRow<0||!(r.duplicateGroup===null||idOK(r.duplicateGroup)))return at+'할부·원본 행·중복 묶음 형식';
  return null;
}
function batchProblem(d,accountIds){
  if(!partOK(partOf(d)))return '분할 조각 번호';
  if(!['SPENDING_LAB_V37','CARD_STATEMENT','MANUAL'].includes(d.source)||typeof d.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(d.sourceSha256))return '출처 정보';
  if(!(monthOK(d.chunk)||/^RESIDUAL-\d{4}$/.test(d.chunk)))return '묶음 달 표기';
  if(d.rows.length<1||d.rows.length>2000)return '행 수는 1~2,000';
  if(new Set(d.rows.map(r=>r?.rowId)).size!==d.rows.length)return '묶음 안에 같은 행 ID';
  for(const r of d.rows){const p=rowProblem(r,d.chunk,d.source,accountIds);if(p)return p;}
  return null;
}
// 저장 요청 1건의 대략 크기(바이트). PC 앱 저장 경로는 요청 하나가 65,536바이트를 넘으면 거부한다.
export function entityRequestBytes(entity){
  const body={requestId:'0'.repeat(64),commandDigest:'0'.repeat(64),entityType:entity.entityType,entityId:entity.entityId,expectedHeads:[],data:entity.data,reason:'과거 이력 가져오기 · '+'0'.repeat(12),confirmed:false};
  return new TextEncoder().encode(JSON.stringify(body)).length;
}
// existing: 화면의 fin 투영({accounts,batches,limits}). byteLimit: 요청 크기 한도(없으면 null).
export function checkImportPlan(plan,existing,{byteLimit=null,ops=null,local=null}={}){
  const report={ok:false,errors:[],opCheck:{known:false,remaining:null,need:0},localCheck:{known:false,room:null,need:0},counts:{accounts:0,batches:0,rows:0,residualRows:0},controls:[],batchControlMismatch:[],items:[],toSave:0,skipped:0,conflicts:0,sourceSha256:null};
  if(!plan||typeof plan!=='object'||plan.format!==PLAN_FORMAT||!Array.isArray(plan.entities)){report.errors.push('FIN_IMPORT_FORMAT');return report;}
  report.sourceSha256=typeof plan.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(plan.sourceSha256)?plan.sourceSha256:null;
  if(!report.sourceSha256)report.errors.push('FIN_IMPORT_FORMAT');
  const ids=new Set();
  for(const e of plan.entities){
    const okShape=e&&['FIN_ACCOUNT','FIN_BATCH'].includes(e.entityType)&&idOK(e.entityId)&&e.data&&typeof e.data==='object'&&(e.entityType!=='FIN_BATCH'||Array.isArray(e.data.rows)&&e.data.control&&typeof e.data.chunk==='string');
    if(!okShape||ids.has(e.entityType+':'+e.entityId)){report.errors.push('FIN_IMPORT_FORMAT');return report;}
    ids.add(e.entityType+':'+e.entityId);
  }
  const accounts=plan.entities.filter(e=>e.entityType==='FIN_ACCOUNT'),batches=plan.entities.filter(e=>e.entityType==='FIN_BATCH');
  report.counts.accounts=accounts.length;report.counts.batches=batches.length;
  for(const b of batches)for(const r of b.data.rows){if(r.status==='RESIDUAL')report.counts.residualRows++;else report.counts.rows++;}
  let got;
  try{got=planControl(plan.entities);for(const b of batches){const c=batchControl(b.data.rows),d=b.data.control;if(c.rowCount!==d.rowCount||c.net!==d.net||c.prepaidNet!==d.prepaidNet||c.unknownNetRows!==d.unknownNetRows)report.batchControlMismatch.push(b.entityId);}}
  catch{report.errors.push('FIN_IMPORT_FORMAT');return report;}
  const expected=plan.control?.expected??{},stated=plan.control?.got??{};
  for(const [key,label] of CONTROL_LABELS){
    const exp=key==='unknownRows'?plan.control?.unknownNetRows:expected[key];
    const e=intOK(exp)?BigInt(exp):null,g=BigInt(got[key]);
    // 계획 파일에 적힌 계산값(control.got)이 있으면 그것도 앱 재계산과 같아야 한다(파일 손상·편집 감지).
    const s=key==='unknownRows'||stated[key]===undefined?g:intOK(stated[key])?BigInt(stated[key]):null;
    report.controls.push({key,label,expected:e===null?null:e.toString(),got:g.toString(),match:e!==null&&e===g&&s===g});
  }
  // 이미 저장된 자료와 비교: 같은 것은 건너뛰고(이어하기), 다르거나 겹치면 충돌.
  const haveAccounts=new Map(existing.accounts.map(a=>[a.id,a])),haveBatches=new Map(existing.batches.map(b=>[b.id,b]));
  const covered=new Map();for(const b of existing.batches)for(const a of b.accountIds){const k=b.chunk+'|'+a;if(!covered.has(k))covered.set(k,[]);covered.get(k).push(b);}
  // 서버와 같은 행·묶음 검사 + 묶음 사이 검사: 행 ID는 모든 묶음에서 하나뿐(이미 저장돼 건너뛸 같은 묶음은 제외),
  // 계획 안에서도 같은 계정·같은 달을 두 묶음이 담으면 안 된다. 계정 참조는 계획의 계정 + 이미 있는 계정.
  const accountIds=new Set([...existing.accounts.map(a=>a.id),...accounts.map(a=>a.entityId)]),problems=new Map();
  const savedRowIds=new Map();for(const b of existing.batches)for(const id of b.rowIds??[])savedRowIds.set(id,b.id);
  const planRowIds=new Map(),planCover=new Map(),planSource=new Map();
  for(const e of accounts){const d=e.data;if(typeof d.name!=='string'||!d.name.trim()||!['CARD','CASH','BANK','EPAY','LOAN','OTHER'].includes(d.type)||typeof d.active!=='boolean')problems.set(e.entityId,'계정 형식');}
  for(const e of batches){
    let p=batchProblem(e.data,accountIds);
    const src=e.data.sourceSha256+'|'+e.data.chunk,clash=(planSource.get(src)??[]).find(x=>!siblings(x.data,e.data));
    if(!p&&clash)p='계획의 묶음 '+clash.entityId+'과(와) 같은 원천·같은 달(같은 분할의 다른 조각이 아님)';
    if(!planSource.has(src))planSource.set(src,[]);planSource.get(src).push(e);
    for(const r of p?[]:e.data.rows){
      const owner=savedRowIds.get(r.rowId);
      if(owner&&owner!==e.entityId){p='행 '+r.rowId+' · 저장된 묶음 '+owner+'에 같은 행 ID';break;}
      if(planRowIds.has(r.rowId)&&planRowIds.get(r.rowId)!==e.entityId){p='행 '+r.rowId+' · 계획의 묶음 '+planRowIds.get(r.rowId)+'에 같은 행 ID';break;}
      planRowIds.set(r.rowId,e.entityId);
      const cover=e.data.chunk+'|'+r.accountId;
      const other=planCover.get(cover);
      if(other&&other.entityId!==e.entityId&&!siblings(other.data,e.data)){p='계획의 묶음 '+other.entityId+'이(가) 같은 계정·같은 달을 담음';break;}
      if(!other)planCover.set(cover,e);
    }
    if(p)problems.set(e.entityId,p);
  }
  for(const e of plan.entities){
    const item={entityType:e.entityType,entityId:e.entityId,label:e.entityType==='FIN_ACCOUNT'?'계정 · '+(e.data.name??e.entityId):'묶음 · '+e.data.chunk+(partOf(e.data)?' ('+partOf(e.data).index+'/'+partOf(e.data).count+')':'')+' · '+e.data.rows.length+'행',action:'SAVE',reason:'',bytes:entityRequestBytes(e)};
    if(e.entityType==='FIN_ACCOUNT'){
      const have=haveAccounts.get(e.entityId);
      if(have){item.action=have.data.type===e.data.type?'SKIP':'CONFLICT';item.reason=have.data.type===e.data.type?'이미 있는 계정 · 기존 이름 "'+have.data.name+'" 유지':'같은 ID의 다른 종류 계정이 있음';}
    }else{
      const have=haveBatches.get(e.entityId),c=e.data.control;
      if(have){const same=have.sourceSha256===e.data.sourceSha256&&have.chunk===e.data.chunk&&JSON.stringify(have.part??null)===JSON.stringify(partOf(e.data))&&have.rowCount===e.data.rows.length&&have.control.net===c.net&&have.control.rowCount===c.rowCount;item.action=same?'SKIP':'CONFLICT';item.reason=same?'이미 저장된 묶음':'같은 ID의 다른 묶음이 있음';}
      else{
        const dup=existing.batches.find(b=>b.sourceSha256===e.data.sourceSha256&&b.chunk===e.data.chunk&&!siblings(b,e.data));
        const overlap=[...new Set(e.data.rows.map(r=>r.accountId))].flatMap(a=>covered.get(e.data.chunk+'|'+a)??[]).find(b=>!siblings(b,e.data))?.id;
        if(dup){item.action='CONFLICT';item.reason='같은 원천·같은 달 묶음이 다른 ID('+dup.id+')로 있음';}
        else if(overlap){item.action='CONFLICT';item.reason='같은 계정·같은 달을 묶음 '+overlap+'이(가) 이미 담고 있음';}
      }
    }
    if(item.action==='SAVE'&&problems.has(e.entityId)){item.action='INVALID';item.reason=problems.get(e.entityId);}
    if(item.action==='SAVE'&&byteLimit!==null&&item.bytes>byteLimit){item.action='CONFLICT';item.reason='저장 요청 크기 '+item.bytes.toLocaleString('en-US')+'바이트 · 이 기기 저장 한도('+byteLimit.toLocaleString('en-US')+'바이트) 초과';}
    report.items.push(item);
  }
  report.toSave=report.items.filter(i=>i.action==='SAVE').length;report.skipped=report.items.filter(i=>i.action==='SKIP').length;report.conflicts=report.items.filter(i=>i.action==='CONFLICT').length;
  const room=type=>(existing.limits?.[type]??Infinity)-(type==='FIN_ACCOUNT'?existing.accounts.length:existing.batches.length);
  if(report.items.filter(i=>i.action==='SAVE'&&i.entityType==='FIN_ACCOUNT').length>room('FIN_ACCOUNT')||report.items.filter(i=>i.action==='SAVE'&&i.entityType==='FIN_BATCH').length>room('FIN_BATCH'))report.errors.push('APP_ENTITY_LIMIT');
  if(report.controls.some(c=>!c.match)||report.batchControlMismatch.length)report.errors.push('FIN_IMPORT_CONTROL_MISMATCH');
  report.invalid=report.items.filter(i=>i.action==='INVALID').length;
  if(report.invalid)report.errors.push('FIN_IMPORT_ROW_INVALID');
  if(report.conflicts)report.errors.push('FIN_IMPORT_CONFLICT');
  // 연산 한도: 저장할 항목(SAVE) 하나가 연산 하나. 남은 연산을 모르면(UNKNOWN) 거절하지 않고 화면에 "확인 불가"로 보인다.
  report.opCheck={known:!!ops?.known,remaining:ops?.known?ops.remaining:null,need:report.toSave};
  if(ops?.known&&report.toSave>ops.remaining)report.errors.push('FIN_IMPORT_OP_LIMIT');
  // 로컬 용량: 예상 state 증가가 남은 로컬 바이트보다 크면 거절, 같으면 통과, 모르면(UNKNOWN) 막지 않고 화면에 "확인 불가".
  report.localCheck={known:!!local?.known,room:local?.known?local.room:null,need:estimateStateGrowth(report.items)};
  if(local?.known&&report.localCheck.need>local.room)report.errors.push('FIN_IMPORT_LOCAL_CAPACITY');
  if(!report.errors.length&&!report.toSave)report.errors.push('FIN_IMPORT_NOTHING');
  report.ok=report.errors.length===0;
  return report;
}
