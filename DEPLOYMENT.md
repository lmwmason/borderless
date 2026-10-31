# AXHub deployment preparation — local changes await approval

## Verified official infrastructure contract

https://docs.axhub.ai/ko/docs/features/data and
https://docs.axhub.ai/llms-deploy.ko.txt were checked on2026-10-31.

AXHub provides managed standard PostgreSQL through database.engine:postgres.
The manifest declares roles:[runtime,auth] and owner_bypass_rls:true.
No external database or local PostgreSQL container/volume fallback is selected.
Managed DB persistence is independent of the app container; ordinary container
files are ephemeral and are not used for runtime application data.

Injected connections:
- DIRECT_DATABASE_URL: owner/migration, session-pool endpoint.
- DATABASE_URL_RUNTIME: limited app role, transaction-pool endpoint.
- DATABASE_URL_AUTH: limited identity role, transaction-pool endpoint.
- DATABASE_URL: platform default owner connection; never used as production
  runtime/auth fallback in this app.

The platform creates roles but grants no table rights. Our additive migrations
grant domain access to runtime and private auth tables to auth, with a safe public
account view. Project tables have composite scope FKs and FORCE RLS. Runtime
queries set tenant/project context transaction-locally using the same checked-out
pg client; unnamed parameterized queries avoid prepared-statement pooler issues.
Pools are limited to5 connections per role as required by the documented limit.

## Container and startup

One Next.js Node container listens on0.0.0.0 and PORT(default8080).
GET /api/health returns immediately without DB/inference. The Docker build bundles
a standalone migration executable, excludes all local env/data files and copies
Drizzle's migration journal. Startup applies non-destructive, advisory-locked
migrations via direct owner connection before starting the unprivileged web user.
A120s health startup period is declared and locally manifest-validated.

The local production migration bundle has been run idempotently against actual
PostgreSQL. The app has been smoke-tested as standalone with local HTTPS proxy.
Host Podman was accessible through flatpak-spawn despite not being on the sandbox PATH. A real local image build and container stop/start smoke verified unprivileged runtime, removed migration-owner credentials, preserved sessions and company/scenario/task/document data. Final feature validation is recorded in QA_REPORT.md.

## Runtime secrets and configuration

Register BETTER_AUTH_SECRET, explicit HTTPS BETTER_AUTH_URL and NVIDIA_API_KEY as
appropriate runtime secrets/plain configuration. Model/base URL are fixed server
constants. All DB connection variables above come from AXHub; do not overwrite
them with local URLs. Never upload .env.local or local PostgreSQL files.

The official network permits outbound public HTTPS443, including NVIDIA. Actual
AXHub egress, secret injection, tenant binding and resource adequacy have not been
tested because deployment is not authorized. Minimum platform specs may be tight;
verify actual resources under deployment approval. Ingress address/rate-limit
proxy headers must be validated before setting BORDERLESS_TRUSTED_IP_HEADER.

## Remaining production work

- Keep one application instance: Deep Review state is durable but worker execution
  is in-process. Restarts mark unfinished jobs interrupted, retaining partial work.
- Configure backup/restore policy and exercise recovery for managed PostgreSQL.
- Email verification/password-reset delivery and account recovery are not wired.
- Configured Groble hosted links require explicit Korean checkout consent. Provider
  settlement/webhook verification and automatic paid activation remain unimplemented;
  no real payment has been executed in this verification wave.
- Review service terms and legal scope with a qualified human before commercial use.

## Approval gate

Local implementation, testing and local commits only. No remote app creation,
environment mutation, Git push, preview, staging, release publication or deployment.
STOP and wait for a subsequent explicit user instruction such as “배포해”.

## Optional sales operations configuration
BORDERLESS_PLATFORM_ADMIN_IDS is a comma-separated trusted operator account-ID allowlist. Only a trusted server operator may provision it; ordinary signup or company roles cannot grant it. Changes are synchronized into audited operator grant records by the authorized platform service. BORDERLESS_EXPERT_REVIEWER_IDS separately gates human qualification and engagement contract review. Neither value should be guessed from client input.

SLACK_SALES_WEBHOOK_URL is a server secret. Native delivery additionally requires SLACK_SALES_DELIVERY_ENABLED=true and production mode; leave it false until separate Slack approval. BORDERLESS_PUBLIC_URL must be an explicitly confirmed public HTTPS origin before generating sales detail links. No localhost link or private inquiry body is sent. Durable notification jobs recover leases after restart; single-process scheduling is supported and database claims protect concurrent workers. Delivery cannot be exactly once across network ambiguity. See SLACK_SETUP.md for actual CLI observations and approval steps.

No new remote environment settings, Slack messages or AXHub deployment were performed for the logo/Korean-checkout update. Hosted links use GROBLE_STARTUP_URL/GROBLE_BUSINESS_URL; legacy *_PAYMENT_URL names apply only when the new names are absent. The two new values are present only in ignored local configuration and are not copied into this document. Link configuration does not provide verified paid activation.

