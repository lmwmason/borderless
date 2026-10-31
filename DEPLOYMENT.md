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
No Docker/Podman executable was available, so actual image build is unverified.

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
