import React,{useEffect,useState}from"react";
import{X,Plug,Check,Loader2,RefreshCw,ExternalLink,KeyRound}from"lucide-react";

const FALLBACK=[
 ["github","GitHub","Coding / Repository"],["gitlab","GitLab","Coding / Repository"],["bitbucket","Bitbucket","Coding / Repository"],["replit","Replit","Coding / App"],["render","Render","Hosting / Deploy"],["vercel","Vercel","Hosting / Deploy"],["netlify","Netlify","Hosting / Deploy"],["railway","Railway","Hosting / Deploy"],["cloudflare","Cloudflare","Hosting / DNS"],["firebase","Firebase","Cloud / App"],["aws","AWS","Cloud"],["gcp","Google Cloud","Cloud"],["azure","Azure","Cloud"],["openai","OpenAI","AI"],["anthropic","Anthropic","AI"],["google-ai","Google AI","AI"],["huggingface","Hugging Face","AI"],["discord","Discord","Social"],["telegram","Telegram","Social"]
].map(([id,name,type])=>({id,name,type,auth:"OAuth / API / Webhook",configured:false,status:"not_configured"}));

export default function ConnectPanel({onClose}){
 const API_BASE="https://bhai-ai-vpna.onrender.com";
 const[items,setItems]=useState(FALLBACK),[busy,setBusy]=useState(true),[error,setError]=useState(""),[selected,setSelected]=useState(null);
 async function load(){
  setBusy(true);setError("");
  try{
   const r=await fetch(API_BASE+"/api/capabilities",{cache:"no-store"});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d?.error||"Capability service unavailable");
   const live=Array.isArray(d.providers)?d.providers:[];
   const byId=new Map(live.filter(x=>x?.id).map(x=>[x.id,x]));
   setItems(FALLBACK.map(x=>{
    const p=byId.get(x.id);
    return {...x,configured:!!p?.configured,status:p?.status||"not_configured",auth:p?.configured?"Server credential":"OAuth / API / Webhook"};
   }));
  }catch(e){setError("Live capability check failed. Showing available apps only.");setItems(FALLBACK)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[]);
 function configure(x){setSelected(x);setError("");}
 function closeSetup(){setSelected(null)}
 return <div className="panelOverlay"><div className="utilityPanel connectorPanel">
  <div className="utilityHead"><div><b>🔌 Connect App / Service</b><span>Apps BHAI X ke saath connect karo</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">{selected&&<div className="utilityNote"><KeyRound size={14}/> <b>{selected.name}</b> — {selected.configured?"Connected server-side.":"Connection setup is not configured yet."} {selected.configured&&"BHAI X can use this provider in supported tasks."}<button className="connectBtn" style={{marginLeft:8}} onClick={closeSetup}>Close</button></div>}
   <button className="connectBtn" onClick={load} disabled={busy}><RefreshCw size={13}/> Refresh status</button>
   <p className="utilityIntro">App select karo. Sirf real server-side connection ko Connected dikhaya jayega.</p>
   {busy&&<div className="utilityLoading"><Loader2 className="spin"/> Apps load ho rahe hain...</div>}
   {error&&<div className="utilityNote">ℹ️ {error}</div>}
   <div className="connectorGrid">
    {items.map(x=><div className="connectorCard" key={x.id}>
      <div className="connectorIcon"><Plug size={16}/></div>
      <div className="connectorInfo"><b>{x.name}</b><span>{x.type} • {x.auth}</span></div>
      <button className={x.configured?"connected":"connectBtn"} onClick={()=>configure(x)}>
       {x.configured?<><Check size={13}/> Connected</>:<>Connect</>}
      </button>
    </div>)}
   </div>
   <div className="utilityNote">🔐 Connection credentials server par rahenge. Local button se fake connection nahi banega.</div>
  </div>
 </div></div>
}