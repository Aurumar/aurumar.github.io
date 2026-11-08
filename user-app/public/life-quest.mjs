// 퀘스트 묶음 (Q1A, 설계 Q1D §4). 판정은 XP와 함께 계산해야 해서 성취 엔진(life-achieve)이 하고, 이 모듈은 오늘 줄 요약과 내 퀘스트 1칸 저장 경로를 맡는다.
// 내 퀘스트는 새 기록 종류가 아니라 고정 id uq-1인 COUNT·주 단위 습관 하나다: 옛 빌드도 받고 오늘 격자의 +1을 그대로 쓴다. 보너스 벽돌·업적 없이 기존 습관 XP와 주간 목표 +15만 받는다.
import {MY_QUEST_ID,hasVisibleText} from './life-achieve.mjs';
import {collectRows,saveDefinitions} from './life-flow.mjs';
import {HABIT_AREAS,EMPTY_LIFE_VIEW,LIFE_LIMITS,MAX_NAME,MAX_GOAL_BRICKS,GAME_PROFILE_ID,lifeDefs,openRecordsDoor,recordsDoorState,requireRecordsDoor,shiftDay,validateLifeData} from './life-model.mjs';
import {rebaseRecord,stable} from './life-rebase.mjs';
import {maker,planErrorText,unknownOutcome,actualOf,PLAN_NOTICE_TEXT} from './life-plan.mjs';
export {DEFS_SEALED_TEXT} from './life-flow.mjs';

export const MY_QUEST_REASON='내 퀘스트 저장';
const questError=code=>Object.assign(new Error(code),{code});
// 보이는 글자가 하나도 없는 이름은 거절한다(H37-Q6, 판정은 life-achieve의 hasVisibleText 하나). 보이는 글자가 섞이면 통과한다(textContent로만 나간다).
// 보이는 글자가 섞여도 제어문자·글자 방향 문자·줄 구분 문자는 저장 전에 뺀다(FIX38, H37-Q6 남은 것). 이모지·한글 조합에 쓰는 ZWJ·ZWNJ(200C·200D)는 둔다.
const STRIP_FROM_NAME=/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/gu;
export const cleanQuestName=name=>String(name??'').replace(STRIP_FROM_NAME,'').trim();

// 오늘 퀘스트 한 줄. 값은 쌓은 기록 기준이다: 쌓기 전 입력으로만 채워지면(preview) pending("쌓으면 완료").
export function todayQuestLine(ach,preview=null){
  const items=(ach.todayDay.daily??[]).map(q=>{
    const after=preview?.todayDay?.daily?.find(x=>x.id===q.id)??null;
    return {id:q.id,label:q.label,state:q.done?'done':after?.done?'pending':'todo'};
  });
  return {done:items.filter(q=>q.state==='done').length,total:items.length,items};
}

export const myQuestOf=life=>lifeDefs(life).habits.find(h=>h.id===MY_QUEST_ID)??null;
// 저장할 줄. 저장된 습관이 없는 상태면 기본 13개 + 1개를 함께 저장한다(하나만 쓰면 기본 습관이 화면에서 사라진다). 있으면 uq-1 한 줄만.
export function myQuestRows(life,{name,count,area='HEAD',hidden=false}){
  const view=life??EMPTY_LIFE_VIEW,defs=lifeDefs(view),label=cleanQuestName(name);
  if(!hasVisibleText(label)||[...label].length>MAX_NAME)throw questError('INVALID_LIFE_TEXT');
  if(!Number.isInteger(count)||count<1||count>99)throw questError('INVALID_HABIT_TARGET');
  if(!HABIT_AREAS.includes(area))throw questError('INVALID_HABIT_DEF');
  const old=defs.habits.find(h=>h.id===MY_QUEST_ID)??null;
  if(!old&&defs.habits.length>=LIFE_LIMITS.HABIT_DEF)throw questError('APP_ENTITY_LIMIT');
  const def={id:MY_QUEST_ID,name:label,kind:'COUNT',target:{time:null,minutes:null,count,per:'WEEK'},difficulty:'AUTO',hidden:Boolean(hidden),order:old?old.order:defs.habits.length,area};
  validateLifeData('HABIT_DEF',MY_QUEST_ID,def);
  const habits=old?defs.habits.map(h=>h.id===MY_QUEST_ID?def:h):[...defs.habits,def];
  return collectRows({habits,subjects:defs.subjects,exams:defs.exams},view,defs);
}
// 소유자가 저장을 눌렀을 때만 부른다. 돌려주는 값 = 실제로 저장한 개수. memo.sealed = 그중 임시 저장(봉인 초안)된 줄 수(saveDefinitions).
export function saveMyQuest(ctx,spec,memo){return saveDefinitions(ctx,myQuestRows(ctx.getWhole().life??null,spec),MY_QUEST_REASON,memo);}

