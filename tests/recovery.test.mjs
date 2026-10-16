import test from 'node:test';
import assert from 'node:assert/strict';
import { observe, readProof, inspect, canAttempt, COOLDOWN_MS } from '../server/recovery.js';
import handler from '../api/recovery.js';

const secret='test-only-secret';
const outage={eligible:true,appHealthy:false,dbStatus:'UNHEALTHY'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
function fakeFetch({db='UNHEALTHY', project='ACTIVE_HEALTHY', app=503, unknown=false}={}) {
  return async url=>{
    if(unknown) throw Error('control plane unavailable');
    if(url.includes('/health?')) return response([{name:'db',status:db}]);
    if(url.endsWith('/api/health')) return response({status:app===200?'ok':'unavailable'},app);
    return response({status:project});
  };
}
function proofAt(now){
  let p;
  for(let i=5;i>=0;i--) p=observe(outage,p?.proof,secret,now-i*60_000);
  return p.proof;
}

test('restart evidence requires five minutes; gap, recovery and tampering reset it',()=>{
  let p;
  for(let i=0;i<6;i++) {
    p=observe(outage,p?.proof,secret,1_000_000+i*60_000);
    assert.equal(p.ready,i===5);
  }
  assert.equal(readProof(p.proof,secret,1_300_000).count,6);
  assert.equal(readProof(p.proof+'bad',secret,1_300_000),null);
  assert.equal(observe(outage,p.proof,secret,1_400_000).ready,false);
  assert.equal(observe({...outage,eligible:false},p.proof,secret,1_300_000).proof,null);
  assert.equal(readProof(p.proof,secret,1_299_999),null);
});
test('only explicit unhealthy DB and explicit app database failure qualify',async()=>{
  assert.equal((await inspect({},fakeFetch())).eligible,true);
  for(const options of [{db:'ACTIVE_HEALTHY'},{db:'COMING_UP'},{db:'UNKNOWN'},
    {project:'PAUSED'},{app:200},{app:404},{unknown:true}]) {
    assert.equal((await inspect({},fakeFetch(options))).eligible,false,JSON.stringify(options));
  }
});
test('cooldown blocks repeat incident, recent, invalid and future journals',()=>{
  const now=2*COOLDOWN_MS;
  assert.equal(canAttempt({incidentAttempted:false,lastAttemptAt:null},now),true);
  assert.equal(canAttempt({incidentAttempted:false,lastAttemptAt:now-COOLDOWN_MS},now),true);
  for(const state of [{incidentAttempted:true,lastAttemptAt:null},
    {lastAttemptAt:now-1000},{lastAttemptAt:now+1000},{lastAttemptAt:undefined}]) {
    assert.equal(canAttempt(state,now),false);
  }
});
test('handler checks auth, kill switch, proof and fresh health before a single restart',async t=>{
  const oldEnv={...process.env}; const oldFetch=globalThis.fetch;
  t.after(()=>{process.env=oldEnv;globalThis.fetch=oldFetch;});
  Object.assign(process.env,{RECOVERY_SECRET:secret,SUPABASE_MANAGEMENT_TOKEN:'fake',RECOVERY_ENABLED:'true',VERCEL_ENV:'production'});
  let calls=0;
  let changed=false, ambiguous=false;
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/restart')){calls++; if(ambiguous) throw Error('timeout');return response({});}
    return fakeFetch(changed?{db:'ACTIVE_HEALTHY'}:{})(url,options);
  };
  async function call(body,authorization=`Bearer ${secret}`){
    let code,data;
    await handler({method:'POST',headers:{authorization},body},{setHeader(){},status(s){code=s;return this;},json(x){data=x;}});
    return {code,...data};
  }
  assert.equal((await call({operation:'observe'},'wrong')).code,401);
  assert.equal((await call({operation:'restart'})).status,'insufficient_evidence');
  const proof=proofAt(Date.now());
  process.env.RECOVERY_ENABLED='false';
  assert.equal((await call({operation:'restart',proof})).status,'disabled');
  process.env.RECOVERY_ENABLED='true';changed=true;
  assert.equal((await call({operation:'restart',proof})).status,'conditions_changed');
  assert.equal(calls,0);
  changed=false;
  assert.equal((await call({operation:'restart',proof})).status,'restart_requested');
  assert.equal(calls,1);
  ambiguous=true;
  assert.equal((await call({operation:'restart',proof})).status,'restart_result_unknown');
  assert.equal(calls,2); // One additional attempt, never an internal retry.
});
