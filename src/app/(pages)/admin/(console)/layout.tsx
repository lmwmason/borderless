import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAdminSession} from '@/lib/admin/auth';
export const dynamic='force-dynamic';
export default async function AdminConsoleLayout({children}:{children:React.ReactNode}){
 const session=await getAdminSession(new Headers(await headers()));
 if(!session?.user)redirect('/admin/login');
 return children;
}
