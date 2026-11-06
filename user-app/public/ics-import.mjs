// 바깥 일정 보기 .ics (P1E, 결정 P1D 3 "보기만"). 구글 캘린더 등에서 내려받은 .ics를 읽어 달력·계획 화면에 흐린 색으로 겹쳐 보여 준다.
// 기록(EVENT)으로 저장하지 않는다: 서버 호출·연산·동기화 0, 새 기록 종류 0. 보관은 이 기기 localStorage 키 1개, 최근 가져온 파일 1개분뿐이다.
// 보관하는 것: 제목·날짜·시각. DESCRIPTION은 Fold 거울 꼬리표 확인에만 보고 버린다. LOCATION·참석자·끝 시각·파일 이름은 읽거나 남기지 않는다.
// 시간대: 앱 날짜 기준은 한국 표준시(KST) 고정이다. 플로팅·TZID=Asia/Seoul은 벽시계 그대로, Z는 +9시간, 다른 TZID는 Intl로 바꾸고 못 바꾸면 "건너뜀(시간대)"로 센다.
// 반복은 원래 시간대의 벽시계로 펼친 뒤 회차마다 KST로 바꾼다(서머타임이 있는 곳도 맞도록).
// 왕복: 앱이 내보낸 일정(UID 끝 @lifebrick.local)과 앱이 만든 모양의 UID(호스트 없는 pd-·lb- 키, 다른 호스트로 옮겨진 lb-ev-·lb-pd-·pd-날짜-블록), Fold 거울 일정(설명 꼬리표 [LIFEBRICK:…])은 앱 일정과 겹치므로 숨긴다.
// FIX37A (HUNT37 I1·I2): 한 파일의 펼치기 일을 MAX_WORK(단계)와 MAX_MS(시간, 부른 쪽이 now를 넘길 때)로 막는다. 넘치면 남은 반복 일정을 "건너뜀(반복 규칙)"으로 센다(틀린 날짜를 보여 주지 않는다).
import {ICS_DAYS,UID_HOST,cleanText} from './ics-export.mjs';
import {shiftDay,dateKeyOK} from './life-model.mjs';

export const STORE_KEY='lb.ics.outer';
export const MAX_SHOW=200,MAX_LINES=20000,MAX_BYTES=5_000_000,MAX_RULE_STEPS=20000,UPCOMING_DAYS=7;
export const MAX_BY_PARTS=100,MAX_WORK=3_000_000,MAX_MS=3000;
const INTL_WORK=25;   // Intl로 시간대를 한 번 바꾸는 일은 펼치기 한 단계의 약 25배
export const NO_TITLE='바깥 일정';
const DAY_MS=86400000,KST_MS=9*3600000;
const KST='KST',UTC='UTC';
const WEEKDAYS=['SU','MO','TU','WE','TH','FR','SA'];
const RULE_KEYS=new Set(['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','BYMONTHDAY','BYMONTH','WKST']);
const DT=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;
// FIX37A (HUNT37 I4): 호스트 없는 키는 앱·거울 키 모양(BridgeInput EVENT_KEY와 같은 글자), 호스트가 붙으면 앱이 만든 키 모양일 때만 앱 일정이다(PD-12345@pagerduty.example은 바깥 일정).
const OWN_TAG=/\[LIFEBRICK:[^\]]*\]/,OWN_KEY=/^(?:pd|lb)-[A-Za-z0-9-]{1,61}$/i,OWN_KEY_HOSTED=/^(?:(?:lb-)?pd-\d{4}-?\d{2}-?\d{2}-[MAEN]|lb-ev-[A-Za-z0-9-]{1,58})@/i;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
// FIX37A (HUNT37 I6): 제목의 글자 방향 문자는 보이는 순서를 바꾸므로 지운다.
const BIDI=/[؜‎‏‪-‮⁦-⁩]/g;
const cleanTitle=v=>typeof v==='string'?cleanText(v.replace(BIDI,'')):'';

