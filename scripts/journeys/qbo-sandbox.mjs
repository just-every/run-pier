import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installation } from '../../tests/api/harness.mjs';
import { qboScenario } from '../../tests/api/qbo-scenario.mjs';

const required = name => { if (!process.env[name]) throw new Error(`Missing injected ${name}`); return process.env[name]; };
const clientId = required('QBO_CLIENT_ID'), clientSecret = required('QBO_CLIENT_SECRET'), realmId = required('QBO_REALM_ID');
let refreshToken = required('QBO_REFRESH_TOKEN');
const ingest = required('QBO_ROTATION_INGEST');
const origin = 'https://sandbox-quickbooks.api.intuit.com';
let accessToken, rotations = 0, h;
async function persistRotation(value) {
  const root = await mkdtemp(join(tmpdir(), 'pier-qbo-rotation-'));
  try {
    const file = join(root, 'rotation.env');
    await writeFile(file, `QBO_REFRESH_TOKEN=${value}\n`, { mode: 0o600 });
    execFileSync('python3', ['-I', ingest, file], { stdio: ['ignore', 'ignore', 'ignore'] });
    refreshToken = value; rotations++;
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function realFetch(input, init) {
  const response = await fetch(input, init);
  const url = typeof input === 'string' ? input : input.url ?? input.href;
  if (url === 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer' && response.ok) {
    const body = await response.clone().json();
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) throw new Error('Intuit did not return its rotated refresh token.');
    await persistRotation(body.refresh_token);
  }
  return response;
}
async function api(path, body) {
  const response = await realFetch(`${origin}/v3/company/${encodeURIComponent(realmId)}/${path}`, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(`QBO sandbox ${path.split('?')[0]} HTTP ${response.status}; provider code ${result.Fault?.Error?.[0]?.code ?? 'unknown'}`);
  }
  return response.json();
}
try {
  const authorization = await realFetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', { method: 'POST', redirect: 'manual', headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }) });
  if (!authorization.ok) throw new Error(`QBO sandbox authorization HTTP ${authorization.status}`);
  accessToken = (await authorization.json()).access_token;
  const company = (await api(`companyinfo/${encodeURIComponent(realmId)}`)).CompanyInfo;
  assert.equal(company.Country, 'US');
  const stamp = Date.now().toString(36), sku = `synthetic-pier-${stamp}`;
  const account = async (suffix, type, subtype) => (await api('account', { Name: `${sku}-${suffix}`, AccountType: type, AccountSubType: subtype })).Account.Id;
  const inventoryAccountId = await account('inventory', 'Other Current Asset', 'OtherCurrentAssets');
  const cogsAccountId = await account('cogs', 'Cost of Goods Sold', 'SuppliesMaterialsCogs');
  const revenueAccountId = await account('sales', 'Income', 'SalesOfProductIncome');
  const clearingAccountId = await account('clearing', 'Bank', 'CashOnHand');
  const customerId = (await api('customer', { DisplayName: `${sku}-customer` })).Customer.Id;
  const supplierId = (await api('vendor', { DisplayName: `${sku}-supplier` })).Vendor.Id;
  const itemId = (await api('item', { Name: sku, Sku: sku, Type: 'NonInventory', IncomeAccountRef: { value: revenueAccountId } })).Item.Id;
  h = await installation({ async outboundService(request) {
    const url = new URL(request.url);
    if (![origin, 'https://oauth.platform.intuit.com'].includes(url.origin)) throw new Error('Unexpected sandbox transport destination.');
    return realFetch(request.url, { method: request.method, headers: Object.fromEntries([...request.headers].filter(([name]) => !['host', 'connection', 'content-length', 'transfer-encoding'].includes(name))), redirect: 'manual', ...(request.method === 'GET' ? {} : { body: await request.arrayBuffer() }) });
  } });
  const date = new Date().toISOString().slice(0, 10);
  const result = await qboScenario(h, { clientId, clientSecret, refreshToken, realmId, inventoryAccountId, cogsAccountId, revenueAccountId, clearingAccountId, chargeItemId: itemId, itemId, customerId, supplierId, sku }, { date, externalPayment: async (invoiceId, amount) => { await api('payment', {TxnDate:date,TotalAmt:amount,CustomerRef:{value:customerId},DepositToAccountRef:{value:clearingAccountId},PaymentRefNum:`${sku}-paid`.slice(-21),Line:[{Amount:amount,LinkedTxn:[{TxnId:invoiceId,TxnType:'Invoice'}]}]});} });
  const invoice = (await api(`invoice/${result.firstRemote}`)).Invoice;
  const credit = (await api(`creditmemo/${result.creditRemote}`)).CreditMemo;
  assert.equal(invoice.TotalAmt, 23); assert.equal(credit.TotalAmt, 10);
  const nativeInvoices=[];
  for(const job of result.state.bookJobs.filter(j=>j.sourceKind==='nativeInvoice')){
    const rows=(await api('query?'+new URLSearchParams({query:`select * from Invoice where DocNumber = '${job.reference}' maxresults 2`}))).QueryResponse.Invoice??[];
    assert.equal(rows.length,1);assert.equal(rows[0].Id,job.remoteId);assert.equal(rows[0].DueDate,job.document.dueDate);
    nativeInvoices.push({id:rows[0].Id,total:rows[0].TotalAmt,balance:rows[0].Balance,dueDate:rows[0].DueDate});
  }
  const receipt={ journey: 'ACCOUNT-001 US QBO sandbox public command path', candidate: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), at: new Date().toISOString(), companyCountry: company.Country, rotationsPersisted: rotations, invoice: { id: invoice.Id, total: invoice.TotalAmt, balance: invoice.Balance }, credit: { id: credit.Id, total: credit.TotalAmt },nativeInvoices, jobs: result.state.bookJobs.map(j => ({ kind: j.kind, status: j.status, remoteId: j.remoteId ?? null,total:j.total??null,actual:j.actual??null, reason: j.reason ?? null })) };
  if(process.env.QBO_RECEIPT_PATH)await writeFile(process.env.QBO_RECEIPT_PATH,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'QuickBooks sandbox journey failed.'); process.exitCode = 1;
} finally { if (h) await h.close(); }
