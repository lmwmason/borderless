export type AppLocale='ko'|'en';
export const locales:readonly AppLocale[]=['ko','en'];
export function isLocale(value:unknown):value is AppLocale{return value==='ko'||value==='en';}
export function detectLocale(acceptLanguage:string|null|undefined):AppLocale{
 const preferred=(acceptLanguage||'').split(',').map((part,index)=>{const [tag,...parameters]=part.trim().split(';');const q=parameters.find(value=>value.trim().startsWith('q='));return {tag:tag.toLowerCase(),quality:q?Number(q.trim().slice(2)):1,index};}).filter(item=>Number.isFinite(item.quality)&&item.quality>0&&item.quality<=1).sort((a,b)=>b.quality-a.quality||a.index-b.index)[0];
 return preferred?.tag==='ko'||preferred?.tag.startsWith('ko-')?'ko':'en';
}
/** Stable message IDs permit source-language catalogs without period-key ambiguity. */
export function messageKey(source:string){let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return 'm'+(hash>>>0).toString(36);}
export function localePath(href:string,locale:AppLocale):string{
 if(!href.startsWith('/')||href.startsWith('//')||/^\/(?:api|_next)(?:\/|$)/.test(href)||/^\/[^?#]*\.[a-z0-9]+(?:[?#]|$)/i.test(href))return href;
 const stripped=href.replace(/^\/(ko|en)(?=\/|[?#]|$)/,'');
 return '/'+locale+(stripped.startsWith('/')?stripped:'/'+stripped);
}
