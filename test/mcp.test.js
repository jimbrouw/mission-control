import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP transport preserves explicit mission approval, narrow tools and external-call errors', async () => {
  const requests = [];
  const http = createServer(async (req,res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    requests.push({path:req.url,body:text ? JSON.parse(text) : null});
    assert.equal(req.headers.authorization,'Bearer fixture-only');
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET') res.end(JSON.stringify({workspace:{updatedAt:10,inbox:[],missions:[]}}));
    else {res.statusCode=409;res.end(JSON.stringify({error:'state_changed'}));}
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const transport = new StdioClientTransport({command:process.execPath,args:['mcp/workos-server.js'],
    env:{WORKOS_URL:`http://127.0.0.1:${http.address().port}`,WORKOS_SECRET:'fixture-only'},stderr:'pipe'});
  const client = new Client({name:'local-safety-test',version:'1.0.0'});
  try {
    await client.connect(transport);
    const {tools} = await client.listTools();
    assert.deepEqual(tools.map(t=>t.name).sort(),['workos_apply_items','workos_create_mission','workos_get_workspace','workos_triage_dump']);
    assert.match(tools.find(t=>t.name==='workos_apply_items').description,/explicitly approves this exact list/);
    await client.callTool({name:'workos_get_workspace',arguments:{}});
    assert.equal(requests.length,1);
    for (const approval of [{},{approved:false}]) {
      const result = await client.callTool({name:'workos_create_mission',arguments:{name:'Fixture',expectedUpdatedAt:10,...approval}});
      assert.equal(result.isError,true);
    }
    assert.equal(requests.length,1,'invalid approval must not reach the API');
    const result = await client.callTool({name:'workos_create_mission',arguments:{name:'Fixture',expectedUpdatedAt:10,approved:true}});
    assert.equal(result.isError,true);
    assert.match(result.content[0].text,/state_changed/);
    assert.deepEqual(requests.at(-1).body,{action:'create_mission',name:'Fixture',expectedUpdatedAt:10,approved:true});
    assert.equal(requests.length,2,'no automatic stale-approval retry');
  } finally {await client.close();await new Promise(resolve=>http.close(resolve));}
});
