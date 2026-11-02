// STUDY_DAY 하루 1장 흐름(초안 → 확정). 저장소·네트워크·시계·명령 서명(makeBody)은 ports로 주입한다(시험은 진짜 서비스를, 화면은 앱의 api를 꽂는다).
// hlt-flow(B3)와 같은 방식이며 확정 직전 rebase도 같은 규칙이다(study-rebase). 불러오는 모듈은 study-model·study-rebase·study-schedule뿐.
// 초안 = 기존 오프라인 초안 저널(drafts.lbd)의 ENTITY 초안 1건: data=내 카드, expectedHeads=편집을 시작한 시점의 카드 heads(base).
// 초안 입력은 연산 0, "확정" 1번 = 연산 1. 초안은 확정 성공을 확인한 뒤에만 지운다. 검증 거부·저장 실패·응답 불명이면 초안을 그대로 둔다.
import {validateStudyData,kstDate} from './study-model.mjs';
import {rebase,emptyCard,hasChanges,diffCard,stable,LISTS} from './study-rebase.mjs';
import {defaultReviewDue,suggestNext,reviewHistory} from './study-schedule.mjs';

const codeOf=e=>typeof e?.code==='string'?e.code:(e?.message??'UNKNOWN');
const REJECT_CODE=/^(INVALID_|STUDY_|DUPLICATE_STUDY|APP_ENTITY_LIMIT|REBASE_|INVALID_WHOLE_LIFE)/;
export const DRAFT_REASON='공부 카드 임시 저장';
export const CONFIRM_REASON='공부 카드 확정';

const sameHeads=(a,b)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
const err=code=>Object.assign(new Error(code),{code});

export class StudyFlow{
  #p;
  constructor(ports){this.#p=ports;}
  async #draftFor(date){
    const list=(await this.#p.drafts.list()).filter(d=>d.type==='ENTITY'&&d.body?.entityType==='STUDY_DAY'&&d.body.entityId===date);
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
    validateStudyData('STUDY_DAY',date,next);
    if(!hasChanges(s.base,next)){if(s.draftId)await this.#p.drafts.discard(s.draftId);return this.state(date);}
    if(s.draftId&&stable(next)===stable(s.card))return s;
    const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:next,heads:s.baseHeads,reason:DRAFT_REASON});
    await this.#p.drafts.save({type:'ENTITY',body});
    if(s.draftId)await this.#p.drafts.discard(s.draftId);
    return this.state(date);
  }
  addRow(date,list,row){return this.edit(date,c=>{c[list].push({...row,id:row.id??this.#p.newId()});});}
  updateRow(date,list,row){return this.edit(date,c=>{const i=c[list].findIndex(x=>x.id===row.id);if(i<0)throw err('UNKNOWN_STUDY_ROW');c[list][i]=row;});}
  removeRow(date,list,id){return this.edit(date,c=>{c[list]=c[list].filter(x=>x.id!==id);});}

  // 세션 빠른 입력(연산 0). "공부 시작": 지금 시각으로 STARTED 세션을 초안에 넣는다. 시간은 소유자가 입력·확인한 값만(자동 측정 없음).
  quickStart(subject,{plannedMin=0}={}){const now=this.#p.now();return this.addRow(kstDate(now),'sessions',{subject,state:'STARTED',plannedMin,confirmedMin:0,restartLocator:'',at:now});}
  // "공부 끝": 가장 최근에 시작한 STARTED 세션을 COMPLETED로 바꾸고 소유자가 확인한 분을 넣는다. 시작한 세션이 없으면 던진다.
  async quickEnd(confirmedMin,{restartLocator}={}){
    const now=this.#p.now(),date=kstDate(now),s=await this.state(date);
    const started=s.card.sessions.map((x,i)=>({x,i})).filter(({x})=>x.state==='STARTED');
    if(!started.length)throw err('NO_STARTED_SESSION');
    const pick=started.reduce((a,b)=>((b.x.at??'')>=(a.x.at??'')?b:a)).x;
    return this.updateRow(date,'sessions',{...pick,state:'COMPLETED',confirmedMin,...(restartLocator!==undefined?{restartLocator}:{})});
  }
  // 오답 등록: 복습일 기본값 = 등록일(카드 날짜)의 다음 날. 소유자가 reviewDue를 넘기면 그 값.
  addMistake(date,{subject,itemRef,errorCode,evidence,note='',reviewDue}){
    return this.addRow(date,'mistakes',{subject,itemRef,errorCode,evidence,note,reviewDue:reviewDue??defaultReviewDue(date)});
  }
  // 복습 결과에 대한 다음 복습일 제안. 이력은 이전 카드 포함 전체 + 지금 편집 중인 초안 카드(같은 날짜의 확정본 대신 초안)에서 읽는다.
  async suggestReview(date,mistakeId,result,{exceptReviewId=null}={}){
    const s=await this.state(date),cards=this.#p.cards().filter(c=>c.date!==date);
    cards.push(s.card);
    return suggestNext(reviewHistory(cards,mistakeId,exceptReviewId),result,kstDate(this.#p.now()));
  }
  // 복습 기록(연산 0): 복습한 시각 = 지금. nextDue가 비면 닫힌 것(졸업이거나 소유자가 안 정함) — 화면이 미리 알린다.
  async recordReview(date,{mistakeId,result,nextDue}){
    const doneAt=this.#p.now();
    const row={mistakeId,doneAt,result,...(nextDue?{nextDue}:{})};
    const state=await this.addRow(date,'reviews',row);
    return {...state,closed:!nextDue};
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
      if(rb.status==='REJECTED')return {status:'REJECTED',code:rb.code,itemId:rb.itemId??null,list:rb.list??null,notices:rb.notices};
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
export {LISTS};
