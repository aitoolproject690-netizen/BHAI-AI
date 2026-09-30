import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{Send,Mic,Activity as ActivityIcon,Paperclip,Plus,Loader2,Zap,ShieldCheck,Globe2,Code2,Image as ImageIcon,Menu,Search,Settings,Copy,Check,ChevronDown,UserCircle,Download,X,Paperclip as Clip,PanelLeftClose,PanelLeftOpen,RefreshCw,Target,Plug,WandSparkles,BrainCircuit}from'lucide-react';
import'./styles.css';
import OwnerPanel from'./OwnerPanel.jsx';
import AccountPanel from'./AccountPanel.jsx';
import ConnectPanel from'./ConnectPanel.jsx';
import SettingsPanel from'./SettingsPanel.jsx';
import CodeFixPanel from'./CodeFixPanel.jsx';
import GeneratorPanel from'./GeneratorPanel.jsx';
import SystemPanel from'./SystemPanel.jsx';
import ResellerPanel from'./ResellerPanel.jsx';
import ProjectBrainPanel from'./ProjectBrainPanel.jsx';

const API_BASE='https://bhai-ai-vpna.onrender.com';
const apiUrl=p=>API_BASE+p;
const authToken=()=>localStorage.getItem('bhai_user_session')||sessionStorage.getItem('bhai_user_session')||'';
const authHeaders=()=>{const h={'Content-Type':'application/json'},t=authToken();if(t)h.Authorization='Bearer '+t;return h;}

const K='bhai_x_v3';
const starter={id:crypto.randomUUID(),role:'assistant',text:'Bhai 😎 BHAI X ready hai.\n\nJo kaam chahiye seedha bol — research, coding, GitHub, image, files ya build. DO IT ON hai, to jahan possible hoga main actual kaam karunga.\n\nMain sirf jawab dene wala chatbot nahi hoon — project ka context yaad rakhkar bataunga ki kya complete hua, kya baaki hai, aur next mein kya add/fix karna useful rahega.'};

function renderInline(text=''){
 const tokenRe=/(\\[[^\\]]+\\]\\(https?:\\/\\/[^\\s)]+\\)|https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*]+\\*|_[^_]+_|\`[^\`]+\`)/g;
 const parts=String(text).split(tokenRe);
 return parts.map((part,i)=>{
  if(!part)return null;
  const md=part.match(/^\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)$/);
  if(md) return <React.Fragment key={i}><a className="messageLink" href={md[2]} target="_blank" rel="noopener noreferrer">{md[1]}</a></React.Fragment>;
  const urlMatch=part.match(/^(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+)$/);
  if(urlMatch){
   const raw=urlMatch[1];const clean=raw.replace(/[.,!?;:]+$/,'');const trailing=raw.slice(clean.length);
   const href=clean.startsWith('www.')?'https://'+clean:clean;
   return <React.Fragment key={i}><a className="messageLink" href={href} target="_blank" rel="noopener noreferrer">{clean}</a>{trailing}</React.Fragment>;
  }
  let node=part;
  if(part.startsWith('**')&&part.endsWith('**'))node=<strong>{part.slice(2,-2)}</strong>;
  else if(part.startsWith('__')&&part.endsWith('__'))node=<strong>{part.slice(2,-2)}</strong>;
  else if(part.startsWith('*')&&part.endsWith('*'))node=<em>{part.slice(1,-1)}</em>;
  else if(part.startsWith('_')&&part.endsWith('_'))node=<em>{part.slice(1,-1)}</em>;
  else if(part.startsWith('`')&&part.endsWith('`'))node=<code className="inlineCode">{part.slice(1,-1)}</code>;
  return <React.Fragment key={i}>{node}</React.Fragment>;
 });
}

function renderText(text='',onCopy){
 const lines=String(text).replace(/\r/g,'').split('\n');
 const out=[]; let i=0, listType=null, listItems=[];
 const flushList=()=>{if(!listItems.length)return;const Tag=listType==='ol'?'ol':'ul';out.push(<Tag className="mdList" key={'list-'+i}>{listItems.map((x,j)=><li key={j}>{renderInline(x)}</li>)}</Tag>);listItems=[];listType=null;};
 while(i<lines.length){
  const line=lines[i];
  if(/^\s*```/.test(line)){
   flushList();const lang=line.replace(/^\s*```/,'').trim();const code=[];i++;
   while(i<lines.length&&!/^\s*```\s*$/.test(lines[i])){code.push(lines[i]);i++;}
   if(i<lines.length)i++;
   const value=code.join('\n');out.push(<div className="codeBlock" key={'code-'+i}><div className="codeHead"><span>{lang||'code'}</span><button onClick={()=>onCopy?.(value)}><Copy size={13}/> Copy</button></div><pre><code>{value}</code></pre></div>);continue;
  }
  const h=line.match(/^\s*(#{1,6})\s+(.+)$/);
  if(h){flushList();const level=Math.min(h[1].length,6);const Tag='h'+level;out.push(React.createElement(Tag,{className:'mdHeading',key:i},renderInline(h[2])));i++;continue;}
  const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
  const num=line.match(/^\s*\d+[.)]\s+(.+)$/);
  if(bullet||num){const type=bullet?'ul':'ol';if(listType&&listType!==type)flushList();listType=type;listItems.push((bullet||num)[1]);i++;continue;}
  if(!line.trim()){flushList();out.push(<div className="mdSpacer" key={i}/>);i++;continue;}
  flushList();out.push(<p className="mdParagraph" key={i}>{renderInline(line)}</p>);i++;
 }
 flushList();return out;
}

