// 3D 지식 우주 그리기 (B49). 좌표·상태·링크는 universe-layout.mjs가 계산하고 여기서는 WebGL로 그리기만 한다. 읽기만 하고 어떤 기록도 쓰지 않는다.
// 이미지·텍스처·글자 텍스처 없이 색과 재질만 쓴다(CSP img-src 'none'): 과목 이름은 화면 아래 범례(DOM)가 맡는다. 인라인 style 없음: 캔버스 크기는 styles.css가 정하고 setSize(...,false)로 style을 건드리지 않는다.
// 실패(WebGL2 없음·저사양·첫 장면 오류·컨텍스트 손실·프레임 너무 느림)면 3D를 치우고 fallback(SVG 우주)을 다시 보인다. 같은 데이터다.
// V8W7: 과목마다 행성(금속 재질 구체 + 금 고리, 오답이 많을수록 크다)을 군집 가운데에 그리고, 행성도 누를 수 있다(onPlanet). 예시 우주(data.example)는 금 톤 선·"예시" 표지를 더한다.
import {WebGLRenderer,Scene,PerspectiveCamera,SphereGeometry,TorusGeometry,BufferGeometry,BufferAttribute,LineSegments,LineBasicMaterial,MeshBasicMaterial,MeshStandardMaterial,HemisphereLight,DirectionalLight,InstancedMesh,Mesh,Object3D,Color,Raycaster,Vector2} from './three.module.js';
import {quality3d,framesTooSlow,FOV,GOLD,TOWER_GOLD} from './tower-3d-layout.mjs';

const RED='#D9534F',WHITE='#FFFFFF',NODE_R=0.3,GLOW_R=0.42,HALO_LATE=0.66,HALO_GLOW=0.95,HIT_R=0.8,TAP_PX=8,TAP_MS=500,ROTATE_PER_PX=0.008,ZOOM_PER_WHEEL=0.0012,KEY_ROTATE=0.2,KEY_ZOOM=0.9,SPIN_PER_SECOND=0.12,MAX_PHI=1.25;
// 행성 반지름 = 군집 반지름 × 0.36(군집 반지름이 오답 수의 세제곱근으로 커지므로 행성도 함께 커진다). 고리 = 행성의 1.7배, 기울기 0.45.
export const PLANET_SCALE=0.36,PLANET_RING=1.7,PLANET_TILT=0.45,PLANET_MATERIAL=Object.freeze({metalness:0.45,roughness:0.32,emissiveIntensity:0.16});
export const planetRadius=c=>Math.round(c.radius*PLANET_SCALE*1e4)/1e4;
export const planetsOf=data=>data.clusters.filter(c=>c.count>0);
let active=null;

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

