const URL_BASE = "https://bgrgmrxlahtrpgrnigid.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmdtcnhsYWh0cnBncm5pZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjUzOTQsImV4cCI6MjA4OTU0MTM5NH0.-HRgZaFoWuXWizdHe4ANaRfuo3QCQlP7aYUasofNj4s";
const H = { apikey: KEY, Authorization: "Bearer " + KEY };

const mRes = await fetch(URL_BASE + "/members?select=id,name,renewal_history&name=eq.김보라&limit=5", { headers: H });
const members = await mRes.json();
if (!members.length) { console.log("김보라 없음"); process.exit(); }

const m = members[0];
console.log("회원 ID:", m.id, "이름:", m.name);
console.log("갱신이력:");
(m.renewal_history || []).forEach((r, i) => {
  console.log(`  ${i+1}기: ${r.startDate} ~ ${r.endDate}  total=${r.total}  type=${r.memberType}`);
});

const bRes = await fetch(URL_BASE + `/bookings?member_id=eq.${m.id}&status=eq.attended&order=date.asc&limit=200`, { headers: H });
const bookings = await bRes.json();
console.log("\n출석 기록 (" + bookings.length + "건):");
bookings.forEach(b => console.log(`  ${b.date}  slot=${b.time_slot}  id=${b.id}  renewalPending=${b.renewal_pending}`));
