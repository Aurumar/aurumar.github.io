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
export const IDB_RECORD_FORMAT=4;const LOCAL_STATE_LIMIT=4_500_000;
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
 #db;#record;#state;#material;#secret;#writer;#graph;#tail=Promise.resolve();#closed=false;#hooks;#poisoned=false;#plaintextBytes=null;#compaction={status:'NOT_EVALUATED'};
 static async profiles(){const db=await dbOpen();try{return await new Promise((ok,no)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>ok(r.result.filter(x=>x.origin===location.origin).map(x=>({id:x.id,accountId:x.accountId,vaultId:x.vaultId,deviceId:x.deviceId,generation:x.generation})));r.onerror=()=>no(r.error);});}finally{db.close();}}
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
   check(record.storeFormat===undefined||record.storeFormat===IDB_RECORD_FORMAT,record.storeFormat>IDB_RECORD_FORMAT?'HOLD_STORE_FORMAT_NEWER_FAIL_CLOSED':'HOLD_STORE_FORMAT_INVALID');
   const material=await openLocalCapsule(new Uint8Array(record.capsule),unlockSecret);check(key(location.origin,material)===id&&same(material.checkpoint,{generation:record.generation,head:record.head}),'MD_IDB_CAPSULE_WITNESS');
   const compact=record.storeFormat===IDB_RECORD_FORMAT;if(compact)check(Array.isArray(record.commits)&&record.commits.length===1&&record.commits[0].generation===record.generation,'MD_IDB_COMPACT_SHAPE');
   let generation=compact?record.generation-1:0,head=null,state=null,roster=material.roster,plaintextBytes=null;const nonces=new Set();
   for(const row of record.commits){check(row.generation===generation+1&&sha(new Uint8Array(row.body))===row.bodyHash,'MD_IDB_COMMIT_CHAIN');const o=await openEnvelope(new Uint8Array(row.body),{keyring:material.keyring,roster,purpose:'local'});check(!nonces.has(o.nonceDomain),'MD_IDB_NONCE_REUSE');nonces.add(o.nonceDomain);const p=decode(o.plaintext,{payload:true});plaintextBytes=o.plaintext.length;
    if(compact){check(p.storeFormat===IDB_RECORD_FORMAT,'MD_IDB_FORMAT_BINDING');if(p.generation===1)check(p.previous===null&&!Object.hasOwn(p,'compactedFrom'),'MD_IDB_COMPACTED_FROM');else{const c=p.compactedFrom;check(c&&Object.keys(c).sort().join('|')==='generation|head'&&c.generation===p.generation-1&&typeof c.head==='string'&&/^[a-f0-9]{64}$/.test(c.head)&&p.previous===c.head,'MD_IDB_COMPACTED_FROM');head=c.head;}}
    else check(!Object.hasOwn(p,'storeFormat')&&!Object.hasOwn(p,'compactedFrom'),'MD_IDB_FORMAT_BINDING');
    check(p.format==='LBOS_COMMIT_1'&&p.generation===row.generation&&p.previous===head&&o.header.clientSequence===String(row.generation)&&o.header.previousDeviceDigest===head,'MD_IDB_COMMIT_BINDING');check(p.state.accountId===material.keyring.accountId&&p.state.vaultId===material.keyring.vaultId&&p.state.deviceId===material.identity.public.deviceId,'MD_IDB_OWNER');if(state)check(state.userApp.operations.every((op,i)=>samePayload(op,p.state.userApp.operations[i]))&&state.sequentialSync.records.every((r,i)=>same(r,p.state.sequentialSync.records[i])),'MD_IDB_HISTORY_REWRITE');state=p.state;roster=await Roster.load(state.roster,material.keyring.genesisPin);generation++;head=o.digest;}
   check(same({generation,head},material.checkpoint)&&state,'MD_IDB_ROLLBACK');material.roster=roster;const validated=await validateSequentialState(state,material);
   self.#record=record;self.#material=material;self.#secret=unlockSecret;self.#state=state;self.#graph=validated.graph;self.#writer=WriterContext.create(material.keyring,material.identity,'local');self.#plaintextBytes=plaintextBytes;
   self.#compaction=compact?{status:'CURRENT',storeFormat:IDB_RECORD_FORMAT}:{status:'COMPACTION_PENDING',storeFormat:null,to:IDB_RECORD_FORMAT,reasons:[]};return self;
  }catch(e){self.#db.close();throw e;}
 }
 async #write(state,expected,extra=[]){
  const parsed=await validateSequentialState(state,this.#material),generation=this.#record.generation+1;
  // Format 4: one commit, the sealed payload names the dropped predecessor. A chain-layout record stays a chain until compacted.
  const compact=this.#record.storeFormat===IDB_RECORD_FORMAT||extra.compactNow===true,fields=compact?{storeFormat:IDB_RECORD_FORMAT,...(generation>1?{compactedFrom:{generation:generation-1,head:this.#record.head}}:{})}:{};
  // All asynchronous crypto precedes the short IndexedDB transaction.
  const plaintext=payloadEncode({format:'LBOS_COMMIT_1',generation,previous:this.#record.head,...fields,state});
  const body=await this.#writer.seal(plaintext,{objectId:randomId(),sequence:generation,previousDigest:this.#record.head,roster:this.#material.roster});
  const head=decode(body).digest,material={...this.#material,roster:parsed.roster,checkpoint:{generation,head}},capsule=await sealLocalCapsule(material,this.#secret);
  const record={...this.#record,...(compact?{storeFormat:IDB_RECORD_FORMAT}:{}),generation,head,capsule:capsule.buffer.slice(capsule.byteOffset,capsule.byteOffset+capsule.byteLength),commits:[...(compact?[]:this.#record.commits),{generation,bodyHash:sha(body),body:body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)}]};
  await replace(this.#db,record,expected,this.#hooks,[...extra]);this.#record=record;this.#state=state;this.#graph=parsed.graph;this.#material.roster=parsed.roster;this.#material.checkpoint={generation,head};this.#plaintextBytes=plaintext.length;
 }
 // F9 deferred compaction of a chain-layout record, run by SequentialService right after a verified sync.
 // Preconditions: no pending intent/enrollment, not blocked/poisoned, verified sync, storage free >= 3x record.
 // One readwrite transaction writes the compacted record and keeps the old record once under a BACKUP| key
 // (excluded from profiles() and never openable as a profile). On any failure the transaction aborts and nothing changes.
 compactAfterSync({synced=false,blocked=false}={}){const run=async()=>{
  if(this.#record.storeFormat===IDB_RECORD_FORMAT){if(this.#compaction.status!=='MIGRATED')this.#compaction={status:'CURRENT',storeFormat:IDB_RECORD_FORMAT};return copy(this.#compaction);}
  const s=this.#state?.sequentialSync,reasons=[];
  if(this.#closed||this.#poisoned)reasons.push('STORE_HOLD');if(blocked)reasons.push('BLOCKED');if(s?.pending)reasons.push('PENDING');if(s?.enrollment)reasons.push('ENROLLMENT');if(synced!==true)reasons.push('NOT_SYNCED');
  const size=this.#record.commits.reduce((n,c)=>n+c.body.byteLength,0)+(this.#record.capsule?.byteLength??0);let free=null;
  try{const e=await (this.#hooks?.storageEstimate??(()=>globalThis.navigator?.storage?.estimate?.()))();if(e&&Number.isFinite(e.quota)&&Number.isFinite(e.usage))free=e.quota-e.usage;}catch{}
  if(free===null)reasons.push('DISK_UNKNOWN');else if(free<size*3)reasons.push('DISK_SPACE');
  if(reasons.length){this.#compaction={status:'COMPACTION_DEFERRED',storeFormat:null,to:IDB_RECORD_FORMAT,reasons};return copy(this.#compaction);}
  const old=this.#record,backup={...old,id:'BACKUP|'+old.id,origin:'BACKUP|'+old.origin,backupOf:old.id,backupFormat:'CHAIN_BEFORE_F4'},extra=Object.assign([backup],{compactNow:true});
  try{await this.#write(copy(this.#state),this.checkpoint,extra);this.#compaction={status:'MIGRATED',from:null,to:IDB_RECORD_FORMAT,backup:backup.id};}
  catch(e){this.#compaction={status:'COMPACTION_DEFERRED',storeFormat:null,to:IDB_RECORD_FORMAT,reasons:['MIGRATION_FAILED:'+(typeof e?.code==='string'?e.code:e?.message??'UNKNOWN')]};}
  return copy(this.#compaction);
 };const p=this.#tail.then(run);this.#tail=p.catch(()=>{});return p;}
 get localState(){return {bytes:this.#plaintextBytes,limit:LOCAL_STATE_LIMIT,recordFormat:this.#record?.storeFormat??null,compaction:copy(this.#compaction)};}
 transaction(mutator){const run=async()=>{check(!this.#closed&&!this.#poisoned,'MD_IDB_CLOSED_OR_HOLD');const next=copy(this.#state);await mutator(next);check(this.#state.userApp.operations.every((op,i)=>samePayload(op,next.userApp.operations[i]))&&this.#state.sequentialSync.records.every((r,i)=>same(r,next.sequentialSync.records[i]))&&Object.entries(this.#state.sequentialSync.receipts).every(([id,r])=>same(r,next.sequentialSync.receipts[id])),'MD_IDB_HISTORY_REWRITE');try{await this.#write(next,this.checkpoint);}catch(e){this.#poisoned=true;throw e;}};const p=this.#tail.then(run);this.#tail=p.catch(()=>{});return p;}
 get state(){return copy(this.#state);}
 get material(){return this.#material;}
 get checkpoint(){return {generation:this.#record.generation,head:this.#record.head};}
 get roster(){return this.#material.roster;}
 get graph(){check(this.#graph,'MD_PREFIX_NOT_READY');return this.#graph;}
 get storageKind(){return 'ENCRYPTED_INDEXEDDB';}
 get location(){return location.origin+' / '+DATABASE_NAME;}
 get id(){return this.#record.id;}
 get diagnostics(){return this.#writer.diagnostics;}
 async close(){await this.#tail;if(this.#closed)return;this.#closed=true;this.#writer?.close();this.#db.close();this.#secret=null;this.#material=null;this.#state=null;this.#graph=null;}
}
