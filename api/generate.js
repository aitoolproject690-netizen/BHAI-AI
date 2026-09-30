import {requireSession} from "./_utils.js";
import {generateWithRouter} from "./aiRouter.js";
const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const account=await requireSession(req,res);if(!account)return;
 const {request="",language="javascript",filename="generated.txt",preferred=""}=req.body||{};
 if(!String(request).trim())return json(res,400,{error:"request is required"});
 const prompt="Generate production-ready "+language+" code for this request: "+request+
   " Return JSON with keys code, explanation, files. Do not use markdown fences.";
 try{
  const result=await generateWithRouter({
   task:"code generation: "+request,
   system:"You are BHAI X Code Builder. Return ONLY valid JSON with keys code, explanation, files. files must be an array of {path,content}. Preserve requested behavior and do not invent dependencies.",
   messages:[{role:"user",text:prompt}],
   preferred,
   role:"code",
   fallback:true
  });
  let parsed;
  try{
   parsed=JSON.parse(String(result.text).replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim());
  }catch{
   parsed={code:String(result.text),explanation:"AI returned source text; wrapped as generated code.",files:[]};
  }
  const files=Array.isArray(parsed.files)&&parsed.files.length?parsed.files:[{path:filename,content:parsed.code||String(result.text)}];
  return json(res,200,{ok:true,provider:result.provider,model:result.model,code:parsed.code||files[0]?.content||"",explanation:parsed.explanation||"",files});
 }catch(e){
  return json(res,502,{error:"All configured code-generation AI providers failed: "+String(e.message||e).slice(0,500)});
 }
}