## Administrator bootstrap
Set a distinct high-entropy BORDERLESS_ADMIN_AUTH_SECRET (at least32characters, different from BETTER_AUTH_SECRET). No administrator identity is auto-created on startup. A trusted operator supplies BORDERLESS_ADMIN_LOGIN/PASSWORD/NAME in a protected server environment and runs npm run admin:init after migrations. Non-demo passwords require at least16characters with mixed case, number and symbol; plaintext passwords are never inserted into the database. Existing accounts are not overwritten. Remove bootstrap password variables after provisioning. There is no public staff-registration endpoint.

Local demo initialization requires NODE_ENV=development, BORDERLESS_LOCAL_ADMIN_DEMO=true and loopback application/runtime/auth/direct database URLs, then npm run admin:init -- --demo. Demo credentials exist only in ignored local server configuration and are never displayed by the UI or documented in source. Production rejects demo provisioning, sign-in, copied sessions and test contract rights. AXHub must use a separately provisioned non-demo identity. No production administrator bootstrap was performed for this update. The existing deployment at ac794a0 remains unchanged; the new logo/Korean-checkout code has not been pushed or deployed.


## Private S3 logo storage — declared locally, not provisioned
The local `axhub.yaml` now declares `storage.enabled:true`. This is deployment preparation only: it does not provision a bucket, inject credentials or enable the logo feature in the existing deployment. Actual AXHub storage provisioning, runtime injection, access controls, object persistence and cleanup must be verified after separate deployment approval.

The server adapter requires `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`. Keep access/secret keys server-side and use the platform-provided S3 configuration. HTTPS is mandatory in production. `BORDERLESS_LOCAL_STORAGE_HTTP=true` permits loopback HTTP only outside production for synthetic adapter tests. Never use a public image service or the ephemeral container filesystem as a production fallback.

S3 uses path-style addressing, `region:auto`, `requestChecksumCalculation:'WHEN_REQUIRED'` and `responseChecksumValidation:'WHEN_REQUIRED'` for AXHub compatibility. Apply additive logo metadata/cleanup migrations before web startup. FORCE RLS and role grants are mandatory; the auth role must remain denied. Authorized logo GETs proxy bytes through the application with private/no-store and nosniff headers; no public bucket or presigned URL is exposed.

Durable cleanup rows cover replaced/deleted logos, failed uploads and crash leftovers. Confirm the in-process cleanup scheduler starts with storage configuration, recovers stale leases and preserves currently referenced objects. Validate this against the actual managed bucket and PostgreSQL after approval; local adapter tests do not establish managed-storage readiness.

## Korean hosted links and production boundary
Register authoritative `GROBLE_STARTUP_URL` and `GROBLE_BUSINESS_URL` only through a separately authorized secure deployment configuration step. Compatibility `GROBLE_STARTUP_PAYMENT_URL`/`GROBLE_BUSINESS_PAYMENT_URL` values are used only if new names are absent. Empty/invalid authoritative values must block checkout. Do not print configured URLs.

Verify the ingress executes `src/proxy.ts` and overwrites `x-borderless-locale`; API routes must remain unprefixed. Confirm English checkout notice → explicit Korean transition → terms/plan-authorized link request, with temporary checkout cookies preserving the saved account preference and session storage preserving same-tab organization navigation. Test return pages with forged success parameters; they must never activate paid access.

Groble merchant return-URL support is unverified. If supported, configure the canonical application `/ko/billing/return` in the merchant dashboard under separate authorization; do not append undocumented provider URL parameters or claim this is already configured. Payment verification and paid activation require future reviewed integration.

## Authorized demonstration seed
The separately authorized synthetic-data operation created 28 demonstration accounts, three Active Free organizations/projects, eight clearly fictional public Pending Verification experts, one unaffiliated account and one Draft Enterprise organization. No provider payments, NIM analysis, uploads, new external notifications or platform administrator grants were performed. The original test account session was restored. This data mutation did not deploy new source code.

The resumable private seed and credential manifest are `.local/release/demo-seed.cjs` and `.local/demo-accounts.json`, both ignored and permission 0600. Do not commit, upload, print or publish them. No remote platform administrator was bootstrapped; ordinary signup cannot grant that role. Trusted provisioning remains a separate operator task, never a SQL/backdoor workaround.


Trusted local-only provisioning separately created two strong, non-demo platform administrator accounts in the loopback development database using the existing Better Auth hashing/provisioning path. Their private records are appended as `localPlatformAdmins` in the ignored 0600 manifest. These are **not** web production accounts: the authorized web dataset remains 28 accounts, with zero remotely provisioned platform administrators. Ordinary signup still cannot create staff, and no bypass or production bootstrap was used.
