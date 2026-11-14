// 달성 연출 (V8W6 5): 퀘스트 달성·레벨업·칭호 획득·프로필 상태(평생 등급) 바뀜·건물 완성 때 가운데 팝업 + 금빛 가루·빛(약 2초).
// 누르면 닫힌다. 소리 없음. 움직임 줄이기면 효과가 정지 그림으로 보인다(styles.css). 팝업에는 무엇을 달성했는지와 다음 목표. 한꺼번에 여러 개면 팝업 1개 + "외 n개"(V8FIX 통제탑 결정), 다른 때 생긴 것은 차례로.
// 같은 달성은 한 번만: 이 기기 장부(lb.celebrate.seen.v1, 달성 열쇠 문자열만)에 적는다. 장부가 처음이면(첫 실행·새 시작) 지금까지의 달성은 조용히 장부에만 넣는다(한꺼번에 수십 개가 뜨지 않게).
// 계산은 저장하지 않는 투영(achieve·achievements·평생 등급·건물 수집)만 쓴다. 기록 쓰기·새 기록 종류·서버 없음. 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음).
import {achieve,AREAS} from './life-achieve.mjs';
import {achievements,unlockedTitles,nearDone} from './life-achv.mjs';
import {kstDate} from './life-model.mjs';
import {STUDY_STAGES,stageOf,lifetimeMinutes,hoursLeftText} from './study-stage.mjs';
import {buildingsOf,bricksOf,buildingSvg} from './buildings.mjs';
import {titleMedal} from './title-medal.mjs';

export const CELEBRATE_SEEN_KEY='lb.celebrate.seen.v1',SEEN_CAP=800,FX_SECONDS=2;
export const KIND_TEXT=Object.freeze({QUEST:'퀘스트 달성',LEVEL:'레벨업',TITLE:'칭호 획득',STAGE:'상태가 바뀌었어요',BUILDING:'건물 완성'});
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'});
const number=n=>Number(n).toLocaleString('en-US');

