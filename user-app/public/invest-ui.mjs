// V16 투자 계획 화면(소유자 승인 2026-11-19, 설계 V16_INVEST_D 4절). 돈 탭 하위 탭 "투자 계획"의 카드 8개 · 매수 시트 · 가격 시트 · 계획 가져오기 시트 · 투자 문 켜기 카드.
// 그리기는 app.mjs가 넘기는 포트(h = {el,add,button}, field)로만 한다. 이 파일은 app.mjs를 불러오지 않는다(가짜 DOM 시험에서 그대로 돈다). innerHTML·인라인 style 0.
// 계산은 invest-model investView(저장 0)이고, 화면은 이 기기 초안(아직 안 쌓은 매수·가격 메모)을 얹은 값으로 그린다.
// 쓰기는 포트가 한다: 매수·가격 메모 = 그 달 INVEST_MONTH 초안(연산 0, 쌓기 때 달마다 1번) · 계획 가져오기·재검토 신호 = INVEST_PLAN 1장(연산 1).
// 판정 문구는 "조건 충족 / 위반 / 안내 / 참고"만 쓴다(투자 자문 아님). 투자 문이 닫혀 있으면 켜기 카드만 보이고 쓰기 단추는 없다.
import {investView,emptyInvestMonth,investBuyRow,parseInvestImport,importDiff,wonText,pctText,VENUE_TEXT,INVEST_VENUES,INVEST_CCYS,INVEST_MAX,INVEST_MEMO_MAX,FX_SYM} from './invest-model.mjs';
import {formatCompact} from './fin-ledger.mjs';

export const INVEST_FIXED_TEXT='이 화면은 내 계획 대비 기록을 보여 주는 판단 자료이며 투자 자문이 아닙니다.';
export const INVEST_DOOR_TEXT=Object.freeze({
  title:'투자 기록 켜기',
  line:'4기기를 r86 이상으로 올린 뒤 켜기',
  why:'켜기 전에는 이 기기에서 투자 기록을 쓰지 않아요(옛 앱 기기 보호). 다른 기기에서 켜고 기록하면 그 기록을 받는 순간 이 기기도 자동으로 열려요.',
  ask:'PC·노트북·Fold·iPad 4기기 모두 r86 이상인가요? 켜면 이 기기부터 투자 기록을 쓸 수 있어요.',
});
export const INVEST_DRAFT_NOTE='이 기기에 넣었어요 · 5분 안에 자동으로 쌓여요';
export const INVEST_BATCH_HINT='이번 달 매수는 한 번에 넣으면 저장 횟수를 아껴요';
export const INVEST_PNL_NOTE="실현 손익은 '한눈에 › 투자 손익'에 따로 적어요";
export const INVEST_EMPTY_TEXT='계획 파일(.json)을 가져오면 종목 · 회차 · 하락 계단 · 규칙 판정이 여기에 보여요.';

// 폭별 배치(설계 4-3). 고정 문구(카드 0)는 모든 폭에서 칸 위 맨 위에 따로 둔다. 숫자 = 카드 번호(1 경고 · 2 이번 회차 · 3 하락 계단 · 4 종목 진행 · 5 비중 · 6 리밸런싱·재검토 · 7 계획).
export const INVEST_LAYOUT=Object.freeze({3:[[1,2,3],[4],[5,6,7]],2:[[1,2,3,6],[4,5,7]],1:[[1,2,3,4,5,6,7]]});
export const investCols=w=>!Number.isFinite(w)||w>1000?3:w>600?2:1;
export const investCompact=w=>Number.isFinite(w)&&w<=420;

const LEVEL_WORD={RED:'위반',YELLOW:'안내',GRAY:'참고'};
const LEVEL_CLS={RED:'inv-red',YELLOW:'inv-yellow',GRAY:'inv-gray'};
const STEP_TEXT={DONE:'실행',MET:'조건 충족',WAIT:'대기'};
const KIND_TEXT={PLAN:'계획 회차',EXTRA:'추가 매수',LADDER:'하락 계단'};
const stripLevel=t=>String(t).replace(/^(위반|안내|참고) · /,'');
const monthNo=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
const monthText=m=>Number(m.slice(5,7))+'월';
const shortDate=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
const AMT=/^[1-9]\d{0,12}$/,DEC=/^(0|[1-9]\d{0,8})(\.\d{1,8})?$/,SYM=/^[A-Z0-9][A-Z0-9.-]{0,11}$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
const dayOK=v=>DAY.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;

