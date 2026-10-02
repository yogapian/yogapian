// 같은 날짜를 편집할 때 ID를 유지해야 동기화 setter가 기존 행을 삭제하지 않는다.
export function applySpecialSchedule(schedules, form) {
  const existing = schedules.find(s => s.date === form.date);
  const id = existing?.id ?? Math.max(...schedules.map(s => s.id), 0) + 1;
  const label = form.label || (form.type === "regular" ? "정규수업" : form.type === "special" ? "집중수련" : "오픈클래스");
  const saved = { ...existing, ...form, label, id };
  return existing
    ? schedules.map(s => s.id === existing.id ? saved : s)
    : [...schedules, saved];
}
