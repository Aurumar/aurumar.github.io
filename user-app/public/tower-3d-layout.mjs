// 3D 탑 배치 계산 (B44A). 순수 함수: achieve 투영 → 인스턴스 배열. DOM·WebGL·시계·난수·저장소·네트워크를 쓰지 않고 어떤 기록도 쓰지 않는다. 합성 데이터로만 시험한다.
// 장식 없음: 모든 인스턴스는 투영의 값에서 나온다. 벽돌=공부 세션, 모르타르 밝기=그날 습관 XP, 창문=주간 퀘스트, 난간·등=영역 레벨, 첨탑=보스, 빛 띠=연속일.
// 좌표: y가 위, 앞면이 +z, 요일 칸은 x=-3(월)~+3(일). 크기 sx·sy·sz는 1×1×1 도형에 곱하는 값이다.
export const COLS=7,DEPTH=3,MIN_ROWS=3,MAX_ROWS=16,ROW_H=0.5,SLAB_H=0.3;
export const GOLD='#E6C65A';
export const MORTAR_FULL_XP=100,MAX_LAMPS=12,MAX_SPIRE_TIERS=12,MAX_PARTICLES=48,PARTICLES_PER_BRICK=12;
export const MAX_INSTANCES=20000,LOW_CORES=2,LOW_MEMORY_GB=1,SLOW_FRAME_MS=200,SLOW_FRAME_COUNT=10;
export const MOTION_SECONDS=4,FALL_SECONDS=1.4,GROW_SECONDS=1.6;
export const FOV=38,PHI=0.3,MIN_ZOOM=0.45,MIN_VIEW_H=18;
export const AREA_COLORS=Object.freeze({BODY:'#5BA66B',HEAD:'#4F86C6',MONEY:'#C9A227',HEART:'#D9534F'});
const SIDES=Object.freeze(['BODY','HEAD','MONEY','HEART']);   // 앞·오른쪽·뒤·왼쪽 난간
const BRICK_W=0.92,BRICK_GAP=0.06,HALF_W=COLS/2,HALF_D=DEPTH/2,PLATE_Z=HALF_D-1-0.04,SLAB_OUT=0.15,BAND_OUT=0.08;

const dayHeight=d=>Math.min(MAX_ROWS,d.items.reduce((s,b)=>s+(b.half?0.5:1),0));
const box=(x,y,z,sx,sy,sz,extra)=>({x,y,z,sx,sy,sz,...extra});

