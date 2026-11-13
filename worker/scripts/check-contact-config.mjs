import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {contactConfiguration} from '../src/contact-delivery.js';

export function checkContactConfig(config, secrets) {
  if (config.name !== 'network-security-assistant') throw Error('Unexpected Worker; check the deployment target.');
  const binding = config.send_email?.filter(b => b.name === 'EMAIL');
  if (binding?.length !== 1) throw Error('Exactly one EMAIL send_email binding is required.');
  const sender = config.vars?.CONTACT_FROM_EMAIL;
  if (!contactConfiguration({EMAIL:{send(){}},CONTACT_FROM_EMAIL:sender,CONTACT_TO_EMAIL:'check@example.com'}).configured) {
    throw Error('CONTACT_FROM_EMAIL must be a valid address in wrangler.jsonc.');
  }
  if (!binding[0].allowed_sender_addresses?.includes(sender)) throw Error('EMAIL must allow the configured CONTACT_FROM_EMAIL sender.');
  if (secrets !== undefined && (!Array.isArray(secrets) || !secrets.some(s => s.name === 'CONTACT_TO_EMAIL' && s.type === 'secret_text'))) {
    throw Error('CONTACT_TO_EMAIL secret is missing on the target Worker (case-sensitive). No deployment should proceed.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // Repository config uses JSON with whole-line comments, not arbitrary JSONC.
    const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
    const secrets = process.argv.includes('--secrets') ? JSON.parse(readFileSync(0, 'utf8')) : undefined;
    checkContactConfig(config, secrets);
    console.log(secrets ? 'Contact configuration and destination secret name: PASS (delivery not tested).' : 'Contact configuration: PASS (remote secret and delivery not tested).');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
