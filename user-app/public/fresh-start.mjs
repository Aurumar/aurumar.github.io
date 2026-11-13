// V7D1 새 시작 기준선 (소유자 결정 2026-11-11, 통제탑 2026-11-12, 설계 V7D 안 B). 저장하지 않는 순수 필터다.
// 기준 날짜(FRESH_START) 전의 날짜 기록을 화면·집계 입력에서만 뺀다. 금고에는 그대로 남고(연산 0), "새 시작 전 기록"에서 읽기만 한다.
// FRESH_START=null이면 모든 함수가 아무것도 빼지 않는다(받은 값을 그대로 돌려준다 = 지금과 같은 결과).
// 가계부(FIN_*)·옛 MD03 정의·일정·재정 스냅샷·설정류는 분류표에서 KEEP이라 어떤 함수도 건드리지 않는다(fin은 같은 객체 그대로).
export const FRESH_START='2026-11-12';

// 종류별 분류표. DROP = 기준 날짜 전이면 빠짐, KEEP = 날짜와 상관없이 남김. 표에 없는 종류는 KEEP(모르는 것은 숨기지 않는다).
export const FRESH_KIND=Object.freeze({
  LIFE_DAY:'DROP',PLAN_DAY:'DROP',STUDY_DAY:'DROP',HLT_DAY:'DROP',DIARY_DAY:'DROP',WEEK_REVIEW:'DROP',PLAN_GOAL:'DROP',EXAM_RESULT:'DROP',
  RESULT:'DROP',RESTART:'DROP',MEASUREMENT:'DROP',   // 옛 MD03 행동 결과(LB_USER_ACTION_RESULT_1·RESTART_POINT_1·ACTION_MEASUREMENT_2)
  HABIT_DEF:'KEEP',SUBJECT_DEF:'KEEP',EXAM_SCHEDULE:'KEEP',HLT_PROFILE:'KEEP',GAME_PROFILE:'KEEP',
  ACTION:'KEEP',DOMAIN:'KEEP',PLAN:'KEEP',EVENT:'KEEP',PREFERENCES:'KEEP',FINANCE:'KEEP',
  FIN_ACCOUNT:'KEEP',FIN_TXN:'KEEP',FIN_BATCH:'KEEP',FIN_RULE:'KEEP',FIN_BUDGET:'KEEP',FIN_RECURRING:'KEEP',
});
// 날짜 키: 하루 기록 = 엔티티 id(그날), 주 기록(월요일 id) = 그 주 일요일(기준 날짜가 든 주는 남는다 = 이번 주 목표·리뷰를 계속 쓴다),
// 모의고사 결과 = 본 날(takenOn), 옛 행동 결과 = 그 결과의 날짜(localDate).
export const FRESH_DATE_RULE=Object.freeze({LIFE_DAY:'ID',PLAN_DAY:'ID',STUDY_DAY:'ID',HLT_DAY:'ID',DIARY_DAY:'ID',WEEK_REVIEW:'WEEK_END',PLAN_GOAL:'WEEK_END',EXAM_RESULT:'TAKEN_ON',RESULT:'LOCAL_DATE',RESTART:'LOCAL_DATE',MEASUREMENT:'LOCAL_DATE'});
export const FRESH_KIND_TEXT=Object.freeze({LIFE_DAY:'오늘 카드',PLAN_DAY:'하루 계획',STUDY_DAY:'공부 기록',HLT_DAY:'건강 기록',DIARY_DAY:'일기',WEEK_REVIEW:'주간 리뷰',PLAN_GOAL:'과목 주간 목표',EXAM_RESULT:'모의고사 결과',RESULT:'기본 행동 결과',RESTART:'이어갈 지점',MEASUREMENT:'실제로 한 양'});
export const FRESH_READ_ONLY='FRESH_START_READ_ONLY';
export const FRESH_TEXT=Object.freeze({
  readOnly:'새 시작 전 기록은 읽기 전용입니다 · 기준 날짜 전 날짜는 고치거나 쌓지 않아요(금고에는 그대로 남아 있어요).',
  badge:'새 시작 전 기록 · 읽기 전용',
  title:'기록 관리',
  open:'새 시작 전 기록 보기',
  draft:'새 시작 전 임시 입력',   // 화면 낱말 규칙(FIX45: "초안" 대신 "임시 입력")
  lock:'새 시작 전 기록이라 읽기만 할 수 있어',   // V7D2: 날짜 이동으로 기준 전 날짜를 고른 화면의 한 줄
});
// V7D2 (V7D1 UNKNOWN): 날짜 이동 화면(계획 주·월·일, 일기, 건강·공부)이 기준 전 날짜를 보이면 그 화면의 입력칸·단추를 읽기 전용으로 바꾸고 한 줄을 보인다.
// 지금까지는 저장 때 freshGuard가 거절만 했다. 날짜 이동 단추처럼 남길 노드는 dataset.freshKeep='1'(그 아래 전부) 또는 dataset.navOnly='1'로 표시한다.
// 쓰기 0. 기준선이 없거나 기준 뒤 날짜면 아무것도 바꾸지 않고 false. note=false면 줄을 넣지 않는다(칸 하나만 잠글 때).
const LOCK_TAGS=new Set(['INPUT','TEXTAREA','SELECT','BUTTON']);
export function freshLockView(root,{date,start=FRESH_START,doc=globalThis.document,note=true}={}){
  if(!root||!dateBeforeFresh(date,start))return false;
  const walk=n=>{
    if(!n||n.dataset?.freshKeep==='1')return;
    if(LOCK_TAGS.has(String(n.tagName??'').toUpperCase())&&n.dataset?.navOnly!=='1'&&!n.disabled){n.disabled=true;if(n.dataset)n.dataset.freshLock='1';n.setAttribute?.('aria-disabled','true');}
    for(const c of [...(n.children??[])])walk(c);
  };
  walk(root);
  root.classList?.add('fresh-locked');
  if(note&&doc?.createElement){const p=doc.createElement('p');p.textContent=FRESH_TEXT.lock;p.className='notice fresh-lock-note';if(typeof root.prepend==='function')root.prepend(p);else root.append(p);}
  return true;
}

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
export const dateKeyOK=d=>typeof d==='string'&&DATE_RE.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const shiftDay=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
// ISO 시각 → KST 날짜(앱 하루 카드의 날짜 키와 같은 규칙). 2026-11-11T14:59Z = 11-11 23:59 KST, 2026-11-11T15:00Z = 11-12 00:00 KST.
export function kstDateOf(iso){const t=Date.parse(iso);return Number.isFinite(t)?new Date(t+9*3600000).toISOString().slice(0,10):null;}

