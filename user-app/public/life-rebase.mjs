// LIFE_DAY 카드의 rebase(확정 직전 최신 카드 위에 내 초안을 다시 얹기). 순수 함수 — 시계·저장소·화면에 의존하지 않는다. hlt-rebase와 같은 3자 병합이며 단위는 habitId다.
// base(내가 편집을 시작한 시점의 카드) / mine(내 초안) / latest(확정 직전 서버 최신 카드).
//  ① 한쪽만 바꾼 습관은 그대로 합친다(손실 0).  ② 같은 습관을 양쪽이 다르게 고쳤으면(또는 base에 없던 같은 습관을 양쪽이 다르게 넣었으면) 내 값을 쓰고 알림에 상대 값을 보여 준다(이전 값은 그래프 이력).
//  ③ 내가 지운(되돌린) 습관을 상대가 고쳤으면 상대 수정을 남긴다.  ④ 상대가 지운 습관을 내가 고쳤으면 내 수정으로 되살린다.  ⑤ 양쪽 삭제는 알림 없음.
//  mood·note·dayType: 한쪽만 바뀌었으면 그쪽, 양쪽이 바뀌었으면 mine + 알림.
//  결과가 최신 카드와 같으면 쓰지 않는다(ALREADY_APPLIED). 결과는 검증 규칙으로 다시 검사하고 위반하면 아무것도 저장하지 않는다(REJECTED).
import {validateLifeData,emptyDay,emptyDiary,emptyWeekReview,MAX_DIARY_GOOD,MAX_DIARY_BAD} from './life-model.mjs';

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

// 새 기록(D46 5절)의 3자 병합: PLAN_GOAL·EXAM_RESULT. 위 rebase와 같은 규칙이고 단위는 과목(subjectId)이라 "지난주처럼"을 두 기기가 눌러도 두 배가 되지 않는다. EXAM_RESULT의 takenOn은 값 하나로 합친다.
const RECORD_ROWS=Object.freeze({PLAN_GOAL:'goals',EXAM_RESULT:'scores'});
export function rebaseRecord(type,{id,base,mine,latest}){
  if(type==='WEEK_REVIEW')return rebaseWeekReview({id,base,mine,latest});
  const list=RECORD_ROWS[type],map=c=>new Map((c?.[list]??[]).map(x=>[x.subjectId,x])),B=map(base),M=map(mine),T=map(latest),notices=[],keep=new Map();
  for(const subjectId of new Set([...T.keys(),...M.keys(),...B.keys()])){
    const b=B.get(subjectId),m=M.get(subjectId),t=T.get(subjectId);
    if(b===undefined){
      if(m!==undefined&&t!==undefined){if(same(m,t))keep.set(subjectId,t);else{keep.set(subjectId,m);notices.push({code:'RECORD_VALUE_OVERWRITTEN',subjectId,remote:t,mine:m});}}
      else keep.set(subjectId,m!==undefined?m:t);
      continue;
    }
    const mineState=m===undefined?'deleted':same(m,b)?'same':'modified',theirState=t===undefined?'deleted':same(t,b)?'same':'modified';
    if(mineState==='same'){if(theirState!=='deleted')keep.set(subjectId,t);continue;}
    if(mineState==='modified'){
      if(theirState==='same'||theirState==='modified'&&same(m,t)){keep.set(subjectId,m);continue;}
      keep.set(subjectId,m);
      notices.push(theirState==='modified'?{code:'RECORD_VALUE_OVERWRITTEN',subjectId,remote:t,mine:m}:{code:'RECORD_CONFLICT_KEPT_LOCAL',subjectId,mine:m});
      continue;
    }
    if(theirState==='modified'){keep.set(subjectId,t);notices.push({code:'RECORD_CONFLICT_KEPT_REMOTE',subjectId,remote:t});}
  }
  const merged={...mine,[list]:[...keep.values()]};
  // FIX59Q (HUNT57 HQ57-2, FIX58Q HQ9 규칙 대신): 금고에 없던 시험(base null)이면 응시일은 한쪽만 있으면 있는 값, 같으면 그대로,
  // 둘 다 있고 다르면 내 값 + 알림(어느 쪽도 조용히 버리지 않는다. 봉인 승인은 알림이 있으면 쓰지 않고 초안을 남겨 사용자가 고른다).
  if(type==='EXAM_RESULT'&&latest){
    const sb=base?.takenOn,sm=mine.takenOn,st=latest.takenOn;
    if(!base){if(!sm)merged.takenOn=st;else if(st&&st!==sm)notices.push({code:'RECORD_DATE_OVERWRITTEN',remote:st,mine:sm});}
    else if(sm===sb)merged.takenOn=st;
    else if(st!==sb&&st!==sm)notices.push({code:'RECORD_DATE_OVERWRITTEN',remote:st,mine:sm});
  }
  if(latest&&same(merged,latest))return {status:'ALREADY_APPLIED',notices};
  try{validateLifeData(type,id,merged);}
  catch(e){return {status:'REJECTED',code:e.code??'RECORD_REBASE_INVALID',notices};}
  return {status:'MERGED',data:merged,notices};
}

