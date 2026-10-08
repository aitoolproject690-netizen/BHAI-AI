import crypto from "node:crypto";
import {initDb,getDb} from "./db.js";
import {internalHeaders} from "./internalAuth.js";

const TERMINAL=new Set(["completed","failed","cancelled"]);
const MAX_EVENTS=60;
const DEFAULT_MAX_ATTEMPTS=3;
const DEFAULT_LEASE_SECONDS=900;
const POLL_MS=1200;
const MAX_CONCURRENCY=1;

let timer=null;
let tickRunning=false;
let active=0;
let lastTickAt=null;
let runnerStartedAt=null;

const now=()=>new Date().toISOString();
const ownerKey=account=>String(account?.id||account?.email||"").slice(0,300);

export const JOB_STATES={
  scheduled:"scheduled",
  queued:"queued",
  running:"running",
  verifying:"verifying",
  completed:"completed",
  failed:"failed",
  cancelled:"cancelled"
};

export function canTransition(from,to){
  const f=String(from||"queued"),t=String(to||"");
  if(f===t)return true;
  const allowed={
    scheduled:new Set(["queued","cancelled"]),
    queued:new Set(["running","cancelled"]),
    running:new Set(["queued","verifying","cancelled","failed"]),
    verifying:new Set(["completed","queued","failed","cancelled"]),
    completed:new Set(),
    failed:new Set(),
    cancelled:new Set()
  };
  return Boolean(allowed[f]?.has(t));
}

export function retryDelayMs(attempt){
  const n=Math.max(1,Number(attempt)||1);
  return Math.min(30000,1500*Math.pow(2,n-1));
}

export function verifyJobResult(type,result){
  if(!result||typeof result!=="object")return {ok:false,reason:"Job executor returned no structured result."};
  if(result.ok===false)return {ok:false,reason:String(result.error||result.text||"Executor reported failure.")};
  if(type==="health"){
    return result.ok===true?{ok:true,reason:"HTTP health verification passed."}:{ok:false,reason:"Health check did not pass."};
  }
  if(type==="build"){
    const passed=result.conclusion==="success" && result.artifactVerified===true;
    return passed?{ok:true,reason:"GitHub Actions build and artifact verification passed."}:{ok:false,reason:"Build or artifact verification failed."};
  }
  if(type==="deploy"){
    return result.ok===true && result.status==="complete" && result.healthVerified===true
      ?{ok:true,reason:"Render deployment reached live and health verification passed."}
      :{ok:false,reason:"Deployment/live health proof is incomplete."};
  }
  if(type==="mission"||type==="agent"){
    return result.ok===true && result.verified!==false
      ?{ok:true,reason:"Executor returned an explicit successful result without an unverified flag."}
      :{ok:false,reason:"Executor result is not verified."};
  }
  return result.ok===true?{ok:true,reason:"Executor returned ok=true."}:{ok:false,reason:"Executor did not return ok=true."};
}

function appendEvent(job,event){
  const next=[...(Array.isArray(job.events)?job.events:[])].slice(-(MAX_EVENTS-1));
  next.push({at:now(),...event});
  return next;
}

function buildCheckpoint(job,result=null,{message="",progress=null,phase=null,tool=null}={}){
  const activity=Array.isArray(result?.activity)?result.activity.at(-1):null;
  return {phase:String(phase||activity?.state||job.type||"execution").slice(0,80),tool:String(tool||activity?.tool||job.type||"executor").slice(0,120),progress:Math.min(95,Math.max(0,Number(progress??job.progress)||0)),message:String(message||activity?.details||"Execution checkpoint").slice(0,600),at:now(),attempt:Number(job.attempts||0),proofRequired:Boolean(job.type==="mission"||job.type==="agent"||job.type==="build"||job.type==="deploy")};
}

function compactResult(result){
  if(!result||typeof result!=="object")return {value:String(result??"")};
  const out={};
  for(const key of ["ok","status","text","verified","verification","provider","backend_provider","model","commit","completed","remaining","runId","conclusion","artifactVerified","healthVerified","error","verificationSummary"]){
    if(result[key]!==undefined)out[key]=result[key];
  }
  if(Array.isArray(result.activity))out.activity=result.activity.slice(-20).map(x=>({
    tool:x?.tool||"tool",state:x?.state||"done",details:String(x?.details||x?.text||"").slice(0,600)
  }));
  if(result.youtube&&typeof result.youtube==="object"){
    out.youtube={verified:Boolean(result.youtube.verified),url:result.youtube.url||null,filename:result.youtube.filename||null};
  }
  if(result.deploy&&typeof result.deploy==="object"){
    out.deploy={id:result.deploy.id||null,status:result.deploy.status||null};
  }
  return out;
}

