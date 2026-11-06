// 공부 소리·집중 화면 설정·화면 켜 두기 (S1C). 설계: AUTOPILOT\design\S1D_STUDY_LIVE_DESIGN.md §5·§6, V4 결정 S1D D3. 저장은 이 기기 localStorage lb.live.settings.v1 한 칸뿐(새 기록 종류 0, 금고·서버 쓰기 0, 네트워크 0).
// 소리는 WebAudio 발진기로 만든다: 소리 파일·<audio>·CSP 변경 0. AudioContext는 사용자 동작(click·keydown) 안에서만 만들고 다시 쓴다. 동작이 있기 전에는 소리가 나지 않는다.
// 벽돌 완성은 S1A onBrick(n,gold)을 듣는다. 째깍은 화면이 숨겨지면 멈추므로 소리는 보이는 화면에서만 난다. 가려졌을 때의 토스트는 createBrickWatch(pc-toast.mjs)가 맡는다.
// 시계·저장소·AudioContext·wakeLock은 주입한다(시험은 가짜를 꽂는다). 합성 데이터로만 시험한다.
import {LIVE_SETTINGS_KEY,liveState,onBrick,setLiveTopExtra} from './study-live.mjs';
import {BRICK_MINUTES} from './life-model.mjs';
import {XP} from './life-achieve.mjs';

export const SETTING_KEYS=Object.freeze(['sound','autoOpen','wakeLock','brickToast']);
export const SETTING_LABELS=Object.freeze({sound:'벽돌 완성 소리',autoOpen:'집중 시작할 때 집중 화면 열기',wakeLock:'타이머가 도는 동안 화면 켜 두기'});
export const BRICK_NOTES=Object.freeze([659.25,880]),GOLD_NOTES=Object.freeze([659.25,880,1318.51]);   // 벽돌 두 음, 금벽돌 세 음
export const NOTE_SEC=0.175,CHIME_PEAK=0.06,RESUME_WAIT_MS=2000,WAKE_CHECK_MS=30000;
const GOLD_BRICKS=XP.GOLD_MINUTES/BRICK_MINUTES;

// ---- 설정: 기본값은 기기마다(V4 결정 S1D D3: 소리는 PC·iPad 켬, Fold 끔). 사용자가 바꾼 칸만 저장하고, 나머지는 기본값을 따른다 ----
export const defaultSettings=(fold=false)=>({sound:!fold,autoOpen:true,wakeLock:false,brickToast:true});
export const foldDevice=(nativeAvailable,userAgent)=>nativeAvailable===true||/Android/i.test(String(userAgent??''));
const memory=new Map();   // 저장소가 막혀 있으면 이번 실행 동안만 둔다
function readRaw(storage){
  let v;
  try{if(!storage)throw new Error('NO_STORAGE');v=JSON.parse(storage.getItem(LIVE_SETTINGS_KEY)??'null');}catch{v=memory.get(LIVE_SETTINGS_KEY)??null;}
  const out={};
  if(v&&typeof v==='object'&&!Array.isArray(v))for(const k of SETTING_KEYS)if(typeof v[k]==='boolean')out[k]=v[k];
  return out;
}
export const loadLiveSettings=(storage,{fold=false}={})=>({...defaultSettings(fold),...readRaw(storage)});
export function setLiveSetting(key,on,storage,{fold=false}={}){
  if(!SETTING_KEYS.includes(key))return loadLiveSettings(storage,{fold});
  const next={...readRaw(storage),[key]:Boolean(on)};
  memory.set(LIVE_SETTINGS_KEY,next);
  try{storage?.setItem(LIVE_SETTINGS_KEY,JSON.stringify(next));}catch{/* 이번 실행 동안만 */}
  return loadLiveSettings(storage,{fold});
}

