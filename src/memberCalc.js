import { TODAY, TODAY_STR } from "./constants.js";
import { parseLocal, addDays, addWeekdays, countWorkdays, wdInMonth } from "./utils.js";

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
  const closureExt = getClosureExtDays(m, closures); // 별도휴강: 캘린더 일수 연장
  // 홀딩 연장: 평일 기준 — addWeekdays로 주말 건너뜀 (표시는 캘린더, 연장은 평일)
  const activeHoldWorkdays = m.holding ? holdingWorkdays(m.holding) : 0;
  const holdExt = (m.extensionDays||0) + (m.holdingDays||0) + activeHoldWorkdays;
  let result = m.endDate;
  if(closureExt > 0) result = addDays(result, closureExt);
  if(holdExt > 0) result = addWeekdays(result, holdExt);
  return result;
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

// 표시용: 주말 포함 캘린더 경과일 (사용자에게 보이는 숫자)
export function holdingElapsed(holding) {
  if(!holding || !holding.startDate) return 0;
  return Math.max(0, Math.ceil((TODAY - parseLocal(holding.startDate)) / 86400000));
}
// 연장 계산용: 주말 제외 평일 경과일 (종료일 연장에 반영할 실제 수업일수)
function holdingWorkdays(holding) {
  if(!holding || !holding.startDate) return 0;
  const yesterday = new Date(TODAY.getTime() - 86400000);
  if(parseLocal(holding.startDate) > yesterday) return 0;
  const ys=`${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
  // 시작일 당일은 수업 가능 → 다음날(start+1)부터 집계
  return countWorkdays(addDays(holding.startDate, 1), ys);
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
// null startDate(미정 기수)는 항상 배열 끝으로 정렬
const _rhSort=(a,b)=>{if(!a.startDate)return 1;if(!b.startDate)return -1;return a.startDate.localeCompare(b.startDate);};

function _effectivePeriod(memberId, targetDate, bookings, members){
  const member = members ? members.find(m=>m.id===memberId) : null;
  if(!member) return {used:0, total:0};
  // 미정 기수(startDate null)는 끝에 정렬 — 날짜 비교 시 충돌 방지
  const rh=[...(member.renewalHistory||[])].sort(_rhSort);
  if(!rh.length) return {used:0, total:member.total};

  // 날짜 기준 활성 기수 인덱스 — null startDate/endDate 기수는 날짜 범위 검색에서 제외
  let ai=rh.length-1;
  let found=false;
  for(let i=rh.length-1;i>=0;i--){if(rh[i].startDate&&rh[i].endDate&&targetDate>=rh[i].startDate&&targetDate<=rh[i].endDate){ai=i;found=true;break;}}
  // 갭 기간이면 오늘 이전에 끝난 마지막 기수 사용
  if(!found){for(let i=rh.length-1;i>=0;i--){if(rh[i].endDate&&targetDate>rh[i].endDate){ai=i;break;}}}

  // attended 세션 날짜·ID 순 정렬 (같은 날 오전→오후 순서 보장)
  const sessions=bookings
    .filter(b=>b.memberId===memberId&&b.status==="attended"&&b.date<=targetDate)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);

  const pu=new Array(rh.length).fill(0);
  for(const s of sessions){
    let pi=-1;
    // null startDate 기수는 날짜 직접 배정 불가 — 스필오버로만 채워짐
    for(let i=rh.length-1;i>=0;i--){if(rh[i].startDate&&s.date>=rh[i].startDate){pi=i;break;}}
    if(pi===-1) continue;
    // 기수 정원 초과 시 다음 기수로 이월 (미정 기수 포함)
    while(pi<rh.length-1&&pu[pi]>=rh[pi].total) pi++;
    pu[pi]++;
  }
  // 기수 소진 시 다음 기수로 전환 — 단, 현재 기수 기간이 아직 남아있으면 전환 안 함
  // (기간 내 마지막 회차 사용 → 잔여 0 표시, 다음기수로 이동은 종료일 이후에만)
  if(ai<rh.length-1&&pu[ai]>=rh[ai].total&&(!rh[ai].endDate||targetDate>rh[ai].endDate)) ai++;
  return {used:pu[ai], total:rh[ai].total, periodIndex:ai, rh};
}

// getActivePeriod: 카드 표시용 활성 기수 객체 반환
// 스필오버 결과를 우선 사용 — 미정 기수(startDate null)가 활성이면 그대로 반환
export function getActivePeriod(member, targetDate, bookings){
  const rh=[...(member.renewalHistory||[])].sort(_rhSort);
  if(!rh.length) return null;
  // 스필오버 포함 활성 기수 확보
  const result=_effectivePeriod(member.id,targetDate,bookings,[member]);
  const spillover=result.rh?.[result.periodIndex];
  // 1) 오늘을 포함하는 기수 — 소진 시 스필오버 결과 우선
  for(let i=rh.length-1;i>=0;i--){
    if(rh[i].startDate&&rh[i].endDate&&targetDate>=rh[i].startDate&&targetDate<=rh[i].endDate){
      return spillover||rh[i];
    }
  }
  // 2) 갭 기간: 가장 가까운 미래 기수 (null startDate 제외 — 미정은 날짜 없음)
  for(let i=0;i<rh.length;i++){if(rh[i].startDate&&rh[i].startDate>targetDate)return rh[i];}
  // 3) 과거 기수만 있을 때 — 스필오버 결과 우선 (미정 기수로 이월됐을 수 있음)
  for(let i=rh.length-1;i>=0;i--){if(rh[i].endDate&&targetDate>rh[i].endDate)return spillover||rh[i];}
  return spillover||rh[rh.length-1];
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
  const rh=[...(member.renewalHistory||[])].sort(_rhSort);
  for(let i=rh.length-1;i>=0;i--){if(rh[i].startDate&&rh[i].endDate&&targetDate>=rh[i].startDate&&targetDate<=rh[i].endDate)return rh[i].total;}
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
  // 미정 or 미래 기수가 있으면 현재 기수 만료·잔여 0 무관하게 정상으로 표시
  if((m.renewalHistory||[]).some(r=>r.startDate===null||r.startDate>TODAY_STR)) return "on";
  const dl = calcDL(m, closures);
  if(dl >= 0) {
    // 현재 기수 시작일 계산 — 갱신 전 renewalPending은 무시하기 위해 기수 내 날짜만 체크
    const rh = m.renewalHistory || [];
    let periodStart = m.startDate || "";
    // 역순 순회: 기수 중복 시 최신 기수(startDate 큰 것) 우선 적용
    for(let i=rh.length-1;i>=0;i--){const r=rh[i];if(r.startDate&&r.endDate&&TODAY_STR>=r.startDate&&TODAY_STR<=r.endDate){periodStart=r.startDate;break;}}
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
