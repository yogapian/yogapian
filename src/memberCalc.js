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
  const total = closureExt + (m.extensionDays||0) + (m.holdingDays||0);
  return total > 0 ? addDays(m.endDate, total) : m.endDate;
};

export const calcDL=(m, closures=[])=>{
  const e = parseLocal(effEnd(m, closures));
  return Math.ceil((e-TODAY)/86400000);
};

export function calc3MonthEnd(startStr, closures=[]) {
  const closedDates = new Set(closures.filter(cl=>!cl.timeSlot).map(cl=>cl.date));
  let workdays = 0, cur = parseLocal(startStr);
  while(workdays < 60) {
    const dow = cur.getDay();
    const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    if(dow !== 0 && dow !== 6 && !closedDates.has(ds)) workdays++;
    cur.setDate(cur.getDate()+1);
  }
  cur.setDate(cur.getDate()-1);
  return `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
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
  for(let ri=0;ri<rh.length;ri++){const r=rh[ri];if(targetDate>=r.startDate&&targetDate<=r.endDate){startDate=r.startDate;break;}}

  let cnt=0;
  for(let i=0;i<bookings.length;i++){
    const b=bookings[i];
    if(b.memberId===memberId &&
       (b.status==="attended" || b.status==="reserved") &&
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
