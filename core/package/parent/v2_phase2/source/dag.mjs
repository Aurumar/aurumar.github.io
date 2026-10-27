import {compare,check, clone, canonical, hash, eq, sorted, freeze, keyOf, idOK} from './canonical.mjs';
import {validateValue, invariants} from './domain.mjs';
import {requireRoutineHistoryProvenance} from './routine-policy.mjs';

const revId=(opId,index)=>`${opId}#${index}`;
export class Graph {
  #received=new Map(); #accepted=new Map(); #rejected=new Map(); #revisions=new Map(); #faults=[];
  constructor({vault='SYNTHETIC_VAULT',mode='DEMO'}={}) {check(['DEMO','REAL'].includes(mode),'MODE');this.vault=vault;this.mode=mode;}
  get size(){return this.#accepted.size;}
  integrityFaults(){return clone(this.#faults);}
  operations(){return [...this.#accepted.values()].sort((a,b)=>compare(a.opId,b.opId)).map(clone);}
  received(){return [...this.#received.values()].sort((a,b)=>compare(a.opId,b.opId)).map(clone);}
  rejected(){return [...this.#rejected].map(([opId,code])=>({opId,code})).sort((a,b)=>compare(a.opId,b.opId));}
  pending(){return this.received().filter(o=>!this.#accepted.has(o.opId)&&!this.#rejected.has(o.opId)).map(o=>({opId:o.opId,missing:o.deps.filter(d=>!this.#accepted.has(d)),status:'PENDING'}));}
  has(id){return this.#accepted.has(id);}
  op(id){return clone(this.#accepted.get(id));}
  revisions(){return [...this.#revisions.values()].sort((a,b)=>compare(a.revisionId,b.revisionId)).map(clone);}
  revision(id){return clone(this.#revisions.get(id));}
  frontier(ids=this.#accepted.keys()) {
    const set=new Set(ids),parents=new Set();for(const id of set){const o=this.#accepted.get(id);check(o,'MISSING_DEPENDENCY',id);for(const d of o.deps)if(set.has(d))parents.add(d);}
    return sorted([...set].filter(id=>!parents.has(id)));
  }
  closure(frontier=this.frontier()) {
    const result=new Set(),queue=[...frontier];
    while(queue.length){const id=queue.pop();if(result.has(id))continue;const op=this.#accepted.get(id);check(op,'MISSING_DEPENDENCY',id);result.add(id);queue.push(...op.deps);}
    return result;
  }
  project(frontier) {
    const ids=frontier===undefined?new Set(this.#accepted.keys()):this.closure(frontier),groups=new Map(),consumed=new Set();
    for(const r of this.#revisions.values()) if(ids.has(r.opId)) {
      const key=keyOf(r.kind,r.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);r.parents.forEach(p=>consumed.add(p));
    }
    return [...groups].sort(([a],[b])=>compare(a,b)).map(([key,rs])=>{
      const hs=rs.filter(r=>!consumed.has(r.revisionId)).sort((a,b)=>compare(a.revisionId,b.revisionId));
      const alternatives=hs.map(r=>({revisionId:r.revisionId,value:clone(r.value),tombstone:r.value===null,device:r.device,provenance:clone(r.provenance)}));
      return {key,kind:hs[0].kind,id:hs[0].id,heads:hs.map(r=>r.revisionId),status:hs.length>1?'CONFLICT':hs[0].value===null?'DELETED':'RESOLVED',value:hs.length===1?clone(hs[0].value):null,alternatives};
    });
  }
  entity(kind,id,frontier){return this.project(frontier).find(e=>e.key===keyOf(kind,id))||{key:keyOf(kind,id),kind,id,heads:[],status:'MISSING',value:null,alternatives:[]};}
  conflicts(frontier) {
    const p=this.project(frontier),f=frontier===undefined?this.frontier():sorted(frontier);
    const row=p.filter(e=>e.status==='CONFLICT').map(e=>({id:hash({vault:this.vault,key:e.key,heads:e.heads}),scope:'ENTITY',keys:[e.key],reason:e.alternatives.some(a=>a.tombstone)?'TOMBSTONE_VS_BRANCH':'CONCURRENT_HEADS',heads:e.heads,frontier:f,ancestry:this.history(e.kind,e.id,frontier).map(r=>r.revisionId),status:'OPEN',decisions:this.history(e.kind,e.id,frontier).filter(r=>r.intent==='RESOLVE').map(r=>({revisionId:r.revisionId,provenance:r.provenance}))}));
    return [...row,...invariants(p).map(c=>({...c,frontier:f}))].sort((a,b)=>compare(a.id,b.id));
  }
  history(kind,id,frontier) {
    const ids=frontier===undefined?new Set(this.#accepted.keys()):this.closure(frontier);
    return this.revisions().filter(r=>r.kind===kind&&r.id===id&&ids.has(r.opId));
  }
  digest(){return hash({frontier:this.frontier(),operations:this.operations(),projection:this.project(),conflicts:this.conflicts()});}
  ingest(input) {
    const o=freeze(clone(input));this.#shape(o);
    const previous=this.#received.get(o.opId);
    if(previous){if(!eq(previous,o)){this.#faults.push({code:'OP_ID_COLLISION',retained:hash(previous),rejected:clone(o)});check(false,'OP_ID_COLLISION');}return this.#accepted.has(o.opId)?'DUPLICATE':this.#rejected.has(o.opId)?'REJECTED':'PENDING';}
    for(const p of this.#received.values())if(p.device===o.device&&p.seq===o.seq){this.#faults.push({code:'WRITER_SEQUENCE_COLLISION',retained:hash(p),rejected:clone(o)});check(false,'WRITER_SEQUENCE_COLLISION');}
    this.#received.set(o.opId,o);this.#drain();
    if(this.#rejected.has(o.opId))check(false,this.#rejected.get(o.opId));
    return this.#accepted.has(o.opId)?'ACCEPTED':'PENDING';
  }
  #shape(o) {
    canonical(o);check(o.version===1&&o.vault===this.vault&&o.mode===this.mode,'NAMESPACE_OR_VERSION');
    check(idOK(o.opId)&&idOK(o.device)&&Number.isSafeInteger(o.seq)&&o.seq>0&&Number.isSafeInteger(o.window)&&o.window>0,'OP_IDENTITY');
    check(Array.isArray(o.deps)&&eq(o.deps,sorted(o.deps))&&!o.deps.includes(o.opId)&&o.deps.every(idOK),'DEPENDENCY_SCHEMA');
    check(o.prev===null||typeof o.prev==='string'&&o.deps.includes(o.prev),'WRITER_PREDECESSOR');
    check(Array.isArray(o.edits)&&o.edits.length<=1000,'EDIT_LIMIT');
    check((o.control===null&&o.edits.length>0)||(['SEAL','FENCE'].includes(o.control?.type)&&o.edits.length===0),'OP_KIND');
    check(o.provenance&&typeof o.provenance.reason==='string','PROVENANCE');
    const keys=new Set();o.edits.forEach((e,i)=>{
      check(Array.isArray(e.parents)&&eq(e.parents,sorted(e.parents)),'REVISION_PARENTS');
      const k=keyOf(e.kind,e.id);check(!keys.has(k),'DUPLICATE_ENTITY_IN_BATCH');keys.add(k);
      check(['CREATE','EDIT','TOMBSTONE','RESTORE','RESOLVE','IMPORT'].includes(e.intent),'INTENT');
      validateValue(e,revId(o.opId,i),o.provenance);
    });
    if(o.control?.type==='SEAL')check(typeof o.control.parent==='string'&&typeof o.control.proposal==='string','SEAL_SCHEMA');
    if(o.control?.type==='FENCE')check(o.control.reason==='OBSERVED_NEXT_WINDOW','FENCE_SCHEMA');
    check(canonical(o).length<=2_000_000,'OP_SIZE_LIMIT');
  }
  #validate(o) {
    const closure=this.closure(o.deps),view=this.project(o.deps);
    const rejoin=o.provenance.causalRejoin===true;
    if(rejoin) {
      check(o.edits.length===1&&o.edits[0].kind==='DEVICE'&&o.edits[0].id===o.device&&o.edits[0].value?.state==='ACTIVE','REJOIN_SCHEMA');
      const old=view.find(e=>e.key===keyOf('DEVICE',o.device));
      check(!old||old.status==='RESOLVED'&&['DORMANT','REVOKED'].includes(old.value.state),'REJOIN_STATE');
      if(old?.value.state==='REVOKED')check(o.provenance.userDecision?.confirmed===true,'EXPLICIT_RECOVERY_REQUIRED');
      const observed=this.operations().filter(p=>closure.has(p.opId)).map(p=>p.window+(p.control?1:0));
      check(o.window===Math.max(1,...observed),'REJOIN_WINDOW');
    }
    if(o.seq===1)check(o.prev===null&&(o.window===1||rejoin),'FIRST_SEQUENCE');
    else {const p=this.#accepted.get(o.prev);check(p?.device===o.device&&p.seq===o.seq-1,'WRITER_SEQUENCE_GAP');check(rejoin||o.window===p.window+(p.control?1:0),'WINDOW_FENCE');}
    const past=this.operations().filter(p=>closure.has(p.opId)&&p.device===o.device);
    check(!past.some(p=>p.seq>=o.seq),'WRITER_REWIND');
    if(o.control) {
      check(this.operations().filter(p=>closure.has(p.opId)).every(p=>p.window<=o.window),'SEAL_FUTURE_DEPENDENCY');
      return;
    }
    for(let i=0;i<o.edits.length;i++) {
      const e=o.edits[i],old=view.find(x=>x.key===keyOf(e.kind,e.id));
      check(eq(e.parents,old?.heads||[]),'CAUSAL_HEAD_SET');
      if(e.parents.length>1 || e.intent==='RESOLVE')check(e.intent==='RESOLVE'&&o.provenance.userDecision?.confirmed===true&&o.provenance.userDecision.reviewer&&o.provenance.reason.trim(),'EXPLICIT_RESOLUTION_REQUIRED');
      if(!old)check(['CREATE','IMPORT'].includes(e.intent),'CREATE_REQUIRED');
      else if(e.value===null)check(['TOMBSTONE','RESOLVE'].includes(e.intent),'TOMBSTONE_INTENT');
      else if(old.status==='DELETED')check(['RESTORE','RESOLVE'].includes(e.intent),'RESTORE_REQUIRED');
      else check(!['CREATE','IMPORT','TOMBSTONE'].includes(e.intent),'EDIT_INTENT');
      if(e.kind==='DEVICE') {
        check(e.value!==null,'DEVICE_HISTORY_REQUIRED');
        check(e.id===o.device || e.value.state==='REVOKED'&&o.provenance.userDecision?.confirmed===true,'DEVICE_TRANSITION_AUTHORITY');
      }
      if(e.kind==='OBSERVATION'&&e.value&&e.value.preMigrationSourceRevision!=='UNKNOWN') {
        const source=this.#revisions.get(e.value.source.revisionId);
        check(source&&closure.has(source.opId)&&source.kind===e.value.source.kind&&source.id===e.value.source.id,'OBSERVATION_CAUSAL_SOURCE');
      }
    }
    // Validate the author's causal view, never the receiver's arrival-dependent latest view.
    const next=new Map(view.map(e=>[e.key,e]));
    o.edits.forEach((e,i)=>next.set(keyOf(e.kind,e.id),{key:keyOf(e.kind,e.id),kind:e.kind,id:e.id,heads:[revId(o.opId,i)],status:e.value===null?'DELETED':'RESOLVED',value:e.value,alternatives:[]}));
    const before=new Set(invariants(view).map(c=>c.id)),introduced=invariants([...next.values()]).filter(c=>!before.has(c.id));
    check(!introduced.length,'LOCAL_INVARIANT_VIOLATION',introduced);
    // Every ROUTINE intent uses its typed causal history, including an empty
    // first-revision baseline. All schema, intent and relation checks precede
    // this gate; accepted maps are written only after every edit passes.
    o.edits.forEach((e,i)=>{
      if(e.kind==='ROUTINE')requireRoutineHistoryProvenance(this.history(e.kind,e.id,o.deps),{...clone(e),revisionId:revId(o.opId,i)},o.provenance);
    });
  }
  #drain() {
    let progress=true;
    while(progress){progress=false;
      for(const o of this.received()) {
        if(this.#accepted.has(o.opId)||this.#rejected.has(o.opId)||!o.deps.every(d=>this.#accepted.has(d)))continue;
        try{
          this.#validate(o);this.#accepted.set(o.opId,freeze(o));
          o.edits.forEach((e,i)=>this.#revisions.set(revId(o.opId,i),freeze({...clone(e),revisionId:revId(o.opId,i),opId:o.opId,device:o.device,window:o.window,provenance:clone(o.provenance)})));
        }catch(e){this.#rejected.set(o.opId,e.code||e.message);}
        progress=true;
      }
    }
  }
  at(frontier) {const ids=this.closure(frontier);return Graph.replay(this.operations().filter(o=>ids.has(o.opId)),{vault:this.vault,mode:this.mode});}
  static replay(operations,options) {const g=new Graph(options);for(const o of operations)g.ingest(o);return g;}
}

export function makeOperation(graph,device,edits,{provenance={reason:'Ordinary edit'},control=null,window,frontier=graph.frontier(),opId,businessDate}={}) {
  const closure=graph.closure(frontier),previous=graph.operations().filter(o=>o.device===device&&closure.has(o.opId)).sort((a,b)=>b.seq-a.seq)[0];
  const seq=(previous?.seq||0)+1;
  return {version:1,vault:graph.vault,mode:graph.mode,opId:opId||`${device}:${seq}`,device,seq,prev:previous?.opId||null,
    window:window??(previous?previous.window+(previous.control?1:0):1),
    deps:sorted([...frontier,...(previous?[previous.opId]:[])]),control,provenance:{...clone(provenance),...(businessDate?{recordedLocalDate:businessDate}:{})},
    edits:edits.map(e=>{const old=graph.entity(e.kind,e.id,frontier);return {kind:e.kind,id:e.id,parents:e.parents??old.heads,value:clone(e.value),temporal:e.temporal??null,intent:e.intent??(!old.heads.length?'CREATE':e.value===null?'TOMBSTONE':old.status==='DELETED'?'RESTORE':'EDIT')};})};
}
