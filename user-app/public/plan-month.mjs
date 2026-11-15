// P1C: 계획 탭 '월' 보기 = 과목 × 주차 표 + 일정(시험·EVENT) 줄. 앱이 ctx.planMonth로 넘겨 주면 life-plan의 월 보기가 이것을 그린다(못 받으면 옛 날짜 달력 그대로).
// 설계: AUTOPILOT\design\P1D_PLAN_CALENDAR_DESIGN.md 2.1·2.4·5(P1C). 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style·외부 라이브러리 없음), 색은 styles.css 토큰.
// 칸 색 = 그 주 그 과목의 실제 벽돌, 칸 테두리 = 계획이 있던 칸.
// V8W3-2 (소유자 2026-11-14 "11월 1일이 한 주에 하루만 놓인다"): 주 칸 = 월요일 시작 7일 전부(10/26~11/1). 주 이름은 7일 중 4일 이상 든 달 기준("10월 5주"·"11월 1주", life-plan weekName).
// 다른 달 날짜는 머리 날짜 범위에서 조금 연하게(pm-other), 다른 달 이름의 주 칸은 바탕만 조금 연하게(other) — 칸 숫자(기록)는 그대로 읽힌다.
// 줄 끝 "이 달" 칸·머리 한 줄(목표 대비)은 예전처럼 이 달에 든 날만 센다(주 칸 합과 다를 수 있어 머리 이름을 "이 달"로 적는다). 아래 "주 합" 줄 = 그 주 7일 전부.
// 보기만 한다: 쓰기 0(일정 추가·고치기는 앱의 일정 시트, 계획 넣기는 주 보기). "목표 달성 주" 한 줄(FIX46C)은 앱이 ctx.monthGoals로 넘겨 주면 머리 아래에 붙는다(과목 주간 목표 계산은 life-quest). 새 기록 종류·필드 0.
// V10D-1 (소유자 2026-11-15 "월간 계획을 달력 형식으로"): 월 보기의 기본 = 계획 달력. 위에 월~일, 왼쪽에 주 이름("11월 1주", weekName 그대로)이 아래로. 칸 = 작은 날짜 + 그날 계획 최대 3줄(과목 색 띠 + 계획 이름 말줄임) + "+n".
// 지난 날 빗금, 오늘 금 테두리. 과목 표는 "과목으로 보기"(st.monthTable), 옛 날짜 달력은 "날짜로 보기"(st.monthDates, 앱의 '달력' 경로)로 그대로 남는다. 보기만 한다(쓰기 0, 계획 넣기는 그날 시트·주 보기).
import {shiftDay} from './life-model.mjs';
import {actualOf,planOf,mondayOf,daysInMonth,heatLevel,heatLegend,barsText,scheduleBox,maker,NO_SUBJECT_COLOR,planItemsDone,itemsDoneText,goalVsText,weekName,sortedItems,dateLabel} from './life-plan.mjs';

export const MONTH_SCHEDULE_SHOW=12;
const short=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
const num=v=>Number.isInteger(v)?String(v):v.toFixed(1);
const examName=x=>x.name.replace(/\(.*\)/,'');

