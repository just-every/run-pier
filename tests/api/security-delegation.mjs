import assert from 'node:assert/strict';
import { authenticatorCode } from './strong-auth-fixture.mjs';
import { installation } from './harness.mjs';

export async function securityDelegation(t) {
  const h=await installation();t.after(()=>h.close());
  const call=(action,body={},as,headers)=>h.request('/auth/strong-auth/'+action,{method:'POST',body,as,headers});
  const persona=async name=>{
    const response=await fetch(h.origin+'/auth/dev/enter?as='+name,{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}});
    assert.equal(response.status,303);
    const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const session=await(await h.request('/auth/session',{as:cookie})).json();return {cookie,session};
  };
  const enroll=async as=>{
    const response=await call('enroll',{},as);assert.equal(response.status,200);
    const {secret}=await response.json();assert.equal((await call('verify',{code:authenticatorCode(secret)},as)).status,200);return secret;
  };
  const owner=await(await h.request('/auth/session')).json(), admin=await persona('admin'), target=await persona('member');
  await enroll();const adminSecret=await enroll(admin.cookie);const targetSecret=await enroll(target.cookie);
  assert.equal((await call('require')).status,200);
  const grant=async(headers)=>{
    const response=await call('grant',{delegateId:admin.session.operator.id,operatorId:target.session.operator.id,minutes:1},undefined,headers);
    assert.equal(response.status,200,await response.clone().text());
    return (await response.json()).grants[0];
  };
  const first=await grant();
  const input={grantId:first.id,operatorId:target.session.operator.id,reason:'synthetic-pier-1'};
  // A security grant never adds a business permission or stock command result.
  assert.equal((await h.request('/api/pier/export',{as:admin.cookie})).status,403);
  const snapshot=async()=>({
    operators:(await h.db.prepare('SELECT * FROM oa_operators ORDER BY id').all()).results,
    sessions:(await h.db.prepare('SELECT * FROM oa_sessions ORDER BY id').all()).results,
    factors:(await h.db.prepare('SELECT * FROM pier_strong_factors ORDER BY operator_id').all()).results,
    proofs:(await h.db.prepare('SELECT * FROM pier_strong_proofs ORDER BY session_id').all()).results,
    records:(await h.db.prepare('SELECT * FROM pier_records ORDER BY kind,id').all()).results,
    movements:(await h.db.prepare('SELECT * FROM pier_movements ORDER BY sequence').all()).results,
    results:(await h.db.prepare('SELECT * FROM pier_commands ORDER BY id').all()).results,
    audit:(await h.db.prepare('SELECT * FROM pier_strong_audit ORDER BY id').all()).results,
  });
  const before=await snapshot();
  for(const [path,body] of [['/auth/session/revoke',{sessionId:target.session.id}],['/auth/operator/status',{operatorId:target.session.operator.id,status:'inactive'}]]) assert.equal((await h.request(path,{method:'POST',body,as:admin.cookie})).status,403,'compatibility route cannot supply unbounded administrator authority');
  for(const action of ['recover','revoke','deactivate']) {
    for(const operatorId of [owner.operator.id,admin.session.operator.id,'synthetic-pier-2']) {
      assert.ok([403,404,409].includes((await call(action,{...input,operatorId},admin.cookie)).status),'foreign, owner and self targets refuse');
    }
    assert.equal((await call(action,input,target.cookie)).status,403,'ordinary member has no grant');
  }
  for(const action of ['require','grant','ungrant','prepare-owner']) assert.equal((await call(action,input,admin.cookie)).status,403,'delegates cannot manage policy or grants');
  assert.deepEqual(await snapshot(),before,'denied administration has no authority or business effects');
  const unassured=await persona('owner');
  for(const action of ['require','recover','revoke','deactivate','grant','ungrant','prepare-owner']) assert.equal((await call(action,{...input,delegateId:admin.session.operator.id,minutes:1,confirm:'yes'},unassured.cookie)).status,409,'unassured owner is refused');
  await h.command('role.set',{operatorId:admin.session.operator.id,role:'agent'});
  assert.equal((await call('recover',input,admin.cookie)).status,409,'an agent cannot use a human grant');
  await h.command('role.set',{operatorId:admin.session.operator.id,role:'viewer'});
  assert.equal((await call('recover',{...input,operatorId:owner.operator.id})).status,403,'live owner self-recovery is refused');

  const waitPrepared=async barrier=>{
    let ready=false;for(let i=0;i<100;i++){ready=(await(await h.request('/__test/prepared/'+barrier)).json()).ready;if(ready)break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(ready,true,'real security SQL is prepared');
  };
  // Revoke a grant after preparation, before its real transaction is admitted.
  const barrier='synthetic-pier-3';
  const pending=call('recover',input,admin.cookie,{'x-pier-test-pause':barrier});await waitPrepared(barrier);
  assert.equal((await call('ungrant',{grantId:first.id})).status,200);
  const revoked=await snapshot();await h.request('/__test/prepared/'+barrier,{method:'DELETE'});
  assert.equal((await pending).status,409);assert.deepEqual(await snapshot(),revoked,'revoked prepared reset changes no authority, stock, documents or successful result');
  // Create an already-expiring grant with the test-only clock; SQL uses admission time.
  const expired=await grant({'x-pier-test-now':new Date(Date.now()-61000).toISOString()});
  const expiryBarrier='synthetic-pier-4';
  const expiryPending=call('deactivate',{...input,grantId:expired.id},admin.cookie,{'x-pier-test-pause':expiryBarrier});await waitPrepared(expiryBarrier);
  const expiryBefore=await snapshot();await h.request('/__test/prepared/'+expiryBarrier,{method:'DELETE'});
  assert.equal((await expiryPending).status,409);assert.deepEqual(await snapshot(),expiryBefore,'expired prepared deprovisioning has no partial effects');
  const active=await grant(), scoped={...input,grantId:active.id};
  assert.equal((await call('recover',scoped,admin.cookie)).status,200,'current human grant resets its named target');
  assert.equal((await h.request('/api/pier/state',{as:target.cookie})).status,401);
  const recovered=await persona('member');
  assert.equal((await h.request('/api/pier/state',{as:recovered.cookie})).status,403,'recovery itself confers no private access');
  const oldCode=authenticatorCode(targetSecret);
  assert.equal((await call('verify',{code:oldCode},recovered.cookie)).status,409,'old factor cannot be used after reset');
  await enroll(recovered.cookie);
  assert.equal((await h.request('/api/pier/state',{as:recovered.cookie})).status,200);
  assert.equal((await call('revoke',scoped,admin.cookie)).status,200);
  assert.equal((await h.request('/api/pier/state',{as:recovered.cookie})).status,401);
  assert.equal((await call('deactivate',scoped,admin.cookie)).status,200);
  assert.equal((await fetch(h.origin+'/auth/dev/enter?as=member',{redirect:'manual',headers:{'x-rer-dev-key':h.devKey}})).status,403,'deprovisioning also refuses fresh sessions');
  const audit=(await(await h.request('/auth/strong-auth/status')).json()).audit;
  for(const action of ['recover','revoke','deactivate']) assert.ok(audit.some(row=>row.action==='factor.'+action&&row.actor_id===admin.session.operator.id&&row.target_id===target.session.operator.id&&row.reason===input.reason),'successful delegated verb has exact audit actor, target and outcome');
  assert.equal((await call('prepare-owner',{operatorId:admin.session.operator.id,confirm:'yes'})).status,200);
  assert.equal((await h.request('/api/pier/state',{as:admin.cookie})).status,401,'preparation requires a fresh native session');
  const recoveryOwner=await persona('admin');assert.equal(recoveryOwner.session.operator.role,'owner');
  assert.equal((await h.request('/api/pier/state',{as:recoveryOwner.cookie})).status,403,'new owner needs fresh session assurance');
  const next=Date.now()+30000;
  assert.equal((await call('verify',{code:authenticatorCode(adminSecret,next)},recoveryOwner.cookie,{'x-pier-test-now':new Date(next).toISOString()})).status,200);
  assert.equal((await call('recover',{operatorId:owner.operator.id,reason:'synthetic-pier-5'},recoveryOwner.cookie)).status,200,'a different assured native owner can recover the owner');
  assert.equal((await h.request('/api/pier/state')).status,401,'owner recovery invalidates the old owner session');
}