// 지금 달성된 것 전부(열쇠 순서 = 보여 줄 순서: 상태 → 건물 → 칭호 → 레벨 → 퀘스트). 입력은 상태 화면·탑과 같은 투영 값이다.
export function celebrationItems({ach,list,minutes}){
  const out=[];
  const proj=stageOf(minutes),stage=proj.stage,nextStage=STUDY_STAGES.find(r=>r.no===stage.no+1)??null;
  if(stage.no>1)out.push({key:'stage:'+stage.no,kind:'STAGE',title:stage.no+'단계 · '+stage.name,detail:'평생 등급이 '+stage.name+'(으)로 올랐어요 · 쌓은 공부 시간 기준',
    next:nextStage?nextStage.name+'까지 '+hoursLeftText(Math.max(0,nextStage.hours*60-minutes)):'마지막 단계 · 금빛 별 모으기'});
  const b=buildingsOf(bricksOf(ach));
  for(const x of b.list)if(x.done)out.push({key:'build:'+x.id,kind:'BUILDING',title:x.name+' 완성',detail:x.line+' · 벽돌 '+number(x.need)+'장 · 수집 '+b.count+' / '+b.total,
    next:b.next?b.next.name+'까지 벽돌 '+number(b.next.left)+'장':'모든 건물 수집 완료',building:x.id});
  const near=nearDone(list,1)[0]??null;
  for(const t of unlockedTitles(list))out.push({key:'title:'+t.id,kind:'TITLE',title:t.name,detail:'칭호를 얻었어요 · 업적 「'+(list.find(r=>r.id===t.achv)?.name??'')+'」',
    next:near?near.name+' '+number(near.value)+' / '+number(near.target):'업적 전체 보기에서 다음 칭호 확인',medal:{achv:t.achv,tier:t.tier,name:t.name}});
  for(const a of AREAS){
    const l=ach.levels?.[a];if(!l||!(l.level>1))continue;
    out.push({key:'level:'+a+':'+l.level,kind:'LEVEL',title:AREA_TEXT[a]+' Lv '+l.level,detail:AREA_TEXT[a]+' 영역 레벨이 올랐어요',next:'Lv '+(l.level+1)+'까지 '+number(Math.max(0,l.need-l.into))+' XP'});
  }
  const week=ach.currentWeek;
  if(week){
    const left=week.quests.filter(q=>!q.done);
    for(const q of week.quests)if(q.done)out.push({key:'quest:'+week.monday+':'+(q.id??q.label),kind:'QUEST',title:q.label,detail:'이번 주 퀘스트 완료 · +'+number(q.xp)+' XP',
      next:left.length?'이번 주 남은 퀘스트 '+left.length+'개 · '+left[0].label+' '+left[0].value+' / '+left[0].target+(left[0].unit??''):'이번 주 퀘스트 모두 완료 · 다음 주 월요일에 새 퀘스트'});
  }
  const month=ach.months?.at(-1);
  if(month?.done&&month.kind!=='BUDGET')out.push({key:'quest:month:'+(month.month??month.label),kind:'QUEST',title:month.label,detail:'이달의 퀘스트 완료',next:'다음 달 1일에 새 이달 퀘스트'});
  return out;
}
// 같은 레벨 영역은 가장 높은 레벨 하나만(한 번에 두 단계 올라도 팝업 1개). 장부에는 지난 레벨 열쇠도 함께 적는다.
export function freshItems(items,seen){
  const fresh=items.filter(x=>!seen.has(x.key));
  const topLevel=new Map();for(const x of fresh)if(x.kind==='LEVEL'){const a=x.key.split(':')[1];topLevel.set(a,x);}
  return fresh.filter(x=>x.kind!=='LEVEL'||topLevel.get(x.key.split(':')[1])===x);
}
export function parseCelebrateSeen(raw){
  try{const v=JSON.parse(raw);return Array.isArray(v?.keys)?new Set(v.keys.filter(k=>typeof k==='string')):null;}catch{return null;}
}
function readSeen(storage,st){
  let stored=null;try{const raw=storage?.getItem(st.seenKey??CELEBRATE_SEEN_KEY);if(raw!==null&&raw!==undefined)stored=parseCelebrateSeen(raw);}catch{/* 이번 실행 동안만 */}
  const mem=st.seenMemory??null;
  return stored&&mem?new Set([...stored,...mem]):stored??mem;
}
// V8FIX L-24: 상한(SEEN_CAP)을 넘으면 오래된 열쇠부터 버리되, 지금 달성 상태인 열쇠(keep)는 버리지 않는다(버리면 몇 년 뒤 옛 달성이 다시 뜬다).
function writeSeen(storage,st,set,keep=new Set()){
  const list=[...set],cur=list.filter(k=>keep.has(k)),old=list.filter(k=>!keep.has(k));
  const keys=[...old.slice(Math.max(0,old.length-Math.max(0,SEEN_CAP-cur.length))),...cur];st.seenMemory=new Set(keys);
  try{storage?.setItem(st.seenKey??CELEBRATE_SEEN_KEY,JSON.stringify({v:1,keys}));}catch{/* 이번 실행 동안만 */}
}
// 장부와 맞춰 새로 보여 줄 것만 돌려준다. 첫 장부면 모두 조용히 적고 [].
// V8FIX H-02: 첫 장부인데 달성이 0개면(자료를 아직 안 읽었거나 빈 화면) 빈 장부를 쓰지 않는다. 빈 장부를 쓰면 자료가 들어온 뒤 지난 달성이 모두 "새 것"이 되어 팝업이 몰린다.
export function settleCelebrations(items,storage,st={}){
  const seen=readSeen(storage,st),all=new Set(items.map(x=>x.key));
  if(seen===null){if(all.size)writeSeen(storage,st,all,all);return [];}
  const fresh=freshItems(items,seen);
  if(items.some(x=>!seen.has(x.key)))writeSeen(storage,st,new Set([...seen,...all]),all);
  return fresh;
}
// 상태·탑·오늘 화면이 부른다(앱이 넘긴다). whole = 화면이 읽는 사본, money = 날짜 → 돈 사실(없으면 null).
export function collectCelebrations({whole,nowIso,money=null}){
  const today=kstDate(String(nowIso)),m=typeof money==='function'?(()=>{try{return money(today)??null;}catch{return null;}})():money;
  const life=whole?.life??null,ach=achieve({life,study:whole?.study??null,fin:whole?.fin??null,today,money:m});
  const list=achievements(ach,{life,money:m}).list;
  return celebrationItems({ach,list,minutes:lifetimeMinutes(whole?.study??null)});
}