// ---- 줄 읽기: 접기는 UTF-8로 풀기 전에 바이트에서 푼다(글자 중간에서 접은 파일도 깨지지 않게) ----
function unfoldBytes(bytes){
  const out=new Uint8Array(bytes.length);let n=0;
  for(let i=0;i<bytes.length;i++){
    if(bytes[i]===13&&bytes[i+1]===10&&(bytes[i+2]===32||bytes[i+2]===9)){i+=2;continue;}
    if(bytes[i]===10&&(bytes[i+1]===32||bytes[i+1]===9)){i+=1;continue;}
    out[n++]=bytes[i];
  }
  return new TextDecoder('utf-8').decode(out.subarray(0,n));
}
// 이름·매개변수·값으로 나눈다. 따옴표 안의 :와 ;는 구분자가 아니다.
function parseLine(line){
  let quoted=false,colon=-1;const cuts=[];
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"')quoted=!quoted;
    else if(!quoted&&c===';')cuts.push(i);
    else if(!quoted&&c===':'){colon=i;break;}
  }
  if(colon<0)return null;
  const ends=[...cuts,colon],params={};
  for(let i=0;i<cuts.length;i++){
    const part=line.slice(cuts[i]+1,ends[i+1]),eq=part.indexOf('=');
    if(eq>0)params[part.slice(0,eq).toUpperCase()]=part.slice(eq+1).replace(/^"|"$/g,'');
  }
  return {name:line.slice(0,ends[0]).toUpperCase(),params,value:line.slice(colon+1)};
}
const unescapeText=v=>v.replace(/\\([\\;,nN])/g,(_,c)=>c==='n'||c==='N'?' ':c);

// ---- 날짜·시각 ----
const dayOf=date=>Math.floor(Date.parse(date+'T00:00:00Z')/DAY_MS);
const keyOf=n=>new Date(n*DAY_MS).toISOString().slice(0,10);
const weekdayOf=n=>((n+4)%7+7)%7;
const zoneOf=tzid=>{const z=(tzid??'').trim();return !z||/^asia\/seoul$/i.test(z)?KST:z;};
function parseMoment(value,params){
  const m=DT.exec(String(value).trim());if(!m)return null;
  const date=m[1]+'-'+m[2]+'-'+m[3];if(!dateKeyOK(date)||date<'1900-01-01')return null;
  if(!m[4])return {date,time:null,zone:null};
  if(Number(m[4])>23||Number(m[5])>59||Number(m[6])>60)return null;
  return {date,time:m[4]+':'+m[5],zone:m[7]?UTC:zoneOf(params.TZID)};
}
const formats=new Map();
function zoneFormat(zone){
  if(!formats.has(zone))formats.set(zone,new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}));
  return formats.get(zone);
}
function zoneKnown(zone){
  if(zone===null||zone===KST||zone===UTC)return true;
  try{zoneFormat(zone);return true;}catch{return false;}
}
// 그 순간 그 시간대의 벽시계를 UTC인 척한 밀리초로
function wallOf(ms,zone){
  const p={};for(const x of zoneFormat(zone).formatToParts(ms))p[x.type]=Number(x.value);
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
}
function instantOf(date,time,zone){
  const wall=Date.parse(date+'T'+time+':00Z');
  if(zone===UTC)return wall;
  if(zone===KST)return wall-KST_MS;
  let t=wall;
  for(let i=0;i<2;i++)t=wall-(wallOf(t,zone)-t);
  return t;
}
function toKst(date,time,zone){
  if(time===null||zone===KST)return {date,time};
  const iso=new Date(instantOf(date,time,zone)+KST_MS).toISOString();
  return {date:iso.slice(0,10),time:iso.slice(11,16)};
}
const occKey=o=>o.date+'|'+(o.time??'');

