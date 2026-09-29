import { selectSkillsForTask, getSkillPromptContext } from "../src/skillsRouter.js";
import { ownerState, ownerReady } from "./owner.js";
import { getDb } from "./db.js";
import { getSession } from "./accounts.js";

const json=(res,status,data)=>res.status(status).json(data);

async function webSearch(q){
 const r=await fetch("https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),{headers:{"User-Agent":"Mozilla/5.0 BHAI-AI/1.0"}});
 const html=await r.text(); if(!r.ok) throw new Error("Web search failed");
 const out=[]; const re=/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g; let m;
 while((m=re.exec(html))&&out.length<8){
  const title=m[2].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
  const url=m[1].replace(/&amp;/g,"&"); const tail=html.slice(m.index,m.index+5000);
  const sm=tail.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
  const snippet=(sm?sm[1]:"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
  if(title&&url) out.push({title,url,snippet});
 } return out;
}

async function generateImage(prompt,aspectRatio="16:9"){
 const width=aspectRatio==="9:16"?768:aspectRatio==="1:1"?768:1024;
 const height=aspectRatio==="9:16"?1365:aspectRatio==="1:1"?768:576;
 const hf=process.env.HF_TOKEN;
 const hfModel=process.env.HF_IMAGE_MODEL||"black-forest-labs/FLUX.1-dev";
 if(hf){
  try{
   const {InferenceClient}=await import("@huggingface/inference");
   const client=new InferenceClient(hf);
   const image=await client.textToImage({model:hfModel,provider:"auto",inputs:prompt,width,height},{outputType:"blob"});
   const b=Buffer.from(await image.arrayBuffer());
   return {mimeType:"image/png",data:b.toString("base64"),provider:"huggingface"};
  }catch(e){
   const msg=String(e?.message||e);
   if(!/401|403|402|unauthorized|forbidden|payment|quota|credit/i.test(msg)) throw new Error("Hugging Face image generation failed: "+msg.slice(0,500));
  }
 }
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key) throw new Error("No image provider configured. Add HF_TOKEN (recommended) or GEMINI_API_KEY in Render Environment.");
 const model=process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image";
 const r=await fetch("https://generativelanguage.googleapis.com/v1/models/"+encodeURIComponent(model)+":generateContent",{
  method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:["IMAGE"],imageConfig:{aspectRatio}}})
 });
 const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||"Image generation failed");
 const p=(d?.candidates?.[0]?.content?.parts||[]).find(x=>x.inlineData?.data);
 if(!p?.inlineData?.data) throw new Error("Image model returned no image.");
 return {mimeType:p.inlineData.mimeType||"image/png",data:p.inlineData.data,provider:"gemini"};
}

