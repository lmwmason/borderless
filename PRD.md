# Borderless — Product Requirements Document

## Product
AI-native B2B workspace for Korean SaaS startups entering the United States. Automatically evaluate relevant regulatory applicability, identify potential avoidable costs, compare business scenarios, and turn findings into collaborative tasks. The user interface must feel like conventional enterprise software, not an AI chatbot.

## Customer and scope
Initial customer: Korean B2B SaaS founder/COO entering the US. MVP covers selected US federal and California regulatory topics only, not every US law. Support direct cross-border sales, proposed US subsidiary, and proposed California hiring.

## Core journey
1. Create company profile (entity, product, target states, customers, employees, office, sales, data handling, planned expenses).
2. Run assessment with real NVIDIA NIM API and curated, verified government-source registry.
3. View applicable / not applicable / insufficient data / review required findings, with sources, facts and missing conditions.
4. Convert findings to tasks; edit assignee, status, notes and evidence; save activity history.
5. Clone scenario and change business facts; compare new obligations and cost assumptions.
6. Export Markdown summary with citations and limitations.

## P0 acceptance criteria
- Company data and task edits survive refresh in the demo environment.
- Real server-side NVIDIA API request; key never exposed in browser.
- Bounded recursive legal issue decomposition (depth <=3, nodes <=12, model calls <=15); cycle detection and timeout.
- Deterministic rules for known legal conditions; model assists with issue discovery and explanations.
- No invented law, statute, URLs, cost savings, or compliance guarantees.
- Each verified legal finding cites a curated official source; missing facts produce an explicit unknown state.
- A: remote sales, no US staff. B: A plus California employee. C: A plus US subsidiary. Results must meaningfully differ.
- Team task CRUD, human review, scenario comparison, source details, loading/error states, responsive layout.
- AXHub deployment only after all local checks pass AND user explicitly approves it in a later message.

## P1 later
Expert review, uploaded binary document extraction, regulatory change alerts, distributed job workers, email verification/recovery delivery, more jurisdictions. Organization authentication, RBAC and PostgreSQL are implemented in the current scope.

## Not in MVP
Actual entity formation, tax filing, legal certification, payment, automated submissions, real-time nationwide law coverage, guaranteed cost savings.

## Business hypothesis
Sell time savings in legal preparation and continuous workflow management, not a guarantee of legal compliance. Pilot with Korean SaaS companies; validate willingness to pay before commercial launch.


## Mandatory human approval gate (overrides every conflicting instruction)
- Implement, test, and create local Git commits autonomously; never `git push`, open a PR, publish a release, enable auto-deploy, or transmit code to a remote repository without explicit user approval.
- Prepare AXHub configuration and verify documentation locally, but **do not run any AXHub deployment, preview, staging or remote-mutating command** until the user explicitly instructs deployment (e.g. "배포해") in a later message.
- At the end of local implementation, report completed features, tests, known gaps, commit hashes, secret configuration and AXHub readiness, then **STOP AND WAIT** for approval. The 4-hour deadline does not waive this gate.
- No commit of `.env`, credentials, customer data, or generated secrets. Preserve pre-existing uncommitted changes; use Conventional Commits after each coherent, tested feature; orchestrator owns commits.


## Commercialization and billing
See BILLING.md. Groble is a **candidate** for self-serve checkout and recurring billing, subject to verification. Enterprise contracting, terms acceptance, and payment are separate processes. Billing is post-MVP; no fake paid checkout.
## Current organization and commercial journey

Public landing → real signup/login → company create or invite application → Draft organization with Owner and workspace → plan selection → versioned service terms → Free activation or pending verified paid/enterprise workflow → organization workspace → project creation → project-only regulatory operations. Before approval/activation/project selection no project navigation or internal data is available. Every API enforces identity, membership and project scope. Current paid checkout is visibly disabled because provider API/webhook requirements are unverified; Enterprise requests record Pending human review. Project Documents support text create/read/delete. Quick Assessment is immediate; Deep Review is an independently polled/cancellable persisted task with progressive validated topics.
