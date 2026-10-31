# API_CONTRACTS.md — Freeze before delegation

## Shared TypeScript contracts
```ts
type FindingStatus = 'applicable'|'not_applicable'|'insufficient_data'|'review_required';
type TaskStatus = 'todo'|'in_progress'|'in_review'|'done';
type Company = {id:string;name:string;homeCountry:'KR';industry:'b2b_saas';targetStates:string[];usEntity:boolean|null;usEmployees:number|null;usOffice:boolean|null;salesModel:'remote'|'subsidiary'|'unknown';customerType:'b2b'|'b2c'|'mixed';annualUsRevenueUsd:number|null;processesPersonalData:boolean|null;updatedAt:string};
type Source = {id:string;title:string;url:string;jurisdiction:string;reviewedAt:string;effectiveFrom?:string;verified:boolean};
type Finding = {id:string;scenarioId:string;topic:string;jurisdiction:string;status:FindingStatus;summary:string;factKeys:string[];missingFacts:string[];sourceIds:string[];assessedAt:string};
type Task = {id:string;findingId:string|null;title:string;status:TaskStatus;assignee:string|null;notes:string;evidenceRefs:string[];updatedAt:string};
type Scenario = {id:string;name:string;company:Company};
type Assessment = {id:string;scenarioId:string;findings:Finding[];questions:string[];coverage:string[];limitations:string[];partial:boolean};
```

## Endpoints
- `GET /api/health` → `{ok:boolean,version:string}`
- `GET /api/workspace` → `{company,scenarios,tasks,activity}`
- `PUT /api/company` → company
- `POST /api/scenarios` → scenario
- `PATCH /api/scenarios/:id` → scenario
- `POST /api/assessments` `{scenarioId}` → assessment or structured error
- `GET /api/assessments/:id` → assessment
- `POST /api/tasks` → task
- `PATCH /api/tasks/:id` → task
- `GET /api/sources/:id` → source
- `GET /api/reports/:assessmentId` → markdown text

Errors: `{error:{code:string,message:string,retryable:boolean}}`. Use schema validation. Do not silently change route shapes; orchestrator owns contracts.
