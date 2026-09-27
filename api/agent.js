const json=(res,status,data)=>res.status(status).json(data);

async function webSearch(q){
 const r=await fetch("https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),{headers:{"User-Agent":"Mozilla/5.0 BHAI-AI/1.0"}});
 const html=await r.text(); if(!r.ok) throw new Error("Web search failed");
 const out=[]; const re=/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g; let m;
 while((m=re.exec(html))&&out.length<8){
  const title=m[2].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
  const url=m[1].replace(/&amp;/g,"&"); const tail=html.slice(m.index,m.index+5000);
  const sm=tail.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
  const snippet=(sm?sm[1]:"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
  if(title&&url) out.push({title,url,snippet});
 } return out;
}

async function github(action,a){
 const token=process.env.GITHUB_TOKEN;
 const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
 if(token) h.Authorization="Bearer "+token;
 if(!a.owner||!a.repo) throw new Error("GitHub owner and repo are required.");
 const base="https://api.github.com/repos/"+encodeURIComponent(a.owner)+"/"+encodeURIComponent(a.repo),branch=a.branch||"main";
 if(action==="github_info"){
  const r=await fetch(base,{headers:h}),d=await r.json(); if(!r.ok) throw new Error(d.message||"GitHub request failed");
  return{name:d.full_name,default_branch:d.default_branch,private:d.private,url:d.html_url};
 }
 if(action==="github_read"){
  const r=await fetch(base+"/contents/"+a.path+"?ref="+encodeURIComponent(branch),{headers:h}),d=await r.json();
  if(!r.ok) throw new Error(d.message||"GitHub read failed");
  if(Array.isArray(d)) return{type:"directory",items:d.map(x=>({name:x.name,path:x.path,type:x.type}))};
  return{type:"file",path:d.path,sha:d.sha,content:Buffer.from(d.content||"","base64").toString("utf8")};
 }
 if(action==="github_update"){
  if(!token) throw new Error("GitHub write access is not configured. Add GITHUB_TOKEN in Render to let BHAI AI modify repositories.");
  if(!a.doIt) throw new Error("DO IT mode is OFF; enable DO IT before executing GitHub changes.");
  if(!a.path||typeof a.content!=="string") throw new Error("path and content are required");
  if(a.content.length>500000) throw new Error("File is too large for direct agent update.");
  let sha; const c=await fetch(base+"/contents/"+a.path+"?ref="+encodeURIComponent(branch),{headers:h});
  if(c.ok) sha=(await c.json()).sha;
  const body={message:"BHAI AI: update "+a.path,content:Buffer.from(a.content,"utf8").toString("base64"),branch}; if(sha) body.sha=sha;
  const r=await fetch(base+"/contents/"+a.path,{method:"PUT",headers:{"Content-Type":"application/json",...h},body:JSON.stringify(body)}),d=await r.json();
  if(!r.ok) throw new Error(d.message||"GitHub update failed");
  return{ok:true,path:a.path,commit:d.commit?.sha||null};
 }
 throw new Error("Unsupported tool");
}

const toolDefinitions=[
 {name:"web_search",description:"Search public web for current information.",parameters:{type:"OBJECT",properties:{query:{type:"STRING",description:"Search query"}},required:["query"]}},
 {name:"github_info",description:"Get GitHub repository information.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"}},required:["owner","repo"]}},
 {name:"github_read",description:"Read a GitHub file or directory.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path"]}}
];
if(process.env.GITHUB_TOKEN) toolDefinitions.push({name:"github_update",description:"Create or replace a GitHub text file. Only use when DO IT is ON and the user clearly requested the change.",parameters:{type:"OBJECT",properties:{owner:{type:"STRING"},repo:{type:"STRING"},path:{type:"STRING"},content:{type:"STRING"},branch:{type:"STRING"}},required:["owner","repo","path","content"]}});

function toGeminiContents(messages){
 return messages.filter(m=>m&&["user","assistant"].includes(m.role)).map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:String(m.text||"")}] }));
}

async function geminiGenerate(apiKey,model,system,contents){
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(apiKey),{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,tools:[{functionDeclarations:toolDefinitions}],generationConfig:{temperature:0.2}})
 });
 const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||"Gemini API request failed"); return d;
}

export default async function handler(req,res){
 if(req.method!=="POST") return json(res,405,{error:"Method not allowed"});
 const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
 if(!key) return json(res,503,{error:"AI provider is not configured. Add GEMINI_API_KEY in Render Environment."});
 const {messages=[],doIt=false}=req.body||{},activity=[];
 const system=`You are BHAI AI, a practical personal work agent. Reply in Hinglish when the user does. Be concise and action-oriented. DO IT mode is ${doIt?"ON":"OFF"}. You have real tools: web search and GitHub. Use tools when useful. For repository inspection, make the minimum necessary tool calls; prefer reading a directory first and then only the key files needed to answer. Do not repeatedly inspect the same path or repeat an identical tool call. If a tool already returned the needed information, use that result. When implementing a feature, inspect only the files required for that feature, then make the requested changes. Never claim an action happened unless the tool result confirms it. For destructive or irreversible actions, ask for confirmation first. GitHub changes require DO IT mode ON and a clear user request. After the requested changes are successfully written, stop using tools and report the changed files and commit result.`;
 let contents=toGeminiContents(messages).slice(-20);
 // Default to the free-tier Gemini 3.5 Flash-Lite model. GEMINI_MODEL can override it in Render.
 const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
 const seenCalls=new Set();\n for(let round=0;round<12;round++){
  let d; try{d=await geminiGenerate(key,model,system,contents)}catch(e){return json(res,502,{error:e.message})}
  const candidate=d.candidates?.[0],parts=candidate?.content?.parts||[];
  const calls=parts.filter(p=>p.functionCall).map(p=>p.functionCall);
  if(!calls.length){
   const text=parts.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
   return json(res,200,{text:text||"No response received.",activity});
  }
  contents.push(candidate.content);
  const responseParts=[];
  for(const call of calls){
   const name=call.name,a={...(call.args||{}),doIt}; activity.push({tool:name,state:"running"});
   try{
    const result=name==="web_search"?await webSearch(a.query):await github(name,a);
    activity[activity.length-1].state="done";
    responseParts.push({functionResponse:{name,response:{result}}});
   }catch(e){
    activity[activity.length-1].state="failed";
    responseParts.push({functionResponse:{name,response:{error:e.message}}});
   }
  }
  contents.push({role:"user",parts:responseParts});
 }
 return json(res,500,{error:"Tool loop limit reached after 12 tool rounds. The agent stopped safely to avoid an endless tool loop.",activity});
}
