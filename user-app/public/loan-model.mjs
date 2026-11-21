// V17 대출(소유자 요청 2026-11-21, 통제탑 지시서 V17_LOAN). 순수 모듈 — 어떤 모듈도 불러오지 않고 시계·저장소·네트워크를 직접 읽지 않는다(화면과 서버가 같은 파일을 쓴다).
// 새 기록 종류 1개: LOAN_BOOK(대출 목록 1장, entityId = 'main', 대출 1건 = loans 배열의 한 줄). 정기 결제(FIN_RECURRING 1장 = 규칙 목록)와 같은 모양이다.
//  · 잔액·조건을 한 기록에 둔다(FIN_ACCOUNT LOAN 계정과 따로, 자동으로 잇지 않는다). FIN_ACCOUNT에 칸을 더하면 옛 앱이 모르는 칸을 거절하므로 쓰지 않는다.
//  · 이름을 FIN_로 시작하지 않는다: 가계부 투영(finView)·이력 제목(finTitle)·FIN_TYPES 고정 목록 경로에 들어가지 않게.
//  · 금액 = 원 단위 정수 문자열(계산은 BigInt), 금리 = bp 정수(4.25% = 425). 모르는 값(한도·월 원금·만기)은 null(0과 다르다). 부동소수 저장 0.
//  · 계좌번호 칸 0, 글 칸에 숫자 10자리 이상 연속 거절(계좌번호를 메모에 적는 실수 차단, V16과 같은 규칙).
//  · 화면 문구는 사실만(잔액·금리·이자·만기). 상환·투자·대출 권유 문구 0. 이력 제목은 "대출 · n건"(금액·기관명 없음).
// 옛 앱(r86 이하)은 이 종류를 모른다 → 받으면 INVALID_ENTITY_ID로 "업데이트 필요 · 기록 보존". 그래서 쓰기는 대출 문(lb.loan.door)이 열려야만 한다.
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}

export const LOAN_TYPES=Object.freeze(['LOAN_BOOK']);
export const LOAN_LIMITS=Object.freeze({LOAN_BOOK:1});
export const LOAN_BOOK_ID='main';
export const LOAN_MAX=20;
export const LOAN_MAX_BYTES=16*1024;
export const LOAN_NAME_MAX=40,LOAN_LENDER_MAX=20,LOAN_NOTE_MAX=60;
export const LOAN_RATE_MAX_BP=10000;
export const LOAN_KINDS=Object.freeze(['OVERDRAFT','AMORTIZING','BULLET','INSURANCE','OTHER']);
export const LOAN_KIND_TEXT=Object.freeze({OVERDRAFT:'마이너스통장',AMORTIZING:'원금분할상환',BULLET:'만기일시상환',INSURANCE:'보험계약대출',OTHER:'기타'});
// 한 줄의 칸(정확히 이것만). limit = 마이너스통장 한도(그 밖 종류는 null), monthlyPrincipal = 원금분할상환 월 원금(그 밖 null).
export const LOAN_KEYS=Object.freeze(['id','name','lender','kind','balance','asOf','rateBp','rateExact','limit','monthlyPrincipal','maturity','active','note']);

const AMT=/^[1-9]\d{0,12}$/,AMT0=/^(0|[1-9]\d{0,12})$/;
const ID=/^[A-Za-z0-9_-]{1,40}$/,RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
const BAD_CHARS=/[\p{Cc}؜‎‏‪-‮⁦-⁩]/u,LONG_DIGITS=/\d{10,}/;
export const loanIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const bool=v=>typeof v==='boolean';
function shape(v,keys,code){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
  const k=Object.keys(v);requireValue(k.length===keys.length&&keys.every(x=>k.includes(x)),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&!BAD_CHARS.test(v)&&(empty||v.trim().length>0),'INVALID_LOAN_TEXT');
  requireValue(!LONG_DIGITS.test(v),'LOAN_TEXT_DIGITS');
}
export const loanBytes=d=>new TextEncoder().encode(JSON.stringify(d)).length;

