import crypto from "node:crypto";
import {ownerReady,ownerState,ownerGuard} from "./owner.js";

const catalog=[
 {id:"goal-compiler",name:"Goal Compiler",status:"foundation",desc:"Goal ko plan, skills, tools, verification aur delivery steps me todta hai."},
 {id:"mission-mode",name:"Mission Mode",status:"foundation",desc:"Long-running task state, checkpoints aur completion tracking."},
 {id:"context-engine",name:"Bhai Samajh Gaya",status:"foundation",desc:"Intent, project context aur decision memory ko ek task context me rakhta hai."},
 {id:"agent-swarm",name:"AI Swarm",status:"planned",desc:"Planner, researcher, coder, tester, security aur DevOps specialist roles."},
 {id:"fallback-engine",name:"Try 3 Ways",status:"planned",desc:"Failure par alternate implementation strategies."},
 {id:"digital-twin",name:"Project Digital Twin",status:"planned",desc:"Project dependencies, services, secrets aur build relationships ka model."},
 {id:"connect-app",name:"Connect App",status:"foundation",desc:"OAuth/API/Webhook/MCP based provider connection layer."},
 {id:"credential-vault",name:"Credential Vault",status:"foundation",desc:"Secrets ko source code se alag rakhne ka control plane."},
 {id:"social",name:"Social AI",status:"planned",desc:"Official platform APIs ke through content, inbox aur scheduling."},
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
  {id:"understand",name:"Understand goal",state:"ready"},
  {id:"plan",name:"Compile requirements + constraints",state:"ready"},
  {id:"execute",name:"Execute with selected skills/tools",state:"ready"},
  {id:"verify",name:"Test / verify result",state:"ready"},
  {id:"deliver",name:"Deliver result + record decision",state:"ready"}
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
 if(action==="compile_goal")return json(res,200,{ok:true,mission:basePlan(req.body?.goal)});
 if(action==="connector_catalog")return json(res,200,{ok:true,connectors});
 if(!ownerGuard(req,res))return;
 if(action==="security_snapshot")return json(res,200,{ok:true,serverMode:s.serverMode,emergencyLock:s.emergencyLock,releaseLocked:s.releaseLocked,modules:s.modules,databaseConfigured:!!process.env.DATABASE_URL});
 return json(res,400,{error:"Unknown control action"});
}
