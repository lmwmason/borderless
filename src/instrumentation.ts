/** Server-only startup; build workers never connect to application databases. */
export async function register(){
 if(process.env.NEXT_RUNTIME!=='nodejs'||process.env.NEXT_PHASE==='phase-production-build')return;
 const {syncPlatformOperators}=await import('./lib/billing/inquiries');
 try{await syncPlatformOperators();}catch{console.error('Platform operator provisioning could not be synchronized.');}
 const {startNotificationWorker}=await import('./lib/notifications');
 startNotificationWorker();
}
