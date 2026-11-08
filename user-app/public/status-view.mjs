// 상태 화면 (AV2, AV4C, B65): 아바타(평생 등급 그림 + 오늘 효과) + 그 아래 "어디까지 왔나"(12칸 사다리·다음 단계·의사까지·예상 날짜·12칸 미리보기 줄) → 오늘 시간 링·다음 효과까지 → 금 장신구·전체 단계 → 탑·우주 입구. 합성 데이터로만 시험한다.
// 읽기만 한다: 쌓인 공부 카드·오늘 초안·진행 중 타이머를 계산해 그릴 뿐 어떤 기록도 쓰지 않는다(새 엔티티·저장 0).
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 색은 styles.css 토큰, 움직임은 CSS(prefers-reduced-motion이면 멈춘다).
// ctx = lifeCtx와 같은 document·now·getWhole·rerender + draftCard·timer(오늘 초안·진행 중 타이머), openStudy·openTower·openUniverse(선택), avatarArt(시험용, 없으면 AVATAR_ART_READY).
import {STUDY_STAGES,FINAL_STAGE,GOLD_TIERS,goldTierOf,STAR_EVERY_HOURS,AVATAR_ART_READY,FULL_EFFECT_MIN,RECENT_DAYS,artFile,lifetimeMinutes,recentMinutes,stageOf,progressOf,todayEffectOf,todayMinutes,hoursText,hoursLeftText,perDayText,shortDate,hmText,clockText,liveTick} from './study-stage.mjs';
import {achieve} from './life-achieve.mjs';
import {kstDate} from './life-model.mjs';
import {universeData} from './universe-view.mjs';
import {todayEffectStrip} from './study-live.mjs';   // DS5: 오늘 효과 5단계 띠(작게 보기와 같은 함수)

const NS='http://www.w3.org/2000/svg';
const MAX_STAR_MARKS=12;
// 입자 자리(뷰박스 240×300). 고정값이라 어느 기기에서나 같게 그려진다.
const PARTICLES=Object.freeze([[38,206],[62,120],[78,246],[104,66],[132,44],[160,92],[186,224],[204,142],[52,62],[214,74],[28,152],[174,36]]);
// 그림 위 안경테 양끝 자리의 대략값(뷰박스 240×351 단위, 그림 1560×2280·옛 624×912와 같은 비율). 등급마다 구도가 조금씩 달라 펜 끝은 공통 자리가 없다(AV2 보고서).
const ART_GLINTS=Object.freeze([[96,80],[166,77]]);

