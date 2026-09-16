// Test-only provider transport: never sends messages to Telegram or VK.
import fs from 'node:fs';
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  const target=new URL(url);
  if(target.hostname==='api.telegram.org' || target.hostname==='api.vk.com') {
    const body=String(options.body || '');
    const payload=target.hostname==='api.telegram.org'?JSON.parse(body):Object.fromEntries(new URLSearchParams(body));
    delete payload.access_token;
    fs.appendFileSync(process.env.TEST_BOT_OUTBOX,JSON.stringify({provider:target.hostname,payload})+'\n',{mode:0o600});
    return Response.json(target.hostname==='api.telegram.org'?{ok:true,result:{message_id:1}}:{response:1});
  }
  return originalFetch(url,options);
};
