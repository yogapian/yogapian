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

export function usedAsOf(memberId, targetDate, bookings, members){
  const member = members ? members.find(m=>m.id===memberId) : null;
  if(!member) return 0;
  const rh=member.renewalHistory||[];
  let startDate=member.startDate;
  // 역순 순회: 기수 중복 시 최신 기수(startDate 큰 것) 우선 적용
  let found=false;
  for(let ri=rh.length-1;ri>=0;ri--){const r=rh[ri];if(targetDate>=r.startDate&&targetDate<=r.endDate){startDate=r.startDate;found=true;break;}}
  // 해당 날짜가 모든 기수 범위 밖(홀딩 중 기간 만료 등): 가장 최신 기수 startDate 사용
  // — 폴백이 member.startDate이면 전체 이력을 다 카운트해 잔여횟수가 0이 되는 버그 방지
  if(!found && rh.length>0) startDate=rh[rh.length-1].startDate;

  let cnt=0;
  for(let i=0;i<bookings.length;i++){
    const b=bookings[i];
    if(b.memberId===memberId &&
       b.status==="attended" &&
       b.date>=startDate && b.date<=targetDate) {
      cnt++;
    }
  }
  return cnt;
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
    if(Math.max(0, m.total - used) === 0) return "renew"; // 종료일 남았는데 잔여 0
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
