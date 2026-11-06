// HLT_DAY 하루 1장 흐름(초안 → 확정). 저장소·네트워크·시계·명령 서명(makeBody)은 ports로 주입한다(시험은 진짜 서비스를, 화면은 앱의 api를 꽂는다). 불러오는 모듈 없음.
// 초안 = 기존 오프라인 초안 저널(drafts.lbd)의 ENTITY 초안 1건: data=내 카드, expectedHeads=편집을 시작한 시점의 카드 heads(base).
// base 카드는 그래프 이력(revision)에서 heads로 다시 읽으므로 base·변경 목록이 앱을 껐다 켜도 복원된다. 초안 입력은 연산 0, "확정" 1번 = 연산 1.
// 초안은 확정 성공을 확인한 뒤에만 지운다. 검증 거부·저장 실패·응답 불명이면 초안을 그대로 둔다.
import {validateHltData,kstDate,shiftDay,nearDate,MAX_SLEEP_MS} from './hlt-model.mjs';
import {rebase,emptyCard,hasChanges,diffCard,stable,rebaseChoices,applyChoices,previewRebase} from './hlt-rebase.mjs';

const codeOf=e=>typeof e?.code==='string'?e.code:(e?.message??'UNKNOWN');
const REJECT_CODE=/^(INVALID_|HLT_|UNKNOWN_HLT|DUPLICATE_HLT|BROKEN_HLT|APP_ENTITY_LIMIT|REBASE_|INVALID_TEXT|INVALID_WHOLE_LIFE)/;
export const DRAFT_REASON='건강 카드 임시 저장';
export const CONFIRM_REASON='건강 카드 확정';

const sameHeads=(a,b)=>a.length===b.length&&a.every((h,i)=>h===b[i]);
// B16: 초안 상자가 "이 카드를 계산한 뒤 그 날짜 초안이 바뀜"을 알리는 코드. 편집은 최신 초안을 다시 읽어 같은 변경을 다시 적용한다(정해진 횟수까지).
const STALE_BASE='CARD_DRAFT_STALE_BASE',EDIT_ROUNDS=5;
const flowError=code=>Object.assign(new Error(code),{code});
// K1: 밤잠은 깬 날 카드에 둔다(Fold 가져오기의 18:00 경계와 같음). 취침 카드 날짜 = KST(지금+6시간): 18:00 이후 취침은 다음 날 카드.
const SLEEP_NIGHT_SHIFT_MS=6*3600000;
export const sleepCardDate=iso=>kstDate(new Date(Date.parse(iso)+SLEEP_NIGHT_SHIFT_MS).toISOString());
const openSleepOf=card=>card.items.find(i=>i.type==='sleep'&&i.endAt===null)??null;   // 카드당 열린 수면은 1개까지(HLT_OPEN_SLEEP_LIMIT)
const FOLD_SLEEP_ID='hc-sleep';   // Fold 가져오기가 넣는 수면 항목 id(hlt-ui applyFoldDay)