// ---- 소리 ----
// arm은 사용자 동작 안에서만 부른다. play는 arm 전이면 아무것도 만들지 않는다.
export function createChime({audioCtor=()=>globalThis.AudioContext??globalThis.webkitAudioContext??null,soundOn=()=>true,nowMs=()=>Date.now()}={}){
  let ctx=null,lastN=0,lastGold=false;
  const tones=freqs=>{
    freqs.forEach((f,i)=>{
      const t=ctx.currentTime+i*NOTE_SEC,o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine';o.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(CHIME_PEAK,t+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t+NOTE_SEC);
      o.connect(g);g.connect(ctx.destination);
      o.onended=()=>{o.disconnect();g.disconnect();};
      o.start(t);o.stop(t+NOTE_SEC);
    });
  };
  return {
    arm(){
      if(!soundOn())return false;
      try{
        if(!ctx){const C=audioCtor();if(!C)return false;ctx=new C();}
        if(ctx.state==='suspended')void ctx.resume?.()?.catch?.(()=>{});
        return true;
      }catch{return false;}
    },
    // 세 음은 금벽돌이 된 순간 한 번뿐이다(그 뒤 벽돌은 gold가 계속 참이어도 두 음). 세션이 바뀌면 n이 줄어드는 것으로 안다. 다시 불러온 뒤 첫 사건은 앞을 모르므로 n으로 판단한다.
    play(n,gold){
      if(n<=lastN){lastN=0;lastGold=false;}
      const first=gold&&(lastN?!lastGold:n===GOLD_BRICKS);
      lastN=n;lastGold=gold;
      if(!soundOn()||!ctx)return 'SILENT';
      const notes=first?GOLD_NOTES:BRICK_NOTES;
      try{
        if(ctx.state==='running'){tones(notes);return 'PLAYED';}
        // 멈춘 상태에서 예약하면 풀릴 때 뒤늦게 울린다. 곧바로 풀릴 때만 울리고 아니면 이번 소리는 건너뛴다.
        const asked=nowMs();
        void ctx.resume?.()?.then?.(()=>{if(ctx.state==='running'&&nowMs()-asked<RESUME_WAIT_MS)tones(notes);})?.catch?.(()=>{});
        return 'RESUMING';
      }catch{return 'SILENT';}   // 소리 오류가 시계를 멈추지 않는다
    },
  };
}

// ---- 화면 켜 두기(Screen Wake Lock, 기본 끔). 숨겨지면 브라우저가 놓으므로 보일 때 다시 잡는다. 없는 기기에서는 아무것도 안 한다 ----
export function createWakeKeeper({nav=globalThis.navigator,doc=null,want=()=>false}={}){
  let lock=null,asking=false;
  const supported=()=>typeof nav?.wakeLock?.request==='function';
  const release=()=>{const l=lock;lock=null;void l?.release?.()?.catch?.(()=>{});};
  return {
    supported,release,held:()=>Boolean(lock&&!lock.released),
    async sync(){
      if(!want()||doc?.visibilityState==='hidden'){release();return 'OFF';}
      if(lock&&!lock.released)return 'HELD';
      if(asking||!supported())return 'WAIT';
      asking=true;
      try{
        const got=await nav.wakeLock.request('screen');
        lock=got;got.addEventListener?.('release',()=>{if(lock===got)lock=null;});
        if(!want())release();   // 기다리는 동안 타이머가 끝났거나 설정을 껐다
        return lock?'HELD':'OFF';
      }catch{lock=null;return 'REFUSED';}
      finally{asking=false;}
    },
  };
}

// ---- 토스트 감시가 읽는 값: 이 세션의 벽돌(넘었는지 판단)과 오늘 벽돌(토스트의 n). 저장 0 ----
// FIX37C (H37-S7): forgotten = 어제보다 오래 시작했거나 24시간을 넘긴 잊은 타이머(덮개가 "언제 끝났나요"를 묻는 것과 같은 기준). 담지도 않은 벽돌을 알리지 않는다.
export function brickProgress({timer,nowIso,study=null,draftCard=null}){
  if(!timer)return null;
  const s=liveState({timer,nowIso,study,draftCard});
  return {startIso:timer.startIso,sessionBricks:s.session.bricks,todayBricks:s.bricks.bricks,...(s.oldStart||s.clock.overDay?{forgotten:true}:{})};
}

