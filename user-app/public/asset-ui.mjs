// V18B 순자산 화면(소유자 요청 2026-11-21, 통제탑 지시서 V18B_NETWORTH). 돈 탭 하위 탭 "순자산"의 요약(총자산 · 총부채 · 순자산) · 비중 · 자산 줄 · 날짜별 기록 · 항목 추가/수정 · 보관 · 오늘 값 기록 · 자산 파일 가져오기 · 순자산 문 켜기 카드.
// 그리기는 app.mjs가 넘기는 포트(h = {el,add,button}, field)로만 한다. 이 파일은 app.mjs를 불러오지 않는다(가짜 DOM 시험에서 그대로 돈다). innerHTML·인라인 style 0.
// 계산은 asset-model assetView(저장 0). 부채 = 대출 목록(LOAN_BOOK)의 진행 중 잔액 합계를 loan-model loanView로 읽기만 한다(대출 기록을 쓰지 않음).
// 투자 계획(INVEST_PLAN·INVEST_MONTH)의 매수 원금은 더하지 않는다(실제 보유는 주식 항목으로 넣음 → 이중 계산 0).
// 쓰기는 포트가 한다: 모든 바꿈 = 자산 목록 ASSET_BOOK 1장 고쳐 쓰기(연산 1) + 그날 순자산 1줄(points)을 같은 기록에. 순자산 문이 닫혀 있으면 켜기 카드만 보이고 쓰기 단추는 없다.
// 문구는 사실만(금액 · 가격 · 환율 · 입력일). 권유 문구 0. 맨 아래 고정 문구.
import {assetView,assetRow,assetPoint,pointUpsert,pointRows,ASSET_KINDS,ASSET_KIND_TEXT,WON_KINDS,ASSET_MAX,ASSET_NAME_MAX,ASSET_INST_MAX,ASSET_NOTE_MAX,ASSET_STALE_DAYS,NO_DEBT,
  wonText,decText,shareText,parseAssetWon,parseDecimalInput,parseCurrencyInput,assetDraft,assetPut,assetSetActive,parseAssetImport,assetImportPlan,validateAssetBook,assetStable} from './asset-model.mjs';
import {loanView} from './loan-model.mjs';

export const ASSET_FIXED_TEXT='이 화면은 내가 넣은 금액 · 가격 · 환율로 계산한 판단 자료이며 금융 자문이 아닙니다.';
export const ASSET_DOOR_TEXT=Object.freeze({
  title:'순자산 기록 켜기',
  line:'4기기를 r88 이상으로 올린 뒤 켜기',
  why:'켜기 전에는 이 기기에서 순자산 기록을 쓰지 않아요(옛 앱 기기 보호). 다른 기기에서 켜고 기록하면 그 기록을 받는 순간 이 기기도 자동으로 열려요.',
  ask:'PC · 노트북 · Fold · iPad 4기기 모두 r88 이상인가요? 켜면 이 기기부터 순자산 기록을 쓸 수 있어요.',
});
export const ASSET_PRICE_TEXT='가격 · 환율은 입력한 값 기준 · 시세를 받아오지 않아요';
export const ASSET_FORMULA_TEXT='순자산 = 총자산 − 총부채';
export const ASSET_NO_DEBT_TEXT='대출 0 · 대출 화면에서 넣으면 자동 반영';
export const ASSET_INVEST_TEXT='투자 계획의 매수 원금은 더하지 않아요 · 실제 보유는 주식 항목으로 넣어요';
export const ASSET_EMPTY_TEXT='현금 · 간편결제 · 증권 예수금 · 외화 · 주식을 넣으면 총자산과 순자산이 여기에 보여요.';
export const ASSET_STALE_TEXT='오래된 가격';
export const ASSET_SAVE_NOTE='바꾸면 자산 목록 1장을 고쳐 쓰고 그날 순자산 1줄을 함께 남겨요(저장 1번)';
export const ASSET_POINTS_EMPTY='저장한 날마다 그날 순자산이 1줄씩 쌓여요.';
export const debtLine=d=>d.count>0?'대출 진행 중 '+d.count+'건 · 대출 화면 잔액 합계':ASSET_NO_DEBT_TEXT;

