// 퀘스트 묶음 (Q1A, 설계 Q1D §4). 판정은 XP와 함께 계산해야 해서 성취 엔진(life-achieve)이 하고, 이 모듈은 오늘 줄 요약과 내 퀘스트 1칸 저장 경로를 맡는다.
// 내 퀘스트는 새 기록 종류가 아니라 고정 id uq-1인 COUNT·주 단위 습관 하나다: 옛 빌드도 받고 오늘 격자의 +1을 그대로 쓴다. 보너스 벽돌·업적 없이 기존 습관 XP와 주간 목표 +15만 받는다.
import {MY_QUEST_ID} from './life-achieve.mjs';
import {collectRows,saveDefinitions} from './life-flow.mjs';
import {HABIT_AREAS,EMPTY_LIFE_VIEW,LIFE_LIMITS,MAX_NAME,lifeDefs,validateLifeData} from './life-model.mjs';
export {DEFS_SEALED_TEXT} from './life-flow.mjs';

export const MY_QUEST_REASON='내 퀘스트 저장';
const questError=code=>Object.assign(new Error(code),{code});
// 보이는 글자가 하나도 없는 이름: 제어·글자 방향·폭 없는 문자, 공백, 결합 부호, 점자 빈칸만 있는 경우(H37-Q6). 보이는 글자가 섞이면 통과한다(textContent로만 나간다).
const NO_VISIBLE_TEXT=/^[\p{C}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}⠀]*$/u;
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
  if(NO_VISIBLE_TEXT.test(label)||[...label].length>MAX_NAME)throw questError('INVALID_LIFE_TEXT');
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
