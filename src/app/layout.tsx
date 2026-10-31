import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Borderless · Regulatory workspace',description:'A practical workspace for your US market entry.',icons:{icon:'/borderless-mark.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
