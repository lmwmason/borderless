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
  scripts/smoke-server.ts → https://localhost:3219 (self-signed; inference disabled).

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

Free pilot activation works. Groble checkout and webhook authenticity remain
unverified: paid checkout is disabled with configuration-needed messaging.
Enterprise requests are saved Pending; fulfillment/contract signing is not faked.
See BILLING.md, QA_REPORT.md and RELEASE_CHECKLIST.md.

No Git push, PR, automatic deployment or AXHub deployment is authorized.
A later explicit user deployment instruction is required.
