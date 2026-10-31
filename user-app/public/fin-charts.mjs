// FIN01 시각화 계산(순수 함수, DOM 없음). 그리기는 app.mjs가 SVG(createElementNS)와 styles.css 클래스로 한다.
// 규칙: 금액 계산은 BigInt. 좌표 계산에만 Number를 쓴다(원 단위 14자리 이하라 안전).
// 이체는 소비가 아니다. 선불 전환·미배분 잔액·순액 모름은 소비 합계에 넣지 않고 따로 센다. 자료 없는 달은 0원이 아니라 "자료 없음".
import {shiftMonth,monthSpan,monthOK} from './fin-ledger.mjs';

export function prepare(fin){
  return {
    lines:fin.lines.map(l=>({...l,net:l.net===null?null:BigInt(l.net)})),
    residuals:fin.residuals.map(r=>({...r,net:BigInt(r.net)})),
    accounts:new Map(fin.accounts.map(a=>[a.id,a.data])),
    labels:fin.labels,
  };
}
export const PERIODS=Object.freeze([['THIS_MONTH','이번 달'],['LAST_3','최근 3개월'],['LAST_12','최근 12개월'],['ALL','전체'],['CUSTOM','직접 지정']]);
export function periodRange(kind,localDate,custom={}){
  const now=localDate.slice(0,7);
  if(kind==='THIS_MONTH')return {kind,from:now,to:now,label:'이번 달 · '+now};
  if(kind==='LAST_3')return {kind,from:shiftMonth(now,-2),to:now,label:'최근 3개월 · '+shiftMonth(now,-2)+' ~ '+now};
  if(kind==='LAST_12')return {kind,from:shiftMonth(now,-11),to:now,label:'최근 12개월 · '+shiftMonth(now,-11)+' ~ '+now};
  if(kind==='CUSTOM'){
    const {from,to}=custom;
    if(!monthOK(from)||!monthOK(to)||from>to)return {kind,from:null,to:null,label:'직접 지정 · 기간이 올바르지 않아 전체를 표시',error:'FIN_PERIOD_INVALID'};
    return {kind,from,to,label:'직접 지정 · '+from+' ~ '+to};
  }
  return {kind:'ALL',from:null,to:null,label:'전체 기간'};
}
export const inRange=(month,r)=>(r.from===null||month>=r.from)&&(r.to===null||month<=r.to);
const yearIn=(year,r)=>(r.from===null||year>=r.from.slice(0,4))&&(r.to===null||year<=r.to.slice(0,4));
const CONSUMPTION=new Set(['EXPENSE','REFUND']);

