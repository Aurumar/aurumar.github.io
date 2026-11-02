// 건강 모듈 화면(B3). 합성 데이터로만 시험한다. 기본 꺼짐: 스위치를 켜기 전에는 화면·메뉴·새 종류 쓰기가 전혀 나타나지 않는다.
// 스위치 위치(결정): 이 기기의 로컬 설정(localStorage). 금고 공유로 두면 PREFERENCES의 모양을 바꿔야 해서 아직 갱신하지 않은 기기가 HOLD하고,
// 새 엔티티 종류로 두면 같은 문제가 첫 쓰기에서 생긴다 → 안전한 쪽은 기기별 로컬. 저장소가 막혀 있으면 이번 실행 동안만 유지한다.
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 비공개 습관은 "숨김 항목 보기"를 누른 뒤에만 보이고,
// 앱을 다시 열면 다시 숨겨진다(저장하지 않음). 숨김 상태에서는 라벨뿐 아니라 횟수·시각·마지막 기록 후 n일·7·30일 횟수·알림 문구에도 나오지 않는다.
import {HltFlow} from './hlt-flow.mjs';
import {hltView,hltHomeLine} from './hlt-projection.mjs';
import {HLT_LIMITS,kstDate,shiftDay,dateKeyOK,isoOK,UNITS,MEAL_KINDS,MEAL_SIZES,SLEEP_KINDS,CHANGE_KINDS,SYMPTOM_KINDS,MAX_NOTE,MAX_LABEL,MAX_ITEMS,ITEM_TYPES} from './hlt-model.mjs';

const HLT_PROFILE_LIMIT=HLT_LIMITS.HLT_PROFILE;
export const HLT_SWITCH_KEY='lb.hlt.enabled';
let memorySwitch=false;
export function hltEnabled(storage=globalThis.localStorage){try{const v=storage?.getItem(HLT_SWITCH_KEY);return v===null||v===undefined?memorySwitch:v==='1';}catch{return memorySwitch;}}
export function setHltEnabled(on,storage=globalThis.localStorage){memorySwitch=Boolean(on);try{storage?.setItem(HLT_SWITCH_KEY,on?'1':'0');}catch{/* 저장소가 막혀 있으면 이번 실행 동안만 */}return hltEnabled(storage);}

