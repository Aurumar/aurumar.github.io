// 탑 탭 (B42): 2.5D 등각 SVG. 1층 = 1주(월~일), 맨 아래가 첫 주, 맨 위가 이번 주(공사 중). 합성 데이터로만 시험한다.
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 색은 SVG 속성(과목 색)과 styles.css 클래스.
// 읽기만 한다: 성취 엔진의 투영을 그릴 뿐 어떤 기록도 쓰지 않는다. 바텀시트는 ctx.sheet로 받는다(ui-kit이 app.mjs를 불러오므로 시험에서 이 파일만 따로 불러올 수 있게).
import {achieve,AREAS,multText} from './life-achieve.mjs';
import {kstDate} from './life-model.mjs';

export const TOWER_MAX_FLOORS=60;
export const BRIDGE_NOTICE='이번 주는 다리 위에 오래 있었어 · 수능 과목 1장부터 건너가 볼까';
export const EMPTY_TEXT='첫 벽돌을 쌓으면 1층이 올라가요';
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'});
const WEEKDAY=['월','화','수','목','금','토','일'];
const NS='http://www.w3.org/2000/svg';
// 등각 단위: 칸 하나의 x·y 이동 A·B, 벽돌 한 줄 높이 H, 층의 칸 수 COLS, 깊이 DEPTH.
const A=22,B=11,H=7,COLS=7,DEPTH=2,LEFT=74,VIEW_W=238,PAD_TOP=20,PAD_BOTTOM=6,SLAB=1,MIN_ROWS=3,MAX_ROWS=16,MAX_GEMS=3,MAX_WINDOWS=3;
const DRAW_MARGIN=4;

