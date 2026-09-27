const jobs=new Map();
export default async function handler(req,res){
 if(req.method==="POST"){
  const {type="general",payload={}}=req.body||{};
  const id=crypto.randomUUID(); const job={id,type,payload,status:"queued",createdAt:new Date().toISOString()};
  jobs.set(id,job); return res.status(202).json(job);
 }
 if(req.method==="GET"){
  const id=req.query?.id; if(!id)return res.status(400).json({error:"id is required"});
  return res.status(200).json(jobs.get(id)||{id,status:"unknown"});
 }
 return res.status(405).json({error:"Method not allowed"});
}