// 오류 코드 → 화면 글(모르는 코드는 코드 그대로 붙인다).
const ERROR_TEXT={
  INVEST_DOOR_CLOSED:'투자 기록이 꺼져 있어요 · 4기기를 r86 이상으로 올린 뒤 켜세요',
  INVEST_NO_PLAN:'활성 계획이 없어요 · 계획 파일을 먼저 가져오세요',
  INVEST_PICK:'종목을 고르세요',INVEST_AMOUNT:'금액은 1원 이상 정수(원)로 넣으세요',INVEST_DATE:'날짜는 YYYY-MM-DD로 넣으세요',INVEST_FUTURE:'오늘 뒤 날짜는 기록할 수 없어요',
  INVEST_DEC:'수량·가격은 0보다 큰 숫자(소수 8자리까지)로 넣으세요',INVEST_SYM:'종목 기호는 영문 대문자·숫자(12자까지)로 넣으세요',INVEST_STEP:'하락 계단 단계를 고르세요',
  INVEST_TEXT_DIGITS:'메모에 숫자 10자리 이상을 적을 수 없어요(계좌번호 보호)',INVALID_INVEST_TEXT:'메모는 60자까지, 제어 문자 없이 넣으세요',
  INVEST_BUY_LIMIT:'이번 달 기록이 가득 찼어요(매수 80건)',INVEST_MARK_LIMIT:'이번 달 가격 메모가 가득 찼어요(31건)',INVEST_TOO_LARGE:'이번 달 기록이 너무 커요(16KB)',
  INVEST_PLAN_CHECK:'계획 점검을 통과하지 못해 저장하지 않았어요',INVEST_IMPORT_NONE:'계획 파일을 먼저 고르세요',INVEST_IMPORT_SAME:'바뀐 것이 없어 저장하지 않아요',
  INVEST_IMPORT_NOT_JSON:'.json 파일만 가져올 수 있어요',INVEST_IMPORT_TOO_LARGE:'256KB보다 큰 파일은 가져올 수 없어요',INVEST_IMPORT_UTF8:'UTF-8 글자가 아닌 파일이에요',
  INVEST_IMPORT_JSON:'JSON 형식이 아닌 파일이에요',INVEST_IMPORT_SHAPE:'파일 모양이 달라요(format · planId · plan만)',INVEST_IMPORT_FORMAT:'형식 이름이 달라요(lifebrick-invest-plan-v1)',
  CARD_DRAFT_STALE_BASE:'다른 창에서 같은 달을 고쳤어요 · 다시 넣어 주세요',
};
export const investErrorText=code=>ERROR_TEXT[code]??(typeof code==='string'&&code.startsWith('INVEST_')||typeof code==='string'&&code.startsWith('INVALID_INVEST')||code==='DUPLICATE_INVEST_ID'?'계획 검사 실패 · '+code:null);
const fail=code=>Object.assign(new Error(code),{code});

// ---- 작은 조각 ----
function bar(h,value,max,label,cls='inv-bar'){const n=h.el('progress',null,cls),m=Number(max)>0?Number(max):1;n.max=m;n.value=Math.min(m,Math.max(0,Number(value)||0));n.setAttribute('aria-label',label);return n;}
function card(h,key,title,sub){const {el,add}=h,c=el('section',null,'panel inv-card inv-'+key);c.dataset.card=key;add(c,el('h2',title,'inv-card-title'));if(sub)add(c,el('p',sub,'muted small inv-card-sub'));return c;}
function navOnly(b){b.dataset.navOnly='1';return b;}
export function warnNode(h,w){
  const {el,add}=h,row=add(el('li',null,'inv-w '+LEVEL_CLS[w.level]),el('span',LEVEL_WORD[w.level],'inv-w-tag'),el('span',stripLevel(w.text),'inv-w-text'));
  row.dataset.level=w.level;row.dataset.rule=w.rule;return row;
}
export function fixedNode(h){const p=h.el('p',INVEST_FIXED_TEXT,'inv-fixed');p.setAttribute('role','note');return p;}

