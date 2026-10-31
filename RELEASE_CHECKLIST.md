# Release readiness — local verification only

## Prepared

- Next.js frontend/backend, Drizzle-managed PostgreSQL, Better Auth sessions.
- Account→Draft organization→plan/terms→Free activation→workspace→project hierarchy.
- Pending approval, Owner/Admin/Member/Viewer guards and scoped domain APIs.
- AXHub managed DB declaration, runtime/auth roles, FORCE RLS and non-destructive
  journaled migrations with direct owner startup connection.
- Quick Assessment plus progressive cancellable Deep Review; stable task links.
- Bundled production migrator executed idempotently against real local PostgreSQL.
- No remote repository transmission, infrastructure mutation or deployment.

## Environment

NVIDIA_API_KEY, BETTER_AUTH_SECRET (secrets); BETTER_AUTH_URL (explicit HTTPS origin).
AXHub injects DIRECT_DATABASE_URL, DATABASE_URL_RUNTIME, DATABASE_URL_AUTH.
Production rejects missing restricted-role connections.
No .env.example; ignored .env.local contains local-only credentials.
Local PostgreSQL files and generated bundles are ignored.

## Checks

See QA_REPORT.md for exact latest counts and commands. Actual PostgreSQL tests use
separate limited roles and cover signup/session expiry, RLS/IDOR/RBAC, memberships,
billing state forgery, legacy import, legal engine and task persistence.
Production HTTPS browser QA covers the full actual account/company/project journey,
mobile and controlled Deep Review progress/cancellation.
Real NVIDIA connectivity was verified earlier; this refactor's automated inference
tests use controlled responses and preserve the fixed hosted model configuration.

## Outstanding before commercial release

Docker image build not run (no local container engine). Actual AXHub deployment,
secret injection, egress/resources and managed backup/restore remain unverified.
Email verification/recovery delivery, distributed workers and binary document
uploads are deferred. Documents currently support text create/read/delete.
Groble API/webhook authenticity and merchant credentials are not verified; checkout
stays disabled. Enterprise requests are Pending; contract fulfillment is manual.
Pilot terms and consequential legal conclusions need human review.

## Stop

Git push/PR/publication/automatic deployment/AXHub deployment require a later
explicit user approval. Completing local checks does not grant that approval.
