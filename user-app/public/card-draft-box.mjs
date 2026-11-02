// 카드 초안 상자(B3c). 브라우저(Fold 크롬·iPad)처럼 봉인 초안 저널(drafts.lbd)이 없는 표면에서 건강(HLT_DAY)·공부(STUDY_DAY) 카드 초안을
// 이 기기의 IndexedDB에 암호문으로 남긴다. 새로고침·탭 종료·서비스 워커 갱신 뒤에도 이어 쓸 수 있게 하는 것이 목적이다(연산 0).
// 불러오는 모듈 없음(단독 파일). indexedDB·crypto·시계·id·scope는 주입한다(시험은 가짜 IndexedDB와 Node webcrypto를 꽂는다).
// - DB LIFE_BRICK_CARD_DRAFTS_V1: 스토어 keys(비추출 AES-GCM 256 키 1개, CryptoKey 객체 그대로), drafts(keyPath id).
// - 레코드 id = scope|kind|date(날짜·종류당 1건). 겉에는 scope·kind·date·rev·kid·시각만 있고, 카드 내용·라벨·횟수는 암호문 안에만 있다.
//   쓸 때마다 새 IV(12바이트). AAD = LB_CARD_DRAFT_1|scope|kind|date|rev → 다른 레코드로 바꿔치기하거나 rev를 바꾸면 복호화가 실패한다.
// - 쓰기: readwrite + durability 'strict', tx.oncomplete 뒤에만 저장됨. 같은 id는 rev CAS(읽은 rev와 다르면 STALE_DRAFT).
// - 열 수 없는 레코드(키 없음·손상)는 UNREADABLE로 보존하고 지우지 않는다. 같은 날짜에 새 초안을 쓰면 옛 암호문은 UNREADABLE|… 로 옮겨 둔다.
// - 한도: 전체 60건, 레코드 암호문 96KB. 넘으면 새 초안을 거부한다(조용히 지우거나 줄이지 않는다). 자동 만료 없음(14일 넘으면 표시만).
// - 쓰기 실패(QuotaExceededError 등)는 저장됨으로 말하지 않는다: 메모리 사본을 유지하고 failed를 세운 뒤 다음 저장 때 다시 쓴다.
// 보안 한계(정직하게): 키는 같은 브라우저 프로필 안에 있어 프로필 파일을 가진 사람에게는 저장된 로그인 세션과 같은 수준의 보호다. 앱 잠금이 암호문을 막지는 않는다.
export const CARD_DRAFT_DB='LIFE_BRICK_CARD_DRAFTS_V1';
export const CARD_DRAFT_FORMAT='LB_CARD_DRAFT_1';
export const CARD_DRAFT_KINDS=Object.freeze(['HLT_DAY','STUDY_DAY']);
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
  dropConfirm:'이 기기에 저장된 초안을 버릴까요? 금고에 확정된 기록에는 영향이 없습니다.',
  old:'오래된 초안(14일 넘음)',
  unreadable:'열 수 없는 초안이 이 기기에 보존되어 있어요(지우지 않았어요). 브라우저 저장소의 키가 바뀌었거나 손상되었을 수 있어요.',
});
export const deviceOnlyLine=n=>'이 기기에만 있는 초안 '+n+'건';
export const CARD_DRAFT_ERROR_TEXT=Object.freeze({
  CARD_DRAFT_LIMIT:'이 기기의 초안이 60건이라 새 날짜 초안을 저장하지 않았어요. 지우거나 줄이지 않았어요 · 오래된 초안을 확정하거나 버린 뒤 다시 하세요.',
  CARD_DRAFT_TOO_LARGE:'초안이 너무 커서(96KB) 저장하지 않았어요 · 메모나 항목을 줄인 뒤 다시 하세요.',
  CARD_DRAFT_READ_ONLY:'이 창은 읽기 전용이라 초안을 저장하지 않아요 · 기록하는 창에서 입력하세요.',
  CARD_DRAFT_LOCKED:'잠겨 있어 초안을 저장하지 않았어요.',
  STALE_DRAFT:'다른 창에서 같은 날짜 초안이 바뀌어 저장하지 못했어요 — 이 화면을 닫으면 사라져요',
});