// ---- 카드 ----
function warnCard(h,v){
  const {el,add}=h,c=card(h,'warn',v.red?'규칙 위반 '+v.red+'건':'규칙 위반 0');
  const rest=v.warnings.length-v.red;
  if(!v.warnings.length){add(c,el('p','기록이 계획 규칙 안에 있어요','muted small'));return c;}
  if(rest&&v.red)add(c,el('p','안내 · 참고 '+rest+'건','muted small'));
  add(c,add(el('ul',null,'inv-warns'),...v.warnings.map(w=>warnNode(h,w))));
  return c;
}
function roundCard(h,v,{drafts=0}={}){
  const {el,add}=h,r=v.round,cur=r.state==='ACTIVE'?v.rounds[r.cur]:null,c=card(h,'round','이번 회차');
  const head=r.state==='BEFORE'?'시작 전 · 1회차 '+monthText(v.startMonth)+' · 계획 '+wonText(v.rounds[0].planned)+'원'
    :r.state==='DONE'?'분할 끝 · '+v.months+'회차 모두 지남'
    :(r.cur+1)+'회차 · '+monthText(cur.month)+' · 계획 '+wonText(cur.planned)+'원 중 '+wonText(cur.paid)+'원 · 칸 '+cur.filled+'/'+cur.cells;
  add(c,el('p',head,'inv-round-head'));
  const row=el('div',null,'inv-bricks');row.setAttribute('role','list');row.setAttribute('aria-label','투자 벽돌 '+v.bricks+'/'+v.months);
  for(const x of v.rounds){
    const b=el('span',String(x.i+1),'inv-brick'+(x.done?' done':'')+(r.state==='ACTIVE'&&x.i===r.cur?' cur':''));b.setAttribute('role','listitem');
    b.setAttribute('aria-label',(x.i+1)+'회차 '+monthText(x.month)+' · '+(x.done?'완료':'칸 '+x.filled+'/'+x.cells));add(row,b);
  }
  add(c,row,el('p','투자 벽돌 '+v.bricks+'/'+v.months+' · 회차 칸을 모두 채우면(계획 금액의 95% 이상) 1개','muted small inv-brick-line'));
  if(drafts)add(c,el('p','이 기기에만 있는 투자 기록 '+drafts+'달 · 쌓기 전이라 다른 기기에서는 아직 안 보여요','small inv-draft-line'));
  add(c,el('p',INVEST_BATCH_HINT,'muted small'));
  return c;
}
function ladderCard(h,v,act){
  const {el,add,button}=h,L=v.ladder,c=card(h,'ladder',L?'하락 계단':'가격 메모');
  if(L){
    add(c,el('p',L.line,'inv-ladder-line'));
    const ol=el('ol',null,'inv-steps');
    for(const s of L.steps)add(ol,add(el('li',null,'inv-step '+s.state.toLowerCase()),el('strong',s.k+'단계'),el('span',s.price+' 이하','inv-step-price'),el('span',wonText(s.amount)+'원','inv-step-amt'),el('span',STEP_TEXT[s.state],'inv-step-state')));
    add(c,ol);
    if(L.current?.stale)add(c,el('p','오래된 가격 · 판정은 마지막으로 넣은 가격 기준이에요','muted small'));
  }else add(c,el('p','하락 계단이 없는 계획이에요 · 가격 메모는 시세 참고에만 써요','muted small'));
  if(act?.price)add(c,add(el('div',null,'button-row'),navOnly(button('가격 넣기',()=>act.price(),'secondary inv-price-go'))));
  return c;
}
function itemRow(h,it,compact){
  const {el,add}=h,pct=pctText(it.pctBp),b=bar(h,it.pctBp,10000,it.name+' 진행 '+pct);
  const over=BigInt(it.over)>0n;
  const venue=el('span',it.venueText,'inv-venue'),fixed=it.fixed?el('span','고정','inv-fixed-tag'):null;
  const round=el('p','이번 회차 계획 '+(compact?formatCompact(it.roundPlan):wonText(it.roundPlan)+'원')+' · 넣음 '+(compact?formatCompact(it.roundPaid):wonText(it.roundPaid)+'원'),'muted small inv-item-round');
  if(compact){
    const d=el('details',null,'inv-item compact');d.dataset.item=it.id;
    add(d,add(el('summary',null,'inv-item-sum'),el('strong',it.sym,'inv-item-sym'),b,el('span',pct,'inv-item-pct'),over?el('span','초과','inv-over'):null));
    add(d,add(el('p',null,'small inv-item-name'),el('span',it.name),venue,fixed),
      add(el('p',null,'small inv-item-amt'),el('span','넣음 '+formatCompact(it.paid)+' / 목표 '+formatCompact(it.target)),over?el('span','+'+formatCompact(it.over)+' 초과','inv-over'):null),round);
    return d;
  }
  const row=el('div',null,'inv-item');row.dataset.item=it.id;
  add(row,add(el('div',null,'inv-item-head'),el('strong',it.name,'inv-item-name'),el('span',it.sym,'muted small'),venue,fixed,el('span',pct,'inv-item-pct')),b,
    add(el('p',null,'small inv-item-amt'),el('span','넣음 '+wonText(it.paid)+' / 목표 '+wonText(it.target)+'원'),over?el('span','+'+wonText(it.over)+'원 초과','inv-over'):null),round);
  return row;
}
function itemsCard(h,v,{compact=false}={}){
  const {el,add}=h,c=card(h,'items','종목 진행');
  for(const g of v.groups.filter(x=>!x.cash)){
    const rows=v.items.filter(it=>it.group===g.id);if(!rows.length)continue;
    const d=el('details',null,'inv-group');d.open=true;d.dataset.group=g.id;
    add(d,add(el('summary',null,'inv-group-sum'),el('strong',g.name),el('span',(compact?formatCompact(g.paid)+' / '+formatCompact(g.target):wonText(g.paid)+' / '+wonText(g.target)+'원'),'muted small')));
    for(const it of rows)add(d,itemRow(h,it,compact));
    add(c,d);
  }
  return c;
}
function gaugeRow(h,name,targetBp,actualBp){
  const {el,add}=h,row=el('div',null,'inv-gauge-row');
  add(row,add(el('div',null,'inv-gauge-head'),el('strong',name),el('span','목표 '+pctText(targetBp)+' · 실제 '+pctText(actualBp),'small')),
    add(el('div',null,'inv-gauge-bars'),el('span','목표','small muted'),bar(h,targetBp??0,10000,name+' 목표 '+pctText(targetBp),'inv-bar target'),el('span','실제','small muted'),bar(h,actualBp??0,10000,name+' 실제 '+pctText(actualBp),'inv-bar actual')));
  return row;
}
function gaugeCard(h,v){
  const {el,add}=h,c=card(h,'gauge','비중 (원금 기준)','넣은 원금 안에서의 비중과 계획 목표');
  for(const g of v.groups){
    if(g.cash){add(c,add(el('div',null,'inv-gauge-row cash'),add(el('div',null,'inv-gauge-head'),el('strong',g.name),el('span','남은 현금 '+wonText(g.cashLeft)+'원 / '+wonText(g.target)+'원','small'))));continue;}
    add(c,gaugeRow(h,g.name,g.targetPctBp,g.actualPctBp));
  }
  if(v.sectors.length){add(c,el('h3','섹터','inv-sub'));for(const s of v.sectors)add(c,gaugeRow(h,s.name,s.targetPctBp,s.actualPctBp));}
  const m=v.market;
  if(m.ok){
    const names=new Map(v.groups.map(g=>[g.id,g.name]));
    add(c,add(el('p',null,'inv-market small'),el('span','참고 · 시세 기준(가격 입력일 '+shortDate(m.asOf)+(m.stale?' · 오래된 가격':'')+')'),el('span',m.groups.filter(g=>BigInt(g.value)>0n).map(g=>names.get(g.id)+' '+pctText(g.pctBp)).join(' · '))));
  }else if(m.held)add(c,el('p','시세 참고: 가격 없음 '+m.missing+'종목','inv-market small'));
  return c;
}
function reviewCard(h,v,act){
  const {el,add,button}=h,R=v.rebalance,c=card(h,'review','리밸런싱 · 재검토');
  add(c,el('p','리밸런싱 점검: 분할이 끝난 뒤 매년 '+R.month+'월 · 목표의 '+R.lowPct+'% 미만이나 '+R.highPct+'% 초과면 안내','small'));
  if(!v.signals.length){add(c,el('p','재검토 신호가 없는 계획이에요','muted small'));return c;}
  const ul=el('ul',null,'inv-signals');
  for(const s of v.signals){
    const li=add(el('li',null,'inv-signal'+(s.on?' on':'')),add(el('span',null,'inv-signal-text'),el('span',s.text),el('span',s.on?' · 켜짐'+(s.date?' '+shortDate(s.date):''):' · 꺼짐','muted small')));
    li.dataset.signal=s.id;
    if(act?.signal)add(li,navOnly(button(s.on?'끄기':'켜짐으로 표시',()=>act.signal(s.id,!s.on),'secondary inv-signal-go')));
    add(ul,li);
  }
  add(c,ul,el('p','신호를 바꾸면 계획 기록을 고쳐 써요(저장 1번)','muted small'));
  return c;
}
function planCard(h,v,meta,act){
  const {el,add,button}=h,c=card(h,'plan','계획');
  add(c,el('p',v.name+' · '+v.planId,'inv-plan-name'),
    el('p','총액 '+wonText(v.total)+'원 · '+v.months+'개월('+v.startMonth+'부터) · 종목 '+v.items.length,'small'),
    meta?.updatedAt?el('p','마지막 저장 '+String(meta.updatedAt).slice(0,10),'muted small'):null);
  if(act?.importPlan)add(c,add(el('div',null,'button-row'),navOnly(button('계획 파일 가져오기',()=>act.importPlan(),'secondary inv-import-go'))));
  add(c,el('p',INVEST_PNL_NOTE,'muted small inv-pnl-note'));
  return c;
}
function doorCard(h,act){
  const {el,add,button}=h,c=card(h,'door',INVEST_DOOR_TEXT.title);
  add(c,el('p',INVEST_DOOR_TEXT.line,'inv-door-line'),el('p',INVEST_DOOR_TEXT.why,'muted small'));
  const ask=add(el('div',null,'inv-door-ask'),el('p',INVEST_DOOR_TEXT.ask,'small inv-door-q'));ask.hidden=true;
  if(act?.openDoor)add(ask,add(el('div',null,'button-row'),navOnly(button('네, 켜기',()=>act.openDoor(),'primary inv-door-yes'))));
  const go=navOnly(button('켜기',()=>{ask.hidden=false;go.hidden=true;},'secondary inv-door-go'));
  add(c,add(el('div',null,'button-row'),go),ask,el('p',INVEST_PNL_NOTE,'muted small inv-pnl-note'));
  return c;
}
function emptyCard(h,act){
  const {el,add,button}=h,c=card(h,'empty','투자 계획이 없어요');
  add(c,el('p',INVEST_EMPTY_TEXT,'small'));
  if(act?.importPlan)add(c,add(el('div',null,'button-row'),navOnly(button('계획 파일 가져오기',()=>act.importPlan(),'primary inv-import-go'))));
  add(c,el('p',INVEST_PNL_NOTE,'muted small inv-pnl-note'));
  return c;
}

