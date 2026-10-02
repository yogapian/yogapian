import test from "node:test";
import assert from "node:assert/strict";
import { applySpecialSchedule } from "./specialSchedule.js";

const original = { id: 26, date: "2026-10-05", type: "special", label: "공휴일 집중수련", activeSlots: ["morning", "lunch"], customTimes: { morning: "08:30", lunch: "11:30" }, slotCapacity: { morning: 14, lunch: 14 }, feeNote: "기존 안내", dailyNote: "" };
const other = { ...original, id: 25, date: "2026-10-09" };

test("공지 반복 저장은 같은 ID의 UPDATE만 발생시키고 수업 삭제·날짜 중복을 만들지 않는다", () => {
  let schedules = [original, other];
  const database = new Map(schedules.map(s => [s.id, s]));
  for (const dailyNote of ["매트 지참", "수업 시간 확인", ""]) {
    // 수업 설정 폼처럼 ID 없이 저장한다.
    const { id, ...form } = schedules.find(s => s.date === original.date);
    const next = applySpecialSchedule(schedules, { ...form, dailyNote });
    // App.jsx 동기화 setter와 같은 ID 기반 변경분을 검증한다.
    const writes = next.filter(s => JSON.stringify(schedules.find(p => p.id === s.id)) !== JSON.stringify(s));
    const deletes = schedules.filter(s => !next.some(n => n.id === s.id));
    assert.deepEqual(deletes, []);
    assert.equal(writes.length, 1);
    for (const row of writes) {
      assert.equal([...database.values()].some(s => s.date === row.date && s.id !== row.id), false, "DB date UNIQUE 충돌 없음");
      database.set(row.id, row);
    }
    assert.deepEqual(database.get(original.id), { ...original, dailyNote });
    assert.strictEqual(next.find(s => s.id === other.id), other);
    schedules = next;
  }
});

test("신규 날짜는 기존 수업을 보존하면서 새 ID와 유형별 기본 이름을 받는다", () => {
  const next = applySpecialSchedule([original, other], { date: "2026-10-12", type: "special", label: "", activeSlots: ["morning"] });
  assert.deepEqual(next.slice(0, 2), [original, other]);
  assert.equal(next[2].id, 27);
  assert.equal(next[2].label, "집중수련");
  assert.equal(applySpecialSchedule([], { date: original.date, type: "regular" })[0].id, 1);
});