const dayHeight=d=>Math.min(MAX_ROWS,d.items.reduce((s,b)=>s+(b.half?0.5:1),0));
// 층마다 높이가 다르다: 그 주에 가장 높은 날에 맞춘다(최소 3줄, 최대 16줄). base = 그 층 바닥 높이(줄 단위).
export function towerLayout(weeks){
  let z=0;
  const floors=weeks.map(w=>{const rows=Math.max(MIN_ROWS,Math.ceil(Math.max(0,...w.days.map(dayHeight))));const f={week:w,base:z,rows};z+=rows+SLAB;return f;});
  const height=PAD_TOP+z*H+(COLS+DEPTH)*B+PAD_BOTTOM;
  return {floors,height,width:VIEW_W,ground:height-PAD_BOTTOM-(COLS+DEPTH)*B,totalRows:z};
}
// 화면 위쪽 y(뷰박스 단위) → 그 층의 범위. 층 k의 화면 범위 = 윗면 위 ~ 바닥 앞면 아래.
function floorSpan(layout,f){return {top:layout.ground-(f.base+f.rows+SLAB)*H,bottom:layout.ground+(COLS+DEPTH)*B-f.base*H};}
// 보이는 층을 포함하는 그리기 범위 [from,to). 전체가 60층 이하면 전부, 넘으면 보이는 곳 주변으로 최대 60층.
export function floorWindow(layout,{top=0,height=Infinity}={}){
  const total=layout.floors.length;
  if(total<=TOWER_MAX_FLOORS)return {from:0,to:total};
  let lo=total,hi=0;
  layout.floors.forEach((f,i)=>{const s=floorSpan(layout,f);if(s.bottom>=top&&s.top<=top+height){if(i<lo)lo=i;if(i+1>hi)hi=i+1;}});
  if(lo>=hi){lo=total-1;hi=total;}
  const extra=TOWER_MAX_FLOORS-Math.min(TOWER_MAX_FLOORS,hi-lo);
  let from=Math.max(0,lo-Math.floor(extra/2)),to=Math.min(total,from+Math.max(hi-lo,0)+extra);
  if(to-from>TOWER_MAX_FLOORS)to=from+TOWER_MAX_FLOORS;
  if(to===total)from=Math.max(0,total-TOWER_MAX_FLOORS);
  return {from,to};
}
const svgMaker=doc=>(tag,attrs={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const pointsOf=list=>list.map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' ');

function drawFloor(s,layout,f,onFloor){
  const w=f.week,topZ=f.base+SLAB;
  const at=(x,y,z)=>[LEFT+(x-y)*A,layout.ground+(x+y)*B-z*H];
  const poly=(pts,attrs)=>s('polygon',{points:pointsOf(pts),...attrs});
  const g=s('g',{class:'tower-floor'+(w.current?' tower-current':''),role:'button',tabindex:'0','data-week':w.monday,'aria-label':w.index+'층 '+w.monday+' 주 · 벽돌 '+w.value+'장 · 자세히 보기'});
  // 뒷벽(왼쪽 뒤·오른쪽 뒤)과 바닥판
  g.append(
    poly([at(0,0,topZ),at(COLS,0,topZ),at(COLS,0,topZ+f.rows),at(0,0,topZ+f.rows)],{class:'tower-wall'}),
    poly([at(0,0,topZ),at(0,DEPTH,topZ),at(0,DEPTH,topZ+f.rows),at(0,0,topZ+f.rows)],{class:'tower-wall tower-wall-side'}),
    poly([at(0,0,topZ),at(COLS,0,topZ),at(COLS,DEPTH,topZ),at(0,DEPTH,topZ)],{class:'tower-deck'}),
    poly([at(0,DEPTH,f.base),at(COLS,DEPTH,f.base),at(COLS,DEPTH,topZ),at(0,DEPTH,topZ)],{class:'tower-slab'}),
    poly([at(COLS,0,f.base),at(COLS,DEPTH,f.base),at(COLS,DEPTH,topZ),at(COLS,0,topZ)],{class:'tower-slab tower-slab-side'}),
  );
  // 칸(요일)별 벽돌: 왼쪽 칸부터 그려 오른쪽 칸이 앞에 오게 한다. 조각은 반 칸.
  w.days.forEach((d,i)=>{
    const y0=DEPTH-1,y1=DEPTH;let z=topZ,drawn=0;
    for(const b of d.items){
      const h=b.half?0.5:1;if(drawn+h>MAX_ROWS)break;
      const fill=b.gold?'url(#tower-gold)':b.color,cls='tower-brick'+(b.gold?' tower-brick-gold':'')+(b.half?' tower-brick-half':'');
      g.append(
        poly([at(i,y1,z),at(i+1,y1,z),at(i+1,y1,z+h),at(i,y1,z+h)],{class:cls,fill}),
        poly([at(i+1,y0,z),at(i+1,y1,z),at(i+1,y1,z+h),at(i+1,y0,z+h)],{class:cls+' tower-brick-side',fill}),
      );
      z+=h;drawn+=h;
    }
    if(drawn>0){
      const topFill=d.items[Math.max(0,d.items.length-1)];
      g.append(
        poly([at(i+1,y0,topZ),at(i+1,y1,topZ),at(i+1,y1,z),at(i+1,y0,z)],{class:'tower-shade'}),
        poly([at(i,y0,z),at(i+1,y0,z),at(i+1,y1,z),at(i,y1,z)],{class:'tower-brick tower-brick-top',fill:topFill.gold?'url(#tower-gold)':topFill.color}),
        poly([at(i,y0,z),at(i+1,y0,z),at(i+1,y1,z),at(i,y1,z)],{class:'tower-light'}),
      );
    }
    // 습관 완벽한 날: 그 칸 위에 금 띠
    if(d.perfect)g.append(poly([at(i,y1,z),at(i+1,y1,z),at(i+1,y1,z+0.45),at(i,y1,z+0.45)],{class:'tower-band'}));
    // 보석: 벽돌 사이의 작은 마름모
    for(let k=0;k<Math.min(MAX_GEMS,d.gems);k++){
      const [cx,cy]=at(i+0.5,y1,topZ+0.5+k*1.1);
      g.append(poly([[cx,cy-3],[cx+2.4,cy],[cx,cy+3],[cx-2.4,cy]],{class:'tower-gem'}));
    }
  });
  // 창문: 퀘스트 완료마다 오른쪽 앞 유리벽의 빛나는 사각형(뒷벽은 위층 바닥과 벽돌에 가려 보이지 않는다)
  g.append(poly([at(COLS,0,topZ),at(COLS,DEPTH,topZ),at(COLS,DEPTH,topZ+f.rows),at(COLS,0,topZ+f.rows)],{class:'tower-pane'}));
  for(let i=0;i<Math.min(MAX_WINDOWS,w.windows);i++){
    const y=0.15+i*0.62,z0=topZ+0.7;
    g.append(poly([at(COLS,y,z0),at(COLS,y+0.48,z0),at(COLS,y+0.48,z0+1.5),at(COLS,y,z0+1.5)],{class:'tower-window'}));
  }
  // 이번 주: 공사 중(비계 점선)
  if(w.current){
    const roof=topZ+f.rows;
    for(const [x,y] of [[0,DEPTH],[COLS,DEPTH],[COLS,0]]){const [x1,y1]=at(x,y,topZ),[x2,y2]=at(x,y,roof);g.append(s('line',{class:'tower-scaffold',x1,y1,x2,y2,'stroke-dasharray':'3 3'}));}
    const [ax,ay]=at(0,DEPTH,roof),[bx,by]=at(COLS,DEPTH,roof),[cx,cy]=at(COLS,0,roof);
    g.append(s('line',{class:'tower-scaffold',x1:ax,y1:ay,x2:bx,y2:by,'stroke-dasharray':'3 3'}),s('line',{class:'tower-scaffold',x1:bx,y1:by,x2:cx,y2:cy,'stroke-dasharray':'3 3'}));
  }
  const [lx,ly]=at(0,DEPTH,topZ);
  const label=s('text',{class:'tower-label',x:lx-5,y:ly});label.textContent=w.index+'층';g.append(label);
  if(onFloor){
    g.addEventListener('click',()=>onFloor(w));
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onFloor(w);}});
  }
  return g;
}
function drawRange(s,layout,group,{from,to},onFloor){
  const nodes=[];
  for(let i=from;i<to;i++)nodes.push(drawFloor(s,layout,layout.floors[i],onFloor));   // 아래층부터: 위층이 앞에 그려진다
  group.replaceChildren(...nodes);
  group.dataset.from=String(from);group.dataset.to=String(to);
}
// 탑 SVG. 돌려주는 값: {svg, redraw({top,height})} — 보이는 범위가 그린 범위를 벗어날 때만 다시 그린다.
export function buildTowerSvg(doc,weeks,{onFloor=null,view={}}={}){
  const s=svgMaker(doc),layout=towerLayout(weeks);
  const svg=s('svg',{class:'tower-svg',viewBox:'0 0 '+layout.width+' '+layout.height,width:'100%',role:'group','aria-label':'탑 '+weeks.length+'층'});
  const defs=s('defs'),grad=s('linearGradient',{id:'tower-gold',x1:'0',y1:'0',x2:'1',y2:'1'});
  grad.append(s('stop',{offset:'0%',class:'tower-gold-1'}),s('stop',{offset:'55%',class:'tower-gold-2'}),s('stop',{offset:'100%',class:'tower-gold-3'}));
  defs.append(grad);
  const group=s('g',{class:'tower-floors'});
  svg.append(defs,group);
  let drawn=floorWindow(layout,view);
  drawRange(s,layout,group,drawn,onFloor);
  const redraw=v=>{const next=floorWindow(layout,v);if(next.from===drawn.from&&next.to===drawn.to)return false;drawn=next;drawRange(s,layout,group,drawn,onFloor);return true;};
  return {svg,group,layout,redraw,drawn:()=>drawn};
}

