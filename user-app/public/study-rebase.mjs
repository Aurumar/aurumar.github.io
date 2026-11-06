// STUDY_DAY 카드의 rebase(확정 직전 최신 카드 위에 내 초안을 다시 얹기). 순수 함수 — 시계·저장소·화면에 의존하지 않는다. B4.
// hlt-rebase(B3+R2)의 3자 병합 규칙을 그대로 옮기되, 카드가 항목 배열 하나가 아니라 sessions·mistakes·reviews 세 배열이라 배열마다 같은 규칙을 적용한다(hlt-rebase는 수정하지 않았고 이 파일은 그 규칙을 일반화한 사본이다).
// base(내가 편집을 시작한 시점의 카드) / mine(내 초안) / latest(확정 직전 서버 최신 카드). 항목 id 단위로 합친다.
//  ① 추가는 합집합. 같은 id를 양쪽이 서로 다른 내용으로 추가했으면 새 id를 주지 않고 충돌로 보고(REJECTED, 아무것도 저장 안 함).
//  ② 같은 id를 양쪽이 고쳤으면 확정하는 쪽(mine) 값을 쓰고 알림에 상대 값과 내 값을 보여 준다(이전 값은 그래프 이력).
//  ③ 내 삭제 vs 상대 수정: 상대 수정을 유지(REBASE_CONFLICT_KEPT_REMOTE).  ⑤ 상대 삭제 vs 내 수정: 내 수정을 유지해 되살림(REBASE_CONFLICT_KEPT_LOCAL).
//  ⑥ 양쪽 삭제: 삭제 유지, 알림 없음.  ④ 결과는 검증 규칙으로 다시 검사. ⑨ 위반하면 아무것도 저장하지 않는다(자동 삭제·분할 없음).
//  ⑧ 결과가 최신 카드와 같으면 op를 쓰지 않는다(ALREADY_APPLIED).  confirmCount는 초안이 아니라 최신 카드 값 + 1.
import {validateStudyData} from './study-model.mjs';

export const LISTS=Object.freeze(['sessions','mistakes','reviews']);
export function stable(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}
const same=(a,b)=>stable(a)===stable(b);
const rowsOf=(c,list)=>c?c[list]:[];
export const emptyCard=date=>({date,sessions:[],mistakes:[],reviews:[],confirmCount:0});

// base 대비 변경 목록(배열 이름 + 항목 id 단위) — 화면 표시·시험용. 초안에는 따로 저장하지 않고 (base, mine)에서 언제든 다시 계산한다.
export function diffCard(base,mine){
  const added=[],modified=[],removed=[];
  for(const list of LISTS){
    const B=new Map(rowsOf(base,list).map(i=>[i.id,i])),M=new Map(rowsOf(mine,list).map(i=>[i.id,i]));
    for(const [id,m] of M){if(!B.has(id))added.push({list,item:m});else if(!same(B.get(id),m))modified.push({list,item:m});}
    for(const id of B.keys())if(!M.has(id))removed.push({list,id});
  }
  return {added,modified,removed};
}
export function hasChanges(base,mine){const d=diffCard(base,mine);return d.added.length+d.modified.length+d.removed.length>0;}
const sortById=items=>[...items].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
export function sameContent(a,b){return LISTS.every(l=>same(sortById(rowsOf(a,l)),sortById(rowsOf(b,l))));}

