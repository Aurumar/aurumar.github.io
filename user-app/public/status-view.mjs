// 상태 화면 (AV2): 아바타(평생 등급 그림 + 오늘 효과) → 오늘 시간 링·다음 효과까지 → 평생 등급 진행 바(20칸) → 탑·우주 입구. 합성 데이터로만 시험한다.
// 읽기만 한다: 쌓인 공부 카드·오늘 초안·진행 중 타이머를 계산해 그릴 뿐 어떤 기록도 쓰지 않는다(새 엔티티·저장 0).
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 색은 styles.css 토큰, 움직임은 CSS(prefers-reduced-motion이면 멈춘다).
// ctx = lifeCtx와 같은 document·now·getWhole·rerender + draftCard·timer(오늘 초안·진행 중 타이머), openStudy·openTower·openUniverse(선택), avatarArt(시험용, 없으면 AVATAR_ART_READY).
import {STUDY_STAGES,GOLD_TIERS,goldTierOf,STAR_EVERY_HOURS,AVATAR_ART_READY,FULL_EFFECT_MIN,artFile,lifetimeMinutes,stageOf,todayEffectOf,todayMinutes,hoursText,hmText,clockText,liveTick} from './study-stage.mjs';
import {achieve} from './life-achieve.mjs';
import {kstDate} from './life-model.mjs';
import {universeData} from './universe-view.mjs';

const NS='http://www.w3.org/2000/svg';
const MAX_STAR_MARKS=12;
// 입자 자리(뷰박스 240×300). 고정값이라 어느 기기에서나 같게 그려진다.
const PARTICLES=Object.freeze([[38,206],[62,120],[78,246],[104,66],[132,44],[160,92],[186,224],[204,142],[52,62],[214,74],[28,152],[174,36]]);
// 그림(624×912) 위 안경테 양끝 자리의 대략값. 등급마다 구도가 조금씩 달라 펜 끝은 공통 자리가 없다(AV2 보고서).
const ART_GLINTS=Object.freeze([[96,80],[166,77]]);

