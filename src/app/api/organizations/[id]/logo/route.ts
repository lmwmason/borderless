import {transaction,organizationAccess} from '@/lib/organizations';
import {requireUser} from '@/lib/auth';
import {handle,assertMutationOrigin} from '@/lib/http';
import {readLogoUpload,logoResponse} from '@/lib/logo-http';
import {uploadLogo,deleteLogo,readLogo,startLogoCleanupWorker} from '@/lib/organization-logos';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){let file:Awaited<ReturnType<typeof readLogo>>|undefined;const result=await handle(async()=>{file=await readLogo(await requireUser(request),(await context.params).id);return {ok:true};});return result.ok&&file?logoResponse(file):result;}
export async function PUT(request:Request,context:Context){return handle(async()=>{const user=await requireUser(request),id=(await context.params).id;await transaction(client=>organizationAccess(client,user.id,id,{admin:true}));const input=await readLogoUpload(request);const logo=await uploadLogo(user,id,input);startLogoCleanupWorker();return {logo};});}
export async function DELETE(request:Request,context:Context){return handle(async()=>{const user=await requireUser(request);assertMutationOrigin(request);await deleteLogo(user,(await context.params).id);startLogoCleanupWorker();return {logo:null};});}