// 기록의 날짜 키(DROP 종류만). 모르면 null(빼지 않는다).
export function recordDate({type,id=null,data=null,localDate=null}={}){
  const rule=FRESH_DATE_RULE[type];
  const d=rule==='ID'?id:rule==='WEEK_END'?(dateKeyOK(id)?shiftDay(id,6):null):rule==='TAKEN_ON'?data?.takenOn??null:rule==='LOCAL_DATE'?localDate:null;
  return dateKeyOK(d)?d:null;
}
// record = {type, id?, data?, localDate?}. 참 = 화면·집계에서 뺀다.
export function isBeforeFreshStart(record,start=FRESH_START){
  if(!start||FRESH_KIND[record?.type]!=='DROP')return false;
  const d=recordDate(record);return d!==null&&d<start;
}
// 날짜 하나가 기준 전인지(날짜 이동 화면·성취표 칸용).
export const dateBeforeFresh=(date,start=FRESH_START)=>Boolean(start)&&dateKeyOK(date)&&date<start;

// 이력 줄(/api/history changes, 최신이 앞) 중 투영 입력으로 남길 줄. 옛 행동 결과는 날짜로, 엔티티 줄은 저장값의 id·data로 본다.
const rowRecord=r=>({type:r?.type,id:r?.value?.entityId??null,data:r?.value?.data??null,localDate:r?.value?.localDate??r?.localDate??null});
export function freshRows(rows,start=FRESH_START){
  if(!start||!Array.isArray(rows))return rows;
  return rows.filter(r=>!isBeforeFreshStart(rowRecord(r),start));
}
// 이어갈 지점(RESTART_POINT_1)은 행동마다 지금 글 하나다. 마지막으로 적은 날이 기준 전이면 화면에서 비운다(쓰는 길은 그대로, heads도 그대로).
function staleRestart(rows,start){
  const seen=new Set(),stale=new Set();
  for(const r of Array.isArray(rows)?rows:[]){if(r?.type!=='RESTART'||typeof r.actionId!=='string'||seen.has(r.actionId))continue;seen.add(r.actionId);if(isBeforeFreshStart(rowRecord(r),start))stale.add(r.actionId);}
  return stale;
}
const blankRestart=(list,stale)=>Array.isArray(list)?list.map(a=>a&&stale.has(a.actionId)?{...a,restartPoint:''}:a):list;

