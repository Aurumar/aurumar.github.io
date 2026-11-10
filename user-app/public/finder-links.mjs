// 지식 파인더 결과 링크 (B63, V3 §8 · 설계 AUTOPILOT\design\B63_LINK_CSP_DESIGN.md §5, 소유자 결정 2026-11-06).
// 비서 이름이 정확히 finder인 보고의 "## 찾은 자료" 표(FINDER_LINK_FORMAT_V1)만 엄격히 읽는다. 표 모양이 틀리거나 맞는 줄이 하나도 없으면 글만 + 이유 한 줄(B61 방식).
// FIX34 (HUNT34 H18): 틀린 줄이 일부면 그 줄만 글로 두고(이유 한 줄) 나머지 줄의 링크는 살린다.
// 링크는 <a href>가 아니라 단추다: href·src가 없으니 미리 불러오기·끌어 놓기·주소 복사로 새는 길이 없다. 여는 것은 host(link-opener.mjs) 경로 하나이고 host가 규칙을 다시 검사한다.
// - 웹: 확인창(도메인 굵게, 전체 주소 그대로, 퓨니코드는 xn-- 원형 그대로) → [열기]. "이 사이트는 다시 묻지 않기"를 켜고 연 사이트(host 이름 정확히 같을 때)는 다음부터 바로 연다.
//   그 목록은 이 기기 설정(localStorage)에만 둔다: 동기화 기록이 아니고 설정 화면에서 보고 지울 수 있다.
// - 내 PC 문서: "폴더에서 보기"만. 파일을 실행·열기 하지 않는다(확장자 무관). 탐색기가 그 항목을 선택한 채 폴더를 연다.
// - 앱 화면: 이름 13개 중 하나면 앱 안 화면 이동.
// 이 모듈은 다른 모듈을 불러오지 않고 시계·난수·외부 통신을 쓰지 않는다. 저장소·여는 함수·화면 이동·시트는 부른 쪽이 넘긴다.

export const FINDER_ASSISTANT='finder',FINDER_HEADING='## 찾은 자료';
export const FINDER_HEAD=Object.freeze(['종류','제목','위치']);
export const FINDER_MAX_ROWS=30,TITLE_MAX=80,WEB_MAX=2048,FILE_MAX=1024;
export const KINDS=Object.freeze({'웹':'web','파일':'file','앱':'app'});
// 화면 이름 → 앱 화면 키(app.mjs NAV 라벨과 같다, 시험이 대조). 연결 · 장치·고급은 보안 화면이라 뺀다.
export const APP_VIEWS=Object.freeze({'오늘':'HOME','행동 기록':'ACTIONS','계획':'PLANS','달력':'CALENDAR','영역':'LIFE','돈':'LEDGER','재정 기록':'FINANCE','건강':'HEALTH','공부':'STUDY','이력':'HISTORY','상태':'STATUS','탑':'PROGRESS','설정':'SETTINGS'});
// V6F (지시서 8): 화면 이름 가계부 → 돈, 재정 → 재정 기록. 이미 적어 둔 링크 파일의 옛 이름도 그대로 연다.
export const APP_VIEW_ALIASES=Object.freeze({'가계부':'LEDGER','재정':'FINANCE'});
export const TRUST_KEY='lb.finder.trust.v1',TRUST_MAX=200;

