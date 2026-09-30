import test from "node:test";
import assert from "node:assert/strict";
import { saveBookingChanges } from "./bookingSave.js";
import { _supabase, dbInsertBooking, dbUpsertBooking, dbDeleteBooking } from "./db.js";

const pending = { id: -1, memberId: 23, date: "2026-09-23", timeSlot: "lunch", status: "reserved", renewalPending: true };
function harness(next, overrides = {}) {
  let state = next;
  const errors = [];
  return {
    state: () => state,
    errors,
    ops: {
      insert: async b => ({ ...b, id: 100 }),
      upsert: async () => {}, remove: async () => {},
      update: fn => { state = fn(state); },
      onError: error => errors.push(error),
      ...overrides,
    },
  };
}

test("저장 확인 전에는 완료하지 않고 성공 후 실제 ID와 임시 예약 플래그를 유지", async () => {
  let finish;
  const h = harness([pending], { insert: () => new Promise(resolve => { finish = resolve; }) });
  let completed = false;
  const saving = saveBookingChanges([], [pending], h.ops).then(ok => { completed = ok; });
  await Promise.resolve();
  assert.equal(completed, false);
  finish({ ...pending, id: 100 });
  await saving;
  assert.equal(completed, true);
  assert.deepEqual(h.state(), [{ ...pending, id: 100 }]);
});

test("INSERT 실패는 완료로 반환하지 않고 해당 임시 예약만 제거", async () => {
  const other = { ...pending, id: 42, memberId: 7 };
  const h = harness([other, pending], { insert: async () => { throw new Error("offline"); } });
  assert.equal(await saveBookingChanges([other], [other, pending], h.ops), false);
  assert.deepEqual(h.state(), [other]);
  assert.equal(h.errors.length, 1);
});

test("Realtime이 먼저 전달한 실제 예약을 중복 생성하거나 과거 상태로 덮어쓰지 않음", async () => {
  const received = { ...pending, id: 100, status: "attended" };
  const h = harness([pending, received]);
  assert.equal(await saveBookingChanges([], [pending], h.ops), true);
  assert.deepEqual(h.state(), [received]);
});

test("부분 실패 시 성공한 신규 예약은 유지하고 실패한 수정만 복원", async () => {
  const before = { ...pending, id: 42 };
  const changed = { ...before, status: "cancelled" };
  const h = harness([changed, pending], { upsert: async () => { throw new Error("denied"); } });
  assert.equal(await saveBookingChanges([before], [changed, pending], h.ops), false);
  assert.deepEqual(h.state(), [before, { ...pending, id: 100 }]);
});

test("삭제 실패 시 복원하되 이후 Realtime 수정은 되돌리지 않음", async () => {
  const before = { ...pending, id: 42 };
  const h = harness([], { remove: async () => { throw new Error("denied"); } });
  assert.equal(await saveBookingChanges([before], [], h.ops), false);
  assert.deepEqual(h.state(), [before]);
  const changed = { ...before, status: "cancelled" };
  const received = { ...before, status: "attended" };
  const newer = harness([received], { upsert: async () => { throw new Error("denied"); } });
  await saveBookingChanges([before], [changed], newer.ops);
  assert.deepEqual(newer.state(), [received]);
});

// 모든 DB 호출을 가짜 응답으로 교체한다. 운영 DB에는 요청하지 않는다.
test("DB 오류와 기존 예약을 구분하고 중복 조회 실패 시 INSERT하지 않음", async t => {
  let response;
  let inserts = 0;
  let insertResponse;
  const query = {
    select() { return this; }, eq() { return this; }, in() { return this; },
    limit() { return Promise.resolve(response); },
    insert() { inserts++; return this; },
    single() { return Promise.resolve(insertResponse || response); },
    upsert() { return this; },
    delete() { return { eq: async () => response }; },
  };
  t.mock.method(_supabase, "from", () => query);
  const error = new Error("connection failed");
  response = { data: null, error };
  await assert.rejects(dbInsertBooking(pending), /connection failed/);
  assert.equal(inserts, 0);
  await assert.rejects(dbUpsertBooking({ ...pending, id: 100 }), /connection failed/);
  await assert.rejects(dbDeleteBooking(100), /connection failed/);
  response = { data: [{ id: 100, member_id: 23, date: pending.date, time_slot: "lunch", status: "reserved", renewal_pending: false }], error: null };
  const existing = await dbInsertBooking(pending);
  assert.equal(existing.id, 100);
  assert.equal(existing.renewalPending, false);
  assert.equal(inserts, 0);
  response = { data: [], error: null };
  insertResponse = { data: null, error: new Error("insert rejected") };
  await assert.rejects(dbInsertBooking(pending), /insert rejected/);
  assert.equal(inserts, 1);
});
