# Borderless architecture

User Account → Organization → Organization Workspace → Expansion Project →
Regulatory Matters / Tasks / Scenarios / Documents.

## Authentication and authorization

Better Auth handles scrypt password hashing, signup/signin/signout, opaque persisted
sessions, expiry and revocation. Cookie cache is disabled. Cookies are HttpOnly,
SameSite=Lax and Secure in production. Production requires an explicit HTTPS
BETTER_AUTH_URL and server-only high-entropy BETTER_AUTH_SECRET. DB-backed login
limits are enabled in all environments. Only explicitly configured, proxy-overwritten
IP headers may be trusted; otherwise the library uses a shared rate-limit bucket.

Every company/project API resolves a real session, approved membership and project
from x-project-id. The header is only a lookup identifier, never an authorization
claim. Owner/Admin manage company membership and billing; Member edits project data;
Viewer reads only; Pending sees no internal data. Owner cannot be demoted through
the role API. Admin cannot grant/manage Admin or bypass the Owner.

Draft company creation atomically creates an Owner, workspace and Pending Free
subscription. Free activates after immutable, versioned server-recorded acceptance.
Paid plans need verified Active/unexpired subscription state; no browser redirect
or submitted payment status grants access. Enterprise requests stay Pending.

## PostgreSQL and migrations

One Next.js Node container on AXHub with managed PostgreSQL. Drizzle owns versioned identity/domain tables
and additive journaled migrations. Owner/direct connection runs migrations; runtime
and auth use distinct limited roles. Runtime cannot read credential/session tables;
auth cannot read company/project tables. A narrow account_public view supplies
member display names/emails. Project tables have composite organization/project
foreign keys plus ENABLE/FORCE RLS with transaction-local settings.

Company profiles, scenarios, assessments, findings, tasks, review jobs, activity
and documents are distinct scoped SQL tables with typed JSON payloads. Writes lock
the project inside a transaction, revalidate membership/entitlement, preserve array
ordering and append actor-attributed audit records. No runtime JSON fallback exists.

Old JSON is never automatically assigned to the next signup. Owner-scoped legacy
import defaults to dry-run, requires an empty destination, validates references,
marks imported legal judgments for review and never rewrites its input file.

## Quick Assessment and Deep Review

Quick returns source-checked deterministic screening without NVIDIA or inference
consent. Deep is POSTed as a separate persisted job and acknowledged with HTTP 202.
Validated topic snapshots retain stable finding/assessment IDs and are polled by
the UI; user can keep working, refresh, switch Quick/Deep views or cancel.

The fixed NVIDIA Nemotron 3.5 model uses thinking. Rules and curated source IDs
validate each proposal. Limits remain depth3/nodes12/calls15, total90s/call30s.
AbortSignal propagates cancellation and deadlines to fetch. Unfinished work is
explicitly partial, with completed topics distinguished from rule-only findings.
No free-form reasoning, model URLs or credentials are persisted/logged.

Job execution currently uses one long-lived Node process with persisted status.
Restarted/orphaned work is marked interrupted with saved partial results; it is
not silently resumed. Run one application instance until a durable leased worker
queue is implemented. PostgreSQL transaction safety supports concurrent users,
but this in-process execution mechanism is not a distributed worker queue.

## Deferred and approval gate

Configured Korean-only Groble hosted links are separate from payment verification.
Webhook authenticity, reconciliation and paid activation still need verified
provider integration; local QA performs no real payments or fake successes.
Email verification/password recovery delivery, production backup/restore drills,
distributed workers and binary document upload remain later work.

Local implementation/testing/commits are authorized. Git push, PR/publication,
automatic deployments and actual AXHub deployment require subsequent explicit
user approval. No remote code transmission is performed during local QA.

## Marketplace, regulatory impacts and sales CRM
Drizzle migrations add expert_profiles/expert_services, scoped engagements and explicit engagement_resources snapshots, engagement_entries and immutable events. Public directory views project only approved public fields. Transaction-local actor context and FORCE RLS protect private expert and engagement records; experts never gain automatic company membership. Human reviewer access is independently configured by BORDERLESS_EXPERT_REVIEWER_IDS and bound to a review target.

change_impacts retain scope, changed facts/source revision, affected assessment/findings and optional task links. Stored source fingerprints avoid arbitrary model source URLs. Manual source checks compare the actual curated registry; there is no live legal monitoring crawler.

Enterprise CRM preserves legacy inquiry status independently from salesStatus. BORDERLESS_PLATFORM_ADMIN_IDS is a trusted server allowlist, provisioned outside ordinary signup. Durable outbox events use a unique event/channel/aggregate key, leased SKIP LOCKED claims, bounded retry and persisted recovery. Adapter output is sanitized; notification payload excludes inquiry notes, legal analysis and documents. A retry may duplicate a delivery after an ambiguous network failure; exactly-once delivery is not claimed. Native Slack transport requires an explicit production delivery opt-in, never local tests.

Slack delivery can omit the admin link when no public origin is configured. Native delivery still requires explicit production opt-in and a valid secret webhook. Bounded manual verification can select notificationIds; recovery and state maintenance are scoped to those IDs as well as claims, so unrelated queued data is preserved. This option is server-internal and is not accepted by public API request bodies.

