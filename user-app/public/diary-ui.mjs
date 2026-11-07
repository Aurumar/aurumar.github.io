// 일기 화면(FIX49B, D49 2·3·8장, 결정 ★2·★3·★5). 오늘 화면의 일기 입구 + 일기 시트(평가 → 글) + 지난 일기 + 기록 탭 날짜 보기의 일기 줄.
// 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style 없음). 시트는 body에 붙는 dialog라 오늘 화면을 다시 그려도(동기화) 글자가 끊기지 않는다.
// 쓰기: 입력은 이 기기 초안(상자 암호문 또는 메모리, 연산 0)에만 모이고 [저장] 1번 = LifeFlow(DIARY_KIND).confirm = 연산 1. 같은 내용이면 연산 0.
// 쓰기 문(lb.records.d46)이 닫혀 있으면 입구를 그리지 않는다(옛 "기분과 한 줄" 칸 그대로). 확정 직전에도 흐름이 문을 다시 본다.
// 기분은 오늘 카드 값 그대로(★3): 일기에는 기분 입력이 없고 자동 줄에 카드 기분을 보여 주기만 한다.
// 글은 알림·토스트·내보내기·이력 제목에 넣지 않는다. 화면 문구·상태 줄·저장 사유에도 글을 싣지 않는다. 지난 일기 글은 누를 때만 만든다(화면을 보는 사람 고려).
import {sheet} from './ui-kit.mjs';
import {LifeFlow,createLifePorts,DIARY_KIND,STACK_DONE} from './life-flow.mjs';
import {PLAN_NOTICE_TEXT,planErrorText} from './life-plan.mjs';
import {DIARY_GOOD_CHIPS,DIARY_BAD_CHIPS,MAX_DIARY_GOOD,MAX_DIARY_BAD,MAX_DIARY_TEXT,MAX_DIARY_TOMORROW,
  emptyDiary,recordsDoorState,lifeDefs,entryDone,sumBricks,shiftDay,kstDate,diaryOpenDate} from './life-model.mjs';

// 칩 글자(저장은 id만, D49 2.2). short = 칩 단추, full = 읽어 주는 글. 모르는 id(앞으로 생길 칩)는 "다른 항목".
export const GOOD_CHIP_TEXT=Object.freeze({focus:['집중','집중이 잘 됨'],wrong:['오답','오답을 제대로 봄'],hard:['버팀','어려운 걸 버팀'],start:['시작','미룬 일을 시작함'],calm:['마음','마음을 다스림'],
  rest:['쉼','제대로 쉼'],people:['사람','사람과 좋은 시간'],body:['몸','몸이 가벼움'],thanks:['고마움','고마운 일이 있음']});
export const BAD_CHIP_TEXT=Object.freeze({delay:['미룸','미룸'],phone:['폰·영상','폰·영상이 많았음'],drift:['집중 안 됨','집중이 안 됨'],overplan:['계획 과함','계획이 과했음'],
  tired:['피곤','많이 피곤함'],upset:['감정','감정이 흔들림'],conflict:['사람','사람 때문에 힘듦'],spend:['돈','돈을 아쉽게 씀']});
export const OTHER_CHIP='다른 항목';
export const chipLabel=(id,good)=>(good?GOOD_CHIP_TEXT:BAD_CHIP_TEXT)[id]?.[0]??OTHER_CHIP;
// 쓰기 도우미 질문(D49 3.1): 첫 아쉬운 칩 → 첫 잘한 칩 → 점수 구간. AI 호출 0, 저장 0.
export const DIARY_QUESTIONS=Object.freeze({
  delay:'미룬 일의 가장 작은 첫 단계는 뭐였을까요?',phone:'폰을 들기 직전에 무슨 기분이었나요?',drift:'언제부터 집중이 흐려졌나요?',overplan:'내일 하나만 뺀다면 뭘까요?',
  tired:'오늘 무엇이 가장 힘을 뺐나요?',upset:'그 감정에 이름을 붙이면 뭘까요?',conflict:'그때 하고 싶었던 말은 뭐였나요?',spend:'그 돈을 쓰기 전에 뭘 바랐나요?',
  focus:'오늘 집중이 잘 된 조건은 뭐였나요?',wrong:'오늘 본 오답에서 뭘 새로 알았나요?',hard:'무엇이 어려웠고 어떻게 버텼나요?',start:'시작하게 만든 건 뭐였나요?',
  calm:'무엇이 마음을 가라앉혔나요?',rest:'어떻게 쉬었더니 좋았나요?',people:'누구와의 어떤 순간이 좋았나요?',body:'몸이 가벼웠던 이유가 뭘까요?',thanks:'무엇이 고마웠나요?',
  low:'오늘 가장 무거웠던 건 뭐였나요?',mid:'오늘 기억해 두고 싶은 한 가지는요?',high:'오늘 왜 좋았는지 적어 볼까요?'});
