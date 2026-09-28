import crypto from "node:crypto";
import {ownerReady,ownerState,ownerGuard} from "./owner.js";

const catalog=[
 {id:"goal-compiler",name:"Goal Compiler",status:"foundation",desc:"Goal ko plan, skills, tools, verification aur delivery steps me todta hai."},
 {id:"mission-mode",name:"Mission Mode",status:"foundation",desc:"Long-running task state, checkpoints aur completion tracking."},
 {id:"context-engine",name:"Bhai Samajh Gaya",status:"foundation",desc:"Intent, project context aur decision memory ko ek task context me rakhta hai."},
 {id:"agent-swarm",name:"AI Swarm",status:"planned",desc:"Planner, researcher, coder, tester, security aur DevOps specialist roles."},
 {id:"fallback-engine",name:"Try 3 Ways",status:"foundation",desc:"Failure se pehle risk detect, alternate route, retry aur recovery."},
 {id:"digital-twin",name:"Project Digital Twin",status:"foundation",desc:"Project dependencies, services, secrets aur build relationships ka model."},
 {id:"connect-app",name:"Connect App",status:"foundation",desc:"OAuth/API/Webhook/MCP based provider connection layer."},
 {id:"credential-vault",name:"Credential Vault",status:"foundation",desc:"Secrets ko source code se alag rakhne ka control plane."},
 {id:"social",name:"Social AI",status:"planned",desc:"Official platform APIs ke through content, inbox aur scheduling."},
 {id:"preflight",name:"Predictive Pre-flight",status:"foundation",desc:"Failure se pehle API, model, credentials, services aur deployment risk check."},
 {id:"self-healing",name:"Self-Healing Recovery",status:"foundation",desc:"Detect, retry, switch route, resume checkpoint, verify and rollback."},
 {id:"progress-reporter",name:"Live Progress Reporter",status:"foundation",desc:"Kya hua, kya baaki hai, kya verify hua aur next recommendation."},
 {id:"task-queue",name:"Task Queue / Scheduler",status:"planned",desc:"Long-running and scheduled tasks with resume and retry."},
 {id:"smart-suggestions",name:"Smart Improvement Suggestions",status:"foundation",desc:"Kaam ke context se safe next improvements suggest karta hai."},
 {id:"marketplace",name:"AI Marketplace",status:"planned",desc:"Skills, agents aur integrations."},
 {id:"apk-factory",name:"APK Factory",status:"foundation",desc:"Source → GitHub Actions → APK artifact verification pipeline."},
 {id:"release-control",name:"Owner Release Control",status:"foundation",desc:"Official core release owner-controlled."},
 {id:"backup-rollback",name:"Backup / Restore / Rollback",status:"foundation",desc:"State and release recovery control plane."},
 {id:"security-center",name:"Security Center",status:"foundation",desc:"Owner lock, audit, module gates and security status."},
 {id:"delegated-admin",name:"Delegated Admin",status:"live",desc:"Expiring granular permissions with revoke and audit."},
 {id:"multi-panel",name:"Multi-Panel Control",status:"planned",desc:"Separate tenant/admin panels with owner-level control."},
 {id:"user-identity",name:"Identity & Sessions",status:"planned",desc:"Email, OTP, OAuth, passkey, 2FA, trusted devices and sessions."}
];

const connectors=[
 ["github","GitHub","code"],["gitlab","GitLab","code"],["bitbucket","Bitbucket","code"],
 ["replit","Replit","code"],["render","Render","deploy"],["vercel","Vercel","deploy"],
 ["netlify","Netlify","deploy"],["railway","Railway","deploy"],["cloudflare","Cloudflare","deploy"],
 ["firebase","Firebase","cloud"],["aws","AWS","cloud"],["gcp","Google Cloud","cloud"],["azure","Azure","cloud"],
 ["openai","OpenAI","ai"],["anthropic","Anthropic","ai"],["google-ai","Google AI","ai"],
 ["huggingface","Hugging Face","ai"],["discord","Discord","social"],["telegram","Telegram","social"]
].map(([id,name,type])=>({id,name,type,status:"adapter-ready",auth:"oauth/api/webhook"}));

