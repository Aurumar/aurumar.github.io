// 공부방 장면 레이어 (S1B). 설계: AUTOPILOT\design\S1D_STUDY_LIVE_DESIGN.md §3·§6·§7·§8(S1B 줄). 새 기록 0·서버 쓰기 0·네트워크 0. 합성 데이터로만 시험한다.
// 오늘 누적 분이 방 단계(R0~R6)를 정하고, 오늘 벽돌 수만큼 책상 위 더미가 자란다. 아바타 오늘 효과 5겹(study-stage)은 바꾸지 않고 그 위·옆에 얹는다.
// 그림(av_sNN_*.webp)은 투명 채널이 없어 뒤 레이어가 보이지 않는다 → 물건은 앞 겹의 책상 띠(y 296~351)와 좌우 가장자리(x<36, x>204)에만, 넓은 화면은 좌우 날개에 둔다.
// 이 기기 저장소는 축하 중복 방지 칸 하나(lb.live.celebrated={startIso,n,gold})만 쓴다. 장면 자체는 저장하지 않고 언제나 카드 + 진행 중 세션에서 다시 구한다.
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음). 모양은 createElementNS SVG와 속성, 색·움직임은 styles.css 27절(설계의 §23b) 클래스.
import {AVATAR_ART_READY,artFile,cardMinutes,lifetimeMinutes,stageOf,todayEffectOf,hmText,countedSession,countedMinutes} from './study-stage.mjs';   // V6F: 담은(COMPLETED) 세션만
import {brickOf,sumBricks} from './life-model.mjs';
import {TODAY_EFFECTS} from './study-stage.mjs';   // AV5: 오늘 상태 6단계 표(효과 층 이름)
import {dailyCharOf} from './study-stage.mjs';   // V7A: STUDY LIVE 장면 이름표 = 오늘의 캐릭터
import {XP} from './life-achieve.mjs';

// ---- 방 단계 표: 소유자가 바꾸기 쉽게 여기 한 곳에만 둔다(STUDY_STAGES와 같은 방식). fromMin = 오늘 누적 분이 이 값 이상이면 그 단계. ----
// 큰 경계 120·240·360·480은 아바타 오늘 효과 경계와 같다(그림이 바뀌는 순간과 방이 바뀌는 순간이 겹친다). 매일 0에서 다시 시작한다.
export const ROOM_STAGES=Object.freeze([
  [0,'빈 책상',0],[25,'책 한 권·커피',1],[60,'책 더미·스탠드',3],[120,'촛불',5],[240,'책장 가득',7],[360,'밤하늘 별',7],[480,'풀 가동',7],
].map(([fromMin,label,books],no)=>Object.freeze({no,id:'R'+no,fromMin,label,books})));
export const PILE_MAX=16;            // 책상 위 벽돌 더미 칸(금벽돌은 금색, 조각은 반 칸)
export const WING_SPINES=24;         // 날개 책장 한 쪽의 책등 수(R4에서 가득)
export const SHELF_FULL_MIN=ROOM_STAGES[4].fromMin;
export const CELEBRATED_KEY='lb.live.celebrated';
export const BURST_MS=600,CHEER_MS=2400;
export const ROOM_VIEW=Object.freeze({w:240,h:351}),WING_VIEW=Object.freeze({w:120,h:351});
// 안전 구역(뷰박스 240×351 단위): 얼굴 구역에는 아무것도 두지 않는다. 물건(solid)은 책상 띠나 좌우 가장자리에만, 빛(glow)도 얼굴 구역과 겹치지 않는다. 후광 테두리(edge)는 선만.
export const SAFE=Object.freeze({face:Object.freeze([60,30,180,170]),deskY:296,edgeL:36,edgeR:204});

const okMin=m=>Number.isInteger(m)&&m>0&&m<=1440;
const minOf=v=>Number.isFinite(v)&&v>0?Math.floor(v):0;
export function roomStageOf(todayMin){
  const m=minOf(todayMin);let s=ROOM_STAGES[0];
  for(const r of ROOM_STAGES)if(m>=r.fromMin)s=r;
  return s;
}
// 책등 수 = min(오늘, 240)/240 비율(내림). 240분에서 24개(가득).
export const spinesOf=todayMin=>Math.floor(WING_SPINES*Math.min(minOf(todayMin),SHELF_FULL_MIN)/SHELF_FULL_MIN);

// 벽돌 더미 칸: 카드 세션을 끝 시각 순으로(성취 엔진과 같은 정렬), 세션마다 벽돌 n장 + 조각, 90분 이상 세션은 금색. 진행 중 세션 분(liveMin)은 맨 뒤.
// 칸 수 합 = sumBricks(카드 분) + brickOf(진행 중 분) → S1A liveState의 bricks.bricks + bricks.pieces와 같다.
export function pileOf(sessions=[],liveMin=null){
  const list=(sessions??[]).filter(s=>countedSession(s)&&okMin(s.confirmedMin)).map(s=>({min:s.confirmedMin,at:typeof s.at==='string'?s.at:'￿',id:String(s.id??'')}))
    .sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:a.id<b.id?-1:a.id>b.id?1:0);
  if(Number.isInteger(liveMin)&&liveMin>0)list.push({min:Math.min(1440,liveMin)});
  const items=[];
  for(const {min} of list){const b=brickOf(min),gold=min>=XP.GOLD_MINUTES;for(let k=0;k<b.bricks;k++)items.push({gold,half:false});if(b.pieces)items.push({gold,half:true});}
  return items;
}
export const pileCount=(sessions,liveMin=null)=>{const d=sumBricks(countedMinutes(sessions).filter(okMin)),o=Number.isInteger(liveMin)&&liveMin>0?brickOf(Math.min(1440,liveMin)):{bricks:0,pieces:0};return d.bricks+d.pieces+o.bricks+o.pieces;};

