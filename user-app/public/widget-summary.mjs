// P4C: Fold 홈 위젯 요약. 쌓인 기록으로 위젯이 그릴 숫자만 뽑아 허용 목록 JSON 하나를 만든다(다리 setWidgetSummary 로 넘김, native-bridge.mjs pushWidget).
// 시계·저장소·네트워크·DOM을 쓰지 않는다(at·today는 부르는 쪽이 준다). 기록을 쓰지 않는다.
// 칸은 WIDGET_KEYS 가 전부다: 오늘 벽돌/목표, 탑 층, 연속일·배수, 영역 최고 Lv, 오늘 XP/목표, 오늘 계획 3줄(시간대·과목 이름·완료/목표 장), 이번 주 장/목표, 비서 문구 코드, 갱신 시각.
// 금액·가게 이름·일기 글·메모·할 일 글자·건강 수치 칸은 없다. 계획 줄에서 글자는 과목 이름뿐이다(할 일 글자 title 은 싣지 않는다).
// 모르는 값은 null(0과 다르다, 위젯은 "—"). 앱(WidgetData.java)도 같은 목록으로 다시 검사하고 모르는 키가 있으면 요약 전체를 거부한다.
import {achieve} from './life-achieve.mjs';
import {todayPlanModel} from './plan-today.mjs';

export const WIDGET_VERSION=1;
export const WIDGET_KEYS=Object.freeze(['v','date','at','bricks','goal','floors','streak','mult10','area','level','xp','xpGoal','plan','week','tip']);
export const WIDGET_PLAN_KEYS=Object.freeze(['b','s','done','total']);
export const WIDGET_WEEK_KEYS=Object.freeze(['done','goal']);
export const WIDGET_TIP_KEYS=Object.freeze(['code','n']);
export const WIDGET_TIP_CODES=Object.freeze(['NONE','START','LEFT_N','DONE']);
export const WIDGET_AREAS=Object.freeze(['BODY','HEAD','MONEY','HEART']);
export const WIDGET_BLOCKS=Object.freeze(['M','A','E','N']);
export const WIDGET_LIMITS=Object.freeze({plan:3,subject:20});
// 위젯 단추가 여는 주소(앱 MainActivity → 웹 app.mjs WIDGET_ROUTES). 공부 화면은 열기만 하고 공부를 저절로 시작하지 않는다.
export const WIDGET_TABS=Object.freeze({study:'#w-study',today:'#w-today'});

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const isHalf=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max&&Number.isInteger(v*2);
const isWhole=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const half=(v,max)=>isHalf(v,max)?v:null;
const whole=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v))return null;const n=Math.round(v);return isWhole(n,min,max)?n:null;};
// 과목 이름: 제어 글자를 빼고 20자(UTF-16 단위, 앱과 같은 셈)까지. 반쪽 서로게이트로 끝나지 않게 자른다.
function subjectText(name){
  let s=String(name??'').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g,'').trim();
  if(s.length>WIDGET_LIMITS.subject){s=s.slice(0,WIDGET_LIMITS.subject);if(/[\ud800-\udbff]$/.test(s))s=s.slice(0,-1);}
  return s||'기타';
}
const BLOCK_ORDER=Object.fromEntries(WIDGET_BLOCKS.map((b,i)=>[b,i]));

// 비서 문구는 코드만 보낸다(문장은 앱이 고른다, 숫자만 끼움).
export function widgetTip(bricks,goal){
  if(bricks===null||goal===null||goal<=0)return {code:'NONE',n:null};
  if(bricks<=0)return {code:'START',n:null};
  if(bricks<goal)return {code:'LEFT_N',n:Math.min(999,Math.ceil(goal-bricks))};
  return {code:'DONE',n:null};
}

