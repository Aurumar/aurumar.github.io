// 돈 탭 "분석" (B60, V3 §8 마스터 ②): 앱 안 기본 분석(AI 아님, 순수 함수)과 사령부 비서 분석 결과 카드.
// 이 모듈은 아무것도 쓰지 않고 시계·난수·저장소·외부 통신을 쓰지 않는다. 오늘 날짜와 읽기(request)는 부른 쪽이 넘긴다. 글은 ai-gate.mjs의 텍스트 렌더만 쓴다.
// 금액은 BigInt, null(모름·자료 없음)은 0이 아니다. 가맹점 이름은 다루지 않는다(분류 합계만).
import {AI_GATE_TEXT,latestByAssistant,reportCard,reportResultText} from './ai-gate.mjs';
import {aggregate,overview} from './fin-charts.mjs';
import {formatWon} from './fin-ledger.mjs';
import {RECURRING_TEXT,monthlyTotal} from './fin-recurring.mjs';

// 돈 탭에 보여 줄 비서 [파일명의 비서 이름, 화면 이름]. 비서를 늘리려면 여기 한 곳만 고친다.
export const ANALYSIS_ASSISTANTS=Object.freeze([['subscription','구독 감사'],['audit','재화 감사'],['spend','소비 분석']]);
export const TOP_CATEGORIES=5;
// 읽기 범위는 B47 reader의 "최근 30일"이다(R31B 통제탑 결정 (나): 창 밖 보고는 목록에 오지 않으므로 "오래된 분석" 표시 대신 none 문구가 다시 분석할 때임을 알린다).
export const ANALYSIS_TEXT=Object.freeze({
  title:'비서 분석',about:'사령부 비서가 남긴 분석 중 비서별 최신 1장입니다. 이 PC의 파일을 읽기만 합니다.',
  none:'최근 30일 안의 결과가 없습니다.',htmlOnly:'HTML 보고만 있어 앱에서 열지 않습니다.',
  basic:'이번 달 기본 분석',basicAbout:'앱 안에서 계산한 합계입니다. AI를 쓰지 않습니다. 지난달 대비는 지난달 전체 합계와 비교합니다.',
  noData:'이번 달 소비 자료가 없습니다.',unknownOnly:'이번 달은 실제 금액을 모르는 줄만 있어 합계를 내지 않습니다.',noTop:'이번 달에 순지출이 있는 분류가 없습니다.',
  top:'분류별 상위 5개',current:'이번 달 소비',change:'지난달 대비',noCompare:'비교할 수 없음',same:'지난달과 같음',noRecurring:'등록 없음',noRecurringFoot:'"정기 결제" 화면에서 등록합니다',
});

// ---------- 기본 분석(순수 함수) ----------
// 분류 합계는 소비(지출 − 환불) 기준이다. aggregate의 분류 표에서 null 분류는 글자 'null' 키로 들어 있어 되돌린다.
const catTotals=(prep,month)=>Object.entries(aggregate(prep,{from:month,to:month}).total.byCategory).map(([c,v])=>[c==='null'?null:c,v.total]);
// 상위 분류: 순지출이 양수인 분류만, 큰 금액부터, 같으면 분류 코드 순. 지난달 소비를 모르면 증감도 null이다(0으로 메우지 않음).
// FIX31 (D9): 지난달 그 분류에 순액 모름 줄(지출·환불)이 하나라도 있으면 그 분류의 증감도 null("비교할 수 없음").
const SPEND_KINDS=new Set(['EXPENSE','REFUND']);   // fin-charts.mjs CONSUMPTION과 같다
export function spendAnalysis(prep,localDate,rules=[]){
  const ov=overview(prep,localDate),known=ov.previous!==null,prev=new Map(known?catTotals(prep,ov.prevMonth):[]);
  const prevUnknown=new Set(prep.lines.filter(l=>l.month===ov.prevMonth&&SPEND_KINDS.has(l.kind)&&l.net===null).map(l=>l.category));
  const ranked=catTotals(prep,ov.month).filter(([,t])=>t>0n).sort(([a,x],[b,y])=>x>y?-1:x<y?1:String(a).localeCompare(String(b)));
  const top=ranked.slice(0,TOP_CATEGORIES).map(([category,total])=>({category,total,delta:known&&!prevUnknown.has(category)?total-(prev.get(category)??0n):null}));
  return {month:ov.month,prevMonth:ov.prevMonth,state:ov.currentState,current:ov.current,diff:ov.diff,unknownRows:ov.currentUnknown,top,moreCategories:ranked.length-top.length,
    recurring:{total:monthlyTotal(rules),count:rules.filter(r=>!r.hidden).length}};
}
export const deltaText=d=>d===null||d===undefined?ANALYSIS_TEXT.noCompare:d===0n?ANALYSIS_TEXT.same:(d>0n?'+':'')+formatWon(d);

