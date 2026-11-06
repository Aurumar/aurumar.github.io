// B64A2: xlsx(엑셀 2007 이후) 명세서 읽기(순수 함수, DOM·네트워크·외부 라이브러리 없음). 설계 AUTOPILOT/design/B64D_STATEMENT_IMPORT_DESIGN.md §4.3.
// zip 중앙 디렉터리 → 필요한 항목만 DecompressionStream('deflate-raw')로 풀기(CRC 검사) → 작은 XML 토크나이저 → 시트마다 2차원 표.
// 결과는 fin-statement.mjs readStatement와 같은 모양: {kind, encoding, tables:[{rows:string[][], cut:Set('행:칸'), name}], tableIndex}.
// 병합 칸은 왼쪽 위만 값을 두고 나머지는 빈칸(HTML 표의 colspan·rowspan과 같음). 날짜 서식 숫자는 YYYY-MM-DD 글자로 바꾼다.
// 값은 글자로만 다룬다. 수식(<f>)은 계산하지 않고 파일에 저장된 결과 값만 쓴다. DTD·엔티티 정의는 읽지 않는다(외부 엔티티 없음).
// DecompressionStream이 없는 기기(옛 Safari 등)는 "CSV로 저장해서 넣어 주세요" 안내. 자체 inflate는 만들지 않는다.

// rows·cell은 fin-statement STMT_LIMITS와 같다. ratio: 1MB 넘는 항목이 압축 대비 200배 넘게 풀리면 폭탄으로 본다. ms: 읽기 시간 상한.
export const XLSX_LIMITS=Object.freeze({zipBytes:30_000_000,unzipBytes:100_000_000,entries:2000,ratio:200,ratioFloor:1_000_000,sheets:30,rows:20000,cols:256,cell:200,merges:10000,ms:20000});
export const XLSX_ERROR_TEXT=Object.freeze({
  STMT_XLSX_NO_INFLATE:'이 기기의 브라우저는 xlsx(압축 파일)를 풀지 못합니다. 엑셀에서 "다른 이름으로 저장 → CSV(UTF-8)"로 저장해서 넣어 주세요.',
  STMT_XLSX_BROKEN:'xlsx 파일이 깨졌거나 엑셀 파일이 아닙니다. 엑셀에서 다시 저장하거나 "다른 이름으로 저장 → CSV(UTF-8)"로 저장해서 넣어 주세요.',
  STMT_XLSX_ENCRYPTED:'암호가 걸린 엑셀 파일은 읽지 않습니다. 엑셀에서 암호를 풀고 저장하거나 "다른 이름으로 저장 → CSV(UTF-8)"로 저장해서 넣어 주세요.',
  STMT_XLSX_UNSUPPORTED:'지원하지 않는 xlsx 압축 형식입니다(zip64·분할·다른 압축 방식). 엑셀에서 "다른 이름으로 저장 → CSV(UTF-8)"로 저장해서 넣어 주세요.',
  STMT_XLSX_TOO_BIG:'xlsx 파일이 너무 큽니다(압축 30MB·푼 크기 100MB·항목 수 초과). 기간을 나눠 내려받으세요.',
  STMT_XLSX_BOMB:'xlsx 안 압축 비율이 비정상입니다(압축 폭탄 의심). 이 파일은 읽지 않습니다.',
  STMT_XLSX_PATH:'xlsx 안 파일 이름이 이상합니다(.. 경로·절대 경로). 이 파일은 읽지 않습니다.',
  STMT_XLSX_TIMEOUT:'xlsx를 읽는 데 너무 오래 걸려 멈췄습니다. 기간을 나눠 내려받거나 "다른 이름으로 저장 → CSV(UTF-8)"로 저장해서 넣어 주세요.',
});
export const xlsxErrorText=code=>typeof code==='string'&&Object.hasOwn(XLSX_ERROR_TEXT,code)?XLSX_ERROR_TEXT[code]:null;
const fail=code=>Object.assign(new Error(code),{code,finLocal:true});
const tick=ctx=>{if(ctx.now()>ctx.deadline)throw fail('STMT_XLSX_TIMEOUT');};

// 기능 감지: DecompressionStream이 있고 'deflate-raw'를 받아야 한다(Chromium 103+, Safari 16.4+).
export function xlsxSupported(DS=globalThis.DecompressionStream){
  if(typeof DS!=='function')return false;
  try{new DS('deflate-raw');return true;}catch{return false;}
}

