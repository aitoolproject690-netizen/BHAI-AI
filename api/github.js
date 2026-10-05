import {requireSession} from "./_utils.js";
import {githubConfigured,githubApiJson,assertGithubName,assertGithubPath,assertGithubRef,encodeGithubPath,githubRepoUrl} from "./githubExecutor.js";

export default async function handler(req,res){
 const account=await requireSession(req,res);if(!account)return;
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const body=req.body||{},action=String(body.action||"").trim(),owner=String(body.owner||"").trim(),repo=String(body.repo||"").trim();
 if(!["info","read","update"].includes(action))return res.status(400).json({error:"Unknown action. Use info, read or update."});
 if(!owner||!repo)return res.status(400).json({error:"owner and repo are required."});
 try{
  if(!githubConfigured())return res.status(503).json({error:"GitHub is not configured on the server."});
  const safeOwner=assertGithubName(owner,"GitHub owner"),safeRepo=assertGithubName(repo,"GitHub repository"),branch=assertGithubRef(body.branch||"main");
  if(action==="info"){const d=await githubApiJson(githubRepoUrl(safeOwner,safeRepo));return res.status(200).json({name:d.full_name,private:d.private,default_branch:d.default_branch,html_url:d.html_url,permissions:d.permissions||null});}
  const path=assertGithubPath(body.path,{required:true}),contents=githubRepoUrl(safeOwner,safeRepo,"/contents/"+encodeGithubPath(path)+"?ref="+encodeURIComponent(branch));
  if(action==="read"){const d=await githubApiJson(contents);if(Array.isArray(d))return res.status(200).json({type:"directory",items:d.map(x=>({name:x.name,path:x.path,type:x.type}))});return res.status(200).json({type:"file",path:d.path,sha:d.sha,content:Buffer.from(d.content||"","base64").toString("utf8")});}
  if(typeof body.content!=="string")return res.status(400).json({error:"path and content are required"});
  if(Buffer.byteLength(body.content,"utf8")>500000)return res.status(413).json({error:"File too large"});
  let sha;try{const current=await githubApiJson(contents);sha=Array.isArray(current)?undefined:current?.sha;}catch(e){if(Number(e?.status)!==404)throw e;}
  const d=await githubApiJson(githubRepoUrl(safeOwner,safeRepo,"/contents/"+encodeGithubPath(path)),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"BHAI AI: update "+path,content:Buffer.from(body.content,"utf8").toString("base64"),branch,...(sha?{sha}:{})})});
  return res.status(200).json({ok:true,path,commit:d?.commit?.sha||null,verifiedWrite:Boolean(d?.commit?.sha)});
 }catch(e){const status=Number(e?.status)||500;return res.status(status>=400&&status<600?status:500).json({error:String(e?.message||"GitHub server error").slice(0,1000)});}
}