export function validateLoan(l){
  shape(l,LOAN_KEYS,'INVALID_LOAN');
  text(l.name,LOAN_NAME_MAX,false);text(l.lender,LOAN_LENDER_MAX);text(l.note,LOAN_NOTE_MAX);
  requireValue(loanIdOK(l.id)&&LOAN_KINDS.includes(l.kind)&&typeof l.balance==='string'&&AMT0.test(l.balance)&&dateOK(l.asOf)&&int(l.rateBp,0,LOAN_RATE_MAX_BP)&&bool(l.rateExact)&&bool(l.active),'INVALID_LOAN');
  requireValue(l.limit===null||typeof l.limit==='string'&&AMT.test(l.limit),'INVALID_LOAN_AMOUNT');
  requireValue(l.monthlyPrincipal===null||typeof l.monthlyPrincipal==='string'&&AMT.test(l.monthlyPrincipal),'INVALID_LOAN_AMOUNT');
  requireValue(l.limit===null||l.kind==='OVERDRAFT','LOAN_LIMIT_KIND');
  requireValue(l.monthlyPrincipal===null||l.kind==='AMORTIZING','LOAN_PRINCIPAL_KIND');
  requireValue(l.maturity===null||dateOK(l.maturity),'INVALID_LOAN_DATE');
}
export function validateLoanBook(d){
  shape(d,['loans'],'INVALID_LOAN_BOOK');
  requireValue(Array.isArray(d.loans)&&d.loans.length<=LOAN_MAX,'LOAN_COUNT_LIMIT');
  for(const l of d.loans)validateLoan(l);
  requireValue(new Set(d.loans.map(l=>l.id)).size===d.loans.length,'DUPLICATE_LOAN_ID');
  requireValue(loanBytes(d)<=LOAN_MAX_BYTES,'LOAN_TOO_LARGE');
}
export function validateLoanData(type,id,d){
  requireValue(LOAN_TYPES.includes(type)&&id===LOAN_BOOK_ID,'INVALID_ENTITY_ID');
  validateLoanBook(d);
}
// 확정 시점 검사: 종류별 개수 한도만(목록 1장).
export function loanTransition(v,old,ctx){
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===v.entityType).length<LOAN_LIMITS[v.entityType],'APP_ENTITY_LIMIT');
}
// 이력 제목: 진행 중 대출 수만(금액·기관명 없음).
export function loanTitle(v){return '대출 · '+(Array.isArray(v?.data?.loans)?v.data.loans.filter(l=>l?.active===true).length:0)+'건';}
export const EMPTY_LOAN_VIEW=Object.freeze({exists:false,loans:[],heads:[],updatedAt:null});
export function loanRawView(entities){
  const e=(entities??[]).find(x=>x.entityType==='LOAN_BOOK'&&x.entityId===LOAN_BOOK_ID);
  if(!e)return {exists:false,loans:[],heads:[],updatedAt:null};
  return {exists:true,loans:Array.isArray(e.data?.loans)?e.data.loans:[],heads:e.heads??[],updatedAt:e.updatedAt??null};
}

// ---- 쓰기 문 (V16 투자 문과 같은 방식) ----
// 열림 = ① 이 기기 저장소 lb.loan.door가 켜짐 ② 금고에 이미 LOAN_BOOK이 있음(다른 기기가 켰다는 뜻이라 첫 기록을 받는 순간 자동으로 열린다).
// 닫혀 있으면 LOAN 기록을 쓰지 않는다(r86 이하 기기 보호). 저장소가 막힌 기기는 이번 실행 동안만 기억한다. 투자 문·기록 문(lb.records.d46)과 따로다.
export const LOAN_DOOR_KEY='lb.loan.door';
let memoryDoor=false;
export function loanDoorOn(storage){try{const v=storage?.getItem(LOAN_DOOR_KEY);return v===null||v===undefined?memoryDoor:v==='1';}catch{return memoryDoor;}}
export function openLoanDoor(storage){try{storage.setItem(LOAN_DOOR_KEY,'1');}catch{memoryDoor=true;}return loanDoorOn(storage);}
export const loanInVault=raw=>raw?.exists===true;
export function loanDoorState({loans=null,storage=null}={}){
  const device=loanDoorOn(storage),vault=loanInVault(loans);
  return {open:device||vault,device,vault};
}
export function requireLoanDoor(views){requireValue(loanDoorState(views).open,'LOAN_DOOR_CLOSED');}

