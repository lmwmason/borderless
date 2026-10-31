import {NextResponse,type NextRequest} from 'next/server';
import {detectLocale,isLocale} from './i18n/text';
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname,matched=path.match(/^\/(ko|en)(?=\/|$)/),cookie=request.cookies.get('borderless_locale')?.value;
 const locale=matched?.[1]|| (isLocale(cookie)?cookie:detectLocale(request.headers.get('accept-language')));
 const headers=new Headers(request.headers);headers.set('x-borderless-locale',locale);
 if(path.startsWith('/api/')||path==='/api')return NextResponse.next({request:{headers}});
 if(matched&&/^\/(?:ko|en)\/api(?:\/|$)/.test(path))return new NextResponse(null,{status:404});
 const destination=request.nextUrl.clone();
 if(!matched){destination.pathname='/'+locale+(path==='/'?'':path);const response=NextResponse.redirect(destination,307);response.cookies.set('borderless_locale',locale,{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});if(!request.cookies.has('borderless_locale_source'))response.cookies.set('borderless_locale_source','auto',{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});return response;}
 // Locale pages are real App Router segments; no recursive standalone rewrite.
 const response=NextResponse.next({request:{headers}});
 if(cookie!==locale)response.cookies.set('borderless_locale',locale,{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});
 if(!request.cookies.has('borderless_locale_source'))response.cookies.set('borderless_locale_source','manual',{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});
 return response;
}
export const config={matcher:['/((?!_next|.*\\..*).*)']};
