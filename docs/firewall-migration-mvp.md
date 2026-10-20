# Local firewall migration converter — MVP 0.1.0

This implementation extends the existing `tools-existing.html#firewall-migration` workspace. It turns supported static definitions into reviewable target fragments, with source-to-target lineage and blocking diagnostics. It is an original JavaScript compiler using the site's existing cancellation and hashing utilities; no code from fwmig, DirectFire or other converter engines is embedded. There is no new third-party runtime dependency or license requirement.

## Working scope

| Source | Accepted native input | Object coverage | Policy coverage |
|---|---|---|---|
| FortiGate | One complete `config` / `edit` / `set` CLI export, optional VDOMs | Static IPv4 subnets, ranges, FQDN definitions, static groups, TCP/UDP source/destination ports and service groups | Strict local ordered rules; explicit always schedule and logging intent; select one complete context |
| Palo Alto | Configuration XML, configuration-tree JSON with `@name` entries, or full `set` CLI | Same static definitions; local VSYS and shared object lookup | Local security rulebase only, application any, universal rule type, explicit final enabled any/any deny |
| Cisco ASA | One native CLI export with indented object / object-group blocks | Static IPv4 host/subnet/range/FQDN and supported network/service group forms; numeric ports and a small explicit named-port dictionary | ACL inventory only; no policy conversion |
| Check Point | One or more related management object JSON exports with complete UID definitions | Hosts, networks, ranges, groups, service-tcp, service-udp, service groups | Inventory only; no policy conversion |
| FTD / FMC / FDM | Not implemented | No collection import; diagnostic CLI is not treated as complete management policy | Unsupported |

| Target | Artifact | Qualification |
|---|---|---|
| FortiGate | CLI fragment under explicit VDOM (requires VDOM-enabled CLI) | Objects; gated policy draft from FortiGate/Palo Alto |
| Palo Alto | Configuration-mode `set vsys …` fragment | Objects; gated policy draft from FortiGate/Palo Alto |
| Cisco ASA | Object CLI fragment | No ACL, NAT or installation commands |
| Check Point | Offline JSON request plan using add-host, add-network, add-address-range, add-service-tcp/udp, add-group and add-service-group | No FQDN or source-port-restricted service output; no authentication, execution, publish or install-policy |

All 16 object source/target combinations have synthetic tests. This is feature/format support, **not a claim of any appliance or firmware release certification**. FortiOS, PAN-OS, ASA and Check Point version-specific syntax, API schemas, existing names, default settings, DNS behavior and live packet handling require target-lab qualification. A generated CLI fragment is not a complete device backup or a promise that it will import successfully on a particular release. The Check Point file is an offline request plan, not an executable native configuration backup.

## Safety and completeness contract

- Default mode is **objects and services only**. The report explicitly excludes policies, NAT, interfaces, routing, VPNs and device settings. Unsupported fields on selected definitions, missing references, empty groups, cycles, invalid addresses/ports and duplicate identities block the entire artifact rather than silently dropping an object.
- Policy drafts are restricted to FortiGate/Palo Alto sources and targets. The operator must map each non-any interface/zone, declare a complete ordered local export and declare an empty isolated lab target. These declarations are operator assertions, not verified appliance state. The compiler does not merge with an existing policy; FortiGate numeric IDs could overwrite existing rules if the fragment were applied there.
- Disabled rules remain disabled. Unrestricted address selectors in converted rules are materialized as explicit IPv4 0.0.0.0/0 objects; IPv6 behavior is excluded. The final deny guard denies all unmatched traffic in the empty lab context. Ordered rules are emitted in source order. Numeric source ports and mixed TCP/UDP service definitions are retained through bounded target splitting/grouping. An explicit final deny guard is appended; PAN-OS sources must already have an explicit final deny so implicit intrazone defaults are never guessed.
- NAT, application restrictions, identity restrictions, security profiles, inherited/managed policy, non-always schedules, negate selectors and unknown policy matching fields block policy export. IPv6 and non-TCP/UDP service objects are unsupported. FQDN definitions carry an explicit DNS/runtime warning.
- Unknown whole-device sections are excluded with scope diagnostics where detected. The tool does not parse every vendor command and cannot establish global device equivalence. Even a clean report establishes neither routing/reachability nor packet-flow equivalence.
- Generated names are deterministic, escaped and collision checked, with a mapping back to source names/locations. Service splitting can create extra target definitions; `counts.targetObjects` counts these expansions. The browser shows at most 100 lineage rows; JSON retains the full lineage.
- Result validation is explicit: `syntax: generated-only`, `modelEquivalence: not-established`, `appliance: not-tested`, `connectivity: not-tested`, `approval: not-granted`. The word generated is not a readiness or deployment approval.

