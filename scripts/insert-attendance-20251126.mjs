/**
 * [수동 데이터 삽입 스크립트]
 * 목적: 이한나, 김도형 2025-11-26 저녁(evening) 수업 출석(attended) 레코드 Supabase upsert
 * 실행: node scripts/insert-attendance-20251126.mjs
 * 작성일: 2026-04-04
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bgrgmrxlahtrpgrnigid.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmdtcnhsYWh0cnBncm5pZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjUzOTQsImV4cCI6MjA4OTU0MTM5NH0.-HRgZaFoWuXWizdHe4ANaRfuo3QCQlP7aYUasofNj4s";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const TARGET_DATE = "2025-11-26"; // 수요일 — SCHEDULE[3]에 evening 포함 확인됨
const TARGET_SLOT = "evening";    // 저녁 19:30
const TARGET_STATUS = "attended"; // 출석 (횟수 차감 대상, CLAUDE.md 비즈니스 규칙)

async function main() {
  // ── 1. 회원 조회 ──────────────────────────────────────────────────────────
  console.log("📋 이한나, 김도형 회원 조회 중...");
  const { data: members, error: mErr } = await supabase
    .from("members")
    .select("id, name, start_date, end_date, total, member_type")
    .in("name", ["이한나", "김도형"]);

  if (mErr) {
    console.error("❌ 회원 조회 오류:", mErr.message);
    process.exit(1);
  }

  console.log(`✅ 조회된 회원 (${members.length}명):`, members.map(m => `${m.name}(id:${m.id})`).join(", "));

  const hanna = members.find(m => m.name === "이한나");
  const dohyung = members.find(m => m.name === "김도형");

  if (!hanna) { console.error("❌ 이한나 회원을 찾을 수 없습니다."); process.exit(1); }
  if (!dohyung) { console.error("❌ 김도형 회원을 찾을 수 없습니다."); process.exit(1); }

  // ── 2. 해당 날짜·슬롯 기존 booking 확인 ─────────────────────────────────
  console.log(`\n🔍 ${TARGET_DATE} ${TARGET_SLOT} 기존 booking 확인 중...`);
  const { data: existing, error: bErr } = await supabase
    .from("bookings")
    .select("id, member_id, status")
    .eq("date", TARGET_DATE)
    .eq("time_slot", TARGET_SLOT)
    .in("member_id", [hanna.id, dohyung.id]);

  if (bErr) {
    console.error("❌ booking 조회 오류:", bErr.message);
    process.exit(1);
  }

  if (existing.length > 0) {
    console.log("⚠️  기존 booking 발견:");
    existing.forEach(b => console.log(`   id:${b.id} member_id:${b.member_id} status:${b.status}`));
    console.log("   → upsert로 status를 attended로 업데이트합니다.");
  } else {
    console.log("   기존 booking 없음 → 신규 insert 진행.");
  }

  // ── 3. booking 레코드 구성 ───────────────────────────────────────────────
  // id: 기존 record가 있으면 해당 id 재사용(upsert), 없으면 새 UUID 생성
  const nowIso = new Date().toISOString();

  const bookingsToUpsert = [hanna, dohyung].map(member => {
    const existingRecord = existing.find(b => b.member_id === member.id);
    return {
      // 기존 레코드 id가 있으면 그대로 → upsert(덮어쓰기), 없으면 새 id
      ...(existingRecord ? { id: existingRecord.id } : {}),
      date:              TARGET_DATE,
      member_id:         member.id,
      oneday_name:       null,           // 정식 회원 → null
      time_slot:         TARGET_SLOT,
      walk_in:           false,
      status:            TARGET_STATUS,  // "attended" — 출석 처리
      confirmed_attend:  null,
      cancel_note:       "",
      cancelled_by:      "",
      updated_at:        nowIso,
    };
  });

  console.log("\n📝 upsert할 레코드:", JSON.stringify(bookingsToUpsert, null, 2));

  // ── 4. Supabase upsert ───────────────────────────────────────────────────
  // id 없는 레코드: insert / id 있는 레코드: update
  let hasError = false;
  for (const rec of bookingsToUpsert) {
    const memberName = rec.member_id === hanna.id ? "이한나" : "김도형";
    if (rec.id) {
      // 기존 레코드 업데이트
      const { error } = await supabase
        .from("bookings")
        .update({ status: TARGET_STATUS, updated_at: nowIso })
        .eq("id", rec.id);
      if (error) {
        console.error(`❌ ${memberName} update 오류:`, error.message);
        hasError = true;
      } else {
        console.log(`✅ ${memberName} booking 업데이트 완료 (id: ${rec.id})`);
      }
    } else {
      // 신규 insert
      const { data: inserted, error } = await supabase
        .from("bookings")
        .insert(rec)
        .select("id");
      if (error) {
        console.error(`❌ ${memberName} insert 오류:`, error.message);
        hasError = true;
      } else {
        console.log(`✅ ${memberName} booking 신규 insert 완료 (id: ${inserted?.[0]?.id})`);
      }
    }
  }

  // ── 5. 결과 확인 ─────────────────────────────────────────────────────────
  if (hasError) {
    console.error("\n❌ 일부 처리 중 오류 발생. 위 로그를 확인하세요.");
    process.exit(1);
  }

  console.log("\n🎉 완료! 이한나·김도형 2025-11-26 저녁 수업 출석 처리 완료.");
  console.log("   CLAUDE.md 규칙 준수: 잔여 횟수는 usedAsOf()가 attended 건수로 자동 계산됨.");
}

main().catch(err => { console.error("스크립트 오류:", err); process.exit(1); });
