# weownit Incident Evidence Triage 2.1

A browser-only workspace for bounded, explainable triage of supplied Windows, Linux and network-device log subsets. It does not collect logs, enable audit policy, execute commands, query external threat intelligence or send evidence to a backend. Analysis runs in a dedicated Web Worker; import parsing and SHA-256 hashing occur locally.

## Supported input

- Windows Event XML: one Event or an Events wrapper, including EventData and leaf UserData fields. DTD/entity declarations are rejected.
- JSON: canonical `weownit.incident.events` schema/version 1 or 2; event arrays; an `events` array; Windows Event/System/EventData objects using scalar, `#text` or `_text` values and Name/@Name/_attributes metadata.
- NDJSON: one structured event per line.
- Flat CSV: `eventId` / EventID / EventId / Id / ID / event_id, `timestamp` / Timestamp / TimeCreated / TimeCreatedUTC / @timestamp, host / Host / Computer / ComputerName, provider / Provider / ProviderName, channel / Channel / LogName, recordId / RecordId / EventRecordID. Named event data can appear as columns or a JSON `data` cell. CSV quoting is RFC-style; duplicate headers and malformed rows are rejected.
- UTF-8 or BOM-marked UTF-16 LE/BE.

Binary EVTX is explicitly rejected. The page supplies a read-only PowerShell export command for an existing local EVTX file, using Get-WinEvent -Path and each event’s ToXml(). This command does not alter logging, permissions or source evidence. JSON serialization of arbitrary EventLogRecord properties, unlisted Syslog formats, CEF/LEEF, arbitrary SIEM schemas, PCAP, disk images, memory dumps, encrypted script blocks and archives are outside the release.

Limits: 8 local files, 10 MiB combined input, 20,000 events, 128 data fields per record, 32 KiB per data value, 1,000 findings. Invalid records are accounted for separately, with up to 100 rejection examples per source. If a file has no valid records or invalid syntax, the whole review fails rather than silently ignoring that file. Finding-limit omissions are explicit; all unique valid events remain in the report.

## Semantics and time

Event IDs alone do not establish semantics. Provider AND channel must identify Windows Security Auditing, Sysmon, PowerShell, Service Control Manager or Defender. Other events remain in the timeline and appear in unknown-provider coverage counts.

Timestamps require ISO 8601 with Z or an explicit numeric offset. Only the explicitly named TimeCreatedUTC CSV field also accepts a zone-less YYYY-MM-DD HH:MM:SS value as UTC. Original timestamp strings are retained. Invalid/missing/local timestamps remain inspectable but are excluded from time correlations. Sub-millisecond precision is truncated to milliseconds; successful-logon correlations require strictly earlier failures. Source ordering and equal timestamps are not used to assert chronology.

Exact duplicate identities require known host/provider/channel/recordId/time plus equal event ID and canonical event-data content. Missing identity metadata never causes deduplication. Duplicate source references remain in the report. Dedupe does not prove authenticity or completeness.

## Eighteen review heuristics

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

| sourceAuthBurst | At least 5 authentication failures in 5 minutes on the same platform/device/user/client IP/authentication scope/virtual domain. | T1110.001 |
| sourceAuthSuccess | Success strictly later than 5 failures with the same complete key. ASA success records lacking client IP remain context. | T1110.001 |
| linuxRootSSH | Accepted SSH login to root, requiring authorization/hardening review. | T1078 |
| privilegedCommand | Selected sudo / audit USER_CMD text affecting audit, firewall or identity controls, or download-to-shell patterns. Actual effects unverified. | None |
| auditChange | auditd CONFIG_CHANGE, low-priority maintenance context. | None |
| networkConfig | Documented FortiOS / PAN-OS / Cisco configuration or command context. Medium for selected control-disabling commands or an explicit unauthorized result. Submitted/failed commands are not called applied. | None |
| networkThreat | Medium/high/critical threat severity in supported vendor records; high/critical prioritized high. Original action retained, no endpoint-compromise assertion. | None |
| deniedBurst | At least 20 denied records and 5 distinct destination IP/port pairs within 5 minutes, same platform/device/virtual domain/client. Stable-ID updates cannot inflate the threshold. | T1046 |

ATT&CK references are investigation hypotheses, not confirmed techniques. No complete Sigma engine, advanced obfuscation handling, PowerShell fragment reassembly, live monitoring or malware scanner is provided. Required-field coverage is reported per heuristic; a zero-finding result does not establish a clean system.

