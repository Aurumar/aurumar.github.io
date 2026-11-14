// 칭호 메달 (V8W6 4): 칭호마다 그 칭호에 맞는 그림을 코드로 그린 금 메달 틀 SVG에 넣는다(외부 그림 0, 한 세트로 보이게 같은 틀·같은 선 굵기).
// 틀 = 리본 두 갈래 + 금 원판(바깥 테·안쪽 테) + 가운데 상징. 등급은 색만이 아니라 모양으로도 구분한다: 동 = 테 1줄, 은 = 테 2줄, 금 = 테 2줄 + 별 장식 8개, 숨김 = 점선 테.
// 잠긴 칭호(locked)는 회색 빗금 원판 + 점선 테(색만으로 구분하지 않는다). 화면 규칙: createElementNS와 SVG 속성·styles.css 클래스만(인라인 style·innerHTML 없음).
// 그리는 것만 한다: 기록·저장소를 읽거나 쓰지 않는다.
const NS='http://www.w3.org/2000/svg';
// 업적 id → 상징 이름. 칭호(TITLES)의 achv로 고른다. 모르는 id는 별.
const EMBLEM_OF=Object.freeze({'brick-1':'brick','brick-100':'bricks','brick-1000':'wall','brick-3000':'trowel','brick-6000':'tower','gold-1':'goldbar','day-8':'sun','day-16':'flame',
  'streak-7':'moon','streak-30':'lamp','streak-100':'pagoda','streak-365':'seasons','recover-1':'loop','sub-kor':'quill','sub-math':'sword','sub-eng':'ship','sub-hist':'scroll','sub-soc':'globe',
  'sub-sci':'flask','sub-bio':'leaf','sub-all':'stars','bridge-30':'bridge','dawn-30':'sunrise','dawn-100':'crown-sun','sun-30':'sun','sleep-30':'moon','nolate-30':'sword','workout-100':'heart',
  'habit10-30':'grid','gem-100':'gem','ledger-30':'book','budget-3':'vault','budget-12':'vault-crown','boss-1':'shield','boss-season':'crown','questfull-10':'flag','floor-52':'tower',
  'h-comeback':'loop','h-rest':'leaf','grade-up':'arrow','diary-7':'quill','diary-30':'book','review-52':'eye'});
