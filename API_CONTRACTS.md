# API contracts

All errors use {error:{code,message,retryable}}. Request bodies are schema validated;
mutations enforce origin checks. Responses with user data are not cached.

## Public account endpoints

- GET /api/health → {ok,version}; no database/inference dependency.
- Better Auth /api/auth/sign-up/email {name,email,password},
  /sign-in/email {email,password}, /sign-out {}; managed HttpOnly session cookies.
- GET /api/account → {user|null,organizations,pending}; no company internals for Pending.

## Organization APIs (session required)

- POST /api/organizations {name} → Draft OrganizationSummary, Owner+workspace created.
- GET /api/organizations/:id → {organization,members,requests,invites,projects}.
- POST /api/organizations/join {code} → pending request, not access.
- POST /api/organizations/:id/invites {expiresInHours?} → code returned once.
- DELETE /api/organizations/:id/invites/:inviteId → revoke.
- PATCH /api/organizations/:id/requests/:requestId {decision,role} → admin approval/rejection.
- PATCH /api/organizations/:id/members/:memberId {role} → guarded role change.
- POST /api/organizations/:id/projects {name,description?} → ProjectSummary.
- GET /api/projects/:id → authorized ProjectSummary with role.

Roles: Owner/Admin/Member/Viewer/Pending. Organization status: Draft/Active.
Plans: Free/Startup/Business/Enterprise. Pending approvals never grant access.
Invite hashes are stored; raw codes are random, expire and can be revoked.

## Billing APIs (approved membership; mutations Owner/Admin)

GET /api/organizations/:id/billing returns plan, organizationStatus, subscription,
canonical termsVersion/termsText, acceptance and truthful checkout availability.
PUT billing/plan {plan}; POST billing/terms {termsVersion,accepted:true};
POST billing/activate-free {}; POST billing/enterprise {notes};
POST billing/cancel {} cancels pending local requests only.
POST billing/checkout {} always returns503 CONFIG_REQUIRED until Groble's API and
webhook authentication are verified and implemented. No active paid subscription
can be created by these client-facing routes.

## Project APIs

Every route below requires a session and x-project-id. Membership and entitlement
are resolved server-side; IDs from another project cannot cross the scope.
GET is Viewer-safe; mutations require Member/Admin/Owner.

- GET /api/workspace → company,scenarios,tasks,activity,assessments,reviewJobs.
- PUT /api/company → save profile in current project.
- POST /api/scenarios; PATCH /api/scenarios/:id.
- POST /api/assessments {scenarioId} → immediate Quick Assessment, no inference.
- GET /api/assessments/:id.
- POST /api/reviews {scenarioId,consent:true} →202 ReviewJob.
- GET /api/reviews/:id → persisted status, completedTopics and latest validated result.
- DELETE /api/reviews/:id → cancel, retain partial results.
- POST /api/tasks; PATCH/DELETE /api/tasks/:id.
- GET /api/sources/:id → curated official source.
- GET /api/reports/:assessmentId → Markdown download (also scoped header).
- GET /api/documents → {documents}; POST {title,content}; DELETE /api/documents/:id.

ReviewJob statuses queued/running/completed/partial/cancelled/failed/interrupted.
Assessment.kind quick/deep; modelStatus not_requested/pending/available/unavailable.
Stable partial IDs allow task references to survive progress updates.
Shared types remain src/lib/contracts.ts and organization-contracts.ts.

## Change impact
GET /api/impacts; GET /api/impacts/:id; POST /api/impacts/:id/tasks {taskId XOR title,assignee?}; POST /api/impacts/check-sources {}. All require authorized project scope. Changes annotate affected findings and never automatically invoke NVIDIA.

## Experts and engagements
Session required: GET/PUT /api/experts/me; POST me/submit {}; POST me/services; DELETE me/services/:id. GET /api/experts supports actual directory filters; GET /api/experts/:id is sanitized. POST /api/experts/:id/review is restricted to configured human reviewers.
GET /api/engagements?projectId; POST /api/engagements; GET /:id; POST /:id/actions; GET /:id/workspace; POST /:id/workspace/entries; PATCH /:id/workspace/entries/:entryId. Company and expert permissions are resolved server-side. Pre-contract collaboration is denied. Revoked/expired expert access fails without disclosing company data.

## Pricing and Enterprise operations
GET /api/pricing returns canonical public plan prices and configured hosted-link availability. POST /api/organizations/:id/billing/payment-link {plan:Startup|Business} requires Owner/Admin, matching selected plan and current terms. It returns an operator-configured HTTPS Groble link only; no entitlement update occurs. /billing/return always shows verification pending.
POST billing/enterprise accepts {notes,idempotencyKey?:UUID}; exact duplicate content/key is idempotent, conflicting reuse returns409. Company/requester snapshot is server-derived.
GET /api/admin/inquiries?status&salesStatus&q&assigneeId returns {inquiries,assignees}; GET /:id returns {inquiry,notes,activity,notifications}; PATCH /:id {salesStatus?,assigneeId?} updates CRM or legacy {status,notes} reviews handling; POST /:id/notes {body}; POST /:id/notifications/:notificationId/retry {}. Every admin endpoint verifies a real session plus separate platform operator authorization. Won/Closed/Approved do not execute contracts or grant Enterprise access.

