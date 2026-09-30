import {getDb,initDb} from "./db.js";
import {requireSession} from "./_utils.js";
import {generateWithRouter,reviewWithMultiAI,getAIProviderStatus,getConfiguredAIProviders} from "./aiRouter.js";
import {createEvidence,createRecoveryStateMachine,createMissionController} from "./engineeringCore.js";

const json=(res,s,d)=>res.status(s).json(d);

async function check(url,name){
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(5000)});
  return{name,ok:r.ok,status:r.status};
 }catch(e){return{name,ok:false,error:String(e.message||e)}}
}

async function checkGithub(){
 const token=process.env.GITHUB_TOKEN;
 if(!token)return{name:"github-auth",ok:false,status:"not_configured"};
 try{
  const r=await fetch("https://api.github.com/user",{
   headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+token},
   signal:AbortSignal.timeout(8000)
  });
  const d=await r.json().catch(()=>({}));
  return{name:"github-auth",ok:r.ok,status:r.status,login:r.ok?d.login:undefined};
 }catch(e){return{name:"github-auth",ok:false,error:String(e.message||e)}}
}

async function smokeMission(){
 const checks=[];
 const mission=createMissionController();
 const recovery=createRecoveryStateMachine();
 const evidence=createEvidence();

 // Exercise the exact safe Mission/Recovery transition contract without mutating a repository.
 try{
  mission.transition("plan");
  mission.transition("execute");
  mission.transition("recover");
  mission.transition("execute");
  mission.transition("verify");
  checks.push({name:"mission-state-machine",ok:true,history:mission.history()});
 }catch(e){checks.push({name:"mission-state-machine",ok:false,error:e.message});}

 try{
  recovery.transition("switch_provider_or_model");
  recovery.transition("resume_checkpoint");
  recovery.transition("alternate_execution");
  recovery.transition("patch_and_verify");
  checks.push({name:"recovery-state-machine",ok:true,history:recovery.history()});
 }catch(e){checks.push({name:"recovery-state-machine",ok:false,error:e.message});}

 // Synthetic proof check: DONE is only allowed when repository/branch/path/commit/read-back tests exist.
 try{
  evidence.set({repository:"smoke-test/repository",branch:"main",path:"index.html",commit:"smoke-commit"});
  evidence.addTest("read-back verification",true,"Synthetic contract test only; no repository was mutated.");
  checks.push({name:"no-proof-no-done-gate",ok:evidence.verify(),proof:evidence.snapshot()});
 }catch(e){checks.push({name:"no-proof-no-done-gate",ok:false,error:e.message});}

 // Real provider connectivity: one tiny request, no secrets returned.
 const configured=getConfiguredAIProviders();
 if(configured.length){
  try{
   const r=await generateWithRouter({
    task:"BHAI X smoke test",
    system:"Reply with exactly SMOKE_OK and nothing else.",
    messages:[{role:"user",text:"SMOKE"}],
    fallback:true
   });
   checks.push({name:"ai-execution",ok:true,provider:r.provider,model:r.model,response:String(r.text).slice(0,80)});
  }catch(e){checks.push({name:"ai-execution",ok:false,error:String(e.message||e).slice(0,300)});}
 }else{
  checks.push({name:"ai-execution",ok:false,status:"no_provider_configured"});
 }

 // If two providers exist, prove the independent reviewer route can execute too.
 if(configured.length>=2){
  try{
   const executor=await generateWithRouter({
    task:"BHAI X independent reviewer smoke test",
    system:"Reply with exactly DRAFT_OK and nothing else.",
    messages:[{role:"user",text:"DRAFT"}],
    fallback:true
   });
   const reviewer=await reviewWithMultiAI({
    task:"Check whether the draft is valid.",
    draft:executor.text,
    exclude:[executor.provider]
   });
   checks.push({name:"independent-ai-review",ok:true,executor:executor.provider,reviewer:reviewer.provider,reviewerModel:reviewer.model});
  }catch(e){checks.push({name:"independent-ai-review",ok:false,error:String(e.message||e).slice(0,300)});}
 }else{
  checks.push({name:"independent-ai-review",ok:false,status:"requires_at_least_two_configured_providers"});
 }

 return {
  ok:checks.every(x=>x.ok),
  checks,
  providers:getAIProviderStatus().map(x=>({id:x.id,configured:x.configured,model:x.model}))
 };
}

export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;

 const mode=String(req.body?.mode||"health");
 if(mode==="smoke"){
  const result=await smokeMission();
  return json(res,result.ok?200:502,{...result,verifiedAt:new Date().toISOString(),note:"Smoke mode never writes to GitHub; it verifies Mission/Recovery contracts plus real AI connectivity and independent review when two providers are configured."});
 }

 const base=String(req.body?.url||"").replace(/\/$/,"");
 const checks=[];
 if(base)checks.push(await check(base+"/api/health","backend"));
 checks.push({name:"node",ok:Number(process.versions.node.split(".")[0])>=20});
 checks.push({name:"ai-key",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)});
 checks.push({name:"database",ok:!!process.env.DATABASE_URL});
 if(process.env.DATABASE_URL){
  try{await initDb();const db=await getDb();checks.push({name:"database-connection",ok:!!db});}
  catch(e){checks.push({name:"database-connection",ok:false,error:e.message})}
 }
 checks.push(await checkGithub());
 return json(res,200,{ok:checks.every(x=>x.ok),checks,fixes:checks.filter(x=>!x.ok).map(x=>"Investigate "+x.name),verifiedAt:new Date().toISOString()});
}
