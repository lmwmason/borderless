'use client';
import {useEffect,useState} from 'react';
export function BillingReturnPage(){
 const [organizationId,setOrganizationId]=useState('');
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('organizationId');if(id&&id.length<=128)setOrganizationId(id)},[]);
 const target=organizationId?'/?'+new URLSearchParams({organizationId,view:'billing'}):'/';
 return <div className="public-shell"><header className="public-header"><a href="/" className="public-brand"><img src="/borderless-logo.png" alt="Borderless"/></a><a className="button" href="/pricing">Company plans</a></header><main className="account-main billing-return-main"><section className="panel account-panel"><span className="eyebrow">BILLING RETURN</span><h1>Payment confirmation pending</h1><p>Returning from an external payment page is not evidence of verified payment. URL parameters do not confirm a charge, change a subscription or activate organization access.</p><div className="alert">Only server-side payment verification and the applicable activation checks can confirm paid entitlements. Enterprise agreement execution remains separate.</div><p>Check the organization's saved billing state with an authorized account. If you are signed out, sign in from the company workspace.</p><a className="button" href={target}>Open organization billing →</a><p className="footnote">This return page performs no payment, subscription or activation mutations.</p></section></main></div>
}
