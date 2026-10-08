import React,{useState}from"react";
import{Download,Loader2,PlayCircle,X}from"lucide-react";
import{apiUrl}from"./apiClient.js";

const authToken=()=>localStorage.getItem("bhai_user_session")||sessionStorage.getItem("bhai_user_session")||"";
const headers=()=>{const h={"Content-Type":"application/json"},t=authToken();if(t)h.Authorization="Bearer "+t;return h;};

export default function MediaStudioPanel({onClose}){
 const[prompt,setPrompt]=useState("");
 const[style,setStyle]=useState("3d");
 const[aspect,setAspect]=useState("16:9");
 const[autoPublish,setAutoPublish]=useState(false);
 const[action,setAction]=useState("");
 const[result,setResult]=useState(null);
 const[error,setError]=useState("");
 const busy=Boolean(action);
 async function call(kind){
  if(busy)return;
  setError("");setResult(null);setAction(kind);
  try{
   let body;
   if(kind==="image-pack")body={type:"image-pack",prompt:prompt.trim(),style,aspectRatio:aspect};
   else if(kind==="shorts")body={type:"shorts"};
   else body={prompt:prompt.trim(),durationSeconds:15,language:"Hindi",genre:"suspense",visualStyle:style==="anime"?"anime cinematic illustration":style==="2d"?"2D hand-drawn cartoon illustration":"3D anime cinematic cartoon",aspectRatio:aspect,autoPublish,privacy:"private",render:true,maxScenes:3};
   const r=await fetch(apiUrl(kind==="production"?"/api/production":"/api/media"),{method:"POST",headers:headers(),body:JSON.stringify(body)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok||d.error)throw new Error(d.error||("HTTP "+r.status));
   setResult(d);
  }catch(e){setError(String(e?.message||e));}
  finally{setAction("")}
 }
 return <div className="panelOverlay"><div className="utilityPanel mediaStudioPanel">
  <div className="utilityHead"><div><b>🎬 Media Studio</b><span>3D · Anime · 3-image pack · Shorts · YouTube production</span></div><button onClick={onClose}><X size={16}/></button></div>
  <div className="utilityBody">
   <div className="mediaStudioTabs">
    <button className={action==="image-pack"?"active":""} onClick={()=>call("image-pack")} disabled={!prompt.trim()||busy}>🖼️ 3 Images</button>
    <button className={action==="production"?"active":""} onClick={()=>call("production")} disabled={!prompt.trim()||busy}>🎬 Full Episode</button>
    <button className={action==="shorts"?"active":""} onClick={()=>call("shorts")} disabled={busy}>📱 Shorts</button>
   </div>
   <textarea className="mediaStudioPrompt" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Idea likho — example: Aarav abandoned house mein ek mysterious awaaz sunta hai..." rows="4"/>
   <div className="mediaStudioGrid">
    <label><span>Style</span><select value={style} onChange={e=>setStyle(e.target.value)}><option value="3d">3D cinematic</option><option value="anime">Anime</option><option value="2d">2D cartoon</option></select></label>
    <label><span>Aspect</span><select value={aspect} onChange={e=>setAspect(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option></select></label>
   </div>
   <label className="mediaStudioPublish"><input type="checkbox" checked={autoPublish} onChange={e=>setAutoPublish(e.target.checked)}/><span><b>Auto-publish YouTube</b><small>Sirf connected channel + verified upload hone par publish hoga.</small></span></label>
   {busy&&<div className="mediaStudioBusy"><Loader2 className="spin" size={15}/> {action==="image-pack"?"3 images generate ho rahi hain...":action==="shorts"?"Vertical Shorts render ho rahe hain...":"Full production pipeline run ho rahi hai..."}</div>}
   {error&&<div className="mediaStudioError">⚠️ {error}</div>}
   {result&&<div className="mediaStudioResult">
    <div className="mediaStudioStatus">{result.verified===true?"✅ Verified output":"⚠️ Partial / provider pending"}</div>
    {result.text&&<p>{result.text.replace(/[#*_]/g,"").slice(0,1200)}</p>}
    {result.youtubePackage&&<div className="mediaStudioCard"><b>📺 YouTube Package</b><span>{result.youtubePackage.title}</span><span>{result.youtubePackage.hashtags?.join(" ")}</span></div>}
    {(result.thumbnails||[]).length>0&&<div className="mediaStudioThumbs">{result.thumbnails.map(t=><div key={t.index}><img src={"data:"+t.mimeType+";base64,"+t.data}/><small>Thumbnail {t.index}</small></div>)}</div>}
    {(result.thumbnail?.data)&&!(result.thumbnails||[]).length&&<img className="mediaStudioHero" src={"data:"+result.thumbnail.mimeType+";base64,"+result.thumbnail.data}/>}
    {Array.isArray(result.images)&&result.images.map((im,i)=>im.video?<div className="mediaStudioAsset" key={"v"+i}><video src={"data:"+im.mimeType+";base64,"+im.data} controls playsInline/><a className="downloadBtn" href={"data:"+im.mimeType+";base64,"+im.data} download={"bhai-x-"+(im.name||"video")+"-"+(i+1)+".mp4"}><Download size={13}/> Download</a></div>:<div className="mediaStudioAsset" key={"i"+i}><img src={"data:"+im.mimeType+";base64,"+im.data}/><a className="downloadBtn" href={"data:"+im.mimeType+";base64,"+im.data} download={"bhai-x-image-"+(i+1)+".png"}><Download size={13}/> Download</a></div>)}
    {Array.isArray(result.shorts)&&result.shorts.length>0&&<div className="mediaStudioShorts">{result.shorts.map((s,i)=><div key={s.id||i}><div className="mediaStudioCard"><b>📱 {s.title||"Short "+(i+1)}</b><span>{s.hook||"9:16 highlight"}</span></div><video src={"data:"+s.media.mimeType+";base64,"+s.media.data} controls playsInline/><a className="downloadBtn" href={"data:"+s.media.mimeType+";base64,"+s.media.data} download={"bhai-x-short-"+(i+1)+".mp4"}><Download size={13}/> Download Short</a></div>)}</div>}
    {result.youtubeAuthUrl&&<a className="mediaStudioConnect" href={result.youtubeAuthUrl} target="_blank" rel="noopener noreferrer">🔐 Connect YouTube</a>}
   </div>}
  </div>
 </div></div>;
}
