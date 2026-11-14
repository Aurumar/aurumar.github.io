// 나만의 건물 3D (V8W6 3). buildings.mjs의 부품 목록을 WebGL로 그리기만 한다. 읽기만 하고 어떤 기록도 쓰지 않는다. 외부 그림·모형 파일 없음(질감·환경도 코드로 계산).
// 탑(tower-3d)과 같은 규칙: 인라인 style 없음(캔버스 크기는 styles.css, setSize(...,false)), 첫 장면을 그린 뒤에만 3D를 보이고 그 전·실패 때는 2D 그림(fallback)을 그대로 둔다.
// 배경은 캔버스를 투명하게 지우고 CSS의 아이보리→금 그라데이션이 비친다. 바닥 = 아이보리 원판 + 접지 그림자. 금속 금 재질은 코드로 만든 스튜디오 환경맵을 비춘다.
// 자동 회전: 40초에 한 바퀴(spinStep), 누르거나 끌면 멈추고 "다시 돌리기". 움직임 줄이기면 돌지 않는다(멈춘 그림).
import {WebGLRenderer,Scene,PerspectiveCamera,HemisphereLight,DirectionalLight,BoxGeometry,CylinderGeometry,ConeGeometry,CircleGeometry,MeshStandardMaterial,MeshBasicMaterial,Mesh,Group,EdgesGeometry,LineBasicMaterial,LineSegments,Color,DataTexture,RGBAFormat,UnsignedByteType,LinearFilter,SRGBColorSpace,EquirectangularReflectionMapping,PMREMGenerator} from './three.module.js';
import {skyAt,envTexels,TEX,CONTACT_SHADOW,shadowTexels,spinStep,warmGround,BACKDROP} from './tower-3d-layout.mjs';   // 환경맵 지평선만 배경 금(BACKDROP.mid)
import {buildingParts,partsBounds,PART_COLORS,METAL} from './buildings.mjs';

const ROTATE_PER_PX=0.01,FOV=32,PHI=0.32;
export const LOCKED_3D=Object.freeze({fill:'#C9BFAE',edge:'#7A6F5E',opacity:0.8});   // V8LOW L-23: 잠긴 예상도 = 따뜻한 회색 면 + 진한 윤곽선(아이보리 바탕과 대비)
let active=null;

