// PC 집중 측정(FOCUS, B6)의 화면 쪽: 분류 규칙(이 기기 localStorage), 담을 수 있는 구간 계산, 카드·규칙 편집·분류 도우미 화면.
// 설계: AUTOPILOT\design\B6_FOCUS_DESIGN.md §3·§4. PC 앱(APP_SHELL)에서 설정 스위치를 켰을 때만 app.mjs가 이 모듈을 불러온다.
// 숫자는 host(focus-reader.mjs)가 ActivityWatch(127.0.0.1:5600)를 읽어 만든다. 화면은 숫자와 시각 구간만 받고, 창 제목·주소는 받지 않는다.
// 정본은 STUDY_DAY 세션뿐이다(타이머 우선). 측정값은 어디에도 자동으로 더하지 않고, "확인하고 담기"를 누를 때만 타이머·기록과 겹치지 않는 구간이 세션이 된다(공부 초안, 연산 0).
// 세션 id 표지: 타이머 "끝내고 담기" = lf_<과목>_T…, 여기서 담은 것 = lf_<과목>_A…. uid가 16진수(소문자)라 T·A는 기존 id와 겹치지 않는다.
// 이 모듈은 시계·저장소·요청·DOM을 ctx로 받는다(시험은 가짜를 꽂는다). host(focus-reader.mjs)도 규칙 검사(rulesOK)를 여기서 가져다 쓴다.
import {kstDate,hhmmFromIso,sessionIdFor,studyCodeOf} from './life-model.mjs';
import {MAX_SESSIONS} from './study-model.mjs';
import {sessionMark} from './study-rebase.mjs';
import {hmText,liveTick} from './study-stage.mjs';
export {sessionMark};

export const FOCUS_ROUTE='/api/focus-today';
export const FOCUS_ON_KEY='lb.focus.on',FOCUS_RULES_KEY='lb.focus.rules',FOCUS_AUDIBLE_KEY='lb.focus.audible';
export const FOCUS_REFRESH_MS=5*60000;
export const CLAIM_MIN=10;                       // 10분 미만 조각은 담지 않는다(벽돌 0이고 세션 칸 30을 아낀다)
export const RULE_KINDS=Object.freeze(['app','host','browser']),RULE_CLASSES=Object.freeze(['STUDY','DISTRACT']);
export const MAX_RULES=150,MAX_RULE_VALUE=64;
const APP_RE=/^[A-Za-z0-9._ -]{1,64}$/,HOST_RE=/^[a-z0-9.-]{1,64}$/;
const KST_MS=9*3600000,MIN_MS=60000;
const err=code=>Object.assign(new Error(code),{code});

// ---- 분류 규칙 기본값(소유자 결정 D2, 2026-11-06). youtube.com은 인강·딴짓이 섞여 있어 넣지 않는다(기타). 설정 화면에서 언제든 고친다 ----
const rule=(kind,value,cls)=>Object.freeze(cls?{kind,value,cls}:{kind,value});
export const DEFAULT_FOCUS_RULES=Object.freeze([
  ...['ebsi.co.kr','ebs.co.kr','megastudy.net','etoos.com','mimacstudy.com','daesung.com','kice.re.kr','suneung.re.kr'].map(v=>rule('host',v,'STUDY')),
  ...['Acrobat.exe','AcroRd32.exe','Hwp.exe','ONENOTE.EXE','Notion.exe','GoodNotes.exe'].map(v=>rule('app',v,'STUDY')),
  ...['instagram.com','tiktok.com','x.com','twitter.com','netflix.com','twitch.tv','chzzk.naver.com','dcinside.com','fmkorea.com'].map(v=>rule('host',v,'DISTRACT')),
  ...['Discord.exe','steam.exe'].map(v=>rule('app',v,'DISTRACT')),
  ...['msedge.exe','chrome.exe','whale.exe','firefox.exe'].map(v=>rule('browser',v)),
]);

