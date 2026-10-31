# Approved Slack live integration verification — 2026-10-31

- Existing ignored .env.local webhook configured and validated without printing it. No Slack app/channel/install was created.
- Exactly **two** authorized native requests: one synthetic connection message and one actual Enterprise Inquiry → PostgreSQL → Outbox → Slack alert. Both returned HTTP200/ok.
- Synthetic inquiry 3b362f94-ddf6-42ba-9f12-ff4b8853aa46; outbox 8a9ac7b6-96e4-4f2a-84ff-1990de5d09d3: Pending → Sent, attempts1, sent_at recorded. Duplicate submission plus repeated scoped worker execution made no third request.
- Public origin absent: admin action link omitted, no localhost or invented domain sent. No customer/contact/legal/document data sent. HTTP acceptance was verified; independent Slack channel-screen rendering/human reading was not checked.
- Activation existed only in the standalone local verification process; no .env.local changes or background sender were introduced. Checkpoint prevents a rerun from resending an acknowledged or ambiguous previous attempt.
- Automated suite **129/129 passed**, no skipped tests. Notification integration suite **17/17 passed** using mocked transports, including missing webhook fail-closed, optional origin, scoped queue maintenance, failure categories and bounded retry. Typecheck and production build passed. Existing browser evidence below remains the earlier13/13 run; browser tests were not repeated for these server-only changes.
- Actual configured secrets, including the new webhook, were absent from unignored Git source and .next/static client assets. .env.local remains ignored/untracked. Git push and AXHub deployment were not executed.

Earlier release evidence follows as historical context; this section supersedes prior statements that no live Slack verification had occurred.

---

# Final local integration verification — 2026-10-31

- Automated PostgreSQL/unit/API/security suite: **126/126 passed**, zero skipped. Original authentication, organization, legal, workflow and billing regressions remain included. Test files run serially because each deliberately changes the trusted global operator configuration against one shared test database; concurrent requests inside individual tests still exercise locking, claims and rate limits.
- Production HTTPS browser suite: **13/13 passed**, zero skipped, 27.2seconds. Actual isolated PostgreSQL accounts cover company/project, impact tracking, marketplace sharing/contract/revocation, pricing/return, operator access and CRM assignment/notes/search/pipeline. Deep Review transport is explicitly mocked in browser tests. Mobile375px CRM has no document overflow. Screenshots: /tmp/borderless-sales-crm-qa.png and /tmp/borderless-sales-crm-mobile-qa.png. Two initial browser failures were locator scope/label problems; the corrected selectors passed targeted and full reruns without application changes.
- Typecheck and production build passed. Actual host Podman image build and container stop/start smoke passed; session/company/scenario/task/document data survived. Runtime is nonroot, PID1 lacks owner database credentials and the image contains no env files.
- Additive migrations preserve seeded records, sessions, terms and audit history through repeated and concurrent runs; runtime/auth grants and forced RLS remain intact.
- Slack adapter/outbox tests: **14/14 passed**, injected transports only. Covered safe destinations, no native sends in development, minimal payloads, dedupe, concurrent claims, 429 persisted channel cooldown, bounded retries, uncertain-send recovery, timeout abort, inquiry-bound operator retry and batch lease safety. CRM tests verify immutable notes/activity, separate platform role provisioning/revocation audit, exact inquiry/outbox dedupe and transactional rollback. Five concurrent inquiry reviews complete without nested-pool exhaustion.
- No live Slack message, app/channel creation, installation or webhook provisioning occurred. CLI4.12.0 shows a workspace developer session; direct API auth returned not_authed and app inventory requires a Slack project. Bot/app/channel permissions remain unverified.
- One actual NVIDIA synthetic Deep Review acknowledged in39ms, progressively persisted0→6 completed topics and12 findings, then returned truthful partial status at90,816ms. Seven model attempts; aggregate token usage unknown after deadline. This proves progressive partial persistence, not a complete legal review.
- Dependency audit: zero production vulnerabilities. Configured secret values absent from unignored source; env/local data remain ignored. Temporary fixture credentials and container env files are removed after QA.

## Remaining boundaries
Slack live installation, webhook and public-domain/egress verification require approval. Default delivery is disabled; the in-process worker polls durable PostgreSQL jobs and does not guarantee exactly-once delivery. Other event recipients are reserved/disabled; email is deferred. Platform operators must be explicitly provisioned in server configuration.
Groble links do not authenticate settlement; real paid activation and professional fee collection remain deferred. Expert credential/contract review is a manual, attested operator process; no real professional credential was verified by synthetic tests. Binary uploads and account-recovery email remain deferred. AXHub managed runtime, backup restoration and outbound connectivity remain unverified until approved deployment.

Git push, remote deployment, actual payments and external Slack mutations were not performed. Feature commits: abb6efe (expert backend), 2be27ff (impact API regression), 9284d19 (sales/notification backend), 8edd493 (integrated UI). Release documentation and smoke tools are committed separately. Earlier baseline evidence follows for traceability; the counts above supersede it.

---

# Local QA report

No Git push, remote deployment, or live payment was performed by QA.

## Automated verification

