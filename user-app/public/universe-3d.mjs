// 3D 지식 우주 그리기 (B49). 좌표·상태·링크는 universe-layout.mjs가 계산하고 여기서는 WebGL로 그리기만 한다. 읽기만 하고 어떤 기록도 쓰지 않는다.
// 이미지·텍스처·글자 텍스처 없이 색과 재질만 쓴다(CSP img-src 'none'): 과목 이름은 화면 아래 범례(DOM)가 맡는다. 인라인 style 없음: 캔버스 크기는 styles.css가 정하고 setSize(...,false)로 style을 건드리지 않는다.
// 실패(WebGL2 없음·저사양·첫 장면 오류·컨텍스트 손실·프레임 너무 느림)면 3D를 치우고 fallback(SVG 우주)을 다시 보인다. 같은 데이터다.
// V8W7: 과목마다 행성(금속 재질 구체 + 금 고리, 오답이 많을수록 크다)을 군집 가운데에 그리고, 행성도 누를 수 있다(onPlanet). 예시 우주(data.example)는 금 톤 선·"예시" 표지를 더한다.
import {WebGLRenderer,Scene,PerspectiveCamera,BackSide,SphereGeometry,TorusGeometry,BufferGeometry,BufferAttribute,LineSegments,LineBasicMaterial,MeshBasicMaterial,MeshStandardMaterial,PointsMaterial,Points,HemisphereLight,DirectionalLight,InstancedMesh,Mesh,Object3D,Color,Raycaster,Vector2,Vector3,DataTexture,RGBAFormat,UnsignedByteType,LinearFilter,SRGBColorSpace,EquirectangularReflectionMapping,PMREMGenerator} from './three.module.js';
import {quality3d,framesTooSlow,FOV,GOLD,TOWER_GOLD,renderPixelRatio,isCoarsePointer,tooSlowFor30,glowTexels,HALO_SPRITE,envTexels,skyAt,TEX,BACKDROP,hash01} from './tower-3d-layout.mjs';
// V10F (소유자 "구가 각져 보이고 빨간 철망 공은 뜻을 알 수 없다"): 매끈한 구(행성 64×48·별 48×24, 별이 300개를 넘으면 24×12), 별도 빛을 받는 재질,
// 기억함 = 부드러운 빛무리(가운데 밝은 둥근 점), 복습 필요(늦음) = 붉은 빛 테(고리 점) + 캔버스 위 범례, 행성마다 옅은 궤도 선·이름표(SVG 겹침층), 행성 금속에 코드로 만든 스튜디오 환경 반사,
// 화소 배율(PC 1.5~2·폰 ≤1.5)과 느리면(30fps 미만) 배율 1로 한 단계 낮춤.
export const SPHERE_SEGMENTS=Object.freeze({planet:[64,48],star:[48,24],starMany:[24,12],manyAt:300});
export const UNIVERSE_KEY=Object.freeze([['late','붉은 빛 테 = 복습 필요'],['glow','빛무리 = 기억함'],['orbit','고리·궤도 = 과목 행성']]);

const RED='#D9534F',WHITE='#FFFFFF',NODE_R=0.3,GLOW_R=0.42,HALO_LATE=0.66,HALO_GLOW=0.95,HIT_R=0.8,TAP_PX=8,TAP_MS=500,ROTATE_PER_PX=0.008,ZOOM_PER_WHEEL=0.0012,KEY_ROTATE=0.2,KEY_ZOOM=0.9,SPIN_PER_SECOND=0.12,MAX_PHI=1.25;
// 행성 반지름 = 군집 반지름 × 0.36(군집 반지름이 오답 수의 세제곱근으로 커지므로 행성도 함께 커진다). 고리 = 행성의 1.7배, 기울기 0.45.
export const PLANET_SCALE=0.36,PLANET_RING=1.7,PLANET_TILT=0.45,PLANET_MATERIAL=Object.freeze({metalness:0.45,roughness:0.32,emissiveIntensity:0.16});
export const planetRadius=c=>Math.round(c.radius*PLANET_SCALE*1e4)/1e4;
// V12E 깊이 있는 배경(설계 V12 E2, 소유자 r81 "평평한 옅은 판·단색 그러데이션이라 저화질"): 밝은 테마 그대로, 투명 캔버스 뒤 CSS 단색 대신
// 장면 안 배경 구(아이보리 → 위 옅은 라벤더·아래 옅은 금, 은은한 성운 네 덩이) + 먼 별 세 겹(먼 겹 = 작고 많고 옅게, 가까운 겹 = 크고 적게). 겹마다 반지름이 달라 카메라가 돌면 조금씩 어긋나 깊이가 보인다.
// 모두 코드로 계산(그림·외부 파일 0), 결정적(난수 없음). 배경 구는 카메라가 가장 멀리 물러나도(fit × 1.6) 그 안에 있도록 군집 경계(bound)의 SPACE_BG.radius배.
export const SPACE_BG=Object.freeze({base:'#FBF8F1',top:'#F2EEF8',bottom:'#F9F1DF',radius:24,minRadius:60,maxRadius:3000,segments:Object.freeze([64,32]),
  clouds:Object.freeze([[[0.62,0.32,0.72],'#F2DCAA',0.62,0.7],[[-0.76,0.12,-0.42],'#E7DAF1',0.66,0.75],[[-0.22,-0.48,0.85],'#F4D9E0',0.5,0.6],[[0.28,0.82,-0.5],'#D9E6F3',0.55,0.55]].map(([dir,color,size,amount])=>Object.freeze({dir,color,size,amount})))});