// ---- 규칙 검사(host도 같은 함수를 쓴다): 정해진 칸만, 길이·글자 제한, 같은 종류·값 중복 없음 ----
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keysAre=(v,keys)=>Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export const hostValueOK=v=>typeof v==='string'&&HOST_RE.test(v)&&!v.startsWith('.')&&!v.endsWith('.')&&!v.includes('..');
export const appValueOK=v=>typeof v==='string'&&APP_RE.test(v)&&v.trim()===v;
export function ruleOK(r){
  if(!plain(r)||!RULE_KINDS.includes(r.kind))return false;
  if(r.kind==='browser')return keysAre(r,['kind','value'])&&appValueOK(r.value);
  if(!keysAre(r,['kind','value','cls'])||!RULE_CLASSES.includes(r.cls))return false;
  return r.kind==='app'?appValueOK(r.value):hostValueOK(r.value);
}
export function rulesOK(list){
  if(!Array.isArray(list)||list.length>MAX_RULES)return false;
  const seen=new Set();
  for(const r of list){
    if(!ruleOK(r))return false;
    const key=(r.kind==='host'?'host':'app')+'|'+r.value.toLowerCase()+'|'+(r.kind==='browser'?'B':'');
    if(seen.has(key))return false;seen.add(key);
  }
  return true;
}
// 입력 정리: 사이트는 소문자·앞의 www. 제거, 앱은 앞뒤 공백 제거. 검사는 rulesOK가 한다.
export function cleanRuleValue(kind,value){
  const v=String(value??'').trim();
  return kind==='host'?v.toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,''):v;
}

// ---- 이 기기 설정(localStorage). 막혀 있으면 기본값 ----
export function focusEnabled(storage){try{return storage?.getItem(FOCUS_ON_KEY)==='1';}catch{return false;}}
export function setFocusEnabled(storage,on){try{if(on)storage?.setItem(FOCUS_ON_KEY,'1');else storage?.removeItem(FOCUS_ON_KEY);}catch{/* 이번 실행 동안만 */}}
export function audibleOn(storage){try{return storage?.getItem(FOCUS_AUDIBLE_KEY)!=='0';}catch{return true;}}
export function setAudibleOn(storage,on){try{if(on)storage?.removeItem(FOCUS_AUDIBLE_KEY);else storage?.setItem(FOCUS_AUDIBLE_KEY,'0');}catch{/* 이번 실행 동안만 */}}
export function loadRules(storage){
  try{const v=JSON.parse(storage?.getItem(FOCUS_RULES_KEY)??'null');if(v!==null&&rulesOK(v))return v;}catch{/* 기본값 */}
  return DEFAULT_FOCUS_RULES.map(r=>({...r}));
}
export function saveRules(storage,rules){
  if(!rulesOK(rules))throw err('FOCUS_RULES_INVALID');
  storage?.setItem(FOCUS_RULES_KEY,JSON.stringify(rules));
}
export function resetRules(storage){try{storage?.removeItem(FOCUS_RULES_KEY);}catch{/* 이번 실행 동안만 */}}

