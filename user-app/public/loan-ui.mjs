// V17 대출 화면(소유자 요청 2026-11-21, 통제탑 지시서 V17_LOAN). 돈 탭 하위 탭 "대출"의 요약 카드 · 대출 줄 목록 · 추가/수정 · 잔액 · 금리 · 끝냄 · 대출 파일 가져오기 · 대출 문 켜기 카드.
// 그리기는 app.mjs가 넘기는 포트(h = {el,add,button}, field)로만 한다. 이 파일은 app.mjs를 불러오지 않는다(가짜 DOM 시험에서 그대로 돈다). innerHTML·인라인 style 0.
// 계산은 loan-model loanView(저장 0). 쓰기는 포트가 한다: 모든 바꿈 = 대출 목록 LOAN_BOOK 1장 고쳐 쓰기(연산 1). 대출 문이 닫혀 있으면 켜기 카드만 보이고 쓰기 단추는 없다.
// 문구는 사실만(잔액 · 금리 · 이자 · 만기 · 한도 사용). 상환·투자·대출 권유 문구 0. 맨 아래 고정 문구.
import {loanView,LOAN_KINDS,LOAN_KIND_TEXT,LOAN_MAX,LOAN_NAME_MAX,LOAN_LENDER_MAX,LOAN_NOTE_MAX,wonText,rateText,usageText,parseRateInput,parseLoanWon,loanDraft,loanPut,loanSetBalance,loanSetRate,loanSetActive,parseLoanImport,loanImportPlan,validateLoanBook,loanStable} from './loan-model.mjs';

export const LOAN_FIXED_TEXT='이 화면은 내가 넣은 잔액 · 금리로 계산한 판단 자료이며 금융 자문이 아닙니다.';
export const LOAN_DOOR_TEXT=Object.freeze({
  title:'대출 기록 켜기',
  line:'4기기를 r87 이상으로 올린 뒤 켜기',
  why:'켜기 전에는 이 기기에서 대출 기록을 쓰지 않아요(옛 앱 기기 보호). 다른 기기에서 켜고 기록하면 그 기록을 받는 순간 이 기기도 자동으로 열려요.',
  ask:'PC · 노트북 · Fold · iPad 4기기 모두 r87 이상인가요? 켜면 이 기기부터 대출 기록을 쓸 수 있어요.',
});
export const LOAN_SORT_TEXT='금리 높은 대출 먼저 보기 · 금리 높은 순';
export const LOAN_EMPTY_TEXT='대출을 넣으면 총 잔액 · 가중 평균 금리 · 이번 달 예상 이자가 여기에 보여요.';
export const LOAN_INEXACT_TEXT='정확한 금리 확인 필요';
export const LOAN_CALC_TEXT='이자 = 잔액 × 연 금리 ÷ 12(원 단위 내림) · 대출마다 넣은 잔액 기준일 값';
export const LOAN_SAVE_NOTE='바꾸면 대출 목록 1장을 고쳐 써요(저장 1번)';
export const loanAccountNote=n=>'계정 탭의 대출 계정 '+n+'개는 이 합계에 넣지 않았어요(따로 기록)';
export const loanInvestLine=won=>'투자 계획이 있어요 · 대출 연 이자 합계 '+wonText(won)+'원(지금 잔액 · 금리 기준)';

// 폭별 배치: >1000 2열(요약·도구 | 목록) · 그 밖 1열. ≤420 줄 단추를 두 줄로.
export const loanCols=w=>!Number.isFinite(w)||w>1000?2:1;
export const loanCompact=w=>Number.isFinite(w)&&w<=420;