export const LINK_TEXT=Object.freeze({
  LINK_FORMAT:'찾은 자료 표의 모양이 형식과 달라 링크를 만들지 않았습니다.',
  LINK_COUNT:'찾은 자료가 '+FINDER_MAX_ROWS+'줄을 넘어 링크를 만들지 않았습니다.',
  LINK_KIND:'찾은 자료의 종류가 웹·파일·앱이 아닌 줄이 있어 링크를 만들지 않았습니다.',
  LINK_TITLE:'찾은 자료의 제목이 비었거나 너무 길거나 보이지 않는 글자가 있어 링크를 만들지 않았습니다.',
  LINK_WEB:'열 수 없는 인터넷 주소가 있어 링크를 만들지 않았습니다(https 도메인 주소만).',
  LINK_FILE:'열 수 없는 파일 위치가 있어 링크를 만들지 않았습니다.',
  LINK_APP:'모르는 앱 화면 이름이 있어 링크를 만들지 않았습니다.',
  LINK_DUPLICATE:'같은 위치가 두 번 있어 링크를 만들지 않았습니다.',
  webNote:'LIFE BRICK 밖의 기본 브라우저에서 열립니다. 이 앱의 기록·주소는 보내지 않습니다. 브라우저 안의 일은 브라우저 설정을 따릅니다.',
  puny:'이 주소의 이름에는 xn-- 로 바뀐 특수 문자가 들어 있습니다. 비슷하게 생긴 가짜 주소일 수 있으니 확인하세요.',
  trust:'이 사이트는 다시 묻지 않기 (이 기기 설정)',
  fileNote:'파일을 열거나 실행하지 않습니다. 파일 탐색기에서 이 항목을 선택한 채 폴더만 엽니다.',
  opened:'열었습니다.',
  LINK_LOCKED:'잠금이 풀린 상태에서만 열 수 있습니다.',
  LINK_NOT_FOUND:'그 위치에 파일이나 폴더가 없습니다.',
  LINK_REFUSED:'바로가기·연결 폴더 등 안전하게 보여 줄 수 없는 위치라 열지 않았습니다.',
  LINK_BUSY:'앞의 열기가 아직 끝나지 않았습니다. 잠시 뒤 다시 누르세요.',
  LINK_RATE:'1분 동안 너무 많이 열었습니다. 잠시 뒤 다시 누르세요.',
  fail:'열지 못했습니다. 다시 시도해 주세요.',
  trustTitle:'인터넷 주소 바로 열기',
  trustAbout:'지식 파인더 결과에서 "다시 묻지 않기"로 한 사이트입니다. 이 사이트 주소는 확인창 없이 기본 브라우저에서 엽니다. (이 기기 설정 · 동기화하지 않음)',
  trustEmpty:'다시 묻지 않기로 한 사이트가 없습니다.',
  trustUnsaved:'이 기기 저장소에 쓰지 못했습니다. 이 목록은 앱을 닫기 전까지만 적용되고, 다시 열면 전의 목록으로 돌아갈 수 있습니다.',
  partial:'그 줄만 아래에 글로 남겼습니다.',
});
const OPEN_CODES=Object.freeze(['LINK_LOCKED','LINK_NOT_FOUND','LINK_REFUSED','LINK_BUSY','LINK_RATE']);
export const openResultText=code=>code==='MD_UNLOCK_REQUIRED'?LINK_TEXT.LINK_LOCKED:OPEN_CODES.includes(code)?LINK_TEXT[code]:LINK_TEXT.fail;

