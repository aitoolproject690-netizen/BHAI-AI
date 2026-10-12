import crypto from "node:crypto";
import { getDb } from "./db.js";

const defaults={
  serverMode:"online", emergencyLock:false, releaseLocked:true,
  modules:{agent:true,coding:true,builds:true,connectors:true,social:true,marketplace:true},
  delegatedAdmins:[], audit:[], connectors:{total:0,connected:0},
  updatedAt:new Date().toISOString()
};
const state=structuredClone(defaults);
let loaded=false;
let loading=null;

async function ensureOwnerReady(){
  if(loaded)return true;
  if(loading)return loading;
  loading=(async()=>{
    const c=await getDb();
    if(!c)return false;
    try{
      await c.query("CREATE TABLE IF NOT EXISTS bhai_owner_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
      const r=await c.query("SELECT data FROM bhai_owner_state WHERE id=1");
      if(r.rows[0]?.data)Object.assign(state,r.rows[0].data);
      else await c.query("INSERT INTO bhai_owner_state(id,data) VALUES(1,$1)",[state]);
      loaded=true;
      return true;
    }catch(e){
      console.error("Owner persistence unavailable:",String(e?.message||e));
      return false;
    }finally{
      loading=null;
    }
  })();
  return loading;
}

// Preserve the existing startup signal, but retry the load on later requests
// if the database was unavailable during process startup.
export const ownerReady=ensureOwnerReady();

async function persist(){
  if(!await ensureOwnerReady())return false;
  const c=await getDb();
  if(!c)return false;
  try{
    await c.query("INSERT INTO bhai_owner_state(id,data,updated_at) VALUES(1,$1,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[state]);
    return true;
  }catch(e){
    console.error("Owner state save failed:",String(e?.message||e));
    return false;
  }
}
function keyOk(req){
  const expected=process.env.OWNER_ACCESS_KEY,supplied=req.headers?.["x-owner-key"]||req.body?.ownerKey||"";
  if(!expected||!supplied)return false;
  const a=Buffer.from(String(expected)),b=Buffer.from(String(supplied));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function audit(action,meta={}){
  state.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action,meta});
  state.audit=state.audit.slice(0,100);state.updatedAt=new Date().toISOString();
}
export function ownerState(){return state}
export function ownerGuard(req,res){
  if(!keyOk(req)){res.status(401).json({error:"Owner authorization required."});return false}
  return true;
}
export default async function handler(req,res){
  if(req.method==="GET"){
    await ensureOwnerReady();
    if(!ownerGuard(req,res))return;
    return res.json({ok:true,state,persistence:{ready:loaded}});
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!ownerGuard(req,res))return;
  // Never acknowledge a state change that is only held in volatile memory.
  if(!await ensureOwnerReady())return res.status(503).json({error:"Owner persistence database is unavailable; no changes were saved."});
  const b=req.body||{},action=b.action;
  if(action==="set_server_mode"){state.serverMode=b.mode==="maintenance"?"maintenance":"online";audit("server_mode_changed",{mode:state.serverMode})}
  else if(action==="set_emergency_lock"){state.emergencyLock=!!b.enabled;audit("emergency_lock_changed",{enabled:state.emergencyLock})}
  else if(action==="set_release_lock"){state.releaseLocked=b.locked!==false;audit("release_lock_changed",{locked:state.releaseLocked})}
  else if(action==="set_module"){
    const m=String(b.module||"");if(!(m in state.modules))return res.status(400).json({error:"Unknown module"});
    state.modules[m]=!!b.enabled;audit("module_changed",{module:m,enabled:state.modules[m]});
  } else if(action==="delegate_add"){
    const name=String(b.name||"").trim(),permissions=Array.isArray(b.permissions)?b.permissions.slice(0,30):[];
    if(!name)return res.status(400).json({error:"name is required"});
    const id=crypto.randomUUID();state.delegatedAdmins.push({id,name,permissions,createdAt:new Date().toISOString(),expiresAt:b.expiresAt||null});
    audit("delegated_admin_added",{id,name,permissions});
  } else if(action==="delegate_revoke"){
    state.delegatedAdmins=state.delegatedAdmins.filter(x=>x.id!==b.id);audit("delegated_admin_revoked",{id:b.id});
  } else if(action==="audit_clear"){state.audit=[];state.updatedAt=new Date().toISOString()}
  else return res.status(400).json({error:"Unknown action"});
  const saved=await persist();
  if(!saved)return res.status(503).json({error:"Owner state changed in memory but could not be persisted. Restore database availability and retry."});
  return res.json({ok:true,state,persistence:{ready:true}});
}