async function readJob(id,owner){
  const db=await getDb();
  if(!db)return null;
  const r=await db.query("SELECT data FROM bhai_jobs WHERE id=$1",[String(id)]);
  const job=r.rows[0]?.data;
  return job&&job.owner===owner?job:null;
}

export function buildHistoryRecord(job){
  return {id:String(job.id),owner:job.owner,jobId:String(job.id),type:job.type,goal:job.goal,status:job.status,attempts:job.attempts,maxAttempts:job.maxAttempts,createdAt:job.createdAt,finishedAt:job.finishedAt||null,verificationSummary:job.verificationSummary||null,error:job.error||null,result:job.result||null,resumedFrom:job.payload?.resumedFrom||null,checkpoint:job.checkpoint||null,recovery:job.payload?.recovery||null,events:Array.isArray(job.events)?job.events.slice(-MAX_EVENTS):[]};
}

async function writeHistory(job){
  const db=await getDb();
  if(!db)return;
  const history=buildHistoryRecord(job);
  await db.query("INSERT INTO bhai_history(id,data,created_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",[history.id,history]);
}

async function recordHistory(job){
  try{await writeHistory(job)}catch(e){console.error("[JobRunner] history write failed:",String(e?.message||e))}
}

async function writeJob(job){
  const db=await getDb();
  if(!db)throw new Error("DATABASE_URL is required for persistent jobs.");
  const next={...job,updatedAt:now()};
  await db.query("INSERT INTO bhai_jobs(id,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[next.id,next]);
  return next;
}

export async function createJob({account,type="agent",payload={},goal="",maxAttempts=DEFAULT_MAX_ATTEMPTS,runAt=null}={}){
  await initDb();
  const db=await getDb();
  if(!db)throw new Error("DATABASE_URL is required for persistent jobs.");
  const id=crypto.randomUUID();
  const normalizedType=String(type||"agent").toLowerCase();
  const status=runAt&&new Date(runAt).getTime()>Date.now()?"scheduled":"queued";
  const job={
    id,owner:ownerKey(account),type:normalizedType,goal:String(goal||payload?.goal||"").trim(),
    payload:payload&&typeof payload==="object"?payload:{},status,attempts:0,
    maxAttempts:Math.min(Math.max(Number(maxAttempts)||DEFAULT_MAX_ATTEMPTS,1),10),
    runAt:runAt?new Date(runAt).toISOString():null,leaseUntil:null,progress:0,checkpoint:payload?.recovery?.checkpoint||null,
    events:[{at:now(),state:status,message:payload?.resumedFrom?"Job created as a recovery run from "+payload.resumedFrom+".":"Job created."}],createdAt:now(),updatedAt:now()
  };
  await writeJob(job);
  return job;
}

export async function listJobsForOwner(account,{limit=50}={}){
  await initDb();
  const db=await getDb();
  if(!db)return [];
  const r=await db.query("SELECT data FROM bhai_jobs WHERE data->>'owner'=$1 ORDER BY updated_at DESC LIMIT $2",[ownerKey(account),Math.min(Math.max(Number(limit)||50,1),100)]);
  return r.rows.map(x=>x.data);
}

export async function getJobForOwner(id,account){
  await initDb();
  return readJob(id,ownerKey(account));
}

export async function resumeJob(id,account){
  const source=await getJobForOwner(id,account);
  if(!source) return null;
  if(!["failed","cancelled"].includes(source.status)) throw new Error("Only failed or cancelled jobs can be resumed.");
  return createJob({account,type:source.type,payload:{...(source.payload||{}),resumedFrom:source.id,recovery:{previousStatus:source.status,previousAttempts:Number(source.attempts||0),lastProgress:Number(source.progress||0),lastEvent:source.events?.at(-1)?.message||null,checkpoint:source.checkpoint||null}},goal:source.goal,maxAttempts:source.maxAttempts});
}

export async function listHistoryForOwner(account,{limit=50}={}){
  const db=await getDb();
  if(!db)return [];
  await initDb();
  const r=await db.query("SELECT data FROM bhai_history WHERE data->>'owner'=$1 ORDER BY created_at DESC LIMIT $2",[ownerKey(account),Math.min(Math.max(Number(limit)||50,1),100)]);
  return r.rows.map(x=>x.data);
}

export async function cancelJob(id,account){
  const job=await getJobForOwner(id,account);
  if(!job) return null;
  if(TERMINAL.has(job.status)) return job;
  if(!canTransition(job.status,"cancelled")) throw new Error("Job cannot be cancelled from state "+job.status+".");
  const next=await writeJob({...job,status:"cancelled",progress:Math.min(100,Number(job.progress)||0),leaseUntil:null,events:appendEvent(job,{state:"cancelled",message:"Job cancelled by the owner."})});
  await recordHistory(next);
  return next;
}

async function claimJobs(){
  const db=await getDb();
  if(!db||active>=MAX_CONCURRENCY)return [];
  const limit=Math.max(1,MAX_CONCURRENCY-active);
  // api/db.js exposes a connected pg Client, not a Pool. Use a dedicated
  // short-lived transaction client here instead of calling connect() twice.
  const {Client}=await import("pg");
  const client=new Client({
    connectionString:String(process.env.DATABASE_URL||""),
    ssl:{rejectUnauthorized:false},
    connectionTimeoutMillis:5000
  });
  await client.connect();
  try{
    await client.query("BEGIN");
    const q=await client.query(`SELECT id,data FROM bhai_jobs
      WHERE (
        (data->>'status')='queued'
        OR ((data->>'status')='scheduled' AND COALESCE((data->>'runAt')::timestamptz,NOW())<=NOW())
        OR ((data->>'status')='running' AND COALESCE((data->>'leaseUntil')::timestamptz,NOW())<NOW())
      )
      AND COALESCE((data->>'backoffUntil')::timestamptz,NOW())<=NOW()
      ORDER BY updated_at ASC
      FOR UPDATE SKIP LOCKED LIMIT $1`,[limit]);
    const claimed=[];
    const exhausted=[];
    for(const row of q.rows){
      const job=row.data||{};
      if(Number(job.attempts||0)>=Number(job.maxAttempts||DEFAULT_MAX_ATTEMPTS)){
        const failed={...job,status:"failed",leaseUntil:null,progress:100,events:appendEvent(job,{state:"failed",message:"Maximum attempts exhausted before execution."}),updatedAt:now()};
        await client.query("UPDATE bhai_jobs SET data=$2,updated_at=NOW() WHERE id=$1",[row.id,failed]);
        exhausted.push(failed);
        continue;
      }
      const attempts=Number(job.attempts||0)+1;
      const leaseUntil=new Date(Date.now()+DEFAULT_LEASE_SECONDS*1000).toISOString();
      const next={...job,status:"running",attempts,leaseUntil,startedAt:job.startedAt||now(),progress:10,backoffUntil:null,updatedAt:now(),events:appendEvent(job,{state:"running",message:"Worker claimed the job; execution started.",progress:10,attempt:attempts})};
      await client.query("UPDATE bhai_jobs SET data=$2,updated_at=NOW() WHERE id=$1",[row.id,next]);
      claimed.push(next);
    }
    await client.query("COMMIT");
    for(const failed of exhausted)await recordHistory(failed);
    return claimed;
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    throw e;
  }finally{await client.end().catch(()=>{});}
}

async function requestJson(url,options={},timeoutMs=600000){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(timeoutMs)});
  const d=await r.json().catch(()=>({error:"Invalid JSON from executor"}));
  if(!r.ok)throw Object.assign(new Error(String(d?.error||d?.message||"Executor returned HTTP "+r.status)),{status:r.status,data:d});
  return d;
}