// 장면 모형(저장하지 않음). 같은 입력이면 같은 값 → 같은 DOM.
export function roomModel({todayMin=0,pile=[],effectLevel=null}={}){
  const stage=roomStageOf(todayMin),no=stage.no,items=(pile??[]).slice(0,PILE_MAX);
  return {stage,no,books:stage.books,cup:no>=1,lampOn:no>=2,flame:no>=3,corner:no>=4,band:no>=5,windowOn:no>=5,halo:no>=6,
    spines:spinesOf(todayMin),pile:items,more:Math.max(0,(pile??[]).length-PILE_MAX),fx:Number.isInteger(effectLevel)?effectLevel:todayEffectOf(todayMin).level};
}

// ---- 모양 데이터: 레이어별 [태그, 속성, 상자(x0,y0,x1,y1), 종류(solid|glow|edge)]. 상자는 안전 구역 시험이 쓴다. ----
const R=(cls,x,y,w,h,kind='solid',rx=0)=>['rect',{class:cls,x,y,width:w,height:h,...(rx?{rx}:{})},[x,y,x+w,y+h],kind];
const Ln=(cls,x1,y1,x2,y2,kind='solid')=>['line',{class:cls,x1,y1,x2,y2},[Math.min(x1,x2),Math.min(y1,y2),Math.max(x1,x2),Math.max(y1,y2)],kind];
const C=(cls,cx,cy,r,kind='solid')=>['circle',{class:cls,cx,cy,r},[cx-r,cy-r,cx+r,cy+r],kind];
const P=(cls,pts,kind='solid',close=true)=>{const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return ['path',{class:cls,d:'M'+pts.map(p=>p.join(' ')).join('L')+(close?'Z':'')},[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],kind];};
const BOOK_W=[46,40,44,38,45,41,43],BOOK_X=[4,8,5,9,4,7,6];
// 더미 칸 자리: 아래부터 6·5·3·2 = 16칸(피라미드). 칸 13×7, 반 칸은 너비 6.
const PILE_SLOTS=Object.freeze([[6,80,340],[5,87,332],[3,101,324],[2,108,316]].flatMap(([n,x,y])=>Array.from({length:n},(_,i)=>[x+i*14,y])));
// 금빛 입자 자리(얼굴 구역 밖). 상태 화면 클래스(st-particle)를 다시 쓴다.
const FX_DOTS=Object.freeze([[20,60],[30,124],[216,70],[226,140],[14,204],[224,196],[40,40],[204,24],[50,250],[190,258],[24,282],[214,284]]);
const STARS=Object.freeze([[24,36],[40,58],[58,34],[74,50],[92,40],[30,82],[52,96],[70,78],[86,104],[98,70],[22,110],[64,116]]);

export function frontShapes(m){
  const L={};
  L.desk=[R('room-desk-top',0,296,240,55,'solid'),R('room-desk-shade',0,296,240,4,'solid'),Ln('room-desk-edge'+(m.band?' gold':''),0,296,240,296,'solid')];
  L.note=[R('room-note-page',166,330,14,15),R('room-note-page',180,330,14,15),Ln('room-note-spine',180,330,180,345),Ln('room-pencil',168,326,192,320)];
  L.books=[];
  for(let i=0;i<m.books;i++){const y=340-i*6;L.books.push(R('room-book room-book-'+(i%4),BOOK_X[i],y,BOOK_W[i],6,'solid',1),Ln('room-book-spine',BOOK_X[i]+4,y+1,BOOK_X[i]+4,y+5));}
  L.cup=m.cup?[R('room-cup-body',56,328,14,16,'solid',2),P('room-cup-handle',[[70,332],[75,334],[75,339],[70,341]],'solid',false),P('room-steam',[[59,322],[62,316],[59,310],[62,304]],'glow',false),P('room-steam room-steam-2',[[66,322],[69,316],[66,310],[69,304]],'glow',false)]:[];
  L.lamp=[R('room-lamp-base',208,338,26,6,'solid',2),Ln('room-lamp-pole',221,240,221,338),Ln('room-lamp-arm',221,240,213,228),P('room-lamp-head'+(m.lampOn?' on':''),[[206,232],[212,218],[222,218],[228,232]])];
  if(m.lampOn)L.lamp.push(P('room-lamp-light',[[208,232],[226,232],[240,300],[176,300]],'glow'));
  L.bricks=m.pile.map((b,i)=>{const [x,y]=PILE_SLOTS[i];return R('room-brick'+(b.gold?' gold':'')+(b.half?' half':''),x,y,b.half?6:13,7,'solid',1);});
  L.flame=m.flame?[R('room-candle-dish',194,342,12,3,'solid',1),R('room-candle',197,324,6,18),Ln('room-candle-wick',200,320,200,324),P('room-flame-tip',[[200,308],[203,316],[200,321],[197,316]],'glow'),C('room-spark',196,302,1.2,'glow'),C('room-spark room-spark-2',204,299,1,'glow')]:[];
  L.corner=[];
  if(m.corner){L.corner.push(R('room-corner-frame',0,192,32,102),P('room-corner-boards',[[0,226],[32,226],[32,260],[0,260]],'solid',false));for(let i=0;i<8;i++)L.corner.push(R('room-corner-spine room-book-'+(i%4),2+(i%4)*7,(i<4?198:232)+(i%2)*3,6,24-(i%2)*3));}
  L.halo=m.halo?[R('room-halo-ring',3,3,234,345,'edge',10),R('room-halo-ring room-halo-inner',8,8,224,335,'edge',8),Ln('room-halo-desk',0,297,240,297,'solid')]:[];
  return L;
}
export function wingShapes(m,side){
  const shelf=[R('room-wing-frame',10,150,100,196,'solid',3),P('room-wing-boards',[[10,199],[110,199],[110,248],[10,248],[10,297],[110,297]],'solid',false)];
  for(let i=0;i<m.spines;i++){const row=Math.floor(i/6),col=i%6,h=[34,40,30,38,36,32][(col+row+(side==='r'?1:0))%6];shelf.push(R('room-wing-spine room-book-'+((col+row)%4),16+col*15,150+(row+1)*49-h-2,11,h,'solid',1));}
  const win=side==='l'&&m.windowOn?[R('room-window-pane',14,24,92,100,'solid',4),P('room-wing-mullion',[[60,24],[60,124],[60,74],[14,74],[106,74]],'solid',false),...STARS.map(([x,y],i)=>C('room-star room-star-'+(i%3),x,y,i%4===0?2:1.3,'glow'))]:[];
  return {shelf,win};
}