// ---- 담을 수 있는 구간(§4.3). 시각은 ms, 결과의 시각은 ISO(Z) ----
// 구간을 아는 것: 표지 세션 [at − 분, at], 진행 중 타이머 [시작, 지금(끝 시각이 적혀 있으면 그 시각)], 공부 모듈에서 시작만 한 세션 [at(시작), 지금].
export function knownSpans(card,timer,nowIso){
  const now=Date.parse(nowIso),out=[];
  for(const s of card?.sessions??[]){
    const at=Date.parse(s?.at);if(!Number.isFinite(at))continue;
    if(sessionMark(s.id)){if(Number.isInteger(s.confirmedMin)&&s.confirmedMin>0)out.push([at-s.confirmedMin*MIN_MS,at]);}
    else if(s.state==='STARTED'&&now>at)out.push([at,now]);
  }
  const t=Date.parse(timer?.startIso),end=Date.parse(timer?.endIso);
  if(Number.isFinite(t)&&now>t)out.push([t,Number.isFinite(end)?Math.min(end,now):now]);
  return out;
}
// 구간을 모르는 분: 표지 없는 세션의 확인된 분 합.
export const unknownMinutes=card=>(card?.sessions??[]).reduce((n,s)=>n+(!sessionMark(s?.id)&&Number.isInteger(s?.confirmedMin)&&s.confirmedMin>0?s.confirmedMin:0),0);
function minus(spans,cuts){
  let out=spans;
  for(const [c,d] of cuts){
    const next=[];
    for(const [a,b] of out){if(d<=a||c>=b){next.push([a,b]);continue;}if(c>a)next.push([a,c]);if(d<b)next.push([d,b]);}
    out=next;
  }
  return out;
}
const minsOf=([a,b])=>Math.floor((b-a)/MIN_MS);
// blocks = host가 준 공부 블록, card = 오늘 공부 카드(초안이 있으면 초안), timer = 진행 중 타이머.
// 겹침을 정확히 모르면 적게 담는다(과소 계산): 구간을 아는 것은 빼고, 모르는 분은 짧은 조각부터 줄인다.
export function claimPlan({blocks,card,timer,nowIso,date=kstDate(nowIso)}){
  const now=Date.parse(nowIso),dayStart=Date.parse(date+'T00:00:00.000Z')-KST_MS;
  let spans=[];
  for(const b of Array.isArray(blocks)?blocks:[]){
    const a=Math.max(dayStart,Date.parse(b?.startIso)),e=Math.min(now,Date.parse(b?.endIso));
    if(Number.isFinite(a)&&Number.isFinite(e)&&e>a)spans.push([a,e]);
  }
  spans.sort((x,y)=>x[0]-y[0]);
  spans=minus(spans,knownSpans(card,timer,nowIso));
  let droppedShortMin=0;
  const keep=[];
  for(const s of spans){const m=minsOf(s);if(m>=CLAIM_MIN)keep.push(s);else droppedShortMin+=m;}
  const unknownMin=unknownMinutes(card);
  let left=unknownMin,reducedMin=0;
  const reduced=[];
  for(const [a,b] of [...keep].sort((x,y)=>minsOf(x)-minsOf(y)||x[0]-y[0])){
    const m=minsOf([a,b]),cut=Math.min(m,left);left-=cut;reducedMin+=cut;
    const rest=m-cut;
    if(rest>=CLAIM_MIN)reduced.push([b-rest*MIN_MS,b]);else droppedShortMin+=rest;
  }
  const slots=Math.max(0,MAX_SESSIONS-(card?.sessions?.length??0));
  const byLength=reduced.map(s=>[s[1]-minsOf(s)*MIN_MS,s[1]]).sort((x,y)=>minsOf(y)-minsOf(x)||x[0]-y[0]);
  const chosen=byLength.slice(0,slots),over=byLength.slice(slots);
  const pieces=chosen.sort((x,y)=>x[0]-y[0]).map(([a,b])=>({startIso:new Date(a).toISOString(),endIso:new Date(b).toISOString(),min:minsOf([a,b])}));
  return {pieces,totalMin:pieces.reduce((n,p)=>n+p.min,0),droppedShortMin,reducedMin,unknownMin,overflow:over.length,overflowMin:over.reduce((n,s)=>n+minsOf(s),0)};
}
// 조각 하나 = 세션 하나(기존 STUDY_DAY 세션 모양 그대로, id만 A 표지). at = 조각 끝, 분 = 조각 길이.
export function claimRows(pieces,{subjectId,uid}){
  return pieces.map(p=>({id:sessionIdFor(subjectId,'A'+uid().slice(0,7)),subject:studyCodeOf(subjectId),state:'COMPLETED',plannedMin:p.min,confirmedMin:p.min,restartLocator:'',at:p.endIso}));
}
// 상태 화면의 "+n분 담기 가능"(합산하지 않는 흐린 글씨). 오늘 측정값이 없으면 0.
export function claimableMin(fs,{card,timer,nowIso}){
  const r=fs?.result;
  if(!r||r.date!==kstDate(nowIso))return 0;
  try{return claimPlan({blocks:r.blocks,card,timer,nowIso}).totalMin;}catch{return 0;}
}