// ---- 덮개 오른쪽 위 🔈 단추 ----
export function soundButton(h,{on,toggle}){
  const paint=b=>{const v=on();b.textContent=v?'🔈':'🔇';b.setAttribute('aria-label',v?'소리 켜짐 · 누르면 끕니다':'소리 꺼짐 · 누르면 켭니다');b.setAttribute('aria-pressed',v?'true':'false');};
  const b=h.button('',()=>{toggle();paint(b);},'secondary live-sound');
  paint(b);
  return b;
}

// ---- 설정 화면 줄. ctx: {h:{el,add},kit:{toggle},storage,fold,wakeSupported} ----
export function renderLiveSettings(root,ctx){
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel native-settings'),h.el('h2','집중 화면','panel-title'));
  h.add(sec,h.el('p','이 기기에만 저장합니다. 소리는 앱에서 무언가를 누른 뒤부터 납니다.','muted'));
  const on=loadLiveSettings(ctx.storage,{fold:ctx.fold});
  for(const key of ['sound','autoOpen','wakeLock'])h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle(SETTING_LABELS[key],on[key],v=>{setLiveSetting(key,v,ctx.storage,{fold:ctx.fold});ctx.onChange?.(key,v);})));
  if(ctx.wakeSupported===false)h.add(sec,h.el('p','이 기기에서는 화면 켜 두기를 쓸 수 없어요.','muted small'));
  h.add(root,sec);return sec;
}

// ---- 조립(app.mjs가 한 번 부른다). timer()는 진행 중 타이머 또는 null ----
export function installStudyChime({doc=globalThis.document,win=globalThis,nav=globalThis.navigator,storage,fold=()=>false,timer,audioCtor,nowMs,timers=globalThis}={}){
  const opts=()=>({fold:fold()}),settings=()=>loadLiveSettings(storage,opts());
  const chime=createChime({audioCtor,soundOn:()=>settings().sound,nowMs});
  const running=t=>Boolean(t)&&!t.pausedAt&&!t.endIso;   // FIX37C (H37-S4): 설명대로 타이머가 실제로 도는 동안만(휴식·담기 대기 제외)
  const wake=createWakeKeeper({nav,doc,want:()=>settings().wakeLock&&running(timer())});
  const syncWake=()=>{void wake.sync();};
  // 버블 단계라 "집중 시작" 단추가 타이머를 적은 뒤에 불린다. 타이머가 없을 때는 AudioContext를 만들지 않는다.
  const gesture=()=>{if(timer())chime.arm();syncWake();};
  const offBrick=onBrick((n,gold)=>{chime.play(n,gold);});
  setLiveTopExtra(h=>soundButton(h,{on:()=>settings().sound,toggle:()=>{setLiveSetting('sound',!settings().sound,storage,opts());}}));
  doc?.addEventListener?.('click',gesture);doc?.addEventListener?.('keydown',gesture);doc?.addEventListener?.('visibilitychange',syncWake);win?.addEventListener?.('storage',syncWake);
  const handle=timers.setInterval(syncWake,WAKE_CHECK_MS);handle?.unref?.();   // 담기·취소는 비동기로 끝나므로 동작 이벤트만으로는 놓칠 수 있다
  return {
    chime,wake,settings,gesture,
    stop(){
      offBrick();setLiveTopExtra(null);timers.clearInterval(handle);wake.release();
      doc?.removeEventListener?.('click',gesture);doc?.removeEventListener?.('keydown',gesture);doc?.removeEventListener?.('visibilitychange',syncWake);win?.removeEventListener?.('storage',syncWake);
    },
  };
}