// ---- 새 기록(D46, D49) 저장 경로: PLAN_GOAL·EXAM_RESULT·GAME_PROFILE·WEEK_REVIEW는 아래 저장 함수로만 쓴다. 소유자가 저장을 눌렀을 때만 부른다 ----
// 쓰기 문이 닫혀 있으면 아무것도 쓰지 않고 RECORDS_DOOR_CLOSED를 던진다. savePlanDay와 같게: 최신이 편집을 시작한 때와 다르면 3자 병합, STALE_HEADS면 다시 받아 최대 3번, 합친 결과는 검사기를 다시 통과해야 쓴다.
// 임시 저장 모드에서는 봉인 초안으로만 들어간다: sealed:true와 RECORD_LOCAL_DRAFT를 돌려주므로 부른 쪽은 성공으로 말하지 말고 입력을 남긴다.
const recordError=code=>Object.assign(new Error(code),{code});
const storageOf=ctx=>{try{return ctx.storage??globalThis.localStorage;}catch{return null;}};   // 저장소가 막힌 브라우저는 읽기만으로 던진다
function recordRow(life,type,id){
  if(type==='PLAN_GOAL')return (life?.goals??[]).find(x=>x.id===id)??null;
  if(type==='EXAM_RESULT')return (life?.results??[]).find(x=>x.id===id)??null;
  if(type==='WEEK_REVIEW')return (life?.weekReviews??[]).find(x=>x.id===id)??null;
  return life?.profile??null;
}
const recordEmpty=(type,d)=>type==='PLAN_GOAL'?d.goals.length===0:type==='WEEK_REVIEW'?d.pick===null&&!hasVisibleText(d.next):type==='EXAM_RESULT'&&d.scores.length===0;
// 봉인(임시 저장)으로 쌓인 칭호 초안 id를 ctx.sealedDrafts(Map, 앱이 오래 사는 하나를 넘김)에 기록과 같은 키로 모은다. 없으면 기억하지 않는다(그 경우 옛 동작).
// 나중에 고른 칭호가 금고 값과 같아지면(ALREADY_APPLIED) 남은 초안은 마지막 선택과 어긋난 옛 값이라 지운다. 안 지우면 "승인하고 쌓기"가 옛 값으로 금고를 바꾼다(HUNT50 B2).
// 칭호(GAME_PROFILE)만 한다: 칭호 시트는 봉인 값을 보여 주므로 금고 값을 고르는 것이 곧 되돌림이다. 주간 리뷰·목표·모의고사 시트는 다시 열면 금고 값으로 그리고
// 여러 칸을 합치므로 "금고 값과 같음"이 되돌림을 뜻하지 않는다. 그 봉인 초안은 남겨 승인 흐름으로 처리한다(FIX52A, HUNT51 HB1).
const SEAL_DROP_TYPE='GAME_PROFILE';
const sealKey=(type,id)=>type+':'+id;
function rememberSealed(ctx,type,id,w){
  const reg=ctx.sealedDrafts;
  if(type!==SEAL_DROP_TYPE||!(reg instanceof Map)||typeof w?.draftId!=='string')return;
  reg.set(sealKey(type,id),[...(reg.get(sealKey(type,id))??[]),w.draftId]);
}
async function dropSealed(ctx,type,id,out){
  const reg=ctx.sealedDrafts,key=sealKey(type,id),list=reg instanceof Map?reg.get(key):null;
  if(type!==SEAL_DROP_TYPE||!list?.length||typeof ctx.api!=='function')return out;
  let gone=0;
  for(const draftId of [...list]){
    try{await ctx.api('/api/md/draft-discard',{draftId,confirmed:true});}
    catch(e){if(e?.code!=='MD_DRAFT_NOT_FOUND'){reg.set(key,list.slice(list.indexOf(draftId)));throw recordError(e?.code??'DRAFT_DISCARD_FAILED');}}   // 이미 없는 초안(승인·정리됨)은 지운 것으로 본다
    gone++;
  }
  reg.delete(key);
  return gone?{...out,discarded:gone}:out;
}
// FIX53A (HUNT52 HQ1·HQ2): 주간 리뷰·목표·모의고사 시트는 자기가 만든 봉인 초안 id만 own(시트가 넘기는 배열)에 기억한다.
// 같은 시트에서 금고 값으로 되돌려 저장하면(ALREADY_APPLIED) own의 id만 지운다. 다른 시트·재시작 뒤의 초안은 건드리지 않는다(HUNT51 HB1 재발 0).
// 같은 시트에서 같은 기록을 다시 봉인하면 새 초안 저장이 끝난 뒤 이 시트의 옛 초안(own)만 지운다(새 초안이 대신, 시트가 그 값을 들고 있음).
// FIX55A (HUNT53 HQ5·HQ6-b·HU1): 다른 시트·재시작 전·옛 빌드가 만든 같은 기록 초안은 지우지 않는다. 새 시트는 금고 값에서 시작해 그 초안의 칸을 모르므로
// 대신하면 그 칸이 말없이 사라진다. 남겨 두면 승인 때 sealBase로 병합되거나 SEALED_CONFLICT로 금고 값과 초안이 모두 지켜진다(FIX54).
const SHEET_TYPES=new Set(['WEEK_REVIEW','PLAN_GOAL','EXAM_RESULT']);
export const sealedLeftText=n=>'임시 저장 '+n+'건이 남아 있어요 · 승인하면 고르기가 나올 수 있어요';   // FIX61Q: 남은 초안이 같은 칸이면 승인이 바로 바꾸지 않고 고르기(지금 기록·임시 저장 내용)를 보인다
export const SEALED_SAME_TEXT='이미 임시 저장했어요 · 연결 · 장치에서 승인하면 쌓여요';
// 앞에서부터 지운다. 이미 없는 초안은 지운 것으로 본다. 처음 실패한 곳에서 멈추고 지운 수를 돌려준다(남은 것은 그대로 남는다).
async function discardIds(ctx,ids){
  let n=0;
  for(const draftId of ids){try{await ctx.api('/api/md/draft-discard',{draftId,confirmed:true});}catch(e){if(e?.code!=='MD_DRAFT_NOT_FOUND')break;}n++;}
  return n;
}
async function dropOwn(ctx,own,out){
  if(!Array.isArray(own)||!own.length||typeof ctx.api!=='function')return out;
  const n=await discardIds(ctx,own);own.splice(0,n);
  return {...out,...(n?{discarded:n}:{}),...(own.length?{sealedLeft:own.length}:{})};
}
// 이 기기 저널의 같은 기록 봉인 초안 id(draft-list의 entity 칸, 값 없음). 저널 목록 통로가 없거나 읽지 못하면 null.
async function journalIds(ctx,type,id){
  if(typeof ctx.canDrafts!=='function'||!ctx.canDrafts()||typeof ctx.api!=='function')return null;
  try{const r=await ctx.api('/api/md/draft-list',{});return r.drafts.filter(d=>d.status==='LOCAL_DRAFT'&&d.entity?.type===type&&d.entity?.id===id).map(d=>d.draftId);}catch{return null;}
}
// 돌려주는 sealedLeft = 새 초안 말고 남은 같은 기록 초안 수(이 기기 저널, 목록을 못 읽으면 지우지 못한 own). 시트는 "임시 저장 n건이 남아 있어요"로 알린다.
async function replaceSealed(ctx,type,id,draftId,own){
  if(!SHEET_TYPES.has(type)||typeof draftId!=='string')return {};
  const old=Array.isArray(own)?own.filter(x=>x!==draftId):[];
  const n=old.length&&typeof ctx.api==='function'?await discardIds(ctx,old):0,left=old.slice(n);
  if(Array.isArray(own))own.splice(0,own.length,...left,draftId);
  const rest=((await journalIds(ctx,type,id))??left).filter(x=>x!==draftId);
  return {...(n?{replaced:n}:{}),...(rest.length?{sealedLeft:rest.length}:{})};
}
const dropFor=(ctx,type,id,own,out)=>type===SEAL_DROP_TYPE?dropSealed(ctx,type,id,out):dropOwn(ctx,own,out);
async function saveRecord(ctx,type,id,{base=null,mine,own=null},reason){
  const whole=ctx.getWhole();
  requireRecordsDoor({life:whole.life,study:whole.study,storage:storageOf(ctx)});
  validateLifeData(type,id,mine);
  for(let attempt=1;attempt<=3;attempt++){
    const row=recordRow(ctx.getWhole().life,type,id),latest=row?.data??null;
    let data=mine,notices=[];
    if(type!=='GAME_PROFILE'&&stable(latest)!==stable(base)){   // 칭호는 값 하나라 나중 저장이 남는다
      const rb=rebaseRecord(type,{id,base,mine,latest});
      if(rb.status==='REJECTED')throw recordError(rb.code);
      if(rb.status==='ALREADY_APPLIED')return dropFor(ctx,type,id,own,{status:'ALREADY_APPLIED',notices:rb.notices});
      data=rb.data;notices=rb.notices;
    }else if(latest&&stable(latest)===stable(mine))return dropFor(ctx,type,id,own,{status:'ALREADY_APPLIED',notices:[]});
    if(!latest&&recordEmpty(type,data))return dropFor(ctx,type,id,own,{status:'ALREADY_APPLIED',empty:true,notices});   // 없는 기록을 빈 채로 만들지 않는다(empty: 시트가 "적은 … 없어" 문구를 고른다, HQ4)
    let w;
    // FIX54 (HUNT52 HQ3): 세 종류는 쓰기 직전 금고 값(latest = expectedHeads 판의 값)을 sealBase로 함께 넘긴다. 임시 저장이면 초안에 들어가 승인 때 md-backend가 3자 병합에 쓴다(정상 저장이면 쓰지 않음).
    // 앱 ctx에 entityWithBase가 없으면(시험·옛 포트) 지금처럼 entity로 쓴다.
    const based=SHEET_TYPES.has(type)&&typeof ctx.entityWithBase==='function';
    try{w=await (based?ctx.entityWithBase(type,id,data,row?[...row.heads]:[],reason,latest):ctx.entity(type,id,data,row?[...row.heads]:[],reason));}
    catch(e){if(e?.code==='STALE_HEADS'&&attempt<3&&ctx.reload){await ctx.reload();continue;}throw e;}
    if(w?.status==='LOCAL_DRAFT'){rememberSealed(ctx,type,id,w);return {status:'SAVED',sealed:true,notices:[...notices,{code:'RECORD_LOCAL_DRAFT'}],data,...await replaceSealed(ctx,type,id,w.draftId,own)};}
    return {status:'SAVED',notices,data};
  }
  throw recordError('STALE_HEADS');
}
export function savePlanGoal(ctx,{monday,base,mine,own}){return saveRecord(ctx,'PLAN_GOAL',monday,{base,mine,own},'주간 목표 저장');}
export function saveExamResult(ctx,{id,base,mine,own}){return saveRecord(ctx,'EXAM_RESULT',id,{base,mine,own},'모의고사 결과 저장');}
export function saveGameProfile(ctx,titleId){return saveRecord(ctx,'GAME_PROFILE',GAME_PROFILE_ID,{mine:{titleId}},'칭호 저장');}
export function saveWeekReview(ctx,{monday,base,mine,own}){return saveRecord(ctx,'WEEK_REVIEW',monday,{base,mine,own},'주간 리뷰 저장');}   // 사유는 고정 문구만(이력에 그대로 보인다)
// 연결 · 장치의 임시 저장 줄 이름(FIX53A): 기록 종류와 주만 보인다(값은 싣지 않음). draft-list의 entity 칸이 없으면 null(앱이 옛 이름을 쓴다).
const shortDay=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
export function sealedDraftLabel(d){
  const t=d?.entity?.type,id=String(d?.entity?.id??''),week=/^\d{4}-\d{2}-\d{2}$/.test(id)?' · '+shortDay(id)+' 주':'';
  const name=t==='WEEK_REVIEW'?'주간 리뷰'+week:t==='PLAN_GOAL'?'과목 목표'+week:t==='EXAM_RESULT'?'모의고사 결과':t==='GAME_PROFILE'?'칭호':null;
  return name&&d.preUpdate===true?name+PRE_UPDATE_LABEL:name;   // FIX58Q (HU2): 업데이트 전 빌드가 만든 초안(sealBase 없음, draft-list preUpdate)은 같은 기록의 새 초안과 이름을 구별한다
}
export const PRE_UPDATE_LABEL=' · 업데이트 전 임시 저장';
// FIX59Q (HU57-2): 사용자가 고르는 충돌 줄에 보이는 초안 내용(승인 응답 draftFields = 적용하면 바뀔 칸과 그 값). 이 기기 화면에만 보이고 목록·알림 경로로 나가지 않는다.
const FIELD_NAME={pick:'고른 문장',next:'다음 주 한 가지',goals:'과목 목표',takenOn:'응시일',scores:'점수'};
const rowText=x=>x&&typeof x==='object'?[x.subjectId,x.bricks??x.raw??x.grade].filter(y=>y!==undefined&&y!==null).join(' '):String(x);
const fieldText=v=>v===null||v===undefined?'없음':Array.isArray(v)?(v.length?v.map(rowText).join(', '):'없음'):typeof v==='object'?String(v.text??v.date??''):String(v);
export function sealedFieldsText(fields){
  return Array.isArray(fields)&&fields.length?'임시 저장 내용: '+fields.map(f=>(FIELD_NAME[f.field]??f.field)+' '+fieldText(f.value)).join(' · '):'임시 저장 내용: 바뀐 칸 없음';   // 화면 글자는 FIX45-3a 금지 낱말을 쓰지 않는다
}