// ---------- 계산(시계·저장소·DOM 없음) ----------
// 이 달에 걸친 월요일 시작 주들. from~to = 그 주에서 이 달에 든 날, edge = 전달·다음 달에 걸친 주.
// V8W3-2: end = 그 주 일요일(칸 값은 monday~end 7일), name = 주 이름("10월 5주"), other = 주 이름의 달이 이 달이 아님.
export function monthColumns(ym){
  const first=ym+'-01',last=ym+'-'+String(daysInMonth(ym)).padStart(2,'0'),out=[];
  for(let m=mondayOf(first);m<=last;m=shiftDay(m,7)){
    const end=shiftDay(m,6),from=m<first?first:m,to=end>last?last:end,wn=weekName(m);
    out.push({index:out.length+1,monday:m,end,from,to,edge:from!==m||to!==end,name:wn.text,other:wn.ym!==ym});
  }
  return out;
}
// subjects = 과목 id → 정의(숨긴 과목 포함). 줄 = 보이는 과목 전부 + 이 달에 기록·계획이 있는 숨긴 과목·모르는 과목(기타).
// items = 이 달 계획 줄 수·달성 수(life-plan monthView가 기기 화면 설정까지 넣어 계산해 넘긴다). 없으면 기록만으로 센다.
export function monthModel({life=null,study=null,ach,subjects,ym,today,items=null}){
  const weeks=new Map(ach.weeks.map(w=>[w.monday,w])),cols=monthColumns(ym).map(c=>({...c,actual:0,planned:0,now:c.monday<=today&&today<=c.end})),rows=new Map();
  const rowOf=id=>{
    if(!rows.has(id)){const s=subjects.get(id)??null;rows.set(id,{subjectId:id,name:s?.name??'기타',color:s?.color??NO_SUBJECT_COLOR,cells:cols.map(()=>({actual:0,planned:0})),actual:0,planned:0});}
    return rows.get(id);
  };
  for(const s of subjects.values())if(!s.hidden)rowOf(s.id);
  // V8W3-2: 칸·주 합 = 그 주 7일 전부, 줄 합(r.actual·r.planned)과 달 합 = 이 달에 든 날만.
  cols.forEach((c,i)=>{
    for(let d=c.monday;d<=c.end;d=shiftDay(d,1)){
      const mine=d>=c.from&&d<=c.to;
      for(const [id,s] of actualOf(weeks,d).bySubject){const r=rowOf(id);r.cells[i].actual+=s.value;c.actual+=s.value;if(mine)r.actual+=s.value;}
      for(const x of planOf(life,d)?.items??[]){const r=rowOf(x.subjectId);r.cells[i].planned+=x.bricks;c.planned+=x.bricks;if(mine)r.planned+=x.bricks;}
    }
  });
  const list=[...rows.values()],first=cols[0].from,last=cols[cols.length-1].to;
  // V6A: 목표 대비 = 하루 목표 × 이 달 날수, 계획 줄 n개 중 m개 달성(오늘까지, 자동 연결 규칙 = 오늘 카드와 같음)
  return {ym,first,last,cols,rows:list,actual:list.reduce((n,r)=>n+r.actual,0),planned:list.reduce((n,r)=>n+r.planned,0),goal:ach.goalBricks,days:daysInMonth(ym),items:items??planItemsDone(life,study,first,last,today)};
}
export function monthHeadText(m){
  const parts=[],items=m.items??{total:0,done:0,later:0};
  if(m.actual>0||items.total+items.later>0)parts.push(goalVsText(m.actual,m.goal,m.days));
  if(items.total>0)parts.push(itemsDoneText(items));
  if(items.later>0)parts.push('남은 계획 '+items.later+'개');
  return parts.length?parts.join(' · '):null;
}
// 합 칸 글자: 계획이 있으면 "실제 / 계획"(실제 0도 뜻이 있어 적는다), 실제만 있으면 실제, 둘 다 없으면 비움.
export const totalText=(actual,planned)=>planned>0?num(actual)+' / '+num(planned):actual>0?num(actual):null;
// 그 주 칸의 시험 이름과 일정 수. 일정은 앱이 읽어 준 달 보기(ctx.planCal.events), 시험은 정의에서.
export function weekSchedule(col,exams,events){
  const inCol=x=>x.date>=col.from&&x.date<=col.to;
  return {exams:(exams?.items??[]).filter(inCol).map(examName),events:(events??[]).filter(inCol).length};
}
// V8W3-2: 주 머리 날짜 = 7일 범위 [다른 달 부분, 이 달 부분] 조각. 같은 달 주는 "2~8", 걸친 주는 "10/26~11/1"(다른 달 날짜 쪽 조각만 pm-other로 연하게).
export function weekRangeParts(c){
  if(!c.edge)return [{text:Number(c.monday.slice(8))+'~'+Number(c.end.slice(8)),other:false}];
  if(c.from!==c.monday)return [{text:short(c.monday)+'~',other:true},{text:short(c.to),other:false}];
  return [{text:short(c.from)+'~',other:false},{text:short(c.end),other:true}];
}
// V10D-1: 계획 달력 계산. 줄 = 이 달에 걸친 월요일 시작 주(monthColumns와 같은 주, 7칸 모두 날짜). 칸 계획 줄 = 시간대 순서(오전→오후→저녁, sortedItems)로 앞 PLAN_CAL_LINES줄 + 나머지 수(more).
// 시험은 이름(괄호 뺌), 일정은 앱이 읽어 준 이 달 일정(events) 수. 다른 달 날짜(other)도 계획 줄이 보인다(V8W3 "기록은 읽힌다").
export const PLAN_CAL_LINES=3;
export function planCalModel({life=null,exams=null,events=null,ym,today}){
  const exam=new Map(),evs=new Map();
  for(const x of exams?.items??[])exam.set(x.date,[...(exam.get(x.date)??[]),examName(x)]);
  for(const e of events??[])evs.set(e.date,(evs.get(e.date)??0)+1);
  const rows=monthColumns(ym).map(c=>{
    const days=[];
    for(let i=0;i<7;i++){
      const date=shiftDay(c.monday,i),items=sortedItems(planOf(life,date)?.items??[]);
      days.push({date,day:Number(date.slice(8,10)),dow:i,other:date.slice(0,7)!==ym,past:date<today,today:date===today,
        lines:items.slice(0,PLAN_CAL_LINES).map(x=>({id:x.id,subjectId:x.subjectId,title:x.title})),total:items.length,more:Math.max(0,items.length-PLAN_CAL_LINES),exams:exam.get(date)??[],events:evs.get(date)??0});
    }
    return {monday:c.monday,end:c.end,name:c.name,other:c.other,now:c.monday<=today&&today<=c.end,past:c.end<today,days};
  });
  return {ym,rows,plans:rows.reduce((n,r)=>n+r.days.reduce((k,d)=>k+(d.other?0:d.total),0),0)};
}

