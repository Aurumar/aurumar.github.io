// V9B 받은편지함 칸(소유자 "받은편지함 승인" 2026-11-14). PC 앱(APP_SHELL)에서만: host가 고정 파일 하나(AURUMAR_HQ\state\inbox_candidates.json, user-app/inbox-reader.mjs)를 읽기 전용으로 읽어 넘긴다.
// 오늘 화면 칸 "받은 일정 n개 · 넣을까?": [넣기] = 일정(EVENT) 1건 저장(기존 일정 저장 길, 일정 1건 = 연산 1), [무시] = 그 id를 이 기기 설정에 적어 다시 안 보임(기록 쓰기 0).
// 파일이 없거나(exists:false) 읽지 못하면 칸이 없다. Fold·iPad·브라우저는 APP_SHELL이 아니라 아무것도 하지 않는다(읽기 요청도 없음).
// 다시 안 보이는 것: 무시한 id, 이 기기에서 넣은 id, 이미 같은 날짜·같은 제목 일정이 있는 항목(다른 기기에서 넣은 것), 오늘(KST)보다 지난 날짜.
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음). 글은 제목·날짜·시각·출처만. 넣은 뒤에는 기록을 다시 읽으며 한 번만 다시 그린다(ctx.reload, 없으면 rerender).
export const INBOX_ROUTE='/api/inbox-candidates';
export const INBOX_SEEN_KEY='lb.inbox.seen.v1',INBOX_SEEN_MAX=500;
export const SOURCE_TEXT=Object.freeze({gmail:'메일',calendar:'캘린더'});
// 이 기기 설정: 다시 안 보일 id 목록(무시·넣음). 저장소가 막혀 있으면 이번 실행 동안만.
const memorySeen=new Set();
export function readSeen(storage){
  try{const v=JSON.parse(storage?.getItem(INBOX_SEEN_KEY)??'[]');return new Set([...(Array.isArray(v)?v.filter(x=>typeof x==='string'):[]),...memorySeen]);}catch{return new Set(memorySeen);}
}
export function markSeen(storage,id){
  memorySeen.add(id);
  try{const cur=[...readSeen(storage)].filter(x=>x!==id);cur.push(id);storage?.setItem(INBOX_SEEN_KEY,JSON.stringify(cur.slice(-INBOX_SEEN_MAX)));}catch{/* 이번 실행 동안만 */}
}
// 보일 항목(순수): items = host가 넘긴 항목, events = 지금 일정 목록([{date,title,deleted}]), today = KST 날짜.
// V9FIX L-26: 같은 제목 비교는 NFC·공백 한 칸·대소문자 무시.
export const titleKey=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
export function inboxShown(items,{seen=new Set(),events=[],today}){
  const have=new Set(events.filter(e=>!e.deleted).map(e=>e.date+'|'+titleKey(e.title)));
  return (items??[]).filter(x=>x.date>=today&&!seen.has(x.id)&&!have.has(x.date+'|'+titleKey(x.title))).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.time??'')<(b.time??'')?-1:(a.time??'')>(b.time??'')?1:a.id<b.id?-1:1);
}
// 넣을 일정 본문(whole-life-model EVENT 모양 그대로). 시각이 없으면 종일. 종류는 약속(APPOINTMENT), 메모 첫 줄 = 출처 표시.
export function eventFromItem(x){
  return {title:x.title,domain:null,date:x.date,time:x.time??null,allDay:x.time===null,kind:'APPOINTMENT',planId:null,milestoneId:null,recurrence:null,notes:'[받은 일정] '+(SOURCE_TEXT[x.source]??'')+' 후보에서 넣음',deleted:false};
}
export function createInboxState(){return {loaded:false,items:[],busy:false,message:null,error:false,at:0,generatedAt:null,skipped:0};}
export const INBOX_REFRESH_MS=10*60000;
// V9FIX L-25: 목록이 만들어진 지 36시간이 넘으면 "n일 전 목록"을 알린다.
export const INBOX_STALE_MS=36*3600000;
// V9FIX M-12: 결과를 모르는 저장. 같은 후보를 다시 넣으면 일정이 2건 생길 수 있어 그 후보를 숨기고(확인 대기) 앱 공통 안내로 넘긴다.
export const INBOX_UNKNOWN_CODES=Object.freeze(['MD_PENDING_RECONCILE_REQUIRED','HOLD_UNKNOWN_SAVE']);
// 읽기(PC 앱만). 실패는 칸이 없는 것과 같다(오류를 화면에 띄우지 않음). 다시 읽으면 지난 [넣기] 결과 문구는 지운다(V9FIX M-11).
export async function loadInbox(ctx,st){
  st.message=null;st.error=false;
  if(ctx.surface!=='APP_SHELL'){st.loaded=true;st.items=[];return st;}
  try{const r=await ctx.request({});st.items=r?.exists?r.items??[]:[];st.generatedAt=r?.exists?r.generatedAt??null:null;st.skipped=r?.exists&&Number.isInteger(r.skipped)?r.skipped:0;}catch{st.items=[];st.generatedAt=null;st.skipped=0;}
  st.loaded=true;st.at=Date.now();return st;
}
// V9FIX L-22: 올해가 아니면 연도를 붙인다.
const dayText=(d,today)=>(today&&d.slice(0,4)!==today.slice(0,4)?d.slice(0,4)+'/':'')+Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
export function renderInboxToday(ctx,st){
  if(ctx.surface!=='APP_SHELL'||!st.loaded)return null;
  const doc=ctx.document??globalThis.document,today=ctx.today(),shown=inboxShown(st.items,{seen:readSeen(ctx.storage),events:ctx.events(),today});
  if(!shown.length)return null;   // V9FIX M-11: 다 처리하면(남은 후보 0개) 칸을 숨긴다
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const box=add(el('section',null,'panel inbox-today'),add(el('h2',null,'panel-title inbox-title'),el('span','받은 일정 '),el('strong',shown.length+'개','inbox-n'),el('span',' · 넣을까?')));box.id='inbox-today';
  if(st.message)add(box,el('p',st.message,st.error?'notice error inbox-message':'notice inbox-message'));
  for(const x of shown.slice(0,8)){
    // V9FIX M-12: 입력 검사 오류(INVALID_…)만 이 칸에서 끝내고, 그 밖의 오류는 앱 공통 처리(fail)로 넘긴다. 결과 모름이면 그 후보를 숨긴다(다시 눌러 2건이 되지 않게).
    // V9FIX L-27: 임시 저장(LOCAL_DRAFT)이면 "임시 저장"이라고 말한다.
    const put=button('넣기',()=>void ctx.perform(async()=>{st.message=null;st.error=false;let r;try{r=await ctx.addEvent(eventFromItem(x));}catch(e){const code=typeof e?.code==='string'?e.code:null,unknown=INBOX_UNKNOWN_CODES.includes(code);
      if(unknown)markSeen(ctx.storage,x.id);
      st.message=unknown?'저장 결과를 아직 몰라요 · 같은 일정이 두 번 생기지 않게 이 후보는 숨겼어요 · 일정 화면에서 확인하세요':'일정에 넣지 못했어요'+(code?' · 문의 코드 ▾⁠'+code+'⁠':'');st.error=true;await ctx.rerender();if(code&&!code.startsWith('INVALID_'))throw e;return;}
      markSeen(ctx.storage,x.id);st.message=(r?.status==='LOCAL_DRAFT'?'일정을 임시 저장했어요 · ':'일정에 넣었어요 · ')+dayText(x.date,today)+' '+x.title;await (ctx.reload??ctx.rerender)();}),'primary inbox-put');
    const skip=button('무시',()=>{markSeen(ctx.storage,x.id);st.message=null;void ctx.rerender();},'secondary inbox-skip');
    put.setAttribute('aria-label',x.title+' 일정에 넣기');skip.setAttribute('aria-label',x.title+' 무시(다시 안 보임)');
    const row=add(el('div',null,'row inbox-row'),add(el('div',null,'row-main'),el('strong',x.title),el('p',dayText(x.date,today)+(x.time?' '+x.time:' · 종일')+' · '+(SOURCE_TEXT[x.source]??''),'muted small')),add(el('div',null,'buttons'),put,skip));
    row.dataset.inboxId=x.id;add(box,row);
  }
  if(shown.length>8)add(box,el('p','나머지 '+(shown.length-8)+'개는 앞의 것을 정리하면 보여요.','muted small'));
  const age=st.generatedAt?Date.now()-Date.parse(st.generatedAt):0;
  if(age>INBOX_STALE_MS)add(box,el('p',Math.floor(age/86400000)+'일 전 목록이에요 · 비서단이 새 목록을 아직 만들지 않았어요.','muted small inbox-stale'));   // V9FIX L-25
  if(st.skipped>0)add(box,el('p','형식이 달라 건너뛴 후보 '+st.skipped+'개','muted small inbox-skipped'));   // V9FIX L-23
  add(box,el('p','비서단이 매일 아침 메일·캘린더에서 고른 후보(제목·날짜만)예요 · 무시는 이 기기에만 기억해요.','muted small inbox-note'));
  return box;
}
