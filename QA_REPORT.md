# Local QA report

Automated checks executed locally; no push or remote deployment was performed.

## Passed

- 32 Node/TypeScript tests: `npm test` equivalent command `tsx --test tests/*.test.ts src/lib/legal/*.test.ts src/lib/workspace/*.test.ts`.
- Company schema rejects malformed values and accepts explicit unknown facts.
- Route-handler integration covers company creation, independent A/B/C scenarios, distinct assessments, partial/unavailable model status, curated official source lookup, unknown source rejection, task create/edit/delete, persisted state reload, Markdown export, validation failures, malformed JSON, cross-origin mutation rejection, and missing-resource errors.
- Repository checks cover atomic serialized writes across 25 concurrent operations, preservation after recreation, corrupted data rejection without reset, targeted fact invalidation, independent scenario clones, task completion without legal status certification, and stale assessment snapshot rejection.
- Legal tests cover recursion budgets/cycles/timeouts, unknown facts, stale sources, fabricated IDs/URLs/topics, numeric model assertions, and source-topic constraints.
- NVIDIA client uses controlled transport and synthetic credentials in automated tests; no automated test submits real API requests or reads local credential files. API integration additionally proves configured credentials without consent return `400 CONSENT_REQUIRED` before any fetch, and a consented intercepted request records the fixed model and usage metadata.
- TypeScript typecheck passed.
- Fixed NVIDIA endpoint/model tests verify `nvidia/nemotron-3.5-super-vl-120b-a12b`, `chat_template_kwargs.enable_thinking=true`, redirect rejection, source subsets, and safe latency/token telemetry. Internal reasoning is neither persisted nor logged. Recursive review tests verify structured challenges can downgrade conclusions but cannot override missing facts, and absent usage remains unknown.

## Browser verification

Desktop 1440px and mobile 375px smoke is implemented in `tests/browser.spec.ts`.
Command: `BORDERLESS_QA_URL=http://127.0.0.1:3218 npx playwright test tests/browser.spec.ts --workers=1 --reporter=list --timeout=30000`.

Previously completed production browser run: **2/2 passed (2.9 seconds)** against the standalone production server after repairing packaging and the reverse-proxy origin guard.

Desktop flow exercised actual UI profile save → sourced assessment → matter detail → linked review task → edit → refresh and persistence → scenario clone/hire → assessment → changed employment comparison → activity. No browser page errors occurred. Mobile verified 375px navigation, task dialog opening, Escape close and no horizontal document overflow.

Inspected screenshots at `/tmp/borderless-desktop-qa.png`, `/tmp/borderless-mobile-qa.png`, `/tmp/borderless-overview-qa.png` and `/tmp/borderless-comparison-qa.png`: supplied logos render, calm B2B styling is consistent, layout and labels remain readable, and mobile tables scroll within their panel.

Issues found and fixed before the final run: missing standalone static/public assets; same-origin mutations rejected when Next internal URL differed from HTTP Host; task partial patch default-reset risk; missing report escaped the structured error handler. Early browser runs also required selector corrections for wrapped select/textarea labels. All reported final results refer to the corrected test suite and repaired production build.

The automated smoke covers the main workflow and representative controls, not an exhaustive test of every possible control and browser combination.

## Boundaries

Live NVIDIA verification uses synthetic facts and is documented below separately from intercepted automated tests. Browser smoke was rerun by the orchestrator after the final model and UI changes with inference explicitly disabled.
Source content freshness is bounded by the curated registry's reviewed dates; this report does not certify legal conclusions.
No authentication or production multi-tenant persistence is claimed. No payment processing is implemented.

## Final orchestrator verification

- Final 32 automated tests and typecheck passed after fixed-model integration.
- Production build passed with ignored .env.local present.
- Rebuilt standalone production browser regression passed 2/2 after final UI fixes; inference disabled in this synthetic browser run.
- Real NVIDIA single-call smoke passed: fixed Nemotron 3.5, thinking enabled, 19,448 ms, 475 prompt / 1,805 completion / 2,280 total tokens.
- First 15-second call timed out; timeout was adjusted to 30 seconds with total assessment budget 90 seconds. No provider fallback.
- Actual API key bytes were checked against Git index and client assets without printing the key; absent from both.
- .env.example removed; ignored .env.local holds server key and demo storage path.

- Full synthetic real-model recursive assessment exercised 9 attempted calls, depth 1 and 11 sourced findings; it returned partial at its 90-second budget. Eight responses were validated before the deadline; final total usage remained unknown rather than fabricated.
- This run revealed an in-flight fetch surviving the engine deadline. AbortSignal propagation now cancels the provider call; a dedicated regression test passes. This final cancellation change was tested with controlled transport, not another long live run.
