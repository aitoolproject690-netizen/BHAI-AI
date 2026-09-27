export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const {name,content}=req.body||{};
  if(!name||typeof content!=="string") return res.status(400).json({error:"name and text content are required"});
  if(content.length>100000) return res.status(413).json({error:"File too large"});
  return res.status(200).json({ok:true,name,size:content.length,preview:content.slice(0,500),message:"File received by BHAI AI."});
}
