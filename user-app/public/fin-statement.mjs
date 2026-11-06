// B64A: 카드 명세서 파일 읽기 + 칸 고르기(순수 함수, DOM·네트워크 없음). 설계 AUTOPILOT/design/B64D_STATEMENT_IMPORT_DESIGN.md §3·§4.
// 파일 바이트·행 원문은 화면 메모리에서만 다룬다(저장·로그·전송 없음). 저장소(localStorage)에는 칸 번호·이름·취소 값만 기억한다.
// 지원: CSV/TSV(UTF-8·EUC-KR/CP949·UTF-16 BOM), HTML 표형 .xls, xlsx(B64A2: readStatementAsync + fin-xlsx.mjs). 진짜 옛 엑셀(BIFF)은 "xlsx 또는 CSV로 저장해서 넣어 주세요" 안내.
// 모든 칸은 글자로만 다룬다. 수식(= + - @로 시작)은 평가하지 않고 표지만 붙인다. 금액은 원 단위 정수 문자열(부호 포함), 계산은 BigInt.

export const STMT_LIMITS=Object.freeze({fileBytes:20_000_000,rows:20000,cell:200,headerScan:20,preview:30,merchant:120});
export const STMT_ERROR_TEXT=Object.freeze({
  STMT_EMPTY:'빈 파일입니다. 카드사에서 받은 명세서 파일을 고르세요.',
  STMT_TOO_BIG:'파일이 너무 큽니다(20MB 초과). 기간을 나눠 내려받으세요.',
  STMT_TOO_MANY_ROWS:'행이 너무 많습니다(20,000행 초과). 기간을 나눠 내려받으세요.',
  STMT_XLS_BINARY:'옛 엑셀(.xls) 파일은 이 화면에서 바로 읽지 않습니다. 엑셀·한셀·구글 시트에서 열어 "다른 이름으로 저장 → Excel 통합 문서(xlsx) 또는 CSV(UTF-8)"로 저장한 뒤 넣어 주세요.',
  STMT_XLSX_LATER:'xlsx 파일은 이 경로에서 바로 읽지 않습니다. 엑셀에서 "다른 이름으로 저장 → CSV(UTF-8)"로 저장해서 넣어 주세요.',
  STMT_ENCODING:'글자 인코딩을 읽지 못했습니다(UTF-8·EUC-KR이 아님). 엑셀에서 CSV(UTF-8)로 다시 저장해 주세요.',
  STMT_NO_TABLE:'표를 찾지 못했습니다. 카드사 명세서(이용내역) 파일인지 확인하세요.',
  STMT_NO_HEADER:'머리글 행(날짜·가맹점·금액)을 찾지 못했습니다. 아래 표에서 칸을 직접 고르세요.',
  STMT_COLUMNS:'날짜·가맹점·금액 칸을 서로 다른 칸으로 골라야 합니다.',
});
export const stmtErrorText=code=>typeof code==='string'&&Object.hasOwn(STMT_ERROR_TEXT,code)?STMT_ERROR_TEXT[code]:null;
const fail=code=>Object.assign(new Error(code),{code,finLocal:true});

// ---------- 1. 종류 판별(확장자 믿지 않음, 앞 바이트로) ----------
export function sniffStatement(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes??[]);
  if(!b.length)return 'EMPTY';
  if(b.length>STMT_LIMITS.fileBytes)return 'TOO_BIG';
  if(b[0]===0xD0&&b[1]===0xCF&&b[2]===0x11&&b[3]===0xE0)return 'BIFF';
  if(b[0]===0x50&&b[1]===0x4B)return 'XLSX';
  // HTML: BOM·공백 뒤 첫 글자가 '<'이거나 앞 1KB에 <html·<table이 있다(UTF-16은 0바이트를 빼고 본다).
  const head=String.fromCharCode(...b.subarray(0,1024).filter(x=>x!==0)).replace(/^�|^[\xEF\xBB\xBF\xFE\xFF]+/,'').toLowerCase();
  if(/^\s*</.test(head)||head.includes('<html')||head.includes('<table'))return 'HTML';
  return 'TEXT';
}
// BOM이 있으면 그것, 없으면 UTF-8(엄격) → EUC-KR(WHATWG 라벨, CP949 포함) 순서. 둘 다 안 되면 STMT_ENCODING.
export function decodeStatement(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const dec=(label,from=0)=>new TextDecoder(label,{fatal:true,ignoreBOM:true}).decode(b.subarray(from));
  if(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF)return {text:dec('utf-8',3),encoding:'UTF-8'};
  if(b[0]===0xFF&&b[1]===0xFE)return {text:dec('utf-16le',2),encoding:'UTF-16LE'};
  if(b[0]===0xFE&&b[1]===0xFF)return {text:dec('utf-16be',2),encoding:'UTF-16BE'};
  try{return {text:dec('utf-8'),encoding:'UTF-8'};}catch{/* 다음 후보 */}
  try{return {text:dec('euc-kr'),encoding:'EUC-KR'};}catch{throw fail('STMT_ENCODING');}
}

