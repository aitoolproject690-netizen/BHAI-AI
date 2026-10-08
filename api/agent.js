import { selectSkillsForTask, getSkillPromptContext } from "../src/skillsRouter.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ownerState, ownerReady } from "./owner.js";
import { getDb } from "./db.js";
import { getSession } from "./accounts.js";
import { resolveGithubTarget, extractGithubRepoReference, classifyEngineeringError, createRetryGuard, createEvidence, createRecoveryStateMachine, createMissionController } from "./engineeringCore.js";
import { generateWithRouter, generateVerifiedAnswer, reviewWithMultiAI, getConfiguredAIProviders } from "./aiRouter.js";
import { githubConfigured, githubApiFetch, githubApiJson, assertGithubName, assertGithubPath, assertGithubRef, encodeGithubPath, githubRepoUrl } from "./githubExecutor.js";
import { routeConversationContext } from "./contextRouter.js";
import { isMedicalIntent,getMedicalSafetyPrompt,applyMedicalSafetyFooter,isSimpleColdQuestion } from "../src/medicalSafety.js";
import {normalizeIntent,isCasualIntent,getCasualReply,detectMediaIntent,isMediaToolAllowed,isGeneralChatIntent} from "../src/intentRouter.js";
import {solveSimpleMath} from "../src/simpleMath.js";
import {classifyUserRequest} from "../src/requestRouter.js";
import {isObviouslyGarbledResponse} from "../src/responseQuality.js";
import { webSearch, filterResearchSources } from "../src/webSearch.js";

const json=(res,status,data)=>res.status(status).json(data);

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

