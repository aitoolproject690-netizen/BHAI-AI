import React,{useState}from"react";
import{X,RefreshCw,Play,ShieldCheck,Clock3,WalletCards,ClipboardCheck,Activity,RotateCcw}from"lucide-react";
const API="https://bhai-ai-vpna.onrender.com";
export default function SystemPanel({onClose}){
 const[data,setData]=useState(null),[busy,setBusy]=useState(false),[note,setNote]=useState("");
 async function run(action,extra={}){
  setBusy(true);setNote("");
  try{const r=await fetch(API+"/api/system",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});const d=await r.json();if(!r.ok)throw new Error(d.error||"System check failed");setData(d);setNote("Verified: "+new Date().toLocaleTimeString());}
  catch(e){setNote("⚠️ "+e.message)}finally{setBusy(false)}
 }
 async function dna(){setBusy(true);setNote("");try{const r=await fetch(API+"/api/dna?project=BHAI-AI");const d=await r.json();if(!r.ok)throw new Error(d.error||"DNA check failed");setData(d);setNote("Project DNA verified: "+new Date().toLocaleTimeString())}catch(e){setNote("⚠️ "+e.message)}finally{setBusy(false)}}
 return <div className="panelOverlay"><div className="utilityPanel systemPanel">
  <div className="utilityHead"><div><b>🧠 BHAI X — System Center</b><span>Test • Doctor • Cost • Queue • Checkpoint • Audit</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">
   <div className="systemActions">
    <button onClick={()=>run("self_audit")} disabled={busy}><ClipboardCheck size={14}/> Self Audit</button>
    <button onClick={()=>run("doctor",{url:API})} disabled={busy}><Activity size={14}/> Health Doctor</button>
    <button onClick={dna} disabled={busy}><ClipboardCheck size={14}/> Project DNA</button>
    <button onClick={()=>run("build_doctor")} disabled={busy}><Activity size={14}/> Build Doctor</button>
    <button onClick={()=>run("test",{url:API+"/api/health"})} disabled={busy}><Play size={14}/> Test Backend</button>
    <button onClick={()=>run("post_deploy",{url:API+"/api/health"})} disabled={busy}><ShieldCheck size={14}/> Verify Deploy</button>
    <button onClick={()=>run("queue")} disabled={busy}><Clock3 size={14}/> Queue</button>
    <button onClick={()=>run("history")} disabled={busy}><RotateCcw size={14}/> Verify History</button>
   </div>
   {busy&&<div className="utilityLoading"><RefreshCw className="spin"/> Checking...</div>}
   {note&&<div className="utilityNote">{note}</div>}
   {data&&<pre className="systemResult">{JSON.stringify(data,null,2)}</pre>}
   <div className="utilityNote">ℹ️ Queue/checkpoint/history database available hone par persistent hain; database na ho to temporary in-memory fallback use hota hai. Cost Guardian calculation-only foundation hai, provider billing telemetry nahi.</div>
  </div>
 </div></div>
}