// ---------- 2. CSV/TSV (RFC 4180 수준: 따옴표 안 구분자·줄바꿈, "" 이스케이프, CRLF/LF/CR) ----------
const clip=(table,s,r,c)=>{if([...s].length<=STMT_LIMITS.cell)return s;table.cut.add(r+':'+c);return [...s].slice(0,STMT_LIMITS.cell).join('');};
function countOutsideQuotes(line,d){let n=0,q=false;for(const ch of line){if(ch==='"')q=!q;else if(ch===d&&!q)n++;}return n;}
export function detectDelimiter(text){
  const lines=text.split(/\r\n|\n|\r/).filter(l=>l.trim()).slice(0,20);let best=',',score=-1;
  for(const d of [',','\t',';']){
    const counts=lines.map(l=>countOutsideQuotes(l,d)),freq=new Map();for(const c of counts)if(c>0)freq.set(c,(freq.get(c)??0)+1);
    const [mode,hits]=[...freq.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]??[0,0];
    const s=hits*1000+mode;if(s>score){score=s;best=d;}
  }
  return best;
}
export function parseCsv(text,delimiter=detectDelimiter(text)){
  const table={rows:[],cut:new Set()};let row=[],cell='',q=false,i=0;
  const endCell=()=>{row.push(clip(table,cell,table.rows.length,row.length));cell='';};
  const endRow=()=>{endCell();if(row.some(c=>c!==''))table.rows.push(row);else if(table.rows.length)table.rows.push(row);row=[];if(table.rows.length>STMT_LIMITS.rows)throw fail('STMT_TOO_MANY_ROWS');};
  for(;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;continue;}
    if(ch==='"'&&cell==='')q=true;
    else if(ch===delimiter)endCell();
    else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;endRow();}
    else cell+=ch;
  }
  if(cell!==''||row.length)endRow();
  while(table.rows.length&&table.rows.at(-1).every(c=>c===''))table.rows.pop();
  return table;
}

