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
Visible copy follows the selected Korean/English locale, including Custom pricing and Contact sales. /pricing and company onboarding consistently show Free, Startup, Business and Enterprise. Expert profile pages combine a resume and service catalog with explicit self-reported/verified distinctions. Private documents are excluded unless visibility is explicitly public. Company and expert collaboration distinguish AI findings from authored expert opinions.

Platform sales CRM is a separate /admin/inquiries entry point visible only after server-confirmed platform capability. Company project navigation never shows it unconditionally. Dense searchable table, pipeline and assignee filters, detail panel, internal notes, chronological activity and notification status follow existing neutral surfaces. Authorization loss clears cached sensitive details. Sales success copy must not imply activated subscription or executed legal contract.

## Admin Console and templates
/admin/login is separate from regular account authentication with empty credential inputs and no client-side demo password hints. /admin uses the existing Quiet Enterprise surfaces and guarded CRM navigation. Staff rows identify administrator accounts; regular-user session controls do not revoke administrator identities.
The company contract builder shares a single feature/limit editor with /admin/subscriptions/templates. It displays current usage, selected template ID/version, editable copied settings, effective dates and internal notes. Review changes before the explicit attestation/approval step. Test and production contracts are clearly distinguished; test configurations never imply a real agreement. Existing versions/applications remain visible after archival. Feature-gated company screens display upgrade/contract notices and preserve prior data.

## Korean/English and comparison presentation
Keep the language switcher visible and preserve explicit `/ko` or `/en` navigation. Translate labels, help, notices and canonical errors while leaving user-authored names, credentials, legal sources and authoritative terms unchanged. Locale-aware formatting retains the original currency; Korean display never converts a foreign price into KRW. Expert translated descriptions use the selected language when supplied and otherwise display original text; private portfolio descriptions remain unavailable even if another language is present.
The plan comparison is additive below the existing four pricing cards. Preserve their layout, prices and payment/Enterprise actions. Use four plan columns, category divider rows and a horizontally scrollable table on narrow screens. Categories: Workspace / Legal Intelligence / Expert services / Administration; Korean Legal Intelligence label: 법률 인텔리전스. Show registry allowances, Included/Not included and Enterprise Custom configuration (맞춤 설정), with no implied Enterprise defaults. Priority support says Request recording and the cost review footnote disclaims amount estimation.
Geography forms distinguish residence, qualification, licensed jurisdiction and countries served. Unknown means unknown; never prefill residence from a license or imply that a selected jurisdiction has been human-verified.


## Customer organization identity
Customer logos are separate from the supplied Borderless wordmark and mark; never replace the product brand with an uploaded image. Reuse the protected organization-logo component in company switchers, organization headers, pricing context and admin company rows where metadata is available. Show initials when metadata is absent or an image cannot be loaded. Missing metadata must not cause an image request. Constrain logos with `object-fit:contain`; preserve aspect ratio, avoid stretching/cropping and maintain mobile containment.

Only Owner/Admin sees upload/replace/delete actions. Show the supported PNG/JPEG/WebP types and 2 MiB limit, an accessible file label, immediate image validation feedback and a real busy/error state. Successful upload uses the server-returned safe metadata. Member/Viewer receives read-only branding; Pending applicants see no internal company logo bytes. No paid external upload widget or placeholder image service is introduced.

## Korean-only hosted checkout
English paid-plan actions remain usable to inspect the language notice even when no provider page can yet be opened. Show this notice verbatim: “Checkout is currently available in Korean only. You can continue to the Korean checkout page.” Provide a separate “Continue in Korean” action and Cancel. Clicking the English action alone must not request a provider link or navigate to Groble.

Carry the requested plan and authorized organization ID into Korean pricing. Opening the provider remains a second explicit action, enabled only after matching saved plan, current terms and valid link configuration. Use the shared consent component in pricing and company onboarding. Temporary Korean checkout must not overwrite the account's saved English preference. The return screen stays “Payment confirmation pending” and offers English billing navigation when applicable; it never displays an invented successful payment.

Configured provider URLs are not translated, rewritten or augmented. The UI does not promise an automatic return from Groble because merchant return-URL support is unverified. Preserve the originating organization and return locale in same-tab session storage as navigation context only.
