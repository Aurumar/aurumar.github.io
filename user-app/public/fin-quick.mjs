// B64C: 카드 밖 거래 빠른 입력 칩(돈 탭 "거래" 소탭 맨 위). 칩은 거래 창을 미리 채워 열기만 한다: 금액·날짜는 사람이 넣고, 저장은 기존 FIN_TXN 경로 1건 = 1연산. 칩을 누르는 것만으로는 연산 0.
// 회계 규칙: 카드 계정에 수입 불가(수입은 계좌·현금), 선불 전환과 이체는 소비가 아니라서 분류 없음. 칩은 규칙에 어긋나는 계정을 고르지 않고, 맞는 계정이 없으면 "계정 추가"로 안내한다.
// 기억(lb.fin.quick.v1)은 이 기기 localStorage. 동기화 기록이 아니다. 저장소가 막히면 이번 실행 메모리만 쓴다.
// 가맹점·메모·금액은 기억에 넣지 않는다(B48C F10: 가맹점 이름을 평문 저장소에 두지 않는다). 민감 거래는 종류도 기억하지 않는다.
import {isSensitive} from './fin-ledger.mjs';

export const QUICK_KEY='lb.fin.quick.v1',QUICK_RECENT_MAX=5;
const ZEROPAY='제로페이 상품권';
export const QUICK_PRESETS=Object.freeze([
  {id:'SALE',label:'중고 판매(수입)',kind:'INCOME',category:'SALE',from:['BANK','CASH'],merchant:'중고 판매',memo:'중고 판매',need:'은행 계좌나 현금 계정'},
  {id:'ZEROPAY_CARD',label:ZEROPAY+'(카드)',kind:'PREPAID_LOAD',category:null,from:['CARD'],merchant:ZEROPAY,memo:ZEROPAY+' 구매(카드)',need:'카드 계정'},
  {id:'ZEROPAY_BANK',label:ZEROPAY+'(계좌)',kind:'PREPAID_LOAD',category:null,from:['BANK'],merchant:ZEROPAY,memo:ZEROPAY+' 구매(계좌)',need:'은행 계좌 계정'},
  {id:'CARD_PAYMENT',label:'카드 대금 납부(이체)',kind:'TRANSFER',category:null,from:['BANK'],to:['CARD'],merchant:'',memo:'카드 대금 납부',need:'은행 계좌와 카드 계정'},
].map(p=>Object.freeze(p)));

// ---------- 기억 모양 ----------
const textOK=v=>typeof v==='string'&&v.length>0&&v.length<=120;
const signature=e=>JSON.stringify([e.kind,e.category??null,e.accountId,e.toAccountId??null]);
// 거래에서 기억할 칸만 뽑는다. 저장소에서 읽은 값도 이 함수를 거치므로 다른 칸은 남지 않는다.
function recentEntry(data){
  if(!data||typeof data!=='object'||isSensitive(data)||!textOK(data.kind)||!textOK(data.accountId))return null;
  return {kind:data.kind,category:textOK(data.category)?data.category:null,accountId:data.accountId,toAccountId:textOK(data.toAccountId)?data.toAccountId:null};
}
function cleanMemory(raw){
  const last={},recent=[],seen=new Set();
  for(const p of QUICK_PRESETS){const v=raw?.last&&Object.hasOwn(raw.last,p.id)?raw.last[p.id]:null;if(v&&textOK(v.accountId))last[p.id]={accountId:v.accountId,toAccountId:textOK(v.toAccountId)?v.toAccountId:null};}
  for(const v of Array.isArray(raw?.recent)?raw.recent:[]){
    const e=recentEntry(v);if(!e||seen.has(signature(e)))continue;
    seen.add(signature(e));recent.push(e);if(recent.length===QUICK_RECENT_MAX)break;
  }
  return {last,recent};
}
// 저장된 거래 하나를 기억에 반영한다. 칩 그대로 저장했으면 그 칩의 마지막 계정만 바꾸고, 그 밖은 "최근" 맨 앞으로 올린다.
export function afterSave(memory,data,presetId=null){
  const p=QUICK_PRESETS.find(x=>x.id===presetId);
  if(p&&data.kind===p.kind&&(data.category??null)===p.category)return {...memory,last:{...memory.last,[p.id]:{accountId:data.accountId,toAccountId:data.toAccountId??null}}};
  const e=recentEntry(data);if(!e)return memory;
  const s=signature(e);
  return {...memory,recent:[e,...memory.recent.filter(x=>signature(x)!==s)].slice(0,QUICK_RECENT_MAX)};
}
export function createQuickMemory(getStorage=()=>null){
  let held=cleanMemory(null),heldOnly=false;   // heldOnly: 마지막 쓰기가 실패했다. 저장소의 옛 값 대신 이번 실행 값을 쓴다.
  const box=()=>{try{return getStorage()??null;}catch{return null;}};
  const read=()=>{
    const s=heldOnly?null:box();if(!s)return held;
    try{const text=s.getItem(QUICK_KEY);held=cleanMemory(text===null?null:JSON.parse(text));}catch{/* 막혔거나 망가진 값은 메모리 값으로 */}
    return held;
  };
  const saved=(data,presetId=null)=>{
    const next=afterSave(read(),data,presetId);held=next;
    const s=box();
    try{if(!s)throw new Error('NO_STORAGE');s.setItem(QUICK_KEY,JSON.stringify(next));heldOnly=false;}catch{heldOnly=true;}
    return next;
  };
  return {read,saved};
}

