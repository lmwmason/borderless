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