// ---- 반복 규칙: 알 수 없는 조각이 있으면 null(건너뜀으로 센다. 틀린 날짜를 보여 주지 않는다) ----
function parseRule(value){
  const raw={};
  for(const part of value.split(';')){
    if(!part)continue;
    const eq=part.indexOf('=');if(eq<1)return null;
    const k=part.slice(0,eq).toUpperCase();if(!RULE_KEYS.has(k))return null;
    raw[k]=part.slice(eq+1).toUpperCase();
  }
  if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(raw.FREQ))return null;
  const int=v=>/^\d{1,4}$/.test(v)?Number(v):NaN;
  const rule={freq:raw.FREQ,interval:raw.INTERVAL===undefined?1:int(raw.INTERVAL),count:raw.COUNT===undefined?null:int(raw.COUNT),until:raw.UNTIL??null,byDay:null,byMonthDay:null,byMonth:null,wkst:raw.WKST===undefined?1:WEEKDAYS.indexOf(raw.WKST)};
  if(!(rule.interval>=1)||(rule.count!==null&&!(rule.count>=1))||rule.wkst<0)return null;
  if(raw.BYDAY!==undefined){
    // FIX37A (HUNT37 I2): 같은 값은 한 번만 펼치고, 개수는 상한을 둔다(MO,MO,… 한 줄이 수십 초 멈추던 길).
    const parts=new Map();
    for(const d of new Set(raw.BYDAY.split(','))){
      const m=/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d);if(!m)return null;
      const x={n:m[1]?Number(m[1]):0,wd:WEEKDAYS.indexOf(m[2])};parts.set(x.n+'|'+x.wd,x);
    }
    if(parts.size>MAX_BY_PARTS)return null;
    rule.byDay=[...parts.values()];
  }
  if(raw.BYMONTHDAY!==undefined){
    rule.byMonthDay=[...new Set(raw.BYMONTHDAY.split(',').map(Number))];
    if(!rule.byMonthDay.every(d=>Number.isInteger(d)&&d!==0&&Math.abs(d)<=31))return null;
  }
  if(raw.BYMONTH!==undefined){
    rule.byMonth=[...new Set(raw.BYMONTH.split(',').map(Number))];
    if(!rule.byMonth.every(m=>Number.isInteger(m)&&m>=1&&m<=12))return null;
  }
  rule.work=1+(rule.byDay?.length??1)*(rule.freq==='MONTHLY'?31:rule.freq==='YEARLY'?31*(rule.byMonth?.length??1):1);   // 회차 하나를 펼치는 일의 크기
  const ordinal=rule.byDay?.some(d=>d.n!==0)??false;
  if(rule.byDay&&rule.byMonthDay)return null;
  if(ordinal&&(rule.freq==='DAILY'||rule.freq==='WEEKLY'))return null;
  if((rule.freq==='DAILY'||rule.freq==='WEEKLY')&&rule.byMonthDay)return null;
  if(rule.freq==='YEARLY'&&rule.byDay&&!rule.byMonth)return null;
  return rule;
}
function monthDays(y,m,rule,startDom){
  const first=dayOf(y+'-'+String(m).padStart(2,'0')+'-01'),len=new Date(Date.UTC(y,m,0)).getUTCDate(),out=[];
  if(rule.byMonthDay){
    for(const d of rule.byMonthDay){const v=d>0?d:len+1+d;if(v>=1&&v<=len)out.push(first+v-1);}
  }else if(rule.byDay){
    for(const {n,wd} of rule.byDay){
      const all=[];for(let i=0;i<len;i++)if(weekdayOf(first+i)===wd)all.push(first+i);
      if(n===0)out.push(...all);
      else{const v=n>0?all[n-1]:all[all.length+n];if(v!==undefined)out.push(v);}
    }
  }else if(startDom<=len)out.push(first+startDom-1);
  return out;
}
// 회차 k의 시작 날과 그 안의 날짜들. 시작 날이 끝을 넘으면 펼치기를 멈춘다.
function periodOf(rule,start,k){
  const s=new Date(start*DAY_MS),y=s.getUTCFullYear(),m=s.getUTCMonth(),dom=s.getUTCDate();
  if(rule.freq==='DAILY'){
    const d=start+k*rule.interval;
    return {head:d,days:!rule.byDay||rule.byDay.some(x=>x.wd===weekdayOf(d))?[d]:[]};
  }
  if(rule.freq==='WEEKLY'){
    const head=start-((weekdayOf(start)-rule.wkst+7)%7)+k*rule.interval*7;
    const wds=rule.byDay?rule.byDay.map(x=>x.wd):[weekdayOf(start)];
    return {head,days:wds.map(wd=>head+((wd-rule.wkst+7)%7))};
  }
  if(rule.freq==='MONTHLY'){
    const ym=y*12+m+k*rule.interval,yy=Math.floor(ym/12),mm=ym%12+1;
    return {head:Math.floor(Date.UTC(yy,mm-1,1)/DAY_MS),days:monthDays(yy,mm,rule,dom)};
  }
  const yy=y+k*rule.interval,months=rule.byMonth??[m+1];
  return {head:Math.floor(Date.UTC(yy,0,1)/DAY_MS),days:months.flatMap(mm=>monthDays(yy,mm,rule,dom))};
}
function untilTest(rule,start){
  if(rule.until===null)return ()=>true;
  const u=parseMoment(rule.until,{});if(!u)return null;
  if(u.time===null||start.time===null){const last=dayOf(u.date);return day=>day<=last;}
  const limit=instantOf(u.date,u.time,u.zone===UTC?UTC:start.zone);
  return day=>instantOf(keyOf(day),start.time,start.zone)<=limit;
}
// FIX37A (HUNT37 I1): COUNT가 없으면 앞 회차를 셀 까닭이 없어 보이는 기간(shownFrom) 바로 앞 회차부터 펼친다. 상한 MAX_RULE_STEPS의 뜻(회차 번호)은 그대로다.
function skipPeriods(rule,first,shownFrom){
  if(rule.count!==null||shownFrom<=first)return 0;
  if(rule.freq==='DAILY')return Math.floor((shownFrom-first)/rule.interval);
  if(rule.freq==='WEEKLY')return Math.max(0,Math.floor((shownFrom-first)/(7*rule.interval))-1);
  const a=new Date(first*DAY_MS),b=new Date(shownFrom*DAY_MS),years=b.getUTCFullYear()-a.getUTCFullYear();
  return Math.max(0,Math.floor((rule.freq==='MONTHLY'?years*12+b.getUTCMonth()-a.getUTCMonth():years)/rule.interval)-1);
}
// 원래 시간대 벽시계의 회차 날짜들(shownFrom 앞은 세기만 하고 돌려주지 않는다). 펼칠 수 없거나 일 상한을 넘으면 null.
function expandRule(rule,start,shownFrom,lastDay,spend){
  const until=untilTest(rule,start);if(!until)return null;
  const first=dayOf(start.date),seen=new Set(),out=[],untilWork=rule.until!==null&&start.time!==null&&start.zone!==KST&&start.zone!==UTC?INTL_WORK:0;let emitted=0;
  const k0=skipPeriods(rule,first,shownFrom);
  if(k0>=MAX_RULE_STEPS&&!until(shownFrom))return out;
  for(let k=k0;;k++){
    if(k>=MAX_RULE_STEPS||!spend(rule.work))return null;
    const {head,days}=periodOf(rule,first,k);
    if(head>lastDay)return out;
    for(const d of [...new Set(days)].sort((a,b)=>a-b)){
      if(d<first||seen.has(d))continue;
      seen.add(d);
      if(rule.byMonth&&rule.freq!=='YEARLY'&&!rule.byMonth.includes(new Date(d*DAY_MS).getUTCMonth()+1))continue;
      if(d>lastDay)return out;
      if(d>=shownFrom){
        if(!spend(untilWork))return null;
        if(!until(d))return out;
        out.push(d);
      }
      emitted++;
      if(rule.count!==null&&emitted>=rule.count)return out;
    }
  }
}
// 파일 하나의 펼치기 일 상한. 돌려준 함수가 false면 그만 펼친다(한 번 넘치면 계속 false).
function workGuard({now,ms}){
  const clock=typeof now==='function'?now:null,end=clock?clock()+(Number.isFinite(ms)?ms:MAX_MS):0;let used=0,nextCheck=16384;
  return n=>{
    used+=n;if(used>MAX_WORK)return false;
    if(clock&&used>=nextCheck){nextCheck=used+16384;if(clock()>end){used=Infinity;return false;}}
    return true;
  };
}

