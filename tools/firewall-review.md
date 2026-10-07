# weownit Firewall Change Review 1.4

## Change scenarios (new)

Use **Run change demo** on the Tools page to load two synthetic FortiOS exports and three traffic requirements. The subnet changes from /24 to /21; unchanged application/admin policies inherit that larger source set. The local worker produces two expected results and one unwanted administrative access. No customer configuration is included.

Scenario evaluation is an original, conservative browser implementation in `assets/firewall-change-core.js`, executed in a local Web Worker. Supply both configurations and 1–100 exact IPv4 TCP/UDP flows, source/destination interfaces or zones, before/after context, expected after result, and optionally a source port. Imported/exported scenario packs use `weownit.firewall-change.scenarios` version 1. Legacy snapshots without scenario coverage metadata remain readable for structural checks but receive inconclusive scenario verdicts; use a fresh native export. JSON/HTML review reports include before/after decisions, rule evidence, bounded traces, expected-result failures and changed-object dependency candidates. The JSON report also includes a normalized before snapshot. XML remains the after-only review snapshot.

This release evaluates **the supplied policy sequence**, not an installed firewall or a complete network model. Users must verify complete exports, effective order and context. Known-order regular FortiOS policies and local PAN-OS VSYS rulebases support static IPv4 subnets/ranges, static groups, explicit TCP/UDP service definitions and explicit matching allow/drop policies. Custom definitions are authoritative; missing services/objects are not guessed. No default/implicit action is inferred when no explicit rule matches. API snapshots with unknown order or missing pages are inconclusive. Check Point, FortiManager packages, Panorama inheritance and FortiOS policy-based NGFW retain structural review; their scenario verdicts are inconclusive in this release.

Potentially matching unsupported/unknown rules stop evaluation before later policies. A supported address/service mismatch may exclude a rule; negation cannot use that shortcut. Interface/zone groups without definitions stay unknown. Excluded address groups, dynamic/FQDN/geographic objects, scheduling, identity, App-ID/application-default, rule-type restrictions and unsupported selectors are not simulated. NAT, routing, SD-WAN, VIP translation, decryption, sessions and live reachability remain outside the evaluation. A policy permit is not proof of connectivity or Internet exposure. Object dependencies are review candidates, not proof that every referenced flow changes. There is no certification or security score.

Verification: `node --test tests/firewall-review.test.cjs tests/firewall-change.test.cjs tests/firewall-change-ui.test.cjs`. The new tests exercise actual expected/unexpected changes, subnet/port boundaries, uncertainty propagation, cycles, exclusion, disabled rules, contexts, snapshots, local worker integration, report escaping and EN/RO/FR. Browser checks additionally verify native XML and the deployed worker.

Original browser implementation. No external analyzer/library, backend, configuration upload, analytics call or configuration persistence in the Firewall Review code. This component shares the existing Tools page with the other website tools.

## Accepted snapshots

- Fortinet CLI: balanced FortiOS `config firewall policy` and `config firewall security-policy` CLI, address/service objects and groups, VDOMs. NGFW policy-based rules preserve application IDs, application categories/groups, URL categories, users/groups, IPv6 address names and inspection profile references. Security policies use a separate `/security-policy` context to prevent collisions with regular policy IDs. Missing services remain unknown. Broad-access and overlap inference is skipped for NGFW security policies; IPS/application/category matching, application-default ports, identity, IPv6 reachability and pre-security-policy evaluation are not simulated. Explicit logging and description checks still run. Profile references indicate configured inspection, not validated protection. FortiManager CLI `adom`/`pkg` scopes are kept separate. FortiManager JSON, binary/encrypted backups and installed-policy reconstruction are unsupported.
- Palo Alto Networks XML: PAN-OS `<config>` XML, optionally inside an XML API response. Local VSYS and Panorama/shared pre/post rulebases are parsed separately. Panorama inheritance/overrides, dynamic groups and application-default port expansion are unsupported.
- Check Point: Management API access-rulebase JSON with embedded objects-dictionary, or related extracted rule/object JSON files selected together. Access sections are flattened within their layer; UIDs are resolved and pages deduplicated. Contradictory duplicate rule/object definitions are rejected, independent of file order; compatible partial object references are merged. Content selectors/direction/negation are retained, and restricted/unknown Content criteria exclude broad/overlap inference. Incomplete paginated exports exclude overlap inference. No `.tar.gz`, ZIP, Gaia CLI, NAT or Threat Prevention analysis.