// 폭별 배치: >1000 2열(요약·비중·도구 | 목록·기록) · 그 밖 1열. ≤420 줄 단추를 두 줄로.
export const assetCols=w=>!Number.isFinite(w)||w>1000?2:1;
export const assetCompact=w=>Number.isFinite(w)&&w<=420;

// 부채 = 대출 목록의 진행 중 잔액 합계(읽기만). 대출이 없거나 읽을 수 없으면 0.
export function loanDebt(loans,today){
  try{const v=loanView(loans??{loans:[]},{today});return v.status==='OK'?{count:v.total.count,balance:v.total.balance}:NO_DEBT;}catch{return NO_DEBT;}
}

// 오류 코드 → 화면 글(모르는 ASSET 코드는 "순자산 검사 실패 · 코드").
const ERROR_TEXT={
  ASSET_DOOR_CLOSED:'순자산 기록이 꺼져 있어요 · 4기기를 r88 이상으로 올린 뒤 켜 주세요',
  ASSET_NAME:'항목 이름을 넣어 주세요(40자까지)',ASSET_AMOUNT_INPUT:'원화 금액은 원 단위 정수로 넣어 주세요(쉼표 가능)',
  ASSET_DECIMAL_INPUT:'숫자는 소수 8자리까지 넣어 주세요(쉼표 가능)',ASSET_CURRENCY_INPUT:'통화는 영문 3글자로 넣어 주세요(예: USD)',
  ASSET_FX_CURRENCY:'외화 예수금은 원화 밖 통화로 넣어 주세요(예: USD)',ASSET_FX_RATE:'원화가 아닌 통화는 환율(1단위 = 원)을 넣어 주세요',
  ASSET_STOCK_VALUE:'주식은 수량 × 평가 단가, 또는 평가 금액 중 하나를 넣어 주세요',
  ASSET_DATE:'날짜는 YYYY-MM-DD로 넣어 주세요',ASSET_FUTURE:'기준일은 오늘 뒤일 수 없어요',
  ASSET_TEXT_DIGITS:'글 칸에 숫자 10자리 이상을 적을 수 없어요(계좌번호 보호)',INVALID_ASSET_TEXT:'이름 40자 · 기관 20자 · 메모 60자까지, 제어 문자 없이 넣어 주세요',
  ASSET_COUNT_LIMIT:'자산 항목은 40개까지 넣을 수 있어요',ASSET_UNKNOWN:'없는 항목이에요 · 화면을 새로 고쳐 주세요',ASSET_SAME:'바뀐 것이 없어 저장하지 않아요',
  ASSET_IMPORT_NONE:'자산 파일을 먼저 골라 주세요',ASSET_IMPORT_NOT_JSON:'.json 파일만 가져올 수 있어요',ASSET_IMPORT_TOO_LARGE:'64KB보다 큰 파일은 가져올 수 없어요',
  ASSET_IMPORT_UTF8:'UTF-8 글자가 아닌 파일이에요',ASSET_IMPORT_JSON:'JSON 형식이 아닌 파일이에요',ASSET_IMPORT_SHAPE:'파일 모양이 달라요(format · assets만, note는 선택)',
  ASSET_IMPORT_FORMAT:'형식 이름이 달라요(lifebrick-assets-v1)',ASSET_IMPORT_EMPTY:'파일에 자산 줄이 없어요',
  DUPLICATE_ASSET_ID:'같은 항목 id가 두 번 있어요',ASSET_KIND_FIELDS:'종류에 맞지 않는 칸이 있어요',ASSET_TOO_LARGE:'자산 목록이 너무 커요(32KB까지)',
};
export const assetErrorText=code=>ERROR_TEXT[code]??(typeof code==='string'&&(code.startsWith('ASSET_')||code.startsWith('INVALID_ASSET'))?'순자산 검사 실패 · '+code:null);
const fail=code=>Object.assign(new Error(code),{code});
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const dayOK=v=>DAY.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;

