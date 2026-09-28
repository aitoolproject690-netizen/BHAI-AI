import {ownerReady,ownerState,ownerGuard} from "./owner.js";
function json(res,status,data){res.status(status).json(data)}
export default async function handler(req,res){
 await ownerReady;
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!ownerGuard(req,res))return;
 const s=ownerState();
 const action=req.body?.action;
 if(action==="snapshot"){
  return json(res,200,{ok:true,snapshot:{createdAt:new Date().toISOString(),serverMode:s.serverMode,emergencyLock:s.emergencyLock,releaseLocked:s.releaseLocked,modules:s.modules,delegatedAdmins:s.delegatedAdmins,audit:s.audit},note:"Control-plane snapshot generated. External durable backup storage must be configured before this is treated as disaster recovery."});
 }
 return json(res,400,{error:"Unknown backup action"});
}
