import React,{useState}from"react";
import{X,WandSparkles,Copy,Download,Loader2,ShieldCheck,Bolt,Bug,Upload}from"lucide-react";
const langs=["javascript","python","typescript","java","cpp","c","html","css","sql","php","go","rust"];
const sample={javascript:`function getUser(user) {
  return user.profile.name;
}
console.log(getUser(undefined));`,python:`def total(items):
for item in items:
price = item["price"]
total += price
return total`};
export default function CodeFixPanel({onClose}){
 const[language,setLanguage]=useState("javascript"),[mode,setMode]=useState("fix"),[code,setCode]=useState(sample.javascript),[out,setOut]=useState(""),[meta,setMeta]=useState(null),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[file,setFile]=useState("");
 const run=async()=>{if(!code.trim()||busy)return;setBusy(true);setMeta(null);try{const r=await fetch("/api/codefix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code,language,mode,filename:file})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Code fix failed");setOut(d.fixedCode||"");setMeta(d)}catch(e){setMeta({error:e.message})}finally{setBusy(false)}};
 const copy=async()=>{if(!out)return;await navigator.clipboard.writeText(out);setCopied(true);setTimeout(()=>setCopied(false),1200)};
 const download=()=>{if(!out)return;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/plain"}));a.download=file||"fixed-code.txt";a.click();URL.revokeObjectURL(a.href)};
 const upload=async e=>{const f=e.target.files?.[0];if(!f)return;setFile(f.name);setCode(await f.text())};
 return <div className="panelOverlay"><div className="utilityPanel codeFixPanel">
  <div className="utilityHead"><div><b>🛠️ BHAI X — AI Code Fixer</b><span>Fix • Optimize • Security</span></div><button onClick={onClose}><X/></button></div>
  <div className="codeFixBody">
   <div className="codeFixControls"><select value={language} onChange={e=>setLanguage(e.target.value)}>{langs.map(x=><option key={x}>{x}</option>)}</select>
    <button className={mode==="fix"?"active":""} onClick={()=>setMode("fix")}><Bug size={14}/> Fix</button><button className={mode==="optimize"?"active":""} onClick={()=>setMode("optimize")}><Bolt size={14}/> Optimize</button><button className={mode==="security"?"active":""} onClick={()=>setMode("security")}><ShieldCheck size={14}/> Security</button><label className="uploadCode"><Upload size={14}/> File<input hidden type="file" onChange={upload}/></label>
   </div>
   <div className="codeFixGrid"><div><div className="codeTitle">Original / Broken Code</div><textarea value={code} onChange={e=>setCode(e.target.value)} spellCheck="false"/></div><div><div className="codeTitle">BHAI X Fixed Code</div><textarea value={out} readOnly spellCheck="false" placeholder="Fixed code yahan aayega..."/></div></div>
   <div className="codeFixActions"><button className="primary" onClick={run} disabled={busy||!code.trim()}><WandSparkles size={16}/>{busy?"AI fixing...":"BHAI X Fix Run"}</button><button onClick={copy} disabled={!out}><Copy size={15}/>{copied?"Copied":"Copy"}</button><button onClick={download} disabled={!out}><Download size={15}/>Download</button></div>
   {meta?.error&&<div className="codeError">⚠️ {meta.error}</div>}
   {meta&&!meta.error&&<div className="codeReport"><b>What changed</b><p>{meta.explanation}</p>{meta.issues?.length>0&&<><b>Issues</b><ul>{meta.issues.map((x,i)=><li key={i}>{x}</li>)}</ul></>}{meta.security?.length>0&&<><b>Security</b><ul>{meta.security.map((x,i)=><li key={i}>{x}</li>)}</ul></>}{meta.changes?.length>0&&<><b>Changes</b><ul>{meta.changes.map((x,i)=><li key={i}>{x}</li>)}</ul></>}</div>}
  </div>
 </div></div>
}
