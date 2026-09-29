import {requireSession} from "./_utils.js";\nconst json=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const account=await requireSession(req,res);if(!account)return;
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key)return json(res,503,{error:"AI provider is not configured"});
 const {request="",language="javascript",filename="generated.txt"}=req.body||{};
 if(!String(request).trim())return json(res,400,{error:"request is required"});
 let models=[];
 try{const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models?key="+encodeURIComponent(key));const d=await r.json();if(r.ok)models=(d.models||[]).filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent")).map(m=>String(m.name||"").split("models/").pop()).filter(Boolean)}catch{}
 if(process.env.GEMINI_MODEL)models.unshift(process.env.GEMINI_MODEL);
 const prompt="Generate production-ready "+language+" code for this request: "+request+" Return JSON with keys code, explanation, files. Do not use markdown fences.";
 for(const model of [...new Set(models)].slice(0,8)){try{
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.2,responseMimeType:"application/json"}})});
  const d=await r.json();if(!r.ok)continue;
  const raw=d?.candidates?.[0]?.content?.parts?.find(p=>p.text)?.text||"{}";const p=JSON.parse(raw.replace(/^\`\`\`json\s*|\`\`\`$/g,"").trim());
  return json(res,200,{ok:true,model,code:p.code||"",explanation:p.explanation||"",files:Array.isArray(p.files)&&p.files.length?p.files:[{path:filename,content:p.code||""}]});
 }catch{}}
 return json(res,502,{error:"No compatible AI model completed the generation request"});
}