function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const s=(tag,attrs={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  return {el,add,s};
}

// 자리표시 그림 1장: 그림 파일이 없거나 못 불러올 때 쓴다. 책상 앞의 사람을 선으로 그린 SVG이며 실제 사진이 아니다. 열공(intense)이면 눈썹 선이 더해진다.
function placeholderFigure({s},art,cls='st-fig'){
  const svg=s('svg',{class:cls+' '+cls+'-placeholder',viewBox:'0 0 240 300','aria-hidden':'true',focusable:'false'});
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
function figureNode(h,no,art,useArt,onFail,cls='st-fig'){
  if(!useArt)return placeholderFigure(h,art,cls);
  const img=h.el('img',null,cls+' '+cls+'-art');img.alt='';img.setAttribute('src',artFile(no,art));
  img.addEventListener('error',()=>{const ph=placeholderFigure(h,art,cls);img.replaceWith?.(ph);onFail?.(img,ph);});
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

// "어디까지 왔나" 문구(AV4C). 수치는 progressOf에서 오고 여기서는 글자만 만든다. today = KST 날짜.
export function progressLines(p,today){
  const when=e=>e.date?'약 '+e.days.toLocaleString('en-US')+'일('+shortDate(e.date,today)+')':'100년 넘게';
  const lead=p.assumed?'최근 '+RECENT_DAYS+'일 기록이 없어 하루 '+perDayText(p.perDayMin)+'(가정)이면':'최근 '+RECENT_DAYS+'일 하루 평균 '+perDayText(p.perDayMin)+'이면';
  return {
    head:p.no+'단계 / '+p.total+' · '+p.stage.name,
    next:p.next?'다음 단계('+p.next.name+')까지 '+hoursLeftText(p.toNextMin):'금빛 별 '+p.stars+'개 · 다음 별까지 '+hoursLeftText(p.toNextMin),
    final:p.toFinalMin>0?FINAL_STAGE.name+'까지 '+hoursLeftText(p.toFinalMin)+' · 전체 '+p.percent+'%':FINAL_STAGE.name+' 완성 · 전체 100%',
    eta:lead+' → '+(p.next?'다음 단계 ':'다음 별 ')+when(p.nextEta)+(p.toFinalMin>0?', '+FINAL_STAGE.name+'까지 '+when(p.finalEta):''),
  };
}
// 상태 그림 바로 아래: 몇 단계인지 · 12칸 사다리(지난 단계 금색, 지금 단계 반짝, 남은 단계 아이보리) · 다음 단계까지 막대 · 의사까지 · 예상 날짜.
function progressBlock(h,p,today,gallery){
  const {el,add}=h,lines=progressLines(p,today),done=p.no-1;
  const cells=el('div',null,'st-cells');cells.setAttribute('role','img');cells.setAttribute('aria-label','평생 등급 '+p.total+'단계 중 '+p.no+'단계');
  STUDY_STAGES.forEach((row,i)=>{const c=el('span',null,'st-cell '+(i<done?'done':i===done?'now':'todo'));c.title=row.no+'. '+row.name+' · '+row.hours.toLocaleString('en-US')+'시간';add(cells,c);});
  const bar=el('progress',null,'lb-xp-bar');bar.max=p.spanMin;bar.value=p.intoMin;bar.setAttribute('aria-label',(p.next?p.stage.name+'에서 '+p.next.name+'까지 ':'다음 금빛 별까지 ')+Math.floor(p.intoMin/p.spanMin*100)+'%');
  return add(el('div',null,'st-progress'),el('strong',lines.head,'st-progress-head'),cells,
    el('span',lines.next,'st-progress-next'),bar,el('span',lines.final,'muted small st-progress-final'),el('span',lines.eta,'muted small st-progress-eta'),gallery);
}

// 12칸 미리보기 줄(B65) 상태: 진행 표시와 같은 progressOf 결과에서만 구한다. reached = 이미 도달(지금 단계 포함), next = 바로 다음, locked = 그 뒤. final은 상태와 따로 붙는 표지다.
export function galleryCells(p){
  return STUDY_STAGES.map(row=>({row,state:row.no<=p.no?'reached':row.no===p.next?.no?'next':'locked',now:row.no===p.no,final:row===FINAL_STAGE}));
}
const galleryState=c=>c.now?'지금 단계':c.state==='reached'?'도달':c.state==='next'?'다음 목표':'아직 잠김';
const galleryName=c=>c.row.no+'단계 '+c.row.name+' · '+galleryState(c)+(c.final?' · 최종':'');
// 진행 표시 밑 12칸 줄 + 크게 보기(겹침 창). 보기 전용(저장 0). 썸네일은 보일 때만 그림을 요청하고, 그림을 못 불러오면 FIX31 D7처럼 자리표시로 바꾸며 다시 요청하지 않는다.
function stageGallery(h,doc,page,p,today,useArt){
  const {el,add}=h,cells=galleryCells(p),lines=progressLines(p,today),failed=new Set();
  let artOn=useArt,box=null,at=0,intense=false,title,notes,big,toggle;
  const picture=(no,art)=>figureNode(h,no,art,artOn&&!failed.has(artFile(no,art)),()=>failed.add(artFile(no,art)),'st-gal-fig');
  const navButton=(text,cls,onClick)=>{const b=el('button',text,cls);b.type='button';b.dataset.navOnly='1';b.addEventListener('click',onClick);return b;};
  const paintBig=()=>{
    const c=cells[at],art=intense?'intense':'base';
    title.textContent=c.row.no+'단계 · '+c.row.name;box.setAttribute('aria-label',galleryName(c));
    notes.replaceChildren(...[el('span',galleryState(c),'st-gal-tag st-gal-tag-'+c.state),c.final?el('span','최종','st-gal-tag st-gal-tag-final'):null,c.state==='next'?el('span',lines.next,'st-gal-left'):null].filter(Boolean));
    big.replaceChildren(picture(c.row.no,art));
    toggle.textContent=intense?'기본 모습 보기':'열공 모습 보기';toggle.setAttribute('aria-pressed',String(intense));
  };
  const move=d=>{const i=at+d;if(i<0||i>=cells.length)return;at=i;intense=false;paintBig();};
  const build=()=>{
    box=el('dialog',null,'st-gal-box');title=el('h2',null,'st-gal-title');title.setAttribute('aria-live','polite');notes=el('div',null,'st-gal-notes');big=el('div',null,'st-gal-big');
    toggle=navButton('','secondary st-gal-toggle',()=>{intense=!intense;paintBig();});
    add(box,add(el('div',null,'st-gal-inner'),add(el('div',null,'st-gal-head'),title,navButton('닫기','secondary st-gal-close',()=>box.close?.())),notes,big,toggle));
    box.addEventListener('click',e=>{if(e.target===box)box.close?.();});   // 안쪽 칸이 창을 꽉 채우므로 창 자체가 눌리면 바깥(뒤 막)이다
    box.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault?.();box.close?.();}
      else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault?.();move(e.key==='ArrowRight'?1:-1);}
    });
    box.addEventListener('close',()=>thumbs[at].focus?.());
    add(page,box);
  };
  const open=i=>{if(!box)build();at=i;intense=false;paintBig();if(!box.open)box.showModal?.();};
  const frames=[],thumbs=cells.map((c,i)=>{
    const frame=el('span',null,'st-gal-frame'),tags=el('span',null,'st-gal-tags');frames.push(frame);
    if(c.state==='next')add(tags,el('span','다음 목표','st-gal-tag st-gal-tag-next'));
    if(c.final)add(tags,el('span','최종','st-gal-tag st-gal-tag-final'));
    const b=add(navButton(null,'st-gal-thumb '+c.state+(c.now?' now':'')+(c.final?' final':''),()=>open(i)),frame,el('span',c.row.no,'st-gal-no'),tags);
    b.setAttribute('aria-label',galleryName(c));b.title=galleryName(c);if(c.now)b.setAttribute('aria-current','step');
    b.addEventListener('keydown',e=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,to=d?thumbs[i+d]:null;if(to){e.preventDefault?.();to.focus?.();}});
    return b;
  });
  const row=el('ol',null,'st-gal');row.setAttribute('aria-label',STUDY_STAGES.length+'단계 미리보기');
  thumbs.forEach(b=>add(row,add(el('li',null,'st-gal-item'),b)));
  const IO=doc.defaultView?.IntersectionObserver;
  const watch=artOn&&IO?new IO(es=>{for(const e of es)if(e.isIntersecting){watch.unobserve(e.target);const i=frames.indexOf(e.target);e.target.replaceChildren(picture(i+1,'base'));}}):null;
  frames.forEach(f=>{if(watch)watch.observe(f);else f.append(placeholderFigure(h,'base','st-gal-fig'));});
  // 큰 그림이 못 불러와 화면이 자리표시로 바뀌면(D7) 썸네일·크게 보기도 함께 바꾼다
  const artOff=()=>{
    if(!artOn)return;
    artOn=false;watch?.disconnect?.();
    frames.forEach(f=>f.replaceChildren(placeholderFigure(h,'base','st-gal-fig')));
    if(box?.open)paintBig();
  };
  return {row,artOff};
}

