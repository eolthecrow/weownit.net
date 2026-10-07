# Endpoint evidence — research and implementation, 2026-10-07

The existing Incident Evidence Triage now accepts English-header Autorunsc and Sigcheck CSV inventory, associates it with supplied Sysmon process/network records, and opens the related packet/firewall candidate evidence. The existing Tools layout and connected policy workflow remain in place. No new backend, AI API subscription or hosted scanning infrastructure is required.

## Research decision

| Source checked | Observed capability | Product implication |
| --- | --- | --- |
| [RiskBits](https://riskbits.net/) | Practical guides, templates and a linked security check covering internet exposure. | Another generic domain check would overlap the public entry point already offered by this competitor. |
| [CyberRamen workflows](https://cyberramen.com/en/?cat=workflows) | Shared-case phishing/ransomware workflows and domain review. The originally supplied incident-response URL was inaccessible in this research pass. | Shared cases alone are not a uniqueness claim. Focus on the site's technical evidence and firewall expertise. |
| [Wazuh persistence investigation](https://wazuh.com/blog/detecting-windows-persistence-techniques-with-wazuh/) | Sysmon collection using an enrolled endpoint agent and central Wazuh components. | Process and persistence evidence is a credible operational use case. This local import feature addresses a narrower, occasional investigation; it does not replace continuous endpoint monitoring. |
| [Velociraptor repository](https://github.com/Velocidex/velociraptor) | Existing open-source incident-response ecosystem. | Do not claim to invent endpoint investigation or replace an enterprise collection platform. |
| [Microsoft Autoruns](https://learn.microsoft.com/en-us/sysinternals/downloads/autoruns) | Autorunsc CSV, autostart inventory, signature verification and file hashes. | Import the client's export; retain entries even when an image cannot be resolved. Inventory does not prove a startup entry caused a process to execute. |
| [Microsoft Sigcheck](https://learn.microsoft.com/en-us/sysinternals/downloads/sigcheck) | CSV, signatures, publishers and hashes; VirusTotal is an optional feature. | Display the reported signature, compare exact SHA-256, and explicitly label missing/conflicting evidence. Do not classify unsigned files as malware. |
| [Microsoft Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) | Event 1 process creation/hash/ProcessGuid, Event 3 network activity and Event 5 termination. Network collection depends on configuration. | Join host/path/hash candidates and host/ProcessGuid network evidence; do not use process ID or basename alone. |
| [Sysinternals terms](https://learn.microsoft.com/en-us/sysinternals/license-terms) | Client-use terms and restrictions on publishing the software for others or commercial software hosting. | Link to official downloads; do not distribute binaries or run hosted Sysinternals scans. |
| [ZAP Baseline](https://www.zaproxy.org/docs/docker/baseline-scan/) | Short spider and passive scan with JSON output. | Useful future web-evidence adapter, but less direct than endpoint evidence for the currently implemented process/packet/policy case. Not included in this release. |

The proposed differentiation is an inference from these documented capabilities, not evidence of market demand or exclusive functionality. Validate demand with real imported client exports and a small customer pilot. Existing Store links provide the natural next step for collection/validation procedures; availability is stated honestly, with no new purchase gate.

## Workflow

1. Open **Startup entry → file → process → connection** in Incident Evidence Triage. Run the synthetic endpoint evidence lab to see the whole chain with existing packet and Fortinet candidates.
2. Download Autoruns/Sigcheck from Microsoft. Run the displayed PowerShell commands on the client's device. No VirusTotal switches are included. Signature validation may contact certificate services; local browser analysis itself does not send the exports to a service.
3. Import CSV with supported Windows log exports. Set the source host for inventory CSV, since native inventory does not identify it. For different hosts, import one host's inventory at a time, then use the new append control with that host. Hosts already present in JSON/logs take precedence.
4. Inspect startup entry/location/state, reported signature/publisher/hash, process creation and network destinations. Search by file, host or entry and filter priority review or evidence gaps. Open original evidence references, or the exact packet/firewall candidates associated with the Sysmon network event.
5. Continue in the existing connected-case panel to stage the policy scenario and review before/after configurations. Existing policy association and retest controls are preserved.
6. Export HTML/JSON. JSON includes all accepted source events and the regenerated bounded endpoint summary. Reopening recalculates endpoint associations from saved source fields and ignores saved summaries/convenience fields. Original byte hashes remain recorded values on reopen until original source files are independently verified.

## Scope and limits

- Autorunsc requires `Entry Location`, `Entry` and `Image Path`; Sigcheck requires `Path` and `Verified`. English headers and CSV/JSON only; no `.arn`, executable, binary EVTX or universal Sysinternals format support. Retain the CSV header, not startup banners.
- Inventory `Time`/`Date` are file metadata and are not converted into execution or collection times. Collection ordering is unknown for native inventory.
- Identity grouping requires a supplied host and complete Windows drive/UNC path. Comparison is case-insensitive; no environment expansion, relative-path resolution, command-line extraction or basename matching.
- A process candidate requires the same host/path. Matching inventory and Event 1 SHA-256 strengthens the candidate; missing hashes are explicitly labeled path-only. Malformed SHA-256, conflicting inventory hashes or a differing process hash stop the relevant identity association. Authenticode PE digests are not substituted for complete file SHA-256.
- Event 3 association requires the same host/ProcessGuid, exactly one Event 1 creation for that GUID, matching image and a network timestamp at/after creation. Supplied Event 5 termination at/before the network event prevents association. An absent termination event does not establish full process lifetime coverage.
- Startup presence does not prove the entry triggered execution; matching path/hash does not establish acquisition authenticity or identical contents at unknown collection times. A Signed report is not a clean-environment verdict; Unsigned is not malware confirmation.
- Priority review highlights enabled startup in a user/temp/AppData path with a Sigcheck Unsigned report. It is validation guidance, separate from the existing heuristic finding dispositions.
- Existing limits: 8 source files, 10 MiB combined, 20,000 records. Endpoint summary: up to 2,000 file groups and 2,000 process/network associations, 128 inventory records/processes/network references per list. The UI shows 50 matching files; JSON retains all accepted source events. HTML shows the first 50 file cards and states the preview limit. Evidence inspection can include all refs in each bounded card.

## Costs

This release adds static JavaScript and existing local Web Worker processing. It creates no server/API/AI usage bill. Operational costs still include the user's collection/review time and existing hosting; this is not a managed scanning service. Optional VirusTotal, hosted collection, recurring monitoring and AI summarization are not enabled.

## Validation and revert

Run `node --test tests/*.test.cjs worker/test/*.test.mjs`. New tests cover native CSV, explicit host context, timestamp semantics, exact hashes/paths, conflicts, GUID ambiguity, termination, bounded association, saved-case recomputation, unsafe text escaping, append failure preservation and the EN/RO/FR workflow through policy review.

Previous main `f5e28c2f14b63f30cb3ab4409b68a66edb5c858a` is preserved at `backup/tools-before-endpoint-evidence-2026-10-07`. Revert the **Add local endpoint evidence to connected investigations** commit using a normal Git revert to preserve subsequent unrelated history. The earlier connected-case backup remains available separately.
