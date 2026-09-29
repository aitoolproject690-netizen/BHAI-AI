import crypto from "node:crypto";
import {requireSession} from "./_utils.js";
import {getDb,initDb} from "./db.js";
const json=(res,s,d)=>res.status(s).json(d);
const keyOf=v=>String(v||"default").trim().slice(0,200)||"default";
const arr=v=>Array.isArray(v)?v.filter(Boolean).map(x=>String(x)):v;
function mergeDNA(current,incoming){
 const base=current&&typeof current==="object"&&!Array.isArray(current)?current:{};
 const next=incoming&&typeof incoming==="object"&&!Array.isArray(incoming)?incoming:{};
 const data={...base,...next};
 for(const k of ["languages","frameworks","dependencies","commands","entrypoints","services","envKeys","files","decisions","risks","knownIssues","verifiedChecks"]){
  if(k in next){
   const values=arr(next[k]);
   if(Array.isArray(values))data[k]=[...new Set([...(Array.isArray(base[k])?base[k]:[]),...values])].slice(-200);
  }
 }
 data.updatedAt=new Date().toISOString();
 data.revision=crypto.randomUUID();
 return data;
}
export default async function handler(req,res){
 await initDb().catch(()=>false);
 const key=keyOf(req.query?.project||req.body?.project);
 const db=await getDb();
 if(req.method==="GET"){
  const account=await requireSession(req,res);if(!account)return;
  if(db){const r=await db.query("SELECT data,updated_at FROM bhai_dna WHERE project_key=$1",[key]);return json(res,200,{ok:true,project:key,data:r.rows[0]?.data||{},updatedAt:r.rows[0]?.updated_at||null,persistent:true});}
  return json(res,200,{ok:true,project:key,data:{},updatedAt:null,persistent:false});
 }
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const account=await requireSession(req,res);if(!account)return;
 const incoming=req.body?.data;
 if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))return json(res,400,{error:"data object is required"});
 const current=db?(await db.query("SELECT data FROM bhai_dna WHERE project_key=$1",[key])).rows[0]?.data||{}:{};
 const data=mergeDNA(current,incoming);
 if(db)await db.query("INSERT INTO bhai_dna(project_key,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(project_key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[key,data]);
 return json(res,200,{ok:true,project:key,data,persistent:!!db});
}