async function executeAgent(job){
  const base=String(process.env.RENDER_EXTERNAL_URL||process.env.BHAI_PUBLIC_URL||"").replace(/\/$/,"")||`http://127.0.0.1:${Number(process.env.PORT)||10000}`;
  return requestJson(base+"/api/agent",{
    method:"POST",
    headers:{"Content-Type":"application/json",...internalHeaders(job.owner)},
    body:JSON.stringify({messages:Array.isArray(job.payload?.messages)&&job.payload.messages.length?job.payload.messages:[{role:"user",text:job.goal}],doIt:job.payload?.doIt!==false})
  });
}

async function executeMission(job){
  const base=String(process.env.RENDER_EXTERNAL_URL||process.env.BHAI_PUBLIC_URL||"").replace(/\/$/,"")||`http://127.0.0.1:${Number(process.env.PORT)||10000}`;
  const body={
    task:job.goal||job.payload?.task||"",
    projectName:String(job.payload?.projectName||"BHAI-App"),
    platform:String(job.payload?.platform||"android"),
    branch:String(job.payload?.branch||"main"),
    doIt:true,
    maxFixes:Math.min(Math.max(Number(job.payload?.maxFixes)||2,0),3),
    autoDeploy:job.payload?.autoDeploy!==false
  };
  return requestJson(base+"/api/mission",{
    method:"POST",headers:{"Content-Type":"application/json",...internalHeaders(job.owner)},body:JSON.stringify(body)
  },12*60*1000);
}

