// External uptime checks: read no member rows and never expose DB error details.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ status: 'method_not_allowed' });
  }
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ status: 'unavailable' });
  try {
    // limit=0 exercises the REST/DB path without returning personal information.
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/members?select=id&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Database unavailable');
    await response.text();
    return res.status(200).json({ status: 'ok' });
  } catch {
    return res.status(503).json({ status: 'unavailable' });
  }
}
