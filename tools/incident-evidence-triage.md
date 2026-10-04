# weownit Incident Evidence Triage 1.0

A browser-only workspace for bounded, explainable triage of supplied Windows event exports. It does not collect logs, enable audit policy, execute commands, query external threat intelligence or send evidence to a backend. Analysis runs in a dedicated Web Worker; import parsing and SHA-256 hashing occur locally.

## Supported input

- Windows Event XML: one Event or an Events wrapper, including EventData and leaf UserData fields. DTD/entity declarations are rejected.
- JSON: canonical `weownit.incident.events` schema/version 1; event arrays; an `events` array; Windows Event/System/EventData objects using scalar, `#text` or `_text` values and Name/@Name/_attributes metadata.
- NDJSON: one structured event per line.
- Flat CSV: `eventId` / EventID / EventId / Id / ID / event_id, `timestamp` / Timestamp / TimeCreated / TimeCreatedUTC / @timestamp, host / Host / Computer / ComputerName, provider / Provider / ProviderName, channel / Channel / LogName, recordId / RecordId / EventRecordID. Named event data can appear as columns or a JSON `data` cell. CSV quoting is RFC-style; duplicate headers and malformed rows are rejected.
- UTF-8 or BOM-marked UTF-16 LE/BE.

Binary EVTX is explicitly rejected. The page supplies a read-only PowerShell export command for an existing local EVTX file, using Get-WinEvent -Path and each event’s ToXml(). This command does not alter logging, permissions or source evidence. JSON serialization of arbitrary EventLogRecord properties, native Syslog, arbitrary SIEM schemas, PCAP, disk images, memory dumps, encrypted script blocks and archives are outside the release.

Limits: 8 local files, 10 MiB combined input, 20,000 events, 128 data fields per record, 32 KiB per data value, 1,000 findings. Invalid records are accounted for separately, with up to 100 rejection examples per source. If a file has no valid records or invalid syntax, the whole review fails rather than silently ignoring that file. Finding-limit omissions are explicit; all unique valid events remain in the report.

## Semantics and time

Event IDs alone do not establish semantics. Provider AND channel must identify Windows Security Auditing, Sysmon, PowerShell, Service Control Manager or Defender. Other events remain in the timeline and appear in unknown-provider coverage counts.

Timestamps require ISO 8601 with Z or an explicit numeric offset. Only the explicitly named TimeCreatedUTC CSV field also accepts a zone-less YYYY-MM-DD HH:MM:SS value as UTC. Original timestamp strings are retained. Invalid/missing/local timestamps remain inspectable but are excluded from time correlations. Sub-millisecond precision is truncated to milliseconds; successful-logon correlations require strictly earlier failures. Source ordering and equal timestamps are not used to assert chronology.

Exact duplicate identities require known host/provider/channel/recordId/time plus equal event ID and canonical event-data content. Missing identity metadata never causes deduplication. Duplicate source references remain in the report. Dedupe does not prove authenticity or completeness.

## Ten review heuristics

| Rule | Detection / context | ATT&CK investigation reference |
|---|---|---|
| authBurst | At least 5 failures within 5 minutes for the same host/account/domain/source IP/logon type. One initial finding per continuous cluster separated by gaps over 5 minutes. | T1110.001 |
| authSuccess | Successful access strictly after at least 5 failures in the prior 5 minutes for the same correlation key. | T1110.001 |
| encodedPS | PowerShell/pwsh process with an encoded-command switch and base64-looking argument. Payload is not decoded/executed. | T1059.001 |
| downloadExec | PowerShell process/4104 text with both download and execution tokens. Comments and legitimate automation can match. | T1059.001 |
| officeChild | Sysmon process-create showing Office directly spawning a shell/script interpreter. | T1204.002 |
| credentialDump | Command patterns involving procdump/LSASS, comsvcs MiniDump or sekurlsa tokens. | T1003.001 |
| logClear | Security audit log clear, 1102. Authorized maintenance can be benign. | T1070.001 |
| serviceCreated | System/Service Control Manager 7045. Low-priority context; medium for user/temp/script paths. | T1543.003 |
| taskCreated | Security 4698. Low-priority context; medium for task content containing user/temp/script paths. | T1053.005 |
| defenderDetected | Defender 1116 detection context. Does not assert active infection or successful remediation; 1117 is not automatically interpreted as success. | None |

ATT&CK references are investigation hypotheses, not confirmed techniques. No complete Sigma engine, advanced obfuscation handling, PowerShell fragment reassembly, live monitoring or malware scanner is provided. Required-field coverage is reported per heuristic; a zero-finding result does not establish a clean system.

Parent-child links require a matching host, a uniquely resolved ProcessGuid/ParentProcessGuid and chronological timestamps. Process IDs alone are never joined. Links show observed process relationships without asserting cross-event causality or that a full attack chain occurred.

## Workspace and reports

- UTC timeline, priority/host/search filters, finding-linked event filter.
- Source event references and provided event data behind every finding.
- Analyst dispositions: needs review, investigate further, explained/authorized; optional notes and case/analyst metadata.
- SHA-256 manifest of the original imported bytes (UTF-8 bytes for pasted text). This identifies imports, not a complete legal chain of custody or authenticated acquisition.
- Offline HTML report with restrictive CSP, complete case JSON, timeline CSV with data JSON, reusable canonical events JSON. Exports ignore on-screen filtering. CSV neutralizes spreadsheet formula prefixes. The reusable events pack does not preserve original-file provenance or acquisition hashes; the case report does.
- UI previews: 100 findings, first 40 evidence events per finding, first 200 filtered timeline events. Reports include all findings up to the declared engine cap and all unique parsed events.
- EN/RO/FR language switching preserves imported evidence, findings and analyst reviews. Editing input cancels active work and invalidates results/reviews. Clear removes case fields, notes, text/files and results. Nothing is persisted in browser storage.

## Validation and demo

The synthetic lab has 16 events from two hosts: five failed logons followed by success; Office→PowerShell process evidence; encoded command; script download/execution tokens; network context; service/task creation; Defender detection; Security-log clear; and a benign service installation/login. Expected output: 4 high-priority findings, 5 medium, 1 low-priority context and 1 parent-child link. The demo includes inert example strings and documentation addresses; no commands are executed.

Tests cover native XML, canonical/Event JSON, NDJSON, CSV, timestamps, provider/channel gating, correlation boundaries and keys, duplicates, missing evidence, process-link ambiguity, input/finding limits, local file hashes/encoding, UI export/filter/language behavior, case notes and XSS/formula escaping.

## Primary references

- https://learn.microsoft.com/en-us/windows/security/operating-system-security/sysmon/sysmon-events
- https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4625
- https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4624
- https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-1102
- https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4698
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_logging
- https://learn.microsoft.com/en-us/defender-endpoint/troubleshoot-microsoft-defender-antivirus
- https://attack.mitre.org/techniques/T1110/001/