function json(res,status,data){res.status(status).json(data)}
function basePlan(goal){
 const text=String(goal||"").trim();
 const lower=text.toLowerCase();
 const steps=[
  {id:"preflight",name:"Pre-flight risk scan and prevention",state:"ready"},
  {id:"understand",name:"Understand goal",state:"ready"},
  {id:"plan",name:"Compile requirements + constraints",state:"ready"},
  {id:"checkpoint",name:"Create recovery checkpoint",state:"ready"},
  {id:"execute",name:"Execute with selected skills/tools",state:"ready"},
  {id:"recover",name:"Monitor, self-heal and recover if needed",state:"ready"},
  {id:"verify",name:"Test / verify result",state:"ready"},
  {id:"deliver",name:"Report done, remaining work and recommendations",state:"ready"}
 ];
 if(/apk|android|app/i.test(lower)) steps.splice(3,0,{id:"build",name:"Build APK/AAB and inspect artifact",state:"ready"});
 if(/github|repo|code|coding/i.test(lower)) steps.splice(2,0,{id:"repo",name:"Inspect repository and implement changes",state:"ready"});
 if(/deploy|website|server/i.test(lower)) steps.splice(4,0,{id:"deploy",name:"Deploy and verify service",state:"ready"});
 return {id:crypto.randomUUID(),goal:text,mode:"mission",steps,createdAt:new Date().toISOString()};
}

export default async function handler(req,res){
 await ownerReady;
 const s=ownerState();
 if(req.method==="GET"){
  const kind=req.query?.kind||"features";
  if(kind==="features")return json(res,200,{features:catalog});
  if(kind==="connectors")return json(res,200,{connectors});
  if(kind==="security")return json(res,200,{serverMode:s.serverMode,emergencyLock:s.emergencyLock,releaseLocked:s.releaseLocked,modules:s.modules,auditCount:s.audit.length,databaseConfigured:!!process.env.DATABASE_URL});
  return json(res,200,{features:catalog,connectors});
 }
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const action=req.body?.action;
 if(action==="preflight"){const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;const checks={aiKey:!!key,aiModels:false,github:!!process.env.GITHUB_TOKEN,render:!!process.env.RENDER_API_KEY,database:!!process.env.DATABASE_URL,service:true};let models=[];const detector=[];if(key){try{const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models?key="+encodeURIComponent(key));const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"AI model discovery failed");models=(d.models||[]).filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent")).map(m=>String(m.name||"").split("models/").pop()).filter(Boolean);checks.aiModels=models.length>0;if(!checks.aiModels)detector.push({id:"ai-model",severity:"high",message:"API key mil gayi, lekin usable generateContent model nahi mila."})}catch(e){checks.aiModels=false;detector.push({id:"ai-model",severity:"high",message:"AI pre-flight failed: "+String(e?.message||e).slice(0,240)})}}else detector.push({id:"ai-key",severity:"high",message:"AI provider key configured nahi hai."});if(process.env.RENDER_API_KEY){try{const r=await fetch("https://bhai-ai-vpna.onrender.com/api/health",{signal:AbortSignal.timeout(5000)});if(!r.ok){checks.service=false;detector.push({id:"service",severity:"high",message:"BHAI X backend health check failed (HTTP "+r.status+")."})}}catch(e){checks.service=false;detector.push({id:"service",severity:"high",message:"Backend health check failed: "+String(e?.message||e).slice(0,180)})}}if(!checks.github)detector.push({id:"github",severity:"medium",message:"GitHub write access configured nahi hai; GitHub write task start karne se pehle connect karo."});if(!checks.render)detector.push({id:"render",severity:"medium",message:"Render deploy credential configured nahi hai; deploy task se pehle connect karo."});const risks=detector;const preventiveActions=risks.map(x=>x.id==="ai-model"||x.id==="ai-key"?"AI route ko verified available model/provider par switch karo.":x.id==="service"?"Task rok kar backend recovery/redeploy check karo.":x.id==="github"?"GitHub connect karo; bina connection ke write step start mat karo.":"Deploy credential connect karo; deploy step se pehle verify karo.");return json(res,200,{ok:true,ready:!risks.some(x=>x.severity==="high"),checks,models,risks,detector:{status:risks.some(x=>x.severity==="high")?"BLOCKED":"CLEAR",checkedAt:new Date().toISOString(),prevented:risks.length},preventiveActions})}
if(action==="recovery_plan"){const e=String(req.body?.error||"");const transient=/429|quota|rate.?limit|high demand|temporarily unavailable|timeout|fetch|ECONN|5\d\d/i.test(e);return json(res,200,{ok:true,transient,plan:transient?[{action:"retry",safe:true},{action:"switch_provider_or_model",safe:true},{action:"resume_checkpoint",safe:true}]:[{action:"diagnose",safe:true},{action:"patch_and_verify",safe:true},{action:"rollback_if_regression",safe:false}],requiresApproval:!transient})}
if(action==="compile_goal")return json(res,200,{ok:true,mission:basePlan(req.body?.goal)});
 if(action==="connector_catalog")return json(res,200,{ok:true,connectors});
 if(!ownerGuard(req,res))return;
 if(action==="security_snapshot")return json(res,200,{ok:true,serverMode:s.serverMode,emergencyLock:s.emergencyLock,releaseLocked:s.releaseLocked,modules:s.modules,databaseConfigured:!!process.env.DATABASE_URL});
 return json(res,400,{error:"Unknown control action"});
}
