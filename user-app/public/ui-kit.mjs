// B40 재설계 기반: AURUMAR Gold 토큰의 JS 사본과 재사용 위젯. 색은 styles.css의 :root가 정본이고 이 값과 같아야 한다(시험 b40-ui-foundation).
// DOM 헬퍼는 app.mjs에 한 곳만 둔다. 인라인 style 없음(CSP): 진행은 <progress>, 링은 SVG 속성으로 그린다.
// B41부터 life-ui·app.mjs가 쓴다. life-plan·life-tower는 이 파일을 app.mjs와 함께 불러오지 않으려고(시험에서 따로 불러올 수 있게) import하지 않고 ctx.kit로 받는다.
import {el,add,button} from './app.mjs';

export const PALETTE=Object.freeze({bg:'#FBF7EE',gold1:'#F3E3B5',gold2:'#C9A227',gold3:'#8A6914',ink1:'#2A2113',ink2:'#4A3D27',ink3:'#6B5B40',ink4:'#A2957F'});
export const SUBJECT_COLORS=Object.freeze({kor:'#8E6BC4',math:'#A6714E',eng:'#D9534F',hist:'#5BA66B',soc:'#D4B33C',sci:'#4F86C6',bio:'#3FA7A0'});
export const AREA_COLORS=Object.freeze({body:'#5BA66B',head:'#4F86C6',money:'#C9A227',heart:'#C4709A'});

// DS1 (설계 V5 §2.1): 버튼 종류는 셋뿐. primary = 금속 채움(--gold-metal, 한 화면 1개) / secondary = 금 테두리 / text = 글자만. 모양은 styles.css 3절.
// 크기 표지(공부 화면): lb-btn-start 집중 시작 60px 전체 너비 · lb-btn-finish 끝내고 담기 64px(좁은 화면 56px) · lb-btn-pair 휴식(끝내고 담기와 같은 높이).
export const BUTTON_KINDS=Object.freeze({primary:'primary',secondary:'secondary',text:'lb-btn-text'});
export const BUTTON_SIZES=Object.freeze({start:'lb-btn-start',finish:'lb-btn-finish',pair:'lb-btn-pair'});

const SVG='http://www.w3.org/2000/svg';
const svg=(tag,attrs)=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const ratio=(value,max)=>{const v=Number(value),m=Number(max);return Number.isFinite(v)&&Number.isFinite(m)&&m>0?Math.min(1,Math.max(0,v/m)):0;};

// color = 과목(kor…bio) 또는 영역(body…heart) 키. 그 밖의 값은 무시하고 기본 금색을 쓴다(임의 색은 CSP상 인라인으로 못 넣는다).
export function chip(label,{selected=false,color=null,onClick=()=>{}}={}){
 const known=Object.hasOwn(SUBJECT_COLORS,color??'')||Object.hasOwn(AREA_COLORS,color??'');
 const n=button(label,onClick,'lb-chip'+(known?' lb-chip-'+color:'')+(selected?' selected':''));
 n.setAttribute('aria-pressed',String(Boolean(selected)));return n;
}
export function toggle(label,checked,onChange=()=>{}){
 const input=el('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=Boolean(checked);input.setAttribute('aria-label',label);
 input.addEventListener('change',()=>onChange(input.checked));
 return add(el('label',null,'lb-toggle'),input,el('span',null,'lb-toggle-track'),el('span',label,'lb-toggle-label'));
}
// 머리글 없는 진행 막대 하나. xpBar와, 같은 막대를 직접 만들던 주간 퀘스트·영역 레벨 줄(life-plan·life-tower는 ctx.kit로 받는다)이 같이 쓴다.
export function bar(value,max,ariaLabel){
 const n=el('progress',null,'lb-xp-bar');n.max=Number(max)>0?Number(max):1;n.value=ratio(value,max)*n.max;n.setAttribute('aria-label',ariaLabel);return n;
}
export function xpBar(value,max,{label=''}={}){
 return add(el('div',null,'lb-xp'),add(el('div',null,'lb-xp-head'),el('span',label),el('strong',value+' / '+max)),bar(value,max,(label||'진행')+' '+value+' / '+max));
}
export function ring(value,max,{size=64}={}){
 const stroke=Math.max(4,Math.round(size/10)),r=(size-stroke)/2,c=2*Math.PI*r,mid=size/2,part=ratio(value,max);
 const n=svg('svg',{class:'lb-ring',width:size,height:size,viewBox:'0 0 '+size+' '+size,role:'img','aria-label':value+' / '+max});
 const label=svg('text',{class:'lb-ring-text',x:mid,y:mid});label.textContent=Math.round(part*100)+'%';
 n.append(svg('circle',{class:'lb-ring-track',cx:mid,cy:mid,r,'stroke-width':stroke}),svg('circle',{class:'lb-ring-fill',cx:mid,cy:mid,r,'stroke-width':stroke,'stroke-dasharray':(c*part)+' '+c,transform:'rotate(-90 '+mid+' '+mid+')'}),label);
 return n;
}
export function metricBig(label,value,sub){
 return add(el('article',null,'lb-card lb-metric'),el('div',label,'lb-metric-label'),el('div',value,'lb-metric-value'),sub?el('div',sub,'lb-metric-sub'):null);
}
// 바텀시트: 만들어 띄우고, 닫히면 DOM에서 뺀다. content는 노드 하나.
export function sheet(title,content){
 const n=el('dialog',null,'lb-sheet');n.setAttribute('aria-label',title);
 const close=button('닫기',()=>n.close(),'secondary');
 add(n,el('span',null,'lb-sheet-grip'),add(el('div',null,'lb-sheet-head'),el('h2',title),close),content);
 n.addEventListener('close',()=>n.remove());
 document.body.append(n);n.showModal?.();return n;
}
