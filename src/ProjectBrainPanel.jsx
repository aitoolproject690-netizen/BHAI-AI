import React,{useEffect,useState}from"react";
import{X,BrainCircuit,RefreshCw}from"lucide-react";
const API_BASE="https://bhai-ai-vpna.onrender.com";
const token=()=>localStorage.getItem("bhai_user_session")||sessionStorage.getItem("bhai_user_session")||"";
export default function ProjectBrainPanel({onClose}){
 const[data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
 async function load(){setBusy(true);setError("");try{const r=await fetch(API_BASE+"/api/dna?project=default",{headers:{Authorization:"Bearer "+token()}});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load Project Brain");setData(d)}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[]);
 const d=data?.data||{};
 const list=v=>Array.isArray(v)&&v.length?v.map((x,i)=><div className="brainLine" key={i}>• {x}</div>):<div className="brainMuted">Nothing recorded yet.</div>;
 return <div className="panelOverlay"><div className="utilityPanel brainPanel"><div className="utilityHead"><div><b>🧠 BHAI X Project Brain</b><span>Persistent project context & verified history</span></div><button onClick={onClose}><X/></button></div><div className="utilityBody">
 <div className="brainActions"><button onClick={load} disabled={busy}><RefreshCw size={13} className={busy?"spin":""}/> Refresh</button></div>
 {error&&<div className="accountError">{error}</div>}
 {busy?<div className="brainMuted">Project Brain load ho raha hai...</div>:<><div className="brainCard"><BrainCircuit size={16}/><div><b>Last goal</b><p>{d.lastGoal||"Abhi koi project task record nahi hai."}</p></div></div>
 <div className="brainGrid"><div><b>Last result</b><p>{d.lastResult||"—"}</p></div><div><b>Last verified</b><p>{d.lastVerified===true?"✅ Verified":d.lastVerified||"Not verified"}</p></div></div>
 <div className="brainCard"><div><b>Known issues</b>{list(d.knownIssues)}</div></div>
 <div className="brainCard"><div><b>Risks</b>{list(d.risks)}</div></div>
 <div className="brainCard"><div><b>Decisions / project rules</b>{list(d.decisions)}</div></div>
 <div className="brainFooter">Brain automatically grows from verified project work. It does not invent progress.</div></>}
 </div></div></div>
}