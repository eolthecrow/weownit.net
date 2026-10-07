# Connected investigation — 2026-10-07

The existing Tools page connects local TShark packet exports, Incident Evidence Triage and Firewall Change Review. The site retains its layout and existing tools. The additional case panel is collapsed for cases without packet evidence. Processing uses browser JavaScript and local Web Workers; no capture, event or configuration is transmitted to a new backend.

## Workflow

1. In Incident Evidence Triage, open **Packet evidence → investigation → policy review**. Run the synthetic investigation lab or use the documented TShark export command on an existing capture.
2. Import selected-fields TShark JSON or quoted CSV with supported Windows/device logs. Initial packet evidence is marked `before`. The case keeps the original file hashes and event references.
3. Inspect a connection. Candidate associations require an exact directional five-tuple and a timestamp within the capture interval ±2 seconds. Missing protocol, source port, destination port or explicit time prevents association. Validate capture point, device scope, NAT, DHCP and clock alignment yourself.
4. Supply source/destination zones, both policy contexts and the desired permit/block outcome. Send the exact IPv4 TCP/UDP scenario to Firewall Change Review. It retains the observed source port. Broader requirements can be created separately in the existing scenario editor.
5. Supply complete before/after configurations and run Firewall Change Review. Results for scenarios retaining the evidence tuple are attached to the original case. Editing the tuple, importing a replacement scenario file or starting a different investigation prevents stale attachment.
6. Add a new TShark export as **After / retest capture**. Comparisons group by source IP, destination IP, protocol and destination port, allowing source ports to change. Counts are raw observations, not adjusted for capture duration or placement. An observed SYN/SYN-ACK pair is not presented as proof of a complete handshake, application success or complete remediation.
7. Export the HTML report or JSON case. Reopening JSON normalizes source events again and recalculates policy decisions from the included review snapshots. Original file hashes are retained but cannot be reverified without the original bytes.

## Coverage and limits

- Selected-fields native TShark `-T json` and CSV from `-T fields -E header=y -E separator=, -E quote=d -E occurrence=f`. The page provides the complete field list. Binary PCAP/PCAPNG must be converted locally; TShark binaries are not distributed.
- IPv4/IPv6 TCP/UDP packet evidence. Only exact IPv4 scenarios enter the current policy evaluator. Multiple distinct values for a selected JSON field are rejected as ambiguous; unsupported packet records are listed in import coverage.
- Sysmon Event 3 network records expose process GUID/image attribution only when those fields are supplied. Event 3 collection must be enabled on the endpoint; capture-only packets never establish process attribution.
- Up to 8 original source files, 10 MiB combined and 20,000 accepted/rejected records, using the existing import limits. Appending preserves analyst decisions whose rule/evidence identity still matches. Failure preserves the current case.
- At most 100 flows appear on the page; per-flow references/candidates are limited to 128, with a global limit of 2,000 candidate associations. Accepted source events remain available in JSON/CSV. Up to three recent policy reviews are retained, each at most 4 MiB.
- Existing static policy evaluator limits remain in effect: NAT, routing, App-ID, identity, inherited/managed contexts, and Check Point layered policy evaluation remain outside its coverage. Inconclusive outcomes stay inconclusive.
- Store links point to existing firewall hardening and incident response product families, preserving EN/RO/FR. They do not imply that a currently unavailable product can be purchased.

## Validation

Run `node --test tests/*.test.cjs worker/test/*.test.mjs`. The connected-case suites cover native exports, source provenance, exact tuple/time matching, Sysmon attribution, ambiguous records, IPv6 limitations, explicit scenario intent, retest observations, case restoration, bounded correlations, stale-case prevention and the EN/RO/FR workflow.

## Revert

The pre-change main commit is `7d22312125bc3ff50429803dbc2208c5e0f0b193`, preserved remotely at `backup/tools-before-connected-case-2026-10-07`.

Revert the commit titled **Connect packet evidence, incident cases and firewall change review** on main using a normal Git revert commit. This removes this feature while retaining repository history and subsequent unrelated changes. The backup branch is an exact reference for the previous site version; do not force-reset main to it after unrelated edits have been added.
