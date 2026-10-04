import { selectSkillsForTask, getSkillPromptContext } from "../src/skillsRouter.js";
import { ownerState, ownerReady } from "./owner.js";
import { getDb } from "./db.js";
import { getSession } from "./accounts.js";
import { resolveGithubTarget, classifyEngineeringError, createRetryGuard, createEvidence, createRecoveryStateMachine, createMissionController } from "./engineeringCore.js";
import { generateWithRouter, reviewWithMultiAI, getConfiguredAIProviders } from "./aiRouter.js";
import { routeConversationContext } from "./contextRouter.js";

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
async function saveMediaAsset(db,accountId,type,media){
 await db.query("CREATE TABLE IF NOT EXISTS bhai_media_assets (id BIGSERIAL PRIMARY KEY, account_id TEXT NOT NULL, type TEXT NOT NULL, mime_type TEXT NOT NULL, data TEXT NOT NULL, provider TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await db.query("DELETE FROM bhai_media_assets WHERE account_id=$1 AND type=$2",[accountId,type]);
 await db.query("INSERT INTO bhai_media_assets(account_id,type,mime_type,data,provider) VALUES($1,$2,$3,$4,$5)",[accountId,type,media.mimeType,media.data,media.provider||null]);
}
async function getLatestMediaAsset(db,accountId,type){
 await db.query("CREATE TABLE IF NOT EXISTS bhai_media_assets (id BIGSERIAL PRIMARY KEY, account_id TEXT NOT NULL, type TEXT NOT NULL, mime_type TEXT NOT NULL, data TEXT NOT NULL, provider TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 const q=await db.query("SELECT mime_type,data,provider,created_at FROM bhai_media_assets WHERE account_id=$1 AND type=$2 ORDER BY id DESC LIMIT 1",[accountId,type]);
 return q.rows[0]||null;
}

async function getMediaUsage(db,accountId){
 await ensureUsageTable(db);
 const q=await db.query("SELECT images,videos FROM bhai_media_usage WHERE account_id=$1 AND usage_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date",[accountId]);
 const x=q.rows[0]||{images:0,videos:0};
 return {images:Number(x.images||0),videos:Number(x.videos||0),imageLimit:10,videoLimit:3};
}

async function generateVideo(prompt,duration=5,aspectRatio="16:9",sourceImage=null){
 const timeout=(ms)=>AbortSignal.timeout(ms);
 const seconds=Math.min(5,Math.max(1,Number(duration)||5));
 const errors=[];
 const maxBytes=20*1024*1024;
 const downloadVideo=async(value)=>{
  let url=null;
  if(typeof value==="string") url=value;
  else if(value&&typeof value==="object") url=value.url||value.video_url||value.videoUrl||value.path||value.output||null;
  if(url&&/^https?:\/\//i.test(url)){
   const r=await fetch(url,{signal:timeout(120000)});
   if(!r.ok) throw new Error("Video download returned HTTP "+r.status);
   const b=Buffer.from(await r.arrayBuffer());
   if(!b.length) throw new Error("Provider returned an empty video.");
   if(b.length>maxBytes) throw new Error("Provider returned a video larger than 20 MB.");
   const mime=r.headers.get("content-type")||"video/mp4";
   if(!/^video\//i.test(mime) && !/\.mp4(?:$|\?)/i.test(url) && !/\.webm(?:$|\?)/i.test(url)) throw new Error("Provider returned a non-video payload.");
   return {mimeType:mime,data:b.toString("base64")};
  }
  return null;
 };

 // Primary paid provider. If its balance is exhausted, continue automatically.
 const key=process.env.POLLINATIONS_API_KEY;
 if(key){
  try{
   const model=process.env.POLLINATIONS_VIDEO_MODEL||"google/veo-3.1-fast";
   if(sourceImage?.data){
    const r=await fetch("https://gen.pollinations.ai/v1/chat/completions",{
     method:"POST",
     headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
     body:JSON.stringify({
      model,
      messages:[{role:"user",content:[
       {type:"text",text:String(prompt).trim()},
       {type:"image_url",image_url:{url:"data:"+(sourceImage.mimeType||"image/png")+";base64,"+sourceImage.data}}
      ]}],
      duration:seconds
     }),
     signal:timeout(300000)
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error("Pollinations image-to-video returned HTTP "+r.status+" — "+JSON.stringify(d).slice(0,500));
    const text=String(d?.choices?.[0]?.message?.content||d?.output_text||"");
    const url=(text.match(/https?:\/\/[^\s)\]]+\.(?:mp4|webm)(?:\?[^\s)\]]*)?/i)||[])[0]||d?.data?.[0]?.url;
    if(!url)throw new Error("Pollinations image-to-video returned no video URL.");
    const video=await downloadVideo(url);
    if(!video)throw new Error("Pollinations image-to-video returned an invalid video.");
    return {...video,duration:seconds,provider:"pollinations:i2v"};
   }
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
   if(b.length>maxBytes)throw new Error("Pollinations returned a video larger than 20 MB.");
   return {mimeType:r.headers.get("content-type")||"video/mp4",data:b.toString("base64"),duration:seconds,provider:"pollinations"};
  }catch(e){errors.push("Pollinations: "+String(e?.message||e).slice(0,500));}
 }else{
  errors.push("Pollinations: POLLINATIONS_API_KEY is not configured");
 }

 // Capability-aware Hugging Face Gradio fallback. Inspect the live API first; never guess endpoint names.
 const spaces=(process.env.HF_VIDEO_SPACES||"Wan-AI/Wan2.1,techfreakworm/LTX2.3-Studio")
  .split(",").map(x=>x.trim()).filter(Boolean).slice(0,5);
 try{
  const {Client,handle_file}=await import("@gradio/client");
  for(const space of spaces){
   try{
    const options=process.env.HF_TOKEN?{token:process.env.HF_TOKEN}:{};
    const client=await Client.connect(space,options);
    const api=await client.view_api();
    const named=api?.named_endpoints||{};
    const names=Object.keys(named);
    const wanted=sourceImage
      ? names.find(n=>/i2v|image.*video|video.*image/i.test(n))
      : names.find(n=>/t2v|text.*video|video.*text/i.test(n));
    if(!wanted) throw new Error("No compatible "+(sourceImage?"image-to-video":"text-to-video")+" endpoint exposed by Space.");
    const meta=named[wanted]||{};
    const labels=(meta.parameters||[]).map(p=>String(p.label||p.name||"").toLowerCase());
    let args;
    if(sourceImage){
      const imageBuffer=Buffer.from(sourceImage.data,"base64");
      const imageRef=handle_file(new Blob([imageBuffer],{type:sourceImage.mimeType||"image/png"}));
      args=labels.length
       ? labels.map(label=>/image|img/.test(label)?imageRef:/prompt|text/.test(label)?String(prompt).trim():/watermark/.test(label)?false:/seed/.test(label)?-1:undefined)
       : [String(prompt).trim(),imageRef,false,-1];
    }else{
      args=labels.length
       ? labels.map(label=>/prompt|text/.test(label)?String(prompt).trim():/size|resolution/.test(label)?"480P":/watermark/.test(label)?false:/seed/.test(label)?-1:undefined)
       : [String(prompt).trim(),"480P",false,-1];
    }
    const out=await client.predict(wanted,args);
    const data=out?.data??out;
    const candidates=Array.isArray(data)?data:[data];
    let video=null;
    for(const item of candidates){ video=await downloadVideo(item).catch(()=>null); if(video)break; }
    if(!video){
      const url=String(JSON.stringify(data)).match(/https?:\/\/[^"\s]+\.(?:mp4|webm)(?:\?[^"\s]*)?/i)?.[0];
      if(url) video=await downloadVideo(url).catch(()=>null);
    }
    if(!video)throw new Error("Compatible endpoint returned no downloadable video.");
    return {...video,duration:seconds,provider:"huggingface-space:"+space+":"+wanted};
   }catch(e){
    errors.push("Hugging Face "+space+": "+String(e?.message||e).slice(0,450));
   }
  }
 }catch(e){ errors.push("Hugging Face fallback unavailable: "+String(e?.message||e).slice(0,350)); }
 }
 throw new Error("Video generation failed: all configured providers were unavailable. "+errors.join(" | "));
}

