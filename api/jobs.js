import {requireSession} from "./_utils.js";
import {cancelJob,createJob,getJobForOwner,listHistoryForOwner,listJobsForOwner,resumeJob} from "./jobRunner.js";

const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
 if(req.method==="POST"){
  const account=await requireSession(req,res);if(!account)return;
  const body=req.body||{};
  const type=String(body.type||"agent").toLowerCase();
  const allowed=["agent","mission","health","build","deploy"];
  if(!allowed.includes(type))return json(res,400,{ok:false,error:"Unsupported job type. Allowed: "+allowed.join(", ")+"."});
  const payload=body.payload&&typeof body.payload==="object"?body.payload:{};
  const goal=String(body.goal||payload.goal||payload.task||"").trim();
  if((type==="agent"||type==="mission")&&!goal)return json(res,400,{ok:false,error:"goal is required for "+type+" jobs."});
  if(type==="health"&&!String(payload.url||"").trim())return json(res,400,{ok:false,error:"payload.url is required for health jobs."});
  const job=await createJob({account,type,payload,goal,maxAttempts:body.maxAttempts,runAt:body.runAt});
  return json(res,202,{ok:true,job});
 }
 if(req.method==="GET"){
  const account=await requireSession(req,res);if(!account)return;
  const id=String(req.query?.id||"").trim();
  if(!id){
   return json(res,200,{ok:true,jobs:await listJobsForOwner(account,{limit:req.query?.limit}),persistent:true});
  }
  const job=await getJobForOwner(id,account);
  if(!job)return json(res,404,{ok:false,error:"Job not found"});
  if(req.query?.stream==="1"){
   res.statusCode=200;
   res.setHeader("Content-Type","text/event-stream; charset=utf-8");
   res.setHeader("Cache-Control","no-cache");
   res.setHeader("Connection","keep-alive");
   let last="";
   for(let i=0;i<60;i++){
    const current=await getJobForOwner(id,account);
    if(!current)break;
    const signature=String(current.updatedAt||current.progress)+"|"+String(current.status)+"|"+String(current.events?.length||0);
    if(signature!==last){
     last=signature;
     res.write("event: job\n");
     res.write("data: "+JSON.stringify(current)+"\n\n");
    }
    if(["completed","failed","cancelled"].includes(current.status))break;
    await new Promise(r=>setTimeout(r,1000));
   }
   res.end();
   return;
  }
  return json(res,200,{ok:true,job});
 }
 if(req.method==="PATCH"){
  const account=await requireSession(req,res);if(!account)return;
  const id=String(req.body?.id||"").trim();
  if(!id)return json(res,400,{ok:false,error:"id is required"});
  if(req.body?.action==="resume"){
   try{
    const job=await resumeJob(id,account);
    return job?json(res,202,{ok:true,job}):json(res,404,{ok:false,error:"Job not found"});
   }catch(e){return json(res,409,{ok:false,error:String(e?.message||e)})}
  }
  if(req.body?.action==="cancel"){
   try{
    const job=await cancelJob(id,account);
    return job?json(res,200,{ok:true,job}):json(res,404,{ok:false,error:"Job not found"});
   }catch(e){return json(res,409,{ok:false,error:String(e?.message||e)})}
  }
  return json(res,400,{ok:false,error:"Only action=resume or action=cancel is supported. Job state is worker-controlled."});
 }
 return json(res,405,{ok:false,error:"Method not allowed"});
}