// ---------- 집계 (fin-projection.mjs finSummary와 같은 정의) ----------
const bucket=()=>({spend:0n,refund:0n,consumption:0n,income:0n,prepaid:0n,transfer:0n,unknownRows:0,lineCount:0,byCategory:{}});
function addLine(b,l){
  b.lineCount++;
  if(l.net===null){b.unknownRows++;return;}
  if(l.kind==='TRANSFER'){b.transfer+=l.net;return;}
  if(l.kind==='PREPAID_LOAD'){b.prepaid+=l.net;return;}
  if(l.kind==='INCOME'){b.income+=l.net;return;}
  if(l.kind==='REFUND')b.refund+=-l.net;else b.spend+=l.net;
  b.consumption+=l.net;
  const c=b.byCategory[l.category]??={total:0n,sub:{}};
  c.total+=l.net;c.sub[l.subcategory]=(c.sub[l.subcategory]??0n)+l.net;
}
export function aggregate(prep,range){
  const total=bucket(),months=new Map();
  for(const l of prep.lines){
    if(!inRange(l.month,range))continue;
    addLine(total,l);
    if(!months.has(l.month))months.set(l.month,bucket());
    addLine(months.get(l.month),l);
  }
  // 미배분 잔액은 연 단위: 기간과 겹치는 해만 더하고 월에는 나누지 않는다.
  const res=prep.residuals.filter(r=>yearIn(r.chunk.slice(9),range));
  return {total,months,residualNet:res.reduce((s,r)=>s+r.net,0n),residualYears:[...new Set(res.map(r=>r.chunk.slice(9)))].sort(),residualCount:res.length};
}
export function roundDiv(a,b){const neg=a<0n,x=neg?-a:a,q=(2n*x+b)/(2n*b);return neg?-q:q;}
// 이동평균: 창 안에 자료 없는 달(null)이 하나라도 있으면 null(0원으로 메우지 않음). 원 단위 반올림.
export function movingAverage(values,window=3){
  return values.map((_,i)=>{
    if(i<window-1)return null;
    const w=values.slice(i-window+1,i+1);
    if(w.some(v=>v===null))return null;
    return roundDiv(w.reduce((s,v)=>s+v,0n),BigInt(window));
  });
}
export function overview(prep,localDate){
  const now=localDate.slice(0,7),prev=shiftMonth(now,-1),months=monthSpan(shiftMonth(now,-11),now);
  const agg=aggregate(prep,{from:months[0],to:now}),present=new Set(dataMonths(prep,{from:months[0],to:now}));
  const known=new Map();for(const l of prep.lines)if(CONSUMPTION.has(l.kind)&&l.net!==null&&present.has(l.month))known.set(l.month,(known.get(l.month)??0)+1);
  // 그 달 소비: 지출·환불 줄이 없으면 null(자료 없음), 순액 모름 줄만 있으면 null(모름)
  const value=m=>present.has(m)&&known.get(m)?agg.months.get(m).consumption:null;
  const unknownOf=m=>prep.lines.filter(l=>l.month===m&&CONSUMPTION.has(l.kind)&&l.net===null).length;
  const cur=value(now),last=value(prev);
  return {month:now,prevMonth:prev,current:cur,previous:last,diff:cur!==null&&last!==null?cur-last:null,currentUnknown:unknownOf(now),
    currentState:!present.has(now)?'NO_DATA':known.get(now)?'KNOWN':'UNKNOWN_ONLY',
    trend:months.map(m=>({month:m,hasData:present.has(m),consumption:value(m),unknownOnly:present.has(m)&&!known.get(m)}))};
}
// ---------- 눈금 ----------
export function niceTicks(max,count=4){
  let m=typeof max==='bigint'?max:BigInt(max);if(m<=0n)m=1n;
  const raw=(m+BigInt(count)-1n)/BigInt(count);
  let p=1n;while(p*10n<=raw)p*=10n;
  const step=[1n,2n,5n,10n].map(k=>k*p).find(s=>s>=raw);
  const top=((m+step-1n)/step)*step,out=[];
  for(let v=0n;v<=top;v+=step)out.push(v);
  return out;
}
const r1=v=>Math.round(v*10)/10;