- `npm test`: **67/67 passed** against an isolated real PostgreSQL cluster with migrated restricted runtime/auth roles.
- `npm run typecheck`: passed.
- Better Auth tests exercise real password registration/sign-in, no-organization accounts, cookie-backed authentication, sign-out, expired sessions and database-backed sign-in rate limits.
- Organization tests verify Draft Owner/workspace/subscription creation, exact terms acceptance and audit history, Free activation, hashed expiring/revoked invites, Pending access isolation, Admin approvals/rejections, role restrictions, Viewer read-only data access and cross-organization/project IDOR rejection.
- Database tests verify forced RLS on all eight project payload tables, unscoped runtime denial, scoped project separation, cross-organization composite foreign keys, runtime denial of password/session tables, and auth-role denial of domain tables.
- Billing tests verify unavailable checkout, rejection of forged browser activation state, Pending request cancellation, expired entitlement denial, preserved data and non-activating enterprise inquiries. Atomic persisted action limits enforce join 5/minute, invitations 10/minute and approvals 20/minute.
- Existing schema, legal, source, persistence and NVIDIA regression coverage is retained. API expectations intentionally changed for the Quick Assessment / Deep Review split.
- Quick Assessment returns deterministic results immediately with `kind=quick`, `modelStatus=not_requested` and zero inference calls, even with a configured synthetic key. Consent is not required for local rules.
- Deep Review requires consent, returns an asynchronous 202 job, exposes persisted status/results through GET, and returns a truthful unavailable error without credentials. API tests use synthetic credentials and intercepted transport only; any unexpected outgoing fetch fails the test.
- Service tests verify immediate acknowledgement while inference is blocked, incremental progress, refresh persistence, cancellation/provider abort, retained findings and task references, outage behavior, stale snapshot rejection, and process-restart recovery.
- Legacy import tests verify non-mutating dry-run, scoped additive import, overwrite rejection and fabricated-source rejection before persistence.
- Repository tests verify serialized atomic writes, progress upserts with stable assessment/finding IDs, terminal-state protection, fact-change interruption, terminal result invalidation, orphan recovery and legacy storage.
- Legal tests verify recursion budgets, cycle deduplication, stale/unknown sources, missing facts, structured challenges, progress validation, cancellation and actual provider deadline abort. Models cannot override unknown facts or introduce arbitrary citations or numeric assertions.
- NVIDIA tests verify fixed Nemotron model, thinking mode, endpoint/redirect safety, source subsets and safe latency/token telemetry. Internal reasoning is neither persisted nor logged; absent usage remains unknown.

## Browser verification

`tests/browser.spec.ts` contains desktop 1440px, mobile 375px, controlled asynchronous Deep Review and actual pending-membership approval tests.

Command: `BORDERLESS_QA_URL=https://localhost:3219 npx playwright test tests/browser.spec.ts --workers=1 --reporter=list --timeout=30000`.

Final authenticated production HTTPS run: **4/4 passed (12.8 seconds)** at `https://localhost:3219`, using actual migrated PostgreSQL, restricted runtime/auth roles, server sessions and disabled inference credentials.

An independent applicant account submits a real invite code, remains Pending with no internal project navigation, and receives HTTP 403 for a known project ID even with a forged organization header. Owner approval followed by membership refresh allows that user to enter the shared project.

Inspected current desktop/mobile/Deep Review screenshots: supplied logos render, layouts remain restrained and readable, Quick/Deep result sets are separate, and pending topics are visibly distinguished from completed model review. Artifacts: `/tmp/borderless-desktop-qa.png`, `/tmp/borderless-mobile-qa.png`, `/tmp/borderless-deep-review-qa.png`, `/tmp/borderless-approved-member-qa.png`.

Each owner workspace flow first registers a real account, verifies Draft gating, accepts versioned terms, activates Free and creates a project. The independent applicant joins through administrator approval. Reloads reopen that authenticated organization/project. The desktop test covers actual company save, Quick Assessment, source detail, linked task edits and refresh persistence, scenario cloning, changed employment comparison and activity. Mobile covers navigation, dialog opening/Escape close and contained table scrolling without document overflow.

The asynchronous browser test intercepts review routes with explicit test fixtures. It checks consent, queued/running progress, completed/current topics, refresh continuity, cancellation and retained partial findings. It never starts a real server inference job.

## Boundaries

Automated tests do not read credential files or make live inference calls. Live NVIDIA connectivity evidence belongs to the orchestrator's separate verification report; these tests do not prove endpoint availability, latency or throughput.

Source checks and legal results are scoped preparation support, not a compliance certification. The authenticated application uses PostgreSQL project scoping and forced RLS. The retained JSON adapter is for isolated unit tests/demo compatibility. Operational production review, backups, email verification/recovery and deployment configuration still require separate release checks. Groble processing remains deferred.

## Final integration hardening

-67 tests passed after adding production-role fail-closed checks and append-only audit/terms privileges.
-Drizzle custom migration0002 revokes runtime UPDATE/DELETE on audit_logs and contract_acceptances; preserves all records.
-Production authentication refuses missing DATABASE_URL_RUNTIME/AUTH rather than falling back to owner credentials.
-Legacy import dry-run/execute/overwrite refusal and unknown-source rejection passed against actual scoped PostgreSQL; original input remained unchanged.
-Dependency audit reports0 vulnerabilities. Actual configured secret values were absent from unignored source and browser assets; .env.local and .local are excluded.