Parent-child links require a matching host, a uniquely resolved ProcessGuid/ParentProcessGuid and chronological timestamps. Process IDs alone are never joined. Links show observed process relationships without asserting cross-event causality or that a full attack chain occurred.

## Workspace and reports

- UTC timeline, platform/priority/host/search filters, finding-linked event filter.
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

## Version 2 source adapters and explicit limits

| Platform | Native subset | Analysis |
|---|---|---|
| Linux | journalctl JSON/NDJSON with MESSAGE, SYSLOG_IDENTIFIER/_COMM, _HOSTNAME and epoch __REALTIME_TIMESTAMP; RFC5424/ISO/RFC3164 sshd/sudo syslog; auditd USER_AUTH/USER_LOGIN/USER_CMD/CONFIG_CHANGE | SSH failures/success, accepted root SSH, selected sensitive administrative commands, audit configuration context. Other journal/audit types remain context. |
| Fortinet FortiOS | key=value text, flat JSON/CSV equivalent; logid/type/subtype and native fields | Admin login 0100032001/2, config 0100044546/7, denied traffic, selected UTM subtypes/severity. This is not a FortiManager/FortiAnalyzer proprietary API or archive reader. |
| Palo Alto PAN-OS | Documented default headerless CSV SYSTEM/CONFIG/TRAFFIC/THREAT; equivalent named flat JSON/CSV | CONFIG results/commands, threat severity/action and traffic-denial diversity. SYSTEM authentication descriptions remain context. CONFIG Host means the admin client; serial/device_name identifies the firewall. Custom positional syslog formats and XML/API envelopes are not guessed. |
| Check Point | Flat Log Exporter JSON/CSV; selected semicolon key:value syslog | Threat and denied traffic. Select Check Point for product strings lacking the vendor name, including Firewall/IPS. Audit records remain context. Binary SmartConsole logs, CEF/LEEF and arbitrary wrappers are unsupported. Standard raw severity 0/1 = low, 2 = medium, 3 = high, 4 = very-high is recognized, along with named severity. Unknown custom scales remain context. This is not CEF severity. service must be a numeric destination port for traffic diversity. |
| Cisco ASA / FTD | %ASA / %FTD native syslog or equivalent JSON/CSV message field | 113005/113015 authentication rejections; 113004/113012 authentication success context; 111008/111010 commands; selected denies 106023/106001/106010. Authorization rejection is not authentication failure. AAA server IP is never client IP, so success without client IP is not correlated. |
| Cisco IOS / IOS XE | %SEC_LOGIN LOGIN_FAILED/LOGIN_SUCCESS; %SYS CONFIG_I; %PARSER CFGLOG_LOGGEDCMD, optional switch component | Device authentication, configuration/command context and selected control-disabling command patterns. This is not universal support for all Cisco product logs, ISE, FMC or every NX-OS schema. Unlisted compatible messages are timeline context. |

Source selection is a guard, not a semantic override: a mismatched platform is rejected/accounted for. Automatic recognition requires characteristic source fields or message prefixes. Arbitrary Windows IDs cannot be relabelled as Cisco events. Native text import preserves complete raw lines and their original line number. Mixed input can retain unrecognized text as explicit unknown context; a wholly unrecognized native file fails.

Local syslog/PAN-OS dates need the source UTC offset. RFC3164/legacy console dates also need the source year. Optional host fallback is used only when absent. Options apply to all files in a run; split imports if devices have different offsets. A fixed numeric offset does not infer daylight-saving transitions or year rollovers. UTC/GMT console headers and explicit numeric offsets are recognized; other timezone abbreviations require explicit context. Missing host/time/account/client IP suppresses correlation. Context choices are recorded in importSummary; originals remain in raw evidence. Vendor epochs use their documented units (journald microseconds; FortiOS nanoseconds/seconds; audit seconds; Check Point seconds/milliseconds). All comparisons use milliseconds.

Linux account names remain case-sensitive. Authentication sources/types/realms and virtual domains are kept apart. Audit USER_AUTH and USER_LOGIN are separate authentication scopes, so multi-record attempts are not naively added together. No audit SYSCALL/EXECVE event stitching, process-parent reconstruction, privileged-outcome assertion or script execution is added.

Reusable event exports now use schemaVersion 2 and platform; schemaVersion 1 remains accepted. Resolved timestamps preserve the import interpretation for reimport, with originalTimestamp and complete native fields/raw lines retained. Use the case report for byte hashes, source references, context choices and analyst decisions.

