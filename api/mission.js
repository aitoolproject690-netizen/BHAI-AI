import {requireSession} from "./_utils.js";
import {generateWithRouter,reviewWithMultiAI} from "./aiRouter.js";

const json=(res,status,data)=>res.status(status).json(data);
const ghHeaders=()=>({Authorization:"Bearer "+process.env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const repoCfg=(task="")=>{const m=String(task).match(/\\b([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+)\\/([^\\s]+)\\b/);if(m)return[m[1],m[2],m[3]||null];return String(process.env.BHAI_BUILD_REPO||"aitoolproject690-netizen/BHAI-AI").split("/").concat([null]).slice(0,3)};
async function gh(path,options={}){
 const r=await fetch("https://api.github.com"+path,{...options,headers:{...ghHeaders(),...(options.headers||{})}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok) throw new Error(data.message||("GitHub HTTP "+r.status));
 return data;
}
async function aiJson(task,system,role="code"){
 const r=await generateWithRouter({task,system,messages:[{role:"user",text:task}],role,fallback:true});
 let text=String(r.text||"").replace(/^\s*```json\s*/i,"").replace(/\s*```\s*$/,"").trim();
 return {...JSON.parse(text),provider:r.provider,model:r.model};
}
async function patchFiles(owner,repo,branch,patches,allowedPaths=null){
 const applied=[];
 for(const p of Array.isArray(patches)?patches:[]){
  if(!p||typeof p.path!=="string"||typeof p.content!=="string")continue;
  if(p.path.startsWith(".github/")||p.path.includes("..")||p.path.startsWith("/")||(allowedPaths&&!allowedPaths.has(p.path)))continue;
  const current=await gh("/repos/"+owner+"/"+repo+"/contents/"+encodeURIComponent(p.path).replace(/%2F/g,"/")+"?ref="+encodeURIComponent(branch));
  const body={message:"BHAI X autonomous AI fix: "+p.path,content:Buffer.from(p.content,"utf8").toString("base64"),branch,sha:current.sha};
  const out=await gh("/repos/"+owner+"/"+repo+"/contents/"+encodeURIComponent(p.path).replace(/%2F/g,"/"),{method:"PUT",body:JSON.stringify(body)});
  applied.push({path:p.path,commit:out.commit?.sha||null});
 }
 return applied;
}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;
 const {task="",projectName="BHAI-App",platform="android",branch=process.env.BHAI_BUILD_BRANCH||"main",doIt=false,maxFixes=2,autoDeploy=true}=req.body||{};
 if(!String(task).trim())return json(res,400,{error:"task is required"});
 if(!doIt)return json(res,403,{ok:false,error:"DO IT mode is OFF"});
 if(!process.env.GITHUB_TOKEN)return json(res,503,{ok:false,error:"GITHUB_TOKEN is required"});
 const [owner,repo,explicitPath]=repoCfg(task); const workflow=process.env.APK_BUILD_WORKFLOW||"build-apk.yml"; const history=[];
 const getPath=path=>gh("/repos/"+owner+"/"+repo+"/contents/"+encodeURIComponent(path).replace(/%2F/g,"/")+"?ref="+encodeURIComponent(branch));
 try{
  const plan=await aiJson("Plan this engineering task: "+String(task).slice(0,8000),
   "Return ONLY JSON {risk,plan,files}. files must contain only likely source files that need editing. Never include .github workflow files. Keep the file list small.", "code");
  history.push({stage:"plan",plan});
  if(plan.risk==="high")return json(res,422,{ok:false,status:"blocked",history,reason:"AI planner marked high risk"});
  const plannedPaths=Array.isArray(plan.files)?plan.files.filter(p=>typeof p==="string"&&!p.startsWith(".github/")&&!p.includes("..")&&!p.startsWith("/")).slice(0,6):[]; const paths=explicitPath&&!explicitPath.startsWith(".github/")&&!explicitPath.includes("..")&&!explicitPath.startsWith("/")?[explicitPath]:plannedPaths;
  const sources=[];
  for(const path of paths){try{const f=await getPath(path);if(f?.content){sources.push({path,content:Buffer.from(f.content,"base64").toString("utf8")});}}catch{}}
  let coding=null;
  if(sources.length){
   coding=await aiJson("Implement this task using the supplied repository files. TASK:\n"+String(task).slice(0,7000)+"\nFILES:\n"+JSON.stringify(sources).slice(0,60000),
    "Return ONLY JSON {diagnosis,confidence,patches}. patches must contain complete replacement files, only for supplied paths. Make the smallest safe change. Never modify workflow files or secrets. If evidence is insufficient return patches: [].", "code");
   history.push({stage:"coding",coding});
   if(Array.isArray(coding.patches)&&coding.patches.length){
    try{
     const review=await reviewWithMultiAI({task:String(task).slice(0,7000),draft:JSON.stringify(coding),exclude:[coding.provider]});
     history.push({stage:"independent-review",provider:review.provider,model:review.model,draft:String(review.text).slice(0,5000)});
    }catch(e){history.push({stage:"independent-review",status:"skipped",reason:String(e.message||e).slice(0,300)});}
    const applied=await patchFiles(owner,repo,branch,coding.patches,new Set(paths));
    history.push({stage:"coding-patch-applied",applied});
    if(!applied.length)return json(res,502,{ok:false,status:"no-patch",history,verification:"AI coding produced no applicable repository patch."});
   }else history.push({stage:"coding-patch-applied",applied:[]});
  }else history.push({stage:"coding",status:"no_source_files_identified"});
  const buildGuard=await aiJson("Build preflight for "+owner+"/"+repo+". TASK: "+String(task).slice(0,5000),
   "Return ONLY JSON {risk,checks,fixPlan,nextAction}. This is the dedicated AI Build Guard. Never claim build success without runner evidence.", "code");
  history.push({stage:"build-guard",label:"AI Build Guard",buildGuard});
  if(buildGuard.risk==="high")return json(res,422,{ok:false,status:"build-blocked",history,verification:"Build guard blocked a high-risk run; DONE is blocked."});
  let dispatch;
  try{
   dispatch=await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches",{
    method:"POST",body:JSON.stringify({ref:branch,inputs:{platform:String(platform),projectName:String(projectName),sourceUrl:"",official_release:"false"}})
   });
   history.push({stage:"build-dispatch",ok:true});
  }catch(e){
   const errorGuard=await aiJson("Build dispatch error: "+String(e.message||e)+" for "+owner+"/"+repo,
    "Return ONLY JSON {diagnosis,confidence,patches,retest}. This is the dedicated AI Error Fixer. Never modify .github workflow files. If evidence is insufficient, patches=[].", "code");
   history.push({stage:"error-tool",label:"AI Error Fixer",errorGuard});
   return json(res,502,{ok:false,status:"build-dispatch-failed",history,verification:"Build dispatch failed; dedicated error tool ran and DONE is blocked."});
  }
  let run=null;
  for(let i=0;i<18;i++){
   await sleep(5000);
   const runs=await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/runs?branch="+encodeURIComponent(branch)+"&per_page=10");
   const candidates=(runs.workflow_runs||[]).filter(x=>new Date(x.created_at).getTime()>Date.now()-180000);
   run=candidates[0];
   if(run?.status==="completed")break;
  }
  if(!run||run.status!=="completed")return json(res,202,{ok:true,status:"building",history,verification:"Workflow dispatched; completion not yet observed."});
  history.push({stage:"build-result",runId:run.id,status:run.status,conclusion:run.conclusion});
  if(run.conclusion!=="success"){
   for(let attempt=1;attempt<=Math.min(2,Number(maxFixes)||2);attempt++){
    const jobs=await gh("/repos/"+owner+"/"+repo+"/actions/runs/"+run.id+"/jobs?per_page=30");
    const failed=(jobs.jobs||[]).filter(j=>j.conclusion==="failure");
    const evidence=failed.map(j=>({name:j.name,steps:j.steps})).slice(0,8);
    const fix=await aiJson("Fix failed build for TASK: "+String(task).slice(0,5000)+"\nFAILURE:\n"+JSON.stringify(evidence).slice(0,20000),
     "Return ONLY JSON {diagnosis,confidence,patches,retest}. patches are complete replacement source files only. Never patch .github workflow files. If evidence is insufficient, patches=[].", "code");
    history.push({stage:"error-tool",label:"AI Error Fixer",attempt,fix});
    if(!Array.isArray(fix.patches)||!fix.patches.length)break;
    const review=await reviewWithMultiAI({task:"Review this build error fix: "+String(task).slice(0,4000),draft:JSON.stringify(fix),exclude:[fix.provider]});
    history.push({stage:"error-review",attempt,provider:review.provider,model:review.model});
    const applied=await patchFiles(owner,repo,branch,fix.patches,new Set(paths)); history.push({stage:"error-patch-applied",attempt,applied});
    if(!applied.length)break;
    await sleep(3000);
    await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches",{method:"POST",body:JSON.stringify({ref:branch,inputs:{platform:String(platform),projectName:String(projectName),sourceUrl:"",official_release:"false"}})});
    for(let i=0;i<18;i++){await sleep(5000);const rs=await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/runs?branch="+encodeURIComponent(branch)+"&per_page=10");const candidates=(rs.workflow_runs||[]).filter(x=>new Date(x.created_at).getTime()>Date.now()-180000);run=candidates[0];if(run?.status==="completed")break;}
    history.push({stage:"rebuild-result",attempt,runId:run?.id,status:run?.status,conclusion:run?.conclusion});
    if(run?.conclusion==="success")break;
   }
  }
  if(!run||run.conclusion!=="success")return json(res,502,{ok:false,status:"build-failed",history,verification:"Build did not pass; DONE is blocked."});
  let artifact=null;
  try{const arts=await gh("/repos/"+owner+"/"+repo+"/actions/runs/"+run.id+"/artifacts");artifact=(arts.artifacts||[]).find(a=>a.name==="BHAI-X-debug-apk"&&a.expired===false)||null;}catch{}
  history.push({stage:"artifact-verification",ok:!!artifact,artifact:artifact?{name:artifact.name,size:artifact.size_in_bytes,expired:artifact.expired}:null});
  if(!artifact)return json(res,502,{ok:false,status:"artifact-missing",history,verification:"Build passed but APK artifact was not verified."});
  if(autoDeploy){
   const key=process.env.RENDER_API_KEY; const service=process.env.RENDER_SERVICE_ID;
   if(key&&service){
    const deployGuard=await aiJson("Deployment preflight for "+owner+"/"+repo+" after verified build and APK artifact. TASK: "+String(task).slice(0,4000),
     "Return ONLY JSON {risk,checks,rollbackPlan,nextAction}. This is the dedicated AI Deploy Guard. Never claim deployment success without live health evidence.", "reviewer");
    history.push({stage:"deploy-guard",label:"AI Deploy Guard",deployGuard});
    if(deployGuard.risk==="high")return json(res,422,{ok:false,status:"deploy-blocked",history,verification:"Deploy guard blocked a high-risk deployment; DONE is blocked."});
    const dr=await fetch("https://api.render.com/v1/services/"+encodeURIComponent(service)+"/deploys",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({clearCache:false})});
    const dd=await dr.json().catch(()=>({}));
    if(!dr.ok)throw new Error(dd?.message||"Render deploy dispatch failed");
    history.push({stage:"deploy-dispatch",deployId:dd.id,status:dd.status});
    for(let i=0;i<24;i++){await sleep(5000);const rr=await fetch("https://api.render.com/v1/services/"+encodeURIComponent(service)+"/deploys/"+encodeURIComponent(dd.id),{headers:{Authorization:"Bearer "+key}});const rd=await rr.json().catch(()=>({}));history[history.length-1].lastStatus=rd.status;if(rd.status==="live"||rd.status==="build_failed"||rd.status==="deactivated"){if(rd.status!=="live")return json(res,502,{ok:false,status:"deploy-failed",history,verification:"Render deployment did not reach live."});break;}}
    const base=process.env.BHAI_PUBLIC_URL||"https://bhai-ai-vpna.onrender.com";
    try{const hr=await fetch(base+"/api/health",{signal:AbortSignal.timeout(10000)});history.push({stage:"health-check",ok:hr.ok,status:hr.status});if(!hr.ok)return json(res,502,{ok:false,status:"health-failed",history,verification:"Deploy reached live but health check failed."});}catch(e){return json(res,502,{ok:false,status:"health-failed",history,error:String(e.message||e).slice(0,300),verification:"Live deployment could not be health-verified."});}
    return json(res,200,{ok:true,status:"complete",history,verification:"Coding, independent review, build, APK artifact, deploy and health check all verified."});
   }
   history.push({stage:"deploy",status:"not_configured",reason:"RENDER_API_KEY or RENDER_SERVICE_ID missing"});
  }
  return json(res,200,{ok:true,status:"build-verified",history,verification:"Coding, build and APK artifact verified. Deployment was not dispatched."});
 }catch(e){return json(res,502,{ok:false,status:"error",history,error:String(e.message||e).slice(0,1500)});}
}