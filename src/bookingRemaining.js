import { TIME_SLOTS } from "./constants.js";
import { parseLocal } from "./utils.js";
import { activePeriodTotal, usedAsOf } from "./memberCalc.js";

// 예약표 전용 예상 잔여: 해당 수업까지 예약을 사용한 것으로 계산한다.
// 복사본만 전달하므로 실제 출석 상태·회원권 차감에는 영향을 주지 않는다.
export function bookingRemaining(member, booking, bookings, specialSchedules=[], scheduleTemplate={}) {
  if (booking.renewalPending || !["reserved", "attended"].includes(booking.status)) return null;
  const timeOf = b => {
    const special = specialSchedules.find(s => s.date === b.date);
    const entry = Array.isArray(scheduleTemplate) ? scheduleTemplate.find(e =>
      e.slotKey === b.timeSlot && e.days.includes(parseLocal(b.date).getDay()) &&
      (!e.startDate || b.date >= e.startDate) && (!e.endDate || b.date <= e.endDate)
    ) : scheduleTemplate?.[parseLocal(b.date).getDay()]?.[b.timeSlot];
    return special?.customTimes?.[b.timeSlot] || entry?.time || TIME_SLOTS.find(s => s.key === b.timeSlot)?.time || "";
  };
  const compare = (a, b) => a.date.localeCompare(b.date) || timeOf(a).localeCompare(timeOf(b)) || a.id - b.id;
  const projected = bookings.filter(b => b.memberId === member.id && compare(b, booking) <= 0)
    .filter(b => b.status === "attended" || (b.status === "reserved" && !b.renewalPending))
    .map(b => ({ ...b, status: "attended" }));
  return Math.max(0, activePeriodTotal(member, booking.date, projected, [member]) -
    usedAsOf(member.id, booking.date, projected, [member]));
}
