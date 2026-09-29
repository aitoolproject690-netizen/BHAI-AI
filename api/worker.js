import {getDb,initDb} from "./db.js";

const now=()=>new Date().toISOString();

async function updateJob(db,job,patch){
 const next={...job,...patch,updatedAt:now()};
 await db.query("UPDATE bhai_jobs SET data=$2,updated_at=NOW() WHERE id=$1",[job.id,next]);
 return next;
}

async function executeAgent(req,job){
 const base=String(process.env.RENDER_EXTERNAL_URL||process.env.BHAI_PUBLIC_URL||"").replace(/\/$/,"");
 const host=base||(`${req.headers["x-forwarded-proto"]||"https"}://${req.headers.host}`);
 const goal=String(job.goal||job.payload?.goal||"").trim();
 if(!goal)throw new Error("Agent job requires a goal.");
 const messages=Array.isArray(job.payload?.messages)&&job.payload.messages.length?job.payload.messages:[{role:"user",text:goal}];
 const r=await fetch(host+"/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages,doIt:job.payload?.doIt===true})});
 const data=await r.json().catch(()=>({error:"Invalid agent response"}));
 if(!r.ok)throw new Error(data?.error||`Agent returned HTTP ${r.status}`);
 return data;
}

export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const expected=String(process.env.BHAI_WORKER_SECRET||"");
 const supplied=String(req.headers["x-bhai-worker"]||req.body?.workerSecret||"");
 if(!expected||supplied!==expected)return res.status(401).json({ok:false,error:"Worker authentication required."});
 await initDb();
 const db=await getDb();
 if(!db)return res.status(503).json({ok:false,error:"DATABASE_URL is required for the persistent worker."});
 const max=Math.min(Math.max(Number(req.body?.limit||5),1),20);
 const leaseSeconds=Math.min(Math.max(Number(req.body?.leaseSeconds||300),30),1800);
 const client=await db.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(`SELECT id,data FROM bhai_jobs WHERE (data->>'status')='queued' OR ((data->>'status')='running' AND COALESCE((data->>'leaseUntil')::timestamptz,NOW()) < NOW()) ORDER BY updated_at ASC FOR UPDATE SKIP LOCKED LIMIT $1`,[max]);
  const claimed=[];
  for(const row of r.rows){
   const job=row.data||{},attempts=Number(job.attempts||0)+1,leaseUntil=new Date(Date.now()+leaseSeconds*1000).toISOString();
   const next={...job,status:"running",attempts,leaseUntil,startedAt:job.startedAt||now(),updatedAt:now(),worker:"safe-adapter"};
   await client.query("UPDATE bhai_jobs SET data=$2,updated_at=NOW() WHERE id=$1",[row.id,next]);claimed.push(next);
  }
  await client.query("COMMIT");
  const results=[];
  for(const job of claimed){
   try{
    let result;
    if(job.type==="agent")result=await executeAgent(req,job);
    else if(job.type==="health"){
     const url=String(job.payload?.url||"").trim();if(!url)throw new Error("Health job requires payload.url.");
     const r=await fetch(url,{signal:AbortSignal.timeout(10000)});result={ok:r.ok,status:r.status};
    }else throw new Error("Unsupported queue job type. Allowed adapters: agent, health.");
    results.push(await updateJob(db,job,{status:"done",leaseUntil:null,finishedAt:now(),result}));
   }catch(error){
    const retry=Number(job.attempts||1)<Number(job.maxAttempts||3);
    results.push(await updateJob(db,job,{status:retry?"queued":"failed",leaseUntil:null,error:String(error?.message||error).slice(0,1000),lastFailedAt:now()}));
   }
  }
  return res.json({ok:true,claimed:results,workerAt:now(),executed:true,adapters:["agent","health"]});
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});return res.status(500).json({ok:false,error:e.message});
 }finally{client.release();}
}