// ach = achieve() 결과, planRows = todayPlanModel().rows, today = 'YYYY-MM-DD'(KST), at = 갱신 시각(ms).
export function buildWidgetSummary({ach,planRows=[],today,at}){
  if(!DATE.test(today??''))throw new Error('BAD_TODAY');
  const day=ach?.todayDay??null,top=ach?.topArea??null,lv=top?ach.levels?.[top]?.level:null,week=ach?.currentWeek??null;
  const bricks=day&&day.date===today?half(day.value,999):null,goal=whole(ach?.goalBricks,0,999);
  const plan=[...(planRows??[])].map((r,i)=>({r,i})).filter(({r})=>WIDGET_BLOCKS.includes(r?.block)&&isHalf(r.bricks,99))
    .sort((a,b)=>BLOCK_ORDER[a.r.block]-BLOCK_ORDER[b.r.block]||a.i-b.i).slice(0,WIDGET_LIMITS.plan)
    .map(({r})=>({b:r.block,s:subjectText(r.name),done:half(Math.min(r.got??0,99),99)??0,total:r.bricks}));
  return {
    v:WIDGET_VERSION,date:today,at:whole(at,1,9999999999999),
    bricks,goal,
    floors:whole(ach?.weeks?.length,0,9999),
    streak:whole(ach?.streak?.days,0,99999),mult10:whole(ach?.streak?.mult10,10,99),
    area:WIDGET_AREAS.includes(top)?top:null,level:whole(lv,1,9999),
    xp:whole(day&&day.date===today?ach?.todayXp:null,0,999999),xpGoal:whole(ach?.goalXp,0,999999),
    plan,
    week:week&&isHalf(week.value,9999)&&isWhole(week.brickTarget,0,9999)?{done:week.value,goal:week.brickTarget}:null,
    tip:widgetTip(bricks,goal),
  };
}

// 쌓인 기록 → 요약. 화면이 쓰는 것과 같은 계산(achieve·오늘 계획 카드)을 그대로 쓴다.
export function widgetSummaryOf({life=null,study=null,fin=null,money=null,today,at}){
  const ach=achieve({life,study,fin,today,money});
  const m=todayPlanModel({life,study,date:today,today});
  return buildWidgetSummary({ach,planRows:m.rows,today,at});
}

// 허용 목록 검사(앱 WidgetData.parse 와 같은 규칙). 키가 정확히 같고 값 모양이 맞을 때만 true.
const exactKeys=(o,keys)=>Boolean(o)&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const nullOr=(v,ok)=>v===null||ok(v);
export function checkWidgetSummary(s){
  if(!exactKeys(s,WIDGET_KEYS))return false;
  if(s.v!==WIDGET_VERSION||!DATE.test(s.date)||!isWhole(s.at,1,9999999999999))return false;
  if(!nullOr(s.bricks,v=>isHalf(v,999))||!nullOr(s.goal,v=>isWhole(v,0,999))||!nullOr(s.floors,v=>isWhole(v,0,9999)))return false;
  if(!nullOr(s.streak,v=>isWhole(v,0,99999))||!nullOr(s.mult10,v=>isWhole(v,10,99))||!nullOr(s.area,v=>WIDGET_AREAS.includes(v)))return false;
  if(!nullOr(s.level,v=>isWhole(v,1,9999))||!nullOr(s.xp,v=>isWhole(v,0,999999))||!nullOr(s.xpGoal,v=>isWhole(v,0,999999)))return false;
  if(!Array.isArray(s.plan)||s.plan.length>WIDGET_LIMITS.plan)return false;
  for(const p of s.plan){
    if(!exactKeys(p,WIDGET_PLAN_KEYS)||!WIDGET_BLOCKS.includes(p.b)||typeof p.s!=='string'||!p.s.trim()||p.s.length>WIDGET_LIMITS.subject||/[\u0000-\u001f\u007f\u2028\u2029]/.test(p.s))return false;
    if(!isHalf(p.done,99)||!isHalf(p.total,99))return false;
  }
  if(!nullOr(s.week,w=>exactKeys(w,WIDGET_WEEK_KEYS)&&isHalf(w.done,9999)&&isWhole(w.goal,0,9999)))return false;
  return exactKeys(s.tip,WIDGET_TIP_KEYS)&&WIDGET_TIP_CODES.includes(s.tip.code)&&nullOr(s.tip.n,v=>isWhole(v,0,999));
}
