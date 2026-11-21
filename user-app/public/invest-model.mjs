// V16 투자 계획(소유자 승인 2026-11-19, 설계 V16_INVEST_D). 순수 모듈 — 어떤 모듈도 불러오지 않고 시계·저장소·네트워크를 직접 읽지 않는다(화면과 서버가 같은 파일을 쓴다).
// 새 기록 종류 2개: INVEST_PLAN(계획 1장, entityId = 계획 id) · INVEST_MONTH(한 달 1장, entityId = "YYYY-MM", 그달 매수·가격 메모 묶음).
//  · 원금 배치 계획이다. 기존 "투자 손익"(FIN_TXN 태그, 실현 손익 장부)과 따로 두고 자동으로 잇지 않는다.
//  · 검사기는 모양·범위만 본다(시계·다른 기록을 보지 않음). 합계가 맞는지(계획 점검 6종)는 가져오기·편집 화면이 저장 전에 막는다(planChecks).
//  · 금액 = 원 단위 정수 문자열(계산은 BigInt), 가격·수량 = 10진 문자열(비교는 10^8 배 정수), 비율 = 만분율(bp) 정수. 부동소수 저장 0.
//  · 엔진에 소유자 숫자·종목 기호는 하나도 없다. 규칙(매수처·고정 종목·고위험 한도·하락 계단·리밸런싱·재검토 신호)은 모두 계획 데이터다.
//  · 화면 문구는 "조건 충족 / 위반 / 안내 / 참고"만 쓴다(투자 자문 아님). 이력 제목에는 금액·종목을 넣지 않는다.
// 옛 앱(r85 이하)은 이 종류를 모른다 → 받으면 INVALID_ENTITY_ID로 "업데이트 필요 · 기록 보존". 그래서 쓰기는 투자 문(lb.invest.door, D46 기록 문과 따로)이 열려야만 한다.
function requireValue(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}

export const INVEST_TYPES=Object.freeze(['INVEST_PLAN','INVEST_MONTH']);
export const INVEST_LIMITS=Object.freeze({INVEST_PLAN:5,INVEST_MONTH:600});
// 한 기록 직렬화 한도: PC 저장 요청 64KB(user-app/host.mjs) 안에 넉넉히. 한 달 매수 80건 × 약 180B ≈ 14KB.
export const INVEST_MAX_BYTES=16*1024;
export const INVEST_MAX=Object.freeze({groups:8,sectors:12,items:40,schedule:12,steps:5,signals:6,buys:80,marks:31,months:12});
export const INVEST_NAME_MAX=40,INVEST_LABEL_MAX=20,INVEST_MEMO_MAX=60;
// 한 달 칸 채움 허용률(소유자 결정 3): 회차 계획 금액의 95% 이상이면 채움(국내 본주 1주 단위 오차).
export const INVEST_TOLERANCE_BP=500;
// 가격 메모가 이 날 수보다 오래되면 "오래된 가격"(R7).
export const INVEST_STALE_DAYS=3;
export const INVEST_ROLES=Object.freeze(['CORE','HIGH_RISK','INDEX','CASH_LADDER','OTHER']);
export const INVEST_MARKETS=Object.freeze(['US','KR']);
export const INVEST_VENUES=Object.freeze(['TOSS_FRACTION','KR_MAIN','OTHER']);
export const INVEST_CCYS=Object.freeze(['USD','KRW']);
export const INVEST_KINDS=Object.freeze(['PLAN','LADDER','EXTRA']);
export const INVEST_MARK_SRCS=Object.freeze(['MANUAL','PC_CACHE']);
export const VENUE_TEXT=Object.freeze({TOSS_FRACTION:'토스 소수점',KR_MAIN:'본주',OTHER:'기타'});
export const FX_SYM='USDKRW';   // 시세 참고에 쓰는 환율 메모 기호(marks에 같은 모양으로 넣는다)

