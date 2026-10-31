import {createTranslator} from 'next-intl';
import common from './catalogs/common.json';
import errors from './catalogs/errors.json';
import admin from './catalogs/admin.json';
import account from './catalogs/account.json';
import workspace from './catalogs/workspace.json';
import legal from './catalogs/legal.json';
import experts from './catalogs/experts.json';
import billing from './catalogs/billing.json';
import {messageKey,type AppLocale} from './text';
export const catalogs={common,errors,admin,account,workspace,legal,experts,billing} as Record<string,Record<string,string>>;
export function messagesFor(locale:AppLocale){
 const messages:Record<string,Record<string,string>>={};
 for(const [scope,catalog] of Object.entries(catalogs)){
  const packed:Record<string,string>={},sources=new Map<string,string>();
  for(const [source,translation] of Object.entries({...common,...errors,...catalog})){
   const key=messageKey(source);if(sources.has(key)&&sources.get(key)!==source)throw new Error('Translation message ID collision.');sources.set(key,source);packed[key]=locale==='ko'?String(translation):source;
  }
  messages[scope]=packed;
 }
 return messages;
}
export function translateCopy(locale:AppLocale,scope:string,source:string,values?:Record<string,string|number|Date>){
 const message=messagesFor(locale)[scope]?.[messageKey(source)];if(!message)return source;
 const translator=createTranslator({locale,messages:{message},onError:()=>{},getMessageFallback:()=>source});
 return translator('message',values);
}