// ---------- 1. 바이트 ----------
const u16=(b,o)=>b[o]|b[o+1]<<8,u32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;
let CRC=null;
export function crc32(b){
  if(!CRC){CRC=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^c>>>1:c>>>1;CRC[n]=c>>>0;}}
  let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^c>>>8;return (c^0xFFFFFFFF)>>>0;
}
// OLE2 표지 앞 4바이트(fin-statement sniffStatement의 BIFF 판별과 같은 기준).
const isCfb=b=>b[0]===0xD0&&b[1]===0xCF&&b[2]===0x11&&b[3]===0xE0;
// 암호 걸린 xlsx는 zip이 아니라 OLE2 복합 문서 안의 EncryptedPackage 스트림이다(디렉터리 이름은 UTF-16LE).
export function isEncryptedOffice(b){
  if(!isCfb(b))return false;
  const name=[...'EncryptedPackage'].flatMap(ch=>[ch.charCodeAt(0),0]);
  for(let i=b.indexOf(name[0]);i>=0&&i+name.length<=b.length;i=b.indexOf(name[0],i+1)){
    let k=1;while(k<name.length&&b[i+k]===name[k])k++;
    if(k===name.length)return true;
  }
  return false;
}

// ---------- 2. zip: 뒤에서 중앙 디렉터리를 읽는다. 저장(0)·DEFLATE(8)만, 암호화·zip64·분할은 거절 ----------
// 이름 검사: 풀어서 디스크에 쓰지는 않지만(zip slip 무관) .. 경로·절대 경로·역슬래시·NUL이 있으면 파일 전체를 거절한다.
const badName=s=>!s||s.length>300||/[\0\\]|^\/|^[A-Za-z]:/.test(s)||s.split('/').includes('..');
function readDirectory(b){
  let e=-1;
  for(let i=b.length-22,min=Math.max(0,b.length-65557);i>=min;i--)if(b[i]===0x50&&b[i+1]===0x4B&&b[i+2]===5&&b[i+3]===6){e=i;break;}
  if(e<0)throw fail('STMT_XLSX_BROKEN');
  if(e>=20&&u32(b,e-20)===0x07064b50)throw fail('STMT_XLSX_UNSUPPORTED');
  const disk=u16(b,e+4),cdDisk=u16(b,e+6),onDisk=u16(b,e+8),count=u16(b,e+10),size=u32(b,e+12),offset=u32(b,e+16);
  if(count===0xFFFF||size===0xFFFFFFFF||offset===0xFFFFFFFF||disk!==0||cdDisk!==0||onDisk!==count)throw fail('STMT_XLSX_UNSUPPORTED');
  if(count>XLSX_LIMITS.entries)throw fail('STMT_XLSX_TOO_BIG');
  if(!count||offset+size>e)throw fail('STMT_XLSX_BROKEN');
  const entries=new Map(),dec=new TextDecoder('utf-8');let p=offset;
  for(let n=0;n<count;n++){
    if(p+46>offset+size||u32(b,p)!==0x02014b50)throw fail('STMT_XLSX_BROKEN');
    const flags=u16(b,p+8),method=u16(b,p+10),nl=u16(b,p+28),xl=u16(b,p+30),cl=u16(b,p+32),next=p+46+nl+xl+cl;
    if(next>offset+size)throw fail('STMT_XLSX_BROKEN');
    const name=dec.decode(b.subarray(p+46,p+46+nl));
    if(badName(name))throw fail('STMT_XLSX_PATH');
    if(flags&1||method===99)throw fail('STMT_XLSX_ENCRYPTED');
    if(entries.has(name))throw fail('STMT_XLSX_BROKEN');
    entries.set(name,{flags,method,crc:u32(b,p+16),csize:u32(b,p+20),usize:u32(b,p+24),local:u32(b,p+42)});
    p=next;
  }
  return {entries,cdOffset:offset};
}
// 푼 크기는 중앙 디렉터리 값을 믿지 않고 상한으로만 쓴다: 그보다 더 풀리면 폭탄, 덜 풀리거나 CRC가 다르면 깨진 파일.
async function inflate(ctx,raw,size){
  if(!xlsxSupported(ctx.DS))throw fail('STMT_XLSX_NO_INFLATE');
  const ds=new ctx.DS('deflate-raw'),w=ds.writable.getWriter(),r=ds.readable.getReader(),out=new Uint8Array(size);let n=0;
  w.write(raw).then(()=>w.close()).catch(()=>{});
  try{
    for(;;){
      const {done,value}=await r.read();if(done)break;
      if(n+value.length>size)throw fail('STMT_XLSX_BOMB');
      out.set(value,n);n+=value.length;tick(ctx);
    }
  }catch(e){r.cancel().catch(()=>{});if(e?.finLocal)throw e;throw fail('STMT_XLSX_BROKEN');}
  if(n!==size)throw fail('STMT_XLSX_BROKEN');
  return out;
}
async function entryBytes(ctx,name){
  const ent=name?ctx.entries.get(name):null;if(!ent)return null;
  tick(ctx);
  const b=ctx.bytes,p=ent.local;
  if(p+30>ctx.cdOffset||u32(b,p)!==0x04034b50)throw fail('STMT_XLSX_BROKEN');
  const start=p+30+u16(b,p+26)+u16(b,p+28),end=start+ent.csize;
  if(end>ctx.cdOffset)throw fail('STMT_XLSX_BROKEN');
  if(ent.method!==0&&ent.method!==8)throw fail('STMT_XLSX_UNSUPPORTED');
  if(ent.usize>XLSX_LIMITS.unzipBytes-ctx.used)throw fail('STMT_XLSX_TOO_BIG');
  if(ent.usize>XLSX_LIMITS.ratioFloor&&ent.usize>ent.csize*XLSX_LIMITS.ratio)throw fail('STMT_XLSX_BOMB');
  ctx.used+=ent.usize;
  const raw=b.subarray(start,end);let out;
  if(ent.method===0){if(ent.csize!==ent.usize)throw fail('STMT_XLSX_BROKEN');out=raw;}
  else out=await inflate(ctx,raw,ent.usize);
  if(crc32(out)!==ent.crc)throw fail('STMT_XLSX_BROKEN');
  return out;
}
function decodeXml(u){
  if(u[0]===0xFF&&u[1]===0xFE)return new TextDecoder('utf-16le').decode(u);
  if(u[0]===0xFE&&u[1]===0xFF)return new TextDecoder('utf-16be').decode(u);
  return new TextDecoder('utf-8').decode(u);
}

