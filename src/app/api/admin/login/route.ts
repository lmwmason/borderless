import {adminSignIn} from '@/lib/admin/auth';
import {handle,readBody} from '@/lib/http';
import {z} from 'zod';
export async function POST(request:Request){
 try{return await adminSignIn(request,z.object({loginId:z.string().trim().min(1).max(128),password:z.string().min(1).max(128)}).strict().parse(await readBody(request)));}
 catch(error){return handle(async()=>{throw error;});}
}