// ---------- 월별 누적 막대 + 3개월 이동평균 ----------
// 소비 그래프의 "자료 있는 달": 지출·환불 줄(순액 모름 포함)이 있는 달. 이체·선불·수입만 있는 달은 소비 자료 없음이다(0원이 아님).
export function dataMonths(prep,range){
  return [...new Set(prep.lines.filter(l=>inRange(l.month,range)&&CONSUMPTION.has(l.kind)).map(l=>l.month))].sort();
}
export function monthlySeries(prep,range,{maxCategories=6,localDate=null}={}){
  const present=dataMonths(prep,range);
  const from=range.from??present[0]??null,to=range.to??(present.length?(localDate&&localDate.slice(0,7)>present.at(-1)?localDate.slice(0,7):present.at(-1)):null);
  const months=from&&to?monthSpan(from,to):[];
  const agg=aggregate(prep,{from,to}),consumed=new Set(present),known=new Set(prep.lines.filter(l=>CONSUMPTION.has(l.kind)&&l.net!==null).map(l=>l.month));
  const catTotal=new Map();
  for(const b of agg.months.values())for(const [c,v] of Object.entries(b.byCategory))catTotal.set(c,(catTotal.get(c)??0n)+v.total);
  const ranked=[...catTotal.entries()].filter(([,v])=>v>0n).sort((a,b)=>b[1]>a[1]?1:b[1]<a[1]?-1:a[0].localeCompare(b[0])).map(([c])=>c);
  // 순액이 0 이하인 분류가 있거나 분류가 많으면 "그 외 분류" 열로 모은다 → 열의 합 = 소비가 항상 맞는다.
  const head=ranked.length>maxCategories?ranked.slice(0,maxCategories-1):ranked;
  const cats=catTotal.size>head.length?[...head,'REST']:head;
  const rows=months.map(m=>{
    const b=agg.months.get(m);
    if(!consumed.has(m)||!b)return {month:m,hasData:false,total:null,parts:[],unknownRows:0};
    const parts=cats.map(c=>({cat:c,value:c==='REST'?Object.entries(b.byCategory).filter(([k])=>!head.includes(k)).reduce((s,[,v])=>s+v.total,0n):b.byCategory[c]?.total??0n}));
    if(!known.has(m))return {month:m,hasData:true,unknownOnly:true,total:null,parts:[],unknownRows:b.unknownRows};   // 순액 모름 줄만 있는 달: 모름(0원 아님)
    return {month:m,hasData:true,total:b.consumption,parts,unknownRows:b.unknownRows};
  });
  const ma=movingAverage(rows.map(r=>r.total),3);
  rows.forEach((r,i)=>{r.ma=ma[i];});
  return {rows,cats};
}
export function barLayout(series,{width,height,padL=52,padR=10,padT=12,padB=26,labelEvery=null}={}){
  const rows=series.rows,plotW=Math.max(10,width-padL-padR),plotH=Math.max(10,height-padT-padB);
  let max=0n;
  for(const r of rows){const pos=r.parts.reduce((s,p)=>s+(p.value>0n?p.value:0n),0n);for(const v of [pos,r.total,r.ma])if(v!==null&&v>max)max=v;}
  const ticks=niceTicks(max,4),top=Number(ticks.at(-1)),y=v=>padT+plotH-Number(v)/top*plotH;
  const n=Math.max(1,rows.length),slot=plotW/n,barW=Math.max(2,Math.min(42,slot*0.7));
  const rects=[],gaps=[],labels=[],segments=[];let seg=[];
  const every=labelEvery??Math.max(1,Math.ceil(n*44/plotW));
  rows.forEach((r,i)=>{
    const cx=padL+slot*i+slot/2;
    if(i%every===0||i===n-1&&n<=every)labels.push({x:r1(cx),text:r.month.slice(2)});
    if(!r.hasData||r.unknownOnly){gaps.push({x:r1(cx-barW/2),y:padT,w:r1(barW),h:plotH,month:r.month,unknownOnly:!!r.unknownOnly});if(seg.length)segments.push(seg);seg=[];return;}
    let acc=0n;
    for(const p of r.parts){if(p.value<=0n)continue;const y0=y(acc),y1=y(acc+p.value);rects.push({x:r1(cx-barW/2),y:r1(y1),w:r1(barW),h:Math.max(0.5,r1(y0-y1)),cat:p.cat,value:p.value,month:r.month});acc+=p.value;}
    if(r.ma!==null)seg.push({x:r1(cx),y:r1(y(r.ma>0n?r.ma:0n)),value:r.ma,month:r.month});else{if(seg.length)segments.push(seg);seg=[];}
  });
  if(seg.length)segments.push(seg);
  return {width,height,padL,padT,plotW,plotH,rects,gaps,labels,segments,ticks:ticks.map(v=>({value:v,y:r1(y(v))}))};
}

