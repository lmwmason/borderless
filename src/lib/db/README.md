# PostgreSQL and authentication

The Drizzle schema in schema.ts and checked-in migrations are authoritative.
There is no JSON/filesystem production fallback. The JSON payload columns retain
the domain API's existing typed documents while project and organization scope,
foreign keys, indexes and row policies are enforced by PostgreSQL.

Connections are lazy and capped at five per pool:
- getPool(): DATABASE_URL_RUNTIME, development-only fallback DATABASE_URL.
- getAuthPool(): DATABASE_URL_AUTH, development-only fallback DATABASE_URL.
- getDb(): Drizzle over the runtime pool.
- migrateDatabase(): DIRECT_DATABASE_URL, development-only fallback DATABASE_URL; one owner/direct
  connection, serialized by a session advisory lock. Production requires the
  explicit direct URL. Lock waits are capped at 15s and each migration statement
  at 60s; the dedicated pool and session lock are released on failure/success.
  No runtime auto-DDL.

Run migrations with the direct owner connection before starting a release.
The additive migrations create auth, organizational, project payload and deferred
billing tables, then force RLS and apply explicit role grants. They do not delete
or rewrite user data. Re-running migrateDatabase is safe through the Drizzle
journal. Composite foreign-key targets use SQL UNIQUE constraints, so they exist
before dependent FKs are generated.

Managed/local roles named <database>_runtime and <database>_auth receive conditional
grants. Runtime gets domain CRUD and SELECT on account_public(id,name,email), never
password/account/session/verification tables. Auth gets only the Better Auth
tables. Both roles must be NOSUPERUSER and NOBYPASSRLS. Keep DIRECT_DATABASE_URL
out of the web runtime configuration. Never provision either app role as a member
of the owner role. Other role naming conventions need explicit audited grants.

Nine project payload tables ENABLE and FORCE RLS. Policies require both
borderless.organization_id and borderless.project_id session settings. The
server must verify membership and permissions first, then set both with
set_config(...,true) inside the same transaction. Missing scope returns no rows
and rejects writes. Organization tables intentionally rely on server membership
guards; the DB runtime role must never be exposed directly to browsers.

Better Auth uses its installed native PostgreSQL schema and its own password/
session implementation. getAuth() requires explicit BETTER_AUTH_URL and a
high-entropy BETTER_AUTH_SECRET of at least 32 characters. Production requires
HTTPS. Cookies are HttpOnly, SameSite=Lax and Secure in production/HTTPS; cookie
session caching is disabled so revocation checks the database. Minimum password
length is 12, maximum 128. Login/signup limits are always enabled and persisted
in the rateLimit table, including development. Database outages do not fall back
to unthrottled memory authentication.

By default no proxy IP header is trusted: Better Auth applies a shared per-path
rate bucket. Set BORDERLESS_TRUSTED_IP_HEADER only after verifying the ingress
overwrites that single header and the origin is inaccessible directly. Otherwise
a client-supplied header could evade IP-based limits.

## Local PostgreSQL

scripts/db-local.ts starts embedded PostgreSQL on 127.0.0.1:55439 with persistent
data in ignored .local/postgres. It creates separate restricted runtime/auth
roles. Random credentials and auth secret are written only to ignored .env.local
with mode 0600 and a restrictive umask; existing NVIDIA settings are preserved.
No connection URL or password is printed. The process must stay running.
The embedded package rehydrates its required symlinks locally because dependency
installation skips postinstall scripts. This helper is not part of deployment.

Start: node --import tsx scripts/db-local.ts
Migrate: node --env-file=.env.local --import tsx scripts/migrate.ts
Integration: node --env-file=.env.local --import tsx --test src/lib/db/database.test.ts

Official references checked against installed better-auth 1.7.14:
- https://better-auth.com/docs/installation
- https://better-auth.com/docs/concepts/rate-limit
- https://better-auth.com/docs/concepts/session-management
- https://better-auth.com/docs/adapters/drizzle
Installed @better-auth/core db/get-tables.mjs provides the exact native table
fields; direct pg Pool integration avoids additional schema adapter mappings.

## Stability regression evidence

The real PostgreSQL integration test seeds existing records in every project
payload table plus an account, a live session, membership, subscription, accepted
terms and audit log. Two sequential and three simultaneous migration runs must
preserve row counts and database-computed JSON checksums exactly. Grants, policies
and the migration journal are compared before/after; the original live session
must still authenticate. Additional checks exercise restricted-role migration
failure, advisory lock serialization, cleanup and production direct-URL gating.
Only synthetic test-owned records are removed during cleanup.

Regulatory Change Impact adds change_impacts using generated migration0003 and
additive role hardening0004. It shares the same composite project FK, forced RLS
and scoped runtime CRUD as the other payload tables. Auth has no table access.
Seeded preservation checks include existing change impact payloads.