// ---- AV5 오늘 상태 효과 층: 평생 등급 기본 그림(av_sNN_base) 위에 얹는 SVG 하나. 그림은 바꾸지 않는다(같은 캐릭터·같은 옷). 뷰박스는 그림과 같은 240×351. ----
// 기준점 표 하나: 12등급 그림 공통 자리. head = 김·연기가 올라가기 시작하는 머리 위, headC·rx·ry = 머리 둘레(오라), brow = 이마 옆(땀), cheekL·R = 뺨(홍조),
// shoulderL·R = 어깨(불꽃은 그 뒤·바깥 배경 쪽), k = 효과 크기 배율. 그림 구도가 공통 자리와 맞지 않는 등급만 ANCHOR_FIX에 보정값을 둔다(AV5 확인: 12등급 전부를 헤드리스 캡처 시트로 눈으로 대조 → 3·12등급만 보정).
export const AVATAR_ANCHORS=Object.freeze({head:[134,20],headC:[134,58],rx:41,ry:56,brow:[175,64],cheekL:[113,94],cheekR:[154,94],shoulderL:[34,160],shoulderR:[206,160],k:1});
export const ANCHOR_FIX=Object.freeze({
  3:Object.freeze({head:[93,110],headC:[93,147],rx:32,ry:40,brow:[131,146],cheekL:[79,172],cheekR:[112,172],shoulderL:[42,214],shoulderR:[186,214],k:.8}),   // 3등급(몰입): 책상 앞 앉은 구도라 머리가 왼쪽 아래
  12:Object.freeze({head:[128,22],headC:[128,45],rx:28,ry:39,brow:[157,52],cheekL:[115,73],cheekR:[141,73],shoulderL:[68,114],shoulderR:[176,114],k:.7}),   // 12등급(의사 금빛): 전신 구도라 머리가 작고 높다
});
export const anchorsOf=grade=>({...AVATAR_ANCHORS,...(ANCHOR_FIX[grade]??{})});
// 단계 fx 목록 → 그릴 모양 [태그, 속성]. 같은 입력이면 같은 모양(시험이 비교한다). 색·움직임은 styles.css 32절 클래스만.
const n1=v=>Math.round(v*10)/10;
const drop=(cls,x,y,s)=>['path',{class:cls,d:'M'+n1(x)+' '+n1(y-6*s)+'Q'+n1(x+4*s)+' '+n1(y)+' '+n1(x)+' '+n1(y+3.5*s)+'Q'+n1(x-4*s)+' '+n1(y)+' '+n1(x)+' '+n1(y-6*s)+'Z'}];
const wisp=(cls,x,y,h,k)=>['path',{class:cls,d:'M'+n1(x)+' '+n1(y)+'q'+n1(-5*k)+' '+n1(-h/4)+' 0 '+n1(-h/2)+'t0 '+n1(-h/2)}];
const tongue=(cls,x,y,w,h)=>['path',{class:cls,d:'M'+n1(x-w/2)+' '+n1(y)+'Q'+n1(x-w/2)+' '+n1(y-h*.55)+' '+n1(x)+' '+n1(y-h)+'Q'+n1(x+w/2)+' '+n1(y-h*.55)+' '+n1(x+w/2)+' '+n1(y)+'Z'}];
// FIX65: 효과는 뷰박스 240×351 안에 남긴다(효과 층이 overflow:hidden이라 밖은 잘린다). 김·연기는 움직임(위로 8)·선 굵기·여유 4를 뺀 높이까지만 올라간다.
const FX_W=233,FX_PAD=4,FX_RISE=8;   // FX_W: 입자 중심 x 상한(가장 큰 입자 반지름 2.6 + 선 굵기가 236 안에 들어오게)
const clampN=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const lift=(y,h,hMin,sw)=>{const m=FX_RISE+sw+FX_PAD,o=Math.max(y,Math.min(h,hMin)+m);return [o,Math.min(h,o-m)];};   // [시작 y, 줄기 높이]
export const AVATAR_FX=Object.freeze({
  sweat:a=>[drop('av5-drop',a.brow[0],a.brow[1],1.6*a.k),drop('av5-drop av5-drop-2',a.brow[0]+3*a.k,a.brow[1]+17*a.k,1.1*a.k)],
  steam:a=>[-14,0,14].map((dx,i)=>{const [y,h]=lift(a.head[1]+(i===1?6:0)*a.k,30*a.k,18*a.k,1.3);return wisp('av5-steam av5-steam-'+i,a.head[0]+dx*a.k,y,h,a.k);}),
  smoke:a=>[...[-16,0,16].map((dx,i)=>{const [y,h]=lift(a.head[1]+(i===1?6:0)*a.k,34*a.k,20*a.k,2.25);return wisp('av5-smoke av5-smoke-'+i,a.head[0]+dx*a.k,y,h,1.4*a.k);}),...[[-9,8,7],[8,4,8],[0,-4,6]].map(([dx,dy,r],i)=>['circle',{class:'av5-puff av5-puff-'+i,cx:n1(a.head[0]+dx*a.k),cy:n1(Math.max(r*a.k+FX_RISE+FX_PAD,a.head[1]+dy*a.k)),r:n1(r*a.k)}])],
  blush:a=>[a.cheekL,a.cheekR].map(([x,y])=>['ellipse',{class:'av5-blush',cx:x,cy:y,rx:n1(8*a.k),ry:n1(3.6*a.k)}]),
  flame:a=>[[a.shoulderL,-1],[a.shoulderR,1]].flatMap(([[x,y],side])=>[[0,30,16],[side*12,22,12],[side*-11,18,10]].flatMap(([dx,h,w],i)=>{const cx=x+dx*a.k,base=y+4*a.k;return [tongue('av5-flame av5-flame-'+i,cx,base,w*a.k,h*1.6*a.k),tongue('av5-flame-core',cx,base,w*.45*a.k,h*.8*a.k)];})),
  aura:a=>{const [hx,hy0]=a.headC,[lx,ly]=a.shoulderL,[rx,ry]=a.shoulderR,neckY=hy0+a.ry*.9,
    shift=Math.max(0,Math.ceil((FX_PAD+4.5-(hy0-a.ry-7*a.k))*5)/10),hy=hy0+shift,ery=a.ry+7*a.k-shift,   // FIX65: 타원 위끝(선 굵기 4.5 포함)이 위에서 4 이상 안쪽이 되게 타원을 아래로 옮기고 아래끝은 그대로
    d='M'+n1(lx-10*a.k)+' 351V'+n1(ly+14*a.k)+'Q'+n1(lx-4*a.k)+' '+n1(ly-10*a.k)+' '+n1(lx+34*a.k)+' '+n1(ly-16*a.k)+'L'+n1(hx-a.rx*.7)+' '+n1(neckY)+'M'+n1(hx+a.rx*.7)+' '+n1(neckY)+'L'+n1(rx-34*a.k)+' '+n1(ry-16*a.k)+'Q'+n1(rx+4*a.k)+' '+n1(ry-10*a.k)+' '+n1(rx+10*a.k)+' '+n1(ry+14*a.k)+'V351';
    return [['ellipse',{class:'av5-aura av5-aura-wide',cx:hx,cy:n1(hy),rx:n1(a.rx+7*a.k),ry:n1(ery)}],['path',{class:'av5-aura av5-aura-wide',d}],['ellipse',{class:'av5-aura',cx:hx,cy:n1(hy),rx:n1(a.rx+7*a.k),ry:n1(ery)}],['path',{class:'av5-aura',d}]];},
  sparks:a=>[[-1.5,-.6],[1.5,-.5],[-1.35,.3],[1.4,.4],[-.8,-.85],[.9,-.8],[-2.4,1.6],[2.4,1.5],[-2.7,3.2],[2.7,3]].map(([fx,fy],i)=>['circle',{class:'av5-spark av5-spark-'+(i%3),cx:n1(clampN(a.headC[0]+fx*a.rx,240-FX_W,FX_W)),cy:n1(clampN(a.headC[1]+fy*a.ry,FX_PAD,351-FX_PAD)),r:n1((i%3===0?2.6:1.8)*a.k)}]),
});
export const AVATAR_FX_ORDER=Object.freeze(['aura','flame','smoke','steam','blush','sweat','sparks']);   // 그리는 순서(뒤 → 앞)
export function avatarFxShapes(level,grade=1){
  const e=TODAY_EFFECTS.find(x=>x.level===level)??TODAY_EFFECTS[0],a=anchorsOf(grade);
  return AVATAR_FX_ORDER.filter(k=>e.fx.includes(k)).map(k=>({kind:k,shapes:AVATAR_FX[k](a)}));
}
// 효과 층 SVG 하나. paint(level, grade)는 단계·등급이 바뀔 때만 자식을 다시 만든다. 움직임은 CSS(가벼운 steps 애니메이션, 움직임 줄이기면 멈춤).
export function avatarFxLayer(doc,{level=1,grade=1}={}){
  const {svg}=maker(doc),node=svg('svg',{class:'av5-fx',viewBox:'0 0 '+ROOM_VIEW.w+' '+ROOM_VIEW.h,preserveAspectRatio:'xMidYMid meet','aria-hidden':'true',focusable:'false'});
  let key=null;
  const paint=(lv,gr=grade)=>{
    const k=lv+'|'+gr;if(k===key)return;key=k;grade=gr;
    node.setAttribute('class','av5-fx av5-lv-'+lv);
    node.replaceChildren(...avatarFxShapes(lv,gr).map(g=>{const n=svg('g',{class:'av5-g av5-g-'+g.kind});n.append(...g.shapes.map(([tag,attrs])=>svg(tag,attrs)));return n;}));
  };
  paint(level,grade);
  return {node,paint};
}
// 작은 아바타 칸(미리보기 격자·상태 화면): 기본 그림 + 효과 층. 그림이 꺼져 있거나 못 불러오면 그림만 숨기고 효과 층은 남는다.
// V6F (MAN2 4): file = 그릴 그림(STUDY LIVE는 큰 그림과 같은 오늘의 캐릭터 dc_hNN). 없으면 예전처럼 평생 등급 기본 그림.
export function avatarStage(doc,{grade=1,level=1,useArt=false,cls='',file=null}={}){
  const {el}=maker(doc),stage=el('div',null,'room-stage av5-stage'+(cls?' '+cls:''));let fig=null;
  if(useArt){fig=el('img',null,'av5-fig live-fig');fig.alt='';fig.setAttribute('aria-hidden','true');fig.src=file??artFile(grade,'base');fig.addEventListener('error',()=>{fig.hidden=true;});stage.append(fig);}
  const fx=avatarFxLayer(doc,{level,grade});stage.append(fx.node);
  return {node:stage,fx,fig};
}

