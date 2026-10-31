# Local release readiness — 2026-10-31

## Packaging prepared, deployment not authorized

- Next.js standalone Node container, unprivileged runtime user.
- PORT=8080 default, listens on 0.0.0.0; GET /api/health does not contact storage or inference.
- axhub.yaml uses documented axhub/v1 fields and passed local manifest validation.
- NVIDIA runtime secrets declared by name only. No secret values committed.
- No remote repository configured; no push, PR, preview, staging, publish or deployment executed.
- Source of AXHub requirements: https://docs.axhub.ai/llms-deploy.ko.txt
- Manifest reference: https://docs.axhub.ai/ko/docs/reference/yaml
- NVIDIA request reference: https://docs.api.nvidia.com/nim/reference/llm-apis

## Local verification

- 32 automated tests passed, including A/B/C, actual route handlers, storage, adversarial model output and HTTP authority origin guard.
- Typecheck and optimized production build passed.
- Standalone production health, workspace, HTML, scripts, CSS and supplied logo requests returned 200.
- Client static build scan found no NVIDIA_API_KEY identifier or test credential marker.
- Browser verification details and screenshots are recorded in QA_REPORT.md.

## Release blockers to resolve before deployment

1. Real local inference verified for fixed nvidia/nemotron-3.5-super-vl-120b-a12b with thinking enabled.
   The key is local only; AXHub runtime secret configuration still requires deployment authorization.
2. Choose production persistence. Current JSON adapter persists local refresh/restart
   but AXHub container files can disappear on restart/redeploy/sleep. It is not
   suitable for customer data. A PostgreSQL repository adapter is not implemented.
3. Confirm AXHub tenant/app binding, secret registration, outbound 443, actual
   resource limits and durable storage under deployment authorization.
4. Authentication, organization isolation, RBAC and production audit security are
   deferred. Keep the MVP in a trusted single-workspace demo environment.
5. No Docker/Podman executable was available in this environment. Dockerfile image
   build is unverified; local standalone Node packaging is smoke-tested instead.
6. Human legal review is required. Additional statutory criteria cannot all be
   supplied through the MVP questionnaire. No legal certification is offered.

## Environment

NVIDIA_API_KEY (runtime secret); model and hosted base URL are fixed server constants;
BORDERLESS_DATA_PATH (local demo file, default ./data/workspace.json);
PORT and NODE_ENV (runtime). Never put model credentials in NEXT_PUBLIC variables.

## Approval gate

STOP after local verification and commits. A subsequent explicit user instruction
such as “배포해” is required before remote code transmission or deployment.
Do not enable Git push hooks or automatic deployment.

Real NVIDIA single-call smoke: 19,448 ms; 2,280 total tokens reported by provider.

Full recursive real-model smoke returned an explicit partial assessment at 90 seconds; no claim of complete legal coverage.
