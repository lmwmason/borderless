import {getAuthPool,getPool} from '../db';
export const ADMIN_EMAIL_DOMAIN='admins.borderless.invalid';
function loopback(value:string|undefined){if(!value)return false;try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname.toLowerCase());}catch{return false;}}
export function adminDemoAllowed():boolean{
 return process.env.NODE_ENV==='development'&&process.env.BORDERLESS_LOCAL_ADMIN_DEMO==='true'&&loopback(process.env.BETTER_AUTH_URL)&&[process.env.DATABASE_URL_RUNTIME,process.env.DATABASE_URL_AUTH,process.env.DIRECT_DATABASE_URL].every(loopback);
}
export async function isAdminManagedUser(id:string):Promise<boolean>{return Boolean((await getAuthPool().query('SELECT 1 FROM admin_accounts WHERE user_id=$1',[id])).rowCount);}
export async function adminIsDemo(id:string):Promise<boolean>{const row=(await getAuthPool().query('SELECT is_demo FROM admin_accounts WHERE user_id=$1',[id])).rows[0];return Boolean(row?.is_demo);}
export async function isEnabledAdminUser(id:string):Promise<boolean>{
 const row=(await getAuthPool().query('SELECT enabled,is_demo FROM admin_accounts WHERE user_id=$1',[id])).rows[0];
 return Boolean(row?.enabled&&(!row.is_demo||adminDemoAllowed()));
}
export async function listEnabledAdmins():Promise<{id:string;name:string;email:string}[]>{
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');await client.query("SELECT set_config('borderless.admin_demo_allowed',$1,true)",[adminDemoAllowed()?'on':'off']);
  const rows=(await client.query('SELECT id,name,email FROM admin_directory ORDER BY name,id')).rows;
  await client.query('COMMIT');return rows;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function publicAdminEmail(email:string):Promise<boolean>{
 if(email.toLowerCase().endsWith('@'+ADMIN_EMAIL_DOMAIN))return true;
 return Boolean((await getAuthPool().query('SELECT 1 FROM admin_accounts a JOIN "user" u ON u.id=a.user_id WHERE lower(u.email)=lower($1)',[email])).rowCount);
}
