import React,{useEffect,useState}from"react";
import{X,LogIn,Wallet,ShieldCheck,Receipt,LogOut,RefreshCw}from"lucide-react";
const API="https://bhai-ai-vpna.onrender.com";
export default function ResellerPanel({onClose}){
 const[token,setToken]=useState(()=>sessionStorage.getItem("bhai_reseller_session")||"");
 const[reseller,setReseller]=useState(null),[ledger,setLedger]=useState([]),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const headers=()=>({"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{})});
 async function load(){
  if(!token)return;
  setBusy(true);setError("");
  try{
   const r=await fetch(API+"/api/resellers?me=1",{headers:headers()});const d=await r.json();if(!r.ok)throw new Error(d.error||"Session expired");
   setReseller(d.reseller);
   const lr=await fetch(API+"/api/resellers?ledger=1",{headers:headers()});const ld=await lr.json();setLedger(ld.ledger||[]);
  }catch(e){sessionStorage.removeItem("bhai_reseller_session");setToken("");setReseller(null);setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[token]);
 async function login(){
  setBusy(true);setError("");
  try{const r=await fetch(API+"/api/resellers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"login",email,password})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Login failed");sessionStorage.setItem("bhai_reseller_session",d.session);setToken(d.session);setReseller(d.reseller);setPassword("")}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function logout(){if(token)await fetch(API+"/api/resellers",{method:"POST",headers:headers(),body:JSON.stringify({action:"logout"})}).catch(()=>{});sessionStorage.removeItem("bhai_reseller_session");setToken("");setReseller(null);setLedger([])}
 return <div className="ownerOverlay"><div className="ownerPanel accountPanel">
  <div className="ownerHead"><div><b>🧾 BHAI X Reseller Panel</b><span>Wallet • permissions • transactions</span></div><button onClick={onClose}><X/></button></div>
  {!reseller?<div className="ownerLogin"><LogIn size={42}/><h2>Reseller Login</h2><p>Use the reseller account created by Owner.</p><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Reseller email" type="email"/><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e=>e.key==="Enter"&&login()}/><button onClick={login} disabled={busy||!email||password.length<8}>{busy?"Signing in...":"Login"}</button>{error&&<div className="ownerError">{error}</div>}</div>:
  <div className="ownerBody">
   {error&&<div className="ownerError">{error}</div>}
   <div className="ownerGrid">
    <div className="ownerCard"><Wallet/><b>Wallet Balance</b><span className="good">{reseller.balance}</span></div>
    <div className="ownerCard"><ShieldCheck/><b>Status</b><span className="good">{reseller.blocked?"Blocked":"Active"}</span></div>
    <div className="ownerCard"><Receipt/><b>Transactions</b><span>{ledger.length} recent</span></div>
   </div>
   <section className="ownerSection"><div className="sectionTitle"><ShieldCheck/><b>Permissions</b></div><div className="permRow">{(reseller.permissions||[]).map(p=><span className="selected" key={p}>{p}</span>)}{!(reseller.permissions||[]).length&&<span>No permissions assigned</span>}</div></section>
   <section className="ownerSection"><div className="sectionTitle"><Receipt/><b>Wallet Ledger</b><button onClick={load} disabled={busy}><RefreshCw size={14}/></button></div>
    {ledger.length?ledger.map(x=><div className="delegateRow" key={x.id}><div><b>{x.reason||"Wallet adjustment"}</b><span>{new Date(x.created_at).toLocaleString()}</span></div><strong>{x.amount>0?"+":""}{x.amount}</strong></div>):<div className="delegateRow"><span>No transactions yet.</span></div>}
   </section>
   <button className="addAdmin" onClick={logout}><LogOut size={15}/> Logout</button>
  </div>}
 </div></div>
}