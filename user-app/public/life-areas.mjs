// 옛 영역 A~J 읽기 전용 칸(A1B). 설계 M1D §2.3. 읽기만 한다: 어떤 기록도 쓰지 않고 시계·난수·저장소·통신·innerHTML 없음.
// 옛 DOMAIN 기록과 쓰는 함수·서버 검사는 그대로 두고 화면에서 편집만 없앤다. 4영역 묶음은 표시 전용이다(저장 0).
const AREA_TEXT=Object.freeze({BODY:'몸',HEAD:'머리',MONEY:'돈',HEART:'마음'});
export const LEGACY_GROUPS=Object.freeze({BODY:['B','C'],HEAD:['F'],MONEY:['D','E','J'],HEART:['A','G','H','I']});
const LEGACY_FIELDS=Object.freeze([['nextAction','다음 행동'],['currentState','현재'],['desiredState','바라는 상태'],['currentPlan','현재 계획'],['blocker','막힌 점'],['reviewTrigger','다시 볼 조건'],['deferredReason','보류 이유']]);

// 옛 영역: 실제로 입력한 것(heads가 있는 것)만 4영역 아래로 묶는다. 묶음 밖 코드는 없다(A~J 전부 포함).
export function legacyAreas(domains){
  const entered=(Array.isArray(domains)?domains:[]).filter(d=>Array.isArray(d.heads)&&d.heads.length>0);
  const groups=Object.entries(LEGACY_GROUPS).map(([area,codes])=>({area,label:AREA_TEXT[area],items:entered.filter(d=>codes.includes(d.code))})).filter(g=>g.items.length);
  return {count:entered.length,groups};
}
// h={el,add}. 입력한 영역이 0개면 null(칸 자체가 없다). 편집 단추 없음.
export function legacyAreaNode(h,domains,{statusText=s=>s,open=false}={}){
  const {count,groups}=legacyAreas(domains);
  if(!count)return null;
  const box=h.add(h.el('details',null,'panel legacy-areas'),h.el('summary','옛 영역 기록 (읽기 전용) · '+count+'개'));
  box.open=open;
  for(const g of groups){
    h.add(box,h.el('h3',g.label));
    for(const d of g.items){
      const card=h.add(h.el('article',null,'legacy-area'),h.el('strong',d.code+' · '+d.name+' · '+statusText(d.data.status)));
      for(const [key,label] of LEGACY_FIELDS)if(d.data[key])h.add(card,h.add(h.el('div',null,'state-line'),h.el('strong',label),h.el('span',d.data[key])));
      h.add(box,card);
    }
  }
  return box;
}
