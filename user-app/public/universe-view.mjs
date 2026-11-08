// 지식 우주 화면 (B49): "탑" 탭의 탑 ↔ 우주 전환, 2D(SVG) 우주, 별 상세 시트, 빈 상태. 3D는 universe-3d.mjs를 처음 우주를 열 때만 불러온다.
// 읽기만 한다: 이미 저장된 공부 카드의 오답을 기존 투영(projectStudy)으로 읽어 그릴 뿐 어떤 기록도 쓰지 않는다(새 엔티티·스키마 없음). 합성 데이터로만 시험한다.
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 색은 styles.css 클래스(과목 토큰), 토큰과 다른 과목 색(DS2 설정·영어 주황)은 SVG 속성. 별 상세에는 과목·오답 코드·itemRef·복습 예정일만 있고 메모(note)는 읽지도 보이지도 않는다.
import {projectStudy} from './study-projection.mjs';
import {layoutUniverse,universeColors,SUBJECT_INFO,SUBJECT_TOKEN_COLORS,STATE_TEXT,VIEW_2D,MAX_NODES} from './universe-layout.mjs';
import {kstDate,bookRefText} from './study-model.mjs';

export const EMPTY_TEXT='공부 기록에 오답을 남기면 여기에 별이 생겨요';
export const ERROR_TEXT='지식 우주를 계산하지 못했습니다(공부 기록 값 확인 필요).';
const NS='http://www.w3.org/2000/svg';
const svgMaker=doc=>(tag,attrs={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  return {el,add};
}
const isoOf=now=>now instanceof Date?now.toISOString():String(now);

// 저장된 공부 카드 → 우주 배치. 못 그리면 던진다(호출하는 쪽이 안내문으로 바꾼다). life = 저장된 LIFE 투영(과목 색, DS2). 없으면 기본색.
export function universeData(study,nowIso,life=null){
  const cards=(study?.days??[]).map(d=>d.data);
  return layoutUniverse({cards,proj:projectStudy(cards,kstDate(nowIso)),colors:universeColors((life?.subjects??[]).map(x=>x.data))});
}
// DS2: 색이 CSS 토큰과 같으면 .universe-subj-* 클래스, 다르면 universe-subj-custom(CSS 규칙 없음)을 붙이고 감싼 요소의 fill·stroke 속성으로 칠한다.
// (.universe-dot 등은 fill:var(--uni)라 --uni가 없으면 부모 값을 물려받는다. 인라인 style 없음.)
const tokenOf=(code,color)=>color===SUBJECT_TOKEN_COLORS[code];
const subjClass=(code,color)=>' universe-subj-'+(tokenOf(code,color)?code:'custom');
const paint=(code,color)=>tokenOf(code,color)?{}:{fill:color};

// 생물 오답은 코드 C 그대로 별자리에 있고, 이름만 생물로 보인다(D46 2.4, id = lf_bio_...). 시중 문제집 번호는 "시중 문제집 · 12쪽 3번"으로 읽는다.
const subjectName=n=>String(n.id).startsWith('lf_bio_')?'생물':SUBJECT_INFO[n.subject].name;
const refText=n=>{const b=bookRefText(n.itemRef);return b?'시중 문제집 · '+b:n.itemRef;};
// 별 하나의 상세 시트 내용: 과목·오답 코드·itemRef·복습 예정일·상태. (문제 내용·메모 필드는 모델에도 이 화면에도 없다.)
export function nodeSheetBody(doc,node){
  const {el,add}=maker(doc),body=el('div',null,'universe-detail');
  const rows=[['과목',subjectName(node)],['오답 코드',node.errorCode],['항목',refText(node)],['복습 예정일',node.due??'정해진 날짜 없음'],['상태',STATE_TEXT[node.state]]];
  for(const [label,value] of rows)add(body,add(el('div',null,'universe-row'),el('span',label,'tower-stat-label'),el('strong',value,'tower-stat-value')));
  return body;
}
const nodeLabel=n=>subjectName(n)+' '+n.errorCode+' '+refText(n)+' · '+STATE_TEXT[n.state];

// 2D 우주: 과목 6개 원 + 오답 점 + 같은 과목·같은 코드 링크. WebGL이 없거나 느릴 때의 대체이자 3D와 같은 데이터다.
export function buildUniverseSvg(doc,data,{onNode=null}={}){
  const s=svgMaker(doc);
  const svg=s('svg',{class:'universe-svg',viewBox:'0 0 '+VIEW_2D.width+' '+VIEW_2D.height,width:'100%',role:'group','aria-label':'지식 우주 별 '+data.nodes.length+'개'});
  const rings=s('g',{class:'universe-rings'}),links=s('g',{class:'universe-links'}),dots=s('g',{class:'universe-dots'});
  const colorOf=new Map(data.clusters.map(c=>[c.code,c.color]));
  for(const c of data.clusters){
    const ring=s('circle',{class:'universe-ring'+subjClass(c.code,c.color),cx:c.cx,cy:c.cy,r:c.r});
    if(tokenOf(c.code,c.color))rings.append(ring);else{const wrap=s('g',{stroke:c.color});wrap.append(ring);rings.append(wrap);}
    const label=s('text',{class:'universe-label',x:c.cx,y:c.cy+c.r+12,'text-anchor':'middle'});label.textContent=c.name+' '+c.count;rings.append(label);
  }
  for(const l of data.links){const a=data.nodes[l.a],b=data.nodes[l.b];links.append(s('line',{class:'universe-link',x1:a.px,y1:a.py,x2:b.px,y2:b.py}));}
  for(const n of data.nodes){
    const color=colorOf.get(n.subject);
    const g=s('g',{class:'universe-node'+subjClass(n.subject,color)+' universe-state-'+n.state,role:'button',tabindex:'0','data-id':n.id,'aria-label':nodeLabel(n),...paint(n.subject,color)});
    if(n.state==='glow')g.append(s('circle',{class:'universe-halo',cx:n.px,cy:n.py,r:n.pr*2.2}));
    g.append(s('circle',{class:'universe-dot',cx:n.px,cy:n.py,r:n.pr}));
    if(onNode){
      g.addEventListener('click',()=>onNode(n));
      g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNode(n);}});
    }
    dots.append(g);
  }
  svg.append(rings,links,dots);
  return svg;
}

