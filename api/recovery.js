import { equalSecret, inspect, observe, readProof, MIN_OUTAGE_MS, PROJECT_REF } from '../server/recovery.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ status: 'method_not_allowed' });
  const env = process.env;
  if (!env.RECOVERY_SECRET || !equalSecret(req.headers.authorization, `Bearer ${env.RECOVERY_SECRET}`)) {
    return res.status(401).json({ status: 'unauthorized' });
  }
  if (!env.SUPABASE_MANAGEMENT_TOKEN) return res.status(503).json({ status: 'not_configured' });
  const body = typeof req.body === 'object' && req.body ? req.body : {};
  if (!['observe', 'restart'].includes(body.operation)) return res.status(400).json({ status: 'invalid_operation' });
  if (body.operation === 'observe') {
    const snapshot = await inspect(env);
    return res.status(200).json(observe(snapshot, body.proof, env.RECOVERY_SECRET));
  }
  // A single caller is allowed: the serialized Actions workflow, which journals
  // its cooldown BEFORE this call. Do not wire a public monitor directly here.
  if (env.RECOVERY_ENABLED !== 'true' || env.VERCEL_ENV !== 'production') {
    return res.status(409).json({ status: 'disabled' });
  }
  const now = Date.now();
  const proof = readProof(body.proof, env.RECOVERY_SECRET, now);
  if (!proof || proof.count < 6 || now - proof.first < MIN_OUTAGE_MS) {
    return res.status(409).json({ status: 'insufficient_evidence' });
  }
  // Fresh verification, immediately before sending the restart. Unknown = no action.
  const snapshot = await inspect(env);
  if (!snapshot.eligible) return res.status(409).json({ status: 'conditions_changed' });
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/restart`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN.trim()}` },
      signal: AbortSignal.timeout(15_000),
    });
    console.info('Automatic recovery request', { accepted: r.ok });
    return res.status(r.ok ? 200 : 502).json({ status: r.ok ? 'restart_requested' : 'restart_failed' });
  } catch {
    // Never retry an ambiguous POST: the platform may already be restarting.
    return res.status(502).json({ status: 'restart_result_unknown' });
  }
}
