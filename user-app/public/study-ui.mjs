// 공부 모듈 화면(B4). 합성 데이터로만 시험한다. B38부터 기본 켜짐(저장값 없음=켜짐, '0'만 꺼짐). 꺼진 기기에는 화면·메뉴가 나타나지 않고, 켜져 있어도 사용자 동작 없이 새 기록을 쓰지 않는다.
// 스위치 위치(결정): 이 기기의 로컬 설정(localStorage) — hlt-ui와 같은 이유(금고 공유로 두면 아직 갱신하지 않은 기기가 HOLD). 저장소가 막혀 있으면 이번 실행 동안만 유지한다.
// 화면 규칙: DOM 생성 함수만 쓴다(innerHTML·인라인 style·외부 라이브러리 없음). 문제 본문·정답·해설을 넣는 칸은 없다 — 출처 표기+번호, 오답 원인 코드, 메모(100자)뿐.
// 복습 알림은 앱 안 표시까지(건수·밀린 복습을 복습 목록 맨 위에). 휴대폰 푸시 알림은 만들지 않았다.
import {StudyFlow,shownCard} from './study-flow.mjs';
import {projectStudy} from './study-projection.mjs';
import {reviewSummary,defaultReviewDue} from './study-schedule.mjs';
import {SUBJECTS,SESSION_STATES,PROVENANCE,BOOK_TAG,MAX_BOOK,ERROR_CODES,EVIDENCE_STATUS,RESULTS,MAX_LOCATOR,MAX_NOTE,kstDate,shiftDay,dateKeyOK,bookRefFrom,bookRefText} from './study-model.mjs';

export const STUDY_SWITCH_KEY='lb.study.enabled';
let memorySwitch=true;   // B38: 저장값이 없으면 켜짐(명시적으로 끈 기기만 '0'으로 꺼짐)
export function studyEnabled(storage=globalThis.localStorage){try{const v=storage?.getItem(STUDY_SWITCH_KEY);return v===null||v===undefined?memorySwitch:v==='1';}catch{return memorySwitch;}}
export function setStudyEnabled(on,storage=globalThis.localStorage){memorySwitch=Boolean(on);try{storage?.setItem(STUDY_SWITCH_KEY,on?'1':'0');}catch{/* 저장소가 막혀 있으면 이번 실행 동안만 */}return studyEnabled(storage);}