function mergeList(list,base,mine,latest,notices){
  const B=new Map(rowsOf(base,list).map(i=>[i.id,i])),M=new Map(rowsOf(mine,list).map(i=>[i.id,i])),T=new Map(rowsOf(latest,list).map(i=>[i.id,i]));
  const keep=new Map();
  const ids=[...new Set([...T.keys(),...M.keys(),...B.keys()])];
  for(const id of ids){
    const b=B.get(id),m=M.get(id),t=T.get(id);
    if(b===undefined){
      if(m!==undefined&&t!==undefined){
        if(!same(m,t))return {rejected:{status:'REJECTED',code:'REBASE_ID_COLLISION',itemId:id,list}};
        keep.set(id,t);
      }else keep.set(id,m!==undefined?m:t);
      continue;
    }
    const mineState=m===undefined?'deleted':same(m,b)?'same':'modified';
    const theirState=t===undefined?'deleted':same(t,b)?'same':'modified';
    if(mineState==='same'){if(theirState!=='deleted')keep.set(id,t);continue;}   // 내 변경 없음: 상대 결과를 따른다(상대 삭제 포함)
    if(mineState==='modified'){
      if(theirState==='same'||theirState==='modified'&&same(m,t)){keep.set(id,m);continue;}
      if(theirState==='modified'){keep.set(id,m);notices.push({code:'REBASE_VALUE_OVERWRITTEN',list,itemId:id,remote:t,mine:m});continue;}
      keep.set(id,m);notices.push({code:'REBASE_CONFLICT_KEPT_LOCAL',list,itemId:id,mine:m});continue;   // 상대 삭제 vs 내 수정
    }
    // mineState==='deleted'
    if(theirState==='modified'){keep.set(id,t);notices.push({code:'REBASE_CONFLICT_KEPT_REMOTE',list,itemId:id,remote:t});}
    // same·deleted: 삭제 적용(양쪽 삭제는 알림 없음)
  }
  // 순서: 최신 카드의 순서를 먼저, 그다음 내가 더하거나 되살린 항목을 내 초안의 순서로.
  const order=[...T.keys(),...M.keys()].filter((id,i,a)=>a.indexOf(id)===i);
  return {items:order.filter(id=>keep.has(id)).map(id=>keep.get(id))};
}

// 세션 id 표지: 'T'(타이머) · 'A'(PC 측정 담기) · null(분 입력·공부 모듈·옛 세션). focus-card도 이 함수를 쓴다.
export function sessionMark(id){const m=/^lf_[A-Za-z0-9-]{1,30}_([TA])/.exec(typeof id==='string'?id:'');return m?m[1]:null;}
// FIX34 (HUNT34 H6): 다른 기기 타이머(T)와 PC 측정 담기(A)가 같은 시간을 두 번 셀 수 있다. 자동으로 지우지 않고 확정 때 알리기만 한다.
// 타이머 분은 반올림이라 구간 끝이 30초까지 어긋난다 → 1분 이상 겹칠 때만 겹침으로 본다.
export const OVERLAP_NOTICE='REBASE_TIMER_CLAIM_OVERLAP';
const MIN_MS=60000;
const spanOf=s=>{const at=Date.parse(s?.at);return Number.isFinite(at)&&Number.isInteger(s?.confirmedMin)&&s.confirmedMin>0?[at-s.confirmedMin*MIN_MS,at]:null;};
export function timerClaimOverlap(sessions){
  const of=mark=>sessions.filter(s=>sessionMark(s?.id)===mark).map(s=>({id:s.id,span:spanOf(s)})).filter(x=>x.span),timers=of('T');
  let ms=0,itemId=null;
  for(const a of of('A'))for(const t of timers){const o=Math.min(a.span[1],t.span[1])-Math.max(a.span[0],t.span[0]);if(o>0){ms+=o;itemId??=a.id;}}
  return ms>=MIN_MS?{code:OVERLAP_NOTICE,list:'sessions',itemId,min:Math.round(ms/MIN_MS)}:null;
}

export function rebase({date,base,mine,latest}){
  const notices=[],merged={date};
  for(const list of LISTS){
    const r=mergeList(list,base,mine,latest,notices);
    if(r.rejected)return {...r.rejected,notices};
    merged[list]=r.items;
  }
  merged.confirmCount=(latest?latest.confirmCount:0)+1;
  if(latest?sameContent(merged,latest):LISTS.every(l=>!merged[l].length))return {status:'ALREADY_APPLIED',notices};
  try{validateStudyData('STUDY_DAY',date,merged);}
  catch(e){return {status:'REJECTED',code:e.code??'STUDY_REBASE_INVALID',notices,detail:Object.fromEntries(LISTS.map(l=>[l,merged[l].length]))};}
  const overlap=timerClaimOverlap(merged.sessions);if(overlap)notices.push(overlap);
  return {status:'MERGED',card:merged,notices};
}
