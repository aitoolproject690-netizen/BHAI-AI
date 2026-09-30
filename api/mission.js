import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";

const json=(res,status,data)=>res.status(status).json(data);
const ghHeaders=()=>({Authorization:"Bearer "+process.env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const repoCfg=()=>String(process.env.BHAI_BUILD_REPO||"aitoolproject690-netizen/BHAI-AI").split("/");
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
async function patchFiles(owner,repo,branch,patches){
 const applied=[];
 for(const p of Array.isArray(patches)?patches:[]){
  if(!p||typeof p.path!=="string"||typeof p.content!=="string")continue;
  if(p.path.startsWith(".github/")||p.path.includes("..")||p.path.startsWith("/"))continue;
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
 const {task="",projectName="BHAI-App",platform="android",branch=process.env.BHAI_BUILD_BRANCH||"main",doIt=false,maxFixes=2}=req.body||{};
 if(!String(task).trim())return json(res,400,{error:"task is required"});
 if(!doIt)return json(res,403,{ok:false,error:"DO IT mode is OFF"});
 if(!process.env.GITHUB_TOKEN)return json(res,503,{ok:false,error:"GITHUB_TOKEN is required"});
 const [owner,repo]=repoCfg(); const workflow=process.env.APK_BUILD_WORKFLOW||"build-apk.yml";
 const history=[];
 try{
  const plan=await aiJson("Plan this engineering task and identify the smallest safe code changes: "+String(task).slice(0,8000),
   "Return ONLY JSON {risk,plan,files}. risk=low|medium|high. files is an array of likely source paths. Do not invent evidence.", "code");
  history.push({stage:"plan",plan});
  if(plan.risk==="high")return json(res,422,{ok:false,status:"blocked",history,reason:"AI planner marked high risk"});
  const dispatch=await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches",{
   method:"POST",body:JSON.stringify({ref:branch,inputs:{platform:String(platform),projectName:String(projectName),sourceUrl:""}})
  });
  history.push({stage:"build-dispatch",ok:true});
  let run=null;
  for(let i=0;i<12;i++){
   await sleep(5000);
   const runs=await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/runs?branch="+encodeURIComponent(branch)+"&per_page=5");
   run=(runs.workflow_runs||[]).find(x=>x.status!=="queued"||x.created_at);
   if(run&&(run.status==="completed"||run.conclusion==="failure"||run.conclusion==="success"))break;
  }
  if(!run)return json(res,202,{ok:true,status:"building",history,verification:"Workflow dispatched; no completed run observed yet."});
  history.push({stage:"build-result",runId:run.id,status:run.status,conclusion:run.conclusion});
  if(run.conclusion==="success")return json(res,200,{ok:true,status:"verified",history,verification:"GitHub Actions build completed successfully."});
  for(let attempt=1;attempt<=Math.min(2,Number(maxFixes)||2);attempt++){
   const jobs=await gh("/repos/"+owner+"/"+repo+"/actions/runs/"+run.id+"/jobs?per_page=20");
   const failed=(jobs.jobs||[]).filter(j=>j.conclusion==="failure");
   const evidence=failed.map(j=>({name:j.name,conclusion:j.conclusion,steps:j.steps})).slice(0,8);
   const fix=await aiJson("Fix this failed build. TASK: "+String(task).slice(0,5000)+"\nFAILURE EVIDENCE:\n"+JSON.stringify(evidence).slice(0,18000),
    "Return ONLY JSON {diagnosis,confidence,patches,retest}. patches are complete replacement source files only. Use only paths you can justify from evidence; if insufficient, patches=[]. Never patch workflow files. Do not claim success.", "code");
   history.push({stage:"ai-fix",attempt,fix});
   if(!Array.isArray(fix.patches)||!fix.patches.length)break;
   const applied=await patchFiles(owner,repo,branch,fix.patches);
   history.push({stage:"patch-applied",attempt,applied});
   if(!applied.length)break;
   await sleep(4000);
   const runs2=await gh("/repos/"+owner+"/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/runs?branch="+encodeURIComponent(branch)+"&per_page=5");
   run=(runs2.workflow_runs||[])[0];
   for(let i=0;i<12;i++){
    await sleep(5000);
    const rr=await gh("/repos/"+owner+"/"+repo+"/actions/runs/"+run.id);
    if(rr.status==="completed"){run=rr;break;}
   }
   history.push({stage:"rebuild-result",attempt,runId:run.id,status:run.status,conclusion:run.conclusion});
   if(run.conclusion==="success")return json(res,200,{ok:true,status:"verified-after-fix",history,verification:"Build passed after AI patch and rebuild."});
  }
  return json(res,502,{ok:false,status:"needs-evidence",history,verification:"Automatic fixes were attempted only when AI produced justified complete-file patches; build is not marked DONE."});
 }catch(e){return json(res,502,{ok:false,status:"error",history,error:String(e.message||e).slice(0,1500)});}
}