function App(){
 const[sessions,setSessions]=useState(()=>{try{return JSON.parse(localStorage.getItem(K))||[]}catch{return[]}});
 const[active,setActive]=useState(null),[input,setInput]=useState(''),[running,setRunning]=useState(false),[doIt,setDoIt]=useState(true);
 const[fileInfo,setFileInfo]=useState(null),[listening,setListening]=useState(false),[activity,setActivity]=useState([]),[activityOpen,setActivityOpen]=useState(false);
 const[sidebar,setSidebar]=useState(true),[search,setSearch]=useState(''),[toolsOpen,setToolsOpen]=useState(false),[copied,setCopied]=useState(''),[ownerOpen,setOwnerOpen]=useState(false),[connectOpen,setConnectOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[missionMode,setMissionMode]=useState(false),[codeFixOpen,setCodeFixOpen]=useState(false),[generatorOpen,setGeneratorOpen]=useState(false),[systemOpen,setSystemOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[account,setAccount]=useState(null),[resellerOpen,setResellerOpen]=useState(false),[brainOpen,setBrainOpen]=useState(false),[usage,setUsage]=useState({images:0,videos:0,imageLimit:10,videoLimit:3});
 const end=useRef(null),recognition=useRef(null),workTicker=useRef(null); const[resumeMission,setResumeMission]=useState(null);

 useEffect(()=>{if(!sessions.length){const s={id:crypto.randomUUID(),title:'New chat',messages:[starter]};setSessions([s]);setActive(s.id)}else if(!active)setActive(sessions[0].id)},[]);
 useEffect(()=>{localStorage.setItem(K,JSON.stringify(sessions));end.current?.scrollIntoView({behavior:'smooth'})},[sessions]);
 useEffect(()=>{try{const cp=JSON.parse(localStorage.getItem('bhai_x_checkpoint')||'null');if(cp?.id)setResumeMission(cp)}catch{}},[]);
 const chat=sessions.find(x=>x.id===active);
 const upd=fn=>setSessions(a=>a.map(s=>s.id===active?{...s,messages:fn(s.messages)}:s));

 async function send(textOverride){
  let t=(textOverride??input).trim();
  if(fileInfo)t=t+'\n\n[Attached file: '+fileInfo.name+']\n'+fileInfo.text;
  if(!t||running||!chat)return;
  if(missionMode){await compileMission(t);return;}
  const casualKey=t.toLowerCase().replace(/[!?.,]+/g,' ').replace(/\s+/g,' ').replace(/\s+bhai$/i,'').trim();
  const instantCasual={
   "hi":"Arre bhai! 😄 Main yahin hoon. Batao kya scene hai? 🚀","hello":"Hello bhai! 😎 BHAI X ready hai. Batao kya karna hai? 🚀","hey":"Hey bhai! 😄 Kya chal raha hai? 🚀","hii":"Hii bhai! 😄 Batao kya karna hai? 🚀","helo":"Hello bhai! 😄 Main ready hoon. 🚀","namaste":"Namaste bhai! 🙏 Batao kya kaam karein?","salam":"Walaikum salam bhai! 😄 Batao kya scene hai?","kaise ho":"Ekdum badhiya bhai 😎 Tum batao?","kaisa hai":"Badhiya bhai 😎 Main full ready hoon!","kya haal":"Mast bhai 😄 Tum batao kya haal?","kya chal raha":"Bas bhai, BHAI X ka kaam full speed mein chal raha hai 😄🚀 Tum batao?","kya chal rha":"Bas bhai, BHAI X ka kaam full speed mein chal raha hai 😄🚀 Tum batao?","kya kar rahe ho":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","kya scene hai":"Sab mast bhai 😄 Batao aaj kya kaam pakadna hai? 🚀","kya hua":"Kuch nahi bhai 😄 Main ekdum ready hoon. Batao kya hua?","thanks":"Arey bhai, anytime! 😎❤️","thank you":"Arey bhai, anytime! 😎❤️","thik hai":"Theek hai bhai 😄👍","theek hai":"Theek hai bhai 😄👍","ok":"Done bhai 😎👍","okay":"Done bhai 😎👍","nice":"Hehe 😄🔥","wah":"😄🔥 Bas bhai!","haha":"😂😂 Bhai, hasi rukni nahi chahiye!","bye":"Bye bhai! 👋😄","goodbye":"Bye bhai! 👋😄"
  };
  const casualChat=Object.prototype.hasOwnProperty.call(instantCasual,casualKey);
  const fastLocal={
   "good morning":"Good morning bhai! ☀️😎 Aaj kya kaam pakadna hai? 🚀",
   "good evening":"Good evening bhai! 😄🌆 Batao kya scene hai?",
   "good night":"Good night bhai! 😴🌙 Kal phir dhamaka karenge! 🚀",
   "shukriya":"Arey bhai, anytime! ❤️😎",
   "dhanyawad":"Arey bhai, anytime! 🙏😄",
   "cool":"😎🔥 Bilkul bhai!",
   "perfect":"Perfect bhai! 😎🔥",
   "mast":"Mast bhai! 😂🔥",
   "sahi":"Sahi hai bhai! 😎👍",
   "haan":"Haan bhai 😄👍",
   "han":"Haan bhai 😄👍",
   "yes":"Yes bhai! 😎🚀",
   "no":"Theek hai bhai 😄",
   "nahi":"Theek hai bhai 😄👍",
   "lol":"😂😂 Bhai!",
   "😂":"😂😂",
   "🤣":"🤣🤣 Bhai, kya scene hai!",
   "😎":"😎🔥",
   "❤️":"❤️ Bhai!",
   "love you":"❤️😂 Bhai, same energy!",
   "kya karu":"Bata bhai, jo kaam hai seedha bol 😎🚀",
   "help":"Haan bhai, bol kya help chahiye? 🛠️",
   "help bhai":"Haan bhai, bol kya help chahiye? 🛠️",
   "sun":"Haan bhai, sun raha hoon 😄",
   "ek baat bol":"Bol bhai 😄",
   "bata":"Haan bhai, bataata hoon 😎",
   "ruko":"Theek hai bhai, ruk gaya 😄✋"
  };
  const fastKey=casualKey;
  const instantReply=instantCasual[fastKey]||fastLocal[fastKey];
  const instantMessage=Boolean(instantReply);
  if(instantMessage){
   const id=crypto.randomUUID();
   setInput('');setFileInfo(null);setToolsOpen(false);
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id,role:'assistant',text:instantReply}];
   upd(()=>next);
   if(chat.title==='New chat')setSessions(a=>a.map(s=>s.id===active?{...s,title:t.slice(0,32)}:s));
   return;
  }
  setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
  const id=crypto.randomUUID();
  const workSteps=[['Planning','🧠 Bhai, request samajh raha hoon...','running'],['Checking','🔎 Project aur required context check kar raha hoon...','pending'],['Tools','🛠️ Sahi tools select kar raha hoon...','pending'],['Working','⚙️ Ab actual kaam execute ho raha hai...','pending'],['Verifying','✅ Result verify kar raha hoon...','pending'],['Done','🚀 Final result ready kar raha hoon...','pending']];
  setActivity(workSteps.map((x,n)=>({id:id+n,step:x[0],text:x[1],state:x[2]})));
  clearInterval(workTicker.current); let tick=0;
  workTicker.current=setInterval(()=>{tick++;setActivity(a=>a.map((x,n)=>{const activeIndex=Math.min(Math.floor(tick/2),workSteps.length-1);return {...x,state:n<activeIndex?'done':n===activeIndex?'running':'pending',text:workSteps[n][1]};}));},1400);
  const replyId=id+'-reply';
  const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'⚡ Bhai, dekh raha hoon...'}];
  upd(()=>next);setSessions(a=>a.map(s=>s.id===active&&s.title==='New chat'?{...s,title:t.slice(0,32)}:s));
  try{
   const pf=casualChat?{ready:true}:await fetch(apiUrl("/api/control"),{method:"POST",headers:authHeaders(),body:JSON.stringify({action:"preflight"})}).then(r=>r.json()).catch(e=>({ready:false,risks:[{message:e.message}]})); if(!pf.ready){upd(m=>m.map(x=>x.id===replyId?{...x,text:"🛡️ PRE-FLIGHT STOP\n\n"+(pf.risks||[]).map(x=>"⚠️ "+x.message).join("\n")+"\n\nBHAI X ne predictable failure se pehle task rok diya. Required connection/model fix karo, phir task resume karenge."}:x));setActivity(a=>a.map(x=>({...x,state:x.state==="running"?"failed":x.state})));return;} setActivity(a=>a.map(x=>x.id===id+"1"?{...x,state:"done"}:x.id===id+"2"?{...x,state:"running"}:x));
   let dnaContext=''; if(!casualChat){try{const dr=await fetch(apiUrl('/api/dna?project=default'),{headers:authHeaders()}).then(x=>x.json()); dnaContext=JSON.stringify(dr.data||{}).slice(0,5000)}catch{}}
   const agentMessages=dnaContext?[...next,{id:crypto.randomUUID(),role:'user',text:'PROJECT DNA CONTEXT (use as context, do not repeat): '+dnaContext}]:next;
   const agentToken=account?.session||localStorage.getItem("bhai_user_session")||sessionStorage.getItem("bhai_user_session")||""; const agentHeaders={"Content-Type":"application/json"}; if(agentToken)agentHeaders.Authorization="Bearer "+agentToken; const controller=new AbortController(); const agentTimeout=setTimeout(()=>controller.abort(),300000);
   let r; try{r=await fetch(apiUrl('/api/agent'),{method:'POST',headers:agentHeaders,body:JSON.stringify({messages:agentMessages,doIt}),signal:controller.signal});}finally{clearTimeout(agentTimeout)}
   const d=await r.json();
   if(!r.ok||d.error){const rr=await fetch(apiUrl('/api/control'),{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'recovery_plan',error:d.error||('HTTP '+r.status),stage:'agent'})}).catch(()=>null);const rp=rr?await rr.json().catch(()=>({})):{};upd(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:'⚠️ ERROR DETECTOR\n\n'+(d.error||('Backend HTTP '+r.status))+'\n\n🛡️ Preventive recovery: '+(rp.plan||[]).map(x=>x.action).join(' → ')+'\n\nBHAI X ne is result ko verified DONE nahi maana.'}]);setActivity(a=>a.map(x=>({...x,state:'failed'})));return;}
   if(d.usage)setUsage(d.usage); setActivity(a=>a.map(x=>x.id===id+'2'?{...x,state:'done'}:x.id===id+'3'?{...x,state:'done'}:x.id===id+'4'?{...x,state:'done'}:x));
   if(Array.isArray(d.activity)&&d.activity.length)setActivity(a=>[...a,...d.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Tool',text:x.state||'done',state:x.state||'done'}))]);
   upd(m=>m.map(x=>x.id===replyId?{...x,text:d.text||('⚠️ '+(d.error||'Request failed')),images:d.images||[]}:x));
   if(casualChat)return;
   void (async()=>{
    await Promise.allSettled([
     fetch(apiUrl('/api/diff'),{method:'POST',headers:authHeaders(),body:JSON.stringify({type:'agent-task',summary:t,files:(d.activity||[]).map(x=>x.tool||'tool'),commit:d.commit||null,verification:d.verified||d.verification||null})}),
     fetch(apiUrl('/api/dna'),{method:'POST',headers:authHeaders(),body:JSON.stringify({project:'default',data:{lastGoal:t,lastResult:String(d.text||'').slice(0,2500),lastVerified:d.verified||d.verification||null,lastUpdated:new Date().toISOString()}})})
    ]);
    try{
     const sr=await fetch(apiUrl('/api/suggestions'),{method:'POST',headers:authHeaders(),body:JSON.stringify({goal:t,completed:d.completed||[],remaining:d.remaining||[]})});
     const sd=await sr.json();
     if(Array.isArray(sd.suggestions)&&sd.suggestions.length){
      const suggestionText='💡 SMART SUGGESTIONS\\n\\n'+sd.suggestions.map(x=>'• '+x).join('\\n');
      upd(m=>{const last=m[m.length-1];if(last?.text===suggestionText)return m;return [...m,{id:crypto.randomUUID(),role:'assistant',text:suggestionText}]});
     }
    }catch{}
   })();
  }catch(e){const msg=e?.name==='AbortError'?'Agent request timed out after 300 seconds. Checkpoint/retry can resume the task.':e.message;try{const rr=await fetch(apiUrl("/api/control"),{method:"POST",headers:authHeaders(),body:JSON.stringify({action:"recovery_plan",error:msg,stage:"agent"})});const rp=await rr.json();upd(m=>[...m,{id:crypto.randomUUID(),role:"assistant",text:"⚠️ Task interrupted\n\nProblem: "+msg+"\n\n🛡️ Recovery plan: "+(rp.plan||[]).map(x=>x.action).join(" → ")+"\n\nBHAI X will not mark this task complete without verification."}])}catch{upd(m=>[...m,{id:crypto.randomUUID(),role:"assistant",text:"⚠️ Task interrupted: "+msg+"\n\nRecovery check unavailable."}])}setActivity(a=>a.map(x=>({...x,state:"failed"})))}finally{clearInterval(workTicker.current);workTicker.current=null;setRunning(false)}
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
  if(label==='codefix'){setCodeFixOpen(true);setToolsOpen(false);return}
  if(label==='generator'){setGeneratorOpen(true);setToolsOpen(false);return}
  if(label==='mission'){setMissionMode(true);setToolsOpen(false);return}
  if(label==='system'){setSystemOpen(true);setToolsOpen(false);return}
  const prompts={generator:'AI code generator kholo: ',web:'Web search karke current information verify karo: ',image:'Ek image generate karo: ',coding:'Coding task solve karo: ',github:'GitHub par actual kaam karo: '};
  const prompt=prompts[label]; if(!prompt)return;
  setInput(v=>(v?v+'\n':'')+prompt);setToolsOpen(false);
 }
 async function compileMission(goalOverride){
  const goal=(goalOverride??input).trim(); if(!goal||running)return;
  setRunning(true);setToolsOpen(false);setActivityOpen(false);
  try{
   const pf=await fetch(apiUrl('/api/control'),{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'preflight'})}).then(r=>r.json()).catch(e=>({ready:false,risks:[{message:e.message}]}));
   if(!pf.ready){upd(msgs=>[...msgs,{id:crypto.randomUUID(),role:'assistant',text:'🛡️ PRE-FLIGHT STOP\n\n'+(pf.risks||[]).map(x=>'⚠️ '+x.message).join('\n')+'\n\nMission ko predictable failure se pehle rok diya gaya.'}]);return;}
   const r=await fetch(apiUrl('/api/control'),{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'compile_goal',goal})});
   const d=await r.json(); if(!r.ok)throw new Error(d.error||'Mission compile failed');
   const m=d.mission;
   const plan='🎯 MISSION MODE\\n\\nGoal: '+m.goal+'\\n\\n'+m.steps.map((s,i)=>(i+1)+'. '+s.name).join('\n')+'\n\nStatus: '+m.steps.length+' steps compiled.'+(doIt?'\\n\\nDO IT ON — mission execution start ho raha hai.':'\\n\\nDO IT OFF — plan ready hai; execute karne ke liye DO IT ON karo.');
   const userMsg={id:crypto.randomUUID(),role:'user',text:goal};
   const planMsg={id:crypto.randomUUID(),role:'assistant',text:plan};
   const next=[...chat.messages,userMsg,planMsg];
   upd(()=>next);setInput('');setMissionMode(false);
   if(doIt){
    try{const cp=await fetch(apiUrl('/api/system'),{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'checkpoint',goal,state:{missionId:m.id,steps:m.steps.map(s=>({id:s.id,name:s.name,state:s.state})),messages:next.slice(-6)}})}).then(x=>x.json()); if(cp?.checkpoint){localStorage.setItem('bhai_x_checkpoint',JSON.stringify(cp.checkpoint));setResumeMission(cp.checkpoint)}}catch{}
    let dnaMission='';try{const dr=await fetch(apiUrl('/api/dna?project=default'),{headers:authHeaders()}).then(x=>x.json());dnaMission=JSON.stringify(dr.data||{}).slice(0,5000)}catch{}
    const execMessages=[...next,{id:crypto.randomUUID(),role:'user',text:'MISSION EXECUTION: Ab compiled mission ko end-to-end execute karo. Required files/code changes/build/test/deploy jo possible ho actual tools se karo. Har step verify karo; kaam complete hone tak execute karo. Agar execution interrupt ho to last checkpoint se resume karne ke liye state preserve karo.'},{id:crypto.randomUUID(),role:'user',text:'RECOVERY CHECKPOINT: '+JSON.stringify(m.steps)+'\\nPROJECT DNA: '+dnaMission}];
    const missionToken=account?.session||localStorage.getItem("bhai_user_session")||sessionStorage.getItem("bhai_user_session")||"";
    const missionHeaders={"Content-Type":"application/json"}; if(missionToken)missionHeaders.Authorization="Bearer "+missionToken;
    const controller=new AbortController(); const missionTimeout=setTimeout(()=>controller.abort(),300000);
    let er; try{er=await fetch(apiUrl('/api/agent'),{method:'POST',headers:missionHeaders,body:JSON.stringify({messages:execMessages,doIt:true}),signal:controller.signal});}finally{clearTimeout(missionTimeout)}
    const ed=await er.json();
    upd(msgs=>[...msgs,{id:crypto.randomUUID(),role:'assistant',text:ed.text||('⚠️ '+(ed.error||'Mission execution failed')),images:ed.images||[]}]);
    try{await fetch(apiUrl('/api/diff'),{method:'POST',headers:authHeaders(),body:JSON.stringify({type:'mission',summary:goal,files:(ed.activity||[]).map(x=>x.tool||'mission-step'),commit:ed.commit||null,verification:ed.verified||ed.verification||null})})}catch{}
    try{await fetch(apiUrl('/api/dna'),{method:'POST',headers:authHeaders(),body:JSON.stringify({project:'default',data:{lastMission:goal,lastMissionResult:String(ed.text||'').slice(0,2500),lastMissionVerified:ed.verified||ed.verification||null,lastUpdated:new Date().toISOString()}})})}catch{}
    if(ed.verified===true||/verified|successfully completed|all steps complete/i.test(String(ed.text||''))){localStorage.removeItem('bhai_x_checkpoint');setResumeMission(null)}
    if(Array.isArray(ed.activity)&&ed.activity.length)setActivity(ed.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Mission',text:x.state||'done',state:x.state||'done'})));
   }
  }catch(e){upd(msgs=>[...msgs,{id:crypto.randomUUID(),role:'assistant',text:'⚠️ '+e.message}])}finally{setRunning(false)}
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
   <div className="sideBottom"><div className="status"><span/> Agent online</div><button className="accountOpenBtn" onClick={()=>setAccountOpen(true)}>⭐ Upgrade / Account</button><button className="accountOpenBtn" onClick={()=>setBrainOpen(true)}><BrainCircuit size={15}/> Project Brain</button><button className="accountOpenBtn" onClick={()=>setResellerOpen(true)}>🧾 Reseller</button><button className="ownerOpenBtn" onClick={()=>setOwnerOpen(true)}><ShieldCheck size={15}/> Owner Control</button><div className="mediaUsage"><span>🖼️ {usage.images}/{usage.imageLimit}</span><span>🎬 {usage.videos}/{usage.videoLimit}</span></div><div className="sideUser"><div className="miniAvatar">B</div><span>BHAI X</span><button className="settingsBtn" aria-label="Settings" onClick={()=>setSettingsOpen(true)}><Settings size={16}/></button></div></div>
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
       <div className="messageText">{renderText(m.text,v=>copyText(v,'code-'+m.id))}</div>
       {m.images?.map((im,i)=>{const src='data:'+im.mimeType+';base64,'+im.data;return <div className="generatedWrap" key={i}>{im.video?<video className="generatedImage" src={src} controls playsInline/>:<img className="generatedImage" src={src}/>}<a className="downloadBtn" href={src} download={im.video?'bhai-x-video-'+(i+1)+'.mp4':'bhai-x-image-'+(i+1)+'.png'}><Download size={14}/> Download</a></div>})}
       {m.role==='assistant'&&!running&&<div className="messageActions"><button onClick={()=>copyText(m.text,m.id)}>{copied===m.id?<Check size={13}/>:<Copy size={13}/>} {copied===m.id?'Copied':'Copy'}</button></div>}
      </div>
    </div>)}
    {running&&<div className="row"><div className="bubble working"><Loader2 className="spin" size={16}/> BHAI X is working... <span className="workingHint">Task steps neeche update honge</span></div></div>}
    <div ref={end}/>
   </section>
   {activityOpen&&<section className="activity"><div className="activityHead"><b>🔧 BHAI X ka kaam</b><span className="activityLive">LIVE</span><button onClick={()=>setActivityOpen(false)}><X size={14}/></button></div>{activity.map(x=><div className="activityItem" key={x.id}><span className={x.state==='done'?'ok':''}>{x.state==='done'?<Check size={12}/>:<Loader2 size={12} className={x.state==='running'?'spin':''}/>}</span><b>{x.step}</b><span>{x.text}</span></div>)}</section>}
   {resumeMission&&<div className="resumeBar"><span>🔄 Previous mission checkpoint saved</span><button onClick={async()=>{setInput(resumeMission.goal);setResumeMission(null);setMissionMode(true);}}>Resume mission</button><button onClick={()=>{localStorage.removeItem('bhai_x_checkpoint');setResumeMission(null)}}>Dismiss</button></div>}
   <div className="composerWrap">
    <div className="composerTools">
     <div className="toolMenuWrap">
      <button className="roundBtn" onClick={()=>setToolsOpen(v=>!v)}><Plus size={20}/></button>
      {toolsOpen&&<div className="toolMenu"><button onClick={()=>useTool('web')}><Globe2/> Web search</button><button onClick={()=>useTool('image')}><ImageIcon/> Create image</button><button onClick={()=>useTool('coding')}><Code2/> Coding</button><button onClick={()=>useTool('generator')}><Code2 size={15}/> AI Code Generator</button><button onClick={()=>useTool('codefix')}><WandSparkles/> AI Code Fixer</button><button onClick={()=>useTool('github')}><Zap/> GitHub / DO IT</button><button onClick={()=>useTool('mission')}><Target/> Mission Mode</button><button onClick={()=>useTool('connect')}><Plug/> Connect App</button><button onClick={()=>useTool('system')}><ActivityIcon/> System Center</button></div>}
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
 {ownerOpen&&<OwnerPanel onClose={()=>setOwnerOpen(false)}/>}\n {connectOpen&&<ConnectPanel onClose={()=>setConnectOpen(false)}/>}\n {settingsOpen&&<SettingsPanel onClose={()=>setSettingsOpen(false)}/>}\n {codeFixOpen&&<CodeFixPanel onClose={()=>setCodeFixOpen(false)}/>} {generatorOpen&&<GeneratorPanel onClose={()=>setGeneratorOpen(false)}/>} {systemOpen&&<SystemPanel onClose={()=>setSystemOpen(false)}/>} {accountOpen&&<AccountPanel onClose={()=>setAccountOpen(false)} onAccount={setAccount}/>} {resellerOpen&&<ResellerPanel onClose={()=>setResellerOpen(false)}/>} {brainOpen&&<ProjectBrainPanel onClose={()=>setBrainOpen(false)}/>} \n </div>
}
createRoot(document.getElementById('root')).render(<App/>);