function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  return {el,add};
}
const brickText=(bricks,pieces)=>bricks+'장'+(pieces?' + 조각 '+pieces:'');
// kit = ctx.kit(ui-kit의 bar 등). 없으면(시험에서 이 파일만 불러올 때) 예전 손수 만든 막대.
function progressBar(h,kit,value,max,aria){
  const made=kit?.bar?.(value,max,aria);if(made)return made;
  const bar=h.el('progress');bar.className='lb-xp-bar';bar.max=max>0?max:1;bar.value=Math.min(value,bar.max);bar.setAttribute('aria-label',aria);return bar;
}
function questRow(h,q,kit){
  const {el,add}=h,bar=progressBar(h,kit,q.value,q.target,q.label+' '+q.value+' / '+q.target);
  return add(el('div',null,'tower-quest'+(q.done?' done':'')),add(el('div',null,'lb-xp-head'),el('span',q.label+(q.done?' · 완료':'')),el('strong',q.value+' / '+q.target+q.unit)),bar,el('span','+'+q.xp+' XP · 창문 1개','muted small'));
}
// 층 상세 시트의 내용(그 주 벽돌 수·과목별·금벽돌·보석·창문·퀘스트).
export function floorDetail(doc,w,kit=null){
  const h=maker(doc),{el,add}=h,body=el('div',null,'tower-detail');
  add(body,add(el('div',null,'tower-stats'),stat(h,'벽돌',brickText(w.bricks,w.pieces)),stat(h,'금벽돌',w.gold),stat(h,'보석',w.gems),stat(h,'창문',w.windows),stat(h,'이 주 XP',w.xp)));
  const list=el('div',null,'tower-subjects');
  for(const x of w.subjects){
    const s=svgMaker(doc),dot=s('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'});dot.append(s('circle',{cx:5,cy:5,r:5,fill:x.color}));
    add(list,add(el('div',null,'tower-subject'),dot,el('span',x.name+(x.bridge?' · 징검다리':'')),el('strong',brickText(x.bricks,x.pieces))));
  }
  add(body,el('h3','과목별'),w.subjects.length?list:el('p','이 주에는 벽돌이 없습니다.','muted small'),el('h3','퀘스트'));
  for(const q of w.quests)add(body,questRow(h,q,kit));
  return body;
}
function stat(h,label,value){return h.add(h.el('div',null,'tower-stat'),h.el('span',label,'tower-stat-label'),h.el('strong',value,'tower-stat-value'));}

