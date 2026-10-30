import {check,copy,encode,payloadEncode,decode,sha,randomId} from '../../core/package/src/codec.mjs';
import {WriterContext,openEnvelope} from '../../core/package/src/crypto.mjs';
import {Roster} from '../../core/package/src/enrollment.mjs';
import {sealLocalCapsule,openLocalCapsule} from '../../core/package/src/recovery.mjs';
import {PROFILE,same} from '../contracts.mjs';
import {sequentialState,validateSequentialState,samePayload} from '../sequential-service.mjs';
export const DATABASE_NAME='LIFE_BRICK_OWNER_SEQ_V1';
const STORE='replicas';
// F9 record layout: format 4 keeps one sealed commit (K=1) whose sealed payload carries storeFormat 4 and a
// compactedFrom anchor. Records without storeFormat are the original commit-chain layout (opened as before).
// F10-5: format 5 = a small head commit plus write-once segments stored under SEG| keys, written in the SAME readwrite
// transaction as the head (atomic: no orphan segments, so there is no deletion code). Same payload rules as the PC store.
export const IDB_RECORD_FORMAT=5;
// One sealed commit must decode under the codec's 5,000,000-byte wire bound: about 3.7MB of plaintext (F10 §15.7).
const LOCAL_STATE_LIMIT=3_700_000;
const SEGMENT_TARGET=1_000_000,TAIL_ROWS=128,TAIL_BYTES=512_000;
const SEG_KEYS='bytes|digest|from|generation|index|sha256|to';
const segId=(recordId,m)=>'SEG|'+recordId+'|'+m.index+'|g'+m.generation+'|'+m.sha256.slice(0,32);
const buf=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
// Full state from segments + head tail. Head receipts must not repeat a segment receipt.
function rebuild(head,segs){
 const s=copy(head);for(const k of Object.keys(s.sequentialSync.receipts))check(!segs.receiptKeys.has(k),'MD_IDB_SEGMENT_BINDING');
 s.sequentialSync.records=[...segs.records,...s.sequentialSync.records];s.userApp.operations=[...segs.operations,...s.userApp.operations];s.sequentialSync.receipts={...segs.receipts,...s.sequentialSync.receipts};
 return s;
}
async function readSegments(db,recordId,list,{material,nonces,headGeneration}){
 check(Array.isArray(list),'MD_IDB_SEGMENT_LIST');
 const out={records:[],operations:[],receipts:{},receiptKeys:new Set()};let prev=null,from=0,gen=1;
 for(const [i,m] of list.entries()){
  check(m&&Object.keys(m).sort().join('|')===SEG_KEYS&&m.index===i&&m.from===from&&Number.isSafeInteger(m.to)&&m.to>m.from&&/^[a-f0-9]{64}$/.test(m.sha256)&&typeof m.digest==='string'&&/^[a-f0-9]{64}$/.test(m.digest)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&Number.isSafeInteger(m.generation)&&m.generation>=gen&&m.generation<=headGeneration,'MD_IDB_SEGMENT_LIST');gen=m.generation;
  const row=await read(db,segId(recordId,m));check(row&&row.recordId===recordId&&row.body instanceof ArrayBuffer,'MD_IDB_SEGMENT_MISSING');
  const body=new Uint8Array(row.body);check(body.length===m.bytes&&sha(body)===m.sha256,'MD_IDB_SEGMENT_HASH');
  const o=await openEnvelope(body,{keyring:material.keyring,roster:material.roster,purpose:'local'});check(!nonces.has(o.nonceDomain),'MD_IDB_NONCE_REUSE');nonces.add(o.nonceDomain);
  check(o.digest===m.digest&&o.header.clientSequence===String(i+1)&&o.header.previousDeviceDigest===prev&&o.header.deviceId===material.identity.public.deviceId,'MD_IDB_SEGMENT_BINDING');
  const sp=decode(o.plaintext,{payload:true});
  check(sp.format==='LB_LOCAL_SEGMENT_1'&&sp.profileKey===recordId&&sp.index===i&&sp.generation===m.generation&&sp.from===m.from&&sp.to===m.to&&sp.previousSegment===prev&&Array.isArray(sp.records)&&Array.isArray(sp.operations)&&sp.records.length===m.to-m.from&&sp.operations.length===sp.records.length&&sp.receipts&&typeof sp.receipts==='object','MD_IDB_SEGMENT_BINDING');
  const ids=new Set(sp.records.map(r=>r.intentId));for(const k of Object.keys(sp.receipts))check(ids.has(k)&&!out.receiptKeys.has(k),'MD_IDB_SEGMENT_BINDING');
  out.records.push(...sp.records);out.operations.push(...sp.operations);Object.assign(out.receipts,sp.receipts);for(const k of Object.keys(sp.receipts))out.receiptKeys.add(k);
  prev=m.digest;from=m.to;
 }
 return out;
}
function browser(){check(globalThis.isSecureContext&&globalThis.indexedDB&&globalThis.crypto?.subtle,'MD_SECURE_BROWSER_REQUIRED');}
function dbOpen(){browser();return new Promise((ok,no)=>{const r=indexedDB.open(DATABASE_NAME,1);r.onupgradeneeded=()=>{check(r.oldVersion===undefined||r.oldVersion===0,'MD_IDB_VERSION');r.result.createObjectStore(STORE,{keyPath:'id'});};r.onerror=()=>no(r.error);r.onblocked=()=>no(new Error('MD_IDB_BLOCKED'));r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result);};});}
function read(db,id){return new Promise((ok,no)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(id);let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>ok(value);tx.onabort=()=>no(tx.error??new Error('MD_IDB_ABORT'));});}
function replace(db,record,expected,hooks,extra=[]){return new Promise((ok,no)=>{
 const tx=db.transaction(STORE,'readwrite',{durability:'strict'}),object=tx.objectStore(STORE),request=object.get(record.id);let cause=null;
 request.onsuccess=()=>{try{const old=request.result;check(expected?old&&old.generation===expected.generation&&old.head===expected.head:old===undefined,'MD_IDB_LOCAL_CAS');hooks?.beforePut?.(tx);if(cause)return;object.put(record);for(const x of extra)object.put(x);}catch(e){cause=e;try{tx.abort();}catch{}}};
 tx.oncomplete=()=>ok();tx.onabort=()=>no(cause??tx.error??new Error('MD_IDB_ABORT'));tx.onerror=()=>{};
 });}
