// LIFE_DAY 하루 1장 흐름(임시 저장 → 쌓기). FIX49B: 같은 흐름을 일기(DIARY_DAY)도 쓴다(종류 설정 LIFE_KIND·DIARY_KIND, 복사하지 않음). hlt-flow와 같은 방식이다: 저장소·네트워크·시계·명령 서명(makeBody)은 ports로 주입한다.
// 하루 중 입력은 초안(이 기기의 암호화 상자 또는 메모리)에만 모이고 연산 0이다. "오늘 쌓기" 1번 = 확정 = 연산 1(같은 날 다시 쌓으면 연산 1 더).
// 화면을 열거나 동기화하는 것만으로는 어떤 엔티티도 쓰지 않는다: 쓰기는 confirm()과 saveDefinitions()(습관·과목·시험 편집 저장)에서만 일어난다.
// 초안은 확정 성공을 확인한 뒤에만 지운다. 검증 거부·저장 실패·응답 불명이면 초안을 그대로 둔다.
// 건강·공부와 달리 PC 초안 저널(drafts.lbd)은 쓰지 않는다: 저널의 목록 응답이 LIFE_DAY 본문을 돌려주지 않는다. 상자(브라우저 IndexedDB 암호문) 또는 메모리다.
import {validateLifeData,emptyDay,emptyDiary,kstDate,lifeDefs,recordsDoorState,DEFAULT_HABITS,DEFAULT_SUBJECTS,habitPinned,HABIT_UNPIN_ORDER,habitBasis,habitBasisFor,keepHabitBasis,HABIT_EPOCH} from './life-model.mjs';
import {rebase,rebaseDiary,hasChanges,diffDay,stable} from './life-rebase.mjs';

const codeOf=e=>typeof e?.code==='string'?e.code:(e?.message??'UNKNOWN');
const REJECT_CODE=/^(INVALID_|LIFE_|HABIT_|EXAM_|APP_ENTITY_LIMIT|REBASE_|INVALID_WHOLE_LIFE|DIARY_|RECORDS_DOOR_CLOSED)/;
export const DRAFT_REASON='오늘 카드 임시 저장';
export const CONFIRM_REASON='오늘 카드 쌓기';
const STALE_BASE='CARD_DRAFT_STALE_BASE',EDIT_ROUNDS=5,DRAFT_GONE='CARD_DRAFT_NOT_FOUND';
// FIX55C2 (HUNT53 HF9): 기록에 붙여 두는 알림 = "내 값을 썼다/지켰다" 종류만(상대 값을 남김·합침·잘림은 그 결과 카드에서만 사실이다).
const MINE_NOTICE=/(OVERWRITTEN|KEPT_MINE|KEPT_LOCAL)$/;
const flowError=code=>Object.assign(new Error(code),{code});
const sameHeads=(a,b)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
// FIX72 (FIX71 규칙): 화면에 보일 카드 = 쌓인 카드(latest) 위에 이 기기 초안을 칸 단위로 얹은 결과(그 종류의 rebase = 쌓기와 같은 규칙, 읽기만).
// 일기는 state의 base가 이미 "바꾼 칸만 내 것"(diaryKnownBase)이라 바꾸지 않은 칸은 쌓인 값이 보인다. 초안이 최신 카드 위에 있으면 초안 그대로, 합칠 수 없으면 초안 그대로.
export function shownCard(kind,s,latest){
  if(s?.status!=='LOCAL_DRAFT'||!latest||sameHeads(s.baseHeads??[],latest.heads??[]))return s?.card;
  const rb=kind.rebase({date:s.card.date,base:s.base,mine:s.card,latest:latest.card});
  return rb.status==='MERGED'?rb.card:rb.status==='ALREADY_APPLIED'?latest.card??s.card:s.card;
}
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
// chips = 상한이 있어 병합에서 잘릴 수 있는 칩 칸(FIX53B).
// basis = 쓰기 전에 습관 벽돌 기준을 카드에 적는 종류(FIX68, HUNT65 F2): 오늘(과 그 뒤) 카드는 쓸 때마다 지금 목록으로, 지난 카드는 이미 적힌 기준을 두고 없으면 habitBasisFor로 한 번 적는다.
//  FIX68B: 카드에 적는 것은 기록 문이 열렸을 때만(#basis). 닫혀 있으면 카드에는 칸이 없고 기준은 이 기기에만 둔다.
export const LIFE_KIND=Object.freeze({type:'LIFE_DAY',empty:emptyDay,rows:life=>life?.days??[],rebase,changed:hasChanges,diff:diffDay,draftReason:DRAFT_REASON,confirmReason:CONFIRM_REASON,door:false,maskedHistory:false,fields:null,knownBase:null,chips:null,basis:true});
export const DIARY_KIND=Object.freeze({type:'DIARY_DAY',empty:emptyDiary,rows:life=>life?.diaries??[],rebase:rebaseDiary,changed:diaryChanged,diff:diffDiary,draftReason:DIARY_DRAFT_REASON,confirmReason:DIARY_CONFIRM_REASON,door:true,maskedHistory:true,fields:DIARY_FIELDS,knownBase:diaryKnownBase,chips:Object.freeze(['good','bad']),basis:false});
// FIX53B (HUNT52 HF8): 칩 병합에서 상한 때문에 잘려 나간 칩. mergeChips는 내 칩을 먼저 남기므로(내 목록은 상한 안) 잘린 칩은 언제나 "최신이 더했고 내가 손대지 않은 칩"이다.
const droppedChips=(b,m,t,out)=>{const B=new Set(b??[]),M=new Set(m??[]),O=new Set(out??[]);return (t??[]).filter(x=>!B.has(x)&&!M.has(x)&&!O.has(x));};