// ---- host 요청 ----
export function createFocusState(){return {result:null,code:null,at:null,loading:false,paint:null};}
export function focusBody(storage,nowIso,helper=false){return {date:kstDate(nowIso),rules:loadRules(storage),audible:audibleOn(storage),helper};}
const codeOf=e=>typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{0,90}$/.test(e.code)?e.code:'FOCUS_FAILED';
export async function refreshFocus(fs,ctx){
  const nowIso=String(ctx.now());
  try{fs.result=await ctx.request(focusBody(ctx.storage,nowIso));fs.code=null;}
  catch(e){fs.code=codeOf(e);}
  finally{fs.at=Date.parse(nowIso);}
  return fs;
}
export const FOCUS_TEXT=Object.freeze({
  FOCUS_AW_UNAVAILABLE:'ActivityWatch에 연결하지 못했어요 · 이 PC에서 ActivityWatch가 켜져 있는지 확인하세요.',
  FOCUS_AW_NO_WINDOW:'ActivityWatch 창 감시(aw-watcher-window)가 이 PC에서 보이지 않아요.',
  FOCUS_AW_BAD_RESPONSE:'ActivityWatch 응답을 읽지 못했어요.',
  FOCUS_AW_TOO_LARGE:'오늘 측정 기록이 너무 많아 읽지 못했어요.',
  FOCUS_LOCKED:'잠금을 풀면 측정값을 볼 수 있어요.',
  FOCUS_RULES_INVALID:'분류 규칙이 올바르지 않아요 · 규칙 편집에서 확인하세요.',
  FOCUS_DATE_MISMATCH:'날짜가 바뀌었어요 · 새로고침을 누르세요.',
  noWeb:'브라우저 사이트는 분류하지 못해요(ActivityWatch 브라우저 확장 필요) · 브라우저 시간은 기타로 셉니다.',
  noAfk:'자리 비움 감시가 없어 창이 켜져 있던 시간을 모두 활동으로 봤어요.',
  loading:'ActivityWatch에서 오늘 측정값을 읽는 중…',
  privacy:'앱 이름·사이트 도메인으로만 나눕니다 · 창 제목·주소 경로는 읽자마자 버리고 저장하지 않아요.',
  otherDevice:'다른 기기 타이머는 빠지지 않아요 · 아직 이 기기에 오지 않은 타이머와 겹치면 쌓을 때 알려 드려요(자동으로 지우지 않아요).',
});
export const focusErrorText=code=>FOCUS_TEXT[code]??'측정값을 불러오지 못했어요'+' · 문의 코드 ▾\u2060'+code+'\u2060';

// ---- 화면 ----
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const hint=text=>el('p',text,'muted small');
  const select=(options,value)=>{const n=el('select');for(const [v,t] of options){const o=el('option',t);o.value=String(v);n.append(o);}n.value=String(value);return n;};
  return {el,add,button,hint,select};
}
const FILL=Object.freeze({STUDY:'#E8C45A',DISTRACT:'#D9534F',OTHER:'#B5B5B5'});   // ui-kit 팔레트 값(V7C: 공부 = 밝은 금, 기타 = 중성 회색). 색은 SVG 속성으로만(인라인 style 없음)
function splitBar(doc,r){
  const NS='http://www.w3.org/2000/svg',svg=doc.createElementNS(NS,'svg'),total=r.studyMin+r.distractMin+r.otherMin;
  svg.setAttribute('class','focus-bar');svg.setAttribute('viewBox','0 0 300 10');svg.setAttribute('width','100%');svg.setAttribute('height','10');svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('role','img');svg.setAttribute('aria-label','공부 '+hmText(r.studyMin)+', 딴짓 '+hmText(r.distractMin)+', 기타 '+hmText(r.otherMin));
  let x=0;
  for(const [k,m] of [['STUDY',r.studyMin],['DISTRACT',r.distractMin],['OTHER',r.otherMin]]){
    if(!total||!m)continue;
    const w=m/total*300,rect=doc.createElementNS(NS,'rect');
    rect.setAttribute('x',String(x));rect.setAttribute('y','0');rect.setAttribute('width',String(w));rect.setAttribute('height','10');rect.setAttribute('fill',FILL[k]);
    svg.append(rect);x+=w;
  }
  return svg;
}
export const summaryLine=r=>'오늘 PC · 공부 '+hmText(r.studyMin)+' · 딴짓 '+hmText(r.distractMin)+' · 기타 '+hmText(r.otherMin);
export const claimLine=plan=>'타이머·기록과 겹친 시간은 빼고 새로 담을 수 있는 공부: '+hmText(plan.totalMin)+' (블록 '+plan.pieces.length+'개)';
export const pieceText=p=>hhmmFromIso(p.startIso)+'–'+hhmmFromIso(p.endIso)+' · '+hmText(p.min);

