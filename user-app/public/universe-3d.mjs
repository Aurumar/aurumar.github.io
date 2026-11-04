// 3D 지식 우주 그리기 (B49). 좌표·상태·링크는 universe-layout.mjs가 계산하고 여기서는 WebGL로 그리기만 한다. 읽기만 하고 어떤 기록도 쓰지 않는다.
// 이미지·텍스처·글자 텍스처 없이 색과 재질만 쓴다(CSP img-src 'none'): 과목 이름은 화면 아래 범례(DOM)가 맡는다. 인라인 style 없음: 캔버스 크기는 styles.css가 정하고 setSize(...,false)로 style을 건드리지 않는다.
// 실패(WebGL2 없음·저사양·첫 장면 오류·컨텍스트 손실·프레임 너무 느림)면 3D를 치우고 fallback(SVG 우주)을 다시 보인다. 같은 데이터다.
import {WebGLRenderer,Scene,PerspectiveCamera,SphereGeometry,BufferGeometry,BufferAttribute,LineSegments,LineBasicMaterial,MeshBasicMaterial,InstancedMesh,Mesh,Object3D,Color,Raycaster,Vector2} from './three.module.js';
import {quality3d,framesTooSlow,FOV,GOLD} from './tower-3d-layout.mjs';

const RED='#D9534F',WHITE='#FFFFFF',NODE_R=0.3,GLOW_R=0.42,HALO_LATE=0.66,HALO_GLOW=0.95,HIT_R=0.8,TAP_PX=8,TAP_MS=500,ROTATE_PER_PX=0.008,ZOOM_PER_WHEEL=0.0012,KEY_ROTATE=0.2,KEY_ZOOM=0.9,SPIN_PER_SECOND=0.12,MAX_PHI=1.25;
let active=null;

const tanHalf=()=>Math.tan(FOV/2*Math.PI/180);
const fitDist=(bound,aspect)=>bound/Math.sin(Math.atan(tanHalf()*Math.min(1,Math.max(0.3,aspect))))*1.05;
export function universeCamera(bound,aspect){return {theta:0.5,phi:0.45,dist:fitDist(bound,aspect)};}
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

