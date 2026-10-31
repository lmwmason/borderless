'use client';
import {useCopy} from '@/i18n/client';
import {useState} from 'react';
import type {AccountUser,ProjectSummary} from '@/lib/organization-contracts';
import type {Engagement} from '@/lib/expert-contracts';
import {ExpertProfileEditor} from './expert-profile';
import {ExpertMarketplace} from './expert-marketplace';
import {EngagementCenter} from './expert-engagements';
export type ExpertHubTab='profile'|'marketplace'|'engagements';
export function ExpertHub({user,projects,initialTab='profile',onBack,embedded=false}:{user:AccountUser;projects?:ProjectSummary[];initialTab?:ExpertHubTab;onBack?:()=>void;embedded?:boolean}){
 const t=useCopy('experts');
 const [tab,setTab]=useState<ExpertHubTab>(initialTab),[engagement,setEngagement]=useState<Engagement|null>(null);
 function openEngagement(next:Engagement){setEngagement(next);setTab('engagements')}
 const content=<><div className="page-heading"><div><span className="eyebrow">{t("ONE ACCOUNT · COMPANY AND EXPERT ACCESS")}</span><h1>{tab==='profile'?t("Expert workspace"):tab==='marketplace'?t("Expert Marketplace"):t("My engagements")}</h1><p>{tab==='profile'?t("Manage your own professional profile without creating an organization."):tab==='marketplace'?t("Registered professionals. Explicit sharing. Human engagement approval."):t("Keep expert requests and company collaborations in context.")}</p></div>{onBack&&<button onClick={onBack}>{t("Company workspace")}</button>}</div><nav className="organization-tabs" aria-label={t("Expert workspace navigation")}><button aria-current={tab==='profile'?'page':undefined} onClick={()=>setTab('profile')}>{t("My expert profile")}</button><button aria-current={tab==='marketplace'?'page':undefined} onClick={()=>setTab('marketplace')}>{t("Marketplace")}</button><button aria-current={tab==='engagements'?'page':undefined} onClick={()=>{setEngagement(null);setTab('engagements')}}>{t("My engagements")}</button></nav>{tab==='profile'&&<ExpertProfileEditor/>}{tab==='marketplace'&&<ExpertMarketplace projects={projects} onEngagement={openEngagement}/>} {tab==='engagements'&&<EngagementCenter user={user} projects={projects} initial={engagement}/>}</>;
 return embedded?<div className="expert-hub embedded">{content}</div>:<div className="account-shell"><header className="public-header"><button className="brand-button" onClick={onBack} aria-label={t("Company organizations")}><img src="/borderless-logo.png" alt="Borderless"/></button><div className="account-identity"><span>{user.name}<small>{user.email}</small></span><span className="demo-label">{t("Independent expert workspace")}</span></div></header><main className="account-main">{content}<footer>{t("Professional credentials remain self-reported until human verification.")}<span>{t("No payment or formal legal engagement is created automatically.")}</span></footer></main></div>
}