export const emblemOf=achv=>EMBLEM_OF[achv]??'star';
export const MEDAL_TIERS=Object.freeze(['BRONZE','SILVER','GOLD','HIDDEN']);
// 상징: 가운데 (0,0) 기준 ±9 안의 경로. 금 원판 위에 짙은 금 선/면으로 그린다.
const P=Object.freeze({
  brick:['M-7 -3H7V3H-7Z'],bricks:['M-8 1H-1V5H-8Z','M1 1H8V5H1Z','M-4.5 -4H4.5V0H-4.5Z'],wall:['M-8 -6H8V6H-8Z','M-8 0H8','M0 -6V0','M-4 0V6','M4 0V6'],
  trowel:['M-6 6L2 -2','M0 -4L6 -8L8 -6L4 0Z'],tower:['M-4 7V-3H4V7Z','M-5 -3L0 -8L5 -3Z','M-1.5 7V3H1.5V7'],goldbar:['M-7 3L-4 -3H4L7 3Z','M-4 -3L-2 -6H2L4 -3'],
  sun:['M0 -3.5A3.5 3.5 0 1 1 0 3.5A3.5 3.5 0 1 1 0 -3.5Z','M0 -8V-6','M0 6V8','M-8 0H-6','M6 0H8','M-5.7 -5.7L-4.3 -4.3','M4.3 4.3L5.7 5.7','M5.7 -5.7L4.3 -4.3','M-4.3 4.3L-5.7 5.7'],
  flame:['M0 -8C4 -3 6 0 4 4C3 7 -3 7 -4 4C-6 0 -2 -2 0 -8Z','M0 0C2 2 2 4 0 5C-2 4 -2 2 0 0Z'],moon:['M2 -7A7 7 0 1 0 2 7A5 5 0 1 1 2 -7Z'],
  lamp:['M-3 -5H3L4 2H-4Z','M-2 2V5H2V2','M-4 6H4','M0 -8V-5'],pagoda:['M-7 -1L0 -6L7 -1Z','M-5 -1V2H5V-1','M-8 4L0 0L8 4Z','M-6 4V7H6V4'],
  seasons:['M0 -7A7 7 0 1 1 0 7A7 7 0 1 1 0 -7Z','M0 -7V7','M-7 0H7'],loop:['M-6 0A6 6 0 1 1 0 6','M0 6L-3 3','M0 6L-3 9'],
  quill:['M-6 7L5 -6C7 -8 8 -6 7 -4L-4 6Z','M-6 7L-4 6'],sword:['M-6 6L5 -5','M3 -7L7 -3','M-7 3L-3 7','M-8 8L-6 6'],ship:['M-7 3H7L5 7H-5Z','M0 3V-7','M0 -7L5 1H0'],
  scroll:['M-6 -6H5V6H-6Z','M-6 -6A2 2 0 1 0 -6 -2','M-3 -2H3','M-3 1H3'],globe:['M0 -7A7 7 0 1 1 0 7A7 7 0 1 1 0 -7Z','M-7 0H7','M0 -7C-4 -3 -4 3 0 7','M0 -7C4 -3 4 3 0 7'],
  flask:['M-2 -7H2','M-1.5 -7V-2L-6 6H6L1.5 -2V-7','M-4 3H4'],leaf:['M-6 6C-6 -2 0 -7 7 -7C7 0 2 6 -6 6Z','M-6 6L3 -3'],
  stars:['M0 -8L1.2 -4.5H4.8L1.8 -2.3L3 1.2L0 -1L-3 1.2L-1.8 -2.3L-4.8 -4.5H-1.2Z','M-5 3L-4.3 5H-2L-3.8 6.2L-3.1 8.2L-5 7L-6.9 8.2L-6.2 6.2L-8 5H-5.7Z','M5 3L5.7 5H8L6.2 6.2L6.9 8.2L5 7L3.1 8.2L3.8 6.2L2 5H4.3Z'],
  bridge:['M-8 4H8','M-6 4V1C-3 -4 3 -4 6 1V4','M-3 4V-1','M3 4V-1'],sunrise:['M-8 4H8','M-5 4A5 5 0 0 1 5 4','M0 -7V-4','M-6 -4L-4.5 -2.5','M6 -4L4.5 -2.5'],
  'crown-sun':['M-6 5H6L7 -3L3 0L0 -6L-3 0L-7 -3Z','M0 -9V-7'],heart:['M0 7C-9 1 -7 -6 -3 -6C-1 -6 0 -4 0 -3C0 -4 1 -6 3 -6C7 -6 9 1 0 7Z'],
  grid:['M-7 -7H7V7H-7Z','M-7 0H7','M0 -7V7','M-3.5 -7V7','M3.5 -7V7'],gem:['M-7 -2L-4 -6H4L7 -2L0 7Z','M-7 -2H7','M-2 -6L0 -2L2 -6','M0 -2V7'],
  book:['M-7 -5C-4 -6 -1 -6 0 -4C1 -6 4 -6 7 -5V6C4 5 1 5 0 7C-1 5 -4 5 -7 6Z','M0 -4V7'],vault:['M-7 -6H7V6H-7Z','M0 -3A3 3 0 1 1 0 3A3 3 0 1 1 0 -3Z','M0 0H3'],
  'vault-crown':['M-7 -2H7V7H-7Z','M0 1A2 2 0 1 1 0 5A2 2 0 1 1 0 1Z','M-5 -4L-3 -8L0 -5L3 -8L5 -4Z'],shield:['M0 -8L7 -5V0C7 4 4 7 0 8C-4 7 -7 4 -7 0V-5Z','M0 -4V5','M-3.5 0H3.5'],
  crown:['M-7 5H7L8 -5L3.5 -1L0 -7L-3.5 -1L-8 -5Z','M-7 7H7'],flag:['M-5 8V-8','M-5 -7H6L3 -3L6 1H-5'],arrow:['M0 -8L7 -1H3V7H-3V-1H-7Z'],
  eye:['M-8 0C-4 -6 4 -6 8 0C4 6 -4 6 -8 0Z','M0 -2.5A2.5 2.5 0 1 1 0 2.5A2.5 2.5 0 1 1 0 -2.5Z'],star:['M0 -8L2 -2.5H8L3 1L5 7L0 3.5L-5 7L-3 1L-8 -2.5H-2Z'],
});
// 면으로 채우는 상징(나머지는 선). 선 상징은 fill 없이 짙은 금 선만.
const FILLED=new Set(['brick','bricks','goldbar','flame','moon','heart','gem','star','stars','crown','crown-sun','arrow','shield','tower','vault-crown']);
let uid=0;
// 메달 하나. size = 화면 크기(px, width·height 속성). 돌려주는 값 = svg. title(이름)은 aria-label로만 싣는다(칩의 글자 textContent를 바꾸지 않게 <title> 글자를 넣지 않는다).
export function titleMedal(doc,{achv,tier='BRONZE',name=null,locked=false,size=40}={}){
  if(typeof doc?.createElementNS!=='function')return null;
  const s=(tag,attrs={})=>{const n=doc.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const id='lbMedal'+(++uid),t=MEDAL_TIERS.includes(tier)?tier:'BRONZE',emblem=emblemOf(achv);
  const svg=s('svg',{class:'medal medal-'+t.toLowerCase()+(locked?' medal-locked':''),viewBox:'-24 -28 48 56',width:size,height:Math.round(size*56/48),role:'img','aria-label':(name?'칭호 메달 · '+name:'칭호 메달')+(locked?' (잠김)':''),focusable:'false'});
  svg.setAttribute('data-emblem',emblem);svg.setAttribute('data-tier',t);
  const defs=s('defs'),grad=s('linearGradient',{id:id+'g',x1:'0',y1:'0',x2:'1',y2:'1'});
  grad.append(s('stop',{offset:'0%',class:'medal-stop-1'}),s('stop',{offset:'50%',class:'medal-stop-2'}),s('stop',{offset:'100%',class:'medal-stop-3'}));
  const hatch=s('pattern',{id:id+'h',width:'3',height:'3',patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});hatch.append(s('rect',{width:'3',height:'3',class:'medal-hatch-bg'}),s('path',{d:'M0 0V3',class:'medal-hatch-line'}));
  defs.append(grad,hatch);svg.append(defs);
  // 리본 두 갈래(위)
  svg.append(s('path',{class:'medal-ribbon',d:'M-9 -28H-2L-5 -12H-12Z'}),s('path',{class:'medal-ribbon medal-ribbon-b',d:'M2 -28H9L12 -12H5Z'}));
  const disc=locked?'url(#'+id+'h)':'url(#'+id+'g)';
  // 금: 테 둘레 별 장식 8개(모양으로 등급 구분)
  if(t==='GOLD'&&!locked)for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.sin(a)*19.5,y=6-Math.cos(a)*19.5;svg.append(s('circle',{class:'medal-stud',cx:x.toFixed(2),cy:y.toFixed(2),r:'1.6'}));}
  svg.append(s('circle',{class:'medal-disc',cx:0,cy:6,r:17,fill:disc}));
  svg.append(s('circle',{class:'medal-rim'+(t==='HIDDEN'||locked?' dashed':''),cx:0,cy:6,r:17,fill:'none'}));
  if((t==='SILVER'||t==='GOLD')&&!locked)svg.append(s('circle',{class:'medal-rim medal-rim-in',cx:0,cy:6,r:13.6,fill:'none'}));
  const g=s('g',{class:'medal-emblem'+(FILLED.has(emblem)?' filled':''),transform:'translate(0 6)'});
  for(const d of P[emblem]??P.star)g.append(s('path',{d}));
  svg.append(g);
  return svg;
}
