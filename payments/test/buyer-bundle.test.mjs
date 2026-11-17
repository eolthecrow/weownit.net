import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { liveCustomerAsset } from '../src/live-customer-page.js';

// Regression: Function.toString() serialized esbuild's __name helper into the
// browser client. Source-only UI tests passed while the deployed renderer threw.
test('production Worker bundle preserves the executable buyer client exactly', { timeout: 60_000 }, async () => {
 const output = await mkdtemp(join(tmpdir(),'weownit-buyer-bundle-'));
 const cwd = fileURLToPath(new URL('../',import.meta.url));
 try {
  execFileSync(process.execPath, [join(cwd,'node_modules/wrangler/bin/wrangler.js'),
   'deploy','--dry-run','--config','wrangler.live-checkout.production.jsonc','--outdir',output],
   {cwd,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:'pipe',timeout:50_000});
  const {default:worker} = await import(pathToFileURL(join(output,'live-public-index.js')).href);
  for (const recovery of ['false','true']) {
   const env={LIVE_RECOVERY_ENABLED:recovery};
   const built=await(await worker.fetch(new Request('https://checkout.weownit.net/customer/app.js'),env)).text();
   const source=await(await liveCustomerAsset('/customer/app.js',env)).text();
   assert.equal(built,source,'bundling must not rewrite code serialized for the browser');
   assert.doesNotMatch(built,/__name\(/);
   new vm.Script(built);
  }
 } finally { await rm(output,{recursive:true,force:true}); }
});
