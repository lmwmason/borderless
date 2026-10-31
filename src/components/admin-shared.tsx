'use client';
import {useState} from 'react';
export type AdminUser={id:string;name:string;email:string;loginId:string;isDemo:boolean};
export type AdminSession={user:AdminUser|null;expiresAt?:string};
export class AdminApiError extends Error{constructor(message:string,readonly status:number){super(message)}}
export async function adminApi<T>(url:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});
 let data:any;try{data=await response.json()}catch{throw new AdminApiError('The server returned an invalid response.',response.status)}
 if(!response.ok)throw new AdminApiError(data.error?.message||data.message||'The Admin Console request failed.',response.status);
 return data as T;
}
export function AdminHeader(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function logout(){setBusy(true);setError('');try{await adminApi('/api/admin/logout','POST',{});window.location.replace('/admin/login')}catch(cause){if(cause instanceof AdminApiError&&cause.status===401){window.location.replace('/admin/login');return}setError(cause instanceof Error?cause.message:'Admin sign-out failed.');setBusy(false)}}
 return <><header className="public-header admin-header"><a href="/admin" className="public-brand"><img src="/borderless-logo.png" alt="Borderless"/></a><nav aria-label="Admin Console navigation"><a className="button" href="/admin">Admin Console</a><a className="button" href="/admin/inquiries">Enterprise inquiries</a><a className="button" href="/admin/subscriptions/templates">Templates</a><button disabled={busy} onClick={()=>void logout()}>Admin sign out</button></nav></header>{error&&<div className="alert error admin-header-error" role="alert">{error}</div>}</>
}
