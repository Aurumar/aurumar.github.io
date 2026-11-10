// 3D 탑 배치 계산 (B44A). 순수 함수: achieve 투영 → 인스턴스 배열. DOM·WebGL·시계·난수·저장소·네트워크를 쓰지 않고 어떤 기록도 쓰지 않는다. 합성 데이터로만 시험한다.
// 장식 없음: 모든 인스턴스는 투영의 값에서 나온다. 벽돌=공부 세션, 모르타르 밝기=그날 습관 XP, 창문=주간 퀘스트, 난간·등=영역 레벨, 첨탑=보스, 빛 띠=연속일.
// 좌표: y가 위, 앞면이 +z, 요일 칸은 x=-3(월)~+3(일). 크기 sx·sy·sz는 1×1×1 도형에 곱하는 값이다.
// T2A: 진짜 벽돌 비율(앞면 0.92×0.28 ≈ 3.3:1, 깊이 0.46), 들어간 줄눈, 결정적 크기 편차, 점토·구조벽·대지 픽셀, 시각별 하늘, 날아와 놓이는 모션, 성능 등급. 시계는 입력(hour)으로만 받는다.
// T2B: 나의 집(성). 본채 깊이 7(정사각), 기단, 시즌(시험 일정 구간)마다 붙는 부품, 정원, 크레인·비계, 지붕 3단, 완공 예상도. 시즌은 화면(life-tower)이 계산해 넘기고 여기서는 날짜를 다루지 않는다.
// T2C: 영역 4개 = 네 모퉁이 탑(레벨로 단계가 정해진다), 업적 = 머릿돌·현판·문장·깃발. 업적 판정(houseBadges)은 화면(life-tower)이 계산해 넘기고 여기서는 그 값대로 놓기만 한다.
// DS6: 금빛 벽돌(금속 금·나이 3단계 색)·아이보리 대리석 단상·아이보리→연금 하늘·금 예상도 선·상표 태양 바퀴. 배치(위치·크기·개수·층 높이)는 바꾸지 않고 색·재질 값과 픽셀만 바꾼다.
export const COLS=7,DEPTH=7,MIN_ROWS=3,MAX_ROWS=16,ROW_H=0.34,SLAB_H=0.3;
// DS7: 금색 B(금 #F0CF6E · 금 진함 #D4A83A · 하이라이트 #FFF8DF · 음각 #F1ECE0 · 선 #EADFC4). 오늘 = 금 75% + 하이라이트 25%.
export const GOLD='#F0CF6E';
// DS6 금빛 벽돌(설계 V5 2.7: 금은 "번 것"에만). 위치·크기·개수는 그대로, 색·재질만.
// V6C 금빛 탑(통제탑 2026-11-10, V5 2.7 토큰): DS6 뒤에도 화면이 "황토 벽돌"이었던 까닭 = 금속 벽돌이 거의 고른 베이지 환경만 비춰 한 가지 평면색이 되고, 저녁 하늘이 금↔남색을 섞어 회갈색이 됐다.
// 그래서 금 3단(밝은 면·중간·그늘)과 gold-shadow 테두리를 벽돌 질감에 직접 싣고, 인스턴스 색은 나이 밝기(흰색 쪽)만 곱한다. 이 토큰은 탑 3D 전용(화면 CSS 금색 B 토큰은 그대로).
export const TOWER_GOLD=Object.freeze({hi:'#FFF1C2',mid:'#E3B341',deep:'#B07D18',shadow:'#5C3D0A'}),IVORY_1='#FAF7F0',IVORY_2='#F1ECE0',CHAMPAGNE='#F2E3C2';
export const BRICK_GOLD=TOWER_GOLD.mid,MORTAR_IVORY='#F1ECE0';
// 나이 밝기: 오늘 = 질감 금 그대로(가장 밝다), 이번 주·지난 주는 조금씩 낮춘다(녹·얼룩·황토 없음).
export const BRICK_AGE_TINT=Object.freeze({TODAY:'#FFFFFF',WEEK:'#F7F5F0',OLD:'#EDEAE3'});
export const BRICK_MATERIALS=Object.freeze({
  brick:Object.freeze({metalness:0.95,roughness:0.33}),
  half:Object.freeze({metalness:0.95,roughness:0.35}),
  gold:Object.freeze({metalness:1,roughness:0.25}),   // 90분 금벽돌: 한결 매끈한 광택(발광은 화면 파일이 하늘 밝기로 정한다)
  today:Object.freeze({metalness:0.95,roughness:0.3,emissive:TOWER_GOLD.hi,emissiveIntensity:0.2}),   // 오늘: 하이라이트 쪽으로 약하게 밝다
});
export const brickAge=(scene,r)=>r.today?'TODAY':scene.floors[r.floor]?.current?'WEEK':'OLD';
// 작은 금빛 벽돌(일기·리뷰)은 같은 나이 밝기를 흰색 쪽으로 옅게.
export const brickTint=(scene,r)=>{const c=BRICK_AGE_TINT[brickAge(scene,r)];return r.small?mixHex(c,'#FFFFFF',0.5):c;};
// 완공 예상도: 진한 금 선(WebGL 선은 늘 1px이라 불투명도 0.4로 가늘게) + 위로 갈수록 배경색 쪽으로 옅어진다(fade, 꼭대기에서 85%). 아이보리 반투명 유리(0.05).
export const BLUEPRINT_STYLE=Object.freeze({line:TOWER_GOLD.deep,lineOpacity:0.4,fade:0.85,glass:IVORY_1,glassOpacity:0.05});
export const blueprintFade=(y,bp)=>BLUEPRINT_STYLE.fade*clamp01((y-bp.roof)/Math.max(1e-6,bp.top+CONE_H+2-bp.roof));
// 바닥: 아이보리 대리석 원형 단상(정원·나무까지 덮는다) + 단상 아래 아이보리 대지.
export const DAIS=Object.freeze({r:15,h:0.3,side:IVORY_2});
// V6C 꼭대기 작은 빛: 지금 층(이번 주) 위, 오늘 칸 앞에 작은 금빛 점광 1개(그림자 없음). 광원은 반구광·해·이 점광 3개가 상한이다.
export const TOP_GLOW=Object.freeze({color:TOWER_GOLD.hi,intensity:3,distance:7,decay:2,lift:0.55,out:0.9,r:0.07}),MAX_LIGHTS=3;
export function topGlow(scene){
  const f=scene.floors?.at(-1);if(!f||!scene.bricks?.length)return null;
  const today=scene.bricks.findLast(b=>b.today),x=today?today.x:0;
  return {x,y:f.top+TOP_GLOW.lift,z:HALF_D+TOP_GLOW.out};
}
// 움직일 때만 아주 약하게 숨 쉰다(±10%, 4초). 움직임 줄이기면 화면이 부르지 않는다(고정).
export const glowPulse=t=>1+0.1*Math.sin(2*Math.PI*t/4);
export const MORTAR_FULL_XP=100,MAX_LAMPS=12,MAX_SPIRE_TIERS=12,MAX_PARTICLES=48,PARTICLES_PER_BRICK=12;
export const MAX_INSTANCES=20000,LOW_CORES=2,LOW_MEMORY_GB=1,SLOW_FRAME_MS=200,SLOW_FRAME_COUNT=10;
export const MOTION_SECONDS=4,FALL_SECONDS=1.4,GROW_SECONDS=1.6;
export const FOV=38,PHI=0.3,MIN_ZOOM=0.45,MIN_VIEW_H=18;
export const AREA_COLORS=Object.freeze({BODY:'#5BA66B',HEAD:'#4F86C6',MONEY:'#D4A83A',HEART:'#D9534F'});
// V6F: 금빛 탑 위에서 튀던 파란 지붕·깃발 → 원뿔 지붕(모퉁이 탑·완공 지붕)은 gold-deep, 영역 깃발은 아이보리. 영역 색은 난간·등에만 남긴다.
export const TOWER_ROOF=TOWER_GOLD.deep,TOWER_FLAG=IVORY_1;
const SIDES=Object.freeze(['BODY','HEAD','MONEY','HEART']);
export const BRICK_W=0.92,BRICK_D=0.46,BRICK_GAP=0.06;
// 벽돌 앞면은 탑 앞면보다 BRICK_OUT 튀어나오고, 줄눈 판의 앞면은 벽돌 앞면보다 MORTAR_IN 들어가 있다(벽돌 사이 틈으로 보이는 들어간 줄눈).
const BRICK_OUT=0.02,MORTAR_IN=0.03,MORTAR_T=0.08;
const HALF_W=COLS/2,HALF_D=DEPTH/2,BRICK_Z=HALF_D+BRICK_OUT-BRICK_D/2,PLATE_Z=HALF_D+BRICK_OUT-MORTAR_IN-MORTAR_T/2,SLAB_OUT=0.15,BAND_OUT=0.08;
export const BONUS_W=0.46,BONUS_X=-HALF_W-0.26,BONUS_COLORS=Object.freeze([GOLD,'#FAEAB7']);   // Q1B 금빛 기둥: 월요일 칸 왼쪽 밖, 카메라 맞춤 폭(±4.2) 안. 빛 재질이라 그늘이 없어 두 금색을 번갈아 써서 개수가 보이게 한다
// 벽돌마다 아주 작은 차이(손으로 쌓은 느낌). 난수 대신 (층,칸,순번) 정수 해시라 같은 입력이면 같은 모양이다. x(요일 칸 중심)와 y(줄 중심)는 바꾸지 않는다.
export const JITTER=Object.freeze({size:0.02,rot:0.8*Math.PI/180,z:0.01,shade:0.06});
export function hash01(a,b,c){
  let h=Math.imul(a+1,0x9E3779B1)^Math.imul(b+7,0x85EBCA77)^Math.imul(c+13,0xC2B2AE3D);
  h=Math.imul(h^(h>>>15),0x2C1B3C6D);h=Math.imul(h^(h>>>12),0x297A2D39);h^=h>>>15;
  return (h>>>0)/4294967296;
}
export function brickJitter(floor,col,k){
  const u=i=>hash01(floor,col*31+i,k)*2-1;
  return {w:1+JITTER.size*u(0),h:1+JITTER.size*u(1),rot:JITTER.rot*u(2),z:JITTER.z*u(3),shade:1+JITTER.shade*u(4)};
}

