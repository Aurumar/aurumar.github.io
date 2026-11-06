// 카드 초안 상자(B3c). 브라우저(Fold 크롬·iPad)처럼 봉인 초안 저널(drafts.lbd)이 없는 표면에서 건강(HLT_DAY)·공부(STUDY_DAY) 카드 초안을
// 이 기기의 IndexedDB에 암호문으로 남긴다. 새로고침·탭 종료·서비스 워커 갱신 뒤에도 이어 쓸 수 있게 하는 것이 목적이다(연산 0).
// 불러오는 모듈 없음(단독 파일). indexedDB·crypto·시계·id·scope는 주입한다(시험은 가짜 IndexedDB와 Node webcrypto를 꽂는다).
// - DB LIFE_BRICK_CARD_DRAFTS_V1: 스토어 keys(비추출 AES-GCM 256 키 1개, CryptoKey 객체 그대로), drafts(keyPath id).
// - 레코드 id = scope|kind|date(날짜·종류당 1건). 겉에는 scope·kind·date·rev·kid·시각만 있고, 카드 내용·라벨·횟수는 암호문 안에만 있다.
//   쓸 때마다 새 IV(12바이트). AAD = LB_CARD_DRAFT_1|scope|kind|date|rev → 다른 레코드로 바꿔치기하거나 rev를 바꾸면 복호화가 실패한다.
// - 쓰기: readwrite + durability 'strict', tx.oncomplete 뒤에만 저장됨. 같은 id는 CAS: 내가 읽은(또는 쓴) 레코드의 rev와 IV가 디스크 원값과
//   둘 다 같아야 쓴다(다르면 STALE_DRAFT). IV는 쓸 때마다 새 무작위값이라 지우고 다시 만든 rev1(ABA)도 구분된다(B3f, 겉 필드·AAD 불변).
//   STALE 뒤에는 디스크의 최신 rev·IV를 기억하되 다른 창 초안을 자동으로 덮지 않는다(이 창 입력은 메모리에 두고 실패 표시). 다음 입력이 그 위에 쓴다.
//   FIX34 (HUNT34 H1): 흐름이 port.mergeWith로 합치는 법을 알려 준 포트는 "그 위에 쓰기" 전에 디스크 초안을 다시 읽어 항목 id 단위로 합친다(다른 창 입력을 지우지 않음).
//   합칠 수 없으면 쓰지 않고 CARD_DRAFT_MERGE_FAILED로 알린다(디스크 그대로). mergeWith를 부르지 않은 포트(시험의 맨 포트)만 예전처럼 덮어쓴다. 앱의 세 흐름은 모두 부른다.
// - 열 수 없는 레코드(키 없음·손상)는 UNREADABLE로 보존하고 지우지 않는다. 같은 날짜에 새 초안을 쓰면 옛 암호문은 UNREADABLE|… 로 옮겨 둔다
//   (옛 rev가 안전한 정수 ≥1이 아니면 새 rev는 1부터).
// - 한도: 전체 60건, 레코드 암호문 96KB. 넘으면 새 초안을 거부한다(조용히 지우거나 줄이지 않는다). 자동 만료 없음(14일 넘으면 표시만).
// - 쓰기 실패(QuotaExceededError 등)는 저장됨으로 말하지 않는다: 메모리 사본을 유지하고 failed를 세운 뒤 다음 저장 때 다시 쓴다.
//   거부된 입력(96KB·60건·읽기 전용·잠김, 디바운스 안에서 던진 오류)도 기록해 flush가 던지고 failed로 보인다(화면이 오류를 삼켜도).
//   실패 표시는 입력 세대(defer·직접 save 1번마다 +1)를 기억하고 더 새 세대의 저장 성공만 지운다(늦게 끝난 옛 입력이 새 실패를 지우지 않음, B3h).
//   같은 날짜 입력이 겹쳐 돌 때의 save·discard는 입력이 끝날 때 주인을 정한다: 늦게 거절된 옛 입력은 이미 저장된 새 입력을 실패로 바꾸지 않는다(B3i).
//   로드 실패는 다음 호출에서 다시 읽는다. 메모리 사본이 60건이면 거부 전에 디스크를 다시 읽어 센다(다른 창이 지웠을 수 있음, B3i).
//   같은 칸(디바운스 키)의 더 새 입력이 저장·삭제된 뒤 늦게 끝난 옛 입력의 save는 mem·디스크를 바꾸지 않는다(마지막 입력이 이김). 한 입력이 도는 동안의
//   다른 호출은 직접 호출로 보고 자기 세대로 판정한다. 잠긴 뒤의 flush도 남은 실패를 던진다(B14).
//   B16: defer(key,fn,{owned:true})의 콜백은 입력 토큰을 인자로 받고, save·discard에 {input:토큰}으로 넘긴다 → 그 호출의 주인·세대는 그 실행으로
//   정확히 정해진다(도는 입력들로 추론하지 않음). 토큰 없는 호출은 직접 호출(호출 순간의 새 세대)이다. owned가 아닌 콜백만 예전 추론(B3i·B14)을 쓴다.
//   카드 전체를 쓰는 저장이 어느 초안 위에서 계산됐는지 {base:draftId|null}로 주면, 그 사이 다른 칸·직접 호출로 초안이 바뀌었을 때 쓰지 않고
//   CARD_DRAFT_STALE_BASE를 던진다(흐름이 최신 카드 위에 다시 계산, 독립 항목 보존). base 없는 토큰 저장은 그 날짜에 더 새 세대가 이미 저장됐으면 쓰지 않는다.
//   다시 계산을 끝내 포기한 입력은 그 칸의 실패로 남고(다른 칸 성공으로 지워지지 않음) 같은 칸의 더 새 입력이 저장돼야 지워진다.
// - B18: defer는 기본이 owned다(콜백은 언제나 입력 토큰을 받는다). 옛 추론(B3i·B14)은 상자를 legacyDeferInference:true로 만든 시험에서만 쓴다(앱 코드 금지).
//   명시적으로 넘긴 토큰이 지금 도는 이 상자의 그 날짜 실행이 아니면(끝남·다른 상자·다른 날짜) CARD_DRAFT_STALE_INPUT으로 거절하고 mem·디스크를 바꾸지 않는다
//   (토큰을 넘기지 않은 호출(undefined·null)만 직접 호출). 흐름이 저장·삭제 없이 끝낸 입력(값이 같음)은 keep으로 그 칸의 최신 세대가 되어 늦은 옛 입력을 막는다.
//   같은 칸의 더 새 입력이 이미 받아들여졌으면 늦게 끝난 옛 입력의 sticky 실패는 기록하지 않는다.
// - 쓰기 트랜잭션 안에서 디스크의 현재 키 kid를 다시 본다. 다른 창이 키를 새로 만들었으면 쓰지 않고 실패(CARD_DRAFT_KEY_CHANGED) → 새 키로
//   다시 읽는다. 옛 키 암호문은 지우지 않는다(같은 날짜를 다시 쓰면 UNREADABLE|… 로 옮김). (B3h)
// 보안 한계(정직하게): 키는 같은 브라우저 프로필 안에 있어 프로필 파일을 가진 사람에게는 저장된 로그인 세션과 같은 수준의 보호다. 앱 잠금이 암호문을 막지는 않는다.
export const CARD_DRAFT_DB='LIFE_BRICK_CARD_DRAFTS_V1';
export const CARD_DRAFT_FORMAT='LB_CARD_DRAFT_1';
export const CARD_DRAFT_KINDS=Object.freeze(['HLT_DAY','STUDY_DAY','LIFE_DAY']);
export const CARD_DRAFT_LIMITS=Object.freeze({records:60,recordBytes:96*1024});
export const CARD_DRAFT_EVENT='lb:card-drafts-changed';
export const CARD_DRAFT_DEBOUNCE_MS=600;
export const OLD_DRAFT_DAYS=14;
export const DRAFT_MODE=Object.freeze({JOURNAL:'JOURNAL',DEVICE_BOX:'DEVICE_BOX',MEMORY:'MEMORY'});
export const CARD_DRAFT_TEXT=Object.freeze({
  typing:'입력 중 (아직 저장 전)',
  saved:'이 기기에 암호화 저장됨 · 아직 금고에 없음 · 다른 기기에서는 안 보임',
  confirmed:'저장 및 동기화 확인됨',
  merged:'다른 기기에서 바뀐 내용이 있어 합쳤어요',
  modeBox:'초안은 이 기기(브라우저)에 암호화되어 남습니다 · 브라우저 저장소를 지우면 사라짐 · 백업 아님 · 다른 기기에서는 안 보임.',
  failed:'초안을 저장하지 못했어요 — 이 화면을 닫으면 사라져요',
  resume:'이 기기에 저장된 초안이 있어요',resumeKeep:'이어서 쓰기',resumeDrop:'버리기',
  dropConfirm:'이 기기에 저장된 초안을 버릴까요? 금고에 쌓인 기록에는 영향이 없습니다.',
  old:'오래된 초안(14일 넘음)',
  unreadable:'열 수 없는 초안이 이 기기에 보존되어 있어요(지우지 않았어요). 브라우저 저장소의 키가 바뀌었거나 손상되었을 수 있어요.',
});
export const deviceOnlyLine=n=>'이 기기에만 있는 초안 '+n+'건';
export const CARD_DRAFT_ERROR_TEXT=Object.freeze({
  CARD_DRAFT_LIMIT:'이 기기의 초안이 60건이라 새 날짜 초안을 저장하지 않았어요. 지우거나 줄이지 않았어요 · 오래된 초안을 쌓거나 버린 뒤 다시 하세요.',
  CARD_DRAFT_TOO_LARGE:'초안이 너무 커서(96KB) 저장하지 않았어요 · 메모나 항목을 줄인 뒤 다시 하세요.',
  CARD_DRAFT_READ_ONLY:'이 창은 읽기 전용이라 초안을 저장하지 않아요 · 기록하는 창에서 입력하세요.',
  CARD_DRAFT_LOCKED:'잠겨 있어 초안을 저장하지 않았어요.',
  STALE_DRAFT:'다른 창에서 같은 날짜 초안이 바뀌어 저장하지 못했어요 — 이 화면을 닫으면 사라져요',
  CARD_DRAFT_MERGE_FAILED:'다른 창의 같은 날짜 초안과 합치지 못해 이 입력을 저장하지 않았어요 · 다른 창 초안은 그대로예요 — 이 화면을 다시 연 뒤 다시 입력해 주세요',
  CARD_DRAFT_STALE_BASE:'그 사이 초안이 바뀌어 이 입력을 저장하지 못했어요 — 다시 입력해 주세요',
  CARD_DRAFT_STALE_INPUT:'이미 끝난 입력이라 저장하지 않았어요 — 다시 입력해 주세요',
});