// ---- 작은 조각 ----
function card(h,key,title,sub){const {el,add}=h,c=el('section',null,'panel asset-card asset-'+key);c.dataset.card=key;add(c,el('h2',title,'asset-card-title'));if(sub)add(c,el('p',sub,'muted small asset-card-sub'));return c;}
function navOnly(b){b.dataset.navOnly='1';return b;}
export function fixedNode(h){const p=h.el('p',ASSET_FIXED_TEXT,'asset-fixed');p.setAttribute('role','note');return p;}
function bar(h,bp,label){const n=h.el('progress',null,'asset-bar');n.max=10000;n.value=Math.min(10000,Math.max(0,bp??0));n.setAttribute('aria-label',label);return n;}
function stat(h,key,label,value,foot){const {el,add}=h,s=add(el('div',null,'asset-stat asset-stat-'+key),el('span',label,'asset-stat-label'),el('strong',value,'asset-stat-value'),foot?el('span',foot,'muted small asset-stat-foot'):null);s.dataset.stat=key;return s;}
const signed=n=>{const v=BigInt(n);return (v>0n?'+':'')+wonText(v)+'원';};

// 한 줄의 계산 근거(외화 · 주식). 원화 종류는 null.
export function valueLine(r){
  if(r.kind==='BROKER_FX')return decText(r.amount)+' '+r.currency+' × 환율 '+decText(r.fxRate)+'원 = '+wonText(r.value)+'원';
  if(r.kind!=='STOCK')return null;
  const fx=r.currency==='KRW'?'':' × 환율 '+decText(r.fxRate)+'원';
  if(r.price!==null)return decText(r.quantity)+'주 × 평가 단가 '+decText(r.price)+(r.currency==='KRW'?'원':' '+r.currency)+fx+' = '+wonText(r.value)+'원';
  return (r.quantity!==null?decText(r.quantity)+'주 · ':'')+'평가 금액 '+decText(r.amount)+(r.currency==='KRW'?'원':' '+r.currency)+fx+' = '+wonText(r.value)+'원';
}
export function dateLine(r){
  if(!r.priced)return '기준일 '+r.asOf;
  return (r.kind==='BROKER_FX'?'환율 입력일 ':'가격 입력일 ')+r.asOf+(r.days!==null&&r.days>0?' · '+r.days+'일 전':'');
}
function assetRowNode(h,r,act,{compact=false}={}){
  const {el,add,button}=h,row=el('div',null,'asset-row'+(compact?' compact':''));row.dataset.asset=r.id;
  add(row,add(el('div',null,'asset-row-head'),el('strong',r.name,'asset-name'),r.institution?el('span',r.institution,'muted small asset-inst'):null,el('span',r.kindText,'asset-kind'),r.stale?el('span',ASSET_STALE_TEXT,'asset-stale'):null));
  add(row,add(el('p',null,'asset-nums'),el('span',wonText(r.value)+'원','asset-value')));
  const v=valueLine(r);if(v)add(row,el('p',v,'small asset-calc-line'));
  add(row,el('p',dateLine(r)+(r.note?' · '+r.note:''),'muted small asset-asof'));
  if(act?.edit)add(row,add(el('div',null,'button-row asset-row-acts'),navOnly(button('수정',()=>act.edit(r.id),'secondary asset-edit-go')),navOnly(button('보관',()=>act.archive(r.id),'secondary asset-archive-go'))));
  return row;
}
function archivedNode(h,rows,act){
  const {el,add,button}=h;if(!rows.length)return null;
  const d=el('details',null,'asset-archived');
  add(d,el('summary','보관한 항목 '+rows.length+'개 · 합계에 넣지 않아요(지우지 않았어요)','asset-archived-sum'));
  for(const r of rows){const li=add(el('div',null,'asset-archived-row'),el('span',r.name+' · '+r.kindText,'small'),act?.reopen?navOnly(button('다시 보이기',()=>act.reopen(r.id),'secondary asset-reopen-go')):null);li.dataset.asset=r.id;add(d,li);}
  return d;
}