// ---------- 3. 작은 XML 토크나이저: 여는 태그(이름·속성 글자)·닫는 태그·글자만 낸다 ----------
// 처리 지시·주석·DOCTYPE(안쪽 [...] 포함)은 건너뛴다. CDATA는 글자(엔티티 풀지 않음). 이름의 접두사(x:c → c)는 뗀다.
const XML_ENT={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"};
export function xmlUnescape(s){
  if(!s.includes('&'))return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|lt|gt|amp|quot|apos);/g,(m,e)=>{
    if(e[0]!=='#')return XML_ENT[e];
    const n=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
    return n>0&&n<=0x10FFFF&&!(n>=0xD800&&n<=0xDFFF)?String.fromCodePoint(n):'�';
  });
}
// OOXML 글자 이스케이프 _xHHHH_(예: _x000D_ 줄바꿈). _x005F_는 밑줄 자체.
const unx=s=>s.includes('_x')?s.replace(/_x([0-9A-Fa-f]{4})_/g,(m,h)=>String.fromCharCode(parseInt(h,16))):s;
const localName=n=>{const c=n.indexOf(':');return c<0?n:n.slice(c+1);};
export function scanXml(text,on,ctx=null){
  const len=text.length;let i=0,k=0;
  while(i<len){
    const lt=text.indexOf('<',i),stop=lt<0?len:lt;
    if(stop>i&&on.text)on.text(text.slice(i,stop),false);
    if(lt<0)break;
    if((++k&4095)===0&&ctx)tick(ctx);
    if(text.startsWith('<!--',lt)){const e=text.indexOf('-->',lt+4);if(e<0)throw fail('STMT_XLSX_BROKEN');i=e+3;continue;}
    if(text.startsWith('<![CDATA[',lt)){const e=text.indexOf(']]>',lt+9);if(e<0)throw fail('STMT_XLSX_BROKEN');if(on.text)on.text(text.slice(lt+9,e),true);i=e+3;continue;}
    if(text.startsWith('<?',lt)){const e=text.indexOf('?>',lt+2);if(e<0)throw fail('STMT_XLSX_BROKEN');i=e+2;continue;}
    if(text.startsWith('<!',lt)){let d=0,j=lt+2;for(;j<len;j++){const ch=text[j];if(ch==='[')d++;else if(ch===']')d--;else if(ch==='>'&&d<=0)break;}i=j+1;continue;}
    let j=lt+1,q=0;
    for(;j<len;j++){const ch=text.charCodeAt(j);if(q){if(ch===q)q=0;}else if(ch===62)break;else if(ch===34||ch===39)q=ch;}
    if(j>=len)throw fail('STMT_XLSX_BROKEN');
    const body=text.slice(lt+1,j);i=j+1;
    if(body[0]==='/'){on.close?.(localName(body.slice(1).trim()));continue;}
    const self=body.endsWith('/'),inner=self?body.slice(0,-1):body,m=/^[^\s/>]+/.exec(inner);
    if(!m)throw fail('STMT_XLSX_BROKEN');
    const name=localName(m[0]);
    on.open?.(name,inner.slice(m[0].length));
    if(self)on.close?.(name);
  }
}
export function xmlAttrs(s){
  const o=Object.create(null);
  for(const m of s.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))o[m[1]]=xmlUnescape(m[2]??m[3]);
  return o;
}
const attrLocal=(o,name)=>{for(const k in o)if(k===name||k.endsWith(':'+name))return o[k];return undefined;};

