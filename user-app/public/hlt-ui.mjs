// 건강 모듈 화면(B3). 합성 데이터로만 시험한다. B38부터 기본 켜짐(저장값 없음=켜짐, '0'만 꺼짐). 꺼진 기기에는 화면·메뉴가 나타나지 않고, 켜져 있어도 사용자 동작 없이 새 기록을 쓰지 않는다.
// 스위치 위치(결정): 이 기기의 로컬 설정(localStorage). 금고 공유로 두면 PREFERENCES의 모양을 바꿔야 해서 아직 갱신하지 않은 기기가 HOLD하고,
// 새 엔티티 종류로 두면 같은 문제가 첫 쓰기에서 생긴다 → 안전한 쪽은 기기별 로컬. 저장소가 막혀 있으면 이번 실행 동안만 유지한다.
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 비공개 습관은 "숨김 항목 보기"를 누른 뒤에만 보이고,
// 앱을 다시 열면 다시 숨겨진다(저장하지 않음). 숨김 상태에서는 라벨뿐 아니라 횟수·시각·마지막 기록 후 n일·7·30일 횟수·알림 문구에도 나오지 않는다.
import {HltFlow} from './hlt-flow.mjs';
import {hltView,hltHomeLine,stepsAverage,sleepStepsToday} from './hlt-projection.mjs';
import {HLT_LIMITS,kstDate,kstMinutes,shiftDay,dateKeyOK,isoOK,UNITS,MEAL_KINDS,MEAL_SIZES,SLEEP_KINDS,CHANGE_KINDS,SYMPTOM_KINDS,MAX_NOTE,MAX_LABEL,MAX_ITEMS,ITEM_TYPES,MAX_STEPS,STEPS_ITEM_ID,nearDate,MAX_SLEEP_MS,MAX_AMOUNT} from './hlt-model.mjs';

const HLT_PROFILE_LIMIT=HLT_LIMITS.HLT_PROFILE;
export const HLT_SWITCH_KEY='lb.hlt.enabled';
let memorySwitch=true;   // B38: 저장값이 없으면 켜짐(명시적으로 끈 기기만 '0'으로 꺼짐)
export function hltEnabled(storage=globalThis.localStorage){try{const v=storage?.getItem(HLT_SWITCH_KEY);return v===null||v===undefined?memorySwitch:v==='1';}catch{return memorySwitch;}}
export function setHltEnabled(on,storage=globalThis.localStorage){memorySwitch=Boolean(on);try{storage?.setItem(HLT_SWITCH_KEY,on?'1':'0');}catch{/* 저장소가 막혀 있으면 이번 실행 동안만 */}return hltEnabled(storage);}

export const HLT_ERROR_TEXT=Object.freeze({
  HLT_ITEM_LIMIT:'한 카드에는 항목을 120개까지만 둘 수 있습니다. 자동으로 지우거나 나누지 않았습니다 · 임시 입력은 그대로 있습니다. 항목을 직접 줄인 뒤 다시 쌓으세요.',
  REBASE_ID_COLLISION:'다른 기기에서 같은 항목 번호(걸음·Fold 수면 등)로 다른 내용을 추가했습니다. 아무것도 저장하지 않았습니다 · 임시 입력은 그대로 있습니다. 임시 입력에서 그 항목을 지우면 다시 쌓을 수 있습니다.',
  UNKNOWN_HLT_PROFILE:'없는 항목을 가리키는 항목이 있습니다. 항목을 고치거나 항목을 먼저 만드세요.',
  INVALID_HLT_STEPS:'걸음 수는 0~'+MAX_STEPS+' 사이의 정수여야 합니다.',
  HLT_DOSE_NEEDS_MED_PROFILE:'복용 기록은 약·측정 항목만 고를 수 있습니다.',HLT_HABIT_NEEDS_HABIT_PROFILE:'습관 기록은 습관 항목만 고를 수 있습니다.',
  HLT_CHECK_COUNT_MUST_BE_ONE:'했다/안했다 습관은 횟수가 1이어야 합니다.',HLT_OPEN_SLEEP_LIMIT:'끝나지 않은 수면은 카드당 하나만 둘 수 있습니다.',
  INVALID_HLT_SLEEP_SPAN:'수면 길이는 0~48시간이어야 하고 끝이 시작보다 빠를 수 없습니다.',HLT_TIME_OUTSIDE_CARD_DATE:'카드 날짜의 앞뒤 하루 안의 시각만 기록할 수 있습니다.',
  HLT_PROFILE_IMMUTABLE:'항목의 키·종류·방식은 바꿀 수 없습니다. 새로 만드세요.',HLT_PROFILE_REMOVED:'삭제한 항목을 가리키는 항목이 있습니다. "삭제한 항목 보기"에서 복원하거나 그 항목을 지우세요 · 임시 입력은 그대로 있습니다.',HLT_PROFILE_DISABLED:'사용을 중단한 항목을 가리키는 항목이 있습니다. 다시 사용으로 바꾸거나 그 항목을 지우세요 · 임시 입력은 그대로 있습니다.',
  APP_ENTITY_LIMIT:'개수 한도에 닿았습니다.',STALE_HEADS:'다른 기기에서 먼저 바뀌었습니다. 다시 받아 합친 뒤 쌓으세요.',BROKEN_HLT_WAKE_REFERENCE:'맑아짐 기록은 같은 카드의 기상 기록을 가리켜야 합니다.',
  MD_NOT_WRITE_READY:'지금은 서버에 쌓을 수 없습니다. 임시 입력은 이 기기에 남아 있습니다.',VERSION_CONFLICT:'다른 기기가 먼저 쌓았습니다. 다시 쌓기를 누르면 받아서 합칩니다.',
  ABORTED:'서버가 이 쌓기를 받지 않았습니다(기록되지 않음) · 임시 입력은 그대로 있습니다. 다시 쌓을 수 있습니다.',
});
export const hltErrorText=code=>HLT_ERROR_TEXT[code]??(code?'처리하지 못했어요 · 임시 입력은 그대로 있습니다.'+' · 문의 코드 ▾\u2060'+code+'\u2060':'쌓지 못했습니다.');
export const NOTICE_TEXT=Object.freeze({
  REBASE_CONFLICT_KEPT_REMOTE:'내가 지운 항목을 다른 기기에서 고쳐서 삭제하지 않고 상대 수정을 남겼습니다.',
  REBASE_CONFLICT_KEPT_LOCAL:'다른 기기에서 지운 항목을 내가 고쳐서 내 수정으로 되살렸습니다.',
  REBASE_VALUE_OVERWRITTEN:'같은 항목을 양쪽에서 고쳤습니다 · 내 값을 썼고 상대 값은 이력에 남아 있습니다.',
  NOTE_OVERWRITTEN:'메모를 양쪽에서 고쳤습니다 · 내 메모를 썼고 상대 메모는 이력에 남아 있습니다.',
});
const STATUS_TEXT=Object.freeze({
  CONFIRMED:'저장 및 동기화 확인됨 · 쌓았습니다.',ALREADY_APPLIED:'이미 반영되어 있습니다 · 새로 저장하지 않았습니다.',NOTHING_TO_CONFIRM:'쌓을 임시 입력이 없습니다.',
  UNKNOWN:'서버 응답을 확인하지 못했습니다 · 임시 입력은 그대로 있습니다. 다시 쌓기를 누르면 결과를 확인한 뒤 이어서 처리합니다(중복 저장 없음).',
  SYNC_FAILED:'서버에서 최신 기록을 받지 못했습니다 · 임시 입력은 그대로 있습니다.',FAILED:'저장하지 못했습니다 · 임시 입력은 그대로 있습니다.',STALE:'다른 기기와 계속 겹쳐 쌓지 못했습니다 · 임시 입력은 그대로 있습니다.',
});

// ---- 시각 입력(KST 시:분 ↔ UTC ISO) ----
export const hhmmKst=iso=>{const m=Math.floor((((Date.parse(iso)+9*3600000)%86400000)+86400000)%86400000/60000);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
export function isoFromKst(date,hhmm,dayOffset=0){
  if(!dateKeyOK(date)||typeof hhmm!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm))return null;
  return new Date(Date.parse(date+'T'+hhmm+':00.000Z')-9*3600000+dayOffset*86400000).toISOString();
}
// K1 (4): 직접 입력한 잠든 시각 HH:MM(KST) → 기상(endAt) 전 24시간 안에서 가장 가까운 그 시각. 형식이 틀리면 null.
export function fellAsleepAt(hhmm,endAt){
  const day=kstDate(endAt),t=isoFromKst(day,hhmm);
  return !t?null:Date.parse(t)>Date.parse(endAt)?isoFromKst(day,hhmm,-1):t;
}
export const SLEEP_SHIFTS=Object.freeze([[15,'+15분'],[30,'+30분'],[60,'+1시간']]);
const mmdd=date=>date.slice(5);
export const SLEEP_TEXT=Object.freeze({
  saved:p=>'취침 '+hhmmKst(p.item.startAt)+' · '+mmdd(p.date)+' 카드 임시 입력에 적어 두었어요 · 기상을 누르면 수면으로 완성돼요.',
  tip:'잠 버튼 = 잠자리에 든 시각, 실제 잠든 시각은 기상 때 고칠 수 있어요.',
  pending:p=>'취침 기록 중 · '+hhmmKst(p.item.startAt)+' (KST) · '+mmdd(p.date)+' 카드 임시 입력 — 기상을 누르면 수면으로 완성돼요.',
  woke:'기상과 수면을 임시 입력에 넣었습니다.',wakeOnly:'기상을 임시 입력에 넣었습니다(수면은 직접 입력하세요).',
  moved:m=>mmdd(m.from)+' 카드에 있던 끝나지 않은 수면을 옮겨 왔어요'+(m.restack?' · 그 카드도 다시 쌓아 주세요.':'.'),
  stale:date=>'끝나지 않은 수면이 '+mmdd(date)+' 카드에 남아 있어요(48시간 넘음) · 그 카드에서 직접 고치세요.',
  fell:(startAt,how)=>'잠든 시각 '+hhmmKst(startAt)+' ('+how+')',button:'잠 버튼 누른 시각',typed:'직접 입력',watched:'워치 기록',
  shifted:(button,label)=>'잠 버튼 '+hhmmKst(button)+' '+label,
  watch:startAt=>'워치 기록: '+hhmmKst(startAt)+' 잠듦 · 이걸로 할까요?',useWatch:'워치 시각으로',
  typeLabel:'잠든 시각 (KST)',typeApply:'잠든 시각 넣기',badTime:'잠든 시각은 HH:MM(예: 23:40) 형식으로 적어 주세요.',
  fixed:startAt=>'잠든 시각을 '+hhmmKst(startAt)+'(으)로 고쳐 임시 입력에 넣었어요.',
  duplicate:'같은 밤 수면이 2개예요 · 하나를 지우세요.',
  stackOpen:'아직 끝나지 않은 수면이 들어 있어요 · 기상 뒤에 쌓으면 한 번에 정리돼요.',
});
// K1 (6): "잠 버튼" 안내는 이 기기에서 처음 1번만 보인다. 표시 여부만 기기 로컬(localStorage)에 둔다(기록 아님). 저장소가 막혀 있으면 이번 실행 동안만.
export const SLEEP_TIP_KEY='lb.hlt.sleepTip';
let memorySleepTip=false;
function takeSleepTip(storage){
  try{if(storage){if(storage.getItem(SLEEP_TIP_KEY)==='1')return false;storage.setItem(SLEEP_TIP_KEY,'1');return true;}}catch{/* 막힌 저장소: 메모리로 */}
  if(memorySleepTip)return false;
  memorySleepTip=true;return true;
}
export const itemLabel=Object.freeze({dose:'복용',sleep:'수면',wake:'기상',clarity:'맑아짐',checkin:'체크인',change:'변화',symptom:'증상',meal:'식사',habit:'습관',steps:'걸음'});
const MEAL_TEXT={BREAKFAST:'아침',LUNCH:'점심',DINNER:'저녁',SNACK:'간식',LATE_NIGHT:'야식'},SIZE_TEXT={LIGHT:'가볍게',NORMAL:'보통',HEAVY:'많이'};
// V6F (CAP1 4): 쉬운 입력과 같은 이름(fatigue = 무기력, depression = 우울). 저장값(kind)은 그대로. 단위는 화면에서 한국어(UNIT_TEXT: tablet → 정).
const KIND_TEXT={fatigue:'무기력',depression:'우울',palpitations:'두근거림',sweating:'땀',other:'기타',main:'주 수면',nap:'낮잠'};
const unitText=u=>UNIT_TEXT[u]??u;

