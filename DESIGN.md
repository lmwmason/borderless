# DESIGN.md — Quiet Enterprise

## Positioning
Looks like Stripe Dashboard × Linear × Notion, not a generative AI tool. Calm, precise, trustworthy, dense enough for serious operations.

## Tokens
Canvas #F7F8FA; surface #FFFFFF; text #20242B; muted #596579; accent #335C8A; border #E5E9EF; success #16866A; caution #A66A19; danger #B74444. Inter + Pretendard/system Korean font. 8px spacing rhythm, 6–10px corners, subtle borders, minimal shadows. No gradient hero, glassmorphism, robot/brain/sparkle icons.

## Navigation
Left sidebar: Overview, Regulatory Matters, Scenarios, Tasks, Activity. Top: company name, jurisdiction coverage, last assessment date. Responsive collapsed sidebar on mobile.

## Screens
- Landing: understated headline, product preview, start button.
- Onboarding: compact progressive company questionnaire with unknown options.
- Overview: pending matters, open tasks, recent decisions, source coverage.
- Regulatory Matters: sortable table, filters, status text, detail drawer with facts, cited official source, limitations, next actions.
- Scenarios: side-by-side current vs proposed plan, changed findings and explicitly assumed costs.
- Tasks: assignee, status, notes, linked matter, evidence; editable and persisted.
- Activity: chronological audit events.

## Copy
Use 'Regulatory assessment', 'Review required', 'Information missing', 'Source verified on [date]', 'Coverage: selected US federal and California topics'. Avoid 'AI is thinking', '100% compliant', 'Guaranteed savings'. Color is never the only status indicator.

## Accessibility and behavior
Keyboard accessible controls, focus indicators, proper labels, empty/loading/error states, responsive 375px and 1440px. Every CTA performs a real action. AI runs as background service; human approval stays visible.

## Brand assets
- `assets/borderless-logo.png`: transparent full horizontal wordmark; use in landing and authentication headers.
- `assets/borderless-mark.png`: transparent icon; use for navigation and app icon.
- These assets are provided; use them rather than substituting an emoji, generic icon, or AI-generated placeholder.
- The logo itself has a restrained blue gradient; do not introduce gradients elsewhere in the UI.


## Commercial UX
Pricing and enterprise sales pages should match Quiet Enterprise. Never simulate a successful checkout or imply an enterprise contract has been executed. No AI-style purchase funnel.
## Account and organization navigation

Public landing has signup/signin only. A signed-in user with no approved company
sees create/join and pending approval. Company selection and project selection are
different screens. Company workspace shows overview, membership, plans and project
list; regulatory/task/scenario/activity/document navigation exists only inside a
selected project. Header/breadcrumb show current user, company, project and role.
Draft activation steps show canonical terms and explicit payment configuration
state; no paid-success simulation. Viewer controls are disabled and explained,
with server authorization authoritative. Quick and Deep results remain separate,
and every deep topic distinguishes validated completion from rule screening.

## Marketplace and platform sales
All visible copy remains English, including Custom pricing and Contact sales. /pricing and company onboarding consistently show Free, Startup, Business and Enterprise. Expert profile pages combine a resume and service catalog with explicit self-reported/verified distinctions. Private documents are excluded unless visibility is explicitly public. Company and expert collaboration distinguish AI findings from authored expert opinions.

Platform sales CRM is a separate /admin/inquiries entry point visible only after server-confirmed platform capability. Company project navigation never shows it unconditionally. Dense searchable table, pipeline and assignee filters, detail panel, internal notes, chronological activity and notification status follow existing neutral surfaces. Authorization loss clears cached sensitive details. Sales success copy must not imply activated subscription or executed legal contract.
