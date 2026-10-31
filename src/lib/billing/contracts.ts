// Deferred commercial boundary. No live payment implementation.
export type CheckoutSession={id:string;status:'pending'|'verified'|'expired';url:string};
export type Subscription={id:string;status:'pending'|'active'|'cancelled'|'past_due'};
export type PaymentEvent={id:string;type:'paid'|'failed'|'refunded'|'cancelled';verified:boolean};
export type Entitlement={companyId:string;plan:string;status:'inactive'|'active'|'revoked'};
export type ContractAcceptance={companyId:string;documentVersion:string;status:'pending'|'accepted';acceptedAt:string|null};
export interface BillingProvider{
 createCheckout(companyId:string,plan:string):Promise<CheckoutSession>;
 verifyEvent(rawBody:string,signature:string):Promise<PaymentEvent>;
}
// Payment and contract acceptance must remain independent. Future adapters must
// authenticate webhooks and deduplicate event IDs before updating entitlements.
