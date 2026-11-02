// HLT_DAY 하루 1장 흐름(초안 → 확정). 저장소·네트워크·시계·명령 서명(makeBody)은 ports로 주입한다(시험은 진짜 서비스를, 화면은 앱의 api를 꽂는다). 불러오는 모듈 없음.
// 초안 = 기존 오프라인 초안 저널(drafts.lbd)의 ENTITY 초안 1건: data=내 카드, expectedHeads=편집을 시작한 시점의 카드 heads(base).
// base 카드는 그래프 이력(revision)에서 heads로 다시 읽으므로 base·변경 목록이 앱을 껐다 켜도 복원된다. 초안 입력은 연산 0, "확정" 1번 = 연산 1.
// 초안은 확정 성공을 확인한 뒤에만 지운다. 검증 거부·저장 실패·응답 불명이면 초안을 그대로 둔다.
import {validateHltData,kstDate,dayNumber,isoOK,MAX_SLEEP_MS} from './hlt-model.mjs';
import {rebase,emptyCard,hasChanges,diffCard,stable} from './hlt-rebase.mjs';

const codeOf=e=>typeof e?.code==='string'?e.code:(e?.message??'UNKNOWN');
const REJECT_CODE=/^(INVALID_|HLT_|UNKNOWN_HLT|DUPLICATE_HLT|BROKEN_HLT|APP_ENTITY_LIMIT|REBASE_|INVALID_TEXT|INVALID_WHOLE_LIFE)/;
export const DRAFT_REASON='건강 카드 임시 저장';
export const CONFIRM_REASON='건강 카드 확정';

const sameHeads=(a,b)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
// B16: 초안 상자가 "이 카드를 계산한 뒤 그 날짜 초안이 바뀜"을 알리는 코드. 편집은 최신 초안을 다시 읽어 같은 변경을 다시 적용한다(정해진 횟수까지).
const STALE_BASE='CARD_DRAFT_STALE_BASE',EDIT_ROUNDS=5;
const flowError=code=>Object.assign(new Error(code),{code});