export function itemSummary(it,labelOf){
  switch(it.type){
    case 'dose':return labelOf(it.profileKey)+' '+it.amount+unitText(it.unit)+' · '+hhmmKst(it.at);
    case 'sleep':return KIND_TEXT[it.kind]+' '+hhmmKst(it.startAt)+' → '+(it.endAt?hhmmKst(it.endAt):'아직 안 끝남');
    case 'wake':return '기상 '+hhmmKst(it.at);
    case 'clarity':return '정신 맑아짐 '+hhmmKst(it.at);
    case 'checkin':return '체크인 '+hhmmKst(it.at)+' · 기분 '+it.mood+' 에너지 '+it.energy+' 집중 '+it.focus+' 졸림 '+it.sleepiness;
    case 'change':return KIND_TEXT[it.kind]+' '+it.intensity+' · '+hhmmKst(it.at);
    case 'symptom':return '증상 '+KIND_TEXT[it.kind]+' '+it.intensity+' · '+hhmmKst(it.at);
    case 'meal':return (MEAL_TEXT[it.kind]??it.kind)+(it.size?' · '+SIZE_TEXT[it.size]:'')+' · '+hhmmKst(it.at);
    case 'habit':return labelOf(it.profileKey)+' × '+it.count+(it.at?' · '+hhmmKst(it.at):'');
    case 'steps':return it.count+'걸음';
    default:return it.type;
  }
}

// ---- 포트: 앱의 api/기록 함수를 HltFlow가 쓰는 모양으로 ----
// ctx: {api, mdProfile(), getWhole(), getChanges(), syncForWrite(), hasPending(), reconcile(), uid(), now()}
export function createPorts(ctx){
  const memoryDrafts=new Map();let seq=0,cache=null;
  const hlt=()=>ctx.getWhole().hlt;
  const revisionMap=()=>{const rows=ctx.getChanges();if(cache?.rows===rows)return cache.map;const m=new Map();for(const c of rows)if(c.type==='HLT_DAY')m.set(c.revisionId,c.value.data);cache={rows,map:m};return m;};
  // 초안 저널(봉인된 drafts.lbd)은 PC 앱(APP_SHELL)에만 있다. 브라우저(PWA)·이 PC 단독 모드에는 없어 메모리 초안으로 내려간다(앱을 닫거나 새로고침하면 사라짐 → 화면에 그렇게 표시).
  const journal=ctx.canDrafts?Boolean(ctx.canDrafts()):ctx.mdProfile();
  // B3c 선택 순서: PC 저널 → 이 기기 상자(card-draft-box, 브라우저 IndexedDB 암호문) → 메모리. PC 경로(저널)는 상자를 만들지도 않는다.
  const box=journal?null:ctx.cardDraftBox?.()??null,mode=journal?'JOURNAL':box?.available()?'DEVICE_BOX':'MEMORY';
  const write=body=>ctx.write?ctx.write(body):ctx.api('/api/entity',body);
  return {
    mode,persistent:mode!=='MEMORY',box:mode==='DEVICE_BOX'?box:null,
    latest(date){const d=hlt().days.find(x=>x.date===date);return {card:d?structuredClone(d.data):null,heads:d?[...d.heads]:[]};},
    revision(date,ref){const v=revisionMap().get(ref);return v?structuredClone(v):null;},
    sync:()=>ctx.syncForWrite(),
    session:()=>ctx.session?.()??null,   // B18 (H13-C05): 로그아웃 세대(앱의 mdSignedOutSeq). 흐름의 재적용 회차가 바뀌었는지 본다
    hasPending:()=>Boolean(ctx.hasPending?.()),reconcile:()=>ctx.reconcile?.(),
    // B19: 상자·메모리 경로는 저널의 SERVER_COMMITTED가 없다. ctx.receipt(requestId)(앱: 읽기 전용 /api/command/<requestId>, 이 기기 금고의 영수증)가 있으면
    // NOT_ESTABLISHED가 아닌 결말(COMMITTED·ABORTED·HOLD)을 '이미 결말 남'으로 알려 앱을 다시 연 뒤의 재확정도 원래 영수증에 수렴하게 한다. 서버 호출·쓰기 없음.
    terminal:!journal&&ctx.receipt?async rid=>(await ctx.receipt(rid))?.status!=='NOT_ESTABLISHED':()=>false,
    makeBody:async({requestId,date,data,heads,reason})=>{const fields={entityType:'HLT_DAY',entityId:date,expectedHeads:[...heads],data:structuredClone(data),reason,confirmed:false};return {requestId,commandDigest:await ctx.digest({type:'ENTITY',...fields}),...fields};},
    now:()=>ctx.now(),newId:()=>'i'+Date.now().toString(36)+(++seq).toString(36)+ctx.uid().slice(0,6),newRequestId:()=>ctx.uid(),
    drafts:journal?{
      // 서버 초안 저널(drafts.lbd, 봉인 저장)을 쓴다. 건강 카드 초안은 draft-list가 본문(내 카드 + base heads)을 함께 돌려준다.
      list:async()=>(await ctx.api('/api/md/draft-list',{})).drafts.filter(d=>d.type==='ENTITY'&&d.body?.entityType==='HLT_DAY'),
      save:r=>ctx.api('/api/md/draft-save',r),
      discard:id=>ctx.api('/api/md/draft-discard',{draftId:id,confirmed:true}),
      commit:id=>ctx.api('/api/md/draft-commit',{draftId:id,confirmed:true}),
    }:mode==='DEVICE_BOX'?box.port('HLT_DAY',{write}):{
      // 초안 저널이 없는 환경: 이번 실행 동안만 메모리에 둔다. 확정은 일반 저장 경로(ctx.write)로 한다.
      list:async()=>[...memoryDrafts.values()],
      save:async({type,body})=>{const id='local'+(++seq);memoryDrafts.set(id,{draftId:id,type,body:structuredClone(body),createdAt:new Date().toISOString()+String(seq).padStart(6,'0')});return {draftId:id,status:'LOCAL_DRAFT'};},
      discard:async id=>{memoryDrafts.delete(id);},
      // B17 (A8-D01): 확정(COMMITTED)이 확인된 경우에만 초안을 지운다. ABORTED·그 밖의 상태는 초안을 그대로 둔다.
      commit:async id=>{const d=memoryDrafts.get(id);const r=await write(d.body);const status=r?.status==='LOCAL_SAVED'||r?.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'?'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED':r?.status;if(status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED')memoryDrafts.delete(id);return {...r,status};},
    },
  };
}

// ---- 화면 상태(모듈 단위, 저장하지 않는다: 앱을 다시 열면 숨김 항목도 다시 숨겨진다) ----
export function createHealthState(){return {date:null,showPrivate:false,showRemoved:false,notices:[],message:null,error:false,form:null,flowState:null,flow:null,ports:null,pendingSleep:null,sleepFix:null};}
const profileMapAll=raw=>new Map(raw.profiles.map(p=>[p.key,p]));
// 프로필 저장: 다른 기기가 먼저 같은 프로필을 고쳤으면(STALE_HEADS) 최신을 받아 그 위에 방금 저장하려던 값을 그대로 쓴다(B3d: 비공개·삭제는 양방향 자유라 합치는 규칙이 없다).
// B17 (A8-D03, 통제탑 결정): field를 주면(지금은 '사용 중단/다시 사용' 버튼만) 재시도 때 최신 프로필을 다시 읽어 그 필드 하나만 바꿔 저장한다(버튼의 의도는 한 필드뿐).
// field 없는 저장(프로필 편집·비공개·삭제·복원)은 기존 "전체 값 마지막 쓰기" 그대로(hlt-profile-rules P07, hlt-ui H10).
export async function saveProfile(ctx,key,mine,heads,reason,{field=null}={}){
  try{await ctx.entity('HLT_PROFILE',key,mine,heads,reason);}
  catch(e){
    if(e?.code!=='STALE_HEADS'||!ctx.reload)throw e;
    await ctx.reload();const latest=ctx.getWhole().hlt.profiles.find(p=>p.key===key);
    if(!latest)throw e;
    if(field&&latest.data[field]===mine[field])return;   // 최신이 이미 그 값이다: 다시 쓰지 않는다
    await ctx.entity('HLT_PROFILE',key,field?{...latest.data,[field]:mine[field]}:mine,latest.heads,reason);
  }
}

// B16 (K1-03): gone() = 이 준비를 시작한 뒤 로그아웃 세대가 바뀌었다(앱 render의 gone). 참이면 늦게 끝난 상태를 공유 st에 넣지 않는다(새 세션 상태 보존).
export async function prepareHealth(ctx,st,gone=()=>false){
  const whole=ctx.getWhole();
  st.today=kstDate(ctx.now());
  st.date??=st.today;
  if(!st.flow){
    st.ports=createPorts(ctx);
    st.flow=new HltFlow(st.ports);
    st.pendingSleep=st.flow.pending;   // K1: 취침 기록 중 = 카드 초안의 열린 수면(앱을 다시 열어도 초안에서 다시 읽음)
  }
  st.raw=whole.hlt;
  // K1: 초안 목록은 한 번만 읽는다(screen). 화면 시험의 가짜 흐름에는 screen이 없을 수 있어 그때는 state만 읽는다.
  const view=st.flow.screen?await st.flow.screen(st.date):{state:await st.flow.state(st.date)};
  if(gone())return st;
  st.flowState=view.state;
  if(view.pendingSleep!==undefined)st.pendingSleep.v=view.pendingSleep;
  return st;
}

