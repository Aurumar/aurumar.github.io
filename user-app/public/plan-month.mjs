// P1C: 계획 탭 '월' 보기 = 과목 × 주차 표 + 일정(시험·EVENT) 줄. 앱이 ctx.planMonth로 넘겨 주면 life-plan의 월 보기가 이것을 그린다(못 받으면 옛 날짜 달력 그대로).
// 설계: AUTOPILOT\design\P1D_PLAN_CALENDAR_DESIGN.md 2.1·2.4·5(P1C). 합성 데이터로만 시험한다. 화면 규칙: DOM 생성 함수만(innerHTML·인라인 style·외부 라이브러리 없음), 색은 styles.css 토큰.
// 칸 색 = 그 주 그 과목의 실제 벽돌, 칸 테두리 = 계획이 있던 칸.
// V8W3-2 (소유자 2026-11-14 "11월 1일이 한 주에 하루만 놓인다"): 주 칸 = 월요일 시작 7일 전부(10/26~11/1). 주 이름은 7일 중 4일 이상 든 달 기준("10월 5주"·"11월 1주", life-plan weekName).
// 다른 달 날짜는 머리 날짜 범위에서 조금 연하게(pm-other), 다른 달 이름의 주 칸은 바탕만 조금 연하게(other) — 칸 숫자(기록)는 그대로 읽힌다.
// 줄 끝 "이 달" 칸·머리 한 줄(목표 대비)은 예전처럼 이 달에 든 날만 센다(주 칸 합과 다를 수 있어 머리 이름을 "이 달"로 적는다). 아래 "주 합" 줄 = 그 주 7일 전부.
// 보기만 한다: 쓰기 0(일정 추가·고치기는 앱의 일정 시트, 계획 넣기는 주 보기). "목표 달성 주" 한 줄(FIX46C)은 앱이 ctx.monthGoals로 넘겨 주면 머리 아래에 붙는다(과목 주간 목표 계산은 life-quest). 새 기록 종류·필드 0.
import {shiftDay} from './life-model.mjs';
import {actualOf,planOf,mondayOf,daysInMonth,heatLevel,heatLegend,barsText,scheduleBox,maker,NO_SUBJECT_COLOR,planItemsDone,itemsDoneText,goalVsText,weekName} from './life-plan.mjs';

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

// ---------- 화면 ----------
// o.data = life-plan renderPlan의 계산 묶음, o.ym = 달, o.dateGrid() = 옛 날짜 달력 노드들, o.goWeek(monday) = 그 주 보기로.
export function renderMonth(ctx,st,{data,ym,dateGrid,goWeek,items=null}){
  const h=maker(ctx.document??globalThis.document),{el,add,button,svg}=h;
  const m=monthModel({life:data.life,study:data.study??null,ach:data.ach,subjects:data.subjects,ym,today:data.today,items}),cal=ctx.planCal??null;
  const out=el('div',null,'pm-month');
  const text=monthHeadText(m),dates=Boolean(st.monthDates);
  const toggle=button(dates?'과목으로 보기':'날짜로 보기',()=>{st.monthDates=!dates;void ctx.rerender();},'secondary pm-toggle');toggle.dataset.navOnly='1';
  add(out,add(el('div',null,'pm-head'),text?el('p',text,'plan-sum pm-sum'):el('p','이 달은 쌓은 벽돌도 계획도 없습니다 · 계획은 주 보기에서 넣습니다.','muted small'),toggle));
  add(out,ctx.monthGoals?.({ym,ach:data.ach,today:data.today})??null);   // FIX46C: "목표 달성 주 n / m" 한 줄(life-quest가 그린다, 앱이 넘겨 준다). 목표를 정한 주가 없으면 줄 없음
  if(dates)add(out,...dateGrid());
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