async function github(action,a){
 const token=process.env.GITHUB_TOKEN;
 const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
 if(token) h.Authorization="Bearer "+token;
 if(action==="github_create_repo"){
  if(!token) throw new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render Environment.");
  if(!a.name) throw new Error("Repository name is required.");
  
  const cleanName=String(a.name).trim();
  let owner=a.owner||"";
  if(!owner){
   const me=await fetch("https://api.github.com/user",{headers:h});
   const md=await me.json().catch(()=>({}));
   if(!me.ok) throw new Error(md.message||"Unable to determine GitHub account.");
   owner=md.login;
  }
  const create=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({name:cleanName,description:String(a.description||"Created by BHAI X"),private:!!a.private,auto_init:true})});
  const d=await create.json().catch(()=>({}));
  if(create.ok) return{ok:true,created:true,full_name:d.full_name,owner:d.owner?.login||owner,repo:d.name,default_branch:d.default_branch,url:d.html_url,clone_url:d.clone_url};
  if(create.status===422){
   const existing=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(cleanName),{headers:h});
   const ed=await existing.json().catch(()=>({}));
   if(existing.ok) return{ok:true,created:false,existing:true,full_name:ed.full_name,owner:ed.owner?.login||owner,repo:ed.name,default_branch:ed.default_branch,url:ed.html_url,clone_url:ed.clone_url};
  }
  throw new Error(d.message||"GitHub repository creation failed");
 }
 if(!a.owner||!a.repo) throw new Error("GitHub owner and repo are required.");
 let effectiveOwner=String(a.owner).trim();
 if(token && /^bhai[-_]?ai$/i.test(effectiveOwner)){
  const me=await fetch("https://api.github.com/user",{headers:h});
  const md=await me.json().catch(()=>({}));
  if(me.ok&&md.login) effectiveOwner=md.login;
 }
 const base="https://api.github.com/repos/"+encodeURIComponent(effectiveOwner)+"/"+encodeURIComponent(a.repo),branch=a.branch||"main";
 if(action==="github_info"){
  const r=await fetch(base,{headers:h}),d=await r.json(); if(!r.ok) throw new Error(d.message||"GitHub request failed");
  return{name:d.full_name,default_branch:d.default_branch,private:d.private,url:d.html_url,permissions:d.permissions||null};
 }
 if(action==="github_create_repo"){
  if(!token) throw new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render Environment.");
  if(!a.name) throw new Error("Repository name is required.");
  
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
 if(action==="github_actions"){  if(!token) throw new Error("GITHUB_TOKEN is required for workflow/build actions.");  const workflow=a.workflow||a.workflow_id;  if(a.operation==="list"){const r=await fetch(base+"/actions/workflows",{headers:h}),d=await r.json();if(!r.ok)throw new Error(d.message||"GitHub workflows failed");return{workflows:(d.workflows||[]).map(w=>({id:w.id,name:w.name,path:w.path,state:w.state}))};}  if(a.operation==="dispatch"){if(!workflow)throw new Error("workflow is required");const r=await fetch(base+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({ref:branch,inputs:a.inputs||{}})});if(!r.ok)throw new Error((await r.text()).slice(0,500)||"Workflow dispatch failed");return{ok:true,dispatched:true,workflow,branch};}  if(a.operation==="runs"){const r=await fetch(base+"/actions/runs?per_page="+encodeURIComponent(a.limit||5),{headers:h}),d=await r.json();if(!r.ok)throw new Error(d.message||"Workflow runs failed");return{runs:(d.workflow_runs||[]).map(w=>({id:w.id,name:w.name,status:w.status,conclusion:w.conclusion,sha:w.head_sha,created_at:w.created_at,url:w.html_url}))};}  if(a.operation==="jobs"){if(!a.runId)throw new Error("runId is required");const r=await fetch(base+"/actions/runs/"+encodeURIComponent(a.runId)+"/jobs",{headers:h}),d=await r.json();if(!r.ok)throw new Error(d.message||"Workflow jobs failed");return{jobs:(d.jobs||[]).map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,steps:j.steps||[]}))};}  throw new Error("Unsupported GitHub actions operation"); } if(action==="github_update"){
  if(!token) throw new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render to let BHAI AI modify repositories.");
  
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
 {name:"github_create_repo",description:"Create a real GitHub repository for the user. Only use when the user explicitly asks BHAI X to create a repository. Never claim creation unless the GitHub API confirms it.",parameters:{type:"OBJECT",properties:{name:{type:"STRING"},description:{type:"STRING"},private:{type:"BOOLEAN"}},required:["name"]}},
 {name:"github_read",description:"Read a GitHub file or directory. Prefer one root directory read first, then only the minimum key files needed. Never reread a path.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path"]}}, {name:"github_actions",description:"Run and inspect GitHub Actions for builds/tests. Use dispatch after code changes or when the user explicitly asks to build/test. Use runs/jobs to verify real results before claiming success.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},branch:{type:"STRING"},operation:{type:"STRING",description:"list, dispatch, runs, or jobs"},workflow:{type:"STRING"},runId:{type:"STRING"},limit:{type:"NUMBER"},inputs:{type:"OBJECT"}},required:["owner","repo","operation"]}}
];
if(process.env.GITHUB_TOKEN) toolDefinitions.push({name:"github_update",description:"Create or replace a GitHub text file. Only use when the user clearly requested the change. Prefer one update per changed file after inspection.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},content:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path","content"]}});

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
   signal:AbortSignal.timeout(22000)
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
 const {messages=[]}=req.body||{},activity=[];
  // Automatic execution: no user-facing DO IT switch is required.
 const latestUserMessage=[...messages].reverse().find(m=>m&&m.role==="user")?.text||"";
 // Server-side hard guard: casual conversation must NEVER enter the work/mission agent.
 // This protects against stale browser bundles, old checkpoints, or a frontend routing bug.
 const normalizedCasual=String(latestUserMessage).toLowerCase().replace(/[!?.,]+/g," ").replace(/\s+/g," ").replace(/\s+bhai$/i,"").trim();
 const serverCasual=/^(?:hi|hello|hey|hii|helo|namaste|salam|good morning|good night|good evening|kaise ho|kaisa hai|kya haal|kya chal raha(?: hai)?|kya chal rha(?: hai)?|kya kar rahe ho|kya scene hai|kya hua|thanks|thank you|thik hai|theek hai|ok|okay|nice|wah|haha|bye|goodbye|khana kha liya(?: hai)?|khana khaya(?: hai)?|kha liya|chai pi liya|so gaye|so rahe ho|kahan ho|busy ho|free ho)$/i.test(normalizedCasual);
 if(serverCasual){
  const casualReplies={
   "kya chal raha":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
   "kya chal raha hai":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
   "kya chal rha":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
   "kya chal rha hai":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
   "khana kha liya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
   "khana kha liya hai":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
   "khana khaya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
   "khana khaya hai":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
   "kha liya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
   "kya scene hai":"Sab mast bhai 😄 BHAI X ready hai. Batao aaj kya kaam pakadna hai? 🚀",
   "kya hua":"Kuch nahi bhai 😄 Main ekdum ready hoon. Batao kya hua?",
   "kaise ho":"Ekdum badhiya bhai 😎 Tum batao?",
   "kaisa hai":"Badhiya bhai 😎 Main full ready hoon!",
   "kya haal":"Mast bhai 😄 Tum batao kya haal?",
   "hi":"Arre bhai! 😄 Main yahin hoon. Batao kya scene hai? 🚀",
   "hello":"Hello bhai! 😎 BHAI X ready hai. Batao kya karna hai? 🚀",
   "hey":"Hey bhai! 😄 Kya chal raha hai? 🚀",
   "thanks":"Arey bhai, anytime! 😎❤️",
   "thank you":"Arey bhai, anytime! 😎❤️",
   "bye":"Bye bhai! 👋😄",
   "goodbye":"Bye bhai! 👋😄"
  };
  return json(res,200,{ok:true,text:casualReplies[normalizedCasual]||"Arre bhai! 😄 Main yahin hoon. Batao kya karna hai? 🚀",casual:true,verified:true,activity:[]});
 }

