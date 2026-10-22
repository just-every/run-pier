import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {installation,basics} from '../api/harness.mjs';

/** Explicit held-key journey; the normal suite never starts a paid provider call. */
export async function exerciseLiveAch(page,expect,shots){
  const h=await installation();let invoice;
  const shot=async(name)=>{if(shots){await mkdir(shots,{recursive:true});await page.screenshot({path:join(shots,name),fullPage:true});}};
  const frameWith=async(locator)=>{let selected;await expect.poll(async()=>{for(const frame of page.frames())if(await locator(frame).isVisible()){selected=frame;return true;}return false;},{timeout:60000}).toBe(true);return selected;};
  try{
    const b=await basics(h);
    await h.command('business.save',{name:'Harbor Wholesale Supply',address:'30 Dock Road, San Francisco CA',shipTo:{}});
    await h.command('sales.taxTable',{state:'CA',rate:'0',reason:'Sandbox owner estimate'});
    const order=await h.command('order.create',{customerId:b.customer.id,shipTo:{state:'CA',country:'US'},lines:[{itemId:b.item.id,quantity:'1',price:'10'}]});
    await h.command('invoice.policy',{orderId:order.id,mode:'prepay',reason:'Sandbox ACH invoice'});
    invoice=await h.command('invoice.draft',{orderId:order.id});invoice=await h.command('invoice.review',{invoiceId:invoice.id,version:invoice.version});invoice=await h.command('invoice.authorize',{invoiceId:invoice.id,version:invoice.version});
    await h.command('payment.configure',{mode:'test',secretKey:process.env.PIER_STRIPE_SECRET,webhookSecret:'synthetic-pier-2',consent:true});
    const link=await h.command('invoice.payLink',{invoiceId:invoice.id,version:invoice.version});
    const document=await h.command('print.generate',{kind:'invoice',sourceId:invoice.id});
    const sent=await h.command('print.send',{documentId:document.id,version:document.version,recipient:'buyer@example.test'});
    assert.equal(sent.pdf,document.pdf);assert.ok(sent.body.includes(link.url));
    assert.equal((await h.state()).deliveries.find(d=>d.correspondenceId===sent.id).phase,'unavailable');
    // The mail-network acceptance is covered in costing/packing journeys; here
    // Stripe is real and development mail remains honestly unavailable.
    await page.goto(link.url);await page.getByRole('button',{name:'Continue to secure payment',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).hostname,{timeout:30000}).toBe('checkout.stripe.com');
    const bank=page.getByText('US bank account',{exact:true});await expect(bank).toBeVisible();
    const box=await bank.boundingBox();assert.ok(box);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await page.locator('input[name=email]').fill('buyer+testing@example.com');await page.locator('input[name=billingName]').fill('Harbor Wholesale Test Buyer');
    await page.getByText('Enter bank details manually',{exact:true}).click();
    let frame=await frameWith(f=>f.getByRole('heading',{name:'Enter bank details',exact:true}));
    // Stripe supplies these public sandbox bank details, never a real bank login.
    await frame.getByRole('button',{name:'Autofill',exact:true}).click();
    frame=await frameWith(f=>f.getByText('Finish without saving',{exact:true}));await frame.getByText('Finish without saving',{exact:true}).click();
    frame=await frameWith(f=>f.getByRole('button',{name:/^Continue to /}));await frame.getByRole('button',{name:/^Continue to /}).click();
    await page.getByRole('button',{name:'Start payment',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).origin,{timeout:60000}).toBe(h.origin);
    await expect(page.getByRole('link',{name:'Verify bank account with Stripe',exact:true})).toBeVisible();
    assert.equal((await h.state()).invoicePayments.length,0);
    for(const width of[1440,390]){await page.setViewportSize({width,height:1000});await shot(`${width}-ach-verification.png`);}
    await page.getByRole('link',{name:'Verify bank account with Stripe',exact:true}).click();
    await page.locator('input[name=codeControllingInput]').fill('11AA');
    await page.getByRole('button',{name:'Verify and pay',exact:true}).click();
    await expect(page.getByText('Thanks for your payment',{exact:true})).toBeVisible({timeout:60000});
    await expect.poll(async()=>{await page.goto(link.url);return(await h.state()).invoicePayments.length;},{timeout:60000,intervals:[1000,2000,5000]}).toBe(1);
    for(let n=0;n<2;n++)await h.request(new URL(link.url).pathname,{as:''});
    const state=await h.state();assert.equal(state.invoicePayments.length,1);assert.equal(state.invoicePayments[0].invoiceId,invoice.id);assert.equal(state.invoicePayments[0].amount,invoice.total);assert.equal(state.invoicePayments[0].paymentMethod,'us_bank_account');assert.equal(state.invoicePayLinks[0].status,'paid');assert.equal(state.invoices[0].balance,'0.000000000000');
    for(const width of[1440,390]){await page.setViewportSize({width,height:1000});await expect(page.getByText('Paid. No further payment is due.',{exact:true})).toBeVisible();await expect(page.locator('form')).toHaveCount(0);await shot(`${width}-ach-paid.png`);}
  }catch(error){await shot('ach-live-failure.png').catch(()=>{});throw new Error(String(error.message).replaceAll(process.env.PIER_STRIPE_SECRET,'[credential]').replace(/https?:\/\/\S+/g,'[URL]'));}
  finally{
    // Only the exact unpaid test request created above may be expired. A failed
    // verification remains explicit rather than being represented as paid.
    const session=(await h.state()).invoicePaymentSessions.find(s=>s.invoiceId===invoice?.id);
    if(session&&['open','uncertain'].includes(session.status)&&session.providerSessionId)await h.command('payment.expire',{sessionId:session.id,version:session.version}).catch(()=>{});
    await h.close();
  }
}
