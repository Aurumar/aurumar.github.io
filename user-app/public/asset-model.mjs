// V18B 순자산(소유자 요청 2026-11-21, 통제탑 지시서 V18B_NETWORTH). 순수 모듈 — 어떤 모듈도 불러오지 않고 시계·저장소·네트워크를 직접 읽지 않는다(화면과 서버가 같은 파일을 쓴다).
// 새 기록 종류 1개: ASSET_BOOK(자산 목록 1장, entityId = 'main', 자산 1개 = assets 배열의 한 줄 + 날짜별 순자산 기록 points). 대출 목록(LOAN_BOOK)과 같은 모양이다.
//  · 기존 재정 기록(FINANCE 스냅샷)은 원화 금액 칸(itemId·label·amount)만 있어 외화 금액·환율·주식 수량·단가·가격 입력일을 담지 못하고, 기존 종류에 칸을 더하면 옛 앱이 거절한다 → 새 종류.
//  · 부채는 저장하지 않고 대출 목록(LOAN_BOOK)의 진행 중 잔액 합계를 화면이 읽기만 한다(points에는 기록한 날의 합계 숫자만 남김).
//  · 금액 = 원 단위 정수 문자열(계산은 BigInt). 외화 금액·수량·단가·환율 = 소수 문자열(소수 8자리까지, 계산은 10^8 정수). 부동소수 저장 0.
//  · 시세·환율을 받지 않는다(외부 통신 0). 단가·환율은 소유자가 넣고, 넣은 날(asOf)이 7일보다 오래되면 "오래된 가격"으로 보인다.
//  · 계좌번호 칸 0, 글 칸에 숫자 10자리 이상 연속 거절(V16·V17과 같은 규칙). 기관 이름은 소유자가 적는 글(코드에 기본값 0).
//  · 이력 제목은 "순자산 · 항목 n개"(금액·기관명 없음). 화면 문구는 사실만, 권유 문구 0.
// 옛 앱(r87 이하)은 이 종류를 모른다 → 받으면 INVALID_ENTITY_ID로 "업데이트 필요 · 기록 보존". 그래서 쓰기는 순자산 문(lb.asset.door)이 열려야만 한다.
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}

export const ASSET_TYPES=Object.freeze(['ASSET_BOOK']);
export const ASSET_LIMITS=Object.freeze({ASSET_BOOK:1});
export const ASSET_BOOK_ID='main';
export const ASSET_MAX=40;
export const ASSET_POINT_MAX=120;
export const ASSET_MAX_BYTES=32*1024;
export const ASSET_NAME_MAX=40,ASSET_INST_MAX=20,ASSET_NOTE_MAX=60;
export const ASSET_STALE_DAYS=7;
export const ASSET_KINDS=Object.freeze(['CASH','EPAY','BANK','BROKER_KRW','BROKER_FX','STOCK','OTHER']);
export const ASSET_KIND_TEXT=Object.freeze({CASH:'현금',EPAY:'간편결제 잔액',BANK:'은행 예금',BROKER_KRW:'증권 원화 예수금',BROKER_FX:'증권 외화 예수금',STOCK:'주식 보유',OTHER:'기타 자산'});
// 비중 묶음: 현금성(현금·간편결제·은행) · 증권 예수금(원화) · 외화(외화 예수금) · 주식 · 기타
export const ASSET_GROUPS=Object.freeze(['CASHLIKE','BROKER','FX','STOCK','OTHER']);
export const ASSET_GROUP_TEXT=Object.freeze({CASHLIKE:'현금성',BROKER:'증권 예수금',FX:'외화',STOCK:'주식',OTHER:'기타'});
export const ASSET_KIND_GROUP=Object.freeze({CASH:'CASHLIKE',EPAY:'CASHLIKE',BANK:'CASHLIKE',BROKER_KRW:'BROKER',BROKER_FX:'FX',STOCK:'STOCK',OTHER:'OTHER'});
export const WON_KINDS=Object.freeze(['CASH','EPAY','BANK','BROKER_KRW','OTHER']);
// 한 줄의 칸(정확히 이것만).
//  원화 종류: currency 'KRW', amount = 원 정수, quantity·price·fxRate = null.
//  BROKER_FX: currency = 원화 밖 3글자(USD 등), amount = 외화 금액(소수), fxRate = 1단위의 원화 값(소수, 0보다 큼), quantity·price = null.
//  STOCK: currency = KRW 또는 3글자, price(평가 단가)와 amount(평가 금액) 중 정확히 하나. 단가면 quantity(0보다 큼) 필수, 금액이면 quantity 선택(null 가능).
//         원화 밖 통화면 fxRate 필수, 원화면 fxRate null.
//  asOf = 금액 기준일(원화 종류) · 가격·환율 입력일(외화·주식).
export const ASSET_KEYS=Object.freeze(['id','kind','name','institution','currency','amount','quantity','price','fxRate','asOf','active','note']);
export const POINT_KEYS=Object.freeze(['date','assets','debt','net']);