// 카드 하나. ctx: {document,kit:{sheet},state,request(body),storage,now(),uid(),date,card,timer,subjects:[{id,name}],subjectId,claim(rows)}.
// 그린 뒤 측정값이 오래됐으면(5분) 한 번 읽고 이 카드만 다시 그린다. 카드가 화면에 있는 동안 5분마다 다시 본다(숨으면 멈춤).
export function renderFocusCard(ctx){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint}=h,fs=ctx.state;
  const card=add(el('div',null,'life-bricks focus-card'));card.id='focus-card';
  const stale=()=>fs.at===null||Date.parse(String(ctx.now()))-fs.at>=FOCUS_REFRESH_MS||(fs.result&&fs.result.date!==kstDate(String(ctx.now())));
  const load=force=>{
    if(fs.loading||(!force&&!stale()))return;
    fs.loading=true;paint();
    void refreshFocus(fs,ctx).finally(()=>{fs.loading=false;fs.paint?.();});
  };
  const paint=()=>{
    const nowIso=String(ctx.now()),r=fs.result&&fs.result.date===kstDate(nowIso)?fs.result:null;
    const kids=[el('h3','PC 집중 측정')];
    if(fs.loading&&!r)kids.push(hint(FOCUS_TEXT.loading));
    if(fs.code)kids.push(el('p',focusErrorText(fs.code),'notice error'));
    let plan=null;
    if(r){
      kids.push(el('p',summaryLine(r),'focus-summary'),splitBar(doc,r));
      if(!r.webWatcher)kids.push(hint(FOCUS_TEXT.noWeb));
      if(r.afkWatcher===false)kids.push(hint(FOCUS_TEXT.noAfk));
      plan=claimPlan({blocks:r.blocks,card:ctx.card,timer:ctx.timer,nowIso});
      kids.push(el('p',claimLine(plan),'focus-claim'));
      if(plan.reducedMin)kids.push(hint('분 입력 기록이 있어 '+hmText(plan.reducedMin)+'을 덜 담았어요 · 타이머를 쓰면 정확해져요'));
      if(plan.droppedShortMin)kids.push(hint(CLAIM_MIN+'분 미만 '+hmText(plan.droppedShortMin)+'은 담지 않아요'));
      if(plan.overflow)kids.push(hint('오늘 공부 기록 칸('+MAX_SESSIONS+'개)이 모자라 '+plan.overflow+'개('+hmText(plan.overflowMin)+')는 담지 못해요'));
      kids.push(hint('측정값은 담기 전까지 아바타·벽돌에 더하지 않아요 · 기준 '+hhmmFromIso(r.asOf)));
    }
    const claimBtn=button('확인하고 공부 기록에 담기',()=>openClaim(ctx,h,plan),'primary');claimBtn.disabled=!plan||!plan.pieces.length||!ctx.subjects?.length;
    kids.push(add(el('div',null,'buttons'),claimBtn,button('새로고침',()=>load(true)),button('분류 도우미',()=>openHelper(ctx,h,()=>load(true))),button('규칙 편집',()=>openRules(ctx,h,()=>load(true)))));
    kids.push(hint(FOCUS_TEXT.privacy));
    card.replaceChildren(...kids);
  };
  fs.paint=()=>{if(card.isConnected!==false)paint();};
  paint();load(false);
  liveTick(card,doc,()=>load(false),FOCUS_REFRESH_MS);
  return card;
}