// FIX49C: 작은 금빛 벽돌(일기 0.25·리뷰 0.5)도 무게만큼 그 칸 높이에 든다(2.5D 탑과 같은 규칙).
const dayHeight=d=>Math.min(MAX_ROWS,d.items.reduce((s,b)=>s+(b.half?0.5:1),0)+(d.small??[]).reduce((s,b)=>s+b.weight,0));
export const SMALL_COLORS=Object.freeze({DIARY:'#F7E2A1',REVIEW:'#FAEAB7'});   // 금벽돌(GOLD)보다 옅은 금색. 진짜 벽돌 재질 묶음에 색만 입힌다
const box=(x,y,z,sx,sy,sz,extra)=>({x,y,z,sx,sy,sz,...extra});

// ---------- T2B 집 부품 슬롯: 날짜(시즌의 passed)와 투영으로만 정해진다. 기본 부품은 시간이 지나면 반드시 붙고, 달성률 60%/90%면 은/금 장식이 더해진다 ----------
export const FOUND_H=1.2,CONE_H=4.2,CRANE_UP=4,MAX_FLOWERS=64,MAX_TREES=16,GOLD_PER_TREE=10,MAX_LABELS=8,BLUEPRINT_MAX_FLOORS=160,WHOLE_PHI=0.45;
export const GRADE_COLORS=Object.freeze({BASE:'#CDBFA4',SILVER:'#C9D1DB',GOLD});
// DS6: 기단·창틀·화단·길·방수포는 아이보리 대리석 톤, 비계·크레인은 금속 + 갈고리·돛대 끝 금 포인트(공사장 노랑·파랑 없음).
// V6C: 갈색으로 보이던 기단·화단 판 = 아이보리 석재(ivory-1/2), 비계·크레인 = 회색 덩어리 대신 가는 짙은 청동 선(시선이 탑에 가게).
export const KIT=Object.freeze({plinth:IVORY_1,step:IVORY_2,door:'#6B4A2E',frame:'#F3ECDD',shutter:'#4D6B5A',plaque:'#5A3E2A',pole:'#8A8F99',flag:'#D9534F',dirt:IVORY_2,lawn:IVORY_1,sprout:'#7DBA5A',path:IVORY_1,post:'#4A3B2C',flame:'#FFB347',trunk:'#6B4A2E',crown:'#3F7D45',sapling:'#8CC063',tarp:IVORY_2,timber:'#4A3A26',slate:'#56657F',crane:'#3E3122',ballast:'#2F2619',cabin:IVORY_2,cable:'#3E3122',hook:BRICK_GOLD});
const FLOWER_COLORS=['#E86A8F','#F2C14E','#9C7BD8','#F28C5B','#F4F1EA'];
// seasons(life-tower의 seasonsOf 결과)가 없으면 기단만. 정원은 끝에서 세 번째 시즌(기본 일정 = 6평), 지붕 골조는 끝에서 두 번째(하반기 모평), 완공은 마지막(수능)이 지나면.
export const TITLE_FLAG_COLORS=Object.freeze({BRONZE:'#B0763A',SILVER:GRADE_COLORS.SILVER,GOLD,HIDDEN:GRADE_COLORS.SILVER});   // Q1C 칭호 깃발 색(숨김 칭호는 자동 선택 순위가 은과 같아 은색)
export function houseParts(ach,seasons=null){
  const S=ach.hasRecords&&seasons?.length?seasons:null,n=S?S.length:0,passed=S?S.filter(s=>s.passed).length:0,done=Boolean(S&&S.at(-1).passed);
  return {FOUNDATION:Boolean(ach.hasRecords),SEASON_TRIM:S?S.filter(s=>s.passed&&s.floorTo>=0).map(s=>s.k):[],
    GARDEN:Boolean(S)&&passed>=Math.max(1,n-2),ROOF_FRAME:Boolean(S)&&passed>=Math.max(1,n-1),ROOF_DONE:done,CRANE:Boolean(S)&&!done,SCAFFOLD:Boolean(S)&&!done};
}
// 크레인: 본채 뒤(-z), 꼭대기 + 4. 완공 순간에는 화면이 이것을 땅으로 내린다. V6C: 두께는 DS6의 절반 이하(가는 선), 위치·높이·개수는 그대로.
export function craneRows(height){
  const cx=2,cz=-(DEPTH/2+2.6),top=height+CRANE_UP,c=KIT;
  return [box(cx,0.15,cz,0.8,0.3,0.8,{color:c.ballast}),box(cx,top/2,cz,0.2,top,0.2,{color:c.crane}),box(cx,top+1.2,cz,0.1,1.6,0.1,{color:c.hook}),box(cx+0.3,top-0.5,cz+0.1,0.28,0.28,0.32,{color:c.cabin}),
    box(cx,top+0.25,cz+4,0.14,0.14,14,{color:c.crane}),box(cx,top-0.1,cz-2.6,0.4,0.36,0.45,{color:c.ballast}),box(cx,top-1,0,0.02,2.1,0.02,{color:c.cable}),box(cx,top-2.15,0,0.14,0.12,0.14,{color:c.hook})];
}

// ---------- T2C 모퉁이 탑: 레벨로만 정해진다(저장 없음). 앞쪽 두 탑은 앞면보다 1칸 뒤라 어느 각도에서도 요일 벽을 가리지 않고, 본채와 띄워 Q1B 금빛 기둥과 겹치지 않는다 ----------
// Lv1 주춧돌 / Lv2 벽 1단 + 난간(rails) / Lv3~ 레벨당 벽 0.6 높아짐(Lv12에서 멈춤) / Lv5 원뿔 지붕 / 레벨업 수 = 나선으로 올라가는 불 켜진 창(lamps, 최대 12).
export const TOWER_W=1.6,TOWER_PAD=0.36,TOWER_WALL_BASE=1.4,TOWER_WALL_STEP=0.6,TOWER_MAX_LV=12,TOWER_CONE_LV=5,TOWER_CONE_H=2.2,TOWER_CONE_D=TOWER_W*1.3,TOWER_X=HALF_W+0.75+TOWER_W/2,TOWER_Z=HALF_D-1.2;
export const TOWER_SPOTS=Object.freeze({BODY:[-1,1],HEAD:[1,1],MONEY:[1,-1],HEART:[-1,-1]});   // 앞왼쪽·앞오른쪽·뒤오른쪽·뒤왼쪽
const TOWER_FACES=[[0,1],[1,0],[0,-1],[-1,0]],MERLONS=[[1,1],[1,-1],[-1,1],[-1,-1],[0,1],[0,-1],[1,0],[-1,0]];
export const towerWall=level=>level<2?0:TOWER_WALL_BASE+TOWER_WALL_STEP*(Math.min(level,TOWER_MAX_LV)-2);
function cornerTower(area,level){
  const [sx,sz]=TOWER_SPOTS[area],x=sx*TOWER_X,z=sz*TOWER_Z,W=TOWER_W,wall=towerWall(level),top=TOWER_PAD+wall,cone=level>=TOWER_CONE_LV,color=AREA_COLORS[area],tag={part:'TOWER',area};
  const stone=[box(x,TOWER_PAD/2,z,W+0.4,TOWER_PAD,W+0.4,{color:KIT.plinth,...tag,pad:true})],lamps=[];let rail=null;
  if(wall>0){
    stone.push(box(x,TOWER_PAD+wall/2,z,W,wall,W,{color:KIT.frame,...tag}));
    rail=box(x,top-0.12,z,W+0.14,0.08,W+0.14,{area,level,color});
    if(!cone)for(const [a,b] of MERLONS)stone.push(box(x+a*(W/2-0.12),top+0.14,z+b*(W/2-0.12),0.24,0.28,0.24,{color:KIT.frame,...tag}));
    for(let k=0;k<Math.min(MAX_LAMPS,level-1);k++){const [fx,fz]=TOWER_FACES[k%4];lamps.push(box(x+fx*(W/2+0.01),TOWER_PAD+0.5+k*0.58,z+fz*(W/2+0.01),fz?0.24:0.04,0.36,fx?0.24:0.04,{area,color}));}
  }
  const roof=cone?box(x,top+TOWER_CONE_H/2,z,TOWER_CONE_D,TOWER_CONE_H,TOWER_CONE_D,{area,color:TOWER_ROOF,part:'TOWER'}):null,roofTop=top+(cone?TOWER_CONE_H:wall>0?0.28:0),hitH=Math.max(1.6,roofTop)+0.1;
  return {tower:{area,level,x,z,wall,top,roofTop,hit:box(x,hitH/2,z,W+0.5,hitH,W+0.5,{area})},stone,lamps,rail,roof};
}