// ---- 숫자 표시 ----
export const wonText=n=>{const v=BigInt(n),neg=v<0n,s=String(neg?-v:v);return (neg?'-':'')+s.replace(/\B(?=(\d{3})+(?!\d))/g,',');};
// 금리 bp → "4.25%"(소수 둘째 자리 그대로, 반올림 없음 — bp는 정수라 정확하다)
export const rateText=bp=>bp===null||bp===undefined?'—':Math.floor(bp/100)+'.'+String(bp%100).padStart(2,'0')+'%';
export const usageText=bp=>bp===null||bp===undefined?'—':(bp/100).toFixed(1).replace(/\.0$/,'')+'%';
const dayNo=d=>Math.round(Date.parse(d+'T12:00:00Z')/86400000);
export function ddayText(days){return days===null?null:days>0?'D-'+days:days===0?'D-day':'만기 지남 '+(-days)+'일';}

// ---- 계산(투영, 저장 0) ----
// 월 이자 = 잔액 × 연이율 ÷ 12, 원 단위 내림(BigInt 나눗셈). 연 이자 = 잔액 × 연이율, 원 단위 내림.
export const monthInterest=(balance,rateBp)=>BigInt(balance)*BigInt(rateBp)/120000n;
export const yearInterest=(balance,rateBp)=>BigInt(balance)*BigInt(rateBp)/10000n;
export function loanRow(l,today){
  const bal=BigInt(l.balance),mi=monthInterest(l.balance,l.rateBp);
  const principal=l.kind==='AMORTIZING'&&l.monthlyPrincipal!==null?BigInt(l.monthlyPrincipal):null;
  const usageBp=l.kind==='OVERDRAFT'&&l.limit!==null?Number(bal*10000n/BigInt(l.limit)):null;
  const days=l.maturity!==null&&dateOK(today)?dayNo(l.maturity)-dayNo(today):null;
  return {id:l.id,name:l.name,lender:l.lender,kind:l.kind,kindText:LOAN_KIND_TEXT[l.kind],balance:l.balance,asOf:l.asOf,rateBp:l.rateBp,rateExact:l.rateExact,
    limit:l.limit,monthlyPrincipal:l.monthlyPrincipal,maturity:l.maturity,active:l.active,note:l.note,
    monthInterest:String(mi),yearInterest:String(yearInterest(l.balance,l.rateBp)),
    payment:l.kind==='AMORTIZING'?(principal===null?null:String(principal+mi)):String(mi),principalUnknown:l.kind==='AMORTIZING'&&principal===null,
    usageBp,days,dday:ddayText(days)};
}
// 금리 높은 순(같으면 잔액 큰 순, 그다음 id). 사실 정렬일 뿐 순서에 뜻을 붙이지 않는다.
export const loanOrder=(a,b)=>b.rateBp-a.rateBp||(BigInt(b.balance)>BigInt(a.balance)?1:BigInt(b.balance)<BigInt(a.balance)?-1:0)||(a.id<b.id?-1:a.id>b.id?1:0);
// raw = loanRawView 결과. today = 'YYYY-MM-DD'.
export function loanView(raw,{today}={}){
  requireValue(dateOK(today),'INVALID_LOAN_DATE');
  const all=(raw?.loans??[]).map(l=>loanRow(l,today));
  const open=all.filter(r=>r.active).sort(loanOrder),closed=all.filter(r=>!r.active).sort(loanOrder);
  if(!open.length)return {status:'NONE',today,loans:[],closed,total:null};
  const sum=f=>open.reduce((n,r)=>n+f(r),0n);
  const balance=sum(r=>BigInt(r.balance)),weighted=sum(r=>BigInt(r.balance)*BigInt(r.rateBp));
  // 월 납입 추정 합계 = 원금분할(월 원금을 앎) 원금 + 이자, 그 밖 = 이자. 월 원금을 모르는 원금분할은 이자만 넣고 그 수를 따로 센다(principalUnknown).
  return {status:'OK',today,loans:open,closed,
    total:{count:open.length,balance:String(balance),monthInterest:String(sum(r=>BigInt(r.monthInterest))),yearInterest:String(sum(r=>BigInt(r.yearInterest))),
      weightedBp:balance>0n?Number(weighted/balance):null,weightedExact:open.every(r=>r.rateExact||BigInt(r.balance)===0n),
      payment:String(sum(r=>BigInt(r.payment??r.monthInterest))),principalUnknown:open.filter(r=>r.principalUnknown).length,inexact:open.filter(r=>!r.rateExact).length}};
}