// ---------- 화면 ----------
// V10D-1: 계획 달력 노드. 왼쪽 위 빈칸 + 월~일 머리, 줄마다 주 이름 단추(누르면 그 주 보기) + 7칸(누르면 openDay(날짜) = 그날 시트, 없으면 그 주 보기).
// 과목 색 띠 = 칸 안 SVG rect의 fill 속성(인라인 style 없음, plan-week와 같은 방식). 크기·말줄임·빗금·금 테두리는 styles.css V10D 절.
export function planCalNode(h,{model,subjects,goWeek,openDay=null}){
  const {el,add,button,svg}=h,grid=el('div',null,'pc-grid');
  grid.setAttribute('role','grid');grid.setAttribute('aria-label',Number(model.ym.slice(5,7))+'월 계획 달력, 줄 = 주, 칸 = 그날 계획');
  grid.append(el('span',null,'pc-corner'));
  for(const [i,w] of ['월','화','수','목','금','토','일'].entries())grid.append(el('span',w,'pc-wd'+(i===5?' sat':i===6?' sun':'')));
  const year=model.ym.slice(0,4);
  for(const r of model.rows){
    const wy=weekName(r.monday).ym.slice(0,4),head=button(null,()=>goWeek(r.monday),'pc-week'+(r.now?' now':'')+(r.other?' other':''));
    head.dataset.navOnly='1';head.dataset.monday=r.monday;if(r.past)head.setAttribute('data-past','');if(r.now)head.setAttribute('aria-current','true');
    head.setAttribute('aria-label',(wy!==year?Number(wy)+'년 ':'')+r.name+' '+short(r.monday)+'~'+short(r.end)+' · 주 보기로');
    const [mon,wk]=r.name.split(' ');
    add(head,wy!==year?el('small',Number(wy)+'년','pc-week-year'):null,el('span',mon,'pc-week-month'),el('strong',wk,'pc-week-n'));
    grid.append(head);
    for(const d of r.days){
      const c=button(null,()=>openDay?openDay(d.date):goWeek(r.monday),'pc-day'+(d.today?' today':'')+(d.other?' other':'')+(d.total?' has-plan':'')+(d.exams.length?' exam':'')+(d.dow===5?' sat':d.dow===6?' sun':''));   // dow 0 = 월요일
      c.dataset.navOnly='1';c.dataset.date=d.date;if(d.past)c.setAttribute('data-past','');if(d.today)c.setAttribute('aria-current','date');
      c.setAttribute('aria-label',dateLabel(d.date)+(d.today?' · 오늘':'')+(d.exams.length?' · '+d.exams.join(', '):'')+(d.total?' · 계획 '+d.total+'개: '+d.lines.map(x=>x.title).join(', ')+(d.more?' 외 '+d.more+'개':''):' · 계획 없음')+(d.events?' · 일정 '+d.events+'개':''));
      const top=add(el('span',null,'pc-top'),el('span',String(d.day),'pc-num'),d.exams.length?el('span','★'+d.exams[0]+(d.exams.length>1?' +'+(d.exams.length-1):''),'pc-exam'):null,d.events?el('span','●'+d.events,'pc-events'):null);
      top.setAttribute('aria-hidden','true');c.append(top);
      for(const x of d.lines){
        const s=subjects?.get(x.subjectId)??null,strip=svg('svg',{class:'pc-strip','aria-hidden':'true',focusable:'false'});
        strip.append(svg('rect',{x:0,y:0,width:'100%',height:'100%',rx:1.5,fill:s?.color??NO_SUBJECT_COLOR}));
        const line=add(el('span',null,'pc-line'),strip,el('span',x.title||s?.name||'계획','pc-title'));line.dataset.subjectId=x.subjectId;line.setAttribute('aria-hidden','true');c.append(line);
      }
      if(d.more){const more=el('span','+'+d.more,'pc-more');more.setAttribute('aria-hidden','true');c.append(more);}
      grid.append(c);
    }
  }
  return grid;
}