// 층 높이는 2.5D 탑과 같은 규칙: 그 주에 가장 높은 날에 맞추되 최소 3줄, 최대 16줄.
// T2B: 기록이 있으면 1층은 기단(FOUND_H) 위에서 시작한다. 두 번째 인자 없이 부르면 부품은 기단뿐이다.
export function towerScene(ach,{seasons=null,titleTier=null}={}){
  const parts=houseParts(ach,seasons),found=parts.FOUNDATION?FOUND_H:0,titleColor=TITLE_FLAG_COLORS[titleTier]??null;
  const xpOf=new Map(ach.days.map(d=>[d.date,d.habitXp]));
  const floors=[],bricks=[],mortar=[],cores=[],slabs=[],windows=[],hits=[],bands=[],rails=[],lamps=[],spire=[],particles=[],bonus=[],towerRoofs=[];
  const slab=(y,floor)=>slabs.push(box(0,y+SLAB_H/2,0,COLS+SLAB_OUT*2,SLAB_H,DEPTH+SLAB_OUT*2,{floor}));
  let base=found,todayTop=null,todayX=0;
  ach.weeks.forEach((w,f)=>{
    const rows=Math.max(MIN_ROWS,Math.ceil(Math.max(0,...w.days.map(dayHeight)))),floorY=base+SLAB_H,h=rows*ROW_H,top=floorY+h,mid=floorY+h/2;
    floors.push({index:w.index,monday:w.monday,current:w.current,base,rows,top,week:w});
    slab(base,f);
    cores.push(box(0,mid,(PLATE_Z-HALF_D)/2,COLS,h,PLATE_Z+HALF_D,{floor:f}));
    hits.push(box(0,base+(top-base)/2,0,COLS+SLAB_OUT*2,top-base,DEPTH+SLAB_OUT*2,{floor:f}));
    w.days.forEach((d,col)=>{
      const x=col-(COLS-1)/2,today=w.current&&d.date===ach.today;
      mortar.push(box(x,mid,PLATE_Z,1,h,MORTAR_T,{floor:f,col,date:d.date,brightness:Math.min(1,(xpOf.get(d.date)??0)/MORTAR_FULL_XP)}));
      let drawn=0,k=0;
      for(const b of d.items){
        const size=b.half?0.5:1;if(drawn+size>MAX_ROWS)break;
        const sy=size*ROW_H-BRICK_GAP,j=brickJitter(f,col,k++);
        bricks.push(box(x,floorY+drawn*ROW_H+BRICK_GAP/2+sy/2,BRICK_Z+j.z,BRICK_W*j.w,sy*j.h,BRICK_D,{floor:f,col,half:b.half,gold:b.gold,color:b.gold?GOLD:b.color,subjectId:b.subjectId,today,rotY:j.rot,shade:j.shade}));
        drawn+=size;
      }
      // FIX49C 작은 금빛 벽돌: 진짜 벽돌 위에 무게만큼. 줄눈도 무게에 맞춰 줄여 얇아도 보이게 한다.
      for(const b of d.small??[]){
        const size=b.weight;if(drawn+size>MAX_ROWS)break;
        const gap=BRICK_GAP*size,sy=size*ROW_H-gap,j=brickJitter(f,col,k++);
        bricks.push(box(x,floorY+drawn*ROW_H+gap/2+sy/2,BRICK_Z+j.z,BRICK_W*j.w,sy,BRICK_D,{floor:f,col,half:false,gold:false,small:b.kind,color:SMALL_COLORS[b.kind]??SMALL_COLORS.DIARY,subjectId:null,today,rotY:j.rot,shade:1}));
        drawn+=size;
      }
      if(today){todayTop=floorY+drawn*ROW_H;todayX=x;}
    });
    for(let i=0;i<w.windows;i++)windows.push(box(HALF_W+0.02,floorY+h/2,-HALF_D+0.5+i*0.75,0.06,Math.min(h*0.6,1),0.5,{floor:f,slot:i}));
    // Q1B 금빛 기둥: 그 주 보너스 ✦. 왼쪽 벽 앞줄에 붙이고 층 높이는 바꾸지 않는다(1개 = 1줄, 줄보다 많으면 눌러 담는다). 금벽돌과 달리 스스로 빛나는 재질로 그린다.
    const nb=(w.bonus?.total??0)+(w.diary?.bonus??0),cell=nb<=rows?ROW_H:h/Math.max(1,nb);   // FIX49C: 일기 ✦도 같은 기둥
    for(let k=0;k<nb;k++)bonus.push(box(BONUS_X,floorY+(k+0.5)*cell,BRICK_Z,BONUS_W,cell-Math.min(BRICK_GAP,cell*0.2),BRICK_D,{floor:f,k,color:BONUS_COLORS[k%2]}));
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
  // 보스 = 지붕의 첨탑. 시험일에 오늘 카드를 쌓은 날 하나당 한 단. 완공 지붕이 있으면 깃대 위로 올린다.
  const bossDays=ach.days.filter(d=>d.boss).length,spireBase=height+(parts.ROOF_DONE?CONE_H+2.2:0);
  for(let k=0;k<Math.min(MAX_SPIRE_TIERS,bossDays);k++){const r=Math.max(0.3,1.3-k*0.09);spire.push(box(0,spireBase+0.45+k*0.62,0,r,0.9,r,{tier:k}));}
  // ---------- T2B 성 부품(kit). stone = 구조벽 질감, plain = 단색, crest = 완공 지붕 위(깃대·깃발·현판, 완공 순간에 지붕과 함께 내려앉는다) ----------
  const stone=[],plain=[],glass=[],ornaments=[],flowers=[],crowns=[],flames=[],crane=[],crest=[],labels=[];let cone=null;
  const hw=HALF_W+0.4,hd=HALF_D+0.4,T=0.36;
  // T2C 영역 레벨 = 모퉁이 탑. 투영은 현재 레벨만 주므로 레벨업이 일어난 층에 놓지 않고 탑에 모은다. 돌은 본채 돌 묶음에 합쳐 드로우콜을 늘리지 않는다.
  const towers=SIDES.map(area=>{const t=cornerTower(area,ach.levels[area]?.level??1);stone.push(...t.stone);lamps.push(...t.lamps);if(t.rail)rails.push(t.rail);if(t.roof)towerRoofs.push(t.roof);return t.tower;});
  if(parts.FOUNDATION){
    const tag={part:'FOUNDATION'},fz=HALF_D+0.8;
    stone.push(box(0,found/2,0,COLS+1.6,found,DEPTH+1.6,{color:KIT.plinth,...tag}),box(0,0.15,0,COLS+2.4,0.3,DEPTH+2.4,{color:KIT.step,...tag}));
    plain.push(box(0,0.3+0.375,fz+0.01,1.4,0.75,0.06,{color:KIT.door,...tag}));   // 성문(기단 앞면의 아치 문)
    for(const sx of [-1,1])stone.push(box(sx*0.8,0.3+0.42,fz+0.04,0.2,0.84,0.12,{color:KIT.frame,...tag}));
    stone.push(box(0,1.08,fz+0.04,1.8,0.18,0.12,{color:KIT.frame,...tag}),box(0,1.1,fz+0.08,0.24,0.26,0.14,{color:KIT.frame,...tag}),box(0,0.08,HALF_D+1.5,1.8,0.16,0.6,{color:KIT.step,...tag}));
  }
  // 시즌 마감: 그 시즌 꼭대기 바닥판 높이에 돌림띠(데이터 벽돌을 가리지 않는다), 앞 현판(시험 이름), 은·금이면 모서리 장식, 보스면 깃발, 그 시즌 층마다 왼쪽 벽에 아치 창틀·덧문.
  for(const s of seasons??[]){
    if(!parts.SEASON_TRIM.includes(s.k))continue;
    const y=floors[s.floorTo].top+SLAB_H/2,color=GRADE_COLORS[s.grade]??GRADE_COLORS.BASE,tag={part:'SEASON_TRIM',season:s.k,grade:s.grade};
    stone.push(box(0,y,hd-T/2,hw*2,SLAB_H,T,{color,...tag}),box(0,y,-hd+T/2,hw*2,SLAB_H,T,{color,...tag}),box(hw-T/2,y,0,T,SLAB_H,hd*2-T*2,{color,...tag}),box(-hw+T/2,y,0,T,SLAB_H,hd*2-T*2,{color,...tag}));
    if(s.grade==='SILVER'||s.grade==='GOLD')for(const [a,b] of [[1,1],[1,-1],[-1,1],[-1,-1],...(s.grade==='GOLD'?[[0,1],[0,-1],[1,0],[-1,0]]:[])])ornaments.push(box(a*(hw-T/2),y+SLAB_H/2+0.25,b*(hd-T/2),0.16,0.5,0.16,{color,...tag}));
    plain.push(box(0,y,hd+0.04,2.4,SLAB_H,0.08,{color:s.grade==='BASE'?KIT.plaque:color,...tag,plaque:true}));
    labels.push({kind:'SEASON',season:s.k,text:s.name+(s.grade==='GOLD'?' · 금':s.grade==='SILVER'?' · 은':''),x:0,y,z:hd+0.1});
    if(s.boss)plain.push(box(-hw+0.2,y+0.95,hd-0.2,0.06,1.6,0.06,{color:KIT.pole,...tag}),box(-hw+0.55,y+1.5,hd-0.2,0.62,0.4,0.03,{color:KIT.flag,...tag,flag:true}));
    for(let f=Math.max(0,s.floorFrom);f<=s.floorTo;f++){
      const fl=floors[f],h=fl.rows*ROW_H,ym=fl.base+SLAB_H+h/2,wh=Math.min(0.9,h*0.6),x0=-HALF_W,at={...tag,floor:f};
      glass.push(box(x0-0.02,ym,0,0.04,wh,0.7,at));
      stone.push(box(x0-0.05,ym,0.45,0.1,wh+0.1,0.16,{color:KIT.frame,...at}),box(x0-0.05,ym,-0.45,0.1,wh+0.1,0.16,{color:KIT.frame,...at}),box(x0-0.08,ym-wh/2-0.06,0,0.16,0.1,1.1,{color:KIT.frame,...at}),
        box(x0-0.06,ym+wh/2+0.07,0,0.12,0.14,1.06,{color:KIT.frame,...at}),box(x0-0.09,ym+wh/2+0.1,0,0.14,0.2,0.18,{color:KIT.frame,...at}));
      plain.push(box(x0-0.06,ym,0.75,0.04,wh,0.38,{color:KIT.shutter,...at}),box(x0-0.06,ym,-0.75,0.04,wh,0.38,{color:KIT.shutter,...at}));
    }
  }
  // 정원(일정이 있을 때만): 그 전엔 흙 마당·새싹·묘목, 정원 시즌이 지나면 잔디·자갈길·횃불·꽃·나무. 꽃 = 완벽한 날 수(≤64), 나무 = 금벽돌 10장당 1그루(≤16).
  if(parts.FOUNDATION&&seasons?.length){
    const open=parts.GARDEN,tag={part:'GARDEN'},beds=[[-7.6,1,4.2,10],[7.6,1,4.2,10],[-3.4,8.2,3.6,5.2],[3.4,8.2,3.6,5.2]];
    for(const [x,z,w,d] of beds)plain.push(box(x,0.03,z,w,0.06,d,{color:open?KIT.lawn:KIT.dirt,...tag}));
    if(open){
      plain.push(box(0,0.025,8.6,1.8,0.05,7.6,{color:KIT.path,...tag}));
      for(const z of [6.2,9.8])for(const sx of [-1,1]){plain.push(box(sx*1.3,0.55,z,0.1,1.1,0.1,{color:KIT.post,...tag}));flames.push(box(sx*1.3,1.2,z,0.18,0.24,0.18,{color:KIT.flame,...tag}));}
    }
    const nf=Math.min(MAX_FLOWERS,ach.days.filter(d=>d.perfect).length);
    for(let i=0;i<nf;i++){
      const [cx,cz,w,d]=beds[i%4],j=Math.floor(i/4),x=cx+((j*0.618034+0.31)%1-0.5)*(w-0.6),z=cz+((j*0.754878+0.17)%1-0.5)*(d-0.6);
      flowers.push(open?box(x,0.2,z,0.22,0.22,0.22,{color:FLOWER_COLORS[i%FLOWER_COLORS.length],bloom:true,...tag}):box(x,0.12,z,0.08,0.14,0.08,{color:KIT.sprout,bloom:false,...tag}));
    }
    const nt=Math.min(MAX_TREES,Math.floor(ach.weeks.reduce((s,w)=>s+w.gold,0)/GOLD_PER_TREE));
    for(let i=0;i<nt;i++){
      const a=(40+280*(i+0.5)/MAX_TREES)*Math.PI/180,r=12+1.5*(i%2),x=Math.sin(a)*r,z=Math.cos(a)*r,k=open?1:0.4;
      plain.push(box(x,0.7*k,z,0.3*k,1.4*k,0.3*k,{color:KIT.trunk,tree:i,...tag}));crowns.push(box(x,2.7*k,z,1.8*k,2.6*k,1.8*k,{color:open?KIT.crown:KIT.sapling,tree:i,...tag}));
    }
  }
  // 지붕 3단: 공사 중(방수포) → 골조(성가퀴 + 모퉁이 망루 뼈대) → 완공(성가퀴 + 원뿔 지붕 + 깃대·깃발 + 완공 현판).
  if(parts.CRANE&&!parts.ROOF_FRAME)plain.push(box(0,height+0.05,0,COLS+0.1,0.1,DEPTH+0.1,{color:KIT.tarp,part:'ROOF'}));
  if(parts.ROOF_FRAME){
    const tag={part:'ROOF_FRAME',color:GRADE_COLORS.BASE},y=height+0.15,m=height+0.55;
    stone.push(box(0,y,HALF_D,COLS+0.3,0.3,0.3,tag),box(0,y,-HALF_D,COLS+0.3,0.3,0.3,tag),box(HALF_W,y,0,0.3,0.3,DEPTH-0.3,tag),box(-HALF_W,y,0,0.3,0.3,DEPTH-0.3,tag));
    for(let t=-2;t<=2;t++)stone.push(box(t,m,HALF_D,0.5,0.5,0.3,tag),box(t,m,-HALF_D,0.5,0.5,0.3,tag),box(HALF_W,m,t,0.3,0.5,0.5,tag),box(-HALF_W,m,t,0.3,0.5,0.5,tag));
    for(const [a,b] of [[1,1],[1,-1],[-1,1],[-1,-1]])stone.push(box(a*HALF_W,m+0.1,b*HALF_D,0.6,0.7,0.6,tag));
  }
  if(parts.ROOF_FRAME&&!parts.ROOF_DONE)for(const [a,b] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    const cx=a*(HALF_W-0.6),cz=b*(HALF_D-0.6),tag={color:KIT.timber,part:'ROOF_FRAME'};
    for(const [p,q] of [[1,1],[1,-1],[-1,1],[-1,-1]])plain.push(box(cx+p*0.5,height+1.1,cz+q*0.5,0.04,2.2,0.04,tag));   // V6C: 뼈대 두께 절반
    plain.push(box(cx,height+2.2,cz+0.5,1.04,0.04,0.04,tag),box(cx,height+2.2,cz-0.5,1.04,0.04,0.04,tag),box(cx+0.5,height+2.2,cz,0.04,0.04,1.04,tag),box(cx-0.5,height+2.2,cz,0.04,0.04,1.04,tag));
  }
  if(parts.ROOF_DONE){
    const tag={part:'ROOF_DONE'};
    cone={x:0,y:height+CONE_H/2,z:0,r:(HALF_W+0.15)*Math.SQRT2,h:CONE_H,color:TOWER_ROOF};
    crest.push(box(0,height+CONE_H+1,0,0.08,2,0.08,{color:KIT.pole,...tag}),box(0.42,height+CONE_H+1.7,0,0.8,0.5,0.03,{color:titleColor??GOLD,...tag,...(titleColor?{titleFlag:true}:{})}),box(0,height+0.8,(HALF_W+0.15)*(1-0.8/CONE_H)+0.06,2.4,0.5,0.08,{color:GOLD,...tag,plaque:true}));
    labels.push({kind:'DONE',text:'완공 · '+seasons.at(-1).name,x:0,y:height+0.8,z:(HALF_W+0.15)*(1-0.8/CONE_H)+0.2});
  }
  // Q1C 칭호 깃발: 등급 색만, 글자 없음(설계 §8.2). 완공 뒤에는 위 깃대의 깃발 색만 바꾸고, 그 전에는 지붕 가운데(보스 첨탑이 있으면 그 꼭대기)에 깃대를 세운다. plain에 합쳐 드로우콜을 늘리지 않는다.
  let flagTop=0;
  if(titleColor&&!parts.ROOF_DONE){
    const y=spire.length?spire.at(-1).y+spire.at(-1).sy/2:height,tag={part:'TITLE_FLAG'};
    plain.push(box(0,y+0.75,0,0.08,1.5,0.08,{color:KIT.pole,...tag}),box(0.42,y+1.2,0,0.8,0.5,0.03,{color:titleColor,...tag,titleFlag:true}));   // 기본 카메라에서 잘리지 않는 높이
    flagTop=y+1.5;
  }
  if(parts.CRANE)crane.push(...craneRows(height));
  // 비계: 이번 주 층을 세 면(왼쪽·오른쪽·뒤)에서 감싸고, 앞은 꼭대기 가로대 하나만(요일 벽을 가리지 않게). V6C: 기둥·가로대·발판 두께 절반(가는 청동 선).
  if(parts.SCAFFOLD&&floors.length){
    const f=floors.at(-1),y0=f.base,y1=f.top+0.6,px=HALF_W+0.5,pz=HALF_D+0.5,mid=f.base+SLAB_H+(f.top-f.base-SLAB_H)/2,tag={color:KIT.timber,part:'SCAFFOLD'};
    for(const [x,z] of [[px,pz],[px,-pz],[-px,pz],[-px,-pz],[px,0],[-px,0],[0,-pz]])plain.push(box(x,(y0+y1)/2,z,0.04,y1-y0,0.04,tag));
    for(const y of [mid,y1-0.04])plain.push(box(px,y,0,0.03,0.03,pz*2,tag),box(-px,y,0,0.03,0.03,pz*2,tag),box(0,y,-pz,px*2,0.03,0.03,tag));
    plain.push(box(0,y1-0.04,pz,px*2,0.03,0.03,tag),box(px,mid-0.05,0,0.25,0.025,pz*2,tag),box(-px,mid-0.05,0,0.25,0.025,pz*2,tag),box(0,mid-0.05,-pz,px*2,0.025,0.25,tag));
  }
  // 금 입자: 오늘 쌓은 벽돌이 있을 때만, 값에 비례해서. 난수 대신 황금비 분포라 같은 입력이면 같은 모양이다.
  const todayValue=ach.todayDay?.value??0;
  if(todayTop!==null&&todayValue>0){
    const n=Math.min(MAX_PARTICLES,Math.ceil(todayValue*PARTICLES_PER_BRICK));
    for(let i=0;i<n;i++){const a=i*0.618034%1,b=i*0.754878%1;particles.push({x:todayX+(a-0.5)*BRICK_W,z:BRICK_Z+(b-0.5)*BRICK_D,from:height+3+a*2,to:todayTop,delay:(MOTION_SECONDS-FALL_SECONDS)*i/n});}
  }
  const list={floors,bricks,mortar,cores,slabs,windows,hits,bands,rails,lamps,spire,particles,stone,plain,glass,ornaments,flowers,crowns,flames,crane,crest,bonus,towerRoofs};
  return {...list,towers,height,roof,found,parts,cone,labels,flagTop,counts:Object.fromEntries(Object.entries(list).map(([k,v])=>[k,v.length])),total:Object.entries(list).reduce((s,[k,v])=>s+(k==='floors'?0:v.length),0)};
}
// V6C 줄눈 선(그리기 전용, towerScene 결과·개수는 그대로): 벽돌이 쌓인 칸(층·요일)마다 벽돌 뒤·줄눈 판 앞에 얇은 판 하나 → 벽돌 사이 틈으로 gold-shadow 가는 선이 보인다.
// V6B 습관 벽돌을 얻은 날(week.days[col].habitBrick)은 색만 다르다(JOINT.habit). 공부 벽돌이 없는 습관 날은 그 칸 바닥에 얇은 띠(habitSill)만.
export const JOINT=Object.freeze({base:TOWER_GOLD.shadow,habit:TOWER_GOLD.hi,t:0.01,in:0.015,habitSill:0.08});
export function jointRows(scene){
  const top=new Map();
  for(const b of scene.bricks){const k=b.floor+':'+b.col;top.set(k,Math.max(top.get(k)??-Infinity,b.y+b.sy/2+BRICK_GAP/2));}
  const z=HALF_D+BRICK_OUT-JOINT.in-JOINT.t/2,out=[];
  for(const m of scene.mortar){
    const f=scene.floors[m.floor],y0=f.base+SLAB_H,habit=Boolean(f.week?.days?.[m.col]?.habitBrick),t=top.get(m.floor+':'+m.col);
    const y1=t===undefined?(habit?y0+JOINT.habitSill:null):Math.min(f.top,t);
    if(y1!==null)out.push(box(m.x,(y0+y1)/2,z,1,y1-y0,JOINT.t,{floor:m.floor,col:m.col,habit}));
  }
  return out;
}

// ---------- T2C 업적 장식: badges(life-tower의 houseBadges 결과)대로 머릿돌·성문 현판·문장·옥상 깃발·시험 깃발·탑 깃발·금 테를 놓는다. 전부 기단 또는 지붕 위라 데이터 벽돌을 가리지 않는다 ----------
export const PLAQUE_COLORS=Object.freeze({WOOD:'#8A5A2B',SILVER:GRADE_COLORS.SILVER,GOLD,GEM:GOLD}),STREAK_COLORS=Object.freeze({WHITE:'#F4F1EA',BLUE:CHAMPAGNE,GOLD}),CREST_COLORS=Object.freeze(['#B0763A',GRADE_COLORS.SILVER,GOLD]);
const GEM_COLOR='#59C9E0',CORNERSTONE_COLOR='#E9E0CC';
// 새 객체를 돌려준다(입력 불변). titleName = Q1C가 고른 칭호(표시만). 없으면 badges.title. 글자는 현판이 생긴 뒤에만 얹는다.
export function withBadges(scene,badges,{titleName=null}={}){
  const rows=[],labels=[];let top=0;
  if(badges){
    const fz=HALF_D+0.8,px=HALF_W-0.1,pz=HALF_D-0.1,add=(badge,x,y,z,sx,sy,sz,color,o)=>rows.push(box(x,y,z,sx,sy,sz,{color,badge,...o}));
    if(badges.plaque){
      add('PLAQUE',0,FOUND_H+0.15,HALF_D+0.25,2.6,0.3,0.08,PLAQUE_COLORS[badges.plaque],{tier:badges.plaque});   // 기단 윗면에 세워 첫 층 바닥판 앞에 놓는다
      if(badges.plaque==='GEM')for(const a of [-1,1])add('PLAQUE',a*1.12,FOUND_H+0.15,HALF_D+0.32,0.16,0.16,0.06,GEM_COLOR,{gem:true});
      const text=titleName||badges.title;if(text)labels.push({kind:'PLAQUE',text,x:0,y:FOUND_H+0.15,z:HALF_D+0.36,front:true});
    }
    if(badges.cornerstone){add('CORNERSTONE',-2.6,0.62,fz+0.02,0.9,0.5,0.06,CORNERSTONE_COLOR);labels.push({kind:'CORNER',text:'첫 벽돌',x:-2.6,y:0.62,z:fz+0.1,front:true});}
    if(badges.crest>0){
      const c=CREST_COLORS[badges.crest-1];add('CREST',0,0.72,fz+0.05,0.44,0.5,0.05,c,{stage:badges.crest});   // 성문 문장: 금벽돌 10·50·200장
      if(badges.crest>=2)add('CREST',0,0.98,fz+0.05,0.2,0.1,0.05,c);
      if(badges.crest>=3)for(const a of [-1,1])add('CREST',a*0.33,0.76,fz+0.05,0.16,0.3,0.05,c);
    }
    if(badges.streakFlag){   // 최고 연속 깃발: 지붕 앞오른쪽 모서리(가운데 Q1C 칭호 깃발과 나란히)
      add('STREAK',px,scene.height+1.3,pz,0.07,2.6,0.07,KIT.pole);add('STREAK',px-0.42,scene.height+2.3,pz,0.8,0.5,0.03,STREAK_COLORS[badges.streakFlag],{streakFlag:true});
      top=Math.max(top,scene.height+2.6);
    }
    // 시험 깃발: 보스 첨탑 단마다 작은 깃발 하나(최대 12). 네 방향을 돌아가며 달아 어느 쪽에서도 보인다.
    scene.spire.slice(0,badges.boss).forEach((s,k)=>{
      const [dx,dz]=TOWER_FACES[k%4],reach=s.sx*0.39+0.32;
      add('BOSS',s.x+dx*reach,s.y+0.1,s.z+dz*reach,dx?0.64:0.03,0.28,dz?0.64:0.03,KIT.flag,{bossFlag:true,tier:k});
      top=Math.max(top,s.y+s.sy/2);
    });
    for(const t of scene.towers){
      const stage=badges.areas?.[t.area]??0;if(!stage)continue;
      add('AREA',t.x,t.roofTop+0.5,t.z,0.05,1,0.05,KIT.pole,{area:t.area});add('AREA',t.x+0.28,t.roofTop+0.8,t.z,0.5,0.32,0.03,TOWER_FLAG,{area:t.area,areaFlag:true});
      if(stage>=2)add('AREA',t.x,t.top+0.02,t.z,TOWER_W+0.24,0.1,TOWER_W+0.24,GOLD,{area:t.area,goldRim:true});
    }
  }
  // FIX49C 집 등불(최고 일기 연속 7·30·100일): 성문 양옆 기단 앞면에 기존 등(lamps, 빛 재질) 묶음으로 놓는다. 촛불 1개 → 등불 2개 → 금 등불 2개(조금 크게).
  const diaryLamps=[],stage=badges?.lamp??0;
  if(stage>0){const big=stage>=3?1.25:1;for(const a of stage>=2?[-1,1]:[1])diaryLamps.push(box(a*DIARY_LAMP_X,0.72,HALF_D+0.86,0.22*big,0.32*big,0.1,{badge:'DIARY',stage,diaryLamp:true,color:DIARY_LAMP_COLORS[stage-1]}));}
  const lamps=diaryLamps.length?[...scene.lamps,...diaryLamps]:scene.lamps;
  return {...scene,lamps,badgeRows:rows,badgeLabels:labels,badgeTop:top,counts:{...scene.counts,badgeRows:rows.length,lamps:lamps.length},total:scene.total+rows.length+diaryLamps.length};
}
export const DIARY_LAMP_X=1.35,DIARY_LAMP_COLORS=Object.freeze([KIT.flame,'#FFD27A',GOLD]);
// 글자 겹침층에 올릴 표지(최대 MAX_LABELS, 앞 순서가 먼저 보인다): 현판·머릿돌 → 예상도 시즌 경계 → 지난 시즌·완공 현판(가까운 것부터).
const dText=n=>n===0?'D-DAY':n>0?'D-'+n:'D+'+(-n);
export function houseLabels(scene,bp=null){
  const plan=bp?bp.boundaries.map(b=>({kind:'PLAN',text:b.name+' · '+dText(b.dDay),x:COLS/2+0.9,y:b.y,z:DEPTH/2+0.9})):[];
  return [...(scene.badgeLabels??[]),...plan,...[...scene.labels].reverse()].slice(0,MAX_LABELS);
}
// 레벨업 맥동: 지난번에 본 레벨(seen, 앱 실행 중 메모리)보다 오른 탑만. 처음 보는 실행이면 오른 것을 알 수 없어 없음. pulseAt = 0→1→0(0.6초).
export const PULSE_SECONDS=0.6;
export const towersToPulse=(scene,seen=null)=>seen?scene.towers.filter(t=>t.level>(seen[t.area]??t.level)).map(t=>t.area):[];
export const pulseAt=t=>t<0||t>=PULSE_SECONDS?0:Math.sin(Math.PI*t/PULSE_SECONDS);

// ---------- T2B 완공 예상도(반투명 청사진): 매일 바뀌는 투영일 뿐 저장하지 않는다 ----------
// 남은 주 = 이번 주 월요일 → 완공 시험이 든 주 월요일(seasons의 weeksLeft). 예상 층 높이 = 최근 4층 평균, 4층 미만이면 최소 높이(3줄 + 바닥판). 완공 뒤·일정 없음이면 null.
export function blueprint(scene,seasons){
  const end=seasons?.at(-1);
  if(!end||end.passed||!scene.floors.length)return null;
  const recent=scene.floors.slice(-4),floorH=recent.length>=4?recent.reduce((s,f)=>s+f.top-f.base,0)/4:MIN_ROWS*ROW_H+SLAB_H;
  const remaining=Math.max(0,end.weeksLeft),roof=scene.roof,top=roof+remaining*floorH+SLAB_H,n=Math.min(remaining,BLUEPRINT_MAX_FLOORS),each=n?remaining*floorH/n:0;
  const rows=Array.from({length:n},(_,i)=>box(0,roof+(i+0.5)*each,0,COLS+SLAB_OUT*2,each,DEPTH+SLAB_OUT*2,{i}));
  const boundaries=seasons.filter(s=>!s.passed).map(s=>({k:s.k,name:s.name,date:s.date,dDay:s.dDay,current:s.current,y:roof+Math.max(0,s.weeksLeft)*floorH}));
  return {remaining,floorH,roof,top,floors:scene.floors.length+remaining,rows,boundaries,cone:{x:0,y:top+CONE_H/2,z:0,r:(HALF_W+0.15)*Math.SQRT2,h:CONE_H}};
}
// 집 전체의 꼭대기(카메라 범위): 지금 집(크레인·완공 지붕·칭호 깃발 포함)과 예상도 지붕 중 높은 쪽.
export function houseTop(scene,bp=null){
  return Math.max(scene.height+(scene.parts?.CRANE?CRANE_UP+2:0)+(scene.parts?.ROOF_DONE?CONE_H+2.5:0),scene.flagTop??0,scene.badgeTop??0,...(scene.towers??[]).map(t=>t.roofTop),bp?bp.top+CONE_H+0.5:0);
}
// DS6 상표 태양 바퀴(원 + 살 8개, 단순 도형): 지금 집 꼭대기 가운데에 작게, 앞(+z)을 본다. 첨탑·칭호 깃대·완공 깃대가 있으면 그 위, 기둥이 받친다. 그림자를 드리우지 않는다.
export const SUN_WHEEL=Object.freeze({r:0.42,tube:0.045,spokes:8,spoke:0.05,post:0.06,lift:0.5});
export function sunWheel(scene){
  if(!scene.floors?.length||!scene.bricks?.length)return null;   // 쌓은 벽돌이 없으면 없음
  const W=SUN_WHEEL,s=scene.spire?.at(-1),base=Math.max(scene.height,s?s.y+s.sy/2:0,scene.flagTop??0,scene.parts?.ROOF_DONE?scene.height+CONE_H+2:0),y=base+W.lift+W.r;
  const spokes=Array.from({length:W.spokes},(_,k)=>{const a=2*Math.PI*k/W.spokes;return box(Math.cos(a)*W.r/2,y+Math.sin(a)*W.r/2,0,W.r,W.spoke,W.spoke,{rotZ:a});});
  return {x:0,y,z:0,r:W.r,tube:W.tube,spokes,hub:box(0,y,0,0.12,0.12,0.12),post:box(0,base+W.lift/2,0,W.post,W.lift,W.post)};
}
// 완공 순간(수능 뒤 처음 연 탑에서 한 번, 3초): 크레인이 내려가고(0→1), 지붕이 위에서 내려앉고(높이 차 6→0), 창이 켜지고(0→1), 금 불꽃이 핀다.
export const DONE_SECONDS=3,DONE_ROOF_DROP=6,SPARKS=60;
export function completionAt(t){
  const u=v=>Math.max(0,Math.min(1,v));
  return {crane:u(t/1.2),roof:DONE_ROOF_DROP*(1-smooth(u((t-0.5)/0.8))),lit:u((t-1.3)/0.5),sparks:t>=1.3&&t<DONE_SECONDS,done:t>=DONE_SECONDS};
}
// 불꽃 점 i(0~SPARKS-1)의 t초 위치. 지붕 꼭대기에서 황금각으로 퍼져 떨어진다. 범위 밖이면 null.
export function sparkAt(i,t,apex){
  const s=t-1.3-(i%6)*0.12;
  if(s<0||s>1.4)return null;
  const a=i*2.399963229728653,el=0.35+0.6*((i*0.618034)%1),v=4.5;
  return {x:apex.x+Math.cos(a)*Math.cos(el)*v*s,y:apex.y+Math.sin(el)*v*s-2.45*s*s,z:apex.z+Math.sin(a)*Math.cos(el)*v*s};
}

// Q1B 보너스 금 입자: 오늘 ✦를 얻는 일이 있었고(퀘스트·월간·보스) 이 실행에서 아직 안 본 ✦가 있으면 이번 주 기둥 꼭대기에 금 입자가 내려앉는다. seen = {monday,total}(화면의 메모리, 저장 안 함).
export const BONUS_SPARKS=24,BONUS_BURST_SECONDS=1.6;
export function bonusFresh(ach,seen=null){
  const w=ach.currentWeek,total=w?.bonus?.total??0,prev=seen?.monday===w?.monday?seen.total:0;
  return total>prev&&(ach.todayDay?.earned??[]).some(e=>/^(QUEST|MONTH|BOSS_KILL):/.test(e));
}
// 점 i의 t초 위치. 황금각으로 퍼진 자리에서 기둥 꼭대기로 떨어진다. 범위 밖이면 null.
export function bonusSparkAt(i,t,to){
  const u=(t-(i%6)*0.1)/(BONUS_BURST_SECONDS-0.5);
  if(u<0||u>1)return null;
  const a=i*2.399963229728653,r=0.7*(1-u);
  return {x:to.x+Math.cos(a)*r,y:to.y+2.4*(1-u)*(1-u),z:to.z+Math.sin(a)*r};
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
const baseDist=aspect=>2*Math.hypot(TOWER_X+TOWER_W/2,TOWER_Z+TOWER_W/2)/(2*halfV()*Math.max(0.3,aspect))+HALF_D;   // T2C: 네 모퉁이 탑까지 들어오는 거리
// T2C: 높이 h까지 네 모퉁이 탑의 바닥·꼭대기를 한 화면에(앞쪽 탑이 더 가까워 TOWER_X만큼 물러난다)
const frameTowers=(h,aspect)=>clampCamera({theta:0.6,dist:Math.max(fitDist(aspect),wholeDist(h)+TOWER_X,baseDist(aspect)),y:h/2},{height:h},aspect);
const towerPeak=scene=>Math.max(0,...scene.towers.map(t=>t.roofTop));
// FIX38: 예전에는 "전체를 보여 줄 집"을 화면 비율로 갈랐다(whole<=fit*2). 넓은 화면(비율 1.9)은 높이 약 9에서 벌써 벗어났고, 층 높이는 하루 벽돌 수에 따라 1.3~5.4까지 달라 몇 주 만에 넘었다. 이제 높이 하나로 가른다.
export const WHOLE_VIEW_MAX_H=40,GATE_VIEW_H=9,WHOLE_VIEW_PAD=2,FRONT_SPIN_END=1.25;
export const isTallHouse=scene=>scene.height>WHOLE_VIEW_MAX_H;
export function initialCamera(scene,aspect){
  const fit=fitDist(aspect),whole=wholeDist(scene.height);
  if(!scene.towers&&whole<=fit*2)return clampCamera({theta:0.6,dist:Math.max(fit,whole),y:scene.height/2},scene,aspect);
  if(scene.towers&&!isTallHouse(scene))return frameTowers(Math.max(scene.height,towerPeak(scene)),aspect);
  const dist=Math.max(fit*1.3,MIN_VIEW_H/(2*halfV()));   // 넓은 화면에서도 위아래로 몇 층은 보이게
  return clampCamera({theta:0.6,dist,y:scene.height-halfV()*dist*0.45},scene,aspect);
}
// FIX38 "집 앞": 큰 집은 맨 위와 땅이 한 화면에 들어갈 수 없다(52주 집 높이 70~210). 큰 집의 첫 화면은 모퉁이 탑과 현판이 보이는 땅쪽이고, "이번 주"는 맨 위(initialCamera)다.
export const gateCamera=(scene,aspect)=>frameTowers(Math.max(GATE_VIEW_H,towerPeak(scene)),aspect);
export const startView=scene=>isTallHouse(scene)?'gate':'week';
// 오늘 벽돌은 앱을 켤 때마다 다시 날아오고(메모리 기억) 맨 위에 놓인다. 집 앞을 볼 큰 집이면 맨 위에서 보여 준 뒤 집 앞으로 내려온다. 손대면 그 자리에 멈춘다.
export const flyFirst=(scene,flights,view=null)=>flights>0&&isTallHouse(scene)&&(view??'gate')==='gate';
export const SETTLE_SECONDS=1.2;
export function settleCamera(from,to,s){
  const u=smooth(Math.max(0,Math.min(1,s/SETTLE_SECONDS)));
  return {y:from.y+(to.y-from.y)*u,dist:from.dist+(to.dist-from.dist)*u,done:s>=SETTLE_SECONDS};
}
// 자동 회전은 현판이 있는 앞면이 보이는 동안만 돈다.
export const spinKeepsFront=(from,t)=>from+autoRotateAt(t)<FRONT_SPIN_END;
export function clampCamera(cam,scene,aspect){
  const fit=fitDist(aspect),whole=wholeDist(scene.height);
  cam.dist=Math.max(fit*MIN_ZOOM,Math.min(Math.max(fit*1.2,whole*1.1+TOWER_X,baseDist(aspect)*1.05),cam.dist));
  cam.y=Math.max(0,Math.min(scene.height+1,cam.y));
  return cam;
}
// 고각은 cam.phi(없으면 PHI). "집 전체" 보기만 WHOLE_PHI를 쓴다.
export function cameraPosition(cam){
  const phi=cam.phi??PHI,flat=Math.cos(phi)*cam.dist;
  return {x:Math.sin(cam.theta)*flat,y:cam.y+Math.sin(phi)*cam.dist,z:Math.cos(cam.theta)*flat};
}
// 점 p가 화면 어디에 오는지(정규화 좌표 -1~1, z = 카메라 앞 거리). 카메라는 (0,cam.y,0)을 본다.
export function viewNdc(cam,aspect,p){
  const c=cameraPosition(cam),f=norm3([-c.x,cam.y-c.y,-c.z]),r=norm3([-f[2],0,f[0]]),u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
  const d=[p.x-c.x,p.y-c.y,p.z-c.z],dot=v=>v[0]*d[0]+v[1]*d[1]+v[2]*d[2],z=dot(f);
  return {x:dot(r)/(z*halfV()*aspect),y:dot(u)/(z*halfV()),z};
}
// "집 전체": 고각 0.45로 기단 네 모서리부터 top(예상도 지붕)까지 화면 90% 안에 들어오는 가장 가까운 거리.
export function wholeCamera(scene,aspect,top=scene.height){
  const H=Math.max(scene.height,top),cam={theta:0.6,phi:WHOLE_PHI,dist:fitDist(aspect),y:H/2};
  const e=COLS/2+1.2,tx=TOWER_X+TOWER_W/2,tz=TOWER_Z+TOWER_W/2,pts=[{x:0,y:H,z:0},{x:e,y:0,z:e},{x:-e,y:0,z:e},{x:e,y:0,z:-e},{x:-e,y:0,z:-e},{x:e,y:H,z:e},{x:-e,y:H,z:-e},{x:tx,y:0,z:tz},{x:-tx,y:0,z:tz},{x:tx,y:0,z:-tz},{x:-tx,y:0,z:-tz}];
  const fits=()=>pts.every(p=>{const q=viewNdc(cam,aspect,p);return q.z>0.1&&Math.abs(q.x)<=0.9&&Math.abs(q.y)<=0.9;});
  for(let i=0;i<120&&!fits();i++)cam.dist*=1.05;
  return cam;
}

// ---------- T2A 재질 픽셀: DataTexture에 넣을 RGBA(이미지 파일 없음). 데이터 벽돌은 흰 바탕이라 인스턴스 색(DS6: 나이 금색)이 곱해져 그대로 보인다 ----------
export const TEX=Object.freeze({brick:[128,64],wall:[128,128],ground:[128,128],env:[64,32],dais:[128,128]});
export const WALL_TILE=8*ROW_H;   // 구조벽 무늬 한 장 = 8줄 높이의 정사각(줄 높이가 데이터 벽돌과 같다)
const clamp01=v=>v<0?0:v>1?1:v;
const smooth=t=>t*t*(3-2*t);
// 값 잡음. 격자를 pw×ph로 감아서 텍스처를 이어 붙여도 이음매가 없다.
function valueNoise(seed,x,y,cell,pw,ph){
  const gx=Math.floor(x/cell),gy=Math.floor(y/cell),fx=smooth(x/cell-gx),fy=smooth(y/cell-gy);
  const at=(i,j)=>hash01(seed,((i%pw)+pw)%pw,((j%ph)+ph)%ph);
  const a=at(gx,gy),b=at(gx+1,gy),c=at(gx,gy+1),d=at(gx+1,gy+1);
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
}
const put=(px,i,r,g,b)=>{px[i]=Math.round(clamp01(r)*255);px[i+1]=Math.round(clamp01(g)*255);px[i+2]=Math.round(clamp01(b)*255);px[i+3]=255;};
const rgbOf=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const hexOf=c=>'#'+c.map(v=>Math.round(clamp01(v)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
const mixHex=(a,b,t)=>{const x=rgbOf(a),y=rgbOf(b);return hexOf(x.map((v,i)=>v+(y[i]-v)*t));};

// V6C 금속 금벽돌 면(DataTexture는 y=0이 아래): 한 벽돌 안에 금 3단 — 위쪽 밝은 면(gold-hi 쪽) → 가운데 금(gold) → 아래 그늘(gold-deep 쪽),
// 위 모따기 = gold-hi 쪽, 아래 모따기 = gold-deep 쪽, 맨 가장자리 2px = gold-deep·gold-shadow 반반(벽돌 뒤 줄눈 판의 gold-shadow 선과 이어진다). 아주 옅은 가로 결(헤어라인)뿐, 구멍·얼룩 없음. broken이면 위 가장자리를 깎은 조각(반 칸)용.
export function brickTexels(seed=1,{broken=false}={}){
  const [w,h]=TEX.brick,px=new Uint8Array(w*h*4),G=TOWER_GOLD,[hi,mid,deep,shadow]=[G.hi,G.mid,G.deep,G.shadow].map(rgbOf);
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const t=(y+0.5)/h,edge=Math.min(x,w-1-x,y,h-1-y);
    let c=t>0.45?mix(mid,hi,0.9*smooth(clamp01((t-0.45)/0.45))):t<0.28?mix(mid,deep,0.5*smooth(clamp01((0.28-t)/0.28))):mid;
    if(edge<2)c=mix(deep,shadow,0.5);
    else if(edge<5)c=y>=h-5?mix(c,hi,0.85):y<5?mix(c,deep,0.55):c;
    const g=1+0.02*(hash01(seed+1,y,0)-0.5)+0.015*(valueNoise(seed,x,y,32,w/32,h/32)-0.5);
    c=c.map(v=>v*g);
    if(broken&&y>h-4-5*valueNoise(seed+3,x,0,8,w/8,1))c=mix(c,shadow,0.45);
    put(px,(y*w+x)*4,...c);
  }
  return px;
}
// 구조벽(데이터가 아닌 옆·뒤 벽): 엇갈려 쌓기 무늬 + 아이보리 대리석 돌. 줄 16px, 돌 32px, 줄눈 2px. V6C: 줄눈을 옅게(0.84→0.9) — 벽돌집보다 매끈한 석재로 보이게.
export function wallTexels(seed=2){
  const [w,h]=TEX.wall,px=new Uint8Array(w*h*4),CH=16,CW=32,M=2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const row=Math.floor(y/CH),xx=(x+(row%2)*CW/2)%w,col=Math.floor(xx/CW),joint=y%CH<M||xx%CW<M;
    const v=joint?0.9+0.02*hash01(seed+1,x,y):0.95+0.03*hash01(seed,row,col)+0.02*valueNoise(seed,x,y,8,w/8,h/8);
    put(px,(y*w+x)*4,v,v*0.985,v*0.955);
  }
  return px;
}
// 대지(단상 밖): 아이보리 석회암(ivory-1 쪽), 아주 옅은 얼룩. 잔디·흙 없음.
export function groundTexels(seed=3){
  const [w,h]=TEX.ground,px=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=0.965+0.02*valueNoise(seed,x,y,32,w/32,h/32)+0.01*valueNoise(seed+1,x,y,8,w/8,h/8);
    put(px,(y*w+x)*4,v,v*0.985,v*0.95);
  }
  return px;
}
// 아이보리 대리석 단상 윗면(원판 UV: 가운데 = 0.5,0.5): 비스듬한 아주 옅은 결 + 집 둘레 연한 접지 그늘(V6C: 0.16→0.08, 가운데 0.3 안쪽이 가장 진하고 0.55에서 사라진다).
export function daisTexels(seed=4){
  const [w,h]=TEX.dais,px=new Uint8Array(w*h*4),base=[0.98,0.97,0.94],vein=[0.9,0.86,0.78];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const n=valueNoise(seed,x,y,32,w/32,h/32),k=Math.pow(1-Math.abs(Math.sin((x*0.6+y*0.8)/9+5*n)),14)*0.55,d=Math.hypot((x+0.5)/w-0.5,(y+0.5)/h-0.5)*2;
    const ao=1-0.08*clamp01(1-(d-0.3)/0.25),g=0.99+0.01*valueNoise(seed+1,x,y,4,w/4,h/4);
    put(px,(y*w+x)*4,...base.map((c,i)=>(c+(vein[i]-c)*k)*ao*g));
  }
  return px;
}

// ---------- T2A 하늘: 시각(KST 시, 소수 허용)만으로 정해진다. 화면 파일이 시계를 읽어 넘긴다 ----------
// [시, 하늘 위, 지평선(=안개), 땅 반사, 해(달) 색, 해 세기, 반구광 세기, 밤 발광 0~1, 별 0~1]
// DS6: 낮 하늘은 지평선 아이보리 → 위 연금, 아침·저녁도 같은 금빛 계열(파란 하늘 없음).
// V6C: 밤도 아이보리→샴페인 계열(조금 깊은 샴페인 + 발광·별). DS6 밤 남색과 저녁 금색이 18~20시에 섞여 회갈색 안개·갈색 바닥이 되던 구간을 없앴다.
// 반구광을 해보다 상대적으로 키워 그림자가 연하다. 해 세기는 낮 1.8(DS6 2.4).
const SKY_KEYS=[
  [0,'#E4CFA4','#F4EBD9','#E2D3B6','#FFE4B8',0.9,2.5,1,1],
  [5,'#E4CFA4','#F4EBD9','#E2D3B6','#FFE4B8',0.9,2.5,1,1],
  [6.5,'#EBD8AE','#F9F1E2','#E8DCC4','#FFE6C2',1.4,2.4,0.25,0],
  [9,CHAMPAGNE,IVORY_1,'#EDE3CF','#FFF6E6',1.8,2.4,0,0],
  [16,CHAMPAGNE,IVORY_1,'#EDE3CF','#FFF6E6',1.8,2.4,0,0],
  [18,'#ECD5A6','#F8EEDB','#E6D8BC','#FFD9A0',1.4,2.5,0.4,0],
  [20,'#E4CFA4','#F4EBD9','#E2D3B6','#FFE4B8',0.9,2.5,1,1],
  [24,'#E4CFA4','#F4EBD9','#E2D3B6','#FFE4B8',0.9,2.5,1,1],
];
const norm3=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const MOON=norm3([-0.5,0.55,0.45]);
// 해: 6시 동쪽(+x)에서 떠서 18.5시 서쪽(-x)으로 진다. 앞면(+z)이 늘 조금 비치게 남쪽(+z) 성분을 둔다.
const dayDir=h=>{const a=Math.PI*(h-6)/12.5,el=0.12+1.0*Math.sin(a),hz=norm3([Math.cos(a),0,0.8]);return norm3([hz[0]*Math.cos(el),Math.sin(el),hz[2]*Math.cos(el)]);};
const lerp3=(a,b,t)=>norm3(a.map((v,i)=>v+(b[i]-v)*t));
export function skyAt(hour){
  const h=Number.isFinite(Number(hour))?((Number(hour)%24)+24)%24:12;
  let i=0;while(i<SKY_KEYS.length-2&&h>=SKY_KEYS[i+1][0])i++;
  const a=SKY_KEYS[i],b=SKY_KEYS[i+1],t=(h-a[0])/(b[0]-a[0]),num=k=>a[k]+(b[k]-a[k])*t;
  const dir=h>=6.5&&h<=18?dayDir(h):h>=5&&h<6.5?lerp3(MOON,dayDir(6.5),(h-5)/1.5):h>18&&h<20?lerp3(dayDir(18),MOON,(h-18)/2):MOON;
  const night=h>=20||h<5;
  return {hour:h,phase:night?'NIGHT':h<9?'MORNING':h<17?'DAY':'EVENING',night,
    top:mixHex(a[1],b[1],t),bottom:mixHex(a[2],b[2],t),ground:mixHex(a[3],b[3],t),
    sun:{dir,color:mixHex(a[4],b[4],t),intensity:num(5)},glow:num(7),stars:num(8),
    // 반구광은 하늘·땅 색을 흰색 쪽으로 당겨 쓴다(그늘 면이 하늘색으로 물들거나 밤에 새까맣게 되지 않게).
    hemi:{sky:mixHex(mixHex(a[1],b[1],t),'#FFFFFF',0.55),ground:mixHex(mixHex(a[3],b[3],t),'#FFFFFF',0.3),intensity:num(6)}};
}
// 별: 위쪽 반구에 황금각 나선으로 고르게(난수 없음). 단위 구 위의 점.
export const STAR_COUNT=200;
export function starField(n=STAR_COUNT){
  const out=new Float32Array(n*3);
  for(let i=0;i<n;i++){const y=0.06+0.94*(i+0.5)/n,r=Math.sqrt(1-y*y),a=i*2.399963229728653;out[i*3]=Math.cos(a)*r;out[i*3+1]=y;out[i*3+2]=Math.sin(a)*r;}
  return out;
}
// 금벽돌이 비출 작은 환경(등거리 원통 투영 64×32, 코드로 계산 — 외부 그림·환경 파일 없음).
// V6C: DS6은 하늘·땅을 그대로 비춰 거의 고른 베이지라 금속 벽돌이 한 가지 평면색(황토)이 됐다. 지금은 "작은 스튜디오"(대비가 있는 반사):
// 카메라가 위에서 내려다보므로 벽돌 앞면은 수평선 아래 6~36°를 비춘다 → 그 자리가 가장 밝은 띠(band). 수평선 바로 둘레는 샴페인으로 살짝 낮추고,
// 위는 아이보리(12~28°에 둘째 띠), 아래 50° 밑으로는 gold-shadow 쪽 그늘. 시각은 색만 조금(하늘 아래색 20%) 바꾸고 대비는 그대로, 해 자리에 밝은 점.
export const ENV_STUDIO=Object.freeze({top:'#FFFBF0',band:'#FFFFFF',horizon:CHAMPAGNE,floor:'#C9A86E',deep:TOWER_GOLD.shadow});
export function envTexels(sky){
  const [w,h]=TEX.env,px=new Uint8Array(w*h*4),S=ENV_STUDIO,[top,band,horizon,floor,deep]=[S.top,S.band,S.horizon,S.floor,S.deep].map(rgbOf);
  const tint=rgbOf(sky.bottom).map(v=>0.8+0.2*v),sun=rgbOf(sky.sun.color),[dx,dy,dz]=sky.sun.dir;
  const su=Math.atan2(dz,dx)/(2*Math.PI)+0.5,sv=Math.asin(Math.max(-1,Math.min(1,dy)))/Math.PI+0.5,glow=Math.min(1,sky.sun.intensity/2.6);
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),deg=Math.PI/180,bandAt=(e,a,b)=>smooth(clamp01((e-a)/(4*deg)))*smooth(clamp01((b-e)/(4*deg)));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=(y+0.5)/h,u=(x+0.5)/w,e=(v-0.5)*Math.PI;
    let c=e>=0?mix(horizon,top,smooth(clamp01(e/(40*deg)))):mix(mix(horizon,floor,smooth(clamp01((-e-36*deg)/(14*deg)))),deep,smooth(clamp01((-e-50*deg)/(35*deg))));
    c=mix(c,band,Math.max(bandAt(e,-36*deg,-6*deg),0.8*bandAt(e,12*deg,28*deg)));
    const du=Math.min(Math.abs(u-su),1-Math.abs(u-su)),d2=(du*2)**2+(v-sv)**2,spot=glow*Math.exp(-d2/0.004);
    put(px,(y*w+x)*4,...c.map((g,i)=>g*tint[i]+sun[i]*spot));
  }
  return px;
}