## Admin Console authentication and contracts
POST /api/admin/login {loginId,password} returns sanitized user and managed HttpOnly cookies; POST /api/admin/logout {}; GET /api/admin/session returns {user,expiresAt} or {user:null}. Every protected /api/admin route independently requires this session; ordinary or legacy allowlisted company sessions receive401 ADMIN_AUTH_REQUIRED. /admin server layouts redirect unauthenticated requests to /admin/login.
GET /api/admin/overview returns statistics, regular/admin identity summaries (no credentials), organizations/current contracts and safe recent activity. PATCH /api/admin/organizations/:id {action:suspend|resume,reason}; POST /api/admin/users/:id/revoke-sessions {reason} affects regular-user sessions only. Legacy POST organizations/:id/enterprise returns409 CONTRACT_BUILDER_REQUIRED.
GET /api/admin/organizations/:id/contracts returns immutable history with feature/limit snapshots, approval metadata and template provenance. POST contracts/preview accepts ContractInput and returns persisted proposalId/expiresAt/before/after/changes/warnings/currentUsage. POST contracts/:proposalId/approve {attested:true,reason} rechecks scope, proposal lifetime/base version, dependencies, template availability and administrator type. POST contracts/:contractId/actions {action:suspend|revoke,reason} applies to the latest contract only.
ContractInput: {kind:test|production,startsAt,endsAt,contractReference,notes,features,limits,templateSource?:{id,version}}. Feature IDs: deep_legal_review, scenario_comparison, expert_collaboration, expert_marketplace, cost_review, audit_log_export, priority_support. Limits: members/projects/monthlyDeepReviews. Unknown features and invalid dependencies fail validation.
GET /api/organizations/:id/entitlements returns approved membership-scoped features, limits, usage and contract metadata. Project feature APIs require real project scope. Marketplace GET /api/experts and GET /:id require x-project-id; personal expert profile/catalog endpoints stay independent. GET /api/scenarios/compare?left&right, GET /api/cost-review, GET /api/audit-export (Owner/Admin, latest1000 scoped events), POST /api/support {message} enforce feature rights. Cost review returns persisted cost-related matters, not numeric savings. Support records an audit-backed request only, without automatic dispatch/SLA claims. Collaboration access and writes recheck the company contract.

## Reusable Enterprise contract templates
GET/POST /api/admin/subscription-templates: search/list or create. GET/PATCH /:id: detail/version/application history or update with expectedVersion. POST /:id/clone {name}; POST /:id/status {status:Active|Inactive|Archived,reason}. TemplateInput: {name,description,features,limits,defaultDurationDays,notes}. Updates append immutable versions; no hard-delete endpoint exists. Seeded examples never activate organizations/subscriptions.

## Language preferences and expert geography
GET `/api/locale` returns `{locale:'ko'|'en'|null,authenticated:boolean}`. POST `/api/locale` accepts strict `{locale:'ko'|'en'}`, saves the preference only for an actual regular-user or separate administrator session and sets the browser language preference cookie. Anonymous POST succeeds without a customer database write. Protected domain APIs retain their existing authentication and project scope requirements; page locale prefixes do not create alternate API routes.
Expert profile input/output adds `residenceCountry` and `qualificationCountry` (assigned ISO alpha-2 or null), `licensedJurisdictions` (country/subdivision claims such as `US-CA`), `serviceCountries` (assigned ISO alpha-2 array), `consultationModes` (`remote`/`in_person` array), `originalLanguage` (`en`/`ko`) and `localizedContent`. Profile locale objects allow `bio`, `specialtiesDescription`, `experience`, `portfolioDescription`; service locale objects allow `description`, `scope`, `conditions`. Locale maps accept only `en`/`ko`; descriptive strings remain plain text. Old profiles default countries to null and arrays to empty without inferring geography from credential strings. Default original language is en. Profile edits continue to reset verified status for renewed human review.
Directory GET `/api/experts` additionally accepts `residenceCountry`, `qualificationCountry`, `licensedJurisdiction` and `serviceCountry`, alongside existing language/specialty/price filters. Invalid country or US jurisdiction codes fail validation. Filters query actual stored public fields. Public DTOs and SQL views exclude private credentials and suppress localized portfolio descriptions when no portfolio item is explicitly public. These fields are self-reported and do not verify legal practice rights.
