import { repository } from '@/lib/workspace';import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(){return handle(()=>repository.getWorkspace())}
