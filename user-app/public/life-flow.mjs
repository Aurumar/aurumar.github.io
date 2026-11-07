// LIFE_DAY 하루 1장 흐름(임시 저장 → 쌓기). FIX49B: 같은 흐름을 일기(DIARY_DAY)도 쓴다(종류 설정 LIFE_KIND·DIARY_KIND, 복사하지 않음). hlt-flow와 같은 방식이다: 저장소·네트워크·시계·명령 서명(makeBody)은 ports로 주입한다.
// 하루 중 입력은 초안(이 기기의 암호화 상자 또는 메모리)에만 모이고 연산 0이다. "오늘 쌓기" 1번 = 확정 = 연산 1(같은 날 다시 쌓으면 연산 1 더).
// 화면을 열거나 동기화하는 것만으로는 어떤 엔티티도 쓰지 않는다: 쓰기는 confirm()과 saveDefinitions()(습관·과목·시험 편집 저장)에서만 일어난다.
// 초안은 확정 성공을 확인한 뒤에만 지운다. 검증 거부·저장 실패·응답 불명이면 초안을 그대로 둔다.
// 건강·공부와 달리 PC 초안 저널(drafts.lbd)은 쓰지 않는다: 저널의 목록 응답이 LIFE_DAY 본문을 돌려주지 않는다. 상자(브라우저 IndexedDB 암호문) 또는 메모리다.
import {validateLifeData,emptyDay,emptyDiary,kstDate,lifeDefs,recordsDoorState,DEFAULT_HABITS,DEFAULT_SUBJECTS} from './life-model.mjs';
import {rebase,rebaseDiary,hasChanges,diffDay,stable} from './life-rebase.mjs';

const codeOf=e=>typeof e?.code==='string'?e.code:(e?.message??'UNKNOWN');
const REJECT_CODE=/^(INVALID_|LIFE_|HABIT_|EXAM_|APP_ENTITY_LIMIT|REBASE_|INVALID_WHOLE_LIFE|DIARY_|RECORDS_DOOR_CLOSED)/;
export const DRAFT_REASON='오늘 카드 임시 저장';
export const CONFIRM_REASON='오늘 카드 쌓기';
const STALE_BASE='CARD_DRAFT_STALE_BASE',EDIT_ROUNDS=5;
const flowError=code=>Object.assign(new Error(code),{code});
const sameHeads=(a,b)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
// FIX49B (D49 5.2): 일기 저장 사유는 고정 문구만 쓴다(이력에 그대로 보인다, 글을 넣지 않는다). 합칠 것이 없으면 임시 입력 본문을 그대로 확정하므로 두 사유를 같게 둔다(이력에 '임시 저장'으로 보이지 않게).
export const DIARY_CONFIRM_REASON='일기 저장';
export const DIARY_DRAFT_REASON=DIARY_CONFIRM_REASON;
const DIARY_FIELDS=Object.freeze(['score','energy','good','bad','tomorrow','text']);
// 일기의 바뀐 칸 이름(화면·시험용). base가 없으면 빈 일기와 비교한다(빈 일기는 새로 만들지 않는다).
export function diffDiary(base,mine){const b=base??emptyDiary(''),m=mine??emptyDiary('');return {fields:DIARY_FIELDS.filter(k=>stable(b[k])!==stable(m[k]))};}
export const diaryChanged=(base,mine)=>diffDiary(base,mine).fields.length>0;
// FIX50A (HUNT49 A1·A5): 일기 초안은 "이 기기가 바꾼 칸 이름"(touched, 값 없음)을 함께 둔다(상자 암호문 안, 쓰기 본문에는 넣지 않는다).
// 바꾸지 않은 칸은 base를 내 값으로 본다: 병합에서 언제나 최신(다른 기기) 값이 남는다. 다시 켠 뒤 base 글이 "모름"(가린 이력)이어도 건드리지 않은 글은 되돌리지 않는다.
// touched가 없는 초안(이 수정 전 빌드가 만든 것)은 모든 칸을 바꾼 것으로 본다(예전 규칙 그대로).
const touchedOK=t=>Array.isArray(t)&&t.every(k=>DIARY_FIELDS.includes(k));
export function diaryKnownBase(date,base,mine,touched){
  if(!touchedOK(touched))return base;
  const out=structuredClone(base??emptyDiary(date));
  for(const k of DIARY_FIELDS)if(!touched.includes(k))out[k]=structuredClone(mine[k]);
  return out;
}
// FIX52C (Codex R1): 바꾼 칸의 base 값(bases, 칸 이름 → 값). 칸이 목록에 들어갈 때 base 판의 값을 실제로 알면(초안 없음·새 일기·찾은 판의 가리지 않은 값) 초안에 함께 둔다
// (touched와 같은 상자 암호문 안, 쓰기 본문·알림·이력에는 넣지 않는다). 다시 켠 뒤 판을 못 찾거나 가린 사본뿐이어도 이 값으로 되돌린 칸을 판별한다.
// 목록에서 빠진 칸의 값은 버린다. 값이 없는 칸(옛 초안·판을 몰랐던 칸)은 예전 규칙이다.
const basesOf=(b,touched)=>{const out={};if(b&&typeof b==='object'&&!Array.isArray(b)&&Array.isArray(touched))for(const k of touched)if(DIARY_FIELDS.includes(k)&&Object.hasOwn(b,k))out[k]=structuredClone(b[k]);return out;};
// 흐름의 종류 설정. rows = 그 종류의 쌓인 목록(lifeRawView), door = 확정 직전 쓰기 문 검사(새 기록만), maskedHistory = 이력 값이 가린 사본이라 base로 그대로 쓰면 안 됨(FIX49A 4.4).
// fields = 바꾼 칸 이름을 초안에 함께 두는 종류(FIX50A), knownBase = 그 목록으로 base를 고친다.
export const LIFE_KIND=Object.freeze({type:'LIFE_DAY',empty:emptyDay,rows:life=>life?.days??[],rebase,changed:hasChanges,diff:diffDay,draftReason:DRAFT_REASON,confirmReason:CONFIRM_REASON,door:false,maskedHistory:false,fields:null,knownBase:null});
export const DIARY_KIND=Object.freeze({type:'DIARY_DAY',empty:emptyDiary,rows:life=>life?.diaries??[],rebase:rebaseDiary,changed:diaryChanged,diff:diffDiary,draftReason:DIARY_DRAFT_REASON,confirmReason:DIARY_CONFIRM_REASON,door:true,maskedHistory:true,fields:DIARY_FIELDS,knownBase:diaryKnownBase});