// 층 높이는 2.5D 탑과 같은 규칙: 그 주에 가장 높은 날에 맞추되 최소 3줄, 최대 16줄.
export function towerScene(ach){
  const xpOf=new Map(ach.days.map(d=>[d.date,d.habitXp]));
  const floors=[],bricks=[],mortar=[],cores=[],slabs=[],windows=[],hits=[],bands=[],rails=[],lamps=[],spire=[],particles=[];
  const slab=(y,floor)=>slabs.push(box(0,y+SLAB_H/2,0,COLS+SLAB_OUT*2,SLAB_H,DEPTH+SLAB_OUT*2,{floor}));
  let base=0,todayTop=null,todayX=0;
  ach.weeks.forEach((w,f)=>{
    const rows=Math.max(MIN_ROWS,Math.ceil(Math.max(0,...w.days.map(dayHeight)))),floorY=base+SLAB_H,h=rows*ROW_H,top=floorY+h,mid=floorY+h/2;
    floors.push({index:w.index,monday:w.monday,current:w.current,base,rows,top,week:w});
    slab(base,f);
    cores.push(box(0,mid,(PLATE_Z-HALF_D)/2,COLS,h,PLATE_Z+HALF_D,{floor:f}));
    hits.push(box(0,base+(top-base)/2,0,COLS+SLAB_OUT*2,top-base,DEPTH+SLAB_OUT*2,{floor:f}));
    w.days.forEach((d,col)=>{
      const x=col-(COLS-1)/2,today=w.current&&d.date===ach.today;
      mortar.push(box(x,mid,PLATE_Z,1,h,0.08,{floor:f,col,date:d.date,brightness:Math.min(1,(xpOf.get(d.date)??0)/MORTAR_FULL_XP)}));
      let drawn=0;
      for(const b of d.items){
        const size=b.half?0.5:1;if(drawn+size>MAX_ROWS)break;
        const sy=size*ROW_H-BRICK_GAP;
        bricks.push(box(x,floorY+drawn*ROW_H+BRICK_GAP/2+sy/2,HALF_D-0.5,BRICK_W,sy,BRICK_W,{floor:f,col,half:b.half,gold:b.gold,color:b.gold?GOLD:b.color,subjectId:b.subjectId,today}));
        drawn+=size;
      }
      if(today){todayTop=floorY+drawn*ROW_H;todayX=x;}
    });
    for(let i=0;i<w.windows;i++)windows.push(box(HALF_W+0.02,floorY+h/2,-HALF_D+0.5+i*0.75,0.06,Math.min(h*0.6,1),0.5,{floor:f,slot:i}));
    base=top;
  });
  const roof=base;
  slab(roof,-1);
  const height=roof+SLAB_H;
  // 연속일 = 위에서부터 7일당 한 층을 감싸는 빛 띠. 배수가 높을수록 밝다.
  const span=Math.min(floors.length,Math.ceil(ach.streak.days/7)),glow=0.45+0.55*Math.max(0,Math.min(1,(ach.streak.mult10-10)/10));
  for(let k=0;k<span;k++){
    const f=floors.length-1-k,y=floors[f].base+SLAB_H+(floors[f].top-floors[f].base-SLAB_H)/2,w=COLS+BAND_OUT*2,d=DEPTH+BAND_OUT*2;
    for(const [x,z,sx,sz] of [[0,d/2,w,0.05],[0,-d/2,w,0.05],[w/2,0,0.05,d],[-w/2,0,0.05,d]])bands.push(box(x,y,z,sx,0.1,sz,{floor:f,brightness:glow}));
  }
  // 영역 레벨업 = 지붕 난간(레벨 2부터) + 레벨업 횟수만큼 등. 투영은 현재 레벨만 주므로 레벨업이 일어난 층에 놓지 않고 지붕에 모은다.
  SIDES.forEach((area,i)=>{
    const level=ach.levels[area]?.level??1,ups=level-1;if(ups<=0)return;
    const front=i%2===0,len=(front?COLS:DEPTH)+SLAB_OUT*2,sign=i<2?1:-1,edge=(front?DEPTH/2:COLS/2)+SLAB_OUT-0.04,railY=height+0.35,color=AREA_COLORS[area];
    const place=t=>front?[t,edge*sign]:[edge*sign,t];
    const [rx,rz]=place(0);
    rails.push(box(rx,railY,rz,front?len:0.08,0.08,front?0.08:len,{area,level,color}));
    const n=Math.min(MAX_LAMPS,ups);
    for(let k=0;k<n;k++){const [lx,lz]=place(-len/2+len*(k+0.5)/n);lamps.push(box(lx,railY+0.14,lz,0.2,0.2,0.2,{area,color}));}
  });
  // 보스 = 지붕의 첨탑. 시험일에 오늘 카드를 쌓은 날 하나당 한 단.
  const bossDays=ach.days.filter(d=>d.boss).length;
  for(let k=0;k<Math.min(MAX_SPIRE_TIERS,bossDays);k++){const r=Math.max(0.3,1.3-k*0.09);spire.push(box(0,height+0.45+k*0.62,0,r,0.9,r,{tier:k}));}
  // 금 입자: 오늘 쌓은 벽돌이 있을 때만, 값에 비례해서. 난수 대신 황금비 분포라 같은 입력이면 같은 모양이다.
  const todayValue=ach.todayDay?.value??0;
  if(todayTop!==null&&todayValue>0){
    const n=Math.min(MAX_PARTICLES,Math.ceil(todayValue*PARTICLES_PER_BRICK));
    for(let i=0;i<n;i++){const a=i*0.618034%1,b=i*0.754878%1;particles.push({x:todayX+(a-0.5)*BRICK_W,z:HALF_D-0.5+(b-0.5)*BRICK_W,from:height+3+a*2,to:todayTop,delay:(MOTION_SECONDS-FALL_SECONDS)*i/n});}
  }
  const list={floors,bricks,mortar,cores,slabs,windows,hits,bands,rails,lamps,spire,particles};
  return {...list,height,roof,counts:Object.fromEntries(Object.entries(list).map(([k,v])=>[k,v.length])),total:Object.entries(list).reduce((s,[k,v])=>s+(k==='floors'?0:v.length),0)};
}

