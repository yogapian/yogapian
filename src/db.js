import { createClient } from "@supabase/supabase-js";
import { TODAY_STR } from "./constants.js";

export const _supabase = createClient(
  "https://bgrgmrxlahtrpgrnigid.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmdtcnhsYWh0cnBncm5pZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjUzOTQsImV4cCI6MjA4OTU0MTM5NH0.-HRgZaFoWuXWizdHe4ANaRfuo3QCQlP7aYUasofNj4s"
);

// camelCase ↔ snake_case 변환 헬퍼
export function toSnake(m) {
  return {
    id:               m.id,
    gender:           m.gender,
    name:             m.name,
    admin_nickname:   m.adminNickname ?? "",
    admin_note:       m.adminNote ?? "",
    phone4:           m.phone4 ?? "",
    phone:            m.phone ?? "",
    manual_status:    m.manualStatus ?? null,
    first_date:       m.firstDate ?? null,
    member_type:      m.memberType ?? null,
    is_new:           m.isNew ?? false,
    total:            m.total ?? 0,
    start_date:       m.startDate ?? null,
    end_date:         m.endDate ?? null,
    extension_days:   m.extensionDays ?? 0,
    holding_days:     m.holdingDays ?? 0,
    holding:          m.holding ?? null,
    renewal_history:  m.renewalHistory ?? [],
    holding_history:  m.holdingHistory ?? [],  // 완료된 홀딩 이력 [{startDate,endDate,workdays}]
    updated_at:       new Date().toISOString(),
  };
}
export function fromSnakeMember(r) {
  return {
    id:             r.id,
    gender:         r.gender,
    name:           r.name,
    adminNickname:  r.admin_nickname ?? "",
    adminNote:      r.admin_note ?? "",
    phone4:         r.phone4 ?? "",
    phone:          r.phone ?? "",
    manualStatus:   r.manual_status ?? null,
    firstDate:      r.first_date ?? null,
    memberType:     r.member_type ?? null,
    isNew:          r.is_new ?? false,
    total:          r.total ?? 0,
    startDate:      r.start_date ?? null,
    endDate:        r.end_date ?? null,
    extensionDays:  r.extension_days ?? 0,
    holdingDays:    r.holding_days ?? 0,
    holding:        r.holding ?? null,
    renewalHistory: r.renewal_history ?? [],
    holdingHistory: r.holding_history ?? [],  // 완료된 홀딩 이력
  };
}
export function bookingToSnake(b) {
  return {
    id:               b.id,
    date:             b.date,
    member_id:        b.memberId ?? null,
    oneday_name:      b.onedayName ?? null,
    time_slot:        b.timeSlot,
    walk_in:          b.walkIn ?? false,
    status:           b.status,
    confirmed_attend: b.confirmedAttend ?? null,
    cancel_note:      b.cancelNote ?? "",
    cancelled_by:     b.cancelledBy ?? "",
    updated_at:       new Date().toISOString(),
  };
}
export function fromSnakeBooking(r) {
  return {
    id:              r.id,
    date:            r.date,
    memberId:        r.member_id ?? null,
    onedayName:      r.oneday_name ?? null,
    timeSlot:        r.time_slot,
    walkIn:          r.walk_in ?? false,
    status:          r.status,
    confirmedAttend: r.confirmed_attend ?? null,
    cancelNote:      r.cancel_note ?? "",
    cancelledBy:     r.cancelled_by ?? "",
  };
}
export function noticeToSnake(n) {
  return {
    id:               n.id,
    title:            n.title,
    content:          n.content ?? "",
    pinned:           n.pinned ?? false,
    created_at:       n.createdAt ?? TODAY_STR,
    target_member_id: n.targetMemberId ?? null,
    updated_at:       new Date().toISOString(),
  };
}
export function fromSnakeNotice(r) {
  return {
    id:             r.id,
    title:          r.title,
    content:        r.content ?? "",
    pinned:         r.pinned ?? false,
    createdAt:      r.created_at ?? TODAY_STR,
    targetMemberId: r.target_member_id ?? null,
  };
}
export function specialToSnake(s) {
  return {
    id:            s.id,
    date:          s.date,
    label:         s.label ?? "",
    type:          s.type ?? null,
    fee_note:      s.feeNote ?? "",
    active_slots:  s.activeSlots ?? [],
    custom_times:  s.customTimes ?? {},
    slot_capacity: s.slotCapacity ?? {},
    updated_at:    new Date().toISOString(),
  };
}
export function fromSnakeSpecial(r) {
  return {
    id:           r.id,
    date:         r.date,
    label:        r.label ?? "",
    type:         r.type ?? null,
    feeNote:      r.fee_note ?? "",
    activeSlots:  r.active_slots ?? [],
    customTimes:  r.custom_times ?? {},
    slotCapacity: r.slot_capacity ?? {},
  };
}
export function closureToSnake(c) {
  return {
    id:                 c.id,
    date:               c.date,
    time_slot:          c.timeSlot ?? null,
    reason:             c.reason ?? "",
    closure_type:       c.closureType ?? null,
    extension_override: c.extensionOverride ?? 0,
    updated_at:         new Date().toISOString(),
  };
}
export function fromSnakeClosure(r) {
  return {
    id:                r.id,
    date:              r.date,
    timeSlot:          r.time_slot ?? null,
    reason:            r.reason ?? "",
    closureType:       r.closure_type ?? null,
    extensionOverride: r.extension_override ?? 0,
  };
}

