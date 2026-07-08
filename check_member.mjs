const URL_BASE = "https://bgrgmrxlahtrpgrnigid.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmdtcnhsYWh0cnBncm5pZ2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjUzOTQsImV4cCI6MjA4OTU0MTM5NH0.-HRgZaFoWuXWizdHe4ANaRfuo3QCQlP7aYUasofNj4s";
const H = { apikey: KEY, Authorization: "Bearer " + KEY };

const name = process.argv[2] || "최혜서";
const mRes = await fetch(URL_BASE + `/members?select=*&name=eq.${encodeURIComponent(name)}&limit=5`, { headers: H });
const members = await mRes.json();
if (!members.length) { console.log(name + " 없음"); process.exit(); }

const m = members[0];
console.log("ID:", m.id, "이름:", m.name);
console.log("startDate:", m.start_date, "endDate:", m.end_date, "total:", m.total, "memberType:", m.member_type);
console.log("갱신이력:");
(m.renewal_history || []).forEach((r, i) => {
  console.log(`  ${i+1}기: ${r.startDate} ~ ${r.endDate}  total=${r.total}  type=${r.memberType}`);
});

const bRes = await fetch(URL_BASE + `/bookings?member_id=eq.${m.id}&order=date.asc&limit=200`, { headers: H });
const bookings = await bRes.json();
console.log("\n전체 예약 (" + bookings.length + "건):");
bookings.forEach(b => console.log(`  ${b.date}  slot=${b.time_slot}  status=${b.status}  id=${b.id}`));