// 화면 전체. ctx = {h, raw(금고 investRawView), draft(초안 달 기록 [{month,data}]), today, door({open}), width, drafts(초안 달 수), act:{openDoor, buy, price, importPlan, signal}}
// 돌려주는 값 = {status:'DOOR_CLOSED'|'NONE'|'OK', view, cols}(시험·앱이 읽기만).
export function renderInvestPlan(root,ctx){
  const {h,raw=null,draft=null,today,door=null,width,act={},drafts=0}=ctx,{el,add}=h;
  const page=el('div',null,'inv-page');page.id='invest-plan';
  add(page,fixedNode(h));
  if(!door?.open){add(page,doorCard(h,act));root.append(page);return {status:'DOOR_CLOSED',view:null,cols:null};}
  const v=investView(raw??{plans:[],months:[]},{today,draft});
  if(v.status!=='OK'){add(page,emptyCard(h,act));root.append(page);return {status:'NONE',view:v,cols:null};}
  const cols=investCols(width),meta=(raw?.plans??[]).find(p=>p.id===v.planId)??null;
  const cards=[null,warnCard(h,v),roundCard(h,v,{drafts}),ladderCard(h,v,act),itemsCard(h,v,{compact:investCompact(width)}),gaugeCard(h,v),reviewCard(h,v,act),planCard(h,v,meta,act)];
  const grid=el('div',null,'inv-grid inv-cols-'+cols);grid.dataset.cols=String(cols);
  for(const col of INVEST_LAYOUT[cols])add(grid,add(el('div',null,'inv-col'),...col.map(i=>cards[i])));
  add(page,grid);root.append(page);
  return {status:'OK',view:v,cols};
}
// 상태 화면 한 줄용 요약(금액 없음). 활성 계획이 없으면 null.
export function investSummary(raw,{today,draft=null}={}){
  try{const v=investView(raw??{plans:[],months:[]},{today,draft});return v.status==='OK'?v.summary:null;}catch{return null;}
}

