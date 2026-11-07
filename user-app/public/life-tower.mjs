// 탑 탭 (B42): 2.5D 등각 SVG. 1층 = 1주(월~일), 맨 아래가 첫 주, 맨 위가 이번 주(공사 중). 합성 데이터로만 시험한다.
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 색은 SVG 속성(과목 색)과 styles.css 클래스.
// 읽기만 한다: 성취 엔진의 투영을 그릴 뿐 어떤 기록도 쓰지 않는다. 바텀시트는 ctx.sheet로 받는다(ui-kit이 app.mjs를 불러오므로 시험에서 이 파일만 따로 불러올 수 있게).
import {achieve,AREAS,multText,brickTotalText,weekBonusTotal} from './life-achieve.mjs';
import {kstDate,lifeDefs,dDay,shiftDay,MAX_EXAMS} from './life-model.mjs';

export const TOWER_MAX_FLOORS=60;
export const BRIDGE_NOTICE='이번 주는 다리 위에 오래 있었어 · 수능 과목 1장부터 건너가 볼까';
export const EMPTY_TEXT='첫 벽돌을 쌓으면 1층이 올라가요';
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'});
const WEEKDAY=['월','화','수','목','금','토','일'];
const NS='http://www.w3.org/2000/svg';
// 등각 단위: 칸 하나의 x·y 이동 A·B, 벽돌 한 줄 높이 H, 층의 칸 수 COLS, 깊이 DEPTH.
const A=22,B=11,H=7,COLS=7,DEPTH=2,LEFT=74,VIEW_W=238,PAD_TOP=20,PAD_BOTTOM=6,SLAB=1,MIN_ROWS=3,MAX_ROWS=16,MAX_GEMS=3,MAX_WINDOWS=3;
const DRAW_MARGIN=4,KST_HOUR_MS=9*3600*1000,LABEL_ON_BONUS=3;