// FIX44 (AUD1 #5): 화면 글자만 쉬운 말로 바꾼다. 저장 값(과목 코드·출처 표기·원인 코드)은 그대로다.
export const ITEM_NUMBER_GUIDE='번호만: 예) 2026-06 평가원 12번 → KICE:2026-06-12';
export const SUBJECT_TEXT=Object.freeze({K:'국어',M:'수학',E:'영어',H:'한국사',S:'통합사회',C:'통합과학·생물'});   // 오답·입력 칸의 C에는 생물이 함께 들어 있다(칸 추가는 소유자 확인 대기). 세션은 id로 나눈다.
export const ERROR_CODE_TEXT=Object.freeze({
  'K-FACT':'국어: 내용 확인','K-REL':'국어: 관계 파악','K-INF':'국어: 추론','K-OPT':'국어: 선지 판단','K-TIME':'국어: 시간 부족',
  'M-CONCEPT':'수학: 개념 부족','M-MODEL':'수학: 식 세우기','M-ALG':'수학: 계산','M-COND':'수학: 조건 놓침','M-TRANSFER':'수학: 응용',
  'E-VOCAB':'영어: 어휘','E-SYNTAX':'영어: 구문','E-LOGIC':'영어: 글의 논리','E-LISTEN':'영어: 듣기',
  'I-CONCEPT':'탐구: 개념 부족','I-CAUSE':'탐구: 원인·결과','I-DATA':'탐구: 자료 해석','I-TRANSFER':'탐구: 응용',
  'X-NOT_STARTED':'공통: 시작 못 함','X-INTERRUPTED':'공통: 풀다 끊김','X-SOURCE_BLOCKED':'공통: 자료를 못 봄','X-TIME_UNKNOWN':'공통: 걸린 시간 모름',
});
export const subjectText=code=>SUBJECT_TEXT[code]??'기타 과목';
export const errorCodeText=code=>ERROR_CODE_TEXT[code]??'기타 이유';
// itemRef = 출처 표기:번호. 옛 카드도 같은 모양이다(모델이 검사). 모양이 다르면 그대로 보인다.
export function itemRefText(ref){
  const book=bookRefText(ref);if(book)return PROV_TEXT[BOOK_TAG]+' · '+book;
  const i=String(ref).indexOf(':'),text=i>0?PROV_TEXT[String(ref).slice(0,i)]:null;
  return text?text+' · '+String(ref).slice(i+1):String(ref);
}
// 오답 한 줄의 출처: 시중 문제집은 책 이름 + 쪽·번호("수능완성 12쪽 3번"). 책 이름은 투영에 없어 복습 줄은 카드에서 오답 id로 찾아 넘긴다.
export const mistakeRefText=(itemRef,book)=>book?book+' '+(bookRefText(itemRef)??''):itemRefText(itemRef);
// 오답의 과목 이름: 생물·추가 과목은 오답 id에 과목이 들어 있다(D46 ★1, 세션과 같은 규칙). 옛 C 오답은 어느 쪽인지 표지가 없어 코드 이름 그대로다.
const mistakeSubject=(id,code,nameOf)=>nameOf?.(id)??subjectText(code);
// 오답 입력의 과목 고르기: 저장 코드 6개 + 생물. 생물은 코드 C 그대로, id = lf_bio_...(형식 변경 없음, D46 ★1).
export const BIO_PICK='bio';
export const mistakeSubjectOptions=()=>[...SUBJECTS.map(c=>[c,c==='C'?'통합과학':subjectText(c)]),[BIO_PICK,'생물']];
export const mistakeFieldsOf=(pick,newId)=>pick===BIO_PICK?{subject:'C',id:('lf_bio_'+newId()).slice(0,40)}:{subject:pick};
// 최근 책 이름(새 기록을 늘리지 않고 카드를 훑어 계산한다, D46 2.3): 최근 카드부터 겹침 없이.
export function recentBooks(cards,limit=5){
  const out=[];
  for(const c of [...cards].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0))for(const m of c.mistakes)if(m.book&&!out.includes(m.book)){out.push(m.book);if(out.length>=limit)return out;}
  return out;
}
// 번호 칸에 안내 글 모양 그대로 "KICE:2026-06-12"를 넣어도 받는다. 앞 글자는 출처로 읽고 저장 값은 그대로(출처 표기:번호)다.
export function itemRefFrom(prov,number){
  const n=String(number).trim(),m=/^KICE:(.*)$/i.exec(n);
  return m?'OFFICIAL_KICE_SAMPLE:'+m[1]:prov+':'+n;
}
// 세션의 과목 이름: 앱이 넘긴 이름 찾기(세션 id의 과목, 생물 포함, life-ui sessionSubjectName)를 먼저 보고, 없으면 과목 코드. 이 모듈은 공부 모델만 불러오므로(시험 XW01·SH05) ctx로 받는다.
const sessionSubject=(s,nameOf)=>nameOf?.(s.id)??subjectText(s.subject);
// 최근 공부 요약: 세는 세션은 projectStudy와 같고(이후 날짜 제외, 같은 id가 겹치면 뺌), 이름만 세션별로 나눈다.
export function minutesByName(cards,today,days,nameOf=null){
  const from=shiftDay(today,-(days-1)),counts=new Map(),totals=new Map();
  for(const c of cards)for(const s of c.sessions)counts.set(s.id,(counts.get(s.id)??0)+1);
  for(const c of cards){
    if(c.date<from||c.date>today)continue;
    for(const s of c.sessions){if(counts.get(s.id)!==1||!(s.confirmedMin>0)||(s.state!=='COMPLETED'&&s.state!=='VERIFIED'))continue;   /* V6F (지시서 7): 담은 세션만 */const name=sessionSubject(s,nameOf);totals.set(name,(totals.get(name)??0)+s.confirmedMin);}
  }
  return [...totals].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1));
}
export const STUDY_ERROR_TEXT=Object.freeze({
  STUDY_SESSION_LIMIT:'한 카드에는 세션을 30개까지만 둘 수 있습니다. 자동으로 지우거나 나누지 않았습니다 · 임시 입력은 그대로 있습니다.',
  STUDY_MISTAKE_LIMIT:'한 카드에는 오답을 80개까지만 둘 수 있습니다 · 임시 입력은 그대로 있습니다.',
  STUDY_REVIEW_LIMIT:'한 카드에는 복습 기록을 200개까지만 둘 수 있습니다 · 임시 입력은 그대로 있습니다.',
  STUDY_CARD_TOO_LARGE:'카드가 너무 큽니다(32KB). 메모를 줄이거나 항목을 정리하세요 · 임시 입력은 그대로 있습니다.',
  REBASE_ID_COLLISION:'다른 기기에서 같은 번호로 다른 내용을 추가했습니다. 아무것도 저장하지 않았습니다 · 임시 입력은 그대로 있습니다.',
  INVALID_STUDY_ITEMREF:ITEM_NUMBER_GUIDE+' · 한글·빈칸은 넣을 수 없습니다(문제 문장을 저장하지 않으려는 규칙).',
  INVALID_STUDY_BOOK:'책 이름은 1~20자이고 문장부호를 넣을 수 없습니다(문제 문장을 저장하지 않으려는 규칙).',STUDY_BOOK_REF:'쪽(숫자)이나 번호(영문·숫자) 중 하나는 적어 주세요.',RECORDS_DOOR_CLOSED:'시중 문제집 출처는 아직 켜지 않았습니다 · 네 기기를 올린 뒤 더보기 > 설정에서 켜 주세요. 임시 입력은 그대로 있습니다.',
  INVALID_STUDY_TEXT:'글자 수를 확인하세요.',INVALID_STUDY_DATE:'날짜는 YYYY-MM-DD 형식이어야 합니다.',INVALID_STUDY_NEXT_DUE:'다음 복습일은 복습한 날 이후여야 합니다.',
  INVALID_STUDY_SESSION:'세션 값을 확인하세요(분은 0~1440 정수).',NO_STARTED_SESSION:'시작한 세션이 없습니다. 먼저 "공부 시작"을 누르세요.',
  APP_ENTITY_LIMIT:'개수 한도에 닿았습니다.',STALE_HEADS:'다른 기기에서 먼저 바뀌었습니다. 다시 받아 합친 뒤 쌓으세요.',
  MD_NOT_WRITE_READY:'지금은 서버에 쌓을 수 없습니다. 임시 입력은 이 기기에 남아 있습니다.',VERSION_CONFLICT:'다른 기기가 먼저 쌓았습니다. 다시 쌓기를 누르면 받아서 합칩니다.',
  ABORTED:'서버가 이 쌓기를 받지 않았습니다(기록되지 않음) · 임시 입력은 그대로 있습니다. 다시 쌓을 수 있습니다.',
});
export const studyErrorText=code=>STUDY_ERROR_TEXT[code]??(code?'처리하지 못했어요 · 임시 입력은 그대로 있습니다.'+' · 문의 코드 ▾\u2060'+code+'\u2060':'처리하지 못했습니다.');
export const NOTICE_TEXT=Object.freeze({
  REBASE_CONFLICT_KEPT_REMOTE:'내가 지운 항목을 다른 기기에서 고쳐서 삭제하지 않고 상대 수정을 남겼습니다.',
  REBASE_CONFLICT_KEPT_LOCAL:'다른 기기에서 지운 항목을 내가 고쳐서 내 수정으로 되살렸습니다.',
  REBASE_VALUE_OVERWRITTEN:'같은 항목을 양쪽에서 고쳤습니다 · 내 값을 썼고 상대 값은 이력에 남아 있습니다.',
  REBASE_TIMER_CLAIM_OVERLAP:'PC 측정으로 담은 시간이 타이머 시간과 겹칩니다 · 같은 시간이 두 번 세어질 수 있어요(자동으로 지우지 않았어요) · 필요하면 한쪽을 지우세요.',
  REBASE_TIMER_TIMER_OVERLAP:'두 기기의 타이머 시간이 서로 겹칩니다 · 같은 시간이 두 번 세어질 수 있어요(자동으로 지우지 않았어요) · 필요하면 한쪽을 지우세요.',
});
const STATUS_TEXT=Object.freeze({
  CONFIRMED:'저장 및 동기화 확인됨 · 쌓았습니다.',ALREADY_APPLIED:'이미 반영되어 있습니다 · 새로 저장하지 않았습니다.',NOTHING_TO_CONFIRM:'쌓을 임시 입력이 없습니다.',
  UNKNOWN:'서버 응답을 확인하지 못했습니다 · 임시 입력은 그대로 있습니다. 다시 쌓기를 누르면 결과를 확인한 뒤 이어서 처리합니다(중복 저장 없음).',
  SYNC_FAILED:'서버에서 최신 기록을 받지 못했습니다 · 임시 입력은 그대로 있습니다.',FAILED:'저장하지 못했습니다 · 임시 입력은 그대로 있습니다.',STALE:'다른 기기와 계속 겹쳐 쌓지 못했습니다 · 임시 입력은 그대로 있습니다.',
});
export const CLOSE_WARNING='다음 복습일을 안 정하면 이 오답은 복습 목록에서 빠져요.';
export const RESULT_TEXT=Object.freeze({RECALLED:'기억남',PARTIAL:'일부만 기억',FAILED:'못 떠올림'});
const STATE_TEXT={PROPOSED:'제안',PREPARED:'준비',STARTED:'시작',ATTEMPTED:'풀이함',COMPLETED:'끝냄',VERIFIED:'확인됨'};
const PROV_TEXT={AI_ORIGINAL_PRACTICE:'AI 창작 연습',OFFICIAL_KICE_SAMPLE:'평가원 공개 문항',OFFICIAL_OTHER_VERIFIED:'기타 공식(확인됨)',[BOOK_TAG]:'시중 문제집'};
const EVIDENCE_TEXT={OBSERVED:'직접 확인',USER_REPORTED:'내가 말함',INFERENCE:'추정',UNKNOWN:'모름'};

