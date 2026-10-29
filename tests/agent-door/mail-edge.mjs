import { parseAddress } from '../../src/modules/mail/src/core/validation.mjs';
import { validateRerMessageKey, validateRerMessage } from '../../src/modules/mail/src/adapters/rer/contract.mjs';

export default {
  async fetch(request) {
    if (request.url !== 'https://pier-mail.example.invalid/send' || request.method !== 'POST') return new Response(null,{status:404});
    if (request.headers.get('authorization') !== 'Bearer pier-disposable-relay') return new Response(null,{status:401});
    try {
      const body=await request.json();
      if (Object.keys(body).some(key=>!['to','subject','text','html','messageKey'].includes(key))) throw new Error();
      parseAddress(body.to);
      validateRerMessage({to:[body.to],subject:body.subject,text:body.text,...(body.html?{html:body.html}:{})});
      if (body.messageKey!==undefined) validateRerMessageKey(body.messageKey);
      if (body.to!=='supplier@example.invalid' || !body.text.includes(' for ')) throw new Error();
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
      const id=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
      return Response.json({messageId:`<${id}@pier-mail.example.invalid>`},{status:202});
    } catch { return Response.json({code:'invalid_message'},{status:400}); }
  }
};