// 별 색은 V7C 금지 띠(겨자·황토·갈색) 밖: 먼 겹 = 채도 낮은 금회색, 가운데 겹 = 옅은 라벤더, 가까운 겹 = 명도 58% 위 밝은 금.
export const STAR_LAYERS=Object.freeze([[0.96,420,6,0.62,'#ABA088',41],[0.86,160,9,0.75,'#958EC0',53],[0.78,60,13,0.9,'#D9B45C',67]].map(([r,n,size,opacity,color,seed])=>Object.freeze({r,n,size,opacity,color,seed})));
export const spaceRadius=bound=>Math.min(SPACE_BG.maxRadius,Math.max(SPACE_BG.minRadius,bound*SPACE_BG.radius));
const hexRgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),rgbHex=c=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
// 단위 방향(x,y,z) → 배경색. 위아래 그러데이션 + 성운 덩이(방향 사이 각의 가우스, 부드러운 물결로 얼룩을 조금).
export function nebulaAt(x,y,z){
  const B=SPACE_BG,mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  let c=y>=0?mix(hexRgb(B.base),hexRgb(B.top),Math.min(1,y)**1.4):mix(hexRgb(B.base),hexRgb(B.bottom),Math.min(1,-y)**1.4);
  for(const k of B.clouds){
    const l=Math.hypot(...k.dir),dot=(x*k.dir[0]+y*k.dir[1]+z*k.dir[2])/l,wave=0.78+0.22*Math.sin(3*x+5*y+1.3)*Math.cos(4*z-2*y+0.7);
    c=mix(c,hexRgb(k.color),k.amount*Math.exp(-(2*(1-dot))/(k.size*k.size))*wave);
  }
  return rgbHex(c);
}
// 별 한 겹: 구 위 황금각 나선 + 해시 흔들림(고르되 줄 서 보이지 않게). 단위 구 좌표 × 반지름.
export function starLayer(L,radius){
  const out=new Float32Array(L.n*3);
  for(let i=0;i<L.n;i++){
    const y=Math.max(-1,Math.min(1,1-2*(i+0.5)/L.n+(hash01(L.seed,i,1)-0.5)*1.6/L.n)),r=Math.sqrt(1-y*y),a=i*2.399963229728653+(hash01(L.seed,i,2)-0.5)*0.9;
    out[i*3]=Math.cos(a)*r*radius;out[i*3+1]=y*radius;out[i*3+2]=Math.sin(a)*r*radius;
  }
  return out;
}
export const planetsOf=data=>data.clusters.filter(c=>c.count>0);
let active=null;
// V11A 3D 호스트 (V10HUNT M-12): 탑(tower-3d adoptTower3d)과 같은 규칙. 다시 그리면 살아 있는 칸을 새 자리 표시 칸에 옮겨 붙이고, 우주 배치(data 전부)가 바뀌었을 때만 같은 캔버스·문맥에 다시 짓는다.
const sceneKey=data=>JSON.stringify(data);
export function adoptUniverse3d(opts){return Boolean(active?.adopt(opts));}

const tanHalf=()=>Math.tan(FOV/2*Math.PI/180);
const fitDist=(bound,aspect)=>bound/Math.sin(Math.atan(tanHalf()*Math.min(1,Math.max(0.3,aspect))))*1.05;
// V8W7: 군집 고리는 납작해서(세로 폭이 작다) 가로로 넓은 캔버스(가로/세로 ≥ 1.2)에서는 처음 거리를 0.78배까지 당긴다. 단 경계 구가 가로로 잘리지 않는 거리(sideFit)보다 가깝게는 가지 않는다.
const sideFit=(bound,aspect)=>bound/Math.sin(Math.atan(tanHalf()*aspect))*1.05;
export function universeCamera(bound,aspect){const fit=fitDist(bound,aspect);return {theta:0.5,phi:0.45,dist:aspect>=1.2?Math.max(fit*0.78,sideFit(bound,aspect)):fit};}
export function clampUniverseCamera(cam,bound,aspect){
  const fit=fitDist(bound,aspect);
  cam.dist=Math.max(bound*0.35,Math.min(fit*1.6,cam.dist));
  cam.phi=Math.max(-MAX_PHI,Math.min(MAX_PHI,cam.phi));
  return cam;
}
export function universePosition(cam){
  const flat=Math.cos(cam.phi)*cam.dist;
  return {x:Math.sin(cam.theta)*flat,y:Math.sin(cam.phi)*cam.dist,z:Math.cos(cam.theta)*flat};
}

