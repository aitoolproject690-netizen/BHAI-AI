import crypto from "node:crypto";
import {getDb} from "./db.js";
import {githubApiJson,githubApiFetch,githubRepoUrl,githubConfigured} from "./githubExecutor.js";
import agent from "./agent.js";

const hash=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
const keyEqual=(a,b)=>{
 const x=Buffer.from(String(a||""));
 const y=Buffer.from(String(b||""));
 return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);
};

function makeRes(){
 return {
  statusCode:200,
  headersSent:false,
  writableEnded:false,
  payload:null,
  status(code){this.statusCode=code;return this;},
  json(data){this.payload=data;this.writableEnded=true;return data;}
 };
}

export async function runE2ESmoke(){
 if(!process.env.BHAI_E2E_SMOKE_KEY) throw new Error("E2E smoke key is not configured.");
 if(!githubConfigured()) throw new Error("GitHub executor is not configured.");

 const db=await getDb();
 if(!db) throw new Error("DATABASE_URL is required");
 const owner="aitoolproject690-netizen";
 const repo="BHAI-TASK-APP-TEST";
 const filePath="e2e-smoke.html";
 const target=githubRepoUrl(owner,repo,"/contents/"+encodeURIComponent(filePath));

 let accountId=null;
 let sessionToken=null;
 let fixtureSha=null;
 let agentCommit=null;
 let verified=false;
 let cleanupCommit=null;

 try{
  await db.query("CREATE TABLE IF NOT EXISTS bhai_accounts (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',credits INTEGER NOT NULL DEFAULT 0,blocked BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS bhai_sessions (token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

  accountId=crypto.randomUUID();
  sessionToken=crypto.randomBytes(32).toString("hex");
  await db.query("INSERT INTO bhai_accounts(id,email,password_hash) VALUES($1,$2,$3)",[
   accountId,
   "e2e-smoke-"+accountId+"@bhai-x.local",
   "smoke-only"
  ]);
  await db.query("INSERT INTO bhai_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')",[
   hash(sessionToken),accountId
  ]);

  const fixtureHtml='<!doctype html><html><body><script>const ok=true; console.log(ok));</script></body></html>';
  const created=await githubApiJson(target,{
   method:"PUT",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    message:"test: create temporary BHAI X E2E fixture",
    content:Buffer.from(fixtureHtml,"utf8").toString("base64"),
    branch:"main"
   })
  });
  fixtureSha=created?.content?.sha||null;
  if(!fixtureSha) throw new Error("Unable to create the temporary GitHub E2E fixture.");

  const fakeReq={
   method:"POST",
   url:"/api/agent",
   headers:{authorization:"Bearer "+sessionToken},
   body:{
    messages:[{
     role:"user",
     text:"GitHub par meri repository aitoolproject690-netizen/BHAI-TASK-APP-TEST check karo aur e2e-smoke.html me koi obvious console error hai to fix karo. Phir commit aur verification do."
    }]
   }
  };
  const fakeRes=makeRes();
  await agent(fakeReq,fakeRes);

  const payload=fakeRes.payload||{};
  const agentActivity=Array.isArray(payload?.activity)?payload.activity:[];
  const patchProof=agentActivity.find(x=>x?.tool==="github:patch_and_verify"&&x?.state==="done");
  const evidenceProof=agentActivity.find(x=>x?.tool==="mission:evidence"&&x?.state==="done");
  const completionProof=agentActivity.find(x=>x?.tool==="mission:complete"&&x?.state==="done");
  const patchText=String(patchProof?.details||"");
  const commitMatch=patchText.match(/Commit\\s+([0-9a-f]{40})/i);
  agentCommit=commitMatch?.[1]||null;
  verified=Boolean(!fakeRes.writableEnded===false && fakeRes.statusCode<400 && patchProof && evidenceProof && agentCommit);
  if(!fakeRes.writableEnded || fakeRes.statusCode>=400) throw new Error(String(payload?.error||"BHAI X Agent E2E failed."));
  if(!verified) throw new Error("BHAI X Agent did not produce complete GitHub patch/read-back evidence. Activity tail: "+JSON.stringify(agentActivity.slice(-6)));

  const readBack=await githubApiJson(target+"?ref=main");
  const fixed=Buffer.from(readBack?.content||"","base64").toString("utf8");
  if(fixed.includes("console.log(ok));")) throw new Error("E2E read-back still contains the malformed console.log.");
  if(!fixed.includes("console.log(ok);")) throw new Error("E2E read-back did not contain the expected repaired console.log.");
  verified=true;

  const deleted=await githubApiJson(target,{
   method:"DELETE",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    message:"test: remove temporary BHAI X E2E fixture",
    sha:readBack.sha,
    branch:"main"
   })
  });
  cleanupCommit=deleted?.commit?.sha||null;

  return {ok:true,e2e:true,target:owner+"/"+repo+"/"+filePath,agent_http_status:fakeRes.statusCode,agent_verified:Boolean(payload?.verified),agent_commit:agentCommit,readback_verified:verified,cleanup_commit:cleanupCommit};
 }catch(error){
  throw Object.assign(new Error(String(error?.message||"E2E smoke failed").slice(0,800)),{agent_commit:agentCommit,cleanup_commit:cleanupCommit});
 }finally{
  if(accountId){
   await db.query("DELETE FROM bhai_sessions WHERE account_id=$1",[accountId]).catch(()=>{});
   await db.query("DELETE FROM bhai_accounts WHERE id=$1",[accountId]).catch(()=>{});
  }
 }
}


export default async function handler(req,res){
 if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
 const expected=process.env.BHAI_E2E_SMOKE_KEY;
 const supplied=String(req.query?.key||"");
 if(!expected||!keyEqual(expected,supplied)) return res.status(404).json({error:"Not found"});
 try{return res.status(200).json(await runE2ESmoke());}
 catch(error){return res.status(502).json({ok:false,e2e:false,error:String(error?.message||"E2E smoke failed").slice(0,800),agent_commit:error?.agent_commit||null,cleanup_commit:error?.cleanup_commit||null});}
}

if(process.env.BHAI_E2E_SMOKE_KEY && process.env.RENDER_EXTERNAL_URL){
 setTimeout(async()=>{
  try{
   const result=await runE2ESmoke();
   console.log("[E2E] GitHub Agent smoke PASS",JSON.stringify({target:result.target,agent_verified:result.agent_verified,agent_commit:result.agent_commit,readback_verified:result.readback_verified,cleanup_commit:result.cleanup_commit}));
  }catch(error){
   console.error("[E2E] GitHub Agent smoke FAIL",JSON.stringify({error:String(error?.message||error).slice(0,800),agent_commit:error?.agent_commit||null,cleanup_commit:error?.cleanup_commit||null}));
  }
 },2000);
}