const WON0=/^(0|[1-9]\d{0,14})$/,NET=/^-?(0|[1-9]\d{0,15})$/;
const DEC=/^(0|[1-9]\d{0,14})(\.\d{1,8})?$/;
const CUR=/^[A-Z]{3}$/;
const ID=/^[A-Za-z0-9_-]{1,40}$/,RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
const BAD_CHARS=/[\p{Cc}؜‎‏‪-‮⁦-⁩]/u,LONG_DIGITS=/\d{10,}/;
export const assetIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const bool=v=>typeof v==='boolean';
const dec=v=>typeof v==='string'&&DEC.test(v);
const decPos=v=>dec(v)&&units(v)>0n;
function shape(v,keys,code){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
  const k=Object.keys(v);requireValue(k.length===keys.length&&keys.every(x=>k.includes(x)),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&!BAD_CHARS.test(v)&&(empty||v.trim().length>0),'INVALID_ASSET_TEXT');
  requireValue(!LONG_DIGITS.test(v),'ASSET_TEXT_DIGITS');
}
export const assetBytes=d=>new TextEncoder().encode(JSON.stringify(d)).length;

// ---- 소수 = 10^8 정수 ----
export const SCALE=100000000n;
export function units(s){const [a,b='']=String(s).split('.');return BigInt(a)*SCALE+BigInt((b+'00000000').slice(0,8));}