// 오류 코드 → 화면 글(모르는 LOAN 코드는 "대출 검사 실패 · 코드").
const ERROR_TEXT={
  LOAN_DOOR_CLOSED:'대출 기록이 꺼져 있어요 · 4기기를 r87 이상으로 올린 뒤 켜 주세요',
  LOAN_NAME:'대출 이름을 넣어 주세요(40자까지)',LOAN_AMOUNT_INPUT:'금액은 원 단위 정수로 넣어 주세요(쉼표 가능)',LOAN_RATE_INPUT:'연 금리는 0~100 사이, 소수 둘째 자리까지 넣어 주세요(예: 4.25)',
  LOAN_DATE:'날짜는 YYYY-MM-DD로 넣어 주세요',LOAN_FUTURE:'잔액 기준일은 오늘 뒤일 수 없어요',
  LOAN_TEXT_DIGITS:'글 칸에 숫자 10자리 이상을 적을 수 없어요(계좌번호 보호)',INVALID_LOAN_TEXT:'이름 40자 · 기관 20자 · 메모 60자까지, 제어 문자 없이 넣어 주세요',
  LOAN_COUNT_LIMIT:'대출은 20건까지 넣을 수 있어요',LOAN_UNKNOWN:'없는 대출이에요 · 화면을 새로 고쳐 주세요',LOAN_SAME:'바뀐 것이 없어 저장하지 않아요',
  LOAN_IMPORT_NONE:'대출 파일을 먼저 골라 주세요',LOAN_IMPORT_NOT_JSON:'.json 파일만 가져올 수 있어요',LOAN_IMPORT_TOO_LARGE:'64KB보다 큰 파일은 가져올 수 없어요',
  LOAN_IMPORT_UTF8:'UTF-8 글자가 아닌 파일이에요',LOAN_IMPORT_JSON:'JSON 형식이 아닌 파일이에요',LOAN_IMPORT_SHAPE:'파일 모양이 달라요(format · loans만, note는 선택)',
  LOAN_IMPORT_FORMAT:'형식 이름이 달라요(lifebrick-loans-v1)',LOAN_IMPORT_EMPTY:'파일에 대출 줄이 없어요',
  DUPLICATE_LOAN_ID:'같은 대출 id가 두 번 있어요',LOAN_LIMIT_KIND:'한도는 마이너스통장에만 넣어요',LOAN_PRINCIPAL_KIND:'월 원금은 원금분할상환에만 넣어요',
};
export const loanErrorText=code=>ERROR_TEXT[code]??(typeof code==='string'&&(code.startsWith('LOAN_')||code.startsWith('INVALID_LOAN'))?'대출 검사 실패 · '+code:null);
const fail=code=>Object.assign(new Error(code),{code});
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const dayOK=v=>DAY.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;

// ---- 작은 조각 ----
function card(h,key,title,sub){const {el,add}=h,c=el('section',null,'panel loan-card loan-'+key);c.dataset.card=key;add(c,el('h2',title,'loan-card-title'));if(sub)add(c,el('p',sub,'muted small loan-card-sub'));return c;}
function navOnly(b){b.dataset.navOnly='1';return b;}
export function fixedNode(h){const p=h.el('p',LOAN_FIXED_TEXT,'loan-fixed');p.setAttribute('role','note');return p;}
function bar(h,bp,label){const n=h.el('progress',null,'loan-bar');n.max=10000;n.value=Math.min(10000,Math.max(0,bp));n.setAttribute('aria-label',label);return n;}
function stat(h,label,value,foot){const {el,add}=h;return add(el('div',null,'loan-stat'),el('span',label,'loan-stat-label'),el('strong',value,'loan-stat-value'),foot?el('span',foot,'muted small loan-stat-foot'):null);}

