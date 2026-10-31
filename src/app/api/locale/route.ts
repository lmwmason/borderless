import {z} from 'zod';
import {handle,readBody} from '@/lib/http';
import {getLanguagePreference,saveLanguagePreference} from '@/lib/i18n/preferences';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>getLanguagePreference(request));}
export async function POST(request:Request){
 const response=await handle(async()=>{const input=z.object({locale:z.enum(['ko','en'])}).strict().parse(await readBody(request));return saveLanguagePreference(request,input.locale);});
 if(response.ok){const copy=await response.clone().json();const secure=process.env.NODE_ENV==='production'?'; Secure':'';response.headers.append('Set-Cookie','borderless_locale='+copy.locale+'; Path=/; Max-Age=31536000; SameSite=Lax'+secure);response.headers.append('Set-Cookie','borderless_locale_source=manual; Path=/; Max-Age=31536000; SameSite=Lax'+secure);}
 return response;
}