// ---------- 돈의 흐름 (Sankey) ----------
const SEP='\u0000';
const add=(m,k,v)=>m.set(k,(m.get(k)??0n)+v);
const byValue=(a,b)=>b[1]>a[1]?1:b[1]<a[1]?-1:String(a[0]).localeCompare(String(b[0]));
// 연결 값: 계정→분류는 (계정, 분류)별 순액이 양수인 것만 그린다(환불이 더 큰 연결은 excluded로 돌려주고 표에 보인다).
// 분류→세부 분류는 그려진 (계정, 분류) 연결에 속한 줄로만 다시 나누므로, 분류 노드의 들어온 값 = 나간 값이 항상 같다.
export function sankeyData(prep,range,{maxCategories=8,maxSubs=3,withSubs=true}={}){
  const acc=new Map(),inc=new Map(),excluded=[],byPair=new Map();
  for(const l of prep.lines){
    if(!inRange(l.month,range)||l.net===null)continue;
    if(CONSUMPTION.has(l.kind)){const k=l.accountId+SEP+l.category;add(acc,k,l.net);if(!byPair.has(k))byPair.set(k,[]);byPair.get(k).push(l);}
    else if(l.kind==='INCOME')add(inc,l.category+SEP+l.accountId,l.net);
  }
  const acctLabel=id=>prep.accounts.get(id)?.name??id;
  const catLabel=c=>c==='REST'?'그 외 분류':prep.labels.expense[c]??c;
  const kept=[];
  for(const [k,v] of [...acc.entries()].sort(byValue)){const [a,c]=k.split(SEP);if(v>0n)kept.push({a,c,v,k});else excluded.push({from:acctLabel(a),to:catLabel(c),value:v});}
  const catFlow=new Map();for(const f of kept)add(catFlow,f.c,f.v);
  const ranked=[...catFlow.entries()].sort(byValue).map(([c])=>c);
  const grouping=ranked.length>maxCategories,keep=new Set(grouping?ranked.slice(0,maxCategories-1):ranked);
  const catNode=c=>keep.has(c)?'C:'+c:'C:REST';
  const nodes=new Map(),links=new Map();
  const node=(id,label,col,kind,cat=null)=>{if(!nodes.has(id))nodes.set(id,{id,label,col,kind,cat});return id;};
  const link=(s,t,v)=>add(links,JSON.stringify([s,t]),v);
  const hasIncome=[...inc.values()].some(v=>v>0n);
  const base=hasIncome?1:0;
  for(const [k,v] of [...inc.entries()].sort(byValue)){
    const [c,a]=k.split(SEP);
    if(v<=0n){excluded.push({from:prep.labels.income[c]??c,to:acctLabel(a),value:v});continue;}
    link(node('I:'+c,prep.labels.income[c]??c,0,'income'),node('A:'+a,acctLabel(a),base,'account'),v);
  }
  for(const f of kept){const cn=catNode(f.c);link(node('A:'+f.a,acctLabel(f.a),base,'account'),node(cn,catLabel(cn.slice(2)),base+1,'category',cn.slice(2)),f.v);}
  if(withSubs){
    // 세부 분류: 큰 것부터 maxSubs개까지, 나머지(음수 포함)는 "그 외"로 합친다. "그 외"가 0 이하가 되면 가장 작은 칸을 계속 합쳐 양수로 만든다.
    // "그 외 분류" 묶음은 원래 분류 이름을 세부 칸 이름으로 쓴다.
    const perCat=new Map();
    for(const f of kept){const cn=catNode(f.c);if(!perCat.has(cn))perCat.set(cn,new Map());for(const l of byPair.get(f.k))add(perCat.get(cn),cn==='C:REST'?catLabel(f.c):(l.subcategory||'세부 없음'),l.net);}
    for(const [cn,m] of perCat){
      const all=[...m.entries()].sort(byValue);
      let head=all.filter(([,v])=>v>0n).slice(0,all.length>maxSubs?maxSubs-1:maxSubs);
      const restOf=h=>all.filter(e=>!h.includes(e));
      while(head.length&&restOf(head).length&&restOf(head).reduce((t,[,v])=>t+v,0n)<=0n)head=head.slice(0,-1);
      const tail=restOf(head),tailSum=tail.reduce((t,[,v])=>t+v,0n);
      for(const [sub,v] of head)link(cn,node('S:'+cn+SEP+sub,sub,base+2,'sub',nodes.get(cn).cat),v);
      if(tail.length&&tailSum>0n)link(cn,node('S:'+cn+SEP+'그 외',head.length?'그 외 '+tail.length+'개':'세부 '+tail.length+'개 합계',base+2,'sub',nodes.get(cn).cat),tailSum);
    }
  }
  const linkList=[...links.entries()].map(([k,v])=>{const [source,target]=JSON.parse(k);return {source,target,value:v};});
  const total=linkList.filter(l=>nodes.get(l.source).kind==='account').reduce((s,l)=>s+l.value,0n);
  return {nodes:[...nodes.values()],links:linkList,excluded,total,hasIncome};
}
export function sankeyLayout(data,{width,height,nodeWidth=10,gap=10}={}){
  const vin=new Map(),vout=new Map();
  for(const l of data.links){add(vout,l.source,l.value);add(vin,l.target,l.value);}
  const val=n=>{const a=vin.get(n.id)??0n,b=vout.get(n.id)??0n;return a>b?a:b;};
  const cols=[...new Set(data.nodes.map(n=>n.col))].sort((a,b)=>a-b),k=cols.length;
  const byCol=cols.map(c=>data.nodes.filter(n=>n.col===c).map(n=>({...n,value:val(n)})));
  // 각 열 정렬: 값 큰 순. 소분류 열은 부모 분류 순서를 따른다.
  for(let i=0;i<byCol.length;i++){
    if(byCol[i][0]?.kind==='sub'){
      const parentOrder=new Map((byCol[i-1]??[]).map((n,j)=>[n.id,j]));
      const parent=id=>data.links.find(l=>l.target===id)?.source;
      byCol[i].sort((a,b)=>(parentOrder.get(parent(a.id))??0)-(parentOrder.get(parent(b.id))??0)||(b.value>a.value?1:b.value<a.value?-1:0));
    }else byCol[i].sort((a,b)=>b.value>a.value?1:b.value<a.value?-1:a.label.localeCompare(b.label));
  }
  const sums=byCol.map(c=>c.reduce((s,n)=>s+Number(n.value),0));
  const scale=Math.min(...byCol.map((c,i)=>sums[i]?(height-gap*(c.length-1))/sums[i]:Infinity));
  const s=Number.isFinite(scale)&&scale>0?scale:0;
  const pos=new Map();
  byCol.forEach((c,i)=>{
    const x=k>1?i/(k-1)*(width-nodeWidth):0,used=sums[i]*s+gap*(c.length-1);let y=(height-used)/2;
    for(const n of c){const h=Math.max(1,Number(n.value)*s);pos.set(n.id,{...n,valueIn:vin.get(n.id)??0n,valueOut:vout.get(n.id)??0n,x:r1(x),y:r1(y),w:nodeWidth,h:r1(h),colIndex:i,last:i===k-1});y+=Number(n.value)*s+gap;}
  });
  const outOff=new Map(),inOff=new Map();
  // 출발 y → 도착 y 순서로 쌓으면 노드마다 나가는 띠는 도착 순서, 들어오는 띠는 출발 순서로 겹치지 않게 놓인다.
  const ordered=[...data.links].sort((a,b)=>pos.get(a.source).y-pos.get(b.source).y||pos.get(a.target).y-pos.get(b.target).y);
  const links=[];
  for(const l of ordered){
    const a=pos.get(l.source),b=pos.get(l.target),t=Math.max(0.5,Number(l.value)*s);
    const o1=outOff.get(l.source)??0,o2=inOff.get(l.target)??0;outOff.set(l.source,o1+Number(l.value)*s);inOff.set(l.target,o2+Number(l.value)*s);
    const x0=a.x+a.w,x1=b.x,y0=a.y+o1+t/2,y1=b.y+o2+t/2,xm=(x0+x1)/2;
    links.push({...l,t:r1(t),d:'M'+r1(x0)+' '+r1(y0)+'C'+r1(xm)+' '+r1(y0)+' '+r1(xm)+' '+r1(y1)+' '+r1(x1)+' '+r1(y1),cat:a.cat??b.cat,kind:a.kind});
  }
  return {width,height,nodes:[...pos.values()],links};
}

