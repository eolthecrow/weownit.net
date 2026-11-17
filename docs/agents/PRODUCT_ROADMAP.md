# Product build roadmap — weownit.net and ServiceWatch
Baseline: 2026-11-17. Planning proposal, not evidence that a feature has shipped.

## Outcome A — weownit.net as a complete product business
Definition: a customer can understand the offerings, contact or book a consultation, buy an approved digital toolkit, receive correct private delivery, recover access and obtain support. Legal/commercial readiness is an explicit separate signoff.

### P0 — safe and functional customer journey
1. **Public positioning and conversion:** concise outcome-oriented hero; consulting services and digital tools equally understandable; original VA branding, mobile-first EN/RO/FR; verified Contact and booking. Acceptance: a new visitor identifies a service, a toolkit and ServiceWatch within one screen/journey; all navigation and forms work at 360/390/430/1440px.
2. **Nine-toolkit commercial inventory:** approved identities, truthful scope, current content quality, rights/license review, checked archives and SHA256, consistent RON/EUR/USD displays. Acceptance: 9/9 item metadata, price, downloadable archive, checksum, QA and owner approval match source of truth.
3. **Stripe + secure fulfilment:** reconcile Stripe Price associations, D1 catalog, R2 objects, checkout and webhook identities; verify immutable purchase, recovery, receipt, refund/revocation, quota and safe rollback. Acceptance: signed-off end-to-end buyer test for all supported languages and currencies, failures fail closed, no secret reaches browser. Do NOT enable production checkout until legal/tax/commercial signoff and owner authorization.
4. **Operating reliability:** health checks on contact/booking, checkout/buyer Worker, editorial publication; informative failure handling, monitoring and clear support escalation. Acceptance: actionable alerts, manual recovery steps and tested rollback.

### P1 — professionalize and convert
- Clear scope, deliverable, starting price or quote path for each consulting service.
- One customer-oriented Store information hierarchy (no duplicate catalogs).
- Relevant real examples of deliverables, accurately labelled fictional examples if applicable.
- Accessibility and Lighthouse performance budget; reduce JS/CSS debt without changing approved design.
- Customer-facing legal documents and EU/RO sales workflow reviewed by qualified professionals; no generated assurance.
- Lightweight analytics with consent and privacy-conscious event tracking.

### P2 — growth
- Conversion experiments based on real traffic, references and verified case studies.
- Expanded self-service support and post-purchase guidance.
- ServiceWatch adoption funnel and optional paid monitoring after MVP acceptance.

## Outcome B — ServiceWatch MVP
Definition: a permissioned customer can add an authorized domain, launch a bounded review, understand evidence-backed findings, download a report, and see a later change/recheck.

### P0 — essential exposure review
1. **Locate and stabilize source:** inventory authoritative local repo, staging origin, Worker, D1/R2 and current tests. Reproduce existing synthetic acceptance before changes; never assume ServiceWatch lives in this repo.
2. **Guided start and consent:** one FQDN or bounded customer scope; owner verification and explicit authorization; prevent third-party scan initiation. Preview can use synthetic targets only.
3. **Asset and service inventory:** DNS + TLS/HTTP metadata and rate-limited TCP port discovery where authorized. Naabu is optional/controlled; no default internet-wide scanning.
4. **Validated finding pipeline:** Nuclei optional gated integration with approved templates; observations clearly identified; severity, affected service, timestamps, source evidence, remediation and uncertainty. No arbitrary unsafe templates.
5. **Understandable output:** executive summary, prioritized evidence findings, coverage/exclusions, downloadable HTML/PDF or equivalent report, recheck/diff and history.
6. **Safety controls:** per-tenant isolation, token/auth, queued jobs, throttling, concurrency/timeout, cancellation, target allowlists, audit events, secret redaction, retention/deletion and meaningful error/retry results.
7. **Actual pilot acceptance:** one synthetic fixture plus one explicitly authorized owned target; UI in Chromium desktop/mobile; tests for target denial, scan failure, rescans/diffs, report data provenance, and least privilege.

### P1 — continuous monitoring
- Schedule rescans per verified target and notify only on material changes.
- Track asset inventory drift, new exposed services, certificate expiry and findings transitions.
- Customer preference settings and usable alert delivery.
- Separate Advanced Validation workflow behind a higher authorization and safety gate.

### Explicitly not MVP
- Unrestricted external scanning, covert/offensive capabilities, arbitrary attack templates, broad authenticated network scans, pentest claims, enterprise SOC features, agent-driven production scans without owner consent, and unsupported comparison claims against competitors.

## Dependency-aware first six tasks
| Order | Agent | Work item | Evidence required |
| --- | --- | --- | --- |
| 1 | Product Lead | Inventory active branches, deployed vs candidate state, current blockers | verified paths and status, no assumptions |
| 2 | QA Engineer | Verify latest homepage, contacts, Store and languages | browser test logs, failed cases and screenshot links |
| 3 | Commerce Engineer | Read-only reconcile 9 SKU sources and release blockers | catalog/archive/payment mapping, PASS/FAIL/UNKNOWN |
| 4 | ServiceWatch Engineer | Locate authoritative source and reproduce staging synthetic MVP | repo path, deployed target, tests, reproducibility |
| 5 | ServiceWatch Engineer | Implement gated guided start to first report | bounded scan, user flow, evidence-based report |
| 6 | Release Manager | Prepare independent GO/NO-GO for both releases | separate launch evidence and explicit signoff |

## Release scoreboard
Use separate verdicts for: (1) website code & UX, (2) commercial launch, (3) ServiceWatch pilot, (4) future monitoring. The same PR must not flip any production environment or commercial release gate by implication.

## Workflow to assign a task
- Choose a single roadmap entry and write an issue with permitted paths, dependencies, excluded operations, acceptance criteria, fixtures and review owner.
- Use the relevant `.github/agents/*.agent.md` profile via a supported coding-agent runner. Profiles do not start a runner by themselves.
- Give the agent read-only repository access first; enable branch/PR write privileges only for the reviewed task.
- Require green CI, test evidence, independent security review and owner approval before merge. Deployment requires a second explicit authorization.