// ---- 포트: 앱의 api/기록 함수를 StudyFlow가 쓰는 모양으로 ----
// ctx: hlt-ui와 같은 모양 {api, mdProfile(), getWhole(), getChanges(), syncForWrite(), hasPending(), reconcile(), uid(), now(), canDrafts(), write()}
export function createStudyPorts(ctx){
  const memoryDrafts=new Map();let seq=0,cache=null;
  const study=()=>ctx.getWhole().study;
  const revisionMap=()=>{const rows=ctx.getChanges();if(cache?.rows===rows)return cache.map;const m=new Map();for(const c of rows)if(c.type==='STUDY_DAY')m.set(c.revisionId,c.value.data);cache={rows,map:m};return m;};
  const journal=ctx.canDrafts?Boolean(ctx.canDrafts()):ctx.mdProfile();
  // B3c 선택 순서: PC 저널 → 이 기기 상자(card-draft-box, 브라우저 IndexedDB 암호문) → 메모리. PC 경로(저널)는 상자를 만들지도 않는다.
  const box=journal?null:ctx.cardDraftBox?.()??null,mode=journal?'JOURNAL':box?.available()?'DEVICE_BOX':'MEMORY';
  const write=body=>ctx.write?ctx.write(body):ctx.api('/api/entity',body);
  return {
    mode,persistent:mode!=='MEMORY',box:mode==='DEVICE_BOX'?box:null,
    latest(date){const d=study().days.find(x=>x.date===date);return {card:d?structuredClone(d.data):null,heads:d?[...d.heads]:[]};},
    cards:()=>study().days.map(d=>structuredClone(d.data)),
    revision(date,ref){const v=revisionMap().get(ref);return v?structuredClone(v):null;},
    sync:()=>ctx.syncForWrite(),
    recordsDoor:()=>Boolean(ctx.recordsDoor?.()),   // 쓰기 문(D46 4.2): 앱이 못 넘기면 닫힌 것으로 본다(시중 문제집 오답은 거절, 나머지는 그대로)
    hasPending:()=>Boolean(ctx.hasPending?.()),reconcile:()=>ctx.reconcile?.(),
    // B19: 상자·메모리 경로는 저널의 SERVER_COMMITTED가 없다. ctx.receipt(requestId)(앱: 읽기 전용 /api/command/<requestId>, 이 기기 금고의 영수증)가 있으면
    // NOT_ESTABLISHED가 아닌 결말(COMMITTED·ABORTED·HOLD)을 '이미 결말 남'으로 알려 앱을 다시 연 뒤의 재확정도 원래 영수증에 수렴하게 한다. 서버 호출·쓰기 없음.
    terminal:!journal&&ctx.receipt?async rid=>(await ctx.receipt(rid))?.status!=='NOT_ESTABLISHED':()=>false,
    makeBody:async({requestId,date,data,heads,reason})=>{const fields={entityType:'STUDY_DAY',entityId:date,expectedHeads:[...heads],data:structuredClone(data),reason,confirmed:false};return {requestId,commandDigest:await ctx.digest({type:'ENTITY',...fields}),...fields};},
    now:()=>ctx.now(),newId:()=>'i'+Date.now().toString(36)+(++seq).toString(36)+ctx.uid().slice(0,6),newRequestId:()=>ctx.uid(),
    drafts:journal?{
      // 서버 초안 저널(drafts.lbd, 봉인 저장). 공부 카드 초안은 draft-list가 본문(내 카드 + base heads)을 함께 돌려준다.
      list:async()=>(await ctx.api('/api/md/draft-list',{})).drafts.filter(d=>d.type==='ENTITY'&&d.body?.entityType==='STUDY_DAY'),
      save:r=>ctx.api('/api/md/draft-save',r),
      discard:id=>ctx.api('/api/md/draft-discard',{draftId:id,confirmed:true}),
      commit:id=>ctx.api('/api/md/draft-commit',{draftId:id,confirmed:true}),
    }:mode==='DEVICE_BOX'?box.port('STUDY_DAY',{write}):{
      // 초안 저널이 없는 환경(브라우저·PWA): 이번 실행 동안만 메모리에 둔다. 확정은 일반 저장 경로(ctx.write)로 한다.
      list:async()=>[...memoryDrafts.values()],
      save:async({type,body})=>{const id='local'+(++seq);memoryDrafts.set(id,{draftId:id,type,body:structuredClone(body),createdAt:new Date().toISOString()+String(seq).padStart(6,'0')});return {draftId:id,status:'LOCAL_DRAFT'};},
      discard:async id=>{memoryDrafts.delete(id);},
      // B17 (A8-D01): 확정(COMMITTED)이 확인된 경우에만 초안을 지운다. ABORTED·그 밖의 상태는 초안을 그대로 둔다.
      commit:async id=>{const d=memoryDrafts.get(id);const r=await write(d.body);const status=r?.status==='LOCAL_SAVED'||r?.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'?'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED':r?.status;if(status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED')memoryDrafts.delete(id);return {...r,status};},
    },
  };
}