// ---- 카드 ----
function summaryCard(h,v,ctx){
  const {el,add}=h,t=v.total,c=card(h,'sum','순자산');
  const big=add(el('div',null,'asset-net'+(t.negative?' negative':'')),el('span','순자산','asset-net-label'),el('strong',wonText(t.net)+'원','asset-net-value'),t.negative?el('span','음수 · 총부채가 총자산보다 커요','small asset-net-neg'):null);
  add(c,big,add(el('div',null,'asset-stats'),
    stat(h,'assets','총자산',wonText(t.assets)+'원','보이는 항목 '+t.count+'개'),
    stat(h,'debt','총부채',wonText(t.debt)+'원',debtLine({count:t.debtCount}))));
  add(c,el('p',ASSET_FORMULA_TEXT+' · 기준일 '+v.today,'small asset-formula'),el('p',ASSET_PRICE_TEXT+(t.stale?' · '+ASSET_STALE_TEXT+' '+t.stale+'개('+ASSET_STALE_DAYS+'일 넘음)':''),'muted small asset-price-note'));
  if(ctx.investActive)add(c,el('p',ASSET_INVEST_TEXT,'small asset-invest-line'));
  return c;
}
function groupsCard(h,v){
  const {el,add}=h,c=card(h,'groups','항목별 비중','총자산 대비');
  const list=el('div',null,'asset-groups');
  for(const g of v.total.groups){
    const row=add(el('div',null,'asset-group'),add(el('p',null,'asset-group-head'),el('span',g.text,'asset-group-name'),el('span',shareText(g.shareBp)+' · '+wonText(g.value)+'원','asset-group-num')),bar(h,g.shareBp,g.text+' 비중 '+shareText(g.shareBp)));
    row.dataset.group=g.group;add(list,row);
  }
  add(c,list);return c;
}
function listCard(h,v,act,{compact=false}={}){
  const {el,add}=h,c=card(h,'list','자산 '+v.items.length+'개','현금성 → 증권 예수금 → 외화 → 주식 → 기타 · 묶음 안은 금액 큰 순');
  const list=el('div',null,'asset-list');list.setAttribute('role','list');
  for(const r of v.items){const n=assetRowNode(h,r,act,{compact});n.setAttribute('role','listitem');add(list,n);}
  add(c,list,archivedNode(h,v.archived,act));
  return c;
}
function historyCard(h,v){
  const {el,add}=h,c=card(h,'history','날짜별 순자산');
  const rows=pointRows(v.points,12);
  if(!rows.length){add(c,el('p',ASSET_POINTS_EMPTY,'muted small'));return c;}
  const list=el('div',null,'asset-points');list.setAttribute('role','list');
  for(const p of rows){
    const r=add(el('div',null,'asset-point'+(BigInt(p.net)<0n?' negative':'')),
      add(el('p',null,'asset-point-head'),el('span',p.date,'asset-point-date'),el('strong',wonText(p.net)+'원','asset-point-net'),p.change===null?null:el('span',signed(p.change),'small asset-point-change')),
      el('p','총자산 '+wonText(p.assets)+'원 · 총부채 '+wonText(p.debt)+'원','muted small asset-point-sub'));
    r.setAttribute('role','listitem');r.dataset.date=p.date;add(list,r);
  }
  add(c,list,el('p','최근 '+rows.length+'줄 · 차이 = 바로 앞 기록과 비교','muted small'));
  return c;
}
function toolsCard(h,act,{count=0}={}){
  const {el,add,button}=h,c=card(h,'tools','자산 넣기');
  const row=el('div',null,'button-row');
  if(act?.add)add(row,navOnly(button('항목 추가',()=>act.add(),count?'secondary asset-add-go':'primary asset-add-go')));
  if(act?.record)add(row,navOnly(button('오늘 값 기록',()=>act.record(),'secondary asset-record-go')));
  if(act?.importAssets)add(row,navOnly(button('자산 파일 가져오기',()=>act.importAssets(),'secondary asset-import-go')));
  add(c,row,el('p',ASSET_SAVE_NOTE+' · 보관 = 합계에서 빼기(지우지 않음)','muted small'));
  return c;
}
function doorCard(h,act){
  const {el,add,button}=h,c=card(h,'door',ASSET_DOOR_TEXT.title);
  add(c,el('p',ASSET_DOOR_TEXT.line,'asset-door-line'),el('p',ASSET_DOOR_TEXT.why,'muted small'));
  const ask=add(el('div',null,'asset-door-ask'),el('p',ASSET_DOOR_TEXT.ask,'small asset-door-q'));ask.hidden=true;
  if(act?.openDoor)add(ask,add(el('div',null,'button-row'),navOnly(button('네, 켜기',()=>act.openDoor(),'primary asset-door-yes'))));
  const go=navOnly(button('켜기',()=>{ask.hidden=false;go.hidden=true;},'secondary asset-door-go'));
  add(c,add(el('div',null,'button-row'),go),ask);
  return c;
}

