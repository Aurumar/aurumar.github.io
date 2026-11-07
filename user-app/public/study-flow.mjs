// STUDY_DAY 하루 1장 흐름(초안 → 확정). 저장소·네트워크·시계·명령 서명(makeBody)은 ports로 주입한다(시험은 진짜 서비스를, 화면은 앱의 api를 꽂는다).
// hlt-flow(B3)와 같은 방식이며 확정 직전 rebase도 같은 규칙이다(study-rebase). 불러오는 모듈은 study-model·study-rebase·study-schedule뿐.
// 초안 = 기존 오프라인 초안 저널(drafts.lbd)의 ENTITY 초안 1건: data=내 카드, expectedHeads=편집을 시작한 시점의 카드 heads(base).
// 초안 입력은 연산 0, "확정" 1번 = 연산 1. 초안은 확정 성공을 확인한 뒤에만 지운다. 검증 거부·저장 실패·응답 불명이면 초안을 그대로 둔다.
import {validateStudyData,hasNewBookRow,kstDate,shiftDay} from './study-model.mjs';
import {rebase,emptyCard,hasChanges,diffCard,stable,LISTS,sessionMark} from './study-rebase.mjs';
import {defaultReviewDue,suggestNext,reviewHistory} from './study-schedule.mjs';

const codeOf=e=>typeof e?.code==='string'?e.code:(e?.message??'UNKNOWN');
const REJECT_CODE=/^(INVALID_|STUDY_|DUPLICATE_STUDY|APP_ENTITY_LIMIT|REBASE_|INVALID_WHOLE_LIFE)/;
export const DRAFT_REASON='공부 카드 임시 저장';
export const CONFIRM_REASON='공부 카드 확정';

const sameHeads=(a,b)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
const err=code=>Object.assign(new Error(code),{code});
// FIX34 (HUNT34 H1): 같은 타이머(같은 시작 시각 = 같은 id)를 두 창이 따로 끝냈으면 같은 집중이다 → 먼저 디스크에 적힌 행을 쓴다(id 충돌로 막지 않음).
const adoptTimerRows=(mine,disk)=>({...mine,sessions:mine.sessions.map(s=>sessionMark(s.id)==='T'?disk.sessions.find(x=>x.id===s.id)??s:s)});

export class StudyFlow{
  #p;
  // B17: hlt-flow와 같다. 이번 실행에서 확정 결과를 모르게 끝난 requestId(#sent), 결말이 ABORTED·미반영으로 확인된 requestId(#aborted).
  #sent=new Set();#aborted=new Set();
  constructor(ports){this.#p=ports;ports.drafts?.mergeWith?.({rebase,ports,prepare:adoptTimerRows});}
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
    if(hasNewBookRow(s.base,next)&&!this.#p.recordsDoor?.())throw err('RECORDS_DOOR_CLOSED');   // 쓰기 문(D46 4.2): 포트가 없으면 닫힌 것으로 본다
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
  // B17 (A8-D02): 오늘 카드에 시작한 세션이 없으면 전날 카드에서 찾는다(23:59 시작 → 00:01 끝은 시작한 카드의 그 세션을 끝냄, 새 날짜 카드에 빈 세션을 만들지 않음).
  async quickEnd(confirmedMin,{restartLocator}={}){
    const now=this.#p.now(),today=kstDate(now);
    for(const date of [today,shiftDay(today,-1)]){
      const started=(await this.state(date)).card.sessions.filter(x=>x.state==='STARTED');
      if(!started.length)continue;
      const pick=started.reduce((a,b)=>((b.at??'')>=(a.at??'')?b:a));
      return this.updateRow(date,'sessions',{...pick,state:'COMPLETED',confirmedMin,...(restartLocator!==undefined?{restartLocator}:{})});
    }
    throw err('NO_STARTED_SESSION');
  }
  // 오답 등록: 복습일 기본값 = 등록일(카드 날짜)의 다음 날. 소유자가 reviewDue를 넘기면 그 값.
  // D46: 추가 과목(생물 등)은 세션과 같게 id에 과목을 넣는다(id=sessionIdFor('bio',새 id), subject는 'C' 그대로). 문제집 오답은 book을 함께 넘긴다.
  addMistake(date,{id,subject,itemRef,errorCode,evidence,note='',reviewDue,book}){
    return this.addRow(date,'mistakes',{...(id?{id}:{}),subject,itemRef,errorCode,evidence,note,reviewDue:reviewDue??defaultReviewDue(date),...(book!==undefined?{book}:{})});
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
      // B19: 영수증 조회(terminal)는 비동기일 수 있다(앱의 상자·메모리 포트는 /api/command/<requestId>로 이 기기 금고의 결말을 본다). 한 번만 묻고,
      // 조회가 실패하면 rebase하지 않고 결과 불명으로 끝낸다(초안 그대로, 새 requestId 없음).
      let ended;
      try{ended=Boolean(await this.#p.terminal?.(draft.body.requestId));}catch(e){return {status:'UNKNOWN',code:codeOf(e)};}
      const settled=await this.#settleSent(draft,ended);
      if(settled)return settled;
      const latest=this.#p.latest(date),base=this.#baseOf(date,draft.body.expectedHeads);
      if(hasNewBookRow(base,draft.body.data)&&!this.#p.recordsDoor?.())return {status:'REJECTED',code:'RECORDS_DOOR_CLOSED',notices:[]};   // 초안은 그대로 둔다
      const rb=rebase({date,base,mine:draft.body.data,latest:latest.card});
      if(rb.status==='REJECTED')return {status:'REJECTED',code:rb.code,itemId:rb.itemId??null,list:rb.list??null,notices:rb.notices};
      if(rb.status==='ALREADY_APPLIED'){await this.#p.drafts.discard(draft.draftId);return {status:'ALREADY_APPLIED',notices:rb.notices};}
      let target=draft;
      if(!(stable(draft.body.data)===stable(rb.card)&&sameHeads(draft.body.expectedHeads,latest.heads))||ended||this.#aborted.has(draft.body.requestId)){   // 이미 결말이 난(ABORTED 등) requestId는 다시 쓰지 않는다
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
  // B17 (H12-N01): hlt-flow의 #settleSent와 같다. 이미 반영됐을 수 있는 requestId의 초안은 rebase하지 않고 같은 초안으로 다시 확정해 그 영수증에 수렴한다(연산 0).
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
export {LISTS};