// 한 줄의 종류별 사실(원금분할 월 납입 · 마통 한도 사용 · 만기 D-day).
export function kindLine(r){
  if(r.kind==='AMORTIZING')return r.principalUnknown?'월 납입 추정: 이자 '+wonText(r.monthInterest)+'원만 · 월 원금 모름':'월 납입 추정 '+wonText(r.payment)+'원 (원금 '+wonText(r.monthlyPrincipal)+' + 이자 '+wonText(r.monthInterest)+')';
  if(r.kind==='OVERDRAFT')return r.usageBp===null?null:'한도 '+wonText(r.limit)+'원 중 '+usageText(r.usageBp)+' 사용';
  if(r.kind==='BULLET')return r.maturity===null?'만기 입력 없음':r.dday+' · 만기 '+r.maturity;
  return r.maturity===null?null:r.dday+' · 만기 '+r.maturity;
}
function loanRowNode(h,r,act,{compact=false}={}){
  const {el,add,button}=h,row=el('div',null,'loan-row'+(compact?' compact':''));row.dataset.loan=r.id;
  add(row,add(el('div',null,'loan-row-head'),el('strong',r.name,'loan-name'),r.lender?el('span',r.lender,'muted small loan-lender'):null,el('span',r.kindText,'loan-kind'),r.rateExact?null:el('span',LOAN_INEXACT_TEXT,'loan-inexact')));
  add(row,add(el('p',null,'loan-nums'),el('span','잔액 '+wonText(r.balance)+'원','loan-balance'),el('span','금리 '+rateText(r.rateBp),'loan-rate'),el('span','월 이자 '+wonText(r.monthInterest)+'원','loan-interest')));
  const k=kindLine(r);
  if(k)add(row,el('p',k,'small loan-kind-line'));
  if(r.kind==='OVERDRAFT'&&r.usageBp!==null)add(row,bar(h,r.usageBp,r.name+' 한도 사용 '+usageText(r.usageBp)));
  add(row,el('p','잔액 기준일 '+r.asOf+(r.note?' · '+r.note:''),'muted small loan-asof'));
  if(act?.balance)add(row,add(el('div',null,'button-row loan-row-acts'),navOnly(button('잔액 바꾸기',()=>act.balance(r.id),'secondary loan-balance-go')),navOnly(button('금리 바꾸기',()=>act.rate(r.id),'secondary loan-rate-go')),
    navOnly(button('수정',()=>act.edit(r.id),'secondary loan-edit-go')),navOnly(button('끝냄',()=>act.close(r.id),'secondary loan-close-go'))));
  return row;
}
function closedNode(h,rows,act){
  const {el,add,button}=h;if(!rows.length)return null;
  const d=el('details',null,'loan-closed');
  add(d,el('summary','끝낸 대출 '+rows.length+'건 · 보관(지우지 않았어요)','loan-closed-sum'));
  for(const r of rows){const li=add(el('div',null,'loan-closed-row'),el('span',r.name+' · '+r.kindText,'small'),act?.reopen?navOnly(button('다시 보이기',()=>act.reopen(r.id),'secondary loan-reopen-go')):null);li.dataset.loan=r.id;add(d,li);}
  return d;
}

// ---- 카드 ----
function summaryCard(h,v,ctx){
  const {el,add}=h,t=v.total,c=card(h,'sum','대출 요약');
  add(c,add(el('div',null,'loan-stats'),
    stat(h,'총 대출 잔액(총부채)',wonText(t.balance)+'원','진행 중 '+t.count+'건'),
    stat(h,'가중 평균 금리',rateText(t.weightedBp),t.weightedExact?'잔액 비중으로 평균':'정확하지 않은 금리 '+t.inexact+'건 포함'),
    stat(h,'이번 달 예상 이자 합계',wonText(t.monthInterest)+'원',null),
    stat(h,'월 납입 추정 합계',wonText(t.payment)+'원',t.principalUnknown?'월 원금 모름 '+t.principalUnknown+'건은 이자만':'원금분할 = 월 원금 + 이자 · 그 밖 = 이자')));
  add(c,el('p',LOAN_CALC_TEXT,'muted small loan-calc'));
  if(ctx.investActive)add(c,el('p',loanInvestLine(t.yearInterest),'small loan-invest-line'));
  if(ctx.accountLoans>0)add(c,el('p',loanAccountNote(ctx.accountLoans),'muted small loan-account-note'));
  return c;
}
function listCard(h,v,act,{compact=false}={}){
  const {el,add}=h,c=card(h,'list','대출 '+v.loans.length+'건',LOAN_SORT_TEXT);
  const list=el('div',null,'loan-list');list.setAttribute('role','list');
  for(const r of v.loans){const n=loanRowNode(h,r,act,{compact});n.setAttribute('role','listitem');add(list,n);}
  add(c,list,closedNode(h,v.closed,act));
  return c;
}
function toolsCard(h,act,{count=0}={}){
  const {el,add,button}=h,c=card(h,'tools','대출 넣기');
  const row=el('div',null,'button-row');
  if(act?.add)add(row,navOnly(button('대출 추가',()=>act.add(),count?'secondary loan-add-go':'primary loan-add-go')));
  if(act?.importLoans)add(row,navOnly(button('대출 파일 가져오기',()=>act.importLoans(),'secondary loan-import-go')));
  add(c,row,el('p',LOAN_SAVE_NOTE+' · 끝냄 = 보관(지우지 않음)','muted small'));
  return c;
}
function doorCard(h,act){
  const {el,add,button}=h,c=card(h,'door',LOAN_DOOR_TEXT.title);
  add(c,el('p',LOAN_DOOR_TEXT.line,'loan-door-line'),el('p',LOAN_DOOR_TEXT.why,'muted small'));
  const ask=add(el('div',null,'loan-door-ask'),el('p',LOAN_DOOR_TEXT.ask,'small loan-door-q'));ask.hidden=true;
  if(act?.openDoor)add(ask,add(el('div',null,'button-row'),navOnly(button('네, 켜기',()=>act.openDoor(),'primary loan-door-yes'))));
  const go=navOnly(button('켜기',()=>{ask.hidden=false;go.hidden=true;},'secondary loan-door-go'));
  add(c,add(el('div',null,'button-row'),go),ask);
  return c;
}

