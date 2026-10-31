# Expert profile and catalogue backend

expertService exposes me, saveProfile, submit, saveService, deleteService, search,
detail and review. All operations require a server-authenticated AccountUser.
Profile/service inputs are strict Zod objects. Status, identity, verification and
server timestamps are never accepted from profile callers.

Profiles begin Draft. Submission becomes Pending Verification, never Verified.
Only a separately configured BORDERLESS_EXPERT_REVIEWER_IDS allowlist can perform
human review with explicit attestation, notes and evidence. Self-review is denied.
There is no license registry lookup or automatic credential verification. A
Verified unchanged save retains review; any material profile edit resets Draft
and removes the former verification record. Rejected/Draft profiles never appear
in public discovery. Pending profiles appear only with explicit public visibility.

Photo/resume/portfolio are HTTPS links or text, not binary uploads. Private items,
userId, verification notes/evidence and non-public license numbers are excluded
from directory payloads. Both the service and security-barrier SQL views project
public fields explicitly. The expert_directory user_id technical column is used
only by server assignment logic; HTTP catalogue methods return payload only.

Services use expert-entered prices in integer minor currency units. Quote pricing
requires a null amount; fixed/hourly require an explicit amount, which may be zero.
Currency is required for numeric range filters; different currencies are never
compared or converted. Unpublished offerings stay private. Search applies bound
SQL filters before its 200-profile response cap. q searches names, bios and public
offering descriptions with literal wildcard escaping. No synthetic experts,
prices, payments or successful credential checks are seeded into production.

## Database security

withExpertActor checks out one runtime client, starts a transaction and sets
borderless.user_id, borderless.expert_reviewer and the single target setting
borderless.review_engagement_id transaction-locally. Only allowlisted server
reviewers may request the reviewer flag. Original project RLS is unchanged.

Private profile/service rows are owner scoped. Explicit human reviewers may
inspect and review profiles; engagement reviewer access is bound to one target,
with narrowly limited Agreement Pending to Active update. Company approved
members see company engagement metadata; Pending members do not. Assigned experts
cannot read Draft, expired, revoked or Canceled assignment rows. Shared snapshots
require Active/Completed, a Verified profile, confirmed contract, both agreements,
cleared conflict review and live access. Company retains its own archives.

Collaboration entry creation/update requires Active for both parties. Inserts
bind authorship to the actor. Updates affect only task payloads; column privileges
prevent changing author, scope or kind. Messages/opinions and events are immutable.
Service code additionally limits task changes to status. Narrow pre-Active expert
event inserts accept fixed transition metadata only; event reads remain blocked
until active collaboration.

PostgreSQL new-row SELECT checks prevent an ordinary update from hiding its own
row. The owner-defined cancel_assigned_engagement(text) function is the narrow
exception: it validates the assigned actor/profile/live state, changes only
Canceled/revocation/timestamps and matching JSON fields, and returns a boolean.
PUBLIC/auth cannot execute it. It accepts no arbitrary payload or identity input.
Runtime cannot use it to read any canceled payload. Event insertion and this
function are called atomically by the engagement service.

## Verified locally

node --env-file=.env.local --import tsx --test tests/experts.test.ts

Ten passing real-PostgreSQL tests cover profile and SQL-view privacy, IDOR,
integer/quote/currency pricing, catalogue filters, manual review gates, material
edit invalidation, seeded migration checksums, scoped reviewer access, immediate
expiry/revocation/cancellation denial, narrow cancellation and collaborative task
authorship. All fixtures are synthetic and cleaned up. No external credential
verification, expert fee payment or commercial contract execution is claimed.
