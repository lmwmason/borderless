# ARCHITECTURE.md

## MVP architecture
Single Next.js TypeScript app with server-side API routes, NVIDIA NIM client, curated legal registry and local persistence adapter. Prefer one container for AXHub; confirm supported runtime from actual AXHub project documentation before writing deployment config. Do not assume any specific YAML schema.

## Pipeline
Company facts → relevant issue detection → bounded recursive issue queue → retrieve curated official source IDs → rule evaluation → LLM challenge / missing-fact discovery → verified findings → proposed tasks → human review → fact changes → targeted reassessment.

## Recursive control
IssueNode: id, parentId, topic, depth, factKeys, sourceIds. Fingerprint topic + normalized facts + source version. Max depth 3, 12 nodes, 15 model calls, hard request timeout, retry cap. Cache duplicate issues. On timeout, return partial/unknown, never a fabricated conclusion.

## Modules
`src/lib/contracts.ts` shared Zod schemas/types; `src/lib/legal/` registry/rules/recursive engine; `src/lib/ai/nvidia.ts` server-side client; `src/lib/workspace/` storage/events; `src/app/api/` routes; `src/components/` UI.

## Persistence
Local SQLite if compatible with target AXHub runtime, otherwise JSON for single-user demo only. Abstract repository to replace with PostgreSQL later. Never claim JSON storage is production multi-tenant ready.

## Security
NVIDIA key only on server. Validate all model JSON. Use curated source IDs instead of LLM-generated links. No external filing or sending without human confirmation. Minimize personal/company confidential data; do not submit sensitive uploads to external inference without consent.


## Future commercial module
Billing is a provider adapter behind server-side interfaces, with payment event verification and entitlements separated from agreement/contract acceptance. See BILLING.md. Do not couple the legal engine to a payment vendor.