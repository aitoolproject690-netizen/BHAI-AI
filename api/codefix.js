import {json,requireSession} from "./_utils.js";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const models=()=>[process.env.GEMINI_MODEL,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.5-flash-lite"].filter((m,i,a)=>m&&!a.slice(0,i).includes(m));
const transient=e=>/429|RESOURCE_EXHAUSTED|quota|rate.?limit|high demand|temporarily unavailable|try again later|overloaded/i.test(String(e?.message||e));
async function call(key,model,prompt){
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.15,responseMimeType:"application/json"}})});
 const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Gemini request failed");
 return d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});\n const account=await requireSession(req,res);if(!account)return;
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;if(!key)return json(res,503,{error:"AI provider is not configured. Add GEMINI_API_KEY in Render Environment."});
 const {code="",language="javascript",mode="fix",filename=""}=req.body||{};
 if(typeof code!=="string"||!code.trim())return json(res,400,{error:"Code is required"});if(code.length>200000)return json(res,413,{error:"Code is too large. Maximum 200,000 characters."});
 const prompt=`You are BHAI X Code Fixer, a senior software engineer and security reviewer.
Return ONLY valid JSON with keys fixedCode, explanation, issues, security, changes.
language: ${language}
mode: ${mode}
filename: ${filename||"untitled"}
Rules:
- Preserve intended behavior unless unsafe or clearly broken.
- Fix mode: repair evident syntax, runtime and logic issues.
- Optimize mode: improve clarity/performance without unnecessary rewrites.
- Security mode: identify and repair security issues such as injection, unsafe secrets and missing validation.
- fixedCode contains ONLY source code, no markdown fences.
- explanation is concise Hinglish.
- issues, security, changes are arrays of short strings.
- Do not invent missing project files or dependencies.
SOURCE:
${code}`;
 let last;
 for(const model of models())for(let attempt=0;attempt<3;attempt++)try{
   const raw=await call(key,model,prompt);const cleaned=raw.replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim();const out=JSON.parse(cleaned);
   if(!out.fixedCode)throw new Error("AI returned no fixedCode");return json(res,200,{...out,model});
 }catch(e){last=e;if(!transient(e))return json(res,502,{error:e.message});if(attempt<2)await sleep(900*(attempt+1));}
 return json(res,502,{error:last?.message||"All AI models are temporarily unavailable."});
}