// 화면 전체. ctx = {h, raw(금고 assetRawView), loans(금고 loanRawView, 읽기만), today, door({open}), width, investActive(투자 계획 있음), act:{openDoor, add, edit, archive, reopen, record, importAssets}}
// 돌려주는 값 = {status:'DOOR_CLOSED'|'NONE'|'OK', view, cols}(시험·앱이 읽기만). 고정 문구는 모든 상태에서 맨 아래.
export function renderNetWorth(root,ctx){
  const {h,raw=null,loans=null,today,door=null,width,act={},investActive=false}=ctx,{el,add}=h;
  const page=el('div',null,'asset-page');page.id='asset-page';
  const end=(status,view,cols)=>{add(page,fixedNode(h));root.append(page);return {status,view,cols};};
  if(!door?.open){add(page,doorCard(h,act));return end('DOOR_CLOSED',null,null);}
  const v=assetView(raw??{assets:[],points:[]},{today,debt:loanDebt(loans,today)});
  const cols=assetCols(width),compact=assetCompact(width);
  const sum=summaryCard(h,v,{investActive}),tools=toolsCard(h,act,{count:v.items.length}),hist=historyCard(h,v);
  if(v.status!=='OK'){
    const c=card(h,'empty','아직 넣은 자산이 없어요');add(c,el('p',ASSET_EMPTY_TEXT,'small'),archivedNode(h,v.archived,act));
    add(page,add(el('div',null,'asset-grid asset-cols-1'),add(el('div',null,'asset-col'),sum,c,tools,hist)));
    return end('NONE',v,1);
  }
  const grid=el('div',null,'asset-grid asset-cols-'+cols);grid.dataset.cols=String(cols);
  const groups=groupsCard(h,v),list=listCard(h,v,act,{compact});
  if(cols===2)add(grid,add(el('div',null,'asset-col'),sum,groups,tools),add(el('div',null,'asset-col'),list,hist));
  else add(grid,add(el('div',null,'asset-col'),sum,groups,list,tools,hist));
  add(page,grid);
  return end('OK',v,cols);
}

// ---- 시트 공통 ----
const findAsset=(raw,id)=>(raw?.assets??[]).find(a=>a.id===id)??null;
function readDate(input,today){const d=String(input.value??'').trim();if(!dayOK(d))throw fail('ASSET_DATE');if(d>today)throw fail('ASSET_FUTURE');return d;}
function readText(input,max){const s=String(input.value??'').trim();if(/\d{10,}/.test(s))throw fail('ASSET_TEXT_DIGITS');if([...s].length>max)throw fail('INVALID_ASSET_TEXT');return s;}
const str=v=>v===null||v===undefined?'':String(v);
// 저장 직전 공통: 자산 목록이 같으면 저장하지 않음(onlyPoint면 전체 기록 비교) · 그날 순자산 1줄 갱신 · 검사기 통과 · ctx.save({assets, points, heads}) 1번.
async function commit(ctx,next,notice,{onlyPoint=false}={}){
  const old=ctx.raw?.assets??[],oldPoints=ctx.raw?.points??[];
  if(!onlyPoint&&assetStable(next)===assetStable(old))throw fail('ASSET_SAME');
  const v=assetView({assets:next,points:oldPoints},{today:ctx.today,debt:loanDebt(ctx.loans,ctx.today)});
  const points=pointUpsert(oldPoints,assetPoint(ctx.today,v.total.assets,v.total.debt));
  if(onlyPoint&&assetStable(points)===assetStable(oldPoints))throw fail('ASSET_SAME');
  validateAssetBook({assets:next,points});
  await ctx.save({assets:next,points,heads:[...(ctx.raw?.heads??[])]});
  return {notice};
}