const KEY_ID='key',UNREADABLE_PREFIX='UNREADABLE|',FLUSH_ROUNDS=8;
const SCOPE_RE=/^v1:[A-Za-z0-9_-]{1,128}:[A-Za-z0-9_-]{1,128}$/,DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const fail=code=>Object.assign(new Error(code),{code});
const usableKey=k=>!!k&&typeof k==='object'&&k.type==='secret'&&k.extractable===false&&k.algorithm?.name==='AES-GCM'&&k.algorithm.length===256&&Array.isArray(k.usages)&&k.usages.includes('encrypt')&&k.usages.includes('decrypt');
const confirmedStatus=s=>s==='LOCAL_SAVED'||s==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED';
// CAS 기준값: 디스크 레코드의 rev·IV 원값(손상값도 그대로 비교). 레코드가 없으면 null.
const baseOf=row=>row?{rev:row.rev,iv:row.iv}:null;
const bytesOf=v=>ArrayBuffer.isView(v)?new Uint8Array(v.buffer,v.byteOffset,v.byteLength):v instanceof ArrayBuffer?new Uint8Array(v):null;
const sameVal=(a,b)=>{const x=bytesOf(a),y=bytesOf(b);if(x||y)return !!x&&!!y&&x.length===y.length&&x.every((v,i)=>v===y[i]);if(Object.is(a,b))return true;try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}};
const sameBase=(cur,base)=>cur==null?base==null:base!=null&&sameVal(cur.rev,base.rev)&&sameVal(cur.iv,base.iv);
const nextRev=base=>Number.isSafeInteger(base?.rev)&&base.rev>=1&&base.rev<Number.MAX_SAFE_INTEGER?base.rev+1:1;

// 금고(프로필) 구분값: 상태의 selected 프로필이 가진 accountId·vaultId. 없으면 null(→ 상자를 쓰지 않고 메모리 초안).
export function cardDraftScope(status){
  const p=Array.isArray(status?.profiles)?status.profiles.find(x=>x&&x.id===status.selected):null;
  if(typeof p?.accountId!=='string'||typeof p?.vaultId!=='string')return null;
  const scope='v1:'+p.accountId+':'+p.vaultId;
  return SCOPE_RE.test(scope)?scope:null;
}