// ---- DOM 생성 ----
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const hint=text=>el('p',text,'muted small');
  const section=(title,sub)=>add(el('section',null,'panel hlt-panel'),el('h2',title,'panel-title'),sub?hint(sub):null);
  const row=(title,detail,action)=>add(el('div',null,'row'),add(el('div',null,'row-main'),el('strong',title),detail?hint(detail):null),action);
  const input=(value='',attrs={})=>{const n=el('input');n.type='text';n.value=value;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const select=(options,value)=>{const n=el('select');for(const [v,t] of options){const o=el('option',t);o.value=v;n.append(o);}n.value=value;return n;};
  const field=(label,control)=>add(el('label',label),control);
  return {el,add,button,hint,section,row,input,select,field};
}
const num=s=>typeof s==='string'&&/^\d+(\.\d+)?$/.test(s.trim())?Number(s.trim()):NaN;
const int=s=>typeof s==='string'&&/^\d+$/.test(s.trim())?Number(s.trim()):NaN;

// 항목 입력 양식: 필드 정의 → {node,read()}. read()는 item(id 제외) 또는 던진다.
function itemForm(h,type,ctx,st,existing){
  const {el,add,input,select,field}=h;
  const date=st.date,raw=st.raw,all=profileMapAll(raw);
  const usable=kind=>raw.profiles.filter(p=>p.data.kind===kind&&p.data.enabled&&!p.data.removed&&(st.showPrivate||!p.data.private)).map(p=>[p.key,p.data.label]);
  // 고치는 항목이 이미 삭제·중단된 프로필을 가리키면 그 프로필도 선택지에 남겨 양식이 깨지지 않게 한다(확정 때 모델이 거부하고 이유를 알려 준다).
  const withCurrent=(kind,key)=>{const o=usable(kind),p=key&&all.get(key);return p&&!o.some(([k])=>k===key)&&(st.showPrivate||!p.data.private)?[...o,[key,p.data.label+(p.data.removed?' (삭제됨)':' (중단됨)')]]:o;};
  const nowHm=hhmmKst(ctx.now());
  const timeCtl=(label,value,{optional=false}={})=>{
    const hm=input(value?hhmmKst(value):(optional?'':nowHm),{inputmode:'numeric',placeholder:'HH:MM'});
    const off=select([['-1','전날'],['0','당일'],['1','다음날']],value?String(Math.round((Date.parse(kstDate(value)+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000)):'0');
    return {node:add(el('div',null,'hlt-time'),field(label+' (KST)',hm),field('날짜',off)),read(){const t=hm.value.trim();if(optional&&t==='')return null;const iso=isoFromKst(date,t,Number(off.value));if(!iso||!isoOK(iso)){const e=new Error('INVALID_HLT_TIME');e.code='INVALID_HLT_TIME';throw e;}return iso;}};
  };
  const parts=[],reads={};
  const use=(name,ctl)=>{parts.push(ctl.node);reads[name]=ctl.read;};
  const sel=(name,label,options,value)=>{const s=select(options,value);parts.push(field(label,s));reads[name]=()=>s.value;};
  const numCtl=(name,label,value,parse,err)=>{const i=input(value===undefined?'':String(value),{inputmode:'decimal'});parts.push(field(label,i));reads[name]=()=>{const v=parse(i.value);if(Number.isNaN(v)){const e=new Error(err);e.code=err;throw e;}return v;};};
  const x=existing??{};
  switch(type){
    case 'dose':sel('profileKey','약·측정',withCurrent('MED',x.profileKey),x.profileKey??usable('MED')[0]?.[0]??'');numCtl('amount','용량',x.amount,num,'INVALID_HLT_DOSE');sel('unit','단위',UNITS.map(u=>[u,unitText(u)]),x.unit??'mg');use('at',timeCtl('시각',x.at));break;
    case 'sleep':sel('kind','종류',SLEEP_KINDS.map(k=>[k,KIND_TEXT[k]]),x.kind??'main');use('startAt',timeCtl('시작',x.startAt));use('endAt',timeCtl('끝(비우면 아직 안 끝남)',x.endAt,{optional:true}));break;
    case 'wake':use('at',timeCtl('기상',x.at));break;
    case 'clarity':sel('wakeId','기상 기록',(st.flowState.card.items.filter(i=>i.type==='wake')).map(i=>[i.id,'기상 '+hhmmKst(i.at)]),x.wakeId??st.flowState.card.items.find(i=>i.type==='wake')?.id??'');use('at',timeCtl('시각',x.at));break;
    case 'checkin':use('at',timeCtl('시각',x.at));for(const [k,l] of [['mood','기분'],['energy','에너지'],['focus','집중'],['sleepiness','졸림']])numCtl(k,l+' 0~10',x[k],int,'INVALID_HLT_CHECKIN');break;
    case 'change':sel('kind','종류',CHANGE_KINDS.map(k=>[k,KIND_TEXT[k]]),x.kind??'fatigue');numCtl('intensity','정도 0~10',x.intensity,int,'INVALID_HLT_CHANGE');use('at',timeCtl('시작',x.at));use('endAt',timeCtl('끝(비우면 계속)',x.endAt,{optional:true}));break;
    case 'symptom':sel('kind','종류',SYMPTOM_KINDS.map(k=>[k,KIND_TEXT[k]]),x.kind??'other');numCtl('intensity','정도 0~10',x.intensity,int,'INVALID_HLT_SYMPTOM');use('at',timeCtl('시각',x.at));break;
    case 'meal':sel('kind','식사',MEAL_KINDS.map(k=>[k,MEAL_TEXT[k]]),x.kind??'BREAKFAST');sel('size','양',[['','모름'],...MEAL_SIZES.map(k=>[k,SIZE_TEXT[k]])],x.size??'');use('at',timeCtl('시각',x.at));break;
    case 'habit':sel('profileKey','습관',withCurrent('HABIT',x.profileKey),x.profileKey??usable('HABIT')[0]?.[0]??'');numCtl('count','횟수 1~99',x.count??1,int,'INVALID_HLT_HABIT');use('at',timeCtl('시각(비우면 카드 날짜)',x.at,{optional:true}));break;
    case 'steps':numCtl('count','걸음 수 0~'+MAX_STEPS,x.count,int,'INVALID_HLT_STEPS');break;
  }
  void all;
  return {node:add(el('div',null,'hlt-form'),...parts),read(){
    const item={type};for(const [k,r] of Object.entries(reads))item[k]=r();
    if(type==='meal')item.size=item.size===''?null:item.size;
    if(type==='steps')item.id=STEPS_ITEM_ID;   // 카드당 1개: id가 고정이라 다시 넣어도 같은 항목이다
    return item;
  }};
}

// ---- Fold 가져오기(B58B): Health Connect 하루치를 초안 칸에만 채운다. 저장 경로는 flow.edit 하나뿐이고(연산 0) 확정은 사용자가 "카드 쌓기"를 눌러야 한다. ----
// 다리(fold)는 앱이 ctx.foldHealth()로 준다(native-bridge.mjs). 값은 초안에만 들어가고 로그·기기 저장(localStorage)·외부 전송에는 쓰지 않는다.
const spanMinutes=i=>Math.round((Date.parse(i.endAt)-Date.parse(i.startAt))/60000);
const durationText=m=>{const h=Math.floor(m/60),r=m%60;return h&&r?h+'시간 '+r+'분':h?h+'시간':r+'분';};
const sleepAmount=items=>'수면 '+items.length+'개('+durationText(items.reduce((s,i)=>s+spanMinutes(i),0))+')';
const FOLD_ID_PREFIX='hc-',fromFold=i=>typeof i.id==='string'&&i.id.startsWith(FOLD_ID_PREFIX);
export const FOLD_TEXT=Object.freeze({
  button:'Fold에서 가져오기',none:'Fold에 기록 없음',denied:'권한 꺼짐(Health Connect 설정에서 켤 수 있어요)',kept:'그대로 뒀어요',same:'이미 같은 값이에요',filled:'임시 입력에 넣었어요',nap:'낮잠으로 넣었어요',
  sleepOutside:'수면 기록이 날짜 범위를 벗어나 가져오지 않았어요',stepsBad:'값이 범위를 벗어나 가져오지 않았어요',
  permission:'걸음·수면 권한을 허용한 뒤 다시 눌러 주세요.',notYet:'아직 쌓기 전이에요 · 확인하고 "카드 쌓기"를 누르세요.',signedOut:'로그아웃되어 가져오지 않았어요.',
  // B58C (F3): 지워질 항목 수와 합계 시간을 보여 준다.
  // FIX31 (D2b·D2): 출처는 id 접두 hc-로 본다(낮잠이 hc-sleep을 먼저 차지해도 그 뒤 Fold 수면은 hc-로 시작). 같은 시각 main을 낮잠으로 바꿀 때는 낮잠이라고 말한다.
  overwriteSleep:(from,to)=>(from.every(fromFold)?'Fold에서 가져온 ':'손으로 적은 ')+sleepAmount(from)+'를 Fold '+(to.kind==='nap'?'낮잠 '+durationText(spanMinutes(to))+'으로 바꿀까요? (같은 시각이라 하나만 남기고, 밤잠 평균에서 뺍니다)':sleepAmount([to])+'로 바꿀까요? (더하지 않고 교체합니다)'),
  overwriteSteps:(from,to)=>'이 카드의 걸음 '+from+'을(를) Fold 값 '+to+'(으)로 바꿀까요?',
  error:Object.freeze({NOT_SUPPORTED:'Android 14 이상의 Fold에서만 가져올 수 있어요.',NOT_AVAILABLE:'이 기기에서 Health Connect를 쓸 수 없어요.',NO_PERMISSION:'걸음·수면 권한이 꺼져 있어요.',BAD_DATE:'날짜 형식이 맞지 않아요.',BAD_RANGE:'오늘부터 30일 전까지의 카드만 가져올 수 있어요.',READ_FAILED:'Health Connect에서 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.',TIMEOUT:'Health Connect 응답이 늦어요. 잠시 뒤 다시 눌러 주세요.'}),
  fail:'Fold 앱과 연결하지 못했어요. 앱을 다시 열어 보세요.',
});
// B58C (F1·F2): 쌓기가 양쪽의 겹침을 만나 멈췄을 때 묻는 문구. 고르면 그 카드의 나머지 항목과 함께 쌓인다.
export const CHOICE_TEXT=Object.freeze({
  stopped:'아직 쌓지 않았어요 · 임시 입력은 그대로 있습니다. 아래에서 어느 쪽을 남길지 골라 주세요.',
  note:'고르지 않은 쪽만 이 카드에서 빠지고 나머지 항목은 함께 쌓입니다. 이미 쌓였던 값은 이력에 남습니다.',
  sleep:'다른 기기에 수면 기록이 있어요 · 어느 쪽을 남길까요',steps:'다른 기기에 걸음 기록이 있어요 · 어느 쪽을 남길까요',
  amount:(kind,items)=>kind==='steps'?items[0].count+'걸음':sleepAmount(items),
  mine:c=>'이 기기 것 남기기 · '+CHOICE_TEXT.amount(c.kind,c.mine),theirs:c=>'다른 기기 것 남기기 · '+CHOICE_TEXT.amount(c.kind,c.theirs),
});
const closedMainSleeps=card=>card.items.filter(i=>i.type==='sleep'&&i.kind==='main'&&i.endAt!==null);
const sameTimeMains=(card,s)=>closedMainSleeps(card).filter(i=>i.startAt===s.startAt&&i.endAt===s.endAt);
// B58C (F5): 낮·저녁에 시작한 3시간 미만 세션은 낮잠이다(밤잠 평균에 넣지 않는다). 항목 종류는 기존 'nap'을 쓴다.
export const NAP_MAX_MINUTES=180,NAP_START_FROM=12*60,NAP_START_BEFORE=21*60;
export function foldSleepKind(sleep){
  const start=kstMinutes(sleep.startAt);
  return spanMinutes(sleep)<NAP_MAX_MINUTES&&start>=NAP_START_FROM&&start<NAP_START_BEFORE?'nap':'main';
}
// 카드와 하루치 값(steps:number|null, sleep:{startAt,endAt}|null)을 비교해 칸별로 할 일을 정한다. 순수 함수(쓰기 없음).
export function foldPlan(card,date,{steps,sleep}){
  const old=card.items.find(i=>i.type==='steps');
  const stepsPlan=steps===null?{action:'NONE'}:!(Number.isInteger(steps)&&steps>=0&&steps<=MAX_STEPS)?{action:'BAD'}:!old?{action:'ADD',count:steps}:old.count===steps?{action:'SAME'}:{action:'REPLACE',count:steps,from:old.count};
  let sleepPlan;
  if(sleep===null)sleepPlan={action:'NONE'};
  else if(!nearDate(date,sleep.startAt)||!nearDate(date,sleep.endAt))sleepPlan={action:'OUTSIDE'};   // 카드 날짜 범위 규칙(HLT_TIME_OUTSIDE_CARD_DATE)과 같은 함수
  else if(foldSleepKind(sleep)==='nap'){
    const dup=card.items.some(i=>i.type==='sleep'&&i.kind==='nap'&&i.startAt===sleep.startAt&&i.endAt===sleep.endAt);
    // FIX31 (D2): 같은 시각의 main(옛 빌드가 Fold 수면을 늘 main hc-sleep으로 넣었다)은 같은 수면이다. 더하지 않고 낮잠으로 바꾸자고 묻는다(확인해야 바뀜).
    const twin=dup?[]:sameTimeMains(card,sleep);
    sleepPlan=twin.length?{action:'REPLACE',kind:'nap',startAt:sleep.startAt,endAt:sleep.endAt,from:twin}
      :{action:dup?'SAME':'ADD',kind:'nap',startAt:sleep.startAt,endAt:sleep.endAt};   // 다른 시각의 밤잠과는 겹쳐 세지 않으므로 교체하지 않는다
  }else{
    const closed=closedMainSleeps(card),one=closed.length===1&&closed[0].startAt===sleep.startAt&&closed[0].endAt===sleep.endAt;
    sleepPlan={action:one?'SAME':closed.length?'REPLACE':'ADD',kind:'main',startAt:sleep.startAt,endAt:sleep.endAt,from:closed};
  }
  return {steps:stepsPlan,sleep:sleepPlan};
}
// 계획을 카드에 적용한다. 교체는 allow가 참일 때만. 끝난 주 수면은 하나로 합쳐 바꾼다(추가가 아니라 교체: 리듬 요약이 끝난 main 수면 분을 모두 더하므로, hlt-projection.mjs:39).
// flow.edit이 최신 초안 위에서 다시 부를 수 있어 그때의 카드로 계획을 다시 세운다: 그 사이 수면이 생겼는데 확인받지 않았으면 넣지 않는다.
export function applyFoldDay(card,date,day,allow,newId){
  const p=foldPlan(card,date,day);
  if(p.steps.action==='ADD')card.items.push({id:STEPS_ITEM_ID,type:'steps',count:p.steps.count});
  if(p.steps.action==='REPLACE'&&allow.steps)card.items.find(i=>i.type==='steps').count=p.steps.count;
  const s=p.sleep;
  if(s.action==='ADD')card.items.push({id:card.items.some(i=>i.id==='hc-sleep')?newId():'hc-sleep',type:'sleep',startAt:s.startAt,endAt:s.endAt,kind:s.kind});
  if(s.action==='REPLACE'&&allow.sleep){
    // 낮잠 교체(D2)는 같은 시각의 main만 바꾸고 다른 밤잠은 그대로 둔다.
    const [first,...rest]=s.kind==='nap'?sameTimeMains(card,s):closedMainSleeps(card),drop=new Set(rest.map(i=>i.id));
    card.items=card.items.filter(i=>!drop.has(i.id)).map(i=>i.id===first.id?{id:first.id,type:'sleep',startAt:s.startAt,endAt:s.endAt,kind:s.kind}:i);
  }
  return card;
}
// "Fold에서 가져오기" 한 번. 반환: {text,error}. 권한이 둘 다 없으면 요청만 하고 끝난다. 한쪽만 있으면 있는 쪽만 읽는다(권한 없음을 "기록 없음"으로 보이지 않게 칸별로 표시).
export async function importFromFold({flow,fold,date,confirm,newId,session=()=>null}){
  const hs=fold.healthState();
  if(!hs?.supported)return {text:FOLD_TEXT.error.NOT_SUPPORTED,error:true};
  if(hs.steps!=='granted'&&hs.sleep!=='granted'){const q=fold.requestHealthPermission();return q?.ok?{text:FOLD_TEXT.permission,error:false}:{text:FOLD_TEXT.error[q?.error]??FOLD_TEXT.fail,error:true};}
  const signedIn=session(),r=await fold.readHealthDay(date);
  if(session()!==signedIn)return {text:FOLD_TEXT.signedOut,error:true};   // 읽는 동안 로그아웃: 초안에 쓰지 않는다
  if(!r.ok)return {text:FOLD_TEXT.error[r.error]??FOLD_TEXT.fail,error:true};
  const day={steps:hs.steps==='granted'?r.steps:null,sleep:hs.sleep==='granted'?r.sleep:null};
  // B58C (F1·F2): 초안만 보지 않고 "지금 쌓으면 될 카드"(다른 기기가 쌓은 수면·걸음 포함)와 비교해 같은 확인창을 띄운다.
  const view=await flow.preview(date),plan=foldPlan(view.card,date,day);
  const allow={steps:plan.steps.action==='REPLACE'&&confirm(FOLD_TEXT.overwriteSteps(plan.steps.from,plan.steps.count))===true,sleep:plan.sleep.action==='REPLACE'&&confirm(FOLD_TEXT.overwriteSleep(plan.sleep.from,plan.sleep))===true};
  const line=(name,denied,p,ok,extra)=>name+': '+(denied?FOLD_TEXT.denied:p.action==='NONE'?FOLD_TEXT.none:extra[p.action]??(p.action==='SAME'?FOLD_TEXT.same:p.action==='REPLACE'&&!ok?FOLD_TEXT.kept:FOLD_TEXT.filled));
  const lines=[line('걸음',hs.steps!=='granted',plan.steps,allow.steps,{BAD:FOLD_TEXT.stepsBad}),line('수면',hs.sleep!=='granted',plan.sleep,allow.sleep,{OUTSIDE:FOLD_TEXT.sleepOutside,...(plan.sleep.kind==='nap'?{ADD:FOLD_TEXT.nap,...(allow.sleep?{REPLACE:FOLD_TEXT.nap}:{})}:{})})];
  const wrote=plan.steps.action==='ADD'||plan.sleep.action==='ADD'||allow.steps||allow.sleep;
  if(!wrote)return {text:lines.join(' · '),error:false};
  // 확인받은 칸·새 칸만 쓴다. 다른 기기 항목을 바꾸는 교체는 초안을 최신 카드 위로 옮겨야 한다. 단 아직 답하지 않은 겹침이 남으면 옮기지 않는다(옮기면 쌓을 때 묻지 못해 조용히 둘 다 남는다).
  const only={steps:plan.steps.action==='ADD'||allow.steps?day.steps:null,sleep:plan.sleep.action==='ADD'||allow.sleep?day.sleep:null};
  const open=view.blocked||view.choices.some(c=>c.kind==='steps'||!allow.sleep),onLatest=view.drift&&(allow.steps||allow.sleep)&&!open;
  // FIX31 (D2b): hc-sleep이 이미 쓰였을 때 새로 만드는 Fold 수면 id에도 출처 표지(hc-)를 붙인다(기록 모양은 그대로, id 규칙 안).
  await flow.edit(date,c=>{applyFoldDay(c,date,only,allow,()=>FOLD_ID_PREFIX+newId());},{onLatest});
  lines.push(FOLD_TEXT.notYet);
  return {text:lines.join(' · '),error:false,notices:onLatest?view.notices:[]};
}

export function renderHealth(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,section,row,input,select,field}=h;
  const raw=st.raw,fs=st.flowState,date=st.date;
  const view=hltView(raw,st.today,{showPrivate:st.showPrivate});
  const all=profileMapAll(raw),named=new Map(raw.profiles.filter(p=>st.showPrivate||!p.data.private).map(p=>[p.key,p]));   // 삭제한 프로필도 이름은 계속 보인다(지난 기록용)
  const labelOf=key=>named.get(key)?.data.label??'(알 수 없는 항목)';
  const visible=it=>it.type!=='habit'||st.showPrivate||(all.get(it.profileKey)&&!all.get(it.profileKey).data.private);
  const box=st.ports?.box??null,T=box?.TEXT;   // B3c: 이 기기 상자(브라우저)일 때만 있다
  const seen=()=>(st.resumed??=new Set()).add(date);   // 이 날짜에서 한 번이라도 입력했으면 "저장된 초안이 있어요" 안내를 다시 띄우지 않는다
  // B2C (DEFECT-5): 상자 쓰기 실패는 save가 던지지 않는다(설계). 버튼이 끝났을 때 그 날짜 초안이 실패 상태면 성공 문구 대신 실패 문구를 보인다(날짜가 옮겨 갔을 수 있어 st.date).
  // 쌓기가 성공하면 초안이 지워져 has가 거짓이다. 초안을 쓰지 않는 프로필 버튼은 draft:false로 제 결과 문구를 지킨다.
  const boxFailText=()=>{const c=box?.status().failed;return c?box.ERROR_TEXT[c]??T.failed:null;};
  const flagBoxFail=()=>{const b=box?.statusFor('HLT_DAY',st.date);if(b?.has&&b.failed&&!st.error){st.message=box.ERROR_TEXT[b.failed]??T.failed;st.error=true;}};
  // K1: 기상 뒤 "잠든 시각" 줄(st.sleepFix)은 다음 동작까지만 보인다. 그 줄의 버튼은 fn 안에서 다시 채운다.
  const act=(fn,{draft=true}={})=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;st.sleepFix=null;seen();try{await fn();}catch(e){st.message=box?.ERROR_TEXT[e?.code]??hltErrorText(e?.code);st.error=true;}if(draft)flagBoxFail();await prepareHealth(ctx,st);await ctx.rerender();});
  const out=el('div',null,'hlt-view');

  // 1) 상태·날짜
  const head=section('건강 · 하루 1장','입력은 이 기기에 임시로 모이고, "카드 쌓기"를 눌러야 기록으로 쌓입니다.');
  const chipText=()=>{
    const b=box?.statusFor('HLT_DAY',date);
    if(st.form)return '입력 중 (아직 저장 전)';
    if(b?.typing)return T.typing;
    if(b?.has)return '이 기기에만 있는 임시 입력 · '+(b.dirty?(b.failed?'아직 이 기기에 저장하지 못함':T.typing):T.saved)+(b.old?' · '+T.old:'');
    return fs.status==='LOCAL_DRAFT'?'이 기기에만 있는 임시 입력 (아직 쌓기 전) · 임시 저장됨':fs.status==='CONFIRMED'?'쌓임 · 이 카드는 '+fs.latestConfirmCount+'번 쌓음':'아직 기록 없음';
  };
  const chipEl=el('p',chipText(),'hlt-chip');
  const dateIn=input(date,{inputmode:'numeric',placeholder:'YYYY-MM-DD',maxlength:'10'});
  const go=d=>()=>{if(!dateKeyOK(d)){st.message='날짜는 YYYY-MM-DD 형식이어야 합니다.';st.error=true;void ctx.rerender();return;}st.date=d;st.form=null;st.message=null;st.notices=[];void ctx.perform(async()=>{await prepareHealth(ctx,st);await ctx.rerender();});};
  add(head,add(el('div',null,'buttons'),button('◀ 전날',()=>go(shiftDay(date,-1))()),dateIn,button('이동',()=>go(dateIn.value.trim())()),button('▶ 다음날',()=>go(shiftDay(date,1))()),button('오늘',()=>go(st.today)())),
    chipEl);
  if(st.ports?.persistent===false)add(head,hint('이 환경에는 임시 저장 공간이 없어 임시 입력이 앱을 닫거나 새로고침하면 사라집니다. 쌓기 전에 닫지 마세요. (PC 앱에서는 임시 입력이 기기에 암호화되어 남습니다.)'));
  if(box){
    const s=box.status(),b=box.statusFor('HLT_DAY',date);
    add(head,hint(T.modeBox));
    if(s.failed)add(head,el('p',box.ERROR_TEXT[s.failed]??T.failed,'notice error card-draft-failed'));
    if(s.unreadable)add(head,hint(T.unreadable));
    // 카드를 열었을 때 이 날짜의 초안이 상자에 있으면: 이어서 쓰기 / 버리기(확인창). 자동으로 덮어쓰거나 확정하지 않는다.
    if(fs.status==='LOCAL_DRAFT'&&b.has&&!st.resumed?.has(date))add(head,el('p',T.resume+' ('+kstDate(b.updatedAt)+' '+hhmmKst(b.updatedAt)+' KST)'+(b.old?' · '+T.old:''),'notice card-draft-resume'),add(el('div',null,'buttons'),
      button(T.resumeKeep,()=>{seen();void ctx.rerender();},'primary'),
      button(T.resumeDrop,()=>{if(ctx.confirmDialog?.(T.dropConfirm)??true)void act(async()=>{await st.ports.drafts.discard(fs.draftId);st.notices=[];})();})));
  }
  if(fs.latestConfirmCount+1>=3&&fs.status==='LOCAL_DRAFT')add(head,hint('이 카드는 이번이 '+(fs.latestConfirmCount+1)+'번째 쌓기입니다. 막지는 않지만, 모아서 한 번에 쌓는 편이 좋습니다.'));
  if(st.message&&st.message!==boxFailText())add(head,el('p',st.message,st.error?'notice error hlt-message':'notice hlt-message'));   // 위 빨간 줄과 같은 문구는 두 번 보이지 않는다
  if(st.notices.length)add(head,el('p','다른 기기에서 바뀐 내용이 있어 합쳤어요.','notice hlt-merged'));
  for(const n of st.notices){
    const hiddenRef=n.profileKey&&!st.showPrivate&&!(all.get(n.profileKey)&&!all.get(n.profileKey).data.private);
    add(head,el('p',hiddenRef?'숨김 항목과 관련된 알림이 있습니다 · "숨김 항목 보기"를 누르면 볼 수 있습니다.':(NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060'),'notice hlt-notice'));
  }
  add(out,head);
  renderEasyHealth(out,ctx,st);   // V6B: 약 한 번 누르기 · 지금 상태 0~4 · 하루 타임라인 · 심해지는 시간대

  // 2) 빠른 입력(연산 0)
  const q=section('빠른 입력','누르면 지금 시각으로 임시 입력에 들어갑니다.'),pend=st.pendingSleep.v;
  // B17 (H12-N03): 빠른 입력은 언제나 오늘(지금 시각의 KST 날짜) 카드 초안에 들어간다. 다른 날짜를 보고 있었으면 화면을 그 초안의 날짜로 옮기고 한 줄 알린다
  // (확정 버튼은 늘 화면에 보이는 카드의 초안을 확정하므로, 빠른 입력 바로 뒤의 확정이 그 입력을 확정한다).
  const follow=(s,text=null)=>{const d=s?.card?.date,moved=Boolean(d)&&d!==date;if(moved){st.date=d;st.form=null;st.notices=[];}st.message=[text,moved?'빠른 입력은 오늘('+d+') 카드에 들어갑니다 · 화면을 그 날짜로 옮겼습니다.':null].filter(Boolean).join(' · ')||null;};
  // K1: 기상 문구. 수면을 닫았으면 옮김 안내, 48시간이 넘은 열린 수면은 남아 있다고 알린다.
  const wakeText=w=>w.withSleep?[SLEEP_TEXT.woke,w.moved?SLEEP_TEXT.moved(w.moved):null].filter(Boolean).join(' · '):w.staleSleep?SLEEP_TEXT.wakeOnly+' · '+SLEEP_TEXT.stale(w.staleSleep):SLEEP_TEXT.wakeOnly;
  const quick=add(el('div',null,'buttons hlt-quick'),
    button('지금 기상',act(async()=>{
      const w=await st.flow.quickWake();follow(w,wakeText(w));
      if(w.sleep)st.sleepFix={date:w.sleep.date,id:w.sleep.id,button:w.sleep.startAt,startAt:w.sleep.startAt,endAt:w.sleep.endAt,how:SLEEP_TEXT.button,watch:w.watch??null,duplicate:Boolean(w.duplicate),typing:false};
    }),'primary'),
    // K1 (DEFECT-10 B안): 취침은 깬 날 카드 초안의 열린 수면이다(PC 저널·브라우저 상자에 남음). 화면은 옮기지 않는다.
    button('지금 취침',act(async()=>{const r=await st.flow.quickSleep();if(r?.pendingSleep)st.message=SLEEP_TEXT.saved(r.pendingSleep)+(takeSleepTip(ctx.storage??globalThis.localStorage)?' '+SLEEP_TEXT.tip:'');})));
  for(const k of MEAL_KINDS)add(quick,button(MEAL_TEXT[k],act(async()=>{follow(await st.flow.quickMeal(k));})));
  const habitProfiles=view.profiles.filter(p=>p.data.kind==='HABIT'&&p.data.enabled);
  for(const p of habitProfiles)add(quick,button(p.data.label,act(async()=>{follow(await st.flow.quickHabit(p.key,p.data));})));
  add(q,quick);if(pend&&Date.parse(ctx.now())-Date.parse(pend.item.startAt)<=MAX_SLEEP_MS)add(q,hint(SLEEP_TEXT.pending(pend)));   // 48시간이 넘은 열린 수면은 기상이 닫지 않으므로 "기록 중"이라 하지 않는다
  // K1 (4·5): 기상 직후 잠든 시각 다듬기. 기본은 잠 버튼 시각 그대로이고, 고르면 그 수면의 startAt만 바꾼다(연산 0). +n분은 잠 버튼 시각 기준이며 기상 시각을 넘는 버튼은 숨긴다.
  const fix=st.sleepFix;
  if(fix){
    const fixTo=(startAt,how)=>act(async()=>{st.sleepFix=fix;await st.flow.setSleepStart(fix.date,fix.id,startAt);st.sleepFix={...fix,startAt,how,typing:false};st.message=SLEEP_TEXT.fixed(startAt);});
    const row1=add(el('div',null,'buttons hlt-sleep-shift'));
    for(const [m,label] of SLEEP_SHIFTS){const t=new Date(Date.parse(fix.button)+m*60000).toISOString();if(Date.parse(t)<=Date.parse(fix.endAt))add(row1,button(label,fixTo(t,SLEEP_TEXT.shifted(fix.button,label))));}
    add(row1,button(SLEEP_TEXT.typed,()=>{st.sleepFix={...fix,typing:true};void ctx.rerender();}));
    const fixEl=add(el('div',null,'hlt-sleep-fix'),el('p',SLEEP_TEXT.fell(fix.startAt,fix.how),'notice hlt-sleep-fell'),row1);
    if(fix.typing){
      const hm=input(hhmmKst(fix.startAt),{inputmode:'numeric',placeholder:'HH:MM'});
      add(fixEl,add(el('div',null,'buttons'),field(SLEEP_TEXT.typeLabel,hm),button(SLEEP_TEXT.typeApply,()=>{const t=fellAsleepAt(hm.value.trim(),fix.endAt);if(t)fixTo(t,SLEEP_TEXT.typed)();else{st.message=SLEEP_TEXT.badTime;st.error=true;void ctx.rerender();}})));
    }
    if(fix.watch&&fix.watch!==fix.startAt)add(fixEl,el('p',SLEEP_TEXT.watch(fix.watch),'notice hlt-sleep-watch'),add(el('div',null,'buttons'),button(SLEEP_TEXT.useWatch,fixTo(fix.watch,SLEEP_TEXT.watched))));
    if(fix.duplicate)add(fixEl,el('p',SLEEP_TEXT.duplicate,'notice hlt-sleep-dup'));   // 결정 2: 둘 다 남기고 알린다(자동 삭제 없음)
    add(q,fixEl);
  }
  add(out,q);

  // 3) 항목
  const list=section('그날 항목','항목 '+fs.card.items.filter(visible).length+'개'+(fs.card.items.length>=MAX_ITEMS?' · 최대 '+MAX_ITEMS+'개':''));
  const items=fs.card.items.filter(visible);
  if(!items.length)add(list,hint('아직 항목이 없습니다.'));
  for(const it of items)add(list,row(itemLabel[it.type]+' · '+itemSummary(it,labelOf),null,add(el('div',null,'buttons'),
    button('수정',()=>{st.form={type:it.type,id:it.id,item:it};void ctx.rerender();}),
    button('삭제',act(async()=>{await st.flow.removeItem(date,it.id);})))));
  const adders=add(el('div',null,'buttons'));
  for(const t of ITEM_TYPES){if(t==='steps'&&fs.card.items.some(i=>i.type==='steps'))continue;add(adders,button(itemLabel[t]+' 추가',()=>{st.form={type:t,id:null,item:null};void ctx.rerender();}));}   // 걸음은 카드당 1개: 있으면 "수정"으로 고친다
  add(list,adders);
  // B58B: 다리가 있고 healthState().supported일 때만 보인다(PC·노트북·iPad·브라우저에서는 ctx.foldHealth()가 null). 교체 확인창이 없는 환경에서는 덮어쓰지 않는다.
  const fold=ctx.foldHealth?.()??null;
  if(fold?.healthState()?.supported)add(list,add(el('div',null,'buttons hlt-fold'),button(FOLD_TEXT.button,act(async()=>{
    const r=await importFromFold({flow:st.flow,fold,date,confirm:text=>ctx.confirmDialog?.(text)??false,newId:()=>st.ports.newId(),session:()=>ctx.session?.()??null});
    st.message=r.text;st.error=r.error;if(r.notices?.length)st.notices=r.notices;
  }))));
  if(st.form){
    const f=itemForm(h,st.form.type,ctx,st,st.form.item);
    add(list,el('h3',itemLabel[st.form.type]+(st.form.id?' 수정':' 추가'),'panel-title'),f.node,add(el('div',null,'buttons'),
      button('임시 입력에 넣기',act(async()=>{const item=f.read();if(st.form.id)await st.flow.updateItem(date,{...item,id:st.form.id});else await st.flow.addItem(date,item);st.form=null;st.message='임시 입력에 저장했습니다.';}),'primary'),
      button('취소',()=>{st.form=null;void ctx.rerender();})));
  }
  add(out,list);

  // 4) 메모·확정
  const note=input(fs.card.note??'',{maxlength:String(MAX_NOTE)});
  if(box){
    // 상자 모드: 메모는 입력 후 600ms 쉬면 초안에 저장하고(연산 0), 칸을 떠나면 바로 저장한다. 화면을 다시 그리지 않아 입력이 끊기지 않는다.
    const key='HLT_DAY|'+date+'|note';
    // B16: 콜백은 상자가 준 입력 토큰을 흐름에 넘긴다(그 저장의 주인·세대가 이 입력으로 정해짐).
    note.addEventListener('input',()=>{box.defer(key,async input=>{try{await st.flow.setNote(date,note.value,{input});seen();}catch(e){st.message=hltErrorText(e?.code);st.error=true;}chipEl.textContent=chipText();},{owned:true});chipEl.textContent=T.typing;});
    note.addEventListener('blur',()=>{void box.flush().catch(()=>{}).then(()=>{chipEl.textContent=chipText();});});
  }
  const fin=section('메모와 쌓기');
  const stack=(answers={})=>act(async()=>{
      const r=await st.flow.confirm(date,{answers});st.notices=r.notices??[];
      st.choice=r.status==='NEEDS_CHOICE'?{draftId:(await st.flow.state(date)).draftId,choices:r.choices,answers}:null;
      if(r.status==='NEEDS_CHOICE')st.message=CHOICE_TEXT.stopped;
      else if(r.status==='REJECTED'){st.message=hltErrorText(r.code);st.error=true;}
      else if(['UNKNOWN','SYNC_FAILED','FAILED','STALE'].includes(r.status)){st.message=(r.code&&HLT_ERROR_TEXT[r.code])||STATUS_TEXT[r.status];st.error=true;}
      else st.message=STATUS_TEXT[r.status]??'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+r.status+'\u2060';
      // K1 결정 3: 끝나지 않은 수면이 든 카드도 막지 않고 쌓되 한 줄 알린다.
      if(r.status==='CONFIRMED'&&fs.card.items.some(i=>i.type==='sleep'&&i.endAt===null))st.message+=' · '+SLEEP_TEXT.stackOpen;
    });
  add(fin,field('메모 (최대 '+MAX_NOTE+'자)',note),add(el('div',null,'buttons'),
    button('메모를 임시 입력에 넣기',act(async()=>{await st.flow.setNote(date,note.value);})),
    button('카드 쌓기',stack(),'primary'),
    fs.status==='LOCAL_DRAFT'?button('임시 입력 버리기',()=>{if(ctx.confirmDialog?.('이 날짜의 임시 입력을 버릴까요? 쌓인 기록에는 영향이 없습니다.')??true)void act(async()=>{await st.ports.drafts.discard(fs.draftId);st.notices=[];})();}):null));
  // B58C (F1·F2): 물은 뒤 초안이 바뀌면(다른 날짜로 가도) 질문을 내린다. 다시 쌓을 때 최신 내용으로 다시 묻는다. 겹침이 둘이면 하나씩 묻고 다 고르면 연산 1개로 쌓는다.
  const asked=st.choice?.draftId===fs.draftId?st.choice:null,c=asked?.choices.find(x=>!asked.answers[x.sig]);
  if(c){
    const pick=side=>()=>{const answers={...asked.answers,[c.sig]:side};if(asked.choices.every(x=>answers[x.sig]))stack(answers)();else{st.choice={...asked,answers};void ctx.rerender();}};
    add(fin,el('p',CHOICE_TEXT[c.kind],'notice hlt-choice'),hint(CHOICE_TEXT.note),add(el('div',null,'buttons'),button(CHOICE_TEXT.mine(c),pick('MINE'),'primary'),button(CHOICE_TEXT.theirs(c),pick('THEIRS'))));
  }
  add(out,fin);

  // 5) 리듬 요약(계산만, 연산 0)
  const s=view.summary,rhythm=section('생활 리듬 요약','계산만 하며 저장하지 않습니다. 기준일 '+s.today+' · KST');
  for(const [name,w] of [['최근 7일',s.week],['최근 30일',s.month]])add(rhythm,row(name,'평균 기상 '+(w.avgWake??'기록 없음')+' · 평균 취침 '+(w.avgSleepStart??'기록 없음')+' · 평균 수면 '+(w.avgSleepMinutes===null?'기록 없음':Math.floor(w.avgSleepMinutes/60)+'시간 '+(w.avgSleepMinutes%60)+'분')+' · 첫 식사 '+(w.avgFirstMeal??'기록 없음')));
  const walk=stepsAverage(view.days,s.today,7);   // FIX45 (AUD1 #9)
  add(rhythm,row('걸음','최근 7일 평균 '+(walk.avg===null?'기록 없음':walk.avg.toLocaleString('ko-KR')+'걸음 · 기록 '+walk.days+'일')));
  for(const hb of s.habits)add(rhythm,row(hb.label,'마지막 기록 '+(hb.lastAgoDays===null?'없음':hb.lastAgoDays+'일 전')+' · 7일 '+hb.count7+'회 · 30일 '+hb.count30+'회'));
  add(out,rhythm);

  // 6) 프로필 관리
  const prof=section('약·습관 목록','이름은 직접 정합니다. 키·종류·방식은 만든 뒤 바꿀 수 없습니다. 비공개는 켜고 끌 수 있습니다. 삭제하면 목록에서 사라지지만 지난 기록에는 이름이 남고, "삭제한 항목 보기"에서 복원할 수 있습니다. 삭제한 항목도 기록 보존을 위해 개수 한도('+HLT_PROFILE_LIMIT+'개)에 계속 셉니다(지금 '+raw.profiles.length+'개).');
  const profileDetail=d=>(d.kind==='MED'?'약·측정 · 기본 '+d.defaultAmount+unitText(d.unit):'습관 · '+(d.mode==='CHECK'?'했다/안했다':'횟수'))+(d.enabled?'':' · 중단됨')+(d.private?' · 비공개':'');
  for(const p of view.profiles){
    const d=p.data;
    add(prof,row(d.label,profileDetail(d),add(el('div',null,'buttons'),
      button(d.enabled?'사용 중단':'다시 사용',act(async()=>{await saveProfile(ctx,p.key,{...d,enabled:!d.enabled},p.heads,'건강 항목 사용 여부',{field:'enabled'});},{draft:false})),
      button(d.private?'공개로 바꾸기':'비공개로 바꾸기',act(async()=>{await saveProfile(ctx,p.key,{...d,private:!d.private},p.heads,'건강 항목 비공개 여부');},{draft:false})),
      button('목록에서 삭제',()=>{if(ctx.confirmDialog?.('이 항목을 삭제할까요? 지운 항목은 목록에서 사라지고 지난 기록에는 이름이 남아요. 나중에 복원할 수 있어요.')??true)void act(async()=>{await saveProfile(ctx,p.key,{...d,removed:true},p.heads,'건강 목록에서 삭제');},{draft:false})();}))));
  }
  const nl=input('',{maxlength:String(MAX_LABEL),placeholder:'이름 (최대 '+MAX_LABEL+'자)'}),kindSel=select([['HABIT','습관'],['MED','약·측정']],'HABIT'),modeSel=select([['COUNT','횟수'],['CHECK','했다/안했다']],'COUNT'),amt=input('1',{inputmode:'decimal'}),unitSel=select(UNITS.map(u=>[u,unitText(u)]),'mg'),priv=el('input');priv.type='checkbox';
  add(prof,el('h3','목록에 추가','panel-title'),field('이름',nl),field('종류',kindSel),field('방식(습관)',modeSel),field('기본 용량(약·측정)',amt),field('단위(약·측정)',unitSel),add(el('label','비공개'),priv),
    button('항목 만들기',act(async()=>{
      const label=nl.value.trim(),key=(kindSel.value==='MED'?'med-':'hab-')+ctx.uid().slice(0,12);
      const data=kindSel.value==='MED'?{key,kind:'MED',label,defaultAmount:num(amt.value),unit:unitSel.value,enabled:true,private:priv.checked,removed:false}:{key,kind:'HABIT',label,mode:modeSel.value,enabled:true,private:priv.checked,removed:false};
      await ctx.entity('HLT_PROFILE',key,data,[],'건강 목록에 추가');st.message='항목을 만들었습니다.';
    },{draft:false}),'primary'));
  add(prof,el('h3','삭제한 항목','panel-title'),button(st.showRemoved?'삭제한 항목 숨기기':'삭제한 항목 보기',()=>{st.showRemoved=!st.showRemoved;void ctx.rerender();}));
  if(st.showRemoved){
    if(!view.removedProfiles.length)add(prof,hint('삭제한 항목이 없습니다.'));
    for(const p of view.removedProfiles)add(prof,row(p.data.label,profileDetail(p.data),add(el('div',null,'buttons'),
      button('복원',act(async()=>{await saveProfile(ctx,p.key,{...p.data,removed:false},p.heads,'건강 항목 복원');st.message='복원했습니다.';},{draft:false})))));
  }
  add(out,prof);

  // 7) 숨김 항목 — 눌러도 외부 전송 허용을 뜻하지 않는다.
  add(out,add(el('div',null,'buttons'),button(st.showPrivate?'숨김 항목 다시 숨기기':'숨김 항목 보기',()=>{st.showPrivate=!st.showPrivate;void ctx.rerender();})),hint('숨김 항목은 이 화면에서만 보이며, 앱을 다시 열면 다시 숨겨집니다. 보기 버튼이 외부 전송을 허용한다는 뜻은 아닙니다.'));
  root.append(out);
  return out;
}

// ---- V6B 건강 쉬운 입력 (통제탑 V6B B) ----
// 저장은 기존 건강 카드(HLT_DAY) 항목 그대로다(새 칸·새 종류 없음): 약 = dose(내가 등록한 MED 항목), 지금 상태 = change(무기력 fatigue · 우울 depression, 정도 0~4, endAt null), 낮잠 = sleep kind nap.
// 한 번 누르기: 오늘 카드 초안에 넣고 바로 쌓는다(카드 1장 쌓기 = 연산 1, 기존 암호화·동기화 경로). 쌓지 못하면 초안이 남고 건강 화면의 "카드 쌓기"로 다시 쌓는다.
// 약 이름·용량·점수는 이 화면과 건강 카드 안에만 있다. 위젯 숫자·상태 내보내기·AI 관문·PC 토스트로 보내지 않는다(시험 v6b).
export const STATE_KINDS=Object.freeze([['fatigue','무기력'],['depression','우울']]);
export const STATE_MAX=4;
export const UNIT_TEXT=Object.freeze({tablet:'정',capsule:'캡슐',mg:'mg',mL:'mL'});
export const DOSE_STEPS=Object.freeze([[0.5,'반'],[1,'1배'],[2,'2배']]);
export const MED_NOTE='약은 처방대로 · 바꾸려면 의사와 상의하세요';
export const NAP_CHIPS=Object.freeze([15,30,60]);
export const EASY_TEXT=Object.freeze({meds:'약 복용',medsSub:'칩을 누르면 지금 시각 · 기본 용량으로 기록해요. 시각·용량은 바꿀 수 있어요.',noMeds:'내 약이 없어요 · 아래 "약·습관 목록"에서 약을 등록하세요(앱이 약 이름을 미리 넣지 않아요).',
  state:'지금 상태',stateSub:'0 없음 ~ 4 아주 심함 · 누르면 지금 시각으로 기록 · 하루에 여러 번 가능',memo:'메모 한 줄 (선택, 그날 메모 칸에 붙어요)',
  saved:'기록했어요',kept:'임시 입력에 넣었어요 · "카드 쌓기"로 쌓으세요',timeline:'하루 타임라인',summary:'심해지는 시간대 (최근 14일)',few:'자료 부족',
  napNone:'낮잠: 안 잠',napAsk:'낮잠 잤음',nap:m=>'낮잠 '+m+'분'});
const easyFlow=(ctx,st)=>{if(!st.flow){st.ports=createPorts(ctx);st.flow=new HltFlow(st.ports);st.pendingSleep=st.flow.pending;}return st.flow;};
// 오늘 카드에 항목 하나를 넣고 바로 쌓는다. 결과 {status, text, error}.
export async function easyAdd(ctx,st,item,{note=null}={}){
  const flow=easyFlow(ctx,st),date=kstDate(ctx.now());
  await flow.addItem(date,item);
  if(note){const cur=(await flow.state(date)).card.note??'',line=(cur?cur+' / ':'')+note;await flow.setNote(date,[...line].length>MAX_NOTE?cur:line);}
  const r=await flow.confirm(date);
  const ok=r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED';
  return {status:r.status,error:!ok&&r.status!=='NEEDS_CHOICE',text:ok?EASY_TEXT.saved:r.status==='REJECTED'?hltErrorText(r.code):EASY_TEXT.kept};
}
export function doseItem(profile,{amount,at}){return {type:'dose',profileKey:profile.key,amount,unit:profile.data.unit,at};}
export function stateItem(kind,score,at){return {type:'change',kind,intensity:score,at,endAt:null};}
// 낮잠: 분과 시작 시각(선택). 시작이 없으면 지금 끝난 것으로 본다(시작 = 지금 − 분).
// FIX68 (HUNT65 F6, 통제탑): 시작 시각은 약 시각과 같은 규칙이다 — 지금보다 늦은 시각이면 전날. 그래도 끝이 지금보다 뒤(미래)면 만들지 않는다(napProblem = 이유 코드).
export const NAP_FUTURE='HLT_NAP_FUTURE';
const napStart=(date,minutes,startHm,nowIso)=>startHm?isoFromKst(date,startHm,Date.parse(isoFromKst(date,startHm,0)??'')>Date.parse(nowIso)?-1:0):new Date(Date.parse(nowIso)-minutes*60000).toISOString();
export function napProblem(date,minutes,startHm,nowIso){
  const start=napStart(date,minutes,startHm,nowIso);
  if(!start||!isoOK(start)||!(minutes>=1&&minutes<=NAP_MAX_MINUTES*4))return 'INVALID_HLT_TIME';
  return Date.parse(start)+minutes*60000>Date.parse(nowIso)?NAP_FUTURE:null;
}
export function napItem(date,minutes,startHm,nowIso){
  if(napProblem(date,minutes,startHm,nowIso))return null;
  const start=napStart(date,minutes,startHm,nowIso);
  return {type:'sleep',kind:'nap',startAt:start,endAt:new Date(Date.parse(start)+minutes*60000).toISOString()};
}
export function napsOf(raw,date){
  const c=(raw?.days??[]).find(d=>d.date===date)?.data;
  return (c?.items??[]).filter(i=>i.type==='sleep'&&i.kind==='nap'&&i.endAt!==null).map(i=>({minutes:spanMinutes(i),start:hhmmKst(i.startAt)}));
}
// 하루 타임라인(0~24시, KST) 자료: 복용 점(+용량), 상태 막대, 낮잠·수면 띠, 공부 벽돌 띠. 비공개 약은 showPrivate가 아니면 이름 대신 "약".
// FIX68 (HUNT65 F5, 통제탑): 이 날 카드에 있는 전날 복용(자정 근처에 "23:50"을 넣어 전날로 해석된 것)은 0시 칸에 점을 두고 글자는 "어제 HH:MM"(저장 위치는 그대로).
// 전날 복용만 doses[].prev = true, when = '어제 HH:MM'(그 밖의 복용 모양은 예전 그대로 {m,label}).
const hhmmOf=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export function timelineData(card,{labelOf=()=>'약',study=null,date}){
  const dayStart=Date.parse(date+'T00:00:00+09:00'),min=iso=>Math.round((Date.parse(iso)-dayStart)/60000),clip=m=>Math.max(0,Math.min(1440,m));
  const out={doses:[],states:[],sleeps:[],study:[]};
  for(const i of card?.items??[]){
    if(i.type==='dose'){const m=min(i.at),label=labelOf(i.profileKey)+' '+i.amount+(UNIT_TEXT[i.unit]??i.unit);if(m>=0&&m<1440)out.doses.push({m,label});else if(m<0&&m>=-1440)out.doses.push({m:0,label,when:'어제 '+hhmmOf(m+1440),prev:true});}
    else if(i.type==='change'&&(i.kind==='fatigue'||i.kind==='depression')){const m=min(i.at);if(m>=0&&m<1440)out.states.push({m,kind:i.kind,score:Math.min(STATE_MAX,i.intensity)});}
    else if(i.type==='sleep'&&i.endAt!==null){const a=clip(min(i.startAt)),b=clip(min(i.endAt));if(b>a)out.sleeps.push({a,b,kind:i.kind});}
  }
  for(const s of study?.sessions??[]){if((s.state!=='COMPLETED'&&s.state!=='VERIFIED')||!s.at||!(s.confirmedMin>0))continue;const b=clip(min(s.at)),a=clip(b-s.confirmedMin);if(b>a)out.study.push({a,b});}
  return out;
}
// 최근 14일 3시간 칸(8칸)별 무기력·우울 평균과 기록 수. 기록 5회 미만 칸은 평균 null(자료 부족, 숫자를 만들지 않는다). 사실 문장만(진단·약 조언 없음).
export const SLOT_HOURS=3,SLOT_COUNT=8,SUMMARY_DAYS=14,SUMMARY_MIN=5;
export function stateSummary(days,today){
  const from=shiftDay(today,-(SUMMARY_DAYS-1)),acc={fatigue:Array.from({length:SLOT_COUNT},()=>[]),depression:Array.from({length:SLOT_COUNT},()=>[])};
  for(const d of days??[])for(const i of d.data?.items??[]){
    if(i.type!=='change'||!acc[i.kind])continue;const day=kstDate(i.at);if(day<from||day>today)continue;
    acc[i.kind][Math.floor(kstMinutes(i.at)/(SLOT_HOURS*60))].push(Math.min(STATE_MAX,i.intensity));
  }
  const out={};
  for(const [k] of STATE_KINDS)out[k]=acc[k].map((a,slot)=>({slot,from:slot*SLOT_HOURS,to:slot*SLOT_HOURS+SLOT_HOURS,count:a.length,avg:a.length>=SUMMARY_MIN?Math.round(a.reduce((s,x)=>s+x,0)*10/a.length)/10:null}));
  return out;
}
export function summarySentence(slots,name){
  const ok=slots.filter(s=>s.avg!==null);
  if(!ok.length)return '최근 '+SUMMARY_DAYS+'일 '+name+' 기록이 시간대마다 '+SUMMARY_MIN+'회 미만이라 아직 말할 수 없어요.';
  const top=ok.reduce((a,b)=>b.avg>a.avg||b.avg===a.avg&&b.count>a.count?b:a);
  return '최근 '+SUMMARY_DAYS+'일, '+top.from+'~'+top.to+'시에 '+name+'이 가장 높았어요(평균 '+top.avg.toFixed(1)+', 기록 '+top.count+'회)';
}
const SVG_NS='http://www.w3.org/2000/svg';
function timelineSvg(doc,data){
  if(typeof doc.createElementNS!=='function')return null;   // SVG를 못 만드는 문서(시험용 가짜 등)에서는 아래 글 줄만 남는다
  // V6F (CAP1 5): 카드 폭 100%(CSS), 0·6·12·18·24 시각 글자를 그림 안 아래 줄에(그림 띠는 0~36, 글자 줄 36~44).
  const W=360,H=44,x=m=>Math.round(m*W/1440*10)/10,svg=doc.createElementNS(SVG_NS,'svg');
  const node=(tag,attrs,cls)=>{const n=doc.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(cls)n.setAttribute('class',cls);svg.append(n);return n;};
  svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('class','hlt-timeline');svg.setAttribute('role','img');svg.setAttribute('aria-label','하루 타임라인 0시~24시');
  node('rect',{x:0,y:0,width:W,height:36},'hlt-tl-bg');
  for(let h=0;h<=24;h+=6){node('line',{x1:x(h*60),y1:0,x2:x(h*60),y2:37},'hlt-tl-tick');node('text',{x:x(h*60),y:43,'text-anchor':h===0?'start':h===24?'end':'middle'},'hlt-tl-hour').textContent=String(h);}
  for(const s of data.sleeps)node('rect',{x:x(s.a),y:2,width:Math.max(0.5,x(s.b)-x(s.a)),height:6},'hlt-tl-sleep hlt-tl-'+s.kind);
  for(const s of data.study)node('rect',{x:x(s.a),y:10,width:Math.max(0.5,x(s.b)-x(s.a)),height:2},'hlt-tl-study');
  for(const s of data.states){const h=Math.max(1,s.score*5);node('rect',{x:x(s.m)-1,y:34-h,width:2,height:h},'hlt-tl-state hlt-tl-'+s.kind);}
  for(const d of data.doses)node('circle',{cx:x(d.m),cy:14,r:2},'hlt-tl-dose');
  return svg;
}
// 건강 화면 맨 위 쉬운 입력 패널. 쓰기는 easyAdd 하나뿐이다.
export function renderEasyHealth(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,section,input,field}=h;
  const raw=st.raw,today=kstDate(ctx.now()),nowIso=ctx.now();
  // FIX68 (MAN3 M1): 저장(또는 임시 입력)에 들어간 칸(복용 시각·직접 용량·메모)은 "저장하지 않은 입력"으로 세지 않게 앱의 처음 값 표시(data-edit-init)를 지금 값으로 맞춘다. 실패하면 그대로(남은 입력).
  const markSaved=fields=>{for(const n of fields())if(n?.dataset)n.dataset.editInit=String(n.value??'');};
  const run=(item,opts,fields=()=>[])=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;st.easy=null;try{const r=await easyAdd(ctx,st,item(),opts?.());st.message=r.text;st.error=r.error;markSaved(fields);}catch(e){st.message=hltErrorText(e?.code);st.error=true;}await prepareHealth(ctx,st);await ctx.rerender();});
  const out=add(el('div',null,'hlt-easy'),null);out.id='hlt-easy';
  // 1) 약 복용
  const meds=raw.profiles.filter(p=>p.data.kind==='MED'&&p.data.enabled&&!p.data.removed&&(st.showPrivate||!p.data.private));
  const ms=add(section(EASY_TEXT.meds,EASY_TEXT.medsSub),null);
  if(!meds.length)add(ms,hint(EASY_TEXT.noMeds));
  const chips=add(el('div',null,'buttons hlt-med-chips'),null);
  for(const p of meds){const b=button(p.data.label+' '+p.data.defaultAmount+(UNIT_TEXT[p.data.unit]??p.data.unit),()=>{st.easy={med:p.key,step:1,custom:'',at:''};void ctx.rerender();},'secondary hlt-med-chip'+(st.easy?.med===p.key?' selected':''));add(chips,b);}
  add(ms,chips);
  const pick=st.easy?.med?meds.find(p=>p.key===st.easy.med):null;
  if(pick){
    const e=st.easy,steps=add(el('div',null,'buttons hlt-dose-steps'),...DOSE_STEPS.map(([k,t])=>button(t+' ('+pick.data.defaultAmount*k+(UNIT_TEXT[pick.data.unit]??pick.data.unit)+')',()=>{e.step=k;e.custom='';void ctx.rerender();},e.step===k&&!e.custom?'selected':'secondary')));
    const custom=input(e.custom,{inputmode:'decimal',placeholder:'직접 용량','aria-label':'직접 용량'});custom.addEventListener('input',()=>{e.custom=custom.value;});
    const at=input(e.at,{inputmode:'numeric',placeholder:'지금 '+hhmmKst(nowIso),'aria-label':'복용 시각 HH:MM (비우면 지금)',maxlength:'5'});at.addEventListener('input',()=>{e.at=at.value;});
    const amountOf=()=>{const v=e.custom.trim()?num(e.custom):pick.data.defaultAmount*e.step;if(!(v>0&&v<=MAX_AMOUNT)){const x=new Error('INVALID_HLT_DOSE');x.code='INVALID_HLT_DOSE';throw x;}return v;};
    const atOf=()=>{const t=e.at.trim();if(!t)return nowIso;const iso=isoFromKst(today,t,Date.parse(isoFromKst(today,t,0)??'')>Date.parse(nowIso)?-1:0);if(!iso||!isoOK(iso)){const x=new Error('INVALID_HLT_TIME');x.code='INVALID_HLT_TIME';throw x;}return iso;};
    add(ms,steps,add(el('div',null,'buttons'),field('직접 용량',custom),field('시각 (비우면 지금)',at),button('저장',run(()=>doseItem(pick,{amount:amountOf(),at:atOf()}),null,()=>[custom,at]),'primary'),button('취소',()=>{st.easy=null;void ctx.rerender();})));
  }
  add(ms,hint(MED_NOTE));
  add(out,ms);
  // 2) 지금 상태 0~4
  const ss=add(section(EASY_TEXT.state,EASY_TEXT.stateSub),null);
  const memo=input(st.easyMemo??'',{maxlength:'60',placeholder:EASY_TEXT.memo,'aria-label':EASY_TEXT.memo});memo.addEventListener('input',()=>{st.easyMemo=memo.value;});
  for(const [k,name] of STATE_KINDS){
    const line=add(el('div',null,'hlt-state-row'),el('span',name,'hlt-state-name'));
    for(let v=0;v<=STATE_MAX;v++){const b=button(String(v),run(()=>stateItem(k,v,ctx.now()),()=>{const m=(st.easyMemo??'').trim();st.easyMemo='';return m?{note:hhmmKst(ctx.now())+' '+name+' '+v+' '+m}:{};},()=>[memo]),'secondary hlt-state-btn hlt-s'+v);b.setAttribute('aria-label',name+' '+v);add(line,b);}
    add(ss,line);
  }
  add(ss,memo);add(out,ss);
  // 3) 하루 타임라인(보고 있는 날짜)
  const card=(raw.days.find(d=>d.date===st.date)?.data)??null,labelOf=key=>{const p=raw.profiles.find(x=>x.key===key);return p&&(st.showPrivate||!p.data.private)?p.data.label:'약';};
  const study=(ctx.getWhole().study?.days??[]).find(d=>d.date===st.date)?.data??null;
  const tl=timelineData(st.flowState?.card??card,{labelOf,study,date:st.date});
  const ts=add(section(EASY_TEXT.timeline+' · '+st.date,'아래 숫자 = 시각(0~24시) · 띠 = 수면(진한)·낮잠(연한) · 금 선 = 공부 벽돌 · 점 = 복용 · 막대 = 무기력(금)·우울(남)'),timelineSvg(doc,tl));
  const doseList=tl.doses.map(d=>(d.when??hhmmOf(d.m))+' '+d.label);
  add(ts,hint(doseList.length?'복용 · '+doseList.join(' · '):'이 날 복용 기록 없음'));
  add(out,ts);
  // 4) 심해지는 시간대
  const sum=stateSummary(raw.days,today),sm=add(section(EASY_TEXT.summary,'3시간 칸별 평균(0~4)과 기록 수 · 기록 '+SUMMARY_MIN+'회 미만 칸은 "자료 부족"'),null);
  for(const [k,name] of STATE_KINDS){
    const grid=add(el('div',null,'hlt-slot-grid'),el('span',name,'hlt-state-name'));
    for(const s of sum[k])add(grid,el('span',s.from+'~'+s.to+'시 '+(s.avg===null?EASY_TEXT.few+'('+s.count+')':s.avg.toFixed(1)+' ('+s.count+'회)'),'hlt-slot'+(s.avg===null?' hlt-slot-few':'')));
    add(sm,grid,el('p',summarySentence(sum[k],name),'hlt-slot-fact'));
  }
  add(sm,hint(MED_NOTE));
  add(out,sm);
  root.append(out);
  return out;
}

