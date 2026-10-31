'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {isLocale,localePath,messageKey,type AppLocale} from './text';
export function useCopy(scope:string){
 const translate=useTranslations(scope);
 return useCallback((source:string,values?:Record<string,string|number|Date>)=>{const key=messageKey(source);return translate.has(key)?translate(key,values):source;},[translate]);
}
export function useLocalePath(){const selected=useLocale();const locale=isLocale(selected)?selected:'en';return useCallback((href:string)=>localePath(href,locale),[locale]);}
function currentLocale():AppLocale{return typeof document!=='undefined'&&document.documentElement.lang==='ko'?'ko':'en';}
export async function persistLocalePreference(){
 if(typeof document!=='undefined'&&document.cookie.split(';').some(part=>part.trim()==='borderless_locale_source=checkout'))return;
 try{await fetch('/api/locale',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:currentLocale()}),cache:'no-store'});}catch{}
}
export function LanguageSwitcher(){
 const selected=useLocale(),locale=isLocale(selected)?selected:'en';
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(next:AppLocale){
  setBusy(true);setError('');try{const result=await fetch('/api/locale',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:next}),cache:'no-store'});if(!result.ok)throw new Error();const destination=new URL(window.location.href);destination.searchParams.delete('checkoutFrom');destination.searchParams.delete('returnLocale');window.location.assign(localePath(destination.pathname+destination.search+destination.hash,next));}catch{setError(locale==='ko'?'언어 설정을 저장하지 못했습니다. 다시 시도해 주세요.':'Language preference could not be saved. Please retry.');setBusy(false);}
 }
 useEffect(()=>{
  let alive=true;
  async function synchronize(){
   if(document.cookie.split(';').some(part=>part.trim()==='borderless_locale_source=checkout'))return;
   try{
    const response=await fetch('/api/locale',{cache:'no-store',credentials:'same-origin'});if(!response.ok)return;const preference=await response.json();if(!alive||!preference.authenticated)return;
    const manual=document.cookie.split(';').some(part=>part.trim()==='borderless_locale_source=manual');
    if(!manual&&isLocale(preference.locale)&&preference.locale!==locale){await change(preference.locale);return;}
    if(!preference.locale||manual&&preference.locale!==locale)await persistLocalePreference();
   }catch{}
  }
  void synchronize();window.addEventListener('borderless:auth',synchronize);return()=>{alive=false;window.removeEventListener('borderless:auth',synchronize)};
 },[locale]);
 return <div className="locale-toolbar"><nav aria-label="Language / 언어"><button type="button" lang="ko" aria-pressed={locale==='ko'} disabled={busy} onClick={()=>void change('ko')}>한국어</button><span aria-hidden="true">/</span><button type="button" lang="en" aria-pressed={locale==='en'} disabled={busy} onClick={()=>void change('en')}>English</button></nav>{error&&<span role="alert">{error}</span>}</div>;
}
