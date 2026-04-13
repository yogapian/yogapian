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

// activePeriodTotal: targetDate 기준 현재 활성 기수의 total 반환
// — 날짜 범위 기반으로 해당 날짜가 속한 기수의 총 횟수를 반환
// — 기수 중복(갱신 겹침) 시 최신 기수 우선
export function activePeriodTotal(member, targetDate) {
  const rh = [...(member.renewalHistory || [])].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  for(let i = rh.length-1; i >= 0; i--) {
    if(targetDate >= rh[i].startDate && targetDate <= rh[i].endDate) return rh[i].total;
  }
  if(rh.length > 0) return rh[rh.length-1].total;
  return member.total;
}

// usedAsOf: targetDate 기준 현재 활성 기수에서 사용한 횟수 반환
// ── 핵심 알고리즘: 기수별 정원(total) 기반 이월 배분 ──────────────────────────
// 세션을 날짜·ID 순으로 정렬 후 각 기수 정원을 순서대로 채움.
// 기수 정원이 소진되면 초과 세션은 다음 기수로 이월 (날짜 무관).
// → 같은 날 오전에 기수 소진 후 갱신 등록 시 오후 수업은 다음 기수에서 차감됨.
export function usedAsOf(memberId, targetDate, bookings, members){
  const member = members ? members.find(m=>m.id===memberId) : null;
  if(!member) return 0;
  // 기수 이력을 시작일순 정렬 (일반적으로 이미 정렬되어 있음)
  const rh=[...(member.renewalHistory||[])].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  if(!rh.length) return 0;

  // targetDate 기준 활성 기수 인덱스 (역순 탐색 → 중복 범위 시 최신 기수 우선)
  let activePeriodIdx = rh.length-1;
  for(let i=rh.length-1;i>=0;i--){
    if(targetDate>=rh[i].startDate&&targetDate<=rh[i].endDate){activePeriodIdx=i;break;}
  }

  // attended 세션을 날짜·ID 순 정렬 (같은 날 오전→오후 순서 보장)
  const sessions=bookings
    .filter(b=>b.memberId===memberId&&b.status==="attended"&&b.date<=targetDate)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);

  const periodUsed=new Array(rh.length).fill(0);
  for(const s of sessions){
    // 이 세션의 기준 기수: session.date 이전에 시작한 가장 최신 기수
    let pi=-1;
    for(let i=rh.length-1;i>=0;i--){if(s.date>=rh[i].startDate){pi=i;break;}}
    if(pi===-1) continue; // 모든 기수보다 이전 날짜 → 제외
    // 기수 정원 초과 시 다음 기수로 이월 (사전 갱신으로 등록된 기수 포함)
    while(pi<rh.length-1&&periodUsed[pi]>=rh[pi].total) pi++;
    periodUsed[pi]++;
  }
  return periodUsed[activePeriodIdx];
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
    const used = usedAsOf(m.id, TODAY_STR, bookings, [m]);
    if(Math.max(0, activePeriodTotal(m, TODAY_STR) - used) === 0) return "renew"; // 현재 기수 잔여 0이면 갱신 필요
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
  return scheduleTemplate?.[dow]?.[slotKey] ?? 10;
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
