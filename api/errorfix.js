import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";
const json=(res,status,data)=>res.status(status).json(data);
const gh=()=>({Authorization:"Bearer "+process.env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"});
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;
 const {error="",files=[],mode="diagnose",repository="",branch="main",doIt=false}=req.body||{};
 if(!String(error).trim())return json(res,400,{error:"error is required"});
 if(!Array.isArray(files)||files.length>12)return json(res,400,{error:"files must contain at most 12 source files"});
 try{
  const r=await generateWithRouter({task:"error recovery: "+String(error).slice(0,5000),system:"You are BHAI X Error Fixer. Return ONLY JSON {diagnosis,confidence,files}. files is an array of {path,content}; only patch paths present in INPUT. If evidence is insufficient return files: [].",messages:[{role:"user",text:"ERROR:\n"+String(error).slice(0,12000)+"\nINPUT FILES:\n"+JSON.stringify(files).slice(0,70000)}],role:"code",fallback:true});
  const fix={...JSON.parse(String(r.text).replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim()),provider:r.provider,model:r.model};
  if(!doIt||mode!=="fix")return json(res,200,{ok:true,stage:"diagnose",fix,applied:false,verification:"No files changed."});
  if(!repository)return json(res,400,{error:"repository is required for fix mode"});
  if(!process.env.GITHUB_TOKEN)return json(res,503,{error:"GITHUB_TOKEN is required for automatic error fixing"});
  const [owner,repo]=String(repository).split("/");if(!owner||!repo)return json(res,400,{error:"repository must be owner/name"});
  const applied=[];
  for(const item of Array.isArray(fix.files)?fix.files:[]){
   const original=files.find(x=>x.path===item.path);if(!original||typeof item.content!=="string")continue;
   const get=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/contents/"+item.path+"?ref="+encodeURIComponent(branch),{headers:gh()});
   const gd=await get.json().catch(()=>({}));if(!get.ok||!gd.sha)throw new Error("Could not verify current SHA for "+item.path);
   const put=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/contents/"+item.path,{method:"PUT",headers:gh(),body:JSON.stringify({message:"BHAI X AI error fixer: repair "+item.path,content:Buffer.from(item.content,"utf8").toString("base64"),branch,sha:gd.sha})});
   const pd=await put.json().catch(()=>({}));if(!put.ok)throw new Error(pd.message||"GitHub update failed for "+item.path);
   applied.push({path:item.path,commit:pd.commit?.sha||null});
  }
  return json(res,200,{ok:true,stage:"fix",fix,applied,verification:"Commit confirmed; build must pass before DONE."});
 }catch(e){return json(res,502,{ok:false,error:String(e.message||e).slice(0,1000)});}
}