// ---- 칭호 고르기 저장(FIX46C, D46 2.5): 쓰기 문이 열려 있으면 금고(GAME_PROFILE)에 저장해 네 기기가 같은 칭호를 쓴다. 닫혀 있으면 지금처럼 이 기기에만 저장한다 ----
export const TITLE_DEVICE_NOTE='이 기기에만 저장돼요 · 네 기기를 올리고 새 기록을 켜면 같은 칭호를 써요';
// 앱이 넘긴 ctx에 저장 함수와 읽기가 모두 있고 문이 열려 있을 때만 참. 그 밖(시험·읽기 전용·문 닫힘)은 기기 저장으로 간다.
export function titleVaultOn(ctx){
  try{return typeof ctx?.entity==='function'&&typeof ctx.getWhole==='function'&&recordsOpen(ctx);}catch{return false;}
}
// 돌려주는 값: 'SAVED' | 'SEALED'(임시 저장이라 금고에는 아직 없음) | 'ERROR'(show에 문구를 넘김). 결과를 모르는 오류는 그대로 던진다(앱의 perform이 처리).
// info를 넘기면 info.discarded = 금고 값으로 되돌려서 지운 봉인 초안 수(없으면 0)를 채운다(부른 쪽이 이 기기 표시를 금고 값에 맞춘다, FIX51B B2).
export async function pickTitle(ctx,titleId,show,info=null){
  let r;
  try{r=await saveGameProfile(ctx,titleId);}
  catch(e){if(unknownOutcome(e?.code))throw e;show(planErrorText(e?.code));return 'ERROR';}
  if(info)info.discarded=r.discarded??0;
  return r.sealed?'SEALED':'SAVED';
}