// ---- 목록 고치기(새 목록을 돌려준다, 입력은 바꾸지 않는다) ----
const err=code=>Object.assign(new Error(code),{code});
const copy=loans=>(loans??[]).map(l=>({...l}));
function replaceOne(loans,id,f){const out=copy(loans),i=out.findIndex(l=>l.id===id);if(i<0)throw err('LOAN_UNKNOWN');out[i]=f({...out[i]});return out;}
export const loanSetBalance=(loans,id,{balance,asOf})=>replaceOne(loans,id,l=>({...l,balance:String(balance),asOf}));
export const loanSetRate=(loans,id,{rateBp,rateExact})=>replaceOne(loans,id,l=>({...l,rateBp,rateExact:Boolean(rateExact)}));
export const loanSetActive=(loans,id,active)=>replaceOne(loans,id,l=>({...l,active:Boolean(active)}));
export const loanPut=(loans,loan)=>{const out=copy(loans),i=out.findIndex(l=>l.id===loan.id);if(i<0){if(out.length>=LOAN_MAX)throw err('LOAN_COUNT_LIMIT');out.push({...loan});}else out[i]={...loan};return out;};
// 새 줄 기본값(화면이 id를 넘긴다).
export function loanDraft({id,name='',lender='',kind='OTHER',balance='0',asOf,rateBp=0,rateExact=true,limit=null,monthlyPrincipal=null,maturity=null,active=true,note=''}){
  return {id,name:String(name).trim(),lender:String(lender).trim(),kind,balance:String(balance),asOf,rateBp,rateExact:Boolean(rateExact),
    limit:kind==='OVERDRAFT'?limit:null,monthlyPrincipal:kind==='AMORTIZING'?monthlyPrincipal:null,maturity,active:Boolean(active),note:String(note??'').trim()};
}
// 입력 글 → 값. 금리 "3.94" · "4.25%" · "4" → bp(소수 둘째 자리까지). 금액 "1,000,000" · "1000000원" → 정수 문자열.
export function parseRateInput(s){
  const t=String(s??'').replace(/[\s%]/g,'');
  requireValue(/^(0|[1-9]\d?|100)(\.\d{1,2})?$/.test(t),'LOAN_RATE_INPUT');
  const [a,b='']=t.split('.'),bp=Number(a)*100+Number((b+'00').slice(0,2));
  requireValue(int(bp,0,LOAN_RATE_MAX_BP),'LOAN_RATE_INPUT');
  return bp;
}
export function parseLoanWon(s,{zero=false,empty=false}={}){
  const t=String(s??'').replace(/[\s,]/g,'').replace(/원$/,'');
  if(t===''){if(empty)return null;throw err('LOAN_AMOUNT_INPUT');}
  requireValue((zero?AMT0:AMT).test(t),'LOAN_AMOUNT_INPUT');
  return t;
}

