// 비서 결과 보기 (B47, V3 §8 결합 지점). 사령부 비서가 reports 폴더에 남긴 .md 보고를 PC 앱 안에서 읽기만 한다.
// 이 모듈은 아무것도 쓰지 않고 시계·난수·저장소·외부 통신을 쓰지 않는다. 읽기는 부른 쪽이 넘긴 request로만 하고, 폴더는 host가 고정한다(ai-gate-reader.mjs).
// 글은 textContent로만 넣는다: 마크다운을 HTML로 바꾸지 않고 링크·이미지를 만들지 않는다. .html 보고는 이름만 보여 주고 앱 안에서 열지 않는다.
// PC 앱(APP_SHELL)이 아니면 읽기 요청을 보내지 않고 안내 문구만 보인다.

export const AI_GATE_TEXT=Object.freeze({
  about:'사령부 비서가 남긴 최근 30일 보고 중 비서별 최신 1장입니다. 이 PC의 파일을 읽기만 합니다.',
  loading:'보고를 읽는 중입니다.',
  empty:'최근 30일 안의 보고가 아직 없습니다.',
  browser:'비서 보고는 PC 앱에서만 볼 수 있습니다.',
  REPORTS_DIR_MISSING:'사령부 보고서 폴더(AURUMAR_HQ\\reports)가 없습니다.',
  REPORTS_LOCKED:'잠금이 풀린 상태에서만 볼 수 있습니다.',
  REPORT_TOO_LARGE:'보고가 64KB를 넘어 앱에서 열지 않습니다.',
  REPORT_NOT_FOUND:'보고를 찾지 못했습니다. 다시 읽어 주세요.',
  fail:'보고를 읽지 못했습니다. 다시 시도해 주세요.',
});
const RESULT_CODES=Object.freeze(['REPORTS_DIR_MISSING','REPORTS_LOCKED','REPORT_TOO_LARGE','REPORT_NOT_FOUND']);
export const reportResultText=code=>code==='MD_UNLOCK_REQUIRED'?AI_GATE_TEXT.REPORTS_LOCKED:RESULT_CODES.includes(code)?AI_GATE_TEXT[code]:AI_GATE_TEXT.fail;

// 비서별 최신 보고 1장(.md만). 날짜가 같으면 이름 순으로 앞선 것. 결과는 최신 날짜부터, 같은 날짜는 비서 이름 순.
export function latestByAssistant(reports){
  const best=new Map();
  for(const r of Array.isArray(reports)?reports:[]){
    if(r?.kind!=='md'||typeof r.assistant!=='string'||typeof r.date!=='string')continue;
    const cur=best.get(r.assistant);
    if(!cur||r.date>cur.date||(r.date===cur.date&&r.name<cur.name))best.set(r.assistant,r);
  }
  return [...best.values()].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:a.assistant<b.assistant?-1:a.assistant>b.assistant?1:0);
}

// 줄 단위로만 나눈다. 제목은 # 표시를 떼고, 목록은 점으로, 표 줄은 고정폭으로 보여 줄 뿐 글자는 그대로다(태그·링크 문법은 해석하지 않는다).
export function reportBlocks(text){
  const out=[];
  for(const line of String(text??'').split('\n')){
    const head=/^#{1,6}\s+(.*)$/.exec(line),item=/^\s*[-*]\s+(.*)$/.exec(line);
    if(!line.trim())continue;
    if(head)out.push({kind:'head3',text:head[1]});
    else if(item)out.push({kind:'item',text:'• '+item[1]});
    else if(line.startsWith('|'))out.push({kind:'row',text:line});
    else out.push({kind:'line',text:line});
  }
  return out;
}
const BLOCK_TAG=Object.freeze({head3:'h3',item:'p',row:'p',line:'p'});
export const reportNodes=(h,text)=>reportBlocks(text).map(b=>h.el(BLOCK_TAG[b.kind],b.text,'ai-gate-'+b.kind));

export function reportCard(ctx,r,{title=r.assistant}={}){
  const {h}=ctx,gone=ctx.gone??(()=>false),card=h.el('article',null,'lb-card ai-gate-card');
  const head=h.add(h.el('div',null,'ai-gate-head'),h.add(h.el('div',null,'ai-gate-title'),h.el('strong',title),h.el('small',r.date)));
  h.add(card,head);
  if(r.tooLarge===true){h.add(card,h.el('p',AI_GATE_TEXT.REPORT_TOO_LARGE,'muted'));return card;}
  const msg=h.el('p','','muted'),body=h.el('div',null,'ai-gate-text');
  msg.setAttribute('role','status');
  let opened=false,busy=false;
  const toggle=h.button('열기',async()=>{
    if(busy)return;
    if(opened){opened=false;body.replaceChildren();toggle.textContent='열기';return;}
    busy=true;msg.textContent='';
    try{
      const res=await ctx.request({name:r.name});
      if(gone())return;
      // B63: 선택 훅. {head,node,tail}을 돌려주면 head 글 → node → tail 글 순서(파인더 링크 표 자리). 없거나 null이면 지금과 같다.
      let d=null;try{d=typeof ctx.decorate==='function'?ctx.decorate(r,res?.text):null;}catch{d=null;}
      body.replaceChildren(...(d?.node?[...reportNodes(h,d.head),d.node,...reportNodes(h,d.tail)]:reportNodes(h,res?.text)));opened=true;toggle.textContent='접기';
    }catch(e){if(!gone())msg.textContent=reportResultText(e?.code);}
    finally{busy=false;}
  },'secondary');
  h.add(head,toggle);h.add(card,msg,body);
  return card;
}
function htmlNames(h,items){
  return h.add(h.el('details',null,'ai-gate-html'),h.el('summary','HTML 보고 '+items.length+'개 · 이름만 보입니다(앱 안에서 열지 않습니다)'),h.add(h.el('ul',null,'ai-gate-names'),...items.map(r=>h.el('li',r.name))));
}

// ctx={h:{el,add,button},surface,request(body)=>Promise,gone()=>bool,decorate?(r,text)}. 돌려주는 ready는 목록을 다 읽으면 끝나는 Promise이고 절대 거부되지 않는다.
export function renderAssistants(root,ctx){
  const {h}=ctx,gone=ctx.gone??(()=>false),sec=h.add(h.el('section',null,'panel ai-gate'),h.el('h2','비서','panel-title'));
  h.add(root,sec);
  if(ctx.surface!=='APP_SHELL'){h.add(sec,h.el('p',AI_GATE_TEXT.browser,'muted'));return {sec,ready:Promise.resolve()};}
  const note=h.el('p',AI_GATE_TEXT.loading,'muted'),box=h.el('div',null,'ai-gate-list');
  note.setAttribute('role','status');
  h.add(sec,h.el('p',AI_GATE_TEXT.about,'muted'),note,box);
  const load=async()=>{
    note.textContent=AI_GATE_TEXT.loading;
    let res;
    try{res=await ctx.request({});}
    catch(e){if(!gone()){box.replaceChildren();note.textContent=reportResultText(e?.code);}return;}
    if(gone())return;
    const reports=Array.isArray(res?.reports)?res.reports:[],cards=latestByAssistant(reports),htmls=reports.filter(r=>r?.kind==='html');
    box.replaceChildren(...cards.map(r=>reportCard(ctx,r)),...(htmls.length?[htmlNames(h,htmls)]:[]));
    note.textContent=cards.length||htmls.length?'':AI_GATE_TEXT.empty;
  };
  h.add(sec,h.add(h.el('div',null,'buttons'),h.button('다시 읽기',load,'secondary')));
  return {sec,ready:load()};
}