// ---- DS1 (설계 V5 §2.8 d·h): 금 벽돌 스프라이트 하나. 오늘 벽돌 칸(공부 벽돌 패널·덮개)과 무대 양옆 벽돌 기둥이 같이 쓴다. ----
// 금속 공식(styles.css --gold-metal: hi 0% · gold 38% · deep 72% · shadow 100%)을 SVG 띠 넷으로 그린다(그라데이션 id 없이 같은 입력 → 같은 DOM).
// 못 쌓은 칸 = 아이보리 음각 + 0.5px 금선. fill = 0~1(조각 0.5는 반 칸). 색은 styles.css 30절 클래스만.
export const PILLAR_CELLS=8;          // 기둥 한 쪽 칸 수(양쪽 16 = 더미 칸 상한 PILE_MAX와 같다)
const r2=v=>Math.round(v*100)/100;
const fillOf=v=>Number.isFinite(v)?Math.min(1,Math.max(0,v)):0;
export function brickSprite(svg,x,y,w,h,fill){
  const f=fillOf(fill),g=svg('g',{class:'lb-brick '+(f>=1?'is-full':f>0?'is-part':'is-empty')});
  g.append(svg('rect',{class:'lb-brick-well',x,y,width:w,height:h,rx:1}),svg('line',{class:'lb-brick-groove',x1:r2(x+.75),y1:r2(y+.75),x2:r2(x+w-.75),y2:r2(y+.75)}));
  if(f>0){
    const fw=r2(w*f);
    g.append(svg('rect',{class:'lb-brick-gold',x,y,width:fw,height:h,rx:1}),svg('rect',{class:'lb-brick-deep',x,y:r2(y+h*.62),width:fw,height:r2(h*.38)}),
      svg('line',{class:'lb-brick-hi',x1:r2(x+.5),y1:r2(y+.5),x2:r2(x+Math.max(.5,fw-.5)),y2:r2(y+.5)}),svg('line',{class:'lb-brick-shadow',x1:x,y1:r2(y+h-.5),x2:r2(x+fw),y2:r2(y+h-.5)}));
  }
  return g;
}
// 오늘 벽돌 칸: 칸 수 = max(목표, 쌓은 값 올림), 1~max. 칸 i의 채움 = 값 − i(0~1). value = 벽돌 + 조각×0.5(liveState·sumBricks의 value와 같다).
export function brickCellsOf(value,goal,max=16){
  const v=Number.isFinite(value)&&value>0?value:0,gl=Number.isInteger(goal)&&goal>0?goal:0,n=Math.min(max,Math.max(1,gl,Math.ceil(v)));
  return Array.from({length:n},(_,i)=>fillOf(v-i));
}
export function brickCells(doc,{value=0,goal=null,max=16,cls=''}={}){
  const {svg}=maker(doc),cells=brickCellsOf(value,goal,max),W=14,H=8,G=3;
  const n=svg('svg',{class:'lb-brick-row'+(cls?' '+cls:''),viewBox:'0 0 '+(cells.length*(W+G)-G)+' '+H,width:cells.length*(W+G)-G,height:H,'aria-hidden':'true',focusable:'false'});
  cells.forEach((f,i)=>n.append(brickSprite(svg,i*(W+G),0,W,H,f)));
  return n;
}
// 무대 양옆 벽돌 기둥(넓은 화면 날개 안, 무대 쪽 가장자리): 오늘 더미 칸을 왼쪽·오른쪽 번갈아 아래부터 채운다. 조각은 반 칸.
export function pillarCells(pile,side){
  const mine=(pile??[]).filter((_,i)=>i%2===(side==='l'?0:1)).slice(0,PILLAR_CELLS);
  return Array.from({length:PILLAR_CELLS},(_,k)=>mine[k]?(mine[k].half?.5:1):0);
}
function pillarNodes(svg,pile,side){
  const x=side==='l'?111:1,W=8,H=20,G=3,bottom=346;
  return pillarCells(pile,side).map((f,k)=>brickSprite(svg,x,bottom-(k+1)*H-k*G,W,H,f));
}