// ---------- 카드 고르기(순수 함수) ----------
// 목록에서 돈 탭 비서만 골라 비서별 최신 1장(B47 latestByAssistant)과 결과가 없는 비서를 나눈다.
export function analysisCards(reports){
  const list=Array.isArray(reports)?reports:[],names=new Map(ANALYSIS_ASSISTANTS);
  const cards=latestByAssistant(list).filter(r=>names.has(r.assistant)).map(report=>({report,label:names.get(report.assistant)}));
  const shown=new Set(cards.map(c=>c.report.assistant));
  const missing=ANALYSIS_ASSISTANTS.filter(([a])=>!shown.has(a)).map(([assistant,label])=>({assistant,label,htmlOnly:list.some(r=>r?.kind==='html'&&r.assistant===assistant)}));
  return {cards,missing};
}

// ---------- 화면 ----------
const cell=(h,label,value,foot)=>h.add(h.el('div',null,'fin-analysis-cell'),h.el('small',label,'muted'),h.el('strong',value),foot?h.el('small',foot,'muted'):null);
// ctx={h:{el,add,button},catLabel(code)=>이름}. a=spendAnalysis 결과.
export function renderBasicAnalysis(root,ctx,a){
  const {h}=ctx,sec=h.add(h.el('section',null,'panel fin-analysis'),h.el('h2',ANALYSIS_TEXT.basic+' · '+a.month,'panel-title'),h.el('p',ANALYSIS_TEXT.basicAbout,'muted small'));
  const value=a.state==='NO_DATA'?'자료 없음':a.state==='UNKNOWN_ONLY'?'모름':formatWon(a.current);
  h.add(sec,h.add(h.el('div',null,'fin-analysis-grid'),
    cell(h,ANALYSIS_TEXT.current,value,a.unknownRows?'실제 금액 모름 '+a.unknownRows+'행 별도':null),
    cell(h,ANALYSIS_TEXT.change,deltaText(a.diff),a.diff===null?null:a.prevMonth+' 전체와 비교'),
    cell(h,RECURRING_TEXT.total,a.recurring.count?formatWon(a.recurring.total):ANALYSIS_TEXT.noRecurring,a.recurring.count?'정기 결제 '+a.recurring.count+'개':ANALYSIS_TEXT.noRecurringFoot)));
  h.add(sec,h.el('h3',ANALYSIS_TEXT.top,'fin-analysis-head'));
  if(!a.top.length)h.add(sec,h.el('p',a.state==='NO_DATA'?ANALYSIS_TEXT.noData:a.state==='UNKNOWN_ONLY'?ANALYSIS_TEXT.unknownOnly:ANALYSIS_TEXT.noTop,'muted'));
  else h.add(sec,h.add(h.el('ol',null,'fin-analysis-top'),...a.top.map(t=>h.add(h.el('li'),h.el('span',ctx.catLabel(t.category),'fin-analysis-name'),h.el('strong',formatWon(t.total)),h.el('small',deltaText(t.delta),'muted')))));
  if(a.moreCategories)h.add(sec,h.el('p','그 외 '+a.moreCategories+'개 분류','muted small'));
  h.add(root,sec);
  return sec;
}
// ctx={h,surface,request(body)=>Promise,gone()=>bool}. 돌려주는 ready는 목록을 다 읽으면 끝나는 Promise이고 거부되지 않는다. PC 앱이 아니면 읽기 요청을 보내지 않는다.
export function renderAssistantAnalysis(root,ctx){
  const {h}=ctx,gone=ctx.gone??(()=>false),sec=h.add(h.el('section',null,'panel ai-gate fin-analysis-reports'),h.el('h2',ANALYSIS_TEXT.title,'panel-title'));
  h.add(root,sec);
  if(ctx.surface!=='APP_SHELL'){h.add(sec,h.el('p',AI_GATE_TEXT.browser,'muted'));return {sec,ready:Promise.resolve()};}
  const note=h.el('p',AI_GATE_TEXT.loading,'muted'),box=h.el('div',null,'ai-gate-list');
  note.setAttribute('role','status');
  h.add(sec,h.el('p',ANALYSIS_TEXT.about,'muted'),note,box);
  const load=async()=>{
    note.textContent=AI_GATE_TEXT.loading;
    let res;
    try{res=await ctx.request({});}
    catch(e){if(!gone()){box.replaceChildren();note.textContent=reportResultText(e?.code);}return;}
    if(gone())return;
    const {cards,missing}=analysisCards(res?.reports);
    box.replaceChildren(...cards.map(c=>reportCard(ctx,c.report,{title:c.label})),
      ...missing.map(m=>h.el('p',m.label+' · '+(m.htmlOnly?ANALYSIS_TEXT.htmlOnly:ANALYSIS_TEXT.none),'muted')));
    note.textContent='';
  };
  h.add(sec,h.add(h.el('div',null,'buttons'),h.button('다시 읽기',load,'secondary')));
  return {sec,ready:load()};
}
// 기본 분석은 비서 결과와 상관없이 먼저 그린다.
export function renderSpendAnalysis(root,ctx){
  renderBasicAnalysis(root,ctx,ctx.analysis);
  return renderAssistantAnalysis(root,ctx);
}