- Fortinet JSON: FortiOS REST response wrappers with `path`, `name`, `vdom`, and array `results`. Supported endpoints: `firewall/policy`, `firewall/security-policy`, `firewall/address`, `firewall/addrgrp`, `firewall.service/custom`, `firewall.service/group`. Select related files together, or use an array of response wrappers / `{ "responses": [...] }`. Raw policy arrays and FortiManager JSON are not supported. Duplicate identical entries are removed; conflicting duplicate entries are rejected. API array order is not treated as proof of effective rule order.
- Palo Alto Networks CLI: complete `set ... rulebase security rules` listings, including local VSYS, explicit `vsys` prefixes, Panorama `device-group` and `shared` pre/post rulebases. Relative local listings assume `vsys1`, with an explicit warning. Repeated selectors and bracket lists are merged. Change scripts (`delete`, `move`, etc.) are not accepted.
- Palo Alto Networks JSON: configuration hierarchy under `config` (including XML API JSON wrappers), direct hierarchy, and named-key CLI JSON containers. REST `result.entry` security rules need `@location` and `@vsys` / `@device-group`. Panorama REST exports additionally need a top-level `resource` such as `Policies/SecurityPreRules` or `Policies/SecurityPostRules` to identify their rulebase. REST order is unknown; absent REST profiles remain unknown. Multiple PAN-OS JSON files are not merged.
- Common review standard: JSON with `schema: "weownit.firewall-review.snapshot"`, `schemaVersion: 1`, vendor, sourceFormat, objects, warnings, and normalized policies; XML has root `firewall-review-snapshot` with schema/schema-version/vendor attributes. Both export formats can be reloaded. The JSON report includes this schema plus findings and comparison; findings are recomputed on reload. A snapshot preserves policy identifiers, contexts, normalized selectors, unknown/incomplete flags and coverage warnings. It excludes original admin secrets and unrelated configuration. It is **not** a vendor backup, restore file, cross-vendor migration configuration, or full network model. Check Point Gaia `show configuration` remains unsupported for access-policy review; use Management API / `mgmt_cli --format json` policy data.

Each snapshot is limited to 5 MiB / 5,000 policies. Pairwise literal-selector checks run only within scopes with at most 350 active policies. HTML/JSON reports include coverage per check, omission reasons and scope warnings. HTML includes every parsed policy and its contextual selectors. The page previews 200 findings and 100 policies. Overlap coverage counts eligible policies, not compared pairs or a reachability verdict.

Snapshot schema version 1 now includes optional selector arrays `urlCategories`, `appCategories`, `appGroups`, `src6`, `dst6`, `inspectionProfiles`, `content`, `contentDirection`, `contentNegation` and `servicePorts`. Older snapshots without these fields still load. New snapshots preserve these fields through JSON/XML reload and before/after comparison. NGFW scope and complexity flags prevent unsupported access/overlap verdicts after reload. Policy previews include applications, URL categories and users/groups; missing services are displayed as unknown.

## Checks

Broad allow policies; explicitly disabled allow-policy logging; disabled/absent inspection profiles where represented by the vendor; selected administrative-service names and supplied custom TCP ports (21, 22, 23, 3389, 5900) from any source; missing descriptions; possible redundancy/action conflicts based on earlier literal-selector coverage. Disabled rules are excluded. Negated, incomplete and complex rules are excluded from broad/overlap inference. An Any source is not proof of Internet exposure.

Fortinet omitted logging/UTM and PAN-OS omitted logging remain unknown. No rule-usage verdict is inferred without hit counts. Potential overlap findings are review candidates, not proof of ineffective/unused policies. There is no security/compliance score, reachability proof, firmware scan or certified compliance verdict.

Before/after comparison uses policy context plus ID (or name if no UUID exists) and reports changed fields/order, additions and removals. PAN-OS names provide a fallback when a format lacks UUIDs; ambiguous duplicate names are not matched by name. Order comparisons and overlap findings are skipped when order is unknown. Cross-format comparison requires the same policy context. It does not validate business application availability. Supplied address, service and group definitions are compared in their contexts, including same-name subnet/port/member changes. Safe definition fields are retained in JSON/XML snapshots; unrelated secrets are excluded. Legacy snapshots without definitions show an explicit object-comparison warning. Missing objects are not fetched. Topology and effective inherited policy are not diffed.

## Developer verification

`node --test tests/firewall-review.test.cjs` from the repository root. Python 3 is needed by the test XML DOM adapter only; production uses the browser's native DOMParser. Browser smoke tests check native XML processing, demos, language changes, exports and error handling separately.

## Format references

