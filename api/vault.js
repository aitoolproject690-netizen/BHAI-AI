import crypto from "node:crypto";
import {getDb,initDb} from "./db.js";
import {ownerReady,ownerState,ownerGuard} from "./owner.js";
const json=(res,s,d)=>res.status(s).json(d);
const key=()=>process.env.VAULT_MASTER_KEY||process.env.OWNER_ACCESS_KEY||"";
function enc(value){
 const secret=key(); if(!secret)return null;
 const k=crypto.createHash("sha256").update(secret).digest();
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",k,iv);
 const data=Buffer.concat([c.update(JSON.stringify(value),"utf8"),c.final()]);
 return {v:1,iv:iv.toString("base64"),data:data.toString("base64"),tag:c.getAuthTag().toString("base64")};
}
function dec(box){
 const secret=key(); if(!secret||!box?.iv||!box?.data||!box?.tag)throw new Error("Vault key/configuration unavailable");
 const k=crypto.createHash("sha256").update(secret).digest();
 const d=crypto.createDecipheriv("aes-256-gcm",k,Buffer.from(box.iv,"base64")); d.setAuthTag(Buffer.from(box.tag,"base64"));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data,"base64")),d.final()]).toString("utf8"));
}
export default async function handler(req,res){
 await ownerReady;
 if(!ownerGuard(req,res))return;
 const s=ownerState();
 if(s.emergencyLock)return json(res,423,{error:"Emergency lock is active"});
 const db=await initDb().catch(()=>false)?await getDb():null;
 if(!db)return json(res,503,{error:"Database is required for the secure vault"});
 if(!key())return json(res,503,{error:"Set VAULT_MASTER_KEY (or OWNER_ACCESS_KEY) in Render Environment"});
 if(req.method==="GET"){
  const r=await db.query("SELECT key,data,updated_at FROM bhai_vault ORDER BY updated_at DESC");
  return json(res,200,{ok:true,items:r.rows.map(x=>({key:x.key,updatedAt:x.updated_at}))});
 }
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const name=String(req.body?.key||"").trim().slice(0,120),value=req.body?.value;
 if(!name||value===undefined)return json(res,400,{error:"key and value are required"});
 const box=enc(value);
 await db.query("CREATE TABLE IF NOT EXISTS bhai_vault (key TEXT PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await db.query("INSERT INTO bhai_vault(key,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[name,box]);
 return json(res,200,{ok:true,key:name,stored:true,encrypted:true});
}
