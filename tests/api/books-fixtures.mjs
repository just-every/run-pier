import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
// Documented provider schemas with synthetic values, injected only at the HTTP edge.
export async function exerciseBooksFixtures(){
  for(const provider of ['qbo','xero']){
    const fixture=JSON.parse(await readFile(`tests/fixtures/books/${provider}.json`,'utf8'));
    const output=await build({entryPoints:[`src/pier/books/adapters/${provider}.ts`],bundle:true,format:'esm',platform:'node',write:false});
    const module=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
    const factory=provider==='qbo'?module.createQboAdapter:module.createXeroAdapter;
    for(const scenario of fixture.cases){
      for(const operation of ['post','read','lookup']){
        const step=scenario[operation];if(!step)continue;
        let calls=0,requestIdentity;
        const adapter=factory({...fixture,fetch:async(url,init)=>{
          calls++;assert.equal(url.pathname,step.request.path);
          const actualQuery=Object.fromEntries(url.searchParams),expectedQuery={...step.request.query};
          if('requestid' in expectedQuery){assert.ok(actualQuery.requestid);if(requestIdentity)assert.equal(actualQuery.requestid,requestIdentity);requestIdentity=actualQuery.requestid;delete actualQuery.requestid;delete expectedQuery.requestid;}
          assert.deepEqual(actualQuery,expectedQuery);assert.equal(init.method??'GET',step.request.method);
          if(step.request.json)assert.deepEqual(JSON.parse(init.body),step.request.json);
          if(step.request.headers)for(const [name,value] of Object.entries(step.request.headers))assert.equal(new Headers(init.headers).get(name),value);
          if(step.request.form)for(const [name,value] of Object.entries(step.request.form)){const got=init.body.get(name);assert.ok(got);if(value.content!==undefined)assert.equal(await got.text(),value.content);}
          return new Response(JSON.stringify(step.response.body),{status:step.response.status});
        }});
        const method=operation==='post'?'post':'read';
        assert.deepEqual(await adapter[method](step.document??scenario.document),scenario.expected[method]);
        if(provider==='qbo'&&operation==='post'){assert.deepEqual(await adapter.post(scenario.document),scenario.expected.post);assert.equal(calls,2);}else assert.equal(calls,1);
      }
    }
    for(const failure of fixture.errors){
      const adapter=factory({...fixture,fetch:async()=>new Response(JSON.stringify(failure.response?.body??failure.body),{status:failure.response?.status??failure.status})});
      await assert.rejects(()=>adapter.post(fixture.cases[1].document));
    }
  }
}
