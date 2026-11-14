// 나만의 건물 수집 (V8W6 3). 저장하지 않는 순수 투영이다: 쌓인 실제 벽돌 수(성취 엔진 ach.weeks의 bricks 합, 탑 입구·집 장식과 같은 값)만 보고 계산한다.
// 새 기록 종류·쓰기·시계·난수·저장소·네트워크 없음. 기록을 고쳐 벽돌이 줄면 수집도 함께 줄어든다(이중 지급 없음).
// 기준 수(실제 벽돌 속도): 벽돌 1장 = 공부 30분(과목 100시간 = 200장, life-achv). 하루 목표 상한 16장(GOAL_MAX), 수험생 하루 4~6시간이면 8~12장.
// 하루 약 10장이면 오두막 3일 · 벽돌집 2주 · 2층집 6주 · 서재 탑 3달 · 저택 6~7달 · 성 약 13달(수능까지 한 해 안에 성).
// 모형은 코드로 만든 부품 목록이다(외부 자산 0): 3D(building-3d.mjs)와 2D 대체 그림·썸네일(buildingSvg)이 같은 목록을 그린다.
// 부품 = {k:'box'|'cyl'|'cone'|'pyr', x,y,z(가운데, y는 높이 가운데), w,h,d(box) 또는 r,h(cyl·cone·pyr), c(색 이름)}. 단위 1 = 벽돌 몇 장 크기의 작은 모형 단위.
export const BUILDINGS=Object.freeze([
  Object.freeze({id:'hut',no:1,name:'오두막',need:30,line:'처음 지은 작은 집'}),
  Object.freeze({id:'brick',no:2,name:'벽돌집',need:150,line:'벽돌로 단단히 올린 집'}),
  Object.freeze({id:'two',no:3,name:'2층집',need:400,line:'한 층을 더 올린 집'}),
  Object.freeze({id:'study',no:4,name:'서재 탑',need:1000,line:'책이 쌓이는 둥근 탑'}),
  Object.freeze({id:'manor',no:5,name:'저택',need:2000,line:'기둥과 날개를 단 저택'}),
  Object.freeze({id:'castle',no:6,name:'성',need:4000,line:'네 탑이 지키는 금빛 성'}),
]);
// 색 이름 → 3D 재질·2D 클래스. 금빛 디자인 언어(아이보리·샴페인·금, 진한 갈색·검정 없음). 창은 따뜻한 빛.
export const PART_COLORS=Object.freeze({ivory:'#FBF6EA',champagne:'#EFDDB0',gold:'#E8C45A',bright:'#F6DC8C',deep:'#E3BE4C',window:'#FFE9A8',stone:'#F1E8D6'});   // deep = --lb-gold-3(머스터드·황토 띠 밖)
export const METAL=Object.freeze({gold:true,bright:true,deep:true,champagne:true});

const box=(x,y,z,w,h,d,c)=>({k:'box',x,y,z,w,h,d,c});
const cyl=(x,y,z,r,h,c)=>({k:'cyl',x,y,z,r,h,c});
const cone=(x,y,z,r,h,c)=>({k:'cone',x,y,z,r,h,c});
const pyr=(x,y,z,r,h,c)=>({k:'pyr',x,y,z,r,h,c});   // 네모뿔 지붕(면이 벽과 나란하게 45° 돌린 4각뿔). r = 밑면 가운데→꼭짓점 거리
const at=(y0,h)=>y0+h/2;   // 바닥 높이 y0에서 높이 h인 부품의 가운데 y
const sq=w=>w/Math.SQRT2*1.0;   // 너비 w인 네모 지붕을 덮는 4각뿔 r(꼭짓점 거리 = 반 대각선)
// 앞면(+z)에 창 줄: n개를 너비 span 안에 고르게.
const windows=(n,span,y,z,c='window',w=0.36,h=0.5)=>Array.from({length:n},(_,i)=>box(-span/2+span*(i+0.5)/n,y,z,w,h,0.06,c));