// o.data = life-plan renderPlan의 계산 묶음, o.ym = 달, o.dateGrid() = 옛 날짜 달력 노드들, o.goWeek(monday) = 그 주 보기로, o.openDay(date) = 그날 시트(V10D 계획 달력 칸).
// V10D-1: 보기 = 계획 달력(기본) · 과목 표(st.monthTable) · 날짜 달력(st.monthDates, 앞섬). 머리에 지금 보기가 아닌 두 보기로 가는 단추.
export function renderMonth(ctx,st,{data,ym,dateGrid,goWeek,openDay=null,items=null}){
  const h=maker(ctx.document??globalThis.document),{el,add,button,svg}=h;
  const m=monthModel({life:data.life,study:data.study??null,ach:data.ach,subjects:data.subjects,ym,today:data.today,items}),cal=ctx.planCal??null;
  const out=el('div',null,'pm-month');
  const text=monthHeadText(m),dates=Boolean(st.monthDates),table=!dates&&Boolean(st.monthTable),mode=dates?'DATES':table?'SUBJECT':'PLAN';
  out.dataset.mode=mode;
  const go=(label,next)=>{const b=button(label,()=>{st.monthDates=next==='DATES';st.monthTable=next==='SUBJECT';void ctx.rerender();},'secondary pm-toggle');b.dataset.navOnly='1';b.dataset.mode=next;return b;};
  const toggles=[mode!=='PLAN'?go('계획 달력으로 보기','PLAN'):null,mode!=='SUBJECT'?go('과목으로 보기','SUBJECT'):null,mode!=='DATES'?go('날짜로 보기','DATES'):null].filter(Boolean);
  add(out,add(el('div',null,'pm-head'),text?el('p',text,'plan-sum pm-sum'):el('p','이 달은 쌓은 벽돌도 계획도 없습니다 · 계획은 주 보기에서 넣습니다.','muted small'),add(el('span',null,'pm-toggles'),...toggles)));
  add(out,ctx.monthGoals?.({ym,ach:data.ach,today:data.today})??null);   // FIX46C: "목표 달성 주 n / m" 한 줄(life-quest가 그린다, 앱이 넘겨 준다). 목표를 정한 주가 없으면 줄 없음
  if(dates)add(out,...dateGrid());
  else if(mode==='PLAN'){
    const model=planCalModel({life:data.life,exams:data.exams,events:cal?.events,ym,today:data.today});
    add(out,planCalNode(h,{model,subjects:data.subjects,goWeek,openDay}),el('p','칸을 누르면 그날 계획 · 왼쪽 주 이름을 누르면 주 보기 · 색 띠 = 과목 · ★ 시험 · ● 일정','muted small pc-hint'));
  }
  else{
    const grid=el('div',null,'pm-grid pm-cols-'+m.cols.length);grid.setAttribute('role','grid');grid.setAttribute('aria-label',Number(ym.slice(5))+'월 과목별 주차 벽돌, 칸 아래 막대가 진할수록 많이 쌓은 주, 테두리는 계획이 있던 칸');
    grid.append(el('span',null,'pm-corner'));
    for(const c of m.cols){
      const range=el('small',null,'pm-range');for(const p of weekRangeParts(c))range.append(el('span',p.text,p.other?'pm-other':null));
      // V8LOW L-09: 보고 있는 해와 다른 해의 주 이름이면 이름 위에 연도 한 줄, 해가 바뀌는 주는 읽기 이름에 양쪽 연도
      const wy=weekName(c.monday).ym.slice(0,4),cross=c.monday.slice(0,4)!==c.end.slice(0,4),yr=wy!==ym.slice(0,4)?el('small',Number(wy)+'년','pm-year'):null;
      const n=add(el('span',null,'pm-colhead'+(c.now?' now':'')+(c.edge?' edge':'')+(c.other?' other':'')),yr,el('strong',c.name),range);n.dataset.monday=c.monday;n.setAttribute('aria-label',(yr?Number(wy)+'년 ':'')+c.name+' '+(cross?Number(c.monday.slice(0,4))+'년 ':'')+short(c.monday)+'~'+(cross?Number(c.end.slice(0,4))+'년 ':'')+short(c.end));if(c.end<data.today)n.setAttribute('data-past','');grid.append(n);
    }
    grid.append(el('span','이 달','pm-colhead pm-total-head'));
    for(const r of m.rows){
      const dot=svg('svg',{class:'life-dot',width:8,height:8,viewBox:'0 0 10 10','aria-hidden':'true'});dot.append(svg('circle',{cx:5,cy:5,r:5,fill:r.color}));
      grid.append(add(el('span',null,'pm-subject'),dot,el('span',r.name)));
      r.cells.forEach((v,i)=>{
        const c=m.cols[i],b=button(v.actual>0?num(v.actual):null,()=>goWeek(c.monday),'pm-cell plan-heat-'+heatLevel(v.actual,m.goal)+(v.planned>0?' planned':'')+(c.edge?' edge':'')+(c.other?' other':''));
        b.dataset.navOnly='1';b.dataset.subjectId=r.subjectId;b.dataset.monday=c.monday;if(c.end<data.today)b.setAttribute('data-past','');   // V8W8: 다 지난 주 = 0절 "지나간 것"(회색 빗금)
        b.setAttribute('aria-label',r.name+' '+short(c.monday)+'~'+short(c.end)+(v.actual>0?' 실제 '+barsText(v.actual):'')+(v.planned>0?' 계획 '+barsText(v.planned):'')+(v.actual>0||v.planned>0?'':' 기록 없음'));
        grid.append(b);
      });
      grid.append(el('span',totalText(r.actual,0),'pm-total'));   // V6A: 계획은 장수가 아니라 줄이라 합 칸은 실제 벽돌만
    }
    const sched=m.cols.map(c=>weekSchedule({from:c.monday,to:c.end},data.exams,cal?.events));   // V8W3-2: 그 주 7일(일정은 앱이 달 범위만 읽어 준다)
    if(sched.some(s=>s.exams.length||s.events)){
      grid.append(el('span','일정','pm-subject pm-sched-label'));
      sched.forEach((s,i)=>{
        const c=m.cols[i],b=button(null,()=>goWeek(c.monday),'pm-sched'+(c.other?' other':''));b.dataset.navOnly='1';b.dataset.monday=c.monday;if(c.end<data.today)b.setAttribute('data-past','');
        b.setAttribute('aria-label',short(c.monday)+'~'+short(c.end)+[...s.exams,s.events?'일정 '+s.events+'개':null].filter(Boolean).map(t=>' · '+t).join(''));
        if(s.exams.length)b.append(el('span','★'+s.exams[0]+(s.exams.length>1?' +'+(s.exams.length-1):''),'pm-sched-exam'));
        if(s.events)b.append(el('span','●'+s.events,'pm-sched-event'));
        grid.append(b);
      });
      grid.append(el('span',null,'pm-total'));
    }
    if(m.actual>0||m.planned>0||m.cols.some(c=>c.actual>0)){   // 빈 달은 합 줄을 숨긴다(0으로 채우지 않음)
      grid.append(el('span','주 합','pm-subject pm-sum-label'));
      for(const c of m.cols)grid.append(el('span',c.actual>0?num(c.actual):null,'pm-total pm-col-total'));
      grid.append(el('span',totalText(m.actual,0),'pm-total pm-grand'));
    }
    add(out,grid,heatLegend(el),el('p','칸 아래 막대가 진할수록 많이 쌓은 주 · 테두리 = 계획이 있던 칸 · 칸을 누르면 그 주로','muted small pm-hint'));
  }
  const thisMonth=data.today>=m.first&&data.today<=m.last;
  add(out,scheduleBox(h,ctx,st,data,m.first,m.last,{addDate:thisMonth?data.today:m.first,limit:MONTH_SCHEDULE_SHOW}));
  return out;
}
