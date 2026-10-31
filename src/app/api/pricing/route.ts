import {pricingConfiguration} from '@/lib/billing/payment-links';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(pricingConfiguration(),{headers:{'Cache-Control':'no-store'}})}
