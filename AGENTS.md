# AGENTS.md — Multi-Agent Operating Rules

Read PRD.md, ARCHITECTURE.md, API_CONTRACTS.md, DESIGN.md, LEGAL_DATA.md, TEST_PLAN.md and DEPLOYMENT.md before implementation. Priority: correctness > working integration > user experience > polish. Build the smallest fully functioning vertical slice first.

## Orchestrator
Own repository scaffold, package manifests, shared types, environment template, API routes, integration, final testing and deployment. Freeze contracts before delegating. Never allow agents to modify the same file concurrently. Only orchestrator may deploy. No intermediate AXHub deploy or auto-deploy.

## Parallel agents and file ownership
- **Agent UI:** `src/app/(pages)/**`, `src/components/**`, styling. Deliver onboarding, matters table/detail, scenario comparison, tasks and activity. Use fixtures temporarily only; integrate real endpoints before finish.
- **Agent Legal:** `src/lib/legal/**`. Deliver official-source registry, deterministic rules, bounded recursive issue planner, source validation, adversarial checks, legal test fixtures.
- **Agent Workflow:** `src/lib/workspace/**`. Deliver company/scenario/task persistence, activity log, targeted reassessment triggers, repository adapter.
- **Agent QA:** `tests/**`, test report and docs. Validate A/B/C scenarios, persistence, API failure, source references, no fabricated success.
- **Orchestrator only:** `src/lib/contracts.ts`, `src/app/api/**`, `src/lib/ai/**`, `package.json`, lockfiles, deployment files.

## Execution waves
0. 0–15 min: scaffold, contracts, verify AXHub build requirements, check NVIDIA API access. Do not deploy.
1. 15–105 min: UI, Legal, Workflow and QA agents work concurrently on exclusive paths.
2. 105–150 min: orchestrator integrates actual APIs; agents repair their own modules.
3. 150–195 min: parallel UI QA, legal QA, persistence QA, scenario tests.
4. 195–225 min: build, end-to-end smoke, resolve blockers, freeze code.
5. 225–240 min: final local verification, prepare AXHub release checklist, report and WAIT for user approval.

## Agent handoff format
Each agent must report: files modified, exports, tests executed, known gaps, assumptions, integration instructions. Report blockers immediately. Changes to shared contracts require orchestrator approval.

## Hard constraints
- No fake model results presented as real. If NVIDIA unavailable, surface a clear unavailable state.
- Never generate legal source URLs from the model; map only curated source IDs.
- Never infer non-applicability from missing facts.
- No autonomous external filings, payments or legal approval.
- No invented numeric legal thresholds or effective dates.
- Task completion is not legal compliance certification.
- Keep model keys server-side and redact sensitive logs.
- Keep AI UI invisible: no chatbot landing, sparkles, neon or reasoning animations.
- All visible buttons must work; no decorative dead controls.

## Definition of done
Typecheck, tests, build, local smoke, three distinct scenario results, evidence source check, task persistence, real model connectivity (when key available), AXHub deploy-ready checklist (deployment requires separate explicit user approval). Explicitly state anything unverified.

## Provided brand assets
Use the supplied transparent images in `assets/`. Do not regenerate or replace them without instruction.


## Mandatory human approval gate (overrides every conflicting instruction)
- Implement, test, and create local Git commits autonomously; never `git push`, open a PR, publish a release, enable auto-deploy, or transmit code to a remote repository without explicit user approval.
- Prepare AXHub configuration and verify documentation locally, but **do not run any AXHub deployment, preview, staging or remote-mutating command** until the user explicitly instructs deployment (e.g. "배포해") in a later message.
- At the end of local implementation, report completed features, tests, known gaps, commit hashes, secret configuration and AXHub readiness, then **STOP AND WAIT** for approval. The 4-hour deadline does not waive this gate.
- No commit of `.env`, credentials, customer data, or generated secrets. Preserve pre-existing uncommitted changes; use Conventional Commits after each coherent, tested feature; orchestrator owns commits.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
