'use client';
import {useCopy} from '@/i18n/client';
import {useFormatter} from 'next-intl';
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
export function ExpertAlerts({error,notice}:{error:string;notice?:string}){
 const t=useCopy('experts');return <>{error&&<div className="alert error" role="alert">{t(error)}</div>}{notice&&<div className="alert success" role="status">{t(notice)}</div>}</>}
export function useExpertFormatting(){
 const formatter=useFormatter(),t=useCopy('experts');
 return {money(price:number|null,currency:string){if(price===null)return t('By quote');try{return formatter.number(price/(['KRW','JPY'].includes(currency)?1:100),{style:'currency',currency})}catch{return t('{amount} {currency} minor units',{amount:formatter.number(price),currency})}},dateTime(value:string|number|Date){const date=value instanceof Date?value:new Date(value);return Number.isFinite(date.getTime())?formatter.dateTime(date,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):t('Date unavailable')}};
}

export function ExpertStatus({status}:{status:string}){
 const t=useCopy('experts');return <span className={'expert-status '+(status==='Verified'?'verified':'')}>{t(status)}</span>}
export const serviceTypes=['Initial Consultation','Document Review','Legal Assessment Review','Ongoing Advisory','Custom Engagement'] as const;
export const currencies=['USD','KRW','EUR','GBP','CAD','JPY'] as const;
export const splitList=(text:string)=>text.split(',').map(value=>value.trim()).filter(Boolean);