// 담기 시트: 조각마다 체크(기본 체크) + 과목 선택(기본 = 지금 고른 과목) → 확인 → 오늘 공부 초안에 세션 추가(연산 0).
function openClaim(ctx,h,plan){
  if(!plan?.pieces.length)return;
  const {el,add,button,hint,select}=h,body=el('div',null,'life-sheet-body focus-claim-sheet'),checks=[];
  for(const p of plan.pieces){
    const box=el('input');box.type='checkbox';box.checked=true;box.setAttribute('aria-label',pieceText(p));
    checks.push([p,box]);add(body,add(el('label',null,'focus-piece'),box,el('span',pieceText(p))));
  }
  const subjects=ctx.subjects,pick=select(subjects.map(s=>[s.id,s.name]),subjects.some(s=>s.id===ctx.subjectId)?ctx.subjectId:subjects[0].id);
  pick.setAttribute('aria-label','과목');
  add(body,add(el('label','과목'),pick),hint('담으면 오늘 공부 기록 임시 입력에 들어가요(이 기기에만) · "오늘 쌓기"를 누르면 함께 쌓입니다.'),hint(FOCUS_TEXT.otherDevice));
  let dlg=null;
  add(body,add(el('div',null,'buttons'),button('담기',()=>{
    const chosen=checks.filter(([,b])=>b.checked).map(([p])=>p);if(!chosen.length)return;
    const rows=claimRows(chosen,{subjectId:pick.value,uid:ctx.uid});
    dlg?.close();void ctx.claim(rows);
  },'primary')));
  dlg=ctx.kit.sheet('PC 측정 공부 담기',body);
}

// 분류 도우미: 분류 안 된 상위 앱·사이트 10개와 분. 단추를 눌렀을 때만 받아 보여 주고 저장하지 않는다. 한 번 눌러 규칙에 더할 수 있다.
function openHelper(ctx,h,done){
  const {el,add,button,hint}=h,body=el('div',null,'life-sheet-body focus-helper');
  add(body,hint(FOCUS_TEXT.loading));
  const dlg=ctx.kit.sheet('분류 도우미',body);
  void Promise.resolve().then(()=>ctx.request(focusBody(ctx.storage,String(ctx.now()),true))).then(r=>{
    const list=Array.isArray(r?.helper)?r.helper:[];
    body.replaceChildren(hint('오늘 분류되지 않은 상위 '+list.length+'개 · 이 목록은 저장하지 않아요.'));
    if(!list.length)add(body,hint('분류되지 않은 앱·사이트가 없어요.'));
    for(const item of list){
      const row=add(el('div',null,'native-row focus-helper-row'),el('span',item.name+' · '+(item.kind==='host'?'사이트':'앱')+' · '+hmText(item.min)));
      for(const [cls,label] of [['STUDY','공부로'],['DISTRACT','딴짓으로']])add(row,button(label,()=>{
        const rules=loadRules(ctx.storage),next=[...rules,{kind:item.kind,value:cleanRuleValue(item.kind,item.name),cls}];
        try{saveRules(ctx.storage,next);row.replaceChildren(el('span',item.name+' → '+(cls==='STUDY'?'공부':'딴짓'),'muted small'));}
        catch{add(row,el('span','더하지 못했어요(이미 있거나 글자가 맞지 않음)','muted small'));}
      }));
      add(body,row);
    }
    add(body,button('닫고 다시 계산',()=>{dlg?.close?.();done();},'primary'));
  },e=>{body.replaceChildren(el('p',focusErrorText(codeOf(e)),'notice error'));});
}