// ---- 월 보기 "목표 달성 주"(FIX46C, D46 6.1) ----
// 이 달에 월요일이 든 주 중 이미 시작했고 목표가 있는 주를 센다(월 경계 주를 쪼개지 않아 두 달에 겹치지 않는다). 달성 = 그 주 모든 과목이 목표를 채움(목표 대비 100%).
export function monthGoalWeeks({life,ach,ym,today}){
  const weeks=new Map((ach?.weeks??[]).map(w=>[w.monday,w]));let total=0,done=0;
  for(const g of life?.goals??[]){
    if(g.monday.slice(0,7)!==ym||g.monday>today)continue;
    const actual=new Map();
    for(let i=0;i<7;i++)for(const [id,s] of actualOf(weeks,shiftDay(g.monday,i)).bySubject)actual.set(id,(actual.get(id)??0)+s.value);
    const p=goalProgress(g.data.goals,actual);
    if(!(p.total>0))continue;
    total++;if(p.got>=p.total)done++;
  }
  return {total,done};
}
// 앱이 ctx.monthGoals로 넘긴다. 문이 닫혀 있거나 이 달에 목표를 정한 주가 없으면 줄을 그리지 않는다(0으로 채우지 않음).
export function renderMonthGoals(ctx,{ym,ach,today}){
  if(!recordsOpen(ctx))return null;
  const {total,done}=monthGoalWeeks({life:ctx.getWhole().life??null,ach,ym,today});
  if(!total)return null;
  const h=maker(ctx.document??globalThis.document);
  return h.el('p','목표 달성 주 '+done+' / '+total+' · 월요일이 이 달인 주만 셉니다','muted small pm-goal-weeks');
}