async function github(action,a){
 const token=process.env.GITHUB_TOKEN;
 const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
 if(token) h.Authorization="Bearer "+token;
 if(!a.owner||!a.repo) throw new Error("GitHub owner and repo are required.");
 const base="https://api.github.com/repos/"+encodeURIComponent(a.owner)+"/"+encodeURIComponent(a.repo),branch=a.branch||"main";
 if(action==="github_info"){
  const r=await fetch(base,{headers:h}),d=await r.json(); if(!r.ok) throw new Error(d.message||"GitHub request failed");
  return{name:d.full_name,default_branch:d.default_branch,private:d.private,url:d.html_url,permissions:d.permissions||null};
 }
 if(action==="github_create_repo"){
  if(!token) throw new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render Environment.");
  if(!a.name) throw new Error("Repository name is required.");
  if(!a.doIt) throw new Error("DO IT mode is OFF; enable DO IT before creating a repository.");
  const r=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({name:String(a.name).trim(),description:String(a.description||"Created by BHAI X"),private:!!a.private,auto_init:true})});
  const d=await r.json(); if(!r.ok) throw new Error(d.message||"GitHub repository creation failed");
  return{ok:true,created:true,full_name:d.full_name,default_branch:d.default_branch,url:d.html_url,clone_url:d.clone_url};
 }
 if(action==="github_read"){
  const r=await fetch(base+"/contents/"+a.path+"?ref="+encodeURIComponent(branch),{headers:h}),d=await r.json();
  if(!r.ok) throw new Error(d.message||"GitHub read failed");
  if(Array.isArray(d)) return{type:"directory",items:d.map(x=>({name:x.name,path:x.path,type:x.type}))};
  return{type:"file",path:d.path,sha:d.sha,content:Buffer.from(d.content||"","base64").toString("utf8")};
 }
 if(action==="github_actions"){  if(!token) throw new Error("GITHUB_TOKEN is required for workflow/build actions.");  const workflow=a.workflow||a.workflow_id;  if(a.operation==="list"){const r=await fetch(base+"/actions/workflows",{headers:h}),d=await r.json();if(!r.ok)throw new Error(d.message||"GitHub workflows failed");return{workflows:(d.workflows||[]).map(w=>({id:w.id,name:w.name,path:w.path,state:w.state}))};}  if(a.operation==="dispatch"){if(!a.doIt)throw new Error("DO IT mode is OFF.");if(!workflow)throw new Error("workflow is required");const r=await fetch(base+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({ref:branch,inputs:a.inputs||{}})});if(!r.ok)throw new Error((await r.text()).slice(0,500)||"Workflow dispatch failed");return{ok:true,dispatched:true,workflow,branch};}  if(a.operation==="runs"){const r=await fetch(base+"/actions/runs?per_page="+encodeURIComponent(a.limit||5),{headers:h}),d=await r.json();if(!r.ok)throw new Error(d.message||"Workflow runs failed");return{runs:(d.workflow_runs||[]).map(w=>({id:w.id,name:w.name,status:w.status,conclusion:w.conclusion,sha:w.head_sha,created_at:w.created_at,url:w.html_url}))};}  if(a.operation==="jobs"){if(!a.runId)throw new Error("runId is required");const r=await fetch(base+"/actions/runs/"+encodeURIComponent(a.runId)+"/jobs",{headers:h}),d=await r.json();if(!r.ok)throw new Error(d.message||"Workflow jobs failed");return{jobs:(d.jobs||[]).map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,steps:j.steps||[]}))};}  throw new Error("Unsupported GitHub actions operation"); } if(action==="github_update"){
  if(!token) throw new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render to let BHAI AI modify repositories.");
  if(!a.doIt) throw new Error("DO IT mode is OFF; enable DO IT before executing GitHub changes.");
  if(!a.path||typeof a.content!=="string") throw new Error("path and content are required");
  if(a.content.length>500000) throw new Error("File is too large for direct agent update.");
  let sha; const c=await fetch(base+"/contents/"+a.path+"?ref="+encodeURIComponent(branch),{headers:h});
  if(c.ok) sha=(await c.json()).sha;
  const body={message:"BHAI AI: update "+a.path,content:Buffer.from(a.content,"utf8").toString("base64"),branch}; if(sha) body.sha=sha;
  const r=await fetch(base+"/contents/"+a.path,{method:"PUT",headers:{"Content-Type":"application/json",...h},body:JSON.stringify(body)}),d=await r.json();
  if(!r.ok) throw new Error(d.message||"GitHub update failed");
  return{ok:true,path:a.path,commit:d.commit?.sha||null};
 }
 throw new Error("Unsupported tool");
}

const toolDefinitions=[
 {name:"generate_image",description:"Generate an actual image. Prefer Hugging Face Inference Providers when HF_TOKEN is configured; fall back to Gemini when available. Use this when the user asks to create, draw, generate, make, design, or visualize an image. Do not merely write an image prompt when this tool is available.",parameters:{type:"OBJECT",properties:{prompt:{type:"STRING",description:"Detailed image-generation prompt based on the user's request"},aspectRatio:{type:"STRING",description:"Output aspect ratio, usually 1:1, 16:9, or 9:16"}},required:["prompt"]}},
 {name:"web_search",description:"Search public web for current information. Use only when the task genuinely needs current external information.",parameters:{type:"OBJECT",properties:{query:{type:"STRING",description:"Search query"}},required:["query"]}},
 {name:"github_info",description:"Get GitHub repository information. Use once to verify the repository before repository work.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"}},required:["owner","repo"]}},
 {name:"github_create_repo",description:"Create a real GitHub repository for the user. Only use when DO IT is ON and the user explicitly asks BHAI X to create a repository. Never claim creation unless the GitHub API confirms it.",parameters:{type:"OBJECT",properties:{name:{type:"STRING"},description:{type:"STRING"},private:{type:"BOOLEAN"}},required:["name"]}},
 {name:"github_read",description:"Read a GitHub file or directory. Prefer one root directory read first, then only the minimum key files needed. Never reread a path.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path"]}}, {name:"github_actions",description:"Run and inspect GitHub Actions for builds/tests. Use dispatch only in DO IT mode after code changes or when the user explicitly asks to build/test. Use runs/jobs to verify real results before claiming success.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},branch:{type:"STRING"},operation:{type:"STRING",description:"list, dispatch, runs, or jobs"},workflow:{type:"STRING"},runId:{type:"STRING"},limit:{type:"NUMBER"},inputs:{type:"OBJECT"}},required:["owner","repo","operation"]}}
];
if(process.env.GITHUB_TOKEN) toolDefinitions.push({name:"github_update",description:"Create or replace a GitHub text file. Only use when DO IT is ON and the user clearly requested the change. Prefer one update per changed file after inspection.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},content:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path","content"]}});

