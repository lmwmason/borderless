# Borderless — Agent-Ready MVP Pack

A 4-hour implementation specification for an AI-native Korean-to-US B2B regulatory operations workspace.

## Reading order
1. `prompts/ORCHESTRATOR.md` — paste into the primary coding agent.
2. `AGENTS.md` — parallel delegation and file ownership.
3. `PRD.md` — product requirements and acceptance criteria.
4. `API_CONTRACTS.md`, `ARCHITECTURE.md` — integration design.
5. `DESIGN.md` — no-AI-look UI specification.
6. `LEGAL_DATA.md`, `TEST_PLAN.md`, `DEPLOYMENT.md` — reliability and AXHub gates.

## Non-negotiables
Real NVIDIA API, source-linked and conservative legal judgments, human-in-the-loop task management, scenario comparisons, no fabricated citations, and AXHub as the **only** deployment destination at the **end** of development.

The documents are planning and coding instructions, not a finished application. AXHub-specific deployment commands must be checked against current platform documentation before use.

## Branding
Use `assets/borderless-logo.png` and `assets/borderless-mark.png` for the UI. Both have transparent backgrounds.


## Mandatory human approval gate (overrides every conflicting instruction)
- Implement, test, and create local Git commits autonomously; never `git push`, open a PR, publish a release, enable auto-deploy, or transmit code to a remote repository without explicit user approval.
- Prepare AXHub configuration and verify documentation locally, but **do not run any AXHub deployment, preview, staging or remote-mutating command** until the user explicitly instructs deployment (e.g. "배포해") in a later message.
- At the end of local implementation, report completed features, tests, known gaps, commit hashes, secret configuration and AXHub readiness, then **STOP AND WAIT** for approval. The 4-hour deadline does not waive this gate.
- No commit of `.env`, credentials, customer data, or generated secrets. Preserve pre-existing uncommitted changes; use Conventional Commits after each coherent, tested feature; orchestrator owns commits.


## One-message Codex launch
Copy the contents of `CODEX_START.md` into Codex after extracting this ZIP directly into the project root. Codex may make local commits but must wait for explicit approval before Git push or AXHub deployment. Groble integration is deferred; see `BILLING.md`.
## Running the implemented local MVP

Requires Node.js 22+ (local verification used Node 24).

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://localhost:3000. Save a company profile, consent to assessment,
run the assessment, inspect cited matters, create review tasks and clone a
scenario in Decision Twin. Assess both scenarios to compare their findings.
Task assignees, status, notes and evidence references persist on the local server.

For NVIDIA review, configure server-only `NVIDIA_API_KEY` in ignored `.env.local` or the server environment.
The model is fixed to `nvidia/nemotron-3.5-super-vl-120b-a12b` with thinking enabled. Run `npm run verify:nvidia` to verify connectivity using synthetic facts. The hosted base URL is pinned to
`https://integrate.api.nvidia.com/v1`. Calls have a 30-second timeout and the assessment has a 90-second total budget; there is no automatic retry or provider fallback. Only safe timing/token metadata is logged; internal reasoning is not stored.
The five review stages run within each bounded issue call and rules validate every proposal. Without credentials, the UI explicitly shows partial deterministic
screening and NVIDIA unavailable. Additional facts outside the MVP questionnaire
remain questions for human review.

`npm test`, `npm run typecheck`, and `npm run build` verify the application.
`npm start` runs the production server and respects `PORT`.
Browser tests use `BORDERLESS_QA_URL=http://localhost:3000 npx playwright test
tests/browser.spec.ts --workers=1` against an isolated empty demo workspace.

Storage defaults to ignored `data/workspace.json`; `BORDERLESS_DATA_PATH`
overrides it. This is one shared demo workspace, with no authentication or RBAC,
single-process serialized atomic writes, and no production tenant isolation.
Use only non-sensitive demo data. See `RELEASE_CHECKLIST.md` before any deployment.
Billing contracts exist only as a deferred adapter boundary; no live Groble
checkout, subscription activation or enterprise agreement acceptance exists.