export function createCardDraftBox({indexedDB:idb=globalThis.indexedDB,crypto:cr=globalThis.crypto,scopeId,now=()=>new Date().toISOString(),newId=null,
  locks=globalThis.navigator?.locks??null,canWrite=()=>true,unlocked=()=>true,emit=null,timers=null,debounceMs=CARD_DRAFT_DEBOUNCE_MS,legacyDeferInference=false}={}){
  const ids=newId??(()=>Array.from(cr.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join(''));
  const setT=timers?.set??((f,ms)=>setTimeout(f,ms)),clearT=timers?.clear??(t=>clearTimeout(t));
  const mem=new Map(),unreadable=new Map(),deferred=new Map(),inflight=new Set(),listeners=new Set(),inputFail=new Map(),localLocks=new Map();
  // B14: wrote = 디바운스 키(칸)별로 받아들여진 저장의 입력 세대. 같은 칸의 더 새 입력이 저장된 뒤 늦게 온 옛 입력의 save는 mem·디스크를 바꾸지 않는다(R2-D1).
  const running=new Set(),okGen=new Map(),calls=new Set(),wrote=new Map();
  // B16: owners = 입력 토큰 → 그 실행(owned 콜백만). accepted = 날짜(pfx)별로 받아들여진 저장·삭제 중 가장 새 세대(토큰·직접 호출만 센다).
  const owners=new WeakMap(),accepted=new Map();
  // R33B (HUNT32 D1): 레코드(id)별 마지막 쓰기 실패 코드. 상자 전체 failure와 달리 그 레코드의 쓰기가 성공하면 지운다(statusFor().own).
  const recFail=new Map();
  let loaded=null,ready=false,keyCache=null,otherRows=0,failure=null,chain=Promise.resolve(),ver=0,inputGen=0,doneSeq=0;
  // S1c: lock() 뒤 새로 시작하는 list·count·save·discard·commit·flush는 디스크를 읽거나 쓰지 않는다(복호 사본·키 캐시를 다시 만들지 않음).
  // lock() 전에 시작한 호출(ops)은 끝까지 가고, lock은 그것들이 끝난 뒤 메모리 사본을 버린다. 다시 unlocked()가 참이 되면 풀린다.
  let locked=false;const ops=new Set();
  const isLocked=()=>{if(locked&&unlocked())locked=false;return locked;};
  const track=p=>{ops.add(p);const done=()=>ops.delete(p);p.then(done,done);return p;};
  const tracked=fn=>(...a)=>track(fn(...a));

  const available=()=>Boolean(idb&&typeof idb.open==='function'&&cr?.subtle&&typeof cr.getRandomValues==='function'&&typeof scopeId==='string'&&SCOPE_RE.test(scopeId));
  const aad=(kind,date,rev)=>enc.encode(CARD_DRAFT_FORMAT+'|'+scopeId+'|'+kind+'|'+date+'|'+rev);
  const live=()=>[...mem.values()].filter(e=>!e.deleted);
  const countNow=()=>ready?live().length:null;
  // 저장하지 못한 입력: 키 = 디바운스 키(kind|date|칸) 또는 kind|date|(직접 save가 거부) → {code,gen}. gen은 그 입력의 세대.
  // 같은 날짜에서 그 세대 이상인 입력의 저장이 받아들여지면 지운다(okGen = 날짜별 마지막 성공 세대, 그보다 옛 실패는 기록하지 않음).
  const pfxOf=key=>key.split('|',2).join('|')+'|';
  const inputFor=(kind,date)=>{for(const [k,c] of inputFail)if(k.startsWith(kind+'|'+date+'|'))return c.code;return null;};
  const firstInput=()=>inputFail.values().next().value?.code??null;
  // B16: sticky = 그 입력의 변경이 어디에도 저장되지 않은 실패(다시 계산 포기). 다른 칸·직접 저장의 성공으로는 지우지 않고, 같은 칸의 더 새 입력이 저장돼야 지운다.
  // B18 (H13-N03): sticky라도 같은 칸의 더 새 입력이 이미 받아들여졌으면(wrote) 기록하지 않는다(디스크 값과 표시 일치).
  const markFail=(key,code,gen,sticky=false)=>{if(sticky?(wrote.get(key)??0)>gen:(gen<(okGen.get(pfxOf(key))??0)||(inputFail.get(key)?.gen??0)>gen))return;inputFail.set(key,{code,gen,sticky});};
  // only가 있으면 그 칸만 지운다(저장 없이 끝난 입력), 없으면 그 날짜 전체(저장이 받아들여짐).
  const markOk=(pfx,gen,only=null)=>{
    if(!only)okGen.set(pfx,Math.max(okGen.get(pfx)??0,gen));
    for(const [k,c] of [...inputFail])if((only?k===only:k.startsWith(pfx))&&c.gen<=gen&&(!c.sticky||(wrote.get(k)??0)>c.gen))inputFail.delete(k);
  };
  function notify(){
    const count=countNow()??0;
    for(const f of listeners){try{f({count});}catch{/* 화면 쪽 오류가 저장을 막지 않는다 */}}
    try{if(emit)emit(CARD_DRAFT_EVENT,{count});else if(typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent(new globalThis.CustomEvent(CARD_DRAFT_EVENT,{detail:{count}}));}catch{/* 알림 실패는 무시 */}
  }

  // ---- IndexedDB(콜백만, 트랜잭션 안에서 await 없음) ----
  const openDb=()=>new Promise((ok,no)=>{
    let r;try{r=idb.open(CARD_DRAFT_DB,1);}catch(e){no(e);return;}
    r.onupgradeneeded=()=>{r.result.createObjectStore('keys',{keyPath:'id'});r.result.createObjectStore('drafts',{keyPath:'id'});};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error??fail('CARD_DRAFT_IDB_OPEN'));r.onblocked=()=>no(fail('CARD_DRAFT_IDB_BLOCKED'));
  });
  const run=(db,stores,mode,body)=>new Promise((ok,no)=>{
    let tx,out,cause=null;
    try{tx=mode==='readwrite'?db.transaction(stores,mode,{durability:'strict'}):db.transaction(stores,mode);}catch(e){no(e);return;}
    const stop=e=>{cause??=e;try{tx.abort();}catch{/* 이미 끝남 */}};
    tx.oncomplete=()=>ok(out);tx.onabort=()=>no(tx.error?.name==='QuotaExceededError'?tx.error:cause??tx.error??fail('CARD_DRAFT_IDB_ABORT'));tx.onerror=()=>{};   // B2C (DEFECT-4): 브라우저가 공간 부족으로 끊으면 대기 요청의 AbortError보다 Quota가 원인이다
    const req=(r,cb)=>{r.onsuccess=()=>{try{cb?.(r.result);}catch(e){stop(e);}};r.onerror=ev=>{ev?.preventDefault?.();stop(r.error??fail('CARD_DRAFT_IDB_REQUEST'));};};
    try{body(tx,req,v=>{out=v;},stop);}catch(e){stop(e);}
  });
  async function withDb(fn){const db=await openDb();try{return await fn(db);}finally{db.close();}}
  const readKey=(tx,req,got)=>req(tx.objectStore('keys').get(KEY_ID),k=>{if(k&&usableKey(k.key)&&typeof k.kid==='string')got.key={key:k.key,kid:k.kid};});
  // 한 레코드와 현재 키를 한 읽기 트랜잭션에서 읽는다(commit 직전 확인용).
  const readRow=id=>withDb(db=>run(db,['keys','drafts'],'readonly',(tx,req,set)=>{
    const got={row:null,key:null};set(got);
    readKey(tx,req,got);req(tx.objectStore('drafts').get(id),r=>{got.row=r??null;});
  }));

  async function open(row,key){
    if(!key||row.kid!==key.kid)return {reason:'KEY_MISSING'};
    try{
      if(row.scope!==scopeId||!CARD_DRAFT_KINDS.includes(row.kind)||!DATE_RE.test(row.date)||!Number.isSafeInteger(row.rev)||row.rev<1)throw fail('SHAPE');
      const pt=await cr.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:aad(row.kind,row.date,row.rev)},key.key,row.ct);
      const d=JSON.parse(dec.decode(pt));
      if(d?.format!==CARD_DRAFT_FORMAT||typeof d.draftId!=='string'||d.type!=='ENTITY'||d.body?.entityType!==row.kind||d.body.entityId!==row.date||typeof d.createdAt!=='string')throw fail('SHAPE');
      return {draft:{draftId:d.draftId,type:d.type,body:d.body,createdAt:d.createdAt}};
    }catch{return {reason:'DAMAGED'};}
  }
  // 디스크를 읽어 메모리에 합친다. 이 창의 미저장(dirty) 항목은 그대로 두고(디스크로 덮지 않음), STALE 항목은 디스크 최신 기준값만 받는다.
  // 읽기에 실패하면 loaded를 비워 다음 호출에서 다시 읽는다. 쓰기와 같은 줄에서 돌아 쓰는 도중의 옛 값을 읽어 오지 않는다.
  async function readAll(){
    let rows=[],key=null;
    try{
      ({rows,key}=await withDb(db=>run(db,['keys','drafts'],'readonly',(tx,req,set)=>{
        const got={rows:[],key:null};set(got);
        readKey(tx,req,got);req(tx.objectStore('drafts').getAll(),r=>{got.rows=r??[];});
      })));
    }catch(e){failure={code:e?.name==='QuotaExceededError'?'QUOTA_EXCEEDED':((typeof e?.code==='string'&&e.code)||(typeof e?.code==='number'&&e.name)||'CARD_DRAFT_IDB_OPEN'),load:true};notify();return false;}
    if(failure?.load)failure=null;
    keyCache=key;otherRows=0;unreadable.clear();
    const seen=new Set();
    for(const row of rows){
      if(row?.scope!==scopeId){otherRows++;continue;}
      const r=row.id.startsWith(UNREADABLE_PREFIX)?{reason:'MOVED_ASIDE'}:row.id===scopeId+'|'+row.kind+'|'+row.date?await open(row,key):{reason:'DAMAGED'};
      if(!r.draft){unreadable.set(row.id,{id:row.id,kind:row.kind,date:row.date,base:baseOf(row),reason:r.reason});continue;}
      seen.add(row.id);
      const m=mem.get(row.id);
      if(m?.dirty){if(m.stale){m.base=baseOf(row);m.aside=false;}continue;}
      mem.set(row.id,{id:row.id,kind:row.kind,date:row.date,base:baseOf(row),draft:r.draft,updatedAt:row.updatedAt,dirty:false,deleted:false,ver:++ver});
    }
    for(const [id,m] of [...mem]){
      if(seen.has(id))continue;
      if(!m.dirty){mem.delete(id);continue;}   // 다른 창이 지웠다
      const u=unreadable.get(id);
      if(m.stale){m.base=u?u.base:null;m.aside=Boolean(u);}
      else if(u&&sameBase(u.base,m.base))m.aside=true;   // 내가 알던 그 레코드가 키가 바뀌어 열 수 없게 됨: 다음 쓰기에서 옆으로 옮긴다
    }
    notify();
    return true;
  }
  function load(){
    if(loaded)return loaded;
    ready=true;
    const p=chain.then(readAll,readAll).then(ok=>{if(!ok&&loaded===p)loaded=null;});
    loaded=p;chain=p.catch(()=>{});
    return p;
  }
  async function reload(){loaded=null;await load();}
  async function ensureKey(){
    if(keyCache)return keyCache;
    const key=await cr.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),kid=ids();
    keyCache=await withDb(db=>run(db,['keys'],'readwrite',(tx,req,set)=>{
      const s=tx.objectStore('keys');
      req(s.get(KEY_ID),row=>{if(row&&usableKey(row.key)&&typeof row.kid==='string')set({key:row.key,kid:row.kid});else{s.put({id:KEY_ID,key,kid});set({key,kid});}});
    }));
    return keyCache;
  }
  async function seal(e,rev){
    const k=await ensureKey(),iv=cr.getRandomValues(new Uint8Array(12));
    const pt=enc.encode(JSON.stringify({format:CARD_DRAFT_FORMAT,...e.draft}));
    const ct=new Uint8Array(await cr.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(e.kind,e.date,rev)},k.key,pt));
    return {id:e.id,scope:scopeId,kind:e.kind,date:e.date,rev,kid:k.kid,iv,ct,updatedAt:e.updatedAt};
  }
  // 바뀐(dirty) 항목을 항목마다 한 트랜잭션으로 쓴다(한 항목의 충돌이 다른 날짜 쓰기를 막지 않게). 실패하면 메모리 사본을 그대로 두고
  // failure를 세운다(던지지 않음). 쓰기는 한 줄로 직렬화한다. STALE 항목은 다음 입력이 올 때까지 쓰지 않는다(다른 창 초안 보존).
  // B2C (DEFECT-3): DOMException의 .code는 숫자다. 실패 코드는 언제나 문자열로 둔다(문자열 code가 없으면 이름).
  const failCode=e=>e?.code==='STALE_DRAFT'?'STALE_DRAFT':e?.name==='QuotaExceededError'||/QUOTA/i.test(String(e?.message??''))?'QUOTA_EXCEEDED':((typeof e?.code==='string'&&e.code)||e?.name||'CARD_DRAFT_WRITE_FAILED');
  async function persistOne(e){
    const v=e.ver,aside=e.aside?{from:e.id,to:UNREADABLE_PREFIX+e.id+'|'+ids()}:null,row=e.deleted?null:await seal(e,nextRev(e.base));
    let disk=null;
    try{
      await withDb(db=>run(db,row?['keys','drafts']:['drafts'],'readwrite',(tx,req,set,stop)=>{
        const s=tx.objectStore('drafts');
        // 봉인에 쓴 키가 디스크의 현재 키인지 같은 트랜잭션에서 본다(다른 창이 키를 새로 만들었으면 옛 키 암호문을 새로 만들지 않는다)
        if(row)req(tx.objectStore('keys').get(KEY_ID),k=>{if(!k||!usableKey(k.key)||k.kid!==row.kid)stop(fail('CARD_DRAFT_KEY_CHANGED'));});
        req(s.get(e.id),cur=>{
          if(!sameBase(cur,e.base)){disk=cur??null;stop(fail('STALE_DRAFT'));return;}   // 내가 읽은 뒤 다른 창이 바꿨다(지우고 다시 만든 것 포함)
          const add=()=>{
            if(aside&&cur)req(s.put({...cur,id:aside.to}));               // 열 수 없는 옛 암호문은 지우지 않고 옆으로 옮긴다
            req(s.put(row));
          };
          // 새 레코드가 늘어나는 쓰기(같은 id가 없거나, 옆으로 옮긴 복사본이 새로 생김)만 이 트랜잭션 안에서 전체 수(다른 scope·옮겨 둔 것 포함)를 센다.
          // 메모리 수량은 다른 창이 쓴 것을 모른다. 같은 날짜 교체·삭제는 수가 늘지 않으니 그대로 허용.
          const grows=row&&(!cur||(aside&&cur));
          if(!grows){if(row)add();else req(s.delete(e.id));return;}
          req(s.getAll(),all=>{
            if((all?.length??0)+1>CARD_DRAFT_LIMITS.records){stop(fail('CARD_DRAFT_LIMIT'));return;}
            add();
          });
        });
      }));
    }catch(err){
      if(err?.code==='STALE_DRAFT')await onStale(e,v,disk);
      else if(err?.code==='CARD_DRAFT_KEY_CHANGED'){keyCache=null;if(!(await readAll()))loaded=null;}   // 새 키로 다시 읽는다(쓰기 줄 안). 다음 저장이 새 키로 쓴다
      throw err;
    }
    if(aside){const u=unreadable.get(aside.from);unreadable.delete(aside.from);if(u)unreadable.set(aside.to,{...u,id:aside.to,reason:'MOVED_ASIDE'});}
    const cur=mem.get(e.id);if(!cur)return;
    cur.base=baseOf(row);cur.aside=false;
    if(cur.ver===v){if(row)cur.dirty=false;else mem.delete(e.id);}
  }
  // STALE: 이 창 입력은 메모리에 두고(dirty) 디스크 최신 기준값만 기억한다. 지우려던 것이면 이 창 초안은 이미 디스크에 없으니 다시 읽는다.
  async function onStale(e,v,disk){
    const cur=mem.get(e.id);if(!cur||cur.ver!==v)return;   // 그 사이 새 입력이 왔다: 그 입력이 자기 차례에 다시 판정받는다
    if(cur.deleted){mem.delete(e.id);loaded=null;return;}
    cur.base=baseOf(disk);cur.stale=true;cur.aside=disk?!(await open(disk,keyCache)).draft:false;
  }
  async function persistNow(){
    let first=null;const errs=new Map();
    for(const e of [...mem.values()].filter(x=>x.dirty&&!x.stale)){try{await persistOne(e);recFail.delete(e.id);}catch(err){first??=err;errs.set(e.id,err);recFail.set(e.id,failCode(err));}}
    if(!first&&[...mem.values()].some(x=>x.stale))first=fail('STALE_DRAFT');   // 아직 저장 못 한 STALE 입력이 있으면 실패 표시 유지
    failure=first?{code:failCode(first)}:null;
    return errs;
  }
  // 쓰기·읽기 한 줄(디스크 상태와 메모리 기준값을 함께 보는 일은 이 줄 안에서만).
  const onChain=fn=>{const p=chain.then(fn,fn);chain=p.catch(()=>{});return p;};
  function persist(){return onChain(persistNow).then(errs=>{notify();return errs;});}

  // ---- 디바운스(폼 입력 600ms) ----
  // 도는 동안의 입력은 running에 둔다. 그 사이 같은 날짜 save·discard는 calls에 후보 입력(그때 돌던 입력들)과 함께 적고, 입력이 끝날 때 주인을 정한다.
  function runDeferred(key){
    const d=deferred.get(key);if(!d)return null;
    clearT(d.timer);deferred.delete(key);
    const r={key,pfx:pfxOf(key),gen:d.gen,owned:d.owned,saved:false,refused:null,rebased:false},token=d.owned?Object.freeze({}):undefined;running.add(r);
    if(token)owners.set(token,r);
    const p=Promise.resolve().then(()=>d.fn(token)).then(()=>settleRun(r,null),e=>settleRun(r,e)).then(notify);   // 오류는 버리지 않고 기록(화면이 삼킨 거부 포함)
    inflight.add(p);p.finally(()=>inflight.delete(p));
    return p;
  }
  // 입력 r이 끝났다(B3i). 가져갈 호출: ① 던진 오류가 이 상자가 만든 거부 그 자체면 그 호출 하나(정확). ② 아니면 r만 후보인 끝난 호출 전부 +
  // 여러 입력이 후보인 끝난 호출 중 가장 늦게 끝난 1건(흐름 콜백은 자기 저장을 기다렸다가 곧 끝나므로, 먼저 끝나는 입력이 방금 끝난 호출의 주인).
  // 결과: 오류·거부면 그 입력 세대의 실패, 저장이 받아들여졌으면 그 날짜 성공(markOk), 없으면 그 칸만 정리. 늦은 옛 거절은 옛 세대에만 붙는다.
  // B14 (R2-D2): 입력 하나의 흐름 콜백은 저장을 한 번 하고 곧 끝난다. 그래서 r만 후보인 끝난 호출이 여럿이면 r의 것은 마지막 1건이고,
  // 그 앞의 것들은 r이 도는 동안 들어온 직접 호출이다 → 자기 세대(callGen, r보다 새 입력)로 판정한다(옛 입력의 거절이 새 직접 저장의 성공을 뒤집지 않음).
  function settleRun(r,err){
    // B16: owned 실행은 자기 토큰으로 한 호출의 결과만 가진다(추론 없음). 직접 호출은 이미 자기 세대로 판정됐다.
    if(r.owned){
      running.delete(r);
      if(err)markFail(r.key,failCode(err),r.gen,r.rebased&&!r.saved&&err?.code==='CARD_DRAFT_STALE_BASE');
      else if(r.refused)markFail(r.key,r.refused,r.gen);
      else if(r.rebased&&!r.saved)markFail(r.key,'CARD_DRAFT_STALE_BASE',r.gen,true);   // 다시 계산을 포기했고 콜백이 오류를 삼켰다: 저장됨으로 보이지 않게
      else markOk(r.pfx,r.gen,r.saved?null:r.key);
      return;
    }
    const done=[...calls].filter(c=>c.done&&c.runs.has(r)),hit=err?done.find(c=>c.err===err):null,singles=done.filter(c=>c.runs.size===1);
    const mine=hit?[hit]:[...singles.slice(-1),...done.filter(c=>c.runs.size>1).sort((a,b)=>a.done-b.done).slice(-1)],direct=hit?[]:singles.slice(0,-1);
    running.delete(r);
    for(const c of [...mine,...direct])calls.delete(c);
    for(const c of [...calls])if(c.runs.delete(r)&&!c.runs.size&&c.done)orphan(c);
    const refused=mine.find(c=>c.refused)?.refused;
    if(err)markFail(r.key,failCode(err),r.gen);
    else if(refused)markFail(r.key,refused,r.gen);
    else markOk(r.pfx,r.gen,mine.some(c=>c.saved)?null:r.key);
    for(const c of direct)settleDirect(c);
  }
  function settleDirect(c){if(c.refused)markFail(c.pfx,c.refused,c.callGen);else if(c.saved)markOk(c.pfx,c.callGen);}
  // 후보 입력이 모두 끝났는데 주인이 없는 호출: 거부는 후보 중 가장 새 세대의 실패로 남기고(삼킨 실패 0), 저장 성공은 아무 실패도 지우지 않는다.
  // B14: 후보가 하나뿐이었는데 그 입력이 자기 거부 오류를 던져 다른 호출을 가져간 경우, 이 호출은 그 입력 뒤의 직접 호출이다(자기 세대로 판정).
  function orphan(c){calls.delete(c);if(c.single&&!c.refused&&c.saved){settleDirect(c);return;}if(c.refused)markFail(c.pfx,c.refused,c.gen);}
  // save·discard가 어느 입력의 것인지: 같은 날짜 디바운스 입력이 도는 중이면 그 입력(들) 중 하나(끝날 때 정함), 아니면 직접 호출 = 새 세대 입력.
  // done()은 호출이 끝날 때(저장이 디스크에 닿았거나 거부를 던지기 직전) 부른다.
  // B14: callGen = 이 호출이 직접 호출로 판정될 때의 세대(호출 순간의 새 세대). stale() = 후보 입력 모두가 같은 칸의 더 새 입력에 이미 덮였다(R2-D1).
  // wrote() = 받아들여진 저장: 후보가 한 칸뿐이면 그 칸에 후보 중 가장 새 세대를 적는다(어느 후보의 저장인지 몰라도 그 세대 이상만 막지 않는다).
  // B16: exact = 토큰으로 주인이 정해진 호출. 토큰·직접 호출은 받아들여진 세대를 accepted에 적고, base 없는 토큰 저장은 그 날짜에 더 새 세대가
  // 이미 받아들여졌으면 쓰지 않는다(직접 호출의 base 없는 저장은 예전 그대로). attributed = 거부를 입력(칸)의 실패로 남기는 호출(토큰 또는 예전 추론의 후보).
  // rebased() = 이 호출이 CARD_DRAFT_STALE_BASE로 돌려보내졌다: 그 실행이 끝까지 저장하지 못하면 그 입력의 실패로 남긴다(흐름이 다시 계산을 포기한 경우).
  const accept=(pfx,gen)=>{accepted.set(pfx,Math.max(accepted.get(pfx)??0,gen));};
  const ownerOf=(token,pfx)=>{const r=token!=null&&typeof token==='object'?owners.get(token):null;return r&&running.has(r)&&r.pfx===pfx?r:null;};
  // B18 (H13-N02): 토큰을 넘겼는데(undefined·null이 아님) 지금 도는 이 상자의 그 날짜 실행이 아니면 거절한다. pfx를 모르면 실행이 도는지만 본다.
  const checkToken=(token,pfx)=>{
    if(token==null)return;
    const r=typeof token==='object'?owners.get(token):null;
    if(!r||!running.has(r)||(pfx!=null&&r.pfx!==pfx))throw fail('CARD_DRAFT_STALE_INPUT');
  };
  const inputOf=(pfx,token=null)=>{
    checkToken(token,pfx);
    const own=ownerOf(token,pfx);
    if(own)return {runs:[own],exact:true,attributed:true,gen:own.gen,
      stale:()=>(wrote.get(own.key)??0)>own.gen,
      wrote:()=>{wrote.set(own.key,Math.max(wrote.get(own.key)??0,own.gen));accept(pfx,own.gen);},
      refuse:code=>{own.refused=code;notify();return fail(code);},
      rebased:()=>{own.rebased=true;},
      ok:()=>{own.saved=true;},done:()=>{}};
    const runs=[...running].filter(r=>!r.owned&&r.pfx===pfx);
    if(!runs.length){const gen=++inputGen;return {runs,exact:false,attributed:false,gen,stale:()=>false,wrote:()=>accept(pfx,gen),refuse:code=>{markFail(pfx,code,gen);notify();return fail(code);},rebased:()=>{},ok:()=>markOk(pfx,gen),done:()=>{}};}
    const c={pfx,runs:new Set(runs),gen:Math.max(...runs.map(r=>r.gen)),callGen:++inputGen,single:runs.length===1,refused:null,err:null,saved:false,done:0};calls.add(c);
    const keys=new Set(runs.map(r=>r.key));
    return {runs,exact:false,attributed:true,gen:c.gen,rebased:()=>{},
      stale:()=>runs.every(r=>(wrote.get(r.key)??0)>r.gen),
      wrote:()=>{if(keys.size===1){const k=runs[0].key;wrote.set(k,Math.max(wrote.get(k)??0,c.gen));}},
      refuse:code=>{c.refused=code;c.err=fail(code);notify();return c.err;},
      ok:()=>{c.saved=true;},
      done:()=>{if(c.done)return;c.done=++doneSeq;if(!c.runs.size)orphan(c);}};
  };
  // B16: owned:true면 fn(토큰)으로 부른다. 콜백은 그 토큰을 save·discard의 {input}으로 넘긴다(흐름의 setNote(date,note,{input}) 등).
  // B18: 기본은 owned(앱 코드는 언제나 토큰 방식). owned:false로 옛 추론을 쓰는 것은 legacyDeferInference 상자(시험)에서만 된다.
  function defer(key,fn,{owned}={}){
    const old=deferred.get(key);if(old)clearT(old.timer);
    deferred.set(key,{fn,owned:!legacyDeferInference||owned===true,gen:++inputGen,timer:setT(()=>{void runDeferred(key);},debounceMs)});
    notify();
  }
  // 기다리는 입력을 지금 저장하고, 쓰기가 디스크에 닿을 때까지 기다린다. 기다리는 동안 새 입력이 오면 그것도 저장한다(정해진 횟수까지,
  // 넘으면 CARD_DRAFT_PENDING). 하나라도 저장 못 했으면 던진다(갱신 전 저장 실패 → 전환하지 않음).
  async function flush(){
    // S1c: 잠긴 뒤의 flush(pagehide 등)는 쓰지 않는다. 미저장 입력은 메모리에만 남고 "저장되지 않음"으로 던진다.
    // B14 (R2-D3): 이미 기록된 실패(쓰기 실패·거부된 입력)가 남아 있으면 그 오류로 던진다(saveBeforeUpdate가 성공으로 보지 않게).
    if(isLocked()){if(deferred.size||[...mem.values()].some(e=>e.dirty))throw fail('CARD_DRAFT_LOCKED');const left=failure?.code??firstInput();if(left)throw fail(left);return;}
    for(let round=1;;round++){
      for(const key of [...deferred.keys()])runDeferred(key);
      await Promise.all([...inflight]);
      await persist();
      if(failure||(!deferred.size&&!inflight.size&&![...mem.values()].some(e=>e.dirty&&!e.stale)))break;
      if(round>=FLUSH_ROUNDS)throw fail('CARD_DRAFT_PENDING');
    }
    if(failure)throw fail(failure.code);
    const c=firstInput();if(c)throw fail(c);
  }
  // Web Lock이 없는 환경(시험·옛 브라우저)에서는 이 창 안에서만 같은 이름을 줄 세운다.
  function localLock(name,fn){
    const p=(localLocks.get(name)??Promise.resolve()).then(()=>fn(),()=>fn()),t=p.catch(()=>{});
    localLocks.set(name,t);void t.then(()=>{if(localLocks.get(name)===t)localLocks.delete(name);});
    return p;
  }

  const guardWrite=()=>{if(isLocked()||!unlocked())throw fail('CARD_DRAFT_LOCKED');if(!canWrite())throw fail('CARD_DRAFT_READ_ONLY');};
  // HltFlow·StudyFlow가 쓰는 drafts 포트(list/save/discard/commit). 초안 모양 {draftId,type:'ENTITY',body,createdAt}은 저널·메모리와 같다.
  function port(kind,{write}={}){
    if(!CARD_DRAFT_KINDS.includes(kind))throw fail('CARD_DRAFT_KIND');
    const byDraft=id=>live().find(e=>e.kind===kind&&e.draft.draftId===id)??null;
    // FIX34 (H1): 이 창 초안 본문(mine)과 디스크 초안 본문(disk)을 합친 새 본문. 기준(base)은 내 초안의 heads, 명령 서명은 흐름의 makeBody로 다시 만든다(내용이 바뀌므로).
    // 합칠 수 없으면(REBASE_ID_COLLISION·검증 위반) 던진다. confirmCount는 초안의 값을 그대로 둔다(rebase의 +1은 확정용이다).
    let mergeRule=null;
    const mergedBody=async(mine,disk)=>{
      const {rebase,ports,prepare}=mergeRule,date=mine.entityId,base=mine.expectedHeads.length?ports.revision(date,mine.expectedHeads[0]):null;
      const r=rebase({date,base,mine:prepare?prepare(mine.data,disk.data):mine.data,latest:disk.data});
      if(r.status==='REJECTED')throw fail(r.code);
      const card=r.status==='ALREADY_APPLIED'?disk.data:r.card;
      return ports.makeBody({requestId:ports.newRequestId(),date,data:Object.hasOwn(mine.data,'confirmCount')?{...card,confirmCount:mine.data.confirmCount}:card,heads:mine.expectedHeads,reason:mine.reason});
    };
    const api={
      mergeWith:rule=>{mergeRule=rule;},
      // FIX34 (H1): 다시 쓰기만 하는 호출(같은 버튼을 다시 누름): 이 날짜 초안이 STALE이면 같은 내용으로 저장해 합친다. 아니면 아무것도 하지 않는다.
      retryStale:tracked(async date=>{
        if(isLocked()||!mergeRule)return;
        await load();
        const e=mem.get(scopeId+'|'+kind+'|'+date);
        if(e?.stale&&!e.deleted)await api.save({type:e.draft.type,body:e.draft.body});
      }),
      locked:()=>isLocked()||!unlocked(),   // B18 (H13-C05): 흐름이 재적용 회차 전에 로그아웃 잠금을 본다
      list:tracked(async()=>{if(isLocked())return [];await load();if(!unlocked())return [];return live().filter(e=>e.kind===kind).map(e=>structuredClone(e.draft));}),
      // B16: opts.input = defer 토큰(그 실행의 저장), opts.base = 이 카드를 계산한 초안의 draftId(없었으면 null). 둘 다 선택.
      save:tracked(async({type,body},opts={})=>{
        if(type!=='ENTITY'||body?.entityType!==kind||!DATE_RE.test(body?.entityId??''))throw fail('CARD_DRAFT_SHAPE');
        const hasBase=Boolean(opts)&&Object.hasOwn(opts,'base');
        const input=inputOf(kind+'|'+body.entityId+'|',opts?.input),refuse=input.refuse;   // 거부된 입력도 기록(호출자가 오류를 삼켜도 flush가 던짐)
        try{
          try{guardWrite();}catch(e){throw refuse(e.code);}   // 읽기 전용·잠김 거부도 같다
          await load();
          const date=body.entityId,id=scopeId+'|'+kind+'|'+date,draft={draftId:'cd'+ids(),type,body:structuredClone(body),createdAt:now()};
          // B14 (R2-D1): 같은 칸의 더 새 입력이 이미 저장됐다 → 이 옛 입력은 mem·디스크를 바꾸지 않는다(가장 마지막에 받은 입력이 이긴다, 실패 아님).
          const superseded=()=>{input.ok();notify();return {draftId:mem.get(id)?.draft?.draftId??null,status:'LOCAL_DRAFT',superseded:true};};
          if(input.stale())return superseded();
          // FIX34 (H1): 이 창 초안이 STALE이면 디스크를 다시 읽어 합친 본문을 쓴다. CAS 기준은 방금 읽은 레코드다(그 사이 또 바뀌면 다시 STALE이고 덮지 않는다).
          const was=mem.get(id);let fresh=null;
          if(was?.stale&&!was.deleted&&mergeRule){
            try{
              fresh=await onChain(async()=>{const {row,key}=await readRow(id);return {row,opened:row?await open(row,key):null};});
              if(fresh.opened?.draft)draft.body=structuredClone(await mergedBody(draft.body,fresh.opened.draft.body));
            }catch{throw refuse('CARD_DRAFT_MERGE_FAILED');}
            if(mem.get(id)!==was){input.rebased();throw fail('CARD_DRAFT_STALE_BASE');}   // 합치는 동안 이 창의 다른 입력이 먼저 저장됐다
            if(input.stale())return superseded();
          }
          if(enc.encode(JSON.stringify({format:CARD_DRAFT_FORMAT,...draft})).length+16>CARD_DRAFT_LIMITS.recordBytes)throw refuse('CARD_DRAFT_TOO_LARGE');
          const full=()=>!mem.has(id)&&live().length+unreadable.size+otherRows>=CARD_DRAFT_LIMITS.records;   // 옮겨 둔 열 수 없는 초안도 센다
          // 메모리 사본은 다른 창이 지운 것을 모른다: 가득 차 보이면 디스크를 다시 읽어 센다. 늘어나는 쓰기의 최종 판단은 쓰기 트랜잭션 안(persistOne).
          if(full()){await reload();if(input.stale())return superseded();if(full())throw refuse('CARD_DRAFT_LIMIT');}
          const prev=mem.get(id),aside=!prev&&unreadable.has(id);
          // B16 (K1-01): 이 카드를 계산한 뒤 그 날짜 초안이 바뀌었다(다른 칸·직접 호출·다른 창) → 덮어쓰지 않는다. 흐름이 최신 카드 위에 다시 계산한다(실패 아님).
          if(hasBase&&(prev&&!prev.deleted?prev.draft.draftId:null)!==opts.base){input.rebased();throw fail('CARD_DRAFT_STALE_BASE');}
          // base 없는 카드 전체 저장(토큰): 그 날짜에 더 새 세대 입력이 이미 받아들여졌다 → 옛 입력은 바꾸지 않는다(입력 순서로 마지막이 이김).
          if(!hasBase&&input.exact&&(accepted.get(kind+'|'+date+'|')??0)>input.gen)return superseded();
          mem.set(id,{id,kind,date,base:fresh?baseOf(fresh.row):prev?prev.base:aside?unreadable.get(id).base:null,aside:fresh?Boolean(fresh.row&&!fresh.opened.draft):Boolean(prev?.aside)||aside,draft,updatedAt:now(),dirty:true,deleted:false,ver:++ver});
          input.ok();input.wrote();
          notify();await persist();
          return {draftId:draft.draftId,status:'LOCAL_DRAFT'};
        }finally{input.done();}
      }),
      // 흐름은 입력을 원래 값으로 되돌리면 디바운스 안에서 discard를 부른다: save와 같은 입력 세대 규칙을 따른다.
      // B16: opts.input = defer 토큰, opts.date = 되돌리기(흐름)일 때 그 날짜. date를 주면 그 초안이 이미 다른 초안으로 바뀐 경우 CARD_DRAFT_STALE_BASE.
      discard:tracked(async(id,opts={})=>{
        checkToken(opts?.input,null);   // B18: 끝난·다른 상자 토큰은 아무것도 읽거나 바꾸기 전에 거절
        let denied=null;try{guardWrite();}catch(err){denied=err;}
        if(!isLocked())await load();   // S1c: 잠긴 뒤에는 디스크를 다시 읽지 않는다(메모리의 미저장 입력만 본다)
        const e=byDraft(id),token=opts?.input,date=e?.date??(DATE_RE.test(opts?.date??'')?opts.date:null),pfx=date?kind+'|'+date+'|':null;
        if(pfx)checkToken(token,pfx);   // 다른 날짜 실행의 토큰(또는 load 동안 끝난 실행)
        if(denied){if(pfx&&(e||ownerOf(token,pfx))){const input=inputOf(pfx,token);if(input.attributed){const err=input.refuse(denied.code);input.done();throw err;}}throw denied;}   // 버튼으로 직접 버린 거부는 화면 오류만
        if(!e){
          // B16 (K1-01): 이 되돌리기가 읽은 초안이 그 사이 바뀌었다. 같은 칸의 더 새 입력이 이미 정했으면 아무것도 하지 않고(마지막 입력이 이김),
          // 아니면 다른 칸·직접 호출이 바꾼 것이니 흐름이 최신 카드 위에 다시 계산한다(그 항목을 지우지 않음).
          if(!pfx)return;
          const own=ownerOf(token,pfx);
          if(own&&(wrote.get(own.key)??0)>own.gen){own.saved=true;return;}
          if(live().some(x=>x.kind===kind&&x.date===date)){if(own)own.rebased=true;throw fail('CARD_DRAFT_STALE_BASE');}
          return;
        }
        const input=inputOf(pfx,token);
        if(input.exact&&input.stale()){input.ok();input.done();return;}   // B16: 같은 칸의 더 새 입력이 이미 저장·삭제됐다
        input.ok();input.wrote();   // B14: 새 입력이 되돌린(지운) 뒤 늦은 옛 입력이 초안을 다시 만들지 않게
        try{
          if(e.stale){mem.delete(e.id);await reload();await persist();return;}   // 이 창 초안은 디스크에 없다: 다른 창 초안은 지우지 않고 다시 읽는다
          mem.set(e.id,{...e,deleted:true,dirty:true,ver:++ver});
          notify();await persist();
        }finally{input.done();}
      }),
      // B18 (H13-N01): 흐름이 이 입력을 저장·삭제 없이 끝냈다(최신 값이 이미 그 초안·확정값과 같음). 그 칸의 최신 세대로 적어 늦게 끝난 옛 입력의
      // save·discard를 막는다(초안을 새로 만들지 않음, 쓰기 0). base = 흐름이 본 초안 draftId(없었으면 null): 그 사이 초안이 바뀌었으면 STALE_BASE(다시 계산).
      // 토큰 없는 호출은 할 일이 없다(직접 호출은 언제나 새 세대).
      keep:tracked(async(date,opts={})=>{
        if(!DATE_RE.test(date??''))throw fail('CARD_DRAFT_SHAPE');
        const pfx=kind+'|'+date+'|',token=opts?.input;
        checkToken(token,pfx);
        if(token==null||isLocked())return;
        await load();
        const own=ownerOf(token,pfx);if(!own)throw fail('CARD_DRAFT_STALE_INPUT');
        if((wrote.get(own.key)??0)>own.gen)return;   // 같은 칸의 더 새 입력이 이미 정했다
        const cur=live().find(x=>x.kind===kind&&x.date===date)?.draft.draftId??null;
        if(Object.hasOwn(opts,'base')&&cur!==opts.base){own.rebased=true;throw fail('CARD_DRAFT_STALE_BASE');}
        wrote.set(own.key,own.gen);
      }),
      // 확정: 일반 저장 경로(write, 같은 requestId)로 쓰고, 성공을 확인한 뒤에만 상자에서 지운다. 같은 날짜 확정은 Web Lock으로 줄 세우고,
      // 잠금 안에서 쓰기 권한·잠금을 다시 보고, 디스크에서 그 초안이 아직 있는지(rev·IV, 저장된 초안이면 draftId까지) 다시 읽어 확인한 뒤에만
      // write를 부른다(다른 창이 이미 확정·삭제했거나 바꿔 썼으면 부르지 않고 다시 읽는다). 지우기 실패는 draftCleanup:'FAILED'.
      // 이 창에만 있는 미저장 입력(dirty)은 디스크가 내가 알던 그대로일 때만 확정한다.
      commit:tracked(async id=>{
        guardWrite();await load();
        const e=byDraft(id);if(!e)throw fail('CARD_DRAFT_NOT_FOUND');
        const check=async()=>{
          const {row,key}=await readRow(e.id),s=byDraft(id);
          if(!s||s.id!==e.id)return 'CARD_DRAFT_NOT_FOUND';
          if(!sameBase(row,s.base))return s.dirty?'STALE_DRAFT':'CARD_DRAFT_NOT_FOUND';
          if(!s.dirty&&(row?(await open(row,key)).draft?.draftId:null)!==id)return 'CARD_DRAFT_NOT_FOUND';
          return null;
        };
        const go=async()=>{
          guardWrite();   // 잠금을 기다리는 동안 읽기 전용·잠김으로 바뀌었을 수 있다
          const bad=await onChain(check);
          if(bad){if(bad==='CARD_DRAFT_NOT_FOUND')await reload();throw fail(bad);}
          guardWrite();
          const still=byDraft(id);if(!still||still.id!==e.id)throw fail('CARD_DRAFT_NOT_FOUND');
          const r=await write(structuredClone(still.draft.body));
          const status=confirmedStatus(r?.status)?'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED':r?.status;
          let cleanup=null;
          if(status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'){
            const cur=mem.get(e.id);
            if(cur&&!cur.deleted&&cur.draft.draftId===id){
              if(cur.stale){mem.delete(e.id);await reload();await persist();}   // 이 창 초안은 디스크에 없다: 다른 창 초안은 남긴다
              else{mem.set(e.id,{...cur,deleted:true,dirty:true,ver:++ver});if((await persist()).has(e.id))cleanup='FAILED';}
            }
          }
          return cleanup?{...r,status,draftCleanup:cleanup}:{...r,status};
        };
        const name='lb-card-draft:'+scopeId+':'+kind+':'+e.date;
        return locks&&typeof locks.request==='function'?locks.request(name,{mode:'exclusive'},go):localLock(name,go);
      }),
    };
    return api;
  }
  function statusFor(kind,date){
    const e=mem.get(scopeId+'|'+kind+'|'+date),has=Boolean(e&&!e.deleted);
    const typing=[...deferred.keys()].some(k=>k.startsWith(kind+'|'+date+'|'));
    const failed=failure?.code??inputFor(kind,date);
    // R33B (HUNT32 D1·S1·S2): own = 이 칸(kind·date) 자체의 실패만. 거부된 입력이거나, 이 레코드가 아직 디스크에 없는데(dirty) 마지막 쓰기가 실패했거나 STALE이면.
    // failed는 예전 그대로 상자 전체 값(다른 날짜·종류 초안의 STALE·Quota 포함)이다. "이 레코드가 디스크에 써졌는가"는 has&&!dirty로 본다.
    const own=inputFor(kind,date)??(has&&e.dirty?recFail.get(e.id)??(e.stale?'STALE_DRAFT':null):null);
    return {typing,has,saved:has&&!e.dirty&&!failed,dirty:has&&e.dirty,failed,own,updatedAt:has?e.updatedAt:null,
      old:has&&Date.parse(now())-Date.parse(e.updatedAt)>OLD_DRAFT_DAYS*86400000};
  }
  return {
    mode:DRAFT_MODE.DEVICE_BOX,TEXT:CARD_DRAFT_TEXT,ERROR_TEXT:CARD_DRAFT_ERROR_TEXT,scope:scopeId,
    available,port,defer,statusFor,
    flush:tracked(flush),
    load:()=>isLocked()?Promise.resolve():load(),
    count:tracked(async()=>{if(isLocked())return live().length;await load();return live().length;}),   // S1c: 잠긴 뒤에는 메모리의 미저장 입력만 센다
    countNow,
    // S1: 다른 창에서 "이 기기 로그아웃" → 키 캐시와 디스크에서 읽어 둔(이미 저장된) 초안 사본을 메모리에서 버린다. 하던 읽기·쓰기가 끝난 뒤 실행한다.
    // 이 창의 미저장 입력(dirty)은 지우지 않는다(데이터 손실 금지). 디스크의 초안도 그대로다. unlocked()가 다시 참이 된 뒤의 load()가 다시 읽는다.
    // S1c: 부르는 즉시 잠긴다(새 호출은 디스크를 읽거나 쓰지 않음). 그 전에 시작한 호출(아직 load를 기다리는 save 포함)이 끝난 뒤에 버린다.
    lock(){
      locked=true;
      const drop=()=>{keyCache=null;loaded=null;for(const [id,e] of [...mem])if(!e.dirty)mem.delete(id);notify();};
      return Promise.allSettled([...ops]).then(()=>onChain(drop)).then(()=>{});
    },
    status:()=>({failed:failure?.code??firstInput(),unreadable:unreadable.size,pending:deferred.size>0||[...mem.values()].some(e=>e.dirty),count:countNow()}),
    onChange:cb=>{listeners.add(cb);return ()=>listeners.delete(cb);},
    // pagehide·화면 숨김 때 기다리는 입력을 저장한다(최선 노력: 브라우저가 끝까지 기다려 주지 않을 수 있다).
    attachFlush(target=globalThis,doc=globalThis.document){
      const save=()=>{void flush().catch(()=>{});};
      const vis=()=>{if(doc?.visibilityState==='hidden')save();};
      target?.addEventListener?.('pagehide',save);doc?.addEventListener?.('visibilitychange',vis);
      return ()=>{target?.removeEventListener?.('pagehide',save);doc?.removeEventListener?.('visibilitychange',vis);};
    },
  };
}

// B2 site-pwa가 읽는 훅 모양(globalThis.lbPwaHooks). 연결은 앱이 한 줄로 한다(B3c에서는 만들기만, REPORT 설계안).
export function cardDraftPwaHooks(box){return {unsentCount:()=>box.count(),saveBeforeUpdate:()=>box.flush()};}