## Runtime and backend

GitHub Pages is sufficient. No server, Cloudflare Worker, vendor credentials, network API or paid engine is required for this bounded compiler. Main-thread controls hash exact file bytes, decode UTF-8 and use the browser DOMParser for PAN-OS XML; XML input is rejected for DTD/entity declarations and bounded by input/tree limits. All other parsing and generation runs in a cancellable Web Worker with a 30-second timeout. XML DOM construction is synchronous and cannot be cancelled while DOMParser is executing; the 5 MiB bound reduces but does not eliminate temporary UI stalls.

Limits: 20 related files / 5 MiB combined, 10,000 objects, 5,000 rules, JSON/XML depth 40 and 150,000 nodes, group depth 30, 256 service variants per object, 20,000 service variants overall. Only Check Point accepts multiple related input files. Pagination is conservatively blocked, including when separate partial pages are selected; supply a complete consolidated object set.

The tool has no configuration upload, analytics event containing configuration, localStorage or remote conversion call. The rest of the site's existing scripts are unchanged; browser smoke tests block external requests and check a synthetic private marker is never placed in an outbound request. Downloads include sensitive names/addresses and generated configuration; raw source comments/passwords are not copied wholesale. The report includes exact input byte hashes, generated-output hash and a canonical content hash. Hashes provide integrity identifiers, not signatures or proof of equivalence. Editing input/settings revokes stale results and exports. Clearing removes form inputs and in-memory result references; it is not a promise of forensic browser-memory erasure.

A backend becomes necessary for automated appliance import/commit checks, running licensed vendor VMs, API-driven extraction/deployment, large jobs, collaboration/history or comprehensive network simulation. Those are future capabilities and are not simulated by this UI.

## Verification and acceptance

Run `node --test tests/*.test.cjs worker/test/*.test.mjs` and `python -m unittest discover -s tests -p 'test_*.py'`. Converter tests cover the 16 object directions, both policy directions, an independent existing rule parser, disabled state, source/destination ports, mixed services, unknown fields, unresolved references, cycles, pagination, malformed structure, secrets/comments and worker protocol. Target fragments are re-imported into the supported parser as a regression check, **not as independent proof of vendor syntax or semantics**. Check Point requests are checked for known commands and dependency ordering; they are not executed.

CI also runs the existing Change Confidence browser suite and `tests/browser/firewall-migration.smoke.cjs` using a pinned isolated Playwright runtime. The converter matrix exercises EN/RO/FR at 360, 390, 430 and 1440 px, real workers, every object direction, policy gates, downloads, language switching, stale-result invalidation, exact file hashing, malformed input, local clearing and document overflow. One phone journey also injects a hung worker and a worker-load failure to verify cancellation and errors. These are Chromium viewport checks, not physical-device qualification.

Before any production firewall use: use an isolated empty target matching the intended firmware/API version, import the fragment with vendor validation, inspect warnings/defaults, and compare a synthetic packet corpus including denied, disabled, source-port and boundary cases. This MVP has no live firewall evidence. Do not market it as a lossless universal FortiConverter replacement.

## Follow-on implementation

1. Qualify explicit source/target firmware pairs with redistributable synthetic native exports and real target lab import evidence; fix version-specific emitters before claiming release support.
2. Add a shared normalized policy evaluator and independent source/target packet corpus. Report mismatch witnesses and unsupported behavior; never turn an unknown into a pass.
3. Implement one NAT direction at a time with route/interface binding, overlap, ordering, identity NAT and bidirectional tests. Keep policy export blocked for unsupported NAT until that evidence exists.
4. Add ASA ACL semantics and Check Point ordered layers/global/inherited policy with actual context modeling. FTD requires management export adapters, not ASA-text heuristics.
5. Add a reviewed target-config merge planner with name/ID conflicts and a reversible change set before supporting nonempty targets. Vendor API validation/deployment remains a separately authorized backend feature.

## Revert

This is an additive scoped change; existing Change Review and Security Canvas engines are not replaced. Preserve the pre-converter main commit as a GitHub backup branch, and revert the converter commit/merge as a unit if a regression appears. Exact branch, commit, PR and CI evidence are recorded with the implementation review. No merge or deployment is implied by this document.
