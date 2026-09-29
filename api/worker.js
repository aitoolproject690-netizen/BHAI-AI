import {getDb,initDb} from "./db.js";

const now=()=>new Date().toISOString();

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  await initDb();
  const db=await getDb();
  if(!db)return res.status(503).json({ok:false,error:"DATABASE_URL is required for the persistent worker."});

  const max=Number(req.body?.limit||5);
  const leaseSeconds=Math.min(Math.max(Number(req.body?.leaseSeconds||300),30),1800);
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    const r=await client.query(
      `SELECT id,data FROM bhai_jobs
       WHERE (data->>'status')='queued'
          OR ((data->>'status')='running' AND COALESCE((data->>'leaseUntil')::timestamptz,NOW()) < NOW())
       ORDER BY updated_at ASC
       FOR UPDATE SKIP LOCKED LIMIT $1`,[max]);
    const claimed=[];
    for(const row of r.rows){
      const job=row.data||{};
      const attempts=Number(job.attempts||0)+1;
      const leaseUntil=new Date(Date.now()+leaseSeconds*1000).toISOString();
      const next={...job,status:"running",attempts,leaseUntil,startedAt:job.startedAt||now(),updatedAt:now(),worker:"render-cron"};
      await client.query("UPDATE bhai_jobs SET data=$2,updated_at=NOW() WHERE id=$1",[row.id,next]);
      claimed.push(next);
    }
    await client.query("COMMIT");
    return res.json({ok:true,claimed,workerAt:now(),note:"Jobs are safely leased; execution adapters can process them without arbitrary server code execution."});
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    return res.status(500).json({ok:false,error:e.message});
  }finally{client.release();}
}
