# Post-deployment verification — execute only after approval

This is an operator runbook, not deployment authorization. No remote checks or
mutations were performed while preparing it. Obtain explicit deployment approval
first. Restart, redeployment and backup/restore drills require their own approved
scope; never use a production interruption as an implicit smoke test. Use the
verified AXHub console/approved deployment procedure, not guessed CLI commands.

Platform references: https://docs.axhub.ai/ko/docs/features/data and
https://docs.axhub.ai/llms-deploy.ko.txt. The configured target is AXHub managed
PostgreSQL with separate runtime/auth roles and a direct owner migration connection.
Do not substitute local files or embedded PostgreSQL in the hosted runtime.

## Baseline and evidence

Record the approved commit/image digest, canonical HTTPS origin, timestamp and
pass/fail results. Use synthetic accounts and clearly marked test company data;
never copy client records, cookies, connection URLs, secrets or private documents
into this report or issue attachments. Store any fixture IDs in a restricted QA
record, not screenshots of credential-bearing requests.

Existing local evidence is useful but does not prove managed-platform behavior:

- /tmp/borderless-container-smoke.json records container health, non-root runtime,
  absence of env files, owner credentials removed from the web process, and session,
  company, scenario, task and document persistence across a container restart.
- /tmp/borderless-live-review.json records the actual fixed hosted Nemotron model,
  a 39ms job acknowledgement, six completed topics and a persisted partial result
  after approximately 90.8s. Seven calls were attempted; token totals were unknown.
  Do not relabel this bounded partial result as a completed comprehensive review.

## HTTPS, startup and database readiness

1. Confirm BETTER_AUTH_URL equals the final HTTPS origin. Verify the certificate,
   canonical host/redirect behavior and same-origin request handling. Review the
   ingress's actual forwarded-header behavior before configuring
   BORDERLESS_TRUSTED_IP_HEADER; only trust a header overwritten by the ingress.
   Without a verified header, retain the application's shared per-path limiter.
2. GET /api/health must return 200 with {ok:true,version:"0.1.0"}. This is public
   liveness only: it deliberately performs no database or inference work.
3. Confirm startup migrations finish before the web server starts. Inspect the
   Drizzle journal through an authorized operator database connection and compare
   migration tags/hashes with the deployed files. A failed migration must prevent
   startup; do not remove the journal or force past a failure.
4. Confirm the actual web process lacks DIRECT_DATABASE_URL and DATABASE_URL after
   startup. Do not print process environments. DATABASE_URL_RUNTIME and
   DATABASE_URL_AUTH must use distinct limited roles, each with a pool cap of five.
   The migration owner may bypass RLS; neither application role may be superuser,
   bypass RLS or inherit owner privileges. Never expose database credentials to
   the browser.
5. Register/login with a synthetic account and successfully GET /api/account.
   Create and activate a Free test organization and project, then GET
   /api/workspace with its x-project-id header and session. These actual scoped
   database operations distinguish readiness from a green public health response.

## Authentication and organization boundaries

Use separate browser contexts for Owner, Admin, Viewer, Pending applicant and an
unrelated organization. Create these accounts and invitations through the UI.
Verify Draft organizations remain gated until current versioned terms are accepted
and Free activation succeeds. An organization role must not grant platform-admin
or expert-reviewer privileges.

- Session cookies must be HttpOnly, Secure and SameSite=Lax on HTTPS. Reload must
  retain the session; sign-out must invalidate the old session. An expired or
  absent session must receive 401 from /api/account or protected project APIs.
- Owner/Admin may perform their permitted member operations. Admin cannot grant
  Owner/Admin privileges beyond the application's role policy. Viewer may read
  approved project data but mutations return 403. Pending applicants see only
  their pending state and cannot enter a known project.
- Replay a synthetic project/resource ID from the unrelated account, including a
  forged x-project-id or organization header. Verify 403/404, with no data returned,
  for company, tasks, documents, assessments, reviews, impacts and reports.
- Check database enforcement separately with authorized restricted-role clients:
  unscoped project queries return no rows; transaction-local organization/project
  scope reveals only that project and rejects cross-scope writes. Runtime cannot
  read user/session/password tables; auth cannot read domain tables. Confirm
  FORCE RLS and the installed policies/grants, including expert/engagement tables.
  Run only synthetic assertions; record counts/booleans, never private row dumps.

## Expert directory and contract access

Create a synthetic expert profile, private resume/portfolio item, non-public
license number and expert-priced published service through the UI. Record profile
and service IDs. Draft/Rejected profiles must not appear in the directory. A
public Pending Verification profile must remain clearly unverified; a private
profile must remain private. Directory responses must omit userId, verification
notes/evidence, private assets and non-public license numbers. Unpublished services
must remain absent. Test specialty, jurisdiction, language, status and price filters;
amount ranges require currency and must not compare different currencies.

Configure BORDERLESS_EXPERT_REVIEWER_IDS only for an explicitly authorized human
reviewer. Actual credential review requires that person's evidence and attestation;
registration, payment or a license-number string must not create Verified status.
Self-verification is forbidden. Material profile edits must reset verification.
Do not publish a synthetic test profile as a real professional listing.

