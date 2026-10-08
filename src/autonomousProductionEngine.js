import {normalizeStoryRequest,parseAndValidateStoryPlan} from "./storyEngine.js";
export const AUTONOMOUS_PRODUCTION_SCHEMA_VERSION="1.0";
const clean=(v,n=12000)=>String(v??"").trim().slice(0,n);
const clamp=(v,min,max,fb)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fb;};

const FULL_PIPELINE=/(?:end[- ]to[- ]end|end to end|autonomous|full pipeline|pooras+pipeline|pooras+video|completes+episode|episodes+bana|story.*(?:video|youtube)|youtube.*(?:video|upload|publish)|publish.*final|final.*publish|story.*se.*youtube|story.*to.*youtube)/i;
const YOUTUBE=/(?:youtube|publish|uploads+(?:the|this|final)?s*video|final.*(?:publish|upload)|video.*youtube)/i;

export function isAutonomousProductionRequest(text=""){
 const raw=String(text||"").trim();
 if(!raw)return false;
 return FULL_PIPELINE.test(raw) || (/(?:story|episode|scene)/i.test(raw)&&YOUTUBE.test(raw));
}

export function isYouTubePublishRequest(text=""){
 return YOUTUBE.test(String(text||""));
}

export function normalizeAutonomousRequest(input={}){
 const prompt=clean(input.prompt||input.goal,12000);
 const story=normalizeStoryRequest({
  prompt,
  language:input.language||"Hindi",
  durationSeconds:clamp(input.durationSeconds||input.duration,15,1800,15),
  genre:input.genre||"suspense",
  tone:input.tone||"cinematic, emotional, family-friendly",
  visualStyle:input.visualStyle||"3D anime cinematic cartoon"
 });
 return {
  schemaVersion:AUTONOMOUS_PRODUCTION_SCHEMA_VERSION,
  prompt:story.prompt,story,
  autoPublish:Boolean(input.autoPublish||isYouTubePublishRequest(prompt)),
  privacy:["public","unlisted","private"].includes(input.privacy)?input.privacy:"private",
  render:Boolean(input.render!==false),
  maxScenes:clamp(input.maxScenes,1,3,3),
  aspectRatio:/^(?:9:16|1:1|4:5|16:9)$/.test(String(input.aspectRatio||""))?String(input.aspectRatio):"16:9"
 };
}

export function buildAutonomousPlan(input={}){
 const r=normalizeAutonomousRequest(input);
 const steps=[
  {id:"story",name:"Story + Script",lane:"story",required:true,state:"pending"},
  {id:"characters",name:"Permanent Character Identity",lane:"character",required:true,state:"pending"},
  {id:"visuals",name:"Character Visuals",lane:"image",required:true,state:"pending"},
  {id:"videos",name:"Character-aware Scene Videos",lane:"video",required:true,state:"pending"},
  {id:"post",name:"VFX + Music + SFX",lane:"post-production",required:true,state:"pending"},
  {id:"render",name:"Final MP4 Renderer",lane:"ffmpeg-renderer",required:true,state:r.render?"pending":"skipped"},
  {id:"youtube",name:"YouTube Publishing",lane:"youtube",required:r.autoPublish,state:r.autoPublish?"pending":"skipped"}
 ];
 return {
  schemaVersion:AUTONOMOUS_PRODUCTION_SCHEMA_VERSION,
  pipelineId:"prod_"+cryptoRandomId(r.prompt),
  request:r,steps,
  completionContract:"DONE only when every required step has verified evidence and final output proof. Partial provider work must remain PARTIAL/FAILED."
 };
}
function cryptoRandomId(input){
 let h=0;
 for(const c of String(input||""))h=((h<<5)-h+c.charCodeAt(0))|0;
 return Math.abs(h).toString(36)+"_"+Date.now().toString(36);
}

export function verifyAutonomousStory(story,request={}){
 const check=parseAndValidateStoryPlan(typeof story==="string"?story:JSON.stringify(story),request);
 return {ok:check.ok,errors:check.errors||[],sceneCount:check.plan?.scenes?.length||0,plan:check.plan||null};
}

export function nextAutonomousStep(plan,completedEvidence=[]){
 const done=new Set((Array.isArray(completedEvidence)?completedEvidence:[]).map(String));
 const steps=(plan?.steps||[]).map(s=>({...s,state:done.has(s.id)?"done":s.state}));
 const next=steps.find(s=>s.required&&s.state!=="done"&&s.state!=="skipped")||null;
 return {steps,next,complete:!next};
}

export function productionCompletionProof({plan,evidence,finalVideo,youTube}={}){
 const required=(plan?.steps||[]).filter(s=>s.required);
 const failures=required.filter(s=>!evidence?.[s.id]);
 const finalVerified=Boolean(finalVideo?.verified&&finalVideo?.rendered);
 const youtubeRequired=required.some(s=>s.id==="youtube");
 const youtubeVerified=!youtubeRequired||Boolean(youTube?.verified&&youTube?.url);
 return {
  ok:failures.length===0&&finalVerified&&youtubeVerified,
  failures:failures.map(x=>x.id),
  finalVideoVerified:finalVerified,
  youtubeVerified,
  claim:"DONE only if all required evidence is present."
 };
}
