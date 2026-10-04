import {ownerReady,ownerState} from "./owner.js";
import {getDb} from "./db.js";
import {getSession} from "./accounts.js";
import {generateWithRouter} from "./aiRouter.js";

const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
 await ownerReady;
 if(req.method!=="POST") return json(res,405,{error:"Method not allowed"});
 const db=await getDb();
 if(!db) return json(res,503,{error:"DATABASE_URL is required"});
 const account=await getSession(req,db);
 if(!account) return json(res,401,{error:"Login required. Open Account and login before using BHAI X chat."});
 const control=ownerState();
 if(control.serverMode==="maintenance") return json(res,503,{error:"BHAI X is in owner maintenance mode.",maintenance:true});
 if(control.emergencyLock) return json(res,423,{error:"BHAI X is temporarily locked by the owner.",locked:true});

 const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-20):[];
 const task=String(messages.find(m=>m?.role==="user"&&m?.text)?.text||"").trim();
 if(!task) return json(res,400,{error:"Chat message is required."});

 try{
  const routed=await generateWithRouter({
   task,
   system:"You are BHAI X, a friendly practical AI chat assistant. Never claim that you used external tools in this chat endpoint. Answer directly and naturally. When the user writes Hindi or Hinglish, reply in the same style.",
   messages,
   preferred:"core",
   role:"chat",
   fallback:true
  });
  return json(res,200,{ok:true,text:routed.text,provider:routed.provider,model:routed.model,verified:true});
 }catch(e){
  return json(res,502,{error:"Chat provider failed: "+String(e?.message||e)});
 }
}
