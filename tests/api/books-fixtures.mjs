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
        const runs=step.runs??[step.requests??[step],...(provider==='qbo'&&operation==='post'?[step.requests??[step]]:[])];let calls=0,runIndex=0,runOffset=0;const requestIdentities=new Map();
        const adapter=factory({...fixture,fetch:async(url,init)=>{
          const exchange=runs[runIndex]?.[runOffset++];calls++;assert.ok(exchange);if(runOffset===runs[runIndex].length){runIndex++;runOffset=0;}assert.equal(url.pathname,exchange.request.path);
          const actualQuery=Object.fromEntries(url.searchParams),expectedQuery={...exchange.request.query};
          if('requestid' in expectedQuery){assert.ok(actualQuery.requestid);const identity=url.pathname;if(requestIdentities.has(identity))assert.equal(actualQuery.requestid,requestIdentities.get(identity));requestIdentities.set(identity,actualQuery.requestid);delete actualQuery.requestid;delete expectedQuery.requestid;}
          assert.deepEqual(actualQuery,expectedQuery);assert.equal(init.method??'GET',exchange.request.method);
          if(exchange.request.json)assert.deepEqual(JSON.parse(init.body),exchange.request.json);
          if(exchange.request.headers)for(const [name,value] of Object.entries(exchange.request.headers))assert.equal(new Headers(init.headers).get(name),value);
          if(exchange.request.form)for(const [name,value] of Object.entries(exchange.request.form)){const got=init.body.get(name);assert.ok(got);if(value.content!==undefined)assert.equal(await got.text(),value.content);}
          return new Response(JSON.stringify(exchange.response.body),{status:exchange.response.status});
        }});
        const method=operation==='post'?'post':'read';
        assert.deepEqual(await adapter[method](step.document??scenario.document),scenario.expected[method]);
        if(provider==='qbo'&&operation==='post'&&!step.postOnce){assert.deepEqual(await adapter.post(scenario.document),scenario.expected.post);assert.equal(calls,runs.flat().length);}else assert.equal(calls,runs[0].length);
      }
      if(provider==='qbo'&&scenario.void){
        for(const run of scenario.void.runs??[scenario.void.requests]){
          let calls=0;
          const adapterConfig={...fixture,fetch:async(url,init)=>{
            const exchange=run[calls++];assert.ok(exchange);assert.equal(url.pathname,exchange.request.path);
            const actualQuery=Object.fromEntries(url.searchParams),expectedQuery={...exchange.request.query};
            if('requestid' in expectedQuery){assert.ok(actualQuery.requestid);delete actualQuery.requestid;delete expectedQuery.requestid;}
            assert.deepEqual(actualQuery,expectedQuery);assert.equal(init.method??'GET',exchange.request.method);
            if(exchange.request.json)assert.deepEqual(JSON.parse(init.body),exchange.request.json);
            return new Response(JSON.stringify(exchange.response.body),{status:exchange.response.status});
          }};
          assert.deepEqual(await module.voidQboInvoice(adapterConfig,scenario.void.document),scenario.void.expected);assert.equal(calls,run.length);
        }
      }
    }
    for(const failure of fixture.errors){
      const adapter=factory({...fixture,fetch:async()=>new Response(JSON.stringify(failure.response?.body??failure.body),{status:failure.response?.status??failure.status})});
      await assert.rejects(()=>adapter.post(fixture.cases[1].document));
    }
  }
}