// ---- 파일 읽기: 순수 함수. 쓰기·네트워크 없음(today·시계 now는 부른 쪽이 넘긴다) ----
export const isOwnUid=uid=>typeof uid==='string'&&(OWN_KEY.test(uid)||OWN_KEY_HOSTED.test(uid)||uid.toLowerCase().endsWith('@'+UID_HOST));
// FIX37A (HUNT37 I3): VEVENT는 겹치지 않으므로 VEVENT 안의 BEGIN:VEVENT는 앞 일정의 END:VEVENT가 빠진 것이다. 앞 일정은 읽지 못한 일정(broken)으로 세고 새 일정을 읽는다. 파일 끝까지 안 닫혀도 같다(줄 상한으로 잘린 것은 truncated로 따로 알린다).
function readEvents(text){
  const lines=text.split(/\r\n|\n|\r/).filter(l=>l.trim()!=='');
  const truncated=lines.length>MAX_LINES,events=[];let cur=null,nested=0,broken=0;
  for(const line of lines.slice(0,MAX_LINES)){
    const p=parseLine(line);if(!p)continue;
    const val=p.value.trim().toUpperCase();
    if(p.name==='BEGIN'){
      if(cur&&val==='VEVENT'){broken++;cur=null;nested=0;}
      if(cur)nested++;
      else if(val==='VEVENT')cur={uid:null,summary:null,start:null,rrules:[],exdates:[],recurId:null,cancelled:false,tagged:false,sequence:0};
      continue;
    }
    if(p.name==='END'){
      if(cur&&val==='VEVENT'){events.push(cur);cur=null;nested=0;}
      else if(cur&&nested>0)nested--;
      continue;
    }
    if(!cur||nested>0)continue;
    if(p.name==='UID'&&cur.uid===null)cur.uid=p.value.trim();
    else if(p.name==='SUMMARY'&&cur.summary===null)cur.summary=cleanTitle(unescapeText(p.value));
    else if(p.name==='DTSTART'&&cur.start===null)cur.start=parseMoment(p.value,p.params)??false;
    else if(p.name==='RRULE')cur.rrules.push(p.value);
    else if(p.name==='EXDATE')for(const v of p.value.split(','))cur.exdates.push(parseMoment(v,p.params));
    else if(p.name==='RECURRENCE-ID')cur.recurId=parseMoment(p.value,p.params)??false;
    else if(p.name==='STATUS')cur.cancelled=val==='CANCELLED';
    else if(p.name==='SEQUENCE')cur.sequence=Number(p.value)||0;
    else if(p.name==='DESCRIPTION'&&OWN_TAG.test(p.value))cur.tagged=true;
  }
  if(cur&&!truncated)broken++;
  return {events,truncated,broken};
}
const newer=(a,b)=>!a||b.sequence>=a.sequence;
const eventKey=ev=>ev.uid??'noid|'+ev.summary+'|'+JSON.stringify(ev.start)+'|'+ev.rrules.join('&');
export function parseIcs(input,{today,now,ms}){
  if(!dateKeyOK(today)){const e=new Error('INVALID_TODAY');e.code='INVALID_TODAY';throw e;}
  const text=unfoldBytes(typeof input==='string'?new TextEncoder().encode(input):input);
  if(!/^\s*BEGIN:VCALENDAR\b/i.test(text)){const e=new Error('ICS_NOT_CALENDAR');e.code='ICS_NOT_CALENDAR';throw e;}
  // 벽시계 날짜와 KST 날짜는 하루까지 어긋나므로 앞뒤로 이틀 여유를 둔다.
  const from=today,to=shiftDay(today,ICS_DAYS-1),shownFrom=dayOf(from)-2,lastDay=dayOf(to)+2,spend=workGuard({now,ms});
  const stats={own:0,timezone:0,rule:0,badDate:0,outOfRange:0,cancelled:0,duplicate:0,overflow:0,broken:0};
  const {events,truncated,broken}=readEvents(text);stats.broken=broken;
  // 같은 UID: 원본 1개(SEQUENCE 높은 것, 같으면 나중 것)와 회차별 수정본(RECURRENCE-ID)으로 나눈다.
  const masters=new Map(),overrides=new Map(),own=new Set();
  for(const ev of events){
    const key=eventKey(ev);
    if(ev.tagged||isOwnUid(ev.uid)){own.add(key);continue;}
    if(ev.recurId===false){stats.badDate++;continue;}
    if(ev.recurId){
      const k=key+'#'+occKey(ev.recurId);
      if(overrides.has(k))stats.duplicate++;
      if(newer(overrides.get(k)?.ev,ev))overrides.set(k,{key,ev});
    }else{
      if(masters.has(key))stats.duplicate++;
      if(newer(masters.get(key),ev))masters.set(key,ev);
    }
  }
  stats.own=own.size;
  const replaced=new Map();
  for(const {key,ev} of overrides.values()){
    if(own.has(key)||!zoneKnown(ev.recurId.zone))continue;
    if(!replaced.has(key))replaced.set(key,new Set());
    replaced.get(key).add(occKey(toKst(ev.recurId.date,ev.recurId.time,ev.recurId.zone)));
  }
  const seen=new Set(),items=[];
  const pushItem=(key,ev,o)=>{
    if(o.date<from||o.date>to)return false;
    const id=key+'|'+occKey(o);if(seen.has(id))return true;
    seen.add(id);items.push({title:ev.summary||NO_TITLE,date:o.date,time:o.time});
    return true;
  };
  for(const [key,ev] of masters){
    if(own.has(key))continue;
    if(ev.cancelled){stats.cancelled++;continue;}
    if(!ev.start){stats.badDate++;continue;}
    if(!zoneKnown(ev.start.zone)){stats.timezone++;continue;}
    const {date,time,zone}=ev.start;
    let days=[dayOf(date)];
    if(ev.rrules.length){
      const rule=ev.rrules.length===1?parseRule(ev.rrules[0]):null;
      const expanded=rule?expandRule(rule,ev.start,shownFrom,lastDay,spend):null;
      if(!expanded){stats.rule++;continue;}
      if(time!==null&&zone!==KST&&zone!==UTC&&!spend(expanded.length*INTL_WORK)){stats.rule++;continue;}
      days=expanded;
    }
    const skip=replaced.get(key)??new Set(),skipDates=new Set();
    for(const x of ev.exdates){
      if(!x||!zoneKnown(x.zone))continue;
      if(x.time===null||time===null)skipDates.add(x.date);
      else if(dayOf(x.date)>=shownFrom&&dayOf(x.date)<=lastDay)skip.add(occKey(toKst(x.date,x.time,x.zone)));
    }
    let shown=false;
    for(const d of days){
      const wallDate=keyOf(d);if(skipDates.has(wallDate))continue;
      const o=toKst(wallDate,time,zone);
      if(!skip.has(occKey(o))&&pushItem(key,ev,o))shown=true;
    }
    if(!shown)stats.outOfRange++;
  }
  for(const {key,ev} of overrides.values()){
    if(own.has(key)||ev.cancelled)continue;
    if(!ev.start){stats.badDate++;continue;}
    if(!zoneKnown(ev.start.zone)){stats.timezone++;continue;}
    if(!pushItem(key,ev,toKst(ev.start.date,ev.start.time,ev.start.zone)))stats.outOfRange++;
  }
  items.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??'').localeCompare(b.time??'')||a.title.localeCompare(b.title));
  stats.overflow=Math.max(0,items.length-MAX_SHOW);
  return {items:items.slice(0,MAX_SHOW),stats,truncated,from,to};
}