const AMT=/^[1-9]\d{0,12}$/,AMT0=/^(0|[1-9]\d{0,12})$/,DEC=/^(0|[1-9]\d{0,8})(\.\d{1,8})?$/,SYM=/^[A-Z0-9][A-Z0-9.-]{0,11}$/;
export const INVEST_MONTH_RE=/^\d{4}-(0[1-9]|1[0-2])$/;
const ID=/^[A-Za-z0-9_-]{1,40}$/,RESERVED_IDS=new Set(['__proto__','constructor','prototype']);
// 글 칸: 제어 문자·양방향 문자 거절, 연속 숫자 10자리 이상 거절(계좌번호를 메모에 적는 실수 차단, R6).
const BAD_CHARS=/[\p{Cc}؜‎‏‪-‮⁦-⁩]/u,LONG_DIGITS=/\d{10,}/;
export const investIdOK=v=>typeof v==='string'&&ID.test(v)&&!RESERVED_IDS.has(v);
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const bool=v=>typeof v==='boolean';
const decU=s=>{const [a,b='']=s.split('.');return BigInt(a)*100000000n+BigInt((b+'00000000').slice(0,8));};
const decPos=v=>typeof v==='string'&&DEC.test(v)&&decU(v)>0n;
const symOK=v=>typeof v==='string'&&SYM.test(v);
function shape(v,keys,code){
  requireValue(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
  const k=Object.keys(v);requireValue(k.length===keys.length&&keys.every(x=>k.includes(x)),code);
}
function text(v,max,empty=true){
  requireValue(typeof v==='string'&&v.isWellFormed()&&[...v].length<=max&&!BAD_CHARS.test(v)&&(empty||v.trim().length>0),'INVALID_INVEST_TEXT');
  requireValue(!LONG_DIGITS.test(v),'INVEST_TEXT_DIGITS');
}
const list=(v,max,code)=>requireValue(Array.isArray(v)&&v.length<=max,code);
const uniqueIds=(rows,code)=>requireValue(new Set(rows.map(x=>x.id)).size===rows.length,code);
export const investBytes=d=>new TextEncoder().encode(JSON.stringify(d)).length;

export const PLAN_KEYS=Object.freeze(['name','startMonth','months','total','groups','sectors','items','ladder','rebalance','signals','active']);
export const ITEM_KEYS=Object.freeze(['id','sym','name','market','venue','group','sector','target','schedule','fixed','basePrice','ccy']);
export const BUY_KEYS=Object.freeze(['id','date','item','sym','amount','qty','price','ccy','venue','kind','step','memo']);
export const MARK_KEYS=Object.freeze(['sym','price','ccy','date','src']);
function validatePlan(id,d){
  requireValue(investIdOK(id),'INVALID_ENTITY_ID');
  shape(d,PLAN_KEYS,'INVALID_INVEST_PLAN');
  text(d.name,INVEST_NAME_MAX,false);
  requireValue(typeof d.startMonth==='string'&&INVEST_MONTH_RE.test(d.startMonth)&&int(d.months,1,INVEST_MAX.months)&&typeof d.total==='string'&&AMT.test(d.total)&&bool(d.active),'INVALID_INVEST_PLAN');
  list(d.groups,INVEST_MAX.groups,'INVEST_GROUP_LIMIT');
  for(const g of d.groups){
    shape(g,['id','name','role','target','noExtra','capPctBp'],'INVALID_INVEST_GROUP');text(g.name,INVEST_LABEL_MAX,false);
    requireValue(investIdOK(g.id)&&INVEST_ROLES.includes(g.role)&&typeof g.target==='string'&&AMT0.test(g.target)&&bool(g.noExtra)&&(g.capPctBp===null||int(g.capPctBp,0,10000)),'INVALID_INVEST_GROUP');
  }
  uniqueIds(d.groups,'DUPLICATE_INVEST_ID');
  list(d.sectors,INVEST_MAX.sectors,'INVEST_SECTOR_LIMIT');
  for(const s of d.sectors){shape(s,['id','name','target'],'INVALID_INVEST_SECTOR');text(s.name,INVEST_LABEL_MAX,false);requireValue(investIdOK(s.id)&&typeof s.target==='string'&&AMT.test(s.target),'INVALID_INVEST_SECTOR');}
  uniqueIds(d.sectors,'DUPLICATE_INVEST_ID');
  const groups=new Set(d.groups.map(g=>g.id)),sectors=new Set(d.sectors.map(s=>s.id));
  list(d.items,INVEST_MAX.items,'INVEST_ITEM_LIMIT');
  for(const it of d.items){
    shape(it,ITEM_KEYS,'INVALID_INVEST_ITEM');text(it.name,INVEST_NAME_MAX,false);
    requireValue(investIdOK(it.id)&&symOK(it.sym)&&INVEST_MARKETS.includes(it.market)&&INVEST_VENUES.includes(it.venue)&&typeof it.target==='string'&&AMT.test(it.target)&&bool(it.fixed)&&(it.basePrice===null||decPos(it.basePrice))&&INVEST_CCYS.includes(it.ccy),'INVALID_INVEST_ITEM');
    requireValue(groups.has(it.group),'INVEST_UNKNOWN_GROUP');
    requireValue(it.sector===null||sectors.has(it.sector),'INVEST_UNKNOWN_SECTOR');
    list(it.schedule,INVEST_MAX.schedule,'INVEST_SCHEDULE_LIMIT');
    for(const s of it.schedule){shape(s,['m','amount','date'],'INVALID_INVEST_SCHEDULE');requireValue(int(s.m,0,d.months-1)&&typeof s.amount==='string'&&AMT.test(s.amount)&&(s.date===null||dateOK(s.date)),'INVALID_INVEST_SCHEDULE');}
    requireValue(new Set(it.schedule.map(s=>s.m)).size===it.schedule.length,'DUPLICATE_INVEST_SCHEDULE');
  }
  uniqueIds(d.items,'DUPLICATE_INVEST_ID');
  if(d.ladder!==null){
    const l=d.ladder;shape(l,['sym','base','ccy','group','steps'],'INVALID_INVEST_LADDER');
    requireValue(symOK(l.sym)&&decPos(l.base)&&INVEST_CCYS.includes(l.ccy)&&groups.has(l.group),'INVALID_INVEST_LADDER');
    requireValue(Array.isArray(l.steps)&&l.steps.length>=1&&l.steps.length<=INVEST_MAX.steps,'INVEST_LADDER_LIMIT');
    let prev=decU(l.base);
    for(const s of l.steps){shape(s,['price','amount'],'INVALID_INVEST_LADDER');requireValue(decPos(s.price)&&typeof s.amount==='string'&&AMT.test(s.amount),'INVALID_INVEST_LADDER');requireValue(decU(s.price)<prev,'INVEST_LADDER_ORDER');prev=decU(s.price);}
  }
  shape(d.rebalance,['month','lowPct','highPct'],'INVALID_INVEST_REBALANCE');
  requireValue(int(d.rebalance.month,1,12)&&int(d.rebalance.lowPct,1,100)&&int(d.rebalance.highPct,100,1000),'INVALID_INVEST_REBALANCE');
  list(d.signals,INVEST_MAX.signals,'INVEST_SIGNAL_LIMIT');
  for(const s of d.signals){shape(s,['id','text','on','date'],'INVALID_INVEST_SIGNAL');text(s.text,INVEST_MEMO_MAX,false);requireValue(investIdOK(s.id)&&bool(s.on)&&(s.date===null||dateOK(s.date)),'INVALID_INVEST_SIGNAL');}
  uniqueIds(d.signals,'DUPLICATE_INVEST_ID');
  requireValue(investBytes(d)<=INVEST_MAX_BYTES,'INVEST_TOO_LARGE');
}
function validateMonth(id,d){
  requireValue(typeof id==='string'&&INVEST_MONTH_RE.test(id),'INVALID_ENTITY_ID');
  shape(d,['month','plan','buys','marks'],'INVALID_INVEST_MONTH');
  requireValue(d.month===id&&investIdOK(d.plan),'INVALID_INVEST_MONTH');
  const inMonth=v=>dateOK(v)&&v.slice(0,7)===id;
  list(d.buys,INVEST_MAX.buys,'INVEST_BUY_LIMIT');
  for(const b of d.buys){
    shape(b,BUY_KEYS,'INVALID_INVEST_BUY');text(b.memo,INVEST_MEMO_MAX);
    requireValue(investIdOK(b.id)&&(b.item===null||investIdOK(b.item))&&symOK(b.sym)&&typeof b.amount==='string'&&AMT.test(b.amount)&&(b.qty===null||decPos(b.qty))&&(b.price===null||decPos(b.price))&&INVEST_CCYS.includes(b.ccy)&&INVEST_VENUES.includes(b.venue)&&INVEST_KINDS.includes(b.kind),'INVALID_INVEST_BUY');
    requireValue(b.kind==='LADDER'?int(b.step,1,INVEST_MAX.steps):b.step===null,'INVEST_LADDER_STEP');
    requireValue(inMonth(b.date),'INVEST_DATE_OUTSIDE_MONTH');
  }
  uniqueIds(d.buys,'DUPLICATE_INVEST_BUY');
  list(d.marks,INVEST_MAX.marks,'INVEST_MARK_LIMIT');
  for(const m of d.marks){shape(m,MARK_KEYS,'INVALID_INVEST_MARK');requireValue(symOK(m.sym)&&decPos(m.price)&&INVEST_CCYS.includes(m.ccy)&&INVEST_MARK_SRCS.includes(m.src),'INVALID_INVEST_MARK');requireValue(inMonth(m.date),'INVEST_DATE_OUTSIDE_MONTH');}
  requireValue(investBytes(d)<=INVEST_MAX_BYTES,'INVEST_TOO_LARGE');
}
export function validateInvestData(type,id,d){
  requireValue(INVEST_TYPES.includes(type),'INVALID_ENTITY_ID');
  if(type==='INVEST_PLAN')validatePlan(id,d);else validateMonth(id,d);
}
// 확정 시점 검사: 종류별 개수 한도만(confirmCount 없음 — 같은 달 기록을 고쳐 쓰는 것은 연산 이력에 남는다).
export function investTransition(v,old,ctx){
  if(!old)requireValue([...ctx.entities.values()].filter(x=>x.entityType===v.entityType).length<INVEST_LIMITS[v.entityType],'APP_ENTITY_LIMIT');
}
// 이력 제목: 금액·종목 없음.
export function investTitle(v){return v.entityType==='INVEST_PLAN'?'투자 계획 · '+v.entityId:'투자 기록 · '+v.entityId+' · 매수 '+(v.data?.buys?.length??0)+'건';}
export function investRawView(entities){
  const plans=[],months=[];
  for(const e of entities){
    if(e.entityType==='INVEST_PLAN')plans.push({id:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
    else if(e.entityType==='INVEST_MONTH')months.push({month:e.entityId,data:e.data,heads:e.heads??[],updatedAt:e.updatedAt??null});
  }
  plans.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);months.sort((a,b)=>a.month<b.month?-1:a.month>b.month?1:0);
  return {plans,months};
}
export const EMPTY_INVEST_VIEW=Object.freeze({plans:[],months:[]});
export const emptyInvestMonth=(month,plan)=>({month,plan,buys:[],marks:[]});
// 새 매수 줄(화면이 id를 넘긴다). LADDER가 아니면 step = null.
export function investBuyRow({id,date,item=null,sym,amount,qty=null,price=null,ccy,venue,kind='PLAN',step=null,memo=''}){
  return {id,date,item,sym,amount:String(amount),qty,price,ccy,venue,kind,step:kind==='LADDER'?step:null,memo:String(memo??'').trim()};
}

// ---- 쓰기 문 (설계 6-2) ----
// 열림 = ① 이 기기 저장소 lb.invest.door가 켜짐 ② 금고에 이미 INVEST 기록이 있음(다른 기기가 켰다는 뜻이라 첫 기록을 받는 순간 자동으로 열린다).
// 닫혀 있으면 INVEST 기록을 쓰지 않는다(r85 기기 보호). 저장소가 막힌 기기는 이번 실행 동안만 기억한다. 기존 기록 문(lb.records.d46)과 따로다.
export const INVEST_DOOR_KEY='lb.invest.door';
let memoryDoor=false;
export function investDoorOn(storage){try{const v=storage?.getItem(INVEST_DOOR_KEY);return v===null||v===undefined?memoryDoor:v==='1';}catch{return memoryDoor;}}
export function openInvestDoor(storage){try{storage.setItem(INVEST_DOOR_KEY,'1');}catch{memoryDoor=true;}return investDoorOn(storage);}
export const investInVault=invest=>(invest?.plans??[]).length>0||(invest?.months??[]).length>0;
export function investDoorState({invest=null,storage=null}={}){
  const device=investDoorOn(storage),vault=investInVault(invest);
  return {open:device||vault,device,vault};
}
export function requireInvestDoor(views){requireValue(investDoorState(views).open,'INVEST_DOOR_CLOSED');}

// ---- 숫자 표시 ----
const big=s=>BigInt(s);
const sum=a=>a.reduce((n,x)=>n+x,0n);
export const wonText=n=>{const v=BigInt(n),neg=v<0n,s=String(neg?-v:v);return (neg?'-':'')+s.replace(/\B(?=(\d{3})+(?!\d))/g,',');};
export const pctText=bp=>bp===null||bp===undefined?'—':(bp/100).toFixed(1).replace(/\.0$/,'')+'%';
const bpOf=(a,b)=>b>0n?Number(a*10000n/b):null;
const monthNo=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
export const monthAt=(start,i)=>{const n=monthNo(start)+i;return String(Math.floor(n/12)).padStart(4,'0')+'-'+String(n%12+1).padStart(2,'0');};
const dayNo=d=>Math.round(Date.parse(d+'T12:00:00Z')/86400000);
const shortDate=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));

