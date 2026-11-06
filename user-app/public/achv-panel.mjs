// 탑 탭 "업적·칭호" 패널, 달성 알림, 전체 목록 시트, 오늘 퀘스트 시트, 칭호 고르기·표시 (Q1A 자리, Q1B 화면, Q1C 칭호, 설계 Q1D §8).
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style 없음). 앱이 혼자 기록을 쓰지 않는다: 내 퀘스트 저장만 소유자가 누를 때 한다. 이 기기 저장소에는 기기 장부(업적 id와 날짜)와 고른 칭호 id만 적는다.
// life-tower는 이 파일을 불러오지 않는다: 앱이 ctx.achvPanel·ctx.achvMoment·ctx.questSheet·ctx.achvTitle로 넘겨 탑 모듈은 그대로 둔다.
import {TITLES,achievements,titleOf,unlockedTitles,recentDone,nearDone,shownName,settleSeen,parseSeen,ACHV_SEEN_KEY,MONEY_OFF_TEXT,GROUP_TEXT} from './life-achv.mjs';
import {todayQuestLine,myQuestOf,myQuestRows,saveMyQuest,DEFS_SEALED_TEXT} from './life-quest.mjs';
import {MY_QUEST_ID} from './life-achieve.mjs';
import {HABIT_AREAS,MAX_NAME,weekCount} from './life-model.mjs';

const TIER_TEXT=Object.freeze({GOLD:'금',SILVER:'은',BRONZE:'동',HIDDEN:'숨김'});
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'});
const QUEST_STATE=Object.freeze({done:'완료',pending:'쌓으면 완료',todo:'할 일'});
const QUEST_MARK=Object.freeze({done:'✓',pending:'◐',todo:'○'});
const QUEST_ERROR=Object.freeze({INVALID_LIFE_TEXT:'이름은 1~'+MAX_NAME+'자로 넣어 주세요.',INVALID_HABIT_TARGET:'한 주 횟수는 1~99로 넣어 주세요.',INVALID_HABIT_DEF:'내 퀘스트 값이 올바르지 않아요.',APP_ENTITY_LIMIT:'습관 개수 한도에 닿았어요.',MD_NOT_WRITE_READY:'지금은 저장할 수 없어요 · 입력은 그대로 있어요.'});
const questErrorText=code=>QUEST_ERROR[code]??'저장하지 못했어요 · 입력은 그대로 있어요.';
const shortDate=d=>d.slice(5);
const number=n=>n.toLocaleString('en-US');
const maker=doc=>{
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  return {el,add,button};
};

// 장부 읽기·쓰기. 저장소가 막혀 있으면 이번 실행 동안만(st에 보관).
// HUNT36 H36-Q1: 저장이 실패하면 읽기가 옛 장부를 돌려줄 수 있다. 메모리 장부를 함께 보고 합쳐서, 이미 알린 달성을 다시 알리지 않는다.
function readSeen(storage,st){
  let stored=null;
  try{const raw=storage?.getItem(ACHV_SEEN_KEY);if(raw!==null&&raw!==undefined)stored=parseSeen(raw);}catch{/* 이번 실행 동안만 */}
  const mem=st.seenMemory??null;
  return stored&&mem?{...stored,...mem}:stored??mem;
}
function writeSeen(storage,st,next){
  st.seenMemory=next;
  try{storage?.setItem(ACHV_SEEN_KEY,JSON.stringify(next));}catch{/* 이번 실행 동안만 */}
}
// 새 달성을 장부에 넣고 알림을 돌려준다: {note(문구, 없으면 null),count(새 달성 수),quiet(첫 실행처럼 모션 없이 보일 문구면 참)}. 같은 달성은 다시 알리지 않는다.
export function settleAchv(list,today,storage,st){
  const seen=readSeen(storage,st),r=settleSeen(list,seen,today);
  if(seen===null||r.fresh.length||r.quiet)writeSeen(storage,st,r.next);
  if(r.firstRun)return {note:r.quiet?'지금까지의 기록으로 업적 '+r.quiet+'개 달성':null,count:0,quiet:true};
  const count=r.fresh.length;
  return {note:count===1?'새 업적 · '+r.fresh[0].name:count>1?'새 업적 '+count+'개':null,count,quiet:false};
}
export const syncSeen=(list,today,storage,st)=>settleAchv(list,today,storage,st).note;

