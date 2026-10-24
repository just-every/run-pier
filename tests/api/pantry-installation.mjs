// Real sibling Worker/D1 through HTTP. Only its source is downloaded; no fixture ledger.
import { build } from 'esbuild';
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
export async function pantryInstallation(){
  const dir=await mkdtemp(join(tmpdir(),'pier-pantry-'));
  let mf;
  try{
    let source=process.env.PANTRY_SOURCE;
    if(!source){
      source=join(dir,'source');
      // Compatibility target, not a runtime dependency or a version assertion.
      // Read the sibling through GitHub's API; no sibling Git checkout or write
      // remote is created by this integration fixture.
      let archive;
      try { archive = (await exec('gh',['api','repos/just-every/run-pantry/tarball/e987ba0a2270a81c62d399c44c6e05d3b504bb07'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })).stdout; }
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
    return{origin,cookie,command,view,db,async close(){await mf.dispose();await rm(dir,{recursive:true,force:true});}};
  }catch(error){await mf?.dispose();await rm(dir,{recursive:true,force:true});throw error;}
}