// slot = 3D를 넣을 칸(처음엔 hidden), fallback = 같은 건물의 2D 그림. id = 건물 id, locked면 반투명 예상도(색 없는 아이보리)로 그린다.
export function mountBuilding3d({doc,slot,fallback,id,locked=false}){
  active?.dispose();
  const win=doc.defaultView,setMode=(m,why)=>{slot.dataset.mode=m;slot.dataset.reason=why;};
  if(!win?.WebGL2RenderingContext){setMode('svg','NO_WEBGL2');return null;}
  const canvas=doc.createElement('canvas');canvas.className='bd-3d-canvas';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','3D 건물 모형 · 끌어서 돌립니다');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true});
  if(!gl){setMode('svg','NO_WEBGL2');return null;}
  const reduced=Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  let renderer=null,raf=0,disposed=false,frames=0,spin=!reduced,spinLast=null,theta=0.55,dragging=null;
  const owned=[],own=x=>{owned.push(x);return x;};
  const spinBtn=reduced?null:doc.createElement('button');
  const paintSpin=()=>{if(spinBtn)spinBtn.hidden=spin;slot.dataset.spin=spin?'on':'off';};
  const dispose=()=>{
    if(disposed)return;disposed=true;if(active===handle)active=null;
    if(raf)win.cancelAnimationFrame(raf);observer?.disconnect();watcher?.disconnect();seer?.disconnect();doc.removeEventListener?.('visibilitychange',onVisible);
    for(const o of owned)o.dispose?.();renderer?.dispose();if(!gl.isContextLost())renderer?.forceContextLoss();
    canvas.remove();spinBtn?.remove();
  };
  const toFallback=why=>{dispose();slot.hidden=true;fallback.hidden=false;setMode('svg',why);};
  const handle={dispose,canvas};
  let observer=null,watcher=null,seer=null;
  // V8LOW N-01: 건물을 바꾸면 옛 3D를 치우며(forceContextLoss) 낸 lost 신호가 늦게 와서, 같은 칸·같은 2D 그림을 쓰는 새 3D를 2D로 덮었다 → 이미 치운 뒤의 신호는 무시한다.
  canvas.addEventListener('webglcontextlost',()=>{if(!disposed)toFallback('CONTEXT_LOST');});
  try{renderer=new WebGLRenderer({canvas,context:gl,antialias:true,alpha:true});}catch{toFallback('RENDERER_FAILED');return null;}
  renderer.setClearColor(0x000000,0);   // 투명: CSS 아이보리→금 그라데이션이 배경
  renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,2));
  const scene=new Scene(),camera=new PerspectiveCamera(FOV,1,0.1,200),sky=skyAt(13);
  // 스튜디오 환경맵(탑과 같은 계산, 지평선 색만 배경 금빛): 금속 금 면이 밝은 금으로 비친다.
  const eq=own(new DataTexture(envTexels({...sky,bottom:BACKDROP.mid}),TEX.env[0],TEX.env[1],RGBAFormat,UnsignedByteType));
  eq.mapping=EquirectangularReflectionMapping;eq.colorSpace=SRGBColorSpace;eq.magFilter=eq.minFilter=LinearFilter;eq.needsUpdate=true;
  let env=null;try{const pm=new PMREMGenerator(renderer);env=own(pm.fromEquirectangular(eq).texture);pm.dispose();}catch{env=null;}
  const mats=new Map(),matOf=c=>{
    if(!mats.has(c)){
      const metal=!locked&&METAL[c],m=own(new MeshStandardMaterial({color:locked?LOCKED_3D.fill:PART_COLORS[c],metalness:metal?(c==='champagne'?0.6:1):0,roughness:metal?(c==='champagne'?0.38:0.28):0.62,envMap:env,
        emissive:!locked&&c==='window'?PART_COLORS.window:'#000000',emissiveIntensity:!locked&&c==='window'?0.6:0,transparent:locked,opacity:locked?LOCKED_3D.opacity:1}));
      mats.set(c,m);
    }
    return mats.get(c);
  };
  const parts=buildingParts(id),bounds=partsBounds(parts),model=new Group();
  const geo={box:own(new BoxGeometry(1,1,1)),cyl:own(new CylinderGeometry(1,1,1,28)),cone:own(new ConeGeometry(1,1,28)),pyr:own(new ConeGeometry(1,1,4))};
  geo.pyr.rotateY(Math.PI/4);
  // V8LOW L-23: 잠긴 건물(예상도)은 아이보리 반투명(0.55)이라 아이보리 바탕에 녹아 흐렸다 → 따뜻한 회색 면(0.8) + 진한 윤곽선. 색은 그대로 "색 없는 예상도".
  const edgeMat=locked?own(new LineBasicMaterial({color:LOCKED_3D.edge})):null,edgeGeo=locked?{}:null;
  for(const p of parts){
    const m=new Mesh(geo[p.k],matOf(p.c));m.position.set(p.x,p.y,p.z);
    if(p.k==='box')m.scale.set(p.w,p.h,p.d);else m.scale.set(p.r,p.h,p.r);
    model.add(m);
    if(edgeMat){const g=edgeGeo[p.k]??=own(new EdgesGeometry(geo[p.k],30)),line=new LineSegments(g,edgeMat);line.position.copy(m.position);line.scale.copy(m.scale);model.add(line);}
  }
  scene.add(model);
  // 바닥: 아이보리 원판(가장자리 없이 배경에 녹게 그림자 원판과 함께) + 접지 그림자
  const R=bounds.radius*1.25;
  const n=CONTACT_SHADOW.size,shadowTex=own(new DataTexture(shadowTexels(n),n,n,RGBAFormat,UnsignedByteType));shadowTex.magFilter=shadowTex.minFilter=LinearFilter;shadowTex.needsUpdate=true;
  // V8FIX H-01: 흐림은 map의 알파로 준다(three는 alphaMap의 G 채널을 읽어 RGB 255 질감이면 단단한 원판이 된다).
  const floor=new Mesh(own(new CircleGeometry(R,64)),own(new MeshBasicMaterial({color:PART_COLORS.ivory,map:shadowTex,alphaMap:shadowTex,transparent:true,opacity:0.9,depthWrite:false})));floor.rotation.x=-Math.PI/2;floor.position.y=-0.01;scene.add(floor);
  const contact=new Mesh(own(new CircleGeometry(bounds.radius*1.05,48)),own(new MeshBasicMaterial({color:CONTACT_SHADOW.color,map:shadowTex,alphaMap:shadowTex,transparent:true,opacity:CONTACT_SHADOW.opacity+0.1,depthWrite:false})));contact.rotation.x=-Math.PI/2;contact.position.y=0.005;scene.add(contact);
  // 빛 2개: 반구광(땅 = 금 반사) + 왼쪽 위 키 라이트. 금속은 환경맵이 밝기를 만든다.
  const hemi=new HemisphereLight(sky.hemi.sky,warmGround(sky.hemi.ground),1.6),key=new DirectionalLight('#FFF8EC',2.2);key.position.set(-4,9,7);scene.add(hemi,key);
  const fit=()=>{
    const w=canvas.clientWidth||1,h=canvas.clientHeight||1,a=w/h,half=Math.tan(FOV/2*Math.PI/180);
    const needH=(bounds.height+1)/(2*half),needW=(Math.max(-bounds.minX,bounds.maxX)*2+1.6)/(2*half*a);
    return Math.max(needH,needW,6)+bounds.radius*0.6;
  };
  let dist=fit();
  const aim=()=>{const flat=Math.cos(PHI)*dist,y=bounds.height*0.45;camera.position.set(Math.sin(theta)*flat,y+Math.sin(PHI)*dist,Math.cos(theta)*flat);camera.lookAt(0,y,0);};
  const draw=now=>{
    raf=0;if(disposed)return;
    let moving=false;
    if(spin&&showing()){if(spinLast!==null)theta+=spinStep((now-spinLast)/1000);spinLast=now;moving=true;}else spinLast=null;
    aim();
    try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}
    frames++;slot.dataset.frames=String(frames);
    if(frames===1){if(gl.isContextLost()){toFallback('CONTEXT_LOST');return;}fallback.hidden=true;slot.hidden=false;setMode('3d','OK');
      resize();aim();try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}}   // V8LOW L-22: 칸을 보인 직후 실제 크기로 다시 그린다(첫 장면 300×150 늘어짐 없음)
    if(moving)invalidate();
  };
  const invalidate=()=>{if(!raf&&!disposed)raf=win.requestAnimationFrame(draw);};
  const onVisible=()=>{if(doc.visibilityState==='visible'&&spin)invalidate();};
  doc.addEventListener?.('visibilitychange',onVisible);
  // V8FIX L-20: 스크롤로 화면 밖에 있거나 숨은 칸(크기 0)이면 돌지 않는다. 다시 보이면(화면 진입·크기) 이어 돈다.
  let onScreen=true;
  const showing=()=>onScreen&&Boolean(canvas.clientWidth&&canvas.clientHeight)&&doc.visibilityState==='visible';
  const stopSpin=()=>{spin=false;spinLast=null;paintSpin();};
  canvas.addEventListener('pointerdown',e=>{stopSpin();canvas.setPointerCapture?.(e.pointerId);dragging={x:e.clientX};});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;theta-=(e.clientX-dragging.x)*ROTATE_PER_PX;dragging.x=e.clientX;invalidate();});
  const up=()=>{dragging=null;};canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stopSpin();theta+=e.key==='ArrowRight'?0.2:-0.2;invalidate();}});
  if(spinBtn){spinBtn.type='button';spinBtn.className='lb-chip bd-3d-spin';spinBtn.textContent='다시 돌리기';spinBtn.setAttribute('aria-label','건물 다시 천천히 돌리기');spinBtn.addEventListener('click',()=>{spin=true;spinLast=null;paintSpin();invalidate();});}
  paintSpin();
  slot.replaceChildren(...[canvas,spinBtn].filter(Boolean));
  active=handle;
  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dist=fit();};
  observer=win.ResizeObserver?new win.ResizeObserver(()=>{resize();invalidate();}):null;observer?.observe(canvas);
  seer=win.IntersectionObserver?new win.IntersectionObserver(es=>{onScreen=es.at(-1)?.isIntersecting!==false;if(onScreen)invalidate();}):null;seer?.observe(canvas);
  watcher=win.MutationObserver?new win.MutationObserver(()=>{if(!canvas.isConnected)dispose();}):null;watcher?.observe(doc.body,{childList:true,subtree:true});
  resize();invalidate();
  return handle;
}
