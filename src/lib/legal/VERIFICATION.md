# Legal module verification

Official pages retrieved and read on 2026-10-31 using web tools:
- IRS Effectively connected income: US trade/business and income connection discussion.
- California SOS Starting a Business: steps 3–5, entity structure, identification, licenses.
- California SOS Statements of Information: entity filing and changes discussion.
- California EDD Step 1: Register as an Employer: employee and wage conditions.
- CPPA FAQ: Who must comply with the CCPA, and California resident scope.
- CDTFA Sales & Use Tax in California: retail goods, use tax and registration overview.

Verified retrieval evidence (all status: retrieved successfully, content reviewed; date: 2026-10-31):
- https://www.irs.gov/individuals/international-taxpayers/effectively-connected-income-eci — ECI and US trade or business paragraphs.
- https://www.sos.ca.gov/business-programs/business-entities/starting-business — Steps 3–5.
- https://www.sos.ca.gov/business-programs/business-entities/statements — Required statements / information changes.
- https://edd.ca.gov/en/payroll_taxes/step-1-register-as-an-employer/ — Register as an employer; hiring and wages.
- https://cppa.ca.gov/faq.html — Who must comply with the CCPA; who has privacy rights.
- https://cdtfa.ca.gov/taxes-and-fees/sutprograms.htm — Sales/use tax overview and registration.

Exact URLs are also stored in registry.ts. These pages were verified as sources for
conservative issue screening, not as complete legal authority. Effective dates are
deliberately omitted where no single applicable date was established. No numeric
thresholds are encoded; missing payroll wages, global revenue, data volumes,
entity details and transaction facts require review. The source snapshot expires
after 90 days and then forces review_required.

SBA registration page timed out and the initial CDTFA technology URL could not be
retrieved; neither is marked verified or cited. The legacy EDD URL redirected;
the registry uses the exact retrieved current Step 1 page.

The model may select only curated topics and source IDs. Free-form legal
conclusions, source URLs and questions with unsupported assertions are never
applied. Known fact requests are rendered with deterministic wording.

Unit command: rtk proxy npx tsx --test src/lib/legal/*.test.ts
Real NVIDIA connectivity belongs to the server integration and is not verified
by these unit tests. No API key was available to this agent.


## Nemotron structured review integration

The fixed reasoning model is configured by the orchestrator's server-side NVIDIA
client. Each model call performs issue decomposition, source selection,
applicability challenge, missing-fact discovery and exception/counterexample
review together. The engine supplies the deterministic ruleStatus and
missingFacts and accepts optional structured review and telemetry fields.

A proposed status can only preserve the deterministic result or lower certainty:
disagreement or an exception requires review; existing unknown facts remain
insufficient_data. Model missing facts are allowlisted against curated source
requirements and company/rule fact keys. No model proposal certifies applicability
or non-applicability. Free-form model conclusions remain excluded.

Budgets: depth <= 3, nodes <= 12, calls <= 15, total review deadline 90 seconds,
per-call deadline 30 seconds. HTTP abort belongs to the server client. The local
deadline also bounds a stalled callback and returns partial results honestly.

Assessment metrics aggregate model calls, reported latency (measured fallback)
and actual prompt/completion/total tokens. Missing usage is null, never estimated
or falsely zero. A failure with unreported usage makes aggregate usage unknown.


## Quick screening and resumable job snapshots

quickAssess performs deterministic screening only, makes zero provider requests,
and reports kind=quick / modelStatus=not_requested. It never labels an intentionally
unrequested model unavailable. Source freshness and missing-fact questions remain
enforced.

Deep assess accepts onProgress and signal. It emits an initial snapshot and then
one after every validated completed issue. Every snapshot is source-checked and
deep-cloned, uses the final assessment/finding IDs, and remains partial while
unfinished. Mutating an observer snapshot or its progress list cannot mutate the
engine state. Observer persistence failures propagate to the job owner.

External cancellation aborts the active provider signal and the wait immediately,
prevents further queue requests, and returns an honest partial assessment retaining
validated earlier issue reviews. Unreported token consumption remains unknown.
The engine deadline independently aborts a timed-out provider request. No
background-job recovery claim is made here; persistence/recovery belongs to the
workspace job owner.