// ---- 새 기록 화면(FIX46B, D46 4.2·6.1·6.2). 앱이 포트로 넘겨 설정·계획 탭에 그린다. 화면 규칙: DOM 생성 함수만. 쓰기는 시트의 "저장" 버튼에서 위 저장 함수로만 ----
export const DOOR_TITLE='새 기록 (모의고사·주간 목표) · 일기',DOOR_BUTTON='4기기 업데이트 확인하고 켜기',DOOR_WAIT='4기기 업데이트 뒤 켜기';
export const DOOR_CONFIRM='PC·노트북·Fold·iPad를 모두 r48 이상으로 올렸나요? 켜면 옛 버전 앱은 이 기록을 만나면 멈춥니다(지워지지는 않음)';
const doorOf=ctx=>{const w=ctx.getWhole();return recordsDoorState({life:w?.life??null,study:w?.study??null,storage:storageOf(ctx)});};
export const recordsOpen=ctx=>doorOf(ctx).open;
export function doorStateText(s){return s.vault?'켜짐 · 새 기록이 이미 있어 이 기기도 켜졌습니다':s.device?'켜짐 · 이 기기에서 켰습니다':'꺼짐 · 네 기기를 모두 올린 뒤 한 곳에서 켜면 됩니다';}
// 설정의 한 줄. 이 줄이 보이면 그 기기는 새 빌드다. 켜기는 이 기기 저장소만 바꾸고 서버 쓰기는 0이다. 끄는 길은 없다.
export function renderRecordsDoor(ctx){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,s=doorOf(ctx);
  const out=add(el('section',null,'panel records-door'),el('h2',DOOR_TITLE,'panel-title'),el('p',doorStateText(s),'muted small records-door-state'));
  if(!s.open)add(out,button(DOOR_BUTTON,()=>{if(!(ctx.confirmDialog?.(DOOR_CONFIRM)??false))return;openRecordsDoor(storageOf(ctx));void ctx.rerender();},'primary records-door-open'));
  return out;
}
const num=v=>Number.isInteger(v)?String(v):v.toFixed(1);
// 1장 = 30분. "10장 (5시간)", "1.5장 (45분)", "2.5장 (1시간 15분)"
export const brickText=v=>{const min=v*30,h=Math.floor(min/60),m=min%60;return num(v)+'장 ('+[h?h+'시간':null,m?m+'분':null].filter(Boolean).join(' ')+')';};
const noticeOf=n=>PLAN_NOTICE_TEXT[n.code]?n:null;
// 시트 저장 공통: 닫고 저장한 뒤 성공이면 알림을 넘긴다. 오류·임시 저장은 입력을 남긴 채 같은 시트를 다시 연다(savePlanDay 시트와 같은 방식). 결과를 모르면 앱의 perform으로 넘긴다.
// 시트 아래 문구 한 줄. error=false면 오류 모양(error 클래스)을 빼고 안내 모양으로 보인다(FIX53A HQ2b: 임시 저장은 오류가 아니다).
function sheetNote(err,text,error=true){
  const cls=String(err.className??'').split(' ').filter(c=>c&&c!=='error');
  if(error)cls.splice(1,0,'error');
  err.className=cls.join(' ');err.textContent=text;err.hidden=false;
}
// sealed(mine) = 임시 저장이 끝났을 때 부른다(시트가 같은 값의 다시 봉인을 막는 데 쓴다).
function saveFromSheet(ctx,{title,body,err,close,run,done,report,sealed=null}){
  close();
  void ctx.perform(async()=>{
    const reopen=(text,error=true)=>{sheetNote(err,text,error);if(!ctx.locked?.())ctx.sheet?.(title,body);};
    let r;
    try{r=await run();}
    catch(e){await ctx.rerender();reopen(planErrorText(e?.code));if(unknownOutcome(e?.code))throw e;return;}
    if(r.sealed){sealed?.();await ctx.rerender();reopen(PLAN_NOTICE_TEXT.RECORD_LOCAL_DRAFT+(r.sealedLeft?' · '+sealedLeftText(r.sealedLeft):''),false);return;}
    report(done(r),false,r.notices.filter(noticeOf));await ctx.rerender();
  });
}
// ALREADY_APPLIED 문구: 지우지 못한 이 시트의 봉인 초안이 남았으면 그 사실을 먼저 말한다(HQ1). 빈 기록은 "적은 … 없어"(HQ4).
const sameText=(r,same,empty)=>r.sealedLeft?sealedLeftText(r.sealedLeft):r.empty?empty:same;
export const GOAL_EMPTY_TEXT='적은 목표가 없어 저장하지 않았어요',EXAM_EMPTY_TEXT='적은 점수가 없어 저장하지 않았어요';