export function validateAsset(a){
  shape(a,ASSET_KEYS,'INVALID_ASSET');
  text(a.name,ASSET_NAME_MAX,false);text(a.institution,ASSET_INST_MAX);text(a.note,ASSET_NOTE_MAX);
  requireValue(assetIdOK(a.id)&&ASSET_KINDS.includes(a.kind)&&typeof a.currency==='string'&&CUR.test(a.currency)&&dateOK(a.asOf)&&bool(a.active),'INVALID_ASSET');
  for(const k of ['amount','quantity','price','fxRate'])requireValue(a[k]===null||dec(a[k]),'INVALID_ASSET_NUMBER');
  if(WON_KINDS.includes(a.kind)){
    requireValue(a.currency==='KRW'&&typeof a.amount==='string'&&WON0.test(a.amount),'INVALID_ASSET_NUMBER');
    requireValue(a.quantity===null&&a.price===null&&a.fxRate===null,'ASSET_KIND_FIELDS');
  }else if(a.kind==='BROKER_FX'){
    requireValue(a.currency!=='KRW'&&a.amount!==null,'ASSET_KIND_FIELDS');
    requireValue(a.quantity===null&&a.price===null,'ASSET_KIND_FIELDS');
    requireValue(a.fxRate!==null&&decPos(a.fxRate),'ASSET_FX_RATE');
  }else{
    requireValue((a.price===null)!==(a.amount===null),'ASSET_STOCK_VALUE');
    if(a.price!==null)requireValue(a.quantity!==null&&decPos(a.quantity),'ASSET_STOCK_VALUE');
    else requireValue(a.quantity===null||decPos(a.quantity),'ASSET_STOCK_VALUE');
    requireValue(a.currency==='KRW'?a.fxRate===null:a.fxRate!==null&&decPos(a.fxRate),'ASSET_FX_RATE');
  }
}
export function validatePoint(p){
  shape(p,POINT_KEYS,'INVALID_ASSET_POINT');
  requireValue(dateOK(p.date)&&typeof p.assets==='string'&&WON0.test(p.assets)&&typeof p.debt==='string'&&WON0.test(p.debt)&&typeof p.net==='string'&&NET.test(p.net)&&p.net!=='-0','INVALID_ASSET_POINT');
  requireValue(BigInt(p.net)===BigInt(p.assets)-BigInt(p.debt),'INVALID_ASSET_POINT');
}
export function validateAssetBook(d){
  shape(d,['assets','points'],'INVALID_ASSET_BOOK');
  requireValue(Array.isArray(d.assets)&&d.assets.length<=ASSET_MAX,'ASSET_COUNT_LIMIT');
  for(const a of d.assets)validateAsset(a);
  requireValue(new Set(d.assets.map(a=>a.id)).size===d.assets.length,'DUPLICATE_ASSET_ID');
  requireValue(Array.isArray(d.points)&&d.points.length<=ASSET_POINT_MAX,'ASSET_POINT_LIMIT');
  for(const p of d.points)validatePoint(p);
  for(let i=1;i<d.points.length;i++)requireValue(d.points[i-1].date<d.points[i].date,'INVALID_ASSET_POINT');   // 날짜 오름차순 · 하루 1줄
  requireValue(assetBytes(d)<=ASSET_MAX_BYTES,'ASSET_TOO_LARGE');
}
export function validateAssetData(type,id,d){
  requireValue(ASSET_TYPES.includes(type)&&id===ASSET_BOOK_ID,'INVALID_ENTITY_ID');
  validateAssetBook(d);
}
// 확정 시점 검사: 종류별 개수 한도만(목록 1장).
export function assetTransition(v,old,ctx){
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===v.entityType).length<ASSET_LIMITS[v.entityType],'APP_ENTITY_LIMIT');
}
// 이력 제목: 보이는 항목 수만(금액·기관명 없음).
export function assetTitle(v){return '순자산 · 항목 '+(Array.isArray(v?.data?.assets)?v.data.assets.filter(a=>a?.active===true).length:0)+'개';}
export const EMPTY_ASSET_VIEW=Object.freeze({exists:false,assets:[],points:[],heads:[],updatedAt:null});
export function assetRawView(entities){
  const e=(entities??[]).find(x=>x.entityType==='ASSET_BOOK'&&x.entityId===ASSET_BOOK_ID);
  if(!e)return {exists:false,assets:[],points:[],heads:[],updatedAt:null};
  return {exists:true,assets:Array.isArray(e.data?.assets)?e.data.assets:[],points:Array.isArray(e.data?.points)?e.data.points:[],heads:e.heads??[],updatedAt:e.updatedAt??null};
}

// ---- 쓰기 문 (V16 투자 문 · V17 대출 문과 같은 방식) ----
// 열림 = ① 이 기기 저장소 lb.asset.door가 켜짐 ② 금고에 이미 ASSET_BOOK이 있음(다른 기기가 켰다는 뜻이라 첫 기록을 받는 순간 자동으로 열린다).
// 닫혀 있으면 ASSET 기록을 쓰지 않는다(r87 이하 기기 보호). 저장소가 막힌 기기는 이번 실행 동안만 기억한다. 대출 문·투자 문과 따로다.
export const ASSET_DOOR_KEY='lb.asset.door';
let memoryDoor=false;
export function assetDoorOn(storage){try{const v=storage?.getItem(ASSET_DOOR_KEY);return v===null||v===undefined?memoryDoor:v==='1';}catch{return memoryDoor;}}
export function openAssetDoor(storage){try{storage.setItem(ASSET_DOOR_KEY,'1');}catch{memoryDoor=true;}return assetDoorOn(storage);}
export const assetInVault=raw=>raw?.exists===true;
export function assetDoorState({assets=null,storage=null}={}){
  const device=assetDoorOn(storage),vault=assetInVault(assets);
  return {open:device||vault,device,vault};
}