function hut(){
  const W=2.4,D=2,H=1.5;
  return [box(0,at(0,0.2),0,W+0.4,0.2,D+0.4,'stone'),box(0,at(0.2,H),0,W,H,D,'ivory'),pyr(0,at(0.2+H,1.1),0,sq(W)+0.35,1.1,'gold'),
    box(0,at(0.2,0.95),D/2+0.03,0.55,0.95,0.06,'deep'),box(-0.75,at(0.2,0.55)+0.35,D/2+0.03,0.4,0.4,0.06,'window'),box(0.7,at(0.2+H,0.7),-0.3,0.3,0.9,0.3,'champagne')];
}
function brickHouse(){
  const W=3.2,D=2.4,H=2;
  return [box(0,at(0,0.25),0,W+0.5,0.25,D+0.5,'stone'),box(0,at(0.25,H),0,W,H,D,'champagne'),box(0,at(0.25+H,0.12),0,W+0.2,0.12,D+0.2,'gold'),
    pyr(0,at(0.37+H,1.3),0,sq(W)+0.45,1.3,'gold'),box(0,at(0.25,1.15),D/2+0.03,0.65,1.15,0.06,'deep'),
    ...windows(2,W*0.8,1.45,D/2+0.03).map(p=>p.x>0?{...p,x:p.x+0.25}:{...p,x:p.x-0.25}),box(0,at(0,0.12),D/2+0.45,1.1,0.12,0.5,'stone')];
}
function twoStory(){
  const W=3.4,D=2.6,H=1.8;
  return [box(0,at(0,0.25),0,W+0.6,0.25,D+0.6,'stone'),box(0,at(0.25,H),0,W,H,D,'ivory'),box(0,at(0.25+H,0.14),0.15,W+0.3,0.14,D+0.6,'gold'),
    box(0,at(0.39+H,H),0,W,H,D,'champagne'),box(0,at(0.39+2*H,0.12),0,W+0.2,0.12,D+0.2,'gold'),pyr(0,at(0.51+2*H,1.4),0,sq(W)+0.45,1.4,'gold'),
    box(0,at(0.25,1.1),D/2+0.03,0.65,1.1,0.06,'deep'),...windows(2,W*0.85,1.2,D/2+0.03).map(p=>({...p,x:p.x*1.15})),...windows(3,W*0.85,0.39+H+0.95,D/2+0.03),
    box(0,0.39+H+0.35,D/2+0.42,W*0.6,0.06,0.04,'bright')];
}
function studyTower(){
  const R=1.15,H=4.6;
  return [box(0,at(0,0.25),0,4.2,0.25,3.4,'stone'),cyl(0,at(0.25,H),0,R,H,'ivory'),...[1.2,2.4,3.6].map(y=>cyl(0,0.25+y,0,R+0.06,0.12,'gold')),
    cyl(0,at(0.25+H,0.18),0,R+0.25,0.18,'gold'),cone(0,at(0.43+H,1.8),0,R+0.3,1.8,'gold'),cyl(0,0.43+H+1.8+0.25,0,0.04,0.5,'bright'),
    ...[0.7,1.9,3.1,4.2].map(y=>box(0,0.25+y,R-0.02,0.34,0.6,0.08,'window')),
    box(1.75,at(0.25,1.5),0.2,1.4,1.5,1.6,'champagne'),pyr(1.75,at(1.75,0.8),0.2,sq(1.6)+0.2,0.8,'gold'),box(1.75,at(0.25,0.9),1.03,0.45,0.9,0.06,'deep')];
}
function manor(){
  const W=4,D=2.8,H=2.6;
  const cols=[-1.05,-0.35,0.35,1.05].map(x=>cyl(x,at(0.3,H-0.2),D/2+0.55,0.14,H-0.2,'bright'));
  return [box(0,at(0,0.3),0.2,8.6,0.3,D+1.4,'stone'),box(0,at(0.3,H),0,W,H,D,'ivory'),...[-1,1].map(s=>box(s*3,at(0.3,H*0.75),0,2,H*0.75,D*0.85,'champagne')),
    ...[-1,1].map(s=>pyr(s*3,at(0.3+H*0.75,0.9),0,sq(2.2)+0.2,0.9,'gold')),box(0,at(0.3+H,0.14),0,W+0.3,0.14,D+0.3,'gold'),pyr(0,at(0.44+H,1.5),0,sq(W)+0.5,1.5,'gold'),
    ...cols,box(0,at(0.3+H-0.2,0.2),D/2+0.55,2.6,0.2,0.4,'gold'),box(0,at(0.3,1.4),D/2+0.03,0.8,1.4,0.06,'deep'),
    ...windows(2,W*0.95,1.15,D/2+0.03).map(p=>({...p,x:p.x*1.25})),...windows(3,W*0.8,2.25,D/2+0.03),...[-1,1].flatMap(s=>windows(2,1.4,1.2,D*0.425+0.03).map(p=>({...p,x:p.x+s*3})))];
}
function castle(){
  const S=3.4,WH=1.6,TR=0.7,TH=3.2;
  const walls=[box(0,at(0.3,WH),S,2*S,WH,0.5,'champagne'),box(0,at(0.3,WH),-S,2*S,WH,0.5,'champagne'),box(S,at(0.3,WH),0,0.5,WH,2*S,'champagne'),box(-S,at(0.3,WH),0,0.5,WH,2*S,'champagne')];
  const towers=[[S,S],[-S,S],[S,-S],[-S,-S]].flatMap(([x,z])=>[cyl(x,at(0.3,TH),z,TR,TH,'ivory'),cyl(x,at(0.3+TH,0.16),z,TR+0.12,0.16,'gold'),cone(x,at(0.46+TH,1.3),z,TR+0.15,1.3,'gold'),box(x+0.12,0.46+TH+1.3+0.35,z,0.3,0.2,0.03,'bright')]);
  const merlons=[-2.4,-1.2,0,1.2,2.4].map(x=>box(x,0.3+WH+0.15,S,0.42,0.3,0.5,'gold'));
  return [box(0,at(0,0.3),0,2*S+2.4,0.3,2*S+2.4,'stone'),...walls,...merlons,...towers,
    box(0,at(0.3,4.2),-0.4,2.8,4.2,2.6,'ivory'),box(0,at(4.5,0.16),-0.4,3,0.16,2.8,'gold'),pyr(0,at(4.66,1.9),-0.4,sq(2.8)+0.4,1.9,'gold'),cyl(0,4.66+1.9+0.4,-0.4,0.04,0.8,'bright'),box(0.22,4.66+1.9+0.6,-0.4,0.42,0.26,0.03,'bright'),
    box(0,at(0.3,1.25),S+0.27,0.95,1.25,0.06,'deep'),...windows(3,2.2,2.6,0.92),...windows(2,1.6,3.6,0.92)];
}
const MODELS=Object.freeze({hut,brick:brickHouse,two:twoStory,study:studyTower,manor,castle});
export function buildingParts(id){const f=MODELS[id];return f?f():[];}
// 모형 크기(그림 맞추기용): 앞에서 본 좌우·높이, 바닥 원 반지름.
export function partsBounds(parts){
  let minX=Infinity,maxX=-Infinity,maxY=0,maxR=0;
  for(const p of parts){
    const hw=p.k==='box'?p.w/2:p.r,top=p.y+p.h/2;
    minX=Math.min(minX,p.x-hw);maxX=Math.max(maxX,p.x+hw);maxY=Math.max(maxY,top);
    maxR=Math.max(maxR,Math.hypot(Math.abs(p.x)+hw,Math.abs(p.z)+(p.k==='box'?p.d/2:p.r)));
  }
  return parts.length?{minX,maxX,height:maxY,radius:maxR}:{minX:-1,maxX:1,height:1,radius:1};
}