// ----- 과목 주간 목표(D46 6.1) -----
export const goalRow=(life,monday)=>(life?.goals??[]).find(x=>x.id===monday)??null;
// 목표 대비 = Σ min(실제, 목표) / Σ 목표. 계획 달성률과 분모를 섞지 않는다. 목표가 없으면 null.
export function goalProgress(goals,actual){
  const rows=goals.map(g=>({...g,actual:actual?.get(g.subjectId)??0})),total=rows.reduce((s,r)=>s+r.bricks,0),got=rows.reduce((s,r)=>s+Math.min(r.actual,r.bricks),0);
  return {rows,total,got,rate:total>0?got/total:null};
}
export const stepGoal=(v,d)=>Math.min(MAX_GOAL_BRICKS,Math.max(0,v+d));
export function renderWeekGoals(ctx,{monday,state,subjects,actual,report}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,head=state==='NOW'?'이번 주 과목 목표':'이 주 과목 목표',out=el('div',null,'pw-goals');
  if(!recordsOpen(ctx))return add(out,el('p',head+' · '+DOOR_WAIT,'muted small pw-goal-wait'));
  const life=ctx.getWhole().life??null,row=goalRow(life,monday),p=goalProgress(row?.data.goals??[],actual),names=new Map(lifeDefs(life).subjects.map(s=>[s.id,s.name]));
  add(out,el('strong',head,'pw-goal-head'));
  if(p.rate!==null)add(out,el('p','목표 대비 '+Math.round(p.rate*100)+'% ('+num(p.got)+' / '+num(p.total)+'장)','plan-sum pw-goal-rate'));
  for(const r of p.rows)add(out,el('p',(names.get(r.subjectId)??'기타')+' '+num(r.actual)+' / '+brickText(r.bricks),'muted small pw-goal-line'));
  if(state==='PAST'){if(p.rate===null)add(out,el('p','이 주에는 정한 목표가 없습니다.','muted small'));return out;}   // 지난 주는 보기만 한다
  return add(out,button(row?'목표 고치기':'목표 정하기',()=>openGoalSheet(ctx,{monday,subjects,names,report}),'secondary pw-goal-edit'));
}
function openGoalSheet(ctx,{monday,subjects,names,report}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,life=ctx.getWhole().life??null,base=structuredClone(goalRow(life,monday)?.data??null),last=goalRow(life,shiftDay(monday,-7))?.data??null;
  const values=new Map((base?.goals??[]).map(g=>[g.subjectId,g.bricks]));
  const ids=()=>[...new Set([...subjects.map(s=>s.id),...values.keys()])];   // 숨긴 과목에 있던 목표도 지우지 않고 줄로 남긴다
  const body=el('div',null,'pt-sheet pw-goal-sheet'),err=el('p',null,'notice error pw-goal-error'),rows=el('div',null,'pw-goal-rows');err.hidden=true;
  const draw=()=>{
    rows.replaceChildren();
    for(const id of ids()){
      const v=values.get(id)??0,set=d=>()=>{const n=stepGoal(v,d);if(n>0)values.set(id,n);else values.delete(id);draw();};
      const r=add(el('div',null,'pw-goal-row'),el('span',names.get(id)??'기타','pw-goal-name'),button('−',set(-0.5),'secondary pw-goal-minus'),el('strong',v>0?brickText(v):'없음','pw-goal-value'),button('+',set(0.5),'secondary pw-goal-plus'));
      r.dataset.subjectId=id;add(rows,r);
    }
    if(!ids().length)add(rows,el('p','보이는 과목이 없습니다.','muted small'));
  };
  draw();
  const title='과목 목표 · '+Number(monday.slice(5,7))+'/'+Number(monday.slice(8,10))+' 주';
  let dlg=null,sealedAs=null;const own=[];   // FIX53A: 이 시트가 만든 봉인 초안 id, 마지막으로 봉인한 값
  const like=button('지난주처럼',()=>{values.clear();for(const g of last.goals)values.set(g.subjectId,g.bricks);err.hidden=true;draw();},'secondary pw-goal-last');
  if(!last?.goals.length){like.disabled=true;like.setAttribute('aria-disabled','true');}
  const save=button('저장',()=>{
    const mine={monday,goals:ids().filter(id=>values.has(id)).map(id=>({subjectId:id,bricks:values.get(id)}))};
    try{validateLifeData('PLAN_GOAL',monday,mine);}catch(e){sheetNote(err,planErrorText(e?.code));return;}
    if(sealedAs!==null&&stable(mine)===sealedAs){sheetNote(err,SEALED_SAME_TEXT,false);return;}   // HQ2b: 같은 값을 다시 봉인하지 않는다
    saveFromSheet(ctx,{title,body,err,close:()=>dlg?.close?.(),run:()=>savePlanGoal(ctx,{monday,base,mine,own}),sealed:()=>{sealedAs=stable(mine);},
      done:r=>{sealedAs=null;return r.status==='SAVED'?'과목 목표를 저장했습니다.':sameText(r,'이미 같은 목표가 저장되어 있습니다.',GOAL_EMPTY_TEXT);},report});
  },'primary pw-goal-save');
  add(body,el('p','과목마다 0.5장씩 정합니다 · 1장 = 30분 · 없음은 저장하지 않습니다','muted small'),add(el('div',null,'buttons'),like,save),err,rows);
  dlg=ctx.sheet?.(title,body)??null;
  return {body,values,save};
}