// keep(V11A, 안에서만): 다시 지을 때 이어 쓰는 캔버스·문맥·그리개·배율·카메라.
export function mountUniverse3d({doc,slot,fallback,data,onNode=null,onPlanet=null,st=null,keep=null}){
  active?.dispose();
  const win=doc.defaultView,sceneKeyNow=keep?.key??sceneKey(data);
  const setMode=(mode,why)=>{slot.dataset.mode=mode;slot.dataset.reason=why;};
  const why=quality3d({cores:win.navigator?.hardwareConcurrency,memoryGb:win.navigator?.deviceMemory,instances:data.nodes.length+data.links.length});
  if(why!=='OK'){setMode('svg',why);return null;}
  const canvas=keep?.canvas??doc.createElement('canvas');
  const planets=planetsOf(data),example=Boolean(data.example);
  canvas.className='universe-3d-canvas'+(example?' universe-example-canvas':'');canvas.tabIndex=0;canvas.setAttribute('role','application');
  canvas.setAttribute('aria-label',(example?'3D 예시 우주, ':'3D 지식 우주, ')+'행성 '+planets.length+'개 별 '+data.nodes.length+'개. 화살표로 돌리고 플러스 마이너스로 확대합니다. 같은 내용을 2D 그림으로도 볼 수 있습니다');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,powerPreference:'default'});
  if(!gl){setMode('svg','NO_WEBGL2');return null;}
  const hint=doc.createElement('p');hint.className='muted small universe-3d-hint';hint.textContent='끌어서 돌리고 · 휠이나 두 손가락으로 확대 · 행성이나 별을 누르면 '+(example?'설명을 봅니다':'자세히 봅니다');
  // 예시 우주는 캔버스 왼쪽 위에 "예시" 표지를 겹쳐 둔다(실제 우주와 헷갈리지 않게).
  const tag=example?doc.createElement('p'):null;if(tag){tag.className='universe-example-tag';tag.textContent='예시';}
  // V10F: 캔버스와 행성 이름표(SVG, 위치는 x·y 속성만 — 인라인 style 없음)를 한 무대에, 그 아래 작은 범례(붉은 빛 테 = 복습 필요 · 빛무리 = 기억함). SVG 이름공간은 대체 화면(SVG 우주)의 것을 쓴다.
  const SVG_NS=fallback.querySelector?.('svg')?.namespaceURI??null;
  const stage=doc.createElement('div');stage.className='universe-3d-stage';
  const names=SVG_NS?doc.createElementNS(SVG_NS,'svg'):null;if(names){names.setAttribute('class','universe-3d-labels');names.setAttribute('aria-hidden','true');}
  const key=doc.createElement('ul');key.className='universe-3d-key';
  for(const [k,text] of UNIVERSE_KEY){const li=doc.createElement('li');li.className='universe-3d-key-item universe-3d-key-'+k;const mark=doc.createElement('span');mark.className='universe-3d-key-mark';mark.setAttribute('aria-hidden','true');li.append(mark,doc.createTextNode(text));key.append(li);}
  let disposed=false,raf=0,renderer=null,started=0,lastT=0,prevT=0,dragging=false,frames=0;
  const deltas=[],owned=[],pointers=new Map(),heard=[];   // heard(V11A): 이 장면이 캔버스에 단 듣개
  const reduced=Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  let observer=null,watcher=null,seer=null,onScreen=true;   // V10FIX M-09: 화면 진입 판정(탑과 같은 IntersectionObserver)
  // V11A: soft = 장면만 치운다(캔버스·문맥·그리개는 다음 장면이 이어 쓴다).
  const dispose=soft=>{
    if(disposed)return;disposed=true;if(active===handle)active=null;
    if(raf)win.cancelAnimationFrame(raf);
    observer?.disconnect();watcher?.disconnect();seer?.disconnect();win.removeEventListener?.('blur',dropPointers);
    canvas.removeEventListener('webglcontextlost',onLost);doc.removeEventListener('visibilitychange',onVisible);
    for(const a of heard)canvas.removeEventListener(...a);
    for(const o of owned)o.dispose();
    if(soft===true)return;
    renderer?.dispose();if(!gl.isContextLost())renderer?.forceContextLoss();
    canvas.remove();hint.remove();tag?.remove();stage.remove();key.remove();
  };
  const toFallback=reason=>{dispose();fallback.hidden=false;slot.hidden=true;setMode('svg',reason);};
  const onLost=()=>toFallback('CONTEXT_LOST');
  const onVisible=()=>invalidate();
  // V11A 3D 호스트(탑 adopt와 같은 순서): 칸 옮기기 → 대체 그림·누르면 여는 시트 바꾸기 → 배치가 같으면 끝, 다르면 같은 캔버스에 다시 짓기.
  const adopt=next=>{
    if(disposed||next.doc!==doc||!next.slot||!next.fallback)return false;
    if(next.slot!==slot){if(!next.slot.parentNode)return false;next.slot.replaceWith(slot);}
    fallback=next.fallback;fallback.hidden=!slot.hidden;onNode=next.onNode??null;onPlanet=next.onPlanet??null;
    // V11FIX N-3: 다시 짓기가 그리기 차례 안에서 던져도 화면을 깨지 않게 3D를 치우고 새 그리기의 2D 우주를 보인다(탑과 같음).
    try{
      const k=sceneKey(next.data);if(k===sceneKeyNow)return true;
      dispose(true);
      const h=mountUniverse3d({...next,slot,fallback,keep:{canvas,gl,renderer,key:k,cam,ratio,lowered}});
      if(!h){renderer.dispose();if(!gl.isContextLost())renderer.forceContextLoss();canvas.remove();slot.hidden=true;fallback.hidden=false;}
    }catch{
      if(active&&active!==handle)active.dispose();
      if(!disposed)toFallback('ADOPT_FAILED');
      else{renderer.dispose();if(!gl.isContextLost())renderer.forceContextLoss();canvas.remove();slot.hidden=true;fallback.hidden=false;setMode('svg','ADOPT_FAILED');}
    }
    return true;
  };
  const handle={dispose,canvas,adopt};
  canvas.addEventListener('webglcontextlost',onLost);doc.addEventListener('visibilitychange',onVisible);
  try{renderer=keep?.renderer??new WebGLRenderer({canvas,context:gl,antialias:true,alpha:true});}catch{toFallback('RENDERER_FAILED');return null;}
  const coarse=isCoarsePointer(win);let ratio=keep?.ratio??renderPixelRatio({dpr:win.devicePixelRatio,coarse}),lowered=Boolean(keep?.lowered);   // V11A: 느려서 낮춘 배율도 이어 간다
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);slot.dataset.pixelRatio=String(ratio);
  renderer.setClearColor(0x000000,0);

  // 장면: 별(상태 무관 구체) 한 묶음 + 늦음 테두리 한 묶음 + 기억함 후광 한 묶음 + 링크 선 하나.
  const scene=new Scene(),camera=new PerspectiveCamera(FOV,1,0.1,4000),dummy=new Object3D(),tint=new Color();
  const own=x=>{owned.push(x);return x;};
  const ball=own(new SphereGeometry(1,10,8));   // 누르기용 숨은 구·고른 표시(선)만. 보이는 구는 아래 매끈한 구
  const [sw,sh]=data.nodes.length>SPHERE_SEGMENTS.manyAt?SPHERE_SEGMENTS.starMany:SPHERE_SEGMENTS.star;
  const starBall=own(new SphereGeometry(1,sw,sh)),planetBall=own(new SphereGeometry(1,...SPHERE_SEGMENTS.planet));
  // V10F 스튜디오 환경(탑·건물과 같은 코드 계산, 지평선 = 배경 금. 외부 파일 0): 행성 금속·별이 은은하게 비친다.
  let env=null;
  try{
    const eq=own(new DataTexture(envTexels({...skyAt(13),bottom:BACKDROP.mid}),TEX.env[0],TEX.env[1],RGBAFormat,UnsignedByteType));
    eq.mapping=EquirectangularReflectionMapping;eq.colorSpace=SRGBColorSpace;eq.magFilter=eq.minFilter=LinearFilter;eq.needsUpdate=true;
    const pm=new PMREMGenerator(renderer);env=own(pm.fromEquirectangular(eq)).texture;pm.dispose();   // V11FIX M-1: 렌더 타깃째 소유
  }catch{env=null;}
  // V10F: 별도 빛을 받는다(평면 원판처럼 보이던 단색 재질 → 둥근 음영).
  const solid=own(new MeshStandardMaterial({color:0xffffff,roughness:0.45,metalness:0.05,envMap:env,envMapIntensity:0.5}));
  const place=(mesh,i,n,s)=>{dummy.position.set(n.x,n.y,n.z);dummy.scale.set(s,s,s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  const instanced=(mat,rows,scaleOf,colorOf,geo=starBall)=>{
    if(!rows.length)return null;
    const mesh=new InstancedMesh(geo,mat,rows.length);mesh.frustumCulled=false;own(mesh);
    rows.forEach((n,i)=>{place(mesh,i,n,scaleOf(n));mesh.setColorAt(i,colorOf(n));});
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;scene.add(mesh);return mesh;
  };
  const colorOf=n=>{tint.set(data.clusters[n.cluster].color);if(n.state==='glow')tint.lerp(new Color(WHITE),0.45);return tint;};
  instanced(solid,data.nodes,n=>n.state==='glow'?GLOW_R:NODE_R,colorOf);
  // V10F 빛무리·붉은 빛 테: 카메라를 보는 점(Points) + 코드로 만든 둥근 알파 질감. 크기는 세상 길이(지름 / tan(시야/2))라 확대하면 함께 커진다.
  const sprite=kind=>{const n=HALO_SPRITE.size,t=own(new DataTexture(glowTexels(kind),n,n,RGBAFormat,UnsignedByteType));t.magFilter=t.minFilter=LinearFilter;t.needsUpdate=true;return t;};
  const halo=(rows,diameter,colorOf,kind,opacity)=>{
    if(!rows.length)return null;
    const pos=new Float32Array(rows.length*3),col=new Float32Array(rows.length*3);
    rows.forEach((n,i)=>{pos.set([n.x,n.y,n.z],i*3);const c=colorOf(n);col.set([c.r,c.g,c.b],i*3);});
    const g=own(new BufferGeometry());g.setAttribute('position',new BufferAttribute(pos,3));g.setAttribute('color',new BufferAttribute(col,3));
    const p=new Points(g,own(new PointsMaterial({size:diameter/tanHalf(),map:sprite(kind),vertexColors:true,transparent:true,opacity,depthWrite:false,sizeAttenuation:true})));p.frustumCulled=false;scene.add(p);return p;
  };
  const late=data.nodes.filter(n=>n.state==='late'),glowing=data.nodes.filter(n=>n.state==='glow');
  halo(late,2*HALO_LATE/HALO_SPRITE.ringR,()=>tint.set(RED),'ring',0.95);
  halo(glowing,2*HALO_GLOW*1.4,n=>tint.set(data.clusters[n.cluster].color).lerp(new Color(GOLD),0.35),'glow',0.75);
  slot.dataset.late=String(late.length);slot.dataset.glow=String(glowing.length);slot.dataset.segments=sw+'x'+sh;
  if(data.links.length){
    const pos=new Float32Array(data.links.length*6);
    data.links.forEach((l,i)=>{const a=data.nodes[l.a],b=data.nodes[l.b];pos.set([a.x,a.y,a.z,b.x,b.y,b.z],i*6);});
    const geo=own(new BufferGeometry());geo.setAttribute('position',new BufferAttribute(pos,3));
    const lines=new LineSegments(geo,own(new LineBasicMaterial(example?{color:TOWER_GOLD.mid,transparent:true,opacity:0.55}:{color:0xcccccc,transparent:true,opacity:0.22})));lines.frustumCulled=false;scene.add(lines);
  }
  // 행성: 군집(과목)마다 금속 구체 1개 + 얇은 금 고리 1개(오답이 있는 과목만). 조명은 행성에만 듣는다(별은 MeshBasicMaterial). 반구광 + 왼쪽 위 키 라이트 2개.
  // V12E 배경 구(성운 그러데이션, 정점 색) + 별 세 겹(빛무리 질감 점, 화면 크기 고정). 둘 다 깊이를 쓰지 않고 가장 먼저 그린다(별·행성·선이 위에). 드로우콜 4.
  const spaceR=spaceRadius(data.bound),bgGeo=own(new SphereGeometry(spaceR,...SPACE_BG.segments)),bp=bgGeo.attributes.position,bgCol=new Float32Array(bp.count*3);
  for(let i=0;i<bp.count;i++){tint.set(nebulaAt(bp.getX(i)/spaceR,bp.getY(i)/spaceR,bp.getZ(i)/spaceR));bgCol.set([tint.r,tint.g,tint.b],i*3);}
  bgGeo.setAttribute('color',new BufferAttribute(bgCol,3));
  const bg=new Mesh(bgGeo,own(new MeshBasicMaterial({vertexColors:true,side:BackSide,depthWrite:false,dithering:true})));bg.renderOrder=-2;bg.frustumCulled=false;scene.add(bg);
  const starDot=sprite('glow');
  for(const L of STAR_LAYERS){
    const g=own(new BufferGeometry());g.setAttribute('position',new BufferAttribute(starLayer(L,spaceR*L.r),3));
    const p=new Points(g,own(new PointsMaterial({color:L.color,size:L.size,sizeAttenuation:false,map:starDot,transparent:true,opacity:L.opacity,depthWrite:false})));p.renderOrder=-1;p.frustumCulled=false;scene.add(p);
  }
  slot.dataset.spaceLayers=String(STAR_LAYERS.length);
  const sun=new DirectionalLight(0xffffff,2.2);sun.position.set(-1,1.6,1.2);
  scene.add(new HemisphereLight(0xfff8e8,0xe8d9b0,1.6),sun);   // V10F: 별도 빛을 받으므로 행성이 없어도 켠다
  const labels=[];
  if(planets.length){
    const body=own(new MeshStandardMaterial({color:0xffffff,...PLANET_MATERIAL,emissive:TOWER_GOLD.hi,envMap:env,envMapIntensity:0.8}));
    const globe=new InstancedMesh(planetBall,body,planets.length);globe.frustumCulled=false;own(globe);
    planets.forEach((c,i)=>{place(globe,i,c,planetRadius(c));globe.setColorAt(i,tint.set(c.color));});
    globe.instanceMatrix.needsUpdate=true;globe.instanceColor.needsUpdate=true;scene.add(globe);
    const hoop=own(new TorusGeometry(1,0.035,12,96)),hoopMat=own(new MeshStandardMaterial({color:TOWER_GOLD.mid,metalness:0.6,roughness:0.3,emissive:TOWER_GOLD.light,emissiveIntensity:0.25}));
    const rings=new InstancedMesh(hoop,hoopMat,planets.length);rings.frustumCulled=false;own(rings);
    planets.forEach((c,i)=>{const s=planetRadius(c)*PLANET_RING;dummy.position.set(c.x,c.y,c.z);dummy.rotation.set(Math.PI/2-PLANET_TILT,0,(c.index%2?1:-1)*PLANET_TILT*0.5);dummy.scale.set(s,s,s);dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);});
    dummy.rotation.set(0,0,0);rings.instanceMatrix.needsUpdate=true;scene.add(rings);
    // V10F 궤도 선: 행성 고리와 같은 기울기의 큰 원(군집 반지름 × 0.9, 96조각), 과목 색 옅게. 한 묶음(드로우콜 1).
    const ORBIT_N=96,orbit=new Float32Array(planets.length*ORBIT_N*6),orbitCol=new Float32Array(planets.length*ORBIT_N*6),p=new Vector3();
    planets.forEach((c,i)=>{
      const r=Math.max(planetRadius(c)*PLANET_RING*1.25,c.radius*0.9);tint.set(c.color);
      dummy.position.set(c.x,c.y,c.z);dummy.rotation.set(Math.PI/2-PLANET_TILT,0,(c.index%2?1:-1)*PLANET_TILT*0.5);dummy.scale.set(r,r,r);dummy.updateMatrix();
      for(let k=0;k<ORBIT_N;k++)for(const [j,a] of [[0,k],[1,k+1]]){const t=2*Math.PI*a/ORBIT_N,o=((i*ORBIT_N+k)*2+j)*3;p.set(Math.cos(t),Math.sin(t),0).applyMatrix4(dummy.matrix);orbit.set([p.x,p.y,p.z],o);orbitCol.set([tint.r,tint.g,tint.b],o);}
      labels.push({name:c.name,at:new Vector3(c.x,c.y+planetRadius(c)*1.35+0.3,c.z)});
    });
    dummy.rotation.set(0,0,0);
    const og=own(new BufferGeometry());og.setAttribute('position',new BufferAttribute(orbit,3));og.setAttribute('color',new BufferAttribute(orbitCol,3));
    const orbits=new LineSegments(og,own(new LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.4,depthWrite:false})));orbits.frustumCulled=false;scene.add(orbits);
  }
  // V10F 행성 이름표: 화면 좌표로 옮긴 SVG 글자(겹치면 뒤 순서를 숨긴다).
  const nameNodes=!names?[]:labels.map(l=>{const t=doc.createElementNS(SVG_NS,'text');t.setAttribute('class','universe-3d-label');t.setAttribute('text-anchor','middle');t.setAttribute('visibility','hidden');t.textContent=l.name;names.append(t);return {...l,node:t,width:[...l.name].length*13+8};});
  const v3=new Vector3();
  const placeNames=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight,shown=[];
    for(const l of nameNodes){
      v3.copy(l.at).project(camera);
      const x=(v3.x+1)/2*w,y=(1-v3.y)/2*h,lo=x-l.width/2,hi=x+l.width/2;
      const show=Boolean(w&&h)&&v3.z<1&&Math.abs(v3.x)<=1&&Math.abs(v3.y)<=1&&!shown.some(s=>Math.abs(s.y-y)<16&&lo<s.hi&&hi>s.lo);
      l.node.setAttribute('visibility',show?'visible':'hidden');
      if(show){shown.push({y,lo,hi});l.node.setAttribute('x',x.toFixed(1));l.node.setAttribute('y',y.toFixed(1));}
    }
  };
  slot.dataset.names=String(nameNodes.length);
  // 누르기용 보이지 않는 구체(그리지 않고 광선 검사만 한다). 손가락으로 누르기 쉽게 별보다 크다.
  const hitMesh=new InstancedMesh(ball,own(new MeshBasicMaterial()),Math.max(1,data.nodes.length));hitMesh.visible=false;own(hitMesh);
  data.nodes.forEach((n,i)=>place(hitMesh,i,n,HIT_R));hitMesh.updateMatrixWorld();
  const planetHit=new InstancedMesh(ball,own(new MeshBasicMaterial()),Math.max(1,planets.length));planetHit.visible=false;own(planetHit);
  planets.forEach((c,i)=>place(planetHit,i,c,Math.max(HIT_R,planetRadius(c)*1.15)));planetHit.count=planets.length;planetHit.updateMatrixWorld();
  // V10F: 고른 별·행성 = 금 빛 테(철망 상자 대신 같은 고리 점, 금색)
  const pickGeo=own(new BufferGeometry());pickGeo.setAttribute('position',new BufferAttribute(new Float32Array(3),3));
  const pickMat=own(new PointsMaterial({color:GOLD,size:1,map:sprite('ring'),transparent:true,depthWrite:false,sizeAttenuation:true}));
  const picked=new Points(pickGeo,pickMat);picked.visible=false;picked.frustumCulled=false;scene.add(picked);
  const pickSize=radius=>{pickMat.size=2*radius/HALO_SPRITE.ringR/tanHalf();};

  const aspect=()=>{const w=canvas.clientWidth||1,h=canvas.clientHeight||1;return w/h;};
  const cam=st?(st.camUniverse??=universeCamera(data.bound,1)):keep?.cam??universeCamera(data.bound,1);   // V11A: 다시 지어도 카메라 그대로
  let fitted=Boolean(keep)||Boolean(st?.camUniverseFitted);
  const aim=()=>{clampUniverseCamera(cam,data.bound,aspect());const p=universePosition(cam);camera.position.set(p.x,p.y,p.z);camera.lookAt(0,0,0);};
  const size2=new Vector2();   // V11A: 크기가 그대로면 다시 넣지 않는다(이어 쓰는 캔버스가 한 프레임 비지 않게)
  const resize=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    const at=renderer.getSize(size2);if(at.x!==w||at.y!==h)renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();names?.setAttribute('viewBox','0 0 '+w+' '+h);
    if(!fitted){Object.assign(cam,universeCamera(data.bound,w/h));fitted=true;if(st)st.camUniverseFitted=true;}
  };
  const visible=()=>Boolean(canvas.clientWidth&&canvas.clientHeight)&&doc.visibilityState==='visible'&&onScreen;
  const drawFrame=now=>{
    raf=0;if(disposed)return;
    if(!started)started=now;
    const spinning=!reduced&&!dragging&&visible();
    if(prevT&&(spinning||dragging)&&visible()){
      const dt=now-prevT;
      deltas.push(dt);if(deltas.length>30)deltas.shift();
      if(framesTooSlow(deltas)){toFallback('SLOW_FRAMES');return;}
      if(!lowered&&ratio>1&&tooSlowFor30(deltas)){lowered=true;ratio=1;renderer.setPixelRatio(1);slot.dataset.pixelRatio='1';resize();deltas.length=0;}   // V10F: 30fps 미만이면 배율 1로 한 번 낮춘다
      if(spinning)cam.theta+=SPIN_PER_SECOND*dt/1000;
    }
    prevT=spinning||dragging?now:0;
    aim();
    try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}
    placeNames();
    frames++;slot.dataset.frames=String(frames);
    if(frames===1){
      if(gl.isContextLost()){toFallback('CONTEXT_LOST');return;}
      fallback.hidden=true;slot.hidden=false;setMode('3d','OK');
      // V8LOW L-21·L-22: 칸은 첫 장면 뒤에만 보인다(탑 W6 규칙). 숨은 동안 그린 장면은 기본 크기라 보인 직후 실제 크기로 다시 그리고, 보이게 됐으니 회전을 잇는다.
      resize();aim();try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}placeNames();
      if(!reduced&&visible())invalidate();
      slot.dataset.instances=String(data.nodes.length);slot.dataset.links=String(data.links.length);slot.dataset.drawCalls=String(renderer.info.render.calls);
    }
    if(spinning)invalidate();
  };
  const invalidate=()=>{if(!raf&&!disposed)raf=win.requestAnimationFrame(drawFrame);};

  // 조작: 끌기 = 회전(좌우)·기울이기(위아래), 휠·두 손가락 = 확대, 짧게 누르기 = 별 고르기. 키보드도 같은 동작.
  const pick=(x,y)=>{
    const rect=canvas.getBoundingClientRect(),ray=new Raycaster();
    ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1),camera);
    // 별과 행성 중 카메라에 더 가까운 쪽을 고른다.
    const star=data.nodes.length?ray.intersectObject(hitMesh,false)[0]:null,world=planets.length?ray.intersectObject(planetHit,false)[0]:null;
    if(world&&(!star||world.distance<star.distance))return {planet:planets[world.instanceId]};
    return star?{node:star.instanceId}:null;
  };
  const select=i=>{
    const n=data.nodes[i];picked.position.set(n.x,n.y,n.z);pickSize(HIT_R*0.75);picked.visible=true;
    slot.dataset.selected=n.id;invalidate();
  };
  const selectPlanet=c=>{
    picked.position.set(c.x,c.y,c.z);pickSize(planetRadius(c)*1.35);picked.visible=true;
    slot.dataset.selected='planet-'+c.code;invalidate();
  };
  // V11A: 아래에서 캔버스에 다는 듣개를 heard에 적어 둔다(다시 지을 때 dispose가 뗀다). 다 단 뒤 원래 함수로 돌린다.
  const listen=canvas.addEventListener;canvas.addEventListener=(...a)=>{heard.push(a);return listen.apply(canvas,a);};
  let down=null,pinch=0;
  canvas.addEventListener('pointerdown',e=>{
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
      cam.theta-=dx*ROTATE_PER_PX;cam.phi+=dy*ROTATE_PER_PX;
    }else if(pointers.size===2){
      const [a,b]=[...pointers.values()],gap=Math.hypot(a.x-b.x,a.y-b.y);
      if(pinch&&gap)cam.dist*=pinch/gap;
      pinch=gap;
    }
    invalidate();
  });
  const release=e=>{
    pointers.delete(e.pointerId);if(!pointers.size){dragging=false;prevT=0;}
    if(e.type==='pointerup'&&down&&down.moved<TAP_PX&&e.timeStamp-down.at<TAP_MS&&pointers.size===0){const p=pick(e.clientX,e.clientY);if(p?.planet){selectPlanet(p.planet);onPlanet?.(p.planet);}else if(p){select(p.node);onNode?.(data.nodes[p.node]);}}
    down=null;pinch=0;
    invalidate();
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  // V10FIX M-16: 포인터 잡기를 잃거나(lostpointercapture) 창이 가려지면 누른 포인터를 비운다(끌기·확대가 남지 않게).
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))release(e);});
  function dropPointers(){if(!pointers.size)return;pointers.clear();dragging=false;prevT=0;down=null;pinch=0;invalidate();}
  win.addEventListener?.('blur',dropPointers);
  canvas.addEventListener('wheel',e=>{e.preventDefault();cam.dist*=Math.exp(e.deltaY*ZOOM_PER_WHEEL);invalidate();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    const k=e.key;let used=true;
    if(k==='ArrowLeft')cam.theta-=KEY_ROTATE;
    else if(k==='ArrowRight')cam.theta+=KEY_ROTATE;
    else if(k==='ArrowUp')cam.phi+=KEY_ROTATE;
    else if(k==='ArrowDown')cam.phi-=KEY_ROTATE;
    else if(k==='+'||k==='=')cam.dist*=KEY_ZOOM;
    else if(k==='-')cam.dist/=KEY_ZOOM;
    else used=false;
    if(used){e.preventDefault();invalidate();}
  });
  delete canvas.addEventListener;

  slot.dataset.builds=String(keep?Number(slot.dataset.builds||0)+1:1);   // V11A 측정값: 이 칸에서 장면을 지은 횟수(1 = 처음, 늘면 갱신)
  stage.append(...[canvas,names].filter(Boolean));
  slot.replaceChildren(...(tag?[tag]:[]),stage,key,hint);
  active=handle;
  // V8LOW L-21: 여기서 칸을 보이지 않는다(첫 프레임 전 빈 캔버스와 SVG가 함께 보였다). drawFrame frames===1이 보인다.
  observer=new win.ResizeObserver(()=>{resize();invalidate();});observer.observe(canvas);
  seer=win.IntersectionObserver?new win.IntersectionObserver(es=>{onScreen=es.at(-1)?.isIntersecting!==false;if(onScreen)invalidate();}):null;seer?.observe(canvas);
  // 화면이 다시 그려져 캔버스가 문서에서 빠지면 GPU 자원을 바로 돌려준다.
  watcher=new win.MutationObserver(()=>{if(!canvas.isConnected)dispose();});watcher.observe(doc.body,{childList:true,subtree:true});
  resize();invalidate();
  if(keep&&canvas.isConnected){win.cancelAnimationFrame(raf);drawFrame(win.performance.now());}   // V11A: 붙은 캔버스에 다시 지었으면 같은 차례에 바로 그린다
  return handle;
}