export const HLT_ERROR_TEXT=Object.freeze({
  HLT_ITEM_LIMIT:'한 카드에는 항목을 120개까지만 둘 수 있습니다. 자동으로 지우거나 나누지 않았습니다 · 초안은 그대로 있습니다. 항목을 직접 줄인 뒤 다시 확정하세요.',
  REBASE_ID_COLLISION:'다른 기기에서 같은 항목 번호로 다른 내용을 추가했습니다. 아무것도 저장하지 않았습니다 · 초안은 그대로 있습니다.',
  UNKNOWN_HLT_PROFILE:'없는 프로필을 가리키는 항목이 있습니다. 항목을 고치거나 프로필을 먼저 만드세요.',
  HLT_DOSE_NEEDS_MED_PROFILE:'복용 기록은 약·측정 프로필만 고를 수 있습니다.',HLT_HABIT_NEEDS_HABIT_PROFILE:'습관 기록은 습관 프로필만 고를 수 있습니다.',
  HLT_CHECK_COUNT_MUST_BE_ONE:'했다/안했다 습관은 횟수가 1이어야 합니다.',HLT_OPEN_SLEEP_LIMIT:'끝나지 않은 수면은 카드당 하나만 둘 수 있습니다.',
  INVALID_HLT_SLEEP_SPAN:'수면 길이는 0~48시간이어야 하고 끝이 시작보다 빠를 수 없습니다.',HLT_TIME_OUTSIDE_CARD_DATE:'카드 날짜의 앞뒤 하루 안의 시각만 기록할 수 있습니다.',
  HLT_PROFILE_IMMUTABLE:'프로필의 키·종류·방식은 바꿀 수 없습니다. 새로 만드세요.',HLT_PROFILE_REMOVED:'삭제한 프로필을 가리키는 항목이 있습니다. "삭제한 항목 보기"에서 복원하거나 그 항목을 지우세요 · 초안은 그대로 있습니다.',HLT_PROFILE_DISABLED:'사용을 중단한 프로필을 가리키는 항목이 있습니다. 다시 사용으로 바꾸거나 그 항목을 지우세요 · 초안은 그대로 있습니다.',
  APP_ENTITY_LIMIT:'개수 한도에 닿았습니다.',STALE_HEADS:'다른 기기에서 먼저 바뀌었습니다. 다시 받아 합친 뒤 확정하세요.',BROKEN_HLT_WAKE_REFERENCE:'맑아짐 기록은 같은 카드의 기상 기록을 가리켜야 합니다.',
  MD_NOT_WRITE_READY:'지금은 서버에 확정할 수 없습니다. 초안은 이 기기에 남아 있습니다.',VERSION_CONFLICT:'다른 기기가 먼저 확정했습니다. 다시 확정을 누르면 받아서 합칩니다.',
  ABORTED:'서버가 이 확정을 받지 않았습니다(기록되지 않음) · 초안은 그대로 있습니다. 다시 확정할 수 있습니다.',
});
export const hltErrorText=code=>HLT_ERROR_TEXT[code]??(code?'확정하지 못했습니다 ('+code+') · 초안은 그대로 있습니다.':'확정하지 못했습니다.');
export const NOTICE_TEXT=Object.freeze({
  REBASE_CONFLICT_KEPT_REMOTE:'내가 지운 항목을 다른 기기에서 고쳐서 삭제하지 않고 상대 수정을 남겼습니다.',
  REBASE_CONFLICT_KEPT_LOCAL:'다른 기기에서 지운 항목을 내가 고쳐서 내 수정으로 되살렸습니다.',
  REBASE_VALUE_OVERWRITTEN:'같은 항목을 양쪽에서 고쳤습니다 · 내 값을 썼고 상대 값은 이력에 남아 있습니다.',
  NOTE_OVERWRITTEN:'메모를 양쪽에서 고쳤습니다 · 내 메모를 썼고 상대 메모는 이력에 남아 있습니다.',
});
const STATUS_TEXT=Object.freeze({
  CONFIRMED:'저장 및 동기화 확인됨 · 확정했습니다 (연산 1).',ALREADY_APPLIED:'이미 반영되어 있습니다 · 새로 저장하지 않았습니다.',NOTHING_TO_CONFIRM:'확정할 초안이 없습니다.',
  UNKNOWN:'서버 응답을 확인하지 못했습니다 · 초안은 그대로 있습니다. 다시 확정을 누르면 결과를 확인한 뒤 이어서 처리합니다(중복 저장 없음).',
  SYNC_FAILED:'서버에서 최신 기록을 받지 못했습니다 · 초안은 그대로 있습니다.',FAILED:'저장하지 못했습니다 · 초안은 그대로 있습니다.',STALE:'다른 기기와 계속 겹쳐 확정하지 못했습니다 · 초안은 그대로 있습니다.',
});

// ---- 시각 입력(KST 시:분 ↔ UTC ISO) ----
export const hhmmKst=iso=>{const m=Math.floor((((Date.parse(iso)+9*3600000)%86400000)+86400000)%86400000/60000);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
export function isoFromKst(date,hhmm,dayOffset=0){
  if(!dateKeyOK(date)||typeof hhmm!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm))return null;
  return new Date(Date.parse(date+'T'+hhmm+':00.000Z')-9*3600000+dayOffset*86400000).toISOString();
}
export const itemLabel=Object.freeze({dose:'복용',sleep:'수면',wake:'기상',clarity:'맑아짐',checkin:'체크인',change:'변화',symptom:'증상',meal:'식사',habit:'습관'});
const MEAL_TEXT={BREAKFAST:'아침',LUNCH:'점심',DINNER:'저녁',SNACK:'간식',LATE_NIGHT:'야식'},SIZE_TEXT={LIGHT:'가볍게',NORMAL:'보통',HEAVY:'많이'};
const KIND_TEXT={fatigue:'피로',depression:'우울·무기력',palpitations:'두근거림',sweating:'땀',other:'기타',main:'주 수면',nap:'낮잠'};

