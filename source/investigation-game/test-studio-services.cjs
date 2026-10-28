const test = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('./server.cjs');
const E = require('./v2/simulation.js');

test('studio service endpoints stay on the existing same-origin boundary', async t => {
  const server=createServer({env:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const session=await fetch(origin+'/api/session');
  assert.equal(session.status,200);
  assert.equal((await session.json()).enabled,false);
  const payload={save:E.serialize(E.initial()),lang:'zh-CN',note:'我需要更多订单证据',reason:'evidence',forecast:'flat',draft:[.2,.2,.15,.15,.15,.15]};
  const response=await fetch(origin+'/api/quick-check',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(response.status,200);
  assert.equal((await response.json()).mode,'rule');
  const foreign=await fetch(origin+'/api/quick-check',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(foreign.status,403);
});