// ---------- T2A 쌓기 모션: 오늘 벽돌이 화면 오른쪽 위에서 날아와 놓인다 ----------
export const FLY_SECONDS=0.7,LAND_SECONDS=0.12,FLY_GAP=0.18,FLY_TOTAL=2.4,FLY_ARC=3.6,FLASH_SECONDS=0.3,DUST_SECONDS=0.5,DUST_POINTS=8,SHAKE=0.02,SHAKE_SECONDS=0.3;
// 장 사이 간격: 기본 0.18초, 많으면 줄여서 전체가 FLY_TOTAL을 넘지 않는다.
export function flyGap(n){return n<=1?0:Math.min(FLY_GAP,(FLY_TOTAL-FLY_SECONDS-LAND_SECONDS)/(n-1));}
export function flyTotal(n){return n<=0?0:(n-1)*flyGap(n)+FLY_SECONDS+LAND_SECONDS;}
// 출발점: 카메라 수평각 theta 기준 화면 오른쪽(7)·조금 위(2.5).
export function flyFrom(to,theta){return {x:to.x+Math.cos(theta)*7,y:to.y+2.5,z:to.z-Math.sin(theta)*7};}
// k번째(0부터) 벽돌, 전체 n장, t초. 2차 베지어(정점이 목표보다 높다)로 날며 반 바퀴 돈 뒤 착지해 잠깐 눌린다.
export function flyAt(k,n,t,to,from){
  const s=t-k*flyGap(n),u=s/FLY_SECONDS;
  if(u<=0)return {x:from.x,y:from.y,z:from.z,rotY:Math.PI,squash:1,started:false,landed:false,done:false};
  if(u<1){
    const q=(a,b,m)=>(1-u)*(1-u)*a+2*(1-u)*u*m+u*u*b;
    return {x:q(from.x,to.x,(from.x+to.x)/2),y:q(from.y,to.y,Math.max(from.y,to.y)+FLY_ARC-2.5),z:q(from.z,to.z,(from.z+to.z)/2),rotY:Math.PI*(1-u),squash:1,started:true,landed:false,done:false};
  }
  const l=(s-FLY_SECONDS)/LAND_SECONDS;
  if(l<1)return {x:to.x,y:to.y,z:to.z,rotY:0,squash:0.9+0.1*Math.max(0,l),started:true,landed:true,done:false};
  return {x:to.x,y:to.y,z:to.z,rotY:0,squash:1,started:true,landed:true,done:true};
}
// 착지 뒤 s초의 먼지 점 i(0~DUST_POINTS-1). 벽돌 앞 아래에서 옆·앞으로 퍼진다. 범위 밖이면 null.
export function dustAt(to,i,s){
  if(s<0||s>DUST_SECONDS)return null;
  const u=s/DUST_SECONDS,a=Math.PI*(i+0.5)/DUST_POINTS,r=0.1+0.6*u;
  return {x:to.x-Math.cos(a)*r,y:to.y-ROW_H/2+0.5*u*(1-u),z:to.z+BRICK_D/2+Math.sin(a)*r*0.7};
}
// 줄눈 번쩍임 세기(1→0), 마지막 벽돌 착지 때 카메라 미세 흔들림.
export const flashAt=s=>s<0||s>FLASH_SECONDS?0:1-s/FLASH_SECONDS;
export const shakeAt=s=>s<0||s>SHAKE_SECONDS?0:SHAKE*Math.sin(s*70)*(1-s/SHAKE_SECONDS);
// 자동 회전: 손대기 전까지 초당 6°, 최대 20초.
export const AUTO_ROTATE_RAD=6*Math.PI/180,AUTO_ROTATE_SECONDS=20;
export const autoRotateAt=t=>AUTO_ROTATE_RAD*Math.max(0,Math.min(AUTO_ROTATE_SECONDS,t));

