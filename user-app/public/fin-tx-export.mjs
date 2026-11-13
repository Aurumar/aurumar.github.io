// A7: 가계부 거래를 비서(사령부 가계부 비서)가 읽을 CSV 한 장으로 넘긴다. 설정 토글(기본 꺼짐)을 켠 것이 동의다(D4, 8·9절 토글과 같은 방식).
// 이 모듈은 파일을 쓰지 않고 시계·난수·저장소·네트워크를 쓰지 않는다: 오늘 날짜·가리기 상태·보낼 곳·올리기 id는 부른 쪽(app.mjs)이 넘긴다. 금고 쓰기 0(읽기 투영 whole.fin만 본다).
// 칸: 날짜,가맹점,금액,분류,정기,수단 — 소비 줄(지출·환불)만, 금액은 원 단위 정수(지출 양수·환불 음수), 최근 13개월, 무효화된 거래 제외(투영 finLines가 이미 뺀다).
// 넣지 않음: 메모, 카드·계좌 번호(끝 4자리 포함), 계정 이름·발급사·메모, 위치, 기기 ID. "민감 가맹점 가리기"가 켜져 있으면 가린 표시 그대로.
// 쓰기 쪽(host fin-tx-writer.mjs)이 경로(%USERPROFILE%\AURUMAR_HQ\state\FIN_TX.csv)를 고정하고 같은 모양 검사를 한 번 더 한다(시험이 두 쪽 상수를 대조).
import {shownMerchant,shiftMonth,csvSafe} from './fin-ledger.mjs';
import {matchDraft} from './fin-recurring.mjs';
import {STACK_DONE} from './life-flow.mjs';

export const FIN_TX_ROUTE='/api/fin-tx-export',FIN_TX_FILE='FIN_TX.csv';
export const FIN_TX_HEADER=Object.freeze(['날짜','가맹점','금액','분류','정기','수단']);
export const FIN_TX_MONTHS=13,FIN_TX_MAX_BYTES=524288,FIN_TX_PART_BYTES=24576,FIN_TX_MAX_PARTS=32,FIN_TX_MERCHANT_MAX=60,FIN_TX_CATEGORY_MAX=30;
export const FIN_TX_MEANS=Object.freeze({CARD:'카드',CASH:'현금',BANK:'이체',EPAY:'간편결제',LOAN:'대출',OTHER:'기타'});
export const FIN_TX_SWITCH_KEY='lb.fin.txexport';
export const FIN_TX_LABEL='가계부 거래를 비서에게 넘기기(이 PC 파일)';
export const FIN_TX_NOTICE='가게 이름·금액·날짜가 이 PC의 AURUMAR_HQ\\state\\FIN_TX.csv에 저장되고, 비서(Claude)가 월 1회 읽습니다. 메모·카드번호는 넣지 않습니다.';
export const FIN_TX_BOM='\uFEFF',FIN_TX_EOL='\r\n';
export const finTxHeaderOnly=()=>FIN_TX_BOM+FIN_TX_HEADER.join(',')+FIN_TX_EOL;
export const finTxCutLine=month=>'# 잘림: '+month+' 이전 생략';

// ---- 이 기기 설정: 토글(기본 끔). 저장소가 막혀 있으면 이번 실행 동안만 ----
let memoryOn=false;
export function finTxEnabled(storage){try{const v=storage?.getItem(FIN_TX_SWITCH_KEY);return v===null||v===undefined?memoryOn:v==='1';}catch{return memoryOn;}}
export function setFinTxEnabled(on,storage){memoryOn=Boolean(on);try{storage?.setItem(FIN_TX_SWITCH_KEY,on?'1':'0');}catch{/* 이번 실행 동안만 */}return finTxEnabled(storage);}

