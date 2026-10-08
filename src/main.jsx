import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{Send,Mic,Activity as ActivityIcon,Paperclip,Plus,Loader2,Zap,ShieldCheck,Globe2,Code2,Image as ImageIcon,Menu,Search,Settings,Copy,Check,ChevronDown,UserCircle,Download,X,Paperclip as Clip,PanelLeftClose,PanelLeftOpen,RefreshCw,Target,Plug,WandSparkles,BrainCircuit,History}from'lucide-react';
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
import ExecutionHistoryPanel from'./ExecutionHistoryPanel.jsx';
import {normalizeIntent,isCasualIntent,detectMediaIntent,isStoryScriptIntent,isCharacterCreationIntent,isGeneralChatIntent,isLocalCodingIntent,isWebResearchIntent} from './intentRouter.js';
import {apiUrl,readJsonResponse,requestJson} from './apiClient.js';

const authToken=()=>localStorage.getItem('bhai_user_session')||sessionStorage.getItem('bhai_user_session')||'';
const authHeaders=()=>{const h={'Content-Type':'application/json'},t=authToken();if(t)h.Authorization='Bearer '+t;return h;}
function extractExplicitGithubRepo(text=''){
 const raw=String(text||'');
 const url=raw.match(/https?:\/\/github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
 if(url)return {owner:url[1],repo:url[2]};
 const contextual=raw.match(/\b(?:github|git\s*hub)\b[\s\S]{0,100}?\b([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\b/i);
 if(contextual)return {owner:contextual[1],repo:contextual[2]};
 return null;
}
function compactChatMessages(messages=[]){
 const list=Array.isArray(messages)?messages:[];
 const recent=list.slice(-18);
 const MAX_TEXT=8000;
 return recent.map((m,i)=>{
  const role=m?.role==='assistant'||m?.role==='model'?'assistant':'user';
  let text=String(m?.text??m?.content??'');
  if(text.length>MAX_TEXT) text=text.slice(0,MAX_TEXT)+"\n[…older content trimmed…]";
  return {role,text};
 }).filter(m=>m.text).slice(-18);
}
function extractGithubFilePath(text=''){
 const raw=String(text||'');
 const m=raw.match(/\b([A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9._-]+\.(?:html|css|js|jsx|ts|tsx|json|md))\b/i);
 if(m)return m[1];
 const simple=raw.match(/\b([A-Za-z0-9._-]+\.(?:html|css|js|jsx|ts|tsx|json|md))\b/i);
 return simple?.[1]||'';
}

const K='bhai_x_v3';
const starter={id:crypto.randomUUID(),role:'assistant',text:'Bhai 😎 BHAI X ready hai.\n\nJo kaam chahiye seedha bol — research, coding, GitHub, image, files ya build. jahan zarurat hogi BHAI X khud actual tools se kaam karega.\n\nMain sirf jawab dene wala chatbot nahi hoon — project ka context yaad rakhkar bataunga ki kya complete hua, kya baaki hai, aur next mein kya add/fix karna useful rahega.'};

function renderInline(text=''){
 const tokenRe=/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+|www\.[^\s<]+|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
 const parts=String(text).split(tokenRe);
 return parts.map((part,i)=>{
  if(!part)return null;
  const md=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
  if(md)return <React.Fragment key={i}><a className="messageLink" href={md[2]} target="_blank" rel="noopener noreferrer">{md[1]}</a></React.Fragment>;
  const urlMatch=part.match(/^(https?:\/\/[^\s<]+|www\.[^\s<]+)$/);
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
 const[active,setActive]=useState(null),[input,setInput]=useState(''),[running,setRunning]=useState(false),doIt=true;
 const[fileInfo,setFileInfo]=useState(null),[listening,setListening]=useState(false),[activity,setActivity]=useState([]),[activityOpen,setActivityOpen]=useState(false);
 const[sidebar,setSidebar]=useState(true),[search,setSearch]=useState(''),[toolsOpen,setToolsOpen]=useState(false),[copied,setCopied]=useState(''),[ownerOpen,setOwnerOpen]=useState(false),[connectOpen,setConnectOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[missionMode,setMissionMode]=useState(false),[codeFixOpen,setCodeFixOpen]=useState(false),[generatorOpen,setGeneratorOpen]=useState(false),[systemOpen,setSystemOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[account,setAccount]=useState(null),[resellerOpen,setResellerOpen]=useState(false),[brainOpen,setBrainOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[resumeMission,setResumeMission]=useState(null),[usage,setUsage]=useState({images:0,videos:0,imageLimit:10,videoLimit:3}),[resumeProduction,setResumeProduction]=useState(null);
 const end=useRef(null),recognition=useRef(null),workTicker=useRef(null);
 const[authChecked,setAuthChecked]=useState(false);
 useEffect(()=>{let live=true;(async()=>{const t=authToken();if(!t){if(live)setAuthChecked(true);return;}try{const r=await fetch(apiUrl("/api/accounts?me=1"),{headers:authHeaders()});const d=await r.json();if(live&&r.ok&&d.account){setAccount(d.account);setAuthChecked(true);return;}}catch{}localStorage.removeItem("bhai_user_session");sessionStorage.removeItem("bhai_user_session");if(live){setAccount(null);setAuthChecked(true);}})();return()=>{live=false}},[]);

 useEffect(()=>{if(!sessions.length){const s={id:crypto.randomUUID(),title:'New chat',messages:[starter]};setSessions([s]);setActive(s.id)}else if(!active)setActive(sessions[0].id)},[]);
 useEffect(()=>{localStorage.setItem(K,JSON.stringify(sessions));end.current?.scrollIntoView({behavior:'smooth'})},[sessions]);
 useEffect(()=>{try{const cp=JSON.parse(localStorage.getItem('bhai_x_checkpoint')||'null');if(cp?.id)setResumeMission(cp);const prod=JSON.parse(localStorage.getItem('bhai_x_production_checkpoint')||'null');if(prod?.pipelineId)setResumeProduction(prod)}catch{}},[]);
 const chat=sessions.find(x=>x.id===active);
 const upd=fn=>setSessions(a=>a.map(s=>s.id===active?{...s,messages:fn(s.messages)}:s));

 async function resumeProductionRun(){
  if(!resumeProduction||running)return;
  setRunning(true);setActivityOpen(true);
  const id=crypto.randomUUID(),replyId=id+'-production-resume-reply';
  const title=String(resumeProduction?.request?.prompt||resumeProduction?.story?.title||'Previous autonomous production').slice(0,140);
  upd(m=>[...m,{id:crypto.randomUUID(),role:'user',text:'🔄 Resume production: '+title},{id:replyId,role:'assistant',text:'🧭 BHAI X saved checkpoint se verified production stages resume kar raha hai...'}]);
  setActivity([
   {id:id+'0',step:'Resume',text:'🧭 Durable production checkpoint load kiya ja raha hai...',state:'running'},
   {id:id+'1',step:'Continue',text:'⏭️ Verified stages/scene assets skip honge; sirf remaining work chalega...',state:'pending'},
   {id:id+'2',step:'Proof',text:'✅ Final verification ke bina DONE claim nahi hoga...',state:'pending'}
  ]);
  try{
   const req=resumeProduction.request||{};
   const rr=await fetch(apiUrl('/api/production'),{method:'POST',headers:authHeaders(),body:JSON.stringify({
    ...req,prompt:req.prompt||resumeProduction.story?.prompt||'Resume autonomous production',
    productionPipelineId:resumeProduction.pipelineId,recoveryCheckpoint:resumeProduction
   })});
   const d=await rr.json().catch(()=>({}));
   if(d.productionCheckpoint&&!d.verified){localStorage.setItem('bhai_x_production_checkpoint',JSON.stringify(d.productionCheckpoint));setResumeProduction(d.productionCheckpoint);}
   if(!rr.ok||d.error)throw new Error(d.error||('Production resume backend HTTP '+rr.status));
   if(d.verified===true){localStorage.removeItem('bhai_x_production_checkpoint');setResumeProduction(null);}
   setActivity(a=>a.map(x=>({...x,state:'done'})));if(d.usage)setUsage(d.usage);
   upd(m=>m.map(x=>x.id===replyId?{...x,text:(d.text||'✅ Autonomous production result ready.')+(d.youtubeAuthUrl?'\n\n🔐 [YouTube connect karo]('+d.youtubeAuthUrl+')':''),images:d.images||[],providerMeta:{provider:'bhai-self-hosted',backend_provider:'autonomous-production',model:'bhai-production-v1'}}:x));
   if(Array.isArray(d.activity)&&d.activity.length)setActivity(a=>[...a,...d.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Production',text:x.details||x.state||'',state:x.state||'done'}))]);
  }catch(e){
   setActivity(a=>a.map(x=>({...x,state:'failed'})));
   upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ PRODUCTION RESUME STOPPED\n\n'+e.message+'\n\nBHAI X ne unverified output ko DONE nahi maana.'}:x));
  }finally{setRunning(false);clearInterval(workTicker.current);workTicker.current=null;}
 }

 async function send(textOverride){
  const userIntentText=(textOverride??input).trim();
  let t=userIntentText;
  if(fileInfo)t=t+'\n\n[Attached file: '+fileInfo.name+']\n'+fileInfo.text;
  if(!t||running||!chat)return;
  if(false){await compileMission(t);return;}
  const casualKey=normalizeIntent(userIntentText);
  const mediaIntent=detectMediaIntent(userIntentText);
  // Casual conversation must stay completely outside the agent/mission execution path.
  // Keep this guard intentionally conservative: only clear social/chat phrases are intercepted.
  const instantCasual={
   "hi":"Arre bhai! 😄 Main yahin hoon. Batao kya scene hai? 🚀","hello":"Hello bhai! 😎 BHAI X ready hai. Batao kya karna hai? 🚀","hey":"Hey bhai! 😄 Kya chal raha hai? 🚀","hii":"Hii bhai! 😄 Batao kya karna hai? 🚀","helo":"Hello bhai! 😄 Main ready hoon. 🚀","namaste":"Namaste bhai! 🙏 Batao kya kaam karein?","salam":"Walaikum salam bhai! 😄 Batao kya scene hai?","kaise ho":"Ekdum badhiya bhai 😎 Tum batao?","kaisa hai":"Badhiya bhai 😎 Main full ready hoon!","kya haal":"Mast bhai 😄 Tum batao kya haal?","kya haal hai":"Mast bhai 😄 Tum batao kya haal?","kya chal raha":"Bas bhai, BHAI X ka kaam full speed mein chal raha hai 😄🚀 Tum batao?","kya chal raha hai":"Bas bhai, BHAI X ka kaam full speed mein chal raha hai 😄🚀 Tum batao?","kya chal rha":"Bas bhai, BHAI X ka kaam full speed mein chal raha hai 😄🚀 Tum batao?","kya kar rahe ho":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","kya kaam kar rahe ho":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","kya kam kar rahe ho":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","kya kaam kr rahe ho":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","kya kam kr reh ho":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","khana kha liya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄","khana kha liya hai":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄","khana khaya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄","khana khaya hai":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄","kha liya":"😂 Bhai, main AI hoon—khana nahi kha sakta. Tu kha le pehle! 🍛😄","kya kar rahe ho bhai":"Bhai, tumse baat aur tumhare kaam mein laga hoon 😎🚀","kya scene hai":"Sab mast bhai 😄 Batao aaj kya kaam pakadna hai? 🚀","kya hua":"Kuch nahi bhai 😄 Main ekdum ready hoon. Batao kya hua?","thanks":"Arey bhai, anytime! 😎❤️","thank you":"Arey bhai, anytime! 😎❤️","thik hai":"Theek hai bhai 😄👍","theek hai":"Theek hai bhai 😄👍","ok":"Done bhai 😎👍","okay":"Done bhai 😎👍","nice":"Hehe 😄🔥","wah":"😄🔥 Bas bhai!","haha":"😂😂 Bhai, hasi rukni nahi chahiye!","bye":"Bye bhai! 👋😄","goodbye":"Bye bhai! 👋😄"
  };
  const webResearchMessage=isWebResearchIntent(userIntentText);
  const autonomousProductionMessage=isAutonomousProductionRequest(userIntentText);
  const youtubePublishMessage=!autonomousProductionMessage&&isYouTubePublishRequest(userIntentText);
  const youtubeConnectMessage=/\byoutube\b[\s\S]{0,80}\b(?:connect|link|jod|jodo|channel)\b/i.test(userIntentText);
  const casualSocial=isCasualIntent(userIntentText);
  const casualChat=Object.prototype.hasOwnProperty.call(instantCasual,casualKey)||casualSocial;
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
  const mediaMessage=!instantMessage&&Boolean(mediaIntent.type);
  const explicitGithubRepo=extractExplicitGithubRepo(userIntentText);
  const githubFilePath=extractGithubFilePath(userIntentText);
  const githubMutationRequest=/\b(?:fix|repair|update|modify|change|write|commit|push|delete|create|build|deploy|publish)\b/i.test(userIntentText);
  const githubReadIntent=/\b(?:check|inspect|read|open|verify|dekh|dekho)\b/i.test(userIntentText);
  const directGithubRead=Boolean(explicitGithubRepo&&githubReadIntent&&!githubMutationRequest&&(githubFilePath||/\b(?:repo|repository)\b/i.test(userIntentText)));
  const characterCreationMessage=!instantMessage&&!mediaMessage&&!directGithubRead&&!webResearchMessage&&isCharacterCreationIntent(userIntentText);
  const storyScriptMessage=!instantMessage&&!mediaMessage&&!directGithubRead&&!characterCreationMessage&&!webResearchMessage&&isStoryScriptIntent(userIntentText);
  const generalChatMessage=!instantMessage&&!mediaMessage&&!directGithubRead&&!storyScriptMessage&&!webResearchMessage&&(isGeneralChatIntent(userIntentText)||isLocalCodingIntent(userIntentText));
  if(instantMessage){
   const id=crypto.randomUUID();
   setInput('');setFileInfo(null);setToolsOpen(false);
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id,role:'assistant',text:instantReply}];
   upd(()=>next);
   if(chat.title==='New chat')setSessions(a=>a.map(s=>s.id===active?{...s,title:t.slice(0,32)}:s));
   return;
  }
  if(directGithubRead){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID();
   const replyId=id+'-github-read-reply';
   const targetPath=githubFilePath.replace(/^\/+/,'');
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'🔎 GitHub target verify kar raha hoon...'}];
   upd(()=>next);setSessions(a=>a.map(s=>s.id===active&&s.title==='New chat'?{...s,title:t.slice(0,32)}:s));
   setActivity([
    {id:id+'0',step:'Target',text:'🎯 Exact GitHub repository target identify kiya...',state:'done'},
    {id:id+'1',step:'Reading',text:'📖 GitHub API se requested repository/file read ho raha hai...',state:'running'},
    {id:id+'2',step:'Verifying',text:'✅ Repository aur file response verify kiya jayega...',state:'pending'}
   ]);
   try{
    const d=await requestJson('/api/github',{method:'POST',headers:authHeaders(),body:JSON.stringify({
     action:targetPath?'read':'info',
     owner:explicitGithubRepo.owner,
     repo:explicitGithubRepo.repo,
     ...(targetPath?{path:targetPath}:{})
    })},{label:'/api/github',retrySafe:true});
    const fileSummary=targetPath
      ? '## ✅ GitHub file verified\\n\\n**Repository:** '+explicitGithubRepo.owner+'/'+explicitGithubRepo.repo+'\\n\\n**File:** '+(d.path||targetPath)+'\\n\\n**Verification:** GitHub API se file successfully read hui.\\n\\n<pre>'+String(d.content||'').slice(0,12000).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre>'
      : '## ✅ GitHub repository verified\\n\\n**Repository:** '+(d.name||explicitGithubRepo.owner+'/'+explicitGithubRepo.repo)+'\\n\\n**Default branch:** '+(d.default_branch||'main')+'\\n\\n**Verification:** GitHub API se repository successfully read hui.';
    upd(m=>m.map(x=>x.id===replyId?{...x,text:fileSummary}:x));
    setActivity(a=>a.map(x=>x.id===id+'1'||x.id===id+'2'?{...x,state:'done'}:x));
   }catch(e){
    setActivity(a=>a.map(x=>({...x,state:x.state==='running'?'failed':x.state})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ GitHub check failed\\n\\n'+e.message}:x));
   }finally{setRunning(false)}
   return;
  }
  if(autonomousProductionMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID(),replyId=id+'-production-reply';
   upd(m=>[...m,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'🚀 BHAI X autonomous production start kar raha hai...'}]);
   setActivity([
    {id:id+'0',step:'Plan',text:'🧠 Story → Character → Visual → Video → VFX/SFX → MP4 → YouTube pipeline lock ho rahi hai...',state:'running'},
    {id:id+'1',step:'Production',text:'⚙️ Actual media pipeline execute hogi; har stage verify hoga...',state:'pending'},
    {id:id+'2',step:'Proof',text:'✅ Final MP4 aur publishing proof ke bina DONE claim nahi hoga...',state:'pending'}
   ]);
   try{
    const rr=await fetch(apiUrl('/api/production'),{method:'POST',headers:authHeaders(),body:JSON.stringify({
     prompt:userIntentText,durationSeconds:15,language:'Hindi',genre:'suspense',visualStyle:'3D anime cinematic cartoon',
     aspectRatio:'16:9',autoPublish:true,privacy:/\bpublic\b/i.test(userIntentText)?'public':/\bunlisted\b/i.test(userIntentText)?'unlisted':'private',render:true,maxScenes:3,\n     ...(resumeProduction?.pipelineId?{productionPipelineId:resumeProduction.pipelineId,recoveryCheckpoint:resumeProduction}:{})
    })});
    const d=await rr.json().catch(()=>({}));
    if(d.productionCheckpoint&&!d.verified){localStorage.setItem('bhai_x_production_checkpoint',JSON.stringify(d.productionCheckpoint));setResumeProduction(d.productionCheckpoint);}
    if(!rr.ok||d.error)throw new Error(d.error||('Production backend HTTP '+rr.status));
    if(d.verified===true){localStorage.removeItem('bhai_x_production_checkpoint');setResumeProduction(null);}
    setActivity(a=>a.map(x=>({...x,state:'done'})));if(d.usage)setUsage(d.usage);
    upd(m=>m.map(x=>x.id===replyId?{...x,text:(d.text||'✅ Autonomous production result ready.')+(d.youtubeAuthUrl?'\n\n🔐 [YouTube connect karo]('+d.youtubeAuthUrl+')':''),images:d.images||[],providerMeta:{provider:'bhai-self-hosted',backend_provider:'autonomous-production',model:'bhai-production-v1'}}:x));
    if(Array.isArray(d.activity)&&d.activity.length)setActivity(a=>[...a,...d.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Production',text:x.details||x.state||'',state:x.state||'done'}))]);
   }catch(e){
    setActivity(a=>a.map(x=>({...x,state:'failed'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ AUTONOMOUS PRODUCTION STOPPED\n\n'+e.message+'\n\nBHAI X ne unverified final output ko DONE nahi maana.'}:x));
   }finally{setRunning(false);clearInterval(workTicker.current);workTicker.current=null;}
   return;
  }
  if(youtubeConnectMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID(),replyId=id+'-youtube-connect';
   upd(m=>[...m,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'🔐 Secure YouTube OAuth link bana raha hoon...'}]);
   setActivity([{id:id+'0',step:'OAuth',text:'🔐 Account-scoped secure YouTube authorization URL generate ho rahi hai...',state:'running'},{id:id+'1',step:'Verify',text:'✅ OAuth state server-side protected hai...',state:'pending'}]);
   try{
    const d=await requestJson('/api/youtube',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'connect'})},{label:'/api/youtube',retrySafe:false,retries:0});
    setActivity(a=>a.map(x=>({...x,state:'done'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'## 🔐 YouTube Connect\n\nBHAI X ka secure Google authorization link ready hai.\n\n[Open YouTube connection]('+d.authUrl+')\n\nAuthorization complete hone ke baad wapas BHAI X par aakar publish command de sakte ho.'}:x));
   }catch(e){
    setActivity(a=>a.map(x=>({...x,state:'failed'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ YouTube connect failed\n\n'+e.message}:x));
   }finally{setRunning(false);}
   return;
  }
  if(youtubePublishMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID(),replyId=id+'-youtube-publish';
   upd(m=>[...m,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'📺 Verified final MP4 ko YouTube par publish kar raha hoon...'}]);
   setActivity([{id:id+'0',step:'Input',text:'🎬 Saved verified final video locate ho raha hai...',state:'running'},{id:id+'1',step:'Upload',text:'📤 YouTube resumable upload execute hoga...',state:'pending'},{id:id+'2',step:'Proof',text:'✅ Post-upload video ID + URL verify hoga...',state:'pending'}]);
   try{
    const d=await requestJson('/api/youtube',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'upload',privacy:'private'})},{label:'/api/youtube',retrySafe:false,retries:0});
    setActivity(a=>a.map(x=>({...x,state:'done'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'## ✅ YouTube publish verified\n\n**Title:** '+(d.title||'BHAI X Video')+'\n\n**Video ID:** '+d.videoId+'\n\n🔗 '+d.url+'\n\n**Privacy:** '+(d.privacyStatus||'private')}:x));
   }catch(e){
    setActivity(a=>a.map(x=>({...x,state:'failed'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ YouTube publish failed\n\n'+e.message+'\n\nBHAI X ne upload ko verified DONE nahi maana.'}:x));
   }finally{setRunning(false);}
   return;
  }
  if(characterCreationMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID(),replyId=id+'-character-reply';
   upd(m=>[...m,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'🎭 BHAI X permanent character identity bana raha hai...'}]);
   setActivity([{id:id+'0',step:'Identity',text:'🧠 Character ki permanent visual identity design ho rahi hai...',state:'running'},{id:id+'1',step:'Lock',text:'🔒 Face, hair, eyes, body aur clothing identity lock hogi...',state:'pending'},{id:id+'2',step:'Verify',text:'✅ Permanent character ID aur identity fingerprint validate hoga...',state:'pending'}]);
   try{
    const rr=await fetch(apiUrl('/api/characters'),{method:'POST',headers:authHeaders(),body:JSON.stringify({name:t.slice(0,120),description:userIntentText,visualStyle:'3D anime cinematic cartoon'})});
    const d=await rr.json().catch(()=>({}));if(!rr.ok||d.error)throw new Error(d.error||('Character backend HTTP '+rr.status));
    const c=d.character||{};const identity=c.identity_json||{};setActivity(a=>a.map(x=>({...x,state:'done'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'## 🎭 Permanent Character Ready\n\n**'+(c.name||identity.name||'Character')+'**\n\n**Character ID:** `'+(c.character_id||'—')+'`\n\n**Identity fingerprint:** `'+(c.identity_fingerprint||'—')+'`\n\n**Face:** '+(identity.face||'—')+'\n\n**Hair:** '+(identity.hair||'—')+'\n\n**Clothing:** '+(identity.clothing||'—')+'\n\n**Visual style:** '+(identity.visualStyle||'3D anime cinematic cartoon')+'\n\n🔒 Ye identity future image/video/voice/lip-sync stages ke liye canonical rahegi.'}:x));
   }catch(e){setActivity(a=>a.map(x=>({...x,state:'failed'})));upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ CHARACTER ENGINE ERROR\n\n'+e.message+'\n\nIncomplete identity ko BHAI X ne DONE nahi maana.'}:x));}
   finally{setRunning(false);clearInterval(workTicker.current);workTicker.current=null;}
   return;
  }
  if(storyScriptMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID();const replyId=id+'-story-reply';
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'📝 BHAI X Story + Script Engine chala raha hai...'}];
   upd(()=>next);setSessions(a=>a.map(s=>s.id===active&&s.title==='New chat'?{...s,title:t.slice(0,32)}:s));
   setActivity([
    {id:id+'0',step:'Story',text:'🧠 Story structure aur YouTube hook tayyar ho raha hai...',state:'done'},
    {id:id+'1',step:'Script',text:'🎞️ Scenes, dialogue, visuals aur continuity build ho rahi hai...',state:'running'},
    {id:id+'2',step:'Verify',text:'✅ Structured script schema validate kiya jayega...',state:'pending'}
   ]);
   try{
    const rr=await fetch(apiUrl('/api/story'),{method:'POST',headers:authHeaders(),body:JSON.stringify({prompt:userIntentText,language:'Hindi',durationSeconds:300,genre:'suspense',visualStyle:'3D anime cinematic cartoon'})});
    const d=await rr.json().catch(()=>({}));
    if(!rr.ok||d.error)throw new Error(d.error||('Story backend HTTP '+rr.status));
    setActivity(a=>a.map(x=>x.id===id+'1'||x.id===id+'2'?{...x,state:'done'}:x));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:d.text||'✅ Story ready.',providerMeta:d.provider?{provider:d.provider,backend_provider:d.backend_provider||null,model:d.model||null}:null}:x));
   }catch(e){
    setActivity(a=>a.map(x=>({...x,state:'failed'})));
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ STORY ENGINE ERROR\n\n'+e.message+'\n\nIncomplete script ko BHAI X ne DONE nahi maana.'}:x));
   }finally{setRunning(false);clearInterval(workTicker.current);workTicker.current=null;}
   return;
  }
  if(generalChatMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(false);
   const id=crypto.randomUUID();
   const replyId=id+'-chat-reply';
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id:replyId,role:'assistant',text:'⚡ Bhai, soch raha hoon...'}];
   upd(()=>next);setSessions(a=>a.map(s=>s.id===active&&s.title==='New chat'?{...s,title:t.slice(0,32)}:s));
   try{
    const d=await requestJson('/api/chat',{method:'POST',headers:authHeaders(),body:JSON.stringify({messages:compactChatMessages(next)})},{label:'/api/chat',retrySafe:true});
    upd(m=>m.map(x=>x.id===replyId?{...x,text:d.text||'✅',providerMeta:d.provider?{provider:d.provider,backend_provider:d.backend_provider||null,model:d.model||null}:null}:x));
   }catch(e){
    upd(m=>m.map(x=>x.id===replyId?{...x,text:'⚠️ Chat error\\n\\n'+e.message}:x));
   }finally{setRunning(false)}
   return;
  }
  if(mediaMessage){
   setInput('');setFileInfo(null);setToolsOpen(false);setRunning(true);setActivityOpen(true);
   const id=crypto.randomUUID();
   const label=mediaIntent.type==='video'?'🎬':'🖼️';
   const next=[...chat.messages,{id:crypto.randomUUID(),role:'user',text:t},{id:id+'-media-reply',role:'assistant',text:'⚡ '+label+' BHAI X media pipeline chala raha hai...'}];
   upd(()=>next);setSessions(a=>a.map(s=>s.id===active&&s.title==='New chat'?{...s,title:t.slice(0,32)}:s));
   setActivity([
    {id:id+'0',step:'Intent',text:mediaIntent.type==='video'?'🎬 Video request samajh liya...':'🖼️ Image request samajh liya...',state:'done'},
    {id:id+'1',step:'Working',text:mediaIntent.type==='video'?'⚙️ Video provider pipeline execute ho rahi hai...':'⚙️ Image provider pipeline execute ho rahi hai...',state:'running'},
    {id:id+'2',step:'Verifying',text:'✅ Actual media output validate kiya jayega...',state:'pending'}
   ]);
   try{
    const rr=await fetch(apiUrl('/api/media'),{method:'POST',headers:authHeaders(),body:JSON.stringify({type:mediaIntent.type,prompt:userIntentText,aspectRatio:'16:9',duration:5,imageToVideo:mediaIntent.imageToVideo})});
    const d=await rr.json().catch(()=>({}));
    if(!rr.ok||d.error)throw new Error(d.error||('Media backend HTTP '+rr.status));
    setActivity(a=>{const base=a.map(x=>({...x,state:'done'}));if(d.character)return [...base,{id:id+'3',step:'Character ID',text:'🎭 '+(d.character.name||'Character')+' linked to '+(d.character.characterId||'permanent identity')+' · 🔒 identity contract verified.',state:'done'}];return base;});
    if(d.usage)setUsage(d.usage);
    upd(m=>m.map(x=>x.id===id+'-media-reply'?{...x,text:d.text||'✅ Media ready.',images:d.images||[],audio:d.audio||[],postProduction:d.postProduction||null}:x));
   }catch(e){
    setActivity(a=>a.map(x=>({...x,state:'failed'})));
    upd(m=>m.map(x=>x.id===id+'-media-reply'?{...x,text:'⚠️ ERROR DETECTOR\\n\\n'+e.message+'\\n\\nBHAI X ne failed provider ko DONE nahi maana. Sealed media pipeline ke through retry/switch-provider possible hai. 😎'}:x));
   }finally{setRunning(false);clearInterval(workTicker.current);workTicker.current=null;}
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
   let d;
   try{
    d=await requestJson('/api/agent',{method:'POST',headers:agentHeaders,body:JSON.stringify({messages:compactChatMessages(agentMessages),doIt:true}),signal:controller.signal},{label:'/api/agent',retrySafe:false,retries:0});
   }finally{clearTimeout(agentTimeout)}
   if(d?.error){const rr=await fetch(apiUrl('/api/control'),{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'recovery_plan',error:d.error||('HTTP '+r.status),stage:'agent'})}).catch(()=>null);const rp=rr?await rr.json().catch(()=>({})):{};upd(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:'⚠️ ERROR DETECTOR\n\n'+(d.error||('Backend HTTP '+r.status))+'\n\n🛡️ Preventive recovery: '+(rp.plan||[]).map(x=>x.action).join(' → ')+'\n\nBHAI X ne is result ko verified DONE nahi maana.'}]);setActivity(a=>a.map(x=>({...x,state:'failed'})));return;}
   if(d?.speech?.text&&typeof window!=="undefined"&&"speechSynthesis" in window){
    try{
     window.speechSynthesis.cancel();
     const utterance=new SpeechSynthesisUtterance(String(d.speech.text));
     utterance.lang=String(d.speech.language||"hi-IN");
     utterance.rate=Number(d.speech.rate)||1;
     utterance.pitch=Math.max(0.1,Math.min(2,1+(Number(d.speech.pitch)||0)*0.25));
     utterance.volume=Math.max(0,Math.min(1,Number(d.speech.volume) || 1));
     const targetName=String(d?.voice?.name||"").trim();
     if(targetName) utterance.text=String(d.speech.text);
     window.speechSynthesis.speak(utterance);
    }catch{}
   }
   if(d.usage)setUsage(d.usage); setActivity(a=>a.map(x=>x.id===id+'2'?{...x,state:'done'}:x.id===id+'3'?{...x,state:'done'}:x.id===id+'4'?{...x,state:'done'}:x));
   if(Array.isArray(d.activity)&&d.activity.length)setActivity(a=>[...a,...d.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Tool',text:x.state||'done',state:x.state||'done'}))]);
   upd(m=>m.map(x=>x.id===replyId?{...x,text:d.text||('⚠️ '+(d.error||'Request failed')),images:d.images||[],audio:d.audio||[],postProduction:d.postProduction||null}:x));
   if(casualChat)return;
   void (async()=>{
    await Promise.allSettled([
     fetch(apiUrl('/api/diff'),{method:'POST',headers:authHeaders(),body:JSON.stringify({type:'agent-task',summary:t,files:(d.activity||[]).map(x=>x.tool||'tool'),commit:d.commit||null,verification:d.verified||d.verification||null})}),
     fetch(apiUrl('/api/dna'),{method:'POST',headers:authHeaders(),body:JSON.stringify({project:'default',data:{lastGoal:t,lastResult:String(d.text||'').slice(0,2500),lastVerified:d.verified||d.verification||null,lastUpdated:new Date().toISOString()}})})
    ]);
    try{
     const sr=await fetch(apiUrl('/api/suggestions'),{method:'POST',headers:authHeaders(),body:JSON.stringify({goal:t,completed:d.completed||[],remaining:d.remaining||[]})});
     const sd=await readJsonResponse(sr,'/api/suggestions');
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
 async function runDedicatedTool(kind){
  if(running||!chat)return;
  
  setToolsOpen(false);setRunning(true);setActivityOpen(true);
  const replyId=crypto.randomUUID();
  upd(msgs=>[...msgs,{id:crypto.randomUUID(),role:'user',text:kind==='build'?'🔨 Build APK':'🚀 Deploy'},{id:replyId,role:'assistant',text:'⚡ Bhai, '+(kind==='build'?'AI Build Guard + GitHub Actions build':'AI Deploy Guard + Render deploy')+' start kar raha hoon...'}]);
  setActivity([
   {id:crypto.randomUUID(),step:'Pre-flight',text:kind==='build'?'🛡️ AI Build Guard check kar raha hai...':'🛡️ AI Deploy Guard check kar raha hai...',state:'running'},
   {id:crypto.randomUUID(),step:kind==='build'?'Build':'Deploy',text:kind==='build'?'🔨 GitHub Actions build dispatch hoga...':'🚀 Render deployment dispatch hoga...',state:'pending'},
   {id:crypto.randomUUID(),step:'Verify',text:'✅ Actual result verify kiya jayega...',state:'pending'}
  ]);
  try{
   const path=kind==='build'?'/api/build':'/api/deploy';
   const body=kind==='build'
    ?{platform:'android',projectName:'BHAI-X',doIt:true}
    :{doIt:true,reason:'BHAI X dedicated Deploy tool'};
   const rr=await fetch(apiUrl(path),{method:'POST',headers:authHeaders(),body:JSON.stringify(body)});
   const d=await rr.json().catch(()=>({}));
   const ok=rr.ok&&d.ok===true&&(kind==='build'?d.status==='dispatched'||d.status==='complete':d.status==='complete');
   setActivity(a=>a.map((x,i)=>({...x,state:i<2?'done':ok?'done':'failed'})));
   upd(msgs=>msgs.map(x=>x.id===replyId?{...x,text:ok
    ?(kind==='build'?'✅ Build tool dispatched successfully. GitHub Actions is now building; artifact verification abhi pending hai.':'✅ Deploy tool verified LIVE + /api/health passed.')
    :'⚠️ '+(d.error||d.verification||('Tool failed with HTTP '+rr.status))}:x));
  }catch(e){
   setActivity(a=>a.map(x=>({...x,state:'failed'})));
   upd(msgs=>msgs.map(x=>x.id===replyId?{...x,text:'⚠️ '+e.message}:x));
  }finally{setRunning(false)}
 }
 function useTool(label){
  if(label==='connect'){setConnectOpen(true);setToolsOpen(false);return}
  if(label==='codefix'){setCodeFixOpen(true);setToolsOpen(false);return}
  if(label==='generator'){setGeneratorOpen(true);setToolsOpen(false);return}
  if(label==='mission'){setToolsOpen(false);return}
  if(label==='system'){setSystemOpen(true);setToolsOpen(false);return}
  if(label==='build'||label==='deploy'){runDedicatedTool(label);return}
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
   const d=await readJsonResponse(r,'/api/agent'); if(!r.ok)throw new Error(d.error||'Mission compile failed');
   const m=d.mission;
   const plan='🎯 MISSION MODE\\n\\nGoal: '+m.goal+'\\n\\n'+m.steps.map((s,i)=>(i+1)+'. '+s.name).join('\n')+'\n\nStatus: '+m.steps.length+' steps compiled.'+(doIt?'\\n\\nDO IT ON — mission execution start ho raha hai.':'\\n\\nDO IT OFF — plan ready hai; execute karne ke liye DO IT ON karo.');
   const userMsg={id:crypto.randomUUID(),role:'user',text:goal};
   const planMsg={id:crypto.randomUUID(),role:'assistant',text:plan};
   const next=[...chat.messages,userMsg,planMsg];
   upd(()=>next);setInput('');setMissionMode(false);
   if(true){
    try{const cp=await fetch(apiUrl('/api/system'),{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'checkpoint',goal,state:{missionId:m.id,steps:m.steps.map(s=>({id:s.id,name:s.name,state:s.state})),messages:next.slice(-6)}})}).then(x=>x.json()); if(cp?.checkpoint){localStorage.setItem('bhai_x_checkpoint',JSON.stringify(cp.checkpoint));setResumeMission(cp.checkpoint)}}catch{}
    let dnaMission='';try{const dr=await fetch(apiUrl('/api/dna?project=default'),{headers:authHeaders()}).then(x=>x.json());dnaMission=JSON.stringify(dr.data||{}).slice(0,5000)}catch{}
    const execMessages=[...next,{id:crypto.randomUUID(),role:'user',text:'MISSION EXECUTION: Ab compiled mission ko end-to-end execute karo. Required files/code changes/build/test/deploy jo possible ho actual tools se karo. Har step verify karo; kaam complete hone tak execute karo. Agar execution interrupt ho to last checkpoint se resume karne ke liye state preserve karo.'},{id:crypto.randomUUID(),role:'user',text:'RECOVERY CHECKPOINT: '+JSON.stringify(m.steps)+'\\nPROJECT DNA: '+dnaMission}];
    const missionHeaders=authHeaders();
    let jobId="";
    let ed=null;
    try{
     const jr=await fetch(apiUrl('/api/jobs'),{
      method:'POST',
      headers:missionHeaders,
      body:JSON.stringify({
       type:'mission',
       goal:goal,
       payload:{
        task:goal,
        projectName:m.goal||'BHAI-App',
        platform:'android',
        branch:'main',
        doIt:true,
        maxFixes:2,
        autoDeploy:true
       },
       maxAttempts:3
      })
     });
     const jd=await readJsonResponse(jr,'/api/jobs');
     if(!jr.ok||!jd?.job?.id)throw new Error(jd?.error||'Mission job could not be queued.');
     jobId=jd.job.id;
     localStorage.setItem('bhai_x_checkpoint',JSON.stringify({...m,jobId,goal,state:{steps:m.steps},messages:next.slice(-6)}));
     setActivity([
      {id:crypto.randomUUID(),step:'Queue',text:'🎯 Mission job queued: '+jobId.slice(0,8),state:'done'},
      {id:crypto.randomUUID(),step:'Execution',text:'⚙️ Background worker mission execute kar raha hai...',state:'running'},
      {id:crypto.randomUUID(),step:'Verification',text:'🛡️ Completion proof ka wait ho raha hai...',state:'pending'}
     ]);
     for(let i=0;i<720;i++){
      await new Promise(r=>setTimeout(r,1000));
      const sr=await fetch(apiUrl('/api/jobs?id='+encodeURIComponent(jobId)),{headers:missionHeaders});
      const sd=await readJsonResponse(sr,'/api/jobs');
      if(!sr.ok)throw new Error(sd?.error||'Mission job status request failed.');
      const j=sd.job||{};
      if(Array.isArray(j.events)&&j.events.length){
       setActivity(j.events.slice(-8).map(ev=>({
        id:crypto.randomUUID(),
        step:String(ev.state||'running').toUpperCase(),
        text:String(ev.message||ev.error||''),
        state:ev.state==='completed'?'done':ev.state==='failed'||ev.state==='cancelled'?'failed':'running'
       })));
      }
      if(['completed','failed','cancelled'].includes(j.status)){
       if(j.status!=='completed')throw new Error(j.error||'Mission job ended in '+j.status+'.');
       ed=j.result||{};
       setActivity(a=>a.map(x=>x.state==='failed'?x:{...x,state:'done'}));
       break;
      }
     }
     if(!ed)throw new Error('Mission job did not finish within the bounded 12-minute UI wait window.');
    }catch(e){
     ed={ok:false,error:String(e?.message||e),verified:false,activity:[{tool:'job-runner',state:'failed',details:String(e?.message||e)}]};
     throw e;
    }
        try{await fetch(apiUrl('/api/diff'),{method:'POST',headers:authHeaders(),body:JSON.stringify({type:'mission',summary:goal,files:(ed.activity||[]).map(x=>x.tool||'mission-step'),commit:ed.commit||null,verification:ed.verified||ed.verification||null})})}catch{}
    try{await fetch(apiUrl('/api/dna'),{method:'POST',headers:authHeaders(),body:JSON.stringify({project:'default',data:{lastMission:goal,lastMissionResult:String(ed.text||'').slice(0,2500),lastMissionVerified:ed.verified||ed.verification||null,lastUpdated:new Date().toISOString()}})})}catch{}
    if(ed.verified===true||/verified|successfully completed|all steps complete/i.test(String(ed.text||''))){localStorage.removeItem('bhai_x_checkpoint');setResumeMission(null)}
    if(Array.isArray(ed.activity)&&ed.activity.length)setActivity(ed.activity.map(x=>({id:crypto.randomUUID(),step:x.tool||'Mission',text:x.state||'done',state:x.state||'done'})));
   }
  }catch(e){upd(msgs=>[...msgs,{id:crypto.randomUUID(),role:'assistant',text:'⚠️ '+e.message}])}finally{setRunning(false)}
 }
 async function copyText(text,id){try{await navigator.clipboard.writeText(text);setCopied(id);setTimeout(()=>setCopied(''),1200)}catch{}}
 const filtered=sessions.filter(s=>s.title.toLowerCase().includes(search.toLowerCase()));
 if(!authChecked)return <div className="app"><div className="panelOverlay"><div className="utilityPanel accountPanel"><div className="utilityBody" style={{textAlign:"center",padding:"48px"}}><Loader2 className="spin" size={24}/><div style={{marginTop:10}}>BHAI X security check...</div></div></div></div></div>;
 if(!account)return <div className="app"><AccountPanel ownerOnly onClose={()=>{}} onAccount={a=>{if(a)setAccount(a)}}/></div>;
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
    <div className="topTitle"><b>BHAI X</b></div>
    <button className="headerIconBtn" aria-label="Settings" title="Settings" onClick={()=>setSettingsOpen(true)}><Settings size={18}/></button>
   </header>
   {resumeMission?.jobId&&<div className="resumeBar"><span>🧭 Previous mission checkpoint saved: <b>{String(resumeMission.goal||resumeMission.name||"Interrupted task").slice(0,90)}</b></span><button onClick={()=>setHistoryOpen(true)}>Open History</button><button onClick={()=>setHistoryOpen(true)}>Resume / Retry</button></div>}
   <section className="messages">
    {chat?.messages.map(m=><div className={m.role==='user'?'row user':'row'} key={m.id}>
      <div className={m.role==='user'?'bubble userBubble':'bubble'}>
       {m.role==='assistant'&&<div className="assistantLabel"><div className="miniLogo">B</div><b>BHAI X</b></div>}
       <div className="messageText">{renderText(m.text,v=>copyText(v,'code-'+m.id))}</div>
       {m.role==='assistant'&&m.providerMeta&&<div style={{marginTop:8,fontSize:11,opacity:.72,display:'flex',gap:6,flexWrap:'wrap'}}><span>🔌 Route: <b>{m.providerMeta.provider==='core'?'BHAI-CORE':m.providerMeta.provider}</b></span>{m.providerMeta.backend_provider&&<span>→ Backend: <b>{m.providerMeta.backend_provider}</b></span>}{m.providerMeta.model&&<span>· Model: <b>{m.providerMeta.model}</b></span>}</div>}
       {m.images?.map((im,i)=>{const src='data:'+im.mimeType+';base64,'+im.data;return <div className="generatedWrap" key={i}>{im.video?<video className="generatedImage" src={src} controls playsInline/>:<img className="generatedImage" src={src}/>} {im.characterId&&<div className="mediaIdentityMeta">🎭 <b>{im.characterId}</b>{im.identityFingerprint&&<> · 🔒 <code>{im.identityFingerprint}</code></>}{im.verificationMode&&<> · ✅ {im.verificationMode}</>}</div>}<a className="downloadBtn" href={src} download={im.video?'bhai-x-video-'+(i+1)+'.mp4':'bhai-x-image-'+(i+1)+'.png'}><Download size={14}/> Download</a></div>})}
       {m.audio?.map((au,i)=>{const src='data:'+au.mimeType+';base64,'+au.data;return <div className="generatedWrap" key={'audio-'+i}><div style={{fontSize:12,marginBottom:6}}>🔊 {au.kind==='sfx'?'SFX':'Music'} · {au.name||'audio preview'}</div><audio src={src} controls style={{width:'100%'}}/><a className="downloadBtn" href={src} download={'bhai-x-'+(au.kind||'audio')+'-'+(i+1)+'.wav'}><Download size={14}/> Download</a></div>})}
       {m.postProduction&&<div className="mediaIdentityMeta">🎚️ <b>Post-production manifest</b> · {m.postProduction.vfx?.effects?.length||0} VFX · {m.postProduction.sfx?.tracks?.length||0} SFX · 🎵 {m.postProduction.mood||'cinematic'} · 🔒 manifest contract</div>}
       {m.role==='assistant'&&!running&&<div className="messageActions"><button onClick={()=>copyText(m.text,m.id)}>{copied===m.id?<Check size={13}/>:<Copy size={13}/>} {copied===m.id?'Copied':'Copy'}</button></div>}
      </div>
    </div>)}
    {running&&<div className="row"><div className="bubble working"><Loader2 className="spin" size={16}/> BHAI X is working... <span className="workingHint">Task steps neeche update honge</span></div></div>}
    <div ref={end}/>
   </section>
   {activityOpen&&<section className="activity"><div className="activityHead"><b>🔧 BHAI X ka kaam</b><span className="activityLive">LIVE</span><button onClick={()=>setActivityOpen(false)}><X size={14}/></button></div>{activity.map(x=><div className="activityItem" key={x.id}><span className={x.state==='done'?'ok':''}>{x.state==='done'?<Check size={12}/>:<Loader2 size={12} className={x.state==='running'?'spin':''}/>}</span><b>{x.step}</b><span>{x.text}</span></div>)}</section>}
   <div className="composerWrap">
    <div className="composerTools">
     <label className="roundBtn attach" title="Attach file"><Paperclip size={19}/><input type="file" hidden onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setFileInfo({name:f.name,text:(await f.text()).slice(0,50000)})}}/></label>
     <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Jo karna hai seedha likho..." rows="1"/>
     <button className={listening?'roundBtn mic listening':'roundBtn mic'} onClick={toggleMic}><Mic size={19}/></button>
     <button className="sendBtn" disabled={!input.trim()&&!fileInfo||running} onClick={()=>send()}>{running?<Loader2 className="spin" size={19}/>:<Send size={19}/>}</button>
    </div>
    {fileInfo&&<div className="fileChip"><Paperclip size={12}/> {fileInfo.name}<button onClick={()=>setFileInfo(null)}><X size={12}/></button></div>}
    <div className="composerHint">🧠 BHAI X khud samjhega request ka intent — chat, research, coding, GitHub, image, video, app ya doosra kaam. Koi tool select karne ki zarurat nahi.</div>
   </div>
  </main>
 {ownerOpen&&<OwnerPanel onClose={()=>setOwnerOpen(false)}/>}\n {connectOpen&&<ConnectPanel onClose={()=>setConnectOpen(false)}/>}\n {settingsOpen&&<SettingsPanel onClose={()=>setSettingsOpen(false)}/>}\n {codeFixOpen&&<CodeFixPanel onClose={()=>setCodeFixOpen(false)}/>} {generatorOpen&&<GeneratorPanel onClose={()=>setGeneratorOpen(false)}/>} {systemOpen&&<SystemPanel onClose={()=>setSystemOpen(false)}/>} {accountOpen&&<AccountPanel onClose={()=>setAccountOpen(false)} onAccount={setAccount}/>} {resellerOpen&&<ResellerPanel onClose={()=>setResellerOpen(false)}/>} {brainOpen&&<ProjectBrainPanel onClose={()=>setBrainOpen(false)}/>} {historyOpen&&<ExecutionHistoryPanel onClose={()=>setHistoryOpen(false)} />} 
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
// CI final verification marker
