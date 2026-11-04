// 3D 탑 그리기 (B44A). 배치는 tower-3d-layout.mjs가 계산하고 여기서는 WebGL로 그리기만 한다. 읽기만 하고 어떤 기록도 쓰지 않는다.
// 이미지·텍스처 없이 색과 재질만 쓴다(CSP img-src 'none'). 인라인 style 없음: 캔버스 크기는 styles.css가 정하고 setSize(...,false)로 style을 건드리지 않는다.
// 실패(WebGL2 없음·저사양·첫 장면 오류·컨텍스트 손실·프레임 너무 느림)면 3D를 치우고 fallback(2.5D SVG 탑)을 다시 보인다. 같은 데이터다.
import {WebGLRenderer,Scene,PerspectiveCamera,HemisphereLight,DirectionalLight,BoxGeometry,ConeGeometry,BufferGeometry,BufferAttribute,MeshLambertMaterial,MeshBasicMaterial,PointsMaterial,InstancedMesh,Mesh,Points,Object3D,Color,Raycaster,Vector2} from './three.module.js';
import {towerScene,quality3d,framesTooSlow,initialCamera,clampCamera,cameraPosition,particleAt,growAt,FOV,GOLD,MOTION_SECONDS,GROW_SECONDS,FALL_SECONDS} from './tower-3d-layout.mjs';

const MORTAR_DARK='#4A3F2E',CORE='#E4DBC8',SLAB='#BDAF96',WINDOW='#FFE9A8',TAP_PX=8,TAP_MS=500,ROTATE_PER_PX=0.008,ZOOM_PER_WHEEL=0.0012,KEY_ROTATE=0.2,KEY_ZOOM=0.9;
let active=null;