// 화면 전체. ctx = {h, raw(금고 loanRawView), today, door({open}), width, accountLoans(계정 탭 LOAN 계정 수), investActive(투자 계획 있음), act:{openDoor, add, edit, balance, rate, close, reopen, importLoans}}
// 돌려주는 값 = {status:'DOOR_CLOSED'|'NONE'|'OK', view, cols}(시험·앱이 읽기만). 고정 문구는 모든 상태에서 맨 아래.
export function renderLoans(root,ctx){
  const {h,raw=null,today,door=null,width,act={},accountLoans=0,investActive=false}=ctx,{el,add}=h;
  const page=el('div',null,'loan-page');page.id='loan-page';
  const end=(status,view,cols)=>{add(page,fixedNode(h));root.append(page);return {status,view,cols};};
  if(!door?.open){add(page,doorCard(h,act));return end('DOOR_CLOSED',null,null);}
  const v=loanView(raw??{loans:[]},{today});
  if(v.status!=='OK'){
    const c=card(h,'empty','진행 중인 대출이 없어요');add(c,el('p',LOAN_EMPTY_TEXT,'small'),closedNode(h,v.closed,act));
    add(page,c,toolsCard(h,act));if(accountLoans>0)add(page,el('p',loanAccountNote(accountLoans),'muted small loan-account-note'));
    return end('NONE',v,null);
  }
  const cols=loanCols(width),compact=loanCompact(width);
  const grid=el('div',null,'loan-grid loan-cols-'+cols);grid.dataset.cols=String(cols);
  const sum=summaryCard(h,v,{accountLoans,investActive}),list=listCard(h,v,act,{compact}),tools=toolsCard(h,act,{count:v.loans.length});
  if(cols===2)add(grid,add(el('div',null,'loan-col'),sum,tools),add(el('div',null,'loan-col'),list));
  else add(grid,add(el('div',null,'loan-col'),sum,list,tools));
  add(page,grid);
  return end('OK',v,cols);
}

// ---- 시트 공통 ----
const findLoan=(raw,id)=>(raw?.loans??[]).find(l=>l.id===id)??null;
function readDate(input,today,{future=false}={}){const d=String(input.value??'').trim();if(!dayOK(d))throw fail('LOAN_DATE');if(!future&&d>today)throw fail('LOAN_FUTURE');return d;}
function readText(input,max){const s=String(input.value??'').trim();if(/\d{10,}/.test(s))throw fail('LOAN_TEXT_DIGITS');if([...s].length>max)throw fail('INVALID_LOAN_TEXT');return s;}
const won=v=>v===null||v===undefined?'':String(v);
const rateIn=bp=>bp===null||bp===undefined?'':rateText(bp).replace(/%$/,'');
// 저장 직전 공통: 같은 목록이면 저장하지 않음 · 검사기 통과 · ctx.save(loans, heads) 1번.
async function commit(ctx,next,notice){
  if(loanStable(next)===loanStable(ctx.raw?.loans??[]))throw fail('LOAN_SAME');
  validateLoanBook({loans:next});
  await ctx.save({loans:next,heads:[...(ctx.raw?.heads??[])]});
  return {notice};
}