// ---- 숫자 표시 ----
export const wonText=n=>{const v=BigInt(n),neg=v<0n,s=String(neg?-v:v);return (neg?'-':'')+s.replace(/\B(?=(\d{3})+(?!\d))/g,',');};
// 소수 글 → "1,234.5"(정수 부분만 쉼표, 소수는 넣은 그대로)
export const decText=s=>{if(s===null||s===undefined)return '—';const [a,b]=String(s).split('.');return wonText(a)+(b?'.'+b:'');};
// 비중 bp → "12.3%"(소수 첫째 자리 내림)
export const shareText=bp=>bp===null||bp===undefined?'—':Math.floor(bp/10)/10+'%';
const dayNo=d=>Math.round(Date.parse(d+'T12:00:00Z')/86400000);

// ---- 계산(투영, 저장 0) ----
// 원화 값(원 단위 내림): 원화 종류 = 금액 · 외화 = 금액 × 환율 · 주식 = 수량 × 단가 × 환율(원화면 1) 또는 평가 금액 × 환율.
export function assetValue(a){
  if(WON_KINDS.includes(a.kind))return BigInt(a.amount);
  const fx=a.fxRate===null?SCALE:units(a.fxRate);
  if(a.kind==='BROKER_FX')return units(a.amount)*fx/(SCALE*SCALE);
  if(a.price!==null)return units(a.quantity)*units(a.price)*fx/(SCALE*SCALE*SCALE);
  return units(a.amount)*fx/(SCALE*SCALE);
}
export const assetPriced=a=>a.kind==='BROKER_FX'||a.kind==='STOCK';
export function assetRow(a,today){
  const days=dateOK(today)?dayNo(today)-dayNo(a.asOf):null,priced=assetPriced(a);
  return {id:a.id,kind:a.kind,kindText:ASSET_KIND_TEXT[a.kind],group:ASSET_KIND_GROUP[a.kind],name:a.name,institution:a.institution,currency:a.currency,
    amount:a.amount,quantity:a.quantity,price:a.price,fxRate:a.fxRate,asOf:a.asOf,active:a.active,note:a.note,
    value:String(assetValue(a)),priced,days,stale:priced&&days!==null&&days>ASSET_STALE_DAYS};
}
const groupRank=g=>ASSET_GROUPS.indexOf(g);
// 묶음 순서(현금성 → 증권 예수금 → 외화 → 주식 → 기타), 같은 묶음은 값 큰 순, 그다음 id.
export const assetOrder=(a,b)=>groupRank(a.group)-groupRank(b.group)||(BigInt(b.value)>BigInt(a.value)?1:BigInt(b.value)<BigInt(a.value)?-1:0)||(a.id<b.id?-1:a.id>b.id?1:0);
// 부채 입력 = {count(진행 중 대출 수), balance(원 문자열)}. 대출이 없으면 {count:0, balance:'0'}.
export const NO_DEBT=Object.freeze({count:0,balance:'0'});
// raw = assetRawView 결과. today = 'YYYY-MM-DD'. debt = 대출 목록에서 읽은 합계(읽기만).
export function assetView(raw,{today,debt=NO_DEBT}={}){
  requireValue(dateOK(today),'INVALID_ASSET_DATE');
  const d=debt&&typeof debt.balance==='string'&&WON0.test(debt.balance)?debt:NO_DEBT;
  const all=(raw?.assets??[]).map(a=>assetRow(a,today));
  const items=all.filter(r=>r.active).sort(assetOrder),archived=all.filter(r=>!r.active).sort(assetOrder);
  const assets=items.reduce((n,r)=>n+BigInt(r.value),0n),debtWon=BigInt(d.balance),net=assets-debtWon;
  const groups=ASSET_GROUPS.map(g=>{const rows=items.filter(r=>r.group===g),value=rows.reduce((n,r)=>n+BigInt(r.value),0n);
    return {group:g,text:ASSET_GROUP_TEXT[g],count:rows.length,value:String(value),shareBp:assets>0n?Number(value*10000n/assets):null};}).filter(g=>g.count>0);
  const points=[...(raw?.points??[])];
  return {status:items.length?'OK':'NONE',today,items,archived,points,
    total:{count:items.length,assets:String(assets),debt:String(debtWon),debtCount:d.count,net:String(net),negative:net<0n,groups,stale:items.filter(r=>r.stale).length}};
}
// 오늘 기록 1줄(그날 이미 있으면 바꿈, 오래된 줄부터 120줄까지만 남김).
export function assetPoint(date,assetsWon,debtWon){const a=BigInt(assetsWon),b=BigInt(debtWon);return {date,assets:String(a),debt:String(b),net:String(a-b)};}
export function pointUpsert(points,p){
  const out=(points??[]).filter(x=>x.date!==p.date).map(x=>({...x}));out.push({...p});out.sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:0);
  return out.slice(-ASSET_POINT_MAX);
}
// 기록 표: 새 날짜부터, 바로 앞 기록과의 차이(첫 줄은 null).
export function pointRows(points,limit=12){
  const p=[...(points??[])];
  return p.map((x,i)=>({...x,change:i>0?String(BigInt(x.net)-BigInt(p[i-1].net)):null})).reverse().slice(0,limit);
}

