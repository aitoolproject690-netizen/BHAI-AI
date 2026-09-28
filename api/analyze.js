const json=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const {files=[]}=req.body||{};if(!Array.isArray(files)||!files.length)return json(res,400,{error:"files array is required"});
 const safe=files.slice(0,300).map(f=>({path:String(f.path||""),size:String(f.content||"").length}));
 const ext=p=>String(p).split(".").pop().toLowerCase();const counts={};for(const f of safe)counts[ext(f.path)]=(counts[ext(f.path)]||0)+1;
 const risky=safe.filter(f=>/\.env$|secret|password|token|private/i.test(f.path)).map(f=>f.path);
 return json(res,200,{ok:true,summary:{files:safe.length,totalBytes:safe.reduce((n,x)=>n+x.size,0),extensions:counts},risks:risky.map(path=>({severity:"high",path,message:"Potential secret/config file detected; do not expose contents."})),next:["Inspect dependency manifests","Run syntax/tests","Check environment variables","Create checkpoint before modifications"]});
}