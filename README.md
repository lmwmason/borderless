# Borderless

Organization-based regulatory operations for Korean SaaS teams entering the US.
A single Next.js application uses PostgreSQL, Better Auth and server-side NVIDIA.

## Local startup (Node.js22+)

1. npm ci
2. npm run db:local — starts persistent local PostgreSQL; keep the process open.
3. npm run db:migrate — additive Drizzle migrations through the owner connection.
4. npm run dev — http://localhost:3000.

db:local generates missing local database credentials and authentication secret
only in ignored .env.local, preserves existing entries and NVIDIA_API_KEY, and
never replaces a non-local database configuration. No .env.example is used.
PostgreSQL files live in ignored .local/postgres and survive normal stops.
Local and AXHub environments use exactly the same Drizzle migrations/schema.

Signup → create/join company → plan/terms → Free activation → organization
workspace → expansion project → company facts / Quick Assessment / Deep Review /
tasks / scenarios / text documents. Pending applicants see no internal data.
Organization and project selection are explicit; reload preserves data but may
require selecting the organization/project again.

## Inference

The server pins nvidia/nemotron-3.5-super-vl-120b-a12b and
https://integrate.api.nvidia.com/v1, with thinking enabled and no provider fallback.
Set NVIDIA_API_KEY in ignored .env.local or runtime secret environment.
npm run verify:nvidia uses synthetic facts for a real hosted inference check.

Quick Assessment never invokes a model. Deep Review requires separate consent,
returns a job immediately, and stores completed validated topics progressively.
Depth3/nodes12/calls15, total90s/call30s and AbortSignal cancellation remain enforced.
Partial/interrupted results are never presented as complete legal review.
Run one app instance until job execution has a distributed lease/worker queue.

## Verification

- npm test starts an isolated real PostgreSQL instance, applies migrations and
  runs unit/API/security tests with restricted runtime/auth roles. It does not
  read the real NVIDIA key or submit live inference/payment requests.
- npm run typecheck
- npm run build bundles production migrations and builds standalone Next.js.
- npm run test:e2e uses BORDERLESS_QA_URL and a prestarted server; browser tests
  perform real authentication and Free organization/project onboarding.
- Local production HTTPS smoke: node --env-file=.env.local --import tsx
  scripts/smoke-server.ts --isolated → https://localhost:3219 (self-signed; inference and Slack disabled). This creates a disposable PostgreSQL cluster and a private synthetic reviewer fixture for marketplace/CRM browser QA.

## Persistence and migration

Every runtime company/project API requires a real session and project membership.
PostgreSQL stores all users, sessions, organizations, memberships, subscriptions,
terms, projects, findings, tasks, documents, reviews and audit events.

Legacy JSON is not automatically exposed to a new account. To explicitly import:
npm run data:import -- --file <legacy.json> --project <emptyProjectId> --owner <userId>
defaults to dry-run. Add --execute only after reviewing the counts. Input is never
rewritten; duplicate/nonempty target and unknown references are rejected; imported
judgments require review. The Owner must first create/activate the destination.

## Commercial boundary

Free activation works. Startup is KRW49,000/month, Business KRW149,000/month and Enterprise uses custom pricing. Configured Groble hosted links can be opened after server validation; provider verification and recurring billing remain unimplemented. Payment return parameters never activate access. Enterprise inquiries preserve company/contact snapshots and enter an operator-only sales CRM; Won does not grant access or sign a contract.
See BILLING.md, QA_REPORT.md and RELEASE_CHECKLIST.md.

No Git push, PR, automatic deployment or AXHub deployment is authorized.
A later explicit user deployment instruction is required.

## Marketplace, change impacts and sales
Experts can register independently using the same account as company membership. They manage self-reported profiles, privacy choices and priced services. Explicit human review is required for verification and contract confirmation; approved snapshot sharing and scoped collaboration never grant general company access. Binary uploads and live expert payment/settlement remain deferred.

Regulatory Change Impact records targeted profile/scenario/source revision changes, explains affected prior findings and supports manual reassessment task creation/linking without automatic inference.

/admin/inquiries is available only to accounts provisioned in server-side BORDERLESS_PLATFORM_ADMIN_IDS, independently of company roles. It supports search, assignment, sales stages, internal notes, activity and notification status. SLACK_SALES_WEBHOOK_URL stays secret; SLACK_SALES_DELIVERY_ENABLED defaults off. Native transport requires explicit production opt-in. An approved public BORDERLESS_PUBLIC_URL is optional and only controls whether an admin link is included; absent or invalid origins produce no link. See SLACK_SETUP.md before any external Slack installation or first send. Local tests never send real Slack messages.

## Separate administration and contract templates
Use /admin/login for provisioned administrator identities. Company/expert login and company Owner/Admin roles do not authorize the console. /admin contains statistics, company management, regular-user session revocation, CRM and the Enterprise Contract Builder. /admin/subscriptions/templates manages reusable example configurations and immutable version/application history. Contract activation always requires preview and explicit human approval; template edits never change existing contracts. See DEPLOYMENT.md for safe bootstrap and TEST_PLAN.md for production demo-denial checks.
