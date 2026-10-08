import React,{useEffect,useRef,useState}from"react";
import{X,History,RefreshCw,RotateCcw,CheckCircle2,AlertTriangle,Clock3,XCircle,ChevronDown}from"lucide-react";
import{apiUrl,readJsonResponse}from"./apiClient.js";

const token=()=>localStorage.getItem("bhai_user_session")||sessionStorage.getItem("bhai_user_session")||"";
const terminal=new Set(["completed","failed","cancelled"]);
const fmt=value=>value?new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"—";
const statusIcon=status=>status==="completed"?<CheckCircle2 size={14}/>:status==="failed"?<AlertTriangle size={14}/>:status==="cancelled"?<XCircle size={14}/>:<Clock3 size={14}/>;
export default function ExecutionHistoryPanel({onClose}){
 const[jobs,setJobs]=useState([]),[history,setHistory]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState(""),[activeJobId,setActiveJobId]=useState(""),[expanded,setExpanded]=useState("");
 const pollRef=useRef(null);
 async function load(){
  setBusy(true);setError("");
  try{
   const h={"Authorization":"Bearer "+token()};
   const [jr,hr]=await Promise.all([
    fetch(apiUrl("/api/jobs?limit=20"),{headers:h}),
    fetch(apiUrl("/api/jobs?history=1&limit=50"),{headers:h})
   ]);
   const jd=await readJsonResponse(jr,"/api/jobs");
   const hd=await readJsonResponse(hr,"/api/jobs?history=1");
   if(!jr.ok)throw new Error(jd.error||"Could not load active jobs");
   if(!hr.ok)throw new Error(hd.error||"Could not load execution history");
   setJobs(jd.jobs||[]);setHistory(hd.history||[]);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{load();return()=>{if(pollRef.current)clearInterval(pollRef.current)}},[]);
 useEffect(()=>{
  if(!activeJobId)return;
  const poll=async()=>{
   try{
    const r=await fetch(apiUrl("/api/jobs?id="+encodeURIComponent(activeJobId)),{headers:{"Authorization":"Bearer "+token()}});
    const d=await readJsonResponse(r,"/api/jobs");
    if(!r.ok)throw new Error(d.error||"Job status failed");
    setJobs(a=>[d.job,...a.filter(x=>x.id!==d.job.id)]);
    if(terminal.has(d.job?.status)){
      if(pollRef.current)clearInterval(pollRef.current);
      setActiveJobId("");
      await load();
    }
   }catch(e){setError(e.message);if(pollRef.current)clearInterval(pollRef.current);setActiveJobId("")}
  };
  poll();
  pollRef.current=setInterval(poll,2000);
  return()=>{if(pollRef.current)clearInterval(pollRef.current)};
 },[activeJobId]);
 async function resume(id){
  setError("");setActiveJobId("");setBusy(true);
  try{
   const r=await fetch(apiUrl("/api/jobs"),{method:"PATCH",headers:{"Authorization":"Bearer "+token(),"Content-Type":"application/json"},body:JSON.stringify({id,action:"resume"})});
   const d=await readJsonResponse(r,"/api/jobs resume");
   if(!r.ok)throw new Error(d.error||"Resume failed");
   setJobs(a=>[d.job,...a.filter(x=>x.id!==d.job.id)]);
   setActiveJobId(d.job.id);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function cancel(id){
  setError("");setBusy(true);
  try{
   const r=await fetch(apiUrl("/api/jobs"),{method:"PATCH",headers:{"Authorization":"Bearer "+token(),"Content-Type":"application/json"},body:JSON.stringify({id,action:"cancel"})});
   const d=await readJsonResponse(r,"/api/jobs cancel");
   if(!r.ok)throw new Error(d.error||"Cancel failed");
   await load();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const renderCard=(job,source)=>{
  const expandedKey=(source||"history")+":"+job.id;
  const open=expanded===expandedKey;
  const resumable=job.status==="failed"||job.status==="cancelled";
  const latest=Array.isArray(job.events)&&job.events.length?job.events.at(-1):null;
  return <div className="execCard" key={job.id}>
   <div className="execTop"><div className="execType"><History size={14}/><b>{String(job.type||"job").toUpperCase()}</b></div><span className={"execStatus exec-"+job.status}>{statusIcon(job.status)} {job.status}</span></div>
   <div className="execGoal">{job.goal||"Untitled execution"}</div>
   <div className="execMeta"><span>Attempts {job.attempts??0}/{job.maxAttempts??"—"}</span><span>{fmt(job.finishedAt||job.updatedAt||job.createdAt)}</span></div>
   {job.resumedFrom&&<div className="execResumeNote">↩ Recovery run from {String(job.resumedFrom).slice(0,8)}</div>}
   {job.checkpoint&&<div className="execCheckpoint">📍 Checkpoint: <b>{job.checkpoint.phase||"execution"}</b> · {job.checkpoint.tool||"executor"} · {Math.round(Number(job.checkpoint.progress)||0)}%<br/><span>{job.checkpoint.message||"Last known execution point saved."}</span></div>}
   {job.verificationSummary&&<div className="execProof">✅ {job.verificationSummary}</div>}
   {job.error&&<div className="execError">⚠️ {job.error}</div>}
   {latest?.message&&<div className="execLatest">{latest.message}</div>}
   <div className="execActions">
    <button onClick={()=>setExpanded(open?"":expandedKey)}><ChevronDown size={13} className={open?"rot180":""}/> {open?"Hide events":"Events"}</button>
    {source==="history"&&resumable&&<button disabled={busy} onClick={()=>resume(job.jobId||job.id)}><RotateCcw size={13}/> Resume from checkpoint</button>}
    {source==="active"&&!terminal.has(job.status)&&<button disabled={busy} onClick={()=>cancel(job.id)}><XCircle size={13}/> Cancel</button>}
   </div>
   {open&&<div className="execEvents">{(job.events||[]).slice(-8).map((ev,i)=><div key={i}><b>{ev.state||"event"}</b><span>{fmt(ev.at)}</span><p>{ev.message||ev.error||""}</p></div>)}</div>}
  </div>
 };
 return <div className="panelOverlay"><div className="utilityPanel executionPanel">
  <div className="utilityHead"><div><b><History size={16}/> Execution History</b><span>Persistent jobs • proof • recovery</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">
   <div className="execToolbar"><span>{history.length} history · {jobs.filter(x=>!terminal.has(x.status)).length} active</span><button onClick={load} disabled={busy}><RefreshCw size={13} className={busy?"spin":""}/> Refresh</button></div>
   {error&&<div className="accountError">{error}</div>}
   {busy&&!jobs.length&&!history.length?<div className="brainMuted">Execution history load ho rahi hai...</div>:<>
    {!!jobs.filter(x=>!terminal.has(x.status)).length&&<><div className="execSectionTitle">⚙️ Active / queued</div>{jobs.filter(x=>!terminal.has(x.status)).map(j=>renderCard(j,"active"))}</>}
    <div className="execSectionTitle">🗂️ Completed / failed / cancelled</div>
    {history.length?history.map(j=>renderCard(j,"history")):<div className="execEmpty">Abhi terminal execution history nahi hai.</div>}
   </>}
  </div>
 </div></div>
}
