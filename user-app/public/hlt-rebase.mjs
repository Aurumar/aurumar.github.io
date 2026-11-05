// HLT_DAY 카드의 rebase(확정 직전 최신 카드 위에 내 초안을 다시 얹기). 순수 함수 — 시계·저장소·화면에 의존하지 않는다. B3 + 보완 R2.
// 3자 병합: base(내가 편집을 시작한 시점의 카드) / mine(내 초안) / latest(확정 직전 서버 최신 카드). item id 단위로 합친다.
//  ① 추가는 합집합. 같은 id를 양쪽이 서로 다른 내용으로 추가했으면 새 id를 주지 않고 충돌로 보고(REJECTED, 아무것도 저장 안 함).
//  ② 같은 id를 양쪽이 고쳤으면 확정하는 쪽(mine) 값을 쓰고 알림에 상대 값과 내 값을 보여 준다(이전 값은 그래프 이력).
//  ③ 내 삭제 vs 상대 수정: 상대 수정을 유지(REBASE_CONFLICT_KEPT_REMOTE).  ⑤ 상대 삭제 vs 내 수정: 내 수정을 유지해 되살림(REBASE_CONFLICT_KEPT_LOCAL).
//  ⑥ 양쪽 삭제: 삭제 유지, 알림 없음.  ④ 결과는 검증 규칙으로 다시 검사. ⑨ 위반하면 아무것도 저장하지 않는다(자동 삭제·분할 없음).
//  ⑧ 결과가 최신 카드와 같으면 op를 쓰지 않는다(ALREADY_APPLIED).  confirmCount는 초안이 아니라 최신 카드 값 + 1.
//  note: 한쪽만 바뀌었으면 그쪽, 양쪽이 바뀌었으면 mine + 알림.
// B58C: rebase 규칙은 그대로다. 쌓기 전에 소유자에게 물어야 하는 겹침은 rebaseChoices가 찾고, 답은 applyChoices가 rebase 입력으로 옮긴다.
import {validateHltData,STEPS_ITEM_ID} from './hlt-model.mjs';

export function stable(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}
const same=(a,b)=>stable(a)===stable(b);
const itemsOf=c=>c?c.items:[];
const noteOf=c=>c&&Object.hasOwn(c,'note')?c.note:null;
export const emptyCard=date=>({date,items:[],confirmCount:0});

// base 대비 변경 목록(item id 단위) — 화면 표시·시험용. 초안에는 이 목록을 따로 저장하지 않고 (base, mine)에서 언제든 다시 계산한다.
export function diffCard(base,mine){
  const B=new Map(itemsOf(base).map(i=>[i.id,i])),M=new Map(itemsOf(mine).map(i=>[i.id,i]));
  const added=[],modified=[],removed=[];
  for(const [id,m] of M){if(!B.has(id))added.push(m);else if(!same(B.get(id),m))modified.push(m);}
  for(const id of B.keys())if(!M.has(id))removed.push(id);
  const nb=noteOf(base),nm=noteOf(mine);
  return {added,modified,removed,note:same(nb,nm)?null:{from:nb,to:nm}};
}
export function hasChanges(base,mine){const d=diffCard(base,mine);return d.added.length+d.modified.length+d.removed.length>0||d.note!==null;}

const sortById=items=>[...items].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
export function sameContent(a,b){return same(sortById(itemsOf(a)),sortById(itemsOf(b)))&&same(noteOf(a),noteOf(b));}

export function rebase({date,base,mine,latest}){
  const B=new Map(itemsOf(base).map(i=>[i.id,i])),M=new Map(itemsOf(mine).map(i=>[i.id,i])),T=new Map(itemsOf(latest).map(i=>[i.id,i]));
  const notices=[],keep=new Map();
  const ids=[...new Set([...T.keys(),...M.keys(),...B.keys()])];
  for(const id of ids){
    const b=B.get(id),m=M.get(id),t=T.get(id);
    if(b===undefined){
      if(m!==undefined&&t!==undefined){
        if(!same(m,t))return {status:'REJECTED',code:'REBASE_ID_COLLISION',itemId:id,notices};
        keep.set(id,t);
      }else keep.set(id,m!==undefined?m:t);
      continue;
    }
    const mineState=m===undefined?'deleted':same(m,b)?'same':'modified';
    const theirState=t===undefined?'deleted':same(t,b)?'same':'modified';
    if(mineState==='same'){if(theirState!=='deleted')keep.set(id,t);continue;}   // 내 변경 없음: 상대 결과를 따른다(상대 삭제 포함)
    if(mineState==='modified'){
      if(theirState==='same'||theirState==='modified'&&same(m,t)){keep.set(id,m);continue;}
      if(theirState==='modified'){keep.set(id,m);notices.push({code:'REBASE_VALUE_OVERWRITTEN',itemId:id,profileKey:m.profileKey??null,remote:t,mine:m});continue;}
      keep.set(id,m);notices.push({code:'REBASE_CONFLICT_KEPT_LOCAL',itemId:id,profileKey:m.profileKey??null,mine:m});continue;   // 상대 삭제 vs 내 수정
    }
    // mineState==='deleted'
    if(theirState==='modified'){keep.set(id,t);notices.push({code:'REBASE_CONFLICT_KEPT_REMOTE',itemId:id,profileKey:t.profileKey??null,remote:t});}
    // same·deleted: 삭제 적용(양쪽 삭제는 알림 없음)
  }
  // 순서: 최신 카드의 순서를 먼저, 그다음 내가 더하거나 되살린 항목을 내 초안의 순서로.
  const order=[...T.keys(),...M.keys()].filter((id,i,a)=>a.indexOf(id)===i);
  const items=order.filter(id=>keep.has(id)).map(id=>keep.get(id));
  const nb=noteOf(base),nm=noteOf(mine),nt=noteOf(latest);
  let note=nt;
  if(!same(nm,nb)){
    if(same(nt,nb)||same(nt,nm))note=nm;
    else{note=nm;notices.push({code:'NOTE_OVERWRITTEN',remote:nt,mine:nm});}
  }
  const merged={date,items,confirmCount:(latest?latest.confirmCount:0)+1};
  if(note!==null)merged.note=note;
  if(latest?sameContent(merged,latest):!items.length&&note===null)return {status:'ALREADY_APPLIED',notices};
  try{validateHltData('HLT_DAY',date,merged);}
  catch(e){return {status:'REJECTED',code:e.code??'HLT_REBASE_INVALID',notices,detail:{items:items.length}};}
  return {status:'MERGED',card:merged,notices};
}

