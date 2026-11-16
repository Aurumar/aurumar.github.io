// 3D 탑 그리기 (B44A, T2A). 배치는 tower-3d-layout.mjs가 계산하고 여기서는 WebGL로 그리기만 한다. 읽기만 하고 어떤 기록도 쓰지 않는다.
// 이미지 파일 없음(CSP img-src 'self'이지만 쓰지 않는다): 질감은 배치 파일이 계산한 픽셀로 DataTexture를 만든다. 인라인 style 없음: 캔버스 크기는 styles.css가 정하고 setSize(...,false)로 style을 건드리지 않는다.
// 실패(WebGL2 없음·저사양·첫 장면 오류·컨텍스트 손실·프레임 너무 느림)면 3D를 치우고 fallback(2.5D SVG 탑)을 다시 보인다. 같은 데이터다.
// T2A: 점토 벽돌·들어간 줄눈·금속 금벽돌·시각별 하늘과 해(세상에 고정)·정적 그림자·밤 발광·날아와 놓이는 오늘 벽돌·자동 회전·성능 등급(MID 시작).
// T2B: 나의 집(성) 부품·정원·크레인·비계·지붕 3단·완공 예상도(선)·시즌 표지(캔버스 위 SVG 글자, 속성만)·"이번 주/집 전체" 보기·완공 순간.
// T2C: 네 모퉁이 탑(누르면 영역 시트, 레벨이 오른 뒤 처음 보면 맥동)·업적 장식·현판 칭호 글자(같은 SVG 겹침층).
// DS6: 쌓은 벽돌 = 금속 금(환경맵 반사 + 해), 나이 3단계(오늘 빛 번짐·이번 주·지난 주), 아이보리 줄눈·구조벽, 대리석 단상, 금 예상도 선, 크레인, 꼭대기 태양 바퀴.
// V6C: 금 3단 질감 + 스튜디오 환경(대비) + gold-shadow 줄눈 선(습관 벽돌 날은 색만 다름) + 아이보리 바닥·하늘 + 가는 청동 크레인 + 위로 옅어지는 예상도 선 + 꼭대기 작은 금빛 점광. 광원 3개(반구광·해·점광), 보조광 없음.
import {WebGLRenderer,Scene,PerspectiveCamera,HemisphereLight,DirectionalLight,PointLight,BoxGeometry,ConeGeometry,SphereGeometry,CircleGeometry,CylinderGeometry,TorusGeometry,ExtrudeGeometry,Shape,BufferGeometry,BufferAttribute,MeshStandardMaterial,MeshBasicMaterial,PointsMaterial,InstancedMesh,Mesh,Points,Group,Object3D,Color,Fog,DataTexture,RGBAFormat,UnsignedByteType,RepeatWrapping,LinearFilter,LinearMipmapLinearFilter,SRGBColorSpace,EquirectangularReflectionMapping,PMREMGenerator,PCFSoftShadowMap,DoubleSide,Raycaster,Vector2,Vector3} from './three.module.js';
import {towerScene,quality3d,framesTooSlow,initialCamera,clampCamera,cameraPosition,FOV,GOLD,BRICK_W,BRICK_D,BRICK_GAP,ROW_H,TEX,WALL_TILE,brickTexels,wallTexels,groundTexels,envTexels,skyAt,starField,flyAt,flyFrom,dustAt,flashAt,shakeAt,autoRotateAt,AUTO_ROTATE_SECONDS,DUST_POINTS,DUST_SECONDS,FLASH_SECONDS,SHAKE_SECONDS,TIERS,START_TIER,nextTier,p50,p95,GROUND_R,SKY_R,fogRange,shadowBox,
  COLS,DEPTH,PHI,CRANE_UP,SPARKS,DONE_ROOF_DROP,blueprint,houseTop,wholeCamera,gateCamera,isTallHouse,startView,flyFirst,settleCamera,spinKeepsFront,WHOLE_VIEW_PAD,craneRows,completionAt,sparkAt,BONUS_SPARKS,BONUS_BURST_SECONDS,bonusFresh,bonusSparkAt,withBadges,houseLabels,towersToPulse,pulseAt,PULSE_SECONDS,
  BRICK_MATERIALS,MORTAR_IVORY,brickTint,DAIS,TOWER_GOLD,JOINT,jointRows,TOP_GLOW,topGlow,glowPulse,sunWheel,daisTexels,MARBLE,MORTAR_GLOW,CHAMPAGNE_WALL,BLACK_MARBLE,goldFrame,isGoldRow,isShadeFace,shadeWalls,
  backdropAt,warmGround,CONTACT_SHADOW,shadowTexels,spinStep,renderPixelRatio,isCoarsePointer,v10fTint,scaffoldOf,smallCrane,ROW_H as JOINT_ROW,
  goalFrame,GOAL_LINE,DOME,domeGlow,groundRings,ridgeLayers,daisTint} from './tower-3d-layout.mjs';
// V12E: 목표 높이 흰 선(이번 주 목표 = 흰 실선, 다음 단계 = 흰 점선, 캔버스 아래 범례 한 줄) 복구, 배경 = 해 쪽 금빛이 번지는 하늘 돔 + 그림자를 받는 넓은 바닥 원반(가장자리 안개) + 지평선 먼 능선 두 겹.
// V10F: 누르고 있는 동안만 회전 멈춤(떼면 다시 돈다), 화소 배율(PC 1.5~2·폰 ≤1.5), 그림자 지도 2배, MID도 둥근 벽돌, 빈 칸 판에 벽돌 줄눈, 짙은 금 받침·샴페인 금 모퉁이 탑·잔디 정원,
// 예상도(전체 높이 선·반투명 유리) 대신 다음 한 층 금 골조 + 작은 금 크레인.
// V8W6: 배경 = 지평선 아이보리 → 위 금 그라데이션(하늘 구, 안개는 V7T 그대로), 바닥 그림자(접지 원판), 반구광 땅 색을 은은한 금 반사로. 자동 회전은 40초에 한 바퀴, 손대면 멈추고 "다시 돌리기".
// 3D 무대(슬롯)는 첫 장면을 그린 뒤에만 보인다(그 전에는 대체 화면 그대로): 첫 장면 전 빈 캔버스가 흰 상자로 보이지 않게.

// V7T: 구조벽·바닥판 = 흰 대리석(베이지 #F1EADB·모래색 #E4D9C3 없음), 연속일 빛 띠 바탕 = 샴페인(갈색 #4A3F2E 없음), 먼지 = 흰 대리석 가루.
// V7T2: 쌓인 층 구조벽 = 옅은 샴페인 금(금속), 바닥판 = 금 처마(goldFrame 묶음). SLAB은 완공 지붕 기본색으로만 남는다.
const MORTAR=MORTAR_IVORY,CORE=CHAMPAGNE_WALL.color,SLAB=MARBLE.slab,WINDOW='#FFE9A8',MORTAR_DARK=TOWER_GOLD.line,DUST='#F2F0EB',TAP_PX=8,TAP_MS=500,ROTATE_PER_PX=0.008,ZOOM_PER_WHEEL=0.0012,KEY_ROTATE=0.2,KEY_ZOOM=0.9,FRAME_LOG=120,LIT_WINDOWS=1.2;
let active=null;
// V11A 3D 호스트 (V10HUNT M-12, 통제탑 2026-11-15): 3D 칸(캔버스 + WebGL 문맥)은 화면 그리기 밖(이 모듈의 active)에 산다. 같은 화면을 다시 그리면(시트 저장·칭호 저장 등)
// 새 자리 표시 칸 자리에 살아 있는 칸을 그대로 옮겨 붙이고, 그림 데이터(sceneOf의 key = 배치 결과·하늘·골조 전부, 느슨하게 하지 않는다)가 바뀌었을 때만 같은 캔버스·문맥 위에 장면을 새로 짓는다.
// 회전 각도·멈춤·카메라·등급은 이어 간다. 화면을 떠나 캔버스가 문서에서 빠지면 예전처럼 치운다(dispose). 살아 있는 3D가 없으면 false(부르는 쪽이 예전처럼 새로 만든다).
// V12E: 목표 높이 흰 선(goalFrame)은 골조로 줄이기 전 예상도(다음 시즌 경계)와 이번 주 하루 목표로 계산해 그림 데이터(data.goals)에 싣는다 — 키(data 전부)에 들어가 목표·다음 단계가 바뀌면 장면을 다시 짓는다.
const sceneOf=({ach,seasons=null,hour=12,titleTier=null,titleName=null,badges=null})=>{
  const house=withBadges(towerScene(ach,{seasons,titleTier}),badges,{titleName}),sky=skyAt(hour),plan=blueprint(house,seasons),scaf=scaffoldOf(plan),week=ach.currentWeek??null,data={...house,goals:goalFrame(house,plan,{goal:week?.goal??null})};
  return {data,sky,scaf,key:JSON.stringify([data,sky,scaf,ach.today??null,week?.monday??null,week?.bonus?.total??null,seasons?.at(-1)?.date??null])};
};
export function adoptTower3d(opts){return Boolean(active?.adopt(opts));}