async function executeHealth(job){
  const url=String(job.payload?.url||"").trim();
  if(!url)throw new Error("Health job requires payload.url.");
  const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:"follow"});
  const contentType=String(r.headers.get("content-type")||"");
  const data=contentType.includes("json")?await r.json().catch(()=>null):null;
  return {ok:r.ok,status:r.status,url,body:data};
}

async function executeDeploy(job){
  const base=String(process.env.RENDER_EXTERNAL_URL||process.env.BHAI_PUBLIC_URL||"").replace(/\/$/,"")||`http://127.0.0.1:${Number(process.env.PORT)||10000}`;
  const result=await requestJson(base+"/api/deploy",{
    method:"POST",headers:{"Content-Type":"application/json",...internalHeaders(job.owner)},
    body:JSON.stringify({serviceId:job.payload?.serviceId,commit:String(job.payload?.commit||""),reason:String(job.payload?.reason||"BHAI X queued deployment"),doIt:true})
  },4*60*1000);
  return {...result,healthVerified:result?.ok===true&&result?.status==="complete"};
}

async function githubJson(url,options={}){
  const token=String(process.env.GITHUB_TOKEN||"");
  if(!token)throw new Error("GITHUB_TOKEN is required for a queued GitHub build.");
  const r=await fetch(url,{...options,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+token,"Content-Type":"application/json",...(options.headers||{})},signal:options.signal||AbortSignal.timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(String(d?.message||d?.error||"GitHub request failed with HTTP "+r.status));
  return d;
}

async function executeBuild(job,report){
  const repository=String(job.payload?.repository||process.env.BHAI_BUILD_REPO||"aitoolproject690-netizen/BHAI-AI");
  const workflow=String(job.payload?.workflow||process.env.APK_BUILD_WORKFLOW||"build-apk.yml");
  const branch=String(job.payload?.branch||process.env.BHAI_BUILD_BRANCH||"main");
  const [owner,repo]=repository.split("/");
  if(!owner||!repo)throw new Error("Invalid build repository.");
  await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{
    method:"POST",body:JSON.stringify({ref:branch,inputs:{platform:String(job.payload?.platform||"android"),projectName:String(job.payload?.projectName||"BHAI-X"),sourceUrl:String(job.payload?.sourceUrl||""),official_release:"false"}})
  });
  await report(40,"GitHub Actions build dispatched; waiting for an actual completed run.");
  const started=Date.now();
  let run=null;
  while(Date.now()-started<8*60*1000){
    await new Promise(r=>setTimeout(r,4000));
    const runs=await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(branch)}&per_page=10`);
    const candidates=(runs.workflow_runs||[]).filter(x=>new Date(x.created_at||0).getTime()>started-60000);
    run=candidates[0]||null;
    if(run?.status==="completed")break;
  }
  if(!run||run.status!=="completed")return {ok:false,runId:run?.id||null,conclusion:run?.conclusion||null,error:"Build run did not complete within the bounded verification window."};
  await report(75,"GitHub Actions run completed; verifying the APK artifact.");
  const artifacts=await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(run.id)}/artifacts`);
  const artifact=(artifacts.artifacts||[]).find(a=>a.name==="BHAI-X-debug-apk"&&a.expired===false);
  return {ok:run.conclusion==="success"&&Boolean(artifact),runId:run.id,conclusion:run.conclusion,artifactVerified:Boolean(artifact),artifact:artifact?{id:artifact.id,name:artifact.name,size:artifact.size_in_bytes}:null};
}

async function execute(job,report){
  if(job.type==="agent")return executeAgent(job);
  if(job.type==="mission")return executeMission(job);
  if(job.type==="health")return executeHealth(job);
  if(job.type==="deploy")return executeDeploy(job);
  if(job.type==="build")return executeBuild(job,report);
  throw new Error("Unsupported queued job type: "+job.type);
}

