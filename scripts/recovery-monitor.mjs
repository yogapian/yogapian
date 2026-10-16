import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { canAttempt, APP_ORIGIN } from '../server/recovery.js';

const repo = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const ghHeaders = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };
const stateFile = 'recovery-state.json';
const writeState = state => fs.writeFile(stateFile, JSON.stringify(state));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function github(path) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers: ghHeaders, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Unable to read recovery journal (${r.status})`);
  return r.json();
}

async function restoreState() {
  const result = await github('/actions/artifacts?name=recovery-state&per_page=100');
  const latest = result.artifacts.filter(a => !a.expired && String(a.workflow_run?.id) !== runId).sort((a,b) => b.id-a.id)[0];
  if (!latest) {
    // First installation may start empty. A missing recent journal must fail closed.
    const runs = await github('/actions/workflows/recovery.yml/runs?per_page=100');
    if (runs.workflow_runs.some(r => String(r.id) !== runId && Date.now()-Date.parse(r.created_at) < 86_400_000)) {
      throw new Error('Recent recovery journal missing; refusing automatic restart');
    }
    return { version: 1, lastAttemptAt: null, incidentAttempted: false };
  }
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts/${latest.id}/zip`, {
    headers: ghHeaders, signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error('Cannot download recovery journal');
  await fs.writeFile('/tmp/recovery-state.zip', Buffer.from(await r.arrayBuffer()));
  const text = execFileSync('unzip', ['-p', '/tmp/recovery-state.zip', stateFile], { encoding: 'utf8' });
  const state = JSON.parse(text);
  if (state.version !== 1 || typeof state.incidentAttempted !== 'boolean' ||
    !(state.lastAttemptAt === null || (Number.isFinite(state.lastAttemptAt) && state.lastAttemptAt <= Date.now()))) {
    throw new Error('Invalid recovery journal');
  }
  return state;
}

async function request(operation, proof) {
  if (!process.env.RECOVERY_SECRET) throw new Error('Recovery authentication missing');
  const r = await fetch(`${APP_ORIGIN}/api/recovery`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RECOVERY_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, proof }), signal: AbortSignal.timeout(55_000),
  });
  if (!r.ok) throw new Error(`Recovery ${operation} failed (${r.status}); no automatic retry`);
  return r.json();
}

async function prepare() {
  const state = await restoreState();
  await writeState(state);
  let proof = null;
  for (let i=0; i<7; i++) {
    const observation = await request('observe', proof);
    console.log(JSON.stringify({ dbStatus: observation.dbStatus, appHealthy: observation.appHealthy,
      eligible: observation.eligible, outageSeconds: observation.outageSeconds }));
    if (observation.appHealthy && observation.dbStatus === 'ACTIVE_HEALTHY') {
      state.incidentAttempted = false;
      await writeState(state);
      return;
    }
    if (!observation.eligible) throw new Error('Health is unknown or restart conditions are not met; no restart');
    if (!canAttempt(state)) throw new Error('Restart already attempted for this incident or within 24 hours');
    proof = observation.proof;
    if (observation.ready) {
      // Persist intent BEFORE side effect. Even a timeout consumes the attempt.
      state.lastAttemptAt = Date.now();
      state.incidentAttempted = true;
      await writeState(state);
      await fs.writeFile('/tmp/recovery-proof', proof, { mode: 0o600 });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'restart=true\n');
      return;
    }
    await sleep(60_000);
  }
  throw new Error('Five-minute continuous outage was not established; no restart');
}

async function restart() {
  const proof = await fs.readFile('/tmp/recovery-proof', 'utf8');
  const result = await request('restart', proof);
  console.log(result.status);
  // Read-only recovery verification. No second restart, including on failure.
  for (let i=0;i<8;i++) {
    await sleep(60_000);
    const r = await request('observe', null);
    if (r.appHealthy && r.dbStatus === 'ACTIVE_HEALTHY') {
      console.log('Database and application recovered. UptimeRobot can send its UP notification.');
      return;
    }
  }
  throw new Error('Recovery not confirmed within 8 minutes; manual inspection needed');
}

if (!repo || !runId || !process.env.GITHUB_TOKEN) throw new Error('Run only in GitHub Actions');
if (process.argv[2] === 'prepare') await prepare();
else if (process.argv[2] === 'restart') await restart();
else throw new Error('Unknown command');