// ---- 가져오기 (lifebrick-loans-v1) ----
// 파일 = {format:'lifebrick-loans-v1', loans:[한 줄 칸 그대로], note?:글}. 앱의 파일 고르기로 이 기기에서만 읽는다(어디에도 올리지 않음).
// 합치기: 같은 id = 그 줄을 파일 값으로 바꿈, 새 id = 뒤에 더함, 파일에 없는 기존 줄 = 그대로. 저장 = LOAN_BOOK 1장(연산 1, 대출 n건이어도 1번).
export const LOAN_IMPORT_FORMAT='lifebrick-loans-v1';
export const LOAN_IMPORT_MAX_BYTES=64*1024;
export const LOAN_IMPORT_NOTE_MAX=200;
const stableOf=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stableOf).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableOf(v[k])).join(',')+'}';
export const loanStable=stableOf;
export function parseLoanImport(input,{name=null}={}){
  const no=code=>({ok:false,code});
  if(name!==null&&!/\.json$/i.test(String(name)))return no('LOAN_IMPORT_NOT_JSON');
  const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):typeof input==='string'?new TextEncoder().encode(input):null;
  if(!bytes)return no('LOAN_IMPORT_SHAPE');
  if(bytes.length>LOAN_IMPORT_MAX_BYTES)return no('LOAN_IMPORT_TOO_LARGE');
  let txt;try{txt=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return no('LOAN_IMPORT_UTF8');}
  if(txt.charCodeAt(0)===0xFEFF)txt=txt.slice(1);
  let doc;try{doc=JSON.parse(txt);}catch{return no('LOAN_IMPORT_JSON');}
  if(!doc||typeof doc!=='object'||Array.isArray(doc))return no('LOAN_IMPORT_SHAPE');
  const keys=Object.keys(doc).sort().join('|');
  if(keys!=='format|loans'&&keys!=='format|loans|note')return no('LOAN_IMPORT_SHAPE');
  if(doc.format!==LOAN_IMPORT_FORMAT)return no('LOAN_IMPORT_FORMAT');
  if(Object.hasOwn(doc,'note')&&!(typeof doc.note==='string'&&doc.note.isWellFormed()&&[...doc.note].length<=LOAN_IMPORT_NOTE_MAX))return no('LOAN_IMPORT_SHAPE');
  if(!Array.isArray(doc.loans)||!doc.loans.length)return no('LOAN_IMPORT_EMPTY');
  try{validateLoanBook({loans:doc.loans});}catch(e){return no(e?.code??'INVALID_LOAN');}
  return {ok:true,loans:doc.loans};
}
// 기존 목록(raw)과 파일 줄을 합친 결과와 차이. canSave = 새로·바뀜이 1건 이상이고 합친 목록이 검사를 통과.
export function loanImportPlan(raw,fileLoans){
  const old=copy(raw?.loans??[]),O=new Map(old.map(l=>[l.id,l]));let added=0,changed=0,same=0;
  const merged=copy(old);
  for(const l of fileLoans){
    const o=O.get(l.id);
    if(!o){added++;merged.push({...l});continue;}
    if(stableOf(o)===stableOf(l)){same++;continue;}
    changed++;merged[merged.findIndex(x=>x.id===l.id)]={...l};
  }
  const kept=old.filter(l=>!fileLoans.some(f=>f.id===l.id)).length;
  let code=null;try{validateLoanBook({loans:merged});}catch(e){code=e?.code??'INVALID_LOAN';}
  return {added,changed,same,kept,merged,code,canSave:code===null&&added+changed>0};
}
// 목록 저장(가져오기·추가·잔액·금리·끝냄 = 연산 1). ports = {write(type,id,data,heads), doorOpen()}. 문이 닫혔으면 쓰지 않는다.
export async function saveLoanBook(ports,{loans,heads=[]}){
  if(!ports.doorOpen())throw err('LOAN_DOOR_CLOSED');
  const data={loans:copy(loans)};
  validateLoanBook(data);
  return ports.write('LOAN_BOOK',LOAN_BOOK_ID,data,heads);
}
