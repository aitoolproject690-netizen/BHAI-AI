import React,{useEffect,useState}from"react";
import{X,KeyRound,Plus,Copy,Check,Trash2,RefreshCw,ShieldCheck}from"lucide-react";

const API_BASE="https://bhai-ai-vpna.onrender.com";
const api=p=>API_BASE+p;
const token=()=>localStorage.getItem("bhai_user_session")||sessionStorage.getItem("bhai_user_session")||"";
const headers=()=>({ "Content-Type":"application/json", Authorization:"Bearer "+token() });

const SCOPES=[
 ["chat","Chat / AI"],
 ["coding","Coding / Code Fix"],
 ["github","GitHub / Repository"],
 ["image","Image Generation"],
 ["video","Video Generation"],
 ["files","Files / Documents"],
 ["search","Web Search"],
 ["agent","Agent / Mission"]
];

export default function APIKeysPanel({onClose}){
 const[keys,setKeys]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[newKey,setNewKey]=useState(null),[copied,setCopied]=useState(false),[name,setName]=useState("My App"),[selected,setSelected]=useState(SCOPES.map(x=>x[0]));
 async function load(){try{const r=await fetch(api("/api/api-keys"),{headers:headers()});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load API keys");setKeys(d.keys||[])}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function create(){setBusy(true);setError("");try{const r=await fetch(api("/api/api-keys"),{method:"POST",headers:headers(),body:JSON.stringify({action:"create",name,scopes:selected})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not create API key");setNewKey(d.key);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function action(id,kind){if(!confirm(kind==="revoke"?"Revoke this API key?":"Regenerate this API key?"))return;setBusy(true);setError("");try{const r=await fetch(api("/api/api-keys"),{method:"POST",headers:headers(),body:JSON.stringify({action:kind,id})});const d=await r.json();if(!r.ok)throw new Error(d.error||"API key action failed");if(d.key)setNewKey(d.key);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function copy(){if(!newKey)return;await navigator.clipboard.writeText(newKey);setCopied(true);setTimeout(()=>setCopied(false),1200)}
 return <div className="panelOverlay"><div className="utilityPanel" style={{maxWidth:620}}>
  <div className="utilityHead"><div><b>🔑 BHAI API Keys</b><span>Private developer API access</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">
   <div style={{padding:"10px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",marginBottom:14}}>
    <b style={{display:"block",marginBottom:8}}>Create API Key</b>
    <input className="accountInput" value={name} onChange={e=>setName(e.target.value)} placeholder="Key name"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,margin:"10px 0"}}>{SCOPES.map(([id,label])=><label key={id} style={{display:"flex",gap:7,alignItems:"center",fontSize:13}}><input type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(s=>e.target.checked?[...s,id]:s.filter(x=>x!==id))}/>{label}</label>)}</div>
    <button className="accountPrimary" disabled={busy||!name.trim()||!selected.length} onClick={create}><Plus size={15}/> Create API Key</button>
   </div>
   {newKey&&<div style={{padding:12,borderRadius:12,border:"1px solid rgba(80,220,140,.35)",marginBottom:14}}>
    <b>⚠️ New key — copy it now</b><div style={{display:"flex",gap:7,marginTop:8}}><input className="accountInput" readOnly value={newKey}/><button className="accountPrimary" onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>}</button></div>
    <small>Secret key full form sirf creation/regeneration par dikhaya jata hai.</small>
   </div>}
   {keys.map(k=><div key={k.id} style={{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}><div><b>{k.name}</b><div style={{fontSize:12,opacity:.7}}>{k.key_prefix}•••••••• · {k.status}</div></div><div style={{display:"flex",gap:6}}><button className="accountOpenBtn" disabled={busy||k.status!=="active"} onClick={()=>action(k.id,"regenerate")}><RefreshCw size={14}/></button><button className="accountOpenBtn" disabled={busy||k.status!=="active"} onClick={()=>action(k.id,"revoke")}><Trash2 size={14}/></button></div></div>
    <div style={{fontSize:12,opacity:.7,marginTop:6}}>Permissions: {(k.scopes||[]).join(", ")||"none"} · Used: {k.usage_count||0}</div>
   </div>)}
   {!keys.length&&<div style={{opacity:.7,textAlign:"center",padding:16}}>Abhi koi API key nahi hai.</div>}
   {error&&<div className="accountError">{error}</div>}
   <div className="accountNote"><ShieldCheck size={14}/> Provider keys BHAI X server par hidden rahengi. Ye keys sirf BHAI API access ke liye hain.</div>
  </div>
 </div></div>
}
