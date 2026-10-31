import {getRequestConfig} from 'next-intl/server';
import {headers,cookies} from 'next/headers';
import {messagesFor} from './messages';
import {isLocale,detectLocale} from './text';
export default getRequestConfig(async()=>{
 const requestHeaders=await headers(),saved=(await cookies()).get('borderless_locale')?.value,forwarded=requestHeaders.get('x-borderless-locale');
 const locale=isLocale(forwarded)?forwarded:isLocale(saved)?saved:detectLocale(requestHeaders.get('accept-language'));
 return {locale,messages:messagesFor(locale),timeZone:'UTC'};
});