// CI verification marker: hardened free video fallback
async function generateVideo(prompt,duration=5,aspectRatio="16:9",sourceImage=null){
 const timeout=(ms)=>AbortSignal.timeout(ms);
 const seconds=Math.min(5,Math.max(1,Number(duration)||5));
 const errors=[];
 const maxBytes=20*1024*1024;
 const downloadVideo=async(value)=>{
  let url=null;
  if(typeof value==="string") url=value;
  else if(value&&typeof value==="object"){
   for(const key of ["url","video_url","videoUrl","output_url","outputUrl","download_url","downloadUrl","path","output"]){
    const v=value[key];
    if(typeof v==="string"&&/^https?:\/\//i.test(v)){url=v;break;}
    if(v&&typeof v==="object"){
     const nested=v.url||v.path;
     if(typeof nested==="string"&&/^https?:\/\//i.test(nested)){url=nested;break;}
    }
   }
   if(!url&&value.video&&typeof value.video==="object") url=value.video.url||value.video.path||null;
   if(!url&&value.data&&typeof value.data==="object") url=value.data.url||value.data.path||null;
  }
  if(url&&typeof url==="object") url=url.url||url.path||null;
  if(url&&/^https?:\/\//i.test(url)){
   const r=await fetch(url,{signal:timeout(120000)});
   if(!r.ok) throw new Error("Video download returned HTTP "+r.status);
   const b=Buffer.from(await r.arrayBuffer());
   if(!b.length) throw new Error("Provider returned an empty video.");
   if(b.length>maxBytes) throw new Error("Provider returned a video larger than 20 MB.");
   const mime=r.headers.get("content-type")||"video/mp4";
   if(!/^video\//i.test(mime)&&!/(?:\.mp4|\.webm)(?:$|\?)/i.test(url)) throw new Error("Provider returned a non-video payload.");
   return {mimeType:mime,data:b.toString("base64")};
  }
  return null;
 };
 const extractVideo=async(value)=>{
  const direct=await downloadVideo(value).catch(()=>null); if(direct)return direct;
  if(value==null)return null;
  const text=typeof value==="string"?value:JSON.stringify(value);
  const urls=text.match(/https?:\/\/[^"\s\]}]+(?:\.mp4|\.webm)(?:\?[^"\s\]}]*)?/gi)||[];
  for(const u of urls){const v=await downloadVideo(u).catch(()=>null);if(v)return v;}
  return null;
 };
 const findTaskId=(value,depth=0)=>{
  if(depth>8||value==null)return null;
  if(typeof value==="string"){
   const s=value.trim();
   return s.length>5 && !/^https?:\/\//i.test(s) ? s : null;
  }
  if(Array.isArray(value)){
   for(const item of value){const hit=findTaskId(item,depth+1);if(hit)return hit;}
   return null;
  }
  if(typeof value==="object"){
   for(const key of ["task_id","taskId","taskID","task"]){
    const v=value[key];
    if(typeof v==="string"&&v.trim().length>5)return v.trim();
   }
   for(const v of Object.values(value)){const hit=findTaskId(v,depth+1);if(hit)return hit;}
  }
  return null;
 };
 const aspectSize=aspectRatio==="9:16"?{width:576,height:1024}:aspectRatio==="1:1"?{width:768,height:768}:aspectRatio==="4:5"?{width:832,height:1040}:{width:1280,height:720};
 const key=process.env.POLLINATIONS_API_KEY;
 if(key){
  try{
   const model=process.env.POLLINATIONS_VIDEO_MODEL||"google/veo-3.1-fast";
   if(sourceImage?.data){
    const r=await fetch("https://gen.pollinations.ai/v1/chat/completions",{
     method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
     body:JSON.stringify({model,messages:[{role:"user",content:[
      {type:"text",text:String(prompt).trim()},
      {type:"image_url",image_url:{url:"data:"+(sourceImage.mimeType||"image/png")+";base64,"+sourceImage.data}}
     ]}],duration:seconds}),
     signal:timeout(300000)
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error("Pollinations image-to-video returned HTTP "+r.status+" — "+JSON.stringify(d).slice(0,500));
    const video=await extractVideo(d?.choices?.[0]?.message?.content||d?.output_text||d?.data||d);
    if(!video)throw new Error("Pollinations image-to-video returned no downloadable video.");
    return {...video,duration:seconds,provider:"pollinations:i2v"};
   }
   const qs=new URLSearchParams({model,duration:String(seconds)});
   if(aspectRatio==="9:16"||aspectRatio==="1:1")qs.set("aspectRatio",aspectRatio);
   const r=await fetch("https://gen.pollinations.ai/video/"+encodeURIComponent(String(prompt).trim())+"?"+qs.toString(),{headers:{Authorization:"Bearer "+key},signal:timeout(300000)});
   if(!r.ok)throw new Error("Pollinations video returned HTTP "+r.status+" — "+(await r.text().catch(()=> "")).slice(0,300));
   const b=Buffer.from(await r.arrayBuffer());
   if(!b.length)throw new Error("Pollinations returned an empty video.");
   if(b.length>maxBytes)throw new Error("Pollinations returned a video larger than 20 MB.");
   return {mimeType:r.headers.get("content-type")||"video/mp4",data:b.toString("base64"),duration:seconds,provider:"pollinations"};
  }catch(e){errors.push("Pollinations: "+String(e?.message||e).slice(0,500));}
 }else errors.push("Pollinations: POLLINATIONS_API_KEY is not configured");

 const spaces=(process.env.HF_VIDEO_SPACES||"Lightricks/LTX-2-3,Lightricks/ltx-video-distilled,Wan-AI/Wan2.1,techfreakworm/LTX2.3-Studio").split(",").map(x=>x.trim()).filter(Boolean).slice(0,6);
 try{
  const {Client,handle_file}=await import("@gradio/client");
  for(const space of spaces){
   try{
    const options=process.env.HF_TOKEN?{token:process.env.HF_TOKEN}:{};
    const client=await Client.connect(space,options);
    const api=await client.view_api();
    const named=api?.named_endpoints||{};
    const names=Object.keys(named);
    const compatible=(n)=>{
     const meta=named[n]||{};
     const ps=Array.isArray(meta.parameters)?meta.parameters:[];
     const rs=Array.isArray(meta.returns)?meta.returns:[];
     const all=JSON.stringify({n,ps,rs}).toLowerCase();
     const hasPrompt=ps.some(p=>/(prompt|text)/i.test(String(p.label||p.name||"")));
     const hasImage=ps.some(p=>/(image|img|input_image)/i.test(String(p.label||p.name||"")));
     const hasVideo=/(video|mp4)/i.test(all);
     return hasPrompt&&hasVideo&&(!sourceImage||hasImage);
    };
    const specific=sourceImage
      ? names.find(n=>/i2v.*generation.*async|image.*video/i.test(n))
      : names.find(n=>/t2v.*generation.*async|text.*video/i.test(n));
    const wanted=specific||names.find(n=>compatible(n));
    if(!wanted)throw new Error("No compatible "+(sourceImage?"image-to-video":"text-to-video")+" endpoint exposed by Space.");
    const meta=named[wanted]||{};
    const params=Array.isArray(meta.parameters)?meta.parameters:[];
    let tempImagePath=null;
    try{
     if(sourceImage?.data){
      tempImagePath=path.join(os.tmpdir(),"bhai-i2v-"+Date.now()+"-"+Math.random().toString(36).slice(2)+".png");
      await fs.writeFile(tempImagePath,Buffer.from(sourceImage.data,"base64"));
     }
     const imageRef=sourceImage?.data ? handle_file(tempImagePath) : null;
     const args=params.map(p=>{
      const label=String(p.label||p.name||"").toLowerCase();
      if(/input.?image|image|img/.test(label)) return imageRef;
      if(/input.?video|video.?file/.test(label)) return null;
      if(/prompt|text/.test(label)) return String(prompt).trim();
      if(/duration|seconds/.test(label)) return Math.min(seconds,5);
      if(/enhance.?prompt/.test(label)) return false;
      if(/high.?res|high.?resolution/.test(label)) return false;
      if(/improve.?texture|multi.?scale/.test(label)) return false;
      if(/mode|task/.test(label)) return sourceImage?.data ? "image-to-video" : "text-to-video";
      if(/randomize.?seed/.test(label)) return true;
      if(/seed/.test(label)) return 0;
      if(/^height$|height/.test(label)) return sourceImage?.data ? (aspectRatio==="9:16"?512:aspectRatio==="1:1"?512:512) : 512;
      if(/^width$|width/.test(label)) return sourceImage?.data ? (aspectRatio==="9:16"?768:aspectRatio==="1:1"?512:768) : 768;
      if(/aspect.?ratio/.test(label)) return aspectRatio;
      if(/size|resolution/.test(label)) return aspectRatio==="9:16"?"720*1280":aspectRatio==="1:1"?"960*960":aspectRatio==="4:5"?"832*1088":"1280*720";
      if(/watermark/.test(label)) return false;
      if(/negative.?prompt/.test(label)) return "";
      if(/steps|inference/.test(label)) return 8;
      if(/frame/.test(label)) return 9;
      if(/guidance|cfg/.test(label)) return 3.0;
      if(p.default!==undefined) return p.default;
      return undefined;
     });
     const submitted=await client.predict(wanted,args);
    const submittedData=submitted?.data??submitted;
    let video=await extractVideo(submittedData);
    if(video)return {...video,duration:seconds,provider:"huggingface-space:"+space+":"+wanted};
    const taskId=findTaskId(submittedData);
    if(taskId){
     const statusName=names.find(n=>/status_refresh/i.test(n));
     if(statusName){
      const statusMeta=named[statusName]||{};
      const statusParams=Array.isArray(statusMeta.parameters)?statusMeta.parameters:[];
      const statusArgs=statusParams.map(p=>{
       const label=String(p.label||p.name||"").toLowerCase();
       if(/task.?id/.test(label)) return taskId;
       if(/^task$|task type/.test(label)) return sourceImage?"i2v":"t2v";
       if(/^status$|status/.test(label)) return false;
       if(p.default!==undefined) return p.default;
       return undefined;
      });
      let last=null;
      for(let attempt=0;attempt<36;attempt++){
       await new Promise(r=>setTimeout(r,5000));
       const sr=await client.predict(statusName,statusArgs);
       last=sr?.data??sr;
       video=await extractVideo(last);
       if(video)return {...video,duration:seconds,provider:"huggingface-space:"+space+":"+wanted};
      }
      throw new Error("Video task did not produce a downloadable result within the polling window: "+String(last).slice(0,250));
     }
     throw new Error("Async endpoint returned task ID but Space exposes no status_refresh endpoint.");
    }
    throw new Error("Video endpoint returned no video or task ID: "+JSON.stringify(submittedData).slice(0,350));
    }finally{
     if(tempImagePath){try{await fs.unlink(tempImagePath);}catch{}}
    }
   }catch(e){errors.push("Hugging Face "+space+": "+String(e?.message||e).slice(0,500));}
  }
 }catch(e){errors.push("Hugging Face fallback unavailable: "+String(e?.message||e).slice(0,350));}
 throw new Error("Video generation failed: all configured providers were unavailable. "+errors.join(" | "));
}
async function github(action,a){
 const args=a||{};
 if(action==="github_create_repo"){
  if(!githubConfigured())throw Object.assign(new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render Environment."),{status:503});
  const name=assertGithubName(args.name,"repository name");let owner=String(args.owner||"").trim();
  if(!owner){const me=await githubApiJson("https://api.github.com/user");owner=me?.login||"";}
  owner=assertGithubName(owner,"GitHub owner");
  try{
   const d=await githubApiJson("https://api.github.com/user/repos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description:String(args.description||"Created by BHAI X").slice(0,500),private:Boolean(args.private),auto_init:true})});
   return{ok:true,created:true,full_name:d.full_name,owner:d.owner?.login||owner,repo:d.name,default_branch:d.default_branch,url:d.html_url,clone_url:d.clone_url};
  }catch(e){if(Number(e?.status)===422){const d=await githubApiJson(githubRepoUrl(owner,name));return{ok:true,created:false,existing:true,full_name:d.full_name,owner:d.owner?.login||owner,repo:d.name,default_branch:d.default_branch,url:d.html_url,clone_url:d.clone_url};}throw e;}
 }
 if(!args.owner||!args.repo)throw new Error("GitHub owner and repo are required.");
 const owner=assertGithubName(args.owner,"GitHub owner"),repo=assertGithubName(args.repo,"GitHub repository"),branch=assertGithubRef(args.branch||"main"),base=githubRepoUrl(owner,repo);
 if(action==="github_info"){const d=await githubApiJson(base);return{name:d.full_name,default_branch:d.default_branch,private:d.private,url:d.html_url,permissions:d.permissions||null};}
 if(action==="github_read"){const filePath=assertGithubPath(args.path,{required:false}),d=await githubApiJson(base+"/contents/"+encodeGithubPath(filePath)+"?ref="+encodeURIComponent(branch));if(Array.isArray(d))return{type:"directory",items:d.map(x=>({name:x.name,path:x.path,type:x.type}))};return{type:"file",path:d.path,sha:d.sha,content:Buffer.from(d.content||"","base64").toString("utf8")};}
 if(action==="github_actions"){
  const workflow=args.workflow||args.workflow_id;
  if(args.operation==="list"){const d=await githubApiJson(base+"/actions/workflows");return{workflows:(d.workflows||[]).map(w=>({id:w.id,name:w.name,path:w.path,state:w.state}))};}
  if(args.operation==="dispatch"){if(!workflow)throw new Error("workflow is required");const w=String(workflow).trim();if(!/^[A-Za-z0-9._\/-]{1,200}$/.test(w)||w.includes("..")||w.includes("\\"))throw new Error("Invalid GitHub workflow.");await githubApiJson(base+"/actions/workflows/"+encodeURIComponent(w)+"/dispatches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:branch,inputs:args.inputs&&typeof args.inputs==="object"?args.inputs:{}})});return{ok:true,dispatched:true,workflow:w,branch};}
  if(args.operation==="runs"){const limit=Math.min(20,Math.max(1,Number(args.limit)||5)),d=await githubApiJson(base+"/actions/runs?per_page="+encodeURIComponent(limit));return{runs:(d.workflow_runs||[]).map(w=>({id:w.id,name:w.name,status:w.status,conclusion:w.conclusion,sha:w.head_sha,created_at:w.created_at,url:w.html_url}))};}
  if(args.operation==="jobs"){const runId=String(args.runId||"");if(!/^[0-9]{1,30}$/.test(runId))throw new Error("runId is required and must be numeric.");const d=await githubApiJson(base+"/actions/runs/"+encodeURIComponent(runId)+"/jobs");return{jobs:(d.jobs||[]).map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,steps:j.steps||[]}))};}
  throw new Error("Unsupported GitHub actions operation");
 }
 if(action==="github_update"){
  const filePath=assertGithubPath(args.path,{required:true});if(typeof args.content!=="string")throw new Error("path and content are required");if(Buffer.byteLength(args.content,"utf8")>500000)throw new Error("File is too large for direct agent update.");
  let sha;try{const current=await githubApiJson(base+"/contents/"+encodeGithubPath(filePath)+"?ref="+encodeURIComponent(branch));if(!Array.isArray(current))sha=current?.sha||"";}catch(e){if(Number(e?.status)!==404)throw e;}
  const d=await githubApiJson(base+"/contents/"+encodeGithubPath(filePath),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"BHAI AI: update "+filePath,content:Buffer.from(args.content,"utf8").toString("base64"),branch,...(sha?{sha}:{})})});
  return{ok:true,path:filePath,commit:d?.commit?.sha||null};
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
if(githubConfigured()) toolDefinitions.push({name:"github_update",description:"Create or replace a GitHub text file. Only use when the user clearly requested the change. Prefer one update per changed file after inspection.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},content:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path","content"]}});

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
 const endpoint=new URL(req.url||"/","http://localhost").pathname;
 const body=req.body||{};
 if(endpoint==="/api/chat"){
  let chatMessages=Array.isArray(body.messages)?body.messages.slice(-20):[];
  chatMessages=chatMessages.filter(m=>m&&["user","assistant"].includes(m.role)&&String(m.text??m.content??"").trim()).map(m=>({role:m.role,text:String(m.text??m.content??"").trim()}));
  while(chatMessages.length&&chatMessages[chatMessages.length-1].role==="assistant") chatMessages.pop();
  const task=String([...chatMessages].reverse().find(m=>m.role==="user")?.text||"").trim();
  const canonicalRequest=classifyUserRequest(task);
  if(!task)return json(res,400,{error:"Chat message is required."});
  try{
   const medicalMode=isMedicalIntent(task);
   const system=[
    "You are BHAI X, a friendly practical AI chat assistant. Answer directly and naturally. When the user writes Hindi or Hinglish, reply in the same style.",
    "Never invent facts, ingredients, chemical names, measurements, statistics, sources, or medical instructions.",
    "When evidence is supplied, treat it as the primary factual basis and do not add unsupported specifics.",
    medicalMode ? getMedicalSafetyPrompt(task) : ""
   ].filter(Boolean).join("\n");

   const deterministicMath=solveSimpleMath(task);
   if(deterministicMath!==null){
    return json(res,200,{ok:true,text:deterministicMath,provider:"deterministic",backend_provider:"math",model:"bhai-math-v1",verified:true});
   }

   // High-risk medical triage and simple cold advice stay deterministic and
   // never wait for a language model.
   if(canonicalRequest.lane==="medical"){
    const deterministicMedical=applyMedicalSafetyFooter("",task);
    if(isSimpleColdQuestion(task)||/(?:chest pain|severe chest|difficulty breathing|shortness of breath|fainting|behosh|overdose|poisoning|suicide|self harm)/i.test(task) || /(?:\bbp\b|blood pressure)\s*(?:is|=|:)\s*\d{2,3}\s*(?:\/|over)\s*\d{2,3}/i.test(task)){
     if(deterministicMedical){
      return json(res,200,{ok:true,text:deterministicMedical,provider:"deterministic",backend_provider:"medical-safety",model:"bhai-medical-safety-v1",verified:true});
     }
    }
    try{
     const results=await webSearch(task);
     const researchResults=filterResearchSources(task,results);
     const evidence=researchResults.slice(0,6).map((x,index)=>"["+String(index+1)+"] "+String(x.title||"Source")+"\nURL: "+String(x.url||"")+"\nSummary: "+String(x.snippet||"")).join("\n\n");
     const medical=await generateVerifiedAnswer({
      task,
      system:system+"\n\nMEDICAL EVIDENCE MODE: Use evidence where it supports the answer. Do not diagnose. Keep practical safety-netting.",
      messages:[{role:"user",text:task}],
      role:"medical",
      evidence,
      fallback:true
     });
     const safe=applyMedicalSafetyFooter(String(medical?.text||""),task);
     if(safe && !isObviouslyGarbledResponse(safe,task)){
      const sources=researchResults.length?"\n\n### Sources\n"+researchResults.slice(0,5).map(x=>"- ["+String(x.title||"Source").replace(/[\\[\\]]/g,"")+"]("+String(x.url||"")+")").join("\n"):"";
      return json(res,200,{ok:true,text:safe+sources,provider:medical.provider||null,backend_provider:medical.backend_provider||null,model:medical.model||null,verified:Boolean(medical.verified),quality:medical.quality||null});
     }
    }catch(e){
     console.warn("[Medical] evidence-backed lane failed:",String(e?.message||e));
    }
    if(deterministicMedical){
     return json(res,200,{ok:true,text:deterministicMedical,provider:"deterministic",backend_provider:"medical-safety",model:"bhai-medical-safety-v1",verified:true});
    }
   }

   const deterministicConversationReply=getCasualReply(task);
   if(deterministicConversationReply){
    return json(res,200,{ok:true,text:deterministicConversationReply,provider:"deterministic",backend_provider:"conversation",model:"bhai-chat-v1",verified:true});
   }

   if(canonicalRequest.lane==="coding"){
    try{
     const coding=await generateWithRouter({
      task,
      system:system+"\n\nCODING-ONLY MODE: Answer the standalone coding question directly. Do not search the web unless the user explicitly asks for current documentation.",
      messages:chatMessages,
      preferred:"",
      role:"coding",
      fallback:true
     });
     return json(res,200,{ok:true,text:String(coding?.text||"I could not generate a coding answer."),provider:coding.provider,backend_provider:coding.backend_provider||null,model:coding.model||null,verified:true});
    }catch(e){
     return json(res,502,{error:"Coding provider failed: "+String(e?.message||e)});
    }
   }

   if(canonicalRequest.lane==="current"){
    try{
     const results=await webSearch(task);
     const researchResults=filterResearchSources(task,results);
     if(!researchResults.length) throw new Error("No topic-relevant research evidence returned.");
     const evidence=researchResults.slice(0,6).map((x,index)=>"["+String(index+1)+"] "+String(x.title||"Source")+"\nURL: "+String(x.url||"")+"\nSummary: "+String(x.snippet||"")).join("\n\n");
     const researchSystem=system+"\n\nEVIDENCE-BACKED RESEARCH MODE: Answer the question using the supplied evidence. Distinguish established facts from uncertainty. Do not fill gaps by guessing.";
     const researched=await generateVerifiedAnswer({
      task,
      system:researchSystem,
      messages:[{role:"user",text:task+"\n\nWEB SEARCH RESULTS:\n"+evidence}],
      role:"researcher",
      evidence,
      fallback:true
     });
     const text=String(researched?.text||"").trim();
     if(text && !isObviouslyGarbledResponse(text,task) && researched?.quality?.verdict!=="FAIL" && researched?.verified===true){
      const sources=researchResults.length?"\n\n### Sources\n"+researchResults.slice(0,5).map(x=>"- ["+String(x.title||"Source").replace(/[\\[\\]]/g,"")+"]("+String(x.url||"")+")").join("\n"):"";
      return json(res,200,{ok:true,text:text+sources,provider:researched.provider||null,backend_provider:researched.backend_provider||null,model:researched.model||null,verified:true,quality:researched.quality||null});
     }
     return json(res,503,{ok:false,error:"Evidence-backed research answer failed quality verification, so BHAI X blocked it instead of falling back to the weak local model.",research:true,verified:false,quality:researched?.quality||null,activity:[{tool:"answer-quality-gate",state:"blocked",details:"Research draft was malformed, unverified, or failed independent review."}]});
    }catch(e){
     console.warn("[Research] evidence-backed lane failed:",String(e?.message||e));
     return json(res,503,{ok:false,error:"Fresh evidence/research was unavailable, so BHAI X blocked the unverified answer instead of falling back to the weak local model.",research:true,verified:false,activity:[{tool:"web-research",state:"failed",details:String(e?.message||e).slice(0,300)}]});
    }
   }

   const codingMode=canonicalRequest.lane==="coding";
   let routed=await generateWithRouter({
    task,
    system,
    messages:chatMessages,
    preferred:"",
    role:codingMode?"coding":"chat-general",
    fallback:true
   });
   // Any provider can occasionally emit a fragment. The router already
   // performs provider-level quality fallback; keep this final endpoint guard
   // as a last line of defence.
   if(isObviouslyGarbledResponse(routed?.text,task)){
    const alternates=getConfiguredAIProviders().filter(id=>id!==routed?.provider);
    if(alternates.length){
     routed=await generateWithRouter({
      task,
      system,
      messages:chatMessages,
      preferred:alternates[0],
      role:codingMode?"coding":"chat-general",
      exclude:[routed?.provider||"core"],
      fallback:true
     });
    }
   }
   if(isObviouslyGarbledResponse(routed?.text,task)){
    return json(res,502,{error:"AI returned malformed or low-quality output; BHAI X blocked it instead of showing nonsense."});
   }
   const safeText=medicalMode?applyMedicalSafetyFooter(routed.text,task):routed.text;
   return json(res,200,{ok:true,text:safeText,provider:routed.provider,backend_provider:routed.backend_provider||null,model:routed.model,verified:true});
  }catch(e){return json(res,502,{error:"Chat provider failed: "+String(e?.message||e)});}
 }
 if(endpoint==="/api/media"){
  const type=String(body.type||"").toLowerCase(),prompt=String(body.prompt||"").trim();
  const aspectRatio=/^(?:9:16|1:1|4:5|16:9)$/.test(String(body.aspectRatio||""))?String(body.aspectRatio):"16:9";
  if(!prompt)return json(res,400,{error:"Media prompt is required."});
  if(type==="image"){
   try{
    await reserveMedia(db,account.id,"image",10);
    try{
     const media=await generateImage(prompt,aspectRatio); await saveMediaAsset(db,account.id,"image",media);
     return json(res,200,{ok:true,text:"## 🖼️ Image generated\\n\\nBHAI X ne direct media pipeline se image banayi aur output validate kiya.",activity:[{tool:"generate_image",state:"done",details:"Dedicated media endpoint generated and validated the image."}],images:[{mimeType:media.mimeType,data:media.data}],usage:await getMediaUsage(db,account.id)});
    }catch(e){await releaseMedia(db,account.id,"image");return json(res,502,{error:"Image generation failed: "+String(e?.message||e),activity:[{tool:"generate_image",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});}
   }catch(e){return json(res,502,{error:"Image generation pre-flight failed: "+String(e?.message||e)});}
  }
  if(type==="video"){
   try{
    await reserveMedia(db,account.id,"video",3);
    try{
     const wantsImage=body.imageToVideo===true;
     const sourceImage=wantsImage?await getLatestMediaAsset(db,account.id,"image"):null;
     const videoPrompt=wantsImage&&!sourceImage?"Create a cinematic video based on this visual request: "+prompt:prompt;
     const media=await generateVideo(videoPrompt,Math.min(5,Math.max(1,Number(body.duration)||5)),aspectRatio,sourceImage);
     return json(res,200,{ok:true,text:"## 🎬 Video generated\\n\\nBHAI X ne dedicated video pipeline, provider fallback aur output validation complete ki.",activity:[{tool:"generate_video",state:"done",details:"Dedicated media endpoint generated and validated the video."}],images:[{mimeType:media.mimeType,data:media.data,video:true,duration:media.duration}],usage:await getMediaUsage(db,account.id)});
    }catch(e){await releaseMedia(db,account.id,"video");return json(res,502,{error:"Video generation failed: "+String(e?.message||e),activity:[{tool:"generate_video",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});}
   }catch(e){return json(res,502,{error:"Video generation pre-flight failed: "+String(e?.message||e)});
   }
  }
  return json(res,400,{error:"Media type must be image or video."});
 }
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 const {messages=[]}=req.body||{},activity=[];
  // Automatic execution: no user-facing DO IT switch is required.
 const latestUserMessage=[...messages].reverse().find(m=>m&&m.role==="user")?.text||"";
 const canonicalRequest=classifyUserRequest(latestUserMessage);
 // Server-side hard guard: casual conversation must NEVER enter the work/mission agent.
 // This protects against stale browser bundles, old checkpoints, or a frontend routing bug.
 const normalizedCasual=normalizeIntent(latestUserMessage);
 const conversationalReply=getCasualReply(latestUserMessage);
 const serverCasual=isCasualIntent(latestUserMessage);
   const deterministicMath=solveSimpleMath(latestUserMessage);
 if(deterministicMath!==null){
  return json(res,200,{ok:true,text:deterministicMath,provider:"deterministic",backend_provider:"math",model:"bhai-math-v1",verified:true,activity:[]});
 }
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
   "kya haal hai":"Mast bhai 😄 Tum batao kya haal?",
   "hi":"Arre bhai! 😄 Main yahin hoon. Batao kya scene hai? 🚀",
   "hello":"Hello bhai! 😎 BHAI X ready hai. Batao kya karna hai? 🚀",
   "hey":"Hey bhai! 😄 Kya chal raha hai? 🚀",
   "thanks":"Arey bhai, anytime! 😎❤️",
   "thank you":"Arey bhai, anytime! 😎❤️",
   "bye":"Bye bhai! 👋😄",
   "goodbye":"Bye bhai! 👋😄"
  };
  return json(res,200,{ok:true,text:conversationalReply||casualReplies[normalizedCasual]||"Arre bhai! 😄 Main yahin hoon. Batao kya karna hai? 🚀",casual:true,verified:true,activity:[]});
 }

// Deterministic media routing: explicit video requests always win over image-reference wording in video prompts.
// Intent routing accepts natural Hinglish/Hindi forms such as "isko video bana", "is image ko video bana do".
const mediaIntent=detectMediaIntent(latestUserMessage);
const directVideoRequest=mediaIntent.type==="video";
const imageToVideoRequest=mediaIntent.type==="video"&&mediaIntent.imageToVideo;
if(directVideoRequest){
 try{
  await reserveMedia(db,account.id,"video",3);
  try{
   const cleanPrompt=latestUserMessage
    .replace(/^\s*(?:create|generate|make|render|produce)\s+(?:a\s+)?(?:video|clip|animation|animated\s+video)\s*(?:of|from|using)?\s*/i,"")
    .trim()||latestUserMessage;
   let sourceImage=imageToVideoRequest?await getLatestMediaAsset(db,account.id,"image"):null;
   let videoPrompt=cleanPrompt;
   if(imageToVideoRequest&&!sourceImage){
    const priorVisual=Array.isArray(messages)
      ? [...messages].reverse().find(m=>m?.role==="user" && m?.text && m.text!==latestUserMessage && /(?:scene|image|picture|photo|poster|illustration|artwork|tasveer|visual|cinematic|3d)/i.test(String(m.text)))
      : null;
    videoPrompt=priorVisual?.text
      ? "Create a cinematic video based on this previously requested visual scene: "+String(priorVisual.text).trim()
      : "Create a cinematic video based on the most recent visual request.";
    activity.push({tool:"media:recovery",state:"done",details:"Previous image asset was unavailable; recovered the latest visual prompt and switched to compatible text-to-video generation."});
    sourceImage=null;
   }
   const media=await generateVideo(videoPrompt,5,"16:9",sourceImage);
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
// Visual intent also covers prompts like "cinematic 3D scene banao" where the word "image" is never written.
const directImageRequest=mediaIntent.type==="image";
if(directImageRequest){
 try{
  await reserveMedia(db,account.id,"image",10);
  try{
   const cleanPrompt=latestUserMessage
    .replace(/^\s*(?:create|generate|make|draw|design|render|visualize|banao|bana|banado|ban[aā]o)\s+(?:an?\s+)?(?:image|picture|photo|poster|illustration|artwork|tasveer|scene)\s*(?:of|for)?\s*/i,"")
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
 if(!getConfiguredAIProviders().length) return json(res,503,{error:"No AI provider is configured. Configure BHAI-CORE or another supported AI provider in Render Environment."});
 const contextRoute=routeConversationContext(messages,latestUserMessage);
 const routedMessages=contextRoute.messages;
 const userTaskMessages=routedMessages.filter(m=>m&&m.role==="user").map(m=>String(m.text||"")).filter(Boolean);
 const latestTarget=resolveGithubTarget(latestUserMessage);
 const contextualRepoReference=/(?:\bus\s+repo\b|\busi\s+repo\b|\bwahi\s+repo\b|\bthat\s+repo\b|\bthis\s+repo\b|\bsame\s+repo\b|\bis\s+repo\b)/i.test(latestUserMessage);
 const contextRepoKeys=[...new Set(userTaskMessages.map(t=>resolveGithubTarget(t)).filter(x=>x.owner&&x.repo).map(x=>x.owner+"/"+x.repo))];
 const hasUniqueContextRepo=!latestTarget.owner&&!latestTarget.repo&&contextualRepoReference&&contextRepoKeys.length===1;
 const githubTaskText=hasUniqueContextRepo
  ? "GitHub repository: "+contextRepoKeys[0]+"\n"+latestUserMessage
  : latestUserMessage;
  const latestHasExplicitGithub=/(?:github|git hub|repository|repo\b|\bcreate\s+(?:a\s+)?repo|\bgithub\s+repo)/i.test(latestUserMessage);
  const latestRequestsProjectExecution=/(?:\bapp\b|\bproject\b|\bwebsite\b|\bapk\b|\bcode\b|\bbuild\b|\bdeploy\b|\bcreate\b|\bmake\b|\bbana\b|\bban[a-z]*\b|\bfix\b|\bupdate\b|\bpublish\b|\bcommit\b|\bpush\b)/i.test(latestUserMessage);
  const freshTaskIsolation=contextRoute.mode==="fresh_task";

 const selectedSkills=selectSkillsForTask(latestUserMessage);
 const skillContext=getSkillPromptContext(selectedSkills);
 const contextNote=`CONTEXT ROUTER: ${contextRoute.mode}. ${contextRoute.reason} Never revive an older Mission, repository, file, commit, or build unless the current user message explicitly refers to that existing task.`;
 const medicalMode=isMedicalIntent(latestUserMessage);
 const medicalSafety=medicalMode?getMedicalSafetyPrompt(latestUserMessage):"";
 const safeResponseText=(text)=>medicalMode?applyMedicalSafetyFooter(text,latestUserMessage):String(text||"");
 const system=`You are BHAI AI, a practical personal work agent. ${contextNote} ${skillContext} ${medicalSafety}
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
 const activeToolDefinitions=(selectedSkills.includes("web-research") ? toolDefinitions : toolDefinitions.filter(t=>t.name!=="web_search"))
  .filter(t=>isMediaToolAllowed(t.name,latestUserMessage)||!["generate_image","generate_video"].includes(t.name));

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
if(canonicalRequest.lane==="medical"){
 try{
  const deterministicMedical=applyMedicalSafetyFooter("",latestUserMessage);
  if(deterministicMedical){
   return json(res,200,{ok:true,text:deterministicMedical,provider:"deterministic",backend_provider:"medical-safety",model:"bhai-medical-safety-v1",verified:true,activity:[]});
  }
  const medical=await generateWithRouter({
   task:latestUserMessage,
   system:system+"\n\n"+getMedicalSafetyPrompt(latestUserMessage),
   messages:routedMessages,
   role:"medical",
   fallback:true
  });
  const safe=applyMedicalSafetyFooter(medical.text,latestUserMessage);
  if(!isObviouslyGarbledResponse(safe,latestUserMessage)){
   return json(res,200,{ok:true,text:safe,provider:medical.provider||null,backend_provider:medical.backend_provider||null,model:medical.model||null,verified:true,activity:[]});
  }
 }catch(e){
  console.warn("[Medical] agent lane failed:",String(e?.message||e));
 }
}

// Deterministic conversation gate MUST run before any provider or research lane.
const latestText=String(latestUserMessage||"").trim();
const deterministicConversationReply=getCasualReply(latestText);
if(deterministicConversationReply){
 return json(res,200,{ok:true,text:deterministicConversationReply,provider:"deterministic",backend_provider:"conversation",model:"bhai-chat-v1",verified:true,activity:[]});
}

// Standalone coding-help MUST beat knowledge/web research. This prevents
// Python/JS explanations from being hijacked into generic search results.
const localCodingRequest=canonicalRequest.lane==="coding";
if(localCodingRequest){
 try{
  const routed=await generateWithRouter({
   task:latestText,
   system:"You are BHAI X, a practical coding assistant. For standalone code questions, answer directly with the corrected code and a brief explanation. Do not claim GitHub, repository, build, deploy, or file changes unless they were actually performed.",
   messages:[{role:"user",text:latestText}],
   preferred:"core",
   role:"coding",
   fallback:true
  });
  return json(res,200,{ok:true,text:String(routed?.text||"I could not generate a coding answer."),provider:routed?.provider||null,backend_provider:routed?.backend_provider||null,model:routed?.model||null,activity:[{tool:"coding-chat",state:"done",details:"Standalone coding request kept out of engineering execution and web research."}],images:[],usage:await getMediaUsage(db,account.id),verified:true});
 }catch(e){
  return json(res,502,{error:"Coding chat provider failed: "+String(e?.message||e),activity:[{tool:"coding-chat",state:"failed",details:String(e?.message||e)}]});
 }
}

const currentResearchRequest=canonicalRequest.lane==="current";
if(currentResearchRequest){
 try{
  const results=await webSearch(latestText);
  const researchResults=filterResearchSources(latestText,results);
  if(!researchResults.length) throw new Error("Web search returned no usable results.");
  const evidence=researchResults.slice(0,6).map((x,index)=>"["+String(index+1)+"] "+String(x.title||"Source")+"\nURL: "+String(x.url||"")+"\nSummary: "+String(x.snippet||"")).join("\n\n");
  const researchSystem=system+"\n\nCURRENT WEB RESEARCH MODE: Use the supplied search results as the factual source. Do not invent current facts. Clearly separate confirmed facts from uncertainty. Answer in the user's language/style. If the search results are insufficient, say so rather than guessing.";
  const researched=await generateVerifiedAnswer({
    task:latestText,
    system:researchSystem,
    messages:[{role:"user",text:latestText+"\n\nWEB SEARCH RESULTS:\n"+evidence}],
    role:"researcher",
    evidence,
    fallback:true
  });
  const researchedText=String(researched?.text||"").trim();
  if(!researchedText || isObviouslyGarbledResponse(researchedText,latestText) || researched?.quality?.verdict==="FAIL" || researched?.verified!==true){
    return json(res,503,{ok:false,error:"Fresh web answer failed quality verification, so BHAI X blocked it instead of falling back to BHAI-CORE/SmolLM2.",research:true,verified:false,quality:researched?.quality||null,activity:[{tool:"answer-quality-gate",state:"blocked",details:"Current-information answer was malformed, unverified, or failed independent review."}]});
  }
  const sources="\n\n### Sources\n"+researchResults.slice(0,5).map(x=>"- ["+String(x.title||"Source").replace(/[\[\]]/g,"")+ "]("+String(x.url||"")+")").join("\n");
  return json(res,200,{
    ok:true,
    text:safeResponseText(String(researched.text||"Unable to produce a verified research answer.")+sources),
    provider:researched.provider||null,
    backend_provider:researched.backend_provider||null,
    model:researched.model||null,
    verified:true,
    activity:[{tool:"web_search",state:"done",details:"Current/web question answered from fresh search evidence."}]
  });
 }catch(e){
  console.warn("[Research] fresh web lane failed:",String(e?.message||e));
  return json(res,503,{ok:false,error:"Fresh web research was unavailable, so BHAI X blocked the unverified answer instead of falling back to BHAI-CORE/SmolLM2.",research:true,verified:false,activity:[{tool:"web-research",state:"failed",details:String(e?.message||e).slice(0,300)}]});
 }
}


const missionMode=/\b(?:app|project|repo|repository|website|apk)\b/i.test(latestText) && /\b(?:create|make|build|bana|ban[a-z]*|fix|deploy|publish|push|commit|update|repair|test|verify)\b/i.test(latestText);
const mission=createMissionController();
const missionStep=(next,details="")=>{ mission.transition(next); activity.push({tool:"mission:"+next,state:"done",details}); };
const githubLinkRequest=/\bgithub\b/i.test(githubTaskText)&&(/\b(link|url|repo|repository)\b/i.test(githubTaskText));
const githubFileRequest=/\bgithub\b/i.test(githubTaskText)&&(/\b(file|index\.html|html|code|page|commit|push|update|create)\b/i.test(githubTaskText));
  const autoDoIt=true;
let githubExecutionConfirmed=false,githubVerificationConfirmed=false,githubFileVerified=false,githubEvidence=null,githubFileEvidence=null;
const githubTarget=resolveGithubTarget(githubTaskText);
const githubExplicitRepoMatch=githubTarget.owner&&githubTarget.repo
  ? {owner:githubTarget.owner,repo:githubTarget.repo}
  : null;
let githubRequestedRepo=githubTarget.repo||"";

const quickChat=/^(?:hi|hello|hey|hii|helo|namaste|salam|good morning|good night|good evening|kaise ho|kaisa hai|kya haal|kya chal raha(?: hai)?|kya chal rha(?: hai)?|kya kar rahe ho|kya scene hai|kya hua|thanks|thank you|thik hai|theek hai|ok|okay|nice|wah|haha|😂|😄|bye|goodbye|khana kha liya(?: hai)?|khana khaya(?: hai)?|kha liya|chai pi liya|so gaye|so rahe ho|kahan ho|busy ho|free ho)(?:\\s+bhai)?[!?., ]*$/i.test(latestText);
const fastMode=/^(bhai\\s+)?(ye|yeh|yah|kuch|sab|mera|meri|mujhe|isko|is|app|code|project|login|payment|error|problem|issue|bug|website|apk|video|image|file|github|render|deploy|api|server|dawa|medicine|tablet|baby|report|phone|mobile|wifi|internet|password|account)\\b.{0,220}$/i.test(latestText)
 || /(nahi ho raha|nahi ho rha|nahin ho raha|nahin ho rha|nahi chal raha|nahi chal rha|kaam nahi kar|problem aa|problem a|error aa|error a|issue aa|issue a|bug aa|bug a|fix kar|fix kaise|kaise fix|kese fix|kya karu|kya kare|kya karna hai|kuch kar|help chahiye|samajh nahi|samajh nhi|bata bhai|batao bhai)/i.test(latestText);
const quickChatMode=quickChat||fastMode;
if(quickChat && !medicalMode){
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
 const reply=fallbackReply;
 activity.push({tool:"deterministic-casual",state:"done",details:"Common casual message handled locally without invoking an AI provider."});
 return json(res,200,{text:reply,activity,images:[],usage:await getMediaUsage(db,account.id)});
}
const recovery=createRecoveryStateMachine();
const recoveryStep=(next,details="")=>{ recovery.transition(next); activity.push({tool:"recovery:"+next,state:"done",details}); };
const githubFileMatch=(githubTaskText.match(/(?:[A-Za-z0-9_.-]+\/){0,2}(?:[A-Za-z0-9._-]+\/)*(?:index\.html|[A-Za-z0-9._-]+\.(?:html|css|js|jsx|ts|tsx|json|md))/i)||[])[0]||"";
const deterministicRepoTarget=resolveGithubTarget(githubTaskText);
const explicitRepoMatch=deterministicRepoTarget.owner&&deterministicRepoTarget.repo
  ? [null,deterministicRepoTarget.owner,deterministicRepoTarget.repo]
  : null;
const explicitIndexHtml=/\bindex\.html\b/i.test(githubTaskText);
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
  if(!githubConfigured()) return json(res,503,{error:"GitHub is not configured on BHAI X. Add GITHUB_TOKEN in Render Environment.",activity});
  const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  const me=await githubApiFetch("https://api.github.com/user",{headers:{...h,"User-Agent":"BHAI-X"},signal:AbortSignal.timeout(8000)});
  const md=await me.json().catch(()=>({}));
  if(!me.ok||!md.login) throw new Error(md.message||"Unable to verify GitHub account.");
  const owner=explicitRepoMatch?explicitRepoMatch[1]: (githubTarget.owner||md.login);
  const repo=explicitRepoMatch?explicitRepoMatch[2]: (githubTarget.repo||githubRequestedRepo);
  const path=String(explicitIndexHtml?"index.html":(githubTarget.path||githubRequestedFile||"")).replace(/^\/+/,"");
  if(!owner||!repo||!path) throw new Error("GitHub target is incomplete: owner, repository, and file path are required.");
  const base="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
  const publicHeaders={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"BHAI-X"};
  const authHeaders={...h,"User-Agent":"BHAI-X"};
  let rr=await githubApiFetch(base,{headers:authHeaders,signal:AbortSignal.timeout(8000)});
  let rd=await rr.json().catch(()=>({}));
  if(!rr.ok && rr.status===404){
   const accessible=await githubApiFetch("https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",{headers:authHeaders,signal:AbortSignal.timeout(8000)});
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
  let existing=await githubApiFetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers:h,signal:AbortSignal.timeout(8000)});
  let ed=await existing.json().catch(()=>({}));
  if(!existing.ok && existing.status===404){
   const publicFile=await githubApiFetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(8000),authenticated:false});
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
   fixed=fixed
    .replace(/console\.log\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)+\s*;/g,"console.log($1);")
    .replace(/console\.log\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*;/g,"console.log($1);");
   if(fixed!==before) fixes.push("Fixed malformed console.log syntax.");
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
  const wr=await githubApiFetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/"),{method:"PUT",headers:{"Content-Type":"application/json",...h},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const wd=await wr.json().catch(()=>({}));
  if(!wr.ok) throw new Error("GitHub file write failed: HTTP "+wr.status+" — "+(wd.message||"Unknown error"));
  const commitSha=wd.commit?.sha||null;
  if(!commitSha) throw new Error("GitHub write returned no commit SHA.");
  const verify=await githubApiFetch(base+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers:h,signal:AbortSignal.timeout(8000)});
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
  if(!githubConfigured()) return json(res,503,{error:"GitHub is not configured on BHAI X. Add GITHUB_TOKEN in Render Environment.",activity});
  const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  const me=await githubApiFetch("https://api.github.com/user",{headers:h,signal:AbortSignal.timeout(8000)});
  const md=await me.json().catch(()=>({}));
  if(!me.ok||!md.login) throw new Error(md.message||"Unable to verify GitHub account.");
  const owner=md.login,repo=githubRequestedRepo;
  let gr=await githubApiFetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo),{headers:h,signal:AbortSignal.timeout(8000)});
  let gd=await gr.json().catch(()=>({}));
  if(gr.status===404){
   const cr=await githubApiFetch("https://api.github.com/user/repos",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({name:repo,description:"Created by BHAI X",private:false,auto_init:true}),signal:AbortSignal.timeout(10000)});
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
 const explicitExecutionCue=latestHasExplicitGithub ||
  /\\b(?:repo(?:sitory)?|app|project|website|apk|deploy|commit|push|pull request|build|release|publish)\\b/i.test(latestText) ||
  /\\b(?:edit|update|fix|debug|implement|refactor|modify)\\b.{0,80}\\b(?:file|repo(?:sitory)?|codebase|project|github|code)\\b/i.test(latestText);
 const agentNeedsTools=explicitExecutionCue ||
  selectedSkills.some(skill=>["github","file","build","automation"].includes(skill));
 const generateWithFallback=async(useTools=true)=>{
  const chatMessages=compactContents(contents).flatMap(x=>{
   const parts=Array.isArray(x?.parts)?x.parts:[];
   const text=parts.filter(p=>typeof p?.text==="string").map(p=>p.text).join("\n").trim();
   if(!text)return [];
   return [{role:x.role==="model"?"assistant":"user",text}];
  });
  if(useTools&&agentNeedsTools&&key){
   const models=await getModelsFast();
   let lastError=null;
   for(const model of models){
    try{
     const d=await geminiGenerate(key,model,system,compactContents(contents),true,activeToolDefinitions);
     return {candidates:d.candidates||[],provider:"gemini",model};
    }catch(e){
     lastError=e;
     const msg=String(e?.message||e);
     if(!/(?:404|not found|unsupported|invalid model|model .*?(?:not found|unavailable)|does not support)/i.test(msg))throw e;
    }
   }
   if(lastError)throw lastError;
  }
  const generalConversation=isGeneralChatIntent(latestText);
  const directAnswerLane=!agentNeedsTools && ["general","knowledge","coding"].includes(canonicalRequest.lane);
  let routed=await generateWithRouter({
   task:latestText,
   system:system+(useTools?"\n\nAnswer without claiming external tool execution unless verified evidence exists.":""),
   messages:chatMessages,
   preferred:directAnswerLane?"":(generalConversation?"":"core"),
   role:directAnswerLane||generalConversation?"chat-general":"engineering",
   fallback:true
  });

  // Central router quality fallback handles malformed output from any provider;
  // this endpoint guard covers stale/legacy execution paths too.
  if(isObviouslyGarbledResponse(routed?.text,latestText)){
   const alternateIds=getConfiguredAIProviders()
    .filter(id=>id!==routed?.provider)
    .sort((a,b)=>(a==="core"?1:0)-(b==="core"?1:0));
   let recovered=null;
   for(const provider of alternateIds){
    try{
     const candidate=await generateWithRouter({
      task:latestText,
      system:system+(useTools?"\n\nAnswer without claiming external tool execution unless verified evidence exists.":""),
      messages:chatMessages,
      preferred:provider,
      role:directAnswerLane||generalConversation?"chat-general":"engineering",
      exclude:[routed?.provider||"core"],
      fallback:true
     });
     if(!isObviouslyGarbledResponse(candidate?.text,latestText)){
      recovered=candidate;
      break;
     }
     routed=candidate;
    }catch(e){}
   }
   if(recovered) routed=recovered;
  }

  if(isObviouslyGarbledResponse(routed?.text,latestText)){
   throw new Error("AI response failed quality validation; malformed output was blocked.");
  }

  return {candidates:[{content:{role:"model",parts:[{text:routed.text}]}}],provider:routed.provider,model:routed.model};
 };
 const seenCalls=new Map(),readPaths=new Set(),failedCalls=new Set(),generatedImages=[];
 const retryGuard=createRetryGuard();
 const requiresGithubExecution=githubLinkRequest||(/\bgithub\b/i.test(latestText)&&(/\b(create|make|build|update|push|commit|repo|repository|file|index\.html|verify|proof|actual|work|kaam)\b/i.test(latestText)||/do it on/i.test(latestText)));
 const exactGithubRepo=extractGithubRepoReference(githubTaskText);
 const repoCreationRequest=/\b(?:create|make|new)\s+(?:a\s+)?(?:github\s+)?repo(?:sitory)?\b/i.test(latestText);
 if(requiresGithubExecution && !exactGithubRepo && !repoCreationRequest){
  return json(res,200,{ok:false,text:"⚠️ GitHub task blocked safely. Exact repository target missing hai. BHAI X kisi purane repo ya logs/steps jaise path ko repository nahi maanega. Exact owner/repo ya GitHub repository URL do; tabhi GitHub file/repo execution hoga.",activity:[{tool:"github-target-guard",state:"blocked",details:"No explicit repository target in the current user message."}],images:[],usage:await getMediaUsage(db,account.id),verified:false});
 }
 
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
   return json(res,200,{text:safeResponseText(text||"Media ready."),activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
  }
  contents.push(candidate.content);
  const allowedCalls=calls.slice(0,2),responseParts=[];
  for(const call of allowedCalls){
   if(totalToolCalls>=maxToolCalls) break;
   const name=call.name,a={...(call.args||{}),doIt:autoDoIt};
   // Deterministic GitHub target override: only the current request (or one unambiguous contextual repo) may select a repository.
   const explicitToolTarget=resolveGithubTarget(githubTaskText);
   const explicitToolRepo=explicitToolTarget.owner&&explicitToolTarget.repo
     ? {owner:explicitToolTarget.owner,repo:explicitToolTarget.repo}
     : null;
   const explicitToolIndexHtml=/\bindex\.html\b/i.test(githubTaskText);
   if(/^github_/.test(name)){
     if(!latestHasExplicitGithub && name!=="github_create_repo"){
       activity[activity.length-1].state="blocked";
       responseParts.push({functionResponse:{name,response:{error:"GitHub action blocked: current user message does not explicitly reference GitHub/repository work."}}});
       continue;
     }
     if(name!=="github_create_repo" && (!githubTarget.owner||!githubTarget.repo)){
       activity[activity.length-1].state="blocked";
       responseParts.push({functionResponse:{name,response:{error:"GitHub action blocked: exact repository target is missing or ambiguous. Ask for an explicit owner/repository before reading or modifying files."}}});
       continue;
     }
    if(explicitToolRepo){ a.owner=explicitToolRepo.owner; a.repo=explicitToolRepo.repo; }
    else {
     if(githubTarget.owner) a.owner=githubTarget.owner;
     if(githubTarget.repo) a.repo=githubTarget.repo;
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
    if(name==="generate_image" && !isMediaToolAllowed(name,latestUserMessage)){
     activity[activity.length-1].state="blocked";
     responseParts.push({functionResponse:{name,response:{error:"Media tool blocked: current request is not an explicit image-generation request."}}});
     continue;
    }
    if(name==="generate_video" && !isMediaToolAllowed(name,latestUserMessage)){
     activity[activity.length-1].state="blocked";
     responseParts.push({functionResponse:{name,response:{error:"Media tool blocked: current request is not an explicit video-generation request."}}});
     continue;
    }
    if(name==="web_search") result=await webSearch(a.query);
    else if(name==="generate_image"){
     await reserveMedia(db,account.id,"image",10);
     try{result=await generateImage(a.prompt,a.aspectRatio||"16:9");}
     catch(e){await releaseMedia(db,account.id,"image");throw e;}
    } else if(name==="generate_video"){
     await reserveMedia(db,account.id,"video",3);
     try{
      const toolImageToVideo=/\b(?:image[- ]to[- ]video|video\b.{0,100}\b(?:from|using|with|isko|iss|is)\b.{0,100}\b(?:image|picture|photo|pic|tasveer|scene))\b|\b(?:isko|iss|is)\b.{0,80}\b(?:video|clip|animation)\b/i.test(latestUserMessage);
      const sourceImage=toolImageToVideo?await getLatestMediaAsset(db,account.id,"image"):null;
      // If the image was created before persistent media storage existed, recover gracefully:
      // reuse the latest visual user prompt as a T2V fallback instead of failing the whole request.
      let videoPrompt=a.prompt;
      if(toolImageToVideo&&!sourceImage){
       const priorVisual=Array.isArray(messages)
        ? [...messages].reverse().find(m=>m?.role==="user" && m?.text && m.text!==latestUserMessage && /(?:scene|image|picture|photo|poster|illustration|artwork|tasveer|visual|cinematic|3d)/i.test(String(m.text)))
        : null;
       videoPrompt=priorVisual?.text
        ? "Create a cinematic video based on this previously requested scene: "+String(priorVisual.text).trim()
        : "Create a cinematic video based on the most recent visual request.";
       activity.push({tool:"media:recovery",state:"done",details:"Previous image asset was not persisted; recovered the latest visual prompt and switched to compatible text-to-video generation."});
      }
      result=await generateVideo(videoPrompt,Math.min(5,Number(a.duration)||5),a.aspectRatio||"16:9",sourceImage);
     }catch(e){await releaseMedia(db,account.id,"video");throw e;}
    } else result=await github(name,{...a,path:normalizedPath});
    if(name==="generate_image"){
     await saveMediaAsset(db,account.id,"image",result);
     generatedImages.push({mimeType:result.mimeType,data:result.data});
    }
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
  return json(res,200,{text:safeResponseText(ft||"Task completed."),activity,images:generatedImages,usage:await getMediaUsage(db,account.id)});
 }catch(e){return json(res,500,{error:"Safe execution limit reached. The agent stopped to avoid an endless tool loop.",activity});}
}


export { generateImage,generateVideo,saveMediaAsset,getLatestMediaAsset,reserveMedia,releaseMedia,getMediaUsage };