const json=(res,status,data)=>res.status(status).json(data);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function checkGemini(){
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key)return {configured:false,ok:false,reason:"Gemini API key is not configured"};
 try{const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models",{headers:{"x-goog-api-key":key}});const d=await r.json();if(!r.ok)return {configured:true,ok:false,reason:d?.error?.message||"Gemini model discovery failed"};const models=(d.models||[]).filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent")).map(m=>String(m.name||"").replace(/^models\\//,""));return {configured:true,ok:models.length>0,models,selected:models[0]||null};}catch(e){return {configured:true,ok:false,reason:e.message};}
}
async function checkUrl(url){try{const r=await fetch(url,{method:"GET",signal:AbortSignal.timeout(7000)});return {ok:r.ok,status:r.status};}catch(e){return {ok:false,reason:e.message};}}
export default async function handler(req,res){
 if(req.method!=="GET")return json(res,405,{error:"Method not allowed"});
 const [gemini,api]=await Promise.all([checkGemini(),checkUrl("https://bhai-ai-vpna.onrender.com/api/health")]);
 const checks={gemini,backend:api,github:{configured:!!process.env.GITHUB_TOKEN},render:{configured:!!process.env.RENDER_API_KEY},database:{configured:!!process.env.DATABASE_URL}};
 const risks=[];
 if(!gemini.ok)risks.push({id:"ai",severity:"high",message:gemini.reason||"No compatible Gemini model available"});
 if(!api.ok)risks.push({id:"backend",severity:"high",message:"Backend health check failed"});
 if(!checks.github.configured)risks.push({id:"github",severity:"medium",message:"GitHub write tools are not configured"});
 return json(res,200,{ok:risks.every(x=>x.severity!=="high"),checks,risks,ready:risks.every(x=>x.severity!=="high"),recommendations:risks.map(x=>x.id==="ai"?"Use a discovered compatible Gemini model or connect another AI provider":x.id==="github"?"Connect GitHub before repository write tasks":"Retry the service health check before starting the task")});
}