function keep(list,type,start,key){return Array.isArray(list)?list.filter(x=>!isBeforeFreshStart({type,...key(x)},start)):list;}
export function freshLife(life,start=FRESH_START){
  if(!start||!life)return life;
  return {...life,
    days:keep(life.days,'LIFE_DAY',start,x=>({id:x.date})),
    plans:keep(life.plans,'PLAN_DAY',start,x=>({id:x.date})),
    goals:keep(life.goals,'PLAN_GOAL',start,x=>({id:x.monday})),
    results:keep(life.results,'EXAM_RESULT',start,x=>({data:x.data})),
    diaries:keep(life.diaries,'DIARY_DAY',start,x=>({id:x.date})),
    weekReviews:keep(life.weekReviews,'WEEK_REVIEW',start,x=>({id:x.monday}))};
}
export const freshStudy=(study,start=FRESH_START)=>!start||!study?study:{...study,days:keep(study.days,'STUDY_DAY',start,x=>({id:x.date}))};
export const freshHlt=(hlt,start=FRESH_START)=>!start||!hlt?hlt:{...hlt,days:keep(hlt.days,'HLT_DAY',start,x=>({id:x.date}))};

// 옛 진행 화면(whole.progress)을 기준 날짜 이후 행동 결과만으로 다시 센다. 규칙은 whole-life-projection progressProjection·measurementProjection과 같다
// (기록 칸마다 최신 줄 = 지금 값). 계획 중간 목표(PLAN, KEEP)는 그대로 둔다.
export function freshProgress(progress,rows,start=FRESH_START){
  if(!start||!progress||!Array.isArray(rows))return progress;
  const latest=new Map(),meas=new Map();
  for(const r of rows){
    if(r?.type==='RESULT'&&!latest.has(r.entityKey))latest.set(r.entityKey,r);
    if(r?.type==='MEASUREMENT'&&!meas.has(r.entityKey))meas.set(r.entityKey,r);
  }
  const results=[...latest.values()].filter(r=>!isBeforeFreshStart(rowRecord(r),start)),positive=results.filter(r=>['COMPLETE','PARTIAL'].includes(r.value.outcome));
  const counts={COMPLETE:0,PARTIAL:0,NOT_DONE:0};for(const r of results)if(Object.hasOwn(counts,r.value.outcome))counts[r.value.outcome]++;
  const domainActivity=(progress.domainActivity??[]).map(d=>({...d,recorded:results.filter(r=>r.domain===d.domain).length,positive:positive.filter(r=>r.domain===d.domain).length}));
  const trend=(progress.trend??[]).map(t=>{const r=results.filter(v=>v.value.localDate===t.date);return {date:t.date,recorded:r.length,complete:r.filter(v=>v.value.outcome==='COMPLETE').length,partial:r.filter(v=>v.value.outcome==='PARTIAL').length,notDone:r.filter(v=>v.value.outcome==='NOT_DONE').length};});
  const today=(progress.trend??[]).at(-1)?.date??null;
  const streaks=(progress.streaks??[]).map(s=>{
    if(!dateKeyOK(today))return {...s,days:0};
    const days=new Map(results.filter(r=>r.actionId===s.actionId).map(r=>[r.value.localDate,r.value.outcome]));
    let day=days.has(today)?today:shiftDay(today,-1),length=0;
    while(days.get(day)==='COMPLETE'&&length<10000){length++;day=shiftDay(day,-1);}
    return {...s,days:length};
  });
  const house={...progress.house,actionBlocks:positive.length,totalBlocks:positive.length+(progress.house?.milestoneBlocks??0)};
  return {...progress,measurement:freshMeasurement(progress.measurement,[...meas.values()].filter(r=>!isBeforeFreshStart(rowRecord(r),start))),
    actionAccumulation:counts,totalRecorded:results.length,positiveActionDays:positive.length,domainActivity,unassignedActivity:results.filter(r=>r.domain===null).length,trend,streaks,house};
}
function freshMeasurement(m,rows){
  if(!m)return m;
  const vals=rows.map(r=>r.value).filter(v=>v?.measurement),durations=vals.filter(v=>v.measurement.actualEffectiveDuration!==null),groups=new Map();
  for(const v of vals){const q=v.measurement.quantity;if(q===null||q===undefined)continue;const key=JSON.stringify([v.actionId,q.identity,q.unit]);const old=groups.get(key)??{actionId:v.actionId,identity:q.identity,unit:q.unit,scaled:0n,observations:0};const [a,b='']=String(q.value).split('.');old.scaled+=BigInt(a)*1000000n+BigInt((b+'000000').slice(0,6));old.observations++;groups.set(key,old);}
  return {...m,observations:vals.length,durationObservations:durations.length,totalEffectiveSeconds:durations.length?durations.reduce((n,v)=>n+v.measurement.actualEffectiveDuration.value,0):null,
    quantities:[...groups.values()].map(g=>{let value=String(g.scaled/1000000n)+'.'+String(g.scaled%1000000n).padStart(6,'0');value=value.replace(/0+$/,'').replace(/\.$/,'');const {scaled,...rest}=g;return {...rest,value};}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
}

// 앱이 /api/whole-life·/api/today·/api/history를 받은 뒤 한 번 부르는 투영 입력 필터(앱의 한 곳 takeRecords).
// 돌려주는 값: whole(화면·성취·탑·우주·퀘스트·위젯·내보내기가 읽는 사본), today(오늘 행동 카드, 이어갈 지점만 비움), rows(성취 엔진의 행동 결과 입력).
// 이력 화면·초안 병합이 쓰는 changes 원본은 부른 쪽이 그대로 둔다. start=null이면 받은 객체를 그대로 돌려준다.
export function freshView({whole=null,today=null,changes=null}={},start=FRESH_START){
  if(!start)return {whole,today,rows:changes};
  const rows=freshRows(changes,start),stale=staleRestart(changes,start);
  let w=whole;
  if(whole){
    const actions=blankRestart(whole.actions,stale);
    w={...whole,actions,life:freshLife(whole.life,start),study:freshStudy(whole.study,start),hlt:freshHlt(whole.hlt,start),
      progress:Array.isArray(changes)?freshProgress(whole.progress,changes,start):whole.progress};
    if(whole.home)w.home={...whole.home,priorityActions:blankRestart(whole.home.priorityActions,stale),
      restartPoints:Array.isArray(whole.home.restartPoints)?blankRestart(whole.home.restartPoints,stale).filter(a=>String(a.restartPoint??'').trim()):whole.home.restartPoints,
      recentActualActions:Array.isArray(whole.home.recentActualActions)?whole.home.recentActualActions.filter(r=>!isBeforeFreshStart(rowRecord(r),start)):whole.home.recentActualActions};
  }
  const t=today&&Array.isArray(today.actions)?{...today,actions:blankRestart(today.actions,stale)}:today;
  return {whole:w,today:t,rows};
}

// 쓰기 거절(앱 submit 한 곳): 기준 전 날짜의 하루·주 기록·옛 행동 결과를 쓰려 하면 코드, 아니면 null. 설정류·가계부는 언제나 null.
export function freshWriteBlock(path,body,start=FRESH_START){
  if(!start||!body||typeof body!=='object')return null;
  if(path==='/api/entity')return isBeforeFreshStart({type:body.entityType,id:body.entityId,data:body.data},start)?FRESH_READ_ONLY:null;
  if(path==='/api/action-record'||path==='/api/correction')return dateBeforeFresh(body.localDate,start)?FRESH_READ_ONLY:null;
  return null;
}
// 임시 저장(봉인) 초안 목록 줄(draft-list의 entity {type,id})이 기준 전 기록인지. id가 날짜가 아닌 종류(모의고사 결과)는 알 수 없어 거짓.
export const draftBeforeFresh=(d,start=FRESH_START)=>Boolean(d?.entity)&&isBeforeFreshStart({type:d.entity.type,id:d.entity.id},start);

// 업적 알림 장부 키: 기준선이 있으면 새 장부(옛 장부는 지우지 않고 그대로 둔다). 새 장부는 첫 실행처럼 지금 달성을 조용히 넣는다.
export const freshSeenKey=(base,start=FRESH_START)=>start?base+'@'+start:base;

// ---- "새 시작 전 기록" 목록(읽기 전용). 내용 글은 싣지 않고 날짜·종류·개수 요약만 ----
const len=a=>Array.isArray(a)?a.length:0;
const textLen=data=>{let n=0;for(const v of Object.values(data??{}))if(typeof v==='string')n+=[...v].length;return n;};
const SUMMARY={
  LIFE_DAY:d=>'습관 '+Object.keys(d?.habits??{}).length+'칸',
  PLAN_DAY:d=>'계획 '+len(d?.items)+'줄',
  STUDY_DAY:d=>'세션 '+len(d?.sessions)+' · 오답 '+len(d?.mistakes)+' · 복습 '+len(d?.reviews),
  HLT_DAY:d=>'항목 '+len(d?.items)+'개',
  DIARY_DAY:d=>textLen(d)+'자',
  WEEK_REVIEW:()=>'주간 리뷰 1건',
  PLAN_GOAL:d=>'목표 '+len(d?.goals)+'개',
  EXAM_RESULT:d=>'과목 '+len(d?.scores)+'개',
};
const OUTCOME_TEXT={COMPLETE:'완료',PARTIAL:'일부 완료',NOT_DONE:'하지 못함'};
// raw = 필터 전 whole-life 값(life·study·hlt), changes = 이력 줄 원본. 최신 날짜가 앞.
export function beforeFreshList({whole=null,changes=null}={},start=FRESH_START){
  if(!start||!whole)return [];
  const out=[],push=(type,date,summary)=>out.push({date,type,kind:FRESH_KIND_TEXT[type],summary});
  const life=whole.life??{},each=(list,type,key)=>{for(const x of Array.isArray(list)?list:[]){const r={type,...key(x)};if(isBeforeFreshStart(r,start))push(type,type==='PLAN_GOAL'||type==='WEEK_REVIEW'?r.id:recordDate(r),SUMMARY[type](x.data));}};
  each(life.days,'LIFE_DAY',x=>({id:x.date}));each(life.plans,'PLAN_DAY',x=>({id:x.date}));each(life.goals,'PLAN_GOAL',x=>({id:x.monday}));
  each(life.results,'EXAM_RESULT',x=>({data:x.data}));each(life.diaries,'DIARY_DAY',x=>({id:x.date}));each(life.weekReviews,'WEEK_REVIEW',x=>({id:x.monday}));
  each(whole.study?.days,'STUDY_DAY',x=>({id:x.date}));each(whole.hlt?.days,'HLT_DAY',x=>({id:x.date}));
  const seen=new Set();
  for(const r of Array.isArray(changes)?changes:[]){
    if(r?.type!=='RESULT'||seen.has(r.entityKey))continue;seen.add(r.entityKey);
    const rec=rowRecord(r);if(isBeforeFreshStart(rec,start))push('RESULT',rec.localDate,String(r.title??'')+' · '+(OUTCOME_TEXT[r.value?.outcome]??'-'));
  }
  return out.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:a.kind<b.kind?-1:a.kind>b.kind?1:0);
}
// 설정 → 기록 관리 칸. h = {el,add,button}(앱 DOM 도우미). open() = 목록 시트를 여는 앱 함수. 기준선이 없으면 null(칸을 그리지 않는다).
export function renderFreshManage(root,{h,start=FRESH_START,count=0,drafts=0,open}){
  if(!start)return null;
  const {el,add,button}=h,sec=add(el('section',null,'panel fresh-manage'),el('h2',FRESH_TEXT.title,'panel-title'));sec.id='fresh-manage';
  add(sec,el('p','새 시작 기준 날짜 '+start+' · 그 전의 하루·공부·건강·계획·일기·리뷰·모의고사·기본 행동 결과는 화면과 집계(탑·업적·XP·우주·위젯)에서 빠졌어요. 금고에는 그대로 남아 있어요. 가계부와 설정(과목·습관·시험 일정·건강 항목)은 그대로예요.','muted'));
  add(sec,el('p','새 시작 전 기록 '+count+'건'+(drafts?' · '+FRESH_TEXT.draft+' '+drafts+'건(쌓지 않고 이 기기에 그대로 둡니다)':''),'fresh-count'));
  const b=button(FRESH_TEXT.open,open,'secondary');b.dataset.navOnly='1';add(sec,b);
  add(root,sec);return sec;
}
// 목록 시트 본문(읽기 전용, 편집·쌓기 단추 없음). 최대 limit줄, 나머지는 개수만.
export function beforeFreshBody({h,list,start=FRESH_START,limit=300}){
  const {el,add}=h,body=el('div',null,'fresh-before');
  add(body,el('p',FRESH_TEXT.badge+' · 기준 날짜 '+start+' 전','fresh-badge'));
  if(!list.length){add(body,el('p','새 시작 전 기록이 없습니다.','muted'));return body;}
  const ul=add(el('ul',null,'fresh-list'),null);
  for(const r of list.slice(0,limit))add(ul,add(el('li',null,'fresh-row'),el('strong',r.date,'fresh-date'),el('span',r.kind,'fresh-kind'),el('span',r.summary,'fresh-summary')));
  add(body,ul);
  if(list.length>limit)add(body,el('p','외 '+(list.length-limit)+'건','muted small'));
  return body;
}