// ---- 규칙 (host link-opener.mjs가 같은 규칙을 따로 다시 검사한다) ----
const CONTROL=/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
// 도메인 이름: 소문자 영숫자·하이픈 이름 2개 이상을 점으로 잇는다. 끝 이름이 숫자뿐이면(IPv4) 거부, [ ](IPv6)·포트·localhost는 모양에서 걸린다.
const HOST=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const INNER_SUFFIX=/\.(?:local|internal|lan|localhost|home\.arpa)$/;
export function hostOK(host){
  return typeof host==='string'&&HOST.test(host)&&!/^\d+$/.test(host.slice(host.lastIndexOf('.')+1))&&!INNER_SUFFIX.test(host);
}
// 맞으면 정규화한 주소(new URL().href) 하나, 아니면 null. 앱은 주소를 만들거나 덧붙이지 않는다: 정규화(퓨니코드·기본 경로 /) 외 변경 0.
export function webHostOK(url){
  if(typeof url!=='string'||url.length>WEB_MAX||!url.startsWith('https://')||/[\s\\]/.test(url)||CONTROL.test(url)||!url.isWellFormed())return null;
  let u;try{u=new URL(url);}catch{return null;}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!hostOK(u.hostname))return null;
  return u.href.length<=WEB_MAX?u.href:null;
}
// 내 PC 위치: X:\ 로 시작하는 절대 경로. 폴더 범위 제한은 없고(소유자 결정 3) 안전장치만 둔다:
// UNC(\\서버)·장치 경로(\\?\ \\.\)·:스트림·..·/·와일드카드·큰따옴표·제어문자·끝 공백·점·장치 이름(CON·NUL…) 거부.
// FIX34 (H18): & % $ ; ^ 는 흔한 파일 이름 글자라 받는다(host는 대상을 환경변수로만 넘긴다, link-opener.mjs와 같은 규칙).
const SHELL_CHARS=/[*?"<>|`]/;
// FIX34 (S8): 방향·폭 없는 글자(U+202E·U+200B 등)는 경로·제목 표시를 속일 수 있어 거부한다. 그 줄이 글로 남을 때는 보이는 표시로 바꾼다.
const INVISIBLE=/[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/,INVISIBLE_ALL=new RegExp(INVISIBLE.source,'g');
const showInvisible=line=>line.replace(INVISIBLE_ALL,c=>'[U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')+']');
const DEVICE_NAME=/^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(?:\.|$)/i;
export function filePathOK(path){
  if(typeof path!=='string'||path.length<4||path.length>FILE_MAX||!path.isWellFormed()||CONTROL.test(path)||INVISIBLE.test(path))return false;
  if(!/^[A-Za-z]:\\/.test(path)||path.includes('/')||path.indexOf(':',2)>=0||path.includes('\\\\')||SHELL_CHARS.test(path))return false;
  const parts=path.slice(3).split('\\');
  return parts.every(p=>p.length>0&&p!=='.'&&p!=='..'&&!/[ .]$/.test(p)&&p.trim()===p&&!DEVICE_NAME.test(p));
}
const titleOK=t=>typeof t==='string'&&t.length>0&&[...t].length<=TITLE_MAX&&t.trim()===t&&!CONTROL.test(t)&&!INVISIBLE.test(t)&&t.isWellFormed();
const cellsOf=line=>{const t=line.trim();return t.length>=2&&t.startsWith('|')&&t.endsWith('|')?t.slice(1,-1).split('|').map(c=>c.trim()):null;};
const SEPARATOR=/^:?-{3,}:?$/;
const fail=code=>({status:'INVALID',code});

// 표 하나를 읽는다. NONE(제목 없음 → 지금처럼 글만) | INVALID(code) | OK(rows, 표가 있는 줄 범위 from..to).
// FIX34 (H18): OK에 틀린 줄이 섞여 있으면 bad=[{line,code}]와 첫 이유 code가 함께 온다. 맞는 줄이 하나도 없으면 INVALID(첫 이유). 줄 수 초과·머리줄 오류는 표 전체 거부.
export function parseFinderLinks(text){
  const lines=String(text??'').replace(/\r\n?/g,'\n').split('\n');
  const heads=lines.flatMap((l,i)=>l.trim()===FINDER_HEADING?[i]:[]);
  if(!heads.length)return {status:'NONE'};
  if(heads.length>1)return fail('LINK_FORMAT');
  let i=heads[0]+1;while(i<lines.length&&!lines[i].trim())i++;
  const head=cellsOf(lines[i]??''),sep=cellsOf(lines[i+1]??'');
  if(!head||head.join('|')!==FINDER_HEAD.join('|')||!sep||sep.length!==3||!sep.every(c=>SEPARATOR.test(c)))return fail('LINK_FORMAT');
  const rows=[],bad=[],seen=new Set();let k=i+2;
  for(;k<lines.length&&lines[k].trim().startsWith('|');k++){
    if(rows.length+bad.length>=FINDER_MAX_ROWS)return fail('LINK_COUNT');
    const r=rowOf(lines[k],seen);
    if(r.code)bad.push({line:k,code:r.code});else rows.push(r.row);
  }
  if(!rows.length)return fail(bad[0]?.code??'LINK_FORMAT');
  return {status:'OK',rows,from:heads[0],to:k,...(bad.length?{bad,code:bad[0].code}:{})};
}
// 표 한 줄: {row} 또는 틀린 이유 {code}.
function rowOf(line,seen){
  const c=cellsOf(line);
  if(!c||c.length!==3)return {code:'LINK_FORMAT'};
  const [label,title,where]=c,kind=Object.hasOwn(KINDS,label)?KINDS[label]:null;
  if(!kind)return {code:'LINK_KIND'};
  if(!titleOK(title))return {code:'LINK_TITLE'};
  let row;
  if(kind==='web'){const href=webHostOK(where);if(!href)return {code:'LINK_WEB'};row={kind,title,target:href,host:new URL(href).hostname};}
  else if(kind==='file'){if(!filePathOK(where))return {code:'LINK_FILE'};row={kind,title,target:where,name:where.slice(where.lastIndexOf('\\')+1)};}
  else{const key=Object.hasOwn(APP_VIEWS,where)?APP_VIEWS[where]:Object.hasOwn(APP_VIEW_ALIASES,where)?APP_VIEW_ALIASES[where]:null;if(!key)return {code:'LINK_APP'};row={kind,title,target:where,key};}
  const id=kind+'\n'+(kind==='file'?row.target.toLowerCase():row.target);
  if(seen.has(id))return {code:'LINK_DUPLICATE'};
  seen.add(id);
  return {row};
}

// ---- 다시 묻지 않기 목록: 이 기기 localStorage. 막혀 있으면 이번 실행 동안만 메모리에 둔다 ----
// FIX34 (HUNT34 H17): 저장에 실패한 목록은 저장소별로 메모리에 두고, 읽을 때 저장소보다 먼저 쓴다(지웠는데 다시 믿는 일이 없게). 다음 저장이 성공하면 버린다. 화면은 trustUnsaved로 알린다.
const NO_STORE={},memoryTrust=new WeakMap();
const memKey=storage=>storage??NO_STORE;
export const trustUnsaved=storage=>memoryTrust.has(memKey(storage));
export function loadTrust(storage){
  let raw=memoryTrust.get(memKey(storage));
  if(raw===undefined){
    let t=null;
    try{t=storage?.getItem(TRUST_KEY)??null;}catch{t=null;}   // 저장소가 없거나 막힘: 빈 목록(다시 묻는 쪽)
    raw=[];
    if(t!==null){try{raw=JSON.parse(t);}catch{raw=[];}}       // 깨진 값은 빈 목록(다시 묻는 쪽)
  }
  return [...new Set(Array.isArray(raw)?raw.filter(hostOK):[])].slice(0,TRUST_MAX);
}
function saveTrust(list,storage){try{if(!storage)throw new Error('NO_STORAGE');storage.setItem(TRUST_KEY,JSON.stringify(list));memoryTrust.delete(memKey(storage));}catch{memoryTrust.set(memKey(storage),list);/* 이번 실행 동안만 */}return list;}
export const isTrusted=(host,storage)=>loadTrust(storage).includes(host);
export function trustHost(host,storage){const cur=loadTrust(storage);if(!hostOK(host)||cur.includes(host)||cur.length>=TRUST_MAX)return cur;return saveTrust([...cur,host].sort(),storage);}
export const forgetHost=(host,storage)=>saveTrust(loadTrust(storage).filter(h=>h!==host),storage);
export const forgetAllHosts=storage=>saveTrust([],storage);

// ---- 화면 ----
// ctx={h:{el,add,button},kit:{sheet,toggle},surface,open(body)=>Promise,navigate(key),storage}. PC 앱이 아니거나 open이 없으면 null(단추 0, 지금처럼 글만).
export function renderFinderLinks(rows,ctx){
  if(ctx?.surface!=='APP_SHELL'||typeof ctx.open!=='function')return null;
  const {h,kit}=ctx,box=h.el('div',null,'finder-links'),msg=h.el('p','','muted');
  msg.setAttribute('role','status');
  let busy=false;
  // 여는 요청은 한 번에 하나. 성공 문구는 목록 아래, 실패 문구는 부른 자리(확인창 안 또는 목록 아래). 문구는 코드로만 고른다(주소·경로를 넣지 않는다).
  const send=async(body,sayFail)=>{
    if(busy)return false;busy=true;
    try{await ctx.open(body);msg.textContent=LINK_TEXT.opened;return true;}
    catch(e){sayFail(openResultText(typeof e?.code==='string'?e.code:''));return false;}
    finally{busy=false;}
  };
  const sheetFor=(title,parts,go,label)=>{
    const note=h.el('p','','muted');note.setAttribute('role','status');
    let dlg=null;
    const ok=h.button(label,async()=>{if(await go(t=>{note.textContent=t;}))dlg?.close();},'primary');
    dlg=kit.sheet(title,h.add(h.el('div',null,'finder-sheet'),...parts,note,h.add(h.el('div',null,'buttons'),ok,h.button('취소',()=>dlg?.close(),'secondary'))));
    return dlg;
  };
  const web=row=>{
    if(isTrusted(row.host,ctx.storage)){void send({kind:'web',url:row.target},t=>{msg.textContent=t;});return;}
    let remember=false;
    const parts=[h.add(h.el('p',null,'finder-sheet-host'),h.el('strong',row.host)),h.el('p',row.target,'path finder-sheet-url')];
    if(row.host.split('.').some(l=>l.startsWith('xn--')))parts.push(h.el('p',LINK_TEXT.puny,'finder-sheet-warn'));
    parts.push(h.el('p',LINK_TEXT.webNote,'muted'),h.add(h.el('div',null,'native-row'),kit.toggle(LINK_TEXT.trust,false,v=>{remember=Boolean(v);})));
    sheetFor(row.title,parts,async say=>{const done=await send({kind:'web',url:row.target},say);if(done&&remember){trustHost(row.host,ctx.storage);if(trustUnsaved(ctx.storage))msg.textContent=LINK_TEXT.trustUnsaved;}return done;},'열기');
  };
  const file=row=>sheetFor(row.title,[h.el('p',row.target,'path finder-sheet-url'),h.el('p',LINK_TEXT.fileNote,'muted')],say=>send({kind:'file',path:row.target},say),'폴더에서 보기');
  for(const row of rows){
    const sub=row.kind==='web'?row.host:row.kind==='file'?'내 PC · '+row.name:'앱 · '+row.target;
    const b=h.button('',()=>{msg.textContent='';if(row.kind==='web')web(row);else if(row.kind==='file')file(row);else ctx.navigate?.(row.key);},'secondary finder-link');
    h.add(b,h.el('span',row.title,'finder-link-title'),h.el('small',sub,'finder-link-sub'));
    h.add(box,b);
  }
  return h.add(box,msg);
}

// ai-gate.mjs reportCard의 decorate 훅. finder 보고만 본다. {head,node,tail}을 돌려주면 ai-gate가 head 글 → node → tail 글 순서로 붙인다.
export function decorateFinder(r,text,ctx){
  if(r?.assistant!==FINDER_ASSISTANT||ctx?.surface!=='APP_SHELL'||typeof ctx.open!=='function')return null;
  const p=parseFinderLinks(text);
  if(p.status==='NONE')return null;
  const {h}=ctx;
  if(p.status==='INVALID')return {head:'',node:h.el('p',LINK_TEXT[p.code]??LINK_TEXT.LINK_FORMAT,'finder-links-reason'),tail:String(text??'')};
  const lines=String(text??'').replace(/\r\n?/g,'\n').split('\n'),node=renderFinderLinks(p.rows,ctx),kept=(p.bad??[]).map(b=>showInvisible(lines[b.line]));
  if(p.bad)h.add(node,h.el('p',(LINK_TEXT[p.code]??LINK_TEXT.LINK_FORMAT)+' '+LINK_TEXT.partial,'finder-links-reason'));
  return {head:lines.slice(0,p.from+1).join('\n'),node,tail:[...kept,...lines.slice(p.to)].join('\n')};
}

// ---- 설정 화면: PC 앱에서만. 다시 묻지 않기로 한 사이트 보기·지우기 ----
export function renderFinderTrust(root,ctx){
  if(ctx?.surface!=='APP_SHELL')return null;
  const {h}=ctx,sec=h.add(h.el('section',null,'panel native-settings finder-trust'),h.el('h2',LINK_TEXT.trustTitle,'panel-title'));
  const list=h.el('div',null,'finder-trust-list');
  const draw=()=>{
    const hosts=loadTrust(ctx.storage);
    list.replaceChildren(...(hosts.length?hosts.map(host=>h.add(h.el('div',null,'native-row finder-trust-row'),h.el('span',host,'finder-trust-host'),h.button('지우기',()=>{forgetHost(host,ctx.storage);draw();},'secondary'))):[h.el('p',LINK_TEXT.trustEmpty,'muted')]));
    if(hosts.length)list.append(h.add(h.el('div',null,'buttons'),h.button('모두 지우기',()=>{forgetAllHosts(ctx.storage);draw();},'secondary')));
    if(trustUnsaved(ctx.storage))list.append(h.el('p',LINK_TEXT.trustUnsaved,'muted'));
  };
  draw();
  h.add(sec,h.el('p',LINK_TEXT.trustAbout,'muted'),list);
  h.add(root,sec);return sec;
}
