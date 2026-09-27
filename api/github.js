export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const token=process.env.GITHUB_TOKEN; if(!token)return res.status(503).json({error:"GitHub is not configured. Add GITHUB_TOKEN on the server."});
  const {action,owner,repo,path,content,branch="main",doIt=false}=req.body||{};
  if(!owner||!repo)return res.status(400).json({error:"owner and repo are required"});
  const base="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
  const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  try{
    if(action==="info"){
      const r=await fetch(base,{headers});const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d.message||"GitHub request failed"});
      return res.status(200).json({name:d.full_name,private:d.private,default_branch:d.default_branch,html_url:d.html_url});
    }
    if(action==="read"){
      if(!path)return res.status(400).json({error:"path is required"});
      const r=await fetch(base+"/contents/"+path+"?ref="+encodeURIComponent(branch),{headers});const d=await r.json();
      if(!r.ok)return res.status(r.status).json({error:d.message||"GitHub request failed"});
      if(Array.isArray(d))return res.status(200).json({type:"directory",items:d.map(x=>({name:x.name,path:x.path,type:x.type}))});
      return res.status(200).json({type:"file",path:d.path,sha:d.sha,content:Buffer.from(d.content||"","base64").toString("utf8")});
    }
    if(action==="update"){
      if(!doIt)return res.status(403).json({error:"DO IT mode is OFF"});
      if(!path||typeof content!=="string")return res.status(400).json({error:"path and content are required"});
      if(content.length>500000)return res.status(413).json({error:"File too large"});
      const current=await fetch(base+"/contents/"+path+"?ref="+encodeURIComponent(branch),{headers});let sha;
      if(current.ok)sha=(await current.json()).sha;
      const body={message:"BHAI AI: update "+path,content:Buffer.from(content,"utf8").toString("base64"),branch};if(sha)body.sha=sha;
      const r=await fetch(base+"/contents/"+path,{method:"PUT",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});const d=await r.json();
      if(!r.ok)return res.status(r.status).json({error:d.message||"GitHub update failed"});
      return res.status(200).json({ok:true,path,commit:d.commit?.sha||null});
    }
    return res.status(400).json({error:"Unknown action. Use info, read or update."});
  }catch(e){return res.status(500).json({error:e.message||"GitHub server error"});}
}
