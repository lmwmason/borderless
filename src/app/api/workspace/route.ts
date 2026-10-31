import { repository } from '@/lib/workspace';import {reviewService} from '@/lib/ai/review-jobs';import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(){return handle(async()=>{await reviewService.recover();return repository.getWorkspace();})}