// ---------- 팝업: 차례로 하나씩. 지금 떠 있는 동안 다시 불리면(다시 그리기) 아직 안 본 것만 줄 뒤에 붙인다 ----------
const runner={queue:[],showing:null,queued:new Set()};
const NS='http://www.w3.org/2000/svg';
// 효과 SVG: 빛살(회전)·빛 번짐(맥동)·금빛 가루(떨어지며 반짝, 4가지 늦춤). 위치는 SVG 속성(고정값)이라 어느 기기에서나 같다. 움직임은 CSS 애니메이션(약 2초)만, 움직임 줄이기면 멈춘 그림.
const DUST=Object.freeze([[-70,-60],[-40,-82],[-8,-70],[28,-88],[62,-64],[84,-30],[-86,-20],[-60,20],[70,18],[-30,40],[40,46],[0,-40],[-92,52],[92,60],[-18,78],[24,84]]);
function fxSvg(doc){
  const s=(tag,a={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(a))n.setAttribute(k,String(v));return n;};
  const svg=s('svg',{class:'cel-fx',viewBox:'-100 -100 200 200','aria-hidden':'true',focusable:'false'});
  const rays=s('g',{class:'cel-rays'});for(let i=0;i<12;i++)rays.append(s('path',{class:'cel-ray',d:'M-3 -30L0 -98L3 -30Z',transform:'rotate('+i*30+')'}));
  svg.append(s('circle',{class:'cel-glow',cx:0,cy:0,r:60}),rays);
  DUST.forEach(([x,y],i)=>svg.append(s('circle',{class:'cel-dust cel-dust-'+(i%4),cx:x,cy:y,r:i%3===0?3.2:2.2})));
  for(const [x,y] of [[-52,-40],[56,-46],[-20,56],[66,40]])svg.append(s('path',{class:'cel-spark',d:'M'+x+' '+(y-7)+'L'+(x+1.8)+' '+(y-1.8)+'L'+(x+7)+' '+y+'L'+(x+1.8)+' '+(y+1.8)+'L'+x+' '+(y+7)+'L'+(x-1.8)+' '+(y+1.8)+'L'+(x-7)+' '+y+'L'+(x-1.8)+' '+(y-1.8)+'Z'}));
  return svg;
}
function iconOf(doc,item){
  if(item.medal)return titleMedal(doc,{...item.medal,size:72});
  if(item.building)return buildingSvg(doc,item.building,{cls:'bd-svg cel-building'});
  const s=(tag,a={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(a))n.setAttribute(k,String(v));return n;};
  const svg=s('svg',{class:'cel-star cel-star-'+item.kind.toLowerCase(),viewBox:'-20 -20 40 40','aria-hidden':'true',focusable:'false'});
  svg.append(s('path',{d:'M0 -17L4.5 -5.5H17L7 2L11 15L0 7L-11 15L-7 2L-17 -5.5H-4.5Z'}));
  return svg;
}
function showOne(doc,item,more,onClose){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==null&&text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const box=el('dialog',null,'cel-dlg cel-'+item.kind.toLowerCase());box.setAttribute('aria-label',KIND_TEXT[item.kind]+' · '+item.title);
  const card=el('div',null,'cel-card'),stage=el('div',null,'cel-stage');
  stage.append(...[fxSvg(doc),iconOf(doc,item)].filter(Boolean));
  const title=el('h2',item.title,'cel-title');title.setAttribute('aria-live','polite');
  card.append(stage,el('p',KIND_TEXT[item.kind],'cel-kind'),title,el('p',item.detail,'cel-detail'),el('p','다음 목표 · '+item.next,'cel-next'),
    el('p',(more>0?'외 '+more+'개 · ':'')+'누르면 닫혀요','cel-count muted small'));
  box.append(card);
  let closed=false;
  const close=()=>{if(closed)return;closed=true;box.close?.();box.remove?.();onClose();};
  box.addEventListener('click',close);
  box.addEventListener('cancel',e=>{e.preventDefault?.();close();});
  box.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault?.();close();}});
  doc.body.append(box);
  if(typeof box.showModal==='function'){try{box.showModal();}catch{box.setAttribute('open','');}}else box.setAttribute('open','');
  return box;
}
function pump(doc){
  if(runner.showing||!runner.queue.length)return;
  const {item,keys,more}=runner.queue.shift();
  runner.showing=showOne(doc,item,more,()=>{runner.showing=null;for(const k of keys)runner.queued.delete(k);pump(doc);});
}
// 앱이 부르는 입구: 새 달성을 장부에 적고 띄운다. 돌려주는 값 = 새 달성 개수. 실패해도 화면을 깨지 않는다(0).
// V8FIX H-02: 한 번에 새 달성이 여러 개면 팝업은 1개(맨 앞 = 상태 → 건물 → 칭호 → 레벨 → 퀘스트 순) + "외 n개". 다른 때 생긴 묶음은 차례로.
//   자료(whole)가 아직 없으면(잠금 해제 직후·첫 동기화 전) 장부도 건드리지 않는다.
export function celebrate({doc=globalThis.document,whole,nowIso,money=null,storage=null,st={}}={}){
  try{
    if(!doc?.body||typeof doc.createElementNS!=='function')return 0;
    if(!whole||(!whole.life&&!whole.study&&!whole.fin))return 0;
    const fresh=settleCelebrations(collectCelebrations({whole,nowIso,money}),storage,st).filter(x=>!runner.queued.has(x.key));
    if(fresh.length){for(const x of fresh)runner.queued.add(x.key);runner.queue.push({item:fresh[0],keys:fresh.map(x=>x.key),more:fresh.length-1});}
    pump(doc);
    return fresh.length;
  }catch{return 0;}
}
// V8FIX L-25: 잠그거나 프로필을 바꾸면 떠 있는 팝업과 줄을 비운다(잠금 화면 위에 칭호가 남지 않게). 장부는 그대로.
export function clearCelebrations(){
  runner.queue.length=0;runner.queued.clear();
  const s=runner.showing;runner.showing=null;
  try{s?.close?.();s?.remove?.();}catch{/* 이미 닫힘 */}
}
export const _runnerForTest=runner;
