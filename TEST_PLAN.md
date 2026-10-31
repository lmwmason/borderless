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
