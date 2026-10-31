# BILLING.md — Groble billing strategy (post-MVP)

## Decision
Groble is a candidate payment processor for Korean startup customers. It is NOT assumed to provide B2B electronic contract signing, tax invoices, invoicing, or enterprise procurement. Confirm current official documentation, eligibility, fees, webhook support, authentication, and commercial terms before implementing. Do not fabricate API routes, webhook signatures, pricing or capabilities.

## Commercial flows
1. Self-serve startup: company account → accept versioned SaaS terms and privacy/data processing terms as applicable → select plan → hosted checkout if supported → server-verified payment confirmation → subscription entitlement.
2. Enterprise: sales inquiry → negotiated order form/MSA/DPA as applicable → human contract approval → invoicing/payment workflow appropriate to customer; Groble only if supported and agreed.
3. Never equate successful payment with signed enterprise contract, and never activate paid access from a browser redirect alone.

## Future implementation interfaces
- `BillingProvider` adapter, `CheckoutSession`, `Subscription`, `PaymentEvent`, `Entitlement`, `ContractAcceptance` with separate states.
- Verify webhook authenticity, deduplicate event IDs, make entitlement changes idempotent, handle refunds/cancellations/failed payments.
- Store no card details. Keep billing keys server-side. Use sandbox credentials only during testing.
- Price hypotheses: Launch Audit per-report, Startup monthly, Business monthly, enterprise custom. Do not publish prices as validated market rates.

## Four-hour hackathon scope
Billing integration is **P2 / deferred**. Show an honest pricing/Contact Sales page if time permits, without fake checkout, fake contracts or nonfunctional payment buttons. Focus on legal assessment + collaborative workflow + Decision Twin. Never initiate a live charge or create a live Groble merchant account autonomously.