function ladderCard(h,proj){
  const {el,add}=h,{stage}=proj;
  const out=add(el('section',null,'panel st-ladder'),add(el('div',null,'st-ladder-head'),el('strong','금 장신구'),el('span',stage.name,'muted small')));
  const nowTier=goldTierOf(stage.no),tiers=el('ol',null,'st-tiers');
  for(const t of GOLD_TIERS){
    const li=add(el('li',null,'st-tier '+(t===nowTier?'now':t.fromNo<nowTier.fromNo?'done':'todo')),el('strong',t.name),el('span',t.gear));
    if(t===nowTier)li.setAttribute('aria-current','step');
    add(tiers,li);
  }
  add(out,tiers,el('p',STUDY_STAGES.length+'단계 · 금 장신구는 단계마다 더해져요 · 쌓은 기록만 셉니다','muted small st-ladder-note'));
  if(proj.stars){
    const shown=Math.min(MAX_STAR_MARKS,proj.stars),stars=el('p','★'.repeat(shown)+(proj.stars>shown?' +'+(proj.stars-shown):''),'st-stars');
    stars.setAttribute('aria-label','금빛 별 '+proj.stars+'개, '+STAR_EVERY_HOURS+'시간마다 1개');add(out,stars);
  }
  const list=el('ol',null,'st-stage-list');
  for(const row of STUDY_STAGES)add(list,add(el('li',null,'st-stage-row'+(row.no===stage.no?' now':'')),el('span',row.no+'. '+row.name),el('span',row.hours.toLocaleString('en-US')+'시간','muted small')));
  add(out,add(el('details',null,'st-stage-all'),el('summary',STUDY_STAGES.length+'단계 전체 보기 · 실제 신분이 아니라 누적 공부 시간 기준'),list));
  return out;
}