- [Fortinet NGFW security-policy CLI reference](https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/127930672/config-firewall-security-policy)
- [Fortinet NGFW policy evaluation](https://docs.fortinet.com/document/fortigate/7.6.6/administration-guide/243446/ngfw-policy)

- [Fortinet CLI policy reference](https://docs.fortinet.com/document/fortigate/8.0.0/cli-reference/333889629/config-firewall-policy)
- [PAN-OS configuration XML API](https://docs.paloaltonetworks.com/ngfw/api/pan-os-xml-api-request-types-and-actions/configuration-api)
- [PAN-OS security rule configuration](https://docs.paloaltonetworks.com/network-security/security-policy/administration/security-rules/create-a-security-policy-rule)
- [Check Point Management API](https://sc1.checkpoint.com/documents/latest/api_reference/index.html)
- [Check Point policy-package export structure](https://github.com/CheckPointSW/ShowPolicyPackage)

- [FortiOS REST JSON response structure](https://docs.fortinet.com/document/fortigate/7.4.7/administration-guide/940602/using-apis)
- [PAN-OS CLI set/XML output](https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000ClHoCAK)
- [PAN-OS CLI JSON output](https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000ClUHCA0)
- [PAN-OS REST security rule JSON](https://docs.paloaltonetworks.com/ngfw/api/pan-os-rest-api-use-cases/create-security-policy-rule-rest-api)
- [Panorama REST rulebase context](https://docs.paloaltonetworks.com/ngfw/api/pan-os-rest-api-use-cases/work-with-policy-rules-on-panorama-rest-api)
- [Check Point management CLI JSON exports](https://sc1.checkpoint.com/documents/latest/APIs/data/v1.5/introduction.html)

## 1.3 verification

CLI quote validation reports the failing line. Custom TCP service names and group members are inspected using supplied ports; explicit custom definitions override built-in name guesses. Fortinet endpoint-dependent service restrictions remain conservative. Address/service/group definition changes survive JSON/XML round trips. The regression suite includes contradictory Check Point pages, Content, custom ports, same-name subnet changes, legacy snapshots, escaped HTML and complete report export beyond the UI preview limit.


## Change Review 2.0 — local range analysis

Policy Review keeps the existing structural findings, native imports, object/rule comparison, coverage and reports. Change Review enables before/after traffic contracts within the same workspace. Both modes preserve the uploaded/pasted configurations when switching; stale results are invalidated.

Scenarios now accept source and destination IPv4 hosts, CIDR subnets and inclusive `start-end` address ranges. Destination TCP/UDP ports accept an integer or inclusive `start-end` range. Source ports remain optional exact integers. An optional `expectedBefore` assertion checks the baseline separately from the required after-change expectation. A baseline violation does not silently change the after-change verdict.

The engine partitions address and destination-port ranges at relevant static selector boundaries from both snapshots. It evaluates one representative per partition because supported selectors are constant within that partition. This is an exact partition evaluation within the supported policy model, not random sampling or live traffic testing. Subnet boundaries include all IPv4 addresses; counts are combinations of source addresses, destination addresses and destination ports, not usable host counts, connection counts or exposure to the Internet. Large combination counts are serialized as exact decimal strings.

Limits: 100 scenarios, 256 partitions per scenario and 1,024 evaluated partitions per review. A scenario exceeding its own limit or the remaining review budget is wholly inconclusive with reason `analysisLimit`; no partial pass is emitted. Input order determines review-budget allocation.

Range reports include individual regions, rule evidence, mixed verdicts, baseline results and a segmentation-contract table covering only supplied scenarios. A known contradiction of the expected verdict produces an unexpected-result status even if other regions are inconclusive; a pass requires all after regions to meet the expectation conclusively. Changed-flow status is true if any region has a proven verdict change, null if no change is established and some before/after verdict remains unknown, otherwise false. The trace displayed for an aggregated flow describes its first partition only; every region's verdict/rule/reason is included separately.

Static address changes show union counts and exact added/removed intervals for supported address definitions/groups. Dynamic/FQDN/excluded/cyclic groups have no inferred address delta. Referenced changed objects are review candidates; the report does not assert exclusive causality. NAT, routing, identity, application classification, managed/inherited/layered policy and effective Check Point traffic decisions remain outside the engine.

Scenario packs: JSON schema `weownit.firewall-change.scenarios` version 2; imports accept versions 1 and 2. CSV uses headers `name,sourceIP,destinationIP,from,to,protocol,port,sourcePort,expected,expectedBefore,beforeScope,afterScope`, quoted cells and optional source port/baseline values. CSV exports neutralize spreadsheet formula prefixes; reimport restores those escaped values. Maximum scenario-file size is 128 KiB. Import validation is atomic; malformed imports preserve existing scenarios. Duplicating scenarios, filtering displayed results and switching language preserve scenario values. Report exports always contain all scenarios, regardless of the on-screen filter.

The advanced synthetic lab adds subnet and deployment-port contracts to the original three-flow example. It demonstrates a mixed baseline, a permitted subnet, unintended administration access and partially satisfied deployment ports. Existing single-host demos and structural vendor coverage remain available.
## Connected packet evidence

Incident Evidence Triage can send exact IPv4 TCP/UDP evidence tuples to the scenario editor after the analyst supplies zones, policy contexts and expected behavior. Matching review results are retained in that local incident case. See [connected-case.md](connected-case.md). Static policy decisions retain all existing coverage limits.

