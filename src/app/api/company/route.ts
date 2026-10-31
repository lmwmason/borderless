import {repository} from '@/lib/workspace';import {CompanySchema} from '@/lib/contracts';import {handle,readBody} from '@/lib/http';
export async function PUT(req:Request){return handle(async()=>repository.saveCompany(CompanySchema.parse(await readBody(req))))}
