import { createHmac, timingSafeEqual } from 'node:crypto';

export const PROJECT_REF = 'bgrgmrxlahtrpgrnigid';
export const APP_ORIGIN = 'https://yogapian.vercel.app';
export const MIN_OUTAGE_MS = 5 * 60_000;
export const MAX_GAP_MS = 95_000;
export const COOLDOWN_MS = 24 * 60 * 60_000;

export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function mac(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function readProof(proof, secret, now) {
  try {
    const [encoded, signature, extra] = proof.split('.');
    if (extra || !equalSecret(signature, mac(encoded, secret))) return null;
    const p = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (p.ref !== PROJECT_REF || !Number.isFinite(p.first) || !Number.isFinite(p.last)
      || p.first > p.last || p.last > now || now - p.last > MAX_GAP_MS
      || !Number.isInteger(p.count) || p.count < 1) return null;
    return p;
  } catch { return null; }
}

export function observe(snapshot, previousProof, secret, now = Date.now()) {
  // Unknown, healthy, recovering, maintenance or app-only failures reset the streak.
  if (!snapshot.eligible) return { ...snapshot, proof: null, ready: false, outageSeconds: 0 };
  const previous = readProof(previousProof, secret, now);
  const p = { ref: PROJECT_REF, first: previous?.first ?? now, last: now, count: (previous?.count ?? 0) + 1 };
  const encoded = Buffer.from(JSON.stringify(p)).toString('base64url');
  return { ...snapshot, proof: `${encoded}.${mac(encoded, secret)}`,
    ready: now - p.first >= MIN_OUTAGE_MS && p.count >= 6,
    outageSeconds: Math.floor((now - p.first) / 1000) };
}

async function jsonGet(fetchFn, url, headers, label) {
  try {
    const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!response.ok) {
      const body = await response.json().catch(()=>({}));
      const detail = typeof body.message === 'string' ? body.message : '';
      const token = headers.Authorization.slice(7);
      throw Object.assign(new Error('Status check failed'), { checkCode: `${label}_http_${response.status}`,
        checkDetail: detail.split(token).join('[redacted]').slice(0,300) });
    }
    return await response.json();
  } catch(error) {
    // 인증된 점검 호출에 오류 코드와 토큰을 제거한 메시지만 전달한다.
    throw Object.assign(new Error('Status check unavailable'), { checkCode: error.checkCode ?? `${label}_unavailable`, checkDetail: error.checkDetail });
  }
}

export async function inspect(env, fetchFn = fetch) {
  const headers = { Authorization: `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN?.trim()}` };
  try {
    // An HTTP timeout alone is not proof of an Unhealthy database.
    const [project, services, app] = await Promise.all([
      jsonGet(fetchFn, `https://api.supabase.com/v1/projects/${PROJECT_REF}`, headers, 'project'),
      jsonGet(fetchFn, `https://api.supabase.com/v1/projects/${PROJECT_REF}/health?services=db`, headers, 'database_health'),
      (async () => {
        try {
          const r = await fetchFn(`${APP_ORIGIN}/api/health`, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
          // Only our explicit DB-failure response qualifies; HTML/404/deployment failures do not.
          const body = await r.json();
          return { failed: r.status === 503 && body.status === 'unavailable', healthy: r.ok && body.status === 'ok' };
        } catch { return { failed: false, healthy: false }; }
      })(),
    ]);
    const db = Array.isArray(services) && services.find(s => s.name === 'db');
    const projectActive = ['ACTIVE_HEALTHY', 'ACTIVE_UNHEALTHY'].includes(project.status);
    return { eligible: projectActive && db?.status === 'UNHEALTHY' && app.failed,
      appHealthy: app.healthy, dbStatus: db?.status ?? 'UNKNOWN', projectStatus: project.status ?? 'UNKNOWN' };
  } catch(error) {
    return { eligible: false, appHealthy: false, dbStatus: 'UNKNOWN', projectStatus: 'UNKNOWN', checkError: error.checkCode ?? 'status_check_unavailable', checkDetail: error.checkDetail };
  }
}

export function canAttempt(state, now = Date.now()) {
  return state.incidentAttempted !== true && (state.lastAttemptAt === null ||
    (Number.isFinite(state.lastAttemptAt) && now - state.lastAttemptAt >= COOLDOWN_MS));
}
