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

A documented API/webhook authenticity contract and appropriate account/keys were
not verified. Therefore checkoutAvailable=false and checkout requests return503
CONFIG_REQUIRED; no external charge or invented checkout URL, webhook signature,
price, successful payment or paid entitlement is generated. Merely setting an
unverified provider key will not bypass this gate.

BillingProvider remains the future adapter boundary. Future integration must
authenticate server events, deduplicate provider IDs, reconcile amount/product/
organization, handle expiry/refund/cancel and make entitlement updates idempotent.
payment_events has a unique provider event ID and verified flag but there is no
public fake-activation webhook endpoint. Enterprise fulfillment and contract review
are manual/unimplemented, with requests truthfully Pending.

## Canonical prices and hosted links
Free: KRW0/month; Startup: KRW49,000/month; Business: KRW149,000/month; Enterprise: Custom pricing / Contact sales. These platform subscriptions are independent of expert-set service fees.
GROBLE_STARTUP_PAYMENT_URL and GROBLE_BUSINESS_PAYMENT_URL optionally supply HTTPS groble.im hosted links; invalid/missing links remain disabled. Links are not an implementation of provider API, recurring billing or authentic webhook reconciliation. /billing/return ignores success/amount/plan query assertions and grants no paid entitlement. Actual verified Groble settlement and subscription activation remain unimplemented pending official merchant contract and credentials.
Enterprise requests preserve canonical company/requester snapshots, deduplicate submissions and remain pending contract fulfillment. Sales operators can manage pipeline/notes/assignment without changing subscription state. Won is a sales record only. No actual expert payment or platform fee is collected.

## Contract Builder and reusable examples
Enterprise overrides require a provisioned platform administrator and persisted preview/approval with explicit human contract attestation. Reference, dates, notes, feature snapshots, limits, approver and source template version are stored. Test approvals are restricted to local development and cannot grant production rights. Neither approval nor CRM Won verifies a payment. Direct legacy Enterprise plan assignment is disabled. Organizations with contract history require platform review before a self-service plan change, preventing a Free-plan detour around configured restrictions.
Free presets retain pilot Deep Review/scenario/expert/cost functions (5members/3projects/10monthly Deep starts). Startup uses20/10/100 and audit export; Business100/50/1000 adds recorded priority support. These are product usage presets, not legal thresholds or service-level guarantees. Enterprise uses its latest effective contract only.
Enterprise Standard, Legal Operations and Enterprise Plus are editable template examples derived from those presets. They do not constitute contracts or automatically assign paid features. Template changes append versions; company overrides and approved contracts remain snapshots. Reapplication requires a new explicit approval. No Groble settings, real charges or professional fees are changed.