// 금 입자 위치(t초). 떨어지기 전·도착 뒤는 null(그리지 않는다).
export function particleAt(p,t){
  const u=(t-p.delay)/FALL_SECONDS;
  if(u<0||u>1)return null;
  return {x:p.x,y:p.from+(p.to-p.from)*u*u,z:p.z};
}
// 오늘 벽돌이 차례로 올라오는 비율(0~1). k번째 벽돌, 전체 n장.
export function growAt(k,n,t){
  const each=GROW_SECONDS/Math.max(1,n),u=(t-k*each)/each;
  return Math.max(0,Math.min(1,u));
}
// 저사양 판정. 값을 모르면(브라우저가 안 알려 주면) 낮다고 보지 않는다. 프레임 시간 검사가 뒤에서 한 번 더 거른다.
export function quality3d({cores,memoryGb,instances}){
  if(Number.isFinite(cores)&&cores<=LOW_CORES)return 'LOW_CORES';
  if(Number.isFinite(memoryGb)&&memoryGb<=LOW_MEMORY_GB)return 'LOW_MEMORY';
  if(instances>MAX_INSTANCES)return 'TOO_MANY';
  return 'OK';
}
export function framesTooSlow(deltas){
  if(deltas.length<SLOW_FRAME_COUNT)return false;
  const last=deltas.slice(-SLOW_FRAME_COUNT);
  return last.reduce((s,d)=>s+d,0)/SLOW_FRAME_COUNT>SLOW_FRAME_MS;
}

// 카메라: 수평각 theta, 고정 고각 PHI, 거리 dist, 바라보는 높이 y. 탑이 작으면 전체를, 크면 맨 위(이번 주)를 먼저 보여 준다.
const halfV=()=>Math.tan(FOV/2*Math.PI/180);
const fitDist=aspect=>(COLS+1.4)/(2*halfV()*Math.max(0.3,aspect))+HALF_D;
const wholeDist=height=>(height+2)/(2*halfV())+HALF_D;
export function initialCamera(scene,aspect){
  const fit=fitDist(aspect),whole=wholeDist(scene.height);
  if(whole<=fit*2)return clampCamera({theta:0.6,dist:Math.max(fit,whole),y:scene.height/2},scene,aspect);
  const dist=Math.max(fit*1.3,MIN_VIEW_H/(2*halfV()));   // 넓은 화면에서도 위아래로 몇 층은 보이게
  return clampCamera({theta:0.6,dist,y:scene.height-halfV()*dist*0.45},scene,aspect);
}
export function clampCamera(cam,scene,aspect){
  const fit=fitDist(aspect),whole=wholeDist(scene.height);
  cam.dist=Math.max(fit*MIN_ZOOM,Math.min(Math.max(fit*1.2,whole*1.1),cam.dist));
  cam.y=Math.max(0,Math.min(scene.height+1,cam.y));
  return cam;
}
export function cameraPosition(cam){
  const flat=Math.cos(PHI)*cam.dist;
  return {x:Math.sin(cam.theta)*flat,y:cam.y+Math.sin(PHI)*cam.dist,z:Math.cos(cam.theta)*flat};
}