// B58C: 쌓기 전에 소유자에게 물어야 하는 겹침(순수 함수). 없으면 [].
//  sleep: 양쪽이 서로 다른 끝난 main 수면을 새로 가져왔다. 그대로 합치면 리듬 요약이 두 밤을 더한다(hlt-projection.mjs:39).
//  steps: 걸음 고정 id를 양쪽이 서로 다른 값으로 처음 넣었다. 그대로면 rebase가 식사·수면까지 카드 전체를 막는다(REBASE_ID_COLLISION).
// 한 초안 안의 여러 수면(나눠 잔 밤을 직접 적음)이나 base에 이미 있던 수면 곁에 더한 수면은 묻지 않는다: 겹침을 보고 적은 것이다.
// mine·theirs = 그쪽이 가져온 항목. sig = 이 겹침의 내용 지문: 답은 지문에 묶이므로 그 사이 내용이 바뀌면 다시 묻는다.
const isClosedMain=i=>i?.type==='sleep'&&i.kind==='main'&&i.endAt!==null;
export function rebaseChoices({base,mine,latest}){
  const B=new Map(itemsOf(base).map(i=>[i.id,i])),M=new Map(itemsOf(mine).map(i=>[i.id,i])),T=new Map(itemsOf(latest).map(i=>[i.id,i]));
  const choice=(kind,m,t)=>({kind,mine:m,theirs:t,sig:kind+':'+stable({mine:sortById(m),theirs:sortById(t)})});
  const out=[];
  const ms=M.get(STEPS_ITEM_ID),ts=T.get(STEPS_ITEM_ID);
  if(ms&&ts&&!B.has(STEPS_ITEM_ID)&&!same(ms,ts))out.push(choice('steps',[ms],[ts]));
  const mineNew=[...M.values()].filter(m=>isClosedMain(m)&&!same(m,B.get(m.id))&&!same(m,T.get(m.id)));
  const theirsNew=[...T.values()].filter(t=>{
    const b=B.get(t.id),m=M.get(t.id);
    if(!isClosedMain(t)||isClosedMain(b)||same(t,m))return false;
    return !(b&&m&&!same(m,b));   // 같은 항목을 양쪽이 고침: 한 항목으로 남는다(rebase가 내 값 + 알림)
  });
  if(mineNew.length&&theirsNew.length)out.push(choice('sleep',mineNew,theirsNew));
  return out;
}
const baseWith=(base,date,B)=>({...(base??{date,confirmCount:0}),items:[...B.values()]});
// 답(answers[sig]='MINE'|'THEIRS')을 rebase 입력으로 옮긴다(새 병합 규칙을 만들지 않는다).
//  MINE: 상대가 가져온 항목을 base에 넣어 "상대 변경 없음"으로 만든다. 내가 안 가진 항목은 내 삭제로 빠지고 같은 id면 내 값이 남는다(쌓여 있던 값은 그래프 이력에 남음).
//  THEIRS: 내가 가져온 항목을 초안에서 뺀다(고친 항목이면 base 값으로 되돌림). 나머지는 상대 결과를 따른다.
export function applyChoices({date,base,mine,latest},answers){
  const B=new Map(itemsOf(base).map(i=>[i.id,i])),M=new Map(itemsOf(mine).map(i=>[i.id,i]));
  for(const c of rebaseChoices({base,mine,latest})){
    if(answers?.[c.sig]==='MINE'){
      const keep=new Set(c.mine.map(i=>i.id));
      for(const t of c.theirs){B.set(t.id,t);if(!keep.has(t.id))M.delete(t.id);}
    }else if(answers?.[c.sig]==='THEIRS'){
      for(const m of c.mine){const b=B.get(m.id);if(b)M.set(m.id,b);else M.delete(m.id);}
    }
  }
  return {date,base:baseWith(base,date,B),mine:{...mine,items:[...M.values()]},latest};
}
// 지금 쌓으면 어떤 카드가 되는지 미리 본다(쓰기 없음). 같은 id의 겹침은 내 초안 값으로 보고, 서로 다른 id의 수면 겹침은 둘 다 보인다(쌓을 때 물음).
export function previewRebase({date,base,mine,latest}){
  const choices=rebaseChoices({base,mine,latest}),B=new Map(itemsOf(base).map(i=>[i.id,i]));
  for(const c of choices)for(const t of c.theirs)if(c.mine.some(m=>m.id===t.id))B.set(t.id,t);
  const rb=rebase({date,base:baseWith(base,date,B),mine,latest});
  return {card:rb.status==='MERGED'?rb.card:rb.status==='ALREADY_APPLIED'?latest??mine:mine,blocked:rb.status==='REJECTED',code:rb.code??null,choices,notices:rb.notices};
}
