'use client';
import {useState} from 'react';
import {useCopy} from '@/i18n/client';
import type {OrganizationLogoMetadata} from '@/lib/organization-contracts';
export function OrganizationLogo({organizationId,name,logo,admin=false,size=44,decorative=false}:{organizationId:string;name:string;logo?:OrganizationLogoMetadata|null;admin?:boolean;size?:number;decorative?:boolean}){
 const t=useCopy('common'),[failed,setFailed]=useState('');
 const src=logo?`/api/${admin?'admin/':''}organizations/${encodeURIComponent(organizationId)}/logo?v=${encodeURIComponent(logo.id)}`:'';
 const initials=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase()||'—';
 return <span className="organization-logo" aria-hidden={decorative||undefined} style={{width:size,height:size,minWidth:size,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,verticalAlign:'middle',borderRadius:8,border:'1px solid var(--line, #e4e8ed)',background:'var(--surface, #fff)',padding:4,boxSizing:'border-box',overflow:'hidden',fontSize:Math.max(12,Math.round(size*.31)),fontWeight:600,color:'var(--muted, #607080)'}}>{src&&failed!==src?<img src={src} alt={decorative?'':t('{name} organization logo',{name})} onError={()=>setFailed(src)} style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/>:<span role={decorative?undefined:'img'} aria-label={decorative?undefined:t('{name} organization initials',{name})}>{initials}</span>}</span>;
}
