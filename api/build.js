import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";
const json=(res,status,data)=>res.status(status).json(data);
const headers=()=>({Authorization:"Bearer "+process.env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"});
async function guard(input){
 try{
  const r=await generateWithRouter({task:"build preflight: "+input.projectName,system:"Return ONLY JSON {risk,checks,advice}. risk=low|medium|high. Never claim success.",messages:[{role:"user",text:JSON.stringify(input)}],role:"code",fallback:true});
  return {...JSON.parse(String(r.text).replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim()),provider:r.provider,model:r.model};
 }catch(e){return{risk:"unknown",checks:["AI build guard unavailable"],advice:[String(e.message||e).slice(0,240)]};}
}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;
 const {platform="android",projectName="BHAI-App",sourceUrl="",doIt=false}=req.body||{};
 const effectiveSourceUrl=String(sourceUrl||"https://github.com/"+String(process.env.BHAI_BUILD_REPO||"aitoolproject690-netizen/BHAI-AI"));

 if(!doIt)return json(res,403,{ok:false,error:"DO IT mode is OFF"});
 const workflow=process.env.APK_BUILD_WORKFLOW||"build-apk.yml";
 const repository=process.env.BHAI_BUILD_REPO||"aitoolproject690-netizen/BHAI-AI";
 const branch=process.env.BHAI_BUILD_BRANCH||"main";
 const preflight=await guard({platform,projectName,sourceUrl:effectiveSourceUrl});
 if(preflight.risk==="high")return json(res,422,{ok:false,stage:"preflight",preflight});
 const token=process.env.GITHUB_TOKEN;if(!token)return json(res,503,{ok:false,error:"GITHUB_TOKEN is required for the real build runner.",preflight});
 const [owner,repoName]=String(repository).split("/");if(!owner||!repoName)return json(res,500,{error:"Invalid BHAI_BUILD_REPO"});
 const url="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repoName)+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches";
 const r=await fetch(url,{method:"POST",headers:headers(),body:JSON.stringify({ref:branch,inputs:{platform:String(platform),projectName:String(projectName),sourceUrl:effectiveSourceUrl}})});
 if(!r.ok)return json(res,r.status,{ok:false,stage:"dispatch",error:(await r.text()).slice(0,1000),preflight});
 return json(res,202,{ok:true,status:"dispatched",runner:"github-actions",repository,workflow,branch,platform,projectName,sourceUrl:effectiveSourceUrl,preflight,verification:"Verify workflow run and artifact before claiming build success."});
}