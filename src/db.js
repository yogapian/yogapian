import { createClient } from "@supabase/supabase-js";
import { TODAY_STR } from "./constants.js";

export const _supabase = createClient(
  "https://bgrgmrxlahtrpgrnigid.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmdtcnhsYWh0cnBncm5pZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjUzOTQsImV4cCI6MjA4OTU0MTM5NH0.-HRgZaFoWuXWizdHe4ANaRfuo3QCQlP7aYUasofNj4s"
);

// ─── 관리자 알림 브로드캐스트 ────────────────────────────────────────────────
// 회원이 예약/취소 시 이 채널로 메시지를 전송 → 관리자 앱이 수신하여 🔔 알림 표시
// postgres_changes 대신 Broadcast 사용 (postgres_changes는 WAL 설정 의존)
const _adminNotifCh = _supabase.channel("yogapian-admin-notif");
_adminNotifCh.subscribe(); // 전송 전 채널 조인 필요
export function broadcastAdminNotif(data) {
  // event: "reserve" | "waiting" | "cancel"
  // memberName, slotKey, slotIcon, slotLabel, date
  _adminNotifCh.send({ type: "broadcast", event: "booking_change", payload: data })
    .catch(e => console.warn("broadcastAdminNotif 실패:", e));
}

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
    card_color:       m.cardColor ?? "",       // 회원카드 배경색 (hex, 비어있으면 기본)
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
    cardColor:      r.card_color ?? "",        // 회원카드 배경색
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
    slot_capacity: s.slotCapacity ?? {},   // DB 컬럼 필요: ALTER TABLE special_schedules ADD COLUMN IF NOT EXISTS slot_capacity jsonb DEFAULT '{}'::jsonb;
    daily_note:    s.dailyNote ?? "",      // DB 컬럼 필요: ALTER TABLE special_schedules ADD COLUMN IF NOT EXISTS daily_note text DEFAULT '';
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
    dailyNote:    r.daily_note ?? "",
  };
}
export function saleToSnake(s) {
  return {
    id:          s.id,
    date:        s.date,
    type:        s.type ?? "other",
    member_id:   s.memberId ?? null,
    member_name: s.memberName ?? "",
    member_type: s.memberType ?? null,
    total:       s.total ?? null,
    amount:      s.amount ?? 0,
    payment:     s.payment ?? "",
    memo:        s.memo ?? "",
    updated_at:  new Date().toISOString(),
  };
}
export function fromSnakeSale(r) {
  return {
    id:         r.id,
    date:       r.date,
    type:       r.type ?? "other",
    memberId:   r.member_id ?? null,
    memberName: r.member_name ?? "",
    memberType: r.member_type ?? null,
    total:      r.total ?? null,
    amount:     r.amount ?? 0,
    payment:    r.payment ?? "",
    memo:       r.memo ?? "",
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
  const [mRes, bRes, nRes, sRes, cRes, slRes] = await Promise.all([
    _supabase.from("members").select("*").order("id").limit(2000),
    _supabase.from("bookings").select("*").order("id").limit(10000),
    _supabase.from("notices").select("*").order("id", { ascending: false }).limit(500),
    _supabase.from("special_schedules").select("*").order("date").limit(2000),
    _supabase.from("closures").select("*").order("date").limit(2000),
    _supabase.from("sales").select("*").order("date").limit(5000),
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
    sales:            (slRes.data || []).map(fromSnakeSale),
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

export async function dbDeleteMember(id) {
  const { error } = await _supabase.from("members").delete().eq("id", id);
  if (error) console.error("member delete:", error);
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
export async function dbUpsertSale(s) {
  const { error } = await _supabase.from("sales").upsert(saleToSnake(s));
  if (error) console.error("sale upsert:", error);
}
export async function dbDeleteSale(id) {
  const { error } = await _supabase.from("sales").delete().eq("id", id);
  if (error) console.error("sale delete:", error);
}

// 웹 푸시 구독 저장/삭제
export async function dbSavePushSubscription(memberId, sub) {
  const j = sub.toJSON();
  const { error } = await _supabase.from("push_subscriptions").upsert({
    id: memberId,
    member_id: memberId,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("push sub save:", error);
}
export async function dbDeletePushSubscription(memberId) {
  await _supabase.from("push_subscriptions").delete().eq("member_id", memberId);
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

// 자동로그인 — DB 공유 버그 수정: localStorage 사용 (기기별 독립 저장)
export async function saveAutoLogin(memberId) {
  try {
    if(memberId) localStorage.setItem("yogapian_autologin", JSON.stringify({ memberId }));
    else localStorage.removeItem("yogapian_autologin");
  } catch(e) { console.warn("autologin save:", e); }
}
export async function loadAutoLogin() {
  try {
    const v = localStorage.getItem("yogapian_autologin");
    return v ? JSON.parse(v) : null;
  } catch(e) { return null; }
}