const key=(origin,material)=>[origin,material.keyring.accountId,material.keyring.vaultId,material.identity.public.deviceId].join('|');
const secretCheck=s=>check(typeof s==='string'&&s.isWellFormed()&&s.length>=12&&s.length<=1024,'UNLOCK_SECRET_PROFILE');
export class SequentialIDBStore {
 #db;#record;#state;#material;#secret;#writer;#graph;#tail=Promise.resolve();#closed=false;#hooks;#poisoned=false;#plaintextBytes=null;#compaction={status:'NOT_EVALUATED'};#segments=[];#segmentReceiptKeys=new Set();
 static async profiles(){const db=await dbOpen();try{return await new Promise((ok,no)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll(globalThis.IDBKeyRange?.bound(location.origin+'|',location.origin+'|\uffff'));r.onsuccess=()=>ok(r.result.filter(x=>x.origin===location.origin).map(x=>({id:x.id,accountId:x.accountId,vaultId:x.vaultId,deviceId:x.deviceId,generation:x.generation})));r.onerror=()=>no(r.error);});}finally{db.close();}}
 static async createEnrolled(material,{unlockSecret,rollbackFloor,recoveryArtifactSha256,hooks}={}){
  browser();secretCheck(unlockSecret);check(material.checkpoint.generation===0&&material.checkpoint.head===null,'MD_NEW_DEVICE_TARGET');
  const self=new SequentialIDBStore();self.#db=await dbOpen();self.#material=material;self.#secret=unlockSecret;self.#hooks=hooks;self.#writer=WriterContext.create(material.keyring,material.identity,'local');
  self.#record={id:key(location.origin,material),origin:location.origin,accountId:material.keyring.accountId,vaultId:material.keyring.vaultId,deviceId:material.identity.public.deviceId,storeFormat:IDB_RECORD_FORMAT,generation:0,head:null,capsule:null,commits:[]};
  self.#state={format:'LBOS_LOCAL_STATE_1',accountId:material.keyring.accountId,vaultId:material.keyring.vaultId,deviceId:material.identity.public.deviceId,accepted:[],outbox:{},inbox:{},cursor:null,seenCursors:[],snapshotJobs:{},pairingClaims:{},roster:material.roster.evidence,userApp:{format:PROFILE,mode:'REAL',vaultId:material.keyring.vaultId,operations:[]},sequentialSync:sequentialState(material,{rollbackFloor,recoveryArtifactSha256})};
  try{await self.#write(self.#state,null);self.#compaction={status:'CURRENT',storeFormat:IDB_RECORD_FORMAT};return self;}catch(e){self.#writer.close();self.#db.close();throw e;}
 }
 static async open(id,unlockSecret,{hooks}={}){
  browser();secretCheck(unlockSecret);check(typeof id==='string'&&id.startsWith(location.origin+'|'),'MD_ORIGIN_BINDING');const self=new SequentialIDBStore();self.#db=await dbOpen();self.#hooks=hooks;
  try{
   const record=await read(self.#db,id);check(record&&record.origin===location.origin&&record.id===id,'MD_EXPLICIT_ENROLLMENT_REQUIRED');
   // Version gate first: an unknown newer layout is refused before the capsule is decrypted.
   check(record.storeFormat===undefined||record.storeFormat===4||record.storeFormat===IDB_RECORD_FORMAT,record.storeFormat>IDB_RECORD_FORMAT?'HOLD_STORE_FORMAT_NEWER_FAIL_CLOSED':'HOLD_STORE_FORMAT_INVALID');
   const material=await openLocalCapsule(new Uint8Array(record.capsule),unlockSecret);check(key(location.origin,material)===id&&same(material.checkpoint,{generation:record.generation,head:record.head}),'MD_IDB_CAPSULE_WITNESS');
   const compact=record.storeFormat>=4;if(compact)check(Array.isArray(record.commits)&&record.commits.length===1&&record.commits[0].generation===record.generation,'MD_IDB_COMPACT_SHAPE');
   let generation=compact?record.generation-1:0,head=null,state=null,roster=material.roster,plaintextBytes=null,segments=[],segmentReceiptKeys=new Set();const nonces=new Set();
   for(const row of record.commits){check(row.generation===generation+1&&sha(new Uint8Array(row.body))===row.bodyHash,'MD_IDB_COMMIT_CHAIN');const o=await openEnvelope(new Uint8Array(row.body),{keyring:material.keyring,roster,purpose:'local'});check(!nonces.has(o.nonceDomain),'MD_IDB_NONCE_REUSE');nonces.add(o.nonceDomain);const p=decode(o.plaintext,{payload:true});plaintextBytes=o.plaintext.length;
    if(compact){check(p.storeFormat===record.storeFormat,'MD_IDB_FORMAT_BINDING');if(p.generation===1)check(p.previous===null&&!Object.hasOwn(p,'compactedFrom'),'MD_IDB_COMPACTED_FROM');else{const c=p.compactedFrom;check(c&&Object.keys(c).sort().join('|')==='generation|head'&&c.generation===p.generation-1&&typeof c.head==='string'&&/^[a-f0-9]{64}$/.test(c.head)&&p.previous===c.head,'MD_IDB_COMPACTED_FROM');head=c.head;}}
    else check(!Object.hasOwn(p,'storeFormat')&&!Object.hasOwn(p,'compactedFrom'),'MD_IDB_FORMAT_BINDING');
    // Format 5: the sealed head lists its segments; each is content-checked, decrypted, chained, then the state is rebuilt.
    if(p.storeFormat>=5){const segs=await readSegments(self.#db,record.id,p.segments,{material:{...material,roster},nonces,headGeneration:p.generation});p.state=rebuild(p.state,segs);segments=p.segments.map(copy);segmentReceiptKeys=segs.receiptKeys;}
    else check(!Object.hasOwn(p,'segments'),'MD_IDB_SEGMENT_LIST');
    check(p.format==='LBOS_COMMIT_1'&&p.generation===row.generation&&p.previous===head&&o.header.clientSequence===String(row.generation)&&o.header.previousDeviceDigest===head,'MD_IDB_COMMIT_BINDING');check(p.state.accountId===material.keyring.accountId&&p.state.vaultId===material.keyring.vaultId&&p.state.deviceId===material.identity.public.deviceId,'MD_IDB_OWNER');if(state)check(state.userApp.operations.every((op,i)=>samePayload(op,p.state.userApp.operations[i]))&&state.sequentialSync.records.every((r,i)=>same(r,p.state.sequentialSync.records[i])),'MD_IDB_HISTORY_REWRITE');state=p.state;roster=await Roster.load(state.roster,material.keyring.genesisPin);generation++;head=o.digest;}
   check(same({generation,head},material.checkpoint)&&state,'MD_IDB_ROLLBACK');material.roster=roster;const validated=await validateSequentialState(state,material);
   self.#record=record;self.#material=material;self.#secret=unlockSecret;self.#state=state;self.#graph=validated.graph;self.#writer=WriterContext.create(material.keyring,material.identity,'local');self.#plaintextBytes=plaintextBytes;self.#segments=segments;self.#segmentReceiptKeys=segmentReceiptKeys;
   self.#compaction=record.storeFormat===IDB_RECORD_FORMAT?{status:'CURRENT',storeFormat:IDB_RECORD_FORMAT}:{status:'COMPACTION_PENDING',storeFormat:record.storeFormat??null,to:IDB_RECORD_FORMAT,reasons:[]};return self;
  }catch(e){self.#db.close();throw e;}
 }
 async #write(state,expected,extra=[],{replay}={}){
  const parsed=await validateSequentialState(state,this.#material,replay?{replay}:undefined),generation=this.#record.generation+1;
  // Layout: a chain record stays a chain and a format-4 record stays format 4 until the deferred migration (compactNow)
  // writes format 5. New profiles start at format 5.
  const storeFormat=extra.compactNow===true?IDB_RECORD_FORMAT:this.#record.storeFormat;
  const fields=storeFormat>=4?{storeFormat,...(generation>1?{compactedFrom:{generation:generation-1,head:this.#record.head}}:{})}:{};
  // Format 5: split, self-check (nothing is written on a mismatch), seal new segments; they go in the head's transaction.
  const split=storeFormat>=5?await this.#split(state,generation):null;
  if(split)this.#checkSplit(state,split);
  const segRows=[];
  if(split)for(const g of split.fresh){
   const id=segId(this.#record.id,g.meta),old=await read(this.#db,id);
   if(old){check(old.body instanceof ArrayBuffer&&sha(new Uint8Array(old.body))===g.meta.sha256,'MD_IDB_SEGMENT_CONFLICT');continue;}
   segRows.push({id,origin:'SEG|'+this.#record.origin,recordId:this.#record.id,index:g.meta.index,generation:g.meta.generation,sha256:g.meta.sha256,bytes:g.meta.bytes,body:buf(g.body)});
  }
  // All asynchronous crypto precedes the short IndexedDB transaction.
  const plaintext=payloadEncode({format:'LBOS_COMMIT_1',generation,previous:this.#record.head,...fields,...(split?{segments:split.segments}:{}),state:split?split.head:state});
  const body=await this.#writer.seal(plaintext,{objectId:randomId(),sequence:generation,previousDigest:this.#record.head,roster:this.#material.roster});
  const head=decode(body).digest,material={...this.#material,roster:parsed.roster,checkpoint:{generation,head}},capsule=await sealLocalCapsule(material,this.#secret);
  const compact=storeFormat>=4;
  const record={...this.#record,...(compact?{storeFormat}:{}),generation,head,capsule:buf(capsule),commits:[...(compact?[]:this.#record.commits),{generation,bodyHash:sha(body),body:buf(body)}]};
  await replace(this.#db,record,expected,this.#hooks,[...extra,...segRows]);this.#record=record;this.#state=state;this.#graph=parsed.graph;this.#material.roster=parsed.roster;this.#material.checkpoint={generation,head};this.#plaintextBytes=plaintext.length;
  if(split){this.#segments=split.segments;this.#segmentReceiptKeys=split.receiptKeys;}
 }
 // Splits a full state for format 5 (same rule as the PC store): segments only once the prefix is active.
 async #split(state,generation){
  const s=state.sequentialSync,ops=state.userApp.operations,covered=this.#segments.at(-1)?.to??0;
  const active=s.activation.status==='ACTIVE'&&ops.length===s.records.length;
  if(!active){check(this.#segments.length===0,'MD_IDB_SEGMENT_STATE');return {segments:[],head:state,fresh:[],receiptKeys:new Set()};}
  check(covered<=s.records.length,'MD_IDB_SEGMENT_STATE');
  let tailFrom=covered;const fresh=[],segments=this.#segments.map(copy),receiptKeys=new Set(this.#segmentReceiptKeys);
  const tailRows=s.records.length-covered,tailBytes=tailRows?payloadEncode({records:s.records.slice(covered),operations:ops.slice(covered)}).length:0;
  if(tailRows>=TAIL_ROWS||tailBytes>=TAIL_BYTES){
   let start=covered;
   while(start<s.records.length){
    let end=start,size=0;
    while(end<s.records.length){const add=payloadEncode([s.records[end],ops[end]]).length;if(end>start&&size+add>SEGMENT_TARGET)break;size+=add;end++;}
    const index=segments.length,prev=segments.at(-1)?.digest??null,receipts={};
    for(const r of s.records.slice(start,end))if(Object.hasOwn(s.receipts,r.intentId)){receipts[r.intentId]=copy(s.receipts[r.intentId]);receiptKeys.add(r.intentId);}
    const body=await this.#writer.seal(payloadEncode({format:'LB_LOCAL_SEGMENT_1',profileKey:this.#record.id,index,generation,from:start,to:end,previousSegment:prev,records:s.records.slice(start,end),operations:ops.slice(start,end),receipts}),{objectId:randomId(),sequence:index+1,previousDigest:prev,roster:this.#material.roster});
    const meta={index,generation,from:start,to:end,sha256:sha(body),digest:decode(body).digest,bytes:body.length};segments.push(meta);fresh.push({meta,body,records:s.records.slice(start,end),operations:ops.slice(start,end),receipts});start=end;
   }
   tailFrom=s.records.length;
  }
  const head=copy(state);head.sequentialSync.records=s.records.slice(tailFrom);head.userApp.operations=ops.slice(tailFrom);
  head.sequentialSync.receipts=Object.fromEntries(Object.entries(s.receipts).filter(([k])=>!receiptKeys.has(k)));
  return {segments,head,fresh,receiptKeys};
 }
 // Before anything is written: head tail + existing segment prefix + fresh segments must rebuild exactly this state.
 #checkSplit(state,split){
  const s=state.sequentialSync,covered=this.#segments.at(-1)?.to??0,segs={records:s.records.slice(0,covered),operations:state.userApp.operations.slice(0,covered),receipts:{},receiptKeys:new Set()};
  for(const k of this.#segmentReceiptKeys){check(Object.hasOwn(s.receipts,k),'MD_IDB_SPLIT_SELFCHECK');segs.receipts[k]=s.receipts[k];segs.receiptKeys.add(k);}
  for(const f of split.fresh){check(f.meta.from===segs.records.length,'MD_IDB_SPLIT_SELFCHECK');segs.records.push(...f.records);segs.operations.push(...f.operations);for(const [k,v] of Object.entries(f.receipts)){segs.receipts[k]=v;segs.receiptKeys.add(k);}}
  check(split.segments.length===this.#segments.length+split.fresh.length&&(split.segments.at(-1)?.to??0)===segs.records.length,'MD_IDB_SPLIT_SELFCHECK');
  check(sha(payloadEncode(rebuild(split.head,segs)))===sha(payloadEncode(state)),'MD_IDB_SPLIT_SELFCHECK');
 }
 // Re-reads the published format-5 record and its segments from IndexedDB; returns sha256 of the rebuilt state.
 async #readbackStateSha(){
  const record=await read(this.#db,this.#record.id);check(record&&record.generation===this.#record.generation&&record.head===this.#record.head&&record.storeFormat===IDB_RECORD_FORMAT&&record.commits?.length===1,'HOLD_MIGRATION_READBACK');
  const body=new Uint8Array(record.commits[0].body),o=await openEnvelope(body,{keyring:this.#material.keyring,roster:this.#material.roster,purpose:'local'});check(o.digest===record.head,'HOLD_MIGRATION_READBACK');
  const p=decode(o.plaintext,{payload:true});check(p.storeFormat===IDB_RECORD_FORMAT,'HOLD_MIGRATION_READBACK');
  const segs=await readSegments(this.#db,record.id,p.segments,{material:this.#material,nonces:new Set([o.nonceDomain]),headGeneration:p.generation});
  return sha(payloadEncode(rebuild(p.state,segs)));
 }
 // Deferred layout migration (chain -> 5, F9 format 4 -> 5), run by SequentialService right after a verified sync.
 // Preconditions: no pending intent/enrollment, not blocked/poisoned, verified sync, storage free >= 3x (record + segments).
 // One readwrite transaction writes the old record once under a backup key (excluded from profiles(), never openable),
 // the new segments and the new head; on any failure it aborts and nothing changes. A backup key that already holds
 // something is never overwritten: an exact or older copy of this profile in the source layout is kept and reused,
 // anything else defers the migration (BACKUP_CONFLICT). Nothing is ever deleted.
 compactAfterSync({synced=false,blocked=false}={}){const run=async()=>{
  if(this.#record.storeFormat===IDB_RECORD_FORMAT){if(this.#compaction.status!=='MIGRATED'&&this.#compaction.status!=='COMPACTION_HOLD_REOPEN')this.#compaction={status:'CURRENT',storeFormat:IDB_RECORD_FORMAT};return copy(this.#compaction);}
  const s=this.#state?.sequentialSync,reasons=[],from=this.#record.storeFormat??null;
  if(this.#closed||this.#poisoned)reasons.push('STORE_HOLD');if(blocked)reasons.push('BLOCKED');if(s?.pending)reasons.push('PENDING');if(s?.enrollment)reasons.push('ENROLLMENT');if(synced!==true)reasons.push('NOT_SYNCED');
  const size=this.#record.commits.reduce((n,c)=>n+c.body.byteLength,0)+(this.#record.capsule?.byteLength??0)+this.#segments.reduce((n,m)=>n+m.bytes,0);let free=null;
  try{const e=await (this.#hooks?.storageEstimate??(()=>globalThis.navigator?.storage?.estimate?.()))();if(e&&Number.isFinite(e.quota)&&Number.isFinite(e.usage))free=e.quota-e.usage;}catch{}
  if(free===null)reasons.push('DISK_UNKNOWN');else if(free<size*3)reasons.push('DISK_SPACE');
  const old=this.#record,prefix=from===4?'BACKUP5|':'BACKUP|',backup={...old,id:prefix+old.id,origin:prefix+old.origin,backupOf:old.id,backupFormat:from===4?'F4_BEFORE_F5':'CHAIN_BEFORE_F4'};
  let existing=null;if(!reasons.length){try{existing=await read(this.#db,backup.id);}catch{reasons.push('BACKUP_UNREADABLE');}}
  const reuse=!!existing&&existing.backupOf===old.id&&existing.origin===backup.origin&&existing.backupFormat===backup.backupFormat&&existing.storeFormat===old.storeFormat&&Number.isSafeInteger(existing.generation)&&existing.generation<=old.generation&&Array.isArray(existing.commits)&&existing.commits.length>=1;
  if(existing&&!reuse)reasons.push('BACKUP_CONFLICT');
  if(reasons.length){this.#compaction={status:'COMPACTION_DEFERRED',storeFormat:from,to:IDB_RECORD_FORMAT,reasons};return copy(this.#compaction);}
  const extra=Object.assign(reuse?[]:[backup],{compactNow:true}),next=copy(this.#state);
  try{await this.#write(next,this.checkpoint,extra);}
  catch(e){this.#compaction={status:'COMPACTION_DEFERRED',storeFormat:from,to:IDB_RECORD_FORMAT,reasons:['MIGRATION_FAILED:'+(typeof e?.code==='string'?e.code:e?.message??'UNKNOWN')]};return copy(this.#compaction);}
  // Published (atomic). Re-read head + segments; any failure (mismatch or an unreadable segment) is one HOLD: the Fold
  // cannot be reopened into a trusted state, so the screen sends the user to re-pair from the server (F10-5 review M1).
  await this.#hooks?.afterMigrationWrite?.();
  let cause=null;try{if(await this.#readbackStateSha()!==sha(payloadEncode(next)))cause='STATE_MISMATCH';}catch(e){cause=typeof e?.code==='string'?e.code:'UNKNOWN';}
  if(cause){this.#poisoned=true;this.#compaction={status:'COMPACTION_HOLD_REOPEN',storage:'INDEXEDDB',storeFormat:IDB_RECORD_FORMAT,to:IDB_RECORD_FORMAT,reasons:['MIGRATION_FAILED:HOLD_MIGRATION_READBACK'],cause};return copy(this.#compaction);}
  this.#compaction={status:'MIGRATED',from,to:IDB_RECORD_FORMAT,backup:backup.id,...(reuse?{reused:true}:{})};
  return copy(this.#compaction);
 };const p=this.#tail.then(run);this.#tail=p.catch(()=>{});return p;}
 get localState(){return {bytes:this.#plaintextBytes,limit:LOCAL_STATE_LIMIT,seal:{used:this.#writer?.diagnostics?.plaintextBytes??null,limit:2**30},recordFormat:this.#record?.storeFormat??null,compaction:copy(this.#compaction),segments:{count:this.#segments.length,bytes:this.#segments.reduce((n,m)=>n+m.bytes,0)}};}
 // F10-5: `replay` is the caller's per-save replay scope (B, memory only); without it every validation replays in full.
 transaction(mutator,{replay}={}){const run=async()=>{check(!this.#closed&&!this.#poisoned,'MD_IDB_CLOSED_OR_HOLD');const next=copy(this.#state);await mutator(next);check(this.#state.userApp.operations.every((op,i)=>samePayload(op,next.userApp.operations[i]))&&this.#state.sequentialSync.records.every((r,i)=>same(r,next.sequentialSync.records[i]))&&Object.entries(this.#state.sequentialSync.receipts).every(([id,r])=>same(r,next.sequentialSync.receipts[id])),'MD_IDB_HISTORY_REWRITE');try{await this.#write(next,this.checkpoint,[],{replay});}catch(e){this.#poisoned=true;throw e;}};const p=this.#tail.then(run);this.#tail=p.catch(()=>{});return p;}
 get state(){return copy(this.#state);}
 get material(){return this.#material;}
 get checkpoint(){return {generation:this.#record.generation,head:this.#record.head};}
 get roster(){return this.#material.roster;}
 get graph(){check(this.#graph,'MD_PREFIX_NOT_READY');return this.#graph;}
 get storageKind(){return 'ENCRYPTED_INDEXEDDB';}
 get poisoned(){return this.#poisoned;}
 get location(){return location.origin+' / '+DATABASE_NAME;}
 get id(){return this.#record.id;}
 get diagnostics(){return this.#writer.diagnostics;}
 async close(){await this.#tail;if(this.#closed)return;this.#closed=true;this.#writer?.close();this.#db.close();this.#secret=null;this.#material=null;this.#state=null;this.#graph=null;}
}
