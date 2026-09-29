import crypto from "node:crypto";
import {requireSession} from "./_utils.js";
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"}); if(!await requireSession(req,res))return;
  const {type,payload={}}=req.body||{}; const allowed=["plan","github","web","build","file"];
  if(!allowed.includes(type)) return res.status(400).json({error:"Unsupported task type"});
  return res.status(202).json({task:{id:crypto.randomUUID(),status:"queued",type,payload,createdAt:new Date().toISOString()}});
}