export function pickQuestion(d){
  const q=DIARY_QUESTIONS,bad=(d?.bad??[]).find(x=>Object.hasOwn(q,x)&&DIARY_BAD_CHIPS.includes(x)),good=(d?.good??[]).find(x=>Object.hasOwn(q,x)&&DIARY_GOOD_CHIPS.includes(x));
  if(bad)return q[bad];if(good)return q[good];
  const s=d?.score??null;return s===null?q.mid:s<=2?q.low:s===3?q.mid:q.high;
}
export const DIARY_TEXT=Object.freeze({
  privacy:'저장 전에는 마음껏 고쳐도 기록에 남지 않아요. 저장한 뒤 고치면 이전 글이 암호화된 이력에 남아요.',   // ★2 소유자 안내 문구 그대로
  sync:'저장하면 4기기에 암호화되어 동기화돼요 · 비서에게는 보내지 않아요',
  noBox:'이 환경에는 임시 저장 상자가 없어 저장 전에 앱을 닫으면 입력이 사라집니다.',
  none:'아직 안 썼어요',draft:'이 기기에만 있는 임시 입력 · 아직 저장 전',typing:'입력 중 (아직 저장 전)',boxSaved:'이 기기에 저장됨 · 아직 저장 전 · 다른 기기에서는 안 보임',
  saved:'일기를 저장했어요 · 4기기에 암호화되어 동기화돼요',same:'바뀐 것이 없어 저장하지 않았어요',
  habit:' · 습관 "일기"를 켰어요(오늘 쌓기 때 함께 쌓여요)',
  habitYesterday:' · 습관 "일기"를 어제 카드에 켰어요(어제 카드 쌓기로 함께 쌓여요)',
  scoreFirst:'하루 점수를 먼저 골라 주세요.',
});
// FIX50A (HUNT49 A2): 습관은 일기 날짜의 카드에 켠다(00:00~03:59에 쓴 어제 일기 = 어제 카드). [오늘 쌓기]는 달력 오늘 카드만 쌓으므로 안내도 그 카드를 말한다.
// 오늘 화면의 "어제 카드를 아직 쌓지 않았어요 · [어제 카드 쌓기]" 줄(life-ui)과 같은 이름을 쓴다.
export function diaryHabitText(date,today){
  if(date===today)return DIARY_TEXT.habit;
  if(date===shiftDay(today,-1))return DIARY_TEXT.habitYesterday;
  return ' · 습관 "일기"를 '+dateText(date)+' 카드에 켰어요('+dateText(date)+' 카드 쌓기로 함께 쌓여요)';
}
const STATUS_TEXT=Object.freeze({
  UNKNOWN:'서버 응답을 확인하지 못했어요 · 입력은 이 기기에 그대로 있어요. 다시 저장을 누르면 결과를 확인한 뒤 이어서 처리해요(중복 저장 없음).',
  SYNC_FAILED:'서버에서 최신 기록을 받지 못했어요 · 입력은 이 기기에 그대로 있어요.',FAILED:'저장하지 못했어요 · 입력은 이 기기에 그대로 있어요.',
  STALE:'다른 기기와 계속 겹쳐 저장하지 못했어요 · 입력은 그대로 있어요.',
});
export const DIARY_ERROR_TEXT=Object.freeze({
  RECORDS_DOOR_CLOSED:'아직 새 기록이 꺼져 있어 일기를 저장하지 않았어요 · 설정에서 4기기 업데이트를 확인하고 켜 주세요. 입력은 이 기기에 그대로 있어요.',
  DIARY_SCORE_REQUIRED:DIARY_TEXT.scoreFirst,
  MD_NOT_WRITE_READY:'지금은 서버에 저장할 수 없어요 · 입력은 이 기기에 그대로 있어요.',
  STALE_HEADS:'다른 기기에서 먼저 바뀌었어요 · 다시 저장하면 받아 합친 뒤 저장해요.',
});
export const diaryErrorText=code=>DIARY_ERROR_TEXT[code]??planErrorText(code);
const MOOD_TEXT=Object.freeze({1:'😞 많이 힘듦',2:'🙁 별로',3:'😐 보통',4:'🙂 좋음',5:'😄 아주 좋음'});
const WEEKDAY=['일','월','화','수','목','금','토'];
const dateText=d=>{const t=new Date(d+'T12:00:00Z');return (t.getUTCMonth()+1)+'월 '+t.getUTCDate()+'일 ('+WEEKDAY[t.getUTCDay()]+')';};
const hoursText=m=>{const h=Math.floor(m/60),r=m%60;return (h?h+'시간':'')+(h&&r?' ':'')+(r||!h?r+'분':'');};
const charCount=s=>[...String(s??'')].length;
// FIX50A (HUNT49 A4): 글자 수 상한은 검사기·글자 수 표시와 같은 코드 포인트로 센다(입력 처리기에서 자른다). HTML maxlength는 UTF-16 단위라
// 코드 포인트 1개 = 최대 2단위인 2배 값을 바깥 울타리로만 둔다(이모지 글이 1,000자에서 막히지 않게). 8KB 한도는 저장 때 검사기가 본다(원인 안내).
// FIX51A (HUNT50 A4): 자르는 자리는 글자 묶음(국기·ZWJ 가족·결합 문자·한글 첫가끝) 경계다. 한도는 그대로 코드 포인트(검사기와 같은 셈)라 결과가 한도보다 짧을 수 있다.
// week-review clipPick(FIX50B C2)과 같은 규칙이고 한도를 인자로 받는다(주간 리뷰는 이미 이 파일을 불러오므로 그대로 쓸 수 있다).
// whole = 칸 전체 한도(남은 칸만큼 자를 때 max보다 크다). 첫 묶음 하나가 whole보다 큰 글(결합 부호 쌓기)만 코드 포인트로 자른다. 남은 칸보다 큰 묶음은 넣지 않는다(빈 값).
const SEGMENTER=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function clipGraphemes(s,max,whole=max){
  const t=String(s??'');
  if([...t].length<=max)return t;
  if(!SEGMENTER)return [...t].slice(0,max).join('');
  let out='',n=0;
  for(const {segment} of SEGMENTER.segment(t)){const c=[...segment].length;if(n+c>max){if(!n&&c>whole)out=[...segment].slice(0,max).join('');break;}out+=segment;n+=c;}
  return out;
}
export const clipChars=clipGraphemes;
// FIX51A (HUNT50 A3): 한도를 넘는 입력은 이미 쓴 글을 자르지 않고 새로 들어온 부분만 자른다(가득 찬 글의 앞·가운데에 넣거나 붙여 넣어도 뒷부분이 남는다).
// prev = 입력 전 값, next = 브라우저가 바꾼 값, caret = 입력 뒤 커서(UTF-16, 모르면 null). 넣은 글은 커서에서 끝나므로 커서 뒤 글 = 입력 전 글의 끝이다.
// 커서를 모르면(시험의 가짜 DOM) 앞·뒤의 같은 부분을 찾는다. 지운 부분과 남은 뒷부분의 경계가 같은 글자가 이어진 곳이면 어디서 갈렸는지 알 수 없어 경계를 뒤로 민다(새 입력의 끝을 자른다).
// 돌려주는 값 = {value, caret(자른 뒤 새 커서, UTF-16)}.
export function clipInsert(prev,next,max,caret=null){
  const p0=String(prev??''),n0=String(next??'');
  if([...n0].length<=max)return {value:n0,caret:null};
  const A=[...p0],B=[...n0];
  let pre=0,suf=-1;
  if(Number.isInteger(caret)&&caret>=0&&caret<=n0.length&&!(n0.charCodeAt(caret)>=0xDC00&&n0.charCodeAt(caret)<=0xDFFF)){const tail=n0.slice(caret);if(tail.length<=p0.length&&p0.endsWith(tail))suf=[...tail].length;}
  if(suf>=0){const cap=Math.min(A.length,B.length)-suf;while(pre<cap&&A[pre]===B[pre])pre++;}
  else{
    const lim=Math.min(A.length,B.length);
    while(pre<lim&&A[pre]===B[pre])pre++;
    suf=0;while(suf<lim-pre&&A[A.length-1-suf]===B[B.length-1-suf])suf++;
    while(suf>0&&A.length-suf>pre&&A[A.length-suf-1]===A[A.length-suf])suf--;
  }
  const room=max-pre-suf;
  if(room<0)return {value:clipGraphemes(n0,max),caret:null};   // 입력 전 글이 이미 한도를 넘었던 경우(정상 경로에는 없음)
  // FIX52B (HUNT51 HA1·HA2): 뒷글이 있으면 한도보다 큰 단일 묶음도 코드 포인트로 자르지 않는다(빈 값). 자른 조각과 뒷글을 이은 자리는 묶음 경계여야 한다:
  // 뒷글 첫 묶음이 입력 전과 달라지면(외톨이 지역 표시 문자·ZWJ·첫소리 자모가 뒷글과 붙음) 조각의 마지막 묶음을 하나씩 뺀다. Segmenter가 없으면 예전대로.
  // 넣은 글 없이 이어도 이미 다르면(지운 부분이 뒷글과 묶여 있었음) 넣은 글 탓이 아니므로 보지 않는다.
  const head=B.slice(0,pre).join(''),ins=B.slice(pre,B.length-suf).join(''),tail=B.slice(B.length-suf).join('');
  let mid=clipGraphemes(ins,room,tail?Infinity:max);
  const want=tail&&SEGMENTER&&mid!==ins?tailHead(p0.slice(0,p0.length-tail.length),tail):null;
  if(want!==null&&tailHead(head,tail)===want){
    const parts=[...SEGMENTER.segment(mid)].map(x=>x.segment);
    while(parts.length&&tailHead(head+parts.join(''),tail)!==want)parts.pop();
    mid=parts.join('');
  }
  return {value:head+mid+tail,caret:head.length+mid.length};
}
// 앞글 before 뒤에 붙인 tail의 첫 묶음(이은 자리에 걸친 묶음이면 표시를 붙인다). 이은 자리가 경계이고 첫 묶음이 같으면 뒷글의 묶음은 그대로다.
function tailHead(before,tail){
  for(const {segment,index} of SEGMENTER.segment(before+tail))if(index+segment.length>before.length)return (index<before.length?'~':'=')+segment.slice(before.length-Math.min(index,before.length));
  return '';
}
const unitCap=max=>String(max*2);
const storageOf=ctx=>{try{return ctx.storage??globalThis.localStorage??null;}catch{return null;}};

