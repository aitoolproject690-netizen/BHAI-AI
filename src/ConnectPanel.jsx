import React,{useEffect,useState}from"react";
import{X,Plug,Check,ExternalLink,Loader2}from"lucide-react";

export default function ConnectPanel({onClose}){
 const[items,setItems]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const[connected,setConnected]=useState(()=>{try{return JSON.parse(localStorage.getItem("bhai_x_connections")||"{}")}catch{return{}}});
 useEffect(()=>{(async()=>{try{const r=await fetch("/api/control?kind=connectors");const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load connectors");setItems(d.connectors||[])}catch(e){setError(e.message)}finally{setBusy(false)}})()},[]);
 function toggle(id){
  const next={...connected,[id]:!connected[id]};setConnected(next);localStorage.setItem("bhai_x_connections",JSON.stringify(next));
 }
 return <div className="panelOverlay"><div className="utilityPanel">
  <div className="utilityHead"><div><b>🔌 Connect App / Service</b><span>Connectors • OAuth / API / Webhook ready</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody"><p className="utilityIntro">BHAI X me jis app ko use karna hai, yahan se connection manage hoga.</p>
   {busy?<div className="utilityLoading"><Loader2 className="spin"/> Loading connectors...</div>:error?<div className="utilityError">{error}</div>:
   <div className="connectorGrid">{items.map(x=><div className="connectorCard" key={x.id}><div className="connectorIcon"><Plug size={16}/></div><div className="connectorInfo"><b>{x.name}</b><span>{x.type} • {x.auth}</span></div><button className={connected[x.id]?"connected":"connectBtn"} onClick={()=>toggle(x.id)}>{connected[x.id]?<><Check size={13}/> Connected</>:<>Connect</>}</button></div>)}</div>}
   <div className="utilityNote">ℹ️ Abhi UI connection state local hai. Real OAuth/API credential linking next connector implementation me provider-by-provider enable hoga.</div>
  </div>
 </div></div>
}