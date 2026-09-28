import React,{useEffect,useState}from"react";
import{X,Plug,Check,Loader2,ExternalLink,RefreshCw}from"lucide-react";

const FALLBACK=[
 ["github","GitHub","Coding / Repository"],["gitlab","GitLab","Coding / Repository"],["bitbucket","Bitbucket","Coding / Repository"],["replit","Replit","Coding / App"],["render","Render","Hosting / Deploy"],["vercel","Vercel","Hosting / Deploy"],["netlify","Netlify","Hosting / Deploy"],["railway","Railway","Hosting / Deploy"],["cloudflare","Cloudflare","Hosting / DNS"],["firebase","Firebase","Cloud / App"],["aws","AWS","Cloud"],["gcp","Google Cloud","Cloud"],["azure","Azure","Cloud"],["openai","OpenAI","AI"],["anthropic","Anthropic","AI"],["google-ai","Google AI","AI"],["huggingface","Hugging Face","AI"],["discord","Discord","Social"],["telegram","Telegram","Social"]
].map(([id,name,type])=>({id,name,type,auth:"OAuth / API / Webhook",status:"available"}));

export default function ConnectPanel({onClose}){
 const API_BASE="https://bhai-ai-vpna.onrender.com";\n const[items,setItems]=useState(FALLBACK),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const[connected,setConnected]=useState(()=>{try{return JSON.parse(localStorage.getItem("bhai_x_connections")||"{}")}catch{return{}}});
 async function load(){
  setBusy(true);setError("");
  try{
   const r=await fetch(API_BASE+"/api/capabilities",{cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d?.error||"Capability service unavailable");
   const configured=new Set((d.providers||[]).filter(x=>x.configured).map(x=>x.id));
   const list=[...FALLBACK];
   setItems(list.map(x=>({...x,configured:configured.has(x.id),status:configured.has(x.id)?"connected":"not_configured"})));
  }catch(e){setError("Live capability check failed. No fake connection will be shown.");}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[]);
 function toggle(id){
  setError("Connection is controlled by the provider credential/OAuth setup. BHAI X will not mark an app connected without a real server-side credential.");
 }
 return <div className="panelOverlay"><div className="utilityPanel connectorPanel">
  <div className="utilityHead"><div><b>🔌 Connect App / Service</b><span>Apps BHAI X ke saath connect kar sakta hai</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">\n   <button className="connectBtn" onClick={load} disabled={busy}><RefreshCw size={13}/> Refresh capability status</button>
   <p className="utilityIntro">App select karo. Connection permission/API setup provider ke hisaab se hoga.</p>
   {busy&&<div className="utilityLoading"><Loader2 className="spin"/> Apps load ho rahe hain...</div>}
   {error&&<div className="utilityNote">ℹ️ {error}</div>}
   <div className="connectorGrid">
    {items.map(x=><div className="connectorCard" key={x.id}>
      <div className="connectorIcon"><Plug size={16}/></div>
      <div className="connectorInfo"><b>{x.name}</b><span>{x.type} • {x.auth}</span></div>
      <button className={connected[x.id]?"connected":"connectBtn"} onClick={()=>toggle(x.id)}>
       {x.configured?<><Check size={13}/> Connected</>:<>Configure</>}
      </button>
    </div>)}
   </div>
   <div className="utilityNote">🔐 Real connection status server-side credentials se aata hai. BHAI X kabhi local toggle ko “connected” nahi maanega. Provider key/OAuth setup ke baad Refresh karo.</div>
  </div>
 </div></div>
}