// ---- 초안 위에 얹어 미리 보기(저장 0) ----
// 초안 달 기록 목록(draft)에서 그 달을 고르거나(없으면 금고 값, 없으면 빈 달) mutate를 적용한 새 목록을 돌려준다. 입력 목록은 바꾸지 않는다.
export function draftWith(raw,draft,month,planId,mutate){
  const rows=(draft??[]).map(r=>({month:r.month,data:structuredClone(r.data)}));
  let row=rows.find(r=>r.month===month);
  if(!row){const s=(raw?.months??[]).find(m=>m.month===month);row={month,data:s?structuredClone(s.data):emptyInvestMonth(month,planId)};rows.push(row);}
  mutate(row.data);return rows;
}
// 매수 1건을 더했을 때 새로 생기는 판정(설계 4-4 ②). 같은 글의 판정은 이미 있던 것으로 본다. late = 지난 회차 칸을 덜 채운 종목을 다음 달에 산 경우(그 칸으로 세지 않음).
export function previewBuy(raw,{today,draft=null,buy,planId}){
  const before=investView(raw,{today,draft}),month=buy.date.slice(0,7);
  const after=investView(raw,{today,draft:draftWith(raw,draft,month,planId,d=>{d.buys.push(buy);})});
  const seen=new Map();for(const w of before.warnings)seen.set(w.text,(seen.get(w.text)??0)+1);
  const fresh=[];for(const w of after.warnings){const n=seen.get(w.text)??0;if(n>0)seen.set(w.text,n-1);else fresh.push(w);}
  let late=false;
  if(before.status==='OK'&&buy.kind!=='LADDER'&&buy.item){const r=monthNo(month)-monthNo(before.startMonth);late=before.rounds.some(x=>x.i<r&&x.detail.some(c=>c.item===buy.item&&!c.filled));}
  return {month,warnings:fresh,red:fresh.some(w=>w.level==='RED'),late,after};
}