// ---------- DB 직접 조작 함수들 ----------

export async function dbLoadAll() {
  // ⚠️ Supabase JS의 기본 row limit = 1000. 초과 시 최신 데이터가 잘림 → limit 명시 필수
  const [mRes, bRes, nRes, sRes, cRes] = await Promise.all([
    _supabase.from("members").select("*").order("id").limit(2000),
    _supabase.from("bookings").select("*").order("id").limit(10000),
    _supabase.from("notices").select("*").order("id", { ascending: false }).limit(500),
    _supabase.from("special_schedules").select("*").order("date").limit(2000),
    _supabase.from("closures").select("*").order("date").limit(2000),
  ]);
  if (bRes.data?.length >= 10000) console.warn("bookings 10000개 초과 — limit 상향 필요");
  let scheduleTemplate = {};
  try {
    const tmplRes = await _supabase.from("appdata").select("value").eq("key", "schedule_template").maybeSingle();
    if (tmplRes.data?.value) {
      scheduleTemplate = typeof tmplRes.data.value === "string"
        ? JSON.parse(tmplRes.data.value)
        : tmplRes.data.value;
    }
  } catch(e) { console.warn("schedule_template load error:", e); }
  return {
    members:          (mRes.data || []).map(fromSnakeMember),
    bookings:         (bRes.data || []).map(fromSnakeBooking),
    notices:          (nRes.data || []).map(fromSnakeNotice),
    specialSchedules: (sRes.data || []).map(fromSnakeSpecial),
    closures:         (cRes.data || []).map(fromSnakeClosure),
    scheduleTemplate,
  };
}

export async function dbUpsertMember(m) {
  const { error } = await _supabase.from("members").upsert(toSnake(m));
  if (error) console.error("member upsert:", error);
}
export async function dbUpsertBooking(b) {
  const { error } = await _supabase.from("bookings").upsert(bookingToSnake(b));
  if (error) console.error("booking upsert:", error);
}
export async function dbUpsertNotice(n) {
  const { error } = await _supabase.from("notices").upsert(noticeToSnake(n));
  if (error) console.error("notice upsert:", error);
}
export async function dbUpsertSpecial(s) {
  const { error } = await _supabase.from("special_schedules").upsert(specialToSnake(s));
  if (error) console.error("special upsert:", error);
}
export async function dbUpsertClosure(c) {
  const { error } = await _supabase.from("closures").upsert(closureToSnake(c));
  if (error) console.error("closure upsert:", error);
}

export async function dbDeleteBooking(id) {
  const { error } = await _supabase.from("bookings").delete().eq("id", id);
  if (error) console.error("booking delete:", error);
}
export async function dbDeleteNotice(id) {
  const { error } = await _supabase.from("notices").delete().eq("id", id);
  if (error) console.error("notice delete:", error);
}
export async function dbDeleteSpecial(id) {
  const { error } = await _supabase.from("special_schedules").delete().eq("id", id);
  if (error) console.error("special delete:", error);
}
export async function dbDeleteClosure(id) {
  const { error } = await _supabase.from("closures").delete().eq("id", id);
  if (error) console.error("closure delete:", error);
}

// 스케줄 템플릿 저장 (appdata 테이블)
export async function saveScheduleTemplate(template) {
  try {
    await _supabase.from("appdata").upsert({
      key: "schedule_template",
      value: JSON.stringify(template),
      updated_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("schedule_template save:", e); }
}

// 자동로그인 (appdata 테이블)
export async function saveAutoLogin(memberId) {
  try {
    await _supabase.from("appdata").upsert({
      key: "yogapian_autologin",
      value: JSON.stringify({ memberId }),
      updated_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("autologin save:", e); }
}
export async function loadAutoLogin() {
  try {
    const { data } = await _supabase.from("appdata")
      .select("value").eq("key", "yogapian_autologin").maybeSingle();
    return data ? JSON.parse(data.value) : null;
  } catch(e) { return null; }
}
