// LIFE_DAY 카드의 rebase(확정 직전 최신 카드 위에 내 초안을 다시 얹기). 순수 함수 — 시계·저장소·화면에 의존하지 않는다. hlt-rebase와 같은 3자 병합이며 단위는 habitId다.
// base(내가 편집을 시작한 시점의 카드) / mine(내 초안) / latest(확정 직전 서버 최신 카드).
//  ① 한쪽만 바꾼 습관은 그대로 합친다(손실 0).  ② 같은 습관을 양쪽이 다르게 고쳤으면(또는 base에 없던 같은 습관을 양쪽이 다르게 넣었으면) 내 값을 쓰고 알림에 상대 값을 보여 준다(이전 값은 그래프 이력).
//  ③ 내가 지운(되돌린) 습관을 상대가 고쳤으면 상대 수정을 남긴다.  ④ 상대가 지운 습관을 내가 고쳤으면 내 수정으로 되살린다.  ⑤ 양쪽 삭제는 알림 없음.
//  mood·note·dayType: 한쪽만 바뀌었으면 그쪽, 양쪽이 바뀌었으면 mine + 알림.
//  결과가 최신 카드와 같으면 쓰지 않는다(ALREADY_APPLIED). 결과는 검증 규칙으로 다시 검사하고 위반하면 아무것도 저장하지 않는다(REJECTED).
import {validateLifeData,emptyDay} from './life-model.mjs';

export function stable(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}
const same=(a,b)=>stable(a)===stable(b);
const habitsOf=c=>c?c.habits:{};
const SCALARS=['mood','note','dayType'];
export {emptyDay};

// base 대비 변경 목록(습관 id 단위) — 화면 표시·시험용. 초안에는 따로 저장하지 않고 (base, mine)에서 언제든 다시 계산한다.
export function diffDay(base,mine){
  const B=habitsOf(base),M=habitsOf(mine),added=[],modified=[],removed=[];
  for(const id of Object.keys(M)){if(!Object.hasOwn(B,id))added.push(id);else if(!same(B[id],M[id]))modified.push(id);}
  for(const id of Object.keys(B))if(!Object.hasOwn(M,id))removed.push(id);
  const scalars=SCALARS.filter(k=>!same(base?.[k]??emptyDay('')[k],mine?.[k]??emptyDay('')[k]));
  return {added,modified,removed,scalars};
}
export function hasChanges(base,mine){const d=diffDay(base,mine);return d.added.length+d.modified.length+d.removed.length+d.scalars.length>0;}
export function sameContent(a,b){return same(a,b);}

export function rebase({date,base,mine,latest}){
  const B=habitsOf(base),M=habitsOf(mine),T=habitsOf(latest),notices=[],keep={};
  const ids=[...new Set([...Object.keys(T),...Object.keys(M),...Object.keys(B)])];
  for(const id of ids){
    const b=Object.hasOwn(B,id)?B[id]:undefined,m=Object.hasOwn(M,id)?M[id]:undefined,t=Object.hasOwn(T,id)?T[id]:undefined;
    if(b===undefined){
      if(m!==undefined&&t!==undefined){
        if(same(m,t))keep[id]=t;else{keep[id]=m;notices.push({code:'REBASE_VALUE_OVERWRITTEN',habitId:id,remote:t,mine:m});}
      }else keep[id]=m!==undefined?m:t;
      continue;
    }
    const mineState=m===undefined?'deleted':same(m,b)?'same':'modified';
    const theirState=t===undefined?'deleted':same(t,b)?'same':'modified';
    if(mineState==='same'){if(theirState!=='deleted')keep[id]=t;continue;}
    if(mineState==='modified'){
      if(theirState==='same'||theirState==='modified'&&same(m,t)){keep[id]=m;continue;}
      keep[id]=m;
      notices.push(theirState==='modified'?{code:'REBASE_VALUE_OVERWRITTEN',habitId:id,remote:t,mine:m}:{code:'REBASE_CONFLICT_KEPT_LOCAL',habitId:id,mine:m});
      continue;
    }
    if(theirState==='modified'){keep[id]=t;notices.push({code:'REBASE_CONFLICT_KEPT_REMOTE',habitId:id,remote:t});}
  }
  const merged={date,habits:keep,mood:null,note:'',dayType:'NORMAL'};
  for(const k of SCALARS){
    const sb=base?.[k]??emptyDay('')[k],sm=mine?.[k]??emptyDay('')[k],st=latest?.[k]??emptyDay('')[k];
    let v=st;
    if(!same(sm,sb)){
      if(same(st,sb)||same(st,sm))v=sm;
      else{v=sm;notices.push({code:'REBASE_SCALAR_OVERWRITTEN',field:k,remote:st,mine:sm});}
    }
    merged[k]=v;
  }
  if(latest?sameContent(merged,latest):!hasChanges(null,merged))return {status:'ALREADY_APPLIED',notices};
  try{validateLifeData('LIFE_DAY',date,merged);}
  catch(e){return {status:'REJECTED',code:e.code??'LIFE_REBASE_INVALID',notices,detail:{habits:Object.keys(keep).length}};}
  return {status:'MERGED',card:merged,notices};
}
