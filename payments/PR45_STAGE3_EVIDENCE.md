# PR45 Stage 3 isolated rehearsal — PASS with recorded limitations

Observed 2026-11-09 UTC. Account `78a9f61f124deea3fe71dac228a5e0c0`,
isolated Worker `weownit-pr45-guards-1407002641`. Candidate source commit
`03a6e10a0898604220c583485a5a8c83248009e9`. No real Stripe calls, events or
secrets were used. Public catalog and recovery were disabled in the synthetic
baseline. The existing `weownit-payments` Worker and its D1/R2 were not used.

## Version and deployment evidence

| Step | Version | Deployment | Result |
| --- | --- | --- | --- |
| Synthetic baseline after secret provisioning | `cfdf7827-e4ff-45b1-a394-3f7ddb82215e` | `6d7d215c-1d60-4003-99f2-7140b7593b35` | 100%; synthetic D1/R2 bindings and synthetic secrets present |
| Emergency inactive upload | `f081db1a-3d6f-458d-8f42-9db4e00fe168` | none | Baseline remained at 100%; private baseline probe passed |
| Emergency activation | `f081db1a-3d6f-458d-8f42-9db4e00fe168` | `84ddce85-8257-415d-8a31-e0e0c274c58a` | 100%; emergency probe passed |
| Restore block-aware baseline | `cfdf7827-e4ff-45b1-a394-3f7ddb82215e` | `a50f49a4-8dcf-4a23-80d5-41726095c403` | 100%; private baseline probe passed |

Cloudflare reported workers.dev disabled, preview URLs disabled, no custom
domains, no zone routes, and no schedules. The private service-binding probe
returned 503 for checkout, receipt, download, both recovery routes, admin and
webhook in emergency mode. `/health` returned 200 with `emergency-deny`,
delivery disabled and webhook retry; 503 responses had `Retry-After: 60`.

The synthetic secret matched its expected SHA-256 fingerprint
`3afab2fe0381b3f45ddc27e7d24f492759a2e85d9a1121c4f67e3dd64e198cb1`
before and after rollback, without returning its value. Both pre-ticket and
post-ticket revoked
receipt requests, and the revoked issued-ticket download, remained denied by
the block-aware baseline. Emergency version metadata listed no D1 or R2
binding. Synthetic D1 counts before and after emergency were identical: 3
products, 2 purchases, 1 event, 2 blocks, 1 revoked grant and 1 unused
recovery request. The one synthetic R2 object remained 100 bytes with SHA-256
`c173d5f8a60d0c1fccf4d180ba8a7cb3839bc93dbcc1a27d7f4f9628e35cc705`.
These checks show no observed data changes and that the emergency version has
no D1/R2 bindings; they are not a byte-for-byte comparison of all D1 rows.

## Anomalies and stopping condition

- R2 bucket-info initially reported one object, then reported zero, while a
  direct private R2 listing and object read both before and after emergency
  found the same one object and checksum. The summary count was inconsistent.
- The synthetic D1 current bookmark advanced from
  `0000000f-00000000-0000511e-c2f4b5b650128fa130b875e768b91324` to
  `00000010-00000000-0000511e-98e596ff3afbce5333227d193c77de4b`.
  Cloudflare documents that maintenance can advance bookmarks without SQL
  writes; row-count evidence above is therefore recorded separately.
- **Provenance discrepancy resolved:** the generic
  `GET /workers/scripts/<name>/content/v2` returned the emergency module after
  rollback and must not be used to identify active code. On 2026-11-09, the
  version-specific `GET /workers/workers/<name>/versions/<id>?include=modules`
  returned a baseline module SHA-256 exactly matching the local baseline build
  `d840be00faf2e2552057ab754ac66945e7792eeb4900ae4ce7be3ce84dc409c2`
  and an emergency module SHA-256 matching the local emergency build
  `34e218fa979834a504449df9272aa38764af088b0add18357360c800bb98144f`.
  The deployment API independently confirmed baseline version
  `cfdf7827-e4ff-45b1-a394-3f7ddb82215e` at 100%, matching the private probe.
  This establishes the deployed version's module by its explicit version ID;
  it does not establish a general contract for the generic content endpoint.

Per the stop-on-test-failure instruction, no remote changes or cleanup were made
after the original comparison failed; the discrepancy was resolved later via
read-only version-specific checks. The isolated Worker remains private at the
recorded baseline version. Retained synthetic D1 and R2 have not been deleted.
This turn does not authorize deleting the Worker or any other resource.

## Local artifacts and executed commands

- Baseline wrapper source SHA-256:
  `38c3ccc30879b61a849c4102496830732a2cffe76a505448587fff06d8fd245d`.
- Baseline dry-run module SHA-256:
  `d840be00faf2e2552057ab754ac66945e7792eeb4900ae4ce7be3ce84dc409c2`.
- Emergency uploaded module SHA-256:
  `34e218fa979834a504449df9272aa38764af088b0add18357360c800bb98144f`.
- Probe script SHA-256:
  `ef1136dafcab5c8ec7174faebeffc7226250232140a8a658986ea09d318096b2`.

All commands below targeted the isolated Worker configuration under
`/tmp/weownit-pr45-guards/`; `versions upload` was used for the inactive step.

```sh
npx --no-install wrangler deploy --config /tmp/weownit-pr45-guards/baseline.json
npx --no-install wrangler secret bulk /tmp/weownit-pr45-guards/secrets.json --config /tmp/weownit-pr45-guards/baseline.json
npx --no-install wrangler versions upload --config /tmp/weownit-pr45-guards/emergency.json
npx --no-install wrangler versions deploy f081db1a-3d6f-458d-8f42-9db4e00fe168@100% --config /tmp/weownit-pr45-guards/emergency.json --yes
npx --no-install wrangler rollback cfdf7827-e4ff-45b1-a394-3f7ddb82215e --config /tmp/weownit-pr45-guards/baseline.json --yes
```

The synthetic Stripe identity client was stubbed; it provides no evidence
about the real sandbox key or webhook secret. Remote billing endpoints remained
unavailable in earlier checks, so free-tier status relies on the owner's
reported Workers Free plan and the observed low R2 aggregate usage.