// 업적 계산은 같은 입력이면 기억 1칸을 쓴다(오늘 화면은 입력 한 번에도 다시 그린다).
let memo=null;
function viewOf(ach,life,money){
  if(memo?.ach!==ach||memo.life!==life||memo.money!==money)memo={ach,life,money,view:achievements(ach,{life,money})};
  return memo.view;
}
// 알림 줄: 첫 실행은 움직임 없이 한 줄만, 새 달성은 금 띠 모션(CSS 클래스만, 움직임 줄이기면 CSS가 끈다).
const noteLine=({el},s)=>el('p',s.note,'achv-note achv-moment'+(s.quiet?' quiet':''));
// 달성 순간: 쌓기가 성공해 다시 읽은 뒤 또는 앱을 처음 열 때 오늘 화면이 그려지며 부른다. 값은 쌓은 기록 기준이다(쌓기 전 예상은 넘기지 않는다).
// args = {doc,ach,today,life,money,st,storage,toast}. 돌려주는 값 = 넣은 줄(없으면 null). PC 토스트는 새 달성이 있을 때만 건수로 보낸다.
export function renderAchvMoment(root,{doc,ach,today,life=null,money=null,st={},storage=null,toast=null}){
  const s=settleAchv(viewOf(ach,life,money).list,today,storage,st);
  st.achvNote=s.note;
  if(s.count)void toast?.send(s.count);
  if(!s.note)return null;
  const n=noteLine(maker(doc),s);n.setAttribute('role','status');root.append(n);
  return n;
}

function monthLine(ach){
  const m=ach.months.at(-1);if(!m)return null;
  if(m.kind==='BUDGET')return '이달 · '+m.label+(m.value===null?'':' · 사용 '+m.value+'%');
  return '이달의 벽돌 · '+m.value+' / '+m.target+m.unit+(m.done?' · 완료':'');
}
function bossLine(ach){
  const b=ach.bosses.find(x=>x.dDay>=0&&!x.done)??null;if(!b)return null;
  const head='다음 보스 · '+b.name+' '+(b.dDay===0?'D-DAY':'D-'+b.dDay);
  return b.state==='PREP'?head+' · 준비 벽돌 '+b.prep.value+'장 · 보석 '+b.prep.gems:head;
}
const barOf=({el},kit,value,target,aria)=>kit?.bar?.(value,target,aria)??(()=>{const n=el('progress');n.max=target>0?target:1;n.value=Math.min(value,n.max);n.setAttribute('aria-label',aria);return n;})();
const sheetOf=args=>args.sheet??args.kit?.sheet??null;

// ---------- 전체 목록 시트 (설계 §8.2): 묶음별 표. 숨김은 달성 전 이름·진행을 보이지 않고 ???와 개수만 ----------
const rowState=r=>r.done?'완료 · '+r.doneDate:r.phase!==1?'다음 단계에서 열려요':r.off?MONEY_OFF_TEXT:r.hidden?'':number(r.value)+' / '+number(r.target);
export function achvListBody(doc,view){
  const h=maker(doc),{el,add}=h,body=el('div',null,'achv-sheet');
  add(body,el('p',view.shownDone+' / '+view.shownTotal+' · 숨김 '+view.hiddenDone+' / '+view.hiddenTotal,'muted small'));
  for(const [group,text] of Object.entries(GROUP_TEXT)){
    const rows=view.list.filter(r=>r.group===group);if(!rows.length)continue;
    const list=el('ul',null,'achv-group-list');
    for(const r of rows){
      const state=rowState(r);
      add(list,add(el('li',null,'achv-item'+(r.done?' done':'')),el('span',shownName(r),'achv-item-name'),state?el('span',state,'achv-item-state muted small'):null));
    }
    add(body,add(el('section',null,'achv-group'),el('h3',text+' '+rows.filter(r=>r.done).length+' / '+rows.filter(r=>r.phase===1).length),list));   // 2단계는 분모에 넣지 않는다(지금 달성할 수 없다)
  }
  return body;
}
export function openAchvSheet(args){
  const open=sheetOf(args);if(!open)return null;
  return open('업적 전체',achvListBody(args.doc,viewOf(args.ach,args.life??null,args.money??null)));
}