// FIX49C: 작은 금빛 벽돌(일기 0.25·리뷰 0.5)도 무게만큼 그 칸 높이에 든다(층 높이 = 그 주 가장 높은 칸).
const dayHeight=d=>Math.min(MAX_ROWS,d.items.reduce((s,b)=>s+(b.half?0.5:1),0)+(d.small??[]).reduce((s,b)=>s+b.weight,0));
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
  // Q1B 금빛 기둥: 그 주 보너스 ✦를 층 왼쪽 칸에 쌓는다(진짜 벽돌·금벽돌과 섞이지 않게). 층 높이는 그대로: 1개 = 1줄, 줄보다 많으면 눌러 담는다. 요일 칸보다 먼저 그려 벽돌을 가리지 않는다.
  const bonus=weekBonusTotal(w);   // FIX49C: 일기 ✦도 같은 기둥
  for(let k=0,each=bonus<=f.rows?1:f.rows/bonus;k<bonus;k++){
    const z0=topZ+k*each,z1=z0+each;
    g.append(poly([at(-1,DEPTH,z0),at(0,DEPTH,z0),at(0,DEPTH,z1),at(-1,DEPTH,z1)],{class:'tower-bonus'}),poly([at(0,DEPTH-1,z0),at(0,DEPTH,z0),at(0,DEPTH,z1),at(0,DEPTH-1,z1)],{class:'tower-bonus tower-bonus-side'}));
    if(k===bonus-1)g.append(poly([at(-1,DEPTH-1,z1),at(0,DEPTH-1,z1),at(0,DEPTH,z1),at(-1,DEPTH,z1)],{class:'tower-bonus tower-bonus-top'}));
  }
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
    // FIX49C 작은 금빛 벽돌: 진짜 벽돌 위에 무게만큼 얇게. 색은 styles.css 클래스(진짜 벽돌·금벽돌과 다른 옅은 금색).
    let smallTop=false;
    for(const b of d.small??[]){
      const h=b.weight;if(drawn+h>MAX_ROWS)break;
      const cls='tower-brick tower-brick-small tower-brick-small-'+b.kind.toLowerCase();
      g.append(
        poly([at(i,y1,z),at(i+1,y1,z),at(i+1,y1,z+h),at(i,y1,z+h)],{class:cls}),
        poly([at(i+1,y0,z),at(i+1,y1,z),at(i+1,y1,z+h),at(i+1,y0,z+h)],{class:cls+' tower-brick-side'}),
      );
      z+=h;drawn+=h;smallTop=true;
    }
    if(drawn>0){
      const topFill=d.items[Math.max(0,d.items.length-1)],face=[at(i,y0,z),at(i+1,y0,z),at(i+1,y1,z),at(i,y1,z)];
      g.append(
        poly([at(i+1,y0,topZ),at(i+1,y1,topZ),at(i+1,y1,z),at(i+1,y0,z)],{class:'tower-shade'}),
        smallTop?poly(face,{class:'tower-brick tower-brick-top tower-brick-small'}):poly(face,{class:'tower-brick tower-brick-top',fill:topFill.gold?'url(#tower-gold)':topFill.color}),
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
  const label=s('text',{class:'tower-label'+(bonus?' tower-label-bonus':''),x:lx-5,y:bonus?ly-LABEL_ON_BONUS:ly});label.textContent=w.index+'층';g.append(label);   // Q1B: 기둥이 있는 층은 글자를 자기 기둥 면 위에 올린다(아래로 내리면 아래층 기둥과 헷갈린다)
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
// Q1B: 층 상세의 보너스 한 줄. 벽돌 수와 합치지 않는다. FIX49C: 일기 ✦(diary)가 있으면 합계와 '일기' 항목에 넣는다.
export const bonusText=(b,diary=0)=>{const total=(b?.total??0)+diary;return total?'보너스 ✦'+total+[['주간',b?.weekly],['월간',b?.month],['보스',b?.boss],['일기',diary]].filter(([,n])=>n).map(([t,n])=>' · '+t+' '+n).join(''):null;};
// kit = ctx.kit(ui-kit의 bar 등). 없으면(시험에서 이 파일만 불러올 때) 예전 손수 만든 막대.
function progressBar(h,kit,value,max,aria){
  const made=kit?.bar?.(value,max,aria);if(made)return made;
  const bar=h.el('progress');bar.className='lb-xp-bar';bar.max=max>0?max:1;bar.value=Math.min(value,bar.max);bar.setAttribute('aria-label',aria);return bar;
}
function questRow(h,q,kit,{reward='창문 1개',cls=''}={}){
  const {el,add}=h,bar=progressBar(h,kit,q.value,q.target,q.label+' '+q.value+' / '+q.target);
  return add(el('div',null,'tower-quest'+cls+(q.done?' done':'')),add(el('div',null,'lb-xp-head'),el('span',q.label+(q.done?' · 완료':'')),el('strong',q.value+' / '+q.target+q.unit)),bar,el('span','+'+q.xp+' XP · '+reward,'muted small'));
}
// 층 상세 시트의 내용(그 주 벽돌 수·과목별·금벽돌·보석·창문·퀘스트).
export function floorDetail(doc,w,kit=null){
  const h=maker(doc),{el,add}=h,body=el('div',null,'tower-detail');
  add(body,add(el('div',null,'tower-stats'),stat(h,'벽돌',brickText(w.bricks,w.pieces)),stat(h,'금벽돌',w.gold),stat(h,'보석',w.gems),stat(h,'창문',w.windows),stat(h,'이 주 XP',w.xp)));
  const bonus=bonusText(w.bonus,w.diary?.bonus??0);if(bonus)add(body,el('p',bonus,'tower-bonus-line'));
  const diary=w.diary&&(w.diary.days||w.diary.review)?w.diary:null;   // FIX49C
  if(diary)add(body,el('p',diaryWeekText(diary),'tower-diary-line'));
  const list=el('div',null,'tower-subjects');
  for(const x of w.subjects){
    const s=svgMaker(doc),dot=s('svg',{class:'life-dot',width:10,height:10,viewBox:'0 0 10 10','aria-hidden':'true'});dot.append(s('circle',{cx:5,cy:5,r:5,fill:x.color}));
    add(list,add(el('div',null,'tower-subject'),dot,el('span',x.name+(x.bridge?' · 징검다리':'')),el('strong',brickText(x.bricks,x.pieces))));
  }
  add(body,el('h3','과목별'),w.subjects.length?list:el('p','이 주에는 벽돌이 없습니다.','muted small'),el('h3','퀘스트'));
  for(const q of w.quests)add(body,questRow(h,q,kit));
  if(diary)add(body,diaryQuestRow(h,diary.quest,kit));
  return body;
}
// FIX49C: 일기 줄과 일기 퀘스트 칸(창문은 주간 퀘스트만 낸다. 일기 퀘스트는 ✦1).
export const diaryWeekText=d=>'일기 '+d.days+'일'+(d.review?' · 주간 리뷰':'')+' · 작은 벽돌 '+d.weight.toLocaleString('en-US')+'장';
const diaryQuestRow=(h,q,kit)=>questRow(h,q,kit,{reward:'✦1',cls:' tower-quest-diary'});
function stat(h,label,value){return h.add(h.el('div',null,'tower-stat'),h.el('span',label,'tower-stat-label'),h.el('strong',value,'tower-stat-value'));}

// ---------- 영역 칸의 링과 최근 성취 시트 (A1A, 설계 M1D §2.3) ----------
export const NO_RECENT='아직 이 영역 기록이 없어요';
// 링 좌표(SVG 속성). 다음 레벨까지 비율만큼 호가 찬다. need가 0 이하면 빈 링.
export function ringLayout(into,need,size=44){
  const stroke=5,r=(size-stroke)/2,c=2*Math.PI*r,part=need>0?Math.min(1,Math.max(0,into/need)):0;
  return {size,stroke,r,mid:size/2,part,dash:(c*part).toFixed(1)+' '+c.toFixed(1),percent:Math.round(part*100)};
}
function areaRing(doc,l,aria){
  const L=ringLayout(l.into,l.need),s=svgMaker(doc);
  const svg=s('svg',{class:'lb-ring tower-ring',width:L.size,height:L.size,viewBox:'0 0 '+L.size+' '+L.size,role:'img','aria-label':aria});
  const label=s('text',{class:'lb-ring-text tower-ring-text',x:L.mid,y:L.mid});label.textContent=L.percent+'%';
  svg.append(s('circle',{class:'lb-ring-track',cx:L.mid,cy:L.mid,r:L.r,'stroke-width':L.stroke}),s('circle',{class:'lb-ring-fill',cx:L.mid,cy:L.mid,r:L.r,'stroke-width':L.stroke,'stroke-dasharray':L.dash,transform:'rotate(-90 '+L.mid+' '+L.mid+')'}),label);
  return svg;
}
// 시트 내용: 그 영역의 최근 성취(ach.recent, 최대 5개). 없으면 안내 한 줄(0 XP를 성과처럼 꾸미지 않는다). 돈 시트에만 M1A 단계 한 줄과 돈 탭 단추.
export function areaSheetBody(doc,area,l,items,{moneyLine=null,openMoney=null}={}){
  const {el,add}=maker(doc),body=el('div',null,'tower-detail tower-area-sheet');
  add(body,el('p','Lv '+l.level+' · 다음 레벨까지 '+l.into+' / '+l.need+' XP','muted small'),el('h3','최근 성취'));
  if(items.length){const list=el('ul',null,'tower-area-recent');for(const it of items)add(list,el('li',it.date.slice(5)+' '+it.text));add(body,list);}
  else add(body,el('p',NO_RECENT,'muted'));
  if(area==='MONEY'){
    if(moneyLine)add(body,el('p',moneyLine,'tower-area-money'));
    if(openMoney){const go=el('button','돈 탭 열기','secondary');go.type='button';go.dataset.navOnly='1';go.addEventListener('click',openMoney);add(body,go);}
  }
  return body;
}
// 영역 시트 열기. 영역 칸과 3D 모퉁이 탑(T2C)이 함께 쓴다.
function openAreaSheet(doc,area,l,ach,ctx){
  let sheet=null;
  const body=areaSheetBody(doc,area,l,ach.recent?.[area]??[],{moneyLine:area==='MONEY'?ctx.moneyLine?.()??null:null,openMoney:ctx.openMoney?()=>{sheet?.close?.();ctx.openMoney();}:null});
  sheet=ctx.sheet?.(AREA_TEXT[area]+' · Lv '+l.level,body)??null;
}
// 영역 칸 하나에 링을 붙이고 칸 전체를 누를 수 있게 한다(Enter·Space도). 막대는 칸에 그대로 둔다.
// R36: SVG를 만들 수 없는 문서(createElementNS 없음, 예: Q1A 시험의 가짜 DOM)에서는 링 없이 칸만 둔다. 누르기·시트는 그대로.
function mountAreaTile(doc,tile,area,l,ach,ctx){
  if(typeof doc.createElementNS==='function')tile.append(areaRing(doc,l,AREA_TEXT[area]+' 레벨 '+l.level+' 진행 '+l.into+' / '+l.need));
  tile.setAttribute('role','button');tile.tabIndex=0;tile.setAttribute('aria-label',AREA_TEXT[area]+' Lv '+l.level+' · 최근 성취 보기');
  const open=()=>openAreaSheet(doc,area,l,ach,ctx);
  tile.addEventListener('click',open);
  tile.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
}

// ---------- T2B 나의 집 시즌: 시험 일정(EXAM_SCHEDULE, 없으면 기본값)의 구간. 투영만 하고 저장하지 않는다 ----------
// 시즌 k = 이전 시험이 든 주 다음 주 ~ 시험 k가 든 주(월~일). 첫 시즌은 첫 기록 주부터. 마지막 시즌(수능 e-csat, 없으면 날짜가 가장 늦은 시험) = 완공.
// 달성률 = 그 시즌 주들의 벽돌 값 합 / 주간 목표 합. 60% 이상 은, 90% 이상 금(기본 부품은 등급과 관계없이 붙는다). 보스 = 그 시즌 안에 시험일 카드가 있음.
// 3D(tower-3d-layout)는 이 결과를 받아 그리기만 한다. 2.5D 텍스트 줄과 같은 값을 쓰려고 여기 둔다(배치 파일은 import가 없어야 해서 날짜 계산을 못 가져간다).
export const HOUSE_END_ID='e-csat';
export const GRADE_TEXT=Object.freeze({BASE:'기본 장식',SILVER:'은 장식',GOLD:'금 장식'});
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const mondayOf=date=>shiftDay(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
export function seasonsOf(ach,exams){
  let list=(exams?.items??[]).filter(x=>x&&typeof x.date==='string'&&ISO_DATE.test(x.date)&&typeof x.name==='string').slice(0,MAX_EXAMS)
    .sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.id<b.id?-1:1);
  const end=list.findIndex(x=>x.id===HOUSE_END_ID);if(end>=0)list=list.slice(0,end+1);
  if(!ach?.weeks?.length||!list.length)return [];
  const weeks=ach.weeks,thisMonday=ach.currentWeek.monday,out=[];
  let from=weeks[0].monday;
  for(const x of list){
    const to=mondayOf(x.date);if(to<from)continue;   // 첫 기록 전의 시험·같은 주의 두 번째 시험은 시즌이 없다
    const idx=weeks.flatMap((w,i)=>w.monday>=from&&w.monday<=to?[i]:[]),value=idx.reduce((s,i)=>s+weeks[i].value,0),target=idx.reduce((s,i)=>s+weeks[i].brickTarget,0);
    const grade=target>0&&value*10>=target*9?'GOLD':target>0&&value*10>=target*6?'SILVER':'BASE',last=shiftDay(to,6);
    out.push({k:out.length,id:x.id,name:x.name,date:x.date,from,to,weeks:dDay(from,to)/7+1,floorFrom:idx.length?idx[0]:-1,floorTo:idx.length?idx.at(-1):-1,
      value,target,rate:target>0?value/target:0,grade,boss:ach.days.some(d=>d.boss&&d.date>=from&&d.date<=last),
      passed:ach.today>x.date,current:thisMonday>=from&&thisMonday<=to,weeksLeft:dDay(thisMonday,to)/7,dDay:dDay(ach.today,x.date)});
    from=shiftDay(to,7);
  }
  return out;
}
const dText=n=>n===0?'D-DAY':n>0?'D-'+n:'D+'+(-n);
// 2.5D·3D 공통 머리 문구. 일정이 없으면 null(기존 탑 + 기단만).
export function houseLine(ach,seasons){
  if(!seasons?.length)return null;
  const end=seasons.at(-1);
  if(end.passed){const built=ach.weeks.filter(w=>w.monday<=end.to);return '완공 '+end.date+' · '+built.length+'층 · '+brickTotalText(built);}   // FIX49C: 작은 벽돌 무게 포함(일기가 없으면 예전 글자 그대로)
  const cur=seasons.find(s=>s.current)??seasons.find(s=>!s.passed);
  return cur.name+' 시즌 공사 중 · '+(end.weeksLeft>0?'완공까지 '+end.weeksLeft+'주':'이번 주 완공')+' · 예상 약 '+(ach.weeks.length+end.weeksLeft)+'층 · '+end.name+' '+dText(end.dDay);
}
function seasonList(h,seasons){
  const {el,add}=h,box=add(el('details',null,'tower-seasons'),el('summary','시즌 청사진 · '+seasons.length+'시즌')),list=el('ol',null,'tower-season-list');
  for(const s of seasons){
    const state=s.passed?'완료 · 달성 '+Math.round(s.rate*100)+'% · '+GRADE_TEXT[s.grade]+(s.boss?' · 깃발':''):s.current?'공사 중 · 달성 '+Math.round(s.rate*100)+'%':dText(s.dDay);
    add(list,el('li',s.name+' · '+s.date+' · '+s.weeks+'주 · '+state,'tower-season'+(s.current?' current':'')+(s.passed?' passed':'')));
  }
  return add(box,list);
}

// ---------- T2C 집 장식(업적): 투영에서 계산하고 저장하지 않는다. 끊기면 사라지는 값은 쓰지 않는다(연속은 지금까지의 최고값) ----------
// 2.5D 대체 화면의 DOM 목록도 같은 값을 쓰려고 여기 둔다(배치 파일은 이 파일이 불러올 수 없다, seasonsOf와 같은 이유). 3D는 결과를 받아 그대로 놓기만 한다.
// title은 Q1C 칭호를 못 받았을 때(앱 시작 직후 등)만 현판에 쓰는 대체 문구다. 칭호 고르기와 전체 목록은 Q1C·Q1A 몫이다.
export const BADGE_RULES=Object.freeze({
  BRICKS:Object.freeze([[100,'WOOD','나무'],[300,'SILVER','은'],[1000,'GOLD','금'],[2000,'GEM','금 + 보석']]),
  STREAK:Object.freeze([[7,'WHITE','흰색'],[30,'BLUE','파랑'],[100,'GOLD','금색']]),
  GOLD:Object.freeze([[10,'동'],[50,'은'],[200,'금']]),
  AREA:Object.freeze([[5,'깃발'],[10,'금 테']]),
  DIARY:Object.freeze([[7,'촛불'],[30,'등불'],[100,'금 등불']]),   // FIX49C 집 등불: 최고 일기 연속(끊겨도 유지)
});
const BADGE_MAX_BOSS=12;
const reached=(rules,value)=>rules.filter(r=>value>=r[0]).length;
function houseTitle({bricks,areas,levels,done}){
  const guard=stage=>{const hit=AREAS.filter(a=>areas[a]>=stage).sort((a,b)=>levels[b].level-levels[a].level)[0];return hit?AREA_TEXT[hit]+' 수호자':null;};
  if(done)return '성주';
  if(bricks>=2000)return '마스터 빌더';
  if(bricks>=1000)return '건축가';
  return guard(2)??(bricks>=300?'석공':guard(1))??(bricks>=100?'벽돌공':bricks>=1?'견습 벽돌공':null);
}
export function houseBadges(ach,seasons=null){
  const bricks=ach.weeks.reduce((n,w)=>n+w.bricks,0),gold=ach.weeks.reduce((n,w)=>n+w.gold,0),streak=ach.days.reduce((n,d)=>Math.max(n,d.streak??0),0),boss=ach.days.filter(d=>d.boss).length,done=Boolean(seasons?.at(-1)?.passed);
  const areas=Object.fromEntries(AREAS.map(a=>[a,reached(BADGE_RULES.AREA,ach.levels[a]?.level??1)]));
  const row=(id,name,show,value,target)=>({id,name,show,value,target,done:value>=target});
  const diary=ach.diary?.best??0;
  const list=[row('first','첫 벽돌','기단 머릿돌',bricks,1),
    ...BADGE_RULES.BRICKS.map(([n,,t])=>row('bricks-'+n,'벽돌 '+n.toLocaleString('en-US')+'장','성문 현판 ('+t+')',bricks,n)),
    ...BADGE_RULES.STREAK.map(([n,,t])=>row('streak-'+n,'최고 연속 '+n+'일','옥상 깃발 ('+t+')',streak,n)),
    ...BADGE_RULES.GOLD.map(([n,t])=>row('gold-'+n,'금벽돌 '+n+'장','성문 문장 ('+t+')',gold,n)),
    ...AREAS.flatMap(a=>BADGE_RULES.AREA.map(([n,t])=>row(a+'-'+n,AREA_TEXT[a]+' Lv '+n,'모퉁이 탑 '+t,ach.levels[a]?.level??1,n))),
    row('boss','시험일 보스','꼭대기 시험 깃발 (최대 '+BADGE_MAX_BOSS+'개)',boss,1),row('done','완공','완공 현판',done?1:0,1),
    ...BADGE_RULES.DIARY.map(([n,t])=>row('diary-'+n,'최고 일기 연속 '+n+'일','성문 '+t,diary,n))];
  return {bricks,gold,streak,diary,lamp:reached(BADGE_RULES.DIARY,diary),cornerstone:bricks>=1,plaque:BADGE_RULES.BRICKS[reached(BADGE_RULES.BRICKS,bricks)-1]?.[1]??null,streakFlag:BADGE_RULES.STREAK[reached(BADGE_RULES.STREAK,streak)-1]?.[1]??null,crest:reached(BADGE_RULES.GOLD,gold),areas,boss:Math.min(BADGE_MAX_BOSS,boss),done,title:houseTitle({bricks,areas,levels:ach.levels,done}),list};
}
function badgeList(h,badges){
  const {el,add}=h,box=add(el('details',null,'tower-badges'),el('summary','집 장식 · 달성 '+badges.list.filter(r=>r.done).length+' / '+badges.list.length)),list=el('ul',null,'tower-badge-list');
  for(const r of badges.list)add(list,el('li',r.name+' · '+r.show+' · '+(r.done?'달성':r.value.toLocaleString('en-US')+' / '+r.target.toLocaleString('en-US')),'tower-badge'+(r.done?' done':'')));
  return add(box,list);
}

export function createTowerState(){return {scrollTop:0};}
export function renderTower(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add}=h;
  const whole=ctx.getWhole(),today=kstDate(ctx.now()),money=ctx.money?.(today)??null,ach=achieve({life:whole.life??null,study:whole.study??null,fin:whole.fin??null,today,money}),week=ach.currentWeek;
  const seasons=ach.hasRecords?seasonsOf(ach,lifeDefs(whole.life??null).exams):[],line=houseLine(ach,seasons);
  const title=ctx.achvTitle?.({doc,ach,life:whole.life??null,money,storage:ctx.storage});   // Q1C: 칭호 칩과 3D 깃발 색(앱이 넘긴다, 표시만)
  const out=add(el('section',null,'panel life-tower-panel'),add(el('div',null,'tower-head'),el('span','탑','eyebrow'),el('h2','나의 집','panel-title'),title?.node));out.id='life-tower';
  add(out,add(el('div',null,'tower-stats'),
    stat(h,'이번 주 벽돌',week.value+' / '+week.brickTarget),stat(h,'금벽돌',week.gold),stat(h,'보석',week.gems),stat(h,'연속',ach.streak.days+'일 '+multText(ach.streak.mult10))));
  if(line)add(out,el('p',line,'tower-house-line'));
  if(ach.hasRecords)add(out,el('p',brickTotalText(ach.weeks)+' · 보너스 ✦'+ach.bonusTotal.toLocaleString('en-US'),'tower-bonus-total muted small'));   // Q1B: 나란히만 보인다(합친 숫자 없음). FIX49C: 작은 벽돌 무게 포함
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
    if(seasons.length)add(out,seasonList(h,seasons));
    const badges=houseBadges(ach,seasons),openArea=a=>openAreaSheet(doc,a,ach.levels[a],ach,ctx);
    add(out,badgeList(h,badges));
    // 3D 탑(B44A): SVG를 먼저 그려 두고, WebGL2가 있으면 3D가 첫 장면을 그린 뒤에만 SVG를 숨긴다. 실패하면 SVG 그대로(같은 데이터).
    // T2A: 3D 하늘·해는 지금 KST 시각(시, 소수)으로 정한다. 배치 계산은 시계를 쓰지 않으므로 여기서 넘긴다. T2B: 시즌도 여기서 계산해 넘긴다.
    const kst=new Date(Date.parse(ctx.now())+KST_HOUR_MS),hour=kst.getUTCHours()+kst.getUTCMinutes()/60;
    if(globalThis.WebGL2RenderingContext)import('./tower-3d.mjs').then(m=>{if(scroller.isConnected)m.mountTower3d({doc,slot,fallback:scroller,titleTier:title?.tier??null,titleName:title?.node?.textContent||null,badges,onArea:openArea,ach,st,seasons,onFloor:open,hour});}).catch(()=>{slot.dataset.mode='svg';slot.dataset.reason='IMPORT_FAILED';});
  }
  const levels=el('div',null,'tower-levels');
  for(const a of AREAS){
    const l=ach.levels[a],bar=progressBar(h,ctx.kit,l.into,l.need,AREA_TEXT[a]+' 레벨 '+l.level+' '+l.into+' / '+l.need);
    const tile=add(el('div',null,'tower-level tower-level-'+a.toLowerCase()),add(el('div',null,'lb-xp-head'),el('span',AREA_TEXT[a]),el('strong','Lv '+l.level)),bar,el('span',l.into+' / '+l.need+' XP','muted small'));
    mountAreaTile(doc,tile,a,l,ach,ctx);   // A1A: 링을 붙이고 칸을 누르면 그 영역 최근 성취 시트
    add(levels,tile);
  }
  add(out,el('h3','영역 레벨'),levels,el('h3','이번 주 퀘스트'));
  for(const q of week.quests)add(out,questRow(h,q,ctx.kit));
  if(week.diary)add(out,diaryQuestRow(h,week.diary.quest,ctx.kit));   // FIX49C: 일기·리뷰 기록이 하나라도 있을 때만
  ctx.achvPanel?.(out,{doc,ach,today,life:whole.life??null,money,st,kit:ctx.kit,storage:ctx.storage,sheet:ctx.sheet,ctx});   // Q1A: 업적·칭호 패널 자리(앱이 넘긴다, 시험에서는 없음). Q1B: 시트·내 퀘스트 저장용 ctx
  root.append(out);
  return out;
}
