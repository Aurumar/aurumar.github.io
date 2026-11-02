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

export class HltFlow{
  #p;
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
  async edit(date,mutate){
    const s=await this.state(date),next=structuredClone(s.card);
    mutate(next);
    next.date=date;next.confirmCount=(s.base?.confirmCount??0)+1;
    validateHltData('HLT_DAY',date,next);
    if(!hasChanges(s.base,next)){if(s.draftId)await this.#p.drafts.discard(s.draftId);return this.state(date);}
    if(s.draftId&&stable(next)===stable(s.card))return s;
    const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:next,heads:s.baseHeads,reason:DRAFT_REASON});
    await this.#p.drafts.save({type:'ENTITY',body});
    if(s.draftId)await this.#p.drafts.discard(s.draftId);
    return this.state(date);
  }
  addItem(date,item){return this.edit(date,c=>{c.items.push({...item,id:item.id??this.#p.newId()});});}
  updateItem(date,item){return this.edit(date,c=>{const i=c.items.findIndex(x=>x.id===item.id);if(i<0){const e=new Error('UNKNOWN_HLT_ITEM');e.code='UNKNOWN_HLT_ITEM';throw e;}c.items[i]=item;});}
  removeItem(date,id){return this.edit(date,c=>{c.items=c.items.filter(x=>x.id!==id);});}
  setNote(date,note){return this.edit(date,c=>{if(note===null||note==='')delete c.note;else c.note=note;});}

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
  async confirm(date,{maxAttempts=3}={}){
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      const draft=await this.#draftFor(date);
      if(!draft)return {status:'NOTHING_TO_CONFIRM'};
      try{
        if(this.#p.hasPending?.())await this.#p.reconcile();   // 응답 불명으로 남은 이전 확정이 있으면 먼저 결말을 낸다(같은 requestId라 중복 없음)
        await this.#p.sync();
      }catch(e){return {status:this.#p.hasPending?.()?'UNKNOWN':'SYNC_FAILED',code:codeOf(e)};}
      const latest=this.#p.latest(date),base=this.#baseOf(date,draft.body.expectedHeads);
      const rb=rebase({date,base,mine:draft.body.data,latest:latest.card});
      if(rb.status==='REJECTED')return {status:'REJECTED',code:rb.code,itemId:rb.itemId??null,notices:rb.notices};
      if(rb.status==='ALREADY_APPLIED'){await this.#p.drafts.discard(draft.draftId);return {status:'ALREADY_APPLIED',notices:rb.notices};}
      let target=draft;
      if(!(stable(draft.body.data)===stable(rb.card)&&sameHeads(draft.body.expectedHeads,latest.heads))||this.#p.terminal?.(draft.body.requestId)){   // 이미 결말이 난(ABORTED 등) requestId는 다시 쓰지 않는다
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:rb.card,heads:latest.heads,reason:CONFIRM_REASON});
        const saved=await this.#p.drafts.save({type:'ENTITY',body});
        await this.#p.drafts.discard(draft.draftId);   // 새 초안은 내 변경을 모두 포함한다(base=최신)
        target={draftId:saved.draftId,body};
      }
      let result;
      try{result=await this.#p.drafts.commit(target.draftId);}
      catch(e){
        const code=codeOf(e);
        if(code==='STALE_HEADS'&&attempt<maxAttempts)continue;   // 확정 직전에 다른 기기가 먼저 확정했다: 다시 받아 얹는다
        return {status:this.#p.hasPending?.()?'UNKNOWN':REJECT_CODE.test(code)?'REJECTED':'FAILED',code,notices:rb.notices};
      }
      if(result?.status!=='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED')return {status:'UNKNOWN',code:result?.status??'NO_RESULT',notices:rb.notices};
      return {status:'CONFIRMED',confirmCount:rb.card.confirmCount,requestId:target.body.requestId,notices:rb.notices,gentleNotice:rb.card.confirmCount>=3};
    }
    return {status:'STALE',code:'STALE_HEADS'};
  }
}
