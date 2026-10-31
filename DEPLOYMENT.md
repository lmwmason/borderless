# AXHub deployment preparation — no deployment executed

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
- Groble checkout/webhook verification and Enterprise contract fulfillment await
  official merchant integration/account configuration; no live payment is possible.
- Review service terms and legal scope with a qualified human before commercial use.

## Approval gate

Local implementation, testing and local commits only. No remote app creation,
environment mutation, Git push, preview, staging, release publication or deployment.
STOP and wait for a subsequent explicit user instruction such as “배포해”.

## Optional sales operations configuration
BORDERLESS_PLATFORM_ADMIN_IDS is a comma-separated trusted operator account-ID allowlist. Only a trusted server operator may provision it; ordinary signup or company roles cannot grant it. Changes are synchronized into audited operator grant records by the authorized platform service. BORDERLESS_EXPERT_REVIEWER_IDS separately gates human qualification and engagement contract review. Neither value should be guessed from client input.

SLACK_SALES_WEBHOOK_URL is a server secret. Native delivery additionally requires SLACK_SALES_DELIVERY_ENABLED=true and production mode; leave it false until separate Slack approval. BORDERLESS_PUBLIC_URL must be an explicitly confirmed public HTTPS origin before generating sales detail links. No localhost link or private inquiry body is sent. Durable notification jobs recover leases after restart; single-process scheduling is supported and database claims protect concurrent workers. Delivery cannot be exactly once across network ambiguity. See SLACK_SETUP.md for actual CLI observations and approval steps.

No remote environment settings, Slack installation/channel, message or AXHub deployment has been executed. Groble hosted links may be configured using GROBLE_STARTUP_PAYMENT_URL/GROBLE_BUSINESS_PAYMENT_URL; they do not provide verified paid activation.

## Administrator bootstrap
Set a distinct high-entropy BORDERLESS_ADMIN_AUTH_SECRET (at least32characters, different from BETTER_AUTH_SECRET). No administrator identity is auto-created on startup. A trusted operator supplies BORDERLESS_ADMIN_LOGIN/PASSWORD/NAME in a protected server environment and runs npm run admin:init after migrations. Non-demo passwords require at least16characters with mixed case, number and symbol; plaintext passwords are never inserted into the database. Existing accounts are not overwritten. Remove bootstrap password variables after provisioning. There is no public staff-registration endpoint.

Local demo initialization requires NODE_ENV=development, BORDERLESS_LOCAL_ADMIN_DEMO=true and loopback application/runtime/auth/direct database URLs, then npm run admin:init -- --demo. Demo credentials exist only in ignored local server configuration and are never displayed by the UI or documented in source. Production rejects demo provisioning, sign-in, copied sessions and test contract rights. AXHub must use a separately provisioned non-demo identity. No production bootstrap or deployment has been executed.
