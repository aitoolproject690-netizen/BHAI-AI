import React,{useEffect,useState}from"react";
import{X,Plug,Check,Loader2,RefreshCw,ExternalLink,KeyRound,AlertTriangle}from"lucide-react";

const FALLBACK=[
 ["github","GitHub","Coding / Repository"],["gitlab","GitLab","Coding / Repository"],["bitbucket","Bitbucket","Coding / Repository"],["replit","Replit","Coding / App"],["render","Render","Hosting / Deploy"],["vercel","Vercel","Hosting / Deploy"],["netlify","Netlify","Hosting / Deploy"],["railway","Railway","Hosting / Deploy"],["cloudflare","Cloudflare","Hosting / DNS"],["firebase","Firebase","Cloud / App"],["aws","AWS","Cloud"],["gcp","Google Cloud","Cloud"],["azure","Azure","Cloud"],["openai","OpenAI","AI"],["anthropic","Anthropic","AI"],["google-ai","Google AI","AI"],["huggingface","Hugging Face","AI"],["discord","Discord","Social"],["telegram","Telegram","Social"]
].map(([id,name,type])=>({id,name,type,auth:"OAuth / API / Webhook",configured:false,status:"not_configured"}));

const envHint={github:"GITHUB_TOKEN",render:"RENDER_API_KEY","google-ai":"GEMINI_API_KEY / GOOGLE_API_KEY",huggingface:"HF_TOKEN",openai:"OPENAI_API_KEY",anthropic:"ANTHROPIC_API_KEY"};

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
  }catch(e){setError("Live capability check failed. Showing provider catalog only.");setItems(FALLBACK)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[]);

 function configure(x){setSelected(x);setError("")}

 return <div className="panelOverlay"><div className="utilityPanel connectorPanel">
  <div className="utilityHead"><div><b>🔌 Connect App / Service</b><span>Real server capability status — fake connections nahi</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">
   {selected&&<div className="utilityNote">
    {selected.configured?<><Check size={14}/> <b>{selected.name} connected</b> — BHAI X ke server-side supported tasks ke liye credential available hai.</>:<><AlertTriangle size={14}/> <b>{selected.name} connected nahi hai.</b> Required server credential: <code>{envHint[selected.id]||"provider credential"}</code>. Is panel se fake Connected status nahi banaya ja sakta.</>}
    <button className="connectBtn" style={{marginLeft:8}} onClick={()=>setSelected(null)}>Close</button>
   </div>}
   <button className="connectBtn" onClick={load} disabled={busy}><RefreshCw size={13}/> Refresh status</button>
   <p className="utilityIntro">Provider ko select karke exact current status dekho. Server credential configured ho to Connected dikhega.</p>
   {busy&&<div className="utilityLoading"><Loader2 className="spin"/> Apps load ho rahe hain...</div>}
   {error&&<div className="utilityNote">ℹ️ {error}</div>}
   <div className="connectorGrid">
    {items.map(x=><div className="connectorCard" key={x.id}>
      <div className="connectorIcon"><Plug size={16}/></div>
      <div className="connectorInfo"><b>{x.name}</b><span>{x.type} • {x.auth}</span></div>
      <button className={x.configured?"connected":"connectBtn"} onClick={()=>configure(x)}>
       {x.configured?<><Check size={13}/> Connected</>:<>Configure</>}
      </button>
    </div>)}
   </div>
   <div className="utilityNote"><KeyRound size={13}/> Credentials source code/local UI me store nahi hote. Per-user OAuth/PAT connection ke liye provider OAuth/app credentials aur server-side credential storage endpoint alag se required hai.</div>
  </div>
 </div></div>
}