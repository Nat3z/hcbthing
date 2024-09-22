import { env } from 'bun';
import crypto from 'crypto';
const secret = env.HCBTHING_SECRET!! as string;
Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    console.log(url.pathname);
    if (url.pathname === '/webhook') {
      const data = await req.text();
      const decrypted = decryptWithSecret(secret, data);
      if (!decrypted) {
        return new Response('Invalid secret', { status: 401 });
      }
      const parsed = JSON.parse(decrypted);
      console.log(parsed);
      return new Response(undefined, { status: 200 });
    }

    return new Response(undefined, { status: 500 });
  },
  port: 3000
})


function decryptWithSecret(secret: string, data: string) {
  try {
    const decipher = crypto.createDecipher('aes-256-cbc', secret);
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    console.error('Incorrect secret used for decryption');
  }
  return undefined;
}