export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const {platform="android",projectName="BHAI-App",sourceUrl}=req.body||{};
 if(!sourceUrl)return res.status(400).json({error:"sourceUrl is required"});
 return res.status(202).json({ok:true,status:"queued",message:"Build job created. A connected build runner is required to produce the APK.",platform,projectName,sourceUrl,jobId:crypto.randomUUID()});
}