// 상자 여러 개를 한 도형으로 합친다. UV는 면 안의 월드 좌표 / tile이라 층 높이가 달라도 구조벽 무늬 크기가 같다. 행에 color가 있으면 정점 색으로 싣는다.
// V7T2: 행에 top·under(위·아래 면), xs(±x 면), low(옆면 아래 가장자리) 색이 있으면 그 면·정점만 그 색(금 처마·기둥, goldFrame).
// V7T3: 행에 shadeFace가 있으면 그늘 면(키 라이트 반대쪽 옆면, isShadeFace)은 shadeFace(위) → shadeLow(아래 가장자리) 짙은 금.
const faceColor=(r,n,s,low)=>(n===1?(s>0?r.top:r.under):r.shadeFace&&isShadeFace(n,s)?(low&&r.shadeLow)||r.shadeFace:(low&&r.low)||(n===0&&r.xs))||r.color;
function worldBoxes(rows,tile){
  const pos=[],nor=[],uv=[],idx=[],col=[],c3=new Color(),colored=rows.some(r=>r.color);
  for(const r of rows){
    const c=[r.x,r.y,r.z],hs=[r.sx/2,r.sy/2,r.sz/2];
    for(const [n,a,b] of [[0,2,1],[1,0,2],[2,0,1]])for(const s of [-1,1]){
      const base=pos.length/3;
      for(const [i,j] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        const p=[0,0,0],q=[0,0,0];p[n]=c[n]+s*hs[n];p[a]=c[a]+i*hs[a];p[b]=c[b]+j*hs[b];q[n]=s;
        pos.push(...p);nor.push(...q);uv.push(p[a]/tile,p[b]/tile);
        if(colored){c3.set(faceColor(r,n,s,p[1]<c[1])??'#FFFFFF');col.push(c3.r,c3.g,c3.b);}
      }
      const ccw=((a+1)%3===b?1:-1)*s>0;   // e_a×e_b가 바깥 법선과 같은 쪽이면 그대로, 아니면 뒤집는다
      idx.push(...(ccw?[0,1,2,0,2,3]:[0,2,1,0,3,2]).map(k=>base+k));
    }
  }
  const g=new BufferGeometry();
  g.setAttribute('position',new BufferAttribute(new Float32Array(pos),3));g.setAttribute('normal',new BufferAttribute(new Float32Array(nor),3));g.setAttribute('uv',new BufferAttribute(new Float32Array(uv),2));
  if(colored)g.setAttribute('color',new BufferAttribute(new Float32Array(col),3));
  g.setIndex(idx);return g;
}
// V12E 바닥 원반: groundRings(반지름·곱할 색)의 고리마다 정점 seg+1개(가까운 곳 촘촘). xy 평면·법선 +z라 원판(CircleGeometry)처럼 눕혀 쓰고, UV도 원판과 같아 대지 질감 반복은 그대로.
function groundDisc(R,seg=96){
  const pos=[],nor=[],uv=[],col=[],idx=[],c=new Color();
  groundRings(R).forEach(({r,color},i)=>{
    c.set(color);
    for(let j=0;j<=seg;j++){const a=2*Math.PI*j/seg,x=Math.cos(a)*r,y=Math.sin(a)*r;pos.push(x,y,0);nor.push(0,0,1);uv.push(x/(2*R)+0.5,y/(2*R)+0.5);col.push(c.r,c.g,c.b);}
    if(i)for(let j=0;j<seg;j++){const a=(i-1)*(seg+1)+j,b=a+seg+1;idx.push(a,b,a+1,a+1,b,b+1);}
  });
  const g=new BufferGeometry();
  g.setAttribute('position',new BufferAttribute(new Float32Array(pos),3));g.setAttribute('normal',new BufferAttribute(new Float32Array(nor),3));g.setAttribute('uv',new BufferAttribute(new Float32Array(uv),2));g.setAttribute('color',new BufferAttribute(new Float32Array(col),3));
  g.setIndex(idx);return g;
}
// V12E 원경 능선: 겹마다 둘레 n칸, 아래(시선 각 below, 지평선 색) → 위(능선 높이 el[k], 옅은 능선 색) 띠. 먼 겹을 먼저 넣어 가까운 겹이 그 위에 그려진다.
function ridgeGeometry(layers,R){
  const pos=[],col=[],idx=[],c=new Color();
  for(const L of layers){
    const n=L.el.length-1,rr=L.r*R,base=pos.length/3;
    for(let k=0;k<=n;k++){
      const a=2*Math.PI*k/n;
      for(const [el,hex] of [[L.below,L.bottom],[L.el[k],L.top]]){pos.push(Math.cos(a)*rr*Math.cos(el),rr*Math.sin(el),Math.sin(a)*rr*Math.cos(el));c.set(hex);col.push(c.r,c.g,c.b);}
      if(k){const p=base+(k-1)*2;idx.push(p,p+1,p+2,p+1,p+3,p+2);}
    }
  }
  const g=new BufferGeometry();
  g.setAttribute('position',new BufferAttribute(new Float32Array(pos),3));g.setAttribute('color',new BufferAttribute(new Float32Array(col),3));
  g.setIndex(idx);return g;
}
// V12E: 하늘 구 + 원경 능선을 위치·색만 이어 붙인 한 도형으로(능선 색인은 하늘 정점 수만큼 민다).
function joinSky(sky,ridge){
  const n=sky.attributes.position.count,g=new BufferGeometry();
  const cat=(k,s)=>{const a=sky.attributes[k].array,b=ridge.attributes[k].array,o=new Float32Array(a.length+b.length);o.set(a);o.set(b,a.length);return new BufferAttribute(o,s);};
  g.setAttribute('position',cat('position',3));g.setAttribute('color',cat('color',3));
  g.setIndex([...sky.index.array,...Array.from(ridge.index.array,i=>i+n)]);return g;
}
// V10F: 완공 예상도 선(blueprintLines, 전체 높이 1px 선)은 없앴다 — 공사 중 맨 위층 금 골조(scaffoldOf)가 대신한다.
// HIGH·MID 등급의 둥근 모서리 벽돌(약 60삼각형). 진짜 벽돌 크기로 만든 뒤 1×1×1로 줄여서 인스턴스 크기를 그대로 곱한다.
export function roundedBrick(){
  const sy=ROW_H-BRICK_GAP,b=0.018,r=0.03,w=BRICK_W-2*b,h=sy-2*b,x0=-w/2,y0=-h/2,s=new Shape();
  s.moveTo(x0+r,y0);s.lineTo(x0+w-r,y0);s.quadraticCurveTo(x0+w,y0,x0+w,y0+r);s.lineTo(x0+w,y0+h-r);s.quadraticCurveTo(x0+w,y0+h,x0+w-r,y0+h);
  s.lineTo(x0+r,y0+h);s.quadraticCurveTo(x0,y0+h,x0,y0+h-r);s.lineTo(x0,y0+r);s.quadraticCurveTo(x0,y0,x0+r,y0);
  const g=new ExtrudeGeometry(s,{depth:BRICK_D-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:1,curveSegments:1});
  g.translate(0,0,-(BRICK_D-2*b)/2);g.scale(1/BRICK_W,1/sy,1/BRICK_D);
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){
    const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
    if(az>=ax&&az>=ay)uv.setXY(i,p.getX(i)+0.5,p.getY(i)+0.5);else if(ax>=ay)uv.setXY(i,p.getZ(i)+0.5,p.getY(i)+0.5);else uv.setXY(i,p.getX(i)+0.5,p.getZ(i)+0.5);
  }
  uv.needsUpdate=true;return g;
}