// 규칙 편집: 사본을 고치고 "저장"을 눌러야 이 기기에 남는다. 기본값으로 되돌리기 가능.
const KIND_TEXT=Object.freeze({app:'앱',host:'사이트',browser:'브라우저'}),CLASS_TEXT=Object.freeze({STUDY:'공부',DISTRACT:'딴짓'});
function openRules(ctx,h,done){
  const {el,add,button,hint,select}=h,body=el('div',null,'life-sheet-body focus-rules');
  let work=loadRules(ctx.storage).map(r=>({...r})),dlg=null;
  const errLine=el('p',null,'notice error');errLine.hidden=true;
  const draw=()=>{
    body.replaceChildren(hint('앱은 실행 파일 이름(예: Hwp.exe), 사이트는 도메인(예: ebsi.co.kr, 하위 도메인 포함)입니다. 규칙에 없으면 기타입니다. 브라우저 앱 시간은 사이트로 나눕니다. (이 기기 설정, 최대 '+MAX_RULES+'개)'));
    const list=el('div',null,'focus-rule-list');
    work.forEach((r,i)=>add(list,add(el('div',null,'native-row focus-rule-row'),el('span',KIND_TEXT[r.kind]+' · '+r.value+(r.cls?' · '+CLASS_TEXT[r.cls]:'')),button('지우기 · '+r.value,()=>{work.splice(i,1);draw();}))));
    const kind=select(RULE_KINDS.map(k=>[k,KIND_TEXT[k]]),'host'),value=el('input'),cls=select(RULE_CLASSES.map(c=>[c,CLASS_TEXT[c]]),'STUDY');
    value.type='text';value.setAttribute('maxlength',String(MAX_RULE_VALUE));value.setAttribute('aria-label','앱 이름 또는 사이트 도메인');kind.setAttribute('aria-label','규칙 종류');cls.setAttribute('aria-label','분류');
    const addBtn=button('추가',()=>{
      const k=kind.value,v=cleanRuleValue(k,value.value),r=k==='browser'?{kind:k,value:v}:{kind:k,value:v,cls:cls.value};
      if(!rulesOK([...work,r])){errLine.textContent='규칙을 더하지 못했어요 · 글자(앱: 영문·숫자·. _ - 공백, 사이트: 소문자 도메인), 중복, 개수를 확인하세요.';errLine.hidden=false;return;}
      work.push(r);errLine.hidden=true;draw();
    });
    add(body,list,add(el('div',null,'native-row focus-rule-add'),kind,value,cls,addBtn),errLine,
      add(el('div',null,'buttons'),button('저장',()=>{try{saveRules(ctx.storage,work);dlg?.close?.();done();}catch{errLine.textContent=focusErrorText('FOCUS_RULES_INVALID');errLine.hidden=false;}},'primary'),
        button('기본값으로 되돌리기',()=>{work=DEFAULT_FOCUS_RULES.map(r=>({...r}));draw();})));
  };
  draw();
  dlg=ctx.kit.sheet('분류 규칙 편집',body);
}

// 설정: PC 앱에서만 보인다. 스위치(기본 끔)와 인강 소리 규칙(기본 켬). ctx: {h:{el,add},kit:{toggle},surface,storage,onSwitch}
export function renderFocusSettings(root,ctx){
  if(ctx.surface!=='APP_SHELL')return null;
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel native-settings'),h.el('h2','PC 집중 측정 (ActivityWatch)','panel-title'));
  h.add(sec,h.el('p','이 PC의 ActivityWatch에서 오늘 앱 이름·사이트 도메인만 읽어 공부·딴짓·기타 분으로 나눠 오늘 화면에 보여 줍니다. 창 제목과 주소 경로는 읽자마자 버리고, 기록·서버·다른 기기로 보내지 않습니다. 기록에 들어가는 것은 "확인하고 담기"를 누른 공부 세션(과목·분·끝 시각)뿐입니다. (이 기기 설정)','muted'));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('PC 집중 측정 켜기',focusEnabled(ctx.storage),v=>{setFocusEnabled(ctx.storage,v);ctx.onSwitch?.();})));
  h.add(sec,h.add(h.el('div',null,'native-row'),kit.toggle('인강 소리 규칙 · 공부 사이트 탭이 소리를 내면 자리 비움이어도 공부로 셈',audibleOn(ctx.storage),v=>{setAudibleOn(ctx.storage,v);})));
  h.add(root,sec);return sec;
}