export function createStudyState(){return {date:null,today:null,notices:[],message:null,error:false,form:null,reviewForm:null,flowState:null,flow:null,ports:null,raw:null};}
// B16 (K1-03): gone()이 참이면(준비 도중 로그아웃 세대가 바뀜) 늦게 끝난 상태를 공유 st에 넣지 않는다(prepareHealth와 같음).
export async function prepareStudy(ctx,st,gone=()=>false){
  const whole=ctx.getWhole();
  st.today=kstDate(ctx.now());
  st.date??=st.today;
  if(!st.flow){st.ports=createStudyPorts(ctx);st.flow=new StudyFlow(st.ports);}
  st.raw=whole.study;
  const flowState=await st.flow.state(st.date);
  if(gone())return st;
  st.flowState=flowState;
  return st;
}
// 복습 목록의 투영 입력: 금고에 확정된 카드들 + 지금 보는 날짜의 초안(있으면 확정본 대신).
export function projectionCards(raw,flowState){
  const cards=raw.days.filter(d=>d.date!==flowState.card.date).map(d=>d.data);
  if(flowState.status!=='NONE'||flowState.card.sessions.length||flowState.card.mistakes.length||flowState.card.reviews.length)cards.push(flowState.card);
  return cards;
}

// ---- DOM 생성 ----
function maker(doc){
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const add=(p,...ns)=>{p.append(...ns.filter(Boolean));return p;};
  const button=(text,fn,cls='secondary')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const hint=text=>el('p',text,'muted small');
  const section=(title,sub)=>add(el('section',null,'panel study-panel'),el('h2',title,'panel-title'),sub?hint(sub):null);
  const row=(title,detail,action)=>add(el('div',null,'row'),add(el('div',null,'row-main'),el('strong',title),detail?hint(detail):null),action);
  const input=(value='',attrs={})=>{const n=el('input');n.type='text';n.value=value;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const select=(options,value)=>{const n=el('select');for(const [v,t] of options){const o=el('option',t);o.value=v;n.append(o);}n.value=value;return n;};
  const field=(label,control)=>add(el('label',label),control);
  return {el,add,button,hint,section,row,input,select,field};
}
const int=s=>typeof s==='string'&&/^\d+$/.test(s.trim())?Number(s.trim()):NaN;
const subjectOptions=()=>SUBJECTS.map(c=>[c,subjectText(c)]);
const dueText=r=>r.daysLate>0?r.due+' 예정 · '+r.daysLate+'일 늦음':r.due+' 예정 · 오늘';

// FIX72: 화면에 보일 상태 = 카드만 study-flow shownCard(쌓인 카드 + 이 기기 초안, 줄 단위)로 바꾼 사본. 포트에 latest가 없으면(화면 시험의 가짜 흐름) 그대로.
export function viewState(st,fs){try{const c=shownCard(fs,st.ports?.latest?.(fs.card?.date??st.date))??fs.card;return c===fs.card?fs:{...fs,card:c};}catch{return fs;}}
export function renderStudy(root,ctx,st){
  const doc=ctx.document??globalThis.document,h=maker(doc),{el,add,button,hint,section,row,input,select,field}=h;
  const fs=viewState(st,st.flowState),date=st.date,isToday=date===st.today;   // FIX72: 세션·오답·복습 목록은 표시 카드(쓰기는 흐름이 초안에 한다)
  const box=st.ports?.box??null,T=box?.TEXT;   // B3c: 이 기기 상자(브라우저)일 때만 있다
  const seen=()=>(st.resumed??=new Set()).add(date);   // 이 날짜에서 한 번이라도 입력했으면 "저장된 초안이 있어요" 안내를 다시 띄우지 않는다
  // B2C (DEFECT-5 묶음): 상자 쓰기 실패는 save가 던지지 않는다(설계). 버튼이 끝났을 때 그 날짜 초안이 실패 상태면 성공 문구 대신 실패 문구를 보인다(날짜가 옮겨 갔을 수 있어 st.date).
  const boxFailText=()=>{const c=box?.status().failed;return c?box.ERROR_TEXT[c]??T.failed:null;};
  const flagBoxFail=()=>{const x=box?.statusFor('STUDY_DAY',st.date);if(x?.has&&x.failed&&!st.error){st.message=box.ERROR_TEXT[x.failed]??T.failed;st.error=true;}};
  const act=fn=>()=>void ctx.perform(async()=>{st.message=null;st.error=false;seen();try{await fn();}catch(e){st.message=box?.ERROR_TEXT[e?.code]??studyErrorText(e?.code);st.error=true;}flagBoxFail();await prepareStudy(ctx,st);await ctx.rerender();});
  // B17 (H12-N02): 복습은 오늘 카드에 기록한다고 약속한다. 클릭 시점에 오늘 날짜를 다시 확인해, 화면을 그린 뒤 날짜가 바뀌었으면 기록하지 않고
  // "날짜가 바뀌었습니다"를 알린 뒤 오늘 화면으로 새로 그린다(옛 날짜 기준으로 계산한 다음 복습일 제안을 그대로 쓰지 않게, 결과를 다시 고르게 한다).
  const dayMoved=()=>{
    const now=kstDate(ctx.now());if(now===st.today)return false;
    if(date===st.today)st.date=now;
    st.reviewForm=null;st.form=null;st.notices=[];st.message='날짜가 바뀌었습니다('+now+') · 화면을 새로 고칩니다. 아무것도 기록하지 않았습니다 · 복습 결과를 다시 골라 주세요.';
    return true;
  };
  // B17 (H12-N03): 빠른 입력(공부 시작·끝)이 바꾼 카드가 화면 날짜와 다르면 화면을 그 카드의 날짜로 옮기고 한 줄 알린다(확정 버튼은 늘 화면에 보이는 카드를 확정).
  const follow=(s,text)=>{const d=s?.card?.date,moved=Boolean(d)&&d!==date;if(moved){st.date=d;st.form=null;st.reviewForm=null;st.notices=[];}st.message=[text,moved?(d===kstDate(ctx.now())?'빠른 입력은 오늘('+d+') 카드에 들어갑니다':'시작한 세션이 있는 '+d+' 카드에 기록했습니다')+' · 화면을 그 날짜로 옮겼습니다.':null].filter(Boolean).join(' · ');};
  const out=el('div',null,'study-view'),nameOf=ctx.sessionSubjectName??null;

  // 0) 복습 목록(맨 위): 오늘 도래·밀린 건수 + 목록 + 결과 기록
  let proj=null,sum=null;
  const seenCards=projectionCards(st.raw,fs),bookOf=new Map(seenCards.flatMap(c=>c.mistakes.filter(m=>m.book).map(m=>[m.id,m.book])));
  try{proj=projectStudy(seenCards,st.today);sum=reviewSummary(proj);}catch{proj=null;}
  const rev=section('복습','복습 결과를 고르면 다음 복습일을 제안합니다(1·3·7·14·30·60·120일 사다리). 날짜는 바꿀 수 있습니다. 기록은 오늘 카드의 임시 입력에 들어갑니다.');
  rev.id='study-review';
  if(!sum)add(rev,el('p','복습 목록을 계산하지 못했습니다(카드 값 확인 필요).','notice error study-message'));
  else{
    add(rev,el('p',sum.line,sum.overdue?'study-chip study-overdue':'study-chip'));
    if(!isToday)add(rev,hint('복습 기록은 오늘 카드에 들어갑니다. 오늘 날짜로 이동한 뒤 기록하세요.'));
    if(!sum.items.length)add(rev,hint('복습할 오답이 없습니다.'));
    for(const r of sum.items){
      const open=st.reviewForm?.mistakeId===r.mistakeId;
      add(rev,row(mistakeSubject(r.mistakeId,r.subject,nameOf)+' · '+mistakeRefText(r.itemRef,bookOf.get(r.mistakeId)),dueText(r),isToday?add(el('div',null,'buttons'),...RESULTS.map(res=>button(RESULT_TEXT[res],act(async()=>{
        if(dayMoved())return;
        const sug=await st.flow.suggestReview(st.today,r.mistakeId,res);
        st.reviewForm={mistakeId:r.mistakeId,result:res,nextDue:sug.nextDue,graduated:sug.graduated,intervalDays:sug.intervalDays,itemRef:r.itemRef};
      })))):null));
      if(open){
        const f=st.reviewForm,nd=input(f.nextDue??'',{inputmode:'numeric',placeholder:'YYYY-MM-DD',maxlength:'10'});
        add(rev,el('h3','복습 기록 · '+RESULT_TEXT[f.result],'panel-title'),
          hint(f.graduated?'이 오답은 졸업했어요(마지막 120일 복습까지 기억했습니다). 다음 복습일은 비어 있고 복습 목록에서 빠집니다.':'제안: '+f.intervalDays+'일 뒤 · 아래 날짜를 바꿀 수 있습니다(예: 시험이 가까우면 짧게).'),
          field('다음 복습일',nd),
          f.graduated?null:hint('비워 두면: '+CLOSE_WARNING),
          add(el('div',null,'buttons'),
            button('복습 기록 넣기',act(async()=>{
              if(dayMoved())return;
              const v=nd.value.trim();
              if(v!==''&&!dateKeyOK(v)){const e=new Error('INVALID_STUDY_DATE');e.code='INVALID_STUDY_DATE';throw e;}
              if(v===''&&!f.graduated&&!(ctx.confirmDialog?.(CLOSE_WARNING+' 그래도 비워 둘까요?')??true))return;
              const r2=await st.flow.recordReview(st.today,{mistakeId:f.mistakeId,result:f.result,nextDue:v});
              st.reviewForm=null;st.message=r2.closed?(f.graduated?'졸업으로 기록했습니다(임시 입력).':'다음 복습일 없이 기록했습니다 · 이 오답은 복습 목록에서 빠집니다(임시 입력).'):'복습을 임시 입력에 기록했습니다.';
            }),'primary'),
            button('취소',()=>{st.reviewForm=null;void ctx.rerender();})));
      }
    }
  }
  add(out,rev);

  // 1) 상태·날짜
  const head=section('공부 · 하루 1장','입력은 이 기기에 임시로 모이고, "카드 쌓기"를 눌러야 기록으로 쌓입니다.');
  const b=box?.statusFor('STUDY_DAY',date);
  const chip=b?.typing?T.typing:b?.has?'이 기기에만 있는 임시 입력 · '+(b.dirty?(b.failed?'아직 이 기기에 저장하지 못함':T.typing):T.saved)+(b.old?' · '+T.old:''):
    fs.status==='LOCAL_DRAFT'?'이 기기에만 있는 임시 입력 (아직 쌓기 전) · 임시 저장됨':fs.status==='CONFIRMED'?'쌓임 · 이 카드는 '+fs.latestConfirmCount+'번 쌓음':'아직 기록 없음';
  const dateIn=input(date,{inputmode:'numeric',placeholder:'YYYY-MM-DD',maxlength:'10'});
  const go=d=>()=>{if(!dateKeyOK(d)){st.message='날짜는 YYYY-MM-DD 형식이어야 합니다.';st.error=true;void ctx.rerender();return;}st.date=d;st.form=null;st.reviewForm=null;st.message=null;st.notices=[];void ctx.perform(async()=>{await prepareStudy(ctx,st);await ctx.rerender();});};
  const nav=add(el('div',null,'buttons day-nav'),button('◀ 전날',()=>go(shiftDay(date,-1))()),dateIn,button('이동',()=>go(dateIn.value.trim())()),button('▶ 다음날',()=>go(shiftDay(date,1))()),button('오늘',()=>go(st.today)()));for(const n of [nav,rev])if(n.dataset)n.dataset.freshKeep='1';   // V7D2: 기준 전 날짜를 보면 날짜 이동·복습(오늘 카드에 기록)만 남기고 잠근다
  add(head,nav,add(el('div',null,'rc-line'),el('p',chip,'study-chip'),ctx.clearMenu?.('STUDY_DAY',date)??null));   // V7D2: 쌓은 공부 카드 ⋯ 메뉴
  if(st.ports?.persistent===false)add(head,hint('이 환경에는 임시 저장 공간이 없어 임시 입력이 앱을 닫거나 새로고침하면 사라집니다. 쌓기 전에 닫지 마세요. (PC 앱에서는 임시 입력이 기기에 암호화되어 남습니다.)'));
  if(box){
    const s=box.status();
    add(head,hint(T.modeBox));
    if(s.failed)add(head,el('p',box.ERROR_TEXT[s.failed]??T.failed,'notice error card-draft-failed'));
    if(s.unreadable)add(head,hint(T.unreadable));
    // 카드를 열었을 때 이 날짜의 초안이 상자에 있으면: 이어서 쓰기 / 버리기(확인창). 자동으로 덮어쓰거나 확정하지 않는다.
    if(fs.status==='LOCAL_DRAFT'&&b.has&&!st.resumed?.has(date))add(head,el('p',T.resume+' ('+new Date(Date.parse(b.updatedAt)+9*3600000).toISOString().slice(0,16).replace('T',' ')+' KST)'+(b.old?' · '+T.old:''),'notice card-draft-resume'),add(el('div',null,'buttons'),
      button(T.resumeKeep,()=>{seen();void ctx.rerender();},'primary'),
      button(T.resumeDrop,()=>{if(ctx.confirmDialog?.(T.dropConfirm)??true)void act(async()=>{await st.ports.drafts.discard(fs.draftId);st.notices=[];})();})));
  }
  if(fs.latestConfirmCount+1>=3&&fs.status==='LOCAL_DRAFT')add(head,hint('이 카드는 이번이 '+(fs.latestConfirmCount+1)+'번째 쌓기입니다. 막지는 않지만, 모아서 한 번에 쌓는 편이 좋습니다.'));
  if(st.message&&st.message!==boxFailText())add(head,el('p',st.message,st.error?'notice error study-message':'notice study-message'));   // 위 빨간 줄과 같은 문구는 두 번 보이지 않는다
  if(st.notices.some(n=>n.code!=='REBASE_TIMER_CLAIM_OVERLAP')&&st.notices.some(n=>n.code!=='REBASE_TIMER_TIMER_OVERLAP'&&n.code!=='REBASE_TIMER_CLAIM_OVERLAP'))add(head,el('p','다른 기기에서 바뀐 내용이 있어 합쳤어요.','notice study-merged'));   // FIX34 (H6): 겹침 알림만 있으면 합친 것이 아니다
  for(const n of st.notices)add(head,el('p',NOTICE_TEXT[n.code]??'알림을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+n.code+'\u2060','notice study-notice'));
  add(out,head);

  // 2) 세션
  const ses=section('그날 세션','공부 시간은 내가 입력·확인한 분만 셉니다(자동 측정 없음). 세션 '+fs.card.sessions.length+'개');
  const sSel=select(subjectOptions(),SUBJECTS[0]),endMin=input('',{inputmode:'numeric',placeholder:'확인한 분'}),endLoc=input('',{maxlength:String(MAX_LOCATOR),placeholder:'이어하기 위치(선택)'});
  add(ses,add(el('div',null,'buttons study-quick'),field('과목',sSel),button('공부 시작',act(async()=>{follow(await st.flow.quickStart(sSel.value),'세션을 시작으로 임시 입력에 넣었습니다.');}),'primary')),
    add(el('div',null,'buttons study-quick'),field('확인한 분',endMin),field('이어하기 위치',endLoc),button('공부 끝',act(async()=>{
      const m=int(endMin.value);if(Number.isNaN(m)||m>1440){const e=new Error('INVALID_STUDY_SESSION');e.code='INVALID_STUDY_SESSION';throw e;}
      follow(await st.flow.quickEnd(m,endLoc.value.trim()===''?{}:{restartLocator:endLoc.value.trim()}),'세션을 끝으로 바꾸고 확인한 분을 넣었습니다.');
    }),'primary')));
  if(!fs.card.sessions.length)add(ses,hint('아직 세션이 없습니다.'));
  for(const s of fs.card.sessions){
    const nextState=SESSION_STATES[Math.min(SESSION_STATES.indexOf(s.state)+1,SESSION_STATES.length-1)];
    add(ses,row(sessionSubject(s,nameOf)+' · '+STATE_TEXT[s.state]+' · 확인 '+s.confirmedMin+'분'+(s.plannedMin?' / 계획 '+s.plannedMin+'분':''),s.restartLocator?'이어하기 위치: '+s.restartLocator:null,add(el('div',null,'buttons'),
      s.state===nextState?null:button('→ '+STATE_TEXT[nextState],act(async()=>{await st.flow.updateRow(date,'sessions',{...s,state:nextState});})),
      button('삭제',act(async()=>{await st.flow.removeRow(date,'sessions',s.id);})))));
  }
  add(out,ses);

  // 3) 오답
  const mis=section('오답','문제 본문·정답·해설은 저장하지 않습니다. 출처와 번호, 틀린 이유, 짧은 메모만 남깁니다. 등록하면 복습일이 기본으로 다음 날로 들어갑니다.');
  // 쓰기 문이 닫혀 있으면 시중 문제집 선택지가 없다(D46 4.2). 출처·책은 넣은 뒤에도 남겨 같은 책을 3번 안에 다시 넣는다.
  const bookOpen=Boolean(st.ports?.recordsDoor?.()),provs=bookOpen?[...PROVENANCE,BOOK_TAG]:PROVENANCE,lastProv=provs.includes(st.lastProv)?st.lastProv:PROVENANCE[0];
  const mSub=select(mistakeSubjectOptions(),SUBJECTS[0]),mProv=select(provs.map(p=>[p,PROV_TEXT[p]]),lastProv),mNum=input('',{maxlength:'35',placeholder:'번호(영문·숫자·.-_)'}),
    mBook=input(st.lastBook??'',{maxlength:String(MAX_BOOK),placeholder:'책 이름(예: 수능완성)'}),mPage=input('',{inputmode:'numeric',maxlength:'5',placeholder:'쪽(숫자)'}),mItem=input('',{maxlength:'10',placeholder:'번호(영문·숫자)'}),
    mCode=select(ERROR_CODES.map(c=>[c,errorCodeText(c)]),ERROR_CODES[0]),mEv=select(EVIDENCE_STATUS.map(e=>[e,EVIDENCE_TEXT[e]]),'USER_REPORTED'),mNote=input('',{maxlength:String(MAX_NOTE),placeholder:'메모(최대 '+MAX_NOTE+'자)'}),mDue=input(defaultReviewDue(date),{inputmode:'numeric',maxlength:'10'});
  for(const m of fs.card.mistakes)add(mis,row(mistakeSubject(m.id,m.subject,nameOf)+' · '+mistakeRefText(m.itemRef,m.book)+' · '+errorCodeText(m.errorCode),(m.note?m.note+' · ':'')+'증거: '+EVIDENCE_TEXT[m.evidence]+(m.reviewDue?' · 첫 복습 '+m.reviewDue:''),add(el('div',null,'buttons'),button('삭제',act(async()=>{await st.flow.removeRow(date,'mistakes',m.id);})))));
  if(!fs.card.mistakes.length)add(mis,hint('이 카드에 등록한 오답이 없습니다.'));
  const plainRef=add(el('div',null,'study-ref-plain'),field('번호',mNum),hint(ITEM_NUMBER_GUIDE));
  const books=recentBooks(seenCards),chips=books.length?add(el('div',null,'buttons study-book-chips'),...books.map(name=>button(name,()=>{mBook.value=name;},'secondary study-book-chip'))):null;
  const bookRef=add(el('div',null,'study-ref-book'),field('책 이름',mBook),chips,field('쪽',mPage),field('번호',mItem));
  const showRef=()=>{const on=mProv.value===BOOK_TAG;plainRef.hidden=on;bookRef.hidden=!on;};
  mProv.addEventListener('change',showRef);showRef();
  add(mis,el('h3','오답 추가','panel-title'),field('과목',mSub),field('출처',mProv),bookOpen?null:hint('시중 문제집 출처 · 4기기 업데이트 뒤 켜기'),plainRef,bookRef,field('틀린 이유',mCode),field('증거',mEv),field('메모',mNote),field('첫 복습일',mDue),
    button('오답 넣기',act(async()=>{
      const reviewDue=mDue.value.trim(),isBook=mProv.value===BOOK_TAG,ref=isBook?bookRefFrom(mPage.value,mItem.value):itemRefFrom(mProv.value,mNum.value);
      if(ref===null){const e=new Error('STUDY_BOOK_REF');e.code='STUDY_BOOK_REF';throw e;}
      await st.flow.addMistake(date,{...mistakeFieldsOf(mSub.value,st.ports.newId),itemRef:ref,errorCode:mCode.value,evidence:mEv.value,note:mNote.value.trim(),...(isBook?{book:mBook.value.trim()}:{}),...(reviewDue?{reviewDue}:{})});
      st.lastProv=mProv.value;if(isBook)st.lastBook=mBook.value.trim();
      st.message='오답을 임시 입력에 넣었습니다.';
    }),'primary'));
  add(out,mis);

  // 4) 확정
  const fin=section('쌓기');
  add(fin,add(el('div',null,'buttons'),
    button('카드 쌓기',act(async()=>{
      const r=await st.flow.confirm(date);st.notices=r.notices??[];
      // FIX72: 쌓은 직후 앱의 금고 사본을 다시 읽는다(읽기만, 일기 저장과 같음). 같은 기기 다른 창의 초안이 남은 날 방금 쌓은 줄이 화면에서 안 보이지 않게.
      if(r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED')try{await ctx.reload?.();}catch{/* 다음 동기화가 다시 읽는다 */}
      if(r.status==='REJECTED'){st.message=studyErrorText(r.code);st.error=true;}
      else if(['UNKNOWN','SYNC_FAILED','FAILED','STALE'].includes(r.status)){st.message=(r.code&&STUDY_ERROR_TEXT[r.code])||STATUS_TEXT[r.status];st.error=true;}
      else st.message=STATUS_TEXT[r.status]??'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+r.status+'\u2060';
    }),'primary'),
    fs.status==='LOCAL_DRAFT'?button('임시 입력 버리기',()=>{if(ctx.confirmDialog?.('이 날짜의 임시 입력을 버릴까요? 쌓인 기록에는 영향이 없습니다.')??true)void act(async()=>{await st.ports.drafts.discard(fs.draftId);st.notices=[];})();}):null));
  add(out,fin);

  // 5) 요약(계산만, 연산 0)
  const sm=section('최근 공부 요약','확인한 분만 합산합니다. 저장하지 않고 계산만 합니다. 기준일 '+st.today+' · KST');
  if(proj){
    const cards=projectionCards(st.raw,fs);
    for(const [name,days] of [['최근 7일',7],['최근 30일',30]]){
      const parts=minutesByName(cards,st.today,days,nameOf).map(([n,m])=>n+' '+m+'분');
      add(sm,row(name,parts.length?parts.join(' · '):'확인한 공부 시간이 없습니다.'));
    }
    add(sm,row('오늘 이어하기',proj.resume?proj.resume.date+' · '+subjectText(proj.resume.subject)+' · '+proj.resume.restartLocator:'이어할 위치가 없습니다.'));
    if(proj.orphanReviews.length)add(sm,hint('가리키는 오답을 찾지 못한 복습 기록이 '+proj.orphanReviews.length+'건 있습니다(오답 카드가 아직 안 받아졌거나 지워졌을 수 있음). 복습 목록에는 나오지 않습니다.'));
    if(proj.duplicates.length)add(sm,hint('같은 번호가 겹친 항목이 '+proj.duplicates.length+'건 있어 계산에서 뺐습니다.'));
  }
  add(out,sm);
  ctx.freshLock?.(out,date);   // V7D2: 새 시작 전 날짜면 읽기 전용 + 한 줄(지금까지는 저장 때 거절만)
  ctx.studyStatsCard?.(root);   // FIX45 (AUD1 #6): 공부 통계는 이 화면 맨 위(앱이 그린다, 이 모듈은 공부 모델만 불러온다)
  root.append(out);
  return out;
}

// 설정 화면의 모듈 스위치(B38: 기본 켜짐, 끄기는 이 기기에만 적용).
export function renderStudySwitch(ctx){
  const doc=ctx.document??globalThis.document,{el,add,button,section}=maker(doc);
  const on=studyEnabled(ctx.storage);
  return add(section('공부 기능','기본은 켜짐입니다. 끄면 이 기기에서만 공부 화면이 숨겨집니다(다른 기기에는 영향 없음, 기록은 그대로 안전). 모든 기기를 같은 빌드로 갱신한 뒤 쓰세요 — 갱신 안 된 기기는 공부 기록을 만나면 열리지 않고 멈춥니다(기록은 안전).'),
    el('p',on?'지금: 켜짐':'지금: 꺼짐','study-switch-state'),button(on?'공부 기능 끄기':'공부 기능 켜기',()=>{setStudyEnabled(!on,ctx.storage);void ctx.onSwitch?.(!on);},on?'secondary':'primary'));
}
// 홈 "오늘" 패널(B5)용 한 줄: 복습 건수 문구만(목록은 펼치지 않는다). prepareStudy를 먼저 불러 st.flowState가 있어야 한다(없으면 던진다 → 홈은 "확인할 수 없음").
export function studyHomeLine(ctx,st){
  if(!st?.flowState)throw new Error('STUDY_NOT_PREPARED');
  return reviewSummary(projectStudy(projectionCards(ctx.getWhole().study,st.flowState),kstDate(ctx.now()))).line;
}
// FIX44 (AUD1 #3): 오늘 요약 줄의 복습 건수(오늘 + 밀린 것). 위와 같은 계산이고 없으면 던진다.
export function studyReviewTotal(ctx,st){
  if(!st?.flowState)throw new Error('STUDY_NOT_PREPARED');
  return reviewSummary(projectStudy(projectionCards(ctx.getWhole().study,st.flowState),kstDate(ctx.now()))).total;
}