// 일기 날짜(D49 3장): 00:00~03:59(KST)에는 어제 일기를 연다(취침 목표 24:00). 그 앞날은 새로 쓰지 않는다(이 기기 초안만 이어서 저장).
// FIX50A (HUNT49 C1): 04:00 경계는 life-model diaryOpenDate 한 곳에 있다. 보상 엔진의 "오늘"은 00:00 경계이고, 일기 연속만 atDiaryDay(life-achieve)로 이 날짜를 따른다.
export function diaryDateOf(nowIso){
  const today=kstDate(nowIso),date=diaryOpenDate(nowIso);
  return {date,today,late:date!==today};
}
export const diaryDoorOpen=ctx=>{const w=ctx.getWhole();return recordsDoorState({life:w?.life??null,study:w?.study??null,storage:storageOf(ctx)}).open;};
// 입구·지난 일기 줄의 요약. 글은 넣지 않고 "글 있음"만.
export function diarySummaryText(d){
  if(!d)return '일기 없음';
  return [d.score===null?'점수 없음':'점수 '+d.score,d.energy===null?null:'에너지 '+d.energy,d.good.length?'잘한 것 '+d.good.length:null,d.bad.length?'아쉬운 것 '+d.bad.length:null,d.text.trim()?'글 있음':'글 없음'].filter(Boolean).join(' · ');
}
// 자동 줄(D49 2.1, 입력 0·저장 0). 없는 값은 0이 아니라 "기록 없음". card = 그날 오늘 카드(초안 포함, 없으면 null), studyCard = 그날 공부 카드(초안 포함, 없으면 null).
// plan = daySummary 결과({planned,rate}) 또는 null, health = 수면·걸음 한 줄(건강 모듈이 꺼져 있으면 null).
const FACT_HABITS=Object.freeze(['hb-wake','hb-sun','hb-workout','hb-nolate']);
export function autoFacts({defs,card=null,studyCard=null,plan=null,health=null}){
  const out=[],has=(key,text)=>out.push({key,text,none:false}),none=(key,label)=>out.push({key,text:label+' 기록 없음',none:true});
  if(card&&card.mood!==null&&card.mood!==undefined)has('mood','기분 '+MOOD_TEXT[card.mood]);else none('mood','기분');
  for(const id of FACT_HABITS){
    const h=defs.habits.find(x=>x.id===id);if(!h||h.hidden)continue;
    const e=card?.habits?.[id]??null;
    if(!entryDone(h,e)){none(id,h.name);continue;}
    has(id,h.name+' '+(h.kind==='TIME'?e.at:h.kind==='DURATION'?e.minutes+'분':h.kind==='COUNT'?e.count+'회':'했음'));
  }
  const mins=(studyCard?.sessions??[]).map(s=>s.confirmedMin).filter(m=>m>0);
  if(!studyCard||!(studyCard.sessions?.length))none('study','공부');
  else{const b=sumBricks(mins);has('study','공부 '+hoursText(mins.reduce((a,m)=>a+m,0))+' · 벽돌 '+b.bricks+'장'+(b.pieces?' + 조각 '+b.pieces:''));}
  if(studyCard&&Array.isArray(studyCard.reviews))has('reviews','복습 '+studyCard.reviews.length+'건');
  if(plan&&plan.planned>0&&typeof plan.rate==='number')has('plan','계획 '+Math.round(plan.rate*100)+'%');else none('plan','계획');
  if(health)has('health',health);
  return out;
}