// ---- 목록 고치기(새 목록을 돌려준다, 입력은 바꾸지 않는다) ----
const err=code=>Object.assign(new Error(code),{code});
const copy=rows=>(rows??[]).map(a=>({...a}));
export const assetSetActive=(assets,id,active)=>{const out=copy(assets),i=out.findIndex(a=>a.id===id);if(i<0)throw err('ASSET_UNKNOWN');out[i]={...out[i],active:Boolean(active)};return out;};
export const assetPut=(assets,asset)=>{const out=copy(assets),i=out.findIndex(a=>a.id===asset.id);if(i<0){if(out.length>=ASSET_MAX)throw err('ASSET_COUNT_LIMIT');out.push({...asset});}else out[i]={...asset};return out;};
// 새 줄(화면이 id를 넘긴다). 종류 밖 칸은 null로 맞춘다.
export function assetDraft({id,kind='CASH',name='',institution='',currency='KRW',amount=null,quantity=null,price=null,fxRate=null,asOf,active=true,note=''}){
  const won=WON_KINDS.includes(kind);
  const cur=won?'KRW':String(currency);
  return {id,kind,name:String(name).trim(),institution:String(institution).trim(),currency:cur,
    amount:won?String(amount??'0'):amount,quantity:kind==='STOCK'?quantity:null,price:kind==='STOCK'?price:null,
    fxRate:won||(kind==='STOCK'&&cur==='KRW')?null:fxRate,asOf,active:Boolean(active),note:String(note??'').trim()};
}
// 입력 글 → 값. 원 "1,000,000" · "1000000원" → 정수 문자열. 소수 "1,234.50" → "1234.5"(끝 0 지움, 소수 8자리까지).
export function parseAssetWon(s){
  const t=String(s??'').replace(/[\s,]/g,'').replace(/원$/,'');
  requireValue(WON0.test(t),'ASSET_AMOUNT_INPUT');
  return t;
}
export function parseDecimalInput(s,{positive=false,empty=false}={}){
  const t=String(s??'').replace(/[\s,]/g,'');
  if(t===''){if(empty)return null;throw err('ASSET_DECIMAL_INPUT');}
  requireValue(DEC.test(t),'ASSET_DECIMAL_INPUT');
  const [a,b='']=t.split('.'),f=b.replace(/0+$/,''),v=f?a+'.'+f:a;
  requireValue(!positive||units(v)>0n,'ASSET_DECIMAL_INPUT');
  return v;
}
export function parseCurrencyInput(s){const t=String(s??'').trim().toUpperCase();requireValue(CUR.test(t),'ASSET_CURRENCY_INPUT');return t;}