// ----- 모의고사 결과(D46 6.2): 시험 하나에 1건. 빈칸은 저장하지 않고, 네 칸이 모두 빈 과목은 줄을 만들지 않는다. 시험 이름은 저장하지 않고 일정에서 찾는다. -----
export const SCORE_FIELDS=Object.freeze([['raw','원점수'],['std','표준점수'],['pct','백분위'],['grade','등급']]);
export const resultName=(r,exams)=>exams.items.find(x=>x.id===r.id)?.name??'지난 시험';
// 칸 글자 → 값. 빈칸은 null, 숫자가 아니면 NaN(검사기가 INVALID_EXAM_SCORE로 거절).
export const scoreValue=text=>{const t=String(text??'').trim();return t===''?null:/^\d{1,3}$/.test(t)?Number(t):NaN;};
export function scoresFrom(inputs){
  const out=[];
  for(const [subjectId,cells] of inputs){const line={subjectId};for(const [k] of SCORE_FIELDS)line[k]=scoreValue(cells[k]);if(SCORE_FIELDS.some(([k])=>line[k]!==null))out.push(line);}
  return out;
}
// 고를 시험: 일정 + 일정에서 지운 시험의 결과. 먼저 고를 것 = 오늘 또는 그 전의 가장 최근 시험, 없으면 가장 가까운 시험.
export function examChoices(exams,results,today){
  const sched=[...exams.items].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0).map(x=>({id:x.id,name:x.name,date:x.date,examId:x.id}));
  const gone=results.filter(r=>!exams.items.some(x=>x.id===r.id)).map(r=>({id:r.id,name:'지난 시험',date:r.data.takenOn,examId:r.data.examId}));
  const all=[...sched,...gone],past=sched.filter(x=>x.date<=today);
  return {all,first:past[past.length-1]??sched[0]??all[0]??null};
}
// 등급 추이 표: 응시일 순 최근 limit회, 등급을 적은 과목만.
export function gradeTrend(results,exams,subjects,limit=6){
  const cols=[...results].sort((a,b)=>a.data.takenOn<b.data.takenOn?-1:a.data.takenOn>b.data.takenOn?1:0).slice(-limit),ids=[];
  for(const c of cols)for(const s of c.data.scores)if(s.grade!==null&&!ids.includes(s.subjectId))ids.push(s.subjectId);
  const names=new Map(subjects.map(s=>[s.id,s]));ids.sort((a,b)=>(names.get(a)?.order??999)-(names.get(b)?.order??999));
  return {cols:cols.map(c=>({id:c.id,name:resultName(c,exams).replace(/\(.*\)/,''),date:c.data.takenOn})),rows:ids.map(id=>({subjectId:id,name:names.get(id)?.name??'기타',grades:cols.map(c=>c.data.scores.find(s=>s.subjectId===id)?.grade??null)}))};
}
export function renderExamResults(ctx,{exams,today,report}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,out=el('div',null,'plan-results');
  if(!recordsOpen(ctx))return add(out,el('p','모의고사 결과 · '+DOOR_WAIT,'muted small plan-result-wait'));
  const life=ctx.getWhole().life??null,results=life?.results??[],subjects=lifeDefs(life).subjects;
  const open=id=>openExamSheet(ctx,{exams,today,report,id});
  add(out,button('모의고사 결과 넣기',()=>open(null),'secondary plan-result-add'));
  if(!results.length)return out;
  const box=add(el('details',null,'plan-result-list'),el('summary','모의고사 결과 '+results.length+'건'));
  for(const r of results){const b=button(resultName(r,exams)+' · '+r.data.takenOn+' · '+r.data.scores.length+'과목',()=>open(r.id),'secondary plan-result-row');b.dataset.resultId=r.id;add(box,b);}
  const t=gradeTrend(results,exams,subjects);
  if(t.rows.length){
    const table=el('table',null,'plan-result-trend'),head=el('tr');table.setAttribute('aria-label','과목별 등급 추이');
    add(head,el('th','과목'),...t.cols.map(c=>el('th',c.name)));add(table,head);
    for(const r of t.rows)add(table,add(el('tr'),el('th',r.name),...r.grades.map(g=>el('td',g===null?'-':g+'등급'))));
    add(box,el('strong','과목별 등급 추이','plan-result-head'),table);
  }
  return add(out,box);
}
function openExamSheet(ctx,{exams,today,report,id=null}){
  const h=maker(ctx.document??globalThis.document),{el,add,button}=h,life=ctx.getWhole().life??null,results=life?.results??[],defs=lifeDefs(life),{all,first}=examChoices(exams,results,today);
  const body=el('div',null,'pt-sheet plan-result-sheet'),err=el('p',null,'notice error plan-result-error'),picks=el('div',null,'pt-chips plan-result-picks'),form=el('div',null,'plan-result-form');err.hidden=true;
  let pick=all.find(x=>x.id===id)??first,dlg=null,read=null,keep=null;
  // FIX55A (HUNT53 HQ6-a): 시험(칩)마다 이 시트에 적은 칸 글자를 기억한다(메모리만). 칩을 오가도 금고 값으로 다시 그리지 않아,
  // 봉인 값이 화면에서 사라지거나 그 상태의 [저장]이 "되돌림"으로 오판되어 봉인 초안을 지우는 일이 없다. 금고 값으로 직접 고친 것만 되돌림이다.
  const kept=new Map();
  const title='모의고사 결과';
  const draw=()=>{
    picks.replaceChildren();form.replaceChildren();err.hidden=true;
    for(const x of all){const b=button(x.name.replace(/\(.*\)/,''),()=>{keep?.();pick=x;draw();},'lb-chip plan-result-pick'+(x.id===pick?.id?' selected':''));b.setAttribute('aria-pressed',String(x.id===pick?.id));b.dataset.examId=x.id;add(picks,b);}
    if(!pick){add(form,el('p','시험 일정이 없습니다. 오늘 탭의 습관 편집에서 추가하세요.','muted small'));read=null;keep=null;return;}
    const row=results.find(r=>r.id===pick.id)??null,old=new Map((row?.data.scores??[]).map(s=>[s.subjectId,s])),mem=kept.get(pick.id)??null;
    const ids=[...new Set([...defs.subjects.filter(s=>s.exam&&!s.hidden).map(s=>s.id),...old.keys()])],names=new Map(defs.subjects.map(s=>[s.id,s.name]));
    const date=el('input');date.type='text';date.value=mem?mem.date:row?.data.takenOn??pick.date;date.setAttribute('maxlength','10');date.setAttribute('inputmode','numeric');date.setAttribute('aria-label','시험 본 날');date.disabled=pick.examId===null;   // 일정 밖 시험은 날짜가 곧 기록 이름이라 고치지 않는다
    add(form,add(el('label',null,'plan-result-date'),el('span','시험 본 날'),date));
    const table=el('table',null,'plan-result-table'),headRow=el('tr'),cells=new Map();
    add(headRow,el('th','과목'),...SCORE_FIELDS.map(([,t])=>el('th',t)));add(table,headRow);
    for(const sid of ids){
      const tr=el('tr'),slot={};tr.dataset.subjectId=sid;add(tr,el('th',names.get(sid)??'기타'));
      for(const [k,t] of SCORE_FIELDS){const n=el('input');n.type='text';n.setAttribute('inputmode','numeric');n.setAttribute('maxlength','3');n.setAttribute('aria-label',(names.get(sid)??'기타')+' '+t);n.dataset.field=k;n.value=mem?mem.cells.get(sid)?.[k]??'':old.get(sid)?.[k]??'';slot[k]=n;add(tr,add(el('td'),n));}
      cells.set(sid,slot);add(table,tr);
    }
    add(form,table);
    const texts=()=>[...cells].map(([sid,slot])=>[sid,Object.fromEntries(SCORE_FIELDS.map(([k])=>[k,slot[k].value]))]);
    const at=pick.id;keep=()=>kept.set(at,{date:date.value,cells:new Map(texts())});
    read=()=>({base:row?structuredClone(row.data):null,mine:{examId:pick.examId,takenOn:date.value.trim(),scores:scoresFrom(texts())}});
  };
  draw();
  const owns=new Map(),sealedAs=new Map();   // FIX53A: 시험(기록 id)마다 이 시트가 만든 봉인 초안 id와 마지막으로 봉인한 값
  const save=button('저장',()=>{
    if(!read)return;
    const {base,mine}=read(),rid=mine.examId??pick.id;
    if(!mine.scores.length&&!base){sheetNote(err,'적은 점수가 없습니다. 한 칸 이상 적어 주세요.');return;}
    try{validateLifeData('EXAM_RESULT',rid,mine);}catch(e){sheetNote(err,planErrorText(e?.code));return;}
    if(sealedAs.get(rid)===stable(mine)){sheetNote(err,SEALED_SAME_TEXT,false);return;}   // HQ2b
    if(!owns.has(rid))owns.set(rid,[]);
    saveFromSheet(ctx,{title,body,err,close:()=>dlg?.close?.(),run:()=>saveExamResult(ctx,{id:rid,base,mine,own:owns.get(rid)}),sealed:()=>sealedAs.set(rid,stable(mine)),
      done:r=>{sealedAs.delete(rid);return r.status==='SAVED'?'모의고사 결과를 저장했습니다.':sameText(r,'이미 같은 결과가 저장되어 있습니다.',EXAM_EMPTY_TEXT);},report});
  },'primary plan-result-save');
  add(body,picks,el('p','빈칸은 비워 두면 됩니다 · 등급만 적어도 저장됩니다','muted small'),add(el('div',null,'buttons'),save),err,form);
  dlg=ctx.sheet?.(title,body)??null;
  return {body,save};
}
