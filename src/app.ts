import { z } from 'zod';
import HCBAccount from 'innerhcb';
import packageJSON from '../package.json'
import { env as envUnparsed } from 'bun';
import crypto from 'crypto';

console.log(`
      __   __  ___              __ 
|__| /  \` |__)  |  |__| | |\\ | / _\`
|  | \\__, |__)  |  |  | | | \\| \\__>
`);
console.log('Version: ' + packageJSON.version);
const EnvSchema = z.object({
  HCB_AUTH_TOKEN: z.string(),
  HCB_ORGANIZATION_ID: z.string(),
  HCBTHING_SECRET: z.string(),
  HCBTHING_WEBHOOK: z.string().url(),
  HCBBTHING_DELAY: z.number().optional().default(5 * 60 * 1000) // 5 minutes
});

const safeEnv = EnvSchema.safeParse(envUnparsed);
if (!safeEnv.success) {
  const fieldErrors = safeEnv.error.flatten().fieldErrors;
  if (fieldErrors.HCB_AUTH_TOKEN) {
    console.error('ERROR: HCB_AUTH_TOKEN is required.');
  }
  if (fieldErrors.HCB_ORGANIZATION_ID) {
    console.error('ERROR: HCB_ORGANIZATION_ID is required.');
  }
  if (fieldErrors.HCBTHING_SECRET) {
    console.error('ERROR: HCBTHING_SECRET is required.');
  }
  if (fieldErrors.HCBTHING_WEBHOOK) {
    console.error('ERROR: HCBTHING_WEBHOOK is required or is not a URL.');
  }
  console.error('Exiting...');
  process.exit(1);
}
export const env = safeEnv.data;
const hcb = new HCBAccount(env.HCB_AUTH_TOKEN);
console.log('Connecting to HCB Account...');
await hcb.pre();
console.log('HCB Account connected, checking authorization...');
if (!await hcb.isAuthorized(env.HCB_ORGANIZATION_ID)) {
  console.error('ERROR: Not authorized to access organization with ID: ' + env.HCB_ORGANIZATION_ID);
  process.exit(1);
}

async function main() {
  const transactions = await hcb.getTransactions(env.HCB_ORGANIZATION_ID);
  if (!transactions) {
    console.error('Error fetching transactions');
    return;
  }
  transactions.forEach(async (transaction) => {
    if (!transaction.transaction_id) return;
    if (transaction.memo.startsWith('Donation from ') && !transaction.tags.includes('Donation')) {
      console.log('Adding tag \'donation\' to transaction: ' + transaction.transaction_id);
      await hcb.createTag(env.HCB_ORGANIZATION_ID, transaction.transaction_id, 'Donation', 'red');
    }

    if (transaction.memo.startsWith('Donation from') && !transaction.tags.includes('Processed')) {
      const url = 'https://hcb.hackclub.com/hcb/' + transaction.transaction_id;
      const donation = await hcb.getDonationDetails(url);
      if (!donation) {
        console.error('Error fetching donation details for transaction: ' + transaction.transaction_id);
        return;
      }
      const data = {
        event: 'new-donation',
        data: donation
      }
      const encrypted = encryptWithSecret(env.HCBTHING_SECRET, JSON.stringify(data));
      callWebhook(encrypted);
      await hcb.createTag(env.HCB_ORGANIZATION_ID, transaction.transaction_id, 'Processed', 'muted');
      console.log('Processed transaction: ' + transaction.transaction_id);
    }
  });

}

function encryptWithSecret(secret: string, data: string) {
  const cipher = crypto.createCipher('aes-256-cbc', secret);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function callWebhook(data: any) {
  fetch(env.HCBTHING_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'HCBThing/' + packageJSON.version
    },
    body: data,
  })
}
main()
setInterval(main, env.HCBBTHING_DELAY);