// ---- 이 기기 보관: 키 1개, 파일 1개분. 없거나 막혀 있거나 깨져 있어도 던지지 않는다 ----
const STAT_KEYS=['own','timezone','rule','badDate','outOfRange','cancelled','duplicate','overflow','broken'];
export function loadOuter(storage){
  let raw;try{raw=JSON.parse(storage?.getItem(STORE_KEY)??'null');}catch{return null;}
  if(!raw||raw.v!==1||!Array.isArray(raw.items)||!dateKeyOK(raw.importedOn))return null;
  const items=[];
  for(const x of raw.items.slice(0,MAX_SHOW)){
    const title=cleanTitle(x?.title);
    if(title&&dateKeyOK(x?.date)&&(x?.time===null||TIME.test(x?.time)))items.push({title,date:x.date,time:x.time});
  }
  const stats={};for(const k of STAT_KEYS)stats[k]=Number.isInteger(raw.stats?.[k])&&raw.stats[k]>=0?raw.stats[k]:0;
  return {importedOn:raw.importedOn,items,stats,truncated:raw.truncated===true};
}
export function saveOuter(storage,parsed,today){
  try{storage.setItem(STORE_KEY,JSON.stringify({v:1,importedOn:today,items:parsed.items,stats:parsed.stats,truncated:parsed.truncated}));return true;}
  catch{return false;}
}
export function clearOuter(storage){
  try{storage.removeItem(STORE_KEY);return true;}catch{return false;}
}
export function outerByDay(storage){
  const map=new Map();
  for(const it of loadOuter(storage)?.items??[])map.set(it.date,[...(map.get(it.date)??[]),it]);
  return map;
}