const KEY_ID='key',UNREADABLE_PREFIX='UNREADABLE|';
const SCOPE_RE=/^v1:[A-Za-z0-9_-]{1,128}:[A-Za-z0-9_-]{1,128}$/,DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const fail=code=>Object.assign(new Error(code),{code});
const usableKey=k=>!!k&&typeof k==='object'&&k.type==='secret'&&k.extractable===false&&k.algorithm?.name==='AES-GCM'&&k.algorithm.length===256&&Array.isArray(k.usages)&&k.usages.includes('encrypt')&&k.usages.includes('decrypt');
const confirmedStatus=s=>s==='LOCAL_SAVED'||s==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED';

// 금고(프로필) 구분값: 상태의 selected 프로필이 가진 accountId·vaultId. 없으면 null(→ 상자를 쓰지 않고 메모리 초안).
export function cardDraftScope(status){
  const p=Array.isArray(status?.profiles)?status.profiles.find(x=>x&&x.id===status.selected):null;
  if(typeof p?.accountId!=='string'||typeof p?.vaultId!=='string')return null;
  const scope='v1:'+p.accountId+':'+p.vaultId;
  return SCOPE_RE.test(scope)?scope:null;
}

export function createCardDraftBox({indexedDB:idb=globalThis.indexedDB,crypto:cr=globalThis.crypto,scopeId,now=()=>new Date().toISOString(),newId=null,
  locks=globalThis.navigator?.locks??null,canWrite=()=>true,unlocked=()=>true,emit=null,timers=null,debounceMs=CARD_DRAFT_DEBOUNCE_MS}={}){
  const ids=newId??(()=>Array.from(cr.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join(''));
  const setT=timers?.set??((f,ms)=>setTimeout(f,ms)),clearT=timers?.clear??(t=>clearTimeout(t));
  const mem=new Map(),unreadable=new Map(),deferred=new Map(),inflight=new Set(),listeners=new Set();
  let loaded=null,keyCache=null,otherRows=0,failure=null,chain=Promise.resolve(),ver=0;

  const available=()=>Boolean(idb&&typeof idb.open==='function'&&cr?.subtle&&typeof cr.getRandomValues==='function'&&typeof scopeId==='string'&&SCOPE_RE.test(scopeId));
  const aad=(kind,date,rev)=>enc.encode(CARD_DRAFT_FORMAT+'|'+scopeId+'|'+kind+'|'+date+'|'+rev);
  const live=()=>[...mem.values()].filter(e=>!e.deleted);
  const countNow=()=>loaded?live().length:null;
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
    tx.oncomplete=()=>ok(out);tx.onabort=()=>no(cause??tx.error??fail('CARD_DRAFT_IDB_ABORT'));tx.onerror=()=>{};
    const req=(r,cb)=>{r.onsuccess=()=>{try{cb?.(r.result);}catch(e){stop(e);}};r.onerror=ev=>{ev?.preventDefault?.();stop(r.error??fail('CARD_DRAFT_IDB_REQUEST'));};};
    try{body(tx,req,v=>{out=v;},stop);}catch(e){stop(e);}
  });
  async function withDb(fn){const db=await openDb();try{return await fn(db);}finally{db.close();}}

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
  function load(){
    if(loaded)return loaded;
    loaded=(async()=>{
      let rows=[],key=null;
      try{
        ({rows,key}=await withDb(db=>run(db,['keys','drafts'],'readonly',(tx,req,set)=>{
          const got={rows:[],key:null};set(got);
          req(tx.objectStore('keys').get(KEY_ID),k=>{if(k&&usableKey(k.key)&&typeof k.kid==='string')got.key={key:k.key,kid:k.kid};});
          req(tx.objectStore('drafts').getAll(),r=>{got.rows=r??[];});
        })));
      }catch(e){failure={code:e?.name==='QuotaExceededError'?'QUOTA_EXCEEDED':(e?.code||'CARD_DRAFT_IDB_OPEN')};}
      keyCache=key;otherRows=0;
      for(const row of rows){
        if(row?.scope!==scopeId){otherRows++;continue;}
        const r=row.id.startsWith(UNREADABLE_PREFIX)?{reason:'MOVED_ASIDE'}:row.id===scopeId+'|'+row.kind+'|'+row.date?await open(row,key):{reason:'DAMAGED'};
        if(r.draft)mem.set(row.id,{id:row.id,kind:row.kind,date:row.date,rev:row.rev,draft:r.draft,updatedAt:row.updatedAt,dirty:false,deleted:false,ver:++ver});
        else unreadable.set(row.id,{id:row.id,kind:row.kind,date:row.date,rev:row.rev,reason:r.reason});
      }
      notify();
    })();
    return loaded;
  }
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
  // failure를 세운다(던지지 않음). 쓰기는 한 줄로 직렬화한다.
  const failCode=e=>e?.code==='STALE_DRAFT'?'STALE_DRAFT':e?.name==='QuotaExceededError'||/QUOTA/i.test(String(e?.message??''))?'QUOTA_EXCEEDED':(e?.code||e?.name||'CARD_DRAFT_WRITE_FAILED');
  async function persistOne(e){
    const v=e.ver,aside=e.aside?{from:e.id,to:UNREADABLE_PREFIX+e.id+'|'+ids()}:null,row=e.deleted?null:await seal(e,e.rev+1);
    await withDb(db=>run(db,['drafts'],'readwrite',(tx,req,set,stop)=>{
      const s=tx.objectStore('drafts');
      req(s.get(e.id),cur=>{
        if((cur?.rev??0)!==e.rev){stop(fail('STALE_DRAFT'));return;}   // 내가 읽은 뒤 다른 창이 바꿨다
        if(aside&&cur)req(s.put({...cur,id:aside.to}));                 // 열 수 없는 옛 암호문은 지우지 않고 옆으로 옮긴다
        if(row)req(s.put(row));else req(s.delete(e.id));
      });
    }));
    if(aside){const u=unreadable.get(aside.from);unreadable.delete(aside.from);if(u)unreadable.set(aside.to,{...u,id:aside.to,reason:'MOVED_ASIDE'});}
    const cur=mem.get(e.id);if(!cur)return;
    cur.rev=row?row.rev:0;cur.aside=false;
    if(cur.ver===v){if(row)cur.dirty=false;else mem.delete(e.id);}
  }
  async function persistNow(){
    let first=null;
    for(const e of [...mem.values()].filter(x=>x.dirty)){try{await persistOne(e);}catch(err){first??=err;}}
    failure=first?{code:failCode(first)}:null;
  }
  function persist(){const p=chain.then(persistNow,persistNow);chain=p.catch(()=>{});return p.then(()=>notify());}

  // ---- 디바운스(폼 입력 600ms) ----
  function runDeferred(key){
    const d=deferred.get(key);if(!d)return null;
    clearT(d.timer);deferred.delete(key);
    const p=Promise.resolve().then(d.fn).catch(()=>{});inflight.add(p);p.finally(()=>inflight.delete(p));
    return p;
  }
  function defer(key,fn){
    const old=deferred.get(key);if(old)clearT(old.timer);
    deferred.set(key,{fn,timer:setT(()=>{void runDeferred(key);},debounceMs)});
    notify();
  }
  // 기다리는 입력을 지금 저장하고, 쓰기가 디스크에 닿을 때까지 기다린다. 하나라도 저장 못 했으면 던진다(갱신 전 저장 실패 → 전환하지 않음).
  async function flush(){
    for(const key of [...deferred.keys()])runDeferred(key);
    await Promise.all([...inflight]);
    await persist();
    if(failure)throw fail(failure.code);
  }

  const guardWrite=()=>{if(!unlocked())throw fail('CARD_DRAFT_LOCKED');if(!canWrite())throw fail('CARD_DRAFT_READ_ONLY');};
  // HltFlow·StudyFlow가 쓰는 drafts 포트(list/save/discard/commit). 초안 모양 {draftId,type:'ENTITY',body,createdAt}은 저널·메모리와 같다.
  function port(kind,{write}={}){
    if(!CARD_DRAFT_KINDS.includes(kind))throw fail('CARD_DRAFT_KIND');
    const byDraft=id=>live().find(e=>e.kind===kind&&e.draft.draftId===id)??null;
    return {
      list:async()=>{await load();if(!unlocked())return [];return live().filter(e=>e.kind===kind).map(e=>structuredClone(e.draft));},
      save:async({type,body})=>{
        guardWrite();
        if(type!=='ENTITY'||body?.entityType!==kind||!DATE_RE.test(body?.entityId??''))throw fail('CARD_DRAFT_SHAPE');
        await load();
        const date=body.entityId,id=scopeId+'|'+kind+'|'+date,prev=mem.get(id),draft={draftId:'cd'+ids(),type,body:structuredClone(body),createdAt:now()};
        if(enc.encode(JSON.stringify({format:CARD_DRAFT_FORMAT,...draft})).length+16>CARD_DRAFT_LIMITS.recordBytes)throw fail('CARD_DRAFT_TOO_LARGE');
        const aside=!prev&&unreadable.has(id);
        if(!prev&&live().length+unreadable.size+otherRows>=CARD_DRAFT_LIMITS.records)throw fail('CARD_DRAFT_LIMIT');   // 옮겨 둔 열 수 없는 초안도 센다
        mem.set(id,{id,kind,date,rev:prev?prev.rev:aside?unreadable.get(id).rev:0,aside:Boolean(prev?.aside)||aside,draft,updatedAt:now(),dirty:true,deleted:false,ver:++ver});
        notify();await persist();
        return {draftId:draft.draftId,status:'LOCAL_DRAFT'};
      },
      discard:async id=>{
        guardWrite();await load();
        const e=byDraft(id);if(!e)return;
        mem.set(e.id,{...e,deleted:true,dirty:true,ver:++ver});
        notify();await persist();
      },
      // 확정: 일반 저장 경로(write, 같은 requestId)로 쓰고, 성공을 확인한 뒤에만 상자에서 지운다. 같은 날짜 확정은 Web Lock으로 줄 세운다.
      commit:async id=>{
        guardWrite();await load();
        const e=byDraft(id);if(!e)throw fail('CARD_DRAFT_NOT_FOUND');
        const go=async()=>{
          const r=await write(structuredClone(e.draft.body));
          const status=confirmedStatus(r?.status)?'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED':r?.status;
          if(status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'){const cur=mem.get(e.id);if(cur&&!cur.deleted&&cur.draft.draftId===id){mem.set(e.id,{...cur,deleted:true,dirty:true,ver:++ver});await persist();}}
          return {...r,status};
        };
        return locks&&typeof locks.request==='function'?locks.request('lb-card-draft:'+scopeId+':'+kind+':'+e.date,{mode:'exclusive'},go):go();
      },
    };
  }
  function statusFor(kind,date){
    const e=mem.get(scopeId+'|'+kind+'|'+date),has=Boolean(e&&!e.deleted);
    const typing=[...deferred.keys()].some(k=>k.startsWith(kind+'|'+date+'|'));
    return {typing,has,saved:has&&!e.dirty&&!failure,dirty:has&&e.dirty,failed:failure?.code??null,updatedAt:has?e.updatedAt:null,
      old:has&&Date.parse(now())-Date.parse(e.updatedAt)>OLD_DRAFT_DAYS*86400000};
  }
  return {
    mode:DRAFT_MODE.DEVICE_BOX,TEXT:CARD_DRAFT_TEXT,ERROR_TEXT:CARD_DRAFT_ERROR_TEXT,scope:scopeId,
    available,port,flush,defer,statusFor,load,
    count:async()=>{await load();return live().length;},
    countNow,
    status:()=>({failed:failure?.code??null,unreadable:unreadable.size,pending:deferred.size>0||[...mem.values()].some(e=>e.dirty),count:countNow()}),
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
