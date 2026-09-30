import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";
const json=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;
 const {serviceId=process.env.RENDER_SERVICE_ID,commit="",reason="BHAI X deployment",doIt=false}=req.body||{};
 if(!serviceId)return json(res,400,{error:"RENDER_SERVICE_ID is required"});
 if(!doIt)return json(res,403,{ok:false,error:"DO IT mode is OFF"});
 let guard={risk:"unknown"};
 try{
  const r=await generateWithRouter({task:"deployment preflight: "+serviceId,system:"Return ONLY JSON {risk,checks,advice}. risk=low|medium|high. Never claim deployment success.",messages:[{role:"user",text:JSON.stringify({serviceId,commit,reason})}],role:"reviewer",fallback:true});
  guard={...JSON.parse(String(r.text).replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim()),provider:r.provider,model:r.model};
 }catch(e){guard={risk:"unknown",checks:["AI deploy guard unavailable"],advice:[String(e.message||e).slice(0,240)]};}
 if(guard.risk==="high")return json(res,422,{ok:false,stage:"preflight",guard});
 const key=process.env.RENDER_API_KEY;if(!key)return json(res,503,{ok:false,stage:"dispatch",guard,error:"RENDER_API_KEY is not configured. AI Deploy Guard is ready, but real Render deployment credentials are missing."});
 try{
  const r=await fetch("https://api.render.com/v1/services/"+encodeURIComponent(serviceId)+"/deploys",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({clearCache:false})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.message||d?.error||"Render deployment request failed.");
  let live=d;
  for(let i=0;i<24;i++){
   await new Promise(r=>setTimeout(r,5000));
   const rr=await fetch("https://api.render.com/v1/services/"+encodeURIComponent(serviceId)+"/deploys/"+encodeURIComponent(d.id),{headers:{Authorization:"Bearer "+key}});
   live=await rr.json().catch(()=>({}));
   if(["live","build_failed","deactivated"].includes(live.status))break;
  }
  if(live.status!=="live") return json(res,502,{ok:false,status:"deploy-failed",stage:"deploy",serviceId,commit,guard,deploy:live,verification:"Render deployment did not reach live; DONE is blocked."});
  const base=process.env.BHAI_PUBLIC_URL||"https://bhai-ai-vpna.onrender.com";
  try{
   const hr=await fetch(base+"/api/health",{signal:AbortSignal.timeout(10000)});
   if(!hr.ok)return json(res,502,{ok:false,status:"health-failed",stage:"health",serviceId,commit,guard,deploy:live,verification:"Deploy reached live but health check failed."});
  }catch(e){return json(res,502,{ok:false,status:"health-failed",stage:"health",serviceId,commit,guard,deploy:live,error:String(e.message||e).slice(0,300),verification:"Live deployment could not be health-verified."});}
  return json(res,200,{ok:true,status:"complete",stage:"deploy",serviceId,commit,guard,deploy:live,verification:"Render deployment reached live and /api/health passed."});
 }catch(e){return json(res,502,{ok:false,stage:"dispatch",guard,error:String(e.message||e).slice(0,1000)});}
}