// 설정 화면의 모듈 스위치(B38: 기본 켜짐, 끄기는 이 기기에만 적용).
export function renderHealthSwitch(ctx){
  const doc=ctx.document??globalThis.document,{el,add,button,hint,section}=maker(doc);
  const on=hltEnabled(ctx.storage);
  return add(section('건강 기능','기본은 켜짐입니다. 끄면 이 기기에서만 건강 화면이 숨겨집니다(다른 기기에는 영향 없음, 기록은 그대로 안전). 모든 기기를 같은 빌드로 갱신한 뒤 쓰세요 — 갱신 안 된 기기는 건강 기록을 만나면 열리지 않고 멈춥니다(기록은 안전).'),
    el('p',on?'지금: 켜짐':'지금: 꺼짐','hlt-switch-state'),button(on?'건강 기능 끄기':'건강 기능 켜기',()=>{setHltEnabled(!on,ctx.storage);void ctx.onSwitch?.(!on);},on?'secondary':'primary'));
}
export {hltHomeLine};
// FIX45 (AUD1 #9): 오늘 첫 화면 한 줄(쌓은 카드 기준, 자료 없으면 "기록 없음", 0걸음은 0).
export const sleepStepsLine=(raw,date)=>{const {sleep,steps}=sleepStepsToday(raw,date);return '지난밤 수면 '+(sleep===null?'기록 없음':Math.floor(sleep/60)+':'+String(sleep%60).padStart(2,'0'))+' · 오늘 걸음 '+(steps===null?'기록 없음':steps.toLocaleString('ko-KR'));};
// 홈 "오늘" 패널(B5)용 한 줄: 카드 수준 정보만(hltHomeLine). 스위치가 꺼져 있으면 호출하지 않는다.
export const healthHomeLine=ctx=>hltHomeLine(ctx.getWhole().hlt,kstDate(ctx.now()),true);