## Administrator identity and entitlement enforcement
Better Auth is instantiated separately at an internal /api/admin/auth base path with borderless-admin cookie namespace, independent BORDERLESS_ADMIN_AUTH_SECRET, HttpOnly SameSite=Lax cookies (Secure in production), database-backed one-hour sessions and a five-attempt/minute administrator login limiter. Only /api/admin/login/logout/session wrappers are exposed; no administrator signup/provisioning endpoint exists. Successful login responses omit tokens. admin_accounts marks trusted identities; normal auth rejects marked identities and the reserved private email namespace. Password hashes use Better Auth scrypt.
Production requires a distinct strong admin signing secret. Demo identity initialization, sign-in and session use require development mode, explicit BORDERLESS_LOCAL_ADMIN_DEMO and loopback app/runtime/auth/direct-DB URLs. Production rejects copied demo sessions and test contracts even if imported into its database. Native company Owner/Admin or legacy server operator IDs cannot authenticate admin APIs. Legacy allowlist support remains only for existing internal service integrations.
The client-safe Feature Registry defines IDs, descriptions, dependencies and non-Enterprise presets. Enterprise rights come only from the latest approved, effective contract; suspended/revoked/test-in-production heads cannot fall back to an older contract. Contract rows are immutable except lifecycle status. Organization locks serialize capacity checks and Deep Review job reservations; usage ledger inserts and job persistence share a transaction and unique subject ID. Monthly usage is UTC-based and counts started jobs, including failed/canceled attempts. Lower limits block new additions without deleting existing data. Deep Review rechecks entitlement before each provider request.
Template parents reference immutable versions. Contract proposals retain the submitted snapshot and source ID/version; approvals bind optimistic base configuration and recheck the template parent under a shared lock. Concurrent archival cannot race through a new approval. Existing contracts retain their copied flags/limits and composite source-version foreign keys. New tables use FORCE RLS, role-separated grants, immutable history and audit events.

## Locale, geography and pricing configuration
`src/proxy.ts` selects explicit `/ko` or `/en` locale prefixes, redirects legacy page URLs into real App Router `[locale]` segments and leaves API paths unprefixed. `next-intl` request configuration and flat source-text catalogues provide Korean/English copy and locale-aware date/number/currency formatting. APIs and clients retain canonical error codes; translations concern display text only. `user_preferences` stores only owner-scoped locale and timestamp under forced RLS. Preference writes resolve an actual regular or separate administrator session; anonymous choices never create database rows.
Expert geographical and bilingual additions are additive JSON fields, normalized with safe defaults on legacy reads. Assigned ISO country codes use a maintained allowlist; known US state/territory codes are checked separately. Other subdivision claims validate format and assigned country prefix, without claiming professional eligibility. Public security-barrier SQL views expose only allowed descriptive locale fields and suppress portfolio descriptions without an explicitly public portfolio item. Source credential strings, private portfolio/resume content and verification evidence remain protected. Migration0025 adds preferences and public field projections;0026 hardens multilingual portfolio privacy for already-migrated installations.
`src/lib/billing/comparison.ts` derives public comparison cells from the same client-safe `PLAN_PRESETS` and feature registry used by server entitlements. The table grants no access and has no billing mutation controls; actual authorization, quotas and approved Enterprise overrides remain server-enforced.


## Private organization logos
`organization_logos` stores one current logo per organization: ID, private object key, WebP MIME type, byte size, dimensions, uploader and upload timestamp. Public organization DTOs expose only `{id,mimeType,bytes,width,height,uploadedAt}`; object keys and storage credentials stay server-side. Both logo metadata and the durable `organization_logo_cleanup` outbox use ENABLE/FORCE RLS and restricted runtime grants; the auth role has no access. Owner/Admin mutation and approved-member reads recheck membership. Separate enabled administrators have a read-only protected route.

The HTTP upload reader bounds the multipart stream before buffering and accepts exactly one `file`. Magic bytes must match the declared PNG/JPEG/WebP MIME type. Full Sharp decoding with warning failure, animation/multipage rejection and input pixel limits precedes orientation-aware lossless WebP encoding. Input and stored output are each at most 2 MiB, each dimension at most 4096, and input pixels at most 16,777,216. No resize or aspect-ratio change is applied; metadata is not retained.

Private bytes use the server S3 adapter with AXHub `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`, path-style addressing and `region:auto`. Request checksum calculation and response checksum validation both use `WHEN_REQUIRED`. No production filesystem or public paid image-service fallback exists. Missing storage configuration fails closed. Reads proxy authorized bytes through the app; no presigned/public storage URL is returned.

Durable cleanup intent precedes upload. A transaction revalidates authorization before changing the metadata pointer. Replaced/deleted/failed-upload objects are reclaimed by leased `SKIP LOCKED` jobs, including stale-lease recovery after restart. Cleanup rechecks live references before deleting an object, so an ambiguous committed write is not removed. Failed deletion stays queued; current metadata remains authoritative.

## Korean checkout request context
The proxy overwrites `x-borderless-locale` on every API request from the selected page/cookie/Accept-Language context. Checkout resolves that header, then the browser locale cookie, then language negotiation; it does not use Referer as authorization. Only resolved `ko` can issue a hosted link. Body `locale:'ko'` is descriptive, not sufficient authority. Owner/Admin, saved paid plan and current hashed terms acceptance are independently checked.

An explicit `/ko/pricing?checkoutFrom=en&returnLocale=en` transition creates temporary `borderless_locale=ko`, `borderless_locale_source=checkout` and `borderless_checkout_return_locale=en` cookies. The language switcher suppresses account preference synchronization during that checkout context. Leaving checkout restores English and clears the temporary return marker; explicit language selection clears the context. Session storage retains only the selected organization ID and return language for the same-tab return UI, never payment proof or credentials. Provider URLs are passed through unchanged without invented return/locale parameters.
