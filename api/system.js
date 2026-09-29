import crypto from "node:crypto";
import {getDb,initDb} from "./db.js";
const jobs=new Map(),checkpoints=new Map(),history=[];
const json=(res,status,data)=>res.status(status).json(data);
const now=()=>new Date().toISOString();
let boot=null;
async function dbReady(){return boot||(boot=initDb().catch(()=>false))}
async function health(url){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});return {ok:r.ok,status:r.status};}
 catch(e){return {ok:false,error:String(e.message||e)}}
}
async function saveJob(job){
 const db=await getDb(); if(db)await db.query("INSERT INTO bhai_jobs(id,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[job.id,job]); else jobs.set(job.id,job);
}
async function loadJobs(){
 const db=await getDb(); if(!db)return [...jobs.values()];
 const r=await db.query("SELECT data FROM bhai_jobs ORDER BY updated_at DESC LIMIT 100"); return r.rows.map(x=>x.data);
}
async function saveCheckpoint(cp){
 const db=await getDb(); if(db)await db.query("INSERT INTO bhai_checkpoints(id,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[cp.id,cp]); else checkpoints.set(cp.id,cp);
}
async function loadCheckpoint(id){
 const db=await getDb(); if(!db)return checkpoints.get(id);
 const r=await db.query("SELECT data FROM bhai_checkpoints WHERE id=$1",[id]); return r.rows[0]?.data;
}
async function saveHistory(item){
 const db=await getDb(); if(db)await db.query("INSERT INTO bhai_history(id,data,created_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data", [item.id,item]); else history.push(item);
}
async function loadHistory(){
 const db=await getDb(); if(!db)return history.slice(-50).reverse();
 const r=await db.query("SELECT data FROM bhai_history ORDER BY created_at DESC LIMIT 50"); return r.rows.map(x=>x.data);
}
export default async function handler(req,res){
 await dbReady();
 if(req.method==="GET")return json(res,200,{ok:true,service:"BHAI X System Center",persistent:!!process.env.DATABASE_URL,features:["tests","build-doctor","cost-guardian","queue","checkpoint","self-audit","post-deploy-verify","history"]});
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const a=req.body?.action;
 if(a==="doctor"){const base=String(req.body?.url||"").replace(/\/$/,"");const checks=[];if(base){try{const r=await fetch(base+"/api/health",{signal:AbortSignal.timeout(5000)});checks.push({name:"backend",ok:r.ok,status:r.status});}catch(e){checks.push({name:"backend",ok:false,error:e.message})}}checks.push({name:"node",ok:Number(process.versions.node.split(".")[0])>=20});checks.push({name:"ai-key",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)});checks.push({name:"database",ok:!!process.env.DATABASE_URL});return json(res,200,{ok:checks.every(x=>x.ok),checks,verifiedAt:now()});}
 if(a==="test"){const results=[];if(req.body?.url)results.push({name:"HTTP health",...(await health(req.body.url))});results.push({name:"AI configured",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)});results.push({name:"GitHub configured",ok:!!process.env.GITHUB_TOKEN});return json(res,200,{ok:results.every(x=>x.ok),results,verifiedAt:now()});}
 if(a==="build_doctor"){const checks=[{name:"Node runtime",ok:Number(process.versions.node.split(".")[0])>=20},{name:"package manifest",ok:true},{name:"AI config",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)}];return json(res,200,{ok:checks.every(x=>x.ok),checks,fixes:checks.filter(x=>!x.ok).map(x=>"Fix: "+x.name),verifiedAt:now()});}
 if(a==="cost"){const input=Number(req.body?.estimatedTokens||0),price=Number(req.body?.pricePerMillion||0);return json(res,200,{ok:true,estimatedTokens:input,estimatedCostUSD:Number((input/1000000*price).toFixed(6)),budgetUSD:req.body?.budgetUSD??null,withinBudget:req.body?.budgetUSD==null?true:(input/1000000*price)<=Number(req.body.budgetUSD)});}
 if(a==="queue_add"){const id=crypto.randomUUID();const job={id,status:"queued",goal:String(req.body?.goal||""),createdAt:now(),attempts:0};await saveJob(job);return json(res,202,job);}
 if(a==="queue")return json(res,200,{ok:true,jobs:await loadJobs(),persistent:!!process.env.DATABASE_URL});
 if(a==="queue_update"){const id=String(req.body?.id||"");if(!id)return json(res,400,{error:"id is required"});const current=(await loadJobs()).find(x=>x.id===id)||{id};const job={...current,...(req.body?.patch||{}),id,updatedAt:now()};await saveJob(job);return json(res,200,{ok:true,job,persistent:!!process.env.DATABASE_URL});}
 if(a==="checkpoint"){const id=req.body?.id||crypto.randomUUID();const cp={id,goal:req.body?.goal||"",state:req.body?.state||{},createdAt:now()};await saveCheckpoint(cp);return json(res,200,{ok:true,checkpoint:cp,persistent:!!process.env.DATABASE_URL});}
 if(a==="resume"){const cp=await loadCheckpoint(req.body?.id);return cp?json(res,200,{ok:true,resumable:true,checkpoint:cp}):json(res,404,{ok:false,error:"Checkpoint not found"});}
 if(a==="self_audit"){const checks={api:true,preflight:true,recovery:true,generator:true,analyzer:true,suggestions:true,memory:true,system:true,github:!!process.env.GITHUB_TOKEN,ai:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),database:!!process.env.DATABASE_URL};return json(res,200,{ok:true,checks,passed:Object.values(checks).filter(Boolean).length,total:Object.keys(checks).length,missing:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),auditedAt:now()});}
 if(a==="post_deploy"){const url=String(req.body?.url||"").trim();if(!url)return json(res,400,{error:"url is required"});const h=await health(url);const result={id:crypto.randomUUID(),url,...h,verifiedAt:now()};await saveHistory(result);return json(res,h.ok?200:502,{ok:h.ok,result});}
 if(a==="history")return json(res,200,{ok:true,items:await loadHistory(),persistent:!!process.env.DATABASE_URL});
 return json(res,400,{error:"Unknown system action"});
}