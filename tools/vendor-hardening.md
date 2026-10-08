# Vendor hardening and retest — 2026-10-07

The third mode in the existing Firewall Change Review workspace checks explicit exported settings for FortiGate, Palo Alto, Cisco IOS/IOS XE and Check Point. The site design, existing policy/change engines, evidence investigations and Store products are retained.

Direct entry: https://weownit.net/tools.html?lang=ro#vendor-hardening

## Inputs and supported checks

| Platform | Inputs | Checks |
| --- | --- | --- |
| FortiGate | Balanced FortiOS CLI export; native REST response wrappers retaining `path`, `name`, `vdom`, `results` | HTTPS versions, administrator idle timeout and lockout threshold, interface HTTP/Telnet, IPv4 trusted hosts, NTP enablement, syslog enablement, policy logging and inspection profile references |
| Palo Alto | PAN-OS configuration XML, including an API config wrapper; full `set` CLI listing | Explicit HTTP/Telnet disablement, management permitted IPv4 sources, security rule end logging, inspection and forwarding profile references |
| Cisco | IOS/IOS XE running configuration with original indentation | Explicit SSHv2, AAA new-model, exported SNMP communities/group privacy, remote logging and NTP references; separate VTY transport, idle timeout and inbound ACL reference checks for each range |
| Check Point | Gaia Clish `show configuration`; related Management API access-rulebase and object JSON files; either or both | Gaia Telnet disablement, SNMP agent/v3-only mode, NTP enablement, remote syslog references; policy logging and an explicit unrestricted drop at the end of a supplied layer |

Checks return `pass`, `fail` or `unknown`. A pass verifies only the specific exported setting. No aggregate security/compliance score is produced. Missing defaults are not inferred. Idle timeout is evaluated against an explicitly disclosed weownit baseline of greater than zero and at most 15 minutes, not a certification benchmark.

Fortinet zero/default unused trusted-host slots are ignored when an explicit restriction is present; absence stays unknown. The supported trusted-host check covers IPv4 only. FortiManager ADOM/package context requires a future adapter.

PAN-OS permitted sources are collected from `deviceconfig/system/permitted-ip`, not invented per-user fields. XML contexts and supplied rule UUIDs are retained. CLI uses supplied names. Effective Panorama inheritance, profile quality and managed install state are not reconstructed. PAN-OS JSON remains supported in the existing policy mode, not the new hardening mode.

Cisco ASA/FTD configuration requires a separate adapter and is explicitly rejected where recognizable. Existing supported Cisco logs remain available in Incident Triage. The presence of an ACL reference, privacy group, remote logger or NTP reference does not establish complete/effective configuration or successful operation.

Check Point layer-ending checks require complete `from`/`to`/`total` page metadata, known order, and unrestricted source/destination/service/time/VPN without unsupported content or inline conditions. The check does not reconstruct an installed ordered/inline policy, implied rules or NAT. Gaia and management policy scopes remain separate.

## Retest and evidence

Current/earlier references must be explicitly provided and equal. Single supplied hostnames are checked for conflicts. This is a user declaration of identity; the site does not discover or authenticate devices.

Stable control, scope and entity keys classify changes as remediated, regression, persistent, not verified, new finding, new evidence or unchanged. A missing/unknown current value or a removed scope never counts as remediated. Unknown-to-pass represents new evidence. Changed names/UUIDs/contexts can prevent matching; they are not guessed.

JSON/HTML downloads contain all accepted controls, before/after results and source provenance. Original file bytes are hashed with SHA-256; pasted text uses UTF-8 encoding. File input takes precedence over pasted text. Secrets such as password fields and SNMP community values are not copied into findings. Raw configurations are not included in reports. Reports are evidence artifacts, not reloadable native backups.

The UI displays the first 100 matching controls and 100 retest rows; downloads include all. Each snapshot is limited to 5 MiB / 20 files and 12,000 controls, with parser depth/structure bounds. Conflicting explicit values are rejected rather than silently overwritten. Inputs, rendered evidence and pending generations are cleared or invalidated locally. No scanner, API collector, AI inference, credential storage or new backend is added.

## Validation

Core tests cover all four before/after labs, missing evidence, lost scopes, regressions, source identity mismatch, FortiOS REST wrappers and VDOMs, trusted-host slot semantics, Cisco VTY isolation, secret omission, native PAN-OS XML, Check Point UID/page/cleanup semantics, malformed/conflicting inputs and limits.

UI tests run all four labs in EN/RO/FR, export HTML/JSON, verify source byte hashes and file precedence, clear/invalidate stale evidence, preserve language links, escape HTML and prevent stale asynchronous results. Existing policy, change, connected case, endpoint evidence and CVE tests are also run. These are synthetic/native-format fixtures, not validation against physical customer devices.

## Primary references

- [Fortinet administrator trusted hosts](https://community.fortinet.com/fortigate-3/technical-tip-configuring-administrator-access-to-a-fortigate-using-trusted-hosts-93225)
- [FortiOS configuration backups and scope](https://docs.fortinet.com/document/fortigate/7.6.2/administration-guide/702257/configuration-backups-and-reset)
- [PAN-OS official CLI hierarchy: management services and permitted-ip](https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/cli-command-hierarchy/pan-os-11-1-configure-cli-command-hierarchy)
- [Panorama hierarchy, outside this mode's effective-policy coverage](https://docs.paloaltonetworks.com/panorama/getting-started/panorama-overview/centrally-manage-firewall-configuration-and-updates-with-panorama/device-groups)
- [Cisco device hardening guidance](https://www.cisco.com/c/en/us/support/docs/ip/access-lists/13608-21.html)
- [Gaia Telnet](https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_Gaia_AdminGuide/Content/Topics-GAG/Network-Access.htm)
- [Gaia SNMP](https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_Gaia_AdminGuide/Content/Topics-GAG/SNMP-Gaia-Clish.htm)
- [Gaia system logging](https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_Gaia_AdminGuide/Content/Topics-GAG/System-Logging-Gaia-Clish.htm)
- [Check Point ordered/inline layers and cleanup](https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_SecurityManagement_AdminGuide/Content/Topics-SECMG/Ordered-Layers-and-Inline-Layers.htm)

## Rollback

Backup branch: `backup/tools-before-vendor-hardening-2026-10-07`, at `b130fea23bcb674cc1aadf83c9b2eb0f07dcca3b`.

For a scoped revert, restore `tools.html`, `assets/firewall-review.js` and `assets/firewall-review.css` from that commit and remove the three vendor-hardening assets. Do not reset all main history if unrelated changes have landed since publication. The preceding endpoint evidence and connected investigations remain included in the backup.

## Integration verification — 2026-10-08

All four hardening labs were verified in the live browser. Before this patch, staging a connected-case flow while hardening was open selected Change Review but left its form hidden and both buttons pressed. A shared mode event now restores the policy/change workspace for programmatic transfers, imports and demonstrations. Hardening evidence stays available when returning to its mode.

Existing policy reports also stay hidden when language changes or a pending policy computation completes during hardening mode. Two regression tests exercise connected-case transfer in EN/RO/FR and report visibility across language/pending-result transitions.

The four vendor adapters, their supported checks, and the limits above are unchanged. This is the first scoped hardening/retest delivery, not effective Panorama/FortiManager policy reconstruction, ASA/FTD configuration review, NAT/routing simulation or Cisco advisory enrichment.

Backup before these corrections: `backup/tools-before-mode-fix-2026-10-08`, at `cfce30b1c4f8c0bf142bea9013162a19aa03e843`.