// ---------- 분류 트리맵 ----------
// path=[] 대분류, [cat] 소분류, [cat,sub] 가맹점. 순액이 0 이하인 칸은 그리지 않고 excluded로 돌려준다.
export function treemapItems(prep,range,path=[],{maxItems=24}={}){
  const m=new Map();
  for(const l of prep.lines){
    if(!inRange(l.month,range)||l.net===null||!CONSUMPTION.has(l.kind))continue;
    if(path.length>=1&&l.category!==path[0])continue;
    if(path.length>=2&&(l.subcategory||'세부 없음')!==path[1])continue;
    const key=path.length===0?l.category:path.length===1?(l.subcategory||'세부 없음'):(l.merchant||'가맹점 없음');
    if(!m.has(key))m.set(key,{key,value:0n,count:0,sensitive:false,sample:l});
    const e=m.get(key);e.value+=l.net;e.count++;
  }
  const label=k=>path.length===0?prep.labels.expense[k]??k:k;
  const all=[...m.values()].map(e=>({...e,label:label(e.key)}));
  const excluded=all.filter(e=>e.value<=0n),pos=all.filter(e=>e.value>0n).sort((a,b)=>b.value>a.value?1:b.value<a.value?-1:a.label.localeCompare(b.label));
  const items=pos.length>maxItems?[...pos.slice(0,maxItems-1),{key:null,label:'그 외 '+(pos.length-maxItems+1)+'개',value:pos.slice(maxItems-1).reduce((s,e)=>s+e.value,0n),count:pos.slice(maxItems-1).reduce((s,e)=>s+e.count,0),rest:true}]:pos;
  return {items,excluded,total:pos.reduce((s,e)=>s+e.value,0n),drillable:path.length<2};
}
function worst(row,side){
  let s=0,mx=0,mn=Infinity;for(const n of row){s+=n.area;if(n.area>mx)mx=n.area;if(n.area<mn)mn=n.area;}
  return Math.max(side*side*mx/(s*s),(s*s)/(side*side*mn));
}
function layoutRow(row,rect,out){
  const s=row.reduce((a,n)=>a+n.area,0);
  if(rect.w>=rect.h){const cw=s/rect.h;let yy=rect.y;for(const n of row){const hh=n.area/cw;out.push({...n.item,x:r1(rect.x),y:r1(yy),w:r1(cw),h:r1(hh)});yy+=hh;}return {x:rect.x+cw,y:rect.y,w:rect.w-cw,h:rect.h};}
  const rh=s/rect.w;let xx=rect.x;for(const n of row){const ww=n.area/rh;out.push({...n.item,x:r1(xx),y:r1(rect.y),w:r1(ww),h:r1(rh)});xx+=ww;}
  return {x:rect.x,y:rect.y+rh,w:rect.w,h:rect.h-rh};
}
export function squarify(items,x,y,w,h){
  const total=items.reduce((s,i)=>s+Number(i.value),0);if(!(total>0)||w<=0||h<=0)return [];
  const scale=w*h/total,nodes=items.filter(i=>Number(i.value)>0).map(i=>({item:i,area:Number(i.value)*scale})),out=[];
  let rect={x,y,w,h},row=[],i=0;
  while(i<nodes.length){
    const side=Math.min(rect.w,rect.h),n=nodes[i];
    if(!row.length||worst([...row,n],side)<=worst(row,side)){row.push(n);i++;}
    else{rect=layoutRow(row,rect,out);row=[];}
  }
  if(row.length)layoutRow(row,rect,out);
  return out;
}