// ---- 항목 추가 · 수정 시트 ----
// ctx = {h, field, raw, loans, today, id(수정할 항목 id, 없으면 추가), newId(), save({assets, points, heads}) → Promise}
// 칸: 종류 · 이름 · 기관 · (원화 종류) 금액 · (외화·주식) 통화 · (외화) 외화 금액 · (주식) 수량 · 평가 단가 · 평가 금액 · (원화 밖) 환율 · 기준일 · 메모.
export function assetForm(root,ctx){
  const {h,field,raw,today}=ctx,{el,add}=h,old=ctx.id?findAsset(raw,ctx.id):null;
  if(ctx.id&&!old){add(root,el('p',ERROR_TEXT.ASSET_UNKNOWN,'empty'));return async()=>{throw fail('ASSET_UNKNOWN');};}
  if(!old&&(raw?.assets??[]).length>=ASSET_MAX){add(root,el('p',ERROR_TEXT.ASSET_COUNT_LIMIT,'empty'));return async()=>{throw fail('ASSET_COUNT_LIMIT');};}
  const grid=el('div',null,'field-grid');add(root,grid);
  const kind=field(grid,'종류','select',old?.kind??'CASH',ASSET_KINDS.map(k=>[k,ASSET_KIND_TEXT[k]]));
  const name=field(grid,'항목 이름 (주식은 종목 이름)','text',old?.name??'');name.maxLength=ASSET_NAME_MAX;name.placeholder='예: 합성페이 잔액';
  const inst=field(grid,'기관 (선택)','text',old?.institution??'');inst.maxLength=ASSET_INST_MAX;inst.placeholder='예: 합성증권A';
  const wonBox=el('div',null,'field-grid asset-opt asset-opt-won');add(root,wonBox);
  const won=field(wonBox,'금액 (원)','text',old&&WON_KINDS.includes(old.kind)?old.amount:'');won.inputMode='numeric';
  const curBox=el('div',null,'field-grid asset-opt asset-opt-cur');add(root,curBox);
  const cur=field(curBox,'통화 (영문 3글자 · 예: USD)','text',old&&!WON_KINDS.includes(old.kind)?old.currency:'KRW');cur.maxLength=3;
  const fxBox=el('div',null,'field-grid asset-opt asset-opt-fx');add(root,fxBox);
  const fxAmount=field(fxBox,'외화 금액','text',old?.kind==='BROKER_FX'?str(old.amount):'');fxAmount.inputMode='decimal';
  const stockBox=el('div',null,'field-grid asset-opt asset-opt-stock');add(root,stockBox);
  const qty=field(stockBox,'수량 (주)','text',old?.kind==='STOCK'?str(old.quantity):'');qty.inputMode='decimal';
  const price=field(stockBox,'평가 단가 (통화 단위 · 비우면 평가 금액)','text',old?.kind==='STOCK'?str(old.price):'');price.inputMode='decimal';
  const value=field(stockBox,'평가 금액 (통화 단위 · 단가를 넣으면 비움)','text',old?.kind==='STOCK'?str(old.amount):'');value.inputMode='decimal';
  const rateBox=el('div',null,'field-grid asset-opt asset-opt-rate');add(root,rateBox);
  const rate=field(rateBox,'환율 (1단위 = 원)','text',str(old?.fxRate));rate.inputMode='decimal';
  const more=el('div',null,'field-grid');add(root,more);
  const asOf=field(more,'기준일 (외화 · 주식은 가격 · 환율 입력일)','date',old?.asOf??today);asOf.max=today;
  const note=field(more,'메모 (선택 · 60자)','text',old?.note??'');note.maxLength=ASSET_NOTE_MAX;
  add(root,el('p','계좌번호는 넣지 않아요 · 글 칸에 숫자 10자리 이상은 막아요 · 시세 · 환율은 직접 넣어요 · '+ASSET_SAVE_NOTE,'muted small'));
  const curNow=()=>String(cur.value??'').trim().toUpperCase();
  const paint=()=>{const k=kind.value,w=WON_KINDS.includes(k);wonBox.hidden=!w;curBox.hidden=w;fxBox.hidden=k!=='BROKER_FX';stockBox.hidden=k!=='STOCK';rateBox.hidden=w||(k==='STOCK'&&curNow()==='KRW');};
  const pickKind=()=>{if(kind.value==='BROKER_FX'&&curNow()==='KRW')cur.value='USD';paint();};   // 외화 예수금으로 바꾸면 원화 통화를 USD로(직접 고칠 수 있음)
  for(const t of ['input','change']){kind.addEventListener(t,pickKind);cur.addEventListener(t,paint);}
  paint();
  const read=()=>{
    const k=ASSET_KINDS.includes(kind.value)?kind.value:'OTHER';
    const n=readText(name,ASSET_NAME_MAX);if(!n)throw fail('ASSET_NAME');
    const base={id:old?.id??ctx.newId(),kind:k,name:n,institution:readText(inst,ASSET_INST_MAX),asOf:readDate(asOf,today),active:old?old.active:true,note:readText(note,ASSET_NOTE_MAX)};
    if(WON_KINDS.includes(k))return assetDraft({...base,amount:parseAssetWon(won.value)});
    const c=parseCurrencyInput(cur.value);
    if(k==='BROKER_FX'){
      if(c==='KRW')throw fail('ASSET_FX_CURRENCY');
      const fx=parseDecimalInput(rate.value,{positive:true,empty:true});if(fx===null)throw fail('ASSET_FX_RATE');
      return assetDraft({...base,currency:c,amount:parseDecimalInput(fxAmount.value),fxRate:fx});
    }
    const p=parseDecimalInput(price.value,{empty:true}),a=parseDecimalInput(value.value,{empty:true}),q=parseDecimalInput(qty.value,{positive:true,empty:true});
    if((p===null)===(a===null)||(p!==null&&q===null))throw fail('ASSET_STOCK_VALUE');
    let fx=null;if(c!=='KRW'){fx=parseDecimalInput(rate.value,{positive:true,empty:true});if(fx===null)throw fail('ASSET_FX_RATE');}
    return assetDraft({...base,currency:c,quantity:q,price:p,amount:a,fxRate:fx});
  };
  const save=async()=>{const asset=read();return commit(ctx,assetPut(raw?.assets??[],asset),old?'항목 고침 · '+asset.name:'항목 추가 · '+asset.name);};
  save.read=read;
  return save;
}
// ---- 보관 · 다시 보이기 확인 시트(지우지 않음) ----
export function assetArchiveForm(root,ctx){
  const {h,raw}=ctx,{el,add}=h,old=findAsset(raw,ctx.id),on=ctx.active===true;
  if(!old){add(root,el('p',ERROR_TEXT.ASSET_UNKNOWN,'empty'));return async()=>{throw fail('ASSET_UNKNOWN');};}
  add(root,el('p',on?old.name+'을(를) 다시 합계에 넣어요.':old.name+'을(를) 보관해요. 합계에서 빼고 지우지 않아요(다시 보이기 가능).','asset-sheet-head'),
    el('p','합계에는 보이는 항목만 넣어요 · '+ASSET_SAVE_NOTE,'muted small'));
  return async()=>commit(ctx,assetSetActive(raw.assets,old.id,on),(on?'다시 보임 · ':'보관 · ')+old.name);
}
// ---- 오늘 값 기록 시트(자산은 그대로, 그날 순자산 1줄만 — 대출 잔액만 바뀐 날에 씀) ----
export function assetRecordForm(root,ctx){
  const {h,raw,loans,today}=ctx,{el,add}=h;
  const v=assetView(raw??{assets:[],points:[]},{today,debt:loanDebt(loans,today)}),t=v.total;
  add(root,el('p',today+' 순자산 '+wonText(t.net)+'원','asset-sheet-head'),el('p','총자산 '+wonText(t.assets)+'원 · 총부채 '+wonText(t.debt)+'원 · '+debtLine({count:t.debtCount}),'small'),
    el('p','같은 날 다시 기록하면 그날 줄을 바꿔요 · '+ASSET_SAVE_NOTE,'muted small'));
  return async()=>commit(ctx,[...(raw?.assets??[]).map(a=>({...a}))],'오늘 값 기록 · '+today,{onlyPoint:true});
}

