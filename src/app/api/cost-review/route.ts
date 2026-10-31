import {requireProjectFeature} from '@/lib/feature-access';
import {createProjectRepository} from '@/lib/workspace/postgres';
import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
 const scope=await requireProjectFeature(request,'cost_review'),workspace=await createProjectRepository(scope).getWorkspace();
 return {findings:workspace.assessments.flatMap(assessment=>assessment.findings.filter(finding=>/tax|employment|registration|entity|formation/i.test(finding.topic)).map(finding=>({assessmentId:assessment.id,...finding}))),limitations:['Cost-related regulatory matters for human financial review. No monetary estimates, savings or professional fee quotes are generated.']};
});}