// 벽돌 수 → 수집 상태. done = 완성(수집됨), latest = 가장 최근 완성, next = 다음 목표(모두 완성이면 null).
export function bricksOf(ach){return (ach?.weeks??[]).reduce((n,w)=>n+(Number.isFinite(w?.bricks)?w.bricks:0),0);}
export function buildingsOf(bricks){
  const n=Number.isFinite(bricks)&&bricks>0?Math.floor(bricks):0;
  const list=BUILDINGS.map(b=>({...b,done:n>=b.need,left:Math.max(0,b.need-n)}));
  const done=list.filter(b=>b.done),next=list.find(b=>!b.done)??null,prevNeed=done.at(-1)?.need??0;
  return {bricks:n,list,count:done.length,total:list.length,latest:done.at(-1)??null,next,
    part:next?Math.max(0,Math.min(1,(n-prevNeed)/(next.need-prevNeed))):1};
}
export const nextBuildingText=s=>s.next?'다음 건물 · '+s.next.name+'까지 벽돌 '+s.next.left.toLocaleString('en-US')+'장':'모든 건물 완성 · '+s.total+' / '+s.total;
export const buildingStateText=b=>b.done?'완성 · 벽돌 '+b.need.toLocaleString('en-US')+'장':'벽돌 '+b.need.toLocaleString('en-US')+'장에 완성 · '+b.left.toLocaleString('en-US')+'장 남음';

// 2D 그림(3D 대체 화면·수집 썸네일): 앞에서 본 입면. 뒤(z 작은) 부품부터 그려 앞 부품이 위에 온다. 색은 styles.css 클래스(bd-c-색), 위치는 SVG 속성만(인라인 style 없음).
// 잠긴 건물은 locked 클래스(회색 빗금 + 점선 테, 색만으로 구분하지 않는다).
const NS='http://www.w3.org/2000/svg';
export function buildingSvg(doc,id,{locked=false,cls='bd-svg',label=null}={}){
  const parts=buildingParts(id),b=partsBounds(parts),pad=0.5,w=b.maxX-b.minX+2*pad,h=b.height+2*pad+0.4;
  const s=(tag,attrs={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const svg=s('svg',{class:cls+(locked?' locked':''),viewBox:(b.minX-pad).toFixed(2)+' '+(-b.height-pad).toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2),role:'img','aria-label':label??(BUILDINGS.find(x=>x.id===id)?.name??'건물')+(locked?' (아직 잠김)':'')});
  const f=v=>(+v).toFixed(2);
  svg.append(s('ellipse',{class:'bd-shadow',cx:0,cy:0.05,rx:f(b.radius*0.95),ry:f(0.35)}));
  for(const p of [...parts].sort((a,c)=>a.z-c.z)){
    const y0=-(p.y-p.h/2),y1=-(p.y+p.h/2),c='bd-part bd-c-'+p.c;
    if(p.k==='box'||p.k==='cyl'){const hw=p.k==='box'?p.w/2:p.r;svg.append(s('rect',{class:c+(p.k==='cyl'?' bd-round':''),x:f(p.x-hw),y:f(y1),width:f(2*hw),height:f(p.h),rx:p.k==='cyl'?f(Math.min(0.08,hw)):0}));}
    else{const hw=p.k==='pyr'?p.r*Math.SQRT1_2:p.r;svg.append(s('polygon',{class:c,points:[[p.x-hw,y0],[p.x+hw,y0],[p.x,y1]].map(([x,y])=>f(x)+','+f(y)).join(' ')}));}
  }
  return svg;
}