// ---------- 오늘 퀘스트 시트 (설계 §8.1): 일간·이번 주·이달·다음 보스·내 퀘스트 1칸 ----------
function questRow(h,kit,{label,value,target,unit,state,xp}){
  const {el,add}=h,mark=QUEST_MARK[state]+' ';
  return add(el('div',null,'quest-row '+state),add(el('div',null,'lb-xp-head'),el('span',mark+label),el('strong',value===null?QUEST_STATE[state]:value+' / '+target+unit)),
    value===null?null:barOf(h,kit,value,target,label+' '+value+' / '+target),xp?el('span','+'+xp+' XP · '+QUEST_STATE[state],'muted small'):el('span',QUEST_STATE[state],'muted small'));
}
// 입력 칸. 저장을 누르기 전에는 아무것도 쓰지 않는다. onSave(spec)가 저장을 맡고 실패하면 칸의 값을 그대로 둔다.
function myQuestForm(h,kit,old,onSave){
  const {el,add,button}=h,err=el('p',null,'notice error quest-error'),note=el('p',DEFS_SEALED_TEXT,'notice quest-note');err.hidden=true;note.hidden=true;
  const name=el('input');name.type='text';name.value=old?.name??'';name.setAttribute('maxlength',String(MAX_NAME));name.setAttribute('aria-label','내 퀘스트 이름');name.setAttribute('placeholder','예: 영단어 복습');
  const count=el('input');count.type='text';count.value=String(old?.target.count??3);count.setAttribute('inputmode','numeric');count.setAttribute('aria-label','한 주 횟수');
  const area=el('select');for(const a of HABIT_AREAS){const o=el('option',AREA_TEXT[a]);o.value=a;area.append(o);}area.value=old?.area??'HEAD';area.setAttribute('aria-label','영역');
  let hidden=Boolean(old?.hidden);
  const form=add(el('div',null,'quest-form'),add(el('label','이름 ('+MAX_NAME+'자까지)'),name),add(el('label','한 주 횟수'),count),add(el('label','영역'),area));
  if(old&&kit?.toggle)add(form,kit.toggle('오늘 화면에서 숨김',hidden,v=>{hidden=v;}));
  const show=code=>{err.textContent=questErrorText(code);err.hidden=false;};
  const read=()=>({name:name.value,count:/^\d+$/.test(count.value.trim())?Number(count.value.trim()):NaN,area:area.value,hidden});
  add(form,err,note,add(el('div',null,'buttons'),button('저장',()=>{err.hidden=true;note.hidden=true;void onSave(read(),show,()=>{note.hidden=false;});},'primary')));
  return {form,name,count,area,err,note};
}
function myQuestSection(h,args,after){
  const {el,add,button}=h,{life=null,today,kit=null,ctx=null}=args,old=myQuestOf(life),box=el('section',null,'quest-mine');
  const memo={};
  const onSave=(spec,show,sealedNote)=>{
    try{myQuestRows(life,spec);}catch(e){show(e?.code);return;}   // 입력이 틀리면 쓰기 시도 없이 칸에 알린다
    return ctx.perform(async()=>{
      try{await saveMyQuest(ctx,spec,memo);}catch(e){show(e?.code);return;}
      if(memo.sealed){sealedNote();await ctx.rerender();return;}   // FIX38: 임시 저장은 성공이 아니다. 칸을 그대로 두고 알린다
      after();await ctx.rerender();
    });
  };
  const draw=editing=>{
    box.replaceChildren(el('h3','내 퀘스트'));
    if(editing){add(box,myQuestForm(h,kit,old,onSave).form);return;}
    if(old){
      const value=weekCount(MY_QUEST_ID,today,life?.days??[],null);
      add(box,questRow(h,kit,{label:old.name,value,target:old.target.count,unit:'회',state:value>=old.target.count?'done':'todo',xp:0}));
      if(old.hidden)add(box,el('p','오늘 화면에서 숨긴 상태예요','muted small'));
    }else add(box,el('p','한 주에 몇 번 할지 직접 정하는 칸이에요 · 오늘 습관 칸의 +1로 셉니다','muted small'));
    add(box,el('p','주간 목표를 채우면 +15 XP · 보너스 ✦와 업적은 붙지 않아요','muted small'));
    if(ctx)add(box,button(old?'고치기':'만들기',()=>draw(true)));
  };
  draw(false);
  return box;
}
export function questSheetBody(args,after=()=>{}){
  const {doc,ach,preview=null,kit=null}=args,h=maker(doc),{el,add}=h,body=el('div',null,'quest-sheet');
  const line=todayQuestLine(ach,preview);
  add(body,el('h3','오늘 '+line.done+' / '+line.total));
  const daily=new Map((ach.todayDay.daily??[]).map(q=>[q.id,q]));
  for(const q of line.items){const d=daily.get(q.id);add(body,questRow(h,kit,{label:q.label,value:d.target>1||d.unit==='장'?d.value:null,target:d.target,unit:d.unit,state:q.state,xp:d.xp}));}
  if(!line.total)add(body,el('p','오늘은 쉬는 날이에요','muted small'));
  add(body,el('h3','이번 주'));
  for(const q of ach.currentWeek.quests)add(body,questRow(h,kit,{label:q.label,value:q.value,target:q.target,unit:q.unit,state:q.done?'done':'todo',xp:q.xp}));
  const month=monthLine(ach),boss=bossLine(ach);
  if(month)add(body,el('h3','이달'),el('p',month,'quest-line'));
  if(boss)add(body,el('h3','다음 보스'),el('p',boss,'quest-line'));
  add(body,myQuestSection(h,args,after));
  return body;
}
export function openQuestSheet(args){
  const open=sheetOf(args);if(!open)return null;
  let dlg=null;
  dlg=open('오늘 퀘스트',questSheetBody(args,()=>dlg?.close?.()));
  return dlg;
}