// ---- 축하 중복 방지: 이 세션(startIso)에서 이미 축하한 벽돌 수·금벽돌. 다시 열거나 다른 탭에서 열어도 같은 벽돌을 다시 축하하지 않는다. ----
// 화면이 꺼져 있던 동안 넘긴 벽돌은 돌아왔을 때 한 번에 묶어 1번. 반환 null = 축하할 것 없음.
// FIX37C (H37-S5): 저장소에 쓰지 못한 값은 이번 실행 동안 메모리에 둔다(저장소가 막혀도 같은 벽돌을 매초 다시 축하하지 않게). 쓰기가 되면 지운다.
const unsaved=new WeakMap();
export function celebrateDue(storage,startIso,bricks,gold){
  if(typeof startIso!=='string'||!Number.isInteger(bricks)||bricks<0)return null;
  let rec=storage?unsaved.get(storage)??null:null;
  if(!rec)try{rec=JSON.parse(storage?.getItem(CELEBRATED_KEY)??'null');}catch{rec=null;}
  const prev=rec?.startIso===startIso&&Number.isInteger(rec.n)&&rec.n>=0?{n:rec.n,gold:rec.gold===true}:{n:0,gold:false};
  const add=Math.max(0,bricks-prev.n),newGold=Boolean(gold)&&!prev.gold;
  if(!add&&!newGold)return null;
  const next={startIso,n:Math.max(bricks,prev.n),gold:prev.gold||Boolean(gold)};
  try{storage?.setItem(CELEBRATED_KEY,JSON.stringify(next));if(storage)unsaved.delete(storage);}catch{unsaved.set(storage,next);/* 저장소가 막혀도 축하는 한다 */}
  return {bricks:add,gold:newGold};
}
export const cheerText=c=>c.gold?'금벽돌 완성 · XP ×'+XP.GOLD_MULT:c.bricks>1?'벽돌 '+c.bricks+'장이 쌓였어요':'벽돌 1장 완성';
export const reducedMotion=win=>{try{return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);}catch{return false;}};