export function mountUniverse3d({doc,slot,fallback,data,onNode=null,onPlanet=null,st=null}){
  active?.dispose();
  const win=doc.defaultView;
  const setMode=(mode,why)=>{slot.dataset.mode=mode;slot.dataset.reason=why;};
  const why=quality3d({cores:win.navigator?.hardwareConcurrency,memoryGb:win.navigator?.deviceMemory,instances:data.nodes.length+data.links.length});
  if(why!=='OK'){setMode('svg',why);return null;}
  const canvas=doc.createElement('canvas');
  const planets=planetsOf(data),example=Boolean(data.example);
  canvas.className='universe-3d-canvas'+(example?' universe-example-canvas':'');canvas.tabIndex=0;canvas.setAttribute('role','application');
  canvas.setAttribute('aria-label',(example?'3D 예시 우주, ':'3D 지식 우주, ')+'행성 '+planets.length+'개 별 '+data.nodes.length+'개. 화살표로 돌리고 플러스 마이너스로 확대합니다. 같은 내용을 2D 그림으로도 볼 수 있습니다');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,powerPreference:'default'});
  if(!gl){setMode('svg','NO_WEBGL2');return null;}
  const hint=doc.createElement('p');hint.className='muted small universe-3d-hint';hint.textContent='끌어서 돌리고 · 휠이나 두 손가락으로 확대 · 행성이나 별을 누르면 '+(example?'설명을 봅니다':'자세히 봅니다');
  // 예시 우주는 캔버스 왼쪽 위에 "예시" 표지를 겹쳐 둔다(실제 우주와 헷갈리지 않게).
  const tag=example?doc.createElement('p'):null;if(tag){tag.className='universe-example-tag';tag.textContent='예시';}
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
    canvas.remove();hint.remove();tag?.remove();
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
    const lines=new LineSegments(geo,own(new LineBasicMaterial(example?{color:TOWER_GOLD.mid,transparent:true,opacity:0.55}:{color:0xcccccc,transparent:true,opacity:0.22})));lines.frustumCulled=false;scene.add(lines);
  }
  // 행성: 군집(과목)마다 금속 구체 1개 + 얇은 금 고리 1개(오답이 있는 과목만). 조명은 행성에만 듣는다(별은 MeshBasicMaterial). 반구광 + 왼쪽 위 키 라이트 2개.
  if(planets.length){
    const body=own(new MeshStandardMaterial({color:0xffffff,...PLANET_MATERIAL,emissive:TOWER_GOLD.hi}));
    const globe=new InstancedMesh(ball,body,planets.length);globe.frustumCulled=false;own(globe);
    planets.forEach((c,i)=>{place(globe,i,c,planetRadius(c));globe.setColorAt(i,tint.set(c.color));});
    globe.instanceMatrix.needsUpdate=true;globe.instanceColor.needsUpdate=true;scene.add(globe);
    const hoop=own(new TorusGeometry(1,0.035,6,48)),hoopMat=own(new MeshStandardMaterial({color:TOWER_GOLD.mid,metalness:0.6,roughness:0.3,emissive:TOWER_GOLD.light,emissiveIntensity:0.25}));
    const rings=new InstancedMesh(hoop,hoopMat,planets.length);rings.frustumCulled=false;own(rings);
    planets.forEach((c,i)=>{const s=planetRadius(c)*PLANET_RING;dummy.position.set(c.x,c.y,c.z);dummy.rotation.set(Math.PI/2-PLANET_TILT,0,(c.index%2?1:-1)*PLANET_TILT*0.5);dummy.scale.set(s,s,s);dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);});
    dummy.rotation.set(0,0,0);rings.instanceMatrix.needsUpdate=true;scene.add(rings);
    const sun=new DirectionalLight(0xffffff,2.2);sun.position.set(-1,1.6,1.2);
    scene.add(new HemisphereLight(0xfff8e8,0xe8d9b0,1.6),sun);
  }
  // 누르기용 보이지 않는 구체(그리지 않고 광선 검사만 한다). 손가락으로 누르기 쉽게 별보다 크다.
  const hitMesh=new InstancedMesh(ball,own(new MeshBasicMaterial()),Math.max(1,data.nodes.length));hitMesh.visible=false;own(hitMesh);
  data.nodes.forEach((n,i)=>place(hitMesh,i,n,HIT_R));hitMesh.updateMatrixWorld();
  const planetHit=new InstancedMesh(ball,own(new MeshBasicMaterial()),Math.max(1,planets.length));planetHit.visible=false;own(planetHit);
  planets.forEach((c,i)=>place(planetHit,i,c,Math.max(HIT_R,planetRadius(c)*1.15)));planetHit.count=planets.length;planetHit.updateMatrixWorld();
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
      // V8LOW L-21·L-22: 칸은 첫 장면 뒤에만 보인다(탑 W6 규칙). 숨은 동안 그린 장면은 기본 크기라 보인 직후 실제 크기로 다시 그리고, 보이게 됐으니 회전을 잇는다.
      resize();aim();try{renderer.render(scene,camera);}catch{toFallback('RENDER_FAILED');return;}
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
    const n=data.nodes[i];picked.position.set(n.x,n.y,n.z);picked.scale.set(HIT_R*0.6,HIT_R*0.6,HIT_R*0.6);picked.visible=true;
    slot.dataset.selected=n.id;invalidate();
  };
  const selectPlanet=c=>{
    const s=planetRadius(c)*1.25;picked.position.set(c.x,c.y,c.z);picked.scale.set(s,s,s);picked.visible=true;
    slot.dataset.selected='planet-'+c.code;invalidate();
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
    if(e.type==='pointerup'&&down&&down.moved<TAP_PX&&e.timeStamp-down.at<TAP_MS&&pointers.size===0){const p=pick(e.clientX,e.clientY);if(p?.planet){selectPlanet(p.planet);onPlanet?.(p.planet);}else if(p){select(p.node);onNode?.(data.nodes[p.node]);}}
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

  slot.replaceChildren(...(tag?[tag]:[]),canvas,hint);
  active=handle;
  // V8LOW L-21: 여기서 칸을 보이지 않는다(첫 프레임 전 빈 캔버스와 SVG가 함께 보였다). drawFrame frames===1이 보인다.
  observer=new win.ResizeObserver(()=>{resize();invalidate();});observer.observe(canvas);
  // 화면이 다시 그려져 캔버스가 문서에서 빠지면 GPU 자원을 바로 돌려준다.
  watcher=new win.MutationObserver(()=>{if(!canvas.isConnected)dispose();});watcher.observe(doc.body,{childList:true,subtree:true});
  resize();invalidate();
  return handle;
}