function door(h,word,sub,onClick){
  const {el,add}=h,b=add(el('button',null,'secondary st-door'),el('span',word,'eyebrow'),el('strong',sub));
  b.type='button';b.dataset.navOnly='1';if(onClick)b.addEventListener('click',onClick);else b.disabled=true;
  return b;
}
function towerSub(whole,date,money){
  try{const ach=achieve({life:whole.life??null,study:whole.study??null,today:date,money}),bricks=ach.weeks.reduce((n,w)=>n+w.bricks,0);return '나의 집 · 벽돌 '+bricks.toLocaleString('en-US')+'장';}
  catch{return '나의 집';}
}
// Q1C: 칭호 칩. 돈 업적 칭호도 오늘·탑과 같게 보이도록 같은 입력(돈 사실 포함)으로 계산한다. 앱이 ctx.achvTitle을 넘길 때만 돈다. 칭호 때문에 상태 화면이 깨지지 않게 실패하면 칸을 비운다.
function titleRow({el,add},ctx,whole,date,money){
  if(!ctx.achvTitle)return null;
  try{
    const life=whole.life??null,ach=achieve({life,study:whole.study??null,fin:whole.fin??null,today:date,money}),t=ctx.achvTitle({doc:ctx.document??globalThis.document,ach,life,money,storage:ctx.storage});
    return t?add(el('div',null,'st-title'),t.node):null;
  }catch{return null;}
}
function moneyOf(ctx,date){try{return ctx.money?.(date)??null;}catch{return null;}}
function universeSub(whole,nowIso){
  try{return '지식 우주 · 별 '+universeData(whole.study??null,nowIso).total.toLocaleString('en-US')+'개';}
  catch{return '지식 우주';}
}

