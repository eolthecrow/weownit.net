# WIT Change Confidence — local MVP

Extends the existing Firewall Change Review and Security Canvas. No new top-level page or navigation destination, backend, customer upload endpoint or payment change.

## Workflow

1. Use the existing **Change Review** mode and supply complete, ordered before/after policy exports.
2. Enter IPv4 TCP/UDP traffic requirements. Optional business metadata: contract ID, owner, service, purpose, priority (`low`, `medium`, `high`), review expiry (`YYYY-MM-DD`) and required retest.
3. Review exact static-selector partitions, matching rules, source lines when available, object dependencies and unintended access. IDs are unique within the requirement pack. Expired requirements and baseline conflicts prevent a model-consistent decision.
4. In **Decision context & saved records**, declare a device/policy reference and whether the complete ordered export context was checked. These are analyst declarations, not authenticated acquisition.
5. Download decision JSON/HTML. JSON contains normalized policy snapshots, requirement metadata, source hashes, parser/evaluator/profile versions, bounded results, counterexamples, exclusions and retest status. It omits raw configuration text. Normalized addresses, rule names, comments and requirements can still be sensitive; inspect before sharing.
6. Reopen a saved JSON decision. Integrity and engine compatibility are checked before replacement; decisions are recalculated. Saved convenience verdicts are never trusted. Reopened normalized snapshots do not reverify the original export bytes; the rebuilt record has no newly verified original-input hashes.
7. Optionally compare a fresh installed export under the same declared device reference, supplying its declared local collection time and confirming collection after the change. This reports whether the **installed policy model** matches the candidate. It never proves application availability, routing, NAT, authentic acquisition or a complete live retest. A matching installed model retains any policy regression.

Canvas exposes the same optional requirement metadata and a decision JSON download. Canvas case resume recalculates policy decisions and regenerates records through the shared runner. To reopen a standalone decision JSON or compare an installed export, use the full tool in the existing workspace.

## Support boundary

- FortiGate local `firewall policy` static IPv4 TCP/UDP subset; PAN-OS local `vsys/.../rulebase` subset where existing semantics are supported.
- Initial native FortiOS text/REST parsing and traffic evaluation use local Web Workers through a shared cancellable runner, with a 30-second job timeout and stale-result protection. Record creation, reopening and installed-export comparison also revalidate bounded snapshots and replay the evaluator on the main thread; the worker timeout does not cover that verification path. PAN-OS parsing retains the browser's bounded native DOMParser path. These paths are not claimed to be fully off-thread; worst-case responsiveness at the configured limits still needs performance qualification.
- Check Point effective layers, Cisco ASA/FTD/FMC policies, routing, NAT, return-path state, App-ID, identity and inherited manager policy are unsupported. Structural review, hardening and incident functions retain their existing roles.
- Existing limits remain: 5 MiB configuration snapshot, 5,000 rules, 100 scenarios, 256 cells per scenario, 1,024 cells per review. Decision JSON import is capped at 12 MiB with additional depth/node bounds. Canvas retains its smaller transfer/case limits.
- `model-consistent` is scoped to the supplied requirements and model. It is not deployment approval. Unknowns, expired requirements, changed policy contexts or conflicting baseline assertions cannot become model-consistent.
- Parser 1.5.0 rejects executable edit commands, including `move`, `delete`, `rename`, `clone`, `purge`, `unset`, `append` and unrecognized commands. Supply a full `set`-based export. Repeated same-context rule/object identities are rejected, including repeats across table blocks. Different VDOMs may contain the same names/IDs.
- Native FortiOS rule source lines survive JSON/XML snapshot round-trips. Generated CLI lines used to normalize REST JSON are not reported as native source lines. Snapshot-provided provenance remains declared.

SHA-256 values support integrity comparison. They are not signatures, trusted timestamps or evidence that an export came from an authenticated device. Original local files are hashed before UTF-8 decoding; pasted content is hashed as UTF-8 text. No configuration data is sent to chat, CVE providers or telemetry by these modules.

## Validation

Run from the repository root:

```sh
node --test tests/*.test.cjs worker/test/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

New suites cover strict native import handling, metadata bounds, source provenance, deterministic records, forged/tampered records, case compatibility, retest identity/time, raw-secret omission, worker cancellation/timeouts and the actual full-tool scripts in an emulated DOM for EN/RO/FR. Canvas integration tests exercise the shared runner for Fortinet and PAN-OS. These Node checks use an emulated DOM and do not constitute rendered phone tests or appliance qualification. A separate CI browser job serves the checkout on loopback and exercises 24 Chromium journeys at 360/390/430/1440 px across EN/RO/FR, including real workers, downloads, record reopening, language continuity and document overflow. It blocks external requests and uses synthetic evidence only. This is viewport automation, not physical-device or appliance qualification.

The read-only CI workflow `verify-tools.yml` runs the synthetic suites for pull requests and relevant main-branch changes. It does not collect or upload client evidence.

## Baseline, release and revert

Implementation baseline: `c6b5c03946f107da6ca90fedaec81ac00a615ff2`, including the newer assistant and Cal.com fixes. This change does not alter those files, Store checkout, shared navigation or existing contact behavior.

The implementation is a bounded local MVP. Qualifying FortiOS/PAN-OS releases on actual appliances, physical-device/manual mobile checks, user-assisted pilots, paid entitlements and commercial-host migration remain separate release work. No production readiness or four-vendor simulation claim is made.

Revert the WIT Change Confidence feature commit using a normal Git revert, preserving subsequent unrelated work. Do not reset main to the baseline. A backup branch at the pre-feature revision is retained with the GitHub change.
