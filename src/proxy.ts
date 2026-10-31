import {NextResponse,type NextRequest} from 'next/server';
import {detectLocale,isLocale} from './i18n/text';
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname,matched=path.match(/^\/(ko|en)(?=\/|$)/),cookie=request.cookies.get('borderless_locale')?.value;
 const locale=matched?.[1]|| (isLocale(cookie)?cookie:detectLocale(request.headers.get('accept-language')));
 const headers=new Headers(request.headers);headers.set('x-borderless-locale',locale);
 const returning=request.cookies.get('borderless_checkout_return_locale')?.value;
 const transient=request.cookies.get('borderless_locale_source')?.value==='checkout'&&returning==='en';
 const entering=path==='/ko/pricing'&&request.nextUrl.searchParams.get('checkoutFrom')==='en'&&request.nextUrl.searchParams.get('returnLocale')==='en';
 const checkoutPage=(path==='/ko/pricing'||path==='/ko/billing/return')&&(transient||entering);
 const cookieOptions={path:'/',sameSite:'lax' as const,maxAge:31536000,secure:request.nextUrl.protocol==='https:'};

 if(path.startsWith('/api/')||path==='/api')return NextResponse.next({request:{headers}});
 if(matched&&/^\/(?:ko|en)\/api(?:\/|$)/.test(path))return new NextResponse(null,{status:404});
 if(transient&&!checkoutPage){const target=request.nextUrl.clone();target.pathname='/en'+(matched?path.slice(matched[0].length):path);const response=matched?.[1]==='en'?NextResponse.next({request:{headers}}):NextResponse.redirect(target,307);response.cookies.set('borderless_locale','en',cookieOptions);response.cookies.set('borderless_locale_source','manual',cookieOptions);response.cookies.delete('borderless_checkout_return_locale');return response;}

 const destination=request.nextUrl.clone();
 if(!matched){destination.pathname='/'+locale+(path==='/'?'':path);const response=NextResponse.redirect(destination,307);response.cookies.set('borderless_locale',locale,{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});if(!request.cookies.has('borderless_locale_source'))response.cookies.set('borderless_locale_source','auto',{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});return response;}
 // Locale pages are real App Router segments; no recursive standalone rewrite.
 const response=NextResponse.next({request:{headers}});
 if(checkoutPage){response.cookies.set('borderless_locale','ko',cookieOptions);response.cookies.set('borderless_locale_source','checkout',cookieOptions);response.cookies.set('borderless_checkout_return_locale','en',cookieOptions);return response;}
 if(cookie!==locale)response.cookies.set('borderless_locale',locale,{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});
 if(!request.cookies.has('borderless_locale_source'))response.cookies.set('borderless_locale_source','manual',{path:'/',sameSite:'lax',maxAge:31536000,secure:request.nextUrl.protocol==='https:'});
 return response;
}
export const config={matcher:['/((?!_next|.*\\..*).*)']};
