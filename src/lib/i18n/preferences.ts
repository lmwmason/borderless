import {z} from 'zod';
import {getPool} from '../db';
import {requireUser} from '../auth';
import {getAdminSession} from '../admin/auth';
import {ApiError} from '../http';
const Locale=z.enum(['ko','en']);
async function identity(request:Request){
 const admin=await getAdminSession(request.headers);
 if(admin)return admin.user;
 try{return await requireUser(request);}catch(error){if(error instanceof ApiError&&[401,403].includes(error.status))return null;throw error;}
}
async function preferences(request:Request,locale?:'ko'|'en'){
 const user=await identity(request);
 if(!user)return {locale:locale??null,authenticated:false};
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');await client.query("SELECT set_config('borderless.user_id',$1,true)",[user.id]);
  const row=locale?(await client.query('INSERT INTO user_preferences(user_id,locale) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,updated_at=now() RETURNING locale',[user.id,locale])).rows[0]:(await client.query('SELECT locale FROM user_preferences WHERE user_id=$1',[user.id])).rows[0];
  await client.query('COMMIT');return {locale:(row?.locale??null) as 'ko'|'en'|null,authenticated:true};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export function getLanguagePreference(request:Request){return preferences(request);}
export function saveLanguagePreference(request:Request,locale:'ko'|'en'){return preferences(request,Locale.parse(locale));}
