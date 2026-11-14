// V9A 공부 카드 화면: 오답 카드·개념 카드 만들기, 간격 반복 복습(한 장씩 넘기며 맞음/틀림 → 끝나면 요약), 카드 목록(과목·이유 필터, 졸업 카드, 다시 살리기), 오늘 화면 작은 칸.
// 저장 길(OPS1A): 카드·복습 입력은 이 기기 초안(카드 초안 상자 = IndexedDB 암호문, 없으면 메모리 — 공부 하루 카드와 같은 포트, study-ui createStudyPorts)에 모인다(연산 0).
//  PC 저널(drafts.lbd)은 쓰지 않는다: 저널 draft-list는 새 기록 초안의 본문을 돌려주지 않는 개인정보 경계(FIX49-P10)라 그대로 두고, 계획(PLAN_DAY, OPS1A)처럼 상자를 쓴다.
//  "지금 쌓기"·5분 자동 쌓기·저장 후 종료가 날짜 묶음마다 1번 쓴다(묶음 1건 = 연산 1). 카드 하나 = 연산 하나가 되지 않는다.
// 흐름은 공부 하루 카드의 StudyFlow를 그대로 쓰고(초안 → rebase → 확정, 응답 불명·ABORTED 처리 같음) 종류 규칙(spec)만 넘긴다.
// 사진: 브라우저 캔버스로 줄여(긴 변 1280px, JPEG) 이 기기 IndexedDB에 AES-GCM 암호문으로 둔다(키는 비추출, 카드 초안 상자와 같은 보호 수준). 기록에는 표지(ref·크기)만.
//  화면에는 캔버스로 그린다(CSP img-src 'self'를 바꾸지 않음 — blob:·data: 주소를 쓰지 않는다). 다른 기기에는 "사진은 찍은 기기에만 있어요".
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음).
import {StudyFlow,shownCard} from './study-flow.mjs';
import {createStudyPorts} from './study-ui.mjs';
import {mergeList,stable} from './study-rebase.mjs';
import {validateCardDay,emptyCardDay,newCardRow,projectCards,filterCards,cardSubjects,sessionSummary,dueLine,kstDay,lateDays,
  CARD_KINDS,REASONS,REASON_TEXT,CARD_LADDER,MAX_SUBJECT,MAX_UNIT,MAX_FRONT,MAX_BACK,MAX_MINE,PHOTO_REF} from './study-cards-model.mjs';

export const CARD_LISTS=Object.freeze(['cards','reviews']);
const sortById=items=>[...items].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const rowsOf=(c,l)=>c?c[l]:[];
export function diffCardDay(base,mine){
  const added=[],modified=[],removed=[];
  for(const list of CARD_LISTS){
    const B=new Map(rowsOf(base,list).map(i=>[i.id,i])),M=new Map(rowsOf(mine,list).map(i=>[i.id,i]));
    for(const [id,m] of M){if(!B.has(id))added.push({list,item:m});else if(stable(B.get(id))!==stable(m))modified.push({list,item:m});}
    for(const id of B.keys())if(!M.has(id))removed.push({list,id});
  }
  return {added,modified,removed};
}
export const cardDayChanged=(base,mine)=>{const d=diffCardDay(base,mine);return d.added.length+d.modified.length+d.removed.length>0;};
// 확정 직전 rebase: 공부 하루 카드(study-rebase)와 같은 3자 병합 규칙을 cards·reviews 두 배열에 적용한다.
export function rebaseCardDay({date,base,mine,latest}){
  const notices=[],merged={date};
  for(const list of CARD_LISTS){const r=mergeList(list,base,mine,latest,notices);if(r.rejected)return {...r.rejected,notices};merged[list]=r.items;}
  merged.confirmCount=(latest?latest.confirmCount:0)+1;
  if(latest?CARD_LISTS.every(l=>stable(sortById(merged[l]))===stable(sortById(latest[l]))):CARD_LISTS.every(l=>!merged[l].length))return {status:'ALREADY_APPLIED',notices};
  try{validateCardDay('STUDY_CARD_DAY',date,merged);}catch(e){return {status:'REJECTED',code:e.code??'CARD_REBASE_INVALID',notices};}
  return {status:'MERGED',card:merged,notices};
}
export const CARD_SPEC=Object.freeze({type:'STUDY_CARD_DAY',validate:(date,d)=>validateCardDay('STUDY_CARD_DAY',date,d),rebase:rebaseCardDay,
  empty:date=>({...emptyCardDay(date),confirmCount:1}),diff:diffCardDay,hasChanges:cardDayChanged,stable});
export const cardView=whole=>whole?.cards??{days:[]};
export function createCardPorts(ctx){return {...createStudyPorts(ctx,{type:'STUDY_CARD_DAY',view:cardView,noJournal:true}),spec:CARD_SPEC};}

