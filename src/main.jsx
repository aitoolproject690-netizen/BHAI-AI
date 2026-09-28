import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{Send,Mic,Paperclip,Plus,Loader2,Zap,ShieldCheck,Globe2,Code2,Image as ImageIcon,Menu,Search,Settings,Copy,Check,ChevronDown,Download,X,Paperclip as Clip,PanelLeftClose,PanelLeftOpen,RefreshCw,Target,Plug}from'lucide-react';
import'./styles.css';
import OwnerPanel from'./OwnerPanel.jsx';
import ConnectPanel from'./ConnectPanel.jsx';
import SettingsPanel from'./SettingsPanel.jsx';

const K='bhai_x_v3';
const starter={id:crypto.randomUUID(),role:'assistant',text:'Bhai 😎 BHAI X ready hai.\n\nJo kaam chahiye seedha bol — research, coding, GitHub, image, files ya build. DO IT ON hai, to jahan possible hoga main actual kaam karunga.'};

function renderText(text=''){
 const urlRe=/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
 return text.split(urlRe).map((part,i)=>{
  const clean=part.replace(/[.,!?;:]+$/,'');const trailing=part.slice(clean.length);
  if(clean.startsWith('http://')||clean.startsWith('https://')||clean.startsWith('www.')){
   const href=clean.startsWith('www.')?'https://'+clean:clean;
   return <React.Fragment key={i}><a className="messageLink" href={href} target="_blank" rel="noopener noreferrer">{clean}</a>{trailing}</React.Fragment>;
  }
  return <React.Fragment key={i}>{part}</React.Fragment>;
 });
}