// ---------- 칭호 고르기·표시 (Q1C, 설계 §5·§8.2). 표시만 한다: XP·보너스·기록에 닿지 않는다(V4 결정 Q1D 1) ----------
// 기기 설정 lb.title.v1 = 칭호 id만(기기마다 다를 수 있다). 저장소가 막혀 있으면 이번 실행 동안만(st에 보관). 메모리를 먼저 봐서 저장 실패 뒤 옛 값으로 돌아가지 않는다.
export const TITLE_KEY='lb.title.v1';
const PICKABLE=TITLES.filter(x=>x.phase===1),PICKABLE_IDS=new Set(PICKABLE.map(x=>x.id));
export function readTitleChoice(storage,st={}){
  if(Object.hasOwn(st,'titleMemory'))return st.titleMemory;
  try{const raw=storage?.getItem(TITLE_KEY);return PICKABLE_IDS.has(raw)?raw:null;}catch{return null;}
}
export function saveTitleChoice(storage,st,id){
  st.titleMemory=id;
  try{
    if(!storage)return;
    if(id)storage.setItem(TITLE_KEY,id);else storage.removeItem(TITLE_KEY);
    delete st.titleMemory;
  }catch{/* 이번 실행 동안만 */}
}
export const currentTitle=({ach,life=null,money=null,storage=null,st={}})=>titleOf(viewOf(ach,life,money).list,readTitleChoice(storage,st));
const titleChip=({el},t)=>{const n=el('span',t.name,'title-chip tier-'+t.tier.toLowerCase());n.setAttribute('aria-label','칭호 '+t.name+' ('+TIER_TEXT[t.tier]+')');return n;};
// 오늘 머리·탑 머리·상태 화면이 부른다(앱이 ctx.achvTitle로 넘긴다). 돌려주는 값 = {node,tier}, 칭호가 없으면 null. tier는 탑의 깃발 색에 쓴다.
export function titleBadge(args){
  const t=currentTitle(args);
  return t?{node:titleChip(maker(args.doc),t),tier:t.tier}:null;
}
// 시트: 자동 1줄 + 풀린 칭호(표 순서) + 잠긴 칭호(접어 둠, 숨김은 이름 없이 ???). 누르면 이 기기에만 저장하고 after()를 부른다. 저장 버튼 없이 바로 적용되며 기록 쓰기는 0이다.
export function titleSheetBody(args,after=()=>{}){
  const {doc,ach,life=null,money=null,storage=null,st={}}=args,h=maker(doc),{el,add,button}=h,body=el('div',null,'title-sheet');
  const {list}=viewOf(ach,life,money),chosen=readTitleChoice(storage,st),shown=titleOf(list,chosen),open=unlockedTitles(list),auto=titleOf(list);
  const pickRow=(id,on,...kids)=>{
    const b=add(button(null,()=>{saveTitleChoice(storage,st,id);after();},'secondary title-pick'+(on?' on':'')),...kids);
    b.dataset.navOnly='1';b.setAttribute('aria-pressed',on?'true':'false');   // 기록이 아니라 기기 설정이라 읽기 전용에서도 고른다
    return b;
  };
  add(body,el('p','풀린 칭호 '+open.length+' / '+PICKABLE.length+' · 표시만 바뀌고 XP·벽돌은 그대로예요','muted small'));
  if(chosen&&shown?.auto)add(body,el('p','고른 칭호가 지금은 풀려 있지 않아 자동으로 보여요','muted small'));
  add(body,pickRow(null,!shown||shown.auto,el('strong','자동'),el('span','가장 높은 등급 중 최근'+(auto?' · 지금 '+auto.name:''),'muted small')));
  for(const t of open)add(body,pickRow(t.id,shown?.id===t.id&&!shown.auto,titleChip(h,t),el('span',TIER_TEXT[t.tier]+' · '+t.doneDate,'muted small')));
  const byId=new Map(list.map(r=>[r.id,r])),locked=PICKABLE.filter(t=>!byId.get(t.achv)?.done);
  if(locked.length){
    const rows=el('ul',null,'achv-group-list');
    for(const t of locked){
      const r=byId.get(t.achv),secret=r?.hidden;
      add(rows,add(el('li',null,'achv-item'),el('span',secret?shownName(r):t.name,'achv-item-name'),secret?null:el('span','업적 · '+r.name,'achv-item-state muted small')));
    }
    add(body,add(el('details',null,'title-locked'),el('summary','잠긴 칭호 '+locked.length+'개'),rows));
  }
  return body;
}
export function openTitleSheet(args){
  const open=sheetOf(args);if(!open)return null;
  let dlg=null;
  dlg=open('칭호 고르기',titleSheetBody(args,()=>{dlg?.close?.();void args.ctx?.rerender?.();}));
  return dlg;
}