// 오늘 카드의 습관 "일기"(hb-diary)를 그날 초안에 켠다(D49 4.3, 연산 0, "오늘 쌓기"로 함께 쌓임). 숨김·없음·이미 켜짐·종류가 체크가 아니면 건드리지 않는다.
export async function markDiaryHabit({flow,life,date}){
  const h=lifeDefs(life).habits.find(x=>x.id==='hb-diary');
  if(!flow||!h||h.hidden||h.kind!=='CHECK')return false;
  const card=(await flow.state(date)).card;
  if(entryDone(h,card.habits['hb-diary']??null))return false;
  await flow.setHabit(date,'hb-diary',{done:true,at:null,minutes:null,count:null});
  return true;
}

// ---- 흐름 준비(오늘 화면 prepareLife가 부른다) ----
export function ensureDiaryFlow(ctx,st){
  if(!st.diaryFlow||st.diaryPortsOf!==st.ports){st.diaryPortsOf=st.ports;st.diaryPorts=createLifePorts(ctx,DIARY_KIND);st.diaryFlow=new LifeFlow(st.diaryPorts,DIARY_KIND);}
  return st.diaryFlow;
}
// 입구 상태. 문이 닫혀 있으면 {open:false}(화면은 옛 칸 그대로). pending = 이 기기에만 있는 다른 날짜 초안(오래된 순, 최대 3).
export async function diaryEntryState(ctx,st){
  if(!diaryDoorOpen(ctx))return {open:false};
  const flow=ensureDiaryFlow(ctx,st),{date,today,late}=diaryDateOf(ctx.now());
  const [s,dates]=await Promise.all([flow.state(date),flow.draftDates()]);
  return {open:true,date,today,late,status:s.status,card:s.card,pending:dates.filter(d=>d!==date).slice(-3)};
}