function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const s=(tag,attrs={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  return {el,add,s};
}

// 자리표시 그림 1장: 그림 파일이 없거나 못 불러올 때 쓴다. 책상 앞의 사람을 선으로 그린 SVG이며 실제 사진이 아니다. 열공(intense)이면 눈썹 선이 더해진다.
function placeholderFigure({s},art){
  const svg=s('svg',{class:'st-fig st-fig-placeholder',viewBox:'0 0 240 300','aria-hidden':'true',focusable:'false'});
  const parts=[
    s('path',{class:'st-av-body',d:'M58 246C58 192 86 172 120 172C154 172 182 192 182 246Z'}),
    s('path',{class:'st-av-line',d:'M106 174L120 196L134 174'}),
    s('circle',{class:'st-av-head',cx:120,cy:118,r:44}),
    s('path',{class:'st-av-hair',d:'M76 118C72 80 102 66 122 68C150 68 168 88 164 118C156 102 140 94 120 94C100 94 84 102 76 118Z'}),
    s('circle',{class:'st-av-glass',cx:101,cy:124,r:12}),
    s('circle',{class:'st-av-glass',cx:139,cy:124,r:12}),
    s('path',{class:'st-av-glass',d:'M113 124H127'}),
    s('path',{class:'st-av-book',d:'M66 246Q93 232 120 246Q147 232 174 246V254H66Z'}),
    s('rect',{class:'st-av-desk',x:18,y:254,width:204,height:10,rx:5}),
    s('path',{class:'st-av-pen',d:'M190 196L160 240'}),
    s('circle',{class:'st-av-pen-tip',cx:158,cy:243,r:4}),
  ];
  svg.append(...parts);
  if(art==='intense')svg.append(s('path',{class:'st-av-brow',d:'M91 107L111 108'}),s('path',{class:'st-av-brow',d:'M149 107L129 108'}));
  return svg;
}
// 등급 그림. 그림을 쓸 수 있으면 평평한 이름의 webp를 쓰고, 못 불러오면 자리표시로 바꾼 뒤 onFail(img,자리표시)로 알린다.
function figureNode(h,no,art,useArt,onFail){
  if(!useArt)return placeholderFigure(h,art);
  const img=h.el('img',null,'st-fig st-fig-art');img.alt='';img.setAttribute('src',artFile(no,art));
  img.addEventListener('error',()=>{const ph=placeholderFigure(h,art);img.replaceWith?.(ph);onFail?.(img,ph);});
  return img;
}
const viewOf=useArt=>'0 0 240 '+(useArt?351:300);
function fxBack({s},useArt){
  const svg=s('svg',{class:'st-fx st-fx-back',viewBox:viewOf(useArt),'aria-hidden':'true',focusable:'false'}),defs=s('defs'),grad=s('radialGradient',{id:'stAuraGrad'});
  grad.append(s('stop',{class:'st-stop-a',offset:'0%'}),s('stop',{class:'st-stop-b',offset:'100%'}));defs.append(grad);
  svg.append(defs,s('circle',{class:'st-aura',cx:120,cy:useArt?150:140,r:useArt?150:120,fill:'url(#stAuraGrad)'}));
  return svg;
}
function fxFront({s},useArt){
  const svg=s('svg',{class:'st-fx st-fx-front',viewBox:viewOf(useArt),'aria-hidden':'true',focusable:'false'});
  PARTICLES.forEach(([cx,cy],i)=>svg.append(s('circle',{class:'st-particle st-particle-'+(i%4),cx,cy,r:i%3===0?3:2})));
  if(useArt)for(const [x,y] of ART_GLINTS)svg.append(s('path',{class:'st-glint-mark',d:'M'+x+' '+(y-7)+'L'+(x+1.6)+' '+(y-1.6)+'L'+(x+7)+' '+y+'L'+(x+1.6)+' '+(y+1.6)+'L'+x+' '+(y+7)+'L'+(x-1.6)+' '+(y+1.6)+'L'+(x-7)+' '+y+'L'+(x-1.6)+' '+(y-1.6)+'Z'}));
  return svg;
}
const fxClass=(level,useArt)=>'st-stage st-lv-'+level+(useArt?' st-stage-art':'')+(level>=2?' st-glint':'')+(level>=3?' st-particles':'')+(level>=4?' st-aura-on':'')+(level>=5?' st-full':'');

function todayRing({s},minutes){
  const size=72,stroke=8,r=(size-stroke)/2,c=2*Math.PI*r,mid=size/2,part=Math.min(1,minutes/FULL_EFFECT_MIN);
  const svg=s('svg',{class:'lb-ring st-ring',width:size,height:size,viewBox:'0 0 '+size+' '+size,role:'img','aria-label':'오늘 누적 '+hmText(minutes)});
  const text=s('text',{class:'lb-ring-text',x:mid,y:mid});text.textContent=clockText(minutes);
  svg.append(s('circle',{class:'lb-ring-track',cx:mid,cy:mid,r,'stroke-width':stroke}));
  if(part>0)svg.append(s('circle',{class:'lb-ring-fill',cx:mid,cy:mid,r,'stroke-width':stroke,'stroke-dasharray':(c*part)+' '+c,transform:'rotate(-90 '+mid+' '+mid+')'}));
  svg.append(text);
  return svg;
}
const nextEffectText=fx=>fx.next?'다음 효과까지 '+hmText(fx.toNextMin)+' · '+fx.next.label:'오늘 효과 최고 단계 · '+fx.label;
const todayBadge=fx=>fx.level===1?'오늘 효과 대기':'오늘 '+fx.label;

function ladderCard(h,proj){
  const {el,add}=h,{stage,next}=proj,done=stage.no-1;
  const right=next?'다음: '+next.name+' · '+hmText(proj.toNextMin)+' 남음':'금빛 별 '+proj.stars+'개 · 다음 별까지 '+hmText(proj.toNextStarMin);
  const out=add(el('section',null,'panel st-ladder'),add(el('div',null,'st-ladder-head'),el('strong',stage.name),el('span',right,'muted small')));
  const bar=el('progress',null,'lb-xp-bar');bar.max=proj.spanMin;bar.value=proj.intoMin;bar.setAttribute('aria-label',(next?stage.name+'에서 '+next.name+'까지 ':'다음 금빛 별까지 ')+Math.floor(proj.intoMin/proj.spanMin*100)+'%');
  const cells=el('div',null,'st-cells');cells.setAttribute('role','img');cells.setAttribute('aria-label','평생 등급 '+STUDY_STAGES.length+'단계 중 '+stage.no+'단계');
  STUDY_STAGES.forEach((row,i)=>{const c=el('span',null,'st-cell '+(i<done?'done':i===done?'now':'todo'));c.title=row.no+'. '+row.name+' · '+row.hours.toLocaleString('en-US')+'시간';add(cells,c);});
  const nowTier=goldTierOf(stage.no),tiers=el('ol',null,'st-tiers');
  for(const t of GOLD_TIERS){
    const li=add(el('li',null,'st-tier '+(t===nowTier?'now':t.fromNo<nowTier.fromNo?'done':'todo')),el('strong',t.name),el('span',t.gear));
    if(t===nowTier)li.setAttribute('aria-current','step');
    add(tiers,li);
  }
  add(out,bar,cells,tiers,el('p',STUDY_STAGES.length+'단계 · 금 장신구는 단계마다 더해져요 · 쌓은 기록만 셉니다','muted small st-ladder-note'));
  if(proj.stars){
    const shown=Math.min(MAX_STAR_MARKS,proj.stars),stars=el('p','★'.repeat(shown)+(proj.stars>shown?' +'+(proj.stars-shown):''),'st-stars');
    stars.setAttribute('aria-label','금빛 별 '+proj.stars+'개, '+STAR_EVERY_HOURS+'시간마다 1개');add(out,stars);
  }
  const list=el('ol',null,'st-stage-list');
  for(const row of STUDY_STAGES)add(list,add(el('li',null,'st-stage-row'+(row.no===stage.no?' now':'')),el('span',row.no+'. '+row.name),el('span',row.hours.toLocaleString('en-US')+'시간','muted small')));
  add(out,add(el('details',null,'st-stage-all'),el('summary','20단계 전체 보기 · 실제 신분이 아니라 누적 공부 시간 기준'),list));
  return out;
}

function door(h,word,sub,onClick){
  const {el,add}=h,b=add(el('button',null,'secondary st-door'),el('span',word,'eyebrow'),el('strong',sub));
  b.type='button';b.dataset.navOnly='1';if(onClick)b.addEventListener('click',onClick);else b.disabled=true;
  return b;
}
function towerSub(whole,date){
  try{const ach=achieve({life:whole.life??null,study:whole.study??null,today:date}),bricks=ach.weeks.reduce((n,w)=>n+w.bricks,0);return '나의 집 · 벽돌 '+bricks.toLocaleString('en-US')+'장';}
  catch{return '나의 집';}
}
function universeSub(whole,nowIso){
  try{return '지식 우주 · 별 '+universeData(whole.study??null,nowIso).total.toLocaleString('en-US')+'개';}
  catch{return '지식 우주';}
}

export function renderStatusView(root,ctx){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add}=h,whole=ctx.getWhole();
  const nowIso=String(ctx.now()),date=kstDate(nowIso);
  const proj=stageOf(lifetimeMinutes(whole.study??null)),useArt=ctx.avatarArt??AVATAR_ART_READY;
  const read=iso=>{const t=todayMinutes({study:whole.study??null,date,draftCard:ctx.draftCard??null,timer:ctx.timer??null,nowIso:iso});return {...t,fx:todayEffectOf(t.minutes)};};
  const out=el('section',null,'st-page');out.id='status-page';
  add(out,add(el('div',null,'st-head'),el('span','나의 상태','eyebrow'),el('span','누적 '+(proj.minutes>=60?hoursText(proj.minutes):hmText(proj.minutes)),'muted small st-total')));

  // 1) 아바타: 뒤 효과(오라) · 등급 그림 · 앞 효과(입자) + 등급·오늘 효과 배지
  // FIX31 (D7): 그림을 한 번 못 불러오면 이 화면은 자리표시로 바꾼다: 붙들고 있는 figure, 무대 클래스, 효과 viewBox까지. 그 뒤 단계가 바뀌어도 자리표시로 그린다.
  let today=read(nowIso),art=today.fx.art,artOn=useArt,figure,back=fxBack(h,useArt),front=fxFront(h,useArt),stage=null;
  const artFailed=(img,ph)=>{
    if(figure!==img)return;   // 이미 바뀐 옛 그림의 늦은 오류
    figure=ph;if(!artOn)return;
    artOn=false;stage.className=fxClass(today.fx.level,false);
    const b=fxBack(h,false),f=fxFront(h,false);back.replaceWith?.(b);front.replaceWith?.(f);back=b;front=f;
  };
  const figureOf=a=>figureNode(h,proj.stage.no,a,artOn,artFailed);
  figure=figureOf(art);
  stage=add(el('div',null,fxClass(today.fx.level,useArt)),back,figure,front);
  const badgeToday=el('span',todayBadge(today.fx),'st-badge st-badge-today');
  const avatar=add(el('section',null,'panel st-avatar'),stage,el('span',proj.stage.name,'st-badge st-badge-stage'),badgeToday,useArt?null:el('p','자리표시 그림입니다 · 등급 그림은 준비 중이에요','muted small st-art-note'));

  // 2) 오늘 시간: 링·오늘 누적·다음 효과까지 (타이머가 돌면 "지금 - 시작"으로 다시 계산)
  const ringSlot=add(el('div',null,'st-ring-slot'),todayRing(h,today.minutes));
  const todayLine=el('strong','오늘 '+hmText(today.minutes),'st-today-time'),nextLine=el('span',nextEffectText(today.fx),'muted small st-today-next');
  const noteLine=el('span',ctx.timer?'진행 중 타이머 포함':'아직 쌓지 않은 초안도 오늘 시간에 들어가요','muted small st-today-note');
  const go=ctx.openStudy?el('button',ctx.timer?'집중 화면 보기':'공부 시작','primary st-today-go'):null;
  if(go){go.type='button';go.dataset.navOnly='1';go.addEventListener('click',()=>ctx.openStudy());}
  const todayCard=add(el('section',null,'panel st-today'),ringSlot,add(el('div',null,'st-today-text'),todayLine,nextLine,noteLine),go);

  // 3) 평생 등급 진행 바(20칸)  4) 탑·우주 입구
  const doors=add(el('div',null,'st-doors'),door(h,'탑',towerSub(whole,date),ctx.openTower),door(h,'우주',universeSub(whole,nowIso),ctx.openUniverse));
  add(out,add(el('div',null,'st-body'),avatar,add(el('div',null,'st-side'),todayCard,ladderCard(h,proj),doors)));

  const paint=()=>{
    const iso=String(ctx.now());
    if(kstDate(iso)!==date){stop();void ctx.rerender?.();return;}   // 자정을 넘기면 오늘 카드부터 다시 읽는다
    const next=read(iso);
    if(next.minutes===today.minutes)return;
    today=next;
    ringSlot.replaceChildren(todayRing(h,today.minutes));
    todayLine.textContent='오늘 '+hmText(today.minutes);nextLine.textContent=nextEffectText(today.fx);badgeToday.textContent=todayBadge(today.fx);
    stage.className=fxClass(today.fx.level,artOn);
    if(today.fx.art!==art){art=today.fx.art;const fresh=figureOf(art);figure.replaceWith?.(fresh);figure=fresh;}
  };
  const stop=liveTick(out,doc,paint);
  root.append(out);
  return out;
}

// 설정의 "수험 기록 보관 후 새 사다리" 스위치 자리. 지금은 표시만 하며 어떤 동작도 없다(동작은 다음 작업).
export function renderLadderResetSlot(doc){
  const {el,add}=maker(doc),input=el('input');
  input.type='checkbox';input.setAttribute('role','switch');input.disabled=true;input.setAttribute('aria-label','수험 기록 보관 후 새 사다리');
  return add(el('section',null,'panel st-reset-slot'),el('h2','수험 기록','panel-title'),
    add(el('label',null,'lb-toggle st-reset-toggle'),input,el('span',null,'lb-toggle-track'),el('span','수험 기록 보관 후 새 사다리','lb-toggle-label')),
    el('p','실제 합격 후에 쓸 자리입니다 · 지금은 표시만 하고 아무것도 바꾸지 않아요. 누적 시간은 지우지 않습니다.','muted small'));
}