// args = {doc,ach,today,life,money,st,kit,storage,sheet,ctx,toast}. st = 탑 상태(장부 예비 칸과 알림 문구를 둔다).
export function renderAchvPanel(root,args){
  const {doc,ach,today,life=null,money=null,st={},kit=null,storage=null,toast=null}=args;
  const h=maker(doc),{el,add,button}=h;
  const view=viewOf(ach,life,money),title=titleOf(view.list,readTitleChoice(storage,st));
  const s=settleAchv(view.list,today,storage,st);
  st.achvNote=s.note;   // HUNT36 H36-Q2: 그릴 때마다 덮는다(새 달성이 없으면 지워진다)
  if(s.count)void toast?.send(s.count);
  const box=el('div',null,'achv-panel');box.id='achv-panel';
  add(box,add(el('div',null,'achv-head'),el('h3','업적·칭호'),el('span',view.shownDone+' / '+view.shownTotal+' · 숨김 '+view.hiddenDone+' / '+view.hiddenTotal,'muted small')));
  if(s.note)add(box,noteLine(h,s));
  add(box,el('p',title?'칭호 · '+title.name+' ('+TIER_TEXT[title.tier]+')':'아직 칭호가 없어요 · 첫 벽돌을 쌓으면 열려요','achv-title'));
  const bricks=ach.weeks.reduce((n,w)=>n+w.bricks,0);
  add(box,el('p','벽돌 '+number(bricks)+'장 · 보너스 ✦'+number(ach.bonusTotal),'achv-bricks'));
  const recent=recentDone(view.list,2);
  if(recent.length){const row=add(el('div',null,'achv-row'),el('span','최근','muted small'));for(const r of recent)add(row,el('span','✦ '+shownName(r)+' · '+shortDate(r.doneDate),'achv-chip'));add(box,row);}
  for(const r of nearDone(view.list,2)){
    const aria=r.name+' '+r.value+' / '+r.target;
    add(box,add(el('div',null,'achv-near'),add(el('div',null,'lb-xp-head'),el('span',r.name),el('strong',r.value+' / '+r.target)),barOf(h,kit,r.value,r.target,aria)));
  }
  for(const line of [monthLine(ach),bossLine(ach)])if(line)add(box,el('p',line,'muted small achv-line'));
  if(money===null)add(box,el('p','돈 업적 · '+MONEY_OFF_TEXT,'muted small achv-line'));
  if(sheetOf(args)){
    const go=[button('전체 보기',()=>openAchvSheet(args)),button('퀘스트 보기',()=>openQuestSheet(args))];
    if(title)go.unshift(button('칭호 고르기',()=>openTitleSheet(args)));   // Q1C: 풀린 칭호가 있을 때만
    for(const b of go)b.dataset.navOnly='1';   // 읽기 전용에서도 보기는 된다
    add(box,add(el('div',null,'achv-actions'),...go));
  }
  if(toast&&kit?.toggle)add(box,kit.toggle('새 업적 Windows 알림 (이 기기)',toast.on(),v=>{toast.set(v);}));
  root.append(box);
  return box;
}
