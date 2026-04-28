import { TODAY, TODAY_STR } from "./constants.js";
import { parseLocal, addDays, wdInMonth } from "./utils.js";

// 3개월권 휴강 연장일수: startDate~endDate 사이 전체휴강 평일수
export function getClosureExtDays(m, closures=[]) {
  // closureType: regular=연장없음, regular_ext/special=extensionOverride만큼 연장
  let total = 0;
  for(const cl of closures) {
    if(cl.timeSlot) continue; // 전체휴강만
    if(cl.date < m.startDate || cl.date > m.endDate) continue; // 기간 밖
    const ov = cl.extensionOverride;
    if(!ov) continue; // 0 또는 falsy → 연장없음
    total += ov;
  }
  return total;
}

export const effEnd=(m, closures=[])=>{
  const closureExt = getClosureExtDays(m, closures);
  // 진행 중인 홀딩 경과일 동적 포함 — 홀딩 기간 제한 없으므로 endDate 초과해도 expired 처리 안 되게
  const activeHoldDays = m.holding ? holdingElapsed(m.holding) : 0;
  const total = closureExt + (m.extensionDays||0) + (m.holdingDays||0) + activeHoldDays;
  return total > 0 ? addDays(m.endDate, total) : m.endDate;
};

export const calcDL=(m, closures=[])=>{
  const e = parseLocal(effEnd(m, closures));
  return Math.ceil((e-TODAY)/86400000);
};

export function calc3MonthEnd(startStr, closures=[]) {
  // 캘린더 3개월 후 날짜 반환 (60평일 방식 → 캘린더 방식으로 변경)
  // closures 파라미터는 하위 호환 유지용 — 휴강 연장은 effEnd의 getClosureExtDays가 별도 처리
  const d = parseLocal(startStr);
  const y = d.getFullYear(), mo = d.getMonth() + 3, day = d.getDate();
  // 말일 초과 처리: 예) 1/31 + 3개월 → 4/30 (5/1 아님)
  const lastDay = new Date(y, mo + 1, 0).getDate();
  const r = new Date(y, mo, Math.min(day, lastDay));
  return `${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,'0')}-${String(r.getDate()).padStart(2,'0')}`;
}

export function holdingElapsed(holding) {
  if(!holding || !holding.startDate) return 0;
  return Math.max(0, Math.ceil((TODAY - parseLocal(holding.startDate)) / 86400000));
}

export function get3MonthsInfo(s){
  const st=parseLocal(s);
  return Array.from({length:3},(_,i)=>{
    const rm=st.getMonth()+i,y=st.getFullYear()+Math.floor(rm/12),mo=rm%12,wd=wdInMonth(y,mo);
    return{year:y,month:mo,monthName:`${y}.${String(mo+1).padStart(2,"0")}`,workingDays:wd,surplus:Math.max(0,wd-20)};
  });
}

// ── 기수 배분 공통 헬퍼 ────────────────────────────────────────────────────────
// 세션을 날짜·ID 순 정렬 후 기수별 정원을 채우는 이월 배분 알고리즘.
// 현재 기수 소진 시 다음 기수로 이월 (날짜 무관 — 사전 갱신 포함).
// 반환: { used, total } — targetDate 기준 유효 기수의 사용횟수와 총횟수
function _effectivePeriod(memberId, targetDate, bookings, members){
  const member = members ? members.find(m=>m.id===memberId) : null;
  if(!member) return {used:0, total:0};
  const rh=[...(member.renewalHistory||[])].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  if(!rh.length) return {used:0, total:member.total};

  // 날짜 기준 활성 기수 인덱스 (역순 → 중복 범위 시 최신 기수 우선)
  let ai=rh.length-1;
  for(let i=rh.length-1;i>=0;i--){if(targetDate>=rh[i].startDate&&targetDate<=rh[i].endDate){ai=i;break;}}

  // attended 세션 날짜·ID 순 정렬 (같은 날 오전→오후 순서 보장)
  const sessions=bookings
    .filter(b=>b.memberId===memberId&&b.status==="attended"&&b.date<=targetDate)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);

  const pu=new Array(rh.length).fill(0);
  for(const s of sessions){
    let pi=-1;
    for(let i=rh.length-1;i>=0;i--){if(s.date>=rh[i].startDate){pi=i;break;}}
    if(pi===-1) continue;
    // 기수 정원 초과 시 다음 기수로 이월
    while(pi<rh.length-1&&pu[pi]>=rh[pi].total) pi++;
    pu[pi]++;
  }
  // 날짜 기준 기수가 소진됐고 다음 기수가 등록된 경우 → 다음 기수로 전환하여 표시
  if(ai<rh.length-1&&pu[ai]>=rh[ai].total) ai++;
  return {used:pu[ai], total:rh[ai].total};
}

