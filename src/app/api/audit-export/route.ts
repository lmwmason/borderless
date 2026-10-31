import {requireProjectFeature} from '@/lib/feature-access';
import {organizationAccess,transaction,audit} from '@/lib/organizations';
import {assertFeature} from '@/lib/entitlements';
import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const response=await handle(async()=>{
  const scope=await requireProjectFeature(request,'audit_log_export');
  return transaction(async client=>{
   await organizationAccess(client,scope.user.id,scope.organizationId,{admin:true,active:true,lock:true});
   await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[scope.organizationId,scope.user.id]);
   await assertFeature(client,scope.organizationId,'audit_log_export');
   const rows=(await client.query('SELECT id,project_id,actor_id,action,detail,created_at FROM audit_logs WHERE organization_id=$1 AND (project_id=$2 OR project_id IS NULL) ORDER BY created_at DESC,id LIMIT 1000',[scope.organizationId,scope.projectId])).rows;
   await audit(client,scope.user.id,scope.organizationId,'audit.exported',{projectId:scope.projectId,count:rows.length},scope.projectId);
   return {organizationId:scope.organizationId,projectId:scope.projectId,limit:1000,events:rows};
  });
 });
 if(response.ok)response.headers.set('Content-Disposition','attachment; filename="borderless-audit.json"');return response;
}