function App(){
 const[sessions,setSessions]=useState(()=>{try{return JSON.parse(localStorage.getItem(K))||[]}catch{return[]}});
 const[active,setActive]=useState(null),[input,setInput]=useState(''),[running,setRunning]=useState(false),[doIt,setDoIt]=useState(true);
 const[fileInfo,setFileInfo]=useState(null),[listening,setListening]=useState(false),[activity,setActivity]=useState([]),[activityOpen,setActivityOpen]=useState(false);
 const[sidebar,setSidebar]=useState(true),[search,setSearch]=useState(''),[toolsOpen,setToolsOpen]=useState(false),[copied,setCopied]=useState(''),[ownerOpen,setOwnerOpen]=useState(false),[connectOpen,setConnectOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[missionMode,setMissionMode]=useState(false);
 const end=useRef(null),recognition=useRef(null);

 useEffect(()=>{if(!sessions.length){const s={id:crypto.randomUUID(),title:'New chat',messages:[starter]};setSessions([s]);setActive(s.id)}else if(!active)setActive(sessions[0].id)},[]);
 useEffect(()=>{localStorage.setItem(K,JSON.stringify(sessions));end.current?.scrollIntoView({behavior:'smooth'})},[sessions]);
 const chat=sessions.find(x=>x.id===active);
 const upd=fn=>setSessions(a=>a.map(s=>s.id===active?{...s,messages:fn(s.messages)}:s));

 async function send(textOverride){
  let t=(textOverride??input).trim();
  if(fileInfo)t=t+'\n\n[Attached file: '+fileInfo.name+']\n'+fileInfo.text;
  if(!t||running||!chat)return;
  if(missionMode){await compileMission(t);return;}
  setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(false);
  const id=crypto.randomUUID();
  setActivity([{id:id+'1',step:'Planning',text:'Planning task requirements...',state:'running'},{id:id+'2',step:'Tools',text:'Selecting tools...',state:'pending'},{id:id+'3',step:'Working',text:'Executing task...',state:'pending'},{id:id+'4',step:'Done',text:'Finalizing response...',state:'pending'}]);
  const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t}];
  upd(()=>next);setSessions(a=>a.map(s=>s.id===active&&s.title==='New chat'?{...s,title:t.slice(0,32)}:s));
  try{
   setTimeout(()=>setActivity(a=>a.map(x=>x.id===id+'1'?{...x,state:'done'}:x.id===id+'2'?{...x,state:'running'}:x)),350);
   const r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next,doIt})});
   const d=await r.json();
   setActivity(a=>a.map(x=>x.id===id+'2'?{...x,state:'done'}:x.id===id+'3'?{...x,state:'done'}:x.id===id+'4'?{...x,state:'done'}:x));
   if(Array.isArray(d.activity)&&d.activity.length)setActivity(a=>[...a,...d.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Tool',text:x.state||'done',state:x.state||'done'}))]);
   upd(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:d.text||('⚠️ '+(d.error||'Request failed')),images:d.images||[]}]);
  }catch(e){upd(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:'⚠️ Connection error: '+e.message}]);setActivity(a=>a.map(x=>({...x,state:'failed'})))}finally{setRunning(false)}
 }

 function newChat(){const s={id:crypto.randomUUID(),title:'New chat',messages:[starter]};setSessions(a=>[s,...a]);setActive(s.id);setInput('');setFileInfo(null);setActivity([]);setActivityOpen(false)}
 function toggleMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Bhai, is phone par voice input support nahi hai.');return}
  if(listening){recognition.current?.stop();return}
  const r=new SR();r.lang='hi-IN';r.interimResults=true;r.continuous=false;
  r.onstart=()=>setListening(true);r.onend=()=>setListening(false);r.onerror=()=>setListening(false);
  r.onresult=e=>{let s='';for(const x of e.results)s+=x[0].transcript;setInput(v=>(v?v+' ':'')+s)};
  recognition.current=r;r.start();
 }
 function useTool(label){
  if(label==='connect'){setConnectOpen(true);setToolsOpen(false);return}
  const prompts={web:'Web search karke current information verify karo: ',image:'Ek image generate karo: ',coding:'Coding task solve karo: ',github:'GitHub par actual kaam karo: '};
  if(label==='connect'){setConnectOpen(true);setToolsOpen(false);return}
  setInput(v=>(v?v+'\n':'')+prompts[label]);setToolsOpen(false);
 }
 async function compileMission(goalOverride){
  const goal=(goalOverride??input).trim(); if(!goal||running)return;
  setRunning(true);setToolsOpen(false);
  try{
   const r=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'compile_goal',goal})});
   const d=await r.json(); if(!r.ok)throw new Error(d.error||'Mission compile failed');
   const m=d.mission; const plan='🎯 MISSION MODE\\n\\nGoal: '+m.goal+'\\n\\n'+m.steps.map((s,i)=>(i+1)+'. '+s.name).join('\\n')+'\\n\\nStatus: '+m.steps.length+' steps compiled. DO IT ON karke execution start kar sakte ho.';
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:goal},{id:crypto.randomUUID(),role:'assistant',text:plan}];
   upd(()=>next);setInput('');setMissionMode(false);
  }catch(e){upd(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:'⚠️ '+e.message}])}finally{setRunning(false)}
 }
 async function copyText(text,id){try{await navigator.clipboard.writeText(text);setCopied(id);setTimeout(()=>setCopied(''),1200)}catch{}}
 const filtered=sessions.filter(s=>s.title.toLowerCase().includes(search.toLowerCase()));
 return <div className="app">
  <aside className={sidebar?'sidebar':'sidebar closed'}>
   <div className="sideTop">
    <div className="brand"><div className="logo">B</div><div><b>BHAI X</b><span>Personal AI Agent</span></div></div>
    <button className="sideToggle" onClick={()=>setSidebar(false)}><PanelLeftClose size={17}/></button>
   </div>
   <button className="newChat" onClick={newChat}><Plus size={17}/> New chat</button>
   <div className="searchBox"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chats"/></div>
   <div className="history">{filtered.map(s=><button className={s.id===active?'chat active':'chat'} onClick={()=>setActive(s.id)} key={s.id}>{s.title}</button>)}</div>
   <div className="sideBottom"><div className="status"><span/> Agent online</div><button className="ownerOpenBtn" onClick={()=>setOwnerOpen(true)}><ShieldCheck size={15}/> Owner Control</button><div className="sideUser"><div className="miniAvatar">B</div><span>BHAI X</span><button className="settingsBtn" aria-label="Settings" onClick={()=>setSettingsOpen(true)}><Settings size={16}/></button></div></div>
  </aside>
  <main>
   <header>
    {!sidebar&&<button className="openSide" onClick={()=>setSidebar(true)}><PanelLeftOpen size={19}/></button>}
    <div className="topTitle"><b>BHAI X</b><button className="modelBtn">BHAI X Agent <ChevronDown size={14}/></button></div>
    <button className="headerIconBtn" aria-label="Settings" title="Settings" onClick={()=>setSettingsOpen(true)}><Settings size={18}/></button><button className={doIt?'topDo on':'topDo'} onClick={()=>setDoIt(v=>{const n=!v;localStorage.setItem('bhai_x_default_doit',String(n));return n})}><Zap size={14}/> DO IT {doIt?'ON':'OFF'}</button>
   </header>
   <section className="messages">
    {chat?.messages.map(m=><div className={m.role==='user'?'row user':'row'} key={m.id}>
      <div className={m.role==='user'?'bubble userBubble':'bubble'}>
       {m.role==='assistant'&&<div className="assistantLabel"><div className="miniLogo">B</div><b>BHAI X</b></div>}
       <div className="messageText">{renderText(m.text)}</div>
       {m.images?.map((im,i)=>{const src='data:'+im.mimeType+';base64,'+im.data;return <div className="generatedWrap" key={i}><img className="generatedImage" src={src}/><a className="downloadBtn" href={src} download={'bhai-x-image-'+(i+1)+'.png'}><Download size={14}/> Download</a></div>})}
       {m.role==='assistant'&&!running&&<div className="messageActions"><button onClick={()=>copyText(m.text,m.id)}>{copied===m.id?<Check size={13}/>:<Copy size={13}/>} {copied===m.id?'Copied':'Copy'}</button></div>}
      </div>
    </div>)}
    {running&&<div className="row"><div className="bubble working"><Loader2 className="spin" size={16}/> BHAI X is working...</div></div>}
    <div ref={end}/>
   </section>
   {activityOpen&&<section className="activity"><div className="activityHead"><b>Task steps</b><button onClick={()=>setActivityOpen(false)}><X size={14}/></button></div>{activity.map(x=><div className="activityItem" key={x.id}><span className={x.state==='done'?'ok':''}>{x.state==='done'?<Check size={12}/>:<Loader2 size={12} className={x.state==='running'?'spin':''}/>}</span><b>{x.step}</b><span>{x.text}</span></div>)}</section>}
   <div className="composerWrap">
    <div className="composerTools">
     <div className="toolMenuWrap">
      <button className="roundBtn" onClick={()=>setToolsOpen(v=>!v)}><Plus size={20}/></button>
      {toolsOpen&&<div className="toolMenu"><button onClick={()=>useTool('web')}><Globe2/> Web search</button><button onClick={()=>useTool('image')}><ImageIcon/> Create image</button><button onClick={()=>useTool('coding')}><Code2/> Coding</button><button onClick={()=>useTool('github')}><Zap/> GitHub / DO IT</button><button onClick={()=>useTool('mission')}><Target/> Mission Mode</button><button onClick={()=>useTool('connect')}><Plug/> Connect App</button></div>}
     </div>
     <label className="roundBtn attach"><Paperclip size={19}/><input type="file" hidden onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setFileInfo({name:f.name,text:(await f.text()).slice(0,50000)})}}/></label>
     <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Message BHAI X..." rows="1"/>
     <button className={listening?'roundBtn mic listening':'roundBtn mic'} onClick={toggleMic}><Mic size={19}/></button>
     <button className="sendBtn" disabled={!input.trim()&&!fileInfo||running} onClick={()=>send()}>{running?<Loader2 className="spin" size={19}/>:<Send size={19}/>}</button>
    </div>
    {fileInfo&&<div className="fileChip"><Paperclip size={12}/> {fileInfo.name}<button onClick={()=>setFileInfo(null)}><X size={12}/></button></div>}
    <div className="composerHint">BHAI X can search, code, generate images, work with files and execute tasks. <b>Check important results.</b></div>
   </div>
  </main>
 {ownerOpen&&<OwnerPanel onClose={()=>setOwnerOpen(false)}/>}\n {connectOpen&&<ConnectPanel onClose={()=>setConnectOpen(false)}/>}\n {settingsOpen&&<SettingsPanel onClose={()=>setSettingsOpen(false)}/>}\n </div>
}
createRoot(document.getElementById('root')).render(<App/>);