export function renderStatusView(root,ctx){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add}=h,whole=ctx.getWhole();
  const nowIso=String(ctx.now()),date=kstDate(nowIso);
  const proj=stageOf(lifetimeMinutes(whole.study??null)),useArt=ctx.avatarArt??AVATAR_ART_READY;
  const prog=progressOf(proj,recentMinutes(whole.study??null,date),date);
  const read=iso=>{const t=todayMinutes({study:whole.study??null,date,draftCard:ctx.draftCard??null,timer:ctx.timer??null,nowIso:iso});return {...t,fx:todayEffectOf(t.minutes)};};
  const out=el('section',null,'st-page');out.id='status-page';
  add(out,add(el('div',null,'st-head'),el('span','나의 상태','eyebrow'),el('span','누적 '+(proj.minutes>=60?hoursText(proj.minutes):hmText(proj.minutes)),'muted small st-total')));

  // 1) 아바타: 뒤 효과(오라) · 등급 그림 · 앞 효과(입자) + 등급·오늘 효과 배지, 바로 아래 "어디까지 왔나"(AV4C)
  // FIX31 (D7): 그림을 한 번 못 불러오면 이 화면은 자리표시로 바꾼다: 붙들고 있는 figure, 무대 클래스, 효과 viewBox까지. 그 뒤 단계가 바뀌어도 자리표시로 그린다.
  let today=read(nowIso),art=today.fx.art,artOn=useArt,figure,back=fxBack(h,useArt),front=fxFront(h,useArt),stage=null;
  const artFailed=(img,ph)=>{
    if(figure!==img)return;   // 이미 바뀐 옛 그림의 늦은 오류
    figure=ph;if(!artOn)return;
    artOn=false;stage.className=fxClass(today.fx.level,false);
    const b=fxBack(h,false),f=fxFront(h,false);back.replaceWith?.(b);front.replaceWith?.(f);back=b;front=f;
    gallery.artOff();
  };
  const gallery=stageGallery(h,doc,out,prog,date,useArt);
  const figureOf=a=>figureNode(h,proj.stage.no,a,artOn,artFailed);
  figure=figureOf(art);
  stage=add(el('div',null,fxClass(today.fx.level,useArt)),back,figure,front);
  const badgeToday=el('span',todayBadge(today.fx),'st-badge st-badge-today');
  const money=moneyOf(ctx,date);
  const avatar=add(el('section',null,'panel st-avatar'),titleRow(h,ctx,whole,date,money),stage,el('span',proj.stage.name,'st-badge st-badge-stage'),badgeToday,useArt?null:el('p','자리표시 그림입니다 · 등급 그림은 준비 중이에요','muted small st-art-note'),progressBlock(h,prog,date,gallery.row));

  // 2) 오늘 시간: 링·오늘 누적·다음 효과까지 (타이머가 돌면 "지금 - 시작"으로 다시 계산)
  const ringSlot=add(el('div',null,'st-ring-slot'),todayRing(h,today.minutes));
  const todayLine=el('strong','오늘 '+hmText(today.minutes),'st-today-time'),nextLine=el('span',nextEffectText(today.fx),'muted small st-today-next');
  const noteLine=el('span',ctx.timer?'진행 중 타이머 포함':'아직 쌓지 않은 임시 입력도 오늘 시간에 들어가요','muted small st-today-note');
  // B6: PC 집중 측정에서 담을 수 있는 분(앱이 계산해 넘긴다). 오늘 시간·효과에는 더하지 않고 흐린 글씨로만 보인다.
  const focusMin=Number.isInteger(ctx.focusExtraMin)&&ctx.focusExtraMin>0?ctx.focusExtraMin:0;
  const focusLine=focusMin?el('span','+'+hmText(focusMin)+' 담기 가능 · PC 집중 측정 (아직 더하지 않음)','muted small st-focus-extra'):null;
  const go=ctx.openStudy?el('button',ctx.timer?'집중 화면 보기':'공부 시작','primary st-today-go'):null;
  if(go){go.type='button';go.dataset.navOnly='1';go.addEventListener('click',()=>ctx.openStudy());}
  const todayCard=add(el('section',null,'panel st-today'),ringSlot,add(el('div',null,'st-today-text'),todayLine,nextLine,noteLine,focusLine),go);
  // DS5: B65 미리보기 바로 옆(넓은 화면)·아래(좁은 화면) = 오른쪽 칸 맨 위. 상태 화면은 글자 칸만(썸네일 장면은 작게 보기에서), 분 단위로 다시 그린다
  const effects=todayEffectStrip(doc,{grade:proj.stage.no,thumbs:false,cls:'panel st-effects'});effects.paint(today.minutes*60000);

  // 3) 금 장신구·전체 단계  4) 탑·우주 입구
  const doors=add(el('div',null,'st-doors'),door(h,'탑',towerSub(whole,date,money),ctx.openTower),door(h,'우주',universeSub(whole,nowIso),ctx.openUniverse));
  add(out,add(el('div',null,'st-body'),avatar,add(el('div',null,'st-side'),effects.node,todayCard,ladderCard(h,proj),doors)));

  const paint=()=>{
    const iso=String(ctx.now());
    if(kstDate(iso)!==date){stop();void ctx.rerender?.();return;}   // 자정을 넘기면 오늘 카드부터 다시 읽는다
    const next=read(iso);
    if(next.minutes===today.minutes)return;
    today=next;
    ringSlot.replaceChildren(todayRing(h,today.minutes));
    todayLine.textContent='오늘 '+hmText(today.minutes);nextLine.textContent=nextEffectText(today.fx);badgeToday.textContent=todayBadge(today.fx);
    stage.className=fxClass(today.fx.level,artOn);
    effects.paint(today.minutes*60000);   // DS5
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
