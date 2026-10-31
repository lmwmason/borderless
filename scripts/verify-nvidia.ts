import { assess } from '../src/lib/legal';
import { nvidiaModel, isNvidiaConfigured, NVIDIA_MODEL } from '../src/lib/ai/nvidia';
async function main(){
if(!isNvidiaConfigured()){console.log('NVIDIA_API_KEY unavailable; real inference NOT verified.');process.exitCode=2;}
else {
 try {
 if(process.argv.includes('--assessment')){
 const result=await assess({id:'synthetic-nim-check',name:'Synthetic NIM verification',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()},'synthetic',nvidiaModel);
 console.log(JSON.stringify({engineVerified:result.modelStatus==='available',partial:result.partial,metrics:result.metrics,findings:result.findings.map(f=>({topic:f.topic,status:f.status})),limitations:result.limitations}));
 return;
 }
 const result=await nvidiaModel({topic:'California employment',facts:{usEmployees:0,targetStates:['CA']},sourceIds:['ca-employer'],ruleStatus:'not_applicable',missingFacts:[]});
 console.log(JSON.stringify({verified:true,model:NVIDIA_MODEL,thinking:true,telemetry:result.telemetry,sourceIdsValid:result.sourceIds.every(id=>id==='ca-employer')}));
 }catch(error) {console.log(JSON.stringify({verified:false,reason:error instanceof Error?error.name:'UnknownError',message:error instanceof Error&&error.message.startsWith('NVIDIA request failed')?error.message:'Request timed out, transport failed, or returned unsupported content.',fallback:false}));process.exitCode=1;}
}

}
void main();