// ---- 줄 만들기(순수) ----
// 글 칸 정리: 제어 문자 → 공백, 공백 모으기, 카드·계좌 번호 모양(숫자·* 8개 이상이 - 또는 공백으로 이어진 것)은 ####로, 길이 제한.
const NUMBER_SHAPE=/[0-9*](?:[0-9*]|[- ](?=[0-9*])){7,}/g;
export function finTxText(value,max){
  if(typeof value!=='string')return '';
  const t=value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFEFF]+/g,' ').replace(NUMBER_SHAPE,m=>(m.match(/[0-9*]/g)??[]).length>=8?'####':m).replace(/\s+/g,' ').trim();
  return [...t].slice(0,max).join('');
}
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const netOf=v=>{try{return v===null||v===undefined?null:typeof v==='bigint'?v:BigInt(v);}catch{return null;}};
const meansOf=(fin,accountId)=>{const t=(fin.accounts??[]).find(a=>a.id===accountId)?.data?.type;return Object.hasOwn(FIN_TX_MEANS,t??'')?FIN_TX_MEANS[t]:FIN_TX_MEANS.OTHER;};
const labelOf=(fin,c)=>c===null||c===undefined||c===''?'분류 없음':fin.labels?.expense?.[c]??fin.labels?.income?.[c]??c;
// 정기: 줄의 반복결제 지정(규칙 효과 recurring)이 INCLUDE면 Y, EXCLUDE면 N. 지정이 없으면 지출이 정기 결제 규칙(B48, 숨김 제외)의 가맹점·금액대와 맞을 때 Y.
function recurringOf(l,rules){
  if(l.recurring==='INCLUDE')return 'Y';
  if(l.recurring==='EXCLUDE'||l.kind!=='EXPENSE')return 'N';
  return matchDraft(rules,{merchant:l.merchant,amount:netOf(l.net)})?'Y':'N';
}
// fin = whole.fin(투영 결과: lines·accounts·labels·recurring). today = YYYY-MM-DD. mask = 화면의 "민감 가맹점 가리기" 상태.
// 돌려주는 값: [{month,cells:[날짜,가맹점,금액,분류,정기,수단]}] 날짜 오름차순.
export function finTxRows(fin,today,{mask=true}={}){
  if(!fin||!Array.isArray(fin.lines)||!dateOK(today))return [];
  const to=today.slice(0,7),from=shiftMonth(to,-(FIN_TX_MONTHS-1)),rules=fin.recurring?.data?.rules??[],out=[];
  for(const l of fin.lines){
    if(!l||l.voided||(l.kind!=='EXPENSE'&&l.kind!=='REFUND')||!dateOK(l.date))continue;
    const month=l.date.slice(0,7),net=netOf(l.net);
    if(month<from||month>to||net===null)continue;   // 순액 모름(부분 취소)은 금액이 없어 넣지 않는다
    out.push({month,date:l.date,key:String(l.key??''),cells:[l.date,finTxText(shownMerchant(l,mask),FIN_TX_MERCHANT_MAX)||'가맹점 없음',net.toString(),finTxText(labelOf(fin,l.category),FIN_TX_CATEGORY_MAX)||'분류 없음',recurringOf(l,rules),meansOf(fin,l.accountId)]});
  }
  out.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
  return out.map(({month,cells})=>({month,cells}));
}
// CSV 칸: 글 칸(가맹점·분류)은 수식 주입 방지(csvSafe) 뒤 항상 따옴표. 날짜·금액·정기·수단은 정해진 모양이라 그대로.
const quote=t=>'"'+t.replace(/"/g,'""')+'"';
export const finTxLine=c=>[c[0],quote(csvSafe(c[1])),c[2],quote(csvSafe(c[3])),c[4],c[5]].join(',');
const bytesOf=t=>new TextEncoder().encode(t).length;
// 전체 글(BOM, CRLF). 상한을 넘으면 오래된 달부터 빼고 머리말 다음 줄에 "# 잘림: YYYY-MM 이전 생략"(YYYY-MM = 남은 첫 달).
export function buildFinTxCsv(rows,{maxBytes=FIN_TX_MAX_BYTES}={}){
  const head=finTxHeaderOnly(),lines=rows.map(r=>({month:r.month,text:finTxLine(r.cells)+FIN_TX_EOL}));
  const sizes=lines.map(l=>bytesOf(l.text));let total=bytesOf(head)+sizes.reduce((a,b)=>a+b,0),start=0,cut=null;
  const over=()=>total+(cut?bytesOf(finTxCutLine(cut)+FIN_TX_EOL):0)>maxBytes;
  while(over()&&start<lines.length){
    const m=lines[start].month;
    while(start<lines.length&&lines[start].month===m){total-=sizes[start];start++;}   // 가장 오래된 달 하나를 통째로 뺀다
    cut=start<lines.length?lines[start].month:shiftMonth(m,1);
  }
  const text=head+(cut?finTxCutLine(cut)+FIN_TX_EOL:'')+lines.slice(start).map(l=>l.text).join('');
  return {text,rows:lines.length-start,cut,bytes:bytesOf(text)};
}
// 보낼 조각: 요청 본문 상한(셸 64KB) 안에 들도록 UTF-8 바이트 기준으로 글자 경계에서 자른다.
export function finTxParts(text,partBytes=FIN_TX_PART_BYTES){
  const parts=[];let cur='',n=0;
  for(const ch of text){const c=ch.codePointAt(0),b=c<0x80?1:c<0x800?2:c<0x10000?3:4;if(n+b>partBytes&&cur){parts.push(cur);cur='';n=0;}cur+=ch;n+=b;}
  if(cur||!parts.length)parts.push(cur);
  return parts;
}

// ---- 보내기: 켜져 있는 PC 앱에서만. ctx = {surface, storage, fin()=>whole.fin|null, today()=>YYYY-MM-DD, mask()=>bool, send(body)=>Promise, newId()=>16자리 hex}. 절대 던지지 않는다 ----
// 돌려주는 값: {status:'SKIPPED',reason:'SURFACE'|'OFF'|'NO_FIN'} | {status:'OK',rows,cut,bytes} | {status:'FAILED',code}.
export async function exportFinTx(ctx){
  if(ctx?.surface!=='APP_SHELL')return {status:'SKIPPED',reason:'SURFACE'};
  if(!finTxEnabled(ctx.storage))return {status:'SKIPPED',reason:'OFF'};
  try{
    const fin=ctx.fin();if(!fin)return {status:'SKIPPED',reason:'NO_FIN'};   // 기록을 아직 못 읽었으면 예전 파일을 빈 글로 덮지 않는다
    const out=buildFinTxCsv(finTxRows(fin,ctx.today(),{mask:ctx.mask?.()!==false}));
    const parts=finTxParts(out.text),upload=ctx.newId();
    if(parts.length>FIN_TX_MAX_PARTS){const e=new Error('FIN_TX_TOO_LARGE');e.code='FIN_TX_TOO_LARGE';throw e;}
    for(let i=0;i<parts.length;i++)await ctx.send({upload,index:i,count:parts.length,part:parts[i]});
    return {status:'OK',rows:out.rows,cut:out.cut,bytes:out.bytes};
  }catch(e){return {status:'FAILED',code:typeof e?.code==='string'?e.code:'fail'};}
}
// 끄면 파일을 지우지 않고 머리말만 남긴 빈 CSV로 덮어쓴다(삭제 금지). 표면만 본다(토글은 이미 꺼졌다).
export async function clearFinTx(ctx){
  if(ctx?.surface!=='APP_SHELL')return {status:'SKIPPED',reason:'SURFACE'};
  try{await ctx.send({clear:true});return {status:'OK'};}
  catch(e){return {status:'FAILED',code:typeof e?.code==='string'?e.code:'fail'};}
}
// LIFE_STATE를 쓰는 같은 때: 쌓기 성공(STACK_DONE) 직후와 앱을 연 뒤 첫 투영 뒤 1번. 표면·토글 검사는 exportFinTx 안에 있다.
export async function exportFinTxAfterStack(ctx,status){
  if(!STACK_DONE.includes(status))return {status:'SKIPPED',reason:'NOT_STACKED'};
  return exportFinTx(ctx);
}

// ---- 결과 문구(화면) ----
export const FIN_TX_TEXT=Object.freeze({
  on:'켰습니다. 가계부 거래를 넘겼습니다.',
  off:'껐습니다. 파일은 지우지 않고 머리말만 남겼습니다.',
  FIN_TX_DIR_MISSING:'사령부 상태 폴더(AURUMAR_HQ\\state)가 없어 쓰지 못했습니다. 폴더를 먼저 만들어 주세요.',
  FIN_TX_LOCKED:'잠금이 풀린 상태에서만 쓸 수 있습니다.',
  FIN_TX_TOO_LARGE:'내용이 너무 커서 쓰지 못했습니다.',
  NO_FIN:'가계부 기록을 아직 읽지 못했습니다. 다음 쌓기 때 넘깁니다.',
  fail:'쓰지 못했습니다. 다음 쌓기 때 다시 시도합니다.',
});
export function finTxResultText(r,on){
  if(r?.status==='OK')return on?FIN_TX_TEXT.on+(r.cut?' (오래된 달 일부 생략: '+r.cut+' 이전)':''):FIN_TX_TEXT.off;
  if(r?.status==='SKIPPED'&&r.reason==='NO_FIN')return FIN_TX_TEXT.NO_FIN;
  const code=r?.code;return Object.hasOwn(FIN_TX_TEXT,code??'')&&!['on','off','NO_FIN','fail'].includes(code)?FIN_TX_TEXT[code]:FIN_TX_TEXT.fail;
}

// ---- 화면: 설정 안의 작은 카드. PC 앱(APP_SHELL)이 아니면 그리지 않는다(Fold·iPad·브라우저는 파일 쓰기가 없다) ----
// h={el,add,button}, kit={toggle,sheet}, run()=>exportFinTx 결과, clear()=>clearFinTx 결과. 켤 때 한 번 안내 창(켜기/취소), 취소하거나 창을 닫으면 꺼진 채로 둔다.
export function renderFinTxExport(root,ctx){
  if(ctx.surface!=='APP_SHELL')return null;
  const {h,kit}=ctx,sec=h.add(h.el('section',null,'panel fin-tx-export'),h.el('h2','가계부 거래 넘기기','panel-title'));
  h.add(sec,h.el('p','켜 두면 "오늘 쌓기"가 끝난 직후와 앱을 연 뒤에 최근 13개월 거래(날짜·가맹점·금액·분류·정기·수단)를 사령부 상태 폴더의 FIN_TX.csv 한 파일에 덮어씁니다. 메모·카드·계좌 번호는 들어가지 않습니다. 기본은 꺼짐입니다.','muted'));
  const result=h.el('p','','muted');result.setAttribute('role','status');
  const row=h.add(h.el('div',null,'native-row'),kit.toggle(FIN_TX_LABEL+' · 이 기기 설정',finTxEnabled(ctx.storage),on=>{
    if(!on){setFinTxEnabled(false,ctx.storage);result.textContent='';void Promise.resolve(ctx.clear()).then(r=>{result.textContent=finTxResultText(r,false);});return;}
    let agreed=false;
    const yes=h.button('켜기',()=>{agreed=true;setFinTxEnabled(true,ctx.storage);dlg.close();result.textContent='';void Promise.resolve(ctx.run()).then(r=>{result.textContent=finTxResultText(r,true);});},'primary');
    const body=h.add(h.el('div',null,'fin-tx-notice'),h.el('p',FIN_TX_NOTICE),h.add(h.el('div',null,'buttons'),yes,h.button('취소',()=>dlg.close(),'secondary')));
    const dlg=kit.sheet('가계부 거래를 비서에게 넘길까요?',body);
    dlg.addEventListener('close',()=>{if(!agreed&&input)input.checked=false;});
  }));
  const input=row.querySelector?.('input')??null;
  h.add(sec,row,result);
  h.add(root,sec);
  return sec;
}