export function itemSummary(it,labelOf){
  switch(it.type){
    case 'dose':return labelOf(it.profileKey)+' '+it.amount+it.unit+' · '+hhmmKst(it.at);
    case 'sleep':return KIND_TEXT[it.kind]+' '+hhmmKst(it.startAt)+' → '+(it.endAt?hhmmKst(it.endAt):'아직 안 끝남');
    case 'wake':return '기상 '+hhmmKst(it.at);
    case 'clarity':return '정신 맑아짐 '+hhmmKst(it.at);
    case 'checkin':return '체크인 '+hhmmKst(it.at)+' · 기분 '+it.mood+' 에너지 '+it.energy+' 집중 '+it.focus+' 졸림 '+it.sleepiness;
    case 'change':return KIND_TEXT[it.kind]+' '+it.intensity+' · '+hhmmKst(it.at);
    case 'symptom':return '증상 '+KIND_TEXT[it.kind]+' '+it.intensity+' · '+hhmmKst(it.at);
    case 'meal':return (MEAL_TEXT[it.kind]??it.kind)+(it.size?' · '+SIZE_TEXT[it.size]:'')+' · '+hhmmKst(it.at);
    case 'habit':return labelOf(it.profileKey)+' × '+it.count+(it.at?' · '+hhmmKst(it.at):'');
    default:return it.type;
  }
}