// ---------- T2A 성능 등급: MID로 시작, 60프레임 p95<18ms면 HIGH로 한 번만 올리고, 30프레임 p95>24ms면 한 단계씩 내린다. SVG 판정(quality3d·framesTooSlow)은 따로 ----------
export const TIERS=Object.freeze({
  HIGH:Object.freeze({shadow:2048,pixelRatio:2,rounded:true,stars:true,dust:true,env:true}),
  MID:Object.freeze({shadow:1024,pixelRatio:1.5,rounded:false,stars:true,dust:true,env:true}),
  LOW:Object.freeze({shadow:0,pixelRatio:1,rounded:false,stars:false,dust:false,env:true}),   // 환경맵은 작아서(16px) LOW도 켠다: 없으면 금속 금벽돌이 검게 보인다
});
export const START_TIER='MID',PROMOTE_FRAMES=60,PROMOTE_P95_MS=18,DEMOTE_FRAMES=30,DEMOTE_P95_MS=24;
export function p95(list){if(!list.length)return null;const s=[...list].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(s.length*0.95)-1)];}
export function p50(list){if(!list.length)return null;const s=[...list].sort((a,b)=>a-b);return s[Math.floor((s.length-1)/2)];}
export function nextTier(tier,deltas,{promoted=false}={}){
  if(deltas.length>=DEMOTE_FRAMES&&p95(deltas.slice(-DEMOTE_FRAMES))>DEMOTE_P95_MS)return tier==='HIGH'?'MID':'LOW';
  if(tier==='MID'&&!promoted&&deltas.length>=PROMOTE_FRAMES&&p95(deltas.slice(-PROMOTE_FRAMES))<PROMOTE_P95_MS)return 'HIGH';
  return tier;
}

// ---------- T2A 세상(땅·하늘·안개·그림자 범위). 해는 세상에 고정이라 그림자는 장면이 바뀔 때만 다시 그린다 ----------
// 하늘 구는 카메라를 따라다니고(반지름 < 카메라 far 4000), 안개는 하늘 구보다 가까이에서 끝난다.
export const GROUND_R=160,SKY_R=3000;
export function fogRange(scene){const near=Math.max(40,scene.height*1.6);return {near,far:Math.min(SKY_R*0.8,near*4+120)};}
export function shadowBox(scene){
  const h=Math.max(houseTop(scene),4),r=Math.max(Math.hypot(HALF_W+1,h/2,HALF_D+1)+2,scene.parts?.FOUNDATION?14:0);   // 정원·나무(반지름 13.5)까지
  return {center:[0,h/2,0],radius:r};
}
