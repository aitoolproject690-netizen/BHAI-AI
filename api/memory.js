const memory=new Map();
export default async function handler(req,res){
 if(req.method==="GET"){const key=String(req.query?.key||"default");return res.json({ok:true,key,data:memory.get(key)||{}})}
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const key=String(req.body?.key||"default");const data=req.body?.data;
 if(data===undefined)return res.status(400).json({error:"data is required"});
 memory.set(key,data);return res.json({ok:true,key,data});
}