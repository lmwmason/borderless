import type { Metadata } from 'next';
import {NextIntlClientProvider} from 'next-intl';
import {getLocale,getMessages} from 'next-intl/server';
import {LanguageSwitcher} from '@/i18n/client';
import './globals.css';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:locale==='ko'?'Borderless · 규제 업무 공간':'Borderless · Regulatory workspace',description:locale==='ko'?'미국 진출을 준비하는 기업과 전문가를 위한 업무 공간':'A practical workspace for your US market entry.',icons:{icon:'/borderless-mark.png'}};}
export default async function RootLayout({children}:{children:React.ReactNode}){const locale=await getLocale(),messages=await getMessages();return <html lang={locale}><body><NextIntlClientProvider locale={locale} messages={messages}><LanguageSwitcher/>{children}</NextIntlClientProvider></body></html>}