// ---- 포트: 앱의 api/기록 함수를 HltFlow가 쓰는 모양으로 ----
// ctx: {api, mdProfile(), getWhole(), getChanges(), syncForWrite(), hasPending(), reconcile(), uid(), now()}
export function createPorts(ctx,pendingStore){
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
    pendingSleep:pendingStore,
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
export function createHealthState(){return {date:null,showPrivate:false,showRemoved:false,notices:[],message:null,error:false,form:null,flowState:null,flow:null,ports:null,pendingSleep:null};}
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
    const pending={v:null};st.pendingSleep=pending;
    st.ports=createPorts(ctx,{get:()=>pending.v,set:v=>{pending.v=v;},clear:()=>{pending.v=null;}});
    st.flow=new HltFlow(st.ports);
  }
  st.raw=whole.hlt;
  const flowState=await st.flow.state(st.date);
  if(gone())return st;
  st.flowState=flowState;
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
    case 'dose':sel('profileKey','약·측정',withCurrent('MED',x.profileKey),x.profileKey??usable('MED')[0]?.[0]??'');numCtl('amount','용량',x.amount,num,'INVALID_HLT_DOSE');sel('unit','단위',UNITS.map(u=>[u,u]),x.unit??'mg');use('at',timeCtl('시각',x.at));break;
    case 'sleep':sel('kind','종류',SLEEP_KINDS.map(k=>[k,KIND_TEXT[k]]),x.kind??'main');use('startAt',timeCtl('시작',x.startAt));use('endAt',timeCtl('끝(비우면 아직 안 끝남)',x.endAt,{optional:true}));break;
    case 'wake':use('at',timeCtl('기상',x.at));break;
    case 'clarity':sel('wakeId','기상 기록',(st.flowState.card.items.filter(i=>i.type==='wake')).map(i=>[i.id,'기상 '+hhmmKst(i.at)]),x.wakeId??st.flowState.card.items.find(i=>i.type==='wake')?.id??'');use('at',timeCtl('시각',x.at));break;
    case 'checkin':use('at',timeCtl('시각',x.at));for(const [k,l] of [['mood','기분'],['energy','에너지'],['focus','집중'],['sleepiness','졸림']])numCtl(k,l+' 0~10',x[k],int,'INVALID_HLT_CHECKIN');break;
    case 'change':sel('kind','종류',CHANGE_KINDS.map(k=>[k,KIND_TEXT[k]]),x.kind??'fatigue');numCtl('intensity','정도 0~10',x.intensity,int,'INVALID_HLT_CHANGE');use('at',timeCtl('시작',x.at));use('endAt',timeCtl('끝(비우면 계속)',x.endAt,{optional:true}));break;
    case 'symptom':sel('kind','종류',SYMPTOM_KINDS.map(k=>[k,KIND_TEXT[k]]),x.kind??'other');numCtl('intensity','정도 0~10',x.intensity,int,'INVALID_HLT_SYMPTOM');use('at',timeCtl('시각',x.at));break;
    case 'meal':sel('kind','식사',MEAL_KINDS.map(k=>[k,MEAL_TEXT[k]]),x.kind??'BREAKFAST');sel('size','양',[['','모름'],...MEAL_SIZES.map(k=>[k,SIZE_TEXT[k]])],x.size??'');use('at',timeCtl('시각',x.at));break;
    case 'habit':sel('profileKey','습관',withCurrent('HABIT',x.profileKey),x.profileKey??usable('HABIT')[0]?.[0]??'');numCtl('count','횟수 1~99',x.count??1,int,'INVALID_HLT_HABIT');use('at',timeCtl('시각(비우면 카드 날짜)',x.at,{optional:true}));break;
  }
  void all;
  return {node:add(el('div',null,'hlt-form'),...parts),read(){
    const item={type};for(const [k,r] of Object.entries(reads))item[k]=r();
    if(type==='meal')item.size=item.size===''?null:item.size;
    return item;
  }};
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
  const act=(fn)=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;seen();try{await fn();}catch(e){st.message=box?.ERROR_TEXT[e?.code]??hltErrorText(e?.code);st.error=true;}await prepareHealth(ctx,st);await ctx.rerender();});
  const out=el('div',null,'hlt-view');

  // 1) 상태·날짜
  const head=section('건강 · 하루 1장','입력은 이 기기의 임시 저장(초안)에 쌓이고, "확정"을 눌러야 금고에 기록됩니다(연산 1). 같은 날 카드를 또 확정하면 연산이 하나 더 듭니다.');
  const chipText=()=>{
    const b=box?.statusFor('HLT_DAY',date);
    if(st.form)return '입력 중 (아직 저장 전)';
    if(b?.typing)return T.typing;
    if(b?.has)return '이 기기에만 있는 초안 · '+(b.dirty?(b.failed?'아직 이 기기에 저장하지 못함':T.typing):T.saved)+(b.old?' · '+T.old:'');
    return fs.status==='LOCAL_DRAFT'?'이 기기에만 있는 초안 (아직 금고에 없음) · 초안 저장됨':fs.status==='CONFIRMED'?'확정됨 · 이 카드는 '+fs.latestConfirmCount+'번 확정':'아직 기록 없음';
  };
  const chipEl=el('p',chipText(),'hlt-chip');
  const dateIn=input(date,{inputmode:'numeric',placeholder:'YYYY-MM-DD',maxlength:'10'});
  const go=d=>()=>{if(!dateKeyOK(d)){st.message='날짜는 YYYY-MM-DD 형식이어야 합니다.';st.error=true;void ctx.rerender();return;}st.date=d;st.form=null;st.message=null;st.notices=[];void ctx.perform(async()=>{await prepareHealth(ctx,st);await ctx.rerender();});};
  add(head,add(el('div',null,'buttons'),button('◀ 전날',()=>go(shiftDay(date,-1))()),dateIn,button('이동',()=>go(dateIn.value.trim())()),button('▶ 다음날',()=>go(shiftDay(date,1))()),button('오늘',()=>go(st.today)())),
    chipEl);
  if(st.ports?.persistent===false)add(head,hint('이 환경에는 임시 저장 저널이 없어 초안이 앱을 닫거나 새로고침하면 사라집니다. 확정하기 전에 닫지 마세요. (PC 앱에서는 초안이 기기에 암호화되어 남습니다.)'));
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
  if(fs.latestConfirmCount+1>=3&&fs.status==='LOCAL_DRAFT')add(head,hint('이 카드는 이번이 '+(fs.latestConfirmCount+1)+'번째 확정입니다. 막지는 않지만, 모아서 한 번에 확정하면 기록 연산을 아낄 수 있습니다.'));
  if(st.message)add(head,el('p',st.message,st.error?'notice error hlt-message':'notice hlt-message'));
  if(st.notices.length)add(head,el('p','다른 기기에서 바뀐 내용이 있어 합쳤어요.','notice hlt-merged'));
  for(const n of st.notices){
    const hiddenRef=n.profileKey&&!st.showPrivate&&!(all.get(n.profileKey)&&!all.get(n.profileKey).data.private);
    add(head,el('p',hiddenRef?'숨김 항목과 관련된 알림이 있습니다 · "숨김 항목 보기"를 누르면 볼 수 있습니다.':(NOTICE_TEXT[n.code]??n.code),'notice hlt-notice'));
  }
  add(out,head);

  // 2) 빠른 입력(연산 0)
  const q=section('빠른 입력','누르면 지금 시각으로 초안에 들어갑니다(연산 0).'),pend=st.pendingSleep.v;
  // B17 (H12-N03): 빠른 입력은 언제나 오늘(지금 시각의 KST 날짜) 카드 초안에 들어간다. 다른 날짜를 보고 있었으면 화면을 그 초안의 날짜로 옮기고 한 줄 알린다
  // (확정 버튼은 늘 화면에 보이는 카드의 초안을 확정하므로, 빠른 입력 바로 뒤의 확정이 그 입력을 확정한다).
  const follow=(s,text=null)=>{const d=s?.card?.date,moved=Boolean(d)&&d!==date;if(moved){st.date=d;st.form=null;st.notices=[];}st.message=[text,moved?'빠른 입력은 오늘('+d+') 카드에 들어갑니다 · 화면을 그 날짜로 옮겼습니다.':null].filter(Boolean).join(' · ')||null;};
  const quick=add(el('div',null,'buttons hlt-quick'),
    button('지금 기상',act(async()=>{const w=await st.flow.quickWake();follow(w,w.withSleep?'기상과 수면을 초안에 넣었습니다.':'기상을 초안에 넣었습니다(수면은 직접 입력하세요).');}),'primary'),
    button('지금 취침',act(async()=>{st.flow.quickSleep();st.message='취침 시각을 이 기기에 적어 두었습니다. 기상 때 수면으로 합쳐집니다(연산 0).';})));
  for(const k of MEAL_KINDS)add(quick,button(MEAL_TEXT[k],act(async()=>{follow(await st.flow.quickMeal(k));})));
  const habitProfiles=view.profiles.filter(p=>p.data.kind==='HABIT'&&p.data.enabled);
  for(const p of habitProfiles)add(quick,button(p.data.label,act(async()=>{follow(await st.flow.quickHabit(p.key,p.data));})));
  add(q,quick);if(pend)add(q,hint('취침 기록 중 · '+hhmmKst(pend)+' (KST) — 기상을 누르면 수면으로 합쳐집니다.'));
  add(out,q);

  // 3) 항목
  const list=section('그날 항목','항목 '+fs.card.items.filter(visible).length+'개'+(fs.card.items.length>=MAX_ITEMS?' · 최대 '+MAX_ITEMS+'개':''));
  const items=fs.card.items.filter(visible);
  if(!items.length)add(list,hint('아직 항목이 없습니다.'));
  for(const it of items)add(list,row(itemLabel[it.type]+' · '+itemSummary(it,labelOf),null,add(el('div',null,'buttons'),
    button('수정',()=>{st.form={type:it.type,id:it.id,item:it};void ctx.rerender();}),
    button('삭제',act(async()=>{await st.flow.removeItem(date,it.id);})))));
  const adders=add(el('div',null,'buttons'));
  for(const t of ITEM_TYPES)add(adders,button(itemLabel[t]+' 추가',()=>{st.form={type:t,id:null,item:null};void ctx.rerender();}));
  add(list,adders);
  if(st.form){
    const f=itemForm(h,st.form.type,ctx,st,st.form.item);
    add(list,el('h3',itemLabel[st.form.type]+(st.form.id?' 수정':' 추가'),'panel-title'),f.node,add(el('div',null,'buttons'),
      button('초안에 넣기',act(async()=>{const item=f.read();if(st.form.id)await st.flow.updateItem(date,{...item,id:st.form.id});else await st.flow.addItem(date,item);st.form=null;st.message='초안에 저장했습니다(연산 0).';}),'primary'),
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
  const fin=section('메모와 확정');
  add(fin,field('메모 (최대 '+MAX_NOTE+'자)',note),add(el('div',null,'buttons'),
    button('메모를 초안에 넣기',act(async()=>{await st.flow.setNote(date,note.value);})),
    button('확정 (연산 1)',act(async()=>{
      const r=await st.flow.confirm(date);st.notices=r.notices??[];
      if(r.status==='REJECTED'){st.message=hltErrorText(r.code);st.error=true;}
      else if(['UNKNOWN','SYNC_FAILED','FAILED','STALE'].includes(r.status)){st.message=(r.code&&HLT_ERROR_TEXT[r.code])||STATUS_TEXT[r.status];st.error=true;}
      else st.message=STATUS_TEXT[r.status]??r.status;
    }),'primary'),
    fs.status==='LOCAL_DRAFT'?button('초안 버리기',()=>{if(ctx.confirmDialog?.('이 날짜의 초안을 버릴까요? 금고에 확정된 기록에는 영향이 없습니다.')??true)void act(async()=>{await st.ports.drafts.discard(fs.draftId);st.notices=[];})();}):null));
  add(out,fin);

  // 5) 리듬 요약(계산만, 연산 0)
  const s=view.summary,rhythm=section('생활 리듬 요약','계산만 하며 저장하지 않습니다(연산 0). 기준일 '+s.today+' · KST');
  for(const [name,w] of [['최근 7일',s.week],['최근 30일',s.month]])add(rhythm,row(name,'평균 기상 '+(w.avgWake??'기록 없음')+' · 평균 취침 '+(w.avgSleepStart??'기록 없음')+' · 평균 수면 '+(w.avgSleepMinutes===null?'기록 없음':Math.floor(w.avgSleepMinutes/60)+'시간 '+(w.avgSleepMinutes%60)+'분')+' · 첫 식사 '+(w.avgFirstMeal??'기록 없음')));
  for(const hb of s.habits)add(rhythm,row(hb.label,'마지막 기록 '+(hb.lastAgoDays===null?'없음':hb.lastAgoDays+'일 전')+' · 7일 '+hb.count7+'회 · 30일 '+hb.count30+'회'));
  add(out,rhythm);

  // 6) 프로필 관리
  const prof=section('프로필 (약·측정 / 습관)','이름은 직접 정합니다. 키·종류·방식은 만든 뒤 바꿀 수 없습니다. 비공개는 켜고 끌 수 있습니다. 삭제하면 목록에서 사라지지만 지난 기록에는 이름이 남고, "삭제한 항목 보기"에서 복원할 수 있습니다. 삭제한 항목도 기록 보존을 위해 개수 한도('+HLT_PROFILE_LIMIT+'개)에 계속 셉니다(지금 '+raw.profiles.length+'개).');
  const profileDetail=d=>(d.kind==='MED'?'약·측정 · 기본 '+d.defaultAmount+d.unit:'습관 · '+(d.mode==='CHECK'?'했다/안했다':'횟수'))+(d.enabled?'':' · 중단됨')+(d.private?' · 비공개':'');
  for(const p of view.profiles){
    const d=p.data;
    add(prof,row(d.label,profileDetail(d),add(el('div',null,'buttons'),
      button(d.enabled?'사용 중단':'다시 사용',act(async()=>{await saveProfile(ctx,p.key,{...d,enabled:!d.enabled},p.heads,'건강 프로필 사용 여부',{field:'enabled'});})),
      button(d.private?'공개로 바꾸기':'비공개로 바꾸기',act(async()=>{await saveProfile(ctx,p.key,{...d,private:!d.private},p.heads,'건강 프로필 비공개 여부');})),
      button('프로필 삭제',()=>{if(ctx.confirmDialog?.('이 항목을 삭제할까요? 지운 항목은 목록에서 사라지고 지난 기록에는 이름이 남아요. 나중에 복원할 수 있어요.')??true)void act(async()=>{await saveProfile(ctx,p.key,{...d,removed:true},p.heads,'건강 프로필 삭제');})();}))));
  }
  const nl=input('',{maxlength:String(MAX_LABEL),placeholder:'이름 (최대 '+MAX_LABEL+'자)'}),kindSel=select([['HABIT','습관'],['MED','약·측정']],'HABIT'),modeSel=select([['COUNT','횟수'],['CHECK','했다/안했다']],'COUNT'),amt=input('1',{inputmode:'decimal'}),unitSel=select(UNITS.map(u=>[u,u]),'mg'),priv=el('input');priv.type='checkbox';
  add(prof,el('h3','프로필 추가','panel-title'),field('이름',nl),field('종류',kindSel),field('방식(습관)',modeSel),field('기본 용량(약·측정)',amt),field('단위(약·측정)',unitSel),add(el('label','비공개'),priv),
    button('프로필 만들기 (연산 1)',act(async()=>{
      const label=nl.value.trim(),key=(kindSel.value==='MED'?'med-':'hab-')+ctx.uid().slice(0,12);
      const data=kindSel.value==='MED'?{key,kind:'MED',label,defaultAmount:num(amt.value),unit:unitSel.value,enabled:true,private:priv.checked,removed:false}:{key,kind:'HABIT',label,mode:modeSel.value,enabled:true,private:priv.checked,removed:false};
      await ctx.entity('HLT_PROFILE',key,data,[],'건강 프로필 추가');st.message='프로필을 만들었습니다.';
    }),'primary'));
  add(prof,el('h3','삭제한 항목','panel-title'),button(st.showRemoved?'삭제한 항목 숨기기':'삭제한 항목 보기',()=>{st.showRemoved=!st.showRemoved;void ctx.rerender();}));
  if(st.showRemoved){
    if(!view.removedProfiles.length)add(prof,hint('삭제한 항목이 없습니다.'));
    for(const p of view.removedProfiles)add(prof,row(p.data.label,profileDetail(p.data),add(el('div',null,'buttons'),
      button('복원',act(async()=>{await saveProfile(ctx,p.key,{...p.data,removed:false},p.heads,'건강 프로필 복원');st.message='복원했습니다.';})))));
  }
  add(out,prof);

  // 7) 숨김 항목 — 눌러도 외부 전송 허용을 뜻하지 않는다.
  add(out,add(el('div',null,'buttons'),button(st.showPrivate?'숨김 항목 다시 숨기기':'숨김 항목 보기',()=>{st.showPrivate=!st.showPrivate;void ctx.rerender();})),hint('숨김 항목은 이 화면에서만 보이며, 앱을 다시 열면 다시 숨겨집니다. 보기 버튼이 외부 전송을 허용한다는 뜻은 아닙니다.'));
  root.append(out);
  return out;
}

// 설정 화면의 모듈 스위치(기본 꺼짐, 이 기기에만 적용).
export function renderHealthSwitch(ctx){
  const doc=ctx.document??globalThis.document,{el,add,button,hint,section}=maker(doc);
  const on=hltEnabled(ctx.storage);
  return add(section('건강 모듈','기본은 꺼짐입니다. 이 기기에서만 켜고 끕니다(다른 기기에는 영향 없음). 켜기 전에 모든 기기를 같은 날 같은 빌드로 갱신했는지 확인하세요 — 갱신 안 된 기기는 건강 기록을 만나면 열리지 않고 멈춥니다(기록은 안전).'),
    el('p',on?'지금: 켜짐':'지금: 꺼짐','hlt-switch-state'),button(on?'건강 모듈 끄기':'건강 모듈 켜기',()=>{setHltEnabled(!on,ctx.storage);void ctx.onSwitch?.(!on);},on?'secondary':'primary'));
}
export {hltHomeLine};
// 홈 "오늘" 패널(B5)용 한 줄: 카드 수준 정보만(hltHomeLine). 스위치가 꺼져 있으면 호출하지 않는다.
export const healthHomeLine=ctx=>hltHomeLine(ctx.getWhole().hlt,kstDate(ctx.now()),true);