// ---- 화면 ----
const SVG_NS='http://www.w3.org/2000/svg';
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const svg=(tag,attrs={})=>{const n=doc.createElementNS?doc.createElementNS(SVG_NS,tag):doc.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  return {el,svg};
}
const fxClass=lv=>' st-lv-'+lv+(lv>=2?' st-glint':'')+(lv>=3?' st-particles':'')+(lv>=4?' st-aura-on':'')+(lv>=5?' st-full':'');
const roomClass=(m,extra='')=>'room room-r'+m.no+fxClass(m.fx)+extra;
const FRONT_LAYERS=['desk','note','books','cup','lamp','bricks','flame','corner','halo'];
const LAYER_CLASS={desk:'room-desk',note:'room-note',books:'room-books',cup:'room-cup',lamp:'room-lamp',bricks:'room-bricks',flame:'room-flame',corner:'room-shelf-corner',halo:'room-halo'};

// 장면 하나. stage = 그림이 들어 있는(또는 들어갈) div.room-stage. 반환 {node(.room), paint(model, opts), celebrate(c), stop()}.
// paint는 단계·벽돌·책등·효과가 바뀐 레이어만 자식을 다시 만든다(매초 부르면 바뀐 것이 없으니 아무것도 하지 않는다).
// AV5: props=false = 책상·소품·날개·옛 입자 없이 축하(글자·불꽃)만 하는 장면(STUDY LIVE). 아바타 효과는 avatarFxLayer가 따로 얹는다.
const NO_PROPS=Object.freeze(Object.fromEntries(FRONT_LAYERS.map(k=>[k,[]])));
export function roomScene(doc,{stage=null,wings=true,props=true,label='공부방',win=null,setT=globalThis.setTimeout,clearT=globalThis.clearTimeout}={}){
  const {el,svg}=maker(doc),motion=()=>!reducedMotion(win??doc?.defaultView??null);
  if(!props)wings=false;
  const stageNode=stage??el('div',null,'room-stage');
  const front=svg('svg',{class:'room-front',viewBox:'0 0 '+ROOM_VIEW.w+' '+ROOM_VIEW.h,preserveAspectRatio:'xMidYMid meet','aria-hidden':'true',focusable:'false'});
  const fx=props?svg('svg',{class:'st-fx st-fx-front room-fx',viewBox:'0 0 '+ROOM_VIEW.w+' '+ROOM_VIEW.h,preserveAspectRatio:'xMidYMid meet','aria-hidden':'true',focusable:'false'}):null;
  if(fx)FX_DOTS.forEach(([cx,cy],i)=>fx.append(svg('circle',{class:'st-particle st-particle-'+(i%4),cx,cy,r:i%3===0?2.4:1.6})));
  const groups={};
  if(props)for(const k of FRONT_LAYERS){groups[k]=svg('g',{class:LAYER_CLASS[k]});front.append(groups[k]);}
  const burst=svg('g',{class:'room-burst'});front.append(burst);
  stageNode.append(...[fx,front].filter(Boolean));
  const node=el('div',null,'room');node.setAttribute('role','img');
  const wingL=wings?svg('svg',{class:'room-wing room-wing-l',viewBox:'0 0 '+WING_VIEW.w+' '+WING_VIEW.h,preserveAspectRatio:'xMidYMax meet','aria-hidden':'true',focusable:'false'}):null;
  const wingR=wings?svg('svg',{class:'room-wing room-wing-r',viewBox:'0 0 '+WING_VIEW.w+' '+WING_VIEW.h,preserveAspectRatio:'xMidYMax meet','aria-hidden':'true',focusable:'false'}):null;
  const wg={};
  if(wings){for(const [side,host] of [['l',wingL],['r',wingR]]){wg[side+'win']=svg('g',{class:'room-wing-window'});wg[side+'shelf']=svg('g',{class:'room-wing-shelf'});wg[side+'pillar']=svg('g',{class:'room-wing-pillar'});host.append(wg[side+'win'],wg[side+'shelf'],wg[side+'pillar']);}}
  const cheer=el('p',null,'room-cheer');cheer.setAttribute('aria-live','polite');cheer.hidden=true;
  node.append(...[wingL,stageNode,wingR,cheer].filter(Boolean));
  const make=([tag,attrs])=>svg(tag,attrs);
  let last=null,timers=[];
  const later=(fn,ms)=>{const id=setT?.(()=>{timers=timers.filter(t=>t!==id);fn();},ms);id?.unref?.();timers.push(id);return id;};
  function paint(m,{fresh=null}={}){
    const keys={desk:String(m.band),note:'1',books:String(m.books),cup:String(m.cup),lamp:String(m.lampOn),bricks:m.pile.map(b=>(b.gold?'g':'b')+(b.half?'h':'')).join('|'),flame:String(m.flame),corner:String(m.corner),halo:String(m.halo)};
    const shapes=props?frontShapes(m):NO_PROPS,animate=last!==null&&motion();
    for(const k of FRONT_LAYERS){
      if(!props||last&&last.keys[k]===keys[k])continue;
      const kids=shapes[k].map(make);
      // 새로 생긴 것만 움직인다: 벽돌은 더미 위로 내려앉고(room-new, 조각이 벽돌·금벽돌로 바뀐 칸 포함), 단계가 올라 생긴 물건은 0.6초 동안 나타난다. 움직임 줄이기면 표시 없이 결과만.
      if(animate)for(let i=0;i<kids.length;i++){const fresh=k==='bricks'?keys.bricks.split('|')[i]!==last.keys.bricks.split('|')[i]:i>=(last.counts[k]??0);if(fresh)kids[i].setAttribute('class',kids[i].getAttribute('class')+' room-new');}
      groups[k].setAttribute('class',LAYER_CLASS[k]+(shapes[k].length?'':' off'));
      groups[k].replaceChildren(...kids);
    }
    if(wings&&(!last||last.spines!==m.spines||last.windowOn!==m.windowOn)){
      for(const side of ['l','r']){const w=wingShapes(m,side);wg[side+'shelf'].replaceChildren(...w.shelf.map(make));wg[side+'win'].replaceChildren(...w.win.map(make));}
    }
    if(wings&&(!last||last.keys.bricks!==keys.bricks))for(const side of ['l','r'])wg[side+'pillar'].replaceChildren(...pillarNodes(svg,m.pile,side));   // DS1: 벽돌 기둥은 더미가 바뀔 때만
    node.className=props?roomClass(m,wings?' room-wide':''):'room room-plain';
    const fxNow=TODAY_EFFECTS.find(e=>e.level===m.fx)??TODAY_EFFECTS[0];
    const dc=Number.isFinite(m.liveMin)?dailyCharOf(m.liveMin):null;   // V7A: STUDY LIVE(liveRoom)는 "오늘 상태" 대신 오늘의 캐릭터 이름을 읽어 준다
    node.setAttribute('aria-label',props?label+' '+m.stage.id+' '+m.stage.label+' · 벽돌 더미 '+m.pile.length+'칸'+(m.more?' (+'+m.more+')':''):dc?label+' · 오늘의 캐릭터 '+dc.h+'h '+dc.label:label+' · 오늘 상태 '+fxNow.level+'단계 '+fxNow.label);
    last={keys,counts:Object.fromEntries(FRONT_LAYERS.map(k=>[k,shapes[k].length])),spines:m.spines,windowOn:m.windowOn,no:m.no};
    if(fresh)celebrate(fresh);
  }
  // 축하: 글자는 늘 보이고(움직임 줄이기에서도), 불꽃 12개는 움직임을 허용할 때만 0.6초 뒤 지운다.
  function celebrate(c){
    stop();   // 앞 축하의 지우기 타이머가 새 글자를 일찍 지우지 않게
    cheer.textContent=cheerText(c);cheer.hidden=false;cheer.className='room-cheer'+(c.gold?' gold':'');
    later(()=>{cheer.hidden=true;cheer.textContent='';},CHEER_MS);
    if(!motion()){burst.replaceChildren();return;}
    const sparks=[];
    for(let i=0;i<12;i++){const a=i*Math.PI/6,cx=122,cy=314,r0=4,r1=c.gold?11:9;sparks.push(svg('line',{class:'room-spark-ray'+(c.gold?' gold':'')+' room-ray-'+(i%3),x1:+(cx+r0*Math.cos(a)).toFixed(2),y1:+(cy+r0*Math.sin(a)).toFixed(2),x2:+(cx+r1*Math.cos(a)).toFixed(2),y2:+(cy+r1*Math.sin(a)).toFixed(2)}));}
    burst.replaceChildren(...sparks);
    later(()=>burst.replaceChildren(),BURST_MS);
  }
  function stop(){for(const id of timers)clearT?.(id);timers=[];}
  return {node,stage:stageNode,front,paint,celebrate,stop,last:()=>last};
}

