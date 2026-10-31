import {requireProjectFeature} from '@/lib/feature-access';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>{const scope=await requireProjectFeature(req,'expert_marketplace');return expertService.search(scope.user,Object.fromEntries(new URL(req.url).searchParams));})}
