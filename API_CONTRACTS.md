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