export function createTowerState(){return {scrollTop:0};}
export function renderTower(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add}=h;
  const whole=ctx.getWhole(),today=kstDate(ctx.now()),ach=achieve({life:whole.life??null,study:whole.study??null,today}),week=ach.currentWeek;
  const out=add(el('section',null,'panel life-tower-panel'),add(el('div',null,'tower-head'),el('span','LIFE TOWER','eyebrow'),el('h2','나의 탑','panel-title')));out.id='life-tower';
  add(out,add(el('div',null,'tower-stats'),
    stat(h,'이번 주 벽돌',week.value+' / '+week.brickTarget),stat(h,'금벽돌',week.gold),stat(h,'보석',week.gems),stat(h,'연속',ach.streak.days+'일 '+multText(ach.streak.mult10))));
  if(week.bridgeHeavy)add(out,el('p',BRIDGE_NOTICE,'notice tower-bridge'));
  if(!ach.hasRecords)add(out,el('p',EMPTY_TEXT,'tower-empty'));
  else{
    const open=w=>ctx.sheet?.(w.index+'층 · '+w.monday+' 주',floorDetail(doc,w,ctx.kit));
    const scroller=el('div',null,'tower-scroll');scroller.tabIndex=0;scroller.setAttribute('aria-label','탑 보기, 위아래로 움직입니다');
    const tower=buildTowerSvg(doc,ach.weeks,{onFloor:open,view:{top:st?.scrollTop??0,height:640}});
    add(scroller,tower.svg);
    scroller.addEventListener('scroll',()=>{
      if(st)st.scrollTop=scroller.scrollTop;
      const scale=(scroller.clientWidth||tower.layout.width)/tower.layout.width;
      tower.redraw({top:scroller.scrollTop/scale,height:(scroller.clientHeight||640)/scale});
    });
    const slot=el('div',null,'tower-3d-slot');slot.hidden=true;
    add(out,slot,scroller,el('p',WEEKDAY.join(' · ')+' 순서로 7칸 · 층을 누르면 그 주를 자세히 봅니다','muted small'));
    // 3D 탑(B44A): SVG를 먼저 그려 두고, WebGL2가 있으면 3D가 첫 장면을 그린 뒤에만 SVG를 숨긴다. 실패하면 SVG 그대로(같은 데이터).
    if(globalThis.WebGL2RenderingContext)import('./tower-3d.mjs').then(m=>{if(scroller.isConnected)m.mountTower3d({doc,slot,fallback:scroller,ach,st,onFloor:open});}).catch(()=>{slot.dataset.mode='svg';slot.dataset.reason='IMPORT_FAILED';});
  }
  const levels=el('div',null,'tower-levels');
  for(const a of AREAS){
    const l=ach.levels[a],bar=progressBar(h,ctx.kit,l.into,l.need,AREA_TEXT[a]+' 레벨 '+l.level+' '+l.into+' / '+l.need);
    add(levels,add(el('div',null,'tower-level tower-level-'+a.toLowerCase()),add(el('div',null,'lb-xp-head'),el('span',AREA_TEXT[a]),el('strong','Lv '+l.level)),bar,el('span',l.into+' / '+l.need+' XP','muted small')));
  }
  add(out,el('h3','영역 레벨'),levels,el('h3','이번 주 퀘스트'));
  for(const q of week.quests)add(out,questRow(h,q,ctx.kit));
  root.append(out);
  return out;
}