// keep(V11A, 안에서만): 장면을 다시 지을 때 이어 쓰는 캔버스·문맥·그리개(renderer)·미리 계산한 장면·회전·카메라·등급.
export function mountTower3d({doc,slot,fallback,ach,st=null,seasons=null,onFloor=null,onArea=null,hour=12,titleTier=null,titleName=null,badges=null,keep=null}){
  active?.dispose();
  const win=doc.defaultView,{data,sky,scaf,key}=keep?.scene??sceneOf({ach,seasons,hour,titleTier,titleName,badges}),bp=scaf?.bp??null,goals=data.goals,peak=Math.max(houseTop(data,bp),goals.top+1),room={height:peak};   // V12E: 다음 단계 흰 점선 꼭대기까지 끌어 올려 볼 수 있다
  // 안개는 예상도 꼭대기까지 기준, 대지는 안개 끝보다 넓게: "집 전체"로 멀리서 봐도 원판 가장자리가 하늘에 녹는다.
  const fog=fogRange(room),groundR=Math.max(GROUND_R,fog.far*1.5);
  const setMode=(mode,why)=>{slot.dataset.mode=mode;slot.dataset.reason=why;};
  const why=quality3d({cores:win.navigator?.hardwareConcurrency,memoryGb:win.navigator?.deviceMemory,instances:data.total});
  if(why!=='OK'){setMode('svg',why);return null;}
  const canvas=keep?.canvas??doc.createElement('canvas');
  canvas.className='tower-3d-canvas';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','3D 나의 집 '+data.floors.length+'층'+(data.empty?' · 받침과 1층 예상도':'')+'. 좌우 화살표로 돌리고 위아래 화살표로 층을 고르고 Enter로 그 주를 봅니다');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,powerPreference:'default'});
  if(!gl){setMode('svg','NO_WEBGL2');return null;}
  const hint=doc.createElement('p');hint.className='muted small tower-3d-hint';hint.textContent='끌어서 돌리고 위아래로 옮깁니다 · 휠이나 두 손가락으로 확대 · 모퉁이 탑을 누르면 그 영역을 봅니다';
  // V12E 범례 한 줄(흰 실선·흰 점선이 무엇인지). 목표 선이 없으면 없음.
  const legend=goals.legend?doc.createElement('p'):null;
  if(legend){legend.className='muted small tower-3d-legend';legend.textContent=goals.legend;}
  // 접힌 "3D 상태" 줄: 등급·프레임 시간·드로우콜(실기기 확인용, 소유자가 펼쳐 본다)
  const status=doc.createElement('details');status.className='tower-3d-status';
  const statusHead=doc.createElement('summary');statusHead.textContent='3D 상태';
  const statusText=doc.createElement('p');statusText.className='muted small';status.append(statusHead,statusText);
  // T2B: 캔버스와 글자 겹침층(SVG, 위치는 x·y 속성만 — 인라인 style 없음)을 한 무대에. 보기 칩 두 개는 그 위.
  // SVG 이름공간은 대체 화면(2.5D SVG 탑)의 것을 그대로 쓴다. 없으면 글자 없이 그린다(시즌 목록 DOM에 같은 내용이 있다).
  const SVG_NS=fallback.querySelector?.('svg')?.namespaceURI??null;
  const stage=doc.createElement('div');stage.className='tower-3d-stage';
  const tags=SVG_NS?doc.createElementNS(SVG_NS,'svg'):null;
  if(tags){tags.setAttribute('class','tower-3d-labels');tags.setAttribute('aria-hidden','true');}
  stage.append(...[canvas,tags].filter(Boolean));
  const views=doc.createElement('div');views.className='tower-3d-views';views.setAttribute('role','group');views.setAttribute('aria-label','3D 보기');
  const chips=[...(isTallHouse(data)?[['gate','집 앞']]:[]),['week','이번 주'],['whole','집 전체']].map(([key,label])=>{const b=doc.createElement('button');b.type='button';b.className='lb-chip';b.textContent=label;b.dataset.view=key;b.addEventListener('click',()=>setView(key));views.append(b);return b;});
  let disposed=false,raf=0,renderer=null,started=0,lastT=0,dragging=false,frames=0;
  const deltas=[],tierDeltas=[],frameLog=[],owned=[],pointers=new Map(),heard=[];   // heard(V11A): 이 장면이 캔버스에 단 듣개(장면을 다시 지을 때 뗀다)
  const reduced=Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  // 완공 순간: 수능 뒤 처음 연 탑에서 한 번(앱 실행 중 st.completedShown, 메모리뿐). 움직임 줄이기면 정지 화면 + 문구만.
  const end=seasons?.at(-1)??null,moment=Boolean(data.parts.ROOF_DONE&&!st?.completedShown);
  if(st&&data.parts.ROOF_DONE)st.completedShown=true;
  let celebrate=moment&&!reduced,celebrateFrom=null;
  const doneNote=moment?doc.createElement('p'):null;
  if(doneNote){doneNote.className='tower-3d-done';doneNote.textContent='완공! '+end.date+' · 1호 집이 완성됐어요';}
  // V11A: soft = 장면만 치운다(듣개·관찰·프레임·장면 자원). 캔버스·문맥·그리개는 다음 장면이 이어 쓴다.
  const dispose=soft=>{
    if(disposed)return;disposed=true;if(active===handle)active=null;
    if(raf)win.cancelAnimationFrame(raf);
    observer?.disconnect();watcher?.disconnect();seer?.disconnect();win.removeEventListener?.('blur',dropPointers);
    canvas.removeEventListener('webglcontextlost',onLost);doc.removeEventListener?.('visibilitychange',onVisible);
    for(const a of heard)canvas.removeEventListener(...a);
    for(const o of owned)o.dispose();
    if(soft===true){sun.shadow.map?.dispose();return;}
    renderer?.dispose();if(!gl.isContextLost())renderer?.forceContextLoss();
    views.remove();stage.remove();legend?.remove();doneNote?.remove();hint.remove();status.remove();
  };
  const toFallback=reason=>{dispose();fallback.hidden=false;slot.hidden=true;setMode('svg',reason);};
  const onLost=()=>toFallback('CONTEXT_LOST');
  // V11A 3D 호스트: 새 그리기의 자리 표시 칸(next.slot) 자리에 이 칸을 그대로 옮겨 붙인다. 대체 그림·누르면 여는 시트는 새 그리기의 것으로 바꾼다.
  // 그림 데이터가 같으면 장면은 그대로(갱신 0). 다르면 이 장면만 치우고 같은 캔버스·문맥·그리개에 새 데이터로 짓는다(갱신 1). 새 장면이 못 서면 예전처럼 대체 그림.
  const adopt=next=>{
    if(disposed||next.doc!==doc||!next.slot||!next.fallback)return false;
    if(next.slot!==slot){if(!next.slot.parentNode)return false;next.slot.replaceWith(slot);}
    fallback=next.fallback;fallback.hidden=!slot.hidden;onFloor=next.onFloor??null;onArea=next.onArea??null;
    // V11FIX N-3: 배치 계산·다시 짓기는 이제 그리기 차례 안에서 돈다. 던져도 화면을 깨지 않게 3D를 치우고 새 그리기의 2.5D를 보인다(예전 import().then 경로의 catch와 같은 결과).
    try{
      const s=sceneOf(next);if(s.key===key)return true;
      dispose(true);
      const h=mountTower3d({...next,slot,fallback,keep:{canvas,gl,renderer,scene:s,cam,spin,tier,promoted}});
      if(!h){renderer.dispose();if(!gl.isContextLost())renderer.forceContextLoss();canvas.remove();slot.hidden=true;fallback.hidden=false;}
    }catch{
      if(active&&active!==handle)active.dispose();
      if(!disposed)toFallback('ADOPT_FAILED');
      else{renderer.dispose();if(!gl.isContextLost())renderer.forceContextLoss();canvas.remove();slot.hidden=true;fallback.hidden=false;setMode('svg','ADOPT_FAILED');}
    }
    return true;
  };
  const handle={dispose,canvas,adopt};
  let observer=null,watcher=null,seer=null;
  canvas.addEventListener('webglcontextlost',onLost);
  try{renderer=keep?.renderer??new WebGLRenderer({canvas,context:gl,antialias:true,alpha:true});}catch{toFallback('RENDERER_FAILED');return null;}
  renderer.setClearColor(new Color(sky.bottom),1);
  renderer.shadowMap.type=PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;   // 해가 고정이라 그림자는 장면이 바뀔 때만 다시 그린다

  // 장면: 인스턴스 묶음마다 InstancedMesh 하나. 위치·색은 배치 계산 결과를 그대로 쓴다.
  const scene=new Scene(),camera=new PerspectiveCamera(FOV,1,0.1,4000),dummy=new Object3D(),tint=new Color();
  const own=x=>{owned.push(x);return x;};
  const cube=own(new BoxGeometry(1,1,1)),cone=own(new ConeGeometry(1,1,4));
  const texStart=win.performance.now(),aniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());   // V10F: 4 → 8(비스듬한 벽 질감이 덜 뭉개진다)
  const texture=(px,[w,h],repeat=1)=>{
    const t=own(new DataTexture(px,w,h,RGBAFormat,UnsignedByteType));
    t.wrapS=t.wrapT=RepeatWrapping;t.magFilter=LinearFilter;t.minFilter=LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=aniso;t.colorSpace=SRGBColorSpace;t.repeat.set(repeat,repeat);t.needsUpdate=true;return t;
  };
  const brickTex=texture(brickTexels(1),TEX.brick),brokenTex=texture(brickTexels(5,{broken:true}),TEX.brick),wallTex=texture(wallTexels(),TEX.wall),groundTex=texture(groundTexels(),TEX.ground,groundR/4),daisTex=texture(daisTexels(),TEX.dais);
  slot.dataset.texMs=(win.performance.now()-texStart).toFixed(1);
  // V6C 금속 금벽돌: 금 3단 질감(밝은 면·중간·그늘 + gold-shadow 테두리) × 인스턴스 색(나이 밝기). 금속이라 스튜디오 환경맵(applyTier)이 밝기를 만든다. 범프 없음(모따기는 질감이 그린다).
  const brickMat=own(new MeshStandardMaterial({map:brickTex,...BRICK_MATERIALS.brick}));
  const halfMat=own(new MeshStandardMaterial({map:brokenTex,...BRICK_MATERIALS.half}));
  const goldMat=own(new MeshStandardMaterial({map:brickTex,...BRICK_MATERIALS.gold,emissive:TOWER_GOLD.hi,emissiveIntensity:0.1+0.2*sky.glow}));
  const todayMat=own(new MeshStandardMaterial({map:brickTex,...BRICK_MATERIALS.today}));
  // 첨탑·태양 바퀴: 질감 없는 매끈한 금(벽돌 질감의 테두리 선이 원뿔·고리에 붙지 않게)
  const trimMat=own(new MeshStandardMaterial({color:TOWER_GOLD.mid,metalness:1,roughness:0.3}));
  const craneMat=own(new MeshStandardMaterial({roughness:0.5,metalness:0.5,vertexColors:true}));
  // 줄눈: 습관 XP 밝기 = 금빛 발광 세기. 인스턴스 색의 파랑을 줄여 밝기를 싣고, 발광에 (1-파랑)을 곱한다.
  // V7T: 레몬색으로 뜨던 빈 칸(파랑 0.85까지 빼고 GOLD 발광) → 파랑은 MORTAR_GLOW.blue만큼만 빼고 밝은 금(light)으로 은은하게.
  // V7T2: 빈 칸 줄눈 판도 쌓인 층의 구조벽 바깥면이라 흰색 대신 옅은 샴페인 금 금속(구조벽과 같은 값, 환경맵). 습관 빛(발광)은 그대로.
  const mortarMat=own(new MeshStandardMaterial({color:CORE,roughness:CHAMPAGNE_WALL.roughness,metalness:CHAMPAGNE_WALL.metalness,emissive:TOWER_GOLD.light,emissiveIntensity:0.5+1.1*sky.glow}));
  // V10F 빈 칸 판 벽돌 줄눈: 판 안 위치(아래·왼쪽에서 잰 길이 = 상자 좌표 × 인스턴스 크기)로 줄 높이마다 가로 줄눈, 칸 가장자리에 세로 줄눈을 짙게(fwidth로 계단 없이). 질감·파일 없음.
  mortarMat.onBeforeCompile=sh=>{
    sh.vertexShader='varying vec2 vLbCell;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n\tvLbCell=vec2((position.x+0.5)*length(instanceMatrix[0].xyz),(position.y+0.5)*length(instanceMatrix[1].xyz));');
    sh.fragmentShader='varying vec2 vLbCell;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= 1.0 - vColor.b;')
      .replace('#include <color_fragment>','#include <color_fragment>\n\t{float r='+JOINT_ROW.toFixed(2)+';float dy=abs(fract(vLbCell.y/r+0.5)-0.5)*r,dx=min(vLbCell.x,1.0-vLbCell.x),w=fwidth(vLbCell.y)+fwidth(vLbCell.x);\n\tfloat j=1.0-smoothstep(0.022,0.022+w,min(dy,dx));diffuseColor.rgb*=1.0-0.22*j;}');
  };
  // V6C 줄눈 선 판(벽돌 뒤): gold-shadow, 습관 벽돌 날은 JOINT.habit. 틈으로만 보이는 가는 선이라 조명 계산 없는 재질(가장 싸다), 벽돌 다음에 그려 가려진 픽셀은 깊이 검사로 건너뛴다.
  const jointMat=own(new MeshBasicMaterial({color:0xffffff}));
  // V7T2: 구조벽 = 옅은 샴페인 금 금속(환경맵). 금 뼈대 묶음 = 정점 색 × 금속(환경맵): 금 정점은 금속 금, 검은 대리석 정점은 거의 검고 환경맵만 은은하게 비친다(셰이더 치환 추가 없음, T2A-7).
  // V7T3: 구조벽 색은 정점 색(shadeWalls: 빛 받는 면 샴페인 금 CORE, 그늘 면 짙은 금)으로 옮겼다. 재질 값은 V7T2 그대로.
  const coreMat=own(new MeshStandardMaterial({vertexColors:true,map:wallTex,bumpMap:wallTex,bumpScale:0.4,roughness:CHAMPAGNE_WALL.roughness,metalness:CHAMPAGNE_WALL.metalness}));
  const frameMat=own(new MeshStandardMaterial({vertexColors:true,roughness:BLACK_MARBLE.roughness,metalness:BLACK_MARBLE.metalness}));
  // 창: 밤이면 켜지고, 완공된 집은 늘 전부 켜져 있다(완공 순간에는 0에서 켜진다).
  const winGlow=0.3+0.9*sky.glow,windowMat=own(new MeshStandardMaterial({color:WINDOW,emissive:WINDOW,emissiveIntensity:data.parts.ROOF_DONE&&!celebrate?LIT_WINDOWS:winGlow,roughness:0.3,metalness:0}));
  const glow=own(new MeshBasicMaterial({color:0xffffff}));
  // T2B 성 부품 재질: 돌(구조벽 질감 × 정점 색)·단색(정점 색)·은/금 장식(금속)·꽃과 나무·원뿔 지붕.
  const stoneMat=own(new MeshStandardMaterial({map:wallTex,bumpMap:wallTex,bumpScale:0.3,roughness:0.9,metalness:0,vertexColors:true}));
  const plainMat=own(new MeshStandardMaterial({roughness:0.82,metalness:0,vertexColors:true}));
  const ornMat=own(new MeshStandardMaterial({color:0xffffff,metalness:0.7,roughness:0.3}));
  const leafMat=own(new MeshStandardMaterial({roughness:0.9,metalness:0}));
  // V7T: 완공 지붕 = 금속 금(환경맵), 단상 = 광택 흰 대리석(거칠기 0.18, 환경맵으로 은은한 반사, 금속 아님).
  const roofMat=own(new MeshStandardMaterial({color:data.cone?.color??SLAB,roughness:0.3,metalness:0.9}));
  const daisMat=own(new MeshStandardMaterial({map:daisTex,roughness:0.18,metalness:0})),daisSideMat=own(new MeshStandardMaterial({color:DAIS.side,roughness:0.3,metalness:0.9}));
  daisMat.color.set(daisTint(sky));   // V13: 단상 윗면 = 보일 색 ÷ (노출 + 환경 조도). 흰색 그대로면 한낮 빛 + 환경맵에 넘쳐 화면 아래가 255 흰 판(V12HUNT 2-10 "왼쪽 아래 밝은 평면")
  const lit=[brickMat,halfMat,goldMat,todayMat,trimMat,craneMat,daisMat,daisSideMat,mortarMat,coreMat,frameMat,windowMat,stoneMat,plainMat,ornMat,leafMat,roofMat];

  const place=(mesh,i,r)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,0,0);dummy.scale.set(r.sx,r.sy,r.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  // 벽돌: p(비행 자세)가 있으면 그 위치·회전·눌림으로, 아직 출발 전이면 숨긴다. 눌림은 바닥을 붙인 채 높이만 줄인다.
  const placeBrick=(mesh,j,r,p=null)=>{
    const sq=p?p.squash:1,k=p&&!p.started?1e-4:1;
    dummy.position.set(p?p.x:r.x,(p?p.y:r.y)-r.sy*(1-sq)/2,p?p.z:r.z);dummy.rotation.set(0,(r.rotY??0)+(p?p.rotY:0),0);
    dummy.scale.set(r.sx*k,r.sy*sq*k,r.sz*k);dummy.updateMatrix();mesh.setMatrixAt(j,dummy.matrix);
  };
  const instanced=(geo,mat,rows,colorOf,{cast=false,receive=false}={})=>{
    if(!rows.length)return null;
    const mesh=new InstancedMesh(geo,mat,rows.length);mesh.frustumCulled=false;mesh.castShadow=cast;mesh.receiveShadow=receive;own(mesh);
    rows.forEach((r,i)=>{place(mesh,i,r);mesh.setColorAt(i,colorOf(r));});
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;scene.add(mesh);return mesh;
  };
  const fixed=hex=>{const c=new Color(hex);return ()=>c;};
  // 데이터 벽돌은 재질별 네 묶음(온전·조각·금·오늘). slotOf[i] = 배치 배열 i번 벽돌이 어느 묶음 몇 번째인지. 색은 과목 색 대신 나이 금(brickTint).
  const sets=[{mat:brickMat,rows:[]},{mat:halfMat,rows:[]},{mat:goldMat,rows:[]},{mat:todayMat,rows:[]}],slotOf=[];
  data.bricks.forEach(r=>{const s=sets[r.today?3:r.gold?2:r.half?1:0];slotOf.push({s,j:s.rows.length});s.rows.push(r);});
  for(const s of sets){
    if(!s.rows.length)continue;
    s.mesh=new InstancedMesh(cube,s.mat,s.rows.length);s.mesh.frustumCulled=false;s.mesh.castShadow=true;s.mesh.receiveShadow=true;own(s.mesh);
    s.rows.forEach((r,j)=>{placeBrick(s.mesh,j,r);s.mesh.setColorAt(j,tint.set(brickTint(data,r)).multiplyScalar(r.shade??1));});
    s.mesh.instanceMatrix.needsUpdate=true;s.mesh.instanceColor.needsUpdate=true;scene.add(s.mesh);
  }
  const mortarTint=b=>tint.setRGB(1,1-MORTAR_GLOW.green*b,1-MORTAR_GLOW.blue*b);
  const mortarMesh=instanced(cube,mortarMat,data.mortar,r=>mortarTint(r.brightness),{receive:true});
  const mortarAt=new Map(data.mortar.map((m,i)=>[m.floor+':'+m.col,i]));
  const joints=jointRows(data),jointBase=new Color(JOINT.base),jointHabit=new Color(JOINT.habit),jointFlash=new Color(TOWER_GOLD.hi);
  const jointTint=(r,f=0)=>tint.copy(r.habit?jointHabit:jointBase).lerp(jointFlash,f);
  const jointMesh=instanced(cube,jointMat,joints,r=>jointTint(r));if(jointMesh)jointMesh.renderOrder=1;
  const jointAt=new Map(joints.map((r,i)=>[r.floor+':'+r.col,i]));
  slot.dataset.joints=String(joints.length);slot.dataset.habitJoints=String(joints.filter(r=>r.habit).length);
  const coreMesh=new Mesh(own(worldBoxes(shadeWalls(data.cores),WALL_TILE)),coreMat);coreMesh.castShadow=coreMesh.receiveShadow=true;scene.add(coreMesh);
  const frameMesh=new Mesh(own(worldBoxes(v10fTint(goldFrame(data,[...data.plain,...data.badgeRows].filter(isGoldRow))),WALL_TILE)),frameMat);frameMesh.castShadow=frameMesh.receiveShadow=true;scene.add(frameMesh);   // V7T2: 옛 바닥판 묶음 자리(드로우콜 그대로)
  instanced(cube,windowMat,data.windows,fixed('#FFFFFF'));
  const dark=new Color(MORTAR_DARK),gold=new Color(GOLD);
  instanced(cube,glow,data.bands,r=>tint.copy(dark).lerp(gold,r.brightness));
  instanced(cube,glow,[...data.rails,...data.bonus],r=>tint.set(r.color));   // Q1B 금빛 기둥은 난간과 한 묶음(드로우콜을 늘리지 않는다)
  instanced(cube,glow,data.lamps,r=>tint.set(r.color));
  instanced(cone,trimMat,data.spire,fixed('#FFFFFF'),{cast:true});
  // T2B 성 부품: 장면이 정지해 있으니 돌·단색 상자는 묶음마다 한 도형으로 합친다(드로우콜 1개씩).
  const merged=(rows,mat,parent=scene)=>{if(!rows.length)return null;const m=new Mesh(own(worldBoxes(rows,WALL_TILE)),mat);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  merged(v10fTint(data.stone.filter(r=>!r.base)),stoneMat);merged(v10fTint([...data.plain,...data.badgeRows].filter(r=>!isGoldRow(r))),plainMat);   // V10F: 흰 모퉁이 탑·받침판 → 샴페인 금 돌, 흰 화단 → 잔디·모래   // T2C 업적 장식은 단색 묶음에 합친다. V7T2: 기단·계단(base)·금 문·현판은 금 뼈대 묶음
  instanced(cube,windowMat,data.glass,fixed('#FFFFFF'));
  instanced(cone,ornMat,data.ornaments,r=>tint.set(r.color),{cast:true});
  instanced(cube,leafMat,data.flowers,r=>tint.set(r.color));
  instanced(own(new ConeGeometry(0.5,1,8)),leafMat,[...data.crowns,...data.towerRoofs],r=>tint.set(r.color),{cast:true,receive:true});   // T2C 모퉁이 탑 지붕은 나무 머리와 같은 원뿔 묶음
  instanced(cube,glow,data.flames,r=>tint.set(r.color));
  // 완공 지붕(사각뿔, 면이 벽과 나란하게 45° 돌림)과 그 위 깃대·깃발·현판은 한 묶음: 완공 순간에 함께 내려앉는다.
  const roofGroup=new Group();scene.add(roofGroup);
  if(data.cone){
    const g=own(new ConeGeometry(1,1,4));g.rotateY(Math.PI/4);
    const m=new Mesh(g,roofMat);m.position.set(data.cone.x,data.cone.y,data.cone.z);m.scale.set(data.cone.r,data.cone.h,data.cone.r);m.castShadow=m.receiveShadow=true;roofGroup.add(m);
  }
  merged(data.crest,plainMat,roofGroup);
  // 크레인: 공사 중이면 서 있고, 완공 순간에는 서 있다가 땅으로 내려간다. 금속 재질(V6C: 짙은 청동 가는 선 + 금 갈고리).
  // V10F: 공사 중(골조가 있으면)은 집 높이 + 4짜리 땅 크레인 대신 골조 위 작은 금 크레인. 완공 순간 연출은 그대로.
  const craneMesh=merged(celebrate?craneRows(data.height):scaf?smallCrane(scaf.bp.roof):data.crane,craneMat);
  // DS6 상표 태양 바퀴: 고리 1개 + 살·축·받침 기둥 한 묶음(드로우콜 2). 금 재질(V6C 매끈한 금), 그림자 없음.
  const wheel=sunWheel(data);
  if(wheel){
    const ring=new Mesh(own(new TorusGeometry(wheel.r,wheel.tube,6,32)),trimMat);ring.position.set(wheel.x,wheel.y,wheel.z);scene.add(ring);
    const parts=[...wheel.spokes,wheel.hub,wheel.post],m=new InstancedMesh(cube,trimMat,parts.length);m.frustumCulled=false;own(m);
    parts.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,0,r.rotZ??0);dummy.scale.set(r.sx,r.sy,r.sz);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,tint.set('#FFFFFF'));});
    m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;scene.add(m);
  }
  let sparkGeo=null,sparkPos=null;
  const apex=data.cone?{x:0,y:data.cone.y+data.cone.h/2,z:0}:null;
  if(celebrate){
    roofGroup.position.y=DONE_ROOF_DROP;
    sparkGeo=own(new BufferGeometry());sparkPos=new Float32Array(SPARKS*3).fill(-1000);sparkGeo.setAttribute('position',new BufferAttribute(sparkPos,3));
    const sparks=new Points(sparkGeo,own(new PointsMaterial({color:GOLD,size:0.16,transparent:true,opacity:0.95,depthWrite:false})));sparks.frustumCulled=false;scene.add(sparks);
  }
  // V10F 공사 중 맨 위층(소유자 "흰 판·와이어 골조가 어색"): 예상도 선(1px)·아이보리 반투명 유리 대신 다음 한 층 자리에 얇은 금 골조(매끈한 금 상자, 그림자 드리움). 빈 집은 받침 위 1층 골조.
  if(scaf)instanced(cube,trimMat,scaf.rows,fixed('#FFFFFF'),{cast:true});
  slot.dataset.scaffold=scaf?String(scaf.rows.length):'0';
  // V12E 목표 높이 흰 선: 이번 주 목표(흰 실선)·다음 단계(흰 점선) 얇은 상자 한 묶음(드로우콜 1). 빛을 받지 않는 불투명 흰색이라 그늘·밤에도 밝고, 안개를 받지 않아 높은 점선도 흐려지지 않는다. 그림자 없음.
  const goalMat=own(new MeshBasicMaterial({color:0xffffff,fog:false}));
  const goalMesh=instanced(cube,goalMat,goals.rows,r=>tint.set(r.color));if(goalMesh)goalMesh.renderOrder=2;
  slot.dataset.goalWeek=goals.week?String(goals.week.goal):'';slot.dataset.goalNext=goals.next?.k??'';slot.dataset.goalRows=String(goals.rows.length);
  // 글자 표지: 현판 칭호·머릿돌·예상도 시즌 경계(이름 · D-n)·지난 시즌 현판·완공 현판(houseLabels가 최대 MAX_LABELS개로 고른다).
  const labels=!tags?[]:houseLabels(data,bp,goals).map(l=>{
    const t=doc.createElementNS(SVG_NS,'text');t.setAttribute('class','tower-3d-tag tower-3d-tag-'+l.kind.toLowerCase());t.setAttribute('visibility','hidden');t.textContent=l.text;tags.append(t);
    // 글자 폭 어림(12px 굵은 글꼴: 한글 12px, 그 밖 7px) — 화면에서 겹치는 글자는 뒤 순서를 숨긴다.
    const width=[...l.text].reduce((n,ch)=>n+(ch.charCodeAt(0)>0x2E80?12:7),0);
    return {node:t,at:new Vector3(l.x,l.y,l.z),width,start:l.kind==='PLAN'||l.kind==='GOAL',front:Boolean(l.front)};
  });
  const v3=new Vector3();
  const placeLabels=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight,shown=[];
    for(const l of labels){
      v3.copy(l.at).project(camera);
      const x=(v3.x+1)/2*w,y=(1-v3.y)/2*h,lo=l.start?x:x-l.width/2,hi=lo+l.width;
      const show=Boolean(w&&h)&&(!l.front||camera.position.z>l.at.z)&&v3.z<1&&Math.abs(v3.x)<=1&&Math.abs(v3.y)<=1&&!shown.some(s=>Math.abs(s.y-y)<16&&lo<s.hi&&hi>s.lo);
      l.node.setAttribute('visibility',show?'visible':'hidden');
      if(show){shown.push({y,lo,hi});l.node.setAttribute('x',x.toFixed(1));l.node.setAttribute('y',y.toFixed(1));}
    }
  };
  // 층 고르기용 보이지 않는 상자(그리지 않고 광선 검사만 한다)
  const hitMesh=new InstancedMesh(cube,own(new MeshBasicMaterial()),data.hits.length);hitMesh.visible=false;own(hitMesh);
  data.hits.forEach((r,i)=>place(hitMesh,i,r));hitMesh.updateMatrixWorld();
  // T2C 모퉁이 탑 고르기용 숨은 상자 4개(Lv1 주춧돌도 누르기 쉽게 높이를 둔다)
  const towerHit=new InstancedMesh(cube,own(new MeshBasicMaterial()),data.towers.length);towerHit.visible=false;own(towerHit);
  data.towers.forEach((t,i)=>place(towerHit,i,t.hit));towerHit.updateMatrixWorld();
  const picked=new Mesh(cube,own(new MeshBasicMaterial({color:GOLD,wireframe:true})));picked.visible=false;scene.add(picked);

  // 세상: 대리석 단상(윗면 y=0)·그 아래 아이보리 대지·하늘(카메라를 따라다니는 큰 구, 정점 색 그라데이션)·별·안개·반구광·세상에 고정된 해(밤에는 달)·V6C 꼭대기 작은 금빛 점광.
  // V12E 바닥: 평평한 한 색 원판 → 그림자를 받는 넓은 원반(groundDisc, 단상 둘레 옅은 금 모래 → 포장 고리 세 겹 → 바깥 흰색 → 안개). 질감·재질 값은 그대로, 정점 색만 곱한다. 계단 띠 없게 디더링.
  const ground=new Mesh(own(groundDisc(groundR)),own(new MeshStandardMaterial({map:groundTex,roughness:0.9,metalness:0,vertexColors:true,dithering:true})));ground.rotation.x=-Math.PI/2;ground.position.y=-DAIS.h;ground.receiveShadow=true;scene.add(ground);
  const dais=new Mesh(own(new CylinderGeometry(DAIS.r,DAIS.r+0.25,DAIS.h,96)),[daisSideMat,daisMat,daisSideMat]);dais.position.y=-DAIS.h/2;dais.receiveShadow=true;scene.add(dais);
  // V8W6: 하늘 구 = 지평선 아이보리(sky.bottom, 안개와 같은 색) → 위로 금(backdropAt). 흰 상자 대신 아이보리→금 배경.
  // V12E 하늘 돔: 조각 32×16 → 64×32, 아이보리→금(backdropAt) 위에 해 쪽 금빛 번짐·지평선 밝은 안개 띠(domeGlow, 밤에는 번짐을 줄인다), 디더링.
  const skyGeo=own(new SphereGeometry(SKY_R,...DOME.segments)),skyCol=new Float32Array(skyGeo.attributes.position.count*3),sp=skyGeo.attributes.position,domeWarm=new Color(DOME.glow),domeHaze=new Color(DOME.haze),warmth=sky.night?0.35:1;
  for(let i=0;i<skyGeo.attributes.position.count;i++){
    const d=domeGlow(sp.getX(i)/SKY_R,sp.getY(i)/SKY_R,sp.getZ(i)/SKY_R,sky.sun.dir);
    tint.set(backdropAt(skyGeo.attributes.position.getY(i)/SKY_R,sky.bottom)).lerp(domeWarm,d.glow*warmth).lerp(domeHaze,d.haze);skyCol.set([tint.r,tint.g,tint.b],i*3);
  }
  skyGeo.setAttribute('color',new BufferAttribute(skyCol,3));
  // V12E 원경: 지평선 먼 능선 두 겹(ridgeLayers)을 하늘 구와 한 도형으로(joinSky, 능선 색인이 뒤라 하늘 위에 그려진다. 드로우콜 그대로 1). 깊이를 쓰지 않아 땅·집이 덮는다. 능선은 양면.
  const skyGroup=new Group(),skyMesh=new Mesh(own(joinSky(skyGeo,own(ridgeGeometry(ridgeLayers(sky.bottom),SKY_R)))),own(new MeshBasicMaterial({vertexColors:true,side:DoubleSide,fog:false,depthWrite:false,dithering:true})));
  skyMesh.renderOrder=-1;skyMesh.frustumCulled=false;skyGroup.add(skyMesh);
  const starGeo=own(new BufferGeometry());starGeo.setAttribute('position',new BufferAttribute(starField().map(v=>v*SKY_R*0.9),3));
  const stars=new Points(starGeo,own(new PointsMaterial({color:0xffffff,size:2,sizeAttenuation:false,fog:false,transparent:true,opacity:sky.stars,depthWrite:false})));
  stars.frustumCulled=false;stars.visible=false;skyGroup.add(stars);scene.add(skyGroup);
  scene.fog=new Fog(sky.bottom,fog.near,fog.far);
  // V8W6 바닥 그림자: 단상 둘레 둥근 접지 그림자(알파 원판, 그림자 지도가 꺼진 LOW 등급에서도 보인다). 단상 아래 대지 위에 깔고 깊이를 쓰지 않는다.
  const shadowN=CONTACT_SHADOW.size,shadowTex=own(new DataTexture(shadowTexels(shadowN),shadowN,shadowN,RGBAFormat,UnsignedByteType));shadowTex.magFilter=LinearFilter;shadowTex.minFilter=LinearFilter;shadowTex.needsUpdate=true;
  // V8FIX H-01: three는 alphaMap의 G 채널을 읽는데 질감은 알파에만 흐림이 있어(RGB 255) 단단한 회색 원판이 됐다 → 흐림은 map의 알파로 준다(흰 RGB × 그림자 색 그대로).
  const contact=new Mesh(own(new CircleGeometry(DAIS.r*CONTACT_SHADOW.scale,64)),own(new MeshBasicMaterial({color:CONTACT_SHADOW.color,map:shadowTex,alphaMap:shadowTex,transparent:true,opacity:CONTACT_SHADOW.opacity,depthWrite:false})));
  contact.rotation.x=-Math.PI/2;contact.position.y=-DAIS.h+0.01;contact.renderOrder=0;scene.add(contact);
  const hemi=new HemisphereLight(sky.hemi.sky,warmGround(sky.hemi.ground),sky.hemi.intensity),sun=new DirectionalLight(sky.sun.color,sky.sun.intensity);   // V8W6: 땅 색 = 금 바닥 반사(금속 면 아래쪽이 금빛)
  const sb=shadowBox(data),[dx,dy,dz]=sky.sun.dir;
  sun.target.position.set(...sb.center);sun.position.set(sb.center[0]+dx*sb.radius*2,sb.center[1]+dy*sb.radius*2,sb.center[2]+dz*sb.radius*2);
  Object.assign(sun.shadow.camera,{left:-sb.radius,right:sb.radius,top:sb.radius,bottom:-sb.radius,near:0.5,far:sb.radius*4});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.03;
  scene.add(hemi,sun,sun.target);
  // V6C 꼭대기 작은 빛: 지금 층 위 오늘 칸 앞, 그림자 없음, 거리 제한(위 몇 층만 비춘다). 작은 빛 점은 안개를 받지 않는다.
  const glowAt=topGlow(data);let topLight=null;
  if(glowAt){
    topLight=new PointLight(TOP_GLOW.color,TOP_GLOW.intensity,TOP_GLOW.distance,TOP_GLOW.decay);topLight.position.set(glowAt.x,glowAt.y,glowAt.z);scene.add(topLight);
    const dot=new Mesh(own(new SphereGeometry(TOP_GLOW.r,12,8)),own(new MeshBasicMaterial({color:TOP_GLOW.color,fog:false})));dot.position.copy(topLight.position);scene.add(dot);
  }
  slot.dataset.lights=String(scene.children.filter(o=>o.isLight).length);
  slot.dataset.hour=String(Math.floor(sky.hour));slot.dataset.sky=sky.phase;

  // 오늘 벽돌 비행: 이번 앱 실행 중 아직 안 본 오늘 벽돌만(st.seenToday, 메모리뿐). 움직임 줄이기면 처음부터 제자리.
  const todayIdx=data.bricks.flatMap((r,i)=>r.today?[i]:[]);
  const seen=st?.seenToday?.date===ach.today?st.seenToday.n:0;
  const flights=reduced?[]:todayIdx.slice(seen).map((i,k)=>({i,k,to:data.bricks[i],from:null,landedAt:null,...slotOf[i]}));
  if(st)st.seenToday={date:ach.today,n:todayIdx.length};
  for(const f of flights)placeBrick(f.s.mesh,f.j,f.to,{started:false,squash:1,rotY:0,x:0,y:0,z:0});
  slot.dataset.flights=String(flights.length);
  // Q1B: 아직 안 본 보너스 ✦가 있으면 이번 주 금빛 기둥 꼭대기에 금 입자(st.seenBonus, 메모리뿐). 움직임 줄이기면 없음. LOW 등급은 먼지처럼 끈다.
  const week=ach.currentWeek,bonusTop=data.bonus.findLast(r=>r.floor===data.floors.length-1)??null,bonusNew=!reduced&&bonusTop!==null&&bonusFresh(ach,st?.seenBonus??null);
  if(st&&week)st.seenBonus={monday:week.monday,total:week.bonus?.total??0};
  let burst=null,burstPos=null,burstFrom=null;
  if(bonusNew){
    const g=own(new BufferGeometry());burstPos=new Float32Array(BONUS_SPARKS*3).fill(-1000);g.setAttribute('position',new BufferAttribute(burstPos,3));
    burst=new Points(g,own(new PointsMaterial({color:GOLD,size:0.12,transparent:true,opacity:0.95,depthWrite:false})));burst.frustumCulled=false;scene.add(burst);
  }
  slot.dataset.bonus=String(data.counts.bonus);slot.dataset.bonusBurst=bonusNew?'1':'0';slot.dataset.titleFlag=titleTier??'';
  // T2C 레벨업 맥동: 지난번에 본 레벨보다 오른 탑이 0.6초 금빛으로 뛴다(st.seenLevels, 메모리뿐). 움직임 줄이기면 없음. 끝나면 묶음을 치워 드로우콜이 남지 않는다.
  const pulseAreas=reduced?[]:towersToPulse(data,st?.seenLevels??null);
  if(st)st.seenLevels=Object.fromEntries(data.towers.map(t=>[t.area,t.level]));
  let pulse=null,pulseMat=null,pulseFrom=null;
  if(pulseAreas.length){
    pulseMat=own(new MeshBasicMaterial({color:GOLD,transparent:true,opacity:0,depthWrite:false}));
    pulse=new InstancedMesh(cube,pulseMat,pulseAreas.length);pulse.frustumCulled=false;own(pulse);
    pulseAreas.forEach((a,i)=>place(pulse,i,data.towers.find(t=>t.area===a).hit));pulse.instanceMatrix.needsUpdate=true;scene.add(pulse);
  }
  slot.dataset.pulse=pulseAreas.join(',');slot.dataset.towers=data.towers.map(t=>t.area+':'+t.level).join(',');slot.dataset.badgeRows=String(data.badgeRows.length);
  let flying=flights.length>0,effects=false,shake=0;
  const dustGeo=flights.length?own(new BufferGeometry()):null,dustPos=flights.length?new Float32Array(flights.length*DUST_POINTS*3).fill(-1000):null;
  let dust=null;
  if(dustGeo){dustGeo.setAttribute('position',new BufferAttribute(dustPos,3));dust=new Points(dustGeo,own(new PointsMaterial({color:DUST,size:0.07,transparent:true,opacity:0.85,depthWrite:false})));dust.frustumCulled=false;scene.add(dust);}
  const touchMeshes=()=>{for(const s of sets)if(s.mesh)s.mesh.instanceMatrix.needsUpdate=true;};

  // 등급: MID로 시작, 프레임 시간으로 한 번 올리거나 한 단계씩 내린다.
  let tier=null,promoted=false,rounded=null,env=null,shadowDirty=true;const coarse=isCoarsePointer(win);
  // V11A: 배율·크기가 그대로면 다시 넣지 않는다(캔버스 크기를 같은 값으로 다시 넣어도 그려 둔 그림이 지워질 수 있어, 이어 쓰는 캔버스가 한 프레임 비지 않게).
  const size2=new Vector2(),sameSize=(w,h)=>{const v=renderer.getSize(size2);return v.x===w&&v.y===h;};
  const applyTier=name=>{
    const T=TIERS[name];tier=name;
    const ratio=renderPixelRatio({dpr:win.devicePixelRatio,coarse,tier:T.pixelRatio});if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);slot.dataset.pixelRatio=String(ratio);   // V10F: PC 1.5~2(초과 표본)·폰 ≤1.5
    const on=T.shadow>0;
    if(renderer.shadowMap.enabled!==on){renderer.shadowMap.enabled=on;for(const m of lit)m.needsUpdate=true;}
    sun.castShadow=on;
    if(on&&sun.shadow.mapSize.x!==T.shadow){sun.shadow.mapSize.set(T.shadow,T.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}
    shadowDirty=true;
    if(T.rounded&&!rounded)rounded=own(roundedBrick());
    for(const s of sets)if(s.mesh)s.mesh.geometry=T.rounded?rounded:cube;
    if(T.env&&!env){
      const eq=texture(envTexels(sky),TEX.env);eq.mapping=EquirectangularReflectionMapping;eq.generateMipmaps=false;eq.minFilter=LinearFilter;
      const pm=new PMREMGenerator(renderer);env=own(pm.fromEquirectangular(eq)).texture;pm.dispose();   // V11FIX M-1: 렌더 타깃째 소유(질감만 치우면 프레임버퍼가 갱신마다 남았다)
    }
    for(const m of [brickMat,halfMat,goldMat,todayMat,trimMat,craneMat,ornMat]){m.envMap=T.env?env:null;m.needsUpdate=true;}
    for(const m of [roofMat,daisMat,daisSideMat]){m.envMap=T.env?env:null;m.needsUpdate=true;}   // V7T: 금 지붕·광택 대리석 단상도 같은 스튜디오를 비춘다
    for(const m of [coreMat,mortarMat,frameMat]){m.envMap=T.env?env:null;m.needsUpdate=true;}   // V7T2: 샴페인 금 구조벽·빈 칸 판·금 뼈대(처마·기둥·문·현판·검은 대리석 받침)
    stars.visible=T.stars&&sky.stars>0.02;
    if(dust)dust.visible=T.dust;
    if(burst)burst.visible=T.dust;
    slot.dataset.tier=name;slot.dataset.shadow=String(on?T.shadow:0);
    if(canvas.clientWidth&&canvas.clientHeight&&!sameSize(canvas.clientWidth,canvas.clientHeight))renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
  };

  const aspect=()=>{const w=canvas.clientWidth||1,h=canvas.clientHeight||1;return w/h;};
  // 보기별 카메라: "집 앞" = 모퉁이 탑·현판(큰 집만), "이번 주" = 작은 집은 전체, 큰 집은 맨 위, "집 전체" = 고각 0.45로 기단부터 지금 집 꼭대기 + 여유까지.
  // V11A: 장면을 다시 지을 때(keep)는 카메라를 그대로 둔다(새 오늘 벽돌은 날아오지만 "맨 위로 보기"로 옮기지 않는다).
  const nowTop=houseTop(data)+WHOLE_VIEW_PAD,topFirst=!keep&&flyFirst(data,flights.length,st?.view3d),firstView=topFirst?'week':startView(data);
  const viewCamera=(key,a)=>key==='whole'?wholeCamera(data,a,nowTop):{phi:PHI,...(key==='gate'?gateCamera(data,a):initialCamera(data,a))};
  const cam=st?(st.cam3d??=viewCamera(firstView,1)):keep?.cam??viewCamera(firstView,1);
  if(topFirst&&st)st.view3d='week';
  let selected=data.floors.length-1,fitted=Boolean(keep)||Boolean(st?.cam3dFitted)&&!topFirst;
  // 카메라 범위는 예상도 꼭대기까지(room). 끌거나 멀리 보면 예상도까지 갈 수 있다.
  const aim=()=>{clampCamera(cam,room,aspect());const p=cameraPosition(cam);camera.position.set(p.x,p.y+shake,p.z);camera.lookAt(0,cam.y+shake,0);skyGroup.position.copy(camera.position);};
  const resize=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    if(!sameSize(w,h))renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();tags?.setAttribute('viewBox','0 0 '+w+' '+h);
    if(!fitted){Object.assign(cam,viewCamera(firstView,w/h));fitted=true;if(st)st.cam3dFitted=true;}
  };
  // 자동 회전(V8W6): 누르기 전까지 약 40초에 한 바퀴(spinStep). 누르거나 끌면 멈추고 "다시 돌리기" 단추가 보인다. 움직임 줄이기면 돌지 않고 단추도 없다(멈춘 그림).
  let spin=!reduced,spinLast=null,settle=topFirst?{}:null;
  if(keep)spin=keep.spin&&!reduced;   // V11A: 멈춘 회전은 장면을 다시 지어도 멈춘 채
  const spinBtn=reduced?null:doc.createElement('button');
  const paintSpin=()=>{if(!spinBtn)return;spinBtn.hidden=spin;slot.dataset.spin=spin?'on':'off';};
  if(spinBtn){spinBtn.type='button';spinBtn.className='lb-chip tower-3d-spin';spinBtn.textContent='다시 돌리기';spinBtn.setAttribute('aria-label','3D 탑 다시 천천히 돌리기');spinBtn.addEventListener('click',()=>{spin=true;spinLast=null;paintSpin();invalidate();});views.append(spinBtn);}
  slot.dataset.spin=spin?'on':'off';
  const stopSpin=()=>{spin=false;spinLast=null;settle=null;paintSpin();};
  // V10F 1 (소유자 "한 번 누르면 계속 멈춘다"): 캔버스를 누르고 있는 동안(손가락·마우스가 하나라도 닿아 있음)만 쉬고, 다 떼면 그 자리부터 다시 돈다. 끌어 돌리기·두 손가락 확대는 그대로.
  // 휠·화살표·보기 칩은 "그 자리에서 보기"라 예전처럼 멈추고 "다시 돌리기"가 보인다.
  let held=false;
  const holdSpin=()=>{held=true;spinLast=null;settle=null;slot.dataset.hold='1';};
  const releaseSpin=()=>{held=false;spinLast=null;slot.dataset.hold='0';if(spin)invalidate();};
  paintSpin();
  // 탭을 가렸다 돌아오면 다시 그린다(가려진 동안은 프레임을 요청하지 않는다).
  const onVisible=()=>{if(doc.visibilityState==='visible'&&spin)invalidate();};
  // V8FIX M-08: "우주"로 바꿔 숨은 캔버스(크기 0)나 스크롤로 화면 밖에 있는 캔버스는 돌지 않는다(우주 3D visible()과 같은 판정 + 화면 진입 관찰).
  let onScreen=true;
  const showing=()=>onScreen&&Boolean(canvas.clientWidth&&canvas.clientHeight)&&doc.visibilityState==='visible';
  doc.addEventListener?.('visibilitychange',onVisible);
  const paintChips=key=>{for(const b of chips)b.setAttribute('aria-pressed',String(b.dataset.view===key));slot.dataset.view=key;};
  const setView=key=>{
    stopSpin();
    Object.assign(cam,viewCamera(key,aspect()));
    if(st)st.view3d=key;paintChips(key);invalidate();
  };
  paintChips(st?.view3d??firstView);
  const writeStatus=()=>{
    const a=p50(frameLog),b=p95(frameLog),info=renderer.info.render;
    if(a!==null){slot.dataset.frameMsP50=a.toFixed(1);slot.dataset.frameMsP95=b.toFixed(1);slot.dataset.fpsP50=String(Math.round(1000/a));slot.dataset.fpsP95=String(Math.round(1000/b));}
    slot.dataset.triangles=String(info.triangles);
    statusText.textContent=['등급 '+tier,'그림자 '+(renderer.shadowMap.enabled?slot.dataset.shadow:'끔'),a===null?'프레임 측정 전':'프레임 p50 '+a.toFixed(1)+'ms · p95 '+b.toFixed(1)+'ms','드로우콜 '+(slot.dataset.drawCallsMain||slot.dataset.drawCalls),'삼각형 '+info.triangles,'광원 '+slot.dataset.lights,'하늘 '+sky.phase].join(' · ');
  };
  const drawFrame=now=>{
    raf=0;if(disposed)return;
    if(!started)started=now;
    const t=(now-started)/1000;
    let moving=false;
    if(spin&&!held){
      if(!showing())spinLast=null;   // 가려진 동안(탭 숨김·숨은 칸·화면 밖)은 쉬고(onVisible·크기·화면 진입이 다시 깨운다), 돌아오면 그 자리부터 이어 돈다
      else{if(spinLast!==null)cam.theta+=spinStep((now-spinLast)/1000);spinLast=now;moving=true;}
    }
    if(flying){
      let done=true;
      for(const f of flights){
        f.from??=flyFrom(f.to,cam.theta);
        const p=flyAt(f.k,flights.length,t,f.to,f.from);
        placeBrick(f.s.mesh,f.j,f.to,p);
        if(p.landed&&f.landedAt===null)f.landedAt=t;
        if(!p.done)done=false;
      }
      touchMeshes();moving=true;effects=true;
      if(done){flying=false;shadowDirty=true;}
    }
    if(effects){
      // 착지: 그 칸 줄눈이 잠깐 금빛으로, 먼지가 퍼지고, 마지막 장에서 카메라가 살짝 흔들린다.
      let live=flying;
      const last=flights.at(-1);
      for(const f of flights){
        const s=f.landedAt===null?-1:t-f.landedAt,mi=mortarAt.get(f.to.floor+':'+f.to.col);
        if(mortarMesh&&mi!==undefined){mortarMesh.setColorAt(mi,mortarTint(Math.max(data.mortar[mi].brightness,flashAt(s))));mortarMesh.instanceColor.needsUpdate=true;}
        const ji=jointAt.get(f.to.floor+':'+f.to.col);
        if(jointMesh&&ji!==undefined){jointMesh.setColorAt(ji,jointTint(joints[ji],flashAt(s)));jointMesh.instanceColor.needsUpdate=true;}
        for(let d=0;d<DUST_POINTS;d++){const at=dustAt(f.to,d,s),o=(f.k*DUST_POINTS+d)*3;dustPos[o]=at?at.x:0;dustPos[o+1]=at?at.y:-1000;dustPos[o+2]=at?at.z:0;}
        if(s>=0&&s<=Math.max(FLASH_SECONDS,DUST_SECONDS))live=true;
      }
      if(dustGeo)dustGeo.attributes.position.needsUpdate=true;
      shake=last.landedAt===null?0:shakeAt(t-last.landedAt);
      if(last.landedAt!==null&&t-last.landedAt<=SHAKE_SECONDS)live=true;
      effects=live;moving=true;
    }
    if(settle&&!flying&&!effects){
      // 큰 집: 오늘 벽돌이 다 놓이면 집 앞으로 내려온다.
      settle.at??=t;settle.from??={y:cam.y,dist:cam.dist};
      const c=settleCamera(settle.from,gateCamera(data,aspect()),t-settle.at);cam.y=c.y;cam.dist=c.dist;moving=true;
      if(c.done){settle=null;if(st)st.view3d='gate';paintChips('gate');}
    }
    if(celebrate){
      // 완공 순간: 크레인이 땅으로 내려가고, 지붕이 내려앉고, 창이 켜지고, 꼭대기에서 금 불꽃이 핀다(3초).
      celebrateFrom??=t;const s=t-celebrateFrom,c=completionAt(s);
      if(craneMesh){craneMesh.position.y=-c.crane*(data.height+CRANE_UP+3);craneMesh.visible=c.crane<1;}
      roofGroup.position.y=c.roof;windowMat.emissiveIntensity=winGlow+(LIT_WINDOWS-winGlow)*c.lit;
      for(let i=0;i<SPARKS;i++){const p=c.sparks&&apex?sparkAt(i,s,apex):null,o=i*3;sparkPos[o]=p?p.x:0;sparkPos[o+1]=p?p.y:-1000;sparkPos[o+2]=p?p.z:0;}
      sparkGeo.attributes.position.needsUpdate=true;
      if(c.done){celebrate=false;shadowDirty=true;}
      moving=true;
    }
    if(burst){
      burstFrom??=t;const s=t-burstFrom,to={x:bonusTop.x,y:bonusTop.y+bonusTop.sy/2,z:bonusTop.z};
      for(let i=0;i<BONUS_SPARKS;i++){const p=bonusSparkAt(i,s,to),o=i*3;burstPos[o]=p?p.x:0;burstPos[o+1]=p?p.y:-1000;burstPos[o+2]=p?p.z:0;}
      burst.geometry.attributes.position.needsUpdate=true;
      if(s>=BONUS_BURST_SECONDS){scene.remove(burst);burst=null;}
      moving=true;
    }
    // V6C 꼭대기 빛: 다른 움직임으로 프레임을 그릴 때만 ±10% 숨 쉰다(이것 때문에 프레임을 더 그리지 않는다). 움직임 줄이기면 고정.
    if(topLight&&!reduced)topLight.intensity=TOP_GLOW.intensity*glowPulse(t);
    if(pulse){
      pulseFrom??=t;const s=t-pulseFrom;
      pulseMat.opacity=0.6*pulseAt(s);
      if(s>=PULSE_SECONDS){scene.remove(pulse);pulse=null;}
      moving=true;
    }
    if(lastT&&(moving||dragging)&&doc.visibilityState==='visible'){
      const d=now-lastT;
      deltas.push(d);if(deltas.length>30)deltas.shift();
      if(framesTooSlow(deltas)){toFallback('SLOW_FRAMES');return;}
      frameLog.push(d);if(frameLog.length>FRAME_LOG)frameLog.shift();
      tierDeltas.push(d);if(tierDeltas.length>FRAME_LOG)tierDeltas.shift();
      const next=nextTier(tier,tierDeltas,{promoted});
      if(next!==tier){if(next==='HIGH')promoted=true;applyTier(next);tierDeltas.length=0;writeStatus();}
    }
    lastT=moving||dragging?now:0;
    aim();
    const shadowNow=shadowDirty&&renderer.shadowMap.enabled;
    if(shadowNow)renderer.shadowMap.needsUpdate=true;
    shadowDirty=false;
    try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}
    placeLabels();
    frames++;slot.dataset.frames=String(frames);
    if(!shadowNow)slot.dataset.drawCallsMain=String(renderer.info.render.calls);
    if(frames===1){
      if(gl.isContextLost()){toFallback('CONTEXT_LOST');return;}
      fallback.hidden=true;slot.hidden=false;setMode('3d','OK');
      // V8LOW L-22: 숨은 칸에서 그린 첫 장면은 캔버스 기본 크기(300×150) 비율이다 → 칸을 보인 직후 같은 프레임에서 실제 크기로 맞춰 다시 그린다(늘어진 장면이 화면에 나가지 않는다).
      resize();aim();try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}placeLabels();
      slot.dataset.instances=String(data.total);slot.dataset.bricks=String(data.counts.bricks);slot.dataset.drawCalls=String(renderer.info.render.calls);
      writeStatus();
    }
    if(moving)invalidate();else writeStatus();
  };
  const invalidate=()=>{if(!raf&&!disposed)raf=win.requestAnimationFrame(drawFrame);};

  // 조작: 끌기 = 좌우 회전·위아래 이동, 휠·두 손가락 = 확대, 짧게 누르기 = 층 고르기. 키보드도 같은 동작. 손대면 자동 회전은 멈춘다.
  const pick=(x,y)=>{
    const rect=canvas.getBoundingClientRect(),ray=new Raycaster();
    ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1),camera);
    const hit=ray.intersectObject(hitMesh,false)[0],tower=onArea?ray.intersectObject(towerHit,false)[0]:null;
    if(tower&&(!hit||tower.distance<hit.distance))return {area:data.towers[tower.instanceId].area};
    return hit?{floor:hit.instanceId}:null;
  };
  const select=f=>{
    selected=f;const r=data.hits[f];
    picked.position.set(r.x,r.y,r.z);picked.scale.set(r.sx+0.04,r.sy+0.04,r.sz+0.04);picked.visible=true;
    slot.dataset.selected=String(data.floors[f].index);
    invalidate();
  };
  const open=f=>{const w=data.floors[f]?.week;if(w)onFloor?.(w);};
  // V11A: 아래에서 캔버스에 다는 듣개를 heard에 적어 둔다(장면을 다시 지을 때 dispose가 떼어, 같은 캔버스에 옛 장면의 끌기·확대가 남거나 옛 장면이 메모리에 붙들리지 않게). 다 단 뒤 원래 함수로 돌린다.
  const listen=canvas.addEventListener;canvas.addEventListener=(...a)=>{heard.push(a);return listen.apply(canvas,a);};
  let down=null,pinch=0;
  canvas.addEventListener('pointerdown',e=>{
    holdSpin();
    canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    dragging=true;
    down=pointers.size===1?{x:e.clientX,y:e.clientY,at:e.timeStamp,moved:0}:null;
    pinch=0;
  });
  canvas.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId);if(!p)return;
    const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(pointers.size===1){
      if(down)down.moved+=Math.abs(dx)+Math.abs(dy);
      cam.theta-=dx*ROTATE_PER_PX;
      cam.y+=dy*cam.dist*2*Math.tan(FOV/2*Math.PI/180)/(canvas.clientHeight||1);
    }else if(pointers.size===2){
      const [a,b]=[...pointers.values()],gap=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinch&&gap)cam.dist*=pinch/gap;
      pinch=gap;
    }
    invalidate();
  });
  const release=e=>{
    pointers.delete(e.pointerId);if(!pointers.size){dragging=false;lastT=0;}
    if(e.type==='pointerup'&&down&&down.moved<TAP_PX&&e.timeStamp-down.at<TAP_MS&&pointers.size===0){const p=pick(e.clientX,e.clientY);if(p?.area)onArea(p.area);else if(p){select(p.floor);open(p.floor);}}
    if(!pointers.size)releaseSpin();   // V10F: 다 떼면 다시 돈다
    down=null;pinch=0;invalidate();
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  // V10FIX M-16: 포인터 잡기를 잃거나(lostpointercapture) 창이 가려지면(blur·숨김) 누른 포인터를 비우고 멈춤을 푼다(멈춘 채 남지 않게, 다음 끌기가 확대로 읽히지 않게).
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))release(e);});
  function dropPointers(){if(!pointers.size&&!held)return;pointers.clear();dragging=false;lastT=0;down=null;pinch=0;releaseSpin();invalidate();}
  win.addEventListener?.('blur',dropPointers);
  canvas.addEventListener('wheel',e=>{e.preventDefault();stopSpin();cam.dist*=Math.exp(e.deltaY*ZOOM_PER_WHEEL);invalidate();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    const k=e.key;let used=true;
    if(k==='ArrowLeft')cam.theta-=KEY_ROTATE;
    else if(k==='ArrowRight')cam.theta+=KEY_ROTATE;
    else if((k==='ArrowUp'||k==='ArrowDown')&&data.floors.length){const f=Math.max(0,Math.min(data.floors.length-1,selected+(k==='ArrowUp'?1:-1)));select(f);cam.y=data.hits[f].y;}
    else if(k==='+'||k==='=')cam.dist*=KEY_ZOOM;
    else if(k==='-')cam.dist/=KEY_ZOOM;
    else if(k==='Enter'||k===' ')open(selected);
    else used=false;
    if(used){stopSpin();e.preventDefault();invalidate();}
  });
  delete canvas.addEventListener;

  applyTier(keep?.tier??START_TIER);if(keep)promoted=keep.promoted;   // V11A: 등급은 이어 간다
  // 측정값(시험·화면 확인용): 붙은 부품, 시즌 수, 예상 층 수, 글자 수, 완공 상태.
  slot.dataset.parts=Object.entries(data.parts).filter(([,v])=>Array.isArray(v)?v.length:v).map(([k])=>k).join(',');
  slot.dataset.seasons=String(seasons?.length??0);slot.dataset.blueprintFloors=bp?String(bp.floors):'';slot.dataset.labels=String(labels.length);
  slot.dataset.completed=moment?(celebrate?'moment':'moment-still'):data.parts.ROOF_DONE?'done':'no';
  slot.dataset.builds=String(keep?Number(slot.dataset.builds||0)+1:1);   // V11A 측정값: 이 칸에서 장면을 지은 횟수(1 = 처음, 늘면 갱신)
  slot.replaceChildren(...[views,stage,legend,doneNote,hint,status].filter(Boolean));
  active=handle;
  // V8W6: 슬롯은 첫 장면을 그린 뒤(drawFrame frames===1)에만 보인다. 그 전에는 대체 화면(2.5D)이 그대로 보여 흰 빈 캔버스가 나오지 않는다.
  observer=new win.ResizeObserver(()=>{resize();invalidate();});observer.observe(canvas);
  seer=win.IntersectionObserver?new win.IntersectionObserver(es=>{onScreen=es.at(-1)?.isIntersecting!==false;if(onScreen)invalidate();}):null;seer?.observe(canvas);
  // 화면이 다시 그려져 캔버스가 문서에서 빠지면 GPU 자원을 바로 돌려준다.
  watcher=new win.MutationObserver(()=>{if(!canvas.isConnected)dispose();});watcher.observe(doc.body,{childList:true,subtree:true});
  resize();invalidate();
  // V11A: 문서에 붙은 캔버스에 장면을 다시 지었으면 같은 차례에 바로 그린다(옛 그림 → 새 그림, 그 사이 빈 프레임 0). 문서 밖(다시 그리는 중)이면 다음 프레임이 그린다.
  if(keep&&canvas.isConnected){win.cancelAnimationFrame(raf);drawFrame(win.performance.now());}
  return handle;
}