// ---- STUDY LIVE 덮개에 붙이기(S1A가 부른다). S1A liveState 모양({clock,todayMin,…,roomInputs,session})을 그대로 읽기만 한다. ----
// card = 오늘 카드(초안 우선, liveState와 같은 규칙). 진행 중 세션의 분은 매 째깍 clock.studyMs에서 다시 구한다.
const cardOf=(study,date,draftCard)=>draftCard&&draftCard.date===date?draftCard:[...(study?.days??[])].reverse().find(d=>d?.date===date)?.data??null;
// AV5: props=false면 책상·소품·날개 없이 벽돌 축하만(STUDY LIVE가 이렇게 부른다).
export function liveRoom(ctx,{stage,state,timer,draftCard=null,props=true}){
  const doc=ctx.document??globalThis.document,win=doc?.defaultView??null,storage=ctx.storage??globalThis.localStorage??null;
  const card=cardOf(ctx.getWhole?.()?.study??null,state.roomInputs.date,draftCard),sessions=(card?.sessions??[]).filter(x=>x?.id!==state.ownId);   // FIX37C (H37-S6): 카드에 이미 든 이 타이머 세션은 진행 중 분으로만 센다(liveState와 같음)
  const scene=roomScene(doc,{stage,wings:true,props,label:props?'오늘의 방':'오늘의 공부',win});
  const modelOf=s=>({...roomModel({todayMin:s.roomInputs.todayMin,pile:pileOf(sessions,Math.floor(s.clock.studyMs/60000)),effectLevel:s.roomInputs.effectLevel}),liveMin:s.roomInputs.todayMin});   // V7A: liveMin = 이름표용 오늘 분
  const due=s=>timer?.startIso?celebrateDue(storage,timer.startIso,s.session.bricks,s.session.gold):null;
  scene.paint(modelOf(state),{fresh:due(state)});
  return {node:scene.node,scene,update:s=>{if(s.roomInputs.date!==state.roomInputs.date)return;scene.paint(modelOf(s),{fresh:due(s)});},stop:scene.stop};
}