// ---- 사진(이 기기만) ----
export const PHOTO_DB='LIFE_BRICK_CARD_PHOTOS_V1';
export const PHOTO_LIMITS=Object.freeze({maxSide:1280,maxBytes:400*1024,records:500,qualities:[0.82,0.7,0.6,0.5,0.4]});
const pfail=code=>Object.assign(new Error(code),{code});
const reqP=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const txDone=t=>new Promise((res,rej)=>{t.oncomplete=()=>res();t.onabort=()=>rej(t.error??pfail('PHOTO_STORE_FAILED'));t.onerror=()=>rej(t.error??pfail('PHOTO_STORE_FAILED'));});
const aad=ref=>new TextEncoder().encode('LB_CARD_PHOTO_1|'+ref);
export function createPhotoStore({indexedDB:idb=globalThis.indexedDB,crypto:cr=globalThis.crypto}={}){
  let dbP=null,keyP=null;
  const available=()=>Boolean(idb&&cr?.subtle);
  const db=()=>dbP??=new Promise((res,rej)=>{const r=idb.open(PHOTO_DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('keys',{keyPath:'id'});r.result.createObjectStore('photos',{keyPath:'id'});};r.onsuccess=()=>res(r.result);r.onerror=()=>{dbP=null;rej(r.error??pfail('PHOTO_STORE_FAILED'));};});
  const readKey=async()=>{const t=(await db()).transaction('keys','readonly');const row=await reqP(t.objectStore('keys').get('key'));return row?.key??null;};
  const key=()=>keyP??=(async()=>{
    let k=await readKey();if(k)return k;
    const made=await cr.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const t=(await db()).transaction('keys','readwrite'),s=t.objectStore('keys');const cur=await reqP(s.get('key'));if(!cur)s.put({id:'key',key:made});await txDone(t);
    k=await readKey();if(!k)throw pfail('PHOTO_STORE_FAILED');return k;
  })().catch(e=>{keyP=null;throw e;});
  // V9FIX M-04: 개수는 저장소 count로 센다(암호문 전부를 읽지 않음).
  const count=async()=>{const s=(await db()).transaction('photos','readonly').objectStore('photos');return typeof s.count==='function'?await reqP(s.count()):(await reqP(s.getAll())).length;};   // count가 없는 저장소(시험용 가짜)만 예전 방식
  return {
    available,count,
    // V9FIX M-04: 사진 하나 지우기(카드에 넣기 전 "사진 빼기"·다시 고르기). 없으면 아무것도 안 함.
    async delete(ref){
      if(!available()||!PHOTO_REF.test(String(ref)))return false;
      const t=(await db()).transaction('photos','readwrite');t.objectStore('photos').delete(ref);await txDone(t);return true;
    },
    async put(bytes,{w,h}){
      if(!available())throw pfail('PHOTO_STORE_UNAVAILABLE');
      const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
      if(u8.length>PHOTO_LIMITS.maxBytes)throw pfail('PHOTO_TOO_LARGE');
      if(await count()>=PHOTO_LIMITS.records)throw pfail('PHOTO_LIMIT');
      const ref='p'+Array.from(cr.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
      const iv=cr.getRandomValues(new Uint8Array(12)),ct=new Uint8Array(await cr.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(ref)},await key(),u8));
      const t=(await db()).transaction('photos','readwrite');t.objectStore('photos').put({id:ref,iv,ct,w,h,at:new Date().toISOString()});await txDone(t);
      return {ref,w,h,kb:Math.max(1,Math.ceil(u8.length/1024))};
    },
    // 이 기기에 없으면 null(다른 기기에서 찍은 사진). 열 수 없으면(키 바뀜·손상) null — 지우지 않는다.
    async get(ref){
      if(!available()||!PHOTO_REF.test(String(ref)))return null;
      const t=(await db()).transaction('photos','readonly'),row=await reqP(t.objectStore('photos').get(ref));if(!row)return null;
      try{return new Uint8Array(await cr.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:aad(ref)},await key(),row.ct));}catch{return null;}
    },
  };
}
// 고른 사진 파일 → 긴 변 1280px JPEG(품질을 내려 가며 400KB 안). 브라우저 전용(createImageBitmap·canvas). 줄이지 못하면 PHOTO_TOO_LARGE.
export async function shrinkPhoto(file,doc){
  if(!file||!/^image\//.test(file.type??''))throw pfail('PHOTO_NOT_IMAGE');
  let bmp;try{bmp=await globalThis.createImageBitmap(file);}catch{throw pfail('PHOTO_NOT_IMAGE');}
  const scale=Math.min(1,PHOTO_LIMITS.maxSide/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const c=doc.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close?.();
  for(const q of PHOTO_LIMITS.qualities){
    const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',q));
    if(blob&&blob.size<=PHOTO_LIMITS.maxBytes)return {bytes:new Uint8Array(await blob.arrayBuffer()),w,h};
  }
  throw pfail('PHOTO_TOO_LARGE');
}
// 사진을 캔버스에 그린다(없으면 안내 글). 브라우저 전용.
export function photoView(doc,store,photo){
  const box=doc.createElement('div');box.className='card-photo';
  const note=doc.createElement('p');note.className='muted small card-photo-note';note.textContent='사진 불러오는 중…';box.append(note);
  void (async()=>{
    const bytes=await store?.get(photo.ref).catch(()=>null);
    if(!bytes){note.textContent='사진은 찍은 기기에만 있어요('+photo.w+'×'+photo.h+').';return;}
    try{
      const bmp=await globalThis.createImageBitmap(new Blob([bytes],{type:'image/jpeg'})),c=doc.createElement('canvas');
      c.width=bmp.width;c.height=bmp.height;c.className='card-photo-canvas';c.getContext('2d').drawImage(bmp,0,0);bmp.close?.();
      c.setAttribute('role','img');c.setAttribute('aria-label','문제 사진');note.replaceWith(c);
    }catch{note.textContent='사진을 열지 못했어요.';}
  })();
  return box;
}

// ---- 상태·준비 ----
export const CARD_TEXT=Object.freeze({
  title:'공부 카드',
  sub:'오답·개념 카드를 1·3·7·14·30일 간격으로 다시 봅니다. 맞히면 다음 간격, 틀리면 1일 뒤. 30일 간격까지 맞히면 졸업.',
  stack:'카드·복습 입력은 이 기기에 모였다가 "지금 쌓기"(또는 5분 자동 쌓기) 한 번에 날짜 묶음으로 저장돼요 · 카드마다 저장하지 않아요.',
  empty:'아직 카드가 없어요 · 아래에서 오답 카드나 개념 카드를 만들어 보세요.',
  photoElsewhere:'사진은 찍은 기기에만 있어요',
});
export const CARD_ERROR_TEXT=Object.freeze({
  CARD_QUESTION_REQUIRED:'문제 글을 적거나 사진을 넣어 주세요.',CARD_CONCEPT_SIDES:'개념 카드는 앞면과 뒷면을 모두 적어 주세요.',
  INVALID_CARD_TEXT:'글자 수를 확인하세요(과목 '+MAX_SUBJECT+'자 · 단원 '+MAX_UNIT+'자 · 문제·앞면 '+MAX_FRONT+'자 · 정답·뒷면 '+MAX_BACK+'자 · 내 답 '+MAX_MINE+'자).',
  CARD_LIMIT:'하루에 만드는 카드는 60장까지예요 · 임시 입력은 그대로 있어요.',CARD_REVIEW_LIMIT:'하루 복습 기록은 300개까지예요.',
  CARD_DAY_TOO_LARGE:'그 날짜 카드 묶음이 너무 커요(48KB) · 긴 글을 줄여 주세요 · 임시 입력은 그대로 있어요.',   // V9FIX L-01: 지난 날짜 묶음(다시 살리기·지우기)일 수도 있다
  PHOTO_NOT_IMAGE:'사진 파일만 넣을 수 있어요.',PHOTO_TOO_LARGE:'사진을 400KB 안으로 줄이지 못했어요 · 더 작은 사진을 골라 주세요.',
  PHOTO_LIMIT:'이 기기에 저장한 사진이 500장이라 더 넣지 않았어요.',PHOTO_STORE_UNAVAILABLE:'이 기기에서는 사진을 저장할 수 없어요 · 문제를 글로 적어 주세요.',PHOTO_STORE_FAILED:'사진을 저장하지 못했어요.',
  REBASE_ID_COLLISION:'다른 기기에서 같은 번호로 다른 카드를 넣었어요 · 아무것도 저장하지 않았어요 · 임시 입력은 그대로 있어요.',
  NO_SUBJECT:'과목을 고르거나 적어 주세요.',
  CARD_NOT_IN_DRAFT:'다른 기기에서 쌓은 카드라 이 기기 임시 입력에는 아직 없어요 · 위 "지금 쌓기"로 먼저 쌓은 뒤 다시 해 주세요(아무것도 바꾸지 않았어요).',
});
// V9FIX M-02: 쌓을 때 두 기기 충돌로 내 변경과 다르게 저장된 것을 알린다(STUDY_DAY 흐름처럼 알림을 버리지 않는다).
export function cardNoticeText(notices){
  const n=code=>(notices??[]).filter(x=>x.code===code&&x.list==='cards').length,out=[];
  if(n('REBASE_CONFLICT_KEPT_REMOTE'))out.push('지운 카드 '+n('REBASE_CONFLICT_KEPT_REMOTE')+'장은 다른 기기가 고쳐서 지우지 않고 남겼어요');
  if(n('REBASE_CONFLICT_KEPT_LOCAL'))out.push('다른 기기가 지운 카드 '+n('REBASE_CONFLICT_KEPT_LOCAL')+'장을 이 기기에서 고친 값으로 다시 넣었어요');
  if(n('REBASE_VALUE_OVERWRITTEN'))out.push('다른 기기도 고친 카드 '+n('REBASE_VALUE_OVERWRITTEN')+'장은 이 기기 값으로 저장했어요');
  return out.length?out.join(' · '):null;
}
// V9FIX M-03: 쌓지 못한 날짜와 이유. 두 기기를 합쳐 하루 한도를 넘으면 이 기기 초안을 줄여야 쌓인다.
const LIMIT_FIX={CARD_LIMIT:' · 두 기기 카드를 합치면 하루 60장을 넘어요 · 이 기기에서 넣은 그날 카드를 몇 장 지우면 쌓여요',CARD_REVIEW_LIMIT:' · 두 기기 복습을 합치면 하루 300개를 넘어요',CARD_DAY_TOO_LARGE:' · 두 기기 카드를 합치면 48KB를 넘어요'};
export const stackFailText=(date,code)=>date+' 카드 묶음을 쌓지 못했어요 · '+cardErrorText(code)+(LIMIT_FIX[code]??'');
export const cardErrorText=code=>CARD_ERROR_TEXT[code]??(code?'처리하지 못했어요 · 임시 입력은 그대로 있어요 · 문의 코드 ▾⁠'+code+'⁠':'처리하지 못했어요.');
export function createCardsState(){return {flow:null,ports:null,today:null,days:[],pending:[],kind:'WRONG',form:{reasons:[],photo:null},filter:{subject:'',reason:'',kind:'',graduated:false},session:null,message:null,error:false,photos:null};}
// 화면에 보일 묶음들 = 쌓인 묶음 + 이 기기 초안(날짜마다 shownCard, 줄 단위로 얹음). pending = 아직 안 쌓은 초안 날짜.
export async function prepareCards(ctx,st,gone=()=>false){
  st.today=kstDay(ctx.now());
  if(!st.flow){st.ports=createCardPorts(ctx);st.flow=new StudyFlow(st.ports);}
  st.photos??=ctx.photoStore??createPhotoStore();
  const drafts=(await st.ports.drafts.list()).filter(d=>d.type==='ENTITY'&&d.body?.entityType==='STUDY_CARD_DAY');
  const dates=[...new Set(drafts.map(d=>d.body.entityId))].sort(),shown=new Map();
  for(const date of dates){const s=await st.flow.state(date);if(s.status==='LOCAL_DRAFT')shown.set(date,shownDay(s,st.ports.latest(date)));}
  if(gone())return st;
  const days=cardView(ctx.getWhole()).days.filter(d=>!shown.has(d.date)).map(d=>({date:d.date,data:d.data}));
  for(const [date,data] of shown)days.push({date,data});
  st.days=days;st.pending=[...shown.keys()];
  return st;
}
// V9FIX M-03: 합치면 한도를 넘어(REJECTED) 쌓이지 않는 동안에도 다른 기기가 쌓은 카드·복습을 보인다(화면 계산만, 쓰기 0). 같은 id는 투영이 겹침으로 뺀다.
function shownDay(s,latest){
  const out=shownCard(s,latest,rebaseCardDay)??s.card;
  if(out!==s.card||!latest?.card)return out;
  const rb=rebaseCardDay({date:s.card.date,base:s.base,mine:s.card,latest:latest.card});
  if(rb.status!=='REJECTED')return out;
  const union=list=>{const mine=new Set(s.card[list].map(x=>x.id));return [...s.card[list],...latest.card[list].filter(x=>!mine.has(x.id))];};
  return {...s.card,cards:union('cards'),reviews:union('reviews')};
}
export const cardsProjection=st=>projectCards(st.days,st.today);
export const cardsDueCount=st=>{try{return cardsProjection(st).due.length;}catch{return null;}};
// 쌓기(앱의 "지금 쌓기"·자동 쌓기·저장 후 종료가 부른다): 초안 날짜마다 confirm 1번.
// V9FIX M-02·M-03: 충돌 알림과 쌓지 못한 이유를 카드 칸 글(st.message)로 남긴다. 돌려주는 값 모양은 그대로.
export async function stackCards(st){
  let stacked=0,failed=0;const codes=[],notes=[],fails=[];
  if(st.stackMessage){st.message=null;st.error=false;st.stackMessage=false;}   // 지난 쌓기 글은 이번 결과로 바꾼다
  for(const date of [...st.pending]){
    try{const r=await st.flow.confirm(date);if(r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED'){stacked++;const t=cardNoticeText(r.notices);if(t)notes.push(date+' · '+t);}else if(r.status!=='NOTHING_TO_CONFIRM'){failed++;codes.push(r.code);fails.push(stackFailText(date,r.code));}}
    catch(e){failed++;codes.push(e?.code);fails.push(stackFailText(date,e?.code));}
  }
  if(fails.length||notes.length){st.message=[...fails,...notes].join(' / ');st.error=fails.length>0;st.stackMessage=true;}
  return {stacked,failed,codes};
}
// 카드가 들어 있는 날짜(만든 날 묶음). 고치기·지우기·살리기는 그 날짜 묶음에 쓴다.
const dateOfCard=(st,id)=>st.days.find(d=>d.data.cards.some(c=>c.id===id))?.date??null;
// V9FIX L-02: 화면을 그린 뒤 자정이 지났으면 지금 날짜(KST) 묶음에 넣는다("내일 첫 복습"이 맞게).
export async function addCard(st,fields){
  const subject=String(fields.subject??'').trim();if(!subject)throw pfail('NO_SUBJECT');
  return st.flow.addRow(st.ports.now?kstDay(st.ports.now()):st.today,'cards',newCardRow({...fields,subject,id:st.ports.newId()}));
}
export async function answerCard(st,cardId,ok,now){return st.flow.addRow(kstDay(now),'reviews',{cardId,doneAt:now,ok});}
// V9FIX M-07: 화면에는 보이지만(다른 기기가 같은 날짜에 쌓음) 이 기기 초안에는 아직 없는 카드는 고치지 않고 알린다("지웠어요"라고 말하지 않음).
async function inDraft(st,d,id){const s=await st.flow.state(d);if(!s.card.cards.some(c=>c.id===id))throw pfail('CARD_NOT_IN_DRAFT');}
export async function removeCard(st,id){const d=dateOfCard(st,id);if(!d)throw pfail('UNKNOWN_CARD');await inDraft(st,d,id);return st.flow.removeRow(d,'cards',id);}
// 다시 살리기(졸업 카드만): 카드에 살린 시각을 적는다 → 그 뒤 복습만 세고 오늘 복습에 다시 나온다(B4b와 같은 원리).
export async function reviveCard(st,id,now){
  const d=dateOfCard(st,id);if(!d)throw pfail('UNKNOWN_CARD');await inDraft(st,d,id);
  const card=st.days.find(x=>x.date===d).data.cards.find(c=>c.id===id);
  return st.flow.updateRow(d,'cards',{...card,revivedAt:now});
}

// ---- DOM ----
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const input=(value='',attrs={})=>{const n=el('input');n.type='text';n.value=value;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const area=(value='',attrs={})=>{const n=el('textarea');n.value=value;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const select=(options,value)=>{const n=el('select');for(const [v,t] of options){const o=el('option',t);o.value=v;n.append(o);}n.value=value;return n;};
  const field=(label,control)=>add(el('label',null,'card-field'),el('span',label,'card-field-label'),control);
  return {el,add,button,input,area,select,field};
}
export const SUBJECT_CHIPS=Object.freeze(['국어','수학','영어','한국사','통합사회','통합과학','생물']);
const KIND_TEXT={WRONG:'오답 카드',CONCEPT:'개념 카드'};
const short=(s,n=60)=>{const a=[...String(s)];return a.length>n?a.slice(0,n).join('')+'…':a.join('');};
// V9FIX L-08: 며칠 밀린 카드는 "오늘 복습 · n일 밀림".
export const stateText=r=>r.graduated?'졸업 · '+kstDay(r.graduatedAt)+' (30일 간격 통과)':(r.due<=r.today?'오늘 복습'+(lateDays(r.due,r.today)?' · '+lateDays(r.due,r.today)+'일 밀림':''):'다음 복습 '+r.due)+' · '+r.interval+'일 간격'+(r.right+r.wrong?' · 맞음 '+r.right+' · 틀림 '+r.wrong:'');

export function renderCards(root,ctx,st){
  const doc=ctx.document??globalThis.document,{el,add,button,input,area,select,field}=maker(doc);
  const act=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;try{await fn();}catch(e){st.message=st.ports?.box?.ERROR_TEXT?.[e?.code]??cardErrorText(e?.code);st.error=true;}await prepareCards(ctx,st);await ctx.rerender();});
  const out=add(el('section',null,'panel study-panel cards-panel'),el('h2',CARD_TEXT.title,'panel-title'));out.id='study-cards';
  let proj=null;try{proj=cardsProjection(st);}catch{proj=null;}
  if(!proj){add(out,el('p','카드 목록을 계산하지 못했어요(기록 값 확인 필요).','notice error'));root.append(out);return out;}
  const today=proj.today,rowsToday=proj.rows.map(r=>({...r,today}));
  if(st.session&&st.session.i>=st.session.ids.length&&!st.session.results.length)st.session=null;   // V9FIX L-06: 답 0개로 끝난 세션은 머리(복습 시작 단추)를 그리기 전에 닫는다
  // 0) 오늘 복습 n장 + 시작(지시서 3)
  const head=add(el('div',null,'cards-head'),add(el('p',null,'cards-due'),el('span',proj.due.length,'cards-due-n'),el('span',proj.due.length?'장 오늘 복습':'장 · 오늘 복습할 카드 없음','cards-due-t')),
    proj.due.length&&!st.session?button('복습 시작',()=>{st.session={ids:proj.due.map(r=>r.id),i:0,back:false,results:[]};st.message=null;void ctx.rerender();},'primary cards-start'):null);
  add(out,head,el('p',CARD_TEXT.sub,'muted small'));
  if(st.message)add(out,el('p',st.message,st.error?'notice error cards-message':'notice cards-message'));
  if(st.pending.length)add(out,el('p','아직 안 쌓은 카드 입력 '+st.pending.length+'일치 · 이 기기에만 있어요 · 위 "지금 쌓기"로 저장 · 공부 카드는 새 기록이라 다른 기기도 최신 앱이어야 보여요','notice cards-pending'));   // V9FIX M-10: 새 종류 안내(쌓기 전마다 한 줄)
  // 1) 복습(한 장씩)
  if(st.session)add(out,renderSession(doc,ctx,st,proj,act));
  // 2) 카드 만들기
  add(out,renderForm(doc,ctx,st,proj,act));
  // 3) 카드 목록(필터·졸업·다시 살리기)
  const f=st.filter,subjects=cardSubjects(proj.rows);
  const fSub=select([['','모든 과목'],...subjects.map(s=>[s,s])],f.subject),fRea=select([['','모든 이유'],...REASONS.map(r=>[r,REASON_TEXT[r]])],f.reason),fKind=select([['','모든 카드'],...CARD_KINDS.map(k=>[k,KIND_TEXT[k]])],f.kind);
  const refilter=()=>{st.filter={...st.filter,subject:fSub.value,reason:fRea.value,kind:fKind.value};void ctx.rerender();};
  for(const s of [fSub,fRea,fKind])s.addEventListener('change',refilter);
  const list=add(el('div',null,'cards-list'),add(el('h3','카드 목록 · 진행 '+proj.active.length+'장 · 졸업 '+proj.graduated.length+'장','panel-title')),
    add(el('div',null,'buttons cards-filter'),field('과목',fSub),field('이유',fRea),field('종류',fKind),
      button(f.graduated?'진행 중 카드 보기':'졸업한 카드 보기 ('+proj.graduated.length+')',()=>{st.filter={...st.filter,graduated:!f.graduated};void ctx.rerender();},'secondary cards-grad-toggle')));
  const shown=filterCards(rowsToday,f);
  if(!proj.rows.length)add(list,el('p',CARD_TEXT.empty,'muted'));
  else if(!shown.length)add(list,el('p',f.graduated?'졸업한 카드가 없어요.':'조건에 맞는 카드가 없어요.','muted'));
  for(const r of shown){
    const c=r.card,tags=[KIND_TEXT[c.kind],c.subject,c.unit||null,...c.reasons.map(x=>REASON_TEXT[x])].filter(Boolean);
    add(list,add(el('div',null,'row cards-row'+(r.graduated?' cards-row-grad':r.due<=today?' cards-row-due':'')),
      add(el('div',null,'row-main'),el('strong',short(c.front||(c.photo?'(사진 문제)':''))),el('p',tags.join(' · '),'muted small'),el('p',stateText(r),'small cards-state')),
      add(el('div',null,'buttons'),r.graduated?button('다시 살리기',act(async()=>{await reviveCard(st,c.id,ctx.now());st.message='다시 살렸어요 · 오늘 복습에 나와요(임시 입력).';}),'primary'):null,
        button('삭제',()=>{if(ctx.confirmDialog?.('이 카드를 지울까요? 쌓은 뒤에도 이력에는 남아요.')??true)void act(async()=>{await removeCard(st,c.id);st.message='카드를 지웠어요(임시 입력).';})();}))));
  }
  add(out,list,el('p',CARD_TEXT.stack,'muted small cards-stack-note'));
  if(proj.duplicates.length)add(out,el('p','같은 번호가 겹친 항목 '+proj.duplicates.length+'건은 계산에서 뺐어요.','muted small'));
  root.append(out);
  return out;
}
function renderSession(doc,ctx,st,proj,act){
  const {el,add,button}=maker(doc),s=st.session,box=el('div',null,'cards-session');
  if(s.i>=s.ids.length){
    if(!s.results.length){st.session=null;return null;}   // V9FIX L-06: 하나도 답하지 않고 그만하면 요약 없이 닫는다
    const sum=sessionSummary(s.results,proj);
    add(box,el('h3','복습 끝 · 요약','panel-title'),
      add(el('div',null,'cards-sum'),add(el('p',null,'cards-sum-n'),el('strong',sum.right),el('span',' 맞음')),add(el('p',null,'cards-sum-n cards-sum-bad'),el('strong',sum.wrong),el('span',' 틀림')),sum.graduated?add(el('p',null,'cards-sum-n'),el('strong',sum.graduated),el('span',' 졸업')):null),
      ...sum.next.map(n=>el('p','다음 복습 '+n.date+' · '+n.n+'장','small')),
      el('p','결과는 이 기기에 모였어요 · 쌓기 한 번에 저장돼요.','muted small'),
      button('닫기',()=>{st.session=null;void ctx.rerender();},'primary'));
    return box;
  }
  // V9FIX M-01: 지운 카드, 이미 복습일이 아닌 카드(다른 기기·다른 세션에서 오늘 이미 맞힘), 졸업 카드는 건너뛴다. L-03: 건너뛴 만큼 분모에서도 뺀다.
  const row=proj.rows.find(r=>r.id===s.ids[s.i]);
  if(!row||row.graduated||row.due>proj.today){s.ids=s.ids.filter((_,k)=>k!==s.i);return renderSession(doc,ctx,st,proj,act);}
  const c=row.card;
  add(box,add(el('div',null,'cards-session-top'),el('span',(s.i+1)+' / '+s.ids.length,'cards-count'),el('span',[c.subject,c.unit].filter(Boolean).join(' · '),'cards-subj'),button('그만하기',()=>{st.session={...s,ids:s.ids.slice(0,s.i)};void ctx.rerender();},'secondary cards-stop')),
    el('p',c.kind==='WRONG'?'문제':'앞면','cards-side-label'),c.front?el('p',c.front,'cards-front'):null,c.photo&&st.photos?photoView(doc,st.photos,c.photo):null);
  if(!s.back)add(box,button(c.kind==='WRONG'?'정답 보기':'뒷면 보기',()=>{s.back=true;void ctx.rerender();},'primary cards-flip'));
  else{
    if(c.kind==='WRONG')add(box,c.mine?add(el('p',null,'cards-mine'),el('span','내 답 ','cards-side-label'),el('span',c.mine)):null,add(el('p',null,'cards-back'),el('span','정답 ','cards-side-label'),el('span',c.back||'(적지 않음)')),
      c.reasons.length?el('p','틀린 이유: '+c.reasons.map(x=>REASON_TEXT[x]).join(' · '),'small'):null);
    else add(box,el('p','뒷면','cards-side-label'),el('p',c.back,'cards-back'));
    const answer=ok=>act(async()=>{const now=ctx.now();await answerCard(st,c.id,ok,now);s.results.push({cardId:c.id,ok});s.i++;s.back=false;});
    add(box,add(el('div',null,'buttons cards-answer'),button('✓ 맞음',answer(true),'primary cards-ok'),button('✗ 틀림',answer(false),'secondary cards-bad')),
      el('p','맞음 → '+(row.stage===CARD_LADDER.length-1?'졸업':CARD_LADDER[row.stage+1]+'일 뒤')+' · 틀림 → 1일 뒤','muted small'));
  }
  return box;
}
function renderForm(doc,ctx,st,proj,act){
  const {el,add,button,input,area,field}=maker(doc),form=st.form,kind=st.kind,box=el('div',null,'cards-form');
  add(box,add(el('div',null,'buttons cards-kind'),...CARD_KINDS.map(k=>{const b=button(KIND_TEXT[k],()=>{st.kind=k;void ctx.rerender();},k===kind?'primary':'secondary');b.setAttribute('aria-pressed',String(k===kind));return b;})));
  const subj=input(form.subject??'',{maxlength:String(MAX_SUBJECT),placeholder:'과목(직접 입력 가능)'}),unit=input(form.unit??'',{maxlength:String(MAX_UNIT),placeholder:'단원(직접 입력)'});
  const keep=()=>{form.subject=subj.value;form.unit=unit.value;};
  const chips=add(el('div',null,'buttons cards-chips'),...[...new Set([...cardSubjects(proj.rows),...SUBJECT_CHIPS])].slice(0,10).map(name=>{const b=button(name,()=>{subj.value=name;keep();void ctx.rerender();},subj.value===name?'primary cards-chip':'secondary cards-chip');b.setAttribute('aria-pressed',String(subj.value===name));return b;}));
  for(const n of [subj,unit])n.addEventListener('input',keep);
  add(box,field('과목',subj),chips,field('단원',unit));
  if(kind==='WRONG'){
    const q=area(form.front??'',{maxlength:String(MAX_FRONT),rows:'3',placeholder:'문제(글) — 사진으로 대신해도 돼요'}),mine=input(form.mine??'',{maxlength:String(MAX_MINE),placeholder:'내 답'}),right=input(form.back??'',{maxlength:String(MAX_BACK),placeholder:'정답'});
    const keepW=()=>{form.front=q.value;form.mine=mine.value;form.back=right.value;};for(const n of [q,mine,right])n.addEventListener('input',keepW);
    const file=el('input');file.type='file';file.setAttribute('accept','image/*');file.setAttribute('capture','environment');file.className='cards-file';
    // V9FIX M-04: 다시 고르면 앞 사진(아직 어느 카드에도 없음)은 이 기기 저장소에서 지운다. "사진 빼기"도 같다.
    file.addEventListener('change',()=>{const fl=file.files?.[0];if(!fl)return;void act(async()=>{keepW();const shrunk=await shrinkPhoto(fl,doc),old=form.photo;form.photo=await st.photos.put(shrunk.bytes,shrunk);if(old)await st.photos.delete?.(old.ref).catch(()=>false);st.message='사진을 이 기기에 넣었어요('+form.photo.w+'×'+form.photo.h+' · '+form.photo.kb+'KB).';})();});
    const reasons=add(el('div',null,'buttons cards-chips cards-reasons'),...REASONS.map(r=>{const on=form.reasons.includes(r),b=button(REASON_TEXT[r],()=>{keepW();form.reasons=on?form.reasons.filter(x=>x!==r):[...form.reasons,r];void ctx.rerender();},on?'primary cards-chip':'secondary cards-chip');b.setAttribute('aria-pressed',String(on));return b;}));
    add(box,field('문제',q),add(el('div',null,'cards-photo-pick'),field('사진(카메라·파일)',file),form.photo?add(el('p','사진 1장 넣음 · '+form.photo.w+'×'+form.photo.h+' · '+form.photo.kb+'KB','small'),button('사진 빼기',()=>{const old=form.photo;form.photo=null;void Promise.resolve(old&&st.photos?.delete?.(old.ref)).catch(()=>false).finally(()=>ctx.rerender());},'secondary')):el('p','사진은 이 기기에만 저장돼요(긴 변 1280px로 줄임 · 400KB까지).','muted small')),
      field('내 답',mine),field('정답',right),el('span','틀린 이유','card-field-label'),reasons);
  }else{
    const front=area(form.front??'',{maxlength:String(MAX_FRONT),rows:'2',placeholder:'앞면(질문·용어)'}),back=area(form.back??'',{maxlength:String(MAX_BACK),rows:'3',placeholder:'뒷면(답·설명)'});
    const keepC=()=>{form.front=front.value;form.back=back.value;};for(const n of [front,back])n.addEventListener('input',keepC);
    add(box,field('앞면',front),field('뒷면',back));
  }
  add(box,button('카드 넣기',act(async()=>{
    keep();await addCard(st,{kind,subject:form.subject,unit:form.unit,front:form.front,back:form.back,mine:form.mine,reasons:form.reasons,photo:kind==='WRONG'?form.photo:null});
    st.form={subject:form.subject,unit:form.unit,reasons:[],photo:null};st.message=KIND_TEXT[kind]+'를 넣었어요 · 내일 첫 복습(임시 입력).';
  }),'primary cards-add'));
  return box;
}
// 오늘 화면 작은 칸(지시서 3): "공부 카드 · 오늘 복습 n장" + 복습하기.
export function renderCardsToday(doc,st,open){
  const {el,add,button}=maker(doc),n=cardsDueCount(st);
  if(n===null)return null;
  const box=add(el('section',null,'panel cards-today'),add(el('div',null,'cards-today-main'),el('span','공부 카드','cards-today-k'),el('strong',dueLine(n),'cards-today-n')),
    button(n?'복습하기':'카드 보기',()=>open(n>0),n?'primary cards-today-go':'secondary cards-today-go'));
  box.id='cards-today';return box;
}
// V9FIX L-07: 복습이 진행 중이면(아직 끝나지 않음) 새로 시작하지 않고 이어 간다(앞 답이 요약에서 빠지지 않게).
export function startSession(st){if(st.session&&st.session.i<st.session.ids.length)return true;let proj;try{proj=cardsProjection(st);}catch{return false;}if(!proj.due.length)return false;st.session={ids:proj.due.map(r=>r.id),i:0,back:false,results:[]};return true;}
