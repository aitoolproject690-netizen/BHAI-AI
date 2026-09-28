import React,{useEffect,useState}from"react";
import{X,Plug,Check,Loader2,ExternalLink}from"lucide-react";

const FALLBACK=[
 ["github","GitHub","Coding / Repository"],["gitlab","GitLab","Coding / Repository"],["bitbucket","Bitbucket","Coding / Repository"],["replit","Replit","Coding / App"],["render","Render","Hosting / Deploy"],["vercel","Vercel","Hosting / Deploy"],["netlify","Netlify","Hosting / Deploy"],["railway","Railway","Hosting / Deploy"],["cloudflare","Cloudflare","Hosting / DNS"],["firebase","Firebase","Cloud / App"],["aws","AWS","Cloud"],["gcp","Google Cloud","Cloud"],["azure","Azure","Cloud"],["openai","OpenAI","AI"],["anthropic","Anthropic","AI"],["google-ai","Google AI","AI"],["huggingface","Hugging Face","AI"],["discord","Discord","Social"],["telegram","Telegram","Social"]
].map(([id,name,type])=>({id,name,type,auth:"OAuth / API / Webhook",status:"available"}));

export default function ConnectPanel({onClose}){
 const[items,setItems]=useState(FALLBACK),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const[connected,setConnected]=useState(()=>{try{return JSON.parse(localStorage.getItem("bhai_x_connections")||"{}")}catch{return{}}});
 useEffect(()=>{(async()=>{
  try{
   const r=await fetch("/api/control",{cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d?.error||"Connector service unavailable");
   const list=Array.isArray(d?.connectors)?d.connectors:[];
   if(list.length)setItems(list.map(x=>({id:String(x?.id||"unknown"),name:String(x?.name||x?.id||"Unnamed app"),type:String(x?.type||"service"),auth:String(x?.auth||"OAuth / API"),status:String(x?.status||"available")})));
  }catch(e){setError("Live connector catalog unavailable — showing built-in app list.");}
  finally{setBusy(false)}
 })()},[]);
 function toggle(id){
  const next={...connected,[id]:!connected[id]};
  setConnected(next);
  localStorage.setItem("bhai_x_connections",JSON.stringify(next));
 }
 return <div className="panelOverlay"><div className="utilityPanel connectorPanel">
  <div className="utilityHead"><div><b>🔌 Connect App / Service</b><span>Apps BHAI X ke saath connect kar sakta hai</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">
   <p className="utilityIntro">App select karo. Connection permission/API setup provider ke hisaab se hoga.</p>
   {busy&&<div className="utilityLoading"><Loader2 className="spin"/> Apps load ho rahe hain...</div>}
   {error&&<div className="utilityNote">ℹ️ {error}</div>}
   <div className="connectorGrid">
    {items.map(x=><div className="connectorCard" key={x.id}>
      <div className="connectorIcon"><Plug size={16}/></div>
      <div className="connectorInfo"><b>{x.name}</b><span>{x.type} • {x.auth}</span></div>
      <button className={connected[x.id]?"connected":"connectBtn"} onClick={()=>toggle(x.id)}>
       {connected[x.id]?<><Check size={13}/> Selected</>:<>Connect</>}
      </button>
    </div>)}
   </div>
   <div className="utilityNote">🔐 Abhi provider credentials/OAuth ko source code me store nahi kiya gaya hai. Ye panel connection registry hai; real OAuth/API authorization provider-by-provider secure vault se wire ki jayegi.</div>
  </div>
 </div></div>
}