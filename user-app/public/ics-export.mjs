// 일정 내보내기 .ics (B46). 이미 앱이 가진 일정(캘린더 EVENT·계획 PLAN의 기한/검토/마일스톤·하루 계획 PLAN_DAY·시험 일정)을 RFC 5545 글 한 장으로 만든다.
// 이 모듈은 아무것도 쓰지 않고 시계·난수·저장소·네트워크를 쓰지 않는다(현재 시각 now는 부른 쪽이 넘긴다). 수동 내려받기 전용: 구독 URL·서버 연동 없음.
// 제외: 메모·계획 본문(notes/goal 등)·건강/공부 카드 내용·돈 거래·가게 이름·금액. 제목만 싣는다. private/hidden 표시가 있는 항목은 뺀다(현재 일정 데이터에는 그 표시가 없어 방어용).
// 시간대: 앱 날짜 기준은 한국 표준시(KST) 고정이고 일정 시각은 그 벽시계 값이다. 그래서 시각 일정은 TZID·Z 없는 "플로팅" 시각으로 내보내 어느 기기에서도 같은 시각으로 보인다. DTSTAMP만 규격상 UTC(Z)다.
// 하루 계획은 블록 하나에 일정 1개로 묶는다(P1D2, UID = pd-날짜-블록). 바깥 캘린더에서 들여온 EVENT(id가 ics-로 시작)는 다시 내보내지 않는다.
import {lifeDefs,shiftDay,dateKeyOK} from './life-model.mjs';

export const ICS_DAYS=90;
export const IMPORTED_EVENT_PREFIX='ics-';
export const PRODID='-//LIFE BRICK//B46 ICS export//KO';
export const UID_HOST='lifebrick.local';
export const TIMED_MINUTES=60;                       // 시각 일정은 끝 시각 정보가 없어 한 시간으로 둔다
export const MAX_SUMMARY=150,MAX_ITEMS=2000,MAX_REPEAT=400;
const BLOCK_TEXT=Object.freeze({M:'오전',A:'오후',E:'저녁'});
const shownBlock=b=>b==='N'?'E':b;   // V7B: 옛 밤 줄은 저녁 일정에 묶는다(life-plan shownBlock과 같은 규칙, 저장값은 그대로)
const encoder=new TextEncoder();

// ---- 글 정리 ----
const control=/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;
export function cleanText(value,max=MAX_SUMMARY){
  if(typeof value!=='string')return '';
  const t=value.toWellFormed().replace(control,' ').replace(/\s+/g,' ').trim();
  return [...t].slice(0,max).join('');
}
export const escapeText=s=>s.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r\n|\r|\n/g,'\\n');
const safeId=v=>String(v).replace(/[^A-Za-z0-9_-]/g,'_');
const excluded=x=>Boolean(x)&&typeof x==='object'&&(x.private===true||x.hidden===true);

// ---- 75옥텟 줄 접기: 글자(코드 포인트) 중간에서 자르지 않는다. 이어지는 줄은 공백 1옥텟으로 시작한다 ----
export function foldLine(line){
  if(encoder.encode(line).length<=75)return [line];
  const out=[];let cur='',bytes=0,limit=75;
  for(const ch of line){
    const n=encoder.encode(ch).length;
    if(bytes+n>limit){out.push(cur);cur=' ';bytes=1;limit=75;}
    cur+=ch;bytes+=n;
  }
  out.push(cur);
  return out;
}

// ---- 날짜·시각 ----
const compactDate=d=>d.replaceAll('-','');
const timeOK=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
function endOfTimed(date,time){
  const m=Number(time.slice(0,2))*60+Number(time.slice(3))+TIMED_MINUTES;
  const d=m>=1440?shiftDay(date,1):date,mm=m%1440;
  return d+'T'+String(Math.floor(mm/60)).padStart(2,'0')+':'+String(mm%60).padStart(2,'0');
}
export function stampOf(now){
  const t=Date.parse(now);
  if(!Number.isFinite(t)){const e=new Error('INVALID_NOW');e.code='INVALID_NOW';throw e;}
  return new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}