// ---------- 3. HTML 표(.xls로 저장된 HTML). 문서에 넣지 않고 작은 토크나이저로 <table>·<tr>·<td>/<th>만 읽는다 ----------
const ENTITY={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '};
export function decodeEntities(s){
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi,(m,e)=>{
    if(e[0]==='#'){const n=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<=0x10FFFF&&!(n>=0xD800&&n<=0xDFFF)?String.fromCodePoint(n):'�';}
    return Object.hasOwn(ENTITY,e.toLowerCase())?ENTITY[e.toLowerCase()]:m;
  });
}
export function parseHtmlTables(text){
  const tables=[],stack=[];let i=0;
  const cur=()=>stack.at(-1)??null;
  // rowspan: 위 행에서 내려오는 칸은 빈칸으로 채워 아래 행의 칸 번호가 밀리지 않게 한다(2줄 머리글의 하위 머리글).
  const fillSpans=t=>{while(t.pending.has(t.row.length)){const c=t.row.length,n=t.pending.get(c);t.row.push('');if(n<=1)t.pending.delete(c);else t.pending.set(c,n-1);}};
  const closeCell=t=>{if(t?.cell!==null&&t?.cell!==undefined){if(!t.row)t.row=[];const v=decodeEntities(t.cell).replace(/[\s ]+/g,' ').trim(),start=t.row.length;t.row.push(clip(t,v,t.rows.length,start));for(let k=1;k<t.span;k++)t.row.push('');if(t.rspan>1)for(let k=start;k<start+t.span;k++)t.pending.set(k,t.rspan-1);t.cell=null;}};
  const closeRow=t=>{if(!t)return;closeCell(t);if(t.row){fillSpans(t);t.rows.push(t.row);if(t.rows.length>STMT_LIMITS.rows)throw fail('STMT_TOO_MANY_ROWS');}t.row=null;};
  while(i<text.length){
    const lt=text.indexOf('<',i);
    const chunk=text.slice(i,lt<0?text.length:lt);if(cur()&&cur().cell!==null)cur().cell+=chunk;
    if(lt<0)break;
    if(text.startsWith('<!--',lt)){const e=text.indexOf('-->',lt+4);i=e<0?text.length:e+3;continue;}
    const gt=text.indexOf('>',lt);if(gt<0)break;
    const tag=text.slice(lt+1,gt),m=/^(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(tag);i=gt+1;
    if(!m){if(cur()&&cur().cell!==null)cur().cell+='<';i=lt+1;continue;}
    const close=m[1]==='/',name=m[2].toLowerCase();
    if(!close&&(name==='script'||name==='style')){const e=text.toLowerCase().indexOf('</'+name,i);i=e<0?text.length:text.indexOf('>',e)+1||text.length;continue;}
    if(name==='table'){if(close){const t=stack.pop();if(t){closeRow(t);tables.push({rows:t.rows,cut:t.cut});}}else stack.push({rows:[],row:null,cell:null,span:1,rspan:1,pending:new Map(),cut:new Set()});continue;}
    const t=cur();if(!t)continue;
    if(name==='tr'){closeRow(t);if(!close)t.row=[];}
    else if(name==='td'||name==='th'){closeCell(t);if(!close){if(!t.row)t.row=[];fillSpans(t);const sp=/colspan\s*=\s*["']?(\d{1,3})/i.exec(tag),rs=/rowspan\s*=\s*["']?(\d{1,3})/i.exec(tag);t.span=sp?Math.max(1,Math.min(50,Number(sp[1]))):1;t.rspan=rs?Math.max(1,Math.min(200,Number(rs[1]))):1;t.cell='';}}
    else if(name==='br'&&t.cell!==null)t.cell+=' ';
  }
  while(stack.length){const t=stack.pop();closeRow(t);tables.push({rows:t.rows,cut:t.cut});}
  return tables.map(t=>({rows:t.rows.filter(r=>r.some(c=>c!=='')),cut:t.cut})).filter(t=>t.rows.length);
}

// 파일 → 표 목록. 표가 여럿이면 행이 가장 많은 표가 기본(tableIndex).
export function readStatement(bytes){
  const kind=sniffStatement(bytes);
  if(kind==='EMPTY')throw fail('STMT_EMPTY');if(kind==='TOO_BIG')throw fail('STMT_TOO_BIG');
  if(kind==='BIFF')throw fail('STMT_XLS_BINARY');if(kind==='XLSX')throw fail('STMT_XLSX_LATER');
  const {text,encoding}=decodeStatement(bytes);
  const tables=kind==='HTML'?parseHtmlTables(text):[parseCsv(text)].filter(t=>t.rows.length);
  if(!tables.length)throw fail('STMT_NO_TABLE');
  const tableIndex=tables.reduce((best,t,i)=>t.rows.length>tables[best].rows.length?i:best,0);
  return {kind,encoding,tables,tableIndex};
}
// B64A2: zip(PK)과 OLE2(암호 걸린 xlsx일 수 있음)는 넘겨받은 readXlsx(fin-xlsx.mjs)가 읽거나 거절한다. 압축 풀기가 비동기라 따로 두고, 이 모듈은 import 없이 둔다.
export async function readStatementAsync(bytes,readXlsx){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes??[]);
  return typeof readXlsx==='function'&&(b[0]===0x50&&b[1]===0x4B||sniffStatement(b)==='BIFF')?readXlsx(b):readStatement(b);
}

// ---------- 4. 머리글 찾기(2줄 머리글 합치기)·칸 추측 ----------
export const normHeader=s=>String(s??'').replace(/[\s 　]+/g,'').toLowerCase();
const KEYWORDS=[/일자|날짜|이용일|승인일|거래일/,/가맹점|이용처|상호|사용처/,/금액|원금/,/취소|상태/,/할부/,/통화|외화|현지/];
const SUB_WORDS=/회차|금액|수수료|잔액|원금|결제|통화|외화|포인트|혜택|기간|개월/;
// r번째 행을 머리글로: 다음 행이 하위 머리글(날짜·숫자 없음 + 회차·금액 같은 낱말)이면 합친다. 병합 칸은 왼쪽 위 이름을 이어 쓴다.
export function headerAt(rows,r){
  const top=rows[r]??[],next=rows[r+1]??[],nextCells=next.map(normHeader);
  const sub=nextCells.some(c=>c)&&!next.some(c=>parseDateCell(c)!==null||/^[-(]?[\d,]+\)?원?$/.test(normHeader(c)))&&nextCells.some(c=>c&&SUB_WORDS.test(c));
  const width=Math.max(top.length,sub?next.length:0),names=[];let carry='';
  for(let c=0;c<width;c++){
    const t=String(top[c]??'').trim(),low=sub?String(next[c]??'').trim():'';
    if(t)carry=t;
    names.push(low?((t||carry)+' '+low).trim():t);
  }
  return {headerRow:r,subRow:sub?r+1:null,dataStart:r+(sub?2:1),names};
}
// 처음 20행 중 날짜·가맹점·금액·취소·할부·통화 낱말이 2종류 이상 든 첫 행(안내문 행은 건너뜀). 못 찾으면 null(소유자가 고름).
export function findHeader(rows){
  const scan=Math.min(rows.length,STMT_LIMITS.headerScan);
  for(let r=0;r<scan;r++){
    const cells=rows[r].map(normHeader);
    if(KEYWORDS.filter(k=>cells.some(c=>c&&c.length<=40&&k.test(c))).length>=2)return headerAt(rows,r);
  }
  return null;
}
export const COLUMN_ROLES=Object.freeze(['date','merchant','amount','total','cancel','installments','round','foreign','currency','fee','card']);
export const COLUMN_TEXT=Object.freeze({date:'날짜(이용일·승인일)',merchant:'가맹점',amount:'금액(원화 청구·결제)',total:'원거래 전액(할부 가격·이용금액)',cancel:'취소 여부',installments:'할부(개월·n/m)',round:'할부 회차',foreign:'외화 금액(현지금액)',currency:'통화',fee:'수수료(해외·할부)',card:'카드 구분'});
export const REQUIRED_ROLES=Object.freeze(['date','merchant','amount']);
const pick=(names,tiers,not,taken)=>{for(const t of tiers){const i=names.findIndex((n,k)=>n&&!taken.has(k)&&t.test(n)&&!(not&&not.test(n)));if(i>=0)return i;}return -1;};
export function guessColumns(names){
  const n=names.map(normHeader),taken=new Set(),cols={},set=(role,i)=>{cols[role]=i;if(i>=0)taken.add(i);};
  set('date',pick(n,[/이용일자|이용일/,/승인일자|승인일/,/거래일자|거래일/,/일자|날짜/],/매입|결제일|기간/,taken));
  set('foreign',pick(n,[/현지금액|외화금액|외화/],null,taken));
  set('currency',pick(n,[/통화/],null,taken));
  set('installments',pick(n,[/할부(회차|기간|개월)|^할부$/],/가격|수수료|잔액/,taken));
  set('round',pick(n,[/회차/],/할부.*가격/,taken));
  set('amount',pick(n,[/결제금액|청구금액|원금/,/이용금액|승인금액|거래금액/,/금액/],/회차|잔액|수수료|포인트|혜택|할부가격|할부금액|현지|외화/,taken));
  set('total',pick(n,[/할부가격|할부금액|총액/,/이용금액|승인금액|거래금액/],/잔액|수수료|포인트|혜택|현지|외화|회차/,taken));
  set('merchant',pick(n,[/가맹점|이용처|상호|사용처/],/상세|포인트|혜택/,taken));
  set('cancel',pick(n,[/취소/,/상태/],null,taken));
  set('fee',pick(n,[/수수료/],null,taken));
  set('card',pick(n,[/이용카드|카드번호|카드명|카드구분|^카드$/],null,taken));
  return cols;
}
// 원거래 전액 칸이 따로 없을 때: 금액 칸이 이용·승인 금액(청구·결제·원금이 아님)이면 할부 행의 금액도 원거래 총액으로 본다(소유자가 끌 수 있음).
export function guessInstallAmountIsTotal(names,cols){
  const n=normHeader(names?.[cols?.amount]??'');
  return !(cols?.total>=0)&&/이용금액|승인금액|거래금액/.test(n)&&!/결제|청구|원금/.test(n);
}
export function columnsProblem(cols){
  const used=REQUIRED_ROLES.map(r=>cols?.[r]);
  if(used.some(i=>!Number.isInteger(i)||i<0)||new Set(used).size!==used.length)return 'STMT_COLUMNS';
  return null;
}

// ---------- 5. 칸 해석 ----------
const okDate=(y,m,d)=>{const s=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');const t=new Date(s+'T12:00:00Z');return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===s?s:null;};
// 결과: {date, noYear:{month,day}} 중 하나 또는 null. 시각이 붙어 있으면 날짜만 본다. 엑셀 일련번호(1900 체계)도 받는다.
export function parseDateCell(v){
  const s=String(v??'').trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/,'');if(!s)return null;
  let m=/^(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?\.?$/.exec(s);if(m){const d=okDate(m[1],m[2],m[3]);return d?{date:d}:null;}
  m=/^(\d{4})(\d{2})(\d{2})$/.exec(s);if(m){const d=okDate(m[1],m[2],m[3]);return d?{date:d}:null;}
  m=/^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(s);if(m){const d=okDate(2000+Number(m[1]),m[2],m[3]);return d?{date:d}:null;}
  m=/^(\d{1,2})[.\-/월]\s*(\d{1,2})일?$/.exec(s);if(m){const mo=Number(m[1]),da=Number(m[2]);return mo>=1&&mo<=12&&da>=1&&da<=31&&okDate(2024,mo,da)?{noYear:{month:mo,day:da}}:null;}
  m=/^(\d{5})(\.0+)?$/.exec(s);if(m){const n=Number(m[1]);if(n>=20000&&n<=80000){const t=new Date(Date.UTC(1899,11,30)+n*86400000);return {date:t.toISOString().slice(0,10)};}}
  return null;
}
// 연도 없는 날짜(MM/DD): 명세서 기간의 끝 날짜 해를 붙이고, 끝보다 뒤면 한 해 앞. 기간보다 앞이면 "확인 필요"(할부 원거래는 예외).
export function resolveYear(noYear,period){
  const end=period?.to??null;if(!end)return null;
  let y=Number(end.slice(0,4)),d=okDate(y,noYear.month,noYear.day);
  if(!d||d>end){y--;d=okDate(y,noYear.month,noYear.day);}
  return d?{date:d,early:!!period.from&&d<period.from}:null;
}
// 금액: 쉼표·공백·원·₩ 제거, (1,000)은 음수, 소수는 해석 실패(null). 결과는 부호 있는 원 단위 정수 문자열.
export function parseWonCell(v){
  let s=String(v??'').replace(/[\s, 원₩￦]/g,'');if(!s)return null;
  let neg=false;if(/^\(.*\)$/.test(s)){neg=true;s=s.slice(1,-1);}
  if(/^[-−]/.test(s)){neg=!neg;s=s.slice(1);}else if(s[0]==='+')s=s.slice(1);
  if(!/^\d{1,14}$/.test(s))return null;
  const n=BigInt(s);return (neg&&n>0n?'-':'')+n.toString();
}
// 해외 결제 한 칸 표기: "12,345   (9.99)" → 원화 12345 + 외화 9.99. 숫자만 있으면 외화 금액만.
export function parseForeignCell(v){
  const s=String(v??'').trim();if(!s)return null;
  const m=/^([\d,]+)\s*원?\s*\(\s*([A-Za-z]{3})?\s*([\d,]*\.?\d+)\s*([A-Za-z]{3})?\s*\)$/.exec(s);
  if(m)return {krw:parseWonCell(m[1]),amount:normDecimal(m[3]),currency:(m[2]||m[4]||'').toUpperCase()||null};
  const n=/^([A-Za-z]{3})?\s*([\d,]*\.?\d+)\s*([A-Za-z]{3})?$/.exec(s);
  return n?{krw:null,amount:normDecimal(n[2]),currency:(n[1]||n[3]||'').toUpperCase()||null}:null;
}
function normDecimal(t){const s=String(t).replace(/,/g,''),m=/^0*(\d{1,14})(?:\.(\d{1,4})\d*)?$/.exec(s.startsWith('.')?'0'+s:s);if(!m)return null;const frac=(m[2]??'').replace(/0+$/,'');return m[1]+(frac?'.'+frac:'');}
// 할부: '' → 없음, 일시불·0/0·0 → 0, n/m → m개월 n회차, 3개월·3 → 3, n회차 → 회차만. 해석 못 하면 unknown.
export function parseInstallmentCell(v,roundCell=''){
  const s=normHeader(v),r=normHeader(roundCell),out={months:null,round:null,unknown:false};
  const rn=/^(\d{1,2})(회차|회)?$/.exec(r);if(rn)out.round=Number(rn[1]);else if(r)out.unknown=true;
  if(!s)return out;
  let m;
  if(/^(일시불|일시|-|0)$/.test(s))out.months=0;
  else if((m=/^(\d{1,2})\/(\d{1,2})$/.exec(s))){out.months=Number(m[2]);out.round=Number(m[1]);if(out.months===0)out.round=null;}
  else if((m=/^(\d{1,2})(개월|월)?(할부)?$/.exec(s)))out.months=Number(m[1]);
  else if((m=/^(\d{1,2})(회차|회)$/.exec(s)))out.round=Number(m[1]);
  else out.unknown=true;
  if(out.months===1)out.months=0;   // 1개월 할부는 일시불과 같다
  if(out.months!==null&&out.months>60){out.unknown=true;out.months=null;}
  return out;
}
const FORMULA=/^[\s　]*[=+\-@＝＋－＠]/;
export const formulaLike=s=>FORMULA.test(String(s??''));
// 카드번호처럼 보이는 글자(숫자 12~19자리 또는 ****)는 미리보기에서 끝 4자리만 남긴다.
export function maskCell(v){
  const s=String(v??'');
  if(/\*{3,}/.test(s)||/\d[\d\- ]{10,}\d/.test(s)&&s.replace(/\D/g,'').length>=12)return s.replace(/\d(?=(?:[^\d]*\d){4})/g,'*');
  return s;
}
// 카드 구분 행(하나형: "(본인신용카드) 합성카드 1234 …")이나 카드 칸의 값 → 짧은 이름. 카드번호 전체는 남기지 않는다(끝 4자리만).
export function cardTag(text){
  const s=String(text??''),last=/(?<!\d)\d{4}(?!\d)/.exec(s)?.[0]??/\d{4}/.exec(s)?.[0]??'',kind=/체크/.test(s)?'체크카드':/신용/.test(s)?'신용카드':/가족/.test(s)?'가족카드':'';
  if(kind||/카드/.test(s))return ((kind||'카드')+(last?' …'+last:'')).trim();
  const short=s.replace(/\s+/g,'').toUpperCase();
  return short.length<=8?short:'카드 …'+(last||short.slice(-4));
}
const TOTAL_ROW=/^(합계|총계|총합계|합계금액|이용금액합계|총이용금액|청구금액합계|결제금액합계)/;
const SUBTOTAL_ROW=/소계/;
const CARD_ROW=/\((본인|가족)?[^)]{0,6}카드\)|^(본인|가족)(신용|체크)카드/;
const AUX_ROW=/상세정보|^(전화|tel|url|홈페이지)|https?:|www\./i;
const TRANSIT=/교통.{0,12}?(\d{1,4})\s*건/;
export const ROW_STATUS_TEXT=Object.freeze({DATE:'날짜를 읽지 못함',AMOUNT:'금액을 읽지 못함(소수·글자)',YEAR:'연도 없는 날짜 · 명세서 기간을 고르세요',FUTURE:'오늘보다 뒤 날짜',INSTALL_TOTAL:'할부 원거래 전액을 모름 · "원거래 전액" 칸을 고르거나 "이 금액이 총액"을 켜세요',ZERO:'금액 0원',CARD:'계정을 고르지 않은 카드'});

// 표 + 칸 고르기 → 명세서 행(stmtRow). opts: {columns, cancelValues, negativeIsCancel, installAmountIsTotal, period:{from,to}, localDate, dataStart}
// 행마다 {idx(표 행 번호), date, merchant, amount(부호 있는 원 정수 문자열|null), billed, used, cancel, months, round, installUnknown,
//  original, foreign, fee, cardTag, transit, flags[], problem(null이면 해석 성공)}.
export function normalizeRows(table,opts){
  const c=opts.columns,cell=(row,role)=>Number.isInteger(c[role])&&c[role]>=0?String(row[c[role]]??'').trim():'';
  const cancelSet=new Set((opts.cancelValues??[]).map(normHeader).filter(Boolean));
  const out={rows:[],skipped:{blank:0,total:0,subtotal:0,card:0,aux:0},controls:[],cards:[],sums:{billed:0n,used:0n}};
  let card=null;
  for(let r=opts.dataStart??0;r<table.rows.length;r++){
    const row=table.rows[r],texts=row.map(x=>String(x??'').trim()),first=normHeader(texts.find(Boolean)??'');
    if(!texts.some(Boolean)){out.skipped.blank++;continue;}
    const dateText=cell(row,'date'),parsedDate=parseDateCell(dateText);
    if(!parsedDate&&(TOTAL_ROW.test(first)||texts.some(t=>TOTAL_ROW.test(normHeader(t))&&!SUBTOTAL_ROW.test(t)))){
      out.skipped.total++;for(const t of texts){const w=parseWonCell(t);if(w!==null&&!TOTAL_ROW.test(normHeader(t)))out.controls.push(w);}continue;
    }
    if(!parsedDate&&texts.some(t=>SUBTOTAL_ROW.test(t))){out.skipped.subtotal++;continue;}
    if(!parsedDate&&texts.some(t=>CARD_ROW.test(normHeader(t)))){card=cardTag(texts.filter(Boolean).join(' '));if(!out.cards.includes(card))out.cards.push(card);out.skipped.card++;continue;}
    const billed=parseWonCell(cell(row,'amount')),used=parseWonCell(cell(row,'total'));
    if(!parsedDate&&(texts.some(t=>AUX_ROW.test(t))||billed===null&&used===null)){out.skipped.aux++;continue;}
    const item={idx:r,date:null,merchant:'',amount:null,billed,used,cancel:false,months:null,round:null,installUnknown:false,original:null,foreign:null,fee:null,cardTag:null,transit:null,flags:[],problem:null};
    // 가맹점: 공백 정리·잘못된 글자 치환·120자 자르기. 수식처럼 보이면 표지만 붙이고 글자는 그대로 둔다.
    let merchant=cell(row,'merchant').replace(/\s+/g,' ').trim();if(!merchant.isWellFormed())merchant=merchant.toWellFormed();
    if([...merchant].length>STMT_LIMITS.merchant){merchant=[...merchant].slice(0,STMT_LIMITS.merchant).join('');item.flags.push('MERCHANT_CUT');}
    if(table.cut.has(r+':'+c.merchant))item.flags.push('MERCHANT_CUT');
    if(formulaLike(merchant))item.flags.push('FORMULA');
    item.merchant=merchant;
    const tr=TRANSIT.exec(merchant);if(tr){item.transit=Number(tr[1]);item.flags.push('TRANSIT');}
    // 카드: 카드 칸이 있으면 그 값, 없으면 위의 카드 구분 행을 이어받는다.
    const cardText=cell(row,'card');item.cardTag=cardText?cardTag(cardText):card;if(item.cardTag&&!out.cards.includes(item.cardTag))out.cards.push(item.cardTag);
    // 날짜
    const inst=parseInstallmentCell(cell(row,'installments'),cell(row,'round'));item.months=inst.months;item.round=inst.round;item.installUnknown=inst.unknown;if(inst.unknown)item.flags.push('INSTALL_UNKNOWN');
    // 날짜(연도 없으면 명세서 기간으로 보정. 기간보다 앞이면 "연도 확인" 표지, 단 할부 원거래는 몇 달 전 날짜가 정상)
    if(parsedDate?.date)item.date=parsedDate.date;
    else if(parsedDate?.noYear){const y=resolveYear(parsedDate.noYear,opts.period);if(y){item.date=y.date;item.flags.push('YEAR_GUESSED');if(y.early&&!((inst.months??0)>=2))item.flags.push('EARLY');}else item.problem='YEAR';}
    else item.problem='DATE';
    // 외화·수수료
    const fx=parseForeignCell(cell(row,'foreign')),cur=normHeader(cell(row,'currency')).toUpperCase();
    if(fx?.amount){const code=/^[A-Z]{3}$/.test(cur)&&cur!=='KRW'?cur:fx.currency&&fx.currency!=='KRW'?fx.currency:null;item.foreign={amount:fx.amount,currency:code,krw:fx.krw};if(code)item.original={currency:code,amount:fx.amount};item.flags.push('FOREIGN');}
    const fee=parseWonCell(cell(row,'fee'));if(fee!==null&&fee!=='0'&&!fee.startsWith('-'))item.fee=fee;
    // 금액: 할부(2개월 이상)는 원거래 전액(이용금액·할부 가격), 그 밖은 원화 청구·결제 금액(없으면 이용금액).
    if(billed!==null)out.sums.billed+=BigInt(billed);if(used!==null)out.sums.used+=BigInt(used);
    if((item.months??0)>=2||item.round!==null&&item.round>=1&&(item.months??0)!==0){
      item.amount=used??(opts.installAmountIsTotal?billed:null);
      if(item.amount===null&&!item.problem){item.problem='INSTALL_TOTAL';item.flags.push('INSTALL_TOTAL_UNKNOWN');}
    }else item.amount=billed??used;
    if(item.amount===null&&!item.problem)item.problem='AMOUNT';
    // 취소: 취소 칸 값이 고른 목록에 있거나, "음수 = 취소"를 켰고 금액이 음수. 취소 행은 음수로 맞춘다.
    const cv=normHeader(cell(row,'cancel'));
    if(cv&&cancelSet.has(cv)||opts.negativeIsCancel&&item.amount!==null&&item.amount.startsWith('-'))item.cancel=true;
    if(item.cancel&&item.amount!==null&&!item.amount.startsWith('-')&&item.amount!=='0')item.amount='-'+item.amount;
    if(item.amount==='0'&&!item.problem)item.problem='ZERO';
    if(!item.problem&&opts.localDate&&item.date>opts.localDate)item.problem='FUTURE';
    out.rows.push(item);
  }
  return out;
}
// 합계 행 = 통제값. "파일 합계 = 가져올 행 합계"(청구·결제 금액 합 또는 이용금액 합 중 하나라도 같으면 일치).
export function controlCheck(norm){
  const sums=[norm.sums.billed,norm.sums.used].map(String),fileTotals=[...new Set(norm.controls)];
  if(!fileTotals.length)return {state:'NONE',fileTotals,sums,diff:null,reasons:[]};
  const hit=fileTotals.find(v=>sums.includes(v));
  if(hit!==undefined)return {state:'MATCH',fileTotals,sums,matched:hit,diff:'0',reasons:[]};
  const best=fileTotals.map(v=>BigInt(v)-norm.sums.billed).reduce((a,b)=>(a<0n?-a:a)<=(b<0n?-b:b)?a:b);
  const failed=norm.rows.filter(r=>r.problem).length,reasons=[];
  if(failed)reasons.push('해석 실패 '+failed+'행이 합계에 빠졌을 수 있음');
  if(norm.skipped.aux)reasons.push('보조 행으로 건너뛴 '+norm.skipped.aux+'행 중 거래가 있을 수 있음');
  if(!reasons.length)reasons.push('금액 칸을 다시 확인하세요(청구 금액과 이용 금액을 바꿔 골랐을 수 있음)');
  return {state:'MISMATCH',fileTotals,sums,diff:best.toString(),reasons};
}

// ---------- 6. 칸 짝 기억(이 기기 localStorage, 동기화 기록 아님) ----------
// 키 lb.fin.stmt.map.v1 = {[headerSig]: {columns, cancelValues, negativeIsCancel, installAmountIsTotal, accountId, cardAccounts, savedAt}}.
// headerSig = 정규화한 머리글을 '|'로 이은 글자의 SHA-256 앞 16자. 칸 이름·순서가 바뀌면 서명이 달라져 다시 고르기가 된다.
// 행 내용·금액·가맹점은 넣지 않는다. 저장소가 막혀 있으면 이번 실행 동안만 메모리에 둔다.
export const MAP_KEY='lb.fin.stmt.map.v1',MAP_MAX=30;
export async function headerSig(names){
  const d=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(names.map(normHeader).join('|')));
  return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
}
export async function bytesSha256(bytes){
  const d=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');
}
const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
function cleanEntry(e,width=Infinity){
  if(!e||typeof e!=='object')return null;
  const columns={};for(const r of COLUMN_ROLES){const i=e.columns?.[r];columns[r]=Number.isInteger(i)&&i>=-1&&i<width?i:-1;}
  if(columnsProblem(columns))return null;
  const cardAccounts={};for(const [k,v] of Object.entries(e.cardAccounts??{}).slice(0,20))if(typeof k==='string'&&k.length<=20&&(v===''||idOK(v)))cardAccounts[k]=v;
  return {columns,cancelValues:(Array.isArray(e.cancelValues)?e.cancelValues:[]).filter(v=>typeof v==='string'&&v.length<=20).slice(0,10),
    negativeIsCancel:e.negativeIsCancel===true,installAmountIsTotal:e.installAmountIsTotal===true,accountId:idOK(e.accountId)?e.accountId:'',cardAccounts,savedAt:typeof e.savedAt==='string'?e.savedAt.slice(0,24):''};
}
export function createMappingStore(storage){
  const memory=new Map();let persisted=true;
  const readAll=()=>{try{const v=JSON.parse(storage?.getItem(MAP_KEY)??'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{persisted=false;return {};}};
  return {
    get(sig,width){if(memory.has(sig))return cleanEntry(memory.get(sig),width);const all=readAll();return Object.hasOwn(all,sig)?cleanEntry(all[sig],width):null;},
    set(sig,entry){
      const clean=cleanEntry(entry);if(!clean||!/^[a-f0-9]{16}$/.test(sig))return false;
      memory.set(sig,clean);
      try{
        if(!storage)throw new Error('NO_STORAGE');
        const all=readAll();all[sig]=clean;
        const keep=Object.entries(all).sort((a,b)=>String(b[1]?.savedAt??'').localeCompare(String(a[1]?.savedAt??''))).slice(0,MAP_MAX);
        storage.setItem(MAP_KEY,JSON.stringify(Object.fromEntries(keep)));persisted=true;return true;
      }catch{persisted=false;return false;}
    },
    get persisted(){return persisted;},
  };
}
