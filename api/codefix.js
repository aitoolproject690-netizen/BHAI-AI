import {json,requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";

export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const account=await requireSession(req,res);if(!account)return;
 const {code="",language="javascript",mode="fix",filename="",preferred=""}=req.body||{};
 if(typeof code!=="string"||!code.trim())return json(res,400,{error:"Code is required"});
 if(code.length>200000)return json(res,413,{error:"Code is too large. Maximum 200,000 characters."});
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
 try{
  const result=await generateWithRouter({
   task:"code fix "+mode+": "+filename+"\n"+code.slice(0,12000),
   system:"You are BHAI X's specialist code-fixing AI. Follow the requested JSON contract exactly.",
   messages:[{role:"user",text:prompt}],
   preferred,
   role:"code",
   fallback:true
  });
  const cleaned=String(result.text).replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim();
  const out=JSON.parse(cleaned);
  if(!out.fixedCode)throw new Error("AI returned no fixedCode");
  return json(res,200,{...out,provider:result.provider,model:result.model});
 }catch(e){
  return json(res,502,{error:"All configured code-fixing AI providers failed: "+String(e.message||e).slice(0,500)});
 }
}