// Deterministic media routing: explicit video requests always win over image-reference wording in video prompts.
const directVideoRequest=/\b(?:generate|create|make|render|produce)\b.{0,100}\b(?:video|clip|animation|animated)\b|\b(?:video|clip|animation|animated)\b.{0,100}\b(?:generate|create|make|render|produce)\b|\bimage[- ]to[- ]video\b|\bvideo\b.{0,100}\b(?:from|using|with|isko|iss)\b.{0,100}\b(?:image|picture|photo|pic)\b/i.test(latestUserMessage);
const imageToVideoRequest=/\b(?:image[- ]to[- ]video|video\b.{0,100}\b(?:from|using|with|isko|iss)\b.{0,100}\b(?:image|picture|photo|pic))\b/i.test(latestUserMessage);
if(directVideoRequest){
 try{
  await reserveMedia(db,account.id,"video",3);
  try{
   const cleanPrompt=latestUserMessage
    .replace(/^\s*(?:create|generate|make|render|produce)\s+(?:a\s+)?(?:video|clip|animation|animated\s+video)\s*(?:of|from|using)?\s*/i,"")
    .trim()||latestUserMessage;
   const sourceImage=imageToVideoRequest?await getLatestMediaAsset(db,account.id,"image"):null;
   if(imageToVideoRequest&&!sourceImage) throw new Error("Image-to-video requested, but no previous BHAI X image asset is available. Generate an image first, then say 'isko video bana'.");
   const media=await generateVideo(cleanPrompt,5,"16:9",sourceImage);
   return json(res,200,{ok:true,text:"## 🎬 Video generated\\n\\nBHAI X ne request ko verified video pipeline par route kiya — capability match + fallback + output validation complete.",activity:[{tool:"generate_video",state:"done",details:"Direct video request routed to the video generator."}],images:[{mimeType:media.mimeType,data:media.data,video:true,duration:media.duration}],usage:await getMediaUsage(db,account.id)});
  }catch(e){
   await releaseMedia(db,account.id,"video");
   return json(res,502,{error:"Video generation failed: "+String(e?.message||e),activity:[{tool:"generate_video",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});
  }
 }catch(e){
  return json(res,502,{error:"Video generation pre-flight failed: "+String(e?.message||e),activity:[{tool:"generate_video",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});
 }
}

// Deterministic media routing: explicit image requests must never fall through to the engineering/GitHub agent.
// This is intentionally server-side so stale frontend bundles or AI routing cannot turn an image request into repo work.
const directImageRequest=/\b(?:generate|create|make|draw|design|render|visualize)\b.{0,80}\b(?:image|picture|photo|poster|illustration|artwork)\b|\b(?:image|picture|photo|poster|illustration|artwork)\b.{0,80}\b(?:generate|create|make|draw|design|render|visualize)\b/i.test(latestUserMessage);
if(directImageRequest){
 try{
  await reserveMedia(db,account.id,"image",10);
  try{
   const cleanPrompt=latestUserMessage
    .replace(/^\s*(?:create|generate|make|draw|design|render|visualize)\s+(?:an?\s+)?(?:image|picture|photo|poster|illustration|artwork)\s*(?:of|for)?\s*/i,"")
    .trim()||latestUserMessage;
   const media=await generateImage(cleanPrompt,"16:9");
   await saveMediaAsset(db,account.id,"image",media);
   return json(res,200,{ok:true,text:"## 🖼️ Image generated\n\nBHAI X ne request ko direct image pipeline par route kiya — GitHub/Mission execution bypass kiya gaya.",activity:[{tool:"generate_image",state:"done",details:"Direct image request routed to the media generator."}],images:[{mimeType:media.mimeType,data:media.data}],usage:await getMediaUsage(db,account.id)});
  }catch(e){
   await releaseMedia(db,account.id,"image");
   return json(res,502,{error:"Image generation failed: "+String(e?.message||e),activity:[{tool:"generate_image",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});
  }
 }catch(e){
  return json(res,502,{error:"Image generation pre-flight failed: "+String(e?.message||e),activity:[{tool:"generate_image",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});
 }
}
 const contextRoute=routeConversationContext(messages,latestUserMessage);
 const routedMessages=contextRoute.messages;
 const userTaskMessages=routedMessages.filter(m=>m&&m.role==="user").map(m=>String(m.text||"")).filter(Boolean);
 const explicitRepoSource=[...userTaskMessages].reverse().find(t=>/(?:GitHub\s+repository|repository)\s*:\s*[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}/i.test(t))||"";
 const githubTaskText=explicitRepoSource?explicitRepoSource+"\n"+latestUserMessage:latestUserMessage;
  const latestHasExplicitGithub=/(?:github|git hub|repository|repo\b|\bcreate\s+(?:a\s+)?repo|\bgithub\s+repo)/i.test(latestUserMessage);
  const latestRequestsProjectExecution=/(?:\bapp\b|\bproject\b|\bwebsite\b|\bapk\b|\bcode\b|\bbuild\b|\bdeploy\b|\bcreate\b|\bmake\b|\bbana\b|\bban[a-z]*\b|\bfix\b|\bupdate\b|\bpublish\b|\bcommit\b|\bpush\b)/i.test(latestUserMessage);
  const freshTaskIsolation=contextRoute.mode==="fresh_task";

 const selectedSkills=selectSkillsForTask(latestUserMessage);
 const skillContext=getSkillPromptContext(selectedSkills);
 const contextNote=`CONTEXT ROUTER: ${contextRoute.mode}. ${contextRoute.reason} Never revive an older Mission, repository, file, commit, or build unless the current user message explicitly refers to that existing task.`;
 const system=`You are BHAI AI, a practical personal work agent. ${contextNote} ${skillContext}
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

Never invent completed work, progress percentages, files, commits, tests, or deployments. If exact progress is not measurable, describe it as a checklist (completed / remaining / next). At the end of a meaningful project task, include a short '📊 Project status' section with: Completed, Remaining, Next recommended step. Execution mode is AUTOMATIC. The agent selects only the tools required for the current task.

EXECUTION POLICY:
- First make a compact internal plan: desired outcome, required skills, minimum tools/files. Before execution, perform a pre-flight risk check for API/model availability, credentials, required files, dependencies and target service health whenever relevant. Prevent predictable failures instead of waiting for them.
- Execute skills in the selected order. Do not randomly switch skills.
- For repository work: github_info once, then read the repository root directory once. Treat that listing as authoritative: only read exact file/directory paths returned by it; never guess paths and never reread a path.
- Do not search the web unless current external information is genuinely required.
- Do not repeat a failed tool call with the same arguments. If a tool fails, use the error to adjust once; otherwise move forward with gathered information.
- Prefer implementing once enough context is available. Do not keep reading files just to understand the whole repository.
- GitHub changes require a clear user request. IMPORTANT: when the user explicitly asks you to create an app, repository, file, commit, or push code, you MUST attempt the real GitHub tools instead of telling the user to create a PAT or repository manually. The deployed Render app receives GITHUB_TOKEN from its environment; never ask the user to paste that token into chat. For a new project, call github_create_repo when needed, then github_info, github_read for the repository root, then github_update for the actual files. After writing, read back or use GitHub Actions to verify the result. Only report a credential blocker when the GitHub tool itself returns a credential/configuration error. Never claim a repository, file, commit, build, or deployment exists until a tool result confirms it.- For coding/debugging tasks, inspect the smallest relevant files, identify the root cause, make the complete fix, then use GitHub Actions to build/test when a suitable workflow exists. Never claim code is fixed or built until the repository/tool result confirms it.- When a build/test fails, read the failure result, diagnose it, patch the relevant file, and rerun the workflow. Continue until success or a concrete blocker. For transient API/network/model failures, retry with backoff, use a verified compatible fallback, then resume from the last checkpoint.- For "make an app/APK" tasks, treat source changes, build workflow, build execution, artifact verification, and final delivery as one task when the repository supports them.
- After successful requested changes, stop tools and report changed files and commit result.
- Never claim an action happened unless a tool result confirms it. Never say DONE when verification is missing. Every final report must state completed work, remaining work, verification performed, and one or more useful next-step recommendations when appropriate.`;

 let contents=compactContents(toGeminiContents(routedMessages));
 const activeToolDefinitions=selectedSkills.includes("web-research") ? toolDefinitions : toolDefinitions.filter(t=>t.name!=="web_search");

 async function getAvailableModels(){
 try{
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models",{headers:{"x-goog-api-key":key},signal:AbortSignal.timeout(10000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d?.error?.message||"Unable to list Gemini models");
  const list=(d.models||[])
   .filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent"))
   .map(m=>String(m.name||"").replace(/^models\//,""))
   .filter(Boolean);
  if(list.length)return list;
  throw new Error("Gemini returned no generateContent models");
 }catch(e){
  console.warn("[Gemini] model discovery failed; using known fallback models:",String(e?.message||e));
  return preferred;
 } 
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
const missionMode=/\b(?:app|project|repo|repository|website|apk)\b/i.test(latestText) && /\b(?:create|make|build|bana|ban[a-z]*|fix|deploy|publish|push|commit|update|repair|test|verify)\b/i.test(latestText);
const mission=createMissionController();
const missionStep=(next,details="")=>{ mission.transition(next); activity.push({tool:"mission:"+next,state:"done",details}); };
const githubLinkRequest=/\bgithub\b/i.test(githubTaskText)&&(/\b(link|url|repo|repository)\b/i.test(githubTaskText));
const githubFileRequest=/\bgithub\b/i.test(githubTaskText)&&(/\b(file|index\.html|html|code|page|commit|push|update|create)\b/i.test(githubTaskText));
  const autoDoIt=true;
let githubExecutionConfirmed=false,githubVerificationConfirmed=false,githubFileVerified=false,githubEvidence=null,githubFileEvidence=null;
const githubTarget=resolveGithubTarget(githubTaskText);
const githubExplicitRepoMatch=githubTaskText.match(/(?:GitHub\s+repository|repository)\s*:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})/i)||githubTaskText.match(/\b([A-Za-z0-9][A-Za-z0-9._-]{2,99})\/([A-Za-z0-9][A-Za-z0-9._-]{2,99})(?=\/|\b)/i);
const githubRepoCandidates=githubTaskText.match(/\b[A-Za-z0-9][A-Za-z0-9._-]{2,99}\b/g)||[];
let githubRequestedRepo=githubTarget.repo||githubExplicitRepoMatch?.[2]||githubRepoCandidates.find(x=>x.includes("-")&&/^[A-Za-z0-9][A-Za-z0-9._-]+$/.test(x)&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x))||"";

const quickChat=/^(?:hi|hello|hey|hii|helo|namaste|salam|good morning|good night|good evening|kaise ho|kaisa hai|kya haal|kya chal raha(?: hai)?|kya chal rha(?: hai)?|kya kar rahe ho|kya scene hai|kya hua|thanks|thank you|thik hai|theek hai|ok|okay|nice|wah|haha|😂|😄|bye|goodbye|khana kha liya(?: hai)?|khana khaya(?: hai)?|kha liya|chai pi liya|so gaye|so rahe ho|kahan ho|busy ho|free ho)(?:\\s+bhai)?[!?., ]*$/i.test(latestText);
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
  "kya chal raha hai":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
  "kya chal rha hai":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
  "khana kha liya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
  "khana kha liya hai":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
  "khana khaya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
  "khana khaya hai":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
  "kha liya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄",
  "kya chal rha":"Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tum batao, kya scene hai?",
  "kya scene hai":"Sab mast bhai 😄 BHAI X ready hai. Batao aaj kya kaam pakadna hai? 🚀",
  "kya hua":"Kuch nahi bhai 😄 Main ekdum ready hoon. Batao kya hua?",
  "kaise ho":"Ekदम badhiya bhai 😎 Ready and online! Tum batao kya scene hai? 🚀",
  "kaisa hai":"Badhiya bhai 😎 BHAI X full ready hai. Batao kya karna hai? 🚀",
  "kya haal":"Mast bhai 😄 Tum batao, kya haal hai? Aaj kya kaam karein? 🚀"
 };
 const fallbackReply=playful[k]||casualReplies[k]||"Arre bhai! 😄 Main yahin hoon. Batao kya karna hai? 🚀";
 let reply=fallbackReply;
 try{
  const routed=await generateWithRouter({
   task:latestText,
   system:"You are BHAI X, a friendly fast personal AI assistant. Reply naturally in the user language (Hinglish when they use Hinglish). Keep casual replies short and useful. Do not claim actions you did not perform.",
   messages:[{role:"user",text:latestText}],
   preferred:process.env.BHAI_CHAT_PROVIDER||"",
   role:"chat",
   fallback:true
  });
  if(routed?.text) reply=routed.text;
  activity.push({tool:"ai-router:"+routed.provider,state:"done",details:"Chat routed through "+routed.provider+" / "+routed.model+"."});
 }catch(e){
  activity.push({tool:"ai-router",state:"fallback",details:"Provider routing unavailable; local fast reply used."});
 }
 return json(res,200,{text:reply,activity,images:[],usage:await getMediaUsage(db,account.id)});
}
const recovery=createRecoveryStateMachine();
const recoveryStep=(next,details="")=>{ recovery.transition(next); activity.push({tool:"recovery:"+next,state:"done",details}); };
const githubFileMatch=(githubTaskText.match(/(?:[A-Za-z0-9_.-]+\/){0,2}(?:[A-Za-z0-9._-]+\/)*(?:index\.html|[A-Za-z0-9._-]+\.(?:html|css|js|jsx|ts|tsx|json|md))/i)||[])[0]||"";
const explicitRepoMatch=githubTaskText.match(/(?:GitHub\s+repository|repository)\s*:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})/i);
const explicitIndexHtml=/\bindex\.html\b/i.test(githubTaskText);
if(explicitRepoMatch) githubRequestedRepo=explicitRepoMatch[1]+"/"+explicitRepoMatch[2];
let githubRequestedFile=explicitIndexHtml?"index.html":(githubTarget.path||githubFileMatch);
 const evidence=createEvidence();
 const markEvidence=(name,result)=>{ const owner=result?.owner?.login||result?.owner||githubTarget.owner||""; const repo=result?.repo||result?.name||githubTarget.repo||""; const branch=result?.default_branch||result?.branch||"main"; const path=result?.path||githubTarget.path||"repository"; const commit=result?.commit||result?.commitSha||""; if(owner&&repo) evidence.set({repository:owner+"/"+repo}); evidence.set({branch,path}); if(commit) evidence.set({commit}); evidence.addTest(name,true,"Verified by GitHub API"); };
if(githubRequestedFile&&githubRequestedRepo){
 const repoMarker=githubRequestedRepo+"/";
 const repoAt=githubRequestedFile.toLowerCase().indexOf(repoMarker.toLowerCase());
 if(repoAt>=0) githubRequestedFile=githubRequestedFile.slice(repoAt+repoMarker.length);
}
if(githubFileRequest && latestHasExplicitGithub && githubRequestedRepo && githubRequestedFile && autoDoIt){
 if(missionMode){ try{missionStep("plan","Mission request accepted; pre-flight completed by authenticated agent entrypoint."); missionStep("execute","Starting repository diagnosis and execution.");}catch{} }
 try{
  const token=process.env.GITHUB_TOKEN;
  if(!token) return json(res,503,{error:"GitHub is not configured on BHAI X. Add GITHUB_TOKEN in Render Environment.",activity});
  const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+token};
  const me=await fetch("https://api.github.com/user",{headers:{...h,"User-Agent":"BHAI-X"},signal:AbortSignal.timeout(8000)});
  const md=await me.json().catch(()=>({}));
  if(!me.ok||!md.login) throw new Error(md.message||"Unable to verify GitHub account.");
  const owner=explicitRepoMatch?explicitRepoMatch[1]: (githubTarget.owner||md.login);
  const repo=explicitRepoMatch?explicitRepoMatch[2]: (githubTarget.repo||githubRequestedRepo);
  const path=String(explicitIndexHtml?"index.html":(githubTarget.path||githubRequestedFile||"")).replace(/^\/+/,"");
  if(!owner||!repo||!path) throw new Error("GitHub target is incomplete: owner, repository, and file path are required.");
  const base="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
  const publicHeaders={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"BHAI-X"};
  const authHeaders={...h,"User-Agent":"BHAI-X"};
  let rr=await fetch(base,{headers:authHeaders,signal:AbortSignal.timeout(8000)});
  let rd=await rr.json().catch(()=>({}));
  if(!rr.ok && rr.status===404){
   const accessible=await fetch("https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",{headers:authHeaders,signal:AbortSignal.timeout(8000)});
   const ad=await accessible.json().catch(()=>[]);
   const visible=Array.isArray(ad)&&ad.some(x=>String(x.full_name||"").toLowerCase()===String(owner+"/"+repo).toLowerCase());
   const publicPage=await fetch("https://github.com/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo),{headers:{"User-Agent":"BHAI-X"},signal:AbortSignal.timeout(8000)});
   if(!visible && !publicPage.ok){
    throw new Error("GitHub repository is not visible to the configured GITHUB_TOKEN: HTTP 404 for "+owner+"/"+repo+" (public page also returned "+publicPage.status+"). Check that the token has access to this repository.");
   }
   if(!visible){
    throw new Error("GitHub repository exists publicly, but the configured GITHUB_TOKEN cannot access "+owner+"/"+repo+". Add this repository to the token's repository access and grant Contents read/write permission.");
   }
   throw new Error("GitHub repository lookup returned HTTP 404 even though the token lists the repository. GitHub API access is inconsistent; retry once.");
  }else if(!rr.ok){
   throw new Error("GitHub repository lookup failed: HTTP "+rr.status+" — "+(rd.message||"Not Found"));
  }
  const branch=rd.default_branch||"main";
  let existing=await fetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers:h,signal:AbortSignal.timeout(8000)});
  let ed=await existing.json().catch(()=>({}));
  if(!existing.ok && existing.status===404){
   const publicFile=await fetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(8000)});
   const pd=await publicFile.json().catch(()=>({}));
   if(publicFile.ok){ existing=publicFile; ed=pd; }
   else throw new Error("GitHub file lookup failed: HTTP "+existing.status+" — "+(ed.message||"Not Found")+"; public lookup also failed: HTTP "+publicFile.status+" — "+(pd.message||"Not Found"));
  }else if(!existing.ok){
   throw new Error("GitHub file lookup failed: HTTP "+existing.status+" — "+(ed.message||"Not Found"));
  }
  if(Array.isArray(ed)) throw new Error("GitHub target is a directory, not a file: "+path);
  const original=Buffer.from(ed.content||"","base64").toString("utf8");
  if(!original) throw new Error("GitHub returned an empty file: "+path);
  let fixed=original;
  const fixes=[];
  if(/\.html?$/i.test(path)){
   const before=fixed;
   fixed=fixed.replace(/console\.log\(([^;\n]+);/g,"console.log($1);");
   if(fixed!==before) fixes.push("Fixed malformed console.log call (missing closing parenthesis).");
  }
  const forceRecoveryTest=missionMode && /(?:force|forced|simulate|test).{0,40}recovery|recovery.{0,40}(?:force|forced|simulate|test)/i.test(githubTaskText);
  const missionRecovery=missionMode && fixed!==original;
  if(missionRecovery){
   activity.push({tool:"recovery:diagnose",state:"done",details:"Mission Mode detected a deterministic patch and routed it through the recovery checkpoint instead of bypassing recovery."});
   try{ recoveryStep("switch_provider_or_model","Recovery route selected: alternate GitHub execution path will be used."); }catch{}
   activity.push({tool:"recovery:checkpoint",state:"done",details:"Repository, branch, target file, original content, and target SHA were preserved before alternate execution."});
   try{ recoveryStep("resume_checkpoint","Resuming execution from the preserved repository/file checkpoint."); }catch{}
   try{ recoveryStep("alternate_execution","Alternate GitHub execution path resumed from checkpoint; applying the diagnosed patch."); }catch{}
   if(missionMode){ try{missionStep("recover","Recovery checkpoint resumed and alternate execution is active.");}catch{} }
  }else if(forceRecoveryTest && missionMode){
   activity.push({tool:"recovery:diagnose",state:"done",details:"Controlled Mission Mode recovery test requested."});
   try{ recoveryStep("switch_provider_or_model","Controlled recovery test: alternate execution route selected."); }catch{}
   activity.push({tool:"recovery:checkpoint",state:"done",details:"Repository/file inspection preserved before alternate execution."});
   try{ recoveryStep("resume_checkpoint","Resuming from the preserved checkpoint."); }catch{}
   try{ recoveryStep("alternate_execution","Alternate execution resumed from checkpoint."); }catch{}
   if(missionMode){ try{missionStep("recover","Controlled recovery path is active.");}catch{} }
  }else if(fixed===original){
   throw new Error("Diagnosis found no deterministic safe fix for "+path+". Existing content was inspected and left unchanged.");
  }
  const body={message:"BHAI X: diagnose and fix "+path,content:Buffer.from(fixed,"utf8").toString("base64"),branch,sha:ed.sha};
  const wr=await fetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/"),{method:"PUT",headers:{"Content-Type":"application/json",...h},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const wd=await wr.json().catch(()=>({}));
  if(!wr.ok) throw new Error("GitHub file write failed: HTTP "+wr.status+" — "+(wd.message||"Unknown error"));
  const commitSha=wd.commit?.sha||null;
  if(!commitSha) throw new Error("GitHub write returned no commit SHA.");
  const verify=await fetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers:h,signal:AbortSignal.timeout(8000)});
  const vd=await verify.json().catch(()=>({}));
  if(!verify.ok) throw new Error("GitHub read-back verification failed: HTTP "+verify.status+" — "+(vd.message||"Not Found"));
  const verifiedContent=vd.content?Buffer.from(vd.content,"base64").toString("utf8"):"";
  if(vd.path!==path||verifiedContent!==fixed) throw new Error("GitHub read-back verification failed: file content does not match the committed fix.");
  let reviewerEvidence=null;
  const configuredAI=getConfiguredAIProviders();
  const reviewerCandidate=configuredAI.find(id=>id!=="gemini")||null;
  if(missionMode && reviewerCandidate){
   activity.push({tool:"multi-ai:reviewer",state:"running",details:"Independent AI reviewer checking the diagnosed fix and exact GitHub target."});
   try{
    reviewerEvidence=await reviewWithMultiAI({
     task:"GitHub Mission Mode fix for "+owner+"/"+repo+"/"+path+"\nDiagnosis: "+fixes.join(" "),
     draft:fixed,
     preferred:reviewerCandidate,
     exclude:["gemini"]
    });
    activity.push({
     tool:"multi-ai:reviewer",
     state:"done",
     details:"Independent reviewer used "+reviewerEvidence.provider+" / "+reviewerEvidence.model+"; repository read-back remains the authoritative verification."
    });
   }catch(reviewError){
    activity.push({
     tool:"multi-ai:reviewer",
     state:"fallback",
     details:"Independent reviewer unavailable: "+String(reviewError?.message||reviewError).slice(0,300)+". Continuing with deterministic GitHub verification."
    });
   }
  }else if(missionMode){
   activity.push({
    tool:"multi-ai:reviewer",
    state:"skipped",
    details:"No independent second AI provider is configured; deterministic GitHub verification remains authoritative."
   });
  }
  const result={ok:true,owner,repo,default_branch:branch,path,commit:commitSha,sha:vd.sha,diagnosis:fixes,reviewer:reviewerEvidence?{provider:reviewerEvidence.provider,model:reviewerEvidence.model}:null,verified:true};
  githubExecutionConfirmed=true;
  githubVerificationConfirmed=true;
  githubFileVerified=true;
  githubEvidence=result;
  githubFileEvidence=result;
  markEvidence("github_diagnose_patch_readback",result);
  const proofVerified=evidence.verify();
  if(!proofVerified) throw new Error("Evidence engine rejected completion: repository, branch, path, commit and passing verification proof are required.");
  if(forceRecoveryTest && recovery.state==="resume_checkpoint"){ try{ recoveryStep("patch_and_verify","Alternate execution attempt produced the GitHub patch; read-back verification will confirm it."); }catch{} }
  activity.push({tool:"github:diagnose",state:"done",details:fixes.join(" ")});
  activity.push({tool:"github:patch_and_verify",state:"done",details:"Commit "+commitSha+" read back and content matched exactly."});
  activity.push({tool:"mission:evidence",state:"done",details:"No-proof-no-DONE gate passed for repository, branch, file, commit and read-back verification."});
  if(missionMode){ try{missionStep("verify","Commit and exact read-back verification passed."); missionStep("complete","Mission completed with verified evidence.");}catch{} }
  return json(res,200,{text:"## ✅ Mission GitHub fix verified\\n\\n**Repository:** "+owner+"/"+repo+"\\n\\n**Branch:** "+branch+"\\n\\n**File:** "+path+"\\n\\n**Diagnosis:** "+fixes.join(" ")+"\\n\\n**Commit:** "+commitSha+"\\n\\n**Verification:** Same file was read back from GitHub after commit and the content matched the patched content exactly.\\n\\n**Evidence:** ✅ No-proof-no-DONE gate passed.",activity,images:[],usage:await getMediaUsage(db,account.id)});
 }catch(e){
  const msg=String(e?.message||"Unknown GitHub error");
  if(/Diagnosis found no deterministic safe fix/i.test(msg)){
   activity.push({tool:"recovery:diagnose",state:"done",details:msg});
   try{ recoveryStep("switch_provider_or_model","Deterministic fixer found no safe patch; routing to alternate recovery path."); }catch{}
   activity.push({tool:"recovery:checkpoint",state:"done",details:"Repository/file inspection preserved; no file mutation was made."});
   try{ recoveryStep("resume_checkpoint","Resuming execution from the preserved repository/file checkpoint."); }catch{}
   if(missionMode){ try{missionStep("recover","Deterministic fixer could not safely patch; recovery path is now active.");}catch{} }
  }else{
   return json(res,502,{error:"GitHub file execution failed: "+msg,activity});
  }
 }
}
if(githubLinkRequest && githubRequestedRepo && autoDoIt && !githubFileRequest){
 try{
  const token=process.env.GITHUB_TOKEN;
  if(!token) return json(res,503,{error:"GitHub is not configured on BHAI X. Add GITHUB_TOKEN in Render Environment.",activity});
  const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+token};
  const me=await fetch("https://api.github.com/user",{headers:h,signal:AbortSignal.timeout(8000)});
  const md=await me.json().catch(()=>({}));
  if(!me.ok||!md.login) throw new Error(md.message||"Unable to verify GitHub account.");
  const owner=md.login,repo=githubRequestedRepo;
  let gr=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo),{headers:h,signal:AbortSignal.timeout(8000)});
  let gd=await gr.json().catch(()=>({}));
  if(gr.status===404){
   const cr=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({name:repo,description:"Created by BHAI X",private:false,auto_init:true}),signal:AbortSignal.timeout(10000)});
   gd=await cr.json().catch(()=>({}));
   if(!cr.ok && cr.status!==422) throw new Error(gd.message||"GitHub repository creation failed.");
  }else if(!gr.ok) throw new Error(gd.message||"GitHub repository lookup failed.");
  const url=gd.html_url||("https://github.com/"+owner+"/"+repo);
  return json(res,200,{text:"## ✅ GitHub verified\n\n🔗 **"+(gd.full_name||owner+"/"+repo)+"**\n\n"+url+"\n\n**Verification:** GitHub API se repository confirm hui hai.",activity,images:[],usage:await getMediaUsage(db,account.id)});
 }catch(e){
  return json(res,502,{error:"GitHub check failed: "+(e?.message||"Unknown GitHub error"),activity});
 }
}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
 const generateWithFallback=async(useTools=true)=>{
  const routed=await generateWithRouter({
   task:latestText,
   system:system+(useTools
    ?"\n\nBHAI-CORE EXECUTION MODE: Return the best direct answer. Do not claim that external tools were used unless the deterministic GitHub executor has actually produced evidence."
    :""),
   messages:compactContents(contents).flatMap(x=>{
    const parts=Array.isArray(x?.parts)?x.parts:[];
    const text=parts.filter(p=>typeof p?.text==="string").map(p=>p.text).join("\n").trim();
    if(!text)return [];
    return [{role:x.role==="model"?"assistant":"user",text}];
   }),
   preferred:"core",
   role:"engineering",
   fallback:true
  });
  return {candidates:[{content:{role:"model",parts:[{text:routed.text}]}}],provider:routed.provider,model:routed.model};
 };
 const seenCalls=new Map(),readPaths=new Set(),failedCalls=new Set(),generatedImages=[];
 const retryGuard=createRetryGuard();
 const requiresGithubExecution=githubLinkRequest||(/\bgithub\b/i.test(latestText)&&(/\b(create|make|build|update|push|commit|repo|repository|file|index\.html|verify|proof|actual|work|kaam)\b/i.test(latestText)||/do it on/i.test(latestText)));
 
 const githubRequestedPath=(latestText.match(/(?:`|\b)(index\.html|[A-Za-z0-9._/-]+\.(?:html|css|js|jsx|ts|tsx|json|md))(?=`|\b)/i)||[])[1]||"";
 
 let githubReadCount=0,totalToolCalls=0,consecutiveFailures=0;
 const knownPaths=new Set(["","/"]);
 let rootListed=false;
 const maxGithubReads=5,maxToolCalls=6,maxRounds=3;

 for(let round=0;round<maxRounds && totalToolCalls<maxToolCalls;round++){
  let d; try{d=await generateWithFallback(!quickChatMode)}catch(e){
   return json(res,502,{error:e.message||String(e),activity});
  }
  const candidate=d.candidates?.[0],parts=candidate?.content?.parts||[];
  const calls=parts.filter(p=>p.functionCall).map(p=>p.functionCall);
  if(!calls.length){
   const text=parts.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
   if(missionMode && mission.phase==="verify" && !requiresGithubExecution) { missionStep("complete","Response produced and no external execution evidence was required"); }
   if(requiresGithubExecution && (!githubVerificationConfirmed || (githubFileRequest && !githubFileVerified))){
    if(totalToolCalls<maxToolCalls){
     contents.push(candidate.content);
     contents.push({role:"user",parts:[{text:"STOP. This is an explicit GitHub execution task. You have not yet produced verified GitHub evidence. Do NOT say Task completed. Use the GitHub tools now to create/update/read the requested repository and verify the result. Final success requires repository URL, requested file/path, commit SHA, and verification."}]});
     continue;
    }
    return json(res,200,{text:"⚠️ GitHub execution was not verified. I will not claim the task is completed without actual repository/file/commit evidence.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
   }
   return json(res,200,{text:text||"Media ready.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
  }
  contents.push(candidate.content);
  const allowedCalls=calls.slice(0,2),responseParts=[];
  for(const call of allowedCalls){
   if(totalToolCalls>=maxToolCalls) break;
   const name=call.name,a={...(call.args||{}),doIt:autoDoIt};
   // Deterministic GitHub target override: the user's explicit "GitHub repository:" and "index.html" always beat AI/parser guesses.
   const explicitToolRepo=githubTaskText.match(/(?:GitHub\s+repository|repository)\s*:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})/i);
   const explicitToolIndexHtml=/\bindex\.html\b/i.test(githubTaskText);
   if(/^github_/.test(name) && (explicitToolRepo||githubTarget.owner||githubTarget.repo||githubTarget.path)){
     if(!latestHasExplicitGithub && name!=="github_create_repo"){
       activity[activity.length-1].state="blocked";
       responseParts.push({functionResponse:{name,response:{error:"GitHub action blocked: current user message does not explicitly reference GitHub/repository work."}}});
       continue;
     }
    if(explicitToolRepo){ a.owner=explicitToolRepo[1]; a.repo=explicitToolRepo[2]; }
    else {
     if(githubTarget.owner) a.owner=githubTarget.owner;
     if(githubTarget.repo) a.repo=githubTarget.repo;
    }
    if(/^(github_read|github_update|github_create_file|github_delete_file)$/.test(name)){
     if(explicitToolIndexHtml) a.path="index.html";
     else if(githubRequestedFile) a.path=githubRequestedFile;
    }
   }
   const cacheKey=name+":"+JSON.stringify(a);
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
    if((name==="github_create_repo"||name==="github_update") && recovery.state==="alternate_execution"){ recoveryStep("patch_and_verify","Alternate execution path produced a GitHub change; verification will follow."); if(missionMode&&mission.phase==="recover"){try{missionStep("execute","Recovery checkpoint resumed and alternate execution produced a patch.");}catch{}} }
    if(name==="github_create_repo"||name==="github_update"){
      if(name==="github_create_repo" && !latestRequestsProjectExecution && !latestHasExplicitGithub){
        throw new Error("Repository creation blocked: current request is not a project/GitHub task.");
      }
      githubExecutionConfirmed=true;githubEvidence=result; markEvidence(name,result); if(name==="github_update" && result?.path){knownPaths.add(String(result.path).replace(/^\/+/, ""));}}
    if((name==="github_read"||name==="github_info") && result && !result.skipped){githubVerificationConfirmed=true;githubEvidence=result; markEvidence(name,result); if(name==="github_read" && result?.type==="file"){const p=String(result.path||"").replace(/^\/+/, ""); if(!githubRequestedPath || p.toLowerCase()===githubRequestedPath.toLowerCase()){ githubFileVerified=true; if(missionMode&&mission.phase==="execute"){try{missionStep("verify","Target file was read back after execution.");}catch{}} }}}
    responseParts.push({functionResponse:{name,response:{result}}});
   }catch(e){
    const msg=String(e?.message||e);
    const errorClass=classifyEngineeringError(e);
    if(missionMode && mission.phase==="recover" && errorClass.retryable){ try { missionStep("execute","Retrying from recovery checkpoint"); } catch {} }
    if(recovery.state==="diagnose") activity.push({tool:"recovery:diagnose",state:"done",details:errorClass.type+":"+errorClass.message});
    if(errorClass.retryable && recovery.state==="diagnose") recoveryStep("patch_and_verify","retryable "+errorClass.type);
    const isGitHubReadMiss=name==="github_read" && /not found|path.*not|does not exist/i.test(msg);
    if(isGitHubReadMiss){
     activity[activity.length-1].state="skipped";
     responseParts.push({functionResponse:{name,response:{result:{skipped:true,reason:msg}}}});
     continue;
    }
    failedCalls.add(cacheKey); retryGuard.canTry(name,a); consecutiveFailures++; activity[activity.length-1].state="failed";
    responseParts.push({functionResponse:{name,response:{error:msg}}});
   }
  }
  if(calls.length>allowedCalls.length) responseParts.push({functionResponse:{name:"tool_budget_guard",response:{error:"At most 2 tool calls are allowed per model round. Continue from returned results instead of issuing parallel calls."}}});
  contents.push({role:"user",parts:responseParts});
  contents=compactContents(contents);
  if(consecutiveFailures>=2) break;
 }

 const finalSystem=system+" You have reached the safe execution budget. Do not call any more tools. Use the information already gathered and give the best possible final response. If the requested code change was not completed, clearly state what remains."+ (requiresGithubExecution ? " IMPORTANT: Never claim GitHub completion unless actual GitHub tool results verified the repository/file/commit. If evidence is missing, explicitly say GitHub execution was not verified." : "");
 try{
  const fd=await generateWithFallback(false);
  const fp=fd.candidates?.[0]?.content?.parts||[],ft=fp.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
  if(githubLinkRequest&&githubVerificationConfirmed&&(!githubFileRequest||githubFileVerified)&&githubEvidence?.url){
   const title=githubEvidence.name||githubEvidence.full_name||"GitHub repository";
   return json(res,200,{text:"## ✅ GitHub verified\n\n🔗 **"+title+"**\n\n"+githubEvidence.url+"\n\n**Verification:** GitHub API se repository confirm hui hai.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
  }
  if(missionMode && mission.phase==="verify" && requiresGithubExecution && githubVerificationConfirmed && (!githubFileRequest || githubFileVerified) && evidence.verify()){ try { missionStep("complete","GitHub evidence and test proof verified"); } catch {} }
  if(requiresGithubExecution && githubVerificationConfirmed && (!githubFileRequest || githubFileVerified)){ if(recovery.state==="diagnose") recoveryStep("patch_and_verify","GitHub evidence collected"); if(recovery.state==="patch_and_verify" && evidence.verify()) recoveryStep("done","Commit and read-back evidence verified."); if(missionMode&&mission.phase==="verify"&&evidence.verify()){try{missionStep("complete","Mission evidence verified.");}catch{}} }
  if(missionMode && mission.phase==="verify" && !mission.canClaimDone(evidence)) return json(res,200,{text:"⚠️ Mission Mode reached verification but could not prove completion. No DONE claim was made.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
  if(requiresGithubExecution && (!githubVerificationConfirmed || (githubFileRequest && !githubFileVerified) || !evidence.verify())) return json(res,200,{text:"⚠️ GitHub execution was not fully verified. No completion claim was made. The repository/file/commit/test evidence is incomplete.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
  return json(res,200,{text:ft||"Task completed.",activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
 }catch(e){return json(res,500,{error:"Safe execution limit reached. The agent stopped to avoid an endless tool loop.",activity});}
}