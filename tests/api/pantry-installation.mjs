// Real sibling Worker/D1 through HTTP. Only its source is downloaded; no fixture ledger.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { mkdtemp, readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
export async function pantryInstallation({ revision = '5c712d42d1c2107a7550aba3b0dd6add0f1927ff', networkEdge } = {}){
  const dir=await mkdtemp(join(tmpdir(),'pier-pantry-'));
  let mf, edge;
  try{
    let source=process.env.PANTRY_SOURCE;
    if(!source){
      source=join(dir,'source');
      // Compatibility target, not a runtime dependency or a version assertion.
      // Read the sibling through GitHub's API; no sibling Git checkout or write
      // remote is created by this integration fixture.
      let archive;
      try { archive = (await exec('gh',['api',`repos/just-every/run-pantry/tarball/${revision}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })).stdout; }
      catch { throw new Error('Could not read the pinned Pantry source archive through gh api.'); }
      const archivePath = join(dir,'source.tar.gz');
      await writeFile(archivePath,archive); await mkdir(source);
      await exec('tar',['-xzf',archivePath,'--directory',source,'--strip-components=1']);
      await rm(archivePath);
    }
    const bundled=await build({entryPoints:[join(source,'tests/api/worker.ts')],nodePaths:[resolve('node_modules')],bundle:true,write:false,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],target:'es2023',external:['node:*','cloudflare:*'],logLevel:'error'});
    let origin='http://127.0.0.1';
    const setup=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
    const options=port=>({...convertV4MiniflareOptions({host:'127.0.0.1',port,modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret,SETUP_TOKEN:setup,MAIL_PROVIDER:'development',MAIL_FROM:'pantry@example.test'}}),resourcePersistencePath:join(dir,'data')});
    mf=new Miniflare(options(0));const address=await mf.ready;origin=address.origin;await mf.setOptions(options(Number(address.port)));
    const db=await mf.getD1Database('DB');
    for(const file of (await readdir(join(source,'migrations/core'))).filter(f=>f.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(join(source,'migrations/core',file),'utf8')).map(sql=>db.prepare(sql)));
    let cookie='';
    async function request(path,body){return fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{origin,'content-type':'application/json',cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});}
    const boot=await request('/auth/bootstrap',{token:setup,displayName:'Pantry test owner'});assert.equal(boot.status,303,await boot.text());cookie=boot.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    const command=async(op,body)=>{const r=await request('/api/pantry/command/'+op,body),value=await r.json();assert.equal(r.status,200,`${op}: ${JSON.stringify(value)}`);return value;};
    const view=async(path)=>{const r=await request('/api/pantry/'+path);assert.equal(r.status,200);return r.json();};
    let integrationOrigin=origin;
    if(networkEdge){
      // The real sibling still owns every record. Only transport readback can change.
      edge=createServer(async(req,res)=>{
        try{
          if(!req.url.startsWith('/api/pantry/integration/')){res.writeHead(404);res.end();return;}
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          const request=new Request(origin+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([key])=>!['transfer-encoding','content-length','host','connection'].includes(key))),...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
          const response=await networkEdge(request,await fetch(request));
          res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([key])=>!['transfer-encoding','content-length','content-encoding'].includes(key))));
          res.end(Buffer.from(await response.arrayBuffer()));
        }catch{res.destroy();}
      });
      await new Promise(resolve=>edge.listen(0,'127.0.0.1',resolve));
      integrationOrigin=`http://127.0.0.1:${edge.address().port}`;
    }
    const closeEdge=async()=>{if(edge){edge.closeAllConnections();await new Promise((resolve,reject)=>edge.close(error=>error?reject(error):resolve()));}};
    return{origin:integrationOrigin,cookie,command,view,db,async close(){await closeEdge();await mf.dispose();await rm(dir,{recursive:true,force:true});}};
  }catch(error){edge?.closeAllConnections();edge?.close();await mf?.dispose();await rm(dir,{recursive:true,force:true});throw error;}
}