// usedAsOf: targetDate 기준 유효 기수에서 사용한 횟수
export function usedAsOf(memberId, targetDate, bookings, members){
  return _effectivePeriod(memberId, targetDate, bookings, members).used;
}

// activePeriodTotal: targetDate 기준 유효 기수의 총 횟수
// bookings 제공 시 이월 배분 기반 정확한 계산 (사전 갱신 포함)
// bookings 미제공 시 날짜 범위 기반 폴백
export function activePeriodTotal(member, targetDate, bookings=[], members=null){
  if(bookings.length){
    return _effectivePeriod(member.id, targetDate, bookings, members||[member]).total;
  }
  // 폴백: 날짜 범위 기반 (bookings 없는 경우)
  const rh=[...(member.renewalHistory||[])].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  for(let i=rh.length-1;i>=0;i--){if(targetDate>=rh[i].startDate&&targetDate<=rh[i].endDate)return rh[i].total;}
  return rh.length?rh[rh.length-1].total:member.total;
}

export const getStatus=(m, closures=[])=>{
  const dl=calcDL(m, closures);
  if(m.holding)return"hold";
  if(dl<0)return"off";
  return"on";
};

// 관리자 UI용 표시 상태 (RENEW 포함, manualStatus 우선)
export function getDisplayStatus(m, closures=[], bookings=[]) {
  if(m.manualStatus) return m.manualStatus;
  if(m.holding) return "hold";
  const dl = calcDL(m, closures);
  if(dl >= 0) {
    // 현재 기수 시작일 계산 — 갱신 전 renewalPending은 무시하기 위해 기수 내 날짜만 체크
    const rh = m.renewalHistory || [];
    let periodStart = m.startDate || "";
    // 역순 순회: 기수 중복 시 최신 기수(startDate 큰 것) 우선 적용
    for(let i=rh.length-1;i>=0;i--){const r=rh[i];if(TODAY_STR>=r.startDate&&TODAY_STR<=r.endDate){periodStart=r.startDate;break;}}
    if(bookings.some(b=>b.memberId===m.id&&b.renewalPending&&b.date>=periodStart)) return "renew";
    const {used, total} = _effectivePeriod(m.id, TODAY_STR, bookings, [m]);
    if(Math.max(0, total - used) === 0) return "renew"; // 유효 기수 잔여 0이면 갱신 필요
    return "on";
  }
  if(dl >= -30) return "renew"; // 만료 후 30일 이내
  return "off";
}

export function getSlotCapacity(date, slotKey, specialSchedules, scheduleTemplate) {
  const special = specialSchedules.find(s => s.date === date);
  if (special?.slotCapacity?.[slotKey] != null) {
    return special.slotCapacity[slotKey];
  }
  const dow = new Date(date + "T00:00:00").getDay();
  // 새 배열 형식: [{slotKey, days, capacity, startDate, endDate}]
  if (Array.isArray(scheduleTemplate)) {
    const entry = scheduleTemplate.find(e =>
      e.slotKey === slotKey && e.days.includes(dow) &&
      (!e.startDate || date >= e.startDate) &&
      (!e.endDate || date <= e.endDate)
    );
    return entry?.capacity ?? 10;
  }
  // 구 객체 형식: {dow: {slotKey: {capacity}}}
  return scheduleTemplate?.[dow]?.[slotKey]?.capacity ?? 10;
}

export function periodRecs(member,bookings,r){
  return bookings.filter(function(b){
    return b.memberId===member.id&&b.status==="attended"&&b.date>=r.startDate&&b.date<=r.endDate;
  }).sort(function(x,y){return y.date.localeCompare(x.date);});
}
export function currentRecs(member,bookings){
  return bookings.filter(function(b){
    return b.memberId===member.id&&b.status==="attended"&&b.date>=member.startDate;
  }).sort(function(x,y){return y.date.localeCompare(x.date);});
}