// ---- 대출 추가 · 수정 시트 ----
// ctx = {h, field, raw, today, id(수정할 대출 id, 없으면 추가), newId(), save({loans, heads}) → Promise}
export function loanForm(root,ctx){
  const {h,field,raw,today}=ctx,{el,add}=h,old=ctx.id?findLoan(raw,ctx.id):null;
  if(ctx.id&&!old){add(root,el('p',ERROR_TEXT.LOAN_UNKNOWN,'empty'));return async()=>{throw fail('LOAN_UNKNOWN');};}
  if(!old&&(raw?.loans??[]).length>=LOAN_MAX){add(root,el('p',ERROR_TEXT.LOAN_COUNT_LIMIT,'empty'));return async()=>{throw fail('LOAN_COUNT_LIMIT');};}
  const grid=el('div',null,'field-grid');add(root,grid);
  const name=field(grid,'대출 이름','text',old?.name??'');name.maxLength=LOAN_NAME_MAX;
  const lender=field(grid,'기관 (선택)','text',old?.lender??'');lender.maxLength=LOAN_LENDER_MAX;
  const kind=field(grid,'종류','select',old?.kind??'OTHER',LOAN_KINDS.map(k=>[k,LOAN_KIND_TEXT[k]]));
  const balance=field(grid,'잔액 (원)','text',won(old?.balance??''));balance.inputMode='numeric';
  const asOf=field(grid,'잔액 기준일','date',old?.asOf??today);asOf.max=today;
  const rate=field(grid,'연 금리 (%)','text',rateIn(old?.rateBp));rate.inputMode='decimal';
  const exact=field(grid,'정확한 금리예요 (끄면 "정확한 금리 확인 필요")','checkbox',old?old.rateExact:true);
  const limBox=el('div',null,'field-grid loan-opt loan-opt-limit');add(root,limBox);
  const limit=field(limBox,'한도 (원, 마이너스통장 · 모르면 비움)','text',won(old?.limit));limit.inputMode='numeric';
  const priBox=el('div',null,'field-grid loan-opt loan-opt-principal');add(root,priBox);
  const principal=field(priBox,'월 원금 (원, 원금분할상환 · 모르면 비움)','text',won(old?.monthlyPrincipal));principal.inputMode='numeric';
  const more=el('div',null,'field-grid');add(root,more);
  const maturity=field(more,'만기일 (선택 · 모르면 비움)','date',old?.maturity??'');
  const note=field(more,'메모 (선택 · 60자)','text',old?.note??'');note.maxLength=LOAN_NOTE_MAX;
  add(root,el('p','계좌번호는 넣지 않아요 · 글 칸에 숫자 10자리 이상은 막아요 · '+LOAN_SAVE_NOTE,'muted small'));
  const paint=()=>{limBox.hidden=kind.value!=='OVERDRAFT';priBox.hidden=kind.value!=='AMORTIZING';};
  for(const t of ['input','change'])kind.addEventListener(t,paint);
  paint();
  const read=()=>{
    const n=readText(name,LOAN_NAME_MAX);if(!n)throw fail('LOAN_NAME');
    const k=LOAN_KINDS.includes(kind.value)?kind.value:'OTHER';
    const m=String(maturity.value??'').trim();if(m&&!dayOK(m))throw fail('LOAN_DATE');
    return loanDraft({id:old?.id??ctx.newId(),name:n,lender:readText(lender,LOAN_LENDER_MAX),kind:k,balance:parseLoanWon(balance.value,{zero:true}),asOf:readDate(asOf,today),
      rateBp:parseRateInput(rate.value),rateExact:exact.checked!==false,limit:k==='OVERDRAFT'?parseLoanWon(limit.value,{empty:true}):null,
      monthlyPrincipal:k==='AMORTIZING'?parseLoanWon(principal.value,{empty:true}):null,maturity:m||null,active:old?old.active:true,note:readText(note,LOAN_NOTE_MAX)});
  };
  const save=async()=>{const loan=read();return commit(ctx,loanPut(raw?.loans??[],loan),old?'대출 고침 · '+loan.name:'대출 추가 · '+loan.name);};
  save.read=read;
  return save;
}
// ---- 잔액 바꾸기 시트(상환하면 잔액·기준일 고침) ----
export function loanBalanceForm(root,ctx){
  const {h,field,raw,today}=ctx,{el,add}=h,old=findLoan(raw,ctx.id);
  if(!old){add(root,el('p',ERROR_TEXT.LOAN_UNKNOWN,'empty'));return async()=>{throw fail('LOAN_UNKNOWN');};}
  add(root,el('p',old.name+' · 지금 잔액 '+wonText(old.balance)+'원 (기준일 '+old.asOf+')','loan-sheet-head'));
  const grid=el('div',null,'field-grid');add(root,grid);
  const balance=field(grid,'새 잔액 (원)','text',old.balance);balance.inputMode='numeric';
  const asOf=field(grid,'잔액 기준일','date',today);asOf.max=today;
  add(root,el('p','갚았거나 더 썼으면 새 잔액과 그 날짜를 넣어요 · '+LOAN_SAVE_NOTE,'muted small'));
  return async()=>{const b=parseLoanWon(balance.value,{zero:true}),d=readDate(asOf,today);return commit(ctx,loanSetBalance(raw.loans,old.id,{balance:b,asOf:d}),'잔액 고침 · '+old.name);};
}
// ---- 금리 바꾸기 시트 ----
export function loanRateForm(root,ctx){
  const {h,field,raw}=ctx,{el,add}=h,old=findLoan(raw,ctx.id);
  if(!old){add(root,el('p',ERROR_TEXT.LOAN_UNKNOWN,'empty'));return async()=>{throw fail('LOAN_UNKNOWN');};}
  add(root,el('p',old.name+' · 지금 금리 '+rateText(old.rateBp)+(old.rateExact?'':' · '+LOAN_INEXACT_TEXT),'loan-sheet-head'));
  const grid=el('div',null,'field-grid');add(root,grid);
  const rate=field(grid,'연 금리 (%)','text',rateIn(old.rateBp));rate.inputMode='decimal';
  const exact=field(grid,'정확한 금리예요 (끄면 "정확한 금리 확인 필요")','checkbox',old.rateExact);
  add(root,el('p',LOAN_SAVE_NOTE,'muted small'));
  return async()=>commit(ctx,loanSetRate(raw.loans,old.id,{rateBp:parseRateInput(rate.value),rateExact:exact.checked!==false}),'금리 고침 · '+old.name);
}
// ---- 끝냄 · 다시 보이기 확인 시트(지우지 않고 보관) ----
export function loanCloseForm(root,ctx){
  const {h,raw}=ctx,{el,add}=h,old=findLoan(raw,ctx.id),on=ctx.active===true;
  if(!old){add(root,el('p',ERROR_TEXT.LOAN_UNKNOWN,'empty'));return async()=>{throw fail('LOAN_UNKNOWN');};}
  add(root,el('p',on?old.name+'을(를) 다시 진행 중 목록에 보여요.':old.name+'을(를) 끝낸 대출로 옮겨요. 지우지 않고 보관해요(다시 보이기 가능).','loan-sheet-head'),
    el('p','합계에는 진행 중인 대출만 넣어요 · '+LOAN_SAVE_NOTE,'muted small'));
  return async()=>commit(ctx,loanSetActive(raw.loans,old.id,on),(on?'다시 보임 · ':'끝냄(보관) · ')+old.name);
}

