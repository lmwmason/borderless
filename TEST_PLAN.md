# TEST_PLAN.md — Verification Gates

## Automated tests
1. Profile schema rejects malformed values and accepts unknown/null facts.
2. Recursive planner respects depth/node/call limits and deduplicates cycles.
3. Model-generated nonexistent source ID is rejected.
4. Unknown required fact never yields definite non-applicability.
5. Model timeout produces visible partial/error state, not simulated success.
6. API key absent from client build and logs.
7. Task create/update persists across refresh.
8. Completing task does not automatically change finding to legally compliant.
9. Scenario A (remote selling, no US staff) and B (adds California employee) yield different employment review items.
10. Scenario A and C (adds US subsidiary) yield different formation/maintenance review items.
11. Changed company fact invalidates only relevant cached assessments.
12. All verified source links resolve to the curated registry; unverified sources clearly marked.

## Manual QA
Desktop 1440px, mobile 375px; keyboard navigation; forms and unknown states; loading/error; no dead buttons; correct company and scenario context; copy and export; no chatbot/neon design.

## Release gate
Run lint (if configured), typecheck, tests, production build, local smoke and real NVIDIA request with configured key. If API key is unavailable, report integration unverified rather than claiming pass. AXHub deploy only once after gate.

## Organization/security regression gates

Run the suite against isolated actual PostgreSQL with restricted runtime/auth
roles and the same Drizzle migrations as AXHub. Verify signup/signin/logout/expiry,
password hashing and cookies, persisted auth/action rate limits, no-org onboarding,
Draft Owner/workspace creation, canonical terms and Free activation, invitation
expiry/revocation, Pending block/approval/rejection, Member admin denial, Viewer
write denial, cross-org/project IDOR, RLS and auth-table isolation. Paid requests
and forged browser status cannot activate access; cancelled/expired subscriptions
retain SQL records. Test dry-run/nonempty/invalid-reference legacy imports.
Browser QA must use actual sessions/onboarding and HTTPS production cookies;
only Deep Review transport may use explicitly identified controlled fixtures.

## Additional regression gates
Exercise targeted fact/source impacts, unchanged-fact dedupe, manual task links and project RLS; actual PostgreSQL expert profile/private field separation, expert-owned price/catalog, filters, quotation/contract gates, explicit material sharing, unrelated party denial and revoke/expiry.
Enterprise tests cover exact monthly prices, disabled missing checkout, forged return URLs, immutable snapshots and idempotent inquiry/outbox creation. CRM tests cover separate platform privilege, trusted provisioning audit, assignment, pipeline, notes, chronological audit and no entitlement changes. Notification tests inject controlled adapters only: success, permanent/transient errors, bounded retries, lease recovery, concurrency, missing configuration, payload minimization and uncertain-send duplicate risk. Never send a test message to a real Slack workspace.
Browser tests exercise real accounts and PostgreSQL for company/project/marketplace/CRM, mobile navigation and controlled Deep Review. Actual NVIDIA timing evidence is collected separately once using synthetic company facts.

## Administrator, contract and template regressions
Verify administrator hash/cookie separation, hidden token response bodies, ordinary/legacy session denial, unknown-ID rate limits, logout/expiry, reserved signup/login denial and production demo identity/session rejection. Test independent strong administrator provisioning and user-session revocation audits.
Validate centralized feature IDs/dependencies; preview without activation, wrong-org/stale/used proposal denial, explicit attestation, API feature bypass attempts, paid plan preset regressions, atomic member/project/Deep quotas and idempotent reservations. Lowering limits must preserve data; suspension/revocation/expiry restrict features without older-contract fallback. Isolated test contracts must become unusable in production.
Templates: real PostgreSQL example initialization, create/search/edit/clone/status changes, immutable versions, optimistic update conflicts, editable company copies, original source/version provenance, unchanged existing contracts, explicit reapplication, archive-after-preview denial and preserved references. Verify FORCE RLS/auth-role denial/cross-organization isolation. Browser QA uses an isolated production HTTPS server and non-demo strong admin fixture; no real Slack, NVIDIA or payment transport.