export function mountUniverse3d({doc,slot,fallback,data,onNode=null,st=null}){
  active?.dispose();
  const win=doc.defaultView;
  const setMode=(mode,why)=>{slot.dataset.mode=mode;slot.dataset.reason=why;};
  const why=quality3d({cores:win.navigator?.hardwareConcurrency,memoryGb:win.navigator?.deviceMemory,instances:data.nodes.length+data.links.length});
  if(why!=='OK'){setMode('svg',why);return null;}
  const canvas=doc.createElement('canvas');
  canvas.className='universe-3d-canvas';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','3D 지식 우주, 별 '+data.nodes.length+'개. 화살표로 돌리고 플러스 마이너스로 확대합니다. 같은 내용을 2D 그림으로도 볼 수 있습니다');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,powerPreference:'default'});
  if(!gl){setMode('svg','NO_WEBGL2');return null;}
  const hint=doc.createElement('p');hint.className='muted small universe-3d-hint';hint.textContent='끌어서 돌리고 · 휠이나 두 손가락으로 확대 · 별을 누르면 자세히 봅니다';
  let disposed=false,raf=0,renderer=null,started=0,lastT=0,prevT=0,dragging=false,frames=0;
  const deltas=[],owned=[],pointers=new Map();
  const reduced=Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  let observer=null,watcher=null;
  const dispose=()=>{
    if(disposed)return;disposed=true;if(active===handle)active=null;
    if(raf)win.cancelAnimationFrame(raf);
    observer?.disconnect();watcher?.disconnect();
    canvas.removeEventListener('webglcontextlost',onLost);doc.removeEventListener('visibilitychange',onVisible);
    for(const o of owned)o.dispose();
    renderer?.dispose();if(!gl.isContextLost())renderer?.forceContextLoss();
    canvas.remove();hint.remove();
  };
  const toFallback=reason=>{dispose();fallback.hidden=false;slot.hidden=true;setMode('svg',reason);};
  const onLost=()=>toFallback('CONTEXT_LOST');
  const onVisible=()=>invalidate();
  const handle={dispose,canvas};
  canvas.addEventListener('webglcontextlost',onLost);doc.addEventListener('visibilitychange',onVisible);
  try{renderer=new WebGLRenderer({canvas,context:gl,antialias:true,alpha:true});}catch{toFallback('RENDERER_FAILED');return null;}
  renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,2));
  renderer.setClearColor(0x000000,0);

  // 장면: 별(상태 무관 구체) 한 묶음 + 늦음 테두리 한 묶음 + 기억함 후광 한 묶음 + 링크 선 하나.
  const scene=new Scene(),camera=new PerspectiveCamera(FOV,1,0.1,4000),dummy=new Object3D(),tint=new Color();
  const own=x=>{owned.push(x);return x;};
  const ball=own(new SphereGeometry(1,10,8));
  const solid=own(new MeshBasicMaterial({color:0xffffff}));
  const place=(mesh,i,n,s)=>{dummy.position.set(n.x,n.y,n.z);dummy.scale.set(s,s,s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  const instanced=(mat,rows,scaleOf,colorOf)=>{
    if(!rows.length)return null;
    const mesh=new InstancedMesh(ball,mat,rows.length);mesh.frustumCulled=false;own(mesh);
    rows.forEach((n,i)=>{place(mesh,i,n,scaleOf(n));mesh.setColorAt(i,colorOf(n));});
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;scene.add(mesh);return mesh;
  };
  const colorOf=n=>{tint.set(data.clusters[n.cluster].color);if(n.state==='glow')tint.lerp(new Color(WHITE),0.45);return tint;};
  instanced(solid,data.nodes,n=>n.state==='glow'?GLOW_R:NODE_R,colorOf);
  instanced(own(new MeshBasicMaterial({color:0xffffff,wireframe:true})),data.nodes.filter(n=>n.state==='late'),()=>HALO_LATE,()=>tint.set(RED));
  instanced(own(new MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.28,depthWrite:false})),data.nodes.filter(n=>n.state==='glow'),()=>HALO_GLOW,n=>tint.set(data.clusters[n.cluster].color).lerp(new Color(WHITE),0.6));
  if(data.links.length){
    const pos=new Float32Array(data.links.length*6);
    data.links.forEach((l,i)=>{const a=data.nodes[l.a],b=data.nodes[l.b];pos.set([a.x,a.y,a.z,b.x,b.y,b.z],i*6);});
    const geo=own(new BufferGeometry());geo.setAttribute('position',new BufferAttribute(pos,3));
    const lines=new LineSegments(geo,own(new LineBasicMaterial({color:0xcccccc,transparent:true,opacity:0.22})));lines.frustumCulled=false;scene.add(lines);
  }
  // 누르기용 보이지 않는 구체(그리지 않고 광선 검사만 한다). 손가락으로 누르기 쉽게 별보다 크다.
  const hitMesh=new InstancedMesh(ball,own(new MeshBasicMaterial()),Math.max(1,data.nodes.length));hitMesh.visible=false;own(hitMesh);
  data.nodes.forEach((n,i)=>place(hitMesh,i,n,HIT_R));hitMesh.updateMatrixWorld();
  const picked=new Mesh(ball,own(new MeshBasicMaterial({color:GOLD,wireframe:true})));picked.visible=false;scene.add(picked);

  const aspect=()=>{const w=canvas.clientWidth||1,h=canvas.clientHeight||1;return w/h;};
  const cam=st?(st.camUniverse??=universeCamera(data.bound,1)):universeCamera(data.bound,1);
  let fitted=Boolean(st?.camUniverseFitted);
  const aim=()=>{clampUniverseCamera(cam,data.bound,aspect());const p=universePosition(cam);camera.position.set(p.x,p.y,p.z);camera.lookAt(0,0,0);};
  const resize=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(!fitted){Object.assign(cam,universeCamera(data.bound,w/h));fitted=true;if(st)st.camUniverseFitted=true;}
  };
  const visible=()=>Boolean(canvas.clientWidth&&canvas.clientHeight)&&doc.visibilityState==='visible';
  const drawFrame=now=>{
    raf=0;if(disposed)return;
    if(!started)started=now;
    const spinning=!reduced&&!dragging&&visible();
    if(prevT&&(spinning||dragging)&&visible()){
      const dt=now-prevT;
      deltas.push(dt);if(deltas.length>30)deltas.shift();
      if(framesTooSlow(deltas)){toFallback('SLOW_FRAMES');return;}
      if(spinning)cam.theta+=SPIN_PER_SECOND*dt/1000;
    }
    prevT=spinning||dragging?now:0;
    aim();
    try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}
    frames++;slot.dataset.frames=String(frames);
    if(frames===1){
      if(gl.isContextLost()){toFallback('CONTEXT_LOST');return;}
      fallback.hidden=true;slot.hidden=false;setMode('3d','OK');
      slot.dataset.instances=String(data.nodes.length);slot.dataset.links=String(data.links.length);slot.dataset.drawCalls=String(renderer.info.render.calls);
    }
    if(spinning)invalidate();
  };
  const invalidate=()=>{if(!raf&&!disposed)raf=win.requestAnimationFrame(drawFrame);};

  // 조작: 끌기 = 회전(좌우)·기울이기(위아래), 휠·두 손가락 = 확대, 짧게 누르기 = 별 고르기. 키보드도 같은 동작.
  const pick=(x,y)=>{
    const rect=canvas.getBoundingClientRect(),ray=new Raycaster();
    ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1),camera);
    const hit=ray.intersectObject(hitMesh,false)[0];
    return hit?hit.instanceId:null;
  };
  const select=i=>{
    const n=data.nodes[i];picked.position.set(n.x,n.y,n.z);picked.scale.set(HIT_R*0.6,HIT_R*0.6,HIT_R*0.6);picked.visible=true;
    slot.dataset.selected=n.id;invalidate();
  };
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
    if(e.type==='pointerup'&&down&&down.moved<TAP_PX&&e.timeStamp-down.at<TAP_MS&&pointers.size===0){const i=pick(e.clientX,e.clientY);if(i!==null){select(i);onNode?.(data.nodes[i]);}}
    down=null;pinch=0;
    invalidate();
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
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

  slot.replaceChildren(canvas,hint);
  active=handle;
  slot.hidden=false;
  observer=new win.ResizeObserver(()=>{resize();invalidate();});observer.observe(canvas);
  // 화면이 다시 그려져 캔버스가 문서에서 빠지면 GPU 자원을 바로 돌려준다.
  watcher=new win.MutationObserver(()=>{if(!canvas.isConnected)dispose();});watcher.observe(doc.body,{childList:true,subtree:true});
  resize();invalidate();
  return handle;
}