// ---- 대출 파일 가져오기 시트 ----
// 고른 파일을 읽어 미리보기 · 기존 목록과의 차이를 보인다. 검사 실패·바뀐 것 없음이면 저장 단추를 막는다. 저장 = 대출 목록 1장(연산 1).
export function loanImportState(parsed,raw){
  if(!parsed)return {ok:false,canSave:false,code:'LOAN_IMPORT_NONE'};
  if(!parsed.ok)return {ok:false,canSave:false,code:parsed.code,text:loanErrorText(parsed.code)??parsed.code};
  const plan=loanImportPlan(raw,parsed.loans);
  if(plan.code)return {ok:false,canSave:false,code:plan.code,text:loanErrorText(plan.code)??plan.code};
  return {ok:true,loans:parsed.loans,plan,heads:[...(raw?.heads??[])],canSave:plan.canSave};
}
export function loanImportPreviewNode(h,st,today){
  const {el,add}=h,box=el('div',null,'loan-import-preview');
  if(!st.ok){add(box,el('p',st.code==='LOAN_IMPORT_NONE'?ERROR_TEXT.LOAN_IMPORT_NONE:'가져올 수 없어요 · '+st.text,st.code==='LOAN_IMPORT_NONE'?'muted small':'fin-warn'));return box;}
  const p=st.plan,v=loanView({loans:st.loans.map(l=>({...l,active:true}))},{today});
  add(box,el('p','파일의 대출 '+st.loans.length+'건 · 새로 '+p.added+' · 바뀜 '+p.changed+' · 그대로 '+p.same,'loan-import-head'));
  if(p.kept)add(box,el('p','파일에 없는 기존 대출 '+p.kept+'건은 그대로 둬요','small'));
  if(v.status==='OK')add(box,el('p','파일 기준 총 잔액 '+wonText(v.total.balance)+'원 · 이번 달 예상 이자 '+wonText(v.total.monthInterest)+'원','small loan-import-total'));
  const ul=el('ul',null,'loan-import-rows');
  for(const r of v.loans)add(ul,add(el('li',null,'small'),el('span',r.name+' · '+r.kindText+' · 잔액 '+wonText(r.balance)+'원 · 금리 '+rateText(r.rateBp)+(r.rateExact?'':' ('+LOAN_INEXACT_TEXT+')'))));
  add(box,ul);
  add(box,el('p',p.canSave?'저장하면 대출 목록 1장으로 저장해요(저장 1번)':'바뀐 것이 없어 저장하지 않아요',p.canSave?'small loan-import-ok':'muted small'));
  return box;
}
// ctx = {h, raw, today, readFile(file) → Promise<ArrayBuffer|Uint8Array>, setSaveEnabled(bool), save({loans, heads}) → Promise}
export function loanImportForm(root,ctx){
  const {h,raw,today}=ctx,{el,add}=h;
  let st=loanImportState(null,raw);
  const wrap=add(el('label',null,'loan-file'),el('span','대출 파일 (.json, 64KB 이하 · 형식 lifebrick-loans-v1)'));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','대출 파일');add(wrap,input);
  const out=el('div',null,'loan-import-out');out.setAttribute('role','status');
  add(root,wrap,out,el('p','파일은 이 기기에서만 읽어요 · 파일 자체는 어디에도 올리지 않아요 · 같은 id 대출은 파일 값으로 바꾸고, 새 id는 더해요','muted small'));
  const paint=()=>{out.replaceChildren(loanImportPreviewNode(h,st,today));ctx.setSaveEnabled?.(st.canSave);};
  const pick=async file=>{
    if(!file){st=loanImportState(null,raw);paint();return st;}
    let bytes=null;try{bytes=await ctx.readFile(file);}catch{bytes=null;}
    st=loanImportState(bytes?parseLoanImport(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),{name:file.name??null}):{ok:false,code:'LOAN_IMPORT_SHAPE'},raw);paint();return st;
  };
  input.addEventListener('change',()=>{void pick(input.files?.[0]??null);});
  paint();
  const save=async()=>{
    if(!st.ok)throw fail(st.code==='LOAN_IMPORT_NONE'?'LOAN_IMPORT_NONE':st.code);if(!st.canSave)throw fail('LOAN_SAME');
    await ctx.save({loans:st.plan.merged,heads:st.heads});
    return {notice:'대출 '+st.loans.length+'건 가져옴 · 새로 '+st.plan.added+' · 바뀜 '+st.plan.changed};
  };
  save.pick=pick;   // 시험·앱이 파일을 직접 넘길 때
  return save;
}
