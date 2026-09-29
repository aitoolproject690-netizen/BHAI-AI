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
 const timeout=(ms)=>AbortSignal.timeout(ms);
 const width=aspectRatio==="9:16"?768:aspectRatio==="1:1"?768:1024;
 const height=aspectRatio==="9:16"?1365:aspectRatio==="1:1"?768:576;
 const errors=[];
 const maxBytes=12*1024*1024;
 const findImageUrl=(value,depth=0)=>{
  if(depth>7||value==null)return null;
  if(typeof value==="string"&&/^https?:\/\//i.test(value))return value;
  if(typeof value!=="object")return null;
  for(const key of ["url","image_url","imageUrl","output_url","outputUrl","download_url","downloadUrl","path"]){
   const hit=findImageUrl(value[key],depth+1); if(hit&&/^https?:\/\//i.test(hit))return hit;
  }
  for(const v of Object.values(value)){const hit=findImageUrl(v,depth+1);if(hit&&/^https?:\/\//i.test(hit))return hit;}
  return null;
 };
 const hfSpace=process.env.HF_IMAGE_SPACE||"black-forest-labs/FLUX.1-schnell";
 try{
  const {Client}=await import("@gradio/client");
  const app=await Client.connect(hfSpace);
  const result=await app.predict("/infer",{
   prompt,
   seed:0,
   randomize_seed:true,
   width,
   height,
   num_inference_steps:4
  });
  const url=findImageUrl(result?.data);
  if(!url) throw new Error("Hugging Face Space returned no image URL.");
  const img=await fetch(url,{signal:timeout(30000)});
  if(!img.ok) throw new Error("Hugging Face Space image download returned HTTP "+img.status);
  const b=Buffer.from(await img.arrayBuffer());
  if(!b.length) throw new Error("Hugging Face Space returned an empty image.");
  if(b.length>maxBytes) throw new Error("Hugging Face Space returned an image larger than 12 MB.");
  return {mimeType:img.headers.get("content-type")||"image/png",data:b.toString("base64"),provider:"huggingface-space"};
 }catch(e){errors.push("Hugging Face Space: "+String(e?.message||e).slice(0,500));}
 const pixazoKey=process.env.PIXAZO_API_KEY;
 if(pixazoKey){
  try{
   const r=await fetch("https://gateway.pixazo.ai/flux/text-to-image",{
    method:"POST",
    headers:{"Content-Type":"application/json","Ocp-Apim-Subscription-Key":pixazoKey},
    body:JSON.stringify({prompt,width,height}),
    signal:timeout(60000)
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok) throw new Error(d?.message||d?.error||"Pixazo returned HTTP "+r.status);
   const url=findImageUrl(d);
   if(!url) throw new Error("Pixazo returned no image URL.");
   const img=await fetch(url,{signal:timeout(30000)});
   if(!img.ok) throw new Error("Pixazo image download returned HTTP "+img.status);
   const b=Buffer.from(await img.arrayBuffer());
   if(!b.length) throw new Error("Pixazo returned an empty image.");
   if(b.length>maxBytes) throw new Error("Pixazo returned an image larger than 12 MB.");
   return {mimeType:img.headers.get("content-type")||"image/png",data:b.toString("base64"),provider:"pixazo"};
  }catch(e){errors.push("Pixazo: "+String(e?.message||e).slice(0,500));}
 }
 const pollinationsKey=process.env.POLLINATIONS_API_KEY;
 try{
  const base=pollinationsKey
   ?"https://gen.pollinations.ai/image/"+encodeURIComponent(prompt)
   :"https://image.pollinations.ai/prompt/"+encodeURIComponent(prompt);
  const qs=new URLSearchParams({model:"flux",width:String(width),height:String(height),nologo:"true"});
  const r=await fetch(base+"?"+qs.toString(),{
   headers:pollinationsKey?{Authorization:"Bearer "+pollinationsKey}:{"User-Agent":"BHAI-X/1.0"},
   signal:timeout(45000)
  });
  if(!r.ok) throw new Error("Pollinations returned HTTP "+r.status);
  const b=Buffer.from(await r.arrayBuffer());
  if(!b.length) throw new Error("Pollinations returned an empty image.");
  if(b.length>maxBytes) throw new Error("Pollinations returned an image larger than 12 MB.");
  return {mimeType:r.headers.get("content-type")||"image/jpeg",data:b.toString("base64"),provider:"pollinations"};
 }catch(e){errors.push("Pollinations: "+String(e?.message||e).slice(0,500));}
 const hf=process.env.HF_TOKEN;
 const hfModel=process.env.HF_IMAGE_MODEL||"black-forest-labs/FLUX.1-dev";
 if(hf){
  try{
   const {InferenceClient}=await import("@huggingface/inference");
   const client=new InferenceClient(hf);
   const image=await client.textToImage({model:hfModel,provider:"auto",inputs:prompt,width,height},{outputType:"blob",signal:timeout(30000)});
   if(!image||typeof image.arrayBuffer!=="function") throw new Error("Hugging Face Inference returned an invalid image response.");
   const b=Buffer.from(await image.arrayBuffer());
   if(!b.length) throw new Error("Hugging Face Inference returned an empty image.");
   if(b.length>maxBytes) throw new Error("Hugging Face Inference returned an image larger than 12 MB.");
   return {mimeType:"image/png",data:b.toString("base64"),provider:"huggingface"};
  }catch(e){errors.push("Hugging Face Inference: "+String(e?.message||e).slice(0,500));}
 }
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(key){
  const model=process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image";
  try{
   const r=await fetch("https://generativelanguage.googleapis.com/v1/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:["IMAGE"],imageConfig:{aspectRatio}}}),
    signal:timeout(60000)
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok) throw new Error(d?.error?.message||"Gemini image generation failed");
   const p=(d?.candidates?.[0]?.content?.parts||[]).find(x=>x.inlineData?.data);
   if(!p?.inlineData?.data) throw new Error("Gemini image model returned no image.");
   return {mimeType:p.inlineData.mimeType||"image/png",data:p.inlineData.data,provider:"gemini"};
  }catch(e){errors.push("Gemini: "+String(e?.message||e).slice(0,500));}
 }
 throw new Error("Image generation failed: no available provider could render the image. "+errors.join(" | "));
}

async function ensureUsageTable(db){
 await db.query("CREATE TABLE IF NOT EXISTS bhai_media_usage (account_id TEXT NOT NULL, usage_date DATE NOT NULL, images INTEGER NOT NULL DEFAULT 0, videos INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account_id,usage_date))");
}
async function reserveMedia(db,accountId,type,limit){
 await ensureUsageTable(db);
 const col=type==="video"?"videos":"images";
 await db.query("INSERT INTO bhai_media_usage(account_id,usage_date) VALUES($1,(NOW() AT TIME ZONE 'Asia/Kolkata')::date) ON CONFLICT(account_id,usage_date) DO NOTHING",[accountId]);
 const q=await db.query("UPDATE bhai_media_usage SET "+col+"="+col+"+1 WHERE account_id=$1 AND usage_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date AND "+col+"<$2 RETURNING "+col,[accountId,limit]);
 if(!q.rows[0]) throw new Error(type==="video"?"Daily video limit reached (3/3). Try again after 12:00 AM IST.":"Daily image limit reached (10/10). Try again after 12:00 AM IST.");
 return q.rows[0][col];
}
async function releaseMedia(db,accountId,type){
 const col=type==="video"?"videos":"images";
 await ensureUsageTable(db);
 await db.query("UPDATE bhai_media_usage SET "+col+"=GREATEST("+col+"-1,0) WHERE account_id=$1 AND usage_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date",[accountId]);
}
async function getMediaUsage(db,accountId){
 await ensureUsageTable(db);
 const q=await db.query("SELECT images,videos FROM bhai_media_usage WHERE account_id=$1 AND usage_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date",[accountId]);
 const x=q.rows[0]||{images:0,videos:0};
 return {images:Number(x.images||0),videos:Number(x.videos||0),imageLimit:10,videoLimit:3};
}

async function generateVideo(prompt,duration=5,aspectRatio="16:9"){
 const timeout=(ms)=>AbortSignal.timeout(ms);
 const key=process.env.POLLINATIONS_API_KEY;
 if(!key) throw new Error("POLLINATIONS_API_KEY is not configured.");
 const seconds=Math.min(5,Math.max(1,Number(duration)||5));
 const model=process.env.POLLINATIONS_VIDEO_MODEL||"veo";
 const qs=new URLSearchParams({model,duration:String(seconds)});
 if(aspectRatio==="9:16")qs.set("aspectRatio","9:16");
 else if(aspectRatio==="1:1")qs.set("aspectRatio","1:1");
 const url="https://gen.pollinations.ai/video/"+encodeURIComponent(String(prompt).trim())+"?"+qs.toString();
 const r=await fetch(url,{headers:{Authorization:"Bearer "+key},signal:timeout(300000)});
 if(!r.ok){
  const body=await r.text().catch(()=> "");
  throw new Error("Pollinations video returned HTTP "+r.status+(body?" — "+body.slice(0,300):""));
 }
 const b=Buffer.from(await r.arrayBuffer());
 if(!b.length)throw new Error("Pollinations returned an empty video.");
 if(b.length>20*1024*1024)throw new Error("Pollinations returned a video larger than 20 MB.");
 return {mimeType:r.headers.get("content-type")||"video/mp4",data:b.toString("base64"),duration:seconds,provider:"pollinations"};
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
 {name:"generate_video",description:"Generate an actual short video using Pollinations. Maximum duration is 5 seconds; use this when the user asks to create, generate, or make a video.",parameters:{type:"OBJECT",properties:{prompt:{type:"STRING",description:"Detailed video-generation prompt"},duration:{type:"NUMBER",description:"Video duration in seconds; maximum 5"},aspectRatio:{type:"STRING",description:"1:1, 16:9, or 9:16"}},required:["prompt"]}},
 {name:"generate_image",description:"Generate an actual image. Prefer Pixazo Flux Schnell when PIXAZO_API_KEY is configured, then Pollinations, Hugging Face, and Gemini as fallbacks. Pixazo free API requires a user-provided API key. Use this when the user asks to create, draw, generate, make, design, or visualize an image. Do not merely write an image prompt when this tool is available.",parameters:{type:"OBJECT",properties:{prompt:{type:"STRING",description:"Detailed image-generation prompt based on the user's request"},aspectRatio:{type:"STRING",description:"Output aspect ratio, usually 1:1, 16:9, or 9:16"}},required:["prompt"]}},
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
  body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,...(useTools?{tools:[{functionDeclarations:activeDefinitions}]}:{}),generationConfig:{temperature:0.2}}),
   signal:AbortSignal.timeout(45000)
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
Reply in Hinglish when the user does. Talk naturally like a helpful project partner and friend: explain what you are doing, why it matters, what is already complete, what is still pending, and what should be added or fixed next.

RESPONSE STYLE / MARKDOWN:
- Format responses naturally like a polished ChatGPT-style assistant.
- Use Markdown headings such as ## and ### when they improve readability.
- Use **bold** for important words, conclusions, warnings, button names, filenames, and key values; use *italics* sparingly for emphasis.
- Use concise bullet lists or numbered steps for multiple points.
- Use emojis naturally when they fit the tone or meaning (for example ✅, ❌, ⚠️, 💡, 🔥, 🚀, 😄); do not put emojis on every line or force them into serious medical/safety content.
- Use inline code for short code or technical names and Markdown fenced code blocks for complete code, with the appropriate language when clear.
- Keep spacing clean so headings, lists, warnings, and code are easy to read on a phone.
- Do not output raw Markdown markers mechanically when plain text is clearer; use formatting to improve readability, not decoration.
- For technical answers, prefer: ## Problem / ## Fix / ## Code / ## Verification when those sections are useful.
- For troubleshooting, clearly separate the exact problem, cause, steps, and result.
- For health topics, keep formatting calm and clear; use ⚠️ only for genuine cautions and do not make medical advice look playful.
- Do not change the substance of an answer merely to add formatting. Do not wait for the user to know the technical plan; proactively suggest sensible next steps based on the actual project context. You are a broad personal assistant, not only a coding bot: answer everyday questions about technology, troubleshooting, food, learning, devices, software, health information, medicines, doctors, reports, and other practical topics using the safest useful guidance available. For current facts, prices, availability, local services, recent medical guidance, or anything time-sensitive, use web research when available rather than pretending your stored knowledge is current.

HEALTH SAFETY:
- Give general medical information, not a diagnosis or a substitute for a clinician.
- Never invent a medicine dose, change a prescribed dose, or tell the user to stop/start a prescription medicine based only on chat.
- For a medicine, explain its likely purpose only when the name/strength is sufficiently clear; mention common precautions/side effects and when a pharmacist/doctor should confirm.
- For babies, pregnancy, severe symptoms, drug reactions, bleeding, breathing trouble, seizures, unconsciousness, severe dehydration, chest pain, or other urgent red flags, prioritize prompt professional/emergency care.
- If the user provides a report/photo, distinguish what is visible from what cannot be concluded.
- Never speculate about a person's health, mental state, intelligence, competence, or fitness.

EMOTIONAL SUPPORT:
- If someone is sad, overwhelmed, lonely, grieving, or simply wants to talk, respond warmly and naturally, listen first, validate the feeling without exaggerating it, and offer practical next steps when useful.
- Do not shame, mock, or dismiss the person. If there is an indication of imminent self-harm or danger, encourage immediate local emergency help and a trusted person nearby.

TROUBLESHOOTING:
- For "something broke", first identify the exact symptom/error, then give the shortest safe diagnostic path and step-by-step fix. Prefer phone-friendly instructions when the user is on mobile.
- Never claim a repair, test, diagnosis, commit, deployment, or other real-world action happened unless a tool result confirms it.

Never invent completed work, progress percentages, files, commits, tests, or deployments. If exact progress is not measurable, describe it as a checklist (completed / remaining / next). At the end of a meaningful project task, include a short '📊 Project status' section with: Completed, Remaining, Next recommended step. DO IT mode is ${doIt?"ON":"OFF"}.

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
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models",{headers:{"x-goog-api-key":key},signal:AbortSignal.timeout(20000)});
 const d=await r.json();
 if(!r.ok) throw new Error(d?.error?.message||"Unable to list Gemini models");
 return (d.models||[])
  .filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent"))
  .map(m=>String(m.name||"").replace(/^models\//,""))
  .filter(Boolean);
}
const preferred=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.5-flash-lite","gemini-3.1-pro-preview"];
let modelCache=globalThis.__bhaiGeminiModels||null;
const now=Date.now();
if(!modelCache||now-modelCache.at>300000){
  modelCache={at:now,models:null};
  globalThis.__bhaiGeminiModels=modelCache;
}
async function getModelsFast(){
  if(Array.isArray(modelCache.models)&&modelCache.models.length)return modelCache.models;
  const list=await getAvailableModels();
  list.sort((a,b)=>{const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi);});
  modelCache.models=list;
  return list;
}
const latestText=String(latestUserMessage||"").trim();
const quickChat=/^(hi|hello|hey|hii|helo|namaste|salam|good morning|good night|good evening|kaise ho|kaisa hai|kya haal|kya chal raha|kya chal rha|kya kar rahe ho|kya scene hai|kya hua|thanks|thank you|thik hai|theek hai|ok|okay|nice|wah|haha|😂|😄|bye|goodbye)(\\s+bhai)?[!?., ]*$/i.test(latestText);
const fastMode=/^(bhai\\s+)?(ye|yeh|yah|kuch|sab|mera|meri|mujhe|isko|is|app|code|project|login|payment|error|problem|issue|bug|website|apk|video|image|file|github|render|deploy|api|server|dawa|medicine|tablet|baby|report|phone|mobile|wifi|internet|password|account)\\b.{0,220}$/i.test(latestText)
 || /(nahi ho raha|nahi ho rha|nahin ho raha|nahin ho rha|nahi chal raha|nahi chal rha|kaam nahi kar|problem aa|problem a|error aa|error a|issue aa|issue a|bug aa|bug a|fix kar|fix kaise|kaise fix|kese fix|kya karu|kya kare|kya karna hai|kuch kar|help chahiye|samajh nahi|samajh nhi|bata bhai|batao bhai)/i.test(latestText);
const quickChatMode=quickChat||fastMode;
if(quickChat){
 const playful={
  hi:"Arre bhai, hello! 😄 Phir se hello! 😂 Lagta hai connection check chal raha hai. Main yahin hoon bhai—full ready! 🚀 Batao, aaj kya karna hai?",
  hello:"Arre bhai, hello! 😄 Phir se hello! 😂 Lagta hai connection check chal raha hai. Main yahin hoon bhai—full ready! 🚀 Batao, aaj kya karna hai?",
  hey:"Oho bhai! 😄 Hey received! Connection ekdum zinda hai 😂 Batao, kya kaam pakadna hai? 🚀",
  hii:"Hii bhai! 😄😂 Main ready hoon. Batao kya scene hai aaj? 🚀",
  namaste:"Namaste bhai! 🙏😄 Main ready hoon—bolo kya karna hai? 🚀",
  salam:"Salam bhai! 😄 Main yahin hoon. Batao kya scene hai? 🚀",
  thanks:"Arey bhai, koi baat nahi! 😄❤️ Batao ab agla kaam kya pakde?",
  "thank you":"Arey bhai, koi baat nahi! 😄❤️ Batao ab agla kaam kya pakde?",
  bye:"Theek hai bhai 😂 Milte hain! Jab bulaoge, BHAI X ready milega. 🚀",
  goodbye:"Theek hai bhai 😂 Milte hain! Jab bulaoge, BHAI X ready milega. 🚀"
 };
 const k=latestText.toLowerCase().replace(/\\s+bhai[!?., ]*$/i,"").trim();
 const casualReplies={
  "kya chal raha":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
  "kya chal rha":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
  "kya scene hai":"Sab mast bhai 😄 BHAI X ready hai. Batao aaj kya kaam pakadna hai? 🚀",
  "kya hua":"Kuch nahi bhai 😄 Main ekdum ready hoon. Batao kya hua?",
  "kaise ho":"Ekदम badhiya bhai 😎 Ready and online! Tum batao kya scene hai? 🚀",
  "kaisa hai":"Badhiya bhai 😎 BHAI X full ready hai. Batao kya karna hai? 🚀",
  "kya haal":"Mast bhai 😄 Tum batao, kya haal hai? Aaj kya kaam karein? 🚀"
 };
 const reply=playful[k]||casualReplies[k]||"Arre bhai! 😄 Main yahin hoon. Batao kya karna hai? 🚀";
 return json(res,200,{text:reply,activity,images:[],usage:await getMediaUsage(db,account.id)});
}
const models=quickChatMode
  ? [process.env.GEMINI_FAST_MODEL||preferred[0]]
  : await getModelsFast();
 const isTransientModelError=(e)=>/429|RESOURCE_EXHAUSTED|quota|rate.?limit|high demand|temporarily unavailable|try again later|overloaded/i.test(String(e?.message||e));
 const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
 const generateWithFallback=async(useTools=true)=>{let last;for(const m of models){for(let attempt=0;attempt<3;attempt++){try{return await geminiGenerate(key,m,system,contents,useTools,activeToolDefinitions)}catch(e){last=e;if(!isTransientModelError(e))throw e;if(attempt<4) await sleep(Math.min(5000,1200*Math.pow(2,attempt)));}}}throw last;};
 const seenCalls=new Map(),readPaths=new Set(),failedCalls=new Set(),generatedImages=[];
 let githubReadCount=0,totalToolCalls=0,consecutiveFailures=0;
 const knownPaths=new Set(["","/"]);
 let rootListed=false;
 const maxGithubReads=6,maxToolCalls=8,maxRounds=4;

 for(let round=0;round<maxRounds && totalToolCalls<maxToolCalls;round++){
  let d; try{d=await generateWithFallback(!quickChatMode)}catch(e){
   if(quickChatMode){
    try{modelCache.models=null; const fallbackModels=await getModelsFast(); const oldModels=models.splice(0,models.length,...fallbackModels); d=await generateWithFallback(false);}
    catch(e2){return json(res,502,{error:e2.message||e.message,activity})}
   }else return json(res,502,{error:e.message,activity});
  }
  const candidate=d.candidates?.[0],parts=candidate?.content?.parts||[];
  const calls=parts.filter(p=>p.functionCall).map(p=>p.functionCall);
  if(!calls.length){
   const text=parts.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
   return json(res,200,{text:text||"Media ready.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
  }
  contents.push(candidate.content);
  const allowedCalls=calls.slice(0,2),responseParts=[];
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
    let result;
    if(name==="web_search") result=await webSearch(a.query);
    else if(name==="generate_image"){
     await reserveMedia(db,account.id,"image",10);
     try{result=await generateImage(a.prompt,a.aspectRatio||"16:9");}
     catch(e){await releaseMedia(db,account.id,"image");throw e;}
    } else if(name==="generate_video"){
     await reserveMedia(db,account.id,"video",3);
     try{result=await generateVideo(a.prompt,Math.min(5,Number(a.duration)||5),a.aspectRatio||"16:9");}
     catch(e){await releaseMedia(db,account.id,"video");throw e;}
    } else result=await github(name,{...a,path:normalizedPath});
    if(name==="generate_image") generatedImages.push({mimeType:result.mimeType,data:result.data});
    if(name==="generate_video") generatedImages.push({mimeType:result.mimeType,data:result.data,video:true,duration:result.duration});
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
  if(calls.length>allowedCalls.length) responseParts.push({functionResponse:{name:"tool_budget_guard",response:{error:"At most 2 tool calls are allowed per model round. Continue from returned results instead of issuing parallel calls."}}});
  contents.push({role:"user",parts:responseParts});
  contents=compactContents(contents);
  if(consecutiveFailures>=2) break;
 }

 const finalSystem=system+" You have reached the safe execution budget. Do not call any more tools. Use the information already gathered and give the best possible final response. If the requested code change was not completed, clearly state what remains.";
 try{
  const fd=await (async()=>{let last;for(const m of models){for(let attempt=0;attempt<4;attempt++){try{return await geminiGenerate(key,m,finalSystem,compactContents(contents),false,activeToolDefinitions)}catch(e){last=e;if(!isTransientModelError(e))throw e;if(attempt<3) await sleep(Math.min(6000,1500*Math.pow(2,attempt)));}}}throw last;})();
  const fp=fd.candidates?.[0]?.content?.parts||[],ft=fp.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
  return json(res,200,{text:ft||"Task completed.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
 }catch(e){return json(res,500,{error:"Safe execution limit reached. The agent stopped to avoid an endless tool loop.",activity});}
}