function legend(h,data){
  const {el,add}=h,s=svgMaker(h.doc),list=el('ul',null,'universe-legend');
  for(const c of data.clusters){
    const dot=s('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true',...paint(c.code,c.color)});dot.append(s('circle',{class:'universe-legend-dot'+subjClass(c.code,c.color),cx:5,cy:5,r:5}));
    add(list,add(el('li',null,'universe-legend-item'),dot,el('span',c.name),el('strong',c.count+'개')));
  }
  return list;
}

// 우주 패널 한 개. 3D는 WebGL2가 있을 때만 첫 장면이 그려진 뒤 SVG를 대신한다. 실패하면 SVG 그대로.
function renderUniversePanel(ctx,state){
  const doc=ctx.document??globalThis.document,h={...maker(doc),doc},{el,add}=h;
  const out=add(el('section',null,'panel universe-panel'),add(el('div',null,'tower-head'),el('span','우주','eyebrow'),el('h2','지식 우주','panel-title')));
  let data;
  try{const whole=ctx.getWhole();data=universeData(whole.study??null,isoOf(ctx.now()),whole.life??null);}catch{data=null;}
  if(!data){add(out,el('p',ERROR_TEXT,'notice error universe-message'));return out;}
  if(data.empty){
    add(out,el('p',EMPTY_TEXT,'universe-empty'));
    if(ctx.openStudy){const b=el('button','공부 기록으로 가기','secondary');b.type='button';b.addEventListener('click',()=>ctx.openStudy());add(out,b);}
    return out;
  }
  const open=n=>ctx.sheet?.(subjectName(n)+' 오답 · '+n.errorCode,nodeSheetBody(doc,n));
  const summary='별 '+data.shown+'개 · 복습 늦음 '+data.counts.late+' · 기억함 '+data.counts.glow+' · 복습 예정 '+data.counts.due;
  add(out,el('p',summary,'universe-summary'));
  if(data.capped)add(out,el('p','최근 '+MAX_NODES+'개만 보여요(전체 '+data.total+'개)','notice universe-capped'));
  const slot=el('div',null,'universe-3d-slot');slot.hidden=true;
  const scroller=el('div',null,'universe-scroll');
  add(scroller,buildUniverseSvg(doc,data,{onNode:open}));
  add(out,slot,scroller,legend(h,data),el('p','붉은 테두리 = 복습 늦음 · 빛나는 별 = 기억함(졸업 포함) · 선 = 같은 과목의 같은 오답 코드','muted small'));
  if(globalThis.WebGL2RenderingContext)import('./universe-3d.mjs').then(m=>{if(scroller.isConnected)m.mountUniverse3d({doc,slot,fallback:scroller,data,onNode:open,st:state});}).catch(()=>{slot.dataset.mode='svg';slot.dataset.reason='IMPORT_FAILED';});
  return out;
}

// 탑 ↔ 우주 전환(단추 2개). root에는 전환줄과 우주 칸만 넣고, 탑 화면 요소는 sync()가 받아 숨기고 보인다.
// ctx = 탑 화면과 같은 ctx(getWhole·now·sheet·document) + openStudy(선택: 공부 기록 화면으로 가는 함수). st = 탭 상태 객체(모드·카메라를 기억).
export function createUniverse(root,ctx,st){
  const doc=ctx.document??globalThis.document,{el,add}=maker(doc),state=st.universe??={mode:'tower'};
  const host=el('div',null,'universe-host');host.hidden=true;
  const tabs=[['tower','탑'],['universe','우주']].map(([mode,text])=>{
    const b=el('button',text,'secondary');b.type='button';b.addEventListener('click',()=>{state.mode=mode;sync();});return [mode,b];
  });
  const bar=add(el('div',null,'segment lb-segment universe-switch'),...tabs.map(([,b])=>b));
  bar.setAttribute('role','group');bar.setAttribute('aria-label','탑과 지식 우주 전환');
  add(root,bar,host);
  let towerParts=[],built=false;
  function sync(parts){
    if(parts)towerParts=parts.filter(Boolean);
    const uni=state.mode==='universe';
    for(const [mode,b] of tabs){b.className=mode===state.mode?'selected':'secondary';b.setAttribute('aria-pressed',String(mode===state.mode));}
    host.hidden=!uni;
    for(const n of towerParts)n.hidden=uni;
    if(uni&&!built){built=true;host.replaceChildren(renderUniversePanel(ctx,state));}
  }
  return {sync,host,bar};
}
