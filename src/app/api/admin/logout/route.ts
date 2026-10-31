import {adminSignOut} from '@/lib/admin/auth';
import {handle,readBody} from '@/lib/http';
import {z} from 'zod';
export async function POST(request:Request){
 try{z.object({}).strict().parse(await readBody(request));return await adminSignOut(request);}
 catch(error){return handle(async()=>{throw error;});}
}