// ---- 가져오기 (설계 2-5) ----
export const INVEST_IMPORT_FORMAT='lifebrick-invest-plan-v1';
export const INVEST_IMPORT_MAX_BYTES=256*1024;
export const INVEST_IMPORT_NOTE_MAX=200;
// 계획 점검 6종(검사기 밖, 화면이 저장 단추를 막는다). 돌려주는 값 = 어긋난 것 목록 [{code,text}](빈 배열 = 통과).
const gap=(have,want)=>{const d=want-have;return d>0n?wonText(d)+'원 모자람':wonText(-d)+'원 많음';};
export function planChecks(plan){
  const out=[],p=plan??{},groups=Array.isArray(p.groups)?p.groups:[],items=Array.isArray(p.items)?p.items:[],sectors=Array.isArray(p.sectors)?p.sectors:[];
  const amt=v=>typeof v==='string'&&AMT0.test(v)?big(v):0n,total=amt(p.total);
  const gs=sum(groups.map(g=>amt(g.target)));
  if(gs!==total)out.push({code:'SUM_GROUPS',text:'그룹 목표 합이 총액보다 '+gap(gs,total)});
  const steps=Array.isArray(p.ladder?.steps)?p.ladder.steps:[];
  for(const g of groups){
    const have=g.role==='CASH_LADDER'?(p.ladder&&p.ladder.group===g.id?sum(steps.map(s=>amt(s.amount))):0n):sum(items.filter(it=>it.group===g.id).map(it=>amt(it.target)));
    if(have!==amt(g.target))out.push({code:'GROUP_ITEMS',text:"그룹 '"+g.name+"' "+(g.role==='CASH_LADDER'?'계단 금액':'종목 목표')+' 합이 '+gap(have,amt(g.target))});
  }
  for(const it of items){const have=sum((Array.isArray(it.schedule)?it.schedule:[]).map(s=>amt(s.amount)));if(have!==amt(it.target))out.push({code:'ITEM_SCHEDULE',text:"종목 '"+it.name+"' 회차 금액 합이 "+gap(have,amt(it.target))});}
  if(sectors.length){
    const ss=sum(sectors.map(s=>amt(s.target))),withSector=sum(items.filter(it=>it.sector!==null&&it.sector!==undefined).map(it=>amt(it.target)));
    if(ss!==withSector)out.push({code:'SECTORS',text:'섹터 목표 합이 섹터 종목 합보다 '+gap(ss,withSector)});
    for(const s of sectors){const have=sum(items.filter(it=>it.sector===s.id).map(it=>amt(it.target)));if(have!==amt(s.target))out.push({code:'SECTORS',text:"섹터 '"+s.name+"' 종목 합이 "+gap(have,amt(s.target))});}
  }
  for(const g of groups)if(g.role==='HIGH_RISK'&&g.capPctBp!==null&&g.capPctBp!==undefined&&amt(g.target)*10000n>total*BigInt(g.capPctBp))out.push({code:'HIGH_RISK_CAP',text:"고위험 '"+g.name+"' 목표가 총액의 "+pctText(g.capPctBp)+'를 넘음'});
  if(p.ladder){let prev=null,ok=true;try{prev=decU(p.ladder.base);for(const s of steps){const v=decU(s.price);if(!(v<prev)){ok=false;break;}prev=v;}}catch{ok=false;}if(!ok)out.push({code:'LADDER_ORDER',text:'하락 계단 가격이 기준가 아래로 내려가는 순서가 아님'});}
  return out;
}
export function importPreview(plan){
  const rounds=Array.from({length:plan.months},(_,i)=>sum(plan.items.flatMap(it=>it.schedule.filter(s=>s.m===i).map(s=>big(s.amount)))));
  return {groups:plan.groups.length,items:plan.items.length,total:plan.total,rounds:rounds.map(String),ladderSteps:plan.ladder?plan.ladder.steps.length:0,unknownBase:plan.items.filter(it=>it.basePrice===null).length};
}
const stableOf=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stableOf).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableOf(v[k])).join(',')+'}';
export const investStable=stableOf;
// 같은 계획 id를 다시 가져올 때의 차이(확인 화면 "바뀜: 종목 n · 금액 n").
export function importDiff(oldPlan,newPlan){
  if(!oldPlan)return {items:newPlan.items.length,amounts:newPlan.items.length,same:false};
  const O=new Map(oldPlan.items.map(i=>[i.id,i])),N=new Map(newPlan.items.map(i=>[i.id,i]));let items=0,amounts=0;
  for(const id of new Set([...O.keys(),...N.keys()])){
    const o=O.get(id),n=N.get(id);
    if(!o||!n){items++;amounts++;continue;}
    const {target:ot,schedule:os,...orest}=o,{target:nt,schedule:ns,...nrest}=n;
    if(stableOf(orest)!==stableOf(nrest))items++;
    if(ot!==nt||stableOf(os)!==stableOf(ns))amounts++;
  }
  if(oldPlan.total!==newPlan.total||stableOf(oldPlan.groups.map(g=>g.target))!==stableOf(newPlan.groups.map(g=>g.target)))amounts++;
  return {items,amounts,same:stableOf(oldPlan)===stableOf(newPlan)};
}
// 계획 파일 읽기: .json · 256KB · 엄격 UTF-8(BOM 제거) · 최상위 키 정확히 format·planId·plan(+note) · 형식 일치 · 검사기 통과. 계획 점검은 problems로 돌려준다(빈 배열일 때만 저장).
export function parseInvestImport(input,{name=null}={}){
  const no=code=>({ok:false,code});
  if(name!==null&&!/\.json$/i.test(String(name)))return no('INVEST_IMPORT_NOT_JSON');
  const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):typeof input==='string'?new TextEncoder().encode(input):null;
  if(!bytes)return no('INVEST_IMPORT_SHAPE');
  if(bytes.length>INVEST_IMPORT_MAX_BYTES)return no('INVEST_IMPORT_TOO_LARGE');
  let txt;try{txt=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return no('INVEST_IMPORT_UTF8');}
  if(txt.charCodeAt(0)===0xFEFF)txt=txt.slice(1);
  let doc;try{doc=JSON.parse(txt);}catch{return no('INVEST_IMPORT_JSON');}
  if(!doc||typeof doc!=='object'||Array.isArray(doc))return no('INVEST_IMPORT_SHAPE');
  const keys=Object.keys(doc).sort().join('|');
  if(keys!=='format|plan|planId'&&keys!=='format|note|plan|planId')return no('INVEST_IMPORT_SHAPE');
  if(doc.format!==INVEST_IMPORT_FORMAT)return no('INVEST_IMPORT_FORMAT');
  if(Object.hasOwn(doc,'note')&&!(typeof doc.note==='string'&&doc.note.isWellFormed()&&[...doc.note].length<=INVEST_IMPORT_NOTE_MAX))return no('INVEST_IMPORT_SHAPE');
  try{validateInvestData('INVEST_PLAN',doc.planId,doc.plan);}catch(e){return no(e?.code??'INVALID_INVEST_PLAN');}
  return {ok:true,planId:doc.planId,plan:doc.plan,problems:planChecks(doc.plan),preview:importPreview(doc.plan)};
}
// 계획 저장(가져오기 [저장]·재검토 신호 체크 = 연산 1). ports = {write(type,id,data,heads), doorOpen()}. 문이 닫혔으면 쓰지 않는다.
export async function saveInvestPlan(ports,{planId,plan,heads=[]}){
  if(!ports.doorOpen())throw Object.assign(new Error('INVEST_DOOR_CLOSED'),{code:'INVEST_DOOR_CLOSED'});
  validateInvestData('INVEST_PLAN',planId,plan);
  if(planChecks(plan).length)throw Object.assign(new Error('INVEST_PLAN_CHECK'),{code:'INVEST_PLAN_CHECK'});
  return ports.write('INVEST_PLAN',planId,structuredClone(plan),heads);
}