// ---- 매수 시트(설계 4-4) ----
// ctx = {h, field, raw, draft, today, newId(), setSave(label), put(month, planId, mutate) → Promise}
// 돌려주는 값 = 저장 함수(app.mjs modal의 저장). 빨간 미리 판정이면 처음 누를 때 확인 줄만 보이고({ask:true}), 같은 입력으로 한 번 더 누르면 넣는다.
export function investBuyForm(root,ctx){
  const {h,field,raw,today}=ctx,{el,add,button}=h;
  const base=investView(raw??{plans:[],months:[]},{today,draft:ctx.draft??null});
  if(base.status!=='OK'){add(root,el('p',ERROR_TEXT.INVEST_NO_PLAN,'empty'));return async()=>{throw fail('INVEST_NO_PLAN');};}
  const planId=base.planId,plan=raw.plans.find(p=>p.id===planId).data,L=plan.ladder,id=ctx.newId();
  let pick=null,kind='PLAN',step=null,ccy='KRW',asked=null;
  const picks=el('div',null,'inv-picks');picks.setAttribute('role','group');picks.setAttribute('aria-label','종목');
  const chips=[];
  const chip=(label,venueText,key,onPick)=>{const b=navOnly(button(label,()=>{onPick();asked=null;paint();},'secondary inv-chip'));b.dataset.pick=key;if(venueText)add(b,el('span',venueText,'inv-venue'));chips.push(b);return b;};
  for(const g of plan.groups){
    const its=plan.items.filter(i=>i.group===g.id);if(!its.length)continue;
    const row=add(el('div',null,'inv-pick-group'),el('span',g.name,'small muted inv-pick-label'));
    for(const it of its)add(row,chip(it.name+' · '+it.sym,VENUE_TEXT[it.venue],'ITEM:'+it.id,()=>{pick={type:'ITEM',item:it};kind='PLAN';step=null;ccy=it.ccy;venue.value=it.venue;}));
    add(picks,row);
  }
  const ladderItem=L?plan.items.find(i=>i.sym===L.sym)??null:null;
  if(L){const done=new Set();for(const r of ctx.draft??[])for(const b of r.data.buys)if(b.kind==='LADDER')done.add(b.step);for(const m of raw.months??[])for(const b of m.data.buys)if(b.kind==='LADDER')done.add(b.step);
    const first=L.steps.findIndex((_,i)=>!done.has(i+1));
    add(picks,add(el('div',null,'inv-pick-group'),el('span','하락 계단','small muted inv-pick-label'),chip('계단 · '+L.sym,ladderItem?VENUE_TEXT[ladderItem.venue]:null,'LADDER',()=>{pick={type:'LADDER'};kind='LADDER';step=first<0?L.steps.length:first+1;ccy=L.ccy;venue.value=ladderItem?.venue??'OTHER';})));}
  add(picks,add(el('div',null,'inv-pick-group'),el('span','그 밖','small muted inv-pick-label'),chip('계획 밖 종목',null,'OFF',()=>{pick={type:'OFF'};kind='EXTRA';step=null;})));
  add(root,picks);
  // 종류(계획 회차 / 추가 매수 / 계단 n단계)
  const kinds=el('div',null,'button-row inv-kinds');kinds.setAttribute('role','group');kinds.setAttribute('aria-label','종류');add(root,kinds);
  const offBox=el('div',null,'field-grid inv-off');add(root,offBox);
  const sym=field(offBox,'종목 기호 (계획 밖)','text','');sym.maxLength=12;
  const ccyIn=field(offBox,'통화','select','KRW',[['KRW','원'],['USD','달러']]);
  const grid=el('div',null,'field-grid');add(root,grid);
  const dateIn=field(grid,'날짜','date',today);dateIn.max=today;
  const amount=field(grid,'금액 (원, 정수)','text','');amount.inputMode='numeric';
  const qty=field(grid,'수량 (선택)','text','');qty.inputMode='decimal';
  const price=field(grid,'가격 (선택, 1주)','text','');price.inputMode='decimal';
  const venue=field(grid,'매수처','select','OTHER',INVEST_VENUES.map(v=>[v,VENUE_TEXT[v]]));
  const memo=field(grid,'메모 (선택)','text','');memo.maxLength=INVEST_MEMO_MAX;
  const judge=el('div',null,'inv-judge');judge.setAttribute('role','status');add(root,judge);
  const ask=el('p','','fin-warn inv-ask');ask.hidden=true;add(root,ask);
  add(root,el('p','넣은 매수는 이 기기 임시 입력에 모였다가 쌓기 때 그 달 기록 1장으로 저장돼요 · '+INVEST_BATCH_HINT,'muted small'));
  const read=()=>{
    if(!pick)throw fail('INVEST_PICK');
    const d=String(dateIn.value??'').trim();if(!dayOK(d))throw fail('INVEST_DATE');if(d>today)throw fail('INVEST_FUTURE');
    const a=String(amount.value??'').replace(/[,\s원]/g,'');if(!AMT.test(a))throw fail('INVEST_AMOUNT');
    const dec=x=>{const s=String(x.value??'').replace(/[,\s]/g,'');if(!s)return null;if(!DEC.test(s)||/^0(\.0*)?$/.test(s))throw fail('INVEST_DEC');return s;};
    const q=dec(qty),p=dec(price),m=String(memo.value??'').trim();
    if(/\d{10,}/.test(m))throw fail('INVEST_TEXT_DIGITS');if([...m].length>INVEST_MEMO_MAX)throw fail('INVALID_INVEST_TEXT');
    let s,item=null,c=ccy;
    if(pick.type==='ITEM'){item=pick.item.id;s=pick.item.sym;}
    else if(pick.type==='LADDER'){if(!step)throw fail('INVEST_STEP');s=L.sym;item=ladderItem?.id??null;}
    else{s=String(sym.value??'').trim().toUpperCase();if(!SYM.test(s))throw fail('INVEST_SYM');c=INVEST_CCYS.includes(ccyIn.value)?ccyIn.value:'KRW';const hit=plan.items.find(i=>i.sym===s);item=hit?hit.id:null;}
    return investBuyRow({id,date:d,item,sym:s,amount:a,qty:q,price:p,ccy:c,venue:INVEST_VENUES.includes(venue.value)?venue.value:'OTHER',kind,step:kind==='LADDER'?step:null,memo:m});
  };
  const paintKinds=()=>{
    const list=!pick?[]:pick.type==='ITEM'?[['PLAN',KIND_TEXT.PLAN],['EXTRA',KIND_TEXT.EXTRA]]:pick.type==='LADDER'?L.steps.map((s,i)=>['LADDER:'+(i+1),(i+1)+'단계 · '+s.price+' 이하']):[['EXTRA',KIND_TEXT.EXTRA]];
    kinds.replaceChildren(...list.map(([k,label])=>{const on=k==='LADDER:'+step||k===kind&&kind!=='LADDER';const b=navOnly(button(label,()=>{if(k.startsWith('LADDER:')){kind='LADDER';step=Number(k.slice(7));}else kind=k;asked=null;paint();},'secondary inv-kind'+(on?' active':'')));b.dataset.kind=k;b.setAttribute('aria-pressed',String(on));return b;}));
    kinds.hidden=!list.length;offBox.hidden=pick?.type!=='OFF';
  };
  const paint=()=>{
    for(const b of chips){const on=Boolean(pick)&&b.dataset.pick===(pick.type==='ITEM'?'ITEM:'+pick.item.id:pick.type);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
    paintKinds();show();
  };
  // 미리 판정: 고칠 때마다 다시 계산(저장 0). 빨강이면 저장 단추 글자 "위반 알고 기록".
  let last=null;
  const show=()=>{
    let buy=null;try{buy=read();}catch{buy=null;}
    if(!buy){last=null;judge.replaceChildren(el('p','종목 · 날짜 · 금액을 넣으면 저장 전에 미리 판정해요','muted small'));ctx.setSave?.('이 기기에 넣기');ask.hidden=true;return null;}
    const pv=previewBuy(raw,{today,draft:ctx.draft??null,buy,planId});last={buy,pv};
    const head=el('p',pv.red?'미리 판정 · 위반 '+pv.warnings.filter(w=>w.level==='RED').length+'건':'미리 판정 · 조건 충족'+(pv.warnings.length?' · 안내 '+pv.warnings.length+'건':''),'inv-judge-head'+(pv.red?' red':''));
    judge.replaceChildren(...[head,pv.warnings.length?add(el('ul',null,'inv-warns'),...pv.warnings.map(w=>warnNode(h,w))):null,pv.late?el('p','안내 · 지난 회차 칸으로 세지 않음(매수 날짜의 달이 회차)','small inv-late'):null].filter(Boolean));
    judge.dataset.red=String(pv.red);
    ctx.setSave?.(pv.red?'위반 알고 기록':'이 기기에 넣기');
    if(!pv.red||asked!==JSON.stringify(buy))ask.hidden=true;
    return pv;
  };
  for(const n of [dateIn,amount,qty,price,venue,memo,sym,ccyIn])for(const t of ['input','change'])n.addEventListener(t,()=>{show();});
  paint();
  return async()=>{
    const buy=read(),pv=show(),sig=JSON.stringify(buy);
    if(pv?.red&&asked!==sig){asked=sig;ask.textContent='위반을 알고 기록합니다 · 같은 입력으로 한 번 더 누르면 넣어요(기록은 사실 그대로 남아요)';ask.hidden=false;ask.scrollIntoView?.({block:'center'});return {ask:true};}
    const r=await ctx.put(pv.month,planId,d=>{if(d.buys.some(b=>b.id===buy.id))return;if(d.buys.length>=INVEST_MAX.buys)throw fail('INVEST_BUY_LIMIT');d.buys.push(buy);});
    return {notice:r?.notice??INVEST_DRAFT_NOTE,buy,red:Boolean(pv?.red)};
  };
}

// ---- 가격 시트(수동 가격 메모, 설계 4-5 (a)) ----
// ctx = {h, field, raw, draft, today, put(month, planId, mutate)}. 같은 기호·같은 날 메모는 새 값으로 바꾼다.
export function investPriceForm(root,ctx){
  const {h,field,raw,today}=ctx,{el,add,button}=h;
  const base=investView(raw??{plans:[],months:[]},{today,draft:ctx.draft??null});
  if(base.status!=='OK'){add(root,el('p',ERROR_TEXT.INVEST_NO_PLAN,'empty'));return async()=>{throw fail('INVEST_NO_PLAN');};}
  const planId=base.planId,plan=raw.plans.find(p=>p.id===planId).data,syms=new Map();
  if(plan.ladder)syms.set(plan.ladder.sym,plan.ladder.ccy);
  for(const it of plan.items)if(!syms.has(it.sym))syms.set(it.sym,it.ccy);
  if([...syms.values()].includes('USD'))syms.set(FX_SYM,'KRW');
  let pick=plan.ladder?plan.ladder.sym:[...syms.keys()][0];
  const row=el('div',null,'inv-picks');row.setAttribute('role','group');row.setAttribute('aria-label','기호');
  const chips=[...syms.keys()].map(s=>{const b=navOnly(button(s===FX_SYM?'환율 · 1달러':s,()=>{pick=s;paint();},'secondary inv-chip'));b.dataset.pick=s;add(row,b);return b;});
  add(root,row);
  const grid=el('div',null,'field-grid');add(root,grid);
  const priceIn=field(grid,'가격','text','');priceIn.inputMode='decimal';
  const dateIn=field(grid,'가격 날짜','date',today);dateIn.max=today;
  const note=el('p','','muted small inv-price-note');add(root,note);
  const paint=()=>{for(const b of chips){const on=b.dataset.pick===pick;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}note.textContent=(pick===FX_SYM?'1달러 = 원':'통화 '+syms.get(pick))+' · 이 기기 임시 입력에 넣고 쌓기 때 그 달 기록에 같이 저장돼요(따로 저장 0)';};
  paint();
  return async()=>{
    const p=String(priceIn.value??'').replace(/[,\s]/g,''),d=String(dateIn.value??'').trim();
    if(!DEC.test(p)||/^0(\.0*)?$/.test(p))throw fail('INVEST_DEC');if(!dayOK(d))throw fail('INVEST_DATE');if(d>today)throw fail('INVEST_FUTURE');
    const mark={sym:pick,price:p,ccy:syms.get(pick),date:d,src:'MANUAL'};
    const r=await ctx.put(d.slice(0,7),planId,x=>{x.marks=x.marks.filter(m=>!(m.sym===mark.sym&&m.date===mark.date));if(x.marks.length>=INVEST_MAX.marks)throw fail('INVEST_MARK_LIMIT');x.marks.push(mark);});
    return {notice:r?.notice??INVEST_DRAFT_NOTE,mark};
  };
}

// ---- 계획 파일 가져오기 시트(설계 2-5) ----
// 고른 파일을 읽어 미리보기 · 같은 계획과의 차이 · 계획 점검 목록을 보인다. 점검이 1건이라도 있으면(또는 바뀐 것이 없으면) 저장 단추를 막는다.
export function importState(parsed,raw){
  if(!parsed)return {ok:false,canSave:false,code:'INVEST_IMPORT_NONE'};
  if(!parsed.ok)return {ok:false,canSave:false,code:parsed.code,text:investErrorText(parsed.code)??parsed.code};
  const old=(raw?.plans??[]).find(p=>p.id===parsed.planId)??null,diff=old?importDiff(old.data,parsed.plan):null;
  const same=Boolean(diff?.same);
  return {ok:true,planId:parsed.planId,plan:parsed.plan,preview:parsed.preview,problems:parsed.problems,diff,replace:Boolean(old),heads:old?[...old.heads]:[],same,canSave:!parsed.problems.length&&!same};
}
export function importPreviewNode(h,st){
  const {el,add}=h,box=el('div',null,'inv-import-preview');
  if(!st.ok){add(box,el('p',st.code==='INVEST_IMPORT_NONE'?ERROR_TEXT.INVEST_IMPORT_NONE:'가져올 수 없어요 · '+st.text,st.code==='INVEST_IMPORT_NONE'?'muted small':'fin-warn'));return box;}
  const p=st.preview;
  add(box,el('p','계획 '+st.planId+' · '+st.plan.name,'inv-import-name'),
    el('p','그룹 '+p.groups+' · 종목 '+p.items+' · 총액 '+wonText(p.total)+'원 · 하락 계단 '+p.ladderSteps+'단계 · 기준가 모름 '+p.unknownBase+'종목','small'),
    el('p','회차별 계획: '+p.rounds.map((x,i)=>(i+1)+'회차 '+wonText(x)+'원').join(' · '),'small inv-import-rounds'));
  if(st.replace)add(box,el('p',st.same?'같은 계획 id · 바뀐 것 없음(저장하지 않아요)':'같은 계획 id를 덮어써요 · 바뀜: 종목 '+st.diff.items+' · 금액 '+st.diff.amounts,'small inv-import-diff'));
  if(st.problems.length){
    add(box,el('p','계획 점검 '+st.problems.length+'건 · 고치기 전에는 저장할 수 없어요','inv-import-bad'),add(el('ul',null,'inv-warns'),...st.problems.map(x=>warnNode(h,{level:'RED',rule:x.code,text:'위반 · '+x.text}))));
  }else add(box,el('p','계획 점검 6가지 모두 통과','small inv-import-ok'));
  return box;
}
// ctx = {h, raw, readFile(file) → Promise<ArrayBuffer|Uint8Array>, setSaveEnabled(bool), save({planId, plan, heads}) → Promise}
export function investImportForm(root,ctx){
  const {h,raw}=ctx,{el,add}=h;
  let st=importState(null,raw);
  const wrap=add(el('label',null,'inv-file'),el('span','계획 파일 (.json, 256KB 이하)'));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','계획 파일');add(wrap,input);
  const out=el('div',null,'inv-import-out');out.setAttribute('role','status');
  add(root,wrap,out,el('p','파일은 이 기기에서만 읽어요 · 저장은 계획 기록 1장(저장 1번) · 파일 자체는 어디에도 올리지 않아요','muted small'));
  const paint=()=>{out.replaceChildren(importPreviewNode(h,st));ctx.setSaveEnabled?.(st.canSave);};
  const pick=async file=>{
    if(!file){st=importState(null,raw);paint();return st;}
    let bytes=null;try{bytes=await ctx.readFile(file);}catch{bytes=null;}
    st=importState(bytes?parseInvestImport(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),{name:file.name??null}):{ok:false,code:'INVEST_IMPORT_SHAPE'},raw);paint();return st;
  };
  input.addEventListener('change',()=>{void pick(input.files?.[0]??null);});
  paint();
  const save=async()=>{
    if(!st.ok)throw fail('INVEST_IMPORT_NONE');if(st.problems.length)throw fail('INVEST_PLAN_CHECK');if(st.same)throw fail('INVEST_IMPORT_SAME');
    await ctx.save({planId:st.planId,plan:st.plan,heads:st.heads});
    return {notice:'투자 계획 '+st.planId+' 저장'};
  };
  save.pick=pick;   // 시험·앱이 파일을 직접 넘길 때
  return save;
}
