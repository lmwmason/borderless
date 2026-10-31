'use client';
import {useState} from 'react';
export async function expertApi<T>(url:string,method='GET',body?:unknown,projectId?:string):Promise<T>{
 const response=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(projectId?{'x-project-id':projectId}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});
 const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{throw new Error('The server returned an invalid response.')}
 if(!response.ok)throw new Error(data.error?.message||data.message||'The request could not be completed.');
 return data as T;
}
export function useExpertAction(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function run(callback:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await callback()}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 return {busy,error,notice,setError,setNotice,run};
}
export function ExpertAlerts({error,notice}:{error:string;notice?:string}){return <>{error&&<div className="alert error" role="alert">{error}</div>}{notice&&<div className="alert success" role="status">{notice}</div>}</>}
export function money(price:number|null,currency:string){if(price===null)return 'By quote';try{return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(price/(['KRW','JPY'].includes(currency)?1:100))}catch{return price+' '+currency+' minor units'}}
export function ExpertStatus({status}:{status:string}){return <span className={'expert-status '+(status==='Verified'?'verified':'')}>{status}</span>}
export const serviceTypes=['Initial Consultation','Document Review','Legal Assessment Review','Ongoing Advisory','Custom Engagement'] as const;
export const currencies=['USD','KRW','EUR','GBP','CAD','JPY'] as const;
export const splitList=(text:string)=>text.split(',').map(value=>value.trim()).filter(Boolean);