// 일기·주간 리뷰(D49 5.3)의 칸별 3자 병합. 규칙은 위와 같다: 한쪽만 바꾸면 그쪽, 양쪽이 다르게 바꾸면 내 값 + 알림. 글은 이어 붙이지 않는다(상한을 넘고 같은 글이 두 번 들어갈 수 있다, 상대 글은 이전 판에 남는다).
// 알림에는 칸 이름만 넣는다. rebase와 달리 상대 값·내 값을 싣지 않는다: 글이 알림 경로로 나가지 않게 한다.
const scalarOf=(k,sb,sm,st,notices,code)=>{
  if(same(sm,sb))return st;
  if(!same(st,sb)&&!same(st,sm))notices.push({code:code(k),field:k});
  return sm;
};
const sameSet=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));
// 칩은 집합으로 합친다: 양쪽 추가는 모두 남고 한쪽이 뺀 칩은 빠진다. 상한을 넘으면 내 쪽을 먼저 남긴다(잘린 칩은 이전 판에 남는다). 결과가 최신과 같은 집합이면 순서도 최신을 따른다(순서만 다른 쓰기를 만들지 않는다).
function mergeChips(field,base,mine,latest,max,notices){
  const B=new Set(base),M=new Set(mine),T=new Set(latest);
  const kept=[...mine.filter(x=>T.has(x)||!B.has(x)),...latest.filter(x=>!B.has(x)&&!M.has(x))];
  if(kept.length>max)notices.push({code:'DIARY_CHIPS_TRIMMED',field});
  else if(!sameSet(M,B)&&!sameSet(T,B)&&!sameSet(M,T))notices.push({code:'DIARY_CHIPS_MERGED',field});
  const out=kept.slice(0,max);
  return sameSet(new Set(out),T)?[...latest]:out;
}
const DIARY_CODE=k=>k==='text'?'DIARY_TEXT_KEPT_MINE':'DIARY_VALUE_OVERWRITTEN';
export function rebaseDiary({date,base,mine,latest}){
  const empty=emptyDiary(date),b=base??empty,t=latest??empty,notices=[],merged={date};
  for(const k of ['score','energy','tomorrow','text'])merged[k]=scalarOf(k,b[k],mine[k],t[k],notices,DIARY_CODE);
  merged.good=mergeChips('good',b.good,mine.good,t.good,MAX_DIARY_GOOD,notices);
  merged.bad=mergeChips('bad',b.bad,mine.bad,t.bad,MAX_DIARY_BAD,notices);
  if(same(merged,t))return {status:'ALREADY_APPLIED',notices};
  try{validateLifeData('DIARY_DAY',date,merged);}
  catch(e){return {status:'REJECTED',code:e.code??'DIARY_REBASE_INVALID',notices};}
  return {status:'MERGED',card:merged,notices};   // 초안 상자는 합친 결과를 .card로 읽는다
}
export function rebaseWeekReview({id,base,mine,latest}){
  const empty=emptyWeekReview(id),b=base??empty,t=latest??empty,notices=[],merged={monday:id};
  for(const k of ['pick','next'])merged[k]=scalarOf(k,b[k],mine[k],t[k],notices,()=>'REVIEW_VALUE_OVERWRITTEN');
  if(same(merged,t))return {status:'ALREADY_APPLIED',notices};
  try{validateLifeData('WEEK_REVIEW',id,merged);}
  catch(e){return {status:'REJECTED',code:e.code??'RECORD_REBASE_INVALID',notices};}
  return {status:'MERGED',data:merged,notices};
}