// ---- 지난 날짜 "그날의 방"(B41 지난 날짜 보기): 그날 카드 분 + 그날까지의 평생 분으로 정한 등급 그림. 진행 중 세션은 넣지 않는다. 같은 입력 → 같은 그림. ----
export function dayRoomInputs(study,date){
  const upTo={days:(study?.days??[]).filter(d=>typeof d?.date==='string'&&d.date<=date)};
  const card=[...upTo.days].reverse().find(d=>d.date===date)?.data??null,min=cardMinutes(card),fx=todayEffectOf(min),b=sumBricks(countedMinutes(card?.sessions).filter(okMin));
  return {date,card,todayMin:min,bricks:b,stageNo:stageOf(lifetimeMinutes(upTo)).stage.no,art:fx.art,effectLevel:fx.level};
}
export function dayRoomCard(ctx,date){
  const doc=ctx.document??globalThis.document,{el}=maker(doc),study=ctx.getWhole?.()?.study??null;
  if(!study)return null;
  const inp=dayRoomInputs(study,date),m=roomModel({todayMin:inp.todayMin,pile:pileOf(inp.card?.sessions??[]),effectLevel:inp.effectLevel});
  const stage=el('div',null,'room-stage room-stage-day');
  if(ctx.avatarArt??AVATAR_ART_READY){const fig=el('img',null,'st-fig-art live-fig');fig.alt='';fig.setAttribute('aria-hidden','true');fig.src=artFile(inp.stageNo,inp.art);fig.addEventListener('error',()=>{fig.hidden=true;});stage.append(fig);}
  const scene=roomScene(doc,{stage,wings:false,label:'그날의 방'});scene.paint(m);
  const sec=el('section',null,'room-day');
  sec.append(el('strong','그날의 방','room-day-title'),scene.node,
    el('p',inp.todayMin?'그날 공부 '+hmText(inp.todayMin)+' · 벽돌 '+inp.bricks.bricks+'장'+(inp.bricks.pieces?' + 조각 '+inp.bricks.pieces:'')+' · '+m.stage.label:'그날 쌓은 공부 기록이 없어요 · '+m.stage.id+' '+m.stage.label,'muted small room-day-note'));
  return sec;
}
