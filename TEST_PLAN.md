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
Run lint (if configured), typecheck, tests, production build, local smoke and real NVIDIA request with configured key. If API key is unavailable, report integration unverified rather than claiming pass. Any new AXHub deployment requires a separate explicit approval after the gate; passing local tests is not permission.

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

## Locale, geography and pricing comparison regressions
- Verify `/ko` and `/en`, visible language switching, browser persistence, authenticated preference persistence and no anonymous preference row creation. Preference RLS must prevent another user reading or changing the saved locale; separate admin sessions must work without permitting public sessions into admin APIs.
- Validate assigned country allowlists and known US jurisdictions; reject plausible unknown codes. Persist and filter residence/qualification/licensed/service geographies independently. Legacy credential/jurisdiction text must remain unchanged, with unknown location defaults.
- Persist Korean/English descriptions and original-language fallback. Render submitted markup as text. Public expert API and SQL view tests must retain credential privacy and suppress private portfolio descriptions in every language, including direct JSON projection bypass attempts; the owner still retains the original private content.
- Compare every registered feature flag and all member/project/monthly Deep Review allowances against central plan presets for all four columns. All configurable Enterprise rows must remain Custom configuration; baseline tasks/Quick Assessment/Change Impact remain Included. Existing card count, payment-link, Free activation and Enterprise inquiry flows must remain intact. Check mobile table scrolling and English/Korean labels, including Legal Intelligence / 법률 인텔리전스.
- Validate error catalogue coverage for all literal ApiError messages and the installed authentication library's canonical messages without changing error codes, credentials, source text or authoritative terms.


## Organization logo regression gates
- Test Owner/Admin upload/replace/delete; Member/Viewer read-only access; Pending, unrelated organization and ordinary-user admin-route denial. Recheck permission after object I/O so a mid-upload demotion cannot commit metadata.
- Verify PNG/JPEG/WebP signatures and declared MIME agreement, full decode failure, unsupported SVG/GIF, animation/multipage rejection, 2 MiB input/output bounds, streaming request limits, 4096 per dimension and 16,777,216 input pixels. Confirm orientation, lossless WebP output, preserved aspect ratio without resizing and metadata stripping.
- Exercise absent metadata → initials/no request, protected byte GET/private no-store/nosniff headers, missing object/error fallback, mobile containment and no public/presigned storage URL leakage.
- Use isolated PostgreSQL with FORCE RLS and denied auth-role access to metadata/cleanup tables. Mock storage for failed put/delete, transaction rollback, replacement, deletion, crash/stale-lease recovery and reference-preserving cleanup. Test real AWS SDK requests against local synthetic S3-compatible HTTP/HTTPS fixtures, including signing and WHEN_REQUIRED checksum behavior. Never upload to a production bucket during local QA.
- Actual AXHub bucket provisioning, injected STORAGE_* settings, restart persistence and cleanup remain post-approval checks. A local storage.enabled:true manifest is not evidence that storage exists.

## Korean checkout regression gates
- Authoritative GROBLE_STARTUP_URL/BUSINESS_URL override legacy *_PAYMENT_URL only when present. Empty/invalid new values must block fallback. Verify configured flags without printing private URLs; retain exact canonical plan prices.
- Default/English/unknown server locale cannot issue a link, even with body locale:'ko', fabricated Referer or forged client x-borderless-locale through the real proxy. Korean requests still require Owner/Admin, matching saved plan and current version/hash acceptance.
- English paid actions open only the exact English notice and explicit Continue in Korean action. Confirm no provider request before that transition, Korean-only link request afterward, correct plan/organization context and unchanged provider URL. Use intercepted synthetic provider responses; never navigate to configured live payment URLs or make a real payment.
- Verify temporary checkout cookies do not overwrite the saved account language; leaving checkout or explicit language change restores/clears context. Same-tab session storage restores organization and English billing navigation when provider query parameters are absent.
- Return pages ignore success/paid/paymentVerified/status assertions and make no activation request. Free activation and Enterprise inquiry flows remain separate. No test may assert automatic Groble return support or implemented provider verification.
- Record final typecheck, isolated PostgreSQL tests, browser tests/build/container evidence in QA_REPORT.md and RELEASE_CHECKLIST.md; this document defines gates rather than claiming a fresh release passed.

## Demonstration dataset verification
The authorized production seed verified three Free organizations with exact Owner1/Admin1/Member2/Viewer1/Pending1 roles and one project each, eight searchable fictional Pending Verification experts, one unaffiliated account and a Draft/Pending Enterprise owner/organization: 28 accounts total. Profiles are explicitly fictional, have no verified badge or real license number and are unavailable for engagement. Scoped directory verification uses an approved project header; no project/entitlement bypass is allowed. Platform administrator creation remains blocked without trusted provisioning. Protect the ignored 0600 credential/checkpoint manifest and restore the prior synthetic login after seeding. No real payment, model call, file upload or new external notification is part of this seed.


Trusted local-only provisioning separately created two strong, non-demo platform administrator accounts in the loopback development database using the existing Better Auth hashing/provisioning path. Their private records are appended as `localPlatformAdmins` in the ignored 0600 manifest. These are **not** web production accounts: the authorized web dataset remains 28 accounts, with zero remotely provisioned platform administrators. Ordinary signup still cannot create staff, and no bypass or production bootstrap was used.