// ---------- 달력 히트맵 ----------
export function dailyTotals(prep,range){
  const days=new Map();
  for(const l of prep.lines){
    if(!inRange(l.month,range)||!CONSUMPTION.has(l.kind))continue;
    const d=days.get(l.date)??{net:0n,count:0,unknown:0};
    if(l.net===null)d.unknown++;else{d.net+=l.net;d.count++;}
    days.set(l.date,d);
  }
  return days;
}
// 구간: 소비가 있는 날(양수)의 25·50·75·90 백분위(가까운 순위). 단계 1~4, 0=소비 없음, -1=환불이 더 큰 날, -2=순액 모름 줄만 있는 날(heatmapMonths).
export function heatThresholds(values){
  const v=values.filter(x=>x>0n).sort((a,b)=>a<b?-1:a>b?1:0);
  if(!v.length)return [];
  const at=p=>v[Math.min(v.length-1,Math.max(0,Math.ceil(p*v.length)-1))];
  return [at(0.25),at(0.5),at(0.75),at(0.9)];
}
export function heatLevel(value,th){
  if(value===null||value===undefined||value===0n)return 0;
  if(value<0n)return -1;
  if(!th.length)return 1;
  if(value>=th[3])return 4;if(value>=th[2])return 3;if(value>=th[1])return 2;return 1;
}
export function heatmapMonths(prep,range,localDate,{maxMonths=12,focusCount=3}={}){
  const present=new Set(dataMonths(prep,range)),sorted=[...present].sort();
  const from=range.from??sorted[0]??null,to=range.to??(sorted.length?(localDate.slice(0,7)>sorted.at(-1)?localDate.slice(0,7):sorted.at(-1)):null);
  let months=from&&to?monthSpan(from,to):[];
  const cut=months.length>maxMonths;if(cut)months=months.slice(-maxMonths);
  const days=dailyTotals(prep,{from:months[0]??null,to:months.at(-1)??null});
  const th=heatThresholds([...days.values()].map(d=>d.net));
  const focus=new Set([...days.entries()].filter(([,d])=>d.net>0n).sort((a,b)=>b[1].net>a[1].net?1:b[1].net<a[1].net?-1:a[0].localeCompare(b[0])).slice(0,focusCount).map(([k])=>k));
  const out=months.map(m=>{
    const first=new Date(m+'-01T12:00:00Z'),offset=(first.getUTCDay()+6)%7,n=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    const cells=[];
    for(let d=1;d<=n;d++){
      const date=m+'-'+String(d).padStart(2,'0'),t=days.get(date);
      const unknownOnly=!!t&&t.count===0&&t.unknown>0;   // 순액 모름 줄만 있는 날: 모름(-2), 소비 없음(0)과 구분
      cells.push({date,day:d,weekday:(offset+d-1)%7,week:Math.floor((offset+d-1)/7),net:t&&!unknownOnly?t.net:null,count:t?.count??0,unknown:t?.unknown??0,level:!present.has(m)?null:unknownOnly?-2:heatLevel(t?t.net:0n,th),focus:focus.has(date),future:date>localDate});
    }
    return {month:m,hasData:present.has(m),offset,cells,weeks:Math.ceil((offset+n)/7)};
  });
  return {months:out,thresholds:th,focus:[...focus].sort(),truncated:cut};
}

