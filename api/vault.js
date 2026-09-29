import crypto from "node:crypto";
import {getDb,initDb} from "./db.js";
import {ownerReady,ownerState,ownerGuard} from "./owner.js";
const json=(res,s,d)=>res.status(s).json(d);
const key=()=>process.env.VAULT_MASTER_KEY||process.env.OWNER_ACCESS_KEY||"";
function enc(value){const secret=key();if(!secret)return null;const k=crypto.createHash("sha256").update(secret).digest(),iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",k,iv),data=Buffer.concat([c.update(JSON.stringify(value),"utf8"),c.final()]);return {v:1,iv:iv.toString("base64"),data:data.toString("base64"),tag:c.getAuthTag().toString("base64")};}
function dec(box){const secret=key();if(!secret||!box?.iv||!box?.data||!box?.tag)throw new Error("Vault key/configuration unavailable");const k=crypto.createHash("sha256").update(secret).digest(),d=crypto.createDecipheriv("aes-256-gcm",k,Buffer.from(box.iv,"base64"));d.setAuthTag(Buffer.from(box.tag,"base64"));return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data,"base64")),d.final()]).toString("utf8"));}
export default async function handler(req,res){
 await ownerReady;if(!ownerGuard(req,res))return;const s=ownerState();if(s.emergencyLock)return json(res,423,{error:"Emergency lock is active"});
 const ok=await initDb().catch(()=>false),db=ok?await getDb():null;if(!db)return json(res,503,{error:"Database is required for the secure vault"});
 await db.query("CREATE TABLE IF NOT EXISTS bhai_vault (key TEXT PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await db.query("CREATE TABLE IF NOT EXISTS bhai_vault_audit (id TEXT PRIMARY KEY,key TEXT,action TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 if(!key())return json(res,503,{error:"Set VAULT_MASTER_KEY (or OWNER_ACCESS_KEY) in Render Environment"});
 const audit=async(name,action)=>db.query("INSERT INTO bhai_vault_audit(id,key,action) VALUES($1,$2,$3)",[crypto.randomUUID(),name,action]);
 if(req.method==="GET"){
  const name=String(req.query?.key||"").trim();
  if(name){const r=await db.query("SELECT data,updated_at FROM bhai_vault WHERE key=$1",[name]);if(!r.rows[0])return json(res,404,{error:"Vault key not found"});await audit(name,"read");return json(res,200,{ok:true,key:name,value:dec(r.rows[0].data),updatedAt:r.rows[0].updated_at});}
  const r=await db.query("SELECT key,updated_at FROM bhai_vault ORDER BY updated_at DESC");return json(res,200,{ok:true,items:r.rows.map(x=>({key:x.key,updatedAt:x.updated_at}))});
 }
 if(req.method==="DELETE"){const name=String(req.query?.key||req.body?.key||"").trim();if(!name)return json(res,400,{error:"key is required"});const r=await db.query("DELETE FROM bhai_vault WHERE key=$1",[name]);if(!r.rowCount)return json(res,404,{error:"Vault key not found"});await audit(name,"delete");return json(res,200,{ok:true,deleted:true,key:name});}
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const name=String(req.body?.key||"").trim().slice(0,120),value=req.body?.value,action=String(req.body?.action||"set");
 if(!name)return json(res,400,{error:"key is required"});
 if(action==="rotate"){if(value===undefined)return json(res,400,{error:"value is required for rotation"});const box=enc(value);await db.query("UPDATE bhai_vault SET data=$2,updated_at=NOW() WHERE key=$1",[name,box]);await audit(name,"rotate");return json(res,200,{ok:true,key:name,rotated:true,encrypted:true});}
 if(value===undefined)return json(res,400,{error:"value is required"});
 const box=enc(value);await db.query("INSERT INTO bhai_vault(key,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[name,box]);await audit(name,"set");return json(res,200,{ok:true,key:name,stored:true,encrypted:true});
}