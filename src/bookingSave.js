// React updater 밖에서 저장한다. updater 재실행으로 INSERT가 중복되지 않게 한다.
// 각 작업의 실패를 따로 처리해 부분 성공과 Realtime 수신을 보존한다.
export async function saveBookingChanges(prev, next, { insert, upsert, remove, update, onError }) {
  const prevMap = new Map(prev.map(b => [b.id, b]));
  const nextMap = new Map(next.map(b => [b.id, b]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const jobs = next.filter(b => !same(prevMap.get(b.id), b)).map(b => async () => {
    if (b.id < 0 && prevMap.has(b.id)) return; // 진행 중인 INSERT를 다시 보내지 않음
    try {
      if (b.id < 0) {
        const real = await insert(b);
        if (!real) throw new Error("예약 저장 결과가 없습니다.");
        update(current => {
          // Realtime이 먼저 전달한 실제 예약이 있으면 그 최신 상태를 유지한다.
          const received = current.find(row => row.id === real.id);
          return current.filter(row => row.id !== b.id && row.id !== real.id)
            .concat(received || real);
        });
      } else {
        await upsert(b);
      }
    } catch (error) {
      update(current => b.id < 0
        ? current.filter(row => row.id !== b.id)
        : current.flatMap(row => row.id === b.id && same(row, b)
          ? (prevMap.has(b.id) ? [prevMap.get(b.id)] : []) : [row]));
      throw error;
    }
  });
  for (const b of prev.filter(b => b.id > 0 && !nextMap.has(b.id))) {
    jobs.push(async () => {
      try { await remove(b.id); }
      catch (error) {
        update(current => current.some(row => row.id === b.id) ? current : [...current, b]);
        throw error;
      }
    });
  }
  const results = await Promise.allSettled(jobs.map(job => job()));
  const failures = results.filter(r => r.status === "rejected");
  failures.forEach(r => onError(r.reason));
  return failures.length === 0;
}
