// 지식 우주 배치 (B49). 순수 함수: 공부 카드(STUDY_DAY)의 오답 + projectStudy 투영 → {clusters, nodes, links}. 합성 데이터로만 시험한다.
// DOM·WebGL·시계·난수·저장소·네트워크를 쓰지 않고 어떤 기록도 쓰지 않는다. 새 엔티티·스키마 없음: 이미 저장된 오답(id·과목·itemRef·errorCode)과 복습 기록을 읽어 그리기만 한다.
// 같은 입력이면 어느 기기에서나 같은 좌표(난수 없음: 오답 id의 해시가 시드). note(메모)는 읽지도 내보내지도 않는다.
// 상태 판단은 기존 규칙만 쓴다: 늦음·오늘 복습 = projectStudy의 overdue·dueToday, 졸업 = study-schedule의 stageOf, 최근 기억함 = 가장 최근 완료 복습의 result가 RECALLED.
import {SUBJECTS} from './study-model.mjs';
import {orderedResults,stageOf} from './study-schedule.mjs';

export const MAX_NODES=1500,MAX_LINKS=3000,MAX_LINKS_PER_NODE=3;
// 과목 코드(K·M·E·H·S·C) → 표시 이름·기본색. 기본색은 life-model DEFAULT_SUBJECTS와 같은 값(DS2: 영어 주황, 시험 ds2가 같은지 본다).
export const SUBJECT_INFO=Object.freeze({
  K:Object.freeze({name:'국어',color:'#8E6BC4'}),M:Object.freeze({name:'수학',color:'#A6714E'}),E:Object.freeze({name:'영어',color:'#D9823B'}),
  H:Object.freeze({name:'한국사',color:'#5BA66B'}),S:Object.freeze({name:'사회',color:'#D4B33C'}),C:Object.freeze({name:'과학',color:'#4F86C6'}),
});
// DS2: 과목 코드 ↔ 과목 id(life-model STUDY_CODE_BY_SUBJECT의 기본 과목). 소유자가 설정에서 바꾼 색 = 저장된 SUBJECT_DEF.color. 이 파일은 life-model을 불러오지 않으므로 저장본 목록을 받아 읽는다.
// styles.css --lb-subj-* 토큰 값(.universe-subj-* 클래스가 칠하는 색). 과목 색이 이 값과 같을 때만 클래스로 그리고, 다르면 SVG fill·stroke 속성으로 그린다(시험 ds2가 CSS와 같은지 본다).
export const SUBJECT_TOKEN_COLORS=Object.freeze({K:'#8E6BC4',M:'#A6714E',E:'#D9534F',H:'#5BA66B',S:'#D4B33C',C:'#4F86C6'});
export const SUBJECT_ID_OF_CODE=Object.freeze({K:'kor',M:'math',E:'eng',H:'hist',S:'soc',C:'sci'});
// subjects = 저장된 과목 정의(SUBJECT_DEF data 목록, 숨김 포함). 저장본이 없거나 값이 틀린 과목은 기본색.
export function universeColors(subjects=[]){
  const by=new Map((Array.isArray(subjects)?subjects:[]).map(s=>[s?.id,String(s?.color??'').toUpperCase()]));
  return Object.fromEntries(Object.keys(SUBJECT_INFO).map(code=>{const c=by.get(SUBJECT_ID_OF_CODE[code]);return [code,/^#[0-9A-F]{6}$/.test(c??'')?c:SUBJECT_INFO[code].color];}));
}
export const STATE_TEXT=Object.freeze({due:'복습 예정',late:'복습 늦음',glow:'기억함'});
export const VIEW_2D=Object.freeze({width:360,height:264});
const RING_MIN=11,Y_STEP=2.2,CELL_W=120,CELL_H=132,CELL_R=44,GOLDEN=2.399963;

// FNV-1a + 마무리 섞기. 같은 글자열이면 항상 같은 0~1 값.
function hash(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>15;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);h^=h>>>16;
  return h>>>0;
}
const unit=(id,salt)=>hash(id+'\u0000'+salt)/4294967296;
const r4=v=>Math.round(v*1e4)/1e4;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const clusterRadius=n=>1.6+0.55*Math.cbrt(n);

// 오답마다 완료된 복습만 모은다(미완료 행은 투영처럼 무시). 같은 복습 id가 둘 이상이면 투영처럼 모두 뺀다.
function reviewIndex(cards){
  const counts=new Map(),byMistake=new Map();
  for(const card of cards)for(const r of card.reviews??[])counts.set(r.id,(counts.get(r.id)??0)+1);
  for(const card of cards)for(const r of card.reviews??[]){
    if(counts.get(r.id)!==1||typeof r.doneAt!=='string'||typeof r.result!=='string')continue;
    const list=byMistake.get(r.mistakeId)??[];list.push({id:r.id,doneAt:r.doneAt,result:r.result,nextDue:r.nextDue??null});byMistake.set(r.mistakeId,list);
  }
  return byMistake;
}
const latestOf=list=>list.reduce((best,r)=>!best||compare(r.doneAt,best.doneAt)>0||(r.doneAt===best.doneAt&&compare(r.id,best.id)>0)?r:best,null);

function collect(cards,proj){
  const dup=new Set((proj.duplicates??[]).filter(d=>d.kind==='mistake').map(d=>d.id));
  const late=new Map(proj.overdue.map(r=>[r.mistakeId,r.due])),today=new Map(proj.dueToday.map(r=>[r.mistakeId,r.due]));
  const reviews=reviewIndex(cards),rows=[];
  for(const card of cards)for(const m of card.mistakes??[]){
    if(!SUBJECTS.includes(m.subject)||dup.has(m.id))continue;
    const hist=reviews.get(m.id)??[],latest=latestOf(hist);
    let graduated=false;
    try{graduated=stageOf(orderedResults(hist)).graduated;}catch{graduated=false;}
    const state=late.has(m.id)?'late':today.has(m.id)?'due':(graduated||latest?.result==='RECALLED')?'glow':'due';
    const due=late.get(m.id)??today.get(m.id)??(latest?latest.nextDue:(m.reviewDue??null));
    rows.push({id:m.id,subject:m.subject,errorCode:m.errorCode,itemRef:m.itemRef,date:card.date,state,due});
  }
  return rows;
}

// 같은 과목 + 같은 오답 코드 사이만 잇는다. 한 노드에 최대 3개, 가까운 순서(날짜·id)부터 채운다.
function linkNodes(nodes){
  const groups=new Map();
  nodes.forEach((n,i)=>{const key=n.subject+'\u0000'+n.errorCode;const g=groups.get(key)??[];g.push(i);groups.set(key,g);});
  const degree=new Array(nodes.length).fill(0),links=[];
  for(const g of [...groups.keys()].sort().map(k=>groups.get(k))){
    for(let gap=1;gap<=3;gap++)for(let k=0;k+gap<g.length;k++){
      const a=g[k],b=g[k+gap];
      if(degree[a]>=MAX_LINKS_PER_NODE||degree[b]>=MAX_LINKS_PER_NODE||links.length>=MAX_LINKS)continue;
      links.push({a,b});degree[a]++;degree[b]++;
    }
  }
  return links;
}

export function layoutUniverse({cards,proj,colors=null}){
  if(!Array.isArray(cards)||!proj||!Array.isArray(proj.overdue)||!Array.isArray(proj.dueToday))throw new TypeError('INVALID_UNIVERSE_INPUT');
  const colorOf=code=>/^#[0-9A-F]{6}$/.test(colors?.[code]??'')?colors[code]:SUBJECT_INFO[code].color;
  const all=collect(cards,proj),total=all.length,capped=total>MAX_NODES;
  // 상한을 넘으면 최근 오답(카드 날짜, 같으면 id)을 우선한다.
  const kept=capped?[...all].sort((a,b)=>compare(b.date,a.date)||compare(b.id,a.id)).slice(0,MAX_NODES):all;
  kept.sort((a,b)=>SUBJECTS.indexOf(a.subject)-SUBJECTS.indexOf(b.subject)||compare(a.date,b.date)||compare(a.id,b.id));
  const perSubject=Object.fromEntries(SUBJECTS.map(c=>[c,kept.filter(n=>n.subject===c).length]));
  const maxR=Math.max(...SUBJECTS.map(c=>clusterRadius(perSubject[c]))),ring=Math.max(RING_MIN,2.1*maxR);
  const clusters=SUBJECTS.map((code,index)=>{
    const angle=(index/SUBJECTS.length)*2*Math.PI-Math.PI/2,count=perSubject[code];
    return {code,name:SUBJECT_INFO[code].name,color:colorOf(code),index,count,due:0,late:0,glow:0,
      x:r4(Math.cos(angle)*ring),y:r4((index%2?1:-1)*Y_STEP/2),z:r4(Math.sin(angle)*ring),radius:r4(clusterRadius(count)),
      cx:CELL_W/2+CELL_W*(index%3),cy:52+CELL_H*Math.floor(index/3),r:CELL_R};
  });
  const rank=new Map(SUBJECTS.map(c=>[c,0]));
  const nodes=kept.map((row,i)=>{
    const c=clusters[SUBJECTS.indexOf(row.subject)],k=rank.get(row.subject);rank.set(row.subject,k+1);c[row.state]++;
    const cosT=1-2*unit(row.id,'t'),sinT=Math.sqrt(1-cosT*cosT),phi=2*Math.PI*unit(row.id,'p'),rad=c.radius*Math.cbrt(unit(row.id,'r'));
    const rr=(c.r-4)*Math.sqrt((k+0.5)/c.count),ang=k*GOLDEN+2*Math.PI*unit(row.subject,'a');
    return {i,id:row.id,subject:row.subject,cluster:c.index,errorCode:row.errorCode,itemRef:row.itemRef,date:row.date,state:row.state,due:row.due,
      x:r4(c.x+rad*sinT*Math.cos(phi)),y:r4(c.y+rad*cosT*0.8),z:r4(c.z+rad*sinT*Math.sin(phi)),
      px:r4(c.cx+rr*Math.cos(ang)),py:r4(c.cy+rr*Math.sin(ang)),pr:r4(Math.max(1,Math.min(3.2,(c.r-4)*0.8/Math.sqrt(c.count))))};
  });
  const counts={due:0,late:0,glow:0};for(const n of nodes)counts[n.state]++;
  const bound=r4(Math.max(1,...clusters.map(c=>Math.hypot(c.x,c.y,c.z)+c.radius)));
  return {baseDate:proj.baseDate??null,clusters,nodes,links:linkNodes(nodes),total,shown:nodes.length,capped,empty:nodes.length===0,counts,bound};
}