export class HltFlow{
  #p;
  // B17: 이번 실행에서 확정 결과를 모르게 끝난 requestId(#sent)와 결말이 ABORTED·미반영으로 확인된 requestId(#aborted).
  // 영수증 상태를 알려 주지 않는 포트(앱의 메모리·상자)에서도 재확정이 원래 requestId에 수렴하고, 결말 난 requestId는 다시 쓰지 않게 한다.
  #sent=new Set();#aborted=new Set();
  constructor(ports){this.#p=ports;}
  async #draftFor(date){
    const list=(await this.#p.drafts.list()).filter(d=>d.type==='ENTITY'&&d.body?.entityType==='HLT_DAY'&&d.body.entityId===date);
    if(!list.length)return null;
    return list.reduce((a,b)=>(b.createdAt>=a.createdAt?b:a));
  }
  #baseOf(date,heads){return heads.length?this.#p.revision(date,heads[0]):null;}
  // 화면이 보여 줄 상태: NONE(카드 없음), CONFIRMED(금고에 있음, 초안 없음), LOCAL_DRAFT(이 기기에만 있는 초안).
  async state(date){
    const draft=await this.#draftFor(date),latest=this.#p.latest(date);
    if(draft){
      const base=this.#baseOf(date,draft.body.expectedHeads);
      return {status:'LOCAL_DRAFT',card:structuredClone(draft.body.data),base,baseHeads:[...draft.body.expectedHeads],draftId:draft.draftId,changes:diffCard(base,draft.body.data),latestConfirmCount:latest.card?.confirmCount??0};
    }
    return {status:latest.card?'CONFIRMED':'NONE',card:latest.card?structuredClone(latest.card):{...emptyCard(date),confirmCount:1},base:latest.card,baseHeads:[...latest.heads],draftId:null,changes:diffCard(latest.card,latest.card),latestConfirmCount:latest.card?.confirmCount??0};
  }
  // 입력 즉시 디스크(초안 저널)에 저장한다. 검증에 걸리면 아무것도 바꾸지 않고 던진다. 변경이 base와 같아지면 초안을 지운다.
  // B16 (K1-01): input = 초안 상자의 defer 토큰(이 편집을 시작한 입력). 저장·되돌리기에 어느 초안 위에서 계산했는지(base)를 함께 넘기고,
  // 그 사이 다른 칸·직접 호출이 초안을 바꿨으면(CARD_DRAFT_STALE_BASE) 최신 초안 위에 mutate를 다시 적용한다(독립 항목을 덮지 않음).
  // 저널·메모리 초안 포트는 두 번째 인자를 쓰지 않는다.
  // B18 (H13-N01): 값이 같아 저장·삭제 없이 끝나도 drafts.keep으로 이 입력을 그 칸의 최신 세대로 알린다(상자만, 쓰기 0).
  // B18 (H13-C05): 다시 적용하는 회차마다 시작 전에 로그아웃·세대 변경을 확인하고, 바뀌었으면 쓰기 없이 멈춘다(B14와 같은 세대 검사).
  async edit(date,mutate,{input=null}={}){
    const alive=this.#alive();
    for(let round=1;;round++){
      if(round>1)alive.check();
      const s=await this.state(date),next=structuredClone(s.card);
      mutate(next);
      next.date=date;next.confirmCount=(s.base?.confirmCount??0)+1;
      validateHltData('HLT_DAY',date,next);
      try{
        if(!hasChanges(s.base,next)){if(s.draftId)await this.#p.drafts.discard(s.draftId,{input,date});else await this.#p.drafts.keep?.(date,{input,base:null});return this.state(date);}
        if(s.draftId&&stable(next)===stable(s.card)){await this.#p.drafts.keep?.(date,{input,base:s.draftId});return s;}
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:next,heads:s.baseHeads,reason:DRAFT_REASON});
        await this.#p.drafts.save({type:'ENTITY',body},{input,base:s.draftId});
      }catch(e){if(e?.code===STALE_BASE&&round<EDIT_ROUNDS)continue;throw e;}
      if(s.draftId)await this.#p.drafts.discard(s.draftId,{input});
      return this.state(date);
    }
  }
  addItem(date,item){return this.edit(date,c=>{c.items.push({...item,id:item.id??this.#p.newId()});});}
  updateItem(date,item){return this.edit(date,c=>{const i=c.items.findIndex(x=>x.id===item.id);if(i<0){const e=new Error('UNKNOWN_HLT_ITEM');e.code='UNKNOWN_HLT_ITEM';throw e;}c.items[i]=item;});}
  removeItem(date,id){return this.edit(date,c=>{c.items=c.items.filter(x=>x.id!==id);});}
  setNote(date,note,opts){return this.edit(date,c=>{if(note===null||note==='')delete c.note;else c.note=note;},opts);}

  // 빠른 입력(연산 0): 현재 시각으로 초안에 넣는다.
  quickMeal(kind,size=null){const now=this.#p.now();return this.addItem(kstDate(now),{type:'meal',at:now,kind,size});}
  async quickHabit(profileKey,profile){
    const now=this.#p.now(),date=kstDate(now);
    if(profile.mode==='CHECK'){const s=await this.state(date);if(s.card.items.some(i=>i.type==='habit'&&i.profileKey===profileKey))return {...s,already:true};}
    return this.addItem(date,{type:'habit',profileKey,count:1,at:now});
  }
  // 지금 취침: 카드가 아니라 이 기기의 임시 상태에 시각만 저장한다.
  quickSleep(){const now=this.#p.now();this.#p.pendingSleep.set(now);return {pendingSleepStart:now};}
  // 지금 기상: pending이 있으면 sleep(startAt=pending,endAt=지금)과 wake를 기상일 카드 초안에 함께 넣고 pending을 비운다.
  // pending이 없거나 48시간이 넘었거나 카드 날짜 창(앞뒤 1일)을 벗어나면 wake만 넣는다(수면은 수동 입력).
  async quickWake(){
    const now=this.#p.now(),date=kstDate(now),pend=this.#p.pendingSleep.get();
    const ok=pend&&isoOK(pend)&&Date.parse(now)-Date.parse(pend)>=0&&Date.parse(now)-Date.parse(pend)<=MAX_SLEEP_MS&&dayNumber(date)-dayNumber(kstDate(pend))<=1;
    const wake={id:this.#p.newId(),type:'wake',at:now};
    const items=ok?[{id:this.#p.newId(),type:'sleep',startAt:pend,endAt:now,kind:'main'},wake]:[wake];
    const state=await this.edit(date,c=>{c.items.push(...items);});
    if(ok)this.#p.pendingSleep.clear();
    return {...state,withSleep:Boolean(ok)};
  }

  // 확정: 서버 최신을 받은 뒤 최신 카드 위에 내 변경을 다시 얹어(rebase) 연산 1개로 쓴다.
  // B18 (H13-N04): 동기화 동안 로컬 초안이 다른 초안으로 바뀌었으면(원격 heads가 그대로여도) 옛 id로 확정하지 않고 처음부터 최신 초안을 다시 얹는다(같은 상한).
  async confirm(date,{maxAttempts=3}={}){
    const alive=this.#alive();
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      if(attempt>1&&alive.gone())return {status:'FAILED',code:alive.code()};   // B18 (H13-C05): 재시도 전에 로그아웃·세대 변경이면 멈춘다
      const draft=await this.#draftFor(date);
      if(!draft)return {status:'NOTHING_TO_CONFIRM'};
      try{
        if(this.#p.hasPending?.())await this.#p.reconcile();   // 응답 불명으로 남은 이전 확정이 있으면 먼저 결말을 낸다(같은 requestId라 중복 없음)
        await this.#p.sync();
      }catch(e){return {status:this.#p.hasPending?.()?'UNKNOWN':'SYNC_FAILED',code:codeOf(e)};}
      const now=await this.#draftFor(date);
      if(!now)return {status:'NOTHING_TO_CONFIRM'};
      if(now.draftId!==draft.draftId){if(attempt<maxAttempts)continue;return {status:'STALE',code:STALE_BASE};}
      // B19: 영수증 조회(terminal)는 비동기일 수 있다(앱의 상자·메모리 포트는 /api/command/<requestId>로 이 기기 금고의 결말을 본다). 한 번만 묻고,
      // 조회가 실패하면 rebase하지 않고 결과 불명으로 끝낸다(초안 그대로, 새 requestId 없음).
      let ended;
      try{ended=Boolean(await this.#p.terminal?.(draft.body.requestId));}catch(e){return {status:'UNKNOWN',code:codeOf(e)};}
      const settled=await this.#settleSent(draft,ended);
      if(settled)return settled;
      const latest=this.#p.latest(date),base=this.#baseOf(date,draft.body.expectedHeads);
      const rb=rebase({date,base,mine:draft.body.data,latest:latest.card});
      if(rb.status==='REJECTED')return {status:'REJECTED',code:rb.code,itemId:rb.itemId??null,notices:rb.notices};
      if(rb.status==='ALREADY_APPLIED'){await this.#p.drafts.discard(draft.draftId);return {status:'ALREADY_APPLIED',notices:rb.notices};}
      let target=draft;
      if(!(stable(draft.body.data)===stable(rb.card)&&sameHeads(draft.body.expectedHeads,latest.heads))||ended||this.#aborted.has(draft.body.requestId)){   // 이미 결말이 난(ABORTED 등) requestId는 다시 쓰지 않는다
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:rb.card,heads:latest.heads,reason:CONFIRM_REASON});
        let saved;
        // B16: 확정 준비(동기화) 동안 새 입력이 초안을 바꿨으면 그 입력을 덮지 않고 처음부터 다시 얹는다.
        try{saved=await this.#p.drafts.save({type:'ENTITY',body},{base:draft.draftId});}
        catch(e){if(codeOf(e)===STALE_BASE){if(attempt<maxAttempts)continue;return {status:'STALE',code:STALE_BASE,notices:rb.notices};}throw e;}
        await this.#p.drafts.discard(draft.draftId);   // 새 초안은 내 변경을 모두 포함한다(base=최신)
        target={draftId:saved.draftId,body};
      }
      let result;
      try{result=await this.#p.drafts.commit(target.draftId);}
      catch(e){
        const code=codeOf(e);
        if(code==='STALE_HEADS'&&attempt<maxAttempts)continue;   // 확정 직전에 다른 기기가 먼저 확정했다: 다시 받아 얹는다
        if(this.#p.hasPending?.()){this.#sent.add(target.body.requestId);return {status:'UNKNOWN',code,notices:rb.notices};}
        return {status:REJECT_CODE.test(code)?'REJECTED':'FAILED',code,notices:rb.notices};
      }
      // B17 (A8-D01): COMMITTED가 확인된 경우만 성공이다. ABORTED(서버가 받지 않음)는 실패로 알리고 그 requestId를 다시 쓰지 않는다. 그 밖은 결과 불명. 어느 쪽도 초안은 그대로.
      if(result?.status==='ABORTED'){this.#aborted.add(target.body.requestId);return {status:'FAILED',code:'ABORTED',notices:rb.notices};}
      if(result?.status!=='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'){this.#sent.add(target.body.requestId);return {status:'UNKNOWN',code:result?.status??'NO_RESULT',notices:rb.notices};}
      this.#sent.delete(target.body.requestId);
      return {status:'CONFIRMED',confirmCount:rb.card.confirmCount,requestId:target.body.requestId,notices:rb.notices,gentleNotice:rb.card.confirmCount>=3};
    }
    return {status:'STALE',code:'STALE_HEADS'};
  }
  // 시작할 때의 로그아웃 세대(session 포트)와 상자 잠금(drafts.locked)을 기억한다. 포트가 없으면 늘 살아 있음.
  #alive(){
    const s0=this.#p.session?.();
    const code=()=>this.#p.drafts.locked?.()?'CARD_DRAFT_LOCKED':'MD_SIGNED_OUT_ELSEWHERE';
    const gone=()=>this.#p.session?.()!==s0||Boolean(this.#p.drafts.locked?.());
    return {gone,code,check:()=>{if(gone())throw flowError(code());}};
  }
  // B17 (H12-N01): 이 초안의 requestId가 이미 서버에 반영됐을 수 있으면(영수증이 결말 남·저널 목록의 SERVER_COMMITTED·이번 실행에서 결과 불명)
  // rebase하지 않고 같은 초안(같은 requestId)을 다시 확정해 그 영수증에 수렴한다(연산 0, 새 requestId 없음). 그 뒤 다른 기기가 같은 항목을 고치거나 지운 내용은 그대로 남는다.
  // 반영되지 않은 것으로 확인되면(ABORTED·MD_TERMINAL_INTENT·STALE_HEADS) null을 돌려 평소처럼 최신 위에 다시 얹는다(그 requestId는 다시 쓰지 않음).
  async #settleSent(draft,ended){
    const rid=draft.body.requestId;
    // B21: 저널이 이 초안을 ABORTED_NOT_COMMITTED로 알려 주면(앱을 다시 연 뒤) 이번 실행에서 ABORTED를 본 것과 같게 기억해 새 requestId로 다시 서명한다(같은 requestId 재사용 금지).
    if(draft.status==='ABORTED_NOT_COMMITTED'){this.#sent.delete(rid);this.#aborted.add(rid);}
    if(this.#aborted.has(rid))return null;
    if(!(draft.status==='SERVER_COMMITTED'||this.#sent.has(rid)||ended))return null;
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