// ---------- 4. 통합 문서·관계·공유 문자열·서식 ----------
function parseRels(text,ctx){
  const out=[];
  scanXml(text,{open(n,a){if(n!=='Relationship')return;const at=xmlAttrs(a);if(at.TargetMode!=='External')out.push({id:String(at.Id??''),type:String(at.Type??''),target:String(at.Target??'')});}},ctx);
  return out;
}
// 관계 대상 경로를 패키지 안 이름으로: 절대(/xl/…)는 앞 / 를 떼고, 상대는 기준 파일 폴더에서 푼다. 패키지 밖으로 나가면 null.
export function resolvePart(base,target){
  const segs=target.startsWith('/')?[]:base.split('/').slice(0,-1);
  for(const s of target.replace(/^\/+/,'').split('/')){if(s==='..'){if(!segs.length)return null;segs.pop();}else if(s&&s!=='.')segs.push(s);}
  return segs.join('/')||null;
}
const relsPathOf=p=>{const i=p.lastIndexOf('/');return p.slice(0,i+1)+'_rels/'+p.slice(i+1)+'.rels';};
function parseWorkbook(text,ctx){
  const sheets=[];let date1904=false;
  scanXml(text,{open(n,a){
    if(n==='workbookPr'){const v=xmlAttrs(a).date1904;date1904=v==='1'||v==='true';}
    else if(n==='sheet'&&sheets.length<XLSX_LIMITS.sheets){const at=xmlAttrs(a);sheets.push({name:String(at.name??'').slice(0,31),hidden:at.state==='hidden'||at.state==='veryHidden',rid:String(attrLocal(at,'id')??'')});}
  }},ctx);
  return {sheets,date1904};
}
// 공유 문자열: <si><t> 또는 서식 있는 글자 <si><r><t>…</r>를 이어붙인다. 발음 표기(<rPh>) 안의 글자는 뺀다.
function parseSharedStrings(text,ctx){
  const out=[];let cur=null,inT=false,ph=0;
  scanXml(text,{
    open(n){if(n==='si')cur='';else if(n==='t'&&cur!==null&&!ph)inT=true;else if(n==='rPh')ph++;},
    close(n){if(n==='si'){out.push(unx(cur??''));cur=null;inT=false;}else if(n==='t')inT=false;else if(n==='rPh')ph=Math.max(0,ph-1);},
    text(s,cdata){if(inT)cur+=cdata?s:xmlUnescape(s);},
  },ctx);
  return out;
}
// 날짜 서식: 내장 번호(14~17·22·27~31·34~36·50~54·57·58 날짜, 18~21·32·33·45~47·55·56 시각) 또는
// 사용자 서식에서 따옴표 글자·\ 이스케이프·[…](색·지역·경과 시간)·AM/PM을 뺀 나머지에 y·m·d(날짜)·h·s(시각)가 있고 0·#·?가 없을 때.
const BUILTIN_DATE=new Set([14,15,16,17,27,28,29,30,31,34,35,36,50,51,52,53,54,57,58]),BUILTIN_TIME=new Set([18,19,20,21,32,33,45,46,47,55,56]);
export function dateFormatKind(id,code){
  if(code===undefined||code===null){if(id===22)return 'datetime';if(BUILTIN_DATE.has(id))return 'date';if(BUILTIN_TIME.has(id))return 'time';return null;}
  const s=String(code).split(';')[0].replace(/"[^"]*"/g,'').replace(/\\./g,'').replace(/\[[^\]]*\]/g,'').replace(/am\/pm|a\/p/gi,'').toLowerCase();
  if(/[0#?@]/.test(s)||s.includes('general'))return null;
  const t=/[hs]/.test(s),d=/[yd]/.test(s)||!t&&s.includes('m');
  return d&&t?'datetime':d?'date':t?'time':null;
}
// 셀 서식 번호(s=) → 날짜 종류. cellXfs 안의 xf만 본다(cellStyleXfs 아님). 엑셀은 applyNumberFormat이 없어도 numFmtId를 쓴다.
function parseStyles(text,ctx){
  const fmts=new Map(),xfs=[];let inXfs=false;
  scanXml(text,{
    open(n,a){if(n==='numFmt'){const at=xmlAttrs(a);fmts.set(Number(at.numFmtId),String(at.formatCode??''));}else if(n==='cellXfs')inXfs=true;else if(n==='xf'&&inXfs)xfs.push(Number(xmlAttrs(a).numFmtId??0));},
    close(n){if(n==='cellXfs')inXfs=false;},
  },ctx);
  return xfs.map(id=>dateFormatKind(id,fmts.get(id)));
}

// ---------- 5. 셀 값 → 글자 ----------
// 숫자: 정수는 그대로, 소수는 엑셀 표시 정밀도(15자리)로 다듬는다(0.1+0.2 꼴 꼬리 없앰).
export function numberText(v){
  const s=String(v).trim();if(/^-?\d{1,15}$/.test(s))return s.replace(/^(-?)0+(?=\d)/,'$1');
  const n=Number(s);return s&&Number.isFinite(n)?String(Number(n.toPrecision(15))):s;
}
// 날짜 일련번호 → YYYY-MM-DD(시각 있는 서식이면 뒤에 HH:MM:SS). 1900 체계: 1=1900-01-01, 60(없는 1900-02-29)은 숫자 그대로. date1904: 0=1904-01-01.
export function serialText(v,kind,date1904=false){
  const n=Number(String(v).trim());if(!Number.isFinite(n)||n<0)return numberText(v);
  let day=Math.floor(n),secs=Math.round((n-day)*86400);if(secs>=86400){if(kind==='date')secs=0;else{day++;secs-=86400;}}
  const hms=[Math.floor(secs/3600),Math.floor(secs%3600/60),secs%60].map(x=>String(x).padStart(2,'0')).join(':');
  if(kind==='time')return hms;
  if(!date1904&&(day<1||day===60)||day>2958465)return numberText(v);
  const base=date1904?Date.UTC(1904,0,1):day<60?Date.UTC(1899,11,31):Date.UTC(1899,11,30);
  const ds=new Date(base+day*86400000).toISOString().slice(0,10);
  return kind==='datetime'&&secs?ds+' '+hms:ds;
}
// 칸 위치 "AB12" → {c:28, r:12}(1부터). 범위 "A1:C2".
export function cellRef(ref){
  const m=/^\$?([A-Za-z]{1,3})\$?(\d{1,7})?$/.exec(String(ref??''));if(!m)return null;
  let c=0;for(const ch of m[1].toUpperCase())c=c*26+ch.charCodeAt(0)-64;
  return {c,r:m[2]?Number(m[2]):0};
}
const rangeRef=ref=>{const [a,b]=String(ref??'').split(':'),p=cellRef(a),q=b===undefined?p:cellRef(b);return p&&q&&p.r&&q.r?{r1:Math.min(p.r,q.r),c1:Math.min(p.c,q.c),r2:Math.max(p.r,q.r),c2:Math.max(p.c,q.c)}:null;};
const clipCell=(cut,s,r,c)=>{if(s.length<=XLSX_LIMITS.cell||[...s].length<=XLSX_LIMITS.cell)return s;cut.add(r+':'+c);return [...s].slice(0,XLSX_LIMITS.cell).join('');};

// ---------- 6. 시트 → 표 ----------
// 값 있는 칸만 모은 뒤 병합 칸을 비우고, 첫 값 행부터 마지막 값 행까지(가운데 빈 행 포함, CSV와 같음) 같은 폭의 표로 낸다.
// 256칸 밖 값은 버리고 세어 둔다(dropped). 값 있는 행이 20,000을 넘으면 STMT_TOO_MANY_ROWS.
function parseSheet(text,ctx,fmtKinds,shared,date1904){
  const rows=new Map(),merges=[];let rowNo=0,colNo=0,cell=null,inV=false,inIs=false,inT=false,ph=0,dropped=0;
  const finish=()=>{
    const c=cell;cell=null;if(!c)return;
    let val;
    if(c.t==='s'){const i=Number(c.v);val=Number.isInteger(i)&&i>=0&&i<shared.length?shared[i]:'';}
    else if(c.t==='inlineStr')val=unx(c.is);
    else if(c.t==='str')val=unx(c.v);
    else if(c.t==='b')val=c.v.trim()==='1'?'TRUE':c.v.trim()==='0'?'FALSE':c.v;
    else if(c.t==='e')val=c.v.trim();
    else if(c.t==='d'){const m=/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/.exec(c.v.trim());val=m?m[2]&&m[2]!=='00:00:00'?m[1]+' '+m[2]:m[1]:c.v.trim();}
    else{const v=c.v.trim(),kind=fmtKinds[c.s]??null;val=!v?'':kind?serialText(v,kind,date1904):numberText(v);}
    if(val==='')return;
    if(c.c>XLSX_LIMITS.cols){dropped++;return;}
    let row=rows.get(c.r);
    if(!row){if(rows.size>=XLSX_LIMITS.rows)throw fail('STMT_TOO_MANY_ROWS');row=new Map();rows.set(c.r,row);}
    row.set(c.c,val);
  };
  scanXml(text,{
    open(n,a){
      if(n==='row'){const r=Number(attrLocal(xmlAttrs(a),'r'));rowNo=Number.isInteger(r)&&r>0?r:rowNo+1;colNo=0;}
      else if(n==='c'){finish();const at=xmlAttrs(a),ref=cellRef(at.r);colNo=ref?ref.c:colNo+1;if(ref?.r)rowNo=ref.r;if(!rowNo)rowNo=1;cell={r:rowNo,c:colNo,t:String(at.t??'n'),s:Number(at.s??0),v:'',is:''};}
      else if(n==='v'&&cell)inV=true;
      else if(n==='is'&&cell)inIs=true;
      else if(n==='t'&&inIs&&!ph)inT=true;
      else if(n==='rPh')ph++;
      else if(n==='mergeCell'&&merges.length<XLSX_LIMITS.merges){const g=rangeRef(xmlAttrs(a).ref);if(g)merges.push(g);}
    },
    close(n){if(n==='c')finish();else if(n==='v')inV=false;else if(n==='is')inIs=false;else if(n==='t')inT=false;else if(n==='rPh')ph=Math.max(0,ph-1);},
    text(s,cdata){if(!cell)return;if(inV)cell.v+=cdata?s:xmlUnescape(s);else if(inT)cell.is+=cdata?s:xmlUnescape(s);},
  },ctx);
  finish();
  const nums=[...rows.keys()].sort((a,b)=>a-b);
  for(const g of merges){
    tick(ctx);
    for(let r=Math.max(g.r1,nums[0]??1),end=Math.min(g.r2,nums.at(-1)??0);r<=end;r++){
      const row=rows.get(r);if(!row)continue;
      for(const c of [...row.keys()])if(c>=g.c1&&c<=g.c2&&!(r===g.r1&&c===g.c1))row.delete(c);
    }
  }
  const live=nums.filter(r=>rows.get(r).size),cut=new Set();
  if(!live.length)return {rows:[],cut,merges:merges.length,dropped};
  const first=live[0],last=live.at(-1);
  if(last-first+1>XLSX_LIMITS.rows)throw fail('STMT_TOO_MANY_ROWS');
  let width=0;for(const r of live)for(const c of rows.get(r).keys())if(c>width)width=c;
  const out=[];
  for(let r=first;r<=last;r++){
    const src=rows.get(r),row=new Array(width).fill('');
    if(src)for(const [c,v] of src)row[c-1]=clipCell(cut,v,out.length,c-1);
    out.push(row);
  }
  return {rows:out,cut,merges:merges.length,dropped};
}

// ---------- 7. 파일 → 표 목록 ----------
// opts: {DecompressionStream(시험용 주입, 기본 전역), now(시계, 기본 performance.now), ms(시간 상한)}.
// 시트마다 표 1개(값 없는 시트는 뺌). 기본 표는 숨기지 않은 첫 시트. OLE2 문서는 암호 걸린 xlsx면 STMT_XLSX_ENCRYPTED, 아니면 옛 엑셀(STMT_XLS_BINARY).
export async function readXlsx(bytes,opts={}){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes??[]);
  if(!b.length)throw fail('STMT_EMPTY');
  if(isCfb(b))throw fail(isEncryptedOffice(b)?'STMT_XLSX_ENCRYPTED':'STMT_XLS_BINARY');
  if(b.length>XLSX_LIMITS.zipBytes)throw fail('STMT_XLSX_TOO_BIG');
  if(b[0]!==0x50||b[1]!==0x4B)throw fail('STMT_XLSX_BROKEN');
  const now=typeof opts.now==='function'?opts.now:()=>globalThis.performance?.now?.()??0;
  const ctx={bytes:b,now,deadline:now()+(Number.isFinite(opts.ms)?opts.ms:XLSX_LIMITS.ms),used:0,DS:Object.hasOwn(opts,'DecompressionStream')?opts.DecompressionStream:globalThis.DecompressionStream,...readDirectory(b)};
  const xml=async name=>{const u=await entryBytes(ctx,name);return u?decodeXml(u):null;};
  const root=await xml('_rels/.rels'),office=root?parseRels(root,ctx).find(r=>r.type.endsWith('/officeDocument')):null;
  const wbPath=(office&&resolvePart('',office.target))||'xl/workbook.xml',wbXml=await xml(wbPath);
  if(wbXml===null)throw fail('STMT_XLSX_BROKEN');
  const wb=parseWorkbook(wbXml,ctx),relsXml=await xml(relsPathOf(wbPath)),rels=relsXml?parseRels(relsXml,ctx):[];
  const dir=wbPath.slice(0,wbPath.lastIndexOf('/')+1),part=type=>{const r=rels.find(x=>x.type.endsWith('/'+type));return r?resolvePart(wbPath,r.target):dir+type+'.xml';};
  const ssXml=await xml(part('sharedStrings')),shared=ssXml===null?[]:parseSharedStrings(ssXml,ctx);
  const stXml=await xml(part('styles')),fmtKinds=stXml===null?[]:parseStyles(stXml,ctx);
  let list=wb.sheets.map(s=>{const r=rels.find(x=>x.id===s.rid&&x.type.endsWith('/worksheet'));return {...s,path:r?resolvePart(wbPath,r.target):null};}).filter(s=>s.path);
  if(!list.length)list=[...ctx.entries.keys()].map(n=>[n,/^xl\/worksheets\/sheet(\d{1,3})\.xml$/.exec(n)]).filter(([,m])=>m).sort((x,y)=>x[1][1]-y[1][1]).slice(0,XLSX_LIMITS.sheets).map(([n,m])=>({name:'Sheet'+m[1],hidden:false,path:n}));
  const tables=[];
  for(const s of list){
    const text=await xml(s.path);if(text===null)continue;
    const t=parseSheet(text,ctx,fmtKinds,shared,wb.date1904);
    // FIX35 (HUNT35 D9): 1904 날짜 체계는 표에도 적는다 → normalizeRows가 "일반" 서식 날짜 숫자를 1904 기준으로 읽는다(app 배선 없이도).
    if(t.rows.length)tables.push({...t,name:s.name,hidden:s.hidden,...(wb.date1904?{date1904:true}:{})});
  }
  if(!tables.length)throw fail('STMT_NO_TABLE');
  const shown=tables.findIndex(t=>!t.hidden);
  return {kind:'XLSX',encoding:'UTF-8',tables,tableIndex:shown<0?0:shown,date1904:wb.date1904};
}
