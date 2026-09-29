import React,{useEffect,useState}from"react";
import{ShieldCheck,Server,Users,Lock,Activity,X,Power,Code2,Globe2,Image as ImageIcon,Boxes}from"lucide-react";

const PERMS=["server","monitoring","deploy","users","support","connectors"];
const MODULES=[
 ["agent","AI Agent",ShieldCheck],["coding","Coding",Code2],["builds","Build / APK",Boxes],
 ["connectors","Connectors",Globe2],["social","Social",Users],["marketplace","Marketplace",ImageIcon]
];

function UserManager({ownerKey}){const[list,setList]=useState([]),[selected,setSelected]=useState(""),[amount,setAmount]=useState("");const h={"Content-Type":"application/json","x-owner-key":ownerKey};const load=async()=>{const r=await fetch("https://bhai-ai-vpna.onrender.com/api/accounts?role=admin",{headers:h});const d=await r.json();setList(d.accounts||[])};useEffect(()=>{load()},[]);const act=async(action,extra={})=>{await fetch("https://bhai-ai-vpna.onrender.com/api/accounts",{method:"POST",headers:h,body:JSON.stringify({action,...extra})});setSelected("");setAmount("");load()};return <div>{list.map(a=><div className="delegateRow" key={a.id}><div><b>{a.email}</b><span>{a.role} • Credits: {a.credits} • {a.blocked?"BLOCKED":"ACTIVE"}</span></div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button onClick={()=>act("block",{accountId:a.id})}>{a.blocked?"Unblock":"Block"}</button><button onClick={()=>{setSelected(a.id);setAmount(prompt("Credits adjustment (+/-):")||"")}}>Credits</button>{selected===a.id&&amount&&<button onClick={()=>act("credit",{accountId:a.id,amount:Number(amount),reason:"Owner adjustment"})}>Apply</button>}</div></div>)}</div>}

function ResellerManager({ownerKey}){const[list,setList]=useState([]),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[selected,setSelected]=useState(""),[amount,setAmount]=useState(""),[perms,setPerms]=useState(["support","monitoring"]);const PERMS=["support","monitoring","deploy","connectors","keys","transactions"];const h={"Content-Type":"application/json","x-owner-key":ownerKey};const load=async()=>{const r=await fetch("/api/resellers",{headers:h});const d=await r.json();setList(d.resellers||[])};useEffect(()=>{load()},[]);const act=async(action,extra={})=>{await fetch("/api/resellers",{method:"POST",headers:h,body:JSON.stringify({action,...extra})});setEmail("");setPassword("");setAmount("");load()};return <div><div className="delegateForm"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Reseller email"/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password (8+)"/><div className="permRow">{PERMS.map(p=><button className={perms.includes(p)?"selected":""} key={p} onClick={()=>setPerms(a=>a.includes(p)?a.filter(x=>x!==p):[...a,p])}>{p}</button>)}</div><button className="addAdmin" disabled={!email||password.length<8} onClick={()=>act("create",{email,password,permissions:perms})}>＋ Create Reseller</button></div>{list.map(r=><div className="delegateRow" key={r.id}><div><b>{r.email}</b><span>Balance: {r.balance} • {r.blocked?"BLOCKED":"ACTIVE"}</span></div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button onClick={()=>act("block",{id:r.id})}>{r.blocked?"Unblock":"Block"}</button><button onClick={()=>{setSelected(r.id);setAmount(prompt("Balance adjustment (+/-):")||"")}}>Wallet</button><button onClick={()=>{const raw=prompt("Permissions (comma separated):",Array.isArray(r.permissions)?r.permissions.join(","): "");if(raw!==null)act("permissions",{id:r.id,permissions:raw.split(",").map(x=>x.trim()).filter(Boolean)})}}>Permissions</button>{selected===r.id&&amount&&<button onClick={()=>act("balance",{id:r.id,amount:Number(amount)})}>Apply</button>}</div></div>)}</div>}

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
    {error&&<div className="ownerError">{error}</div>}
    <div className="ownerGrid">
     <div className="ownerCard"><Server/><b>Server</b><span className={state.serverMode==="online"?"good":"warn"}>{state.serverMode}</span><button onClick={()=>action("set_server_mode",{mode:state.serverMode==="online"?"maintenance":"online"})}>{state.serverMode==="online"?"Maintenance":"Bring Online"}</button></div>
     <div className="ownerCard"><Lock/><b>Emergency lock</b><span>{state.emergencyLock?"LOCKED":"Unlocked"}</span><button onClick={()=>action("set_emergency_lock",{enabled:!state.emergencyLock})}>{state.emergencyLock?"Unlock":"Lock Now"}</button></div>
     <div className="ownerCard"><ShieldCheck/><b>Official releases</b><span>{state.releaseLocked?"Owner only":"Open"}</span><button onClick={()=>action("set_release_lock",{locked:!state.releaseLocked})}>{state.releaseLocked?"Locked":"Lock Releases"}</button></div>
     <div className="ownerCard"><Activity/><b>Audit</b><span>{state.audit.length} recent events</span><button onClick={load}>Refresh</button></div>
    </div>

    <section className="ownerSection"><div className="sectionTitle"><Power/><b>Master module switches</b></div>
      <div className="moduleGrid">{MODULES.map(([id,label,Icon])=><div className="moduleRow" key={id}><div><Icon/><b>{label}</b></div><button className={state.modules?.[id]?"moduleOn":"moduleOff"} onClick={()=>action("set_module",{module:id,enabled:!state.modules?.[id]})}>{state.modules?.[id]?"ON":"OFF"}</button></div>)}</div>
    </section>

    <section className="ownerSection"><div className="sectionTitle"><Users/><b>Delegated Admins</b></div>
      <div className="delegateForm"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Trusted admin name"/><input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)}/><div className="permRow">{PERMS.map(p=><button className={permissions.includes(p)?"selected":""} key={p} onClick={()=>toggle(p)}>{p}</button>)}</div><button className="addAdmin" disabled={!name||busy} onClick={()=>{action("delegate_add",{name,permissions,expiresAt:expires?new Date(expires).toISOString():null});setName("");setExpires("")}}>＋ Grant Access</button></div>
      {(state.delegatedAdmins||[]).map(a=><div className="delegateRow" key={a.id}><div><b>{a.name}</b><span>{a.permissions.join(" • ")||"No permissions"}{a.expiresAt?" • expires "+new Date(a.expiresAt).toLocaleString():""}</span></div><button onClick={()=>action("delegate_revoke",{id:a.id})}>Revoke</button></div>)}
    </section>


    <section className="ownerSection"><div className="sectionTitle"><Users/><b>User Management</b></div><UserManager ownerKey={key}/></section>
    <section className="ownerSection"><div className="sectionTitle"><Users/><b>Reseller Management</b></div><ResellerManager ownerKey={key}/></section>
    <section className="ownerSection"><div className="sectionTitle"><Lock/><b>Owner rules</b></div><div className="ruleGrid"><div>🔒 Core updates <b>Owner only</b></div><div>🌐 Server control <b>Owner only</b></div><div>📦 Official APK release <b>Owner only</b></div><div>🛡️ Delegation <b>Owner only</b></div></div></section>
    <section className="ownerSection"><div className="sectionTitle"><Activity/><b>Recent audit</b></div>{state.audit.slice(0,12).map(x=><div className="auditRow" key={x.id}><span>{new Date(x.at).toLocaleString()}</span><b>{x.action}</b></div>)}</section>
   </div>}
  </div>
 </div>
}