The six additional inert labs use native-format fixtures. Expected results: Linux 7 events / 1 high / 2 medium; FortiOS 7 / 1 high / 1 medium / 1 context; PAN-OS 2 / 1 high / 1 context; Check Point 2 / 1 high; Cisco IOS/XE 8 / 1 high / 2 medium / 1 context; Cisco ASA/FTD 7 / 2 medium. PAN-OS's synthetic lab explicitly supplies +00:00 for its local date fields. Existing Windows lab remains unchanged.

Additional primary references:

- https://www.cisco.com/c/en/us/td/docs/security/asa/syslog/asa-syslog/syslog-messages-101001-to-199021.html
- https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/esm/command/esm-cr-book/esm-cr-a1.html
- https://docs.paloaltonetworks.com/ngfw/administration/monitoring/use-syslog-for-monitoring/syslog-field-descriptions/system-log-fields
- https://docs.paloaltonetworks.com/ngfw/administration/monitoring/use-syslog-for-monitoring/syslog-field-descriptions/config-log-fields
- https://docs.paloaltonetworks.com/ngfw/administration/monitoring/use-syslog-for-monitoring/syslog-field-descriptions/threat-log-fields
- https://community.fortinet.com/fortigate-3/technical-tip-how-to-check-failed-admin-logins-from-the-gui-and-cli-176715
- https://community.fortinet.com/fortigate-3/technical-tip-difference-between-logid-0100044547-and-logid-0100044546-which-are-generated-when-configuration-is-changed-in-the-fortigate-203472
- https://www.freedesktop.org/software/systemd/man/journalctl.html
- https://access.redhat.com/articles/4409591
- https://sc1.checkpoint.com/documents/Log_Exporter/EN/CP_Log_Exporter_AdminGuide.pdf

- https://community.checkpoint.com/t5/Firewall-Security-Management/Log-Exporter-CEF-Field-Mappings/m-p/41060


## Version 2.1 investigation workspace

Results open in Summary, with separate Evidence and Next steps views. The summary covers the entire case, independent of display filters: observed event/host/account totals and interval; heuristic priorities; rejected/unresolved/unrecognized/omitted evidence; required-field gaps; and analyst dispositions. An explained finding remains in the report and source evidence. Next steps combine collection-gap guidance with validation advice for the currently unresolved rule types. No breach conclusion or executed response action is inferred.

The entity explorer indexes exact structured source/destination IP addresses, account principals and host names. Clicking a value filters the timeline by exact event membership and findings by intersection with those events. It never treats a substring in a command as an IP observation. Account case and domain strings remain distinct. Shared values across sources are navigation pivots, not proof of identity, attribution or an attack chain. Display up to 100 entities, searchable by value/type; exports retain the complete case. The six native source labs are grouped in a collapsible guide. Finding intervals display both start and end; technical JSON is collapsible.

JSON case reports can be reopened through Resume saved case (maximum 64 MiB UTF-8/BOM-marked UTF-16). This is distinct from reimporting reusable event JSON. Complete version 2 reports remain accepted. Restoration validates bounded source/event/provenance/review metadata, renormalizes source fields and recalculates findings and process links in the local worker. Convenience fields, saved priority counts, links and rule text are not trusted. Analyst reviews match the recalculated rule and exact event-reference set, rather than an ordinal finding ID; unmatched reviews are counted explicitly. Case/analyst fields, the synthetic marker, original timestamps, source references, recorded import context, duplicate provenance and original source hashes are retained. Re-exported JSON and offline HTML include the investigation summary and next steps.

A restored manifest records the hashes from the saved case; it cannot verify those hashes against original source bytes or authenticate acquisition. The UI and HTML report state this distinction. The original source files must be retained separately. The saved report itself can be edited, so it is not a signed evidence container. There is no browser autosave or server persistence. Save the case JSON before closing. A malformed/oversized case import leaves the current case intact; editing raw evidence still invalidates that case. The 64 MiB case limit accommodates expanded report JSON; raw-evidence limits remain 8 files, 10 MiB and 20,000 events. Oversized JSON exports are refused explicitly rather than producing a case that cannot be reopened.

Validation adds every-platform saved-case round trips; backward compatibility; duplicate/rejection/time-context retention; tampered convenience fields and metadata; note matching; malformed reopening with current-case preservation; localized summary/navigation/entity controls; exact entity pivots; and a 20,000-event restoration/indexing case. These are fixture and functional checks, not validation against all vendor versions or real customer incident corpora.
