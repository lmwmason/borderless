import { migrateDatabase } from '../src/lib/db/migrate';
async function main(){await migrateDatabase();console.info('Database migrations applied.');}
main().catch(()=>{console.error('Database migration failed. Check the direct owner connection and migration compatibility.');process.exitCode=1;});
