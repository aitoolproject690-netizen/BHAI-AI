import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";
import {normalizeStoryRequest,buildStoryPrompt,parseAndValidateStoryPlan,buildStoryMarkdown} from "../src/storyEngine.js";
const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
  const account=await requireSession(req,res);if(!account)return;
  const request=normalizeStoryRequest(req.body||{});
  if(!request.prompt)return json(res,400,{error:"prompt is required"});
  let first,check;
  try{
    first=await generateWithRouter({task:"story script generation: "+request.prompt,system:buildStoryPrompt(request),messages:[{role:"user",text:request.prompt}],role:"story",fallback:true});
    check=parseAndValidateStoryPlan(first.text,request);
  }catch(e){
    return json(res,502,{ok:false,error:"Story generation failed: "+String(e?.message||e).slice(0,700),provider:e?.provider||null,attemptedProviders:e?.attemptedProviders||[]});
  }
  if(!check.ok){
    try{
      const repaired=await generateWithRouter({task:"repair story script JSON: "+request.prompt,
        system:buildStoryPrompt(request)+"\nRepair ONLY the draft below into the exact JSON contract. Return JSON only.",
        messages:[{role:"user",text:first.text}],preferred:first.provider||"",role:"story",fallback:true});
      const repairedCheck=parseAndValidateStoryPlan(repaired.text,request);
      if(repairedCheck.ok){first=repaired;check=repairedCheck;}
    }catch{}
  }
  if(!check.ok)return json(res,422,{ok:false,error:"Story output failed schema/quality validation; no incomplete script was returned.",validation:check.errors,provider:first.provider||null,attemptedProviders:first.attemptedProviders||[]});
  return json(res,200,{ok:true,text:buildStoryMarkdown(check.plan),story:check.plan,provider:first.provider||null,backend_provider:first.backend_provider||null,model:first.model||null,schemaVersion:check.plan.schemaVersion});
}
