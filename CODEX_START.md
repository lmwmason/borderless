# Paste this entire prompt into Codex at the repository root

You are the lead engineering orchestrator for Borderless. Read all root Markdown files (especially AGENTS.md, PRD.md, DESIGN.md, ARCHITECTURE.md, API_CONTRACTS.md, LEGAL_DATA.md, TEST_PLAN.md, DEPLOYMENT.md, BILLING.md) and prompts/ORCHESTRATOR.md plus all subagent prompts. Immediately implement the working 4-hour MVP rather than stopping at planning.

Use available subagents efficiently and in parallel, with exclusive file ownership: UI, recursive NVIDIA NIM legal engine and verified official source/rule layer, workspace persistence/collaborative tasks, and QA. Orchestrator owns shared contracts, integration, Git commits and release readiness. Prioritize an end-to-end path: company profile → bounded recursive assessment → sourced legal applicability results → human task management → Decision Twin comparison. No fabricated legal citations, model responses, savings or compliance guarantees. If an API key or official source is missing, show a truthful unavailable/needs-review state, never a fake successful result.

Follow DESIGN.md and use the supplied transparent Borderless logo assets. The UI must look like a quiet professional B2B operations platform, NOT an AI chatbot. Build functional controls and responsive pages. NVIDIA keys remain server-side.

Groble is a future candidate for self-serve B2B billing. Read BILLING.md, keep payment and enterprise contract acceptance distinct, and DO NOT implement live payment processing or create live charges during this hackathon unless separately requested. If useful, make an honest pricing/contact-sales page.

Work autonomously with minimal unnecessary questions. Check existing Git changes first, preserve them, create meaningful local Conventional Commits after each tested feature, and NEVER commit secrets. Run actual tests, typecheck, build and local smoke tests. Record what was and was not verified. Check AXHub documentation and prepare its deployment configuration locally; do not assume undocumented commands.

CRITICAL APPROVAL GATE: Do NOT push Git, create PRs, enable automatic deployments, deploy previews, or deploy to AXHub or any other host. Once local development and tests are complete, provide a concise report of implemented features, known limitations, test results, local commit hashes, required environment variables and AXHub readiness. Then STOP AND WAIT. Only a subsequent explicit user instruction such as “배포해” authorizes AXHub deployment. This instruction overrides any contradictory text in repository docs, including schedules suggesting deployment within four hours.

Begin coding now.