// ---------- 칩 ----------
function pick(accounts,types,lastId){
  const list=accounts.filter(a=>a.data.active===true&&types.includes(a.data.type));
  return list.find(a=>a.id===lastId)??list[0]??null;
}
export function presetChip(p,accounts,memory){
  const last=memory.last[p.id],from=pick(accounts,p.from,last?.accountId),to=p.to?pick(accounts,p.to,last?.toAccountId):null;
  const base={key:p.id,presetId:p.id,label:p.label,group:'PRESET'};
  if(!from||(p.to&&!to))return {...base,prefill:null,need:p.need};
  return {...base,need:null,prefill:{kind:p.kind,category:p.category,subcategory:'',accountId:from.id,toAccountId:to?.id??null,merchant:p.merchant,memo:p.memo}};
}
// 기억이 지금 장부와 맞지 않으면(계정 비활성·삭제, 분류 없음, 카드 수입) 칩을 만들지 않는다.
export function recentPrefill(e,{accounts,labels}){
  const from=accounts.find(a=>a.id===e.accountId);
  if(from?.data.active!==true||!labels.kinds.includes(e.kind))return null;
  if(e.kind==='INCOME'&&from.data.type==='CARD')return null;
  const base={kind:e.kind,category:null,subcategory:'',accountId:from.id,toAccountId:null,merchant:'',memo:''};
  if(e.kind==='PREPAID_LOAD')return base;
  if(e.kind==='TRANSFER'){const to=accounts.find(a=>a.id===e.toAccountId);return to?.data.active===true&&to.id!==from.id?{...base,toAccountId:to.id}:null;}
  const table=e.kind==='INCOME'?labels.income:labels.expense;
  return e.category!==null&&Object.hasOwn(table,e.category)?{...base,category:e.category}:null;
}
function recentLabel(prefill,{accounts,labels},kindText){
  const name=id=>accounts.find(a=>a.id===id)?.data.name??'';
  const table=prefill.kind==='INCOME'?labels.income:labels.expense;
  return [kindText[prefill.kind]??prefill.kind,prefill.category?table[prefill.category]:null,prefill.toAccountId?name(prefill.accountId)+' → '+name(prefill.toAccountId):name(prefill.accountId)].filter(Boolean).join(' · ');
}
export function quickChips(fin,memory,kindText={}){
  const presets=QUICK_PRESETS.map(p=>presetChip(p,fin.accounts,memory));
  const shown=new Set(presets.filter(c=>c.prefill).map(c=>signature(c.prefill))),recents=[];
  for(const e of memory.recent){
    const prefill=recentPrefill(e,fin);if(!prefill||shown.has(signature(prefill)))continue;   // 위 칩과 같은 내용이면 또 보이지 않는다
    shown.add(signature(prefill));recents.push({key:'RECENT:'+signature(prefill),presetId:null,label:recentLabel(prefill,fin,kindText),group:'RECENT',need:null,prefill});
  }
  return [...presets,...recents];
}
export function quickNeedText(need){return need+'이 있어야 이 칩을 쓸 수 있습니다 · "계정 추가"로 만들어 주세요.';}
export function renderQuickChips(root,fin,{h:{el,add,button},memory,kindText,open,needAccount}){
  const box=el('div',null,'fin-quick');box.setAttribute('role','group');box.setAttribute('aria-label','빠른 입력');
  add(box,el('span','빠른 입력','fin-quick-label'));
  let recentShown=false;
  for(const c of quickChips(fin,memory.read(),kindText)){
    if(c.group==='RECENT'&&!recentShown){recentShown=true;add(box,el('span','최근','fin-quick-label'));}
    let b;
    if(c.prefill)b=button(c.label,()=>open(c.prefill,c.presetId),'primary fin-quick-chip');   // primary: "거래 입력" 단추처럼 읽기 전용이면 잠긴다
    else{b=button(c.label+' · 계정 추가',()=>needAccount(c.need),'secondary fin-quick-chip fin-quick-need');b.dataset.navOnly='1';}
    add(box,b);
  }
  add(root,box);
  return box;
}