// ---- 가져오기 (lifebrick-assets-v1) ----
// 파일 = {format:'lifebrick-assets-v1', assets:[한 줄 칸 그대로], note?:글}. 앱의 파일 고르기로 이 기기에서만 읽는다(어디에도 올리지 않음).
// 합치기: 같은 id = 그 줄을 파일 값으로 바꿈, 새 id = 뒤에 더함, 파일에 없는 기존 줄 = 그대로. 날짜별 기록(points)은 파일로 받지 않는다.
// 저장 = ASSET_BOOK 1장(연산 1, 항목 n개여도 1번).
export const ASSET_IMPORT_FORMAT='lifebrick-assets-v1';
export const ASSET_IMPORT_MAX_BYTES=64*1024;
export const ASSET_IMPORT_NOTE_MAX=200;
const stableOf=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stableOf).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableOf(v[k])).join(',')+'}';
export const assetStable=stableOf;
export function parseAssetImport(input,{name=null}={}){
  const no=code=>({ok:false,code});
  if(name!==null&&!/\.json$/i.test(String(name)))return no('ASSET_IMPORT_NOT_JSON');
  const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):typeof input==='string'?new TextEncoder().encode(input):null;
  if(!bytes)return no('ASSET_IMPORT_SHAPE');
  if(bytes.length>ASSET_IMPORT_MAX_BYTES)return no('ASSET_IMPORT_TOO_LARGE');
  let txt;try{txt=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return no('ASSET_IMPORT_UTF8');}
  if(txt.charCodeAt(0)===0xFEFF)txt=txt.slice(1);
  let doc;try{doc=JSON.parse(txt);}catch{return no('ASSET_IMPORT_JSON');}
  if(!doc||typeof doc!=='object'||Array.isArray(doc))return no('ASSET_IMPORT_SHAPE');
  const keys=Object.keys(doc).sort().join('|');
  if(keys!=='assets|format'&&keys!=='assets|format|note')return no('ASSET_IMPORT_SHAPE');
  if(doc.format!==ASSET_IMPORT_FORMAT)return no('ASSET_IMPORT_FORMAT');
  if(Object.hasOwn(doc,'note')&&!(typeof doc.note==='string'&&doc.note.isWellFormed()&&[...doc.note].length<=ASSET_IMPORT_NOTE_MAX))return no('ASSET_IMPORT_SHAPE');
  if(!Array.isArray(doc.assets)||!doc.assets.length)return no('ASSET_IMPORT_EMPTY');
  try{validateAssetBook({assets:doc.assets,points:[]});}catch(e){return no(e?.code??'INVALID_ASSET');}
  return {ok:true,assets:doc.assets};
}
// 기존 목록(raw)과 파일 줄을 합친 결과와 차이. canSave = 새로·바뀜이 1건 이상이고 합친 목록이 검사를 통과.
export function assetImportPlan(raw,fileAssets){
  const old=copy(raw?.assets??[]),O=new Map(old.map(a=>[a.id,a]));let added=0,changed=0,same=0;
  const merged=copy(old);
  for(const a of fileAssets){
    const o=O.get(a.id);
    if(!o){added++;merged.push({...a});continue;}
    if(stableOf(o)===stableOf(a)){same++;continue;}
    changed++;merged[merged.findIndex(x=>x.id===a.id)]={...a};
  }
  const kept=old.filter(a=>!fileAssets.some(f=>f.id===a.id)).length;
  let code=null;try{validateAssetBook({assets:merged,points:[]});}catch(e){code=e?.code??'INVALID_ASSET';}
  return {added,changed,same,kept,merged,code,canSave:code===null&&added+changed>0};
}
// 목록 저장(추가·수정·보관·다시 보이기·오늘 값 기록·가져오기 = 연산 1). ports = {write(type,id,data,heads), doorOpen()}. 문이 닫혔으면 쓰지 않는다.
export async function saveAssetBook(ports,{assets,points=[],heads=[]}){
  if(!ports.doorOpen())throw err('ASSET_DOOR_CLOSED');
  const data={assets:copy(assets),points:copy(points)};
  validateAssetBook(data);
  return ports.write('ASSET_BOOK',ASSET_BOOK_ID,data,heads);
}