// ---- 일정 모으기 ----
// 입력은 wholeLifeView가 이미 주는 모양: events/plans = 엔티티 행({entityId,data}), life = lifeRawView(PLAN_DAY·시험).
// 반환 항목: {uid,summary,date,time|null}. time이 null이면 종일. 범위 = today부터 ICS_DAYS일(양 끝 포함). 시험만 예외로 today 이후면 상한 없이 넣는다(B46G 소유자 결정).
// rangeOf의 to: 항목(날짜순)을 넘기면 max(창 끝, 마지막 항목 날짜)이고, 항목이 없으면 창 끝이다.
export function rangeOf(today,items=[]){
  const end=shiftDay(today,ICS_DAYS-1),last=items.at(-1)?.date;
  return {from:today,to:last&&last>end?last:end};
}
export function collectIcsItems({events=[],plans=[],life=null,today,skipPlanDays=false}){
  if(!dateKeyOK(today)){const e=new Error('INVALID_TODAY');e.code='INVALID_TODAY';throw e;}
  const {from,to}=rangeOf(today),items=[];
  const pushOpen=(uid,title,date,time)=>{
    const summary=cleanText(title);
    if(!summary||!dateKeyOK(date)||date<from)return;
    items.push({uid:uid+'@'+UID_HOST,summary,date,time:timeOK(time)?time:null});
  };
  const push=(uid,title,date,time)=>{if(!(date>to))pushOpen(uid,title,date,time);};
  for(const ev of events){
    const d=ev?.data;if(!d||d.deleted||excluded(d)||!dateKeyOK(d.date)||String(ev.entityId).startsWith(IMPORTED_EVENT_PREFIX))continue;
    const r=d.recurrence,count=Math.min(r?.count??1,MAX_REPEAT),step=r?r.interval*(r.frequency==='WEEKLY'?7:1):0;
    for(let i=0;i<count;i++){
      const date=shiftDay(d.date,i*step);
      if(date>to)break;
      push('ev-'+safeId(ev.entityId)+'-'+i,d.title,date,d.allDay?null:d.time);
    }
  }
  for(const p of plans){
    const d=p?.data;if(!d||d.status==='COMPLETE'||excluded(d))continue;
    const id=safeId(p.entityId);
    if(d.dueDate)push('pl-'+id+'-due',d.title+' · 기한',d.dueDate,null);
    if(d.reviewDate)push('pl-'+id+'-review',d.title+' · 검토',d.reviewDate,null);
    for(const m of d.milestones??[])if(m.dueDate&&!m.done&&!excluded(m))push('pl-'+id+'-'+safeId(m.milestoneId),m.title,m.dueDate,null);
  }
  for(const row of skipPlanDays?[]:life?.plans??[]){
    const d=row?.data;if(!d||excluded(d)||row.date<from||row.date>to)continue;
    const blocks=new Map();
    for(const x of d.items??[])if(!excluded(x)){const b=shownBlock(x.block);blocks.set(b,[...(blocks.get(b)??[]),x.title]);}
    for(const [block,titles] of blocks)push('pd-'+safeId(row.date)+'-'+safeId(block),'공부 계획 · '+(BLOCK_TEXT[block]??'')+' · '+[...new Set(titles)].join(' · '),row.date,null);
  }
  for(const x of lifeDefs(life).exams.items??[])if(!excluded(x))pushOpen('ex-'+safeId(x.id),'시험 · '+x.name+(x.status==='잠정'?' (잠정)':''),x.date,null);
  items.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??'').localeCompare(b.time??'')||(a.uid<b.uid?-1:a.uid>b.uid?1:0));
  return items.slice(0,MAX_ITEMS);
}

