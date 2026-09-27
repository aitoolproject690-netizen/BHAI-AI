export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const {type,payload={}}=req.body||{};
  const allowed=["plan","github"];
  if(!allowed.includes(type)) return res.status(400).json({error:"Unsupported task type"});
  const task={id:crypto.randomUUID(),status:"queued",type,payload,createdAt:new Date().toISOString()};
  return res.status(200).json({task});
}