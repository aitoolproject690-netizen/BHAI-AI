import React,{useEffect,useState}from"react";
import{ShieldCheck,Server,Users,Lock,Unlock,RefreshCw,Plus,Trash2,Activity,X}from"lucide-react";

const PERMS=["server","monitoring","deploy","users","support","connectors"];

export default function OwnerPanel({onClose}){
 const[key,setKey]=useState(()=>sessionStorage.getItem("bhai_owner_key")||"");
 const[authed,setAuthed]=useState(false),[state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const[name,setName]=useState(""),[permissions,setPermissions]=useState(["monitoring"]),[expires,setExpires]=useState("");
 const headers=()=>({"Content-Type":"application/json","x-owner-key":key});
 async function load(){
  if(!key)return setError("Owner access key required.");
  setBusy(true);setError("");
  try{const r=await fetch("/api/owner",{headers:{"x-owner-key":key}});const d=await r.json();if(!r.ok)throw new Error(d.error||"Authorization failed");sessionStorage.setItem("bhai_owner_key",key);setState(d.state);setAuthed(true)}
  catch(e){setAuthed(false);setError(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{if(key)load()},[]);
 async function action(action,extra={}){
  setBusy(true);setError("");
  try{const r=await fetch("/api/owner",{method:"POST",headers:headers(),body:JSON.stringify({action,...extra})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Action failed");setState(d.state)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function toggle(p){setPermissions(a=>a.includes(p)?a.filter(x=>x!==p):[...a,p])}
 return <div className="ownerOverlay">
  <div className="ownerPanel">
   <div className="ownerHead"><div><b>👑 BHAI X Owner Control</b><span>Master control • users cannot modify Core</span></div><button onClick={onClose}><X/></button></div>
   {!authed?<div className="ownerLogin"><ShieldCheck size={42}/><h2>Owner verification</h2><p>Only the owner access key can open this panel.</p><input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Owner access key" onKeyDown={e=>e.key==="Enter"&&load()}/><button onClick={load} disabled={busy}>{busy?"Checking...":"Unlock Owner Panel"}</button>{error&&<div className="ownerError">{error}</div>}</div>:
   <div className="ownerBody">
    <div className="ownerGrid">
     <div className="ownerCard"><Server/><b>Server</b><span className={state.serverMode==="online"?"good":"warn"}>{state.serverMode}</span><button onClick={()=>action("set_server_mode",{mode:state.serverMode==="online"?"maintenance":"online"})}>{state.serverMode==="online"?"Maintenance":"Bring Online"}</button></div>
     <div className="ownerCard"><Lock/><b>Emergency lock</b><span>{state.emergencyLock?"LOCKED":"Unlocked"}</span><button onClick={()=>action("set_emergency_lock",{enabled:!state.emergencyLock})}>{state.emergencyLock?"Unlock":"Lock Now"}</button></div>
     <div className="ownerCard"><ShieldCheck/><b>Official releases</b><span>{state.releaseLocked?"Owner only":"Open"}</span><button onClick={()=>action("set_release_lock",{locked:!state.releaseLocked})}>{state.releaseLocked?"Keep Locked":"Lock Releases"}</button></div>
     <div className="ownerCard"><Activity/><b>Audit</b><span>{state.audit.length} recent events</span><button onClick={()=>load()}>Refresh</button></div>
    </div>
    <section className="ownerSection"><div className="sectionTitle"><Users/><b>Delegated Admins</b></div>
      <div className="delegateForm"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Trusted admin name"/><input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)}/><div className="permRow">{PERMS.map(p=><button className={permissions.includes(p)?"selected":""} key={p} onClick={()=>toggle(p)}>{p}</button>)}</div><button className="addAdmin" disabled={!name||busy} onClick={()=>{action("delegate_add",{name,permissions,expiresAt:expires?new Date(expires).toISOString():null});setName("");setExpires("")}}><Plus/> Grant Access</button></div>
      {(state.delegatedAdmins||[]).map(a=><div className="delegateRow" key={a.id}><div><b>{a.name}</b><span>{a.permissions.join(" • ")||"No permissions"}{a.expiresAt?" • expires "+new Date(a.expiresAt).toLocaleString():""}</span></div><button onClick={()=>action("delegate_revoke",{id:a.id})}><Trash2/> Revoke</button></div>)}
    </section>
    <section className="ownerSection"><div className="sectionTitle"><Lock/><b>Owner rules</b></div><div className="ruleGrid"><div>🔒 Core updates <b>Owner only</b></div><div>🌐 Server control <b>Owner only</b></div><div>📦 Official APK release <b>Owner only</b></div><div>🛡️ Delegation <b>Owner only</b></div></div></section>
    <section className="ownerSection"><div className="sectionTitle"><Activity/><b>Recent audit</b></div>{state.audit.slice(0,12).map(x=><div className="auditRow" key={x.id}><span>{new Date(x.at).toLocaleString()}</span><b>{x.action}</b></div>)}</section>
   </div>}
  </div>
 </div>
}