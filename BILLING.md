# Billing and enterprise onboarding

## Implemented local state machine

Draft organization creation also creates Owner/workspace and Pending Free
subscription. Owner/Admin selects Free/Startup/Business/Enterprise. Canonical pilot
service terms are returned by the server; acceptance records actor ID, version,
hash and server timestamp independently of subscription/payment.

Free activation requires current terms acceptance and runs atomically without a
charge. Selecting a paid plan requests Pending status and cannot activate paid
features. Enterprise requests record notes and Pending human review. No enterprise
contract is asserted to have been signed by service-terms acceptance.

Subscription states: Pending/Active/Failed/Canceled/Expired. Entitlements require
Active organization and Active subscription; paid states additionally require
future expiry. Cancellation/expiry never deletes project records. Pending local
requests can be canceled and retried or switched to Free. Changes to an actually
Active subscription require human/provider review until verified integration
exists. Subscription and payment changes are actor-audited.

## Groble integration boundary

Official material checked: https://www.groble.im/help/faq (2026-10-31), describing
the seller/consumer checkout product. This does not establish a public merchant
API, recurring SaaS billing, signed webhooks or B2B contract signing.

A documented API/webhook authenticity contract and appropriate merchant verification credentials remain unverified. This does not prevent an authorized user from opening a configured hosted payment link: checkoutAvailable reflects the selected Startup/Business plan's valid server configuration. Link issuance requires Korean request context, Owner/Admin, the matching saved plan and current service terms. Non-Korean requests return409 CHECKOUT_LANGUAGE_REQUIRED; missing or invalid links return503 CONFIG_REQUIRED. The application never invents a URL, webhook signature, successful payment or paid entitlement. No actual payment was performed during local verification.

BillingProvider remains the future adapter boundary. Future integration must
authenticate server events, deduplicate provider IDs, reconcile amount/product/
organization, handle expiry/refund/cancel and make entitlement updates idempotent.
payment_events has a unique provider event ID and verified flag but there is no
public fake-activation webhook endpoint. Enterprise legal execution remains external. Human-reviewed contract snapshots and explicit approvals are implemented separately; an inquiry alone stays Pending and grants no rights.

## Canonical prices and hosted links
Free: KRW0/month; Startup: KRW49,000/month; Business: KRW149,000/month; Enterprise: Custom pricing / Contact sales. These platform subscriptions are independent of expert-set service fees.
GROBLE_STARTUP_URL and GROBLE_BUSINESS_URL are the authoritative hosted-link settings. The older GROBLE_STARTUP_PAYMENT_URL and GROBLE_BUSINESS_PAYMENT_URL names are compatibility fallbacks only when the corresponding new variable is absent; an explicitly empty or invalid new value fails closed and never falls back. Only HTTPS groble.im or its subdomains, without URL credentials or a nonstandard port, are accepted. Both new settings have been configured locally; their values must never appear in source, documentation, screenshots or logs. Links are not an implementation of provider API, recurring billing or authentic webhook reconciliation. /billing/return ignores success/amount/plan query assertions and grants no paid entitlement. Actual verified Groble settlement and subscription activation remain unimplemented pending official merchant contract and credentials.
Enterprise requests preserve canonical company/requester snapshots, deduplicate submissions and remain pending contract fulfillment. Sales operators can manage pipeline/notes/assignment without changing subscription state. Won is a sales record only. No actual expert payment or platform fee is collected.

## Contract Builder and reusable examples
Enterprise overrides require a provisioned platform administrator and persisted preview/approval with explicit human contract attestation. Reference, dates, notes, feature snapshots, limits, approver and source template version are stored. Test approvals are restricted to local development and cannot grant production rights. Neither approval nor CRM Won verifies a payment. Direct legacy Enterprise plan assignment is disabled. Organizations with contract history require platform review before a self-service plan change, preventing a Free-plan detour around configured restrictions.
Free presets retain pilot Deep Review/scenario/expert/cost functions (5members/3projects/10monthly Deep starts). Startup uses20/10/100 and audit export; Business100/50/1000 adds recorded priority support. These are product usage presets, not legal thresholds or service-level guarantees. Enterprise uses its latest effective contract only.
Enterprise Standard, Legal Operations and Enterprise Plus are editable template examples derived from those presets. They do not constitute contracts or automatically assign paid features. Template changes append versions; company overrides and approved contracts remain snapshots. Reapplication requires a new explicit approval. No Groble settings, real charges or professional fees are changed.


## Language consent and return handling
Checkout is Korean-only on the server. Public pricing reports `checkoutLocale:'ko'` and real configured flags, not private link values. English users see exactly: “Checkout is currently available in Korean only. You can continue to the Korean checkout page.” A separate “Continue in Korean” action navigates to `/ko/pricing?plan=...&organizationId=...&returnLocale=en&checkoutFrom=en`; it does not open the provider directly.

The browser then explicitly requests the Korean link. The server resolves the proxy-overwritten `x-borderless-locale`, falling back to locale cookie/Accept-Language for direct requests, and independently rechecks membership, selected plan and immutable current terms acceptance. Client body `locale:'ko'` and Referer cannot grant permission or override an English context.

Temporary checkout cookies select Korean while preserving the authenticated account's saved English preference. Leaving the Korean pricing/return flow restores English; an explicit language choice clears checkout context. Same-tab session storage retains only organization ID and return language so a supported provider return can point back to the right billing screen. These values and URL success/paid/status assertions never establish payment proof.

The configured Groble URL is passed through exactly as configured: no locale, organization, price or return parameters are invented or appended. Official public [Groble product information](https://www.groble.im/) and [FAQ](https://www.groble.im/help/faq) describe hosted checkout, but custom merchant return-URL configuration support was not established by that material. If the merchant dashboard supports it, an operator can separately configure the canonical application `/ko/billing/return` URL. Support remains **unverified**; do not promise an automatic redirect.

A real provider payment/settlement verification API, signed webhook reconciliation and paid activation are not implemented. Manual provider verification is an operational prerequisite, not an implemented activation integration. The current return page always remains pending and performs no payment/subscription mutation. Expert fees and platform commissions are not collected by this integration.
