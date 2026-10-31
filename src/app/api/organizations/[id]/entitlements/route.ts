import {handle} from '@/lib/http';
import {requireUser} from '@/lib/auth';
import {organizationAccess,transaction} from '@/lib/organizations';
import {resolveEntitlements} from '@/lib/entitlements';
export const dynamic='force-dynamic';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{
 const user=await requireUser(request),id=(await ctx.params).id;
 return transaction(async client=>{
  await organizationAccess(client,user.id,id);
  await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[id,user.id]);
  return resolveEntitlements(client,id);
 });
});}
