export default async function({request,origin,cookie}) {
  const response=await request(origin+'/api/pier/state',{headers:{Cookie:cookie}});
  const state=await response.json();
  const prepared=state.proposals.filter(row=>row.preparedBy);
  if (!prepared.length || prepared.some(row=>row.preparedBy.for.id!==state.actor.id || !row.preparedBy.label.includes(' for '))) throw new Error('Native proposal attribution missing');
  const sent=state.deliveries.filter(row=>row.phase==='sent');
  if (!sent.length) throw new Error('No native provider receipt');
  const supplier=state.parties.find(row=>row.kind==='supplier');
  const preview=await (await request(origin+'/api/pier/privacy?kind=supplier&subjectId='+encodeURIComponent(supplier.id),{headers:{Cookie:cookie}})).json();
  if (preview.allowed || !preview.blockers.some(row=>row.code==='PRIVACY_AGENT_CUSTODY')) throw new Error('Agent custody must remain closed to native erasure');
  if (state.movements.length) throw new Error('Preparation changed physical stock');
}

export async function afterStep({step,result,request,origin,cookie}) {
  if (step.id !== 'send') return;
  if (!result.deliveries.some(row=>row.correspondenceId===result.id && row.phase==='sent' && row.providerMessageId)) throw new Error('Native send lacks its provider acceptance receipt');
  const state=await (await request(origin+'/api/pier/state',{headers:{Cookie:cookie}})).json();
  const message=state.correspondence.find(row=>row.id===result.id);
  const traffic=state.auditEvents.filter(row=>row.commandId===result.id && row.type==='provider.correspondence.send');
  if (traffic.length!==2 || traffic.some(row=>row.agent?.id!==message?.preparedBy?.agent.id || row.sponsor?.id!==state.actor.id)) throw new Error('Native provider activity lost agent attribution');
  if (!message?.preparedBy?.label.includes(' for ') || !message.approvedBy || !message.body.includes(message.preparedBy.label)) throw new Error('Native message attribution or human authority missing');
}