// ---- 계산(투영, 저장 0) — 설계 3절 ----
// raw = investRawView 결과(금고), draft = 이 기기 초안 달 기록 [{month,data}](아직 안 쌓은 매수, 화면은 초안 기준). today = 'YYYY-MM-DD'.
const LEVEL_ORDER={RED:0,YELLOW:1,GRAY:2};
export function investView(raw,{today,draft=null}={}){
  requireValue(dateOK(today),'INVALID_INVEST_DATE');
  const plans=(raw?.plans??[]).filter(p=>p.data?.active===true);
  if(!plans.length)return {status:'NONE',today,activeCount:0,warnings:[],summary:null};
  const P=plans[0],plan=P.data,planId=P.id,warnings=[];
  const warn=(level,rule,text,extra={})=>warnings.push({level,rule,text,...extra});
  if(plans.length>1)warn('YELLOW','MULTI_PLAN','안내 · 활성 계획 '+plans.length+'개 · 첫 계획('+planId+')만 보여요');
  const monthRows=new Map((raw?.months??[]).map(m=>[m.month,m.data]));
  for(const d of draft??[])if(d?.data)monthRows.set(d.month,d.data);
  const recs=[...monthRows].filter(([,d])=>d&&d.plan===planId).sort((a,b)=>a[0]<b[0]?-1:1);
  const start=monthNo(plan.startMonth),roundOf=date=>monthNo(date.slice(0,7))-start;
  const curRaw=monthNo(today.slice(0,7))-start,state=curRaw<0?'BEFORE':curRaw>=plan.months?'DONE':'ACTIVE';
  const items=new Map(plan.items.map(it=>[it.id,it])),groups=new Map(plan.groups.map(g=>[g.id,g]));
  const buys=recs.flatMap(([,d])=>d.buys.map(b=>({...b,round:roundOf(b.date)})));
  const marks=recs.flatMap(([,d])=>d.marks);
  const stock=buys.filter(b=>b.kind!=='LADDER'),ladderBuys=buys.filter(b=>b.kind==='LADDER');
  // 종목별 넣음(PLAN·EXTRA) · 회차별 넣음
  const paid=new Map(),roundPaid=new Map(),key=(id,i)=>id+'#'+i;
  for(const b of stock){
    const it=b.item===null?null:items.get(b.item);
    if(!it){warn('YELLOW','OFF_PLAN',"안내 · 계획에 없는 종목 매수 '"+b.sym+"' ("+b.date+')',{buy:b.id});continue;}
    paid.set(it.id,(paid.get(it.id)??0n)+big(b.amount));roundPaid.set(key(it.id,b.round),(roundPaid.get(key(it.id,b.round))??0n)+big(b.amount));
    if(b.venue!==it.venue)warn('YELLOW','VENUE',"안내 · '"+it.name+"' 매수처가 계획("+VENUE_TEXT[it.venue]+')과 다르게 기록됨 ('+b.date+')',{buy:b.id});
  }
  const cur=Math.min(Math.max(curRaw,0),plan.months-1);
  const schedAt=(it,i)=>it.schedule.find(s=>s.m===i)??null;
  const itemRows=plan.items.map(it=>{
    const p=paid.get(it.id)??0n,t=big(it.target),s=schedAt(it,cur);
    return {id:it.id,sym:it.sym,name:it.name,group:it.group,sector:it.sector,venue:it.venue,venueText:VENUE_TEXT[it.venue],fixed:it.fixed,priced:it.basePrice!==null,
      target:it.target,paid:String(p),pctBp:Math.min(10000,bpOf(p,t)??0),over:String(p>t?p-t:0n),roundPlan:s?s.amount:'0',roundPaid:String(roundPaid.get(key(it.id,cur))??0n)};
  });
  // 그룹·섹터 게이지: 원금 기준(투입 원금 안에서의 비중). 현금(CASH_LADDER)은 남은 현금.
  const invGroups=plan.groups.filter(g=>g.role!=='CASH_LADDER');
  const gPaid=g=>sum(plan.items.filter(it=>it.group===g.id).map(it=>paid.get(it.id)??0n));
  const paidAll=sum(invGroups.map(gPaid)),targetAll=sum(invGroups.map(g=>big(g.target)));
  const ladderSpent=sum(ladderBuys.map(b=>big(b.amount)));
  const groupRows=plan.groups.map(g=>{
    if(g.role==='CASH_LADDER'){const spent=plan.ladder&&plan.ladder.group===g.id?ladderSpent:0n;return {id:g.id,name:g.name,role:g.role,target:g.target,cash:true,spent:String(spent),cashLeft:String(big(g.target)-spent)};}
    const p=gPaid(g);return {id:g.id,name:g.name,role:g.role,target:g.target,cash:false,paid:String(p),progressBp:bpOf(p,big(g.target)),targetPctBp:bpOf(big(g.target),targetAll),actualPctBp:bpOf(p,paidAll)};
  });
  const sPaid=s=>sum(plan.items.filter(it=>it.sector===s.id).map(it=>paid.get(it.id)??0n));
  const sPaidAll=sum(plan.sectors.map(sPaid)),sTargetAll=sum(plan.sectors.map(s=>big(s.target)));
  const sectorRows=plan.sectors.map(s=>{const p=sPaid(s);return {id:s.id,name:s.name,target:s.target,paid:String(p),progressBp:bpOf(p,big(s.target)),targetPctBp:bpOf(big(s.target),sTargetAll),actualPctBp:bpOf(p,sPaidAll)};});
  // 가장 최근 가격 메모(날짜 최대, 같은 날이면 나중 항목)
  const lastMark=sym=>{let m=null;for(const x of marks)if(x.sym===sym&&(!m||x.date>=m.date))m=x;return m;};
  // 시세 참고: 보유한 기호마다 모든 매수에 수량이 있고 가격 메모(+USD면 환율 메모)가 있을 때만 평가액. 하나라도 빠지면 가격 없음 n종목.
  const market=(()=>{
    const bySym=new Map();
    for(const b of buys){const it=b.kind==='LADDER'?null:b.item===null?null:items.get(b.item);const g=b.kind==='LADDER'?plan.ladder?.group??null:it?.group??null;if(!g)continue;
      const r=bySym.get(b.sym)??{sym:b.sym,qty:0n,qtyKnown:true,groups:new Map()};if(b.qty===null)r.qtyKnown=false;else{r.qty+=decU(b.qty);r.groups.set(g,(r.groups.get(g)??0n)+decU(b.qty));}bySym.set(b.sym,r);}
    if(!bySym.size)return {ok:false,missing:0,held:0};
    const fx=lastMark(FX_SYM);let missing=0,asOf=null;const value=new Map();
    for(const r of bySym.values()){
      const m=lastMark(r.sym);if(!r.qtyKnown||!m||m.ccy==='USD'&&!fx){missing++;continue;}
      for(const [g,q] of r.groups){const v=m.ccy==='USD'?q*decU(m.price)*decU(fx.price)/10n**24n:q*decU(m.price)/10n**16n;value.set(g,(value.get(g)??0n)+v);}
      for(const d of [m.date,...(m.ccy==='USD'?[fx.date]:[])])if(!asOf||d<asOf)asOf=d;
    }
    if(missing)return {ok:false,missing,held:bySym.size};
    const all=sum([...value.values()]);
    return {ok:true,asOf,stale:dayNo(today)-dayNo(asOf)>INVEST_STALE_DAYS,total:String(all),groups:plan.groups.map(g=>({id:g.id,value:String(value.get(g.id)??0n),pctBp:bpOf(value.get(g.id)??0n,all)})),value};
  })();
  // 월 벽돌: 회차 칸 = schedule에 그 회차가 있는 종목. 칸 채움 = 그 회차 매수 합 ≥ 계획 × (1 − 허용률). 회차 완료 = 칸이 모두 채움.
  const rounds=Array.from({length:plan.months},(_,i)=>{
    const cells=plan.items.flatMap(it=>{const s=schedAt(it,i);if(!s)return [];const got=roundPaid.get(key(it.id,i))??0n;return [{item:it.id,amount:s.amount,paid:String(got),filled:got*10000n>=big(s.amount)*BigInt(10000-INVEST_TOLERANCE_BP)}];});
    const planned=sum(cells.map(c=>big(c.amount))),got=sum(plan.items.map(it=>roundPaid.get(key(it.id,i))??0n));
    return {i,month:monthAt(plan.startMonth,i),planned:String(planned),paid:String(got),cells:cells.length,filled:cells.filter(c=>c.filled).length,done:cells.length>0&&cells.every(c=>c.filled),detail:cells};
  });
  const bricks=rounds.filter(r=>r.done).length;
  // 규칙 ② 고정 종목: 일정 밖 회차·다른 날·회차 합 초과 = 위반(적게 산 것은 위반 아님)
  for(const it of plan.items.filter(x=>x.fixed)){
    const mine=stock.filter(b=>b.item===it.id),rs=[...new Set(mine.map(b=>b.round))].sort((a,b)=>a-b);
    for(const i of rs){
      const s=schedAt(it,i),got=roundPaid.get(key(it.id,i))??0n;
      if(!s){warn('RED','FIXED',"위반 · 고정 종목 '"+it.name+"' "+(i+1)+'회차: 계획에 없는 회차의 매수',{item:it.id,round:i});continue;}
      for(const b of mine.filter(x=>x.round===i&&s.date!==null&&x.date!==s.date))warn('RED','FIXED',"위반 · 고정 종목 '"+it.name+"' "+(i+1)+'회차: 정한 날('+s.date+')과 다른 날('+b.date+') 매수',{item:it.id,round:i,buy:b.id});
      if(got>big(s.amount))warn('RED','FIXED',"위반 · 고정 종목 '"+it.name+"' "+(i+1)+'회차: 계획 금액보다 '+wonText(got-big(s.amount))+'원 많음',{item:it.id,round:i});
    }
  }
  // 규칙 ③ 고위험: 원금 ÷ 총액 > 한도 = 위반, 추가 매수 금지 종목의 계획 밖 매수 = 위반, 시세 기준 비중 > 한도 = 참고(위반 아님)
  for(const g of plan.groups.filter(x=>x.role==='HIGH_RISK')){
    const p=gPaid(g);
    if(g.capPctBp!==null&&p*10000n>big(plan.total)*BigInt(g.capPctBp))warn('RED','HIGH_RISK',"위반 · 고위험 '"+g.name+"' 원금 "+pctText(bpOf(p,big(plan.total)))+' · 한도 '+pctText(g.capPctBp)+' 넘음(총액 기준)',{group:g.id});
    if(g.noExtra)for(const it of plan.items.filter(x=>x.group===g.id)){
      for(const b of stock.filter(x=>x.item===it.id&&x.kind==='EXTRA'))warn('RED','HIGH_RISK',"위반 · 고위험 '"+it.name+"' 추가 매수 금지 종목에 계획 밖 매수 ("+b.date+')',{item:it.id,buy:b.id});
      for(const i of new Set(stock.filter(x=>x.item===it.id&&x.kind!=='EXTRA').map(x=>x.round))){const s=schedAt(it,i),got=roundPaid.get(key(it.id,i))??0n,lim=s?big(s.amount):0n;if(got>lim)warn('RED','HIGH_RISK',"위반 · 고위험 '"+it.name+"' "+(i+1)+'회차: 계획 금액보다 '+wonText(got-lim)+'원 많음',{item:it.id,round:i});}
    }
    if(market.ok&&g.capPctBp!==null){const v=market.value.get(g.id)??0n,all=big(market.total);if(all>0n&&v*10000n>all*BigInt(g.capPctBp))warn('GRAY','HIGH_RISK_MARKET',"참고 · 시세 기준 고위험 '"+g.name+"' "+pctText(bpOf(v,all))+' · 한도 '+pctText(g.capPctBp)+'보다 큼(위반 아님)',{group:g.id});}
  }
  // 규칙 ④ 하락 계단
  let ladder=null;
  if(plan.ladder){
    const L=plan.ladder,n=L.steps.length,m=lastMark(L.sym),price=m?decU(m.price):null,count=new Map(),spentAt=new Map();
    for(const b of ladderBuys){count.set(b.step,(count.get(b.step)??0)+1);spentAt.set(b.step,(spentAt.get(b.step)??0n)+big(b.amount));}
    for(const b of [...ladderBuys].sort((a,c)=>a.date<c.date?-1:a.date>c.date?1:0)){
      if(b.step>n){warn('RED','LADDER','위반 · 하락 계단은 '+n+'단계까지인데 '+b.step+'단계 기록 ('+b.date+')',{buy:b.id});continue;}
      if(b.step>1&&!count.has(b.step-1))warn('YELLOW','LADDER','안내 · 하락 계단 '+b.step+'단계를 '+(b.step-1)+'단계보다 먼저 기록함',{buy:b.id});
    }
    for(const [k,c] of count)if(k<=n&&c>1)warn('RED','LADDER','위반 · 하락 계단 '+k+'단계를 '+c+'번 기록함',{step:k});
    for(const [k,s] of spentAt)if(k<=n&&s>big(L.steps[k-1].amount))warn('RED','LADDER','위반 · 하락 계단 '+k+'단계 금액보다 '+wonText(s-big(L.steps[k-1].amount))+'원 많음',{step:k});
    const steps=L.steps.map((s,i)=>({k:i+1,price:s.price,amount:s.amount,state:count.has(i+1)?'DONE':price!==null&&price<=decU(s.price)?'MET':'WAIT'}));
    const total=sum(L.steps.map(s=>big(s.amount))),next=steps.find(s=>s.state!=='DONE')??null;
    ladder={sym:L.sym,base:L.base,ccy:L.ccy,current:m?{price:m.price,date:m.date,src:m.src,stale:dayNo(today)-dayNo(m.date)>INVEST_STALE_DAYS}:null,steps,
      cashLeft:String(total-ladderSpent),ended:steps.every(s=>s.state==='DONE'),next:next?next.k:null};
    ladder.line=ladderLine(ladder);
  }
  // 규칙 ⑤ 리밸런싱: 분할이 끝난 뒤, 계획의 점검 달에만. 시세 참고가 되면 시세 비중, 아니면 원금 비중으로 목표의 lowPct% 미만·highPct% 초과를 알린다.
  if(state==='DONE'&&Number(today.slice(5,7))===plan.rebalance.month){
    const {lowPct,highPct}=plan.rebalance,basis=market.ok?'시세':'원금';
    const actualOf=g=>market.ok?market.value.get(g.id)??0n:gPaid(g),actualAll=market.ok?sum(invGroups.map(actualOf)):paidAll;
    const check=(name,a,A,t,T)=>{if(A<=0n||T<=0n||t<=0n)return;const lhs=a*T*100n;if(lhs<t*A*BigInt(lowPct)||lhs>t*A*BigInt(highPct))warn('YELLOW','REBALANCE','안내 · 올해 리밸런싱 점검('+basis+" 기준): '"+name+"' "+pctText(bpOf(a,A))+'(목표 '+pctText(bpOf(t,T))+'의 '+Number(lhs/(t*A))+'%)');};
    for(const g of invGroups)check(g.name,actualOf(g),actualAll,big(g.target),targetAll);
    if(!market.ok)for(const s of plan.sectors)check(s.name,sPaid(s),sPaidAll,big(s.target),sTargetAll);
  }
  // 규칙 ⑥ 재검토 신호, 계획 점검
  const on=plan.signals.filter(s=>s.on).length;
  if(on)warn('YELLOW','SIGNAL','안내 · 재검토 신호 '+on+'개 켜짐');
  const problems=planChecks(plan);
  if(problems.length)warn('YELLOW','PLAN_CHECK','안내 · 계획 점검 '+problems.length+'건: '+problems.map(p=>p.text).join(' · '));
  warnings.sort((a,b)=>LEVEL_ORDER[a.level]-LEVEL_ORDER[b.level]);
  const {value:_v,...marketOut}=market;
  return {status:'OK',today,planId,name:plan.name,activeCount:plans.length,total:plan.total,months:plan.months,startMonth:plan.startMonth,
    round:{cur:curRaw,state,month:state==='ACTIVE'?monthAt(plan.startMonth,curRaw):null},rounds,bricks,items:itemRows,groups:groupRows,sectors:sectorRows,market:marketOut,ladder,
    warnings,red:warnings.filter(w=>w.level==='RED').length,signals:plan.signals.map(s=>({...s})),rebalance:{...plan.rebalance},
    summary:{bricks,months:plan.months,planned:rounds.filter(r=>r.cells>0).length}};
}
// 하락 계단 한 줄: "조건 충족 / 대기"만(매수 권유 문구 없음).
export function ladderLine(l){
  const parts=['기준 '+l.base];
  parts.push(l.current?'현재 '+l.current.price+' ('+shortDate(l.current.date)+(l.current.src==='PC_CACHE'?' PC 캐시':' 입력')+(l.current.stale?' · 오래된 가격':'')+')':'현재가 입력 없음');
  if(l.ended)parts.push('계단 끝('+l.steps.length+'단계 뒤 끝)');
  else{
    const met=l.steps.filter(s=>s.state==='MET'),next=l.steps.find(s=>s.state==='WAIT');
    for(const s of met)parts.push(s.k+'단계 조건 충족');
    if(next)parts.push((l.current?'':'다음 발동 가격 ')+next.k+'단계 '+next.price+' 이하');
  }
  parts.push('남은 현금 '+wonText(l.cashLeft)+'원');
  return parts.join(' · ');
}