export class LifeFlow{
  #p;#k;
  #sent=new Set();#aborted=new Set();
  constructor(ports,kind=LIFE_KIND){this.#p=ports;this.#k=kind;ports.drafts?.mergeWith?.({rebase:kind.rebase,ports});}   // FIX34 (HUNT34 H1): STALE 뒤 다음 쓰기는 디스크 초안과 합친다
  async #drafts(){
    return (await this.#p.drafts.list()).filter(d=>d.type==='ENTITY'&&d.body?.entityType===this.#k.type);
  }
  async #draftFor(date){
    const list=(await this.#drafts()).filter(d=>d.body.entityId===date);
    if(!list.length)return null;
    return list.reduce((a,b)=>(b.createdAt>=a.createdAt?b:a));
  }
  #baseOf(date,heads){return heads.length?this.#p.revision(date,heads[0]):null;}
  // FIX50A: 초안의 base. 바꾼 칸 목록이 있는 종류(일기)는 바꾸지 않은 칸을 초안 값으로 본다(diaryKnownBase).
  // FIX52C (Codex R1): 초안에 둔 base 값(bases)이 있는 칸은 그 값을 base로 쓴다(판을 못 찾거나 가린 사본이어도 다른 기기 값을 잘못 덮거나 되살리지 않는다).
  #draftBase(date,draft){
    const base=this.#baseOf(date,draft.body.expectedHeads);if(!this.#k.knownBase)return base;
    const out=this.#k.knownBase(date,base,draft.body.data,draft.touched),b=basesOf(draft.bases,draft.touched);
    return out&&touchedOK(draft.touched)&&Object.keys(b).length?{...out,...b}:out;
  }
  // 이 기기에만 있는 초안의 날짜들(오래된 순). 어제 쌓지 않은 초안을 찾는 데 쓴다.
  async draftDates(){return [...new Set((await this.#drafts()).map(d=>d.body.entityId))].sort();}
  // NONE(카드 없음), CONFIRMED(금고에 있음, 초안 없음), LOCAL_DRAFT(이 기기에만 있는 초안). touched = 초안의 바꾼 칸 목록(fields 종류만, 모르면 null).
  async state(date){return (await this.#read(date)).s;}
  async #read(date){
    const draft=await this.#draftFor(date),latest=this.#p.latest(date);
    if(draft){
      const base=this.#draftBase(date,draft);
      return {s:{status:'LOCAL_DRAFT',card:structuredClone(draft.body.data),base,baseHeads:[...draft.body.expectedHeads],draftId:draft.draftId,changes:this.#k.diff(base,draft.body.data),...(this.#k.fields?{touched:Array.isArray(draft.touched)?[...draft.touched]:null}:{})},bases:this.#k.fields?basesOf(draft.bases,draft.touched):{}};
    }
    return {s:{status:latest.card?'CONFIRMED':'NONE',card:latest.card?structuredClone(latest.card):this.#k.empty(date),base:latest.card,baseHeads:[...latest.heads],draftId:null,changes:this.#k.diff(latest.card,latest.card),...(this.#k.fields?{touched:[]}:{})},bases:{}};
  }
  // 입력 즉시 초안에 저장한다(연산 0). 검증에 걸리면 아무것도 바꾸지 않고 던진다. 변경이 base와 같아지면 초안을 지운다.
  // FIX50A (HUNT49 A1): from = {heads,card} 화면이 연 시점의 판(일기 시트). 초안이 없을 때만 그 판 위에 초안을 만든다(최신이 그 사이 바뀌었으면 확정 때 3자 병합으로 다른 기기 값이 남는다).
  async edit(date,mutate,{input=null,from=null}={}){
    const alive=this.#alive();
    for(let round=1;;round++){
      if(round>1)alive.check();
      let {s,bases}=await this.#read(date);
      if(!s.draftId&&from&&this.#k.fields)s={...s,card:structuredClone(from.card),base:from.heads.length?structuredClone(from.card):null,baseHeads:[...from.heads]};
      const next=structuredClone(s.card);
      mutate(next);
      next.date=date;
      validateLifeData(this.#k.type,date,next);
      // FIX51A (HUNT50 A2): 원래 값으로 되돌린 칸은 목록에서 뺀다(base와 같으면 결과적으로 바꾸지 않은 칸 → 병합에서 다른 기기 값이 남는다).
      // s.base에서 목록 밖 칸은 초안 값이고, 목록 안 칸은 그 판의 값이다. 가린 이력 사본의 글(UNKNOWN_BASE_TEXT)은 어떤 입력과도 같지 않아 목록에 남는다(모르면 예전 규칙).
      // FIX52B (HUNT51 HF3): 줄이기는 base 판을 실제로 찾았을 때만 한다. 초안의 판(heads)을 못 찾아 빈 일기로 대신하면 지운 칸이 "되돌린 칸"으로 보여 빠진다(확정 때 판을 찾으면 옛 값이 돌아옴).
      // heads가 빈 새 일기는 빈 일기가 실제 base다. 초안이 없을 때(연 판·최신 판)는 판을 안다.
      // FIX52C (Codex R1): 초안에 둔 base 값(bases)이 있는 칸은 판을 못 찾아도 그 값과 비교한다.
      const raw=s.draftId&&s.baseHeads.length?this.#baseOf(date,s.baseHeads):null;
      const exact=!s.draftId||!s.baseHeads.length||raw!==null;
      const known=s.base??this.#k.empty(date);
      const was=k=>Object.hasOwn(bases,k)?bases[k]:known[k];
      const touched=this.#k.fields&&Array.isArray(s.touched)?this.#k.fields.filter(k=>(s.touched.includes(k)||stable(s.card[k])!==stable(next[k]))&&(!(exact||Object.hasOwn(bases,k))||stable(was(k))!==stable(next[k]))):undefined;
      const sure=k=>Object.hasOwn(bases,k)||(!s.draftId||!s.baseHeads.length?known[k]!==UNKNOWN_BASE_TEXT:raw!==null&&raw[k]!==UNKNOWN_BASE_TEXT);
      const nextBases=touched?Object.fromEntries(touched.filter(sure).map(k=>[k,structuredClone(Object.hasOwn(bases,k)?bases[k]:!s.draftId||!s.baseHeads.length?known[k]:raw[k])])):undefined;
      try{
        if(!this.#k.changed(s.base,next)){if(s.draftId)await this.#p.drafts.discard(s.draftId,{input,date});else await this.#p.drafts.keep?.(date,{input,base:null});return this.state(date);}
        if(s.draftId&&stable(next)===stable(s.card)&&(!touched||touched.length===s.touched.length&&touched.every(k=>s.touched.includes(k)))){await this.#p.drafts.keep?.(date,{input,base:s.draftId});return s;}
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:next,heads:s.baseHeads,reason:this.#k.draftReason});
        await this.#p.drafts.save({type:'ENTITY',body,...(touched?{touched,bases:nextBases}:{})},{input,base:s.draftId});
      }catch(e){if(e?.code===STALE_BASE&&round<EDIT_ROUNDS)continue;throw e;}
      if(s.draftId)await this.#p.drafts.discard(s.draftId,{input});
      return this.state(date);
    }
  }
  // entry = {done,at,minutes,count} 또는 null(되돌리기: 그 습관 기록을 지운다).
  setHabit(date,habitId,entry,opts){return this.edit(date,c=>{if(entry===null)delete c.habits[habitId];else c.habits[habitId]=entry;},opts);}
  setMood(date,mood,opts){return this.edit(date,c=>{c.mood=mood;},opts);}
  setNote(date,note,opts){return this.edit(date,c=>{c.note=note??'';},opts);}
  setDayType(date,dayType,opts){return this.edit(date,c=>{c.dayType=dayType;},opts);}

  // 쌓기: 서버 최신을 받은 뒤 최신 카드 위에 내 변경을 다시 얹어(rebase) 연산 1개로 쓴다. (hlt-flow.confirm과 같은 단계)
  // FIX51A (HUNT50 A1): 다시 시도(STALE_HEADS 등)하면 앞 시도에서 합친 결과가 다음 시도의 base가 되어 겹침 알림이 다시 나오지 않는다.
  // 시도마다 나온 알림을 모아(코드+칸 이름으로 하나만, 같은 칸은 마지막 시도 값) 결과에 싣는다.
  // FIX52B (HUNT51 HF1·HF2·S-F1): 모은 알림은 본문을 실제로 보낸 결과(CONFIRMED, 보낸 뒤 UNKNOWN)에만 싣는다. 쓰기 0으로 끝나는 반환(FAILED·STALE·SYNC_FAILED·REJECTED·NOTHING_TO_CONFIRM)에는
  // "내 값을 썼다/지켰다" 알림을 싣지 않는다. ALREADY_APPLIED는 이번 시도의 병합 알림만(최신 그대로라 상대 값을 남겼다는 알림만 사실이다).
  // 앞 시도 알림은 마지막으로 보낸 본문에서 그 칸 값이 그 시도에 보낸 값과 같을 때만 남긴다. 앞 시도가 남긴 초안이 아닌 초안(그 사이 입력)으로 넘어가면 모은 알림을 비운다.
  async confirm(date,{maxAttempts=3}={}){
    const alive=this.#alive(),kept=new Map();let left=null;
    const valueOf=(card,n)=>stable(n.habitId!==undefined?card?.habits?.[n.habitId]:n.field!==undefined?card?.[n.field]:null);
    const collect=rb=>{for(const n of rb.notices??[])kept.set(n.code+'|'+(n.field??n.habitId??n.subjectId??''),{n,v:valueOf(rb.card,n)});};
    const sent=(r,card)=>({...r,notices:[...kept.values()].filter(x=>x.v===valueOf(card,x.n)).map(x=>x.n)});
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      if(attempt>1&&alive.gone())return {status:'FAILED',code:alive.code()};
      const draft=await this.#draftFor(date);
      if(!draft)return {status:'NOTHING_TO_CONFIRM'};
      if(left!==null&&draft.draftId!==left)kept.clear();
      try{
        if(this.#p.hasPending?.())await this.#p.reconcile();
        await this.#p.sync();
      }catch(e){return {status:this.#p.hasPending?.()?'UNKNOWN':'SYNC_FAILED',code:codeOf(e)};}
      // FIX49B (D49 5.2, FIX46A ★): 새 기록(일기)은 일반 저장 경로라 문이 없다. 최신을 받은 뒤(다른 기기가 연 문도 보이게) 쓰기 전에 문을 본다. 닫혀 있으면 아무것도 쓰지 않고 초안을 둔다.
      if(this.#k.door&&!this.#p.doorOpen?.())return {status:'REJECTED',code:'RECORDS_DOOR_CLOSED'};
      const now=await this.#draftFor(date);
      if(!now)return {status:'NOTHING_TO_CONFIRM'};
      if(now.draftId!==draft.draftId){kept.clear();if(attempt<maxAttempts)continue;return {status:'STALE',code:STALE_BASE};}
      let ended;
      try{ended=Boolean(await this.#p.terminal?.(draft.body.requestId));}catch(e){return {status:'UNKNOWN',code:codeOf(e)};}
      const settled=await this.#settleSent(draft,ended);
      if(settled)return settled;
      const latest=this.#p.latest(date),base=this.#draftBase(date,draft);
      const rb=this.#k.rebase({date,base,mine:draft.body.data,latest:latest.card});
      if(rb.status==='REJECTED')return {status:'REJECTED',code:rb.code};
      if(rb.status==='ALREADY_APPLIED'){await this.#p.drafts.discard(draft.draftId);return {status:'ALREADY_APPLIED',notices:rb.notices};}
      let target=draft;
      if(!(stable(draft.body.data)===stable(rb.card)&&sameHeads(draft.body.expectedHeads,latest.heads))||ended||this.#aborted.has(draft.body.requestId)){
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:rb.card,heads:latest.heads,reason:this.#k.confirmReason});
        let saved;
        // FIX52C: 다시 저장한 초안의 판은 최신이다. bases도 최신 판의 값으로 바꾼다(앞 판의 값을 두면 최신과 같아진 칸이 목록에 남는다).
        const now0=latest.card??this.#k.empty(date);
        try{saved=await this.#p.drafts.save({type:'ENTITY',body,...(Array.isArray(draft.touched)?{touched:[...draft.touched],...(this.#k.fields?{bases:Object.fromEntries(draft.touched.filter(k=>this.#k.fields.includes(k)).map(k=>[k,structuredClone(now0[k])]))}:{})}:{})},{base:draft.draftId});}
        catch(e){if(codeOf(e)===STALE_BASE){kept.clear();if(attempt<maxAttempts)continue;return {status:'STALE',code:STALE_BASE};}throw e;}
        await this.#p.drafts.discard(draft.draftId);
        target={draftId:saved.draftId,body};
      }
      collect(rb);left=target.draftId;
      let result;
      try{result=await this.#p.drafts.commit(target.draftId);}
      catch(e){
        const code=codeOf(e);
        if(code==='STALE_HEADS'&&attempt<maxAttempts)continue;
        if(this.#p.hasPending?.()){this.#sent.add(target.body.requestId);return sent({status:'UNKNOWN',code},rb.card);}
        return {status:REJECT_CODE.test(code)?'REJECTED':'FAILED',code};
      }
      if(result?.status==='ABORTED'){this.#aborted.add(target.body.requestId);return {status:'FAILED',code:'ABORTED'};}
      if(result?.status!=='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'){this.#sent.add(target.body.requestId);return sent({status:'UNKNOWN',code:result?.status??'NO_RESULT'},rb.card);}
      this.#sent.delete(target.body.requestId);
      return sent({status:'CONFIRMED',requestId:target.body.requestId},rb.card);
    }
    return {status:'STALE',code:'STALE_HEADS'};
  }
  #alive(){
    const s0=this.#p.session?.();
    const code=()=>this.#p.drafts.locked?.()?'CARD_DRAFT_LOCKED':'MD_SIGNED_OUT_ELSEWHERE';
    const gone=()=>this.#p.session?.()!==s0||Boolean(this.#p.drafts.locked?.());
    return {gone,code,check:()=>{if(gone())throw flowError(code());}};
  }
  async #settleSent(draft,ended){
    const rid=draft.body.requestId;
    if(this.#aborted.has(rid))return null;
    if(!(this.#sent.has(rid)||ended))return null;
    let result;
    try{result=await this.#p.drafts.commit(draft.draftId);}
    catch(e){
      const code=codeOf(e);
      if(code==='MD_TERMINAL_INTENT'||code==='STALE_HEADS'){this.#sent.delete(rid);this.#aborted.add(rid);return null;}
      return {status:this.#p.hasPending?.()?'UNKNOWN':'FAILED',code};
    }
    if(result?.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'){this.#sent.delete(rid);return {status:'ALREADY_APPLIED',requestId:rid,notices:[]};}
    if(result?.status==='ABORTED'){this.#sent.delete(rid);this.#aborted.add(rid);return null;}
    return {status:'UNKNOWN',code:result?.status??'NO_RESULT'};
  }
}

// "오늘 쌓기" 1탭: (1) 담아 둔 공부 초안이 있으면 먼저 공부 카드 확정(연산 1), (2) 이어서 LIFE_DAY 확정(연산 1).
// (1)이 실패하면 (2)를 하지 않고 두 초안을 그대로 둔다. (1) 성공 뒤 (2)가 실패하면 공부는 쌓인 채 오늘 카드 초안만 남는다.
// study = StudyFlow(공부 모듈이 꺼져 있으면 null). 돌려주는 값: {phase:'STUDY_FAILED'|'DONE', study, life}.
export const STACK_DONE=Object.freeze(['CONFIRMED','ALREADY_APPLIED']);
export async function stackDay(date,{life,study=null}){
  let studyResult=null;
  if(study&&(await study.state(date)).status==='LOCAL_DRAFT'){
    try{studyResult=await study.confirm(date);}
    catch(e){studyResult={status:'FAILED',code:codeOf(e)};}
    if(!STACK_DONE.includes(studyResult.status))return {phase:'STUDY_FAILED',study:studyResult,life:null};
  }
  let lifeResult;
  try{lifeResult=await life.confirm(date);}
  catch(e){lifeResult={status:'FAILED',code:codeOf(e)};}
  return {phase:'DONE',study:studyResult,life:lifeResult};
}

// ---- 포트: 앱의 api/기록 함수를 LifeFlow가 쓰는 모양으로 ----
// ctx: {api, getWhole(), getChanges(), syncForWrite(), hasPending(), reconcile(), receipt(), digest(), uid(), now(), cardDraftBox(), write(), session(), storage}
// kind = LIFE_KIND(기본) 또는 DIARY_KIND(FIX49B). 일기 포트는 확정 직전 쓰기 문(doorOpen)도 준다.
// 일기 이력 값은 글 칸을 뺀 사본이다(FIX49A, 이력 API·화면 가리기). 그래서 일기 base는 ① 지금 최신(heads가 그 판 하나) ② 이 실행에서 본 판 ③ 이력 사본 차례로 찾는다.
// ③은 점수·에너지·칩은 정확하지만 글·내일 한 가지는 모른다: UNKNOWN_BASE_TEXT로 채운다. FIX50A (HUNT49 A5): 초안의 바꾼 칸 목록에 없는 글 칸은 base를 내 값으로 보므로(diaryKnownBase)
// 다른 기기 글이 남는다. 이 기기가 실제로 바꾼 글 칸만 rebaseDiary가 내 글을 쓰고 상대 글이 다르면 알림을 낸다(글을 이어 붙이지 않음, 상대 글은 이력에 남는다).
export const UNKNOWN_BASE_TEXT='\u0000LB_BASE_TEXT_UNKNOWN';
const maskedBase=v=>typeof v?.text==='string'&&typeof v?.tomorrow==='string'?structuredClone(v):{date:v.date,score:v.score??null,energy:v.energy??null,good:[...(v.good??[])],bad:[...(v.bad??[])],tomorrow:UNKNOWN_BASE_TEXT,text:UNKNOWN_BASE_TEXT};
const storageOf=ctx=>{try{return ctx.storage??globalThis.localStorage??null;}catch{return null;}};
export function createLifePorts(ctx,kind=LIFE_KIND){
  const memoryDrafts=new Map();let seq=0,cache=null;
  const life=()=>ctx.getWhole().life??{days:[]},rowsNow=()=>kind.rows(life());
  const revisionMap=()=>{const rows=ctx.getChanges();if(cache?.rows===rows)return cache.map;const m=new Map();for(const c of rows)if(c.type===kind.type)m.set(c.revisionId,c.value.data);cache={rows,map:m};return m;};
  const seen=new Map();let seenOf=null;
  const remember=()=>{const l=life();if(seenOf===l)return;seenOf=l;for(const r of rowsNow())if(r.heads?.length===1&&!seen.has(r.heads[0]))seen.set(r.heads[0],structuredClone(r.data));};
  const box=ctx.cardDraftBox?.()??null,mode=box?.available()?'DEVICE_BOX':'MEMORY';
  const write=body=>ctx.write?ctx.write(body):ctx.api('/api/entity',body);
  return {
    mode,persistent:mode!=='MEMORY',box:mode==='DEVICE_BOX'?box:null,
    latest(date){if(kind.maskedHistory)remember();const d=rowsNow().find(x=>x.date===date);return {card:d?structuredClone(d.data):null,heads:d?[...d.heads]:[]};},
    revision(date,ref){
      if(!kind.maskedHistory){const v=revisionMap().get(ref);return v?structuredClone(v):null;}
      remember();
      const d=rowsNow().find(x=>x.date===date);if(d&&d.heads.length===1&&d.heads[0]===ref)return structuredClone(d.data);
      if(seen.has(ref))return structuredClone(seen.get(ref));
      const v=revisionMap().get(ref);return v?maskedBase(v):null;
    },
    doorOpen:()=>{const w=ctx.getWhole();return recordsDoorState({life:w.life??null,study:w.study??null,storage:storageOf(ctx)}).open;},
    sync:()=>ctx.syncForWrite(),
    session:()=>ctx.session?.()??null,
    hasPending:()=>Boolean(ctx.hasPending?.()),reconcile:()=>ctx.reconcile?.(),
    terminal:ctx.receipt?async rid=>(await ctx.receipt(rid))?.status!=='NOT_ESTABLISHED':()=>false,
    makeBody:async({requestId,date,data,heads,reason})=>{const fields={entityType:kind.type,entityId:date,expectedHeads:[...heads],data:structuredClone(data),reason,confirmed:false};return {requestId,commandDigest:await ctx.digest({type:'ENTITY',...fields}),...fields};},
    now:()=>ctx.now(),newRequestId:()=>ctx.uid(),
    drafts:mode==='DEVICE_BOX'?box.port(kind.type,{write}):{
      list:async()=>[...memoryDrafts.values()],
      save:async({type,body,touched,bases})=>{const id='local'+(++seq);memoryDrafts.set(id,{draftId:id,type,body:structuredClone(body),...(Array.isArray(touched)?{touched:[...touched],...(bases&&typeof bases==='object'?{bases:structuredClone(bases)}:{})}:{}),createdAt:new Date().toISOString()+String(seq).padStart(6,'0')});return {draftId:id,status:'LOCAL_DRAFT'};},
      discard:async id=>{memoryDrafts.delete(id);},
      commit:async id=>{const d=memoryDrafts.get(id);const r=await write(d.body);const status=r?.status==='LOCAL_SAVED'||r?.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'?'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED':r?.status;if(status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED')memoryDrafts.delete(id);return {...r,status};},
    },
  };
}

// 정의 저장(습관·과목·시험 일정): 소유자가 "저장"을 누를 때만 부른다. 엔티티마다 연산 1. 최신과 겹치면(STALE_HEADS) 최신을 받아 내 값을 그대로 쓴다.
// rows = [{type,id,data,heads}] — 바뀐 것만 넘긴다. 돌려주는 값 = 실제로 저장한 개수.
// FIX38 (R37C 위험 4): 임시 저장 모드에서는 봉인 초안으로만 들어가 목록에 안 보인다. 화면이 넘긴 memo의 sealed(그중 봉인된 줄 수)를 보고 성공이라고 말하지 않는다.
// memo.as = 지난번에 봉인한 내용. 초안을 남기면 저장을 또 누를 수 있어서, 아직 임시 저장 모드면 같은 내용을 다시 봉인하지 않는다(H37-P1과 같은 방식).
export const DEFS_SEALED_TEXT='임시 저장됨(동기화 전) · 아직 적용되지 않았고 입력은 그대로 있습니다 · 연결한 뒤 연결 · 장치의 임시 저장 목록에서 "승인하고 쌓기"를 누르세요.';
export async function saveDefinitions(ctx,rows,reason,memo={}){
  let saved=0,sealed=0;
  for(const r of rows)validateLifeData(r.type,r.id,r.data);   // 한 줄이라도 틀리면 아무것도 쓰지 않는다(쓰다가 끊기면 저장본이 반쪽이 된다, H37-Q1)
  const key=stable(rows);
  memo.sealed=0;
  if(rows.length&&memo.as===key&&await ctx.draftMode?.()){memo.sealed=rows.length;return 0;}
  for(const r of rows){
    let w;
    try{w=await ctx.entity(r.type,r.id,r.data,r.heads,reason);}
    catch(e){
      if(e?.code!=='STALE_HEADS'||!ctx.reload)throw e;
      await ctx.reload();
      const latest=lookup(ctx.getWhole().life,r.type,r.id);
      w=await ctx.entity(r.type,r.id,r.data,latest?latest.heads:[],reason);
    }
    saved++;if(w?.status==='LOCAL_DRAFT')sealed++;
  }
  memo.as=sealed?key:null;memo.sealed=sealed;
  return saved;
}
function lookup(life,type,id){
  if(!life)return null;
  if(type==='HABIT_DEF')return life.habits.find(x=>x.id===id)??null;
  if(type==='SUBJECT_DEF')return life.subjects.find(x=>x.id===id)??null;
  if(type==='EXAM_SCHEDULE')return life.exams;
  return null;
}
// 바뀐 정의만 골라 낸다. 저장된 정의가 하나도 없던 종류(기본값 상태)는 처음 저장 때 전부 쓴다. 숨김은 삭제가 아니다.
export function collectRows(work,life,defs=lifeDefs(life)){
  const rows=[];
  const pick=(type,list,stored,effective,defaults)=>{
    // 저장된 정의가 없는 구역은 소유자가 실제로 고친 경우에만 처음 저장한다(고치지 않은 기본값은 쓰지 않는다).
    if(!stored.length&&stable(list.map((x,i)=>({...x,order:i})))===stable(effective.map((x,i)=>({...x,order:i}))))return;
    // 저장본이 있는데 기본값이 빠졌으면 끊긴 첫 저장의 남은 줄이다(삭제 길이 없다). 다시 저장할 때 모두 써서 돌려놓는다(H37-Q1).
    const missing=stored.length?defaults.filter(d=>!list.some(x=>x.id===d.id)):[];
    [...list,...missing].forEach((x,i)=>{
      const data={...x,order:i};
      if(type==='HABIT_DEF'){data.name=String(data.name).trim();}
      if(type==='SUBJECT_DEF'){data.name=String(data.name).trim();}
      const old=stored.find(s=>s.id===x.id);
      if(old&&stable(old.data)===stable(data))return;
      rows.push({type,id:x.id,data,heads:old?old.heads:[]});
    });
  };
  pick('HABIT_DEF',work.habits,life.habits,defs.habits,DEFAULT_HABITS);
  pick('SUBJECT_DEF',work.subjects,life.subjects,defs.subjects,DEFAULT_SUBJECTS);
  const examData={items:work.exams.items.map(x=>({...x,name:String(x.name).trim()}))};
  if(stable(examData)!==stable(defs.exams))rows.push({type:'EXAM_SCHEDULE',id:'exams',data:examData,heads:life.exams?life.exams.heads:[]});
  return rows;
}

export {kstDate};
