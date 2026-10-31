'use client';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {useCopy} from '@/i18n/client';

export const KOREAN_CHECKOUT_NOTICE='Checkout is currently available in Korean only. You can continue to the Korean checkout page.';
type PaidPlan='Startup'|'Business';
export function KoreanCheckoutConsent({plan,organizationId,originalLocale,ready,configured,busy=false}:{plan:PaidPlan;organizationId:string;originalLocale?:'ko'|'en';ready:boolean;configured:boolean;busy?:boolean}){
 const locale=useLocale(),t=useCopy('billing');
 const [noticeOpen,setNoticeOpen]=useState(false),[opening,setOpening]=useState(false),[error,setError]=useState('');
 const korean=locale==='ko';
 const transition='/ko/pricing?'+new URLSearchParams({plan,...(organizationId?{organizationId}:{}),returnLocale:originalLocale||'en',checkoutFrom:'en'});
 async function openProvider(){
  if(!korean){setNoticeOpen(true);return;}
  if(!ready||!configured||!organizationId)return;
  setOpening(true);setError('');
  try{
   const response=await fetch('/api/organizations/'+encodeURIComponent(organizationId)+'/billing/payment-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,locale:'ko'}),cache:'no-store',credentials:'same-origin'});
   const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Unable to open Korean checkout.');
   const target=new URL(data.url);
   if(target.protocol!=='https:'||target.username||target.password||(target.port&&target.port!=='443')||!(target.hostname==='groble.im'||target.hostname.endsWith('.groble.im')))throw new Error('The configured payment link is not a valid HTTPS destination.');
   // Preserve the merchant-configured URL exactly; unsupported locale/return
   // parameters must never be appended to a payment provider URL.
   sessionStorage.setItem('borderless.checkout.organizationId',organizationId);sessionStorage.setItem('borderless.checkout.returnLocale',originalLocale|| (document.cookie.split(';').some(part=>part.trim()==='borderless_checkout_return_locale=en')?'en':'ko'));
   window.location.assign(data.url);
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to open Korean checkout.');setOpening(false);}
 }
 return <div className="korean-checkout-consent">
  <button type="button" className="primary" disabled={busy||opening||(korean&&(!ready||!configured))} onClick={()=>void openProvider()}>{opening?t('Opening Korean checkout…'):korean?t('Continue to Korean payment page'):t('Continue to checkout')}</button>
  {noticeOpen&&!korean&&<section className="alert" role="region" aria-label="Korean checkout notice"><p>{KOREAN_CHECKOUT_NOTICE}</p><p>{t('Your account language preference will remain unchanged.')}</p><div className="actions"><a className="button primary" href={transition}>Continue in Korean</a><button type="button" onClick={()=>setNoticeOpen(false)}>{t('Cancel')}</button></div></section>}
  {korean&&<p className="footnote">{t('The Groble payment page is provided in Korean. Check the merchant, price and payment terms before continuing.')}</p>}
  {error&&<p className="alert error" role="alert">{t(error)}</p>}
 </div>
}