function toGeminiContents(messages){
 return messages.filter(m=>m&&["user","assistant"].includes(m.role)).map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:String(m.text||"")}] }));
}

function compactContents(messages){
 const keep=messages.slice(-12);
 return keep.map(m=>({
  ...m,
  parts:Array.isArray(m.parts)?m.parts.map(p=>{
   if(typeof p.text==="string" && p.text.length>7000) return {...p,text:p.text.slice(0,7000)+"\\n[context trimmed]"};
   if(p.functionResponse?.response?.result?.content && typeof p.functionResponse.response.result.content==="string" && p.functionResponse.response.result.content.length>7000){
    return {...p,functionResponse:{...p.functionResponse,response:{...p.functionResponse.response,result:{...p.functionResponse.response.result,content:p.functionResponse.response.result.content.slice(0,7000)+"\\n[tool output trimmed]"}}}};
   }
   return p;
  }):m.parts
 }));
}

async function geminiGenerate(apiKey,model,system,contents,useTools=true,activeDefinitions=toolDefinitions){
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
  method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
  body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,...(useTools?{tools:[{functionDeclarations:activeDefinitions}]}:{}),generationConfig:{temperature:0.2}})
 });
 const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||"Gemini API request failed"); return d;
}

export default async function handler(req,res){
 await ownerReady;
 const db=await getDb();
 if(!db) return json(res,503,{error:"DATABASE_URL is required"});
 const account=await getSession(req,db);
 if(!account) return json(res,401,{error:"Login required. Open Account and login before using BHAI X Agent."});
 const control=ownerState();
 if(control.serverMode==="maintenance") return json(res,503,{error:"BHAI X is in owner maintenance mode.",maintenance:true});
 if(control.emergencyLock) return json(res,423,{error:"BHAI X is temporarily locked by the owner.",locked:true});
 if(req.method!=="POST") return json(res,405,{error:"Method not allowed"});
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key) return json(res,503,{error:"AI provider is not configured. Add GEMINI_API_KEY in Render Environment."});
 const {messages=[],doIt=false}=req.body||{},activity=[];
 const latestUserMessage=[...messages].reverse().find(m=>m&&m.role==="user")?.text||"";
 const selectedSkills=selectSkillsForTask(latestUserMessage);
 const skillContext=getSkillPromptContext(selectedSkills);
 const system=`You are BHAI AI, a practical personal work agent. ${skillContext}
Reply in Hinglish when the user does. Be concise and action-oriented. DO IT mode is ${doIt?"ON":"OFF"}.

EXECUTION POLICY:
- First make a compact internal plan: desired outcome, required skills, minimum tools/files. Before execution, perform a pre-flight risk check for API/model availability, credentials, required files, dependencies and target service health whenever relevant. Prevent predictable failures instead of waiting for them.
- Execute skills in the selected order. Do not randomly switch skills.
- For repository work: github_info once, then read the repository root directory once. Treat that listing as authoritative: only read exact file/directory paths returned by it; never guess paths and never reread a path.
- Do not search the web unless current external information is genuinely required.
- Do not repeat a failed tool call with the same arguments. If a tool fails, use the error to adjust once; otherwise move forward with gathered information.
- Prefer implementing once enough context is available. Do not keep reading files just to understand the whole repository.
- GitHub changes require DO IT mode ON and a clear user request.- For coding/debugging tasks, inspect the smallest relevant files, identify the root cause, make the complete fix, then use GitHub Actions to build/test when a suitable workflow exists. Never claim code is fixed or built until the repository/tool result confirms it.- When a build/test fails, read the failure result, diagnose it, patch the relevant file, and rerun the workflow. Continue until success or a concrete blocker. For transient API/network/model failures, retry with backoff, use a verified compatible fallback, then resume from the last checkpoint.- For "make an app/APK" tasks, treat source changes, build workflow, build execution, artifact verification, and final delivery as one task when the repository supports them.
- After successful requested changes, stop tools and report changed files and commit result.
- Never claim an action happened unless a tool result confirms it. Never say DONE when verification is missing. Every final report must state completed work, remaining work, verification performed, and one or more useful next-step recommendations when appropriate.`;

 let contents=compactContents(toGeminiContents(messages));
 const activeToolDefinitions=selectedSkills.includes("web-research") ? toolDefinitions : toolDefinitions.filter(t=>t.name!=="web_search");
 async function getAvailableModels(){
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models",{headers:{"x-goog-api-key":key}});
 const d=await r.json();
 if(!r.ok) throw new Error(d?.error?.message||"Unable to list Gemini models");
 return (d.models||[])
  .filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent"))
  .map(m=>String(m.name||"").replace(/^models\//,""))
  .filter(Boolean);
}
const models=await getAvailableModels();
const preferred=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.5-flash-lite","gemini-3.1-pro-preview"];
models.sort((a,b)=>{const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi);});
 const isTransientModelError=(e)=>/429|RESOURCE_EXHAUSTED|quota|rate.?limit|high demand|temporarily unavailable|try again later|overloaded/i.test(String(e?.message||e));
 const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
 const generateWithFallback=async(useTools=true)=>{let last;for(const m of models){for(let attempt=0;attempt<3;attempt++){try{return await geminiGenerate(key,m,system,contents,useTools,activeToolDefinitions)}catch(e){last=e;if(!isTransientModelError(e))throw e;if(attempt<4) await sleep(Math.min(5000,1200*Math.pow(2,attempt)));}}}throw last;};
 const seenCalls=new Map(),readPaths=new Set(),failedCalls=new Set(),generatedImages=[];
 let githubReadCount=0,totalToolCalls=0,consecutiveFailures=0;
 const knownPaths=new Set(["","/"]);
 let rootListed=false;
 const maxGithubReads=8,maxToolCalls=12,maxRounds=6;

 for(let round=0;round<maxRounds && totalToolCalls<maxToolCalls;round++){
  let d; try{d=await generateWithFallback(true)}catch(e){return json(res,502,{error:e.message,activity})}
  const candidate=d.candidates?.[0],parts=candidate?.content?.parts||[];
  const calls=parts.filter(p=>p.functionCall).map(p=>p.functionCall);
  if(!calls.length){
   const text=parts.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
   return json(res,200,{text:text||"Image ready.",activity,images:generatedImages});
  }
  contents.push(candidate.content);
  const allowedCalls=calls.slice(0,3),responseParts=[];
  for(const call of allowedCalls){
   if(totalToolCalls>=maxToolCalls) break;
   const name=call.name,a={...(call.args||{}),doIt},cacheKey=name+":"+JSON.stringify(a);
   activity.push({tool:name,state:"running"}); totalToolCalls++;
   if((name==="github_update" || (name==="github_actions" && a.operation==="dispatch")) && !control.modules.builds){
    const msg="Owner has disabled build/core execution module."; activity[activity.length-1].state="blocked"; responseParts.push({functionResponse:{name,response:{error:msg}}}); continue;
   }
   if(name==="github_update" && !control.modules.coding){
    const msg="Owner has disabled coding module."; activity[activity.length-1].state="blocked"; responseParts.push({functionResponse:{name,response:{error:msg}}}); continue;
   }
   if(name==="web_search" && !control.modules.agent){
    const msg="Owner has disabled AI Agent module."; activity[activity.length-1].state="blocked"; responseParts.push({functionResponse:{name,response:{error:msg}}}); continue;
   }
   try{
    if(seenCalls.has(cacheKey)){const cached=seenCalls.get(cacheKey);activity[activity.length-1].state="cached";responseParts.push({functionResponse:{name,response:{result:cached,cached:true}}});continue;}
    if(failedCalls.has(cacheKey)) throw new Error("Smart retry guard: this exact failed tool call will not be retried.");
    if(name==="github_read"){
     const readKey=a.owner+"/"+a.repo+":"+(a.branch||"main")+":"+a.path;
     if(readPaths.has(readKey)) throw new Error("Smart read guard: this GitHub path was already inspected; use the existing result.");
     if(githubReadCount>=maxGithubReads) throw new Error("Smart read budget reached. Stop reading and execute using the information already gathered.");
     readPaths.add(readKey);githubReadCount++;
    }
    const normalizedPath=typeof a.path==="string"?(a.path==="."||a.path==="/"?"":a.path.replace(/^\/+/, "")):"";
    if(name==="github_read" && !rootListed){
     const rootResult=await github("github_read",{...a,path:""});
     rootListed=true;
     for(const item of rootResult.items||[]) knownPaths.add(item.path);
     seenCalls.set("github_read:"+a.owner+"/"+a.repo+":"+(a.branch||"main")+":",rootResult);
     if(normalizedPath===""){
      seenCalls.set(cacheKey,rootResult);
      consecutiveFailures=0;
      activity[activity.length-1].state="done";
      responseParts.push({functionResponse:{name,response:{result:rootResult}}});
      continue;
     }
    }
    if(name==="github_read" && normalizedPath!=="" && !knownPaths.has(normalizedPath)){
     activity[activity.length-1].state="skipped";
     responseParts.push({functionResponse:{name,response:{result:{skipped:true,reason:"Path is not in the authoritative repository listing. Use an exact returned path."}}}});
     continue;
    }
    const result=name==="web_search"?await webSearch(a.query):name==="generate_image"?await generateImage(a.prompt,a.aspectRatio||"16:9"):await github(name,{...a,path:normalizedPath});
    if(name==="generate_image") generatedImages.push({mimeType:result.mimeType,data:result.data});
    if(name==="github_read" && result?.type==="directory"){
     if(normalizedPath==="") rootListed=true;
     for(const item of result.items||[]) knownPaths.add(item.path);
    }
    seenCalls.set(cacheKey,result);consecutiveFailures=0;activity[activity.length-1].state="done";
    responseParts.push({functionResponse:{name,response:{result}}});
   }catch(e){
    const msg=String(e?.message||e);
    const isGitHubReadMiss=name==="github_read" && /not found|path.*not|does not exist/i.test(msg);
    if(isGitHubReadMiss){
     activity[activity.length-1].state="skipped";
     responseParts.push({functionResponse:{name,response:{result:{skipped:true,reason:msg}}}});
     continue;
    }
    failedCalls.add(cacheKey);consecutiveFailures++;activity[activity.length-1].state="failed";
    responseParts.push({functionResponse:{name,response:{error:msg}}});
   }
  }
  if(calls.length>allowedCalls.length) responseParts.push({functionResponse:{name:"tool_budget_guard",response:{error:"At most 3 tool calls are allowed per model round. Continue from returned results instead of issuing parallel calls."}}});
  contents.push({role:"user",parts:responseParts});
  contents=compactContents(contents);
  if(consecutiveFailures>=2) break;
 }

 const finalSystem=system+" You have reached the safe execution budget. Do not call any more tools. Use the information already gathered and give the best possible final response. If the requested code change was not completed, clearly state what remains.";
 try{
  const fd=await (async()=>{let last;for(const m of models){for(let attempt=0;attempt<4;attempt++){try{return await geminiGenerate(key,m,finalSystem,compactContents(contents),false,activeToolDefinitions)}catch(e){last=e;if(!isTransientModelError(e))throw e;if(attempt<3) await sleep(Math.min(6000,1500*Math.pow(2,attempt)));}}}throw last;})();
  const fp=fd.candidates?.[0]?.content?.parts||[],ft=fp.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
  return json(res,200,{text:ft||"Task completed.",activity,images:generatedImages});
 }catch(e){return json(res,500,{error:"Safe execution limit reached. The agent stopped to avoid an endless tool loop.",activity});}
}
