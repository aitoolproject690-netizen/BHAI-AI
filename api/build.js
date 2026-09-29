export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const {platform="android",projectName="BHAI-App",sourceUrl,doIt=false}=req.body||{};
 if(!sourceUrl)return res.status(400).json({error:"sourceUrl is required"});
 const token=process.env.GITHUB_TOKEN;
 const workflow=process.env.APK_BUILD_WORKFLOW||"build-apk.yml";
 const repository=process.env.BHAI_BUILD_REPO||"aitoolproject690-netizen/BHAI-AI";
 const branch=process.env.BHAI_BUILD_BRANCH||"main";
 if(!token)return res.status(503).json({ok:false,error:"GITHUB_TOKEN is required for the real build runner."});
 if(!doIt)return res.status(403).json({ok:false,error:"DO IT mode is OFF"});
 const [owner,repoName]=repository.split("/");
 if(!owner||!repoName)return res.status(500).json({error:"Invalid BHAI_BUILD_REPO"});
 const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"};
 const url="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repoName)+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches";
 const r2=await fetch(url,{method:"POST",headers,body:JSON.stringify({ref:branch,inputs:{platform:String(platform),projectName:String(projectName),sourceUrl:String(sourceUrl)}})});
 if(!r2.ok)return res.status(r2.status).json({ok:false,error:(await r2.text()).slice(0,1000)});
 return res.status(202).json({ok:true,status:"dispatched",runner:"github-actions",repository,workflow,branch,platform,projectName,sourceUrl,verification:"Use workflow run/artifact verification before declaring the APK ready."});
}