async function processJob(initial){
  active++;
  let job=initial;
  const report=async(progress,message,meta={})=>{
    const fresh=await readJob(job.id,job.owner);
    if(!fresh||fresh.status==="cancelled")return;
    job={...fresh,progress:Math.min(95,Math.max(0,Number(progress)||0)),checkpoint:buildCheckpoint(fresh,null,{progress,message,phase:meta.phase,tool:meta.tool}),leaseUntil:new Date(Date.now()+DEFAULT_LEASE_SECONDS*1000).toISOString(),events:appendEvent(fresh,{state:"running",progress:Math.min(95,Math.max(0,Number(progress)||0)),message,checkpoint:meta.phase||null})};
    await writeJob(job);
  };
  try{
    await report(20,"Executor selected: "+job.type+".");
    const result=await execute(job,report);
    const fresh=await readJob(job.id,job.owner);
    if(!fresh||fresh.status==="cancelled")return;
    job={...fresh,status:"verifying",progress:90,checkpoint:buildCheckpoint(fresh,result,{progress:90,message:"Execution finished; entering verification."}),leaseUntil:new Date(Date.now()+DEFAULT_LEASE_SECONDS*1000).toISOString(),result:compactResult(result),events:appendEvent(fresh,{state:"verifying",progress:90,message:"Execution finished; applying the completion-proof gate."})};
    await writeJob(job);
    const verification=verifyJobResult(job.type,result);
    if(verification.ok){
      job={...job,status:"completed",progress:100,checkpoint:{...buildCheckpoint(job,result,{progress:100,message:verification.reason,phase:"proof",tool:"completion-proof"}),proof:verification.reason},leaseUntil:null,finishedAt:now(),verificationSummary:verification.reason,events:appendEvent(job,{state:"completed",progress:100,message:verification.reason})};
      await writeJob(job);
      await recordHistory(job);
    }else{
      const retry=Number(job.attempts||1)<Number(job.maxAttempts||DEFAULT_MAX_ATTEMPTS);
      job={...job,status:retry?"queued":"failed",progress:retry?35:100,checkpoint:{...buildCheckpoint(job,result,{progress:retry?35:100,message:retry?"Verification failed; checkpoint retained for recovery.":verification.reason,phase:"proof",tool:"completion-proof"}),recoveryReady:retry},leaseUntil:null,backoffUntil:retry?new Date(Date.now()+retryDelayMs(job.attempts)).toISOString():null,error:verification.reason,events:appendEvent(job,{state:retry?"queued":"failed",progress:retry?35:100,message:retry?"Verification failed; bounded retry scheduled.":verification.reason})};
      await writeJob(job);
      if(!retry)await recordHistory(job);
    }
  }catch(error){
    const fresh=await readJob(job.id,job.owner);
    if(fresh&&!TERMINAL.has(fresh.status)){
      const retry=Number(fresh.attempts||1)<Number(fresh.maxAttempts||DEFAULT_MAX_ATTEMPTS);
      const next={...fresh,status:retry?"queued":"failed",progress:retry?25:100,checkpoint:{...buildCheckpoint(fresh,null,{progress:retry?25:100,message:retry?"Executor error; checkpoint retained for recovery.":"Executor failed; max attempts reached.",phase:"recovery",tool:"executor"}),recoveryReady:retry},leaseUntil:null,backoffUntil:retry?new Date(Date.now()+retryDelayMs(fresh.attempts)).toISOString():null,error:String(error?.message||error).slice(0,1200),events:appendEvent(fresh,{state:retry?"queued":"failed",progress:retry?25:100,message:retry?"Executor error; bounded retry scheduled.":"Executor failed; max attempts reached.",error:String(error?.message||error).slice(0,600)})};
      await writeJob(next);
      if(!retry)await recordHistory(next);
    }
  }finally{active--;}
}

async function tick(){
  if(tickRunning)return;
  tickRunning=true;
  lastTickAt=now();
  try{
    await initDb();
    const claimed=await claimJobs();
    await Promise.all(claimed.map(processJob));
  }catch(error){
    console.error("[JobRunner] tick failed:",String(error?.message||error));
  }finally{tickRunning=false;}
}

export function startJobRunner(){
  if(timer)return;
  runnerStartedAt=now();
  timer=setInterval(()=>void tick(),POLL_MS);
  void tick();
}

export function jobRunnerStatus(){
  return {started:Boolean(timer),runnerStartedAt,lastTickAt,active,concurrency:MAX_CONCURRENCY,pollMs:POLL_MS};
}
