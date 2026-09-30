import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";

const json=(res,status,data)=>res.status(status).json(data);
const clean=t=>String(t||"").replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/i,"").trim();

const STAGES={
  code:{role:"code",label:"AI Coding Agent",instruction:"Solve the coding task. Return ONLY JSON {diagnosis,plan,confidence,patches}. patches must contain complete replacement files only when evidence is sufficient; otherwise patches=[] and explain what evidence is missing."},
  build:{role:"code",label:"AI Build Guard",instruction:"Analyze build inputs and failure evidence. Return ONLY JSON {risk,checks,fixPlan,nextAction}. Never claim a build succeeded without runner evidence."},
  error:{role:"code",label:"AI Error Fixer",instruction:"Diagnose the error and propose the smallest safe complete-file patches. Return ONLY JSON {diagnosis,confidence,patches,retest}. If evidence is insufficient, patches=[] and state exactly what is missing."},
  deploy:{role:"reviewer",label:"AI Deploy Guard",instruction:"Review deployment inputs, commit and health evidence. Return ONLY JSON {risk,checks,rollbackPlan,nextAction}. Never claim deployment success without live verification."},
  review:{role:"reviewer",label:"Independent AI Reviewer",instruction:"Review the supplied code/change/error evidence. Return ONLY JSON {risk,issues,requiredChanges,confidence}. Do not claim runtime success without evidence."}
};

export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;
 const {stage="code",task="",context={},preferred="",exclude=[]}=req.body||{};
 const spec=STAGES[String(stage)];
 if(!spec)return json(res,400,{error:"stage must be code, build, error, deploy, or review"});
 if(!String(task).trim())return json(res,400,{error:"task is required"});
 try{
  const r=await generateWithRouter({
   task:spec.label+": "+String(task).slice(0,6000),
   system:spec.instruction+"\nNo fake success. Separate evidence from inference.",
   messages:[{role:"user",text:JSON.stringify({task:String(task).slice(0,12000),context})}],
   preferred,
   exclude:Array.isArray(exclude)?exclude:[],
   role:spec.role,
   fallback:true
  });
  let result;
  try{result=JSON.parse(clean(r.text));}catch{result={raw:r.text};}
  return json(res,200,{ok:true,stage,label:spec.label,provider:r.provider,model:r.model,result,verification:"This AI decision is advisory until the corresponding build/error/deploy/runtime evidence is verified."});
 }catch(e){
  return json(res,502,{ok:false,stage,label:spec.label,error:String(e.message||e).slice(0,1200)});
 }
}