// ---- 화면 ----
// h={el,add,button}, kit={sheet}, storage, today, rerender(). 서버 호출·연산 없음.
export const OUTER_TEXT=Object.freeze({
  title:'바깥 일정 보기 (.ics)',
  lead:'구글 캘린더 등에서 내려받은 .ics 파일을 고르면 제목·날짜·시각만 이 기기에 보관해 달력에 흐리게 겹쳐 보여 줍니다. 앱 기록으로 저장하지 않고 다른 기기로 보내지 않습니다. 오늘부터 '+ICS_DAYS+'일, 최대 '+MAX_SHOW+'개까지 보이고 파일은 앞 '+MAX_LINES+'줄까지 읽습니다.',
  pick:'.ics 파일 고르기',
  clear:'바깥 일정 지우기',
  sheet:'바깥 일정',
  upcoming:'앞으로 '+UPCOMING_DAYS+'일의 바깥 일정',
  allDay:'종일',
  badFile:'.ics 일정 파일이 아닙니다. 다른 파일을 골라 주세요.',
  empty:'빈 파일입니다. 일정이 든 .ics 파일을 골라 주세요.',
  tooBig:'파일이 너무 큽니다. '+MAX_BYTES/1_000_000+'MB 이하의 .ics 파일을 골라 주세요.',
  readFail:'파일을 읽지 못했습니다. 다시 시도해 주세요.',
  saveFail:'이 기기에 보관하지 못했습니다.',
  clearFail:'지우지 못했습니다. 다시 시도해 주세요.',
  truncated:'파일이 길어 앞 '+MAX_LINES+'줄까지만 읽었습니다. 뒤쪽 일정은 빠져 있을 수 있습니다.',
});
const whenText=it=>it.date+' '+(it.time??OUTER_TEXT.allDay);
export function outerChip(it,{h,kit}){
  const n=h.button((it.time?it.time+' ':'')+it.title,()=>{kit.sheet(OUTER_TEXT.sheet,h.add(h.el('div',null,'ics-outer-body'),h.el('p',it.title,'ics-outer-title'),h.el('p',whenText(it),'muted')));},'calendar-event ics-outer');
  n.setAttribute('aria-label',OUTER_TEXT.sheet+' · '+whenText(it)+' · '+it.title);
  return n;
}
export function summaryText(data){
  const s=data.stats,skipped=[[s.timezone,'시간대'],[s.rule,'반복 규칙'],[s.badDate,'날짜 오류']].filter(x=>x[0]>0);
  const parts=[data.importedOn+' 가져옴 · 보임 '+data.items.length+'건'];
  if(s.overflow)parts.push('표시 상한으로 안 보임 '+s.overflow+'건');
  if(s.own)parts.push('앱 일정과 겹쳐 숨김 '+s.own+'건');
  if(s.outOfRange)parts.push('기간 밖 '+s.outOfRange+'건');
  if(skipped.length)parts.push('건너뜀 '+skipped.reduce((a,x)=>a+x[0],0)+'건('+skipped.map(x=>x[1]+' '+x[0]).join(', ')+')');
  if(s.broken)parts.push('읽지 못한 일정 '+s.broken+'개');
  return parts.join(' · ');
}
export async function importFile(file,{storage,today}){
  if(!file||file.size<1)return {ok:false,text:OUTER_TEXT.empty};
  if(file.size>MAX_BYTES)return {ok:false,text:OUTER_TEXT.tooBig};
  let parsed;
  try{parsed=parseIcs(new Uint8Array(await file.arrayBuffer()),{today,now:()=>Date.now()});}
  catch(e){return {ok:false,text:e?.code==='ICS_NOT_CALENDAR'?OUTER_TEXT.badFile:OUTER_TEXT.readFail};}
  return saveOuter(storage,parsed,today)?{ok:true}:{ok:false,text:OUTER_TEXT.saveFail};
}
export function renderOuterPanel(root,ctx){
  const {h,storage,today}=ctx,sec=h.add(h.el('section',null,'panel ics-outer-panel'),h.el('h2',OUTER_TEXT.title,'panel-title'));
  h.add(root,sec);
  h.add(sec,h.el('p',OUTER_TEXT.lead,'muted'));
  const data=loadOuter(storage),result=h.el('p','','muted');result.setAttribute('role','status');
  if(data){
    h.add(sec,h.el('p',summaryText(data),'muted'));
    if(data.truncated)h.add(sec,h.el('p',OUTER_TEXT.truncated,'notice'));
    if(ctx.showUpcoming){
      const last=shiftDay(today,UPCOMING_DAYS-1),soon=data.items.filter(it=>it.date>=today&&it.date<=last);
      if(soon.length){
        const list=h.el('div',null,'ics-outer-list');
        for(const it of soon)h.add(list,h.el('span',it.date.slice(5),'muted'),outerChip(it,ctx));
        h.add(sec,h.el('h3',OUTER_TEXT.upcoming,'date-group'),list);
      }
    }
  }
  const input=h.el('input');input.type='file';input.accept='.ics,text/calendar';input.hidden=true;
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';if(!file)return;
    const r=await importFile(file,{storage,today});
    if(r.ok)ctx.rerender();else result.textContent=r.text;
  });
  const buttons=h.add(h.el('div',null,'buttons'),input,h.button(OUTER_TEXT.pick,()=>input.click(),'primary'));
  if(data)h.add(buttons,h.button(OUTER_TEXT.clear,()=>{if(clearOuter(storage))ctx.rerender();else result.textContent=OUTER_TEXT.clearFail;},'secondary'));
  h.add(sec,buttons,result);
  return sec;
}
