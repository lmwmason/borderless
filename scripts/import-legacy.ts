import {getAuthPool,getPool,closePools} from '../src/lib/db';
import {authorizeProject} from '../src/lib/organizations';
import {importLegacy} from '../src/lib/workspace/import-legacy';
async function main(){
 const args=process.argv.slice(2),value=(key:string)=>args[args.indexOf(key)+1];
 if(!args.includes('--file')||!args.includes('--project')||!args.includes('--owner'))throw new Error('Use --file <legacy.json> --project <id> --owner <userId> [--execute]. Default is dry-run.');
 const userId=value('--owner'),projectId=value('--project'),scope=await authorizeProject(userId,projectId,true);
 const user=(await getAuthPool().query('SELECT id,name,email FROM "user" WHERE id=$1',[userId])).rows[0];
 if(!user)throw new Error('Owner account not found.');
 console.log(await importLegacy({user,...scope},value('--file'),!args.includes('--execute')));
}
main().catch(()=>{console.error('Legacy import refused. Check the owner, empty destination, input references and schema; original file was not changed.');process.exitCode=1;}).finally(()=>closePools());