// ---------- 자료 완전성 지도 ----------
// 계정마다 해×12달 칸: 그 달에 줄이 있으면 rows>0, 없으면 0(자료 없음 · 0원이 아님). 미배분 잔액이 있는 해는 따로 표시.
export function completeness(prep,range,localDate){
  const lineMonths=[...new Set(prep.lines.map(l=>l.month))].sort();
  const from=range.from??lineMonths[0]??null,to=range.to??(lineMonths.length?(localDate.slice(0,7)>lineMonths.at(-1)?localDate.slice(0,7):lineMonths.at(-1)):null);
  const months=from&&to?monthSpan(from,to):[];
  const counts=new Map();
  for(const l of prep.lines)if(inRange(l.month,{from,to}))counts.set(l.month+'|'+l.accountId,(counts.get(l.month+'|'+l.accountId)??0)+1);
  const years=[...new Set(months.map(m=>m.slice(0,4)))];
  const resYears=new Map();
  for(const r of prep.residuals){if(!resYears.has(r.accountId))resYears.set(r.accountId,new Set());resYears.get(r.accountId).add(r.chunk.slice(9));}
  const accounts=[...prep.accounts.entries()].sort((a,b)=>a[1].type.localeCompare(b[1].type)||a[1].name.localeCompare(b[1].name));
  const rows=accounts.map(([id,a])=>{
    let have=0,missing=0;
    const ys=years.map(y=>({year:y,residual:resYears.get(id)?.has(y)??false,cells:Array.from({length:12},(_,i)=>{
      const m=y+'-'+String(i+1).padStart(2,'0'),inside=months.includes(m),n=counts.get(m+'|'+id)??0;
      if(inside){if(n)have++;else missing++;}
      return {month:m,inside,rows:n};
    })}));
    return {id,name:a.name,type:a.type,active:a.active,years:ys,have,missing};
  });
  return {from,to,months,years,rows};
}
