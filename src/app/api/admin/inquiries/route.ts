import {handle} from '@/lib/http';import {requirePlatformAdmin,inquiryService} from '@/lib/billing/inquiries';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>{const query=new URL(req.url).searchParams;return inquiryService.list(await requirePlatformAdmin(req),{status:query.get('status')??undefined,salesStatus:query.get('salesStatus')??undefined,q:query.get('q')??undefined,assigneeId:query.get('assigneeId')??undefined});});}
