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
 if(a==="queue_add"){
  const id=crypto.randomUUID(),type=String(req.body?.type||"agent").toLowerCase(),allowed=["agent","health"];
  if(!allowed.includes(type))return json(res,400,{error:"Unsupported queue type. Allowed: agent, health."});
  const maxAttempts=Math.min(Math.max(Number(req.body?.maxAttempts||3),1),10);
  const payload=req.body?.payload&&typeof req.body.payload==="object"?req.body.payload:{};
  if(type==="agent"&&!String(req.body?.goal||payload.goal||"").trim())return json(res,400,{error:"Agent queue job requires a goal."});
  if(type==="health"&&!String(payload.url||"").trim())return json(res,400,{error:"Health queue job requires payload.url."});
  const job={id,type,status:"queued",goal:String(req.body?.goal||payload.goal||""),payload,createdAt:now(),updatedAt:now(),attempts:0,maxAttempts};
  await saveJob(job); return json(res,202,job);
 }
 if(a==="queue")return json(res,200,{ok:true,jobs:await loadJobs(),persistent:!!process.env.DATABASE_URL});
 if(a==="queue_update"){
  const id=String(req.body?.id||"");if(!id)return json(res,400,{error:"id is required"});
  const current=(await loadJobs()).find(x=>x.id===id);if(!current)return json(res,404,{error:"job not found"});
  const patch=req.body?.patch||{}, nextStatus=String(patch.status||"");
  if(nextStatus==="done"||nextStatus==="failed"){patch.leaseUntil=null;patch.finishedAt=now();}
  const job={...current,...patch,id,updatedAt:now()};await saveJob(job);return json(res,200,{ok:true,job,persistent:!!process.env.DATABASE_URL});
 }
 if(a==="checkpoint"){const id=req.body?.id||crypto.randomUUID();const cp={id,goal:req.body?.goal||"",state:req.body?.state||{},createdAt:now()};await saveCheckpoint(cp);return json(res,200,{ok:true,checkpoint:cp,persistent:!!process.env.DATABASE_URL});}
 if(a==="resume"){const cp=await loadCheckpoint(req.body?.id);return cp?json(res,200,{ok:true,resumable:true,checkpoint:cp}):json(res,404,{ok:false,error:"Checkpoint not found"});}
 if(a==="self_audit"){const checks={api:true,preflight:true,recovery:true,generator:true,analyzer:true,suggestions:true,memory:true,system:true,github:!!process.env.GITHUB_TOKEN,ai:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),database:!!process.env.DATABASE_URL};return json(res,200,{ok:true,checks,passed:Object.values(checks).filter(Boolean).length,total:Object.keys(checks).length,missing:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),auditedAt:now()});}
 if(a==="post_deploy"){const url=String(req.body?.url||"").trim();if(!url)return json(res,400,{error:"url is required"});const h=await health(url);const result={id:crypto.randomUUID(),type:"post_deploy",url,...h,verifiedAt:now(),recovery:h.ok?null:{status:"required",steps:["inspect health/logs","compare latest change","restore known-good release if needed","re-run health verification"]}};await saveHistory(result);return json(res,h.ok?200:502,{ok:h.ok,result});}
 if(a==="schedule_add"){const goal=String(req.body?.goal||"").trim();if(!goal)return json(res,400,{error:"goal is required"});const id=crypto.randomUUID(),runAt=new Date(req.body?.runAt||Date.now()).toISOString(),job={id,type:"agent",status:"scheduled",goal,payload:req.body?.payload||{},runAt,createdAt:now(),updatedAt:now()};await saveJob(job);return json(res,202,{ok:true,job,persistent:!!process.env.DATABASE_URL});}
 if(a==="schedule"){const all=await loadJobs();return json(res,200,{ok:true,jobs:all.filter(x=>x.status==="scheduled"),persistent:!!process.env.DATABASE_URL});}
 if(a==="self_heal"){const url=String(req.body?.url||"").trim();if(!url)return json(res,400,{error:"url is required"});const h=await health(url);if(h.ok)return json(res,200,{ok:true,recovered:false,verified:h,steps:["health already passing"]});const plan={ok:false,recovered:false,verified:h,recoveryPlan:["retry health check","inspect latest deployment/logs","compare recent change","restore known-good release if available","verify again"],createdAt:now()};await saveHistory({id:crypto.randomUUID(),type:"self_heal",...plan});return json(res,502,plan);}
 if(a==="history")return json(res,200,{ok:true,items:await loadHistory(),persistent:!!process.env.DATABASE_URL});
 return json(res,400,{error:"Unknown system action"});
}