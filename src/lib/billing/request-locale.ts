import {detectLocale,isLocale} from '@/i18n/text';
/** Proxy always overwrites this header; direct unit requests fall back to browser preferences. */
export function paymentRequestLocale(request:Request):'ko'|'en'{const header=request.headers.get('x-borderless-locale');if(isLocale(header))return header;const cookie=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('borderless_locale='))?.slice('borderless_locale='.length);return isLocale(cookie)?cookie:detectLocale(request.headers.get('accept-language'));}
