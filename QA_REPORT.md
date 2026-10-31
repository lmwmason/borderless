# Local QA report

No Git push, remote deployment, or live payment was performed by QA.

## Automated verification

- `npm test`: **50/50 passed**.
- `npm run typecheck`: passed.
- Existing schema, legal, source, persistence and NVIDIA regression coverage is retained. API expectations intentionally changed for the Quick Assessment / Deep Review split.
- Quick Assessment returns deterministic results immediately with `kind=quick`, `modelStatus=not_requested` and zero inference calls, even with a configured synthetic key. Consent is not required for local rules.
- Deep Review requires consent, returns an asynchronous 202 job, exposes persisted status/results through GET, and returns a truthful unavailable error without credentials. API tests use synthetic credentials and intercepted transport only; any unexpected outgoing fetch fails the test.
- Service tests verify immediate acknowledgement while inference is blocked, incremental progress, refresh persistence, cancellation/provider abort, retained findings and task references, outage behavior, stale snapshot rejection, and process-restart recovery.
- Repository tests verify serialized atomic writes, progress upserts with stable assessment/finding IDs, terminal-state protection, fact-change interruption, terminal result invalidation, orphan recovery and legacy storage.
- Legal tests verify recursion budgets, cycle deduplication, stale/unknown sources, missing facts, structured challenges, progress validation, cancellation and actual provider deadline abort. Models cannot override unknown facts or introduce arbitrary citations or numeric assertions.
- NVIDIA tests verify fixed Nemotron model, thinking mode, endpoint/redirect safety, source subsets and safe latency/token telemetry. Internal reasoning is neither persisted nor logged; absent usage remains unknown.

## Browser verification

`tests/browser.spec.ts` contains desktop 1440px, mobile 375px and controlled asynchronous Deep Review tests.

Command: `BORDERLESS_QA_URL=http://127.0.0.1:3218 npx playwright test tests/browser.spec.ts --workers=1 --reporter=list --timeout=30000`.

The earlier pre-split production browser run passed 2/2. Updated three-test run against the new split production build is pending.

The desktop test covers actual company save, Quick Assessment, source detail, linked task edits and refresh persistence, scenario cloning, changed employment comparison and activity. Mobile covers navigation, dialog opening/Escape close and contained table scrolling without document overflow.

The asynchronous browser test intercepts review routes with explicit test fixtures. It checks consent, queued/running progress, completed/current topics, refresh continuity, cancellation and retained partial findings. It never starts a real server inference job.

## Boundaries

Automated tests do not read credential files or make live inference calls. Live NVIDIA connectivity evidence belongs to the orchestrator's separate verification report; these tests do not prove endpoint availability, latency or throughput.

Source checks and legal results are scoped preparation support, not a compliance certification. JSON storage remains a single-process demo adapter; authentication and production multi-tenant operation are deferred. Groble processing remains deferred.
