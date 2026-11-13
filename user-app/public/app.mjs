import {PC_ENTITY_REQUEST_LIMIT,buildBudget,monthSpan,finErrorText,finError,formatWon,formatCompact,shiftMonth,shownMerchant,isSensitive,buildAccount,buildTxn,buildRule,monthLines,duplicateGroups,ledgerCsv,rulePreview,checkImportPlan,opBudget,opBudgetNotice,opWarnLine,LOG_LIMIT_CODE,LOG_LIMIT_TEXT,opsAfter,localBudget,capacityNotice,compactionText,holdGuidance,importPermission,finFingerprintInput,housekeepingText,cardBillHint} from './fin-ledger.mjs';
import {PERIODS as PLAN_PERIODS,detectRecurring,recurringGridLayout,costSplit,budgetStatus,budgetFor,budgetBarsLayout,lifeTimeline,timelineLayout,vaultPlan,vaultBudget,vaultFixedItems,vaultBricks,vaultBrickLayout,vaultCashFromSnapshot,vaultOverdraftFromSnapshot,vaultCardUnpaidFromSnapshot,liveNetCash,quickPicks,monthInsight} from './fin-plan.mjs';
import {prepare,PERIODS,periodRange,aggregate,roundDiv,dataMonths,overview,monthlySeries,barLayout,sankeyData,sankeyLayout,treemapItems,squarify,dailyTotals,heatmapMonths,completeness,todaySpendLine,buildTodayGlance} from './fin-charts.mjs';
import {RECURRING_ID,RECURRING_TEXT,findCandidates,addRule as addRecurringRule,setRuleHidden as setRecurringHidden,ruleStatus as recurringStatus,monthlyTotal as recurringMonthly,matchDraft as recurringMatchDraft,recurringKey,setRuleAmount as setRecurringAmount,canSetAmount as canSetRecurringAmount,priceChange as recurringPriceChange,ledgerMatch as recurringLedgerMatch,createHiddenBox as createRecurringHiddenBox,merchantChoices as recurringMerchantChoices,sameExpense,sameExpenseGroups,refundCandidate,SAME_EXPENSE_TEXT} from './fin-recurring.mjs';
import {meltNode,monthForecast,forecastNode,renderBudgetReport,fixedSchedule,fixedPlan,withRuleDates} from './fin-forecast.mjs';
import {readStatementAsync,findHeader,headerAt,guessColumns,guessInstallAmountIsTotal,columnsProblem,normalizeRows,controlCheck,headerSig,accountSig,rememberedAccount,bytesSha256,createMappingStore,stmtErrorText,maskCell,normHeader,COLUMN_ROLES,COLUMN_TEXT,REQUIRED_ROLES,ROW_STATUS_TEXT,STMT_LIMITS} from './fin-statement.mjs';
import {readXlsx,xlsxErrorText,xlsxSupported,XLSX_LIMITS} from './fin-xlsx.mjs';
import {reconcileStatement,suggestContext,STATUS_TEXT as STMT_STATUS_TEXT,REASON_TEXT as STMT_REASON_TEXT,sameMerchantKeys,coveredByBatches,selectForSave,statementTxnInput,checkStatementSave,runStatementSave,keepForced,statementSaveKey,SAVE_MAX} from './fin-reconcile.mjs';
import {createQuickMemory,renderQuickChips,quickNeedText} from './fin-quick.mjs';
import {moneyFeel,feelCore,feelNode,feelChip,feelDetails,feelLine,feelChange,feelSavedPart,feelLineLayout,feelLineNode,feelAssist,feelTone,feelProjected,FEEL_LEVEL,vaultCardNode,vaultWall,vaultTodayNum,vaultDayText} from './fin-feel.mjs';
import {legacyAreaNode} from './life-areas.mjs';
import {moneyFacts} from './life-money-facts.mjs';
import {FRESH_START,FRESH_TEXT,FRESH_READ_ONLY,freshView,freshWriteBlock,dateBeforeFresh,freshSeenKey,beforeFreshList,renderFreshManage,beforeFreshBody} from './fresh-start.mjs';
import {freshLockView} from './fresh-start.mjs';   // V7D2: 기준 전 날짜 화면 읽기 전용
import {draftBeforeFresh} from './fresh-start.mjs';   // FIX73 (H71-3): 임시 저장 목록의 기준 전 줄
const mdBackend=globalThis.LIFE_BRICK_MD_BACKEND??null;
if(mdBackend&&mdBackend.format!=='LB_MD_UI_BACKEND_1')throw new Error('MD_BACKEND_PROFILE');
let mdProfile=!!mdBackend,mdReady=false,mdSurface=null,mdRole='NONE',mdUnlockState=null,mdCaps=new Set(),mdProduct=null,mdUnlocked=false,mdDraftReady=false;
// One UI source for every surface. A feature is shown only when the running backend declares its route in
// status.capabilities. The release-pinned Windows B legacy composition (windows-app.mjs) predates that
// declaration, so its exact route set is listed here.
const LEGACY_WINDOWS_MD_ROUTES=['status','email','email-code','totp','activate','sync','acquire','release','reconcile','freeze','suspend','pair-relay-probe','pair-begin','pair-begin-manual','pair-request-poll','pair-publish-draft','pair-ack-poll','pair-relay-status','pair-relay-abort-unapproved','pair-inspect','pair-approve','pair-commit','pair-reconcile','enroll-start','enroll-approve','enroll-finish','recovery-begin','recovery-freeze','recovery-finish'];
const can=route=>mdCaps.has(route);
const SHOW_GENERAL_FREEZE=false; // D-ONEWAY 출하 설정: 일반 동결 버튼 숨김(누를 버튼이 없으면 분실·복구 묶음도 숨김)
const ownerSurface=()=>mdSurface==='BROWSER'||mdSurface==='APP_SHELL';
// Offline capture is a sealed LOCAL_DRAFT only; it is never shown or counted as committed history.
const mdDraftMode=()=>mdProfile&&!mdReady&&mdDraftReady;
const DRAFT_ROUTES={'/api/action-record':'RECORD','/api/entity':'ENTITY','/api/correction':'CORRECTION'};
const savedStatus=()=>mdProfile?(mdDraftMode()?'LOCAL_DRAFT':'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'):'LOCAL_SAVED';
// B1 plain save/sync language. Each phrase names exactly one existing technical state; the technical code stays
// visible under "기술 정보". A LOCAL_DRAFT is never called committed and an unknown dispatch is never called saved.
const SAVE_TEXT={QUOTA:'저장 공간이 부족해 저장하지 못했습니다 · 입력은 그대로 있습니다 · 공간을 비운 뒤 앱을 다시 여세요',LOG_LIMIT:'저장 공간이 꽉 찼어요. 입력은 이 기기에 남아 있어요. 이월이 필요해요.',/* OPS1A: fin-ledger LOG_LIMIT_TEXT와 같은 글(시험 OPS1A-3b가 같음을 확인) */LOCAL_DRAFT:'이 기기에 임시 저장됨',LOCAL_DRAFT_NOTE:'아직 동기화 전 · 쌓인 기록·진행·탑에는 들어가지 않음',VERIFIED:'저장 및 동기화 확인됨',LOCAL_SAVED:'이 PC에 저장됨',CONNECT:'연결되면 마무리할 수 있음',UPDATE:'앱 업데이트가 필요함',CHECK:'이 저장을 확인한 뒤 계속할 수 있음',NOT_PROVISIONED:'서버 동기화가 설정되지 않음',READ_ONLY:'최신 기록 확인됨 · 기록하려면 저장 준비가 필요함',READ_ONLY_AUTO:'최신 기록 확인됨 · 저장하면 자동으로 저장 준비를 해서 동기화',WRITE_READY:'최신 기록 확인됨 · 저장하면 바로 동기화 확인',FOLLOWER:'읽기 전용 창 · 다른 창에서 기록 중',LOCKED:'잠김'};
const unprovisioned=()=>mdProduct?.serverSync==='SERVER_SYNC_NOT_PROVISIONED';
const draftTail=()=>unprovisioned()?'서버 동기화 미설정 · 아직 쌓이지 않음':SAVE_TEXT.CONNECT;
const saveMessageFor=code=>code==='LOCAL_DRAFT'?SAVE_TEXT.LOCAL_DRAFT+' · '+SAVE_TEXT.LOCAL_DRAFT_NOTE:code==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED'?SAVE_TEXT.VERIFIED:SAVE_TEXT.LOCAL_SAVED;
const savedMessage=()=>saveMessageFor(savedStatus());
const PRODUCT_TEXT={LOCAL_ENCRYPTED_COPY:'이 장치의 암호화 사본',LOCKED:'이 기기 사본 잠김',SERVER_ENCRYPTED_SYNC:'서버 암호문 동기화 · 서버는 평문을 보지 않음',SERVER_SYNC_NOT_PROVISIONED:'서버 동기화 미구성 · 이 기기 읽기와 임시 입력만 가능',OFFLINE_STALE:'동기화 전 · 마지막 검증 기록 기준 · 최신이 아닐 수 있음',SYNCED_VERIFIED_READ_ONLY:'동기화 검증됨 · 읽기 전용',SYNCED_WRITE_READY:'동기화 검증됨 · 저장 준비됨',HOLD:'보류 (HOLD) · 저장 결과 확인 전 추가 기록 금지',UNKNOWN:'결과 모름 · 같은 요청의 결과 확인',LOCAL_DRAFT:'이 기기에 임시 저장 · 쌓인 기록 아님',SERVER_COMMITTED:'서버에 쌓인 기록',REMOTE_COMMITTED_LOCAL_HOLD:'서버에 쌓임 · 이 장치 반영 보류',DISPATCHED_UNKNOWN:'전송 결과 모름',PREPARED_DURABLE:'전송 준비됨 · 결과 확인 필요',ABORTED_NOT_COMMITTED:'서버에 쌓이지 않고 종료 · 쌓인 기록 아님'};
function productOf(s){if(s.product)return s.product;if(s.state!=='UNLOCKED')return {localCopy:'LOCKED',serverSync:'SERVER_ENCRYPTED_SYNC',freshness:null,drafts:0};const p=s.syncState;return {localCopy:'LOCAL_ENCRYPTED_COPY',serverSync:'SERVER_ENCRYPTED_SYNC',freshness:['LOCAL_PUBLICATION_HOLD','REMOTE_COMMITTED_LOCAL_HOLD'].includes(p)?'HOLD':s.pendingIntent?'UNKNOWN':p==='WRITE_READY'?'SYNCED_WRITE_READY':p==='VERIFIED_READ_ONLY'?'SYNCED_VERIFIED_READ_ONLY':'OFFLINE_STALE',drafts:0};}
function productText(p){return p?[p.localCopy,p.serverSync,p.freshness].filter(Boolean).map(k=>PRODUCT_TEXT[k]||k).join(' · ')+(p.drafts?' · '+PRODUCT_TEXT.LOCAL_DRAFT+' '+p.drafts+'건':''):'';}
// M1 (F4): why the saved login could not be restored, as a code plus plain Korean text. Only the code and the counter published by
// LIFE_BRICK_AUTH_DIAG are used; no token, phrase or server text ever reaches this line.
const RESTORE_TEXT={NO_RECORD:'저장된 로그인이 없습니다 · 서버 로그인이 필요합니다.',MARKER:'로그아웃 표식을 읽지 못해 복원을 미뤘습니다(저장된 로그인은 보존됨) · 다음 시작에 다시 시도합니다.',RECORD_READ:'저장된 로그인을 읽지 못해 복원을 미뤘습니다(보존됨) · 다음 시작에 다시 시도합니다.',RECORD_UNUSABLE:'저장된 로그인 형식을 해석하지 못해 복원을 미뤘습니다(보존됨).',CLOCK:'기기 시각이 저장 시각보다 이전이라 복원을 미뤘습니다(보존됨) · 기기 시각을 확인하세요.',IDLE_90D:'마지막 사용 후 90일이 지나 저장된 로그인을 지웠습니다 · 서버 로그인이 필요합니다.',OTHER_OWNER:'저장된 로그인이 다른 계정의 것이라 지웠습니다 · 서버 로그인이 필요합니다.',AAL1:'저장된 로그인에 인증 앱(TOTP) 단계가 없어 지웠습니다 · 이메일 코드와 인증 앱으로 다시 로그인하세요.',SIGNED_OUT:'다른 창에서 로그아웃되어 저장된 로그인을 지웠습니다 · 서버 로그인이 필요합니다.',RATE_LIMIT:'서버가 요청을 제한해(429) 복원을 미뤘습니다(보존됨).',SERVER:'서버 오류로 복원을 미뤘습니다(보존됨).',TIMEOUT:'서버 응답이 늦어 복원을 미뤘습니다(보존됨).',NETWORK:'네트워크에 연결되지 않아 복원을 미뤘습니다(보존됨).',RESPONSE:'서버 응답을 해석하지 못해 복원을 미뤘습니다(보존됨).',UNKNOWN:'알 수 없는 이유로 복원을 미뤘습니다(보존됨).'};
function restoreText(r){
 if(!r||typeof r!=='object'||r.state==='NOT_TRIED'||r.state==='OK')return '';
 const code=/^[A-Z0-9_]{1,24}$/.test(r.code)?r.code:'UNKNOWN';
 const text=RESTORE_TEXT[code]||(/^REFUSED_\d{3}$/.test(code)?'서버가 저장된 로그인을 거절해 지웠습니다 · 서버 로그인이 필요합니다.':/^HTTP_\d{3}$/.test(code)?'서버가 예상 밖의 응답을 보내 복원을 미뤘습니다(보존됨).':RESTORE_TEXT.UNKNOWN);
 const again=r.state==='DEFERRED'&&r.relogin===true;
 return '로그인 복원 · '+text+(again?' · 연속 '+(Number.isSafeInteger(r.count)?r.count:3)+'회 복원하지 못했습니다. 저장된 로그인은 지우지 않았으니 서버 로그인을 다시 하세요.':'')+' · 문의 코드 ▾\u2060'+code+'\u2060';
}
function renderRestore(){const n=document.getElementById('md-auth-restore');if(!n)return;let r=null;try{r=globalThis.LIFE_BRICK_AUTH_DIAG?.restore?.()??null;}catch{r=null;}const t=restoreText(r);n.textContent=t;n.hidden=!t;n.dataset.code=t?r.code:'';}
function renderProductState(){const n=document.getElementById('md-product-state');if(n){n.textContent=productText(mdProduct);n.dataset.state=mdProduct?.freshness||'LOCKED';}renderRestore();saTrack();}
function mdApply(s){mdScope={selected:s.selected,profiles:s.profiles};mdRole=s.localRole??'NONE';mdUnlockState=s.unlockState??null;mdUnlocked=s.state==='UNLOCKED';mdReady=s.writeReady===true&&(!ownerSurface()||mdRole==='OWNER');mdProduct=productOf(s);mdDraftReady=!mdReady&&can('draft-save')&&mdRole==='OWNER'&&mdUnlocked;renderProductState();}
const $=id=>document.getElementById(id);
// B1 navigation. Phone: HOME TODAY PLANS CALENDAR + MORE. Wider screens show every destination. No route is
// removed: HOUSE now opens the merged PROGRESS house panel, and device/recovery controls live in DEVICES.
// B40 5탭 IA. NAV = 모든 화면(키, 제목, 설명, 기호, 머리글), TABS = 탭(navigate 대상, 라벨, 기호, 그 탭에 속한 화면). 화면을 더하면 TABS 어딘가에 반드시 넣는다(누락 시험 b40).
const NAV=[['HOME','오늘','오늘 한눈에','☀','TODAY'],['ACTIONS','행동 기록','결과와 이어갈 지점 기록','✓','RECORDS'],['PLANS','계획','목표에서 다음 행동까지','▤','PLAN'],['CALENDAR','달력','기한과 약속을 한곳에','▦','PLAN'],['LIFE','영역','열 가지 영역, 내가 정하는 방향','◎','PLAN'],['LEDGER','돈','계정 · 거래 · 돈의 흐름 · 명세서 가져오기 · 과거 이력','▥','MONEY'],['FINANCE','재정 기록','직접 입력한 현재의 숫자','₩','MONEY'],['HEALTH','건강','하루 1장 건강 기록 · 이 기기에서 켠 경우에만','♥','RECORDS'],['STUDY','공부','하루 1장 공부 기록 · 복습 · 이 기기에서 켠 경우에만','✎','RECORDS'],['HISTORY','이력','원본과 변경을 함께 보존','↺','RECORDS'],['STATUS','상태','오늘 시간 · 평생 등급 · 탑과 우주 입구','◎','TOWER'],['PROGRESS','탑','기록으로 확인하는 변화와 쌓인 블록','▲','TOWER'],['SETTINGS','설정','행동 목록과 표시','⚙','MORE'],['DEVICES','연결 · 장치','동기화 · 장치 추가 · 분실·복구 · 저장 위치','⇄','MORE'],['ADVANCED','고급','저장 준비 · 저장 결과 확인 · 남은 저장 용량','⚒','MORE']];
const TABS=[['TODAY','오늘','☀',['HOME']],['PLAN','계획','▤',['PLANS','CALENDAR','LIFE']],['LEDGER','돈','₩',['LEDGER','FINANCE']],['RECORDS','기록','✎',['ACTIONS','HEALTH','STUDY','HISTORY']],['HOUSE','탑','▲',['STATUS','PROGRESS']],['MORE','더보기','⋯',['MORE','SETTINGS','DEVICES','ADVANCED']]];
const MORE_VIEWS=['SETTINGS','DEVICES','ADVANCED'],ROUTE_ALIAS={HOUSE:'PROGRESS',TODAY:'HOME',PLAN:'PLANS',RECORDS:'ACTIONS'};
const VIEW_META={...Object.fromEntries(NAV.map(([k,l,s,,en])=>[k,[l,s,en]])),MORE:['더보기','설정 · 연결 · 장치 · 백업 · 복구 · 고급','MORE']};
const shownViews=()=>NAV.filter(n=>n[0]!=='HEALTH'||hltOn()).filter(n=>n[0]!=='STUDY'||studyOn());
const LABEL={COMPLETE:'완료',PARTIAL:'일부 완료',NOT_DONE:'하지 못함',UNRECORDED:'미기록',ACTIVE:'진행',MAINTAIN:'유지',DEFERRED_WITH_REASON:'이유를 두고 보류',UNKNOWN:'아직 모름',NOT_APPLICABLE:'해당 없음',DEADLINE:'기한',APPOINTMENT:'약속',REVIEW:'검토',MILESTONE:'중간 목표',RESULT:'행동 결과',RESTART:'재시작 지점',ACTION:'행동 정의',DOMAIN:'영역 상태',PLAN:'계획',EVENT:'일정',FINANCE:'재정 기록',PREFERENCES:'표시 설정',MEASUREMENT:'실제로 한 양',FIN_ACCOUNT:'가계부 계정',FIN_TXN:'가계부 거래',FIN_BATCH:'가계부 가져오기 묶음',FIN_RULE:'가계부 분류 규칙',FIN_BUDGET:'가계부 예산',FIN_RECURRING:'가계부 정기 결제',HLT_PROFILE:'건강 기본 설정',HLT_DAY:'건강 하루 기록',STUDY_DAY:'공부 하루 기록',HABIT_DEF:'습관 정의',LIFE_DAY:'오늘 카드',SUBJECT_DEF:'과목 정의',EXAM_SCHEDULE:'시험 일정',PLAN_DAY:'하루 계획',PLAN_GOAL:'과목 주간 목표',EXAM_RESULT:'모의고사 결과',GAME_PROFILE:'칭호',DIARY_DAY:'일기',WEEK_REVIEW:'주간 리뷰'};
let capability=null,setupState=null,busy=false,ended=false,streamController=null,view='HOME',whole=null,today=null,changes=[],wholeRaw=null,freshRows=[],editorSave=null,calendarState=null,calendarMode=null,calendarDate=null,planFilter='ALL',historyFilter={date:'',domain:'',type:''},historyLimit=100;
const drafts=new Map();
// F12-2 진단용 단계 시간(ms, 숫자만): refresh()/render() 앞뒤로 재서 최근 3회만 보관. 서버로 보내지 않는다.
const refreshTimings=[],renderTimings=[];
async function timed(list,name,fn){const t0=performance.now();try{return await fn();}finally{const rec={};rec[name]=performance.now()-t0;list.push(rec);if(list.length>3)list.shift();}}
// B1 presentation-only memory: sealed LOCAL_DRAFT captures made in this session (never counted anywhere), the
// last write result, the last error, and the device/connection panel that moves between the lock screen and DEVICES.
const localDrafted=new Map();let lastSave=null,problem=null,houseFocus=false,mdPanel=null,mdHost=null;
const narrow=()=>globalThis.matchMedia?.('(max-width: 700px)').matches===true;
const mdAutoOK=()=>mdProfile&&mdUnlocked&&mdRole==='OWNER'&&ownerSurface();
function applyMDLocks(){if(!mdProfile)return;const open=mdReady||mdDraftReady||mdAutoOK();for(const n of document.querySelectorAll('#workspace input,#workspace textarea,#workspace select,#workspace button.primary,#editor input,#editor textarea,#editor select,#editor-save')){if(n.dataset.navOnly||n.closest('#md-controls'))continue;if(!open&&!n.disabled){n.disabled=true;n.dataset.mdLock='1';}else if(open&&n.dataset.mdLock&&!busy){n.disabled=false;delete n.dataset.mdLock;}}}
function renderMDSettings(root,s){const p=section('이 기기의 저장소','기록은 이 기기에 암호화되어 저장되고, 연결되면 서버에는 암호문만 동기화됩니다. 동기화는 백업이 아닙니다.');
 const where=s.surface==='BROWSER'?'이 사이트의 브라우저 저장소에 암호화하여 저장합니다. 사이트 데이터 삭제나 비공개 모드로 이 기기의 등록 정보가 사라지면 새 장치 등록이 필요합니다.':s.surface==='APP_SHELL'?'이 앱 전용 데이터 폴더에 암호화하여 저장합니다. 브라우저 저장소를 쓰지 않습니다. 쌓인 기록은 연결된 상태에서 저장 준비와 서버 확인을 마친 것만입니다.':'이 PC의 별도 암호화 SQLite와 장치 identity를 사용합니다. 다른 PC로 identity를 복사하지 마세요.';
 const backup=s.surface==='WINDOWS'?'백업 만들기와 검증된 복원본 만들기를 사용할 수 있습니다. 복원본은 자동으로 활성화되지 않습니다.':'이 앱에는 아직 자동 백업·내보내기·복원 기능이 없습니다. 서버 동기화는 백업을 대신하지 않습니다.';
 const tech=add(el('details',null,'tech-details'),el('summary','기술 정보'),row('세션',s.session),row('이 기기 · 서버 상태',productText(mdProduct)),row('암호화 저장 형식',s.storage),el('p',s.dataRoot,'path'),row('확인한 서버 버전',s.remoteCheckpoint.version),el('p',s.remoteCheckpoint.head,'path'),s.backup?.status?row('백업 상태 코드',s.backup.status):null);
 // B23: 브라우저 저장 보호 상태·사용량·홈 화면 앱 여부(읽기 전용, pwa-core가 꽂은 훅이 있을 때만). 서버 호출·기록 쓰기 없음.
 const pwaStore=s.surface==='BROWSER'?globalThis.lbPwaStorage:null,storageLine=el('p','확인 중…','muted small'),storageAdvice=hint('');storageAdvice.hidden=true;
 if(pwaStore?.read)Promise.resolve().then(()=>pwaStore.read()).then(r=>{storageLine.textContent=r.text;storageAdvice.textContent=r.advice??'';storageAdvice.hidden=!r.advice;}).catch(()=>{storageLine.textContent='확인 불가';});
 add(p,row('저장 위치',where),pwaStore?add(el('div',null,'row'),add(el('div',null,'row-main'),el('strong','브라우저 저장 보호'),storageLine,storageAdvice)):null,s.surface==='BROWSER'?row('이 브라우저 탭',mdRole==='OWNER'?'기록 탭 · 연결과 저장 준비가 되어야 서버에 저장':mdRole==='FOLLOWER'?'읽기 전용 탭 · 저장과 동기화는 차단됨':'잠김 · '+(mdUnlockState||'미확인')):s.surface==='APP_SHELL'?row('이 앱 창',mdRole==='OWNER'?'기록 창 · 연결과 저장 준비가 되어야 서버에 저장':mdRole==='FOLLOWER'?'읽기 전용 창 · 저장·동기화·임시 저장은 차단됨':'잠김 · '+(mdUnlockState||'미확인')):null,row('백업 · 복구',backup),hint('잠금해제된 키와 화면 내용은 메모리에만 있습니다.'),s.surface==='WINDOWS'?hint('휴대전화에서 기록한 뒤 이 Windows를 동기화하고, 독립 보관할 cold backup을 만드세요.'):null,tech);
 if(s.surface==='WINDOWS')add(p,el('p',s.recoveryRoot,'path'),button('백업 만들고 종료…',showBackup),button('백업에서 복원…',showRecovery));add(root,p);rosterRetirePending=new Set(Array.isArray(s.devicesRetirePending)?s.devicesRetirePending:[]);if(Array.isArray(s.devices))add(root,renderDeviceRosterPanel(s.devices));if(can('draft-list'))add(root,renderDraftsPanel());}
// B24: 기기 목록 줄의 해제 버튼과 확인 상자. 이 표면이 device-retire를 선언할 때만 보인다. 화면은 키 앞 8자리와 직접 입력한 확인 문구만 보내고,
// 전체 기기 ID·지문은 앱 내부(서비스)가 로컬 로스터에서 찾는다. 결과를 모르는 요청의 intentId도 서비스가 보관하고, 결과 확인은 같은 키 앞 8자리로 한다.
let rosterRetirePending=new Set();
const RETIRE_WARNING='이 기기의 쓰기 권한을 영구히 끝냅니다. 남긴 기록은 지워지지 않습니다.';
function rosterRetireNote(){return can('device-retire')?hint('다른 기기 줄의 "이 기기 권한 해제…"로 그 기기의 쓰기 권한을 끝낼 수 있습니다. 서버 로그인과 최근 인증 앱(TOTP) 확인이 필요하고, "이 기기" 자신은 해제할 수 없습니다.'):hint('해제는 Windows PC 앱(LIFE BRICK)의 설정 화면에서 할 수 있습니다.');}
// B27: 해제 상자의 인증 앱(TOTP) 6자리. 값이 있으면 TOTP 확인 → 해제를 한 번에 하고, 칸은 바로 비운다(코드는 화면·로그·상태 줄에 남기지 않음).
// factor ID는 서버 로그인 칸의 값을 쓰고, 비어 있으면 앱이 계정의 유일한 TOTP factor를 찾는다. 오류는 사람이 읽는 문장 + 괄호 안 기술 코드로 보인다.
let mdTotpFactor=()=>'';
const RETIRE_ERROR_TEXT={RECENT_TOTP_REQUIRED:'최근 5분 안의 인증 앱(TOTP) 확인이 필요합니다 · 해제 상자의 TOTP 6자리 칸에 지금 코드를 넣고 다시 누르세요.',TOTP_PROFILE:'TOTP 코드는 숫자 6자리여야 합니다.',TOTP_FACTOR_NONE:'이 계정에 등록된 인증 앱(TOTP)을 찾지 못했습니다 · 서버 로그인 칸에서 확인하세요.',TOTP_FACTOR_AMBIGUOUS:'인증 앱이 여러 개 등록되어 있습니다 · 서버 로그인 칸의 "TOTP factor ID"에 쓸 것을 넣고 다시 누르세요.',TOTP_FACTOR_REQUIRED:'이 앱 구성에서는 인증 앱 정보를 읽을 수 없습니다 · 서버 로그인 칸에서 TOTP로 로그인한 뒤 다시 누르세요.',AUTH_AAL2_REQUIRED:'서버 로그인이 필요합니다 · 연결 · 장치의 서버 로그인에서 이메일 코드와 인증 앱으로 로그인하세요.',AUTH_EXPIRED:'서버 로그인이 만료되었습니다 · 연결 · 장치에서 다시 로그인하세요.',AUTH_REQUIRED:'서버 로그인이 필요합니다 · 연결 · 장치에서 로그인하세요.',
 B4_TARGET_SESSIONS_CHANGED:'서버가 계산한 그 기기의 장치 연결 기록이 요청과 달라 거절했습니다 · 해제되지 않았습니다 · 잠시 뒤 다시 시도하세요.',B4_TARGET_CHANGED:'그 기기의 서버 상태가 요청과 달라 거절되었습니다(다른 기기에서 이미 해제했을 수 있음) · 해제되지 않았습니다.',B4_RETIRE_STALE:'요청을 만든 뒤 서버 기록이 바뀌었거나 5분이 지나 거절되었습니다 · 해제되지 않았습니다 · 다시 시도하세요.',B4_NON_TARGET_BUSY:'다른 기기가 지금 저장 중이어서 거절되었습니다 · 그 기기의 기록이 끝난 뒤(약 2분) 다시 시도하세요.',B4_NON_TARGET_SESSION_HOLD:'다른 기기의 장치 연결이 진행 중이라 거절되었습니다 · 연결을 끝내거나 취소한 뒤 다시 시도하세요.',B4_SELF_RETIRE_REFUSED:'이 기기 자신은 해제할 수 없습니다.',B4_SELF_OR_AMBIGUOUS_TARGET:'서버 기기 목록에서 그 기기를 하나로 찾지 못했거나 이미 해제된 기기입니다.',
 B24_SELF_RETIRE_REFUSED:'이 기기 자신은 해제할 수 없습니다.',B24_ALREADY_RETIRED:'이미 해제가 확인된 기기입니다.',B24_KEY_CONFIRMATION:'확인란이나 기기 표시값 앞 8자리 입력이 맞지 않습니다.',B24_RETIRE_RESULT_UNKNOWN:'이 기기에 결과를 모르는 해제 요청이 있습니다 · "같은 해제 요청 결과 확인"을 먼저 누르세요.',B24_RETIRE_PENDING_NONE:'결과를 확인할 해제 요청이 없습니다 · 새로 해제를 요청하세요.',B27_RETIRE_ALREADY_REFUSED:'이 요청은 서버가 거절했고 서버에 남지 않았음이 확인되었습니다 · 새로 해제를 요청하세요.',B27_INVENTORY_EXPIRY:'서버가 보낸 장치 연결 기록 형식이 예상과 달라 요청을 만들지 않았습니다 · 앱 업데이트가 필요할 수 있습니다.',MD_PENDING_UNRESOLVED:'결과를 모르는 저장이나 장치 연결이 있어 해제할 수 없습니다 · 먼저 그 결과를 확인하세요.',MD_LOCAL_FOLLOWER_READ_ONLY:'이 창은 읽기 전용이라 해제할 수 없습니다 · 기록 창에서 하세요.'};
function retireErrorText(code){const c=typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(code)?code:'HOLD_CONNECTION';return (RETIRE_ERROR_TEXT[c]||(c.startsWith('B4_')?'서버가 해제 요청을 거절했습니다 · 해제되지 않았습니다':'기기 권한 해제를 끝내지 못했습니다 · 연결을 확인한 뒤 같은 해제 요청 결과부터 확인하세요'))+' · 문의 코드 ▾\u2060'+c+'\u2060';}
async function retireWithTotp(totpInput,call){const code=totpInput.value.trim();totpInput.value='';
 if(code&&!/^\d{6}$/.test(code)){status(RETIRE_ERROR_TEXT.TOTP_PROFILE,true);return;}
 try{if(code)await api('/api/md/totp',{factorId:mdTotpFactor(),code});await afterRosterRetire(await call());}catch(e){await refresh().catch(()=>{});status(retireErrorText(e?.code),true);}}
function retireTotpField(box){const f=field(box,'인증 앱(TOTP) 6자리 · 최근 5분 안에 TOTP로 로그인했으면 비워 두어도 됨','password','');f.autocomplete='one-time-code';f.inputMode='numeric';f.maxLength=6;return f;}
async function afterRosterRetire(r){mdApply(await api('/api/md/status',{}));applyMDLocks();await refresh();status(r.status==='COMMITTED'?'기기 '+r.targetKeyId8+'의 쓰기 권한을 해제했습니다 · 목록에 "해제됨(이 기기가 확인)"으로 표시됩니다.':'기기 '+r.targetKeyId8+' 해제 요청 결과 · '+r.status);}
function rosterRowAction(d){
 if(d.self||d.retired||!can('device-retire'))return null;
 const wrap=el('div'),box=el('div',null,'md-group');
 if(rosterRetirePending.has(d.keyId8)){const again=el('div');const totpAgain=retireTotpField(again);add(wrap,hint('기기 '+d.keyId8+' 해제 요청의 결과를 아직 모릅니다. 새로 요청하지 말고 같은 요청의 결과를 확인하세요. 서버에 없으면 같은 요청을 다시 보내고, 서버가 거절하면 그 요청을 정리해 새로 요청할 수 있게 됩니다.'),again,button('같은 해제 요청 결과 확인',()=>perform(()=>retireWithTotp(totpAgain,()=>api('/api/md/device-retire-reconcile',{targetKeyId8:d.keyId8})))));return wrap;}
 box.hidden=true;
 add(box,el('h3','기기 '+d.keyId8+' 권한 해제'),hint((d.recordCount===null?'쌓인 기록 모름':'쌓인 기록 '+d.recordCount+'건')+' · 마지막 기록 '+(d.lastRecordDate?rosterLastText(d):d.recordCount===0?'없음':'모름')));
 const consent=field(box,RETIRE_WARNING,'checkbox',false),typed=field(box,'확인: 기기 표시값 앞 8자리('+d.keyId8+')를 그대로 입력','text',''),totpCode=retireTotpField(box);
 add(box,add(el('div',null,'buttons'),button('권한 해제 실행',()=>{
  if(!consent.checked||typed.value.trim().toLowerCase()!==d.keyId8){status('확인란이 비어 있거나 입력한 값이 기기 표시값 앞 8자리와 달라 해제하지 않았습니다.',true);totpCode.value='';return;}
  void perform(async()=>{try{await retireWithTotp(totpCode,()=>api('/api/md/device-retire',{targetKeyId8:d.keyId8,confirmText:typed.value,confirmed:consent.checked}));}finally{consent.checked=false;typed.value='';}});
 },'primary'),button('취소',()=>{box.hidden=true;consent.checked=false;typed.value='';totpCode.value='';})));
 add(wrap,button('이 기기 권한 해제…',()=>{box.hidden=!box.hidden;}),box);return wrap;}
// B22: 기기 목록. 이 앱이 이미 가진 로스터·확정 기록에서 계산한 값만 보인다(서버 호출 없음, 이름 저장 없음). 키는 앞 8자리만. B24 해제 버튼은 rosterRowAction이 만든다.
// FIX45 (AUD1 #19): 마지막 기록은 KST로 보인다(기기별 시각 settings.devicesLastAt, 없으면 날짜만). 기록·로스터에 기기 이름 칸이 없어 이름은 "이 기기" 표시뿐이다.
const rosterLastText=d=>{const at=whole?.settings?.devicesLastAt?.[d.deviceId8];return at?new Date(Date.parse(at)+9*3600000).toISOString().slice(0,16).replace('T',' ')+' KST':d.lastRecordDate;};
// FIX57C (Codex F03): 로스터에는 해제 이벤트가 없어 다른 기기의 지금 서버 권한은 이 기기가 알 수 없다. 해제 영수증이 없는 다른 기기는 "권한 미확인"으로 보인다(표시 문구만, 권한 판단은 그대로).
const rosterRoleText=d=>d.retired?'해제됨(이 기기가 확인)':!d.self?'등록된 기기 · 현재 권한 미확인':d.writeRole?'저장 가능한 기기':'저장 가능 여부 모름';
function renderDeviceRosterPanel(devices){const p=section('기기 목록','이 앱이 알고 있는 등록 기기입니다. 기기마다 설정 화면을 열어 "이 기기" 줄을 보면 그 기기가 목록의 어느 줄인지 알 수 있습니다. 다른 기기에서 해제한 기기는 여기서 알 수 없습니다.');p.id='device-roster';add(p,rosterRetireNote());
 for(const d of devices){const parts=['기기 번호 '+d.deviceId8,rosterRoleText(d),d.self?(d.writeReady?'지금 저장 가능':'저장할 때 연결'):'지금 상태 모름',d.recordCount===null?'쌓인 기록 모름':'쌓인 기록 '+d.recordCount+'건','마지막 기록 '+(d.lastRecordDate?rosterLastText(d):d.recordCount===0?'없음':'모름')];
  add(p,row((d.self?'이 기기 · ':'')+'기기 '+d.keyId8,parts.join(' · ')),rosterRowAction(d));}
 return p;}
const DRAFT_TYPE_TEXT={RECORD:'행동 기록',ENTITY:'항목 편집',CORRECTION:'정정'};   // FIX53A: 새 기록 초안은 life-quest의 sealedDraftLabel이 기록 종류·주를 붙인다(값 없음)
// FIX54 (HQ3): 봉인 초안 승인 결과. 같은 칸 충돌이면 금고를 덮지 않고 초안이 남는다(버리기만). 병합 결과가 금고와 같으면 초안만 정리된다.
const SEALED_CONFLICT_TEXT='다른 기기에서 같은 칸이 바뀌어 승인하지 못했어요 · 버리기만 할 수 있어요',SEALED_SAME_DONE_TEXT='이미 같은 값이 쌓여 있어 임시 저장을 정리했어요.';
// FIX58Q (HUNT55 HU2·HQ8): 업데이트 전 초안이 금고가 바뀌어 거절됨(preUpdate), 재시작 뒤 이 초안 값이 한 번 들어갔던 금고(SEALED_MAYBE_APPLIED). 둘 다 버리기만, 값은 보이지 않는다.
// FIX59Q (HUNT57 HU57-2·HQ57-2): 업데이트 전 초안은 기준값으로 병합한다. 기준을 못 구했거나(NO_BASE) 금고에 없던 시험의 응시일만 다르면(DATE) 승인 응답의 초안 내용(draftFields)을 보이고 사용자가 [그대로 적용]·[버리기]를 고른다.
const SEALED_PRE_UPDATE_TEXT='이 임시 저장의 값과 지금 기록이 달라요 — 임시 저장 내용을 보고 [그대로 적용] 또는 [버리기]',SEALED_MAYBE_APPLIED_TEXT='이미 반영됐을 수 있어요 · 쌓인 기록에서 확인한 뒤 버리세요 · 버리기만 할 수 있어요';
const sealedChoice=new Map();   // draftId → 승인 응답의 draftFields(이 화면 메모리만, 목록 응답에는 값이 없다)
const sealedKeptText=d=>d.conflict==='SEALED_MAYBE_APPLIED'?SEALED_MAYBE_APPLIED_TEXT:d.choose||sealedChoice.has(d.draftId)?SEALED_PRE_UPDATE_TEXT:SEALED_CONFLICT_TEXT;
const sealedChoiceText=d=>d.conflict==='SEALED_CONFLICT'&&sealedChoice.has(d.draftId)&&recordsMod?.sealedFieldsText?' · '+recordsMod.sealedFieldsText(sealedChoice.get(d.draftId)):'';
// FIX60Q (HUNT58 Q58-1·Q58-2·HU58-1): 승인 응답에서 이 화면이 본 것(화면 메모리만). 고르기 줄 = 바뀔 칸의 지금 기록 값(currentFields)과 "이 기기의 이전 입력" 표시, 'CONFLICT' = 고르기가 아닌 충돌로 확인됨(버리기만).
// 목록에는 고르기 표시가 없으므로(FIX49-P10 경계) 이 화면이 아직 확인하지 않은 충돌 줄(새 화면)은 [다시 보기]로 승인 응답을 다시 받아 고르기를 다시 불러온다.
const sealedSeen=new Map();
const SEALED_SELF_TEXT='이 기기의 이전 입력과 같은 칸이 달라요 — 지금 기록과 임시 저장 내용을 보고 [그대로 적용] 또는 [임시 저장 폐기]',SEALED_MIXED_TEXT='이 기기의 이전 입력과 다른 기기 변경이 같은 칸에 있어요 — 지금 기록과 임시 저장 내용을 보고 [그대로 적용] 또는 [임시 저장 폐기]',SEALED_RECHECK_TEXT='같은 칸이 달라 아직 쌓지 못했어요 · [다시 확인하고 쌓기]로 임시 저장 내용을 다시 확인하세요',SEALED_CHANGED_TEXT='그사이 지금 기록이 바뀌어 적용하지 않았어요 · 바뀐 지금 기록을 보고 다시 고르세요';
function sealedNote(id,x){if(x.choose===true)sealedSeen.set(id,{current:Array.isArray(x.currentFields)?x.currentFields:[],self:x.previousInput===true,mixed:x.mixedInput===true,token:typeof x.choiceToken==='string'?x.choiceToken:''});else if(x.status==='SEALED_CONFLICT')sealedSeen.set(id,'CONFLICT');else sealedSeen.delete(id);}
const sealedRecheck=d=>d.conflict==='SEALED_CONFLICT'&&!sealedChoice.has(d.draftId)&&sealedSeen.get(d.draftId)!=='CONFLICT';
const sealedRowText=d=>sealedRecheck(d)?SEALED_RECHECK_TEXT:d.conflict==='SEALED_CONFLICT'&&sealedChoice.has(d.draftId)&&sealedSeen.get(d.draftId)?.self?(sealedSeen.get(d.draftId).mixed?SEALED_MIXED_TEXT:SEALED_SELF_TEXT):sealedKeptText(d);
const sealedCurrentText=d=>{const c=sealedChoice.has(d.draftId)?sealedSeen.get(d.draftId)?.current:null;return c?.length&&recordsMod?.sealedFieldsText?' · 지금 기록: '+recordsMod.sealedFieldsText(c).replace(/^임시 저장 내용: /,''):'';};
// FIX63 (Codex Q01): [그대로 적용]은 이 화면이 본 고르기의 표(승인 응답의 토큰)를 함께 보낸다. 서버는 지금 고르기의 표와 다르면 쓰지 않고 다시 고르게 한다.
// 응답이 없거나 오류면 서버가 그사이 다시 고르기를 만들었을 수 있으므로 이 줄의 고르기를 지운다([다시 확인하고 쌓기]만 남음).
const sealedApply=async body=>{try{const x=await api('/api/md/draft-commit',{...body,choiceToken:sealedSeen.get(body.draftId)?.token??''});if(!x||typeof x.status!=='string')throw appError('HOLD_NO_RESPONSE');return x;}catch(e){sealedChoice.delete(body.draftId);sealedSeen.delete(body.draftId);await refresh().catch(()=>{});throw e;}};
const sealedApplyButton=d=>d.conflict==='SEALED_CONFLICT'&&sealedChoice.has(d.draftId)?button('그대로 적용',()=>{if(globalThis.confirm('임시 저장 내용으로 지금 기록을 바꿀까요? 지금 기록의 이전 값은 이력에 남습니다.'))void perform(async()=>{const x=await sealedApply({draftId:d.draftId,confirmed:true,apply:true});if(x.choose===true){sealedChoice.set(d.draftId,x.draftFields);sealedNote(d.draftId,x);await refresh();status(SEALED_CHANGED_TEXT,true);return;}sealedChoice.delete(d.draftId);sealedSeen.delete(d.draftId);lastSave={status:'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED',at:Date.now()};await refresh();status(x.status==='ALREADY_APPLIED'?SEALED_SAME_DONE_TEXT:SAVE_TEXT.VERIFIED+' · 임시 저장 내용으로 바꿨습니다 (서버 버전 v'+x.remoteVersion+')');});}):null;
// 승인하고 쌓기·다시 보기는 같은 승인 길(draft-commit)이다. 응답이 고르기면 바뀔 칸을 이 화면에 보인다.
const approveDraft=d=>perform(async()=>{const x=await api('/api/md/draft-commit',{draftId:d.draftId,confirmed:true});sealedNote(d.draftId,x);if(x.status==='SEALED_MAYBE_APPLIED'){await refresh();status(SEALED_MAYBE_APPLIED_TEXT);return;}if(x.choose===true)sealedChoice.set(d.draftId,x.draftFields);else sealedChoice.delete(d.draftId);if(x.status==='SEALED_CONFLICT'||x.status==='ALREADY_APPLIED'){await refresh();status(x.status==='SEALED_CONFLICT'?sealedRowText({draftId:d.draftId,conflict:'SEALED_CONFLICT'}):SEALED_SAME_DONE_TEXT,x.status==='SEALED_CONFLICT');return;}lastSave={status:'REMOTE_COMMITTED_AND_LOCAL_CONFIRMED',at:Date.now()};await refresh();status(SAVE_TEXT.VERIFIED+' · 임시 저장을 쌓았습니다 (서버 버전 v'+x.remoteVersion+')');});
const sealedAgainButton=d=>sealedRecheck(d)?button('다시 확인하고 쌓기',()=>approveDraft(d)):null;   // 고르기 표시를 잊은 화면(새 화면)의 충돌 줄: 승인 응답을 다시 받아 고르기를 다시 불러온다
// FIX73 (H71-3): 새 시작 전 기록의 임시 저장 줄은 한 줄 안내 + 승인 단추(승인하고 쌓기·그대로 적용·다시 확인하고 쌓기) 숨김. 임시 저장은 지우지 않는다(폐기 단추는 그대로).
// 이미 쌓인 줄(SERVER_COMMITTED)의 정리 단추는 새로 쓰지 않으므로 그대로 둔다. 판정은 draft-list의 날짜 키(fresh, 모의고사는 takenOn).
const sealedFreshHeld=d=>d.status!=='SERVER_COMMITTED'&&draftBeforeFresh(d,FRESH_START);
const sealedDiscardButton=d=>d.status==='LOCAL_DRAFT'?button('임시 저장 폐기',()=>{if(globalThis.confirm('이 기기의 임시 저장을 폐기할까요? 쌓인 기록에는 영향이 없습니다.'))void perform(async()=>{await api('/api/md/draft-discard',{draftId:d.draftId,confirmed:true});await refresh();status('임시 저장을 폐기했습니다.');});}):null;
function renderDraftsPanel(){const p=section('이 기기에 임시 저장된 기록','임시 저장은 쌓인 기록 · 이력 · 진행 · 탑에 들어가지 않습니다. 연결하고 저장 준비를 마친 뒤 하나씩 승인하면 일반 저장 경로로 쌓습니다.'),list=el('div');p.id='drafts-panel';add(p,list);
 void api('/api/md/draft-list',{}).then(r=>{list.replaceChildren(...(r.drafts.length?r.drafts.map(d=>{const held=sealedFreshHeld(d);return row((recordsMod?.sealedDraftLabel?.(d)||DRAFT_TYPE_TEXT[d.type]||d.type)+' · '+d.createdAt.replace('T',' ').slice(0,16),(held?FRESH_TEXT.sealedHeld:d.conflict?sealedRowText(d)+sealedChoiceText(d)+sealedCurrentText(d):PRODUCT_TEXT[d.status]||'처리하지 못했어요')+' · 문의 코드 ▾\u2060'+(d.conflict||d.status)+'\u2060',held?add(el('div',null,'buttons'),sealedDiscardButton(d)):add(el('div',null,'buttons'),sealedApplyButton(d),sealedAgainButton(d),d.conflict==='SEALED_MAYBE_APPLIED'||d.conflict==='SEALED_CONFLICT'?null:button(d.status==='SERVER_COMMITTED'?'쌓인 것 확인 · 임시 저장 정리':'승인하고 쌓기',()=>approveDraft(d)),sealedDiscardButton(d)));}):[empty('임시 저장된 기록이 없습니다.')]));}).catch(e=>list.replaceChildren(empty('임시 저장 목록을 읽지 못했어요'+' · 문의 코드 ▾\u2060'+(e.code||'HOLD')+'\u2060')));return p;}
// S1: 다른 창의 "이 기기에서 로그아웃"으로 이 창이 닫혔을 때(새로고침 없음, 입력은 화면에 남음).
const SIGNED_OUT_ELSEWHERE_TEXT='다른 창에서 이 기기 로그아웃을 해서 이 창도 잠갔습니다 · 입력 중인 내용은 화면에 남아 있지만 저장되지 않았습니다 · 연결 · 장치에서 다시 로그인하세요.';
// S1c (H7-01): 로그아웃으로 금고가 닫히면(다른 창의 로그아웃, 또는 이 창의 로그아웃이 금고를 닫은 뒤 보류됨) 이미 그린 확정 기록 화면을 가리고
// 확정 기록의 메모리 사본(today·whole·changes·일정·건강·공부)을 비운다. 편집 창과 카드 입력(drafts, 초안 상자의 미저장 입력)은 그대로 둔다(S1).
// 다시 잠금해제해 refreshCore가 새로 읽을 때까지 render()는 아무 화면도 그리지 않고, 잠금해제·로그인 칸만 상태 줄 아래에 보인다.
let mdSignedOut=false,mdSignedOutSeq=0;   // seq: 읽기 도중에 잠긴 refreshCore가 잠금을 되돌리지 않게
function signedOutLock(){mdSignedOut=true;mdSignedOutSeq++;if(typeof nativeWidgetClear==='function')nativeWidgetClear();finImport=null;finStmt=null;suggestSt=null;if(typeof clearLeave==='function')clearLeave();/* V7D2: 잠기면 기다리던 비우기는 보내지 않는다 */today=null;whole=null;changes=[];wholeRaw=null;freshRows=[];calendarState=null;planCal=null;if(typeof homeCalRead!=='undefined')homeCalRead.clear();/* CAL2: 오늘 탭 일정 사본 */vaultFlash=null;if(typeof widgetFile!=='undefined')widgetFile.syncAt=null;if(typeof pcWidgetLock==='function')pcWidgetLock();if(typeof icsImportMod!=='undefined'&&icsImportMod)icsImportMod.clearOuter(icsOuterStore());for(const st of [hltSt,studySt])if(st){st.raw=null;st.flowState=null;}$('workspace').hidden=true;$('navigation').hidden=true;if(mdHost&&mdPanel){mdHost.append(mdPanel);mdHost.hidden=false;}$('session-state').textContent='잠김 · 다시 로그인하세요';}   // FIX55C1 (HS1): 위젯 파일의 마지막 동기화 시각도 비운다(다음 프로필에 남지 않게, 그 프로필의 동기화가 성공하면 새로 적힘)
// FIX37C (H37-S2): 잠금 때 공부 타이머 상태를 멈추고 비운다(lockLife, 저장소 쓰기 0), 화면 켜 두기를 놓고, 숨은 화면의 모달과 시트를 닫는다(모달이 남으면 뒤의 로그인 칸이 입력을 못 받는다). 편집 창(#editor)은 S1대로 그대로 둔다.
const signedOutLockBase=signedOutLock;
signedOutLock=function signedOutLock(){signedOutLockBase();lifeUi?.lockLife(lifeSt);chimeCtl?.wake.release();for(const d of document.querySelectorAll('#workspace dialog[open],dialog.lb-sheet[open]'))d.close();};
// B32: 새 기기 등록의 자동 마무리(enroll-finish). 서버가 등록을 확정(terminal)하면 enroll-relay-status는 B4_TERMINAL_RELAY(400)로 거절된다
// (003_b4_lifecycle_v1.sql relay_execute). 예전 코드는 그 오류를 일반 오류로 보고 조용히 폴링을 끝내 enroll-finish가 불리지 않았다.
// 지금은 그것을 "서버가 확정함"으로 읽고 enroll-finish가 서버 receipt를 다시 검증하게 한다. 멈추거나 실패하면 이유와 다음 한 가지 행동을 화면에 보인다.
const ENROLL_NEXT='잠금해제 문구를 다시 넣고 "서버 receipt 확인 · 이 장치 등록 완료"를 누르세요.';
const ENROLL_HOLD_REASON={UNLOCK_SECRET_PROFILE:'잠금해제 문구가 비어 있거나 12자 미만입니다',B4_RECIPIENT_NOT_COMMITTED:'서버가 이 등록을 확정한 기록을 찾지 못했습니다(중단·만료 가능)',RELAY_EXPIRED_OR_TERMINAL:'서버의 등록 세션이 만료되었거나 종료되었습니다',MD_LOCAL_OWNER_BUSY:'다른 LIFE BRICK 창이 이 장치를 쓰고 있습니다',RECENT_TOTP_REQUIRED:'최근 인증 앱(TOTP) 확인이 필요합니다(TOTP 로그인 뒤 다시 시도)'};
const ENROLL_NO_PHRASE_TEXT='서버 등록은 끝났습니다 · 이 장치의 잠금해제 문구가 비어 있어 자동 마무리를 못 합니다 · '+ENROLL_NEXT;
const ENROLL_STALL_TEXT='자동 등록 마무리가 아직 끝나지 않았습니다 · 화면이 백그라운드이거나 서버 확정이 아직일 수 있습니다 · '+ENROLL_NEXT;
const ENROLL_DONE_REFRESH_TEXT='이 장치 등록은 끝났습니다 · 화면을 새로 읽지 못했습니다 · 앱을 닫았다가 다시 여세요';
const ALREADY_ENROLLED_TEXT='이 장치는 이미 등록되어 있습니다';
function enrollHoldText(code){const c=typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(code)?code:'HOLD_CONNECTION';return '자동 등록 마무리가 멈췄습니다 · '+(ENROLL_HOLD_REASON[c]||'연결 또는 서버 응답을 확인하지 못했습니다')+' · '+ENROLL_NEXT+' · 문의 코드 ▾\u2060'+c+'\u2060';}
function alreadyEnrolledText(code,enrolled){return enrolled&&(code==='PAIRING_REQUIRED'||code==='MD_NEW_DEVICE_REQUIRED')?ALREADY_ENROLLED_TEXT+' · 문의 코드 ▾\u2060'+code+'\u2060':null;}
// d: {api, unlock(), clear(), say(text,error), show(text), done()}. 반환: 'WAIT'(계속 폴링) | 'DONE' | 'HOLD'(폴링 종료, 이유를 화면에 보임)
function createEnrollReceiptStep(d){
 let terminal=false;
 return async()=>{
  if(!terminal){
   let r;
   try{r=await d.api('/api/md/enroll-relay-status',{});}
   catch(e){const code=e?.code;
    if(['RELAY_SLOT_ABSENT','RELAY_DRAFT_REQUIRED','RELAY_ACK_PHASE'].includes(code))return 'WAIT';
    if(code!=='B4_TERMINAL_RELAY'){d.say(enrollHoldText(code),true);return 'HOLD';}
    r={status:'COMMITTED'};}
   if(r.status==='OPEN')return 'WAIT';
   if(r.status!=='COMMITTED'){d.say(enrollHoldText('RELAY_EXPIRED_OR_TERMINAL'),true);return 'HOLD';}
   terminal=true;}
  if(d.unlock().length<12){d.show(ENROLL_NO_PHRASE_TEXT);return 'WAIT';}
  try{await d.api('/api/md/enroll-finish',{unlockSecret:d.unlock()});}
  catch(e){d.clear();d.say(enrollHoldText(e?.code),true);return 'HOLD';}
  d.clear();
  try{await d.done();}catch{d.say(ENROLL_DONE_REFRESH_TEXT,true);}
  return 'DONE';
 };
}
// o: {step, say, hidden(), ended(), setInterval, clearInterval, setTimeout, clearTimeout, intervalMs, stallMs}. 끝나지 않은 채 stallMs가 지나면 안내만 보이고 폴링은 계속한다.
function startStepPoll(o){
 let running=false,stopped=false,stall=null;
 const stop=()=>{stopped=true;o.clearInterval(timer);o.clearTimeout(stall);};
 const timer=o.setInterval(async()=>{
  if(stopped||running||o.hidden()||o.ended())return;running=true;
  try{const r=await o.step();if(r==='DONE'||r==='HOLD')stop();}
  catch(e){stop();o.say(enrollHoldText(e?.code),true);}
  finally{running=false;}
 },o.intervalMs);
 stall=o.setTimeout(()=>{if(!stopped)o.say(ENROLL_STALL_TEXT,false);},o.stallMs);
 return stop;
}
// FIX57C (Codex F01): 연결 전 임시 저장 안내. 저널 초안(draft-save)이 있는 곳(PC 앱)은 모든 기록이 임시 저장된다. 없는 곳(Fold·웹)은 카드 임시 입력 상자(card-draft-box의 CARD_DRAFT_KINDS)만 남는다.
const OFFLINE_DRAFT_TEXT={JOURNAL:'연결 전 기록은 이 기기에 임시 저장됩니다.',CARD_ONLY:'연결 전에는 오늘·건강·공부·일기 카드에 적던 입력만 이 기기에 임시로 남아요. 그 밖의 기록은 연결된 뒤 저장해 주세요.'};
const offlineDraftText=()=>can('draft-save')?OFFLINE_DRAFT_TEXT.JOURNAL:OFFLINE_DRAFT_TEXT.CARD_ONLY;
function setupMD(state){
  mdCaps=new Set(state.capabilities??(state.surface==='WINDOWS'?LEGACY_WINDOWS_MD_ROUTES:[]));mdApply(state);
 $('setup').hidden=true;$('setup-form').hidden=true;$('save-exit').hidden=false;
 document.querySelector('.rail-bottom').textContent=state.surface==='BROWSER'?'이 사이트의 브라우저 저장소에 암호화 저장':state.surface==='APP_SHELL'?'이 앱에 암호화 저장 · 연결 시 암호문 동기화':'이 Windows PC에 암호화 저장';
 document.querySelector('footer').textContent=state.surface==='APP_SHELL'?'LIFE BRICK · 이 기기에 암호화 저장 · 연결되면 서버에 암호문만 동기화(백업 아님) · 연결 전 기록은 이 기기에 임시 저장':'LIFE BRICK · 암호화 저장 · 연결되면 서버에 암호문만 동기화(백업 아님)';
 // The connection/device panel is built once. Before unlock it sits under the status line; after unlock it moves
 // into MORE → 연결 · 장치 (DEVICES), so pairing, lease, relay and recovery controls stay out of the daily screens.
 const panel=section('잠금해제와 연결',state.surface==='APP_SHELL'?'잠금해제는 네트워크 없이 됩니다. 연결 전에는 마지막으로 확인된 기록을 보여 주고, 새 기록은 이 기기에 임시 저장됩니다.':'로그인과 잠금해제는 별도 단계입니다. 최신 기록 확인과 저장 준비 전에는 읽기 전용입니다.');panel.id='md-controls';mdPanel=panel;mdHost=el('div');mdHost.id='md-host';$('status').after(mdHost);mdHost.append(panel);
 const productLine=el('p','','path');productLine.id='md-product-state';add(panel,productLine);const restoreLine=el('p','','path');restoreLine.id='md-auth-restore';restoreLine.hidden=true;add(panel,restoreLine);renderProductState();
 const unlockBox=add(el('div',null,'md-group'),el('h3','이 기기 잠금해제')),syncBox=add(el('div',null,'md-group'),el('h3','동기화'),hint('서버 저장 순서: 서버 로그인 → 최신 내용 동기화 → 저장 준비하기(더보기 > 고급). 결과를 모르는 저장이 있으면 새로 저장하지 말고 더보기 > 고급의 "결과 모르는 저장 확인"을 먼저 누르세요.')),advBox=add(el('div',null,'md-group md-advanced-controls'),el('h3','저장 준비'),hint('평소에는 저장할 때 자동으로 처리됩니다. 저장이 막힐 때만 씁니다.'));
 const loginBox=add(el('details',null,'md-group md-login'),el('summary','서버 로그인 · 이메일 코드와 인증 앱(TOTP)'));
  const out=el('pre','','path md-out'),call=async(name,body={})=>{const r=await api('/api/md/'+name,body);out.textContent=JSON.stringify(r,null,2);return r;};
  const doIt=fn=>()=>perform(async()=>{await fn();const s=await api('/api/md/status',{});mdApply(s);applyMDLocks();});
  // B32: 이미 등록이 끝난 앱에서 PAIRING_REQUIRED·MD_NEW_DEVICE_REQUIRED가 나오면 일반 오류 대신 "이미 등록" 문구로 보인다(코드는 괄호에 유지).
  const enrollDo=fn=>doIt(async()=>{try{await fn();}catch(e){const t=alreadyEnrolledText(e?.code,!!(mdScope?.selected||mdUnlocked));if(!t)throw e;status(t,true);out.textContent=t;}});
 const relayPoll=(route,onReady)=>{
  let running=false;const timer=setInterval(async()=>{if(running||document.hidden||ended)return;running=true;
   try{const r=await api('/api/md/'+route,{});
    if(route==='enroll-relay-status'&&r.status==='OPEN')return;
    if(route==='enroll-relay-status'&&r.status==='COMMITTED'&&unlock.value.length<12){out.textContent='서버 등록 완료 · 이 장치 잠금해제 문구를 입력하면 암호화 저장을 마칩니다.';return;}
    clearInterval(timer);await onReady(r);}
   catch(e){if(!['RELAY_SLOT_ABSENT','RELAY_DRAFT_REQUIRED','RELAY_ACK_PHASE'].includes(e.code)){clearInterval(timer);status('장치 연결을 처리하지 못했어요'+(e.code==='RECENT_TOTP_REQUIRED'?' · TOTP 로그인 후 미확정 등록 결과 확인':'')+' · 문의 코드 ▾\u2060'+(e.code||'RELAY_POLL_FAILED')+'\u2060',true);}}
   finally{running=false;}
  },1200);return ()=>clearInterval(timer);
 };
 let stopRequestPoll=null,stopAckPoll=null,stopDraftPoll=null,stopReceiptPoll=null,relayRecipient=false,pairMode=null;
 const email=field(loginBox,'Owner 이메일','email',''),otp=field(loginBox,'이메일 코드','text',''),factor=field(loginBox,'TOTP factor ID','text',''),totp=field(loginBox,'TOTP 코드','password',''),setupKey=field(loginBox,'인증 앱 수동 등록 키','password','');setupKey.readOnly=true;setupKey.parentElement.hidden=true;
 // B27: 저장된 로그인으로 이미 서버 로그인된 경우 "TOTP factor ID"를 서버의 등록 정보(factors)로 채운다(인증 앱이 하나일 때만, 칸이 비어 있을 때만). 실패해도 화면은 그대로.
 const fillFactor=()=>{if(factor.value||!can('totp-factors'))return;void api('/api/md/totp-factors',{}).then(r=>{if(!factor.value&&r?.factors?.length===1)factor.value=r.factors[0].id;}).catch(()=>{});};
 loginBox.addEventListener('toggle',()=>{if(loginBox.open)fillFactor();});if(state.auth?.state&&state.auth.state!=='LOCKED')fillFactor();mdTotpFactor=()=>factor.value.trim();
 add(loginBox,add(el('div',null,'buttons'),button('이메일 코드 요청',doIt(()=>call('email',{email:email.value}))),button('이메일 코드 확인',doIt(async()=>{try{const r=await call('email-code',{email:email.value,code:otp.value});if(r.factors?.length===1)factor.value=r.factors[0].id;}finally{otp.value='';}})),can('totp-enroll')&&button('TOTP 최초 등록',doIt(async()=>{const r=await api('/api/md/totp-enroll',{});factor.value=r.factorId;setupKey.value=r.setupKey;setupKey.parentElement.hidden=false;out.textContent='인증 앱에 설정 키를 등록한 뒤 TOTP 코드를 입력하세요. 설정 키는 저장되지 않습니다.';})),can('totp-enroll')&&button('설정 키 표시',()=>{if(setupKey.value)setupKey.type=setupKey.type==='password'?'text':'password';}),button('TOTP 로그인',doIt(async()=>{try{await call('totp',{factorId:factor.value,code:totp.value});setupKey.value='';setupKey.parentElement.hidden=true;}finally{totp.value='';}}))));
 if(can('first-primary-status')){
  const initial=section('이 Windows에서 처음 시작하기','먼저 이메일 코드와 TOTP로 로그인하세요. 새 잠금 문구와 별도의 복구 문구를 앱에 입력합니다. 문구는 채팅으로 보내지 마세요.');
  const nativeState=el('p','상태 확인 중'),titles=['몸 돌보기','집중하기','정리하기'].map(v=>field(initial,'처음 사용할 행동','text',v));
  const localSecret=field(initial,'이 Windows의 새 잠금 문구 (12자 이상)','password',''),recoverySecret=field(initial,'별도로 보관할 복구 문구 (잠금 문구와 다르게)','password','');
  for(const f of [localSecret,recoverySecret]){f.minLength=12;f.maxLength=1024;f.autocomplete='off';}
  const consent=field(initial,'이 Windows를 첫 장치로 만들거나 표시된 같은 작업만 재개함을 확인합니다','checkbox',false);
  const hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  let firstRequest=hex(),reviewed=null,current=null;const seedPlan=()=>titles.map((f,i)=>({actionId:firstRequest.slice(0,30)+i.toString(16).padStart(2,'0'),title:f.value,active:true,displayOrder:i}));
  const inspect=async()=>{current=await api('/api/md/first-primary-status',{});initial.hidden=current.state==='EXISTING'||current.phase==='ACTIVE_VERIFIED_READ_ONLY';nativeState.textContent=current.hold?'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+current.hold+'\u2060':current.state==='EMPTY'?'새 첫 장치 준비 가능':current.state==='RESERVED'?'같은 초기 설정 재개 · '+current.phase+(current.phase==='RESERVED'?' · 처음 검토한 행동을 동일하게 입력하세요.':''):current.state==='EXISTING'?'기존 등록 정보가 있습니다. 이 기기 잠금해제를 사용하세요.':'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+(current.code||current.state)+'\u2060';};
  add(initial,nativeState,button('초기 설정 내용 검토',doIt(async()=>{await inspect();const resume=current.state==='RESERVED';firstRequest=resume?current.requestId:firstRequest;reviewed=await api('/api/md/first-primary-review',{mode:resume?'RESUME':'CREATE',requestId:firstRequest,seeds:resume&&current.phase!=='RESERVED'?null:seedPlan()});consent.checked=false;nativeState.textContent=resume?'중단된 같은 작업만 재개합니다. 확인란을 선택한 뒤 실행하세요.':'위 행동으로 첫 기록 하나를 만듭니다. 두 문구를 안전하게 보관하고 확인란을 선택하세요.';})),button('확인한 초기 설정 실행 / 재개',doIt(async()=>{if(!reviewed||!consent.checked)throw appError('MD_PRIMARY_CONFIRMATION_REQUIRED');const r=reviewed;reviewed=null;try{await api('/api/md/first-primary-'+(r.mode==='CREATE'?'create':'resume'),{ticket:r.ticket,confirmed:true,unlockSecret:localSecret.value,recoverySecret:r.requiresRecovery?recoverySecret.value:null});await refresh();nativeState.textContent='초기 설정 완료 · 검증된 읽기 전용 상태';}finally{localSecret.value='';recoverySecret.value='';consent.checked=false;}})));
  for(const f of titles)f.addEventListener('input',()=>{reviewed=null;consent.checked=false;});
  panel.append(initial);void inspect().catch(e=>{nativeState.textContent='처리하지 못했어요'+' · 문의 코드 ▾\u2060'+(e.code||'MD_PRIMARY_HOLD')+'\u2060';});
 }
  if(state.profiles?.length>1){const select=field(unlockBox,state.surface==='BROWSER'?'이 사이트의 등록 정보':'이 앱의 등록 정보','select',state.selected??state.profiles[0].id,state.profiles.map(p=>p.id));add(unlockBox,button('등록 정보 선택',doIt(async()=>{await call('select-profile',{id:select.value});finImport=null;finStmt=null;if(select.value!==state.selected)icsImportMod?.clearOuter(icsOuterStore());})));}
  const unlock=field(unlockBox,'이 장치의 잠금해제 비밀문구','password','');unlock.minLength=12;unlock.maxLength=1024;
  const unlockOrReopen=doIt(async()=>{try{const s=await api('/api/vault/unlock',{unlockSecret:unlock.value});if(state.surface==='BROWSER'){void globalThis.lbPwaStorage?.afterUnlock?.();await refresh();status('잠금해제됨 · '+saveState().title);out.textContent=s.localRole==='OWNER'?'기록 탭 · 최신 암호화 기록을 다시 열었습니다. 결과를 모르는 저장이 있으면 그것부터 확인하세요.':'읽기 탭 · 이 기기의 기록만 표시합니다. 동기화·저장·등록은 이 탭에서 차단됩니다.';}else if(state.surface==='APP_SHELL'){await refresh();status('잠금해제됨 · '+saveState().title);out.textContent=s.localRole==='OWNER'?'기록 창 · 암호화 사본을 열었습니다. 동기화 전에는 마지막 검증 기록만 표시합니다. 결과를 모르는 저장이 있으면 그것부터 확인하세요.':'읽기 창 · 다른 LIFE BRICK 창이 저장 중입니다. 이 기기의 기록만 표시하며 동기화·저장·임시 입력은 이 창에서 차단됩니다.';}else out.textContent='잠금해제됨 · 동기화하여 현재 prefix를 확인하세요.';}catch(e){if(e?.code==='MD_ALREADY_UNLOCKED'&&state.surface==='BROWSER'){await refresh();status('잠금해제됨 · '+saveState().title);out.textContent='이 탭의 저장소는 이미 열려 있어 현재 상태를 표시합니다.';}else throw e;}finally{unlock.value='';}});
  add(unlockBox,add(el('div',null,'buttons'),button('이 기기 잠금해제',unlockOrReopen,'primary unlock-button'),can('handoff')?button(state.surface==='BROWSER'?'이 탭으로 가져오기 · 최신 기록 다시 열기':'이 창으로 가져오기 · 최신 기록 다시 열기',unlockOrReopen):null,can('handoff')?button(state.surface==='BROWSER'?'이 탭 끝내기 · 다른 탭으로 넘기기':'이 창 끝내기 · 다른 창으로 넘기기',doIt(async()=>{stopRequestPoll?.();stopAckPoll?.();stopDraftPoll?.();stopReceiptPoll?.();const r=await api('/api/md/handoff',{});mdReady=false;finImport=null;today=null;whole=null;changes=[];wholeRaw=null;freshRows=[];$('view-content').replaceChildren();$('workspace').hidden=true;$('navigation').hidden=true;mdHost.append(panel);mdHost.hidden=false;$('session-state').textContent='가져오기 완료';out.textContent=r.handoffStatus==='HOLD'?'이 창의 저장을 끝냈습니다. 결과 모르는 상태 '+(r.handoffCode||'HOLD')+'를 새 기록 탭에서 같은 요청으로 확인하세요.':'이 창의 저장을 끝냈습니다. 다른 탭에서 보관한 비밀문구로 최신 기록을 다시 여세요.';})):null));add(syncBox,add(el('div',null,'buttons'),button('최신 내용 동기화',doIt(async()=>{await call('sync');await refresh();})),(()=>{const go=button('고급 열기',()=>navigate('ADVANCED'),'secondary nav-link');go.dataset.navOnly='1';return go;})()));add(advBox,add(el('div',null,'buttons'),button('저장 준비하기',doIt(async()=>{await call('acquire');await refresh();})),button('저장 준비 풀기',doIt(async()=>{await call('release');mdReady=false;await refresh();})),button('결과 모르는 저장 확인',doIt(async()=>{await call('reconcile');await refresh();}))));
 if(can('activate')){const confirm=field(advBox,'기존 저장소를 백업한 뒤 여러 기기용 저장소로 전환함을 확인합니다','checkbox',false);add(advBox,button('이 기기를 기준 기기로 전환 / 중단된 전환 재개',doIt(()=>call('activate',{confirmed:confirm.checked}))));}
 let pair=null;if(can('pair-begin')||can('enroll-start')){
 pair=state.surface==='BROWSER'?section('장치 추가 · 안전한 자동 전달','연결 글자는 로컬 QR로만 새 장치에 옮기세요. request/draft/ACK는 세션 전용 암호문 relay로 자동 전달합니다.'):section('장치 추가 · 암호문 relay 자동 전달','PSK가 포함된 연결 글자는 이 PC와 새 장치 사이의 신뢰한 로컬 경로로만 옮기세요. URL·서버·메신저로 보내지 않습니다. request/draft/ACK는 세션 전용 암호문 relay로 자동 전달합니다.');
 add(pair,add(el('div',null,'buttons'),can('relay-client-preflight')?button('Relay 클라이언트 사전점검',doIt(()=>call('relay-client-preflight'))):null,can('pair-relay-probe')?button(state.surface==='BROWSER'?'기존 장치 서버 relay 사전점검':'서버 relay 사전점검',doIt(()=>call('pair-relay-probe'))):null));
 const pairingText=field(pair,'Pairing text','textarea',''),requestText=field(pair,'새 장치 request text','textarea',''),fingerprint=field(pair,'두 화면에서 대조한 fingerprint','text',''),draft=field(pair,'승인 draft JSON','textarea',''),ack=field(pair,'새 장치 possession ACK JSON','textarea','');
 const consent=field(pair,'새 장치 확인 코드(fingerprint)와 등록을 명시적으로 확인합니다','checkbox',false);
 const parse=n=>{try{return JSON.parse(n.value);}catch{throw appError('MD_PAIR_JSON');}};
 const saveTransfer=async(route,filename)=>{const r=await api('/api/md/'+route,{});if(typeof r.text!=='string'||!r.text.length)throw appError('MD_TRANSFER_EXPORT');const blob=new Blob([new TextEncoder().encode(r.text)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status(filename+' 저장됨');};
 const importTransfer=(label,target,route,kind)=>{const input=el('input');input.type='file';input.accept='.txt,text/plain';input.hidden=true;input.addEventListener('change',async()=>{try{const file=input.files?.[0];if(!file||file.size<1||file.size>1_000_000)throw appError('MD_TRANSFER_SIZE');const bytes=new Uint8Array(await file.arrayBuffer()),value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),roundtrip=new TextEncoder().encode(value);if(value.charCodeAt(0)===0xfeff||roundtrip.length!==bytes.length||!bytes.every((b,i)=>b===roundtrip[i]))throw appError('MD_TRANSFER_ENCODING');let body;if(kind==='request'){if(!/^[A-Za-z0-9_-]+$/.test(value))throw appError('MD_TRANSFER_TYPE');body={requestText:value};}else{let parsed;try{parsed=JSON.parse(value);}catch{throw appError('MD_TRANSFER_TYPE');}if(JSON.stringify(parsed)!==value)throw appError('MD_TRANSFER_ENCODING');body=kind==='draft'?{draft:parsed}:parsed;}await api('/api/md/'+route,body);target.value=value;status(label+' 검증·가져오기 완료');}catch(e){status('파일 거부 · '+(e.code||'MD_TRANSFER_FILE'),true);}finally{input.value='';}});pair.append(input);return button(label,()=>input.click());};
 const fileTransfer=can('pair-draft-export');
 const requestImport=fileTransfer?importTransfer('새 장치 request 파일 가져오기',requestText,'pair-inspect','request'):null,draftImport=fileTransfer?importTransfer('승인 draft 파일 가져오기',draft,'enroll-inspect-draft','draft'):null,ackImport=fileTransfer?importTransfer('Android ACK 파일 가져오기',ack,'pair-inspect-ack','ack'):null;
 if(can('pair-begin'))add(pair,el('h3','기존 승인 장치'),add(el('div',null,'buttons'),button('기기 연결 시작 (Pairing)',doIt(async()=>{
  if(state.surface!=='BROWSER'){stopRequestPoll?.();stopAckPoll?.();}
  const r=await api('/api/md/pair-begin',{confirmed:consent.checked});pairMode='RELAY';pairingText.value=r.pairingText;consent.checked=false;
  if(state.surface==='BROWSER')out.textContent='로컬 QR을 새 장치로 스캔하세요. 원래 만료시각: '+new Date(r.expiresAt).toLocaleTimeString();
  else{requestText.value='';fingerprint.value='';draft.value='';ack.value='';out.textContent='연결 글자를 신뢰한 로컬 경로로 새 장치에 옮기세요. 원래 만료시각: '+new Date(r.expiresAt).toLocaleTimeString()+'\n새 장치 request를 relay에서 기다립니다.';}
  stopRequestPoll?.();stopRequestPoll=relayPoll('pair-request-poll',x=>{fingerprint.value=x.fingerprint;out.textContent='새 장치 fingerprint: '+x.fingerprint+'\n새 장치 화면과 전체 대조한 뒤 명시적으로 승인하세요.';});
 })),button(state.surface==='BROWSER'?'확인 코드 대조 후 연결 승인 (HPKE)':'확인 코드 대조 후 연결 승인 · 승인 자료 전달 (HPKE)',doIt(async()=>{
  const r=await api('/api/md/pair-approve',{requestText:pairMode==='MANUAL'||state.surface==='BROWSER'?requestText.value:'',fingerprint:fingerprint.value,confirmed:consent.checked});draft.value=JSON.stringify(r);consent.checked=false;
  if(pairMode==='MANUAL'){out.textContent='수동 진단 경로 · 승인 draft를 신뢰한 경로로 새 장치에 옮기세요.';return;}
  out.textContent='승인 draft를 새 장치에 자동 전달했습니다. ACK와 서버 receipt를 기다립니다.';
  stopAckPoll?.();stopAckPoll=relayPoll('pair-ack-poll',x=>{pairMode=null;out.textContent='등록 확정 · receipt '+x.receipt.approvalId+' · relay '+x.relayTerminal;status('서버 등록과 relay 종료 확인');resyncAfterPairing();});
 })),button('승인 draft 전송 재확인',doIt(()=>call('pair-publish-draft'))),can('pair-relay-status')&&state.surface!=='BROWSER'?button('Relay 상태 확인',doIt(()=>call('pair-relay-status'))):null,button('미확정 등록 결과 확인',doIt(()=>call('pair-reconcile'))),can('pair-diagnostic')?button('미완료 등록 상태 확인',doIt(()=>call('pair-diagnostic'))):null,button(state.surface==='BROWSER'?'만료된 요청 안전 종료':'만료된 등록 세션 안전 종료',doIt(async()=>{if(state.surface!=='BROWSER'){stopRequestPoll?.();stopAckPoll?.();}await call('pair-relay-abort-unapproved');pairMode=null;resyncAfterPairing();})),can('pair-abort-expired')?button('만료된 미전송 등록 안전 종료',doIt(async()=>{await call('pair-abort-expired');resyncAfterPairing();})):null));
 if(can('pair-begin-manual')){const manual=el('details'),manualButtons=el('div',null,'buttons');
  add(manual,el('summary','진단용 수동 전달 · relay 장애 시 fallback'),hint('정상 등록에는 필요하지 않습니다. 수동 경로는 request·draft·ACK를 모두 원래 600초 안에 옮겨야 합니다.'),manualButtons);
  add(manualButtons,button('수동 기기 연결 시작 (Pairing · 중계 없음)',doIt(async()=>{stopRequestPoll?.();stopAckPoll?.();const r=await api('/api/md/pair-begin-manual',{confirmed:consent.checked});pairMode='MANUAL';pairingText.value=r.pairingText;consent.checked=false;})),button('Request 확인',doIt(async()=>{const r=await call('pair-inspect',{requestText:requestText.value});out.textContent='확인 코드 (Fingerprint): '+r.fingerprint;})),button('ACK 받아 서버 등록',doIt(async()=>{await call('pair-commit',parse(ack));pairMode=null;})));
  add(pair,manual);}
 const recoveryPath=state.surface==='WINDOWS'?field(pair,'원래 encrypted recovery-authority .lbw의 전체 경로','text',''):null;
 if(can('enroll-start'))add(pair,el('h3','새 장치'),add(el('div',null,'buttons'),button('새 identity와 request 생성',enrollDo(async()=>{
  const r=await api('/api/md/enroll-start',{pairingText:pairingText.value,...(can('enroll-resume')?{unlockSecret:unlock.value}:{})});requestText.value=r.requestText;fingerprint.value=r.fingerprint;relayRecipient=r.relay===true;consent.checked=false;
  out.textContent='요청 전달 완료 · 확인 코드(fingerprint) '+r.fingerprint+'\n기존 장치와 전체 값을 대조하세요.';
  if(relayRecipient){stopDraftPoll?.();stopDraftPoll=relayPoll('enroll-draft-poll',x=>{out.textContent='승인 draft 검증 완료 · '+x.approvalId+'\n장치 전용 잠금해제 문구를 입력하고 확인 코드(fingerprint)를 대조한 뒤 등록을 승인하세요.';});}
 })),button('확인 코드(Fingerprint) 대조 · ACK 생성 · 등록',enrollDo(async()=>{
  const r=await api('/api/md/enroll-approve',{draft:relayRecipient?null:parse(draft),fingerprint:fingerprint.value,confirmed:consent.checked});ack.value=JSON.stringify(r);consent.checked=false;
  out.textContent='ACK 전달 완료 · 서버 receipt를 기다립니다.';
  if(relayRecipient){stopReceiptPoll?.();stopReceiptPoll=startStepPoll({intervalMs:1200,stallMs:90000,hidden:()=>document.hidden,ended:()=>ended,setInterval:globalThis.setInterval.bind(globalThis),clearInterval:globalThis.clearInterval.bind(globalThis),setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis),say:status,
   step:createEnrollReceiptStep({api,unlock:()=>unlock.value,clear:()=>{unlock.value='';},say:status,show:t=>{out.textContent=t;},done:async()=>{pairingText.value='';requestText.value='';draft.value='';ack.value='';await refresh();status('이 장치 등록 · prefix 동기화 완료');}})});}
 })),button('서버 receipt 확인 · 이 장치 등록 완료',enrollDo(async()=>{try{await call('enroll-finish',{unlockSecret:unlock.value,...(recoveryPath?{encryptedRecoveryPath:recoveryPath.value}:{})});pairingText.value='';requestText.value='';draft.value='';ack.value='';await refresh();}finally{unlock.value='';}}))));
 if(can('enroll-resume')){const pendingId=field(pair,'중단된 등록 세션 ID','text','');add(pair,button('보관된 등록 세션 목록',doIt(()=>call('enroll-pending-list'))),button('같은 세션 다시 열기',doIt(async()=>{try{const r=await api('/api/md/enroll-resume',{pairSessionId:pendingId.value,unlockSecret:unlock.value});requestText.value=r.requestText;fingerprint.value=r.fingerprint;relayRecipient=r.relay;out.textContent=r.ackReady?'보관된 ACK를 다시 전송하거나 서버 결과를 확인하세요.':'원래 요청과 fingerprint를 다시 열었습니다.';}finally{unlock.value='';}})),button('보관된 ACK 다시 전송',doIt(()=>call('enroll-publish-ack'))));}
 if(can('pair-cancel')){const cancel=field(pair,'현재 등록 세션 종료를 확인합니다','checkbox',false);add(pair,button('현재 세션 종료',doIt(async()=>{await call('pair-cancel',{confirmed:cancel.checked});stopRequestPoll?.();stopAckPoll?.();pairMode=null;cancel.checked=false;resyncAfterPairing();})));}
 if(fileTransfer){const diagnostics=el('details'),diagnosticButtons=el('div',null,'buttons');
 add(diagnostics,el('summary','진단용 파일 전달'),diagnosticButtons);
 add(diagnosticButtons,requestImport,button('승인 draft 파일 저장',()=>void perform(()=>saveTransfer('pair-draft-export','life-brick-approval.txt'))),ackImport,button('새 장치 request 파일 저장',()=>void perform(()=>saveTransfer('enroll-request-export','life-brick-request.txt'))),draftImport,button('ACK 파일 저장',()=>void perform(()=>saveTransfer('enroll-ack-export','life-brick-ack.txt'))));
 add(pair,diagnostics);}
 }
 let retirement=null;if(can('device-retire')){retirement=section('분실·고장 장치 교체','다른 승인 장치가 이 기록을 계속 사용할 수 있습니다. 이 장치 자체를 교체하려면 새 장치를 먼저 등록하고 열어 확인하세요.');const target=field(retirement,'종료할 장치 번호','text',''),targetPin=field(retirement,'종료할 장치 전체 고유값','text',''),retireConsent=field(retirement,'위 장치 하나의 권한 종료를 확인합니다','checkbox',false),retireIntent=field(retirement,'결과 모르는 종료 요청 번호','text','');add(retirement,button('현재 장치와 세션 확인',doIt(()=>call('lifecycle-state'))),button('선택한 장치 권한 종료',doIt(async()=>{try{await call('device-retire',{targetDeviceId:target.value,targetFingerprint:targetPin.value,reason:'USER_REPLACEMENT',confirmed:retireConsent.checked});}finally{retireConsent.checked=false;}})),button('같은 종료 요청 결과 확인',doIt(()=>call('device-retire-reconcile',{intentId:retireIntent.value}))));}
 let loss=null;if(can('freeze')){loss=SHOW_GENERAL_FREEZE?section('분실 장치 차단 · 쓰기 동결','이미 내려받은 키와 내용을 회수할 수 없습니다. 동결 뒤에는 모든 새 기록을 차단하며 자동 재키·해제를 하지 않습니다.'):section('분실 장치 동결 · 복구 권한','이 빌드는 일반 동결 버튼을 숨겼습니다. 분실 장치 동결은 아래 별도 복구 권한으로만 합니다. 이미 내려받은 키와 내용을 회수할 수 없고, 동결 뒤에는 모든 새 기록을 차단하며 자동 재키·해제를 하지 않습니다.');
 const lost=field(loss,'분실 장치 번호','text',''),freezeConsent=field(loss,'장치 차단과 기록 전체 쓰기 동결을 확인합니다','checkbox',false);let freezeId=null;
 // D-ONEWAY: 출하 UI에서 일반 동결 버튼만 의도적으로 숨긴다. freeze 경로·서버 규칙·복구 동결(recovery-freeze)은 그대로다.
 if(SHOW_GENERAL_FREEZE)add(loss,button('분실 장치 차단 및 쓰기 동결',doIt(async()=>{freezeId??=uid();await call('freeze',{freezeId,lostDeviceId:lost.value,confirmed:freezeConsent.checked});mdReady=false;applyMDLocks();})));
 if(can('recovery-begin')){
  const rec=section('별도 복구 권한으로 읽기 전용 등록','새 Windows 대상에서만 사용합니다. 신뢰한 최신 public roster/head가 필요하며 오래된 증거는 거부합니다. 복구 권한은 이 PC 메모리에서만 엽니다.'),rp=field(rec,'복구 권한 .lbw 경로','text',''),rs=field(rec,'복구 비밀문구','password',''),current=field(rec,'신뢰한 currentState JSON','textarea',''),rc=field(rec,'새 identity 복구 등록을 확인합니다','checkbox',false);
  add(rec,button('복구 권한 검증 · 새 identity 준비',doIt(async()=>{try{await call('recovery-begin',{encryptedRecoveryPath:rp.value,recoverySecret:rs.value,currentState:parse(current),confirmed:rc.checked});}finally{rs.value='';}})),button('복구 권한으로 분실 장치 동결',doIt(()=>call('recovery-freeze',{lostDeviceId:lost.value,confirmed:freezeConsent.checked}))),button('읽기 전용 복구 등록 확정 / 재개',doIt(async()=>{try{await call('recovery-finish',{unlockSecret:unlock.value});await refresh();}finally{unlock.value='';}})));add(loss,rec);
 }
 }
  const pairBox=pair?add(el('details',null,'md-group md-advanced'),el('summary','장치 추가 · 새 장치 등록'),pair):null,lossBox=loss&&(SHOW_GENERAL_FREEZE||can('recovery-begin'))?add(el('details',null,'md-group md-advanced'),el('summary','분실 장치 차단 · 복구 (고급)'),loss):null;
  if(state.unlockState==='NO_LOCAL_PROFILE'){loginBox.open=true;if(pairBox)pairBox.open=true;}
  add(panel,unlockBox,loginBox,syncBox,advBox,pairBox,retirement,lossBox,out);status(state.unlockState==='NO_LOCAL_PROFILE'?(state.surface==='APP_SHELL'?(can('first-primary-status')?'이 Windows 앱 데이터 폴더에 등록 정보가 없습니다. 첫 장치라면 위의 «이 Windows에서 처음 시작하기»를 사용하세요. 기존 장치에 추가하는 경우에는 연결 글자로 등록하세요.':'이 앱 데이터 폴더에 등록 정보가 없습니다. 기존 승인 장치의 연결 글자와 이 장치의 잠금해제 문구로 등록하세요.'):'이 브라우저 저장소에 선택할 수 있는 등록 정보가 없습니다. 새 등록 전에 기존 사이트 저장소 상태를 확인하세요.'):state.unlockState==='PROFILE_SELECTION_REQUIRED'?'등록 정보를 명시적으로 선택한 뒤 잠금해제하세요.':state.surface==='APP_SHELL'?(state.product?.serverSync==='SERVER_SYNC_NOT_PROVISIONED'?'잠금해제하면 바로 오늘 할 일을 볼 수 있습니다(네트워크 불필요). 이 앱은 서버 동기화가 설정되지 않아 새 기록은 이 기기에 임시 저장만 됩니다.':'잠금해제하면 바로 오늘 할 일을 볼 수 있습니다(네트워크 불필요). 서버 저장은 서버 로그인 → 동기화 → 저장 준비하기 뒤에 됩니다.'):'로그인 → 잠금해제 또는 새 장치 등록 → 동기화 → 저장 준비하기');
 const suspend=()=>{mdReady=false;applyMDLocks();void api('/api/md/suspend',{}).catch(()=>{});status('읽기 전용 · 다시 동기화하고 저장 준비를 하세요. '+offlineDraftText());};
 addEventListener('offline',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});addEventListener('life-brick-md-state',()=>{mdReady=false;applyMDLocks();});addEventListener('life-brick-md-state',e=>{const st=e?.detail?.state;if(st!=='SIGNED_OUT_ELSEWHERE'&&st!=='SIGNED_OUT_HOLD')return;mdUnlocked=false;mdDraftReady=false;void cardBox?.lock?.();applyMDLocks();signedOutLock();const say=()=>{if(st==='SIGNED_OUT_ELSEWHERE')status(SIGNED_OUT_ELSEWHERE_TEXT,true);};void api('/api/md/status',{}).then(s=>{mdApply(s);applyMDLocks();say();},say);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void mdAutoSync('resume');});addEventListener('online',()=>void mdAutoSync('online'));
}
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const entityId=()=>uid().slice(0,32);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v)))),b=>b.toString(16).padStart(2,'0')).join('');
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;}
function add(parent,...nodes){parent.append(...nodes.filter(Boolean));return parent;}
function button(text,fn,cls='secondary'){const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;}
function hint(text){return el('p',text,'muted small');}
function badge(value){return el('span',LABEL[value]||value,'tag '+value);}
function section(title,sub){return add(el('section',null,'panel'),el('h2',title,'panel-title'),sub?hint(sub):null);}
function empty(text){return el('p',text,'empty');}
function row(title,detail,action){return add(el('div',null,'row'),add(el('div',null,'row-main'),el('strong',title),detail?hint(detail):null),action);}
function metric(label,value,foot){return add(el('article',null,'metric-card'),el('div',label,'metric-label'),el('div',value,'metric-value'),el('div',foot||'','metric-foot'));}
function domainName(code){return whole.domains.find(d=>d.code===code)?.name||'미분류';}
function money(value,currency=whole.finance.currency){return value===null||value===undefined?'모름':value.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(currency==='KRW'?'원':' '+(currency||''));}
function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
// V6F (MAN2 5): 한 화면에만 맞는 안내(예: 명세서 칸 짝 기억)는 그 화면을 떠나면 지운다. 그 사이 다른 안내로 바뀌었으면 그대로 둔다.
let screenNote=null;
function screenStatus(message){status(message);screenNote=message;}
function clearScreenNote(){if(screenNote!==null&&$('status').textContent===screenNote)status('');screenNote=null;}
// FIX45 (AUD1 #10): 오류 문구의 원문 코드는 접어 둔다. 문구를 만드는 쪽은 글자 뒤에 " · 문의 코드 ▾" + U+2060 + 코드 + U+2060만 붙이고(모듈 의존 없음), 화면에 들어오는 순간 여기서 눌러 펼치는 칸으로 바꾼다. 문구 자체와 저장 동작은 바꾸지 않는다.
function splitErrorCode(text){const m=/ · 문의 코드 ▾⁠([^⁠]*)⁠/.exec(text);return m?{text:text.slice(0,m.index)+text.slice(m.index+m[0].length),code:m[1]}:null;}
function foldErrorText(node){for(let s=splitErrorCode(node.nodeValue);s&&node.parentNode;s=splitErrorCode(node.nodeValue)){node.nodeValue=s.text;node.parentNode.insertBefore(add(el('details',null,'err-code'),el('summary','문의 코드 ▾'),el('code',s.code)),node.nextSibling);}}
function foldErrorCodes(root){if(!root.textContent?.includes('⁠'))return;if(root.nodeType===3){foldErrorText(root);return;}const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),hits=[];for(let n=walk.nextNode();n;n=walk.nextNode())if(n.nodeValue.includes('⁠'))hits.push(n);hits.forEach(foldErrorText);}
new MutationObserver(list=>{for(const r of list){if(r.type==='characterData')foldErrorCodes(r.target);else r.addedNodes.forEach(foldErrorCodes);}}).observe(document.body,{childList:true,subtree:true,characterData:true});
// whole-life-model.mjs가 저장을 거절할 때 쓰는 코드 중, 입력을 고치면 바로 다시 시도할 수 있는 것들(아무것도 쓰이지 않았고,
// 다른 기기·동기화 상태와는 무관함). fail()은 이 코드들을 mdProfile의 "저장·연결 보류" 기본 문구로 보내지 않고
// errorText()의 한국어 문구를 편집 창 안에 바로 보여준다. STALE_HEADS·DELETE_CONFIRMATION_REQUIRED처럼 다른 기록과
// 얽힌 것, HOLD_*처럼 확정 여부가 불확실한 것은 포함하지 않는다(기존의 신중한 경로를 그대로 탄다).
const MODEL_VALIDATION_CODES=new Set(['INVALID_TEXT','DEFERRED_REASON_REQUIRED','INVALID_DECIMAL_AMOUNT','FINANCE_ITEMS_REQUIRED','UNSAVED_ACTION_DRAFT']);
MODEL_VALIDATION_CODES.add(FRESH_READ_ONLY);   // V7D1: 새 시작 전 기록 쓰기 거절(아무것도 쓰이지 않음 = 편집 창 안 문구, 저장·연결 보류로 가지 않음)
function lock(value){busy=value;for(const n of document.querySelectorAll('button,input,textarea,select')){if(value&&!n.disabled){n.disabled=true;n.dataset.busyLock='1';}else if(!value&&n.dataset.busyLock){n.disabled=false;delete n.dataset.busyLock;}if(ended)n.disabled=true;}applyMDLocks();}
function appError(code){return Object.assign(new Error(code),{code});}
// ---- 건강 모듈(B3): 화면 모듈을 동적으로 불러온다. 이 빌드가 그 파일을 내주지 않으면(PC 제품 호스트의 정적 파일 목록에는 아직 없음) 불러오지 못해 건강 메뉴·설정이 나타나지 않는다(앱 나머지는 영향 없음). B38부터 기본 켜짐(저장값 없음=켜짐).
let hltUi=null,hltSt=null;
import('./hlt-ui.mjs').then(m=>{hltUi=m;hltSt=m.createHealthState();if(hltOn()&&!$('workspace').hidden)void render();}).catch(()=>{hltUi=null;});
const hltOn=()=>hltUi!==null&&hltUi.hltEnabled(globalThis.localStorage);
// ---- 공부 모듈(B4): 건강 모듈과 같은 방식(동적 import, B38부터 기본 켜짐, 스위치는 기기별 로컬). 같은 ctx(hltCtx)를 쓴다.
let studyUi=null,studySt=null;
import('./study-ui.mjs').then(m=>{studyUi=m;studySt=m.createStudyState();if(hashView&&studyOn()){view=hashView;hashView=null;}if(studyOn()&&!$('workspace').hidden)void render();}).catch(()=>{studyUi=null;});
const studyOn=()=>studyUi!==null&&studyUi.studyEnabled(globalThis.localStorage);
// FIX45 (AUD1 #6): 공부 화면 맨 위 통계. 못 불러오면 그 칸만 없다(공부 화면은 그대로). 일요일 알림(#study-stats)은 이 화면으로 온다(알림 목적지는 웹 값이라 APK 변경 0).
let studyStatsMod=null;
import('./study-stats.mjs').then(m=>{studyStatsMod=m;if(!$('workspace').hidden&&view==='STUDY')void render();}).catch(()=>{studyStatsMod=null;});
function studyStatsCard(root){studyStatsMod?.renderStudyStats(root,{document,life:whole?.life??null,study:whole?.study??null,today:kstDay(),openWeekPlan:lifePlan?()=>{planSt.view='WEEK';navigate('PLANS');}:null});}
const HASH_ROUTES=Object.freeze({'#study-stats':'STUDY','#week-review':'HOME'});
const WIDGET_ROUTES=Object.freeze({'#w-study':'STUDY','#w-today':'HOME'});   // P4C: 홈 위젯 단추(widget-summary.mjs WIDGET_TABS). 공부 화면은 열기만 한다(공부를 저절로 시작하지 않음)
// FIX49D (D49 7.1): 일요일 알림(#week-review)은 오늘 화면을 그린 뒤 주간 리뷰 시트를 연다(weekReviewCard가 한 번 열고 지운다). 쓰기 문이 닫혀 있으면 열지 않는다.
let weekReviewMod=null,weekReviewAsk=false;
import('./week-review.mjs').then(m=>{weekReviewMod=m;if(!$('workspace').hidden&&['HOME','PLANS'].includes(view))void render();}).catch(()=>{weekReviewMod=null;});
function weekReviewCard(){if(!weekReviewMod)return null;const ctx=lifeCtx();if(weekReviewAsk){weekReviewAsk=false;if(weekReviewMod.reviewDoorOpen(ctx))weekReviewMod.openWeekReview(ctx);}return weekReviewMod.renderWeekReviewEntry(ctx);}
function hashRoute(){try{const hash=location.hash,next=HASH_ROUTES[hash]??WIDGET_ROUTES[hash]??null;if(next){history.replaceState(null,'',location.pathname+location.search);if(hash==='#week-review')weekReviewAsk=true;}return next;}catch{return null;}}   // 주소에서 지운다(같은 알림을 다시 눌러도 hashchange가 온다)
let hashView=hashRoute();
addEventListener('hashchange',()=>{const next=hashRoute();if(!next)return;if(next==='STUDY'&&!studyOn())hashView=next;else if($('workspace').hidden)view=next;else navigate(next);});
// ---- 오늘 화면 Core(B41): 습관·공부 벽돌·기분을 하루 카드(LIFE_DAY)에 모은다. 열기·동기화만으로는 쓰지 않고, 입력은 이 기기의 임시 저장(연산 0), '오늘 쌓기'가 연산 1.
let lifeUi=null,lifeSt=null,lifeTower=null,towerSt=null,towerSheet=null,uiKit=null;
Promise.all([import('./life-tower.mjs'),import('./ui-kit.mjs')]).then(([m,k])=>{lifeTower=m;towerSheet=k.sheet;uiKit=k;towerSt=m.createTowerState();if(!$('workspace').hidden&&view==='PROGRESS')void render();}).catch(()=>{lifeTower=null;});
// ---- 지식 우주(B49): 탑 탭의 두 번째 보기. 기존 공부 카드의 오답을 읽어 그리기만 한다(저장·연산 0). 못 불러오면 탑만 보인다.
let universeView=null;
import('./universe-view.mjs').then(m=>{universeView=m;if(!$('workspace').hidden&&view==='PROGRESS')void render();}).catch(()=>{universeView=null;});
// ---- 상태 화면(AV2): 탑 탭의 보기 하나. 공부 기록을 계산해 등급·오늘 효과를 그리기만 한다(저장·연산 0). 못 불러오면 안내문만 보인다.
let statusView=null;
import('./status-view.mjs').then(m=>{statusView=m;if(!$('workspace').hidden&&(view==='STATUS'||view==='SETTINGS'))void render();}).catch(()=>{statusView=null;});
// ---- 계획 탭(B43): 일·주·월·연·수능까지 계획표. 보기만 하고, 쓰기는 계획 시트의 "저장" 버튼(PLAN_DAY 1개 = 연산 1)뿐이다.
let lifePlan=null,planSt=null;
import('./life-plan.mjs').then(m=>{lifePlan=m;planSt=m.createPlanState(globalThis.localStorage);if(!$('workspace').hidden&&['PLANS','HOME'].includes(view))void render();}).catch(()=>{lifePlan=null;});
// ---- Fold 네이티브 다리(B44B): window.LifeBrickNative가 있을 때만 동작(PC·iPad·브라우저에서는 nativeBr.available()가 거짓이라 아무것도 안 함).
// 결제 알림 → 지출 초안은 보여주기만 하고(연산 0), 가계부 거래는 사용자가 거래 입력의 "저장"을 눌러야 만들어진다. 이 기기 설정(알림 토글 등)은 native-bridge.mjs 안에서만 저장한다.
let nativeUi=null,nativeBr=null,nativeLife=null,nativeSeen=-1;
Promise.all([import('./native-bridge.mjs'),import('./life-model.mjs')]).then(([m,l])=>{nativeUi=m;nativeLife=l;nativeBr=m.createNativeBridge({native:globalThis.LifeBrickNative});nativeResume();}).catch(()=>{nativeUi=null;nativeBr=null;nativeLife=null;});
const nativeOn=()=>nativeUi!==null&&nativeBr!==null&&uiKit!==null&&nativeBr.available();
const nativeStacked=()=>whole?.life?.days?.some(d=>d.date===whole.localDate)===true;
const nativeBedtime=()=>whole?.life?.habits?.find(x=>x.data?.id==='hb-sleep')?.data?.target?.time??'24:00';
// 캘린더 거울(P1D2): 토글을 켠 Fold에서만 쓴다. 계획 저장 직후 그 날만, 계획 탭을 열 때 하루 한 번 2주치. 거울 오류가 저장·화면을 막지 않는다.
const nativeMirrorViews=()=>({life:whole.life??null,events:whole.events,subjects:nativeLife.lifeDefs(whole.life).subjects,today:whole.localDate});
const nativeMirrorOn=()=>nativeOn()&&nativeBr.mirrorPrefs().on;
function nativeMirrorDay(date){if(!nativeOn()||!whole)return;try{nativeBr.mirrorSync({...nativeMirrorViews(),dates:[date]});}catch{/* 저장은 이미 끝났다 */}}
function nativeMirrorDaily(){if(!nativeOn()||!whole)return;try{nativeBr.mirrorDaily(nativeMirrorViews());}catch{/* 화면은 계속 그린다 */}}
// 앱을 열 때·화면으로 돌아올 때: 초안 목록을 다시 읽고 알림 예약을 다시 맞춘다(전체 교체). 건수가 바뀌었고 오늘 탭이면 다시 그린다.
function nativeResume(){
 if(!nativeOn()||!whole)return;
 try{nativeBr.refreshDrafts();const prefs=nativeBr.reminderPrefs();if(Object.values(prefs).some(x=>x.on))nativeBr.pushReminders({stackedToday:nativeStacked(),bedtime:nativeBedtime()});}catch{/* 다리 오류가 화면을 막지 않는다 */}
 const n=nativeBr.pending().length;if(n!==nativeSeen&&view==='HOME'&&!$('workspace').hidden){nativeSeen=n;void render();}else nativeSeen=n;
 nativeWidget(true);
}
// 홈 위젯(P4C): 쌓인 기록을 다시 읽은 뒤·앱을 열거나 돌아올 때 숫자 요약(widget-summary.mjs)을 다리로 넘긴다. 같은 기록·같은 날이면 다시 계산하지 않는다(force=돌아올 때).
// 잠금·로그아웃 때는 위젯 값을 지운다. 위젯 오류가 저장·화면을 막지 않는다. PC·iPad·브라우저는 다리가 없어 아무것도 안 한다.
let widgetMod=null,widgetSeen=null;
import('./widget-summary.mjs').then(m=>{widgetMod=m;nativeWidget(true);}).catch(()=>{widgetMod=null;});
function nativeWidget(force=false){
 if(!widgetMod||!nativeOn()||!whole||mdSignedOut)return;
 const day=kstDay();if(!force&&widgetSeen?.whole===whole&&widgetSeen.day===day)return;
 try{const s=widgetMod.widgetSummaryOf({life:whole.life??null,study:whole.study??null,fin:whole.fin??null,money:moneyFacts(whole.fin??null,day),today:day,at:Date.now(),marks:lifePlan?.readPlanMarks(globalThis.localStorage,day)??null});const r=nativeBr.pushWidget(s,{check:widgetMod.checkWidgetSummary});if(r.ok)widgetSeen={whole,day};}catch{/* 위젯만 갱신되지 않는다 */}
}
function nativeWidgetClear(){widgetSeen=null;try{if(nativeUi&&nativeBr&&nativeBr.available())nativeBr.clearWidget();}catch{/* 다음 잠금 해제 때 덮어쓴다 */}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)nativeResume();});
function nativeChip(root){
 if(!nativeOn())return;
 try{nativeBr.refreshDrafts();nativeSeen=nativeBr.pending().length;nativeUi.renderPayChip(root,{h:{el,add,button},br:nativeBr,onOpen:openNativePayDrafts});}catch{/* 칩만 안 보인다 */}
 if(nativeBr.error())add(root,hint(nativeUi.NATIVE_TEXT.fail));
}
function openNativePayDrafts(){
 if(!nativeOn()||!towerSheet)return;
 let dlg=null;
 const show=()=>{
  const ledger=whole.fin?prepare(whole.fin).lines:[];
  // FIX67 (M-06): 취소 알림과 맞는 장부 지출(같은 금액·비슷한 가게·최근 14일). 있으면 시트에 [이 지출을 환불로 정리] → onAdd가 환불 입력창을 미리 채워 열기만 한다(자동 저장 없음, 저장이 끝나면 알림 처리됨).
  const refundOf=d=>d.kind==='CANCEL'?refundCandidate(ledger,d,nativeUi.kstDateOf(d.at)):null;
  const refundFill=d=>{const m=refundOf(d);return m?{kind:'REFUND',accountId:m.accountId,category:m.category,subcategory:m.subcategory??'',merchant:d.merchant||m.merchant}:{};};
  const body=nativeUi.payDraftBody({h:{el,add,button},br:nativeBr,formatWon,recurringName:d=>recurringMatchDraft(recurringRules(),d)?.name??null,alreadyAdded:d=>recurringLedgerMatch(ledger,d,nativeUi.kstDatesNear(d.at))!==null,
   refundMatch:d=>{const m=refundOf(d);return m?{text:SAME_EXPENSE_TEXT.refund(m,shownMerchant(m,finMask)),label:SAME_EXPENSE_TEXT.refundBtn}:null;},
   onAdd:d=>{dlg?.close();const date=nativeUi.kstDateOf(d.at);
    if(!whole.fin){status(nativeUi.NATIVE_TEXT.fail);return;}
    editFinTxn(null,{date:date>whole.localDate?whole.localDate:date,amount:d.amount,merchant:d.merchant,...refundFill(d),onSaved:()=>{nativeBr.markHandled(d);},onKept:()=>{nativeBr.markAdded(d);}});},
   onDiscard:d=>{nativeBr.markHandled(d);dlg?.close();if(nativeBr.pending().length)show();void render();}});
  dlg=towerSheet(nativeUi.NATIVE_TEXT.sheetTitle,body);
 };
 show();
}
import('./life-ui.mjs').then(m=>{lifeUi=m;lifeSt=m.createLifeState();if(!$('workspace').hidden)void render();}).catch(()=>{lifeUi=null;});
// ---- 가계부 거래 넘기기(A7): 설정 토글(기본 꺼짐 = 동의 전)을 켠 PC 앱(APP_SHELL)에서만. LIFE_STATE를 쓰는 같은 때(쌓기 성공 직후·앱을 연 뒤 첫 투영 뒤 1번)와 토글을 켤 때
// host가 고정 경로(AURUMAR_HQ\state\FIN_TX.csv)에 한 파일을 쓴다. 끄면 머리말만 남긴 빈 CSV로 덮어쓴다. 읽기 투영(whole.fin)만 보고 금고 쓰기(연산) 0, 실패는 화면을 막지 않는다.
let finTxMod=null,finTxOpenDone=false;
const finTxCtx=()=>({surface:mdSurface,storage:globalThis.localStorage,fin:()=>whole?.fin??null,today:()=>whole?.localDate??kstDay(),mask:()=>finMask,send:body=>api(finTxMod.FIN_TX_ROUTE,body),
 newId:()=>[...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join('')});
import('./fin-tx-export.mjs').then(m=>{finTxMod=m;if(!$('workspace').hidden&&view==='SETTINGS')void render();}).catch(()=>{finTxMod=null;});
function finTxStacked(status){if(finTxMod&&!mdSignedOut)void finTxMod.exportFinTxAfterStack(finTxCtx(),status);}
function finTxOpen(){if(finTxOpenDone||!finTxMod||!whole||mdSignedOut)return;finTxOpenDone=true;void finTxMod.exportFinTx(finTxCtx());}
// ---- 사령부 상태 내보내기(B47'): 설정 안의 수동 단추 하나. PC 앱(APP_SHELL)에서만 단추가 있고, 미리보기를 본 뒤 확인해야 host가 고정 경로에 한 파일을 쓴다. 자동 내보내기 없음.
let stateExportMod=null;
const stateSend=markdown=>api('/api/state-export',{markdown});
const stateViews=()=>({life:whole.life??null,study:whole.study??null,fin:whole.fin??null,hlt:whole.hlt??null});
import('./state-export.mjs').then(m=>{stateExportMod=m;if(!$('workspace').hidden&&view==='SETTINGS')void render();pcWidget('open');}).catch(()=>{stateExportMod=null;});
// ---- 바탕화면 위젯 숫자 파일(ST1): PC 앱(APP_SHELL)에서만. 숫자는 state-export.mjs widgetStatusOf가 만들고, host가 고정 경로(AURUMAR_HQ\state\widget_status.json)에 쓴다.
// 쓰는 때: 앱을 열어 기록을 처음 읽을 때 바로, 기록을 다시 읽은 뒤(저장 후 포함) 바뀌었으면 30초 뒤 한 번, 일기 날짜(04:00)가 바뀌면 바로(창이 숨어 있어도 1분마다 확인), "저장 후 종료" 때 바로.
// 위젯 파일 오류는 저장·화면을 막지 않는다. Fold·iPad·브라우저는 APP_SHELL이 아니라 아무것도 안 한다.
let widgetFile={last:null,timer:null,syncAt:null,busy:Promise.resolve()};
function pcWidgetStatus(){
 if(!stateExportMod||mdSurface!=='APP_SHELL'||!whole||mdSignedOut||!stateExportMod.widgetSwitch('on',globalThis.localStorage))return null;
 const day=kstDay(),money=moneyFacts(whole.fin??null,day),life=whole.life??null;
 return stateExportMod.widgetStatusOf({life,study:whole.study??null,fin:whole.fin??null,money,now:new Date().toISOString(),device:stateExportMod.widgetDevice(globalThis.localStorage),
  title:ach=>achvPanelMod?.currentTitle({ach,life,money,storage:globalThis.localStorage,st:achvSt})?.name??null,lastSyncAt:widgetFile.syncAt,planStorage:globalThis.localStorage});   // FIX68 F7: 손 완료 반영
}
function pcWidgetSend(){
 clearTimeout(widgetFile.timer);widgetFile.timer=null;
 widgetFile.busy=widgetFile.busy.then(async()=>{try{const s=pcWidgetStatus();if(s){await api(stateExportMod.WIDGET_FILE_ROUTE,s);widgetFile.last=s;}}catch{/* 위젯 파일만 갱신되지 않는다 */}});
 return widgetFile.busy;
}
function pcWidget(reason='change'){
 try{
  if(reason==='change'&&widgetFile.timer)return Promise.resolve();   // 이미 30초 뒤 쓰기가 잡혀 있으면 다시 계산하지 않는다
  const when=stateExportMod?.widgetWriteWhen(widgetFile.last,pcWidgetStatus(),reason);
  if(when==='NOW')return pcWidgetSend();
  if(when==='LATER'&&!widgetFile.timer)widgetFile.timer=setTimeout(()=>void pcWidgetSend(),stateExportMod.WIDGET_FILE_WAIT_MS);   // 기다리는 동안 또 바뀌어도 한 번만(쓸 때 그때 값을 다시 만든다)
 }catch{/* 위젯 파일만 갱신되지 않는다 */}
 return Promise.resolve();
}
// FIX58Q (HUNT55 HS2): 잠금·로그아웃(signedOutLock) 순간 30초 뒤 쓰기를 취소하고 빈 숫자 파일(widgetLockedStatus)로 바로 덮어쓴다. 앞 프로필의 숫자가 다음 프로필 동안 남지 않게.
// 마지막으로 쓴 값도 잊어 다음 프로필의 첫 기록 읽기는 지금 규칙대로 "처음 쓰기"(widgetWriteWhen NOW)다. host가 잠긴 금고라 거절하면(WIDGET_STATUS_LOCKED) 위젯 파일만 갱신되지 않는다.
function pcWidgetLock(){
 clearTimeout(widgetFile.timer);widgetFile.timer=null;widgetFile.last=null;
 if(!stateExportMod||mdSurface!=='APP_SHELL')return;
 widgetFile.busy=widgetFile.busy.then(async()=>{try{if(stateExportMod.widgetSwitch('on',globalThis.localStorage))await api(stateExportMod.WIDGET_FILE_ROUTE,stateExportMod.widgetLockedStatus({now:new Date().toISOString(),device:stateExportMod.widgetDevice(globalThis.localStorage)}));}catch{/* 위젯 파일만 갱신되지 않는다 */}});
}
setInterval(()=>{try{if(widgetFile.last&&kstDay(4)!==widgetFile.last.diary_day)void pcWidget('day');}catch{/* 다음 확인 때 */}},60000);
// FIX73 (H71-5): 앱을 연 뒤 첫 화면 투영(새 시작 필터 뒤 whole)이 끝나면 LIFE_STATE를 1번 다시 써서 예전에 쓴 파일의 기준 전 숫자를 지운다.
// 자동 내보내기 동의(D4 토글)가 켜진 PC 앱에서만(exportStateAuto가 표면·토글을 본다). 쌓은 뒤와 같은 자동 내보내기 함수, 금고 쓰기(연산) 0. 실패는 화면을 막지 않는다.
let stateOpenDone=false;
function stateOpenExport(){
 if(stateOpenDone||!stateExportMod||!whole||mdSignedOut)return Promise.resolve(null);
 stateOpenDone=true;
 return stateExportMod.exportStateAuto({surface:mdSurface,views:stateViews,now:()=>new Date().toISOString(),storage:globalThis.localStorage,send:stateSend}).catch(()=>null);
}
// ---- 비서 결과 보기(B47): 더보기 아래 영역 하나. PC 앱(APP_SHELL)에서만 host가 고정한 폴더의 보고를 읽고(읽기 전용), 글은 textContent로만 넣는다.
let aiGateMod=null;
const aiReports=body=>api('/api/assistant-reports',body);
import('./ai-gate.mjs').then(m=>{aiGateMod=m;if(!$('workspace').hidden&&view==='MORE')void render();}).catch(()=>{aiGateMod=null;});
// ---- 지식 파인더 결과 링크(B63): finder 보고의 "찾은 자료" 표만 단추로. 여는 것은 host 경로 하나(웹은 확인창 뒤 기본 브라우저, 내 PC는 폴더에서 보기만, 앱은 화면 이동). 다시 묻지 않기 목록은 이 기기 설정.
let finderMod=null;
const openLink=body=>api('/api/open-link',body);
import('./finder-links.mjs').then(m=>{finderMod=m;if(!$('workspace').hidden&&(view==='MORE'||view==='SETTINGS'))void render();}).catch(()=>{finderMod=null;});
const finderDecorate=()=>finderMod&&uiKit?(r,text)=>finderMod.decorateFinder(r,text,{h:{el,add,button},kit:uiKit,surface:mdSurface,open:openLink,navigate,storage:globalThis.localStorage}):undefined;
// ---- 다음 주 제안(B61): 계획 탭의 카드 하나. 기본 진단은 어디서나, 공부 진단 보고는 PC 앱에서만 읽는다. 담기는 메모리 초안이고(잠금 로그아웃이면 버린다) 기록은 계획 시트의 "저장"뿐이다.
let suggestMod=null,suggestSt=null;
import('./study-suggest.mjs').then(m=>{suggestMod=m;if(!$('workspace').hidden&&view==='PLANS')void render();}).catch(()=>{suggestMod=null;});
// ---- 돈 탭 분석(B60): 앱 안 기본 분석 + 비서 분석 카드. 읽기는 위 aiReports 하나만 쓴다.
let finAnalysisMod=null;
import('./fin-analysis.mjs').then(m=>{finAnalysisMod=m;if(!$('workspace').hidden&&view==='LEDGER'&&finTab==='ANALYSIS')void render();}).catch(()=>{finAnalysisMod=null;});
let icsExportMod=null;
import('./ics-export.mjs').then(m=>{icsExportMod=m;if(!$('workspace').hidden&&view==='PLANS')void render();}).catch(()=>{icsExportMod=null;});
// 바깥 일정 보기(P1E): 기록으로 저장하지 않고 이 기기 localStorage에만 둔다. 서버 호출·연산 없음.
let icsImportMod=null;
import('./ics-import.mjs').then(m=>{icsImportMod=m;if(!$('workspace').hidden&&(view==='PLANS'||view==='CALENDAR'))void render();}).catch(()=>{icsImportMod=null;});
const icsOuterStore=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const icsOuterCtx=()=>({h:{el,add,button},kit:uiKit,storage:icsOuterStore(),today:whole.localDate,rerender:()=>void render()});
// renderCalendar는 이 도우미 하나만 쓴다. 그 줄만 떼어 돌리는 시험 하니스에는 이 이름이 없어 typeof로 확인한다.
const icsOuterView=()=>{if(!icsImportMod||!uiKit)return null;const days=icsImportMod.outerByDay(icsOuterStore()),ctx=icsOuterCtx();return {on:day=>days.get(day)??[],chip:o=>icsImportMod.outerChip(o,ctx),panel:root=>icsImportMod.renderOuterPanel(root,ctx)};};
// ---- PC 앱 Windows 알림(B57): PC 앱(APP_SHELL)이 켜져 있고 잠금이 풀려 있을 때만 1분마다 시각을 본다. 판단이 필요할 때만 투영을 한 번 읽고(화면 상태는 바꾸지 않음) host에 종류와 건수만 보낸다. 기록·연산 0. 다른 표면에서는 첫 틱에 타이머까지 멈춘다.
let pcToastMod=null,pcToastRun=null;
import('./pc-toast.mjs').then(m=>{pcToastMod=m;pcToastRun=m.createToastRunner({surface:()=>mdSurface,ready:()=>mdUnlocked,read:()=>api('/api/whole-life').then(w=>freshView({whole:w},FRESH_START).whole),send:body=>api('/api/pc-toast',body),storage:globalThis.localStorage});pcToastRun.start();brickWatchStart();if(!$('workspace').hidden&&view==='SETTINGS')void render();}).catch(()=>{pcToastMod=null;pcToastRun=null;});
// ---- 공부 소리·벽돌 토스트(S1C): 설정은 이 기기 localStorage만. 소리는 사용자 동작 뒤에만, 토스트는 PC 앱이 가려져 있을 때만. 못 불러오면 소리·토스트 없이 타이머는 그대로 돈다.
let chimeMod=null,chimeCtl=null,brickWatch=null;
const liveFold=()=>chimeMod?.foldDevice(nativeBr?.available?.(),globalThis.navigator?.userAgent)??false;
const brickWatchStart=()=>{if(brickWatch||!chimeMod||!pcToastMod)return;brickWatch=pcToastMod.createBrickWatch({surface:()=>mdSurface,ready:()=>mdUnlocked,enabled:()=>chimeMod.loadLiveSettings(globalThis.localStorage,{fold:liveFold()}).brickToast,covered:()=>pcToastMod.appCovered(document),read:()=>chimeMod.brickProgress({timer:lifeSt?.timer??null,nowIso:new Date().toISOString(),study:whole?.study??null,draftCard:lifeSt?.studyCard?.card??null}),send:body=>api('/api/pc-toast',body),storage:globalThis.localStorage});brickWatch.start();};
import('./study-chime.mjs').then(m=>{chimeMod=m;chimeCtl=m.installStudyChime({storage:globalThis.localStorage,fold:liveFold,timer:()=>mdSignedOut?null:lifeSt?.timer??null});brickWatchStart();if(!$('workspace').hidden&&view==='SETTINGS')void render();}).catch(()=>{chimeMod=null;chimeCtl=null;});
// ---- PC 집중 측정(B6): PC 앱(APP_SHELL)에서만 불러오고, 설정 스위치(기본 끔)를 켰을 때만 오늘 화면에 카드가 보인다. host가 ActivityWatch(127.0.0.1:5600)를 GET으로만 읽어 숫자·시각 구간만 돌려준다.
// 측정값은 어디에도 자동으로 더하지 않는다. "확인하고 담기"를 누를 때만 타이머·기록과 겹치지 않는 구간이 오늘 공부 초안의 세션이 된다(연산 0, "오늘 쌓기"에 합쳐짐).
let focusMod=null,focusSt=null,focusLoading=false;
const focusLoad=()=>{if(focusMod||focusLoading||mdSurface!=='APP_SHELL')return;focusLoading=true;import('./focus-card.mjs').then(m=>{focusMod=m;focusSt=m.createFocusState();if(!$('workspace').hidden&&['HOME','STATUS','SETTINGS'].includes(view))void render();}).catch(()=>{focusMod=null;focusLoading=false;});};
const focusOn=()=>{focusLoad();return focusMod!==null&&uiKit!==null&&mdSurface==='APP_SHELL'&&mdUnlocked&&focusMod.focusEnabled(globalThis.localStorage);};
const focusCard=args=>focusOn()?focusMod.renderFocusCard({...args,document,kit:uiKit,state:focusSt,request:body=>api('/api/focus-today',body),storage:globalThis.localStorage,now:()=>new Date().toISOString(),uid}):null;
// ---- 오늘 계획 카드(P1B): 오늘 탭과 계획 탭 '일' 보기가 같은 카드(plan-today.mjs)를 그린다. 못 불러오면 두 화면 모두 예전 그대로. 계획 탭에서는 오늘 화면의 타이머·담기(life-ui focusPort)를 빌려 쓴다.
let planTodayMod=null;
import('./plan-today.mjs').then(m=>{planTodayMod=m;if(!$('workspace').hidden&&['HOME','PLANS'].includes(view))void render();}).catch(()=>{planTodayMod=null;});
// ---- 주간 계획 격자(P1A): 계획 탭 '주' 보기(plan-week.mjs, renderPlans가 ctx.planWeek로 넘김). 못 불러오면 옛 막대 보기와 계획 탭 아래 "다음 주 제안" 그대로.
let planWeekMod=null;
import('./plan-week.mjs').then(m=>{planWeekMod=m;if(!$('workspace').hidden&&view==='PLANS')void render();}).catch(()=>{planWeekMod=null;});
// ---- 월 계획·달력 합치기(P1C): 계획 탭 '월' 보기(plan-month.mjs, renderPlans가 ctx.planMonth로 넘김). 이것이 있으면 '달력' 화면은 월 보기로 가고 칸 전환 줄에서 빠진다. 못 불러오면 옛 달력 화면(renderCalendar) 그대로.
// planCal = 지금 계획 보기의 일정(/api/calendar-view, 읽기만). 기록을 다시 읽거나(whole이 바뀜) 범위가 바뀔 때만 다시 읽는다. 그리기를 막지 않는다: renderPlans가 먼저 그리고, 새로 읽으면 한 번 더 그린다. 읽기 실패는 일정 줄에 안내만.
let planMonthMod=null,planCal=null,planCalBusy=null;
import('./plan-month.mjs').then(m=>{planMonthMod=m;if(!$('workspace').hidden&&view==='PLANS')void render();}).catch(()=>{planMonthMod=null;});
const planMonthOn=()=>Boolean(planMonthMod&&lifePlan&&planSt&&uiKit);
const planCalKey=()=>{const q=lifePlan.eventQuery(planSt,new Date().toISOString());return q?{q,key:q.mode+q.date}:null;};
function loadPlanCal(){const want=planCalKey();if(!want){planCal=null;return;}if(planCal?.key===want.key&&planCal.whole===whole)return;const seen=whole,seq=mdSignedOutSeq;if(planCalBusy?.key===want.key&&planCalBusy.seen===seen)return;const busy=planCalBusy={key:want.key,seen};void api('/api/calendar-view',want.q).catch(()=>({events:[],failed:true})).then(cal=>{if(planCalBusy===busy)planCalBusy=null;if(seq!==mdSignedOutSeq||mdSignedOut||planCalKey()?.key!==want.key)return;planCal={...cal,key:want.key,whole:seen};if(view==='PLANS')void render();});}
const planCalCtx=()=>planMonthOn()&&planCal&&planCal.key===planCalKey()?.key?{events:planCal.events,failed:Boolean(planCal.failed),add:date=>{calendarDate=date;editEvent(null);},open:openCalendarItem,outer:typeof icsOuterView==='function'?icsOuterView():null}:null;
// ---- 오늘 탭 맨 위 달력(CAL2, life-plan renderHomeCal): 이번 주 띠 · 고른 날 계획·일정 · 달력 펼치기. 읽기만 한다(새 기록·쓰기 경로 없음, 추가 단추는 기존 계획 편집·일정 시트).
// 일정은 /api/calendar-view(읽기만)로 주(7_DAY)·펼친 달(MONTH) 범위를 읽어 범위마다 기억하고, 기록을 다시 읽으면(whole이 바뀜) 다시 읽는다. 그리기를 막지 않는다(읽는 동안은 계획만, 끝나면 오늘 화면이면 한 번 더 그림).
let homeCalSt=null;const homeCalRead=new Map();
function homeCalEvents(q){const key=q.mode+q.date,c=homeCalRead.get(key);if(c?.whole===whole)return c.cal;if(c?.busy!==whole){const seen=whole,seq=mdSignedOutSeq;homeCalRead.set(key,{cal:c?.cal??null,busy:seen});void api('/api/calendar-view',q).catch(()=>({events:[],failed:true})).then(cal=>{if(seq!==mdSignedOutSeq||mdSignedOut||homeCalRead.get(key)?.busy!==seen)return;if(homeCalRead.size>8)homeCalRead.clear();homeCalRead.set(key,{cal,whole:seen});if(view==='HOME'&&!$('workspace').hidden)void render();});}return c?.cal??null;}
function homeCal(root){if(!lifePlan||!uiKit)return;const ctx={...lifeCtx(),sheet:towerSheet,homeCal:{read:homeCalEvents,add:date=>{calendarDate=date;editEvent(null);},open:openCalendarItem,outer:typeof icsOuterView==='function'?icsOuterView():null}};homeCalSt??=lifePlan.createHomeCalState(ctx.storage);lifePlan.renderHomeCal(root,ctx,homeCalSt);}
const todayPlan=o=>planTodayMod&&uiKit?planTodayMod.renderTodayPlan({...lifeCtx(),sheet:towerSheet},o.focus!==undefined?o:{...o,focusMessage:true,focus:lifeUi&&lifeSt&&studyOn()?lifeUi.focusPort(lifeCtx(),lifeSt):null,draft:lifeSt?.today===o.date&&lifeSt.studyCard?.status==='LOCAL_DRAFT'?lifeSt.studyCard.card:null}):null;
const focusExtraMin=()=>focusOn()?focusMod.claimableMin(focusSt,{card:lifeSt?.studyCard?.card??null,timer:lifeSt?.timer??null,nowIso:new Date().toISOString()}):0;
// ---- 카드 초안 상자(B3c): 초안 저널이 없는 표면(브라우저)에서 건강·공부 카드 초안을 이 기기 IndexedDB에 암호문으로 둔다. scope=선택된 프로필의 accountId·vaultId.
// 상자를 쓸지는 hlt-ui·study-ui의 포트가 정한다(PC 저널이 있으면 부르지도 않음). FIN 쓰기 경로와는 관계없다.
let cardDraftMod=null,cardBox=null,cardBoxOff=null,mdScope=null;
const cardDraftReady=import('./card-draft-box.mjs').then(m=>{cardDraftMod=m;}).catch(()=>{cardDraftMod=null;});
function cardDraftBox(){
  const scope=cardDraftMod?.cardDraftScope(mdScope)??null;if(!scope)return null;
  if(cardBox?.scope!==scope){cardBoxOff?.();cardBox=cardDraftMod.createCardDraftBox({scopeId:scope,canWrite:()=>mdRole==='OWNER',unlocked:()=>mdUnlocked});cardBoxOff=cardBox.attachFlush(globalThis,document);}
  return cardBox.available()?cardBox:null;
}
const showCardDrafts=(line,n)=>{if(!line||!cardDraftMod)return;line.textContent=n?cardDraftMod.deviceOnlyLine(n)+' · 확정 전까지 다른 기기에서는 안 보임':'';line.hidden=!n;};
function cardDraftLine(){const p=el('p','','notice card-drafts-line');p.id='card-drafts-line';p.hidden=true;const box=cardDraftBox();if(box)void box.count().then(n=>showCardDrafts(p,n),()=>{});return p;}
globalThis.addEventListener?.('lb:card-drafts-changed',e=>showCardDrafts(document.getElementById('card-drafts-line'),e?.detail?.count??0));
// V6F (지시서 1): 화면 어디서나 보이는 "아직 안 쌓은 입력 n개 · 지금 쌓기" 줄(#status 바로 아래, 화면을 그릴 때마다 다시 센다).
// 센 것 = 오늘 카드·오늘 공부 카드·어제 이전 초안 날짜(life-ui pendingStackCount) + 오늘 건강 카드 초안. 쌓는 길은 기존 그대로(그날 카드 1장 = 연산 1).
const hltPendingToday=()=>hltOn()&&Boolean(hltSt?.flow)&&hltSt.flowState?.status==='LOCAL_DRAFT'&&hltSt.date===hltSt.today;
// OPS1A (통제탑 2026-11-11): 계획 줄 고치기(PLAN_DAY)도 이 기기 초안 상자에 모았다가 같은 쌓기로 날마다 1번 쓴다(life-plan createPlanDrafts). 상자가 없으면 null = 예전처럼 바로 저장.
// 화면(lifeCtx)은 초안을 얹은 life를 보고(shownWhole), 쌓기는 금고 그대로의 ctx(hltCtx)로 savePlanDay(direct)를 부른다.
let planDrafts=null,planDraftsBox=null;
function planDraftsNow(){
  const box=lifePlan&&typeof lifeUi?.createPlanDrafts==='function'&&!mdSignedOut?cardDraftBox():null;   // 화면 모듈을 못 불러왔거나 상자가 없으면 예전처럼 바로 저장
  if(!box){planDrafts=null;planDraftsBox=null;return null;}
  if(planDraftsBox!==box){planDraftsBox=box;const pd=planDrafts=lifeUi.createPlanDrafts({port:box.port('PLAN_DAY'),box,getLife:()=>whole?.life??null,rebase:lifePlan.rebasePlan,write:(ctx,a)=>lifePlan.savePlanDay(ctx,{...a,direct:true})});pd.skipWhen?.(d=>dateBeforeFresh(d,FRESH_START));   /* V7D1: 새 시작 전 계획 임시 입력은 세지도 쌓지도 않는다(지우지 않음) */void pd.ready.then(()=>{if(planDrafts===pd&&pd.count()&&!$('workspace').hidden)void render();});}
  // FIX70 (HUNT67 F4): 잠긴 채 읽은 계획 초안(빈 캐시)은 잠금 해제·로그인 뒤 처음 그릴 때 디스크를 다시 읽는다(남은 초안을 세고 쌓게).
  else if(planDrafts?.blind?.()){const pd=planDrafts;void pd.reload().then(()=>{if(planDrafts===pd&&pd.count()&&!$('workspace').hidden)void render();},()=>{});}
  return planDrafts;
}
let shownMemo=null;
const shownWhole=()=>{const pd=planDrafts;if(!pd||!pd.count()||!whole?.life)return whole;const life=pd.overlay(whole.life);if(shownMemo?.whole===whole&&shownMemo.life===life)return shownMemo.out;const out={...whole,life};shownMemo={whole,life,out};return out;};
// FIX70 (HUNT67 F3): 건강 몫은 오늘 카드만이 아니라 이 기기 상자에 남은 모든 날짜의 건강 카드 초안(자정을 넘긴 어제 초안 포함, prepareHealth·easyAdd가 채우는 draftDates).
// 오늘(KST) 뒤 날짜 초안(밤에 누른 "지금 취침" = 깬 날 카드의 열린 수면)은 예전처럼 세지도 쌓지도 않는다(그 날이 오면 센다).
const hltPendingDates=()=>{if(!(hltOn()&&Boolean(hltSt?.flow)))return [];const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);return [...new Set([...(hltSt.draftDates??[]),...(hltPendingToday()?[hltSt.date]:[])])].filter(d=>d<=today).sort();};
const hltFreshDrafts=()=>hltOn()&&hltSt?.flow?hltSt.freshDrafts??[]:[];   // V7D1: 새 시작 전 건강 임시 입력 날짜(hlt-ui prepareHealth가 draftDates에서 뺀 것, 지우지 않음)
function pendingStackTotal(){return (lifeUi&&lifeSt?lifeUi.pendingStackCount(lifeSt):0)+hltPendingDates().length+(planDrafts?.count()??0);}
// FIX70 (HUNT67 O1): 자동 쌓기 기다림의 key에 오늘 카드 밖 입력(건강 초안·계획 초안)도 넣는다. 화면만 다시 그리면 key가 같아 기다림이 다시 시작되지 않는다.
const pendingKeyExtra=()=>JSON.stringify([hltPendingDates(),hltPendingToday()?hltSt.flowState.card:null,(planDrafts?.dates()??[]).map(d=>planDrafts.get(d)?.mine??null)]);
async function stackAllPending(){
  let stacked=0,failed=0,hltOk=null;const codes=[];
  const pd=planDraftsNow();
  if(pd?.count()){const r=await pd.flush(hltCtx());stacked+=r.stacked;failed+=r.failed;codes.push(...r.codes);}
  if(lifeUi&&lifeSt){const r=await lifeUi.stackPending(lifeCtx(),lifeSt);stacked+=r.stacked;failed+=r.failed;codes.push(...(lifeSt.stackCodes??[]));}
  const hd=hltPendingDates();
  if(hd.length){for(const d of hd){try{const r=await hltSt.flow.confirm(d);if(r.status==='CONFIRMED'||r.status==='ALREADY_APPLIED'){stacked++;if(hltOk===null)hltOk=true;}else if(r.status!=='NOTHING_TO_CONFIRM'){failed++;codes.push(r.code);hltOk=false;}}catch(e){failed++;codes.push(e?.code);hltOk=false;}}await hltReload();await hltUi.prepareHealth(hltCtx(),hltSt);}
  const out={stacked,failed,logLimit:codes.includes(LOG_LIMIT_CODE)};
  // FIX69 (CAP2 F1): 건강 카드를 쌓았거나 못 쌓았으면 카드 안 결과 문구도 바꾼다(실패 = 상단 #status와 같은 말, 성공 = "쌓음").
  if(hltOk!==null&&typeof hltUi.noteStackResult==='function')hltUi.noteStackResult(hltSt,{ok:hltOk,text:stackResultText(out)});
  return out;
}
const stackResultText=r=>r.logLimit?LOG_LIMIT_TEXT:r.failed?'쌓지 못한 입력이 있어요 · 입력은 이 기기에 그대로 있어요 · 오늘·건강 화면에서 확인하세요':'쌓지 않은 입력을 모두 쌓았어요.';
function paintPendingLine(){
  const s=$('status');if(!s||!lifeUi)return;let line=$('pending-stack');
  const n=ended||mdSignedOut||$('workspace').hidden?0:pendingStackTotal();
  if(!n){if(line)line.hidden=true;if(lifeSt)lifeUi.clearAutoStack?.(lifeSt);return;}   // FIX70 (O1): 쌓을 것이 없으면 기다림도 없다(오늘 화면은 앱 줄에 맡김)
  if(!line){line=el('div','','notice pending-stack');line.id='pending-stack';s.after(line);}
  const stackNow=()=>void perform(async()=>{const r=await stackAllPending();status(stackResultText(r),r.failed>0);await render();});
  const go=button(lifeUi.AUTO_STACK_TEXT.now,stackNow,'primary pending-stack-btn');
  line.replaceChildren(el('span',lifeUi.AUTO_STACK_TEXT.line(n),'pending-stack-text'),go);line.hidden=false;
  // OPS1A: 오늘 화면 밖(계획·기록·건강·돈)에서도 입력이 멈추고 5분이 지나면 같은 "지금 쌓기"를 한 번(오늘 화면과 같은 타이머 한 칸 st.autoTimer, 임시 저장 모드·잠김이면 쌓지 않음).
  if(lifeSt&&typeof lifeUi.scheduleAutoStack==='function')lifeUi.scheduleAutoStack(lifeCtx(),lifeSt,stackNow);
}
// OPS1A: 남은 저장 횟수 경고 줄(오늘·계획·기록·돈 탭 위). 2,000 이하 금색, 500 이하 붉은색, 모르면 줄 없음. 문구만(동작을 막지 않음).
const OP_WARN_TABS=['TODAY','PLAN','RECORDS','LEDGER'];
function paintOpWarn(){
  const s=$('status');if(!s)return;let line=$('op-warn');
  const tab=TABS.find(t=>t[3].includes(view))?.[0],w=ended||mdSignedOut||$('workspace').hidden||!OP_WARN_TABS.includes(tab)?null:opWarnLine(finOps());
  if(!w){if(line)line.hidden=true;return;}
  if(!line){line=el('div','','op-warn');line.id='op-warn';line.setAttribute('role','status');s.after(line);}
  line.className='op-warn op-warn-'+w.tone;line.dataset.remaining=String(w.remaining);
  line.replaceChildren(el('span',w.text,'op-warn-text'));line.hidden=false;
  // FIX69 (CAP2 O2): 두 줄 모두 #status 바로 뒤에 끼워지므로 나중에 생긴 줄이 위로 왔다. 순서를 상태 → 경고 줄 → "아직 안 쌓은 입력"으로 고정한다(이미 맞으면 움직이지 않음 = 단추 초점 유지).
  if(s.nextElementSibling!==line)s.after(line);
  const p=$('pending-stack');if(p&&line.nextElementSibling!==p)line.after(p);
}
// 저장 후 종료: 닫기 전에 쌓지 않은 입력을 먼저 쌓는다(실패해도 종료는 막지 않고, 입력은 이 기기에 남는다고 알린다).
async function stackBeforeExit(){if(!pendingStackTotal())return '';try{const r=await stackAllPending();return r.logLimit?' · '+LOG_LIMIT_TEXT:r.failed?' · 쌓지 못한 입력은 이 기기에 남아 있어요(다음에 열면 이어서 쌓을 수 있어요)':'';}catch{return ' · 쌓지 못한 입력은 이 기기에 남아 있어요';}}
// B16 (K1-02): refreshCore와 같은 세대 검사. 읽는 도중 로그아웃 잠금이 끼었으면(그 뒤 재로그인 포함) 읽은 값을 today·whole·changes에 넣지 않고
// MD_SIGNED_OUT_ELSEWHERE로 끝낸다(남은 읽기도 하지 않음, 부른 확정·저장 흐름이 옛 값으로 계속하지 않게). 모든 읽기가 끝난 뒤에만 한꺼번에 넣는다.
async function hltReload(){const lockSeq=mdSignedOutSeq,gone=()=>lockSeq!==mdSignedOutSeq||mdSignedOut;const [readToday,readWhole]=await Promise.all([api('/api/today'),api('/api/whole-life')]);if(gone())throw appError('MD_SIGNED_OUT_ELSEWHERE');const readChanges=(await api('/api/history')).changes;if(gone())throw appError('MD_SIGNED_OUT_ELSEWHERE');const {today:nextToday,whole:nextWhole,changes:nextChanges}=typeof freshRead==='function'?freshRead(readToday,readWhole,readChanges):{today:readToday,whole:readWhole,changes:readChanges};today=nextToday;whole=nextWhole;changes=nextChanges;if(typeof nativeWidget==='function')nativeWidget();}
// V7D1: 투영 입력 필터의 한 곳. 읽은 기록(today·whole·changes)은 모두 이 함수를 지나 들어온다(refreshCore·hltReload, 모든 읽기가 끝나고 세대가 그대로일 때만).
// whole·today = 새 시작 기준 전 기록을 뺀 사본(성취 엔진·탑·우주·퀘스트·위젯·LIFE_STATE·widget_status 내보내기가 모두 이것만 읽는다), wholeRaw = 필터 전 원본("새 시작 전 기록" 읽기 전용 보기만),
// changes = 이력 원본 그대로(이력 화면·초안 병합), freshRows = 성취 엔진이 읽는 행동 결과 줄(withActionDays). FRESH_START=null이면 받은 값 그대로.
// 줄을 떼어 돌리는 기존 하니스(B14·B16·S1c)에서도 터지지 않게 부르는 쪽은 typeof 로 감싼다(없으면 받은 값 그대로).
function freshRead(readToday,readWhole,readChanges){const v=freshView({whole:readWhole,today:readToday,changes:readChanges},FRESH_START);wholeRaw=readWhole;freshRows=v.rows;return {today:v.today,whole:v.whole,changes:readChanges};}
let recordsMod=null;import('./life-quest.mjs').then(m=>{recordsMod=m;if(!$('workspace').hidden&&['PLANS','SETTINGS','STUDY'].includes(view))void render();}).catch(()=>{recordsMod=null;});   // FIX46B: 새 기록 화면·쓰기 문(D46). 못 불러오면 줄이 안 보이고 문은 닫힌 채다
let achvPanelMod=null;import('./achv-panel.mjs').then(m=>{achvPanelMod=m;}).catch(()=>{achvPanelMod=null;});   // Q1A: 못 불러오면 탑만 보인다
const achvSt={seenKey:freshSeenKey('lb.achv.seen.v1',FRESH_START)},achvArgs=args=>({...args,st:achvSt,toast:pcToastMod?.achvToastPort({surface:mdSurface,storage:globalThis.localStorage,send:body=>api('/api/pc-toast',body)})??null});   // Q1B: 오늘·탑이 장부 메모리와 토스트 포트를 함께 쓴다(한쪽에서 알린 달성을 다른 쪽이 다시 알리지 않게)
// FIX44 (AUD1 #2·#3·#7): 오늘 요약 줄이 쓰는 값·이동. 복습 건수는 공부 모듈이 준비됐을 때만(아니면 그 조각을 그리지 않는다). FIX45 (통제탑 ★1): 주간 백업 알림 줄은 Windows 앱에서만(Fold·iPad는 백업 카드만). FIX45 (AUD1 #9): 수면·걸음 한 줄은 건강 모듈이 켜졌을 때만.
const todaySummaryPorts=()=>({reviewTotal:()=>{if(!studyOn()||!studySt?.flowState)return null;try{return studyUi.studyReviewTotal(hltCtx(),studySt);}catch{return null;}},openStudy:openReviews,openColors:openSubjectColors,openBackup:mdProfile&&mdSurface==='APP_SHELL'?openBackup:null,healthLine:date=>hltOn()&&whole?.hlt?hltUi.sleepStepsLine(whole.hlt,date):null,nap:hltOn()&&whole?.hlt&&hltUi?.easyAdd?{list:date=>hltUi.napsOf(whole.hlt,date),shown:date=>hltUi.napsOf(hltSt?.flowState?.status==='LOCAL_DRAFT'&&hltSt.date===date?{days:[{date,data:hltSt.flowState.card}]}:whole.hlt,date),   /* OPS1A: 아직 안 쌓은 낮잠도 바로 보인다(초안 카드) */add:async(minutes,startHm)=>{const now=new Date().toISOString(),day=new Date(Date.parse(now)+9*3600000).toISOString().slice(0,10),item=hltUi.napItem(day,minutes,startHm||null,now);if(!item)throw appError(hltUi.napProblem?.(day,minutes,startHm||null,now)??'INVALID_HLT_TIME');const r=await hltUi.easyAdd(hltCtx(),hltSt,item);await hltReload();return r;}}:null,weekTimeLine:(monday,day)=>studyOn()?studyStatsMod?.weekCompareText(whole?.study??null,monday,day)??null:null,quickExpense:whole?.fin?()=>openQuickExpense(whole.fin):null,studyDraft:date=>lifeSt?.today===date&&lifeSt.studyCard?.status==='LOCAL_DRAFT'?lifeSt.studyCard.card:null,weekReview:args=>weekReviewMod?.renderWeekReviewButton(lifeCtx(),args)??null});
const lifeCtx=()=>({...hltCtx(),todayPlan,getWhole:shownWhole,planDrafts:planDraftsNow(),autoStack:true,pendingKey:pendingKeyExtra,planAutoSave:true,locked:()=>mdSignedOut,storage:globalThis.localStorage,kit:uiKit,study:()=>studyOn()?{ui:studyUi,st:studySt,ctx:hltCtx}:null,...todaySummaryPorts(),money:day=>moneyFacts(whole.fin??null,day),achvPanel:(out,args)=>achvPanelMod?.renderAchvPanel(out,achvArgs(args)),achvMoment:(out,args)=>achvPanelMod?.renderAchvMoment(out,achvArgs(args)),questSheet:args=>achvPanelMod?.openQuestSheet(args),achvTitle:args=>achvPanelMod?.titleBadge({...args,st:achvSt}),monthGoals:args=>recordsMod?.renderMonthGoals({...lifeCtx(),sheet:towerSheet},args)??null,weekGoals:args=>recordsMod?.renderWeekGoals({...lifeCtx(),sheet:towerSheet},args)??null,examResults:args=>recordsMod?.renderExamResults({...lifeCtx(),sheet:towerSheet},args)??null,exportAfterStack:(st,status)=>(typeof finTxStacked==='function'&&void finTxStacked(status),stateExportMod)?stateExportMod.exportAfterStack({surface:mdSurface,views:stateViews,now:()=>new Date().toISOString(),storage:globalThis.localStorage,send:stateSend},st,status):Promise.resolve({status:'SKIPPED',reason:'MODULE'}),focusCard});
const afterEntity=async(type,id)=>{await hltReload();if(type==='PLAN_DAY')nativeMirrorDay(id);};
// V7D2 기록별 비우기(설계 V7D 4절, 컨트롤러는 life-ui createRecordClear). 쓰기는 지금 쓸 수 있을 때만, 임시 저장(초안)으로는 만들지 않는다.
// 쓰기 가능 = 온라인 + (서버 동기화 없는 PC 저장소 이거나 기록 창(OWNER)·잠금 해제·저장 준비됨/자동 준비 가능). 그 밖은 단추를 막는다.
const clearWritable=()=>{if(globalThis.navigator?.onLine===false)return 'OFFLINE';if(mdSignedOut)return 'READ_ONLY';if(!mdProfile)return null;if(mdRole!=='OWNER'||!mdUnlocked)return 'READ_ONLY';return mdReady||mdAutoOK()?null:'READ_ONLY';};
// 아직 안 쌓은 입력(이 기기 초안)이 있는 기록은 비우지 않는다(비운 뒤 그 초안이 다시 쌓이면 값이 되살아남).
const clearPending=(type,id)=>type==='PLAN_DAY'?Boolean(planDrafts?.dates?.().includes(id)):type==='HLT_DAY'?hltPendingDates().includes(id)||(hltSt?.date===id&&hltSt?.flowState?.status==='LOCAL_DRAFT'):
  type==='LIFE_DAY'?Boolean(lifeSt&&((lifeSt.today===id&&lifeSt.flowState?.status==='LOCAL_DRAFT')||(lifeSt.pendingAll??[]).includes(id))):type==='STUDY_DAY'?Boolean((lifeSt?.today===id&&lifeSt.studyCard?.status==='LOCAL_DRAFT')||(studySt?.date===id&&studySt?.flowState?.status==='LOCAL_DRAFT')):
  type==='DIARY_DAY'?Boolean(lifeSt?.diary?.open&&((lifeSt.diary.date===id&&lifeSt.diary.status==='LOCAL_DRAFT')||(lifeSt.diary.drafts??[]).includes(id))):false;   // FIX73 (H71-1): 일기 초안도 같은 방식
let recordClear=null;
function recordClearNow(){
  if(!recordClear&&typeof lifeUi?.createRecordClear==='function')recordClear=lifeUi.createRecordClear({doc:document,getWhole:()=>whole,writable:clearWritable,pending:clearPending,opsLeft:()=>{const b=finOps();return b.known?b.remaining:null;},
    prepare:()=>hltCtx().syncForWrite(),write:(type,id,data,heads,reason='기록 비우기')=>{if(mdDraftMode())throw appError('MD_NOT_WRITE_READY');return entity(type,id,data,heads,reason);},after:hltReload,
    say:(text,error)=>status(text,error),rerender:()=>render(),perform,before:d=>dateBeforeFresh(d,FRESH_START),host:()=>document.body,confirm:text=>globalThis.confirm(text)});
  return recordClear;
}
// 되돌리기 창(8초) 동안 화면을 떠나거나 앱을 닫거나 가리면 보내지 않는다(연산 0).
function clearLeave(){try{recordClear?.cancel('LEAVE');}catch{/* 모듈을 읽는 중(아직 컨트롤러 없음) */}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearLeave();});
globalThis.addEventListener?.('pagehide',clearLeave);
const sealedDrafts=new Map();   // FIX51B B2: 새 기록(칭호·주간 리뷰·목표·모의고사)을 임시 저장(봉인)할 때 만든 초안 id. 저장 경로가 금고 값과 같아진 기록의 남은 초안을 지울 때 쓴다(내용 없이 id만)
const hltCtx=()=>({document,api,uid,sealedDrafts,opBatch:true,digest:sha,recordsDoor:()=>recordsMod?recordsMod.recordsOpen({getWhole:()=>whole}):false,now:()=>new Date().toISOString(),session:()=>mdSignedOutSeq,mdProfile:()=>mdProfile,getWhole:()=>whole,getChanges:()=>changes,freshBefore:d=>dateBeforeFresh(d,FRESH_START),freshText:FRESH_TEXT,getRawWhole:()=>wholeRaw,   /* V7D1: 새 시작 기준 전 날짜(읽기 전용)·필터 전 원본 */sessionSubjectName:id=>lifeUi?lifeUi.sessionSubjectName(whole?.life??null,id):null,studyStatsCard,
  syncForWrite:async()=>{if(mdProfile&&!mdReady){await mdAutoWrite();if(!mdReady)throw appError(autoWriteFail||'MD_NOT_WRITE_READY');}await hltReload();},
  hasPending:()=>Boolean(mdProduct?.pendingStatus),reconcile:async()=>{await api('/api/md/reconcile',{});await hltReload();},
  receipt:requestId=>api('/api/command/'+requestId),   // B19: 이 기기 금고의 그 requestId 결말(읽기 전용). 건강·공부 상자·메모리 포트의 재확정 수렴용
  entity:async(type,id,data,heads,reason)=>{const r=await entity(type,id,data,heads,reason);await afterEntity(type,id);return r;},reload:hltReload,draftMode:async()=>{if(await mdAutoWrite())autoLeaseHeld=true;return mdDraftMode();},   // H37-P1: 저장 결과(LOCAL_DRAFT)를 넘기고, 다시 저장 전에 지금도 임시 저장 모드인지 알려 준다(연결이 돌아왔으면 권한을 받아 정상 저장으로 간다)
  clearMenu:(type,id)=>recordClearNow()?.menu(type,id)??null,clearDay:(date,o)=>recordClearNow()?.dayButton(date,o)??null,freshLock:(root,date,o={})=>freshLockView(root,{date,start:FRESH_START,doc:document,...o}),   /* V7D2: 기록별 비우기 ⋯ 메뉴·하루 전체 단추, 기준 전 날짜 화면 잠금 */
  canDrafts:()=>mdProfile&&can('draft-list')&&can('draft-save'),write:body=>submit('/api/entity',body),cardDraftBox,
  entityWithBase:async(type,id,data,heads,reason,sealBase)=>{const r=await entity(type,id,data,heads,reason,false,{sealBase});await afterEntity(type,id);return r;},   // FIX54: 주간 리뷰·목표·모의고사. 임시 저장이면 초안에 금고 값(sealBase)을 함께 둔다(승인 때 병합)
  rerender:()=>render(),perform,confirmDialog:text=>globalThis.confirm(text),foldHealth:()=>nativeBr?.available()?nativeBr:null});
function errorText(code){const hold=holdGuidance(code);if(hold)return hold;return ({LOG_LIMIT:SAVE_TEXT.LOG_LIMIT,QUOTA_EXCEEDED:SAVE_TEXT.QUOTA,UNLOCK_FAILED:'비밀문구가 맞지 않습니다.',STALE_HEADS:'원본이 바뀌었습니다. 편집을 취소하고 최신 내용을 확인하세요.',INVALID_TEXT:'입력 길이와 내용을 확인하세요.',DEFERRED_REASON_REQUIRED:'보류 이유를 입력하세요.',INVALID_DECIMAL_AMOUNT:"금액은 숫자만 넣어 주세요 · 쉼표·마이너스·계산식은 쓸 수 없습니다 · 빚은 '부채'에 양수로 넣으세요",HOLD_CAPSULE_PUBLICATION:'저장 결과를 확정할 수 없습니다. 추가 저장을 중단했습니다. 파일을 삭제하거나 되돌리지 마세요.',HOLD_UNKNOWN_SAVE:'저장 결과가 불명확합니다. 새 요청으로 반복하지 마세요.',UNSAVED_ACTION_DRAFT:'이 행동의 오늘 입력을 먼저 저장하세요.',FRESH_START_READ_ONLY:'새 시작 전 기록은 읽기 전용입니다 · 기준 날짜 전 날짜는 고치거나 쌓지 않아요(금고에는 그대로 남아 있어요).',FINANCE_ITEMS_REQUIRED:'항목을 추가하거나 명시적으로 없음(0)을 선택하세요.'})[code]||(finErrorText(code)?finErrorText(code)+' · 문의 코드 ▾\u2060'+code+'\u2060':'처리하지 못했어요'+' · 문의 코드 ▾\u2060'+code+'\u2060');}
// B2C (DEFECT-1·2): 브라우저 저장소 오류(DOMException)의 .code는 숫자다. 아래 분기는 문자열 코드를 전제로 하므로 renderRestore 바로 뒤에서 문자열로 바꾼다(앞의 두 분기는 언제나 문자열 코드의 오류만 받는다).
function fail(error){let code=error.code||'HOLD_CONNECTION';if(error.finLocal){const text=finErrorText(code)||code;status(text,true);if($('editor').open)$('editor-error').textContent=text;return;}if(MODEL_VALIDATION_CODES.has(code)){const text=errorText(code);status(text,true);if($('editor').open)$('editor-error').textContent=text;return;}renderRestore();if(typeof error.code!=='string')code=error.name==='QuotaExceededError'?'QUOTA_EXCEEDED':'HOLD_CONNECTION';const newerRecord=Boolean(mdProfile)&&['INVALID_ENTITY_ID','INVALID_STUDY_MISTAKE','INVALID_STUDY_ITEMREF'].includes(code);/* D46 4.3: 이 앱보다 새 기록을 동기화·열기에서 만났을 때. 입력 검사는 화면이 저장 전에 하므로 여기까지 오지 않는다 */problem={code,kind:(code==='HOLD_STORE_FORMAT_NEWER_FAIL_CLOSED'||code.startsWith('UPDATE_REQUIRED')||newerRecord)?'UPDATE':['MD_PENDING_RECONCILE_REQUIRED','HOLD_UNKNOWN_SAVE'].includes(code)?'UNKNOWN':code==='MD_NOT_WRITE_READY'?'NOT_WRITE_READY':'ERROR'};if(mdProfile){if(code!=='MD_ALREADY_UNLOCKED'){mdReady=false;mdDraftReady=can('draft-save')&&mdRole==='OWNER'&&mdUnlocked;}const guidance={...(newerRecord?{[code]:SAVE_TEXT.UPDATE+' · 다른 기기가 이 앱보다 새로운 기록을 남겼습니다. 기록은 그대로 보존됩니다. 최신 앱으로 여세요.'}:{}),LOG_LIMIT:SAVE_TEXT.LOG_LIMIT,/* OPS1A: 금고 평생 연산 10,000 */QUOTA_EXCEEDED:SAVE_TEXT.QUOTA,STALE_HEADS:'원본이 바뀌어 저장하지 않았습니다 · 최신 내용을 확인하세요 · 임시 저장 줄은 다시 승인하면 지금 기록 위에 합쳐 봅니다 · 버리면 그 줄의 값은 남지 않습니다.',/* FIX58Q (HU2): "결과를 모르는 저장" 일반 문구 대신 */HOLD_STORE_FORMAT_NEWER_FAIL_CLOSED:SAVE_TEXT.UPDATE+' · 이 데이터는 더 새로운 LIFE BRICK 형식이라 열지 않았습니다. 기록은 그대로 보존됩니다. 최신 앱으로 여세요.',MD_NOT_WRITE_READY:(autoWriteFail==='QUOTA_EXCEEDED'?SAVE_TEXT.QUOTA:autoWriteFail==='WRITER_BUSY'||autoWriteFail==='STALE_HEAD'?'다른 기기나 창이 기록 중입니다 · 입력은 그대로 남아 있습니다 · 최대 약 2분 뒤 같은 입력으로 다시 저장하세요(자동 재시도는 한 번만 했습니다). 방금 닫은 이 기기의 창일 수도 있습니다.':/^AUTH_/.test(autoWriteFail||'')?'로그인이 만료되어 저장하지 못했습니다 · 입력은 그대로 남아 있습니다 · 연결 · 장치에서 서버 로그인 후 다시 저장하세요.':autoWriteFail==='OFFLINE'?'오프라인이라 저장하지 못했습니다 · 입력은 그대로 남아 있습니다 · 연결되면 다시 저장하세요.':'지금은 서버에 저장할 수 없습니다 · 연결 · 장치에서 동기화하고 더보기 > 고급에서 저장 준비를 하세요.'),MD_PENDING_RECONCILE_REQUIRED:SAVE_TEXT.CHECK+' · 이 저장이 서버에 반영됐는지 아직 모릅니다. 새로 저장하지 말고 더보기 > 고급에서 "결과 모르는 저장 확인"을 누르세요.',HOLD_MIGRATION_FAILED:'업데이트를 마무리하지 못함 · 기록은 보호됨 · 앱을 다시 열어 저장된 상태를 확인하세요.',UPDATE_REQUIRED_READ_ONLY_HOLD:'앱 업데이트 필요 · 읽기 전용으로 보호됨 · 최신 앱으로 계속하세요.',UPDATE_REQUIRED_SERVER_CONTRACT:'읽기 전용으로 보호됨 · 이 서버와 앱의 업데이트 준비를 확인해야 합니다.',AUTH_AAL2_REQUIRED:'서버 로그인이 이메일 코드 단계까지만 확인된 상태입니다 · 연결 · 장치에서 인증 앱(TOTP) 코드까지 입력하세요. 저장된 로그인이 복원되지 않았다면 "로그인 복원" 줄의 이유를 확인하세요.',AUTH_EXPIRED:'서버 로그인이 만료되었습니다 · 연결 · 장치에서 서버 로그인 후 다시 시도하세요. "로그인 복원" 줄에 복원하지 못한 이유가 표시됩니다.',AUTH_NOT_PROVISIONED:SAVE_TEXT.NOT_PROVISIONED+' · 이 기기에서 읽기와 임시 저장만 가능합니다.',MD_ROUTE:'이 앱 구성에서는 사용할 수 없는 기능입니다.',MD_ALREADY_UNLOCKED:'이 탭의 저장소는 이미 열려 있습니다. 중복 잠금해제 대신 현재 상태를 확인하세요.',MD_NO_LOCAL_PROFILE:'이 브라우저 저장소에 등록 정보가 없습니다. 이 사이트와 브라우저 저장소를 확인하세요.',MD_PROFILE_SELECTION_REQUIRED:'여러 등록 정보 중 사용할 항목을 먼저 선택하세요.',MD_LOCAL_RECORD_MISSING_OR_MISMATCH:'선택한 기록이 없거나 사이트 정보가 맞지 않습니다. 사이트 데이터를 지우거나 새 등록을 시작하지 마세요.',MD_LOCAL_FOLLOWER_READ_ONLY:'이 탭은 읽기 전용입니다. 저장 중인 탭을 끝낸 뒤 이 탭에서 최신 기록을 다시 여세요.',MD_LOCAL_OWNER_BUSY:'다른 탭이 아직 저장 중입니다. 그 탭을 끝낸 뒤 다시 시도하세요.',MD_LOCAL_OWNER_LOCK_UNAVAILABLE:'브라우저의 배타적 탭 잠금을 사용할 수 없어 쓰기를 차단했습니다.',MD_LOCAL_OWNER_CLOSING:'창 넘기기 또는 기록 다시 열기 중입니다. 새 작업을 시작하지 마세요.'};const shown=holdGuidance(code)??guidance[code]??(finErrorText(code)?finErrorText(code)+' · 문의 코드 ▾\u2060'+code+'\u2060':'처리하지 못했어요 · 결과를 모르는 저장은 확인한 뒤 진행하세요.'+' · 문의 코드 ▾\u2060'+code+'\u2060');status(shown,true);saRejected(code,shown);applyMDLocks();refreshSaveCards();return;}if(code.startsWith('HOLD_')||code.startsWith('SECURITY_'))ended=true;status(errorText(code),true);if($('editor').open)$('editor-error').textContent=errorText(code);refreshSaveCards();}
async function perform(fn){if(busy||ended)return;lock(true);try{await fn();}catch(e){fail(e);}finally{lock(false);}}
async function api(path,body){if(mdBackend)return mdBackend.request(path,body);const headers={};if(capability)headers.Authorization='Bearer '+capability;if(body!==undefined)headers['Content-Type']='application/json';const response=await fetch(path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});const result=await response.json();if(!response.ok)throw appError(result.code||'HOLD_HTTP_RESPONSE');return result;}
// V7D1: 쓰기 거절의 한 곳. 새 시작 기준 전 날짜의 하루·주 기록·행동 결과는 금고로도 임시 저장으로도 보내지 않는다(연산 0, 서버·상자 접근 0).
// 줄을 떼어 돌리는 기존 하니스(B3c 등)에서도 터지지 않게 typeof 로 감싼다.
function freshGuard(path,body){const blocked=freshWriteBlock(path,body,FRESH_START);if(blocked)throw appError(blocked);}
async function submit(path,body,seal=null){if(typeof freshGuard==='function')freshGuard(path,body);const result=await submitWrite(path,body,seal);lastSave={status:result.status,at:Date.now()};return result;}
// MD03 P1 (noncanonical): on the Windows app an unlocked OWNER copy takes the write lease by itself for one save
// (sync -> acquire -> save -> release), so other devices are not blocked and no extra button is needed.
let autoWriteFail=null,autoSyncBusy=false,autoSyncLast=0,autoSyncFails=0;
const AUTO_SYNC_MIN_GAP_MS=15000,AUTO_SYNC_MAX_FAILS=3,AUTO_ACQUIRE_RETRY_MS=3000;
// B37: MD_PENDING_UNRESOLVED has two causes the service reports with the same code (unknown-result save vs. a device pairing in progress).
// md:status carries pendingIntent only for the save, so UNLOCKED + pendingIntent null means the pairing; a missing status stays neutral.
const pendingCause=st=>!st||st.state!=='UNLOCKED'?'UNKNOWN':st.pendingIntent?'SAVE':'PAIRING';
const autoSyncText=(code,st)=>/^AUTH_/.test(code||'')?'로그인이 만료되어 동기화하지 못했습니다 · 읽기 화면은 그대로입니다 · 연결 · 장치에서 서버 로그인 후 동기화하세요.':code==='MD_PENDING_UNRESOLVED'?(({SAVE:'결과 모르는 저장이 있어 동기화하지 못했습니다 · 읽기 화면은 그대로입니다 · 더보기 > 고급에서 "결과 모르는 저장 확인"을 누르세요.',PAIRING:'장치 연결이 진행 중이라 동기화를 잠시 멈췄습니다 · 연결을 마치거나 \'현재 세션 종료\'를 누르세요.',UNKNOWN:'동기화를 잠시 멈췄습니다 · 결과 모르는 저장 또는 진행 중인 장치 연결 때문입니다 · 연결 · 장치에서 상태를 확인하세요.'})[pendingCause(st)]):!code?'오프라인 · 마지막으로 확인된 기록입니다(동기화 전).':'동기화하지 못했어요 · 읽기 화면은 유지됩니다.'+' · 문의 코드 ▾\u2060'+code+'\u2060';
// Automatic read-only sync (open / return to the app / back online). Never takes the write lease, never touches a screen the user is typing in,
// never throws, and stops retrying after 3 failures in a row (open and online start over).
async function mdAutoSync(reason){
 if(!mdAutoOK()||autoSyncBusy||busy||ended)return;const now=Date.now();
 if(reason==='open'||reason==='pair-done')autoSyncFails=0;else{if(reason==='online')autoSyncFails=0;if(now-autoSyncLast<AUTO_SYNC_MIN_GAP_MS||autoSyncFails>=AUTO_SYNC_MAX_FAILS)return;}
 autoSyncBusy=true;autoSyncLast=now;
 try{
  for(let attempt=0;;attempt++){try{await api('/api/md/sync',{});break;}catch(e){if(attempt>=1||/^AUTH_/.test(e?.code||''))throw e;}}
  autoSyncFails=0;widgetFile.syncAt=new Date().toISOString();mdApply(await api('/api/md/status',{}));
  if($('editor').open||drafts.size)renderProductState();else await refresh();
  status('동기화됨 · '+saveState().title);
 }catch(e){autoSyncFails++;let st=null;try{st=await api('/api/md/status',{});mdApply(st);}catch{st=null;}status(autoSyncText(e?.code,st),true);applyMDLocks();}
 finally{autoSyncBusy=false;}
}
// B37: once a device pairing ends (approve ACK confirmed, or the session cancelled/aborted) run the same read-only auto sync once more.
// It waits (bounded, 20 x 250 ms) for a running button action or sync to finish and never takes the write lease or calls reconcile.
function resyncAfterPairing(n=0){if(n>=20||ended)return;if(busy||autoSyncBusy){setTimeout(()=>resyncAfterPairing(n+1),250);return;}void mdAutoSync('pair-done');}
// Save-time write lease: BROWSER asks for the lease only (acquire already syncs first) and retries a busy lease once after 3 s; APP_SHELL keeps sync -> acquire once.
async function mdAutoWrite(){
 autoWriteFail=null;if(mdReady||!mdAutoOK())return false;
 for(let attempt=0;attempt<2;attempt++){
  try{if(mdSurface!=='BROWSER')await api('/api/md/sync',{});await api('/api/md/acquire',{});}
  catch(e){if(mdSurface==='BROWSER'&&attempt===0&&['WRITER_BUSY','STALE_HEAD'].includes(e?.code)){await new Promise(r=>setTimeout(r,AUTO_ACQUIRE_RETRY_MS));continue;}autoWriteFail=typeof e?.code==='string'?e.code:e?.name==='QuotaExceededError'?'QUOTA_EXCEEDED':e?.code==null?'OFFLINE':'HOLD_CONNECTION';}
  break;
 }
 try{mdApply(await api('/api/md/status',{}));}catch{}
 if(mdReady)autoSyncFails=0;return mdReady;
}
// The lease is kept for 20 s after the last save (so the post-save status check still sees a write-ready copy and
// several saves in one screen reuse it), then released; the Save-and-Exit button releases it at once.
let autoLeaseHeld=false,autoLeaseTimer=null;
async function mdReleaseNow(){clearTimeout(autoLeaseTimer);autoLeaseTimer=null;const held=autoLeaseHeld;autoLeaseHeld=false;if(!held||!mdProfile)return;try{await api('/api/md/release',{});}catch{}try{mdApply(await api('/api/md/status',{}));}catch{}}
async function submitWrite(path,body,seal=null){const auto=await mdAutoWrite();if(auto){autoLeaseHeld=true;clearTimeout(autoLeaseTimer);}try{return await submitWriteOnce(path,body,seal);}finally{if(autoLeaseHeld){clearTimeout(autoLeaseTimer);autoLeaseTimer=setTimeout(()=>{void mdReleaseNow();},20000);}}}
async function submitWriteOnce(path,body,seal=null){if(mdDraftMode()&&DRAFT_ROUTES[path]){const r=await api('/api/md/draft-save',{type:DRAFT_ROUTES[path],body,...(seal?{sealBase:seal.sealBase}:{})});return {...r,status:'LOCAL_DRAFT'};}if(mdProfile&&!mdReady)throw appError('MD_NOT_WRITE_READY');try{return await api(path,body);}catch(error){if(error.code)throw error;try{const r=await api('/api/command/'+body.requestId);if(r.status===savedStatus())return r;}catch{}if(mdProfile){mdReady=false;throw appError('MD_PENDING_RECONCILE_REQUIRED');}ended=true;throw appError('HOLD_UNKNOWN_SAVE');}}
async function command(type,fields){return {requestId:uid(),commandDigest:await sha({type,...fields}),...fields};}
async function entity(type,id,data,heads=[],reason='사용자 편집',confirmed=false,seal=null){const result=await submit('/api/entity',await command('ENTITY',{entityType:type,entityId:id,expectedHeads:heads,data,reason:reason.trim(),confirmed}),seal);if(result.status!==savedStatus())throw appError('HOLD_UNKNOWN_SAVE');return result;}
async function refresh(){return timed(refreshTimings,'refresh',refreshCore);}
// B14 (R1-01): 읽은 값은 모든 읽기가 끝나고 세대가 그대로일 때만 today·whole·changes에 넣는다. 읽는 도중 잠겼으면(signedOutLock이 이미 비움) 아무것도 넣지 않고
// 남은 읽기도 하지 않는다. 뒤 읽기가 예외로 끝나도 앞서 받은 응답은 메모리에 남지 않는다.
async function refreshCore(){const lockSeq=mdSignedOutSeq;if(mdProfile){mdApply(await api('/api/md/status',{}));}const first=$('workspace').hidden;const [readToday,readWhole]=await Promise.all([api('/api/today'),api('/api/whole-life')]);if(lockSeq!==mdSignedOutSeq)return;const readChanges=(await api('/api/history')).changes;if(lockSeq!==mdSignedOutSeq)return;const {today:nextToday,whole:nextWhole,changes:nextChanges}=typeof freshRead==='function'?freshRead(readToday,readWhole,readChanges):{today:readToday,whole:readWhole,changes:readChanges};today=nextToday;whole=nextWhole;changes=nextChanges;if(typeof withActionDays==='function')withActionDays();mdSignedOut=false;calendarDate??=whole.localDate;problem=null;$('setup').hidden=true;$('workspace').hidden=false;$('navigation').hidden=false;$('save-exit').hidden=false;if(mdHost){mdPanel.remove();mdHost.hidden=true;}$('session-state').textContent=sessionLabel();if(typeof finTxOpen==='function')finTxOpen();if(typeof pcWidget==='function')void pcWidget();if(typeof nativeWidget==='function')nativeWidget();await render();if(typeof stateOpenExport==='function')void stateOpenExport();if(first)window.scrollTo(0,0);}
function sessionLabel(){if(!mdProfile)return '이 PC · 잠금해제됨';if(mdRole==='FOLLOWER')return mdSurface==='BROWSER'?'읽기 전용 탭':'읽기 전용 창';return mdReady?'기록 가능 · 바로 동기화':mdAutoOK()?'기록 가능 · 저장할 때 자동 동기화':mdDraftReady?'이 기기에 임시 저장만 가능':'읽기 전용';}
async function sessionStream(){streamController=new AbortController();try{const response=await fetch('/api/session-stream',{headers:{Authorization:'Bearer '+capability},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:streamController.signal});if(!response.ok)throw new Error('stream');const reader=response.body.getReader();while(!(await reader.read()).done){}if(!ended)throw new Error('closed');}catch{if(!ended){ended=true;status('앱 연결이 종료되었습니다. LIFE BRICK 앱을 다시 여세요.',true);lock(false);}}}
function setup(state){if(state.profile==='LBOS_SEQUENTIAL_OWNER_APP_1'){mdProfile=true;mdSurface=state.surface;setupMD(state);return;}setupState=state.state;if($('storage-label'))$('storage-label').textContent='이 PC에 암호화 저장';if($('sync-label'))$('sync-label').textContent='클라우드 연결 없음';if(state.state==='RECOVERY_ONLY'){$('setup').hidden=false;$('setup-heading').textContent='검증된 복원본 만들기';$('setup-form').hidden=true;add($('setup'),button('백업에서 복원…',showRecovery,'primary'));$('save-exit').hidden=false;$('session-state').textContent='복구 전용 · 현재 저장소를 열지 않음';status('RECOVER_LIFE_BRICK.cmd · 기존 저장소를 교체하지 않습니다.');return;}add($('setup'),button('백업에서 복원…',showRecovery));$('setup').hidden=false;const fresh=state.state==='SETUP';$('setup-heading').textContent=fresh?'이 PC에서 시작하기':'내 저장소 잠금해제';$('setup-submit').textContent=fresh?'새 저장소 만들기':'잠금해제';$('new-only').hidden=!fresh;$('recovery-only').hidden=!fresh;$('recovery-secret').required=fresh;$('seed-titles').replaceChildren();for(const seed of state.seeds||[]){const input=field($('seed-titles'),seed.actionId,'text',seed.title);input.required=true;input.maxLength=100;input.dataset.actionId=seed.actionId;}status(fresh?'잠금해제와 복구용 비밀문구는 서로 다르게 정해 안전하게 보관하세요.':'기존 기록을 열려면 잠금해제 비밀문구를 입력하세요.');}
$('setup-form').addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{try{if(setupState==='SETUP'){const inputs=[...$('seed-titles').querySelectorAll('input')],seeds=inputs.map((n,i)=>({actionId:n.dataset.actionId,title:n.value,active:true,displayOrder:i}));const r=await submit('/api/vault/create',{requestId:uid(),commandDigest:await sha({type:'INITIALIZE',seeds}),unlockSecret:$('unlock-secret').value,recoverySecret:$('recovery-secret').value,titles:inputs.map(n=>n.value)});if(r.status!==savedStatus())throw appError('HOLD_UNKNOWN_SAVE');}else await api('/api/vault/unlock',{unlockSecret:$('unlock-secret').value});await refresh();status(savedMessage());}finally{$('unlock-secret').value='';$('recovery-secret').value='';}});});
function navigate(next,{focus=true}={}){void perform(async()=>{if(ROUTE_ALIAS[next]){if(next==='HOUSE')houseFocus=true;next=ROUTE_ALIAS[next];}if(next==='CALENDAR'&&planMonthOn()){next='PLANS';planSt.view='MONTH';planSt.monthDates=true;}view=next;if(typeof clearScreenNote==='function')clearScreenNote();if(typeof clearLeave==='function')clearLeave();/* V7D2: 화면을 떠나면 기다리던 비우기는 보내지 않는다 */await render();window.scrollTo(0,0);if(houseFocus){houseFocus=false;$('house')?.scrollIntoView({block:'start'});}if(focus)$('page-title').focus({preventScroll:true});});}
// B14 (R6-01): gone()은 이 render가 시작한 뒤 로그아웃 잠금이 끼었는지 본다(참이면 그 사이 채워진 건강·공부 사본을 다시 비움). renderCore는 await마다 보고,
// 끼었으면 calendarState·hltSt·studySt·화면에 아무것도 넣지 않고 끝낸다. 달력 보기 버튼(renderCalendar)도 같은 gone으로 다시 그린다.
async function render(){if(mdSignedOut)return;if(typeof withActionDays==='function')withActionDays();const seq=mdSignedOutSeq,gone=()=>{if(seq===mdSignedOutSeq)return false;if(mdSignedOut)for(const st of [hltSt,studySt])if(st){st.raw=null;st.flowState=null;}return true;};const out=await timed(renderTimings,'render',()=>renderCore(gone));if(typeof paintPendingLine==='function')paintPendingLine();if(typeof paintOpWarn==='function')paintOpWarn();return out;}   // S1c: 로그아웃 뒤에는 메모리 사본으로 화면을 다시 그리지 않는다
async function renderCore(gone=()=>false){if(ROUTE_ALIAS[view])view=ROUTE_ALIAS[view];if(view==='HEALTH'&&!hltOn())view='HOME';if(view==='STUDY'&&!studyOn())view='HOME';const [title,sub]=VIEW_META[view];$('page-kicker').textContent=VIEW_META[view][2]||view;$('page-title').textContent=title;$('page-title').tabIndex=-1;$('page-subtitle').textContent=sub;renderNav();const root=$('view-content');root.replaceChildren();if(view==='CALENDAR'){calendarMode??=narrow()?'7_DAY':'MONTH';const cal=await api('/api/calendar-view',{mode:calendarMode,date:calendarMode==='7_DAY'?(d=>{/* CAL1: 7일 보기 = 기준일이 든 주의 월요일부터(기준일 calendarDate는 그대로). 날짜가 아니면 그대로 보내 달력 계산이 거절하게 두고, 월요일이 0000-01-01 앞이면 0000-01-01 */const t=/^\d{4}-\d{2}-\d{2}$/.test(d??'')?Date.parse(d+'T12:00:00Z'):NaN;if(Number.isNaN(t)||new Date(t).toISOString().slice(0,10)!==d)return d;const m=new Date(t-(new Date(t).getUTCDay()+6)%7*86400000).toISOString().slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(m)?m:'0000-01-01';})(calendarDate):calendarDate});if(gone())return;calendarState=cal;}if(view==='HEALTH'||view==='STUDY'){await cardDraftReady;if(gone())return;}if((view==='HOME'||view==='STATUS')&&lifeUi){await cardDraftReady;if(gone())return;try{await lifeUi.prepareLife(lifeCtx(),lifeSt,gone);}catch{if(!gone())lifeSt.flowState=null;}if(gone())return;}if(view==='ACTIONS'&&lifeUi){await cardDraftReady;if(gone())return;try{await lifeUi.prepareLife(lifeCtx(),lifeSt,gone);}catch{if(!gone())lifeSt.flowState=null;}if(gone())return;}if(view==='HOME'&&studyOn()){await cardDraftReady;if(gone())return;try{await studyUi.prepareStudy(hltCtx(),studySt,gone);}catch{if(!gone())studySt.flowState=null;}if(gone())return;}if(view==='HEALTH'){await hltUi.prepareHealth(hltCtx(),hltSt,gone);if(gone())return;hltUi.renderHealth(root,hltCtx(),hltSt);applyMDLocks();return;}if(view==='STUDY'){await studyUi.prepareStudy(hltCtx(),studySt,gone);if(gone())return;studyUi.renderStudy(root,hltCtx(),studySt);applyMDLocks();return;}if(view==='STATUS'){renderStatus(root);applyMDLocks();return;}({HOME:renderHome,ACTIONS:renderToday,LIFE:renderLife,PLANS:renderPlans,CALENDAR:renderCalendar,FINANCE:renderFinance,LEDGER:renderLedger,PROGRESS:renderProgress,HISTORY:renderHistory,SETTINGS:renderSettings,DEVICES:renderDevices,MORE:renderMore,ADVANCED:r=>renderAdvanced(r)})[view](root,gone);applyMDLocks();}
// SA_FIXES (2026-10-29): display only. Nothing in this block changes what is saved, when, or how (no sync, lease, crypto or server protocol code).
// F1: a rejected save also shows its reason and the recovery path inside the open editor window and on the cards that still hold unsaved input (called from fail()).
// F2: once write-ready is confirmed again (renderProductState), only the red lines of resolvable rejections are cleared. HOLD_*, MD_PENDING_RECONCILE_REQUIRED and
// UPDATE_* are not in this set and are never cleared. A line is cleared only after the backend was seen not write-ready and later write-ready again.
const SA_RESOLVABLE=new Set(['STALE_HEADS','STALE_HEAD','MD_NOT_WRITE_READY','WRITER_BUSY']);
let saState=null,saEditor=null,saRendering=0;
function saRejectLine(code,shown){
 if(!SA_RESOLVABLE.has(code))return shown;
 const why=autoWriteFail||'',login=/^AUTH_/.test(why);
 const reason=code==='STALE_HEADS'?'다른 기기에서 먼저 바뀐 내용이 있어 저장이 거절되었습니다':login?'서버 로그인이 만료되어 저장하지 못했습니다':why==='OFFLINE'?'오프라인이라 저장하지 못했습니다':code==='WRITER_BUSY'||code==='STALE_HEAD'||why==='WRITER_BUSY'||why==='STALE_HEAD'?'다른 기기나 창이 기록 중이라 저장하지 못했습니다':'저장 준비가 안 되어 저장하지 못했습니다';
 return '저장 거절 · '+reason+' · 복구: 연결 · 장치 → '+(login?'서버 로그인 → ':'')+'최신 내용 동기화 → 더보기 > 고급의 저장 준비하기';
}
function saRejected(code,shown){
 const line=saRejectLine(code,shown),open=$('editor').open;
 saState={code,text:shown,line,lapsed:mdProduct?.freshness!=='SYNCED_WRITE_READY'};
 saEditor=open?{controls:saIn([$('editor-content')]),lastSave}:null;
 if(open)$('editor-error').textContent=line;
 for(const card of document.querySelectorAll('#view-content .action-card')){
  if(!drafts.has(card.dataset.actionId))continue;
  let n=card.querySelector('.sa-reject');
  if(!n){n=el('p',null,'save-state sa-reject');n.dataset.kind='changed';n.setAttribute('role','alert');const r=card.querySelector('.save-row');if(r)r.after(n);else card.append(n);}
  n.textContent=line;
 }
}
function saTrack(){
 if(!saState)return;
 if(mdProduct?.freshness!=='SYNCED_WRITE_READY'){saState.lapsed=true;return;}
 if(!saState.lapsed||!mdReady||!SA_RESOLVABLE.has(saState.code))return;
 const s=saState;saState=null;
 if($('status').dataset.error==='true'&&$('status').textContent===s.text)status('');
 if($('editor').open&&$('editor-error').textContent===s.line)$('editor-error').textContent='';
 for(const n of [...document.querySelectorAll('.sa-reject')])n.remove();
 if(problem&&SA_RESOLVABLE.has(problem.code)){problem=null;refreshSaveCards();}
}
// F3: nothing the owner changed may disappear without a notice. Card input lives in `drafts` and survives a redraw; every other control that carries a change
// (plan milestone toggles, display checkboxes, ...) is compared with the rebuilt screen. What is dropped is listed in a banner that stays until it is closed.
// The values stay in memory and on the screen only: no file, log, storage or network use.
const saRaw=n=>n.type==='checkbox'?(n.checked?'1':'0'):String(n.value??'');
const saShown=n=>n.type==='checkbox'?(n.checked?'켜짐':'꺼짐'):n.tagName==='SELECT'?String(n.selectedOptions?.[0]?.textContent??n.value??''):String(n.value??'');
const saLabel=n=>n.getAttribute('aria-label')||'';
function saIn(nodes){
 const out=[];
 for(const x of nodes){
  if(x?.nodeType!==1)continue;
  for(const n of [...(x.matches('input,textarea,select')?[x]:[]),...x.querySelectorAll('input,textarea,select')]){
   if(['password','hidden','radio','file'].includes(n.type)||!saLabel(n)||n.closest('.action-card,#md-controls'))continue;
   out.push(n);
  }
 }
 return out;
}
function saStamp(root){for(const n of saIn([root])){n.dataset.editKey=view+'|'+saLabel(n);n.dataset.editInit=saRaw(n);}}
function saDirty(nodes){return saIn(nodes).filter(n=>n.dataset.editKey!==undefined&&saRaw(n)!==n.dataset.editInit).map(n=>({key:n.dataset.editKey,label:saLabel(n),raw:saRaw(n),shown:saShown(n)}));}
const saLost=[];
function saNotify(items,why){
 for(const i of items)if(!saLost.some(x=>x.label===i.label&&x.value===i.value&&x.now===i.now))saLost.push({...i,why});
 saBanner();
}
function saBanner(){
 let box=document.getElementById('sa-dropped');
 if(!saLost.length){box?.remove();return;}
 if(!box){box=el('section',null,'save-state-card tone-alert');box.id='sa-dropped';box.setAttribute('role','alert');$('status').after(box);}
 const main=add(el('div',null,'state-main'),el('span','저장하지 않은 입력','state-kicker'),el('strong','입력한 내용이 화면에서 사라졌습니다 · 아래 내용을 확인하세요'),el('p','저장되지 않은 채 화면이 서버에 저장된 값으로 바뀌었거나 창이 닫혔습니다. 이 내용은 화면에만 표시되고 파일·로그·서버로 보내지 않습니다. 닫기를 누를 때까지 남습니다.'));
 for(const i of saLost)add(main,el('p',i.label+' · '+i.why,'small'),el('pre',i.value===''?'(빈 값)':i.value.length>4000?i.value.slice(0,4000)+'…':i.value,'path'),i.now===null?null:el('p','지금 화면의 값: '+(i.now===''?'(빈 값)':i.now),'muted small'));
 box.replaceChildren(main,button('닫기',()=>{saLost.length=0;saBanner();},'secondary'));
}
function saReconcile(dirty,root){
 if(!dirty.length)return;
 const nodes=saIn([root]),now=new Map(nodes.map(n=>[n.dataset.editKey,n]));
 // FIX44 (AUD1 #1): 같은 키가 둘 이상이면 어느 칸끼리 비교할지 알 수 없다. 다른 칸과 비교해 거짓 경고를 내지 않도록 비교에서 뺀다.
 const many=list=>{const seen=new Set(),dup=new Set();for(const k of list){if(seen.has(k))dup.add(k);seen.add(k);}return dup;},dup=new Set([...many(nodes.map(n=>n.dataset.editKey)),...many(dirty.map(d=>d.key))]);
 const lost=dirty.filter(d=>{if(dup.has(d.key))return false;const n=now.get(d.key);return !n||saRaw(n)!==d.raw;});
 if(lost.length)saNotify(lost.map(d=>{const n=now.get(d.key);return {label:d.label,value:d.shown,now:n?saShown(n):null};}),'화면이 다시 그려지며 사라짐');
}
const saRenderBase=render;
render=async function render(){
 const root=$('view-content'),dirty=saDirty([root]);saRendering++;
 try{return await saRenderBase();}
 finally{saRendering--;saStamp(root);saReconcile(dirty,root);}
};
// Wipes of #view-content outside render() (owner hand-off) and a closed editor window whose save was rejected.
if(globalThis.MutationObserver)new MutationObserver(records=>{
 if(saRendering)return;
 const dirty=saDirty(records.flatMap(r=>[...r.removedNodes]));
 if(dirty.length)saNotify(dirty.map(d=>({label:d.label,value:d.shown,now:null})),'화면이 비워지며 사라짐');
}).observe($('view-content'),{childList:true});
$('editor').addEventListener('close',()=>{
 const e=saEditor;saEditor=null;
 if(!e||lastSave!==e.lastSave)return;
 const items=e.controls.filter(n=>saRaw(n)!==''&&saRaw(n)!=='0').map(n=>({label:saLabel(n),value:saShown(n),now:null}));
 if(items.length)saNotify(items,'거절된 저장 창이 닫히며 사라짐');
});
// SA_FIXES_END
function navButton(key,label,icon,active,cls){const n=el('button',null,'nav-item '+cls+(active?' active':'')),mark=el('span',icon,'nav-symbol');n.type='button';n.dataset.navOnly='1';n.dataset.view=key;mark.setAttribute('aria-hidden','true');add(n,mark,el('span',label,'nav-label'));n.setAttribute('aria-label',label);if(active)n.setAttribute('aria-current','page');n.addEventListener('click',()=>navigate(key));return n;}
function renderNav(){$('navigation').replaceChildren(...TABS.map(([key,label,icon,views])=>navButton(key,label,icon,views.includes(view),'nav-core')));renderSegments();updateUnsaved();}
// 탭 안 화면 전환(계획 | 달력 등). 영역(LIFE)은 경로만 살려 두고 단추를 뺀다(A1A, 옛 링크는 계속 열림). #view-content 밖에 두어 달력처럼 자기 칸만 다시 그리는 화면에서도 남는다. 잠금과 상관없이 이동은 되므로 navOnly.
function renderSegments(){const box=$('view-segment');if(!box)return;const tab=TABS.find(t=>t[3].includes(view)),keys=tab?.[0]==='RECORDS'?['ACTIONS',...(hltOn()?['HEALTH']:[]),...(studyOn()?['STUDY']:[]),'HISTORY']:tab?.[0]==='MORE'?[]:(tab?.[3]??[]).filter(k=>k!=='LIFE'),shown=shownViews().filter(n=>keys.includes(n[0])&&(n[0]!=='CALENDAR'||view==='CALENDAR'||!planMonthOn()));if(shown.length<2){box.replaceChildren();return;}const bar=el('div',null,'segment lb-segment');bar.setAttribute('role','toolbar');bar.setAttribute('aria-label',tab[1]+' 화면');box.replaceChildren(add(bar,...shown.map(([key,label])=>{const b=button(label,()=>navigate(key),key===view?'selected':'');b.dataset.navOnly='1';if(key===view)b.setAttribute('aria-current','page');return b;})));}
function updateUnsaved(){for(const n of document.querySelectorAll('#navigation [data-view="RECORDS"]')){if(drafts.size){n.dataset.unsaved=String(drafts.size);n.setAttribute('aria-label','기록 · 저장하지 않은 입력 '+drafts.size+'건');}else{delete n.dataset.unsaved;n.setAttribute('aria-label','기록');}}}
// Truthful save/sync state: one plain sentence per existing technical state; codes stay under "기술 정보".
function saveState(){
 if(!mdProfile)return {key:'LOCAL_SAVED',title:SAVE_TEXT.LOCAL_SAVED,detail:'이 PC의 암호화 저장소에 저장합니다 · 다른 기기와 동기화하지 않습니다.'+(problem?' · 마지막 작업 실패: '+(holdGuidance(problem.code)??'처리하지 못했어요')+' · 문의 코드 ▾\u2060'+problem.code+'\u2060':''),tone:problem?'warn':'ok',codes:['LOCAL_SAVED',problem?.code]};
 const p=mdProduct||{},n=p.drafts||0,drafted=n?SAVE_TEXT.LOCAL_DRAFT+' '+n+'건':null,failed=problem?' · 마지막 작업 실패: '+(holdGuidance(problem.code)??'처리하지 못했어요')+' · 문의 코드 ▾\u2060'+problem.code+'\u2060':'';
 const codes=[p.localCopy,p.serverSync,p.freshness,p.pendingStatus,p.lastOnlineFailure?'lastOnlineFailure='+p.lastOnlineFailure:null,n?'LOCAL_DRAFT×'+n:null,problem?.code,lastSave?'lastSave='+lastSave.status:null];
 if(problem?.kind==='UPDATE')return {key:'UPDATE_REQUIRED',title:SAVE_TEXT.UPDATE,detail:'이 데이터는 더 새로운 LIFE BRICK 형식입니다. 열거나 바꾸지 않았고 기록은 보존됩니다.',tone:'alert',codes};
 if(p.freshness==='HOLD')return {key:'HOLD',title:SAVE_TEXT.CHECK,detail:'서버 결과와 이 기기 반영이 맞는지 확인하기 전까지 새 기록을 멈춥니다. 파일을 지우거나 되돌리지 마세요.',tone:'alert',action:'ADVANCED',actionLabel:'저장 확인하러 가기',codes};
 if(p.freshness==='UNKNOWN'||problem?.kind==='UNKNOWN')return {key:'OUTCOME_UNKNOWN',title:SAVE_TEXT.CHECK,detail:'마지막 저장이 서버에 반영됐는지 아직 모릅니다. 새로 저장하지 말고 더보기 > 고급의 "결과 모르는 저장 확인"으로 같은 요청의 결과를 확인하세요.',tone:'alert',action:'ADVANCED',actionLabel:'저장 확인하러 가기',codes};
 if(p.localCopy==='LOCKED')return {key:'LOCKED',title:SAVE_TEXT.LOCKED,tone:'info',codes};
 if(mdRole==='FOLLOWER')return {key:'FOLLOWER',title:SAVE_TEXT.FOLLOWER,detail:'이 창에서는 저장·동기화·임시 저장이 차단됩니다.',tone:'warn',action:'DEVICES',codes};
 if(p.serverSync==='SERVER_SYNC_NOT_PROVISIONED')return {key:'NOT_PROVISIONED',title:drafted?drafted+' · '+SAVE_TEXT.NOT_PROVISIONED:SAVE_TEXT.NOT_PROVISIONED,detail:'이 앱은 서버에 연결하지 않습니다. 새 기록은 이 기기에 임시 저장만 되고 쌓인 기록이 되지 않습니다.'+failed,tone:problem?'warn':'info',action:n?'DEVICES':null,actionLabel:'임시 저장 목록',codes};
 if(p.freshness==='SYNCED_WRITE_READY'){const v=lastSave?.status==='REMOTE_COMMITTED_AND_LOCAL_CONFIRMED';return {key:v?'VERIFIED':'WRITE_READY',title:(v?SAVE_TEXT.VERIFIED:SAVE_TEXT.WRITE_READY)+(drafted?' · '+drafted:''),detail:(n?'임시 저장은 연결 · 장치에서 하나씩 승인해 쌓을 수 있습니다.':'')+failed,tone:problem?'warn':'ok',action:n?'DEVICES':null,actionLabel:'임시 저장 쌓기',codes};}
 // F11: 자동으로 기록 권한을 받을 수 있는 상태(mdAutoOK)면 권한을 따로 받으라고 하지 않는다. 동작은 그대로다.
 if(p.freshness==='SYNCED_VERIFIED_READ_ONLY'){const auto=mdAutoOK();return {key:'READ_ONLY',title:(auto?SAVE_TEXT.READ_ONLY_AUTO:SAVE_TEXT.READ_ONLY)+(drafted?' · '+drafted:''),detail:(auto?'저장할 때 이 기기가 저장 준비를 해서 동기화합니다.':mdDraftReady?'지금 기록하면 이 기기에 임시 저장됩니다.':'')+failed,tone:problem?'warn':'info',action:auto?'DEVICES':'ADVANCED',actionLabel:auto?'연결 · 장치 열기':'저장 준비하기',codes};}
 return {key:'OFFLINE',title:drafted?drafted+' · '+SAVE_TEXT.CONNECT:SAVE_TEXT.CONNECT,detail:'연결 전에는 마지막으로 확인된 기록을 보여 줍니다(최신이 아닐 수 있음). '+(mdDraftReady?'지금 기록하면 이 기기에 임시 저장됩니다.':'지금은 기록할 수 없습니다.')+failed,tone:problem?'warn':'info',action:'DEVICES',actionLabel:'연결하러 가기',codes};
}
function saveStateCard(s=saveState()){const n=add(el('section',null,'save-state-card tone-'+s.tone),add(el('div',null,'state-main'),el('span','저장 상태','state-kicker'),el('strong',s.title),s.detail?el('p',s.detail):null,lastSave?el('p','이번 실행의 마지막 저장: '+saveMessageFor(lastSave.status).split(' · ')[0]+' · '+new Date(lastSave.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),'last-save'):null));n.setAttribute('role','status');n.dataset.state=s.key;if(s.action)add(n,button(s.actionLabel||'연결 · 장치 열기',()=>navigate(s.action),'secondary nav-link'));add(n,add(el('details',null,'tech-details'),el('summary','기술 정보'),el('code',s.codes.filter(Boolean).join(' · ')||'-')));n.querySelector('.nav-link')?.setAttribute('data-nav-only','1');return n;}
function refreshSaveCards(){if(!today||$('workspace').hidden)return;const cards=[...document.querySelectorAll('#view-content .save-state-card')];if(cards.length){for(const c of cards)c.replaceWith(saveStateCard());return;}if(['HOME','ACTIONS'].includes(view))$('view-content').prepend(saveStateCard());}
function writeModeNote(){const [text,kind]=!mdProfile?['저장하면 이 PC에 저장됩니다.','ok']:mdReady?['저장하면 서버에 쌓이고 이 기기에 반영됩니다 → "'+SAVE_TEXT.VERIFIED+'"','ok']:mdDraftReady?['지금 저장하면 이 기기에만 임시 저장됩니다 → "'+SAVE_TEXT.LOCAL_DRAFT+'" · '+draftTail(),'draft']:['지금은 저장할 수 없습니다 · '+(mdRole==='FOLLOWER'?'다른 창에서 기록 중입니다.':'연결 · 장치에서 상태를 확인하세요.'),'blocked'];const n=add(el('div',null,'write-mode '+kind),el('span',text));n.dataset.mode=kind;if(kind==='blocked'){const b=button('연결 · 장치',()=>navigate('DEVICES'),'secondary nav-link');b.dataset.navOnly='1';add(n,b);}return n;}
// HOME next action: the first active action in the owner's own order with no result for today and no local draft
// captured in this session. No hidden score, no inference from personal history.
function nextAction(){return today.actions.find(a=>a.outcome===null&&!localDrafted.has(a.actionId))??null;}
function dayLabel(date){const d=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(whole.localDate+'T12:00:00Z'))/86400000);return (d===0?'오늘':d===1?'내일':d+'일 후')+' · '+date;}
// Urgent date: only dates the owner entered (calendar events, plan due/review/milestone dates, a finance snapshot's
// dated upcoming payment) within the next 7 days. Nothing is inferred.
function urgentDate(){const limit=shifted(whole.localDate,7),rows=whole.home.upcoming.filter(e=>e.date<=limit).map(e=>({...e,from:e.source==='PLAN'?'계획에 입력한 날짜':'직접 입력한 일정'})),pay=whole.finance.nextPayment;if(pay?.date&&pay.date>=whole.localDate&&pay.date<=limit)rows.push({title:pay.label+' 납부',date:pay.date,time:null,kind:'DEADLINE',from:'재정 기록('+whole.finance.snapshotDate+')에 입력한 예정 납부'});return rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??'').localeCompare(b.time??''))[0]??null;}
// B5: 홈 "오늘" 패널. 보여주기만(연산 0). 잠금 중에는 그리지 않는다. 줄 계산은 각 모듈 함수가 하고, 던지면 그 줄만 "확인할 수 없음".
function glancePanel(){
 if(mdProfile&&!mdUnlocked)return null;
 return buildTodayGlance(document,[
  {view:'LEDGER',label:'돈',line:()=>whole.fin?todaySpendLine(whole.fin,whole.localDate):null},
  {view:'HEALTH',label:'건강',line:()=>hltOn()?hltUi.healthHomeLine(hltCtx()):null},
  {view:'STUDY',label:'공부',line:()=>studyOn()?studyUi.studyHomeLine(hltCtx(),studySt):null},
 ],navigate);
}
function renderHome(root){
 const h=whole.home,p=whole.progress,state=saveState(),next=nextAction(),alert=state.tone==='alert';
 if(alert)add(root,saveStateCard(state));
 add(root,cardDraftLine());
 nativeChip(root);
 homeCal(root);   // CAL2: 달력 블록(이번 주 띠 · 고른 날 계획·일정) = 기존 카드 위
 add(root,weekReviewCard());   // FIX49D: 일요일 18시~월요일 "돌아보기" 카드(쓰기 문이 열렸을 때만, 글 없음)
 if(lifeUi&&lifeSt?.flowState)lifeUi.renderLifeToday(root,lifeCtx(),lifeSt);
 else{const nextPanel=add(el('section',null,'panel next-panel'),add(el('div',null,'next-head'),el('h2','지금 할 한 가지','panel-title'),el('span',whole.localDate,'eyebrow')));nextPanel.id='next-action';
 if(next)add(nextPanel,row(next.title,domainName(next.domain)+' · 설정한 순서에서 오늘 아직 기록하지 않은 첫 행동'));
 else if(today.actions.length)add(nextPanel,el('p',localDrafted.size?'오늘 켜 둔 행동을 모두 기록했습니다 · 임시 저장 '+localDrafted.size+'건은 '+(unprovisioned()?'서버 동기화가 설정되지 않아 아직 쌓이지 않습니다.':'연결되면 쌓을 수 있습니다.'):'오늘 켜 둔 행동을 모두 기록했습니다.','done-note'));
 else add(nextPanel,empty('켜 둔 행동이 없습니다. 설정에서 행동을 추가하세요.'));
 const toToday=button(next?'기록하러 가기':'오늘 기록 보기 · 고치기',()=>navigate('RECORDS'),next?'primary nav-link':'secondary nav-link');toToday.dataset.navOnly='1';add(nextPanel,add(el('div',null,'button-row'),toToday,today.actions.length?null:button('행동 추가하기',()=>navigate('SETTINGS'))));add(root,nextPanel);}
 {const g=glancePanel();if(g)add(root,g);}
 const u=urgentDate(),urgent=add(el('section',null,'panel urgent-panel'),el('h2','가까운 날짜','panel-title'));urgent.id='urgent-date';
 if(u)add(urgent,row(u.title,dayLabel(u.date)+(u.time?' '+u.time:'')+' · '+u.from,badge(u.kind)));else add(urgent,hint('앞으로 7일 안에 직접 입력한 일정·계획·납부 날짜가 없습니다.'));add(root,urgent);
 if(!alert)add(root,saveStateCard(state));
 if(whole.fin)vaultCard(root,whole.fin,{compact:true});
 // FIX44 (AUD1 #4): 금고 아래 옛 칸은 하나로 접는다(기본 닫힘, 값·기능 그대로, 이번 실행 동안 연 상태 유지). 탑 띠는 옛 계산("탑 1 블록")이 탑 탭과 달라 오늘 탭에서 뺐다.
 const old=add(el('details',null,'home-old'),el('summary','지난 화면 보기 ▾','home-old-summary'));old.id='home-old';old.open=homeOldOpen;old.addEventListener('toggle',()=>{homeOldOpen=old.open;});add(root,old);
 add(old,el('h2','오늘과 삶의 요약','home-divider'));
 add(old,add(el('div',null,'metric-grid'),metric('오늘 결과 기록',today.actions.filter(a=>a.outcome!==null).length+' / '+today.actions.length,'켜 둔 행동 중 기록한 수'),metric('진행 · 유지 계획',h.activePlans.length,'직접 지정한 상태'),metric('유동 현금',money(whole.finance.totalLiquidCash),whole.finance.snapshotDate||'재정 기록을 추가하세요'),metric('쌓인 블록',p.house.totalBlocks,'기록한 날 + 완료 중간 목표')));
 const grid=el('div',null,'overview-grid'),left=el('div',null,'stack'),right=el('div',null,'stack'),third=el('div',null,'stack');add(grid,left,right,third);add(old,grid);
 const priorities=section('오늘의 우선 행동','설정한 순서의 켜 둔 행동 최대 5개');for(const a of h.priorityActions)add(priorities,row(a.title,domainName(a.domain),badge(today.actions.find(t=>t.actionId===a.actionId)?.outcome||'UNRECORDED')));if(!h.priorityActions.length)add(priorities,empty('설정에서 행동을 추가하세요.'));add(left,priorities);
 const restart=section('이어갈 지점','직접 비울 때까지 남겨 둡니다.');for(const a of h.restartPoints){const b=button('이어가기',()=>navigate('RECORDS'));b.dataset.navOnly='1';add(restart,row(a.title,a.restartPoint,b));}if(!h.restartPoints.length)add(restart,empty('아직 적어 둔 이어갈 지점이 없습니다.'));add(left,restart);
 const upcoming=section('다가오는 일정','앞으로 90일 중 가까운 10개');for(const e of h.upcoming)add(upcoming,row(e.title,e.date+(e.time?' '+e.time:' · 종일'),badge(e.kind)));if(!h.upcoming.length)add(upcoming,empty('다가오는 일정이 없습니다.'));add(right,upcoming);
 const plans=section('진행 중인 계획');for(const p of h.activePlans.slice(0,6))add(plans,row(p.data.title,p.data.nextAction||'다음 행동을 정해 보세요.',button('열기',()=>editPlan(p))));if(!h.activePlans.length)add(plans,empty('계획을 추가하고 진행 상태를 정하세요.'));add(right,plans);
 const recent=section('최근 실제 행동');for(const a of h.recentActualActions)add(recent,row(a.title,a.localDate,badge(a.value.outcome)));if(!h.recentActualActions.length)add(recent,empty('첫 행동 기록을 기다립니다.'));add(third,recent);
}
let homeOldOpen=false;
// One compact capture card shared by HOME (next action) and TODAY: outcome → optional restart point → one Save.
// Opening or rendering never writes; an untouched outcome stays unrecorded (never NOT_DONE).
function durationEditorValue(seconds){
 return seconds===null?{durationMinutes:'',durationSeconds:''}:{durationMinutes:String(Math.floor(seconds/60)),durationSeconds:String(seconds%60)};
}
function measurementInputs(parent,current={durationMinutes:'',durationSeconds:'',quantity:'',unit:'',identity:''}){
 const durationMinutes=field(parent,'실제 수행시간 · 분 (선택)','number',current.durationMinutes);durationMinutes.min='0';durationMinutes.max='1440';durationMinutes.step='1';durationMinutes.placeholder='분';
 const durationSeconds=field(parent,'실제 수행시간 · 초 (선택)','number',current.durationSeconds);durationSeconds.min='0';durationSeconds.max='59';durationSeconds.step='1';durationSeconds.placeholder='초';
 const advanced=add(el('details'),el('summary','수량과 단위 (선택)'));advanced.open=Boolean(current.quantity||current.unit||current.identity);
 const quantity=field(advanced,'수량 (선택)','text',current.quantity),unit=field(advanced,'단위 (예: 페이지 · km)','text',current.unit),identity=field(advanced,'무엇을 잰 값인지 (예: 읽은 페이지)','text',current.identity);add(parent,advanced,hint('시간·수량은 결과나 배움의 정도와 별개입니다. 입력하지 않으면 알 수 없음으로 남습니다.'));
 return {durationMinutes,durationSeconds,quantity,unit,identity};
}
function inputMeasurement(inputs,observationId){
 const m=inputs.durationMinutes.value,s=inputs.durationSeconds.value,q=inputs.quantity.value,u=inputs.unit.value.trim(),i=inputs.identity.value.trim();
 if(m===''&&s===''&&!q&&!u&&!i)return null;
 const component=text=>{if(text==='')return 0;if(!/^[0-9]+$/.test(text))throw appError('INVALID_ACTUAL_EFFECTIVE_DURATION');const value=Number(text);if(!Number.isSafeInteger(value))throw appError('INVALID_ACTUAL_EFFECTIVE_DURATION');return value;};
 const minutes=component(m),remainder=component(s),seconds=m===''&&s===''?null:minutes*60+remainder;
 if(remainder>59||seconds!==null&&(!Number.isSafeInteger(seconds)||seconds<0||seconds>86400))throw appError('INVALID_ACTUAL_EFFECTIVE_DURATION');
 if((q||u||i)&&(!q||!u||!i))throw appError('INVALID_QUANTITY_UNIT');
 return {observationId,actualEffectiveDuration:seconds===null?null:{value:seconds,unit:'SECOND'},quantity:q?{value:q,unit:u,identity:i}:null};
}
function actionCard(a,{home=false}={}){
 const draft=drafts.get(a.actionId),base=draft?.base||structuredClone(a),value=draft?.value||{outcome:a.outcome,restartPoint:a.restartPoint},local=localDrafted.get(a.actionId);
 const box=add(el('article',null,'action-card'+(home?' home-card':' panel')),el('h3',a.title,'action-title'));box.dataset.actionId=a.actionId;
 add(box,el('p',domainName(a.domain)+(a.planId?' · '+(whole.plans.find(p=>p.entityId===a.planId)?.data.title||a.planId):''),'action-meta'));
 if(a.restartPoint.trim())add(box,add(el('p',null,'restart-line'),el('span','이어갈 지점','restart-label'),el('span',a.restartPoint,'restart-text')));
 const group=el('div',null,'outcomes'),radios=[];group.setAttribute('role','radiogroup');group.setAttribute('aria-label',a.title+' 결과');
 for(const key of ['COMPLETE','PARTIAL','NOT_DONE']){const label=el('label',null,'outcome outcome-'+key),input=el('input');input.type='radio';input.name='outcome-'+a.actionId;input.value=key;input.checked=value.outcome===key;radios.push(input);add(label,input,el('span',LABEL[key]));add(group,label);}
 const edit=add(el('details',null,'restart-edit'),el('summary',a.restartPoint.trim()?'이어갈 지점 바꾸기 (선택)':'이어갈 지점 적기 (선택)'));edit.open=value.restartPoint!==base.restartPoint;
 const restart=field(edit,'다음에 이어갈 지점 · '+a.title,'textarea',value.restartPoint);restart.rows=2;restart.placeholder='예: 3장 연습문제 4번부터 · 세탁기 돌리기부터';
 const amount=add(el('details',null,'amount-edit'),el('summary','실제로 한 양 적기 (선택)'));const amountFields=measurementInputs(amount,value.measurementInput);const observationId=draft?.observationId||uid().slice(0,32);amount.open=Boolean(value.measurementInput&&Object.values(value.measurementInput).some(Boolean));
 const saved=el('p','','save-state');saved.setAttribute('aria-live','polite');
 const show=()=>{const changed=drafts.has(a.actionId);saved.dataset.kind=changed?'changed':local?'draft':a.outcome?'saved':'none';saved.textContent=changed?'변경됨 · 아직 저장 전':local?SAVE_TEXT.LOCAL_DRAFT+' ('+(local.value.outcome?LABEL[local.value.outcome]:'결과 변경 없음')+(local.value.restartPoint!==a.restartPoint?' · 이어갈 지점 수정':'')+') · '+draftTail():a.outcome?(mdProfile?'쌓인 기록 · ':'저장됨 · ')+LABEL[a.outcome]:'아직 기록 안 함';};
 const capture=()=>{const v={outcome:radios.find(r=>r.checked)?.value??null,restartPoint:restart.value,measurementInput:Object.fromEntries(Object.entries(amountFields).map(([k,n])=>[k,n.value]))};if(v.outcome===base.outcome&&v.restartPoint===base.restartPoint&&!Object.values(v.measurementInput).some(Boolean))drafts.delete(a.actionId);else drafts.set(a.actionId,{base,value:v,localDate:today.localDate,observationId});show();updateUnsaved();};box.addEventListener('input',capture);box.addEventListener('change',capture);
 const save=button('저장',()=>perform(async()=>{if(!drafts.has(a.actionId)){status('바꾼 내용이 없습니다. 결과를 고르거나 이어갈 지점을 적은 뒤 저장하세요.');return;}const before=whole.progress.house.totalBlocks,r=await saveDraft(a.actionId);if(r.status==='LOCAL_DRAFT')localDrafted.set(a.actionId,{value:r.value,at:Date.now()});else localDrafted.delete(a.actionId);await refresh();const gained=whole.progress.house.totalBlocks-before;status(a.title+' · '+saveMessageFor(r.status)+(r.status!=='LOCAL_DRAFT'&&gained>0?' · 탑 +'+gained+' 블록':''));}),'primary save-button');save.setAttribute('aria-label','저장 · '+a.title);
 add(box,group,edit,amount,add(el('div',null,'save-row'),save,saved));show();return box;
}
// V6B: 기본 행동(코어 행동 기록)의 날짜별 지금 결과를 습관 성취표·성취 엔진이 읽도록 화면의 life 사본에 붙인다(저장 0, 이력 changes에서 계산, life-achieve actionDaysFrom과 같은 규칙).
// 같은 기록 칸(entityKey)의 첫 줄(최신)이 지금 값이다. life가 없으면 붙이지 않는다(건강·공부만 쓰는 화면은 그대로).
// 기록을 다시 읽을 때(refreshCore)와 화면을 그릴 때(render) 부른다. 같은 기록(whole·changes)이면 다시 만들지 않는다(성취 계산 메모가 유지되게).
// FIX68 (HUNT65 F2): 기준이 적히지 않은 지난 카드의 습관 벽돌 기준을 이 기기에서 한 번 정해 붙인다(life-model frozenBasis, 이 기기 저장소 lb.habit.basis). 못 불러오면 지금 목록(예전 그대로).
let lifeModelMod=null;import('./life-model.mjs').then(m=>{lifeModelMod=m;actionDaysOf=null;}).catch(()=>{lifeModelMod=null;});
let actionDaysOf=null;
function withActionDays(){const day=kstDay();if(!whole?.life||actionDaysOf?.whole===whole&&actionDaysOf.changes===changes&&actionDaysOf.day===day)return;actionDaysOf={whole,changes,day};const seen=new Set(),days={};const rows=typeof freshRead==='function'?freshRows:changes;/* V7D1: 새 시작 기준 전 행동 결과는 뺀 줄(freshRead) */for(const c of Array.isArray(rows)?rows:[]){if(c?.type!=='RESULT'||seen.has(c.entityKey))continue;seen.add(c.entityKey);const d=c.value?.localDate,o=c.value?.outcome;if(typeof d==='string'&&typeof c.actionId==='string'&&['COMPLETE','PARTIAL','NOT_DONE'].includes(o))(days[d]??={})[c.actionId]=o;}whole.life={...whole.life,actionDefs:(whole.actions??[]).map(a=>({actionId:a.actionId,name:a.title,active:a.active,domain:a.domain})),actionDays:days};if(lifeModelMod)try{whole.life={...whole.life,basisFrozen:lifeModelMod.frozenBasis(whole.life,day,globalThis.localStorage)};}catch{/* 지금 목록으로 센다 */}}
// V6B: 성취표의 오늘 기본 행동 칸 = 행동 카드의 결과 저장과 같은 길(saveDraft, 연산 1). 이어갈 지점·양 입력은 그대로 둔다.
function recordActionOutcome(a,outcome){void perform(async()=>{const t=today.actions.find(x=>x.actionId===a.actionId);if(!t)throw appError('UNSAVED_ACTION_DRAFT');const prev=drafts.get(t.actionId);if(!prev&&t.outcome===outcome){status(t.title+' · 이미 같은 결과('+LABEL[outcome]+')가 쌓여 있어요.');return;}drafts.set(t.actionId,{base:prev?.base||structuredClone(t),value:{...(prev?.value||{outcome:t.outcome,restartPoint:t.restartPoint}),outcome},localDate:today.localDate,observationId:prev?.observationId||uid().slice(0,32)});const r=await saveDraft(t.actionId);if(r.status==='LOCAL_DRAFT')localDrafted.set(t.actionId,{value:r.value,at:Date.now()});else localDrafted.delete(t.actionId);await refresh();status(t.title+' · '+LABEL[outcome]+' · '+saveMessageFor(r.status));});}
// V6B: 기록 탭 첫 화면 = 습관 성취표(행동 카드 = 이어갈 지점·실제로 한 양은 행 상세 안, 지우지 않음). 성취표를 못 그리면(모듈 없음) 아래 옛 행동 카드 화면 그대로.
function renderHabitBoardView(root){if(!(lifeUi?.renderHabitBoard&&lifeSt?.flow))return false;lifeUi.renderHabitBoard(root,lifeCtx(),lifeSt,{actionDefs:whole.life?.actionDefs??[],actionDays:whole.life?.actionDays??{},actionDetail:a=>{const t=today.actions.find(x=>x.actionId===a.actionId);return t?actionCard(t):empty('오늘 화면에서 꺼 둔 행동입니다.');},recordAction:recordActionOutcome,openActionPast:d=>{historyFilter={date:d,domain:'',type:'RESULT'};historyLimit=100;view='HISTORY';void render();}});lifeUi.renderPastDays(root,lifeCtx(),lifeSt);return true;}
function renderToday(root){const state=saveState();if(state.tone!=='ok'||problem)add(root,saveStateCard(state));add(root,writeModeNote());if(renderHabitBoardView(root))return;if(lifeUi&&lifeSt)lifeUi.renderPastDays(root,lifeCtx(),lifeSt);const grid=el('div',null,'actions-grid');for(const a of today.actions)add(grid,actionCard(a));if(!today.actions.length)add(grid,empty('켜 둔 행동이 없습니다. 설정에서 추가하거나 활성화하세요.'));add(root,grid,hint('화면을 여는 것만으로는 기록되지 않습니다. 기록하지 않은 행동은 "하지 못함"으로 세지 않습니다. 저장하지 않은 입력은 화면을 옮겨도 남고, "저장 후 종료" 때 함께 저장됩니다.'));}
function renderMore(root,gone=()=>false){const s=saveState();if(s.tone==='alert')add(root,saveStateCard(s));const list=el('div',null,'more-list');for(const [key,title,detail,go] of [['SETTINGS'],['DEVICES','연결 · 장치 · 복구'],['DEVICES','백업 · 복구','마지막 주간 백업 표시 · 저장 위치 · 분실 복구',openBackup],['ADVANCED']]){const [,label,sub,icon]=NAV.find(n=>n[0]===key),b=el('button',null,'more-item'),mark=el('span',icon,'nav-symbol');b.type='button';b.dataset.navOnly='1';b.dataset.view=key;mark.setAttribute('aria-hidden','true');add(b,mark,add(el('span',null,'more-text'),el('strong',title||label),el('small',detail||sub)));b.addEventListener('click',go??(()=>navigate(key)));add(list,b);}add(root,list);if(aiGateMod)aiGateMod.renderAssistants(root,{h:{el,add,button},surface:mdSurface,request:aiReports,gone,decorate:finderDecorate()});}
// B40 더보기 > 고급: 남은 저장 용량 한 줄과 기록 권한 버튼들. 버튼은 #md-controls 패널 안에 그대로 있고(잠금·입력 추적 규칙 동일), data-pane으로 이 화면에서는 고급 묶음만, 연결 · 장치에서는 그 밖의 것만 보인다.
function renderAdvanced(root){add(root,add(section('남은 저장 용량','평소에는 신경 쓰지 않아도 됩니다.'),opsNotice(finOps(),{always:true})));if(mdProfile&&mdPanel){mdHost.hidden=true;mdPanel.dataset.pane='ADVANCED';add(root,mdPanel);}}
// FIX44 (AUD1 #2): 백업 카드로 간다(더보기 줄·오늘 요약 줄). 카드는 연결 · 장치 맨 위이고 이 기기 저장소 키 1개만 쓴다(life-ui renderBackupCard).
function openBackup(){void perform(async()=>{view='DEVICES';await render();window.scrollTo(0,0);$('backup-card')?.scrollIntoView({block:'start'});$('page-title').focus({preventScroll:true});});}
// FIX45 (AUD1 #6): 공부 화면 맨 위에 통계가 생겨 오늘의 "복습 n건"은 복습 칸으로 바로 간다(탭으로 들어가면 통계부터 보인다).
function openSubjectColors(){void perform(async()=>{view='SETTINGS';await render();window.scrollTo(0,0);$('subject-colors')?.scrollIntoView({block:'start'});$('page-title').focus({preventScroll:true});});}   // V6A: 공부 벽돌 "색 바꾸기" → 설정의 과목 색(DS2)
function openReviews(){void perform(async()=>{view='STUDY';await render();window.scrollTo(0,0);$('study-review')?.scrollIntoView({block:'start'});$('page-title').focus({preventScroll:true});});}
function renderDevices(root){add(root,saveStateCard());if(mdProfile&&lifeUi)lifeUi.renderBackupCard(root,{document,today:kstDay,storage:globalThis.localStorage});if(mdProfile){if(mdPanel){mdHost.hidden=true;mdPanel.dataset.pane='DEVICES';add(root,mdPanel);}renderMDSettings(root,whole.settings);return;}renderLegacyStorage(root);}
async function saveDraft(actionId){const d=drafts.get(actionId);if(!d)return;const a=d.base,v=d.value;if([...v.restartPoint].length>500)throw appError('INVALID_TEXT');const fields={actionId,localDate:d.localDate,expectedHeads:a.heads,outcome:v.outcome!==a.outcome?v.outcome:null,restartPoint:v.restartPoint!==a.restartPoint?v.restartPoint:null,reason:'',confirmed:false};if(v.measurementInput){const inputs=Object.fromEntries(Object.entries(v.measurementInput).map(([k,value])=>[k,{value}]));const measurement=inputMeasurement(inputs,d.observationId);if(measurement){fields.measurement=measurement;fields.expectedHeads={...fields.expectedHeads,measurement:[]};}}const result=await submit('/api/action-record',await command('RECORD',fields));if(result.status!==savedStatus())throw appError('HOLD_UNKNOWN_SAVE');drafts.delete(actionId);updateUnsaved();return {status:result.status,value:v};}
async function saveDrafts(){for(const actionId of [...drafts.keys()])await saveDraft(actionId);}
// A1B: 옛 영역 A~J는 읽기 전용(V4 결정 M1D 1). 기록·쓰는 함수·서버 검사는 그대로이고 화면에서 편집만 없앤다.
const legacyAreas=(open=false)=>legacyAreaNode({el,add},whole.domains,{statusText:s=>LABEL[s]??s,open});
function renderLife(root){add(root,hint('옛 영역 기록은 읽기 전용입니다. 지금의 영역 레벨은 탑 탭에서 봅니다.'),legacyAreas(true)??empty('입력한 옛 영역 기록이 없습니다.'));}
function monthGridCells(yearMonth){const base=new Date(yearMonth+'-01T12:00:00Z');const daysInMonth=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();const before=(base.getUTCDay()+6)%7;const cells=[];for(let i=0;i<before;i++)cells.push(null);for(let day=1;day<=daysInMonth;day++)cells.push(yearMonth+'-'+String(day).padStart(2,'0'));return cells;}
function field(parent,label,type='text',value='',options=null){const wrap=el('label',label),input=el(type==='textarea'?'textarea':type==='select'?'select':'input');if(type==='date'){input.type='text';input.inputMode='numeric';input.placeholder='YYYY-MM-DD';input.maxLength=10;}else if(type!=='textarea'&&type!=='select')input.type=type;input.setAttribute('aria-label',label);input.autocomplete='off';if(type==='select')for(const option of options||[]){const [v,t]=Array.isArray(option)?option:[option,LABEL[option]||option];const n=el('option',t);n.value=v;input.append(n);}if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';if(type==='textarea')input.rows=3;if(type==='date'){wrap.classList.add('date-label');const box=el('div',null,'date-field');const popup=el('div',null,'date-popup');popup.hidden=true;const head=el('div',null,'date-popup-head');const monthLabel=el('strong','');let shownMonth=whole.localDate.slice(0,7);const guessMonth=()=>{if(/^\d{4}-\d{2}-\d{2}$/.test(input.value)){const t=Date.parse(input.value.slice(0,7)+'-01T12:00:00Z');if(!Number.isNaN(t))return input.value.slice(0,7);}return whole.localDate.slice(0,7);};const setValue=v=>{input.value=v;input.dispatchEvent(new Event('change',{bubbles:true}));popup.hidden=true;};const openMonth=ym=>{shownMonth=ym;const [y,m]=ym.split('-');monthLabel.replaceChildren(el('span',y,'y'),el('span','년','u'),document.createTextNode(' '),el('span',String(Number(m)),'m'),el('span','월','u'));grid.replaceChildren();for(const d of ['월','화','수','목','금','토','일'])add(grid,el('div',d,'calendar-day-name'));for(const cell of monthGridCells(ym)){if(cell===null){add(grid,el('div',null,'calendar-cell dim'));continue;}const isToday=cell===whole.localDate,isSelected=cell===input.value;add(grid,button(String(Number(cell.slice(8))),()=>setValue(cell),'calendar-cell'+(isToday?' today':'')+(isSelected?' selected':'')));}};const prev=button('‹',()=>openMonth(shiftMonth(shownMonth,-1)));const next=button('›',()=>openMonth(shiftMonth(shownMonth,1)));add(head,prev,monthLabel,next);const grid=el('div',null,'calendar-grid date-popup-grid');const actions=el('div',null,'date-popup-actions');const todayBtn=button('오늘',()=>setValue(whole.localDate));const clearBtn=button('지우기',()=>setValue(''));const closeBtn=button('닫기',()=>{popup.hidden=true;});add(actions,todayBtn,clearBtn,closeBtn);add(popup,head,grid,actions);const toggle=button('달력',()=>{popup.hidden=!popup.hidden;if(!popup.hidden)openMonth(guessMonth());});add(box,input,toggle);add(wrap,box,popup);parent.append(wrap);return input;}wrap.append(input);parent.append(wrap);return input;}
function modal(title,builder,saveLabel='저장'){if(busy||ended)return;$('editor-title').textContent=title;$('editor-kicker').textContent=view;$('editor-error').textContent='';$('editor-content').replaceChildren();$('editor-save').textContent=saveLabel;$('editor-save').disabled=false;editorSave=builder($('editor-content'));$('editor').showModal();}
// 앱을 켜 둔 채 KST 자정을 넘기면 홈·달력의 '오늘'(whole.localDate)을 다시 읽는다. 편집 창이 열려 있거나 저장 중이면 건드리지 않고 끝난 뒤 다음 확인(30초마다·화면 복귀 때)에서 한다.
// FIX52C (Codex R4): 일기 날짜(KST 04:00 경계, kstDay(4))가 바뀔 때도 다시 그린다(오늘 화면의 일기 입구 날짜 줄). 열린 일기 시트의 날짜는 바꾸지 않는다.
const kstDay=(back=0)=>new Date(Date.now()+(9-back)*3600000).toISOString().slice(0,10);
let dayWatch=kstDay(),diaryWatch=kstDay(4);
async function dayRollover(){
 const d=kstDay(),dd=kstDay(4);
 if(d===dayWatch&&dd===diaryWatch||ended||busy||mdSignedOut||!whole||$('workspace').hidden||$('editor').open||drafts.size)return;
 try{await refresh();dayWatch=d;diaryWatch=dd;}catch{}
}
setInterval(()=>{if(!document.hidden)void dayRollover();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void dayRollover();});
function cancelEditor(){if(busy)return;$('editor').close();$('editor-content').replaceChildren();editorSave=null;}
for(const id of ['editor-cancel','editor-cancel-top'])$(id).addEventListener('click',cancelEditor);
$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('editor-form').addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{if(!editorSave)return;const saved=await editorSave();if(saved?.ask)return;/* FIX67 (M-01): 같은 결제 확인을 띄웠으면 창을 닫지 않는다 */$('editor').close();$('editor-content').replaceChildren();editorSave=null;if(!ended){await refresh();status(savedMessage()+' · 변경 이력을 보존했습니다.'+(saved?.notice?' · '+saved.notice:''));}});});
function editDomain(d){modal(d.code+' · '+d.name,root=>{const fields={},grid=el('div',null,'field-grid');add(root,grid);fields.status=field(grid,'영역 상태','select',d.data.status,['ACTIVE','MAINTAIN','DEFERRED_WITH_REASON','UNKNOWN','NOT_APPLICABLE']);const extra=add(el('details',null,'form-more'),el('summary','추가 항목 (선택) · 현재 계획 · 막힌 점 · 다시 볼 조건 · 보류 이유')),extraGrid=add(extra,el('div',null,'field-grid'));for(const [key,label] of [['currentState','현재 상태'],['desiredState','바라는 상태'],['currentPlan','현재 계획'],['nextAction','다음 행동'],['blocker','막힌 점'],['reviewTrigger','다시 볼 조건'],['deferredReason','보류 이유']])fields[key]=field(['currentPlan','blocker','reviewTrigger','deferredReason'].includes(key)?extraGrid:grid,label,'textarea',d.data[key]);extra.open=!!(d.data.currentPlan||d.data.blocker||d.data.reviewTrigger||d.data.deferredReason||d.data.status==='DEFERRED_WITH_REASON');fields.status.addEventListener('change',()=>{if(fields.status.value==='DEFERRED_WITH_REASON')extra.open=true;});add(root,extra);return ()=>entity('DOMAIN',d.code,Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])),d.heads);});}
function planProgress(p){const total=p.data.milestones.length,done=p.data.milestones.filter(m=>m.done).length;const n=el('div');if(total){const bar=el('progress');bar.max=total;bar.value=done;bar.setAttribute('aria-label',p.data.title+' 중간 목표 '+done+'/'+total);add(n,bar,el('div',done+' / '+total+' 중간 목표 완료','progress-caption'));}else add(n,hint('중간 목표 미설정 · 완료율을 추정하지 않습니다.'));return n;}
function renderPlans(root){let box=root;if(lifePlan&&planSt){const suggest=suggestMod?(sec,o={})=>suggestMod.renderSuggest(sec,{...lifeCtx(),sheet:towerSheet,h:{el,add,button},surface:mdSurface,request:aiReports,planSt,...o},suggestSt??=suggestMod.createSuggestState()):null;lifePlan.followPlanToday?.(planSt,kstDay());if(planMonthOn())loadPlanCal();lifePlan.renderPlan(root,{...lifeCtx(),sheet:towerSheet,planWeek:planWeekMod&&uiKit?(st,o)=>planWeekMod.renderWeekGrid({...lifeCtx(),sheet:towerSheet,suggest},st,o):null,planMonth:planMonthMod&&uiKit?(st,o)=>planMonthMod.renderMonth({...lifeCtx(),sheet:towerSheet,planCal:planCalCtx()},st,o):null,planCal:planCalCtx()},planSt);if(suggest&&!planWeekMod)suggest(root);box=add(el('details',null,'panel plan-more'),el('summary','더보기 · 목표 계획 · 일정 내보내기','plan-more-summary'));add(root,box);box.open=Boolean(planSt.moreOpen);box.addEventListener('toggle',()=>{planSt.moreOpen=box.open;});add(box,el('h2','목표 계획','panel-title plan-goals-title'));}const toolbar=el('div',null,'section-toolbar');add(toolbar,button('계획 추가',()=>editPlan(null),'primary'));const filter=field(toolbar,'계획 상태 필터','select',planFilter,[['ALL','모든 상태'],'ACTIVE','MAINTAIN','DEFERRED_WITH_REASON','COMPLETE','UNKNOWN']);filter.addEventListener('change',()=>{planFilter=filter.value;void render();});add(box,toolbar);const grid=el('div',null,'plan-grid');for(const p of whole.plans.filter(p=>planFilter==='ALL'||p.data.status===planFilter)){const d=p.data,card=section(d.title);card.classList.add('plan-card');const more=add(el('details',null,'card-details'),el('summary','자세히 · 목표 · 현재 단계 · 막힌 점 · 기한'),el('p',d.goal||'목표 미입력'),hint('현재 단계: '+(d.currentStage||'미입력')));more.open=!narrow();add(card,add(el('div',null,'plan-meta'),badge(d.status),el('span',d.domain+' · '+domainName(d.domain))),row('다음 행동',d.nextAction||'미입력'),planProgress(p));for(const m of d.milestones){const label=el('label',null,'milestone'+(m.done?' done':'')),cb=el('input');cb.type='checkbox';cb.checked=m.done;cb.setAttribute('aria-label',d.title+' / '+m.title+' 완료');cb.addEventListener('change',()=>perform(async()=>{await entity('PLAN',p.entityId,{...d,milestones:d.milestones.map(x=>x.milestoneId===m.milestoneId?{...x,done:cb.checked}:x)},p.heads,'중간 목표 상태 변경');await refresh();status('중간 목표 상태를 저장했습니다.');}));add(label,cb,el('span',m.title+(m.dueDate?' · '+m.dueDate:'')));add(card,label);}if(d.blockedReason)add(more,hint('막힌 점: '+d.blockedReason));add(more,hint('기한 '+(d.dueDate||'없음')+' · 검토 '+(d.reviewDate||'없음')));add(card,more,button('계획 편집 · '+d.title,()=>editPlan(p)));add(grid,card);}if(!grid.children.length)add(grid,empty('아직 이 상태의 계획이 없습니다.'));add(box,grid);nativeMirrorDaily();if(icsImportMod&&uiKit)icsImportMod.renderOuterPanel(box,{...icsOuterCtx(),showUpcoming:true});if(icsExportMod&&uiKit)icsExportMod.renderIcsExport(box,{h:{el,add,button},kit:uiKit,views:()=>({events:whole.events,plans:whole.plans,life:whole.life??null,today:whole.localDate}),mirrorOn:nativeMirrorOn,now:()=>new Date().toISOString(),download:(name,text)=>{const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}});}
function editPlan(p){const d=p?.data||{title:'',domain:'A',status:'UNKNOWN',goal:'',currentStage:'',milestones:[],nextAction:'',dueDate:null,reviewDate:null,blockedReason:'',notes:''};const planId=p?.entityId||entityId();modal(p?'계획 편집':'새 계획',root=>{const f={},grid=el('div',null,'field-grid');add(root,grid);f.title=field(grid,'계획 제목','text',d.title);f.title.required=true;f.title.maxLength=150;f.status=field(grid,'계획 상태','select',d.status,['ACTIVE','MAINTAIN','DEFERRED_WITH_REASON','COMPLETE','UNKNOWN']);const extra=add(el('details',null,'form-more'),el('summary','추가 항목 (선택) · 영역 · 막힌 점 · 메모 · 검토일')),extraGrid=add(extra,el('div',null,'field-grid'));f.domain=field(extraGrid,'계획 영역','select',d.domain,whole.domains.map(d=>[d.code,d.code+' · '+d.name]));for(const [k,l]of [['goal','목표'],['currentStage','현재 단계'],['nextAction','다음 행동'],['blockedReason','막힌 점 / 보류 이유'],['notes','메모']])f[k]=field(['blockedReason','notes'].includes(k)?extraGrid:grid,l,'textarea',d[k]);f.dueDate=field(grid,'계획 기한','date',d.dueDate);f.reviewDate=field(extraGrid,'검토일','date',d.reviewDate);extra.open=!!(d.blockedReason||d.notes||d.reviewDate||d.status==='DEFERRED_WITH_REASON');f.status.addEventListener('change',()=>{if(f.status.value==='DEFERRED_WITH_REASON')extra.open=true;});add(root,extra);add(root,el('h3','중간 목표','subheading'));const list=el('div',null,'editable-list'),items=[];add(root,list);const addItem=m=>{const r=el('div',null,'edit-row'),title=field(r,'중간 목표 제목','text',m.title),due=field(r,'중간 목표 기한','date',m.dueDate),done=field(r,'완료','checkbox',m.done);title.required=true;title.maxLength=200;const item={id:m.milestoneId,title,due,done};items.push(item);add(r,button('이 중간 목표 제거',()=>{items.splice(items.indexOf(item),1);r.remove();}));add(list,r);};for(const m of d.milestones)addItem(m);add(root,button('중간 목표 추가',()=>{if(items.length<60)addItem({milestoneId:entityId(),title:'',dueDate:null,done:false});}),hint('기존 중간 목표의 식별자는 편집해도 유지됩니다. 제거도 변경 이력에 남습니다.'));return ()=>entity('PLAN',planId,{...Object.fromEntries(Object.entries(f).map(([k,v])=>[k,['dueDate','reviewDate'].includes(k)?v.value||null:v.value])),milestones:items.map(i=>({milestoneId:i.id,title:i.title.value,done:i.done.checked,dueDate:i.due.value||null}))},p?.heads||[]);});}
function shifted(date,n){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
// 9999-12-31 다음 날은 '+010000-01'처럼 4자리 연도가 아니어서 'day<=to' 문자열 비교가 끝나지 않는다.
// 달력 칸 반복은 이 함수로 다음 날을 구한다: YYYY-MM-DD를 벗어나면 어떤 유효 날짜보다 큰 끝 표시를 돌려 반복을 끝낸다.
function calendarShifted(date,n){const next=shifted(date,n);return /^\d{4}-\d{2}-\d{2}$/.test(next)?next:'9999-99-99';}
// 달력 이동(이전·다음)은 0000-01-01 ~ 9999-12-31 안에서만. 벗어나면 null(7일 보기는 그 주 월요일+6일 = 일요일까지 안에 있어야 함, CAL1).
function calendarStep(mode,date,n){let next;if(mode==='MONTH'){const d=new Date(date.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);next=d.toISOString().slice(0,10);}else next=shifted(date,n*(mode==='7_DAY'?7:1));return /^\d{4}-\d{2}-\d{2}$/.test(next)&&(mode!=='7_DAY'||/^\d{4}-\d{2}-\d{2}$/.test(shifted(next,6-(new Date(next+'T12:00:00Z').getUTCDay()+6)%7)))?next:null;}
const WEEKDAY_KO_F14=['일','월','화','수','목','금','토'];
function weekdayKoF14(date){return WEEKDAY_KO_F14[new Date(date+'T12:00:00Z').getUTCDay()];}
function calendarTitleNode(){const title=el('div',null,'calendar-title');title.setAttribute('role','heading');title.setAttribute('aria-level','2');const num=t=>el('span',t,'cal-title-num'),unit=t=>el('span',t,'cal-title-unit'),sp=()=>document.createTextNode(' '),ymd=d=>d.split('-').map(Number);if(calendarMode==='MONTH'){const [y,m]=ymd(calendarState.from);add(title,num(String(y)),unit('년'),sp(),num(String(m)),unit('월'));}else if(calendarMode==='TODAY'){const [y,m,d]=ymd(calendarState.from);add(title,num(String(y)),unit('년'),sp(),num(String(m)),unit('월'),sp(),num(String(d)),unit('일'),sp(),unit(weekdayKoF14(calendarState.from)+'요일'));}else{const [fy,fm,fd]=ymd(calendarState.from),[ty,tm,td]=ymd(calendarState.to);add(title,num(String(fy)),unit('년'),sp(),num(String(fm)),unit('월'),sp(),num(String(fd)),unit('일'),sp(),unit('–'),sp());if(fy!==ty)add(title,num(String(ty)),unit('년'),sp());if(fy!==ty||fm!==tm)add(title,num(String(tm)),unit('월'),sp());add(title,num(String(td)),unit('일'));}return title;}
// 이 화면의 버튼·날짜 선택은 아래 render(이 함수 안의 것)로 다시 그린다. 7일 보기는 기준일이 든 주의 월~일(CAL1)이라 9999-12-26 이후 기준일이면
// 범위가 9999-12-31을 넘을 수 있다: 기준일을 9999-12-25로 당기고 안내한다(그 주 = 9999-12-20~26).
// CAL1: 오늘(whole.localDate) 칸·머리는 금빛 채움 + "오늘" 글자, 지난 날 칸은 data-past(흐리게), 툴바 맨 아래 줄에 "오늘 · M월 D일 요일".
// CAL1C: 오늘 = 옅은 금 칸 + 숫자 뒤 금 동그라미(CSS). 월 보기 앞 빈칸(dim)에 지난달 날짜를 흐린 숫자로(누르지 않음, 칸 수 그대로).
// 7일 보기는 가로 7칸 격자(칸 = 머리 "요일 + 날짜 숫자"·전체 날짜는 aria-label + 그날 일정 칩), 칸 빈 곳을 누르면 그날 하루 보기. 하루 보기는 목록 그대로.
// 줄만 떼어 돌리는 시험 하니스(b10·p1e)에 없는 이름을 쓰지 않도록 요일·날짜 글자 도우미는 이 함수 안에 둔다. 그래도 달력 계산이 거절되면(INVALID_*) 화면을 비우지 않고
// 바로 전 보기(shown)를 다시 그린 뒤 달력 자리에 오류 문구를 둔다. 연결·저장소 오류(HOLD_* 등)는 지금처럼 perform → fail로 간다.
function renderCalendar(root,gone=()=>false){const shifted=calendarShifted;const todayDay=whole.localDate,dow=d=>new Date(d+'T12:00:00Z').getUTCDay(),wd=d=>'일월화수목금토'[dow(d)],md=d=>Number(d.slice(5,7))+'월 '+Number(d.slice(8))+'일',todayMark=()=>el('span','오늘','calendar-today-badge');const shown=[calendarMode,calendarDate],render=async()=>{if(calendarMode==='7_DAY'&&/^\d{4}-\d{2}-\d{2}$/.test(calendarDate??'')&&calendarDate>'9999-12-25'){calendarDate='9999-12-25';status('7일 보기는 9999-12-31까지만 볼 수 있어 기준일을 9999-12-25로 당겼습니다.');}try{await renderCore(gone);}catch(e){if(!/^INVALID_/.test(e?.code??''))throw e;[calendarMode,calendarDate]=shown;await renderCore(gone);if(gone())return;const bad=el('p','이 날짜·보기로는 달력을 계산하지 못해 이전 보기를 유지했습니다('+e.code+') · 다른 날짜나 보기를 고르세요.','notice');bad.dataset.error='true';bad.dataset.calendarError=e.code;const area=$('view-content');area.replaceChildren(bad,...area.children);}};const tools=el('div',null,'calendar-toolbar');for(const [mode,label]of [['TODAY','하루'],['7_DAY','7일'],['MONTH','월']])add(tools,button(label,()=>perform(async()=>{calendarMode=mode;await render();}),calendarMode===mode?'selected':'secondary'));const date=field(tools,'일정 기준일','date',calendarDate);date.addEventListener('change',()=>{if(date.value)void perform(async()=>{calendarDate=date.value;await render();});});add(tools,button('이전',()=>moveCalendar(-1)),button('다음',()=>moveCalendar(1)),button('오늘로',()=>perform(async()=>{calendarDate=whole.localDate;await render();})),button('일정 추가',()=>editEvent(null),'primary'));if(/^\d{4}-\d{2}-\d{2}$/.test(todayDay??''))add(tools,add(el('p',null,'calendar-today-line'),todayMark(),el('span',' · '+md(todayDay)+' '+wd(todayDay)+'요일','calendar-today-date')));add(root,tools,calendarTitleNode(),hint(calendarState.from+' ~ '+calendarState.to+' · 반복 일정은 횟수가 정해진 이 기기 일정입니다.'));const outer=typeof icsOuterView==='function'?icsOuterView():null;if(calendarMode==='MONTH'){const grid=el('div',null,'calendar-grid');for(const d of ['월','화','수','목','금','토','일'])add(grid,el('div',d,'calendar-day-name'));const before=(new Date(calendarState.from+'T12:00:00Z').getUTCDay()+6)%7;for(let i=0;i<before;i++){const p=shifted(calendarState.from,i-before);add(grid,add(el('div',null,'calendar-cell dim'),p<calendarState.from?el('div',Number(p.slice(8)),'calendar-number calendar-other'):null));}for(let day=calendarState.from;day<=calendarState.to;day=shifted(day,1)){const cell=el('div',null,'calendar-cell'+(day===todayDay?' today':''));if(day===todayDay){cell.setAttribute('aria-current','date');add(cell,todayMark());}else if(day<todayDay)cell.setAttribute('data-past','');add(cell,el('div',Number(day.slice(8)),'calendar-number'));for(const e of calendarState.events.filter(e=>e.date===day))add(cell,eventButton(e));for(const o of outer?.on(day)??[])add(cell,outer.chip(o));add(grid,cell);}add(root,grid);}else{const week=calendarMode==='7_DAY',box=section(week?'7일 일정':'하루 일정'),days=week?el('div',null,'calendar-week'):null;if(days)add(box,days);for(let day=calendarState.from;day<=calendarState.to;day=shifted(day,1)){const we=dow(day)===6?' sat':dow(day)===0?' sun':'',list=week?el('div',null,'calendar-week-day'+(day===todayDay?' today':'')+we):box;if(week){if(day<todayDay)list.setAttribute('data-past','');list.title=md(day)+' ('+wd(day)+') · 눌러서 하루 보기';list.addEventListener('click',ev=>{if(ev?.target?.closest?.('button'))return;void perform(async()=>{calendarMode='TODAY';calendarDate=day;await render();});});add(days,list);}const head=week?add(el('h3',null,'date-group'+(day===todayDay?' today':'')),el('span',wd(day),'date-group-wd'+we),el('span',String(Number(day.slice(8))),'date-group-num'+we)):add(el('h3',null,'date-group'+(day===todayDay?' today':'')),el('span',md(day)+' ','date-group-day'),el('span','('+wd(day)+')','date-group-wd'+we));if(week)head.setAttribute('aria-label',md(day)+' ('+wd(day)+')');if(day===todayDay){head.setAttribute('aria-current','date');add(head,todayMark());}add(list,head);const es=calendarState.events.filter(e=>e.date===day);for(const e of es)add(list,week?eventButton(e):row(e.title,(e.time||'종일')+' · '+LABEL[e.kind],eventButton(e)));const os=outer?.on(day)??[];for(const o of os)add(list,outer.chip(o));if(!es.length&&!os.length)add(list,hint('일정 없음'));}add(root,box);}outer?.panel(root);}
function moveCalendar(n){void perform(async()=>{if(calendarStep(calendarMode,calendarDate,n)===null){status('달력은 0000-01-01부터 9999-12-31까지만 볼 수 있습니다.');return;}if(calendarMode==='MONTH'){const d=new Date(calendarDate.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);calendarDate=d.toISOString().slice(0,10);}else calendarDate=shifted(calendarDate,n*(calendarMode==='7_DAY'?7:1));await render();});}
function openCalendarItem(e){return e.source==='PLAN'?editPlan(whole.plans.find(p=>p.entityId===e.planId)):editEvent(whole.events.find(v=>v.entityId===e.eventId));}
function eventButton(e){const n=button((e.time?e.time+' ':'')+e.title,()=>openCalendarItem(e),'calendar-event '+e.kind);n.title=(e.source==='PLAN'?'계획에서 파생됨':'직접 입력')+(e.totalOccurrences>1?' · '+e.occurrence+'/'+e.totalOccurrences:'');return n;}
function editEvent(event){const d=event?.data||{title:'',domain:null,date:calendarDate||whole.localDate,time:null,allDay:true,kind:'APPOINTMENT',planId:null,milestoneId:null,recurrence:null,notes:'',deleted:false};modal(event?'일정 편집':'새 일정',root=>{const f={},grid=el('div',null,'field-grid');add(root,grid);f.title=field(grid,'일정 제목','text',d.title);f.title.required=true;f.title.maxLength=150;f.date=field(grid,'날짜','date',d.date);f.date.required=true;f.allDay=field(grid,'종일','checkbox',d.allDay);f.time=field(grid,'시간 (선택)','time',d.time);f.kind=field(grid,'일정 종류','select',d.kind,['DEADLINE','APPOINTMENT','REVIEW','MILESTONE']);const extra=add(el('details',null,'form-more'),el('summary','영역 · 반복 · 계획 연결 · 메모 (선택)')),extraGrid=add(extra,el('div',null,'field-grid'));f.domain=field(extraGrid,'일정 영역','select',d.domain,[['','미분류'],...whole.domains.map(d=>[d.code,d.code+' · '+d.name])]);extra.open=!!(d.recurrence||d.planId||d.milestoneId||d.notes);add(root,extra);f.planId=field(extraGrid,'연결 계획','select',d.planId,[['','연결 없음'],...whole.plans.map(p=>[p.entityId,p.data.title])]);f.milestoneId=field(extraGrid,'연결 중간 목표','select','','');const updateMilestones=()=>{const options=[['','연결 없음'],...(whole.plans.find(p=>p.entityId===f.planId.value)?.data.milestones||[]).map(m=>[m.milestoneId,m.title])];f.milestoneId.replaceChildren(...options.map(([value,label])=>{const o=el('option',label);o.value=value;return o;}));};updateMilestones();f.milestoneId.value=d.milestoneId||'';f.planId.addEventListener('change',updateMilestones);f.repeat=field(extraGrid,'반복','select',d.recurrence?.frequency||'NONE',[['NONE','반복 없음'],['DAILY','일 단위'],['WEEKLY','주 단위']]);f.interval=field(extraGrid,'반복 간격 (1–30)','number',d.recurrence?.interval||1);f.interval.min=1;f.interval.max=30;f.count=field(extraGrid,'총 횟수 (2–52)','number',d.recurrence?.count||2);f.count.min=2;f.count.max=52;f.notes=field(extraGrid,'일정 메모','textarea',d.notes);add(root,hint('종일 선택 시 시간은 저장하지 않습니다. 반복을 편집하면 앞으로 표시할 전체 반복 묶음이 바뀌고 원본은 이력에 남습니다.'));if(event)add(root,button('일정 삭제…',()=>{cancelEditor();deleteEvent(event);},'danger'));return ()=>entity('EVENT',event?.entityId||entityId(),{title:f.title.value,domain:f.domain.value||null,date:f.date.value,time:f.allDay.checked?null:f.time.value||null,allDay:f.allDay.checked,kind:f.kind.value,planId:f.planId.value||null,milestoneId:f.milestoneId.value||null,recurrence:f.repeat.value==='NONE'?null:{frequency:f.repeat.value,interval:Number(f.interval.value),count:Number(f.count.value)},notes:f.notes.value,deleted:false},event?.heads||[]);});}
function deleteEvent(event){modal('일정 삭제 확인',root=>{add(root,el('p',event.data.title+'의 모든 반복을 일정에서 숨깁니다. 원본과 삭제 이력은 보존됩니다.'));const reason=field(root,'삭제 이유','text','');reason.required=true;reason.maxLength=300;const confirm=field(root,'이 일정의 삭제를 확인합니다','checkbox',false);confirm.required=true;return ()=>entity('EVENT',event.entityId,{...event.data,deleted:true},event.heads,reason.value,confirm.checked);},'삭제 이력 저장');}
const FINANCE_FIELDS=[['cashAccounts','유동 현금'],['debts','부채'],['restrictedAssets','제한 자산'],['monthlyFixedCosts','월 고정비'],['upcomingPayments','예정 납부'],['incomeItems','수입 항목']];
function renderFinance(root){const f=whole.finance;add(root,add(el('div',null,'section-toolbar'),hint('최근 재정 기록 기준 · '+(f.snapshotDate||'아직 없음')),button('재정 기록 추가',()=>editFinance(null),'primary')),add(el('div',null,'metric-grid'),metric('유동 현금',money(f.totalLiquidCash)),metric('총 부채',money(f.totalDebt)),metric('순자산',money(f.netPosition),'유동 현금 + 제한 자산 − 부채'),metric('이번 달 고정비',money(f.currentMonthFixedCost),'이번 달 재정 기록이 있어야 표시')));const next=section('다음 납부');add(next,f.nextPayment?row(f.nextPayment.label,f.nextPayment.date,money(f.nextPayment.amount)):empty(f.upcomingPaymentsKnown?'입력된 예정 납부 중 날짜가 확인된 다음 항목 없음':'모름 · 예정 납부 정보 미입력'));add(root,next,hint('모름은 0이 아닙니다. 제한 자산은 바로 쓸 수 있는 현금과 구분됩니다. 서로 다른 기준일이나 통화를 합산하지 않습니다.'));for(const snapshot of whole.finances){const d=snapshot.data,p=section(d.snapshotDate+' · '+(d.currency==='KRW'?'원':d.currency)),grid=el('div',null,'money-grid');for(const [key,label]of FINANCE_FIELDS){const category=section(label);if(d[key]===null)add(category,empty('모름'));else if(!d[key].length)add(category,hint('명시적으로 없음 · 0'));else for(const item of d[key])add(category,row(item.label,item.date??'',money(item.amount,d.currency)));add(grid,category);}add(p,grid,hint(d.notes),button('재정 기록 편집 · '+d.snapshotDate,()=>editFinance(snapshot)));add(root,p);}if(!whole.finances.length)add(root,empty('실제로 확인한 금액만 입력하세요. 모르는 항목은 모름으로 남길 수 있습니다.'));}
function editFinance(snapshot){const d=snapshot?.data||{snapshotDate:whole.localDate,currency:'KRW',minorUnitDigits:0,notes:'',...Object.fromEntries(FINANCE_FIELDS.map(([k])=>[k,null]))};modal(snapshot?'재정 기록 편집':'새 재정 기록',root=>{const grid=el('div',null,'field-grid');add(root,grid);const date=field(grid,'기준일','date',d.snapshotDate);date.required=true;date.max=whole.localDate;const currency=field(grid,'통화 코드','text',d.currency);currency.required=true;currency.pattern='[A-Z]{3}';currency.maxLength=3;const precision=field(grid,'금액 소수 자릿수','select',String(d.minorUnitDigits),[['0','정수 (원 등)'],['2','소수 둘째 자리 (USD 등)']]);const categories=[];for(const [key,label]of FINANCE_FIELDS){const p=section(label),dated=['upcomingPayments','incomeItems'].includes(key),mode=field(p,label+' 입력 상태','select',d[key]===null?'UNKNOWN':d[key].length?'ITEMS':'NONE',[['UNKNOWN','아직 모름'],['NONE','명시적으로 없음 (0)'],['ITEMS','항목 직접 입력']]),list=el('div',null,'editable-list'),items=[];const addRow=item=>{const row=el('div',null,'edit-row'),label=field(row,'항목 이름','text',item.label),amount=field(row,'금액 (빈칸은 모름)','text',item.amount??'');label.maxLength=100;amount.inputMode='decimal';const when=dated?field(row,'납부 / 수입 날짜 (선택)','date',item.date):null;const record={id:item.itemId,label,amount,when};items.push(record);add(row,button('항목 제거',()=>{items.splice(items.indexOf(record),1);row.remove();}));add(list,row);};for(const item of d[key]||[])addRow(item);const plus=button(label+' 항목 추가',()=>{mode.value='ITEMS';sync();if(items.length<50)addRow({itemId:entityId(),label:'',amount:null,date:null});});const sync=()=>{list.hidden=mode.value!=='ITEMS';};mode.addEventListener('change',sync);sync();add(p,list,plus);add(root,p);categories.push({key,mode,items,dated});}const notes=field(root,'재정 메모','textarea',d.notes);return ()=>{const data={snapshotDate:date.value,currency:currency.value,minorUnitDigits:Number(precision.value),notes:notes.value};for(const c of categories){if(c.mode.value==='UNKNOWN')data[c.key]=null;else if(c.mode.value==='NONE')data[c.key]=[];else{if(!c.items.length)throw appError('FINANCE_ITEMS_REQUIRED');data[c.key]=c.items.map(i=>{const raw=i.amount.value.replace(/[,\s]/g,'');return {itemId:i.id,label:i.label.value,amount:raw===''?null:raw,...(c.dated?{date:i.when.value||null}:{})};});}}return entity('FINANCE',snapshot?.entityId||entityId(),data,snapshot?.heads||[]);};});}
// FIN01 가계부 화면(F2 입력·목록·가져오기·규칙, F3 시각화). 저장은 기존 entity() 경로 하나만 쓴다(엔티티 1개 = 연산 1개).
// 계산은 fin-charts.mjs·fin-ledger.mjs(순수 함수), 그리기는 SVG createElementNS + styles.css 클래스. 금액은 BigInt, null(모름)은 0이 아니다.
const FIN_TABS=[['CHARTS','한눈에 · 그래프'],['ANALYSIS','분석'],['TXNS','거래'],['RECURRING','정기 결제'],['BUDGET','예산'],['ACCOUNTS','계정'],['RULES','규칙'],['STATEMENT','명세서 가져오기'],['IMPORT','과거 이력 가져오기']];
const FIN_KIND_TEXT={EXPENSE:'지출',INCOME:'수입',REFUND:'환불',TRANSFER:'이체',PREPAID_LOAD:'선불 충전'};
const FIN_ACCOUNT_TEXT={CARD:'카드',CASH:'현금',BANK:'은행 계좌',EPAY:'간편결제·페이',LOAN:'대출',OTHER:'기타'};
const FIN_ROW_TEXT={PURCHASE:'승인',FULL_CANCEL:'전액 취소',REFUND:'환불',PARTIAL_UNKNOWN:'부분 취소 · 실제 금액 모름',POSTED:'직접 입력'};
const SVG_NS='http://www.w3.org/2000/svg';
let finTab='CHARTS',finPeriod='LAST_12',finCustom={from:'',to:''},finMask=true,finTree=[],finMonth=null,finFilter={accountId:'',category:''},finImport=null,finResizeTimer=null,finLastWidth=0,finSameOnly=false;
const finTables=new Set();
function svgEl(tag,attrs={},cls){const n=document.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(cls)n.setAttribute('class',cls);return n;}
function svgText(x,y,text,cls,anchor='start'){const n=svgEl('text',{x,y,'text-anchor':anchor},cls);n.textContent=text;return n;}
function svgTip(node,text){const t=svgEl('title');t.textContent=text;node.append(t);return node;}
function svgRoot(w,h,label){return svgEl('svg',{width:w,height:h,viewBox:'0 0 '+w+' '+h,role:'img','aria-label':label},'fin-svg');}
const finCatLabel=c=>c==='REST'?'그 외 분류':c===null||c===undefined?'분류 없음':whole.fin.labels.expense[c]??whole.fin.labels.income[c]??c;
const finCatClass=c=>c==='REST'?'c-rest':c===null||c===undefined?'c-none':Object.hasOwn(whole.fin.labels.expense,c)?'c'+Object.keys(whole.fin.labels.expense).indexOf(c):'c-income';
const finAccountName=id=>whole.fin.accounts.find(a=>a.id===id)?.data.name??id;
const finCount=n=>Number(n).toLocaleString('ko-KR');
// 글자 폭을 대략 재서 자르기(한글·전각 ≈ 1em, 숫자·영문 ≈ 0.6em). 잘린 전체 이름은 title(툴팁)과 표에 있다.
const finCharW=(c,size)=>(/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(c)?1:c===' '?0.33:0.62)*size;
function fitText(text,width,size=11){const chars=[...text];let w=0;for(let i=0;i<chars.length;i++){w+=finCharW(chars[i],size);if(w>width){let cut=i;while(cut>0&&w+finCharW('…',size)>width){cut--;w-=finCharW(chars[cut],size);}return cut<1?'':chars.slice(0,cut).join('')+'…';}}return text;}
function finTable(headers,rows,numeric=[]){
 const wrap=el('div',null,'table-wrap'),t=el('table',null,'fin-table'),head=el('tr'),body=el('tbody');
 headers.forEach((h,i)=>{const th=el('th',h);if(numeric.includes(i))th.className='num';head.append(th);});
 for(const r of rows){const tr=el('tr');r.forEach((c,i)=>{const td=el('td',c);if(numeric.includes(i))td.className='num';tr.append(td);});body.append(tr);}
 t.append(add(el('thead'),head),body);wrap.append(t);if(!rows.length)wrap.append(empty('표시할 행이 없습니다.'));return wrap;
}
function finLegend(items){const ul=el('ul',null,'fin-legend');for(const [cls,text] of items)add(ul,add(el('li'),el('span','','swatch '+cls),el('span',text)));return ul;}
function finChart(root,key,title,sub,draw,table){
 const showTable=finTables.has(key),p=el('section',null,'panel fin-chart');
 const toggle=button(showTable?'그래프로 보기':'표로 보기',()=>void perform(async()=>{if(showTable)finTables.delete(key);else finTables.add(key);await render();}),'secondary');toggle.dataset.navOnly='1';toggle.setAttribute('aria-pressed',String(showTable));
 const box=el('div',null,'chart-box');add(p,add(el('div',null,'fin-chart-head'),el('h2',title),toggle),sub?hint(sub):null,box);add(root,p);
 if(showTable)box.append(table());else draw(box,Math.max(260,Math.floor(box.clientWidth||300)));
}
function finCheck(parent,label,checked,onChange){const wrap=el('label',null,'inline'),input=el('input');input.type='checkbox';input.checked=checked;input.dataset.navOnly='1';input.setAttribute('aria-label',label);input.addEventListener('change',()=>onChange(input.checked));add(wrap,input,el('span',label));parent.append(wrap);return input;}
function finSelect(parent,label,value,options,onChange){const s=field(parent,label,'select',value,options);s.dataset.navOnly='1';s.addEventListener('change',()=>onChange(s.value));return s;}

// 금고 연산 한도 안내(문구만). 검증한 원격 버전이 없으면 UNKNOWN(확인 불가)이고 막지 않는다.
// 가리기는 화면과 CSV 내려받기에 함께 적용된다(저장값은 바꾸지 않음). 두 탭이 같은 상태(finMask)를 쓴다.
const FIN_MASK_LABEL='민감 가맹점 가리기 (화면·CSV)';
const finOps=()=>opBudget(whole.settings?.remoteCheckpoint,{pending:mdProduct?.drafts??0});
// 로컬 용량(F10-5 형식별): 형식 4 이하는 state 바이트 / 약 3.7MB(실효 상한), 형식 5는 머리 바이트 / 상한 + 이번 실행 봉인 예산. 서버 남은 연산과 함께 보고, 더 급한 쪽 단계로 안내한다(문구만, 동작은 막지 않음).
const finLocal=()=>localBudget(whole.settings?.localState,{ops:whole.settings?.remoteCheckpoint?.version??null});
function opsNotice(b,{always=false}={}){const n=capacityNotice(b,finLocal());if(!always&&(n.stage==='OK'||n.stage==='UNKNOWN'))return null;const p=add(el('p',null,'ops-notice ops-'+n.tone),...n.lines.map(t=>el('span',t)));p.dataset.stage=n.stage;if(n.limitedBy)p.dataset.limitedBy=n.limitedBy;
 const c=always?compactionText(whole.settings?.localState?.compaction):null;if(c)add(p,el('span',c,'ops-compaction'));const h=always?housekeepingText(whole.settings?.localState?.housekeeping):null;if(h)add(p,el('span',h,'ops-compaction'));return p;}
function renderLedger(root){
 const fin=whole.fin;
 if(!fin){add(root,empty('이 앱 버전은 가계부 자료를 보내지 않습니다. 모든 기기를 새 빌드로 업데이트하세요.'));return;}
 const tabs=el('div',null,'fin-tabs');tabs.setAttribute('role','toolbar');tabs.setAttribute('aria-label','돈 화면');
 for(const [k,label] of FIN_TABS){const b=button(label,()=>void perform(async()=>{if(finTab!==k&&typeof clearScreenNote==='function')clearScreenNote();finTab=k;await render();}),'secondary'+(finTab===k?' active':''));b.dataset.navOnly='1';b.setAttribute('aria-pressed',String(finTab===k));add(tabs,b);}
 // FIX44 (AUD1 #7): 빠른 지출은 돈 탭 맨 위. 어느 소탭에서든 바로 연다(기존 빠른 지출 입력 창).
 add(root,add(el('div',null,'button-row fin-quick-bar'),button('빠른 지출',()=>openQuickExpense(fin),'primary')));
 add(root,opsNotice(finOps()),tabs);
 if(finTab!=='STATEMENT'&&finStmt&&!finStmt.running)finStmt=null;   // B64: 명세서 파일 내용은 소탭을 떠나면 버린다
 if(fin.incompleteSplits?.length)add(root,el('p','분할 묶음 미완료 · '+fin.incompleteSplits.map(x=>x.chunk+' ('+x.saved.length+'/'+x.count+'조각 저장)').join(', ')+' · 이 달의 합계·그래프는 일부만 반영된 상태입니다. "과거 이력 가져오기"에서 같은 계획 파일로 이어서 가져오세요.','fin-warn'));
 if(finTab==='PLAN')finTab='RECURRING';   // V6F (지시서 8): 예전 "반복 · 고정비" 소탭은 "정기 결제" 안으로 합쳤다(다른 화면에서 PLAN으로 오면 합친 화면)
 ({CHARTS:renderFinCharts,ANALYSIS:renderFinAnalysis,TXNS:renderFinTxns,PLAN:renderFinPlan,RECURRING:renderFinRecurring,BUDGET:renderFinBudget,ACCOUNTS:renderFinAccounts,RULES:renderFinRules,STATEMENT:renderFinStatement,IMPORT:renderFinImport})[finTab](root,fin);
 if(finTab==='CHARTS'){const seq=mdSignedOutSeq;renderBudgetReport(root,{h:{el,add},surface:mdSurface,request:aiReports,gone:()=>seq!==mdSignedOutSeq});}   // B59: 돈 탭 하단, 사령부 가계부 비서 최신 1장(없으면 카드 없음)
}
addEventListener('resize',()=>{if(view!=='LEDGER'||finTab!=='CHARTS'||Math.abs(innerWidth-finLastWidth)<40)return;clearTimeout(finResizeTimer);finResizeTimer=setTimeout(()=>{if(view==='LEDGER'&&finTab==='CHARTS'&&!busy&&!$('editor').open)void perform(render);},400);});

// ---------- F3 시각화 ----------
function renderFinCharts(root,fin){
 finLastWidth=innerWidth;
 const prep=prepare(fin),range=periodRange(finPeriod,whole.localDate,finCustom),bar=el('div',null,'fin-toolbar');
 feelCard(root,fin);   // M1A: 한 문장 진단 카드
 vaultCard(root,fin);   // F11: 금고가 맨 위
 renderFixedSchedule(root,fin);   // F59V: 이번 달 고정비 예정·확정(규칙에서 투영)
 feelAssistRow(root);   // M1C: 진단 카드 맨 아래 비서 줄(PC 앱만)
 if(fin.lines.length||fin.residuals.length)renderMonthInsight(root,prep,budgetStatus(prep,fin.budgets,whole.localDate.slice(0,7),whole.localDate));
 finSelect(bar,'기간',finPeriod,PERIODS,v=>void perform(async()=>{finPeriod=v;finTree=[];if(v==='CUSTOM'&&!finCustom.from){finCustom={from:shiftMonth(whole.localDate.slice(0,7),-5),to:whole.localDate.slice(0,7)};}await render();}));
 if(finPeriod==='CUSTOM'){const f=field(bar,'시작 달','month',finCustom.from),t=field(bar,'끝 달','month',finCustom.to);for(const n of [f,t]){n.dataset.navOnly='1';n.max=whole.localDate.slice(0,7);n.addEventListener('change',()=>void perform(async()=>{finCustom={from:f.value,to:t.value};finTree=[];await render();}));}}
 finCheck(bar,FIN_MASK_LABEL,finMask,v=>void perform(async()=>{finMask=v;await render();}));
 add(root,bar,el('p',range.label+(range.error?' · 시작 달이 끝 달보다 늦거나 비어 있습니다':''),'muted small fin-range'));
 if(!fin.lines.length&&!fin.residuals.length){add(root,empty('아직 가계부 자료가 없습니다. "거래"에서 직접 입력하거나 "과거 이력 가져오기"로 가져오세요.'));return;}

 const agg=aggregate(prep,range),ov=overview(prep,whole.localDate),t=agg.total;
 const diff=ov.diff===null?'이번 달이나 지난달 소비를 알 수 없어(자료 없음·실제 금액 모름) 비교하지 않음':ov.diff===0n?'지난달과 같음':(ov.diff>0n?'지난달보다 '+formatWon(ov.diff)+' 많음':'지난달보다 '+formatWon(-ov.diff)+' 적음');
 add(root,add(el('div',null,'metric-grid fin-metrics'),
  metric('이번 달 소비 · '+ov.month,ov.currentState==='NO_DATA'?'자료 없음':ov.currentState==='UNKNOWN_ONLY'?'모름':formatWon(ov.current),diff+(ov.currentUnknown?' · 실제 금액 모름 '+ov.currentUnknown+'행 별도':'')),
  metric('기간 소비 (지출 − 환불)',formatWon(t.consumption),'지출 '+formatWon(t.spend)+' · 환불 '+formatWon(t.refund)),
  metric('선불 전환 (기간)',formatWon(t.prepaid),'상품권·선불 충전 · 소비 합계에 넣지 않음'),
  metric('미배분 잔액',agg.residualCount?formatWon(agg.residualNet):'해당 없음',agg.residualCount?agg.residualYears.join(', ')+'년 · 연 단위 · 월별 그래프에 넣지 않음':'기간과 겹치는 해의 미배분 잔액 없음')));
 add(root,add(el('div',null,'fin-chips'),
  add(el('span',null,'fin-chip'),el('span','실제 금액 모름'),el('strong',finCount(t.unknownRows)+'행'),el('span','합계에서 제외')),
  add(el('span',null,'fin-chip'),el('span','이체'),el('strong',formatWon(t.transfer)),el('span','소비 아님')),
  add(el('span',null,'fin-chip'),el('span','수입'),el('strong',formatWon(t.income)))));
 renderFinTreemap(root,prep,range);   // F11: 어디에 썼나
 finChart(root,'trend','최근 12개월 추세','달마다 소비(지출 − 환불). 점선 칸은 자료가 없는 달(0원이 아님).',(box,w)=>{
  const h=120,n=ov.trend.length,slot=w/n,bw=Math.max(4,Math.min(28,slot*0.62)),max=ov.trend.reduce((m,r)=>r.consumption!==null&&r.consumption>m?r.consumption:m,0n)||1n,s=svgRoot(w,h,'최근 12개월 소비 추세');
  ov.trend.forEach((r,i)=>{const x=slot*i+(slot-bw)/2;
   if(r.consumption===null){s.append(svgTip(svgEl('rect',{x:x.toFixed(1),y:6,width:bw.toFixed(1),height:h-26},'no-data'),r.month+' · '+(r.unknownOnly?'실제 금액 모름만 있음':'자료 없음')));}
   else{const v=r.consumption>0n?r.consumption:0n,bh=Math.max(1,Number(v)/Number(max)*(h-26));s.append(svgTip(svgEl('rect',{x:x.toFixed(1),y:(h-20-bh).toFixed(1),width:bw.toFixed(1),height:bh.toFixed(1)},'bar trend-bar'+(r.month===ov.month?' current':'')),r.month+' · '+formatWon(r.consumption)));}
   if(i%Math.max(1,Math.ceil(n*34/w))===0||i===n-1)s.append(svgText((slot*i+slot/2).toFixed(1),h-5,r.month.slice(5)+'월','axis-label','middle'));});
  box.append(s);
 },()=>finTable(['달','소비'],ov.trend.map(r=>[r.month,r.consumption!==null?formatWon(r.consumption):r.unknownOnly?'모름':'자료 없음']),[1]));
 // F11: 나머지 그림은 "자세히"로 접는다. 닫혀 있으면 그리지 않는다.
 lazyDetails(root,'more','자세히 · 돈의 흐름 · 월별 분류 · 평생 타임라인 · 달력 히트맵 · 자료 완정성',d=>{
  renderFinSankey(d,prep,range);renderFinMonthly(d,prep,range);renderFinTimeline(d,prep);renderFinHeatmap(d,prep,range);renderFinCompleteness(d,prep,range);
 });
}
function renderFinSankey(root,prep,range){
 const small=narrow(),data=sankeyData(prep,range,{withSubs:!small,maxCategories:small?6:8});
 finChart(root,'sankey','돈의 흐름',(data.hasIncome?'수입 → ':'')+'계정 → 분류'+(small?'':' → 세부 분류')+' · 기간 소비 '+formatWon(aggregate(prep,range).total.consumption)+' · 그림에 그린 소비 흐름 '+formatWon(data.total)+(data.excluded.length?' (환불이 더 큰 연결 '+data.excluded.length+'개는 빼고 표에 표시)':'')+' · 이체·선불 전환 제외',(box,w)=>{
  if(!data.links.length){box.append(empty('이 기간에 그릴 소비 흐름이 없습니다.'));return;}
  const h=small?320:400,L=sankeyLayout(data,{width:w,height:h,nodeWidth:10,gap:small?8:10}),s=svgRoot(w,h,'돈의 흐름 Sankey 그림');
  for(const l of L.links)s.append(svgTip(svgEl('path',{d:l.d,'stroke-width':l.t},'sk-link '+(l.kind==='income'?'c-income':finCatClass(l.cat))),L.nodes.find(n=>n.id===l.source).label+' → '+L.nodes.find(n=>n.id===l.target).label+' · '+formatWon(l.value)));
  const cols=new Set(L.nodes.map(n=>n.colIndex)).size,room=cols>1?w/(cols-1)-16:w;
  for(const n of L.nodes){
   // 노드 높이는 들어온·나간 값 중 큰 쪽이지만, 이름 옆 금액은 계정=소비로 나간 값, 수입=나간 값, 분류=들어온 값.
   const shown=n.kind==='account'?n.valueOut:n.kind==='income'?n.valueOut:n.valueIn;
   const tip=n.kind==='account'?n.label+' · 소비로 나감 '+formatWon(n.valueOut)+(n.valueIn>0n?' · 수입 들어옴 '+formatWon(n.valueIn):''):n.label+' · '+formatWon(shown);
   s.append(svgTip(svgEl('rect',{x:n.x,y:n.y,width:n.w,height:n.h},'sk-node '+(n.kind==='account'?'node-account':n.kind==='income'?'c-income':finCatClass(n.cat))),tip));
   if(n.h<9)continue;
   const text=n.label+(small||shown===0n?'':' '+formatCompact(shown));
   s.append(svgText(n.last?n.x-4:n.x+n.w+4,(n.y+n.h/2+4).toFixed(1),fitText(text,Math.max(40,n.last?room*0.9:room*0.55)),'sk-label',n.last?'end':'start'));
  }
  box.append(s,hint('노드 높이가 작아 이름이 안 보이는 항목은 손가락을 대거나 "표로 보기"에서 확인하세요.'));
 },()=>finTable(['출발','도착','금액'],[...data.links.map(l=>[data.nodes.find(n=>n.id===l.source).label,data.nodes.find(n=>n.id===l.target).label,formatWon(l.value)]),...data.excluded.map(x=>[x.from,x.to+' (흐름에서 제외)',formatWon(x.value)])],[2]));
}
function renderFinMonthly(root,prep,range){
 const small=narrow(),series=monthlySeries(prep,range,{maxCategories:small?4:6,localDate:whole.localDate});
 finChart(root,'monthly','월별 소비 · 분류 누적 + 3개월 이동평균','막대는 분류별 소비(환불을 뺀 실제 금액이 양수인 분류만 쌓음), 선은 3개월 이동평균. 3개월 중 자료 없는 달이 있으면 평균을 그리지 않음.',(box,w)=>{
  if(!series.rows.length){box.append(empty('이 기간에 자료가 없습니다.'));return;}
  const h=small?230:290,L=barLayout(series,{width:w,height:h,padL:small?46:58}),s=svgRoot(w,h,'월별 소비 누적 막대와 3개월 이동평균');
  for(const t of L.ticks){s.append(svgEl('line',{x1:L.padL,x2:w-10,y1:t.y,y2:t.y},'grid-line'));s.append(svgText(L.padL-6,t.y+4,formatCompact(t.value),'axis-label','end'));}
  for(const g of L.gaps)s.append(svgTip(svgEl('rect',{x:g.x,y:g.y,width:g.w,height:g.h},'no-data'),g.month+' · '+(g.unknownOnly?'실제 금액 모름만 있음':'자료 없음')));
  for(const r of L.rects)s.append(svgTip(svgEl('rect',{x:r.x,y:r.y,width:r.w,height:r.h},'bar '+finCatClass(r.cat)),r.month+' · '+finCatLabel(r.cat)+' · '+formatWon(r.value)));
  for(const seg of L.segments){if(seg.length>1)s.append(svgEl('polyline',{points:seg.map(p=>p.x+','+p.y).join(' ')},'ma-line'));for(const p of seg)s.append(svgTip(svgEl('circle',{cx:p.x,cy:p.y,r:2.6},'ma-dot'),p.month+' · 3개월 이동평균 '+formatWon(p.value)));}
  for(const l of L.labels)s.append(svgText(l.x,h-8,l.text,'axis-label','middle'));
  box.append(s,finLegend([...series.cats.map(c=>[finCatClass(c),finCatLabel(c)]),['line','3개월 이동평균'],['no-data','자료 없음']]));
 },()=>finTable(['달','소비','3개월 평균',...series.cats.map(finCatLabel),'실제 금액 모름'],series.rows.map(r=>[r.month,r.unknownOnly?'모름':r.hasData?formatWon(r.total):'자료 없음',r.ma===null?'-':formatWon(r.ma),...series.cats.map(c=>{const p=r.parts.find(x=>x.cat===c);return r.hasData&&!r.unknownOnly?formatWon(p?.value??0n):'-';}),r.hasData?r.unknownRows+'행':'-']),[1,2,...series.cats.map((_,i)=>i+3)]));
}
function renderFinTreemap(root,prep,range){
 const small=narrow(),T=treemapItems(prep,range,finTree,{maxItems:small?12:24}),level=finTree.length;
 const crumbs=add(el('div',null,'crumbs'),el('span','보는 단계:'));
 const go=path=>()=>void perform(async()=>{finTree=path;await render();});
 add(crumbs,button('전체 분류',go([]),'secondary'));if(level>=1)add(crumbs,el('span','›'),button(finCatLabel(finTree[0]),go(finTree.slice(0,1)),'secondary'));if(level>=2)add(crumbs,el('span','›'),el('strong',finTree[1]));
 for(const b of crumbs.querySelectorAll('button'))b.dataset.navOnly='1';
 const name=item=>level===2&&item.sample?shownMerchant(item.sample,finMask):item.label;
 finChart(root,'treemap','분류 트리맵',(level===0?'대분류':level===1?'세부 분류':'가맹점')+' 비중 · 합계 '+formatWon(T.total)+(T.drillable?' · 칸을 누르면 한 단계 아래로':'')+(T.excluded.length?' · 실제 금액 0원 이하 '+T.excluded.length+'개 제외(표에 표시)':''),(box,w)=>{
  box.append(crumbs);
  if(!T.items.length){box.append(empty('이 기간·단계에 양수 소비가 없습니다.'));return;}
  const h=small?280:340,rects=squarify(T.items,0,0,w,h),s=svgRoot(w,h,'분류 트리맵');
  for(const r of rects){
   const cls='tm-cell '+(r.rest?'c-rest':finCatClass(level?finTree[0]:r.key))+(level?' tm-sub':''),pct=T.total>0n?Number(roundDiv(r.value*1000n,T.total))/10:0;
   const cell=svgTip(svgEl('rect',{x:r.x,y:r.y,width:Math.max(0,r.w),height:Math.max(0,r.h)},cls),name(r)+' · '+formatWon(r.value)+' · '+pct.toFixed(1)+'% · '+r.count+'건');
   if(T.drillable&&!r.rest){cell.setAttribute('tabindex','0');cell.setAttribute('role','button');cell.setAttribute('aria-label',name(r)+' 세부 보기');const open=go([...finTree,r.key]);cell.addEventListener('click',open);cell.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});}
   s.append(cell);
   if(r.w>=40&&r.h>=34){const v=formatCompact(r.value),full=v+' · '+pct.toFixed(0)+'%';s.append(svgText(r.x+6,r.y+17,fitText(name(r),r.w-10,12),'tm-label'));s.append(svgText(r.x+6,r.y+31,fitText(fitText(full,r.w-10,11)===full?full:v,r.w-10,11),'tm-value'));}
  }
  box.append(s);
 },()=>add(el('div'),crumbs,finTable([level===2?'가맹점':level===1?'세부 분류':'분류','금액','비중','건수'],[...T.items.map(r=>[name(r),formatWon(r.value),(T.total>0n?(Number(roundDiv(r.value*1000n,T.total))/10).toFixed(1):'0.0')+'%',finCount(r.count)]),...T.excluded.map(r=>[name(r)+' (실제 금액 0원 이하 · 제외)',formatWon(r.value),'-',finCount(r.count)])],[1,2,3])));
}
function renderFinHeatmap(root,prep,range){
 const HM=heatmapMonths(prep,range,whole.localDate,{maxMonths:12}),th=HM.thresholds;
 finChart(root,'heatmap','달력 히트맵','날마다 소비(지출 − 환불)의 진하기. 테두리는 소비가 가장 컸던 3일(집중일).'+(HM.truncated?' 기간이 길어 최근 12개월만 그림 · 표에 전체 일자':''),(box,w)=>{
  if(!HM.months.length){box.append(empty('이 기간에 자료가 없습니다.'));return;}
  const cell=w<420?15:17,step=cell+2,wrap=el('div',null,'heat-months');
  for(const m of HM.months){
   const s=svgRoot(7*step+2,20+m.weeks*step,m.month+' 달력 히트맵');s.append(svgText(1,13,m.month+(m.hasData?'':' · 자료 없음'),'heat-title'));
   for(const c of m.cells){
    const cls='heat '+(c.future?'future':c.level===null?'nodata':c.level===-2?'lunk':c.level===-1?'lneg':'l'+c.level)+(c.focus?' focus':'');
    s.append(svgTip(svgEl('rect',{x:1+c.weekday*step,y:19+c.week*step,width:cell,height:cell,rx:2},cls),c.date+' · '+(c.level===null?'자료 없는 달':c.level===-2?'모름':c.net===null?'소비 없음':formatWon(c.net)+' · '+c.count+'건')+(c.unknown?' · 실제 금액 모름 '+c.unknown+'건':'')+(c.focus?' · 집중일':'')));
    if(c.unknown)s.append(svgEl('circle',{cx:1+c.weekday*step+cell-3,cy:19+c.week*step+3,r:2},'heat-unknown'));
   }
   wrap.append(s);
  }
  const lv=th.length?[['heat-l1','~ '+formatCompact(th[1])],['heat-l2',formatCompact(th[1])+' ~'],['heat-l3',formatCompact(th[2])+' ~'],['heat-l4',formatCompact(th[3])+' ~']]:[];
  box.append(wrap,finLegend([['heat-l0','소비 없음'],...lv,['heat-lneg','환불이 더 큰 날'],['heat-lunk','실제 금액 모름만 있는 날'],['heat-focus','집중일'],['heat-nodata','자료 없는 달'],['heat-unknown-dot','실제 금액 모름 포함']]));
 },()=>{const days=dailyTotals(prep,range);return finTable(['날짜','소비','건수','실제 금액 모름'],[...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([d,v])=>[d+(HM.focus.includes(d)?' · 집중일':''),v.count===0&&v.unknown>0?'모름':formatWon(v.net),finCount(v.count),v.unknown?v.unknown+'건':'-']),[1,2]);});
}
function finMonthRanges(months){const out=[];let start=null,prev=null;for(const m of months){if(start&&shiftMonth(prev,1)===m){prev=m;continue;}if(start)out.push(start===prev?start:start+'~'+prev);start=prev=m;}if(start)out.push(start===prev?start:start+'~'+prev);return out.join(', ');}
function renderFinCompleteness(root,prep,range){
 const C=completeness(prep,range,whole.localDate);
 finChart(root,'coverage','자료 완전성 지도','계정 × 달. 채운 칸은 그 달 자료가 있음, 점선 칸은 자료 없음(0원으로 보지 않음). 해 이름 옆 ◆는 그해 미배분 잔액이 있음.',(box,w)=>{
  if(!C.months.length||!C.rows.length){box.append(empty('표시할 계정·달이 없습니다.'));return;}
  const cw=Math.max(14,Math.min(26,Math.floor((w-58)/12)-2)),step=cw+2;
  for(const r of C.rows){
   const blk=add(el('div',null,'cm-block'),el('p',r.name+' · '+FIN_ACCOUNT_TEXT[r.type]+(r.active?'':' · 비활성')+' · 자료 있는 달 '+r.have+' · 없는 달 '+r.missing,'small'));
   const s=svgRoot(56+12*step,16+r.years.length*(cw+4),r.name+' 자료 완전성');
   for(let i=0;i<12;i++)s.append(svgText(56+i*step+cw/2,11,String(i+1),'axis-label','middle'));
   r.years.forEach((y,yi)=>{const top=16+yi*(cw+4);s.append(svgText(0,top+cw*0.75,y.year,'axis-label'));if(y.residual)s.append(svgTip(svgText(36,top+cw*0.75,'◆','cm-res-mark'),y.year+'년 미배분 잔액 있음'));
    y.cells.forEach((c,i)=>s.append(svgTip(svgEl('rect',{x:56+i*step,y:top,width:cw,height:cw,rx:2},c.inside?(c.rows?'cm-have':'cm-miss'):'cm-out'),c.month+' · '+(c.inside?(c.rows?c.rows+'줄':'자료 없음'):'기간 밖'))));});
   blk.append(s);box.append(blk);
  }
  box.append(finLegend([['cm-have','자료 있음'],['cm-miss','자료 없음'],['cm-out','기간 밖'],['cm-res','◆ 미배분 잔액 있는 해']]));
 },()=>finTable(['계정','자료 있는 달','자료 없는 달','없는 달 목록'],C.rows.map(r=>[r.name+(r.active?'':' (비활성)'),finCount(r.have),finCount(r.missing),finMonthRanges(r.years.flatMap(y=>y.cells.filter(c=>c.inside&&!c.rows).map(c=>c.month)))||'-']),[1,2]));
}

// ---------- F2 거래 ----------
function finLineRow(l,{showButtons=true}={}){
 const n=el('div',null,'fin-line'),meta=el('div',null,'meta'),txn=l.source==='TXN'?whole.fin.txns.find(t=>'T:'+t.id===l.key):null;
 add(meta,el('span',l.source==='BATCH'?'가져온 원천':'직접 입력','tag '+(l.source==='BATCH'?'src-batch':'src-txn')),el('span',FIN_KIND_TEXT[l.kind]),
  l.kind==='TRANSFER'?el('span',finAccountName(l.accountId)+' → '+finAccountName(l.toAccountId)):el('span',finAccountName(l.accountId)),
  l.category?el('span',finCatLabel(l.category)+(l.subcategory?' · '+l.subcategory:'')):null,
  l.source==='BATCH'&&l.status!=='PURCHASE'?el('span',FIN_ROW_TEXT[l.status]||l.status):null,
  l.ruleId?el('span','규칙 분류','tag rule'):null,l.duplicateGroup?el('span','중복 의심 '+l.duplicateGroup,'tag dup'):null,
  l.net===null?el('span','실제 금액 모름','tag unknown'):null,l.confidence==='LOW'&&l.source==='BATCH'?el('span','분류 신뢰 낮음'):null);
 const amt=el('div',l.net===null?'모름':(l.kind==='INCOME'?'+':'')+formatWon(l.net),'amount'+(l.net!==null&&l.net<0n?' neg':'')+(l.kind==='INCOME'?' income':'')+(['TRANSFER','PREPAID_LOAD'].includes(l.kind)?' muted':''));
 add(n,add(el('div',null,'main'),el('strong',l.date+' · '+shownMerchant(l,finMask)),meta),amt);
 if(txn&&showButtons)add(n,add(el('div',null,'buttons'),button('수정',()=>editFinTxn(txn)),button('무효화',()=>voidFinTxn(txn),'danger')));
 return n;
}
const finQuick=createQuickMemory(()=>globalThis.localStorage);
function renderFinTxns(root,fin){
 const prep=prepare(fin),now=whole.localDate.slice(0,7);finMonth??=now;
 const nav=el('div',null,'fin-toolbar'),move=k=>()=>void perform(async()=>{finMonth=shiftMonth(finMonth,k);await render();});
 const prev=button('◀ 이전',move(-1),'secondary nowrap'),next=button('다음 ▶',move(1),'secondary nowrap');for(const [b,l] of [[prev,'이전 달'],[next,'다음 달']]){b.dataset.navOnly='1';b.setAttribute('aria-label',l);}
 const monthNav=el('div',null,'fin-month-nav');nav.append(monthNav);const month=field(monthNav,'달','month',finMonth);month.dataset.navOnly='1';month.max=now;month.addEventListener('change',()=>{if(/^\d{4}-\d{2}$/.test(month.value))void perform(async()=>{finMonth=month.value;await render();});});
 month.parentElement.before(prev);add(monthNav,next);
 finSelect(nav,'계정 필터',finFilter.accountId,[['','모든 계정'],...fin.accounts.map(a=>[a.id,a.data.name+(a.data.active?'':' (비활성)')])],v=>void perform(async()=>{finFilter.accountId=v;await render();}));
 finSelect(nav,'분류 필터',finFilter.category,[['','모든 분류'],['NONE','분류 없음 (이체·선불)'],...Object.entries(fin.labels.expense),...Object.entries(fin.labels.income)],v=>void perform(async()=>{finFilter.category=v;await render();}));
 finCheck(nav,FIN_MASK_LABEL,finMask,v=>void perform(async()=>{finMask=v;await render();}));
 const create=button('거래 입력',()=>editFinTxn(null,{onKept:data=>finQuick.saved(data)}),'primary');if(!fin.accounts.some(a=>a.data.active))create.disabled=true;
 renderQuickChips(root,fin,{h:{el,add,button},memory:finQuick,kindText:FIN_KIND_TEXT,open:(prefill,presetId)=>editFinTxn(null,{...prefill,onKept:data=>finQuick.saved(data,presetId)}),needAccount:need=>void perform(async()=>{finTab='ACCOUNTS';await render();status(quickNeedText(need));})});   // B64C: 칩은 거래 창을 미리 채워 열기만 한다
 add(root,add(el('div',null,'section-toolbar'),hint(fin.accounts.length?'직접 입력한 거래와 가져온 줄을 함께 보여 줍니다. 가져온 줄은 바꿀 수 없고, 분류는 "분류 규칙"으로 바꿉니다.':'먼저 "계정"에서 계정을 추가하세요.'),create),nav);
 const list=monthLines(prep.lines,finMonth,finFilter),sum=aggregate({...prep,lines:list,residuals:[]},{from:null,to:null}).total;
 add(root,add(el('div',null,'fin-chips'),
  add(el('span',null,'fin-chip'),el('span',finMonth+' 소비'),el('strong',list.some(l=>(l.kind==='EXPENSE'||l.kind==='REFUND')&&l.net!==null)?formatWon(sum.consumption):list.some(l=>l.kind==='EXPENSE'||l.kind==='REFUND')?'모름':'소비 줄 없음')),
  add(el('span',null,'fin-chip'),el('span','선불 전환'),el('strong',formatWon(sum.prepaid))),
  add(el('span',null,'fin-chip'),el('span','이체(소비 아님)'),el('strong',formatWon(sum.transfer))),
  add(el('span',null,'fin-chip'),el('span','수입'),el('strong',formatWon(sum.income))),
  add(el('span',null,'fin-chip'),el('span','실제 금액 모름'),el('strong',finCount(sum.unknownRows)+'행'))));
 // FIX67 (M-01·M-03): 장부 점검 줄(계산만, 저장 0). 이 달 직접 입력 지출 중 같은 날·같은 금액·같은 계정 묶음(필터와 상관없이). 0쌍이면 숨김. 누르면 그 줄만 보여 준다. 정리는 각 줄의 [무효화] 그대로.
 const same=sameExpenseGroups(monthLines(prep.lines,finMonth));if(!same.pairs)finSameOnly=false;
 if(same.pairs){const b=button(finSameOnly?SAME_EXPENSE_TEXT.close:SAME_EXPENSE_TEXT.open,()=>void perform(async()=>{finSameOnly=!finSameOnly;await render();}),'secondary nowrap');b.dataset.navOnly='1';
  add(root,add(el('div',null,'fin-same-check'+(finSameOnly?' active':'')),el('span',SAME_EXPENSE_TEXT.check(same.pairs),'fin-same-text'),b));}
 const groups=duplicateGroups(list);
 if(groups.length){const p=section('중복 의심 묶음 '+groups.length+'개','원천 자료에서 같은 결제로 의심되어 묶인 행입니다. 같은 날짜·금액이라고 자동으로 지우지 않습니다. 실제 중복이면 원천을 고친 뒤 계획 파일을 다시 만드세요.');for(const g of groups){add(p,el('h3',g.id+' · '+g.items.length+'건 · 합계 '+formatWon(g.items.reduce((s,l)=>s+(l.net??0n),0n))+(g.items.some(l=>l.net===null)?' + 실제 금액 모름':'')));for(const l of g.items)add(p,finLineRow(l,{showButtons:false}));}add(root,p);}
 if(finMonth===now)renderFixedSchedule(root,fin,{pendingOnly:true});   // F59V: 이번 달 아직 안 나간 고정비(예정, 거래 기록 아님)
 const shown=finSameOnly?same.groups.flat():list;
 const p=finSameOnly?section(SAME_EXPENSE_TEXT.check(same.pairs),SAME_EXPENSE_TEXT.checkNote):section(finMonth+' 거래 '+finCount(list.length)+'건',finFilter.accountId||finFilter.category?'필터 적용 중':'');
 if(!finSameOnly)add(p,finCsvBar(list));
 for(const l of shown)add(p,finLineRow(l));if(!shown.length)add(p,empty('이 달에 표시할 거래가 없습니다.'));add(root,p);
 const voided=fin.txns.filter(t=>t.data.voided&&t.data.date.startsWith(finMonth));
 if(voided.length){const v=add(el('details',null,'panel'),el('summary','무효화된 거래 '+voided.length+'건 (합계에서 빠짐 · 원래 내용은 이력에 보존)'));for(const t of voided)add(v,add(el('div',null,'fin-line voided'),add(el('div',null,'main'),el('strong',t.data.date+' · '+(t.data.merchant||FIN_KIND_TEXT[t.data.kind])),el('div','무효','meta')),el('div',formatWon(t.data.kind==='REFUND'?-BigInt(t.data.amount):BigInt(t.data.amount)),'amount muted')));add(root,v);}
}
// CSV 내려받기: 지금 걸린 달·계정·분류 필터(와 민감 가맹점 가리기)를 그대로 이 기기 파일로 저장한다. 전송 없음.
// PC 제품 앱(WebView2)은 LifeBrickHost.cs가 모든 내려받기를 취소하므로 버튼을 끄고 이유를 보여 준다.
function finCsvBar(list){
 const bar=el('div',null,'fin-toolbar fin-export'),blocked=mdSurface==='APP_SHELL';
 const b=button('CSV 내려받기',()=>void perform(async()=>{
  const text=ledgerCsv(list,{accountName:id=>id?finAccountName(id):'',categoryLabel:finCatLabel,mask:finMask});
  const name='life-brick-ledger-'+finMonth+(finFilter.accountId||finFilter.category?'-filtered':'')+'.csv';
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status(name+' 저장 요청 · '+finCount(list.length)+'건');
 }),'secondary nowrap');
 b.dataset.navOnly='1';if(blocked||!list.length)b.disabled=true;
 return add(bar,b,hint(blocked?'PC 앱은 보안 설정으로 파일 내려받기를 막아 둡니다. 휴대폰·브라우저에서 내려받으세요.':'이 기기 다운로드 폴더에 암호화되지 않은 파일로 저장됩니다. 보관·공유에 주의하세요.'));
}
// prefill = Fold 결제 알림 초안({date,amount,merchant,onSaved,onKept}) 또는 B64C 빠른 입력 칩({kind,category,subcategory,accountId,toAccountId,merchant,memo,onKept}): 입력칸만 채우고 아무것도 쓰지 않는다. onSaved는 저장이 확정된 뒤에만, onKept(저장한 자료)는 저장이 받아들여진 뒤(임시 저장 포함) 불린다.
function editFinTxn(t,prefill=null){
 const fin=whole.fin,d=t?.data||{date:prefill?.date??whole.localDate,kind:prefill?.kind??'EXPENSE',amount:prefill?.amount??'',accountId:prefill?.accountId??fin.accounts.find(a=>a.data.active)?.id??'',toAccountId:prefill?.toAccountId??null,category:prefill?.category??'FOOD',subcategory:prefill?.subcategory??'',merchant:prefill?.merchant??'',memo:prefill?.memo??'',tags:[],installments:0,original:null,sourceRefs:[],assetId:null,voided:false};
 modal(t?'거래 수정':'거래 입력',root=>{
  const grid=el('div',null,'field-grid');add(root,grid);
  const date=field(grid,'날짜','date',d.date);date.max=whole.localDate;date.required=true;
  const kind=field(grid,'종류','select',d.kind,Object.entries(FIN_KIND_TEXT));
  const amount=field(grid,'금액 (원, 정수)','text',d.amount);amount.inputMode='numeric';amount.required=true;if(prefill?.kind)amount.autofocus=true;
  const instBox=finInstallBox(grid,d.installments,()=>amount.value),inst=instBox.input;amount.addEventListener('input',instBox.sync);   // FIX74
  const accounts=fin.accounts.filter(a=>a.data.active||a.id===d.accountId||a.id===d.toAccountId).map(a=>[a.id,a.data.name+' · '+FIN_ACCOUNT_TEXT[a.data.type]+(a.data.active?'':' (비활성)')]);
  const account=field(grid,'계정','select',d.accountId,accounts),to=field(grid,'받는 계정 (이체만)','select',d.toAccountId??'',[['','받는 계정 선택'],...accounts]);
  const category=field(grid,'분류','select','',[]);
  const merchant=field(grid,'가맹점 (선택)','text',d.merchant);merchant.maxLength=120;
  // FIX44 (AUD1 #7): 평소 안 쓰는 칸은 접는다. 값이 하나라도 있으면(수정·미리 채움) 펼친 채로 연다.
  const more=add(el('details',null,'fin-more'),el('summary','더 적기 · 세부 분류, 태그, 외화, 메모')),moreGrid=el('div',null,'field-grid');add(more,moreGrid);add(root,more);
  more.open=Boolean(d.subcategory||d.tags.length||d.installments||d.original||d.memo);
  const sub=field(moreGrid,'세부 분류 (선택)','text',d.subcategory);sub.maxLength=40;
  const tags=field(moreGrid,'태그 (쉼표로 구분, 선택)','text',d.tags.join(', '));
  const currency=field(moreGrid,'외화 통화 (예: USD, 선택)','text',d.original?.currency??'');currency.maxLength=3;
  const original=field(moreGrid,'외화 원금 (예: 22.00, 선택)','text',d.original?.amount??'');original.inputMode='decimal';
  const memo=field(more,'메모 (선택)','textarea',d.memo);memo.maxLength=1000;
  if(d.sourceRefs.length)add(root,el('p','이 거래는 가져온 줄 '+d.sourceRefs.length+'개를 대신합니다. 계정·종류·금액을 바꾸면 가져온 줄과 맞지 않아 저장이 거절됩니다.','form-note'));
  add(root,hint('이체(카드대금 납부 포함)와 선불 충전은 소비가 아니라서 분류가 없습니다. 카드 계정은 수입을 받을 수 없습니다.'));
  const billSync=cardBillLine(root,()=>({kind:kind.value,merchant:merchant.value,memo:memo.value}));   // FIX67 (M-09)
  for(const n of [merchant,memo])n.addEventListener('input',billSync);kind.addEventListener('change',billSync);
  const ask=t?null:sameExpenseAsk(root);   // FIX67 (M-01): 새 거래만(고치기는 묻지 않음)
  let wanted=d.category;
  const keepInst=Boolean(t&&d.installments),instSync=()=>instBox.show(kind.value==='EXPENSE'&&(keepInst||fin.accounts.find(a=>a.id===account.value)?.data.type==='CARD'));
  account.addEventListener('change',instSync);
  const sync=()=>{
   const k=kind.value,table=k==='INCOME'?fin.labels.income:k==='TRANSFER'||k==='PREPAID_LOAD'?null:fin.labels.expense,cur=wanted??category.value;wanted=null;
   const opts=table?Object.entries(table):[['','분류 없음 (소비 아님)']];
   category.replaceChildren(...opts.map(([v,l])=>{const o=el('option',l);o.value=v;return o;}));
   category.value=table&&Object.hasOwn(table,cur)?cur:opts[0][0];category.disabled=!table;
   to.parentElement.hidden=k!=='TRANSFER';instSync();
  };
  kind.addEventListener('change',sync);sync();
  return async()=>{
   instSync();
   const data=buildTxn({date:date.value,kind:kind.value,amount:amount.value,accountId:account.value,toAccountId:to.value,category:category.value,subcategory:sub.value,merchant:merchant.value,memo:memo.value,tags:tags.value,installments:kind.value==='EXPENSE'?inst.value:'',currency:currency.value,originalAmount:original.value},{labels:fin.labels,accounts:fin.accounts,localDate:whole.localDate,old:t?.data??null});
   if(ask?.(data))return {ask:true};
   const r=await entity('FIN_TXN',t?.id??entityId(),data,t?.heads??[],t?'가계부 거래 수정':'가계부 거래 입력');
   if(prefill?.onSaved&&r?.status!=='LOCAL_DRAFT'){try{prefill.onSaved();}catch{/* 처리됨 표시 실패는 저장을 되돌리지 않는다 */}}
   if(prefill?.onKept){try{prefill.onKept(data);}catch{/* 같은 이유 */}}
   return r;
  };
 },t?'수정 저장':'거래 저장');
}
// FIX74: 할부 고르기 상자(거래 입력·빠른 지출 공용). 금액 바로 아래, 카드 계정 + 지출일 때만 보인다. input.value = buildTxn에 넘길 개월 글자. show(false)는 감추고 일시불(0)로 되돌린다.
// 거래 입력에서 이미 할부 값이 있는 거래를 고칠 때(keepInst)는 계정 종류와 관계없이 보여 준다(감춰서 0으로 덮지 않는다).
// 2개월 이상이면 한 달 약 금액 한 줄(표시만, 저장은 지금처럼 원거래 1건). 검사·오류 문구는 buildTxn 그대로(직접 입력 61 → INVALID_FIN_INSTALLMENTS).
function finInstallBox(parent,months,amountOf){
 const box=el('div',null,'field-grid wide fin-inst');add(parent,box);
 const presets=[0,2,3,4,5,6,7,8,9,10,11,12,18,24],start=Number(months)||0;
 const pick=field(box,'할부','select',presets.includes(start)?String(start):'CUSTOM',[...presets.map(n=>[String(n),n?n+'개월':'일시불']),['CUSTOM','직접 입력']]);
 const input=field(box,'할부 개월 직접 입력 (0~60)','text',String(start));input.inputMode='numeric';
 const line=el('p',null,'muted small wide fin-inst-line');add(box,line);
 const sync=()=>{
  if(pick.value!=='CUSTOM')input.value=pick.value;
  input.parentElement.hidden=pick.value!=='CUSTOM';
  const k=/^\d{1,2}$/.test(String(input.value).trim())?Number(input.value):0,won=String(amountOf()??'').replace(/[\s,]/g,'').replace(/원$/,'');
  line.hidden=box.hidden||k<2||k>60;
  line.textContent=line.hidden?'':/^[1-9]\d{0,13}$/.test(won)?'총 '+formatWon(won)+' · 한 달 약 '+formatWon((BigInt(won)+BigInt(k)/2n)/BigInt(k))+' × '+k+'개월(원거래 1건으로 저장)':'금액을 넣으면 한 달 약 금액을 보여 줍니다 · '+k+'개월(원거래 1건으로 저장)';
 };
 pick.addEventListener('change',sync);input.addEventListener('input',sync);sync();
 return {input,sync,show(on){if(!on)pick.value='0';box.hidden=!on;sync();}};
}
function voidFinTxn(t){
 modal('거래 무효화',root=>{
  add(root,el('p',t.data.date+' · '+(t.data.merchant||FIN_KIND_TEXT[t.data.kind])+' · '+FIN_KIND_TEXT[t.data.kind]+' '+formatWon(t.data.amount)),el('p','무효화하면 합계와 그래프에서 빠집니다. 원래 내용과 사유는 이력에 보존되고 되돌릴 수 없습니다(필요하면 새로 입력).','form-note'));
  const reason=field(root,'무효화 사유','text','');reason.maxLength=300;reason.required=true;
  const ok=field(root,'이 거래를 무효화함을 확인합니다','checkbox',false);
  return ()=>{if(!reason.value.trim())throw finError('FIN_VOID_REASON_REQUIRED');if(!ok.checked)throw finError('DELETE_CONFIRMATION_REQUIRED');return entity('FIN_TXN',t.id,{...structuredClone(t.data),voided:true},t.heads,reason.value,true);};
 },'무효화');
}

// ---------- F2 계정 ----------
function renderFinAccounts(root,fin){
 add(root,add(el('div',null,'section-toolbar'),hint('계정 종류는 만든 뒤 바꿀 수 없습니다. 비활성 계정은 새 거래 입력 목록에서 빠지고, 과거 자료는 그대로 집계됩니다.'),button('계정 추가',()=>editFinAccount(null),'primary')));
 const p=section('계정 '+fin.accounts.length+'개'),used=new Map();for(const l of fin.lines){used.set(l.accountId,(used.get(l.accountId)??0)+1);if(l.toAccountId)used.set(l.toAccountId,(used.get(l.toAccountId)??0)+1);}
 for(const a of [...fin.accounts].sort((x,y)=>Number(y.data.active)-Number(x.data.active)||x.data.name.localeCompare(y.data.name))){
  add(p,row(a.data.name+(a.data.active?'':' · 비활성'),[FIN_ACCOUNT_TEXT[a.data.type],a.data.issuer,'줄 '+finCount(used.get(a.id)??0)+'개',a.data.note].filter(Boolean).join(' · '),add(el('div',null,'buttons'),button('수정',()=>editFinAccount(a)),button(a.data.active?'비활성화':'다시 사용',()=>toggleFinAccount(a),a.data.active?'danger':'secondary'))));
 }
 if(!fin.accounts.length)add(p,empty('계정이 없습니다. 카드·현금·은행 계좌처럼 돈이 드나드는 곳을 먼저 추가하세요.'));add(root,p);
}
function editFinAccount(a){
 modal(a?'계정 수정':'계정 추가',root=>{
  const grid=el('div',null,'field-grid');add(root,grid);
  const name=field(grid,'계정 이름','text',a?.data.name??'');name.maxLength=60;name.required=true;
  const type=field(grid,'계정 종류','select',a?.data.type??'CARD',Object.entries(FIN_ACCOUNT_TEXT));if(a)type.disabled=true;
  const issuer=field(grid,'발급사·은행 (선택)','text',a?.data.issuer??'');issuer.maxLength=40;
  const note=field(root,'메모 (선택)','textarea',a?.data.note??'');note.maxLength=500;
  if(a)add(root,hint('계정 종류('+FIN_ACCOUNT_TEXT[a.data.type]+')는 바꿀 수 없습니다. 종류가 다르면 새 계정을 만드세요.'));
  return ()=>entity('FIN_ACCOUNT',a?.id??entityId(),buildAccount({name:name.value,type:type.value,issuer:issuer.value,note:note.value},a?.data??null),a?.heads??[],a?'가계부 계정 수정':'가계부 계정 추가');
 },a?'수정 저장':'계정 추가');
}
function toggleFinAccount(a){
 if(a.data.active&&!globalThis.confirm('"'+a.data.name+'" 계정을 비활성화할까요? 새 거래 입력 목록에서 빠지고, 과거 자료는 그대로 남습니다.'))return;
 void perform(async()=>{await entity('FIN_ACCOUNT',a.id,{...a.data,active:!a.data.active},a.heads,a.data.active?'가계부 계정 비활성화':'가계부 계정 다시 사용');await refresh();status(savedMessage()+' · '+(a.data.active?'계정을 비활성화했습니다.':'계정을 다시 사용합니다.'));});
}

// ---------- F2 분류 규칙 ----------
const FIN_COST_TEXT={FIXED:'고정비',VARIABLE:'변동비'},FIN_REC_TEXT={INCLUDE:'반복결제로 포함',EXCLUDE:'반복결제에서 제외'};
function finRuleSummary(d){
 const parts=[];
 if(d.category!==null)parts.push('분류 '+finCatLabel(d.category)+(d.subcategory?' · '+d.subcategory:''));
 if(d.costType)parts.push(FIN_COST_TEXT[d.costType]);
 if(d.recurring)parts.push(FIN_REC_TEXT[d.recurring]);
 return '"'+d.merchantContains+'" 포함 → '+parts.join(' · ');
}
function finPreviewText(p){
 return '저장하면 분류가 바뀌는 가져온 줄 '+finCount(p.changed)+'개 · 고정/변동이 바뀌는 소비 줄 '+finCount(p.costChanged)+'개 · 반복결제 지정이 바뀌는 줄 '+finCount(p.recurringChanged)+'개';
}
function renderFinRules(root,fin){
 add(root,add(el('div',null,'section-toolbar'),hint('규칙 효과는 세 가지이고 각각 따로 적용됩니다: 분류 바꾸기(가져온 줄만, 선불 제외), 고정비/변동비 지정, 반복결제 포함/제외(소비 줄 전부). 우선순위 숫자가 작은 규칙부터 맞춰 봅니다. 규칙은 지울 수 없고 끌 수 있습니다.'),button('규칙 추가',()=>editFinRule(null),'primary')));
 const p=section('규칙 '+fin.rules.length+'개'),hits=new Map(),bump=id=>hits.set(id,(hits.get(id)??0)+1);
 for(const l of fin.lines){if(l.ruleId)bump(l.ruleId);if(l.costRuleId&&l.costRuleId!==l.ruleId)bump(l.costRuleId);if(l.recurringRuleId&&l.recurringRuleId!==l.ruleId&&l.recurringRuleId!==l.costRuleId)bump(l.recurringRuleId);}
 for(const r of [...fin.rules].sort((a,b)=>a.data.priority-b.data.priority||a.id.localeCompare(b.id))){
  const d=r.data;
  add(p,row(finRuleSummary({costType:null,recurring:null,...d})+(d.active?'':' · 꺼짐'),'우선순위 '+d.priority+' · '+(d.accountId?finAccountName(d.accountId)+' 계정만':'모든 계정')+' · 지금 이 규칙이 정하는 줄 '+finCount(hits.get(r.id)??0)+'개',add(el('div',null,'buttons'),button('수정',()=>editFinRule(r)),button(d.active?'끄기':'켜기',()=>toggleFinRule(r)))));
 }
 if(!fin.rules.length)add(p,empty('규칙이 없습니다. 예: 가맹점에 "구글플레이"가 들어가면 게임으로 · "통신"은 고정비로.'));add(root,p);
}
function editFinRule(r,preset=null){
 const fin=whole.fin,id=r?.id??entityId(),d={merchantContains:'',accountId:null,category:'OTHER',subcategory:'',priority:100,active:true,costType:null,recurring:null,...(r?.data??{}),...(preset??{})};
 modal(r?'규칙 수정':'규칙 추가',root=>{
  const grid=el('div',null,'field-grid');add(root,grid);
  const text=field(grid,'가맹점에 포함될 글자','text',d.merchantContains);text.maxLength=60;text.required=true;
  const account=field(grid,'적용 계정','select',d.accountId??'',[['','모든 계정'],...fin.accounts.map(a=>[a.id,a.data.name])]);
  const category=field(grid,'바꿀 분류 (가져온 줄)','select',d.category??'',[['','바꾸지 않음'],...Object.entries(fin.labels.expense)]);
  const sub=field(grid,'세부 분류 (비우면 원래 세부 분류 유지)','text',d.subcategory);sub.maxLength=40;
  const cost=field(grid,'고정비/변동비 지정','select',d.costType??'',[['','지정 안 함'],['FIXED','고정비'],['VARIABLE','변동비']]);
  const rec=field(grid,'반복결제','select',d.recurring??'',[['','자동 탐지 그대로'],['INCLUDE','반복결제로 포함'],['EXCLUDE','반복결제에서 제외']]);
  const priority=field(grid,'우선순위 (0~999, 작을수록 먼저)','text',String(d.priority));priority.inputMode='numeric';
  const active=field(grid,'이 규칙 켜기','checkbox',d.active);
  const preview=el('div',null,'fin-preview');preview.setAttribute('role','status');add(root,preview);
  const read=()=>({merchantContains:text.value,accountId:account.value||null,category:category.value,subcategory:category.value?sub.value:'',costType:cost.value,recurring:rec.value,priority:priority.value,active:active.checked});
  const update=()=>{
   sub.disabled=!category.value;
   try{const p=rulePreview(fin.lines,fin.rules,{id,...buildRule(read(),{labels:fin.labels,accounts:fin.accounts})});
    preview.replaceChildren(el('strong',finPreviewText(p)),el('p','이 규칙이 하나 이상을 정하는 줄: '+finCount(p.matched)+'개','small'),...p.samples.map(x=>el('p',x.line.date+' · '+shownMerchant(x.line,finMask)+' · '+finCatLabel(x.from.category)+' → '+finCatLabel(x.to.category)+(x.from.costType!==x.to.costType?' · '+(FIN_COST_TEXT[x.from.costType]??'자동')+' → '+(FIN_COST_TEXT[x.to.costType]??'자동'):'')+(x.from.recurring!==x.to.recurring?' · 반복 '+(FIN_REC_TEXT[x.from.recurring]??'자동')+' → '+(FIN_REC_TEXT[x.to.recurring]??'자동'):''),'small muted')));}
   catch(e){preview.replaceChildren(el('p',finErrorText(e.code)||'입력을 확인하세요.','small'));}
  };
  for(const n of [text,account,category,sub,cost,rec,priority,active]){n.addEventListener('input',update);n.addEventListener('change',update);}update();
  return ()=>entity('FIN_RULE',id,buildRule(read(),{labels:fin.labels,accounts:fin.accounts}),r?.heads??[],r?'가계부 규칙 수정':'가계부 규칙 추가');
 },r?'수정 저장':'규칙 추가');
}
function toggleFinRule(r){
 const fin=whole.fin,next={...r.data,active:!r.data.active},p=rulePreview(fin.lines,fin.rules,{id:r.id,costType:null,recurring:null,...next});
 if(!globalThis.confirm('규칙을 '+(next.active?'켜면':'끄면')+' '+finPreviewText(p).replace('저장하면 ','')+' 바뀝니다. 계속할까요?'))return;
 void perform(async()=>{await entity('FIN_RULE',r.id,next,r.heads,next.active?'가계부 규칙 켜기':'가계부 규칙 끄기');await refresh();status(savedMessage()+' · 규칙을 '+(next.active?'켰습니다.':'껐습니다.'));});
}
// 반복결제 항목에서 바로 지정: target={pattern(묶음 공통 글자), display(화면 표시 이름), ruleId(있으면 그 규칙)}.
// 규칙 ID가 없으면 같은 글자의 "모든 계정" 규칙을 찾아 그 효과만 바꾸고, 없으면 새 규칙을 만든다. 효과를 모두 지우면 규칙은 끈다.
function setFinMerchantEffect(target,effect,value){
 const fin=whole.fin,r=target.ruleId?fin.rules.find(x=>x.id===target.ruleId):fin.rules.find(x=>x.data.merchantContains===target.pattern&&x.data.accountId===null);
 if(target.ruleId&&!r){status('지정한 규칙을 찾지 못했습니다 · 규칙 화면에서 확인하세요.',true);return;}
 const base=r?{costType:null,recurring:null,...r.data}:{merchantContains:target.pattern,accountId:null,category:null,subcategory:'',priority:50,active:true,costType:null,recurring:null};
 const next={...base,[effect]:value},empty=next.category===null&&next.costType===null&&next.recurring===null;
 if(empty&&!r)return;
 const data=empty?{...next,active:false,[effect]:base[effect]}:{...next,active:true},id=r?.id??entityId();   // 미리보기와 저장에 같은 ID(우선순위 동점 순서가 같게)
 const p=rulePreview(fin.lines,fin.rules,{id,...data});
 const what=empty?'규칙을 끕니다':effect==='costType'?FIN_COST_TEXT[value]+'로 지정합니다':value?FIN_REC_TEXT[value]+'합니다':'반복결제 지정을 지웁니다';
 if(!globalThis.confirm('"'+target.display+'" '+what+(r?'':' · 새 규칙: 가맹점에 "'+(finMask&&target.display!==target.pattern?'(가려짐)':target.pattern)+'" 포함')+' · '+finPreviewText(p).replace('저장하면 ','')+'. 계속할까요?'))return;
 void perform(async()=>{await entity('FIN_RULE',id,data,r?.heads??[],'가계부 반복결제·고정비 지정');await refresh();status(savedMessage()+' · "'+target.display+'" 지정을 저장했습니다.');});
}

// ---------- F5 반복결제 · 고정비/변동비 ----------
const FIN_REC_STATUS={ACTIVE:'계속 결제 중',LATE:'이번 결제가 늦음',CANCEL_CANDIDATE:'해지 후보',NO_DATA:'최근 자료 없음',IRREGULAR:'주기 불규칙(직접 포함)'};
function renderFinPlan(root,fin){
 const prep=prepare(fin),rec=withRuleDates(detectRecurring(prep,whole.localDate),fin.recurring?.data.rules??[],prep.lines,whole.localDate),items=rec.items;   // FIX40: 규칙이 있는 항목의 다음 예상일 = 정기 결제 예정일
 const monthly=items.filter(i=>i.period&&['ACTIVE','LATE','NO_DATA'].includes(i.status)).reduce((s,i)=>s+roundDiv(i.latest,BigInt(PLAN_PERIODS[i.period].months)),0n);
 add(root,add(el('div',null,'fin-chips'),
  add(el('span',null,'fin-chip'),el('span','반복결제'),el('strong',finCount(items.length)+'개')),
  add(el('span',null,'fin-chip'),el('span','월 환산 합계(해지 후보 제외)'),el('strong',formatWon(monthly))),
  add(el('span',null,'fin-chip'),el('span','해지 후보'),el('strong',finCount(items.filter(i=>i.status==='CANCEL_CANDIDATE').length)+'개')),
  add(el('span',null,'fin-chip'),el('span','제외 지정'),el('strong',finCount(rec.excluded.length)+'개'))));
 const now=whole.localDate.slice(0,7),months=monthSpan(shiftMonth(now,-11),shiftMonth(now,1)),present=new Set(dataMonths(prep,{from:months[0],to:now}));   // 다음 달 한 칸: 다음 예상일 표시용
 const name=i=>shownMerchant({merchant:i.merchant,category:i.category,subcategory:'',tags:[]},finMask);
 finChart(root,'recurring','반복결제','같은 가맹점·비슷한 금액(±15%)이 매월·분기·매년 반복되는 결제. 점은 결제, 빈 원은 다음 예상일(마지막 칸은 다음 달), 회색 칸은 자료 없는 달. 해지 후보는 예상 결제가 빠진 횟수 기준(월 2번, 분기·연 1번).',(box,w)=>{
  if(!items.length){box.append(empty('반복결제로 보이는 항목이 없습니다.'));return;}
  const small=w<520,G=recurringGridLayout(items,months,present,{width:w,labelW:small?92:150}),s=svgRoot(w,G.height+18,'반복결제 달력');
  for(const c of G.cells)if(!c.hasData&&c.month<=now)s.append(svgTip(svgEl('rect',{x:c.x,y:G.rows[0]?G.rows[0].y-13:0,width:Math.max(0,c.w-1),height:G.rows.length*26},'rec-nodata'),c.month+' · 자료 없음'));
  for(const row of G.rows){
   s.append(svgEl('line',{x1:G.labelW,x2:w-4,y1:row.y,y2:row.y},'grid-line'));
   s.append(svgTip(svgText(2,row.y+4,fitText(name(row.item),G.labelW-8,11),'rec-label'+(row.item.status==='CANCEL_CANDIDATE'?' warn':'')),name(row.item)+' · '+row.item.periodLabel+' · '+FIN_REC_STATUS[row.item.status]));
   for(const d of row.dots)s.append(svgTip(svgEl('circle',{cx:d.x,cy:row.y,r:4},'rec-dot '+finCatClass(row.item.category)),d.date+' · '+formatWon(d.amount)));
   if(row.next&&row.item.status!=='CANCEL_CANDIDATE')s.append(svgTip(svgEl('circle',{cx:row.next.x,cy:row.y,r:5},'rec-next'),'다음 예상일 '+row.next.date));   // 해지 후보는 다음 예상일을 그리지 않는다
  }
  for(const l of G.labels)if(l.show)s.append(svgText(l.x,G.height+12,l.text,'axis-label','middle'));
  box.append(s,finLegend([['rec-dot-swatch','결제'],['rec-next-swatch','다음 예상일'],['no-data','자료 없는 달']]));
 },()=>finTable(['가맹점','주기','상태','최근 금액','다음 예상일','연간 환산','횟수'],items.map(i=>[name(i),i.periodLabel,FIN_REC_STATUS[i.status]+(i.missed?' · 빠짐 '+i.missed+'번':''),formatWon(i.latest),i.nextDate??'-',i.annual===null?'-':formatWon(i.annual),finCount(i.count)]),[3,5,6]));
 const list=section('반복결제 항목 '+items.length+'개','버튼으로 고정비·변동비를 정하거나 반복결제에서 뺄 수 있습니다(같은 가맹점 글자의 규칙으로 저장, 규칙 화면에서 수정·끄기).');
 for(const i of items){
  const tag=el('span',FIN_REC_STATUS[i.status],'tag '+(i.status==='CANCEL_CANDIDATE'?'unknown':i.status==='ACTIVE'?'src-txn':'dup'));
  const detail=[i.periodLabel,'최근 '+formatWon(i.latest)+(i.amountStable?'':' (금액 변동 큼)'),i.nextDate?'다음 '+i.nextDate:null,i.missed?'예상 결제 '+i.missed+'번 없음':null,i.unknownAfterData?'자료 없는 예상일 '+i.unknownAfterData+'번':null,i.annual!==null?'연간 '+formatWon(i.annual):null,i.costType?'수동: '+FIN_COST_TEXT[i.costType]:null].filter(Boolean).join(' · ');
  const target={pattern:i.pattern,display:name(i)};
  const n=row(name(i),detail,add(el('div',null,'buttons'),button('고정비로',()=>setFinMerchantEffect(target,'costType','FIXED')),button('변동비로',()=>setFinMerchantEffect(target,'costType','VARIABLE')),button('반복 아님',()=>setFinMerchantEffect(target,'recurring','EXCLUDE'),'danger')));
  n.querySelector('.row-main strong').after(tag);add(list,n);
 }
 if(!items.length)add(list,empty('반복결제가 없습니다.'));
 for(const x of rec.excluded){const display=shownMerchant({merchant:x.merchant,category:null,subcategory:'',tags:[]},finMask);add(list,row(display+' · 반복결제에서 제외됨','결제 '+x.count+'번',add(el('div',null,'buttons'),button('제외 해제',()=>setFinMerchantEffect({pattern:x.pattern,display,ruleId:x.ruleId},'recurring',null)))));}
 add(root,list);
 const range=periodRange(finPeriod,whole.localDate,finCustom),split=costSplit(prep,range,rec,whole.localDate),bar=el('div',null,'fin-toolbar');
 finSelect(bar,'고정비·변동비 기간',finPeriod,PERIODS,v=>void perform(async()=>{finPeriod=v;if(v==='CUSTOM'&&!finCustom.from)finCustom={from:shiftMonth(now,-5),to:now};await render();}));
 add(root,bar);
 const t=split.total;
 const share=(f,v)=>f<0n||v<0n||f+v<=0n?'-':(Number(roundDiv(f*1000n,f+v))/10).toFixed(1)+'%';   // 환불이 더 큰 쪽이 있으면 비중을 보이지 않음
 add(root,add(el('div',null,'metric-grid fin-metrics'),metric('고정비',formatWon(t.fixed),share(t.fixed,t.variable)==='-'?'-':'소비의 '+share(t.fixed,t.variable)),metric('변동비',formatWon(t.variable),range.label),metric('실제 금액 모름',finCount(t.unknownRows)+'행','고정·변동 어디에도 넣지 않음'),metric('정한 근거','수동 '+t.reasons.MANUAL+' · 반복 '+t.reasons.RECURRING,'분류(통신) '+t.reasons.CATEGORY+' · 기본(변동) '+t.reasons.DEFAULT)));
 const series={rows:split.months.map(m=>({month:m.month,hasData:m.hasData,unknownOnly:!!m.unknownOnly,total:m.fixed===null?null:m.fixed+m.variable,parts:m.fixed===null?[]:[{cat:'FIXED',value:m.fixed},{cat:'VARIABLE',value:m.variable}],ma:null})),cats:['FIXED','VARIABLE']};
 finChart(root,'costsplit','고정비 vs 변동비','정하는 순서: 규칙의 수동 지정 → 반복결제로 탐지된 가맹점 → 분류 기본값(통신만 고정) → 그 밖은 변동. 이체·선불은 넣지 않고 환불은 같은 칸에서 뺍니다.',(box,w)=>{
  if(!series.rows.length){box.append(empty('이 기간에 자료가 없습니다.'));return;}
  const h=narrow()?220:260,L=barLayout(series,{width:w,height:h,padL:narrow()?46:58}),s=svgRoot(w,h,'고정비와 변동비 월별 막대');
  for(const tk of L.ticks){s.append(svgEl('line',{x1:L.padL,x2:w-10,y1:tk.y,y2:tk.y},'grid-line'));s.append(svgText(L.padL-6,tk.y+4,formatCompact(tk.value),'axis-label','end'));}
  for(const g of L.gaps)s.append(svgTip(svgEl('rect',{x:g.x,y:g.y,width:g.w,height:g.h},'no-data'),g.month+' · '+(g.unknownOnly?'실제 금액 모름만 있음':'자료 없음')));
  for(const r of L.rects)s.append(svgTip(svgEl('rect',{x:r.x,y:r.y,width:r.w,height:r.h},'bar '+(r.cat==='FIXED'?'c-fixed':'c-variable')),r.month+' · '+FIN_COST_TEXT[r.cat]+' '+formatWon(r.value)));
  for(const l of L.labels)s.append(svgText(l.x,h-8,l.text,'axis-label','middle'));
  box.append(s,finLegend([['c-fixed','고정비'],['c-variable','변동비'],['no-data','자료 없음']]));
 },()=>finTable(['달','고정비','변동비','고정 비중','실제 금액 모름'],split.months.map(m=>!m.hasData?[m.month,'자료 없음','자료 없음','-','-']:m.unknownOnly?[m.month,'모름','모름','-',m.unknownRows+'행']:[m.month,formatWon(m.fixed),formatWon(m.variable),share(m.fixed,m.variable),m.unknownRows+'행']),[1,2,3]));
}

// ---------- B60 분석 ----------
function renderFinAnalysis(root,fin){
 if(!finAnalysisMod){add(root,hint('분석 화면을 불러오는 중입니다.'));return;}
 const gone=()=>view!=='LEDGER'||finTab!=='ANALYSIS'||$('workspace').hidden;
 finAnalysisMod.renderSpendAnalysis(root,{h:{el,add,button},surface:mdSurface,request:aiReports,gone,catLabel:finCatLabel,analysis:finAnalysisMod.spendAnalysis(prepare(fin),whole.localDate,fin.recurring?.data.rules??[])});
}

// ---------- B48 정기 결제 ----------
// 소유자가 확정한 정기 결제 규칙(FIN_RECURRING 한 장)과 자동 후보. 후보는 저장하지 않는 투영이다.
// "정기로 등록" 1탭 = 규칙 목록 한 장을 다시 쓰는 연산 1, "아님" = 이 기기 로컬 숨김(연산 0). 가게 이름은 이 화면에만 보이고 내보내기(LIFE_STATE)에는 넣지 않는다.
const recurringRules=()=>whole.fin?.recurring?.data.rules??[];
// B48C F10: "아님" 목록은 평문 저장소에 두지 않는다(fin-recurring.mjs createHiddenBox). 옛 평문은 앱을 열 때 옮기고 지운다. 저장소 인자는 쓰지 않는다(옮길 때만 상자가 읽는다).
const recurringStorage=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const recurringOnScreen=()=>view==='LEDGER'&&finTab==='RECURRING'&&!$('workspace').hidden;
const recurringHiddenBox=createRecurringHiddenBox({storage:recurringStorage(),onFail:()=>{if(recurringOnScreen())void render();}});
const loadRecurringHidden=()=>recurringHiddenBox.current(),hideRecurringCandidate=(_,key)=>recurringHiddenBox.hide(key);
void recurringHiddenBox.load().then(done=>{if(done&&recurringOnScreen())void render();});
// FIX45 (AUD1 #11): 후보를 기다리지 않고 직접 등록한다. 저장 모양은 "정기로 등록"과 같은 규칙 1줄이다(addRule, 저장 1번). 규칙 형식에는 매달 주기와 이름·가게·금액만 있어 다음 날짜·계정 칸은 받지 않는다.
function addRecurringManual(fin){
 modal(RECURRING_TEXT.addManual,root=>{
  const name=field(root,'이름','text','');name.required=true;name.maxLength=60;
  const amount=field(root,'금액 (원)','text','');amount.inputMode='numeric';amount.required=true;
  // FIX48 (HUNT42 H1-가): 가게 이름은 필수다(이름으로 대신 채우지 않는다). 거래 내역의 가맹점 목록에서 고르거나 직접 입력한다. 가린 가맹점은 목록에 넣지 않는다.
  const merchant=field(root,RECURRING_TEXT.merchantLabel,'text','');merchant.maxLength=120;merchant.required=true;
  const choices=el('datalist');choices.id='recurring-merchant-choices';merchant.setAttribute('list',choices.id);
  for(const m of recurringMerchantChoices(prepare(fin).lines,{skip:l=>finMask&&isSensitive(l)})){const o=el('option');o.value=m;choices.append(o);}
  add(root,choices,hint(RECURRING_TEXT.addNote));
  return ()=>entity('FIN_RECURRING',RECURRING_ID,addRecurringRule(fin.recurring?.data??null,{name:name.value,merchant:merchant.value,amount:amount.value},{id:entityId(),now:new Date().toISOString()}),fin.recurring?.heads??[],'정기 결제 직접 추가');
 },'저장');
}
function renderFinRecurring(root,fin){
 const prep=prepare(fin),rules=fin.recurring?.data.rules??[],today=whole.localDate,hiddenHere=loadRecurringHidden(globalThis.localStorage);
 const shown=rules.filter(r=>!r.hidden),folded=rules.filter(r=>r.hidden),stat=new Map(rules.map(r=>[r.id,recurringStatus(r,prep.lines,today,rules)]));
 const paid=shown.filter(r=>stat.get(r.id).state==='PAID').length,check=shown.filter(r=>stat.get(r.id).state==='CHECK').length;
 add(root,add(el('div',null,'metric-grid fin-metrics'),
  metric(RECURRING_TEXT.total,formatWon(recurringMonthly(rules)),'정기 결제 '+finCount(shown.length)+'개 · 매달 기준'),
  metric('이번 달 결제 확인',finCount(paid)+' / '+finCount(shown.length),'아직·금액 다름 '+finCount(shown.length-paid-check)+'개'+(check?' · 확인 필요 '+finCount(check)+'개':''))));
 const save=(next,reason,message)=>void perform(async()=>{await entity('FIN_RECURRING',RECURRING_ID,next(),fin.recurring?.heads??[],reason);await refresh();status(savedMessage()+' · '+message);});
 const list=section('정기 결제 '+shown.length+'개','매달 나가는 돈을 한눈에 봅니다. 이번 달 결제 확인은 같은 가게에서 예정일 ±3일 안에 규칙 금액 근처(허용 오차 안)로 낸 지출이 있는지 봅니다. 처음 2회는 예정일이 아직 굳지 않아 규칙 금액과 같으면 결제로 봅니다. 그 뒤로 예정일 밖에 규칙 금액과 같은 지출만 있으면 "확인 필요"로 보입니다. 거래 내역의 가게 이름은 이 화면에만 보이고 내보내기에는 넣지 않습니다.');
 const ruleRow=r=>{
  const s=stat.get(r.id),cls=s.state==='PAID'?'src-txn':s.state==='DIFFERENT'?'unknown':'dup',moved=r.hidden||s.state!=='DIFFERENT'?null:recurringPriceChange(r,prep.lines,today,rules);
  const stuck=moved&&!canSetRecurringAmount(rules,r.id,moved.amount);   // R33B (HUNT32 D3): 형제 규칙과 금액대가 겹쳐 저장할 수 없으면 버튼 대신 이유
  const n=row(r.name,formatWon(r.match.amount)+' · 매달 · 허용 ±'+r.match.tolerancePct+'% · 마지막 결제일 '+(s.lastDate??'없음')+(s.state==='DIFFERENT'?' · 이번 달 낸 금액 '+formatWon(s.otherAmount):'')+(moved?' · '+(stuck?RECURRING_TEXT.overlapAmount:RECURRING_TEXT.priceChanged):''),
   add(el('div',null,'buttons'),moved&&!stuck?button(RECURRING_TEXT.priceApply,()=>save(()=>setRecurringAmount(fin.recurring.data,r.id,moved.amount),'정기 결제 금액 변경','"'+r.name+'" 금액을 '+formatWon(moved.amount)+'으로 바꿨습니다.'),'primary'):null,button(r.hidden?'다시 보이기':'목록에서 숨기기',()=>save(()=>setRecurringHidden(fin.recurring.data,r.id,!r.hidden),r.hidden?'정기 결제 다시 보임':'정기 결제 숨김','"'+r.name+'" '+(r.hidden?'다시 보입니다.':'숨겼습니다.')))));
  if(!r.hidden)n.querySelector('.row-main strong').after(el('span',RECURRING_TEXT[s.pastDue?'CHECK_PAST':s.state],'tag '+cls));   // FIX41 (H40-D3)
  return n;
 };
 for(const r of shown)add(list,ruleRow(r));
 if(!shown.length)add(list,empty(RECURRING_TEXT.empty));
 add(list,add(el('div',null,'buttons'),button(RECURRING_TEXT.addManual,()=>addRecurringManual(fin),'primary recurring-add')));
 add(root,list);
 const cands=findCandidates(prep.lines,today,{rules,hidden:hiddenHere}),pick=section(RECURRING_TEXT.candidates+' '+cands.length+'개','같은 가게·비슷한 금액(±10%)이 서로 다른 달에 3번 이상 나오고, 그 가게 결제의 60% 이상이 그 금액대인 지출입니다(최근 12개월). "정기로 등록"은 저장 1번, "아님"은 이 기기에서만 숨깁니다.');
 if(recurringHiddenBox.failed())add(pick,hint(RECURRING_TEXT.hideFailed));
 for(const c of cands){
  const sens=prep.lines.some(l=>recurringKey(l.merchant)===c.merchantKey&&isSensitive(l)),name=sens?'가려진 가맹점':String(c.merchant).trim().slice(0,60),display=sens&&finMask?'가려진 가맹점':name;
  add(pick,row(display,'월 약 '+formatWon(c.amount)+' · 최근 12개월 중 '+c.months+'달에 '+c.count+'번 · 마지막 '+c.lastDate+(c.overlap?' · '+RECURRING_TEXT.overlapCandidate:'')+(c.sameAs?' · '+RECURRING_TEXT.sameAs(c.sameAs.name):''),
   add(el('div',null,'buttons'),
    c.overlap?null:button('정기로 등록',()=>save(()=>addRecurringRule(fin.recurring?.data??null,{name,merchant:c.merchant,amount:c.amount},{id:entityId(),now:new Date().toISOString()}),'정기 결제 등록','"'+display+'"을(를) 정기 결제로 등록했습니다.'),'primary'),
    button('아님',()=>void perform(async()=>{hideRecurringCandidate(globalThis.localStorage,c.key);await recurringHiddenBox.settled();const kept=loadRecurringHidden(globalThis.localStorage).has(c.key);await render();if(kept)status('이 기기에서 "'+display+'" 후보를 숨겼습니다.');else status('이 기기에 숨김을 저장하지 못했습니다 · 저장 공간을 확인한 뒤 다시 눌러 주세요.',true);}),'secondary'))));
 }
 if(!cands.length)add(pick,empty(RECURRING_TEXT.noCandidates));
 add(root,pick);
 if(folded.length){const old=section('숨긴 정기 결제 '+folded.length+'개');for(const r of folded)add(old,ruleRow(r));add(root,old);}
 // V6F (지시서 8): 소탭 "정기 결제"와 "반복 · 고정비"를 하나로. 내가 정한 정기 결제(위) 아래에 거래에서 찾은 반복결제·고정비/변동비(예전 "반복 · 고정비" 화면 그대로)를 이어 그린다.
 if(typeof renderFinPlan==='function'){add(root,el('h2','반복 · 고정비 (거래에서 찾은 것)','panel-title fin-merged-title'));renderFinPlan(root,fin);}
}

// ---------- F59V 고정비 예정 ----------
// 정기 결제 규칙에서 이번 달을 투영한다(기록을 만들지 않는다). 아직 안 나간 규칙 = "예정 · 잠정 N원"(예정일과 함께). 금액 수정 = 규칙 금액 갱신(연산 1, B48C F7과 같은 setRuleAmount).
// 실제 결제가 들어오면 예정이 사라지고 실제 금액으로 계산한다. 잠정 ≠ 실제면 "잠정 N → 실제 M" 한 줄과 "다음 달 잠정도 M으로" 1탭.
// 숫자는 월말 예측(fixedPlan)과 같은 fixedSchedule()에서 나온다. pendingOnly = 거래 탭처럼 예정만 보일 때.
const FIXED_STATE_TEXT={PLANNED:'예정',OVERDUE:'예정일 지남',PAID:'확정',DIFFERENT:'확정 · 금액 다름',PREPAID:'지난달에 미리 냄',UNCONFIRMED:'확인 필요'};
function saveRuleAmount(fin,id,amount,message){
 void perform(async()=>{await entity('FIN_RECURRING',RECURRING_ID,setRecurringAmount(fin.recurring.data,id,amount),fin.recurring?.heads??[],'정기 결제 금액 변경');await refresh();status(savedMessage()+' · '+message);});
}
function editProvisional(fin,it){
 modal('잠정 금액 수정 · '+it.name,root=>{
  add(root,hint('정기 결제 규칙 금액을 고칩니다(저장 1번). 다음 달부터도 이 금액이 잠정 금액입니다. 실제 결제가 들어오면 실제 금액으로 계산합니다.'));
  const amount=field(root,'잠정 금액 (원)','text',it.provisional.toString());amount.inputMode='numeric';amount.required=true;
  return ()=>entity('FIN_RECURRING',RECURRING_ID,setRecurringAmount(fin.recurring.data,it.id,amount.value),fin.recurring?.heads??[],'정기 결제 잠정 금액 수정');
 },'잠정 금액 저장');
}
function renderFixedSchedule(root,fin,{pendingOnly=false}={}){
 const prep=prepare(fin),today=whole.localDate,all=fixedSchedule(fin.recurring?.data.rules??[],prep.lines,today,daysInMonth(today.slice(0,7)));
 const pending=all.filter(it=>it.state==='PLANNED'||it.state==='OVERDUE').sort((a,b)=>(a.due??'9').localeCompare(b.due??'9')),done=all.filter(it=>it.state==='PAID'||it.state==='DIFFERENT'),prepaid=all.filter(it=>it.state==='PREPAID'),check=all.filter(it=>it.state==='CHECK'),unconfirmed=all.filter(it=>it.state==='UNCONFIRMED');
 if(!all.length||(pendingOnly&&!pending.length))return null;
 const due=pending.reduce((s,it)=>s+it.provisional,0n),paid=done.reduce((s,it)=>s+it.actual,0n),held=check.reduce((s,it)=>s+it.actual,0n);
 // R42 (HUNT41 N1): 앞달 몫인 늦은 결제(it.late)도 머리글과 그 항목 줄에 보여 머리글 합계가 월말 예측의 "정기 결제"와 맞는다. 예정만 보는 칸은 나간 돈을 보이지 않으므로 그대로다.
 const lateAll=pendingOnly?0n:all.reduce((s,it)=>s+(it.late??0n),0n),lateNote=it=>!pendingOnly&&it.late?' · 앞달 몫 늦게 낸 '+formatWon(it.late):'';
 const p=section('이번 달 고정비 · '+today.slice(0,7),'예정 '+finCount(pending.length)+'건 '+formatWon(due)+(pendingOnly?'':' · 확정 '+finCount(done.length)+'건 '+formatWon(paid)+(check.length?' · 확인 필요 '+finCount(check.length)+'건 '+formatWon(held):''))+(lateAll?' · 앞달 몫 늦게 낸 '+formatWon(lateAll)+' · 합계 '+formatWon(due+paid+held+lateAll):'')+' · 정기 결제 규칙에서 보여 주는 값이고 거래 기록이 아닙니다. 실제 결제가 들어오면 예정이 사라지고 실제 금액으로 계산합니다(두 번 세지 않음).');
 p.classList.add('fin-fixed-plan');
 for(const it of pending){
  const n=row(it.name,FIXED_STATE_TEXT[it.state]+' · 잠정 '+formatWon(it.provisional)+' · '+(it.due??'예정일 모름')+lateNote(it),add(el('div',null,'buttons'),button('금액 수정',()=>editProvisional(fin,it),'secondary')));
  n.querySelector('.row-main strong').after(el('span',FIXED_STATE_TEXT[it.state],'tag '+(it.state==='OVERDUE'?'unknown':'dup')));
  add(p,n);
 }
 if(!pendingOnly)for(const it of done){
  const n=row(it.name,(it.changed?'잠정 '+formatWon(it.changed.from)+' → 실제 '+formatWon(it.changed.to):'실제 '+formatWon(it.actual))+' · '+it.paidDate+(it.blocked?' · '+RECURRING_TEXT.overlapAmount:'')+lateNote(it),
   it.suggest&&!it.blocked?add(el('div',null,'buttons'),button('다음 달 잠정도 '+formatWon(it.suggest)+'으로',()=>saveRuleAmount(fin,it.id,it.suggest,'"'+it.name+'" 잠정 금액을 '+formatWon(it.suggest)+'으로 바꿨습니다.'),'primary')):null);
  n.querySelector('.row-main strong').after(el('span',FIXED_STATE_TEXT[it.state],'tag '+(it.state==='PAID'?'src-txn':'unknown')));
  add(p,n);
 }
 if(!pendingOnly)for(const it of check){const n=row(it.name,'실제 '+formatWon(it.actual)+' · '+it.paidDate+' · 예정일 '+it.due+' 밖이라 고정비로 한 번만 셉니다'+lateNote(it));n.querySelector('.row-main strong').after(el('span',RECURRING_TEXT[it.pastDue?'CHECK_PAST':'CHECK'],'tag unknown'));add(p,n);}   // FIX39B, FIX41 (H40-D3)
 if(!pendingOnly)for(const it of unconfirmed){const n=row(it.name,'잠정 '+formatWon(it.provisional)+' · 결제일을 모른 채 한 달이 넘어 월말 예측에서 뺐습니다 · 가게 이름이 결제 내역과 맞는지 확인하세요');n.querySelector('.row-main strong').after(el('span',FIXED_STATE_TEXT.UNCONFIRMED,'tag unknown'));add(p,n);}   // FIX48 (HUNT42 H1-다)
 if(!pendingOnly)for(const it of prepaid){const n=row(it.name,it.paidDate+' 결제 · 지난달 지출에 들어 있어 이번 달에는 더하지 않음');n.querySelector('.row-main strong').after(el('span',FIXED_STATE_TEXT.PREPAID,'tag src-txn'));add(p,n);}   // FIX36 (H36-M6)
 add(root,p);
 return p;
}

// ---------- F11 이번 달 금고 ----------
// 설계: docs/FIN01_F11_DESIGN.md. 새 엔티티·새 스키마 없음 — 결과는 기존 FIN_BUDGET.total에만 저장한다.
// 계산기 입력값(현금·비상금·개월·고정비 선택)은 저장하지 않는다(저장 1번 = 서버 연산 1개).
let vaultFlash=null;                       // 저장 직후 피드백 {won,fromSpent,core,at,shown}. core = 저장 직전 feelCore(메모리만)
const VAULT_FLASH_MS=60000;
const finDetailsOpen=new Set();
function vaultState(fin){
 const prep=prepare(fin),month=whole.localDate.slice(0,7);
 const s=budgetStatus(prep,fin.budgets,month,whole.localDate),f=vaultForecast(prep,s);
 return {prep,month,s,f,core:feelCore(f),v:vaultBricks(s)};
}
// 금괴 더미 SVG: createElementNS + styles.css 클래스만 쓴다(인라인 style·이미지 없음).
function vaultBrickSvg(v,w,flash){
 const L=vaultBrickLayout(v,{width:w}),s=svgRoot(w,Math.max(10,L.height),'이번 달 금괴 '+v.days+'개 · 쓴 칸 '+(v.spentCount===null?'모름':v.spentCount)+'개');
 const phaseText={PAST:'지난 날',TODAY:'오늘',FUTURE:'남은 날'};
 for(const b of L.bricks){
  const cls=['vault-brick','ph-'+b.phase.toLowerCase(),b.spent?'spent':'',flash&&b.day>flash.from&&b.day<=flash.to?'flash':''].filter(Boolean).join(' ');
  // 쓴 몫은 색만 바꾸지 않고 칸을 낮춰 "깎인" 모양으로 그린다(바닥을 맞춘다).
  const h=b.spent?Math.max(2,+(b.h*0.42).toFixed(1)):b.h,y=b.spent?+(b.y+b.h-h).toFixed(1):b.y;
  s.append(svgTip(svgEl('rect',{x:b.x,y,width:b.w,height:h,rx:1.5},cls),b.day+'일 · '+phaseText[b.phase]+' · '+(v.spentCount===null?'쓴 몫 모름':b.spent?'쓴 몫':'남은 몫')));
 }
 for(const o of L.overflow){
  s.append(svgTip(svgEl('rect',{x:o.x,y:o.y,width:o.w,height:o.h,rx:1.5},'vault-brick over'),'월 예산 초과 '+o.index+'칸'));
  s.append(svgEl('line',{x1:(o.x+o.w*0.34).toFixed(1),y1:o.y,x2:(o.x+o.w*0.58).toFixed(1),y2:(o.y+o.h).toFixed(1)},'vault-crack'));
 }
 return s;
}
function vaultChip(label,value,foot){
 return add(el('span',null,'fin-chip'),el('span',label),el('strong',value),foot?el('span',foot):null);
}
// 저장 직후 한 줄: 금고 −X원 · 이번 달 남은 Y원 · 내일부터 하루 Z원(M1B: 칩·진단 카드와 같은 기준, 고정비 예정 뺌).
function vaultFeedbackLine(s,v,core){
 if(!vaultFlash||Date.now()-vaultFlash.at>VAULT_FLASH_MS)return null;
 const T=s.total,known=v.state==='OK',day=feelSavedPart(known&&T?core:null,vaultFlash.won);
 const tone=!known||T===null?'':T.remaining<0n?' over':day.fast?' fast':'';
 const parts=['금고 −'+formatWon(vaultFlash.won)];
 parts.push(known&&T?(T.remaining<0n?'이번 달 초과 '+formatWon(-T.remaining):'이번 달 남은 '+formatWon(T.remaining)):'이번 달 남은 금액 모름');
 parts.push(day.text);
 const n=el('p',parts.join(' · '),'vault-feedback'+tone);n.setAttribute('role','status');return n;
}
// 가계부 "한눈에" 맨 위와 홈(compact)에서 같이 쓴다. 집계는 기존 budgetStatus() 값만 읽는다.
// F11E1: "지금 내 돈(추정)" — 재정 스냅샷 순현금(유동 현금 − 마통 쓴 금액 − 아직 안 나간 카드값)에
// 스냅샷 뒤 소비·수입을 그대로 반영한다. budgetStatus()·금고 예산과는 별개 값이라 금고 카드에 한 줄만 보탠다.
const LIVE_CASH_REASON={CURRENCY:'재정 기록 통화가 원화 아님',CASH_UNKNOWN:'유동 현금을 모름',DEBTS_UNKNOWN:'부채를 모름',UPCOMING_UNKNOWN:'예정 납부를 모름',UNKNOWN_LINES:'재정 기록 뒤 실제 금액 모름 거래가 있음'};
function liveNetCashLine(prep){
 const live=liveNetCash(prep,whole.finances,whole.localDate);
 if(live.status==='NO_SNAPSHOT')return hint('지금 내 돈(추정) · 재정 기록이 없습니다.');
 if(live.status==='MISSING')return hint('지금 내 돈 · 모름 · '+live.reasons.map(r=>LIVE_CASH_REASON[r]??r).join(' · '));
 return add(el('div',null,'vault-live'),el('p','지금 내 돈(추정) '+formatWon(live.value)+' · 기준일 '+live.since+' 당일 기록부터 반영','small muted vault-live-cash'),
  el('p',LIVE_CASH_NOTE,'small muted vault-live-note'));   // FIX67 (M-07): 계산은 그대로, 한 줄만
}
const LIVE_CASH_NOTE='이체(적금·대출 상환)는 반영하지 않아요 · 재정 기록을 새로 만들면 맞춰져요';
const vaultForecast=(prep,s)=>monthForecast({status:s,lines:prep.lines,rules:recurringRules(),today:whole.localDate});   // B59: 정기 결제는 예정일 기준으로 따로 더한다
// F59V: 아직 안 나간 고정비(예정·잠정)를 금고 카드에 한 줄로. 숫자는 월말 예측과 같은 fixedPlan(). 실제 결제가 들어오면 예정에서 빠지고 쓴 돈에 들어간다(이중 계산 0).
function vaultFixedLine(prep,s){
 if(!s.current)return null;
 const fx=fixedPlan(recurringRules(),prep.lines,whole.localDate,s.days),n=fx.upcomingCount+fx.overdueCount,due=fx.upcoming+fx.overdue,T=s.total;
 if(!n)return null;
 const after=T&&s.dataState==='KNOWN'?T.remaining-due:null;
 return el('p','아직 안 나간 고정비 '+finCount(n)+'건 '+formatWon(due)+' (예정 · 잠정)'+(after===null?'':after<0n?' · 내고 나면 '+formatWon(-after)+' 초과':' · 내고 나면 남는 돈 '+formatWon(after)),'small vault-fixed-due');
}
// M1A: 돈 진단(계산·문구는 fin-feel.mjs, 저장 0). 돈 탭 맨 위 카드와 탑 탭 돈 시트 한 줄이 같은 값을 쓴다.
function feelOf(fin){const {s,prep,f}=vaultState(fin);return moneyFeel({prep,status:s,forecast:f,rules:recurringRules()});}
// M1B: 카드 안 월말 예측선과 저장 직후 값 변화. 그리기 효과·새 값 등장·스크롤은 세션 첫 표시와 저장 뒤 첫 그리기에만 한다(다시 그릴 때마다 움직이지 않게). 홈(compact)에는 이 카드가 없다.
let feelLineSeen=false;
function feelCard(root,fin){
 const {s,prep,f}=vaultState(fin),x=moneyFeel({prep,status:s,forecast:f,rules:recurringRules()}),flash=vaultFlash&&Date.now()-vaultFlash.at<=VAULT_FLASH_MS?vaultFlash:null,fresh=Boolean(flash&&!flash.shown);
 const n=feelNode({el,add,button},x,{onCalc:()=>openVaultCalculator(fin),change:feelChange(flash?.core,x),fresh});
 if(!n)return;
 add(n,feelLineNode({el,add,svgEl,svgRoot},feelLineLayout(prep,f,x),{draw:fresh||!feelLineSeen}));
 add(root,n);
 feelLineSeen=true;
 if(fresh){flash.shown=true;requestAnimationFrame(()=>n.scrollIntoView({block:'nearest'}));}
}
// M1C: 비서 결과 줄과 보낼 상태 단추. 둘 다 화면 이동뿐이다(본문 읽기는 분석 화면, 보내기는 설정의 기존 미리보기 → 확인). 읽기는 aiReports 목록만.
function feelAssistRow(root){
 const seq=mdSignedOutSeq,nav=(text,fn,cls)=>{const b=button(text,fn,cls);b.dataset.navOnly='1';return b;};
 feelAssist(root.querySelector('.feel-card'),{h:{el,add,button:nav},surface:mdSurface,request:aiReports,gone:()=>seq!==mdSignedOutSeq||view!=='LEDGER'||finTab!=='CHARTS'||$('workspace').hidden,
  openResult:()=>void perform(async()=>{finTab='ANALYSIS';await render();}),
  openExport:()=>void perform(async()=>{view='SETTINGS';await render();document.querySelector('.state-export')?.scrollIntoView({block:'start'});$('page-title').focus({preventScroll:true});})});
}
function vaultCard(root,fin,{compact=false}={}){
 if(!compact){const st=vaultState(fin),n=vaultCardNode({el,add,button,svgEl,svgRoot},{...st,rules:recurringRules(),narrow:globalThis.matchMedia?.('(max-width: 420px)').matches===true,live:liveNetCashLine(st.prep),fixed:vaultFixedLine(st.prep,st.s),feedback:vaultFeedbackLine(st.s,st.v,st.core),onQuick:()=>openQuickExpense(fin),onCalc:()=>openVaultCalculator(fin)});add(root,n);return n;}   // DS3: 돈 탭 금고는 3층 카드(fin-feel vaultCardNode). 홈(compact)은 아래 그대로
 const {s,v,prep,f,core}=vaultState(fin),T=s.total,fc=compact?null:forecastNode({el,add},f),fcBox=feelDetails({el,add},fc);
 const p=el('section',null,'panel vault-card'+(compact?' vault-compact':''));
 const head=add(el('div',null,'vault-head'),el('h2','이번 달 금고','panel-title'),el('span',s.month,'eyebrow'));
 add(p,head);add(root,p);
 add(p,liveNetCashLine(prep),hint('카드 대금 이체는 계산에 영향 없음 · 마통 이자는 금융비용 지출, 파킹 이자는 이자·배당 수입으로 기록'),
  hint('재정 기록은 그날 지출을 기록하기 전에 만드세요 · 먼저 기록한 같은 날 지출은 한 번 더 빠질 수 있음'));
 if(v.state==='NO_BUDGET'){
  add(p,fcBox,vaultFixedLine(prep,s),hint('한 달 쓸 돈을 정하면 금괴 더미로 보여 줍니다. 금괴 한 개 = 월 예산 ÷ 그 달 날수 = 하루 몫.'),
   add(el('div',null,'button-row'),button('금고 계산기로 한 달 쓸 돈 정하기',()=>openVaultCalculator(fin),'primary')));
  return p;
 }
 const known=v.state==='OK';
 p.dataset.tone=!known?'none':feelTone(moneyFeel({prep,status:s,forecast:f,rules:recurringRules()}),T);   // FIX37C (H37-M2): 진단 카드와 같은 기준(고정비 예정 뺌)
 const big=!known?(v.state==='NO_DATA'?'자료 없음':'모름'):formatWon(T.remaining<0n?-T.remaining:T.remaining);
 add(p,add(el('div',null,'vault-big'),
  el('span',known&&T.remaining<0n?'이번 달 초과':'이번 달 남은 돈','vault-big-label'),
  el('strong',big,'vault-amount'),
  el('span',known?'예산 '+formatWon(T.budget)+' · 쓴 돈 '+formatWon(T.actual)
   :v.state==='NO_DATA'?'이 달 소비 자료가 없습니다(0원 아님). 예산 '+formatWon(T.budget)
   :'실제 금액 모름 줄만 있어 쓴 돈을 알 수 없습니다. 예산 '+formatWon(T.budget),'vault-sub')),vaultFixedLine(prep,s),fcBox);
 const num=vaultTodayNum({f,s,v,todaySpent:vaultWall(prep,s,v).today?.spent??null});   // FIX67 (M-04·M-08): 돈 탭 금고와 같은 함수
 const chips=add(el('div',null,'fin-chips vault-chips'),
  vaultChip(num.label+(num.tag?' ('+num.tag+')':''),num.value,num.foot),
  vaultChip('오늘까지 기대치 대비',known&&s.current?(T.paceDelta>0n?formatWon(T.paceDelta)+' 더 씀':T.paceDelta<0n?formatWon(-T.paceDelta)+' 덜 씀':'같음'):'-',
   known&&s.current?'기대치 '+formatWon(T.expectedToDate):'이번 달만 비교'));
 if(!compact)add(chips,vaultChip('금괴 한 개',v.perBrick===null?'-':formatWon(v.perBrick),s.days+'일 × 한 개 = 하루 몫'));
 add(p,chips);
 if(!compact)add(p,meltNode({el,add,svgEl,svgRoot},s,{justSpent:vaultFlash&&Date.now()-vaultFlash.at<=VAULT_FLASH_MS?vaultFlash.won:null,due:core?.due??null}));
 const box=el('div',null,'chart-box vault-bricks');add(p,box);
 const flash=vaultFlash&&Date.now()-vaultFlash.at<=VAULT_FLASH_MS&&vaultFlash.fromSpent!==null&&v.spentCount!==null
  ?{from:vaultFlash.fromSpent,to:v.spentCount}:null;
 box.append(vaultBrickSvg(v,Math.max(180,Math.floor(box.clientWidth||300)),flash));
 add(p,finLegend([['vault-sw-left','남은 날'],['vault-sw-today','오늘'],['vault-sw-past','지난 날'],['vault-sw-spent','쓴 몫'],...(v.overCount?[['vault-sw-over','예산 초과']]:[])]));
 add(p,vaultFeedbackLine(s,v,core));
 const quick=button('빠른 지출',()=>openQuickExpense(fin),'primary');
 const row=add(el('div',null,'button-row'),quick);
 if(compact){const go=button('돈 열기',()=>navigate('LEDGER'),'secondary nav-link');go.dataset.navOnly='1';add(row,go);}
 else add(row,button('금고 계산기',()=>openVaultCalculator(fin),'secondary'));
 add(p,row);
 if(!known)add(p,hint(v.state==='NO_DATA'?'소비 줄이 없는 달은 0원이 아니라 자료 없음입니다.':'실제 금액 모름 줄 '+finCount(s.unknownRows)+'행은 합계에 넣지 않습니다.'));
 return p;
}

// ---- 금고 계산기 ----
// 월 사용 가능액 = (현금 − 비상금 − 기간 고정비 합 + 기간 안 확정 수입) ÷ 개월 수. BigInt, 보수적 내림.
// F59V: 저장하는 예산 = 생활비(위 금액) + 고정비 한 달 몫 = 고정비 포함 전체(fin-plan vaultBudget).
const VAULT_MODES=[['MONTHS','개월 수로 정하기'],['NEXT_INCOME','다음 수입 날짜까지']];
// F59V: 정기 결제 규칙(잠정 금액)을 먼저, 반복결제 탐지 항목은 규칙이 없는 가게만(fin-plan vaultFixedItems).
const vaultFixedCandidates=(prep,fin)=>vaultFixedItems(detectRecurring(prep,whole.localDate),fin.recurring?.data.rules??[]);
function openVaultCalculator(fin){
 const prep=prepare(fin),month=whole.localDate.slice(0,7);
 const own=fin.budgets.find(b=>b.data.effectiveFrom===month)??null,applied=budgetFor(fin.budgets,month);
 const items=vaultFixedCandidates(prep,fin);
 modal('금고 계산기 · '+month,root=>{
  add(root,hint('한 달 쓸 돈을 계산합니다. 입력값은 저장하지 않고, 결과(생활비 + 고정비)만 '+month+' 예산(전체)으로 저장합니다.'));
  const grid=el('div',null,'field-grid');add(root,grid);
  const cash=field(grid,'지금 쓸 수 있는 현금 (원)','text','');cash.inputMode='numeric';
  const reserve=field(grid,'비상금 · 손대지 않을 금액 (원)','text','0');reserve.inputMode='numeric';
  const snapshot=vaultCashFromSnapshot(whole.finance);
  const load=button(snapshot===null?'재정 기록에서 불러올 수 없음':'재정 기록 유동 현금 불러오기 · '+formatWon(snapshot),()=>{cash.value=snapshot;recalc();},'secondary');
  load.dataset.navOnly='1';if(snapshot===null)load.disabled=true;
  add(root,add(el('div',null,'button-row'),load),
   hint(snapshot===null?'원화 재정 기록이 있어야 불러옵니다. 직접 입력해도 됩니다.':'불러온 뒤 직접 고쳐도 됩니다. 원 아래 금액은 버립니다.'));
  const grid2=el('div',null,'field-grid');add(root,grid2);
  const mode=field(grid2,'기간 정하는 방법','select','MONTHS',VAULT_MODES);
  const months=field(grid2,'기간 (개월)','text','1');months.inputMode='numeric';
  const until=field(grid2,'다음 수입 날짜','date','');until.min=whole.localDate;
  const incomeAmount=field(grid2,'다음 수입 금액 (원, 모르면 비움)','text','');incomeAmount.inputMode='numeric';
  const noIncome=el('label',null,'inline'),noInput=el('input');noInput.type='checkbox';noInput.checked=true;
  add(noIncome,noInput,el('span','다음 수입 없음 (수입을 넣지 않고 계산)'));add(root,noIncome);
  const fixedBox=section('기간 고정비','정기 결제 규칙(잠정 금액)과, 규칙이 없는 가게 중 반복·고정비 탭에서 찾은 항목입니다. 켠 항목은 생활비에서 빼고 이번 달 예산에 고정비로 더합니다.');
  const boxes=[];
  for(const it of items){
   const l=el('label',null,'inline vault-fixed'),cb=el('input');cb.type='checkbox';cb.checked=it.on;
   add(l,cb,el('span',it.label+' · 월 '+formatWon(it.monthly)+(it.status==='CANCEL_CANDIDATE'?' · 해지된 듯':'')));
   add(fixedBox,l);boxes.push([it,cb]);
  }
  if(!items.length)add(fixedBox,empty('정기 결제 규칙과 반복결제로 찾은 항목이 없습니다. 고정비 없이 계산합니다.'));
  add(root,fixedBox);
  // F11C: 마이너스통장 — 체크 안 하면 한도·쓴 금액 모두 0(모름 아님). 숫자 자체는 저장하지 않는다.
  const odBox=section('마이너스통장 (선택)','가진 마이너스통장이 있으면 남은 한도만큼 쓸 돈이 늘어납니다. 한도·쓴 금액은 저장하지 않습니다.');
  const odEnableRow=el('label',null,'inline'),odEnable=el('input');odEnable.type='checkbox';
  add(odEnableRow,odEnable,el('span','마이너스통장 있음'));add(odBox,odEnableRow);
  const odGrid=el('div',null,'field-grid vault-overdraft-fields');add(odBox,odGrid);
  const odLimit=field(odGrid,'총 한도 (원)','text','');odLimit.inputMode='numeric';
  const odDrawn=field(odGrid,'지금 쓴 금액 (원)','text','');odDrawn.inputMode='numeric';
  const odCand=vaultOverdraftFromSnapshot(whole.finances);
  const odLoad=button(odCand?'재정 기록 "'+odCand.label+'" 쓴 금액 불러오기 · '+formatWon(odCand.amount):'재정 기록에서 불러올 수 없음',
   ()=>{odDrawn.value=odCand.amount;recalc();},'secondary');
  odLoad.dataset.navOnly='1';if(!odCand)odLoad.disabled=true;
  const odLoadRow=add(el('div',null,'vault-overdraft-load'),add(el('div',null,'button-row'),odLoad),
   hint(odCand?'불러온 뒤 직접 고쳐도 됩니다.':'부채 항목 중 이름에 "마이너스"가 들어간 항목이 정확히 하나여야 불러옵니다. 직접 입력해도 됩니다.'));
  add(odBox,odLoadRow);
  const odSync=()=>{odGrid.hidden=!odEnable.checked;odLoadRow.hidden=!odEnable.checked;};
  odEnable.addEventListener('change',()=>{odSync();recalc();});odSync();
  add(root,odBox);
  // F11E1: 아직 안 나간 카드값 — 필수 입력(체크박스 없음). 카드 EXPENSE는 거래일에 이미 소비로 잡히므로, 여기서는
  // "앞으로 통장에서 빠져나갈 카드 결제 예정 금액"만 뺀다(결제일 이체 자체는 금고·지금 내 돈을 바꾸지 않는다).
  const cardBox=section('아직 안 나간 카드값','카드 결제 예정 금액 합계. 없으면 0.');
  const cardUnpaid=field(cardBox,'아직 안 나간 카드값 (원)','text','');cardUnpaid.inputMode='numeric';
  const cardCand=vaultCardUnpaidFromSnapshot(whole.finances);
  const cardLoad=button(cardCand!==null?'재정 기록 예정 납부(카드)에서 불러오기 · '+formatWon(cardCand):'재정 기록에서 불러올 수 없음',
   ()=>{cardUnpaid.value=cardCand;recalc();},'secondary');
  cardLoad.dataset.navOnly='1';if(cardCand===null)cardLoad.disabled=true;
  add(cardBox,add(el('div',null,'button-row'),cardLoad),
   hint(cardCand!==null?'불러온 뒤 직접 고쳐도 됩니다.':'원화 재정 기록의 예정 납부 중 이름에 "카드"가 들어간 항목이 모두 앎이어야 불러옵니다. 직접 입력해도 됩니다.'));
  add(root,cardBox);
  const out=el('div',null,'vault-result');add(root,out,hint('금융 조언이 아닌 계산 도구입니다. 값은 입력한 내용으로만 계산합니다.'));
  let plan=null;
  const recalc=()=>{
   const m=mode.value;
   months.parentElement.hidden=m!=='MONTHS';
   // 날짜 칸: 다음 수입 날짜 모드이거나, 개월 수 모드에서 수입을 넣을 때(그 수입의 날짜) 보인다.
   const showUntil=m==='NEXT_INCOME'||!noInput.checked;
   until.parentElement.hidden=!showUntil;until.parentElement.parentElement.hidden=!showUntil;
   incomeAmount.parentElement.hidden=noInput.checked;
   plan=vaultPlan({cash:cash.value,reserve:reserve.value,mode:m,months:months.value,untilDate:until.value,today:whole.localDate,
    fixedItems:boxes.filter(([,cb])=>cb.checked).map(([it])=>({key:it.key,label:it.label,monthly:it.monthly})),
    // B14 (R4-03): 수입을 넣기로 했으면(다음 수입 없음 꺼짐) 날짜·금액이 둘 다 비어도 수입 0이 아니라 모름 → MISSING(날짜만 있고 금액이 빈 경우와 같다).
    incomes:noInput.checked?[]:[{date:until.value,amount:incomeAmount.value}],
    overdraft:{enabled:odEnable.checked,limit:odLimit.value,drawn:odDrawn.value},cardUnpaid:cardUnpaid.value});
   out.replaceChildren();
   out.dataset.status=plan.status;
   if(plan.status==='MISSING'){
    add(out,el('p','아직 계산할 수 없습니다 · 빈칸은 0이 아니라 모름입니다.','fin-bad'),
     add(el('ul',null,'vault-missing'),...plan.missing.map(code=>el('li',VAULT_MISSING[code]??(code.startsWith('FIXED:')?'고정비 항목의 월 금액을 모름':code.startsWith('INCOME:')?'수입 날짜 또는 금액을 모름':code)))));
    $('editor-save').disabled=true;return;
   }
   // 한도 자체가 맞지 않는 경우(쓴 금액 > 한도)는 다른 단계를 계산하지 않고 바로 거절한다 → steps가 비어 있다.
   if(plan.reason==='OVERDRAFT_EXCEEDED'){
    add(out,el('p','마이너스통장 쓴 금액이 한도보다 많습니다 · 초과 '+formatWon(plan.shortfall),'fin-bad'));
    $('editor-save').disabled=true;return;
   }
   const table=el('ul',null,'vault-steps');
   for(const st of plan.steps){
    const extra=st.key==='FIXED'?' '+st.note.count+'개 · 월 '+formatWon(st.note.monthly)+' × '+st.note.months+'개월'
     :st.key==='INCOME'?' '+st.note.count+'건':'';
    add(table,add(el('li'),el('span',st.sign,'vault-sign'),el('span',st.label+extra,'vault-step-label'),el('strong',formatWon(st.value<0n?-st.value:st.value)+(st.value<0n?' (음수)':''),'vault-step-value')));
   }
   add(out,el('p','기간 '+plan.months+'개월 · '+whole.localDate+' ~ '+plan.horizon,'small muted'),table);
   if(plan.status==='NEGATIVE'){
    add(out,el('p','이 조건으로는 쓸 돈이 없습니다 · 부족액 '+formatWon(plan.shortfall),'fin-bad'));
    $('editor-save').disabled=true;return;
   }
   // F59V: 저장값 = 생활비 + 고정비(전체 예산). 쓴 돈·월말 예측이 고정비를 포함하므로 예산도 전체로 맞춘다. 금괴 한 개 = 이 전체 ÷ 날수.
   const budget=vaultBudget(plan);
   add(out,add(el('p',null,'vault-monthly'),el('span','이번 달 예산'),el('strong',formatWon(budget.total))),
    el('p','생활비 '+formatWon(budget.living)+' + 고정비 '+formatWon(budget.fixed)+' = 이번 달 예산 '+formatWon(budget.total),'vault-budget-split'),
    el('p','하루 몫 약 '+formatWon(budget.total/BigInt(daysInMonth(month)))+' · '+month+' '+daysInMonth(month)+'일 기준','small muted'));
   // F11E1: 마통 남은 한도는 계산에 넣지 않았다 — 정보로만 보여준다(빌린 돈은 내 돈이 아니다).
   if(plan.overdraft.enabled)add(out,el('p','급할 때 쓸 수 있는 마통 남은 한도 '+formatWon(plan.overdraft.remaining)+' · 계산에 안 넣음 · 빌리면 이자','small muted vault-overdraft-note'));
   $('editor-save').disabled=false;
  };
  for(const n of [cash,reserve,months,until,incomeAmount,odLimit,odDrawn,cardUnpaid])n.addEventListener('input',recalc);
  // 날짜 칸은 달력 버튼이 change만 보내므로 input과 change 둘 다 듣는다.
  for(const n of [mode,noInput,until,...boxes.map(([,cb])=>cb)])n.addEventListener('change',recalc);
  recalc();
  return ()=>{
   recalc();   // 저장은 지금 화면에 보이는 입력값으로 다시 계산한 결과로만(이벤트를 놓친 옛 plan으로 저장하지 않음)
   if(!plan||plan.status!=='OK')throw finError('FIN_VAULT_NOT_CALCULATED');
   const base=own?.data??applied?.data??null,budget=vaultBudget(plan);
   const data=buildBudget({effectiveFrom:month,total:String(budget.total),categories:Object.fromEntries(Object.entries(base?.categories??{})),note:base?.note??''},{labels:fin.labels});
   vaultFlash=null;   // 예산을 바꾸면 지난 지출의 차감 피드백은 더 이상 맞지 않는다
   return entity('FIN_BUDGET',own?.id??'budget-'+month,data,own?.heads??[],'금고 계산기로 한 달 쓸 돈 저장');
  };
 },'이 금액으로 예산 저장');
}
const VAULT_MISSING={CASH:'지금 쓸 수 있는 현금을 모름',RESERVE:'비상금을 모름',MONTHS:'기간(개월)을 모름',NEXT_INCOME_DATE:'다음 수입 날짜가 오늘보다 뒤가 아님',NEXT_INCOME_DATE_INVALID:'다음 수입 날짜가 달력에 없는 날짜(YYYY-MM-DD)',INCOME_DATE_INVALID:'수입 날짜가 달력에 없는 날짜(YYYY-MM-DD)',OVERDRAFT_LIMIT:'마이너스통장 총 한도를 모름',OVERDRAFT_DRAWN:'마이너스통장 지금 쓴 금액을 모름',CARD_UNPAID:'아직 안 나간 카드값을 모름'};
const daysInMonth=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).getUTCDate();

// ---- 빠른 지출 입력 ----
// FIX67 (M-01): 저장 직전 같은 결제 확인(fin-recurring sameExpense, 최신 장부). 처음 누르면 경고 한 줄과 [취소]를 보이고 저장 단추를 "그래도 저장"으로 바꾼다({ask:true} → 창 유지).
// 같은 입력으로 한 번 더 누르면 저장한다. 입력을 바꾸면 다시 확인한다. 막지 않고 저장 형식도 그대로다.
function sameExpenseAsk(root){
 const box=el('div',null,'fin-dup-ask');box.setAttribute('role','alert');box.hidden=true;add(root,box);
 const label=$('editor-save').textContent;let asked=null;
 return input=>{
  const hit=sameExpense(whole.fin?prepare(whole.fin).lines:[],input),sig=JSON.stringify([input.date,input.amount,input.accountId,input.merchant]);
  if(!hit){box.hidden=true;asked=null;$('editor-save').textContent=label;return false;}
  if(asked===sig)return false;
  asked=sig;box.replaceChildren(el('p',SAME_EXPENSE_TEXT.ask(hit,shownMerchant(hit,finMask))+' · '+SAME_EXPENSE_TEXT.force+' / '+SAME_EXPENSE_TEXT.cancel,'fin-warn'));   // 취소 = 창 아래 기존 [취소]
  box.hidden=false;$('editor-save').textContent=SAME_EXPENSE_TEXT.force;box.scrollIntoView?.({block:'center'});return true;   // 창이 길어도 경고 줄이 보이게
 };
}
// FIX67 (M-09): 카드대금 문형 + 지출이면 힌트 한 줄(막지 않음). read() = {kind,merchant,memo}.
function cardBillLine(root,read){
 const p=el('p',null,'small fin-warn fin-card-bill');p.hidden=true;add(root,p);
 const sync=()=>{const t=cardBillHint(read());p.textContent=t??'';p.hidden=!t;};sync();
 return sync;
}
// 저장은 기존 buildTxn() + entity('FIN_TXN', …) 경로 그대로. 저장 1번 = 연산 1개.
function openQuickExpense(fin){
 // 빠른 지출의 '오늘'은 캐시된 whole.localDate가 아니라 열 때·저장할 때의 실제 KST 날짜다(앱을 켜 둔 채 자정을 넘겨도 어제로 저장하지 않는다).
 const kstToday=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10),openedDay=kstToday();
 const prep=prepare(fin),q=quickPicks(prep,openedDay);
 const usable=fin.accounts.filter(a=>a.data.active);
 modal('빠른 지출 · '+openedDay,root=>{
  if(!usable.length){add(root,empty('활성 계정이 없습니다. "계정"에서 먼저 계정을 추가하세요.'));return ()=>{throw finError('INVALID_FIN_ACCOUNT_REF');};}
  let amount='',category=q.lastCategory&&Object.hasOwn(fin.labels.expense,q.lastCategory)?q.lastCategory:'FOOD',merchant='';
  const display=el('div',null,'keypad-amount');display.setAttribute('role','status');display.setAttribute('aria-live','polite');
  let instBox=null;   // FIX74: 아래 계정 칸 뒤에 만든다(금액이 바뀌면 한 달 약 금액 줄도 다시 쓴다)
  const show=()=>{display.textContent=amount===''?'0원':formatWon(amount);display.dataset.empty=String(amount==='');instBox?.sync();};
  add(root,display);
  const pad=el('div',null,'keypad'),limitNote=el('p',null,'small fin-bad');limitNote.setAttribute('role','status');limitNote.hidden=true;
  const press=k=>()=>{
   limitNote.hidden=true;
   if(k==='C')amount='';
   else if(k==='←')amount=amount.slice(0,-1);
   else{const next=(amount+k).replace(/^0+(?=\d)/,'');if(next.length<=14)amount=next;else{limitNote.textContent='금액은 14자리까지 입력할 수 있습니다. 더 입력한 숫자는 반영하지 않았습니다.';limitNote.hidden=false;}}   // 일반 거래 입력(parseWonInput)과 같은 14자리
   show();
  };
  for(const k of ['1','2','3','4','5','6','7','8','9','00','0','←']){const b=button(k,press(k),'secondary keypad-key');b.dataset.navOnly='1';b.setAttribute('aria-label',k==='←'?'한 자리 지우기':k+' 입력');add(pad,b);}
  const clear=button('지우기',press('C'),'secondary keypad-clear');clear.dataset.navOnly='1';
  add(root,pad,limitNote,add(el('div',null,'button-row'),clear));show();
  const catBox=el('div',null,'quick-row');catBox.setAttribute('role','toolbar');catBox.setAttribute('aria-label','분류');
  const catButtons=[];
  const picks=q.categories.map(c=>c.category).filter(c=>Object.hasOwn(fin.labels.expense,c));
  for(const c of [...new Set([...picks,category])].slice(0,6)){
   const b=button(fin.labels.expense[c],()=>{category=c;paint();},'secondary quick-pick');b.dataset.navOnly='1';b.dataset.category=c;catButtons.push(b);add(catBox,b);
  }
  const catBlock=add(el('div',null,'quick-block'),el('h3','최근 30일 많이 쓴 분류','subheading'),catBox);
  add(root,catBlock);
  const other=field(catBlock,'분류 (위에 없으면 여기서)','select',category,Object.entries(fin.labels.expense));
  const paint=()=>{for(const b of catButtons){const on=b.dataset.category===category;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}other.value=category;};
  other.addEventListener('change',()=>{category=other.value;paint();});
  const mBlock=add(el('div',null,'quick-block'),el('h3','가맹점 (선택)','subheading'));add(root,mBlock);
  const merchantInput=field(mBlock,'가맹점 이름','text','');merchantInput.maxLength=120;
  const billSync=cardBillLine(mBlock,()=>({kind:'EXPENSE',merchant:merchantInput.value}));merchantInput.addEventListener('input',billSync);
  const pickable=q.merchants.filter(m=>!(finMask&&isSensitive(m)));   // 가린 가맹점은 후보로 내놓지 않는다
  if(pickable.length){
   const mb=el('div',null,'quick-row');
   for(const m of pickable)
    {const b=button(shownMerchant(m,finMask),()=>{merchantInput.value=m.merchant;merchant=m.merchant;billSync();},'secondary quick-pick');b.dataset.navOnly='1';add(mb,b);}
   add(mBlock,el('p','최근 가맹점','small muted'),mb);
  }
  const accounts=usable.map(a=>[a.id,a.data.name+' · '+FIN_ACCOUNT_TEXT[a.data.type]]);
  const fallback=q.lastAccountId&&usable.some(a=>a.id===q.lastAccountId)?q.lastAccountId:usable[0].id;
  const account=field(root,'계정','select',fallback,accounts);
  // FIX74: 고른 계정이 카드일 때만 할부 고르기 상자(기본 일시불). 활성 카드 계정이 하나도 없으면 상자를 만들지 않는다.
  const isCard=()=>usable.find(a=>a.id===account.value)?.data.type==='CARD';
  if(usable.some(a=>a.data.type==='CARD'))instBox=finInstallBox(root,0,()=>amount);
  const instSync=()=>instBox?.show(isCard());account.addEventListener('change',instSync);instSync();
  add(root,hint('날짜는 오늘('+openedDay+'), 종류는 지출로 저장합니다. 외화·메모가 필요하면 "거래" 화면의 거래 입력을 쓰세요.'));
  const ask=sameExpenseAsk(root);
  paint();
  return async()=>{
   const day=kstToday();whole.localDate=day;   // 캐시된 '오늘'을 저장 순간의 실제 날짜로 맞춘 뒤 쓴다(저장 뒤 refresh()가 서버 값으로 다시 채운다)
   instSync();
   const data=buildTxn({date:whole.localDate,kind:'EXPENSE',amount,accountId:account.value,toAccountId:'',category,subcategory:'',
    merchant:merchantInput.value,memo:'',tags:'',installments:isCard()?instBox.input.value:'',currency:'',originalAmount:''},
    {labels:fin.labels,accounts:fin.accounts,localDate:whole.localDate,old:null});
   if(ask(data))return {ask:true};   // FIX67 (M-01)
   const before=vaultState(fin);
   const r=await entity('FIN_TXN',entityId(),data,[],'가계부 빠른 지출 입력');
   vaultFlash={won:BigInt(data.amount),fromSpent:before.v.spentCount,core:before.core??null,at:Date.now()};
   return day===openedDay?r:{...r,notice:'자정을 넘겨 날짜를 '+day+'(오늘)로 저장했습니다.'};
  };
 },'저장');
}

// ---- 이번 달 해석(규칙 기반) ----
function renderMonthInsight(root,prep,s){
 const ins=monthInsight(prep,s,detectRecurring(prep,whole.localDate));
 // F11B: 이번 달은 "같은 날짜까지" 누적끼리 비교한다(월 합계끼리 비교하면 매달 같은 날 나가는 고정비가 달 초에 급증으로 보인다).
 const toDate=ins.comparison==='TO_DATE',upto=toDate?' 같은 날짜까지':'';
 const p=section('이번 달 해석 · '+ins.month,'최근 3개월'+upto+' 비교한 값만 보여 줍니다. 무엇을 해야 하는지는 정하지 않습니다.');
 if(!ins.known){add(p,empty(s.dataState==='NO_DATA'?'이 달 소비 자료가 없습니다(0원 아님).':'실제 금액 모름 줄만 있어 이번 달 소비를 알 수 없습니다.'));add(root,p);return;}
 if(ins.risingCategories.length){
  add(p,el('h3','최근 '+ins.comparedMonths.length+'개월'+upto+' 평균보다 큰 분류','subheading'));
  if(toDate)add(p,hint('이번 달 1일~'+ins.comparedThroughDay+'일 소비를, 지난 각 달 1일~같은 일자(그 달 날수보다 크면 말일까지) 소비의 평균과 견줍니다.'));
  for(const c of ins.risingCategories)
   add(p,row(finCatLabel(c.category),'최근 평균 '+formatWon(c.average)+' → '+(toDate?'이번 달 '+ins.comparedThroughDay+'일까지 ':'이 달 ')+formatWon(c.pace)+' (+'+formatWon(c.delta)+' · +'+(Number(c.permille)/10).toFixed(1)+'%)'));
 }else add(p,hint(ins.comparedMonths.length?'최근 '+ins.comparedMonths.length+'개월'+upto+' 평균보다 큰 분류가 없습니다.':'비교할 수 있는 지난달 자료가 없습니다.'));
 const bits=[];
 if(ins.fixedPermille!==null)bits.push(['고정비 비중',(Number(ins.fixedPermille)/10).toFixed(1)+'%','고정 '+formatWon(ins.fixed)+' · 변동 '+formatWon(ins.variable)]);
 if(ins.perDay!==null)bits.push(['하루 평균',formatWon(ins.perDay),s.elapsed+'일 동안 쓴 돈 ÷ '+s.elapsed+'일']);
 const projected=vaultForecast(prep,s).projected??ins.projected;   // B59: 금고 카드의 예측과 같은 값(정기 결제를 일평균으로 늘리지 않는다)
 if(projected!==null)bits.push(['이대로면 월말',formatWon(projected-(vaultForecast(prep,s).refundOver??0n)),ins.budget!==null?'예산 '+formatWon(ins.budget):'예산 없음']);
 if(bits.length){const g=el('div',null,'fin-chips');for(const [l,v,f] of bits)add(g,vaultChip(l,v,f));add(p,g);}
 add(root,p);
}

// 접히는 "자세히": 닫혀 있으면 그리지 않고, 열 때 한 번만 그린다(닫힌 폭 0으로 그려지는 것을 막는다).
function lazyDetails(root,key,summary,fill){
 const d=el('details',null,'fin-more');d.append(el('summary',summary));add(root,d);
 const once=()=>{if(d.dataset.filled)return;d.dataset.filled='1';fill(d);};
 if(finDetailsOpen.has(key)){d.open=true;once();}
 d.addEventListener('toggle',()=>{if(d.open){finDetailsOpen.add(key);once();}else finDetailsOpen.delete(key);});
 return d;
}

// ---------- F5 예산 대비 실적 ----------
let finBudgetMonth=null;
const FIN_BUDGET_STATUS={OK:'예산 안',FAST:'속도 빠름',OVER:'예산 초과'};
function renderFinBudget(root,fin){
 const prep=prepare(fin),now=whole.localDate.slice(0,7);finBudgetMonth??=now;
 const nav=el('div',null,'fin-toolbar'),move=k=>()=>void perform(async()=>{finBudgetMonth=shiftMonth(finBudgetMonth,k);await render();});
 const monthNav=el('div',null,'fin-month-nav');nav.append(monthNav);
 const prev=button('◀ 이전',move(-1),'secondary nowrap'),next=button('다음 ▶',move(1),'secondary nowrap');
 const month=field(monthNav,'예산 달','month',finBudgetMonth);month.dataset.navOnly='1';month.addEventListener('change',()=>{if(/^\d{4}-\d{2}$/.test(month.value))void perform(async()=>{finBudgetMonth=month.value;await render();});});
 month.parentElement.before(prev);add(monthNav,next);for(const [b,l] of [[prev,'이전 달'],[next,'다음 달']]){b.dataset.navOnly='1';b.setAttribute('aria-label',l);}
 const s=budgetStatus(prep,fin.budgets,finBudgetMonth,whole.localDate),applied=fin.budgets.find(b=>b.id===s.budgetId)??null;
 const own=applied&&applied.data.effectiveFrom===finBudgetMonth?applied:null;
 add(root,add(el('div',null,'section-toolbar'),hint('예산은 시작 달부터 다음 예산이 시작하기 전까지 적용됩니다. 실적 = 지출 − 환불(이체·선불 제외). 실제 금액 모름 줄은 실적에 넣지 않고 따로 셉니다.'),add(el('div',null,'button-row'),button('금고 계산기',()=>openVaultCalculator(fin),'secondary'),button(own?'이 달 예산 수정':applied?'이 달부터 새 예산':'예산 정하기',()=>editFinBudget(own,applied,finBudgetMonth),'primary'))),nav);
 if(finBudgetMonth===now)renderFixedSchedule(root,fin);   // F59V: 이번 달 고정비 예정·확정(예산은 고정비 포함 전체)
 if(!applied){add(root,empty(finBudgetMonth+'에 적용되는 예산이 없습니다. "예산 정하기"로 전체 또는 분류별 월 예산을 입력하세요.'));renderFinBudgetList(root,fin);return;}
 const dayText=s.future?'아직 시작하지 않은 달':s.current?'오늘 '+s.elapsed+'일 / '+s.days+'일':'끝난 달 · '+s.days+'일';
 const known=s.dataState==='KNOWN',stateText={NO_DATA:'자료 없음',UNKNOWN_ONLY:'모름',FUTURE:'-'}[s.dataState];   // 자료 없음·순액 모름을 0원으로 보이지 않는다
 const pct=r=>r.usedPermille===null?'-':r.usedPermille<0n?'환불이 더 큼':(Number(r.usedPermille)/10).toFixed(1)+'%';
 const T=s.total,feel=T&&known&&s.current?moneyFeel({prep,status:s,forecast:vaultForecast(prep,s),rules:recurringRules()}):null,projected=T&&known?(feel?feelProjected(feel,T):T.projected):null;   // FIX37C (H37-M2): 이번 달 월말 예상은 진단 카드와 같은 값(고정비 예정 포함)
 add(root,add(el('div',null,'metric-grid fin-metrics'),
  metric('전체 예산',T?formatWon(T.budget):'정하지 않음',applied.data.effectiveFrom+'부터 적용 · '+dayText),
  metric('실적 (지출 − 환불)',known?formatWon(s.actualTotal):stateText,s.unknownRows?'실제 금액 모름 '+s.unknownRows+'행 별도':s.dataState==='NO_DATA'?'이 달 소비 자료가 없음(0원 아님)':'실제 금액 모름 없음'),
  metric(T&&known&&T.remaining<0n?'초과':'남은 금액',T&&known?formatWon(T.remaining<0n?-T.remaining:T.remaining):T&&s.future?formatWon(T.budget):'-',vaultDayText(T&&known&&s.current?feelCore(vaultForecast(prep,s)):null)),   // FIX67 (M-05): 금고와 같은 함수·같은 글자
  metric(feel?'월말 예상 (고정비 예정 포함)':'월말 예상',projected!==null?formatWon(projected):'-',T&&known&&s.current?'오늘까지 기대치 '+formatWon(T.expectedToDate)+' · '+(feel?.level?FEEL_LEVEL[feel.level]:FIN_BUDGET_STATUS[T.status]):T&&known?FIN_BUDGET_STATUS[T.status]:'')));
 const rows=[...(T?[{...T,category:'TOTAL',projected:known?projected:T.projected}]:[]),...s.categories];   // 전체 줄의 월말 예상도 위 칸과 같은 값
 const label=c=>c==='TOTAL'?'전체':finCatLabel(c);
 finChart(root,'budget','예산 대비 실적','테두리 = 예산, 채움 = 실적, 빨간 부분 = 초과'+(s.current?', 세로선 = 오늘까지 기대치(예산 × 지난 날 ÷ 그 달 날수)':'')+'.'+(known?'':' 실적: '+stateText+'.'),(box,w)=>{
  if(!rows.length){box.append(empty('이 예산에는 금액이 없습니다(예산 없음으로 지정됨).'));return;}
  const B=budgetBarsLayout(rows,{width:w,labelW:narrow()?72:110}),sv=svgRoot(w,B.height,'예산 대비 실적 막대');
  for(const r of B.rows){
   sv.append(svgText(2,r.y+15,fitText(label(r.category),B.labelW-6,11),'axis-label'));
   sv.append(svgTip(svgEl('rect',{x:B.labelW,y:r.y+4,width:Math.max(1,r.budgetW),height:16,rx:2},'bud-budget'),label(r.category)+' 예산 '+formatWon(r.budget)));
   if(known&&r.actualW>0)sv.append(svgTip(svgEl('rect',{x:B.labelW,y:r.y+4,width:r.actualW,height:16,rx:2},'bud-actual '+(r.status==='FAST'?'fast':'')),label(r.category)+' 실적 '+formatWon(r.actual)));
   if(known&&r.overW>0)sv.append(svgTip(svgEl('rect',{x:B.labelW+r.budgetW,y:r.y+4,width:r.overW,height:16},'bud-over'),label(r.category)+' 초과 '+formatWon(r.actual-r.budget)));
   if(s.current)sv.append(svgTip(svgEl('line',{x1:r.expectedX,x2:r.expectedX,y1:r.y+1,y2:r.y+23},'bud-expected'),'오늘까지 기대치 '+formatWon(r.expectedToDate)));
  }
  box.append(sv,finLegend([['bud-budget-swatch','예산'],['bud-actual-swatch','실적'],['bud-over-swatch','초과'],...(s.current?[['line','오늘까지 기대치']]:[])]));
 },()=>finTable(['분류','예산','실적','남은 금액','사용률','오늘까지 기대','월말 예상','남은 하루','상태'],rows.map(r=>known?[label(r.category),formatWon(r.budget),formatWon(r.actual),formatWon(r.remaining),pct(r),formatWon(r.expectedToDate),r.projected===null?'-':formatWon(r.projected),r.perDayLeft===null?'-':formatWon(r.perDayLeft),FIN_BUDGET_STATUS[r.status]]:[label(r.category),formatWon(r.budget),stateText,'-','-','-','-','-',stateText]),[1,2,3,4,5,6,7]));
 if(s.unbudgeted.length){const p=section('예산을 정하지 않은 분류','실적만 표시합니다.');for(const u of s.unbudgeted)add(p,row(finCatLabel(u.category),formatWon(u.actual)));add(root,p);}
 renderFinBudgetList(root,fin);
}
function renderFinBudgetList(root,fin){
 const p=section('예산 기록 '+fin.budgets.length+'개','시작 달 순서. 예산을 없애려면 그 달부터 금액을 모두 비운 예산을 저장하세요.');
 for(const b of fin.budgets){const d=b.data,n=Object.keys(d.categories).length;add(p,row(d.effectiveFrom+'부터',(d.total===null?'전체 예산 없음':'전체 '+formatWon(d.total))+' · 분류 '+n+'개'+(d.note?' · '+d.note:''),add(el('div',null,'buttons'),button('수정',()=>editFinBudget(b,b,d.effectiveFrom)))));}
 if(!fin.budgets.length)add(p,empty('아직 예산이 없습니다.'));add(root,p);
}
function editFinBudget(own,applied,month){
 const fin=whole.fin,d=own?.data??{effectiveFrom:month,total:applied?.data.total??null,categories:{...(applied?.data.categories??{})},note:''};
 modal(own?'예산 수정 · '+d.effectiveFrom+'부터':'새 예산',root=>{
  const grid=el('div',null,'field-grid');add(root,grid);
  const from=field(grid,'시작 달','month',d.effectiveFrom);from.required=true;if(own)from.readOnly=true;
  const total=field(grid,'전체 월 예산 (원, 빈칸 = 없음)','text',d.total??'');total.inputMode='numeric';
  const p=section('분류별 월 예산','빈칸은 그 분류 예산 없음, 0은 "쓰지 않기" 예산입니다.'),cg=el('div',null,'field-grid');add(p,cg);add(root,p);
  const cats=Object.fromEntries(Object.entries(fin.labels.expense).map(([k,l])=>{const n=field(cg,l,'text',d.categories[k]??'');n.inputMode='numeric';return [k,n];}));
  const note=field(root,'메모 (선택)','textarea',d.note);note.maxLength=500;
  if(!own&&applied)add(root,hint(applied.data.effectiveFrom+'부터 적용 중인 예산 값을 불러왔습니다. 저장하면 '+month+'부터 이 예산이 적용됩니다.'));
  return ()=>{if(!own&&fin.budgets.some(b=>b.data.effectiveFrom===from.value))throw finError('FIN_BUDGET_DUPLICATE_MONTH');return entity('FIN_BUDGET',own?.id??'budget-'+from.value,buildBudget({effectiveFrom:from.value,total:total.value,categories:Object.fromEntries(Object.entries(cats).map(([k,n])=>[k,n.value])),note:note.value},{labels:fin.labels}),own?.heads??[],own?'가계부 예산 수정':'가계부 예산 추가');};
 },own?'수정 저장':'예산 저장');
}

// ---------- F5 평생 타임라인 + 누적 소비 ----------
function renderFinTimeline(root,prep){
 const tl=lifeTimeline(prep,whole.localDate);
 finChart(root,'timeline','평생 타임라인 · 누적 소비','가져온 전체 기간. 막대 = 달마다 소비, 선 = 누적 소비(자료 있는 달만 더함). 점선 구간은 사이에 자료 없는 달이 있다는 뜻이고 실제 누적은 더 클 수 있습니다. 미배분 잔액(◆)은 해마다 따로 표시하고 누적에 넣지 않습니다.'+(tl.gapMonths?' 자료 없는 달 '+tl.gapMonths+'개.':''),(box,w)=>{
  if(!tl.months.length){box.append(empty(tl.years.length?'월별 소비 줄은 없고 연간 미배분 잔액만 있습니다. 미배분 잔액 합계 '+formatWon(tl.residualTotal)+'(해마다 아래 표에 있음, 누적 소비에 넣지 않음).':'자료가 없습니다.'));return;}
  const h=narrow()?230:280,L=timelineLayout(tl,{width:w,height:h,padL:narrow()?44:56,padR:narrow()?48:60}),s=svgRoot(w,h,'평생 소비 타임라인과 누적 곡선');
  for(const t of L.barTicks){s.append(svgEl('line',{x1:L.padL,x2:w-L.padR,y1:t.y,y2:t.y},'grid-line'));s.append(svgText(L.padL-6,t.y+4,formatCompact(t.value),'axis-label','end'));}
  for(const t of L.cumTicks)s.append(svgText(w-L.padR+6,t.y+4,formatCompact(t.value),'axis-label cum-axis'));
  for(const g of L.gaps)s.append(svgTip(svgEl('rect',{x:g.x,y:g.y,width:g.w,height:g.h},'no-data'),g.month+' · '+(g.unknownOnly?'실제 금액 모름만 있음(누적에 넣지 않음)':'자료 없음')));
  for(const b of L.bars)s.append(svgTip(svgEl('rect',{x:b.x,y:b.y,width:b.w,height:b.h},'bar trend-bar'),b.month+' · '+formatWon(b.value)));
  for(const seg of L.solid)if(seg.length>1)s.append(svgEl('polyline',{points:seg.map(p=>p.x+','+p.y).join(' ')},'cum-line'));
  for(const [a,b] of L.dashed)s.append(svgTip(svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y},'cum-line gap'),a.month+' ~ '+b.month+' 사이 자료 없음'));
  const last=L.solid.at(-1)?.at(-1);if(last)s.append(svgTip(svgEl('circle',{cx:last.x,cy:last.y,r:3},'cum-dot'),'누적 '+formatWon(last.value)));
  for(const y of L.years)s.append(svgText(y.x+2,h-8,y.text,'axis-label'));
  for(const r of L.residuals)s.append(svgTip(svgText(r.x,L.padT+10,'◆','cm-res-mark','middle'),r.year+'년 미배분 잔액 '+formatWon(r.value)+' (누적에 넣지 않음)'));
  box.append(s,finLegend([['trend-bar-swatch','달마다 소비'],['cum-swatch','누적 소비'],['no-data','자료 없음'],['cm-res','◆ 미배분 잔액(연 단위)']]),el('p','누적 소비 '+formatWon(tl.total)+' · 미배분 잔액 합계 '+formatWon(tl.residualTotal)+'(별도) · 실제 금액 모름 '+finCount(tl.unknownRows)+'행(별도)','small muted'),tl.earlier?el('p','그림에는 최근 '+finCount(tl.months.length)+'개월만 그렸습니다. 그 이전 '+finCount(tl.earlier.months)+'개월('+tl.earlier.through+'까지) 소비 합계 '+formatWon(tl.earlier.consumption)+'은 누적 소비에 들어 있습니다.','small muted'):null);
 },()=>finTable(['해','소비','자료 있는 달','자료 없는 달','선불 전환','미배분 잔액','실제 금액 모름'],tl.years.map(y=>[y.year,y.consumption===null?(y.monthsWithData?'모름':'자료 없음'):formatWon(y.consumption),finCount(y.monthsWithData),finCount(y.monthsNoData),formatWon(y.prepaid),y.residual===null?'-':formatWon(y.residual),y.unknownRows+'행']),[1,2,3,4,5,6]));
}

// ---------- B64 명세서 가져오기: 카드 명세서 파일 → 장부와 대조 → 빠진 것만 골라 FIN_TXN으로 저장 ----------
// 파일은 이 화면 메모리에서만 읽는다(저장·로그·전송 없음). 소탭을 떠나거나 "파일 닫기"를 누르면 버린다.
// 칸 짝은 이 기기 localStorage(lb.fin.stmt.map.v1)에만 기억한다(동기화 기록 아님). 저장은 고른 것만 entity('FIN_TXN', …) 1건 = 연산 1개.
// 대조 결과는 제안이다: 이미 있음·중복 의심은 저장하지 않는 것이 기본이고, 장부의 거래를 지우거나 무효화하지 않는다.
let finStmt=null;
const stmtStore=createMappingStore((()=>{try{return globalThis.localStorage??null;}catch{return null;}})());
const STMT_FLAG_TEXT={YEAR_GUESSED:'연도 추정',EARLY:'명세서 기간보다 앞 날짜 · 연도 확인',DATE_AMBIGUOUS:'두 자리 연도 · 연/월/일 순서가 모호함 · 날짜를 확인하고 체크',FORMULA:'수식 기호로 시작 · 글자로만 저장',MERCHANT_CUT:'가맹점 120자에서 자름',INSTALL_UNKNOWN:'할부 표기 모름',INSTALL_TOTAL_UNKNOWN:'할부 총액 모름'};
const STMT_KINDS_POS=[['EXPENSE','지출'],['PREPAID_LOAD','선불 충전'],['NONE','저장 안 함']],STMT_KINDS_NEG=[['REFUND','환불'],['NONE','저장 안 함']];
async function finStmtOpen(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),read=await readStatementAsync(bytes,readXlsx,{now:()=>Date.now()}),sha=await bytesSha256(bytes);
 const st={name:file.name,size:file.size,sha12:sha.slice(0,12),read,tableIndex:read.tableIndex,period:{from:shiftMonth(whole.localDate.slice(0,7),-1)+'-01',to:whole.localDate},
  choice:new Map(),groupSame:true,items:null,done:new Set(),saved:0,error:null,running:false,stop:false,stopped:false,finished:false};
 await finStmtHeader(st,null);
 return st;
}
// 머리글을 정하고(자동 또는 소유자가 고른 행) 이 기기에 기억한 칸 짝이 있으면 불러온다. 없으면 칸 이름으로 추측해 미리 골라 둔다.
async function finStmtHeader(st,row){
 const rows=st.read.tables[st.tableIndex].rows,found=row===null?findHeader(rows):headerAt(rows,row);
 st.header=found??headerAt(rows,0);st.headerGuessed=row===null&&!!found;st.headerMissing=row===null&&!found;
 st.sig=await headerSig(st.header.names);
 const mem=stmtStore.get(st.sig,st.header.names.length),card=whole.fin.accounts.find(a=>a.data.active&&a.data.type==='CARD')?.id??whole.fin.accounts.find(a=>a.data.active)?.id??'';
 st.remembered=!!mem;
 const guess=mem?null:guessColumns(st.header.names);st.columns=mem?.columns??Object.fromEntries(COLUMN_ROLES.map(r=>[r,guess[r]??-1]));
 st.negativeIsCancel=mem?mem.negativeIsCancel:true;st.installAmountIsTotal=mem?mem.installAmountIsTotal:guessInstallAmountIsTotal(st.header.names,st.columns);
 st.cancelValues=mem?.cancelValues??(st.columns.cancel>=0?[...new Set(rows.slice(st.header.dataStart).map(r=>normHeader(r[st.columns.cancel])))].filter(v=>v&&/취소/.test(v)).slice(0,10):[]);
 // FIX35 (HUNT35 D3): 기억한 계정은 파일 이름 모양 + 카드 구분이 같을 때만 미리 고른다. 머리글만 같은 다른 카드사 파일이면 계정을 비워 다시 고르게 한다.
 // FIX37A (HUNT37 F5): 카드 칸·카드 구분 행이 없는 파일은 같은 카드사의 다른 카드와 구별할 수 없어 계정을 기억에서 고르지 않는다(매번 고름).
 const acct=mem&&finStmtNorm(st).cards.length?rememberedAccount(mem,await accountSig(st.name,finStmtNorm(st).cards)):null;st.accountReset=!!mem&&!acct;
 st.accountId=acct?.accountId&&whole.fin.accounts.some(a=>a.id===acct.accountId)?acct.accountId:mem?'':card;st.cardAccounts={...(acct?.cardAccounts??{})};st.single=false;
 st.items=null;st.choice=new Map();
}
function finStmtNorm(st){
 return normalizeRows(st.read.tables[st.tableIndex],{columns:st.columns,cancelValues:st.cancelValues,negativeIsCancel:st.negativeIsCancel,installAmountIsTotal:st.installAmountIsTotal,period:st.period,localDate:whole.localDate,dataStart:st.header.dataStart,date1904:st.read.date1904===true});
}
const finStmtAccountFor=(st,tag)=>{if(st.single||!tag)return st.accountId||null;const m=st.cardAccounts[tag];return m==='-'?null:m||st.accountId||null;};
// 최신 장부로 다시 대조하고, 소유자가 고른 것(저장 여부·종류·분류·그래도 새것으로)을 다시 입힌다.
function finStmtReconcile(st){
 if(columnsProblem(st.columns)){st.items=null;return;}
 const norm=finStmtNorm(st),rows=norm.rows.map(r=>({...r,accountId:finStmtAccountFor(st,r.cardTag)}));
 st.items=reconcileStatement(rows,whole.fin,{localDate:whole.localDate});st.chips=suggestContext(whole.fin,{localDate:whole.localDate}).chips;st.finRef=whole.fin;
 for(const it of st.items){
  const c=st.choice.get(it.key);if(!c||it.status==='FAIL')continue;
  if(keepForced(it,c))it.forced=true;else if(c.forced&&it.status==='SAME'){c.forced=false;c.checked=false;}   // FIX35 (HUNT35 D2): 장부에 생긴 같은 거래(SAME)는 다시 저장 대기열에 넣지 않는다
  if(c.kind)it.kind=c.kind;
  if(c.category!==undefined){it.category=c.category;it.subcategory=c.subcategory??'';}
  if(it.status==='NEW'||it.forced)it.checked=c.checked??it.checked;   // D37B-1 (H37-F4): 분류 칩만 누른 행은 소유자가 고르지 않았으므로 대조의 기본 체크를 그대로 둔다(날짜 모호·EARLY 행이 저절로 저장되지 않게)
  if(it.kind==='NONE')it.checked=false;
  if(it.kind==='PREPAID_LOAD'){it.category=null;it.subcategory='';}else if(!it.category)it.category=st.chips[0]??'OTHER';
 }
}
function renderFinStatement(root,fin){
 const p=section('① 명세서 파일 고르기','카드사에서 내려받은 명세서(CSV, xlsx, 또는 HTML로 된 .xls)를 고르세요. 파일은 이 화면 메모리에서만 읽고 저장하지 않습니다. 장부와 대조해 빠진 거래만 골라 저장합니다(1건 = 저장 1번).');
 const input=el('input');input.type='file';input.accept='.csv,.tsv,.txt,.xls,.xlsx,.html,.htm,text/csv,text/plain,text/html';input.hidden=true;
 input.addEventListener('change',async()=>{const file=input.files?.[0];input.value='';if(!file)return;
  try{if(file.size>Math.max(STMT_LIMITS.fileBytes,XLSX_LIMITS.zipBytes))throw finError('STMT_TOO_BIG');finStmt=await finStmtOpen(file);await perform(render);}
  catch(e){status(stmtErrorText(e.code)||xlsxErrorText(e.code)||finErrorText(e.code)||'명세서 파일을 읽지 못했습니다.',true);}});
 const pick=button(finStmt?'다른 명세서 고르기':'명세서 파일 고르기',()=>input.click(),finStmt?'secondary':'primary');pick.dataset.navOnly='1';
 add(p,input,add(el('div',null,'buttons'),pick,finStmt&&!finStmt.running?button('파일 닫기',()=>void perform(async()=>{finStmt=null;await render();})):null));
 add(p,hint(xlsxSupported()?'옛 엑셀(.xls 이진 파일)은 엑셀·한셀·구글 시트에서 "다른 이름으로 저장 → Excel 통합 문서(xlsx) 또는 CSV(UTF-8)"로 바꿔 넣어 주세요.':'이 기기의 브라우저는 xlsx를 풀지 못합니다. 옛 엑셀(.xls 이진 파일)과 xlsx는 엑셀·한셀·구글 시트에서 "다른 이름으로 저장 → CSV(UTF-8)"로 바꿔 넣어 주세요.'));add(root,p);
 if(!finStmt)return;
 const st=finStmt,table=st.read.tables[st.tableIndex],names=st.header.names,norm=finStmtNorm(st),bad=columnsProblem(st.columns);
 // ② 표 미리보기 + 칸 고르기
 const c=section('② 칸 고르기',(st.remembered?'이 기기에 기억한 칸 짝을 불러왔습니다. ':st.headerGuessed?'머리글 이름으로 칸을 추측해 미리 골라 두었습니다. ':'')+'날짜·가맹점·금액은 꼭 골라야 합니다. 고른 칸 짝은 이 기기에만 기억합니다(행 내용은 기억하지 않음).');
 add(c,el('p',st.name+' · '+(st.read.kind==='HTML'?'HTML 표':st.read.kind==='XLSX'?'xlsx':'CSV')+' · '+st.read.encoding+' · 표 행 '+finCount(table.rows.length)+'개'+(table.cut.size?' · 200자 넘는 칸 '+table.cut.size+'개는 잘라 읽음':'')+(table.dropped?' · '+STMT_LIMITS.cols+'칸 넘는 칸 '+finCount(table.dropped)+'개는 버림':''),'small'));
 if(st.headerMissing)add(c,el('p',stmtErrorText('STMT_NO_HEADER'),'fin-bad'));
 const bar=el('div',null,'fin-toolbar');add(c,bar);
 if(st.read.tables.length>1)finSelect(bar,'표',String(st.tableIndex),st.read.tables.map((t,i)=>[String(i),(i+1)+'번째 '+(t.name?'시트 '+t.name+(t.hidden?'(숨김)':''):'표')+' · '+t.rows.length+'행']),v=>void perform(async()=>{st.tableIndex=Number(v);st.saved=0;st.finished=false;st.stopped=false;st.error=null;await finStmtHeader(st,null);await render();}));   // FIX35 (HUNT35 D1): 저장 결과 줄은 표마다 새로(done 키는 표까지 구분)
 finSelect(bar,'머리글 행',String(st.header.headerRow),table.rows.slice(0,STMT_LIMITS.headerScan).map((r,i)=>[String(i),(i+1)+'행 · '+maskCell(r.filter(Boolean).slice(0,3).join(' | ')).slice(0,40)]),v=>void perform(async()=>{await finStmtHeader(st,Number(v));await render();}));
 const grid=el('div',null,'field-grid');add(c,grid);
 const colOpts=[['-1','없음'],...names.map((n,i)=>[String(i),(i+1)+'열 · '+(n||'(이름 없음)')])];
 for(const role of COLUMN_ROLES)finSelect(grid,COLUMN_TEXT[role]+(REQUIRED_ROLES.includes(role)?' *':''),String(st.columns[role]??-1),colOpts,v=>void perform(async()=>{st.columns[role]=Number(v);st.items=null;await render();}));
 if(bad)add(c,el('p',stmtErrorText(bad),'fin-bad'));
 const opts=el('div',null,'fin-toolbar');add(c,opts);
 const fromEl=field(opts,'명세서 기간 시작','date',st.period.from),toEl=field(opts,'명세서 기간 끝','date',st.period.to);
 for(const [k,n] of Object.entries({from:fromEl,to:toEl})){n.dataset.navOnly='1';n.addEventListener('change',()=>{if(/^\d{4}-\d{2}-\d{2}$/.test(n.value))void perform(async()=>{st.period={...st.period,[k]:n.value};st.items=null;await render();});});}
 finCheck(opts,'금액이 음수인 행은 취소',st.negativeIsCancel,v=>void perform(async()=>{st.negativeIsCancel=v;st.items=null;await render();}));
 if(st.columns.installments>=0&&st.columns.total<0)finCheck(opts,'할부 행의 금액이 원거래 총액임(월 금액이 아님)',st.installAmountIsTotal,v=>void perform(async()=>{st.installAmountIsTotal=v;st.items=null;await render();}));
 add(c,hint('연도 없는 날짜(예: 10/14)는 명세서 기간의 해로 읽습니다. 할부는 원거래 1건(이용일·전액)으로 저장하고, 매달 나오는 회차 행은 새 소비로 세지 않습니다.'));
 if(st.columns.cancel>=0){
  const vals=[...new Set(table.rows.slice(st.header.dataStart).map(r=>normHeader(r[st.columns.cancel])).filter(Boolean))].slice(0,12),box=el('div',null,'fin-toolbar');
  add(c,el('p','취소 칸에서 "취소"로 볼 값','small'),box);
  for(const v of vals)finCheck(box,v,st.cancelValues.includes(v),on=>void perform(async()=>{st.cancelValues=on?[...st.cancelValues,v]:st.cancelValues.filter(x=>x!==v);st.items=null;await render();}));
 }
 const roleOf=i=>COLUMN_ROLES.filter(r=>st.columns[r]===i).map(r=>COLUMN_TEXT[r].split('(')[0]);
 const shown=table.rows.slice(st.header.dataStart,st.header.dataStart+STMT_LIMITS.preview);
 add(c,finTable(names.map((n,i)=>(n||(i+1)+'열')+(roleOf(i).length?' ['+roleOf(i).join('·')+']':'')),shown.map(r=>names.map((_,i)=>maskCell(r[i]??'')))));
 add(c,hint('미리보기는 처음 '+STMT_LIMITS.preview+'행입니다. 카드번호처럼 보이는 글자는 끝 4자리만 보입니다.'));
 add(root,c);
 if(bad)return;
 // 해석 결과 + 합계(통제값)
 const ok=norm.rows.filter(r=>!r.problem),fails=norm.rows.length-ok.length,ctrl=controlCheck(norm),sk=norm.skipped;
 const s=section('해석 결과');
 add(s,el('p','거래 행 '+finCount(norm.rows.length)+' · 날짜 해석 '+finCount(norm.rows.filter(r=>r.date).length)+'/'+finCount(norm.rows.length)+' · 금액 해석 '+finCount(norm.rows.filter(r=>r.amount!==null).length)+'/'+finCount(norm.rows.length)+' · 취소 '+finCount(norm.rows.filter(r=>r.cancel||r.amount?.startsWith('-')).length)+'행'+(fails?' · 해석 실패 '+fails+'행':''),'small'));
 add(s,el('p','건너뛴 행: 합계 '+sk.total+' · 소계 '+sk.subtotal+' · 카드 구분 '+sk.card+' · 상세정보 등 보조 '+sk.aux+' · 빈 행 '+sk.blank,'small muted'));
 if(st.remembered&&norm.rows.length&&fails*10>norm.rows.length)add(s,el('p','기억한 칸 짝으로 해석 실패가 10%를 넘습니다 · 카드사 파일 모양이 바뀌었을 수 있으니 칸을 다시 확인하세요.','fin-bad'));
 add(s,el('p',ctrl.state==='MATCH'?'✓ 파일 합계 '+formatWon(ctrl.matched)+' = 가져올 행 합계':ctrl.state==='NONE'?'파일에 합계 행이 없어 통제값 대조를 하지 않았습니다.':'✗ 파일 합계('+ctrl.fileTotals.map(formatWon).join(', ')+')와 가져올 행 합계('+formatWon(ctrl.sums[0])+')가 다릅니다 · 차이 '+formatWon(ctrl.diff)+' · '+ctrl.reasons.join(' · '),ctrl.state==='MATCH'?'fin-ok':ctrl.state==='NONE'?'muted small':'fin-bad'));
 add(root,s);
 // ③ 계정 고르기(카드 구분 행·카드 칸이 있으면 카드별로)
 const a=section('③ 계정 고르기','카드 구분이 있는 명세서는 카드마다 계정을 고릅니다. 카드 칸이 없거나 한 계정으로 넣으려면 "파일 전체를 계정 하나로"를 켜세요.');
 const accts=fin.accounts.filter(x=>x.data.active).sort((x,y)=>Number(y.data.type==='CARD')-Number(x.data.type==='CARD')).map(x=>[x.id,x.data.name+' · '+FIN_ACCOUNT_TEXT[x.data.type]]);
 if(!accts.length){add(a,empty('활성 계정이 없습니다. "계정"에서 카드 계정을 먼저 추가하세요.'));add(root,a);return;}
 if(st.accountReset)add(a,el('p',norm.cards.length?'기억한 칸 짝은 불러왔지만 계정은 다시 고르세요 · 머리글이 같은 다른 카드사 파일일 수 있습니다(파일 이름 모양과 카드 구분이 같을 때만 계정을 불러옵니다).':'기억한 칸 짝은 불러왔지만 계정은 다시 고르세요 · 이 파일에는 카드 구분이 없어 같은 카드사의 다른 카드일 수 있습니다(매번 고릅니다).','fin-warn'));   // FIX35 (HUNT35 D3)·FIX37A (HUNT37 F5)
 const abar=el('div',null,'fin-toolbar');add(a,abar);
 finSelect(abar,norm.cards.length&&!st.single?'기본 계정(카드 구분 없는 행)':'계정',st.accountId,[['','계정 선택'],...accts],v=>void perform(async()=>{st.accountId=v;st.items=null;await render();}));
 if(norm.cards.length){
  finCheck(abar,'파일 전체를 계정 하나로',st.single,v=>void perform(async()=>{st.single=v;st.items=null;await render();}));
  if(!st.single){const cg=el('div',null,'field-grid');add(a,cg);for(const tag of norm.cards)finSelect(cg,'카드 '+tag,st.cardAccounts[tag]??'',[['','기본 계정'],['-','가져오지 않음'],...accts],v=>void perform(async()=>{st.cardAccounts={...st.cardAccounts,[tag]:v};st.items=null;await render();}));}
 }
 const go=button(st.items?'다시 대조하기':'칸 짝 기억하고 장부와 대조하기',()=>void perform(async()=>{
  const kept=stmtStore.set(st.sig,{columns:st.columns,cancelValues:st.cancelValues,negativeIsCancel:st.negativeIsCancel,installAmountIsTotal:st.installAmountIsTotal,accountId:st.accountId,cardAccounts:st.cardAccounts,accountSig:await accountSig(st.name,finStmtNorm(st).cards),savedAt:new Date().toISOString()});
  st.remembered=true;st.accountReset=false;finStmtReconcile(st);await render();screenStatus(kept?'칸 짝을 이 기기에 기억했습니다 · 대조 결과를 확인하세요.':'이 기기 저장소에 칸 짝을 기억하지 못했습니다(이번 실행 동안만 기억) · 대조 결과를 확인하세요.');
 }),'primary');go.disabled=!st.accountId&&(st.single||!norm.cards.length);
 add(a,add(el('div',null,'buttons'),go));add(root,a);
 // 장부가 새로 고쳐졌으면(저장 뒤·다른 기기 동기화 뒤) 고른 것은 그대로 두고 다시 대조한다: 방금 저장한 거래는 "이미 있음"이 된다.
 if(st.items&&st.finRef!==whole.fin&&!st.running)finStmtReconcile(st);
 if(st.items)finStmtResults(root,st,fin);
}
function finStmtResults(root,st,fin){
 const items=st.items,count=s=>items.filter(i=>i.status===s).length,cov=coveredByBatches(items,fin);
 const r=section('④ 대조 결과','같은 계정·같은 금액·날짜 ±1일·가맹점 비슷함이면 "이미 있음"입니다. 모든 판정은 제안이고, 장부의 거래를 지우거나 바꾸지 않습니다.');
 add(r,add(el('div',null,'fin-chips'),...['NEW','SAME','SUSPECT','PAIR','SKIP','FAIL'].map(k=>add(el('span',null,'fin-chip'),el('span',STMT_STATUS_TEXT[k]),el('strong',finCount(count(k))+'건')))));
 if(cov.rows)add(r,el('p',cov.months.join(', ')+'은(는) 과거 이력 묶음이 덮고 있어 대부분 "이미 있음"으로 뜹니다(해당 '+finCount(cov.rows)+'행).','fin-warn'));
 add(root,r);
 const perm=importPermission({mdProfile,mdReady,autoOK:mdAutoOK(),role:mdRole,unlocked:mdUnlocked});
 const paints=new Map(),summary=el('p',null,'small'),errs=el('div'),save=button('',()=>runFinStmtSave(),'primary');
 const refreshSave=()=>{
  const sel=selectForSave(items),ops=finOps(),chk=checkStatementSave(sel.queue.length,{ops,local:finLocal(),txnCount:fin.txns.length,txnLimit:fin.limits?.FIN_TXN??8000});
  summary.textContent='이번에 저장 '+finCount(sel.queue.length)+'개 · '+(ops.known?'남은 저장 횟수 '+finCount(ops.remaining)+'개 · '+opsAfter({known:true,remaining:ops.remaining,need:sel.queue.length}).text:'남은 저장 횟수 확인 불가(서버가 최종 판정)')+(sel.later?' · 한 번에 '+SAVE_MAX+'건까지라 '+finCount(sel.later)+'건은 다음 번에':'');
  errs.replaceChildren(...chk.errors.filter(e=>e!=='FIN_IMPORT_NOTHING').map(e=>el('p',finErrorText(e)||e,'fin-bad')));
  const resume=st.saved||st.error||st.stopped;save.textContent=(resume?'이어서 저장':'고른 거래 저장')+' ('+sel.queue.length+'건)';save.disabled=!chk.ok||st.running||perm.state==='BLOCKED';return chk;
 };
 const setChoice=(keys,patch)=>{for(const k of keys){st.choice.set(k,{...st.choice.get(k),...patch});const it=items.find(x=>x.key===k);if(!it)continue;Object.assign(it,patch.category!==undefined?{category:patch.category,subcategory:''}:{},patch.kind?{kind:patch.kind}:{},patch.checked!==undefined?{checked:patch.checked}:{});
  if(it.kind==='NONE')it.checked=false;if(it.kind==='PREPAID_LOAD')it.category=null;else if(!it.category)it.category=st.chips[0]??'OTHER';paints.get(k)?.();}refreshSave();};
 // ⑤ 새것: 체크 + 종류 칩 + 분류 칩 1탭(같은 가맹점 함께)
 const n=section('⑤ 새것 고르기 · 분류','분류 칩은 같은 가맹점의 지난 분류 → 분류 규칙 → 최근 6개월 많이 쓴 분류 순으로 미리 눌러 두었습니다. 카드대금 납부는 "저장 안 함", 상품권·충전은 "선불 충전"을 제안합니다.');
 finCheck(n,'같은 가맹점 함께 바꾸기',st.groupSame,v=>{st.groupSame=v;});
 const picks=items.filter(it=>it.status==='NEW'||it.forced);
 for(const it of picks)add(n,finStmtItem(st,it,fin,{paints,setChoice}));
 if(!picks.length)add(n,empty('새로 저장할 거래가 없습니다. 이 명세서의 거래는 모두 장부에 있거나 확인이 필요한 것입니다.'));
 add(root,n);
 for(const [k,label] of [['SUSPECT','중복 의심'],['SAME','이미 있음'],['PAIR','파일 안 취소 짝'],['SKIP','건너뜀'],['FAIL','해석 실패']]){
  const list=items.filter(it=>it.status===k&&!it.forced);if(!list.length)continue;
  lazyDetails(root,'stmt-'+k,label+' '+list.length+'건 · 펼쳐서 비교'+(k==='FAIL'?'':' · "그래도 새것으로"로 고를 수 있음'),d=>{for(const it of list)add(d,finStmtItem(st,it,fin,{paints,setChoice}));});
 }
 // ⑥ 저장
 const w=section('⑥ 저장','고른 거래만 날짜순으로 1건씩 저장합니다(1건 = 저장 1번). 멈추면 저장된 것은 그대로 두고 "이어서 저장"으로 남은 것만 저장합니다. 같은 파일을 다시 넣어도 저장한 거래는 "이미 있음"이 되어 두 번 저장되지 않습니다.');
 if(perm.text){const why=el('p',perm.text,perm.state==='BLOCKED'?'fin-bad':'small');why.dataset.state=perm.state;add(w,why);}
 if(st.finished)add(w,el('p','저장 완료 · 이번에 '+st.saved+'건 저장','fin-ok'));
 if(st.error)add(w,el('p','중단됨 · '+(finErrorText(st.error)||st.error)+' · 저장된 거래는 그대로이고 "이어서 저장"으로 남은 것만 저장합니다.','fin-bad'));
 if(st.stopped&&!st.error)add(w,el('p','사용자가 중단함 · "이어서 저장"으로 남은 것을 저장할 수 있습니다.','muted'));
 const prog=el('progress',null,'fin-progress');prog.id='fin-stmt-bar';prog.max=1;prog.value=0;const line=el('p','','small');line.id='fin-stmt-line';
 const stop=button('중단',()=>{st.stop=true;stop.disabled=true;$('fin-stmt-line').textContent+=' · 지금 저장 중인 거래까지 마치고 멈춥니다';},'danger');stop.id='fin-stmt-stop';stop.hidden=true;
 save.id='fin-stmt-save';save.dataset.permission=perm.state;
 add(w,summary,errs,prog,line,add(el('div',null,'buttons'),save,stop));add(root,w);
 refreshSave();
}
function finStmtItem(st,it,fin,{paints,setChoice}){
 const r=it.row,n=el('div',null,'fin-line stmt-item'),meta=el('div',null,'meta'),flags=[...new Set(r.flags)].filter(f=>STMT_FLAG_TEXT[f]);
 add(meta,el('span',STMT_STATUS_TEXT[it.status]+(it.forced?' → 새것으로':''),'tag stmt-'+String(it.status).toLowerCase()),r.accountId?el('span',finAccountName(r.accountId)):null,r.cardTag?el('span',r.cardTag):null,
  it.reason?el('span',STMT_REASON_TEXT[it.reason]):null,(it.status==='FAIL'||r.amount===null)&&r.problem?el('span',ROW_STATUS_TEXT[r.problem]??r.problem,'tag unknown'):null,
  (r.months??0)>=2?el('span','할부 '+r.months+'개월'+(r.round?' · 명세서 '+r.round+'회차':'')):null,r.transit?el('span','교통 묶음 '+r.transit+'건'):null,
  r.foreign?el('span','해외 '+r.foreign.amount+(r.foreign.currency?' '+r.foreign.currency:'')):null,r.fee?el('span','수수료 '+formatWon(r.fee)):null,...flags.map(f=>el('span',STMT_FLAG_TEXT[f],'tag'+(f==='FORMULA'?' dup':''))),
  it.match?el('span','장부: '+it.match.date+' · '+(it.match.merchant||'가맹점 없음')+' · '+formatWon(it.match.net)+(it.match.source==='BATCH'?' (가져온 원천)':it.match.source==='VOIDED'?' (무효화됨)':' (직접 입력)')):null);
 add(n,add(el('div',null,'main'),el('strong',(r.date??'날짜 모름')+' · '+(r.merchant||'가맹점 없음')),meta),el('div',r.amount===null?'모름':formatWon(r.amount),'amount'+(r.amount?.startsWith('-')?' neg':'')));
 if(it.status==='FAIL'||r.amount===null)return n;   // FIX37A (HUNT37 F6): 금액을 모르는 행은 고를 것이 없다(비교만)
 const ctl=el('div',null,'stmt-controls');add(n,ctl);
 if(it.forcible&&!it.forced){add(ctl,button('그래도 새것으로',()=>void perform(async()=>{st.choice.set(it.key,{...st.choice.get(it.key),forced:true,checked:true,forcedFrom:it.status,tried:false});finStmtReconcile(st);await render();}),'secondary'));return n;}
 if(it.forced)add(ctl,button('새것으로 고른 것 취소',()=>void perform(async()=>{st.choice.set(it.key,{...st.choice.get(it.key),forced:false,checked:false});finStmtReconcile(st);await render();}),'secondary'));
 const keys=()=>st.groupSame?sameMerchantKeys(st.items,it.key):[it.key];
 const save=finCheck(ctl,'저장',it.checked,v=>setChoice([it.key],{checked:v}));
 const kindRow=el('div',null,'quick-row');kindRow.setAttribute('role','toolbar');kindRow.setAttribute('aria-label','종류');add(ctl,kindRow);
 const kindBtns=(r.amount?.startsWith('-')?STMT_KINDS_NEG:STMT_KINDS_POS).map(([k,label])=>{const b=button(label,()=>setChoice(keys(),{kind:k,checked:k!=='NONE'}),'secondary quick-pick');b.dataset.navOnly='1';b.dataset.kind=k;add(kindRow,b);return b;});
 const catRow=el('div',null,'quick-row');catRow.setAttribute('role','toolbar');catRow.setAttribute('aria-label','분류');add(ctl,catRow);
 const catBtns=st.chips.map(c=>{const b=button(fin.labels.expense[c]??c,()=>setChoice(keys(),{category:c}),'secondary quick-pick');b.dataset.navOnly='1';b.dataset.category=c;add(catRow,b);return b;});
 const other=finSelect(catRow,'그 외 분류',it.category??'',Object.entries(fin.labels.expense),v=>setChoice(keys(),{category:v}));
 const paint=()=>{save.checked=it.checked;save.disabled=it.kind==='NONE';
  for(const b of kindBtns){const on=b.dataset.kind===it.kind;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
  const spend=it.kind==='EXPENSE'||it.kind==='REFUND';catRow.hidden=!spend;
  for(const b of catBtns){const on=b.dataset.category===it.category;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
  if(spend&&it.category)other.value=it.category;};
 paints.set(it.key,paint);paint();
 return n;
}
function runFinStmtSave(){
 const st=finStmt;if(!st||st.running||!st.items)return;
 void perform(async()=>{try{
  if(mdProfile&&!mdReady&&mdAutoOK()){if(!(await mdAutoWrite()))throw finError('FIN_IMPORT_WRITE_PERMISSION');autoLeaseHeld=true;clearTimeout(autoLeaseTimer);}
  if(mdDraftMode())throw finError('FIN_IMPORT_DRAFT_MODE');
  // 다른 기기가 그사이 넣은 거래가 "이미 있음"이 되도록 최신 기록으로 다시 대조한 뒤 시작한다.
  await refresh();lock(true);finStmtReconcile(st);
  const fin=whole.fin,{queue}=selectForSave(st.items),chk=checkStatementSave(queue.length,{ops:finOps(),local:finLocal(),txnCount:fin.txns.length,txnLimit:fin.limits?.FIN_TXN??8000});
  if(!chk.ok)throw finError(chk.errors[0]);
  const bar=$('fin-stmt-bar'),line=$('fin-stmt-line'),stop=$('fin-stmt-stop'),reason='명세서 가져오기 · '+st.sha12,monthTag=st.period.to.slice(0,7),tableIndex=st.tableIndex;
  st.running=true;st.error=null;st.stop=false;st.stopped=false;st.finished=false;
  stop.hidden=false;stop.disabled=false;delete stop.dataset.busyLock;bar.max=Math.max(1,queue.length);bar.value=0;
  try{
   const res=await runStatementSave({queue:queue.map(it=>({key:statementSaveKey({sha12:st.sha12,tableIndex},it),it})),done:st.done,shouldStop:()=>st.stop,   // FIX35 (HUNT35 D1): 표까지 구분
    onProgress:k=>{bar.value=k;line.textContent='진행: '+k+' / '+queue.length;},
    save:async q=>{
     if(mdDraftMode())throw finError('FIN_IMPORT_DRAFT_MODE');if(autoLeaseHeld)clearTimeout(autoLeaseTimer);
     line.textContent='저장 중: '+q.it.row.date+' · '+(bar.value+1)+' / '+queue.length;
     const data=buildTxn(statementTxnInput(q.it,{sha12:st.sha12,monthTag,tableIndex}),{labels:fin.labels,accounts:fin.accounts,localDate:whole.localDate,old:null});
     if(q.it.forced)st.choice.set(q.it.key,{...st.choice.get(q.it.key),tried:true});   // FIX35 (HUNT35 D2): 응답을 잃어도 다시 대조에서 SAME이면 다시 저장하지 않게
     const r=await entity('FIN_TXN',entityId(),data,[],reason);if(r.status==='LOCAL_DRAFT')throw finError('FIN_IMPORT_DRAFT_MODE');st.saved++;
    }});
   st.stopped=res.stopped;if(!res.stopped)st.finished=true;
  }catch(e){st.error=e.code||'HOLD_CONNECTION';throw e;}
  finally{st.running=false;stop.hidden=true;try{await refresh();}catch{}}   // refresh가 다시 그리면서 새 장부로 다시 대조한다(renderFinStatement)
  status(st.finished?savedMessage()+' · 명세서 가져오기 저장 '+st.saved+'건':'저장을 중단했습니다 · 저장 '+st.saved+'건 · 이어서 저장할 수 있습니다.');
 }finally{
  if(autoLeaseHeld){clearTimeout(autoLeaseTimer);autoLeaseTimer=setTimeout(()=>{void mdReleaseNow();},20000);}
 }});
}
// ---------- F2 과거 이력 가져오기 ----------
// 계획 파일은 화면 메모리에만 있다(저장·로그·전송 없음). 확정하면 계정 → 월 묶음 순서로 entity()를 하나씩 부른다.
// 중단돼도 같은 파일을 다시 고르면 이미 저장된 엔티티는 건너뛰고 이어서 저장한다.
function renderFinImport(root,fin){
 const p=section('과거 이력 가져오기','PC에서 과거 이력 변환기로 만든 계획 파일을 고르세요. 파일 내용은 이 화면 메모리에서만 읽고, 확정 전에는 아무것도 저장하지 않습니다.');
 const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
 input.addEventListener('change',async()=>{const file=input.files?.[0];input.value='';if(!file)return;
  try{if(file.size<2||file.size>30_000_000)throw finError('FIN_IMPORT_FILE');let plan;try{plan=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));}catch{throw finError('FIN_IMPORT_FILE');}
   finImport={plan,name:file.name,size:file.size,done:new Set(),saved:0,error:null,finished:false,stop:false};await perform(render);}
  catch(e){status(finErrorText(e.code)||'계획 파일을 읽지 못했습니다.',true);}});
 const pick=button(finImport?'다른 계획 파일 고르기':'계획 파일 고르기',()=>input.click(),finImport?'secondary':'primary');pick.dataset.navOnly='1';
 add(p,input,add(el('div',null,'buttons'),pick,finImport&&!finImport.running?button('파일 닫기',()=>void perform(async()=>{finImport=null;await render();})):null));add(root,p);
 if(!finImport)return;
 const st=finImport,draft=mdDraftMode(),ops=finOps(),local=finLocal(),report=checkImportPlan(st.plan,fin,{byteLimit:mdBackend?null:PC_ENTITY_REQUEST_LIMIT,ops,local});
 finImportDropStale(st,report);
 // 기록 권한: 이 창이 소유자면(ACQUIRE) 버튼 하나로 권한을 받고 시작하므로 임시 저장 모드여도 막지 않는다. 풀 수 없으면(BLOCKED) 이유를 보인다.
 const perm=importPermission({mdProfile,mdReady,autoOK:mdAutoOK(),role:mdRole,unlocked:mdUnlocked});
 if(draft&&perm.state==='BLOCKED'&&!report.errors.includes('FIN_IMPORT_DRAFT_MODE'))report.errors.unshift('FIN_IMPORT_DRAFT_MODE');
 const ready=report.ok&&perm.state!=='BLOCKED';
 add(root,add(el('div',null,'metric-grid fin-metrics'),metric('계정',finCount(report.counts.accounts)+'개',st.name),metric('월 묶음',finCount(report.counts.batches)+'개','미배분 잔액 묶음 포함'),metric('가져온 줄',finCount(report.counts.rows)+'행','미배분 잔액 '+finCount(report.counts.residualRows)+'행 별도'),metric('저장할 항목',finCount(report.toSave)+'개','이미 있음 '+report.skipped+' · 충돌 '+report.conflicts+(report.invalid?' · 형식 오류 '+report.invalid:''))));
 const money=k=>['rows','unknownRows'].includes(k)?v=>v===null?'없음':finCount(v)+'행':v=>v===null?'없음':formatWon(v);
 const c=section('통제값 대조','기대값은 과거 이력 요약(실제 금액 모름 행 수만 변환기가 센 값), 계산값은 이 앱이 계획 파일의 행을 다시 더한 값입니다. 1원이라도 다르면 확정할 수 없습니다.');
 add(c,finTable(['항목','기대값','계산값','결과'],report.controls.map(x=>[x.label,money(x.key)(x.expected),money(x.key)(x.got),x.match?'✓ 일치':'✗ 불일치']),[1,2]));
 if(report.batchControlMismatch.length)add(c,el('p','묶음 통제값 불일치: '+report.batchControlMismatch.join(', '),'fin-bad'));
 add(c,el('p',report.controls.length&&report.controls.every(x=>x.match)&&!report.batchControlMismatch.length?'✓ 통제값 '+report.controls.length+'개 모두 일치':'✗ 통제값이 일치하지 않습니다',report.controls.every(x=>x.match)&&!report.batchControlMismatch.length?'fin-ok':'fin-bad'));
 add(root,c);
 const run=section('가져오기 확정');
 add(run,el('p',ops.known?'이번에 저장 '+finCount(report.opCheck.need)+'개 · 남은 저장 횟수 '+finCount(ops.remaining)+'개'+(report.opCheck.need>ops.remaining?' · 부족':''):'이번에 저장 '+finCount(report.opCheck.need)+'개 · 남은 저장 횟수 확인 불가(한도 사전 검사 없이 진행, 서버가 최종 판정)','small ops-line'+(ops.known&&report.opCheck.need>ops.remaining?' fin-bad':'')),el('p',opsAfter(report.opCheck).text,'small ops-after'),el('p','이 기기 저장 용량: 이번 예상 +'+(report.localCheck.need/1e6).toFixed(2)+'MB · '+(local.known?'남은 '+(local.room/1e6).toFixed(2)+'MB'+(report.localCheck.need>local.room?' · 부족':''):'남은 용량 확인 불가(막지 않음)'),'small ops-local'+(local.known&&report.localCheck.need>local.room?' fin-bad':'')));
 if(perm.text){const why=el('p',perm.text,perm.state==='BLOCKED'?'fin-bad':'small');why.id='fin-import-permission';why.dataset.state=perm.state;add(run,why);}
 for(const code of report.errors)add(run,el('p',finErrorText(code)||code,code==='FIN_IMPORT_NOTHING'?'fin-ok':'fin-bad'));
 if(st.finished)add(run,el('p','가져오기 완료 · 이번에 저장 '+st.saved+'개','fin-ok'));
 if(st.error)add(run,el('p','중단됨 · '+(finErrorText(st.error)||st.error)+' · 저장된 항목은 그대로 두고, 같은 파일로 "이어서 가져오기"를 누르면 남은 항목만 저장합니다.','fin-bad'));
 if(st.stopped&&!st.error)add(run,el('p','사용자가 중단함 · "이어서 가져오기"로 남은 항목을 저장할 수 있습니다.','muted'));
 const bar=el('progress',null,'fin-progress');bar.id='fin-import-bar';bar.max=Math.max(1,report.items.length);bar.value=report.skipped;const line=el('p',report.items.length?'진행: 저장됨·이미 있음 '+report.skipped+' / '+report.items.length:'','small');line.id='fin-import-line';
 const stop=button('중단',()=>{st.stop=true;stop.disabled=true;$('fin-import-line').textContent+=' · 지금 저장 중인 항목까지 마치고 멈춥니다';},'danger');stop.id='fin-import-stop';stop.hidden=true;
 const resume=(st.saved||st.error||st.stopped)&&report.toSave,label=resume?'이어서 가져오기 ('+report.toSave+'개 남음)':'가져오기 확정 ('+report.toSave+'개 저장)';
 const go=button(perm.state==='ACQUIRE'?'저장 준비하고 '+label:label,()=>runFinImport(),'primary');go.disabled=!ready;go.dataset.permission=perm.state;
 add(run,bar,line,add(el('div',null,'buttons'),go,stop),hint('저장 순서: 계정 → 월 묶음. 같은 계정·같은 달을 두 번 넣지 않도록 서버 규칙이 다시 검사합니다.'));
 add(root,run);
 const items=add(el('details',null,'panel'),el('summary','항목 '+report.items.length+'개 자세히'));
 const ACTION={SAVE:'저장 예정',SKIP:'이미 있음 · 건너뜀',CONFLICT:'충돌',INVALID:'형식 오류'};
 add(items,finTable(['항목','처리','이유','요청 크기'],report.items.map(i=>[i.label,ACTION[i.action],i.reason||'-',finCount(i.bytes)+'B']),[3]));add(root,items);
}
// 저장 완료로 적어 둔 항목이 지금 프로필에서는 아직 저장 대상이면, 그 기록은 다른 프로필(또는 지워진 자료)에서 만든 것이다 → 처음부터 다시 센다(거짓 '완료' 방지).
function finImportDropStale(st,report){
 if(st.running||!st.done.size)return false;
 if(!report.items.some(i=>i.action==='SAVE'&&st.done.has(i.entityType+':'+i.entityId)))return false;
 st.done=new Set();st.saved=0;st.error=null;st.finished=false;st.stopped=false;return true;
}
function runFinImport(){
 const st=finImport;if(!st||st.running)return;
 void perform(async()=>{try{
  // 이 창이 소유자인데 권한이 없으면(처음이거나 창을 숨겨 끊긴 뒤 "이어서") 여기서 동기화·기록 권한을 받는다. 못 받으면 시작하지 않는다.
  if(mdProfile&&!mdReady&&mdAutoOK()){if(!(await mdAutoWrite()))throw finError('FIN_IMPORT_WRITE_PERMISSION');autoLeaseHeld=true;clearTimeout(autoLeaseTimer);}   // released 20 s after the last save, like other saves
  if(mdDraftMode())throw finError('FIN_IMPORT_DRAFT_MODE');
  // 다른 기기가 그사이 저장했을 수 있으니 최신 기록으로 다시 그리고 계획을 다시 검사한 뒤 시작한다.
  await refresh();lock(true);
  const report=checkImportPlan(st.plan,whole.fin,{byteLimit:mdBackend?null:PC_ENTITY_REQUEST_LIMIT,ops:finOps(),local:finLocal()});
  if(!report.ok)throw finError(report.errors[0]||'FIN_IMPORT_CONFLICT');
  if(report.items.some(i=>i.action==='SAVE'&&st.done.has(i.entityType+':'+i.entityId))){st.done=new Set();st.saved=0;}   // 다른 프로필에서 쌓은 완료 기록은 이 프로필에 해당하지 않는다
  const bar=$('fin-import-bar'),line=$('fin-import-line'),stop=$('fin-import-stop');
  st.running=true;st.error=null;st.stop=false;st.stopped=false;st.finished=false;
  // perform()이 모든 버튼을 잠갔으므로 중단 버튼만 다시 연다.
  stop.hidden=false;stop.disabled=false;delete stop.dataset.busyLock;
  const byKey=new Map(st.plan.entities.map(e=>[e.entityType+':'+e.entityId,e])),queue=report.items.filter(i=>i.action==='SAVE');
  let n=report.skipped;const reason='과거 이력 가져오기 · '+report.sourceSha256.slice(0,12);
  try{
   for(const item of queue){
    if(st.stop){st.stopped=true;break;}
    const key=item.entityType+':'+item.entityId;if(st.done.has(key)){n++;continue;}
    if(mdDraftMode())throw finError('FIN_IMPORT_DRAFT_MODE');
    line.textContent='저장 중: '+item.label+' · '+(n+1)+' / '+report.items.length;
    // 앞 저장이 켠 20초 해제 타이머가 오래 걸리는 이 저장 도중에 권한을 놓지 않게 끈다(자동 권한일 때만 켜져 있다).
    if(autoLeaseHeld)clearTimeout(autoLeaseTimer);
    const e=byKey.get(key),r=await entity(e.entityType,e.entityId,e.data,[],reason);
    if(r.status==='LOCAL_DRAFT')throw finError('FIN_IMPORT_DRAFT_MODE');
    st.done.add(key);st.saved++;n++;bar.value=n;line.textContent='진행: '+n+' / '+report.items.length;
   }
   if(!st.stopped)st.finished=true;
  }catch(e){st.error=e.code||'HOLD_CONNECTION';throw e;}
  finally{st.running=false;stop.hidden=true;try{await refresh();}catch{}}
  status(st.finished?savedMessage()+' · 과거 이력 가져오기 완료 · 저장 '+st.saved+'개':'가져오기를 중단했습니다 · 저장 '+st.saved+'개 · 이어서 가져올 수 있습니다.');
 }finally{
  // 자동으로 받은 권한은 어떻게 끝나든(첫 저장 전 실패·중단·빈 큐 포함) 마지막 뒤 20초에 놓는다. 수동 권한(autoLeaseHeld 아님)은 그대로.
  if(autoLeaseHeld){clearTimeout(autoLeaseTimer);autoLeaseTimer=setTimeout(()=>{void mdReleaseNow();},20000);}
 }});
}
// B42: 탑 탭. 성취 탑을 맨 위에 그리고, 예전 진행 패널은 접어 둔다(탑 모듈이 없을 때는 그대로 보인다).
const openProgress=mode=>{if(towerSt)(towerSt.universe??={mode:'tower'}).mode=mode;navigate('PROGRESS');};
function renderStatus(root){if(!statusView){add(root,hint('상태 화면을 불러오지 못했습니다. 앱을 다시 열어 주세요.'));return;}statusView.renderStatusView(root,{...lifeCtx(),draftCard:lifeSt?.studyCard?.card??null,timer:lifeSt?.timer??null,focusExtraMin:focusExtraMin(),openStudy:()=>{if(lifeSt?.timer)lifeSt.liveOpen=true;navigate('TODAY');},openTower:()=>openProgress('tower'),openUniverse:()=>openProgress('universe')});}
function renderProgress(root){if(!lifeTower){renderProgressPanels(root);return;}const uni=universeView?universeView.createUniverse(root,{...lifeCtx(),sheet:towerSheet,openStudy:studyOn()?()=>navigate('STUDY'):null},towerSt):null;lifeTower.renderTower(root,{...lifeCtx(),sheet:towerSheet,moneyLine:()=>whole.fin?feelLine(feelOf(whole.fin)):null,openMoney:()=>navigate('LEDGER')},towerSt);const old=add(el('details',null,'panel life-legacy'),el('summary','예전 진행 화면'));add(root,old);renderProgressPanels(old);uni?.sync([root.querySelector('#life-tower'),old]);}
function renderProgressPanels(root){const p=whole.progress;
 const m=p.measurement,measured=section('실제로 한 양','확인된 원본의 현재 해석입니다. 시간으로 결과나 목표 완료를 추정하지 않습니다. 임시·결과 모르는 저장은 제외됩니다.');
 if(m){add(measured,row('실제 유효시간',m.totalEffectiveSeconds===null?'알 수 없음':String(m.totalEffectiveSeconds/60)+'분'));for(const q of m.quantities)add(measured,row(q.identity,q.value+' '+q.unit));}
 else add(measured,hint('아직 측정 기록이 없습니다.'));
 const game=section('게임 피드백','게임 점수는 삶의 가치나 능력 평가가 아닙니다.');add(game,hint('게임 연결 확인이 필요함 · 시간과 결과 기록, 나의 집은 사용할 수 있습니다.'));const gd=add(el('details'),el('summary','기술 정보'));add(gd,el('p','UF14_APPROVED_DAILY_CAP_UNDEFINED · CONSERVATIVE_SEALED_RATIONAL_V1','path'));add(game,gd);add(root,measured,game);
 add(root,add(el('div',null,'metric-grid'),metric('결과가 있는 행동일',p.totalRecorded,'행동 × 날짜별 최신 결과'),metric('완료',p.actionAccumulation.COMPLETE),metric('일부 완료',p.actionAccumulation.PARTIAL),metric('하지 못함',p.actionAccumulation.NOT_DONE)),housePanel());const trend=section('최근 14일의 기록','막대는 결과가 입력된 행동 수입니다. 누락을 실패로 추정하지 않습니다.'),chart=el('div',null,'chart'),max=Math.max(1,...p.trend.map(t=>t.recorded));for(const day of p.trend){const col=el('div',null,'chart-column'),bar=el('div',null,'bar');bar.dataset.size=String(Math.ceil(day.recorded/max*10));bar.setAttribute('aria-label',day.date+' 기록 '+day.recorded);add(col,el('span',day.recorded,'bar-count'),bar,el('small',day.date.slice(5)));add(chart,col);}add(trend,chart);add(root,trend);const grid=el('div',null,'grid two'),milestones=section('계획 중간 목표'),domains=section('영역별 행동 누적','각 기록 당시 분류를 사용합니다.');for(const plan of p.planMilestones)add(milestones,row(plan.title,plan.done+' / '+plan.total+' 완료'));if(!p.planMilestones.length)add(milestones,empty('아직 계획이 없습니다.'));for(const d of p.domainActivity)add(domains,row(d.domain+' · '+d.name,'기록 '+d.recorded+' · 완료/일부 '+d.positive));add(domains,hint('미분류 기록 '+p.unassignedActivity));add(grid,milestones,domains);add(root,grid);const streaks=section('선택한 행동의 연속 완료','설정에서 직접 켠 행동만 표시합니다. 오늘 미기록이면 어제까지의 연속 완료를 표시합니다.');for(const s of p.streaks)add(streaks,row(s.title,s.days+'일'));if(!p.streaks.length)add(streaks,empty('연속 완료를 추적하도록 선택한 행동이 없습니다.'));add(root,streaks);const complete=section('완료한 중간 목표');for(const m of p.completedMilestones)add(complete,row(m.title,m.planTitle));if(!p.completedMilestones.length)add(complete,empty('현재 완료로 표시된 중간 목표가 없습니다.'));add(root,complete);}
function houseVisual(h){const scene=el('div',null,'house-scene'),body=el('div',null,'house-body');scene.setAttribute('role','img');scene.setAttribute('aria-label','기록된 행동 '+h.actionBlocks+'블록, 완료 중간 목표 '+h.milestoneBlocks+'블록');add(scene,el('div',null,'house-roof'));for(let i=0;i<48;i++)add(body,el('span',null,'brick'+(i<Math.min(h.totalBlocks,48)?' filled':'')+(i>=Math.min(h.actionBlocks,48)&&i<Math.min(h.totalBlocks,48)?' milestone-brick':'')));add(scene,body,el('div',null,'house-ground'));return scene;}
function renderHouse(root){add(root,housePanel());}
function housePanel(){const h=whole.progress.house,p=section('탑에 쌓인 기록');p.id='house';p.classList.add('house-panel','house-large');add(p,houseVisual(h),el('div',h.totalBlocks+' 블록','house-number'),el('p','완료·일부 완료 행동일 '+h.actionBlocks+' + 완료 중간 목표 '+h.milestoneBlocks,'house-legend'),hint('최대 48개 블록을 그립니다. '+(h.totalBlocks>48?'화면 밖의 '+(h.totalBlocks-48)+'개도 위 합계에 포함됩니다.':'')),hint('행동 하나의 하루 결과는 한 번만 셉니다. 정정 또는 중간 목표 상태 변경 시 현재 기록에 맞게 블록 수가 달라집니다. 삶의 가치나 완성률을 뜻하지 않습니다.'),hint('이 기기에 임시 저장된 기록은 쌓이기 전까지 블록에 들어가지 않습니다.'));return p;}
// 이력 종류: 저장 가능한 종류(whole-life-model ENTITY_TYPES) + 행동 기록 3종. 새 종류는 HISTORY_NEW_TYPES에 더한다(시험이 ENTITY_TYPES와 맞는지 확인).
const HISTORY_NEW_TYPES=['FIN_ACCOUNT','FIN_TXN','FIN_BATCH','FIN_RULE','FIN_BUDGET','FIN_RECURRING','HLT_PROFILE','HLT_DAY','STUDY_DAY','HABIT_DEF','LIFE_DAY','SUBJECT_DEF','EXAM_SCHEDULE','PLAN_DAY','PLAN_GOAL','EXAM_RESULT','GAME_PROFILE','DIARY_DAY','WEEK_REVIEW'];
// 새 종류 이력 요약은 종류별 짧은 문구만(금액·비공개 건강 내용을 넣지 않는다).
const HISTORY_SUMMARY={FIN_ACCOUNT:'가계부 계정 변경',FIN_TXN:'가계부 거래 변경',FIN_BATCH:'가계부 가져오기 묶음 변경',FIN_RULE:'가계부 분류 규칙 변경',FIN_BUDGET:'가계부 예산 변경',FIN_RECURRING:'가계부 정기 결제 변경',HLT_PROFILE:'건강 기본 설정 변경',HLT_DAY:'건강 하루 기록 변경',STUDY_DAY:'공부 하루 기록 변경',HABIT_DEF:'습관 정의 변경',LIFE_DAY:'오늘 카드 변경',SUBJECT_DEF:'과목 정의 변경',EXAM_SCHEDULE:'시험 일정 변경',PLAN_DAY:'하루 계획 변경',PLAN_GOAL:'과목 주간 목표 변경',EXAM_RESULT:'모의고사 결과 변경',GAME_PROFILE:'칭호 변경',DIARY_DAY:'일기 변경',WEEK_REVIEW:'주간 리뷰 변경'};
function historySummary(c){const v=c.value;if(c.type==='MEASUREMENT'){const m=v.measurement;return (m.actualEffectiveDuration===null?'시간 미입력':(m.actualEffectiveDuration.value/60)+'분')+(m.quantity?' · '+m.quantity.value+' '+m.quantity.unit+' ('+m.quantity.identity+')':'');}if(c.type==='RESULT')return LABEL[v.outcome];if(c.type==='RESTART')return v.text||'(직접 비움)';if(c.type==='DOMAIN')return LABEL[v.data.status]+' · '+v.data.currentState;if(c.type==='PLAN')return LABEL[v.data.status]+' · '+v.data.currentStage;if(c.type==='EVENT')return v.data.deleted?'삭제됨 · 원본 보존':v.data.date+' · '+LABEL[v.data.kind];if(c.type==='FINANCE')return v.data.snapshotDate+' · '+(v.data.currency==='KRW'?'원':v.data.currency);if(c.type==='ACTION')return v.data?(v.data.active?'활성':'비활성')+' · '+v.data.title:v.title;if(Object.hasOwn(HISTORY_SUMMARY,c.type))return HISTORY_SUMMARY[c.type];return '표시 순서 / 영역 설정 변경';}
function renderHistory(root){if(whole.domains.some(d=>d.heads?.length))add(root,legacyAreas());const filter=el('div',null,'history-filter');const date=field(filter,'이력 날짜','date',historyFilter.date),domain=field(filter,'이력 영역','select',historyFilter.domain,[['','모든 영역'],['UNASSIGNED','미분류'],...whole.domains.map(d=>[d.code,d.code+' · '+d.name])]),type=field(filter,'이력 종류','select',historyFilter.type,[['','모든 종류'],...['RESULT','RESTART','MEASUREMENT','ACTION','DOMAIN','PLAN','EVENT','FINANCE','PREFERENCES'],...HISTORY_NEW_TYPES]);for(const n of [date,domain,type])n.addEventListener('change',()=>{historyFilter={date:date.value,domain:domain.value,type:type.value};historyLimit=100;void render();});add(filter,button('필터 초기화',()=>{historyFilter={date:'',domain:'',type:''};void render();}));add(root,filter,hint('원본과 모든 변경을 표시합니다. 행동 이름과 영역은 기록 당시 기준입니다.'));const rows=changes.filter(c=>(!historyFilter.date||c.localDate===historyFilter.date)&&(!historyFilter.domain||(historyFilter.domain==='UNASSIGNED'?c.domain===null:c.domain===historyFilter.domain))&&(!historyFilter.type||c.type===historyFilter.type));add(root,hint(rows.length+'개 변경'));const list=el('div',null,'history-list');for(const c of rows.slice(0,historyLimit)){const item=el('article',null,'history-item');add(item,add(el('div',null,'row'),el('strong',c.title),badge(c.type)),el('p',historySummary(c)),el('p',(c.localDate||'날짜 미지정')+' · '+(Number.isFinite(Date.parse(c.recordedAt))?new Date(Date.parse(c.recordedAt)+9*3600000).toISOString().slice(0,16).replace('T',' ')+' KST':c.recordedAt)+' · '+c.reason,'meta'));const details=el('details');add(details,el('summary','원본 연결과 저장된 값'),el('p','원본: '+(c.parents.join(', ')||'새 기록'),'path'),el('p','개정: '+c.revisionId,'path'),el('pre',JSON.stringify(c.value,null,2),'path'));add(item,details);if(c.canCorrect)add(item,button('정정 · '+c.title+' · '+LABEL[c.type],()=>editCorrection(c)));{const rb=typeof recordClearNow==='function'?recordClearNow()?.restoreButton(c):null;if(rb)add(item,rb);}/* V7D2: 비운 기록의 이전 판 "이 값으로 되살리기"(1연산) */add(list,item);}if(!rows.length)add(list,empty('조건에 맞는 이력이 없습니다.'));add(root,list);if(rows.length>historyLimit)add(root,button('100개 더 보기',()=>{historyLimit+=100;void render();}));}
function editCorrection(c){if(c.type==='MEASUREMENT'){
 modal('원본을 보존하며 양 정정',root=>{const m=c.value.measurement,inputs=measurementInputs(root,{...durationEditorValue(m.actualEffectiveDuration===null?null:m.actualEffectiveDuration.value),quantity:m.quantity?.value??'',unit:m.quantity?.unit??'',identity:m.quantity?.identity??''}),reason=field(root,'정정 이유','text',''),confirm=field(root,'원본을 남기고 새 정정 기록을 추가합니다','checkbox',false);reason.required=true;confirm.required=true;return async()=>{const measurement=inputMeasurement(inputs,m.observationId);if(!measurement)throw appError('EMPTY_MEASUREMENT');const fields={actionId:c.actionId,localDate:c.value.localDate,expectedHeads:{result:[],restart:[],measurement:c.currentHeads},outcome:null,restartPoint:null,reason:reason.value.trim(),confirmed:confirm.checked,measurement};const r=await submit('/api/correction',await command('CORRECTION',fields));if(r.status!==savedStatus())throw appError('HOLD_UNKNOWN_SAVE');};},'정정 저장');return;
 }modal('원본을 보존하며 정정',root=>{add(root,el('p',c.title+' · '+historySummary(c)));const result=c.type==='RESULT',value=field(root,'정정 값',result?'select':'textarea',result?c.value.outcome:c.value.text,result?['COMPLETE','PARTIAL','NOT_DONE']:null),reason=field(root,'정정 이유','text',''),confirm=field(root,'원본을 남기고 새 정정 기록을 추가합니다','checkbox',false);reason.required=true;reason.maxLength=300;confirm.required=true;return async()=>{const fields={actionId:c.actionId,localDate:result?c.value.localDate:today.localDate,expectedHeads:{result:result?c.currentHeads:[],restart:result?[]:c.currentHeads},outcome:result?value.value:null,restartPoint:result?null:value.value,reason:reason.value.trim(),confirmed:confirm.checked};const r=await submit('/api/correction',await command('CORRECTION',fields));if(r.status!==savedStatus())throw appError('HOLD_UNKNOWN_SAVE');};},'정정 저장');}
// M1: state fingerprint. Values only (hash prefixes, counters); nothing readable or secret. Anything that cannot be read is shown as UNKNOWN.
const hexOf=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
const headOf=v=>typeof v==='string'&&v.length>0?v.replace(/^[A-Za-z0-9-]{1,16}:/,'').slice(0,12):'UNKNOWN';
const numOf=v=>Number.isSafeInteger(v)?String(v):'UNKNOWN';
async function stateFingerprint(){
 const U='UNKNOWN',f={build:U,localGeneration:U,localHead:U,remoteVersion:U,remoteHead:U,history:U,projection:U,fin:U};
 try{const r=await fetch(import.meta.url,{cache:'force-cache'});if(r.ok)f.build=hexOf(await crypto.subtle.digest('SHA-256',await r.arrayBuffer())).slice(0,8);}catch{}
 try{if(can('pair-diagnostic')){const d=await api('/api/md/pair-diagnostic',{});f.localGeneration=numOf(d?.localCheckpoint?.generation);f.localHead=headOf(d?.localCheckpoint?.head);f.remoteVersion=numOf(d?.verified?.version);f.remoteHead=headOf(d?.verified?.head);}}catch{}
 try{if(Array.isArray(changes))f.history=String(changes.length);}catch{}
 try{if(whole)f.projection=(await sha({actions:whole.actions,domains:whole.domains,preferences:whole.preferences?.data??null})).slice(0,12);}catch{}
 // F10-5: the ledger has its own summary hash (the screen summary above does not cover ledger values); the old hash is unchanged.
 try{const v=finFingerprintInput(whole?.fin);if(v)f.fin=(await sha(v)).slice(0,12);}catch{}
 return f;
}
function renderFingerprint(root){
 const box=section('기기 상태 값','이 기기의 상태를 짧은 값으로만 보여 줍니다(앱 코드 해시 앞 8자, 저장 번호, 이력 개수, 화면 요약 해시 앞 12자, 가계부 요약 해시 앞 12자). 읽을 수 있는 내용이나 비밀값은 들어 있지 않습니다. 기기끼리 값을 비교하세요. 읽지 못한 값은 모름입니다.');
 const out=el('div',null,'fingerprint');out.id='state-fingerprint';
 const show=async()=>{const f=await stateFingerprint();out.replaceChildren(row('앱 코드 SHA (앞 8자)',f.build),row('이 기기 저장 번호',f.localGeneration+' / '+f.localHead),row('서버 저장 번호',f.remoteVersion+' / '+f.remoteHead),row('이력 개수',f.history),row('화면 요약 해시 (앞 12자)',f.projection),row('가계부 요약 해시 (앞 12자)',f.fin));out.dataset.ready='1';};
 add(box,button('기기 상태 값 확인',()=>{show().catch(()=>{out.textContent='UNKNOWN';});}),out);add(root,box);
}
function timingText(rec){return rec&&Object.keys(rec).length?Object.entries(rec).map(([k,v])=>k+' '+Math.round(v)+'ms').join(' · '):'아직 없음';}
// V7D1: 설정 → 기록 관리. "새 시작 전 기록 보기" = 필터 전 원본(wholeRaw·이력)의 날짜·종류·개수 요약만 읽기 전용 시트로(편집·쌓기 단추 없음, 연산 0).
function renderFreshSettings(root){
 if(!wholeRaw)return;const list=beforeFreshList({whole:wholeRaw,changes},FRESH_START),drafts=(lifeSt?.freshDrafts?.length??0)+(planDrafts?.skipped?.().length??0)+hltFreshDrafts().length;
 renderFreshManage(root,{h:{el,add,button},start:FRESH_START,count:list.length,drafts,open:()=>{if(towerSheet)towerSheet(FRESH_TEXT.open,beforeFreshBody({h:{el,add,button},list,start:FRESH_START}));}});
}
function renderSettings(root){if(hltUi)add(root,hltUi.renderHealthSwitch({...hltCtx(),storage:globalThis.localStorage,onSwitch:()=>{if(!hltOn()&&view==='HEALTH')view='HOME';void render();}}));if(studyUi)add(root,studyUi.renderStudySwitch({...hltCtx(),storage:globalThis.localStorage,onSwitch:()=>{if(!studyOn()&&view==='STUDY')view='HOME';void render();}}));if(lifeUi&&lifeSt)add(root,lifeUi.renderSubjectColors(lifeCtx(),lifeSt));if(nativeOn())nativeUi.renderNativeSettings(root,{h:{el,add,button},kit:{toggle:uiKit.toggle},br:nativeBr,exams:nativeLife.lifeDefs(whole.life).exams,stackedToday:nativeStacked,bedtime:nativeBedtime,status});if(nativeOn())nativeUi.renderMirrorSettings(root,{h:{el,add,button},kit:uiKit,br:nativeBr,views:nativeMirrorViews,rerender:()=>render()});if(stateExportMod&&uiKit)stateExportMod.renderStateExport(root,{h:{el,add,button},kit:uiKit,surface:mdSurface,views:stateViews,now:()=>new Date().toISOString(),storage:lifeCtx().storage,send:stateSend});if(stateExportMod&&uiKit)stateExportMod.renderWidgetFile(root,{h:{el,add,button},kit:uiKit,surface:mdSurface,storage:globalThis.localStorage,changed:()=>void pcWidget()});if(finTxMod&&uiKit)finTxMod.renderFinTxExport(root,{h:{el,add,button},kit:uiKit,surface:mdSurface,storage:globalThis.localStorage,run:()=>finTxMod.exportFinTx(finTxCtx()),clear:()=>finTxMod.clearFinTx(finTxCtx())});if(recordsMod)add(root,recordsMod.renderRecordsDoor(hltCtx()));renderFreshSettings(root);if(statusView)add(root,statusView.renderLadderResetSlot(document));const info=section('앱 정보');add(info,row('앱 버전',String(whole.version).replace(/-.*$/,'')));const ax=whole.runtimeContract,tech=add(el('details'),el('summary','업데이트 기술 정보'));if(ax)add(tech,el('p','STORE '+ax.storeFormatVersion+' · DOMAIN '+ax.domainSchemaVersion+' · SYNC '+ax.syncProtocolVersion,'path'));add(info,tech);
 if(chimeMod&&uiKit)chimeMod.renderLiveSettings(root,{h:{el,add},kit:uiKit,storage:globalThis.localStorage,fold:liveFold(),wakeSupported:chimeCtl?.wake.supported()??false,onChange:()=>chimeCtl?.gesture()});
 if(pcToastMod&&uiKit)pcToastMod.renderToastSettings(root,{h:{el,add},kit:uiKit,surface:mdSurface,storage:globalThis.localStorage,issue:()=>pcToastRun?.issue()??brickWatch?.issue()??null,brick:chimeMod?{on:()=>chimeMod.loadLiveSettings(globalThis.localStorage,{fold:liveFold()}).brickToast,set:v=>{chimeMod.setLiveSetting('brickToast',v,globalThis.localStorage,{fold:liveFold()});}}:null});
 focusLoad();if(focusMod&&uiKit)focusMod.renderFocusSettings(root,{h:{el,add},kit:uiKit,surface:mdSurface,storage:globalThis.localStorage,onSwitch:()=>{void render();}});
 if(finderMod)finderMod.renderFinderTrust(root,{h:{el,add,button},surface:mdSurface,storage:globalThis.localStorage});
 const t=whole.settings?.timings,saveRecs=t?.save??[],saveMerged=saveRecs.length?Object.assign({},...saveRecs.slice(-2)):null;
 const diag=add(el('details'),el('summary','진단 · 마지막 열기·저장 단계 시간(1000분의 1초)'));
 add(diag,el('p','서버 열기(sync) · '+timingText(t?.open?.at(-1)),'path'),el('p','서버 저장(acquire+write) · '+timingText(saveMerged),'path'),
  el('p','저장 직전 계산(candidate) · '+(saveMerged?.candidate!==undefined?Math.round(saveMerged.candidate)+'ms':'아직 없음'),'path'),
  el('p','저장 직전 재생 캐시 상태 · '+(t?.lastSaveFullReplays!=null?(Math.round(t.lastSaveFullReplays*100)/100)+'회':'아직 없음'),'path'),
  el('p','폰 새로고침(refresh) · '+timingText(refreshTimings.at(-1)),'path'),el('p','폰 화면 그리기(render) · '+timingText(renderTimings.at(-1)),'path'),
  el('p','마지막 동기화 publish 이유 · '+(whole.settings?.lastSyncPublishReason?.length?whole.settings.lastSyncPublishReason.join(', '):'변경 없음'),'path'),
  hint('진단용 시간 숫자만입니다. 서버로 보내지 않습니다.'));
 add(info,diag);add(root,info);renderFingerprint(root);const p=section('오늘의 행동 관리','순서는 오늘과 기록 화면에 함께 반영됩니다. 비활성화해도 기록은 남습니다.');add(p,button('행동 추가',()=>editAction(null),'primary'));whole.actions.forEach((a,index)=>{const r=row(a.title,(a.active?'활성':'비활성')+' · '+domainName(a.domain)+(a.trackStreak?' · 연속 완료 표시':''));r.classList.add('settings-action');if(!a.active)r.classList.add('inactive');const up=button('위로 · '+a.title,()=>reorderAction(index,-1)),down=button('아래로 · '+a.title,()=>reorderAction(index,1));up.disabled=index===0;down.disabled=index===whole.actions.length-1;add(r,add(el('div',null,'buttons'),up,down,button('행동 편집 · '+a.title,()=>editAction(a))));add(p,r);});add(root,p);const display=section('영역 표시','옛 영역 칸의 표시 설정입니다. 숨겨도 기록은 보존됩니다.'),grid=el('div',null,'check-grid'),checks=[];for(const d of whole.domains){const cb=field(grid,d.code+' · '+d.name,'checkbox',!d.hidden);checks.push([d.code,cb]);}add(display,grid,button('영역 표시 저장',()=>perform(async()=>{await savePreferences({...whole.preferences.data,hiddenDomains:checks.filter(([,cb])=>!cb.checked).map(([code])=>code)});await refresh();status('표시 설정을 저장했습니다.');})));add(root,add(el('details',null,'card-details'),el('summary','옛 영역 표시 설정'),display));const go=button('연결 · 장치 열기',()=>navigate('DEVICES'),'secondary nav-link');go.dataset.navOnly='1';add(root,add(section('저장 위치 · 백업 · 장치','저장 위치, 동기화, 장치 추가와 분실·복구는 연결 · 장치 화면에 모았습니다.'),go));}
function renderLegacyStorage(root){const s=whole.settings;const storage=section('이 PC의 저장소');add(storage,row('앱 버전',whole.version),row('세션','잠금해제됨 · 저장 후 종료하면 비밀문구를 메모리에서 해제합니다.'),el('h3','암호화 데이터 위치'),el('p',s.dataRoot,'path'),el('h3','분리된 복구 권한 위치'),el('p',s.recoveryRoot,'path'),hint('브라우저 저장소에 생애 데이터를 저장하지 않습니다. 앱을 옮겨도 데이터 경로는 유지됩니다. V1.1 기록 후 V1 앱으로 되돌려 열지 마세요.'));add(root,storage);const backup=section('백업과 복구','백업은 파일 복사입니다. 복구 기능의 검증 완료를 뜻하지 않습니다.');add(backup,row('최근 백업',s.backup.status),s.backup.path?el('p',s.backup.path,'path'):null,hint('저장을 마치고 앱을 닫은 상태의 암호화 데이터와 복구 권한을 함께 복사합니다. 같은 디스크의 백업은 디스크 고장을 보호하지 못합니다.'),hint('BACKUP VERIFIED는 파일 검사입니다. 두 비밀문구와 실제 저장소 검증을 마친 RESTORE VERIFIED 복원본만 사용할 수 있습니다. 현재 활성 저장소는 자동 교체하지 않습니다.'),button('백업에서 복원…',showRecovery),button('백업 만들고 종료…',showBackup,'primary'));add(root,backup);}
function editAction(a){const data=a?{title:a.title,active:a.active,domain:a.domain,planId:a.planId,trackStreak:a.trackStreak}:{title:'',active:true,domain:null,planId:null,trackStreak:false};modal(a?'행동 편집':'새 행동',root=>{const title=field(root,'행동 제목','text',data.title);title.required=true;title.maxLength=100;const active=field(root,'오늘 화면에 활성화','checkbox',data.active),domain=field(root,'행동 영역','select',data.domain,[['','미분류'],...whole.domains.map(d=>[d.code,d.code+' · '+d.name])]),plan=field(root,'연결 계획','select',data.planId,[['','연결 없음'],...whole.plans.map(p=>[p.entityId,p.data.title])]),streak=field(root,'이 행동에 연속 완료 표시가 의미 있습니다','checkbox',data.trackStreak);add(root,hint('새 이름은 앞으로의 기록에 적용됩니다. 기존 기록의 이름은 바뀌지 않습니다.'));return ()=>{if(a&&drafts.has(a.actionId))throw appError('UNSAVED_ACTION_DRAFT');return entity('ACTION',a?.actionId||entityId(),{title:title.value,active:active.checked,domain:domain.value||null,planId:plan.value||null,trackStreak:streak.checked},a?.metadataHeads||[]);};});}
async function savePreferences(data){await entity('PREFERENCES','display',data,whole.preferences.heads);}
function reorderAction(index,step){void perform(async()=>{const order=whole.actions.map(a=>a.actionId);[order[index],order[index+step]]=[order[index+step],order[index]];await savePreferences({...whole.preferences.data,actionOrder:order});await refresh();status('행동 순서를 저장했습니다.');});}
function finish(message){ended=true;capability=null;streamController?.abort();drafts.clear();sealedDrafts.clear();today=null;whole=null;changes=[];wholeRaw=null;freshRows=[];$('view-content').replaceChildren();$('workspace').hidden=true;$('navigation').replaceChildren();$('navigation').hidden=true;$('save-exit').hidden=true;$('session-state').textContent='종료됨';status(message);}
function showBackup(){modal('백업 만들고 앱 종료',root=>{add(root,el('p','오늘 화면의 저장 전 입력을 저장한 뒤, 앱을 닫고 암호화 파일을 검증하여 복사합니다. 복구 권한과 백업은 비밀문구와 별도로 보관하세요.'));const confirm=field(root,'백업은 복구 검증 완료가 아님을 확인합니다','checkbox',false);confirm.required=true;return async()=>{await saveDrafts();status('암호화 백업을 만드는 중…');const result=await api('/api/backup-and-exit',{confirmed:confirm.checked});if(result.status!=='BACKUP_SAVED')throw appError('HOLD_BACKUP_RESULT');finish('백업 저장됨 · '+result.path+' · 앱이 종료되었습니다. 이 탭을 닫아도 됩니다.');};},'백업 만들고 종료');}
$('save-exit').addEventListener('click',()=>perform(async()=>{const left=typeof stackBeforeExit==='function'?await stackBeforeExit():'',saved=savedMessage();await saveDrafts();await pcWidget('close');await mdReleaseNow();status('저장을 마무리하고 종료하는 중…');const result=await api('/api/shutdown',{});if(result.status!=='CLOSED')throw appError(result.code||'HOLD_SHUTDOWN');finish(saved+left+' · 앱이 종료되었습니다. '+(mdSurface==='APP_SHELL'?'이 창을 닫아도 됩니다.':'이 탭을 닫아도 됩니다.'));}));   // V6F (MAN2 6): PC 앱 창에서는 "창"
async function nativeLaunchToken(){const bridge=window.chrome?.webview;if(!bridge)throw appError('HOLD_NATIVE_HOST_REQUIRED');return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{bridge.removeEventListener('message',onMessage);reject(appError('HOLD_LAUNCH_TIMEOUT'));},30000);function onMessage(event){if(event.data?.type!=='LB_LAUNCH')return;clearTimeout(timeout);bridge.removeEventListener('message',onMessage);const token=event.data.launch;if(!/^[a-f0-9]{64}$/.test(token))reject(appError('HOLD_LAUNCH_REQUIRED'));else resolve(token);}bridge.addEventListener('message',onMessage);bridge.postMessage('LB_READY');});}
try{if(mdBackend){const result=await api('/api/session/bootstrap',{});setup(result.state);if(result.state?.state==='UNLOCKED'){try{await refresh();status('잠금해제됨 · '+saveState().title);void mdAutoSync('open');}catch(e){fail(e);}}}else{const launch=await nativeLaunchToken();const result=await api('/api/session/bootstrap',{launch});capability=result.session;setup(result.state);void sessionStream();if(mdProfile&&result.state?.state==='UNLOCKED'){try{await refresh();}catch(e){fail(e);}}}}catch(error){ended=true;status('LIFE BRICK 앱을 다시 열어 주세요. '+(error.code||'HOLD_CONNECTION'),true);lock(false);}

// Recovery has a separate result protocol and never uses the write-command retry route.
function showRecovery(){
 const dialog=el('dialog'),form=el('form'),info=el('div'),out=el('p', '', 'path');out.setAttribute('role','status');
 add(form,el('h2','백업에서 검증된 복원본 만들기'),hint('현재 활성 저장소는 그대로 유지됩니다. 기존 잠금해제 비밀문구와 별도로 보관한 복구 비밀문구가 모두 필요합니다. 비밀문구 재설정 기능이 아닙니다.'));
 const backup=field(form,'백업 폴더의 전체 경로','text',whole?.settings?.backup?.path||'');backup.required=true;
 let inspected=null,pendingId=null,working=false;
 const target=field(form,'새 복원 대상 폴더의 전체 경로','text','');target.required=true;
 add(form,hint('존재하는 이 PC의 부모 폴더 아래에 아직 없는 새 폴더 이름을 지정하세요. 이미 있는 빈 폴더도 재사용하지 않습니다. 원본·백업·앱 설치 폴더 안은 사용할 수 없습니다.'));
 const recoverySecret=field(form,'백업의 복구 비밀문구','password',''),unlockSecret=field(form,'기존 잠금해제 비밀문구','password','');
 for(const input of [recoverySecret,unlockSecret]){input.required=true;input.minLength=12;input.maxLength=1024;input.autocomplete='new-password';}
 const confirmed=field(form,'표시된 백업 시점의 새 복원본을 만들며 현재 저장소를 바꾸지 않음을 확인합니다','checkbox',false);confirmed.required=true;
 const restore=el('button','새 대상에 복원 및 최종 검증','primary');restore.type='submit';restore.disabled=true;
 const controls=()=>{for(const n of form.querySelectorAll('input,button'))n.disabled=working;restore.disabled=working||!inspected||!!pendingId;};
 const displayResult=r=>{if(r.status==='RESTORE_VERIFIED'){out.textContent='RESTORE VERIFIED · RESTORED COPY READY\n검증된 복원본: '+r.dataRoot+'\nCURRENT ACTIVE VAULT 변경 없음 · 자동 전환하지 않았습니다.';inspected=null;}else if(r.status==='HOLD'){out.textContent=r.code+' · 복원하지 못했습니다. '+(r.failedStagingPreserved?'중단 상태를 보존했습니다: '+r.targetPath:'대상 쓰기 전 거부되었습니다.');inspected=null;pendingId=null;}else{out.textContent='결과 확인 필요 · '+r.status+' · 새 요청으로 반복하지 마세요. 대상 파일을 유지하고 결과 확인을 누르세요.';}};
 const inspect=button('백업 파일 검사',async()=>{if(working||pendingId)return;working=true;controls();out.textContent='백업 파일 검사 중…';try{inspected=await api('/api/recovery/inspect',{backupPath:backup.value});info.replaceChildren(el('h3','BACKUP VERIFIED · 아직 RESTORE VERIFIED 아님'),el('p','백업 날짜: '+inspected.createdAt),el('p','Vault: '+inspected.vaultId,'path'),el('p','체크포인트: '+inspected.checkpoint.generation+' / '+inspected.checkpoint.head,'path'),hint('선택한 백업 시점을 복원합니다. 원본이 없으면 이후 기록의 존재 여부를 알 수 없습니다. 날짜는 기존 서명 없는 manifest 표시이며, 암호화된 내용과 권한은 복원 단계에서 검증합니다.'));out.textContent='백업 정보를 확인한 뒤 두 비밀문구와 새 대상을 입력하세요.';}catch(e){inspected=null;out.textContent=e.code||'HOLD_CONNECTION';}finally{working=false;controls();}});
 const query=button('복원 결과 확인',async()=>{if(working||!pendingId)return;working=true;controls();try{displayResult(await api('/api/recovery/result/'+pendingId));}catch(e){out.textContent=(e.code||'HOLD_CONNECTION')+' · 결과 모름. 새 요청으로 반복하지 마세요.';}finally{working=false;controls();}});
 const close=button('복구 화면 닫기',()=>{if(working)return;recoverySecret.value='';unlockSecret.value='';dialog.close();dialog.remove();});
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!working)close.click();});
 backup.addEventListener('input',()=>{inspected=null;info.replaceChildren();controls();});
 form.addEventListener('submit',async e=>{e.preventDefault();if(working||!inspected||pendingId)return;working=true;pendingId=uid();controls();out.textContent='권한 확인 → 새 대상 복원 → 최종 검증 중…';
  const body={requestId:pendingId,inspectionId:inspected.inspectionId,targetPath:target.value,unlockSecret:unlockSecret.value,recoverySecret:recoverySecret.value,confirmed:confirmed.checked};unlockSecret.value='';recoverySecret.value='';
  try{displayResult(await api('/api/recovery/restore',body));}catch(e){out.textContent=(e.code||'HOLD_CONNECTION')+' · 복원 결과 모름. 새 요청으로 반복하지 말고 결과 확인을 누르세요.';}finally{body.unlockSecret=null;body.recoverySecret=null;working=false;controls();}
 });
 add(form,info,add(el('div',null,'buttons'),inspect,restore,query,close),out);add(dialog,form);document.body.append(dialog);dialog.showModal();
}
// B40: ui-kit.mjs가 쓰는 DOM 헬퍼. 정의는 여기 한 곳.
export {el,add,button};
