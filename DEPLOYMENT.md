# DEPLOYMENT.md — AXHub Only, Final Deployment Once

## Non-negotiable
All implementation and tests happen locally. No staging deploy, no preview deploy, no GitHub auto-deploy trigger. Final deployment to AXHub only after local QA passes.

## Preflight, without deploying
- Obtain current AXHub official documentation and project access.
- Confirm supported runtime/container build, ingress port, environment variables, persistence, health checks, resource limits and command syntax.
- Confirm NVIDIA outbound API calls and secret management work on AXHub.
- Do not invent an `axhub.yaml` schema or CLI commands; follow verified docs.

## Suggested packaging
Prefer single Next.js Node container with `GET /api/health`, production build and server-side NVIDIA client. Keep persistence adapter swappable; local JSON is only for demo and may not survive container restarts. Use AXHub-supported persistent storage if available.

## Environment variables
`NVIDIA_API_KEY` (secret), `NVIDIA_MODEL` (selected from actually accessible catalog), `NVIDIA_BASE_URL` (verified endpoint), `NODE_ENV=production`, storage settings as needed. No secrets in Git.

## Final-only checklist
1. Local typecheck/tests/build pass.
2. Real NVIDIA API request verified and budget capped.
3. Three scenario acceptance tests pass.
4. Citation registry checked; coverage limitation shown.
5. Container/build and health endpoint tested locally.
6. Configure secrets and AXHub runtime using verified docs.
7. STOP and request explicit user approval. Only after approval, deploy to AXHub and verify URL, health endpoint, onboarding, assessment and task edits.
8. If deployment fails, debug and repair; log any additional deployment attempt explicitly rather than falsely claiming one successful attempt.


## Mandatory human approval gate (overrides every conflicting instruction)
- Implement, test, and create local Git commits autonomously; never `git push`, open a PR, publish a release, enable auto-deploy, or transmit code to a remote repository without explicit user approval.
- Prepare AXHub configuration and verify documentation locally, but **do not run any AXHub deployment, preview, staging or remote-mutating command** until the user explicitly instructs deployment (e.g. "배포해") in a later message.
- At the end of local implementation, report completed features, tests, known gaps, commit hashes, secret configuration and AXHub readiness, then **STOP AND WAIT** for approval. The 4-hour deadline does not waive this gate.
- No commit of `.env`, credentials, customer data, or generated secrets. Preserve pre-existing uncommitted changes; use Conventional Commits after each coherent, tested feature; orchestrator owns commits.
