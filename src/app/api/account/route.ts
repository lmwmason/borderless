import {getAuth} from '@/lib/auth';import {organizationService} from '@/lib/organizations';import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>{const session=await getAuth().api.getSession({headers:req.headers});if(!session)return {user:null,organizations:[],pending:[]};return organizationService.account(session.user);})}