export function mountTower3d({doc,slot,fallback,ach,st=null,onFloor=null}){
  active?.dispose();
  const win=doc.defaultView,data=towerScene(ach);
  const setMode=(mode,why)=>{slot.dataset.mode=mode;slot.dataset.reason=why;};
  const why=quality3d({cores:win.navigator?.hardwareConcurrency,memoryGb:win.navigator?.deviceMemory,instances:data.total});
  if(why!=='OK'){setMode('svg',why);return null;}
  const canvas=doc.createElement('canvas');
  canvas.className='tower-3d-canvas';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','3D 탑 '+data.floors.length+'층. 좌우 화살표로 돌리고 위아래 화살표로 층을 고르고 Enter로 그 주를 봅니다');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,powerPreference:'default'});
  if(!gl){setMode('svg','NO_WEBGL2');return null;}
  const hint=doc.createElement('p');hint.className='muted small tower-3d-hint';hint.textContent='끌어서 돌리고 위아래로 옮깁니다 · 휠이나 두 손가락으로 확대';
  let disposed=false,raf=0,renderer=null,started=0,lastT=0,dragging=false,frames=0,grown=false;
  const deltas=[],owned=[],pointers=new Map();
  const reduced=Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const dispose=()=>{
    if(disposed)return;disposed=true;if(active===handle)active=null;
    if(raf)win.cancelAnimationFrame(raf);
    observer?.disconnect();watcher?.disconnect();
    canvas.removeEventListener('webglcontextlost',onLost);
    for(const o of owned)o.dispose();
    renderer?.dispose();if(!gl.isContextLost())renderer?.forceContextLoss();
    canvas.remove();hint.remove();
  };
  const toFallback=reason=>{dispose();fallback.hidden=false;slot.hidden=true;setMode('svg',reason);};
  const onLost=()=>toFallback('CONTEXT_LOST');
  const handle={dispose,canvas};
  let observer=null,watcher=null;
  canvas.addEventListener('webglcontextlost',onLost);
  try{renderer=new WebGLRenderer({canvas,context:gl,antialias:true,alpha:true});}catch{toFallback('RENDERER_FAILED');return null;}
  renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,2));
  renderer.setClearColor(0x000000,0);

  // 장면: 인스턴스 묶음마다 InstancedMesh 하나. 위치·색은 배치 계산 결과를 그대로 쓴다.
  const scene=new Scene(),camera=new PerspectiveCamera(FOV,1,0.1,4000),dummy=new Object3D(),tint=new Color();
  const own=x=>{owned.push(x);return x;};
  const cube=own(new BoxGeometry(1,1,1)),cone=own(new ConeGeometry(1,1,4));
  const lit=own(new MeshLambertMaterial({color:0xffffff})),glow=own(new MeshBasicMaterial({color:0xffffff}));
  const place=(mesh,i,r,grow=1)=>{dummy.position.set(r.x,r.y-(r.sy*(1-grow))/2,r.z);dummy.scale.set(r.sx,Math.max(0.0001,r.sy*grow),r.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  const instanced=(geo,mat,rows,colorOf)=>{
    if(!rows.length)return null;
    const mesh=new InstancedMesh(geo,mat,rows.length);mesh.frustumCulled=false;own(mesh);
    rows.forEach((r,i)=>{place(mesh,i,r);mesh.setColorAt(i,colorOf(r));});
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;scene.add(mesh);return mesh;
  };
  const fixed=hex=>{const c=new Color(hex);return ()=>c;};
  const brickMesh=instanced(cube,lit,data.bricks,r=>tint.set(r.color));
  const dark=new Color(MORTAR_DARK),gold=new Color(GOLD);
  instanced(cube,glow,data.mortar,r=>tint.copy(dark).lerp(gold,r.brightness));
  instanced(cube,lit,data.cores,fixed(CORE));
  instanced(cube,lit,data.slabs,fixed(SLAB));
  instanced(cube,glow,data.windows,fixed(WINDOW));
  instanced(cube,glow,data.bands,r=>tint.copy(dark).lerp(gold,r.brightness));
  instanced(cube,glow,data.rails,r=>tint.set(r.color));
  instanced(cube,glow,data.lamps,r=>tint.set(r.color));
  instanced(cone,lit,data.spire,fixed(GOLD));
  // 층 고르기용 보이지 않는 상자(그리지 않고 광선 검사만 한다)
  const hitMesh=new InstancedMesh(cube,own(new MeshBasicMaterial()),data.hits.length);hitMesh.visible=false;own(hitMesh);
  data.hits.forEach((r,i)=>place(hitMesh,i,r));hitMesh.updateMatrixWorld();
  const picked=new Mesh(cube,own(new MeshBasicMaterial({color:GOLD,wireframe:true})));picked.visible=false;scene.add(picked);
  const sky=new HemisphereLight(0xffffff,0xb8a88a,1.7),sun=new DirectionalLight(0xffffff,1.6);scene.add(sky,sun,sun.target);
  // 금 입자는 오늘 벽돌이 있을 때만, 움직임 줄이기면 만들지 않는다.
  const motion=!reduced&&data.particles.length>0;
  const dots=motion?own(new BufferGeometry()):null,dotPos=motion?new Float32Array(data.particles.length*3):null;
  if(motion){dots.setAttribute('position',new BufferAttribute(dotPos,3));const pts=new Points(dots,own(new PointsMaterial({color:GOLD,size:0.16,transparent:true,opacity:0.95})));pts.frustumCulled=false;scene.add(pts);}
  const todayRows=motion?data.bricks.map((r,i)=>({r,i})).filter(x=>x.r.today):[];

  const aspect=()=>{const w=canvas.clientWidth||1,h=canvas.clientHeight||1;return w/h;};
  const cam=st?(st.cam3d??=initialCamera(data,1)):initialCamera(data,1);
  let selected=data.floors.length-1,fitted=Boolean(st?.cam3dFitted);
  const aim=()=>{clampCamera(cam,data,aspect());const p=cameraPosition(cam);camera.position.set(p.x,p.y,p.z);camera.lookAt(0,cam.y,0);sun.position.set(p.x+4,p.y+8,p.z);sun.target.position.set(0,cam.y,0);};
  const resize=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(!fitted){Object.assign(cam,initialCamera(data,w/h));fitted=true;if(st)st.cam3dFitted=true;}
  };
  const drawFrame=now=>{
    raf=0;if(disposed)return;
    if(!started)started=now;
    const t=(now-started)/1000,animating=motion&&t<MOTION_SECONDS+FALL_SECONDS;
    if(lastT&&(animating||dragging)&&doc.visibilityState==='visible'){
      deltas.push(now-lastT);if(deltas.length>30)deltas.shift();
      if(framesTooSlow(deltas)){toFallback('SLOW_FRAMES');return;}
    }
    lastT=animating||dragging?now:0;
    if(motion){
      data.particles.forEach((p,i)=>{const at=particleAt(p,t);dotPos[i*3]=at?at.x:0;dotPos[i*3+1]=at?at.y:-1000;dotPos[i*3+2]=at?at.z:0;});
      dots.attributes.position.needsUpdate=true;
      if(!grown&&brickMesh){todayRows.forEach(({r,i},k)=>place(brickMesh,i,r,growAt(k,todayRows.length,t)));brickMesh.instanceMatrix.needsUpdate=true;grown=t>=GROW_SECONDS;}
    }
    aim();
    try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}
    frames++;slot.dataset.frames=String(frames);
    if(frames===1){
      if(gl.isContextLost()){toFallback('CONTEXT_LOST');return;}
      fallback.hidden=true;slot.hidden=false;setMode('3d','OK');
      slot.dataset.instances=String(data.total);slot.dataset.bricks=String(data.counts.bricks);slot.dataset.drawCalls=String(renderer.info.render.calls);
    }
    if(animating)invalidate();
  };
  const invalidate=()=>{if(!raf&&!disposed)raf=win.requestAnimationFrame(drawFrame);};

  // 조작: 끌기 = 좌우 회전·위아래 이동, 휠·두 손가락 = 확대, 짧게 누르기 = 층 고르기. 키보드도 같은 동작.
  const pick=(x,y)=>{
    const rect=canvas.getBoundingClientRect(),ray=new Raycaster();
    ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1),camera);
    const hit=ray.intersectObject(hitMesh,false)[0];
    return hit?hit.instanceId:null;
  };
  const select=f=>{
    selected=f;const r=data.hits[f];
    picked.position.set(r.x,r.y,r.z);picked.scale.set(r.sx+0.04,r.sy+0.04,r.sz+0.04);picked.visible=true;
    slot.dataset.selected=String(data.floors[f].index);
    invalidate();
  };
  const open=f=>{const w=data.floors[f]?.week;if(w)onFloor?.(w);};
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
    if(e.type==='pointerup'&&down&&down.moved<TAP_PX&&e.timeStamp-down.at<TAP_MS&&pointers.size===0){const f=pick(e.clientX,e.clientY);if(f!==null){select(f);open(f);}}
    down=null;pinch=0;
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();cam.dist*=Math.exp(e.deltaY*ZOOM_PER_WHEEL);invalidate();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    const k=e.key;let used=true;
    if(k==='ArrowLeft')cam.theta-=KEY_ROTATE;
    else if(k==='ArrowRight')cam.theta+=KEY_ROTATE;
    else if(k==='ArrowUp'||k==='ArrowDown'){const f=Math.max(0,Math.min(data.floors.length-1,selected+(k==='ArrowUp'?1:-1)));select(f);cam.y=data.hits[f].y;}
    else if(k==='+'||k==='=')cam.dist*=KEY_ZOOM;
    else if(k==='-')cam.dist/=KEY_ZOOM;
    else if(k==='Enter'||k===' ')open(selected);
    else used=false;
    if(used){e.preventDefault();invalidate();}
  });

  slot.replaceChildren(canvas,hint);
  active=handle;
  slot.hidden=false;
  observer=new win.ResizeObserver(()=>{resize();invalidate();});observer.observe(canvas);
  // 화면이 다시 그려져 캔버스가 문서에서 빠지면 GPU 자원을 바로 돌려준다.
  watcher=new win.MutationObserver(()=>{if(!canvas.isConnected)dispose();});watcher.observe(doc.body,{childList:true,subtree:true});
  resize();invalidate();
  return handle;
}
