import crypto from "node:crypto";

const state={
  serverMode:"online",
  emergencyLock:false,
  releaseLocked:true,
  delegatedAdmins:[],
  audit:[],
  connectors:{total:0,connected:0},
  updatedAt:new Date().toISOString()
};

function keyOk(req){
  const expected=process.env.OWNER_ACCESS_KEY;
  const supplied=req.headers?.["x-owner-key"]||req.body?.ownerKey||"";
  if(!expected||!supplied)return false;
  const a=Buffer.from(String(expected)),b=Buffer.from(String(supplied));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function audit(action,meta={}){
  state.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action,meta});
  state.audit=state.audit.slice(0,100);
  state.updatedAt=new Date().toISOString();
}
export function ownerState(){return state;}
export function ownerGuard(req,res){
  if(!keyOk(req)){res.status(401).json({error:"Owner authorization required."});return false}
  return true;
}
export default async function handler(req,res){
  if(req.method==="GET"){
    if(!ownerGuard(req,res))return;
    return res.json({ok:true,state});
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!ownerGuard(req,res))return;
  const b=req.body||{},action=b.action;
  if(action==="set_server_mode"){
    const mode=b.mode==="maintenance"?"maintenance":"online";
    state.serverMode=mode;audit("server_mode_changed",{mode});return res.json({ok:true,state});
  }
  if(action==="set_emergency_lock"){
    state.emergencyLock=!!b.enabled;audit("emergency_lock_changed",{enabled:state.emergencyLock});return res.json({ok:true,state});
  }
  if(action==="set_release_lock"){
    state.releaseLocked=b.locked!==false;audit("release_lock_changed",{locked:state.releaseLocked});return res.json({ok:true,state});
  }
  if(action==="delegate_add"){
    const name=String(b.name||"").trim();
    const permissions=Array.isArray(b.permissions)?b.permissions.slice(0,30):[];
    if(!name)return res.status(400).json({error:"name is required"});
    const id=crypto.randomUUID();
    state.delegatedAdmins.push({id,name,permissions,createdAt:new Date().toISOString(),expiresAt:b.expiresAt||null});
    audit("delegated_admin_added",{id,name,permissions});
    return res.json({ok:true,state});
  }
  if(action==="delegate_revoke"){
    state.delegatedAdmins=state.delegatedAdmins.filter(x=>x.id!==b.id);
    audit("delegated_admin_revoked",{id:b.id});return res.json({ok:true,state});
  }
  if(action==="audit_clear"){
    state.audit=[];state.updatedAt=new Date().toISOString();return res.json({ok:true,state});
  }
  return res.status(400).json({error:"Unknown owner action"});
}