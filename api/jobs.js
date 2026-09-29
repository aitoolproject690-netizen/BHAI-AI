import crypto from "node:crypto";
import {requireSession} from "./_utils.js";
import {getDb,initDb} from "./db.js";
const memory=new Map();
let ready=null;
const boot=()=>ready||(ready=initDb().catch(()=>false));
const now=()=>new Date().toISOString();
async function save(job){
 const db=await getDb();
 if(db)await db.query("INSERT INTO bhai_jobs(id,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[job.id,job]);
 else memory.set(job.id,job);
 return !!db;
}
async function get(id){
 const db=await getDb();
 if(db){const r=await db.query("SELECT data FROM bhai_jobs WHERE id=$1",[id]);return r.rows[0]?.data;}
 return memory.get(id);
}
export default async function handler(req,res){
 if(!await requireSession(req,res))return;
 await boot();
 if(req.method==="POST"){
  const body=req.body||{}, id=crypto.randomUUID();
  const job={id,type:String(body.type||"general"),payload:body.payload||{},status:"queued",attempts:0,createdAt:now(),updatedAt:now()};
  const persistent=await save(job);
  return res.status(202).json({...job,persistent});
 }
 if(req.method==="GET"){
  const id=req.query?.id;
  if(!id)return res.status(400).json({error:"id is required"});
  const job=await get(id);
  return res.status(200).json(job||{id,status:"unknown"});
 }
 if(req.method==="PATCH"){
  const id=String(req.body?.id||""); if(!id)return res.status(400).json({error:"id is required"});
  const current=await get(id); if(!current)return res.status(404).json({error:"job not found"});
  const job={...current,...(req.body?.patch||{}),id,updatedAt:now()};
  const persistent=await save(job); return res.status(200).json({ok:true,job,persistent});
 }
 return res.status(405).json({error:"Method not allowed"});
}