function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  return {el,add,button};
}
const yesterdayOf=(life,date)=>(life?.diaries??[]).find(x=>x.date===shiftDay(date,-1))?.data??null;

// ---- 오늘 화면의 일기 입구(D49 8.1). opts.open(date) = 시트 열기(오늘 화면이 넘긴다) ----
export function renderDiaryEntry(ctx,st,{open}){
  const d=st.diary;if(!d?.open)return null;
  const {el,add,button}=maker(ctx.document??globalThis.document),life=ctx.getWhole().life??null;
  const out=el('section',null,'diary-entry');out.id='diary-entry';
  const label=d.status==='NONE'?'쓰기':d.status==='LOCAL_DRAFT'?'이어서 쓰기':'고치기';
  // FIX52C (Codex R4): 기본 입구는 누를 때 일기 날짜를 다시 계산한다(03:59에 그린 화면을 04:01에 눌러도 새 날짜). 날짜를 적은 입구(지난 초안 열기)는 그 날짜 그대로.
  const go=button(label,()=>open(diaryDateOf(ctx.now()).date),'primary diary-open');go.dataset.navOnly='1';go.setAttribute('aria-label',(d.late?'어제':'오늘')+' 일기 '+label);
  add(out,add(el('div',null,'diary-entry-head'),el('h3',d.late?'어제 일기':'오늘 일기'),go),
    el('p',d.status==='NONE'?DIARY_TEXT.none:d.status==='LOCAL_DRAFT'?DIARY_TEXT.draft:diarySummaryText(d.card),'muted small diary-entry-state'));
  const prev=yesterdayOf(life,d.date);
  if(prev?.tomorrow?.trim())add(out,el('p','어제 정한 한 가지: '+prev.tomorrow,'diary-entry-tomorrow'));
  for(const p of d.pending){const name=p===shiftDay(d.date,-1)?'어제':dateText(p);const b=button(name+' 일기 열기',()=>open(p),'secondary');b.dataset.navOnly='1';add(out,add(el('div',null,'notice diary-pending'),el('span',name+' 일기를 아직 저장하지 않았어요 · 이 기기에만 있어요. '),b));}
  if(st.diaryMessage)add(out,el('p',st.diaryMessage.text,st.diaryMessage.error?'notice error diary-message':'notice diary-message'));
  for(const n of st.diaryNotices??[])add(out,el('p',PLAN_NOTICE_TEXT[n.code]??'알림을 읽지 못했어요','notice diary-notice'));
  return out;
}