Create a test engagement from a project using explicitly selected test resources.
The assigned expert alone may see submitted negotiation metadata; another expert
and a Pending company member must not. Draft requests remain hidden from experts.
Before Active, both parties' collaboration workspace/entry routes must reject
access and the expert must receive no shared snapshots. Acceptance or a quote is
not an executed contract and does not activate access.

Activation requires a configured independent reviewer, explicit executed-contract
evidence/attestation, Verified profile, numeric quote, both parties' agreement,
cleared conflict review and a future access expiry. Verify Active access exposes
only selected snapshots and scoped collaboration. Preserve authorship when the
other authorized party changes a task status; messages/opinions remain immutable.
Reviewer access must be bound to the single engagement, not a directory-wide
private-data bypass.

Test expiry, company revocation and expert cancellation using separate synthetic
engagements. Afterwards, GET /api/engagements/{id}, its /workspace route and raw
expert-role row queries must deny access; 404 for hidden rows is acceptable.
Company-owned archives remain preserved. Expert access must never open the whole
project or unshared documents. No agent files forms, approves legal compliance,
executes contracts or collects expert fees.

## Pricing, hosted links and inquiries

GET /api/pricing and the UI must agree: Free KRW0/month, Startup KRW49,000/month,
Business KRW149,000/month, Enterprise custom. These are configured product prices,
not validated market rates. Expert service fees are independently expert-entered.

Startup/Business links require the corresponding configured HTTPS Groble hosted
URL, saved matching plan and accepted current terms. If unconfigured, the action
must return an honest configuration-required response. Do not make a real charge
as a verification step. Opening a link or returning with forged success parameters
must leave paid entitlement Pending: server-verified payment/webhook activation is
not implemented. SaaS terms, payment and enterprise contracts remain distinct.

On a separate synthetic organization, select Enterprise and submit an introduction
inquiry. Record its ID and company snapshot. Only users explicitly configured in
BORDERLESS_PLATFORM_ADMIN_IDS may GET /api/admin/inquiries or review an inquiry.
Organization Owner/Admin alone must receive 403. Move the test inquiry through
allowed review states; verify this neither activates a subscription nor executes
an enterprise contract. Never place actual client contact details in QA evidence.

## Persistence, restart and recovery — separate approval required

Before an approved restart/redeployment, create all fixtures through the UI and
record IDs plus non-sensitive expected values: account/session, organization,
project, company, scenario, assessment, task with notes/evidence reference, text
document, change-impact record/task link and Enterprise inquiry. Use an existing
real registry revision for impacts; a normal check with no revisions may correctly
return no new impacts. Do not mutate the production registry merely to force one.

With explicit inference consent and approved request budget, optionally start a
Deep Review and record its job ID and first persisted progress. Restart only the
application container using the approved platform procedure; keep managed
PostgreSQL attached. After restart:

- The existing valid session still authenticates, with the same account/project IDs.
- Company/scenario/task/document/impact/inquiry values, source references, audit
  history, task links and inquiry review state are unchanged.
- GET /api/workspace, /api/documents and /api/impacts with the original project
  context resolve the same records. Operator inquiry lookup resolves its original ID.
- An authorized member GETs /api/reviews/{jobId}; an orphaned queued/running job
  becomes interrupted and retains validated partial findings. It must not be
  silently marked completed or restart billable inference automatically.
- Repeated startup migration runs leave existing row counts/checksums, sessions,
  grants and policies unchanged. Failed starts leave no orphan migration locks.

Keep one app instance while review execution remains in-process. A second
replica's behavior is not covered by this recovery claim.

## Backup and restore drill — isolated target, separate approval

First obtain the actual managed backup/retention and restore procedure from AXHub;
backup scheduling and restore support have not been verified by local tests. Record
recovery objectives and take an approved backup before any schema-changing release.
Do not guess a provider snapshot/restore command or restore over the live database.

For an approved operator-managed PostgreSQL drill, use a secure pg_service entry
outside the repository, rather than putting a credential URL on the command line.
Use a PostgreSQL client version compatible with the source. Example commands for
pre-provisioned services and an empty isolated target are:

    pg_dump --dbname=service=borderless-owner --format=custom --file=/secure/borderless-drill.dump
    pg_restore --dbname=service=borderless-restore --exit-on-error --no-owner /secure/borderless-drill.dump

The operator must provision these service entries for the approved infrastructure.
Use a separate isolated PostgreSQL instance with the same logical database and
runtime/auth role names, so later role-grant migrations still target those roles.
Provision those roles before restoring ACLs; the restore owner needs the same intended owner capabilities for security-
definer functions/views. Never use --clean against production. Restrict access to
and encrypt the dump; do not commit it or attach it to a ticket.

On the isolated target, compare fixture row counts/checksums, migration journal,
role attributes, grants, FORCE RLS, view/function owners and function EXECUTE ACLs.
Run the same session/project/IDOR/expert access checks with compatible auth secrets
held only in the isolated environment. Re-run journaled migrations and confirm
idempotence. Keep live inference and paid links disabled in the restored sandbox.
Document measured recovery time, any lost synthetic writes and cleanup approval.
A successful dump alone is not a successful restore test.

## Release decision

Record any failed or unverified check explicitly. Stop on data loss, role leakage,
false verification, unintended paid activation or unauthorized expert access;
retain evidence and use only an approved remediation/rollback procedure. No part
of this checklist waives the requirement for explicit deployment approval.