export class LifeFlow{
  #p;#k;
  #sent=new Set();#aborted=new Set();#notes=new Map();   // #notes: 보낸 뒤 결과 모름(UNKNOWN)인 본문의 알림. FIX55C2: 기록(종류|날짜)별 Map(코드|칸 → {n,v,rid}), rid = 그 알림을 실은 본문
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
  // FIX68B (통제탑 2026-11-11): 기준(basis)은 기존 기록 문(recordsDoorState, 일기와 같은 문)이 열렸을 때만 카드에 적는다. r65 검사기는 basis 칸이 있는 LIFE_DAY를 거절한다.
  // 닫혀 있으면(문 포트가 없는 맨 포트 포함) 카드에서 빼고, 확정 때 이 기기 저장소(lb.habit.basis)에만 둔다(keepBasis). 열려 있으면 FIX68 그대로(포트가 없으면 예전 모양).
  #doorOpen(){return Boolean(this.#p.doorOpen?.());}
  #basis(date,card){
    if(!this.#k.basis)return;
    if(!this.#doorOpen()){delete card.basis;return;}
    const b=this.#p.basis?.(date,card);if(b)card.basis=b;
  }
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
      this.#basis(date,next);
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
      // FIX58F (HUNT55 HF12): 기록에 붙여 둔 "내 값" 알림(#notes)은 이 기록의 초안 줄기에 딸린다. 되돌려 초안을 버리면 지우고, 초안 없이 새로 시작하는 입력(앞 초안이 다른 곳에서 확정·폐기됨)도 지운다.
      const key=this.#k.type+'|'+date;
      try{
        if(!this.#k.changed(s.base,next)){if(s.draftId){await this.#p.drafts.discard(s.draftId,{input,date});this.#notes.delete(key);}else await this.#p.drafts.keep?.(date,{input,base:null});return this.state(date);}
        if(s.draftId&&stable(next)===stable(s.card)&&(!touched||touched.length===s.touched.length&&touched.every(k=>s.touched.includes(k)))){await this.#p.drafts.keep?.(date,{input,base:s.draftId});return s;}
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:next,heads:s.baseHeads,reason:this.#k.draftReason});
        await this.#p.drafts.save({type:'ENTITY',body,...(touched?{touched,bases:nextBases}:{})},{input,base:s.draftId});
        if(!s.draftId)this.#notes.delete(key);
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
  // FIX53B (HUNT52 HF5·HF6): 시도 사이에 초안이 바뀌어도(그 사이 입력·STALE) 모은 알림을 비우지 않고, 마지막으로 보낸 본문(f = 그 시도의 base·mine·card)에 비춰 사실인 것만 남긴다.
  //  "내 값을 썼다/지켰다"(OVERWRITTEN·KEPT_MINE·KEPT_LOCAL)와 합침 알림은 그 칸 값이 그 시도 값과 같을 때. 상대 값을 남김(KEPT_REMOTE)은 최종 카드에 그 값이 있고 내 변경이 들어가지 않았을 때.
  //  칩 잘림(TRIMMED)은 그 시도에서 잘린 칩이 최종 목록에 아직 없을 때.
  // FIX53B (HF7): 보낸 뒤 결과 모름(UNKNOWN)으로 끝난 본문의 알림은 requestId별로 기억해, 다시 저장에서 그 본문을 확인·적용한 결과(#settleSent)에 싣는다.
  // FIX55C2 (HUNT53 HF9·HF9-b): 그 알림 중 "내 값을 썼다/지켰다"(MINE_NOTICE)는 requestId가 아니라 이 기록(종류+날짜)에 붙여 둔다. 사용자가 그 사이 다른 칸을 고쳐 본문(requestId)이 바뀌어도,
  //  같은 기록의 다음 성공 결과(CONFIRMED·ALREADY_APPLIED)에서 이번 시도의 알림과 합쳐(같은 코드+칸은 이번 것) 그 결과 카드에 비춰 사실인 것만 한 번 싣고 지운다. 다른 날짜 결과에는 싣지 않는다.
  //  그 본문이 적용되지 않은 것으로 확인되면(중단·STALE) 그 본문이 붙인 알림만 지운다(다음 병합이 새 알림을 낸다, FIX53B-14).
  // FIX55C2 (HUNT53 HF10·HF10-b): 상자 확정이 CARD_DRAFT_NOT_FOUND(같은 기기 다른 창이 이 초안을 이미 바꿨거나 저장함)면 실패를 보이기 전에 1번 다시 읽는다(상자는 이미 디스크를 다시 읽었다).
  //  새 초안이 있으면 그 위에서 1번 다시 시도하고, 초안이 없고 금고 최신에 내 변경이 이미 있으면(rebase ALREADY_APPLIED) ALREADY_APPLIED다. 그래도 안 되면 지금 실패. 다시 읽기는 확정 1번에 1번뿐이다.
  async confirm(date,{maxAttempts=3}={}){
    const alive=this.#alive(),kept=new Map(),chips=this.#k.chips??[],key=this.#k.type+'|'+date;
    const valueOf=(card,n)=>stable(n.habitId!==undefined?card?.habits?.[n.habitId]:n.field!==undefined?card?.[n.field]:null);
    const keyOf=n=>n.code+'|'+(n.field??n.habitId??n.subjectId??'');
    const collect=(rb,f)=>{for(const n of rb.notices??[])kept.set(keyOf(n),{n,v:valueOf(rb.card,n),...(n.code==='DIARY_CHIPS_TRIMMED'&&chips.includes(n.field)?{dropped:droppedChips(f.base[n.field],f.mine[n.field],f.latest[n.field],rb.card[n.field])}:{})});};
    const holds=(x,f)=>{
      if(x.dropped)return x.dropped.some(c=>!(f.card[x.n.field]??[]).includes(c));
      const v=valueOf(f.card,x.n);
      if(/KEPT_REMOTE$/.test(x.n.code))return v!==undefined&&(valueOf(f.mine,x.n)===valueOf(f.base,x.n)||v!==valueOf(f.mine,x.n));
      return x.v===v;
    };
    const sent=(r,f)=>({...r,notices:[...kept.values()].filter(x=>holds(x,f)).map(x=>x.n)});
    // FIX55C2: 이 기록에 붙여 둔 "내 값" 알림 중 이번 결과(f)에서 사실인 것(have = 이번 결과가 이미 가진 코드+칸은 뺌). 꺼내면 지운다.
    const pend=(f,have)=>{const m=this.#notes.get(key);this.#notes.delete(key);return m?[...m].filter(([k,x])=>!have.has(k)&&MINE_NOTICE.test(x.n.code)&&holds(x,f)).map(([,x])=>x.n):[];};
    const done=(r,f)=>{const out=sent(r,f);return {...out,notices:[...out.notices,...pend(f,new Set(kept.keys()))]};};
    // 금고 최신에 내 변경이 이미 있음(쓰기 0): 이번 병합 알림 + 붙여 둔 "내 값" 알림(최신 카드에 비춰 거름).
    const applied=(rb,base,mine,card)=>({status:'ALREADY_APPLIED',notices:[...rb.notices,...pend({base,mine,latest:card,card},new Set(rb.notices.map(keyOf)))]});
    // 결과 모름: 이번 본문의 알림 전부(rid = 이 본문) + 앞 본문들에서 남은 "내 값" 알림을 이번 본문에 비춰 거른 뒤 기록에 붙이고 결과에도 싣는다.
    const unknown=(r,f,rid)=>{
      const m=new Map();
      for(const [k,x] of kept)if(holds(x,f))m.set(k,{...x,rid});
      for(const [k,x] of this.#notes.get(key)??[])if(!kept.has(k)&&MINE_NOTICE.test(x.n.code)&&holds(x,f))m.set(k,x);
      this.#sent.add(rid);if(m.size)this.#notes.set(key,m);else this.#notes.delete(key);
      return {...r,notices:[...m.values()].map(x=>x.n)};
    };
    let lost=null,limit=maxAttempts;   // FIX55C2: lost = CARD_DRAFT_NOT_FOUND로 사라진 본문의 {base,mine}(다시 읽기 1번)
    const relook=(base,mine)=>{lost={base,mine};limit++;};
    // FIX59F (HUNT57 HS57-2·HS57-3): lost가 있는데 초안이 사라졌거나 확정이 CARD_DRAFT_NOT_FOUND면 실패를 말하기 전에 금고 최신과 견준다.
    //  최신에 내 변경이 이미 있으면(다른 창이 이 초안·합친 초안을 확정함) ALREADY_APPLIED + elsewhere(다른 창에서 이미 저장됨, 쓰기 0). 병합 알림은 그 카드에 비춰 사실인 것만.
    //  없으면 FAILED. 이 날짜 초안에 내 변경이 남아 있으면 그대로(입력은 그대로 있음). 초안이 없으면 최신 위에 내 변경을 다시 얹은 초안을 두고 restored(연산 0).
    //  다시 얹지 못하면 lostInput(입력이 어디에도 없음 = 화면이 "그대로 있다"고 말하지 않는다).
    const gone=async()=>{
      const empty=this.#k.empty(date),latest=this.#p.latest(date),rb=this.#k.rebase({date,base:lost.base,mine:lost.mine,latest:latest.card});
      if(rb.status==='ALREADY_APPLIED'){
        const card=latest.card??empty,f={base:lost.base??empty,mine:lost.mine,latest:card,card},out=applied(rb,f.base,lost.mine,card),have=new Set(out.notices.map(keyOf));
        return {...out,elsewhere:true,notices:[...out.notices,...[...kept.values()].filter(x=>!have.has(keyOf(x.n))&&holds(x,f)).map(x=>x.n)]};
      }
      const fail={status:'FAILED',code:DRAFT_GONE},now=await this.#draftFor(date);
      if(now)return this.#k.rebase({date,base:lost.base,mine:lost.mine,latest:now.body.data}).status==='ALREADY_APPLIED'?fail:{...fail,lostInput:true};
      if(rb.status!=='MERGED')return {...fail,lostInput:true};
      try{await this.#restore(date,lost,latest,rb.card);}catch{return {...fail,lostInput:true};}
      return {...fail,restored:true};
    };
    for(let attempt=1;attempt<=limit;attempt++){
      if(attempt>1&&alive.gone())return {status:'FAILED',code:alive.code()};
      let draft=await this.#draftFor(date);
      if(!draft&&!lost)return {status:'NOTHING_TO_CONFIRM'};
      // FIX58F (HUNT55 HF11): 다시 읽기에서 다른 창의 새 초안이 있으면 그 초안을 그대로 확정하지 않는다. 이 창이 잃은 변경(lost의 base→mine)을 새 초안 위에 3자 병합해
      //  초안으로 다시 둔 뒤 확정한다(같은 칸이 다르면 rebase 규칙 = 내 값 + 덮어씀 알림). 병합 결과에 이 창 값이 없으면 지금 실패(시트를 닫지 않는다). 병합은 1번뿐이다.
      if(draft&&lost&&!lost.merged){
        const m=await this.#mergeLost(date,draft,lost);
        if(m.fail)return gone();
        if(m.retry){if(attempt<limit)continue;return {status:'STALE',code:STALE_BASE};}
        lost.merged=true;if(m.rb)collect(m.rb,m.f);
        draft=m.draft;if(!draft)return gone();
      }
      try{
        if(this.#p.hasPending?.())await this.#p.reconcile();
        await this.#p.sync();
      }catch(e){return {status:this.#p.hasPending?.()?'UNKNOWN':'SYNC_FAILED',code:codeOf(e)};}
      // FIX55C2 (HF10-b): 다른 창이 이 초안을 이미 저장(또는 버림)했다. 금고 최신에 내 변경이 그대로 있으면 성공, 아니면 지금 실패(FIX59F: 입력을 초안으로 다시 넣어 둠).
      if(!draft)return gone();
      // FIX49B (D49 5.2, FIX46A ★): 새 기록(일기)은 일반 저장 경로라 문이 없다. 최신을 받은 뒤(다른 기기가 연 문도 보이게) 쓰기 전에 문을 본다. 닫혀 있으면 아무것도 쓰지 않고 초안을 둔다.
      const open=this.#doorOpen();
      if(this.#k.door&&!open)return {status:'REJECTED',code:'RECORDS_DOOR_CLOSED'};
      const now=await this.#draftFor(date);
      if(!now)return lost?gone():{status:'NOTHING_TO_CONFIRM'};   // FIX58F: 잃은 변경이 있으면 "바뀐 것 없음"으로 닫지 않는다
      if(now.draftId!==draft.draftId){if(attempt<limit)continue;return {status:'STALE',code:STALE_BASE};}
      let ended;
      try{ended=Boolean(await this.#p.terminal?.(draft.body.requestId));}catch(e){return {status:'UNKNOWN',code:codeOf(e)};}
      const settled=await this.#settleSent(draft,ended);
      if(settled?.code===DRAFT_GONE&&!lost){relook(this.#draftBase(date,draft),draft.body.data);continue;}
      if(settled?.code===DRAFT_GONE&&settled.status==='FAILED')return gone();   // FIX59F (HS57-2): 합친 초안을 다른 창이 확정했으면 금고와 견준다
      if(settled)return settled;
      const latest=this.#p.latest(date),base=this.#draftBase(date,draft);
      const rb=this.#k.rebase({date,base,mine:draft.body.data,latest:latest.card});
      if(rb.status==='REJECTED')return {status:'REJECTED',code:rb.code};
      // FIX68B: 문 닫힘 = 최신(문 열린 기기)의 기준도 싣지 않는다. 그날 기준(합친 카드의 기준 → 이 기기 옛 날 기준 → 지금 목록)은 빼기 전에 정해 확정 때 이 기기에 둔다.
      let keep=null;
      if(this.#k.basis&&!open&&rb.card){keep=this.#p.basis?.(date,rb.card)??null;delete rb.card.basis;}
      const empty=this.#k.empty(date);
      if(rb.status==='ALREADY_APPLIED'){await this.#p.drafts.discard(draft.draftId);return applied(rb,base??empty,draft.body.data,latest.card??empty);}
      const f={base:base??empty,mine:draft.body.data,latest:latest.card??empty,card:rb.card};
      let target=draft;
      if(!(stable(draft.body.data)===stable(rb.card)&&sameHeads(draft.body.expectedHeads,latest.heads))||ended||this.#aborted.has(draft.body.requestId)){
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:rb.card,heads:latest.heads,reason:this.#k.confirmReason});
        let saved;
        // FIX52C: 다시 저장한 초안의 판은 최신이다. bases도 최신 판의 값으로 바꾼다(앞 판의 값을 두면 최신과 같아진 칸이 목록에 남는다).
        // FIX53B (HUNT52 HF8): 칩 칸의 base에서는 이번에 잘려 나간 칩(다른 기기가 더한 칩)을 뺀다. 최신 판 그대로 두면 다음 병합에서 그 칩이 "내가 뺀 칩"이 되어
        // 자리가 생겨도 지워진다. 빼 두면 그 칩은 다시 "상대가 더한 칩"이라 자리가 있으면 돌아온다. 내가 더한 칩·내가 뺀 칩(초안 값 ↔ base)은 그대로다.
        const now0=f.latest,baseOf=k=>chips.includes(k)?now0[k].filter(x=>!droppedChips(f.base[k],f.mine[k],now0[k],rb.card[k]).includes(x)):structuredClone(now0[k]);
        try{saved=await this.#p.drafts.save({type:'ENTITY',body,...(Array.isArray(draft.touched)?{touched:[...draft.touched],...(this.#k.fields?{bases:Object.fromEntries(draft.touched.filter(k=>this.#k.fields.includes(k)).map(k=>[k,baseOf(k)]))}:{})}:{})},{base:draft.draftId});}
        catch(e){if(codeOf(e)===STALE_BASE){if(attempt<limit)continue;return {status:'STALE',code:STALE_BASE};}throw e;}
        await this.#p.drafts.discard(draft.draftId);
        target={draftId:saved.draftId,body};
      }
      collect(rb,f);
      if(keep)this.#p.keepBasis?.(date,keep);   // FIX68B: 문 닫힘 = 쌓을 때의 기준은 이 기기에만
      let result;
      try{result=await this.#p.drafts.commit(target.draftId);}
      catch(e){
        const code=codeOf(e);
        if(code==='STALE_HEADS'&&attempt<limit)continue;
        if(code===DRAFT_GONE&&!lost){relook(target===draft?base:latest.card,target.body.data);continue;}   // FIX55C2 (HF10)
        if(code===DRAFT_GONE&&!this.#p.hasPending?.())return gone();   // FIX59F: 다시 읽은 뒤에도 초안이 없으면 금고와 견준다(다시 확정하지 않음)
        if(this.#p.hasPending?.())return unknown({status:'UNKNOWN',code},f,target.body.requestId);
        return {status:REJECT_CODE.test(code)?'REJECTED':'FAILED',code};
      }
      if(result?.status==='ABORTED'){this.#aborted.add(target.body.requestId);return {status:'FAILED',code:'ABORTED'};}
      if(result?.status!=='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED')return unknown({status:'UNKNOWN',code:result?.status??'NO_RESULT'},f,target.body.requestId);
      this.#sent.delete(target.body.requestId);
      return done({status:'CONFIRMED',requestId:target.body.requestId},f);
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
    // FIX53B (HF7): 이 본문의 알림(보낼 때 기억한 것)은 적용을 확인하면 싣고, 결과를 아직 모르면 UNKNOWN에 다시 싣는다. 버려진 본문(중단·STALE)이면 지운다(다음 병합이 새 알림을 낸다).
    // FIX55C2: 알림은 기록(종류|날짜)에 붙어 있다. 이 본문의 알림 전부 + 앞 본문들에서 남은 "내 값" 알림을 싣고, 적용을 확인하면 그 기록의 알림을 지운다. 버려진 본문이면 그 본문이 붙인 것만 지운다.
    const key=this.#k.type+'|'+draft.body.entityId,notes=()=>[...(this.#notes.get(key)?.values()??[])].filter(x=>x.rid===rid||MINE_NOTICE.test(x.n.code)).map(x=>x.n);
    const drop=()=>{this.#sent.delete(rid);const m=this.#notes.get(key);if(!m)return;for(const [k,x] of [...m])if(x.rid===rid)m.delete(k);if(!m.size)this.#notes.delete(key);};
    let result;
    try{result=await this.#p.drafts.commit(draft.draftId);}
    catch(e){
      const code=codeOf(e);
      if(code==='MD_TERMINAL_INTENT'||code==='STALE_HEADS'){drop();this.#aborted.add(rid);return null;}
      return this.#p.hasPending?.()?{status:'UNKNOWN',code,notices:notes()}:{status:'FAILED',code};
    }
    if(result?.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'){const out=notes();this.#sent.delete(rid);this.#notes.delete(key);return {status:'ALREADY_APPLIED',requestId:rid,notices:out};}
    if(result?.status==='ABORTED'){drop();this.#aborted.add(rid);return null;}
    return {status:'UNKNOWN',code:result?.status??'NO_RESULT',notices:notes()};
  }
  // FIX58F (HUNT55 HF11): 사라진 본문(lost = {base,mine})의 변경을 다른 창의 새 초안(draft) 위에 합친다. 돌려주는 값:
  //  {draft} 새 초안에 이미 내 변경이 있음(그대로) · {draft,rb,f} 합친 초안을 새로 둠(rb·f = 병합 알림) · {fail} 합칠 수 없거나 합친 결과에 내 값이 없음 · {retry} 그 사이 초안이 또 바뀜.
  //  합친 초안의 판(heads)은 새 초안 그대로다. 바꾼 칸 목록은 두 쪽 합집합이고, 내가 바꾼 칸의 base 값은 사라진 본문의 base 값이다(모르는 글은 두지 않음 = 예전 규칙).
  async #mergeLost(date,draft,lost){
    const lb=lost.base??this.#k.empty(date),theirs=draft.body.data;
    const rb=this.#k.rebase({date,base:lost.base,mine:lost.mine,latest:theirs});
    if(rb.status==='ALREADY_APPLIED')return {draft};
    if(rb.status!=='MERGED'||this.#k.rebase({date,base:lost.base,mine:lost.mine,latest:rb.card}).status!=='ALREADY_APPLIED')return {fail:true};
    const F=this.#k.fields;let extra={};
    if(F&&Array.isArray(draft.touched)){
      const mine=F.filter(k=>stable(lb[k])!==stable(lost.mine[k])),bases=basesOf(draft.bases,draft.touched);
      for(const k of mine)if(!draft.touched.includes(k)&&lb[k]!==UNKNOWN_BASE_TEXT)bases[k]=structuredClone(lb[k]);
      extra={touched:F.filter(k=>draft.touched.includes(k)||mine.includes(k)),bases};
    }
    const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:rb.card,heads:draft.body.expectedHeads,reason:this.#k.draftReason});
    try{await this.#p.drafts.save({type:'ENTITY',body,...extra},{base:draft.draftId});}
    catch(e){if(codeOf(e)===STALE_BASE)return {retry:true};throw e;}
    await this.#p.drafts.discard(draft.draftId);
    return {draft:await this.#draftFor(date),rb,f:{base:lb,mine:lost.mine,latest:theirs,card:rb.card}};
  }
  // FIX59F (HUNT57 HS57-3): 초안이 사라져 내 입력이 어디에도 없을 때 최신(latest) 위에 내 변경을 다시 얹은 카드(card)를 새 초안으로 둔다(연산 0, 확정은 사용자가 다시 누를 때).
  //  판(heads)은 최신이고, 바꾼 칸 목록은 사라진 본문이 바꾼 칸, 그 base 값은 최신 판의 값이다(FIX52C와 같은 뜻).
  async #restore(date,lost,latest,card){
    const F=this.#k.fields,lb=lost.base??this.#k.empty(date),now=latest.card??this.#k.empty(date);
    const touched=F?F.filter(k=>stable(lb[k])!==stable(lost.mine[k])):null;
    const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:card,heads:latest.heads,reason:this.#k.draftReason});
    await this.#p.drafts.save({type:'ENTITY',body,...(touched?{touched,bases:Object.fromEntries(touched.map(k=>[k,structuredClone(now[k])]))}:{})},{base:null});
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
    // FIX68 (HUNT65 F2): 쓰려는 카드의 습관 벽돌 기준. 오늘·앞날 = 지금 목록, 지난 날 = 카드에 적힌 기준 → 이 기기가 정해 둔 옛 날 기준 → 지금 목록. HABIT_EPOCH 전 날은 null.
    basis:(date,card)=>{const l=life(),b=date<HABIT_EPOCH?null:date>=kstDate(ctx.now())?habitBasis(l):habitBasisFor(l,date,card);return b?structuredClone(b):null;},
    // FIX68B: 문이 닫혀 있을 때 쌓는 카드의 기준은 이 기기 저장소(lb.habit.basis, frozenBasis가 읽는 곳)에만 둔다. 같은 날은 덮어쓴다(문 열림의 "오늘 카드는 쓸 때마다 지금 목록"과 같다).
    keepBasis:(date,b)=>keepHabitBasis(storageOf(ctx),date,b),
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
// DSFIX D1 (HUNTDS): bases = 시트를 열 때(색 화면은 그릴 때) 값, 키 '종류|id'. 있으면 STALE_HEADS 재시도에서 3방향으로 얹는다:
// 최신 값 위에 내가 바꾼 칸만(내가 안 바꾼 칸은 최신 유지). 같은 칸을 다른 기기도 다르게 바꿨으면 남은 줄을 하나도 쓰지 않고 DEFS_CHANGED_ELSEWHERE.
// 쓰는 기록 모양(칸·종류)은 그대로다. bases가 없는 부르는 쪽(내 퀘스트 등)은 예전처럼 내 값을 그대로 쓴다.
export const DEFS_CHANGED_ELSEWHERE='DEFS_CHANGED_ELSEWHERE';
export function mergeDefinition(base,mine,latest){
  const out={...latest};
  for(const k of new Set([...Object.keys(base),...Object.keys(mine)])){
    if(stable(mine[k])===stable(base[k]))continue;
    if(stable(latest[k])!==stable(base[k])&&stable(latest[k])!==stable(mine[k]))throw Object.assign(new Error(DEFS_CHANGED_ELSEWHERE),{code:DEFS_CHANGED_ELSEWHERE,field:k});
    if(mine[k]===undefined)delete out[k];else out[k]=mine[k];
  }
  return out;
}
export async function saveDefinitions(ctx,rows,reason,memo={},bases=null){
  let saved=0,sealed=0;
  for(const r of rows)validateLifeData(r.type,r.id,r.data);   // 한 줄이라도 틀리면 아무것도 쓰지 않는다(쓰다가 끊기면 저장본이 반쪽이 된다, H37-Q1)
  const key=stable(rows);
  memo.sealed=0;
  if(rows.length&&memo.as===key&&await ctx.draftMode?.()){memo.sealed=rows.length;return 0;}
  const todo=rows.map(r=>({...r}));
  for(let i=0;i<todo.length;i++){
    const r=todo[i];
    if(r.same)continue;
    let w;
    try{w=await ctx.entity(r.type,r.id,r.data,r.heads,reason);}
    catch(e){
      if(e?.code!=='STALE_HEADS'||!ctx.reload)throw e;
      await ctx.reload();
      if(!bases){
        const latest=lookup(ctx.getWhole().life,r.type,r.id);
        r.heads=latest?latest.heads:[];
      }else{
        // 남은 줄을 모두 최신 위에 먼저 합쳐 본다: 하나라도 같은 칸이 부딪치면 아무것도 더 쓰지 않는다
        const life=ctx.getWhole().life;
        for(let j=i;j<todo.length;j++){
          const x=todo[j],latest=lookup(life,x.type,x.id),base=bases[x.type+'|'+x.id];
          if(!latest||!base){x.heads=latest?latest.heads:[];continue;}
          const data=mergeDefinition(base,rows[j].data,latest.data);
          validateLifeData(x.type,x.id,data);
          Object.assign(x,{data,heads:latest.heads,same:stable(data)===stable(latest.data)});
        }
        if(r.same)continue;   // 내가 바꾼 칸이 이미 최신과 같다: 쓸 것 없음
      }
      w=await ctx.entity(r.type,r.id,r.data,r.heads,reason);
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
      if(type==='HABIT_DEF'){data.name=String(data.name).trim();if(!habitPinned(x))data.order=HABIT_UNPIN_ORDER+i;}   // V6B: 고정 안 한 습관은 order 구간 500~(칸 그대로)
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

// ---- OPS1A (통제탑 2026-11-11): 계획 줄 고치기 묶기 ----
// 금고는 평생 연산 10,000번이라, 계획 줄을 고칠 때마다 PLAN_DAY를 쓰지 않고 이 기기 초안 상자(card-draft-box의 PLAN_DAY 종류, 암호문 · 창을 닫아도 남음)에 {base, mine}을 둔다(연산 0).
// 쌓기(자동 쌓기 5분 · 지금 쌓기 · 저장 후 종료)가 flush로 날마다 기존 저장 함수 1번(PLAN_DAY 1개 = 연산 1) → 같은 날 여러 번 고쳐도 쌓을 때 1번.
// base = 처음 고치기 시작한 때의 금고 값(초안이 있는 동안 그대로). 쌓을 때 그 사이 다른 기기가 바꾼 줄은 기존 줄 id 3자 병합(rebase = life-plan rebasePlan)이 합친다(손실 0).
// 화면은 overlay(life)로 초안 값을 바로 본다(누른 즉시 반영). 상자가 없는 환경(메모리 초안)에서는 앱이 만들지 않는다 → 예전처럼 바로 저장.
// 저장 형식·스키마 변경 없음: 상자 본문은 확정 본문과 같은 PLAN_DAY 모양에 base(planBase)만 더 둔다(암호문 안, 금고 쓰기 본문에는 넣지 않음).
// 금고에 직접 쓰지 않는다: 쓰기는 넘겨받은 write(앱 = life-plan savePlanDay에 direct:true) 한 곳이다. 새 공개 모듈을 만들지 않으려고 같은 초안 흐름 모듈에 둔다.
export const PLAN_DRAFT_REASON='하루 계획 저장';
const PLAN_DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const planRowOf=(life,date)=>(life?.plans??[]).find(p=>p.date===date)??null;
// port = 상자의 port('PLAN_DAY') 모양(list·save·discard). box = 쓰기가 디스크에 닿았는지 볼 상자(statusFor, 없으면 닿은 것으로 봄).
// rebase = rebasePlan, write(ctx,{date,base,mine}) = 실제 저장, now = 초안 시각(시험은 고정 시계).
// FIX70 (HUNT67 F1·F4, 통제탑 2026-11-11): 같은 기기 두 창이 한 상자를 쓴다. 고칠 때마다(put)·쌓을 때마다(flush) 디스크의 초안을 다시 읽어 기준으로 삼고,
// 상자 저장에 {base: 읽은 초안 draftId}를 넘겨 그 사이 다른 창이 바꿨으면(CARD_DRAFT_STALE_BASE·STALE_DRAFT) 다시 읽어 그 위에 rebasePlan으로 얹는다(정해진 횟수).
// 다른 창 초안 위에 합치지 못하거나 끝내 저장하지 못하면 덮어쓰지 않고 null(부른 쪽이 예전처럼 바로 저장) → 어떤 길에서도 다른 창의 줄을 조용히 지우지 않는다.
// 잠긴 채 읽은 캐시(blind)는 잠금이 풀린 뒤 다시 읽어야 한다(앱이 blind()를 보고 reload). put·flush는 언제나 다시 읽으므로 빈 캐시로 저장하지 않는다.
const PLAN_PUT_ROUNDS=3;
export function createPlanDrafts({port,box=null,getLife,rebase:rebasePlan,write,now=()=>new Date().toISOString()}){
  const cache=new Map();let ver=0,memo=null,blind=false;
  const changed=()=>{ver++;memo=null;};
  const locked=()=>Boolean(port.locked?.());
  const read=async(fresh=false)=>{
    blind=locked();
    const list=await port.list(fresh?{fresh:true}:undefined),next=new Map();
    if(locked())blind=true;
    for(const d of list){
      const b=d?.body;if(d?.type!=='ENTITY'||b?.entityType!=='PLAN_DAY'||!PLAN_DATE_RE.test(b.entityId??'')||!b.data)continue;
      const cur=next.get(b.entityId);if(cur&&cur.createdAt>d.createdAt)continue;
      next.set(b.entityId,{draftId:d.draftId,base:b.planBase??null,mine:b.data,heads:[...(b.expectedHeads??[])],createdAt:d.createdAt});
    }
    cache.clear();for(const [k,v] of next)cache.set(k,v);changed();
  };
  const ready=read().catch(()=>{});
  // 상자에 실제로 써졌는지(쓰기 실패·거부를 상자가 던지지 않을 수 있다). 상자를 모르면 써진 것으로 본다(시험 포트).
  const persisted=date=>{const s=box?.statusFor?.('PLAN_DAY',date);return !s||(s.has&&!s.dirty&&!s.own);};
  // FIX70: 이 창이 디스크에 둔 적 없는 STALE 입력만 버린다(상자: 메모리에서 빼고 디스크를 다시 읽음, 다른 창 초안은 그대로). 디스크에 있는 초안은 지우지 않는다.
  const dropStale=async draftId=>{try{const x=(await port.list()).find(v=>v?.draftId===draftId);if(x)await port.discard(x.draftId);}catch{/* 다음 put·flush가 디스크를 다시 읽는다 */}};
  const api={
    ready,reload:()=>read(true),blind:()=>blind&&!locked(),
    count:()=>cache.size,dates:()=>[...cache.keys()].sort(),get:date=>cache.has(date)?structuredClone(cache.get(date)):null,
    // 화면 기준값(base)과 지금 보이는 값(디스크의 초안 또는 금고)이 다르면 그 위에 줄 id 3자 병합. 결과가 처음 base와 같아지면 초안을 지운다(쌓을 것 없음).
    // 돌려주는 값은 savePlanDay와 같은 모양 + drafted:true. null = 상자에 남기지 못함(부른 쪽이 예전처럼 바로 저장한다, 입력을 잃지 않게).
    async put(date,base,mine){
      await ready;
      for(let round=1;round<=PLAN_PUT_ROUNDS;round++){
        const was=cache.get(date)?.draftId??null;
        try{await read(true);}catch{return null;}   // FIX70: 디스크를 읽지 못하면 기준을 모른다 → 묶지 않는다
        const d=cache.get(date),row=planRowOf(getLife(),date),stored=row?.data??null,shown=d?d.mine:stored,other=(d?.draftId??null)!==was;
        let next=mine,notices=[];
        if(stable(shown)!==stable(base??null)){
          const rb=rebasePlan({date,base,mine,latest:shown});
          if(rb.status==='REJECTED'){if(other)return null;throw flowError(rb.code);}   // FIX70: 다른 창 초안 위에 합치지 못함 → 덮어쓰지 않고 바로 저장
          if(rb.status==='ALREADY_APPLIED')return {status:'ALREADY_APPLIED',notices:rb.notices};
          next=rb.plan;notices=rb.notices;
        }else if(shown&&stable(shown)===stable(mine))return {status:'ALREADY_APPLIED',notices:[]};
        const keep=d?d.base:stored,heads=d?d.heads:row?[...row.heads]:[];
        if(stable(next)===stable(keep)){
          if(d){await port.discard(d.draftId);if(cache.get(date)===d){cache.delete(date);changed();}}
          return {status:'SAVED',drafted:true,notices,plan:next};
        }
        const body={entityType:'PLAN_DAY',entityId:date,expectedHeads:heads,data:structuredClone(next),planBase:keep===null?null:structuredClone(keep),reason:PLAN_DRAFT_REASON};
        let r;
        try{r=await port.save({type:'ENTITY',body},{base:d?.draftId??null});}
        catch(e){if(e?.code==='CARD_DRAFT_STALE_BASE')continue;throw e;}   // 읽은 뒤 다른 창이 바꿨다 → 다시 읽어 그 위에
        if(!persisted(date)){
          // STALE(읽은 뒤 다른 창이 디스크를 바꿈)이면 이 입력만 버리고 다시 읽어 그 위에 얹는다. 다른 실패(공간·키)는 디스크 초안을 지우지 않고 바로 저장으로.
          if(box?.statusFor?.('PLAN_DAY',date)?.own==='STALE_DRAFT'){await dropStale(r?.draftId);continue;}
          return null;
        }
        cache.set(date,{draftId:r?.draftId??null,base:keep,mine:structuredClone(next),heads,createdAt:now()});changed();
        return {status:'SAVED',drafted:true,notices,plan:next};
      }
      return null;
    },
    // 쌓기: 날짜 순으로 날마다 write 1번. 성공(쓰기·이미 같음·임시 저장 봉인)한 날만 초안을 지운다. 실패한 날은 초안 그대로(입력을 잃지 않음).
    // FIX70: 쌓기 전에 디스크를 다시 읽는다(다른 창이 고친 초안·잠긴 채 만든 빈 캐시). 읽지 못하면 아는 것만 쌓는다.
    async flush(ctx){
      await ready;let stacked=0,failed=0;const codes=[];
      try{await read(true);}catch{/* 캐시 그대로 */}
      for(const date of api.dates()){
        const d=cache.get(date);if(!d)continue;
        try{await write(ctx,{date,base:d.base,mine:d.mine});}catch(e){failed++;codes.push(typeof e?.code==='string'?e.code:'FAILED');continue;}
        try{if(d.draftId)await port.discard(d.draftId);}catch{/* 다음 쌓기에서 같은 값 = ALREADY_APPLIED(연산 0) */}
        if(cache.get(date)===d){cache.delete(date);changed();}
        stacked++;
      }
      return {stacked,failed,codes};
    },
    // 화면용 life: plans에 초안 값을 얹는다(금고 heads는 그대로). 같은 life·같은 초안이면 같은 객체(다시 그려도 캐시가 깨지지 않게).
    // FIX72 (FIX71 규칙): 금고 값이 초안의 base와 다르면(같은 기기 다른 창이 그 사이 쌓음) 초안을 통째로 보이지 않고 쌓인 줄 위에 이 초안의 줄을 줄 id 단위로 얹는다
    // (쌓기 flush가 쓰는 rebasePlan과 같은 규칙, 읽기만). 이미 다 들어 있으면 금고 값, 합칠 수 없으면 예전처럼 초안 그대로.
    overlay(life){
      if(!cache.size||!life)return life;
      if(memo?.life===life&&memo.ver===ver)return memo.out;
      const shown=(p,d)=>{
        if(typeof rebasePlan!=='function'||stable(p.data??null)===stable(d.base??null))return structuredClone(d.mine);
        const rb=rebasePlan({date:p.date,base:d.base,mine:d.mine,latest:p.data});
        return structuredClone(rb.status==='MERGED'?rb.plan:rb.status==='ALREADY_APPLIED'?p.data:d.mine);
      };
      const plans=(life.plans??[]).map(p=>cache.has(p.date)?{...p,data:shown(p,cache.get(p.date))}:p);
      for(const [date,d] of cache)if(!plans.some(p=>p.date===date))plans.push({date,id:date,data:structuredClone(d.mine),heads:[],updatedAt:null});
      plans.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);   // lifeRawView와 같이 최신 날짜가 앞
      const out={...life,plans};memo={life,ver,out};return out;
    },
  };
  return api;
}

export {kstDate};
