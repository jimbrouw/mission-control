import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/agent.js';

test('existing API rejects unauthorized, stale, unknown destinations and failed storage without writes', async () => {
  const originalFetch = globalThis.fetch;
  const env = {...process.env};
  process.env.KV_REST_API_URL = 'https://fixture.invalid';
  process.env.KV_REST_API_TOKEN = 'fixture'; process.env.MC_SECRET = 'fixture';
  const state = {meta:{updatedAt:10},inbox:[],missions:[]};
  let writes = 0, fail = false;
  globalThis.fetch = async (url) => {
    if (url.includes('/set/')) writes++;
    return {ok:!fail,json:async()=>({result:JSON.stringify(state)})};
  };
  async function call(body, auth='fixture') {
    const res = {status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
    await handler({method:'POST',headers:{authorization:`Bearer ${auth}`},body},res);
    return res;
  }
  try {
    assert.equal((await call({},'wrong')).code,401);
    assert.equal((await call({action:'apply_items',expectedUpdatedAt:9,items:[{text:'x'}]})).body.error,'state_changed');
    assert.equal((await call({action:'apply_items',expectedUpdatedAt:10,items:[{text:'x',missionId:'missing'}]})).body.error,'unknown_mission');
    assert.equal((await call({action:'delete',expectedUpdatedAt:10})).code,400);
    fail = true;
    assert.equal((await call({action:'apply_items',expectedUpdatedAt:10,items:[{text:'x'}]})).code,500);
    assert.equal(writes,0);
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','MC_SECRET']) {
      if(env[key] === undefined) delete process.env[key]; else process.env[key]=env[key];
    }
  }
});