// ---- 일기 시트(D49 8.2·8.3·8.5). Fold 접음(760 미만)은 1단계 평가 → 2단계 글, 760 이상은 2열 한 화면(단계 단추는 CSS로 숨김) ----
// opts: {plan(date) → daySummary 결과|null, health(date) → 한 줄|null, lifeFlow(오늘 카드 흐름), today}
export async function openDiarySheet(ctx,st,date,opts={}){
  const flow=ensureDiaryFlow(ctx,st),box=st.diaryPorts?.box??null,doc=ctx.document??globalThis.document,{el,add,button}=maker(doc);
  const whole=ctx.getWhole(),life=whole.life??null,defs=lifeDefs(life);
  const s=await flow.state(date),work=structuredClone(s.card);
  // FIX50A (HUNT49 A1): 시트를 연 시점의 판. 초안이 없던 날은 첫 입력의 초안을 이 판 위에 만든다(그 사이 다른 기기가 저장했으면 확정 때 칸별로 합친다).
  const from=s.status==='LOCAL_DRAFT'?null:{heads:[...s.baseHeads],card:structuredClone(s.card)},touched=new Set();
  // 자동 줄의 재료(읽기만): 그날 오늘 카드·공부 카드(초안 포함)
  let card=null,studyCard=null;
  try{const ls=await opts.lifeFlow?.state(date);card=ls&&ls.status!=='NONE'?ls.card:null;}catch{card=null;}
  if(date===st.today&&st.studyCard)studyCard=st.studyCard.status==='NONE'?null:st.studyCard.card;
  else studyCard=(whole.study?.days??[]).find(x=>x.date===date)?.data??null;
  st.diaryMessage=null;st.diaryNotices=[];
  const facts=autoFacts({defs,card,studyCard,plan:opts.plan?.(date)??null,health:opts.health?.(date)??null});

  const body=el('div',null,'diary-body');
  const state=el('p',null,'muted small diary-state'),err=el('p',null,'notice error diary-error');err.hidden=true;
  const stateText=()=>{const b=box?.statusFor(DIARY_KIND.type,date);if(b?.typing)return DIARY_TEXT.typing;if(b?.has)return b.dirty&&b.own?(box.ERROR_TEXT[b.own]??box.TEXT.failed):DIARY_TEXT.boxSaved;return s.status==='CONFIRMED'?'저장된 일기 · 고치면 다시 저장할 수 있어요':s.status==='LOCAL_DRAFT'?DIARY_TEXT.draft:'아직 저장 전';};
  const showErr=text=>{err.textContent=text;err.hidden=false;};
  // 입력 → 초안(연산 0). 시트에서 사용자가 실제로 건드린 칸만 쓴다(FIX50A A1: 시트를 연 뒤 다른 기기가 바꾼 칸을 연 시점 값으로 덮지 않는다). 마지막 입력이 이김, 600ms 디바운스. 상자가 없으면 메모리 초안.
  const apply=c=>{for(const k of touched)c[k]=Array.isArray(work[k])?[...work[k]]:work[k];};
  const touch=k=>{touched.add(k);persist();};
  const opened=(o={})=>({...o,from});   // 흐름 edit 옵션 + 시트를 연 시점의 판
  let memTimer=null,memChain=Promise.resolve();
  const persist=()=>{
    if(box){box.defer(DIARY_KIND.type+'|'+date+'|sheet',async input=>{try{await flow.edit(date,apply,opened({input}));}catch(e){showErr(box.ERROR_TEXT[e?.code]??diaryErrorText(e?.code));}state.textContent=stateText();},{owned:true});state.textContent=stateText();return;}
    clearTimeout(memTimer);memTimer=setTimeout(()=>{memChain=memChain.then(()=>flow.edit(date,apply,opened())).catch(e=>showErr(diaryErrorText(e?.code)));},600);
  };
  const flushNow=async()=>{if(box){try{await box.flush();}catch{/* 다른 초안의 실패는 저장을 막지 않는다: 아래 edit가 이 화면 값을 직접 쓴다 */}}else{clearTimeout(memTimer);await memChain;}};

  // 1단계: 자동 줄 + 점수·에너지 + 칩
  const auto=add(el('div',null,'diary-auto'),el('strong',date===opts.today?'오늘 기록':dateText(date)+' 기록','diary-auto-title'));
  for(const f of facts)add(auto,el('span',f.text,'diary-fact'+(f.none?' none':'')));
  const scale=(name,key,hintText)=>{
    const row=el('div',null,'diary-scale'),btns=[];
    for(let v=1;v<=5;v++){const b=button(String(v),()=>{work[key]=work[key]===v?null:v;paint();touch(key);},'diary-num');b.setAttribute('aria-label',name+' '+v);btns.push([v,b]);add(row,b);}
    return {node:add(el('div',null,'diary-field'),add(el('div',null,'diary-field-head'),el('span',name,'diary-label'),hintText?el('span',hintText,'muted small'):null),row),btns,key};
  };
  const score=scale('하루 점수','score','1 힘든 하루 · 5 좋은 하루'),energy=scale('에너지','energy','선택');
  const chipRow=(name,ids,key,max,good)=>{
    const row=el('div',null,'diary-chips'),btns=[];
    for(const id of ids){const b=button(chipLabel(id,good),()=>{const list=work[key];if(list.includes(id))work[key]=list.filter(x=>x!==id);else if(list.length<max)work[key]=[...list,id];else{showErr(name+'은 '+max+'개까지 고를 수 있어요.');return;}err.hidden=true;paint();touch(key);},'lb-chip diary-chip');
      b.setAttribute('aria-label',name+': '+(good?GOOD_CHIP_TEXT:BAD_CHIP_TEXT)[id][1]);btns.push([id,b]);add(row,b);}
    for(const id of work[key].filter(x=>!ids.includes(x))){const b=button(OTHER_CHIP,()=>{work[key]=work[key].filter(x=>x!==id);paint();touch(key);},'lb-chip diary-chip');b.setAttribute('aria-label',name+': '+OTHER_CHIP);btns.push([id,b]);add(row,b);}   // 다른 기기의 새 칩: 지우기만
    return {node:add(el('div',null,'diary-field'),add(el('div',null,'diary-field-head'),el('span',name+' ('+max+'개까지)','diary-label')),row),btns,key};
  };
  const good=chipRow('잘한 것',DIARY_GOOD_CHIPS,'good',MAX_DIARY_GOOD,true),bad=chipRow('아쉬운 것',DIARY_BAD_CHIPS,'bad',MAX_DIARY_BAD,false);

  // 2단계: 질문 + 글 + 내일 한 가지
  const question=el('p',null,'diary-question');
  const text=el('textarea',null,'diary-text');text.value=work.text;text.setAttribute('aria-label','일기 글');text.setAttribute('maxlength',unitCap(MAX_DIARY_TEXT));text.setAttribute('rows','8');
  const count=el('p',null,'muted small diary-count');
  const tomorrow=el('input',null,'diary-tomorrow');tomorrow.type='text';tomorrow.value=work.tomorrow;tomorrow.setAttribute('aria-label','내일 한 가지');tomorrow.setAttribute('maxlength',unitCap(MAX_DIARY_TOMORROW));tomorrow.setAttribute('placeholder','내일 한 가지 (선택, '+MAX_DIARY_TOMORROW+'자)');
  // FIX52B (HUNT51 HA-S2): 브라우저는 값을 넣을 때 줄바꿈을 바꾼다(textarea \r\n → \n, 한 줄 입력은 줄바꿈 제거). 자르기의 "입력 전 값"이 화면 값과 같게 맞춘다(건드린 칸만 저장하므로 저장 값은 그대로).
  work.text=text.value;work.tomorrow=tomorrow.value;
  const paintCount=()=>{const n=charCount(text.value);count.textContent=n.toLocaleString('ko-KR')+' / '+MAX_DIARY_TEXT.toLocaleString('ko-KR')+'자';count.hidden=n<1800;};   // 글자 수는 1,800자부터(양을 부추기지 않게)
  // FIX51A (HUNT50 A3): prev = 이 칸의 직전 값(work). 넘친 입력은 새로 들어온 부분만 자르고 커서를 그 자리에 둔다.
  const clipInput=(n,max,prev)=>{const r=clipInsert(prev,n.value,max,typeof n.selectionEnd==='number'?n.selectionEnd:null);if(r.value!==n.value){n.value=r.value;if(r.caret!==null&&typeof n.setSelectionRange==='function')n.setSelectionRange(r.caret,r.caret);}return r.value;};
  text.addEventListener('input',()=>{work.text=clipInput(text,MAX_DIARY_TEXT,work.text);paintCount();paintSave();touch('text');});
  tomorrow.addEventListener('input',()=>{work.tomorrow=clipInput(tomorrow,MAX_DIARY_TOMORROW,work.tomorrow);touch('tomorrow');});

  let dlg=null,step=1,busy=false;
  const save=async()=>{
    if(busy)return;
    if(work.score===null){showErr(DIARY_TEXT.scoreFirst);setStep(1);return;}   // ★5: 점수는 화면에서 필수(검사기는 null을 받는다, FIX49A 판단)
    busy=true;err.hidden=true;
    const run=async()=>{
      await flushNow();
      // FIX50A (HUNT49 A3): 입력을 초안에 담지 못했으면(검사 거절·상자 실패) 이 화면 입력은 아직 어디에도 없다. "입력은 그대로 있어요" 대신 원인을 보여 준다(시트·입력은 그대로 둔다).
      try{await flow.edit(date,apply,opened());}
      catch(e){showErr(box?.ERROR_TEXT[e?.code]??diaryErrorText(e?.code));state.textContent=stateText();return;}
      let r;
      try{r=await flow.confirm(date);}catch(e){r={status:'FAILED',code:e?.code};}
      if(STACK_DONE.includes(r.status)||r.status==='NOTHING_TO_CONFIRM'){
        if(r.status!=='NOTHING_TO_CONFIRM')await ctx.reload?.();
        let habit=false;
        if(r.status!=='NOTHING_TO_CONFIRM'){try{habit=await markDiaryHabit({flow:opts.lifeFlow,life:ctx.getWhole().life??null,date});}catch{habit=false;}}
        // FIX52B (HUNT51 HF2): 쓰지 않았으면(바뀐 것 없음) 겹침 알림을 그리지 않는다.
        st.diaryMessage={text:(r.status==='NOTHING_TO_CONFIRM'?DIARY_TEXT.same:DIARY_TEXT.saved)+(habit?diaryHabitText(date,kstDate(ctx.now())):''),error:false};st.diaryNotices=r.status==='NOTHING_TO_CONFIRM'?[]:r.notices??[];
        dlg?.close?.();
        await opts.after?.();
        return;
      }
      showErr(r.code&&(DIARY_ERROR_TEXT[r.code]||r.status==='REJECTED')?diaryErrorText(r.code):STATUS_TEXT[r.status]??diaryErrorText(r.code));
      state.textContent=stateText();
    };
    try{if(ctx.perform)await ctx.perform(run);else await run();}finally{busy=false;}
  };
  const saveRate=button('글 없이 저장',()=>void save(),'primary diary-save diary-save-rate');
  const next=button('다음: 글 쓰기',()=>setStep(2),'secondary diary-next');
  const back=button('‹ 평가로',()=>setStep(1),'secondary diary-back');
  const saveWrite=button('일기 저장',()=>void save(),'primary diary-save diary-save-write');
  const saveWide=button('일기 저장',()=>void save(),'primary diary-save diary-save-wide');
  function paintSave(){saveRate.textContent=work.text.trim()?'일기 저장':'글 없이 저장';}
  function paint(){
    for(const f of [score,energy])for(const [v,b] of f.btns){const on=work[f.key]===v;b.className='diary-num'+(on?' selected':'');b.setAttribute('aria-pressed',String(on));}
    for(const f of [good,bad])for(const [id,b] of f.btns){const on=work[f.key].includes(id);b.className='lb-chip diary-chip'+(on?' selected':'');b.setAttribute('aria-pressed',String(on));}
    question.textContent=pickQuestion(work);paintSave();
  }
  function setStep(n){step=n;if(dlg)dlg.dataset.step=String(step);}

  const rate=add(el('section',null,'diary-step diary-rate'),auto,score.node,energy.node,good.node,bad.node,add(el('div',null,'diary-actions diary-actions-rate'),saveRate,next));
  const write=add(el('section',null,'diary-step diary-write'),add(el('div',null,'diary-actions diary-actions-write'),back,saveWrite),question,text,count,
    add(el('label',null,'diary-field diary-tomorrow-field'),el('span','내일 한 가지 (선택)','diary-label'),tomorrow),el('p',DIARY_TEXT.privacy,'muted small diary-privacy'),el('p',DIARY_TEXT.sync,'muted small'));
  add(body,state,st.diaryPorts?.persistent===false?el('p',DIARY_TEXT.noBox,'notice error'):null,add(el('div',null,'diary-cols'),rate,write),add(el('div',null,'diary-actions diary-actions-wide'),saveWide),err,pastDiaries(ctx,{el,add,button},life,date));
  paint();paintCount();state.textContent=stateText();
  dlg=sheet(dateText(date)+' 일기',body);
  dlg.className=String(dlg.className??'')+' diary-sheet';setStep(1);
  return dlg;
}