// ---- 이 기기 초안 묶기(OPS1A, 설계 4-4) ----
// 매수·가격 메모 입력은 그 달 INVEST_MONTH 초안(카드 초안 상자, 연산 0)에 모이고, "지금 쌓기"·5분 자동 쌓기·저장 후 종료가 달마다 1번 쓴다(연산 1).
// port = card-draft-box port('INVEST_MONTH'), box = 상자(쓰기 확인용, 없으면 써진 것으로 본다), getRaw() = 금고 investRawView, write({month,data,heads}) = 실제 저장,
// rebase = life-rebase rebaseInvestMonth(같은 달 두 기기 = 매수 id 기준 3자 병합), doorOpen() = 투자 문, ops() = 남은 연산({known,remaining}, 모르면 null).
// 남은 연산이 쌓을 달 수보다 적으면 하나도 쌓지 않는다(V15 OPS_SHORT와 같은 검사). 실패한 달은 초안 그대로(입력을 잃지 않음).
export const INVEST_DRAFT_REASON='투자 기록 임시 입력';
export const INVEST_STACK_REASON='투자 기록 쌓기';
const PUT_ROUNDS=3;
const investErr=code=>Object.assign(new Error(code),{code});
const sameHeads=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((h,i)=>h===b[i]);
export function createInvestDrafts({port,box=null,getRaw,write,rebase,doorOpen=()=>false,ops=()=>null,now=()=>new Date().toISOString()}){
  const cache=new Map();let ver=0,memo=null;
  const changed=()=>{ver++;memo=null;};
  const read=async(fresh=false)=>{
    const got=await port.list(fresh?{fresh:true}:undefined),next=new Map();
    for(const d of got){
      const b=d?.body;if(d?.type!=='ENTITY'||b?.entityType!=='INVEST_MONTH'||!INVEST_MONTH_RE.test(b.entityId??'')||!b.data)continue;
      const c=next.get(b.entityId);if(c&&c.createdAt>d.createdAt)continue;
      next.set(b.entityId,{draftId:d.draftId,base:b.investBase??null,mine:b.data,heads:[...(b.expectedHeads??[])],createdAt:d.createdAt});
    }
    cache.clear();for(const [k,v] of next)cache.set(k,v);changed();
  };
  const ready=read().catch(()=>{});
  const stored=month=>(getRaw()?.months??[]).find(m=>m.month===month)??null;
  const persisted=month=>{const s=box?.statusFor?.('INVEST_MONTH',month);return !s||(s.has&&!s.dirty&&!s.own);};
  const api={
    ready,reload:()=>read(true),count:()=>cache.size,months:()=>[...cache.keys()].sort(),get:month=>cache.has(month)?structuredClone(cache.get(month)):null,
    // 그 달 초안(없으면 금고 값, 없으면 빈 달) 위에 mutate를 적용해 초안에 둔다(연산 0). 검사기를 통과해야 둔다. 금고 값과 같아지면 초안을 지운다.
    async put(month,planId,mutate){
      if(!doorOpen())throw investErr('INVEST_DOOR_CLOSED');
      await ready;
      for(let round=1;round<=PUT_ROUNDS;round++){
        await read(true);
        const d=cache.get(month),row=stored(month),base=d?d.base:row?.data??null,heads=d?d.heads:row?[...row.heads]:[];
        const next=structuredClone(d?d.mine:row?.data??emptyInvestMonth(month,planId));
        mutate(next);next.month=month;
        validateInvestData('INVEST_MONTH',month,next);
        // 금고 값과 같거나, 금고에 없는 달을 비웠으면(빈 기록은 쌓지 않음) 초안을 지운다
        if(stableOf(next)===stableOf(base)||base===null&&!next.buys.length&&!next.marks.length){if(d){await port.discard(d.draftId);if(cache.get(month)===d){cache.delete(month);changed();}}return {status:'SAME',data:next};}
        const body={entityType:'INVEST_MONTH',entityId:month,expectedHeads:heads,data:structuredClone(next),investBase:base===null?null:structuredClone(base),reason:INVEST_DRAFT_REASON};
        let r;
        try{r=await port.save({type:'ENTITY',body},{base:d?.draftId??null});}
        catch(e){if(e?.code==='CARD_DRAFT_STALE_BASE')continue;throw e;}
        if(!persisted(month)){if(box?.statusFor?.('INVEST_MONTH',month)?.own==='STALE_DRAFT')continue;throw investErr(box?.statusFor?.('INVEST_MONTH',month)?.own??'CARD_DRAFT_WRITE_FAILED');}
        cache.set(month,{draftId:r?.draftId??null,base,mine:structuredClone(next),heads,createdAt:now()});changed();
        return {status:'DRAFTED',data:next};
      }
      throw investErr('CARD_DRAFT_STALE_BASE');
    },
    // 쌓기: 달 순서로 달마다 write 1번. 금고가 초안의 기준과 다르면(다른 기기가 같은 달을 쌓음) 매수 id 기준으로 합친 뒤 쓴다. STALE_HEADS면 다시 읽어 최대 3번.
    async flush({reload=null}={}){
      await ready;let stacked=0,failed=0;const codes=[];
      try{await read(true);}catch{/* 캐시 그대로 */}
      const months=api.months();
      if(!months.length)return {stacked,failed,codes};
      if(!doorOpen())return {stacked:0,failed:months.length,codes:['INVEST_DOOR_CLOSED']};
      const o=ops?.();if(o?.known&&months.length>o.remaining)return {stacked:0,failed:months.length,codes:['OPS_SHORT'],need:months.length,reason:'OPS_SHORT'};
      for(const month of months){
        const d=cache.get(month);if(!d)continue;let done=false,code=null;
        for(let attempt=1;attempt<=3&&!done;attempt++){
          const row=stored(month),latest=row?.data??null,lh=row?[...row.heads]:[];
          let data=d.mine,heads=d.heads;
          if(!sameHeads(lh,d.heads)){
            const rb=rebase({month,base:d.base,mine:d.mine,latest});
            if(rb.status==='REJECTED'){code=rb.code;break;}
            if(rb.status==='ALREADY_APPLIED'){done=true;break;}
            data=rb.card;heads=lh;
          }
          try{await write({month,data:structuredClone(data),heads});done=true;}
          catch(e){code=typeof e?.code==='string'?e.code:'FAILED';if(code==='STALE_HEADS'&&reload&&attempt<3){try{await reload();}catch{break;}continue;}break;}
        }
        if(!done){failed++;codes.push(code??'FAILED');continue;}
        try{if(d.draftId)await port.discard(d.draftId);}catch{/* 다음 쌓기에서 같은 값 = 합친 결과가 금고와 같음(연산 0) */}
        if(cache.get(month)===d){cache.delete(month);changed();}
        stacked++;
      }
      return {stacked,failed,codes};
    },
    // 화면용 초안 달 기록 [{month,data}]: 금고가 초안의 기준과 다르면 매수 id 기준으로 얹은 결과(쌓기와 같은 규칙, 읽기만). 합칠 수 없으면 초안 그대로.
    shown(){
      const raw=getRaw();if(memo?.raw===raw&&memo.ver===ver)return memo.out;
      const out=[...cache].sort((a,b)=>a[0]<b[0]?-1:1).map(([month,d])=>{
        const row=stored(month);if(!row||sameHeads(row.heads,d.heads)||typeof rebase!=='function')return {month,data:structuredClone(d.mine)};
        const rb=rebase({month,base:d.base,mine:d.mine,latest:row.data});
        return {month,data:rb.status==='MERGED'?rb.card:rb.status==='ALREADY_APPLIED'?row.data:structuredClone(d.mine)};
      });
      memo={raw,ver,out};return out;
    },
  };
  return api;
}