// ---- 자산 파일 가져오기 시트 ----
// 고른 파일을 읽어 미리보기 · 기존 목록과의 차이를 보인다. 검사 실패·바뀐 것 없음이면 저장 단추를 막는다. 저장 = 자산 목록 1장(연산 1).
export function assetImportState(parsed,raw){
  if(!parsed)return {ok:false,canSave:false,code:'ASSET_IMPORT_NONE'};
  if(!parsed.ok)return {ok:false,canSave:false,code:parsed.code,text:assetErrorText(parsed.code)??parsed.code};
  const plan=assetImportPlan(raw,parsed.assets);
  if(plan.code)return {ok:false,canSave:false,code:plan.code,text:assetErrorText(plan.code)??plan.code};
  return {ok:true,assets:parsed.assets,plan,heads:[...(raw?.heads??[])],canSave:plan.canSave};
}
export function assetImportPreviewNode(h,st,today){
  const {el,add}=h,box=el('div',null,'asset-import-preview');
  if(!st.ok){add(box,el('p',st.code==='ASSET_IMPORT_NONE'?ERROR_TEXT.ASSET_IMPORT_NONE:'가져올 수 없어요 · '+st.text,st.code==='ASSET_IMPORT_NONE'?'muted small':'fin-warn'));return box;}
  const p=st.plan,rows=st.assets.map(a=>assetRow(a,today));
  add(box,el('p','파일의 항목 '+st.assets.length+'개 · 새로 '+p.added+' · 바뀜 '+p.changed+' · 그대로 '+p.same,'asset-import-head'));
  if(p.kept)add(box,el('p','파일에 없는 기존 항목 '+p.kept+'개는 그대로 둬요','small'));
  add(box,el('p','파일 기준 합계 '+wonText(rows.filter(r=>r.active).reduce((n,r)=>n+BigInt(r.value),0n))+'원(보이는 항목)','small asset-import-total'));
  const ul=el('ul',null,'asset-import-rows');
  for(const r of rows)add(ul,add(el('li',null,'small'),el('span',r.name+' · '+r.kindText+' · '+wonText(r.value)+'원'+(r.stale?' ('+ASSET_STALE_TEXT+')':'')+(r.active?'':' · 보관'))));
  add(box,ul);
  add(box,el('p',p.canSave?'저장하면 자산 목록 1장으로 저장해요(저장 1번)':'바뀐 것이 없어 저장하지 않아요',p.canSave?'small asset-import-ok':'muted small'));
  return box;
}
// ctx = {h, raw, loans, today, readFile(file) → Promise<ArrayBuffer|Uint8Array>, setSaveEnabled(bool), save({assets, points, heads}) → Promise}
export function assetImportForm(root,ctx){
  const {h,raw,today}=ctx,{el,add}=h;
  let st=assetImportState(null,raw);
  const wrap=add(el('label',null,'asset-file'),el('span','자산 파일 (.json, 64KB 이하 · 형식 lifebrick-assets-v1)'));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','자산 파일');add(wrap,input);
  const out=el('div',null,'asset-import-out');out.setAttribute('role','status');
  add(root,wrap,out,el('p','파일은 이 기기에서만 읽어요 · 파일 자체는 어디에도 올리지 않아요 · 같은 id 항목은 파일 값으로 바꾸고, 새 id는 더해요','muted small'));
  const paint=()=>{out.replaceChildren(assetImportPreviewNode(h,st,today));ctx.setSaveEnabled?.(st.canSave);};
  const pick=async file=>{
    if(!file){st=assetImportState(null,raw);paint();return st;}
    let bytes=null;try{bytes=await ctx.readFile(file);}catch{bytes=null;}
    st=assetImportState(bytes?parseAssetImport(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),{name:file.name??null}):{ok:false,code:'ASSET_IMPORT_SHAPE'},raw);paint();return st;
  };
  input.addEventListener('change',()=>{void pick(input.files?.[0]??null);});
  paint();
  const save=async()=>{
    if(!st.ok)throw fail(st.code==='ASSET_IMPORT_NONE'?'ASSET_IMPORT_NONE':st.code);if(!st.canSave)throw fail('ASSET_SAME');
    const r=await commit({...ctx,raw:{...(raw??{}),heads:st.heads}},st.plan.merged,'자산 '+st.assets.length+'개 가져옴 · 새로 '+st.plan.added+' · 바뀜 '+st.plan.changed);
    return r;
  };
  save.pick=pick;   // 시험·앱이 파일을 직접 넘길 때
  return save;
}