// ---- 글 만들기: 순수 함수. 같은 항목은 항상 같은 UID라 다시 가져와도 중복이 생기지 않는다 ----
export function buildIcs(items,{now}){
  const stamp=stampOf(now),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:'+PRODID,'CALSCALE:GREGORIAN'];
  for(const it of items){
    lines.push('BEGIN:VEVENT','UID:'+it.uid,'DTSTAMP:'+stamp);
    if(it.time){const end=endOfTimed(it.date,it.time);lines.push('DTSTART:'+compactDate(it.date)+'T'+it.time.replace(':','')+'00','DTEND:'+compactDate(end.slice(0,10))+'T'+end.slice(11).replace(':','')+'00');}
    else lines.push('DTSTART;VALUE=DATE:'+compactDate(it.date),'DTEND;VALUE=DATE:'+compactDate(shiftDay(it.date,1)));
    lines.push('SUMMARY:'+escapeText(it.summary),'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(foldLine).join('\r\n')+'\r\n';
}
// 화면용 한 번에: {text,count,from,to}. 항목이 없으면 유효한 빈 VCALENDAR가 나오고 count=0이다(화면은 내려받기를 막는다).
export function buildIcsFromViews({events=[],plans=[],life=null,today,now,skipPlanDays=false}){
  const items=collectIcsItems({events,plans,life,today,skipPlanDays}),{from,to}=rangeOf(today,items);
  return {text:buildIcs(items,{now}),count:items.length,from,to};
}
export const icsFileName=today=>'life-brick-schedule-'+today+'.ics';

// ---- 화면: 계획 탭 안의 카드 하나. 단추 → 미리보기(개수·기간) → "내려받기" 확인 → 파일 저장 요청 ----
// h={el,add,button}, kit={sheet,toggle}, views()=>{events,plans,life,today}, now()=>ISO, download(name,text), mirrorOn()=>Fold 캘린더 거울이 켜져 있으면 참(선택). 서버 호출·저장·연산 없음.
export const ICS_TEXT=Object.freeze({
  mirrorSkip:'하루 계획은 Fold가 이미 캘린더에 넣고 있어요 — 내보내기에서 빼기',
  title:'일정 내보내기 (.ics)',
  lead:'오늘부터 '+ICS_DAYS+'일 동안의 일정·계획과, 날짜가 정해진 시험은 기간과 상관없이 모두 .ics 파일 한 장으로 내려받아 PC·iPad 캘린더 앱에 직접 넣습니다. 제목만 담기며 메모·건강·공부 카드·돈 거래는 들어가지 않습니다. 자동으로 보내지 않습니다.',
  empty:'이 기간에 내보낼 일정이 없습니다.',
  fail:'일정 파일을 만들지 못했습니다. 다시 시도해 주세요.',
});
export function renderIcsExport(root,ctx){
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel ics-export'),h.el('h2',ICS_TEXT.title,'panel-title'));
  h.add(root,sec);
  h.add(sec,h.el('p',ICS_TEXT.lead,'muted'));
  const result=h.el('p','','muted');result.setAttribute('role','status');
  // 거울과 내보내기를 같은 캘린더에 함께 넣으면 UID가 달라 겹치므로 거울이 켜져 있으면 기본으로 뺀다.
  const mirrored=ctx.mirrorOn?.()===true;let skipPlanDays=mirrored;
  if(mirrored)h.add(sec,kit.toggle(ICS_TEXT.mirrorSkip,true,on=>{skipPlanDays=on;}));
  const preview=()=>{
    let built;
    try{built=buildIcsFromViews({...ctx.views(),now:ctx.now(),skipPlanDays});}
    catch{result.textContent=ICS_TEXT.fail;return;}
    result.textContent='';
    const today=built.from,note=h.el('p',built.count?built.count+'건 · '+built.from+' ~ '+built.to:ICS_TEXT.empty,'muted'),msg=h.el('p','','muted');
    msg.setAttribute('role','status');
    let dlg=null;
    const go=h.button('내려받기',()=>{
      try{ctx.download(icsFileName(today),built.text);msg.textContent=icsFileName(today)+' 저장을 요청했습니다.';result.textContent=msg.textContent;dlg?.close();}
      catch{msg.textContent=ICS_TEXT.fail;}
    },'primary');
    go.disabled=built.count===0;
    const body=h.add(h.el('div',null,'ics-export-body'),note,msg,h.add(h.el('div',null,'buttons'),go,h.button('취소',()=>dlg?.close(),'secondary')));
    dlg=kit.sheet('내보낼 일정',body);
  };
  h.add(sec,h.add(h.el('div',null,'buttons'),h.button('미리보기 후 내려받기',preview,'primary')),result);
  return sec;
}
