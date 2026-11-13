import {pathToFileURL} from 'node:url';
export async function checkContactHealth(base, fetcher = fetch) {
  const origin = 'https://weownit.net';
  const response = await fetcher(new URL('/health/contact', base), {headers:{Origin:origin},signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});
  const data = await response.json();
  if (response.status !== 200 || data.ok !== true || data.configured !== true || data.contract !== 'contact-v1' || data.deliveryVerified !== false || response.headers.get('Access-Control-Allow-Origin') !== origin) {
    throw Error('Contact configuration check failed; this is not a successful release. Inspect Worker bindings and the CONTACT_TO_EMAIL secret.');
  }
  const preflight = await fetcher(new URL('/contact', base), {method:'OPTIONS', headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if (preflight.status !== 204 || preflight.headers.get('Access-Control-Allow-Origin') !== origin || !preflight.headers.get('Access-Control-Allow-Methods')?.split(/,\s*/).includes('POST') || !preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(/,\s*/).includes('content-type')) {
    throw Error('Contact CORS preflight failed.');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkContactHealth('https://network-security-assistant.vlad-network-security.workers.dev');
    console.log('Contact configuration and CORS: PASS. No email was sent; inbox delivery remains unverified.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
