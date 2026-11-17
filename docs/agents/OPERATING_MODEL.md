# AI product team — operating model

## Purpose
This file defines the proposed human-governed engineering system. Markdown agent profiles are instructions, not proof that any unattended agent is running. Activate a runner/integration, grant narrowly scoped credentials, and validate one safe task before claiming autonomous operation.

## Agent roster and scope
| Agent | Repository focus | Deliverable | Limits |
| --- | --- | --- | --- |
| Product Lead | whole roadmap | scoped issue with measurable acceptance criteria | no deploy or finance action |
| Website Engineer | public pages, assets, UX | reviewed UI PR and visual evidence | no Stripe/production change |
| Commerce Engineer | store and payments | checkout/fulfilment fixes with test evidence | no live mode or D1/R2 write |
| ServiceWatch Engineer | separate verified ServiceWatch codebase | single-target authorized pilot implementation | no unapproved scanning |
| QA Engineer | tests and browser checks | reproducible test evidence, regression checks | no false pass or unapproved live tests |
| Security Reviewer | trust boundaries, secrets, release risks | risk classification and mitigations | read-only review by default |
| Release Manager | CI, rollback, launch checklists | GO/NO-GO recommendation with evidence | owner triggers all production releases |

## Execution lifecycle
1. Owner defines outcome, priority and excluded changes.
2. Product Lead creates one task with scope, dependencies, measurable acceptance tests and target repository.
3. Assigned implementation agent works on a dedicated branch; unrelated tasks use separate worktrees/branches.
4. QA runs relevant unit/integration/browser tests; Security Reviewer reviews threats, licenses, data handling and privilege.
5. Graphify may provide advisory dependency analysis; required CI and human review are independent gates.
6. Release Manager documents pass/fail/unknown, exact code SHA, staging verification and a safe rollback.
7. Owner explicitly approves merge and separately authorizes any production deploy, payment enablement, schema migration or customer scan.

## Automation phases
- Phase 0: manual agent execution from Codex, Claude Code or Copilot with this repo context; no unattended writes.
- Phase 1: issue-triggered coding PRs with a connected runner, least-privilege GitHub permissions and protected secrets. Require human approval on PRs; no deploy ability.
- Phase 2: scheduled read-only triage and product health snapshots, with evidence and issue creation after owner review.
- Phase 3: explicitly approved, guarded staging releases with short-lived credentials; production deployment remains a separate owner action.

## Task handoff contract
Every issue should state: product, user problem, desired outcome, repo/branch, permitted paths, excluded operations, acceptance checks, evidence, dependencies, severity, owner approval needed, and rollback strategy.

Every PR must summarize: user impact, changed files, verification commands and output, browser viewport/languages if relevant, risks/unknowns, exact CI status, and whether the production state is unchanged.

## Product boundaries
- Website and Store are hosted against existing public GitHub/Cloudflare/Stripe infrastructure; current release documents override assumptions of readiness.
- ServiceWatch lives outside this repo at present. Before work begins, verify its actual source repository, permissions, staging URL, Worker/bindings, D1/R2 schemas, and safe local test fixtures.
- Keep security briefing publication and newsletter workflows independent: no agent may bypass approvals or alter article decisions.
- Do not infer commercial, legal, tax or GDPR approval from passing tests.

## Measurable outcomes
- Website: mobile/desktop EN-RO-FR verified; consulting contact/booking reliable; nine toolkit catalog integrity and paid-to-delivery acceptance evidenced; refund/recovery/revocation covered; legal signoff recorded.
- ServiceWatch MVP: authorized asset onboarding, bounded asset discovery, ports/services, TLS/DNS/email checks, findings with evidence, PDF/HTML report, monitoring recheck, owner-visible history, rate limiting and meaningful error/retry handling. Nuclei/Naabu integrations are optional or controlled and require explicit scope authorization.
- Reliability: no release with unknown rollback safety; incident and audit logging with no secrets; documented operational ownership and budget caps.

## Stop conditions
Stop and request owner decision for: unclear scan authorization, unverified customer scope, live payment enablement, personal-data exposure, production migration, rollback bypass, unreconciled catalog/ZIP integrity, or unsupported public capability claims.
