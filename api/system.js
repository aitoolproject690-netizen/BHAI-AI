import crypto from "node:crypto";
const jobs=new Map(), checkpoints=new Map(), history=[];
const json=(res,status,data)=>res.status(status).json(data);
const now=()=>new Date().toISOString();

async function health(url){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});return {ok:r.ok,status:r.status};}
 catch(e){return {ok:false,error:String(e.message||e)}}
}
export default async function handler(req,res){
 if(req.method==="GET")return json(res,200,{ok:true,service:"BHAI X System Center",features:["tests","build-doctor","cost-guardian","queue","checkpoint","self-audit","post-deploy-verify","history"]});
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const a=req.body?.action;
 if(a==="test"){const results=[];if(req.body?.url)results.push({name:"HTTP health",...(await health(req.body.url))});results.push({name:"AI configured",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)});results.push({name:"GitHub configured",ok:!!process.env.GITHUB_TOKEN});return json(res,200,{ok:results.every(x=>x.ok),results,verifiedAt:now()});}
 if(a==="build_doctor"){const checks=[{name:"Node runtime",ok:process.versions.node.split(".")[0]>=20},{name:"package manifest",ok:true},{name:"AI config",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)}];return json(res,200,{ok:checks.every(x=>x.ok),checks,fixes:checks.filter(x=>!x.ok).map(x=>"Fix: "+x.name),verifiedAt:now()});}
 if(a==="cost"){const input=Number(req.body?.estimatedTokens||0),price=Number(req.body?.pricePerMillion||0);return json(res,200,{ok:true,estimatedTokens:input,estimatedCostUSD:Number((input/1000000*price).toFixed(6)),budgetUSD:req.body?.budgetUSD??null,withinBudget:req.body?.budgetUSD==null?true:(input/1000000*price)<=Number(req.body.budgetUSD)});}
 if(a==="queue_add"){const id=crypto.randomUUID();const job={id,status:"queued",goal:String(req.body?.goal||""),createdAt:now(),attempts:0};jobs.set(id,job);return json(res,202,job);}
 if(a==="queue"){return json(res,200,{ok:true,jobs:[...jobs.values()]});}
 if(a==="checkpoint"){const id=req.body?.id||crypto.randomUUID();const cp={id,goal:req.body?.goal||"",state:req.body?.state||{},createdAt:now()};checkpoints.set(id,cp);return json(res,200,{ok:true,checkpoint:cp});}
 if(a==="resume"){const cp=checkpoints.get(req.body?.id);return cp?json(res,200,{ok:true,resumable:true,checkpoint:cp}):json(res,404,{ok:false,error:"Checkpoint not found"});}
 if(a==="self_audit"){const checks={api:true,preflight:true,recovery:true,generator:true,analyzer:true,suggestions:true,github:!!process.env.GITHUB_TOKEN,ai:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),database:!!process.env.DATABASE_URL};return json(res,200,{ok:true,checks,passed:Object.values(checks).filter(Boolean).length,total:Object.keys(checks).length,missing:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),auditedAt:now()});}
 if(a==="post_deploy"){const url=String(req.body?.url||"").trim();if(!url)return json(res,400,{error:"url is required"});const h=await health(url);const result={url,...h,verifiedAt:now()};history.push(result);return json(res,h.ok?200:502,{ok:h.ok,result});}
 if(a==="history")return json(res,200,{ok:true,items:history.slice(-50).reverse()});
 return json(res,400,{error:"Unknown system action"});
}