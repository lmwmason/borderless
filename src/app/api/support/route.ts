import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireProjectFeature} from '@/lib/feature-access';
import {organizationAccess,transaction,audit} from '@/lib/organizations';
import {assertFeature} from '@/lib/entitlements';
import {handle,readBody} from '@/lib/http';
export async function POST(request:Request){return handle(async()=>{
 const scope=await requireProjectFeature(request,'priority_support',true),input=z.object({message:z.string().trim().min(1).max(3000)}).strict().parse(await readBody(request));
 return transaction(async client=>{
  await organizationAccess(client,scope.user.id,scope.organizationId,{active:true,write:true,lock:true});
  await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[scope.organizationId,scope.user.id]);
  await assertFeature(client,scope.organizationId,'priority_support');
  const id=randomUUID();await audit(client,scope.user.id,scope.organizationId,'support.requested',{requestId:id,message:input.message,priority:'contract',status:'Recorded'},scope.projectId);
  return {id,status:'Recorded',message:'Your support request was recorded for platform review. No delivery or response-time guarantee is implied.'};
 });
});}
