import {provisionAdmin} from '../src/lib/admin/auth';
import {closePools} from '../src/lib/db';
import {ApiError} from '../src/lib/http';
async function main(){
 const args=process.argv.slice(2);if(args.some(arg=>arg!=='--demo'))throw new Error('Unsupported initializer argument.');
 const loginId=process.env.BORDERLESS_ADMIN_LOGIN,password=process.env.BORDERLESS_ADMIN_PASSWORD;
 if(!loginId||!password)throw new Error('Administrator credentials must be supplied through server environment variables.');
 await provisionAdmin({loginId,password,name:process.env.BORDERLESS_ADMIN_NAME||undefined,demo:args.includes('--demo')});
 console.info('Administrator initialized. Existing accounts and passwords were not replaced.');
}
main().catch(error=>{console.error(error instanceof ApiError?'Administrator initialization refused ('+error.code+').':'Administrator initialization failed. Check required server configuration and password policy.');process.exitCode=1;}).finally(()=>closePools());
