import type {PoolClient} from 'pg';
import type {AccountUser} from '../organization-contracts';
import {getPool} from '../db';
import {ApiError} from '../http';
export function isExpertReviewer(user:Pick<AccountUser,'id'>):boolean{
 return (process.env.BORDERLESS_EXPERT_REVIEWER_IDS||'').split(',').map(value=>value.trim()).filter(Boolean).includes(user.id);
}
export async function withExpertActor<T>(user:AccountUser,run:(client:PoolClient)=>Promise<T>,options:{reviewer?:boolean;engagementId?:string}={}):Promise<T>{
 if(!user.id)throw new ApiError(401,'UNAUTHENTICATED','Sign in to continue.');
 if(options.reviewer&&!isExpertReviewer(user))throw new ApiError(403,'REVIEWER_REQUIRED','An explicitly configured human reviewer is required.');
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT set_config('borderless.user_id',$1,true),set_config('borderless.expert_reviewer',$2,true),set_config('borderless.review_engagement_id',$3,true)",[user.id,options.reviewer?'on':'off',options.reviewer?options.engagementId||'':'']);
  const result=await run(client);await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