// ---- 지난 일기(D49 3.3): 날짜·점수·칩만 보이는 목록. 글은 [글 보기]를 눌러야 만든다. 쌓인 일기만(초안 아님), 최근 30개 ----
function pastDiaries(ctx,{el,add,button},life,current){
  const rows=(life?.diaries??[]).filter(x=>x.date!==current).slice(0,30);
  const box=add(el('details',null,'diary-past'),el('summary','지난 일기 '+rows.length+'개'));
  if(!rows.length)add(box,el('p','아직 저장한 지난 일기가 없어요.','muted small'));
  for(const r of rows)add(box,diaryRow({el,add,button},r.date,r.data,dateText(r.date)));
  return box;
}
function diaryRow({el,add,button},date,d,title){
  const chips=[...d.good.map(id=>chipLabel(id,true)),...d.bad.map(id=>chipLabel(id,false))].join(', ');
  const row=add(el('div',null,'diary-row'),add(el('div',null,'diary-row-main'),el('strong',title),el('span',diarySummaryText(d)+(chips?' · '+chips:''),'muted small')));
  if(d.text.trim()||d.tomorrow.trim()){
    const slot=el('div',null,'diary-row-text');
    const show=button('글 보기',()=>{
      if(slot.children?.length){slot.replaceChildren();show.textContent='글 보기';return;}
      add(slot,d.text.trim()?el('p',d.text,'diary-row-body'):null,d.tomorrow.trim()?el('p','내일 한 가지: '+d.tomorrow,'muted small'):null);show.textContent='글 접기';
    },'secondary diary-row-show');
    show.dataset.navOnly='1';show.setAttribute('aria-label',date+' 일기 글 보기');
    add(row,show,slot);
  }
  return row;
}
// 기록 탭 날짜 보기(renderPastDays)의 일기 줄. 문이 닫혀 있고 그날 일기도 없으면 그리지 않는다(옛 화면 그대로).
export function diaryDayRow(ctx,date){
  const life=ctx.getWhole().life??null,d=(life?.diaries??[]).find(x=>x.date===date)?.data??null;
  if(!d&&!diaryDoorOpen(ctx))return null;
  const h=maker(ctx.document??globalThis.document);
  if(!d)return h.add(h.el('div',null,'row diary-day-row'),h.add(h.el('div',null,'row-main'),h.el('strong','일기'),h.el('p','이날 저장한 일기가 없습니다.','muted small')));
  const row=diaryRow(h,date,d,'일기');row.className='row diary-row diary-day-row';
  return row;
}
export {emptyDiary};