export class HltFlow{
  #p;
  // B17: 이번 실행에서 확정 결과를 모르게 끝난 requestId(#sent)와 결말이 ABORTED·미반영으로 확인된 requestId(#aborted).
  // 영수증 상태를 알려 주지 않는 포트(앱의 메모리·상자)에서도 재확정이 원래 requestId에 수렴하고, 결말 난 requestId는 다시 쓰지 않게 한다.
  #sent=new Set();#aborted=new Set();
  // K1: 화면이 읽는 "취침 기록 중" 값 {date,item}|null. 원본은 카드 초안의 열린 수면이고, 이 칸은 취침·기상 직후 바로 보이게 하는 사본이다(prepareHealth가 다시 채움).
  pending={v:null};
  constructor(ports){this.#p=ports;ports.drafts?.mergeWith?.({rebase,ports});}   // FIX34 (HUNT34 H1): STALE 뒤 다음 쓰기는 디스크 초안과 합친다
  async #draftFor(date){
    return this.#draftIn(await this.#p.drafts.list(),date);
  }
  #draftIn(all,date){
    const list=all.filter(d=>d.type==='ENTITY'&&d.body?.entityType==='HLT_DAY'&&d.body.entityId===date);
    if(!list.length)return null;
    return list.reduce((a,b)=>(b.createdAt>=a.createdAt?b:a));
  }
  #baseOf(date,heads){return heads.length?this.#p.revision(date,heads[0]):null;}
  // 화면이 보여 줄 상태: NONE(카드 없음), CONFIRMED(금고에 있음, 초안 없음), LOCAL_DRAFT(이 기기에만 있는 초안).
  async state(date){
    return this.#stateOf(date,await this.#draftFor(date));
  }
  // K1 (B38-8): 화면 준비용. 초안 목록을 한 번만 읽어 그날 상태와 취침 기록(pendingSleep)을 함께 돌려준다(읽기만).
  async screen(date){
    const all=await this.#p.drafts.list();
    return {state:this.#stateOf(date,this.#draftIn(all,date)),pendingSleep:this.#pendingIn(all)};
  }
  #stateOf(date,draft){
    const latest=this.#p.latest(date);
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
  // B58C: onLatest = 소유자가 확인한 교체처럼 다른 기기가 쌓은 항목까지 고치는 편집. 초안을 최신 카드 위로 옮긴 뒤 적용한다(연산 0).
  async edit(date,mutate,{input=null,onLatest=false}={}){
    const alive=this.#alive();
    for(let round=1;;round++){
      if(round>1)alive.check();
      const s=await this.state(date),on=onLatest?this.#onLatest(date,s):s,next=structuredClone(on.card);
      mutate(next);
      next.date=date;next.confirmCount=(on.base?.confirmCount??0)+1;
      validateHltData('HLT_DAY',date,next);
      try{
        if(!hasChanges(on.base,next)){if(s.draftId)await this.#p.drafts.discard(s.draftId,{input,date});else await this.#p.drafts.keep?.(date,{input,base:null});return this.state(date);}
        if(s.draftId&&stable(next)===stable(s.card)){await this.#p.drafts.keep?.(date,{input,base:s.draftId});return s;}
        const body=await this.#p.makeBody({requestId:this.#p.newRequestId(),date,data:next,heads:on.baseHeads,reason:DRAFT_REASON});
        await this.#p.drafts.save({type:'ENTITY',body},{input,base:s.draftId});
      }catch(e){if(e?.code===STALE_BASE&&round<EDIT_ROUNDS)continue;throw e;}
      if(s.draftId)await this.#p.drafts.discard(s.draftId,{input});
      return this.state(date);
    }
  }
  #onLatest(date,s){
    const latest=this.#p.latest(date);
    if(!s.draftId||sameHeads(s.baseHeads,latest.heads))return s;
    const v=previewRebase({date,base:s.base,mine:s.card,latest:latest.card});
    if(v.blocked)throw flowError(v.code);
    return {card:v.card,base:latest.card,baseHeads:latest.heads};
  }
  // B58C: 지금 쌓으면 어떤 카드가 되는지(쓰기 없음). 초안이 최신 카드 위에 있으면 초안 그대로다. drift = 그 사이 다른 기기가 쌓아 합쳐 본 값, choices = 쌓을 때 물을 겹침.
  async preview(date){
    const s=await this.state(date),latest=this.#p.latest(date);
    if(!s.draftId||sameHeads(s.baseHeads,latest.heads))return {card:s.card,drift:false,blocked:false,code:null,choices:[],notices:[]};
    return {...previewRebase({date,base:s.base,mine:s.card,latest:latest.card}),drift:true};
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
  // K1 (설계 D안): 지금 취침 = 깬 날 카드 초안에 끝나지 않은 수면(sleep, endAt:null)을 적는다(새 형식·필드 없음, 연산 0).
  // 공부의 "공부 시작"(study-flow)처럼 초안 카드에 남으므로 앱을 다시 열어도 그대로다. 그 카드에 열린 수면이 이미 있으면 시작 시각만 지금으로 바꾼다(두 번 누름 = 시각 수정).
  async quickSleep(){
    const now=this.#p.now(),date=sleepCardDate(now);
    let id=null;
    const state=await this.edit(date,c=>{const o=openSleepOf(c);if(o){o.startAt=now;o.kind='main';id=o.id;}else{id=this.#p.newId();c.items.push({id,type:'sleep',startAt:now,endAt:null,kind:'main'});}});
    const item=state.card.items.find(i=>i.id===id)??null;
    this.pending.v=item?{date,item}:null;
    return {...state,pendingSleepStart:now,pendingSleep:this.pending.v};
  }
  // 오늘 → 전날 → 다음날 카드(초안 또는 최신)의 열린 수면 중 시작이 가장 늦은 것 {date,item}. 읽기만 한다.
  async pendingSleep(){return this.#pendingIn(await this.#p.drafts.list());}
  #pendingIn(all){
    const today=kstDate(this.#p.now());let best=null;
    for(const date of [today,shiftDay(today,-1),shiftDay(today,1)]){
      const item=openSleepOf(this.#stateOf(date,this.#draftIn(all,date)).card);
      if(item&&(!best||Date.parse(item.startAt)>Date.parse(best.item.startAt)))best={date,item};
    }
    return best;
  }
  // 지금 기상: 열린 수면(시작이 지금 이전)이 48시간 안이면 끝 시각을 지금으로 채우고 wake와 함께 오늘(기상일) 카드 초안에 둔다. 없으면 wake만(수면은 직접 입력).
  // 열린 수면이 전날·다음날 카드에 있으면 오늘 카드에 먼저 넣은 뒤 원래 카드에서 뺀다(빼다가 실패해도 잃지 않음). 원래 카드가 이미 쌓인 카드면 restack=true(그 카드도 다시 쌓아야 함).
  // 오늘 카드(다른 기기가 쌓은 것 포함, preview)에 다른 끝난 주 수면이 있으면 지우지 않고 duplicate=true. 그중 Fold 수면이 있으면 watch = 그 시작 시각(잠든 시각 제안).
  async quickWake(){
    const now=this.#p.now(),today=kstDate(now),wake={id:this.#p.newId(),type:'wake',at:now};
    const open=await this.pendingSleep(),age=open?Date.parse(now)-Date.parse(open.item.startAt):NaN;
    if(!(age>=0&&age<=MAX_SLEEP_MS)){
      const state=await this.edit(today,c=>{c.items.push(wake);});
      this.pending.v=await this.pendingSleep();
      return {...state,withSleep:false,sleep:null,staleSleep:open&&age>MAX_SLEEP_MS?open.date:null};
    }
    const sleep={...open.item,endAt:now},target=nearDate(today,sleep.startAt)?today:open.date;   // 시작이 오늘 카드의 날짜 창(앞뒤 1일) 밖이면 옮기지 않고 원래 카드에서 닫는다
    const put=c=>{const i=c.items.findIndex(x=>x.id===sleep.id);if(i<0)c.items.push(sleep);else c.items[i]=sleep;};
    if(target!==today)await this.edit(target,put);
    const state=await this.edit(today,c=>{if(target===today)put(c);c.items.push(wake);});
    let moved=null;
    if(open.date!==target){
      const from=await this.state(open.date);
      await this.edit(open.date,c=>{c.items=c.items.filter(x=>x.id!==sleep.id);});
      moved={from:open.date,restack:Boolean(from.base?.items.some(x=>x.id===sleep.id))};
    }
    const others=(await this.preview(target)).card.items.filter(i=>i.type==='sleep'&&i.kind==='main'&&i.endAt!==null&&i.id!==sleep.id);
    const watch=sleep.kind==='main'?others.find(i=>i.id===FOLD_SLEEP_ID&&Date.parse(i.startAt)<=Date.parse(now))?.startAt??null:null;
    this.pending.v=await this.pendingSleep();
    return {...state,withSleep:true,sleep:{date:target,id:sleep.id,startAt:sleep.startAt,endAt:now,kind:sleep.kind},moved,duplicate:sleep.kind==='main'&&others.length>0,watch};
  }
  // K1 (4·5): 기상 뒤 잠든 시각 다듬기. 그 수면 항목의 startAt만 바꾼다(새 필드 없음, 연산 0). 길이 0~48시간 검사는 모델이 한다.
  setSleepStart(date,id,startAt){return this.edit(date,c=>{const it=c.items.find(i=>i.id===id&&i.type==='sleep');if(!it)throw flowError('UNKNOWN_HLT_ITEM');it.startAt=startAt;});}

  // 확정: 서버 최신을 받은 뒤 최신 카드 위에 내 변경을 다시 얹어(rebase) 연산 1개로 쓴다.
  // B18 (H13-N04): 동기화 동안 로컬 초안이 다른 초안으로 바뀌었으면(원격 heads가 그대로여도) 옛 id로 확정하지 않고 처음부터 최신 초안을 다시 얹는다(같은 상한).
  // B58C: 양쪽이 서로 다른 수면·걸음을 가져왔으면 조용히 합치거나 카드 전체를 막지 않고 NEEDS_CHOICE로 멈춘다(쓰기 0, 초안 그대로). answers = {겹침 지문: 'MINE'|'THEIRS'}.
  async confirm(date,{maxAttempts=3,answers=null}={}){
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
      const merge={date,base,mine:draft.body.data,latest:latest.card},choices=rebaseChoices(merge);
      if(choices.some(c=>!answers?.[c.sig]))return {status:'NEEDS_CHOICE',choices,notices:[]};
      const rb=rebase(choices.length?applyChoices(merge,answers):merge);
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
